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
import bcrypt
import jwt
import httpx
import csv
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'beside-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Admin credentials
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@beside.it')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'BesideAdmin2026!')

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'info@cameleon.design')
ADMIN_NOTIFICATION_EMAIL = 'info@cameleon.design'

# Create the main app
app = FastAPI(title="BESIDE API", description="API per installatori auto wrap/PPF italiani")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== CONSTANTS ====================

# Tax Regimes
TAX_REGIMES = ["forfettario_5", "forfettario_15", "ordinario"]

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

# User Roles
USER_ROLES = ["user", "admin", "super_admin"]

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    business_name: str
    team_size: int = 1
    services: List[str] = []
    tax_regime: str = "forfettario_15"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

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
    revenue: float
    tax_regime: str
    period: str = "monthly"  # monthly or yearly

class TaxCalculationResponse(BaseModel):
    revenue: float
    tax_regime: str
    period: str
    irpef_amount: float
    inps_amount: float
    iva_amount: float
    total_accrual: float
    net_income: float
    yearly_projection: Optional[Dict[str, float]] = None

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

# Subscription Models
class SubscriptionCheckoutRequest(BaseModel):
    tier: str
    origin_url: str

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
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt_token(user_id: str, email: str, role: str = "user") -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")

async def get_current_user(request: Request) -> Dict[str, Any]:
    # Check Authorization header first
    auth_header = request.headers.get("Authorization")
    token = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    
    # Then check cookie
    if not token:
        token = request.cookies.get("session_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    
    # Check if it's a session token (Google OAuth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Sessione scaduta")
        
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    
    # Try JWT token
    try:
        payload = decode_jwt_token(token)
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token non valido")

async def get_admin_user(request: Request) -> Dict[str, Any]:
    """Get admin user - requires admin or super_admin role"""
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Accesso negato - richiesti privilegi admin")
    return user

def calculate_tax(revenue: float, tax_regime: str, period: str = "monthly") -> Dict[str, Any]:
    """Calculate Italian taxes based on regime - supports monthly and yearly"""
    # If monthly, we calculate monthly values and provide yearly projection
    yearly_revenue = revenue * 12 if period == "monthly" else revenue
    monthly_revenue = revenue if period == "monthly" else revenue / 12
    
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
        net = monthly_revenue - total
        yearly_projection = {
            "irpef_amount": round(irpef_yearly, 2),
            "inps_amount": round(inps_yearly, 2),
            "iva_amount": round(iva_yearly, 2),
            "total_accrual": round(irpef_yearly + inps_yearly + iva_yearly, 2),
            "net_income": round(yearly_revenue - (irpef_yearly + inps_yearly + iva_yearly), 2)
        }
    else:
        irpef = irpef_yearly
        inps = inps_yearly
        iva = iva_yearly
        total = irpef + inps + iva
        net = yearly_revenue - total
        yearly_projection = None
    
    return {
        "irpef_amount": round(irpef, 2),
        "inps_amount": round(inps, 2),
        "iva_amount": round(iva, 2),
        "total_accrual": round(total, 2),
        "net_income": round(net, 2),
        "yearly_projection": yearly_projection
    }

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

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate, background_tasks: BackgroundTasks):
    """Register a new user with email/password"""
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    now_formatted = now.strftime("%d/%m/%Y alle %H:%M")
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "first_name": user_data.first_name,
        "business_name": user_data.business_name,
        "team_size": user_data.team_size,
        "services": user_data.services,
        "tax_regime": user_data.tax_regime,
        "business_info": {},
        "subscription_tier": "essential",
        "subscription_status": "trial",
        "role": "user",
        "is_active": True,
        "email_verified": False,
        "created_at": now_iso
    }
    
    await db.users.insert_one(user_doc)
    
    # Send notification email to admin in background
    background_tasks.add_task(
        send_registration_notification,
        user_data.email,
        user_data.business_name,
        now_formatted
    )
    
    return {
        "user_id": user_id,
        "email": user_data.email,
        "business_name": user_data.business_name,
        "message": "Registrazione completata. Controlla la tua email per verificare l'account."
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    """Login with email/password"""
    # Check if trying to login as admin - redirect to admin login
    if user_data.email == ADMIN_EMAIL:
        raise HTTPException(
            status_code=401, 
            detail="Per accedere come admin, usa la pagina /admin"
        )
    
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    
    # Safely check password - handle invalid hash
    try:
        password_valid = verify_password(user_data.password, user.get("password_hash", ""))
    except (ValueError, Exception):
        password_valid = False
    
    if not password_valid:
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account disattivato")
    
    token = create_jwt_token(user["user_id"], user["email"], user.get("role", "user"))
    
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60,
        path="/"
    )
    
    return {
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "first_name": user.get("first_name", ""),
            "business_name": user.get("business_name", ""),
            "team_size": user.get("team_size", 1),
            "services": user.get("services", []),
            "tax_regime": user.get("tax_regime", "forfettario_15"),
            "business_info": user.get("business_info", {}),
            "subscription_tier": user.get("subscription_tier", "essential"),
            "subscription_status": user.get("subscription_status", "trial"),
            "role": user.get("role", "user"),
            "name": user.get("name"),
            "picture": user.get("picture"),
            "created_at": user.get("created_at", "")
        }
    }

