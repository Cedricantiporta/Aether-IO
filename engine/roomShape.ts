// ============================================================================
// Run-room outline. A room is a STAR-CONVEX region around the origin (the origin is the shape's centroid), stored as a
// polar lookup table r(theta) = walkable limit radius. mapgen.edgeLimit() samples it (one atan2, no allocations), so
// every system that already clamps with edgeLimit follows the shape for free. Pure TS (no three / no render imports).
// Built once per room from an implicit shape function (bisection along 256 rays), then scaled to ~the old disc area.
// ============================================================================

import { runInfo } from './runMods';

export type ShapeKind = 'ROUND' | 'ELLIPSE' | 'SEMI' | 'HEX' | 'OCT' | 'PEANUT' | 'RECT' | 'CROSS';
export const SHAPE_N = 256;
const TAU = Math.PI * 2;

export const shape = {
  kind: 'ROUND' as ShapeKind,
  /** r(theta) at theta_i = -PI + i*TAU/N, i in 0..N+1 (wrapped, so linear interpolation never needs a modulo). */
  table: new Float32Array(SHAPE_N + 2),
  maxR: 25, minR: 25,
  /** Nominal radius (equal-area disc) used for proportional placements. */
  baseR: 25,
  /** Unit "forward" direction: from the arrival side to the exit-portal side. */
  fx: 0, fz: -1,
  version: 0,
};

/** QA hook: set `dbg.force` to build every following room with that outline (also reachable from tests via import). */
export const dbg: { force: ShapeKind | null } = { force: null };

/** Walkable limit radius in direction `angle` (radians, atan2(z, x) convention). */
export function shapeAt(angle: number): number {
  let t = (angle + Math.PI) * (SHAPE_N / TAU);
  t -= Math.floor(t / SHAPE_N) * SHAPE_N;
  const i = t | 0, f = t - i, T = shape.table;
  return T[i] * (1 - f) + T[i + 1] * f;
}

/** Walkable limit radius in the direction of (x, z). */
export function shapeLimit(x: number, z: number): number {
  const t = (Math.atan2(z, x) + Math.PI) * (SHAPE_N / TAU);
  const i = t | 0, f = t - i, T = shape.table;
  return T[i] * (1 - f) + T[i + 1] * f;
}

/** Is (x, z) at least `margin` inside the outline? */
export function insideShape(x: number, z: number, margin: number): boolean {
  const lim = shapeLimit(x, z) - margin;
  return x * x + z * z < lim * lim && lim > 0;
}

/** Point on the outline at `theta`, pushed `off` along the outward normal. */
export function boundaryPoint(theta: number, off: number, out: [number, number]): void {
  const r = shapeAt(theta), dr = (shapeAt(theta + 0.01) - shapeAt(theta - 0.01)) / 0.02;
  const c = Math.cos(theta), s = Math.sin(theta);
  const tx = dr * c - r * s, tz = dr * s + r * c, l = Math.hypot(tx, tz) || 1;
  out[0] = r * c + (tz / l) * off;
  out[1] = r * s - (tx / l) * off;
}

/** Outline length (for spacing wall props). */
export function perimeter(): number {
  let p = 0;
  const T = shape.table, d = TAU / SHAPE_N;
  for (let i = 0; i < SHAPE_N; i++) { const a = T[i], b = T[i + 1]; p += Math.sqrt((a * a + b * b - 2 * a * b * Math.cos(d))); }
  return p;
}

// ------------------------------------------------------------ implicit shapes ---
type Fn = (x: number, z: number) => number;
const boxF = (x: number, z: number, hx: number, hz: number, c: number): number => {
  const qx = Math.abs(x) - (hx - c), qz = Math.abs(z) - (hz - c);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - c;
};
const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function pickKind(type: string, rnd: () => number): ShapeKind {
  const w = (list: [ShapeKind, number][]): ShapeKind => {
    let s = 0; for (const e of list) s += e[1];
    let r = rnd() * s;
    for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
    return list[0][0];
  };
  switch (type) {
    case 'BOSS': return w([['ROUND', 55], ['OCT', 45]]);
    case 'FOUNTAIN': case 'MERCHANT': case 'SHRINE': return w([['ROUND', 40], ['SEMI', 40], ['HEX', 20]]);
    case 'TREASURE': return w([['ROUND', 20], ['HEX', 20], ['OCT', 15], ['RECT', 15], ['SEMI', 30]]);
    default: return w([['ROUND', 15], ['ELLIPSE', 17], ['SEMI', 14], ['HEX', 8], ['OCT', 8], ['PEANUT', 14], ['RECT', 14], ['CROSS', 10]]);
  }
}

