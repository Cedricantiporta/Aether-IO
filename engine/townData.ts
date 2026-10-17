// ============================================================================
// Town layout + NPC cast (pure data, no three / no React). Read by:
//  * engine/mapgen.ts          -> ISLAND_BOXES (small island shape)
//  * engine/systems/village.ts -> colliders, gate position, harvest nodes, NPC pills
//  * engine/systems/npcs.ts    -> NPC / animal behaviour
//  * render/TownScenery.tsx + render/Npcs.tsx -> drawing
// Coordinates are world x / z. A building's door faces +z at rot = 0 (facing vector = (sin rot, cos rot)).
//
// Layout (compact ~60% footprint, functional buildings spread out on their own spots):
//   spawn / plaza (0, 2) -> north: castle path, Quest Board (7.5,-13), Skill Trainer (-10.5,-19) on the open paving west of
//   the castle steps (in front of the dark-roofed house at (-19.5,-14))
//   west of the plaza Fortune Teller (-21, 1.5) / Pet Stable (-30, 2), east Blacksmith (27, 2), gate (0, 38) at the end of the
//   main road. Outside the gate: a wide meadow, the Elixir Brewer's hut out in the west meadow (constants SHOP_POSITIONS
//   'BREWER'), the wheat field east of the road beside the barn (FARM), the barn / coop clearing further east, the Adventure Portal at the road's end.
//   Houses / stalls are decoration. Harvest nodes sit on the outskirts.
// ============================================================================
import { QUEST_POS, SHRINE_POS, TRAINER_POS } from './world';
import { BEACH_BOX, BEACH, onDeckRect, beachWobble, mainBeachK, MAIN_BEACH, mainShoreOff, lakeSouthZ } from './beachData';

export interface HouseSpec { x: number; z: number; rot: number; w: number; d: number; floors: 1 | 2; wall: string; roof: string; trim: string; chimney: boolean; door: string }
export interface StallSpec { x: number; z: number; rot: number; c1: string; c2: string; goods: 0 | 1 | 2 | 3 }
export interface RoadSpec { x1: number; z1: number; x2: number; z2: number; w: number; /** a trodden dirt path along its whole length (outside the walls; any angle) */ dirt?: boolean }
export interface SignSpec { x: number; z: number }

export const GATE = { x: 0, z: 38 };
export const PLAZA = { x: 0, z: 2, r: 6.5 };
/** The Adventure Portal: an ancient stone gate in a forest clearing at the end of the road south of the town gate.
 *  Runs start here (the town gate is just a gate). `front` = where the hero stands to step in. */
