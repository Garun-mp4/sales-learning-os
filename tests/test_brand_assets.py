#!/usr/bin/env python3
"""Check derived brand assets and their Astro/Python static-site integration."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--site", default="dist", help="Built site directory to inspect")
args = parser.parse_args()
SITE = Path(args.site)
if not SITE.is_absolute():
    SITE = ROOT / SITE
SITE = SITE.resolve()
if SITE == ROOT or not SITE.is_relative_to(ROOT):
    raise SystemExit(f"Site directory must be inside the project: {SITE}")

brand_root = ROOT / "public/assets/brand"
fonts_root = ROOT / "public/assets/fonts"
logo_source = ROOT / "Sales OS Stepped Logo.png"
icon_source = ROOT / "faviicon.png"
assert logo_source.is_file() and icon_source.is_file(), "Keep both supplied originals in the project root"

required_sizes = {
    "favicon-light.png": (32, 32),
    "favicon-dark.png": (32, 32),
    "mark-light.png": (512, 512),
    "mark-dark.png": (512, 512),
    "app-icon-192.png": (192, 192),
    "app-icon-512.png": (512, 512),
    "app-icon-512-maskable.png": (512, 512),
}
images = {}
for name, dimensions in required_sizes.items():
    path = brand_root / name
    assert path.is_file(), f"Missing generated brand image: {path}"
    image = Image.open(path).convert("RGBA")
    assert image.size == dimensions, f"Unexpected dimensions for {name}: {image.size}"
    images[name] = image

logo_light = Image.open(brand_root / "logo-light.png").convert("RGBA")
logo_dark = Image.open(brand_root / "logo-dark.png").convert("RGBA")
assert logo_light.size == logo_dark.size
assert ImageChops.difference(logo_light.getchannel("A"), logo_dark.getchannel("A")).getbbox() is None
assert logo_light.getchannel("A").getbbox() is not None
assert logo_light.width / logo_light.height > 1.7, "The transparent margins should be trimmed without changing the logo ratio"
assert images["app-icon-512-maskable.png"].getpixel((0, 0)) == (0, 0, 0, 255)

for name in ("Geist-Variable.woff2", "GeistMono-Variable.woff2"):
    path = fonts_root / name
    assert path.is_file(), f"Missing locally bundled font: {name}"
    content = path.read_bytes()
    assert content[:4] == b"wOF2", f"{name} is not a WOFF2 font"
    assert 10_000 < len(content) < 100_000, f"Unexpected font size for {name}: {len(content)}"
license_text = (fonts_root / "LICENSE.txt").read_text(encoding="utf-8")
assert "SIL OPEN FONT LICENSE" in license_text
css = (ROOT / "src/styles/app.css").read_text(encoding="utf-8")
assert 'font-family: Geist;' in css and 'font-family: "Geist Mono";' in css
assert "/assets/fonts/Geist-Variable.woff2" in css
assert "/assets/fonts/GeistMono-Variable.woff2" in css
assert "fonts.googleapis.com" not in css and "fonts.gstatic.com" not in css

manifest = json.loads((SITE / "manifest.webmanifest").read_text(encoding="utf-8"))
assert {icon["sizes"] for icon in manifest["icons"]} >= {"192x192", "512x512"}
assert any(icon.get("purpose") == "maskable" for icon in manifest["icons"])
for icon in manifest["icons"]:
    assert (SITE / icon["src"]).is_file(), f"Broken PWA icon: {icon['src']}"
assert not (SITE / "assets/favicon.svg").exists(), "The old S/ SVG favicon must not be published"

offline = json.loads((SITE / "assets/offline-files.json").read_text(encoding="utf-8"))
cached = set(offline["urls"])
for path in [*sorted((SITE / "assets/brand").glob("*.png")), *sorted((SITE / "assets/fonts").iterdir())]:
    relative = path.relative_to(SITE).as_posix()
    assert relative in cached, f"Offline manifest omits a brand resource: {relative}"

index = BeautifulSoup((SITE / "index.html").read_text(encoding="utf-8"), "html.parser")
icons = index.select('link[rel="icon"]')
assert len(icons) == 2 and {link.get("media") for link in icons} == {
    "(prefers-color-scheme: light)",
    "(prefers-color-scheme: dark)",
}
assert index.select_one('.brand-lockup img.brand-logo-light')
assert index.select_one('.brand-lockup img.brand-logo-dark')
assert index.select_one('.brand-compact img.brand-symbol-light')
assert not (SITE / "legacy-index.html").exists(), "The retained prototype must stay outside published builds"

content = json.loads((ROOT / "src/generated/content-manifest.json").read_text(encoding="utf-8"))
practices = [entry for entry in content["entries"].values() if entry["kind"] == "practice"]
for entry in practices:
    path = SITE / "practice" / entry["id"] / "index.html"
    assert path.is_file(), f"Missing practice route: {entry['id']}"
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for table in soup.select(".article table"):
        wrapper = table.parent
        assert wrapper and "table-wrap" in wrapper.get("class", []), f"Unwrapped practice table: {entry['id']}"
        assert wrapper.get("tabindex") == "0" and wrapper.get("role") == "group"
        assert "горизонтальную прокрутку" in wrapper.get("aria-label", "")

print(
    f"PASS: source-derived light/dark logos, {len(required_sizes)} icon assets, "
    f"local Geist fonts, PWA/offline references and {len(practices)} practice routes ({SITE.name})"
)
