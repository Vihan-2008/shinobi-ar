# Shinobi AR

A browser AR lens that puts dōjutsu (Sharingan, Mangekyō, Eternal Mangekyō, Rinnegan, Rinne-Sharingan, Byakugan, Tenseigan) on your real eyes, in any left/right/third-eye combination, and reads hand seals from your webcam to cast jutsu.

Everything runs locally in the browser with [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) (face + iris, hands, selfie segmentation). No build step, no dependencies.

## Run it

```bash
npm start
```

or double-click **start.bat**, then open <http://localhost:8080> in Chrome or Edge and press **Enable camera**.

The camera only works from `http://localhost` (or HTTPS), so don't open `index.html` directly from disk. If Node isn't installed, `start.bat` falls back to `python -m http.server`.

## What you can do

**Eyes (left rail).** 16 presets (Itachi, Sasuke EMS, Sasuke Rinnegan, Kakashi, Obito, Madara Six Paths, Kaguya …). **Mix each eye** opens a matrix where any pattern can go in the left eye, the right eye or a third eye on the forehead, plus size, glow, spin and opacity.

Patterns are mapped onto your tracked iris and clipped by your eyelids, so they blink with you. They behave like contact lenses: soft edges, your real eye's shading and reflections showing through, still until you switch eyes (then they spin up briefly). The Byakugan turns the iris near-white and grows raised veins from the outer corners down your cheeks; they stay on your face and fade out naturally.

**Jutsu (right rail).** Each seal lights up as you form it; **Cast** fires a jutsu without seals.

| Jutsu | Seals |
|---|---|
| Fire Style: Fireball | Snake → Ram → Monkey → Boar → Horse → Tiger |
| Fire Style: Phoenix Flower | Rat → Tiger → Dog → Ox → Hare → Tiger |
| Chidori | Ox → Hare → Monkey |
| Shadow Clone | Clone (cross) seal |
| Summoning | Boar → Dog → Bird → Monkey → Ram |
| Earth Style: Mud Wall | Tiger → Hare → Boar → Dog |
| Water Style: Water Dragon (abridged) | Ox → Monkey → Hare → Rat → Boar → Bird |
| Rasengan | Hold one open palm to the camera; lift it above your head for Rasenshuriken |

**Eye abilities.** These unlock based on the eyes you're wearing:

- **Tsukuyomi**, **Amaterasu** (wink one eye and look at a spot), **Kamui** (point and hold): any Mangekyō.
- **Susanoo**: Mangekyō or Rinnegan. A towering chakra-flame guardian builds up behind you in stages. Each eye has its own original guardian in its signature colour: warden (crimson), storm (violet), tide (cyan), gale (green), titan (blue).
- **Shinra Tensei** (push a palm at the camera): Rinnegan.
- **All-seeing sight**: Byakugan.
- **Infinite Tsukuyomi**: Rinne-Sharingan.

**Shadow clones join in.** While your clones are out, Fireball, Phoenix Flower, Chidori and Rasengan are cast by every clone too, and the clones wear your eyes.

**Character songs (optional).** The app has no built-in music. If you own a song you want for a character, open **Settings → Character songs** and choose the file. It plays when you wear that character's eyes, stays in your browser (IndexedDB), and is never uploaded.

**Also:** photo and video capture (with sound and music), optional voice commands (“Fireball!”, “Amaterasu!”, “Kai!”), and procedural sound effects.

**Runs on slower laptops.** Effect detail defaults to *Auto*. If frames run slow, it lowers the render resolution and particle count, caps the frame rate, and has the face and hand trackers take turns. You can pin Low, Medium or High in Settings.

## How seal recognition works

Real seals interlock the fingers, which hides them from a hand tracker. So there are two recognisers:

1. **Easy seals** (built in). Each seal is a pair of hand shapes the tracker can tell apart: fist, one finger, two fingers or open hand, each pointing up, sideways or down. The **Guide** lists them all. Keyboard keys `1–0`, `−`, `=`, `C` enter seals too.
2. **Your own recordings.** Open **Guide → Teach your own seals**, pick a seal, press **Record** and hold the pose for 3 seconds. A k-nearest-neighbour classifier then recognises *your* version, including authentic interlocked seals. Record **Idle** as well to cut false triggers. Recordings are stored in the browser and can be exported or imported as JSON.

“Forgive up to 2 stray seals” in Settings lets a sequence succeed even if the tracker inserts a wrong seal or two.

## Keyboard

| Key | Action |
|---|---|
| `1–0`, `−`, `=`, `C` | Rat … Boar, Clone seal |
| `E` / `Shift+E` | Next / previous eye preset |
| `T A K U N B I` | Tsukuyomi, Amaterasu, Kamui, Susanoo, Shinra Tensei, Byakugan sight, Infinite Tsukuyomi |
| `Space` | Rasengan |
| `X` | Release (“Kai”): stop everything |
| `G` `P` `R` `F` `H` | Guide, photo, record, fullscreen, hide interface |

## Files

```
index.html        layout: top bar, eye rail, jutsu rail, seal readout, sheets and modals
css/style.css     ink / paper / vermilion design system
js/main.js        app loop, compositing, gestures, jutsu dispatch, capture
js/tracking.js    MediaPipe setup + face/iris/hand geometry
js/dojutsu.js     procedural eye patterns and the eye renderer
js/seals.js       easy-seal rules, k-NN trainer, stabiliser, sequence matcher
js/effects.js     every jutsu / ability effect and the FX compositor
js/particles.js   sprites and pooled particle system
js/audio.js       Web Audio sound effects
js/music.js       your own optional character songs (IndexedDB)
js/voice.js       Web Speech voice commands
js/ui.js          DOM: rails, sheets, guide, trainer, settings
server.js         zero-dependency static server
```

## Security & privacy

- **Video stays on your device.** Camera frames are processed in the browser and are never uploaded. Nothing is sent to a server of ours (there isn't one).
- **What the browser downloads.** The MediaPipe library comes from jsDelivr, the tracking models from Google's model storage and the fonts from Google Fonts, so those services see your IP address.
  - The library is pinned to version 0.10.14 with a SHA-384 integrity hash (matching the official npm package), so a modified copy is refused.
  - The models are pinned to fixed versions.
- **Voice commands are off by default.** If you turn them on, your browser's speech recognition handles the audio and may send it to an online service (Google, in Chrome).
- **Content-Security-Policy.** Scripts may load only from this site and jsDelivr, and network requests may go only to jsDelivr and Google model storage. The page can't be framed, and camera and microphone access are limited to this site (see `index.html` and `vercel.json`).
- **Your own songs** are stored in your browser (IndexedDB) and played from local blob URLs; they are never uploaded.
- **Seal recordings** stay in your browser's local storage. Imported files are validated: known seals only, fixed-size numeric data, bounded counts.
- **`server.js`** is for local use only. It binds to 127.0.0.1, serves only the web files, and refuses hidden files, path traversal and malformed paths.

## Troubleshooting

- **Camera blocked.** Allow camera access in the address bar and press Enable camera again.
- **“Hand tracking failed to load”.** The models download from Google's CDN on first run, so you need an internet connection the first time.
- **Seals don't register.** Keep both hands fully in frame and close together, and use good lighting. Turn on *Show hand shapes under the seal* in Settings to see what the tracker reads, or record your own seals.
- **Slow.** Set *Effect detail* to Low in Settings.

Fan project for personal use. Not affiliated with or endorsed by any rights holder. All eye patterns and effects are drawn procedurally; no official artwork or audio is included.
