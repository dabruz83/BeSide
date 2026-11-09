from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks, Query, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
import bcrypt
import hashlib
import hmac
import jwt
import httpx
import secrets
import csv
import io
import html
import re
import base64
import struct
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from photo_ai import (
    PHOTO_AI_MAX_GRAPHIC_BYTES,
    PHOTO_AI_MAX_MASK_BYTES,
    PHOTO_AI_MAX_PHOTO_BYTES,
    PhotoAiNotConfigured,
    PhotoAiProviderError,
    PhotoAiValidationError,
    normalize_photo_request,
    photo_ai_adapter,
    read_upload_limited,
)

from multitenancy import (
    COMPANY_ROLES,
    PLATFORM_COMPANY_ID,
    company_document,
    company_scope,
    email_claim_id,
    migrate_to_company_tenancy,
    normalize_email,
    parse_datetime,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def get_required_environment_variable(name: str) -> str:
    """Return a required environment variable or fail fast during startup."""
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def parse_cors_origins(raw_origins: str) -> List[str]:
    """Parse explicit comma-separated browser origins for credentialed CORS."""
    origins = [
        origin.strip().rstrip('/')
        for origin in raw_origins.split(',')
        if origin.strip()
    ]
    if not origins or '*' in origins:
        raise RuntimeError('CORS_ORIGINS must contain one or more explicit origins')
    return origins


# MongoDB connection
MONGO_URL = get_required_environment_variable('MONGO_URL')
DB_NAME = get_required_environment_variable('DB_NAME')
client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]

# JWT Configuration
JWT_SECRET = get_required_environment_variable('JWT_SECRET_KEY')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
PASSWORD_RESET_TOKEN_MINUTES = 30
EMAIL_VERIFICATION_TOKEN_HOURS = 24
RECOVERY_EMAIL_TOKEN_HOURS = 1
RECOVERY_CONTACT_INVITE_HOURS = 24
RECOVERY_CONTACT_SECURITY_DAYS = int(os.environ.get("RECOVERY_CONTACT_SECURITY_DAYS", "7"))
if not 1 <= RECOVERY_CONTACT_SECURITY_DAYS <= 30:
    raise RuntimeError("RECOVERY_CONTACT_SECURITY_DAYS must be between 1 and 30")
RECOVERY_CONTACT_MAX_ATTEMPTS = 5
PUBLIC_LINK_TOKEN_DAYS = 30
if len(JWT_SECRET) < 32:
    raise RuntimeError('JWT_SECRET_KEY must contain at least 32 characters')

# Admin credentials
ADMIN_EMAIL = get_required_environment_variable('ADMIN_EMAIL')
ADMIN_PASSWORD = get_required_environment_variable('ADMIN_PASSWORD')
if len(ADMIN_PASSWORD) < 12:
    raise RuntimeError('ADMIN_PASSWORD must contain at least 12 characters')

# Transactional email configuration. Resend is the primary provider; the
# legacy SendGrid variables remain readable for backwards-compatible local
# deployments, but are not required when Resend is configured.
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
RESEND_FROM_EMAIL = (
    os.environ.get('RESEND_FROM_EMAIL', '').strip()
    or 'Beside <notify@mybeside.pro>'
)
RESEND_API_URL = os.environ.get('RESEND_API_URL', 'https://api.resend.com/emails').strip()
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', '').strip()
ADMIN_NOTIFICATION_EMAIL = os.environ.get('ADMIN_NOTIFICATION_EMAIL', '').strip()

# Browser origins allowed to call the API (comma-separated, without paths).
CORS_ORIGINS = parse_cors_origins(get_required_environment_variable('CORS_ORIGINS'))
if "https://app.mybeside.pro" not in CORS_ORIGINS:
    CORS_ORIGINS.append("https://app.mybeside.pro")
ADMIN_PUBLIC_URL = os.environ.get("ADMIN_PUBLIC_URL", "https://admin.mybeside.pro").strip().rstrip("/")
if ADMIN_PUBLIC_URL and ADMIN_PUBLIC_URL not in CORS_ORIGINS:
    CORS_ORIGINS.append(ADMIN_PUBLIC_URL)
FRONTEND_PUBLIC_URL = (
    os.environ.get('FRONTEND_PUBLIC_URL', '').strip().rstrip('/') or CORS_ORIGINS[0]
)
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "https://app.mybeside.pro").strip().rstrip("/")
OAUTH_SESSION_URL = os.environ.get('OAUTH_SESSION_URL', '').strip()
TOTP_ENCRYPTION_KEY = os.environ.get('TOTP_ENCRYPTION_KEY', '').strip()
TOTP_ISSUER = "BeSide"
TOTP_STEP_SECONDS = 30
TOTP_PENDING_MINUTES = 10
MFA_SESSION_MINUTES = 5
MFA_MAX_ATTEMPTS = 5
MFA_RECOVERY_REQUEST_MINUTES = 15
MFA_RECOVERY_MAX_ATTEMPTS = 5
MFA_RECOVERY_HOLD_HOURS = 24
MFA_RECOVERY_AUTHORIZATION_MINUTES = 10
RECOVERY_CONTACT_ROLE = "recovery_contact"


def get_boolean_environment_variable(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    normalized = value.strip().lower()
    if normalized not in {"true", "false"}:
        raise RuntimeError(f"{name} must be true or false")
    return normalized == "true"


APP_ENV = os.environ.get("APP_ENV", "production")
EXTERNAL_SERVICES_ENABLED = get_boolean_environment_variable("EXTERNAL_SERVICES_ENABLED", False)
RESEND_ENABLED = get_boolean_environment_variable("RESEND_ENABLED", False)
if APP_ENV == "local":
    from urllib.parse import urlparse
    if urlparse(MONGO_URL).hostname not in {"localhost", "127.0.0.1", "::1"} or not DB_NAME.startswith(("beside_demo", "beside_test_")):
        raise RuntimeError("Local mode requires a loopback MongoDB and a demo/test database")
    if EXTERNAL_SERVICES_ENABLED:
        raise RuntimeError("External services must remain disabled in local demo mode")


EMAIL_VERIFICATION_REQUIRED = get_boolean_environment_variable(
    "EMAIL_VERIFICATION_REQUIRED", False
)
RATE_LIMITING_ENABLED = get_boolean_environment_variable("RATE_LIMITING_ENABLED", True)
COOKIE_SECURE = get_boolean_environment_variable("COOKIE_SECURE", True)
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none" if APP_ENV == "production" else "lax").strip().lower()
if APP_ENV == "production" and COOKIE_SAMESITE == "lax":
    # The public app and API may be served from different Railway origins;
    # credentialed cross-origin requests require a Secure SameSite=None cookie.
    COOKIE_SAMESITE = "none"
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("COOKIE_SAMESITE must be lax, strict, or none")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise RuntimeError("COOKIE_SECURE must be true when COOKIE_SAMESITE=none")
if EMAIL_VERIFICATION_REQUIRED and not (RESEND_ENABLED and RESEND_API_KEY and RESEND_FROM_EMAIL):
    raise RuntimeError(
        "RESEND_ENABLED, RESEND_API_KEY and RESEND_FROM_EMAIL are required when email verification is enforced"
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        stats = await migrate_to_company_tenancy(db, ADMIN_EMAIL)
        await synchronize_platform_admin_password()
        if APP_ENV == "staging":
            cleanup = await db.users.update_many(
                {"$or": [{"totp_recovery_codes": {"$exists": True}},
                         {"totp_recovery_codes_rotated_at": {"$exists": True}}]},
                {"$unset": {"totp_recovery_codes": "", "totp_recovery_codes_rotated_at": ""}},
            )
            logger.info("Staging legacy backup code cleanup: %s accounts", cleanup.modified_count)
        logger.info("Multi-tenant migration completed: %s", stats)
        yield
    finally:
        client.close()


# Create the main app
app = FastAPI(
    title="BESIDE API",
    description="API per installatori auto wrap/PPF italiani",
    lifespan=lifespan,
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== CONSTANTS ====================

# Tax Regimes
TAX_REGIMES = ["forfettario_5", "forfettario_15", "ordinario"]
FINANCE_PERIODS = ["monthly", "yearly"]
CASH_PLAN_DATA_TYPES = ["actual", "forecast"]
CASH_PLAN_FORECAST_METHODS = ["manual", "average_3", "average_6", "copy_previous"]

# Business Types
BUSINESS_TYPES = ["ditta_individuale", "forfettario", "societa_persone", "societa_capitali"]

# Job Types
JOB_TYPES = ["ppf_full", "ppf_partial", "wrap_decorative", "wrap_commercial", "tint", "upholstery"]

# Vehicle Types
VEHICLE_TYPES = ["sedan", "suv", "van", "truck"]

# Lead Sources
LEAD_SOURCES = ["passaparola", "instagram", "facebook", "google_search", "google_maps", "partnership_carrozzerie", "fiere", "website", "altro"]

# Subscription Tiers
SUBSCRIPTION_TIERS = ["essential", "professional", "elite"]
SUBSCRIPTION_PRICES = {"essential": 97.00, "professional": 197.00, "elite": 397.00}

# Onboarding Status
ONBOARDING_STATUS = ["pending", "in_progress", "complete", "overdue"]
ONBOARDING_FEATURE_ENABLED = get_boolean_environment_variable("ONBOARDING_FEATURE_ENABLED", False)
BETA_MODE_ENABLED = get_boolean_environment_variable("BETA_MODE_ENABLED", False)
BETA_ALLOWED_EMAILS = {
    normalize_email(value.strip())
    for value in os.getenv("BETA_ALLOWED_EMAILS", "").split(",")
    if value.strip()
}
TERMS_VERSION = os.getenv("TERMS_VERSION", "draft-2026-11")
PRIVACY_NOTICE_VERSION = os.getenv("PRIVACY_NOTICE_VERSION", "draft-2026-11")
CONSENT_VERSION = os.getenv("CONSENT_VERSION", "v1")

# Default waste percentages
DEFAULT_WASTE = {"ppf": 0.20, "vinyl": 0.12}

# Company roles are separate from the explicit ``platform_role`` used by BESIDE.
USER_ROLES = list(COMPANY_ROLES)

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    first_name: str = Field(default="", max_length=100)
    business_name: str = Field(min_length=1, max_length=200)
    team_size: int = Field(default=1, ge=1, le=1000)
    services: List[str] = Field(default_factory=list, max_length=20)
    tax_regime: Optional[str] = None
    last_name: str = Field(default="", max_length=100)
    role: str = Field(default="", max_length=100)
    location_general: str = Field(default="", max_length=160)
    business_status: Optional[str] = Field(default=None, max_length=60)
    legal_form: Optional[str] = Field(default=None, max_length=60)
    sector: Optional[str] = Field(default=None, max_length=120)
    customer_type: Optional[str] = Field(default=None, max_length=30)
    revenue_band: Optional[str] = Field(default=None, max_length=40)
    employees_band: Optional[str] = Field(default=None, max_length=40)
    needs: List[str] = Field(default_factory=list, max_length=12)
    interested_modules: List[str] = Field(default_factory=list, max_length=12)
    monthly_quotes_band: Optional[str] = Field(default=None, max_length=40)
    onboarding_complete: bool = False
    terms_accepted: bool = False
    marketing_emails_opt_in: bool = False
    marketing_profiling_opt_in: bool = False

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TwoFactorPasswordRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)

class TwoFactorConfirmRequest(TwoFactorPasswordRequest):
    code: str = Field(min_length=6, max_length=6)

class TwoFactorVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)

class AdminMfaActivationCodeRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)

class AdminMfaActivationTotpRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)

class TwoFactorRecoveryRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TwoFactorRecoveryApprovalRequest(BaseModel):
    request_token: str = Field(min_length=20, max_length=512)
    verification_number: str = Field(min_length=8, max_length=8)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=6)

class TwoFactorRecoveryEmailApprovalRequest(BaseModel):
    approval_token: str = Field(min_length=32, max_length=512)
    verification_number: str = Field(min_length=8, max_length=8)


class TwoFactorRecoveryPrepareRequest(BaseModel):
    request_token: str = Field(min_length=20, max_length=512)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TwoFactorRecoveryContinuationRequest(BaseModel):
    continuation_token: str = Field(min_length=20, max_length=512)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TwoFactorRecoveryCancelRequest(TwoFactorRecoveryContinuationRequest):
    code: str = Field(min_length=6, max_length=6)

class TwoFactorRecoveryTotpSetupRequest(TwoFactorRecoveryContinuationRequest):
    pass

class TwoFactorRecoveryTotpConfirmRequest(TwoFactorRecoveryContinuationRequest):
    code: str = Field(min_length=6, max_length=6)

class RecoveryEmailSetupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    code: Optional[str] = Field(default=None, min_length=6, max_length=6)

class EmailRequest(BaseModel):
    email: EmailStr

class TokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)

class RecoveryEmailVerifyRequest(TokenRequest):
    pass

class RecoveryContactInviteRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    code: Optional[str] = Field(default=None, min_length=6, max_length=6)

class RecoveryContactAcceptRequest(TokenRequest):
    acceptance_code: str = Field(min_length=6, max_length=6)

class RecoveryContactLinkRequest(BaseModel):
    contact_id: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)
    code: Optional[str] = Field(default=None, min_length=6, max_length=6)

class RecoveryContactRevokeRequest(TwoFactorPasswordRequest):
    code: Optional[str] = Field(default=None, min_length=6, max_length=6)

class RecoveryContactAccountCreateRequest(TokenRequest):
    acceptance_code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=10, max_length=128)

class PasswordResetRequest(TokenRequest):
    password: str = Field(min_length=10, max_length=128)

class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[str] = None

class CompanyRoleUpdate(BaseModel):
    role: str

class CompanyStatusUpdate(BaseModel):
    status: str

class BusinessInfo(BaseModel):
    business_type: Optional[str] = None  # ditta_individuale, forfettario, societa_persone, societa_capitali
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    sdi: Optional[str] = None
    pec: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    iban: Optional[str] = None
    banca: Optional[str] = None
    logo_url: Optional[str] = None
    logo_width: Optional[int] = 150
    intestazione_extra: Optional[str] = None

class UserUpdate(BaseModel):
    business_name: Optional[str] = None
    team_size: Optional[int] = None
    services: Optional[List[str]] = None
    tax_regime: Optional[str] = None
    business_info: Optional[BusinessInfo] = None
    marketing_emails_opt_in: Optional[bool] = None
    marketing_profiling_opt_in: Optional[bool] = None

class PrivacyPreferencesUpdate(BaseModel):
    email_opt_in: bool = False
    profiling_opt_in: bool = False

class SupportTicketCreate(BaseModel):
    category: str = Field(default="other", max_length=40)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    email: Optional[EmailStr] = None

class SupportTicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=4000)

class OnboardingProfileUpdate(BaseModel):
    # Personal profile (stored on the authenticated user document).
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)
    location_general: Optional[str] = Field(default=None, max_length=160)
    # Organization profile (stored on the authenticated company document).
    business_status: Optional[str] = Field(default=None, max_length=60)
    legal_form: Optional[str] = Field(default=None, max_length=60)
    tax_regime: Optional[str] = Field(default=None, max_length=60)
    sector: Optional[str] = Field(default=None, max_length=120)
    customer_type: Optional[str] = Field(default=None, max_length=30)
    revenue_band: Optional[str] = Field(default=None, max_length=40)
    employees_band: Optional[str] = Field(default=None, max_length=40)
    needs: List[str] = Field(default_factory=list, max_length=12)
    interested_modules: List[str] = Field(default_factory=list, max_length=12)
    monthly_quotes_band: Optional[str] = Field(default=None, max_length=40)
    marketing_emails_opt_in: Optional[bool] = None
    marketing_profiling_opt_in: Optional[bool] = None
    step: int = Field(default=1, ge=1, le=3)
    complete: bool = False

# Job Models
class JobCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=200)
    client_email: Optional[str] = None
    job_type: str = Field(max_length=50)
    vehicle_type: str = Field(max_length=50)
    vehicle_info: Optional[str] = Field(default=None, max_length=500)
    quote_amount: float = Field(ge=0)
    hours_worked: float = Field(ge=0)
    materials_cost: float = Field(ge=0)
    waste_percentage: Optional[float] = Field(default=None, ge=0, le=1)
    lead_source: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=4000)
    is_quote: bool = False  # True = preventivo, False = lavoro completato

class JobResponse(BaseModel):
    job_id: str
    user_id: str
    client_name: str
    client_email: Optional[str] = None
    job_type: str
    vehicle_type: str
    vehicle_info: Optional[str] = None
    quote_amount: float
    hours_worked: float
    materials_cost: float
    waste_percentage: float
    profit_margin: float
    net_profit: float
    hourly_rate: float
    lead_source: Optional[str] = None
    notes: Optional[str] = None
    is_quote: bool
    quote_status: Optional[str] = None  # pending, accepted, rejected
    quote_link: Optional[str] = None
    completed_date: str
    created_at: str

# Quote Models
class QuoteAcceptance(BaseModel):
    accepted: bool
    client_signature: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=4000)

# Tax Models
class TaxCalculationRequest(BaseModel):
    revenue: float = Field(ge=0)
    tax_regime: str
    period: str = "monthly"  # monthly or yearly
    fixed_expenses: float = Field(default=0, ge=0)
    variable_expenses: float = Field(default=0, ge=0)

class TaxCalculationResponse(BaseModel):
    revenue: float
    tax_regime: str
    period: str
    irpef_amount: float
    inps_amount: float
    iva_amount: float
    total_accrual: float
    fixed_expenses: float
    variable_expenses: float
    operating_expenses: float
    total_outflows: float
    net_income: float
    yearly_projection: Optional[Dict[str, float]] = None

class FinanceSettingsUpdate(BaseModel):
    revenue: float = Field(default=0, ge=0)
    tax_regime: str = "forfettario_15"
    period: str = "monthly"
    fixed_expenses: float = Field(default=0, ge=0)
    variable_expenses: float = Field(default=0, ge=0)

class CashPlanSettingsUpdate(BaseModel):
    opening_balance: float = 0

class CashPlanMonthCreate(BaseModel):
    month: str
    data_type: str = "actual"
    revenue: float = Field(default=0, ge=0)
    fixed_expenses: float = Field(default=0, ge=0)
    variable_expenses: float = Field(default=0, ge=0)
    other_expenses: float = Field(default=0, ge=0)
    taxes_paid: float = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=1000)

class CashPlanMonthUpdate(CashPlanMonthCreate):
    pass

class CashPlanForecastRequest(BaseModel):
    method: str
    months: int = Field(default=6, ge=1, le=24)

class TaxAccrualCreate(BaseModel):
    month: str  # YYYY-MM format
    revenue: float

# Client Onboarding Models
class OnboardingCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=200)
    client_email: EmailStr
    vehicle_info: Optional[str] = Field(default=None, max_length=500)

class ChecklistItemUpdate(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    completed: bool
    uploaded_file: Optional[str] = Field(default=None, max_length=1000)

class OnboardingClientUpdate(BaseModel):
    checklist_items: List[ChecklistItemUpdate] = Field(max_length=50)

# Marketing Effort Models
class MarketingEffortCreate(BaseModel):
    month: str  # YYYY-MM
    channel: str
    hours_invested: float

# AI Content Generation Models
class ContentGenerationRequest(BaseModel):
    step: str  # bacino_utenza, trova_argomenti, pain_points, genera_idea, sviluppo_testo, sviluppo_video
    context: Dict[str, Any] = {}
    user_input: Optional[str] = None

# Admin Models
class AdminUserUpdate(BaseModel):
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class AdminChatMessage(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=4000)

class ChatMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

# ==================== HELPER FUNCTIONS ====================

def csv_text(value):
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()

def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())

def validate_password_strength(password: str) -> None:
    if len(password) < 10:
        raise HTTPException(status_code=400, detail="La password deve contenere almeno 10 caratteri")
    if len(password) > 128:
        raise HTTPException(status_code=400, detail="La password è troppo lunga")
    if not any(character.isalpha() for character in password) or not any(
        character.isdigit() for character in password
    ):
        raise HTTPException(
            status_code=400,
            detail="La password deve contenere almeno una lettera e un numero",
        )

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _totp_cipher() -> AESGCM:
    if not TOTP_ENCRYPTION_KEY:
        raise HTTPException(status_code=503, detail="2FA non configurato")
    return AESGCM(hashlib.sha256(TOTP_ENCRYPTION_KEY.encode("utf-8")).digest())


def encrypt_totp_secret(secret: str) -> str:
    nonce = secrets.token_bytes(12)
    encrypted = _totp_cipher().encrypt(nonce, secret.encode("ascii"), None)
    return base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")