// ---- the outskirts (owner: Mondstadt-like): the walled town + a small green in front of the gate sit north of a river
// that runs west into the lake (the sea); one long cobblestone bridge crosses it to the mainland (farm, fields, windmill,
// the Endless Tower and the Adventure Portal), about 34 units further south than the old meadow.
/** The river south of the gate (water band; banks are colliders, the bridge is the only crossing west of its east end). */
export const RIVER = { x0: -72, x1: 125, z0: 61, z1: 75 };   // (owner: runs on east out past the island edge; was x1 50)
const sstepT = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** True on open water in the town (the lake west of the walls / beach, the river; not the bridge or a pier deck). The
 *  island edge is a polar outline, so long clearings far out (the Endless Tower's) widen it over the water: the player
 *  movement refuses water steps with this (engine/systems/player.ts). Mirrors render/terrainFn lakeK / riverK. */
export function isTownWater(x: number, z: number): boolean {
  if (onDeckRect(x, z) >= 0) return false;
  if (Math.abs(x) <= BRIDGE.hw + 0.8 && z > BRIDGE.z0 - 1 && z < BRIDGE.z1 + 1) return false;
  if (onMineBridge(x, z, 0.4)) return false;
  if (x >= RIVER.x0 - 30 && x <= RIVER.x1 && z > riverBank(x, 0) + 0.3 && z < riverBank(x, 1) - 0.3) return true;
  if (x < LAKE.x1 && z > LAKE.z0 && z < lakeSouth(x) - 3) {
    const bk = sstepT(BEACH.z0 - 11, BEACH.z0 - 2, z) * sstepT(BEACH.z1 + 9, BEACH.z1 + 1, z), mk = mainBeachK(z), sx = LAKE.x1 + (BEACH.shoreX + beachWobble(z) - LAKE.x1) * bk - mainShoreOff(z) * mk;
    if (x < sx - 1.2) return true;
  }
  return false;
}
/** The river's banks (owner: rounded, a bit irregular, not straight): z of the north (side 0) / south (side 1) bank at x.
 *  Gentle waves of up to ~2.3 units, straight under the bridge, and the banks close round at the east end (the spring). */
export function riverBank(x: number, side: 0 | 1): number {
  const k = Math.min(1, Math.max(0, (Math.abs(x) - 7) / 7));   // (straight near the bridge)
  const w = (Math.sin(x * 0.105 + side * 2.3) * 1.5 + Math.sin(x * 0.29 + side * 4.7 + 1) * 0.8) * k;
  const z = side ? RIVER.z1 + w : RIVER.z0 + w;
  const t = Math.min(1, Math.max(0, (RIVER.x1 - x) / 8));       // round east end: the banks meet at x1
  const c = (RIVER.z0 + RIVER.z1) / 2;
  return c + (z - c) * Math.sqrt(1 - (1 - t) * (1 - t));
}
/** (owner) a plank footbridge where the mine path crosses the river (deck arches up to h; railings are colliders). */
export const MINE_BRIDGE = (() => { const x = 58.6; return { x, hw: 1.7, z0: riverBank(x, 0) - 1.4, z1: riverBank(x, 1) + 1.4, h: 0.55 }; })();
export const onMineBridge = (x: number, z: number, m = 0): boolean => Math.abs(x - MINE_BRIDGE.x) <= MINE_BRIDGE.hw + m && z > MINE_BRIDGE.z0 - m && z < MINE_BRIDGE.z1 + m;
/** The great cobblestone bridge over the river (walkable deck arching up to h; railings are colliders). */
export const BRIDGE = { hw: 4.2, z0: 57.5, z1: 78.5, h: 1.6 };
export const PORTAL = { x: 5, z: 152, r: 6.5, front: { x: 5, z: 148.6 } };   // (owner) deep in the forest past the hamlets, in a horseshoe of trees at the end of a bending road   // (front = on top of the platform, before the arch)
/** Well on a grass patch (not on the plaza or a road). */
export const WELL_POS = { x: -21, z: 18 };
export const PEN = { x: -22, z: 27, hw: 5, hd: 3 };
/** Fenced wheat field in front of the gate (outside the walls), east of the road beside the barn (the gap in its fence faces the road). */
export const FARM = { x: 18, z: 94, hw: 7, hd: 6 };   // east of the road, beside the barn (cows graze just east of it)
/** The Elixir Brewer's hut (the shop itself is SHOP_POSITIONS 'BREWER' in constants.ts): out in the west meadow, west of the road, door facing it. */
export const BREWER_HUT = { x: -15.6, z: 107.6, rot: Math.PI / 2 };   // (owner: near the Adventure Portal; west of the mainland road, door facing it)
/** Farm buildings outside the gate (barn: cows graze beside it; coop: egg nests in front). */
export const BARN = { x: 35, z: 94 };   // in the farm clearing east of the field, well away from the town walls
export const COOP = { x: 38, z: 105.5 };   // back of the farm clearing, against the forest edge
/** Egg nests in front of the coop (hold nothing; E collects an egg when one is laid, see village.ts). */
export const NESTS: [number, number][] = [[COOP.x - 2.3, COOP.z - 1.8], [COOP.x - 2.6, COOP.z + 0.1], [COOP.x - 2.3, COOP.z + 2]];   // (the coop faces west like the barn)
/** Where Pip's cat Biscuit hides (only there while the quest is active). */
export const HIDDEN_CAT = { x: 40.5, z: -36.5 };
/** Corin's lost wheel pin, in the grass by the haystack (only there while his quest needs it). */
export const WHEEL_PIN = { x: FARM.x - 6.4, z: FARM.z - 7.6 };
/** The Endless Tower: a tall stone tower in the forecourt west of the road (door faces the road, +x). */
/** The Endless Tower: deep in the south-west forest at the end of a long, narrow clearing (owner: deeper in), on a raised
 *  knoll (townLift TOWER_KNOLL). The Elixir Brewer keeps her hut on the path just before it. */
export const TOWER = { x: -74, z: 112, r: 4.2, door: { x: -69, z: 112 } };
export const TOWER_KNOLL = { r: 9, ramp: 8, h: 1.8 };
/** Height of the Endless Tower's knoll at (x, z) (0 off it): the hero (townLift) and the ground mesh (render/terrainFn) both use it. */
export function towerKnollAt(x: number, z: number): number {
  const td = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (td >= TOWER_KNOLL.r + TOWER_KNOLL.ramp) return 0;
  const k = Math.min(1, (TOWER_KNOLL.r + TOWER_KNOLL.ramp - td) / TOWER_KNOLL.ramp);
  return TOWER_KNOLL.h * k * k * (3 - 2 * k);
}
/** Walkable island = union of axis-aligned boxes [x0, z0, x1, z1], all containing the origin (mapgen turns them into a polar edge). */
/** Lake west of the town wall (not walkable: the island edge stops just past the wall). */
export const LAKE = { x0: -170, x1: -49.5, z0: -95, z1: 85, shore: 7 };
/** (owner) the lake's southern shore (by the mainland beach / Endless Tower) is wavy, not a straight line: z of the shore at x. */
export const lakeSouth = (x: number): number => lakeSouthZ(x, LAKE.z1);

export const ISLAND_BOXES: [number, number, number, number][] = [
  [-48.5, -54, 56.5, 56], // walled town + a NARROW trail outside the walls on the back / east (the west side is the lake)
  [-9, -58.5, 9, 0],    // the hermit's clearing behind the north wall (Old Wend's camp, HERMIT_CAMP)
  [-10, -2, 68, 58],    // the wide east side south of the trail: the mining camp at the Crystal Cave (caveData CAVE_BAY) + the way to the farm
  [0, 0, 64, 112],      // the strip east of the farm: the dirt path from the chicken coop up to the mines (round the river's east end)
  [-46, -10, 46, 60],   // the green in front of the gate (brewer's hut, the path to the beach), up to the river
  [-45, -10, 56, 132],  // the mainland across the river (farm, fields, windmill, the Adventure Portal)
  [-18, -10, 28, 168],   // (owner) the forest road south past the hamlets to the Adventure Portal's clearing
  [-86, 103, -40, 121],  // the long clearing west into the deep forest: the Elixir Brewer and the Endless Tower at its end
  BEACH_BOX,            // the lakeside beach outside the west wall (southern half only; engine/beachData.ts)
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
  { x: 57.6, z: 25, rot: 0.3, kind: 1 } /* (moved off the cave bay mouth, see caveData) */, { x: 57.5, z: -4.5, rot: 0, kind: 0 }, { x: 55.5, z: -16, rot: 1.2, kind: 0 } /* (moved off the trail: it blocked the way to Old Wend) */, { x: 54.6, z: -28, rot: -1.4, kind: 2 },
  { x: 47, z: -47.5, rot: 0.8, kind: 1 }, { x: 34, z: -51, rot: 0.1, kind: 0 }, { x: 26, z: -44.4, rot: -0.1, kind: 1 }, { x: 16.5, z: -51.5, rot: 0.2, kind: 2 },
  { x: 9, z: -45, rot: 0, kind: 0 },
];
/** Big boulders along the narrow back trail (x, z, collider r, render scale): a rocky, half-blocked way round to the hermit,
 *  always leaving a gap (walk grid checked). Drawn by render/TownScenery (merged rock meshes). */
export const TRAIL_ROCKS: [number, number, number, number][] = [
  [59.2, -5.2, 2.3, 2.6], [61.5, -2.8, 1.4, 1.6],          // the corner where the wide camp narrows into the trail
  [53.4, -9.5, 1.5, 1.8], [54.6, -21.5, 1.6, 1.9], [53.6, -34.5, 1.6, 1.9],
  [54.2, -49, 2.3, 2.6], [51.5, -52, 1.5, 1.8],            // round the north-east corner tower
  [39, -49.8, 1.6, 1.9], [30.5, -44.2, 0.9, 1.1], [21.5, -50.2, 1.4, 1.7],
  [-13.5, -50.2, 1.5, 1.8], [-21, -44.6, 0.9, 1.1], [-27.5, -50.4, 1.7, 2.0], [-38, -48.8, 1.9, 2.2], [-44, -51.5, 1.6, 1.9],
];
/** (owner) the rockfall from the south-east wall tower down to the river: until Erin's quest chain is done (the boulders are
 *  frozen and split, npcQuests 'erin_frost' turned in) the green in front of the gate is no shortcut to the mines - the way
 *  there is over the bridge, past the farm and up the fenced mine path. Drawn by render/Rockfall, colliders in village.ts. */
export const ROCKFALL: [number, number, number, number][] = [
  [48.2, 41.8, 2.5, 2.9], [49.2, 45.9, 2.4, 2.8], [49.8, 50.1, 2.5, 2.9], [50.4, 54.3, 2.4, 2.8], [51.0, 58.4, 2.5, 2.9],
];
/** Erin's chain is done: the rockfall is gone (takes the store's npcQuests). */
export const rockfallCleared = (nq: { q: Record<string, { s: number }> } | undefined): boolean => nq?.q?.erin_frost?.s === 2;
/** Monsters on the hermit path (leashed near their spot; respawn a minute after dying). */
export const TOWN_MONSTERS: { kind: 'SLIME' | 'GOBLIN' | 'BOAR' | 'BRUTE' | 'BANDIT'; x: number; z: number }[] = [];   // (removed: no monsters outside town)
export const CASTLE = { x: 0, z: -32.5, w: 20, d: 11, h: 9 };
/** Raised stone terrace in front of the keep (h above the town paving), reached by a wide flight of stairs in the middle
 *  of its front edge (x +-stairHw, from z1 down to stairZ). The keep stands on it. */
export const TERRACE = { x0: -11, x1: 11, z0: -27.5, z1: -19, h: 1.2, stairHw: 3.5, stairZ: -15.6 };
/** Ground height at (x, z) in the town (the terrace + its stairs; 0 elsewhere). */
export function townLift(x: number, z: number): number {
  // the bridge deck: a gentle arch over the river
  if (Math.abs(x) <= BRIDGE.hw + 0.6 && z > BRIDGE.z0 && z < BRIDGE.z1) { const t = (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0); return BRIDGE.h * (1 - (2 * t - 1) ** 2); }
  if (onMineBridge(x, z, 0.3)) { const t = (z - MINE_BRIDGE.z0) / (MINE_BRIDGE.z1 - MINE_BRIDGE.z0); return MINE_BRIDGE.h * (1 - (2 * t - 1) ** 2); }
  // the Endless Tower's knoll (a raised mound; the path ramps up to the door)
  { const kn = towerKnollAt(x, z); if (kn > 0) return kn; }
  // the Adventure Portal's round stepped platform (tiers r 8 / 6.9 / 5.6 up to 1.2; render/Town buildPortalGeo)
  const pd = Math.hypot(x - PORTAL.x, z - PORTAL.z);
  if (pd < 8.4) return Math.min(1.2, Math.max(0, (8.4 - pd) / 2.6) * 1.2);
  const T = TERRACE;
  if (x < T.x0 || x > T.x1 || z > T.stairZ || z < T.z0 - 12) return 0;
  if (z <= T.z1) return T.h;
  if (Math.abs(x) <= T.stairHw) return T.h * (T.stairZ - z) / (T.stairZ - T.z1);
  return 0;
}
/** Landmarks (owner: "more structure, not more houses"). Doors face +z at rot 0 like the houses.
 *  CHURCH: the chapel west of the keep (enterable, see churchData); TAVERN: the Golden Tankard east of the keep;
 *  WINDMILL: on the meadow by the south-east wall tower; STATUE: the founder's statue in the middle of the plaza. */
export const CHURCH = { x: -27, z: -27.5, w: 9, d: 14, rot: 0 };
/** (owner) the adventurer's own little house in the south-west corner of the walls, door facing the town (enterable:
 *  the HOME area, engine/homeData.ts). */
export const HERO_HOUSE = { x: -39.6, z: 33.2, w: 4.4, d: 3.8, rot: Math.PI, wake: { x: -39.6, z: 29.4 } };
export const TAVERN = { x: 28, z: -21, w: 9.5, d: 7, rot: 0 };
export const WINDMILL = { x: 38, z: 81, r: 3.4 };
/** Extra crop fields on the mainland (fenced, drawn by TownScenery): wheat / cabbages / pumpkins. */
export interface FieldSpec { x: number; z: number; hw: number; hd: number; crop: 'WHEAT' | 'CABBAGE' | 'PUMPKIN' }
export const FIELDS: FieldSpec[] = [
  { x: 18, z: 81.6, hw: 7, hd: 3, crop: 'CABBAGE' },
  { x: -22, z: 89, hw: 7, hd: 4.5, crop: 'WHEAT' },
  { x: -22, z: 100.5, hw: 7, hd: 3.8, crop: 'PUMPKIN' },
];
export const STATUE = { x: 0, z: 2, r: 2.1 };
/** The old graveyard on the strip between the chapel and the west wall (owner): fenced, a path through the middle from
 *  the chapel's side door (east gate) to the crypt at the west end, gravestones in four blocks, a dead tree, lanterns. */
export const GRAVEYARD = { x0: -43.4, x1: -32.8, z0: -39.6, z1: -21, pathZ: -31.5, gateX: -38 };
export const CRYPT = { x: -41.6, z: -31.5 };
/** Gravestones [x, z, kind] (0 slab, 1 cross, 2 rounded). */
export const GRAVES: [number, number, number][] = (() => {
  const g: [number, number, number][] = [];
  let k = 0;
  for (const z of [-37.6, -35.2, -27.6, -25.2]) for (const x of [-39.8, -37.7, -35.6]) { g.push([x + (k % 3 === 1 ? 0.25 : 0), z, k % 3]); k++; }
  return g;
})();
/** The chapel's side door (west wall) into the graveyard; town side spot + interact radius. */
export const CHAPEL_SIDE = { x: CHURCH.x - CHURCH.w / 2 - 1.5, z: CHURCH.z - 4, r: 2.6 };
/** Seats (benches) the hero can sit on in the town: x, z, facing yaw (the way a seated hero looks), seat height. */
export interface SeatSpec { x: number; z: number; yaw: number; y: number }
export const TOWN_SEATS: SeatSpec[] = [
  { x: 8.9, z: 2, yaw: -Math.PI / 2, y: 0.55 }, { x: -8.9, z: 2, yaw: Math.PI / 2, y: 0.55 },   // the plaza, facing the statue
  { x: CHURCH.x + CHURCH.w / 2 - 0.6, z: CHURCH.z + CHURCH.d / 2 + 2.0, yaw: 0, y: 0.55 },     // in front of the chapel (its yard bench)
  { x: -36, z: -22.3, yaw: Math.PI, y: 0.55 },                                                  // the graveyard, looking over the graves
  { x: 14.5, z: 12.3, yaw: Math.PI, y: 0.55 }, { x: -14.5, z: 12.3, yaw: Math.PI, y: 0.55 },     // south street, facing the shops
  { x: -6.5, z: 46, yaw: -Math.PI / 2, y: 0.55 }, { x: 6.5, z: 46, yaw: Math.PI / 2, y: 0.55 },   // the meadow, both sides facing the road
  // (owner) benches on the green looking out over the river (yaw 0 = facing south), two of them in the little east park
  ...[-30, -20, 17.5, 26.5, 35].map((x) => ({ x, z: riverBank(x, 0) - 3.2, yaw: 0, y: 0.55 })),
];

export const HOUSES: HouseSpec[] = [
  // the farm outside the gate: a big red barn by the road and a little chicken coop
  { x: BARN.x, z: BARN.z, rot: -Math.PI / 2, w: 7.5, d: 6, floors: 1, wall: '#9a3a2a', roof: '#3b2a20', trim: '#f4ead2', chimney: false, door: '#5a3a1e' },
  { x: COOP.x, z: COOP.z, rot: -Math.PI / 2, w: 3.2, d: 2.4, floors: 1, wall: '#c9a070', roof: '#4a3426', trim: '#f4ead2', chimney: false, door: '#6e4b2b' },
  // the hamlet on the meadow west of the coop, beside the portal (doors facing the farm track)
  H(13, 121, Math.PI, 5.2, 4.4), H(23, 123.5, Math.PI, 5.6, 4.6, 2), H(32, 119.5, Math.PI, 4.8, 4.2),
  // (owner: more houses right of the portal) a second little hamlet west of the portal, doors facing the tower path
  H(-13.5, 121, Math.PI, 5.2, 4.4), H(-23.5, 124, Math.PI, 5.4, 4.6, 2), H(-33, 120, Math.PI, 4.8, 4.2), H(-42, 125, Math.PI, 4.6, 4),
  // (owner) the adventurer's house (HERO_HOUSE): small, one floor, a warm red door
  { x: HERO_HOUSE.x, z: HERO_HOUSE.z, rot: HERO_HOUSE.rot, w: HERO_HOUSE.w, d: HERO_HOUSE.d, floors: 1, wall: '#e9dfc8', roof: '#4a3426', trim: '#6e4b2b', chimney: true, door: '#8a2f22' },
  // flanking the castle
  H(18.5, -28.5, 0, 5.0, 4.4),
  // east end of the north street, door facing the street
  // (south of the east-west street: the Potion Shop and Armor Shop buildings, see constants SHOP_POSITIONS)
  // the old shop lots on the street now hold houses
  H(-37, 1.5, 0, 4.8, 4.2), H(36.5, 1.5, 0, 4.8, 4.2),   // (owner: the west lots now hold the Pet Stable (-30) + Fortune Teller (-21); a market stall by the plaza)
  // along the road to the gate
  H(-9, 30, Math.PI / 2, 4.6, 4.2), H(9, 31.5, -Math.PI / 2, 5.0, 4.4, 2),
  // outskirts
  H(-34, 19, Math.PI / 2, 4.6, 4.0), H(34, 19, -Math.PI / 2, 5.0, 4.4, 2),
  H(24, 22, 0, 5.2, 4.4, 2),   // where the pet stable used to be
  // north street ends, facing the street (west end north of the potion shop, east end north of the warehouse)
  H(-33, -9, 0.5, 5.0, 4.4, 2), H(33, -10, -0.5, 4.8, 4.2),
];

/** Decorative market stalls (the useful shops are Supplies / Blacksmith / Pets). */
export const STALLS: StallSpec[] = [
  { x: 11.5, z: -1, rot: -Math.PI / 2, c1: '#efe8d8', c2: '#efe8d8', goods: 1 },
  { x: -12.5, z: 1.5, rot: 0, c1: '#efe8d8', c2: '#efe8d8', goods: 1 },   // the old fortune teller lot by the plaza
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
  { x1: 0, z1: 8, x2: 0, z2: BRIDGE.z0 + 0.3, w: ROAD_W.main },   // main avenue plaza -> gate -> the bridge
  { x1: -38, z1: 10, x2: 38, z2: 10, w: ROAD_W.street },         // south street
  { x1: -27, z1: -6, x2: 18, z2: -6, w: ROAD_W.street },         // north street (on west to the chapel)
  { x1: 0, z1: 26.5, x2: 25.1, z2: 26.5, w: ROAD_W.street },   // east lane (old pet stable spot, now a house)
  { x1: -11.6, z1: 10, x2: -11.6, z2: 14.6, w: ROAD_W.branch },   // potion shop door (shop faces north onto the street)
  { x1: -30.9, z1: 10, x2: -30.9, z2: 4.5, w: ROAD_W.branch },   // pet stable door
  { x1: -21, z1: 10, x2: -21, z2: 4.5, w: ROAD_W.branch },   // fortune teller door
  { x1: 25.4, z1: 10, x2: 25.4, z2: 4.5, w: ROAD_W.branch },     // blacksmith door
  { x1: 19.5, z1: 10, x2: 19.5, z2: 5.2, w: ROAD_W.branch },     // warehouse barn doors
  { x1: 0, z1: -6, x2: 0, z2: TERRACE.stairZ + 0.3, w: ROAD_W.branch + 0.6 },     // castle path (to the terrace stairs)
  { x1: CHURCH.x, z1: -6, x2: CHURCH.x, z2: CHURCH.z + CHURCH.d / 2 + 0.4, w: ROAD_W.branch + 0.6 },   // chapel door
  { x1: TAVERN.x, z1: -12.5, x2: TAVERN.x, z2: TAVERN.z + TAVERN.d / 2 + 0.4, w: ROAD_W.branch },   // tavern door
  { x1: 18, z1: -12.5, x2: TAVERN.x + 1.4, z2: -12.5, w: ROAD_W.branch },   // lane from the north street end to the tavern
  { x1: 7.5, z1: -6, x2: 7.5, z2: -11.6, w: ROAD_W.branch },     // quest board
  { x1: 14.6, z1: 10, x2: 14.6, z2: 14.6, w: ROAD_W.branch },     // armor shop door
  { x1: -37.9, z1: 10, x2: -37.9, z2: 4.5, w: ROAD_W.branch },   // west house door
  { x1: TRAINER_POS[0], z1: -6, x2: TRAINER_POS[0], z2: TRAINER_POS[2] + 2.4, w: ROAD_W.branch }, // skill trainer (west of the castle terrace)
  { x1: 0, z1: FARM.z, x2: FARM.x - FARM.hw + 0.6, z2: FARM.z, w: ROAD_W.branch },   // farm gate (the field's west side, facing the road)
  { x1: 0, z1: TOWER.z, x2: TOWER.door.x, z2: TOWER.z, w: 1.8 },   // endless tower door (a narrow woodland path)
  { x1: 0, z1: BRIDGE.z1 - 0.3, x2: 0, z2: 128, w: ROAD_W.main - 0.6 },   // across the bridge, on through the mainland past the hamlets
  { x1: 0, z1: 128, x2: 3.6, z2: 137, w: ROAD_W.main - 0.6 }, { x1: 3.6, z1: 137, x2: PORTAL.x, z2: PORTAL.front.z - 3, w: ROAD_W.main - 0.6 },   // (owner) bending into the forest to the Adventure Portal
  // meadow -> lakeside beach: west past the Elixir Brewer's hut and the hay cart, round the south-west corner tower to the boardwalk
  { x1: -2.5, z1: 52, x2: -19, z2: 52.2, w: 2.6, dirt: true }, { x1: -19, z1: 52.2, x2: -36, z2: 53, w: 2.6, dirt: true }, { x1: -36, z1: 53, x2: -46.5, z2: 47.2, w: 2.6, dirt: true },
  // (owner) the old miners' road: east across the green to the rockfall (Erin's boulders), then on up to the mining camp
  { x1: 2.5, z1: 48.6, x2: 26, z2: 48.6, w: 2.4, dirt: true }, { x1: 26, z1: 48.6, x2: 45.4, z2: 48.6, w: 2.4, dirt: true },
  { x1: 45.4, z1: 48.6, x2: 53, z2: 48.2, w: 2.4, dirt: true }, { x1: 53, z1: 48.2, x2: 57, z2: 39.5, w: 2.4, dirt: true }, { x1: 57, z1: 39.5, x2: 62.5, z2: 21, w: 2.4, dirt: true },
  // the farm track: from the forest road behind the farm, east past the coop nests, up to the mine path (owner: connect it)
  { x1: 2.4, z1: 110.6, x2: 24, z2: 111.2, w: 2.6, dirt: true }, { x1: 24, z1: 111.2, x2: 43, z2: 111, w: 2.6, dirt: true }, { x1: 43, z1: 111, x2: 48.5, z2: 100.5, w: 2.6, dirt: true },
  // the mines path: from the farm track's corner up the strip east of the farm, along the east side into the mining camp (owner: no branch to the coop)
{ x1: 48.5, z1: 100.5, x2: 54, z2: 91, w: 2.6, dirt: true }, { x1: 54, z1: 91, x2: 58, z2: 79, w: 2.6, dirt: true },
  { x1: 58, z1: 79, x2: 59.5, z2: 60, w: 2.6, dirt: true }, { x1: 59.5, z1: 60, x2: 60, z2: 33, w: 2.6, dirt: true }, { x1: 60, z1: 33, x2: 62.5, z2: 21, w: 2.6, dirt: true },
  // inside the camp: on to the mine mouth, and the narrow back trail coming down from the north
  { x1: 62.5, z1: 21, x2: 66.5, z2: 15.2, w: 2.6, dirt: true }, { x1: 66.5, z1: 15.2, x2: 70.4, z2: 12.8, w: 2.6, dirt: true },
  { x1: 50.6, z1: -8, x2: 55.5, z2: 3.5, w: 2.2, dirt: true }, { x1: 55.5, z1: 3.5, x2: 62.5, z2: 13, w: 2.2, dirt: true },
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
  // the graveyard: south side (gap at the gate), east side (gap at the chapel's side door)
  [-43.4, -21, -39.4, -21], [-36.6, -21, -32.8, -21], [-32.8, -21, -32.8, -29.8], [-32.8, -33.2, -32.8, -39.6],
  // farm field south of the gate, east of the road (gap in the west side, facing the road)
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z - FARM.hd], [FARM.x - FARM.hw, FARM.z + FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x + FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x - FARM.hw, FARM.z - 1.5], [FARM.x - FARM.hw, FARM.z + 1.5, FARM.x - FARM.hw, FARM.z + FARM.hd],   // gap on the road side (west)
  // (owner, red lines) the road from the bridge up to the cross paths, both sides; nothing on toward the portal
  [-3.4, 78.5, -3.4, BREWER_HUT.z - 2.2], [-3.4, BREWER_HUT.z + 2.2, -3.4, TOWER.z - 2],   // west side: bridge -> tower path (gap at the Brewer's door)
  [3.4, 78.5, 3.4, FARM.z - 1.8], [3.4, FARM.z + 1.8, 3.4, 108.2],                       // east side: bridge -> farm track (gap at the farm path)
  // the path from the chicken coop up to the mines: rail fences along both sides (owner)
  ...(() => {
    const pts: [number, number][] = [[43, 111], [48.5, 100.5], [54, 91], [58, 79], [59.2, 64]], f: [number, number, number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [bx, bz] = pts[i + 1], l0 = Math.hypot(bx - pts[i][0], bz - pts[i][1]);
      for (const sd of [-1, 1]) {
        // (first run, inner side: starts clear of the farm track so it does not poke across it; owner red lines: the
        // outer side runs all the way to the track, and both join the track's fences)
        const cut = i === 0 && sd < 0 ? 4.2 : 0;
        const ax = pts[i][0] + (bx - pts[i][0]) / l0 * cut, az = pts[i][1] + (bz - pts[i][1]) / l0 * cut;
        const l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l * 2.3, nz = (bx - ax) / l * 2.3;
        const sx0 = ax + nx * sd, sz0 = az + nz * sd, sx1 = bx + nx * sd, sz1 = bz + nz * sd;
        // (the river now runs on east under this path: the fences stop at the banks, the footbridge's railings take over)
        const rx = (sx0 + sx1) / 2, rN = riverBank(rx, 0) - 1.4, rS = riverBank(rx, 1) + 1.4;
        if (Math.min(sz0, sz1) < rS && Math.max(sz0, sz1) > rN) {
          const at = (zz: number): [number, number] => { const t = (zz - sz0) / (sz1 - sz0); return [sx0 + (sx1 - sx0) * t, zz]; };
          const hi = sz0 > sz1 ? [sx0, sz0] : [sx1, sz1], lo = sz0 > sz1 ? [sx1, sz1] : [sx0, sz0];
          if (hi[1] > rS) { const p = at(rS); f.push([hi[0], hi[1], p[0], p[1]]); }
          if (lo[1] < rN) { const p = at(rN); f.push([lo[0], lo[1], p[0], p[1]]); }
        } else f.push([sx0, sz0, sx1, sz1]);
        if (i === 0) f.push(sd < 0 ? [42, 108.7, ax + nx * sd, az + nz * sd] : [43.6, 113.2, ax + nx * sd, az + nz * sd]);   // joints to the track fences
      }
    }
    return f;
  })(),
  // the farm track past the coop (owner: fences along this pathway): both sides, gaps for the hamlet doors and the coop yard
  // (owner, red lines) closed along both sides now; the south side joins the road's east fence
  [3.4, 108.3, 30.5, 108.9], [30.5, 108.9, 42, 108.7],
  [5, 112.8, 20.6, 113.1], [20.6, 113.1, 43.6, 113.2],
  // the woodland path from the road to the Endless Tower (z = TOWER.z): both sides, gaps at the west hamlet doors
  [-4.4, TOWER.z - 1.8, -55, TOWER.z - 1.8],
  [-4.4, TOWER.z + 1.8, -55, TOWER.z + 1.8],   // (owner, red lines: closed along the hamlet side too; stops short of the tower clearing)
  // the extra crop fields (each open on the road side)
  ...(() => { const f: [number, number, number, number][] = []; for (const F of FIELDS) { const x0 = F.x - F.hw, x1 = F.x + F.hw, z0 = F.z - F.hd, z1 = F.z + F.hd, roadX = F.x > 0 ? x0 : x1; f.push([x0, z0, x1, z0], [x0, z1, x1, z1], [roadX === x0 ? x1 : x0, z0, roadX === x0 ? x1 : x0, z1]); if (F.x < 0) f.push([roadX, z0, roadX, z1]); else f.push([roadX, z0, roadX, F.z - 1.4], [roadX, F.z + 1.4, roadX, z1]); } return f; })(),   // (west fields: closed, no way in from the road)
];

