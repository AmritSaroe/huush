from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
INK = (23, 23, 22, 255)
PAPER = (252, 250, 245, 255)
TRANSPARENT = (0, 0, 0, 0)


def cubic(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
    )


def open_book_points(size):
    scale = size / 24

    def point(x, y):
        return (x * scale, y * scale)

    def curve(start, control_a, control_b, end):
        return [point(*cubic(start, control_a, control_b, end, step / 16)) for step in range(17)]

    left = curve((4.5, 5.5), (7.3, 4.7), (9.7, 5.2), (12, 7))
    left += [point(12, 20)]
    left += curve((12, 20), (9.7, 18.2), (7.3, 16.2), (4.5, 18.5))[1:]
    left += [point(4.5, 5.5)]

    right = curve((19.5, 5.5), (16.7, 4.7), (14.3, 5.2), (12, 7))
    right += [point(12, 20)]
    right += curve((12, 20), (14.3, 18.2), (16.7, 16.2), (19.5, 18.5))[1:]
    right += [point(19.5, 5.5)]
    center = [point(12, 7), point(12, 20)]
    return left, right, center


def draw_open_book(draw, size, origin=(0, 0), stroke=None):
    stroke = stroke or max(1, round(size * 0.022))
    left, right, center = open_book_points(size)
    ox, oy = origin
    for points in (left, right, center):
        shifted = [(x + ox, y + oy) for x, y in points]
        draw.line(shifted, fill=INK, width=stroke, joint="curve")


def draw_mark(size, transparent=False):
    image = Image.new("RGBA", (size, size), TRANSPARENT if transparent else INK)
    draw = ImageDraw.Draw(image)
    inset = round(size * 0.18)
    radius = round(size * 0.13)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=radius, fill=PAPER)
    book_size = size * 0.56
    book_origin = ((size - book_size) / 2, (size - book_size) / 2)
    draw_open_book(draw, book_size, book_origin, max(1, round(size * 0.022)))
    return image


for density, size in SIZES.items():
    folder = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    draw_mark(size, transparent=False).save(folder / "ic_launcher.png")
    draw_mark(size, transparent=False).save(folder / "ic_launcher_round.png")
    draw_mark(size, transparent=True).save(folder / "ic_launcher_foreground.png")

print("Generated Huush open-book launcher fallbacks:", ", ".join(f"{k}={v}px" for k, v in SIZES.items()))
