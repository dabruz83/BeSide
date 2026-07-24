"""Idempotent, non-destructive migration helpers for company tenancy."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable


COMPANY_ROLES = ("owner", "admin", "member", "viewer")
PLATFORM_COMPANY_ID = "company_beside_platform"
ORPHAN_COMPANY_ID = "company_legacy_quarantine"

# Collections containing company-owned or company-related records. ``user_id`` is
# retained as creator/subject attribution; ``company_id`` becomes the access scope.
TENANT_COLLECTIONS = (
    "jobs",
    "lead_sources",
    "finance_settings",
    "cash_plan_entries",
    "cash_plan_settings",
    "tax_accruals",
    "onboardings",
    "marketing_efforts",
    "ai_content_history",
    "admin_chat",
    "payment_transactions",
    "user_sessions",
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: Any, fallback: datetime | None = None) -> datetime:
    """Parse legacy timestamps as aware UTC values."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = fallback or utc_now()
    else:
        parsed = fallback or utc_now()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def legacy_company_id(user_id: str) -> str:
    """Return a stable company id so rerunning migration is always safe."""
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]
    return f"company_legacy_{digest}"


def company_scope(user: Dict[str, Any], **filters: Any) -> Dict[str, Any]:
    company_id = user.get("company_id")
    if not company_id:
        raise ValueError("Authenticated user has no company_id")
    return {"company_id": company_id, **filters}


def company_document(user: Dict[str, Any], **fields: Any) -> Dict[str, Any]:
    """Create a tenant-owned document while keeping creator attribution."""
    return {
        "company_id": user["company_id"],
        "user_id": user["user_id"],
        **fields,
    }


def _legacy_role(user: Dict[str, Any]) -> tuple[str, str | None]:
    old_role = user.get("role", "user")
    if old_role == "super_admin":
        return "admin", "super_admin"
    if old_role == "admin":
        # Existing global admins keep platform access explicitly; newly-created
        # company admins never receive this flag.
        platform_role = "super_admin" if not user.get("company_id") else user.get("platform_role")
        return "admin", platform_role
    if old_role in COMPANY_ROLES:
        return old_role, user.get("platform_role")
    return "owner", user.get("platform_role")


def build_legacy_company(user: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    created_at = parse_datetime(user.get("created_at"))
    trial_started = parse_datetime(user.get("trial_started_at"), created_at)
    legacy_status = user.get("subscription_status", "trial")
    subscription_status = "trialing" if legacy_status == "trial" else legacy_status
    now_iso = utc_now().isoformat()
    return {
        "company_id": company_id,
        "name": user.get("business_name") or user.get("name") or "La Mia Attività",
        "owner_user_id": user["user_id"],
        "status": "active",
        "subscription_status": subscription_status,
        "trial_started_at": trial_started.isoformat(),
        "trial_ends_at": (trial_started + timedelta(days=7)).isoformat(),
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "plan_id": user.get("subscription_tier", "essential"),
        "created_at": created_at.isoformat(),
        "updated_at": now_iso,
    }


async def ensure_multitenant_indexes(database: Any) -> None:
    """Create only indexes that are safe for migrated production data."""
    await database.users.create_index("email", unique=True)
    await database.users.create_index("company_id")
    await database.companies.create_index("company_id", unique=True)
    await database.companies.create_index("owner_user_id")
    await database.user_sessions.create_index("token_hash", sparse=True)
    await database.user_sessions.create_index("jti", sparse=True)
    await database.password_reset_tokens.create_index("token_hash", unique=True)
    await database.email_verification_tokens.create_index("token_hash", unique=True)
    await database.audit_logs.create_index([("company_id", 1), ("created_at", -1)])
    for collection_name in TENANT_COLLECTIONS:
        await database[collection_name].create_index("company_id")


async def _backfill_user_records(database: Any, user_id: str, company_id: str) -> None:
    for collection_name in TENANT_COLLECTIONS:
        await database[collection_name].update_many(
            {"user_id": user_id, "company_id": {"$exists": False}},
            {"$set": {"company_id": company_id}},
        )

    # Quote tokens historically only referenced a job. Resolve the tenant from it.
    jobs = await database.jobs.find(
        {"user_id": user_id, "company_id": company_id},
        {"_id": 0, "job_id": 1},
    ).to_list(None)
    job_ids = [job["job_id"] for job in jobs]
    if job_ids:
        await database.quote_tokens.update_many(
            {"job_id": {"$in": job_ids}, "company_id": {"$exists": False}},
            {"$set": {"company_id": company_id}},
        )


async def migrate_to_company_tenancy(database: Any, admin_email: str) -> Dict[str, int]:
    """Backfill companies/company_id without deleting or renaming legacy fields."""
    stats = {"users": 0, "companies": 0, "records": 0}
    users = await database.users.find({}, {"_id": 0}).to_list(None)
    normalized_admin = normalize_email(admin_email)

    for user in users:
        user_id = user.get("user_id")
        email = normalize_email(user.get("email", ""))
        if not user_id or not email:
            continue

        is_platform_admin = (
            email == normalized_admin
            or user.get("role") == "super_admin"
            or user.get("platform_role") == "super_admin"
        )
        company_id = user.get("company_id") or (
            PLATFORM_COMPANY_ID if is_platform_admin else legacy_company_id(user_id)
        )
        role, platform_role = _legacy_role(user)
        if is_platform_admin:
            platform_role = "super_admin"

        company = await database.companies.find_one({"company_id": company_id}, {"_id": 0})
        if not company:
            company_doc = build_legacy_company(user, company_id)
            if company_id == PLATFORM_COMPANY_ID:
                company_doc.update({
                    "name": "BESIDE",
                    "subscription_status": "internal",
                    "trial_started_at": None,
                    "trial_ends_at": None,
                    "plan_id": None,
                })
            await database.companies.insert_one(company_doc)
            stats["companies"] += 1

        created_at = parse_datetime(user.get("created_at")).isoformat()
        updates = {
            "company_id": company_id,
            "email": email,
            "full_name": user.get("full_name") or user.get("first_name") or user.get("name") or "",
            "role": role,
            "email_verified": bool(user.get("email_verified", False)),
            "is_active": bool(user.get("is_active", True)),
            "created_at": created_at,
            "updated_at": user.get("updated_at") or created_at,
            "last_login_at": user.get("last_login_at"),
        }
        if platform_role:
            updates["platform_role"] = platform_role
        await database.users.update_one({"user_id": user_id}, {"$set": updates})
        await _backfill_user_records(database, user_id, company_id)
        stats["users"] += 1

    # Preserve malformed/orphaned historical records but keep them inaccessible
    # to customer tenants. This guarantees every business document has a tenant
    # boundary without guessing ownership.
    quarantined = 0
    for collection_name in all_tenant_collections():
        result = await database[collection_name].update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": ORPHAN_COMPANY_ID, "migration_quarantined": True}},
        )
        quarantined += result.modified_count
    if quarantined and not await database.companies.find_one({"company_id": ORPHAN_COMPANY_ID}, {"_id": 0}):
        now_iso = utc_now().isoformat()
        await database.companies.insert_one({
            "company_id": ORPHAN_COMPANY_ID,
            "name": "Legacy records requiring review",
            "owner_user_id": None,
            "status": "archived",
            "subscription_status": "internal",
            "trial_started_at": None,
            "trial_ends_at": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "plan_id": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        stats["companies"] += 1
    stats["records"] = quarantined

    await ensure_multitenant_indexes(database)
    return stats


def all_tenant_collections() -> Iterable[str]:
    return (*TENANT_COLLECTIONS, "quote_tokens")
