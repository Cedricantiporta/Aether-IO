// Core CPU particle simulation + ground decals + flash lights.
// Module singletons so any renderer (hero, enemies, pets...) can emit without React plumbing.
// VFX.tsx mounts the GPU meshes that draw these buffers.
import { CanvasTexture, Color, LinearFilter, SRGBColorSpace, Texture } from 'three';
import { fbm, TAU } from './util';

// ------------------------------------------------------------------ atlas ----
let _atlas: Texture | null = null;
export function getAtlas(): Texture {
  if (_atlas) return _atlas;
  const N = 64, G = 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N * G;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N * G, N * G);
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const f = (cell: number, u: number, v: number): number => {
    const r = Math.hypot(u, v);
    switch (cell) {
      case 0: return Math.pow(Math.max(0, 1 - r), 2.2);
      case 1: return ss(1, 0.62, r);
      case 2: {
        const a = Math.max(Math.exp(-Math.abs(u) * 16) * Math.pow(1 - Math.abs(v), 2), Math.exp(-Math.abs(v) * 16) * Math.pow(1 - Math.abs(u), 2));
        return Math.min(1, a + Math.pow(Math.max(0, 1 - r * 1.4), 2) * 0.8);
      }
      case 3: { const sd = Math.min(Math.max(Math.abs(u) - 0.3, Math.abs(v) - 0.88), Math.max(Math.abs(u) - 0.88, Math.abs(v) - 0.3)); return ss(0.05, -0.05, sd); }
      case 4: { const n = fbm(u * 3 + 10, v * 3 + 10, 3); return ss(1, 0.25, r + (n - 0.5) * 0.5) * (0.5 + 0.5 * n); }
      case 5: { const sd = Math.abs(u) * 1.7 + Math.abs(v) - 0.9; return ss(0.05, -0.1, sd); }
      case 6: return Math.exp(-Math.pow((r - 0.82) / 0.09, 2));
      case 7: return Math.pow(Math.max(0, 1 - Math.abs(u)), 0.55) * Math.exp(-Math.pow(v * 2.4, 2)) * (0.35 + 0.65 * Math.exp(-u * u * 3));
      case 8: { const t = (v + 1) / 2; const hw = 0.62 * Math.sin(Math.PI * Math.pow(t, 0.65)) ; return ss(hw, hw * 0.35, Math.abs(u)) * ss(0, 0.06, t) * ss(1, 0.9, t); }
      case 9: { const sd = Math.hypot(u * 0.9, v * 1.15) - 0.8; return ss(0.1, -0.1, sd) * (0.6 + 0.4 * (1 - r)); }
      case 12: { const n = fbm(u * 3 + 3, v * 3 + 7, 4); return ss(1.0, 0.25, r + (n - 0.5) * 0.9) * 0.9; }
      case 13: { const ang = Math.atan2(v, u); const n = fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5, 3); const rr = 0.35 + 0.6 * n; const sp = 0.13 * Math.pow(Math.abs(Math.sin(ang * 4.5 + n * 6)), 6); return ss(rr + sp, rr * 0.7, r); }
      case 14: { const ang = Math.atan2(v, u); const n = fbm(Math.cos(ang * 2) * 2 + 9, r * 4, 2); const ray = Math.abs(Math.sin(ang * 3.5 + n * 5)); return ss(0.2, 0.0, ray * (0.3 + r)) * (1 - r) * 0.9 + Math.pow(Math.max(0, 1 - r * 3), 2); }
      case 15: return ss(0.55, 0.85, r) * ss(1, 0.9, r) * 0.8 + Math.exp(-Math.pow((r - 0.93) / 0.04, 2)) * 0.6;
      default: return 0;
    }
  };
  for (let cell = 0; cell < 16; cell++) {
    const cx = (cell % G) * N, cy = Math.floor(cell / G) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1, v = 1 - ((y + 0.5) / N) * 2; // v up
      const a = Math.min(1, Math.max(0, f(cell, u, v)));
      const i = ((cy + y) * N * G + cx + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.generateMipmaps = false;
  _atlas = t;
  return t;
}

export const CELL = { GLOW: 0, DISC: 1, STAR: 2, PLUS: 3, SMOKE: 4, SHARD: 5, RING: 6, STREAK: 7, FLAME: 8, SOFT: 9, SCORCH: 12, SPLAT: 13, CRACK: 14, RINGW: 15 };

// -------------------------------------------------------------- particles ----
export class Particles {
  n = 0; cursor = 0;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; maxLife: Float32Array; s0: Float32Array; s1: Float32Array;
  cr: Float32Array; cg: Float32Array; cb: Float32Array; ca: Float32Array;
  grav: Float32Array; drag: Float32Array; rot: Float32Array; rotV: Float32Array; stretch: Float32Array; cell: Float32Array;
  // GPU buffers (compacted)
  iPos: Float32Array; iVel: Float32Array; iCol: Float32Array; iData: Float32Array;
  constructor(public cap: number) {
    const F = (k = 1) => new Float32Array(cap * k);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.maxLife = F(); this.s0 = F(); this.s1 = F();
    this.cr = F(); this.cg = F(); this.cb = F(); this.ca = F();
    this.grav = F(); this.drag = F(); this.rot = F(); this.rotV = F(); this.stretch = F(); this.cell = F();
    this.iPos = F(3); this.iVel = F(3); this.iCol = F(4); this.iData = F(4);
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number,
    r: number, g: number, b: number, a: number, cell: number, grav = 0, drag = 0, rot = 0, rotV = 0, stretch = 0) {
    // find a dead slot starting from cursor (bounded scan), else overwrite
    let i = this.cursor;
    for (let k = 0; k < 24; k++) { if (this.life[i] <= 0) break; i = i + 1 >= this.cap ? 0 : i + 1; }
    this.cursor = i + 1 >= this.cap ? 0 : i + 1;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a; this.cell[i] = cell;
    this.grav[i] = grav; this.drag[i] = drag; this.rot[i] = rot; this.rotV[i] = rotV; this.stretch[i] = stretch;
  }
  update(dt: number) {
    let n = 0;
    const cap = this.cap;
    for (let i = 0; i < cap; i++) {
      let l = this.life[i];
      if (l <= 0) continue;
      l -= dt;
      this.life[i] = l;
      if (l <= 0) continue;
      const dr = 1 / (1 + this.drag[i] * dt);
      let vx = this.vx[i] * dr, vy = (this.vy[i] - this.grav[i] * dt) * dr, vz = this.vz[i] * dr;
      let y = this.py[i] + vy * dt;
      if (y < 0.04 && vy < 0 && this.grav[i] > 5) { y = 0.04; vy = -vy * 0.32; vx *= 0.65; vz *= 0.65; this.rotV[i] *= 0.5; }
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      const x = this.px[i] + vx * dt, z = this.pz[i] + vz * dt;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.rot[i] += this.rotV[i] * dt;
      const k = l / this.maxLife[i];       // 1 -> 0
      const age = 1 - k;
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * age;
      const fade = Math.min(1, age * 14) * Math.min(1, k * 3.2);
      const o3 = n * 3, o4 = n * 4;
      this.iPos[o3] = x; this.iPos[o3 + 1] = y; this.iPos[o3 + 2] = z;
      this.iVel[o3] = vx; this.iVel[o3 + 1] = vy; this.iVel[o3 + 2] = vz;
      this.iCol[o4] = this.cr[i]; this.iCol[o4 + 1] = this.cg[i]; this.iCol[o4 + 2] = this.cb[i]; this.iCol[o4 + 3] = this.ca[i] * fade;
      this.iData[o4] = size; this.iData[o4 + 1] = this.cell[i]; this.iData[o4 + 2] = this.rot[i]; this.iData[o4 + 3] = this.stretch[i];
      n++;
    }
    this.n = n;
  }
  clear() { this.life.fill(0); this.n = 0; }
}

export const FX = {
  add: new Particles(4200),    // additive glow
  norm: new Particles(2400),   // alpha blended (smoke, dust, chunks)
  halo: new Particles(1600),   // per-frame immediate-mode glows (projectile halos); n reset by the writer each frame
  scale: 1,                    // emission probability scale (quality)
};

/** immediate-mode billboard glow (additive). Call after `FX.halo.n = 0` each frame. */
export function pushHalo(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, cell = 0) {
  const P = FX.halo, i = P.n;
  if (i >= P.cap) return;
  const o3 = i * 3, o4 = i * 4;
  P.iPos[o3] = x; P.iPos[o3 + 1] = y; P.iPos[o3 + 2] = z; P.iVel[o3] = 0; P.iVel[o3 + 1] = 0; P.iVel[o3 + 2] = 0;
  P.iCol[o4] = r; P.iCol[o4 + 1] = g; P.iCol[o4 + 2] = b; P.iCol[o4 + 3] = a;
  P.iData[o4] = size; P.iData[o4 + 1] = cell; P.iData[o4 + 2] = 0; P.iData[o4 + 3] = 0;
  P.n = i + 1;
}

// ---------------------------------------------------------------- decals ----
export class Decals {
  cap = 160; cursor = 0; n = 0;
  x = new Float32Array(160); z = new Float32Array(160); s0 = new Float32Array(160); s1 = new Float32Array(160);
  rot = new Float32Array(160); life = new Float32Array(160); maxLife = new Float32Array(160);
  r = new Float32Array(160); g = new Float32Array(160); b = new Float32Array(160); a = new Float32Array(160); cell = new Float32Array(160);
  iPos = new Float32Array(160 * 3); iCol = new Float32Array(160 * 4); iData = new Float32Array(160 * 2);
  add(x: number, z: number, s0: number, s1: number, life: number, r: number, g: number, b: number, a: number, cell: number, rot = Math.random() * TAU) {
    const i = this.cursor; this.cursor = (i + 1) % this.cap;
    this.x[i] = x; this.z[i] = z; this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.maxLife[i] = life;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a; this.cell[i] = cell; this.rot[i] = rot;
  }
  update(dt: number) {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = this.life[i] / this.maxLife[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - k);
      const o3 = n * 3, o4 = n * 4, o2 = n * 2;
      this.iPos[o3] = this.x[i]; this.iPos[o3 + 1] = this.z[i]; this.iPos[o3 + 2] = this.rot[i];
      this.iCol[o4] = this.r[i]; this.iCol[o4 + 1] = this.g[i]; this.iCol[o4 + 2] = this.b[i];
      this.iCol[o4 + 3] = this.a[i] * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 12 + 0.3);
      this.iData[o2] = size; this.iData[o2 + 1] = this.cell[i];
      n++;
    }
    this.n = n;
  }
  clear() { this.life.fill(0); this.n = 0; }
}
export const DECALS = new Decals();

