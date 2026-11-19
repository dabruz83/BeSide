"""Focused regression checks for profile security additions."""

import ast
from pathlib import Path


SERVER = Path(__file__).resolve().parents[1] / "server.py"


def test_password_change_endpoint_is_rate_limited_and_mfa_aware():
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    endpoint = next(
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "change_password"
    )
    source = ast.get_source_segment(SERVER.read_text(encoding="utf-8"), endpoint) or ""
    assert '@api_router.post("/auth/password/change")' in SERVER.read_text(encoding="utf-8")
    assert "enforce_rate_limit" in source
    assert "_consume_current_totp" in source
    assert "hash_password" in source


def test_profile_photo_validation_is_server_side():
    source = SERVER.read_text(encoding="utf-8")
    assert 'update_data.picture' in source
    assert 'data:image/(?:png|jpe?g|webp)' in source
    assert 'Formato foto profilo non valido' in source
