"""Regression checks for tenant-scoped brand style memory and inputs."""
import asyncio
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from marketing_brands import MarketingBrandInput, MarketingBrandPatch, approved_style, style_summary  # noqa: E402
from multitenancy import company_scope  # noqa: E402
from test_deployment import InMemoryDatabase  # noqa: E402


def test_approved_style_is_isolated_by_company_and_brand():
    db = InMemoryDatabase()
    db.agency_marketing_contents.documents.extend([
        {"company_id": "a", "brand_id": "brand_a", "status": "ready", "updated_at": "2026-01-01",
         "content_id": "approved", "body": "Stile elegante", "channel": "Instagram", "format": "post",
         "answers": {"tono": "Professionale · Semplice"}},
        {"company_id": "a", "brand_id": "brand_a", "status": "draft", "updated_at": "2026-01-04",
         "content_id": "draft", "body": "NON usare"},
        {"company_id": "a", "brand_id": "brand_b", "status": "ready", "updated_at": "2026-01-03",
         "content_id": "other_brand", "body": "ALTRO BRAND"},
        {"company_id": "b", "brand_id": "brand_a", "status": "ready", "updated_at": "2026-01-02",
         "content_id": "other_company", "body": "ALTRA AZIENDA"},
    ])
    user = {"user_id": "owner_a", "company_id": "a"}
    summary = asyncio.run(approved_style(db, company_scope, user, "brand_a"))
    assert summary["sample_count"] == 1
    assert summary["frequent_tones"] == ["Professionale", "Semplice"]
    assert [item["content_id"] for item in summary["examples"]] == ["approved"]


def test_style_requires_five_approved_samples_and_reads_at_most_six():
    example = {"body": "Testo approvato", "channel": "Instagram", "format": "post",
               "answers": {"tono": "Semplice"}}
    assert not style_summary([example] * 4)["style_ready"]
    db = InMemoryDatabase()
    db.agency_marketing_contents.documents.extend([
        {**example, "company_id": "a", "brand_id": "brand_a", "status": "published",
         "content_id": str(i), "updated_at": str(i)}
        for i in range(7)
    ])
    user = {"user_id": "owner_a", "company_id": "a"}
    ready = asyncio.run(approved_style(db, company_scope, user, "brand_a"))
    assert ready["style_ready"]
    assert ready["sample_count"] == 6
    assert len(ready["examples"]) == 6
    assert ready["frequent_tones"] == ["Semplice"]


def test_brand_validates_https_logo_and_hex_colors():
    MarketingBrandInput(name="Studio web", logo_url="https://example.com/logo.svg", primary_color="#02a6cb")
    with pytest.raises(ValidationError):
        MarketingBrandInput(name="Studio web", logo_url="javascript:alert(1)")
    with pytest.raises(ValidationError):
        MarketingBrandInput(name="Studio web", primary_color="blue")
    with pytest.raises(ValidationError):
        MarketingBrandInput(name="Studio web", reference_video_urls=["https://example.com/" + str(i) for i in range(7)])
    with pytest.raises(ValidationError):
        MarketingBrandInput(name="Studio web", reference_video_urls=["http://example.com/reel.mp4"])


def test_partial_update_does_not_replace_unspecified_brand_fields():
    updates = MarketingBrandPatch(tone="Professionale, semplice").model_dump(exclude_unset=True)
    assert updates == {"tone": "Professionale, semplice"}