// ---------------------------------------------------------------- lights ----
export interface FlashLight { x: number; y: number; z: number; r: number; g: number; b: number; i: number; life: number; max: number }
export const FLASHES: FlashLight[] = Array.from({ length: 3 }, () => ({ x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, i: 0, life: 0, max: 1 }));
let flashCursor = 0;
export function flashLight(x: number, y: number, z: number, hex: number, intensity: number, dur: number) {
  const f = FLASHES[flashCursor]; flashCursor = (flashCursor + 1) % FLASHES.length;
  _c.setHex(hex);
  f.x = x; f.y = y; f.z = z; f.r = _c.r; f.g = _c.g; f.b = _c.b; f.i = intensity; f.life = dur; f.max = dur;
}

// --------------------------------------------------------------- emitters ----
const _c = new Color();
const rnd = Math.random;
const sg = () => rnd() * 2 - 1;

/** Emit helpers – hex colours are sRGB hex, converted to linear. `boost` > 1 makes additive particles bloom. */
function setC(hex: number) { _c.setHex(hex); return _c; }

export function gate(): boolean { return FX.scale >= 1 || rnd() < FX.scale; }

export function sparks(x: number, y: number, z: number, n: number, hex: number, speed = 8, size = 0.28, life = 0.35, boost = 1.6, dirx = 0, diry = 0, dirz = 0, spread = 1) {
  setC(hex);
  for (let i = 0; i < n; i++) {
    if (!gate()) continue;
    const a = rnd() * TAU, e = rnd() * 1.2 - 0.1, sp = speed * (0.4 + rnd() * 0.8);
    const vx = Math.cos(a) * Math.cos(e) * sp * spread + dirx, vy = Math.sin(e) * sp * spread * 0.8 + 1 + diry, vz = Math.sin(a) * Math.cos(e) * sp * spread + dirz;
    FX.add.emit(x, y, z, vx, vy, vz, life * (0.6 + rnd() * 0.7), size, size * 0.25, _c.r * boost, _c.g * boost, _c.b * boost, 1, CELL.STREAK, 14, 1.5, 0, 0, 0.07);
  }
}
export function glowPuff(x: number, y: number, z: number, hex: number, size: number, life = 0.3, boost = 1.5, a = 0.9) {
  setC(hex);
  FX.add.emit(x, y, z, 0, 0, 0, life, size * 0.5, size, _c.r * boost, _c.g * boost, _c.b * boost, a, CELL.GLOW);
}
export function flashStar(x: number, y: number, z: number, hex: number, size: number, life = 0.22) {
  setC(hex);
  FX.add.emit(x, y, z, 0, 0, 0, life, size * 0.4, size, _c.r * 2, _c.g * 2, _c.b * 2, 1, CELL.STAR, 0, 0, rnd() * TAU, sg() * 3);
}
export function smokePuff(x: number, y: number, z: number, n: number, hex: number, size = 1.2, life = 0.9, rise = 1.2, spread = 1.5, a = 0.5) {
  setC(hex);
  for (let i = 0; i < n; i++) {
    if (!gate()) continue;
    FX.norm.emit(x + sg() * 0.2, y, z + sg() * 0.2, sg() * spread, rise * (0.5 + rnd()), sg() * spread, life * (0.7 + rnd() * 0.6), size * 0.5, size * (1 + rnd() * 0.6), _c.r, _c.g, _c.b, a, CELL.SMOKE, -0.2, 1.6, rnd() * TAU, sg() * 0.8);
  }
}
export function dustPuff(x: number, z: number, n = 3, size = 0.7, hex = 0xd9c9a3, spread = 1.4) {
  smokePuff(x, 0.15, z, n, hex, size, 0.55, 0.7, spread, 0.55);
}
export function chunks(x: number, y: number, z: number, n: number, hex: number, hex2: number, speed = 6, size = 0.28) {
  for (let i = 0; i < n; i++) {
    if (!gate()) continue;
    setC(rnd() < 0.5 ? hex : hex2);
    const a = rnd() * TAU, sp = speed * (0.35 + rnd() * 0.7);
    FX.norm.emit(x, y, z, Math.cos(a) * sp, 3 + rnd() * speed * 0.7, Math.sin(a) * sp, 0.9 + rnd() * 0.5, size * (0.6 + rnd() * 0.8), size * 0.4, _c.r, _c.g, _c.b, 1, CELL.SHARD, 22, 0.2, rnd() * TAU, sg() * 14);
  }
}
export function ringBurst(x: number, y: number, z: number, hex: number, r0: number, r1: number, life = 0.45, boost = 1.4) {
  setC(hex);
  FX.add.emit(x, y, z, 0, 0, 0, life, r0 * 2, r1 * 2, _c.r * boost, _c.g * boost, _c.b * boost, 0.8, CELL.RING, 0, 0, 0, 0, 0);
}
export function embers(x: number, y: number, z: number, n: number, hex = 0xff8a2a, spread = 0.6, rise = 3.2, life = 0.9, size = 0.2) {
  setC(hex);
  for (let i = 0; i < n; i++) {
    if (!gate()) continue;
    FX.add.emit(x + sg() * spread, y, z + sg() * spread, sg() * 0.8, rise * (0.5 + rnd()), sg() * 0.8, life * (0.6 + rnd() * 0.8), size, 0.02, _c.r * 1.8, _c.g * 1.8, _c.b * 1.8, 1, CELL.DISC, -0.5, 0.5);
  }
}
export function scorch(x: number, z: number, size: number, life = 6, a = 0.55) {
  DECALS.add(x, z, size * 0.7, size, life, 0.03, 0.025, 0.02, a, CELL.SCORCH);
}
export function splat(x: number, z: number, size: number, hex: number, life = 5, a = 0.75) {
  setC(hex);
  DECALS.add(x, z, size * 0.5, size, life, _c.r * 0.8, _c.g * 0.8, _c.b * 0.8, a, CELL.SPLAT);
}
/** jagged lightning bolt from -> to (world) made of stretched streak particles */
export function bolt(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, hex = 0xb8d4ff, width = 0.5) {
  const segs = 14;
  const dx = tx - fx, dy = ty - fy, dz = tz - fz;
  const len = Math.hypot(dx, dy, dz) || 1;
  // perpendicular basis
  let ux = -dz / (Math.hypot(dx, dz) || 1), uz = dx / (Math.hypot(dx, dz) || 1);
  let px = fx, py = fy, pz = fz;
  setC(hex);
  const cr = _c.r, cg = _c.g, cb = _c.b;
  const off = Math.min(2.2, len * 0.09);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const jx = i === segs ? 0 : sg() * off, jz = i === segs ? 0 : sg() * off, jy = i === segs ? 0 : sg() * off * 0.4;
    const nx = fx + dx * t + ux * jx + (dx / len) * 0, nz = fz + dz * t + uz * jx + jz * 0.4, ny = fy + dy * t + jy;
    const vx = nx - px, vy = ny - py, vz = nz - pz;
    const mx = (nx + px) / 2, my = (ny + py) / 2, mz = (nz + pz) / 2;
    // wide glow layer
    FX.add.emit(mx, my, mz, vx * 0.5, vy * 0.5, vz * 0.5, 0.26, width * 1.1, width * 0.4, cr * 1.4, cg * 1.4, cb * 2.2, 0.6, CELL.STREAK, 0, 0, 0, 0, 2);
    // white core
    FX.add.emit(mx, my, mz, vx * 0.5, vy * 0.5, vz * 0.5, 0.2, width * 0.35, width * 0.1, 3, 3, 3, 1, CELL.STREAK, 0, 0, 0, 0, 2);
    if (i % 3 === 0) FX.add.emit(nx, ny, nz, sg() * 3, sg() * 3, sg() * 3, 0.25, 0.3, 0.05, cr * 2, cg * 2, cb * 2.5, 1, CELL.STAR, 0, 0, rnd() * 3, 6);
    px = nx; py = ny; pz = nz;
  }
}
