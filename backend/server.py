from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
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

# Create the main app
app = FastAPI(title="BESIDE API", description="API per installatori auto wrap/PPF italiani")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

# Tax Regimes
TAX_REGIMES = ["forfettario_5", "forfettario_15", "ordinario"]

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

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    business_name: str
    team_size: int = 1
    services: List[str] = []
    tax_regime: str = "forfettario_15"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    business_name: str
    team_size: int
    services: List[str]
    tax_regime: str
    subscription_tier: str
    subscription_status: str
    created_at: str
    name: Optional[str] = None
    picture: Optional[str] = None

class UserUpdate(BaseModel):
    business_name: Optional[str] = None
    team_size: Optional[int] = None
    services: Optional[List[str]] = None
    tax_regime: Optional[str] = None

# Job Models
class JobCreate(BaseModel):
    client_name: str
    job_type: str
    vehicle_type: str
    quote_amount: float
    hours_worked: float
    materials_cost: float
    waste_percentage: Optional[float] = None
    lead_source: Optional[str] = None
    notes: Optional[str] = None

class JobResponse(BaseModel):
    job_id: str
    user_id: str
    client_name: str
    job_type: str
    vehicle_type: str
    quote_amount: float
    hours_worked: float
    materials_cost: float
    waste_percentage: float
    profit_margin: float
    net_profit: float
    hourly_rate: float
    lead_source: Optional[str] = None
    notes: Optional[str] = None
    completed_date: str
    created_at: str

# Tax Models
class TaxCalculationRequest(BaseModel):
    monthly_revenue: float
    tax_regime: str

class TaxCalculationResponse(BaseModel):
    monthly_revenue: float
    tax_regime: str
    irpef_amount: float
    inps_amount: float
    iva_amount: float
    total_accrual: float
    net_income: float

class TaxAccrualCreate(BaseModel):
    month: str  # YYYY-MM format
    revenue: float

class TaxAccrualResponse(BaseModel):
    accrual_id: str
    user_id: str
    month: str
    revenue: float
    irpef_amount: float
    inps_amount: float
    iva_amount: float
    total_accrual: float
    cumulative_balance: float
    created_at: str

# Client Onboarding Models
class OnboardingChecklistItem(BaseModel):
    item: str
    completed: bool = False
    uploaded_file: Optional[str] = None

class OnboardingCreate(BaseModel):
    client_name: str
    client_email: EmailStr
    vehicle_info: Optional[str] = None

class OnboardingResponse(BaseModel):
    onboarding_id: str
    user_id: str
    client_name: str
    client_email: str
    vehicle_info: Optional[str] = None
    status: str
    checklist_items: List[Dict[str, Any]]
    unique_link: str
    created_at: str
    completed_at: Optional[str] = None

class OnboardingClientUpdate(BaseModel):
    checklist_items: List[Dict[str, Any]]

# Lead Source Models
class LeadSourceStats(BaseModel):
    source: str
    client_count: int
    total_revenue: float
    total_hours: float
    roi: float

# Marketing Effort Models
class MarketingEffortCreate(BaseModel):
    month: str  # YYYY-MM
    channel: str
    hours_invested: float

class MarketingEffortResponse(BaseModel):
    effort_id: str
    user_id: str
    month: str
    channel: str
    hours_invested: float
    created_at: str

# Subscription Models
class SubscriptionCheckoutRequest(BaseModel):
    tier: str
    origin_url: str

class SubscriptionResponse(BaseModel):
    checkout_url: str
    session_id: str

# Dashboard Models
class DashboardMetrics(BaseModel):
    tax_reserve_balance: float
    cash_flow_status: str  # green/yellow/red
    most_profitable_job_type: Optional[str] = None
    top_lead_source: Optional[str] = None
    upcoming_tax_deadlines: List[Dict[str, Any]]
    total_jobs_this_month: int
    total_revenue_this_month: float
    average_profit_margin: float

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
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
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Then check Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    
    # Check if it's a session token (Google OAuth)
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
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
        payload = decode_jwt_token(session_token)
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token non valido")

