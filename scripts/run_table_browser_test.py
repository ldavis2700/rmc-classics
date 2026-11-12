"""Run the production browser bundle against a real API and disposable local DB.

Only a loopback MongoDB test server is accepted. This script creates a fresh
database, supplies an isolated signing secret, and drops only that database.
No production credentials, store calls or external application are used.
"""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener
import uuid

from pymongo import MongoClient
from pymongo.uri_parser import parse_uri

ROOT = Path(__file__).resolve().parents[1]


def main():
    mongo_url = os.environ.get("RMC_TEST_MONGO_URL", "")
    if not mongo_url.startswith("mongodb://"):
        raise SystemExit("Supply RMC_TEST_MONGO_URL for a disposable loopback MongoDB server")
    hosts = parse_uri(mongo_url)["nodelist"]
    if not hosts or any(host not in {"127.0.0.1", "localhost", "::1"} for host, _ in hosts):
        raise SystemExit("Refusing non-loopback MongoDB; this runner is test-only")
    if not (ROOT / "frontend/build/index.html").is_file():
        raise SystemExit("Build frontend first with REACT_APP_BACKEND_URL unset")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db_name = "rmc_browser_test_" + uuid.uuid4().hex
    assert db_name not in client.list_database_names()
    # Synthetic pre-existing records must survive API startup and game activity.
    preserved = {
        "users": {"_id": "preserve-user", "id": "preserve-user",
                  "email": "release-preservation@example.com", "password_hash": "fixture-only",
                  "xp": 500, "total_wins": 12, "freezes_available": 7,
                  "stats": {"dominoes": {"plays": 8, "wins": 3}}},
        "game_events": {"_id": "preserve-progress", "user_id": "preserve-user", "score": 3},
        "iap_events": {"_id": "preserve-purchase", "event_id": "preserve-purchase",
                       "user_id": "preserve-user", "product_id": "rmc.freeze.pack5"},
    }
    for collection, record in preserved.items():
        client[db_name][collection].insert_one(record)
    # Reserve a loopback port and pass the bound socket to uvicorn; no port race.
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    process = None
    with tempfile.TemporaryDirectory(prefix="rmc-browser-") as temp:
        server_file = Path(temp) / "server.py"
        server_file.write_text('''import os, sys
from pathlib import Path
import uvicorn
sys.path.insert(0, os.environ["RMC_TEST_SOURCE_ROOT"])
from backend.server import app
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse
from starlette.exceptions import HTTPException
build = Path(os.environ["RMC_TEST_SOURCE_ROOT"]) / "frontend/build"
class SPA(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or path.startswith("api/"):
                raise
            return FileResponse(build / "index.html")
app.mount("/", SPA(directory=build, html=True))
uvicorn.run(app, fd=int(os.environ["RMC_TEST_LISTENER"]), log_level="warning")
''')
        # Do not inherit payment credentials or production API/DB settings.
        env = {key: value for key, value in os.environ.items()
               if not any(part in key.upper() for part in
                          ("REVENUECAT", "JWT", "MONGO", "DB_NAME", "BACKEND_URL", "ADMIN_"))}
        env.update(MONGO_URL=mongo_url, DB_NAME=db_name,
                   JWT_SECRET=secrets.token_urlsafe(48),
                   PYTHON_DOTENV_DISABLED="1",
                   RMC_TEST_SOURCE_ROOT=str(ROOT), RMC_TEST_LISTENER=str(listener.fileno()),
                   RMC_BROWSER_TEST_URL=f"http://127.0.0.1:{port}")
        try:
            process = subprocess.Popen([sys.executable, str(server_file)], env=env,
                                       cwd=ROOT, pass_fds=(listener.fileno(),))
            listener.close()
            opener = build_opener(ProxyHandler({}))
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError("Disposable API stopped before browser test")
                try:
                    with opener.open(env["RMC_BROWSER_TEST_URL"], timeout=0.5) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Disposable API did not become ready")
            subprocess.run(["node", "scripts/verify-table-browser.cjs"], cwd=ROOT,
                           env=env, check=True, timeout=300)
            for collection, record in preserved.items():
                assert client[db_name][collection].find_one({"_id": record["_id"]}) == record
            print("PASS: existing account, progress and purchase records preserved", flush=True)
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            listener.close()
            client.drop_database(db_name)
            assert db_name not in client.list_database_names()
            client.close()
            print("PASS: disposable browser database removed; production data untouched", flush=True)


if __name__ == "__main__":
    main()
