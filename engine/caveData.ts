// ============================================================================
// Crystal cave (the village "CAVE" area) + its entrance outside the east town wall (pure data, no three / no React).
//  * Town side: a rounded bay carved into the forest east of the east ring path (CAVE_BAY, merged into the island edge by
//    engine/mapgen.ts baseRadius), the rocky cave mouth at its back (CAVE_MOUTH, drawn by render/CaveEntrance.tsx) and the
//    interact spot in front of it (CAVE_DOOR).
//  * Inside: an irregular rock chamber centred on the world origin (like the castle hall, the town is not drawn while the
//    hero is inside), the way out at the south end (+z). Drawn by render/CaveInterior.tsx; colliders + harvest nodes are
//    installed by engine/systems/village.ts (switchArea).
// ============================================================================

import { caveGoldPrice } from '../constants';

// ------------------------------------------------------------------ town side ---
/** Cove carved out of the forest edge east of the ring path: the island edge radius bulges by `depth` * sin^2 between the
 *  angles a0..a1 (atan2(z, x) around the town centre), i.e. a wide rounded bay about x 56..74, z -2..30 that holds the
 *  mining camp (walkable; the forest, rim rocks and edge bushes follow the new edge automatically). */
export const CAVE_BAY = { a0: -0.15, a1: 0.5, depth: 12 };
/** The mine entrance = nature_kit_v1 'mine_entrance' (a rocky mound with a timber-framed arch and a short rail track, 7.3 x 8 m) at the
 *  back of the bay; its front faces south like every building, toward the camera and the camp yard. */
export const CAVE_MOUTH = { x: 72.4, z: 4.8, rot: 0 };
const FX = Math.sin(CAVE_MOUTH.rot), FZ = Math.cos(CAVE_MOUTH.rot);   // the opening's facing (unit xz)
/** Interact spot in front of the opening (E: "Enter Crystal Cave"). */
export const CAVE_DOOR = { x: CAVE_MOUTH.x + FX * 7.2, z: CAVE_MOUTH.z + FZ * 7.2, r: 3.8 };
/** Where the hero stands after leaving the cave (just outside the opening, facing the bay along CAVE_MOUTH.rot). */
export const CAVE_OUT = { x: CAVE_MOUTH.x + FX * 8.4, z: CAVE_MOUTH.z + FZ * 8.4 };
/** Kept free of random forest trees / rim rocks / edge bushes (the mound and the opening stay readable). */
export const CAVE_CLEAR = { x: CAVE_MOUTH.x + FX * 1.5, z: CAVE_MOUTH.z + FZ * 1.5, r: 9.5 };
/** Town colliders [x, z, r] of the entrance: the mound's footprint (x -3.7..3.7, z -2.6..3.4 of the kit piece; the rail track in front of the arch stays walkable). */
export const CAVE_MOUTH_COLLIDERS: [number, number, number][] = ((): [number, number, number][] => {
  const c: [number, number, number][] = [];
  for (const z of [-1.7, 0.4, 2.3]) for (let x = -2.9; x <= 2.91; x += 1.45) c.push([CAVE_MOUTH.x + x, CAVE_MOUTH.z + z, 1.15]);
  c.push([CAVE_MOUTH.x - 0.4, CAVE_MOUTH.z - 3.4, 2.2]);   // (the back of the mound)
  return c;
})();
export const inCaveClear = (x: number, z: number, m = 0): boolean => (x - CAVE_CLEAR.x) ** 2 + (z - CAVE_CLEAR.z) ** 2 < (CAVE_CLEAR.r + m) ** 2;

// ------------------------------------------------------------- mining camp ---
/** The mining camp in the bay in front of the mine mouth (drawn by render/CaveEntrance.tsx; the Mining Supplies stall is
 *  the shop constants SHOP_POSITIONS 'MINE'). World coordinates; the dirt paths are townData ROADS (the coop path from the
 *  farm arrives from the south at (60, 33), the narrow back trail from the north at (50.6, -8)), the camp's harvest nodes
 *  are townData VILLAGE_NODES. Everything here keeps the crossing in front of the mouth (~63, 14) clear. */
