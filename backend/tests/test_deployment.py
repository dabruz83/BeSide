import asyncio
import importlib
import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
import httpx


BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIRECTORY))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "beside_test")
os.environ.setdefault("JWT_SECRET_KEY", f"test-jwt-{uuid.uuid4().hex}")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.test")
os.environ.setdefault("ADMIN_PASSWORD", f"test-admin-{uuid.uuid4().hex}")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

server = importlib.import_module("server")


class HealthyMongoAdmin:
    async def command(self, command):
        assert command == "ping"
        return {"ok": 1}


class UnhealthyMongoAdmin:
    async def command(self, _command):
        raise RuntimeError("database unavailable")


def test_health_check_reports_connected_database(monkeypatch):
    monkeypatch.setattr(server, "client", SimpleNamespace(admin=HealthyMongoAdmin()))

    result = asyncio.run(server.health_check())

    assert result == {"status": "healthy", "database": "connected"}


def test_public_api_root_is_available():
    async def request_api_root():
        transport = httpx.ASGITransport(app=server.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/api/")

    response = asyncio.run(request_api_root())

    assert response.status_code == 200
    assert response.json()["message"].startswith("BESIDE API")


def test_health_check_returns_503_when_database_is_unavailable(monkeypatch):
    monkeypatch.setattr(server, "client", SimpleNamespace(admin=UnhealthyMongoAdmin()))

    result = asyncio.run(server.health_check())

    assert result.status_code == 503


def test_cors_rejects_wildcard(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="explicit origins"):
        server.parse_cors_origins(server.get_required_environment_variable("CORS_ORIGINS"))


def test_cors_parses_multiple_origins_without_trailing_slashes():
    origins = server.parse_cors_origins(
        "https://frontend.example.test/, http://localhost:3000/"
    )

    assert origins == ["https://frontend.example.test", "http://localhost:3000"]
