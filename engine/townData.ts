// ============================================================================
// Town layout + NPC cast (pure data, no three / no React). Read by:
//  * engine/mapgen.ts          -> ISLAND_BOXES (small island shape)
//  * engine/systems/village.ts -> colliders, gate position, harvest nodes, NPC pills
//  * engine/systems/npcs.ts    -> NPC / animal behaviour
//  * render/TownScenery.tsx + render/Npcs.tsx -> drawing
// Coordinates are world x / z. A building's door faces +z at rot = 0 (facing vector = (sin rot, cos rot)).
//
// Layout (compact ~60% footprint, functional buildings spread out on their own spots):
//   spawn / plaza (0, 2) -> north: castle path, Quest Board (7.5,-13), Altar (-17,-13), Skill Trainer (17,-13)
//   west row Potion Shop (-20.5, 2) / Pet Stable (-29.5, 2) / Fortune Teller (-36.5, 2), east Blacksmith (27, 2), gate (0, 38) at the end of the
//   main road. Houses / stalls are decoration. Harvest nodes sit on the outskirts.
// ============================================================================
import { QUEST_POS, SHRINE_POS, TRAINER_POS } from './world';

export interface HouseSpec { x: number; z: number; rot: number; w: number; d: number; floors: 1 | 2; wall: string; roof: string; trim: string; chimney: boolean; door: string }
export interface StallSpec { x: number; z: number; rot: number; c1: string; c2: string; goods: 0 | 1 | 2 | 3 }
export interface RoadSpec { x1: number; z1: number; x2: number; z2: number; w: number }
export interface SignSpec { x: number; z: number }

export const GATE = { x: 0, z: 38 };
export const PLAZA = { x: 0, z: 2, r: 6.5 };
/** Well on a grass patch (not on the plaza or a road). */
export const WELL_POS = { x: -21, z: 18 };
export const PEN = { x: -22, z: 27, hw: 5, hd: 3 };
/** Fenced wheat field in front of the gate (outside the walls). */
export const FARM = { x: 13, z: 60, hw: 7, hd: 6 };
/** Walkable island = union of axis-aligned boxes [x0, z0, x1, z1], all containing the origin (mapgen turns them into a polar edge). */
/** Lake west of the town wall (not walkable: the island edge stops just past the wall). */
export const LAKE = { x0: -170, x1: -49.5, z0: -95, z1: 85, shore: 7 };

export const ISLAND_BOXES: [number, number, number, number][] = [
  [-48.5, -60, 62, 56], // walled town + a walkable ring OUTSIDE the walls on the back / east (the west side is the lake)
  [-27, -10, 27, 80],   // modest forecourt south of the gate (farm road, field, trees)
];

const WALLS = ['#e9dfc8', '#e4d8bd', '#dccdb0', '#d6d0c4', '#cfd3c4', '#d8c6b0', '#c9cdd2'];
/** Muted roofs only: dark browns, charcoal and black-brown. */
const ROOFS = ['#3b2a20', '#2e2926', '#4a3426', '#241c18', '#33281f', '#2b2b2e', '#3f2d22', '#1f1a18'];
const DOORS = ['#5a3a1e', '#7a3a2a', '#2f5a7a', '#3e5a2e'];

let HOUSE_COUNT = 0;
const H = (x: number, z: number, rot: number, w: number, d: number, floors: 1 | 2 = 1): HouseSpec => {
  const n = HOUSE_COUNT++;
  return { x, z, rot, w, d, floors, wall: WALLS[(n * 3 + 1) % WALLS.length], roof: ROOFS[(n * 5 + 2) % ROOFS.length], trim: n % 3 === 0 ? '#6e4b2b' : '#f4ead2', chimney: n % 2 === 0, door: DOORS[n % DOORS.length] };
};

/** Decorative houses (old shop-style: stone footing, timber frame, big gabled roof, striped awning). */
/** Castle keep against the north wall, behind the quest board (door faces south). x0..x1 / z0..z1 = footprint of the main hall. */
/** Hermit's camp outside the north wall (campfire + bedroll, drawn in TownScenery). */
export const HERMIT_CAMP = { x: 0, z: -51 };
/** The way to the hermit (outside the walls: east ring, then the north ring): overgrown ruins and lurking monsters. */
export interface RuinSpec { x: number; z: number; rot: number; kind: 0 | 1 | 2 }   // 0 broken pillar, 1 ruined wall, 2 fallen arch
export const RUINS: RuinSpec[] = [
  { x: 58, z: 14, rot: 0.3, kind: 1 }, { x: 57.5, z: -4, rot: 0, kind: 0 }, { x: 49, z: -20, rot: 1.2, kind: 0 }, { x: 58, z: -28, rot: -0.4, kind: 2 },
  { x: 47, z: -47, rot: 0.8, kind: 1 }, { x: 34, z: -56.5, rot: 0.1, kind: 0 }, { x: 26, z: -45.5, rot: -0.2, kind: 1 }, { x: 16, z: -56, rot: 0.4, kind: 2 },
  { x: 9, z: -45, rot: 0, kind: 0 },
];
/** Stationary monsters on the hermit path (they hold their ground; respawn a minute after dying). */
export const TOWN_MONSTERS: { kind: 'SLIME' | 'GOBLIN' | 'BOAR' | 'BRUTE' | 'BANDIT'; x: number; z: number }[] = [
  { kind: 'SLIME', x: 53, z: 22 }, { kind: 'SLIME', x: 55, z: 19 }, { kind: 'GOBLIN', x: 52, z: 4 }, { kind: 'GOBLIN', x: 55, z: 1 },
  { kind: 'BOAR', x: 53, z: -14 }, { kind: 'BANDIT', x: 52, z: -34 }, { kind: 'BANDIT', x: 55, z: -37 },
  { kind: 'GOBLIN', x: 38, z: -50 }, { kind: 'BOAR', x: 30, z: -52 }, { kind: 'BRUTE', x: 14, z: -50 },
];
export const CASTLE = { x: 0, z: -32.5, w: 20, d: 11, h: 9 };

