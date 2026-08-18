import * as THREE from 'three';

/**
 * Drifting cloud band, drawn as a fullscreen pass ON TOP of everything else.
 *
 * It sits above both the globe and the city plate on purpose. If it lived inside
 * the globe scene it would die with the globe at the handover and read as two
 * separate weather systems; drawing it last means the clouds crossing the planet
 * are the same clouds still crossing the plate a second later, which is what makes
 * them appear to settle into the illustration's own painted clouds rather than
 * cutting to them.
 *
 * Three fbm layers scroll at different rates — that parallax is what sells depth;
 * a single scrolling layer reads as a sliding texture.
 */
export function createClouds({ tint }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSpeed: { value: 1 },
      uScale: { value: 2.6 },
      uAspect: { value: 1 },
      uColor: { value: new THREE.Color().setStyle(tint, THREE.NoColorSpace) },
      uShadow: { value: new THREE.Color().setStyle('#b9b6b0', THREE.NoColorSpace) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uOpacity, uSpeed, uScale, uAspect;
      uniform vec3 uColor, uShadow;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }

      void main() {
        vec2 uv = vec2(vUv.x * uAspect, vUv.y);
        float t = uTime * uSpeed;

        // near layer moves fastest; the horizontal-only drift is the whole point
        float c = 0.0;
        c += 0.54 * fbm(vec2(uv.x * uScale - t * 0.230, uv.y * uScale * 1.35 + 2.0));
        c += 0.31 * fbm(vec2(uv.x * uScale * 1.9 - t * 0.360, uv.y * uScale * 2.3 + 9.0));
        c += 0.15 * fbm(vec2(uv.x * uScale * 3.3 - t * 0.540, uv.y * uScale * 3.4 + 17.0));

        /* Second sample a little above the first. Where the field is rising the
         * cloud is facing up and catches light; where it falls it is an underside.
         * That one extra tap is the difference between drifting fog and something
         * with a top and a bottom. */
        float cUp = 0.54 * fbm(vec2(uv.x * uScale - t * 0.230, (uv.y + 0.035) * uScale * 1.35 + 2.0))
                  + 0.31 * fbm(vec2(uv.x * uScale * 1.9 - t * 0.360, (uv.y + 0.035) * uScale * 2.3 + 9.0))
                  + 0.15 * fbm(vec2(uv.x * uScale * 3.3 - t * 0.540, (uv.y + 0.035) * uScale * 3.4 + 17.0));
        float lit = clamp(0.5 + (c - cUp) * 5.0, 0.0, 1.0);

        float a = smoothstep(0.42, 0.69, c);

        // weight toward the upper frame, where the plate keeps its own clouds, and
        // never let them close over the bottom where the city and the copy live
        a *= mix(0.14, 1.0, smoothstep(0.18, 0.82, vUv.y));
        a *= 1.0 - smoothstep(0.93, 1.0, vUv.y);

        float alpha = a * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(mix(uShadow, uColor, lit), alpha);
      }`,
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));

  return {
    scene,
    camera,
    material,
    resize(w, h) { material.uniforms.uAspect.value = Math.max(1, w) / Math.max(1, h); },
    update(now, opacity, speed) {
      material.uniforms.uTime.value = now;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uSpeed.value = speed;
    },
    dispose() { material.dispose(); },
  };
}
