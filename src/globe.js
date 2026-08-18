import * as THREE from 'three';
import { isLand } from './world.js';

/* Where Metro sits. Swap these to move the whole descent somewhere else — the
 * country ring only exists to be picked out in accent while the camera falls
 * toward it, so a rough outline is enough. */
export const TARGET = {
  lon: -9.14,
  lat: 38.72,
  country: 'Portugal',
  region: 'Atlantic coast',
  ring: [
    [-9.5, 37.0], [-7.4, 37.2], [-7.0, 38.2], [-6.9, 39.7], [-6.2, 41.0],
    [-6.6, 41.9], [-8.2, 42.1], [-8.9, 41.9], [-8.8, 40.1], [-9.5, 39.4], [-9.0, 38.7],
  ],
};

const DEG = Math.PI / 180;

/** lat/lon -> unit sphere position (y up, prime meridian toward +Z at zero rotation) */
export function llToVec3(lon, lat, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return out.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function inRing(lon, lat, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/* Colours here must stay in DISPLAY space. THREE.Color converts hex from sRGB to
 * the linear working space by default, and these feed raw ShaderMaterials that get
 * no output encoding — so a converted colour lands in the framebuffer unencoded and
 * renders far too dark. NoColorSpace tells Three the value is already working-space
 * and to leave it alone. Same reasoning as the plate textures in main.js. */
const srgb = (css) => new THREE.Color().setStyle(css, THREE.NoColorSpace);

export function createGlobe({ paper, ink, accent }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const group = new THREE.Group();
  scene.add(group);

  /* ---- land dots -------------------------------------------------------
   * Equal-area sampling: the number of longitude samples on each latitude ring
   * scales with cos(lat). A naive fixed lon/lat grid piles dots up at the poles
   * and thins them at the equator, which reads as a lit pole rather than a globe. */
  const STEP = 0.72;
  const pos = [];
  const tint = [];
  const c = new THREE.Color();
  const inkC = srgb(ink);
  const accentC = srgb(accent);
  const v = new THREE.Vector3();

  for (let lat = -89; lat <= 89; lat += STEP) {
    const ring = Math.max(1, Math.round((360 / STEP) * Math.cos(lat * DEG)));
    for (let i = 0; i < ring; i++) {
      const lon = -180 + (360 * i) / ring;
      if (!isLand(lon, lat)) continue;
      llToVec3(lon, lat, 1, v);
      pos.push(v.x, v.y, v.z);
      c.copy(inRing(lon, lat, TARGET.ring) ? accentC : inkC);
      tint.push(c.r, c.g, c.b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));

  const dotsMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: 4.0 }, uOpacity: { value: 1 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 tint;
      varying vec3 vTint;
      varying float vFade;
      uniform float uSize, uPixelRatio;
      void main() {
        vTint = tint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // dots on the limb sit at a grazing angle — fade them so the sphere
        // reads as a sphere instead of a hard-edged disc of confetti
        vec3 n = normalize(mat3(modelMatrix) * position);
        vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
        vFade = smoothstep(-0.08, 0.35, dot(n, toCam));
        // capped: near the surface 1/z explodes and the dots become screen-sized
        // soft blobs instead of a landscape rushing past
        gl_PointSize = min(uSize * uPixelRatio / max(-mv.z, 0.05), 26.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      varying float vFade;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.34, 0.5, d)) * vFade * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vTint, a);
      }`,
  });
  const dots = new THREE.Points(geo, dotsMat);
  group.add(dots);

  /* Solid interior so far-side dots are hidden — without it every dot on the back
   * shows through and the globe reads flat. It is shaded rather than a flat fill
   * for the same reason: on a paper-coloured background an unshaded sphere is
   * indistinguishable from a disc, and only the dots would say otherwise. */
  const shellMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uColor: { value: srgb(paper) }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = (modelMatrix*vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 uColor; uniform float uOpacity;
      void main(){
        vec3 N = normalize(vN);
        float ndv = max(dot(N, normalize(cameraPosition - vP)), 0.0);
        float lam = 0.5 + 0.5 * dot(N, normalize(vec3(-0.45, 0.66, 0.8)));
        // lit side sits just above the page colour, limb just below — that reads
        // as a lit ball on paper. Pushing the whole sphere darker instead just
        // makes a muddy grey disc.
        vec3 col = uColor * (1.025 + 0.055 * lam);
        col *= mix(0.90, 1.0, smoothstep(0.0, 0.6, ndv));   // limb darkening
        gl_FragColor = vec4(col, uOpacity);
      }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 48), shellMat);
  group.add(shell);

  /* Explicit draw order. Every layer here is transparent and centred on the same
   * origin, so Three's depth sort has nothing to separate them by and the shell
   * can end up painting over the very dots it exists to back. Ordering it first —
   * and letting it write depth — makes it occlude the far hemisphere through the
   * depth test while everything on the near side draws over it. */
  shell.renderOrder = 0;
  dots.renderOrder = 2;

  /* Rim: a hair larger, back-faced, and tight to the limb. A wide soft one reads
   * as a grey donut around the planet rather than an edge on it. */
  const rimMat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: srgb(ink) }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = (modelMatrix*vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 uColor; uniform float uOpacity;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vP)));
      gl_FragColor = vec4(uColor, pow(f, 6.0) * 0.34 * uOpacity); }`,
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.016, 64, 48), rimMat);
  rim.renderOrder = 3;
  group.add(rim);

  /* ---- graticule ----
   * The single biggest 3D cue on a dot globe. Land alone gives no reference for
   * the surface between continents, so the sphere reads as a flat sticker; curved
   * meridians and parallels wrapping over the limb say "ball" immediately. */
  const gpts = [];
  const pushArc = (fn, segs) => {
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const p = fn(i / segs);
      if (prev) gpts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  };
  for (let lat = -75; lat <= 75; lat += 15) {
    pushArc((u) => llToVec3(-180 + 360 * u, lat, 0.997), 180);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    pushArc((u) => llToVec3(lon, -90 + 180 * u, 0.997), 90);
  }
  const gratGeo = new THREE.BufferGeometry();
  gratGeo.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
  const gratMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: srgb(ink) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vFade;
      void main() {
        vec3 n = normalize(mat3(modelMatrix) * position);
        vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
        vFade = smoothstep(-0.02, 0.5, dot(n, toCam));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vFade; uniform vec3 uColor; uniform float uOpacity;
      void main() { gl_FragColor = vec4(uColor, vFade * uOpacity * 0.15); }`,
  });
  const grat = new THREE.LineSegments(gratGeo, gratMat);
  grat.renderOrder = 1;
  group.add(grat);

  /* ---- target marker ---- */
  const marker = new THREE.Group();
  // NOT srgb(): MeshBasicMaterial is a built-in, so Three does inject the output
  // encoding for it and it wants a linear colour. Only the raw ShaderMaterials
  // above need the display-space values.
  const markerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accent), transparent: true, opacity: 1, side: THREE.DoubleSide,
  });
  const pulseMat = markerMat.clone();
  const ringGeo = new THREE.RingGeometry(0.028, 0.034, 48);
  const ring = new THREE.Mesh(ringGeo, markerMat);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.038, 48), pulseMat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 24), markerMat);
  marker.add(ring, pulse, dot);

  const nrm = llToVec3(TARGET.lon, TARGET.lat, 1);
  marker.position.copy(nrm).multiplyScalar(1.004);
  marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
  marker.renderOrder = 4;
  ring.renderOrder = 4; pulse.renderOrder = 4; dot.renderOrder = 4;
  group.add(marker);

  /* ---- orientation ----
   * Built as yaw-then-pitch rather than a slerp between two orientations. A slerp
   * takes the shortest arc, which is a short nudge — it cannot spin. Decomposing
   * lets the yaw carry whole extra turns that unwind into the target, so the globe
   * spins down onto the country instead of merely rotating toward it.
   *
   * Derivation: at identity the target sits at `nrm`. Yawing by -atan2(x, z) swings
   * it into the YZ plane facing +Z; pitching about X by the latitude then drops it
   * onto the equator, i.e. dead centre to camera. */
  const yawOf = (lon) => { const v = llToVec3(lon, 0); return -Math.atan2(v.x, v.z); };

  const yawTarget = -Math.atan2(nrm.x, nrm.z);
  const pitchTarget = TARGET.lat * DEG;

  /* The opening frame is derived from a longitude rather than falling out of the
   * turn count, otherwise whatever fraction of a turn you pick decides it — and
   * most fractions open on empty Pacific. Start over Asia so the spin visibly
   * travels a populated hemisphere before it settles on Portugal.
   * EXTRA_TURNS must stay a whole number or the start longitude shifts with it. */
  const START_LON = 100;
  const EXTRA_TURNS = 2;
  const yawFrom = yawOf(START_LON) + EXTRA_TURNS * Math.PI * 2;
  const PITCH_START = 0.42;    // opening tilt, eased away as it locks on
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();

  /* FAR is recomputed per resize rather than fixed. The camera's fov is VERTICAL,
   * so on a tall phone the horizontal field is far narrower and a distance that
   * frames the globe nicely on desktop lets it overflow the sides. Frame against
   * whichever axis is tighter. */
  let FAR = 4.4;
  const NEAR = 1.055;
  function fitDistance(aspect) {
    const halfV = (38 * DEG) / 2;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    // 1.35 puts the globe at ~73% of the tighter axis on every aspect
    return (1 / Math.sin(Math.min(halfV, halfH))) * 1.35;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => Math.min(1, Math.max(0, t));

  let opacity = 1;

  return {
    scene,
    camera,
    get opacity() { return opacity; },

    resize(w, h, dpr) {
      camera.aspect = Math.max(1, w) / Math.max(1, h);
      camera.updateProjectionMatrix();
      FAR = fitDistance(camera.aspect);
      dotsMat.uniforms.uPixelRatio.value = dpr * Math.min(h, w) * 0.0016;
    },

    /**
     * p 0.00–0.28  hold, slow drift — the globe is just a globe
     * p 0.28–0.70  rotate the target to face front and start falling toward it
     * p 0.70–1.00  final descent; the globe dissolves as the city takes over
     */
    setProgress(p, t) {
      /* easeOut over the whole run, not a delayed slerp: the globe is turning at
       * full speed the instant it appears and decelerates into the target, which
       * is what reads as "spinning" rather than "being repositioned". Settles by
       * 0.78 so the lock-on lands before the final dive. */
      const spin = easeOut(clamp01(p / 0.78));
      qYaw.setFromAxisAngle(AXIS_Y, yawTarget + (yawFrom - yawTarget) * (1 - spin));
      qPitch.setFromAxisAngle(AXIS_X, pitchTarget + (PITCH_START - pitchTarget) * (1 - spin));
      group.quaternion.copy(qPitch).multiply(qYaw);

      /* The fall has to be COMPLETE by ~0.80, not at 1.0: the plate starts fading
       * up at 0.66, so the globe must already be close enough that its surface has
       * lost all detail. Spreading the same ease across the full range leaves the
       * camera still high when the city arrives, and the cut shows. */
      const fall = ease(clamp01((p - 0.28) / 0.52));
      camera.position.set(0, 0, FAR + (NEAR - FAR) * fall);
      camera.lookAt(0, 0, 0);

      opacity = 1 - clamp01((p - 0.64) / 0.24);
      dotsMat.uniforms.uOpacity.value = opacity;
      rimMat.uniforms.uOpacity.value = opacity;
      // shell is a ShaderMaterial, so it fades through its uniform — setting
      // .opacity on it does nothing at all
      shellMat.uniforms.uOpacity.value = opacity;
      gratMat.uniforms.uOpacity.value = opacity;

      /* The marker earns its keep only while the target is still a point on a
       * globe. It has to be gone before the camera arrives — a ring sitting on
       * the surface becomes a screen-filling blur the moment you fly into it. */
      const mk = clamp01((p - 0.24) / 0.16) * (1 - clamp01((p - 0.52) / 0.14));
      markerMat.opacity = mk;
      const beat = 1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.4));
      pulse.scale.setScalar(beat);
      pulseMat.opacity = mk * (1.5 - beat) * 0.9;
    },

    dispose() {
      geo.dispose(); dotsMat.dispose(); shellMat.dispose(); rimMat.dispose();
      gratGeo.dispose(); gratMat.dispose();
      ringGeo.dispose(); markerMat.dispose(); pulseMat.dispose();
    },
  };
}