/** Signposts pointing at the gate (south): one beside the spawn plaza, one half way down the road. */
/** Gate signposts were removed at the owner's request (a ground arrow points to the gate instead). */
export const SIGNS: SignSpec[] = [];

/** Lamp posts (emissive bulb only, no real lights). */
export const LAMPS: [number, number][] = [
  // main avenue (+ the road on into the farmland)
  [3, 14], [-3, 20], [3, 24], [-3, 34], [3, 36.5], [-3, 40], [3, 42.5], [3.2, 50], [-3.2, 53.5], [4.1, 84], [-4.1, 92], [4.1, 100], [-4.1, 108], [4.1, 116],
  // south street (north edge), plaza, north street
  [-9.4, 7.2], [11, 7.2], [-20, 7.2], [20, 7.2], [-6, 6.2], [6, 6.2], [-12.5, -8.9], [12.5, -8.9], [-5, -8.9], [5, -8.9],
  // the dirt path from the meadow to the beach
  [-11, 53.9], [-27.5, 54.6], [-42.2, 52.3],
  // the riverside park
  [22, riverBank(22, 0) - 3.4], [31, riverBank(31, 0) - 3.4],
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
  { x: -15.2, z: -9.2, w: 3.2, d: 1.0, kind: 1 }, { x: 11.5, z: -9.2, w: 3.2, d: 1.0, kind: 0 },
  { x: -2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 }, { x: 2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 },
  // castle approach: flower beds lining the path and the castle front
  { x: -7.6, z: -24.6, w: 6.0, d: 1.5, kind: 1 }, { x: 7.6, z: -24.6, w: 6.0, d: 1.5, kind: 1 },
  { x: -6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 }, { x: 6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 },
  // pet lane
  { x: 9, z: 23.6, w: 3.2, d: 1.0, kind: 1 }, { x: 15, z: 23.6, w: 3.2, d: 1.0, kind: 0 },
  // flower bed in front of the gate (outside)
  { x: -10.5, z: 46.5, w: 5, d: 2, kind: 1 }, { x: 10.5, z: 46.5, w: 5, d: 2, kind: 1 },   // (owner: aligned pair)
  // flower boxes along the outside of the south wall (clear of the towers at x = +-27 and the brewer's hut)
  { x: -36, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: -19, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: 19, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: 36, z: 41.5, w: 5, d: 1.1, kind: 1 },
  // little riverside park east of the bridge (owner): flower beds behind the river benches
  { x: 22, z: 54.5, w: 3.2, d: 1.1, kind: 1 }, { x: 31, z: 54.5, w: 3.2, d: 1.1, kind: 0 },
  // (owner #167) the green in front of the gate
  { x: -22, z: 45.2, w: 3.2, d: 1.1, kind: 0 }, { x: 17, z: 49.6, w: 3.2, d: 1.1, kind: 0 },
];

