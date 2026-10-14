// ============================================================================
// Procedural island: regions, obstacles, destructibles and a coarse collision
// grid. Called once per run from startRun(). Writes world.obstacles / crates.
// Placement uses a seeded RNG (random seed per run) so each run differs while
// the REGIONS stay in recognisable places.
// ============================================================================
import { Vector3 } from 'three';
import { shapeLimit } from './roomShape';
import { world, allocZone, ARENA_RADIUS, TOWN_CENTER, MAX_CRATES, SHRINE_POS, TRAINER_POS } from './world';
import type { Obstacle, ObstacleKind, Crate, CrateKind } from './types';
import { SHOP_POSITIONS } from '../constants';
import { ISLAND_BOXES, FARM } from './townData';

/** Circle collider used for movement push-out and projectile blocking. */
export interface Collider {
  x: number;
  z: number;
  r: number;
  blocksProjectiles: boolean;
  /** Run-room liquid (roomFeatures.LIQ): 0 / undefined = solid prop, 1 water, 2 lava (burns on touch), 3 chasm. */
  liquid?: number;
}

/** Pushes (x, z) out of every collider (props and liquids) by `pad`; used for loot that lands in a lake or on a rock. */
const pushCols: Collider[] = [];
export function pushOutOfColliders(p: { x: number; z: number }, pad: number): void {
  for (let pass = 0; pass < 3; pass++) {
    const cols = queryColliders(p.x, p.z, pad + 4, pushCols);
    let moved = false;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = p.x - c.x, dz = p.z - c.z, min = c.r + pad, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { p.x = c.x + min; } else { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
      moved = true;
    }
    if (!moved) return;
  }
}

export type RegionKind = 'TOWN' | 'FARM' | 'RUINS' | 'GRAVEYARD' | 'CRYSTAL_GROVE' | 'CAMP' | 'QUARRY' | 'GROVE' | 'POND';
export interface Region { name: string; kind: RegionKind; x: number; z: number; r: number }

/** Pond: blocks walking (not shots). The render layer draws the water itself. */
/** The lobby no longer has a pond (kept far away so terrain code that still references it never triggers). */
export const POND = { x: 1e5, z: 1e5, r: 14, collisionR: 12 } as const;
export const SPAWN_SAFE_RADIUS = 15;
/** Legacy single value; crates now respawn after 60-90 s (see crates.ts). */
export const CRATE_RESPAWN_TIME = 75;

/** Fixed region centres (render tints the ground per region). Static, not per-run. */
export const REGIONS: Region[] = [
  { name: 'Town', kind: 'TOWN', x: TOWN_CENTER.x, z: TOWN_CENTER.z, r: 32 },
  { name: 'Hollow Farm', kind: 'FARM', x: FARM.x, z: FARM.z, r: 10 },
];

/** Harvest nodes: only broken by hand (hold E), never by attacks. */
export const isHarvestNode = (k: CrateKind): boolean => k === 'CRYSTAL' || k === 'ORE' || k === 'GOLD_VEIN' || k === 'HERB';
export const HARVEST_NAME: Partial<Record<CrateKind, string>> = { CRYSTAL: 'Aether Crystal', ORE: 'Ore Vein', GOLD_VEIN: 'Gold Vein', HERB: 'Healing Herb' };
export const CRATE_HP: Record<CrateKind, number> = {
  CRATE: 30, BARREL: 20, CHEST: 120, POT: 1, HAY: 12, CRYSTAL: 60, ORE: 45, GOLD_VEIN: 45, HERB: 30, EXPLOSIVE_BARREL: 25, GRAVE: 50, CART: 100,
};
/** Collision radius while intact (0 = walk-through; POT/HAY break when the player touches them). */
export const CRATE_RADIUS: Record<CrateKind, number> = {
  CRATE: 0.8, BARREL: 0.65, CHEST: 0.95, POT: 0, HAY: 0, CRYSTAL: 0.9, ORE: 1.0, GOLD_VEIN: 1.0, HERB: 0.6, EXPLOSIVE_BARREL: 0.65, GRAVE: 0.7, CART: 1.4,
};
const CRATE_SPACE: Record<CrateKind, number> = {
  CRATE: 1.0, BARREL: 0.8, CHEST: 1.1, POT: 0.6, HAY: 1.3, CRYSTAL: 1.1, ORE: 1.4, GOLD_VEIN: 1.4, HERB: 1.0, EXPLOSIVE_BARREL: 0.8, GRAVE: 0.9, CART: 1.6,
};

