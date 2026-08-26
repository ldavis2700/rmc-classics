"""Regression coverage for secure, privacy-preserving account deletion."""
import ast
import hashlib
import hmac
from pathlib import Path


BACKEND = Path(__file__).parents[1] / "server.py"
ROOT = BACKEND.parents[1]
ACCOUNT_SETTINGS = ROOT / "frontend" / "src" / "pages" / "AccountSettings.jsx"
AUTH_CONTEXT = ROOT / "frontend" / "src" / "context" / "AuthContext.jsx"
LEGAL = ROOT / "frontend" / "src" / "pages" / "Legal.jsx"


def backend_functions():
    tree = ast.parse(BACKEND.read_text())
    return {
        node.name: ast.unparse(node)
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def load_deleted_account_ref():
    tree = ast.parse(BACKEND.read_text())
    node = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_deleted_account_ref"
    )
    module = ast.Module(body=[node], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace = {
        "get_jwt_secret": lambda: "test-only-secret",
        "hashlib": hashlib,
        "hmac": hmac,
    }
    exec(compile(module, str(BACKEND), "exec"), namespace)
    return namespace["_deleted_account_ref"]


def test_deleted_account_reference_is_stable_unique_and_non_identifying():
    ref = load_deleted_account_ref()
    first = ref("account-one")
    assert first == ref("account-one")
    assert first != ref("account-two")
    assert first.startswith("deleted:")
    assert "account-one" not in first


def test_deletion_reauthenticates_before_irreversible_work():
    source = backend_functions()["delete_account"]
    assert "verify_password(body.password, user['password_hash'])" in source
    assert "status_code=401" in source
    assert source.index("verify_password") < source.index("delete_many")


def test_deletion_preserves_only_pseudonymous_integrity_evidence():
    source = backend_functions()["delete_account"]
    assert "_deleted_account_ref" in source
    assert "db.iap_events.update_many" in source
    assert "db.safety_reports.update_many" in source
    assert "account_deleted" in source
    assert "reporter_user_deleted" in source
    assert "reported_user_deleted" in source
    assert "db.safety_reports.delete_many" not in source
    assert "db.game_events.delete_many" in source
    assert "db.users.delete_one" in source


def test_frontend_requires_and_sends_current_password():
    settings = ACCOUNT_SETTINGS.read_text()
    auth = AUTH_CONTEXT.read_text()
    assert 'data-testid="delete-account-password-input"' in settings
    assert 'autoComplete="current-password"' in settings
    assert "deleteAccount(currentPassword)" in settings
    assert 'api.delete("/auth/account", { data: { password } })' in auth


def test_customer_disclosure_matches_retained_evidence_policy():
    legal = LEGAL.read_text()
    assert "non-identifying reference" in legal
    assert "purchase integrity" in legal
    assert "It is no longer linked to an active profile or email" in legal
