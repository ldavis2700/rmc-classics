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

GAME_IDS = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8", "chess", "uno", "ludo"}
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
    {"id": "play-3", "title": "Warm Up", "desc": "Play any 3 games today", "game_id": None, "type": "plays", "goal": 3},
    {"id": "win-2", "title": "Double Down", "desc": "Win any 2 games today", "game_id": None, "type": "wins", "goal": 2},
]


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

    # XP
    xp_gain = XP_PLAY + (XP_WIN if body.won else 0)

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
    if matches and not daily.get("claimed") and int(daily.get("progress", 0)) >= int(challenge["goal"]):
        daily["claimed"] = True
        xp_gain += XP_DAILY_BONUS
        challenge_completed = True

    new_xp = int(user.get("xp", 0)) + xp_gain

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "stats": stats,
            "total_wins": total_wins,
            "total_plays": total_plays,
            "xp": new_xp,
            "daily": daily,
        }},
    )
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
    return {
        "challenge": ch,
        "progress": int(daily.get("progress", 0)),
        "claimed": bool(daily.get("claimed", False)),
        "xp_reward": XP_DAILY_BONUS,
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