export const MINE_CAMP = {
  /** centre + radii of the trodden yard (no bushes / flowers on it, see render/terrainFn inForecourtUse) */
  yard: { x: 64.5, z: 15, rx: 10, rz: 10 },
  /** rail tracks [x1, z1, x2, z2] (sleepers + two rails; walk-over decoration): one short siding by the second tent (the mine's own track is part of the kit piece) */
  rails: [[70.2, 21.8, 66.2, 25.6]] as [number, number, number, number][],
  /** mine carts on the rails: x, z, yaw (bed along local z), load 0 ore / 1 crystals / 2 empty */
  carts: [{ x: 68.4, z: 23.5, rot: -0.81, load: 1 }] as { x: number; z: number; rot: number; load: 0 | 1 | 2 }[],
  /** ore heaps x, z, size */
  ore: [[66.2, 12.6, 1.2], [58.6, 17.4, 1.0]] as [number, number, number][],
  /** crate stacks / barrels x, z, yaw */
  crates: [[56.6, 8.8, 0.3], [72.6, 18.2, -0.5]] as [number, number, number][],
  barrels: [[67.2, 2.4], [68.0, 3.3], [73.4, 22.0]] as [number, number][],
  /** nature_kit_v1 'mining_camp_tent' (open triangle faces +z): the foreman's tent beside the stall, a second one by the siding */
  tents: [{ x: 57.4, z: 12.2 }, { x: 72.2, z: 26.4 }] as { x: number; z: number }[],
  /** tool rack with pickaxes and shovels (along the wall side, tools facing local +z) */
  rack: { x: 56.2, z: 22.4, rot: Math.PI / 2 },
  /** lantern posts (glow only) */
  lanterns: [[60.6, 17.2], [67.6, 18.6], [56.6, 30.2], [66.4, 6.6], [75.6, 9.4]] as [number, number][],
  /** signpost where the coop path enters the camp (nature_kit_v1 'signpost') */
  sign: { x: 56.4, z: 33.4 },
};
/** Town colliders of the camp props [x, z, r] (registered by village.placeVillageNodes). */
export const CAMP_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [], m = MINE_CAMP;
  for (const k of m.carts) for (const o of [-0.55, 0.55]) c.push([k.x + Math.sin(k.rot) * o, k.z + Math.cos(k.rot) * o, 0.8]);
  for (const [x1, z1, x2, z2] of m.rails) c.push([x2 + (x2 - x1) * 0.04, z2 + (z2 - z1) * 0.04, 0.45]);   // end buffers
  for (const [x, z, s] of m.ore) c.push([x, z, 1.1 * s]);
  for (const [x, z] of m.crates) c.push([x, z, 0.9]);
  for (const [x, z] of m.barrels) c.push([x, z, 0.55]);
  for (const t of m.tents) for (let ox = -1.7; ox <= 1.71; ox += 1.7) for (const oz of [-1.2, 1.0]) c.push([t.x + 0.07 + ox, t.z + oz, 1.1]);   // (tent footprint 5.8 x 5.3)
  { const { x, z, rot } = m.rack, cr = Math.cos(rot), sr = Math.sin(rot); for (const o of [-0.8, 0.8]) c.push([x + cr * o, z - sr * o, 0.5]); }
  for (const [x, z] of m.lanterns) c.push([x, z, 0.3]);
  c.push([m.sign.x, m.sign.z, 0.3]);
  return c;
})();
export const inCampYard = (x: number, z: number, m = 0): boolean => ((x - MINE_CAMP.yard.x) / (MINE_CAMP.yard.rx + m)) ** 2 + ((z - MINE_CAMP.yard.z) / (MINE_CAMP.yard.rz + m)) ** 2 < 1;

// --------------------------------------------------------------------- inside ---
// The cave has FLOORS. Floor 1 is the hand-made chamber below (exit to the town at the south end, the miner Grit and his
// lantern bench by the entrance, the stairs down at the north end). Deeper floors are seeded variations (`caveLayout(n)`):
// same kind of lumpy oval, the stairs you arrived by at the south end (they take you straight back up to Floor 1), the
// stairs down at the north end, 2-5 veins, crystals tinted by depth. Every layout is centred on the world origin.

