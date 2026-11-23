"""Every motion loop and gradient still Scriptural renders, with its categories.

Colours are sRGB. No purple, violet or fuchsia anywhere (house rule): Advent uses
blue, Lent ash and grey.
"""

PAL = {
    "gold": ["#07090f", "#1c1509", "#f4c26b", "#fff3d6", "#e09a45"],
    "ember": ["#0a0504", "#2a0c06", "#ff7a2f", "#ffd27a", "#c8341b"],
    "ocean": ["#04121c", "#0a3346", "#3fb6c9", "#d9f6ff", "#1d7fa0"],
    "forest": ["#06110b", "#123222", "#6fbf7f", "#e6f5d0", "#3a8a5a"],
    "crimson": ["#100406", "#3a0a12", "#b3243a", "#f6d48a", "#7a1424"],
    "dawn": ["#1b2440", "#c9714d", "#ffd59a", "#fff6e6", "#f2a36b"],
    "ice": ["#06101c", "#14304a", "#9fd3f2", "#f4fbff", "#5aa7d6"],
    "navygold": ["#050a18", "#0f1c3a", "#c99a45", "#f8e2b0", "#33507f"],
    "sage": ["#1a2019", "#4d5e48", "#a9b99a", "#f2efe2", "#7d8f72"],
    "autumn": ["#140904", "#4a1c08", "#d9772b", "#f6c26b", "#9a3f12"],
    "spring": ["#13301c", "#4f8f58", "#bfe39a", "#fff7d6", "#f3b9c4"],
    "summer": ["#062a3a", "#0f6f83", "#ffc66b", "#fff3d0", "#ff8a4c"],
    "christmas": ["#06120c", "#3a0b0e", "#c9a24b", "#fff1cf", "#b3262f"],
    "easter": ["#e8dcc4", "#bcd6e6", "#ffd98a", "#ffffff", "#e9c46a"],
    "lent": ["#0b0c0e", "#2a2c31", "#8a8f98", "#e8e4dc", "#4a4e56"],
    "rose": ["#1a0b0c", "#5a2a2c", "#e8a39b", "#fff0e8", "#c06a63"],
    "teal": ["#031416", "#0b3b3f", "#35c4b0", "#e6fffa", "#1f8f86"],
    "parchment": ["#2b1d10", "#7a5a33", "#d9c08f", "#f6ead0", "#a88458"],
    "midnight": ["#020409", "#0a1326", "#2f5d8a", "#cfe3ff", "#1b3658"],
}
SEASON = {"autumn": ["fall", "thanksgiving"], "spring": ["spring"], "summer": ["summer"], "christmas": ["christmas"], "easter": ["easter"],
          "lent": ["lent"], "crimson": ["communion"], "ember": ["pentecost"], "ocean": ["baptism"], "ice": ["winter"], "navygold": ["advent"],
          "parchment": ["bible"], "rose": ["celebration"], "forest": ["spring"], "dawn": ["easter"], "midnight": ["prayer"], "sage": ["prayer"]}

LOOKS = []


def add(id, label, cats, shader, colors, P=(0, 0, 0, 0), Q=(0, 0, 0, 0), seed=1.0, **extra):
    LOOKS.append({"id": id, "label": label, "categories": cats, "shader": shader, "colors": colors, "P": P, "Q": Q, "seed": seed, **extra})


# Flowing gradients: one loop and two stills per palette.
NAMES = {"gold": "Gold", "ember": "Ember", "ocean": "Ocean", "forest": "Forest", "crimson": "Wine and gold", "dawn": "Dawn", "ice": "Ice",
         "navygold": "Navy and gold", "sage": "Sage", "autumn": "Autumn", "spring": "Spring", "summer": "Summer", "christmas": "Christmas",
         "easter": "Easter morning", "lent": "Ash", "rose": "Rose", "teal": "Teal", "parchment": "Parchment", "midnight": "Midnight"}