/** Trees: x, z, scale, kind (0 oak, 1 palm, 2 pineA, 3 pineB). Inside the walls they stand on the grass patches. */
export interface TreeSpec { x: number; z: number; s: number; kind: 0 | 1 | 2 | 3 }
export const TOWN_TREES: TreeSpec[] = [
  // hermit path (outside the walls): east ring and north ring, both sides of the trail
  { x: 48.5, z: -6, s: 3.0, kind: 1 }, { x: 48.5, z: -30, s: 2.9, kind: 0 }, { x: 40, z: -44.5, s: 2.8, kind: 1 }, { x: 18, z: -44.5, s: 2.9, kind: 0 },
  { x: 48.5, z: 12, s: 2.8, kind: 0 }, { x: 53.2, z: 34, s: 3.4, kind: 1 },   // (owner: moved left, off the path) (the mining camp + the way down to the farm)
  // tall round trees beside houses and along the streets (spots checked against colliders, roads, NPC routes and doors)
  { x: -32, z: 14.5, s: 3.00, kind: 0 }, { x: -32, z: 23.5, s: 3.30, kind: 0 }, { x: 39, z: -6.5, s: 3.15, kind: 0 }, { x: -36.5, z: -5, s: 3.60, kind: 0 }, { x: -14, z: -35, s: 3.45, kind: 0 }, { x: 29.5, z: 16, s: 3.45, kind: 0 }, { x: 37, z: 14.5, s: 3.30, kind: 0 }, { x: 38.5, z: 22, s: 3.60, kind: 0 },
  { x: -37, z: -15, s: 3.6, kind: 0 }, { x: 37, z: -16, s: 3.4, kind: 2 }, { x: -31, z: 34.6, s: 3.4, kind: 0 }, { x: 38, z: 30, s: 3.5, kind: 1 },
  
  // the meadow south of the gate: a few lone trees (the forest edge is pushed back, see ISLAND_BOXES)
  { x: -22, z: 57.5, s: 3.5, kind: 1 }, { x: 34, z: 43.5, s: 3.5, kind: 0 }, { x: 41, z: 52, s: 3.3, kind: 2 }, { x: 13.5, z: 44.5, s: 3.1, kind: 1 }, { x: -39, z: 58, s: 3.6, kind: 0 },
  { x: 24, z: 46, s: 3.4, kind: 0 },
  // (owner #167: more on the green in front of the gate) west side, clear of the dirt path at z 52
  { x: -15, z: 45.5, s: 3.1, kind: 0 }, { x: -27, z: 47.5, s: 3.4, kind: 2 }, { x: -34.5, z: 45, s: 3.0, kind: 0 }, { x: 30, z: 52.8, s: 3.2, kind: 2 },
  // (owner: more trees, like a forest) the Endless Tower clearing: both edges, clear of the path (z = 112 +- 3) and the knoll
  ...(() => {
    const t: TreeSpec[] = [];
    for (let i = 0; i < 9; i++) {
      const x = -47 - i * 4.4 + (i % 2) * 1.3;
      if (Math.hypot(x + 74, 0) < 12) continue;   // (the knoll)
      t.push({ x, z: 104.6 + (i % 3) * 0.9, s: 3.1 + (i % 4) * 0.25, kind: (i % 3) as 0 | 1 | 2 });
      if (x < -45) t.push({ x: x - 1.8, z: 119.4 - (i % 3) * 0.8, s: 3.0 + ((i + 1) % 4) * 0.25, kind: ((i + 1) % 3) as 0 | 1 | 2 });
    }
    t.push({ x: -82.5, z: 104.5, s: 3.5, kind: 0 }, { x: -84, z: 119, s: 3.4, kind: 2 }, { x: -64, z: 103.6, s: 3.3, kind: 1 }, { x: -86, z: 112, s: 3.6, kind: 1 });
    return t;
  })(),
  // (owner) the Adventure Portal deep in the forest: trees along the bending road, then a horseshoe round the clearing (open to the road)
  ...(() => {
    const t: TreeSpec[] = [];
    const road: [number, number][] = [[0, 130], [1.8, 134], [3.6, 138.5], [4.4, 142.5]];
    road.forEach(([x, z], i) => { t.push({ x: x - 7.5 - (i % 2), z, s: 3.2 + (i % 3) * 0.3, kind: (i % 3) as 0 | 1 | 2 }); t.push({ x: x + 7.5 + ((i + 1) % 2), z: z + 1, s: 3.3 + ((i + 1) % 3) * 0.3, kind: ((i + 2) % 3) as 0 | 1 | 2 }); });
    for (let i = 0; i <= 10; i++) {
      const a = -1.95 + (3.9 * i) / 10, r = 13 + (i % 2) * 1.6;   // angle from +z (south): the arc wraps the back and sides
      t.push({ x: PORTAL.x + Math.sin(a) * r, z: PORTAL.z + Math.cos(a) * r, s: 3.4 + (i % 3) * 0.35, kind: ((i + 1) % 4) as 0 | 1 | 2 | 3 });
    }
    return t;
  })(),
  // the mainland across the bridge
  { x: -38, z: 82, s: 3.9, kind: 3 }, { x: -8, z: 83, s: 3.4, kind: 1 }, { x: -40, z: 96, s: 3.9, kind: 2 }, { x: -41, z: 106, s: 3.4, kind: 2 },
  { x: -10, z: 117, s: 3.5, kind: 0 }, { x: 14, z: 116, s: 3.7, kind: 0 }, { x: 28, z: 117, s: 3.5, kind: 0 }, { x: 47, z: 88, s: 3.6, kind: 0 },
];
/** Small grass patches inside the walls (everything else is paved): x, z, rx, rz. */
export const GRASS_PATCHES: [number, number, number, number][] = [
  [-37, -15, 3, 3], [37, -16, 3, 3], [-31, 34.6, 2.8, 2.6], [38, 30, 3.4, 3.4],
  [-21, 18, 3.3, 3.3], [PEN.x, PEN.z, 6.6, 4.6],
  [-38.1, -34.6, 5.4, 4.6], [-38.1, -26.4, 5.4, 4.8],   // the graveyard (two blocks either side of the path)
];
/** Farm props (outside the walls): scarecrow + haystack positions. */
/** Parked carts on the meadow in front of the walls (drawn in TownScenery addCart): kind 0 merchant goods, 1 hay, 2 barrels.
 *  The cart's bed runs along its local z (rot = yaw); colliders in TOWN_COLLIDERS. */
export interface CartSpec { x: number; z: number; rot: number; kind: 0 | 1 | 2 }
export const CARTS: CartSpec[] = [
  { x: 9, z: 52.5, rot: 0.35, kind: 0 }, { x: -10, z: 55.2, rot: -0.45, kind: 2 }, { x: -36, z: 57, rot: -0.9, kind: 1 }, { x: 30, z: 87, rot: 2.0, kind: 2 },
];
export const SCARECROW = { x: FARM.x, z: FARM.z };
export const HAYSTACK = { x: FARM.x - 5, z: FARM.z - 4 };