export type CaveNodeKind = 'CRYSTAL' | 'ORE' | 'GOLD_VEIN';
export interface CaveNode { kind: CaveNodeKind; x: number; z: number }
export interface CaveLayout {
  floor: number;
  /** oval half widths + outline wobble phases (see `radius`) */
  rx: number; rz: number; ph: [number, number, number];
  /** polar outline (a = atan2(z, x)): the floor ends / the rock wall starts at this radius */
  radius: (a: number) => number;
  /** floor 1: the way out to the town; deeper: the stairs you came down by (they lead back to Floor 1) */
  exit: { x: number; z: number; r: number };
  /** where the hero appears when arriving from above */
  spawn: { x: number; z: number };
  /** the stairs down (locked until every vein of the floor is harvested) */
  down: { x: number; z: number; r: number };
  nodes: CaveNode[];
  stalagmites: [number, number, number][];
  /** glowing crystal clusters [x, z, scale, colour index 0 / 1 of `tint`] */
  crystals: [number, number, number, 0 | 1][];
  mushrooms: [number, number, number][];
  cart: { x: number; z: number; rot: number } | null;
  /** floor 1 only: Grit's lantern bench (E: his lantern panel: refill / upgrade) */
  bench: { x: number; z: number; r: number } | null;
  /** crystal / light colours by depth: cyan -> violet -> magenta -> gold -> crimson */
  tint: [string, string];
  /** hazard theme (seeded, floors 4+): LAVA pools burn, POISON puddles poison while you stand in them */
  hazard: 'NONE' | 'LAVA' | 'POISON';
  /** hazard pools [x, z, r] (walk-through; never on the stairs path, the veins or the spawn) */
  pools: [number, number, number][];
  /** twin-chamber floor (an hourglass outline: two chambers joined by a narrow waist) */
  twin: boolean;
  /** max 3 real point lights [x, y, z, colour, intensity, distance] */
  lights: [number, number, number, string, number, number][];
  colliders: [number, number, number][];
}

/** Floor-1 chamber size (deeper floors vary around it). */
export const CAVE = { rx: 15, rz: 19.5, h: 7 };
const ovalR = (rx: number, rz: number, ph: [number, number, number], waist = 0) => (a: number): number => {
  const c = Math.cos(a), s = Math.sin(a);
  const e = 1 / Math.sqrt((c / rx) ** 2 + (s / rz) ** 2);
  // waist > 0 pinches the east / west sides: an hourglass of two chambers (still star-shaped around the origin)
  return e * (1 - waist * c * c * c * c) * (1 + 0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(7 * a + ph[1]) + 0.035 * Math.sin(11 * a + ph[2]));
};
/** Floor-1 outline (kept for callers that only know the first floor). */
export const caveRadius = ovalR(CAVE.rx, CAVE.rz, [0.7, 2.1, 0.3]);

/** Crystal tints by depth tier (floor 1, 2-3, 4-6, 7-9, 10+). */
export const CAVE_TINTS: [string, string][] = [['#5fe0ff', '#b98aff'], ['#9a7aff', '#d78aff'], ['#c070ff', '#ff6ad0'], ['#ffd25a', '#ffaa3a'], ['#ff4a5a', '#ff8a3a']];
export const tintTier = (floor: number): number => (floor <= 1 ? 0 : floor <= 3 ? 1 : floor <= 6 ? 2 : floor <= 9 ? 3 : 4);

function colliders(L: Omit<CaveLayout, 'colliders'>): [number, number, number][] {
  const c: [number, number, number][] = [];
  const N = 110;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = L.radius(a) + 0.9; c.push([Math.cos(a) * r, Math.sin(a) * r, 1.2]); }
  for (const [x, z, s] of L.stalagmites) c.push([x, z, 0.55 * s + 0.15]);
  for (const [x, z, s] of L.crystals) c.push([x, z, 0.75 * s]);
  if (L.cart) c.push([L.cart.x, L.cart.z, 1.1]);
  if (L.bench) c.push([L.bench.x, L.bench.z, 0.85]);
  c.push([L.down.x, L.down.z - 0.4, 1.3]);   // the stairwell (you stand at its lip)
  return c;
}

/** Harvestable nodes per floor: 2..5, weighted 2: 35%, 3: 35%, 4: 20%, 5: 10% (`u` = uniform [0, 1)). */
export function rollVeinCount(u: number): number { return u < 0.35 ? 2 : u < 0.7 ? 3 : u < 0.9 ? 4 : 5; }
/** Order in which Floor 1's 8 hand-placed vein slots are used (first n of them; a mix of gold / ore / crystal, well spaced). */
const F1_SLOT_ORDER = [4, 0, 5, 2, 1];

