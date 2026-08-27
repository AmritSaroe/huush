from pathlib import Path

from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "assets" / "images"
OUTPUT_SIZES = {
    "icon.png": 512,
    "splash-icon.png": 512,
    "favicon.png": 256,
    "android-icon-foreground.png": 512,
}


def optimize(name: str, size: int) -> None:
    path = ASSETS / name
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        rgb.thumbnail((size, size), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (size, size), "#F6F1E8")
        x = (size - rgb.width) // 2
        y = (size - rgb.height) // 2
        canvas.paste(rgb, (x, y))
        canvas.save(path, format="PNG", optimize=True, compress_level=9)


for filename, dimension in OUTPUT_SIZES.items():
    optimize(filename, dimension)
    print(f"optimized {filename} at {dimension}px")
