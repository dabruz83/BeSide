from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks
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
from pymongo import ReturnDocument

from multitenancy import (
    COMPANY_ROLES,
    PLATFORM_COMPANY_ID,
    company_document,
    company_scope,
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
if len(JWT_SECRET) < 32:
    raise RuntimeError('JWT_SECRET_KEY must contain at least 32 characters')

# Admin credentials
ADMIN_EMAIL = get_required_environment_variable('ADMIN_EMAIL')
ADMIN_PASSWORD = get_required_environment_variable('ADMIN_PASSWORD')
if len(ADMIN_PASSWORD) < 12:
    raise RuntimeError('ADMIN_PASSWORD must contain at least 12 characters')

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', '').strip()
ADMIN_NOTIFICATION_EMAIL = os.environ.get('ADMIN_NOTIFICATION_EMAIL', '').strip()

# Browser origins allowed to call the API (comma-separated, without paths).
CORS_ORIGINS = parse_cors_origins(get_required_environment_variable('CORS_ORIGINS'))
FRONTEND_PUBLIC_URL = (
    os.environ.get('FRONTEND_PUBLIC_URL', '').strip().rstrip('/') or CORS_ORIGINS[0]
)
OAUTH_SESSION_URL = os.environ.get('OAUTH_SESSION_URL', '').strip()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        stats = await migrate_to_company_tenancy(db, ADMIN_EMAIL)
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

# Default waste percentages
DEFAULT_WASTE = {"ppf": 0.20, "vinyl": 0.12}

# Company roles are separate from the explicit ``platform_role`` used by BESIDE.
USER_ROLES = list(COMPANY_ROLES)

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    first_name: str = ""
    business_name: str
    team_size: int = 1
    services: List[str] = []
    tax_regime: str = "forfettario_15"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class EmailRequest(BaseModel):
    email: EmailStr

class TokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)

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

# Job Models
class JobCreate(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    job_type: str
    vehicle_type: str
    vehicle_info: Optional[str] = None
    quote_amount: float
    hours_worked: float
    materials_cost: float
    waste_percentage: Optional[float] = None
    lead_source: Optional[str] = None
    notes: Optional[str] = None
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
    client_signature: Optional[str] = None
    notes: Optional[str] = None

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
    client_name: str
    client_email: EmailStr
    vehicle_info: Optional[str] = None

class OnboardingClientUpdate(BaseModel):
    checklist_items: List[Dict[str, Any]]

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
    user_id: str
    message: str

# ==================== HELPER FUNCTIONS ====================

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

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_jwt_token(
    user_id: str,
    email: str,
    role: str = "member",
    company_id: str = "",
    jti: Optional[str] = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "company_id": company_id,
        "type": "access",
        "jti": jti or uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRATION_DAYS),
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

async def create_authenticated_session(user: Dict[str, Any]) -> str:
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
        "expires_at": (now + timedelta(days=JWT_EXPIRATION_DAYS)).isoformat(),
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
    if not user.get("company_id"):
        raise HTTPException(status_code=403, detail="Account non associato a un'azienda")

    company = await db.companies.find_one({"company_id": user["company_id"]}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=403, detail="Azienda non trovata")
    if company.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Azienda non attiva")
    user["company"] = company
    return user

async def get_current_user(request: Request) -> Dict[str, Any]:
    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")

    token_digest = hash_token(token)
    session = await db.user_sessions.find_one(
        {"token_hash": token_digest, "revoked_at": None},
        {"_id": 0},
    )
    if not session:
        # Temporary compatibility with pre-migration OAuth sessions. The raw
        # credential is removed as soon as it is successfully used.
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            await db.user_sessions.update_one(
                {"session_token": token},
                {"$set": {"token_hash": token_digest}, "$unset": {"session_token": ""}},
            )

    if session and session.get("session_type") != "jwt":
        if _session_expired(session):
            raise HTTPException(status_code=401, detail="Sessione scaduta")
        return await _load_active_user(session["user_id"])

    try:
        payload = decode_jwt_token(token)
        if payload.get("type", "access") != "access":
            raise HTTPException(status_code=401, detail="Tipo di token non valido")
        # Legacy JWTs did not contain a jti. They remain valid until their own
        # expiry; all newly issued tokens require a non-revoked DB session.
        if payload.get("jti"):
            if not session or session.get("jti") != payload["jti"] or _session_expired(session):
                raise HTTPException(status_code=401, detail="Sessione revocata o scaduta")
        return await _load_active_user(payload["user_id"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token non valido")

async def get_admin_user(request: Request) -> Dict[str, Any]:
    """Require explicit platform privileges, never a company role alone."""
    user = await get_current_user(request)
    if user.get("platform_role") != "super_admin":
        raise HTTPException(status_code=403, detail="Accesso negato - richiesti privilegi admin")
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
    await db.audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:16]}",
        "event": event,
        "user_id": user_id or (user or {}).get("user_id"),
        "company_id": company_id or (user or {}).get("company_id"),
        "ip_address": request.client.host if request and request.client else None,
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
        "is_active": bool(user.get("is_active", True)),
        "created_at": user.get("created_at", ""),
        "updated_at": user.get("updated_at", ""),
        "last_login_at": user.get("last_login_at"),
    }

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

