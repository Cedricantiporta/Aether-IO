// Pure terrain functions shared by ground mesh, props, forest and water.
import { ARENA_RADIUS } from '../engine/world';
import { islandRadius, POND as ENGINE_POND, REGIONS } from '../engine/mapgen';
import { LAKE } from '../engine/townData';
import { FARM, WALL, BREWER_HUT, ROADS, RIVER, FIELDS } from '../engine/townData';
import { inCampYard } from '../engine/caveData';
import { hillAt } from '../engine/townHills';
import { BEACH, beachSandK } from '../engine/beachData';
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
    || (Math.abs(z - FARM.z) < 2 + m && x < 0 && x > FARM.x) || Math.hypot(x - BREWER_HUT.x, z - BREWER_HUT.z) < 6 + m || (Math.abs(z - BREWER_HUT.z) < 2 + m && x > 0 && x < BREWER_HUT.x)
    || beachSandK(x, z) > 0.15   // the lakeside beach (render/Beach.tsx has its own props)
    || inCampYard(x, z, 2 + m) || onDirtPath(x, z, 1.2 + m)
    || riverK(x, z) > 0 || (z > RIVER.z0 - 2.5 - m && z < RIVER.z1 + 2.5 + m && x > RIVER.x0 && x < RIVER.x1 + 3)   // the river + its banks
    || FIELDS.some((F) => Math.abs(x - F.x) < F.hw + 1.5 + m && Math.abs(z - F.z) < F.hd + 1.5 + m)
    || (z > 78 && Math.abs(x) < 4.6 + m);   // the mainland road (fenced)   // the mining camp yard + the dirt paths to the camp / the beach
}
/** Within `m` of a dirt path (townData ROADS with `dirt`: meadow -> beach, coop -> mines, the camp). */
const DIRT = ROADS.filter((r) => r.dirt);
export function onDirtPath(x: number, z: number, m = 0): boolean {
  for (const r of DIRT) {
    const dx = r.x2 - r.x1, dz = r.z2 - r.z1, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - r.x1) * dx + (z - r.z1) * dz) / l2)) : 0;
    const ex = x - r.x1 - dx * t, ez = z - r.z1 - dz * t, w = r.w / 2 + m;
    if (ex * ex + ez * ez < w * w) return true;
  }
  return false;
}

export function pondEdge(a: number) {
  return POND.r * (0.82 + 0.34 * fbm(Math.cos(a) * 1.2 + 11, Math.sin(a) * 1.2 + 11, 3));
}

/** 0..1: how far into the lake west of the town (ramps over LAKE.shore units from the shore line). */
export function lakeK(x: number, z: number) {
  if (x > LAKE.x1) return 0;
  // the beach (engine/beachData) pushes the shore line west along the southern half of the west side
  const sx = LAKE.x1 + (BEACH.shoreX - LAKE.x1) * sstep(BEACH.z0 - 11, BEACH.z0 - 2, z) * sstep(BEACH.z1 + 9, BEACH.z1 + 1, z);
  const inX = sstep(sx, sx - LAKE.shore, x);
  const inZ = sstep(LAKE.z0, LAKE.z0 + 14, z) * sstep(LAKE.z1, LAKE.z1 - 14, z);
  return inX * inZ;
}

/** 0..1: how far into the river south of the gate (banks slope down over ~2.5 units, the bed sits at -1.7). */
export function riverK(x: number, z: number) {
  if (x < RIVER.x0 || x > RIVER.x1 + 2.5) return 0;
  const inZ = sstep(RIVER.z0 - 0.6, RIVER.z0 + 1.6, z) * sstep(RIVER.z1 + 0.6, RIVER.z1 - 1.6, z);
  return inZ * sstep(RIVER.x1 + 2.5, RIVER.x1 - 1.5, x);
}
export function groundY(x: number, z: number) {
  const rk = riverK(x, z);
  if (rk > 0) { const y0 = groundY0(x, z); return y0 * (1 - rk) - 1.7 * rk; }
  return groundY0(x, z);
}
function groundY0(x: number, z: number) {
  const k = lakeK(x, z);
  if (k > 0) return groundYLand(x, z) * (1 - k) - 1.6 * k;   // lake bed (water sits at y ~ -0.15)
  return groundYLand(x, z);
}
function groundYLand(x: number, z: number) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const e = edgeR(a);
  const hill = hillAt(x, z);   // rolling hills outside the walls (engine/townHills)
  if (r < e - 2) return hill;
  const t = sstep(e - 2, e + 9, r);
  let y = t * 4.4 + t * (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 5.5;
  y += sstep(e + 8, e + 70, r) * 9 * fbm(x * 0.035 + 9, z * 0.035 + 9, 3);
  return y + hill;
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
