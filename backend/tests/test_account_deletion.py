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