function floorOne(count = 3): CaveLayout {
  const radius = caveRadius, S = radius(Math.PI / 2), N = radius(-Math.PI / 2);
  const tint = CAVE_TINTS[0];
  const L: Omit<CaveLayout, 'colliders'> = {
    floor: 1, rx: CAVE.rx, rz: CAVE.rz, ph: [0.7, 2.1, 0.3], radius, hazard: 'NONE', pools: [], twin: false,
    exit: { x: 0, z: S - 1.4, r: 4.2 }, spawn: { x: 0, z: S - 4.2 }, down: { x: 0, z: -N + 3.4, r: 4.2 },
    nodes: ([
      // pulled in toward the middle (spaced ~4-6 apart) so none hide against the cave walls
      { kind: 'ORE', x: -8, z: 1 }, { kind: 'CRYSTAL', x: -6.5, z: -6.5 }, { kind: 'ORE', x: -2, z: -10 },
      { kind: 'CRYSTAL', x: 3.5, z: -9.5 }, { kind: 'GOLD_VEIN', x: 7.5, z: -5.5 }, { kind: 'CRYSTAL', x: 8.5, z: 1.5 },
      { kind: 'ORE', x: 7, z: 7 }, { kind: 'GOLD_VEIN', x: -1, z: -3 },
    ] as CaveNode[]).filter((_, i) => F1_SLOT_ORDER.slice(0, count).includes(i)),
    stalagmites: [
      [4.2, 0.5, 1.3], [5.6, -1.2, 0.9], [3.4, 2.1, 0.8], [-12.4, 5.2, 1.1], [12.6, 3.8, 1.0], [-5.6, -16, 1.2], [6.4, -15.6, 1.0],
      [-11.4, -6.8, 1.1], [12.4, -6.2, 0.9], [-12, 8, 0.7], [7.8, 13.4, 0.9], [-8.2, 13.6, 1.0],
    ],
    crystals: [[-13, 1.5, 1.2, 0], [13.2, -3.5, 1.1, 1], [-5.2, -17.6, 1.2, 1], [8.6, -14.4, 1.0, 0], [-9.6, -10.4, 1.0, 1], [11.2, 10.6, 0.9, 0], [4.8, -0.9, 0.7, 0]],
    mushrooms: [[-10.6, 11, 1], [10.8, 12.4, 0.9], [-12.6, -5.8, 1], [10.2, -7.4, 0.8], [-3.6, -14.2, 1], [-6.8, 4.4, 0.7], [11, 5, 0.8], [0.5, -14, 0.7]],
    cart: { x: 3.2, z: S - 6.5, rot: 0.25 },
    bench: { x: -5.4, z: 7.2, r: 2.8 },
    tint,
    lights: [[-6, 3.4, -5, '#6fdcff', 55, 24], [7, 3.4, -6, '#b88aff', 48, 22], [0, 3.6, S - 5, '#ffb878', 50, 22]],
  };
  return { ...L, colliders: colliders(L) };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A deeper floor: a seeded variation of the chamber (new every trip: `seed` is the trip's seed). */
function floorDeep(floor: number, seed: number): CaveLayout {
  const r = rng(7919 * floor + 1013 + Math.imul(seed | 0, 2654435761));
  // chambers grow with depth (x1.6 at floor 11+); from floor 6 about a third are twin chambers joined by a narrow waist
  const size = 1 + 0.06 * Math.min(10, floor - 1), twin = floor >= 6 && r() < 0.35;
  const rx = (13 + r() * 4) * size * (twin ? 1.15 : 1), rz = (17 + r() * 4) * size * (twin ? 1.3 : 1), ph: [number, number, number] = [r() * 6.28, r() * 6.28, r() * 6.28];
  const radius = ovalR(rx, rz, ph, twin ? 0.55 : 0), S = radius(Math.PI / 2), N = radius(-Math.PI / 2);
  const hz = r(), hazard: CaveLayout['hazard'] = floor < 4 ? 'NONE' : hz < 0.35 ? 'LAVA' : hz < 0.65 ? 'POISON' : 'NONE';
  const exit = { x: 0, z: S - 1.4, r: 4.2 }, spawn = { x: 0, z: S - 4.2 }, down = { x: (r() - 0.5) * 6, z: -N + 3.4, r: 4.2 };
  const keep: [number, number, number][] = [[exit.x, exit.z, 3.5], [spawn.x, spawn.z, 4], [down.x, down.z, 4.5]];
  const free = (x: number, z: number, m: number) => keep.every(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 > (kr + m) ** 2);
  const at = (f0: number, f1: number): [number, number] => { const a = r() * Math.PI * 2, k = f0 + r() * (f1 - f0), rr = radius(a) * k; return [Math.cos(a) * rr, Math.sin(a) * rr]; };
  const nodes: CaveNode[] = [];
  const nN = rollVeinCount(r());
  const kinds: CaveNodeKind[] = ['ORE', 'CRYSTAL', 'CRYSTAL', 'ORE', 'GOLD_VEIN'];
  for (let g = 0; g < 400 && nodes.length < nN; g++) {
    const [x, z] = at(0.12, 0.6);   // toward the middle (never tucked against the walls), still spaced out
    if (!free(x, z, 2.2) || (twin && Math.abs(z) < 3)) continue;   // (twin floors: no vein in the waist)
    nodes.push({ kind: kinds[Math.floor(r() * kinds.length)], x, z }); keep.push([x, z, 3.4]);
  }
  for (let g = 0; g < 300 && nodes.length < nN; g++) {   // (a small chamber can't fit them all in the middle: fill out a little further)
    const [x, z] = at(0.4, 0.72);
    if (!free(x, z, 1.6) || (twin && Math.abs(z) < 3)) continue;
    nodes.push({ kind: kinds[Math.floor(r() * kinds.length)], x, z }); keep.push([x, z, 2.4]);
  }
  const stalagmites: [number, number, number][] = [];
  for (let g = 0; g < 300 && stalagmites.length < 9 + Math.floor(r() * 4); g++) {
    const [x, z] = at(0.2, 0.86), s = 0.7 + r() * 0.6;
    if (!free(x, z, 1.4)) continue;
    stalagmites.push([x, z, s]); keep.push([x, z, 1.2]);
  }
  const crystals: [number, number, number, 0 | 1][] = [];
  for (let g = 0; g < 300 && crystals.length < 6 + Math.floor(r() * 3); g++) {
    const [x, z] = at(0.8, 0.9), s = 0.8 + r() * 0.5;
    if (!free(x, z, 1.2)) continue;
    crystals.push([x, z, s, r() < 0.5 ? 0 : 1]); keep.push([x, z, 1.2]);
  }
  // hazard pools: off the straight walk from the arrival stairs to the stairs down, the veins and every prop
  const pools: [number, number, number][] = [];
  if (hazard !== 'NONE') {
    const ax = spawn.x, az = spawn.z, bx = down.x, bz = down.z, ll = (bx - ax) ** 2 + (bz - az) ** 2;
    const offPath = (x: number, z: number, m: number) => { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ll)); return (x - ax - t * (bx - ax)) ** 2 + (z - az - t * (bz - az)) ** 2 > m * m; };
    const want = 4 + Math.floor(r() * 3) + Math.round(size * 2) - 2;
    for (let g = 0; g < 400 && pools.length < want; g++) {
      const pr = 1.5 + r() * 1.6, [x, z] = at(0.2, 0.78);
      if (!free(x, z, pr + 0.6) || !offPath(x, z, pr + 2.6) || pools.some(([px, pz, rr]) => (x - px) ** 2 + (z - pz) ** 2 < (pr + rr + 1.2) ** 2)) continue;
      pools.push([x, z, pr]);
    }
  }
  const mushrooms: [number, number, number][] = [];
  for (let g = 0; g < 100 && mushrooms.length < 7; g++) { const [x, z] = at(0.4, 0.88); if (free(x, z, 0.3)) mushrooms.push([x, z, 0.7 + r() * 0.4]); }
  const tint = CAVE_TINTS[tintTier(floor)];
  const hl = hazard === 'LAVA' ? '#ff6a2a' : hazard === 'POISON' ? '#7aff5a' : tint[1];
  const L: Omit<CaveLayout, 'colliders'> = {
    floor, rx, rz, ph, radius, exit, spawn, down, nodes, stalagmites, crystals, mushrooms, cart: null, bench: null, tint, hazard, pools, twin,
    lights: [[-6 * size, 3.6, twin ? -N * 0.5 : -4, tint[0], 55 * size, 24 * size], [6.5 * size, 3.6, twin ? N * 0.1 : -7, hl, 55 * size, 24 * size], [0, 3.6, S - 5, '#ffb878', 40, 20]],
  };
  return { ...L, colliders: colliders(L) };
}

