"""RMC CLASSICS iteration 5 backend tests.

New features:
- Themes catalog + selection (unlock via XP)
- Weekly leaderboard (Monday UTC start)
- Friends CRUD + online status
- Battle rematch (with host/guest swap when guest won)
"""
import os
import uuid
import json
import asyncio
import pytest
import requests
import websockets
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN = {"email": "admin@rmc.com", "password": "admin123"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, prefix="i5"):
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@rmc.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": prefix})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def ua(s):
    return _register(s, "ua")


@pytest.fixture(scope="module")
def ub(s):
    return _register(s, "ub")


# ---------- Themes ----------
def test_themes_list(s):
    r = s.get(f"{API}/themes")
    assert r.status_code == 200
    themes = r.json()["themes"]
    ids = [t["id"] for t in themes]
    assert ids == ["neon", "gameboy", "crt", "arcade"]
    xps = {t["id"]: t["unlock_xp"] for t in themes}
    assert xps == {"neon": 0, "gameboy": 250, "crt": 750, "arcade": 1500}
    for t in themes:
        assert "primary" in t and "accent" in t and "name" in t


def test_public_user_has_theme_and_unlocked(s, ua):
    u = ua["user"]
    assert u.get("theme") == "neon"
    assert "unlocked_themes" in u
    assert "neon" in u["unlocked_themes"]
    # New user (xp 0) should only have neon
    assert u["unlocked_themes"] == ["neon"]


def test_theme_select_unknown(s, ua):
    r = s.post(f"{API}/themes/select", headers=ua["headers"], json={"theme_id": "bogus"})
    assert r.status_code == 400


def test_theme_select_locked_returns_403(s, ua):
    # ua has 0 xp → gameboy (250) locked
    r = s.post(f"{API}/themes/select", headers=ua["headers"], json={"theme_id": "gameboy"})
    assert r.status_code == 403


def test_theme_select_unlocked_ok(s, ua):
    r = s.post(f"{API}/themes/select", headers=ua["headers"], json={"theme_id": "neon"})
    assert r.status_code == 200
    d = r.json()
    assert d["user"]["theme"] == "neon"


def test_theme_unlocks_grow_with_xp(s):
    # Bump xp directly in DB
    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    dbh = mc[os.environ["DB_NAME"]]
    u = _register(s, "xprich")
    dbh.users.update_one({"id": u["user"]["id"]}, {"$set": {"xp": 800}})
    r = s.get(f"{API}/auth/me", headers=u["headers"])
    assert r.status_code == 200
    ut = r.json()["user"]
    assert set(ut["unlocked_themes"]) >= {"neon", "gameboy", "crt"}
    assert "arcade" not in ut["unlocked_themes"]
    # Selecting crt now allowed
    r2 = s.post(f"{API}/themes/select", headers=u["headers"], json={"theme_id": "crt"})
    assert r2.status_code == 200
    assert r2.json()["user"]["theme"] == "crt"


# ---------- Weekly leaderboard ----------
def test_weekly_leaderboard_shape(s, ua):
    # Play a game so an event exists this week
    s.post(f"{API}/games/submit", headers=ua["headers"], json={"game_id": "chess", "won": True})
    r = s.get(f"{API}/games/leaderboard-week")
    assert r.status_code == 200
    d = r.json()
    assert d["window"] == "week"
    assert "since" in d and isinstance(d["since"], str)
    # since should parse as datetime and be at a Monday (weekday == 0)
    since_dt = datetime.fromisoformat(d["since"])
    assert since_dt.weekday() == 0, f"since={d['since']} weekday={since_dt.weekday()}"
    assert isinstance(d["rows"], list)
    if d["rows"]:
        row = d["rows"][0]
        assert set(row.keys()) >= {"user_id", "name", "plays", "wins"}


def test_weekly_leaderboard_game_filter(s, ua):
    s.post(f"{API}/games/submit", headers=ua["headers"], json={"game_id": "chess", "won": True})
    r = s.get(f"{API}/games/leaderboard-week?game_id=chess")
    assert r.status_code == 200
    assert r.json()["window"] == "week"


def test_weekly_leaderboard_unknown_game_400(s):
    r = s.get(f"{API}/games/leaderboard-week?game_id=bogus")
    assert r.status_code == 400


# ---------- Friends ----------
def test_friend_self_add_400(s, ua):
    r = s.post(f"{API}/friends/add", headers=ua["headers"], json={"email": ua["email"]})
    assert r.status_code == 400


def test_friend_unknown_email_404(s, ua):
    r = s.post(f"{API}/friends/add", headers=ua["headers"],
               json={"email": f"nobody_{uuid.uuid4().hex[:6]}@rmc.com"})
    assert r.status_code == 404