for i, (key, name) in enumerate(NAMES.items()):
    cats = ["worship", "gradients"] + SEASON.get(key, [])
    pal = PAL[key][:4]
    add(f"flow-{key}", f"{name} flow", cats, "flow", pal, (.55, .9, .6, .25), (1, .5, 0, 0), seed=1 + i)
    for j, t in enumerate((.12, .45, .78)):
        add(f"grad-{key}-{j + 1}", f"{name} gradient {j + 1}", ["gradients"] + SEASON.get(key, []), "flow", pal, (.5 + .15 * j, 1.0, .6, .3), (1, .5, 0, 0), seed=40 + i * 3 + j, type="image", t=t)

# Bokeh
for key, name, cats, top, bottom, lights, drift in [
    ("gold", "Gold bokeh", ["worship", "celebration"], "#0b0906", "#1d1408", ["#f4c26b", "#ffe2a8", "#e09a45"], 1),
    ("warm", "Warm lights", ["worship", "christmas"], "#0a0807", "#18110b", ["#ffd9a0", "#fff1dc", "#ffb066"], 0),
    ("christmas", "Christmas lights", ["christmas"], "#070b08", "#1a0a0b", ["#d33a3a", "#f2c46b", "#3f9a5a"], 0),
    ("ice", "Winter lights", ["winter"], "#050b14", "#0e2236", ["#9fd3f2", "#ffffff", "#5aa7d6"], -1),
    ("autumn", "Amber lights", ["fall", "thanksgiving"], "#0d0704", "#2a1207", ["#e5873a", "#f6c26b", "#b8541c"], 1),
    ("spring", "Spring light", ["spring"], "#0b1a10", "#20402a", ["#bfe39a", "#fff7d6", "#f3b9c4"], 1),
    ("teal", "Teal bokeh", ["worship"], "#031012", "#082a2d", ["#35c4b0", "#bff5ea", "#1f8f86"], 1),
    ("rose", "Rose bokeh", ["celebration"], "#140809", "#3a1a1b", ["#e8a39b", "#fff0e8", "#f2c46b"], 1),
    ("crimson", "Wine bokeh", ["communion"], "#0d0305", "#2a070d", ["#b3243a", "#f6d48a", "#e07a5f"], 0),
]:
    add(f"bokeh-{key}", name, cats, "bokeh", [top, bottom] + lights, (110, 1.0, .9, drift), seed=sum(map(ord, key)) % 97)

# Light rays
add("rays-gold", "Golden rays", ["worship", "prayer"], "rays", ["#05070c", "#2a1d0c", "#f4c26b", "#fff1cf"], (0, .62, 1.0, 120), (3.5, 0, 0, 0))
add("rays-dawn", "Morning rays", ["easter", "worship"], "rays", ["#1b2440", "#a85e3e", "#ffd59a", "#fff6e6"], (.35, .1, 1.0, 90), (4, 0, 0, 0), seed=3)
add("rays-white", "White light", ["worship", "prayer"], "rays", ["#07090d", "#1d2430", "#e9f1ff", "#ffffff"], (-.3, .65, .9, 120), (3, 0, 0, 0), seed=5)
add("rays-ocean", "Light through water", ["baptism"], "rays", ["#03101a", "#0d4a5e", "#9fe6f0", "#e6fbff"], (0, .7, .9, 80), (5, 0, 0, 0), seed=7)
add("rays-crimson", "Crimson light", ["communion", "lent"], "rays", ["#080203", "#3a0a12", "#e0705f", "#f6d48a"], (0, .6, .9, 90), (3.5, 0, 0, 0), seed=9)

