"""Regression coverage for public player-name filtering without importing the app."""
import ast
from pathlib import Path
import re
import unicodedata

import pytest


SERVER = Path(__file__).parents[1] / "server.py"


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def load_validator():
    tree = ast.parse(SERVER.read_text())
    nodes = [
        node for node in tree.body
        if (
            isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "_BLOCKED_PLAYER_NAME_TERMS"
                for target in node.targets
            )
        )
        or (
            isinstance(node, ast.FunctionDef)
            and node.name == "_validated_player_name"
        )
    ]
    module = ast.Module(body=nodes, type_ignores=[])
    ast.fix_missing_locations(module)
    namespace = {
        "HTTPException": FakeHTTPException,
        "re": re,
        "unicodedata": unicodedata,
    }
    exec(compile(module, str(SERVER), "exec"), namespace)
    return namespace["_validated_player_name"]


def test_normalizes_safe_player_name():
    validate = load_validator()
    assert validate("  Classic   Player  ") == "Classic Player"
    assert validate("ScunthorpeFan") == "ScunthorpeFan"


@pytest.mark.parametrize("name", [
    "f.u.c.k",
    "nazi",
    "player@example.com",
    "https://example.com",
    "+1 (555) 867-5309",
    "\u0000hidden",
])
def test_rejects_unsafe_public_player_name(name):
    validate = load_validator()
    with pytest.raises(FakeHTTPException) as exc:
        validate(name)
    assert exc.value.status_code == 400


def test_registration_persists_only_validated_name():
    tree = ast.parse(SERVER.read_text())
    register = next(
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "register"
    )
    assert any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_validated_player_name"
        for node in ast.walk(register)
    )