// ------------------------------------------------------------ collider grid --
const CELL = 8;
const HALF = ARENA_RADIUS + 12;
const COLS = Math.ceil((HALF * 2) / CELL) + 1;
let cells: Collider[][] = [];
let colliders: Collider[] = [];

const cellOf = (v: number): number => {
  const c = Math.floor((v + HALF) / CELL);
  return c < 0 ? 0 : c >= COLS ? COLS - 1 : c;
};

function rebuildColliderGrid(): void {
  cells = Array.from({ length: COLS * COLS }, () => [] as Collider[]);
  for (const c of colliders) {
    const x0 = cellOf(c.x - c.r), x1 = cellOf(c.x + c.r);
    const z0 = cellOf(c.z - c.r), z1 = cellOf(c.z + c.r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) cells[cz * COLS + cx].push(c);
  }
}

/** Runtime collider (crystal walls). Lives in the grid until removeTempCollider. */
export function addTempCollider(x: number, z: number, r: number, blocksProjectiles: boolean): Collider | null {
  if (cells.length === 0) return null;
  const c: Collider = { x, z, r, blocksProjectiles };
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) cells[cz * COLS + cx].push(c);
  return c;
}
export function removeTempCollider(c: Collider): void {
  const x0 = cellOf(c.x - c.r), x1 = cellOf(c.x + c.r), z0 = cellOf(c.z - c.r), z1 = cellOf(c.z + c.r);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const l = cells[cz * COLS + cx]; const i = l.indexOf(c); if (i >= 0) l.splice(i, 1);
  }
}

/**
 * Colliders whose grid cell overlaps the square (x±r, z±r). Fills and returns `out`
 * (may contain duplicates; callers do an exact test). Allocation-free.
 */
export function queryColliders(x: number, z: number, r: number, out: Collider[]): Collider[] {
  out.length = 0;
  if (cells.length === 0) return out;
  const x0 = cellOf(x - r), x1 = cellOf(x + r);
  const z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const list = cells[cz * COLS + cx];
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
  }
  return out;
}

// ------------------------------------------------------------------- shape --
let phase1 = 0, phase2 = 0, phase3 = 0;

/** Ray exit distance of a box [x0,z0,x1,z1] that contains the origin. */
function boxExit(b: [number, number, number, number], dx: number, dz: number): number {
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, b[2] / dx); else if (dx < -1e-9) t = Math.min(t, b[0] / dx);
  if (dz > 1e-9) t = Math.min(t, b[3] / dz); else if (dz < -1e-9) t = Math.min(t, b[1] / dz);
  return t;
}
/** Base (noise free) island edge radius: union of ISLAND_BOXES (star-convex around the origin). */
function baseRadius(angle: number): number {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  let r = 0;
  for (let i = 0; i < ISLAND_BOXES.length; i++) r = Math.max(r, boxExit(ISLAND_BOXES[i], dx, dz));
  return r;
}
/** Walled town + small forecourt; edge radius for an angle (angle = atan2(z, x)), with a little per-run wobble. */
export function islandRadius(angle: number): number {
  return baseRadius(angle) - 1.2 + Math.sin(angle * 3 + phase1) * 0.7 + Math.sin(angle * 5 + phase2) * 0.5;
}

/** Walkable limit radius at (x,z): islandRadius(angle) - margin. Cheap early-out for callers: only needed when |p| > bounds.checkR. */
export function edgeLimit(x: number, z: number, margin = 2): number {
  return bounds.room ? shapeLimit(x, z) - margin : islandRadius(Math.atan2(z, x)) - margin;
}

/**
 * Walkable bounds. Island (town): irregular edge, callers only test beyond `checkR`. Run room: the star-convex outline in
 * engine/roomShape (every position is tested; `r` is its mean radius). Written by installRoom() / generateMap().
 */
export const bounds = { room: false, r: 0, checkR: 45, checkR2: 45 * 45 };

/** Switches the collision world to a run room: `list` replaces every collider, `radius` is the walkable disc. */
export function installRoom(list: Collider[], radius: number): void {
  bounds.room = true; bounds.r = radius; bounds.checkR = 0; bounds.checkR2 = 0;
  colliders = list;
  rebuildColliderGrid();
}

