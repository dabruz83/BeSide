import asyncio

import pytest


class _Response:
    def __init__(self, status_code):
        self.status_code = status_code


class _ResendClient:
    calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, url, *, headers, json, timeout):
        self.calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response(202)


def test_resend_adapter_sends_transactional_payload(monkeypatch):
    import server

    client = _ResendClient()
    monkeypatch.setattr(server.httpx, "AsyncClient", lambda: client)
    monkeypatch.setattr(server, "APP_ENV", "test")
    monkeypatch.setattr(server, "EXTERNAL_SERVICES_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(server, "RESEND_FROM_EMAIL", "Beside <notify@mybeside.pro>")
    monkeypatch.setattr(server, "RESEND_API_URL", "https://api.resend.com/emails")

    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is True
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["json"] == {
        "from": "Beside <notify@mybeside.pro>",
        "to": ["test@example.com"],
        "subject": "Subject",
        "html": "<p>Body</p>",
    }
    assert call["headers"]["Authorization"] == "Bearer test-key"
    assert call["timeout"] == 30.0


def test_resend_adapter_skips_when_not_configured(monkeypatch):
    import server

    monkeypatch.setattr(server, "APP_ENV", "test")
    monkeypatch.setattr(server, "EXTERNAL_SERVICES_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_ENABLED", False)
    monkeypatch.setattr(server, "RESEND_API_KEY", "")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is False


def test_resend_is_independent_from_global_external_services(monkeypatch):
    import asyncio
    import server

    client = _ResendClient()
    monkeypatch.setattr(server.httpx, "AsyncClient", lambda: client)
    monkeypatch.setattr(server, "APP_ENV", "test")
    monkeypatch.setattr(server, "EXTERNAL_SERVICES_ENABLED", False)
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(server, "RESEND_FROM_EMAIL", "Beside <notify@mybeside.pro>")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is True


def test_resend_enabled_without_key_fails_closed(monkeypatch):
    import asyncio
    import server

    monkeypatch.setattr(server, "APP_ENV", "test")
    monkeypatch.setattr(server, "RESEND_ENABLED", True)
    monkeypatch.setattr(server, "RESEND_API_KEY", "")
    assert asyncio.run(server.send_email("test@example.com", "Subject", "<p>Body</p>")) is False
