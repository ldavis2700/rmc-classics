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
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ---------- Config ----------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for MVP simplicity

GAME_IDS = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno", "ludo", "scrabble", "dominoes", "gofish", "oldmaid", "jenga"}
GAME_META = {
    "memory": {"name": "Memory Match", "score_dir": "asc"},   # lower moves better
    "snakes": {"name": "Snakes & Ladders", "score_dir": "desc"},
    "connect4": {"name": "Connect Four", "score_dir": "desc"},
    "checkers": {"name": "Checkers", "score_dir": "desc"},
    "rps": {"name": "Rock Paper Scissors", "score_dir": "desc"},
    "crazy8": {"name": "Crazy Eights", "score_dir": "desc"},
    "chess": {"name": "Chess", "score_dir": "desc"},
    "uno": {"name": "Wild Cards", "score_dir": "desc"},
    "ludo": {"name": "Ludo", "score_dir": "desc"},
    "scrabble": {"name": "Word Tiles", "score_dir": "desc"},
    "dominoes": {"name": "Dominoes", "score_dir": "desc"},
    "gofish": {"name": "Go Fish", "score_dir": "desc"},
    "oldmaid": {"name": "Old Maid", "score_dir": "desc"},
    "jenga": {"name": "Tumble Tower", "score_dir": "desc"},
}

# ---------- Themes ----------
THEMES = [
    {"id": "neon", "name": "Neon Arcade", "unlock_xp": 0, "primary": "#FF479A", "accent": "#00F0FF"},
    {"id": "gameboy", "name": "Gameboy", "unlock_xp": 250, "primary": "#9BBC0F", "accent": "#8BAC0F"},
    {"id": "crt", "name": "Retro CRT", "unlock_xp": 750, "primary": "#39FF14", "accent": "#00F0FF"},
    {"id": "arcade", "name": "Coin-op Arcade", "unlock_xp": 1500, "primary": "#FF3B3B", "accent": "#FFD100"},
]
THEME_BY_ID = {t["id"]: t for t in THEMES}


def unlocked_themes_for(xp: int) -> list:
    return [t["id"] for t in THEMES if int(xp) >= int(t["unlock_xp"])]


# ---------- Badges ----------
# List of badges. Each badge: {id, name, desc, icon, check(user, ctx)->bool}
BADGES = [
    {"id": "first_win", "name": "First Blood", "desc": "Win your first game", "icon": "🩸", "color": "#FF479A"},
    {"id": "wins_5", "name": "Hot Streak", "desc": "Win 5 games total", "icon": "🔥", "color": "#FFD100"},
    {"id": "wins_25", "name": "Champion", "desc": "Win 25 games total", "icon": "🏆", "color": "#FFD100"},
    {"id": "wins_100", "name": "Legend", "desc": "Win 100 games total", "icon": "👑", "color": "#39FF14"},
    {"id": "plays_10", "name": "Regular", "desc": "Play 10 games", "icon": "🎮", "color": "#00F0FF"},
    {"id": "plays_50", "name": "Enthusiast", "desc": "Play 50 games", "icon": "🎯", "color": "#00F0FF"},
    {"id": "streak_3", "name": "Warmed Up", "desc": "3-day daily-challenge streak", "icon": "🕯", "color": "#FF479A"},
    {"id": "streak_7", "name": "On Fire", "desc": "7-day daily-challenge streak", "icon": "🔥", "color": "#FF479A"},
    {"id": "streak_30", "name": "Devotee", "desc": "30-day daily-challenge streak", "icon": "🌟", "color": "#FFD100"},
    {"id": "streak_100", "name": "Immortal", "desc": "100-day daily-challenge streak", "icon": "💎", "color": "#00F0FF"},
    {"id": "chess_win", "name": "Grandmaster", "desc": "Win a Chess game", "icon": "♛", "color": "#FFFFFF"},
    {"id": "scrabble_win", "name": "Word Smith", "desc": "Beat par in Word Tiles", "icon": "🔤", "color": "#39FF14"},
    {"id": "jenga_10", "name": "Steady Hand", "desc": "Pull 10 blocks in Tumble Tower", "icon": "🗼", "color": "#FF9500"},
    {"id": "battle_win", "name": "Duelist", "desc": "Win a Friend Battle", "icon": "⚔", "color": "#FF479A"},
    {"id": "all_games", "name": "Collector", "desc": "Play every game at least once", "icon": "🎪", "color": "#FFD100"},
]
BADGE_BY_ID = {b["id"]: b for b in BADGES}