/** Castle interior: replaces every collider with `list` ([x, z, r]) and disables the town's island edge clamp (walls are colliders). */
export function installInterior(list: [number, number, number][]): void {
  bounds.room = false; bounds.r = 0; bounds.checkR = 1e6; bounds.checkR2 = 1e12;
  colliders = list.map(([x, z, r]) => ({ x, z, r, blocksProjectiles: true }));
  rebuildColliderGrid();
}

/** Pushes `pos` (xz) out of intact solid crates. Allocation-free. */
export function pushOutOfCrates(pos: Vector3, radius: number): void {
  const crates = world.crates;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c.active) continue;
    const cr = CRATE_RADIUS[c.kind];
    if (cr <= 0) continue;
    const dx = pos.x - c.pos.x, dz = pos.z - c.pos.z;
    const min = cr + radius;
    if (dx > min || dx < -min || dz > min || dz < -min) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-4) { pos.x += min; continue; }
    pos.x = c.pos.x + (dx / d) * min;
    pos.z = c.pos.z + (dz / d) * min;
  }
}

// --------------------------------------------------------------------- rng --
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export let mapSeed = 0;

// ---------------------------------------------------------------- generator --
let obstacleId = 1;

export function generateMap(): void {
  bounds.room = false; bounds.r = 0;
  mapSeed = (Math.random() * 4294967296) >>> 0;
  const rnd = mulberry32(mapSeed);
  phase1 = rnd() * 6.28; phase2 = rnd() * 6.28; phase3 = rnd() * 6.28;
  // cheap early-out radius: smallest edge radius over all angles (minus a margin for the edge clamp)
  let minR = Infinity;
  for (let i = 0; i < 360; i++) minR = Math.min(minR, islandRadius((i / 360) * Math.PI * 2));
  bounds.checkR = Math.max(10, minR - 6); bounds.checkR2 = bounds.checkR * bounds.checkR;
  obstacleId = 1;
  const obstacles: Obstacle[] = [];
  colliders = [];
  const crateList: { kind: CrateKind; x: number; z: number }[] = [];
  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, rot = 0): void => {
    obstacles.push({ id: obstacleId++, kind, pos: new Vector3(x, 0, z), radius, scale, rot, blocksProjectiles: blocks });
    colliders.push({ x, z, r: radius, blocksProjectiles: blocks });
  };
  // The lobby is a small walled town + forecourt: the buildings are drawn by render/Town*, trees / planters / fences are
  // TOWN_COLLIDERS (engine/townData.ts, added by village.placeVillageNodes). Only the functional-building colliders live here.
  for (const s of SHOP_POSITIONS) add('SHOP', s.position[0], s.position[2], 3, 1, true, 0);
  add('SHOP', SHRINE_POS[0], SHRINE_POS[2], 2.2, 1, true, 0);
  // skill trainer pavilion (two circles) + its dummies / rack / target
  add('SHOP', TRAINER_POS[0], TRAINER_POS[2] - 0.4, 2.6, 1, true, 0); add('SHOP', TRAINER_POS[0], TRAINER_POS[2] - 2.4, 2.6, 1, true, 0);
  for (const [dx, dz, r] of [[-3.4, 1.7, 0.55], [-3.9, 3.6, 0.55], [3.7, 1.5, 0.9], [4.0, 3.7, 0.8], [2.6, 3.9, 0.6]] as const) add('SHOP', TRAINER_POS[0] + dx, TRAINER_POS[2] + dz, r, 1, true, 0);
  world.obstacles = obstacles;
  world.obstaclesVersion++;
  rebuildColliderGrid();
  commitCrates(crateList, rnd);
}

// ------------------------------------------------------------------- crates --
export function commitCrates(list: { kind: CrateKind; x: number; z: number }[], rnd: () => number): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  let slot = 0;
  for (const s of list) {
    if (slot >= MAX_CRATES) break;
    const c: Crate = world.crates[slot++];
    c.kind = s.kind;
    c.pos.set(s.x, 0, s.z);
    c.maxHp = c.hp = CRATE_HP[s.kind];
    c.rot = rnd() * Math.PI * 2;
    c.active = true;
  }
}
