import * as THREE from 'three';
import { DISTRICTS, pick } from './districts.js';
import { createGlobe, TARGET } from './globe.js';
import './style.css';

const MEDIA_ASPECT = 16 / 9;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The descent is scene-setting, not content — anyone who cannot use motion, or
// who just wants the map, gets dropped straight onto it.
const SKIP_INTRO = REDUCED || QS.has('nointro');
const INTRO_SECONDS = 4.6;

/* ------------------------------------------------------------------ *
 * Shared view transform.
 *
 * The shader and the pointer maths MUST agree exactly or every hotspot
 * drifts off its block, so the transform lives here once and both sides
 * read it. Media image space is u right, v DOWN — same as districts.js.
 * ------------------------------------------------------------------ */
/* Bounding box of the city tile itself (dirt edge included) inside the 16:9
 * plate, plus a little margin. Everything outside it is void, which renders as
 * paper — so it is safe to show more of it, but never less of the tile. */
const CITY = { u: 0.5, v: 0.515, w: 0.70, h: 0.82 };

const view = {
  fit: new THREE.Vector2(1, 1),   // fraction of the plate visible on each axis
  focus: new THREE.Vector2(CITY.u, CITY.v),
  zoom: 1,
  baseZoom: 1,
  sheet: false,   // panel is docked bottom rather than right (see updateFit)
};

/* Cover-fit alone crops the plate, which on a 9:19.5 phone throws whole
 * districts off screen. So cover first, then zoom out far enough that the city
 * box is always fully contained. Capped at 1 so desktop framing is untouched
 * and the tile is never magnified past its native size. */
function updateFit(w, h) {
  /* Guard the degenerate viewport. A resize can fire at 0x0 — a hidden container,
   * a mobile rotate, a restoring window — and 0/0 is NaN. That NaN runs
   * fit -> baseZoom -> target.zoom -> view.zoom, and because every value is then
   * derived from itself through damp(), it never washes out: the plate's UVs stay
   * NaN and the map is gone until reload. Clamp on the way in instead. */
  const av = Math.max(1, w) / Math.max(1, h);
  if (av > MEDIA_ASPECT) view.fit.set(1, MEDIA_ASPECT / av);
  else view.fit.set(av / MEDIA_ASPECT, 1);
  view.baseZoom = Math.max(0.05, Math.min(1, view.fit.x / CITY.w, view.fit.y / CITY.h));
  // Must track the CSS breakpoint, not the aspect: below 900px the panel docks to
  // the bottom, so an opened district has to be nudged UP out from under it rather
  // than sideways. Keying this off aspect put a 800x700 window in the wrong branch.
  view.sheet = w <= 900;
}

/** screen px -> media image coords */
function screenToMedia(px, py, w, h) {
  return {
    u: view.focus.x + (px / w - 0.5) * view.fit.x / view.zoom,
    v: view.focus.y + (py / h - 0.5) * view.fit.y / view.zoom,
  };
}

/** media image coords -> screen px */
function mediaToScreen(u, v, w, h) {
  return {
    x: ((u - view.focus.x) * view.zoom / view.fit.x + 0.5) * w,
    y: ((v - view.focus.y) * view.zoom / view.fit.y + 0.5) * h,
  };
}

/* ------------------------------------------------------------------ *
 * Scene
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);

/* Colour space: a raw ShaderMaterial gets no output encoding injected, so if the
 * textures decode sRGB -> linear on read, that linear value lands in the framebuffer
 * unencoded and the whole plate renders dark. Everything here stays in display
 * space instead — no decode, no encode, footage out exactly as it was graded. */
/* Assets resolve against Vite's base, not the site root. A GitHub project page is
 * served from /<repo>/, so a hardcoded "/media/..." 404s there. Vite rewrites such
 * paths in HTML for you but never inside JS string literals — these have to be
 * built by hand. BASE_URL always ends in a slash. */