def compute_earned_badges(user: dict, ctx: Optional[Dict[str, Any]] = None) -> list:
    """Return badge ids the user qualifies for right now."""
    stats = user.get("stats") or {}
    ctx = ctx or {}
    earned = []
    total_wins = int(user.get("total_wins", 0))
    total_plays = int(user.get("total_plays", 0))
    streak = int(user.get("streak", 0))
    if total_wins >= 1:
        earned.append("first_win")
    if total_wins >= 5:
        earned.append("wins_5")
    if total_wins >= 25:
        earned.append("wins_25")
    if total_wins >= 100:
        earned.append("wins_100")
    if total_plays >= 10:
        earned.append("plays_10")
    if total_plays >= 50:
        earned.append("plays_50")
    if streak >= 3:
        earned.append("streak_3")
    if streak >= 7:
        earned.append("streak_7")
    if streak >= 30:
        earned.append("streak_30")
    if streak >= 100:
        earned.append("streak_100")
    if int((stats.get("chess") or {}).get("wins", 0)) >= 1:
        earned.append("chess_win")
    if int((stats.get("scrabble") or {}).get("wins", 0)) >= 1:
        earned.append("scrabble_win")
    if int((stats.get("jenga") or {}).get("best", 0)) >= 10:
        earned.append("jenga_10")
    if ctx.get("battle_win"):
        earned.append("battle_win")
    if all(int((stats.get(g) or {}).get("plays", 0)) >= 1 for g in GAME_IDS):
        earned.append("all_games")
    return earned

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
    {"id": "win-uno", "title": "Wild Card", "desc": "Win 1 Wild Cards game", "game_id": "uno", "type": "win", "goal": 1},
    {"id": "win-ludo", "title": "Home Run", "desc": "Get all your Ludo tokens home", "game_id": "ludo", "type": "win", "goal": 1},
    {"id": "win-scrabble", "title": "Word Wizard", "desc": "Beat par in Word Tiles", "game_id": "scrabble", "type": "win", "goal": 1},
    {"id": "win-dominoes", "title": "Chain Reaction", "desc": "Win 1 Dominoes match", "game_id": "dominoes", "type": "win", "goal": 1},
    {"id": "win-gofish", "title": "Angler", "desc": "Win 1 Go Fish match", "game_id": "gofish", "type": "win", "goal": 1},
    {"id": "win-oldmaid", "title": "Not Today", "desc": "Avoid the Old Maid", "game_id": "oldmaid", "type": "win", "goal": 1},
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
    xp = int(doc.get("xp", 0))
    unlocked_themes = list(set((doc.get("unlocked_themes") or []) + unlocked_themes_for(xp)))
    return {
        "id": doc["id"],
        "email": doc["email"],
        "name": doc.get("name", ""),
        "avatar": doc.get("avatar"),
        "stats": doc.get("stats", empty_stats()),
        "total_wins": doc.get("total_wins", 0),
        "total_plays": doc.get("total_plays", 0),
        "xp": xp,
        "streak": doc.get("streak", 0),
        "streak_last_date": doc.get("streak_last_date"),
        "freezes_available": int(doc.get("freezes_available", 1)),
        "freezes_last_refill": doc.get("freezes_last_refill"),
        "badges": doc.get("badges", []),
        "theme": doc.get("theme", "neon"),
        "unlocked_themes": unlocked_themes,
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
    # heartbeat: update last_seen
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated or user)}


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
    freeze_used = False
    freezes_available = int(user.get("freezes_available", 1))
    freezes_last_refill = user.get("freezes_last_refill")
    today_date = datetime.now(timezone.utc).date()

    # Refill: 1 freeze available every 7 days
    if not freezes_last_refill:
        freezes_available = 1
        freezes_last_refill = today
    else:
        try:
            last_refill_date = datetime.strptime(freezes_last_refill, "%Y-%m-%d").date()
            if (today_date - last_refill_date).days >= 7:
                freezes_available = 1
                freezes_last_refill = today
        except Exception:
            freezes_available = 1
            freezes_last_refill = today

    if matches and not daily.get("claimed") and int(daily.get("progress", 0)) >= int(challenge["goal"]):
        daily["claimed"] = True
        last_claim = user.get("streak_last_date")
        yesterday = (today_date - timedelta(days=1)).strftime("%Y-%m-%d")
        day_before = (today_date - timedelta(days=2)).strftime("%Y-%m-%d")
        if last_claim == yesterday:
            new_streak = streak + 1
        elif last_claim == today:
            new_streak = streak
        elif last_claim == day_before and freezes_available > 0:
            # Use a streak freeze to preserve
            new_streak = streak + 1
            freezes_available -= 1
            freeze_used = True
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
        "freezes_available": freezes_available,
        "freezes_last_refill": freezes_last_refill,
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

    # Compute newly earned badges
    prev_badges = set(user.get("badges") or [])
    earned = set(compute_earned_badges(updated))
    newly_unlocked = list(earned - prev_badges)
    if newly_unlocked:
        merged = list(earned)
        await db.users.update_one({"id": user["id"]}, {"$set": {"badges": merged}})
        updated["badges"] = merged

    return {
        "user": public_user(updated),
        "xp_gained": xp_gain,
        "challenge_completed": challenge_completed,
        "freeze_used": freeze_used,
        "newly_unlocked_badges": [BADGE_BY_ID[b] for b in newly_unlocked if b in BADGE_BY_ID],
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


@api.get("/badges")
async def list_badges():
    return {"badges": BADGES}


# ---------- Friend Battles (Connect Four PvP) ----------
# In-memory battle rooms. Keep it simple; polling API + WebSocket push.
BATTLE_ROWS = 6
BATTLE_COLS = 7
_battle_rooms: Dict[str, Dict[str, Any]] = {}
_battle_connections: Dict[str, set] = {}  # room_id -> set of WebSocket


async def broadcast_battle_state(room_id: str):
    conns = _battle_connections.get(room_id, set())
    if not conns:
        return
    room = _battle_rooms.get(room_id)
    if not room:
        return
    payload = {"type": "state", "room": _public_room(room)}
    dead = []
    for ws in list(conns):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.discard(ws)


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
        "rematch_id": room.get("rematch_id"),
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
    await broadcast_battle_state(room["id"])
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
    await broadcast_battle_state(room_id.upper())
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
        # Compute badges for this user
        interim = {**u, "stats": stats, "total_wins": total_wins, "total_plays": total_plays}
        earned = set(compute_earned_badges(interim, {"battle_win": won}))
        merged = list(set(u.get("badges") or []) | earned)
        await db.users.update_one({"id": uid}, {"$set": {
            "stats": stats,
            "total_wins": total_wins,
            "total_plays": total_plays,
            "xp": new_xp,
            "badges": merged,
        }})


@app.websocket("/api/ws/battle/{room_id}")
async def ws_battle(websocket: WebSocket, room_id: str, token: str = Query(None)):
    # Accept first so we can send custom close codes to the client
    await websocket.accept()
    # Authenticate via token query param
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except Exception:
        await websocket.close(code=4401)
        return
    rid = room_id.upper()
    room = _battle_rooms.get(rid)
    if not room:
        await websocket.close(code=4404)
        return
    # user must be host or (allowed) guest slot
    if user_id != room["host_id"] and user_id != room.get("guest_id"):
        await websocket.close(code=4403)
        return
    conns = _battle_connections.setdefault(rid, set())
    conns.add(websocket)
    try:
        # send initial state
        await websocket.send_json({"type": "state", "room": _public_room(room)})
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "move":
                col = int(data.get("col", -1))
                if room["status"] != "playing":
                    await websocket.send_json({"type": "error", "detail": "Battle not active"})
                    continue
                is_host = user_id == room["host_id"]
                is_guest = user_id == room.get("guest_id")
                my_turn = (is_host and room["turn"] == "host") or (is_guest and room["turn"] == "guest")
                if not my_turn:
                    await websocket.send_json({"type": "error", "detail": "Not your turn"})
                    continue
                if col < 0 or col >= BATTLE_COLS:
                    await websocket.send_json({"type": "error", "detail": "Invalid column"})
                    continue
                marker = 1 if is_host else 2
                dropped = _c4_drop(room["board"], col, marker)
                if dropped is None:
                    await websocket.send_json({"type": "error", "detail": "Column full"})
                    continue
                room["moves"] += 1
                room["last_move_at"] = datetime.now(timezone.utc).isoformat()
                win = _c4_win(room["board"], marker)
                if win:
                    room["winner"] = "host" if is_host else "guest"
                    room["win_cells"] = win
                    room["status"] = "ended"
                elif _c4_full(room["board"]):
                    room["winner"] = "draw"
                    room["status"] = "ended"
                else:
                    room["turn"] = "guest" if room["turn"] == "host" else "host"
                if room["status"] == "ended":
                    await _award_battle_result(room)
                await broadcast_battle_state(rid)
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WS battle error: %s", e)
    finally:
        conns.discard(websocket)


@api.post("/battle/{room_id}/rematch")
async def rematch_battle(room_id: str, user: dict = Depends(get_current_user)):
    old = _battle_rooms.get(room_id.upper())
    if not old:
        raise HTTPException(status_code=404, detail="Battle not found")
    if old["status"] != "ended":
        raise HTTPException(status_code=400, detail="Battle not finished yet")
    if user["id"] != old["host_id"] and user["id"] != old.get("guest_id"):
        raise HTTPException(status_code=403, detail="Not a player in this battle")
    if old.get("rematch_id"):
        return _public_room(_battle_rooms.get(old["rematch_id"], old))
    # Preserve prior host role for the person who won (or original host if draw)
    new_host_id = old["host_id"]
    new_host_name = old["host_name"]
    new_guest_id = old.get("guest_id")
    new_guest_name = old.get("guest_name")
    if old.get("winner") == "guest":
        new_host_id, new_guest_id = new_guest_id, new_host_id
        new_host_name, new_guest_name = new_guest_name, new_host_name
    rid = uuid.uuid4().hex[:6].upper()
    new_room = {
        "id": rid,
        "host_id": new_host_id,
        "host_name": new_host_name,
        "guest_id": new_guest_id,
        "guest_name": new_guest_name,
        "board": _empty_board(),
        "turn": "host",
        "winner": None,
        "win_cells": None,
        "moves": 0,
        "status": "playing" if new_guest_id else "waiting",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _battle_rooms[rid] = new_room
    old["rematch_id"] = rid
    await broadcast_battle_state(old["id"])  # notify old room subscribers
    return _public_room(new_room)


# ---------- Weekly leaderboard (from game_events) ----------
def _week_start_utc() -> datetime:
    now = datetime.now(timezone.utc)
    # Monday as start of week
    d = now - timedelta(days=now.weekday())
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


@api.get("/games/leaderboard-week")
async def weekly_leaderboard(game_id: Optional[str] = None, limit: int = 20):
    start = _week_start_utc().isoformat()
    q = {"created_at": {"$gte": start}}
    if game_id:
        if game_id not in GAME_IDS:
            raise HTTPException(status_code=400, detail="Unknown game_id")
        q["game_id"] = game_id
    events = await db.game_events.find(q, {"_id": 0}).to_list(20000)
    tally = {}
    for e in events:
        uid = e["user_id"]
        t = tally.setdefault(uid, {"plays": 0, "wins": 0})
        t["plays"] += 1
        if e.get("won"):
            t["wins"] += 1
    if not tally:
        return {"window": "week", "since": start, "rows": []}
    users = await db.users.find({"id": {"$in": list(tally.keys())}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1}).to_list(1000)
    name_map = {u["id"]: u for u in users}
    rows = []
    for uid, t in tally.items():
        u = name_map.get(uid, {})
        rows.append({
            "user_id": uid,
            "name": u.get("name", "Player"),
            "avatar": u.get("avatar"),
            "plays": t["plays"],
            "wins": t["wins"],
        })
    rows.sort(key=lambda r: (-r["wins"], -r["plays"]))
    return {"window": "week", "since": start, "rows": rows[:limit]}


# ---------- Friends ----------
class FriendAddIn(BaseModel):
    email: EmailStr


@api.post("/friends/add")
async def add_friend(body: FriendAddIn, user: dict = Depends(get_current_user)):
    email = body.email.lower().strip()
    if email == user["email"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    friend = await db.users.find_one({"email": email}, {"_id": 0})
    if not friend:
        raise HTTPException(status_code=404, detail="No player with that email")
    friend_ids = list(set((user.get("friend_ids") or []) + [friend["id"]]))
    # Mutual: also add current user to friend's list
    their_ids = list(set((friend.get("friend_ids") or []) + [user["id"]]))
    await db.users.update_one({"id": user["id"]}, {"$set": {"friend_ids": friend_ids}})
    await db.users.update_one({"id": friend["id"]}, {"$set": {"friend_ids": their_ids}})
    return {"ok": True, "friend": {"id": friend["id"], "name": friend.get("name", ""), "email": friend["email"]}}


@api.get("/friends")
async def list_friends(user: dict = Depends(get_current_user)):
    ids = user.get("friend_ids") or []
    if not ids:
        return {"friends": []}
    friends = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "avatar": 1, "last_seen": 1, "total_wins": 1, "xp": 1}).to_list(1000)
    now = datetime.now(timezone.utc)
    out = []
    for f in friends:
        online = False
        try:
            if f.get("last_seen"):
                ls = datetime.fromisoformat(f["last_seen"])
                online = (now - ls).total_seconds() < 90
        except Exception:
            online = False
        out.append({
            "id": f["id"],
            "name": f.get("name", ""),
            "email": f["email"],
            "avatar": f.get("avatar"),
            "total_wins": f.get("total_wins", 0),
            "xp": f.get("xp", 0),
            "online": online,
        })
    out.sort(key=lambda r: (0 if r["online"] else 1, -r["total_wins"]))
    return {"friends": out}


@api.delete("/friends/{friend_id}")
async def remove_friend(friend_id: str, user: dict = Depends(get_current_user)):
    ids = [f for f in (user.get("friend_ids") or []) if f != friend_id]
    await db.users.update_one({"id": user["id"]}, {"$set": {"friend_ids": ids}})
    friend = await db.users.find_one({"id": friend_id}, {"_id": 0})
    if friend:
        theirs = [f for f in (friend.get("friend_ids") or []) if f != user["id"]]
        await db.users.update_one({"id": friend_id}, {"$set": {"friend_ids": theirs}})
    return {"ok": True}


# ---------- Themes ----------
class ThemeSelectIn(BaseModel):
    theme_id: str


@api.get("/themes")
async def list_themes():
    return {"themes": THEMES}


@api.post("/themes/select")
async def select_theme(body: ThemeSelectIn, user: dict = Depends(get_current_user)):
    if body.theme_id not in THEME_BY_ID:
        raise HTTPException(status_code=400, detail="Unknown theme")
    xp = int(user.get("xp", 0))
    unlocked = unlocked_themes_for(xp)
    if body.theme_id not in unlocked:
        raise HTTPException(status_code=403, detail="Theme not unlocked yet")
    await db.users.update_one({"id": user["id"]}, {"$set": {"theme": body.theme_id}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated)}


@api.get("/")
async def root():
    return {"app": "RMC CLASSICS", "status": "ok"}


# ---------- In-App Purchases (RevenueCat) ----------
FREEZE_PACK_5_ID = "rmc.freeze.pack5"
FREEZE_PACK_5_QTY = 5
REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"


async def _rc_get_subscriber(app_user_id: str) -> Optional[dict]:
    """Fetch authoritative subscriber state from RevenueCat. Returns None if not configured."""
    secret = os.environ.get("REVENUECAT_SECRET_KEY", "").strip()
    if not secret:
        return None
    import httpx
    async with httpx.AsyncClient(timeout=10) as client_http:
        r = await client_http.get(
            f"{REVENUECAT_API_BASE}/subscribers/{app_user_id}",
            headers={"Authorization": f"Bearer {secret}"},
        )
        if r.status_code != 200:
            logger.warning("RevenueCat /subscribers returned %s: %s", r.status_code, r.text[:200])
            return None
        return r.json().get("subscriber")


async def _credit_freeze_pack(user_id: str, transaction_ids: List[str]) -> int:
    """Atomically claim and credit each transaction once. Returns packs credited."""
    credited = 0
    for transaction_id in dict.fromkeys(tid for tid in transaction_ids if tid):
        # The transaction claim and balance increment happen in one document update.
        # Concurrent sync/webhook requests therefore cannot credit the same purchase twice.
        result = await db.users.update_one(
            {"id": user_id, "processed_iap": {"$ne": transaction_id}},
            {
                "$inc": {"freezes_available": FREEZE_PACK_5_QTY},
                "$addToSet": {"processed_iap": transaction_id},
            },
        )
        credited += int(result.modified_count)
    if credited:
        logger.info(
            "IAP: credited %d freezes to %s across %d transaction(s)",
            credited * FREEZE_PACK_5_QTY,
            user_id,
            credited,
        )
    return credited


class IAPSyncIn(BaseModel):
    product_id: str


@api.post("/iap/sync")
async def iap_sync(body: IAPSyncIn, user: dict = Depends(get_current_user)):
    """Client calls this after a successful RevenueCat purchase.
    We fetch authoritative subscriber state from RevenueCat with our secret key
    and idempotently credit any un-processed freeze packs.
    """
    if body.product_id != FREEZE_PACK_5_ID:
        raise HTTPException(status_code=400, detail="Unknown product")

    subscriber = await _rc_get_subscriber(user["id"])
    credited = 0
    if subscriber:
        non_subs = (subscriber.get("non_subscriptions") or {}).get(FREEZE_PACK_5_ID) or []
        # Each entry has 'id' (RC transaction id) and 'purchase_date'
        transaction_ids = [str(entry.get("id")) for entry in non_subs if entry.get("id")]
        credited = await _credit_freeze_pack(user["id"], transaction_ids)

    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "credited_packs": credited,
        "freezes_available": int((updated or {}).get("freezes_available", 0)),
        "credited": credited * FREEZE_PACK_5_QTY,
    }


