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


def test_cash_plan_calculation_keeps_reserves_separate_from_paid_outflows():
    records = [
        {
            "cash_plan_id": "cash_january",
            "month": "2027-01",
            "data_type": "actual",
            "revenue": 5000,
            "fixed_expenses": 1000,
            "variable_expenses": 500,
            "other_expenses": 250,
            "taxes_paid": 0,
            "tax_regime": "forfettario_15",
        },
        {
            "cash_plan_id": "cash_february",
            "month": "2027-02",
            "data_type": "forecast",
            "revenue": 4000,
            "fixed_expenses": 1000,
            "variable_expenses": 400,
            "other_expenses": 100,
            "taxes_paid": 600,
            "tax_regime": "forfettario_15",
        },
    ]

    calculated = server.calculate_cash_plan_records(records, opening_balance=10000)
    january, february = calculated

    assert january["operating_expenses"] == 1750
    assert january["real_outflows"] == 1750
    assert january["real_cash_flow"] == 3250
    assert january["closing_balance"] == 13250
    assert january["available_liquidity"] == january["closing_balance"] - january["recommended_tax_reserve"]
    assert february["opening_balance"] == january["closing_balance"]
    assert february["real_outflows"] == 2100
    assert february["reserved_tax_balance"] == round(
        january["recommended_tax_reserve"] + february["recommended_tax_reserve"] - 600,
        2,
    )


def test_cash_plan_summary_warns_gently_on_first_critical_forecast_month():
    records = [{
        "cash_plan_id": "cash_warning",
        "month": "2027-01",
        "data_type": "forecast",
        "revenue": 500,
        "fixed_expenses": 2000,
        "variable_expenses": 0,
        "other_expenses": 0,
        "taxes_paid": 0,
        "tax_regime": "forfettario_5",
    }]

    summary = server.build_cash_plan_summary(records, opening_balance=0, current_month="2027-01")

    assert summary["liquidity_warning"]["month"] == "2027-01"
    assert summary["liquidity_warning"]["shortfall"] > 0
    assert summary["available_liquidity"] < 0
    assert server.add_months_to_cash_plan("2026-12", 1) == "2027-01"


def matches_query(document, query):
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$lt" in expected and not actual < expected["$lt"]:
                return False
            if "$gte" in expected and not actual >= expected["$gte"]:
                return False
        elif actual != expected:
            return False
    return True


def apply_projection(document, projection):
    result = copy.deepcopy(document)
    if not projection:
        result.pop("_id", None)
        return result
    included = [key for key, value in projection.items() if value == 1 and key != "_id"]
    if included:
        return {key: result[key] for key in included if key in result}
    for key, value in projection.items():
        if value == 0:
            result.pop(key, None)
    return result


class InMemoryCursor:
    def __init__(self, documents, projection=None):
        self.documents = [apply_projection(document, projection) for document in documents]

    def sort(self, key, direction):
        self.documents.sort(key=lambda document: document.get(key, ""), reverse=direction < 0)
        return self

    def limit(self, amount):
        self.documents = self.documents[:amount]
        return self

    async def to_list(self, amount):
        return copy.deepcopy(self.documents[:amount])


