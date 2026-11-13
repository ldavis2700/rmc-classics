"""Authenticated HTTP/table integration tests against isolated MongoDB state.

Set RMC_TEST_MONGO_URL to run against a disposable real MongoDB database; otherwise
mongomock-motor is sufficient for ordinary turn/privacy checks.
"""
import asyncio
from copy import deepcopy
import os
from pathlib import Path
import sys
import time
import uuid

from fastapi import APIRouter, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_tables import TableService, MatchIn, TableMoveIn, mount_table_routes
from table_rules import legal_actions, computer_action


async def database():
    if os.environ.get("RMC_TEST_MONGO_URL"):
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ["RMC_TEST_MONGO_URL"])
    else:
        from mongomock_motor import AsyncMongoMockClient
        client = AsyncMongoMockClient()
    db = client[f"rmc_test_{uuid.uuid4().hex}"]
    users = [{"id": f"test-{i}", "name": f"Player {i}", "blocked_user_ids": []} for i in range(8)]
    await db.users.insert_many(deepcopy(users))
    service = TableService(db, lambda u, fallback: u.get("name", fallback))
    await service.indexes()
    return client, db, users, service


@pytest.mark.parametrize("game,capacity", [("dominoes", 2), ("spades", 4)])
def test_matchmaking_private_hands_turns_reconnect_and_stale_writes(game, capacity):
    async def run():
        client, db, users, service = await database()
        try:
            rooms = [await service.match(MatchIn(game=game), user) for user in users[:capacity]]
            assert len({r["id"] for r in rooms}) == 1
            code = rooms[0]["id"]
            views = [await service.get(code, u) for u in users[:capacity]]
            assert all(r["status"] == "playing" for r in views)
            assert all("hands" not in r["state"] and "stock" not in r["state"] for r in views)
            assert all(set(a["state"]["hand"]).isdisjoint(b["state"]["hand"]) for i, a in enumerate(views) for b in views[i+1:])
            outsider = users[capacity]
            with pytest.raises(HTTPException) as exc:
                await service.get(code, outsider)
            assert exc.value.status_code == 403
            before = await db.game_tables.find_one({"_id": code})
            actor = before["state"]["turn"]
            action = computer_action(before["state"], actor)
            request = TableMoveIn(version=before["version"], **action)
            with pytest.raises(HTTPException):
                await service.move(code, request, users[(actor + 1) % capacity])
            result = await service.move(code, request, users[actor])
            with pytest.raises(HTTPException) as exc:
                await service.move(code, request, users[actor])
            assert exc.value.status_code == 409
            restored_service = TableService(db, lambda u, f: u.get("name", f))
            assert await restored_service.join(code, users[actor]) == result
            await service.leave(code, users[actor])
            finished = await service.get(code, users[(actor + 1) % capacity])
            assert finished["status"] == "ended"
            assert finished["state"]["phase"] == "ended"
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(run())


def test_simultaneous_arrivals_share_table_and_same_user_cannot_double_join():
    async def run():
        client, db, users, service = await database()
        try:
            results = await asyncio.gather(*(service.match(MatchIn(game="spades"), u) for u in users[:4]))
            assert len({r["id"] for r in results}) == 1
            repeated = await asyncio.gather(*(service.match(MatchIn(game="spades"), users[0]) for _ in range(4)))
            assert len({r["id"] for r in repeated}) == 1
            assert await db.game_tables.count_documents({"active": True, "participant_ids": users[0]["id"]}) == 1
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(run())


def test_private_tables_not_matched_blocking_and_expiry():
    async def run():
        client, db, users, service = await database()
        try:
            private = await service.match(MatchIn(game="dominoes", visibility="private"), users[0])
            public = await service.match(MatchIn(game="dominoes"), users[1])
            assert private["id"] != public["id"]
            await service.leave(public["id"], users[1])
            await db.users.update_one({"id": users[0]["id"]}, {"$set": {"blocked_user_ids": [users[1]["id"]]}})
            with pytest.raises(HTTPException) as exc:
                await service.join(private["id"], users[1])
            assert exc.value.status_code == 403
            assert (await db.game_tables.find_one({"_id": private["id"]}))["status"] == "waiting"
            await db.game_tables.update_one({"_id": private["id"]}, {"$set": {"expires_at": time.time() - 1}})
            fresh = await service.match(MatchIn(game="dominoes"), users[0])
            assert fresh["id"] != private["id"]
            assert (await db.game_tables.find_one({"_id": private["id"]}))["active"] is False
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(run())


def test_timeout_race_commits_exactly_one_move():
    async def run():
        client, db, users, service = await database()
        try:
            room = await service.match(MatchIn(game="spades"), users[0])
            for user in users[1:4]:
                await service.join(room["id"], user)
            await db.game_tables.update_one({"_id": room["id"]}, {"$set": {"deadline": time.time() - 1}})
            before = await db.game_tables.find_one({"_id": room["id"]})
            await asyncio.gather(*(service.get(room["id"], u) for u in users[:4]))
            after = await db.game_tables.find_one({"_id": room["id"]})
            assert after["version"] == before["version"] + 1
            assert sum(b is not None for b in after["state"]["bids"]) == 1
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(run())


def test_http_auth_validation_and_hidden_hands():
    from mongomock_motor import AsyncMongoMockClient
    db = AsyncMongoMockClient().test
    async def auth(x_test_user: str = Header(default=None)):
        if x_test_user not in ("one", "two"):
            raise HTTPException(401, "Sign in")
        return {"id": x_test_user, "name": x_test_user}
    app = FastAPI()
    router = APIRouter(prefix="/api")
    service = mount_table_routes(router, db, auth, lambda u, f: u["name"])
    app.include_router(router)
    async def seed():
        await service.indexes()
        await db.users.insert_many([{"id": "one"}, {"id": "two"}])
    asyncio.run(seed())
    with TestClient(app) as client:
        assert client.post("/api/tables/match", json={"game": "dominoes"}).status_code == 401
        headers = {"X-Test-User": "one"}
        assert client.post("/api/tables/match", headers=headers, json={"game": "cheat"}).status_code == 422
        room = client.post("/api/tables/match", headers=headers, json={"game": "dominoes"}).json()
        assert client.get("/api/tables/current", headers=headers).json()["room"]["id"] == room["id"]
        joined = client.post(f'/api/tables/{room["id"]}/join', headers={"X-Test-User": "two"}).json()
        assert "hands" not in joined["state"] and "stock" not in joined["state"]
        assert client.post(f'/api/tables/{room["id"]}/move', headers=headers,
                           json={"type": "bid", "bid": True, "version": 1}).status_code == 422
        assert client.post(f'/api/tables/{room["id"]}/move', headers=headers,
                           json={"type": "play", "version": 1, "hands": []}).status_code == 422
