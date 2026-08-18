# METRO — Seedance 2.5 generation sheet (SimCity-style interactive city map)

An isometric city diorama on a floating tile, generated as video, turned into a clickable
3D map on the site. The film supplies the world; Three.js supplies the pointer.

**The rule the whole concept hangs on: the hero shot is LOCKED. Zero camera movement, zero
zoom, zero drift.** A fixed frame means each district lives at a fixed screen coordinate, so
hotspots can be hardcoded once and never drift. If the camera breathes even slightly, every
click target slides off its building and the map stops working.

Palette (locked, repeat in every prompt): slate `#0E1726` · concrete `#E8E4DC` ·
terracotta `#D2734A` · park green `#5E9B62` · water teal `#2E8C9E` · signal amber `#F2A93B`

---

## What to generate

| # | Shot | Still | Video | Purpose on the site | Status |
|---|------|-------|-------|---------------------|--------|
| 1 | `city-iso` | ✅ | ✅ | **The map.** Locked hero loop. Every hotspot lives here. | **done — built into `metro/`** |
| 2 | `city-day` | — | ✅ | Time-of-day slider — same locked frame, dawn→night | **next, highest value** |
| 3 | `city-orbit` | — | ⚪ | Scroll-driven rotation, "it's really 3D" beat | not generated |
| 4 | `city-dive` | — | ⚪ | Click a district → camera drops into it | not generated |

> **What shot 1 actually delivered.** The camera came back genuinely locked — across all 241
> frames the static zones drift by MAE 0.4–0.8/255, which is codec noise. That is what makes
> the hotspots possible. The render also produced a seventh district (the north warehouse
> block) beyond the six asked for, so the site ships seven.
>
> The one thing the prompt did **not** get: the loop. The trains never return to their start
> (frame 0 vs frame 240 = MAE 0.959, with no better cut point anywhere in the clip). Fixed in
> post with a 0.625 s crossfade — see `metro/README.md`. **For shot 2 onward, keep the
> "returns to its starting position" clause but do not rely on it**; budget for the crossfade.

**Minimum viable: 1 still + 2 videos (shots 1 and 2).** That alone gives a clickable map with a
working day/night scrub. Shots 3 and 4 are upgrades — generate them after you like the hero.

Save to `metro/public/media/`:

```
city-iso.jpg    city-iso.mp4    city-day.mp4    city-orbit.mp4    city-dive.mp4
```

---

## Global Seedance 2.5 settings

```
model:          seedance_2_5
resolution:     720p          (model ceiling — upscale_video after)
aspect_ratio:   16:9          (NOT 21:9 — an isometric city grows up-screen; 21:9 crops the tile into a band)
generate_audio: false
bitrate_mode:   high
```

---

# SHOT 1 — `city-iso` (locked hero loop, 16:9, 10s)

### 1a. Still prompt — generate this FIRST, everything downstream inherits it

```
Locked-off high-angle isometric view, forty-five degrees down, long lens flattening the perspective toward orthographic, of a modern city built as one square floating island tile with clean vertical cut earth edges, centred in a plain empty void the colour of pale concrete #E8E4DC falling off to a soft gradient. Tilt-shift miniature toy realism — everything crisp, model-scale and uncluttered. The tile is divided into six clearly separated, unmistakably different districts, each ringed by a road or water so its border reads at a glance: a compact cluster of glass downtown towers set slightly off centre; a low terracotta-roof residential grid; a green park with a lake and winding paths; an industrial dock quarter with cranes, containers and warehouses; a waterfront marina on a teal channel cutting through one corner; and an open stadium with a running track. A slim elevated rail on piers loops the entire tile. Tiny cars sit on the roads, tiny boats on the water. One large soft key light from upper left at forty-five degrees casting long consistent shadows, cool bounce fill keeping every shadow open and readable with no crushed black. Clear midday, thin haze, a few small soft clouds casting shadow patches on the tile. Slate #0E1726, concrete #E8E4DC, terracotta #D2734A, park green #5E9B62, water teal #2E8C9E, signal amber #F2A93B. Generous empty margin on all four sides so nothing important touches the frame edge. No labels, no signage, no street names, no text, no logos, no UI overlay, no watermark, no visible faces.
```

**Regenerate until the six districts are individually obvious at a glance.** That legibility *is*
the navigation — a user has to know what they're clicking before they click it. Also check the
margin: anything touching the frame edge dies when the site crops to portrait phones.

### 1b. Video prompt

```
Absolutely locked camera on a tripod. Zero movement, zero zoom, zero drift, zero shake — the framing in the final second is identical to the first. The city tile itself never moves, rotates or scales. Only small ambient life animates: tiny cars run steadily along the roads, an elevated train completes exactly one full circuit of the loop and returns to its starting position, small boats trace slow arcs across the teal channel and come back, the lake surface and park trees shimmer faintly, dock crane arms swing slightly and settle back to rest. Thin cloud shadows drift steadily across the tile and pass fully off the far edge. Sun angle, shadow length, exposure and colour hold exactly constant from first frame to last. Single continuous take, no cuts, no camera move of any kind, no text or lettering on screen.
```

```
mode:         omni_reference
duration:     10
aspect_ratio: 16:9
medias:       city-iso.jpg  as  start_image
              city-iso.jpg  as  end_image     ← THE SAME FILE, BOTH ROLES
```

