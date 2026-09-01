"""Execute battle-join state transitions without MongoDB or live players."""
import ast
import asyncio
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code


def load_join(rooms, find_host):
    source = Path(__file__).parents[1] / "server.py"
    tree = ast.parse(source.read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
             and n.name in {"join_battle", "_public_room"}]
    for node in nodes:
        node.decorator_list = []
        if node.name == "join_battle":
            node.args.defaults = []
    broadcast = AsyncMock()
    scope = {
        "_battle_rooms": rooms,
        "db": SimpleNamespace(users=SimpleNamespace(find_one=find_host)),
        "HTTPException": HTTPError,
        "broadcast_battle_state": broadcast,
        "_public_player_name": lambda user, fallback: user.get("name", fallback),
    }
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
                 str(source), "exec"), scope)
    return scope["join_battle"], broadcast


def room(status="waiting", guest=None):
    return {
        "id": "ABC123", "host_id": "host", "host_name": "Host",
        "guest_id": guest, "guest_name": "Guest" if guest else None,
        "board": [[0] * 7 for _ in range(6)], "turn": "host", "winner": None,
        "win_cells": None, "moves": 0, "status": status, "created_at": "2026-09-01",
    }


@pytest.mark.parametrize("status", ["playing", "ended"])
def test_guest_rejoin_preserves_game_state(status):
    async def scenario():
        current = room(status, "guest")
        current.update(winner="host" if status == "ended" else None, moves=7)
        current["board"][5][0] = 1
        before = deepcopy(current)
        join, broadcast = load_join({"ABC123": current}, AsyncMock(return_value={"id": "host"}))
        result = await join("abc123", {"id": "guest", "name": "Changed Name"})
        assert current == before
        assert result["status"] == status
        broadcast.assert_not_awaited()
    asyncio.run(scenario())


@pytest.mark.parametrize("same_guest", [False, True])
def test_overlapping_joins_claim_guest_slot_once(same_guest):
    async def scenario():
        current = room()
        both_reading = asyncio.Event()
        calls = 0

        async def find_host(*_args):
            nonlocal calls
            calls += 1
            if calls == 2:
                both_reading.set()
            await asyncio.wait_for(both_reading.wait(), timeout=2)
            return {"id": "host"}

        join, broadcast = load_join({"ABC123": current}, find_host)
        ids = ["guest-a", "guest-a" if same_guest else "guest-b"]
        results = await asyncio.gather(*(join("ABC123", {"id": uid}) for uid in ids),
                                       return_exceptions=True)
        successes = [r for r in results if isinstance(r, dict)]
        failures = [r for r in results if isinstance(r, HTTPError)]
        assert len(successes) == (2 if same_guest else 1)
        assert len(failures) == (0 if same_guest else 1)
        assert all(r.status_code == 400 for r in failures)
        assert all(r["guest_id"] == current["guest_id"] for r in successes)
        assert current["status"] == "playing"
        broadcast.assert_awaited_once_with("ABC123")
    asyncio.run(scenario())


def test_removed_room_cannot_be_joined_after_host_lookup():
    async def scenario():
        current = room()
        rooms = {"ABC123": current}
        before = deepcopy(current)

        async def find_host(*_args):
            rooms.pop("ABC123")
            return {"id": "host"}

        join, broadcast = load_join(rooms, find_host)
        with pytest.raises(HTTPError) as error:
            await join("ABC123", {"id": "guest"})
        assert error.value.status_code == 404
        assert current == before
        broadcast.assert_not_awaited()
    asyncio.run(scenario())


@pytest.mark.parametrize("host_blocked,guest_blocked", [(True, False), (False, True)])
def test_rejoin_still_checks_both_block_directions(host_blocked, guest_blocked):
    async def scenario():
        current = room("playing", "guest")
        before = deepcopy(current)
        host = {"id": "host", "blocked_user_ids": ["guest"] if host_blocked else []}
        guest = {"id": "guest", "blocked_user_ids": ["host"] if guest_blocked else []}
        join, broadcast = load_join({"ABC123": current}, AsyncMock(return_value=host))
        with pytest.raises(HTTPError) as error:
            await join("ABC123", guest)
        assert error.value.status_code == 403
        assert current == before
        broadcast.assert_not_awaited()
    asyncio.run(scenario())


def test_new_guest_cannot_restart_ended_empty_room():
    async def scenario():
        current = room("ended")
        join, broadcast = load_join({"ABC123": current}, AsyncMock(return_value={"id": "host"}))
        with pytest.raises(HTTPError) as error:
            await join("ABC123", {"id": "guest"})
        assert error.value.status_code == 400
        assert current["guest_id"] is None
        assert current["status"] == "ended"
        broadcast.assert_not_awaited()
    asyncio.run(scenario())