async def send_email_sendgrid(to_email: str, subject: str, html_content: str):
    """Send email via SendGrid API"""
    if not SENDGRID_API_KEY:
        logger.warning("SendGrid API key not configured, skipping email")
        return False
    if not SENDER_EMAIL or not to_email:
        logger.warning("SendGrid sender or recipient email not configured, skipping email")
        return False
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {SENDGRID_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "personalizations": [{"to": [{"email": to_email}]}],
                    "from": {"email": SENDER_EMAIL, "name": "BESIDE"},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html_content}]
                },
                timeout=30.0
            )
            if response.status_code in [200, 202]:
                logger.info(f"Email sent successfully to {to_email}")
                return True
            else:
                logger.error(f"SendGrid error: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False

async def send_registration_notification(user_email: str, business_name: str, registration_date: str):
    """Send notification email to admin when a new user registers"""
    subject = f"🎉 Nuova registrazione BESIDE: {business_name}"
    
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
                    <div class="value">{business_name}</div>
                </div>
                <div class="field">
                    <div class="label">Email</div>
                    <div class="value">{user_email}</div>
                </div>
                <div class="field">
                    <div class="label">Data Registrazione</div>
                    <div class="value">{registration_date}</div>
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

async def send_email_verification(user_email: str, token: str) -> bool:
    verification_url = f"{FRONTEND_PUBLIC_URL}/verify-email?token={token}"
    return await send_email_sendgrid(
        user_email,
        "Verifica il tuo indirizzo email BESIDE",
        (
            "<p>Conferma il tuo indirizzo email per BESIDE.</p>"
            f'<p><a href="{verification_url}">Verifica email</a></p>'
            "<p>Il link scade tra 24 ore e può essere usato una sola volta.</p>"
        ),
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
        "used_at": None,
    })
    return token

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate, background_tasks: BackgroundTasks, request: Request):
    """Register a new user with email/password"""
    validate_password_strength(user_data.password)
    email = normalize_email(str(user_data.email))
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
        "name": user_data.business_name.strip(),
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
        "business_name": user_data.business_name,
        "team_size": user_data.team_size,
        "services": user_data.services,
        "tax_regime": user_data.tax_regime,
        "business_info": {},
        "subscription_tier": "essential",
        "subscription_status": "trial",
        "role": "owner",
        "is_active": True,
        "email_verified": False,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_login_at": None,
    }

    await db.companies.insert_one(company_doc)
    await db.users.insert_one(user_doc)
    verification_token = await create_one_time_token(
        db.email_verification_tokens,
        user_doc,
        timedelta(hours=EMAIL_VERIFICATION_TOKEN_HOURS),
    )
    await audit_event("registration", user=user_doc, request=request)

    background_tasks.add_task(
        send_registration_notification,
        email,
        user_data.business_name,
        now_formatted,
    )
    background_tasks.add_task(send_email_verification, email, verification_token)

    return {
        "user_id": user_id,
        "company_id": company_id,
        "email": email,
        "business_name": user_data.business_name,
        "trial_started_at": company_doc["trial_started_at"],
        "trial_ends_at": company_doc["trial_ends_at"],
        "subscription_status": "trialing",
        "message": "Registrazione completata. Controlla la tua email per verificare l'account."
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    """Login with email/password"""
    email = normalize_email(str(user_data.email))
    if email == normalize_email(ADMIN_EMAIL):
        raise HTTPException(
            status_code=401,
            detail="Per accedere come admin, usa la pagina /admin"
        )

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    try:
        password_valid = verify_password(user_data.password, user.get("password_hash", ""))
    except (TypeError, ValueError):
        password_valid = False
    if not password_valid:
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    user = await _load_active_user(user["user_id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user["user_id"], "company_id": user["company_id"]},
        {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
    )
    user["last_login_at"] = now_iso
    token = await create_authenticated_session(user)
    await audit_event("login", user=user, request=request)

    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60,
        path="/"
    )

    return {"token": token, "user": public_user(user)}

@api_router.post("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Process Google OAuth session_id and create local session"""
    if not OAUTH_SESSION_URL:
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
            {"$set": {"name": name, "full_name": name or user.get("full_name", ""), "picture": picture}}
        )
        user_id = user["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        await db.companies.insert_one({
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
        })
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
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        }
        await db.users.insert_one(user_doc)
        user = user_doc

    user = await _load_active_user(user_id)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_id": f"session_{uuid.uuid4().hex[:16]}",
        "user_id": user_id,
        "company_id": user["company_id"],
        "token_hash": hash_token(session_token),
        "session_type": "oauth",
        "expires_at": expires_at.isoformat(),
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

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    return {"user": public_user(user), "session_token": session_token}

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
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": current_user["user_id"], "company_id": current_user["company_id"]},
            {"$set": update_fields}
        )

    updated_user = await _load_active_user(current_user["user_id"])
    return public_user(updated_user)

