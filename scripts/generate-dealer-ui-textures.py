from pathlib import Path
import random

from PIL import Image, ImageDraw, ImageFilter


OUT = Path(__file__).resolve().parents[1] / "public" / "dealer-cards-2d" / "assets" / "textures"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(7122)


def noise_layer(size: int, scale: int, strength: int) -> Image.Image:
    side = max(4, size // scale)
    small = Image.new("L", (side, side))
    small.putdata([random.randint(128 - strength, 128 + strength) for _ in range(side * side)])
    return small.resize((size, size), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(scale / 3))


def colorize(base: Image.Image, tint: tuple[int, int, int], contrast: float) -> Image.Image:
    pixels = []
    for value in base.getdata():
        delta = (value - 128) * contrast
        pixels.append(tuple(max(0, min(255, int(channel + delta))) for channel in tint) + (255,))
    image = Image.new("RGBA", base.size)
    image.putdata(pixels)
    return image


def background() -> None:
    size = 1024
    coarse = noise_layer(size, 34, 24)
    fine = noise_layer(size, 5, 13)
    image = Image.blend(colorize(coarse, (31, 17, 13), .44), colorize(fine, (33, 18, 14), .2), .36)
    image.filter(ImageFilter.GaussianBlur(.6)).convert("RGB").save(OUT / "texture-background.webp", "WEBP", quality=82, method=6)


def leather_fine() -> None:
    size = 512
    coarse = noise_layer(size, 10, 21)
    fine = noise_layer(size, 2, 13)
    image = Image.blend(colorize(coarse, (31, 20, 16), .32), colorize(fine, (32, 21, 17), .18), .42)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(460):
        x, y = random.randrange(size), random.randrange(size)
        draw.point((x, y), fill=(180, 135, 82, random.randrange(2, 7)))
    image.filter(ImageFilter.GaussianBlur(.22)).convert("RGB").save(OUT / "texture-leather-fine.webp", "WEBP", quality=80, method=6)


def parchment_soft() -> None:
    size = 512
    coarse = noise_layer(size, 28, 22)
    fine = noise_layer(size, 4, 11)
    image = Image.blend(colorize(coarse, (218, 202, 163), .4), colorize(fine, (220, 204, 166), .18), .34)
    wash = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wash, "RGBA")
    for _ in range(12):
        x, y = random.randrange(size), random.randrange(size)
        rx, ry = random.randrange(35, 100), random.randrange(25, 80)
        draw.ellipse((x-rx, y-ry, x+rx, y+ry), fill=(105, 67, 39, random.randrange(2, 7)))
    image = Image.alpha_composite(image, wash.filter(ImageFilter.GaussianBlur(30)))
    image.convert("RGB").save(OUT / "texture-parchment-soft.webp", "WEBP", quality=83, method=6)


if __name__ == "__main__":
    background()
    leather_fine()
    parchment_soft()
    for path in sorted(OUT.glob("texture-*.webp")):
        print(f"{path.name}: {path.stat().st_size} bytes")