def decrypt_totp_secret(value: str) -> str:
    try:
        raw = base64.urlsafe_b64decode(value.encode("ascii"))
        return _totp_cipher().decrypt(raw[:12], raw[12:], None).decode("ascii")
    except (ValueError, TypeError, UnicodeError):
        raise HTTPException(status_code=503, detail="Segreto 2FA non disponibile")


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def totp_code(secret: str, timestamp: Optional[int] = None, offset: int = 0) -> str:
    timestamp = int(timestamp if timestamp is not None else datetime.now(timezone.utc).timestamp())
    counter = max(0, timestamp // TOTP_STEP_SECONDS + offset)
    digest = hmac.new(
        base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True),
        struct.pack(">Q", counter),
        hashlib.sha1,
    ).digest()
    index = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[index:index + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def verify_totp_code(secret: str, code: str, timestamp: Optional[int] = None) -> Optional[int]:
    if not re.fullmatch(r"\d{6}", code or ""):
        return None
    now = int(timestamp if timestamp is not None else datetime.now(timezone.utc).timestamp())
    current_step = now // TOTP_STEP_SECONDS
    for offset in (-1, 0, 1):
        if hmac.compare_digest(totp_code(secret, now, offset), code):
            return current_step + offset
    return None


# Keep the unknown-user login path close to the same bcrypt cost as a real user.
DUMMY_PASSWORD_HASH = bcrypt.hashpw(
    b"beside-dummy-password-never-used",
    bcrypt.gensalt(rounds=12),
).decode()


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key="session_token",
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


async def synchronize_platform_admin_password() -> None:
    """Make the Railway secret authoritative and invalidate older admin passwords."""
    admin_user = await db.users.find_one(
        {"email": normalize_email(ADMIN_EMAIL), "platform_role": "super_admin"},
        {"_id": 0},
    )
    if not admin_user:
        return
    password_matches = False
    try:
        password_matches = verify_password(ADMIN_PASSWORD, admin_user.get("password_hash", ""))
    except (TypeError, ValueError):
        password_matches = False
    if password_matches:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": admin_user["user_id"], "platform_role": "super_admin"},
        {"$set": {
            "password_hash": hash_password(ADMIN_PASSWORD),
            "admin_password_rotated_at": now_iso,
            "updated_at": now_iso,
        }},
    )
    await db.user_sessions.update_many(
        {"user_id": admin_user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )


def email_verification_blocks_access(user: Dict[str, Any]) -> bool:
    return bool(
        EMAIL_VERIFICATION_REQUIRED
        and not user.get("email_verified", False)
        and not user.get("email_verification_exempt", False)
    )


def request_client_identifier(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(
    request: Request,
    scope: str,
    *,
    limit: int,
    window_seconds: int,
    identifier: str = "",
) -> None:
    """Distributed fixed-window limit stored in MongoDB, without raw PII keys."""
    if not RATE_LIMITING_ENABLED:
        return
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // window_seconds
    raw_key = "|".join(
        (scope, request_client_identifier(request), identifier.strip().lower(), str(bucket))
    )
    key = hmac.new(JWT_SECRET.encode(), raw_key.encode(), hashlib.sha256).hexdigest()
    expires_at = datetime.fromtimestamp(
        (bucket + 2) * window_seconds,
        tz=timezone.utc,
    )
    # Trial volumes cannot build TTL indexes. One _id-protected maintenance
    # marker per day keeps expired counters bounded until the volume is enlarged.
    cleanup_marker = f"rate-limit-cleanup:{int(now.timestamp()) // 86400}"
    try:
        await db.rate_limits.insert_one({
            "_id": cleanup_marker,
            "scope": "maintenance",
            "expires_at": now + timedelta(days=2),
        })
    except DuplicateKeyError:
        pass
    else:
        await db.rate_limits.delete_many({"expires_at": {"$lt": now}})
    rate_limit = await db.rate_limits.find_one_and_update(
        {"_id": key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {
                "key": key,
                "scope": scope,
                "window_started_at": datetime.fromtimestamp(
                    bucket * window_seconds, tz=timezone.utc
                ),
                "expires_at": expires_at,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if rate_limit and rate_limit.get("count", 0) > limit:
        retry_after = max(1, int((expires_at - now).total_seconds()) - window_seconds)
        raise HTTPException(
            status_code=429,
            detail="Troppi tentativi. Riprova più tardi.",
            headers={"Retry-After": str(retry_after)},
        )


async def enforce_email_verification_resend_limits(request: Request, email: str) -> None:
    """Apply persistent resend limits without revealing account existence."""
    await enforce_rate_limit(
        request,
        "auth_email_verification_resend_ip",
        limit=10,
        window_seconds=10 * 60,
    )
    now = datetime.now(timezone.utc)
    key = hmac.new(JWT_SECRET.encode(), f"email-verification-resend|{email}".encode(), hashlib.sha256).hexdigest()
    window = timedelta(minutes=10)
    current = await db.email_verification_resends.find_one({"_id": key}, {"_id": 0})
    if current:
        window_started = parse_datetime(current.get("window_started_at"))
        last_sent = parse_datetime(current.get("last_sent_at"))
        if now - window_started >= window:
            await db.email_verification_resends.update_one(
                {"_id": key},
                {"$set": {"window_started_at": now, "last_sent_at": now, "resend_count": 1}},
            )
            return
        else:
            if now - last_sent < timedelta(seconds=60):
                retry = max(1, 60 - int((now - last_sent).total_seconds()))
                raise HTTPException(status_code=429, detail="Attendi prima di richiedere un nuovo link.", headers={"Retry-After": str(retry)})
            if int(current.get("resend_count", 0)) >= 3:
                retry = max(1, int((window - (now - window_started)).total_seconds()))
                raise HTTPException(status_code=429, detail="Limite di reinvio raggiunto. Riprova più tardi.", headers={"Retry-After": str(retry)})
    if current is None:
        try:
            await db.email_verification_resends.insert_one({"_id": key, "window_started_at": now, "last_sent_at": now, "resend_count": 1})
            return
        except DuplicateKeyError:
            current = await db.email_verification_resends.find_one({"_id": key}, {"_id": 0})
    updated = await db.email_verification_resends.find_one_and_update(
        {"_id": key, "resend_count": {"$lt": 3}, "last_sent_at": {"$lte": now - timedelta(seconds=60)}},
        {"$inc": {"resend_count": 1}, "$set": {"last_sent_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=429, detail="Attendi prima di richiedere un nuovo link.", headers={"Retry-After": "60"})


async def reserve_email_claim(email: str, user_id: str, company_id: str) -> None:
    """Serialize new accounts without relying on a custom MongoDB index."""
    try:
        await db.email_claims.insert_one({
            "_id": email_claim_id(email),
            "user_id": user_id,
            "company_id": company_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email già registrata")


async def release_email_claim(email: str, user_id: str) -> None:
    """Release only a claim owned by a registration that did not complete."""
    await db.email_claims.delete_one({
        "_id": email_claim_id(email),
        "user_id": user_id,
    })

def create_jwt_token(
    user_id: str,
    email: str,
    role: str = "member",
    company_id: str = "",
    jti: Optional[str] = None,
    token_type: str = "access",
    expires_delta: Optional[timedelta] = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "company_id": company_id,
        "type": token_type,
        "jti": jti or uuid.uuid4().hex,
        "iat": now,
        "exp": now + (expires_delta or timedelta(days=JWT_EXPIRATION_DAYS)),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")

def _session_expired(session: Dict[str, Any]) -> bool:
    expires_at = parse_datetime(session.get("expires_at"))
    return expires_at <= datetime.now(timezone.utc)

def _extract_request_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    token = request.cookies.get("session_token")
    if token and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("Origin", "").rstrip("/")
        if origin not in CORS_ORIGINS:
            raise HTTPException(status_code=403, detail="Origine della richiesta non autorizzata")
    return token

async def create_authenticated_session(
    user: Dict[str, Any],
    *,
    mfa_verified: bool = False,
) -> str:
    """Create a fully authenticated session.

    ``mfa_verified`` is set only by the server-side MFA verification flow; it
    is persisted with the session so ``get_current_user`` can distinguish a
    completed MFA login from a pending session without trusting client input.
    """
    jti = uuid.uuid4().hex
    token = create_jwt_token(
        user["user_id"],
        user["email"],
        user.get("role", "member"),
        user.get("company_id", ""),
        jti,
    )
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_id": f"session_{uuid.uuid4().hex[:16]}",
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "jti": jti,
        "token_hash": hash_token(token),
        "session_type": "jwt",
        "mfa_verified": bool(mfa_verified),
        "expires_at": (now + timedelta(days=JWT_EXPIRATION_DAYS)).isoformat(),
        "expires_at_dt": now + timedelta(days=JWT_EXPIRATION_DAYS),
        "created_at": now.isoformat(),
        "revoked_at": None,
    })
    return token


async def create_mfa_pending_session(user: Dict[str, Any]) -> str:
    jti = uuid.uuid4().hex
    lifetime = timedelta(minutes=MFA_SESSION_MINUTES)
    token = create_jwt_token(
        user["user_id"], user["email"], user.get("role", "member"),
        user.get("company_id", ""), jti, "mfa_pending", lifetime,
    )
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_id": f"mfa_{uuid.uuid4().hex[:16]}",
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "jti": jti,
        "token_hash": hash_token(token),
        "session_type": "mfa_pending",
        "expires_at": (now + lifetime).isoformat(),
        "expires_at_dt": now + lifetime,
        "created_at": now.isoformat(),
        "revoked_at": None,
        "mfa_attempts": 0,
    })
    return token

async def create_mfa_setup_session(user: Dict[str, Any]) -> str:
    """Create a short-lived, setup-only session for customers without MFA.

    This session is intentionally distinct from both a pending-login session
    and a fully authenticated JWT session.  It can only be used by the TOTP
    setup/confirmation endpoints and never authorizes tenant data access.
    """
    jti = uuid.uuid4().hex
    lifetime = timedelta(minutes=MFA_SESSION_MINUTES)
    token = create_jwt_token(
        user["user_id"], user["email"], user.get("role", "member"),
        user.get("company_id", ""), jti, "mfa_setup", lifetime,
    )
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_id": f"mfa_setup_{uuid.uuid4().hex[:16]}",
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "jti": jti,
        "token_hash": hash_token(token),
        "session_type": "mfa_setup",
        "expires_at": (now + lifetime).isoformat(),
        "expires_at_dt": now + lifetime,
        "created_at": now.isoformat(),
        "revoked_at": None,
        "mfa_attempts": 0,
    })
    return token

async def create_admin_mfa_setup_session(user: Dict[str, Any], activation_code: str) -> str:
    """Create a setup-only session; it can never satisfy protected dependencies."""
    if await db.user_sessions.find_one({
        "activation_code_hash": hash_token(activation_code),
        "session_type": "admin_mfa_setup",
        "revoked_at": None,
        "expires_at_dt": {"$gt": datetime.now(timezone.utc)},
    }, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Codice di attivazione già in uso; riprova")
    jti = uuid.uuid4().hex
    lifetime = timedelta(minutes=10)
    token = create_jwt_token(
        user["user_id"], user["email"], "admin", user.get("company_id", ""),
        jti, "admin_mfa_setup", lifetime,
    )
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_id": f"admin_mfa_setup_{uuid.uuid4().hex[:16]}",
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "jti": jti,
        "token_hash": hash_token(token),
        "session_type": "admin_mfa_setup",
        "activation_code_hash": hash_token(activation_code),
        "activation_attempts": 0,
        "expires_at": (now + lifetime).isoformat(),
        "expires_at_dt": now + lifetime,
        "created_at": now.isoformat(),
        "revoked_at": None,
    })
    return token

async def _load_active_user(user_id: str) -> Dict[str, Any]:
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disattivato")
    if user.get("role") == RECOVERY_CONTACT_ROLE:
        user["company"] = {}
        return user
    if not user.get("company_id"):
        raise HTTPException(status_code=403, detail="Account non associato a un'azienda")

    company = await db.companies.find_one({"company_id": user["company_id"]}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=403, detail="Azienda non trovata")
    if company.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Azienda non attiva")
    user["company"] = company
    return user

def _ensure_recovery_contact_scope(request: Request, user: Dict[str, Any]) -> None:
    """Recovery accounts may use only their own authentication endpoints."""
    if user.get("role") != RECOVERY_CONTACT_ROLE:
        return
    allowed = {
        "/api/auth/me", "/api/auth/logout", "/api/auth/2fa/setup",
        "/api/auth/2fa/confirm", "/api/auth/2fa/verify",
        "/api/auth/recovery-contact/link-account",
    }
    if request.url.path not in allowed:
        raise HTTPException(status_code=403, detail="Account contatto limitato all'autenticazione")

def _ensure_mfa_setup_scope(request: Request) -> None:
    """Allow setup sessions to reach only the minimum MFA enrollment API."""
    allowed = {"/api/auth/2fa/setup", "/api/auth/2fa/confirm", "/api/auth/logout"}
    if request.url.path not in allowed:
        raise HTTPException(status_code=401, detail="Configurazione 2FA richiesta")

async def get_current_user(request: Request) -> Dict[str, Any]:
    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")

    token_digest = hash_token(token)
    session = await db.user_sessions.find_one(
        {"token_hash": token_digest, "revoked_at": None},
        {"_id": 0},
    )

    if session and session.get("session_type") != "jwt":
        if session.get("session_type") == "mfa_setup":
            if _session_expired(session):
                raise HTTPException(status_code=401, detail="Configurazione 2FA scaduta")
            _ensure_mfa_setup_scope(request)
            user = await _load_active_user(session["user_id"])
            if user.get("totp_enabled"):
                raise HTTPException(status_code=409, detail="2FA già attivo")
            return user
        if session.get("session_type") in {"mfa_pending", "admin_mfa_setup"}:
            raise HTTPException(status_code=401, detail="Secondo fattore richiesto")
        if _session_expired(session):
            raise HTTPException(status_code=401, detail="Sessione scaduta")
        user = await _load_active_user(session["user_id"])
        _ensure_recovery_contact_scope(request, user)
        if user.get("totp_enabled") and not session.get("mfa_verified", False):
            raise HTTPException(status_code=401, detail="Verifica 2FA richiesta")
        if email_verification_blocks_access(user):
            raise HTTPException(status_code=403, detail="Verifica l'email prima di continuare")
        if (
            session.get("session_type") == "jwt"
            and user.get("role") != RECOVERY_CONTACT_ROLE
            and user.get("platform_role") != "super_admin"
            and not user.get("totp_enabled")
        ):
            raise HTTPException(status_code=401, detail="Configurazione 2FA richiesta")
        return user

    try:
        payload = decode_jwt_token(token)
        if payload.get("type", "access") != "access":
            raise HTTPException(status_code=401, detail="Tipo di token non valido")
        # Every JWT must be backed by its active database session. Tokens issued
        # before the jti/session binding existed are intentionally rejected.
        jti = payload.get("jti")
        if not jti or not session or session.get("session_type") != "jwt":
            raise HTTPException(status_code=401, detail="Sessione non valida o legacy")
        if session.get("jti") != jti or _session_expired(session):
            raise HTTPException(status_code=401, detail="Sessione revocata o scaduta")
        user = await _load_active_user(payload["user_id"])
        _ensure_recovery_contact_scope(request, user)
        if user.get("totp_enabled") and not session.get("mfa_verified", False):
            raise HTTPException(status_code=401, detail="Verifica 2FA richiesta")
        if email_verification_blocks_access(user):
            raise HTTPException(status_code=403, detail="Verifica l'email prima di continuare")
        if (
            user.get("role") != RECOVERY_CONTACT_ROLE
            and user.get("platform_role") != "super_admin"
            and not user.get("totp_enabled")
        ):
            raise HTTPException(status_code=401, detail="Configurazione 2FA richiesta")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token non valido")

async def get_admin_user(request: Request) -> Dict[str, Any]:
    """Require explicit platform privileges, never a company role alone."""
    user = await get_current_user(request)
    if user.get("platform_role") != "super_admin":
        raise HTTPException(status_code=403, detail="Accesso negato - richiesti privilegi admin")
    # Platform Owner endpoints require a completed MFA-bound session even if a
    # stale or legacy session document still exists for the account.
    token = _extract_request_token(request)
    session = await db.user_sessions.find_one(
        {"token_hash": hash_token(token or ""), "revoked_at": None},
        {"_id": 0, "session_type": 1, "mfa_verified": 1},
    )
    if not user.get("totp_enabled") or not session or session.get("session_type") != "jwt" or not session.get("mfa_verified"):
        raise HTTPException(status_code=401, detail="Verifica MFA amministratore richiesta")
    return user

def require_company_roles(*allowed_roles: str):
    invalid = set(allowed_roles) - set(COMPANY_ROLES)
    if invalid:
        raise ValueError(f"Unknown company roles: {sorted(invalid)}")

    async def dependency(current_user: Dict = Depends(get_current_user)) -> Dict[str, Any]:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Ruolo aziendale non autorizzato")
        return current_user

    return dependency

async def audit_event(
    event: str,
    *,
    user: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
    company_id: Optional[str] = None,
    request: Optional[Request] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    client_identifier = request_client_identifier(request) if request else ""
    await db.audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:16]}",
        "event": event,
        "user_id": user_id or (user or {}).get("user_id"),
        "company_id": company_id or (user or {}).get("company_id"),
        "ip_hash": (
            hmac.new(JWT_SECRET.encode(), client_identifier.encode(), hashlib.sha256).hexdigest()
            if client_identifier else None
        ),
        "user_agent": request.headers.get("User-Agent") if request else None,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    company = user.get("company") or {}
    return {
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "email": user["email"],
        "first_name": user.get("first_name", ""),
        "full_name": user.get("full_name") or user.get("first_name") or user.get("name") or "",
        "name": user.get("name"),
        "picture": user.get("picture"),
        "business_name": company.get("name") or user.get("business_name", ""),
        "team_size": user.get("team_size", 1),
        "services": user.get("services", []),
        "tax_regime": user.get("tax_regime", "forfettario_15"),
        "business_info": user.get("business_info", {}),
        "subscription_tier": company.get("plan_id") or user.get("subscription_tier", "essential"),
        "subscription_status": company.get("subscription_status") or user.get("subscription_status", "trialing"),
        "trial_started_at": company.get("trial_started_at"),
        "trial_ends_at": company.get("trial_ends_at"),
        "role": user.get("role", "member"),
        "email_verified": bool(user.get("email_verified", False)),
        "totp_enabled": bool(user.get("totp_enabled", False)),
        "recovery_email": user.get("recovery_email") if user.get("recovery_email_verified") else None,
        "recovery_email_verified": bool(user.get("recovery_email_verified", False)),
        "is_active": bool(user.get("is_active", True)),
        "created_at": user.get("created_at", ""),
        "updated_at": user.get("updated_at", ""),
        "last_login_at": user.get("last_login_at"),
        "onboarding_enabled": ONBOARDING_FEATURE_ENABLED,
        "onboarding_complete": bool(user.get("onboarding_completed_at")),
        "legal_consents": user.get("legal_consents", {}),
        "marketing_preferences": user.get("marketing_preferences", {"email_opt_in": False, "profiling_opt_in": False}),
    }


async def _consume_current_totp(user: Dict[str, Any], code: str) -> bool:
    """Validate and atomically reserve the current TOTP step."""
    secret_value = user.get("totp_secret_enc")
    if not secret_value:
        return False
    step = verify_totp_code(decrypt_totp_secret(secret_value), code)
    if step is None:
        return False
    replay_guard = await db.users.update_one(
        {"user_id": user["user_id"], "$or": [
            {"totp_last_used_step": {"$lt": step}},
            {"totp_last_used_step": {"$exists": False}},
        ]},
        {"$set": {"totp_last_used_step": step}},
    )
    return replay_guard.modified_count == 1

@api_router.post("/auth/2fa/recovery/request")
async def request_two_factor_recovery(
    data: TwoFactorRecoveryRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Start a short-lived recovery request without issuing an authenticated session."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_request_email", limit=3,
                             window_seconds=15 * 60, identifier=email)
    await enforce_rate_limit(request, "auth_2fa_recovery_request_ip", limit=10,
                             window_seconds=15 * 60)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user:
        verify_password(data.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    if not user.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="Il recupero 2FA non è disponibile")

    now = datetime.now(timezone.utc)
    contacts = await db.recovery_contacts.find({
        "user_id": user["user_id"],
        "status": {"$in": ["active", "security_period", "verified"]},
        "accepted_at": {"$exists": True},
        "contact_verified_at": {"$exists": True},
    }, {"_id": 0}).to_list(20)
    authorized_contact = None
    for contact in contacts:
        contact = await _refresh_recovery_contact_status(contact)
        period_end = parse_datetime(contact.get("security_period_ends_at"), now + timedelta(days=1))
        if period_end > now:
            continue
        authorized_contact = contact
        if contact.get("status") == "security_period":
            await db.recovery_contacts.update_one(
                {"contact_id": contact["contact_id"], "status": "security_period"},
                {"$set": {"status": "active", "activated_at": now.isoformat(),
                          "updated_at": now.isoformat()}},
            )
        break
    if not authorized_contact:
        raise HTTPException(status_code=400, detail="Nessun contatto fidato attivo e verificato")

    duplicate = await db.mfa_recovery_requests.find_one(
        {"user_id": user["user_id"], "status": "pending", "expires_at_dt": {"$gt": now}},
        {"_id": 1},
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Esiste già una richiesta di recupero in corso")

    request_token = secrets.token_urlsafe(32)
    contact_approval_token = secrets.token_urlsafe(32)
    verification_number = f"{secrets.randbelow(100_000_000):08d}"
    expires = now + timedelta(minutes=MFA_RECOVERY_REQUEST_MINUTES)
    request_id = f"mfa_recovery_{uuid.uuid4().hex[:16]}"
    await db.mfa_recovery_requests.insert_one({
        "request_id": request_id,
        "request_token_hash": hash_token(request_token),
        "contact_approval_token_hash": hash_token(contact_approval_token),
        "verification_number_hash": hash_token(verification_number),
        "user_id": user["user_id"],
        "company_id": user.get("company_id"),
        "contact_id": authorized_contact["contact_id"],
        "contact_user_id": authorized_contact.get("linked_user_id"),
        "contact_email": authorized_contact["contact_email"],
        "status": "pending",
        "attempts": 0,
        "max_attempts": MFA_RECOVERY_MAX_ATTEMPTS,
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "expires_at_dt": expires,
    })
    await audit_event("2fa_recovery_requested", user=user, request=request,
                      metadata={"request_id": request_id, "contact_id": authorized_contact["contact_id"]})
    background_tasks.add_task(send_2fa_recovery_started_notice, user["email"])
    background_tasks.add_task(
        send_recovery_contact_approval_email, authorized_contact["contact_email"],
        contact_approval_token)
    return {
        "request_id": request_id,
        "request_token": request_token,
        "verification_number": verification_number,
        "expires_in": MFA_RECOVERY_REQUEST_MINUTES * 60,
        "message": "Comunica il numero temporaneo al contatto fidato. Riceverà un'email per confermare.",
    }

@api_router.get("/auth/2fa/recovery/status")
async def get_two_factor_recovery_status(request: Request, response: Response):
    """Read recovery state with a temporary credential, never creating a session."""
    response.headers["Cache-Control"] = "no-store"
    credential = request.headers.get("X-Recovery-Credential", "").strip()
    password = request.headers.get("X-Recovery-Password", "")
    if not credential or not password:
        raise HTTPException(status_code=401, detail="Credenziale di recupero e password richieste")
    await enforce_rate_limit(request, "auth_2fa_recovery_status", limit=20,
                             window_seconds=15 * 60)
    credential_hash = hash_token(credential)
    recovery_request = await db.mfa_recovery_requests.find_one(
        {"$or": [{"request_token_hash": credential_hash},
                 {"continuation_token_hash": credential_hash}]},
        {"_id": 0},
    )
    if not recovery_request:
        raise HTTPException(status_code=401, detail="Credenziale di recupero non valida")
    user = await db.users.find_one(
        {"user_id": recovery_request["user_id"], "is_active": {"$ne": False}},
        {"_id": 0},
    )
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenziale di recupero non valida")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")

    now = datetime.now(timezone.utc)
    raw_status = recovery_request.get("status", "unknown")
    security_end = recovery_request.get("hold_expires_at")
    effective_expiry = None
    status = raw_status
    if raw_status in {"pending", "approved"}:
        effective_expiry = parse_datetime(recovery_request.get("expires_at_dt"))
        if effective_expiry <= now:
            status = "expired"
    elif raw_status == "approved_hold":
        effective_expiry = parse_datetime(recovery_request.get("hold_expires_at"))
        status = "security_period" if effective_expiry > now else "ready"
    elif raw_status == "authorization_issued":
        effective_expiry = parse_datetime(recovery_request.get("authorization_expires_at"))
        status = "ready" if effective_expiry > now else "expired"
    elif raw_status == "totp_setup_pending":
        effective_expiry = parse_datetime(recovery_request.get("authorization_expires_at"))
        status = "totp_setup_pending" if effective_expiry > now else "expired"
    elif raw_status == "revoked":
        status = "cancelled"
    elif raw_status == "completed":
        status = "completed"

    return {
        "status": status,
        "expires_at": effective_expiry.isoformat() if effective_expiry else None,
        "security_period_ends_at": security_end.isoformat() if isinstance(security_end, datetime) else security_end,
        "ready": status == "ready",
        "expired": status == "expired",
        "cancelled": status == "cancelled",
    }

@api_router.post("/auth/2fa/recovery/approve-email")
async def approve_two_factor_recovery_by_email(
    data: TwoFactorRecoveryEmailApprovalRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Two-channel approval: proof of contact mailbox + number from owner.

    It never resets MFA, grants a session, or circumvents the separate 24-hour hold.
    """
    await enforce_rate_limit(request, "auth_recovery_approval_email_ip",
                             limit=10, window_seconds=15 * 60)
    now = datetime.now(timezone.utc)
    attempted = await db.mfa_recovery_requests.find_one_and_update(
        {"contact_approval_token_hash": hash_token(data.approval_token),
         "status": "pending", "expires_at_dt": {"$gt": now},
         "attempts": {"$lt": MFA_RECOVERY_MAX_ATTEMPTS}},
        {"$inc": {"attempts": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not attempted:
        raise HTTPException(status_code=400, detail="Richiesta non disponibile o scaduta")
    if not hmac.compare_digest(
        attempted["verification_number_hash"], hash_token(data.verification_number)
    ):
        raise HTTPException(status_code=401, detail="Numero di verifica non corretto")
    contact = await db.recovery_contacts.find_one(
        {"contact_id": attempted["contact_id"],
         "user_id": attempted["user_id"],
         "contact_email": attempted["contact_email"],
         "status": {"$in": ["active", "security_period"]},
         "accepted_at": {"$exists": True},
         "contact_verified_at": {"$exists": True}},
        {"_id": 0},
    )
    if not contact or parse_datetime(contact.get("security_period_ends_at"),
                                     now + timedelta(days=1)) > now:
        raise HTTPException(status_code=403, detail="Contatto fidato non più autorizzato")
    approved_at = now.isoformat()
    approved = await db.mfa_recovery_requests.find_one_and_update(
        {"request_id": attempted["request_id"], "status": "pending",
         "contact_approval_token_hash": hash_token(data.approval_token),
         "expires_at_dt": {"$gt": now}},
        {"$set": {"status": "approved", "approved_at": approved_at,
                  "approval_method": "contact_email_and_owner_challenge",
                  "updated_at": approved_at},
         "$unset": {"contact_approval_token_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not approved:
        raise HTTPException(status_code=409, detail="Richiesta già completata o scaduta")
    owner = await db.users.find_one({"user_id": approved["user_id"]}, {"_id": 0})
    if owner:
        background_tasks.add_task(send_2fa_recovery_approved_notice, owner["email"])
        await audit_event("2fa_recovery_approved_by_trusted_email",
                          user=owner, request=request,
                          metadata={"request_id": approved["request_id"],
                                    "contact_id": approved["contact_id"]})
    return {"status": "approved", "message": "Conferma acquisita. Nessun accesso è stato concesso."}


@api_router.post("/auth/2fa/recovery/approve")
async def approve_two_factor_recovery(
    data: TwoFactorRecoveryApprovalRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Approve a pending recovery request without granting account access."""
    contact_email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_approve_email", limit=5,
                             window_seconds=15 * 60, identifier=contact_email)
    await enforce_rate_limit(request, "auth_2fa_recovery_approve_ip", limit=15,
                             window_seconds=15 * 60)
    now = datetime.now(timezone.utc)
    recovery_request = await db.mfa_recovery_requests.find_one(
        {"request_token_hash": hash_token(data.request_token),
         "verification_number_hash": hash_token(data.verification_number),
         "status": "pending", "expires_at_dt": {"$gt": now}},
        {"_id": 0},
    )
    if not recovery_request:
        raise HTTPException(status_code=400, detail="Richiesta non valida, scaduta o già utilizzata")
    attempted = await db.mfa_recovery_requests.find_one_and_update(
        {"request_id": recovery_request["request_id"], "status": "pending",
         "attempts": {"$lt": MFA_RECOVERY_MAX_ATTEMPTS}, "expires_at_dt": {"$gt": now}},
        {"$inc": {"attempts": 1}}, return_document=ReturnDocument.AFTER,
    )
    if not attempted:
        raise HTTPException(status_code=429, detail="Troppi tentativi per questa richiesta")
    recovery_request = attempted

    contact_user = await db.users.find_one(
        {"user_id": recovery_request["contact_user_id"], "is_active": {"$ne": False}},
        {"_id": 0},
    )
    if not contact_user or normalize_email(contact_user.get("email", "")) != contact_email:
        raise HTTPException(status_code=403, detail="Contatto fidato non autorizzato")
    if not verify_password(data.password, contact_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not contact_user.get("email_verified") or not contact_user.get("totp_enabled"):
        raise HTTPException(status_code=403, detail="Il contatto non ha completato la verifica richiesta")
    if not await _consume_current_totp(contact_user, data.code):
        raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")

    contact = await db.recovery_contacts.find_one(
        {"contact_id": recovery_request["contact_id"],
         "user_id": recovery_request["user_id"],
         "linked_user_id": recovery_request["contact_user_id"]},
        {"_id": 0},
    )
    if not contact:
        raise HTTPException(status_code=403, detail="Contatto fidato non autorizzato")
    period_end = parse_datetime(contact.get("security_period_ends_at"), now + timedelta(days=1))
    if period_end > now or contact.get("status") not in {"active", "security_period"}:
        raise HTTPException(status_code=403, detail="Contatto fidato non ancora attivo")
    if contact.get("status") == "security_period":
        await db.recovery_contacts.update_one(
            {"contact_id": contact["contact_id"], "status": "security_period"},
            {"$set": {"status": "active", "activated_at": now.isoformat(), "updated_at": now.isoformat()}},
        )

    approved_at = now.isoformat()
    approved = await db.mfa_recovery_requests.find_one_and_update(
        {"request_id": recovery_request["request_id"], "status": "pending",
         "expires_at_dt": {"$gt": now}, "contact_user_id": contact_user["user_id"]},
        {"$set": {"status": "approved", "approved_at": approved_at,
                  "approved_by_contact_user_id": contact_user["user_id"],
                  "updated_at": approved_at}},
        return_document=ReturnDocument.AFTER,
    )
    if not approved:
        raise HTTPException(status_code=409, detail="Richiesta già utilizzata o scaduta")
    owner = await db.users.find_one({"user_id": recovery_request["user_id"]}, {"_id": 0})
    if owner:
        await audit_event("2fa_recovery_approved", user=owner, request=request,
                          metadata={"request_id": recovery_request["request_id"],
                                    "contact_user_id": contact_user["user_id"]})
        background_tasks.add_task(send_2fa_recovery_approved_notice, owner["email"])
    return {"status": "approved", "message": "Richiesta di recupero approvata dal contatto fidato."}

@api_router.post("/auth/2fa/recovery/prepare")
async def prepare_two_factor_recovery(
    data: TwoFactorRecoveryPrepareRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Start the separate 24-hour hold after owner continuity verification."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_prepare", limit=3,
                             window_seconds=15 * 60, identifier=email)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    now = datetime.now(timezone.utc)
    continuation_token = secrets.token_urlsafe(32)
    hold_expires = now + timedelta(hours=MFA_RECOVERY_HOLD_HOURS)
    prepared = await db.mfa_recovery_requests.find_one_and_update(
        {"request_token_hash": hash_token(data.request_token), "user_id": user["user_id"],
         "status": "approved", "expires_at_dt": {"$gt": now},
         "approved_by_contact_user_id": {"$exists": True}},
        {"$set": {"status": "approved_hold", "hold_started_at": now.isoformat(),
                  "hold_expires_at": hold_expires, "owner_verified_at": now.isoformat(),
                  "continuation_token_hash": hash_token(continuation_token), "updated_at": now.isoformat()},
         "$unset": {"request_token_hash": "", "verification_number_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not prepared:
        raise HTTPException(status_code=400, detail="Richiesta non valida, scaduta o già preparata")
    await audit_event("2fa_recovery_hold_started", user=user, request=request,
                      metadata={"request_id": prepared["request_id"]})
    return {"status": "approved_hold", "continuation_token": continuation_token,
            "hold_expires_at": hold_expires.isoformat(),
            "message": "Verifica completata. È iniziato il periodo di sicurezza di 24 ore."}

@api_router.post("/auth/2fa/recovery/authorize-totp")
async def authorize_two_factor_recovery(
    data: TwoFactorRecoveryContinuationRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Issue only a one-time TOTP configuration authorization after the hold."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_authorize", limit=3,
                             window_seconds=15 * 60, identifier=email)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    now = datetime.now(timezone.utc)
    authorization_token = secrets.token_urlsafe(32)
    authorization_expires = now + timedelta(minutes=MFA_RECOVERY_AUTHORIZATION_MINUTES)
    authorized = await db.mfa_recovery_requests.find_one_and_update(
        {"continuation_token_hash": hash_token(data.continuation_token), "user_id": user["user_id"],
         "status": "approved_hold", "hold_expires_at": {"$lte": now}},
        {"$set": {"status": "authorization_issued", "authorization_issued_at": now.isoformat(),
                  "authorization_expires_at": authorization_expires,
                  "authorization_token_hash": hash_token(authorization_token),
                  "updated_at": now.isoformat()}},
        return_document=ReturnDocument.AFTER,
    )
    if not authorized:
        raise HTTPException(status_code=400, detail="Periodo di sicurezza non concluso o autorizzazione già utilizzata")
    await audit_event("2fa_recovery_authorization_issued", user=user, request=request,
                      metadata={"request_id": authorized["request_id"]})
    background_tasks.add_task(send_2fa_recovery_usable_notice, user["email"])
    return {"status": "authorization_issued", "totp_authorization_token": authorization_token,
            "expires_in": MFA_RECOVERY_AUTHORIZATION_MINUTES * 60,
            "message": "Autorizzazione temporanea pronta per la futura configurazione TOTP."}

@api_router.post("/auth/2fa/recovery/cancel")
async def cancel_two_factor_recovery(
    data: TwoFactorRecoveryCancelRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Cancel recovery with a strong password + current TOTP proof."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_cancel", limit=5,
                             window_seconds=15 * 60, identifier=email)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    if not await _consume_current_totp(user, data.code):
        raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")
    now_iso = datetime.now(timezone.utc).isoformat()
    cancelled = await db.mfa_recovery_requests.find_one_and_update(
        {"continuation_token_hash": hash_token(data.continuation_token), "user_id": user["user_id"],
         "status": {"$in": ["approved_hold", "authorization_issued"]}},
        {"$set": {"status": "revoked", "revoked_at": now_iso, "updated_at": now_iso}},
        return_document=ReturnDocument.AFTER,
    )
    if not cancelled:
        raise HTTPException(status_code=400, detail="Procedura non disponibile o già conclusa")
    await audit_event("2fa_recovery_revoked", user=user, request=request,
                      metadata={"request_id": cancelled["request_id"]})
    background_tasks.add_task(send_2fa_recovery_cancelled_notice, user["email"])
    return {"status": "revoked", "message": "Procedura di recupero annullata."}

@api_router.post("/auth/2fa/recovery/setup-totp")
async def setup_recovery_totp(
    data: TwoFactorRecoveryTotpSetupRequest,
    request: Request,
):
    """Prepare a replacement secret without changing the active authenticator."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_totp_setup", limit=3,
                             window_seconds=15 * 60, identifier=email)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    pending_secret = generate_totp_secret()
    now = datetime.now(timezone.utc)
    prepared = await db.mfa_recovery_requests.find_one_and_update(
        {"authorization_token_hash": hash_token(data.continuation_token), "user_id": user["user_id"],
         "status": "authorization_issued", "authorization_expires_at": {"$gt": now}},
        {"$set": {"status": "totp_setup_pending", "recovery_pending_totp_secret_enc": encrypt_totp_secret(pending_secret),
                  "totp_setup_started_at": now.isoformat(), "updated_at": now.isoformat()}},
        return_document=ReturnDocument.AFTER,
    )
    if not prepared:
        raise HTTPException(status_code=400, detail="Autorizzazione non valida, scaduta o già utilizzata")
    label = f"{TOTP_ISSUER}:{user['email']}"
    uri = (f"otpauth://totp/{label}?secret={pending_secret}&issuer={TOTP_ISSUER}"
           f"&algorithm=SHA1&digits=6&period={TOTP_STEP_SECONDS}")
    return {"otpauth_uri": uri, "secret": pending_secret,
            "message": "Configura il nuovo Authenticator e conferma il codice generato."}

@api_router.post("/auth/2fa/recovery/confirm-totp")
async def confirm_recovery_totp(
    data: TwoFactorRecoveryTotpConfirmRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Atomically replace TOTP only after the new code is proven valid."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(request, "auth_2fa_recovery_totp_confirm", limit=5,
                             window_seconds=15 * 60, identifier=email)
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if user.get("platform_role") == "super_admin":
        raise HTTPException(status_code=403, detail="Recupero automatico non disponibile per gli amministratori principali")
    recovery_request = await db.mfa_recovery_requests.find_one(
        {"authorization_token_hash": hash_token(data.continuation_token), "user_id": user["user_id"],
         "status": "totp_setup_pending", "authorization_expires_at": {"$gt": datetime.now(timezone.utc)}},
        {"_id": 0},
    )
    if not recovery_request:
        raise HTTPException(status_code=400, detail="Autorizzazione non valida, scaduta o già utilizzata")
    new_secret = decrypt_totp_secret(recovery_request["recovery_pending_totp_secret_enc"])
    if verify_totp_code(new_secret, data.code) is None:
        raise HTTPException(status_code=400, detail="Codice del nuovo Authenticator non valido")
    now = datetime.now(timezone.utc)
    locked = await db.mfa_recovery_requests.find_one_and_update(
        {"request_id": recovery_request["request_id"], "status": "totp_setup_pending",
         "authorization_expires_at": {"$gt": now}},
        {"$set": {"status": "completing", "updated_at": now.isoformat()}},
        return_document=ReturnDocument.AFTER,
    )
    if not locked:
        raise HTTPException(status_code=409, detail="Configurazione già in corso o conclusa")
    now_iso = now.isoformat()
    updated = await db.users.update_one(
        {"user_id": user["user_id"], "is_active": {"$ne": False}},
        {"$set": {"totp_secret_enc": encrypt_totp_secret(new_secret), "totp_enabled": True,
                  "totp_enabled_at": now_iso, "updated_at": now_iso},
         "$unset": {"totp_last_used_step": "", "totp_recovery_codes": "", "totp_recovery_codes_rotated_at": ""}},
    )
    if updated.modified_count != 1:
        await db.mfa_recovery_requests.update_one(
            {"request_id": recovery_request["request_id"], "status": "completing"},
            {"$set": {"status": "totp_setup_pending", "updated_at": now_iso}},
        )
        raise HTTPException(status_code=409, detail="Sostituzione non completata; il vecchio Authenticator resta attivo")
    await db.mfa_recovery_requests.update_one(
        {"request_id": recovery_request["request_id"], "status": "completing"},
        {"$set": {"status": "completed", "completed_at": now_iso, "updated_at": now_iso},
         "$unset": {"authorization_token_hash": "", "recovery_pending_totp_secret_enc": ""}},
    )
    await db.user_sessions.update_many(
        {"user_id": user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )
    await audit_event("2fa_recovery_totp_replaced", user=user, request=request,
                      metadata={"request_id": recovery_request["request_id"]})
    background_tasks.add_task(send_2fa_recovery_totp_replaced_notice, user["email"])
    return {"status": "completed",
            "email_delivery_configured": email_delivery_configured(),
            "production_ready": email_delivery_configured(),
            "message": "Authenticator sostituito. Esegui un nuovo login completo."}


async def require_mfa_enrollment_session(request: Request) -> Dict[str, Any]:
    """Confirm a still-valid, password-verified setup-only session.

    The password was verified at login. This session never grants access to
    tenant data or the dashboard; enrollment still requires a valid TOTP.
    """
    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Accedi per configurare MFA")
    session = await db.user_sessions.find_one(
        {"token_hash": hash_token(token), "session_type": "mfa_setup", "revoked_at": None},
        {"_id": 0},
    )
    if not session or _session_expired(session):
        raise HTTPException(status_code=401, detail="Sessione MFA scaduta. Effettua nuovamente l'accesso")
    return session


@api_router.post("/auth/2fa/setup")
async def setup_two_factor(
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    """Prepare TOTP after password login, within the restricted setup session."""
    await enforce_rate_limit(request, "auth_2fa_setup", limit=5, window_seconds=15 * 60,
                             identifier=current_user["user_id"])
    await require_mfa_enrollment_session(request)
    if current_user.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA già attivo")
    secret = generate_totp_secret()
    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {
            "totp_pending_secret_enc": encrypt_totp_secret(secret),
            "totp_pending_created_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    label = f"{TOTP_ISSUER}:{current_user['email']}"
    uri = (
        f"otpauth://totp/{label}?secret={secret}&issuer={TOTP_ISSUER}"
        f"&algorithm=SHA1&digits=6&period={TOTP_STEP_SECONDS}"
    )
    return {"secret": secret, "otpauth_uri": uri, "message": "Conferma con un codice dall'app di autenticazione."}


@api_router.post("/auth/2fa/confirm")
async def confirm_two_factor(
    data: TwoFactorVerifyRequest,
    request: Request,
    response: Response,
    current_user: Dict = Depends(get_current_user),
):
    await enforce_rate_limit(request, "auth_2fa_confirm", limit=5, window_seconds=15 * 60,
                             identifier=current_user["user_id"])
    setup_session = await require_mfa_enrollment_session(request)
    pending = current_user.get("totp_pending_secret_enc")
    if not pending:
        raise HTTPException(status_code=400, detail="Predisposizione 2FA non trovata")
    pending_created_raw = current_user.get("totp_pending_created_at")
    if not pending_created_raw:
        raise HTTPException(status_code=400, detail="Predisposizione 2FA scaduta")
    pending_created = parse_datetime(pending_created_raw)
    if pending_created + timedelta(minutes=TOTP_PENDING_MINUTES) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Predisposizione 2FA scaduta")
    secret = decrypt_totp_secret(pending)
    if verify_totp_code(secret, data.code) is None:
        raise HTTPException(status_code=400, detail="Codice 2FA non valido")
    now_iso = datetime.now(timezone.utc).isoformat()
    saved = await db.users.update_one(
        {"user_id": current_user["user_id"], "totp_pending_secret_enc": pending,
         "totp_enabled": {"$ne": True}},
        {"$set": {"totp_secret_enc": pending, "totp_enabled": True,
                  "totp_enabled_at": now_iso},
         "$unset": {"totp_pending_secret_enc": "", "totp_pending_created_at": "",
                    "totp_last_used_step": "", "totp_recovery_codes": "",
                    "totp_recovery_codes_rotated_at": ""}},
    )
    if saved.modified_count != 1:
        raise HTTPException(status_code=409, detail="Attivazione MFA non completata. Riprova.")
    await _start_recovery_contact_security_period(current_user["user_id"])
    await db.user_sessions.update_many(
        {"user_id": current_user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )
    await audit_event("2fa_enabled", user=current_user, request=request)
    # A first-time customer enrollment upgrades the setup-only session to a
    # normal MFA-verified session only after the server validates the code.
    # Existing authenticated users keep the historical behavior and must log
    # in again if their session was revoked by this operation.
    response_payload = {"enabled": True}
    if setup_session and setup_session.get("session_type") == "mfa_setup":
        refreshed_user = await _load_active_user(current_user["user_id"])
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": refreshed_user["user_id"]},
            {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
        )
        refreshed_user["last_login_at"] = now_iso
        access_token = await create_authenticated_session(refreshed_user, mfa_verified=True)
        set_session_cookie(response, access_token)
        response_payload["user"] = public_user(refreshed_user)
    return response_payload


@api_router.post("/auth/2fa/verify")
async def verify_two_factor(data: TwoFactorVerifyRequest, response: Response, request: Request):
    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Verifica 2FA richiesta")
    session = await db.user_sessions.find_one(
        {"token_hash": hash_token(token), "session_type": "mfa_pending", "revoked_at": None},
        {"_id": 0},
    )
    if not session or _session_expired(session):
        raise HTTPException(status_code=401, detail="Verifica 2FA scaduta")
    updated = await db.user_sessions.find_one_and_update(
        {"session_id": session["session_id"], "mfa_attempts": {"$lt": MFA_MAX_ATTEMPTS}},
        {"$inc": {"mfa_attempts": 1}}, return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=429, detail="Troppi tentativi 2FA")
    user = await _load_active_user(session["user_id"])
    if not await _consume_current_totp(user, data.code):
        raise HTTPException(status_code=401, detail="Codice 2FA non valido")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.user_sessions.update_one(
        {"session_id": session["session_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )
    user["last_login_at"] = now_iso
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_login_at": now_iso, "updated_at": now_iso}})
    access_token = await create_authenticated_session(user, mfa_verified=True)
    await audit_event("login", user=user, request=request, metadata={"mfa": True})
    set_session_cookie(response, access_token)
    return {"user": public_user(user)}


@api_router.post("/auth/2fa/disable")
async def disable_two_factor(
    data: TwoFactorConfirmRequest,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    if not current_user.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA non attivo")
    if not verify_password(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Riautenticazione richiesta")
    if not await _consume_current_totp(current_user, data.code):
        raise HTTPException(status_code=401, detail="Codice 2FA non valido")
    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"totp_enabled": False}, "$unset": {
            "totp_secret_enc": "", "totp_recovery_codes": "", "totp_last_used_step": "",
        }},
    )
    await audit_event("2fa_disabled", user=current_user, request=request)
    return {"enabled": False}

def calculate_tax(
    revenue: float,
    tax_regime: str,
    period: str = "monthly",
    fixed_expenses: float = 0,
    variable_expenses: float = 0,
) -> Dict[str, Any]:
    """Calculate estimated Italian taxes and the resulting operating cash flow."""
    if period not in FINANCE_PERIODS:
        raise ValueError("Periodo di calcolo non valido")
    if tax_regime not in TAX_REGIMES:
        raise ValueError("Regime fiscale non valido")
    if min(revenue, fixed_expenses, variable_expenses) < 0:
        raise ValueError("Fatturato e spese non possono essere negativi")

    # If monthly, we calculate monthly values and provide yearly projection
    yearly_revenue = revenue * 12 if period == "monthly" else revenue
    monthly_revenue = revenue if period == "monthly" else revenue / 12
    yearly_fixed_expenses = fixed_expenses * 12 if period == "monthly" else fixed_expenses
    yearly_variable_expenses = variable_expenses * 12 if period == "monthly" else variable_expenses
    
    irpef_yearly = 0.0
    inps_yearly = 0.0
    iva_yearly = 0.0
    
    if tax_regime == "forfettario_5":
        # Forfettario 5%: solo IRPEF sostitutiva 5%, INPS ridotto 24% sul 78% del fatturato
        irpef_yearly = yearly_revenue * 0.78 * 0.05  # 5% sul 78% del reddito
        inps_yearly = yearly_revenue * 0.78 * 0.2607  # 26.07% gestione separata sul 78%
        iva_yearly = 0  # Esente IVA
    elif tax_regime == "forfettario_15":
        # Forfettario 15%: IRPEF sostitutiva 15%, INPS 24% sul 78% del fatturato
        irpef_yearly = yearly_revenue * 0.78 * 0.15  # 15% sul 78% del reddito
        inps_yearly = yearly_revenue * 0.78 * 0.2607  # 26.07% gestione separata
        iva_yearly = 0  # Esente IVA
    elif tax_regime == "ordinario":
        # Regime ordinario: IRPEF progressiva + INPS + IVA
        # Calcolo IRPEF progressivo (semplificato, senza deduzioni)
        reddito_imponibile = yearly_revenue * 0.67  # Coefficiente redditività medio
        if reddito_imponibile <= 15000:
            irpef_yearly = reddito_imponibile * 0.23
        elif reddito_imponibile <= 28000:
            irpef_yearly = 15000 * 0.23 + (reddito_imponibile - 15000) * 0.25
        elif reddito_imponibile <= 50000:
            irpef_yearly = 15000 * 0.23 + 13000 * 0.25 + (reddito_imponibile - 28000) * 0.35
        else:
            irpef_yearly = 15000 * 0.23 + 13000 * 0.25 + 22000 * 0.35 + (reddito_imponibile - 50000) * 0.43
        
        inps_yearly = reddito_imponibile * 0.2607
        iva_yearly = yearly_revenue * 0.22  # IVA 22% da versare (semplificato)
    
    # Convert to the requested period
    if period == "monthly":
        irpef = irpef_yearly / 12
        inps = inps_yearly / 12
        iva = iva_yearly / 12
        total = irpef + inps + iva
        operating_expenses = fixed_expenses + variable_expenses
        total_outflows = total + operating_expenses
        net = monthly_revenue - total_outflows
        yearly_projection = {
            "irpef_amount": round(irpef_yearly, 2),
            "inps_amount": round(inps_yearly, 2),
            "iva_amount": round(iva_yearly, 2),
            "total_accrual": round(irpef_yearly + inps_yearly + iva_yearly, 2),
            "fixed_expenses": round(yearly_fixed_expenses, 2),
            "variable_expenses": round(yearly_variable_expenses, 2),
            "operating_expenses": round(yearly_fixed_expenses + yearly_variable_expenses, 2),
            "total_outflows": round(
                irpef_yearly + inps_yearly + iva_yearly + yearly_fixed_expenses + yearly_variable_expenses,
                2,
            ),
            "net_income": round(
                yearly_revenue
                - irpef_yearly
                - inps_yearly
                - iva_yearly
                - yearly_fixed_expenses
                - yearly_variable_expenses,
                2,
            )
        }
    else:
        irpef = irpef_yearly
        inps = inps_yearly
        iva = iva_yearly
        total = irpef + inps + iva
        operating_expenses = fixed_expenses + variable_expenses
        total_outflows = total + operating_expenses
        net = yearly_revenue - total_outflows
        yearly_projection = None
    
    return {
        "irpef_amount": round(irpef, 2),
        "inps_amount": round(inps, 2),
        "iva_amount": round(iva, 2),
        "total_accrual": round(total, 2),
        "fixed_expenses": round(fixed_expenses, 2),
        "variable_expenses": round(variable_expenses, 2),
        "operating_expenses": round(operating_expenses, 2),
        "total_outflows": round(total_outflows, 2),
        "net_income": round(net, 2),
        "yearly_projection": yearly_projection
    }

def build_cash_flow_forecast(
    revenue: float,
    tax_regime: str,
    period: str,
    fixed_expenses: float,
    variable_expenses: float,
    months: int = 12,
    start_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Build a monthly cash-flow forecast from the user's saved finance settings."""
    if months < 1:
        raise ValueError("Il numero di mesi deve essere positivo")

    monthly_revenue = revenue if period == "monthly" else revenue / 12
    monthly_fixed_expenses = fixed_expenses if period == "monthly" else fixed_expenses / 12
    monthly_variable_expenses = variable_expenses if period == "monthly" else variable_expenses / 12
    monthly_calculation = calculate_tax(
        monthly_revenue,
        tax_regime,
        "monthly",
        monthly_fixed_expenses,
        monthly_variable_expenses,
    )

    base_date = start_date or datetime.now(timezone.utc)
    monthly_outflows = monthly_calculation["total_outflows"]
    monthly_net_cash_flow = monthly_calculation["net_income"]
    forecast = []

    for month_offset in range(1, months + 1):
        month_index = base_date.year * 12 + (base_date.month - 1) + month_offset
        forecast_year, zero_based_month = divmod(month_index, 12)
        forecast_month = zero_based_month + 1
        forecast.append({
            "month": f"{forecast_year:04d}-{forecast_month:02d}",
            "inflows": round(monthly_revenue, 2),
            "fixed_expenses": round(monthly_fixed_expenses, 2),
            "variable_expenses": round(monthly_variable_expenses, 2),
            "taxes": monthly_calculation["total_accrual"],
            "outflows": monthly_outflows,
            "net_cash_flow": monthly_net_cash_flow,
            "cumulative_cash_flow": round(monthly_net_cash_flow * month_offset, 2),
        })

    return {
        "forecast": forecast,
        "summary": {
            "monthly_inflows": round(monthly_revenue, 2),
            "monthly_outflows": monthly_outflows,
            "monthly_net_cash_flow": monthly_net_cash_flow,
            "annual_inflows": round(monthly_revenue * 12, 2),
            "annual_outflows": round(monthly_outflows * 12, 2),
            "annual_net_cash_flow": round(monthly_net_cash_flow * 12, 2),
        },
    }

def validate_cash_plan_month(month: str) -> int:
    """Validate the YYYY-MM cash-plan key and return its year."""
    try:
        parsed_month = datetime.strptime(month, "%Y-%m")
    except (TypeError, ValueError) as error:
        raise ValueError("Il mese deve avere il formato YYYY-MM") from error
    if parsed_month.strftime("%Y-%m") != month:
        raise ValueError("Il mese deve avere il formato YYYY-MM")
    return parsed_month.year

def add_months_to_cash_plan(month: str, offset: int = 1) -> str:
    """Move a YYYY-MM key by an exact number of calendar months."""
    year = validate_cash_plan_month(month)
    month_number = int(month[5:7])
    month_index = year * 12 + month_number - 1 + offset
    target_year, zero_based_month = divmod(month_index, 12)
    return f"{target_year:04d}-{zero_based_month + 1:02d}"

def calculate_cash_plan_records(
    records: List[Dict[str, Any]],
    opening_balance: float,
) -> List[Dict[str, Any]]:
    """Calculate the bank and reserved-tax chain for chronological monthly records."""
    running_bank_balance = float(opening_balance)
    running_tax_reserve = 0.0
    calculated_records = []

    for original_record in sorted(records, key=lambda record: record["month"]):
        record = dict(original_record)
        revenue = float(record.get("revenue", 0))
        fixed_expenses = float(record.get("fixed_expenses", 0))
        variable_expenses = float(record.get("variable_expenses", 0))
        other_expenses = float(record.get("other_expenses", 0))
        taxes_paid = float(record.get("taxes_paid", 0))
        tax_regime = record.get("tax_regime", "forfettario_15")

        recommended_tax_reserve = calculate_tax(
            revenue,
            tax_regime,
            "monthly",
        )["total_accrual"]
        operating_expenses = fixed_expenses + variable_expenses + other_expenses
        real_outflows = operating_expenses + taxes_paid
        real_cash_flow = revenue - real_outflows
        closing_balance = running_bank_balance + real_cash_flow
        running_tax_reserve = max(
            0.0,
            running_tax_reserve + recommended_tax_reserve - taxes_paid,
        )
        available_liquidity = closing_balance - running_tax_reserve

        record.update({
            "opening_balance": round(running_bank_balance, 2),
            "operating_expenses": round(operating_expenses, 2),
            "real_outflows": round(real_outflows, 2),
            "real_cash_flow": round(real_cash_flow, 2),
            "recommended_tax_reserve": round(recommended_tax_reserve, 2),
            "reserved_tax_balance": round(running_tax_reserve, 2),
            "closing_balance": round(closing_balance, 2),
            "available_liquidity": round(available_liquidity, 2),
        })
        calculated_records.append(record)
        running_bank_balance = closing_balance

    return calculated_records

def build_cash_plan_summary(
    records: List[Dict[str, Any]],
    opening_balance: float,
    current_month: Optional[str] = None,
) -> Dict[str, Any]:
    """Create the four cash-plan KPIs plus the first gentle liquidity warning."""
    calculated_records = calculate_cash_plan_records(records, opening_balance)
    latest_record = calculated_records[-1] if calculated_records else None
    actual_records = [record for record in calculated_records if record.get("data_type") == "actual"]
    recent_revenues = [record["revenue"] for record in actual_records[-3:] if record["revenue"] > 0]
    average_revenue = sum(recent_revenues) / len(recent_revenues) if recent_revenues else 0
    critical_threshold = round(max(1000.0, average_revenue * 0.10), 2)
    reference_month = current_month or datetime.now(timezone.utc).strftime("%Y-%m")

    next_payment = next((
        {
            "month": record["month"],
            "amount": record["taxes_paid"],
        }
        for record in calculated_records
        if record.get("data_type") == "forecast"
        and record["month"] >= reference_month
        and record.get("taxes_paid", 0) > 0
    ), None)

    liquidity_warning = next((
        {
            "month": record["month"],
            "available_liquidity": record["available_liquidity"],
            "shortfall": round(
                abs(record["available_liquidity"])
                if record["available_liquidity"] < 0
                else critical_threshold - record["available_liquidity"],
                2,
            ),
            "critical_threshold": critical_threshold,
        }
        for record in calculated_records
        if record.get("data_type") == "forecast"
        and record["available_liquidity"] < critical_threshold
    ), None)

    return {
        "estimated_bank_balance": latest_record["closing_balance"] if latest_record else round(opening_balance, 2),
        "tax_reserve_to_keep": latest_record["reserved_tax_balance"] if latest_record else 0,
        "available_liquidity": latest_record["available_liquidity"] if latest_record else round(opening_balance, 2),
        "next_payment": next_payment,
        "critical_threshold": critical_threshold,
        "liquidity_warning": liquidity_warning,
    }

async def migrate_tax_accruals_to_cash_plan(current_user: Dict[str, Any]) -> None:
    """Copy compatible legacy accruals once, without deleting or changing source data."""
    company_id = current_user["company_id"]
    existing_records = await db.cash_plan_entries.find(
        {"company_id": company_id},
        {"_id": 0, "month": 1},
    ).to_list(240)
    existing_months = {record["month"] for record in existing_records}
    legacy_accruals = await db.tax_accruals.find(
        {"company_id": company_id},
        {"_id": 0},
    ).sort("month", 1).to_list(240)

    for accrual in legacy_accruals:
        month = accrual.get("month")
        if not month or month in existing_months:
            continue
        try:
            year = validate_cash_plan_month(month)
        except ValueError:
            continue

        now_iso = datetime.now(timezone.utc).isoformat()
        await db.cash_plan_entries.insert_one({
            "cash_plan_id": f"cash_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "user_id": current_user["user_id"],
            "month": month,
            "year": year,
            "data_type": "actual",
            "revenue": float(accrual.get("revenue", 0)),
            "fixed_expenses": 0,
            "variable_expenses": 0,
            "other_expenses": 0,
            "taxes_paid": 0,
            "tax_regime": accrual.get("tax_regime", current_user.get("tax_regime", "forfettario_15")),
            "notes": "Importato dallo storico accantonamenti",
            "created_at": accrual.get("created_at", now_iso),
            "updated_at": now_iso,
        })
        existing_months.add(month)

async def get_cash_plan_opening_balance(company_id: str) -> float:
    settings = await db.cash_plan_settings.find_one(
        {"company_id": company_id},
        {"_id": 0, "opening_balance": 1},
    )
    return float(settings.get("opening_balance", 0)) if settings else 0.0

async def get_cash_plan_recurring_defaults(company_id: str) -> Dict[str, float]:
    """Reuse compatible values already saved by the existing finance calculator."""
    settings = await db.finance_settings.find_one(
        {"company_id": company_id},
        {"_id": 0},
    )
    if not settings:
        return {"revenue": 0, "fixed_expenses": 0, "variable_expenses": 0}

    divisor = 12 if settings.get("period") == "yearly" else 1
    return {
        "revenue": round(float(settings.get("revenue", 0)) / divisor, 2),
        "fixed_expenses": round(float(settings.get("fixed_expenses", 0)) / divisor, 2),
        "variable_expenses": round(float(settings.get("variable_expenses", 0)) / divisor, 2),
    }

async def recalculate_user_cash_plan(company_id: str) -> List[Dict[str, Any]]:
    """Recalculate and persist all derived values while preserving chronological chaining."""
    records = await db.cash_plan_entries.find(
        {"company_id": company_id},
        {"_id": 0},
    ).sort("month", 1).to_list(240)
    opening_balance = await get_cash_plan_opening_balance(company_id)
    calculated_records = calculate_cash_plan_records(records, opening_balance)

    derived_fields = {
        "opening_balance",
        "operating_expenses",
        "real_outflows",
        "real_cash_flow",
        "recommended_tax_reserve",
        "reserved_tax_balance",
        "closing_balance",
        "available_liquidity",
    }
    for record in calculated_records:
        await db.cash_plan_entries.update_one(
            {"cash_plan_id": record["cash_plan_id"], "company_id": company_id},
            {"$set": {field: record[field] for field in derived_fields}},
        )

    return calculated_records

def calculate_job_profitability(quote: float, hours: float, materials: float, waste_pct: float) -> Dict[str, float]:
    """Calculate job profitability metrics"""
    total_materials = materials * (1 + waste_pct)
    net_profit = quote - total_materials
    profit_margin = (net_profit / quote * 100) if quote > 0 else 0
    hourly_rate = (net_profit / hours) if hours > 0 else 0
    
    return {
        "net_profit": round(net_profit, 2),
        "profit_margin": round(profit_margin, 2),
        "hourly_rate": round(hourly_rate, 2)
    }

def get_tax_deadlines_by_regime(tax_regime: str) -> List[Dict[str, Any]]:
    """Get Italian tax deadlines based on tax regime"""
    today = datetime.now(timezone.utc)
    year = today.year
    next_year = year + 1
    
    # Common deadlines for all regimes
    common_deadlines = []
    
    if tax_regime in ["forfettario_5", "forfettario_15"]:
        # Forfettario: semplificazioni fiscali
        all_deadlines = [
            {"date": f"16/03/{year}", "description": "Versamento saldo IVA (se dovuto anno prec.)", "regime": "forfettario"},
            {"date": f"30/06/{year}", "description": "Saldo imposta sostitutiva anno precedente + 1° acconto", "regime": "forfettario"},
            {"date": f"16/06/{year}", "description": "Versamento 1° acconto INPS", "regime": "forfettario"},
            {"date": f"30/09/{year}", "description": "Versamento 2° acconto INPS", "regime": "forfettario"},
            {"date": f"30/11/{year}", "description": "Versamento 2° acconto imposta sostitutiva", "regime": "forfettario"},
            {"date": f"16/11/{year}", "description": "Versamento 3° acconto INPS", "regime": "forfettario"},
            {"date": f"28/02/{next_year}", "description": "Versamento saldo INPS anno precedente", "regime": "forfettario"},
            {"date": f"30/06/{next_year}", "description": "Saldo imposta sostitutiva + 1° acconto", "regime": "forfettario"},
        ]
    else:
        # Regime ordinario: più scadenze
        all_deadlines = [
            {"date": f"16/01/{year}", "description": "Versamento IVA dicembre (mensile) o 4° trim.", "regime": "ordinario"},
            {"date": f"16/02/{year}", "description": "Versamento IVA gennaio (mensile)", "regime": "ordinario"},
            {"date": f"16/03/{year}", "description": "Versamento IVA febbraio + saldo IVA annuale", "regime": "ordinario"},
            {"date": f"16/04/{year}", "description": "Versamento IVA marzo o 1° trim.", "regime": "ordinario"},
            {"date": f"16/05/{year}", "description": "Versamento IVA aprile (mensile)", "regime": "ordinario"},
            {"date": f"30/06/{year}", "description": "Saldo IRPEF/IRES + 1° acconto + Saldo INPS", "regime": "ordinario"},
            {"date": f"16/07/{year}", "description": "Versamento IVA giugno o 2° trim.", "regime": "ordinario"},
            {"date": f"20/08/{year}", "description": "Versamento IVA luglio (con maggiorazione)", "regime": "ordinario"},
            {"date": f"16/09/{year}", "description": "Versamento IVA agosto", "regime": "ordinario"},
            {"date": f"16/10/{year}", "description": "Versamento IVA settembre o 3° trim.", "regime": "ordinario"},
            {"date": f"16/11/{year}", "description": "Versamento IVA ottobre + 3° acconto INPS", "regime": "ordinario"},
            {"date": f"30/11/{year}", "description": "Versamento 2° acconto IRPEF/IRES", "regime": "ordinario"},
            {"date": f"27/12/{year}", "description": "Acconto IVA", "regime": "ordinario"},
            {"date": f"16/01/{next_year}", "description": "Versamento IVA dicembre o 4° trim.", "regime": "ordinario"},
        ]
    
    upcoming = []
    for deadline in all_deadlines:
        parts = deadline["date"].split("/")
        deadline_date = datetime(int(parts[2]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
        days_until = (deadline_date - today).days
        if days_until >= 0 and days_until <= 120:
            upcoming.append({
                "date": deadline["date"],
                "description": deadline["description"],
                "days_until": days_until,
                "urgency": "red" if days_until <= 15 else "yellow" if days_until <= 30 else "green"
            })
    
    return sorted(upcoming, key=lambda x: x["days_until"])[:8]

# ==================== EMAIL HELPER FUNCTIONS ====================

async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send email, or save it privately in the local-only outbox."""
    if APP_ENV == "local":
        outbox = Path(os.environ.get("LOCAL_OUTBOX_DIR", ROOT_DIR.parent / ".local/outbox"))
        outbox.mkdir(parents=True, exist_ok=True, mode=0o700)
        import json
        fd = os.open(outbox / f"{uuid.uuid4().hex}.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump({"to": to_email, "subject": subject, "html": html_content}, stream)
        return True
    if not RESEND_ENABLED:
        return False
    if not to_email or not RESEND_API_KEY or not RESEND_FROM_EMAIL:
        logger.warning("Resend email configuration or recipient is missing, skipping email")
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": RESEND_FROM_EMAIL,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                },
                timeout=30.0,
            )
            if response.status_code in [200, 201, 202]:
                logger.info("Transactional email accepted by Resend")
                return True
            else:
                logger.error("Resend returned HTTP %s", response.status_code)
                return False
    except Exception as e:
        logger.error("Email delivery failed (%s)", type(e).__name__)
        return False


# Kept as a compatibility alias so existing authentication, recovery and
# notification call sites continue to use the same single email adapter.
send_email_sendgrid = send_email

async def send_registration_notification(user_email: str, business_name: str, registration_date: str):
    """Send notification email to admin when a new user registers"""
    safe_business_name = html.escape(business_name)
    safe_user_email = html.escape(user_email)
    safe_registration_date = html.escape(registration_date)
    subject = f"Nuova registrazione BESIDE: {business_name[:100]}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Barlow', Arial, sans-serif; color: #1e3a5f; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
            .field {{ margin-bottom: 15px; }}
            .label {{ font-weight: bold; color: #64748b; font-size: 12px; text-transform: uppercase; }}
            .value {{ font-size: 16px; color: #1e3a5f; margin-top: 4px; }}
            .footer {{ text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Nuova Registrazione</h1>
                <p style="margin: 5px 0 0;">Un nuovo installatore si è registrato su BESIDE</p>
            </div>
            <div class="content">
                <div class="field">
                    <div class="label">Nome Attività</div>
                    <div class="value">{safe_business_name}</div>
                </div>
                <div class="field">
                    <div class="label">Email</div>
                    <div class="value">{safe_user_email}</div>
                </div>
                <div class="field">
                    <div class="label">Data Registrazione</div>
                    <div class="value">{safe_registration_date}</div>
                </div>
            </div>
            <div class="footer">
                <p>BESIDE - Gestione Installatori PPF & Wrap</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return await send_email_sendgrid(ADMIN_NOTIFICATION_EMAIL, subject, html_content)


async def send_welcome_email(user_email: str, business_name: str) -> bool:
    """Send the registrant a welcome message through the shared email adapter."""
    safe_business_name = html.escape(business_name)
    return await send_email(
        user_email,
        "Benvenuto in BESIDE",
        (
            f"<p>Benvenuto in BESIDE, {safe_business_name}.</p>"
            "<p>Il tuo account è stato creato. Completa la verifica dell'indirizzo email "
            "seguendo il messaggio ricevuto.</p>"
        ),
    )

async def send_email_verification(user_email: str, token: str) -> bool:
    verification_url = f"{PUBLIC_APP_URL}/verify-email?token={token}"
    return await send_email_sendgrid(
        user_email,
        "Verifica il tuo indirizzo email BESIDE",
        (
            "<p>Conferma il tuo indirizzo email per BESIDE.</p>"
            f'<p><a href="{verification_url}">Verifica email</a></p>'
            "<p>Il link scade tra 24 ore e può essere usato una sola volta.</p>"
        ),
    )

async def send_recovery_email_verification(user_email: str, token: str) -> bool:
    verification_url = f"{FRONTEND_PUBLIC_URL}/verify-recovery-email?token={token}"
    return await send_email_sendgrid(
        user_email,
        "Configura l'email di recupero BESIDE",
        (
            "<p>È stata richiesta la configurazione di questo indirizzo come email di recupero BESIDE.</p>"
            f'<p><a href="{verification_url}">Conferma email di recupero</a></p>'
            f"<p>Il link scade tra {RECOVERY_EMAIL_TOKEN_HOURS} ora ed è monouso.</p>"
        ),
    )

async def send_recovery_email_security_notice(primary_email: str, recovery_email: str) -> bool:
    safe_recovery_email = html.escape(recovery_email)
    return await send_email_sendgrid(
        primary_email,
        "Modifica della sicurezza dell'account BESIDE",
        (
            "<p>È stata richiesta la configurazione di un'email secondaria di recupero.</p>"
            f"<p>Indirizzo interessato: {safe_recovery_email}</p>"
            "<p>Se non sei stato tu, accedi al tuo account e contatta il supporto.</p>"
        ),
    )

async def send_recovery_contact_invite(contact_email: str, token: str) -> bool:
    invite_url = f"{FRONTEND_PUBLIC_URL}/recovery-contact/accept?token={token}"
    return await send_email_sendgrid(
        contact_email,
        "Invito come contatto fidato BESIDE",
        (
            "<p>Una persona ti ha invitato come contatto fidato Beside.</p>"
            f'<p><a href="{html.escape(invite_url, quote=True)}">Rivedi e accetta l\'invito</a></p>'
            "<p>Non serve aprire un account Beside, né comunicare password o codici personali.</p>"
            f"<p>Il link scade tra {RECOVERY_CONTACT_INVITE_HOURS} ore. "
            f"Il contatto potrà aiutare nel recupero solo dopo {RECOVERY_CONTACT_SECURITY_DAYS} giorni.</p>"
        ),
    )


async def send_recovery_contact_approval_email(
    contact_email: str, approval_token: str,
) -> bool:
    url = f"{FRONTEND_PUBLIC_URL}/recovery-2fa/approve?token={approval_token}"
    return await send_email_sendgrid(
        contact_email,
        "Conferma una richiesta di recupero BESIDE",
        (
            "<p>È stato richiesto il tuo aiuto come contatto fidato Beside.</p>"
            "<p>Approva soltanto se hai parlato con la persona che conosci e "
            "ti ha comunicato un numero temporaneo di 8 cifre.</p>"
            f'<p><a href="{html.escape(url, quote=True)}">Verifica la richiesta</a></p>'
            "<p>Non servono password, account Beside o codici Authenticator. "
            "Il link è monouso e scade dopo 15 minuti. "
            "Se non riconosci la richiesta, ignorala.</p>"
        ),
    )

async def send_recovery_contact_notice(primary_email: str, contact_email: str, event: str) -> bool:
    safe_contact = html.escape(contact_email)
    labels = {
        "invited": "È stato inviato un invito a un nuovo contatto fidato.",
        "accepted": "Il contatto fidato ha accettato l'invito.",
        "linked": "Il contatto fidato ha completato l'associazione del proprio account.",
        "revoked": "Il contatto fidato è stato revocato.",
    }
    return await send_email_sendgrid(
        primary_email,
        "Modifica contatto fidato BESIDE",
        f"<p>{labels.get(event, 'È cambiata la configurazione del contatto fidato.')}</p><p>Indirizzo: {safe_contact}</p>",
    )

async def send_2fa_recovery_started_notice(user_email: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Richiesta di recupero 2FA BESIDE",
        "<p>È stata avviata una richiesta di recupero dell'autenticazione a due fattori.</p>"
        "<p>La richiesta scade tra 15 minuti e non modifica ancora il tuo 2FA.</p>",
    )

async def send_2fa_recovery_approved_notice(user_email: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Approvazione recupero 2FA BESIDE",
        "<p>Il tuo contatto fidato ha approvato la richiesta di recupero 2FA.</p>"
        "<p>Il secondo fattore non è stato disattivato né sostituito.</p>",
    )

async def send_2fa_recovery_usable_notice(user_email: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Recupero 2FA pronto per la configurazione",
        "<p>Il periodo di sicurezza della richiesta di recupero 2FA è terminato.</p>"
        "<p>È disponibile solo un'autorizzazione temporanea per configurare un nuovo TOTP.</p>",
    )

async def send_2fa_recovery_cancelled_notice(user_email: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Recupero 2FA annullato",
        "<p>La procedura di recupero 2FA è stata annullata tramite una verifica forte.</p>",
    )

async def send_2fa_recovery_totp_replaced_notice(user_email: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Authenticator BESIDE sostituito",
        "<p>Il vecchio Authenticator è stato sostituito dopo una procedura di recupero autorizzata.</p>"
        "<p>Tutte le sessioni precedenti sono state revocate: esegui un nuovo accesso completo.</p>",
    )

def email_delivery_configured() -> bool:
    return APP_ENV == "local" or bool(
        RESEND_ENABLED and RESEND_API_KEY and RESEND_FROM_EMAIL
    )

async def send_password_reset_email(user_email: str, token: str) -> bool:
    reset_url = f"{FRONTEND_PUBLIC_URL}/reset-password?token={token}"
    return await send_email_sendgrid(
        user_email,
        "Reimposta la password BESIDE",
        (
            "<p>È stata richiesta la reimpostazione della password BESIDE.</p>"
            f'<p><a href="{reset_url}">Scegli una nuova password</a></p>'
            f"<p>Il link scade tra {PASSWORD_RESET_TOKEN_MINUTES} minuti, è monouso e "
            "può essere ignorato se non hai effettuato tu la richiesta.</p>"
        ),
    )

async def send_admin_mfa_activation_email(user_email: str, code: str) -> bool:
    return await send_email_sendgrid(
        user_email,
        "Configura l'autenticazione a due fattori BESIDE",
        (
            "<p>È stata richiesta la prima configurazione MFA del tuo account amministratore.</p>"
            f"<p>Codice di attivazione: <strong>{html.escape(code)}</strong></p>"
            "<p>Il codice scade tra 10 minuti, è monouso e non sostituisce il codice TOTP.</p>"
        ),
    )

async def create_one_time_token(
    collection: Any,
    user: Dict[str, Any],
    lifetime: timedelta,
) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await collection.insert_one({
        "token_id": f"token_{uuid.uuid4().hex[:16]}",
        "token_hash": hash_token(token),
        "user_id": user["user_id"],
        "company_id": user["company_id"],
        "created_at": now.isoformat(),
        "expires_at": (now + lifetime).isoformat(),
        "expires_at_dt": now + lifetime,
        "used_at": None,
    })
    return token

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate, background_tasks: BackgroundTasks, request: Request):
    """Register a new user with email/password"""
    await enforce_rate_limit(request, "auth_register", limit=5, window_seconds=3600)
    if not user_data.terms_accepted:
        raise HTTPException(status_code=422, detail="È necessario accettare i Termini e condizioni")
    validate_password_strength(user_data.password)
    email = normalize_email(str(user_data.email))
    if BETA_MODE_ENABLED and (not BETA_ALLOWED_EMAILS or email not in BETA_ALLOWED_EMAILS):
        raise HTTPException(status_code=403, detail="Registrazione beta riservata")
    business_name = user_data.business_name.strip()
    if not business_name:
        raise HTTPException(status_code=400, detail="Nome attività richiesto")
    if user_data.tax_regime is not None and user_data.tax_regime not in TAX_REGIMES and user_data.tax_regime not in {"non_so", "preferisco_non_rispondere"}:
        raise HTTPException(status_code=400, detail="Regime fiscale non valido")
    if user_data.legal_form in {"societa_persone", "societa_capitali"} and user_data.tax_regime in {"forfettario_5", "forfettario_15"}:
        raise HTTPException(status_code=422, detail="Regime fiscale non compatibile con la forma giuridica")
    if not set(user_data.services).issubset({"ppf", "wrap", "tint", "upholstery"}):
        raise HTTPException(status_code=400, detail="Servizio non valido")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    now_formatted = now.strftime("%d/%m/%Y alle %H:%M")

    company_doc = {
        "company_id": company_id,
        "name": business_name,
        "owner_user_id": user_id,
        "status": "active",
        "subscription_status": "trialing",
        "trial_started_at": now_iso,
        "trial_ends_at": (now + timedelta(days=7)).isoformat(),
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "plan_id": "essential",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    user_doc = {
        "user_id": user_id,
        "company_id": company_id,
        "email": email,
        "password_hash": hash_password(user_data.password),
        "first_name": user_data.first_name,
        "full_name": user_data.first_name,
        "business_name": business_name,
        "team_size": user_data.team_size,
        "services": user_data.services,
        "tax_regime": user_data.tax_regime or "forfettario_15",
        "business_info": {},
        "subscription_tier": "essential",
        "subscription_status": "trial",
        "role": "owner",
        "is_active": True,
        "email_verified": False,
        "email_verification_exempt": False,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_login_at": None,
        "legal_consents": {
            "terms": {"accepted": True, "version": TERMS_VERSION, "accepted_at": now_iso},
            "privacy_notice": {"version": PRIVACY_NOTICE_VERSION, "acknowledged_at": now_iso},
        },
        "marketing_preferences": {
            "email_opt_in": bool(user_data.marketing_emails_opt_in),
            "profiling_opt_in": bool(user_data.marketing_profiling_opt_in),
            "version": CONSENT_VERSION,
            "updated_at": now_iso,
        },
    }
    if user_data.onboarding_complete:
        user_doc["onboarding_profile"] = {
            "first_name": user_data.first_name,
            "last_name": user_data.last_name,
            "role": user_data.role,
            "location_general": user_data.location_general,
            "step": 3,
        }
        company_doc["onboarding_profile"] = {
            key: value for key, value in {
                "business_status": user_data.business_status,
                "legal_form": user_data.legal_form,
                "tax_regime": user_data.tax_regime,
                "sector": user_data.sector,
                "customer_type": user_data.customer_type,
                "revenue_band": user_data.revenue_band,
                "employees_band": user_data.employees_band,
                "needs": user_data.needs,
                "interested_modules": user_data.interested_modules,
                "monthly_quotes_band": user_data.monthly_quotes_band,
                "step": 3,
            }.items() if value is not None
        }
        user_doc["onboarding_completed_at"] = now_iso

    await reserve_email_claim(email, user_id, company_id)
    try:
        await db.companies.insert_one(company_doc)
        await db.users.insert_one(user_doc)
    except DuplicateKeyError:
        # A concurrent registration won the unique-email race. Remove only the
        # company created by this request, leaving existing data untouched.
        await db.companies.delete_one({"company_id": company_id, "owner_user_id": user_id})
        await release_email_claim(email, user_id)
        raise HTTPException(status_code=400, detail="Email già registrata")
    except Exception:
        await db.companies.delete_one({"company_id": company_id, "owner_user_id": user_id})
        await release_email_claim(email, user_id)
        raise
    verification_token = await create_one_time_token(
        db.email_verification_tokens,
        user_doc,
        timedelta(hours=EMAIL_VERIFICATION_TOKEN_HOURS),
    )
    await audit_event("registration", user=user_doc, request=request)

    background_tasks.add_task(
        send_registration_notification,
        email,
        business_name,
        now_formatted,
    )
    background_tasks.add_task(send_welcome_email, email, business_name)
    background_tasks.add_task(send_email_verification, email, verification_token)

    return {
        "user_id": user_id,
        "company_id": company_id,
        "email": email,
        "business_name": business_name,
        "trial_started_at": company_doc["trial_started_at"],
        "trial_ends_at": company_doc["trial_ends_at"],
        "subscription_status": "trialing",
        "email_verification_required": EMAIL_VERIFICATION_REQUIRED,
        "message": "Registrazione completata. Controlla la tua email per verificare l'account."
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    """Login with email/password"""
    email = normalize_email(str(user_data.email))
    if BETA_MODE_ENABLED and BETA_ALLOWED_EMAILS and email not in BETA_ALLOWED_EMAILS and email != normalize_email(ADMIN_EMAIL):
        raise HTTPException(status_code=403, detail="Accesso beta riservato")
    await enforce_rate_limit(
        request,
        "auth_login_email",
        limit=10,
        window_seconds=15 * 60,
        identifier=email,
    )
    await enforce_rate_limit(request, "auth_login_ip", limit=30, window_seconds=15 * 60)
    if email == normalize_email(ADMIN_EMAIL):
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    try:
        password_valid = verify_password(user_data.password, user.get("password_hash", ""))
    except (TypeError, ValueError):
        password_valid = False
    if not password_valid:
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    if email_verification_blocks_access(user):
        # Password verification has already succeeded. Return a non-authenticated
        # application state so the client can resume the pending email step
        # without creating a session or revealing account existence beforehand.
        return {
            "status": "EMAIL_VERIFICATION_REQUIRED",
            "email_verification_required": True,
            "email": email,
            "message": "Devi ancora verificare il tuo indirizzo email. Controlla la posta elettronica per completare la registrazione",
        }

    if user.get("role") == RECOVERY_CONTACT_ROLE and not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="Verifica l'email prima di accedere")

    user = await _load_active_user(user["user_id"])
    if user.get("totp_enabled"):
        pending_token = await create_mfa_pending_session(user)
        set_session_cookie(response, pending_token)
        await audit_event("login_password_verified", user=user, request=request, metadata={"mfa_required": True})
        return {"mfa_required": True, "expires_in": MFA_SESSION_MINUTES * 60}
    # Password verification alone is never enough for a customer account.
    # Issue only a short-lived enrollment session until the first TOTP code is
    # confirmed; dashboard and tenant APIs remain inaccessible in this state.
    setup_token = await create_mfa_setup_session(user)
    set_session_cookie(response, setup_token)
    await audit_event("login_password_verified", user=user, request=request,
                      metadata={"mfa_setup_required": True})
    return {"mfa_setup_required": True, "expires_in": MFA_SESSION_MINUTES * 60}

@api_router.post("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Process Google OAuth session_id and create local session"""
    await enforce_rate_limit(request, "auth_oauth", limit=10, window_seconds=15 * 60)
    if not EXTERNAL_SERVICES_ENABLED or not OAUTH_SESSION_URL:
        raise HTTPException(status_code=503, detail="Accesso Google non configurato")
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id richiesto")
    
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get(
            OAUTH_SESSION_URL,
            headers={"X-Session-ID": session_id}
        )
        
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Sessione Google non valida")
        
        google_data = resp.json()
    
    email = normalize_email(google_data.get("email", ""))
    name = google_data.get("name")
    picture = google_data.get("picture")
    session_token = google_data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Sessione Google incompleta")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    created_new_user = user is None
    if user:
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "name": name,
                "full_name": name or user.get("full_name", ""),
                "picture": picture,
                "email_verified": True,
                "email_verification_exempt": False,
            }}
        )
        user_id = user["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        await reserve_email_claim(email, user_id, company_id)
        company_doc = {
            "company_id": company_id,
            "name": name or "La Mia Attività",
            "owner_user_id": user_id,
            "status": "active",
            "subscription_status": "trialing",
            "trial_started_at": now,
            "trial_ends_at": (now_dt + timedelta(days=7)).isoformat(),
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "plan_id": "essential",
            "created_at": now,
            "updated_at": now,
        }
        user_doc = {
            "user_id": user_id,
            "company_id": company_id,
            "email": email,
            "name": name,
            "full_name": name or "",
            "picture": picture,
            "business_name": name or "La Mia Attività",
            "team_size": 1,
            "services": [],
            "tax_regime": "forfettario_15",
            "business_info": {},
            "subscription_tier": "essential",
            "subscription_status": "trial",
            "role": "owner",
            "is_active": True,
            "email_verified": True,
            "email_verification_exempt": False,
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        }
        try:
            await db.companies.insert_one(company_doc)
            await db.users.insert_one(user_doc)
        except DuplicateKeyError:
            await db.companies.delete_one({"company_id": company_id, "owner_user_id": user_id})
            await release_email_claim(email, user_id)
            raise HTTPException(status_code=409, detail="Account già in creazione; riprova")
        except Exception:
            await db.companies.delete_one({"company_id": company_id, "owner_user_id": user_id})
            await release_email_claim(email, user_id)
            raise
        user = user_doc

    user = await _load_active_user(user_id)
    if user.get("totp_enabled"):
        pending_token = await create_mfa_pending_session(user)
        set_session_cookie(response, pending_token)
        await audit_event("login_password_verified", user=user, request=request,
                          metadata={"provider": "oauth", "mfa_required": True})
        return {"mfa_required": True, "expires_in": MFA_SESSION_MINUTES * 60}
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_id": f"session_{uuid.uuid4().hex[:16]}",
        "user_id": user_id,
        "company_id": user["company_id"],
        "token_hash": hash_token(session_token),
        "session_type": "oauth",
        "expires_at": expires_at.isoformat(),
        "expires_at_dt": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "revoked_at": None,
    })
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id, "company_id": user["company_id"]},
        {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
    )
    if created_new_user:
        await audit_event("registration", user=user, request=request, metadata={"provider": "oauth"})
    await audit_event("login", user=user, request=request, metadata={"provider": "oauth"})

    set_session_cookie(response, session_token)
    
    return {"user": public_user(user)}

@api_router.get("/auth/me")
async def get_current_user_info(current_user: Dict = Depends(get_current_user)):
    """Get current authenticated user info"""
    return public_user(current_user)

@api_router.put("/auth/profile")
async def update_profile(
    update_data: UserUpdate,
    current_user: Dict = Depends(require_company_roles("owner", "admin")),
):
    """Update user profile"""
    update_fields = {}
    
    if update_data.business_name is not None:
        update_fields["business_name"] = update_data.business_name
        await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": {"name": update_data.business_name, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    if update_data.team_size is not None:
        update_fields["team_size"] = update_data.team_size
    if update_data.services is not None:
        update_fields["services"] = update_data.services
    if update_data.tax_regime is not None:
        update_fields["tax_regime"] = update_data.tax_regime
    if update_data.business_info is not None:
        update_fields["business_info"] = update_data.business_info.model_dump()
    if update_data.marketing_emails_opt_in is not None or update_data.marketing_profiling_opt_in is not None:
        preferences = (current_user.get("marketing_preferences") or {}).copy()
        if update_data.marketing_emails_opt_in is not None:
            preferences["email_opt_in"] = update_data.marketing_emails_opt_in
        if update_data.marketing_profiling_opt_in is not None:
            preferences["profiling_opt_in"] = update_data.marketing_profiling_opt_in
        preferences.update({"version": CONSENT_VERSION, "updated_at": datetime.now(timezone.utc).isoformat()})
        update_fields["marketing_preferences"] = preferences
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": current_user["user_id"], "company_id": current_user["company_id"]},
            {"$set": update_fields}
        )

    updated_user = await _load_active_user(current_user["user_id"])
    return public_user(updated_user)

@api_router.put("/auth/privacy-preferences")
async def update_privacy_preferences(
    preferences: PrivacyPreferencesUpdate,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": current_user["user_id"], "company_id": current_user["company_id"]},
        {"$set": {"marketing_preferences": {
            "email_opt_in": preferences.email_opt_in,
            "profiling_opt_in": preferences.profiling_opt_in,
            "version": CONSENT_VERSION,
            "updated_at": now_iso,
        }}},
    )
    await audit_event("privacy_preferences_updated", user=current_user, request=request,
                      metadata={"email_opt_in": preferences.email_opt_in, "profiling_opt_in": preferences.profiling_opt_in})
    return {"marketing_preferences": {
        "email_opt_in": preferences.email_opt_in,
        "profiling_opt_in": preferences.profiling_opt_in,
        "version": CONSENT_VERSION,
        "updated_at": now_iso,
    }}

@api_router.post("/auth/recovery-email/setup")
async def setup_recovery_email(
    data: RecoveryEmailSetupRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    """Start secondary-email enrollment; this never changes MFA state."""
    await enforce_rate_limit(request, "auth_recovery_email_setup", limit=3,
                             window_seconds=60 * 60, identifier=current_user["user_id"])
    target_email = normalize_email(str(data.email))
    if target_email == normalize_email(current_user["email"]):
        raise HTTPException(status_code=400, detail="L'email di recupero deve essere diversa da quella principale")
    if not verify_password(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Riautenticazione richiesta")
    if current_user.get("totp_enabled"):
        if not data.code or not await _consume_current_totp(current_user, data.code):
            raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")
    occupied = await db.users.find_one(
        {"recovery_email": target_email, "user_id": {"$ne": current_user["user_id"]}},
        {"_id": 1},
    )
    if occupied:
        raise HTTPException(status_code=400, detail="Email di recupero già associata a un account")
    now = datetime.now(timezone.utc)
    await db.email_recovery_tokens.update_many(
        {"user_id": current_user["user_id"], "used_at": None},
        {"$set": {"used_at": now.isoformat(), "invalidated_reason": "replaced"}},
    )
    token = secrets.token_urlsafe(32)
    await db.email_recovery_tokens.insert_one({
        "token_id": f"recovery_email_{uuid.uuid4().hex[:16]}",
        "token_hash": hash_token(token),
        "user_id": current_user["user_id"],
        "company_id": current_user["company_id"],
        "recovery_email": target_email,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=RECOVERY_EMAIL_TOKEN_HOURS)).isoformat(),
        "expires_at_dt": now + timedelta(hours=RECOVERY_EMAIL_TOKEN_HOURS),
        "used_at": None,
    })
    background_tasks.add_task(send_recovery_email_verification, target_email, token)
    background_tasks.add_task(send_recovery_email_security_notice, current_user["email"], target_email)
    return {"message": "Controlla l'email secondaria per completare la verifica."}

@api_router.post("/auth/recovery-email/verify")
async def verify_recovery_email(
    data: RecoveryEmailVerifyRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    await enforce_rate_limit(request, "auth_recovery_email_verify", limit=10,
                             window_seconds=60 * 60)
    now_iso = datetime.now(timezone.utc).isoformat()
    token_doc = await db.email_recovery_tokens.find_one_and_update(
        {"token_hash": hash_token(data.token), "used_at": None,
         "expires_at": {"$gt": now_iso}},
        {"$set": {"used_at": now_iso}},
        return_document=ReturnDocument.AFTER,
    )
    if not token_doc:
        raise HTTPException(status_code=400, detail="Link non valido, già usato o scaduto")
    user = await db.users.find_one({"user_id": token_doc["user_id"], "is_active": {"$ne": False}}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Account non disponibile")
    occupied = await db.users.find_one(
        {"recovery_email": token_doc["recovery_email"], "user_id": {"$ne": user["user_id"]}},
        {"_id": 1},
    )
    if occupied:
        raise HTTPException(status_code=400, detail="Email di recupero già associata a un account")
    try:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"recovery_email": token_doc["recovery_email"],
                      "recovery_email_verified": True,
                      "recovery_email_verified_at": now_iso,
                      "updated_at": now_iso}},
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email di recupero già associata a un account")
    background_tasks.add_task(
        send_recovery_email_security_notice,
        user["email"],
        token_doc["recovery_email"],
    )
    await audit_event("recovery_email_verified", user=user, request=request)
    return {"message": "Email di recupero verificata."}

async def _refresh_recovery_contact_status(contact: Dict[str, Any]) -> Dict[str, Any]:
    """Promote email-verified contacts without requiring an account.

    Legacy accepted invitations can begin the hold without re-registering or
    disclosing the contact's password.
    """
    if (contact.get("status") == "verified" and contact.get("accepted_at")
            and contact.get("contact_verified_at")):
        now = datetime.now(timezone.utc)
        updated = await db.recovery_contacts.find_one_and_update(
            {"contact_id": contact["contact_id"], "status": "verified",
             "accepted_at": {"$exists": True}, "contact_verified_at": {"$exists": True}},
            {"$set": {"status": "security_period", "verification_method": "email_link",
                      "security_period_ends_at": (now + timedelta(days=RECOVERY_CONTACT_SECURITY_DAYS)).isoformat(),
                      "updated_at": now.isoformat()}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            contact = updated
    if contact.get("status") == "security_period" and contact.get("accepted_at"):
        end = parse_datetime(contact.get("security_period_ends_at"))
        if end <= datetime.now(timezone.utc):
            now_iso = datetime.now(timezone.utc).isoformat()
            updated = await db.recovery_contacts.find_one_and_update(
                {"contact_id": contact["contact_id"], "status": "security_period"},
                {"$set": {"status": "active", "activated_at": now_iso, "updated_at": now_iso}},
                return_document=ReturnDocument.AFTER,
            )
            if updated:
                contact = updated
    return contact

async def _start_recovery_contact_security_period(user_id: str) -> None:
    """Start the hold only after a recovery account has email + TOTP verified."""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user or user.get("role") != RECOVERY_CONTACT_ROLE:
        return
    if not user.get("email_verified") or not user.get("totp_enabled"):
        return
    now = datetime.now(timezone.utc)
    await db.recovery_contacts.update_one(
        {"linked_user_id": user_id, "status": "verified", "linked_account_type": "recovery_contact"},
        {"$set": {"status": "security_period", "account_verified_at": now.isoformat(),
                  "security_period_ends_at": (now + timedelta(days=RECOVERY_CONTACT_SECURITY_DAYS)).isoformat(),
                  "updated_at": now.isoformat()}},
    )

@api_router.get("/auth/recovery-contact")
async def get_recovery_contact(current_user: Dict = Depends(get_current_user)):
    contact = await db.recovery_contacts.find_one(
        {"user_id": current_user["user_id"], "status": {"$ne": "revoked"}},
        {"_id": 0, "contact_id": 1, "contact_email": 1, "status": 1, "created_at": 1,
         "accepted_at": 1, "security_period_ends_at": 1, "activated_at": 1, "linked_user_id": 1},
        sort=[("created_at", -1)],
    )
    if not contact:
        return {"contact": None}
    contact = await _refresh_recovery_contact_status(contact)
    return {"contact": contact}

@api_router.post("/auth/recovery-contact/invite")
async def invite_recovery_contact(
    data: RecoveryContactInviteRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    """Create a pending trusted-contact invitation; this never changes MFA state."""
    await enforce_rate_limit(request, "auth_recovery_contact_invite", limit=3,
                             window_seconds=60 * 60, identifier=current_user["user_id"])
    contact_email = normalize_email(str(data.email))
    if contact_email == normalize_email(current_user["email"]):
        raise HTTPException(status_code=400, detail="Il contatto deve avere un indirizzo diverso dal tuo")
    if not verify_password(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Riautenticazione richiesta")
    if current_user.get("totp_enabled"):
        if not data.code or not await _consume_current_totp(current_user, data.code):
            raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")
    occupied = await db.recovery_contacts.find_one(
        {"contact_email": contact_email, "status": {"$ne": "revoked"}, "user_id": {"$ne": current_user["user_id"]}},
        {"_id": 1},
    )
    if occupied:
        raise HTTPException(status_code=400, detail="Email già associata a un contatto fidato")
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    await db.recovery_contacts.insert_one({
        "contact_id": f"recovery_contact_{uuid.uuid4().hex[:16]}",
        "contact_token_hash": hash_token(token),
        "verification_method": "email_link",
        "user_id": current_user["user_id"],
        "company_id": current_user["company_id"],
        "contact_email": contact_email,
        "status": "pending_invitation",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=RECOVERY_CONTACT_INVITE_HOURS)).isoformat(),
        "expires_at_dt": now + timedelta(hours=RECOVERY_CONTACT_INVITE_HOURS),
        "acceptance_attempts": 0,
        "used_at": None,
    })
    background_tasks.add_task(send_recovery_contact_invite, contact_email, token)
    background_tasks.add_task(send_recovery_contact_notice, current_user["email"], contact_email, "invited")
    await audit_event("recovery_contact_invited", user=current_user, request=request)
    return {"message": "Invito del contatto fidato inviato.", "status": "pending_invitation"}

@api_router.post("/auth/recovery-contact/accept-email")
async def accept_recovery_contact_by_email(
    data: TokenRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Verify mailbox ownership with a high-entropy single-use invitation link.

    GET never consumes the invitation (email-security scanners can visit links);
    only an explicit POST from the contact's confirmation button does.
    This operation never creates a login session or an account.
    """
    await enforce_rate_limit(request, "auth_recovery_contact_accept_email",
                             limit=8, window_seconds=60 * 60)
    now = datetime.now(timezone.utc)
    token_hash = hash_token(data.token)
    accepted_at = now.isoformat()
    security_end = (now + timedelta(days=RECOVERY_CONTACT_SECURITY_DAYS)).isoformat()
    contact = await db.recovery_contacts.find_one_and_update(
        {"contact_token_hash": token_hash, "status": "pending_invitation",
         "verification_method": "email_link",
         "expires_at_dt": {"$gt": now}},
        {"$set": {"status": "security_period",
                  "accepted_at": accepted_at, "contact_verified_at": accepted_at,
                  "security_period_ends_at": security_end, "updated_at": accepted_at},
         "$unset": {"contact_token_hash": "", "acceptance_code_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not contact:
        raise HTTPException(status_code=400,
                            detail="Invito non disponibile, già accettato o scaduto")
    await db.recovery_contacts.update_many(
        {"user_id": contact["user_id"], "contact_id": {"$ne": contact["contact_id"]},
         "status": {"$in": ["pending_invitation", "verified", "security_period", "active"]}},
        {"$set": {"status": "revoked", "revoked_at": accepted_at,
                  "updated_at": accepted_at, "revoked_reason": "replaced"}},
    )
    owner = await db.users.find_one({"user_id": contact["user_id"]}, {"_id": 0})
    if owner:
        background_tasks.add_task(
            send_recovery_contact_notice, owner["email"], contact["contact_email"], "accepted")
        await audit_event("recovery_contact_email_accepted", user=owner, request=request,
                          metadata={"contact_id": contact["contact_id"]})
    return {"message": "Invito accettato. Non devi creare un account Beside.",
            "status": "security_period", "security_period_ends_at": security_end}


@api_router.post("/auth/recovery-contact/accept")
async def accept_recovery_contact(
    data: RecoveryContactAcceptRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Accept an invite with both the one-time link and a separate code."""
    await enforce_rate_limit(request, "auth_recovery_contact_accept", limit=5,
                             window_seconds=60 * 60)
    token_hash = hash_token(data.token)
    now = datetime.now(timezone.utc)
    doc = await db.recovery_contacts.find_one({"contact_token_hash": token_hash}, {"_id": 0})
    if (not doc or doc.get("status") not in {"pending_invitation", "verified"}
            or doc.get("linked_user_id") or parse_datetime(doc.get("expires_at")) <= now):
        raise HTTPException(status_code=400, detail="Invito non valido, già usato o scaduto")
    if doc.get("acceptance_attempts", 0) >= RECOVERY_CONTACT_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Troppi tentativi di accettazione")
    if not hmac.compare_digest(doc.get("acceptance_code_hash", ""), hash_token(data.acceptance_code)):
        await db.recovery_contacts.update_one(
            {"contact_id": doc["contact_id"], "status": "pending_invitation"},
            {"$inc": {"acceptance_attempts": 1}},
        )
        raise HTTPException(status_code=401, detail="Codice di accettazione non valido")
    # An accepted invitation can be reopened on another device or after refresh
    # while it is still valid and not yet linked. The separate acceptance code
    # remains required; no second acceptance notification is sent.
    if doc.get("status") == "verified":
        return {"message": "Invito già accettato. Completa l'associazione dell'account.",
                "status": "verified", "contact_id": doc["contact_id"]}
    now_iso = now.isoformat()
    accepted = await db.recovery_contacts.find_one_and_update(
        {"contact_id": doc["contact_id"], "status": "pending_invitation",
         "contact_token_hash": token_hash, "acceptance_code_hash": hash_token(data.acceptance_code),
         "acceptance_attempts": {"$lt": RECOVERY_CONTACT_MAX_ATTEMPTS}},
        {"$set": {"status": "verified", "accepted_at": now_iso,
                  "contact_verified_at": now_iso,
                  "updated_at": now_iso}},
        return_document=ReturnDocument.AFTER,
    )
    if not accepted:
        raise HTTPException(status_code=400, detail="Invito non più disponibile")
    await db.recovery_contacts.update_many(
        {"user_id": accepted["user_id"], "contact_id": {"$ne": accepted["contact_id"]},
         "status": {"$in": ["pending_invitation", "security_period", "active"]}},
        {"$set": {"status": "revoked", "revoked_at": now_iso, "updated_at": now_iso,
                  "revoked_reason": "replaced"}},
    )
    user = await db.users.find_one({"user_id": accepted["user_id"]}, {"_id": 0})
    if user:
        background_tasks.add_task(send_recovery_contact_notice, user["email"], accepted["contact_email"], "accepted")
        await audit_event("recovery_contact_accepted", user=user, request=request)
    return {"message": "Contatto verificato. Ora deve completare l'associazione di un account.",
            "status": "verified", "contact_id": accepted["contact_id"]}

@api_router.post("/auth/recovery-contact/create-account")
async def create_recovery_contact_account(
    data: RecoveryContactAccountCreateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Create a password account only from a verified trusted-contact invite."""
    await enforce_rate_limit(request, "auth_recovery_contact_create", limit=5,
                             window_seconds=60 * 60)
    validate_password_strength(data.password)
    token_hash = hash_token(data.token)
    contact = await db.recovery_contacts.find_one({
        "contact_token_hash": token_hash,
        "status": "verified",
        "linked_user_id": {"$exists": False},
    }, {"_id": 0})
    if not contact or contact.get("acceptance_attempts", 0) >= RECOVERY_CONTACT_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Invito non valido o già associato")
    if not hmac.compare_digest(contact.get("acceptance_code_hash", ""), hash_token(data.acceptance_code)):
        await db.recovery_contacts.update_one(
            {"contact_id": contact["contact_id"], "status": "verified"},
            {"$inc": {"acceptance_attempts": 1}},
        )
        raise HTTPException(status_code=400, detail="Invito non valido o già associato")
    email = normalize_email(contact["contact_email"])
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Esiste già un account per questo indirizzo; usa il collegamento account")
    now = datetime.now(timezone.utc)
    user_id = f"user_recovery_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "company_id": None,
        "email": email,
        "password_hash": hash_password(data.password),
        "first_name": "",
        "full_name": "",
        "role": RECOVERY_CONTACT_ROLE,
        "is_active": True,
        "email_verified": False,
        "email_verification_exempt": False,
        "totp_enabled": False,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "last_login_at": None,
    }
    verification_token = await create_one_time_token(
        db.email_verification_tokens, user_doc, timedelta(hours=EMAIL_VERIFICATION_TOKEN_HOURS)
    )
    try:
        await db.users.insert_one(user_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Esiste già un account per questo indirizzo")
    linked = await db.recovery_contacts.find_one_and_update(
        {"contact_id": contact["contact_id"], "status": "verified", "linked_user_id": {"$exists": False},
         "contact_token_hash": token_hash, "acceptance_code_hash": hash_token(data.acceptance_code)},
        {"$set": {"linked_user_id": user_id, "linked_account_type": "recovery_contact",
                  "account_linked_at": now.isoformat(), "activation_pending": True, "updated_at": now.isoformat()},
         "$unset": {"contact_token_hash": "", "acceptance_code_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not linked:
        await db.users.delete_one({"user_id": user_id, "role": RECOVERY_CONTACT_ROLE})
        raise HTTPException(status_code=409, detail="Invito già associato")
    background_tasks.add_task(send_email_verification, email, verification_token)
    owner = await db.users.find_one({"user_id": contact["user_id"]}, {"_id": 0})
    if owner:
        background_tasks.add_task(send_recovery_contact_notice, owner["email"], email, "linked")
        await audit_event("recovery_contact_account_created", user=owner, request=request,
                          metadata={"contact_account_id": user_id})
    return {"user_id": user_id, "email": email, "role": RECOVERY_CONTACT_ROLE,
            "email_verification_required": True, "totp_required": True,
            "message": "Account creato. Verifica l'email e attiva il tuo Authenticator."}

@api_router.post("/auth/recovery-contact/link-account")
async def link_recovery_contact_account(
    data: RecoveryContactLinkRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    """Link an already authenticated BeSide account to a verified invite."""
    await enforce_rate_limit(request, "auth_recovery_contact_link", limit=3,
                             window_seconds=60 * 60, identifier=current_user["user_id"])
    if not verify_password(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Riautenticazione richiesta")
    if current_user.get("totp_enabled"):
        if data.code:
            # Standalone link operation: require a fresh, unused TOTP.
            if not await _consume_current_totp(current_user, data.code):
                raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")
        else:
            # The invitation UI has JUST completed password + TOTP login.
            # Re-use that *server-verified* MFA session rather than demanding
            # the same one-time code again. This is not a password-only bypass.
            token = _extract_request_token(request)
            session = await db.user_sessions.find_one(
                {"token_hash": hash_token(token or ""), "session_type": "jwt",
                 "mfa_verified": True, "revoked_at": None,
                 "user_id": current_user["user_id"]},
                {"_id": 0, "created_at": 1},
            )
            fresh_at = parse_datetime(session["created_at"]) if session else None
            age = datetime.now(timezone.utc) - fresh_at if fresh_at else None
            if age is None or not timedelta(0) <= age <= timedelta(minutes=2):
                raise HTTPException(
                    status_code=401,
                    detail="Per associare il contatto effettua un nuovo accesso MFA oppure inserisci un nuovo codice Authenticator.",
                )
    contact = await db.recovery_contacts.find_one({
        "contact_id": data.contact_id,
        "status": "verified",
        "linked_user_id": {"$exists": False},
    }, {"_id": 0})
    if not contact or normalize_email(current_user["email"]) != normalize_email(contact["contact_email"]):
        raise HTTPException(status_code=403, detail="Invito non associabile a questo account")
    if current_user["user_id"] == contact["user_id"]:
        raise HTTPException(status_code=400, detail="Il contatto deve essere un account distinto")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    security_end = (now + timedelta(days=RECOVERY_CONTACT_SECURITY_DAYS)).isoformat()
    linked = await db.recovery_contacts.find_one_and_update(
        {"contact_id": data.contact_id, "status": "verified", "linked_user_id": {"$exists": False}},
        {"$set": {"status": "security_period", "linked_user_id": current_user["user_id"],
                  "linked_account_type": "existing", "account_linked_at": now_iso,
                  "security_period_ends_at": security_end, "updated_at": now_iso},
         "$unset": {"contact_token_hash": "", "acceptance_code_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not linked:
        raise HTTPException(status_code=409, detail="Invito già associato")
    owner = await db.users.find_one({"user_id": linked["user_id"]}, {"_id": 0})
    if owner:
        background_tasks.add_task(send_recovery_contact_notice, owner["email"], linked["contact_email"], "linked")
        await audit_event("recovery_contact_account_linked", user=owner, request=request,
                          metadata={"contact_account_id": current_user["user_id"]})
    return {"message": "Account del contatto associato. Il periodo di sicurezza è iniziato.",
            "status": "security_period", "security_period_ends_at": security_end}

@api_router.post("/auth/recovery-contact/revoke")
async def revoke_recovery_contact(
    data: RecoveryContactRevokeRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    await enforce_rate_limit(request, "auth_recovery_contact_revoke", limit=5,
                             window_seconds=60 * 60, identifier=current_user["user_id"])
    if not verify_password(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Riautenticazione richiesta")
    if current_user.get("totp_enabled"):
        if not data.code or not await _consume_current_totp(current_user, data.code):
            raise HTTPException(status_code=401, detail="Codice TOTP non valido o già utilizzato")
    now_iso = datetime.now(timezone.utc).isoformat()
    revoked = await db.recovery_contacts.find_one_and_update(
        {"user_id": current_user["user_id"], "status": {"$in": ["pending_invitation", "security_period", "active"]}},
        {"$set": {"status": "revoked", "revoked_at": now_iso, "updated_at": now_iso}},
        sort=[("created_at", -1)], return_document=ReturnDocument.AFTER,
    )
    if not revoked:
        raise HTTPException(status_code=404, detail="Nessun contatto fidato attivo")
    background_tasks.add_task(send_recovery_contact_notice, current_user["email"], revoked["contact_email"], "revoked")
    await audit_event("recovery_contact_revoked", user=current_user, request=request)
    return {"message": "Contatto fidato revocato.", "status": "revoked"}

@api_router.post("/auth/forgot-password")
async def forgot_password(data: EmailRequest, background_tasks: BackgroundTasks, request: Request):
    """Always return the same response to prevent account enumeration."""
    email = normalize_email(str(data.email))
    await enforce_rate_limit(
        request,
        "auth_forgot_password",
        limit=5,
        window_seconds=30 * 60,
        identifier=email,
    )
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if user and user.get("password_hash") and (user.get("company_id") or user.get("role") == RECOVERY_CONTACT_ROLE):
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.password_reset_tokens.update_many(
            {"user_id": user["user_id"], "company_id": user["company_id"], "used_at": None},
            {"$set": {"used_at": now_iso, "invalidated_reason": "replaced"}},
        )
        token = await create_one_time_token(
            db.password_reset_tokens,
            user,
            timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES),
        )
        background_tasks.add_task(send_password_reset_email, email, token)
        await audit_event("password_reset_requested", user=user, request=request)
    return {"message": "Se l'indirizzo è registrato, riceverai un link per reimpostare la password."}

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetRequest, request: Request):
    await enforce_rate_limit(request, "auth_reset_password", limit=10, window_seconds=30 * 60)
    validate_password_strength(data.password)
    now_iso = datetime.now(timezone.utc).isoformat()
    token_doc = await db.password_reset_tokens.find_one_and_update(
        {
            "token_hash": hash_token(data.token),
            "used_at": None,
            "expires_at": {"$gt": now_iso},
        },
        {"$set": {"used_at": now_iso}},
        return_document=ReturnDocument.AFTER,
    )
    if not token_doc:
        raise HTTPException(status_code=400, detail="Token non valido, già usato o scaduto")

    user = await db.users.find_one(
        {"user_id": token_doc["user_id"], "company_id": token_doc["company_id"]},
        {"_id": 0},
    )
    if not user:
        raise HTTPException(status_code=400, detail="Token non valido")
    await db.users.update_one(
        {"user_id": user["user_id"], "company_id": user["company_id"]},
        {"$set": {"password_hash": hash_password(data.password), "updated_at": now_iso}},
    )
    await db.user_sessions.update_many(
        {"user_id": user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )
    await audit_event("password_reset_completed", user=user, request=request)
    return {"message": "Password aggiornata. Accedi nuovamente con la nuova password."}

@api_router.post("/auth/email-verification/request")
async def request_email_verification(
    data: EmailRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Resend generically so unverified users can recover without a session."""
    email = normalize_email(str(data.email))
    await enforce_email_verification_resend_limits(request, email)
    current_user = await db.users.find_one(
        {"email": email, "is_active": {"$ne": False}},
        {"_id": 0},
    )
    generic_message = "Se l'indirizzo è registrato e non verificato, riceverai una nuova email."
    if not current_user or current_user.get("email_verified"):
        return {"message": generic_message}
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.email_verification_tokens.update_many(
        {
            "user_id": current_user["user_id"],
            "company_id": current_user["company_id"],
            "used_at": None,
        },
        {"$set": {"used_at": now_iso, "invalidated_reason": "replaced"}},
    )
    token = await create_one_time_token(
        db.email_verification_tokens,
        current_user,
        timedelta(hours=EMAIL_VERIFICATION_TOKEN_HOURS),
    )
    background_tasks.add_task(send_email_verification, current_user["email"], token)
    return {"message": generic_message}

@api_router.post("/auth/email-verification/verify")
async def verify_email(data: TokenRequest, request: Request):
    await enforce_rate_limit(request, "auth_email_verification", limit=10, window_seconds=60 * 60)
    now_iso = datetime.now(timezone.utc).isoformat()
    token_doc = await db.email_verification_tokens.find_one_and_update(
        {
            "token_hash": hash_token(data.token),
            "used_at": None,
            "expires_at": {"$gt": now_iso},
        },
        {"$set": {"used_at": now_iso}},
        return_document=ReturnDocument.AFTER,
    )
    if not token_doc:
        raise HTTPException(status_code=400, detail="Token non valido, già usato o scaduto")
    await db.users.update_one(
        {"user_id": token_doc["user_id"], "company_id": token_doc["company_id"]},
        {"$set": {
            "email_verified": True,
            "email_verification_exempt": False,
            "updated_at": now_iso,
        }},
    )
    user = await db.users.find_one(
        {"user_id": token_doc["user_id"], "company_id": token_doc["company_id"]},
        {"_id": 0},
    )
    if user:
        await _start_recovery_contact_security_period(user["user_id"])
        await audit_event("email_verified", user=user, request=request)
    return {
        "message": "Indirizzo email verificato.",
        "mfa_setup_required": bool(user and not user.get("totp_enabled")),
    }


@api_router.get("/auth/onboarding-profile")
async def get_onboarding_profile(current_user: Dict = Depends(get_current_user)):
    """Return only the authenticated user's and tenant's onboarding data."""
    company = current_user.get("company") or {}
    return {
        "enabled": ONBOARDING_FEATURE_ENABLED,
        "complete": bool(current_user.get("onboarding_completed_at")),
        "completed_at": current_user.get("onboarding_completed_at"),
        "personal": current_user.get("onboarding_profile", {}),
        "organization": company.get("onboarding_profile", {}),
    }


@api_router.put("/auth/onboarding-profile")
async def update_onboarding_profile(
    data: OnboardingProfileUpdate,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    """Save onboarding progressively without changing roles, plans or modules."""
    if not ONBOARDING_FEATURE_ENABLED:
        raise HTTPException(status_code=404, detail="Onboarding personalizzato non attivo")
    allowed_needs = {"acquisizione_clienti", "organizzazione", "preventivi", "finanza", "marketing"}
    allowed_modules = {"configuratore", "lavori", "preventivi", "finanza", "marketing"}
    if not set(data.needs).issubset(allowed_needs) or not set(data.interested_modules).issubset(allowed_modules):
        raise HTTPException(status_code=400, detail="Preferenza onboarding non valida")
    if data.tax_regime is not None and data.tax_regime not in TAX_REGIMES and data.tax_regime not in {"non_so", "preferisco_non_rispondere"}:
        raise HTTPException(status_code=400, detail="Regime fiscale non valido")
    if data.legal_form in {"societa_persone", "societa_capitali"} and data.tax_regime in {"forfettario_5", "forfettario_15"}:
        raise HTTPException(status_code=422, detail="Regime fiscale non compatibile con la forma giuridica")
    if data.customer_type is not None and data.customer_type not in {"b2b", "b2c", "b2b_b2c", "non_so", "preferisco_non_rispondere"}:
        raise HTTPException(status_code=400, detail="Tipologia clientela non valida")

    now_iso = datetime.now(timezone.utc).isoformat()
    personal_fields = {
        key: value for key, value in {
            "first_name": data.first_name,
            "last_name": data.last_name,
            "role": data.role,
            "location_general": data.location_general,
            "step": data.step,
        }.items() if value is not None
    }
    privacy_values = {
        key: value for key, value in {
            "marketing_emails": data.marketing_emails_opt_in,
            "marketing_profiling": data.marketing_profiling_opt_in,
        }.items() if value is not None
    }
    if privacy_values:
        existing_privacy = (current_user.get("privacy_preferences") or {}).copy()
        existing_privacy.update(privacy_values)
        existing_privacy.update({"version": "v1", "updated_at": now_iso})
        personal_fields["privacy_preferences"] = existing_privacy
    organization_fields = {
        key: value for key, value in {
            "business_status": data.business_status,
            "legal_form": data.legal_form,
            "tax_regime": data.tax_regime,
            "sector": data.sector,
            "customer_type": data.customer_type,
            "revenue_band": data.revenue_band,
            "employees_band": data.employees_band,
            "needs": data.needs,
            "interested_modules": data.interested_modules,
            "monthly_quotes_band": data.monthly_quotes_band,
            "step": data.step,
        }.items() if value is not None
    }
    if personal_fields:
        await db.users.update_one(
            {"user_id": current_user["user_id"], "company_id": current_user["company_id"]},
            {"$set": {f"onboarding_profile.{key}": value for key, value in personal_fields.items()},
             "$currentDate": {"updated_at": True}},
        )
    if organization_fields:
        if current_user.get("role") not in {"owner", "admin"}:
            raise HTTPException(status_code=403, detail="Solo il titolare o un amministratore può modificare il profilo aziendale")
        organization_update = {f"onboarding_profile.{key}": value for key, value in organization_fields.items()}
        organization_update["updated_at"] = now_iso
        await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": organization_update},
        )
    if data.complete:
        if not (data.first_name or current_user.get("first_name") or data.last_name or current_user.get("last_name")):
            raise HTTPException(status_code=422, detail="Inserisci almeno il nome o il cognome")
        await db.users.update_one(
            {"user_id": current_user["user_id"], "company_id": current_user["company_id"]},
            {"$set": {"onboarding_completed_at": now_iso, "updated_at": now_iso}},
        )
    await audit_event("onboarding_profile_saved", user=current_user, request=request,
                      metadata={"step": data.step, "complete": data.complete})
    updated_user = await db.users.find_one({"user_id": current_user["user_id"], "company_id": current_user["company_id"]}, {"_id": 0})
    updated_company = await db.companies.find_one({"company_id": current_user["company_id"]}, {"_id": 0})
    return {
        "enabled": True,
        "complete": bool(updated_user.get("onboarding_completed_at")),
        "completed_at": updated_user.get("onboarding_completed_at"),
        "personal": updated_user.get("onboarding_profile", {}),
        "organization": (updated_company or {}).get("onboarding_profile", {}),
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    token = _extract_request_token(request)
    if token:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.user_sessions.update_many(
            {"token_hash": hash_token(token), "revoked_at": None},
            {"$set": {"revoked_at": now_iso}},
        )

    clear_session_cookie(response)
    return {"message": "Logout effettuato"}

# ==================== COMPANY & ROLE ENDPOINTS ====================

@api_router.get("/companies/current")
async def get_current_company(current_user: Dict = Depends(get_current_user)):
    return current_user["company"]

@api_router.put("/companies/current")
async def update_current_company(
    data: CompanyUpdate,
    request: Request,
    current_user: Dict = Depends(require_company_roles("owner", "admin")),
):
    updates: Dict[str, Any] = {}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.status is not None:
        # Company members cannot self-activate/suspend a tenant. This is kept for
        # the future platform dashboard through the dedicated admin endpoint.
        raise HTTPException(status_code=403, detail="Lo stato aziendale è gestito da BESIDE")
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": updates},
        )
    return await db.companies.find_one({"company_id": current_user["company_id"]}, {"_id": 0})

@api_router.get("/companies/current/users")
async def get_company_users(
    current_user: Dict = Depends(require_company_roles("owner", "admin")),
):
    return await db.users.find(
        {"company_id": current_user["company_id"]},
        {"_id": 0, "password_hash": 0, "platform_role": 0},
    ).to_list(100)

@api_router.put("/companies/current/users/{user_id}/role")
async def change_company_user_role(
    user_id: str,
    data: CompanyRoleUpdate,
    request: Request,
    current_user: Dict = Depends(require_company_roles("owner")),
):
    if data.role not in COMPANY_ROLES:
        raise HTTPException(status_code=400, detail="Ruolo non valido")
    target = await db.users.find_one(
        {"user_id": user_id, "company_id": current_user["company_id"]},
        {"_id": 0},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato nell'azienda")
    if target["user_id"] == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Il proprietario non può modificare il proprio ruolo")
    if data.role == "owner":
        raise HTTPException(status_code=400, detail="Il trasferimento di proprietà non è ancora supportato")
    old_role = target.get("role")
    await db.users.update_one(
        {"user_id": user_id, "company_id": current_user["company_id"]},
        {"$set": {"role": data.role, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await audit_event(
        "role_changed",
        user=current_user,
        request=request,
        metadata={"target_user_id": user_id, "old_role": old_role, "new_role": data.role},
    )
    return {"user_id": user_id, "role": data.role}

# ==================== JOBS ENDPOINTS ====================

@api_router.post("/jobs", response_model=JobResponse)
async def create_job(
    job_data: JobCreate,
    request: Request,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Create a new job or quote"""
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    waste_pct = job_data.waste_percentage
    if waste_pct is None:
        if "ppf" in job_data.job_type:
            waste_pct = DEFAULT_WASTE["ppf"]
        else:
            waste_pct = DEFAULT_WASTE["vinyl"]
    
    profit_data = calculate_job_profitability(
        job_data.quote_amount,
        job_data.hours_worked,
        job_data.materials_cost,
        waste_pct
    )
    
    # Generate quote link if it's a quote
    quote_link = None
    if job_data.is_quote:
        quote_token = secrets.token_urlsafe(32)
        quote_link = f"{FRONTEND_PUBLIC_URL}/quote/{quote_token}"
        await db.quote_tokens.insert_one({
            "token": quote_token,
            "job_id": job_id,
            "company_id": current_user["company_id"],
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=PUBLIC_LINK_TOKEN_DAYS)).isoformat(),
        })

    job_doc = company_document(current_user, **{
        "job_id": job_id,
        "client_name": job_data.client_name,
        "client_email": job_data.client_email,
        "job_type": job_data.job_type,
        "vehicle_type": job_data.vehicle_type,
        "vehicle_info": job_data.vehicle_info,
        "quote_amount": job_data.quote_amount,
        "hours_worked": job_data.hours_worked,
        "materials_cost": job_data.materials_cost,
        "waste_percentage": waste_pct,
        "profit_margin": profit_data["profit_margin"],
        "net_profit": profit_data["net_profit"],
        "hourly_rate": profit_data["hourly_rate"],
        "lead_source": job_data.lead_source,
        "notes": job_data.notes,
        "is_quote": job_data.is_quote,
        "quote_status": "pending" if job_data.is_quote else None,
        "quote_link": quote_link,
        "completed_date": now.isoformat(),
        "created_at": now.isoformat(),
    })
    
    await db.jobs.insert_one(job_doc)
    
    if job_data.lead_source and not job_data.is_quote:
        await db.lead_sources.insert_one(company_document(current_user, **{
            "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
            "job_id": job_id,
            "source": job_data.lead_source,
            "revenue": job_data.quote_amount,
            "created_at": now.isoformat(),
        }))
    
    return JobResponse(**{k: v for k, v in job_doc.items() if k != "_id"})

@api_router.post("/jobs/{job_id}/send-quote")
async def send_saved_quote(job_id: str, current_user: Dict = Depends(require_company_roles("owner", "admin", "member"))):
    job = await db.jobs.find_one(company_scope(current_user, job_id=job_id), {"_id": 0})
    if not job or not job.get("is_quote") or not job.get("quote_link"):
        raise HTTPException(404, "Preventivo non trovato")
    if not job.get("client_email"):
        raise HTTPException(400, "Email cliente mancante")
    delivered = await send_email_sendgrid(job["client_email"], "Il tuo preventivo BeSide",
        f'<p>Il preventivo è disponibile: <a href="{html.escape(job["quote_link"], quote=True)}">Visualizza preventivo</a></p>')
    if not delivered:
        raise HTTPException(503, "Preventivo salvato nei Lavori; invio email non configurato.")
    return {"message": "Preventivo salvato; email disponibile nella posta locale." if APP_ENV == "local" else "Preventivo salvato e inviato."}


@api_router.get("/jobs", response_model=List[JobResponse])
async def get_jobs(
    limit: int = Query(default=50, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    job_type: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    is_quote: Optional[bool] = None,
    current_user: Dict = Depends(get_current_user)
):
    """Get all jobs for current user"""
    query = company_scope(current_user)
    if job_type:
        query["job_type"] = job_type
    if vehicle_type:
        query["vehicle_type"] = vehicle_type
    if is_quote is not None:
        query["is_quote"] = is_quote
    
    jobs = await db.jobs.find(query, {"_id": 0}).sort("completed_date", -1).skip(skip).limit(limit).to_list(limit)
    return jobs

@api_router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, current_user: Dict = Depends(get_current_user)):
    """Get a specific job"""
    job = await db.jobs.find_one(company_scope(current_user, job_id=job_id), {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    return job

@api_router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: Dict = Depends(require_company_roles("owner", "admin")),
):
    """Delete a job"""
    result = await db.jobs.delete_one(company_scope(current_user, job_id=job_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    
    await db.lead_sources.delete_many(company_scope(current_user, job_id=job_id))
    return {"message": "Lavoro eliminato"}

# Public quote viewing and acceptance
@api_router.get("/quote/{token}")
async def get_public_quote(token: str, request: Request):
    """Public endpoint to view a quote"""
    await enforce_rate_limit(request, "public_quote_view", limit=60, window_seconds=60 * 60)
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token or (
        quote_token.get("expires_at")
        and parse_datetime(quote_token["expires_at"]) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    job = await db.jobs.find_one(
        {"job_id": quote_token["job_id"], "company_id": quote_token.get("company_id")},
        {"_id": 0},
    )
    if not job:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    # Get business info for the quote
    company = await db.companies.find_one({"company_id": job["company_id"]}, {"_id": 0})
    owner = await db.users.find_one(
        {"user_id": (company or {}).get("owner_user_id"), "company_id": job["company_id"]},
        {"_id": 0, "password_hash": 0},
    )
    
    # Return only client-visible fields
    return {
        "job_id": job["job_id"],
        "client_name": job["client_name"],
        "job_type": job["job_type"],
        "vehicle_type": job["vehicle_type"],
        "vehicle_info": job.get("vehicle_info"),
        "quote_amount": job["quote_amount"],
        "notes": job.get("notes"),
        "quote_status": job.get("quote_status"),
        "created_at": job["created_at"],
        "business_name": (company or {}).get("name") or (owner or {}).get("business_name"),
        "business_info": (owner or {}).get("business_info", {})
    }

@api_router.post("/quote/{token}/accept")
async def accept_quote(token: str, acceptance: QuoteAcceptance, request: Request):
    """Public endpoint to accept or reject a quote"""
    await enforce_rate_limit(request, "public_quote_accept", limit=20, window_seconds=60 * 60)
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token or (
        quote_token.get("expires_at")
        and parse_datetime(quote_token["expires_at"]) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    job = await db.jobs.find_one(
        {"job_id": quote_token["job_id"], "company_id": quote_token.get("company_id")},
        {"_id": 0},
    )
    if not job:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    if job.get("quote_status") != "pending":
        raise HTTPException(status_code=400, detail="Preventivo già processato")
    
    new_status = "accepted" if acceptance.accepted else "rejected"
    now = datetime.now(timezone.utc).isoformat()
    
    update_fields = {
        "quote_status": new_status,
        "quote_accepted_at": now if acceptance.accepted else None,
        "quote_rejected_at": now if not acceptance.accepted else None,
        "client_signature": acceptance.client_signature,
        "client_notes": acceptance.notes
    }
    
    await db.jobs.update_one(
        {"job_id": quote_token["job_id"], "company_id": job["company_id"]},
        {"$set": update_fields}
    )
    
    # If accepted, add to lead sources
    if acceptance.accepted and job.get("lead_source"):
        await db.lead_sources.insert_one({
            "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
            "user_id": job["user_id"],
            "company_id": job["company_id"],
            "job_id": job["job_id"],
            "source": job["lead_source"],
            "revenue": job["quote_amount"],
            "created_at": now
        })
    
    return {"message": "Preventivo aggiornato", "status": new_status}

@api_router.get("/jobs/analytics/profitability")
async def get_profitability_analytics(current_user: Dict = Depends(get_current_user)):
    """Get profitability analytics by job type and vehicle type"""
    pipeline_job_type = [
        {"$match": company_scope(current_user, is_quote={"$ne": True})},
        {"$group": {
            "_id": "$job_type",
            "total_revenue": {"$sum": "$quote_amount"},
            "total_profit": {"$sum": "$net_profit"},
            "avg_margin": {"$avg": "$profit_margin"},
            "job_count": {"$sum": 1}
        }},
        {"$sort": {"avg_margin": -1}}
    ]
    
    pipeline_vehicle_type = [
        {"$match": company_scope(current_user, is_quote={"$ne": True})},
        {"$group": {
            "_id": "$vehicle_type",
            "total_revenue": {"$sum": "$quote_amount"},
            "total_profit": {"$sum": "$net_profit"},
            "avg_margin": {"$avg": "$profit_margin"},
            "job_count": {"$sum": 1}
        }},
        {"$sort": {"avg_margin": -1}}
    ]
    
    by_job_type = await db.jobs.aggregate(pipeline_job_type).to_list(100)
    by_vehicle_type = await db.jobs.aggregate(pipeline_vehicle_type).to_list(100)
    
    return {
        "by_job_type": by_job_type,
        "by_vehicle_type": by_vehicle_type
    }

# ==================== TAX ENDPOINTS ====================

@api_router.post("/tax/calculate", response_model=TaxCalculationResponse)
async def calculate_taxes(request: TaxCalculationRequest):
    """Calculate taxes for given revenue and regime"""
    try:
        tax_data = calculate_tax(
            request.revenue,
            request.tax_regime,
            request.period,
            request.fixed_expenses,
            request.variable_expenses,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return TaxCalculationResponse(
        revenue=request.revenue,
        tax_regime=request.tax_regime,
        period=request.period,
        **tax_data
    )

@api_router.get("/finance/settings")
async def get_finance_settings(current_user: Dict = Depends(get_current_user)):
    """Return the current user's persisted finance calculator settings."""
    settings = await db.finance_settings.find_one(
        company_scope(current_user),
        {"_id": 0, "user_id": 0, "company_id": 0},
    )
    if settings:
        return settings

    return {
        "revenue": 0,
        "tax_regime": current_user.get("tax_regime", "forfettario_15"),
        "period": "monthly",
        "fixed_expenses": 0,
        "variable_expenses": 0,
    }

@api_router.put("/finance/settings")
async def update_finance_settings(
    settings_data: FinanceSettingsUpdate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Persist finance calculator settings in MongoDB, scoped to the current user."""
    if settings_data.period not in FINANCE_PERIODS:
        raise HTTPException(status_code=400, detail="Periodo di calcolo non valido")
    if settings_data.tax_regime not in TAX_REGIMES:
        raise HTTPException(status_code=400, detail="Regime fiscale non valido")

    now_iso = datetime.now(timezone.utc).isoformat()
    settings_doc = {
        **settings_data.model_dump(),
        "company_id": current_user["company_id"],
        "user_id": current_user["user_id"],
        "updated_at": now_iso,
    }
    existing = await db.finance_settings.find_one(
        company_scope(current_user),
        {"_id": 0, "created_at": 1},
    )
    settings_doc["created_at"] = existing.get("created_at", now_iso) if existing else now_iso

    await db.finance_settings.update_one(
        company_scope(current_user),
        {"$set": settings_doc},
        upsert=True,
    )
    return {
        key: value for key, value in settings_doc.items()
        if key not in {"user_id", "company_id"}
    }

@api_router.get("/finance/cash-flow")
async def get_finance_cash_flow(current_user: Dict = Depends(get_current_user)):
    """Return a 12-month cash-flow forecast based on persisted finance settings."""
    settings = await db.finance_settings.find_one(
        company_scope(current_user),
        {"_id": 0},
    )
    if not settings or settings.get("revenue", 0) <= 0:
        return {"forecast": [], "summary": None}

    try:
        return build_cash_flow_forecast(
            revenue=settings["revenue"],
            tax_regime=settings["tax_regime"],
            period=settings["period"],
            fixed_expenses=settings.get("fixed_expenses", 0),
            variable_expenses=settings.get("variable_expenses", 0),
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

def validate_cash_plan_payload(month: str, data_type: str) -> int:
    if data_type not in CASH_PLAN_DATA_TYPES:
        raise HTTPException(status_code=400, detail="Tipo di dato del piano di cassa non valido")
    try:
        return validate_cash_plan_month(month)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@api_router.get("/finance/cash-plan/settings")
async def get_cash_plan_settings(current_user: Dict = Depends(get_current_user)):
    """Return the single opening balance used by the user's cash plan."""
    return {
        "opening_balance": await get_cash_plan_opening_balance(current_user["company_id"]),
    }

@api_router.put("/finance/cash-plan/settings")
async def update_cash_plan_settings(
    settings_data: CashPlanSettingsUpdate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Persist the opening balance and recalculate every following month."""
    company_id = current_user["company_id"]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.cash_plan_settings.update_one(
        {"company_id": company_id},
        {"$set": {
            "company_id": company_id,
            "user_id": current_user["user_id"],
            "opening_balance": round(settings_data.opening_balance, 2),
            "updated_at": now_iso,
        }, "$setOnInsert": {"created_at": now_iso}},
        upsert=True,
    )
    records = await recalculate_user_cash_plan(company_id)
    return {
        "opening_balance": round(settings_data.opening_balance, 2),
        "summary": build_cash_plan_summary(records, settings_data.opening_balance),
    }

@api_router.get("/finance/cash-plan/months")
async def get_cash_plan_months(
    data_type: Optional[str] = None,
    current_user: Dict = Depends(get_current_user),
):
    """Return chronological monthly records, optionally filtered by actual/forecast."""
    if data_type is not None and data_type not in CASH_PLAN_DATA_TYPES:
        raise HTTPException(status_code=400, detail="Tipo di dato del piano di cassa non valido")

    await migrate_tax_accruals_to_cash_plan(current_user)
    company_id = current_user["company_id"]
    opening_balance = await get_cash_plan_opening_balance(company_id)
    records = await recalculate_user_cash_plan(company_id)
    visible_records = [record for record in records if data_type is None or record["data_type"] == data_type]
    return {
        "months": visible_records,
        "opening_balance": opening_balance,
        "recurring_defaults": await get_cash_plan_recurring_defaults(company_id),
        "summary": build_cash_plan_summary(records, opening_balance),
    }

@api_router.post("/finance/cash-plan/months")
async def create_cash_plan_month(
    month_data: CashPlanMonthCreate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Create one user-owned cash-plan month and chain all following balances."""
    await migrate_tax_accruals_to_cash_plan(current_user)
    company_id = current_user["company_id"]
    year = validate_cash_plan_payload(month_data.month, month_data.data_type)
    existing = await db.cash_plan_entries.find_one(
        {"company_id": company_id, "month": month_data.month},
        {"_id": 0, "cash_plan_id": 1},
    )
    if existing:
        raise HTTPException(status_code=409, detail="Esiste già un mese con questa data")

    now_iso = datetime.now(timezone.utc).isoformat()
    cash_plan_id = f"cash_{uuid.uuid4().hex[:12]}"
    document = {
        "cash_plan_id": cash_plan_id,
        "company_id": company_id,
        "user_id": current_user["user_id"],
        "year": year,
        **month_data.model_dump(),
        "tax_regime": current_user.get("tax_regime", "forfettario_15"),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.cash_plan_entries.insert_one(document)
    records = await recalculate_user_cash_plan(company_id)
    return next(record for record in records if record["cash_plan_id"] == cash_plan_id)

@api_router.put("/finance/cash-plan/months/{cash_plan_id}")
async def update_cash_plan_month(
    cash_plan_id: str,
    month_data: CashPlanMonthUpdate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Update only a cash-plan month owned by the authenticated user."""
    company_id = current_user["company_id"]
    year = validate_cash_plan_payload(month_data.month, month_data.data_type)
    existing = await db.cash_plan_entries.find_one(
        {"cash_plan_id": cash_plan_id, "company_id": company_id},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Mese del piano di cassa non trovato")

    duplicate = await db.cash_plan_entries.find_one(
        {
            "company_id": company_id,
            "month": month_data.month,
            "cash_plan_id": {"$ne": cash_plan_id},
        },
        {"_id": 0, "cash_plan_id": 1},
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Esiste già un mese con questa data")

    await db.cash_plan_entries.update_one(
        {"cash_plan_id": cash_plan_id, "company_id": company_id},
        {"$set": {
            **month_data.model_dump(),
            "year": year,
            "tax_regime": existing.get("tax_regime", current_user.get("tax_regime", "forfettario_15")),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    records = await recalculate_user_cash_plan(company_id)
    return next(record for record in records if record["cash_plan_id"] == cash_plan_id)

@api_router.delete("/finance/cash-plan/months/{cash_plan_id}")
async def delete_cash_plan_month(
    cash_plan_id: str,
    current_user: Dict = Depends(require_company_roles("owner", "admin")),
):
    """Delete one owned month and repair the opening/closing chain that follows it."""
    company_id = current_user["company_id"]
    result = await db.cash_plan_entries.delete_one(
        {"cash_plan_id": cash_plan_id, "company_id": company_id},
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mese del piano di cassa non trovato")
    await recalculate_user_cash_plan(company_id)
    return {"message": "Mese eliminato"}

@api_router.post("/finance/cash-plan/forecast/generate")
async def generate_cash_plan_forecast(
    request_data: CashPlanForecastRequest,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Append editable forecast months without ever changing saved actual months."""
    if request_data.method not in CASH_PLAN_FORECAST_METHODS:
        raise HTTPException(status_code=400, detail="Metodo di previsione non valido")

    await migrate_tax_accruals_to_cash_plan(current_user)
    company_id = current_user["company_id"]
    records = await recalculate_user_cash_plan(company_id)
    actual_records = [record for record in records if record["data_type"] == "actual"]
    source_records = actual_records
    latest_record = records[-1] if records else None
    recurring_defaults = await get_cash_plan_recurring_defaults(company_id)

    if request_data.method == "average_3":
        source_records = actual_records[-3:]
    elif request_data.method == "average_6":
        source_records = actual_records[-6:]
    elif request_data.method == "copy_previous":
        source_records = [latest_record] if latest_record else []

    if request_data.method != "manual" and not source_records:
        raise HTTPException(
            status_code=400,
            detail="Inserisci almeno un mese consuntivo prima di generare la previsione",
        )

    def average(field: str) -> float:
        return round(sum(float(record.get(field, 0)) for record in source_records) / len(source_records), 2)

    if request_data.method == "manual":
        template = {
            "revenue": 0,
            "fixed_expenses": float(latest_record.get("fixed_expenses", 0)) if latest_record else recurring_defaults["fixed_expenses"],
            "variable_expenses": 0,
            "other_expenses": 0,
        }
    elif request_data.method == "copy_previous":
        template = {
            "revenue": float(latest_record.get("revenue", 0)),
            "fixed_expenses": float(latest_record.get("fixed_expenses", 0)),
            "variable_expenses": float(latest_record.get("variable_expenses", 0)),
            "other_expenses": float(latest_record.get("other_expenses", 0)),
        }
    else:
        template = {
            "revenue": average("revenue"),
            "fixed_expenses": average("fixed_expenses"),
            "variable_expenses": average("variable_expenses"),
            "other_expenses": average("other_expenses"),
        }

    starting_month = records[-1]["month"] if records else datetime.now(timezone.utc).strftime("%Y-%m")
    created_ids = []
    for offset in range(1, request_data.months + 1):
        month = add_months_to_cash_plan(starting_month, offset)
        now_iso = datetime.now(timezone.utc).isoformat()
        cash_plan_id = f"cash_{uuid.uuid4().hex[:12]}"
        await db.cash_plan_entries.insert_one({
            "cash_plan_id": cash_plan_id,
            "company_id": company_id,
            "user_id": current_user["user_id"],
            "month": month,
            "year": int(month[:4]),
            "data_type": "forecast",
            **template,
            "taxes_paid": 0,
            "tax_regime": current_user.get("tax_regime", "forfettario_15"),
            "notes": "",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        created_ids.append(cash_plan_id)

    calculated_records = await recalculate_user_cash_plan(company_id)
    return {
        "created_count": len(created_ids),
        "months": [
            record for record in calculated_records
            if record["cash_plan_id"] in created_ids
        ],
    }

@api_router.get("/finance/cash-plan/summary")
async def get_cash_plan_summary(current_user: Dict = Depends(get_current_user)):
    """Return the cash-plan KPI summary and first forecast liquidity warning."""
    await migrate_tax_accruals_to_cash_plan(current_user)
    company_id = current_user["company_id"]
    opening_balance = await get_cash_plan_opening_balance(company_id)
    records = await recalculate_user_cash_plan(company_id)
    return build_cash_plan_summary(records, opening_balance)

@api_router.post("/tax/accruals")
async def create_tax_accrual(
    accrual_data: TaxAccrualCreate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Create a tax accrual entry for a month"""
    accrual_id = f"accrual_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    tax_data = calculate_tax(accrual_data.revenue, tax_regime, "monthly")
    
    prev_accruals = await db.tax_accruals.find(
        company_scope(current_user, month={"$lt": accrual_data.month}),
        {"_id": 0}
    ).sort("month", -1).limit(1).to_list(1)
    
    prev_balance = prev_accruals[0]["cumulative_balance"] if prev_accruals else 0
    cumulative_balance = prev_balance + tax_data["total_accrual"]
    
    accrual_doc = {
        "accrual_id": accrual_id,
        "company_id": current_user["company_id"],
        "user_id": current_user["user_id"],
        "month": accrual_data.month,
        "revenue": accrual_data.revenue,
        "tax_regime": tax_regime,
        "irpef_amount": tax_data["irpef_amount"],
        "inps_amount": tax_data["inps_amount"],
        "iva_amount": tax_data["iva_amount"],
        "total_accrual": tax_data["total_accrual"],
        "cumulative_balance": round(cumulative_balance, 2),
        "yearly_projection": tax_data.get("yearly_projection"),
        "created_at": now.isoformat()
    }
    
    await db.tax_accruals.update_one(
        company_scope(current_user, month=accrual_data.month),
        {"$set": accrual_doc},
        upsert=True
    )
    
    return accrual_doc

@api_router.get("/tax/accruals")
async def get_tax_accruals(current_user: Dict = Depends(get_current_user)):
    """Get all tax accruals for current user"""
    accruals = await db.tax_accruals.find(
        company_scope(current_user),
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return accruals

@api_router.get("/tax/forecast")
async def get_tax_forecast(current_user: Dict = Depends(get_current_user)):
    """Get 6-month tax forecast based on recent revenue"""
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m")
    
    recent_accruals = await db.tax_accruals.find(
        company_scope(current_user, month={"$gte": three_months_ago}),
        {"_id": 0}
    ).to_list(100)
    
    if not recent_accruals:
        avg_revenue = 5000
    else:
        avg_revenue = sum(a["revenue"] for a in recent_accruals) / len(recent_accruals)
    
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    forecast = []
    
    current_date = datetime.now(timezone.utc)
    for i in range(6):
        future_date = current_date + timedelta(days=30 * (i + 1))
        month_str = future_date.strftime("%Y-%m")
        tax_data = calculate_tax(avg_revenue, tax_regime, "monthly")
        forecast.append({
            "month": month_str,
            "estimated_revenue": avg_revenue,
            "irpef_amount": tax_data["irpef_amount"],
            "inps_amount": tax_data["inps_amount"],
            "iva_amount": tax_data["iva_amount"],
            "total_accrual": tax_data["total_accrual"],
            "net_income": tax_data["net_income"]
        })
    
    return {"forecast": forecast, "avg_monthly_revenue": avg_revenue}

@api_router.get("/tax/deadlines")
async def get_tax_deadlines(current_user: Dict = Depends(get_current_user)):
    """Get upcoming Italian tax deadlines based on user's tax regime"""
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    return {"deadlines": get_tax_deadlines_by_regime(tax_regime)}

# ==================== EXPORT CSV ENDPOINTS ====================

JOB_TYPE_LABELS_IT = {
    "ppf_full": "PPF Completo",
    "ppf_partial": "PPF Parziale",
    "wrap_decorative": "Wrap Decorativo",
    "wrap_commercial": "Wrap Commerciale",
    "tint": "Oscuramento Vetri",
    "upholstery": "Tappezzeria"
}

VEHICLE_TYPE_LABELS_IT = {
    "sedan": "Berlina",
    "suv": "SUV",
    "van": "Van",
    "truck": "Camion"
}

@api_router.get("/export/jobs-csv")
async def export_jobs_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: Dict = Depends(get_current_user)
):
    """Export jobs as CSV for accountant"""
    query = company_scope(current_user, is_quote={"$ne": True})
    
    # Filter by date range if provided
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        if date_filter:
            query["completed_date"] = date_filter
    
    jobs = await db.jobs.find(query, {"_id": 0}).sort("completed_date", -1).to_list(10000)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')  # Use semicolon for Italian Excel
    
    # Header row
    writer.writerow([
        "Data",
        "Cliente",
        "Tipo Lavoro",
        "Veicolo",
        "Info Veicolo",
        "Importo (€)",
        "Ore Lavorate",
        "Costo Materiali (€)",
        "Scarto (%)",
        "Profitto Netto (€)",
        "Margine (%)",
        "Tariffa Oraria (€)",
        "Fonte Lead",
        "Note"
    ])
    
    # Data rows
    for job in jobs:
        completed_date = job.get("completed_date", "")
        if completed_date:
            try:
                dt = datetime.fromisoformat(completed_date.replace("Z", "+00:00"))
                completed_date = dt.strftime("%d/%m/%Y")
            except:
                pass
        
        writer.writerow([
            completed_date,
            csv_text(job.get("client_name", "")),
            JOB_TYPE_LABELS_IT.get(job.get("job_type", ""), job.get("job_type", "")),
            VEHICLE_TYPE_LABELS_IT.get(job.get("vehicle_type", ""), job.get("vehicle_type", "")),
            csv_text(job.get("vehicle_info", "")),
            str(job.get("quote_amount", 0)).replace(".", ","),
            str(job.get("hours_worked", 0)).replace(".", ","),
            str(job.get("materials_cost", 0)).replace(".", ","),
            str(round(job.get("waste_percentage", 0) * 100, 1)).replace(".", ","),
            str(job.get("net_profit", 0)).replace(".", ","),
            str(job.get("profit_margin", 0)).replace(".", ","),
            str(job.get("hourly_rate", 0)).replace(".", ","),
            (job.get("lead_source") or "").replace("_", " ").title(),
            csv_text(job.get("notes", ""))
        ])
    
    output.seek(0)
    
    # Generate filename with date range
    filename = f"lavori_beside_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )

@api_router.get("/export/tax-accruals-csv")
async def export_tax_accruals_csv(
    year: Optional[int] = None,
    current_user: Dict = Depends(get_current_user)
):
    """Export tax accruals as CSV for accountant"""
    query = company_scope(current_user)
    
    if year:
        query["month"] = {"$regex": f"^{year}"}
    
    accruals = await db.tax_accruals.find(query, {"_id": 0}).sort("month", 1).to_list(1000)
    
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    
    writer.writerow([
        "Mese",
        "Fatturato (€)",
        "Regime Fiscale",
        "IRPEF (€)",
        "INPS (€)",
        "IVA (€)",
        "Totale Accantonamento (€)",
        "Saldo Cumulativo (€)"
    ])
    
    regime_labels = {
        "forfettario_5": "Forfettario 5%",
        "forfettario_15": "Forfettario 15%",
        "ordinario": "Ordinario"
    }
    
    for accrual in accruals:
        month = accrual.get("month", "")
        if month:
            try:
                parts = month.split("-")
                month = f"{parts[1]}/{parts[0]}"  # Convert YYYY-MM to MM/YYYY
            except:
                pass
        
        writer.writerow([
            month,
            str(accrual.get("revenue", 0)).replace(".", ","),
            regime_labels.get(accrual.get("tax_regime", ""), accrual.get("tax_regime", "")),
            str(accrual.get("irpef_amount", 0)).replace(".", ","),
            str(accrual.get("inps_amount", 0)).replace(".", ","),
            str(accrual.get("iva_amount", 0)).replace(".", ","),
            str(accrual.get("total_accrual", 0)).replace(".", ","),
            str(accrual.get("cumulative_balance", 0)).replace(".", ",")
        ])
    
    output.seek(0)
    
    filename = f"accantonamenti_tasse_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )

# ==================== CLIENT ONBOARDING ENDPOINTS ====================

DEFAULT_CHECKLIST = [
    {"item": "Foto veicolo (4 angolazioni)", "completed": False, "uploaded_file": None},
    {"item": "Modello/anno confermato", "completed": False, "uploaded_file": None},
    {"item": "Grafica/colore approvato", "completed": False, "uploaded_file": None},
    {"item": "Tempistica concordata (+20% buffer)", "completed": False, "uploaded_file": None},
    {"item": "Acconto 50% ricevuto", "completed": False, "uploaded_file": None},
    {"item": "Policy revisioni firmata (max 2 incluse)", "completed": False, "uploaded_file": None}
]

@api_router.post("/onboarding")
async def create_onboarding(
    onboarding_data: OnboardingCreate,
    request: Request,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Create a new client onboarding"""
    onboarding_id = f"onb_{uuid.uuid4().hex[:12]}"
    unique_link_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    
    unique_link = f"{FRONTEND_PUBLIC_URL}/onboarding/client/{unique_link_token}"
    
    onboarding_doc = {
        "onboarding_id": onboarding_id,
        "company_id": current_user["company_id"],
        "user_id": current_user["user_id"],
        "client_name": onboarding_data.client_name,
        "client_email": onboarding_data.client_email,
        "vehicle_info": onboarding_data.vehicle_info,
        "status": "pending",
        "checklist_items": DEFAULT_CHECKLIST.copy(),
        "unique_link": unique_link,
        "unique_link_token": unique_link_token,
        "link_expires_at": (now + timedelta(days=PUBLIC_LINK_TOKEN_DAYS)).isoformat(),
        "created_at": now.isoformat(),
        "completed_at": None
    }
    
    await db.onboardings.insert_one(onboarding_doc)
    
    return {k: v for k, v in onboarding_doc.items() if k not in ["_id", "unique_link_token"]}

@api_router.get("/onboarding")
async def get_onboardings(
    status: Optional[str] = None,
    current_user: Dict = Depends(get_current_user)
):
    """Get all onboardings for current user"""
    query = company_scope(current_user)
    if status:
        query["status"] = status
    
    onboardings = await db.onboardings.find(query, {"_id": 0, "unique_link_token": 0}).sort("created_at", -1).to_list(100)
    return onboardings

@api_router.get("/onboarding/{onboarding_id}")
async def get_onboarding(onboarding_id: str, current_user: Dict = Depends(get_current_user)):
    """Get a specific onboarding"""
    onboarding = await db.onboardings.find_one(
        company_scope(current_user, onboarding_id=onboarding_id),
        {"_id": 0, "unique_link_token": 0}
    )
    if not onboarding:
        raise HTTPException(status_code=404, detail="Onboarding non trovato")
    return onboarding

@api_router.get("/onboarding/client/{token}")
async def get_client_onboarding(token: str, request: Request):
    """Public endpoint for client to view their onboarding checklist"""
    await enforce_rate_limit(request, "public_onboarding_view", limit=60, window_seconds=60 * 60)
    onboarding = await db.onboardings.find_one(
        {"unique_link_token": token},
        {"_id": 0, "unique_link_token": 0, "user_id": 0, "company_id": 0}
    )
    if not onboarding or (
        onboarding.get("link_expires_at")
        and parse_datetime(onboarding["link_expires_at"]) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=404, detail="Link non valido o scaduto")
    return onboarding

@api_router.put("/onboarding/client/{token}")
async def update_client_onboarding(token: str, update_data: OnboardingClientUpdate, request: Request):
    """Public endpoint for client to update their onboarding checklist"""
    await enforce_rate_limit(request, "public_onboarding_update", limit=20, window_seconds=60 * 60)
    onboarding = await db.onboardings.find_one({"unique_link_token": token}, {"_id": 0})
    if not onboarding or (
        onboarding.get("link_expires_at")
        and parse_datetime(onboarding["link_expires_at"]) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=404, detail="Link non valido o scaduto")

    original_items = onboarding.get("checklist_items", [])
    submitted_items = [item.model_dump() for item in update_data.checklist_items]
    if len(submitted_items) != len(original_items) or any(
        submitted.get("item") != original.get("item")
        for submitted, original in zip(submitted_items, original_items)
    ):
        raise HTTPException(status_code=400, detail="Checklist non valida")
    safe_items = [
        {
            **original,
            "completed": submitted["completed"],
            "uploaded_file": submitted.get("uploaded_file") or original.get("uploaded_file"),
        }
        for submitted, original in zip(submitted_items, original_items)
    ]
    all_completed = all(item.get("completed", False) for item in safe_items)
    now = datetime.now(timezone.utc)
    
    update_fields = {
        "checklist_items": safe_items,
        "status": "complete" if all_completed else "in_progress"
    }
    
    if all_completed:
        update_fields["completed_at"] = now.isoformat()
    
    await db.onboardings.update_one(
        {"unique_link_token": token, "company_id": onboarding["company_id"]},
        {"$set": update_fields}
    )
    
    return {"message": "Checklist aggiornata", "status": update_fields["status"]}

# ==================== MARKETING ENDPOINTS ====================

@api_router.get("/marketing/lead-sources")
async def get_lead_source_stats(current_user: Dict = Depends(get_current_user)):
    """Get lead source statistics and ROI"""
    pipeline = [
        {"$match": company_scope(current_user)},
        {"$group": {
            "_id": "$source",
            "client_count": {"$sum": 1},
            "total_revenue": {"$sum": "$revenue"}
        }},
        {"$sort": {"total_revenue": -1}}
    ]
    
    lead_stats = await db.lead_sources.aggregate(pipeline).to_list(100)
    
    marketing_efforts = await db.marketing_efforts.find(
        company_scope(current_user),
        {"_id": 0}
    ).to_list(100)
    
    hours_by_channel = {}
    for effort in marketing_efforts:
        channel = effort["channel"]
        hours_by_channel[channel] = hours_by_channel.get(channel, 0) + effort["hours_invested"]
    
    results = []
    total_revenue = sum(s["total_revenue"] for s in lead_stats)
    
    for stat in lead_stats:
        source = stat["_id"]
        hours = hours_by_channel.get(source, 1)
        roi = stat["total_revenue"] / hours if hours > 0 else stat["total_revenue"]
        percentage = (stat["total_revenue"] / total_revenue * 100) if total_revenue > 0 else 0
        
        results.append({
            "source": source,
            "client_count": stat["client_count"],
            "total_revenue": stat["total_revenue"],
            "total_hours": hours,
            "roi": round(roi, 2),
            "percentage": round(percentage, 2)
        })
    
    insight = None
    if results:
        top_source = results[0]
        if top_source["percentage"] > 50:
            insight = f"Il {round(top_source['percentage'])}% del tuo fatturato viene da {top_source['source'].replace('_', ' ')}. Concentra i tuoi sforzi qui!"
    
    return {"lead_sources": results, "insight": insight}

@api_router.post("/marketing/efforts")
async def create_marketing_effort(
    effort_data: MarketingEffortCreate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Track marketing effort hours"""
    effort_id = f"effort_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    effort_doc = {
        "effort_id": effort_id,
        "company_id": current_user["company_id"],
        "user_id": current_user["user_id"],
        "month": effort_data.month,
        "channel": effort_data.channel,
        "hours_invested": effort_data.hours_invested,
        "created_at": now.isoformat()
    }
    
    await db.marketing_efforts.insert_one(effort_doc)
    return {k: v for k, v in effort_doc.items() if k != "_id"}

@api_router.get("/marketing/efforts")
async def get_marketing_efforts(current_user: Dict = Depends(get_current_user)):
    """Get all marketing efforts"""
    efforts = await db.marketing_efforts.find(
        company_scope(current_user),
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return efforts

# ==================== AI CONTENT GENERATION ====================

@api_router.post("/configurator/photo-ai/preview")
async def prepare_photo_ai_preview(
    request: Request,
    photo: UploadFile = File(...),
    configuration: str = Form(...),
    graphic: Optional[UploadFile] = File(None),
    mask: Optional[UploadFile] = File(None),
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Validate a photographic wrap request at the server boundary.

    The endpoint never exposes provider credentials and never fabricates an
    image. With the default configuration it returns 503 after validation;
    only a future explicitly enabled adapter may produce a before/after image.
    """
    await enforce_rate_limit(
        request,
        "configurator_photo_ai",
        limit=3,
        window_seconds=60 * 60,
        identifier=current_user["user_id"],
    )
    await enforce_rate_limit(
        request,
        "configurator_photo_ai_daily",
        limit=photo_ai_adapter.daily_limit,
        window_seconds=24 * 60 * 60,
        identifier=current_user["company_id"],
    )
    try:
        configuration_data = json.loads(configuration)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Configurazione foto non valida")

    try:
        photo_bytes = await read_upload_limited(
            photo, max_bytes=PHOTO_AI_MAX_PHOTO_BYTES, label="Foto"
        )
        graphic_bytes = (
            await read_upload_limited(
                graphic, max_bytes=PHOTO_AI_MAX_GRAPHIC_BYTES, label="Grafica"
            )
            if graphic else None
        )
        mask_bytes = (
            await read_upload_limited(
                mask, max_bytes=PHOTO_AI_MAX_MASK_BYTES, label="Maschera"
            )
            if mask else None
        )
        normalized = normalize_photo_request(
            configuration_data,
            photo=photo_bytes,
            photo_type=(photo.content_type or "").lower(),
            graphic=graphic_bytes,
            graphic_type=(graphic.content_type or "").lower() if graphic else None,
            mask=mask_bytes,
            mask_type=(mask.content_type or "").lower() if mask else None,
        )
    except PhotoAiValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not photo_ai_adapter.configured:
        raise HTTPException(
            status_code=503,
            detail="Servizio AI foto non configurato: nessuna immagine è stata generata",
            headers={"Retry-After": "3600"},
        )
    try:
        result = await photo_ai_adapter.generate(normalized)
    except PhotoAiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except PhotoAiValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except PhotoAiProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {
        "status": result.status,
        "modified_image": (
            {"content_type": result.modified_image_content_type, "base64": result.modified_image_base64}
            if result.modified_image_base64 else None
        ),
    }

@api_router.post("/marketing/ai/generate")
async def generate_ai_content(
    request_data: ContentGenerationRequest,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Generate marketing content using AI"""
    from google import genai
    from google.genai import types
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not EXTERNAL_SERVICES_ENABLED or not api_key:
        raise HTTPException(status_code=503, detail="Generazione AI non configurata. Configura Gemini per attivarla.")
    
    prompts = {
        "bacino_utenza": """Sei un esperto di marketing per installatori auto (PPF, wrap, oscuramento vetri) in Italia.
Analizza il bacino di utenza per un installatore nella zona indicata. Considera:
- Tipologia di clienti potenziali (privati, flotte aziendali, concessionarie)
- Potere d'acquisto della zona
- Concorrenza presente
- Opportunità di mercato

Zona/Città: {user_input}

Fornisci un'analisi dettagliata in italiano.""",
        
        "trova_argomenti": """Sei un esperto di content marketing per il settore automotive.
In base al contesto fornito, suggerisci 10 argomenti per contenuti social che un installatore PPF/Wrap può pubblicare.
Per ogni argomento indica:
- Titolo accattivante
- Formato consigliato (post, reel, carosello, video)
- Obiettivo (awareness, engagement, conversione)

Contesto: {context}
Input aggiuntivo: {user_input}

Rispondi in italiano con un elenco strutturato.""",
        
        "pain_points": """Sei un esperto di marketing e psicologia del consumatore.
Identifica i principali pain points (problemi/preoccupazioni) dei clienti di un installatore auto PPF/Wrap.
Per ogni pain point indica:
- Il problema
- L'emozione associata
- Come il servizio lo risolve
- Possibile contenuto da creare

Contesto: {context}
Input: {user_input}

Rispondi in italiano.""",
        
        "genera_idea": """Sei un creativo specializzato in contenuti per social media nel settore automotive.
Genera un'idea dettagliata per un contenuto basandoti su:
Contesto: {context}
Argomento: {user_input}

Fornisci:
- Hook (gancio iniziale)
- Struttura del contenuto
- Call to action
- Hashtag suggeriti

Rispondi in italiano.""",
        
        "sviluppo_testo": """Sei un copywriter esperto di social media marketing per il settore automotive.
Scrivi il testo completo per il contenuto richiesto:

Contesto: {context}
Idea: {user_input}

Fornisci:
- Testo completo pronto per la pubblicazione
- Versione breve per Instagram
- Versione per Facebook/LinkedIn
- Caption alternativa

Rispondi in italiano con tono professionale ma accessibile.""",
        
        "sviluppo_video": """Sei un video content strategist per il settore automotive.
Crea uno script video completo per:

Contesto: {context}
Idea: {user_input}

Fornisci:
- Hook iniziale (primi 3 secondi)
- Script parlato completo con timing
- Indicazioni per le riprese
- Musica/audio suggerito
- Testo per sottotitoli
- Durata consigliata

Rispondi in italiano."""
    }
    
    if request_data.step not in prompts:
        raise HTTPException(status_code=400, detail="Step non valido")
    
    prompt_template = prompts[request_data.step]
    context_str = str(request_data.context) if request_data.context else "Nessun contesto precedente"
    user_input = request_data.user_input or "Nessun input specifico"
    
    final_prompt = prompt_template.format(context=context_str, user_input=user_input)
    
    try:
        model = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
        async with genai.Client(api_key=api_key).aio as ai_client:
            ai_response = await ai_client.models.generate_content(
                model=model,
                contents=final_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "Sei un esperto di marketing digitale specializzato nel settore "
                        "automotive italiano. Rispondi sempre in italiano in modo chiaro "
                        "e professionale."
                    )
                ),
            )

        response = ai_response.text
        if not response:
            raise RuntimeError("Il modello non ha restituito contenuto")
        
        # Save to history
        await db.ai_content_history.insert_one({
            "history_id": f"ai_{uuid.uuid4().hex[:12]}",
            "company_id": current_user["company_id"],
            "user_id": current_user["user_id"],
            "step": request_data.step,
            "context": request_data.context,
            "user_input": request_data.user_input,
            "response": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"content": response, "step": request_data.step}
    except Exception:
        logger.error("AI generation failed")
        raise HTTPException(status_code=500, detail="Errore nella generazione")

@api_router.get("/marketing/ai/history")
async def get_ai_content_history(current_user: Dict = Depends(get_current_user)):
    """Get AI content generation history"""
    history = await db.ai_content_history.find(
        company_scope(current_user),
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return history

# ==================== DASHBOARD ENDPOINTS ====================

@api_router.get("/dashboard/metrics")
async def get_dashboard_metrics(current_user: Dict = Depends(get_current_user)):
    """Get dashboard metrics for current user"""
    company_id = current_user["company_id"]
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    latest_accrual = await db.tax_accruals.find_one(
        {"company_id": company_id},
        {"_id": 0},
        sort=[("month", -1)]
    )
    tax_reserve = latest_accrual["cumulative_balance"] if latest_accrual else 0
    
    jobs_this_month = await db.jobs.find(
        {
            "company_id": company_id,
            "completed_date": {"$gte": month_start.isoformat()},
            "is_quote": {"$ne": True},
        },
        {"_id": 0}
    ).to_list(1000)
    
    total_jobs = len(jobs_this_month)
    total_revenue = sum(j["quote_amount"] for j in jobs_this_month)
    avg_margin = sum(j["profit_margin"] for j in jobs_this_month) / total_jobs if total_jobs > 0 else 0
    
    if avg_margin >= 30:
        cash_flow_status = "green"
    elif avg_margin >= 15:
        cash_flow_status = "yellow"
    else:
        cash_flow_status = "red"
    
    profitability = await db.jobs.aggregate([
        {"$match": {"company_id": company_id, "is_quote": {"$ne": True}}},
        {"$group": {"_id": "$job_type", "avg_margin": {"$avg": "$profit_margin"}}},
        {"$sort": {"avg_margin": -1}},
        {"$limit": 1}
    ]).to_list(1)
    most_profitable = profitability[0]["_id"] if profitability else None
    
    lead_stats = await db.lead_sources.aggregate([
        {"$match": {"company_id": company_id}},
        {"$group": {"_id": "$source", "total_revenue": {"$sum": "$revenue"}}},
        {"$sort": {"total_revenue": -1}},
        {"$limit": 1}
    ]).to_list(1)
    top_lead = lead_stats[0]["_id"] if lead_stats else None
    
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    deadlines = get_tax_deadlines_by_regime(tax_regime)
    
    return {
        "tax_reserve_balance": round(tax_reserve, 2),
        "cash_flow_status": cash_flow_status,
        "most_profitable_job_type": most_profitable,
        "top_lead_source": top_lead,
        "upcoming_tax_deadlines": deadlines,
        "total_jobs_this_month": total_jobs,
        "total_revenue_this_month": round(total_revenue, 2),
        "average_profit_margin": round(avg_margin, 2)
    }

# ==================== ADMIN ENDPOINTS ====================

@api_router.post("/admin/login")
async def admin_login(user_data: UserLogin, response: Response, request: Request):
    """Admin login endpoint"""
    email = normalize_email(str(user_data.email))
    await enforce_rate_limit(
        request,
        "admin_login",
        limit=5,
        window_seconds=15 * 60,
        identifier=email,
    )
    if email != normalize_email(ADMIN_EMAIL):
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    admin_user = await db.users.find_one({"email": email}, {"_id": 0})
    if not admin_user or not admin_user.get("password_hash"):
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    try:
        password_valid = verify_password(user_data.password, admin_user["password_hash"])
    except (TypeError, ValueError):
        password_valid = False

    if not password_valid:
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    now_iso = datetime.now(timezone.utc).isoformat()
    company = await db.companies.find_one({"company_id": PLATFORM_COMPANY_ID}, {"_id": 0})
    if not company:
        await db.companies.insert_one({
            "company_id": PLATFORM_COMPANY_ID,
            "name": "BESIDE",
            "owner_user_id": "admin_super",
            "status": "active",
            "subscription_status": "internal",
            "trial_started_at": None,
            "trial_ends_at": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "plan_id": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        })
    await db.users.update_one(
        {"user_id": admin_user["user_id"]},
        {"$set": {
            "company_id": PLATFORM_COMPANY_ID,
            "role": "admin",
            "platform_role": "super_admin",
            "email_verified": True,
            "email_verification_exempt": False,
            "is_active": True,
            "last_login_at": now_iso,
            "updated_at": now_iso,
        }},
    )

    admin_user = await _load_active_user(admin_user["user_id"])
    if not admin_user.get("totp_enabled"):
        if not email_delivery_configured():
            await audit_event(
                "admin_mfa_setup_unavailable",
                user=admin_user,
                request=request,
                metadata={"platform_admin": True, "email_configured": False},
            )
            raise HTTPException(
                status_code=503,
                detail="Email di attivazione MFA non configurata; usa la procedura locale protetta",
            )
        await db.user_sessions.update_many(
            {"user_id": admin_user["user_id"], "session_type": "admin_mfa_setup", "revoked_at": None},
            {"$set": {"revoked_at": now_iso}},
        )
        activation_code = f"{secrets.randbelow(100_000_000):08d}"
        setup_token = await create_admin_mfa_setup_session(admin_user, activation_code)
        delivered = await send_admin_mfa_activation_email(admin_user["email"], activation_code)
        if not delivered:
            await db.user_sessions.update_one(
                {"token_hash": hash_token(setup_token), "revoked_at": None},
                {"$set": {"revoked_at": now_iso}},
            )
            raise HTTPException(status_code=503, detail="Impossibile inviare il codice di attivazione MFA")
        set_session_cookie(response, setup_token)
        await audit_event(
            "admin_mfa_setup_started",
            user=admin_user,
            request=request,
            metadata={"platform_admin": True, "mfa_configured": False, "email_delivery": True},
        )
        return {"mfa_setup_required": True, "expires_in": 10 * 60}
    if admin_user.get("totp_enabled"):
        pending_token = await create_mfa_pending_session(admin_user)
        set_session_cookie(response, pending_token)
        await audit_event("login_password_verified", user=admin_user, request=request,
                          metadata={"platform_admin": True, "mfa_required": True})
        return {"mfa_required": True, "expires_in": MFA_SESSION_MINUTES * 60}

async def _get_admin_mfa_setup_context(request: Request):
    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Configurazione MFA non autenticata")
    session = await db.user_sessions.find_one(
        {"token_hash": hash_token(token), "session_type": "admin_mfa_setup", "revoked_at": None},
        {"_id": 0},
    )
    if not session or _session_expired(session):
        raise HTTPException(status_code=401, detail="Sessione di configurazione MFA scaduta")
    user = await db.users.find_one(
        {"user_id": session["user_id"], "platform_role": "super_admin", "is_active": {"$ne": False}},
        {"_id": 0},
    )
    if not user:
        raise HTTPException(status_code=403, detail="Account amministratore non autorizzato")
    return token, session, user

@api_router.post("/admin/mfa/activation/verify-email")
async def verify_admin_mfa_activation_email(
    data: AdminMfaActivationCodeRequest,
    request: Request,
):
    _, session, user = await _get_admin_mfa_setup_context(request)
    await enforce_rate_limit(request, "admin_mfa_activation_email", limit=5, window_seconds=10 * 60,
                             identifier=user["user_id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    updated = await db.user_sessions.find_one_and_update(
        {
            "session_id": session["session_id"],
            "revoked_at": None,
            "activation_code_hash": hash_token(data.code),
            "activation_attempts": {"$lt": 5},
            "activation_code_used_at": {"$exists": False},
            "expires_at_dt": {"$gt": datetime.now(timezone.utc)},
        },
        {"$set": {"activation_code_used_at": now_iso, "email_verified_at": now_iso},
         "$unset": {"activation_code_hash": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        failed = await db.user_sessions.find_one_and_update(
            {"session_id": session["session_id"], "revoked_at": None, "activation_attempts": {"$lt": 5}},
            {"$inc": {"activation_attempts": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if failed and failed.get("activation_attempts", 0) >= 5:
            await db.user_sessions.update_one(
                {"session_id": session["session_id"], "revoked_at": None},
                {"$set": {"revoked_at": now_iso}},
            )
        raise HTTPException(status_code=401, detail="Codice email non valido o scaduto")

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    await db.user_sessions.update_one(
        {"session_id": session["session_id"], "revoked_at": None, "email_verified_at": now_iso},
        {"$set": {"totp_pending_secret_enc": encrypted, "totp_pending_created_at": now_iso}},
    )
    label = f"{TOTP_ISSUER}:{user['email']}"
    uri = (
        f"otpauth://totp/{label}?secret={secret}&issuer={TOTP_ISSUER}"
        f"&algorithm=SHA1&digits=6&period={TOTP_STEP_SECONDS}"
    )
    await audit_event("admin_mfa_email_verified", user=user, request=request,
                      metadata={"platform_admin": True})
    return {"totp_setup_required": True, "secret": secret, "otpauth_uri": uri,
            "expires_in": 10 * 60}

@api_router.post("/admin/mfa/activation/confirm")
async def confirm_admin_mfa_activation(
    data: AdminMfaActivationTotpRequest,
    response: Response,
    request: Request,
):
    _, session, user = await _get_admin_mfa_setup_context(request)
    await enforce_rate_limit(request, "admin_mfa_activation_totp", limit=5, window_seconds=10 * 60,
                             identifier=user["user_id"])
    pending = session.get("totp_pending_secret_enc")
    if not session.get("email_verified_at") or not pending:
        raise HTTPException(status_code=409, detail="Verifica prima il codice inviato via email")
    if verify_totp_code(decrypt_totp_secret(pending), data.code) is None:
        raise HTTPException(status_code=401, detail="Codice TOTP non valido")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = await db.users.update_one(
        {"user_id": user["user_id"], "platform_role": "super_admin", "totp_enabled": {"$ne": True}},
        {"$set": {"totp_secret_enc": pending, "totp_enabled": True, "totp_enabled_at": now_iso},
         "$unset": {"totp_pending_secret_enc": "", "totp_pending_created_at": "",
                    "totp_recovery_codes": "", "totp_recovery_codes_rotated_at": ""}},
    )
    if updated.modified_count != 1:
        raise HTTPException(status_code=409, detail="MFA già attivata; ripeti il login")
    await db.user_sessions.update_many(
        {"user_id": user["user_id"], "revoked_at": None},
        {"$set": {"revoked_at": now_iso}},
    )
    user = await _load_active_user(user["user_id"])
    access_token = await create_authenticated_session(user, mfa_verified=True)
    set_session_cookie(response, access_token)
    await audit_event("admin_mfa_enabled", user=user, request=request,
                      metadata={"platform_admin": True})
    return {"enabled": True, "user": public_user(user),
            "message": "MFA attivata. Configura un contatto fidato nella sezione Sicurezza."}

SUPPORT_CATEGORIES = {"password", "authentication", "privacy", "billing", "technical", "other"}
SUPPORT_STATUSES = {"open", "pending", "closed"}
SUPPORT_PRIORITIES = {"low", "normal", "high", "urgent"}
SENSITIVE_TICKET_PATTERN = re.compile(r"(?i)(password|passwd|token|secret|api[_ -]?key|jwt|totp|session[_ -]?token)")

def _validate_support_content(subject: str, message: str) -> None:
    if SENSITIVE_TICKET_PATTERN.search(f"{subject}\n{message}"):
        raise HTTPException(status_code=400, detail="Non inserire password, token o segreti nella richiesta")

def _ticket_id() -> str:
    return f"TCK-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"

@api_router.post("/support/tickets")
async def create_public_support_ticket(data: SupportTicketCreate, request: Request):
    """Una richiesta pubblica non conferma se l'email appartiene a un account."""
    await enforce_rate_limit(request, "support_ticket_public_ip", limit=5, window_seconds=60 * 60)
    if data.category not in SUPPORT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")
    _validate_support_content(data.subject, data.message)
    now_iso = datetime.now(timezone.utc).isoformat()
    email = normalize_email(str(data.email)) if data.email else None
    ticket = {"ticket_id": _ticket_id(), "category": data.category, "subject": data.subject.strip(),
              "status": "open", "priority": "normal", "user_id": None, "company_id": None,
              "requester_email": email, "created_at": now_iso, "updated_at": now_iso,
              "messages": [{"author_type": "requester", "message": data.message.strip(), "created_at": now_iso}]}
    await db.support_tickets.insert_one(ticket)
    await audit_event("support_ticket_created_public", request=request, metadata={"ticket_id": ticket["ticket_id"], "category": data.category})
    return {"message": "Richiesta ricevuta. Se necessario, riceverai una risposta all'indirizzo indicato."}

@api_router.post("/auth/support/tickets")
async def create_authenticated_support_ticket(data: SupportTicketCreate, request: Request, current_user: Dict = Depends(get_current_user)):
    if data.category not in SUPPORT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")
    _validate_support_content(data.subject, data.message)
    now_iso = datetime.now(timezone.utc).isoformat()
    ticket = {"ticket_id": _ticket_id(), "category": data.category, "subject": data.subject.strip(),
              "status": "open", "priority": "normal", "user_id": current_user["user_id"],
              "company_id": current_user["company_id"], "requester_email": current_user["email"],
              "created_at": now_iso, "updated_at": now_iso,
              "messages": [{"author_type": "requester", "message": data.message.strip(), "created_at": now_iso}]}
    await db.support_tickets.insert_one(ticket)
    await audit_event("support_ticket_created", user=current_user, request=request, metadata={"ticket_id": ticket["ticket_id"], "category": data.category})
    return {"ticket_id": ticket["ticket_id"], "status": ticket["status"]}

@api_router.get("/auth/support/tickets")
async def list_my_support_tickets(current_user: Dict = Depends(get_current_user)):
    tickets = await db.support_tickets.find({"user_id": current_user["user_id"], "company_id": current_user["company_id"]}, {"_id": 0, "requester_email": 0}).sort("created_at", -1).to_list(100)
    return {"tickets": tickets}

@api_router.get("/admin/support/tickets")
async def admin_list_support_tickets(
    category: Optional[str] = Query(default=None), status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None), search: Optional[str] = Query(default=None, max_length=200),
    created_from: Optional[str] = Query(default=None), created_to: Optional[str] = Query(default=None),
    admin_user: Dict = Depends(get_admin_user),
):
    query: Dict[str, Any] = {}
    if category: query["category"] = category
    if status: query["status"] = status
    if priority: query["priority"] = priority
    if created_from or created_to:
        date_query: Dict[str, Any] = {}
        for key, value, operator in (("created_from", created_from, "$gte"), ("created_to", created_to, "$lte")):
            if value:
                try:
                    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    date_query[operator] = parsed.astimezone(timezone.utc).isoformat()
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"Data {key} non valida")
        query["created_at"] = date_query
    if search:
        safe = re.escape(search.strip())
        query["$or"] = [{"ticket_id": {"$regex": safe, "$options": "i"}}, {"subject": {"$regex": safe, "$options": "i"}}, {"requester_email": {"$regex": safe, "$options": "i"}}]
    tickets = await db.support_tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"tickets": tickets}

@api_router.patch("/admin/support/tickets/{ticket_id}")
async def admin_update_support_ticket(ticket_id: str, data: SupportTicketUpdate, request: Request, admin_user: Dict = Depends(get_admin_user)):
    if data.status is not None and data.status not in SUPPORT_STATUSES:
        raise HTTPException(status_code=400, detail="Stato non valido")
    if data.priority is not None and data.priority not in SUPPORT_PRIORITIES:
        raise HTTPException(status_code=400, detail="Priorità non valida")
    if data.message:
        _validate_support_content("", data.message)
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {key: value for key, value in {"status": data.status, "priority": data.priority}.items() if value is not None}
    if data.message:
        updates.setdefault("messages", None)
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket non trovato")
    if data.message:
        updates.pop("messages", None)
        await db.support_tickets.update_one({"ticket_id": ticket_id}, {"$push": {"messages": {"author_type": "platform_owner", "message": data.message.strip(), "created_at": now_iso}}, "$set": {**updates, "updated_at": now_iso}})
    else:
        await db.support_tickets.update_one({"ticket_id": ticket_id}, {"$set": {**updates, "updated_at": now_iso}})
    await audit_event("support_ticket_updated", user=admin_user, request=request, company_id=ticket.get("company_id"), metadata={"ticket_id": ticket_id, "status": data.status, "priority": data.priority})
    return {"ticket_id": ticket_id, "status": data.status or ticket.get("status"), "priority": data.priority or ticket.get("priority")}

@api_router.get("/admin/users")
async def admin_get_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None, max_length=200),
    admin_user: Dict = Depends(get_admin_user)
):
    """Get all users (admin only)"""
    query = {"platform_role": {"$ne": "super_admin"}}
    if search:
        safe_search = re.escape(search.strip())
        query["$or"] = [
            {"email": {"$regex": safe_search, "$options": "i"}},
            {"business_name": {"$regex": safe_search, "$options": "i"}}
        ]
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    
    return {"users": users, "total": total}

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin_user: Dict = Depends(get_admin_user)):
    """Get a specific user (admin only)"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return user

@api_router.put("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    update_data: AdminUserUpdate,
    request: Request,
    admin_user: Dict = Depends(get_admin_user),
):
    """Update a user (admin only)"""
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if target.get("platform_role") == "super_admin":
        raise HTTPException(status_code=400, detail="L'amministratore di sistema non è modificabile qui")
    raw_updates = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_fields = {
        key: value for key, value in raw_updates.items()
        if key in {"role", "is_active"}
    }
    if "subscription_tier" in raw_updates:
        if raw_updates["subscription_tier"] not in SUBSCRIPTION_TIERS:
            raise HTTPException(status_code=400, detail="Piano non valido")
        update_fields["subscription_tier"] = raw_updates["subscription_tier"]
    if "subscription_status" in raw_updates:
        legacy_status = raw_updates["subscription_status"]
        if legacy_status not in {"trial", "trialing", "active", "cancelled", "past_due"}:
            raise HTTPException(status_code=400, detail="Stato abbonamento non valido")
        update_fields["subscription_status"] = "trial" if legacy_status == "trialing" else legacy_status
    if "role" in update_fields and update_fields["role"] not in COMPANY_ROLES:
        raise HTTPException(status_code=400, detail="Ruolo non valido")
    if target.get("role") == "owner" and update_fields.get("role", "owner") != "owner":
        raise HTTPException(status_code=400, detail="Trasferisci prima la proprietà dell'azienda")
    if target.get("role") != "owner" and update_fields.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Il trasferimento di proprietà non è ancora supportato")
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": user_id, "company_id": target["company_id"]},
            {"$set": update_fields},
        )
    company_updates = {}
    if "subscription_tier" in raw_updates:
        company_updates["plan_id"] = raw_updates["subscription_tier"]
    if "subscription_status" in raw_updates:
        company_updates["subscription_status"] = (
            "trialing" if raw_updates["subscription_status"] == "trial" else raw_updates["subscription_status"]
        )
    if company_updates:
        company_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.companies.update_one(
            {"company_id": target["company_id"]},
            {"$set": company_updates},
        )
    if "role" in update_fields and update_fields["role"] != target.get("role"):
        await audit_event(
            "role_changed",
            user=admin_user,
            request=request,
            company_id=target["company_id"],
            metadata={
                "target_user_id": user_id,
                "old_role": target.get("role"),
                "new_role": update_fields["role"],
                "changed_by_platform_admin": True,
            },
        )
    updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user

@api_router.put("/admin/companies/{company_id}/status")
async def admin_update_company_status(
    company_id: str,
    data: CompanyStatusUpdate,
    request: Request,
    admin_user: Dict = Depends(get_admin_user),
):
    if data.status not in {"active", "suspended", "archived"}:
        raise HTTPException(status_code=400, detail="Stato aziendale non valido")
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Azienda non trovata")
    if company_id == PLATFORM_COMPANY_ID:
        raise HTTPException(status_code=400, detail="Lo stato dell'azienda di sistema non è modificabile")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"status": data.status, "updated_at": now_iso}},
    )
    await audit_event(
        "company_status_changed",
        user=admin_user,
        company_id=company_id,
        request=request,
        metadata={"old_status": company.get("status"), "new_status": data.status},
    )
    return {"company_id": company_id, "status": data.status}

@api_router.get("/admin/stats")
async def admin_get_stats(admin_user: Dict = Depends(get_admin_user)):
    """Get admin dashboard statistics"""
    total_users = await db.users.count_documents({"platform_role": {"$ne": "super_admin"}})
    active_users = await db.users.count_documents({"is_active": True, "platform_role": {"$ne": "super_admin"}})
    trial_users = await db.companies.count_documents({"subscription_status": "trialing"})
    paying_users = await db.companies.count_documents({"subscription_status": "active"})
    
    total_jobs = await db.jobs.count_documents({})
    
    # Use aggregation for revenue calculation (optimized)
    revenue_result = await db.jobs.aggregate([
        {"$match": {"is_quote": {"$ne": True}}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$quote_amount"}}}
    ]).to_list(1)
    total_revenue = revenue_result[0]["total_revenue"] if revenue_result else 0
    
    # Users by tier
    users_by_tier = await db.companies.aggregate([
        {"$match": {"company_id": {"$ne": PLATFORM_COMPANY_ID}}},
        {"$group": {"_id": "$plan_id", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "trial_users": trial_users,
        "paying_users": paying_users,
        "total_jobs": total_jobs,
        "total_revenue": total_revenue,
        "users_by_tier": users_by_tier
    }

@api_router.get("/admin/payments")
async def admin_get_payments(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    admin_user: Dict = Depends(get_admin_user)
):
    """Get all payment transactions (admin only)"""
    payments = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.payment_transactions.count_documents({})
    return {"payments": payments, "total": total}

# Admin Chat
@api_router.post("/admin/chat/send")
async def admin_send_chat(message_data: AdminChatMessage, admin_user: Dict = Depends(get_admin_user)):
    """Send a chat message to a user (admin only)"""
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    target_user = await db.users.find_one({"user_id": message_data.user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    message_doc = {
        "message_id": message_id,
        "company_id": target_user["company_id"],
        "user_id": message_data.user_id,
        "sender_type": "admin",
        "sender_id": admin_user["user_id"],
        "message": message_data.message,
        "read": False,
        "created_at": now
    }
    
    await db.admin_chat.insert_one(message_doc)
    return message_doc

@api_router.get("/admin/chat/{user_id}")
async def admin_get_chat(user_id: str, admin_user: Dict = Depends(get_admin_user)):
    """Get chat history with a user (admin only)"""
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    messages = await db.admin_chat.find(
        {"user_id": user_id, "company_id": target_user["company_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return messages

@api_router.get("/chat/messages")
async def get_user_chat_messages(current_user: Dict = Depends(get_current_user)):
    """Get chat messages for current user"""
    messages = await db.admin_chat.find(
        company_scope(current_user, user_id=current_user["user_id"]),
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Mark as read
    await db.admin_chat.update_many(
        company_scope(
            current_user,
            user_id=current_user["user_id"],
            sender_type="admin",
            read=False,
        ),
        {"$set": {"read": True}}
    )
    
    return messages

@api_router.post("/chat/send")
async def user_send_chat(
    message_data: ChatMessageCreate,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member", "viewer")),
):
    """Send a chat message to admin"""
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    message_doc = {
        "message_id": message_id,
        "company_id": current_user["company_id"],
        "user_id": current_user["user_id"],
        "sender_type": "user",
        "sender_id": current_user["user_id"],
        "message": message_data.message,
        "read": False,
        "created_at": now
    }
    
    await db.admin_chat.insert_one(message_doc)
    return message_doc

# ==================== UTILITY ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "BESIDE API - Benvenuto!", "version": "1.0.0"}


@app.get("/health", tags=["health"])
async def health_check():
    """Report API readiness only when MongoDB is reachable."""
    try:
        await client.admin.command("ping")
    except Exception:
        logger.exception("MongoDB health check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "unavailable"},
        )

    return {"status": "healthy", "database": "connected"}

@api_router.get("/config/job-types")
async def get_job_types():
    return {"job_types": JOB_TYPES}

@api_router.get("/config/vehicle-types")
async def get_vehicle_types():
    return {"vehicle_types": VEHICLE_TYPES}

@api_router.get("/config/lead-sources")
async def get_lead_sources():
    return {"lead_sources": LEAD_SOURCES}

@api_router.get("/config/tax-regimes")
async def get_tax_regimes():
    return {"tax_regimes": TAX_REGIMES}

@api_router.get("/config/business-types")
async def get_business_types():
    return {"business_types": BUSINESS_TYPES}

@api_router.get("/config/subscription-tiers")
async def get_subscription_tiers():
    return {
        "tiers": [
            {"id": "essential", "name": "Essential", "price": 97.00, "features": ["Tutte le funzionalità base", "Max 50 lavori/mese", "1 utente", "Supporto email"]},
            {"id": "professional", "name": "Professional", "price": 197.00, "features": ["Lavori illimitati", "AI Workflows (3 template)", "Supporto prioritario (24h)", "Review trimestrale"]},
            {"id": "elite", "name": "Elite", "price": 397.00, "features": ["Configuratore white-label", "Chiamata strategica mensile", "Supporto WhatsApp illimitato", "Richieste custom"]}
        ]
    }


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
    )
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.url.path.startswith(("/api/auth/", "/api/admin/", "/api/quote/", "/api/onboarding/client/")):
        response.headers.setdefault("Cache-Control", "no-store")
    return response

# Independent payment integration; shares existing tenant-aware authentication.
from billing import build_billing_router
app.include_router(build_billing_router(
    db, get_current_user, require_company_roles, FRONTEND_PUBLIC_URL,
    lambda: EXTERNAL_SERVICES_ENABLED,
))

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
