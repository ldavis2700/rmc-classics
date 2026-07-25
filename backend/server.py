from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt as pyjwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ---------- Config ----------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for MVP simplicity

GAME_IDS = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno", "ludo", "scrabble", "dominoes"}
GAME_META = {
    "memory": {"name": "Memory Match", "score_dir": "asc"},   # lower moves better
    "snakes": {"name": "Snakes & Ladders", "score_dir": "desc"},
    "connect4": {"name": "Connect Four", "score_dir": "desc"},
    "checkers": {"name": "Checkers", "score_dir": "desc"},
    "rps": {"name": "Rock Paper Scissors", "score_dir": "desc"},
    "crazy8": {"name": "Crazy Eights", "score_dir": "desc"},
    "chess": {"name": "Chess", "score_dir": "desc"},
    "uno": {"name": "Uno", "score_dir": "desc"},
    "ludo": {"name": "Ludo", "score_dir": "desc"},
    "scrabble": {"name": "Scrabble Solo", "score_dir": "desc"},
    "dominoes": {"name": "Dominoes", "score_dir": "desc"},
}

# XP awarded
XP_PLAY = 5
XP_WIN = 25
XP_DAILY_BONUS = 100

# Rotating daily challenges keyed by day-of-year % N
DAILY_CHALLENGES = [
    {"id": "win-memory", "title": "Match Master", "desc": "Win 1 Memory Match game", "game_id": "memory", "type": "win", "goal": 1},
    {"id": "win-connect4", "title": "Four in a Row", "desc": "Win 1 Connect Four game", "game_id": "connect4", "type": "win", "goal": 1},
    {"id": "win-rps", "title": "Hands of Fate", "desc": "Win 1 Rock Paper Scissors series", "game_id": "rps", "type": "win", "goal": 1},
    {"id": "win-checkers", "title": "Board Sweep", "desc": "Win 1 Checkers game", "game_id": "checkers", "type": "win", "goal": 1},
    {"id": "win-crazy8", "title": "Empty Hand", "desc": "Win 1 Crazy Eights game", "game_id": "crazy8", "type": "win", "goal": 1},
    {"id": "win-chess", "title": "Grandmaster", "desc": "Win 1 Chess game", "game_id": "chess", "type": "win", "goal": 1},
    {"id": "win-uno", "title": "Wild Card", "desc": "Win 1 Uno game", "game_id": "uno", "type": "win", "goal": 1},
    {"id": "win-ludo", "title": "Home Run", "desc": "Get all your Ludo tokens home", "game_id": "ludo", "type": "win", "goal": 1},
    {"id": "win-scrabble", "title": "Word Wizard", "desc": "Beat par in Scrabble Solo", "game_id": "scrabble", "type": "win", "goal": 1},
    {"id": "win-dominoes", "title": "Chain Reaction", "desc": "Win 1 Dominoes match", "game_id": "dominoes", "type": "win", "goal": 1},
    {"id": "play-3", "title": "Warm Up", "desc": "Play any 3 games today", "game_id": None, "type": "plays", "goal": 3},
    {"id": "win-2", "title": "Double Down", "desc": "Win any 2 games today", "game_id": None, "type": "wins", "goal": 2},
]


def streak_multiplier(streak: int) -> float:
    if streak >= 100:
        return 5.0
    if streak >= 30:
        return 3.0
    if streak >= 7:
        return 2.0
    if streak >= 3:
        return 1.5
    return 1.0


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def get_todays_challenge() -> Dict[str, Any]:
    d = datetime.now(timezone.utc).date()
    day_index = d.toordinal() % len(DAILY_CHALLENGES)
    return DAILY_CHALLENGES[day_index]

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="RMC CLASSICS API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rmc")

security = HTTPBearer(auto_error=False)


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def empty_stats() -> Dict[str, Any]:
    return {gid: {"plays": 0, "wins": 0, "best_score": None} for gid in GAME_IDS}


def public_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "name": doc.get("name", ""),
        "avatar": doc.get("avatar"),
        "stats": doc.get("stats", empty_stats()),
        "total_wins": doc.get("total_wins", 0),
        "total_plays": doc.get("total_plays", 0),
        "xp": doc.get("xp", 0),
        "streak": doc.get("streak", 0),
        "streak_last_date": doc.get("streak_last_date"),
        "created_at": doc.get("created_at"),
    }


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    token = None
    if creds and creds.credentials:
        token = creds.credentials
    else:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=60)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SubmitScoreIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    game_id: str
    won: bool = False
    score: Optional[float] = None  # game-specific metric


