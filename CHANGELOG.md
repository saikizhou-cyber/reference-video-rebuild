# Changelog

## 1.0.0 · 2026-10-14

The first release with the motion library.

### Added
- **Motion library (`library/`):** 106 frame-deterministic effects for Remotion: 23 transitions, 21 kinetic-type, 13 camera, 22 post-FX, 18 shapes / HUD and 9 edit-timing effects, plus `core/` helpers (`Place`, `transitionPlan`, GSAP hooks). 54 files are ported from MIT / Apache-2.0 projects and keep their notices; GSAP is used as a dependency only.
- **Copy only what you use:** `library/gallery/pick.py` copies the effects you name plus what they import, and prints the npm packages they need.
- **Docs per category:** `library/README.md` is an index; `library/catalog/<category>.md` has what each effect looks like, when to use it, its props and a "watch out" note where an effect has a trap (checked by rendering).
- **Live gallery:** 66 real demo renders at https://saikizhou-cyber.github.io/s17-motion-art/ (`npm run demos` renders them).
- **Tools:** `contact_sheet.py` (look at a film without a reference), `film_scan.py --allow`, tick candidates in `beat_check.py grid`, PNG frames and bt709 in `render-chunks.mjs`.
- **Fast lane** for short films and unattended runs in `references/create.md`, with new-project steps.

### Changed
- Remotion is the default engine, not a limit: any library driven by the frame number is allowed (three.js, GSAP, WebGL, canvas, ...).
- `transitionPlan` returns durations and per-shot `pre` offsets and rejects transitions longer than a neighbouring shot.
- The README, LICENSE (plain MIT, so GitHub recognises it) and the third-party notices (camera-shake is Apache-2.0) were corrected.

### Verified
- Type-check and lint clean; every demo renders; re-rendering a frame is pixel-identical for 89 effects and within 2 levels for 17.
- Two blind A/B trials of a 12-second trailer: the film made with the skill was preferred over the one made without it, in both viewing orders (one brief, model judges).

## 0.2.0 · 2026-10-08

- Renamed to `s17-motion-art`; four modes (create, realize, rebuild, deliver).

## 0.1.0 · 2026-10-02

- First version: a reference-video rebuild method, tools and a measured case study.
