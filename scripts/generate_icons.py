"""Generate the full App Store + PWA icon set from logo.svg.

Outputs:
  frontend/public/icons/icon-{size}.png       - PWA + home screen icons (rounded)
  frontend/appstore-assets/icon-appstore-1024.png  - App Store marketing (no rounded, no alpha)
  frontend/appstore-assets/AppIcon.appiconset/*    - Xcode-compatible AppIcon set
  frontend/appstore-assets/icon-android-*.png      - Google Play + Android launcher

Requires: pip install cairosvg pillow
"""
from __future__ import annotations
import io
import json
import os
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path("/app/frontend")
LOGO_SVG = ROOT / "public" / "logo.svg"

# The stock logo already has a rounded rect background — great for PWA.
# For App Store we need a SQUARE version (no rounded corners, no alpha).
APPSTORE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#221E42"/>
      <stop offset="100%" stop-color="#0B0A1A"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="88" y="88" width="140" height="140" rx="14" fill="#FF479A"/>
  <rect x="284" y="88" width="140" height="140" rx="14" fill="#00F0FF"/>
  <rect x="88" y="284" width="140" height="140" rx="14" fill="#FFD100"/>
  <rect x="284" y="284" width="140" height="140" rx="14" fill="#39FF14"/>
  <text x="256" y="290" text-anchor="middle" font-family="Verdana, sans-serif"
        font-weight="900" font-size="180" fill="#0B0A1A" opacity="0.85">R</text>
</svg>
"""

def render_svg(svg_text: str, size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"),
                                 output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def flatten_to_rgb(img: Image.Image, bg=(11, 10, 26)) -> Image.Image:
    """Flatten alpha onto solid background - required by Apple (no alpha channel)."""
    if img.mode == "RGBA":
        canvas = Image.new("RGB", img.size, bg)
        canvas.paste(img, mask=img.split()[3])
        return canvas
    return img.convert("RGB")


def main():
    # Pre-rendered high-res masters
    logo_svg = LOGO_SVG.read_text()

    # ------------------------------------------------------------------
    # 1) PWA / Home-screen icons (rounded, with alpha)
    # ------------------------------------------------------------------
    pwa_dir = ROOT / "public" / "icons"
    pwa_dir.mkdir(parents=True, exist_ok=True)
    pwa_sizes = [72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512]
    for s in pwa_sizes:
        img = render_svg(logo_svg, s)
        img.save(pwa_dir / f"icon-{s}.png", optimize=True)
    print(f"PWA icons: {len(pwa_sizes)} sizes in {pwa_dir}")

    # Favicons
    favicon = render_svg(logo_svg, 64)
    favicon.save(ROOT / "public" / "favicon-64.png", optimize=True)
    favicon32 = render_svg(logo_svg, 32)
    favicon32.save(ROOT / "public" / "favicon-32.png", optimize=True)

    # ------------------------------------------------------------------
    # 2) App Store marketing icon (1024x1024, NO alpha, NO rounded corners)
    # ------------------------------------------------------------------
    appstore_dir = ROOT / "appstore-assets"
    appstore_dir.mkdir(parents=True, exist_ok=True)
    appstore_master = flatten_to_rgb(render_svg(APPSTORE_SVG, 1024))
    appstore_master.save(appstore_dir / "icon-appstore-1024.png",
                         optimize=True, format="PNG")
    print(f"App Store icon: {appstore_dir}/icon-appstore-1024.png (1024x1024, RGB)")

    # ------------------------------------------------------------------
    # 3) Full iOS AppIcon.appiconset for Xcode
    # ------------------------------------------------------------------
    ios_dir = appstore_dir / "AppIcon.appiconset"
    ios_dir.mkdir(parents=True, exist_ok=True)

    ios_specs = [
        # (filename, size, idiom, scale)
        ("Icon-20@2x.png", 40, "iphone", "2x"),
        ("Icon-20@3x.png", 60, "iphone", "3x"),
        ("Icon-29@2x.png", 58, "iphone", "2x"),
        ("Icon-29@3x.png", 87, "iphone", "3x"),
        ("Icon-40@2x.png", 80, "iphone", "2x"),
        ("Icon-40@3x.png", 120, "iphone", "3x"),
        ("Icon-60@2x.png", 120, "iphone", "2x"),
        ("Icon-60@3x.png", 180, "iphone", "3x"),
        ("Icon-20-ipad.png", 20, "ipad", "1x"),
        ("Icon-20-ipad@2x.png", 40, "ipad", "2x"),
        ("Icon-29-ipad.png", 29, "ipad", "1x"),
        ("Icon-29-ipad@2x.png", 58, "ipad", "2x"),
        ("Icon-40-ipad.png", 40, "ipad", "1x"),
        ("Icon-40-ipad@2x.png", 80, "ipad", "2x"),
        ("Icon-76.png", 76, "ipad", "1x"),
        ("Icon-76@2x.png", 152, "ipad", "2x"),
        ("Icon-83.5@2x.png", 167, "ipad", "2x"),
        ("Icon-marketing.png", 1024, "ios-marketing", "1x"),
    ]
    contents_images = []
    for filename, size, idiom, scale in ios_specs:
        img = flatten_to_rgb(render_svg(APPSTORE_SVG, size))
        img.save(ios_dir / filename, optimize=True, format="PNG")
        # Convert size back to pt for Contents.json
        pt_size = size / int(scale.replace("x", ""))
        if pt_size == int(pt_size):
            pt = f"{int(pt_size)}x{int(pt_size)}"
        else:
            pt = f"{pt_size}x{pt_size}"
        contents_images.append({
            "size": pt,
            "idiom": idiom,
            "filename": filename,
            "scale": scale,
        })

    contents = {
        "images": contents_images,
        "info": {"version": 1, "author": "xcode"},
    }
    (ios_dir / "Contents.json").write_text(json.dumps(contents, indent=2))
    print(f"Xcode AppIcon.appiconset: {len(ios_specs)} icons + Contents.json")

    # ------------------------------------------------------------------
    # 4) Android launcher icons (all densities)
    # ------------------------------------------------------------------
    android_dir = appstore_dir / "android"
    android_dir.mkdir(parents=True, exist_ok=True)
    android_specs = [
        ("mdpi", 48),
        ("hdpi", 72),
        ("xhdpi", 96),
        ("xxhdpi", 144),
        ("xxxhdpi", 192),
        ("playstore", 512),
    ]
    for name, size in android_specs:
        img = render_svg(logo_svg, size)   # keep rounded for Android
        img.save(android_dir / f"ic_launcher-{name}.png", optimize=True)
    print(f"Android launcher icons: {len(android_specs)} densities")

    print("\n=== DONE ===")
    print(f"App Store submission icon: {appstore_dir}/icon-appstore-1024.png")
    print(f"Xcode drop-in: {ios_dir}/")
    print(f"Android drop-in: {android_dir}/")
    print(f"PWA served: /app/frontend/public/icons/")


if __name__ == "__main__":
    main()
