// ============================================================================
// Crystal cave (the village "CAVE" area) + its entrance outside the east town wall (pure data, no three / no React).
//  * Town side: a rounded bay carved into the forest east of the east ring path (CAVE_BAY, merged into the island edge by
//    engine/mapgen.ts baseRadius), the rocky cave mouth at its back (CAVE_MOUTH, drawn by render/CaveEntrance.tsx) and the
//    interact spot in front of it (CAVE_DOOR).
//  * Inside: an irregular rock chamber centred on the world origin (like the castle hall, the town is not drawn while the
//    hero is inside), the way out at the south end (+z). Drawn by render/CaveInterior.tsx; colliders + harvest nodes are
//    installed by engine/systems/village.ts (switchArea).
// ============================================================================

// ------------------------------------------------------------------ town side ---
/** Cove carved out of the forest edge east of the ring path: the island edge radius bulges by `depth` * sin^2 between the
 *  angles a0..a1 (atan2(z, x) around the town centre), i.e. a rounded bay about x 62..75, z 0..23 (walkable; the forest,
 *  rim rocks and edge bushes follow the new edge automatically). */
export const CAVE_BAY = { a0: -0.06, a1: 0.4, depth: 12.5 };
/** The rock mound with the cave opening at the back of the bay; `rot` turns local +z (the opening) to face west-south-west,
 *  out over the bay and towards the usual camera (south), so the dark arch reads from the default view. */
export const CAVE_MOUTH = { x: 75.4, z: 9.4, rot: -0.97 };
const FX = Math.sin(CAVE_MOUTH.rot), FZ = Math.cos(CAVE_MOUTH.rot);   // the opening's facing (unit xz)
/** Interact spot in front of the opening (E: "Enter Crystal Cave"). */
export const CAVE_DOOR = { x: CAVE_MOUTH.x + FX * 5.6, z: CAVE_MOUTH.z + FZ * 5.6, r: 4.6 };
/** Where the hero stands after leaving the cave (just outside the opening, facing the bay along CAVE_MOUTH.rot). */
export const CAVE_OUT = { x: CAVE_MOUTH.x + FX * 7, z: CAVE_MOUTH.z + FZ * 7 };
/** Kept free of random forest trees / rim rocks / edge bushes (the mound and the opening stay readable). */
export const CAVE_CLEAR = { x: CAVE_MOUTH.x - FX * 0.5, z: CAVE_MOUTH.z - FZ * 0.5, r: 8.5 };
/** Town colliders [x, z, r] of the entrance props (jamb rocks, foot boulders, lantern posts, crate, ore pile), from the
 *  mound's local layout in render/CaveEntrance.tsx (local +z = the opening's facing). */
export const CAVE_MOUTH_COLLIDERS: [number, number, number][] = ([
  [-3.9, -0.4, 2.0], [3.9, -0.5, 2.0], [-5.2, 2.6, 1.0], [5.4, 2.4, 0.9], [-2.75, 2.1, 0.3], [2.75, 2.1, 0.3], [-3.7, 3.0, 0.7], [4.0, 3.2, 0.7],
] as [number, number, number][]).map(([lx, lz, r]) => [CAVE_MOUTH.x + lx * FZ + lz * FX, CAVE_MOUTH.z - lx * FX + lz * FZ, r]);
export const inCaveClear = (x: number, z: number, m = 0): boolean => (x - CAVE_CLEAR.x) ** 2 + (z - CAVE_CLEAR.z) ** 2 < (CAVE_CLEAR.r + m) ** 2;

// --------------------------------------------------------------------- inside ---
/** Chamber size: an oval (half widths rx / rz) with a lumpy outline; walls are `h` tall at the back, low at the front. */
export const CAVE = { rx: 15, rz: 19.5, h: 7 };
/** Polar outline of the chamber (a = atan2(z, x)): the floor ends / the rock wall starts at this radius. */
export function caveRadius(a: number): number {
  const c = Math.cos(a), s = Math.sin(a);
  const e = 1 / Math.sqrt((c / CAVE.rx) ** 2 + (s / CAVE.rz) ** 2);
  return e * (1 + 0.07 * Math.sin(3 * a + 0.7) + 0.05 * Math.sin(7 * a + 2.1) + 0.035 * Math.sin(11 * a + 0.3));
}
const SOUTH_R = caveRadius(Math.PI / 2);
/** The way out (south end, +z): the exit pill spot, and where the hero appears when walking in. */
export const CAVE_EXIT = { x: 0, z: SOUTH_R - 1.4, r: 4.2 };
export const CAVE_SPAWN = { x: 0, z: SOUTH_R - 4.2 };

