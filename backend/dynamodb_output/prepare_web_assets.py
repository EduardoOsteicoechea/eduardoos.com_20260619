"""Create browser-friendly, deterministic assets from the DynamoDB JSONL export."""

import hashlib
import json
import os
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "institutes_latin_sections.dynamodb.jsonl"
ASSETS = ROOT / "website_assets"


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == data:
        print(f"[assets] unchanged {path.relative_to(ROOT)}")
        return False
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=path.parent, prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        temporary.write(data)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)
    print(f"[assets] wrote {path.relative_to(ROOT)}")
    return True


def flat_item(item):
    values = item["Item"]
    return {
        "id": values["sk"]["S"].replace("section#", "section-"),
        "order": int(values["order"]["N"]),
        "volume": int(values["volume"]["N"]),
        "book": values.get("book", {}).get("S"),
        "heading": values["heading"]["S"],
        "text": values["text"]["S"],
    }


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    ASSETS.mkdir(exist_ok=True)
    sections = []
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    with SOURCE.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                sections.append(flat_item(json.loads(line)))

    index = {
        "schemaVersion": 1,
        "sourceSha256": source_hash,
        "sectionCount": len(sections),
        "sections": [
            {
                "id": section["id"],
                "order": section["order"],
                "volume": section["volume"],
                "book": section["book"],
                "heading": section["heading"],
                "url": f"sections/{section['order']:04d}.json",
            }
            for section in sections
        ],
    }
    atomic_write(
        ASSETS / "index.json",
        (json.dumps(index, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    for section in sections:
        atomic_write(
            ASSETS / "sections" / f"{section['order']:04d}.json",
            (json.dumps(section, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        )
    print(f"[assets] complete: {len(sections)} sections")


if __name__ == "__main__":
    main()
