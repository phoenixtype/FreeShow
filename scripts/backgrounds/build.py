"""Builds the Scriptural backgrounds library for Media > Online > Scriptural.

Everything in it may be redistributed:
- sources.json: David Roberts' Holy Land drawings (1839) and photochrom prints
  (about 1895), public domain, from Wikimedia Commons.
- photos.json: sky, nature, creation and church photographs, CC0 or public
  domain (each file's licence checked on Commons), from Wikimedia Commons.
- footage.json: CC0 or public-domain film (NASA, the National Park Service, the
  BLM and others) from Wikimedia Commons, cut into seamless loops.
- loops/looks.py: motion loops, gradients and countdowns we render ourselves
  (loops/render.py), so they are ours outright.

Stills, posters and previews go to site/backgrounds/ and deploy with the site;
videos go to ~/.scriptural/backgrounds/video and upload.sh puts them on R2
(project-media.scriptural.online). library.json lists everything with its
categories; manifest.json stays as the image-only list that the first app
builds read.

    python3 scripts/backgrounds/loops/render.py render   (with its venv, see there)
    python3 scripts/backgrounds/build.py          (--list: fetch nothing, list what is here)
    scripts/backgrounds/upload.sh
"""

import io
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "site" / "backgrounds"
WORK = Path.home() / ".scriptural" / "backgrounds"
VIDEO = WORK / "video"
PUBLIC_URL = "https://project.scriptural.online/backgrounds"
MEDIA_URL = "https://project-media.scriptural.online"
USER_AGENT = "ScripturalProjectBackgrounds/1.0 (https://project.scriptural.online)"
LOOP_SECONDS = 20

sys.path.insert(0, str(HERE / "loops"))
from looks import COUNTDOWNS, LOOKS  # noqa: E402

CATEGORIES = [
    ("worship", "Worship"), ("cross", "The cross"), ("bible", "Bible"), ("prayer", "Prayer"), ("communion", "Communion"),
    ("baptism", "Baptism"), ("celebration", "Celebration"), ("advent", "Advent"), ("christmas", "Christmas"), ("lent", "Lent"),
    ("easter", "Easter"), ("pentecost", "Pentecost"), ("thanksgiving", "Thanksgiving"), ("spring", "Spring"), ("summer", "Summer"),
    ("fall", "Fall"), ("winter", "Winter"), ("gradients", "Gradients"), ("led", "LED wall"), ("countdowns", "Countdowns"),
    ("creation", "Creation"), ("nature", "Nature"), ("churches", "Churches"), ("holyland", "Holy Land"),
]
OURS = {"credit": "Scriptural", "license": "Made by Scriptural, free for any church to use"}


def get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def commons_name(source: str) -> str:
    return urllib.parse.unquote(source.split("/wiki/File:")[1])


def fetch_still(source: str) -> Image.Image:
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(commons_name(source)) + "?width=2560"
    return Image.open(io.BytesIO(get(url))).convert("RGB")


def crop_16_9(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width / height > 16 / 9:
        new_width = round(height * 16 / 9)
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))
    new_height = round(width * 9 / 16)
    top = (height - new_height) // 3  # a little above centre keeps skylines in
    return image.crop((0, top, width, top + new_height))


def save_still(picture: Image.Image, name: str):
    picture.resize((1920, 1080), Image.LANCZOS).save(OUT / f"{name}.webp", "WEBP", quality=82)
    picture.resize((480, 270), Image.LANCZOS).save(OUT / f"{name}-sm.webp", "WEBP", quality=75)


def video_source(source: str) -> tuple:
    """The best Commons transcode up to 1080p, and the film's length."""
    params = {"action": "query", "format": "json", "formatversion": "2", "titles": "File:" + commons_name(source), "prop": "videoinfo", "viprop": "derivatives|url|size"}
    info = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))["query"]["pages"][0]["videoinfo"][0]
    derivatives = [d for d in info.get("derivatives", []) if d.get("height") and d["height"] <= 1080 and "webm" in d.get("type", "")]
    best = max(derivatives, key=lambda d: d["height"], default=None)
    return (best["src"] if best else info["url"]), float(info.get("duration") or 0)


def cut_loop(source: str, target: Path):
    """Cuts a loop whose last second fades into its first, so it repeats without a jump."""
    url, duration = video_source(source)
    length = min(LOOP_SECONDS, max(duration - 1.5, 5))
    start = duration * .2 if duration > 3 * LOOP_SECONDS else max(0., min(.2, duration - length - 1))
    graph = (f"[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p,split[a][b];"
             f"[a]trim=start=1:end={length + 1},setpts=PTS-STARTPTS[main];[b]trim=start=0:end=1,setpts=PTS-STARTPTS[head];"
             f"[main][head]xfade=transition=fade:duration=1:offset={length - 1}[v]")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-user_agent", USER_AGENT, "-ss", f"{start:.2f}", "-t", f"{length + 1.2:.2f}", "-i", url,
           "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-maxrate", "8M", "-bufsize", "16M",
           "-movflags", "+faststart", str(target)]
    subprocess.run(cmd, check=True, timeout=900)