/** Builds the outline for a room of nominal radius R (walkable limit ~ R + 1 for a disc). Fills `shape`. */
export function buildShape(type: string, R: number, seed: number): ShapeKind {
  const rnd = mulberry(seed ^ 0x7f4a7c15);
  const kind = runInfo.mode === 'TOWER' ? 'ROUND' : dbg.force ?? pickKind(type, rnd);   // tower floors: always a round arena
  const theta0 = rnd() * TAU;
  let F: Fn, areaK = 1, axis = false;
  switch (kind) {
    case 'ELLIPSE': { const k = 2 + rnd() * 0.7; F = (x, z) => Math.hypot(x / k, z) - 1; areaK = 0.92; axis = true; break; }
    case 'SEMI': { const h = 0.02 + rnd() * 0.22; F = (x, z) => Math.max(Math.hypot(x, z) - 1, -x - h); areaK = 0.96; axis = true; break; }
    case 'HEX': case 'OCT': {
      const n = kind === 'HEX' ? 6 : 8, ap = Math.cos(Math.PI / n);
      F = (x, z) => { let m = -1e9; for (let k = 0; k < n; k++) { const a = (k * TAU) / n; const v = x * Math.cos(a) + z * Math.sin(a); if (v > m) m = v; } return m - ap; };
      break;
    }
    case 'PEANUT': { const e = 0.52 + rnd() * 0.1; F = (x, z) => Math.hypot(x, z) - (1 + e * Math.cos(2 * Math.atan2(z, x))); areaK = 0.92; axis = true; break; }
    case 'RECT': { const w = 1.35 + rnd() * 0.4; F = (x, z) => boxF(x, z, w, 1, 0.4); areaK = 0.95; axis = true; break; }
    case 'CROSS': { F = (x, z) => smin(boxF(x, z, 1, 0.42, 0.15), boxF(x, z, 0.42, 1, 0.15), 0.4); areaK = 0.9; axis = true; break; }
    default: F = (x, z) => Math.hypot(x, z) - 1; break;
  }

  const ray = (ox: number, oz: number, ang: number): number => {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    let lo = 0, hi = 4;
    for (let it = 0; it < 26; it++) { const m = (lo + hi) * 0.5; if (F(ox + dx * m, oz + dz * m) <= 0) lo = m; else hi = m; }
    return lo;
  };
  // pass 1: centroid of the unit shape
  let A = 0, cx = 0, cz = 0;
  const dA = TAU / SHAPE_N;
  for (let i = 0; i < SHAPE_N; i++) {
    const a = i * dA, r = ray(0, 0, a);
    A += 0.5 * r * r * dA; cx += (r * r * r * Math.cos(a) * dA) / 3; cz += (r * r * r * Math.sin(a) * dA) / 3;
  }
  cx /= A; cz /= A;
  // pass 2: radii about the centroid, in the final (rotated) frame
  const u = new Float32Array(SHAPE_N);
  let A2 = 0;
  for (let i = 0; i < SHAPE_N; i++) {
    const th = -Math.PI + i * dA;
    const r = ray(cx, cz, th - theta0);
    u[i] = r; A2 += 0.5 * r * r * dA;
  }
  const RT = R + 1;
  const s = Math.sqrt((areaK * Math.PI * RT * RT) / A2);
  const T = shape.table;
  let mx = 0, mn = 1e9;
  for (let i = 0; i < SHAPE_N; i++) { T[i] = u[i] * s; if (T[i] > mx) mx = T[i]; if (T[i] < mn) mn = T[i]; }
  T[SHAPE_N] = T[0]; T[SHAPE_N + 1] = T[1];
  shape.kind = kind; shape.maxR = mx; shape.minR = mn; shape.baseR = Math.sqrt(areaK) * R; shape.version++;
  if (axis) {
    const sg = kind === 'SEMI' ? 1 : rnd() < 0.5 ? 1 : -1;
    shape.fx = Math.cos(theta0) * sg; shape.fz = Math.sin(theta0) * sg;
  } else { shape.fx = 0; shape.fz = -1; }
  return kind;
}

/** Hero arrival point (back side of the room). */
export function startPoint(out: [number, number]): void {
  const k = 0.55 * shapeAt(Math.atan2(-shape.fz, -shape.fx));
  out[0] = -shape.fx * k; out[1] = -shape.fz * k;
}
/** Station (fountain / merchant / chest / altar) point, just ahead of the centroid. */
export function stationPoint(out: [number, number]): void {
  out[0] = shape.fx * shape.baseR * 0.1; out[1] = shape.fz * shape.baseR * 0.1;
}
/** Exit portal i of n: spread across the width at the front-most spot that keeps >= 5 of clearance to the outline. */
export function portalPoint(i: number, n: number, out: [number, number]): void {
  const fa = Math.atan2(shape.fz, shape.fx);
  const w = Math.min(shapeAt(fa + Math.PI / 2), shapeAt(fa - Math.PI / 2));
  let lat = 0;
  if (n === 2) lat = (i === 0 ? -1 : 1) * Math.max(4.6, Math.min(0.45 * shape.baseR, w - 6));
  else if (n === 3) lat = (i - 1) * Math.max(5.6, Math.min(0.6 * shape.baseR, w - 6));
  const px = -shape.fz, pz = shape.fx; // perpendicular
  for (let F = shapeAt(fa) - 4; F > -shape.baseR; F -= 0.5) {
    const x = shape.fx * F + px * lat, z = shape.fz * F + pz * lat;
    if (shapeLimit(x, z) - Math.hypot(x, z) >= 5) { out[0] = x; out[1] = z; return; }
  }
  out[0] = 0; out[1] = 0;
}