export const HOUSES: HouseSpec[] = [
  // flanking the castle
  H(-17.5, -31, 0, 5.0, 4.4, 2), H(17.5, -31, 0, 5.0, 4.4),
  // where the old summoning shrine stood (north street, door facing the street)
  H(-17, -14, 0, 5.0, 4.4),
  // south of the east-west street, doors facing the street
  H(-13, 17.5, Math.PI, 4.6, 4.0), H(13, 17.5, Math.PI, 4.8, 4.2, 2),
  // along the road to the gate
  H(-9, 30, Math.PI / 2, 4.6, 4.2), H(9, 31.5, -Math.PI / 2, 5.0, 4.4, 2),
  // outskirts
  H(-34, 19, Math.PI / 2, 4.6, 4.0), H(34, 19, -Math.PI / 2, 5.0, 4.4, 2),
  H(24, 22, 0, 5.2, 4.4, 2),   // where the pet stable used to be
  // north street ends, facing the street (west end north of the potion shop, east end north of the warehouse)
  H(-24, -6, Math.PI / 2, 5.0, 4.4, 2),   // (the east one is the Tech House shop)
  H(-33, -9, 0.5, 5.0, 4.4, 2), H(33, -10, -0.5, 4.8, 4.2),
  H(-31, -24, 0.3, 4.8, 4.2), H(31, -24, -0.3, 5.2, 4.4, 2),
];

/** Decorative market stalls (the useful shops are Supplies / Blacksmith / Pets). */
export const STALLS: StallSpec[] = [
  { x: -11.5, z: -1, rot: Math.PI / 2, c1: '#e6dac0', c2: '#e6dac0', goods: 0 },
  { x: 11.5, z: -1, rot: -Math.PI / 2, c1: '#efe8d8', c2: '#efe8d8', goods: 1 },
  { x: -8.5, z: 15, rot: Math.PI, c1: '#e2d4b4', c2: '#e2d4b4', goods: 2 },
  { x: 8.5, z: 15, rot: Math.PI, c1: '#ece2c8', c2: '#ece2c8', goods: 3 },
];

/**
 * Clean road network (all strips are axis-aligned and drawn in one flat layer, see TownScenery.buildRoads):
 *  - main avenue (w5): plaza -> gate -> on south into the farmland
 *  - two streets (w4) tangent to the plaza: south street (shops / houses) and north street (board, altar, trainer)
 *  - one lane (w4) to the Pet Stable (its barn door faces south onto the lane)
 *  - short straight branches (w2.8) that end exactly at each building's door / interaction point.
 * Door x of the shops: Potion Shop door at local x -1.4 (world -21.9), Blacksmith door local x -1.6 (world 25.4).
 */
export const ROAD_W = { main: 5, street: 4, branch: 2.8 };
export const ROADS: RoadSpec[] = [
  { x1: 0, z1: 8, x2: 0, z2: 74, w: ROAD_W.main },               // main avenue plaza -> gate -> farm road
  { x1: -38, z1: 10, x2: 38, z2: 10, w: ROAD_W.street },         // south street
  { x1: -18, z1: -6, x2: 18, z2: -6, w: ROAD_W.street },         // north street
  { x1: 0, z1: 26.5, x2: 25.1, z2: 26.5, w: ROAD_W.street },   // east lane (old pet stable spot, now a house)
  { x1: -21.9, z1: 10, x2: -21.9, z2: 4.5, w: ROAD_W.branch },   // potion shop door
  { x1: -30.4, z1: 10, x2: -30.4, z2: 4.5, w: ROAD_W.branch },   // pet stable door
  { x1: 25.4, z1: 10, x2: 25.4, z2: 4.5, w: ROAD_W.branch },     // blacksmith door
  { x1: 19.5, z1: 10, x2: 19.5, z2: 5.2, w: ROAD_W.branch },     // warehouse barn doors
  { x1: 0, z1: -6, x2: 0, z2: -24, w: ROAD_W.branch + 0.6 },     // castle path (straight to the keep's steps)
  { x1: 7.5, z1: -6, x2: 7.5, z2: -11.6, w: ROAD_W.branch },     // quest board
  { x1: 34.9, z1: 10, x2: 34.9, z2: 4.5, w: ROAD_W.branch },     // armor shop door
  { x1: -37.9, z1: 10, x2: -37.9, z2: 4.5, w: ROAD_W.branch },   // fortune teller door
  { x1: 17, z1: -6, x2: 17, z2: -10.6, w: ROAD_W.branch },       // skill trainer
  { x1: 0, z1: 60, x2: 6.6, z2: 60, w: ROAD_W.branch },        // farm gate
];

