"""Renders Scriptural's motion loops and gradient stills from the shaders here.

Every loop is periodic in time, so its last frame meets its first and it plays
forever without a jump. Looks are listed in looks.py.

    ~/.scriptural/backgrounds-venv/bin/python scripts/backgrounds/loops/render.py preview [ids...]
    ~/.scriptural/backgrounds-venv/bin/python scripts/backgrounds/loops/render.py render [ids...]

The venv needs moderngl, numpy and pillow. Videos land in ~/.scriptural/backgrounds/video
(uploaded to R2), stills and posters in site/backgrounds (deployed with the site).
"""

import subprocess
import sys
from pathlib import Path

import moderngl
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from looks import LOOKS, COUNTDOWNS  # noqa: E402

WORK = Path.home() / ".scriptural" / "backgrounds"  # outside the repo: npm start wipes build/
VIDEO_OUT = WORK / "video"
STILL_OUT = ROOT / "site" / "backgrounds"
PREVIEW_OUT = WORK / "preview"
FPS, SECONDS = 30, 15
FONT = WORK / "Inter.ttf"

MAIN = """
void main() {
    vec2 uv = gl_FragCoord.xy / R;
    vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
    vec3 col = max(scene(uv, p), 0.);
    vec3 k = step(.8, col);
    col = mix(col, .8 + .2 * (1. - exp(-(col - .8) / .2)), k);
    col = pow(col, vec3(1. / 2.2));
    col += (hash21(gl_FragCoord.xy + fract(T * 7.) * 100.) - .5) / 255. * 1.5;
    fragColor = vec4(col, 1.);
}
"""
VERT = "#version 330 core\nin vec2 v; void main() { gl_Position = vec4(v, 0., 1.); }"


def rgb(hexcode: str) -> tuple:
    h = hexcode.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


class Renderer:
    def __init__(self, width: int, height: int):
        self.ctx = moderngl.create_standalone_context()
        self.size = (width, height)
        self.fbo = self.ctx.framebuffer(color_attachments=[self.ctx.texture(self.size, 3)])
        self.vbo = self.ctx.buffer(np.array([-1, -1, 3, -1, -1, 3], dtype="f4").tobytes())
        self.programs = {}
        self.common = (HERE / "common.glsl").read_text()

    def program(self, shader: str):
        if shader not in self.programs:
            source = self.common + (HERE / f"{shader}.glsl").read_text() + MAIN
            prog = self.ctx.program(vertex_shader=VERT, fragment_shader=source)
            self.programs[shader] = (prog, self.ctx.vertex_array(prog, [(self.vbo, "2f", "v")]))
        return self.programs[shader]

    def frame(self, look: dict, t: float) -> bytes:
        prog, vao = self.program(look["shader"])
        colors = [rgb(c) for c in look["colors"]] + [(0, 0, 0)] * (6 - len(look["colors"]))
        values = {"R": self.size, "T": t, "C": colors, "P": tuple(look.get("P", (0, 0, 0, 0))), "Q": tuple(look.get("Q", (0, 0, 0, 0))), "SEED": look.get("seed", 1.0)}
        for name, value in values.items():
            if name not in prog:
                continue
            if name == "C":  # the driver trims the array to the highest colour the shader reads
                prog[name].write(np.array(value[: prog[name].array_length], dtype="f4").tobytes())
            else:
                prog[name].value = value
        self.fbo.use()
        vao.render(moderngl.TRIANGLES)
        return self.fbo.read(components=3, alignment=1)

    def image(self, look: dict, t: float) -> Image.Image:
        return Image.frombytes("RGB", self.size, self.frame(look, t)).transpose(Image.FLIP_TOP_BOTTOM)


def save_stills(picture: Image.Image, name: str):
    picture.save(STILL_OUT / f"{name}.webp", "WEBP", quality=86)
    picture.resize((480, 270), Image.LANCZOS).save(STILL_OUT / f"{name}-sm.webp", "WEBP", quality=78)


