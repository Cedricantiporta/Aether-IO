// ============================================================================
// Procedural island: regions, obstacles, destructibles and a coarse collision
// grid. Called once per run from startRun(). Writes world.obstacles / crates.
// Placement uses a seeded RNG (random seed per run) so each run differs while
// the REGIONS stay in recognisable places.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone, ARENA_RADIUS, TOWN_CENTER, MAX_CRATES, SHRINE_POS, TRAINER_POS } from './world';
import type { Obstacle, ObstacleKind, Crate, CrateKind } from './types';
import { SHOP_POSITIONS } from '../constants';

/** Circle collider used for movement push-out and projectile blocking. */
export interface Collider {
  x: number;
  z: number;
  r: number;
  blocksProjectiles: boolean;
}

export type RegionKind = 'TOWN' | 'FARM' | 'RUINS' | 'GRAVEYARD' | 'CRYSTAL_GROVE' | 'CAMP' | 'QUARRY' | 'GROVE' | 'POND';
export interface Region { name: string; kind: RegionKind; x: number; z: number; r: number }

/** Pond: blocks walking (not shots). The render layer draws the water itself. */
export const POND = { x: 40, z: -40, r: 14, collisionR: 12 } as const;
export const SPAWN_SAFE_RADIUS = 15;
/** Legacy single value; crates now respawn after 60-90 s (see crates.ts). */
export const CRATE_RESPAWN_TIME = 75;

/** Fixed region centres (render tints the ground per region). Static, not per-run. */
export const REGIONS: Region[] = [
  { name: 'Town', kind: 'TOWN', x: TOWN_CENTER.x, z: TOWN_CENTER.z, r: 26 },
  { name: 'Mirror Pond', kind: 'POND', x: POND.x, z: POND.z, r: 22 },
  { name: 'Hollow Farm', kind: 'FARM', x: 50, z: 28, r: 20 },
  { name: 'Broken Ruins', kind: 'RUINS', x: -58, z: 22, r: 16 },
  { name: 'Restless Graveyard', kind: 'GRAVEYARD', x: -38, z: 64, r: 15 },
  { name: 'Aether Crystal Grove', kind: 'CRYSTAL_GROVE', x: -8, z: 70, r: 14 },
  { name: 'Bandit Camp', kind: 'CAMP', x: 66, z: -12, r: 13 },
  { name: 'Old Quarry', kind: 'QUARRY', x: -62, z: -38, r: 15 },
  { name: 'Whispering Grove', kind: 'GROVE', x: -30, z: 32, r: 12 },
  { name: 'Pine Grove', kind: 'GROVE', x: 14, z: -70, r: 11 },
  { name: 'Eastwood', kind: 'GROVE', x: 34, z: 58, r: 12 },
];