const layouts = new Map<string, CaveLayout>();
let F1_LAYOUT = floorOne();
/** Floor 1 shows `n` (2..5) of its vein slots; the cave save picks n again every regrow. */
export function setFloor1Count(n: number): void { const c = Math.max(2, Math.min(5, n | 0)); if (c !== F1_LAYOUT.nodes.length) F1_LAYOUT = floorOne(c); }
/** The layout of cave floor `floor` (1 = the fixed entrance chamber; deeper floors depend on the trip `seed`), cached. */
export function caveLayout(floor: number, seed = 0): CaveLayout {
  const f = Math.max(1, Math.min(CAVE_MAX_FLOOR, floor | 0));
  if (f === 1) return F1_LAYOUT;
  const k = f + ':' + seed;
  let L = layouts.get(k);
  if (!L) { L = floorDeep(f, seed); layouts.set(k, L); }
  return L;
}
/** Drops the cached deep floors (a new trip has new floors). */
export function forgetCaveLayouts(): void { layouts.clear(); }
/** Deepest floor that exists (deeper stairs stay sealed). */
export const CAVE_MAX_FLOOR = 30;

// -------------------------------------------------------------- depth rules ---
/** Depth rarity table. d = min(floor, DEPTH_CAP) - 1, i.e. floor 1 is the baseline and floor 12+ the cap.
 *  Bonus-drop rarity weights (COMMON / RARE / EPIC / LEGENDARY / MYTHIC):
 *    C = max(4, 62 - 7d)   R = 28 + d   E = 8 + 3d   L = 2 + 1.5d   M = d >= 3 ? 0.4 (d - 2) : 0
 *  floor 1: 62 / 28 / 8 / 2 / 0      floor 4: 41 / 31 / 17 / 6.5 / 0.4      floor 8: 13 / 35 / 29 / 12.5 / 2      floor 12: 4 / 39 / 41 / 18.5 / 3.6
 *  Per vein broken below Floor 1 (on top of the normal harvest drops): CRYSTAL 1 + floor(d / 3) bonus shards, ORE 1 + floor(d / 4)
 *  bonus shards, each of a rolled rarity; CRYSTAL / ORE also a trade good of a rolled rarity with chance min(0.85, 0.25 + 0.06d);
 *  GOLD_VEIN pays x(1 + 0.35d) gold. Rocks get harder: vein HP x(1 + 0.3d). */
