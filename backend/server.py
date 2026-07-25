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

GAME_IDS = {"memory", "snakes", "connect4", "checkers", "rps", "crazy8"}
GAME_META = {
    "memory": {"name": "Memory Match", "score_dir": "asc"},   # lower moves better
    "snakes": {"name": "Snakes & Ladders", "score_dir": "desc"},
    "connect4": {"name": "Connect Four", "score_dir": "desc"},
    "checkers": {"name": "Checkers", "score_dir": "desc"},
    "rps": {"name": "Rock Paper Scissors", "score_dir": "desc"},
    "crazy8": {"name": "Crazy Eights", "score_dir": "desc"},
}

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
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "stats": stats,
            "total_wins": total_wins,
            "total_plays": total_plays,
        }},
    )
    # append lightweight history for potential future features
    await db.game_events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "game_id": gid,
        "won": body.won,
        "score": body.score,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(updated)}


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
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
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