// --------------------------------------------------------------- town wall ---
/** Stone town wall ring. Centre line of the wall; the south side is cut by the gatehouse (GATE towers at x = +-6.6). */
export const WALL = { x0: -45, x1: 45, z0: -41, z1: 38, thick: 2.6, gateHalf: 8.4 };
export interface TowerSpec { x: number; z: number; r: number; corner: boolean }
export const WALL_TOWERS: TowerSpec[] = [
  { x: WALL.x0, z: WALL.z0, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z0, r: 3.6, corner: true },
  { x: WALL.x0, z: WALL.z1, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z1, r: 3.6, corner: true },
  { x: -22.5, z: WALL.z0, r: 3.1, corner: false }, { x: 0, z: WALL.z0, r: 3.1, corner: false }, { x: 22.5, z: WALL.z0, r: 3.1, corner: false },
  { x: WALL.x0, z: -14.7, r: 3.1, corner: false }, { x: WALL.x0, z: 11.7, r: 3.1, corner: false },
  { x: WALL.x1, z: -14.7, r: 3.1, corner: false }, { x: WALL.x1, z: 11.7, r: 3.1, corner: false },
  { x: -27, z: WALL.z1, r: 3.1, corner: false }, { x: 27, z: WALL.z1, r: 3.1, corner: false },
];
/** Straight wall runs [x1, z1, x2, z2, outwardX, outwardZ] (outward normal is where the merlons stand). */
export const WALL_RUNS: [number, number, number, number, number, number][] = [
  [WALL.x0, WALL.z0, WALL.x1, WALL.z0, 0, -1],              // north
  [WALL.x1, WALL.z0, WALL.x1, WALL.z1, 1, 0],               // east
  [WALL.x0, WALL.z0, WALL.x0, WALL.z1, -1, 0],              // west
  [WALL.x1, WALL.z1, WALL.gateHalf, WALL.z1, 0, 1],         // south-east, up to the gatehouse
  [-WALL.gateHalf, WALL.z1, WALL.x0, WALL.z1, 0, 1],        // south-west
];

/** Fence runs [x1, z1, x2, z2]. Every run gets colliders (see TOWN_COLLIDERS). */
export const FENCES: [number, number, number, number][] = [
  // road to the gate (east side has a gap for the pet-stable lane)
  [-3.9, 20, -3.9, 33], [3.9, 20, 3.9, 24.3], [3.9, 28.7, 3.9, 33],
  // chicken pen
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z - PEN.hd], [PEN.x - PEN.hw, PEN.z + PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x - PEN.hw, PEN.z + PEN.hd], [PEN.x + PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  // front gardens
  [-18, 15, -18, 20], [18, 14.5, 18, 20],
  // farm field south of the gate (gap in the west side, facing the avenue)
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z - FARM.hd], [FARM.x - FARM.hw, FARM.z + FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x + FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x - FARM.hw, FARM.z - 1.5], [FARM.x - FARM.hw, FARM.z + 1.5, FARM.x - FARM.hw, FARM.z + FARM.hd],
];

/** Signposts pointing at the gate (south): one beside the spawn plaza, one half way down the road. */
/** Gate signposts were removed at the owner's request (a ground arrow points to the gate instead). */
export const SIGNS: SignSpec[] = [];

/** Lamp posts (emissive bulb only, no real lights). */
export const LAMPS: [number, number][] = [
  // main avenue (+ the road on into the farmland)
  [3, 14], [-3, 20], [3, 24], [-3, 34], [3, 36.5], [-3, 40], [3, 42.5], [3.2, 50], [-3.2, 58], [3.2, 68],
  // south street (north edge), plaza, north street
  [-11, 7.2], [11, 7.2], [-20, 7.2], [20, 7.2], [-6, 6.2], [6, 6.2], [-12.5, -8.9], [12.5, -8.9], [-5, -8.9], [5, -8.9],
];

/** Stone plant boxes (raised planters with shrubs / flowers), axis aligned, w along x and d along z. kind 1 = flowers. */
export interface PlanterSpec { x: number; z: number; w: number; d: number; kind: 0 | 1 }
export const PLANTERS: PlanterSpec[] = [
  // plaza ring
  { x: -7.6, z: 5.8, w: 1.4, d: 3.0, kind: 1 }, { x: 7.6, z: 5.8, w: 1.4, d: 3.0, kind: 0 },
  { x: -7.6, z: -1.8, w: 1.4, d: 3.0, kind: 0 }, { x: 7.6, z: -1.8, w: 1.4, d: 3.0, kind: 1 },
  // avenue
  { x: -3.8, z: 16.5, w: 1.4, d: 3.2, kind: 1 }, { x: 3.8, z: 16.5, w: 1.4, d: 3.2, kind: 0 },
  // south street, both sides
  { x: -14.5, z: 7.0, w: 3.2, d: 1.0, kind: 0 }, { x: 14.5, z: 7.0, w: 3.2, d: 1.0, kind: 1 },
  { x: -22, z: 13.4, w: 3.2, d: 1.0, kind: 1 }, { x: 22, z: 13.4, w: 3.2, d: 1.0, kind: 0 },
  // north street + quest board path
  { x: -11.5, z: -9.2, w: 3.2, d: 1.0, kind: 1 }, { x: 11.5, z: -9.2, w: 3.2, d: 1.0, kind: 0 },
  { x: -2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 }, { x: 2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 },
  // castle approach: flower beds lining the path and the castle front
  { x: -2.6, z: -16.5, w: 1.2, d: 3.0, kind: 1 }, { x: 2.6, z: -16.5, w: 1.2, d: 3.0, kind: 1 },
  { x: -7.6, z: -24.6, w: 6.0, d: 1.5, kind: 1 }, { x: 7.6, z: -24.6, w: 6.0, d: 1.5, kind: 1 },
  { x: -6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 }, { x: 6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 },
  // pet lane
  { x: 9, z: 23.6, w: 3.2, d: 1.0, kind: 1 }, { x: 15, z: 23.6, w: 3.2, d: 1.0, kind: 0 },
  // flower bed in front of the gate (outside)
  { x: -9, z: 49, w: 6, d: 2.4, kind: 1 }, { x: 9, z: 46, w: 4, d: 2, kind: 1 },
];

