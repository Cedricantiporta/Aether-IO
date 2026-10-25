// ============================================================================
// Castle interior (throne hall + two wings): layout + collision circles (pure data, no three / no React).
// The throne hall is centred on the world origin (the town scenery is not drawn while the hero is inside).
// Entrance / exit door at the south end (+z), throne on the raised dais at the north end (-z).
// Two wings open off the throne room (owner 2026-10-25, layout "Castle inside"): WEST = Dining Hall (north) + Kitchen + Library (south),
// EAST = King's Bedroom (north) + Study + Treasury (south). Doorways (4 m wide) in the hall's side walls at z -10 (dining / bedroom) and
// z 11 (library / study); the north room of each wing links to the two south rooms through gaps in a low wall at z 2, and the two south
// rooms link through a gap at z 11 (see WALLS / DOORS below).
// Read by render/CastleInterior.tsx (drawing), engine/systems/village.ts (colliders + pills), engine/townData.ts (NPC homes), the minimap.
// ============================================================================
export const HALL = { hw: 14, hd: 20, h: 9 };
/** Raised platform at the north end (x +-6, z -20..-13). The King stands on it, the throne sits against the back wall. */
export const DAIS = { hw: 6, z0: -20, z1: -13, h: 0.6 };
export const THRONE_Z = -18.4;
/** Floor height in the hall: the dais top, with a short step-up along its front edge (renderers add it like townLift). */
export function daisLift(x: number, z: number): number {
  if (Math.abs(x) > DAIS.hw || z < DAIS.z0 || z > DAIS.z1 + DAIS_STEP) return 0;
  return z <= DAIS.z1 ? DAIS.h : DAIS.h * (DAIS.z1 + DAIS_STEP - z) / DAIS_STEP;
}
const DAIS_STEP = 0.7;
/** Where the hero appears after walking through the castle door, and the exit-door pill spot. */
export const CASTLE_SPAWN = { x: 0, z: 16.5 };
export const CASTLE_EXIT = { x: 0, z: 19, r: 4.2 };
/** Hero position on the castle steps outside (south of the keep, facing the town). */
export const CASTLE_STEPS = { x: 0, z: -21.2 };
/** Interact spot for the keep door in the town. */
export const CASTLE_DOOR = { x: 0, z: -23.2, r: 4.6 };

export const PILLARS: [number, number][] = [];
for (const x of [-7.5, 7.5]) for (const z of [-8, -1, 6, 13]) PILLARS.push([x, z]);
/** Banquet tables [x, z] (owner 2026-10-24: removed from the throne hall, the list stays empty). */
export const TABLES: [number, number][] = [];
export const TABLE_STOOLS: [number, number][] = [];
for (const [x, z] of TABLES) for (const sx of [-1, 1]) for (const sz of [-1, 1]) TABLE_STOOLS.push([x + sx * 1.3, z + sz * 1.3]);
/** Candle stands (the old braziers): two flanking the dais, two by the door. */
export const BRAZIERS: [number, number][] = [[-7, -12], [7, -12], [-3.4, 14.5], [3.4, 14.5]];
export const BANNER_Z = [-14, -6, 6, 14];
/** Weapon racks on the hall's side walls (z), kept clear of the wing doorways. */
export const RACK_Z = [-4.6, 4.6];
/** Suits of armour (door + dais corners), potted plants and the two bookshelves on the back wall (visual + colliders). */
export const ARMORS: [number, number][] = [[-5.6, 17.6], [5.6, 17.6], [-9.6, -13.2], [9.6, -13.2]];
export const HALL_PLANTS: [number, number][] = [[-3.7, 17.8], [3.7, 17.8], [-9.6, -16.4], [9.6, -16.4]];
export const HALL_SHELVES: [number, number][] = [[-10.4, -19.35], [10.4, -19.35]];
/** Candle stands on the dais either side of the throne. */
export const DAIS_CANDLES: [number, number][] = [[-3.7, -17.4], [3.7, -17.4]];

// ---------------------------------------------------------------------------------------------------------------------------------
// WINGS. Rooms are rectangles up to the centre line of the walls between them. Wall pieces are 0.96 m thick (0.48 per side for the
// partitions); the hall's side walls sit at x = +-WALL_X.
// ---------------------------------------------------------------------------------------------------------------------------------
/** Whole castle interior (inner wall faces): x +-35, z +-20. */
export const CASTLE_EXT = { hw: 35, hd: 20 };
/** Centre line of the throne room's side walls (the partitions to the wings). */
export const WALL_X = HALL.hw + 0.48;
/** Width of every doorway (= the arch piece width). */
export const GAP_W = 4;
/** z of the two doorways in each side wall of the hall: dining hall / bedroom (north) and library / study (south). */
export const HALL_DOOR_Z = [-10, 11] as const;
/** Height scale of the low walls (the camera looks over them from the south). */
export const LOW_WALL_SY = 0.3;