def test_friends_add_list_mutual_online(s, ua, ub):
    # ua adds ub
    r = s.post(f"{API}/friends/add", headers=ua["headers"], json={"email": ub["email"]})
    assert r.status_code == 200, r.text
    # Both should see each other via /friends
    la = s.get(f"{API}/friends", headers=ua["headers"]).json()["friends"]
    lb = s.get(f"{API}/friends", headers=ub["headers"]).json()["friends"]
    assert any(f["id"] == ub["user"]["id"] for f in la), la
    assert any(f["id"] == ua["user"]["id"] for f in lb), lb
    # /auth/me refreshes last_seen — ub should now appear online in ua's list
    s.get(f"{API}/auth/me", headers=ub["headers"])
    la2 = s.get(f"{API}/friends", headers=ua["headers"]).json()["friends"]
    ub_row = next(f for f in la2 if f["id"] == ub["user"]["id"])
    assert ub_row["online"] is True


def test_friend_remove(s):
    a = _register(s, "fra")
    b = _register(s, "frb")
    s.post(f"{API}/friends/add", headers=a["headers"], json={"email": b["email"]})
    r = s.delete(f"{API}/friends/{b['user']['id']}", headers=a["headers"])
    assert r.status_code == 200
    la = s.get(f"{API}/friends", headers=a["headers"]).json()["friends"]
    lb = s.get(f"{API}/friends", headers=b["headers"]).json()["friends"]
    assert not any(f["id"] == b["user"]["id"] for f in la)
    # Mutual removal
    assert not any(f["id"] == a["user"]["id"] for f in lb)


# ---------- Rematch ----------
def _play_battle_to_end(s, host, guest, host_wins=True):
    """Create a battle, join, and play until someone wins.
    If host_wins: host builds vertical 4 in col 0, guest scatters cols 1..3.
    If guest wins: guest builds vertical 4 in col 0, host scatters cols 1..3.
    """
    room = s.post(f"{API}/battle/create", headers=host["headers"]).json()
    rid = room["id"]
    s.post(f"{API}/battle/{rid}/join", headers=guest["headers"])
    if host_wins:
        # host col 0, guest col 1, host col 0, guest col 2, host col 0, guest col 3, host col 0 wins
        moves = [(host, 0), (guest, 1), (host, 0), (guest, 2), (host, 0), (guest, 3), (host, 0)]
    else:
        # host must move first — put in col 4; guest builds vertical in col 0
        moves = [(host, 4), (guest, 0), (host, 5), (guest, 0), (host, 6), (guest, 0), (host, 4), (guest, 0)]
    last = None
    for who, col in moves:
        r = s.post(f"{API}/battle/{rid}/move", headers=who["headers"], json={"col": col})
        assert r.status_code == 200, r.text
        last = r.json()
        if last["status"] == "ended":
            break
    assert last["status"] == "ended", last
    return rid, last


def test_rematch_requires_ended(s, ua, ub):
    room = s.post(f"{API}/battle/create", headers=ua["headers"]).json()
    rid = room["id"]
    r = s.post(f"{API}/battle/{rid}/rematch", headers=ua["headers"])
    assert r.status_code == 400


def test_rematch_not_a_player_403(s, ua, ub):
    rid, ended = _play_battle_to_end(s, ua, ub, host_wins=True)
    outsider = _register(s, "outs")
    r = s.post(f"{API}/battle/{rid}/rematch", headers=outsider["headers"])
    assert r.status_code == 403


def test_rematch_host_wins_keeps_roles(s):
    a = _register(s, "reA")
    b = _register(s, "reB")
    rid, ended = _play_battle_to_end(s, a, b, host_wins=True)
    assert ended["winner"] == "host"
    r = s.post(f"{API}/battle/{rid}/rematch", headers=a["headers"])
    assert r.status_code == 200, r.text
    new_room = r.json()
    assert new_room["id"] != rid
    assert new_room["host_id"] == a["user"]["id"]
    assert new_room["guest_id"] == b["user"]["id"]
    assert new_room["status"] == "playing"
    assert new_room["moves"] == 0
    # calling again returns same rematch (idempotent)
    r2 = s.post(f"{API}/battle/{rid}/rematch", headers=b["headers"])
    assert r2.status_code == 200
    assert r2.json()["id"] == new_room["id"]


def test_rematch_guest_wins_swaps_roles(s):
    a = _register(s, "reC")
    b = _register(s, "reD")
    rid, ended = _play_battle_to_end(s, a, b, host_wins=False)
    assert ended["winner"] == "guest", ended
    r = s.post(f"{API}/battle/{rid}/rematch", headers=b["headers"])
    assert r.status_code == 200
    nr = r.json()
    # Guest won → they should now be host in new room
    assert nr["host_id"] == b["user"]["id"]
    assert nr["guest_id"] == a["user"]["id"]
