"""RMC CLASSICS backend API tests (iteration 2 — chess/uno/ludo + daily challenge)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else "https://childhood-games-5.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@rmc.com", "password": "admin123"}
ALL_GAMES = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno", "ludo"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s):
    email = f"test_{uuid.uuid4().hex[:8]}@rmc.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Tester"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def new_user(s):
    return _register(s)


# ---------- Root / auth (existing regression) ----------
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


# ---------- Games meta: must include 9 games ----------
def test_games_meta_has_9(s):
    r = s.get(f"{API}/games/meta")
    assert r.status_code == 200
    g = r.json()["games"]
    assert set(g.keys()) == ALL_GAMES
    for gid in ("chess", "uno", "ludo"):
        assert gid in g
        assert "name" in g[gid] and "score_dir" in g[gid]


# ---------- Submit for chess/uno/ludo ----------
@pytest.mark.parametrize("gid", ["chess", "uno", "ludo"])
def test_submit_new_games(s, gid):
    u = _register(s)
    h = {"Authorization": f"Bearer {u['token']}"}
    # loss: +5 xp
    r1 = s.post(f"{API}/games/submit", headers=h, json={"game_id": gid, "won": False})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "xp_gained" in d1 and "challenge_completed" in d1
    assert d1["xp_gained"] >= 5
    assert d1["user"]["stats"][gid]["plays"] == 1
    assert d1["user"]["stats"][gid]["wins"] == 0
    assert d1["user"]["xp"] >= 5

    # win: +25 base (+ possibly +100 daily bonus if matches challenge)
    r2 = s.post(f"{API}/games/submit", headers=h, json={"game_id": gid, "won": True})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["xp_gained"] >= 30  # 5 play + 25 win
    assert d2["user"]["stats"][gid]["wins"] == 1
    assert d2["user"]["total_wins"] >= 1


def test_submit_unknown_game(s, new_user):
    r = s.post(f"{API}/games/submit",
               headers={"Authorization": f"Bearer {new_user['token']}"},
               json={"game_id": "invalid", "won": True})
    assert r.status_code == 400


def test_submit_no_auth(s):
    r = s.post(f"{API}/games/submit", json={"game_id": "chess", "won": True})
    assert r.status_code == 401


# ---------- Daily challenge ----------
def test_challenge_today_requires_auth(s):
    r = s.get(f"{API}/challenge/today")
    assert r.status_code == 401


def test_challenge_today_shape(s, new_user):
    h = {"Authorization": f"Bearer {new_user['token']}"}
    r = s.get(f"{API}/challenge/today", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "challenge" in d and "progress" in d and "claimed" in d and "xp_reward" in d
    assert d["xp_reward"] == 100
    ch = d["challenge"]
    for k in ("id", "title", "desc", "type", "goal"):
        assert k in ch


def test_challenge_deterministic_per_day(s, new_user):
    h = {"Authorization": f"Bearer {new_user['token']}"}
    r1 = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    r2 = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    assert r1["id"] == r2["id"]


def test_challenge_completion_awards_bonus(s):
    """Register a fresh user, fetch today's challenge, satisfy it, verify +100 XP bonus."""
    u = _register(s)
    h = {"Authorization": f"Bearer {u['token']}"}
    ch = s.get(f"{API}/challenge/today", headers=h).json()["challenge"]
    ctype = ch["type"]
    goal = int(ch["goal"])
    game_for = ch.get("game_id") or "chess"

    total_bonus_xp = 0
    challenge_done = False
    submits = 0
    # Perform enough submits to complete the challenge
    while not challenge_done and submits < goal + 2:
        if ctype == "win":
            payload = {"game_id": game_for, "won": True}
        elif ctype == "wins":
            payload = {"game_id": game_for, "won": True}
        elif ctype == "plays":
            payload = {"game_id": game_for, "won": False}
        else:
            pytest.fail(f"Unknown challenge type {ctype}")
        r = s.post(f"{API}/games/submit", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        submits += 1
        if d.get("challenge_completed"):
            challenge_done = True
            # xp_gained for this submit should include +100 bonus
            assert d["xp_gained"] >= 100, f"Expected bonus XP, got {d['xp_gained']}"
            total_bonus_xp += 100
            break
    assert challenge_done, "Challenge never completed after enough submits"

    # After completion, further submits should not re-award bonus
    r = s.post(f"{API}/games/submit", headers=h, json={"game_id": "chess", "won": True})
    assert r.status_code == 200
    assert r.json()["challenge_completed"] is False
    assert r.json()["xp_gained"] < 100

    # /challenge/today now shows claimed=true and progress>=goal
    st = s.get(f"{API}/challenge/today", headers=h).json()
    assert st["claimed"] is True
    assert st["progress"] >= goal


# ---------- Leaderboards for new games ----------
@pytest.mark.parametrize("gid", ["chess", "uno", "ludo"])
def test_leaderboard_new_games(s, gid):
    r = s.get(f"{API}/games/leaderboard/{gid}")
    assert r.status_code == 200
    assert r.json()["game_id"] == gid


def test_leaderboard_unknown_game(s):
    r = s.get(f"{API}/games/leaderboard/badgame")
    assert r.status_code == 400
