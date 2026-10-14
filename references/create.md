# Create mode: from a line, a world or a song to an executable PV plan

Use when there is no reference video to rebuild. Output: `docs/direction.md` (options, then the chosen one), `docs/style-bible.md`, `docs/shot-list.md`, a rough-cut animatic, then the film. The rules in SKILL.md (original content, static before motion, measure, mid-tier sub-agents, explicit credit budget) apply unchanged.

**Stance.** This skill makes motion with code. Kinetic type, transitions, camera moves, effects and rhythm are code (Remotion with React + TypeScript by default, SKILL.md rule 1), cut to a beat grid. AI generates only static assets that code draws badly (character art, props, plates). An AI video clip is an optional extra for a pose the user already approved as a still, never the default; a plan that only works with generated clips gets redesigned.

**Fast lane (a film of about 20 s or less, or an unattended run).** The full path below is built for a long film with a person in the loop; for a short or non-interactive one it replaces the gates: the brief stands in for gates 1-4, and gate 5 is the checks in its row. Do not ask the five questions of section 1: take the defaults and list them under "assumed" (if the user is there, ask only for what the request left out, such as the music file or the length). The length is the one asked for; under 20 s fold the act skeleton of section 4 into hook / middle / climax and end, and write the beat count of each. New project: copy `library/package.json` and `library/remotion.config.ts`, write `src/index.ts` (`registerRoot`) and `src/Root.tsx` with one `<Composition id="PV" width={1280} height={720} fps={30} durationInFrames={DURATION_FRAMES}>`, put the music at `public/audio/bgm.wav` (or set `PV_AUDIO`) and run everything from that folder. Write ONE direction (section 2 rules still apply to it, and boldness is cheap because code-drawn assets cost no credits); assets default to section 5b (all code, 0 credits) unless the brief brings art or the user approves a spend; write the first five lines of the style bible (Palette, Type, Motion, Shot lengths, Camera) BEFORE building and finish it when the film is built; take the beat grid and the shot list (sections 4.1-4.6) because they pay off in every later check; skip the animatic when nobody will watch it; check stills while building instead of the 12-board gate, and skip gate 4; end with the acceptance checks of `deliver.md` section 3 (sections 4-5 only if the user asks). Never skip: original content, cuts on `beat_frames`, `contact_sheet.py` and `film_scan.py` on the render. Rule 5 (builders do not judge their own work) is the one the fast lane quietly drops: when a second pair of eyes is cheap, give a mid-tier critic only the contact sheet and the render and let it report what it sees; when you skip that, say so in the final message. To pick effects, read the index in `library/README.md` and open only the category files of what you picked (`timing.md` is the smallest).

## 1. Brief intake

Ask all five in ONE message, each with its default. Anything unanswered takes the default and is listed under "assumed" at the top of `direction.md`; do not block on it.

| # | Item | Ask | Default |
|---|---|---|---|
| 1 | World | one-sentence premise, genre, 3 mood words | write the premise from the user's line; if there is none, an original near-future action fantasy |
| 2 | Cast | who, age/role, one silhouette trait, one signature prop | 1 hero + 1 rival, original designs; the hero's prop returns in every act |
| 3 | Brand | name, wordmark text, tagline, partner line | invented placeholder name (<= 8 letters), tagline <= 4 words, lettering designed from scratch; mark it "placeholder" |
| 4 | Music | a track the user owns or licensed / tempo and mood / none | track: go to section 4 with it. None: plan on a 120 BPM grid (15 frames per beat at 30 fps), render silent, re-snap with `beat_check.py check` when music arrives |
| 5 | Format | platform, aspect, length | 16:9, 30 fps, composition 1280x720 rendered at 1.5x, 30-40 s (fast lane: the length asked for). Other aspects: compose natively (e.g. 720x1280) and keep type inside safe margins; the reference-comparison sheets (`compare.py`, `grid.py`, `shotsheet.py`, `strip.py`) assume 16:9 |

## 2. Three directions (gate 1)

Give every direction a value on each of seven axes:

1. **Palette**: dominant + accent + neutrals as hex, and the accent's share of the frame.
2. **Type**: face class, weight, case, layout logic (flat, perspective plane, stacked, vertical).
3. **Motion grammar and rhythm**: the verbs (snap, slide, stamp, glitch, wipe) and the unit they move in (every frame, on 2s, on the beat). Name them by library ids where one fits (`library/README.md`), so the direction is buildable as written.
4. **Camera**: locked, push-in, whip, orbit, parallax; flat 2D or perspective.
5. **Motif prop**: the one object that recurs and how it changes across the film.
6. **Texture and finish**: flat colour, grain, halftone, paper, scanlines; what the post pass adds.
7. **Music temperament**: tempo range, steady or broken pulse, section shape.

