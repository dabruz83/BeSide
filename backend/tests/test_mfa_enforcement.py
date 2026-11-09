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
        assert "recovery_codes" not in confirm_result
        assert "user" in confirm_result
        saved_user = fake_db.users.documents[0]
        assert "totp_recovery_codes" not in saved_user
        assert saved_user["totp_enabled"] is True
        assert saved_user["totp_secret_enc"]
        assert server.decrypt_totp_secret(saved_user["totp_secret_enc"]) == secret
        assert "totp_pending_secret_enc" not in saved_user
        assert "totp_pending_created_at" not in saved_user

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


def test_accountless_contact_invitation_and_recovery_email_approval(monkeypatch):
    """Invited contacts never need a Beside account, password or authenticator."""
    from datetime import datetime, timedelta, timezone
    from fastapi import BackgroundTasks

    fake_db = InMemoryDatabase()
    owner = {
        "user_id": "user_owner", "company_id": "company_owner",
        "role": "owner", "email": "owner@example.com",
        "password_hash": server.hash_password("OwnerPassword-123"),
        "is_active": True, "email_verified": True, "totp_enabled": True,
    }
    fake_db.users.documents.append(owner)
    fake_db.companies.documents.append({
        "company_id": "company_owner", "owner_user_id": "user_owner",
        "name": "Company", "status": "active",
    })
    monkeypatch.setattr(server, "db", fake_db)
    monkeypatch.setattr(server, "RECOVERY_CONTACT_SECURITY_DAYS", 2)
    invite_token = "invitation-token-test-0123456789abcdef"
    request_token = "request-token-test-0123456789abcdef"
    approval_token = "contact-email-approval-test-0123456789abcdef"
    monkeypatch.setattr(server.secrets, "token_urlsafe", lambda size: request_token)

    async def exercise():
        now = datetime.now(timezone.utc)
        fake_db.recovery_contacts.documents.append({
            "contact_id": "contact_test",
            "contact_email": "trusted@example.net",
            "user_id": owner["user_id"],
            "company_id": owner["company_id"],
            "status": "pending_invitation",
            "verification_method": "email_link",
            "contact_token_hash": server.hash_token(invite_token),
            "created_at": now.isoformat(),
            "expires_at_dt": now + timedelta(hours=1),
            "accepted_at": None,
        })
        accepted = await server.accept_recovery_contact_by_email(
            server.TokenRequest(token=invite_token),
            BackgroundTasks(),
            make_request("/api/auth/recovery-contact/accept-email"),
        )
        assert accepted["status"] == "security_period"
        record = fake_db.recovery_contacts.documents[0]
        assert record["accepted_at"]
        assert "contact_token_hash" not in record
        assert record.get("linked_user_id") is None
        assert len(fake_db.users.documents) == 1  # contact never registers

        try:
            await server.accept_recovery_contact_by_email(
                server.TokenRequest(token=invite_token),
                BackgroundTasks(),
                make_request("/api/auth/recovery-contact/accept-email"),
            )
        except server.HTTPException as exc:
            assert exc.status_code == 400
        else:
            raise AssertionError("Consumed invitation token was accepted twice")

        # Test server-side hold rejection before the waiting period elapses.
        try:
            await server.request_two_factor_recovery(
                server.TwoFactorRecoveryRequest(
                    email=owner["email"], password="OwnerPassword-123"),
                BackgroundTasks(), make_request("/api/auth/2fa/recovery/request"),
            )
        except server.HTTPException as exc:
            assert exc.status_code == 400
        else:
            raise AssertionError("Trusted contact was usable before security hold expired")

        record["security_period_ends_at"] = (now - timedelta(minutes=1)).isoformat()
        # Contingent recovery credentials: contact email token is sent only to
        # the contact and never returned in the owner's API response.
        generated = iter([request_token, approval_token])
        monkeypatch.setattr(server.secrets, "token_urlsafe", lambda size: next(generated))
        recovery = await server.request_two_factor_recovery(
            server.TwoFactorRecoveryRequest(
                email=owner["email"], password="OwnerPassword-123"),
            BackgroundTasks(), make_request("/api/auth/2fa/recovery/request"),
        )
        assert recovery["request_token"] == request_token
        assert "contact_approval_token" not in recovery
        challenge = recovery["verification_number"]
        assert len(challenge) == 8
        assert fake_db.mfa_recovery_requests.documents[0]["contact_approval_token_hash"] == server.hash_token(approval_token)

        bad_number = "12345678" if challenge != "12345678" else "87654321"
        try:
            await server.approve_two_factor_recovery_by_email(
                server.TwoFactorRecoveryEmailApprovalRequest(
                    approval_token=approval_token, verification_number=bad_number),
                BackgroundTasks(), make_request("/api/auth/2fa/recovery/approve-email"),
            )
        except server.HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("Bad owner challenge was accepted")

        approved = await server.approve_two_factor_recovery_by_email(
            server.TwoFactorRecoveryEmailApprovalRequest(
                approval_token=approval_token, verification_number=challenge),
            BackgroundTasks(), make_request("/api/auth/2fa/recovery/approve-email"),
        )
        assert approved["status"] == "approved"
        assert "contact_approval_token_hash" not in fake_db.mfa_recovery_requests.documents[0]
        assert fake_db.mfa_recovery_requests.documents[0]["status"] == "approved"
        assert len(fake_db.user_sessions.documents) == 0  # no login access
        try:
            await server.approve_two_factor_recovery_by_email(
                server.TwoFactorRecoveryEmailApprovalRequest(
                    approval_token=approval_token, verification_number=challenge),
                BackgroundTasks(), make_request("/api/auth/2fa/recovery/approve-email"),
            )
        except server.HTTPException as exc:
            assert exc.status_code in (400, 409)
        else:
            raise AssertionError("Single-use contact approval token was accepted twice")

    asyncio.run(exercise())


def test_password_reset_available_for_legacy_contact_without_company(monkeypatch):
    from fastapi import BackgroundTasks
    fake_db = InMemoryDatabase()
    fake_db.users.documents.append({
        "user_id": "legacy_contact", "company_id": None,
        "role": server.RECOVERY_CONTACT_ROLE, "email": "friend@example.net",
        "password_hash": server.hash_password("FriendPassword-123"),
        "is_active": True,
    })
    monkeypatch.setattr(server, "db", fake_db)
    async def exercise():
        tasks = BackgroundTasks()
        result = await server.forgot_password(
            server.EmailRequest(email="friend@example.net"),
            tasks,
            make_request("/api/auth/forgot-password"),
        )
        assert result["message"]
        assert len(fake_db.password_reset_tokens.documents) == 1
        assert any(t.func == server.send_password_reset_email for t in tasks.tasks)
    asyncio.run(exercise())