const asset = (p) => import.meta.env.BASE_URL + p;

const loader = new THREE.TextureLoader();
const stillTex = loader.load(asset('media/city-iso.jpg'));
stillTex.colorSpace = THREE.NoColorSpace;
stillTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const video = Object.assign(document.createElement('video'), {
  muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous',
});
video.setAttribute('muted', '');
video.setAttribute('playsinline', '');
// webm first: 245 KB vs 1.1 MB for the same 226 frames
for (const [src, type] of [['media/city-iso.web.webm', 'video/webm'], ['media/city-iso.web.mp4', 'video/mp4']]) {
  video.appendChild(Object.assign(document.createElement('source'), { src: asset(src), type }));
}
/* Kept in the document rather than detached: iOS Safari will not reliably decode
 * a detached element into a texture. 1px and transparent, never display:none —
 * that stops playback outright in some browsers. */
video.setAttribute('aria-hidden', 'true');
video.style.cssText =
  'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
document.body.appendChild(video);
const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.NoColorSpace;

const uniforms = {
  uVideo: { value: videoTex },
  uStill: { value: stillTex },
  uVideoMix: { value: REDUCED ? 0 : 1 },   // 1 = live footage, 0 = sharp plate
  uFit: { value: view.fit },
  uFocus: { value: view.focus },
  uZoom: { value: 1 },
  uTime: { value: 0 },
  uActive: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0.1) }, // u, v, hw, hh
  uActiveAmt: { value: 0 },
  uDebug: { value: DEBUG ? 1 : 0 },
  uDebugRects: { value: DISTRICTS.map((d) => new THREE.Vector4(d.u, d.v, d.hw, d.hh)) },
  uOpacity: { value: SKIP_INTRO ? 1 : 0 },  // the descent fades the plate in over the globe
};

