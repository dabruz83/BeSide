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
import jwt
from fastapi import BackgroundTasks, Request


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
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


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
        document = self.documents.get(query["company_id"])
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
        self.documents[query["company_id"]] = copy.deepcopy(update["$set"])


def test_finance_settings_are_persisted_per_company(monkeypatch):
    collection = InMemoryFinanceSettingsCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(finance_settings=collection))
    user = {"user_id": "user_finance", "company_id": "company_finance", "tax_regime": "forfettario_5"}
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
    assert "company_id" not in loaded


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
    if "$or" in query and not any(matches_query(document, item) for item in query["$or"]):
        return False
    for key, expected in query.items():
        if key == "$or":
            continue
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$exists" in expected and (key in document) != expected["$exists"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$lt" in expected and (actual is None or not actual < expected["$lt"]):
                return False
            if "$gt" in expected and (actual is None or not actual > expected["$gt"]):
                return False
            if "$gte" in expected and (actual is None or not actual >= expected["$gte"]):
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

    def skip(self, amount):
        self.documents = self.documents[amount:]
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
        if "_id" in document and any(
            existing.get("_id") == document["_id"] for existing in self.documents
        ):
            raise server.DuplicateKeyError("duplicate _id")
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
        for key in update.get("$unset", {}):
            matching.pop(key, None)
        return SimpleNamespace(matched_count=1)

    async def update_many(self, query, update):
        matched_count = 0
        for document in self.documents:
            if matches_query(document, query):
                document.update(copy.deepcopy(update.get("$set", {})))
                for key in update.get("$unset", {}):
                    document.pop(key, None)
                matched_count += 1
        return SimpleNamespace(matched_count=matched_count, modified_count=matched_count)

    async def find_one_and_update(self, query, update, return_document=None, upsert=False):
        matching = next((document for document in self.documents if matches_query(document, query)), None)
        inserted = False
        if matching is None and upsert:
            matching = copy.deepcopy(query)
            self.documents.append(matching)
            inserted = True
        if matching is None:
            return None
        if inserted:
            matching.update(copy.deepcopy(update.get("$setOnInsert", {})))
        matching.update(copy.deepcopy(update.get("$set", {})))
        for key, amount in update.get("$inc", {}).items():
            matching[key] = matching.get(key, 0) + amount
        for key in update.get("$unset", {}):
            matching.pop(key, None)
        return copy.deepcopy(matching)

    async def create_index(self, *args, **kwargs):
        return "test_index"

    async def count_documents(self, query):
        return sum(1 for document in self.documents if matches_query(document, query))

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents = [document for document in self.documents if not matches_query(document, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if matches_query(document, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


class InMemoryDatabase:
    def __init__(self, **collections):
        self.collections = collections

    def __getattr__(self, name):
        if name not in self.collections:
            self.collections[name] = InMemoryCollection()
        return self.collections[name]

    def __getitem__(self, name):
        return getattr(self, name)


def test_cash_plan_crud_copy_and_company_separation(monkeypatch):
    fake_db = SimpleNamespace(
        cash_plan_entries=InMemoryCollection(),
        cash_plan_settings=InMemoryCollection(),
        finance_settings=InMemoryCollection(),
        tax_accruals=InMemoryCollection(),
    )
    monkeypatch.setattr(server, "db", fake_db)
    first_user = {
        "user_id": "user_first",
        "company_id": "company_first",
        "role": "owner",
        "tax_regime": "forfettario_15",
    }
    second_user = {
        "user_id": "user_second",
        "company_id": "company_second",
        "role": "owner",
        "tax_regime": "forfettario_5",
    }
    fake_db.finance_settings.documents.append({
        "company_id": "company_first",
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
        assert all(record["company_id"] == "company_first" for record in first_user_plan["months"])
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
        "company_id": "company_legacy",
        "user_id": "user_legacy",
        "month": "2026-11",
        "revenue": 4500,
        "tax_regime": "forfettario_15",
        "created_at": "2026-11-30T12:00:00+00:00",
    })
    monkeypatch.setattr(server, "db", fake_db)

    result = asyncio.run(server.get_cash_plan_months(
        current_user={
            "user_id": "user_legacy",
            "company_id": "company_legacy",
            "tax_regime": "forfettario_15",
        },
    ))

    assert len(result["months"]) == 1
    assert result["months"][0]["month"] == "2026-11"
    assert result["months"][0]["revenue"] == 4500
    assert result["months"][0]["notes"] == "Importato dallo storico accantonamenti"
    assert len(fake_db.tax_accruals.documents) == 1


def make_request(path="/api/test", method="POST", headers=None):
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    })


def test_registration_creates_company_owner_and_exact_seven_day_trial(monkeypatch):
    fake_db = InMemoryDatabase()
    monkeypatch.setattr(server, "db", fake_db)
    user_data = server.UserCreate(
        email="Owner@Beside.it",
        password="StrongPass-123",
        first_name="Owner",
        business_name="Tenant One",
        team_size=1,
        services=["ppf"],
        tax_regime="forfettario_15",
    )

    async def exercise_registration_and_login():
        registered = await server.register(
            user_data,
            BackgroundTasks(),
            make_request("/api/auth/register"),
        )
        response = server.Response()
        logged_in = await server.login(
            server.UserLogin(email=user_data.email, password=user_data.password),
            response,
            make_request("/api/auth/login"),
        )
        return registered, logged_in

    registered, logged_in = asyncio.run(exercise_registration_and_login())
    company = fake_db.companies.documents[0]
    user = fake_db.users.documents[0]
    trial_delta = server.parse_datetime(company["trial_ends_at"]) - server.parse_datetime(company["trial_started_at"])

    assert registered["company_id"] == company["company_id"]
    assert company["subscription_status"] == "trialing"
    assert trial_delta == server.timedelta(days=7)
    assert user["role"] == "owner"
    assert user["email"] == "owner@beside.it"
    assert logged_in["user"]["company_id"] == company["company_id"]
    assert logged_in["user"]["subscription_status"] == "trialing"
    assert any(log["event"] == "registration" for log in fake_db.audit_logs.documents)
    assert any(log["event"] == "login" for log in fake_db.audit_logs.documents)


def test_company_scope_blocks_cross_tenant_job_access_and_allows_collaborator(monkeypatch):
    fake_db = InMemoryDatabase()
    fake_db.jobs.documents.append({
        "job_id": "job_private",
        "company_id": "company_one",
        "user_id": "owner_one",
        "client_name": "Cliente riservato",
    })
    monkeypatch.setattr(server, "db", fake_db)

    collaborator = {"user_id": "member_one", "company_id": "company_one", "role": "member"}
    outsider = {"user_id": "owner_two", "company_id": "company_two", "role": "owner"}

    assert asyncio.run(server.get_job("job_private", collaborator))["client_name"] == "Cliente riservato"
    with pytest.raises(server.HTTPException) as denied:
        asyncio.run(server.get_job("job_private", outsider))
    assert denied.value.status_code == 404


def test_company_role_dependency_denies_viewer_writes():
    dependency = server.require_company_roles("owner", "admin", "member")

    allowed = asyncio.run(dependency(current_user={"role": "member"}))
    assert allowed["role"] == "member"
    with pytest.raises(server.HTTPException) as denied:
        asyncio.run(dependency(current_user={"role": "viewer"}))
    assert denied.value.status_code == 403


def test_expired_jwt_is_rejected():
    expired = jwt.encode(
        {
            "user_id": "user_expired",
            "company_id": "company_expired",
            "type": "access",
            "exp": server.datetime.now(server.timezone.utc) - server.timedelta(seconds=1),
        },
        server.JWT_SECRET,
        algorithm=server.JWT_ALGORITHM,
    )

    with pytest.raises(server.HTTPException) as denied:
        server.decode_jwt_token(expired)
    assert denied.value.status_code == 401
    assert denied.value.detail == "Token scaduto"


def test_password_reset_token_is_one_time_and_revokes_sessions(monkeypatch):
    fake_db = InMemoryDatabase()
    user = {
        "user_id": "user_reset",
        "company_id": "company_reset",
        "email": "reset@example.test",
        "password_hash": server.hash_password("OldPassword-123"),
        "is_active": True,
    }
    fake_db.users.documents.append(user)
    fake_db.user_sessions.documents.append({
        "user_id": user["user_id"],
        "company_id": user["company_id"],
        "revoked_at": None,
    })
    monkeypatch.setattr(server, "db", fake_db)

    async def exercise_reset():
        token = await server.create_one_time_token(
            fake_db.password_reset_tokens,
            user,
            server.timedelta(minutes=30),
        )
        payload = server.PasswordResetRequest(token=token, password="NewPassword-456")
        result = await server.reset_password(payload, make_request("/api/auth/reset-password"))
        with pytest.raises(server.HTTPException) as second_use:
            await server.reset_password(payload, make_request("/api/auth/reset-password"))
        return result, second_use.value

    result, second_error = asyncio.run(exercise_reset())

    assert result["message"].startswith("Password aggiornata")
    assert second_error.status_code == 400
    assert server.verify_password("NewPassword-456", fake_db.users.documents[0]["password_hash"])
    assert fake_db.user_sessions.documents[0]["revoked_at"] is not None
    assert any(log["event"] == "password_reset_completed" for log in fake_db.audit_logs.documents)


def test_expired_password_reset_token_is_rejected(monkeypatch):
    fake_db = InMemoryDatabase()
    user = {
        "user_id": "user_expired_reset",
        "company_id": "company_expired_reset",
        "email": "expired-reset@beside.it",
        "password_hash": server.hash_password("OldPassword-123"),
        "is_active": True,
    }
    fake_db.users.documents.append(user)
    monkeypatch.setattr(server, "db", fake_db)

    async def exercise_expired_reset():
        token = await server.create_one_time_token(
            fake_db.password_reset_tokens,
            user,
            server.timedelta(minutes=30),
        )
        fake_db.password_reset_tokens.documents[0]["expires_at"] = (
            server.datetime.now(server.timezone.utc) - server.timedelta(seconds=1)
        ).isoformat()
        await server.reset_password(
            server.PasswordResetRequest(token=token, password="NewPassword-456"),
            make_request("/api/auth/reset-password"),
        )

    with pytest.raises(server.HTTPException) as denied:
        asyncio.run(exercise_expired_reset())
    assert denied.value.status_code == 400
    assert server.verify_password("OldPassword-123", fake_db.users.documents[0]["password_hash"])


def test_legacy_migration_is_idempotent_and_backfills_company_id():
    from multitenancy import migrate_to_company_tenancy

    fake_db = InMemoryDatabase()
    fake_db.users.documents.append({
        "user_id": "legacy_user",
        "email": "Legacy@Example.Test",
        "business_name": "Legacy Company",
        "role": "user",
        "subscription_status": "trial",
        "created_at": "2026-01-01T00:00:00+00:00",
    })
    fake_db.jobs.documents.append({"job_id": "legacy_job", "user_id": "legacy_user"})
    fake_db.quote_tokens.documents.append({"token": "legacy_quote", "job_id": "legacy_job"})

    first = asyncio.run(migrate_to_company_tenancy(fake_db, "admin@example.test"))
    second = asyncio.run(migrate_to_company_tenancy(fake_db, "admin@example.test"))

    company_id = fake_db.users.documents[0]["company_id"]
    assert first["companies"] == 1
    assert second["companies"] == 0
    assert len(fake_db.companies.documents) == 1
    assert fake_db.users.documents[0]["role"] == "owner"
    assert fake_db.jobs.documents[0]["company_id"] == company_id
    assert fake_db.quote_tokens.documents[0]["company_id"] == company_id


def test_migration_never_escalates_company_admin_to_platform_admin():
    from multitenancy import migrate_to_company_tenancy

    fake_db = InMemoryDatabase()
    fake_db.users.documents.append({
        "user_id": "company_admin",
        "company_id": "company_existing",
        "email": "company-admin@beside.it",
        "business_name": "Existing Company",
        "role": "admin",
        "created_at": "2026-01-01T00:00:00+00:00",
    })
    fake_db.companies.documents.append({
        "company_id": "company_existing",
        "name": "Existing Company",
        "owner_user_id": "owner_existing",
        "status": "active",
    })

    asyncio.run(migrate_to_company_tenancy(fake_db, "platform-admin@beside.it"))

    migrated_user = fake_db.users.documents[0]
    assert migrated_user["role"] == "admin"
    assert "platform_role" not in migrated_user


def test_migration_never_escalates_legacy_admin_without_company():
    from multitenancy import migrate_to_company_tenancy

    fake_db = InMemoryDatabase()
    fake_db.users.documents.append({
        "user_id": "legacy_company_admin",
        "email": "legacy-admin@company.test",
        "business_name": "Legacy Tenant",
        "role": "admin",
        "created_at": "2026-01-01T00:00:00+00:00",
    })

    asyncio.run(migrate_to_company_tenancy(fake_db, "platform-admin@beside.it"))

    migrated_user = fake_db.users.documents[0]
    assert migrated_user["role"] == "admin"
    assert "platform_role" not in migrated_user
    assert migrated_user["company_id"] != server.PLATFORM_COMPANY_ID


def test_distributed_rate_limit_uses_hashed_key_and_rejects_excess(monkeypatch):
    fake_db = InMemoryDatabase()
    monkeypatch.setattr(server, "db", fake_db)
    request = make_request("/api/auth/login")

    async def exercise_limit():
        await server.enforce_rate_limit(
            request,
            "test_login",
            limit=1,
            window_seconds=60,
            identifier="Sensitive@Example.Test",
        )
        await server.enforce_rate_limit(
            request,
            "test_login",
            limit=1,
            window_seconds=60,
            identifier="Sensitive@Example.Test",
        )

    with pytest.raises(server.HTTPException) as denied:
        asyncio.run(exercise_limit())

    assert denied.value.status_code == 429
    stored = next(
        document for document in fake_db.rate_limits.documents
        if document.get("scope") == "test_login"
    )
    assert stored["count"] == 2
    assert "sensitive@example.test" not in str(stored).lower()
    assert len(stored["key"]) == 64
    assert stored["_id"] == stored["key"]


def test_email_claim_blocks_concurrent_registration_without_custom_index(monkeypatch):
    fake_db = InMemoryDatabase()
    monkeypatch.setattr(server, "db", fake_db)
    user_data = server.UserCreate(
        email="same@beside.it",
        password="StrongPass-123",
        first_name="First",
        business_name="First Company",
        team_size=1,
        services=["ppf"],
        tax_regime="forfettario_15",
    )

    asyncio.run(server.register(
        user_data,
        BackgroundTasks(),
        make_request("/api/auth/register"),
    ))
    # Simulate a stale read in the public pre-check: the _id-backed claim remains
    # authoritative even when Railway cannot create a custom email index.
    original_find_one = fake_db.users.find_one

    async def stale_email_lookup(query, projection=None):
        if query == {"email": "same@beside.it"}:
            return None
        return await original_find_one(query, projection)

    fake_db.users.find_one = stale_email_lookup
    with pytest.raises(server.HTTPException) as duplicate:
        asyncio.run(server.register(
            user_data,
            BackgroundTasks(),
            make_request("/api/auth/register"),
        ))

    assert duplicate.value.status_code == 400
    assert len(fake_db.users.documents) == 1
    assert len(fake_db.companies.documents) == 1
    assert len(fake_db.email_claims.documents) == 1


def test_low_disk_defers_indexes_without_hiding_other_database_errors():
    from multitenancy import ensure_multitenant_indexes
    from pymongo.errors import OperationFailure

    class FailingIndexCollection(InMemoryCollection):
        def __init__(self, code):
            super().__init__()
            self.code = code

        async def create_index(self, *args, **kwargs):
            raise OperationFailure("index failure", code=self.code)

    low_disk_db = InMemoryDatabase(users=FailingIndexCollection(14031))
    assert asyncio.run(ensure_multitenant_indexes(low_disk_db)) is False

    unexpected_db = InMemoryDatabase(users=FailingIndexCollection(13))
    with pytest.raises(OperationFailure) as unexpected:
        asyncio.run(ensure_multitenant_indexes(unexpected_db))
    assert unexpected.value.code == 13


def test_email_verification_can_be_enforced_without_locking_legacy_users(monkeypatch):
    monkeypatch.setattr(server, "EMAIL_VERIFICATION_REQUIRED", True)
    assert server.email_verification_blocks_access({
        "email_verified": False,
        "email_verification_exempt": False,
    })
    assert not server.email_verification_blocks_access({
        "email_verified": False,
        "email_verification_exempt": True,
    })
    assert not server.email_verification_blocks_access({
        "email_verified": True,
        "email_verification_exempt": False,
    })


def test_login_uses_httponly_cookie_and_never_returns_bearer_token(monkeypatch):
    fake_db = InMemoryDatabase()
    company = {
        "company_id": "company_cookie",
        "name": "Cookie Tenant",
        "owner_user_id": "user_cookie",
        "status": "active",
        "subscription_status": "trialing",
    }
    user = {
        "user_id": "user_cookie",
        "company_id": company["company_id"],
        "email": "cookie@example.com",
        "password_hash": server.hash_password("StrongPassword-123"),
        "role": "owner",
        "is_active": True,
        "email_verified": True,
    }
    fake_db.companies.documents.append(company)
    fake_db.users.documents.append(user)
    monkeypatch.setattr(server, "db", fake_db)
    response = server.Response()

    result = asyncio.run(server.login(
        server.UserLogin(email=user["email"], password="StrongPassword-123"),
        response,
        make_request("/api/auth/login"),
    ))

    assert "token" not in result
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie


def test_admin_secret_rotation_rehashes_password_and_revokes_sessions(monkeypatch):
    fake_db = InMemoryDatabase()
    admin = {
        "user_id": "admin_rotate",
        "company_id": server.PLATFORM_COMPANY_ID,
        "email": server.ADMIN_EMAIL.lower(),
        "platform_role": "super_admin",
        "password_hash": server.hash_password("OldAdminPassword-123"),
    }
    fake_db.users.documents.append(admin)
    fake_db.user_sessions.documents.append({
        "user_id": admin["user_id"],
        "revoked_at": None,
    })
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "ADMIN_PASSWORD", "NewAdminPassword-456")

    asyncio.run(server.synchronize_platform_admin_password())

    assert server.verify_password(
        "NewAdminPassword-456",
        fake_db.users.documents[0]["password_hash"],
    )
    assert not server.verify_password(
        "OldAdminPassword-123",
        fake_db.users.documents[0]["password_hash"],
    )
    assert fake_db.user_sessions.documents[0]["revoked_at"] is not None