export interface CastleRoom { id: string; name: string; x0: number; x1: number; z0: number; z1: number; floor: 'wood' | 'tile'; tint?: string; color: string }
export const CASTLE_ROOMS: CastleRoom[] = [
  { id: 'hall', name: 'Throne Room', x0: -WALL_X, x1: WALL_X, z0: -20, z1: 20, floor: 'tile', color: '#efe6d2' },
  { id: 'dining', name: 'Dining Hall', x0: -35, x1: -WALL_X, z0: -20, z1: 2, floor: 'wood', color: '#f3d9a8' },
  { id: 'kitchen', name: 'Kitchen', x0: -35, x1: -25, z0: 2, z1: 20, floor: 'tile', tint: '#ffe6c4', color: '#f7e2c8' },
  { id: 'library', name: 'Library', x0: -25, x1: -WALL_X, z0: 2, z1: 20, floor: 'wood', tint: '#e9c9a0', color: '#e9cfae' },
  { id: 'bedroom', name: "King's Bedroom", x0: WALL_X, x1: 35, z0: -20, z1: 2, floor: 'wood', tint: '#f2d2c4', color: '#f6d5d0' },
  { id: 'study', name: 'Study', x0: WALL_X, x1: 25, z0: 2, z1: 20, floor: 'wood', tint: '#e9c9a0', color: '#e5d2b8' },
  { id: 'treasury', name: 'Treasury', x0: 25, x1: 35, z0: 2, z1: 20, floor: 'tile', tint: '#ffe08a', color: '#fbe7a6' },
];
for (const r of CASTLE_ROOMS) if (r.x0 > r.x1) { const t = r.x0; r.x0 = r.x1; r.x1 = t; }   // (the west rooms were written -35 .. -WALL_X)

/** A straight run of interior wall: along x at z = line (alongX) or along z at x = line, from a to b. `low` = the camera-friendly low wall. */
export interface WallSeg { alongX: boolean; line: number; a: number; b: number; low: boolean }
/** A doorway: centre, direction of the wall it cuts, and whether that wall is low. */
export interface CastleDoor { x: number; z: number; alongX: boolean; low: boolean }
export const WALLS: WallSeg[] = [];
export const DOORS: CastleDoor[] = [];
{
  const hg = GAP_W / 2, dz0 = HALL_DOOR_Z[0], dz1 = HALL_DOOR_Z[1];
  for (const s of [-1, 1]) {
    const mx = (a: number, b: number): [number, number] => (s < 0 ? [a, b] : [-b, -a]);   // west-side x range -> this side
    // hall side wall (full height): gaps at z -10 and 11
    for (const [a, b] of [[-20, dz0 - hg], [dz0 + hg, dz1 - hg], [dz1 + hg, 20]]) WALLS.push({ alongX: false, line: s * WALL_X, a, b, low: false });
    DOORS.push({ x: s * WALL_X, z: dz0, alongX: false, low: false }, { x: s * WALL_X, z: dz1, alongX: false, low: false });
    // wall between the north room and the two south rooms (low): gaps at x = +-30 (kitchen / treasury) and +-20 (library / study)
    for (const [a, b] of [[-35, -32], [-28, -22], [-18, -WALL_X]]) { const [x0, x1] = mx(a, b); WALLS.push({ alongX: true, line: 2, a: x0, b: x1, low: true }); }
    DOORS.push({ x: s * 30, z: 2, alongX: true, low: true }, { x: s * 20, z: 2, alongX: true, low: true });
    // wall between the two south rooms (full height): gap at z 11
    for (const [a, b] of [[2, 11 - hg], [11 + hg, 20]]) WALLS.push({ alongX: false, line: s * 25, a, b, low: false });
    DOORS.push({ x: s * 25, z: 11, alongX: false, low: false });
  }
}

