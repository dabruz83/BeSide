"""Create private local settings once; never overwrite existing configuration."""
from pathlib import Path
import secrets
import os

ROOT = Path(__file__).resolve().parents[1]
local = ROOT / '.local'
local.mkdir(exist_ok=True)
def private_file(path, content):
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)

private_file(ROOT / 'backend/.env', f'''APP_ENV=local
EXTERNAL_SERVICES_ENABLED=false
MONGO_URL=mongodb://127.0.0.1:27018
DB_NAME=beside_demo
JWT_SECRET_KEY={secrets.token_urlsafe(48)}
ADMIN_EMAIL=admin@beside.example
ADMIN_PASSWORD={secrets.token_urlsafe(32)}
CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100
FRONTEND_PUBLIC_URL=http://localhost:3100
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
RATE_LIMITING_ENABLED=true
EMAIL_VERIFICATION_REQUIRED=false
LOCAL_OUTBOX_DIR={local / 'outbox'}
''')
private_file(ROOT / 'frontend/.env', 'REACT_APP_BACKEND_URL=\nBACKEND_PROXY_URL=http://127.0.0.1:8100\n')
private_file(local / 'demo.env', f'DEMO_EMAIL=demo@beside.example\nDEMO_PASSWORD={secrets.token_urlsafe(24)}A1!\n')
print('Local configuration ready; private values were not displayed.')