def render_video(r: Renderer, look: dict, target: Path):
    w, h = r.size
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-", "-vf", "vflip",
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = FPS * SECONDS
    for f in range(frames):
        ff.stdin.write(r.frame(look, f / frames))
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {look['id']}")


def countdown_digits(total: int) -> Path:
    """One transparent 1080p frame per second, "5:00" down to "0:01" (this ffmpeg has no drawtext)."""
    folder = WORK / f"digits-{total}"
    if (folder / f"{total - 1:03d}.png").exists():
        return folder
    folder.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(str(FONT), 230)
    for i in range(total):
        left = total - i
        text = f"{left // 60}:{left % 60:02d}"
        layer = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        shadow = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        box = font.getbbox(text)
        x, y = (1920 - (box[2] - box[0])) / 2 - box[0], (1080 - (box[3] - box[1])) / 2 - box[1]
        ImageDraw.Draw(shadow).text((x, y + 6), text, font=font, fill=(0, 0, 0, 90))
        layer = Image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)), layer)
        ImageDraw.Draw(layer).text((x, y), text, font=font, fill=(255, 255, 255, 242))
        layer.save(folder / f"{i:03d}.png")
    return folder


def render_countdown(c: dict):
    base = VIDEO_OUT / f"{c['base']}.mp4"
    target = VIDEO_OUT / f"{c['id']}.mp4"
    if target.exists():
        return
    total = c["minutes"] * 60
    digits = countdown_digits(total)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", str(base), "-framerate", "1", "-i", str(digits / "%03d.png"),
           "-filter_complex", "[1:v]fps=30[d];[0:v][d]overlay=0:0:shortest=1,format=yuv420p[v]", "-map", "[v]", "-t", str(total),
           "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "4M", "-bufsize", "8M", "-movflags", "+faststart", str(target)]
    subprocess.run(cmd, check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "2", "-i", str(target), "-frames:v", "1", str(PREVIEW_OUT / f"{c['id']}.png")], check=True)
    save_stills(Image.open(PREVIEW_OUT / f"{c['id']}.png").convert("RGB"), f"{c['id']}-poster")


def preview(ids):
    PREVIEW_OUT.mkdir(parents=True, exist_ok=True)
    r = Renderer(640, 360)
    looks = [l for l in LOOKS if not ids or l["id"] in ids]
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    cols = 4
    for start in range(0, len(looks), 24):
        chunk = looks[start : start + 24]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 480, rows * 290), "black")
        d = ImageDraw.Draw(sheet)
        for i, look in enumerate(chunk):
            im = r.image(look, look.get("t", .3)).resize((480, 270), Image.LANCZOS)
            x, y = (i % cols) * 480, (i // cols) * 290
            sheet.paste(im, (x, y))
            d.text((x + 4, y + 272), look["id"], fill="yellow", font=font)
        sheet.save(PREVIEW_OUT / f"sheet-{start // 24}.jpg", quality=85)
        print(PREVIEW_OUT / f"sheet-{start // 24}.jpg")


def render(ids):
    VIDEO_OUT.mkdir(parents=True, exist_ok=True)
    STILL_OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW_OUT.mkdir(parents=True, exist_ok=True)
    r = Renderer(1920, 1080)
    for look in LOOKS:
        if ids and look["id"] not in ids:
            continue
        if look.get("type") == "image":
            if not (STILL_OUT / f"{look['id']}.webp").exists():
                save_stills(r.image(look, look.get("t", .3)), look["id"])
            continue
        target = VIDEO_OUT / f"{look['id']}.mp4"
        if not target.exists():
            render_video(r, look, target)
            save_stills(r.image(look, 0.0), f"{look['id']}-poster")
            print(look["id"], f"{target.stat().st_size / 1e6:.1f} MB", flush=True)
    for c in COUNTDOWNS:
        if not ids or c["id"] in ids:
            render_countdown(c)
            print(c["id"], flush=True)


if __name__ == "__main__":
    mode, ids = sys.argv[1], set(sys.argv[2:])
    {"preview": preview, "render": render}[mode](ids)
