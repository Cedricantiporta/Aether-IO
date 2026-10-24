// ============================================================================
// Soft wandering soil paths on grass (owner-approved mock: warm soil, ragged leafy edge, bare clearings). ONE reusable piece for the town outskirts dirt tracks
// (render/Terrain.tsx) and the green run rooms (render/Room.tsx RoomGround):
//   * `roomTrail(seed)` / `dirtDiscs()` describe a path as discs (centre line + branch + clearings),
//   * `pathMask()` rasterises them once into a small blurred mask texture (R: coverage, 0.5 = the edge),
//   * `applyPathShader()` patches a MeshStandardMaterial: soil (a tileable painted texture) shows where the mask is > 0.5, the edge is broken up by the soil tile's noise
//     (little leafy clumps spill onto the soil), so there is no geometry and no per-frame work: 2 extra texture reads in the ground fragment shader.
// ============================================================================
import { type Texture, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector4 } from 'three';
import { shape, shapeLimit } from '../engine/roomShape';
import { ROADS, WALL } from '../engine/townData';
import { mulberry32, vnoise } from './util';

export interface Disc { x: number; z: number; r: number }
export interface Trail { discs: Disc[]; main: Disc[] }

/** The run room's winding trail + a side branch + two bare clearings (deterministic per seed). `main` is the centre line every ~0.35 m (r = half width). */
export function roomTrail(seed: number): Trail {
  const so = (seed % 997) * 0.37, fx = shape.fx, fz = shape.fz, R = shape.maxR, rnd = mulberry32(seed ^ 0xb7a1);
  const cl = (t: number) => Math.sin(t * 0.11 + so) * 3.2 + Math.sin(t * 0.27 - so) * 1.2 + Math.sin(t * 0.06 + so * 2.1) * 4.6 + Math.sin(t * 0.43 + so * 3.3) * 0.5;
  const wd = (t: number) => 0.95 + vnoise(t * 0.23 + so, 3.1) * 1.6 + Math.sin(t * 0.16 + so) * 0.45;
  const pt = (t: number, l: number, r: number): Disc => ({ x: t * fx - l * fz, z: t * fz + l * fx, r });
  const ok = (d: Disc) => Math.hypot(d.x, d.z) < shapeLimit(d.x, d.z) - 1.8;
  const discs: Disc[] = [], main: Disc[] = [];
  for (let t = -R; t <= R; t += 0.35) { const d = pt(t, cl(t), wd(t)); if (ok(d)) { discs.push(d); main.push(d); } }
  // side branches that wander off, the first ending in a bare clearing
  let last: Disc | null = null;
  for (let bi = 0; bi < 2; bi++) {
  const t0 = (rnd() - 0.5) * R * 0.9, dir = rnd() < 0.5 ? -1 : 1, side = rnd() < 0.5 ? -1 : 1, ang = 0.6 + rnd() * 0.5, len = 12 + rnd() * 10;
  for (let s = 0; s <= len; s += 0.4) {
    const d = pt(t0 + dir * s * Math.cos(ang), cl(t0) + side * s * Math.sin(ang) + Math.sin(s * 0.5 + so) * 0.8, (0.8 + vnoise(s * 0.3 + so, 7.7) * 0.5) * (1 - 0.35 * (s / len)));
    if (ok(d)) { discs.push(d); if (bi === 0) last = d; }
  }
  }
  const clearing = (cx: number, cz: number, rad: number) => { discs.push({ x: cx, z: cz, r: rad * 0.7 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + rnd(), d = rad * (0.45 + rnd() * 0.3); const c = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: rad * (0.4 + rnd() * 0.25) }; if (ok(c)) discs.push(c); } };
  if (last) clearing(last.x, last.z, 2.0 + rnd() * 1.0);
  for (let k = 0; k < 2; k++) { const t = (rnd() - 0.5) * R * 1.2, sd = rnd() < 0.5 ? -1 : 1, c = pt(t, cl(t) + sd * (wd(t) + 1.1), 2.4); if (ok(c)) clearing(c.x, c.z, 2.0 + rnd() * 0.9); }
  return { discs, main };
}