# ---------- Auth Endpoints ----------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "avatar": None,
        "stats": empty_stats(),
        "total_wins": 0,
        "total_plays": 0,
        "xp": 0,
        "daily": {"date": None, "progress": 0, "claimed": False},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return {"user": public_user(doc), "token": token}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    return {"user": public_user(user), "token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


@api.post("/auth/logout")
async def logout():
    return {"ok": True}


# ---------- Game / Score Endpoints ----------
@api.post("/games/submit")
async def submit_score(body: SubmitScoreIn, user: dict = Depends(get_current_user)):
    gid = body.game_id
    if gid not in GAME_IDS:
        raise HTTPException(status_code=400, detail="Unknown game_id")
    stats = user.get("stats") or empty_stats()
    gstat = stats.get(gid) or {"plays": 0, "wins": 0, "best_score": None}
    gstat["plays"] = int(gstat.get("plays", 0)) + 1
    if body.won:
        gstat["wins"] = int(gstat.get("wins", 0)) + 1
    if body.score is not None:
        direction = GAME_META[gid]["score_dir"]
        current = gstat.get("best_score")
        if current is None:
            gstat["best_score"] = body.score
        elif direction == "asc" and body.score < current:
            gstat["best_score"] = body.score
        elif direction == "desc" and body.score > current:
            gstat["best_score"] = body.score
    stats[gid] = gstat
    total_plays = sum(int(s.get("plays", 0)) for s in stats.values())
    total_wins = sum(int(s.get("wins", 0)) for s in stats.values())

    # XP with streak multiplier
    streak = int(user.get("streak", 0))
    mult = streak_multiplier(streak)
    base_xp = XP_PLAY + (XP_WIN if body.won else 0)
    xp_gain = int(base_xp * mult)

    # Daily challenge progress
    today = today_str()
    daily = user.get("daily") or {}
    if daily.get("date") != today:
        daily = {"date": today, "progress": 0, "claimed": False}
    challenge = get_todays_challenge()
    matches = False
    if not daily.get("claimed"):
        if challenge["type"] == "win" and body.won and challenge.get("game_id") == gid:
            daily["progress"] = int(daily.get("progress", 0)) + 1
            matches = True
        elif challenge["type"] == "wins" and body.won:
            daily["progress"] = int(daily.get("progress", 0)) + 1
            matches = True
        elif challenge["type"] == "plays":
            daily["progress"] = int(daily.get("progress", 0)) + 1
            matches = True
    challenge_completed = False
    new_streak = streak
    if matches and not daily.get("claimed") and int(daily.get("progress", 0)) >= int(challenge["goal"]):
        daily["claimed"] = True
        # Streak logic
        last_claim = user.get("streak_last_date")
        yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).strftime("%Y-%m-%d")
        if last_claim == yesterday:
            new_streak = streak + 1
        elif last_claim == today:
            new_streak = streak  # already counted (edge)
        else:
            new_streak = 1
        mult_after = streak_multiplier(new_streak)
        bonus = int(XP_DAILY_BONUS * mult_after)
        xp_gain += bonus
        challenge_completed = True

    new_xp = int(user.get("xp", 0)) + xp_gain

    update_fields = {
        "stats": stats,
        "total_wins": total_wins,
        "total_plays": total_plays,
        "xp": new_xp,
        "daily": daily,
    }
    if challenge_completed:
        update_fields["streak"] = new_streak
        update_fields["streak_last_date"] = today

    await db.users.update_one({"id": user["id"]}, {"$set": update_fields})
    await db.game_events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "game_id": gid,
        "won": body.won,
        "score": body.score,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "user": public_user(updated),
        "xp_gained": xp_gain,
        "challenge_completed": challenge_completed,
    }