@api.post("/iap/webhook")
async def iap_webhook(request: Request):
    """RevenueCat calls this on every purchase/renewal event.
    Auth: Bearer token matches REVENUECAT_WEBHOOK_TOKEN env var.
    """
    expected_token = os.environ.get("REVENUECAT_WEBHOOK_TOKEN", "").strip()
    if not expected_token:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    payload = await request.json()
    event = payload.get("event") or {}
    event_id = str(event.get("id") or "")
    app_user_id = str(event.get("app_user_id") or "")
    product_id = event.get("product_id")
    event_type = event.get("type")

    if not event_id or not app_user_id:
        return {"ok": True, "skipped": "no id"}

    # Credit first. The atomic transaction claim makes webhook retries safe and
    # prevents an event-log write from stranding a paid purchase after a failure.
    credited = 0
    if event_type in ("INITIAL_PURCHASE", "NON_RENEWING_PURCHASE") and product_id == FREEZE_PACK_5_ID:
        transaction_id = str(event.get("transaction_id") or event_id)
        credited = await _credit_freeze_pack(app_user_id, [transaction_id])

    await db.iap_events.update_one(
        {"event_id": event_id},
        {
            "$setOnInsert": {
                "event_id": event_id,
                "app_user_id": app_user_id,
                "type": event_type,
                "product_id": product_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    return {"ok": True, "credited": credited}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("total_wins")
    await db.game_events.create_index("user_id")
    await db.iap_events.create_index("event_id", unique=True)
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
