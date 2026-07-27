"""Record a ~20 second App Preview video (1080x1920, portrait) walking through key screens.

Apple App Preview requirements:
  Format: .mov (H.264/HEVC) or .mp4
  Resolution: 1080x1920 (portrait) for iPhone 6.5"/6.7"
  Duration: 15-30 seconds
  No black bars, native mobile UI look

Pipeline:
  1. Playwright records webm at 1080x1920 while driving the app
  2. ffmpeg trims to 20s and re-encodes to H.264 mp4 (App-Store-uploadable)

Output: /app/frontend/appstore-assets/app-preview.mp4
Usage:  python3 scripts/generate_video.py
"""
from __future__ import annotations
import os
import shutil
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get(
    "SCREENSHOT_BASE_URL",
    "https://childhood-games-5.preview.emergentagent.com",
)
OUT_DIR = Path("/app/frontend/appstore-assets")
TMP_DIR = OUT_DIR / "_video_tmp"
FINAL_MP4 = OUT_DIR / "app-preview.mp4"

LOGIN_EMAIL = "admin@rmc.com"
LOGIN_PASSWORD = "admin123"

# iPhone-scale CSS viewport; ffmpeg will upscale to 1080x1920 at the end.
CSS_W, CSS_H = 390, 844


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    try:
        for sel in ["input[type='email']", "[data-testid='login-email']"]:
            if page.locator(sel).count():
                page.locator(sel).fill(LOGIN_EMAIL)
                break
        for sel in ["input[type='password']", "[data-testid='login-password']"]:
            if page.locator(sel).count():
                page.locator(sel).fill(LOGIN_PASSWORD)
                break
        for sel in ["[data-testid='login-submit']", "button[type='submit']"]:
            if page.locator(sel).count():
                page.locator(sel).first.click()
                break
        page.wait_for_url(f"{BASE_URL}/", timeout=5000)
        page.wait_for_timeout(400)
    except Exception as e:
        print(f"login skipped: {e}")


def scroll_slow(page, distance=400, ms=1500):
    """Smooth scroll for cinematic effect."""
    steps = 30
    for i in range(steps):
        page.evaluate(f"window.scrollBy(0, {distance / steps})")
        page.wait_for_timeout(ms // steps)


def record():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if TMP_DIR.exists():
        shutil.rmtree(TMP_DIR)
    TMP_DIR.mkdir(parents=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            headless=True,
        )
        context = browser.new_context(
            viewport={"width": CSS_W, "height": CSS_H},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
            record_video_dir=str(TMP_DIR),
            record_video_size={"width": CSS_W, "height": CSS_H},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = context.new_page()

        # Pre-login (not recorded in main timeline - Playwright records this too, we'll trim later)
        login(page)

        # === Video timeline (~22s to give ffmpeg room to trim to 20s) ===

        # Scene 1: HERO (4s)
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        # Scene 2: LIBRARY scroll (5s)
        page.goto(f"{BASE_URL}/library", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        scroll_slow(page, distance=500, ms=2000)
        page.wait_for_timeout(1000)

        # Scene 3: CHESS quick view (4s)
        page.goto(f"{BASE_URL}/play/chess", wait_until="domcontentloaded")
        page.wait_for_timeout(3800)

        # Scene 4: MEMORY MATCH board (3s)
        page.goto(f"{BASE_URL}/play/memory", wait_until="domcontentloaded")
        page.wait_for_timeout(2800)

        # Scene 5: LEADERBOARD (3s)
        page.goto(f"{BASE_URL}/leaderboard", wait_until="domcontentloaded")
        page.wait_for_timeout(2800)

        # Scene 6: HERO return (2s)
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        context.close()
        browser.close()

    # Find the recorded webm
    webms = list(TMP_DIR.glob("*.webm"))
    if not webms:
        raise RuntimeError("No webm recording produced")
    raw = webms[0]
    print(f"Raw recording: {raw} ({raw.stat().st_size / 1024 / 1024:.1f} MB)")

    # Trim first 2s (login page) + take next 20s, re-encode to H.264 mp4
    cmd = [
        "ffmpeg", "-y",
        "-ss", "2",             # skip first 2 seconds (login screen)
        "-i", str(raw),
        "-t", "20",             # 20-second clip
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "22",
        "-pix_fmt", "yuv420p",  # App Store compatible
        "-vf", "scale=-2:1920:flags=lanczos,pad=1080:1920:(ow-iw)/2:0:black,setsar=1",
        "-r", "30",             # 30 fps
        "-movflags", "+faststart",
        "-an",                  # no audio (App Previews may be silent)
        str(FINAL_MP4),
    ]
    print(f"\n$ {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("FFMPEG STDERR:", result.stderr[-1500:])
        raise RuntimeError("ffmpeg failed")

    shutil.rmtree(TMP_DIR, ignore_errors=True)
    size_mb = FINAL_MP4.stat().st_size / 1024 / 1024
    print(f"\nApp Preview video: {FINAL_MP4} ({size_mb:.1f} MB)")
    print("Duration: 20s · Resolution: 1080x1920 · H.264 · yuv420p · 30fps · Silent")
    print("Upload directly to App Store Connect → App Previews (iPhone 6.5\"/6.7\")")


if __name__ == "__main__":
    record()