const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D uVideo, uStill;
    uniform vec2 uFit, uFocus;
    uniform float uVideoMix, uZoom, uTime, uActiveAmt, uDebug, uOpacity;
    uniform vec4 uActive;
    uniform vec4 uDebugRects[${DISTRICTS.length}];
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    // isometric diamond field: <1 inside the plot
    float diamond(vec2 p, vec4 r) {
      return abs(p.x - r.x) / r.z + abs(p.y - r.y) / r.w;
    }

    void main() {
      // screen -> media image coords (v runs DOWN, matching districts.js)
      vec2 c = vUv - 0.5;
      vec2 img = uFocus + vec2(c.x, -c.y) * uFit / uZoom;

      // Outside the plate, clamping extends the render's own backdrop outwards.
      // That backdrop is not flat — it carries a soft gradient (#ecece4 at the
      // top-left corner down to #dad7d2) — so any single constant leaves a hard
      // band where the plate ends. Clamping continues the gradient instead, and
      // keeps the void inside the same grain and vignette as the rest of frame.
      vec3 paper = vec3(0.855, 0.843, 0.824);
      vec2 tuv = clamp(vec2(img.x, 1.0 - img.y), 0.0, 1.0);
      vec3 col = mix(texture2D(uStill, tuv).rgb, texture2D(uVideo, tuv).rgb, uVideoMix);

      // focus pass: everything outside the live district cools and steps back
      float d = diamond(img, uActive);
      float inside = 1.0 - smoothstep(0.93, 1.03, d);
      float rim = smoothstep(0.90, 0.99, d) * (1.0 - smoothstep(0.99, 1.06, d));

      float luma = dot(col, vec3(0.299, 0.587, 0.114));

      // outside: pulled back just far enough to read as "not this one". The city
      // has to stay legible — a heavy dim turns the other six districts to fog
      // and the map stops being a map.
      vec3 dimmed = mix(vec3(luma), col, 0.45) * 0.80;
      dimmed = mix(dimmed, paper * luma, 0.10);

      // inside: a small lift does part of the separating work, so the outside
      // never has to be pushed far enough to become fog
      vec3 lifted = col * 1.05 + (col - vec3(luma)) * 0.16;

      col = mix(col, mix(dimmed, lifted, inside), uActiveAmt);
      col += vec3(0.95, 0.66, 0.23) * rim * uActiveAmt * 0.5;

      // grain + vignette, keyed off the plate so it survives the zoom
      col += (hash(vUv * (1.0 + fract(uTime))) - 0.5) * 0.014;
      col *= 1.0 - 0.10 * pow(length(c * vec2(1.05, 1.0)), 2.0);

      if (uDebug > 0.5) {
        for (int i = 0; i < ${DISTRICTS.length}; i++) {
          float e = diamond(img, uDebugRects[i]);
          if (e > 0.97 && e < 1.03) col = mix(col, vec3(1.0, 0.1, 0.4), 0.85);
        }
      }

      gl_FragColor = vec4(col, uOpacity);
    }`,
});

/* Fullscreen quad, always drawn last over whatever is beneath it. No depth work —
 * otherwise it depth-tests against the globe rendered into the same buffer. */
material.depthTest = false;
material.depthWrite = false;
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));

renderer.autoClear = false;
renderer.setClearColor(new THREE.Color('#dad7d2'), 1);

/* ------------------------------------------------------------------ *
 * Hotspots — real buttons, real tab order, real text
 * ------------------------------------------------------------------ */
const hotspotLayer = document.getElementById('hotspots');
const buttons = DISTRICTS.map((d) => {
  const b = document.createElement('button');
  b.className = 'hotspot';
  b.type = 'button';
  b.dataset.id = d.id;
  b.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="label">${d.name}</span>`;
  b.setAttribute('aria-label', `${d.name} — ${d.eyebrow}`);
  b.addEventListener('pointerenter', () => setHover(d));
  b.addEventListener('focus', () => setHover(d));
  b.addEventListener('blur', () => { if (hover === d && !opened) setHover(null); });
  b.addEventListener('click', (e) => { e.stopPropagation(); open(d); });
  hotspotLayer.appendChild(b);
  return b;
});

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
let hover = null;
let opened = null;
const target = { focus: new THREE.Vector2(0.5, 0.5), zoom: 1, activeAmt: 0, videoMix: REDUCED ? 0 : 1 };
const active = new THREE.Vector4(0.5, 0.5, 0.1, 0.1);
const pointer = { x: 0.5, y: 0.5, has: false };

function setHover(d) {
  if (hover === d) return;
  hover = d;
  document.body.classList.toggle('is-hovering', !!d && !opened);
  buttons.forEach((b) => b.classList.toggle('is-hover', !!d && b.dataset.id === d.id));
  applyFocusTarget();
}

function applyFocusTarget() {
  const d = opened || hover;
  if (d) {
    active.set(d.u, d.v, d.hw * (opened ? 1.12 : 1.0), d.hh * (opened ? 1.12 : 1.0));
    target.activeAmt = opened ? 1.0 : 0.72;
  } else {
    target.activeAmt = 0;
  }
  if (opened) {
    // shove the plot clear of the panel — which docks right on desktop and
    // bottom on narrow, so the offset has to follow it
    const z = view.baseZoom * 2.4;
    const off = 0.20 / z;
    target.focus.set(
      opened.u + (view.sheet ? 0 : off * view.fit.x),
      opened.v - (view.sheet ? off * view.fit.y * 0.9 : 0),
    );
    target.zoom = z;
    target.videoMix = 0;      // swap to the 2752px plate: 2.5x sharper under zoom
  } else {
    target.focus.set(CITY.u, CITY.v);
    target.zoom = view.baseZoom;
    target.videoMix = REDUCED ? 0 : 1;
  }
}