@api_router.post("/auth/forgot-password")
async def forgot_password(data: EmailRequest, background_tasks: BackgroundTasks, request: Request):
    """Always return the same response to prevent account enumeration."""
    email = normalize_email(str(data.email))
    user = await db.users.find_one({"email": email, "is_active": {"$ne": False}}, {"_id": 0})
    if user and user.get("password_hash") and user.get("company_id"):
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
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(get_current_user),
):
    if current_user.get("email_verified"):
        return {"message": "Indirizzo email già verificato."}
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
    return {"message": "Email di verifica inviata."}

@api_router.post("/auth/email-verification/verify")
async def verify_email(data: TokenRequest):
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
        {"$set": {"email_verified": True, "updated_at": now_iso}},
    )
    return {"message": "Indirizzo email verificato."}

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
        await db.user_sessions.update_many(
            {"session_token": token},
            {"$set": {"revoked_at": now_iso}, "$unset": {"session_token": ""}},
        )

    response.delete_cookie(key="session_token", path="/", secure=True, samesite="none")
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
        quote_token = uuid.uuid4().hex
        origin = request.headers.get("origin", "")
        quote_link = f"{origin}/quote/{quote_token}"
        await db.quote_tokens.insert_one({
            "token": quote_token,
            "job_id": job_id,
            "company_id": current_user["company_id"],
            "created_at": now.isoformat()
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

@api_router.get("/jobs", response_model=List[JobResponse])
async def get_jobs(
    limit: int = 50,
    skip: int = 0,
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
async def get_public_quote(token: str):
    """Public endpoint to view a quote"""
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token:
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
async def accept_quote(token: str, acceptance: QuoteAcceptance):
    """Public endpoint to accept or reject a quote"""
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token:
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
            job.get("client_name", ""),
            JOB_TYPE_LABELS_IT.get(job.get("job_type", ""), job.get("job_type", "")),
            VEHICLE_TYPE_LABELS_IT.get(job.get("vehicle_type", ""), job.get("vehicle_type", "")),
            job.get("vehicle_info", ""),
            str(job.get("quote_amount", 0)).replace(".", ","),
            str(job.get("hours_worked", 0)).replace(".", ","),
            str(job.get("materials_cost", 0)).replace(".", ","),
            str(round(job.get("waste_percentage", 0) * 100, 1)).replace(".", ","),
            str(job.get("net_profit", 0)).replace(".", ","),
            str(job.get("profit_margin", 0)).replace(".", ","),
            str(job.get("hourly_rate", 0)).replace(".", ","),
            job.get("lead_source", "").replace("_", " ").title(),
            job.get("notes", "")
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
    unique_link_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    
    origin = request.headers.get("origin", "")
    unique_link = f"{origin}/onboarding/client/{unique_link_token}"
    
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
async def get_client_onboarding(token: str):
    """Public endpoint for client to view their onboarding checklist"""
    onboarding = await db.onboardings.find_one(
        {"unique_link_token": token},
        {"_id": 0, "unique_link_token": 0, "user_id": 0, "company_id": 0}
    )
    if not onboarding:
        raise HTTPException(status_code=404, detail="Link non valido o scaduto")
    return onboarding

@api_router.put("/onboarding/client/{token}")
async def update_client_onboarding(token: str, update_data: OnboardingClientUpdate):
    """Public endpoint for client to update their onboarding checklist"""
    onboarding = await db.onboardings.find_one({"unique_link_token": token}, {"_id": 0})
    if not onboarding:
        raise HTTPException(status_code=404, detail="Link non valido o scaduto")
    
    all_completed = all(item.get("completed", False) for item in update_data.checklist_items)
    now = datetime.now(timezone.utc)
    
    update_fields = {
        "checklist_items": [item for item in update_data.checklist_items],
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
    return effort_doc

@api_router.get("/marketing/efforts")
async def get_marketing_efforts(current_user: Dict = Depends(get_current_user)):
    """Get all marketing efforts"""
    efforts = await db.marketing_efforts.find(
        company_scope(current_user),
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return efforts

# ==================== AI CONTENT GENERATION ====================

@api_router.post("/marketing/ai/generate")
async def generate_ai_content(
    request_data: ContentGenerationRequest,
    current_user: Dict = Depends(require_company_roles("owner", "admin", "member")),
):
    """Generate marketing content using AI"""
    from google import genai
    from google.genai import types
    
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API key non configurata")
    
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
        logger.exception("AI generation error")
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
    if email != normalize_email(ADMIN_EMAIL):
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    admin_user = await db.users.find_one({"email": email}, {"_id": 0})
    password_valid = False
    if admin_user and admin_user.get("password_hash"):
        try:
            password_valid = verify_password(user_data.password, admin_user["password_hash"])
        except (TypeError, ValueError):
            password_valid = False
        if not password_valid:
            password_valid = hmac.compare_digest(user_data.password, ADMIN_PASSWORD)
    else:
        # Bootstrap compatibility: the clear credential exists only in the
        # Railway environment and is immediately persisted as a bcrypt hash.
        password_valid = hmac.compare_digest(user_data.password, ADMIN_PASSWORD)

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
    if not admin_user:
        admin_user = {
            "user_id": "admin_super",
            "company_id": PLATFORM_COMPANY_ID,
            "email": email,
            "password_hash": hash_password(user_data.password),
            "full_name": "BESIDE Admin",
            "business_name": "BESIDE",
            "role": "admin",
            "platform_role": "super_admin",
            "email_verified": True,
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login_at": now_iso,
        }
        await db.users.insert_one(admin_user)
    else:
        await db.users.update_one(
            {"user_id": admin_user["user_id"]},
            {"$set": {
                "company_id": PLATFORM_COMPANY_ID,
                "password_hash": admin_user.get("password_hash") or hash_password(user_data.password),
                "role": "admin",
                "platform_role": "super_admin",
                "email_verified": True,
                "is_active": True,
                "last_login_at": now_iso,
                "updated_at": now_iso,
            }},
        )

    admin_user = await _load_active_user(admin_user["user_id"])
    token = await create_authenticated_session(admin_user)
    await audit_event("login", user=admin_user, request=request, metadata={"platform_admin": True})
    return {"token": token, "user": public_user(admin_user)}

@api_router.get("/admin/users")
async def admin_get_users(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    admin_user: Dict = Depends(get_admin_user)
):
    """Get all users (admin only)"""
    query = {"platform_role": {"$ne": "super_admin"}}
    if search:
        query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"business_name": {"$regex": search, "$options": "i"}}
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
    skip: int = 0,
    limit: int = 50,
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
    message: str,
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
        "message": message,
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

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
