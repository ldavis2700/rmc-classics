"""RMC CLASSICS backend API tests — iteration 3.

Covers:
- Regression: root/auth/games meta/challenge
- New games: scrabble, dominoes submit + XP
- Streak & multiplier fields on /challenge/today and multiplier applied on submit
- Friend Battles: create/join/get/move/turn/win detection
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else "https://childhood-games-5.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@rmc.com", "password": "admin123"}
ALL_GAMES = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno", "ludo", "scrabble", "dominoes"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, prefix="test"):
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@rmc.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": prefix})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="session")
def user_a(s):
    return _register(s, "usera")


@pytest.fixture(scope="session")
def user_b(s):
    return _register(s, "userb")


@pytest.fixture(scope="session")
def user_c(s):
    return _register(s, "userc")


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


# ---------- Games meta: 11 games ----------
def test_games_meta_has_11(s):
    r = s.get(f"{API}/games/meta")
    assert r.status_code == 200
    g = r.json()["games"]
    assert set(g.keys()) == ALL_GAMES
    for gid in ("scrabble", "dominoes"):
        assert gid in g
        assert "name" in g[gid] and "score_dir" in g[gid]


# ---------- Submit scrabble & dominoes ----------
@pytest.mark.parametrize("gid", ["scrabble", "dominoes"])
def test_submit_new_games(s, gid):
    u = _register(s, "sub")
    h = u["headers"]
    r1 = s.post(f"{API}/games/submit", headers=h, json={"game_id": gid, "won": False})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["user"]["stats"][gid]["plays"] == 1
    assert d1["user"]["stats"][gid]["wins"] == 0
    assert d1["xp_gained"] >= 5

    r2 = s.post(f"{API}/games/submit", headers=h, json={"game_id": gid, "won": True, "score": 42})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["user"]["stats"][gid]["wins"] == 1
    assert d2["xp_gained"] >= 30
    assert d2["user"]["stats"][gid]["best_score"] == 42


def test_submit_unknown_game(s, user_a):
    r = s.post(f"{API}/games/submit", headers=user_a["headers"], json={"game_id": "invalid", "won": True})
    assert r.status_code == 400


# ---------- Challenge shape with streak+multiplier ----------
def test_challenge_today_requires_auth(s):
    r = s.get(f"{API}/challenge/today")
    assert r.status_code == 401


def test_challenge_today_streak_fields(s, user_a):
    r = s.get(f"{API}/challenge/today", headers=user_a["headers"])
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("challenge", "progress", "claimed", "xp_reward", "streak", "multiplier"):
        assert k in d, f"missing {k}"
    assert isinstance(d["streak"], int)
    assert isinstance(d["multiplier"], (int, float))
    # brand-new user: streak=0, multiplier=1.0, xp_reward=100
    assert d["streak"] == 0
    assert float(d["multiplier"]) == 1.0
    assert d["xp_reward"] == 100


def test_challenge_completion_streak_increments(s):
    """A fresh user completing today's challenge sets streak=1 and streak_last_date=today."""
    u = _register(s, "streak")
    h = u["headers"]
    ch = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    ctype = ch["type"]
    goal = int(ch["goal"])
    game_for = ch.get("game_id") or "chess"

    payload = {"game_id": game_for, "won": ctype != "plays"}
    challenge_done = False
    for _ in range(goal + 2):
        r = s.post(f"{API}/games/submit", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        if d.get("challenge_completed"):
            challenge_done = True
            # streak went from 0 → 1; bonus = 100 * 1.0
            assert d["user"]["streak"] == 1
            assert d["user"]["streak_last_date"] is not None
            break
    assert challenge_done


# ---------- Friend Battles ----------
def test_battle_create_shape(s, user_a):
    r = s.post(f"{API}/battle/create", headers=user_a["headers"])
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("id", "host_id", "host_name", "guest_id", "guest_name", "board", "turn", "winner", "status", "moves"):
        assert k in d
    assert d["host_id"] == user_a["user"]["id"]
    assert d["guest_id"] is None
    assert d["turn"] == "host"
    assert d["winner"] is None
    assert d["status"] == "waiting"
    assert d["moves"] == 0
    assert len(d["board"]) == 6 and len(d["board"][0]) == 7
    assert all(cell == 0 for row in d["board"] for cell in row)


def test_battle_join_second_user_starts_playing(s, user_a, user_b):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    # host joining same room is idempotent
    r_host = s.post(f"{API}/battle/{rid}/join", headers=user_a["headers"])
    assert r_host.status_code == 200
    assert r_host.json()["status"] == "waiting"
    # guest joins
    r_guest = s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])
    assert r_guest.status_code == 200
    dg = r_guest.json()
    assert dg["guest_id"] == user_b["user"]["id"]
    assert dg["status"] == "playing"


