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
            "_src_name": src_path.name,
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

    # Strip internal fields before writing to HTML
    items_clean = []
    for item in all_items:
        items_clean.append({k: v for k, v in item.items() if not k.startswith('_')})

    items_json = json.dumps(items_clean, indent=2, ensure_ascii=False)

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


# --- Content editor ---

def build_editor(image_items):
    """Generate content-editor.html for visual metadata editing."""
    if not image_items:
        return

    # Collect existing metadata
    editor_items = []
    for item in image_items:
        editor_items.append({
            "src_name": item.get("_src_name", ""),
            "thumb": item["thumb"],
            "title": item.get("title", ""),
            "description": item.get("description", ""),
            "link": item.get("link", ""),
            "link_text": item.get("link_text", ""),
        })

    editor_json = json.dumps(editor_items, indent=2, ensure_ascii=False)

    editor_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>fragments — content editor</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500&family=DM+Mono:wght@300;400&display=swap');
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: #fafafa; color: #222; font-family: 'Space Grotesk', sans-serif; padding: 40px; }}
h1 {{ font-size: 18px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }}
.subtitle {{ font-family: 'DM Mono', monospace; font-size: 13px; color: #999; margin-bottom: 40px; }}
.item {{ display: flex; gap: 24px; margin-bottom: 32px; padding: 20px; background: #fff; border: 1px solid #eee; border-radius: 4px; }}
.item img {{ width: 160px; height: auto; object-fit: contain; flex-shrink: 0; background: #f5f5f5; }}
.item-fields {{ flex: 1; display: flex; flex-direction: column; gap: 10px; }}
.item-fields label {{ font-family: 'DM Mono', monospace; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }}
.item-fields input, .item-fields textarea {{
  font-family: 'DM Mono', monospace; font-size: 14px; padding: 8px 10px;
  border: 1px solid #ddd; border-radius: 3px; background: #fafafa;
  transition: border-color 0.2s;
}}
.item-fields input:focus, .item-fields textarea:focus {{ outline: none; border-color: #999; background: #fff; }}
.item-fields textarea {{ resize: vertical; min-height: 60px; }}
.filename {{ font-family: 'DM Mono', monospace; font-size: 11px; color: #bbb; }}
.actions {{ position: sticky; top: 0; background: #fafafa; padding: 16px 0; z-index: 10; display: flex; gap: 16px; align-items: center; border-bottom: 1px solid #eee; margin-bottom: 24px; }}
.btn {{ font-family: 'DM Mono', monospace; font-size: 14px; padding: 10px 24px; border: 1px solid #333; background: #333; color: #fff; cursor: pointer; border-radius: 3px; transition: all 0.2s; }}
.btn:hover {{ background: #000; }}
.btn-secondary {{ background: #fff; color: #333; }}
.btn-secondary:hover {{ background: #f0f0f0; }}
.status {{ font-family: 'DM Mono', monospace; font-size: 13px; color: #999; }}
.changed {{ border-left: 3px solid #e8a838; }}
</style>
</head>
<body>
<h1>fragments — content editor</h1>
<p class="subtitle">Edit metadata for images. Click "Download JSONs" to save files into src/ alongside images.</p>

<div class="actions">
  <button class="btn" onclick="downloadAll()">Download JSONs</button>
  <button class="btn btn-secondary" onclick="downloadZip()">Download as ZIP</button>
  <span class="status" id="status"></span>
</div>

<div id="editor"></div>

<script>
const items = {editor_json};

const editor = document.getElementById('editor');

items.forEach((item, i) => {{
  const div = document.createElement('div');
  div.className = 'item';
  div.dataset.index = i;
  div.innerHTML = `
    <img src="${{item.thumb}}" alt="${{item.src_name}}">
    <div class="item-fields">
      <span class="filename">${{item.src_name}}</span>
      <label>Title</label>
      <input type="text" data-field="title" value="${{escAttr(item.title)}}" placeholder="Work title (optional)">
      <label>Description</label>
      <textarea data-field="description" placeholder="Short description, series info (optional)">${{item.description}}</textarea>
      <label>Link</label>
      <input type="text" data-field="link" value="${{escAttr(item.link)}}" placeholder="https://kremenskii.art/... (optional)">
      <label>Link text</label>
      <input type="text" data-field="link_text" value="${{escAttr(item.link_text)}}" placeholder="View on kremenskii.art">
    </div>
  `;
  editor.appendChild(div);

  // Mark changed
  div.querySelectorAll('input, textarea').forEach(el => {{
    el.addEventListener('input', () => {{ div.classList.add('changed'); }});
  }});
}});

function escAttr(s) {{ return (s || '').replace(/"/g, '&quot;'); }}

function getItemData(i) {{
  const div = editor.querySelector(`[data-index="${{i}}"]`);
  if (!div) return null;
  const data = {{}};
  const title = div.querySelector('[data-field="title"]').value.trim();
  const desc = div.querySelector('[data-field="description"]').value.trim();
  const link = div.querySelector('[data-field="link"]').value.trim();
  const linkText = div.querySelector('[data-field="link_text"]').value.trim();
  if (title) data.title = title;
  if (desc) data.description = desc;
  if (link) data.link = link;
  if (linkText) data.link_text = linkText;
  return data;
}}

function downloadAll() {{
  let count = 0;
  items.forEach((item, i) => {{
    const data = getItemData(i);
    if (!data || Object.keys(data).length === 0) return;
    const name = item.src_name.replace(/\\.[^.]+$/, '') + '.json';
    const blob = new Blob([JSON.stringify(data, null, 2)], {{ type: 'application/json' }});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    count++;
  }});
  document.getElementById('status').textContent = count > 0 ? `Downloaded ${{count}} JSON file(s). Place them in src/ and re-run build.py` : 'No metadata to save';
}}

async function downloadZip() {{
  // Simple approach: download individual files since we don't have a zip library
  downloadAll();
}}
</script>
</body>
</html>"""

    editor_path = Path("content-editor.html")
    editor_path.write_text(editor_html, encoding="utf-8")
    print(f"  Generated {editor_path}")


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
    build_editor(image_items)

    print(f"\n  Done. {len(all_items)} items total. Ready to commit & push.\n")


if __name__ == "__main__":
    main()
