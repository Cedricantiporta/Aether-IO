// ============================================================================
// Lakeside beach outside the WEST town wall (pure data, no three / no React). Read by:
//  * engine/townData.ts ISLAND_BOXES   -> the walkable beach box (only the southern half of the west shore)
//  * engine/mapgen.ts                  -> deck rectangles walkable over the water (onDeck / clampToDeck)
//  * engine/systems/village.ts         -> colliders, "Fish" interaction spots
//  * engine/systems/fishing.ts         -> fishing spots + cast direction
//  * render/terrainFn.ts / Terrain.tsx -> sand tint + the shifted lake shore line
//  * render/Beach.tsx                  -> drawing (boardwalk, pier, palms, props, fish stall)
// Reached from the meadow south of the gate: walk west past the south-west corner tower (the wall can't be crossed).
// The north end of the beach is closed by a rocky headland (colliders), so only the southern half of the shore is open.
// ============================================================================

/** Beach extent: sand between the wall (x = -45) and the water line `shoreX`, from the headland (z0) to the forest (z1). */
export const BEACH = { shoreX: -65, z0: 6, z1: 58, wallX: -45, wallZ: 38, wallHalf: 1.3 };
/** Walkable island box for the beach (must contain the origin, see townData ISLAND_BOXES / mapgen boxExit). Its north side
 *  (z = -2) is never reached: the headland rocks at z ~ 5 block the way. */
export const BEACH_BOX: [number, number, number, number] = [-68.5, -2, 0, 58];

/** Boardwalk (on the sand, visual only): from the entrance by the corner tower west, then north along the beach. */
export const BOARDWALK = { z: 47, xE: -46.5, x: -58.5, zN: 12, w: 2.4 };
/** The pier: a plank walkway west into the lake from the boardwalk + a wide T-head at its end. Deck top y = DOCK.y. */
export const DOCK = { z: 30, x0: -57.3, x1: -80, hw: 1.3, head: { x0: -94, x1: -80, z0: 22, z1: 36 }, y: 0.12 };   // (owner: a bigger head)
/** The Coral Isles ship, moored along the south side of the pier head (visual; the water around it is not walkable). */
export const SHIP = { x: -91, z: 15.2, len: 26, beam: 7 };
/** Walkable deck rectangles [x0, z0, x1, z1] (a hero-radius inside the planks): walkable over water. */
export const DECK_RECTS: [number, number, number, number][] = [
  [DOCK.x1 - 0.6, DOCK.z - DOCK.hw + 0.3, DOCK.x0 + 0.3, DOCK.z + DOCK.hw - 0.3],
  [DOCK.head.x0 + 0.5, DOCK.head.z0 + 0.5, DOCK.head.x1, DOCK.head.z1 - 0.5],
];

/** Fishing spots: where the hero stands (x, z), the cast direction (dx, dz, unit) and how far out the bobber lands.
 *  luck: rarity bonus (the pier reaches deeper water). */
export interface FishSpot { x: number; z: number; dx: number; dz: number; dist: number; luck: number; label: string }
export const FISH_SPOTS: FishSpot[] = [
  { x: -92.6, z: 31, dx: -1, dz: 0, dist: 7.5, luck: 1.25, label: 'Pier end' },
  { x: -63.6, z: 16, dx: -0.995, dz: -0.1, dist: 6.5, luck: 1, label: 'Shoreline' },
  { x: -63.8, z: 41.5, dx: -0.995, dz: 0.1, dist: 6.5, luck: 1, label: 'Shoreline' },
];
/** Radius around a fishing spot where the "Fish" pill shows. */
export const FISH_SPOT_R = 3.2;

/** Fishmonger's stall (the shop itself is constants SHOP_POSITIONS 'FISH'): on the beach, facing the boardwalk / water. */
export const FISH_STALL = { x: -52.5, z: 24, rot: -Math.PI / 2 };   // mid-beach, well clear of the corner tower (never seen / reached through the wall)

/** Rocky headland closing the north end of the beach (rock centres x, z, radius). */
export const HEADLAND: [number, number, number][] = (() => {
  const r: [number, number, number][] = [];
  for (let i = 0; i < 15; i++) { const x = -46.6 - i * 1.65; r.push([x, 4.6 + Math.sin(i * 1.7) * 0.6, 1.75 + (i % 3) * 0.25]); }
  return r;
})();