# Rising motes and embers
add("embers-fire", "Rising embers", ["pentecost"], "embers", ["#0a0302", "#2b0a04", "#ffd27a", "#ff6a2a"], (160, 1.2, 1.1, .5))
add("embers-gold", "Gold dust", ["worship", "celebration"], "embers", ["#06070b", "#16120a", "#fff1cf", "#f4c26b"], (180, .9, .9, .2), seed=4)
add("embers-white", "Quiet light", ["prayer"], "embers", ["#06080c", "#0f141c", "#ffffff", "#bcd3ea"], (90, .8, .7, .1), seed=6)
add("embers-autumn", "Autumn embers", ["fall", "thanksgiving"], "embers", ["#0d0603", "#331306", "#f6c26b", "#d9772b"], (140, 1.0, .9, .35), seed=8)

# Silk lines
for key, name, cats, top, bottom, a, b in [
    ("gold", "Gold silk", ["worship"], "#050812", "#0f1424", "#f4c26b", "#fff1cf"),
    ("teal", "Teal silk", ["worship"], "#021012", "#06292c", "#35c4b0", "#e6fffa"),
    ("ice", "Ice silk", ["winter", "worship"], "#040b14", "#0d2236", "#9fd3f2", "#ffffff"),
    ("rose", "Coral silk", ["celebration"], "#120809", "#2e1415", "#e8a39b", "#fff0e8"),
    ("crimson", "Wine silk", ["communion"], "#0b0204", "#250610", "#c83a4a", "#f6d48a"),
    ("forest", "Green silk", ["spring"], "#03100a", "#0c2a1a", "#6fbf7f", "#e6f5d0"),
]:
    add(f"silk-{key}", name, cats, "waves", [top, bottom, a, b], (28, .2, 1.0, .3), (-.05, 0, 0, 0), seed=sum(map(ord, key)) % 31)

# Night skies
add("aurora-green", "Northern lights", ["winter", "creation"], "aurora", ["#020610", "#0a1a2a", "#2fd08f", "#5fd0e0", "#ffffff"], (1.0, 0, 0, 0))
add("aurora-gold", "Golden aurora", ["creation", "worship"], "aurora", ["#03060c", "#141826", "#f2c46b", "#5fd0e0", "#ffffff"], (.9, 0, 0, 0), seed=2)
add("aurora-ice", "Winter aurora", ["winter"], "aurora", ["#02050c", "#0c1a2e", "#7fd8f0", "#e6f6ff", "#ffffff"], (.9, 0, 0, 0), seed=3)
add("stars-blue", "Starfield", ["creation", "christmas"], "starfield", ["#01030a", "#1a4a7a", "#2a8a9a", "#eaf2ff"], (1.8, 1.0, 0, 0))
add("stars-gold", "Golden heavens", ["creation", "worship"], "starfield", ["#030306", "#7a5a22", "#1d5a6a", "#fff4dc"], (1.6, 1.0, 0, 0), seed=5)
add("stars-deep", "Deep sky", ["creation"], "starfield", ["#000105", "#123050", "#0d4a4a", "#ffffff"], (1.3, 1.4, 0, 0), seed=9)

# Snow
add("snow-night", "Snow at night", ["winter"], "snow", ["#0b1a2e", "#030810", "#f4fbff", "#ffd9a0"], (5, 1.0, 0, 0))
add("snow-lights", "Snow and lights", ["christmas", "winter"], "snow", ["#100a08", "#060403", "#fff6ea", "#ffb866"], (4, 1.0, 1.0, 0), seed=2)
add("snow-dusk", "Snow at dusk", ["winter", "advent"], "snow", ["#1d3354", "#0a1222", "#ffffff", "#c99a45"], (5, .9, .5, 0), seed=3)
add("snow-soft", "Soft snow", ["winter", "christmas"], "snow", ["#4a6a8a", "#17283c", "#ffffff", "#ffffff"], (4, 1.2, 0, 0), seed=4)

