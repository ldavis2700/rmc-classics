"""RMC CLASSICS backend API tests — iteration 4.

Regression + New:
- games/meta now returns 13 games (adds gofish, oldmaid)
- /api/badges (no auth) returns 14 badge objs
- /games/submit returns newly_unlocked_badges + freeze_used
- Badges persisted; not duplicated in newly_unlocked_badges
- Streak freeze fields default
- WebSocket /api/ws/battle/{room_id}?token=<jwt>: 4401/4404/4403/state/move
"""
import os
import uuid
import json
import asyncio
import pytest
import requests
import websockets
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else "https://childhood-games-5.preview.emergentagent.com"
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN = {"email": "admin@rmc.com", "password": "admin123"}
ALL_GAMES = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno",
             "ludo", "scrabble", "dominoes", "gofish", "oldmaid"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, prefix="test"):
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@rmc.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": prefix})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="session")
def user_a(s):
    return _register(s, "usera")


@pytest.fixture(scope="session")
def user_b(s):
    return _register(s, "userb")


# ---------- Regression basics ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("app") == "RMC CLASSICS"


def test_login_admin(s):
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code == 401


def test_me_without_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- 13 games meta ----------
def test_games_meta_has_13(s):
    r = s.get(f"{API}/games/meta")
    assert r.status_code == 200
    g = r.json()["games"]
    assert set(g.keys()) == ALL_GAMES, f"Got {set(g.keys())}"
    for gid in ("gofish", "oldmaid"):
        assert "name" in g[gid] and "score_dir" in g[gid]


# ---------- Badges catalog ----------
def test_badges_no_auth_returns_14(s):
    r = s.get(f"{API}/badges")
    assert r.status_code == 200, r.text
    badges = r.json()["badges"]
    assert isinstance(badges, list)
    assert len(badges) == 14, f"expected 14 badges, got {len(badges)}"
    ids = {b["id"] for b in badges}
    required = {"first_win", "wins_5", "wins_25", "wins_100", "plays_10", "plays_50",
                "streak_3", "streak_7", "streak_30", "streak_100",
                "chess_win", "scrabble_win", "battle_win", "all_games"}
    assert ids == required
    for b in badges:
        for k in ("id", "name", "desc", "icon", "color"):
            assert k in b, f"missing {k} in {b}"


# ---------- New user default freezes ----------
def test_new_user_has_default_freeze_field(s):
    u = _register(s, "freeze")
    # public_user always includes freezes_available default 1
    assert u["user"].get("freezes_available") == 1