export type CaveNodeKind = 'CRYSTAL' | 'ORE' | 'GOLD_VEIN';
/** Harvest nodes inside (more than outside): hold E, regrow 24 h after the last one is harvested (own save key). */
export const CAVE_NODES: { kind: CaveNodeKind; x: number; z: number }[] = [
  { kind: 'ORE', x: -9.5, z: 8.5 }, { kind: 'CRYSTAL', x: -11, z: -2.5 }, { kind: 'ORE', x: -6.5, z: -12 },
  { kind: 'CRYSTAL', x: 1.5, z: -15.5 }, { kind: 'GOLD_VEIN', x: 8.5, z: -10 }, { kind: 'CRYSTAL', x: 11, z: -1 },
  { kind: 'ORE', x: 10, z: 8.5 }, { kind: 'GOLD_VEIN', x: -2.5, z: -5.5 },
];
/** Stalagmites [x, z, scale] (solid). */
export const STALAGMITES: [number, number, number][] = [
  [4.2, 0.5, 1.3], [5.6, -1.2, 0.9], [3.4, 2.1, 0.8], [-12.4, 5.2, 1.1], [12.6, 3.8, 1.0], [-5, -15.8, 1.2], [6.2, -15.2, 1.0],
  [-11.4, -6.8, 1.1], [12.4, -6.2, 0.9], [-7.5, 2.5, 0.7], [7.8, 13.4, 0.9], [-8.2, 13.6, 1.0],
];
/** Glowing crystal clusters [x, z, scale, colour 0 cyan / 1 violet] (decoration along the walls; solid). */
export const CAVE_CRYSTALS: [number, number, number, 0 | 1][] = [
  [-13, 1.5, 1.2, 0], [13.2, -3.5, 1.1, 1], [-4.5, -17.4, 1.3, 1], [8.6, -14.4, 1.0, 0], [-9.6, -10.4, 1.0, 1], [11.2, 10.6, 0.9, 0], [4.8, -0.9, 0.7, 0],
];
/** Glowing mushroom patches [x, z, scale] (walk-through). */
export const MUSHROOMS: [number, number, number][] = [
  [-10.6, 11, 1], [10.8, 12.4, 0.9], [-12.6, -5.8, 1], [10.2, -7.4, 0.8], [-1.5, -17.2, 1], [-6.8, 4.4, 0.7], [6.6, 5.6, 0.8], [2.6, -9.2, 0.7],
];
/** The mine cart beside the rails near the exit [x, z, rot]. */
export const MINE_CART = { x: 3.2, z: SOUTH_R - 6.5, rot: 0.25 };
/** Real point lights (max 3): [x, y, z, colour, intensity, distance]. */
export const CAVE_LIGHTS: [number, number, number, string, number, number][] = [
  [-6, 3.4, -5, '#6fdcff', 55, 24], [7, 3.4, -6, '#b88aff', 48, 22], [0, 3.6, SOUTH_R - 5, '#ffb878', 50, 22],
];

/** Collision circles [x, z, r]: rock wall ring, stalagmites, crystal clusters, the mine cart. */
export const CAVE_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const N = 110;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, r = caveRadius(a) + 0.9;
    c.push([Math.cos(a) * r, Math.sin(a) * r, 1.2]);
  }
  for (const [x, z, s] of STALAGMITES) c.push([x, z, 0.55 * s + 0.15]);
  for (const [x, z, s] of CAVE_CRYSTALS) c.push([x, z, 0.75 * s]);
  c.push([MINE_CART.x, MINE_CART.z, 1.1]);
  return c;
})();
