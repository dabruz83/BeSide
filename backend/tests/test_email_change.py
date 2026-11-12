import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deployment import InMemoryCollection, InMemoryDatabase, make_request, server  # noqa: E402


class ModifiedCollection(InMemoryCollection):
    async def update_one(self, query, update, upsert=False):
        result = await super().update_one(query, update, upsert)
        result.modified_count = result.matched_count
        return result


def test_email_change_request_and_verification_are_single_use(monkeypatch):
    fake_db = InMemoryDatabase(users=ModifiedCollection())
    user = {"user_id": "user_email", "company_id": "company_email", "email": "old@besidetest.com", "is_active": True}
    fake_db.users.documents.append(user)
    fake_db.email_claims.documents.append({"_id": server.email_claim_id(user["email"]), "user_id": user["user_id"], "company_id": user["company_id"]})
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "_consume_current_totp", lambda *_args: asyncio.sleep(0, result=True))
    monkeypatch.setattr(server, "audit_event", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(server, "secrets", SimpleNamespace(token_urlsafe=lambda _size: "email-change-token-12345678901234567890"))

    current = {**user, "role": "owner", "totp_enabled": True, "company": {}}

    async def exercise():
        result = await server.request_email_change(
            server.EmailChangeRequest(email="new@besidetest.com", code="123456"),
            server.BackgroundTasks(), make_request("/api/auth/email-change/request", method="POST"), current,
        )
        assert result["status"] == "pending"
        verified = await server.verify_email_change(
            server.TokenRequest(token="email-change-token-12345678901234567890"),
            make_request("/api/auth/email-change/verify", method="POST"),
        )
        assert verified["status"] == "verified"
        assert fake_db.users.documents[0]["email"] == "new@besidetest.com"
        assert not any(doc.get("_id") == server.email_claim_id("old@besidetest.com") for doc in fake_db.email_claims.documents)
        try:
            await server.verify_email_change(
                server.TokenRequest(token="email-change-token-12345678901234567890"),
                make_request("/api/auth/email-change/verify", method="POST"),
            )
        except server.HTTPException as exc:
            assert exc.status_code == 400
        else:
            raise AssertionError("Token riutilizzato")

    asyncio.run(exercise())


def test_email_change_rejects_invalid_totp(monkeypatch):
    fake_db = InMemoryDatabase()
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "_consume_current_totp", lambda *_args: asyncio.sleep(0, result=False))
    current = {"user_id": "user_email", "company_id": "company_email", "email": "old@besidetest.com", "role": "owner", "totp_enabled": True}

    async def exercise():
        try:
            await server.request_email_change(
                server.EmailChangeRequest(email="new@besidetest.com", code="000000"),
                server.BackgroundTasks(), make_request("/api/auth/email-change/request", method="POST"), current,
            )
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("TOTP non valido accettato")

    asyncio.run(exercise())
