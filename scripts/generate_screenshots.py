"""Auto-capture App Store screenshots at all required iOS device sizes.

Runs headless Chromium against the live preview URL and saves PNGs.
Output: /app/frontend/appstore-assets/screenshots/{device}/{screen}.png

Apple screenshot requirements (portrait):
  iPhone 6.7"  1290x2796  (iPhone 15 Pro Max)
  iPhone 6.5"  1284x2778  (iPhone 14 Plus)
  iPhone 5.5"  1242x2208  (iPhone 8 Plus - required for older-device compatibility)
  iPad Pro 12.9" 2048x2732

Usage: python3 scripts/generate_screenshots.py
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get(
    "SCREENSHOT_BASE_URL",
    "https://childhood-games-5.preview.emergentagent.com",
)
OUT_DIR = Path("/app/frontend/appstore-assets/screenshots")

# Login credentials (see /app/memory/test_credentials.md)
LOGIN_EMAIL = "admin@rmc.com"
LOGIN_PASSWORD = "admin123"

DEVICES = [
    # name              width  height  scale
    ("iphone-6.7",       1290,  2796,  3),
    ("iphone-6.5",       1284,  2778,  3),
    ("iphone-5.5",       1242,  2208,  3),
    ("ipad-pro-12.9",    2048,  2732,  2),
]

# (path, screen_name, wait_for_selector, extra_action_fn)
SCREENS = [
    ("/",                  "01-hero",         "[data-testid='brand-logo']", None),
    ("/library",           "02-library",      "[data-testid='nav-library']", None),
    ("/leaderboard",       "03-leaderboard",  "[data-testid='nav-leaderboard']", None),
    ("/play/chess",        "04-chess",        None, None),
    ("/play/memory",       "05-memory",       None, None),
    ("/play/connect4",     "06-connect4",     None, None),
    ("/profile",           "07-profile",      "[data-testid='profile-chip']", None),
]


def login(page):
    """Log in so authenticated pages render properly."""
    page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(500)
    try:
        # try common selectors
        for sel_email in ["input[type='email']", "[data-testid='login-email']", "input[name='email']"]:
            if page.locator(sel_email).count():
                page.locator(sel_email).fill(LOGIN_EMAIL)
                break
        for sel_pw in ["input[type='password']", "[data-testid='login-password']", "input[name='password']"]:
            if page.locator(sel_pw).count():
                page.locator(sel_pw).fill(LOGIN_PASSWORD)
                break
        # submit
        for sel_btn in ["[data-testid='login-submit']", "button[type='submit']", "button:has-text('Log in')"]:
            if page.locator(sel_btn).count():
                page.locator(sel_btn).first.click()
                break
        page.wait_for_url(f"{BASE_URL}/", timeout=5000)
        page.wait_for_timeout(800)
        return True
    except Exception as e:
        print(f"  login flow failed (continuing as guest): {e}")
        return False


def capture(device_name: str, w: int, h: int, scale: int):
    device_dir = OUT_DIR / device_name
    device_dir.mkdir(parents=True, exist_ok=True)
    # Playwright viewport is CSS px. Divide by scale so the rendered pixel size = w x h.
    css_w, css_h = w // scale, h // scale
    print(f"\n=== {device_name} — CSS viewport {css_w}x{css_h} @ {scale}x (output {w}x{h}) ===")

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
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
            url = f"{BASE_URL}{path}"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(1200)  # let animations settle
                if wait_sel:
                    try:
                        page.wait_for_selector(wait_sel, timeout=5000)
                    except Exception:
                        pass
                if action:
                    try:
                        action(page)
                    except Exception as e:
                        print(f"  action for {name} failed: {e}")
                out = device_dir / f"{name}.png"
                page.screenshot(path=str(out), full_page=False, type="png")
                print(f"  {name}: {out}")
            except Exception as e:
                print(f"  {name}: FAILED - {e}")
        context.close()
        browser.close()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, w, h, scale in DEVICES:
        capture(name, w, h, scale)
    print("\n=== DONE ===")
    print(f"Screenshots in {OUT_DIR}")
    print("Upload the 3 best from each device folder to App Store Connect.")


if __name__ == "__main__":
    main()
