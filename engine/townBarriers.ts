// ============================================================================
// Street-edge barriers inside the town walls (owner 2026-10-22): low wooden plant boxes, trimmed hedges and little stone walls that line the
// kerbs wherever the ground behind them is not a street / plaza, so the walkable space reads as streets + plazas and nobody cuts between the houses.
// Pure data (no three / React): the hand-written LINES below are clipped against every house (+ its door approach), shop (+ forecourt), road crossing,
// stair flight, lamp, bench, NPC home / patrol leg and existing collider; what is left becomes BARRIERS (drawn by render/townKit.tsx, solid as
// BARRIER_COLLIDERS which engine/townFill.ts adds to FILL_COLLIDERS). Kind 0 = wooden plant box (greenery + flowers), 1 = trimmed hedge, 2 = low stone wall.
// ============================================================================
import { HOUSES, HOUSE_KIT, ROADS, TIERS, TERRACE, NPCS, TOWN_SEATS, LAMPS, TOWN_COLLIDERS, WELL_POS, stairRun } from './townData';
import { SHOP_POSITIONS, shopFront } from '../constants';

export interface Barrier { x1: number; z1: number; x2: number; z2: number; kind: 0 | 1 | 2 }
/** Hand-written street-edge lines [x1, z1, x2, z2, kind]; the sample step clips them (see above). x +-43.4 = the inside of the wall. */
const E = 43.4;
export const BARRIER_LINES: [number, number, number, number, 0 | 1 | 2][] = [
  // north street: north edge (road mouths + NPC homes clip gaps), south edge of the two old shop-row blocks
  [-E, -8.25, E, -8.25, 0], [-E, -3.75, -19.5, -3.75, 0], [19.5, -3.75, E, -3.75, 0],
  // south street: north edge of the two old shop-row blocks, south edge of the park + the east lawn
  [-E, 7.75, -19.5, 7.75, 0], [19.5, 7.75, E, 7.75, 0], [-29, 12.25, -3.15, 12.25, 0], [3.15, 12.25, 29, 12.25, 0],
  // the avenue (west + east edge, either side of the lane mouths)
  [-3.15, 12.25, -3.15, 21.15, 0], [3.15, 12.25, 3.15, 21.15, 0], [-3.15, 25.25, -3.15, 30, 0], [3.15, 25.25, 3.15, 30, 0],
  // the lanes (hedges) and the garden strip's north edge
  [-E, 21.15, -3.15, 21.15, 1], [3.15, 21.15, E, 21.15, 1], [-E, 25.25, -3.15, 25.25, 1], [3.15, 25.25, E, 25.25, 1],
  [-E, 30, -3.15, 30, 1], [3.15, 30, E, 30, 1],
];
/** Manual gaps [x, z, r] (park entrance arch ...). */
const GAPS: [number, number, number][] = [[WELL_POS.x, 12.3, 2.0]];
/** Extra short walls that seal the leaks beside stair approaches [x1, z1, x2, z2, kind] (added after clipping against the same blockers). */
export const BARRIER_EXTRA: [number, number, number, number, 0 | 1 | 2][] = [];

const SEG = 0.2;
const dSeg = (x: number, z: number, x1: number, z1: number, x2: number, z2: number): number => {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)) : 0;
  return Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
};
const boxes: [number, number, number, number][] = [];   // x0 z0 x1 z1 (houses with their door approach, stairs)
for (const h of HOUSES) {
  if (!h.kit || Math.abs(h.x) > 44 || h.z < -40 || h.z > 37) continue;
  const k = HOUSE_KIT[h.kit], sc = h.s ?? 1, hw = k.half * sc + 0.1, d0 = (k.d / 2 + 0.4) * sc + 0.35, d1 = k.front * sc + 2.0;
  boxes.push(h.rot ? [h.x - hw, h.z - d1, h.x + hw, h.z + d0] : [h.x - hw, h.z - d0, h.x + hw, h.z + d1]);
}
for (const T of TIERS) {
  const run = stairRun(T.h);
  for (const s of T.stairs) {
    const a = s.c - s.hw, b = s.c + s.hw;   // (just the flight itself: the lines butt into its side rails, so no slit is left beside a stair)
    if (s.side === 'S') boxes.push([a, T.z1 - 1, b, T.z1 + run + 0.3]); else if (s.side === 'N') boxes.push([a, T.z0 - run - 0.3, b, T.z0 + 1]);
    else if (s.side === 'E') boxes.push([T.x1 - 1, a, T.x1 + run + 0.3, b]); else boxes.push([T.x0 - run - 0.3, a, T.x0 + 1, b]);
  }
}
boxes.push([-TERRACE.stairHw - 1.2, TERRACE.z1 - 1, TERRACE.stairHw + 1.2, TERRACE.stairZ + 1.2]);
const shops = SHOP_POSITIONS.filter((s) => Math.abs(s.position[0]) < 44 && s.position[2] > -40 && s.position[2] < 38);
const legs: [number, number, number, number, number][] = [];
for (const rd of ROADS) if (Math.abs(rd.x1) < 50 && Math.abs(rd.x2) < 50 && rd.z1 < 40 && rd.z2 < 40 && rd.z1 > -45) legs.push([rd.x1, rd.z1, rd.x2, rd.z2, rd.w / 2 + 0.45]);
for (const n of NPCS) {
  if (n.area || Math.abs(n.home[0]) > 44 || n.home[1] > 38 || n.home[1] < -40) continue;
  legs.push([n.home[0], n.home[1], n.home[0], n.home[1], 1.2]);
  const p = n.patrol; if (p) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; legs.push([a[0], a[1], b[0], b[1], 0.9]); }
}