@api_router.post("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Process Google OAuth session_id and create local session"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id richiesto")
    
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Sessione Google non valida")
        
        google_data = resp.json()
    
    email = google_data.get("email")
    name = google_data.get("name")
    picture = google_data.get("picture")
    session_token = google_data.get("session_token")
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user:
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}}
        )
        user_id = user["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "business_name": name or "La Mia Attività",
            "team_size": 1,
            "services": [],
            "tax_regime": "forfettario_15",
            "business_info": {},
            "subscription_tier": "essential",
            "subscription_status": "trial",
            "role": "user",
            "is_active": True,
            "email_verified": True,
            "created_at": now
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    return {
        "user": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "business_name": user.get("business_name", name or "La Mia Attività"),
            "team_size": user.get("team_size", 1),
            "services": user.get("services", []),
            "tax_regime": user.get("tax_regime", "forfettario_15"),
            "business_info": user.get("business_info", {}),
            "subscription_tier": user.get("subscription_tier", "essential"),
            "subscription_status": user.get("subscription_status", "trial"),
            "role": user.get("role", "user"),
            "created_at": user.get("created_at", "")
        },
        "session_token": session_token
    }

@api_router.get("/auth/me")
async def get_current_user_info(current_user: Dict = Depends(get_current_user)):
    """Get current authenticated user info"""
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "first_name": current_user.get("first_name", ""),
        "name": current_user.get("name"),
        "picture": current_user.get("picture"),
        "business_name": current_user.get("business_name", ""),
        "team_size": current_user.get("team_size", 1),
        "services": current_user.get("services", []),
        "tax_regime": current_user.get("tax_regime", "forfettario_15"),
        "business_info": current_user.get("business_info", {}),
        "subscription_tier": current_user.get("subscription_tier", "essential"),
        "subscription_status": current_user.get("subscription_status", "trial"),
        "role": current_user.get("role", "user"),
        "created_at": current_user.get("created_at", "")
    }

@api_router.put("/auth/profile")
async def update_profile(update_data: UserUpdate, current_user: Dict = Depends(get_current_user)):
    """Update user profile"""
    update_fields = {}
    
    if update_data.business_name is not None:
        update_fields["business_name"] = update_data.business_name
    if update_data.team_size is not None:
        update_fields["team_size"] = update_data.team_size
    if update_data.services is not None:
        update_fields["services"] = update_data.services
    if update_data.tax_regime is not None:
        update_fields["tax_regime"] = update_data.tax_regime
    if update_data.business_info is not None:
        update_fields["business_info"] = update_data.business_info.model_dump()
    
    if update_fields:
        await db.users.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": update_fields}
        )
    
    updated_user = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0, "password_hash": 0})
    return updated_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logout effettuato"}

# ==================== JOBS ENDPOINTS ====================