# Leaves, petals, hearts and confetti
add("leaves-amber", "Falling leaves", ["fall", "thanksgiving"], "falling", ["#2a1408", "#0f0703", "#d9772b", "#b8461a", "#f2b448"], (0, 1.6, .95, -1), (3, .55, 0, 0))
add("leaves-gold", "Golden leaves", ["fall"], "falling", ["#3a2a14", "#120c05", "#e8a93a", "#f6d27a", "#c26a1c"], (0, 1.44, .9, -1), (3, .5, 0, 0), seed=3)
add("leaves-red", "Red leaves", ["fall", "thanksgiving"], "falling", ["#1a0a06", "#080302", "#c0391b", "#e06a2a", "#8a1c10"], (0, 1.76, .95, -1), (3, .45, 0, 0), seed=5)
add("petals-blossom", "Blossom petals", ["spring", "easter"], "falling", ["#e9f1e4", "#bcd8c4", "#f7c9d0", "#ffffff", "#f2a9b6"], (1, 1.28, .9, -1), (3, .55, 0, 0), seed=2)
add("petals-white", "White petals", ["spring", "easter"], "falling", ["#2a4a3a", "#0e1d16", "#ffffff", "#f6f1e4", "#e6efe0"], (1, 1.28, .85, -1), (3, .5, 0, 0), seed=4)
add("hearts-rose", "Rising hearts", ["celebration"], "falling", ["#2a1012", "#100506", "#e8a39b", "#f2c46b", "#d0605a"], (2, .9, .8, 1), (3, .4, 0, 0), seed=6)
add("hearts-gold", "Golden hearts", ["celebration"], "falling", ["#14100a", "#060504", "#f4c26b", "#fff1cf", "#e09a45"], (2, .9, .8, 1), (3, .35, 0, 0), seed=7)
add("confetti-gold", "Gold confetti", ["celebration"], "falling", ["#0d0b08", "#050403", "#f4c26b", "#ffffff", "#e09a45"], (3, .6, 1.0, -1), (4, .7, 0, 0), seed=8)
add("confetti-bright", "Bright confetti", ["celebration"], "falling", ["#0b1626", "#050a12", "#ffc14a", "#38c6b0", "#ff6a4c"], (3, .6, 1.0, -1), (4, .7, 0, 0), seed=9)
add("confetti-christmas", "Christmas confetti", ["christmas", "celebration"], "falling", ["#0a120c", "#040805", "#c9a24b", "#b3262f", "#2f7a4a"], (3, .6, 1.0, -1), (4, .65, 0, 0), seed=10)
add("confetti-summer", "Summer confetti", ["summer", "celebration"], "falling", ["#0f6f83", "#062a3a", "#ffc66b", "#ff8a4c", "#ffffff"], (3, .6, 1.0, -1), (4, .65, 0, 0), seed=11)

# Fireworks
add("fireworks-gold", "Gold fireworks", ["celebration"], "fireworks", ["#050812", "#0b1020", "#f4c26b", "#fff1cf", "#e09a45"], (6, 120, 1.3, 0))
add("fireworks-bright", "Fireworks", ["celebration"], "fireworks", ["#040611", "#0a1022", "#ff6a4c", "#38c6b0", "#ffc14a"], (6, 120, 1.3, 0), seed=3)
add("fireworks-red", "Red and white fireworks", ["celebration"], "fireworks", ["#05070f", "#0b0f1c", "#e0333a", "#ffffff", "#f2c46b"], (5, 120, 1.4, 0), seed=5)

# Fire, water
add("fire-pentecost", "Tongues of fire", ["pentecost"], "fire", ["#050201", "#5a0d05", "#ff6a1f", "#ffe2a0"], (.75, 1.1, 50, 0))
add("fire-low", "Low flames", ["pentecost"], "fire", ["#040201", "#3a0804", "#e85a1a", "#ffd27a"], (.45, 1.0, 80, 0), seed=3)
add("water-teal", "Baptism waters", ["baptism"], "water", ["#021a24", "#0e6a7a", "#d9fbff", "#bff3f7"], (1.2, .9, .6, 40))
add("water-deep", "Deep water", ["baptism"], "water", ["#010812", "#0b3552", "#bfe9ff", "#9fd8f0"], (1.0, .8, .7, 30), seed=3)
add("water-summer", "Summer pool", ["summer", "baptism"], "water", ["#0a5a7a", "#3fc0d8", "#ffffff", "#e6fbff"], (1.4, 1.0, .4, 20), seed=5)
add("ripples-dawn", "Still water", ["baptism", "prayer"], "ripples", ["#081622", "#c99a6a", "#fff1cf"], (5, .5, 1.0, 0))
add("ripples-blue", "Drops on water", ["baptism"], "ripples", ["#03101c", "#4f8fb8", "#ffffff"], (6, .5, 1.0, 0), seed=3)