/** The outskirts' dirt tracks (townData ROADS dirt:true): wandering a little off the straight segment, width varying, a few bare patches. */
export function dirtDiscs(): Disc[] {
  const out: Disc[] = [], rnd = mulberry32(4242);
  let k = 0;
  for (const rd0 of ROADS) {
    let rd = rd0;
    if (!rd0.dirt) {   // a paved street's part beyond the wall is a dirt track too
      const z0 = WALL.z1 + 2.5, a = rd0.z1, b = rd0.z2, dzz = b - a;
      if (Math.max(a, b) <= z0) continue;
      if (Math.abs(dzz) < 1e-6) { if (a < z0) continue; }
      else { let t0 = (z0 - a) / dzz; if (dzz > 0) rd = { ...rd0, x1: rd0.x1 + (rd0.x2 - rd0.x1) * Math.max(0, t0), z1: z0 }; else rd = { ...rd0, x2: rd0.x1 + (rd0.x2 - rd0.x1) * Math.min(1, t0), z2: z0 }; }
    }
    const dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, n = Math.max(2, Math.round(len / 0.4)), ph = k * 1.7; k++;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.sin(t * Math.PI) ** 0.6, off = (Math.sin(t * len * 0.21 + ph) * 0.7 + Math.sin(t * len * 0.53 + ph * 2) * 0.3) * 1.0 * w;
      out.push({ x: rd.x1 + dx * t + nx * off, z: rd.z1 + dz * t + nz * off, r: Math.max(0.8, rd.w * 0.5) * (0.78 + vnoise(t * len * 0.2 + ph, 5.5) * 0.5) });
    }
    if (rnd() < 0.5) { const t = 0.25 + rnd() * 0.5, sd = rnd() < 0.5 ? -1 : 1, cx = rd.x1 + dx * t + nx * sd * 1.6, cz = rd.z1 + dz * t + nz * sd * 1.6, rad = 1.6 + rnd() * 1.2; out.push({ x: cx, z: cz, r: rad * 0.7 }); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + rnd(), d = rad * 0.6; out.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: rad * 0.45 }); } }
  }
  return out;
}

export interface PathMask { tex: DataTexture; o: Vector4 }
/** Rasterise discs into a blurred coverage mask over [x0, x0+w] x [z0, z0+h] (`pxPerM` pixels per metre). Value 0.5 = the path edge, > 0.5 inside. */
export function pathMask(discs: Disc[], x0: number, z0: number, w: number, h: number, pxPerM: number): PathMask {
  const W = Math.min(2048, Math.ceil(w * pxPerM)), H = Math.min(2048, Math.ceil(h * pxPerM)), sx = W / w, sz = H / h;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  for (const d of discs) { g.beginPath(); g.arc((d.x - x0) * sx, (d.z - z0) * sz, d.r * sx, 0, 6.2832); g.fill(); }
  const src = g.getImageData(0, 0, W, H).data;
  let a = new Float32Array(W * H), b = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = src[i * 4] / 255;
  const rad = Math.max(2, Math.round(0.65 * sx));
  const box = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const n = horiz ? W : H, m = horiz ? H : W, st = horiz ? 1 : W, ln = horiz ? W : 1, k = 2 * rad + 1;
    for (let j = 0; j < m; j++) {
      const base = j * ln; let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += from[base + Math.min(n - 1, Math.max(0, i)) * st];
      for (let i = 0; i < n; i++) { to[base + i * st] = acc / k; acc += from[base + Math.min(n - 1, i + rad + 1) * st] - from[base + Math.max(0, i - rad) * st]; }
    }
  };
  box(a, b, true); box(b, a, false); box(a, b, true); box(b, a, false);
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = Math.min(255, Math.round(a[i] * 255)); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const tex = new DataTexture(data, W, H, RGBAFormat); tex.colorSpace = NoColorSpace; tex.magFilter = tex.minFilter = LinearFilter; tex.needsUpdate = true;
  return { tex, o: new Vector4(x0, z0, 1 / w, 1 / h) };
}

