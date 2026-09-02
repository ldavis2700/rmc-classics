"""Exercise actual rematch handlers without live players or MongoDB."""
import ast
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code


def load_rematch(rooms, broadcast=None):
    source = Path(__file__).parents[1] / "server.py"
    tree = ast.parse(source.read_text())
    names = {"rematch_battle", "_public_room", "_empty_board"}
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
             and n.name in names]
    for node in nodes:
        node.decorator_list = []
        if node.name == "rematch_battle":
            node.args.defaults = []
    broadcast = broadcast if broadcast is not None else AsyncMock()
    new_id = Mock(return_value=SimpleNamespace(hex="def456000000"))
    scope = {"_battle_rooms": rooms, "HTTPException": HTTPError,
             "broadcast_battle_state": broadcast, "uuid": SimpleNamespace(uuid4=new_id),
             "datetime": datetime, "timezone": timezone, "BATTLE_COLS": 7, "BATTLE_ROWS": 6}
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
                 str(source), "exec"), scope)
    return scope["rematch_battle"], broadcast, new_id


def ended_room(winner="host"):
    return {"id": "ABC123", "host_id": "host", "host_name": "Host",
            "guest_id": "guest", "guest_name": "Guest", "status": "ended",
            "winner": winner, "board": [[1] * 7 for _ in range(6)], "moves": 12,
            "turn": "guest", "win_cells": [[5, 0]], "created_at": "2026-09-01"}


@pytest.mark.parametrize("winner,expected_host", [("host", "host"), ("guest", "guest"), ("draw", "host")])
def test_rematch_preserves_roles_and_starts_with_fresh_state(winner, expected_host):
    async def scenario():
        old = ended_room(winner)
        before = deepcopy(old)
        rooms = {"ABC123": old}
        rematch, broadcast, new_id = load_rematch(rooms)
        result = await rematch("abc123", {"id": "guest"})
        assert result["host_id"] == expected_host
        assert result["host_name"] == expected_host.title()
        assert result["guest_id"] == ("host" if expected_host == "guest" else "guest")
        assert result["status"] == "playing"
        assert result["turn"] == "host"
        assert result["moves"] == 0 and result["winner"] is None
        assert result["win_cells"] is None
        assert result["board"] == [[0] * 7 for _ in range(6)]
        result["board"][0][0] = 2
        assert result["board"][1][0] == 0
        assert old == {**before, "rematch_id": "DEF456"}
        broadcast.assert_awaited_once_with("ABC123")
        new_id.assert_called_once()
    asyncio.run(scenario())


def test_simultaneous_player_requests_and_retry_share_one_rematch():
    async def scenario():
        rooms = {"ABC123": ended_room()}
        broadcasting = asyncio.Event()
        release = asyncio.Event()

        async def pause_broadcast(_room_id):
            broadcasting.set()
            await asyncio.wait_for(release.wait(), 2)

        broadcast = AsyncMock(side_effect=pause_broadcast)
        rematch, _, new_id = load_rematch(rooms, broadcast)
        first = asyncio.create_task(rematch("ABC123", {"id": "host"}))
        try:
            await asyncio.wait_for(broadcasting.wait(), 2)
            second = await rematch("ABC123", {"id": "guest"})
        finally:
            release.set()
        result = await first
        retry = await rematch("ABC123", {"id": "host"})
        assert result == second == retry
        assert set(rooms) == {"ABC123", "DEF456"}
        assert rooms["ABC123"]["rematch_id"] == result["id"]
        broadcast.assert_awaited_once()
        new_id.assert_called_once()
    asyncio.run(scenario())


@pytest.mark.parametrize("case,expected", [("missing", 404), ("playing", 400), ("outsider", 403)])
def test_invalid_rematch_request_cannot_mutate_rooms(case, expected):
    async def scenario():
        rooms = {} if case == "missing" else {"ABC123": ended_room()}
        if case == "playing":
            rooms["ABC123"]["status"] = "playing"
        before = deepcopy(rooms)
        rematch, broadcast, new_id = load_rematch(rooms)
        with pytest.raises(HTTPError) as error:
            await rematch("ABC123", {"id": "outsider" if case == "outsider" else "host"})
        assert error.value.status_code == expected
        assert rooms == before
        broadcast.assert_not_awaited()
        new_id.assert_not_called()
    asyncio.run(scenario())