# The cross
CROSS = [
    ("cross-glory", "Cross in glory", ["cross", "worship"], ["#0a0806", "#3a2a12", "#f4c26b", "#0b0806", "#fff1cf"], (.75, .02, 1.0, 120), 0),
    ("cross-dawn", "Cross at dawn", ["cross", "easter"], ["#1b2440", "#c9714d", "#ffd59a", "#120d10", "#fff6e6"], (.75, .02, 1.0, 90), 0),
    ("cross-crimson", "Crimson cross", ["cross", "lent", "communion"], ["#050102", "#3a0a12", "#e0705f", "#050102", "#f6d48a"], (.75, .02, .9, 80), 0),
    ("cross-light", "Cross of light", ["cross", "worship"], ["#050a18", "#0f1c3a", "#f8e2b0", "#000000", "#fff8ea"], (.7, .02, 1.0, 120), 1),
    ("cross-white", "White cross", ["cross", "prayer"], ["#07090d", "#151a22", "#e9f1ff", "#000000", "#ffffff"], (.7, .02, .9, 80), 1),
    ("cross-outline-gold", "Gold outline cross", ["cross", "led"], ["#050608", "#0d0b08", "#f4c26b", "#000000", "#3a2a12"], (.7, .02, 1.0, 0), 2),
    ("cross-outline-teal", "Teal outline cross", ["cross", "led"], ["#020a0c", "#05181b", "#5fe0cf", "#000000", "#0b3b3f"], (.7, .02, 1.0, 0), 2),
    ("calvary-sunrise", "Three crosses at sunrise", ["cross", "easter"], ["#24345a", "#e8935c", "#ffd59a", "#0d0a0c", "#fff6e6"], (1.0, 0, 1.0, 0), 3),
    ("calvary-dusk", "Three crosses at dusk", ["cross", "lent"], ["#120609", "#7a2a1a", "#e0705f", "#060304", "#f6d48a"], (1.0, 0, .9, 0), 3),
    ("cross-flow-gold", "Cross over gold", ["cross", "worship"], ["#0b0906", "#4a3416", "#fff1cf", "#000000", "#e0b060"], (.7, .02, 1.0, 0), 4),
    ("cross-flow-ocean", "Cross over blue", ["cross", "worship"], ["#04121c", "#0a3346", "#e6fbff", "#000000", "#3fb6c9"], (.7, .02, 1.0, 0), 4),
    ("cross-hill-sunrise", "Cross on the hill", ["cross", "easter"], ["#3a5a8a", "#f0a868", "#ffe0a8", "#0c0a0b", "#ffffff"], (1.0, 0, 1.0, 0), 5),
    ("cross-hill-dusk", "Cross at evening", ["cross", "prayer"], ["#0e1630", "#b05a3a", "#ffc890", "#07060a", "#ffffff"], (1.0, 0, .9, 0), 5),
]
for i, (id, label, cats, colors, P, mode) in enumerate(CROSS):
    add(id, label, cats, "cross", colors, P, (0, mode, 0, 0), seed=11 + i)
    add(f"{id}-still", label, cats, "cross", colors, P, (0, mode, 0, 0), seed=11 + i, type="image", t=.25)