/** Circles along a wall run (r 0.6 on the centre line; the end circles stop 0.55 short so a 4 m gap leaves ~2.9 m for the hero to pass). */
function wallCircles(w: WallSeg, out: [number, number, number][]): void {
  const len = w.b - w.a - 1.1;
  const n = Math.max(1, Math.ceil(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = w.a + 0.55 + (len * i) / n;
    out.push(w.alongX ? [t, w.line, 0.6] : [w.line, t, 0.6]);
  }
}

// ---------------------------------------------------------------- DINING HALL (west, north): long table, chairs, fireplace, sideboards
export const DINING_TABLE = { x: -25, z: -5, len: 12, w: 2.4 };
/** Chairs [x, z, yaw] (yaw 0 = looks toward +z): both long sides + the two heads. */
export const DINING_CHAIRS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) { const x = -29.5 + i * 2.5; c.push([x, DINING_TABLE.z - 2.5, 0], [x, DINING_TABLE.z + 2.5, Math.PI]); }
  c.push([-32.2, DINING_TABLE.z, Math.PI / 2], [-17.8, DINING_TABLE.z, -Math.PI / 2]);
  return c;
})();
export const DINING_FIRE = { x: -34.55, z: -10 };
export const DINING_SIDEBOARDS: [number, number][] = [[-30, -19.3], [-20, -19.3]];
export const DINING_CANDLES: [number, number][] = [[-28.5, -5], [-25, -5], [-21.5, -5]];
export const DINING_STANDS: [number, number][] = [[-33.4, -18.6], [-16.6, -18.6]];
export const DINING_PLANTS: [number, number][] = [[-16.6, 0.2], [-33.5, 0.2]];
// ---------------------------------------------------------------- KITCHEN (west, south-west)
export const KITCHEN_COUNTERS: [number, number][] = [[-34.45, 6], [-34.45, 10]];
export const KITCHEN_FIRE = { x: -34.55, z: 17.5 };
export const KITCHEN_CAULDRON = { x: -32.2, z: 17.5 };
export const KITCHEN_ISLAND = { x: -29.8, z: 11.5, len: 3.4, w: 1.6 };
export const KITCHEN_CRATES: [number, number][] = [[-26.3, 4.6], [-26.3, 6.0]];
export const KITCHEN_BARRELS: [number, number][] = [[-26.4, 18.4], [-26.3, 16.9]];
export const KITCHEN_SHELVES: [number, number][] = [[-25.45, 4.8], [-25.45, 16]];
// ---------------------------------------------------------------- LIBRARY (west, south-east)
/** z of the bookshelves along both long walls of the library and the study (the z 11 doorway stays free). */
export const LIB_SHELF_Z = [4.4, 6.6, 15.4, 17.6];
export const LIBRARY_DESK = { x: -19.6, z: 17.4 };
export const LIBRARY_ARMCHAIRS: [number, number, number][] = [[-23.3, 4.4, 0.35], [-16.9, 9.1, -0.9]];
export const LIBRARY_GLOBE = { x: -22.6, z: 15.2 };
export const LIBRARY_RUG = { x: -19.8, z: 11 };
export const LIBRARY_STANDS: [number, number][] = [[-23.6, 7.9], [-16.2, 13.6]];
export const LIBRARY_PLANTS: [number, number][] = [[-16.2, 3.4]];
// ---------------------------------------------------------------- KING'S BEDROOM (east, north)
export const BEDROOM_BED = { x: 27, z: -17.25, s: 1.7 };
export const BEDROOM_NIGHTSTANDS: [number, number][] = [[24, -19], [30, -19]];
export const BEDROOM_BENCH = { x: 27, z: -12.2 };
export const BEDROOM_STANDS: [number, number][] = [[23, -14.6], [31, -14.6]];
export const BEDROOM_WARDROBES: [number, number][] = [[34.35, -16], [34.35, -13.4]];
export const BEDROOM_FIRE = { x: 34.55, z: -10 };
export const BEDROOM_ARMCHAIRS: [number, number, number][] = [[31.8, -12.4, Math.PI / 2 + 0.3], [31.8, -7.6, Math.PI / 2 - 0.3]];
export const BEDROOM_VANITY = { x: 15.5, z: -16.6 };
export const BEDROOM_RUG = { x: 26, z: -11 };
export const BEDROOM_PLANTS: [number, number][] = [[16.2, 0.3], [33.8, 0.3]];
// ---------------------------------------------------------------- STUDY (east, south-west)
export const STUDY_DESK = { x: 20, z: 17.3 };
export const STUDY_MAP_TABLE = { x: 19.6, z: 6.9 };
/** Chairs on the south side of the map table [x, z, yaw]. */
export const STUDY_CHAIRS: [number, number, number][] = [[STUDY_MAP_TABLE.x - 0.8, STUDY_MAP_TABLE.z + 1.5, Math.PI], [STUDY_MAP_TABLE.x + 0.8, STUDY_MAP_TABLE.z + 1.5, Math.PI]];
export const STUDY_GLOBE = { x: 22.8, z: 15.4 };
export const STUDY_ARMCHAIRS: [number, number, number][] = [[23.2, 8.1, -1.1]];
export const STUDY_STANDS: [number, number][] = [[16.2, 13.6], [23.4, 3.6]];
export const STUDY_PLANTS: [number, number][] = [[16.2, 3.4]];
// ---------------------------------------------------------------- TREASURY (east, south-east)
/** Chests [x, z, yaw, open]. */
export const TREASURY_CHESTS: [number, number, number, boolean][] = [[26.4, 3.7, 0, false], [33.6, 3.7, 0, true], [34.2, 7.2, -Math.PI / 2, true], [34.2, 10.4, -Math.PI / 2, false]];
/** Gold heaps [x, z, scale]. */
export const TREASURY_GOLD: [number, number, number][] = [[33.2, 17.4, 1.5], [28.8, 17.6, 1.1], [33.9, 13.8, 0.8], [26.7, 7.2, 0.7]];
export const TREASURY_PEDESTAL = { x: 30.2, z: 13.8 };
export const TREASURY_ARMORS: [number, number][] = [[26.4, 14.9], [26.3, 6.9]];
export const TREASURY_STANDS: [number, number][] = [[28.2, 13.0], [32.2, 13.0]];