/** Movement colliders [x, z, r] registered with mapgen.addTempCollider after the island is generated. */
export const TOWN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) c.push([h.x, h.z, Math.hypot(h.w, h.d) * 0.38 + 0.4]);
  c.push([TOWER.x, TOWER.z, TOWER.r]);
  for (const sx of [-1, 1]) c.push([PORTAL.x + sx * 4.3, PORTAL.z, 1.5]);   // the portal's two great pillars
  c.push([PORTAL.x, PORTAL.z + 2.2, 3.4]);                                       // the stone back of the arch
  for (const r of RUINS) c.push([r.x, r.z, r.kind === 0 ? 1.0 : 1.6]);
  // stalls are ~3.9 wide: two circles along their local x axis
  for (const s of STALLS) for (const k of [-1.1, 1.1]) c.push([s.x + Math.cos(s.rot) * k, s.z - Math.sin(s.rot) * k, 1.25]);
  c.push([WELL_POS.x, WELL_POS.z, 1.5]);
  c.push([HERMIT_CAMP.x, HERMIT_CAMP.z, 0.9]);   // campfire
  for (const k of CARTS) for (const o of [-0.9, 0.9]) c.push([k.x + Math.sin(k.rot) * o, k.z + Math.cos(k.rot) * o, 1.2]);   // carts: two circles along the bed
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
  for (const [x, z, r] of TRAIL_ROCKS) c.push([x, z, r]);
  c.push([SCARECROW.x, SCARECROW.z, 0.5], [HAYSTACK.x, HAYSTACK.z, 1.3]);
  // the brewer's cauldron, work table and barrels in front of / beside the hut (hut-local -> world; the hut itself is the shop collider)
  { const { x, z, rot } = BREWER_HUT, cr = Math.cos(rot), sr = Math.sin(rot);
    for (const [lx, lz, r] of [[1.4, 3.4, 1.0], [-1.6, 2.6, 0.75], [-2.4, 2.6, 0.6], [-2.95, 0.1, 0.9], [2.95, 0.9, 0.6]] as const) c.push([x + lx * cr + lz * sr, z - lx * sr + lz * cr, r]); }
  c.push([QUEST_POS[0], QUEST_POS[2], 1.6]); // notice board
  // castle terrace: retaining wall along the front (gap for the stairs) and the sides, stair balustrades
  { const T = TERRACE;
    for (let x = T.x0; x <= T.x1 + 0.01; x += 0.8) if (Math.abs(x) > T.stairHw + 0.3) c.push([x, T.z1 + 0.35, 0.5]);
    for (const x of [T.x0 - 0.35, T.x1 + 0.35]) for (let z = T.z0; z <= T.z1 + 0.35; z += 0.8) c.push([x, z, 0.5]);
    for (const sx of [-1, 1]) for (let z = T.z1; z <= T.stairZ + 0.01; z += 0.7) c.push([sx * (T.stairHw + 0.35), z, 0.4]); }
  // landmarks: chapel (+ bell tower at its front-left), tavern, windmill, statue
  for (const L of [CHURCH, TAVERN]) {
    const hw = L.w / 2, hd = L.d / 2;
    for (let x = -hw; x <= hw + 0.01; x += 1.2) c.push([L.x + x, L.z - hd + 0.5, 1.0], [L.x + x, L.z + hd - 0.5, 1.0]);
    for (let z = -hd; z <= hd + 0.01; z += 1.2) c.push([L.x - hw + 0.5, L.z + z, 1.0], [L.x + hw - 0.5, L.z + z, 1.0]);
  }
  c.push([CHURCH.x - CHURCH.w / 2 + 1.2, CHURCH.z + CHURCH.d / 2 - 1.2, 2.0]);
  c.push([WINDMILL.x, WINDMILL.z, WINDMILL.r], [STATUE.x, STATUE.z, STATUE.r]);
  for (const [x, z] of GRAVES) c.push([x, z, 0.55]);
  // the river: both banks are a chain of circles (gap for the bridge), the east end is closed; the bridge railings
  for (let x = -49; x <= RIVER.x1 + 0.01; x += 0.8) if (Math.abs(x) > BRIDGE.hw + 0.5 && Math.abs(x - MINE_BRIDGE.x) > MINE_BRIDGE.hw + 0.5) c.push([x, riverBank(x, 0) - 0.2, 0.7], [x, riverBank(x, 1) + 0.2, 0.7]);   // (wavy banks, closing round at the east end)
  c.push([RIVER.x1 + 0.4, (RIVER.z0 + RIVER.z1) / 2, 1.2]);
  for (const sx of [-1, 1]) for (let z = BRIDGE.z0 + 0.6; z <= BRIDGE.z1 - 0.59; z += 0.8) c.push([sx * (BRIDGE.hw + 0.35), z, 0.4]);
  for (const sx of [-1, 1]) for (let z = MINE_BRIDGE.z0 + 0.5; z <= MINE_BRIDGE.z1 - 0.49; z += 0.7) c.push([MINE_BRIDGE.x + sx * (MINE_BRIDGE.hw + 0.25), z, 0.3]);   // footbridge railings
  c.push([CRYPT.x, CRYPT.z - 1, 1.3], [CRYPT.x, CRYPT.z + 1, 1.3], [-34.2, -38.4, 0.6]);   // crypt, dead tree
  for (const s of TOWN_SEATS) { if (s.x === CHURCH.x + CHURCH.w / 2 - 0.6) continue; const cx = Math.cos(s.yaw), sx = Math.sin(s.yaw); for (const o of [-0.6, 0.6]) c.push([s.x + cx * o, s.z - sx * o, 0.45]); }
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

/** Harvest nodes around the town: outside the walls on the east side (the mining camp at the Crystal Cave and the path
 *  up from the farm), never by the gate and never on the narrow back trail to the hermit. They regrow 24 h after the last
 *  one is harvested. */
export const VILLAGE_NODES: { kind: 'CRYSTAL' | 'ORE' | 'GOLD_VEIN' | 'HERB'; x: number; z: number }[] = [
  { kind: 'ORE', x: 53, z: 32 }, { kind: 'HERB', x: 50.5, z: 11 }, { kind: 'CRYSTAL', x: 69.5, z: 19.5 }, { kind: 'GOLD_VEIN', x: 65.5, z: 27.5 },
  { kind: 'ORE', x: 56, z: 18 }, { kind: 'HERB', x: 52, z: 69.5 },
];

/** Circles kept free of random trees / rocks / crates by mapgen. */
export const TOWN_CLEAR: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  // the whole walled yard stays free of random trees / rocks (grid of circles covering the wall rectangle)
  for (let x = WALL.x0 + 7; x < WALL.x1; x += 14) for (let z = WALL.z0 + 7; z < WALL.z1 + 6; z += 14) c.push([x, z, 11]);
  c.push([0, 8, 40]);
  for (const h of HOUSES) c.push([h.x, h.z, 6.5]);
  c.push([CASTLE.x, CASTLE.z, 14], [HERMIT_CAMP.x, HERMIT_CAMP.z, 7]);
  c.push([CHURCH.x, CHURCH.z, 9], [TAVERN.x, TAVERN.z, 7], [WINDMILL.x, WINDMILL.z, 9]);
  for (let x = RIVER.x0; x <= RIVER.x1; x += 6) c.push([x, (RIVER.z0 + RIVER.z1) / 2, 9]);
  for (const F of FIELDS) c.push([F.x, F.z, Math.max(F.hw, F.hd) + 2]);
  c.push([PORTAL.x, PORTAL.z, 13], [PORTAL.x, PORTAL.z - 6, 9]);   // the portal clearing
  c.push([TOWER.x, TOWER.z, 11], [BREWER_HUT.x, BREWER_HUT.z, 7.5]);   // the tower knoll + the brewer's yard
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
export interface NpcGift { /** only while this NPC quest is active (accepted, not handed in) */ quest?: string; once?: string; gold?: number; item?: 'potion_hp' | 'potion_mana'; qty?: number; text: string }
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
  /** talking to this NPC ends by opening this shop tab (e.g. the Skill Trainer -> SKILLS) */
  opens?: import('../storeTypes').ShopTab;
  /** the ship's captain: talking ends with the offer of a ticket to the Coral Isles */
  ship?: boolean;
  area?: 'CASTLE' | 'CAVE' | 'CHURCH' | 'TAVERN';   // (CAVE = Floor 1 of the crystal cave)
  /** (owner) cave cameo: not on Floor 1 but on one random deep floor per mining trip (npcs.caveCameo), beside the arrival */
  deep?: boolean;
  /** talking to him settles AUDIENCE / KING_BOUNTY quests (store.reportToKing) */
  king?: boolean;
  /** gold crown on his head */
  crown?: boolean;
  /** hide the model's own headgear (helmet / hat / hood) */
  noHat?: boolean;
  /** a long robe over the body (colour), a cape down the back (colour), a priest's mitre (colour) */
  robe?: string; cape?: string; mitre?: string;
  /** plain villager look: hide the model's cape / quiver / mask, a simple tunic (colour) and hair (colour, long = women) */
  noCape?: boolean; tunic?: string; hair?: string; longHair?: boolean;
  /** floor height (standing on the dais) */
  y?: number;
  /** only present while the main story is in [from, until) (story step ids; '' = from the start / forever) */
  storyRange?: [string, string];
}

