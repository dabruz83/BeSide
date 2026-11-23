import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deployment import InMemoryDatabase, server  # noqa: E402
import billing  # noqa: E402


def test_deletion_workflow_is_tenant_scoped_and_resumable(monkeypatch):
    fake_db = InMemoryDatabase()
    fake_db.companies.documents.extend([
        {"company_id": "company_delete", "business_info": {"partita_iva": "IT123"}},
        {"company_id": "company_keep", "business_info": {"partita_iva": "IT999"}},
    ])
    fake_db.users.documents.extend([
        {"user_id": "owner_delete", "company_id": "company_delete"},
        {"user_id": "member_delete", "company_id": "company_delete"},
        {"user_id": "owner_keep", "company_id": "company_keep"},
    ])
    fake_db.jobs.documents.extend([
        {"job_id": "job_delete", "company_id": "company_delete"},
        {"job_id": "job_keep", "company_id": "company_keep"},
    ])
    fake_db.account_deletion_operations.documents.append({
        "operation_id": "op_delete", "company_id": "company_delete", "status": "billing_cancelled",
    })
    monkeypatch.setattr(server, "db", fake_db)

    asyncio.run(server._run_account_deletion("op_delete"))

    assert not any(doc.get("company_id") == "company_delete" for doc in fake_db.companies.documents)
    assert any(doc.get("company_id") == "company_keep" for doc in fake_db.companies.documents)
    assert not any(doc.get("company_id") == "company_delete" for doc in fake_db.users.documents)
    assert any(doc.get("company_id") == "company_keep" for doc in fake_db.users.documents)
    assert not any(doc.get("company_id") == "company_delete" for doc in fake_db.jobs.documents)
    assert any(doc.get("company_id") == "company_keep" for doc in fake_db.jobs.documents)
    assert fake_db.retained_fiscal_records.documents[0]["fiscal"]["partita_iva"] == "IT123"
    assert fake_db.account_deletion_operations.documents[0]["status"] == "completed"


def test_stripe_immediate_cancel_is_verified(monkeypatch):
    class FakeSubscriptions:
        def __init__(self):
            self.status = "active"

        async def retrieve_async(self, _subscription_id):
            return {"status": self.status}

        async def cancel_async(self, _subscription_id):
            self.status = "canceled"

    subscriptions = FakeSubscriptions()
    class FakeApi:
        class V1:
            pass
        def __init__(self):
            self.v1 = self.V1()
            self.v1.subscriptions = subscriptions

    monkeypatch.setenv("STRIPE_SECRET_KEY", "test-key")
    monkeypatch.setattr(billing.stripe, "StripeClient", lambda _key: FakeApi())
    result = asyncio.run(billing.cancel_subscription_immediately("sub_test"))
    assert result["status"] == "canceled"


def test_deletion_releases_email_claims_and_security_artifacts_without_touching_other_tenants(monkeypatch):
    fake_db = InMemoryDatabase()
    deleted_email = "deleted@example.test"
    other_email = "active@example.test"
    fake_db.companies.documents.extend([
        {"company_id": "company_delete"},
        {"company_id": "company_keep"},
    ])
    fake_db.users.documents.extend([
        {"user_id": "owner_delete", "company_id": "company_delete", "email": deleted_email},
        {"user_id": "owner_keep", "company_id": "company_keep", "email": other_email},
    ])
    fake_db.email_claims.documents.extend([
        {"_id": server.email_claim_id(deleted_email), "company_id": "company_delete", "user_id": "owner_delete"},
        {"_id": server.email_claim_id(other_email), "company_id": "company_keep", "user_id": "owner_keep"},
    ])
    fake_db.passkeys.documents.extend([
        {"credential_id": "pk_delete", "user_id": "owner_delete", "company_id": "company_delete"},
        {"credential_id": "pk_keep", "user_id": "owner_keep", "company_id": "company_keep"},
    ])
    fake_db.webauthn_challenges.documents.extend([
        {"challenge_id": "challenge_delete", "user_id": "owner_delete"},
        {"challenge_id": "challenge_keep", "user_id": "owner_keep"},
    ])
    fake_db.mfa_recovery_requests.documents.extend([
        {"request_id": "recovery_delete", "user_id": "owner_delete", "company_id": "company_delete"},
        {"request_id": "recovery_keep", "user_id": "owner_keep", "company_id": "company_keep"},
    ])
    fake_db.account_deletion_operations.documents.append({
        "operation_id": "op_delete", "company_id": "company_delete", "status": "billing_cancelled",
    })
    monkeypatch.setattr(server, "db", fake_db)

    asyncio.run(server._run_account_deletion("op_delete"))

    assert fake_db.account_deletion_operations.documents[0]["status"] == "completed"
    assert fake_db.email_claims.documents == [
        {"_id": server.email_claim_id(other_email), "company_id": "company_keep", "user_id": "owner_keep"},
    ]
    assert [row["credential_id"] for row in fake_db.passkeys.documents] == ["pk_keep"]
    assert [row["challenge_id"] for row in fake_db.webauthn_challenges.documents] == ["challenge_keep"]
    assert [row["request_id"] for row in fake_db.mfa_recovery_requests.documents] == ["recovery_keep"]


def test_reregistration_repairs_only_claim_from_a_completed_and_removed_account(monkeypatch):
    fake_db = InMemoryDatabase()
    email = "deleted@example.test"
    claim_id = server.email_claim_id(email)
    fake_db.email_claims.documents.append({
        "_id": claim_id, "company_id": "old_company", "user_id": "old_owner",
    })
    fake_db.account_deletion_operations.documents.append({
        "operation_id": "completed_op", "company_id": "old_company", "status": "completed",
    })
    monkeypatch.setattr(server, "db", fake_db)

    asyncio.run(server.reserve_email_claim(email, "new_owner", "new_company"))
    assert fake_db.email_claims.documents == [
        {
            "_id": claim_id, "user_id": "new_owner", "company_id": "new_company",
            "created_at": fake_db.email_claims.documents[0]["created_at"],
        },
    ]


def test_reregistration_cannot_reclaim_pending_or_active_account_claim(monkeypatch):
    from fastapi import HTTPException

    for status in ("deleting", "completed"):
        fake_db = InMemoryDatabase()
        email = "protected@example.test"
        fake_db.email_claims.documents.append({
            "_id": server.email_claim_id(email), "user_id": "original_owner", "company_id": "original_company",
        })
        fake_db.account_deletion_operations.documents.append({
            "operation_id": "op_existing", "company_id": "original_company", "status": status,
        })
        if status == "completed":
            fake_db.users.documents.append({
                "user_id": "original_owner", "company_id": "original_company", "email": email,
            })
        monkeypatch.setattr(server, "db", fake_db)
        try:
            asyncio.run(server.reserve_email_claim(email, "new_owner", "new_company"))
        except HTTPException as exc:
            assert exc.status_code == 400
        else:
            raise AssertionError("The claim must remain held while deletion is pending or the user exists")
        assert fake_db.email_claims.documents[0]["user_id"] == "original_owner"
