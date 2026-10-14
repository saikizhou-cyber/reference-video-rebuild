# S17 motion library

Code-only motion effects for Remotion PVs, trailers and motion graphics: transitions, kinetic type, camera moves, post FX, shapes / HUD and edit-timing recipes. Every effect is a pure function of the frame (deterministic, renders the same every time), sized in 720p units so it scales to any composition, and has a gallery demo you can see in the contact sheets (`previews/<category>.jpg`, shown at the top of each `catalog/<category>.md`).

Collected from the best permissively licensed sources (MIT / Apache-2.0 / zlib / ISC) and rewritten for Remotion, plus effects generalised from a finished 57-shot PV. Ported code keeps its notice (file header + [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)); ideas from learn-only sources were reimplemented from scratch.

## Use an effect

1. Find it: the index under *Catalog* names every effect; open the category file it links to (`catalog/<category>.md`) for the contact sheet (six frames per effect), what you see, when to use it, props and traps.
2. Copy it: `python gallery/pick.py slam-text,impact-cut,glow --to src/s17` (from this folder, or `$SKILL/library/gallery/pick.py`). It copies the effects you name plus the `core/` parts and `_*-utils` helpers they import, keeping the library layout under `--to`, and prints the npm packages the copied files need. `--dry` only lists. Group files and `index.ts` are the library's own registry and are not copied, so nothing you did not pick comes along. Two helpers that no effect imports can be named like effects: `place` (`<Place>`) and `beats` (`transitionPlan`).
3. Install what `pick.py` printed, at the same version as your Remotion (4.0.530 tested): `remotion` always; `@remotion/transitions` (40 effects, every shader effect and transition), `@remotion/layout-utils` (13), `@remotion/paths` (3) or `@remotion/noise` (1) for the ones that import them; and `gsap` only for the 5 that use it (catalog: "needs `gsap`"). Copying whole folders by hand instead means installing everything in `package.json`, because a folder's group files import every effect in it.

**Not limited to Remotion's packages.** Three.js / react-three-fiber, GSAP, anime.js, Lottie, d3, p5, raw WebGL or canvas all work inside a Remotion composition as long as the frame number drives them: create timelines paused and `seek(frame / fps)`, step simulations from a seed for every frame, never let a library run its own clock (`requestAnimationFrame`, `Date`). The only hard rules are frame purity (so renders are exact) and the licence rule for *copying* code into this repo; using a package as a dependency follows that package's own licence. Only 5 effects need a package from outside `@remotion/*` (`gsap`); `pick.py` prints exactly what the ones you picked need.

