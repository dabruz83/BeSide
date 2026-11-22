"""Agency startup trust boundary and tenant workflow; no live services."""
import asyncio
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import APIRouter, FastAPI

from test_deployment import InMemoryDatabase, server
from agency_marketing import register_agency_marketing_routes

ORIGIN = 'https://agency.mybeside.pro'


def startup(**overrides):
    env = {k: v for k, v in os.environ.items() if not k.startswith(
        ('WEBAUTHN_', 'AGENCY_', 'RAILWAY_', 'COOKIE_', 'ADMIN_PUBLIC_', 'FRONTEND_PUBLIC_', 'PUBLIC_APP_'))}
    env.update(APP_ENV='agency', MONGO_URL='mongodb://127.0.0.1:1', DB_NAME='beside_agency',
               CORS_ORIGINS=ORIGIN, JWT_SECRET_KEY='test-only-' + 'x' * 32,
               ADMIN_EMAIL='admin@example.test', ADMIN_PASSWORD='test-only-password',
               EXTERNAL_SERVICES_ENABLED='false', RESEND_ENABLED='false', EMAIL_VERIFICATION_REQUIRED='false',
               WEBAUTHN_ENABLED='true', WEBAUTHN_RP_ID='agency.mybeside.pro', WEBAUTHN_ORIGIN=ORIGIN,
               AGENCY_WEBAUTHN_ORIGIN=ORIGIN, AGENCY_RAILWAY_ENVIRONMENT_ID='new-agency-test-environment',
               RAILWAY_ENVIRONMENT_ID='new-agency-test-environment')
    env.update(overrides)
    return subprocess.run([sys.executable, '-c', 'import server; print(server.WEBAUTHN_ENABLED)'],
                          cwd=Path(__file__).resolve().parents[1], env=env,
                          capture_output=True, text=True, timeout=20)


def test_agency_custom_origin_and_disabled_default():
    assert startup().returncode == 0
    result = startup(WEBAUTHN_ENABLED='', WEBAUTHN_RP_ID='', WEBAUTHN_ORIGIN='', AGENCY_WEBAUTHN_ORIGIN='')
    assert result.returncode == 0 and result.stdout.strip() == 'False'


@pytest.mark.parametrize('overrides', [
    {'RAILWAY_ENVIRONMENT_ID': 'other'}, {'AGENCY_RAILWAY_ENVIRONMENT_ID': ''},
    {'AGENCY_RAILWAY_ENVIRONMENT_ID': server.RAILWAY_STAGING_ENVIRONMENT_ID,
     'RAILWAY_ENVIRONMENT_ID': server.RAILWAY_STAGING_ENVIRONMENT_ID},
    {'WEBAUTHN_RP_ID': 'mybeside.pro'}, {'WEBAUTHN_ORIGIN': ORIGIN + '/'},
    {'WEBAUTHN_ORIGIN': ORIGIN + ',https://evil.test'},
    {'AGENCY_WEBAUTHN_ORIGIN': 'https://evil.test'},
    {'WEBAUTHN_ORIGIN': 'https://*.mybeside.pro'},
    {'WEBAUTHN_ORIGIN': ORIGIN + ':443'}, {'WEBAUTHN_ORIGIN': 'http://agency.mybeside.pro'},
    {'WEBAUTHN_ORIGIN': ORIGIN + '/path'},
    {'DB_NAME': 'wrapping'}, {'CORS_ORIGINS': 'https://app.mybeside.pro'},
    {'PUBLIC_APP_URL': 'https://app.mybeside.pro'}, {'ADMIN_PUBLIC_URL': 'https://admin.mybeside.pro'},
    {'COOKIE_SECURE': 'false'}, {'COOKIE_SAMESITE': 'none'},
])
def test_agency_rejects_untrusted_configuration(overrides):
    assert startup(**overrides).returncode != 0


def test_original_staging_guard_preserved():
    config = dict(APP_ENV='staging', WEBAUTHN_RP_ID=server.STAGING_WEBAUTHN_RP_ID,
                  WEBAUTHN_ORIGIN=server.STAGING_WEBAUTHN_ORIGIN,
                  RAILWAY_ENVIRONMENT_ID=server.RAILWAY_STAGING_ENVIRONMENT_ID)
    assert startup(**config).returncode == 0
    config['RAILWAY_ENVIRONMENT_ID'] = 'unapproved'
    assert startup(**config).returncode != 0


def test_agency_crud_isolation_validation_and_deletion(monkeypatch):
    database = InMemoryDatabase()
    user = {'company_id': 'a', 'user_id': 'a-owner', 'role': 'owner'}
    async def authenticated():
        return user.copy()
    async def rate_limit(*args, **kwargs):
        pass
    router = APIRouter()
    register_agency_marketing_routes(router, database, server.company_scope,
                                    server.require_company_roles, False, rate_limit)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[server.get_current_user] = authenticated
    monkeypatch.setattr(server, 'db', database)
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            base = '/agency/marketing/contents'
            a = (await client.post(base, json={'title': 'A'})).json()
            user['company_id'] = 'b'
            b = (await client.post(base, json={'title': 'B'})).json()
            assert [row['title'] for row in (await client.get(base)).json()] == ['B']
            assert (await client.patch(base + '/' + a['content_id'], json={'title': 'stolen'})).status_code == 404
            assert (await client.delete(base + '/' + a['content_id'])).status_code == 404
            path = base + '/' + b['content_id']
            assert (await client.patch(path, json={'body': None})).status_code == 422
            assert (await client.patch(path, json={'status': 'scheduled'})).status_code == 422
            assert (await client.patch(path, json={'status': 'scheduled', 'scheduled_date': '2026-12-01'})).status_code == 200
            assert (await client.post('/agency/marketing/generate', json={'action': 'post'})).status_code == 503
            database.account_deletion_operations.documents.append(
                {'operation_id': 'delete-a', 'company_id': 'a', 'status': 'billing_cancelled'})
            await server._run_account_deletion('delete-a')
            assert [row['company_id'] for row in database.agency_marketing_contents.documents] == ['b']
            user['role'] = 'viewer'
            assert (await client.delete(path)).status_code == 403
            user['role'] = 'owner'
            assert (await client.delete(path)).status_code == 200
    asyncio.run(exercise())


def test_gemini_failure_does_not_expose_provider_details(monkeypatch, caplog):
    from google import genai
    def fail(**kwargs):
        raise RuntimeError('secret-key-and-private-prompt')
    monkeypatch.setattr(genai, 'Client', fail)
    monkeypatch.setenv('GEMINI_API_KEY', 'test-only')
    async def user():
        return {'company_id': 'a', 'user_id': 'a'}
    async def rate_limit(*args, **kwargs):
        pass
    router = APIRouter()
    register_agency_marketing_routes(router, InMemoryDatabase(), server.company_scope,
                                    lambda *roles: user, True, rate_limit)
    app = FastAPI()
    app.include_router(router)
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/agency/marketing/generate', json={'action': 'post'})
            assert response.status_code == 502
            assert 'secret-key' not in response.text
    asyncio.run(exercise())
    assert 'secret-key' not in caplog.text
