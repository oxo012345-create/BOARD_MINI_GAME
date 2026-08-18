from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import UnityPy


def load_single_monobehaviour(path: Path) -> dict:
    env = UnityPy.load(str(path))
    objects = [obj for obj in env.objects if obj.type.name == "MonoBehaviour"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one MonoBehaviour in {path}, got {len(objects)}")
    return objects[0].read_typetree()


def localized_values(table: dict) -> dict[int, str]:
    result: dict[int, str] = {}
    for entry in table.get("m_TableData", []):
        result[int(entry["m_Id"])] = entry.get("m_Localized", "")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    shared_path = args.assets_dir / "localization-assets-shared_assets_all.bundle"
    english_path = args.assets_dir / "localization-string-tables-english(en)_assets_all.bundle"
    korean_path = args.assets_dir / "localization-string-tables-korean(ko)_assets_all.bundle"

    shared = load_single_monobehaviour(shared_path)
    english = localized_values(load_single_monobehaviour(english_path))
    korean = localized_values(load_single_monobehaviour(korean_path))

    rows = []
    for entry in shared.get("m_Entries", []):
        entry_id = int(entry["m_Id"])
        rows.append(
            {
                "id": entry_id,
                "key": entry.get("m_Key", ""),
                "english": english.get(entry_id, ""),
                "korean": korean.get(entry_id, ""),
            }
        )
    rows.sort(key=lambda row: row["key"].casefold())

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "localization.json"
    csv_path = args.output_dir / "localization.csv"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["id", "key", "english", "korean"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"rows={len(rows)}")
    print(json_path)
    print(csv_path)


if __name__ == "__main__":
    main()
