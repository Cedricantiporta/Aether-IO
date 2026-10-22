// One shared stylised ("Zelda") water look for every water body: the town lake + river, the pond, run-room lakes / rivers,
// the Coral Isles sea and the dream-garden stream. A single ShaderMaterial recipe (`makeWaterMaterial`): turquoise-to-deep
// depth tint, soft caustic web, little cross-shaped glints, a clean white foam line (+ a thinner lapping line) at the shore
// and a gentle swell that warps the patterns. All of it is a function of (world xz, shore distance, time), so the only per-frame
// work is ONE shared time uniform (`WATER_T`, written by <WaterClock/>); no depth pre-pass, no extra textures per frame.
// Shore distance `sd` (metres from the water's edge, 0 at the shore) comes from the cheapest source each body has:
//   - analytic (RoomWater: distance inside the nearest lake / river edge),
//   - a vertex attribute `aS` (pond, dream stream),
//   - a baked distance field texture (`bakeShoreField`: town lake / river from `groundY`, rooms' sea from the ground mesh).
import { Color, DataTexture, LinearFilter, RedFormat, ShaderMaterial, UniformsLib, UniformsUtils, UnsignedByteType, Vector4 } from 'three';
import type { IUniform, Texture } from 'three';

/** Shared uniforms: written once per frame by <WaterClock/>, referenced (not cloned) by every water material. */
export const WATER_T: IUniform<number> = { value: 0 };
export const WATER_NIGHT: IUniform<number> = { value: 0 };