/** Trees: x, z, scale, kind (0 oak, 1 palm, 2 pineA, 3 pineB). Inside the walls they stand on the grass patches. */
export interface TreeSpec { x: number; z: number; s: number; kind: 0 | 1 | 2 | 3 }
export const TOWN_TREES: TreeSpec[] = [
  // hermit path (outside the walls): east ring and north ring, both sides of the trail
  { x: 59.5, z: 30, s: 3.4, kind: 1 }, { x: 59, z: 8, s: 3.2, kind: 0 }, { x: 60, z: -12, s: 3.6, kind: 1 }, { x: 59.5, z: -40, s: 3.3, kind: 0 },
  { x: 48.5, z: 12, s: 2.8, kind: 0 }, { x: 48.5, z: -6, s: 3.0, kind: 1 }, { x: 48.5, z: -30, s: 2.9, kind: 0 },
  { x: 52, z: -57, s: 3.4, kind: 1 }, { x: 40, z: -57.5, s: 3.2, kind: 0 }, { x: 22, z: -57.5, s: 3.5, kind: 1 }, { x: 10, z: -58, s: 3.0, kind: 0 },
  { x: 40, z: -44.5, s: 2.8, kind: 1 }, { x: 18, z: -44.5, s: 2.9, kind: 0 },
  // tall round trees beside houses and along the streets (spots checked against colliders, roads, NPC routes and doors)
  { x: -32, z: 14.5, s: 3.00, kind: 0 }, { x: -32, z: 23.5, s: 3.30, kind: 0 }, { x: -27.5, z: -27.5, s: 3.60, kind: 0 }, { x: 39, z: -6.5, s: 3.15, kind: 0 }, { x: 14.5, z: -35, s: 3.45, kind: 0 }, { x: 31, z: -29, s: 3.00, kind: 0 }, { x: 22, z: -33.5, s: 3.30, kind: 0 }, { x: -36.5, z: -5, s: 3.60, kind: 0 }, { x: -29, z: -12.5, s: 3.15, kind: 0 }, { x: -14, z: -35, s: 3.45, kind: 0 }, { x: -15.5, z: -26, s: 3.00, kind: 0 }, { x: -21.5, z: -11, s: 3.30, kind: 0 }, { x: -14, z: -18.5, s: 3.60, kind: 0 }, { x: 8.5, z: 20.5, s: 3.15, kind: 0 }, { x: 29.5, z: 16, s: 3.45, kind: 0 }, { x: 31, z: 23.5, s: 3.00, kind: 0 }, { x: 37, z: 14.5, s: 3.30, kind: 0 }, { x: 38.5, z: 22, s: 3.60, kind: 0 },
  { x: -37, z: -15, s: 3.6, kind: 0 }, { x: 37, z: -16, s: 3.4, kind: 2 }, { x: -37, z: 30, s: 3.7, kind: 0 }, { x: 38, z: 30, s: 3.5, kind: 1 },
  { x: -22, z: -22, s: 3.6, kind: 0 }, { x: 22, z: -22, s: 3.5, kind: 3 }, { x: -10, z: 24, s: 3.2, kind: 1 },
  // forecourt south of the gate
  { x: -12, z: 46, s: 3.8, kind: 0 }, { x: -17, z: 54, s: 3.8, kind: 2 }, { x: -10, z: 62, s: 3.6, kind: 0 }, { x: -18, z: 67, s: 3.9, kind: 3 },
  { x: -6, z: 71, s: 3.4, kind: 1 }, { x: 24, z: 47, s: 3.7, kind: 0 }, { x: 23, z: 69, s: 3.8, kind: 2 }, { x: 12, z: 72, s: 3.5, kind: 0 },
];
/** Small grass patches inside the walls (everything else is paved): x, z, rx, rz. */
export const GRASS_PATCHES: [number, number, number, number][] = [
  [-37, -15, 3, 3], [37, -16, 3, 3], [-37, 30, 3.4, 3.4], [38, 30, 3.4, 3.4], [-22, -22, 3.6, 3.2], [22, -22, 3.6, 3.2],
  [-10, 24, 2.6, 2.4], [-21, 18, 3.3, 3.3], [PEN.x, PEN.z, 6.6, 4.6],
];
/** Farm props (outside the walls): scarecrow + haystack positions. */
export const SCARECROW = { x: FARM.x, z: FARM.z };
export const HAYSTACK = { x: FARM.x + 5, z: FARM.z - 4 };

