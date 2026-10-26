"""Tests never inherit production settings or connect to non-loopback services."""
import os
import socket
import uuid
import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.update({
    'APP_ENV': 'test', 'EXTERNAL_SERVICES_ENABLED': 'false',
    'MONGO_URL': 'mongodb://127.0.0.1:27018', 'DB_NAME': 'beside_test_' + uuid.uuid4().hex,
    'JWT_SECRET_KEY': uuid.uuid4().hex + uuid.uuid4().hex,
    'ADMIN_EMAIL': 'admin@example.com', 'ADMIN_PASSWORD': uuid.uuid4().hex + 'A1!',
    'CORS_ORIGINS': 'http://localhost:3000', 'FRONTEND_PUBLIC_URL': 'http://localhost:3000',
    'COOKIE_SECURE': 'true', 'COOKIE_SAMESITE': 'lax', 'EMAIL_VERIFICATION_REQUIRED': 'false',
    'BACKEND_TEST_URL': '', 'SENDGRID_API_KEY': '', 'GEMINI_API_KEY': '',
    'OAUTH_SESSION_URL': '', 'STRIPE_SECRET_KEY': '', 'STRIPE_WEBHOOK_SECRET': '',
})

@pytest.fixture(autouse=True)
def block_external_network(monkeypatch):
    original = socket.socket.connect
    def connect(sock, address):
        if isinstance(address, tuple) and address[0] not in ('127.0.0.1', '::1', 'localhost'):
            raise AssertionError('External network is forbidden in tests')
        return original(sock, address)
    monkeypatch.setattr(socket.socket, 'connect', connect)
