// Pure terrain functions shared by ground mesh, props, forest and water.
import { ARENA_RADIUS } from '../engine/world';
import { islandRadius, POND as ENGINE_POND, REGIONS } from '../engine/mapgen';
import { fbm, lerp, smooth } from './util';

export const POND = { x: ENGINE_POND.x, z: ENGINE_POND.z, r: ENGINE_POND.r - 1.5 };
export const GROUND_SIZE = 2 * (ARENA_RADIUS + 70);

export function sstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Irregular visual map edge (always >= playable radius). */
export function edgeR(a: number) {
  // follows the engine's per-run island shape but never inside the walkable clamp (ARENA_RADIUS - 1)
  return Math.max(islandRadius(a) + 4, ARENA_RADIUS - 0.5);
}

export function pondEdge(a: number) {
  return POND.r * (0.82 + 0.34 * fbm(Math.cos(a) * 1.2 + 11, Math.sin(a) * 1.2 + 11, 3));
}

export function groundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r < ARENA_RADIUS + 1.5) {
    // playable area is flat except a shallow pond bowl
    const dx = x - POND.x, dz = z - POND.z;
    const pd = Math.hypot(dx, dz);
    if (pd < POND.r + 5) return -0.42 * sstep(POND.r + 4.5, POND.r - 3.5, pd);
    return 0;
  }
  const a = Math.atan2(z, x);
  const e = edgeR(a);
  const t = sstep(e - 2, e + 9, r);
  let y = t * 4.4 + t * (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 5.5;
  y += sstep(e + 8, e + 70, r) * 9 * fbm(x * 0.035 + 9, z * 0.035 + 9, 3);
  return y;
}

/** Dirt coverage 0..1 (town plaza, paths). */
const SEGS: [number, number, number, number, number][] = [
  // x1,z1,x2,z2,halfWidth
  [0, 3, -2, -12, 1.8],
  [-2, -12, -8, -17, 2.2],
  [-27, -18.5, 12, -22.5, 3.0],
  [-8, -14, -8, -22, 2.4],
  [8, -22, 8, -13, 1.6],
  [-24, -18, -24, -10, 1.6],
  [-8, -17, 25, -5, 1.5],
  [25, -5, 38, -30, 1.4],
  [-8, -17, -30, 8, 1.4],
];
const PLAZAS: [number, number, number][] = [[-24, -18, 8], [-8, -22, 8.5], [8, -22, 8], [0, 0, 4.2], [-8, -19.5, 14]];

export function dirtAmount(x: number, z: number) {
  let d = 0;
  for (const [cx, cz, r] of PLAZAS) {
    const dd = Math.hypot(x - cx, z - cz);
    d = Math.max(d, sstep(r + 1.5, r - 2.5, dd + (fbm(x * 0.4, z * 0.4, 2) - 0.5) * 3));
  }
  for (const [x1, z1, x2, z2, hw] of SEGS) {
    const vx = x2 - x1, vz = z2 - z1;
    const t = Math.min(1, Math.max(0, ((x - x1) * vx + (z - z1) * vz) / (vx * vx + vz * vz)));
    const dd = Math.hypot(x - (x1 + vx * t), z - (z1 + vz * t));
    d = Math.max(d, sstep(hw + 1.0, hw - 0.5, dd + (fbm(x * 0.5 + 3, z * 0.5, 2) - 0.5) * 1.6) * 0.95);
  }
  return d;
}
export { lerp, smooth };

export interface RegionStyle { color: string; w: number; grass: number }
export const REGION_STYLE: Record<string, RegionStyle> = {
  FARM: { color: '#b89c4a', w: 0.75, grass: 0.35 },
  RUINS: { color: '#8c9068', w: 0.45, grass: 0.7 },
  GRAVEYARD: { color: '#3b4238', w: 0.8, grass: 0.3 },
  CRYSTAL_GROVE: { color: '#6f62b4', w: 0.4, grass: 0.9 },
  CAMP: { color: '#9a7a4a', w: 0.6, grass: 0.35 },
  QUARRY: { color: '#8e8e8a', w: 0.8, grass: 0.1 },
  GROVE: { color: '#2d7a34', w: 0.35, grass: 1 },
  TOWN: { color: '#7fbf55', w: 0.15, grass: 1 },
};
/** strongest region influence at x,z: returns weight 0..1, style and a grass-density factor */
export function regionAt(x: number, z: number, out: { w: number; style: RegionStyle | null; grass: number; kind: string }) {
  out.w = 0; out.style = null; out.grass = 1; out.kind = '';
  for (const r of REGIONS) {
    const st = REGION_STYLE[r.kind]; if (!st) continue;
    const d = Math.hypot(x - r.x, z - r.z);
    const w = sstep(r.r, r.r * 0.55, d + (fbm(x * 0.12, z * 0.12, 2) - 0.5) * 5);
    if (w > out.w) { out.w = w; out.style = st; out.kind = r.kind; }
    if (w > 0) out.grass = Math.min(out.grass, 1 - w * (1 - st.grass));
  }
  return out;
}
