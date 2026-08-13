"""Regression tests for paid freeze-pack exact-once fulfillment.

These tests extract the small fulfillment function from server.py so CI can verify its
atomic MongoDB contract without connecting to MongoDB or RevenueCat.
"""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import List


SERVER = Path(__file__).parents[1] / "server.py"


class FakeUsers:
    def __init__(self):
        self.processed = set()
        self.freezes = 0
        self._lock = asyncio.Lock()

    async def update_one(self, query, update):
        transaction_id = query["processed_iap"]["$ne"]
        async with self._lock:
            if transaction_id in self.processed:
                return SimpleNamespace(modified_count=0)
            self.processed.add(transaction_id)
            self.freezes += update["$inc"]["freezes_available"]
            return SimpleNamespace(modified_count=1)


class FakeLogger:
    def info(self, *_args, **_kwargs):
        pass


def load_credit_function(users):
    tree = ast.parse(SERVER.read_text())
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name == "_credit_freeze_pack"
    )
    module = ast.Module(body=[function], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace = {
        "List": List,
        "db": SimpleNamespace(users=users),
        "logger": FakeLogger(),
        "FREEZE_PACK_5_QTY": 5,
    }
    exec(compile(module, str(SERVER), "exec"), namespace)
    return namespace["_credit_freeze_pack"]


def test_duplicate_transaction_is_credited_once():
    async def scenario():
        users = FakeUsers()
        credit = load_credit_function(users)

        first = await credit("user-1", ["tx-1", "tx-1"])
        retry = await credit("user-1", ["tx-1"])

        assert first == 1
        assert retry == 0
        assert users.freezes == 5
        assert users.processed == {"tx-1"}

    asyncio.run(scenario())


def test_concurrent_webhook_and_sync_credit_once():
    async def scenario():
        users = FakeUsers()
        credit = load_credit_function(users)

        results = await asyncio.gather(
            credit("user-1", ["tx-1"]),
            credit("user-1", ["tx-1"]),
        )

        assert sum(results) == 1
        assert users.freezes == 5
        assert users.processed == {"tx-1"}

    asyncio.run(scenario())