export const NPCS: NpcDef[] = [
  {
    name: 'Mira', role: 'Guide', model: 'WIZARD', tint: '#fff1d6', scale: 1, prop: 'none', accent: '#ffd36a', home: [3.6, 5.4], ordered: true,
    talk: [
      ['Welcome to Aether Village, traveller! I am Mira. Let me show you the ropes.', 'Move with WASD or the left stick. Once you reach level 6 you learn to Dash with Space (or the dash button) and slip through danger.',
        'You:: I don\'t understand...', 'Oh! Sorry, sorry. I was summoned from another world, and back there I was a little bit addicted to video games.', 'You:: I didn\'t understand that either!'],   // (owner: the hero's replies sit on the Next / Close button)
      ['Your skills live on the keys 1, 2 and 3, or on the round skill buttons. R unleashes your ultimate once its gauge is full.', 'Potions are on Z and X. Mana refills over time, so do not hoard it.'],
      ['Combos are hit counts. Every hit you land adds one, and the chain breaks after about three seconds without a hit.', 'Every 10 hits adds a little bonus damage, up to a big chunk at the top. An ultimate at 50+ hits becomes a finisher!'],
      ['Tired of tapping? Open the pause menu and switch on "Auto skills": skills 1/2/3 and your ultimate cast themselves at nearby enemies.', 'Dashing always stays manual, so stay sharp. When you are ready, take the road south past the gate to the old stone portal in the forest.'],
    ],
    bubbles: ['Press E near anything glowing!', 'Ask me again for more tips. The portal is down the main road, past the gate!', 'Skills 1, 2, 3 and R. Never forget R!'],
  },
  {
    name: 'Elder Tobin', role: 'Village Elder', model: 'BARBARIAN', tint: '#f1ece2', scale: 1, prop: 'none', accent: '#e6d3a0', home: [4.8, -2.2],
    talk: [['The old oath at the well used to be twelve words. Now it is thirteen. Nobody will tell me what the new one is.'], 
      ['Ah, a young adventurer. This well has fed our village for three hundred years.', 'The old tales say the Mire swallows the careless. Walk with care.'],
      ['My knees ache, but my memory is sharp. I remember when this valley had no gate at all.', 'Keep your potions stocked and your wits about you.'],
      ['Every hero starts as a stranger here. The Font does not care where you were born, only that you came back.'],
      ['That well is no well, child. It is the Aether Font. You swore your oath on it, remember?', 'When you fall out there, its light brings you home. It brought me home eleven times, in my day.'],
    ],
    bubbles: ['Lovely day!', 'Back in my day the Mire was a meadow.', 'Mind the well, children.'],
    gift: { gold: 150, text: 'Elder Tobin presses a pouch into your hand. (+150 gold)' },
  },
  {
    name: 'Pip', role: 'Village Kid', model: 'ROGUE', tint: '#ffe0ea', scale: 1, prop: 'none', accent: '#ff9ac0', home: [-36.4, -30.2], speed: 2.6,   // hiding in the north-west corner behind the houses (knows the hermit's secret)
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
    name: 'Garrick', role: 'Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#bcd0ff', home: [4.1, 35.9],
    talk: [['Curfew bell rings at dusk now. King\'s orders. Not to keep the monsters out, mind. To keep us in.', 'Something walks the treeline after dark. Not wolves. Wolves do not stand on two legs and watch the gate.'], 
      ['Halt! ...Oh. It is you. Carry on.', 'Follow the road south through the gate to the Adventure Portal in the forest. Step into it when you are ready.'],
      ['Nothing gets past me. Well, nothing except hens. And the Elder\'s cat.', 'Bring back something shiny, will you?'],
      ['Stock up at the potion shop before you set out. Heroes who forget potions tend to come back without their dignity.'],
      ['I have guarded this gate eleven years. The gate has never once been stolen. You are welcome.'],
    ],
    bubbles: ['Curfew at dusk. Do not make me ring it twice.', 'Move along, citizens.', 'All quiet at the gate.', 'Beware the Mire...'],
  },
  // the castle doors: two royal guards flank the steps (stationary, facing the plaza)
  {
    name: 'Sir Aldo', role: 'Castle Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#ffd36a', home: [-4.4, -22], y: TERRACE.h,
    talk: [
      ['The King receives heroes in the throne hall. Go on in.'],
      ['I have stood at this door for eleven years. The door has never once tried anything.', 'Still. One must be ready.'],
    ],
    bubbles: ['For the King!', 'All quiet at the castle.', 'Stand tall, Bram.'],
  },
  {
    name: 'Sir Bram', role: 'Castle Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#ffd36a', home: [4.4, -22], y: TERRACE.h,
    talk: [
      ['Halt! State your... ah, the new guard. Welcome to the castle.'],
      ['Aldo snores standing up. Do not tell him I said that.'],
    ],
    bubbles: ['Long live King Aldric.', 'I am standing tall, Aldo.', 'No loitering on the steps.'],
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
      ['Fine wares, rare finds! Alas, today I am only here for the fresh air.', 'The real shops are all around the square: potions and pets to the west, the smithy and the warehouse to the east.'],
      ['Coins make the world go round, friend. Spend them well, save a few for the altar.'],
    ],
    bubbles: ['Fine wares! Fine wares!', 'Everything has a price.', 'Best prices in the valley!'],
  },
  {
    name: 'Fenn', role: 'Bard', model: 'ARCHER', tint: '#d3e5ff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [-28, 9], speed: 1.7,
    patrol: [[-28, 9], [-14, 9], [0, 9], [14, 9], [28, 9], [14, 11], [0, 11], [-14, 11], [-28, 11]],
    talk: [['I wrote a ballad about the Dimming. The King liked it so much he bought every copy and burned them. I think that is a compliment. I hope.'], 
      ['La la laaa... oh, an audience! I am working on a ballad about the Tide Hydra.', 'So far it goes: "Run." Then, for the second verse: "Swim." Needs work.'],
      ['They say the Frostpeak winds sing at midnight. I shall go listen, once I find a braver bard.'],
    ],
    bubbles: ['La la laaa~', 'Beware the Mire... it rhymes with nothing!', 'Anyone have a lute string?'],
  },
  {
    name: 'Wren', role: 'Scholar', model: 'WIZARD', tint: '#d7e0ff', scale: 1, prop: 'staff', accent: '#a9b8ff', home: [-21.5, -10.5],   // among the houses (clear of the Skill Trainer's tent)
    talk: [
      ['The Fortune Teller by the plaza answers wishes with fortune. Offer her gems and see who answers.', 'The Skill Trainer, by the castle steps on the west side, will sharpen what you already know.'],
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
      ['A hero once asked for a bounty on his own mother-in-law. I said no. Then I met her. I said maybe.'],
    ],
    bubbles: ['Fresh bounties on the board!', 'Hero wanted: apply within.', 'So much paperwork...'],
  },
  {
    name: 'Maeve', role: 'Gossip', model: 'WIZARD', tint: '#f0e8f7', scale: 1, prop: 'staff', accent: '#e8d0ff', home: [19, 9], speed: 1.2,
    patrol: [[19, 9], [30, 9], [24, 11], [17, 11]],
    talk: [['Did you hear the King\'s new tax? A copper for every window. So now everyone boards up their windows. So now the whole town is dark. He seemed pleased.', 'And old Fenwick said one word about the princess at the tavern and his cart was "requisitioned" the next morning. One word!'], 
      ['I heard the Ember Wastes are so hot the goblins carry parasols. True story.', 'Do not tell Tobin I told you.'],
      ['Hodge fancies the herbalist. Everyone knows. Except Hodge. And Lysa.'],
    ],
    bubbles: ['Board up your windows, dear. Tax.', 'Do not say her name too loud.', 'Did you hear?', 'Lovely day!', 'Beware the Mire... or so they say.'],
  },
  // ------------------------------------------------------------ castle (throne hall, see castleData.ts)
  // the true heir on her father's throne once the Regent is gone (story step 'queen' on; replaces King Aldric)
  {
    name: 'Queen Aelia', role: 'Queen of Aether', model: 'WIZARD', tint: '#fff4e0', scale: 1.05, prop: 'staff', accent: '#fff3c4', home: [0, -15.2], y: 0.6, area: 'CASTLE', king: true, crown: true, noHat: true, robe: '#f4ecd8', cape: '#3a5fa8', hair: '#e8d29a', longHair: true, ordered: true, storyRange: ['queen', ''],
    talk: [
      ['You came. Good. I have had four hundred petitions this morning and three of them were about Hodge\'s poems.', 'Sit, if you like. The throne is very uncomfortable. My father always said so. Aldric never complained once.'],
      ['Mortimer has been paid. In gold, not candles. Sister Elowen wept. I think from guilt.', 'The Quest Board still carries the people\'s requests. Mine are rarer, and they pay in gems.'],
      ['The guardians sleep easier now. They never served the dark, you know. They were my father\'s protectors, holding a door shut that Aldric kept opening.', 'Some nights I still hear the Hollow under the well. Malakar is down there with it. Keeping it company. Keeping it hungry.'],
      ['When the echoes rise in the Void, go and put them out. Every one of them wears his face, and none of them are him.', 'And come home after. That is the only order I will ever give you.'],
    ],
    bubbles: ['The realm endures.', 'Paperwork. So much paperwork.', 'Welcome, guardian.'],
  },
  {
    name: 'King Aldric', role: 'King of Aether', model: 'KNIGHT', tint: '#ffe7a6', scale: 1.15, prop: 'none', accent: '#ffd36a', home: [0, -15.2], y: 0.6, area: 'CASTLE', king: true, crown: true, noHat: true, cape: '#a8141e', ordered: true, storyRange: ['', 'queen'],
    talk: [
      ['Rise, hero. The crown has heard your name whispered in the market and in the barracks alike.', 'Aether was a green kingdom once. Then the Mire woke, and the old guardians stirred in their sleep.'],
      ['Malakar was my archmage, and my friend. He took a shard of the Font, and my daughter, and ran into the Void.', 'Bring them home, guardian. The Font will keep bringing you home until you do.'],
      ['Beyond the gate lie seven realms, each ruled by a beast older than my house. Greenwood, the Marble Halls, the Sunscorch, the Coral Isles, Frostpeak, the Ember Wastes, the Void... each deeper than the last.', 'Be wary of the elite ones: they hit harder, but they hoard the finest spoils.'],
      ['A king hears much. The Void Herald is said to wait at the bottom of the world, and the Lich haunts the halls in between.', 'Gather your strength before you descend. Forge, enchant, and never walk into the dark with empty potion belts.'],
      ['The Quest Board in the square carries the people\'s requests. Mine are rarer, and they pay in gems.', 'Take an audience-bounty or a royal commission, finish the deed, and report back to me in person.'],
      ['My grandfather sealed the Aether Altar to keep its fortune from the greedy. Spend your gems there wisely, and it may smile on you.', 'Go now. Aether is counting on its heroes.'],
    ],
    bubbles: ['Aether endures.', 'Hmm... the realm weighs heavy.', 'Speak, if you have a deed to report.'],
  },
  {
    name: 'Captain Roan', role: 'Royal Guard', model: 'KNIGHT', tint: '#c9d6ff', scale: 1.05, prop: 'spear', accent: '#bcd0ff', home: [-4.6, -11.2], area: 'CASTLE',
    talk: [['Between us: the King doubled the night patrols. Not on the walls. Facing IN, at the town.', 'I do not ask questions. I have found that questions get you posted to the Ember Wastes.'], 
      ['Keep your voice down in the presence of His Majesty. And your hands off the carpet.', 'The King receives heroes who have proven themselves. You are welcome.'],
      ['Twenty years at this post. Not once has anyone sneaked past me. Not once. Do not ask about the kitchen.'],
    ],
    bubbles: ['Eyes forward.', 'All quiet.', 'Long live the King.'],
  },
  {
    name: 'Guard Tamsin', role: 'Royal Guard', model: 'KNIGHT', tint: '#c9d6ff', scale: 1.05, prop: 'spear', accent: '#bcd0ff', home: [4.6, -11.2], area: 'CASTLE',
    talk: [['The King talks in his sleep. "I asked nicely". Over and over. Then he laughs. I am requesting a transfer.'], 
      ['Standing still all day is harder than any monster. My feet are just two painful rumours.', 'The King is kind though. He asks after our families.'],
      ['If you are going out beyond the gate, bring back something shiny for the throne room. The steward keeps complaining it is drab.'],
    ],
    bubbles: ['Quiet in the hall, please.', 'My feet...', 'Do not touch the throne.', 'Is it lunch yet?'],
  },
  {
    name: 'Steward Maren', role: 'Royal Steward', model: 'WIZARD', tint: '#e8d6ff', scale: 1, prop: 'none', accent: '#d9b0ff', home: [-4.6, 11], speed: 1.3, area: 'CASTLE',
    patrol: [[-4.6, 11], [-4.6, -8], [-4.6, 11], [-5, 2]],
    talk: [['His Majesty slept badly again. He woke shouting at the mirror. Said his shadow was "late". I did not ask late for what.', 'I have taken to leaving a candle by his door. He blows it out. He says the dark is "listening better" without it.'], 
      ['The King prefers royal bounties handled in person: an audience to start, then reports once the deed is done.', 'Find them on the Quest Board, hero. They pay in gems.'],
      ['I keep the household ledgers. Do you know how many candles a throne room eats in a week? Do not ask.'],
    ],
    bubbles: ['The King did not sleep again.', 'Mind the mirrors in the east hall.', 'So many candles...', 'The ledgers will not balance themselves.', 'Mind the carpet, please!'],
  },
  {
    name: 'Lady Isolde', role: 'Noble of the Court', model: 'ROGUE', tint: '#ffd0e0', scale: 1, prop: 'none', accent: '#ff9ac0', home: [8.6, 10], area: 'CASTLE',
    talk: [['Have you seen the portraits in the long gallery? All of the old King. Edric. Every one of them turned to face the wall.', 'His Majesty says it is a "mourning custom". From the eastern march. Odd custom.'], 
      ['Oh, a real adventurer, here among the velvet and the dust! Tell me, are the monsters as ugly as they say?', 'Never mind, do not answer. I shall imagine.'],
      ['His Majesty is fond of heroes who bring him good news. Shall I tell you a secret? He is terrible at cards.'],
    ],
    bubbles: ['Such a lovely hall.', 'Such a lovely hall.', 'Heroes! How thrilling.', 'The wine is excellent today.'],
  },
  // the chapel (west of the keep): the priestess tends the altar (talking once gives a blessing: a health potion)
  {
    name: 'Sister Elowen', role: 'Priestess', model: 'WIZARD', tint: '#ffffff', scale: 1, prop: 'staff', accent: '#bfe3ff', home: [0, -7.4], area: 'CHURCH', noHat: true, robe: '#f6f4ee', mitre: '#fbfaf5',
    talk: [['The King came to pray last week, alone, at midnight. He did not pray to the Goddess. He knelt facing the floor, toward the well, and whispered "not yet".'], 
      ['Welcome to the chapel of the Undying Flame, child. Every hero who falls out there wakes again in this town. Some say the Flame remembers them.', 'Rest a moment. The road will still be there.'],
      ['The windows were made from the glass of the old Aether spires. On quiet nights they still hum.', 'If the Void Herald ever stirs again, we will ring the bell. Twice.'],
      ['I pray for the miners, the fishers and the fools who walk into portals. You are the third kind, I think.', 'Go gently, and come back.'],
    ],
    bubbles: ['May the Flame keep you.', 'Light a candle for the lost.', 'Peace, traveller.'],
    gift: { once: 'elowen_blessing', item: 'potion_hp', qty: 1, text: 'Take this, with the Flame\'s blessing. It has saved braver souls than either of us.' },
  },
  // the graveyard behind the chapel: the gravekeeper Sister Elowen hired and forgot (quests elowen_stranger / mortimer_wages)
  { name: 'Mortimer', role: 'Gravekeeper', model: 'BARBARIAN', tint: '#d8d4c8', scale: 1, prop: 'lantern', accent: '#9aa38a', home: [-38.6, GRAVEYARD.pathZ + 1.2], noHat: true, noCape: true, tunic: '#5b5446', hair: '#3a3a36', longHair: false,
    talk: [['Mind the fresh ones. They are fresh.'], ['Seven years. Seven. I keep a tally on the crypt door.'], ['The small grave by the dead tree? The King had that one dug ten years ago. Never filled. Never will be, if you ask me.']],
    bubbles: ['Dig, dig, dig...', 'Nobody pays the gravekeeper.', 'Mind the fresh ones.', 'Who goes there? Oh. You again.'] },
  // ambient villagers (owner): plain folk in light / brown clothes, hero faces, varied hair, no hats or capes; they stroll the streets
  { name: 'Tomas', role: 'Villager', model: 'BARBARIAN', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-6, 10], speed: 1.1, patrol: [[-6, 10], [-30, 10], [-30, 12], [-6, 12]], noHat: true, noCape: true, tunic: '#d8c4a0', hair: '#5a3a22', longHair: false,
    talk: [['They took my brother into the royal guard. He came back from the well with a new smile and could not remember my name.'], ['Fine day for it.']], bubbles: ['Have you seen my goat?', 'Curfew soon. Best hurry.', 'Fine day for it.', 'Have you seen my goat?', 'Bread\'s fresh at the stall!'] },
  { name: 'Greta', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [6, 10], speed: 1.1, patrol: [[6, 10], [34, 10], [34, 12], [6, 12]], noHat: true, noCape: true, tunic: '#efe2c8', hair: '#b0582a', longHair: true,
    talk: [['My granny used to sing a song about Princess Aelia. Sing it in the square now and a guard writes your name down.', 'So I hum it. Very quietly.'], ['Morning, hero!']], bubbles: ['Mind the puddles.', 'Morning, hero!', 'Mind the puddles.', 'The market\'s busy today.'] },
  { name: 'Bram', role: 'Villager', model: 'KNIGHT', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-3, 16], speed: 1.1, patrol: [[-3, 16], [-3, 32], [-1, 32], [-1, 16]], noHat: true, noCape: true, tunic: '#c9a77a', hair: '#2a1c12', longHair: false,
    talk: [['Gate\'s that way.']], bubbles: ['Gate\'s that way.', 'Heard the King\'s hiring.', 'Watch your step.'] },
  { name: 'Lina', role: 'Villager', model: 'WIZARD', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-14, -6], speed: 1.1, patrol: [[-14, -6], [14, -6], [14, -4], [-14, -4]], noHat: true, noCape: true, tunic: '#e8d8b8', hair: '#e0c070', longHair: true,
    talk: [['Do not walk the forest road at night. The trees lean in. My cousin swears one of them whispered "is she with you?"'], ['Lovely weather.']], bubbles: ['The chapel bells are pretty.', 'Do not go in the forest at night.', 'Lovely weather.', 'The chapel bells are pretty.', 'Off to the tavern later!'] },
  { name: 'Oskar', role: 'Villager', model: 'BARBARIAN', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [12, 50], speed: 1.1, patrol: [[12, 50], [-12, 50], [-12, 50.4], [12, 50.4]], noHat: true, noCape: true, tunic: '#b89870', hair: '#8a8a8a', longHair: false,
    talk: [['Ahh, fresh air.']], bubbles: ['Ahh, fresh air.', 'The river\'s high this year.', 'Good fishing at the beach.'] },
  { name: 'Mira\'s sister Elsa', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [20, 26.5], speed: 1.1, patrol: [[20, 26.5], [4, 26.5], [4, 28], [20, 28]], noHat: true, noCape: true, tunic: '#d6c09a', hair: '#3a2416', longHair: true,
    talk: [['Have you met my sister? She never stops talking.']], bubbles: ['Have you met my sister? She never stops talking.', 'Lovely flowers by the gate.'] },
  // (owner: more folk outside the walls) the hamlets by the portal, the riverside green, the beach
  { name: 'Tam', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.85, prop: 'none', accent: '#d9c9a8', home: [8, 110.6], speed: 1.4, patrol: [[8, 110.6], [28, 110.6]], noHat: true, noCape: true, tunic: '#e0cfa8', hair: '#c07a3a', longHair: false,
    talk: [['Are you a real hero? Can I hold your sword?']], bubbles: ['Race you to the coop!', 'I saw a fox!', 'Mum says no portals.'] },
  { name: 'Wenna', role: 'Villager', model: 'WIZARD', tint: '#ffffff', scale: 0.95, prop: 'basket', accent: '#d9c9a8', home: [-8, 112], speed: 1.0, patrol: [[-8, 112], [-38, 112]], noHat: true, noCape: true, tunic: '#d8c7a6', hair: '#6a4024', longHair: true,
    talk: [['There is something in the forest past the tower. Black, like a hole in the air. The birds fly around it, never over.'], ['The tower hums at night. I sleep with the window shut.']], bubbles: ['Mind the tower, dear.', 'Something watches from the trees.', 'Lovely mushrooms in these woods.', 'Mind the tower, dear.', 'Fresh eggs for sale!'] },
  { name: 'Old Garth', role: 'Villager', model: 'KNIGHT', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-27, 57], speed: 0.8, patrol: [[-27, 57], [-13, 57.5]], noHat: true, noCape: true, tunic: '#a89070', hair: '#c8c8c8', longHair: false,
    talk: [['I remember King Edric. Big laugh. Used to carry the princess on his shoulders through the market. Then one night the laughing stopped, and Aldric came down the castle steps wearing his crown. Nobody remembers it that way but me.'], ['I come out here to watch the river. It never does anything new, and that is the best part.']], bubbles: ['Back in my day...', 'Ahh, my knees.', 'Good river, this.', 'Back in my day...'] },
  { name: 'Ned', role: 'Fisherman', model: 'BARBARIAN', tint: '#ffffff', scale: 1, prop: 'none', accent: '#d9c9a8', home: [-58, 18], speed: 0.9, patrol: [[-58, 18], [-58, 44]], noHat: true, noCape: true, tunic: '#9ab0b8', hair: '#3a2a1c', longHair: false,
    talk: [['The pier end is where the big ones bite. Patience, that is the whole trick.']], bubbles: ['Steady... steady...', 'Nice day for a cast.', 'The one that got away was THIS big.'] },
  // the Golden Tankard (enterable tavern east of the keep): the barkeep behind the bar and a regular at the hearth
  {
    name: 'Marta Goldtap', role: 'Barkeep', model: 'ROGUE', tint: '#ffe2c4', scale: 1, prop: 'none', accent: '#ffcf5a', home: [-2, -5.6], area: 'TAVERN',
    talk: [
      ['Welcome to the Golden Tankard! Mind the third stool, it bites.', 'Ale, cider, or a story? Stories are free. Ale is not.'],
      ['Heroes drink here on credit. Dead heroes drink here on credit too, funnily enough. You lot keep coming back.'],
      ['Rodric by the fire has been "about to leave" since the spring.'],
    ],
    bubbles: ['Another round?', 'Mind the stool!', 'Fresh barrel today!'],
  },
  {
    name: 'Rodric the Tipsy', role: 'Retired Adventurer', model: 'KNIGHT', tint: '#e8d8c8', scale: 1, prop: 'none', accent: '#d9a06a', home: [6.4, -1.6], area: 'TAVERN',
    talk: [
      ['I once fought a Golem with nothing but a spoon. ...It was a very large spoon.', 'Hic. Pardon.'],
      ['Ah, to be young and respawning again. My knees stopped respawning years ago.'],
    ],
    bubbles: ['Hic!', 'In my day...', 'One more for the road.'],
  },
  // the Coral Isles ship at the pier head (render/Beach SHIP): the captain sells a ticket (store.sailToIsles)
  {
    name: 'Captain Rhea Saltwind', role: 'Ship Captain', model: 'KNIGHT', tint: '#f3e3c3', scale: 1.05, prop: 'none', accent: '#6fd0e0', home: [-89, 23.4], ship: true, noHat: true,
    talk: [
      ['Ahoy! The Gull Queen sails for the Coral Isles at every tide.', 'Sixty gems and you skip the long walk through three realms. Interested?'],
      ['The Isles are warm, the water is clear and the locals bite. Mostly the crabs.', 'A ticket is sixty gems. You start right on the first island.'],
    ],
    bubbles: ['All aboard for the Coral Isles!', 'Sixty gems a ticket!', 'Fair winds today.'],
  },
  {
    name: 'Hollis', role: 'Farmer', model: 'BARBARIAN', tint: '#f3e3c3', scale: 1, prop: 'none', accent: '#d9b56a', home: [30.5, 94.5], speed: 1.2,
    patrol: [[30.5, 94.5], [28, 91.5], [28, 101.5], [30.5, 100]],   // (between the field fence at x 25 and the barn)
    talk: [['Fine morning for it. The girls are in a good mood today.', 'Cows, I mean. The cows.'], ['That barn has stood longer than the gate. Built it with my grandfather.']],
    bubbles: ['Moo-ve along now!', 'Hay for days.', 'Good girls, good girls.'],
  },
  {
    name: 'Dalla', role: 'Farmer', model: 'ARCHER', tint: '#ffe8d0', scale: 1, prop: 'basket', accent: '#f0b070', home: [COOP.x - 3.6, COOP.z - 2.6], speed: 1.3,
    patrol: [[COOP.x - 3.6, COOP.z - 2.6], [COOP.x - 3.6, COOP.z + 2.8]],   // along the nests on the coop's west (door) side
    talk: [['The hens are restless. Something prowls the fields at night.'], ['Fresh eggs, fresh bread, fresh air. Who needs the city?']],
    bubbles: ['Cluck cluck!', 'Where did that one go...', 'Eggs, eggs, eggs.'],
  },
  {
    name: 'Old Wend', role: 'Hermit', model: 'ROGUE', tint: '#c9b79a', scale: 1, prop: 'staff', accent: '#e6c27a', home: [2.2, -50.2],
    talk: [
      ['Hm? A visitor? Nobody finds old Wend out here, behind the walls. The fire keeps the Mire damp away.', 'Sit, if you like. Not on the bedroll. The bedroll bites.'],
      ['The walls keep the world out, and the world is where the best mushrooms grow. Funny, that.', 'Stay for the fire if you like. I only ask you leave the bedroll alone.'],
      ['Some nights the Frostpeak wind carries singing over the wall. I think it is the bard, lost again.'],
      ['I was a guardian before you. I knew Malakar when he still laughed at supper.', 'He was afraid of dying. Funny, for a man who lived next to the one thing that could have kept him safe.'],
    ],
    bubbles: ['Crackle, crackle...', 'Mushrooms for supper.', 'Who goes there?'],
    gift: { quest: 'pip_secret', once: 'aether-survivor-hermit-v1', gold: 1000 /* x GOLD_SCALE = 10,000 */, text: 'Old Wend pats his pockets, finds a sack he forgot he owned, and drops it in your hands. "Coin is just heavy pebbles. Do not tell the Elder." (+10,000 gold)' },
  },
  // the Skill Trainer beside the training tent west of the castle steps (talking opens the skill panel)
  {
    name: 'Master Varek', role: 'Skill Trainer', model: 'KNIGHT', tint: '#ffe0b0', scale: 1.05, prop: 'spear', accent: '#ffb04a', home: [TRAINER_POS[0] + 3.1, TRAINER_POS[2] + 1.6], opens: 'SKILLS',
    talk: [
      ['Footwork first, flourish later.', 'Spend your skill points here. Every point is a lesson you already paid for in blood.'],
      ['A new skill opens as you grow. Come back after every few levels.', 'Let\'s see what you have learned.'],
      ['Mana is a muscle. Overuse it and you\'ll stand there waving your arms at a goblin.'],
    ],
    bubbles: ['Again! Faster!', 'Mind your stance.', 'Skill points waiting? Come train.'],
  },
  // the meadow in front of the walls: a travelling merchant by her cart, a carter and a wanderer on the road
  {
    name: 'Tilda', role: 'Travelling Merchant', model: 'ROGUE', tint: '#ffe6c4', scale: 1, prop: 'basket', accent: '#ffb86a', home: [6.4, 51.5],
    talk: [
      ['Fresh from the coast road! Well... fresh-ish.', 'The guards won\'t let my cart through the gate, so I sell from out here. Better view anyway.'],
      ['I\'ve traded with three kingdoms and a goblin. The goblin haggled best.', 'Never trust a price that doesn\'t argue back, dear.'],
      ['Everything on this cart has a story. That kettle? Survived a sea serpent. Allegedly.', 'The stories are free. The kettle is not.'],
      ['A good merchant reads the road like a map: dust means buyers, smoke means trouble, and silence means wolves.'],
      ['Everyone who comes back from that cave in the east bay smells of wet rock and smugness.', 'Find crystals in there? Polish them first. Dull stones get dull prices. From me, anyway.'],
      ['My grandmother sold maps. Half of them were true.', 'The other half sold better. Family business, dear: never let the truth slow down a good bargain.'],
    ],
    bubbles: ['Spices! Silks! Slightly used!', 'Best prices outside the walls!', 'Mind the cart, dear.', 'Haggling welcome. Winning, less so.', 'Bat wings! Who sells me bat wings?', 'Crystals? I buy crystals! Sometimes.'],
  },
  {
    name: 'Corin', role: 'Carter', model: 'BARBARIAN', tint: '#e8d8bc', scale: 1, prop: 'none', accent: '#c9a46a', home: [-24, 50.5], speed: 1.3,
    patrol: [[-24, 50.5], [-12, 52.5], [-5, 51]],
    talk: [
      ['Hay for the barn, if the wheel holds.', 'This old cart has seen more roads than I have. Probably smarter too.'],
      ['Hollis pays in milk. I\'ve stopped asking.', 'Twenty years of hauling and I have never once been paid in coin. I have very strong bones, mind.'],
      ['The trick with a cart is the same as with life: grease the wheels, never the driver.'],
      ['Folk ask why I never haul from the cave in the east bay. Simple: the cart does not fit, and I do not go where my cart cannot.', 'Dorn carries his ore out on his back. Says it builds character. I have plenty already.'],
      ['Twenty-two years on this road. I know every stone by name.', 'That one is Gerald. Do not step on Gerald.'],
    ],
    bubbles: ['Hup, hup.', 'Lovely weather for hauling.', 'Left wheel squeaks. Right wheel complains.', 'One more load, then lunch.', 'Morning, Gerald.'],
  },
  {   // (owner: anime cameo, Attack on Titan) a hot-headed youth glaring at the rockfall that seals the old miners' road
    name: 'Erin', role: 'Boulder Glarer', model: 'ARCHER', tint: '#ffffff', scale: 0.78, prop: 'none', accent: '#3e6b3a', home: [44.2, 47.2], noHat: true, noCape: true, tunic: '#4f6a3a', hair: '#3a2616', longHair: false,   // (owner: a kid)
    talk: [
      ['Someday I will lift that boulder. With my own two hands.', 'Everyone says it cannot be moved. That is exactly why I have to move it!'],
      ['Beyond those rocks is the old miners\' road. Straight to the mines. My father walked it every morning.', 'Now everyone has to go round by the bridge like cattle in a pen. I hate it. I hate being walled in.'],
      ['I pushed it for three hours yesterday. It moved. I think. A little. Maybe that was me.', 'I will destroy every last one of these rocks!'],
    ],
    bubbles: ['Someday I will lift you.', 'Move. MOVE!', 'I will not be walled in!', 'Hnnnngh!', 'Tomorrow. Tomorrow for sure.', 'Beyond the rocks... freedom. And ore.'],
  },
  {
    name: 'Nell', role: 'Wanderer', model: 'ARCHER', tint: '#d6ecff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [3.6, 46], speed: 1.4,
    patrol: [[3.6, 46], [2.4, 56], [2.4, 84], [2.4, 96]],   // over the bridge and back
    talk: [
      ['I walk the portal road every evening. Someone has to wave at the heroes.', 'You would be surprised how many of them wave back. The brave ones, mostly.'],
      ['Follow the ring path east, past the town wall, to where the forest bends into a little bay. There is a mine mouth there, with lanterns on posts.', 'Crystals grow inside, blue and violet, glowing like my lantern. Mine a few, and tell me what colour the walls are. For my book.'],
      ['I keep a little book of the places heroes tell me about. Greenwood, the Marble Halls... most pages are still blank.', 'One day I will walk through that portal myself. Just to look. Then run straight back.'],
    ],
    bubbles: ['Good luck out there!', 'Safe travels, hero.', 'What a view.', 'Hear that? Wolves, far off.', 'Another page for my book...', 'The cave in the east bay glows at night...'],
  },
  // ------------------------------------------------------------ crystal cave, Floor 1 (see engine/caveData.ts)
  {
    name: 'Grit', role: 'Old Miner', model: 'BARBARIAN', tint: '#c9b8a0', scale: 0.95, prop: 'lantern', accent: '#ffb84a', home: [-4.2, 11.4], area: 'CAVE', ordered: true,
    talk: [
      ['Mind your head, youngster. Name is Grit. Forty years under this hill and I still find something new.', 'The stairs at the back go down. But the deep doesn\'t let you pass until you\'ve taken every vein on a floor.'],
      ['The deeper you go, the better the stone. Epic shards, Legendary geodes... once in a lifetime a Mythic vein. Those glow like a sunset. Takes forever to crack.', 'Rock gets harder down there too. Hold that E and keep at it.'],
      ['Below the first floor there\'s no daylight. Your lantern burns oil the whole time. When it gutters out, the hill shakes and you\'ll wake up back here, lighter in the pockets.', 'Come back up to fill it. My bench there sells bigger lanterns.'],
      ['From the third floor down, things live in the dark. Bats, slimes, worse. Keep your blade handy.', 'Some floors run hot with lava, some reek of poison. Don\'t stand in the puddles, eh?'],
      ['Old trick: now and then a vein hides a ladder under it. Find one and you can skip the rest of the floor.', 'And if you take the stairs you came down by, they bring you straight back up here. Shortcut my grandfather dug.'],
    ],
    bubbles: ['Every vein, then deeper.', 'Mind the lantern oil!', 'Hear that? The hill breathing.', 'Bigger lanterns at the bench!'],
  },
  {   // (owner: game cameo, Minecraft) met on one random deep floor per trip, mining away in his own blocky way
    name: 'Steve', role: 'Lost Block Miner', model: 'BARBARIAN', tint: '#57c3d1', scale: 0.95, prop: 'hammer', accent: '#6fd0e0', home: [0, 0], area: 'CAVE', deep: true, noHat: true,
    talk: [
      ['Oh, hi. I dug straight down. Everyone says never dig straight down. I dug straight down.', 'Anyway, have you seen any diamonds? Blue, shiny, sort of... chunky?'],
      ['These rocks are weird. I hit them and they do not drop as little cubes. How do you carry a whole wall?', 'Where I come from you can fit sixty-four stones in one pocket. Sixty-four!'],
      ['If you hear a hiss behind you, do not turn around. Just run.', '...It is probably only a bat. Probably.'],
      ['I tried to punch a tree on the way here. It did not work. Your trees are very rude.', 'Also I cannot find my bed. If I die down here, where do I wake up?'],
    ],
    bubbles: ['*mining noises*', 'Diamonds?', 'Hmm.', 'Never dig straight down...', 'Where is my bed?', 'Sssss... oh, just a bat.'],
    gift: { once: 'steve_torch', gold: 400, text: 'Steve hands you a pile of odd little cubes of ore. They sell surprisingly well. (+400 gold)' },
  },
  // ------------------------------------------------------------ lakeside beach (see engine/beachData.ts): the fishing teacher
  {
    name: 'Marlo', role: 'Angler', model: 'ARCHER', tint: '#d8e6c8', scale: 1, prop: 'basket', accent: '#7fc8e8', home: [-60.2, 39.2],
    talk: [
      ['The lake gives to the patient, friend. And to the ones with a decent rod.', 'Fishing comes to anyone with a bit of experience: Lv 3 and up, I would say. Before that the fish just laugh at you.'],
      ['Shoreline is fine for perch and trout. The end of the pier reaches deep water, where the rare ones swim.', 'The Fishmonger buys everything, even boots. Do not ask what she does with the boots.'],
      ['Some nights I see something gold under the pier. The Aetherfin, they call it. I have never caught it. Yet.'],
    ],
    bubbles: ['Steady... steady...', 'They are biting today!', 'Mind the line, friend.', 'Pier end for the big ones.'],
  },
];