**GSAP** (free including commercial use and every plugin - SplitText, MorphSVG, DrawSVG, MotionPath, CustomEase...; its own [no-charge licence](https://gsap.com/standard-license) forbids only building no-code visual animation tools that compete with Webflow) is wired in through `core/gsap.ts`:

```tsx
const scope = useGsapTimeline((tl, q) => {               // one paused timeline, seeked to frame / fps every frame
  tl.from(q('.char'), {yPercent: 110, stagger: 0.02, ease: 'expo.out'});
});
return <div ref={scope}>...</div>;

useGsapAt(build, presentationProgress);                 // same, driven by any clock (e.g. a transition's progress)
interpolate(frame, [0, 20], [0, 1], {easing: gsapEase('elastic.out(1, 0.35)')});  // any GSAP ease in plain Remotion code
```

Measured: timelines with grid staggers, MotionPath, MorphSVG and SplitText line masks render pixel-identical across separate browser processes, once transforms are 2D (the hook sets `force3D: false` by default; GSAP's GPU layers rasterised glyph edges differently per tab). Lint rejects GSAP's random features (random staggers, `random()` values, RoughEase, ScrambleText) and bare `gsap.to()` outside the timeline.

Each effect file has a `Demo` at the bottom that shows real usage. The four kinds:

```tsx
// transitions: presentations for <TransitionSeries>
<TransitionSeries.Transition presentation={barWipe({bars: 5})} timing={linearTiming({durationInFrames: 18})} />

// kinetic type and shapes: components that start at frame 0 of their <Sequence>
<Sequence from={30}><SlamText text="DRAW" /></Sequence>

// shader FX: Remotion effects (createEffect) applied to any subtree, image or transition
<Filter effects={[halftone({size: 8}), filmGrain({seed: filmGrainSeed(frame, 2)})]}>{scene}</Filter>
<Img src={still} effects={[gradientMap({colors: ['#080625', '#ff3d7a', '#fffbe8']})]} />

// camera and timing: wrappers
<CameraShake hits={[30, 60]}>{scene}</CameraShake>
```

**Shader effects and shader transitions** capture the DOM with Remotion's HTML-in-canvas: rendering needs Chrome 149+ (what Remotion 4.0.5xx downloads and enables) with a GL backend (`Config.setChromiumOpenGlRenderer('angle')`, or `'swangle'` without a GPU). In Remotion Studio enable `chrome://flags/#canvas-draw-element`.

## Placing and timing (read before using effects in a real film)

Found by building a 12 s trailer with these effects; each of these cost a real user time.

- **Off-centre layouts: wrap in `<Place>`** (`core/place.tsx`). Text and shape effects fill the frame and centre themselves. `<Place x={90} y={640} w={640} h={140} anchor="bottom-left">...</Place>` puts one in an explicit box (px at 720p). The box has a real size, which also stops `Glow` from collapsing to 0 x 0 (its layers are absolutely positioned: size its parent). Text effects size from `fontSize`: set it so the word fits the box.
- **Cutting on the beat with transitions: `transitionPlan`** (`core/beats.ts`). `<TransitionSeries>` overlaps the two scenes, so a cut planned on beat frame B lands d / 2 frames early. `shotFrames` are the planned shot lengths (cuts on beats), `gaps[i]` the whole-frame transition after shot i (0 = hard cut, one fewer than shots). Give each `<TransitionSeries.Sequence>` `durations[i]` from `const {durations, pre} = transitionPlan(shotFrames, gaps)` (`transitionPadding` returns just the durations) and the middle of every overlap lands on its planned frame (measured: hard cut on frame 30, an 8-frame fade whose 50 % mix is exactly frame 60), with the film length unchanged. It throws when a transition is longer than a neighbouring padded shot. Two things it cannot do for you: inside shot i, local frame 0 is now `pre[i]` frames before the planned start, so a hit planned k frames after the cut is at local frame `pre[i] + k`; and the presentation has to swap in the middle of its overlap (`impactCut` swaps at `cutAt` 0.3 by default and so starts its flash early: pass `cutAt` = floor(d / 2) / d, which is 0.5 for an even d; measured on a 10-frame overlap: default flash from frame 28, with 0.5 from frame 30, planned 30; for an odd d, 0.5 would land a frame late).
- **`BarReveal` `align`** aligns the lines to the edge of its own box, and that box is as wide as its parent: in a full-frame container `left` means the frame edge (plus the 0.16 em bar padding), in a centring flex parent the box shrinks to the text and `align` does nothing. To put it off-centre use `<Place x y w h anchor="top-left">` (the default `anchor="center"` puts x, y at the box centre).
- **`TelemetryReadout`** values are still scrambled at the end of a short shot with the default cues (the last of 4 resolves on frame 46): pass `cues` and `tickFrames` that finish before the shot does.
- **Defaults come from the demo palette and are not your style bible**: yellow flash cards, 14 px shakes, a 6-frame black in `TrailerHook`, a display-font stack that is not loaded (the glyphs depend on the machine). Pass your bible's colours, frame counts and `fontFamily` on every effect you use.
- **Video colour**: render with PNG frames and `bt709` (`remotion.config.ts` here and `render-chunks.mjs` do); the Remotion default (JPEG frames) gives `yuvj420p`, full range, with only a `bt470bg` matrix tag and no transfer or primaries.

## Use Remotion's built-ins first

`@remotion/transitions` already ships these, so the library only adds looks they lack (its `swish` is a zoom-through into a single point at 5x):

| need | built-in |
|---|---|
| crossfade, slide, wipe, flip, clock wipe, iris | `fade` `slide` `wipe` `flip` `clockWipe` `iris` |
| zoom through, warp, dreamy zoom, film burn, burn dissolve, ripple | `crossZoom` `crosswarp` `dreamyZoom` `filmBurn` `dissolve` `ripple` |
| whip with motion blur, push cut, 3D swap, book flip, zoom blur | `blurSlide` `pushCut` `swap` `bookFlip` `zoomBlur` `linearBlur` `zoomInOut` |

Remotion's `Easing` covers quad / cubic / sin / exp / circle / back / elastic / bounce / bezier; `core/easing.ts` only adds motion-design curves, spring presets, on-twos stepping, stagger and beat helpers.

## Catalog

<!-- catalog:start -->
106 effects in 6 categories. Open a category file for what each effect looks like, when to use it, its props, its traps and its source, under the category's contact sheet (each row shows six frames of the effect's gallery demo). An effect's id is its file name in `effects/<category>/`.

| category file | effects (id and name) |
|---|---|
| [Transitions (23)](catalog/transitions.md) | `bar-wipe` Bar wipe · `blob-reveal` Blob reveal · `comic-panels` Comic panels · `crt-off` CRT off · `dust-dissolve` Dust dissolve · `flare-sweep` Flare sweep · `glitch-cut` Glitch cut · `halftone-wipe` Halftone wipe · `impact-cut` Impact cut · `ink-blot` Ink blot · `lens-punch` Lens punch · `pixelate` Pixelate · `revolve` Revolve · `screen-melt` Screen melt · `shape-burst` Shape burst · `shatter` Shatter · `spiral-cover` Spiral cover · `strobe-cut` Strobe cut · `swish` Swish · `text-mask-zoom` Text mask zoom · `tile-wipe` Tile wipe · `velvet-curtain` Velvet curtain · `versus-slam` Versus slam |
| [Kinetic type (21)](catalog/text.md) | `bar-reveal` Bar reveal · `beat-words` Beat words · `char-cascade` Char cascade · `dust-text` Dust text · `echo-stack` Echo stack · `extrude-pop` Extrude pop · `glitch-text` Glitch text · `mask-rise` Mask rise · `number-roll` Number roll · `outline-draw` Outline draw · `paragraph-reveal` Paragraph reveal · `rush-type` Rush type · `scramble-decode` Scramble decode · `slam-text` Slam text · `sliced-text` Sliced text · `split-flap` Split flap · `text-cylinder` Text cylinder · `tracking-in` Tracking in · `type-plane` Type plane · `type-wall` Type wall · `typewriter` Typewriter |
| [Camera (13)](catalog/camera.md) | `bullet-time` Bullet time · `camera-shake` Camera shake · `card-flurry` Card flurry · `crash-zoom` Crash zoom · `dolly-zoom` Dolly zoom · `dutch-roll` Dutch roll · `handheld` Handheld · `kanada-snap` Kanada snap · `letterbox` Letterbox · `parallax-stack` Parallax stack · `rack-focus` Rack focus · `slow-push` Slow push · `smear-frames` Smear frames |
| [Post FX and hits (22)](catalog/fx.md) | `analog-glitch` Analog glitch · `ascii-glyph` ASCII glyph · `block-glitch` Block glitch · `crt` CRT screen · `film-grain` Film grain · `glow` Glow / halation · `god-rays` God rays · `gradient-map` Gradient map · `halftone` Halftone · `impact-frame` Impact frame · `ink-edges` Ink edges · `lens-shift` Lens shift · `light-leak` Light leak · `light-streak` Light streak · `posterize` Posterize / cel · `rgb-split` RGB split · `riso-hit` Riso hit · `screen-texture` Screen texture · `shockwave` Shockwave · `slice-glitch` Slice glitch · `vhs` VHS tape · `zoom-blur` Zoom blur |
| [Shapes and HUD (18)](catalog/shapes.md) | `alert-burst` Alert burst · `confetti` Confetti · `hud-frame` HUD frame · `line-unfold-panel` Line unfold panel · `motion-path` Motion path · `path-draw` Path draw · `pattern-scroll` Pattern scroll · `progress-ring` Progress ring · `radial-burst` Radial burst · `rec-overlay` REC overlay · `reticle-lock` Reticle lock · `shape-morph` Shape morph · `shard-spray` Shard spray · `shockwave-rings` Shockwave rings · `speed-lines` Speed lines · `svg-morph` SVG morph · `telemetry-readout` Telemetry readout · `trim-burst` Trim burst |
| [Edit timing (9)](catalog/timing.md) | `beat-accelerando` Beat accelerando · `blackout-slam` Blackout slam · `cadence-shift` Cadence shift · `flash-freeze` Flash freeze · `gsap-eases` GSAP ease lanes · `hit-stop` Hit stop · `speed-ramp` Speed ramp · `strobe-blackout` Strobe blackout · `trailer-hook` Trailer hook |

<!-- catalog:end -->

## Gallery, checks and tooling

```bash
cd library && npm i
npm run studio       # every demo, grouped by category (Remotion Studio)
npm run typecheck    # tsc
npm run lint         # python gallery/lint.py: deterministic code, declared packages, metadata, ported headers, registration
npm run previews     # render stills + determinism check (same frame twice, another frame in between) + contact sheets -> previews/
npm run catalog      # (after previews) rewrite the index above, catalog/*.md and the library section of ../THIRD_PARTY_NOTICES.md
```

Measured on this library (106 effects): type-check clean, lint clean, every demo renders; 89 effects are pixel-identical on re-render and 17 differ by at most 2 levels of rasteriser noise; none depends on render order.

## Add an effect

One file per effect in `effects/<category>/<id>.tsx`, exporting the effect, its props type and a `LibraryEntry` (`meta` + `Demo`); register it in the category's group file. `npm run lint` enforces: everything from `useCurrentFrame()` and props (no `Math.random`, `Date`, timers, `requestAnimationFrame`, CSS animations, GSAP random features or bare `gsap.to`); imports only from `react`, `remotion`, `@remotion/*` or a package declared in `package.json`; the `meta` fields; that a `ported` source has its `// Ported from ...` header; registration. By convention (not checked): sizes in 720p units via `useUnit()` (shader effects scale in the shader), extra packages also listed in `meta.deps`, and code copied only from MIT / Apache-2.0 / BSD / ISC / zlib / CC0 sources (`npm run catalog` then adds it to the third-party notices). Look at the contact sheet before calling it done.