/** The lake's wavy southern shore (townData.lakeSouth = lakeSouthZ(x, LAKE.z1); here to avoid an import cycle). */
export const lakeSouthZ = (x: number, z1: number): number => z1 + Math.sin(x * 0.13 + 0.8) * 4.2 + Math.sin(x * 0.31 + 2.1) * 2 + Math.sin(x * 0.77) * 0.8;
const LAKE_Z1 = 85, SHORE_Z = (x: number): number => lakeSouthZ(x, LAKE_Z1) - 3;   // the visible water line (~3 short of the bed ramp end)
/** (owner) rocks along the lake's south shore by the mainland beach / Endless Tower: x, z, radius (some half in the water). */
export const SOUTH_ROCKS: [number, number, number][] = (() => {
  const r: [number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const x = -54 - i * 4.3 - Math.sin(i * 2.3) * 1.2, w = Math.sin(i * 1.7) * 1.4;
    r.push([x, SHORE_Z(x) + w, 0.8 + ((i * 7) % 5) * 0.22]);
    if (i % 3 === 1) r.push([x + 1.4, SHORE_Z(x + 1.4) + w + 1.2, 0.5]);
  }
  return r;
})();
/** Palms / shore trees behind the south shore (x, z, scale, lean). */
const SOUTH_PALMS: [number, number, number, number][] = [-57, -66, -79, -88, -97].map((x, i) => [x, SHORE_Z(x) + 5 + (i % 2) * 2.2, 1 + (i % 3) * 0.08, 0.6 + i * 1.1]);

// ---- props (drawn by render/Beach.tsx; colliders below) ----
export const PALMS: [number, number, number, number][] = [   // x, z, scale, lean yaw
  [-49.5, 10.5, 1.0, 0.6], [-60.5, 11, 1.15, 2.4], [-48.6, 18.5, 0.95, 0.2], [-63.2, 22.5, 1.1, 1.7], [-62.4, 37, 1.05, 1.4],
  [-49.6, 56.5, 1.1, -0.6], [-57.5, 59, 1.0, 2.9], [-63.5, 57, 1.15, 1.9],
  // the mainland beach (south of the river mouth)
  [-46.2, 80.5, 1.05, 2.2], [-44.6, 87.5, 1.15, 1.6], [-47.5, 93.5, 1.0, 2.7],
  ...SOUTH_PALMS,
];
export const CAMPFIRE = { x: -53.5, z: 54 };
export const UMBRELLA = { x: -54, z: 17 };
export const ROWBOAT = { x: -62.2, z: 50, rot: 0.5 };      // beached on the sand, bow toward the water
export const DRIFTWOOD: [number, number, number][] = [[-63.4, 34.2, 0.3], [-61, 25.5, 1.2], [-62.8, 45.2, -0.4], [-53, 29.6, 0.9], [-48.6, 84.2, 0.5], [-46.8, 91.2, -0.7]];
export const CRATES: [number, number, number][] = [[-56.4, 26.8, 0.2], [-55.5, 27.9, -0.3], [-56.2, 27.6, 0.5]];   // 3rd is stacked on the first
export const BARRELS: [number, number][] = [[-56.4, 33.5], [-55.6, 34.4]];
export const NET_RACK = { x: -49.2, z: 31, rot: Math.PI / 2 };   // fishing nets drying on a rack along the wall
export const ENTRY_SIGN = { x: -46, z: 44.4 };   // signpost at the boardwalk entrance, just south of the corner tower

/** Movement colliders [x, z, r] (registered by village.placeVillageNodes after the island is generated). */
export const BEACH_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HEADLAND) c.push(h);
  for (const [x, z, r] of SOUTH_ROCKS) c.push([x, z, r * 0.9]);
  for (const p of PALMS) c.push([p[0], p[1], 0.6]);
  c.push([CAMPFIRE.x, CAMPFIRE.z, 1.0], [UMBRELLA.x, UMBRELLA.z, 0.35]);
  for (const o of [-1.1, 0, 1.1]) c.push([ROWBOAT.x + Math.sin(ROWBOAT.rot) * o, ROWBOAT.z + Math.cos(ROWBOAT.rot) * o, 0.8]);
  for (const [x, z] of [[CRATES[0][0], CRATES[0][1]], [CRATES[1][0], CRATES[1][1]]]) c.push([x, z, 0.6]);
  for (const [x, z] of BARRELS) c.push([x, z, 0.5]);
  for (const [x, z] of DRIFTWOOD) c.push([x, z, 0.45]);
  for (const o of [-1.4, 1.4]) c.push([NET_RACK.x, NET_RACK.z + o, 0.4]);
  c.push([ENTRY_SIGN.x, ENTRY_SIGN.z, 0.3]);
  // pier: lantern posts + a bench at the T-head (deck edges are handled by mapgen.clampToDeck)
  c.push([DOCK.head.x0 + 0.5, DOCK.head.z0 + 0.5, 0.3], [DOCK.head.x0 + 0.5, DOCK.head.z1 - 0.5, 0.3]);
  return c;
})();