const panel = document.getElementById('panel');
function open(d) {
  opened = d;
  document.body.classList.add('is-open');
  document.getElementById('panel-eyebrow').textContent = d.eyebrow;
  document.getElementById('panel-title').textContent = d.name;
  document.getElementById('panel-body').textContent = d.body;
  document.getElementById('panel-stats').innerHTML = d.stats
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  panel.hidden = false;
  buttons.forEach((b) => b.classList.toggle('is-open', b.dataset.id === d.id));
  applyFocusTarget();
  document.getElementById('panel-close').focus();
}

function close() {
  if (!opened) return;
  const was = opened;
  opened = null;
  document.body.classList.remove('is-open');
  panel.hidden = true;
  buttons.forEach((b) => b.classList.remove('is-open'));
  setHover(null);
  applyFocusTarget();
  buttons.find((b) => b.dataset.id === was.id)?.focus();
}

document.getElementById('panel-close').addEventListener('click', close);
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX / innerWidth;
  pointer.y = e.clientY / innerHeight;
  pointer.has = true;
  if (opened || intro.running) return;
  const m = screenToMedia(e.clientX, e.clientY, innerWidth, innerHeight);
  setHover(pick(m.u, m.v));
});
addEventListener('pointerleave', () => { pointer.has = false; if (!opened) setHover(null); });

canvas.addEventListener('click', (e) => {
  if (intro.running) { intro.skip(); return; }   // click anywhere cuts the descent
  const m = screenToMedia(e.clientX, e.clientY, innerWidth, innerHeight);
  const d = pick(m.u, m.v);
  if (d) open(d); else close();
});

/* ------------------------------------------------------------------ *
 * Descent — globe to country to city
 *
 * Real-time Three.js rather than another generated shot: the camera move has to
 * land on the exact framing of the plate, and a generated descent would have to
 * match a locked frame it has never seen. Geometry can be aimed; footage cannot.
 * ------------------------------------------------------------------ */
const globe = createGlobe({ paper: '#dad7d2', ink: '#28313d', accent: '#c2582f' });

const introEl = document.getElementById('intro');
const captionEl = document.getElementById('intro-caption');
const skipEl = document.getElementById('intro-skip');

const CAPTIONS = [
  { at: 0.00, kicker: 'Somewhere on', name: 'Earth' },
  { at: 0.34, kicker: 'Western edge of', name: TARGET.country },
  { at: 0.66, kicker: TARGET.region, name: 'Metro' },
];

const intro = {
  running: !SKIP_INTRO,
  t: 0,
  progress: SKIP_INTRO ? 1 : 0,
  overZoom: 1,
  caption: -1,

  /* The plate fades up over the last stretch of the descent and arrives slightly
   * over-zoomed, so it keeps falling for a beat after the globe has gone — the
   * handover reads as one continuous move rather than a cut between two scenes.
   * Owned here rather than in tick() so that seeking the intro sets everything. */
  apply() {
    const mix = Math.min(1, Math.max(0, (this.progress - 0.66) / 0.3));
    uniforms.uOpacity.value = mix;
    this.overZoom = 1 + 0.5 * (1 - mix) * (this.progress > 0.6 ? 1 : 0);
  },

  skip() {
    if (!this.running) return;
    this.running = false;
    this.progress = 1;
    globe.setProgress(1, this.t);
    this.apply();
    document.body.classList.remove('is-intro');
    introEl.hidden = true;
    startPlayback();
  },
  step(dt, now) {
    this.t += dt;
    this.progress = Math.min(1, this.t / INTRO_SECONDS);
    globe.setProgress(this.progress, now);
    this.apply();

    let idx = 0;
    for (let i = 0; i < CAPTIONS.length; i++) if (this.progress >= CAPTIONS[i].at) idx = i;
    if (idx !== this.caption) {
      this.caption = idx;
      captionEl.innerHTML =
        `<span class="intro-kicker">${CAPTIONS[idx].kicker}</span>` +
        `<span class="intro-name">${CAPTIONS[idx].name}</span>`;
      captionEl.classList.remove('is-in');
      void captionEl.offsetWidth;          // restart the entrance animation
      captionEl.classList.add('is-in');
    }
    if (this.progress >= 1) this.skip();
  },
};

