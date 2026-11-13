"""Persistent online tables. Every mutation is a MongoDB compare-and-swap.

Hands are projected per authenticated seat; clients never receive the full state.
Polling works across workers and restarts without sticky sessions or paid services.
"""
from copy import deepcopy
import asyncio
from datetime import datetime, timezone, timedelta
import secrets
import time
from typing import Literal, Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from pymongo.errors import DuplicateKeyError

try:
    from .table_rules import new_game, apply_action, computer_action, player_view
except ImportError:
    from table_rules import new_game, apply_action, computer_action, player_view


class MatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game: Literal["dominoes", "spades"]
    visibility: Literal["public", "private"] = "public"


class TableMoveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: StrictInt = Field(ge=0)
    type: Literal["play", "draw", "pass", "bid", "next"]
    card: Optional[str] = Field(default=None, max_length=3)
    tile: Optional[str] = Field(default=None, max_length=3)
    side: Optional[Literal["left", "right"]] = None
    bid: Optional[StrictInt] = Field(default=None, ge=0, le=13)


class TableService:
    def __init__(self, db, public_name):
        self.db = db
        self.rooms = db.game_tables
        self.public_name = public_name

    async def indexes(self):
        await self.rooms.create_index("participant_ids", unique=True,
                                      partialFilterExpression={"active": True}, name="one_active_table_per_user")
        await self.rooms.create_index([("game", 1), ("visibility", 1), ("status", 1), ("created_at", 1)])
        await self.rooms.create_index("purge_at", expireAfterSeconds=0)

    async def expire(self):
        await self.rooms.update_many({"active": True, "expires_at": {"$lt": time.time()}},
                                    {"$set": {"active": False, "status": "expired"}, "$inc": {"version": 1}})

    async def allowed(self, room, user):
        ids = [uid for uid in room["participant_ids"] if uid != user["id"]]
        if set(ids) & set(user.get("blocked_user_ids", [])):
            return False
        for uid in ids:
            other = await self.db.users.find_one({"id": uid}, {"id": 1, "blocked_user_ids": 1, "disabled": 1})
            if not other or other.get("disabled") or user["id"] in other.get("blocked_user_ids", []):
                return False
        return True

    async def load(self, code, user, member=True):
        if not isinstance(code, str) or len(code) != 8 or not code.isalnum():
            raise HTTPException(404, "Table not found")
        room = await self.rooms.find_one({"_id": code.upper()})
        if not room:
            raise HTTPException(404, "Table not found")
        if member and user["id"] not in room["participant_ids"]:
            raise HTTPException(403, "You are not a player at this table")
        if room["expires_at"] < time.time() or room["status"] in ("cancelled", "expired"):
            raise HTTPException(410, "This table has closed. Start or join a new table.")
        if not await self.allowed(room, user):
            if user["id"] in room["participant_ids"]:
                await self.rooms.update_one({"_id": room["_id"], "version": room["version"], "active": True},
                                            {"$set": {"active": False, "status": "cancelled"}, "$inc": {"version": 1}})
            raise HTTPException(403, "This table is unavailable")
        return room

    def view(self, room, uid):
        seat = next(i for i, member in enumerate(room["members"]) if member and member["id"] == uid)
        return {"id": room["_id"], "game": room["game"], "visibility": room["visibility"],
                "status": room["status"], "version": room["version"], "seat": seat,
                "members": deepcopy(room["members"]), "capacity": room["capacity"],
                "deadline": room.get("deadline"), "expires_at": room["expires_at"],
                "state": player_view(room["state"], seat) if room.get("state") else None}

    async def save(self, old, updated):
        updated["version"] = old["version"] + 1
        result = await self.rooms.replace_one({"_id": old["_id"], "version": old["version"]}, updated)
        if result.modified_count != 1:
            raise HTTPException(409, "The table changed. Refresh and try again.")
        return updated

    def deadline(self, room):
        room["deadline"] = time.time() + 90
        room["expires_at"] = time.time() + 3600
        room["purge_at"] = datetime.now(timezone.utc) + timedelta(days=1)
        if room["state"]["phase"] == "ended":
            room["active"] = False
            room["status"] = "ended"
        elif room["state"]["phase"] == "round_end":
            room["deadline"] = None

    async def current(self, user):
        await self.expire()
        room = await self.rooms.find_one({"active": True, "participant_ids": user["id"]})
        if not room:
            return None
        if not await self.allowed(room, user):
            await self.rooms.update_one({"_id": room["_id"], "version": room["version"], "active": True},
                                        {"$set": {"active": False, "status": "cancelled"}, "$inc": {"version": 1}})
            return None
        return self.view(room, user["id"])

    async def match(self, body, user):
        # Serialize public queue decisions across workers so simultaneous arrivals
        # join the same waiting table instead of creating separate empty tables.
        token = secrets.token_hex(16)
        acquired = False
        for _ in range(60):
            try:
                await self.db.table_match_locks.update_one(
                    {"_id": body.game, "expires": {"$lt": time.time()}},
                    {"$set": {"token": token, "expires": time.time() + 30}}, upsert=True)
                acquired = True
                break
            except DuplicateKeyError:
                await asyncio.sleep(0.05)
        if not acquired:
            raise HTTPException(503, "Matchmaking is busy. Please try again.")
        try:
            return await self._match_locked(body, user)
        finally:
            await self.db.table_match_locks.delete_one({"_id": body.game, "token": token})

    async def _match_locked(self, body, user):
        existing = await self.current(user)
        if existing:
            return existing
        if body.visibility == "public":
            candidates = await self.rooms.find({"game": body.game, "status": "waiting", "active": True,
                                               "visibility": "public"}).sort("created_at", 1).limit(100).to_list(100)
            for room in candidates:
                if not await self.allowed(room, user):
                    continue
                try:
                    return await self.join(room["_id"], user)
                except HTTPException as exc:
                    if exc.status_code not in (403, 404, 409, 410):
                        raise
        capacity = 2 if body.game == "dominoes" else 4
        for _ in range(5):
            code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
            room = {"_id": code, "game": body.game, "visibility": body.visibility, "status": "waiting",
                    "active": True, "version": 0, "capacity": capacity, "participant_ids": [user["id"]],
                    "members": [{"id": user["id"], "name": self.public_name(user, "Player")}] + [None] * (capacity - 1),
                    "created_at": time.time(), "expires_at": time.time() + 900,
                    "purge_at": datetime.now(timezone.utc) + timedelta(days=1), "state": None}
            try:
                await self.rooms.insert_one(room)
                return self.view(room, user["id"])
            except DuplicateKeyError:
                existing = await self.current(user)
                if existing:
                    return existing
        raise HTTPException(503, "Could not open a table. Please try again.")

    async def join(self, code, user):
        room = await self.load(code, user, member=False)
        if user["id"] in room["participant_ids"]:
            return self.view(room, user["id"])
        if room["status"] != "waiting" or None not in room["members"]:
            raise HTTPException(409, "This table is full or already started")
        current = await self.current(user)
        if current:
            raise HTTPException(409, "Leave your current table before joining another")
        updated = deepcopy(room)
        seat = updated["members"].index(None)
        updated["members"][seat] = {"id": user["id"], "name": self.public_name(user, "Player")}
        updated["participant_ids"].append(user["id"])
        if None not in updated["members"]:
            updated["state"] = new_game(room["game"])
            updated["status"] = "playing"
            self.deadline(updated)
        try:
            await self.save(room, updated)
        except DuplicateKeyError:
            raise HTTPException(409, "You already joined a table. Return to the lobby to resume.")
        return self.view(updated, user["id"])

    async def get(self, code, user):
        room = await self.load(code, user)
        # The first reader after the turn deadline advances exactly one legal move.
        # CAS prevents concurrent pollers from making duplicate moves.
        if room["status"] == "playing" and room.get("deadline") and room["deadline"] < time.time():
            updated = deepcopy(room)
            state = updated["state"]
            updated["state"] = apply_action(state, state["turn"], computer_action(state, state["turn"]))
            self.deadline(updated)
            try:
                room = await self.save(room, updated)
            except HTTPException as exc:
                if exc.status_code != 409:
                    raise
                room = await self.load(code, user)
        return self.view(room, user["id"])

    async def move(self, code, body, user):
        room = await self.load(code, user)
        if room["status"] != "playing":
            raise HTTPException(409, "This table is not playing")
        if room["version"] != body.version:
            raise HTTPException(409, "The table changed. Your hand has been refreshed; choose your move again.")
        if room.get("deadline") and room["deadline"] < time.time():
            await self.get(code, user)
            raise HTTPException(409, "The turn timer elapsed. Your hand has been refreshed.")
        seat = next(i for i, member in enumerate(room["members"]) if member and member["id"] == user["id"])
        action = body.model_dump(exclude_none=True, exclude={"version"})
        updated = deepcopy(room)
        try:
            updated["state"] = apply_action(room["state"], seat, action)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        self.deadline(updated)
        await self.save(room, updated)
        return self.view(updated, user["id"])

    async def leave(self, code, user):
        room = await self.load(code, user)
        updated = deepcopy(room)
        if room["status"] == "waiting":
            updated["members"] = [None if m and m["id"] == user["id"] else m for m in room["members"]]
            updated["participant_ids"].remove(user["id"])
            if not updated["participant_ids"]:
                updated.update(active=False, status="cancelled")
        elif room["status"] == "playing":
            # Explicitly end the table instead of silently replacing a human with a bot.
            seat = next(i for i, m in enumerate(room["members"]) if m["id"] == user["id"])
            winner = 1 - seat if room["game"] == "dominoes" else 1 - (seat % 2)
            updated["state"].update(phase="ended", winner=winner, reason="A player left the table")
            updated.update(active=False, status="ended", deadline=None)
        await self.save(room, updated)
        return {"ok": True}


def mount_table_routes(api, db, get_current_user, public_name):
    service = TableService(db, public_name)

    @api.get("/tables/current")
    async def current(user=Depends(get_current_user)):
        return {"room": await service.current(user)}

    @api.post("/tables/match")
    async def match(body: MatchIn, user=Depends(get_current_user)):
        return await service.match(body, user)

    @api.post("/tables/{code}/join")
    async def join(code: str, user=Depends(get_current_user)):
        return await service.join(code.upper(), user)

    @api.get("/tables/{code}")
    async def get(code: str, user=Depends(get_current_user)):
        return await service.get(code.upper(), user)

    @api.post("/tables/{code}/move")
    async def move(code: str, body: TableMoveIn, user=Depends(get_current_user)):
        return await service.move(code.upper(), body, user)

    @api.post("/tables/{code}/leave")
    async def leave(code: str, user=Depends(get_current_user)):
        return await service.leave(code.upper(), user)

    return service
