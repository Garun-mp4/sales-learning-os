#!/usr/bin/env python3
"""Build size- and theme-specific Sales OS marks from the supplied originals."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/brand"
LOGO_SOURCE = ROOT / "Sales OS Stepped Logo.png"
ICON_SOURCE = ROOT / "faviicon.png"


def save_png(image: Image.Image, name: str) -> None:
    target = ASSETS / name
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True, compress_level=9)


def recolor(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    output = Image.new("RGBA", image.size, (*color, 0))
    output.putalpha(image.getchannel("A"))
    return output


def square_icon(
    source: Image.Image,
    size: int,
    color: tuple[int, int, int],
    background: tuple[int, int, int, int] = (0, 0, 0, 0),
    scale: float = 0.86,
) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background)
    mark = recolor(source, color)
    bound = round(size * scale)
    mark.thumbnail((bound, bound), Image.Resampling.LANCZOS)
    canvas.alpha_composite(
        mark,
        ((size - mark.width) // 2, (size - mark.height) // 2),
    )
    return canvas


def main() -> None:
    if not LOGO_SOURCE.is_file() or not ICON_SOURCE.is_file():
        raise SystemExit(
            "Brand sources are missing: expected the two supplied PNG files in the project root."
        )

    logo = Image.open(LOGO_SOURCE).convert("RGBA")
    bounds = logo.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit("The supplied Sales OS logo is fully transparent.")

    cropped = logo.crop(bounds)
    padding = max(12, round(max(cropped.size) * 0.018))
    padded = Image.new(
        "RGBA", (cropped.width + padding * 2, cropped.height + padding * 2)
    )
    padded.alpha_composite(cropped, (padding, padding))
    save_png(padded, "logo-light.png")
    save_png(recolor(padded, (250, 250, 250)), "logo-dark.png")

    icon = Image.open(ICON_SOURCE).convert("RGBA")
    black = (0, 0, 0)
    white = (250, 250, 250)
    save_png(square_icon(icon, 512, black), "mark-light.png")
    save_png(square_icon(icon, 512, white), "mark-dark.png")
    save_png(square_icon(icon, 32, black, scale=0.88), "favicon-light.png")
    save_png(square_icon(icon, 32, white, scale=0.88), "favicon-dark.png")
    save_png(
        square_icon(icon, 192, black, (255, 255, 255, 255), scale=0.74),
        "app-icon-192.png",
    )
    save_png(
        square_icon(icon, 512, black, (255, 255, 255, 255), scale=0.74),
        "app-icon-512.png",
    )
    save_png(
        square_icon(icon, 512, white, (0, 0, 0, 255), scale=0.56),
        "app-icon-512-maskable.png",
    )
    print("PASS: generated light/dark brand, favicon and PWA assets from the originals")


if __name__ == "__main__":
    main()