@api.get("/challenge/today")
async def challenge_today(user: dict = Depends(get_current_user)):
    ch = get_todays_challenge()
    today = today_str()
    daily = user.get("daily") or {}
    if daily.get("date") != today:
        daily = {"date": today, "progress": 0, "claimed": False}
    streak = int(user.get("streak", 0))
    mult = streak_multiplier(streak)
    return {
        "challenge": ch,
        "progress": int(daily.get("progress", 0)),
        "claimed": bool(daily.get("claimed", False)),
        "xp_reward": int(XP_DAILY_BONUS * mult),
        "streak": streak,
        "multiplier": mult,
    }


@api.get("/games/leaderboard")
async def overall_leaderboard(limit: int = 20):
    cursor = db.users.find({}, {"_id": 0, "id": 1, "name": 1, "avatar": 1,
                                "total_wins": 1, "total_plays": 1}).sort("total_wins", -1).limit(limit)
    rows = await cursor.to_list(limit)
    return {"rows": rows}


@api.get("/games/leaderboard/{game_id}")
async def game_leaderboard(game_id: str, limit: int = 20):
    if game_id not in GAME_IDS:
        raise HTTPException(status_code=400, detail="Unknown game_id")
    direction = GAME_META[game_id]["score_dir"]
    # Sort by wins desc, then by best_score in appropriate direction
    users = await db.users.find(
        {f"stats.{game_id}.plays": {"$gt": 0}},
        {"_id": 0, "id": 1, "name": 1, "avatar": 1, f"stats.{game_id}": 1},
    ).to_list(1000)
    rows = []
    for u in users:
        s = (u.get("stats") or {}).get(game_id) or {}
        if not s.get("plays"):
            continue
        rows.append({
            "user_id": u["id"],
            "name": u.get("name", ""),
            "avatar": u.get("avatar"),
            "plays": int(s.get("plays", 0)),
            "wins": int(s.get("wins", 0)),
            "best_score": s.get("best_score"),
        })

    def sort_key(r):
        # Primary: wins desc → use -wins so ascending sort gives desc
        wins = -r["wins"]
        bs = r["best_score"]
        if bs is None:
            secondary = float("inf") if direction == "asc" else float("-inf")
        else:
            secondary = bs if direction == "asc" else -bs
        return (wins, secondary)

    rows.sort(key=sort_key)
    return {"game_id": game_id, "rows": rows[:limit]}


@api.get("/games/meta")
async def games_meta():
    return {"games": GAME_META}


# ---------- Friend Battles (Connect Four PvP) ----------
# In-memory battle rooms. Keep it simple; polling API.
BATTLE_ROWS = 6
BATTLE_COLS = 7
_battle_rooms: Dict[str, Dict[str, Any]] = {}


def _empty_board():
    return [[0 for _ in range(BATTLE_COLS)] for _ in range(BATTLE_ROWS)]


def _c4_drop(board, col, player):
    for r in range(BATTLE_ROWS - 1, -1, -1):
        if board[r][col] == 0:
            board[r][col] = player
            return r
    return None


def _c4_win(board, player):
    dirs = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for r in range(BATTLE_ROWS):
        for c in range(BATTLE_COLS):
            if board[r][c] != player:
                continue
            for dr, dc in dirs:
                cells = []
                ok = True
                for k in range(4):
                    nr, nc = r + dr * k, c + dc * k
                    if not (0 <= nr < BATTLE_ROWS and 0 <= nc < BATTLE_COLS) or board[nr][nc] != player:
                        ok = False
                        break
                    cells.append([nr, nc])
                if ok:
                    return cells
    return None


def _c4_full(board):
    return all(board[0][c] != 0 for c in range(BATTLE_COLS))


def _public_room(room: dict) -> dict:
    return {
        "id": room["id"],
        "host_id": room["host_id"],
        "host_name": room["host_name"],
        "guest_id": room.get("guest_id"),
        "guest_name": room.get("guest_name"),
        "board": room["board"],
        "turn": room["turn"],
        "winner": room["winner"],
        "win_cells": room.get("win_cells"),
        "moves": room["moves"],
        "status": room["status"],
        "created_at": room["created_at"],
        "last_move_at": room.get("last_move_at"),
    }


class MoveIn(BaseModel):
    col: int