class InMemoryCollection:
    def __init__(self):
        self.documents = []

    def find(self, query, projection=None):
        matching = [document for document in self.documents if matches_query(document, query)]
        return InMemoryCursor(matching, projection)

    async def find_one(self, query, projection=None):
        matching = next((document for document in self.documents if matches_query(document, query)), None)
        return apply_projection(matching, projection) if matching is not None else None

    async def insert_one(self, document):
        self.documents.append(copy.deepcopy(document))
        return SimpleNamespace(inserted_id=document.get("cash_plan_id"))

    async def update_one(self, query, update, upsert=False):
        matching = next((document for document in self.documents if matches_query(document, query)), None)
        inserted = False
        if matching is None and upsert:
            matching = copy.deepcopy(query)
            self.documents.append(matching)
            inserted = True
        if matching is None:
            return SimpleNamespace(matched_count=0)
        if inserted:
            matching.update(copy.deepcopy(update.get("$setOnInsert", {})))
        matching.update(copy.deepcopy(update.get("$set", {})))
        return SimpleNamespace(matched_count=1)

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if matches_query(document, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


def test_cash_plan_crud_copy_and_user_separation(monkeypatch):
    fake_db = SimpleNamespace(
        cash_plan_entries=InMemoryCollection(),
        cash_plan_settings=InMemoryCollection(),
        finance_settings=InMemoryCollection(),
        tax_accruals=InMemoryCollection(),
    )
    monkeypatch.setattr(server, "db", fake_db)
    first_user = {"user_id": "user_first", "tax_regime": "forfettario_15"}
    second_user = {"user_id": "user_second", "tax_regime": "forfettario_5"}
    fake_db.finance_settings.documents.append({
        "user_id": "user_first",
        "period": "yearly",
        "revenue": 72000,
        "fixed_expenses": 12000,
        "variable_expenses": 6000,
    })

    async def exercise_cash_plan():
        await server.update_cash_plan_settings(server.CashPlanSettingsUpdate(opening_balance=10000), first_user)
        january_data = server.CashPlanMonthCreate(
            month="2027-01",
            data_type="actual",
            revenue=5000,
            fixed_expenses=1200,
            variable_expenses=400,
            other_expenses=100,
            taxes_paid=0,
            notes="Primo mese",
        )
        first_month = await server.create_cash_plan_month(january_data, first_user)
        second_user_month = await server.create_cash_plan_month(january_data, second_user)

        updated_data = server.CashPlanMonthUpdate(
            **{**january_data.model_dump(), "revenue": 6000, "notes": "Incasso aggiornato"}
        )
        updated_month = await server.update_cash_plan_month(
            first_month["cash_plan_id"],
            updated_data,
            first_user,
        )
        generated = await server.generate_cash_plan_forecast(
            server.CashPlanForecastRequest(method="copy_previous", months=2),
            first_user,
        )
        averaged = await server.generate_cash_plan_forecast(
            server.CashPlanForecastRequest(method="average_3", months=1),
            first_user,
        )
        first_user_plan = await server.get_cash_plan_months(current_user=first_user)
        second_user_plan = await server.get_cash_plan_months(current_user=second_user)

        assert updated_month["revenue"] == 6000
        assert generated["created_count"] == 2
        assert generated["months"][0]["fixed_expenses"] == 1200
        assert averaged["months"][0]["revenue"] == 6000
        assert len(first_user_plan["months"]) == 4
        assert first_user_plan["recurring_defaults"]["fixed_expenses"] == 1000
        assert len(second_user_plan["months"]) == 1
        assert all(record["user_id"] == "user_first" for record in first_user_plan["months"])
        assert second_user_plan["months"][0]["cash_plan_id"] == second_user_month["cash_plan_id"]

        with pytest.raises(server.HTTPException) as forbidden_update:
            await server.update_cash_plan_month(
                second_user_month["cash_plan_id"],
                updated_data,
                first_user,
            )
        assert forbidden_update.value.status_code == 404

        await server.delete_cash_plan_month(first_month["cash_plan_id"], first_user)
        plan_after_delete = await server.get_cash_plan_months(current_user=first_user)
        assert len(plan_after_delete["months"]) == 3
        assert plan_after_delete["months"][0]["opening_balance"] == 10000

    asyncio.run(exercise_cash_plan())


def test_legacy_tax_accruals_are_copied_without_deleting_source(monkeypatch):
    fake_db = SimpleNamespace(
        cash_plan_entries=InMemoryCollection(),
        cash_plan_settings=InMemoryCollection(),
        finance_settings=InMemoryCollection(),
        tax_accruals=InMemoryCollection(),
    )
    fake_db.tax_accruals.documents.append({
        "accrual_id": "legacy_accrual",
        "user_id": "user_legacy",
        "month": "2026-11",
        "revenue": 4500,
        "tax_regime": "forfettario_15",
        "created_at": "2026-11-30T12:00:00+00:00",
    })
    monkeypatch.setattr(server, "db", fake_db)

    result = asyncio.run(server.get_cash_plan_months(
        current_user={"user_id": "user_legacy", "tax_regime": "forfettario_15"},
    ))

    assert len(result["months"]) == 1
    assert result["months"][0]["month"] == "2026-11"
    assert result["months"][0]["revenue"] == 4500
    assert result["months"][0]["notes"] == "Importato dallo storico accantonamenti"
    assert len(fake_db.tax_accruals.documents) == 1
