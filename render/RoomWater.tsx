// Stage liquids of the current run room (engine/roomFeatures `feat`): one ground-hugging plane whose shader draws every
// lake and the river / lava / chasm band analytically (no per-feature meshes), plus the bridges (merged static meshes).
// Rebuilt when world.room.version changes; per frame only the time uniform moves. No per-frame allocations.
import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { world } from '../engine/world';
import { feat, MAX_LAKES, riverPoint, hwAt } from '../engine/roomFeatures';
import { SINK } from './Room';
import { shape } from '../engine/roomShape';
import { biomeOf } from '../engine/roomDefs';
import { GB, litMat } from './util';
import { useWorldCounter } from './hooks';

const VS = `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
uniform vec3 uLakes[${MAX_LAKES}]; uniform int uNL; uniform vec4 uRiv; uniform vec4 uRiv2; uniform vec4 uRiv3; uniform vec2 uRiv4; uniform float uTime; uniform int uKind; uniform float uCut;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uRim;
varying vec2 vP;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  // e = distance inside the nearest liquid edge (> 0 inside)
  float e = -1e3; vec2 flow = vec2(0.0);
  for (int i = 0; i < ${MAX_LAKES}; i++){ if (i >= uNL) break; vec3 L = uLakes[i]; float d = L.z - length(vP - L.xy); if (d > e){ e = d; flow = vec2(0.0); } }
  if (uRiv2.w > 0.5){
    vec2 n = uRiv.xy; float s = -vP.x * n.y + vP.y * n.x;
    float dd = dot(vP, n) - uRiv.z - uRiv2.x * sin(uRiv2.y * s + uRiv2.z) - uRiv3.x * sin(uRiv3.y * s + uRiv3.z);
    float d = uRiv.w * (1.0 + uRiv3.w * sin(uRiv4.x * s + uRiv4.y)) - abs(dd);
    if (d > e){ e = d; flow = vec2(-n.y, n.x); }
  }
  if (e < uCut) discard;   // sunken: -1.2 (the surface tucks under the banks); flat lava pools: cut at the shore
  e = max(e, 0.0);
  vec3 col; float t = uTime;
  vec2 q = vP + flow * t * (uKind == 1 ? 0.35 : 1.2);
  if (uKind == 2){   // chasm: rock walls falling away into darkness
    float k = smoothstep(0.0, 2.2, e);
    float strata = 0.75 + 0.25 * sin(e * 9.0 + fbm(vP * 0.6) * 4.0);
    col = mix(uRim * strata, uDeep, k);
    float mote = step(0.985, hash(floor(vP * 3.0 + vec2(0.0, t * 0.3)))) * smoothstep(1.0, 2.5, e);
    col += uShallow * mote * 0.8 + uShallow * 0.12 * smoothstep(1.5, 4.0, e) * fbm(vP * 0.3 + t * 0.05);
  } else if (uKind == 1){   // lava: glowing flow under a cooling crust
    float n1 = fbm(q * 0.35 + vec2(t * 0.05, 0.0)), n2 = fbm(q * 0.9 - vec2(0.0, t * 0.12));
    float crust = smoothstep(0.46, 0.64, n1 * 0.7 + n2 * 0.45);
    vec3 hot = mix(uShallow, uDeep, n2 * n2);
    col = mix(hot * (1.0 + 0.18 * sin(t * 2.0 + n1 * 8.0)), uRim, crust * 0.9);
    col = mix(uRim * 0.6, col, smoothstep(0.0, 0.55, e));   // dark crust lip
  } else {   // water / icy water
    float depth = smoothstep(0.0, 3.5, e);
    col = mix(uShallow, uDeep, depth);
    float rip = fbm(q * 0.8 + vec2(t * 0.15, -t * 0.1)) * 0.6 + fbm(q * 2.1 - vec2(t * 0.2)) * 0.4;
    col += vec3(0.10, 0.12, 0.13) * smoothstep(0.55, 0.85, rip);
    float foam = smoothstep(0.55, 0.0, e) * (0.6 + 0.4 * sin(e * 14.0 - t * 2.5));
    col = mix(col, vec3(0.92, 0.96, 1.0), foam * 0.7);
    if (uKind == 3){ float ice = smoothstep(0.62, 0.7, fbm(vP * 0.22 + 7.3)); col = mix(col, vec3(0.86, 0.94, 1.0), ice * 0.85); }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PAL: Record<string, [string, string, string]> = {   // shallow, deep, rim
  WATER: ['#4cc0cf', '#155f86', '#3a5a40'],
  ICE: ['#4a90b0', '#12304e', '#c8e0f0'],
  LAVA: ['#e8460c', '#ff9a22', '#2a120c'],
  CHASM: ['#8a6cff', '#040208', '#7a5a3a'],
};

function bridgeGeo(style: string, len: number, w: number) {
  const g = new GB([0.75, 1.1]);
  const half = len / 2;
  if (style === 'STONE' || style === 'MARBLE' || style === 'BASALT') {
    const st = style === 'MARBLE' ? '#e6e0d2' : style === 'BASALT' ? '#4a403c' : '#a8a296', st2 = style === 'MARBLE' ? '#cfc8b8' : style === 'BASALT' ? '#3a302c' : '#8c877c';
    const n = 8;
    for (let i = 0; i < n; i++) {   // gently humped deck of slabs
      const z = -half + (i + 0.5) * (len / n), y = 0.18 + Math.sin(((i + 0.5) / n) * Math.PI) * 0.35;
      g.box(w * 2, 0.3, len / n - 0.04, [0, y, z], i % 2 ? st : st2);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) { const z = -half + (i + 0.5) * (len / n), y = 0.55 + Math.sin(((i + 0.5) / n) * Math.PI) * 0.35; g.box(0.32, 0.55, len / n + 0.02, [sx * (w - 0.1), y, z], st2); }
      for (const sz of [-1, 1]) { g.box(0.55, 1.2, 0.55, [sx * (w - 0.05), 0.6, sz * (half - 0.2)], st); g.box(0.62, 0.15, 0.62, [sx * (w - 0.05), 1.25, sz * (half - 0.2)], st2); }
    }
    g.box(w * 2 - 0.4, 0.5, len - 1.2, [0, -0.15, 0], st2);   // arch body below the deck
  } else if (style === 'CRYSTAL') {
    g.box(w * 2, 0.25, len, [0, 0.2, 0], '#3a2a5e');
    for (let i = 0; i < 6; i++) g.box(w * 2 - 0.3, 0.04, 0.1, [0, 0.34, -half + 0.6 + i * ((len - 1.2) / 5)], '#b48cff');
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.octa(0.28, [sx * (w - 0.15), 0.75, -half + 0.5 + i * ((len - 1) / 3)], '#9a7aff', [0.7, 1.6, 0.7]);
  } else {   // wooden planks + rope / log rails
    const wood = style === 'ROPE' ? '#9a7448' : '#8a6038', wood2 = '#6a4828';
    const n = Math.round(len / 0.45);
    for (let i = 0; i < n; i++) { const z = -half + (i + 0.5) * (len / n); g.box(w * 2 + (i % 3 === 0 ? 0.2 : 0), 0.12, len / n - 0.07, [0, 0.28 - (style === 'ROPE' ? Math.sin(((i + 0.5) / n) * Math.PI) * 0.25 : 0), z], i % 2 ? wood : wood2, [0, (i % 5 - 2) * 0.015, 0]); }
    for (const sx of [-1, 1]) {
      g.box(0.16, 0.16, len, [sx * (w - 0.05), 0.2, 0], wood2);
      for (const sz of [-1, 0, 1]) g.box(0.16, 1.15, 0.16, [sx * (w + 0.02), 0.6, sz * (half - 0.25)], wood2);
      if (style === 'ROPE') g.cyl(0.04, 0.04, len, 4, [sx * (w + 0.02), 1.05, 0], '#d8c08a', [Math.PI / 2, 0, 0]);
      else g.box(0.12, 0.12, len, [sx * (w + 0.02), 1.05, 0], wood);
    }
  }
  // piers / trestles down into the sunken channel
  const pierC = style === 'MARBLE' ? '#cfc8b8' : style === 'BASALT' ? '#3a302c' : style === 'CRYSTAL' ? '#2a1e48' : style === 'STONE' ? '#8c877c' : '#5a3c22';
  const np = Math.max(2, Math.round(len / 4.5));
  for (let i = 1; i < np; i++) {
    const z = -half + (i * len) / np;
    if (style === 'STONE' || style === 'MARBLE' || style === 'BASALT') g.box(w * 2 - 0.6, 2.6, 1.0, [0, -1.25, z], pierC);
    else for (const sx of [-1, 1]) g.box(0.32, 2.7, 0.32, [sx * (w - 0.35), -1.2, z], pierC);
  }
  return g.build();
}

export function RoomWater() {
  const ver = useWorldCounter(() => world.room.version);
  const built = useMemo(() => {
    const has = feat.river || feat.nLakes > 0;
    if (!has) return null;
    const S = 2 * (shape.maxR + 24);
    const geo = new PlaneGeometry(S, S, 1, 1); geo.rotateX(-Math.PI / 2);
    const lakes = Array.from({ length: MAX_LAKES }, (_, i) => new Vector3(feat.lx[i], feat.lz[i], i < feat.nLakes ? feat.lr[i] : 0));
    const flat = feat.liquid === 'LAVA' && !feat.river;   // lava pools lie flat on the rock
    const kind = feat.liquid === 'LAVA' ? 1 : feat.liquid === 'CHASM' ? 2 : feat.liquid === 'ICE' ? 3 : 0;
    const pal = PAL[feat.liquid] ?? PAL.WATER;
    const def = biomeOf(world.room.biome);
    const rim = feat.liquid === 'CHASM' ? (def.style === 'VOID' ? '#3a2a5e' : '#9a6a3e') : pal[2];
    const deep = feat.liquid === 'CHASM' && def.style === 'VOID' ? '#05030c' : pal[1];
    const shallow = feat.liquid === 'WATER' && feat.variant === 2 && def.style === 'GRASS' ? '#5f8a5a' : pal[0];   // mire ponds: murky green
    const mat = new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, toneMapped: kind !== 1,
      uniforms: {
        uLakes: { value: lakes }, uNL: { value: feat.nLakes },
        uRiv: { value: new Vector4(feat.nx, feat.nz, feat.off, feat.river ? feat.hw : 0) },
        uRiv2: { value: new Vector4(feat.amp, feat.freq, feat.ph, feat.river ? 1 : 0) },
        uRiv3: { value: new Vector4(feat.amp2, feat.freq2, feat.ph2, feat.wAmp) }, uRiv4: { value: new Vector2(feat.wFreq, feat.wPh) },
        uTime: { value: 0 }, uKind: { value: kind }, uCut: { value: flat ? -0.05 : -1.2 },
        uShallow: { value: new Color(shallow) }, uDeep: { value: new Color(deep) }, uRim: { value: new Color(rim) },
      },
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const plane = new Mesh(geo, mat); plane.position.y = flat ? 0.04 : -SINK * 0.62;   // the liquid lies down in the carved channel
    plane.renderOrder = 1; plane.frustumCulled = false;
    // bridges
    const bridges: Mesh[] = [];
    if (feat.river) {
      const style = def.style === 'MARBLE' ? 'MARBLE' : def.style === 'BASALT' ? 'BASALT' : def.style === 'VOID' ? 'CRYSTAL' : def.style === 'SAND' ? 'ROPE' : def.style === 'SNOW' ? 'STONE' : 'WOOD';
      const bm = litMat({ roughness: 0.85 });
      const p: [number, number] = [0, 0];
      for (let i = 0; i < feat.nb; i++) {
        riverPoint(feat.bridgeS[i], 0, p);
        const bg = bridgeGeo(style, hwAt(feat.bridgeS[i]) * 2 + 4.5, feat.bw);
        const m = new Mesh(bg, bm); m.position.set(p[0], 0, p[1]); m.rotation.y = Math.atan2(feat.nx, feat.nz);
        m.castShadow = true; m.receiveShadow = true; bridges.push(m);
      }
    }
    return { plane, mat, bridges };
  }, [ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (built) { built.plane.geometry.dispose(); built.mat.dispose(); for (const b of built.bridges) b.geometry.dispose(); } }, [built]);
  useFrame(({ clock }) => { if (built) built.mat.uniforms.uTime.value = clock.elapsedTime; });
  if (!built) return null;
  return (
    <group key={ver}>
      <primitive object={built.plane} />
      {built.bridges.map((m, i) => <primitive key={i} object={m} />)}
    </group>
  );
}

// ---------------------------------------------------------------- lava sea ---
const SEA_FS = `
uniform float uTime; varying vec2 vP;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  float t = uTime;
  float n1 = fbm(vP * 0.12 + vec2(t * 0.03, t * 0.01)), n2 = fbm(vP * 0.4 - vec2(t * 0.05, 0.0));
  float crust = smoothstep(0.44, 0.62, n1 * 0.7 + n2 * 0.45);
  vec3 hot = mix(vec3(0.85, 0.2, 0.03), vec3(1.0, 0.5, 0.08), n2 * n2);
  vec3 col = mix(hot * (1.0 + 0.18 * sin(t * 1.5 + n1 * 9.0)), vec3(0.12, 0.045, 0.025), crust * 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;
/** Coral Isles: a turquoise sea (shallow green-blue near the island, deeper blue further out, moving sun glints). */
const OCEAN_FS = `
uniform float uTime; varying vec2 vP;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  float t = uTime, r = length(vP);
  float n1 = fbm(vP * 0.08 + vec2(t * 0.02, t * 0.015)), n2 = fbm(vP * 0.35 - vec2(t * 0.06, t * 0.03));
  vec3 shallow = vec3(0.25, 0.78, 0.76), deep = vec3(0.05, 0.36, 0.6);
  vec3 col = mix(shallow, deep, smoothstep(30.0, 75.0, r + n1 * 18.0));
  col *= 0.92 + n2 * 0.16;
  float glint = smoothstep(0.78, 0.86, fbm(vP * 0.9 + vec2(t * 0.25, -t * 0.18)));
  col += vec3(0.55, 0.6, 0.55) * glint * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;
/** Ember Wastes: an animated lava sea around the room (the ground mesh drops below it beyond the wall ring); with `water`,
 *  the Coral Isles' turquoise sea instead. */
export function LavaSea({ water = false }: { water?: boolean }) {
  const built = useMemo(() => {
    const S = 2 * (shape.maxR + 90);
    const geo = new PlaneGeometry(S, S, 1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new ShaderMaterial({ vertexShader: VS, fragmentShader: water ? OCEAN_FS : SEA_FS, toneMapped: false, uniforms: { uTime: { value: 0 } } });
    const m = new Mesh(geo, mat); m.position.y = water ? -0.45 : -0.55; m.frustumCulled = false;
    return { m, geo, mat };
  }, [water]);
  useEffect(() => () => { built.geo.dispose(); built.mat.dispose(); }, [built]);
  useFrame(({ clock }) => { built.mat.uniforms.uTime.value = clock.elapsedTime; });
  return <primitive object={built.m} />;
}
