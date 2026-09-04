# Elasto Mania — Browser Port

A faithful, dependency-free reconstruction of the classic **Elasto Mania** that runs
entirely in the browser. No build step, no server-side code — open `index.html` (or the
GitHub Pages URL) and ride.

**▶ [Play it now](https://spryt.github.io/elma-web/)**

## What's different from the original

This port aims to recreate the original feel exactly, but adds a few conveniences
and extra content on top:

1. **Extra level packs** — on top of the 54 original Internal levels the game ships
   with 700+ community levels: OLP (36), Lost Internals (54), ALP (36), Elma Online
   (54), ElmaPack (419) and Abula (92). Pick a pack from the main menu.
2. **Ghost riders** — your **personal best** (or your **last run** until you set
   a best) is shown as a semi-transparent bike while you ride, and on the Internal
   levels a **world-record ghost** rides along too. Both can be turned off in
   Settings (World Record Ghost / Personal Ghost).
3. **Dimmer brick/stone backgrounds** — levels whose backdrop is a wall material
   (e.g. 29 Headbanger, 40 Double Trouble) draw it with reduced brightness so the
   gameplay layer reads clearly.
4. **World-record replays** — watch the classic records (the old, pre-2005 WR runs
   bundled as `.rec` files) on the Internal levels from the menu.
5. **Every level keeps its best time** — finish screen, per-pack tables and the
   reference WR time are shown for all 700+ levels, not just the Internals.
6. **Death rewind** — after a death you can rewind up to **3 times** to the most
   stable frame in the last 0.5–5 s (only after 30 s of riding, so long runs get
   the most use). Each rewind adds a **5-second penalty** to your finish time.

## Play

```sh
# serve the folder (any static server works)
python3 -m http.server 8734
# open http://localhost:8734/
```

Or just open `index.html` directly — there are no network dependencies at runtime
(level data and art ship with the repo).

## Controls (same as the original)

| Key | Action |
|---|---|
| `↑` | gas |
| `↓` | brake |
| `←` / `→` | volt (← lean forward, → backflip) |
| `Alt` / `Space` / `T` | turn (flip) |
| `R` | restart |
| `Esc` | pause / menu |
| `Tab` | level select |
| `N` / `P` | next / previous level |
| `M` | menu |
| `runAutotest()` in the console | physics autotest (determinism, ride, volt, flip) |

## Links

- Original game source code (reference): <https://github.com/elastomania/elma-classic>
- The history of Elasto Mania (1994–2018): <https://televisio.org/en/60-history-of-elasto-mania-c-1994-2018>

## Level packs

The main menu lists every pack bundled in `lev/`:

- **Internal** — the original 54 levels (`QWQUU001.LEV` … `QWQUU054.LEV`)
- **OLP** — Official Level Pack (36)
- **LI** — Lost Internals (54)
- **ALP** — Alternative Level Pack (36)
- **EOL** — Elma Online Level Pack (54)
- **ElmaPack** — 419 community levels
- **Abula** — 92 levels by Abula

Each pack keeps its own best-time table; completed/count is shown in the menu.

## Project layout

- `index.html` — the whole UI shell (single page, inline CSS)
- `js/vec.js` — 2D vector helpers
- `js/level.js` — built-in fallback/tutorial levels (`makeLevel`, `makeTutorial1/2`)
- `js/levfile.js` — `.lev` parser (v14) with physics coordinates (`y_phys = -y_file`)
- `js/physics.js` — the physics engine (LEPTET.CPP + physics_move/collision + vect2)
- `js/lgr.js` — `Default.lgr` art loader (PNG) + sprite helpers
- `js/render2.js` — level renderer (sky, ground, grass, pictures), objects, bike
  and rider (port of recRender.js)
- `js/sound.js` — WebAudio playback of the original Elma WAV samples (`snd/`)
- `js/menu.js` — main menu, settings
- `js/win.js` — finish screen, best times, leaderboard
- `js/recorder.js` — replay recording/playback, ghost interpolation, IndexedDB storage
- `js/main.js` — game loop, input, camera, autotest
- `lev/` — level files, names and WR times
- `rec/` — native world-record `.rec` replays (Internal levels)
- `art/` — game art (converted `Default.lgr` PNGs)
- `snd/` — original sound effects

## Features

- **Physics** — a line-by-line port of the original engine (wheel springs,
  gas/brake/volt, rider pendulum, wheel/head collision, death, apple collection,
  finish), fixed timestep `dt = 0.0055 s`. During development it was verified
  bit-for-bit against a reference C harness built 1:1 from the elma-miyoo
  sources — scenarios matched to 5 significant digits, including the real
  `0lp01` level.
- **Levels** — real `.lev` files: the 54 original Internal levels plus the OLP, LI,
  ALP, EOL, ElmaPack and Abula packs (700+ levels total). Polygon/object parsing,
  textures, pictures.
- **Graphics** — original `Default.lgr` art converted to PNG: ground/sky textures,
  grass, bike sprite, rider, wheels, apples, flags.
- **Sound** — original Elma WAV samples played through WebAudio: engine loop
  (pitch driven by the physics), volt, bounces, apples, death, finish.
- **Camera** — like the original: hard follow, bike at 15%/85% of screen width,
  0.5 s flip-over; internal resolution 1280×960 (2× of 640×480).
- **Ghosts** — your personal best ghost rider (or your last run until you set a
  best), plus world-record ghosts on the Internal levels.
- **Replays** — watch your saved runs (ghost playback, frame-by-frame, speed
  control). Replays are stored in IndexedDB.
- **Best times** — per-level personal records and leaderboard (local), WR times
  shown for reference.

## Coordinate conventions

- `.lev` files store y pointing down (canvas); the physics engine mirrors it
  (`y_phys = -y_file`, like the original `segments.cpp`). Everything rendered uses
  file coordinates (y down); physics uses y up. Objects keep both pairs
  (`x/y` for render, `px/py` for physics).
- At `rotation = 0` the bike rides left (front wheel left, rear wheel right — as in
  the original).

## Credits & legal

- **Elasto Mania** was created by **Balazs Rozsa** and published by **F2
  (Pixel/Studio 3DO)**. All level, art and sound assets belong to their respective
  authors and are included here for historical/archival purposes — this is a fan-made
  web port, not affiliated with or endorsed by the rights holders.
- This repository contains no original Elma source code; the physics engine is an
  independent reimplementation (the original sources live at
  [elma-classic](https://github.com/elastomania/elma-classic); see also
  [the history of the game](https://televisio.org/en/60-history-of-elasto-mania-c-1994-2018)).
  If you are a rights holder and want these assets removed, open an issue.

### A note from the authors

This whole project was made **just for fun** — pure vibe-coding, no commercial
intent. It was written with the help of **deepseek-v4-flash** (≈ 2B tokens of
context/effort across the session). If you enjoy it, great — that was the whole
point. Ride on! 🏍️

## License

The code in this repository is provided under the MIT License (see `LICENSE`).
Game assets (`lev/`, `art/`, `rec/`, `snd/`) are **not** covered by the MIT license
and belong to their respective owners.
