"""Demo registration and TOTP lifecycle, without a live database or email."""
import asyncio
import pytest
from fastapi import BackgroundTasks
from test_deployment import InMemoryDatabase, make_request, server

SERVICES = ['websites', 'ecommerce', 'seo', 'maintenance', 'digital_marketing']


def payload(services=SERVICES):
    return server.UserCreate(email='demo@example.com', password='DemoPassword-123',
                             business_name='Demo Agency', first_name='Demo', services=services,
                             terms_accepted=True, onboarding_complete=True)


@pytest.fixture
def database(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr(server, 'db', db)
    monkeypatch.setattr(server, 'APP_ENV', 'agency')
    monkeypatch.setattr(server, 'BETA_MODE_ENABLED', False)
    monkeypatch.setattr(server, 'EMAIL_VERIFICATION_REQUIRED', False)
    monkeypatch.setattr(server, 'TOTP_ENCRYPTION_KEY', 'agency-test-only-totp-key')
    return db


@pytest.mark.parametrize('env,services,accepted', [
    ('agency', SERVICES, True), ('agency', ['ppf'], False), ('agency', ['wrap'], False),
    ('agency', ['unknown'], False), ('agency', ['seo', 'tint'], False),
    ('production', ['ppf', 'wrap', 'tint', 'upholstery'], True),
    ('staging', SERVICES, False), ('production', SERVICES, False),
])
def test_services_are_environment_scoped(database, monkeypatch, env, services, accepted):
    monkeypatch.setattr(server, 'APP_ENV', env)
    async def exercise():
        if accepted:
            await server.register(payload(services), BackgroundTasks(), make_request('/api/auth/register'))
            assert database.users.documents[0]['services'] == services
        else:
            with pytest.raises(server.HTTPException) as error:
                await server.register(payload(services), BackgroundTasks(), make_request('/api/auth/register'))
            assert error.value.status_code == 400
            assert not database.users.documents and not database.companies.documents
    asyncio.run(exercise())


def test_registration_setup_logout_and_totp_login(database):
    def request(path, cookie, method='POST'):
        return make_request(path, method=method, headers={'cookie': cookie, 'origin': server.CORS_ORIGINS[0]})
    def cookie(response):
        return response.headers['set-cookie'].split(';', 1)[0]
    async def blocked(session):
        with pytest.raises(server.HTTPException) as error:
            await server.get_current_user(request('/api/dashboard/metrics', session, 'GET'))
        assert error.value.status_code == 401
    async def exercise():
        registered = await server.register(payload(), BackgroundTasks(), make_request('/api/auth/register'))
        assert not registered['email_verification_required']
        assert not database.user_sessions.documents
        credentials = server.UserLogin(email=payload().email, password=payload().password)
        login_response = server.Response()
        result = await server.login(credentials, login_response, make_request('/api/auth/login'))
        assert result['mfa_setup_required'] and 'user' not in result
        setup_cookie = cookie(login_response)
        await blocked(setup_cookie)
        setup_request = request('/api/auth/2fa/setup', setup_cookie)
        user = await server.get_current_user(setup_request)
        await server.setup_two_factor(setup_request, user)
        user = await server.get_current_user(setup_request)
        secret = server.decrypt_totp_secret(user['totp_pending_secret_enc'])
        # Deterministically invalid without depending on the current TOTP value.
        bad = next(f'{n:06}' for n in range(100) if server.verify_totp_code(secret, f'{n:06}') is None)
        confirm_request = request('/api/auth/2fa/confirm', setup_cookie)
        with pytest.raises(server.HTTPException) as error:
            await server.confirm_two_factor(server.TwoFactorVerifyRequest(code=bad), confirm_request, server.Response(), user)
        assert error.value.status_code == 400
        await blocked(setup_cookie)
        confirmed = server.Response()
        result = await server.confirm_two_factor(server.TwoFactorVerifyRequest(code=server.totp_code(secret)),
                                                confirm_request, confirmed, user)
        assert result['enabled'] and result['user']['totp_enabled']
        full_cookie = cookie(confirmed)
        assert (await server.get_current_user(request('/api/dashboard/metrics', full_cookie, 'GET')))['user_id'] == registered['user_id']
        await server.logout(request('/api/auth/logout', full_cookie), server.Response())
        await blocked(full_cookie)
        pending_response = server.Response()
        result = await server.login(credentials, pending_response, make_request('/api/auth/login'))
        assert result['mfa_required'] and 'user' not in result
        pending_cookie = cookie(pending_response)
        await blocked(pending_cookie)
        verify_request = request('/api/auth/2fa/verify', pending_cookie)
        with pytest.raises(server.HTTPException) as error:
            await server.verify_two_factor(server.TwoFactorVerifyRequest(code=bad), server.Response(), verify_request)
        assert error.value.status_code == 401
        await blocked(pending_cookie)
        verified = server.Response()
        await server.verify_two_factor(server.TwoFactorVerifyRequest(code=server.totp_code(secret)), verified, verify_request)
        assert (await server.get_current_user(request('/api/dashboard/metrics', cookie(verified), 'GET')))['user_id'] == registered['user_id']
        await blocked(pending_cookie)
    asyncio.run(exercise())
