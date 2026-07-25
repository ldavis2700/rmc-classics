"""RMC CLASSICS backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://childhood-games-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@rmc.com", "password": "admin123"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def new_user(s):
    email = f"test_{uuid.uuid4().hex[:8]}@rmc.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Tester"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "password": "pass1234", "token": data["token"], "user": data["user"]}


# Root
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    d = r.json()
    assert d.get("app") == "RMC CLASSICS"
    assert d.get("status") == "ok"


# Auth: register
def test_register_and_duplicate(s, new_user):
    # duplicate email should be rejected
    r = s.post(f"{API}/auth/register", json={"email": new_user["email"], "password": "pass1234", "name": "Dup"})
    assert r.status_code == 400


def test_register_response_shape(new_user):
    u = new_user["user"]
    assert "id" in u and "email" in u and "stats" in u
    assert u["total_wins"] == 0 and u["total_plays"] == 0
    assert set(u["stats"].keys()) >= {"memory", "snakes", "connect4", "checkers", "rps", "crazy8"}


# Auth: login
def test_login_admin(s):
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    assert "token" in r.json()


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code == 401


# Auth: me
def test_me_with_token(s, new_user):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {new_user['token']}"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == new_user["email"]


def test_me_without_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


# Games: submit
def test_submit_unknown_game(s, new_user):
    r = s.post(f"{API}/games/submit",
               headers={"Authorization": f"Bearer {new_user['token']}"},
               json={"game_id": "invalid", "won": True, "score": 10})
    assert r.status_code == 400


def test_submit_updates_stats_desc(s, new_user):
    h = {"Authorization": f"Bearer {new_user['token']}"}
    r1 = s.post(f"{API}/games/submit", headers=h, json={"game_id": "connect4", "won": True, "score": 5})
    assert r1.status_code == 200
    r2 = s.post(f"{API}/games/submit", headers=h, json={"game_id": "connect4", "won": False, "score": 20})
    assert r2.status_code == 200
    u = r2.json()["user"]
    st = u["stats"]["connect4"]
    assert st["plays"] == 2
    assert st["wins"] == 1
    assert st["best_score"] == 20  # desc: higher is better


def test_submit_memory_asc(s):
    # fresh user
    email = f"mem_{uuid.uuid4().hex[:8]}@rmc.com"
    reg = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Mem"})
    tok = reg.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    s.post(f"{API}/games/submit", headers=h, json={"game_id": "memory", "won": True, "score": 30})
    r = s.post(f"{API}/games/submit", headers=h, json={"game_id": "memory", "won": True, "score": 15})
    assert r.status_code == 200
    st = r.json()["user"]["stats"]["memory"]
    assert st["best_score"] == 15  # asc: lower is better
    assert st["plays"] == 2 and st["wins"] == 2


def test_submit_no_auth(s):
    r = s.post(f"{API}/games/submit", json={"game_id": "connect4", "won": True})
    assert r.status_code == 401


# Leaderboards
def test_leaderboard_overall(s):
    r = s.get(f"{API}/games/leaderboard")
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert isinstance(rows, list)
    # sorted desc by total_wins
    wins = [row.get("total_wins", 0) for row in rows]
    assert wins == sorted(wins, reverse=True)


def test_leaderboard_per_game(s):
    r = s.get(f"{API}/games/leaderboard/connect4")
    assert r.status_code == 200
    d = r.json()
    assert d["game_id"] == "connect4"
    assert isinstance(d["rows"], list)


def test_leaderboard_unknown_game(s):
    r = s.get(f"{API}/games/leaderboard/badgame")
    assert r.status_code == 400


def test_games_meta(s):
    r = s.get(f"{API}/games/meta")
    assert r.status_code == 200
    g = r.json()["games"]
    assert set(g.keys()) == {"memory", "snakes", "connect4", "checkers", "rps", "crazy8"}
    assert g["memory"]["score_dir"] == "asc"
    assert g["connect4"]["score_dir"] == "desc"