/** Collision circles [x, z, r]: perimeter walls, partitions, pillars, dais front, throne, braziers, weapon racks, and every wing's furniture. */
export const CASTLE_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const hw = CASTLE_EXT.hw, hd = CASTLE_EXT.hd;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) { c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]); }
  for (let z = -hd; z <= hd; z += 1.1) { c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]); }
  for (const w of WALLS) wallCircles(w, c);
  for (const [x, z] of PILLARS) c.push([x, z, 0.9]);
  // the dais is open (owner: walk straight up the carpet to the King; daisLift raises the hero onto it); only the throne blocks
  c.push([0, THRONE_Z - 0.3, 1.4]);
  for (const [x, z] of DAIS_CANDLES) c.push([x, z, 0.45]);
  for (const [x, z] of TABLES) c.push([x, z, 1.4]);
  for (const [x, z] of TABLE_STOOLS) c.push([x, z, 0.4]);
  for (const [x, z] of BRAZIERS) c.push([x, z, 0.55]);
  for (const [x, z] of ARMORS) c.push([x, z, 0.6]);
  for (const [x, z] of HALL_PLANTS) c.push([x, z, 0.5]);
  for (const [x, z] of HALL_SHELVES) c.push([x - 0.6, z + 0.3, 0.6], [x + 0.6, z + 0.3, 0.6]);
  for (const x of [-12.9, 12.9]) for (const z of RACK_Z) c.push([x, z - 0.6, 0.7], [x, z + 0.6, 0.7]);
  // ---- dining hall
  { const t = DINING_TABLE; for (let i = 0; i <= 8; i++) c.push([t.x - 5 + i * 1.25, t.z, 1.2]); }
  for (const [x, z] of DINING_CHAIRS) c.push([x, z, 0.45]);
  for (const [x, z] of DINING_SIDEBOARDS) c.push([x - 1, z, 0.6], [x, z, 0.6], [x + 1, z, 0.6]);
  for (const d of [-1.3, 0, 1.3]) c.push([-34.2, DINING_FIRE.z + d, 0.7]);
  for (const [x, z] of DINING_STANDS) c.push([x, z, 0.55]);
  for (const [x, z] of DINING_PLANTS) c.push([x, z, 0.5]);
  // ---- kitchen
  for (const [x, z] of KITCHEN_COUNTERS) for (const d of [-1.3, 0, 1.3]) c.push([x + 0.25, z + d, 0.65]);
  for (const d of [-1.3, 0, 1.3]) c.push([-34.2, KITCHEN_FIRE.z + d, 0.7]);
  c.push([KITCHEN_CAULDRON.x, KITCHEN_CAULDRON.z, 0.7]);
  { const k = KITCHEN_ISLAND; for (const dx of [-1.3, 0, 1.3]) c.push([k.x + dx, k.z, 0.8]); }
  for (const [x, z] of KITCHEN_CRATES) c.push([x, z, 0.6]);
  for (const [x, z] of KITCHEN_BARRELS) c.push([x, z, 0.6]);
  // ---- library
  for (const z of LIB_SHELF_Z) c.push([-24.0, z - 0.5, 0.5], [-24.0, z + 0.5, 0.5], [-15.4, z - 0.5, 0.5], [-15.4, z + 0.5, 0.5]);
  c.push([LIBRARY_DESK.x - 0.8, LIBRARY_DESK.z, 0.6], [LIBRARY_DESK.x + 0.8, LIBRARY_DESK.z, 0.6], [LIBRARY_DESK.x, 18.8, 0.45]);
  for (const [x, z] of LIBRARY_ARMCHAIRS) c.push([x, z, 0.65]);
  c.push([LIBRARY_GLOBE.x, LIBRARY_GLOBE.z, 0.6]);
  for (const [x, z] of LIBRARY_STANDS) c.push([x, z, 0.55]);
  for (const [x, z] of LIBRARY_PLANTS) c.push([x, z, 0.5]);
  // ---- king's bedroom
  { const b = BEDROOM_BED; for (const dx of [-0.7, 0.7]) for (const dz of [-1.65, 0, 1.65]) c.push([b.x + dx, b.z + dz, 0.9]); }
  for (const [x, z] of BEDROOM_NIGHTSTANDS) c.push([x, z, 0.5]);
  for (const dx of [-0.8, 0, 0.8]) c.push([BEDROOM_BENCH.x + dx, BEDROOM_BENCH.z, 0.55]);
  for (const [x, z] of BEDROOM_STANDS) c.push([x, z, 0.55]);
  for (const [x, z] of BEDROOM_WARDROBES) c.push([x - 0.25, z - 0.55, 0.65], [x - 0.25, z + 0.55, 0.65]);
  for (const d of [-1.3, 0, 1.3]) c.push([34.2, BEDROOM_FIRE.z + d, 0.7]);
  for (const [x, z] of BEDROOM_ARMCHAIRS) c.push([x, z, 0.65]);
  c.push([BEDROOM_VANITY.x + 0.2, BEDROOM_VANITY.z - 0.6, 0.6], [BEDROOM_VANITY.x + 0.2, BEDROOM_VANITY.z + 0.6, 0.6], [BEDROOM_VANITY.x + 1.5, BEDROOM_VANITY.z, 0.4]);
  for (const [x, z] of BEDROOM_PLANTS) c.push([x, z, 0.5]);
  // ---- study
  for (const z of LIB_SHELF_Z) c.push([15.45, z - 0.5, 0.5], [15.45, z + 0.5, 0.5], [24.05, z - 0.5, 0.5], [24.05, z + 0.5, 0.5]);
  for (const dx of [-1, 0, 1]) c.push([STUDY_DESK.x + dx, STUDY_DESK.z, 0.6]);
  c.push([STUDY_DESK.x, 18.8, 0.45], [STUDY_MAP_TABLE.x - 0.8, STUDY_MAP_TABLE.z, 0.95], [STUDY_MAP_TABLE.x + 0.8, STUDY_MAP_TABLE.z, 0.95], [STUDY_GLOBE.x, STUDY_GLOBE.z, 0.6]);
  for (const [x, z] of STUDY_ARMCHAIRS) c.push([x, z, 0.65]);
  for (const [x, z] of STUDY_CHAIRS) c.push([x, z, 0.45]);
  for (const [x, z] of STUDY_STANDS) c.push([x, z, 0.55]);
  for (const [x, z] of STUDY_PLANTS) c.push([x, z, 0.5]);
  // ---- treasury
  for (const [x, z, yaw] of TREASURY_CHESTS) { const al = Math.abs(Math.sin(yaw)) > 0.5; for (const d of [-0.5, 0.5]) c.push(al ? [x, z + d, 0.7] : [x + d, z, 0.7]); }
  for (const [x, z, s] of TREASURY_GOLD) c.push([x, z, 0.85 * s]);
  c.push([TREASURY_PEDESTAL.x, TREASURY_PEDESTAL.z, 0.85]);
  for (const [x, z] of TREASURY_ARMORS) c.push([x, z, 0.6]);
  for (const [x, z] of TREASURY_STANDS) c.push([x, z, 0.5]);
  return c;
})();
