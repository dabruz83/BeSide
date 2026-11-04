import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27018")
os.environ.setdefault("DB_NAME", "beside_test_resend")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-0123456789abcdef")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password-0123")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("FRONTEND_PUBLIC_URL", "http://localhost:3000")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COOKIE_SAMESITE", "lax")


class _Response:
    status_code = 202


class _ResendClient:
    calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, url, *, headers, json, timeout):
        self.calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response()


def test_resend_adapter_sends_payload(monkeypatch):
    import server

    client = _ResendClient()
    monkeypatch.setattr(server.httpx, "AsyncClient", lambda: client)
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(server, "RESEND_FROM_EMAIL", "Beside <notify@mybeside.pro>")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is True
    assert client.calls[0]["json"]["from"] == "Beside <notify@mybeside.pro>"
    assert client.calls[0]["json"]["to"] == ["test@example.com"]


def test_resend_disabled_or_missing_key_fails_closed(monkeypatch):
    import server

    monkeypatch.setattr(server, "RESEND_ENABLED", False)
    monkeypatch.setattr(server, "RESEND_API_KEY", "test-key")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is False
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is False


def test_resend_does_not_depend_on_external_services_flag(monkeypatch):
    import server

    client = _ResendClient()
    monkeypatch.setattr(server.httpx, "AsyncClient", lambda: client)
    monkeypatch.setattr(server, "EXTERNAL_SERVICES_ENABLED", False, raising=False)
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "test-key")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is True
