import asyncio
import copy
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


def test_tax_calculation_includes_expenses_without_changing_tax_amounts():
    without_expenses = server.calculate_tax(5000, "forfettario_15", "monthly")
    with_expenses = server.calculate_tax(
        5000,
        "forfettario_15",
        "monthly",
        fixed_expenses=1000,
        variable_expenses=500,
    )

    assert with_expenses["total_accrual"] == without_expenses["total_accrual"]
    assert with_expenses["operating_expenses"] == 1500
    assert with_expenses["total_outflows"] == without_expenses["total_accrual"] + 1500
    assert with_expenses["net_income"] == without_expenses["net_income"] - 1500
    assert with_expenses["yearly_projection"]["operating_expenses"] == 18000


def test_cash_flow_forecast_normalizes_yearly_values_and_crosses_year_boundary():
    forecast = server.build_cash_flow_forecast(
        revenue=120000,
        tax_regime="forfettario_5",
        period="yearly",
        fixed_expenses=24000,
        variable_expenses=12000,
        start_date=server.datetime(2026, 12, 15, tzinfo=server.timezone.utc),
    )

    assert len(forecast["forecast"]) == 12
    assert forecast["forecast"][0]["month"] == "2027-01"
    assert forecast["forecast"][-1]["month"] == "2027-12"
    assert forecast["forecast"][0]["inflows"] == 10000
    assert forecast["forecast"][0]["fixed_expenses"] == 2000
    assert forecast["forecast"][0]["variable_expenses"] == 1000
    assert forecast["forecast"][-1]["cumulative_cash_flow"] == forecast["summary"]["annual_net_cash_flow"]


class InMemoryFinanceSettingsCollection:
    def __init__(self):
        self.documents = {}

    async def find_one(self, query, projection=None):
        document = self.documents.get(query["user_id"])
        if document is None:
            return None
        result = copy.deepcopy(document)
        if projection:
            if all(value == 0 for value in projection.values()):
                for key, value in projection.items():
                    if value == 0:
                        result.pop(key, None)
            else:
                result = {
                    key: result[key]
                    for key, value in projection.items()
                    if value == 1 and key in result
                }
        return result

    async def update_one(self, query, update, upsert=False):
        assert upsert is True
        self.documents[query["user_id"]] = copy.deepcopy(update["$set"])


def test_finance_settings_are_persisted_per_user(monkeypatch):
    collection = InMemoryFinanceSettingsCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(finance_settings=collection))
    user = {"user_id": "user_finance", "tax_regime": "forfettario_5"}
    settings = server.FinanceSettingsUpdate(
        revenue=72000,
        tax_regime="ordinario",
        period="yearly",
        fixed_expenses=18000,
        variable_expenses=9000,
    )

    saved = asyncio.run(server.update_finance_settings(settings, user))
    loaded = asyncio.run(server.get_finance_settings(user))

    assert saved["revenue"] == 72000
    assert loaded["period"] == "yearly"
    assert loaded["fixed_expenses"] == 18000
    assert loaded["variable_expenses"] == 9000
    assert "user_id" not in loaded
