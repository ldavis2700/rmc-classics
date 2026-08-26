"""Regression coverage for durable, versioned Terms acceptance."""
import ast
from pathlib import Path


BACKEND = Path(__file__).parents[1] / "server.py"
ROOT = BACKEND.parents[1]
AUTH_CONTEXT = ROOT / "frontend" / "src" / "context" / "AuthContext.jsx"
LOGIN_PAGE = ROOT / "frontend" / "src" / "pages" / "Login.jsx"


def backend_tree():
    return ast.parse(BACKEND.read_text())


def backend_functions():
    return {
        node.name: ast.unparse(node)
        for node in backend_tree().body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def backend_classes():
    return {
        node.name: ast.unparse(node)
        for node in backend_tree().body
        if isinstance(node, ast.ClassDef)
    }


def test_terms_version_is_explicit_and_date_versioned():
    assignment = next(
        node
        for node in backend_tree().body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "TERMS_VERSION" for target in node.targets)
    )
    assert isinstance(assignment.value, ast.Constant)
    assert assignment.value.value == "2026-08-20"


def test_login_contract_requires_explicit_terms_acceptance():
    source = backend_classes()["LoginIn"]
    assert "accepted_terms: bool = False" in source


def test_login_authenticates_before_persisting_current_consent():
    source = backend_functions()["login"]
    assert "if not body.accepted_terms" in source
    assert "db.users.update_one" in source
    assert "'terms_accepted_at': accepted_at" in source
    assert "'terms_version': TERMS_VERSION" in source
    assert source.index("verify_password") < source.index("if not body.accepted_terms")
    assert source.index("if not body.accepted_terms") < source.index("db.users.update_one")
    assert source.index("db.users.update_one") < source.index("create_access_token")


def test_registration_and_public_contract_use_current_terms_version():
    functions = backend_functions()
    register = functions["register"]
    public_user = functions["public_user"]
    assert "'terms_version': TERMS_VERSION" in register
    assert "doc.get('terms_version') == TERMS_VERSION" in public_user
    assert "'terms_accepted'" in public_user
    assert "'terms_version'" in public_user


def test_old_sessions_fail_closed_until_terms_are_reaccepted():
    source = backend_functions()["get_current_user"]
    assert "user.get('role') != 'moderation_operator'" in source
    assert "not user.get('terms_accepted_at')" in source
    assert "user.get('terms_version') != TERMS_VERSION" in source
    assert "status_code=403" in source
    assert "Terms acceptance required" in source


def test_login_checkbox_is_sent_to_the_backend():
    auth = AUTH_CONTEXT.read_text()
    login = LOGIN_PAGE.read_text()
    assert "const login = async (email, password, acceptedTerms = false)" in auth
    assert "accepted_terms: acceptedTerms" in auth
    assert "login(email, password, acceptedTerms)" in login
    assert 'data-testid="login-terms-checkbox"' in login
    assert "disabled={busy || !acceptedTerms}" in login