# Candles
add("candle-one", "One candle", ["prayer"], "candles", ["#0a0705", "#030202", "#efe4cf", "#ffc46b", "#ffb066", "#ffffff"], (1, 1.3, 1.0, .6))
add("candles-three", "Three candles", ["prayer", "worship"], "candles", ["#0b0806", "#040302", "#efe4cf", "#ffc46b", "#ffb066", "#ffffff"], (3, 1.0, 1.0, .8), seed=2)
add("advent-four", "Advent candles", ["advent", "christmas"], "candles", ["#050a18", "#020409", "#2f5d9a", "#ffc46b", "#c99a45", "#ffffff"], (4, .9, 1.0, .8), seed=3)
add("advent-christ", "Advent and Christ candle", ["advent", "christmas"], "candles", ["#050a18", "#020409", "#2f5d9a", "#ffc46b", "#c99a45", "#f6f1e4"], (5, .85, 1.0, .8), (0, 1, 0, 0), seed=4)
add("candles-christmas", "Christmas candles", ["christmas"], "candles", ["#0a0606", "#030202", "#a8232c", "#ffc46b", "#f2c46b", "#ffffff"], (3, 1.0, 1.0, 1.0), seed=5)

# The open Bible
add("bible-gold", "Open Bible", ["bible", "worship"], "book", ["#07080c", "#140f08", "#f2e6cc", "#f4c26b", "#3a1e10"], (.62, -.2, 1.0, 120))
add("bible-white", "The Word", ["bible", "prayer"], "book", ["#06080c", "#0e131c", "#f4f2ec", "#e9f1ff", "#1c2430"], (.62, -.2, 1.0, 100), seed=2)
add("bible-dawn", "Bible at dawn", ["bible", "easter"], "book", ["#1b2440", "#7a4a3a", "#f6ead0", "#ffd59a", "#3a2418"], (.62, -.2, 1.0, 90), seed=3)
for base in [l for l in LOOKS if l["shader"] == "book"]:
    LOOKS.append({**base, "id": f"{base['id']}-still", "type": "image", "t": .3})

# LED wall patterns
LEDPAL = {
    "gold": ["#020203", "#f4c26b", "#fff1cf", "#e09a45"],
    "teal": ["#010406", "#35c4b0", "#5fb4f0", "#e6fffa"],
    "warm": ["#030101", "#ff6a2a", "#ffc14a", "#e0333a"],
}
MODES = [("tunnel", "Tunnel", (3, 18, 1.0)), ("grid", "Light grid", (4, 1.2, 1.0)), ("bars", "Light bars", (14, 1, 1.0)), ("hex", "Hexagons", (9, 1, 1.0)),
         ("dots", "LED dots", (48, 1, 1.0)), ("stripes", "Stripes", (5, 1, .8)), ("rings", "Rings", (6, 14, 1.0)), ("kaleido", "Kaleidoscope", (2.5, 1, 1.0))]
for m, (key, name, P) in enumerate(MODES):
    for j, (pk, colors) in enumerate(LEDPAL.items()):
        add(f"led-{key}-{pk}", f"{name} ({pk})", ["led"], "led", colors, (*P, 0), (0, m, 0, 0), seed=21 + m * 3 + j)

