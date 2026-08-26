"""Regression checks for Guideline 1.2 block visibility across public surfaces."""
import ast
from pathlib import Path


SERVER = Path(__file__).parents[1] / "server.py"


def functions():
    tree = ast.parse(SERVER.read_text())
    return {
        node.name: ast.unparse(node)
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def test_rankings_keep_guest_access_but_filter_signed_in_block_relationships():
    source = functions()
    assert "get_optional_current_user" in source

    for endpoint in ("overall_leaderboard", "game_leaderboard", "weekly_leaderboard"):
        body = source[endpoint]
        assert "Depends(get_optional_current_user)" in body
        assert "blocked_user_ids" in body
        assert "$ne" in body

    assert "if not u:" in source["weekly_leaderboard"]


def test_blocked_accounts_cannot_join_direct_battles():
    body = functions()["join_battle"]
    assert "db.users.find_one" in body
    assert "blocked_user_ids" in body
    assert "status_code=403" in body


def test_block_immediately_ends_existing_direct_battle():
    body = functions()["block_user"]
    assert "_battle_rooms.items()" in body
    assert "_battle_rooms.pop" in body
