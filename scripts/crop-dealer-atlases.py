"""Crop generated dealer item atlases into production WebP card assets."""

from pathlib import Path
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "dealer-items-real"
OUT.mkdir(parents=True, exist_ok=True)

ATLAS_DIR = Path(r"C:\Users\oxo01\.codex\generated_images\019fb566-907c-7313-a7ce-52586ff75a64")
ATLASES = [
    (ATLAS_DIR / "exec-e3e49ce2-84ec-49cf-8497-6c240d4065df.png", 4, 2, list(range(0, 8))),
    (ATLAS_DIR / "exec-292cfad2-9fe8-4fa5-8db4-5eaf34598dad.png", 4, 2, list(range(8, 16))),
    (ATLAS_DIR / "exec-8fa593f5-77ce-4387-ad84-2ceb36718421.png", 4, 2, list(range(16, 24))),
    (ATLAS_DIR / "exec-2772523d-9602-44a6-afbb-c082a5c7faac.png", 3, 2, list(range(24, 29))),
]

SLUGS = [
    "golden-cross", "golden-egg", "coffee-mug", "gold-medal", "silver-medal", "m1-helmet",
    "antique-vase", "retro-monitor", "guitar", "rocket-launcher", "model-ship", "old-chest",
    "flower-pot", "charcoal-iron", "cithara", "crown", "ea-nasir-copper", "golden-key",
    "folding-fan", "geiger-counter", "hour-glass", "katana", "sword", "sealed-scroll",
    "pistol", "chariot-wheel", "roman-sandals", "viking-helmet", "vintage-typewriter",
]


def crop_cell(image: Image.Image, columns: int, rows: int, position: int) -> Image.Image:
    cell_w = image.width / columns
    cell_h = image.height / rows
    column = position % columns
    row = position // columns
    box = (
        round(column * cell_w),
        round(row * cell_h),
        round((column + 1) * cell_w),
        round((row + 1) * cell_h),
    )
    return image.crop(box)


for atlas_path, columns, rows, item_ids in ATLASES:
    atlas = Image.open(atlas_path).convert("RGB")
    for position, item_id in enumerate(item_ids):
        cell = crop_cell(atlas, columns, rows, position)
        cell = ImageOps.fit(cell, (640, 640), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        out = OUT / f"{item_id:02d}-{SLUGS[item_id]}.webp"
        cell.save(out, "WEBP", quality=90, method=6)
        print(out.name)

print(f"Created {len(SLUGS)} item assets in {OUT}")