def calculate_tax(revenue: float, tax_regime: str) -> Dict[str, float]:
    """Calculate Italian taxes based on regime"""
    irpef = 0.0
    inps = revenue * 0.24  # 24% INPS always
    iva = 0.0
    
    if tax_regime == "forfettario_5":
        irpef = revenue * 0.05
    elif tax_regime == "forfettario_15":
        irpef = revenue * 0.15
    elif tax_regime == "ordinario":
        # Simplified progressive calculation
        if revenue <= 15000:
            irpef = revenue * 0.23
        elif revenue <= 28000:
            irpef = 15000 * 0.23 + (revenue - 15000) * 0.25
        elif revenue <= 50000:
            irpef = 15000 * 0.23 + 13000 * 0.25 + (revenue - 28000) * 0.35
        else:
            irpef = 15000 * 0.23 + 13000 * 0.25 + 22000 * 0.35 + (revenue - 50000) * 0.43
        iva = revenue * 0.22  # 22% IVA
    
    total = irpef + inps + iva
    return {
        "irpef_amount": round(irpef, 2),
        "inps_amount": round(inps, 2),
        "iva_amount": round(iva, 2),
        "total_accrual": round(total, 2),
        "net_income": round(revenue - total, 2)
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

def get_italian_tax_deadlines() -> List[Dict[str, Any]]:
    """Get upcoming Italian tax deadlines"""
    today = datetime.now(timezone.utc)
    year = today.year
    next_year = year + 1
    
    # Generate deadlines for current and next year
    all_deadlines = [
        {"date": f"16/03/{year}", "description": "Versamento IVA annuale"},
        {"date": f"30/06/{year}", "description": "Saldo IRPEF anno precedente"},
        {"date": f"30/06/{year}", "description": "Primo acconto IRPEF"},
        {"date": f"16/09/{year}", "description": "Versamento INPS"},
        {"date": f"30/11/{year}", "description": "Secondo acconto IRPEF"},
        {"date": f"16/01/{next_year}", "description": "Versamento IVA trimestrale Q4"},
        {"date": f"16/03/{next_year}", "description": "Versamento IVA annuale"},
        {"date": f"30/06/{next_year}", "description": "Saldo IRPEF anno precedente"},
    ]
    
    upcoming = []
    for deadline in all_deadlines:
        parts = deadline["date"].split("/")
        deadline_date = datetime(int(parts[2]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
        days_until = (deadline_date - today).days
        if days_until >= 0 and days_until <= 90:
            upcoming.append({
                "date": deadline["date"],
                "description": deadline["description"],
                "days_until": days_until,
                "urgency": "red" if days_until <= 15 else "yellow" if days_until <= 30 else "green"
            })
    
    return sorted(upcoming, key=lambda x: x["days_until"])[:5]

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    """Register a new user with email/password"""
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "business_name": user_data.business_name,
        "team_size": user_data.team_size,
        "services": user_data.services,
        "tax_regime": user_data.tax_regime,
        "subscription_tier": "essential",
        "subscription_status": "trial",
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        user_id=user_id,
        email=user_data.email,
        business_name=user_data.business_name,
        team_size=user_data.team_size,
        services=user_data.services,
        tax_regime=user_data.tax_regime,
        subscription_tier="essential",
        subscription_status="trial",
        created_at=now
    )

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    """Login with email/password"""
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user or not verify_password(user_data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    
    token = create_jwt_token(user["user_id"], user["email"])
    
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
            "business_name": user.get("business_name", ""),
            "team_size": user.get("team_size", 1),
            "services": user.get("services", []),
            "tax_regime": user.get("tax_regime", "forfettario_15"),
            "subscription_tier": user.get("subscription_tier", "essential"),
            "subscription_status": user.get("subscription_status", "trial"),
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
    
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
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
    
    # Check if user exists
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user:
        # Update existing user
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}}
        )
        user_id = user["user_id"]
    else:
        # Create new user
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
            "subscription_tier": "essential",
            "subscription_status": "trial",
            "created_at": now
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    
    # Store session
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
            "subscription_tier": user.get("subscription_tier", "essential"),
            "subscription_status": user.get("subscription_status", "trial"),
            "created_at": user.get("created_at", "")
        }
    }