export const WATER_VS = `
#include <fog_pars_vertex>
varying vec3 vW;
#ifdef SHORE_ATTR
attribute float aS; varying float vS;
#endif
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
#ifdef SHORE_ATTR
  vS = aS;
#endif
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** GLSL: `vec3 waterShade(vec2 p, float sd)` (needs uTime, uNight, uShallow, uDeep, uSpan). */
export const WATER_FN = `
uniform float uTime; uniform float uNight; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uSpan;
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wCaustic(vec2 p, float t){
  vec2 a = p * 0.55 + vec2(t * 0.05, -t * 0.04);
  float s = sin(a.x * 4.0 + sin(a.y * 3.1 + t * 0.5) * 1.6) + sin(a.y * 4.3 + sin(a.x * 2.7 - t * 0.4) * 1.6);
  float c = 1.0 - abs(s) * 0.5;
  return c * c * c * c * c;
}
vec3 waterShade(vec2 p, float sd){
  float t = uTime;
  // gentle swell: the whole pattern sways, and the shoreline breathes with it
  vec2 w = vec2(sin(p.y * 0.55 + t * 0.7) + 0.5 * sin(p.y * 1.3 - t * 0.9), cos(p.x * 0.5 + t * 0.6) + 0.5 * cos(p.x * 1.1 + t * 0.8)) * 0.2;
  vec2 q = p + w;
  float k = smoothstep(0.0, uSpan, sd);
  vec3 col = mix(uShallow, uDeep, k);
  col = mix(col, uShallow * 1.12 + 0.05, smoothstep(2.4, 0.0, sd) * 0.35);          // bright shallows by the shore
  // soft caustic web (stronger where it is shallow)
  float c = wCaustic(q, t) * 0.6 + wCaustic(q * 1.7 + 3.1, -t) * 0.4;
  col += vec3(0.70, 1.0, 0.95) * c * mix(0.17, 0.07, k);
  // sparkles: a few cross-shaped glints that twinkle on a drifting grid
  vec2 g = q * 0.85 + vec2(t * 0.07, 0.0);
  vec2 id = floor(g), f = fract(g) - 0.5;
  f -= (vec2(wHash(id + 7.1), wHash(id + 3.7)) - 0.5) * 0.4;
  float h = wHash(id), tw = max(0.0, sin(t * 2.4 + h * 60.0)); tw = tw * tw * tw;
  float cr = max(smoothstep(0.035, 0.0, abs(f.x)) * smoothstep(0.26, 0.0, abs(f.y)), smoothstep(0.035, 0.0, abs(f.y)) * smoothstep(0.26, 0.0, abs(f.x)));
  col += vec3(1.0) * (cr + smoothstep(0.09, 0.0, length(f))) * step(0.84, h) * tw * 0.9;
  // shore foam: a clean white band + a thinner broken line that laps in and out
  float wob = 0.10 * sin(p.x * 1.9 + t * 1.2) + 0.08 * sin(p.y * 2.3 - t * 1.0) + 0.05 * sin((p.x + p.y) * 4.1 + t * 2.0);
  float e = sd + wob;
  float lap = 0.5 + 0.5 * sin(t * 0.9 + (p.x + p.y) * 0.12);
  float edge = 0.36 + 0.2 * lap;
  float f1 = smoothstep(edge, edge - 0.1, e);
  float f2 = smoothstep(0.08, 0.0, abs(e - (edge + 0.5 + 0.3 * lap))) * smoothstep(-0.2, 0.5, sin(p.x * 3.1 + p.y * 2.3 + t * 0.8));
  col = mix(col, uShallow * 1.2 + 0.1, smoothstep(1.5, 0.3, sd) * 0.3 * (1.0 - f1));
  col = mix(col, vec3(0.98, 1.0, 1.0), max(f1, f2 * 0.85));
  return col * mix(vec3(1.0), vec3(0.34, 0.44, 0.76), uNight);
}`;

/** Colours of a stock "clear" lake. */
export const WATER_SHALLOW = '#52e0d2';
export const WATER_DEEP = '#2377d0';

/** Baked shore distance (metres) over a world rectangle: uniform uShore (R8 texture, value * maxD) + uRegion (x0, z0, w, h). */
export interface ShoreField { tex: DataTexture; x0: number; z0: number; w: number; h: number; maxD: number }
let dummyTex: DataTexture | null = null;
/** 1x1 "far from any shore" texture (used before / without a baked field). */
export function farShore(): DataTexture {
  if (!dummyTex) { dummyTex = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType); dummyTex.needsUpdate = true; }
  return dummyTex;
}

/**
 * Bakes a shore-distance field once. `isWater(ix, iz)` says whether the cell centre (x0 + (ix + .5) * cell, z0 + (iz + .5) * cell) is
 * under the water; a 2-pass chamfer distance transform then gives the distance to the nearest dry cell (0 on land).
 */
export function bakeShoreField(x0: number, z0: number, w: number, h: number, cell: number, maxD: number, isWater: (x: number, z: number) => boolean): ShoreField {
  const nx = Math.max(2, Math.ceil(w / cell)), nz = Math.max(2, Math.ceil(h / cell)), n = nx * nz;
  const d = new Float32Array(n), BIG = 1e5, D1 = 1, D2 = 1.4142;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) d[iz * nx + ix] = isWater(x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell) ? BIG : 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix; let v = d[i]; if (v === 0) continue;
    if (ix > 0) v = Math.min(v, d[i - 1] + D1);
    if (iz > 0) { v = Math.min(v, d[i - nx] + D1); if (ix > 0) v = Math.min(v, d[i - nx - 1] + D2); if (ix < nx - 1) v = Math.min(v, d[i - nx + 1] + D2); }
    d[i] = v;
  }
  const out = new Uint8Array(n);
  for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
    const i = iz * nx + ix; let v = d[i];
    if (v > 0) {
      if (ix < nx - 1) v = Math.min(v, d[i + 1] + D1);
      if (iz < nz - 1) { v = Math.min(v, d[i + nx] + D1); if (ix < nx - 1) v = Math.min(v, d[i + nx + 1] + D2); if (ix > 0) v = Math.min(v, d[i + nx - 1] + D2); }
      d[i] = v;
    }
    const m = v > 0 ? Math.max(0, (v - 0.5) * cell) : 0;   // (the edge lies half a cell inside the first wet cell)
    out[i] = Math.min(255, Math.round((m / maxD) * 255));
  }
  const tex = new DataTexture(out, nx, nz, RedFormat, UnsignedByteType);
  tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, x0, z0, w: nx * cell, h: nz * cell, maxD };
}

/** The sea of the current run room / camp (set by the ground builders in render/Room.tsx + CampPath.tsx, read by LavaSea). */
let seaField: ShoreField | null = null;
export function setSeaShore(f: ShoreField | null): void { if (seaField && seaField !== f) seaField.tex.dispose(); seaField = f; }
export function getSeaShore(): ShoreField | null { return seaField; }

/** Bakes the sea mask from a displaced PlaneGeometry grid's position array (vertex (ix, iz) at x0 + ix * w / seg ...): water where the ground is below `level`. */
export function bakeGridShore(heights: ArrayLike<number>, segX: number, segZ: number, x0: number, z0: number, w: number, h: number, level: number, maxD: number): ShoreField {
  const cx = w / segX, cz = h / segZ, cell = Math.max(cx, cz) * 0.75, vx = segX + 1;
  return bakeShoreField(x0, z0, w, h, cell, maxD, (x, z) => {
    const ix = Math.min(segX, Math.max(0, Math.round((x - x0) / cx))), iz = Math.min(segZ, Math.max(0, Math.round((z - z0) / cz)));
    return heights[(iz * vx + ix) * 3 + 1] < level;   // (position array: x y z per vertex)
  });
}

export interface WaterOpts {
  shallow?: string; deep?: string; span?: number;
  /** shore distance: 'tex' (baked field), 'attr' (vertex attribute aS) or a GLSL float expression using vW / uniforms. */
  shore: 'tex' | 'attr' | string;
  field?: ShoreField | null;
  uniforms?: Record<string, IUniform>;
  decl?: string;
}

/** The shared water material (fog-aware, opaque, no lighting). One uTime for all of them. */
export function makeWaterMaterial(o: WaterOpts): ShaderMaterial {
  const tex = o.shore === 'tex', attr = o.shore === 'attr';
  const expr = tex ? 'texture2D(uShore, (vW.xz - uRegion.xy) / uRegion.zw).r * uMaxD' : attr ? 'vS' : o.shore;
  const fs = `
#include <fog_pars_fragment>
varying vec3 vW;
${attr ? 'varying float vS;' : ''}
${tex ? 'uniform sampler2D uShore; uniform vec4 uRegion; uniform float uMaxD;' : ''}
${WATER_FN}
${o.decl ?? ''}
void main(){
  float sd = ${expr};
  gl_FragColor = vec4(waterShade(vW.xz, sd), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
  const f = o.field ?? null;
  const u = UniformsUtils.merge([UniformsLib.fog, {
    uShallow: { value: new Color(o.shallow ?? WATER_SHALLOW) }, uDeep: { value: new Color(o.deep ?? WATER_DEEP) }, uSpan: { value: o.span ?? 8 },
    uShore: { value: (f?.tex ?? farShore()) as Texture }, uRegion: { value: f ? new Vector4(f.x0, f.z0, f.w, f.h) : new Vector4(0, 0, 1, 1) }, uMaxD: { value: f ? f.maxD : 64 },
  }]);
  u.uTime = WATER_T; u.uNight = WATER_NIGHT;   // (shared: written once per frame)
  if (o.uniforms) Object.assign(u, o.uniforms);
  return new ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: fs, uniforms: u, fog: true, defines: attr ? { SHORE_ATTR: '' } : undefined });
}