function bad(x: number, z: number): boolean {
  for (const b of boxes) if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return true;
  for (const sp of shops) {
    const r = sp.rot ?? 0, px = sp.position[0], pz = sp.position[2], c = Math.cos(r), s = Math.sin(r), dx = x - px, dz = z - pz;
    const u = dx * c - dz * s, v = dx * s + dz * c;   // shop-local
    const f = shopFront(sp, 4.3);
    if (u > -3.6 && u < 3.6 && v > -3.5 && v < 5.4) return true;   // body + counter + forecourt
    if (Math.hypot(x - f.x, z - f.z) < 2.6) return true;
  }
  for (const l of legs) if (dSeg(x, z, l[0], l[1], l[2], l[3]) < l[4]) return true;
  for (const g of GAPS) if (Math.hypot(x - g[0], z - g[1]) < g[2]) return true;
  for (const [lx, lz] of LAMPS) if (Math.hypot(x - lx, z - lz) < 0.5) return true;   // (the lamp stands in the line: its own collider closes the slit)
  for (const s of TOWN_SEATS) if (Math.hypot(x - s.x, z - s.z) < 1.5) return true;
  for (const c of TOWN_COLLIDERS) { if (c[2] < 0.35) continue; /* (lamp posts: handled above) */ const dx = c[0] - x, dz = c[1] - z, r = c[2] + 0.4; if (dx * dx + dz * dz < r * r) return true; }
  return false;
}

/** Clip one line into its free runs (>= 0.9 m). */
function clip(x1: number, z1: number, x2: number, z2: number, kind: 0 | 1 | 2, out: Barrier[]): void {
  const len = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(len / SEG);
  let a = -1;
  const flush = (end: number): void => {
    if (a < 0) return;
    const t0 = a / n, t1 = end / n;
    if ((t1 - t0) * len >= 0.9) out.push({ x1: x1 + (x2 - x1) * t0, z1: z1 + (z2 - z1) * t0, x2: x1 + (x2 - x1) * t1, z2: z1 + (z2 - z1) * t1, kind });
    a = -1;
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n, ok = !bad(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
    if (ok && a < 0) a = i; else if (!ok) flush(i - 1);
  }
  flush(n);
}

export const BARRIERS: Barrier[] = [];
for (const [x1, z1, x2, z2, k] of [...BARRIER_LINES, ...BARRIER_EXTRA]) clip(x1, z1, x2, z2, k, BARRIERS);

/** Solid circles: r 0.5 every 0.7 m along each run, plus a chain along every house's front wall (a house is one r 2.6 circle: its corners leave slits where a run butts into it). */
export const BARRIER_COLLIDERS: [number, number, number][] = [];
for (const h of HOUSES) {
  if (!h.kit || Math.abs(h.x) > 44 || h.z < -40 || h.z > 37) continue;
  const k = HOUSE_KIT[h.kit], sc = h.s ?? 1, hw = k.half * sc - 0.15, fz = h.rot ? h.z - (k.d / 2) * sc - 0.3 : h.z + (k.d / 2) * sc + 0.3, n = Math.ceil((2 * hw) / 0.8);
  for (let i = 0; i <= n; i++) BARRIER_COLLIDERS.push([h.x - hw + (2 * hw * i) / n, fz, 0.45]);
}
for (const b of BARRIERS) {
  const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1), n = Math.max(1, Math.ceil(len / 0.7));
  for (let i = 0; i <= n; i++) BARRIER_COLLIDERS.push([b.x1 + ((b.x2 - b.x1) * i) / n, b.z1 + ((b.z2 - b.z1) * i) / n, 0.5]);
}