export const GENERIC_BUBBLES = ['Lovely day!', 'Beware the Mire...', 'Good luck out there!', 'Stay safe, hero.', 'Is that the hero?'];

export interface AnimalDef { kind: 'CHICKEN' | 'CAT' | 'COW'; x: number; z: number; rx: number; rz: number; speed: number; tint: string }
export const ANIMALS: AnimalDef[] = [
  // wander ellipses stay well inside the fenced pen
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#f1d7a0' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.2, tint: '#e0a070' },
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#ffffff' },
  { kind: 'CAT', x: -24, z: 11, rx: 4, rz: 1.2, speed: 1.9, tint: '#ff9a4a' },
  // farm (outside the gate): cows grazing by the barn, hens by the coop
  { kind: 'COW', x: 29, z: 91, rx: 1.6, rz: 1.6, speed: 0.6, tint: '#ffffff' },
  { kind: 'COW', x: 29.5, z: 98.5, rx: 1.4, rz: 1.4, speed: 0.5, tint: '#8a5a3a' },
  { kind: 'COW', x: 32, z: 103, rx: 1.4, rz: 1.2, speed: 0.5, tint: '#e8e0d0' },
  { kind: 'CHICKEN', x: COOP.x - 4.2, z: COOP.z - 0.8, rx: 1.4, rz: 0.8, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: COOP.x - 4.6, z: COOP.z + 1.6, rx: 1.4, rz: 0.8, speed: 1.0, tint: '#e0a070' },
  { kind: 'CAT', x: 12.5, z: 3.4, rx: 1.8, rz: 0.9, speed: 1.7, tint: '#8a8a96' },
];
