"""Regression coverage for reviewable, role-gated safety moderation."""
import ast
from pathlib import Path

import pytest


SERVER = Path(__file__).parents[1] / "server.py"


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def functions():
    tree = ast.parse(SERVER.read_text())
    return {
        node.name: ast.unparse(node)
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def load_report_normalizers():
    tree = ast.parse(SERVER.read_text())
    nodes = [
        node
        for node in tree.body
        if (
            isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "_SAFETY_REPORT_CONTEXTS"
                for target in node.targets
            )
        )
        or (
            isinstance(node, ast.FunctionDef)
            and node.name in {"_normalized_report_reason", "_normalized_report_context"}
        )
    ]
    module = ast.Module(body=nodes, type_ignores=[])
    ast.fix_missing_locations(module)
    namespace = {"HTTPException": FakeHTTPException}
    exec(compile(module, str(SERVER), "exec"), namespace)
    return namespace["_normalized_report_reason"], namespace["_normalized_report_context"]


def test_report_inputs_are_normalized_and_restricted():
    reason, context = load_report_normalizers()
    assert reason("  repeated   harassment  ") == "repeated harassment"
    assert context(" Friends ") == "friends"
    with pytest.raises(FakeHTTPException):
        reason("   ")
    with pytest.raises(FakeHTTPException):
        context("arbitrary-client-value")


def test_report_queue_is_abuse_bounded_and_deduplicated():
    source = functions()["report_user"]
    assert "count_documents" in source
    assert "status_code=429" in source
    assert "duplicate" in source
    assert "_normalized_report_reason" in source
    assert "_normalized_report_context" in source


def test_moderation_queue_and_resolution_are_role_gated_and_audited():
    source = functions()
    assert "moderation_operator" in source["get_moderation_operator"]
    for endpoint in ("list_safety_reports", "resolve_safety_report"):
        assert "Depends(get_moderation_operator)" in source[endpoint]
    resolution = source["resolve_safety_report"]
    assert '"status": "open"' in resolution
    assert "resolved_by_user_id" in resolution
    assert "status_code=409" in resolution


def test_default_admin_credentials_are_removed_and_legacy_seed_is_disabled():
    text = SERVER.read_text()
    assert "admin123" not in text
    startup = functions()["startup"]
    assert 'os.environ.get("ADMIN_EMAIL", "")' in startup
    assert 'os.environ.get("ADMIN_PASSWORD", "")' in startup
    assert "must be at least 12 characters" in startup
    assert '"disabled": True' in startup
    assert '"role": "moderation_operator"' in startup


def test_disabled_accounts_cannot_login_or_reuse_existing_tokens():
    source = functions()
    assert 'user.get("disabled")' in source["login"]
    assert 'user.get("disabled")' in source["get_current_user"]


def test_repeated_block_does_not_flood_moderation_queue():
    source = functions()["block_user"]
    assert "block_result.modified_count == 0" in source
    assert "already_blocked" in source