/** Wavy offset of the beach water line (owner: rounded, irregular shore instead of a straight edge). */
export const beachWobble = (z: number): number => Math.sin(z * 0.19 + 0.7) * 2.4 + Math.sin(z * 0.47 + 2.1) * 1.1 + Math.sin(z * 1.13 + 0.3) * 0.6;

/** (owner) the mainland beach south of the river mouth, styled like the lakeside beach: sand from the water line to
 *  innerX, a little west-pushed wavy shore (SHORE_PUSH) over z0..z1. */
export const MAIN_BEACH = { z0: 78, z1: 97, innerX: -41.5, push: 3.2 };
/** How far the mainland beach's water line is pushed west at z (owner: irregular, not a straight edge). */
export const mainShoreOff = (z: number): number => MAIN_BEACH.push + Math.sin(z * 0.23 + 0.4) * 2.6 + Math.sin(z * 0.61 + 2) * 1.3 + Math.sin(z * 1.37) * 0.55;
/** 0..1 blend of the mainland beach band at z (soft ends). */
export const mainBeachK = (z: number): number => Math.min(1, Math.max(0, (z - MAIN_BEACH.z0 + 4) / 5)) * Math.min(1, Math.max(0, (MAIN_BEACH.z1 + 3 - z) / 5));

/** 0..1 sand coverage at (x, z) (render tint; soft edges, fades into the meadow by the corner tower). */
export function beachSandK(x: number, z: number): number {
  if (x < -36 && z > MAIN_BEACH.z0 - 6 && z < MAIN_BEACH.z1 + 6) {   // the mainland beach
    const zs = MAIN_BEACH.z1 + 3 + Math.sin(x * 0.21 + 1.1) * 3 + Math.sin(x * 0.53) * 1.4;   // (wavy south edge of the sand, not a straight line)
    const k = Math.min(1, Math.max(0, (z - MAIN_BEACH.z0 + 4) / 5)) * Math.min(1, Math.max(0, (zs - z) / 5)), edge = MAIN_BEACH.innerX + Math.sin(z * 0.37 + 1.3) * 1.4 + Math.sin(z * 0.9) * 0.5;
    return k * Math.min(1, Math.max(0, (edge - x) / 3));
  }
  if (x > -38 || z < BEACH.z0 - 9 || z > BEACH.z1 + 8) return 0;
  // rounded ends: the sand's north / south limits bulge with x (no square corners)
  const bx = Math.max(0, -40 - x), bulge = Math.sin(bx * 0.22) * 2.5;
  const sz = Math.min(1, Math.max(0, (z - (BEACH.z0 - 6) - bulge) / 6)) * Math.min(1, Math.max(0, (BEACH.z1 + 6 - z - bulge) / 8));
  // west of the wall: all sand; south of the corner tower it fades toward the meadow (x -44 .. -40)
  const edgeX = z > 40 ? -40 - (z - 40) * 0.1 : -44.5;
  const sx = Math.min(1, Math.max(0, (edgeX - x) / 4));
  return sz * sx;
}

/** True when (x, z) is OUTSIDE the town wall on the beach / meadow side (west of the west wall's outer face, or south of
 *  the south wall). Beach interactions (the Fishmonger, fishing spots) only count from here, so nothing on the beach can
 *  be reached through the wall from inside the town. (BEACH.wallX / wallZ = townData WALL.x0 / z1; no import: cycle.) */
export function beachSide(x: number, z: number): boolean {
  return x < BEACH.wallX - BEACH.wallHalf - 0.1 || z > BEACH.wallZ + BEACH.wallHalf + 0.1;
}

/** True when (x, z) lies on a pier deck rectangle (grown by `pad`). */
export function onDeckRect(x: number, z: number, pad = 0): number {
  for (let i = 0; i < DECK_RECTS.length; i++) {
    const r = DECK_RECTS[i];
    if (x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad) return i;
  }
  return -1;
}
