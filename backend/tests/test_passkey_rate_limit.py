"""Regression checks for Passkey rate-limit calls.

These checks intentionally inspect the endpoint call sites without importing the
application or touching a database/WebAuthn credential.  They protect the
keyword-only contract of ``enforce_rate_limit`` that caused the production 500.
"""

import ast
from pathlib import Path


SERVER_PATH = Path(__file__).resolve().parents[1] / "server.py"
ENDPOINTS = {
    "passkey_registration_options",
    "passkey_registration_verify",
    "passkey_authentication_options",
    "passkey_authentication_verify",
}


def test_all_passkey_endpoints_use_keyword_only_rate_limit_arguments():
    tree = ast.parse(SERVER_PATH.read_text(encoding="utf-8"))
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in ENDPOINTS
    }
    assert set(functions) == ENDPOINTS

    for name, function in functions.items():
        calls = [
            node
            for node in ast.walk(function)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "enforce_rate_limit"
        ]
        assert len(calls) == 1, f"expected one rate-limit call in {name}"
        call = calls[0]
        assert not any(
            isinstance(argument, (ast.Constant, ast.Name, ast.BinOp))
            for argument in call.args[2:]
        ), f"limit/window must not be positional in {name}"
        keywords = {keyword.arg for keyword in call.keywords}
        assert {"limit", "window_seconds"} <= keywords