skipEl.addEventListener('click', (e) => { e.stopPropagation(); intro.skip(); });
addEventListener('keydown', (e) => {
  if (intro.running && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) intro.skip();
});

if (SKIP_INTRO) {
  introEl.hidden = true;
  globe.setProgress(1, 0);
} else {
  document.body.classList.add('is-intro');
  globe.setProgress(0, 0);
}

/* ------------------------------------------------------------------ *
 * Loop
 * ------------------------------------------------------------------ */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  globe.resize(w, h, renderer.getPixelRatio());
  updateFit(w, h);
  applyFocusTarget();   // baseZoom moved, so the resting zoom moved with it
}
addEventListener('resize', resize);
resize();
// snap rather than animate on first paint — a zoom-out on load reads as a glitch
view.zoom = target.zoom;
view.focus.copy(target.focus);

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
let last = performance.now();

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (intro.running) intro.step(dt, now / 1000);

  // parallax rides the focus point, so pointer maths and shader stay in lockstep
  const px = pointer.has && !opened && !intro.running ? (pointer.x - 0.5) * 0.012 : 0;
  const py = pointer.has && !opened && !intro.running ? (pointer.y - 0.5) * 0.012 : 0;

  const rate = REDUCED ? 60 : 6.5;
  view.focus.x = damp(view.focus.x, target.focus.x + px, rate, dt);
  view.focus.y = damp(view.focus.y, target.focus.y + py, rate, dt);
  view.zoom = damp(view.zoom, target.zoom, rate, dt);

  uniforms.uZoom.value = view.zoom * intro.overZoom;
  uniforms.uActiveAmt.value = damp(uniforms.uActiveAmt.value, target.activeAmt, 9, dt);
  uniforms.uVideoMix.value = damp(uniforms.uVideoMix.value, target.videoMix, 7, dt);
  uniforms.uActive.value.lerp(active, 1 - Math.exp(-14 * dt));
  uniforms.uTime.value = now / 1000;

  // hotspot buttons follow their plot through zoom and parallax
  const w = innerWidth, h = innerHeight;
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    const p = mediaToScreen(d.u, d.v - d.lift, w, h);
    const b = buttons[i];
    b.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    const off = p.x < -80 || p.x > w + 80 || p.y < -60 || p.y > h + 60;
    b.classList.toggle('is-offscreen', off);
  }

  // one manual clear, then globe underneath and plate over the top. autoClear is
  // off globally, so the two scenes composite instead of the second wiping the first.
  renderer.clear();
  if (intro.progress < 1) renderer.render(globe.scene, globe.camera);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* Autoplay: muted+playsinline is permitted, but a rejected promise must not take
 * the page down — the still is already a complete fallback.
 *
 * The subtle case is a load into a BACKGROUND tab: play() resolves happily and the
 * element still never advances, because the browser suspends media while the
 * document is hidden. Nothing retries on its own, so the map would sit frozen on
 * frame 0 forever once the user finally switched to it. Hence the visibility retry. */
function startPlayback() {
  if (REDUCED || document.hidden) return;
  video.play().then(() => {
    target.videoMix = 1;
  }).catch(() => {
    target.videoMix = 0;
    uniforms.uVideoMix.value = 0;
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) startPlayback(); });
startPlayback();

document.getElementById('hint').hidden = false;
if (DEBUG) {
  console.info('[metro] debug: district diamonds drawn over the plate');
  // handle for scrubbing the descent while tuning it: __metro.seek(0.45)
  window.__metro = {
    intro, globe, uniforms, view, target,
    seek: (p) => { intro.t = p * INTRO_SECONDS; intro.step(0, performance.now() / 1000); },
  };
}
