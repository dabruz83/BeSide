"""Initialize the platform administrator TOTP locally and only once.

This command is intentionally not exposed by FastAPI. It requires APP_ENV=local,
writes the otpauth URI only to a temporary 0600 file, verifies an operator-entered
code, stores only the encrypted secret, and removes the temporary file.
"""

import asyncio
import getpass
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


def _write_private_setup_file(uri: str) -> Path:
    path = server.ROOT_DIR.parent / ".local" / "admin-totp-setup.txt"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(uri)
        stream.write("\n")
    return path


async def initialize_admin_totp() -> str:
    if server.APP_ENV != "local":
        raise RuntimeError("TOTP admin inizializzabile solo con APP_ENV=local")

    email = server.normalize_email(server.ADMIN_EMAIL)
    admin = await server.db.users.find_one(
        {"email": email, "platform_role": "super_admin", "is_active": {"$ne": False}},
        {"_id": 0},
    )
    if not admin:
        raise RuntimeError("Account super_admin locale non trovato")
    if admin.get("totp_enabled"):
        return "admin-totp-exists"

    secret = server.generate_totp_secret()
    label = f"{server.TOTP_ISSUER}:{email}"
    uri = (
        f"otpauth://totp/{label}?secret={secret}&issuer={server.TOTP_ISSUER}"
        f"&algorithm=SHA1&digits=6&period={server.TOTP_STEP_SECONDS}"
    )
    setup_file = _write_private_setup_file(uri)
    try:
        print(f"Apri localmente questo file (permessi 0600) e scansionalo: {setup_file}")
        code = getpass.getpass("Codice TOTP visualizzato dall'Authenticator: ")
        if server.verify_totp_code(secret, code) is None:
            raise RuntimeError("Codice TOTP non valido; nessuna modifica applicata")

        now = datetime.now(timezone.utc).isoformat()
        recovery_codes = server.generate_recovery_codes()
        updated = await server.db.users.update_one(
            {"user_id": admin["user_id"], "platform_role": "super_admin", "totp_enabled": {"$ne": True}},
            {"$set": {
                "totp_secret_enc": server.encrypt_totp_secret(secret),
                "totp_enabled": True,
                "totp_enabled_at": now,
                "totp_recovery_codes": [server.hash_recovery_code(code) for code in recovery_codes],
                "updated_at": now,
            }, "$unset": {"totp_pending_secret_enc": "", "totp_pending_created_at": ""}},
        )
        if updated.modified_count != 1:
            raise RuntimeError("Account modificato durante l'inizializzazione; riprova")
        await server.db.user_sessions.update_many(
            {"user_id": admin["user_id"], "revoked_at": None},
            {"$set": {"revoked_at": now}},
        )
        return "admin-totp-initialized"
    finally:
        try:
            setup_file.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    try:
        print(asyncio.run(initialize_admin_totp()))
    finally:
        server.client.close()
