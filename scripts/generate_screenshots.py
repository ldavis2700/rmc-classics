"""Capture browser reference images for release review, not signed-device evidence.

Requires SCREENSHOT_BASE_URL, SCREENSHOT_LOGIN_EMAIL, SCREENSHOT_LOGIN_PASSWORD,
and SCREENSHOT_OUT_DIR (a new directory). Use an authorized test account.
A successful run is not App Store submission approval.
"""
from __future__ import annotations
import os
import shutil
from pathlib import Path

import hashlib
import json
from urllib.parse import urlsplit

BASE_URL = None
OUT_DIR = None
LOGIN_EMAIL = None
LOGIN_PASSWORD = None


def configure(env):
    """Fail before browser/network activity if explicit inputs are missing."""
    global BASE_URL, OUT_DIR, LOGIN_EMAIL, LOGIN_PASSWORD
    names = ("SCREENSHOT_BASE_URL", "SCREENSHOT_LOGIN_EMAIL",
             "SCREENSHOT_LOGIN_PASSWORD", "SCREENSHOT_OUT_DIR")
    if any(not env.get(name, "").strip() for name in names):
        raise ValueError("Set all four SCREENSHOT_* inputs; use an authorized test account.")
    url = env["SCREENSHOT_BASE_URL"].rstrip("/")
    parsed = urlsplit(url)
    if (parsed.scheme not in ("https", "http") or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path or
            (parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"))):
        raise ValueError("Use an HTTPS origin, or HTTP localhost, without credentials or paths.")
    out = Path(env["SCREENSHOT_OUT_DIR"])
    if out.exists():
        raise ValueError("Choose a new output directory; existing captures are never overwritten.")
    BASE_URL, OUT_DIR = url, out
    LOGIN_EMAIL, LOGIN_PASSWORD = env["SCREENSHOT_LOGIN_EMAIL"], env["SCREENSHOT_LOGIN_PASSWORD"]


DEVICES = [
    # name              width  height  scale
    ("iphone-6.7",       1290,  2796,  3),
    ("iphone-6.5",       1284,  2778,  3),
    ("iphone-5.5",       1242,  2208,  3),
    ("ipad-pro-12.9",    2048,  2732,  2),
]

# (path, screen_name, wait_for_selector, extra_action_fn)
SCREENS = [
    ("/",                  "01-hero",         "[data-testid='hero-tag']", None),
    ("/library",           "02-library",      "[data-testid='game-card-chess']", None),
    ("/leaderboard",       "03-leaderboard",  "[data-testid='leaderboard-list']", None),
    ("/play/chess", "04-chess", "[data-testid='chess-board']", None),
    ("/play/memory", "05-memory", "[data-testid='memory-board']", None),
    ("/play/connect4", "06-connect4", "[data-testid='c4-board']", None),
    ("/profile",           "07-profile",      "[data-testid='profile-name']", None),
]


def navigate(page, path):
    """Reject redirects before filling credentials or accepting a capture."""
    target = f"{BASE_URL}{path}"
    response = page.goto(target, wait_until="domcontentloaded", timeout=20000)
    expected, actual = urlsplit(target), urlsplit(page.url)
    if (response is None or not response.ok
            or (actual.scheme, actual.netloc, actual.path) !=
               (expected.scheme, expected.netloc, expected.path)):
        raise RuntimeError("Capture navigation did not reach the expected origin and route")


def login(page):
    """Require successful login; never substitute guest images."""
    navigate(page, "/login")
    page.locator("input[type='email']").fill(LOGIN_EMAIL)
    page.locator("input[type='password']").fill(LOGIN_PASSWORD)
    page.locator("[data-testid='login-terms-checkbox']").check()
    page.locator("[data-testid='login-submit']").click()
    page.wait_for_url(f"{BASE_URL}/", timeout=15000)



def capture(device_name: str, w: int, h: int, scale: int):
    device_dir = OUT_DIR / device_name
    device_dir.mkdir(parents=True, exist_ok=True)
    # Playwright viewport is CSS px. Divide by scale so the rendered pixel size = w x h.
    css_w, css_h = w // scale, h // scale
    print(f"\n=== {device_name} — CSS viewport {css_w}x{css_h} @ {scale}x (output {w}x{h}) ===")

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        # Prefer an installed Chromium; otherwise use Playwright's managed browser.
        executable = shutil.which("google-chrome") or shutil.which("chromium")
        browser = p.chromium.launch(executable_path=executable, headless=True)
        context = browser.new_context(
            viewport={"width": css_w, "height": css_h},
            device_scale_factor=scale,
            is_mobile=(device_name.startswith("iphone")),
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = context.new_page()
        # Warm up + login
        login(page)
        for path, name, wait_sel, action in SCREENS:
            navigate(page, path)
            page.wait_for_timeout(1200)
            if wait_sel:
                page.wait_for_selector(wait_sel, timeout=5000)
            if action:
                action(page)
            out = device_dir / f"{name}.png"
            page.screenshot(path=str(out), full_page=False, type="png")
            print(f"  {name}: captured browser reference")
        context.close()
        browser.close()


def main():
    configure(os.environ)
    OUT_DIR.mkdir(parents=True, exist_ok=False)
    for name, w, h, scale in DEVICES:
        capture(name, w, h, scale)
    print("\n=== DONE ===")
    print(f"Screenshots in {OUT_DIR}")
    files = {str(p.relative_to(OUT_DIR)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(OUT_DIR.rglob("*.png"))}
    (OUT_DIR / "capture-receipt.json").write_text(json.dumps({
        "capture_type": "chromium_browser_reference",
        "base_url": BASE_URL,
        "signed_device_verified": False,
        "resubmission_ready": False,
        "files_sha256": files,
    }, indent=2) + "\n")
    print("Browser references only. Verify the exact signed candidate and Apple requirements separately.")


if __name__ == "__main__":
    main()