/** Movement colliders [x, z, r] registered with mapgen.addTempCollider after the island is generated. */
export const TOWN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) c.push([h.x, h.z, Math.hypot(h.w, h.d) * 0.38 + 0.4]);
  for (const r of RUINS) c.push([r.x, r.z, r.kind === 0 ? 1.0 : 1.6]);
  // stalls are ~3.9 wide: two circles along their local x axis
  for (const s of STALLS) for (const k of [-1.1, 1.1]) c.push([s.x + Math.cos(s.rot) * k, s.z - Math.sin(s.rot) * k, 1.25]);
  c.push([WELL_POS.x, WELL_POS.z, 1.5]);
  c.push([HERMIT_CAMP.x, HERMIT_CAMP.z, 0.9]);   // campfire
  // castle: ring of circles around the hall footprint + corner towers
  {
    const { x, z, w, d } = CASTLE, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    for (let px = x0; px <= x1 + 0.01; px += 2) { c.push([px, z0, 1.6], [px, z1, 1.6]); }
    for (let pz = z0; pz <= z1 + 0.01; pz += 2) { c.push([x0, pz, 1.6], [x1, pz, 1.6]); }
    for (const [tx, tz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) c.push([tx, tz, 3.0]);
  }
  // plant boxes: circles along the long axis
  for (const p of PLANTERS) {
    const r = Math.min(p.w, p.d) / 2 + 0.2, alongX = p.w >= p.d, len = Math.max(p.w, p.d), n = Math.max(1, Math.ceil((len - 2 * r) / 0.7));
    for (let i = 0; i <= n; i++) { const o = -len / 2 + r + ((len - 2 * r) * i) / n; c.push([p.x + (alongX ? o : 0), p.z + (alongX ? 0 : o), r]); }
  }
  for (const t of TOWN_TREES) c.push([t.x, t.z, 0.85]);
  c.push([SCARECROW.x, SCARECROW.z, 0.5], [HAYSTACK.x, HAYSTACK.z, 1.3]);
  c.push([QUEST_POS[0], QUEST_POS[2], 1.6]); // notice board
  for (const s of SIGNS) c.push([s.x, s.z, 0.5]);
  for (const [x, z] of LAMPS) c.push([x, z, 0.3]);
  // fences + fence posts: a continuous chain of small circles along every run
  for (const [x1, z1, x2, z2] of FENCES) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 0.45]);
  }
  // gatehouse towers (the 8.8-wide opening between them stays walkable)
  for (const sx of [-1, 1]) c.push([GATE.x + sx * 6.6, GATE.z, 2.1]);
  // town wall: towers + a continuous chain of overlapping circles along every run
  for (const t of WALL_TOWERS) c.push([t.x, t.z, t.r]);
  for (const [x1, z1, x2, z2] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 1.8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 1.5]);
  }
  return c;
})();

/** Resource nodes (crystal / ore) in the outer ring of the village, inside the wall, away from the shops. */
export const VILLAGE_NODES: { kind: 'CRYSTAL' | 'ORE'; x: number; z: number }[] = [
  // outside the walls, in the forecourt south of the gate (they regrow 24 h after the last one is harvested)
  { kind: 'ORE', x: -21, z: 45 }, { kind: 'CRYSTAL', x: -5.5, z: 56 }, { kind: 'ORE', x: -21, z: 72 }, { kind: 'CRYSTAL', x: 19, z: 77 },
];

/** Circles kept free of random trees / rocks / crates by mapgen. */
export const TOWN_CLEAR: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  // the whole walled yard stays free of random trees / rocks (grid of circles covering the wall rectangle)
  for (let x = WALL.x0 + 7; x < WALL.x1; x += 14) for (let z = WALL.z0 + 7; z < WALL.z1 + 6; z += 14) c.push([x, z, 11]);
  c.push([0, 8, 40]);
  for (const h of HOUSES) c.push([h.x, h.z, 6.5]);
  c.push([CASTLE.x, CASTLE.z, 14], [HERMIT_CAMP.x, HERMIT_CAMP.z, 7]);
  for (const s of STALLS) c.push([s.x, s.z, 4]);
  for (const n of VILLAGE_NODES) c.push([n.x, n.z, 4]);
  c.push([WELL_POS.x, WELL_POS.z, 3], [PLAZA.x, PLAZA.z, PLAZA.r + 1], [PEN.x, PEN.z, 8], [GATE.x, GATE.z, 11]);
  c.push([QUEST_POS[0], QUEST_POS[2], 6], [SHRINE_POS[0], SHRINE_POS[2], 6.5], [TRAINER_POS[0], TRAINER_POS[2], 6.5]);
  // keep the wall line (and a margin either side) free of random trees / rocks
  for (const [x1, z1, x2, z2] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 8]);
  }
  for (const t of WALL_TOWERS) c.push([t.x, t.z, 9]);
  for (const r of ROADS) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1), n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i <= n; i++) c.push([r.x1 + ((r.x2 - r.x1) * i) / n, r.z1 + ((r.z2 - r.z1) * i) / n, r.w / 2 + 2.5]);
  }
  return c;
})();

