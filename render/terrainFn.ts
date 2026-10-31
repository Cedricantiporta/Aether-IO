// Pure terrain functions shared by ground mesh, props, forest and water.
import { ARENA_RADIUS } from '../engine/world';
import { islandRadius, POND as ENGINE_POND, REGIONS } from '../engine/mapgen';
import { LAKE, ISLAND_BOXES } from '../engine/townData';
import { headSandK } from '../engine/bossIsland';
import { FARM, WALL, BREWER_HUT, ROADS, RIVER, FIELDS, riverBank, towerKnollAt, lakeSouth } from '../engine/townData';
import { inCampYard, CAVE_CLEAR } from '../engine/caveData';
import { hillAt } from '../engine/townHills';
import { BEACH, beachSandK, beachWobble, mainBeachK, MAIN_BEACH, mainShoreOff } from '../engine/beachData';
import { fbm, lerp, smooth } from './util';

export const POND = { x: ENGINE_POND.x, z: ENGINE_POND.z, r: ENGINE_POND.r - 1.5 };
export const GROUND_SIZE = 2 * (ARENA_RADIUS + 70);
/** Water level of the sea that surrounds the island (the lake / river keep their own levels, TownScenery). */
export const SEA_Y = -0.15;
/** Rectangle the town ground mesh covers: the island's bounding box + a margin (the sea hides everything beyond: its floor is never seen). */
export const GROUND_BOX = (() => {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const b of ISLAND_BOXES) { x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]); }
  const m = 22;   // (island edge noise + the cave bay bulge + the sloping shore)
  return { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
})();

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
    || headSandK(x, z) > 0.15 || beachSandK(x, z) > 0.15   // the lakeside beach (render/Beach.tsx has its own props)
    || inCampYard(x, z, 2 + m) || onDirtPath(x, z, 1.2 + m)
    || riverK(x, z) > 0 || (z > riverBank(x, 0) - 2.5 - m && z < riverBank(x, 1) + 2.5 + m && x > RIVER.x0 && x < RIVER.x1 + 3)   // the river + its banks
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
  const bk = sstep(BEACH.z0 - 11, BEACH.z0 - 2, z) * sstep(BEACH.z1 + 9, BEACH.z1 + 1, z), mk = mainBeachK(z), sx = LAKE.x1 + (BEACH.shoreX + beachWobble(z) - LAKE.x1) * bk - mainShoreOff(z) * mk;
  const inX = sstep(sx, sx - LAKE.shore, x);
  const zs = lakeSouth(x);
  const inZ = sstep(LAKE.z0, LAKE.z0 + 14, z) * sstep(zs, zs - 14, z);
  return inX * inZ;
}

/** 0..1: how far into the river south of the gate (banks slope down over ~2.5 units, the bed sits at -1.7). */
export function riverK(x: number, z: number) {
  if (x < RIVER.x0 || x > RIVER.x1 + 1) return 0;
  const z0 = riverBank(x, 0), z1 = riverBank(x, 1);   // (wavy banks that close round at the east end)
  if (z1 - z0 < 0.4) return 0;
  return sstep(z0 - 0.6, z0 + 1.6, z) * sstep(z1 + 0.6, z1 - 1.6, z) * Math.min(1, (z1 - z0) / 4);
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
  const hill = hillAt(x, z) + towerKnollAt(x, z);   // rolling hills outside the walls (engine/townHills) + the Endless Tower's knoll
  if (r < e - 2) return hill;
  // outside the walkable edge the island ends in the sea: the bank dips from the hills to just under the water line at ~edgeR, then the
  // sea floor falls away (the opaque sea surface hides it; render/TownScenery Sea)
  const k = sstep(e - 1.5, e + 3.5, r);
  let y = hill * (1 - k) - 0.45 * k - 2.6 * sstep(e + 3.5, e + 14, r);
  // the Crystal Cave's cliff stands half past the edge: keep a small headland of dry ground under it
  const cd = Math.hypot(x - CAVE_CLEAR.x, z - CAVE_CLEAR.z);
  if (cd < 14) y = Math.max(y, -0.15 + 0.6 * sstep(14, 6, cd));
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
  GLOOM: { color: '#6a6078', w: 0.9, grass: 0.45 },   // (the Endless Tower's haunted hollow: dead grey-violet grass; bare dirt + cracks are added in Terrain.groundColor)
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
