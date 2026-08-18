# Metro — an interactive isometric city map

**Live: https://mehedihasan27.github.io/Citymap/**

Opens on a globe, falls through a country, and lands on a Seedance 2.5 city-tile render
turned into a clickable map. Seven districts, hover to find, click to open. Built on the
same Seedance x Three.js pipeline used for the author's other story-site concepts.

```bash
npm install
npm run dev
```

| Flag | Effect |
|---|---|
| `?debug` | draws the district hit-diamonds over the footage, and exposes `__metro.seek(p)` for scrubbing the descent |
| `?nointro` | skips the descent and opens straight on the map |

---

## The descent

`globe.js` — a dot-matrix Earth that rotates the target under the camera and falls into it,
handing over to the city plate.

**Real-time geometry, not a generated shot.** The descent has to land on the exact framing
of a locked plate. A generated video would have to match a frame it has never seen, and
Seedance cannot be aimed at a named country. A camera can be aimed at both, costs no
credits, and re-times in a line of code.

- **Land is drawn from coarse polygons** (`world.js`), not a geodata file. The globe renders
  as dots, so a high-resolution coastline would be quantised away — these read correctly at
  dot scale for a few hundred bytes. Antarctica is a latitude rule, because a polar cap
  crosses the antimeridian and a flat lon/lat ray cast cannot express that.
- **Dots are sampled equal-area** — longitude samples per ring scale with `cos(lat)`. A plain
  lon/lat grid piles dots at the poles and thins them at the equator, which reads as a lit
  pole rather than a globe. ~24k dots at 0.72°.
- **A graticule does most of the 3D work.** Land alone leaves no reference across open ocean
  and the sphere reads as a flat sticker; meridians and parallels curving over the limb say
  "ball" immediately.
- **Orientation is yaw-then-pitch, not a slerp.** A slerp between two orientations takes the
  shortest arc, which is a nudge — it cannot spin. Decomposing lets the yaw carry whole extra
  turns that unwind into the target, so the globe spins down onto the country and decelerates
  into the lock. The opening longitude is set explicitly (`START_LON`), because otherwise
  whatever fraction of a turn you pick decides it, and most fractions open on empty Pacific.
- **Draw order is explicit.** Every globe layer is transparent and centred on the same origin,
  so Three's depth sort has nothing to separate them by and the shell can end up painting over
  the very dots it exists to back. Shell first (writing depth, so it occludes the far
  hemisphere), then graticule, dots, rim, marker.
- **The interior is a shaded solid.** Without it, far-side dots show through and the globe
  reads flat. It is shaded rather than flat-filled because on a paper background an unshaded
  sphere is indistinguishable from a disc.
- **Framing distance is computed per resize.** The camera fov is vertical, so on a tall phone
  the horizontal field is much narrower and a fixed distance lets the globe overflow the
  sides. It frames against whichever axis is tighter.
- **The marker is gone before the camera arrives.** A ring sitting on the surface becomes a
  screen-filling blur the instant you fly into it.
- The plate fades up from `p 0.66` and arrives slightly over-zoomed, so it keeps moving for
  a beat after the globe has gone and the handover reads as one continuous fall.

Move the whole thing somewhere else by editing `TARGET` in `globe.js` — lat/lon, country
name, and a rough outline ring to pick out in accent.

---

## Why the footage supports interaction

The hero shot was generated locked: measured across all 241 source frames, the static void
and tile-edge zones drift by MAE 0.4–0.8 / 255, which is codec noise, not camera movement.
Because nothing moves, **a point on the plate is a point on the city, permanently** — so
district hitboxes are hardcoded normalized coordinates in `src/districts.js` and need no
tracking. That property is the whole reason this works; if the camera ever breathed, every
hotspot would slide off its block.

## The loop

The raw generation does **not** loop — the elevated trains never return to their start.
Measured: frame 0 vs frame 240 differ by MAE 0.959, and no frame anywhere in the clip dips
back toward frame 0 (best back-half candidate was 0.885), so there is no clean cut point
to trim to.