let soilTex: DataTexture | null = null;
/** Tileable painted soil (rgb) + leafy-clump noise (alpha, drives the ragged edge and the leaf spill). One 512 px tile covers ~9.5 m. */
export function soilTexture(): DataTexture {
  if (soilTex) return soilTex;
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d')!, rnd = mulberry32(0x5011);
  const wrap = (x: number, y: number, r: number, f: (px: number, py: number) => void) => { for (const ox of [-N, 0, N]) { if (x + ox < -r || x + ox > N + r) continue; for (const oy of [-N, 0, N]) { if (y + oy < -r || y + oy > N + r) continue; f(x + ox, y + oy); } } };
  g.fillStyle = '#c9a272'; g.fillRect(0, 0, N, N);
  const blob = (n: number, r0: number, r1: number, rgb: string, a0: number, a1: number) => { for (let i = 0; i < n; i++) { const x = rnd() * N, y = rnd() * N, r = r0 + rnd() * (r1 - r0), a = a0 + rnd() * (a1 - a0); wrap(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); } };
  blob(60, 30, 80, '176,132,88', 0.22, 0.4); blob(60, 30, 80, '226,196,150', 0.2, 0.38); blob(24, 20, 50, '150,110,72', 0.12, 0.22);
  for (let i = 0; i < 70; i++) { const x = rnd() * N, y = rnd() * N, r = 1.6 + rnd() * 2.2, lt = rnd() < 0.55; wrap(x, y, 6, (px, py) => { g.fillStyle = lt ? 'rgba(240,222,186,0.9)' : 'rgba(132,96,64,0.85)'; g.beginPath(); g.ellipse(px, py, r * 1.2, r, rnd() * 3, 0, 6.3); g.fill(); }); }
  // little leafy tufts inside the soil
  for (let i = 0; i < 9; i++) wrap(rnd() * N, rnd() * N, 16, (px, py) => { for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, d = rnd() * 7; g.fillStyle = ['#5d9c3a', '#79b648', '#4b8a32'][k % 3]; g.beginPath(); g.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, 4.2, 2.6, a, 0, 6.3); g.fill(); } });
  const img = g.getImageData(0, 0, N, N), d = img.data;
  // alpha = blobby leaf-clump noise (tileable: sum of wrapped sine layers + hash jitter), thresholded by the shader
  const al = new Float32Array(N * N);
  for (let k = 0; k < 340; k++) { const x = rnd() * N, y = rnd() * N, r = 5 + rnd() * 9; wrap(x, y, r, (px, py) => { const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(N - 1, Math.ceil(px + r)), y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(N - 1, Math.ceil(py + r)); for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dd = Math.hypot((xx - px) * 1.15, yy - py) / r; if (dd < 1) al[yy * N + xx] = Math.max(al[yy * N + xx], 1 - dd * 0.6); } }); }
  for (let i = 0; i < N * N; i++) d[i * 4 + 3] = Math.round(Math.min(1, al[i] * (0.82 + (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.2)) * 255);
  // (a DataTexture, not the canvas: a canvas premultiplies alpha and would eat the soil colour where the leaf noise is low)
  const tex = new DataTexture(new Uint8Array(d.buffer.slice(0)), N, N, RGBAFormat);
  tex.colorSpace = SRGBColorSpace; tex.wrapS = tex.wrapT = RepeatWrapping; tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  soilTex = tex;
  return soilTex;
}

const FRAG = /* glsl */ `
{
  vec2 mq = (vPW - uPm.xy) * uPm.zw;
  if (mq.x > 0.0 && mq.x < 1.0 && mq.y > 0.0 && mq.y < 1.0) {
    float pm = texture2D(uPath, mq).r;
    if (pm > 0.2) {
      vec4 sl = texture2D(uSoil, vPW * 0.105);
      float edge = pm + (sl.a - 0.5) * 0.48;
      float soilK = smoothstep(0.5, 0.545, edge);
      float spill = smoothstep(0.52, 0.58, edge) * (1.0 - smoothstep(0.64, 0.78, edge)) * step(0.52, sl.a);   // little leafy clumps spilling onto the soil
      vec3 leaf = vec3(0.10, 0.30, 0.06) * (0.8 + sl.a * 0.5);
      vec3 col = mix(diffuseColor.rgb, sl.rgb * 1.05, soilK);
      col = mix(col, leaf, spill * 0.9);
      diffuseColor.rgb = col;
    }
  }
}`;
/** Patch a ground material (vertex colours + map; geometry positions are world coordinates) to show the soil path of `mask`.
 *  With `sand` (a tileable beach multiplier texture) + a per-vertex float attribute `aSand` (0..1) the grass leaf texture is swapped for the sand one on beaches. */
