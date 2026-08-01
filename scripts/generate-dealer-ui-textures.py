from pathlib import Path
import math
import random

from PIL import Image, ImageDraw, ImageFilter


SIZE = 512
OUT = Path(__file__).resolve().parents[1] / "public" / "dealer-cards-2d" / "assets" / "textures"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(7122)


def noise_layer(scale: int, strength: int) -> Image.Image:
    side = max(4, SIZE // scale)
    small = Image.new("L", (side, side))
    small.putdata([random.randint(128 - strength, 128 + strength) for _ in range(side * side)])
    return small.resize((SIZE, SIZE), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(scale / 3))


def colorize(base, tint, contrast=1.0):
    pixels = []
    for value in base.getdata():
        delta = (value - 128) * contrast
        pixels.append(tuple(max(0, min(255, int(channel + delta))) for channel in tint) + (255,))
    image = Image.new("RGBA", base.size)
    image.putdata(pixels)
    return image


def wood():
    coarse = noise_layer(18, 42)
    fine = noise_layer(4, 20)
    image = colorize(coarse, (45, 24, 18), 0.7)
    fine_rgba = colorize(fine, (48, 25, 18), 0.35)
    image = Image.blend(image, fine_rgba, 0.38)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(72):
        y = random.randrange(SIZE)
        amp = random.uniform(1.0, 4.5)
        period = random.uniform(55, 150)
        points = [(x, y + math.sin(x / period * math.tau) * amp) for x in range(-10, SIZE + 11, 8)]
        tone = random.choice([(116, 70, 39, 20), (10, 4, 3, 30), (184, 122, 63, 11)])
        draw.line(points, fill=tone, width=random.choice([1, 1, 2]))
    for x in (0, 256):
        draw.line((x, 0, x, SIZE), fill=(7, 3, 2, 34), width=2)
        draw.line((x + 2, 0, x + 2, SIZE), fill=(175, 111, 57, 10), width=1)
    image.filter(ImageFilter.GaussianBlur(0.35)).convert("RGB").save(OUT / "texture-wood.webp", "WEBP", quality=82, method=6)


def leather():
    coarse = noise_layer(9, 34)
    fine = noise_layer(2, 24)
    image = colorize(coarse, (31, 20, 16), 0.48)
    image = Image.blend(image, colorize(fine, (32, 21, 17), 0.25), 0.42)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(620):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        radius = random.choice([1, 1, 2, 3])
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=(190, 144, 90, 9), fill=(0, 0, 0, 6))
    image.filter(ImageFilter.GaussianBlur(0.25)).convert("RGB").save(OUT / "texture-leather.webp", "WEBP", quality=80, method=6)


def parchment():
    coarse = noise_layer(24, 36)
    fine = noise_layer(3, 18)
    image = colorize(coarse, (214, 195, 151), 0.6)
    image = Image.blend(image, colorize(fine, (216, 198, 155), 0.28), 0.35)
    stain = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(stain, "RGBA")
    for _ in range(24):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        rx, ry = random.randrange(28, 105), random.randrange(20, 85)
        draw.ellipse((x-rx, y-ry, x+rx, y+ry), fill=(117, 72, 35, random.randrange(3, 11)))
    stain = stain.filter(ImageFilter.GaussianBlur(24))
    image = Image.alpha_composite(image, stain)
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(180):
        x, y = random.randrange(SIZE), random.randrange(SIZE)
        draw.point((x, y), fill=(83, 49, 26, random.randrange(5, 18)))
    image.convert("RGB").save(OUT / "texture-parchment.webp", "WEBP", quality=83, method=6)


if __name__ == "__main__":
    wood()
    leather()
    parchment()
    for path in sorted(OUT.glob("texture-*.webp")):
        print(f"{path.name}: {path.stat().st_size} bytes")
