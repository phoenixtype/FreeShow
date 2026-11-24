"""Renders Scriptural's worship pads: a warm sustained chord in each of the 12 keys.

Made here from sine waves, so there is nothing to license. Each is 64 seconds and loops
without a seam: every partial and every slow movement completes a whole number of cycles.
Usage: python3 pads.py <output folder>   (needs numpy and ffmpeg)
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

RATE, SECONDS = 44100, 64
KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
# root, fifth, octave, ninth and fifth above: no third, so it sits under major and minor
NOTES = [(-12, 0.9), (-5, 0.5), (0, 0.8), (7, 0.55), (12, 0.35), (14, 0.22), (19, 0.16)]

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
t = np.arange(RATE * SECONDS) / RATE
whole = lambda hz: max(1, round(hz * SECONDS)) / SECONDS

for index, key in enumerate(KEYS):
    rng = np.random.default_rng(index)
    root = 130.81 * 2 ** (index / 12) / (2 if index > 6 else 1)
    channels = []
    for side in range(2):
        mix = np.zeros_like(t)
        for semitones, level in NOTES:
            base = root * 2 ** (semitones / 12)
            for partial, strength in ((1, 1.0), (2, 0.22), (3, 0.07)):
                for detune in (-1.6, 0.0, 1.6):
                    hz = whole(base * partial * 2 ** (detune / 1200))
                    swell = 0.72 + 0.28 * np.sin(2 * np.pi * rng.integers(1, 5) / SECONDS * t + rng.uniform(0, 6.28))
                    mix += level * strength / 3 * swell * np.sin(2 * np.pi * hz * t + rng.uniform(0, 6.28))
        channels.append(mix)
    audio = np.stack(channels, axis=1)
    audio *= 0.5 / np.abs(audio).max()
    raw = (audio * 32767).astype("<i2").tobytes()
    target = out / f"pad-{key.lower()}.m4a"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(RATE), "-ac", "2", "-i", "-", "-c:a", "aac", "-b:a", "160k", str(target)], input=raw, check=True)
    print(target.name, target.stat().st_size)