@api.post("/battle/create")
async def create_battle(user: dict = Depends(get_current_user)):
    rid = uuid.uuid4().hex[:6].upper()
    room = {
        "id": rid,
        "host_id": user["id"],
        "host_name": user.get("name", "Host"),
        "guest_id": None,
        "guest_name": None,
        "board": _empty_board(),
        "turn": "host",
        "winner": None,
        "win_cells": None,
        "moves": 0,
        "status": "waiting",  # waiting -> playing -> ended
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _battle_rooms[rid] = room
    return _public_room(room)


@api.post("/battle/{room_id}/join")
async def join_battle(room_id: str, user: dict = Depends(get_current_user)):
    room = _battle_rooms.get(room_id.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Battle not found")
    if room["host_id"] == user["id"]:
        return _public_room(room)
    if room.get("guest_id") and room["guest_id"] != user["id"]:
        raise HTTPException(status_code=400, detail="Battle already full")
    room["guest_id"] = user["id"]
    room["guest_name"] = user.get("name", "Guest")
    room["status"] = "playing"
    return _public_room(room)


@api.get("/battle/{room_id}")
async def get_battle(room_id: str, user: dict = Depends(get_current_user)):
    room = _battle_rooms.get(room_id.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Battle not found")
    return _public_room(room)


@api.post("/battle/{room_id}/move")
async def battle_move(room_id: str, body: MoveIn, user: dict = Depends(get_current_user)):
    room = _battle_rooms.get(room_id.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Battle not found")
    if room["status"] != "playing":
        raise HTTPException(status_code=400, detail="Battle not active")
    is_host = user["id"] == room["host_id"]
    is_guest = user["id"] == room.get("guest_id")
    if not (is_host or is_guest):
        raise HTTPException(status_code=403, detail="Not a player in this battle")
    my_turn = (is_host and room["turn"] == "host") or (is_guest and room["turn"] == "guest")
    if not my_turn:
        raise HTTPException(status_code=400, detail="Not your turn")
    col = int(body.col)
    if col < 0 or col >= BATTLE_COLS:
        raise HTTPException(status_code=400, detail="Invalid column")
    player_marker = 1 if is_host else 2
    dropped = _c4_drop(room["board"], col, player_marker)
    if dropped is None:
        raise HTTPException(status_code=400, detail="Column full")
    room["moves"] += 1
    room["last_move_at"] = datetime.now(timezone.utc).isoformat()
    win = _c4_win(room["board"], player_marker)
    if win:
        room["winner"] = "host" if is_host else "guest"
        room["win_cells"] = win
        room["status"] = "ended"
    elif _c4_full(room["board"]):
        room["winner"] = "draw"
        room["status"] = "ended"
    else:
        room["turn"] = "guest" if room["turn"] == "host" else "host"
    # Award XP/stats on win (both players get plays; winner gets win)
    if room["status"] == "ended":
        await _award_battle_result(room)
    return _public_room(room)


async def _award_battle_result(room: dict):
    winner = room.get("winner")
    for uid, is_h in [(room["host_id"], True), (room.get("guest_id"), False)]:
        if not uid:
            continue
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if not u:
            continue
        stats = u.get("stats") or empty_stats()
        gstat = stats.get("connect4") or {"plays": 0, "wins": 0, "best_score": None}
        gstat["plays"] += 1
        won = (winner == "host" and is_h) or (winner == "guest" and not is_h)
        if won:
            gstat["wins"] += 1
        stats["connect4"] = gstat
        total_wins = sum(int(s.get("wins", 0)) for s in stats.values())
        total_plays = sum(int(s.get("plays", 0)) for s in stats.values())
        streak = int(u.get("streak", 0))
        mult = streak_multiplier(streak)
        base = XP_PLAY + (XP_WIN if won else 0)
        new_xp = int(u.get("xp", 0)) + int(base * mult)
        await db.users.update_one({"id": uid}, {"$set": {
            "stats": stats, "total_wins": total_wins, "total_plays": total_plays, "xp": new_xp,
        }})


@api.get("/")
async def root():
    return {"app": "RMC CLASSICS", "status": "ok"}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("total_wins")
    await db.game_events.create_index("user_id")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@rmc.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "avatar": None,
            "stats": empty_stats(),
            "total_wins": 0,
            "total_plays": 0,
            "xp": 0,
            "daily": {"date": None, "progress": 0, "claimed": False},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