Fixed with a 0.625 s crossfade instead, which works precisely *because* the camera is
locked and the moving elements are a few pixels wide:

```bash
ffmpeg -i city-iso.mp4 -i city-iso.mp4 -filter_complex \
  "[0]trim=start=0.625,setpts=PTS-STARTPTS[a];[1]trim=duration=0.625,setpts=PTS-STARTPTS[b];\
   [a][b]xfade=transition=fade:duration=0.625:offset=8.7917[v]" \
  -map "[v]" -c:v libx264 -crf 16 -pix_fmt yuv420p -an city-iso.loop.mp4
```

Seam went 0.959 → 0.441 MAE, and an amplified difference of the seam shows the four hard
train bars are gone — what is left is diffuse noise, not object displacement.

## Two plates, one frame

| State | Texture | Why |
|---|---|---|
| Wide | `city-iso.web.webm` (245 KB) / `.mp4` (1.1 MB) | the city is alive — traffic, trains, cloud shadows |
| Opened | `city-iso.jpg` @ 2752px | at 2.4× zoom a 1280px video is mush; the still is 2.5× sharper |

The camera never moves, so the two are the same frame and the crossfade between them is
invisible. This is what makes "click to go in" hold up at 720p source resolution.

## Things worth knowing before editing

- **Colour space, and it cuts both ways.** Raw `ShaderMaterial` gets no output encoding
  injected, so anything feeding one must stay in display space — hence `NoColorSpace` on the
  textures and the `srgb()` helper in `globe.js`. Built-in materials (`MeshBasicMaterial`,
  used for the globe marker) *do* get the encoding, so they want the normal linear
  `THREE.Color`. Mixing the two up renders one of them dark and the other washed out.
- **Guard degenerate resizes.** A resize can fire at 0×0 — hidden container, mobile rotate,
  restoring window — and `0/0` is `NaN`. That `NaN` runs fit → baseZoom → target.zoom →
  view.zoom, and since each is derived from itself through `damp()` it never washes out: the
  plate's UVs stay `NaN` and the map is gone until reload. `updateFit` clamps on the way in.
- **One transform, two readers.** `view` (fit / focus / zoom) is read by both the shader
  and the pointer maths. They must never diverge or hotspots drift. Mouse parallax is
  applied to `focus` for the same reason.
- **Contain, don't cover.** Pure cover-fit crops a 16:9 plate on a 9:19.5 phone hard enough
  to throw two districts off screen. `baseZoom` zooms out until the city box fits.
- **The void is not flat.** It carries a gradient (#ecece4 top-left → #dad7d2). The shader
  clamps its sample rather than painting a constant, which extends that gradient seamlessly
  past the plate edge. Any single fill colour leaves a visible band.
- **`--paper` is that measured void**, so the page and the diorama are one surface. The type
  tokens are picked to clear WCAG AA against it — the obvious lighter greys fail at 11–15px.
- **The detail drawer has an edge, not a fade.** It used to dissolve into the render across
  its full width, which put the left column of copy — and the first stat in the row — on top
  of live city detail, so text and map cut into each other. It is now solid ground with one
  hairline and a shadow. Below 900px it becomes a bottom sheet, because a 430px side drawer
  buries the map it is describing; `view.sheet` tracks that same breakpoint so an opened
  district is nudged up rather than sideways.

## Accessibility

Districts are real `<button>`s in the DOM: tab order, `aria-label`, focus-visible rings, and
focus drives the same highlight hover does. All copy is DOM text, never baked into the
video, so it is selectable and localizable. `prefers-reduced-motion` drops to the still with
no scrub or zoom animation. The canvas is `aria-hidden` — it is decorative; the buttons
carry the content.

## Not yet generated

`city-day.mp4` — the dawn→night pass on this same locked frame. It is the highest-value
remaining shot: same framing means it cross-fades against the hero, giving a time-of-day
slider for one generation. Prompt is in [`CITY-MAP-PROMPTS.md`](CITY-MAP-PROMPTS.md).

`_src/` holds the generation masters (PNG, raw mp4, pre-encode loop). Not shipped — `public/media/`
is the web payload, 1.9 MB total.
