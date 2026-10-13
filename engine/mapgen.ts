// ============================================================================
// Procedural island: obstacles, crates and a coarse collision grid.
// Called once per run from startRun(). Writes world.obstacles / world.crates.
// ============================================================================
import { Vector3 } from 'three';
import { world, ARENA_RADIUS, TOWN_CENTER, MAX_CRATES } from './world';
import type { Obstacle, ObstacleKind, Crate } from './types';
import { SHOP_POSITIONS } from '../constants';

/** Circle collider used for movement push-out and projectile blocking. */
export interface Collider {
  x: number;
  z: number;
  r: number;
  blocksProjectiles: boolean;
}

/** Pond: blocks walking (not shots). The render layer draws the water itself. */
export const POND = { x: 40, z: -40, r: 14, collisionR: 12 } as const;
export const SPAWN_SAFE_RADIUS = 15;
export const CRATE_RESPAWN_TIME = 60;

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

/** Irregular island edge radius for an angle (visual + placement; gameplay clamp is ARENA_RADIUS-1). */
export function islandRadius(angle: number): number {
  const r = ARENA_RADIUS - 6 + Math.sin(angle * 3 + phase1) * 3 + Math.sin(angle * 5 + phase2) * 2 + Math.sin(angle * 2 + phase3) * 1.5;
  return Math.min(ARENA_RADIUS - 1.5, r);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- generator --
let obstacleId = 1;

function clearZones(): { x: number; z: number; r: number }[] {
  const zones = [
    { x: 0, z: 0, r: SPAWN_SAFE_RADIUS },
    { x: TOWN_CENTER.x, z: TOWN_CENTER.z, r: 16 },
    { x: POND.x, z: POND.z, r: POND.r + 2 },
  ];
  for (const s of SHOP_POSITIONS) zones.push({ x: s.position[0], z: s.position[2], r: 9 });
  return zones;
}

export function generateMap(): void {
  phase1 = Math.random() * 6.28; phase2 = Math.random() * 6.28; phase3 = Math.random() * 6.28;
  obstacleId = 1;
  const obstacles: Obstacle[] = [];
  colliders = [];
  const zones = clearZones();

  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, rot = Math.random() * Math.PI * 2): Obstacle => {
    const o: Obstacle = { id: obstacleId++, kind, pos: new Vector3(x, 0, z), radius, scale, rot, blocksProjectiles: blocks };
    obstacles.push(o);
    colliders.push({ x, z, r: radius, blocksProjectiles: blocks });
    return o;
  };

  const inIsland = (x: number, z: number, margin: number) => {
    const d = Math.hypot(x, z);
    return d < islandRadius(Math.atan2(z, x)) - margin;
  };
  const inClear = (x: number, z: number, r: number) => {
    for (const c of zones) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    return false;
  };
  const overlaps = (x: number, z: number, r: number, gap: number) => {
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + gap) return true;
    return false;
  };
  const canPlace = (x: number, z: number, r: number, gap = 0.6) => inIsland(x, z, r + 3) && !inClear(x, z, r) && !overlaps(x, z, r, gap);

  // Shops (render draws the buildings; we only collide).
  for (const s of SHOP_POSITIONS) add('SHOP', s.position[0], s.position[2], 3, 1, true, 0);

  // Pond collider (not an obstacle: it has no obstacle kind) — walking only.
  colliders.push({ x: POND.x, z: POND.z, r: POND.collisionR, blocksProjectiles: false });

  // House + fence line (kept from the original layout).
  add('HOUSE', 20, 20, 4, 1, true, 0);
  for (let i = 0; i < 10; i++) add('FENCE', 15 + i * 1.5, 25, 0.5, 1, false, 0);

  // Ruined pillars in a broken ring.
  const ruinAngle = Math.PI * (0.65 + Math.random() * 0.2);
  const rcx = Math.cos(ruinAngle) * 44, rcz = Math.sin(ruinAngle) * 44;
  const pillars = 6;
  for (let i = 0; i < pillars; i++) {
    if (i === 2) continue; // gap = entrance
    const a = (i / pillars) * Math.PI * 2;
    const x = rcx + Math.cos(a) * 6, z = rcz + Math.sin(a) * 6;
    if (canPlace(x, z, 0.9, 0.2)) add('RUIN', x, z, 0.9, 1 + Math.random() * 0.5, true);
  }

  // Tree clusters.
  const clusters = 7;
  for (let c = 0; c < clusters; c++) {
    let cx = 0, cz = 0, ok = false;
    for (let t = 0; t < 30 && !ok; t++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(24, ARENA_RADIUS - 14);
      cx = Math.cos(a) * d; cz = Math.sin(a) * d;
      ok = inIsland(cx, cz, 8) && !inClear(cx, cz, 6) && !overlaps(cx, cz, 6, 4);
    }
    if (!ok) continue;
    const n = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 8;
      const scale = 1 + Math.random() * 1.2;
      const radius = 0.8 + scale * 0.25;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (canPlace(x, z, radius, 0.4)) add(Math.random() < 0.5 ? 'PINE' : 'TREE', x, z, radius, scale, true);
    }
  }

  // Scattered trees.
  for (let i = 0, placed = 0; i < 120 && placed < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(18, ARENA_RADIUS - 6);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const scale = 1 + Math.random() * 1.2, radius = 0.8 + scale * 0.25;
    if (canPlace(x, z, radius)) { add(Math.random() < 0.6 ? 'TREE' : 'PINE', x, z, radius, scale, true); placed++; }
  }

  // Rocks.
  for (let i = 0, placed = 0; i < 150 && placed < 24; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(16, ARENA_RADIUS - 5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const scale = 0.6 + Math.random() * 1.0, radius = 0.6 + scale * 0.9;
    if (canPlace(x, z, radius)) { add('ROCK', x, z, radius, scale, true); placed++; }
  }

  world.obstacles = obstacles;
  world.obstaclesVersion++;
  rebuildColliderGrid();
  generateCrates();
}

