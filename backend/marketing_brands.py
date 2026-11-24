"""Company-scoped marketing brand profiles and approved-content style memory.

Shared domain model: Agency now, Wrapping staging once its UI is ready.
No model fine-tuning, external calls, media ingestion or automatic publishing.
"""
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, Literal, Optional
import uuid

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

BrandKind = Literal["own", "client"]
APPROVED_STATES = {"ready", "scheduled", "published"}
BRAND_FIELDS = (
    "name", "kind", "sector", "logo_url", "primary_color", "secondary_color",
    "audience", "tone", "visual_style", "website_url", "social_profiles",
    "usual_goal", "description", "style_notes", "avoid_claims",
    "learning_enabled", "usage_authorized",
)


class MarketingBrandInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: BrandKind = "own"
    sector: str = Field(default="", max_length=120)
    logo_url: str = Field(default="", max_length=500)
    primary_color: str = Field(default="", max_length=12)
    secondary_color: str = Field(default="", max_length=12)
    audience: str = Field(default="", max_length=350)
    tone: str = Field(default="", max_length=200)
    visual_style: str = Field(default="", max_length=250)
    website_url: str = Field(default="", max_length=500)
    social_profiles: str = Field(default="", max_length=500)
    usual_goal: str = Field(default="", max_length=350)
    description: str = Field(default="", max_length=1000)
    style_notes: str = Field(default="", max_length=1000)
    avoid_claims: str = Field(default="", max_length=500)
    learning_enabled: bool = True
    usage_authorized: bool = False

    @field_validator("logo_url", "website_url")
    @classmethod
    def check_urls(cls, value):
        if value and not value.startswith("https://"):
            raise ValueError("Inserisci un indirizzo HTTPS valido")
        return value

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def check_colors(cls, value):
        if value and (len(value) not in (4, 7) or not value.startswith("#") or
                      any(c not in "0123456789abcdefABCDEF" for c in value[1:])):
            raise ValueError("Colore non valido: usa #RGB oppure #RRGGBB")
        return value


class MarketingBrandPatch(MarketingBrandInput):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    kind: Optional[BrandKind] = None


def style_summary(contents):
    """Deterministic summary from explicitly approved outputs, never fine-tuning."""
    counter, channels, formats, examples = Counter(), Counter(), Counter(), []
    for item in contents:
        answers = item.get("answers") or {}
        for tone in (answers.get("tono") or "").split(" · "):
            if tone.strip():
                counter[tone.strip()] += 1
        if item.get("channel"):
            channels[str(item["channel"])] += 1
        if item.get("format"):
            formats[str(item["format"])] += 1
        if item.get("body"):
            examples.append({"content_id": item.get("content_id"),
                             "excerpt": str(item["body"])[:480]})
    return {
        "sample_count": len(contents),
        "target_samples": 6,
        "style_ready": len(contents) >= 5,
        "frequent_tones": [x for x, _ in counter.most_common(4)],
        "frequent_channels": [x for x, _ in channels.most_common(3)],
        "frequent_formats": [x for x, _ in formats.most_common(3)],
        "examples": examples,
    }


async def approved_style(db, company_scope, user, brand_id):
    samples = await db.agency_marketing_contents.find(
        company_scope(user, brand_id=brand_id, status={"$in": list(APPROVED_STATES)}),
        {"_id": 0, "content_id": 1, "body": 1, "channel": 1, "format": 1, "answers": 1},
    ).sort("updated_at", -1).limit(6).to_list(6)
    return style_summary(samples)


def register_marketing_brand_routes(router, db, company_scope, require_company_roles):
    reader = require_company_roles("owner", "admin", "member")
    writer = require_company_roles("owner", "admin")

    @router.get("/marketing/brands")
    async def list_marketing_brands(user: Dict = Depends(reader)):
        return await db.marketing_brands.find(
            company_scope(user), {"_id": 0}
        ).sort("created_at", 1).limit(50).to_list(50)

    @router.post("/marketing/brands")
    async def create_marketing_brand(payload: MarketingBrandInput, user: Dict = Depends(writer)):
        if payload.kind == "client" and not payload.usage_authorized:
            raise HTTPException(422, "Conferma prima l'autorizzazione a usare il brand del cliente")
        count = await db.marketing_brands.count_documents(company_scope(user))
        if count >= 30:
            raise HTTPException(409, "Hai raggiunto il limite di 30 profili brand")
        if payload.kind == "own" and await db.marketing_brands.find_one(
            company_scope(user, kind="own"), {"_id": 1}
        ):
            raise HTTPException(409, "Esiste già un profilo per la tua attività")
        now = datetime.now(timezone.utc).isoformat()
        record = payload.model_dump()
        record.update(brand_id="brand_" + uuid.uuid4().hex, company_id=user["company_id"],
                      created_by=user["user_id"], created_at=now, updated_at=now,
                      authorization_confirmed_at=now if payload.usage_authorized else None)
        await db.marketing_brands.insert_one(record)
        record.pop("_id", None)
        return record

    @router.patch("/marketing/brands/{brand_id}")
    async def update_marketing_brand(brand_id: str, payload: MarketingBrandPatch, user: Dict = Depends(writer)):
        query = company_scope(user, brand_id=brand_id)
        brand = await db.marketing_brands.find_one(query, {"_id": 0})
        if not brand:
            raise HTTPException(404, "Profilo brand non trovato")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return brand
        if changes.pop("kind", brand["kind"]) != brand["kind"]:
            raise HTTPException(422, "Non puoi cambiare il proprietario di un brand")
        if any(value is None for value in changes.values()):
            raise HTTPException(422, "I campi non possono essere null")
        if brand["kind"] == "client" and changes.get("usage_authorized") is False:
            # Authorization withdrawal blocks new AI generation using this brand.
            changes["authorization_confirmed_at"] = None
        elif changes.get("usage_authorized") is True:
            changes["authorization_confirmed_at"] = datetime.now(timezone.utc).isoformat()
        changes["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.marketing_brands.update_one(query, {"$set": changes})
        brand.update(changes)
        return brand

    @router.get("/marketing/brands/{brand_id}/style")
    async def get_marketing_style(brand_id: str, user: Dict = Depends(reader)):
        brand = await db.marketing_brands.find_one(
            company_scope(user, brand_id=brand_id), {"_id": 0, "brand_id": 1, "learning_enabled": 1}
        )
        if not brand:
            raise HTTPException(404, "Profilo brand non trovato")
        if not brand.get("learning_enabled", True):
            return {"sample_count": 0, "target_samples": 6, "style_ready": False,
                    "frequent_tones": [], "frequent_channels": [], "frequent_formats": [],
                    "examples": [], "learning_disabled": True}
        return await approved_style(db, company_scope, user, brand_id)