@api_router.post("/jobs", response_model=JobResponse)
async def create_job(job_data: JobCreate, request: Request, current_user: Dict = Depends(get_current_user)):
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
            "created_at": now.isoformat()
        })
    
    job_doc = {
        "job_id": job_id,
        "user_id": current_user["user_id"],
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
        "created_at": now.isoformat()
    }
    
    await db.jobs.insert_one(job_doc)
    
    if job_data.lead_source and not job_data.is_quote:
        await db.lead_sources.insert_one({
            "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
            "user_id": current_user["user_id"],
            "job_id": job_id,
            "source": job_data.lead_source,
            "revenue": job_data.quote_amount,
            "created_at": now.isoformat()
        })
    
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
    query = {"user_id": current_user["user_id"]}
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
    job = await db.jobs.find_one({"job_id": job_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    return job

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: Dict = Depends(get_current_user)):
    """Delete a job"""
    result = await db.jobs.delete_one({"job_id": job_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    
    await db.lead_sources.delete_many({"job_id": job_id})
    return {"message": "Lavoro eliminato"}

# Public quote viewing and acceptance
@api_router.get("/quote/{token}")
async def get_public_quote(token: str):
    """Public endpoint to view a quote"""
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    job = await db.jobs.find_one({"job_id": quote_token["job_id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    # Get business info for the quote
    user = await db.users.find_one({"user_id": job["user_id"]}, {"_id": 0, "password_hash": 0})
    
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
        "business_name": user.get("business_name"),
        "business_info": user.get("business_info", {})
    }

@api_router.post("/quote/{token}/accept")
async def accept_quote(token: str, acceptance: QuoteAcceptance):
    """Public endpoint to accept or reject a quote"""
    quote_token = await db.quote_tokens.find_one({"token": token}, {"_id": 0})
    if not quote_token:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    job = await db.jobs.find_one({"job_id": quote_token["job_id"]}, {"_id": 0})
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
        {"job_id": quote_token["job_id"]},
        {"$set": update_fields}
    )
    
    # If accepted, add to lead sources
    if acceptance.accepted and job.get("lead_source"):
        await db.lead_sources.insert_one({
            "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
            "user_id": job["user_id"],
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
        {"$match": {"user_id": current_user["user_id"], "is_quote": {"$ne": True}}},
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
        {"$match": {"user_id": current_user["user_id"], "is_quote": {"$ne": True}}},
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
    tax_data = calculate_tax(request.revenue, request.tax_regime, request.period)
    return TaxCalculationResponse(
        revenue=request.revenue,
        tax_regime=request.tax_regime,
        period=request.period,
        **tax_data
    )

@api_router.post("/tax/accruals")
async def create_tax_accrual(accrual_data: TaxAccrualCreate, current_user: Dict = Depends(get_current_user)):
    """Create a tax accrual entry for a month"""
    accrual_id = f"accrual_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    tax_data = calculate_tax(accrual_data.revenue, tax_regime, "monthly")
    
    prev_accruals = await db.tax_accruals.find(
        {"user_id": current_user["user_id"], "month": {"$lt": accrual_data.month}},
        {"_id": 0}
    ).sort("month", -1).limit(1).to_list(1)
    
    prev_balance = prev_accruals[0]["cumulative_balance"] if prev_accruals else 0
    cumulative_balance = prev_balance + tax_data["total_accrual"]
    
    accrual_doc = {
        "accrual_id": accrual_id,
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
        {"user_id": current_user["user_id"], "month": accrual_data.month},
        {"$set": accrual_doc},
        upsert=True
    )
    
    return accrual_doc

@api_router.get("/tax/accruals")
async def get_tax_accruals(current_user: Dict = Depends(get_current_user)):
    """Get all tax accruals for current user"""
    accruals = await db.tax_accruals.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return accruals

@api_router.get("/tax/forecast")
async def get_tax_forecast(current_user: Dict = Depends(get_current_user)):
    """Get 6-month tax forecast based on recent revenue"""
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m")
    
    recent_accruals = await db.tax_accruals.find(
        {"user_id": current_user["user_id"], "month": {"$gte": three_months_ago}},
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
    query = {"user_id": current_user["user_id"], "is_quote": {"$ne": True}}
    
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
    query = {"user_id": current_user["user_id"]}
    
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
    current_user: Dict = Depends(get_current_user)
):
    """Create a new client onboarding"""
    onboarding_id = f"onb_{uuid.uuid4().hex[:12]}"
    unique_link_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    
    origin = request.headers.get("origin", "")
    unique_link = f"{origin}/onboarding/client/{unique_link_token}"
    
    onboarding_doc = {
        "onboarding_id": onboarding_id,
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
    query = {"user_id": current_user["user_id"]}
    if status:
        query["status"] = status
    
    onboardings = await db.onboardings.find(query, {"_id": 0, "unique_link_token": 0}).sort("created_at", -1).to_list(100)
    return onboardings

@api_router.get("/onboarding/{onboarding_id}")
async def get_onboarding(onboarding_id: str, current_user: Dict = Depends(get_current_user)):
    """Get a specific onboarding"""
    onboarding = await db.onboardings.find_one(
        {"onboarding_id": onboarding_id, "user_id": current_user["user_id"]},
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
        {"_id": 0, "unique_link_token": 0, "user_id": 0}
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
        {"unique_link_token": token},
        {"$set": update_fields}
    )
    
    return {"message": "Checklist aggiornata", "status": update_fields["status"]}

# ==================== MARKETING ENDPOINTS ====================

@api_router.get("/marketing/lead-sources")
async def get_lead_source_stats(current_user: Dict = Depends(get_current_user)):
    """Get lead source statistics and ROI"""
    pipeline = [
        {"$match": {"user_id": current_user["user_id"]}},
        {"$group": {
            "_id": "$source",
            "client_count": {"$sum": 1},
            "total_revenue": {"$sum": "$revenue"}
        }},
        {"$sort": {"total_revenue": -1}}
    ]
    
    lead_stats = await db.lead_sources.aggregate(pipeline).to_list(100)
    
    marketing_efforts = await db.marketing_efforts.find(
        {"user_id": current_user["user_id"]},
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
    current_user: Dict = Depends(get_current_user)
):
    """Track marketing effort hours"""
    effort_id = f"effort_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    effort_doc = {
        "effort_id": effort_id,
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
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return efforts

# ==================== AI CONTENT GENERATION ====================

@api_router.post("/marketing/ai/generate")
async def generate_ai_content(
    request_data: ContentGenerationRequest,
    current_user: Dict = Depends(get_current_user)
):
    """Generate marketing content using AI"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API key non configurata")
    
    session_id = f"marketing_{current_user['user_id']}_{request_data.step}"
    
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
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message="Sei un esperto di marketing digitale specializzato nel settore automotive italiano. Rispondi sempre in italiano in modo chiaro e professionale."
        ).with_model("gemini", "gemini-3-flash-preview")
        
        user_message = UserMessage(text=final_prompt)
        response = await chat.send_message(user_message)
        
        # Save to history
        await db.ai_content_history.insert_one({
            "history_id": f"ai_{uuid.uuid4().hex[:12]}",
            "user_id": current_user["user_id"],
            "step": request_data.step,
            "context": request_data.context,
            "user_input": request_data.user_input,
            "response": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"content": response, "step": request_data.step}
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nella generazione: {str(e)}")

@api_router.get("/marketing/ai/history")
async def get_ai_content_history(current_user: Dict = Depends(get_current_user)):
    """Get AI content generation history"""
    history = await db.ai_content_history.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return history

# ==================== DASHBOARD ENDPOINTS ====================

@api_router.get("/dashboard/metrics")
async def get_dashboard_metrics(current_user: Dict = Depends(get_current_user)):
    """Get dashboard metrics for current user"""
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    latest_accrual = await db.tax_accruals.find_one(
        {"user_id": user_id},
        {"_id": 0},
        sort=[("month", -1)]
    )
    tax_reserve = latest_accrual["cumulative_balance"] if latest_accrual else 0
    
    jobs_this_month = await db.jobs.find(
        {"user_id": user_id, "completed_date": {"$gte": month_start.isoformat()}, "is_quote": {"$ne": True}},
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
        {"$match": {"user_id": user_id, "is_quote": {"$ne": True}}},
        {"$group": {"_id": "$job_type", "avg_margin": {"$avg": "$profit_margin"}}},
        {"$sort": {"avg_margin": -1}},
        {"$limit": 1}
    ]).to_list(1)
    most_profitable = profitability[0]["_id"] if profitability else None
    
    lead_stats = await db.lead_sources.aggregate([
        {"$match": {"user_id": user_id}},
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
async def admin_login(user_data: UserLogin, response: Response):
    """Admin login endpoint"""
    # Check if it's the super admin
    if user_data.email == ADMIN_EMAIL and user_data.password == ADMIN_PASSWORD:
        # Create or get admin user
        admin_user = await db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
        if not admin_user:
            admin_user = {
                "user_id": "admin_super",
                "email": ADMIN_EMAIL,
                "business_name": "BESIDE Admin",
                "role": "super_admin",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(admin_user)
        
        token = create_jwt_token(admin_user["user_id"], admin_user["email"], "super_admin")
        return {"token": token, "user": admin_user}
    
    # Check regular admin users
    user = await db.users.find_one({"email": user_data.email, "role": {"$in": ["admin", "super_admin"]}}, {"_id": 0})
    if not user or not verify_password(user_data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    token = create_jwt_token(user["user_id"], user["email"], user.get("role", "admin"))
    return {"token": token, "user": user}

@api_router.get("/admin/users")
async def admin_get_users(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    admin_user: Dict = Depends(get_admin_user)
):
    """Get all users (admin only)"""
    query = {"role": {"$nin": ["super_admin"]}}
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
async def admin_update_user(user_id: str, update_data: AdminUserUpdate, admin_user: Dict = Depends(get_admin_user)):
    """Update a user (admin only)"""
    update_fields = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_fields:
        await db.users.update_one({"user_id": user_id}, {"$set": update_fields})
    
    updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user

@api_router.get("/admin/stats")
async def admin_get_stats(admin_user: Dict = Depends(get_admin_user)):
    """Get admin dashboard statistics"""
    total_users = await db.users.count_documents({"role": {"$nin": ["super_admin", "admin"]}})
    active_users = await db.users.count_documents({"is_active": True, "role": {"$nin": ["super_admin", "admin"]}})
    trial_users = await db.users.count_documents({"subscription_status": "trial"})
    paying_users = await db.users.count_documents({"subscription_status": "active"})
    
    total_jobs = await db.jobs.count_documents({})
    total_revenue = 0
    jobs = await db.jobs.find({"is_quote": {"$ne": True}}, {"quote_amount": 1}).to_list(10000)
    total_revenue = sum(j.get("quote_amount", 0) for j in jobs)
    
    # Users by tier
    users_by_tier = await db.users.aggregate([
        {"$match": {"role": {"$nin": ["super_admin", "admin"]}}},
        {"$group": {"_id": "$subscription_tier", "count": {"$sum": 1}}}
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
    
    message_doc = {
        "message_id": message_id,
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
    messages = await db.admin_chat.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return messages

@api_router.get("/chat/messages")
async def get_user_chat_messages(current_user: Dict = Depends(get_current_user)):
    """Get chat messages for current user"""
    messages = await db.admin_chat.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Mark as read
    await db.admin_chat.update_many(
        {"user_id": current_user["user_id"], "sender_type": "admin", "read": False},
        {"$set": {"read": True}}
    )
    
    return messages

@api_router.post("/chat/send")
async def user_send_chat(message: str, current_user: Dict = Depends(get_current_user)):
    """Send a chat message to admin"""
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    message_doc = {
        "message_id": message_id,
        "user_id": current_user["user_id"],
        "sender_type": "user",
        "sender_id": current_user["user_id"],
        "message": message,
        "read": False,
        "created_at": now
    }
    
    await db.admin_chat.insert_one(message_doc)
    return message_doc

# ==================== SUBSCRIPTION/STRIPE ENDPOINTS ====================

@api_router.post("/subscription/checkout")
async def create_subscription_checkout(
    checkout_data: SubscriptionCheckoutRequest,
    request: Request,
    current_user: Dict = Depends(get_current_user)
):
    """Create Stripe checkout session for subscription"""
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout, CheckoutSessionRequest
    )
    
    if checkout_data.tier not in SUBSCRIPTION_PRICES:
        raise HTTPException(status_code=400, detail="Tier non valido")
    
    amount = SUBSCRIPTION_PRICES[checkout_data.tier]
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    success_url = f"{checkout_data.origin_url}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout_data.origin_url}/subscription"
    
    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["user_id"],
            "tier": checkout_data.tier,
            "type": "subscription"
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": current_user["user_id"],
        "session_id": session.session_id,
        "amount": amount,
        "currency": "eur",
        "tier": checkout_data.tier,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/subscription/status/{session_id}")
async def get_subscription_status(session_id: str, current_user: Dict = Depends(get_current_user)):
    """Check subscription payment status"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    if status.payment_status == "paid":
        transaction = await db.payment_transactions.find_one(
            {"session_id": session_id, "payment_status": "pending"},
            {"_id": 0}
        )
        
        if transaction:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            
            await db.users.update_one(
                {"user_id": current_user["user_id"]},
                {"$set": {
                    "subscription_tier": transaction["tier"],
                    "subscription_status": "active",
                    "subscription_updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount": status.amount_total / 100,
        "currency": status.currency
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    body = await request.body()
    sig_header = request.headers.get("Stripe-Signature")
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, sig_header)
        
        if webhook_response.payment_status == "paid":
            metadata = webhook_response.metadata
            user_id = metadata.get("user_id")
            tier = metadata.get("tier")
            
            if user_id and tier:
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "subscription_tier": tier,
                        "subscription_status": "active",
                        "subscription_updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})

# ==================== UTILITY ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "BESIDE API - Benvenuto!", "version": "1.0.0"}

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
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
