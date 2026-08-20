import argparse
from pathlib import Path
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "public" / "frontier-beans"


def connected_background_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    seen = set()
    queue = deque()

    def looks_like_background(x: int, y: int) -> bool:
        r, g, b, _ = pixels[x, y]
        return min(r, g, b) >= 225 and max(r, g, b) - min(r, g, b) <= 18

    for x in range(width):
        if looks_like_background(x, 0): queue.append((x, 0))
        if looks_like_background(x, height - 1): queue.append((x, height - 1))
    for y in range(height):
        if looks_like_background(0, y): queue.append((0, y))
        if looks_like_background(width - 1, y): queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not looks_like_background(x, y):
            continue
        seen.add((x, y))
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))
    return rgba


def crop_trim(image: Image.Image, box: tuple[int, int, int, int], path: Path, padding: int = 6):
    cropped = image.crop(box)
    alpha = cropped.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError(f"empty crop: {path}")
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(cropped.width, right + padding)
    bottom = min(cropped.height, bottom + padding)
    cropped.crop((left, top, right, bottom)).save(path, optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split the 황혼의 콩시장 source atlas into optimized web assets.",
    )
    parser.add_argument("--atlas", type=Path, required=True, help="Source sprite atlas PNG")
    parser.add_argument("--background", type=Path, required=True, help="Source market background PNG")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output directory")
    return parser.parse_args()


def main():
    args = parse_args()
    atlas_path = args.atlas.expanduser().resolve()
    background_path = args.background.expanduser().resolve()
    out = args.out.expanduser().resolve()

    if not atlas_path.is_file():
        raise FileNotFoundError(f"atlas not found: {atlas_path}")
    if not background_path.is_file():
        raise FileNotFoundError(f"background not found: {background_path}")

    out.mkdir(parents=True, exist_ok=True)
    Image.open(background_path).convert("RGB").save(out / "market-dusk.png", optimize=True)
    atlas = connected_background_alpha(Image.open(atlas_path))

    farmer_centers = [154, 466, 770, 1081, 1375]
    for index, center in enumerate(farmer_centers, 1):
        crop_trim(atlas, (max(0, center - 145), 18, min(1536, center + 145), 462), out / f"farmer-{index}.png")

    bean_names = ["ruby", "midnight", "honey", "forest", "roast", "ivory", "azure", "copper"]
    bean_centers = [136, 337, 529, 721, 912, 1105, 1300, 1450]
    for name, center in zip(bean_names, bean_centers):
        crop_trim(atlas, (max(0, center - 95), 460, min(1536, center + 95), 690), out / f"bean-{name}.png", 3)

    prop_names = ["sack", "coin", "trade-sign", "card-back", "lantern"]
    prop_centers = [143, 449, 759, 1078, 1388]
    for name, center in zip(prop_names, prop_centers):
        crop_trim(atlas, (max(0, center - 145), 690, min(1536, center + 145), 1024), out / f"{name}.png")


if __name__ == "__main__":
    main()