Rules:
- Three directions differ on at least 3 axes (not only palette). Compare row by row; if two agree on 5 or more axes, replace one.
- Every choice reads "because <a fact about the cast, world or music>, so <this treatment>". Bare adjectives ("cool", "premium", "cinematic") are not allowed; write numbers (hex, px at 720p, frames, shots per second).
- Anti-repetition: read earlier `docs/direction.md` files and PVs in the repo; the new directions may not repeat the last film's accent + type class + motion verb. Also off the table by default: navy + cyan/magenta neon, glass cards, a centred sans title with a lens flare.
- Borrow grammar, never pictures. A known PV may teach a single accent colour on black and white, type on a perspective plane, shot lengths rounded to beats, a 1-frame black flash before the climax, ID cards. Its characters, logo shapes, lettering and compositions stay out (SKILL.md rule 2).
- Where to look for current motion ideas (optional, a few pages, text notes only): recent.design (successor of godly.website; the Motion category and its Style / Interaction tags), the Sites of the Day list on awwwards.com, and the open demo repos of Codrops on GitHub. Read pages politely (robots.txt, one request at a time, no bulk crawling), keep only your own paraphrase of what moves, how long and how it eases; never store screenshots, clips or code (their terms are all-rights-reserved). Code is copyable only from a repo whose raw LICENSE file is MIT / Apache-2.0 etc. (many Codrops repos have no LICENSE file: learn-only).
- Spread the risk: one direction fits the music most safely, one is bold, one is an outside bet.

Template for `docs/direction.md` (one block per direction):

```markdown
## Direction A: <2-3 word name>
<one line: what it looks and feels like>
| Axis | Choice (numbers) | Because ... so ... |
|---|---|---|
| Palette | bg #0B0B0F, ink #F2EFE6, accent #FF3B2E (<= 12% of frame) | because the hero's flare is red, so red appears only where the flare is |
| Type | ... | ... |
| Motion and rhythm | ... | ... |
| Camera | ... | ... |
| Motif prop | ... | ... |
| Texture and finish | ... | ... |
| Music | ... | ... |
Differs from B on: palette, camera, texture (3).  Risk: ...  Cost: tier mix from section 5.
```

Show the three side by side and let the user pick one, or mix by axis ("A's type, B's camera"). Non-interactive run: pick the direction that best serves the brief's hero moment and the music grid, and write why. Do not default to the safest or flattest one: a locked 2D camera is cheaper only when assets are generated, not when everything is drawn in code, and a perfect beat grid supports camera moves, not fewer of them.

## 3. Style bible (after the pick)

`docs/style-bible.md`, one page, mirrored in `src/core/style.ts` so every act reads the same tokens.

```markdown
# Style bible: <title>
Palette: bg #…  ink #…  accent #…  shadow #…   accent <= N% of any frame
Type: display <font, weight>, body <font>; sizes at 720p: title / word / caption; tracking; case; fonts checked for licence
Motion: tick = <a whole divisor of frames per beat: `beat_check.py grid` prints candidates, e.g. 3, 5 or 15 at 15 frames per beat; 2 only when the beat is an even number of frames; none printed = a fractional beat (14.06 frames at 128 BPM): take 2 or 3 and still cut on `beat_frames`> (every duration is a multiple); in = <named cubic-bezier>, glitch = steps(); <= 1 overshoot; character art holds on 2s
Shot lengths: x% = 1 beat, y% = 2 beats, z% = 4 beats, at most one hold over 8 beats (the hero)
Camera: allowed moves <list>; max zoom per shot <n>x; shake only on hit frames, +-3 px for 4 frames
Motif: <prop>, four stages: close-up -> silhouette -> tinted -> shards, placed in acts <..>
Forbidden: <list>
Assets: cast cards, prop sheet, plates (file names)
```

Forbidden always includes: franchise characters, emblems or lettering; building the brand wordmark with a known logo's construction (pixel glyphs, stencil line, bevelled slab), so design the letterforms from scratch; any motif not in the bible (a theme leaking from earlier work counts); default gradients; stock lens flare or particles; unlicensed fonts.

## 4. Music-first shot list (gate 2)