// ------------------------------------------------------------------- crates --
function crateSpot(out: Vector3): boolean {
  for (let t = 0; t < 40; t++) {
    const a = Math.random() * Math.PI * 2, d = rand(SPAWN_SAFE_RADIUS + 5, ARENA_RADIUS - 8);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const edge = islandRadius(Math.atan2(z, x));
    if (d > edge - 5) continue;
    if (Math.hypot(x - TOWN_CENTER.x, z - TOWN_CENTER.z) < 14) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) continue;
    let blocked = false;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.6) { blocked = true; break; }
    if (blocked) continue;
    for (const c of world.crates) if (c.active && Math.hypot(x - c.pos.x, z - c.pos.z) < 5) { blocked = true; break; }
    if (blocked) continue;
    out.set(x, 0, z);
    return true;
  }
  return false;
}

const CRATE_HP: Record<Crate['kind'], number> = { CRATE: 30, BARREL: 20, CHEST: 120 };

function generateCrates(): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  const normal = 18 + Math.floor(Math.random() * 7); // 18..24
  const kinds: Crate['kind'][] = [];
  for (let i = 0; i < normal; i++) kinds.push(Math.random() < 0.55 ? 'CRATE' : 'BARREL');
  kinds.push('CHEST', 'CHEST');

  const tmp = new Vector3();
  let slot = 0;
  for (const kind of kinds) {
    if (slot >= MAX_CRATES) break;
    if (!crateSpot(tmp)) continue;
    const c = world.crates[slot++];
    c.kind = kind;
    c.pos.copy(tmp);
    c.maxHp = c.hp = CRATE_HP[kind];
    c.rot = Math.random() * Math.PI * 2;
    c.active = true;
  }
}

export { CRATE_HP };
