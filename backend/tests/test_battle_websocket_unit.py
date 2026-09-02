"""Exercise the actual WebSocket handler with no sockets, database or players."""
import ast
import asyncio
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

class Disconnected(Exception):
    pass


class Socket:
    def __init__(self, messages):
        self.messages = iter(messages)
        self.sent = []
        self.accept = AsyncMock()
        self.close = AsyncMock()

    async def receive_json(self):
        item = next(self.messages, Disconnected())
        if isinstance(item, Exception):
            raise item
        return item

    async def send_json(self, message):
        self.sent.append(deepcopy(message))


def load_handler(room):
    source = Path(__file__).parents[1] / 'server.py'
    tree = ast.parse(source.read_text())
    names = {'ws_battle', '_public_room', '_c4_drop', '_c4_win', '_c4_full'}
    nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in names]
    for node in nodes:
        node.decorator_list = []
        if node.name == 'ws_battle':
            node.args.defaults = []
    connections = {}
    broadcast = AsyncMock()
    award = AsyncMock()
    logger = Mock()
    scope = {'WebSocket': Socket, 'WebSocketDisconnect': Disconnected,
             '_battle_rooms': {'ABC123': room}, '_battle_connections': connections,
             'pyjwt': SimpleNamespace(decode=lambda *args, **kwargs: {'sub': 'host'}),
             'get_jwt_secret': lambda: 'test-only', 'JWT_ALGORITHM': 'HS256',
             'datetime': datetime, 'timezone': timezone, 'BATTLE_COLS': 7, 'BATTLE_ROWS': 6,
             'broadcast_battle_state': broadcast, '_award_battle_result': award, 'logger': logger}
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
                 str(source), 'exec'), scope)
    return scope['ws_battle'], connections, broadcast, award, logger


def playing_room():
    return {'id': 'ABC123', 'host_id': 'host', 'guest_id': 'guest',
            'host_name': 'Host', 'guest_name': 'Guest', 'status': 'playing',
            'board': [[0] * 7 for _ in range(6)], 'turn': 'host', 'moves': 0,
            'winner': None, 'win_cells': None, 'created_at': '2026-09-02'}


INVALID_MESSAGES = [None, [], 'move', 1, True, ValueError('invalid JSON'),
                    {'type': 'move'}, *[{'type': 'move', 'col': value}
                    for value in (None, True, False, 1.5, 2.0, '2', 'bad', [], {},
                                  float('inf'), float('nan'), -1, 7)]]


def check_invalid_message_preserves_board_and_keeps_connection_usable(message):
    async def scenario():
        room = playing_room()
        before = deepcopy(room)
        handler, connections, broadcast, award, logger = load_handler(room)
        socket = Socket([message, {'type': 'ping'}])
        await handler(socket, 'abc123', 'test-token')
        assert room == before
        assert len(socket.sent) == 3
        assert socket.sent[0]['type'] == 'state'
        assert socket.sent[1]['type'] == 'error'
        assert socket.sent[2] == {'type': 'pong'}
        socket.close.assert_not_awaited()
        broadcast.assert_not_awaited()
        award.assert_not_awaited()
        logger.warning.assert_not_called()
        assert not connections['ABC123']
    asyncio.run(scenario())


def check_valid_move_after_bad_input_is_applied_once():
    async def scenario():
        room = playing_room()
        handler, connections, broadcast, award, logger = load_handler(room)
        socket = Socket([{'type': 'move', 'col': 'bad'}, {'type': 'move', 'col': 2}])
        await handler(socket, 'ABC123', 'test-token')
        assert room['moves'] == 1 and room['turn'] == 'guest'
        assert room['board'][5][2] == 1
        assert sum(sum(row) for row in room['board']) == 1
        assert socket.sent[1] == {'type': 'error', 'detail': 'Invalid column'}
        broadcast.assert_awaited_once_with('ABC123')
        award.assert_not_awaited()
        logger.warning.assert_not_called()
        assert not connections['ABC123']
    asyncio.run(scenario())


class BattleWebSocketTests(unittest.TestCase):
    def test_invalid_messages_preserve_board_and_connection(self):
        for message in INVALID_MESSAGES:
            with self.subTest(message=message):
                check_invalid_message_preserves_board_and_keeps_connection_usable(message)

    def test_valid_move_after_bad_input_is_applied_once(self):
        check_valid_move_after_bad_input_is_applied_once()