// -------------------------------------------------------------------- NPCs ---
export type NpcModel = 'ARCHER' | 'WIZARD' | 'BARBARIAN' | 'KNIGHT' | 'ROGUE';
export type NpcProp = 'none' | 'staff' | 'hammer' | 'basket' | 'lantern' | 'spear';
export interface NpcGift { once?: string; gold?: number; item?: 'potion_hp' | 'potion_mana'; qty?: number; text: string }
export interface NpcDef {
  name: string; role: string; model: NpcModel; tint: string; scale: number; prop: NpcProp; accent: string;
  home: [number, number]; patrol?: [number, number][]; speed?: number;
  /** pool of short conversations (2-4 lines each); `ordered` cycles them in sequence instead of picking at random */
  talk: string[][]; ordered?: boolean;
  bubbles: string[];
  gift?: NpcGift;
  /** replaces the last line with a nudge when a quest is ready to claim */
  quest?: boolean;
  /** which map the NPC lives in (default town) */
  area?: 'CASTLE';
  /** talking to him settles AUDIENCE / KING_BOUNTY quests (store.reportToKing) */
  king?: boolean;
  /** gold crown on his head */
  crown?: boolean;
  /** floor height (standing on the dais) */
  y?: number;
}

export const NPCS: NpcDef[] = [
  {
    name: 'Mira', role: 'Guide', model: 'WIZARD', tint: '#fff1d6', scale: 1, prop: 'none', accent: '#ffd36a', home: [3.6, 5.4], ordered: true,
    talk: [
      ['Welcome to Aether Village, traveller! I am Mira. Let me show you the ropes.', 'Move with WASD or the left stick. Dash with Space (or the dash button) to slip through danger with a burst of speed.'],
      ['Your skills live on the keys 1, 2 and 3, or on the round skill buttons. R unleashes your ultimate once its gauge is full.', 'Potions are on Z and X. Mana refills over time, so do not hoard it.'],
      ['Combos are hit counts. Every hit you land adds one, and the chain breaks after about three seconds without a hit.', 'Every 10 hits adds a little bonus damage, up to a big chunk at the top. An ultimate at 50+ hits becomes a finisher!'],
      ['Tired of tapping? Open the pause menu and switch on "Auto skills": skills 1/2/3 and your ultimate cast themselves at nearby enemies.', 'Dashing always stays manual, so stay sharp. When you are ready, the gate in the south awaits.'],
    ],
    bubbles: ['Press E near anything glowing!', 'Ask me again for more tips. The gate is down the main road!', 'Skills 1, 2, 3 and R. Never forget R!'],
  },
  {
    name: 'Elder Tobin', role: 'Village Elder', model: 'BARBARIAN', tint: '#f1ece2', scale: 1, prop: 'none', accent: '#e6d3a0', home: [4.8, -2.2],
    talk: [
      ['Ah, a young adventurer. This well has fed our village for three hundred years.', 'The old tales say the Mire swallows the careless. Walk with care.'],
      ['My knees ache, but my memory is sharp. I remember when this valley had no gate at all.', 'Keep your potions stocked and your wits about you.'],
      ['Every hero starts as a stranger here. Take this, a little something from an old man.'],
    ],
    bubbles: ['Lovely day!', 'Back in my day the Mire was a meadow.', 'Mind the well, children.'],
    gift: { gold: 150, text: 'Elder Tobin presses a pouch into your hand. (+150 gold)' },
  },
  {
    name: 'Pip', role: 'Village Kid', model: 'ROGUE', tint: '#ffe0ea', scale: 1, prop: 'none', accent: '#ff9ac0', home: [-40.5, -36.5], speed: 2.6,   // hiding in the north-west corner behind the houses (knows the hermit's secret)
    talk: [
      ['Have you seen my cat? She is orange, and very rude.', 'Last time I saw her she ran off towards the plaza...'],
      ['When I grow up I will be a hero like you! Do you have a sword? Can I hold it?', 'No? Aww.'],
      ['Shh! The guard says monsters live beyond the gate. I want to see one. Just a little one.'],
    ],
    bubbles: ['Have you seen my cat?', 'Race you to the well!', 'Here kitty kitty...', 'I am NOT scared of the Mire.'],
  },
  {
    name: 'Brenna', role: 'Farmer', model: 'ARCHER', tint: '#e6f5cc', scale: 1, prop: 'basket', accent: '#9bd26a', home: [-14, 21.5], speed: 1.5,
    patrol: [[-14, 21.5], [-14, 26], [-14, 32], [-11, 26]],
    talk: [
      ['Mind the chickens, they have opinions. Good eggs though!', 'Here, take a potion. Fresh brewed, or so I am told.'],
      ['The harvest has been strange lately. The crops glow at night near the Grove.', 'Odd, but the carrots taste fine.'],
    ],
    bubbles: ['Cluck cluck, my darlings.', 'Fine weather for the harvest.', 'Strange lights near the Grove lately...'],
    gift: { item: 'potion_hp', qty: 1, text: 'Brenna hands you a healing potion. (+1 Health Potion)' },
  },
  {
    name: 'Garrick', role: 'Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#bcd0ff', home: [5, 34.8],
    talk: [
      ['Halt! ...Oh. It is you. Carry on.', 'The gate to the south leads out into the wilds. Step up to it and set out when you are ready.'],
      ['Nothing gets past me. Well, nothing except hens. And the Elder\'s cat.', 'Bring back something shiny, will you?'],
      ['Stock up at the potion shop before you set out. Heroes who forget potions tend to come back without their dignity.'],
    ],
    bubbles: ['Move along, citizens.', 'All quiet at the gate.', 'Beware the Mire...'],
  },
  {
    name: 'Lysa', role: 'Herbalist', model: 'WIZARD', tint: '#d9f7da', scale: 1, prop: 'basket', accent: '#7ee0a0', home: [-15, 8.4], speed: 1.4,
    patrol: [[-15, 8.4], [-34, 8.4]],   // strolls past the west shop row
    talk: [
      ['Moonpetal, ember root, a pinch of swamp moss... the Potion Shop pays well for the good stuff.', 'Do not forget to sell what you do not need.'],
      ['Mana potions taste like mint, health potions like regret. Drink them anyway.', 'Take this one, on the house.'],
    ],
    bubbles: ['Moonpetal, ember root...', 'Mana potions: now with mint!', 'Have you seen my cat? Ah, no, Pip\'s.'],
    gift: { item: 'potion_mana', qty: 1, text: 'Lysa slips a vial into your pack. (+1 Mana Potion)' },
  },
  {
    name: 'Dorn', role: 'Miner', model: 'BARBARIAN', tint: '#ecd2b4', scale: 1, prop: 'hammer', accent: '#ffb86a', home: [15, 8.4], speed: 1.5,
    patrol: [[15, 8.4], [34, 8.4]],     // walks past the warehouse / blacksmith / armor shop
    talk: [
      ['Out on the edges of the village you will find crystals and ore veins. Stand close and hold E to hit them.', 'They grow back after a while, and the shards are worth good coin.'],
      ['The blacksmith will turn what you dig into something sharp. Tell her Dorn sent you!'],
    ],
    bubbles: ['Hold E near an ore vein!', 'Rocks do not mine themselves.', 'My pickaxe is my best friend.'],
  },
  {
    name: 'Sera', role: 'Merchant', model: 'ROGUE', tint: '#e6d3ff', scale: 1, prop: 'none', accent: '#d9b0ff', home: [13.5, 1.8],
    talk: [
      ['Fine wares, rare finds! Alas, today I am only here for the fresh air.', 'The real shops are spread around: potions to the west, smithing to the east, the pet stable down south.'],
      ['Coins make the world go round, friend. Spend them well, save a few for the altar.'],
    ],
    bubbles: ['Fine wares! Fine wares!', 'Everything has a price.', 'Best prices in the valley!'],
  },
  {
    name: 'Fenn', role: 'Bard', model: 'ARCHER', tint: '#d3e5ff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [-28, 9], speed: 1.7,
    patrol: [[-28, 9], [-14, 9], [0, 9], [14, 9], [28, 9], [14, 11], [0, 11], [-14, 11], [-28, 11]],
    talk: [
      ['La la laaa... oh, an audience! I am working on a ballad about the Mire Hydra.', 'So far it goes: "Run." Needs work.'],
      ['They say the Frostpeak winds sing at midnight. I shall go listen, once I find a braver bard.'],
    ],
    bubbles: ['La la laaa~', 'Beware the Mire... it rhymes with nothing!', 'Anyone have a lute string?'],
  },
  {
    name: 'Wren', role: 'Scholar', model: 'WIZARD', tint: '#d7e0ff', scale: 1, prop: 'staff', accent: '#a9b8ff', home: [-8, -11.2],
    talk: [
      ['The Aether Altar in the north-west answers wishes with fortune. Offer it gems and see who answers.', 'The Skill Trainer in the north-east will sharpen what you already know.'],
      ['Knowledge is the sharpest weapon. And a very good staff, if I may say.'],
    ],
    bubbles: ['Fascinating...', 'The Altar hums tonight.', 'Spend your skill points!'],
  },
  {
    name: 'Hodge', role: 'Bounty Clerk', model: 'KNIGHT', tint: '#ffe8c7', scale: 1, prop: 'none', accent: '#ffcf70', home: [4.5, -12], speed: 1.5, quest: true,
    patrol: [[4.5, -12], [8, -6.4], [-8, -6.4], [-4.5, -12], [-8, -6.4], [8, -6.4]],   // there and back (never across the castle path planters)
    talk: [
      ['Bounties, bounties... the Quest Board north of the plaza is full of them. Slay monsters, earn gold.', 'Come back and claim the reward when you are done.'],
      ['I keep the ledgers straight, and the heroes honest. Check the Quest Board every day for new work.'],
    ],
    bubbles: ['Fresh bounties on the board!', 'Hero wanted: apply within.', 'So much paperwork...'],
  },
  {
    name: 'Maeve', role: 'Gossip', model: 'WIZARD', tint: '#f0e8f7', scale: 1, prop: 'staff', accent: '#e8d0ff', home: [19, 9], speed: 1.2,
    patrol: [[19, 9], [30, 9], [24, 11], [17, 11]],
    talk: [
      ['I heard the Ember Wastes are so hot the goblins carry parasols. True story.', 'Do not tell Tobin I told you.'],
      ['Hodge fancies the herbalist. Everyone knows. Except Hodge. And Lysa.'],
    ],
    bubbles: ['Did you hear?', 'Lovely day!', 'Beware the Mire... or so they say.'],
  },
  // ------------------------------------------------------------ castle (throne hall, see castleData.ts)
  {
    name: 'King Aldric', role: 'King of Aether', model: 'KNIGHT', tint: '#ffe7a6', scale: 1.15, prop: 'none', accent: '#ffd36a', home: [0, -15.2], y: 0.6, area: 'CASTLE', king: true, crown: true, ordered: true,
    talk: [
      ['Rise, hero. The crown has heard your name whispered in the market and in the barracks alike.', 'Aether was a green kingdom once. Then the Mire woke, and the old guardians stirred in their sleep.'],
      ['Beyond the gate lie six realms, each ruled by a beast older than my house. Greenwood, the Mire, the Ember Wastes, Frostpeak... each deeper than the last.', 'Be wary of the elite ones: they hit harder, but they hoard the finest spoils.'],
      ['A king hears much. The Void Herald is said to wait at the bottom of the world, and the Lich haunts the halls in between.', 'Gather your strength before you descend. Forge, enchant, and never walk into the dark with empty potion belts.'],
      ['The Quest Board in the square carries the people\'s requests. Mine are rarer, and they pay in gems.', 'Take an audience-bounty or a royal commission, finish the deed, and report back to me in person.'],
      ['My grandfather sealed the Aether Altar to keep its fortune from the greedy. Spend your gems there wisely, and it may smile on you.', 'Go now. Aether is counting on its heroes.'],
    ],
    bubbles: ['Aether endures.', 'Hmm... the realm weighs heavy.', 'Speak, if you have a deed to report.'],
  },
  {
    name: 'Captain Roan', role: 'Royal Guard', model: 'KNIGHT', tint: '#c9d6ff', scale: 1.05, prop: 'spear', accent: '#bcd0ff', home: [-4.6, -11.2], area: 'CASTLE',
    talk: [
      ['Keep your voice down in the presence of His Majesty. And your hands off the carpet.', 'The King receives heroes who have proven themselves. You are welcome.'],
      ['Twenty years at this post. Not once has anyone sneaked past me. Not once. Do not ask about the kitchen.'],
    ],
    bubbles: ['Eyes forward.', 'All quiet.', 'Long live the King.'],
  },
  {
    name: 'Guard Tamsin', role: 'Royal Guard', model: 'KNIGHT', tint: '#c9d6ff', scale: 1.05, prop: 'spear', accent: '#bcd0ff', home: [4.6, -11.2], area: 'CASTLE',
    talk: [
      ['Standing still all day is harder than any monster. My feet are just two painful rumours.', 'The King is kind though. He asks after our families.'],
      ['If you are going out beyond the gate, bring back something shiny for the throne room. The steward keeps complaining it is drab.'],
    ],
    bubbles: ['My feet...', 'Do not touch the throne.', 'Is it lunch yet?'],
  },
  {
    name: 'Steward Maren', role: 'Royal Steward', model: 'WIZARD', tint: '#e8d6ff', scale: 1, prop: 'none', accent: '#d9b0ff', home: [-4.6, 11], speed: 1.3, area: 'CASTLE',
    patrol: [[-4.6, 11], [-4.6, -8], [-4.6, 11], [-5, 2]],
    talk: [
      ['The King prefers royal bounties handled in person: an audience to start, then reports once the deed is done.', 'Find them on the Quest Board, hero. They pay in gems.'],
      ['I keep the household ledgers. Do you know how many candles a throne room eats in a week? Do not ask.'],
    ],
    bubbles: ['So many candles...', 'The ledgers will not balance themselves.', 'Mind the carpet, please!'],
  },
  {
    name: 'Lady Isolde', role: 'Noble of the Court', model: 'ROGUE', tint: '#ffd0e0', scale: 1, prop: 'none', accent: '#ff9ac0', home: [8.6, 10], area: 'CASTLE',
    talk: [
      ['Oh, a real adventurer, here among the velvet and the dust! Tell me, are the monsters as ugly as they say?', 'Never mind, do not answer. I shall imagine.'],
      ['His Majesty is fond of heroes who bring him good news. Shall I tell you a secret? He is terrible at cards.'],
    ],
    bubbles: ['Such a lovely hall.', 'Heroes! How thrilling.', 'The wine is excellent today.'],
  },
  {
    name: 'Old Wend', role: 'Hermit', model: 'ROGUE', tint: '#c9b79a', scale: 1, prop: 'staff', accent: '#e6c27a', home: [2.2, -50.2],
    talk: [
      ['Hm? A visitor? Nobody finds old Wend out here, behind the walls. The fire keeps the Mire damp away.', 'I have no use for coin, but you do. Take it, and do not tell the Elder.'],
      ['The walls keep the world out, and the world is where the best mushrooms grow. Funny, that.', 'Stay for the fire if you like. I only ask you leave the bedroll alone.'],
      ['Some nights the Frostpeak wind carries singing over the wall. I think it is the bard, lost again.'],
    ],
    bubbles: ['Crackle, crackle...', 'Mushrooms for supper.', 'Who goes there?'],
    gift: { once: 'aether-survivor-hermit-v1', gold: 1000 /* x GOLD_SCALE = 10,000 */, text: 'Old Wend drops a heavy sack into your hands. (+10,000 gold)' },
  },
];

export const GENERIC_BUBBLES = ['Lovely day!', 'Beware the Mire...', 'Good luck out there!', 'Stay safe, hero.', 'Is that the hero?'];

export interface AnimalDef { kind: 'CHICKEN' | 'CAT'; x: number; z: number; rx: number; rz: number; speed: number; tint: string }
export const ANIMALS: AnimalDef[] = [
  // wander ellipses stay well inside the fenced pen
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#f1d7a0' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.2, tint: '#e0a070' },
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#ffffff' },
  { kind: 'CAT', x: -24, z: 11, rx: 4, rz: 1.2, speed: 1.9, tint: '#ff9a4a' },
  { kind: 'CAT', x: 12.5, z: 3.4, rx: 1.8, rz: 0.9, speed: 1.7, tint: '#8a8a96' },
];