> Same image in both roles → first frame == last frame → the map loops forever with no seam.
> The train "completes exactly one full circuit and returns" is doing the same job for the one
> moving element big enough to give the loop away. Upload the file twice if the UI won't let you
> assign one file to two roles.

---

# SHOT 2 — `city-day` (time-of-day scrub, 16:9, 15s)

Same locked frame as the hero, but the sun crosses the sky. Scroll — or a slider — scrubs it.
This is the single best interaction on the site and it costs one generation.

```
Absolutely locked camera, zero movement and zero zoom, framing identical to the previous shot. Over the take the sun travels in one smooth continuous progression at a constant rate with no jumps or stalls: low morning light from frame left, up to high noon, down to low golden evening at frame right, and finally into blue-hour night. Shadows sweep across the tile, shortening and then lengthening to match. As the light falls, window lights, street lamps, car headlights and the stadium floodlights come up gradually across the districts in warm amber #F2A93B against deep slate #0E1726, until the city reads as a lit model on a dark ground. The city tile never moves, rotates or scales. Cars, boats and the elevated train continue running at a steady rate throughout. Single continuous take, no cuts, no camera move, no text or lettering on screen.
```

```
mode:         omni_reference
duration:     15
aspect_ratio: 16:9
medias:       city-iso.jpg  as  start_image
```

> **Constant rate is load-bearing.** Playback time is bound to the slider, so any speed ramp
> inside the clip feels like the UI is fighting the user's finger.

---

# SHOT 3 — `city-orbit` (scroll-driven rotation, 16:9, 10s) — optional

```
The camera performs one unbroken ninety-degree orbit around the floating city tile at a fixed forty-five-degree height and a fixed distance, constant angular speed on a level track, no zoom, no tilt change, no rack focus, easing to a complete stop only in the final half second. The tile stays exactly centred in frame for the whole move and never itself rotates. The sun stays fixed in the world, so ground shadows stay put on the tile and only the viewing angle changes. Ambient life continues at the same slow rate — cars on the roads, boats on the channel, the elevated train circling. Single continuous take, no cuts, no text or lettering on screen.
```

```
mode: omni_reference · duration: 10 · aspect_ratio: 16:9
medias: city-iso.jpg as start_image
```

> Hotspots are hidden during the orbit and fade back in when it rests — pinning is only valid on
> locked shots. Ninety degrees, not three-sixty: a quarter turn sells the dimensionality and holds
> the districts recognizable. A full spin at 720p turns the far side to mush.

---

# SHOT 4 — `city-dive` (district dive, 16:9, 8s) — optional

```
One unbroken descent from the wide isometric view down toward the downtown tower cluster, constant rate, the forty-five-degree downward angle held throughout, no rotation, no lens change, no rack focus, ending framed on the plaza between the towers with cars and the elevated train still running. The motion is smooth and mechanical, like a crane on rails. Single continuous take, no cuts, no text or lettering on screen.
```

```
mode: omni_reference · duration: 8 · aspect_ratio: 16:9
medias: city-iso.jpg as start_image
```

> Because it starts on the hero's own frame, the dive is a true match-cut out of the map — click
> a district, the map appears to fall into it. Repeat the prompt per district by swapping
> "downtown tower cluster / plaza between the towers" for the marina, the park, the docks, etc.

---

## Why this shot list is buildable — the interaction contract

Each rule above buys a specific piece of the site:

| Prompt rule | What it unlocks in code |
|---|---|
| Locked camera, zero drift | District hotspots as hardcoded normalized UVs. Raycast against a plane, no tracking, no CV. |
| Floating tile on plain void | The void luma-keys out → the city becomes a maskable *object* that can tilt with the mouse and sit over site background |
| Six road/water-separated districts | Six click targets, six content panels, six hover-glow masks |
| No baked labels or signage | All labels are real DOM → selectable, accessible, localizable, and restyleable without regenerating |
| Generous margin all sides | Survives cropping from 21:9 desktop down to 9:16 phone |
| Same locked frame in shots 1 and 2 | Day/night is a cross-fade between two aligned textures — a slider, a scroll, or the user's actual local time |
| Constant-rate sun and orbit | Scroll maps linearly to `video.currentTime`; no rubber-banding |
| Match-cut dive from hero frame | Click → dive reads as one continuous camera, not a video swap |

---

## After generation

```bash
cd /Users/mehedihasan/3JS/metro/public/media

# hero loop — crf 18, flat concrete voids band badly at 21
ffmpeg -i city-iso.mp4 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -movflags +faststart -an city-iso.web.mp4

# scrub shots — all-intra, EVERY frame a seek point, or the slider snaps between keyframes
ffmpeg -i city-day.mp4   -c:v libx264 -g 1 -crf 20 -pix_fmt yuv420p -movflags +faststart -an city-day.web.mp4
ffmpeg -i city-orbit.mp4 -c:v libx264 -g 1 -crf 20 -pix_fmt yuv420p -movflags +faststart -an city-orbit.web.mp4

# poster for reduced-motion and first paint
ffmpeg -i city-iso.mp4 -vframes 1 -q:v 2 city-iso.poster.jpg
```

Budget: hero ≤ 6 MB · each scrub shot ≤ 12 MB.

---

## What I need back from you to build

1. `city-iso.jpg` — so I can pull the district hotspot coordinates off the exact frame.
2. `city-iso.web.mp4` + `city-day.web.mp4` — minimum for a working interactive map.
3. Six district names and a line of copy each. Text is DOM, never baked into the video.