1. Beat grid: `python $SKILL/scripts/beat_check.py grid music.wav --json out/beats.json` gives BPM, frames per beat, on-onset share and `beat_frames` (use `beat_frames`; `first_beat_s` is only the grid phase).
2. Cut on `beat_frames` entries, never on `frames_per_beat * n` (fractional beats drift). The film starts at frame 0. `beat_frames` may begin with 0 (a hit on the first frame; that is the start, not a cut) or with the first beat after it; every later entry is a possible cut point, and a shot is the gap between two entries, so its length is a whole number of beats. With transitions between shots, pass the shot lengths through `transitionPlan()` (library/core/beats.ts) so each overlap swaps on its planned frame. Put the 1-frame black flash on the frame before the drop beat; the next shot starts on the drop.
3. On-onset below 60% (the script says "weak pulse"): the pulse is not steady, so do not force a grid. Trial-cut on phrase starts and heavy hits and run `beat_check.py check music.wav --frames <f1>,<f2>,...`; it flags cuts far from an accent and lists the strongest accents no cut uses. Lengths stay whole ticks, not whole beats.
4. Mark sections (intro, verse, build, drop, outro) with frame ranges at the top of the shot list; acts follow the sections. A bare metronome or click track has no sections: say so, make them from bars (e.g. 4 bars = 8 beats per section), and let cut density and hit strength carry the build and the drop, since the audio will not. Sound design (risers, impacts, whooshes) is outside this skill: note it for the user instead of inventing it. A starting skeleton for 30-40 s, to adapt rather than copy:
   - Act 1 hook: black, one hit, the motif's first close-up (2-4 beats).
   - Act 2 world: place and premise in two or three type slams.
   - Act 3 cast: one ID card per character, same card layout, different pose and number.
   - Act 4 brand: the wordmark slams in on a downbeat, with the partner line.
   - Act 5 systems: kinetic words and prop close-ups, cuts get shorter.
   - Act 6 build: the motif as a silhouette, then tinted; densest cutting so far.
   - Act 7 climax and end: 1-frame black, the motif in shards, the final lockup held.
5. Each cut carries one continuity element: screen direction, a shape, a colour or a sound hit. Consecutive shots of one figure use one shared placement constant (SKILL.md rule 4).
6. Write `docs/shot-list.md`, then mirror it into `src/core/timeline.ts` (`start` = frame / 30) so `beat_check.py check`, `film_scan.py` and `animatic.py` can read it. One shot per line, with `id`, `start`, `end` in that order (seconds; ids S01, S02 ...; the last `end` may be `DURATION_S`, i.e. `DURATION_FRAMES / 30`), plus the frame total: `{id: 'S01', start: 0.0, end: 0.5, act: 'act1', kind: 'flare'},` and `export const DURATION_FRAMES = <n>;`

```markdown
| Shot | Beats / frames | Picture | Text | Motion (code) | Asset card | Transition |
|---|---|---|---|---|---|---|
| S01 | 1 / 15 | black, red flare rises bottom-right | none | flare y-lift on 2s | prop-flare | hard cut on beat |
| S02 | 2 / 30 | hero ID card, flat | "KUROKI / 07" | card slams in 4 frames, 1 overshoot | cast-hero | match cut: card edge = next shot's slash |
```

7. Animatic: give every shot one still named after its shot id (`out/boards/S01.png`, `S02.jpg` ...; a flat board with its number and text drawn in code is enough) and run `python $SKILL/scripts/animatic.py --root . --images out/boards --music music.wav --beats out/beats.json -o out/animatic.mp4` (reads `timeline.ts`; or `--shots shots.csv` with id, image, seconds/frames; `--beats` snaps each cut to the nearest beat within 6 frames and prints every move; missing boards become numbered grey cards). It writes a rough cut with shot numbers burned in. Judge rhythm and length only. Re-cutting costs nothing; generate no assets before the user accepts the pacing.

## 5. Gates and workload

Each gate ends with an explicit approval. Do not start the next one without it (fast lane: see the top of this file).

| Gate | Deliverable | Command / how | Decides |
|---|---|---|---|
| 1 | style direction (section 2) | `docs/direction.md` | the look |
| 2 | beat map + shot list + animatic (section 4) | `beat_check.py`, `animatic.py` | rhythm, length, budget |
| 3 | 12 key static boards (opening, cast cards, brand lockup, motif stages, climax hit, end card) | `npx remotion still PV out/boards/B01.png --frame=N`, then `ffmpeg -y -i out/boards/B%02d.png -vf "scale=480:-1,tile=4x3" -frames:v 1 out/boards/sheet.png` | palette, type, art; AI stills are made and approved here |
| 4 | a 5 s sample of the densest passage, final quality, with music | `npx remotion render PV out/c_v.mp4 --frames=270-419 --muted --image-format=png --color-space=bt709`, then `ffmpeg -y -i out/c_v.mp4 -ss 9 -t 5 -i music.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest out/c.mp4` (-ss = first frame / 30) | motion grammar; build the other acts only after this, in parallel per act (`pipeline-recipes.md` section 9; skip that under 20 s) |
| 5 | full 720p preview with music | `node $SKILL/scripts/render-chunks.mjs 0-<last>` (`<last>` = `DURATION_FRAMES` - 1; one range is fine up to about 360 frames, split longer films as in `deliver.md` section 1; add `PV_SCALE=0.5` for a quick 640x360 draft while iterating), then `PV_AUDIO=music.wav node $SKILL/scripts/render-chunks.mjs --join`; look at it with `contact_sheet.py out/pv.mp4` (one tile per shot with frame numbers; `--cuts` shows both sides of every cut, `--beats beats.json` the frame on each beat), then `film_scan.py out/pv.mp4 --allow ...` (list the intended holds and black beats) and `beat_check.py check music.wav` (on a bare click track it only proves the cuts sit on the grid); finally `cut_detect.py out/pv.mp4 --truth` compares the hard cuts it finds in the render with `timeline.ts` (recall / precision at +-1 frame; dissolves and wipes do not show up as cuts) | go to delivery (deliver mode, `PV_SCALE=1.5`) |

