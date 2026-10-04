"""Regenerate Expo app icons with safe padding so ZODA stays fully visible."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "image.png"
SIZE = 1024
ICON_SCALE = 0.72
ADAPTIVE_SCALE = 0.58

APP_ASSETS = [
    ROOT / "customer-app" / "assets",
    ROOT / "seller-app" / "assets",
]


def make_padded_icon(source: Path, out_path: Path, scale: float) -> None:
    src = Image.open(source).convert("RGBA")
    target = int(SIZE * scale)
    fitted = src.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    x = (SIZE - fitted.width) // 2
    y = (SIZE - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source logo: {SOURCE}")

    for assets_dir in APP_ASSETS:
        assets_dir.mkdir(parents=True, exist_ok=True)
        make_padded_icon(SOURCE, assets_dir / "icon.png", ICON_SCALE)
        make_padded_icon(SOURCE, assets_dir / "adaptive-icon.png", ADAPTIVE_SCALE)
        print(f"Updated icons in {assets_dir}")


if __name__ == "__main__":
    main()
