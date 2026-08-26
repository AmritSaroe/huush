from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
INK = (27, 26, 24, 255)
PAPER = (252, 250, 245, 255)
TRANSPARENT = (0, 0, 0, 0)

# Normalized 305×328 silhouette traced from the approved Quiet Editorial identity board.
OUTER = [
    (0.00, 0.98), (0.00, 328.00), (41.10, 326.03), (70.23, 320.95),
    (96.30, 311.93), (114.38, 299.87), (122.38, 287.90), (124.44, 278.88),
    (126.42, 208.61), (128.41, 206.64), (138.47, 209.67), (151.51, 217.63),
    (171.56, 207.62), (176.59, 206.64), (178.58, 208.61), (181.63, 284.87),
    (185.59, 293.89), (196.65, 304.96), (215.71, 314.96), (243.77, 323.00),
    (274.88, 327.02), (305.00, 328.00), (305.00, 0.98), (267.87, 0.98),
    (229.74, 7.05), (203.66, 18.04), (185.59, 34.11), (179.57, 45.10),
    (176.59, 56.17), (176.59, 200.57), (153.49, 213.69), (131.46, 203.61),
    (128.41, 200.57), (128.41, 56.17), (125.43, 45.10), (119.41, 34.11),
    (101.34, 18.04), (75.26, 7.05), (37.13, 0.98),
]

LINE_CURVES = [
    ((34.08, 122.34), (58.18, 116.36), (84.26, 119.39), (108.35, 130.38)),
    ((34.08, 144.40), (58.18, 138.42), (84.26, 141.45), (108.35, 152.44)),
    ((34.08, 166.54), (58.18, 160.47), (84.26, 163.51), (108.35, 174.50)),
    ((34.08, 188.60), (58.18, 182.53), (84.26, 185.57), (108.35, 196.64)),
]
COMPACT_LINE_CURVES = [LINE_CURVES[0], LINE_CURVES[3]]


def cubic(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
    )


def mark_geometry(canvas_size):
    symbol_width = canvas_size * 0.52
    symbol_height = symbol_width * 328 / 305
    origin_x = (canvas_size - symbol_width) / 2
    origin_y = (canvas_size - symbol_height) / 2

    def convert(point):
        return (origin_x + point[0] / 305 * symbol_width, origin_y + point[1] / 328 * symbol_height)

    outer = [convert(point) for point in OUTER]
    lines = []
    for curve in COMPACT_LINE_CURVES:
        left = [cubic(*curve, step / 20) for step in range(21)]
        right = [(305 - x, y) for x, y in left]
        lines.extend([[convert(point) for point in left], [convert(point) for point in right]])
    return outer, lines, max(1, round(canvas_size * 0.018))


def draw_mark(size, transparent=False):
    supersample = 4
    canvas_size = size * supersample
    image = Image.new("RGBA", (canvas_size, canvas_size), TRANSPARENT if transparent else PAPER)
    draw = ImageDraw.Draw(image)
    outer, lines, stroke = mark_geometry(canvas_size)
    draw.polygon(outer, fill=INK)
    for points in lines:
        draw.line(points, fill=PAPER, width=stroke, joint="curve")
    return image.resize((size, size), Image.Resampling.LANCZOS)


for density, size in SIZES.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    draw_mark(size, transparent=False).save(folder / "ic_launcher.png")
    draw_mark(size, transparent=False).save(folder / "ic_launcher_round.png")
    draw_mark(size, transparent=True).save(folder / "ic_launcher_foreground.png")

print("Generated coded Quiet Editorial butterfly/book/H launcher fallbacks:", ", ".join(f"{k}={v}px" for k, v in SIZES.items()))