Estimate before gate 3 and show it with the animatic. Tag every shot A, B or C:

| Tier | Typical shot | Assets | Estimating rule |
|---|---|---|---|
| A | kinetic type, colour-block or wipe transition, flash | none, code only | one build pass plus one fix; 0 credits |
| B | a shot with a character or prop image | 1 still per pose, plus placement in the per-shot slot | credits = accepted stills x 2-3 attempts x 8; two critique rounds |
| C | climax, multi-layer effect, perspective type, WebGL, particles | code, plus art for any prop | 3+ refine rounds, built first, the main model owns it; render in chunks, concurrency 2 |

Image price and timing from the case study: 8 credits and 60-100 s per 2K image, 4-5 minutes for a chunked 1080p render of a 36 s film. Prices change, so confirm them with the user's account. Clips default to 0 (24 credits each, and 5 of 9 went unused). Example: 2 cast x 3 poses + 1 prop sheet + 3 plates = 10 accepted stills x 2.5 attempts x 8 = about 200 credits. Write the tier count and the credit total at the top of `shot-list.md`; the user approves the spend.

## 5b. When everything is drawn in code

If the brief has no art and no AI stills are wanted, the plates are code too. What worked in one measured trial (a 12 s trailer; the art took about 3 minutes, a figure from that one brief, not a promise): a skyline as 3-4 seeded parallax layers with seeded lit windows and a neon sign; a character as a flat joint-driven silhouette (SVG polygons on a small skeleton, a rim-light copy offset a few px, cloth as a ribbon path that lags the body by a few frames); a prop as an isometric box (three polygons) with one label detail; a wordmark as hand-built glyph paths with one letter replaced by the motif; fonts: system faces only unless a font file ships with the project, pick one display and one mono, and use named instances for condensed cuts (`font-stretch` is not supported by the text measuring). Set `fontFamily` explicitly on every text effect (the library's default stack is not loaded, so the glyphs depend on the machine). Check every plate as a still before animating it. Silhouettes stay crude unless someone spends real time on anatomy: favour extreme close-ups, cropped bodies and motion over full-body poses.

## 6. Anti-AI-look rules

Run this list on the boards (gate 3), the sample (gate 4) and the preview (gate 5). Each item is checkable. They fit a fast-cut PV: fast is allowed, mush is not.

1. **One focal point per shot.** Name it in three words; only it carries the accent colour or the highest contrast.
2. **Type outranks decoration.** No ornament larger than the word it dresses; at most 4 words on screen per shot.
3. **One rhythm unit.** Every tween length is a multiple of the bible's tick, and every hit (slam, stamp, cut) lands on a `beat_frames` entry; exceptions are listed in the bible.
4. **Palette budget.** At most 3 hues plus neutrals in the whole film; every colour sampled with `frame_measure.py colors` is in the bible.
5. **No default look.** `grep -rE "linear-gradient|box-shadow|blur\(" src --exclude-dir=s17` (the copied library is excluded) and justify every hit in the bible; no glow on everything, no glass, no drop shadows on flat shapes.
6. **Cut or snap, do not dissolve.** No crossfades unless the bible allows one; entrances take 2-6 frames; a hold is stillness, not a slow drift (no Ken Burns on every still).
7. **Scale steps.** Consecutive shots change subject size by at least 1.5x or switch angle; two similar framings in a row is a bug. At least 3 extreme close-ups or oversized type frames per film.
8. **Specific beats generic.** Invent concrete details (ID numbers, dates, coordinates, serials) and trace every prop and word to the brief. "Lorem", "YOUR TEXT", stock icons and unnamed placeholders are defects.
9. **Grid and asymmetry.** Type sits on a declared grid, deliberately off-centre; centred layouts only on the title card. AI stills carry no text, and are restyled in code (flat tones or gradient map into the palette) until no raw render gloss or soft glow shows.
10. **Density curve.** Count cuts per second per act: the lead-in is the sparsest, the climax act the densest, with one near-empty beat or the 1-frame black right before it. A film equally busy everywhere reads as generated.
