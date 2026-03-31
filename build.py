#!/usr/bin/env python3
"""
build.py — Static site generator for fragments.

Usage:
    1. Drop images (.jpg/.png) and text files (.txt) into src/
    2. Optionally add .json metadata files alongside images:
       e.g. charcoal_01.jpg + charcoal_01.json
    3. Run: python build.py
    4. git add . && git commit && git push

JSON metadata format:
    {
        "title": "Work title",
        "description": "Short description or series info",
        "link": "https://kremenskii.art/series",
        "link_text": "View series"
    }

All fields optional. Images without JSON just show as images.
Text .txt files become text blocks in the grid.
Everything is shuffled deterministically (seed = file count).
"""

import json
import hashlib
import random
import re
import sys
from pathlib import Path

try:
    from PIL import Image
    from PIL import ImageOps
except ImportError:
    print("Pillow is required: pip install Pillow")
    sys.exit(1)

import config


# --- Paths ---

SRC_DIR = Path(config.SRC_DIR)
THUMB_DIR = Path(config.THUMB_DIR)
FULL_DIR = Path(config.FULL_DIR)
OUTPUT_HTML = Path(config.OUTPUT_HTML)
TEMPLATES_DIR = Path("templates")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
TEXT_EXTENSIONS = {".txt"}


# --- Helpers ---

def make_short_id(name):
    """Generate short ID like 'a3-1832' from filename."""
    digits = re.findall(r'\d{3,}', name)
    num_part = digits[0][-4:] if digits else name[:4]
    h = hashlib.md5(name.encode()).hexdigest()[:2]
    return f"{h}-{num_part}"


def resize_image(img, long_edge):
    """Resize so longest edge equals long_edge."""
    w, h = img.size
    if max(w, h) <= long_edge:
        return img.copy()
    if w >= h:
        new_w, new_h = long_edge, int(h * (long_edge / w))
    else:
        new_h, new_w = long_edge, int(w * (long_edge / h))
    return img.resize((new_w, new_h), Image.LANCZOS)


def load_metadata(src_path):
    """Load optional .json metadata file alongside an image."""
    json_path = src_path.with_suffix('.json')
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"  Warning: could not read {json_path}: {e}")
    return {}


def escape_html(text):
    """Escape HTML special characters."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


# --- Processing ---

def process_images():
    """Process all image files from src/."""
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    FULL_DIR.mkdir(parents=True, exist_ok=True)

    image_items = []

    for src_path in sorted(SRC_DIR.iterdir()):
        if src_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        name = src_path.stem
        item_id = make_short_id(name)
        print(f"  [img] {src_path.name} → {item_id}")

        img = Image.open(src_path)

        # Auto-rotate based on EXIF
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        if img.mode != "RGB":
            img = img.convert("RGB")

        # Thumbnail
        thumb = resize_image(img, config.THUMB_LONG_EDGE)
        thumb.save(THUMB_DIR / f"{name}.jpg", "JPEG",
                   quality=config.THUMB_QUALITY, optimize=True)

        # Full size
        full = resize_image(img, config.FULL_LONG_EDGE)
        full.save(FULL_DIR / f"{name}.jpg", "JPEG",
                  quality=config.FULL_QUALITY, optimize=True)

        # Load optional metadata
        meta = load_metadata(src_path)

        item = {
            "type": "image",
            "id": item_id,
            "thumb": f"photos/thumb/{name}.jpg",
            "full": f"photos/full/{name}.jpg",
        }

        # Add optional fields
        if meta.get("title"):
            item["title"] = meta["title"]
        if meta.get("description"):
            item["description"] = meta["description"]
        if meta.get("link"):
            item["link"] = meta["link"]
            item["link_text"] = meta.get("link_text", "View on kremenskii.art")

        image_items.append(item)

    return image_items


def process_texts():
    """Process all .txt files from src/."""
    text_items = []

    for src_path in sorted(SRC_DIR.iterdir()):
        if src_path.suffix.lower() not in TEXT_EXTENSIONS:
            continue

        content = src_path.read_text(encoding="utf-8").strip()
        if not content:
            continue

        item_id = make_short_id(src_path.stem)
        print(f"  [txt] {src_path.name} → {item_id}")

        text_items.append({
            "type": "text",
            "id": item_id,
            "text": escape_html(content),
        })

    return text_items


def shuffle_items(all_items):
    """Deterministic shuffle: seed = number of files."""
    rng = random.Random(len(all_items))
    rng.shuffle(all_items)
    return all_items


# --- HTML assembly ---

def build_html(all_items):
    """Read templates, substitute placeholders, write index.html."""
    template = (TEMPLATES_DIR / "base.html").read_text(encoding="utf-8")
    css = (TEMPLATES_DIR / "style.css").read_text(encoding="utf-8")
    js = (TEMPLATES_DIR / "script.js").read_text(encoding="utf-8")

    items_json = json.dumps(all_items, indent=2, ensure_ascii=False)

    html = template
    html = html.replace("{{CSS}}", css)
    html = html.replace("{{JS}}", js)
    html = html.replace("{{ITEMS_JSON}}", items_json)
    html = html.replace("{{SITE_TITLE}}", config.SITE_TITLE)
    html = html.replace("{{SITE_SUBTITLE}}", config.SITE_SUBTITLE)
    html = html.replace("{{SITE_EMAIL}}", config.SITE_EMAIL)
    html = html.replace("{{SITE_AUTHOR}}", config.SITE_AUTHOR)

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"  Generated {OUTPUT_HTML}")


# --- Main ---

def main():
    print(f"\n  Building {config.SITE_TITLE}...\n")

    if not SRC_DIR.exists():
        SRC_DIR.mkdir()
        print(f"  Created {SRC_DIR}/ — drop your files there and re-run.\n")
        sys.exit(0)

    image_items = process_images()
    text_items = process_texts()
    all_items = image_items + text_items

    print(f"\n  {len(image_items)} images, {len(text_items)} text blocks")

    if not all_items:
        print("  No content found in src/. Add .jpg/.png/.txt files.")
        sys.exit(1)

    all_items = shuffle_items(all_items)
    print(f"  Shuffled with seed={len(all_items)}")

    build_html(all_items)

    print(f"\n  Done. {len(all_items)} items total. Ready to commit & push.\n")


if __name__ == "__main__":
    main()