# ---------- Submit returns newly_unlocked_badges + freeze_used ----------
def test_submit_first_win_unlocks_first_win_badge(s):
    u = _register(s, "fresh")
    h = u["headers"]
    r = s.post(f"{API}/games/submit", headers=h, json={"game_id": "memory", "won": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "newly_unlocked_badges" in d
    assert "freeze_used" in d and d["freeze_used"] is False
    ids = [b["id"] for b in d["newly_unlocked_badges"]]
    assert "first_win" in ids

    # Second submit with win: first_win should NOT reappear
    r2 = s.post(f"{API}/games/submit", headers=h, json={"game_id": "memory", "won": True})
    d2 = r2.json()
    ids2 = [b["id"] for b in d2["newly_unlocked_badges"]]
    assert "first_win" not in ids2
    # Persisted
    assert "first_win" in d2["user"]["badges"]


def test_submit_chess_win_unlocks_chess_badge(s):
    u = _register(s, "chess")
    h = u["headers"]
    r = s.post(f"{API}/games/submit", headers=h, json={"game_id": "chess", "won": True})
    assert r.status_code == 200
    ids = [b["id"] for b in r.json()["newly_unlocked_badges"]]
    # first win of anything + chess_win both unlock together
    assert "chess_win" in ids
    assert "first_win" in ids


def test_submit_scrabble_win_unlocks_scrabble_badge(s):
    u = _register(s, "scrab")
    h = u["headers"]
    r = s.post(f"{API}/games/submit", headers=h, json={"game_id": "scrabble", "won": True, "score": 100})
    assert r.status_code == 200
    ids = [b["id"] for b in r.json()["newly_unlocked_badges"]]
    assert "scrabble_win" in ids


def test_submit_gofish_oldmaid_accepted(s, user_a):
    for gid in ("gofish", "oldmaid"):
        r = s.post(f"{API}/games/submit", headers=user_a["headers"],
                   json={"game_id": gid, "won": False})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["stats"][gid]["plays"] >= 1


# ---------- Streak freeze via simulated 2-day gap in DB ----------
def test_streak_freeze_consumed_on_2day_gap(s):
    """Set last_streak_date = day-before-yesterday manually, then complete challenge → freeze used."""
    from datetime import datetime, timezone, timedelta
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not available in test env")
    mc = MongoClient(mongo_url)
    dbh = mc[db_name]

    u = _register(s, "frz")
    uid = u["user"]["id"]
    h = u["headers"]
    ch = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    game_for = ch.get("game_id") or "chess"
    ctype = ch["type"]
    day_before = (datetime.now(timezone.utc).date() - timedelta(days=2)).strftime("%Y-%m-%d")

    # Force a prior streak=3 with last_streak_date=day_before, freeze available
    dbh.users.update_one({"id": uid}, {"$set": {
        "streak": 3,
        "streak_last_date": day_before,
        "freezes_available": 1,
    }})

    # Complete today's challenge
    payload = {"game_id": game_for, "won": ctype != "plays"}
    freeze_seen = False
    for _ in range(int(ch["goal"]) + 2):
        r = s.post(f"{API}/games/submit", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        if d.get("challenge_completed"):
            assert d["freeze_used"] is True, "freeze should be consumed on 2-day gap"
            assert d["user"]["streak"] == 4, "streak should increment despite gap"
            assert d["user"]["freezes_available"] == 0
            freeze_seen = True
            break
    assert freeze_seen, "challenge did not complete"


def test_streak_resets_when_no_freeze_and_gap(s):
    from datetime import datetime, timezone, timedelta
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not available in test env")
    mc = MongoClient(mongo_url)
    dbh = mc[db_name]

    u = _register(s, "nofrz")
    uid = u["user"]["id"]
    h = u["headers"]
    ch = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    game_for = ch.get("game_id") or "chess"
    ctype = ch["type"]
    old = (datetime.now(timezone.utc).date() - timedelta(days=5)).strftime("%Y-%m-%d")

    dbh.users.update_one({"id": uid}, {"$set": {
        "streak": 5,
        "streak_last_date": old,
        "freezes_available": 0,
        # ensure no auto-refill: last refill just now (< 7 days)
        "freezes_last_refill": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }})

    payload = {"game_id": game_for, "won": ctype != "plays"}
    for _ in range(int(ch["goal"]) + 2):
        r = s.post(f"{API}/games/submit", headers=h, json=payload)
        d = r.json()
        if d.get("challenge_completed"):
            assert d["freeze_used"] is False
            assert d["user"]["streak"] == 1  # reset
            return
    pytest.fail("challenge did not complete")


# ---------- WebSocket auth + basics ----------
@pytest.mark.asyncio
async def test_ws_missing_token_closes_4401():
    room_id = "AAAAAA"
    uri = f"{WS_BASE}/api/ws/battle/{room_id}"
    try:
        async with websockets.connect(uri) as ws:
            await ws.recv()
            pytest.fail("should have closed")
    except websockets.exceptions.InvalidStatus as e:
        # ingress may reject with HTTP status
        # 401 acceptable
        code = getattr(e.response, "status_code", None)
        assert code in (401, 403, 400), f"unexpected {code}"
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 4401


@pytest.mark.asyncio
async def test_ws_unknown_room_rejected(user_a):
    """Server closes before accept → handshake fails with HTTP 403 OR CloseCode 4404.
    Either way: unauthorized rooms cannot open a WS."""
    token = user_a["token"]
    uri = f"{WS_BASE}/api/ws/battle/DOESNOTEXIST?token={token}"
    try:
        async with websockets.connect(uri) as ws:
            await ws.recv()
            pytest.fail("should have closed")
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 4404, f"got {e.code}"
    except websockets.exceptions.InvalidStatus as e:
        assert e.response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_ws_non_player_rejected(s, user_a, user_b):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    outsider = _register(s, "outsider")
    uri = f"{WS_BASE}/api/ws/battle/{rid}?token={outsider['token']}"
    try:
        async with websockets.connect(uri) as ws:
            await ws.recv()
            pytest.fail("should have closed")
    except websockets.exceptions.ConnectionClosed as e:
        assert e.code == 4403, f"got {e.code}"
    except websockets.exceptions.InvalidStatus as e:
        assert e.response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_ws_host_receives_state_and_move_broadcast(s, user_a, user_b):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    # guest joins via REST
    s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])

    uri_host = f"{WS_BASE}/api/ws/battle/{rid}?token={user_a['token']}"
    uri_guest = f"{WS_BASE}/api/ws/battle/{rid}?token={user_b['token']}"

    async with websockets.connect(uri_host) as ws_h, websockets.connect(uri_guest) as ws_g:
        # initial state
        m1 = json.loads(await asyncio.wait_for(ws_h.recv(), timeout=5))
        m2 = json.loads(await asyncio.wait_for(ws_g.recv(), timeout=5))
        assert m1["type"] == "state" and m2["type"] == "state"
        assert m1["room"]["status"] == "playing"

        # Host sends move via WS
        await ws_h.send(json.dumps({"type": "move", "col": 0}))

        # Both should receive updated state
        upd_h = json.loads(await asyncio.wait_for(ws_h.recv(), timeout=5))
        upd_g = json.loads(await asyncio.wait_for(ws_g.recv(), timeout=5))
        assert upd_h["type"] == "state"
        assert upd_g["type"] == "state"
        # After host move at col 0, turn is guest
        assert upd_h["room"]["turn"] == "guest"
        assert upd_h["room"]["moves"] == 1


# ---------- REST battle regression (subset) ----------
def test_battle_create_shape(s, user_a):
    r = s.post(f"{API}/battle/create", headers=user_a["headers"])
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "waiting"
    assert d["turn"] == "host"
    assert len(d["board"]) == 6 and len(d["board"][0]) == 7


def test_battle_move_updates_state(s, user_a, user_b):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])
    r = s.post(f"{API}/battle/{rid}/move", headers=user_a["headers"], json={"col": 3})
    assert r.status_code == 200
    d = r.json()
    assert d["moves"] == 1
    assert d["turn"] == "guest"
