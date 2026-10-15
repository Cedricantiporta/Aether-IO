// Pure terrain functions shared by ground mesh, props, forest and water.
import { ARENA_RADIUS } from '../engine/world';
import { islandRadius, POND as ENGINE_POND, REGIONS } from '../engine/mapgen';
import { LAKE } from '../engine/townData';
import { FARM, WALL, BREWER_HUT } from '../engine/townData';
import { fbm, lerp, smooth } from './util';

export const POND = { x: ENGINE_POND.x, z: ENGINE_POND.z, r: ENGINE_POND.r - 1.5 };
export const GROUND_SIZE = 2 * (ARENA_RADIUS + 70);

export function sstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Visual map edge: just outside the walkable limit (the lobby island is small, see engine/townData ISLAND_BOXES). */
export function edgeR(a: number) {
  return islandRadius(a) + 2;
}

/** Inside the town wall (+ margin): the paved yard. */
export function inYard(x: number, z: number, m = 0) {
  return x > WALL.x0 - m && x < WALL.x1 + m && z > WALL.z0 - m && z < WALL.z1 + 3.5 + m;
}
/** Outside the wall but occupied by the avenue / farm field (no random bushes, flowers or pebbles here). */
export function inForecourtUse(x: number, z: number, m = 0) {
  return (z > WALL.z1 && Math.abs(x) < 4.5 + m) || (Math.abs(x - FARM.x) < FARM.hw + 2 + m && Math.abs(z - FARM.z) < FARM.hd + 2 + m)
    || (Math.abs(z - FARM.z) < 2 + m && x < 0 && x > FARM.x) || Math.hypot(x - BREWER_HUT.x, z - BREWER_HUT.z) < 6 + m || (Math.abs(z - BREWER_HUT.z) < 2 + m && x > 0 && x < BREWER_HUT.x);
}

export function pondEdge(a: number) {
  return POND.r * (0.82 + 0.34 * fbm(Math.cos(a) * 1.2 + 11, Math.sin(a) * 1.2 + 11, 3));
}

/** 0..1: how far into the lake west of the town (ramps over LAKE.shore units from the shore line). */
export function lakeK(x: number, z: number) {
  if (x > LAKE.x1) return 0;
  const inX = sstep(LAKE.x1, LAKE.x1 - LAKE.shore, x);
  const inZ = sstep(LAKE.z0, LAKE.z0 + 14, z) * sstep(LAKE.z1, LAKE.z1 - 14, z);
  return inX * inZ;
}

export function groundY(x: number, z: number) {
  const k = lakeK(x, z);
  if (k > 0) return groundYLand(x, z) * (1 - k) - 1.6 * k;   // lake bed (water sits at y ~ -0.15)
  return groundYLand(x, z);
}
function groundYLand(x: number, z: number) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const e = edgeR(a);
  if (r < e - 2) return 0;
  const t = sstep(e - 2, e + 9, r);
  let y = t * 4.4 + t * (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 5.5;
  y += sstep(e + 8, e + 70, r) * 9 * fbm(x * 0.035 + 9, z * 0.035 + 9, 3);
  return y;
}

/** Dirt coverage 0..1 (town plaza, paths). */
/** No dirt paths any more: the town has its own paved roads (TownScenery). */
export function dirtAmount(_x: number, _z: number) { return 0; }
export { lerp, smooth };

export interface RegionStyle { color: string; w: number; grass: number }
export const REGION_STYLE: Record<string, RegionStyle> = {
  FARM: { color: '#8a6c3c', w: 0.7, grass: 0.2 },
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