export function applyPathShader(mat: MeshStandardMaterial, mask: PathMask | null, sand?: Texture): void {
  const soil = soilTexture();
  mat.onBeforeCompile = (sh) => {
    if (mask) { sh.uniforms.uPath = { value: mask.tex }; sh.uniforms.uSoil = { value: soil }; sh.uniforms.uPm = { value: mask.o }; }
    if (sand) sh.uniforms.uSand = { value: sand };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPW;' + (sand ? '\nattribute float aSand; varying float vSand;' : '')).replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = position.xz;' + (sand ? '\nvSand = aSand;' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPW;' + (mask ? ' uniform sampler2D uPath; uniform sampler2D uSoil; uniform vec4 uPm;' : '') + (sand ? ' uniform sampler2D uSand; varying float vSand;' : ''))
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + (sand ? 'diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uSand, vPW * 0.1).rgb, clamp(vSand * 1.2, 0.0, 1.0));' : ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (mask ? FRAG : ''));
  };
  mat.customProgramCacheKey = () => 'groundPathV2' + (mask ? 'p' : '') + (sand ? 's' : '');
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Ember lava floor (engine/lavaFloor.ts): the same blurred disc mask, drawn as a cooled dark crust rim around a glowing molten core. `inverted`: the mask holds the
// ROCK (heavy-lava rooms) and the lava is everything else. Time comes from the shared `lavaTime` uniform (written by RoomGround's useFrame).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export const lavaTime = { value: 0 };
const LAVA_COMMON = /* glsl */ `
uniform sampler2D uPath; uniform vec4 uPm; uniform float uLT; uniform float uLInv;
float lvK = 0.0, lvC = 0.0, lvH = 0.0;
float lvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lvNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lvHash(i), lvHash(i + vec2(1.0, 0.0)), f.x), mix(lvHash(i + vec2(0.0, 1.0)), lvHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const LAVA_COLOR = /* glsl */ `
{
  vec2 mq = (vPW - uPm.xy) * uPm.zw;
  if (mq.x > 0.0 && mq.x < 1.0 && mq.y > 0.0 && mq.y < 1.0) {
    float pm = texture2D(uPath, mq).r;
    if (uLInv > 0.5) pm = 1.0 - pm;
    if (pm > 0.2) {
      float n = lvNoise(vPW * 0.8) * 0.6 + lvNoise(vPW * 2.1 + 7.0) * 0.4;
      float e = pm + (n - 0.5) * 0.3;
      lvK = smoothstep(0.5, 0.54, e);
      float crust = smoothstep(0.12, 0.44, e) * (1.0 - lvK);
      vec3 rock = diffuseColor.rgb * 0.2 + vec3(0.02, 0.008, 0.005);
      diffuseColor.rgb = mix(diffuseColor.rgb, rock, crust);
      vec2 fl = vPW * 0.55 + vec2(uLT * 0.12, -uLT * 0.07);
      float heat = lvNoise(fl) * 0.5 + lvNoise(fl * 2.3 - uLT * 0.15) * 0.35 + lvNoise(fl * 5.0 + uLT * 0.2) * 0.15;
      lvC = smoothstep(0.66, 1.0, e + (heat - 0.5) * 0.4) * (0.2 + 0.8 * smoothstep(0.38, 0.72, heat));
      lvH = heat;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.02, 0.0), lvK);
    }
  }
}`;
const LAVA_EMIT = /* glsl */ `
if (lvK > 0.0) {
  float pulse = 0.88 + 0.12 * sin(uLT * 1.7 + lvH * 6.0);
  vec3 deep = vec3(0.9, 0.14, 0.012), hot = vec3(1.0, 0.5, 0.08);
  vec3 lc = mix(deep, hot, clamp(lvC * (0.55 + lvH * 0.6), 0.0, 1.0));
  lc *= mix(0.62, 1.0, lvC);
  totalEmissiveRadiance = mix(totalEmissiveRadiance, lc * 1.0 * pulse, lvK);
}`;
/** Patch an Ember ground material to show the lava of `mask` (see above). */
export function applyLavaShader(mat: MeshStandardMaterial, mask: PathMask, inverted: boolean): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPath = { value: mask.tex }; sh.uniforms.uPm = { value: mask.o }; sh.uniforms.uLT = lavaTime; sh.uniforms.uLInv = { value: inverted ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPW;' + LAVA_COMMON)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + LAVA_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + LAVA_EMIT);
  };
  mat.customProgramCacheKey = () => 'lavaFloorV1';
  mat.needsUpdate = true;
}