def test_battle_third_user_rejected(s, user_a, user_b, user_c):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])
    r = s.post(f"{API}/battle/{rid}/join", headers=user_c["headers"])
    assert r.status_code == 400
    assert "full" in r.json().get("detail", "").lower()


def test_battle_get_unknown_404(s, user_a):
    r = s.get(f"{API}/battle/ZZZZZZ", headers=user_a["headers"])
    assert r.status_code == 404


def test_battle_move_rules_and_win(s, user_a, user_b):
    """Host wins by vertical 4 in column 0."""
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])

    ha, hb = user_a["headers"], user_b["headers"]

    # Guest tries to move first → 400 (not their turn)
    r = s.post(f"{API}/battle/{rid}/move", headers=hb, json={"col": 0})
    assert r.status_code == 400

    # Invalid column
    r = s.post(f"{API}/battle/{rid}/move", headers=ha, json={"col": 99})
    assert r.status_code == 400

    # Host drops col 0, Guest col 1, alternating → Host wins in 4 moves at col 0
    moves = [(ha, 0), (hb, 1), (ha, 0), (hb, 1), (ha, 0), (hb, 1), (ha, 0)]
    last = None
    for hdr, col in moves:
        r = s.post(f"{API}/battle/{rid}/move", headers=hdr, json={"col": col})
        assert r.status_code == 200, r.text
        last = r.json()

    assert last["status"] == "ended"
    assert last["winner"] == "host"
    assert last["win_cells"] is not None and len(last["win_cells"]) == 4

    # After end, connect4 stats should have plays++ for both, wins++ for host
    ma = s.get(f"{API}/auth/me", headers=ha).json()["user"]
    mb = s.get(f"{API}/auth/me", headers=hb).json()["user"]
    assert ma["stats"]["connect4"]["plays"] >= 1
    assert ma["stats"]["connect4"]["wins"] >= 1
    assert mb["stats"]["connect4"]["plays"] >= 1


def test_battle_column_full_rejected(s, user_a, user_b):
    room = s.post(f"{API}/battle/create", headers=user_a["headers"]).json()
    rid = room["id"]
    s.post(f"{API}/battle/{rid}/join", headers=user_b["headers"])
    ha, hb = user_a["headers"], user_b["headers"]
    # Fill column 3 with 6 discs alternating, but need to make sure no win happens.
    # Host drops col 3; Guest col 4; keep alternating cols to avoid 4-in-row
    # After 6 stacked in col 3, host tries to drop again → 400 column full.
    plan = [(ha, 3), (hb, 4), (ha, 3), (hb, 5), (ha, 3), (hb, 4), (ha, 3), (hb, 5), (ha, 3), (hb, 4), (ha, 3)]
    # That's 6 discs in col 3 (turns of ha in indexes 0,2,4,6,8,10 => 6 discs; but wait host and guest alternate).
    # Since host lands on col 3 every host turn: after moves 1,3,5,7,9,11 host drops col 3 → 6 host discs in col 3 → vertical 4 win at move 7.
    # We need mixed players in col 3. Rewriting:
    # Alternate col 3 between host and guest — 6 discs, no 4-in-a-row (alternating colors).
    plan = [(ha, 3), (hb, 3), (ha, 3), (hb, 3), (ha, 3), (hb, 3)]
    for hdr, col in plan:
        r = s.post(f"{API}/battle/{rid}/move", headers=hdr, json={"col": col})
        assert r.status_code == 200, r.text
    # Next host move on col 3 should fail — column full
    r = s.post(f"{API}/battle/{rid}/move", headers=ha, json={"col": 3})
    assert r.status_code == 400
    assert "full" in r.json().get("detail", "").lower() or "invalid" in r.json().get("detail", "").lower()
