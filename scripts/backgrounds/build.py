"""Builds the Scriptural backgrounds pack for projection.

Each picture in sources.json (David Roberts' Holy Land drawings, 1839, and
Library of Congress photochrom prints, about 1895, all public domain or CC0)
is fetched from Wikimedia Commons, cropped to 16:9 and saved at 1920 x 1080,
with a 480 x 270 preview, into site/backgrounds/ beside a manifest.json the
app reads. The images are not committed; run this before deploying the site.

    python3 scripts/backgrounds/build.py
"""

import io
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path(__file__).with_name("sources.json")
OUT = ROOT / "site" / "backgrounds"
PUBLIC_URL = "https://project.scriptural.online/backgrounds"
USER_AGENT = "ScripturalProjectBackgrounds/1.0 (https://project.scriptural.online)"


def fetch(source: str) -> Image.Image:
    name = urllib.parse.unquote(source.split("/wiki/File:")[1])
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name) + "?width=2560"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return Image.open(io.BytesIO(response.read())).convert("RGB")


def crop_16_9(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width / height > 16 / 9:
        new_width = round(height * 16 / 9)
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))
    new_height = round(width * 9 / 16)
    top = (height - new_height) // 3  # a little above centre keeps skylines in
    return image.crop((0, top, width, top + new_height))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest, failed = [], []
    for item in json.loads(SOURCES.read_text()):
        target = OUT / f"{item['id']}.webp"
        try:
            if not target.exists():
                picture = crop_16_9(fetch(item["source"]))
                picture.resize((1920, 1080), Image.LANCZOS).save(target, "WEBP", quality=82)
                picture.resize((480, 270), Image.LANCZOS).save(OUT / f"{item['id']}-sm.webp", "WEBP", quality=75)
                time.sleep(1)  # be gentle with Wikimedia
            manifest.append({**item, "url": f"{PUBLIC_URL}/{item['id']}.webp", "preview": f"{PUBLIC_URL}/{item['id']}-sm.webp", "license": "Public domain"})
        except Exception as error:  # one bad scan should not stop the pack
            failed.append(f"{item['id']}: {error}")
    (OUT / "manifest.json").write_text(json.dumps({"name": "Holy Land", "items": manifest}, indent=1))
    print(f"{len(manifest)} backgrounds, {len(failed)} failed")
    for line in failed:
        print("  " + line)
    return 1 if not manifest else 0


if __name__ == "__main__":
    sys.exit(main())