export const DEPTH_CAP = 12;
export const depthOf = (floor: number): number => Math.max(0, Math.min(DEPTH_CAP, floor) - 1);
export function depthWeights(floor: number): [number, number, number, number, number] {
  const d = depthOf(floor);
  return [Math.max(4, 62 - 7 * d), 28 + d, 8 + 3 * d, 2 + 1.5 * d, d >= 3 ? 0.4 * (d - 2) : 0];
}
/** Rarity index 0..4 rolled from the depth table (`u` = a uniform random number in [0, 1)). */
export function rollDepthRarity(floor: number, u: number): number {
  const w = depthWeights(floor), total = w[0] + w[1] + w[2] + w[3] + w[4];
  let x = u * total;
  for (let i = 0; i < 5; i++) { x -= w[i]; if (x < 0) return i; }
  return 4;
}
export const veinHardness = (floor: number): number => 1 + 0.3 * depthOf(floor);
export const goldVeinMul = (floor: number): number => 1 + 0.35 * depthOf(floor);
export const bonusShards = (kind: CaveNodeKind, floor: number): number => {
  const d = depthOf(floor); if (d === 0) return 0;
  return kind === 'CRYSTAL' ? 1 + Math.floor(d / 3) : kind === 'ORE' ? 1 + Math.floor(d / 4) : 0;
};
export const tradeGoodChance = (floor: number): number => { const d = depthOf(floor); return d === 0 ? 0 : Math.min(0.85, 0.25 + 0.06 * d); };
/** Trade goods (loot.ts ids) by rolled rarity index, per vein kind. */
export const CAVE_GOODS: Record<CaveNodeKind, string[]> = {
  CRYSTAL: ['ore_nugget', 'echo_crystal', 'deep_geode', 'starfire_crystal', 'abyssal_diamond'],
  ORE: ['ore_nugget', 'raw_gem', 'mithril_ore', 'adamant_ore', 'abyssal_diamond'],
  GOLD_VEIN: ['coin_pouch', 'silver_goblet', 'ancient_relic', 'royal_seal', 'abyssal_diamond'],
};

