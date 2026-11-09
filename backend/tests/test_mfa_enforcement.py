import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deployment import InMemoryDatabase, make_request, server  # noqa: E402


def test_correct_password_returns_pending_email_verification_without_session(monkeypatch):
    fake_db = InMemoryDatabase()
    company = {"company_id": "company_email", "name": "Email tenant", "owner_user_id": "user_email", "status": "active"}
    user = {
        "user_id": "user_email",
        "company_id": company["company_id"],
        "email": "pending@example.com",
        "password_hash": server.hash_password("StrongPassword-123"),
        "role": "owner",
        "is_active": True,
        "email_verified": False,
        "email_verification_exempt": False,
        "totp_enabled": False,
    }
    fake_db.companies.documents.append(company)
    fake_db.users.documents.append(user)
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "EMAIL_VERIFICATION_REQUIRED", True)

    async def exercise():
        response = server.Response()
        result = await server.login(
            server.UserLogin(email=user["email"], password="StrongPassword-123"),
            response,
            make_request("/api/auth/login"),
        )
        assert result["status"] == "EMAIL_VERIFICATION_REQUIRED"
        assert result["email"] == user["email"]
        assert "set-cookie" not in response.headers

        try:
            await server.login(
                server.UserLogin(email=user["email"], password="WrongPassword-123"),
                server.Response(),
                make_request("/api/auth/login"),
            )
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("Invalid password was accepted")

    asyncio.run(exercise())


def test_customer_without_mfa_gets_setup_only_session_and_can_complete_enrollment(monkeypatch):
    fake_db = InMemoryDatabase()
    company = {
        "company_id": "company_mfa",
        "name": "MFA tenant",
        "owner_user_id": "user_mfa",
        "status": "active",
    }
    user = {
        "user_id": "user_mfa",
        "company_id": "company_mfa",
        "email": "mfa@example.com",
        "password_hash": server.hash_password("StrongPassword-123"),
        "role": "owner",
        "is_active": True,
        "email_verified": True,
        "totp_enabled": False,
    }
    fake_db.companies.documents.append(company)
    fake_db.users.documents.append(user)
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "TOTP_ENCRYPTION_KEY", "test-totp-encryption-key")

    async def exercise():
        login_response = server.Response()
        login_result = await server.login(
            server.UserLogin(email=user["email"], password="StrongPassword-123"),
            login_response,
            make_request("/api/auth/login"),
        )
        assert login_result["mfa_setup_required"] is True
        assert "user" not in login_result
        setup_cookie = login_response.headers["set-cookie"].split(";", 1)[0]

        with_setup_cookie = make_request(
            "/api/dashboard/metrics", method="GET", headers={"cookie": setup_cookie}
        )
        try:
            await server.get_current_user(with_setup_cookie)
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("MFA setup session reached a protected API")

        setup_request = make_request(
            "/api/auth/2fa/setup",
            headers={"cookie": setup_cookie, "origin": server.CORS_ORIGINS[0]},
        )
        current_user = await server.get_current_user(setup_request)
        setup_result = await server.setup_two_factor(
            setup_request,
            current_user,
        )
        assert setup_result["otpauth_uri"].startswith("otpauth://totp/")
        secret = server.decrypt_totp_secret(fake_db.users.documents[0]["totp_pending_secret_enc"])
        current_user = await server.get_current_user(setup_request)

        confirm_response = server.Response()
        confirm_request = make_request(
            "/api/auth/2fa/confirm",
            headers={"cookie": setup_cookie, "origin": server.CORS_ORIGINS[0]},
        )
        confirm_result = await server.confirm_two_factor(
            server.TwoFactorVerifyRequest(code=server.totp_code(secret)),
            confirm_request,
            confirm_response,
            current_user,
        )
        assert confirm_result["enabled"] is True
        assert len(confirm_result["recovery_codes"]) == 10
        assert "user" in confirm_result
        stored_codes = fake_db.users.documents[0]["totp_recovery_codes"]
        assert all(server.hash_recovery_code(code) in stored_codes for code in confirm_result["recovery_codes"])
        assert all(code not in stored_codes for code in confirm_result["recovery_codes"])

        full_cookie = confirm_response.headers["set-cookie"].split(";", 1)[0]
        authenticated = await server.get_current_user(
            make_request("/api/dashboard/metrics", method="GET", headers={"cookie": full_cookie})
        )
        assert authenticated["user_id"] == user["user_id"]
        assert authenticated["totp_enabled"] is True

        # The newly authenticated JWT cannot restart enrollment: only the
        # short-lived mfa_setup session has permission to invoke these endpoints.
        full_setup_request = make_request(
            "/api/auth/2fa/setup",
            headers={"cookie": full_cookie, "origin": server.CORS_ORIGINS[0]},
        )
        try:
            await server.setup_two_factor(full_setup_request, authenticated)
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("Authenticated session incorrectly allowed MFA setup")

    asyncio.run(exercise())


def test_platform_owner_api_rejects_session_without_completed_mfa(monkeypatch):
    fake_db = InMemoryDatabase()
    company = {"company_id": server.PLATFORM_COMPANY_ID, "name": "BESIDE", "status": "active"}
    admin = {
        "user_id": "platform_owner_test",
        "company_id": server.PLATFORM_COMPANY_ID,
        "email": "platform-owner@example.com",
        "role": "admin",
        "platform_role": "super_admin",
        "is_active": True,
        "email_verified": True,
        "totp_enabled": True,
    }
    fake_db.companies.documents.append(company)
    fake_db.users.documents.append(admin)
    monkeypatch.setattr(server, "db", fake_db)

    async def exercise():
        pending = await server.create_authenticated_session(admin, mfa_verified=False)
        try:
            await server.get_admin_user(make_request("/api/admin/stats", method="GET", headers={"authorization": f"Bearer {pending}"}))
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("Platform Owner API accepted a session without completed MFA")

        await fake_db.user_sessions.update_many({"token_hash": server.hash_token(pending)}, {"$set": {"revoked_at": server.datetime.now(server.timezone.utc).isoformat()}})
        verified = await server.create_authenticated_session(admin, mfa_verified=True)
        current = await server.get_admin_user(make_request("/api/admin/stats", method="GET", headers={"authorization": f"Bearer {verified}"}))
        assert current["platform_role"] == "super_admin"

    asyncio.run(exercise())