# Light leaks, skies, haze, harvest, sunburst
add("flares-summer", "Summer light", ["summer"], "flares", ["#1a2a3a", "#3a2a1a", "#ffb04a", "#ff7a3a", "#fff0c8"], (6, 1.0, .8, .6))
add("flares-gold", "Gold light", ["worship"], "flares", ["#08070a", "#140f08", "#f4c26b", "#fff1cf", "#e09a45"], (5, .9, .7, .5), seed=3)
add("flares-spring", "Spring morning", ["spring"], "flares", ["#9fc8a8", "#e8f0d8", "#fff4c8", "#ffffff", "#f3b9c4"], (5, 1.1, .5, .3), seed=5)
add("sky-day", "Blue sky", ["summer", "creation"], "clouds", ["#3f7fc4", "#bcdcf2", "#ffffff", "#fff6dc", "#9fb7cc"], (.5, .4, .8, .15))
add("sky-heaven", "Golden heaven", ["worship", "easter"], "clouds", ["#c8935a", "#fff0d0", "#fff8ea", "#ffffff", "#d9b07a"], (0, .35, .9, .45), seed=3)
add("sky-sunset", "Sunset sky", ["summer", "fall"], "clouds", ["#2a3a6a", "#f08a4c", "#ffd0a0", "#ffe6b0", "#7a4a5a"], (-.3, -.05, .6, .6), seed=5)
add("sky-dawn", "Dawn sky", ["easter", "spring"], "clouds", ["#5a7ab0", "#ffc8a0", "#fff0e0", "#fff6e0", "#b0a0a8"], (.4, -.1, .5, .7), seed=7)
for k in ("day", "heaven", "sunset", "dawn"):
    base = next(l for l in LOOKS if l["id"] == f"sky-{k}")
    LOOKS.append({**base, "id": f"sky-{k}-still", "type": "image", "t": .4})
add("haze-white", "Stage haze", ["worship"], "haze", ["#030406", "#e9f1ff", "#ffffff", "#bcd3ea"], (4, 1.0, .9, .8))
add("haze-gold", "Gold beams", ["worship"], "haze", ["#040302", "#f4c26b", "#fff1cf", "#e09a45"], (5, 1.0, .9, .8), seed=2)
add("haze-blue", "Blue beams", ["worship"], "haze", ["#010306", "#3f8fe0", "#35c4b0", "#e6f6ff"], (4, 1.0, .9, .8), seed=3)
add("haze-fire", "Red beams", ["pentecost", "worship"], "haze", ["#040101", "#ff5a2a", "#ffc14a", "#e0333a"], (5, 1.0, .9, .8), seed=4)
add("wheat-gold", "Wheat at sunset", ["thanksgiving", "fall", "communion"], "wheat", ["#2a3050", "#f0a050", "#ffe0a0", "#1a1008", "#ffd27a"], (.3, -.1, 1.0, 0))
add("wheat-red", "Harvest evening", ["thanksgiving", "fall"], "wheat", ["#1a1020", "#d0603a", "#ffc890", "#140a06", "#ffb070"], (-.35, -.15, 1.0, 0), seed=3)
add("wheat-gold-still", "Wheat at sunset", ["thanksgiving", "fall", "communion"], "wheat", ["#2a3050", "#f0a050", "#ffe0a0", "#1a1008", "#ffd27a"], (.3, -.1, 1.0, 0), type="image", t=.2)
add("sunburst-gold", "Sunburst", ["celebration"], "sunburst", ["#3a1e08", "#ffd27a", "#fff1cf"], (24, .18, .6, 0))
add("sunburst-sky", "Sky sunburst", ["easter", "celebration"], "sunburst", ["#3f7fc4", "#fff6dc", "#ffffff"], (20, .2, .6, 0), seed=2)

COUNTDOWNS = []
for base, minutes, label, cats in [
    ("flow-gold", 5, "Countdown, gold", ["countdowns"]), ("flow-ocean", 5, "Countdown, ocean", ["countdowns"]),
    ("bokeh-warm", 5, "Countdown, warm lights", ["countdowns"]), ("haze-blue", 5, "Countdown, blue beams", ["countdowns"]),
    ("silk-gold", 5, "Countdown, gold silk", ["countdowns"]), ("snow-lights", 5, "Countdown, Christmas", ["countdowns", "christmas"]),
    ("flow-midnight", 3, "Countdown, midnight", ["countdowns"]), ("led-rings-teal", 3, "Countdown, rings", ["countdowns", "led"]),
]:
    COUNTDOWNS.append({"id": f"countdown-{minutes}-{base}", "label": f"{label} ({minutes} min)", "categories": cats, "base": base, "minutes": minutes})