/** Rare veins: each vein of a freshly grown floor may be a rare one (chance rises with depth). Its tier (1 RARE, 2 EPIC,
 *  3 LEGENDARY, 4 MYTHIC) is rolled from the depth table without COMMON; it is much harder to break and guarantees loot of
 *  at least its tier. Overall MYTHIC chance per vein: 0 on floors 1-3, ~0.5% at floor 7, ~1.2% at floor 12+. */
export const rareVeinChance = (floor: number): number => Math.min(0.34, 0.06 + 0.025 * depthOf(floor));
export function rollRareTier(floor: number, u: number): number {
  const w = depthWeights(floor), total = w[1] + w[2] + w[3] + w[4];
  let x = u * total;
  for (let i = 1; i < 5; i++) { x -= w[i]; if (x < 0) return i; }
  return 4;
}
/** HP multiplier of a rare vein (on top of `veinHardness`). */
export const rareHardness = (tier: number): number => (tier <= 0 ? 1 : 1.5 + 0.9 * tier);
export const RARE_NAME = ['', 'Rare Vein', 'Epic Vein', 'Legendary Vein', 'Mythic Vein'];
export const RARE_COLOR = ['', '#4aa8ff', '#b46aff', '#ffc83a', '#ff3a5a'];

/** Lantern oil: ONE timer for a whole trip below Floor 1 (it does not refill between floors; it starts draining on Floor 2).
 *  Capacity = LANTERN_BASE + LANTERN_STEP x the lantern level. Upgrades (Grit's panel) cost gems OR shards of a rising
 *  rarity; refilling is free once per day, then REFILL_PRICE(level) gold. Oil flasks on deep floors / from cave monsters
 *  add FLASK_OIL seconds (up to the capacity). */
export const LANTERN_BASE = 120, LANTERN_STEP = 30, LANTERN_MAX_LV = 6;
export const LANTERN_COST: { gems: number; shard: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'; shards: number }[] = [
  // (owner: way more expensive - about 6x the gems and 3x the shards)
  { gems: 300, shard: 'COMMON', shards: 90 }, { gems: 600, shard: 'RARE', shards: 60 }, { gems: 1100, shard: 'RARE', shards: 120 },
  { gems: 1800, shard: 'EPIC', shards: 45 }, { gems: 2700, shard: 'EPIC', shards: 90 }, { gems: 4200, shard: 'LEGENDARY', shards: 24 },
];
/** Gold for a refill after the free one: (6,000 + 4,000 x lantern level) at Lv 27, +4% per hero level above 27 (`caveGoldPrice`). */
export const REFILL_PRICE = (lv: number, heroLevel = 27): number => caveGoldPrice(6000 + 4000 * lv, heroLevel);
export const FLASK_OIL = 20;
/** Chance a deep floor hides an oil flask; chance a cave monster drops one. */
export const FLASK_FLOOR_CHANCE = 0.45, FLASK_DROP_CHANCE = 0.12;
/** Chance that a deep floor hides a lucky ladder down under one of its veins (revealed when that vein is harvested). */
export const HIDDEN_LADDER_CHANCE = 0.3;
/** Cave monsters from this floor down (count / strength scale with depth). */
export const MONSTER_FLOOR = 3;
export const caveMonsterCount = (floor: number): number => (floor < MONSTER_FLOOR ? 0 : Math.min(8, floor - 1));

// ------------------------------------------------------- floor-1 shortcuts ---
const F1 = caveLayout(1);
/** The way out of Floor 1 (south end), and where the hero appears when walking in from the town. */
export const CAVE_EXIT = F1.exit;
export const CAVE_SPAWN = F1.spawn;