export const CRATE_HP: Record<CrateKind, number> = {
  CRATE: 30, BARREL: 20, CHEST: 120, POT: 1, HAY: 12, CRYSTAL: 60, ORE: 45, EXPLOSIVE_BARREL: 25, GRAVE: 50, CART: 100,
};
/** Collision radius while intact (0 = walk-through; POT/HAY break when the player touches them). */
export const CRATE_RADIUS: Record<CrateKind, number> = {
  CRATE: 0.8, BARREL: 0.65, CHEST: 0.95, POT: 0, HAY: 0, CRYSTAL: 0.9, ORE: 1.0, EXPLOSIVE_BARREL: 0.65, GRAVE: 0.7, CART: 1.4,
};
const CRATE_SPACE: Record<CrateKind, number> = {
  CRATE: 1.0, BARREL: 0.8, CHEST: 1.1, POT: 0.6, HAY: 1.3, CRYSTAL: 1.1, ORE: 1.4, EXPLOSIVE_BARREL: 0.8, GRAVE: 0.9, CART: 1.6,
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

/** Irregular island edge radius for an angle (angle = atan2(z, x)). Range ~86..98. */
export function islandRadius(angle: number): number {
  const r = ARENA_RADIUS - 7 + Math.sin(angle * 3 + phase1) * 3 + Math.sin(angle * 5 + phase2) * 2 + Math.sin(angle * 2 + phase3) * 1.5;
  return Math.min(ARENA_RADIUS - 1.5, r);
}

/** Walkable limit radius at (x,z): islandRadius(angle) - margin. Cheap early-out for callers: only needed when |p| > 80. */
export function edgeLimit(x: number, z: number, margin = 2): number {
  return bounds.room ? bounds.r - margin : islandRadius(Math.atan2(z, x)) - margin;
}

/**
 * Walkable bounds. Island (town): irregular edge, callers only test beyond `checkR`. Run room: a disc of radius `r`
 * around 0,0 (every position is tested). Written by installRoom() / generateMap().
 */
export const bounds = { room: false, r: 0, checkR: 70, checkR2: 80 * 80 };

/** Switches the collision world to a run room: `list` replaces every collider, `radius` is the walkable disc. */
export function installRoom(list: Collider[], radius: number): void {
  bounds.room = true; bounds.r = radius; bounds.checkR = 0; bounds.checkR2 = 0;
  colliders = list;
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

interface ClearZone { x: number; z: number; r: number }

function clearZones(): ClearZone[] {
  const zones: ClearZone[] = [
    { x: 0, z: 0, r: SPAWN_SAFE_RADIUS },
    { x: TOWN_CENTER.x, z: TOWN_CENTER.z, r: 16 },
    { x: POND.x, z: POND.z, r: POND.r + 2 },
  ];
  for (const s of SHOP_POSITIONS) zones.push({ x: s.position[0], z: s.position[2], r: 9 });
  zones.push({ x: SHRINE_POS[0], z: SHRINE_POS[2], r: 6 }, { x: TRAINER_POS[0], z: TRAINER_POS[2], r: 6 });
  return zones;
}

export function generateMap(): void {
  bounds.room = false; bounds.r = 0; bounds.checkR = 70; bounds.checkR2 = 80 * 80;
  mapSeed = (Math.random() * 4294967296) >>> 0;
  const rnd = mulberry32(mapSeed);
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  phase1 = rnd() * 6.28; phase2 = rnd() * 6.28; phase3 = rnd() * 6.28;
  obstacleId = 1;
  const obstacles: Obstacle[] = [];
  colliders = [];
  const zones = clearZones();
  const crateList: { kind: CrateKind; x: number; z: number }[] = [];
  const reg = (k: RegionKind, i = 0): Region => REGIONS.filter((r) => r.kind === k)[i];

  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, rot = rnd() * Math.PI * 2): Obstacle => {
    const o: Obstacle = { id: obstacleId++, kind, pos: new Vector3(x, 0, z), radius, scale, rot, blocksProjectiles: blocks };
    obstacles.push(o);
    colliders.push({ x, z, r: radius, blocksProjectiles: blocks });
    return o;
  };

  const inIsland = (x: number, z: number, margin: number) => Math.hypot(x, z) < islandRadius(Math.atan2(z, x)) - margin;
  const inClear = (x: number, z: number, r: number) => {
    for (const c of zones) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    return false;
  };
  const overlaps = (x: number, z: number, r: number, gap: number) => {
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + gap) return true;
    return false;
  };
  const canPlace = (x: number, z: number, r: number, gap = 0.6) => inIsland(x, z, r + 3) && !inClear(x, z, r) && !overlaps(x, z, r, gap);
  const tryAdd = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, rot?: number, gap = 0.6): boolean => {
    if (!canPlace(x, z, radius, gap)) return false;
    add(kind, x, z, radius, scale, blocks, rot);
    return true;
  };

  const crateFree = (kind: CrateKind, x: number, z: number): boolean => {
    if (!inIsland(x, z, 6) || inClear(x, z, 0.5)) return false;
    const sp = CRATE_SPACE[kind];
    if (overlaps(x, z, sp, 0.5)) return false;
    for (const c of crateList) if (Math.hypot(x - c.x, z - c.z) < sp + CRATE_SPACE[c.kind] + 0.2) return false;
    return true;
  };
  const tryCrate = (kind: CrateKind, x: number, z: number): boolean => {
    if (crateList.length >= MAX_CRATES || !crateFree(kind, x, z)) return false;
    crateList.push({ kind, x, z });
    return true;
  };

  /** Random point in a disc around (cx,cz); calls fn until `n` successes or tries run out. */
  const scatter = (cx: number, cz: number, radius: number, n: number, fn: (x: number, z: number) => boolean, minR = 0): number => {
    let done = 0;
    for (let t = 0; t < n * 25 && done < n; t++) {
      const a = rnd() * Math.PI * 2;
      const d = minR + Math.sqrt(rnd()) * (radius - minR);
      if (fn(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) done++;
    }
    return done;
  };

  /** Row of FENCE posts from (x1,z1) to (x2,z2); posts whose offset lies in [gapA,gapB] are skipped. */
  const fenceLine = (x1: number, z1: number, x2: number, z2: number, gapA = -1, gapB = -1) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.floor(len / 1.8));
    const rot = -Math.atan2(z2 - z1, x2 - x1);
    for (let i = 0; i <= n; i++) {
      const d = (i / n) * len;
      if (d >= gapA && d <= gapB) continue;
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      if (inIsland(x, z, 4) && !inClear(x, z, 0.5)) add('FENCE', x, z, 0.55, 1, false, rot);
    }
  };
  const fenceRect = (cx: number, cz: number, hw: number, hh: number, gapSide: 'S' | 'N' | 'E' | 'W', gapW: number) => {
    const w = hw * 2, h = hh * 2;
    const g = (side: string, len: number) => (gapSide === side ? [len / 2 - gapW / 2, len / 2 + gapW / 2] : [-1, -1]);
    const s = g('S', w), n = g('N', w), e = g('E', h), wv = g('W', h);
    fenceLine(cx - hw, cz - hh, cx + hw, cz - hh, s[0], s[1]);
    fenceLine(cx - hw, cz + hh, cx + hw, cz + hh, n[0], n[1]);
    fenceLine(cx + hw, cz - hh, cx + hw, cz + hh, e[0], e[1]);
    fenceLine(cx - hw, cz - hh, cx - hw, cz + hh, wv[0], wv[1]);
  };

  const tree = (x: number, z: number, big = false): boolean => {
    const scale = (big ? 1.4 : 1) + rnd() * 1.1;
    const radius = 0.8 + scale * 0.25;
    return tryAdd(rnd() < 0.5 ? 'PINE' : 'TREE', x, z, radius, scale, true, undefined, 0.5);
  };
  const rock = (x: number, z: number): boolean => {
    const scale = 0.6 + rnd() * 1.0, radius = 0.6 + scale * 0.9;
    return tryAdd('ROCK', x, z, radius, scale, true);
  };

  // ---- Shops (render draws the buildings; we only collide) + pond collider.
  for (const s of SHOP_POSITIONS) add('SHOP', s.position[0], s.position[2], 3, 1, true, 0);
  add('SHOP', SHRINE_POS[0], SHRINE_POS[2], 2.2, 1, true, 0);
  add('SHOP', TRAINER_POS[0], TRAINER_POS[2], 2.4, 1, true, 0);
  colliders.push({ x: POND.x, z: POND.z, r: POND.collisionR, blocksProjectiles: false });

  // ---- TOWN: well behind the shops, a ring of pots/crates at the outskirts.
  const town = reg('TOWN');
  add('WELL', TOWN_CENTER.x + 2, TOWN_CENTER.z - 17, 1.3, 1, true, 0);
  scatter(town.x, town.z, town.r, 4, (x, z) => tryCrate('POT', x, z), 17);
  scatter(town.x, town.z, town.r, 2, (x, z) => tryCrate('CRATE', x, z), 17);

  // ---- FARM: windmill, farmhouse, fenced paddock with hay + carts, well.
  const farm = reg('FARM');
  add('WINDMILL', farm.x - 9, farm.z - 8, 3.3, 1, true, rnd() * Math.PI * 2);
  add('HOUSE', farm.x + 9, farm.z - 8, 4, 1, true, 0);
  add('WELL', farm.x + 12, farm.z + 4, 1.3, 1, true, 0);
  const pcx = farm.x - 5, pcz = farm.z + 9;
  fenceRect(pcx, pcz, 9, 6, 'S', 5);
  scatter(pcx, pcz, 7, 8, (x, z) => Math.abs(x - pcx) < 7 && Math.abs(z - pcz) < 4.5 && tryCrate('HAY', x, z));
  scatter(pcx, pcz, 6, 1, (x, z) => Math.abs(x - pcx) < 6 && Math.abs(z - pcz) < 4 && tryCrate('CART', x, z));
  scatter(farm.x + 4, farm.z - 4, 14, 1, (x, z) => tryCrate('CART', x, z), 9);
  scatter(farm.x + 4, farm.z - 4, 14, 2, (x, z) => tryCrate('CRATE', x, z), 6);
  scatter(farm.x + 4, farm.z - 4, 14, 2, (x, z) => tryCrate('BARREL', x, z), 6);
  scatter(farm.x + 4, farm.z - 4, 14, 3, (x, z) => tryCrate('POT', x, z), 6);

  // ---- RUINS: broken pillar ring, statues, treasure.
  const ruins = reg('RUINS');
  const pillars = 8;
  for (let i = 0; i < pillars; i++) {
    if (i === 3 || i === 4) continue; // entrance
    const a = (i / pillars) * Math.PI * 2 + 0.2;
    tryAdd('RUIN', ruins.x + Math.cos(a) * 9.5, ruins.z + Math.sin(a) * 9.5, 0.9, 1 + rnd() * 0.6, true, undefined, 0.2);
  }
  add('STATUE', ruins.x - 3, ruins.z + 2, 1.0, 1.2, true);
  add('STATUE', ruins.x + 4, ruins.z - 3, 1.0, 1, true);
  tryAdd('RUIN', ruins.x + 14, ruins.z + 4, 0.9, 1.3, true);
  tryAdd('RUIN', ruins.x - 12, ruins.z - 9, 0.9, 1.1, true);
  tryCrate('CHEST', ruins.x + 0.5, ruins.z + 0.5);
  scatter(ruins.x, ruins.z, 12, 6, (x, z) => tryCrate('POT', x, z));
  scatter(ruins.x, ruins.z, 12, 2, (x, z) => tryCrate('CRATE', x, z), 3);
  scatter(ruins.x, ruins.z, 13, 3, rock, 6);

  // ---- GRAVEYARD: fenced yard, grave rows, dead stumps.
  const gy = reg('GRAVEYARD');
  fenceRect(gy.x, gy.z, 11, 8, 'S', 5);
  for (let gx = -8; gx <= 8; gx += 4) {
    for (const gz of [-2.5, 2.5]) {
      if (crateList.length >= MAX_CRATES) break;
      tryCrate('GRAVE', gy.x + gx + rand(-0.5, 0.5), gy.z + gz + rand(-0.6, 0.6));
    }
  }
  scatter(gy.x, gy.z, 7, 2, (x, z) => Math.abs(x - gy.x) < 9 && Math.abs(z - gy.z) < 6 && tryCrate('GRAVE', x, z));
  scatter(gy.x, gy.z, 15, 5, (x, z) => tryAdd('STUMP', x, z, 0.6, 0.9 + rnd() * 0.6, false, undefined, 0.4), 4);
  scatter(gy.x, gy.z, 10, 2, (x, z) => tryCrate('POT', x, z));

  // ---- CRYSTAL GROVE: spires around glowing crystal clusters.
  const cg = reg('CRYSTAL_GROVE');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd() * 0.5;
    const d = rand(8, 11);
    tryAdd('CRYSTAL_SPIRE', cg.x + Math.cos(a) * d, cg.z + Math.sin(a) * d, 1.0, 1.1 + rnd() * 0.8, true, undefined, 0.4);
  }
  scatter(cg.x, cg.z, 9, 9, (x, z) => tryCrate('CRYSTAL', x, z), 1.5);

  // ---- BANDIT CAMP: tents around a log-ringed fire, powder kegs, loot.
  const camp = reg('CAMP');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6 + rnd() * 0.3;
    tryAdd('TENT', camp.x + Math.cos(a) * 8, camp.z + Math.sin(a) * 8, 2.3, 1, true, -a + Math.PI / 2, 0.8);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd() * 0.4;
    tryAdd('LOG', camp.x + Math.cos(a) * 3.6, camp.z + Math.sin(a) * 3.6, 0.9, 1, false, a + Math.PI / 2, 0.2);
  }
  const kegA = rnd() * Math.PI * 2;
  scatter(camp.x + Math.cos(kegA) * 6, camp.z + Math.sin(kegA) * 6, 4.5, 4, (x, z) => tryCrate('EXPLOSIVE_BARREL', x, z));
  scatter(camp.x, camp.z, 11, 4, (x, z) => tryCrate('BARREL', x, z), 5);
  scatter(camp.x, camp.z, 11, 4, (x, z) => tryCrate('CRATE', x, z), 5);
  scatter(camp.x, camp.z, 6, 1, (x, z) => tryCrate('CHEST', x, z), 2);

  // ---- QUARRY: boulders, rocks, powder kegs.
  const q = reg('QUARRY');
  scatter(q.x, q.z, q.r, 8, (x, z) => {
    const scale = 1.3 + rnd() * 1.0;
    return tryAdd('BOULDER', x, z, 1.0 + scale * 0.7, scale, true, undefined, 0.8);
  });
  scatter(q.x, q.z, q.r, 6, rock);
  scatter(q.x, q.z, 12, 5, (x, z) => tryCrate('ORE', x, z), 3);
  scatter(q.x, q.z, 11, 4, (x, z) => tryCrate('EXPLOSIVE_BARREL', x, z), 2);
  scatter(q.x, q.z, 11, 1, (x, z) => tryCrate('CART', x, z), 3);
  scatter(q.x, q.z, 12, 2, (x, z) => tryCrate('CRATE', x, z), 3);

  // ---- POND shore: a few logs, crates and barrels at the landing.
  const pond = reg('POND');
  scatter(pond.x, pond.z, pond.r + 3, 2, (x, z) => tryAdd('LOG', x, z, 0.9, 1, false), POND.r + 3);
  scatter(pond.x, pond.z, pond.r + 4, 3, (x, z) => tryCrate('CRATE', x, z), POND.r + 3);
  scatter(pond.x, pond.z, pond.r + 4, 2, (x, z) => tryCrate('BARREL', x, z), POND.r + 3);
  scatter(pond.x, pond.z, pond.r + 4, 3, (x, z) => tree(x, z), POND.r + 4);

  // ---- GROVES: the only places with dense trees.
  for (const g of REGIONS) {
    if (g.kind !== 'GROVE') continue;
    scatter(g.x, g.z, g.r, 14, (x, z) => tree(x, z, true));
    scatter(g.x, g.z, g.r, 2, (x, z) => tryAdd('STUMP', x, z, 0.6, 1, false));
    scatter(g.x, g.z, g.r, 1, (x, z) => tryAdd('LOG', x, z, 0.9, 1, false));
  }

  // ---- OPEN GROUND: sparse rocks/stumps/logs and a few loose containers.
  const openOk = (x: number, z: number) => Math.hypot(x, z) > 24;
  for (let i = 0, placed = 0; i < 200 && placed < 10; i++) {
    const a = rnd() * Math.PI * 2, d = rand(24, ARENA_RADIUS - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (openOk(x, z) && rock(x, z)) placed++;
  }
  for (let i = 0, placed = 0; i < 100 && placed < 5; i++) {
    const a = rnd() * Math.PI * 2, d = rand(24, ARENA_RADIUS - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const ok = rnd() < 0.6 ? tryAdd('STUMP', x, z, 0.6, 0.9 + rnd() * 0.6, false) : tryAdd('LOG', x, z, 0.9, 1, false);
    if (ok) placed++;
  }
  const loose: CrateKind[] = ['CRATE', 'BARREL', 'POT', 'POT', 'CRATE', 'BARREL', 'POT', 'HAY'];
  for (let i = 0, placed = 0; i < 300 && placed < loose.length; i++) {
    const a = rnd() * Math.PI * 2, d = rand(24, ARENA_RADIUS - 14);
    if (tryCrate(loose[placed], Math.cos(a) * d, Math.sin(a) * d)) placed++;
  }
  void pick;

  world.obstacles = obstacles;
  world.obstaclesVersion++;
  rebuildColliderGrid();
  commitCrates(crateList, rnd);

  // ---- Permanent environmental hazards (zones). startRun order: clearWorld -> generateMap.
  const hazards: { kind: 'PUDDLE' | 'GAS'; x: number; z: number; r: number }[] = [];
  const hazardFree = (x: number, z: number, r: number): boolean => {
    if (!inIsland(x, z, r + 4) || inClear(x, z, r)) return false;
    if (overlaps(x, z, Math.min(r * 0.5, 3), 0)) return false;
    for (const h of hazards) if (Math.hypot(x - h.x, z - h.z) < h.r + r + 1) return false;
    return true;
  };
  const addHazard = (kind: 'PUDDLE' | 'GAS', x: number, z: number, r: number): boolean => {
    if (!hazardFree(x, z, r)) return false;
    hazards.push({ kind, x, z, r });
    return true;
  };
  // A few large marshy puddles (designer: "big parts instead of many small ones").
  const puddleR = () => rand(7, 10.5);
  const farmR = reg('FARM'), pondR = reg('POND');
  let puddles = 0;
  puddles += scatter(farmR.x, farmR.z, 26, 1, (x, z) => addHazard('PUDDLE', x, z, puddleR()), 8);
  puddles += scatter(pondR.x, pondR.z, 34, 1, (x, z) => addHazard('PUDDLE', x, z, puddleR()), POND.r + 9);
  const groves = REGIONS.filter((g) => g.kind === 'GROVE');
  const g0 = groves[Math.floor(rnd() * groves.length)];
  if (g0) puddles += scatter(g0.x, g0.z, g0.r + 14, 1, (x, z) => addHazard('PUDDLE', x, z, puddleR()), g0.r);
  // top up to at least 3 anywhere open on the island
  for (let t = 0; t < 80 && puddles < 3; t++) {
    const a = rnd() * Math.PI * 2, d = 25 + rnd() * 55;
    if (addHazard('PUDDLE', Math.cos(a) * d, Math.sin(a) * d, puddleR())) puddles++;
  }
  const gyR = reg('GRAVEYARD'), cgR = reg('CRYSTAL_GROVE'), qR = reg('QUARRY');
  scatter(gyR.x, gyR.z, 10, 2, (x, z) => addHazard('GAS', x, z, rand(3.5, 5)));
  scatter(cgR.x, cgR.z, 9, 1, (x, z) => addHazard('GAS', x, z, rand(3.5, 5)));
  scatter(qR.x, qR.z, 10, 1, (x, z) => addHazard('GAS', x, z, rand(3.5, 5)));
  if (rnd() < 0.5) scatter(cgR.x, cgR.z, 12, 1, (x, z) => addHazard('GAS', x, z, rand(3.5, 5)));

  for (const h of hazards) {
    const z = allocZone();
    if (!z) break;
    z.active = true; z.kind = h.kind; z.hostile = false; z.permanent = true;
    z.pos.set(h.x, 0, h.z); z.radius = h.r; z.maxLife = 1;
    z.dir.set(0, 0, 1); z.length = 0; z.damage = 0; z.tickT = 0;
    if (h.kind === 'GAS') {
      z.period = rand(6, 9); z.activeFor = rand(3, 4);
      z.life = rnd() * z.period;          // phase offset: active iff ((world.time + life) % period) < activeFor
      z.color = 0x7bd62a;
    } else {
      z.period = 0; z.activeFor = 0; z.life = 0; z.color = 0x4aa3df;
    }
  }
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
