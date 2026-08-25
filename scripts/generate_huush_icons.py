from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
INK = (23, 23, 22, 255)
PAPER = (252, 250, 245, 255)
TRANSPARENT = (0, 0, 0, 0)


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
    )


def wave_points(size, y, amplitude):
    left = size * 0.22
    right = size * 0.78
    points = []
    segments = [
        ((left, y), (size * 0.30, y - amplitude), (size * 0.37, y + amplitude), (size * 0.44, y)),
        ((size * 0.44, y), (size * 0.51, y - amplitude), (size * 0.58, y + amplitude), (size * 0.65, y)),
        ((size * 0.65, y), (size * 0.72, y - amplitude), (size * 0.76, y + amplitude * 0.7), (right, y)),
    ]
    for segment in segments:
        for step in range(13):
            if points and step == 0:
                continue
            points.append(bezier(*segment, step / 12))
    return points


def draw_mark(size, transparent=False):
    image = Image.new("RGBA", (size, size), TRANSPARENT if transparent else INK)
    draw = ImageDraw.Draw(image)
    inset = round(size * 0.18)
    radius = round(size * 0.13)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=radius, fill=PAPER)
    stroke = max(1, round(size * 0.022))
    amplitude = size * 0.065
    for y_ratio in (0.38, 0.50, 0.62):
        points = wave_points(size, size * y_ratio, amplitude)
        draw.line(points, fill=INK, width=stroke, joint="curve")
    return image


for density, size in SIZES.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    draw_mark(size, transparent=False).save(folder / "ic_launcher.png")
    draw_mark(size, transparent=False).save(folder / "ic_launcher_round.png")
    draw_mark(size, transparent=True).save(folder / "ic_launcher_foreground.png")

print("Generated Huush launcher fallbacks:", ", ".join(f"{k}={v}px" for k, v in SIZES.items()))