def poster_from(video: Path, name: str):
    frame = WORK / "poster.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", str(video), "-frames:v", "1", str(frame)], check=True)
    save_still(Image.open(frame).convert("RGB"), f"{name}-poster")


def still_item(item: dict, name: str, **extra) -> dict:
    return {**item, **extra, "type": "image", "url": f"{PUBLIC_URL}/{name}.webp", "preview": f"{PUBLIC_URL}/{name}-sm.webp"}


def video_item(item: dict, **extra) -> dict:
    name = item["id"]
    return {**item, **extra, "type": "video", "url": f"{MEDIA_URL}/{name}.mp4", "poster": f"{PUBLIC_URL}/{name}-poster.webp", "preview": f"{PUBLIC_URL}/{name}-poster-sm.webp"}


def main() -> int:
    fetch = "--list" not in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    VIDEO.mkdir(parents=True, exist_ok=True)
    items, failed = [], []

    for item in json.loads((HERE / "sources.json").read_text()):
        try:
            if not (OUT / f"{item['id']}.webp").exists():
                if not fetch:
                    raise FileNotFoundError("not fetched")
                save_still(crop_16_9(fetch_still(item["source"])), item["id"])
                time.sleep(1)  # be gentle with Wikimedia
            items.append(still_item(item, item["id"], categories=["holyland"], license="Public domain"))
        except Exception as error:  # one bad scan should not stop the pack
            failed.append(f"{item['id']}: {error}")

    for item in json.loads((HERE / "photos.json").read_text()):
        try:
            if not (OUT / f"{item['id']}.webp").exists():
                if not fetch:
                    raise FileNotFoundError("not fetched")
                save_still(crop_16_9(fetch_still(item["source"])), item["id"])
                time.sleep(1)
            items.append(still_item(item, item["id"]))
        except Exception as error:
            failed.append(f"{item['id']}: {error}")

    for item in json.loads((HERE / "footage.json").read_text()):
        target = VIDEO / f"{item['id']}.mp4"
        try:
            if not target.exists():
                if not fetch:
                    raise FileNotFoundError("not cut")
                cut_loop(item["source"], target)
            if not (OUT / f"{item['id']}-poster.webp").exists():
                if not fetch:
                    raise FileNotFoundError("no poster yet")
                poster_from(target, item["id"])
            items.append(video_item(item))
        except Exception as error:
            if fetch:
                target.unlink(missing_ok=True)
            failed.append(f"{item['id']}: {error}")

    for look in LOOKS:
        entry = {"id": look["id"], "label": look["label"], "categories": look["categories"], **OURS}
        if look.get("type") == "image":
            if (OUT / f"{look['id']}.webp").exists():
                items.append(still_item(entry, look["id"]))
            else:
                failed.append(f"{look['id']}: not rendered")
        elif (VIDEO / f"{look['id']}.mp4").exists() and (OUT / f"{look['id']}-poster.webp").exists():
            items.append(video_item(entry))
        else:
            failed.append(f"{look['id']}: not rendered")
    for c in COUNTDOWNS:
        entry = {"id": c["id"], "label": c["label"], "categories": c["categories"], **OURS}
        if (VIDEO / f"{c['id']}.mp4").exists() and (OUT / f"{c['id']}-poster.webp").exists():
            items.append(video_item(entry))
        else:
            failed.append(f"{c['id']}: not rendered")

    # "All" opens on our own motion loops, then our stills, film, photographs and the Holy Land
    def rank(item):
        ours = item.get("credit") == "Scriptural"
        return (0 if ours and item["type"] == "video" else 1 if ours else 2 if item["type"] == "video" else 4 if "holyland" in item["categories"] else 3)
    items.sort(key=rank)

    used = {c for item in items for c in item["categories"]}
    categories = [{"id": key, "label": label} for key, label in CATEGORIES if key in used]
    unknown = used - {key for key, _ in CATEGORIES}
    if unknown:
        failed.append(f"categories with no label: {sorted(unknown)}")
    (OUT / "library.json").write_text(json.dumps({"version": 2, "categories": categories, "items": items}, indent=1, ensure_ascii=False))

    # The first app builds read manifest.json and treat every item as a picture.
    legacy = [{**i, "region": i.get("region", i["categories"][0])} for i in items if i["type"] == "image"]
    (OUT / "manifest.json").write_text(json.dumps({"name": "Scriptural", "items": legacy}, indent=1, ensure_ascii=False))

    videos = sum(1 for i in items if i["type"] == "video")
    print(f"{len(items)} backgrounds ({len(items) - videos} pictures, {videos} videos), {len(failed)} failed")
    for line in failed:
        print("  " + line)
    return 1 if not items else 0


if __name__ == "__main__":
    sys.exit(main())