@api_router.get("/auth/me")
async def get_current_user_info(current_user: Dict = Depends(get_current_user)):
    """Get current authenticated user info"""
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "name": current_user.get("name"),
        "picture": current_user.get("picture"),
        "business_name": current_user.get("business_name", ""),
        "team_size": current_user.get("team_size", 1),
        "services": current_user.get("services", []),
        "tax_regime": current_user.get("tax_regime", "forfettario_15"),
        "subscription_tier": current_user.get("subscription_tier", "essential"),
        "subscription_status": current_user.get("subscription_status", "trial"),
        "created_at": current_user.get("created_at", "")
    }

@api_router.put("/auth/profile")
async def update_profile(update_data: UserUpdate, current_user: Dict = Depends(get_current_user)):
    """Update user profile"""
    update_fields = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_fields:
        await db.users.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": update_fields}
        )
    
    updated_user = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    return updated_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logout effettuato"}

# ==================== JOBS ENDPOINTS ====================

@api_router.post("/jobs", response_model=JobResponse)
async def create_job(job_data: JobCreate, current_user: Dict = Depends(get_current_user)):
    """Create a new job"""
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Determine waste percentage
    waste_pct = job_data.waste_percentage
    if waste_pct is None:
        if "ppf" in job_data.job_type:
            waste_pct = DEFAULT_WASTE["ppf"]
        else:
            waste_pct = DEFAULT_WASTE["vinyl"]
    
    # Calculate profitability
    profit_data = calculate_job_profitability(
        job_data.quote_amount,
        job_data.hours_worked,
        job_data.materials_cost,
        waste_pct
    )
    
    job_doc = {
        "job_id": job_id,
        "user_id": current_user["user_id"],
        "client_name": job_data.client_name,
        "job_type": job_data.job_type,
        "vehicle_type": job_data.vehicle_type,
        "quote_amount": job_data.quote_amount,
        "hours_worked": job_data.hours_worked,
        "materials_cost": job_data.materials_cost,
        "waste_percentage": waste_pct,
        "profit_margin": profit_data["profit_margin"],
        "net_profit": profit_data["net_profit"],
        "hourly_rate": profit_data["hourly_rate"],
        "lead_source": job_data.lead_source,
        "notes": job_data.notes,
        "completed_date": now.isoformat(),
        "created_at": now.isoformat()
    }
    
    await db.jobs.insert_one(job_doc)
    
    # Track lead source if provided
    if job_data.lead_source:
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
    current_user: Dict = Depends(get_current_user)
):
    """Get all jobs for current user"""
    query = {"user_id": current_user["user_id"]}
    if job_type:
        query["job_type"] = job_type
    if vehicle_type:
        query["vehicle_type"] = vehicle_type
    
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
    """Delete a job (soft delete)"""
    result = await db.jobs.delete_one({"job_id": job_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    
    # Also delete related lead source
    await db.lead_sources.delete_many({"job_id": job_id})
    
    return {"message": "Lavoro eliminato"}

@api_router.get("/jobs/analytics/profitability")
async def get_profitability_analytics(current_user: Dict = Depends(get_current_user)):
    """Get profitability analytics by job type and vehicle type"""
    pipeline_job_type = [
        {"$match": {"user_id": current_user["user_id"]}},
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
        {"$match": {"user_id": current_user["user_id"]}},
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
    tax_data = calculate_tax(request.monthly_revenue, request.tax_regime)
    return TaxCalculationResponse(
        monthly_revenue=request.monthly_revenue,
        tax_regime=request.tax_regime,
        **tax_data
    )

@api_router.post("/tax/accruals", response_model=TaxAccrualResponse)
async def create_tax_accrual(accrual_data: TaxAccrualCreate, current_user: Dict = Depends(get_current_user)):
    """Create a tax accrual entry for a month"""
    accrual_id = f"accrual_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Calculate taxes
    tax_data = calculate_tax(accrual_data.revenue, current_user.get("tax_regime", "forfettario_15"))
    
    # Get cumulative balance
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
        "irpef_amount": tax_data["irpef_amount"],
        "inps_amount": tax_data["inps_amount"],
        "iva_amount": tax_data["iva_amount"],
        "total_accrual": tax_data["total_accrual"],
        "cumulative_balance": round(cumulative_balance, 2),
        "created_at": now.isoformat()
    }
    
    # Upsert to handle updates for same month
    await db.tax_accruals.update_one(
        {"user_id": current_user["user_id"], "month": accrual_data.month},
        {"$set": accrual_doc},
        upsert=True
    )
    
    return TaxAccrualResponse(**accrual_doc)

@api_router.get("/tax/accruals", response_model=List[TaxAccrualResponse])
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
    # Get average monthly revenue from last 3 months
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m")
    
    recent_accruals = await db.tax_accruals.find(
        {"user_id": current_user["user_id"], "month": {"$gte": three_months_ago}},
        {"_id": 0}
    ).to_list(100)
    
    if not recent_accruals:
        avg_revenue = 5000  # Default estimate
    else:
        avg_revenue = sum(a["revenue"] for a in recent_accruals) / len(recent_accruals)
    
    tax_regime = current_user.get("tax_regime", "forfettario_15")
    forecast = []
    
    current_date = datetime.now(timezone.utc)
    for i in range(6):
        future_date = current_date + timedelta(days=30 * (i + 1))
        month_str = future_date.strftime("%Y-%m")
        tax_data = calculate_tax(avg_revenue, tax_regime)
        forecast.append({
            "month": month_str,
            "estimated_revenue": avg_revenue,
            **tax_data
        })
    
    return {"forecast": forecast, "avg_monthly_revenue": avg_revenue}

@api_router.get("/tax/deadlines")
async def get_tax_deadlines():
    """Get upcoming Italian tax deadlines"""
    return {"deadlines": get_italian_tax_deadlines()}

# ==================== CLIENT ONBOARDING ENDPOINTS ====================

DEFAULT_CHECKLIST = [
    {"item": "Foto veicolo (4 angolazioni)", "completed": False, "uploaded_file": None},
    {"item": "Modello/anno confermato", "completed": False, "uploaded_file": None},
    {"item": "Grafica/colore approvato", "completed": False, "uploaded_file": None},
    {"item": "Tempistica concordata (+20% buffer)", "completed": False, "uploaded_file": None},
    {"item": "Acconto 50% ricevuto", "completed": False, "uploaded_file": None},
    {"item": "Policy revisioni firmata (max 2 incluse)", "completed": False, "uploaded_file": None}
]

@api_router.post("/onboarding", response_model=OnboardingResponse)
async def create_onboarding(
    onboarding_data: OnboardingCreate,
    request: Request,
    current_user: Dict = Depends(get_current_user)
):
    """Create a new client onboarding"""
    onboarding_id = f"onb_{uuid.uuid4().hex[:12]}"
    unique_link_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    
    # Generate unique link using the request origin
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
    
    return OnboardingResponse(**{k: v for k, v in onboarding_doc.items() if k not in ["_id", "unique_link_token"]})

@api_router.get("/onboarding", response_model=List[OnboardingResponse])
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

@api_router.get("/onboarding/{onboarding_id}", response_model=OnboardingResponse)
async def get_onboarding(onboarding_id: str, current_user: Dict = Depends(get_current_user)):
    """Get a specific onboarding"""
    onboarding = await db.onboardings.find_one(
        {"onboarding_id": onboarding_id, "user_id": current_user["user_id"]},
        {"_id": 0, "unique_link_token": 0}
    )
    if not onboarding:
        raise HTTPException(status_code=404, detail="Onboarding non trovato")
    return onboarding

# Public endpoint for client to view and update their onboarding
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
    
    # Check if all items are completed
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

# ==================== LEAD SOURCE & MARKETING ENDPOINTS ====================

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
    
    # Get marketing hours for ROI calculation
    marketing_efforts = await db.marketing_efforts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Calculate hours per channel
    hours_by_channel = {}
    for effort in marketing_efforts:
        channel = effort["channel"]
        hours_by_channel[channel] = hours_by_channel.get(channel, 0) + effort["hours_invested"]
    
    # Combine with ROI
    results = []
    total_revenue = sum(s["total_revenue"] for s in lead_stats)
    
    for stat in lead_stats:
        source = stat["_id"]
        hours = hours_by_channel.get(source, 1)  # Avoid division by zero
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
    
    # Generate 80/20 insight
    insight = None
    if results:
        top_source = results[0]
        if top_source["percentage"] > 50:
            insight = f"Il {round(top_source['percentage'])}% del tuo fatturato viene da {top_source['source'].replace('_', ' ')}. Concentra i tuoi sforzi qui!"
    
    return {"lead_sources": results, "insight": insight}

@api_router.post("/marketing/efforts", response_model=MarketingEffortResponse)
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
    return MarketingEffortResponse(**effort_doc)

@api_router.get("/marketing/efforts", response_model=List[MarketingEffortResponse])
async def get_marketing_efforts(current_user: Dict = Depends(get_current_user)):
    """Get all marketing efforts"""
    efforts = await db.marketing_efforts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("month", -1).to_list(100)
    return efforts

# ==================== DASHBOARD ENDPOINTS ====================

@api_router.get("/dashboard/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(current_user: Dict = Depends(get_current_user)):
    """Get dashboard metrics for current user"""
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Tax reserve balance (cumulative)
    latest_accrual = await db.tax_accruals.find_one(
        {"user_id": user_id},
        {"_id": 0},
        sort=[("month", -1)]
    )
    tax_reserve = latest_accrual["cumulative_balance"] if latest_accrual else 0
    
    # Jobs this month
    jobs_this_month = await db.jobs.find(
        {"user_id": user_id, "completed_date": {"$gte": month_start.isoformat()}},
        {"_id": 0}
    ).to_list(1000)
    
    total_jobs = len(jobs_this_month)
    total_revenue = sum(j["quote_amount"] for j in jobs_this_month)
    avg_margin = sum(j["profit_margin"] for j in jobs_this_month) / total_jobs if total_jobs > 0 else 0
    
    # Cash flow status
    if avg_margin >= 30:
        cash_flow_status = "green"
    elif avg_margin >= 15:
        cash_flow_status = "yellow"
    else:
        cash_flow_status = "red"
    
    # Most profitable job type
    profitability = await db.jobs.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$job_type", "avg_margin": {"$avg": "$profit_margin"}}},
        {"$sort": {"avg_margin": -1}},
        {"$limit": 1}
    ]).to_list(1)
    most_profitable = profitability[0]["_id"] if profitability else None
    
    # Top lead source
    lead_stats = await db.lead_sources.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$source", "total_revenue": {"$sum": "$revenue"}}},
        {"$sort": {"total_revenue": -1}},
        {"$limit": 1}
    ]).to_list(1)
    top_lead = lead_stats[0]["_id"] if lead_stats else None
    
    # Tax deadlines
    deadlines = get_italian_tax_deadlines()
    
    return DashboardMetrics(
        tax_reserve_balance=round(tax_reserve, 2),
        cash_flow_status=cash_flow_status,
        most_profitable_job_type=most_profitable,
        top_lead_source=top_lead,
        upcoming_tax_deadlines=deadlines,
        total_jobs_this_month=total_jobs,
        total_revenue_this_month=round(total_revenue, 2),
        average_profit_margin=round(avg_margin, 2)
    )

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
    
    # Store payment transaction
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
    
    # Update transaction and user subscription if paid
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
        "amount": status.amount_total / 100,  # Convert from cents
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
    """Get available job types"""
    return {"job_types": JOB_TYPES}

@api_router.get("/config/vehicle-types")
async def get_vehicle_types():
    """Get available vehicle types"""
    return {"vehicle_types": VEHICLE_TYPES}

@api_router.get("/config/lead-sources")
async def get_lead_sources():
    """Get available lead sources"""
    return {"lead_sources": LEAD_SOURCES}

@api_router.get("/config/tax-regimes")
async def get_tax_regimes():
    """Get available tax regimes"""
    return {"tax_regimes": TAX_REGIMES}

@api_router.get("/config/subscription-tiers")
async def get_subscription_tiers():
    """Get subscription tiers and prices"""
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
