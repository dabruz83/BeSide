"""Explicit local-only administrator initialization.

This script is intentionally not reachable through the FastAPI application.
Run it from ``backend/`` only when APP_ENV=local.
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


async def initialize_admin() -> str:
    if server.APP_ENV != "local":
        raise RuntimeError("Administrator initialization is available only in local mode")

    email = server.normalize_email(server.ADMIN_EMAIL)
    existing = await server.db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
    if existing:
        return "admin-exists"

    now = datetime.now(timezone.utc).isoformat()
    await server.db.companies.update_one(
        {"company_id": server.PLATFORM_COMPANY_ID},
        {"$setOnInsert": {
            "company_id": server.PLATFORM_COMPANY_ID,
            "name": "BESIDE",
            "owner_user_id": "admin_super",
            "status": "active",
            "subscription_status": "internal",
            "trial_started_at": None,
            "trial_ends_at": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "plan_id": None,
            "created_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
    await server.db.users.insert_one({
        "user_id": "admin_super",
        "company_id": server.PLATFORM_COMPANY_ID,
        "email": email,
        "password_hash": server.hash_password(server.ADMIN_PASSWORD),
        "full_name": "BESIDE Admin",
        "business_name": "BESIDE",
        "role": "admin",
        "platform_role": "super_admin",
        "email_verified": True,
        "email_verification_exempt": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    })
    return "admin-created"


if __name__ == "__main__":
    try:
        print(asyncio.run(initialize_admin()))
    finally:
        server.client.close()
