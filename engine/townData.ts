// ============================================================================
// Town layout + NPC cast (pure data, no three / no React). Read by:
//  * engine/mapgen.ts          -> ISLAND_BOXES (small island shape)
//  * engine/systems/village.ts -> colliders, gate position, harvest nodes, NPC pills
//  * engine/systems/npcs.ts    -> NPC / animal behaviour
//  * render/TownScenery.tsx + render/Npcs.tsx -> drawing
// Coordinates are world x / z. A building's door faces +z at rot = 0 (facing vector = (sin rot, cos rot)).
//
// Layout (compact ~60% footprint, functional buildings spread out on their own spots):
//   spawn / plaza (0, 2) -> north: castle path, Skill Trainer (-10.5,-19) on the open paving west of
//   the castle steps (in front of the dark-roofed house at (-19.5,-14))
//   west of the plaza Fortune Teller (-21, 1.5) / Pet Stable (-30, 2), east Blacksmith (27, 2), gate (0, 38) at the end of the
//   main road. Outside the gate: a wide meadow, the Elixir Brewer's hut out in the west meadow (constants SHOP_POSITIONS
//   'BREWER'), the wheat field east of the road beside the barn (FARM), the barn / coop clearing further east, the Endless Tower at the road's end. The Adventure Portal is the plaza's centrepiece.
//   Houses / stalls are decoration. Harvest nodes sit on the outskirts.
// ============================================================================
import { SHRINE_POS, TRAINER_POS } from './world';
import { SHOP_POSITIONS, shopFront } from '../constants';
import { v3Ring, v3Disc } from './kitV3Data';
import { BEACH_BOX, BEACH, onDeckRect, beachWobble, mainBeachK, MAIN_BEACH, mainShoreOff, lakeSouthZ } from './beachData';

/** `kit` = which town_kit_v2 piece draws it (render/townKit.tsx; undefined = the procedural barn / coop), `s` = uniform scale of that
 *  piece. Every house faces south (+z, rot 0) so the north-up camera always sees its front (owner: Echoes-of-Wisdom framing). */
/** (a piece name of town_kit_v2 today; kit v3 houses are added as new names + a HOUSE_KIT row, nothing else changes) */
export type HouseKit = string;
export interface HouseSpec { x: number; z: number; rot: number; w: number; d: number; floors: 1 | 2; wall: string; roof: string; trim: string; chimney: boolean; door: string; kit?: HouseKit; s?: number; /** drawn by a nature_kit_v1 building piece (render/natureKit): barn, farmhouse, chicken_coop (scale `s`) */ nk?: string }
export interface StallSpec { x: number; z: number; rot: number; c1: string; c2: string; goods: 0 | 1 | 2 | 3 }
export interface RoadSpec { x1: number; z1: number; x2: number; z2: number; w: number; /** a trodden dirt path along its whole length (outside the walls; any angle) */ dirt?: boolean }
export interface SignSpec { x: number; z: number }

export const GATE = { x: 0, z: 38 };
/** The gate's two wall_tower_round towers (kit v3, scale r / 3.0) at x = +-x: the passage between them is 2 * (x - r) = 5.3 m wide (render/TownScenery buildGateArch spans it). */
export const GATE_TOWER = { x: 5.75, r: 3.1 };
export const PLAZA = { x: 0, z: 2, r: 9.0 };   // (owner 2026-10-22: big open paved disc; the portal, two statues, four rim lamps and two benches are all that stand on it; the 2x2 shops sit ~3 m off its rim)
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
/** The Adventure Portal (owner 2026-10-21: it moved INSIDE the kingdom, into the middle of the plaza the seven shops ring): the kit v3 `adventure_portal` at scale PORTAL_S,
 *  its front facing south (+z, the avenue / the gate), standing on the plaza's round lawn. `front` = where the hero stands to step in (also the 'came back from a run' spot is 2.5 m south of it). */
export const PORTAL_S = 0.9;
export const PORTAL = { x: 0, z: -0.6, r: 4.4, front: { x: 0, z: 3.8 } };   // (front = the arch's south edge PORTAL.z + 3.06 + 1.3 m)
/** Well on a grass patch (not on the plaza or a road). */
export const WELL_POS = { x: -22.2, z: 17 };   // (the park fountain, south-west quarter)
export const PEN = { x: -12.7, z: 29.6, hw: 3.7, hd: 2.2 };   // (chickens, between two houses of the south-west row)
/** (owner) the horse stable against the town wall just east of the gate: an open-fronted shed (front faces south) and a fenced paddock
 *  in front of it (gap in the west side). The horses (ANIMALS 'HORSE') can be ridden (village.ts mount / dismount). */
export const STABLE = { x: 14, z: 43, w: 10, d: 6, paddock: { x0: 8.8, x1: 21.5, z0: 46.3, z1: 51.0 } };   // (nature_kit_v1 'stable', 10 x 6, open front facing south; paddock = fenced yard in front)
/** Fenced wheat field in front of the gate (outside the walls), east of the road beside the barn (the gap in its fence faces the road). */
export const FARM = { x: 18, z: 94, hw: 7, hd: 6 };   // east of the road, beside the barn (cows graze just east of it)
/** The Elixir Brewer's hut (the shop itself is SHOP_POSITIONS 'BREWER' in constants.ts): out in the west meadow, west of the road, door facing it. */
export const BREWER_HUT = { x: -10.2, z: 106.2, rot: 0 };   // (owner: near the Adventure Portal; west of the mainland road. nature_kit_v1 'brewer_hut', door faces south onto the tower path)
/** Farm buildings outside the gate (barn: cows graze beside it; coop: egg nests in front). */
export const BARN = { x: 41.5, z: 96.8, s: 0.85 };   // nature_kit_v1 'barn' (front = south onto the farm yard), east column of the farm clearing
export const FARMHOUSE = { x: 31, z: 96.2, s: 0.85 };   // nature_kit_v1 'farmhouse', west column (Hollis lives here)
/** (owner 2026-10-24) the animal pen on the lot south of the farm track: fenced on every side, its entrance a gap in the
 *  track's south fence facing the farm yard's own gap (x gate0..gate1). Coop + hens west, cows / sheep / pigs east. */
export const ANIMAL_PEN = { x0: 29.2, x1: 46.2, z0: 113.2, z1: 126.6, gate0: 34.4, gate1: 38.6 };
export const COOP = { x: 32.4, z: 117.0, s: 1 };   // nature_kit_v1 'chicken_coop' (front = south), north-west corner of the animal pen
/** Egg nests in front (south) of the coop (hold nothing; E collects an egg when one is laid, see village.ts). */
export const NESTS: [number, number][] = [[COOP.x - 1.4, COOP.z + 3.4], [COOP.x, COOP.z + 3.7], [COOP.x + 1.4, COOP.z + 3.4]];
/** Where Pip's cat Biscuit hides (only there while the quest is active). */
export const HIDDEN_CAT = { x: 40.6, z: -9.2 };   // (by the tavern's east wall, behind the crates)
/** Corin's lost wheel pin, in the grass by the haystack (only there while his quest needs it). */
export const WHEEL_PIN = { x: FARM.x - 6.4, z: FARM.z - 7.6 };
/** The Endless Tower: a tall stone tower in the forecourt west of the road (door faces the road, +x). */
/** The Endless Tower: deep in the south-west forest at the end of a long, narrow clearing (owner: deeper in), on a raised
 *  knoll (townLift TOWER_KNOLL). The Elixir Brewer keeps her hut on the path just before it. */
export const TOWER_PATH_Z = 112;   // the Brewer's lane: the short woodland path west from the road along this z (it no longer reaches the tower)
/** (owner 2026-10-21) the Tower stands in the old portal clearing at the end of the bending forest road, turned to face the road (north, -z): door = where the hero stands to go in, `out` = where he reappears after a run. */
export const TOWER = { x: 5, z: 155.4, r: 3.9, ry: Math.PI, door: { x: 5, z: 148.7 }, out: { x: 5, z: 146.1 } };   // nature_kit_v1 'endless_tower' (its front is local +z, turned by ry)
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
  [-18, -10, 28, 168],   // (owner) the forest road south past the hamlets to the Endless Tower's clearing
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
/** Castle keep against the north wall, (door faces south). x0..x1 / z0..z1 = footprint of the main hall. */
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
/** (owner) only this boulder of the rockfall breaks (the middle one): the others stay, leaving a gap through. */
export const ROCKFALL_BREAK = 2;
/** Erin's chain is done: the middle boulder is gone (takes the store's npcQuests). */
export const rockfallCleared = (nq: { q: Record<string, { s: number }> } | undefined): boolean => nq?.q?.erin_frost?.s === 2;
/** Monsters on the hermit path (leashed near their spot; respawn a minute after dying). */
export const TOWN_MONSTERS: { kind: 'SLIME' | 'GOBLIN' | 'BOAR' | 'BRUTE' | 'BANDIT'; x: number; z: number }[] = [];   // (removed: no monsters outside town)
/** The keep = town_kit_v2 'castle_keep' at CASTLE_S scale, standing on the terrace (its door at z + d/2 faces south; the door trigger is castleData CASTLE_DOOR).
 *  w x d = footprint incl. the four round towers (colliders ring). */
export const CASTLE_S = 0.85;
export const CASTLE = { x: 0, z: -27.5, w: 17.4, d: 7.7, h: 12 };
/** Raised stone terrace in front of the keep (h above the town paving), reached by a wide flight of stairs in the middle
 *  of its front edge (x +-stairHw, from z1 down to stairZ). The keep stands on it. */
export const TERRACE = { x0: -11, x1: 11, z0: -27.5, z1: -19, h: 2.2, stairHw: 3.5, stairZ: -14.6 };
/** (owner: "elevation with stairs inside the kingdom, varying height, not all flat") Raised stone districts inside the
 *  walls: a block with a simple cream retaining wall + low parapet, reached by flights of steps that run OUTWARD from
 *  the given side (N = toward -z, S = +z, W = -x, E = +x), centred at c along that side, half-width hw. Edges that sit
 *  against the town wall get no parapet / collider (the wall already blocks). Drawn by TownScenery addTier. */
export interface TierStair { side: 'N' | 'S' | 'E' | 'W'; c: number; hw: number }
export interface TierSpec { name: string; x0: number; x1: number; z0: number; z1: number; h: number; stairs: TierStair[] }
export const STEP_RISE = 0.2, STEP_RUN = 0.42;
export const stairRun = (h: number) => Math.ceil(h / STEP_RISE - 1e-6) * STEP_RUN;
export const TIERS: TierSpec[] = [
  { name: 'Chapel Hill', x0: -43.7, x1: -11.4, z0: -39.7, z1: -19.5, h: 1.6, stairs: [{ side: 'S', c: -27, hw: 2.2 }, { side: 'S', c: -38, hw: 2.0 }] },
  { name: 'Tavern Row', x0: 11.4, x1: 43.7, z0: -39.7, z1: -16.5, h: 0.9, stairs: [{ side: 'S', c: 28, hw: 2.2 }, { side: 'S', c: 18.5, hw: 2.0 }, { side: 'S', c: 40, hw: 2.0 }] },
  { name: 'West Rise', x0: -43.7, x1: -29, z0: 13, z1: 36.7, h: 1.2, stairs: [{ side: 'E', c: 23.2, hw: 2.0 }, { side: 'E', c: 32.4, hw: 2.0 }, { side: 'N', c: -31.2, hw: 2.0 }] },
  { name: 'East Rise', x0: 29, x1: 43.7, z0: 13, z1: 36.7, h: 0.8, stairs: [{ side: 'W', c: 23.2, hw: 2.0 }, { side: 'W', c: 32.4, hw: 2.0 }, { side: 'N', c: 31.2, hw: 2.0 }] },
];
/** Edge of a tier that runs along the town wall (no parapet, no collider). */
export const tierEdgeOnWall = (side: 'N' | 'S' | 'E' | 'W', T: TierSpec) =>
  side === 'W' ? T.x0 < WALL.x0 + 2 : side === 'E' ? T.x1 > WALL.x1 - 2 : side === 'N' ? T.z0 < WALL.z0 + 2 : T.z1 > WALL.z1 - 2;
function tierLift(x: number, z: number): number {
  for (const T of TIERS) {
    if (x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1) return T.h;
    const run = stairRun(T.h);
    for (const s of T.stairs) {
      if (s.side === 'S' || s.side === 'N') {
        if (Math.abs(x - s.c) > s.hw) continue;
        const d = s.side === 'S' ? z - T.z1 : T.z0 - z;
        if (d >= 0 && d <= run) return T.h * (1 - d / run);
      } else {
        if (Math.abs(z - s.c) > s.hw) continue;
        const d = s.side === 'E' ? x - T.x1 : T.x0 - x;
        if (d >= 0 && d <= run) return T.h * (1 - d / run);
      }
    }
  }
  return 0;
}
/** Ground height at (x, z) in the town (the raised districts, the castle terrace + their stairs; 0 elsewhere). */
export function townLift(x: number, z: number): number {
  { const t = tierLift(x, z); if (t > 0) return t; }
  // the bridge deck: a gentle arch over the river
  if (Math.abs(x) <= BRIDGE.hw + 0.6 && z > BRIDGE.z0 && z < BRIDGE.z1) { const t = (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0); return BRIDGE.h * (1 - (2 * t - 1) ** 2); }
  if (onMineBridge(x, z, 0.3)) { const t = (z - MINE_BRIDGE.z0) / (MINE_BRIDGE.z1 - MINE_BRIDGE.z0); return MINE_BRIDGE.h * (1 - (2 * t - 1) ** 2); }
  // the Endless Tower's knoll (a raised mound; the path ramps up to the door)
  { const kn = towerKnollAt(x, z); if (kn > 0) return kn; }
  const T = TERRACE;
  if (x < T.x0 || x > T.x1 || z > T.stairZ || z < T.z0 - 12) return 0;
  if (z <= T.z1) return T.h;
  if (Math.abs(x) <= T.stairHw) return T.h * (T.stairZ - z) / (T.stairZ - T.z1);
  return 0;
}
/** Landmarks (owner: "more structure, not more houses"). Doors face +z at rot 0 like the houses.
 *  CHURCH: the chapel west of the keep (enterable, see churchData); TAVERN: the Golden Tankard east of the keep;
 *  WINDMILL: on the meadow by the south-east wall tower; STATUE: the founder's statue in the middle of the plaza. */
/** The chapel = town_kit_v2 'chapel' (nave 5.6 x 9 centred here, the bell tower beside it on the WEST side, front door at z + d/2 facing south). */
export const CHURCH = { x: -26, z: -26, w: 5.6, d: 9, rot: 0 };
/** (owner) the adventurer's own little house in the south-west corner of the walls, door facing the town (enterable:
 *  the HOME area, engine/homeData.ts). */
export const HERO_HOUSE = { x: -38.6, z: 29.4, w: 4.25, d: 3.9, rot: 0, wake: { x: -38.6, z: 33.8 } };   // (on the West Rise, door faces south toward the camera)
/** The Golden Tankard = town_kit_v2 'tavern' drawn TAVERN_DZ south-of-centre-minus (piece origin = TAVERN.z + TAVERN_DZ); its front door sits at z + d/2. */
export const TAVERN = { x: 28, z: -21, w: 9.6, d: 6.2, rot: 0 };
export const TAVERN_DZ = -1.4;
export const WINDMILL = { x: 31, z: 83.6, r: 3.4, s: 0.95 };   // nature_kit_v1 'windmill' (the blades spin at the hub on its south face)
/** Extra crop fields on the mainland (fenced, drawn by TownScenery): wheat / cabbages / pumpkins. */
export interface FieldSpec { x: number; z: number; hw: number; hd: number; crop: 'WHEAT' | 'CABBAGE' | 'PUMPKIN' }
export const FIELDS: FieldSpec[] = [
  { x: 18, z: 81.6, hw: 7, hd: 3, crop: 'CABBAGE' },
  { x: -22, z: 89, hw: 7, hd: 4.5, crop: 'WHEAT' },
  { x: -22, z: 100.5, hw: 7, hd: 3.8, crop: 'PUMPKIN' },
];
/** The plaza centrepiece (owner 2026-10-21): a kerbed round lawn (top y lawnY) the Adventure Portal stands on, with a flower_bed_round arc (bedR) across its south front (a gap at the door).
 *  plinthR / statueY = the little plinths of PLAZA_STATUES. */
export const PLAZA_DECOR = { lawnR: 0, kerbR: 5.2, bedR: 0, bedS: 0, plinthR: 0.95, lawnY: 0.12, statueY: 0.62 };   // (no lawn / beds any more: lawnY = the paving height the portal stands on; kerbR = the claimed radius round the portal)
export const STATUE = { x: 0, z: 2, r: 3.7 };   // (the lawn centre; the portal stands in it)
/** Two little guardian statues (statue_hero shrunk to s, on small round plinths) flank the portal's door on its lawn (the founder's statue moved here from the plaza's middle). */
export const PLAZA_STATUES: { x: number; z: number; r: number; s: number }[] = [{ x: -5.2, z: 3.4, r: 1.0, s: 0.85 }, { x: 5.2, z: 3.4, r: 1.0, s: 0.85 }];
/** The old graveyard on the strip between the chapel and the west wall (owner): fenced, a path through the middle from
 *  the chapel's side door (east gate) to the crypt at the west end, gravestones in four blocks, a dead tree, lanterns. */
export const GRAVEYARD = { x0: -43.4, x1: -32.8, z0: -39.6, z1: -21, pathZ: -31.5, gateX: -38 };
export const CRYPT = { x: -41.6, z: -31.5 };
/** Gravestones [x, z, kind] (0 slab, 1 cross, 2 rounded). */
export const GRAVES: [number, number, number][] = (() => {
  const g: [number, number, number][] = [];
  let k = 0;
  for (const z of [-37.6, -35.2, -27.6, -25.2, -33.4]) for (const x of [-42, -34.7]) { if (z === -33.4 && x < -40) continue; g.push([x + (k % 3 === 1 ? 0.25 : 0), z, k % 3]); k++; }   // (two columns of stones either side of a 4.7 m aisle from the gate (x -38) to the crypt path: the walk grid needs the room)
  return g;
})();
/** The chapel's side door (west wall) into the graveyard; town side spot + interact radius. */
export const CHAPEL_SIDE = { x: CHURCH.x - CHURCH.w / 2 - 2.0, z: CHURCH.z - 3.7, r: 2.6 };
/** Seats (benches) the hero can sit on in the town: x, z, facing yaw (the way a seated hero looks), seat height. */
export interface SeatSpec { x: number; z: number; yaw: number; y: number }
export const TOWN_SEATS: SeatSpec[] = [
  { x: 8.1, z: 2, yaw: -Math.PI / 2, y: 0.55 }, { x: -8.1, z: 2, yaw: Math.PI / 2, y: 0.55 },   // the plaza's east / west rim between the two shop paths, facing the portal
  { x: CHURCH.x + CHURCH.w / 2 - 0.6, z: CHURCH.z + CHURCH.d / 2 + 2.0, yaw: 0, y: 0.55 },     // in front of the chapel (its yard bench)
  { x: -36, z: -22.3, yaw: Math.PI, y: 0.55 },                                                  // the graveyard, looking over the graves
  // the park round the fountain (owner 2026-10-23: more benches, none in the N / E / S entrance gaps): four on the diagonals 
  { x: WELL_POS.x - 3.0, z: WELL_POS.z - 2.4, yaw: 0, y: 0.55 }, { x: WELL_POS.x + 3.0, z: WELL_POS.z - 2.4, yaw: 0, y: 0.55 },
  { x: WELL_POS.x - 3.0, z: WELL_POS.z + 3.0, yaw: Math.PI, y: 0.55 }, { x: WELL_POS.x + 3.0, z: WELL_POS.z + 3.0, yaw: Math.PI, y: 0.55 },
  { x: 24.4, z: -8.9, yaw: 0, y: 0.55 }, { x: 31.4, z: -8.9, yaw: 0, y: 0.55 },                 // the tavern square
  { x: 14.5, z: 12.3, yaw: Math.PI, y: 0.55 }, { x: -14.5, z: 12.3, yaw: Math.PI, y: 0.55 },     // south street, facing the shops
  // (owner 2026-10-23) the avenue to the gate: benches just outside each edge, backs to the road (facing the houses / shops), clear of the lane at z 23
  { x: -4.8, z: 16.8, yaw: -Math.PI / 2, y: 0.55 }, { x: 4.8, z: 29.8, yaw: Math.PI / 2, y: 0.55 }, { x: -4.8, z: 29.8, yaw: -Math.PI / 2, y: 0.55 },
  { x: -6.5, z: 46, yaw: -Math.PI / 2, y: 0.55 }, { x: 6.5, z: 52.6, yaw: Math.PI / 2, y: 0.55 },   // the meadow, both sides facing the road
  // (owner) benches on the green looking out over the river (yaw 0 = facing south), two of them in the little east park
  ...[-30, -20, 22.6, 34, 39.6].map((x) => ({ x, z: riverBank(x, 0) - 3.2, yaw: 0, y: 0.55 })),   // (the east park's benches flank the gazebo)
];

/** The little park by the river east of the bridge (nature_kit_v1 'gazebo' + 'park_fountain'; the benches are TOWN_SEATS, fronts south). */
export const PARK_EAST = { gazebo: { x: 28, z: 48.8 }, fountain: { x: 36.4, z: 49.4 } };
/** Village wells (nature_kit_v1 'well'): the farm yard + one between the houses of each south hamlet. */
export const WELLS: [number, number][] = [[30.8, 107.3], [18, 123.2], [-18.6, 123.4], [25.2, 28.0]];   // (the last one: a courtyard well inside the walls)
/** Signposts (nature_kit_v1 'signpost', 3.1 m wide: x, z) at the bridge's south end; the beach entrance + the camp have their own (beachData ENTRY_SIGN, caveData MINE_CAMP.sign). */
export const SIGNPOSTS: [number, number][] = [[6.2, 80.6], [-6.4, 80.6]];
/** Stepping-stone paths (nature_kit_v1 'stone_path_tile', every ~1.3 m along each run: x1, z1, x2, z2): doors and the park. */
export const STEP_PATHS: [number, number, number, number][] = [
  [30.1, 100.2, 30.1, 101.6], [41.4, 102.0, 41.4, 103.4],   // farmhouse + barn doors
  [-9.2, 110.0, -9.2, 111.2],                                // the brewer's door, onto the path
  [-74, 112.9, -74, 111.6],                                  // the tower's door
  [4.6, 54.4, 25.2, 54.4], [26.4, 53.8, 27.6, 53.0],       // the park path from the road to the gazebo steps
  [-42, 50.2, -46.5, 47.4],                                  // the dirt path's last steps to the beach boardwalk
];
/** Kit footprint (w x d at scale 1) + door x offset of each house piece (public/models/town/town_kit_v2.glb). */
export const HOUSE_KIT: Record<string, { w: number; d: number; doorX: number; chimney: [number, number, number]; /** front edge (+z) and half width of the piece incl. roof, scale 1: yards / fences hang off these */ front: number; half: number }> = {
  house_small: { w: 5.0, d: 4.6, doorX: -0.95, chimney: [1.2, 6.0, -0.6], front: 3.7, half: 3.2 },
  house_two_storey: { w: 5.4, d: 4.8, doorX: -1.1, chimney: [-1.4, 8.4, -0.5], front: 3.8, half: 3.4 },
  house_gabled_narrow: { w: 3.8, d: 6.2, doorX: 0, chimney: [0, 9.4, -1.2], front: 4.5, half: 2.9 },
  house_tower: { w: 5.2, d: 4.4, doorX: 1.0, chimney: [1.0, 6.0, -0.8], front: 3.6, half: 3.4 },
};
const K = (kit: HouseKit, x: number, z: number, s = 0.9, rot = 0): HouseSpec => {
  const n = HOUSE_COUNT++, k = HOUSE_KIT[kit] ?? HOUSE_KIT.house_small;
  return { x, z, rot, w: k.w * s, d: k.d * s, floors: kit === 'house_two_storey' || kit === 'house_gabled_narrow' ? 2 : 1, wall: WALLS[(n * 3 + 1) % WALLS.length], roof: ROOFS[(n * 5 + 2) % ROOFS.length], trim: '#f4ead2', chimney: n % 2 === 0, door: DOORS[n % DOORS.length], kit, s };
};
/** nature_kit_v1 piece footprints at scale 1: [x0, x1, z0, z1, height] (front = +z, origin = ground centre), measured from public/models/town/nature_kit_v1.glb.
 *  The colliders (kitRing below), the minimap and the layout checks all read this one table. */
export const NK: Record<string, [number, number, number, number, number]> = {
  barn: [-4.22, 4.22, -5.23, 5.23, 6.0], farmhouse: [-3.7, 3.7, -3.18, 3.55, 5.9], windmill: [-2.85, 2.85, -2.8, 3.35, 8.2], stable: [-4.98, 4.98, -2.99, 2.99, 4.65],
  chicken_coop: [-1.3, 1.75, -1.0, 1.91, 2.7], mining_camp_tent: [-2.82, 2.95, -2.65, 2.65, 2.75], mine_entrance: [-3.66, 3.65, -2.6, 5.4, 5.04], brewer_hut: [-2.95, 3.3, -2.81, 3.14, 5.2],
  endless_tower: [-3.9, 3.9, -3.9, 5.75, 27.5], gazebo: [-3.4, 3.4, -3.4, 4.0, 5.24], well: [-1.57, 1.57, -1.24, 1.24, 4.2], park_fountain: [-2.05, 2.05, -2.05, 2.05, 2.95],
  market_cart: [-1.25, 1.25, -0.96, 2.65, 3.11], haystack: [-2.07, 2.11, -2.21, 1.62, 2.45], small_boat: [-0.94, 0.94, -1.75, 1.75, 1.07], park_bench: [-0.95, 0.95, -0.41, 0.33, 1.22],
};
/** Movement colliders of a kit piece's rectangular footprint (piece scale `s`, at x, z): a ring of circles of radius r along its outline,
 *  inset so the outermost reach is the footprint edge + 0.3. `open: 'front'` leaves the south side free (the stable's open shed). */
export function kitRing(c: [number, number, number][], piece: string, x: number, z: number, s = 1, r = 1.0, open: '' | 'front' = ''): void {
  const f = NK[piece], x0 = x + f[0] * s + r - 0.3, x1 = x + f[1] * s - r + 0.3, z0 = z + f[2] * s + r - 0.3, z1 = z + f[3] * s - r + 0.3;
  const nx = Math.max(1, Math.ceil((x1 - x0) / (r * 1.5))), nz = Math.max(1, Math.ceil((z1 - z0) / (r * 1.5)));
  for (let i = 0; i <= nx; i++) { const px = x0 + ((x1 - x0) * i) / nx; c.push([px, z0, r]); if (open !== 'front') c.push([px, z1, r]); }
  for (let j = 1; j < nz; j++) { const pz = z0 + ((z1 - z0) * j) / nz; c.push([x0, pz, r], [x1, pz, r]); }
  if (open === 'front') c.push([x0, z1, r], [x1, z1, r]);
}
const NKB = (nk: string, x: number, z: number, s: number): HouseSpec => { const f = NK[nk]; return { x, z, rot: 0, w: (f[1] - f[0]) * s, d: (f[3] - f[2]) * s, floors: 1, wall: '#e9dfc8', roof: '#3b2a20', trim: '#f4ead2', chimney: false, door: '#5a3a1e', nk, s }; };
/** Chimney cap of the farmhouse piece (piece space, scale 1) for the smoke FX. */
export const NK_CHIMNEY: Record<string, [number, number, number]> = { farmhouse: [-2.3, 6.0, -0.8] };
/** Decorative houses: every front faces south (+z, toward the north-up camera) and none stands in front of a shop (the shops
 *  line the south street's north side at z 1.5; houses go behind them, between the streets or out on the rises / hamlets). */
export const HOUSES: HouseSpec[] = [
  // the farm outside the gate (nature_kit_v1, fronts south): the farmhouse (west column), the red barn (east column), the chicken coop in the yard
  { ...NKB('farmhouse', FARMHOUSE.x, FARMHOUSE.z, FARMHOUSE.s), chimney: true },
  NKB('barn', BARN.x, BARN.z, BARN.s),
  NKB('chicken_coop', COOP.x, COOP.z, COOP.s),
  // the hamlet on the meadow west of the coop, beside the portal
  K('house_small', 13, 121, 0.95), K('house_two_storey', 23, 123.5, 0.8),
  // a second little hamlet west of the portal
  K('house_small', -13.5, 121, 0.95), K('house_two_storey', -23.5, 124, 0.8), K('house_tower', -33, 120, 0.8),
  // (owner) the adventurer's house (HERO_HOUSE): small, one floor, on the West Rise, door facing south
  { ...K('house_small', HERO_HOUSE.x, HERO_HOUSE.z, 0.85), w: HERO_HOUSE.w, d: HERO_HOUSE.d, wall: '#e9dfc8', chimney: true, door: '#8a2f22' },
  // ---- inside the walls (owner 2026-10-21: plain medieval houses packed in straight terraces on the streets, no yards): every house is AXIS-ALIGNED (rot 0 = door south, PI = door north),
  // fronts flush to the street / walkway (~0.6 m of kerb), 0.2 m between neighbours; none within 1.5 m of a stair flight or its approach (lot script in docs/TOWN_PLAN.md).
  // chapel quarter (on Chapel Hill): the sexton's cottage
  K('house_small', -14.3, -34.5, 0.85),   // (clear of the wall tower's door + stairs at x -21)
  // Tavern Row tier (owner: fewer houses up here): three on the back row (fronts z -30), one cottage beside the tavern (front z -21)
  K('house_two_storey', 15.8, -33.04, 0.8), K('house_small', 31.24, -33.15, 0.85), K('house_gabled_narrow', 36.6, -33.4, 0.8),   // (the back row stands clear of the wall-tower doors / wall stairs at x 21 and 42)
  K('house_two_storey', 17, -24.2, 0.8),
  // the old shop row, north of the south street (fronts z 6.9)
  // (owner: more space) two houses west with a gap, the Armory beside them; east: the Potion Shop, then one narrow house
  K('house_two_storey', -40.2, 3.86, 0.8), K('house_small', -29.72, 3.75, 0.85),
  K('house_gabled_narrow', 38.8, 3.3, 0.8),
  // south of the south street, east of the avenue (door north onto the street), then the rises (fronts on the lane z 21) and the south walkway (fronts z 32.5)
  K('house_tower', 22.8, 15.3, 0.8, Math.PI),
  K('house_two_storey', -38.4, 17.96, 0.8), K('house_small', 38.8, 17.85, 0.85),
  K('house_two_storey', 18.5, 29.46, 0.8), K('house_two_storey', 38.2, 29.46, 0.8),
  // (owner 2026-10-23: fill the empty paving, nothing on a street / lane / stair): either side of the avenue's south half, one on the north street's west side
  K('house_small', 10.5, 29.46, 0.85), K('house_gabled_narrow', -22.5, 29.46, 0.8),   // (owner: the two houses either side of the avenue just south of the plaza were removed)
  // (owner 2026-10-23: dense medieval town: terraced rows on both sides of the streets, 2.2 m alleys every third house; generated once by a validity scan: clear of every street, stair approach, wall-tower door, shop front, park and plaza)
  // N-street north
  K('house_small', -32.88, -10.26, 0.85), K('house_gabled_narrow', 34.57, -10.78, 0.8),
  // N-street south
  K('house_gabled_narrow', -41.48, -1.22, 0.8, Math.PI), K('house_small', -37.53, -1.75, 0.85, Math.PI), K('house_tower', -33.03, -1.94, 0.8, Math.PI),
  K('house_two_storey', -26.59, -1.78, 0.8, Math.PI), K('house_gabled_narrow', -22.61, -1.22, 0.8, Math.PI),
  // N-street south E
  K('house_two_storey', 38.16, -1.78, 0.8, Math.PI),
  // S-street north
  K('house_gabled_narrow', -23.98, 5.22, 0.8),
  // lane north
  // (owner 2026-10-23: the lane's two houses here became Madame Zora's shop + the Tech House, constants SHOP_POSITIONS)
  K('house_two_storey', 32, 3.0, 0.8), K('house_small', 24.6, 2.4, 0.85),   // (houses where those two shops stood on the East Rise)
  // tavern row 2
  K('house_small', 21.63, -27.35, 0.85, Math.PI), K('house_two_storey', 26.21, -27.38, 0.8, Math.PI), K('house_small', 30.8, -27.35, 0.85, Math.PI),
  K('house_small', 37.25, -27.35, 0.85, Math.PI), K('house_gabled_narrow', 41.19, -26.82, 0.8, Math.PI),
  // hill row b
  K('house_two_storey', -29.34, -34.48, 0.8, Math.PI), K('house_tower', -9.3, -34.64, 0.8, Math.PI),
];

/** (no yards: the houses stand directly on the streets, see HOUSES) */
export const YARD_PLANTERS: { x: number; z: number; w: number; d: number; kind: 0 | 1 }[] = [];

/** Each town shop's own composition (owner 2026-10-20: every shop unique, not one row). The counter + keeper are always the v2 `shop_stall_house`
 *  (placed at SHOP_POSITIONS, yaw `rot`); around it: `extra` = more building pieces, `dress` = town_kit_v2 props, `nk` = nature kit props, `cluster` = barrel + crate
 *  clusters. Every entry is [piece, dx, dz, yaw, scale] in the shop's local frame (+z = its front). Kit v3 swaps (market_tent_red / green, flower_cart, fruit_crate, notice_board ...)
 *  are piece-name edits here. `col` = solid radius of that entry (0 = decoration). */
/** `col` = solid radius of that entry (0 = decoration; for a kit v3 piece in `nk` a NEGATIVE value = a ring of that radius round its footprint, see engine/kitV3Data v3Ring); `y` = height above the ground (wall-mounted kit v3 pieces). */
export type LookEntry = [piece: string, dx: number, dz: number, yaw: number, s: number, col?: number, y?: number];
export interface ShopLook { extra: LookEntry[]; dress: LookEntry[]; nk: LookEntry[]; cluster: [number, number, number][]; /** 'smoke' = chimney smoke (Blacksmith) */ note: string }
export const SHOP_LOOK: Partial<Record<string, ShopLook>> = {
  // kit v3 signatures (owner 2026-10-21): every shop has its own pieces in `nk` (drawn through engine/townFill FILL, batched with the nature kit); the v2 `dress` entries are lamps / planters.
  // charm on all of them: potted_plant_a / b flanking the counter, an awning_red / green over the side window.
  PETS: { note: 'doghouse in a little pen of pet_pen_fence behind the shop, bird_cage, flower boxes (2x2 west pair, south)', extra: [], dress: [['flower_planter', -2.9, 5.0, 0, 1, 0.8], ['flower_planter', 2.9, 5.0, 0, 1, 0.8]],
    nk: [['doghouse', 0.2, -4.4, 0.5, 1.0, 0.8], ['pet_pen_fence', 0, -6.3, 0, 1.0], ['pet_pen_fence', -2.2, -4.6, Math.PI / 2, 1.0], ['pet_pen_fence', 2.2, -4.6, Math.PI / 2, 1.0],
      ['bird_cage', 2.7, 2.9, 0.3, 1.0, 0.4], ['potted_plant_a', -2.8, 3.4, 0, 1.0, 0.35], ['awning_green', 2.9, 0.0, Math.PI / 2, 1.0, 0, 2.3]], cluster: [] },
  FORTUNE: { note: 'a striped fortune_tent behind, hanging lanterns (2x2 west pair, north)', extra: [], dress: [['flower_planter', -2.8, 4.8, 0, 1, 0.8]],
    nk: [['fortune_tent', 0.3, -5.0, 0.4, 0.7, -1.0], ['hanging_lantern', -2.8, 4.4, 0, 1.0, 0.3], ['hanging_lantern', 2.8, 3.6, 0, 1.0, 0.3], ['potted_plant_b', -2.8, 3.4, 0, 1.0, 0.35], ['awning_red', 2.9, 0.0, Math.PI / 2, 1.0, 0, 2.3]], cluster: [] },
  SUPPLIES: { note: 'herb garden box, a potion shelf cart and a bubbling cauldron', extra: [], dress: [['flower_planter', -3.6, 3.6, 0, 1, 0.8], ['lamp_post', 1.95, 4.5, 0, 0.72, 0.3], ['lamp_post', -1.95, 4.5, 0, 0.72, 0.3]],
    nk: [['herb_garden_box', 0.4, -4.8, 0.1, 1.0, -0.55], ['potion_shelf_cart', 3.6, -4.2, -0.2, 1.0, -0.6], ['cauldron', -4.1, 3.4, 0.3, 1.0, 0.9], ['potted_plant_a', 3.8, 3.4, 0, 1.0, 0.35], ['awning_green', 2.9, 0.0, Math.PI / 2, 1.0, 0, 2.3]], cluster: [] },   // (the shop stands between the graveyard aisle x -38 and the chapel road x -26: props in front + behind only)
  ARMORY: { note: 'shield rack, armor stand, red banner poles (south of the south street, where the Pets shop stood; faces north)', extra: [], dress: [['lamp_post', 1.95, 4.5, 0, 0.72, 0.3], ['lamp_post', -1.95, 4.5, 0, 0.72, 0.3]],
    nk: [['shield_rack', -4.6, 2.4, 0.3, 1.0, -0.5], ['armor_stand', 4.6, 2.6, -0.4, 1.0, 0.6], ['banner_pole_red', -4.2, 4.6, 0, 0.9, 0.3], ['banner_pole_red', 4.3, 5.3, 0, 0.9, 0.3], ['potted_plant_b', 3.7, 3.4, 0, 1.0, 0.35], ['awning_red', -2.9, 0.0, -Math.PI / 2, 1.0, 0, 2.3]], cluster: [] },
  WAREHOUSE: { note: 'big crate stack + hay cart behind (2x2 east pair, south)', extra: [], dress: [['lamp_post', -1.95, 5.2, 0, 0.72, 0.3]],
    nk: [['crate_stack_big', 1.5, -3.5, 0.2, 1.0, -0.75], ['cart_hay', -1.9, -3.6, 0.45, 1.0, -0.65], ['potted_plant_a', -2.8, 3.4, 0, 1.0, 0.35], ['potted_plant_b', 2.8, 3.4, 0, 1.0, 0.35]], cluster: [] },
  BLACKSMITH: { note: 'forge yard: forge_furnace + weapon_rack behind, anvil_big and grindstone by the counter, chimney smoke (2x2 east pair, north)', extra: [], dress: [],
    nk: [['forge_furnace', -1.6, -3.6, 0.1, 1.0, -0.7], ['anvil_big', -2.6, 4.7, 0.7, 1.0, 0.8], ['grindstone', 2.9, 4.4, -0.7, 1.0, 0.6], ['weapon_rack', 2.4, -3.2, Math.PI / 2, 1.0, -0.4], ['potted_plant_a', 2.9, 3.0, 0, 1.0, 0.35]], cluster: [] },
  TECH: { note: 'tech_tower_small, lanterns', extra: [], dress: [['flower_planter', 3.0, 4.6, 0, 1, 0.8]],
    nk: [['tech_tower_small', 1.1, -4.9, 0.9, 0.8, -1.0], ['potted_plant_b', -3.9, 3.5, 0, 1.0, 0.35], ['awning_green', -2.9, 0.0, -Math.PI / 2, 1.0, 0, 2.3], ['bush_cluster', 5.2, 1.8, 0, 0.8, 0.8]], cluster: [] },
};
/** Shop-local (dx, dz) -> world (the front is +z turned by `rot`, +x = its right). */
export const shopLocal = (px: number, pz: number, rot: number, dx: number, dz: number): [number, number] => [px + dx * Math.cos(rot) + dz * Math.sin(rot), pz - dx * Math.sin(rot) + dz * Math.cos(rot)];

/** Decorative market stalls (town_kit_v2 'market_stall', fronts to the south; the useful shops are the SHOP_POSITIONS row). */
export const STALLS: StallSpec[] = [   // (owner 2026-10-23: two cosy stalls beside the castle path, off the streets)
  { x: -8.4, z: -11.8, rot: 0, c1: '#d8584a', c2: '#fff3e0', goods: 0 }, { x: 8.4, z: -12.6, rot: 0, c1: '#4a8fd8', c2: '#fff3e0', goods: 1 },
];
/** Shop row: shop x of the 7 kit shops (z 1.5, rot 0, in constants SHOP_POSITIONS); the gaps between them hold lamps, signs and barrels. */
export const SHOP_ROW_Z = 1.5;
export const SHOP_ROW_X = [-39.5, -31, -22.5, 14, 22.5, 31, 39.5];
/** Gap centres of the shop row (between two shops, plus the stall slot): x of a lamp / sign / barrel group. */
export const SHOP_GAPS = [-35.25, -26.75, -18.25, 18.25, 26.75, 35.25];

/**
 * Clean road network (all strips are axis-aligned and drawn in one flat layer, see TownScenery.buildRoads):
 *  - main avenue (w5): plaza -> gate -> on south into the farmland
 *  - two streets (w4) tangent to the plaza: south street (shops / houses) and north street (board, altar, trainer)
 *  - one lane (w4) to the Pet Stable (its barn door faces south onto the lane)
 *  - short straight branches (w2.8) that end exactly at each building's door / interaction point.
 * Door x of the shops: Potion Shop door at local x -1.4 (world -21.9), Blacksmith door local x -1.6 (world 25.4).
 */
export const ROAD_W = { main: 5.2, street: 3.4, branch: 2.8, lane: 3 };   // (owner 2026-10-20: cosy widths: main road ~5-6 m, streets / lanes ~3 m)
/** A path from each town shop's front point (4.3 m in front of its counter, turned by the shop's yaw) to the street / lane it opens on (anchor z for 'z', anchor x for 'x'). */
const spurTo = (type: string, anchor: number, axis: 'z' | 'x'): RoadSpec => {
  const sp = SHOP_POSITIONS.find((q) => q.type === type)!, f = shopFront(sp, 4.3);
  return axis === 'z' ? { x1: f.x, z1: anchor, x2: f.x, z2: f.z, w: 3.0 } : { x1: anchor, z1: f.z, x2: f.x, z2: f.z, w: 3.0 };
};
/** Each ring shop's path: from its front point straight to the plaza rim (the Tech House on the outer east band: to the south street). */
const spurPlaza = (type: string): RoadSpec => {
  const sp = SHOP_POSITIONS.find((q) => q.type === type)!, f = shopFront(sp, 4.3), dx = PLAZA.x - f.x, dz = PLAZA.z - f.z, l = Math.hypot(dx, dz), k = (l - (PLAZA.r - 0.4)) / l;
  return { x1: f.x, z1: f.z, x2: f.x + dx * k, z2: f.z + dz * k, w: 2.8 };
};
const SHOP_SPURS: RoadSpec[] = [spurTo('FORTUNE', 10, 'z'), spurTo('ARMORY', 10, 'z'), spurPlaza('PETS'), spurPlaza('WAREHOUSE'), spurPlaza('SUPPLIES'), spurPlaza('BLACKSMITH'), spurTo('TECH', 10, 'z')];
export const ROADS: RoadSpec[] = [
  { x1: 0, z1: 8, x2: 0, z2: BRIDGE.z0 + 0.3, w: ROAD_W.main },   // main avenue plaza -> gate -> the bridge
  { x1: -38, z1: 10, x2: 38, z2: 10, w: ROAD_W.street },         // south street
  { x1: -40, z1: -6, x2: 40, z2: -6, w: ROAD_W.street },         // north street (west past the cottages to the chapel, east to the tavern square)
  // residential lanes (docs/TOWN_PLAN.md): one lane either side of the avenue between the two rows of houses; the outer ends climb the rises
  { x1: -42, z1: 23.2, x2: -2.4, z2: 23.2, w: ROAD_W.lane }, { x1: 2.4, z1: 23.2, x2: 42, z2: 23.2, w: ROAD_W.lane },
  // (the shops' counters are reached from the street / lane in front of each: SHOP_SPURS, a short path from the shop's front point to the street, whatever its yaw)
  ...SHOP_SPURS,
  { x1: -38, z1: -6, x2: -38, z2: -16.2, w: ROAD_W.branch }, { x1: 28, z1: -6, x2: 28, z2: -12.5, w: ROAD_W.branch },   // (the graveyard stairs and the tavern square get their own paths off the north street, the barriers line its edge)
  { x1: 0, z1: -6, x2: 0, z2: TERRACE.stairZ + 0.3, w: ROAD_W.branch + 0.6 },     // castle path (to the terrace stairs)
  { x1: CHURCH.x, z1: -6, x2: CHURCH.x, z2: CHURCH.z + CHURCH.d / 2 + 0.4, w: ROAD_W.branch + 0.6 },   // chapel door
  { x1: TAVERN.x, z1: -12.5, x2: TAVERN.x, z2: TAVERN.z + TAVERN.d / 2 + 0.4, w: ROAD_W.branch },   // tavern door
  { x1: 18, z1: -12.5, x2: TAVERN.x + 1.4, z2: -12.5, w: ROAD_W.branch },   // lane from the north street end to the tavern
  { x1: TRAINER_POS[0], z1: -6, x2: TRAINER_POS[0], z2: TRAINER_POS[2] + 2.4, w: ROAD_W.branch }, // skill trainer (west of the castle terrace)
  { x1: 0, z1: FARM.z, x2: FARM.x - FARM.hw + 0.6, z2: FARM.z, w: ROAD_W.branch },   // farm gate (the field's west side, facing the road)
  { x1: 0, z1: TOWER_PATH_Z, x2: -21, z2: TOWER_PATH_Z, w: 1.8 },   // the Brewer's lane (a narrow woodland path west from the road to her door and the turn-around beyond it)
  { x1: 0, z1: BRIDGE.z1 - 0.3, x2: 0, z2: 128, w: ROAD_W.main - 0.6 },   // across the bridge, on through the mainland past the hamlets
  { x1: 0, z1: 128, x2: 3.6, z2: 137, w: ROAD_W.main - 0.6 }, { x1: 3.6, z1: 137, x2: TOWER.door.x, z2: TOWER.door.z + 0.4, w: ROAD_W.main - 0.6 },   // (owner) bending into the forest to the Endless Tower
  // meadow -> lakeside beach: west past the Elixir Brewer's hut and the hay cart, round the south-west corner tower to the boardwalk
  { x1: -2.5, z1: 52, x2: -19, z2: 52.2, w: 2.6, dirt: true }, { x1: -19, z1: 52.2, x2: -36, z2: 53, w: 2.6, dirt: true }, { x1: -36, z1: 53, x2: -46.5, z2: 47.2, w: 2.6, dirt: true },
  // the farm track: from the forest road behind the farm, east past the coop nests, up to the mine path (owner: connect it)
  { x1: 2.4, z1: 110.6, x2: 24, z2: 111.2, w: 2.6, dirt: true }, { x1: 24, z1: 111.2, x2: 43, z2: 111, w: 2.6, dirt: true }, { x1: 43, z1: 111, x2: 48.5, z2: 100.5, w: 2.6, dirt: true },
  // up through the fence gap into the farm yard, to the farmhouse door and the barn doors
  { x1: 35.8, z1: 110.8, x2: 35.8, z2: 104.6, w: 2.8, dirt: true }, { x1: 35.8, z1: 104.6, x2: 30.1, z2: 100.9, w: 2.4, dirt: true }, { x1: 35.8, z1: 104.6, x2: 41.4, z2: 102.7, w: 2.4, dirt: true },
  // the mines path: from the farm track's corner up the strip east of the farm, along the east side into the mining camp (owner: no branch to the coop)
{ x1: 48.5, z1: 100.5, x2: 54, z2: 91, w: 2.6, dirt: true }, { x1: 54, z1: 91, x2: 58, z2: 79, w: 2.6, dirt: true },
  { x1: 58, z1: 79, x2: 59.5, z2: 60, w: 2.6, dirt: true }, { x1: 59.5, z1: 60, x2: 60, z2: 33, w: 2.6, dirt: true }, { x1: 60, z1: 33, x2: 62.5, z2: 21, w: 2.6, dirt: true },
  // inside the camp: on to the mine mouth, and the narrow back trail coming down from the north
  { x1: 62.5, z1: 21, x2: 66.5, z2: 15.2, w: 2.6, dirt: true }, { x1: 66.5, z1: 15.2, x2: 70.4, z2: 12.8, w: 2.6, dirt: true },
  { x1: 50.6, z1: -8, x2: 55.5, z2: 3.5, w: 2.2, dirt: true }, { x1: 55.5, z1: 3.5, x2: 62.5, z2: 13, w: 2.2, dirt: true },
];

// --------------------------------------------------------------- town wall ---
/** Stone town wall ring. Centre line of the wall; the south side is cut by the gatehouse (GATE towers at x = +-6.6). */
export const WALL = { x0: -45, x1: 45, z0: -41, z1: 38, thick: 2.6, gateHalf: 5.0 };   // (gateHalf: the v2 gatehouse is 10.4 wide; the wall runs end against it)
export interface TowerSpec { x: number; z: number; r: number; corner: boolean }
export const WALL_TOWERS: TowerSpec[] = [
  { x: WALL.x0, z: WALL.z0, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z0, r: 3.6, corner: true },
  { x: WALL.x0, z: WALL.z1, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z1, r: 3.6, corner: true },
  { x: -22.5, z: WALL.z0, r: 3.1, corner: false }, { x: 0, z: WALL.z0, r: 3.1, corner: false }, { x: 22.5, z: WALL.z0, r: 3.1, corner: false },
  { x: WALL.x0, z: -14.7, r: 3.1, corner: false },
  { x: WALL.x1, z: -14.7, r: 3.1, corner: false },   // (the towers at z 11.7 are now the SIDE_GATES)
  { x: -27, z: WALL.z1, r: 3.1, corner: false }, { x: 27, z: WALL.z1, r: 3.1, corner: false },
];
/** Straight wall runs [x1, z1, x2, z2, outwardX, outwardZ] (outward normal is where the merlons stand). */
/** (owner 2026-10-23) side gates through the east / west walls where the z 11.7 towers stood: two small towers flank an open
 *  passage (walk straight through, no prompt). The East Gate's guard (NPCS 'Brannoc' + townGates 'east') stops you until Lv 40. */
export const SIDE_GATE = { off: 3.6, r: 1.5 };   // tower centres at z +- off from the gate centre; passage ~4 m clear
export const SIDE_GATES: { x: number; z: number; name: string }[] = [{ x: WALL.x1, z: 9.6, name: 'East Gate' }, { x: WALL.x0, z: 9.6, name: 'Beach Gate' }]   // (z 9.6: clear of the raised Rises that start at z 13);
export const WALL_RUNS: [number, number, number, number, number, number][] = [
  [WALL.x0, WALL.z0, WALL.x1, WALL.z0, 0, -1],              // north
  [WALL.x1, WALL.z0, WALL.x1, 9.6 - 3.6, 1, 0], [WALL.x1, 9.6 + 3.6, WALL.x1, WALL.z1, 1, 0],    // east (split by the East Gate)
  [WALL.x0, WALL.z0, WALL.x0, 9.6 - 3.6, -1, 0], [WALL.x0, 9.6 + 3.6, WALL.x0, WALL.z1, -1, 0],   // west (split by the Beach Gate)
  [WALL.x1, WALL.z1, WALL.gateHalf, WALL.z1, 0, 1],         // south-east, up to the gatehouse
  [-WALL.gateHalf, WALL.z1, WALL.x0, WALL.z1, 0, 1],        // south-west
];


// ---- landscaped lots (owner 2026-10-21: fewer houses, each on its own garden island: lawn, a low fence with a gate opening, proper spacing, decorations)
/** One house's lot in the HOUSE's local frame (origin = house centre, +z = its front, turned by `rot`): x +-hx, z zb (back) .. zf (front). `gx` = the gate's centre x (the door), `gw` its width. */
export interface Lot { i: number; x: number; z: number; rot: number; hx: number; zb: number; zf: number; gx: number; gw: number; hero: boolean }
export const LOTS: Lot[] = [];
export const LOT_FENCES: [number, number, number, number][] = [];
export const LOT_PATCHES: [number, number, number, number, number, number][] = [];   // [cx, cz, rx, rz, rot, exponent] (rounded-rectangle lawns)
/** House-local -> world for a lot. */
export const lotW = (l: { x: number; z: number; rot: number }, lx: number, lz: number): [number, number] => { const c = Math.cos(l.rot), n = Math.sin(l.rot); return [l.x + lx * c + lz * n, l.z - lx * n + lz * c]; };
// (owner 2026-10-21: no yards / lots: the arrays above stay empty so the scenery + fill code that reads them needs no changes)

/** Houses that will become enterable (another agent may wire their interiors): the door spot is on the path just outside the front door, inside the lot's gate (any yaw); `yaw` = the way the house faces. */
export const ENTERABLE_HOUSES: { name: string; x: number; z: number; door: { x: number; z: number }; yaw: number }[] = ([[-40.2, 3.86, 'North Street Cottage'], [18.5, 29.46, 'Market Row House'], [-29.72, 3.75, 'West Row House']] as [number, number, string][]).flatMap(([hx, hz, name]) => {
  const h = HOUSES.find((q) => q.x === hx && q.z === hz); if (!h) return [];
  const k = HOUSE_KIT[h.kit!] ?? HOUSE_KIT.house_small, s = h.s ?? 1;
  return [{ name: name as string, x: h.x, z: h.z, door: { x: +(h.x + k.doorX * s).toFixed(2), z: +(h.z + k.front * s + 0.9).toFixed(2) }, yaw: h.rot }];
});

/** Fence runs [x1, z1, x2, z2]. Every run gets colliders (see TOWN_COLLIDERS). */
export const FENCES: [number, number, number, number][] = [
  // (the avenue's fences made way for the market stalls; houses get their yard fences from YARD_FENCES below)
  // (owner) the horse paddock in front of the stable (open to the shed; gap in the west side)
  [STABLE.x + STABLE.w / 2, STABLE.paddock.z0, STABLE.paddock.x1, STABLE.paddock.z0],
  [STABLE.paddock.x1, STABLE.paddock.z0, STABLE.paddock.x1, STABLE.paddock.z1], [STABLE.paddock.x0, STABLE.paddock.z1, STABLE.paddock.x1, STABLE.paddock.z1],
  [STABLE.paddock.x0, STABLE.paddock.z0, STABLE.paddock.x0, 47.8],   // (wide gate on the road side: the corner at x0 is open from z 47.8 to the south fence)
  // chicken pen
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z - PEN.hd], [PEN.x - PEN.hw, PEN.z + PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x - PEN.hw, PEN.z + PEN.hd], [PEN.x + PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  // the graveyard: south side (gap at the gate), east side (gap at the chapel's side door)
  [-43.4, -21, -40, -21], [-36.2, -21, -32.8, -21], [-32.8, -21, -32.8, -28.4], [-32.8, -33.2, -32.8, -39.6],
  // farm field south of the gate, east of the road (gap in the west side, facing the road)
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z - FARM.hd], [FARM.x - FARM.hw, FARM.z + FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x + FARM.hw, FARM.z - FARM.hd, FARM.x + FARM.hw, FARM.z + FARM.hd],
  [FARM.x - FARM.hw, FARM.z - FARM.hd, FARM.x - FARM.hw, FARM.z - 1.5], [FARM.x - FARM.hw, FARM.z + 1.5, FARM.x - FARM.hw, FARM.z + FARM.hd],   // gap on the road side (west)
  // (owner, red lines) the road from the bridge up to the cross paths, both sides; nothing on toward the portal
  [-3.4, 78.5, -3.4, TOWER_PATH_Z - 2],   // west side: bridge -> the Brewer's lane
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
  [3.4, 108.3, 30.5, 108.9], [30.5, 108.9, 33.2, 108.9], [38.4, 108.8, 42, 108.7],   // (gap at x 33..38: the way up into the farm yard)
  [5, 112.8, 20.6, 113.1], [20.6, 113.1, ANIMAL_PEN.gate0, 113.2], [ANIMAL_PEN.gate1, 113.2, 43.6, 113.2],   // (gap: the animal pen's entrance)
  // (owner) the animal pen: west, south and east sides (its north side is the track fence above)
  [ANIMAL_PEN.x0, ANIMAL_PEN.z0, ANIMAL_PEN.x0, ANIMAL_PEN.z1], [ANIMAL_PEN.x0, ANIMAL_PEN.z1, ANIMAL_PEN.x1, ANIMAL_PEN.z1],
  [ANIMAL_PEN.x1, ANIMAL_PEN.z1, ANIMAL_PEN.x1, 113.6], [43.6, 113.2, ANIMAL_PEN.x1, 113.6],
  // the woodland path from the road to the Endless Tower (z = TOWER.z): both sides, gaps at the west hamlet doors
  [-4.4, TOWER_PATH_Z - 1.8, -5.6, TOWER_PATH_Z - 1.8], [-14.8, TOWER_PATH_Z - 1.8, -21, TOWER_PATH_Z - 1.8],   // (gap in front of the Brewer's door)
  [-4.4, TOWER_PATH_Z + 1.8, -21, TOWER_PATH_Z + 1.8],   // (owner, red lines: closed along the hamlet side too; stops short of the tower clearing)
  // the extra crop fields (each open on the road side)
  ...(() => { const f: [number, number, number, number][] = []; for (const F of FIELDS) { const x0 = F.x - F.hw, x1 = F.x + F.hw, z0 = F.z - F.hd, z1 = F.z + F.hd, roadX = F.x > 0 ? x0 : x1; f.push([x0, z0, x1, z0], [x0, z1, x1, z1], [roadX === x0 ? x1 : x0, z0, roadX === x0 ? x1 : x0, z1]); if (F.x < 0) f.push([roadX, z0, roadX, z1]); else f.push([roadX, z0, roadX, F.z - 1.4], [roadX, F.z + 1.4, roadX, z1]); } return f; })(),   // (west fields: closed, no way in from the road)
];

/** Signposts pointing at the gate (south): one beside the spawn plaza, one half way down the road. */
/** Gate signposts were removed at the owner's request (a ground arrow points to the gate instead). */
export const SIGNS: SignSpec[] = [];

/** Lamp posts (emissive bulb only, no real lights). */
export const LAMPS: [number, number][] = [
  // main avenue (+ the road on into the farmland)
  // (owner 2026-10-23) the avenue from the plaza to the gate: lamps in mirrored pairs on both edges
  [3.2, 13.5], [-3.2, 13.5], [3.2, 20], [-3.2, 20], [3.2, 26.5], [-3.2, 26.5], [3.2, 33], [-3.2, 33], [-3.2, 41.8], [3, 42.5], [3.2, 50], [-3.2, 53.5], [4.1, 84], [-4.1, 92], [4.1, 100], [-4.1, 108], [4.1, 116],
  // south street (north edge), plaza, north street
  [-35.25, 7.75], [-26.75, 7.75], [-12.5, -8.25], [12.5, -8.25], [-5, -8.25], [5, -8.25],   // (on the kerb line of the plant-box barriers, engine/townBarriers.ts; the east shop-row lamps are the shops' own, SHOP_LOOK)
  // the dirt path from the meadow to the beach
  [-11, 53.9], [-27.5, 54.6], [-42.2, 52.3],
  // the riverside park
  [22, riverBank(22, 0) - 3.4], [31, riverBank(31, 0) - 3.4],
];
// (lamps never stand inside a cottage lot or in its gate opening)
for (let i = LAMPS.length - 1; i >= 0; i--) {
  const [lx, lz] = LAMPS[i];
  if (LOTS.some((l) => { const c = Math.cos(l.rot), n = Math.sin(l.rot), dx = lx - l.x, dz = lz - l.z, u = dx * c - dz * n, v = dx * n + dz * c; return u > -l.hx - 0.4 && u < l.hx + 0.4 && v > l.zb - 0.4 && v < l.zf + 0.9 && (v < l.zf - 0.6 || Math.abs(u - l.gx) < l.gw / 2 + 0.9); })) LAMPS.splice(i, 1);
}

/** Stone plant boxes (raised planters with shrubs / flowers), axis aligned, w along x and d along z. kind 1 = flowers. */
export interface PlanterSpec { x: number; z: number; w: number; d: number; kind: 0 | 1 }
export const PLANTERS: PlanterSpec[] = [
  // (owner 2026-10-23) the avenue to the gate: mirrored flower boxes on both edges, between the lamps
  { x: 3.4, z: 16.8, w: 0.9, d: 2.2, kind: 0 }, { x: -3.4, z: 16.8, w: 0.9, d: 2.2, kind: 0 }, { x: 3.4, z: 29.8, w: 0.9, d: 2.2, kind: 1 }, { x: -3.4, z: 29.8, w: 0.9, d: 2.2, kind: 1 },
  // (owner) flower boxes lining the summon + tech shop paths
  { x: 7.3, z: 15.4, w: 0.9, d: 2.0, kind: 0 }, { x: 11.9, z: 15.4, w: 0.9, d: 2.0, kind: 1 }, { x: 14.9, z: 15.4, w: 0.9, d: 2.0, kind: 0 }, { x: 19.5, z: 15.4, w: 0.9, d: 2.0, kind: 1 },
  // north street + castle path
  { x: -2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 }, { x: 2.6, z: -11.5, w: 1.2, d: 3.0, kind: 1 },
  // castle approach: flower beds lining the path and the castle front
  { x: -4.7, z: -22.2, w: 2.2, d: 1.0, kind: 1 }, { x: 4.7, z: -22.2, w: 2.2, d: 1.0, kind: 1 },   // (flanking the keep's door steps)
  { x: -6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 }, { x: 6.2, z: -20.2, w: 3.0, d: 1.2, kind: 1 },
  ...YARD_PLANTERS,
  // flower bed in front of the gate (outside)
  { x: -10.5, z: 46.5, w: 5, d: 2, kind: 1 },   // (its east twin made way for the horse paddock)
  // flower boxes along the outside of the south wall (clear of the towers at x = +-27 and the brewer's hut)
  { x: -36, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: -19, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: 24, z: 41.5, w: 5, d: 1.1, kind: 1 }, { x: 36, z: 41.5, w: 5, d: 1.1, kind: 1 },   // (the stable now fills x 9..19)
  // little riverside park east of the bridge (owner): a flower bed beside the gazebo (the fountain + gazebo are nature_kit_v1, PARK_EAST)
  // (owner #167) the green in front of the gate
  { x: -22, z: 45.2, w: 3.2, d: 1.1, kind: 0 },
];

/** Trees: x, z, scale, kind (0 oak, 1 palm, 2 pineA, 3 pineB). Inside the walls they stand on the grass patches. */
export interface TreeSpec { x: number; z: number; s: number; kind: 0 | 1 | 2 | 3 }
export const TOWN_TREES: TreeSpec[] = [
  // hermit path (outside the walls): east ring and north ring, both sides of the trail
  { x: 48.5, z: -6, s: 3.0, kind: 1 }, { x: 48.5, z: -30, s: 2.9, kind: 0 }, { x: 40, z: -44.5, s: 2.8, kind: 1 }, { x: 18, z: -44.5, s: 2.9, kind: 0 },
  { x: 49.5, z: 4.2, s: 2.8, kind: 0 }, { x: 53.2, z: 34, s: 3.4, kind: 1 },   // (owner: moved left, off the path) (the mining camp + the way down to the farm)
  // inside the walls: the park, the tavern square, the castle approach (the rest of the greenery is townFill.ts: groves, hedges, beds)
  { x: -27.6, z: 14.4, s: 3.3, kind: 0 }, { x: -17.4, z: 13.9, s: 3.0, kind: 0 }, { x: -27.4, z: 19.6, s: 3.0, kind: 0 },
  { x: 20.6, z: -9.8, s: 3.4, kind: 0 }, { x: 33.4, z: -9.6, s: 3.2, kind: 0 }, { x: -9.6, z: -17.2, s: 3.3, kind: 0 }, { x: 9.8, z: -17.6, s: 3.2, kind: 0 },
  { x: -43, z: -7.6, s: 3.0, kind: 2 },
  
  // the meadow south of the gate: a few lone trees (the forest edge is pushed back, see ISLAND_BOXES)
  { x: -22, z: 57.5, s: 3.5, kind: 1 }, { x: 32.6, z: 42.6, s: 3.5, kind: 0 }, { x: 41, z: 52, s: 3.3, kind: 2 }, { x: -39, z: 58, s: 3.6, kind: 0 },
  { x: 23.6, z: 43.4, s: 3.4, kind: 0 },
  // (owner #167: more on the green in front of the gate) west side, clear of the dirt path at z 52
  { x: -15, z: 45.5, s: 3.1, kind: 0 }, { x: -27, z: 47.5, s: 3.4, kind: 2 }, { x: -34.5, z: 45, s: 3.0, kind: 0 },
  // (owner) the Endless Tower deep in the forest: trees along the bending road, then a horseshoe round the clearing (open to the road)
  ...(() => {
    const t: TreeSpec[] = [];
    const road: [number, number][] = [[0, 130], [1.8, 134], [3.6, 138.5], [4.4, 142.5]];
    road.forEach(([x, z], i) => { t.push({ x: x - 7.5 - (i % 2), z, s: 3.2 + (i % 3) * 0.3, kind: (i % 3) as 0 | 1 | 2 }); t.push({ x: x + 7.5 + ((i + 1) % 2), z: z + 1, s: 3.3 + ((i + 1) % 3) * 0.3, kind: ((i + 2) % 3) as 0 | 1 | 2 }); });
    for (let i = 0; i <= 10; i++) {
      const a = -1.95 + (3.9 * i) / 10, r = 13 + (i % 2) * 1.6;   // angle from +z (south): the arc wraps the back and sides
      t.push({ x: TOWER.x + Math.sin(a) * r, z: TOWER.z + Math.cos(a) * r, s: 3.4 + (i % 3) * 0.35, kind: ((i + 1) % 4) as 0 | 1 | 2 | 3 });
    }
    return t;
  })(),
  // the mainland across the bridge
  { x: -38, z: 82, s: 3.9, kind: 3 }, { x: -8, z: 83, s: 3.4, kind: 1 }, { x: -40, z: 96, s: 3.9, kind: 2 }, { x: -41, z: 106, s: 3.4, kind: 2 },
  { x: -10, z: 117, s: 3.5, kind: 0 }, { x: 14, z: 116, s: 3.7, kind: 0 }, { x: 28, z: 117, s: 3.5, kind: 0 }, { x: 50.4, z: 84.2, s: 3.6, kind: 0 },
];
/** Small grass patches inside the walls (everything else is paved): x, z, rx, rz. */
export const GRASS_PATCHES: [number, number, number, number, number?, number?][] = [
  [WELL_POS.x + 0.3, WELL_POS.z, 6.9, 4.7],   // the park lawn round the fountain (owner 2026-10-23: bigger; x -29..-15, z 12.3..21.7 between the Rise, the Armory and the street / lane)
  [PEN.x, PEN.z, PEN.hw + 1.3, PEN.hd + 1.2],
  [-38.1, -34.6, 5.4, 4.6], [-38.1, -26.4, 5.4, 4.8],   // the graveyard (two blocks either side of the path)
  ...LOT_PATCHES,
];
/** Farm props (outside the walls): scarecrow + haystack positions. */
/** Parked market carts on the meadow in front of the walls (nature_kit_v1 'market_cart'; kind 1 = a haystack instead). Colliders in TOWN_COLLIDERS. */
export interface CartSpec { x: number; z: number; rot: number; kind: 0 | 1 | 2 }
export const CARTS: CartSpec[] = [
  { x: 13.6, z: 57.0, rot: 0, kind: 0 }, { x: -9.4, z: 56.6, rot: 0, kind: 2 }, { x: -37, z: 56.8, rot: 0, kind: 1 }, { x: -33.5, z: 81.4, rot: 0, kind: 2 },   // (market carts: fronts south; kind 1 is a haystack)
];
/** Free-standing stone gateways on the two outskirts roads (owner 2026-10-22: "a gate to the beach and a gate to the mines"). The roads start at the south gate meadow and never cross the town wall,
 *  so the gates stand ON the roads: `rot` = yaw of the road direction (the passage runs along it). Pillars: two collider circles at +-GATEWAY.px across the road. */
export const GATEWAY = { hp: 2.2, px: 2.95, pr: 0.95 };
export const GATEWAYS: { x: number; z: number; rot: number; name: string }[] = [
  { x: -27, z: 52.55, rot: Math.atan2(17, -0.8), name: 'beach' },
  { x: 59.7, z: 47, rot: Math.atan2(0.5, -27), name: 'mines' },
];
export const SCARECROW = { x: FARM.x, z: FARM.z };
export const HAYSTACK = { x: FARM.x - 5, z: FARM.z - 4 };

/** Movement colliders [x, z, r] registered with mapgen.addTempCollider after the island is generated. */
export const TOWN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) { if (h.nk === 'chicken_coop') kitRing(c, 'chicken_coop', h.x, h.z, h.s ?? 1, 0.7); else if (h.nk) kitRing(c, h.nk, h.x, h.z, h.s ?? 1, 1.0); else c.push([h.x, h.z, Math.hypot(h.w, h.d) * 0.38 + 0.4]); }
  c.push([TOWER.x, TOWER.z - 0.3, TOWER.r]);
  { const k = PORTAL_S / 0.7; for (let i = -2; i <= 2; i++) c.push([PORTAL.x + i * 1.5 * k, PORTAL.z + 0.7 * k, 0.9 * k]); }   // the adventure_portal kit piece: the stone arch + its base, a wall across the plaza
  for (const m of PLAZA_STATUES) c.push([m.x, m.z, m.r]);
  for (const r of RUINS) c.push([r.x, r.z, r.kind === 0 ? 1.0 : 1.6]);
  // stalls are ~3.9 wide: two circles along their local x axis
  for (const s of STALLS) for (const k of [-1.1, 1.1]) c.push([s.x + Math.cos(s.rot) * k, s.z - Math.sin(s.rot) * k, 1.25]);
  c.push([WELL_POS.x, WELL_POS.z, 1.9]);   // (the plaza fountain, town_kit_v2 fountain_small)
  c.push([PARK_EAST.fountain.x, PARK_EAST.fountain.z, 2.0]); kitRing(c, 'gazebo', PARK_EAST.gazebo.x, PARK_EAST.gazebo.z, 1, 0.9, 'front');   // the east park
  for (const [x, z] of WELLS) c.push([x, z, 1.35]);
  for (const [x, z] of SIGNPOSTS) c.push([x, z, 0.35]);
  { const S = STABLE;   // the stable (nature_kit_v1, 10 x 6): back wall + side walls (the front is open to the paddock)
    kitRing(c, 'stable', S.x, S.z, 1, 0.6, 'front');
    for (const o of [-0.5, 0.5]) c.push([S.paddock.x1 - 0.9, S.paddock.z1 - 1.4 + o, 0.5]); }   // (+ the paddock's water trough)
  c.push([HERMIT_CAMP.x, HERMIT_CAMP.z, 0.9]);   // campfire
  for (const k of CARTS) { if (k.kind === 1) c.push([k.x, k.z + 0.2, 1.7]); else kitRing(c, 'market_cart', k.x, k.z, 1, 0.8); }   // carts: footprint rings (a hay cart is a haystack)
  // castle: ring of circles around the hall footprint + corner towers
  {
    const { x, z, w, d } = CASTLE, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    for (let px = x0; px <= x1 + 0.01; px += 2) { c.push([px, z0, 1.6], [px, z1, 1.6]); }
    for (let pz = z0; pz <= z1 + 0.01; pz += 2) { c.push([x0, pz, 1.6], [x1, pz, 1.6]); }
    for (const [tx, tz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) c.push([tx, tz, 2.6]);
  }
  // plant boxes: circles along the long axis
  for (const p of PLANTERS) {
    const r = Math.min(p.w, p.d) / 2 + 0.2, alongX = p.w >= p.d, len = Math.max(p.w, p.d), n = Math.max(1, Math.ceil((len - 2 * r) / 0.7));
    for (let i = 0; i <= n; i++) { const o = -len / 2 + r + ((len - 2 * r) * i) / n; c.push([p.x + (alongX ? o : 0), p.z + (alongX ? 0 : o), r]); }
  }
  for (const t of TOWN_TREES) c.push([t.x, t.z, 0.85]);
  for (const g of GATEWAYS) for (const sx of [-1, 1]) c.push([g.x + Math.cos(g.rot) * sx * GATEWAY.px, g.z - Math.sin(g.rot) * sx * GATEWAY.px, GATEWAY.pr]);
  for (const [x, z, r] of TRAIL_ROCKS) c.push([x, z, r]);
  c.push([SCARECROW.x, SCARECROW.z, 0.5], [HAYSTACK.x, HAYSTACK.z, 1.7]);   // (the haystack is the kit piece at scale 0.85)
  // the brewer's cauldron, work table and barrels in front of / beside the hut (hut-local -> world; the hut itself is the shop collider)
  { const { x, z } = BREWER_HUT;   // (the kit's round hut + the barrel and bottles by its door)
    c.push([x + 0.17, z + 0.17, 2.9], [x - 2.0, z + 2.5, 0.8]); }
  // the shops (town_kit_v2 shop_stall_house, 6 x 4.8, awning + counter in front; yaw `rot`): body corners + the counter, then each shop's extra buildings / props (SHOP_LOOK)
  for (const sp of SHOP_POSITIONS) {
    if (sp.position[2] > 40 || sp.position[2] < -40 || Math.abs(sp.position[0]) > 44) continue;
    const [sx, , sz] = sp.position, rot = sp.rot ?? 0;
    for (const [dx, dz, r] of [[-2.7, 0.2, 1.7], [2.7, 0.2, 1.7], [-1.5, 3.6, 0.7], [1.5, 3.6, 0.7]] as const) { const [wx, wz] = shopLocal(sx, sz, rot, dx, dz); c.push([wx, wz, r]); }
    const L = SHOP_LOOK[sp.type]; if (!L) continue;
    for (const [, dx, dz, , , r] of [...L.extra, ...L.dress]) if (r) { const [wx, wz] = shopLocal(sx, sz, rot, dx, dz); c.push([wx, wz, r]); }
    for (const [dx, dz] of L.cluster) { const [wx, wz] = shopLocal(sx, sz, rot, dx, dz); c.push([wx, wz, 1.0]); }
  }
  // castle terrace: retaining wall along the front (gap for the stairs) and the sides, stair balustrades
  { const T = TERRACE;
    for (let x = T.x0; x <= T.x1 + 0.01; x += 0.8) if (Math.abs(x) > T.stairHw + 0.3) c.push([x, T.z1 + 0.35, 0.5]);
    for (const x of [T.x0 - 0.35, T.x1 + 0.35]) for (let z = T.z0; z <= T.z1 + 0.35; z += 0.8) c.push([x, z, 0.5]);
    for (const sx of [-1, 1]) for (let z = T.z1; z <= T.stairZ + 0.01; z += 0.7) c.push([sx * (T.stairHw + 0.35), z, 0.4]); }
  // raised districts: retaining wall along every open edge (gaps for the stairs), stair balustrades
  for (const T of TIERS) {
    const run = stairRun(T.h);
    const edge = (side: 'N' | 'S' | 'E' | 'W') => {
      if (tierEdgeOnWall(side, T)) return;
      const alongX = side === 'N' || side === 'S', a0 = alongX ? T.x0 : T.z0, a1 = alongX ? T.x1 : T.z1;
      const fixed = side === 'N' ? T.z0 : side === 'S' ? T.z1 : side === 'W' ? T.x0 : T.x1;
      const gaps = T.stairs.filter((st) => st.side === side);
      for (let a = a0; a <= a1 + 0.01; a += 0.7) {
        if (gaps.some((g) => Math.abs(a - g.c) < g.hw - 0.1)) continue;
        c.push(alongX ? [a, fixed, 0.45] : [fixed, a, 0.45]);
      }
    };
    edge('N'); edge('S'); edge('W'); edge('E');
    for (const st of T.stairs) for (const sd of [-1, 1]) for (let d = 0; d <= run + 0.01; d += 0.6) {
      const o = st.c + sd * (st.hw + 0.3);
      if (st.side === 'S') c.push([o, T.z1 + d, 0.4]); else if (st.side === 'N') c.push([o, T.z0 - d, 0.4]);
      else if (st.side === 'E') c.push([T.x1 + d, o, 0.4]); else c.push([T.x0 - d, o, 0.4]);
    }
  }
  // landmarks: chapel (+ bell tower at its front-left), tavern, windmill, statue
  for (const L of [CHURCH, TAVERN]) {
    const hw = L.w / 2, hd = L.d / 2;
    for (let x = -hw; x <= hw + 0.01; x += 1.2) c.push([L.x + x, L.z - hd + 0.5, 1.0], [L.x + x, L.z + hd - 0.5, 1.0]);
    for (let z = -hd; z <= hd + 0.01; z += 1.2) c.push([L.x - hw + 0.5, L.z + z, 1.0], [L.x + hw - 0.5, L.z + z, 1.0]);
  }
  c.push([CHURCH.x - 4.15, CHURCH.z + 1.6, 2.2]);   // the bell tower beside the nave
  kitRing(c, 'windmill', WINDMILL.x, WINDMILL.z, WINDMILL.s, 1.0);
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
  for (const [x1, z1, x2, z2] of [...FENCES, ...LOT_FENCES]) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 0.45]);
  }
  // gatehouse towers (the 8.8-wide opening between them stays walkable)
  for (const sx of [-1, 1]) c.push([GATE.x + sx * GATE_TOWER.x, GATE.z, GATE_TOWER.r]);   // (the gate towers; the 5.3-wide arch between them stays walkable)
  // town wall: towers + a continuous chain of overlapping circles along every run
  for (const t of WALL_TOWERS) c.push([t.x, t.z, t.r]);
  for (const g of SIDE_GATES) for (const s of [-1, 1]) c.push([g.x, g.z + s * SIDE_GATE.off, SIDE_GATE.r]);   // the side gates' towers
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
  { kind: 'ORE', x: 56, z: 18 }, { kind: 'HERB', x: 51.2, z: 79.6 },
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
  c.push([TOWER.x, TOWER.z, 13], [TOWER.x, TOWER.z - 6, 9]);   // the tower clearing
  c.push([BREWER_HUT.x, BREWER_HUT.z, 7.5]);   // the brewer's yard
  for (const s of STALLS) c.push([s.x, s.z, 4]);
  for (const n of VILLAGE_NODES) c.push([n.x, n.z, 4]);
  c.push([WELL_POS.x, WELL_POS.z, 3], [PLAZA.x, PLAZA.z, PLAZA.r + 1], [PEN.x, PEN.z, 8], [GATE.x, GATE.z, 11]);
  c.push([SHRINE_POS[0], SHRINE_POS[2], 6.5], [TRAINER_POS[0], TRAINER_POS[2], 6.5]);
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
  /** the King / Queen of the castle keep */
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
      ['Tired of tapping? Open the pause menu and switch on "Auto skills": skills 1/2/3 and your ultimate cast themselves at nearby enemies.', 'Dashing always stays manual, so stay sharp. When you are ready, walk to the glowing stone portal right here in the plaza.'],
    ],
    bubbles: ['Press E near anything glowing!', 'Ask me again for more tips. The portal is right here in the plaza!', 'Skills 1, 2, 3 and R. Never forget R!'],
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
    name: 'Brenna', role: 'Farmer', model: 'ARCHER', tint: '#e6f5cc', scale: 1, prop: 'basket', accent: '#9bd26a', home: [-15.5, 23.2], speed: 1.5,
    patrol: [[-15.5, 23.2], [-24, 23.2], [-15.5, 23.2], [-8.6, 23.2]],   // along the south-west lane
    talk: [
      ['Mind the chickens, they have opinions. Good eggs though!', 'Here, take a potion. Fresh brewed, or so I am told.'],
      ['The harvest has been strange lately. The crops glow at night near the Grove.', 'Odd, but the carrots taste fine.'],
    ],
    bubbles: ['Cluck cluck, my darlings.', 'Fine weather for the harvest.', 'Strange lights near the Grove lately...'],
    gift: { item: 'potion_hp', qty: 1, text: 'Brenna hands you a healing potion. (+1 Health Potion)' },
  },
  {
    name: 'Garrick', role: 'Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#bcd0ff', home: [2.2, 35.4],
    talk: [['Curfew bell rings at dusk now. King\'s orders. Not to keep the monsters out, mind. To keep us in.', 'Something walks the treeline after dark. Not wolves. Wolves do not stand on two legs and watch the gate.'], 
      ['Halt! ...Oh. It is you. Carry on.', 'The Adventure Portal is in the plaza, in the middle of the shops. Step into it when you are ready.'],
      ['Nothing gets past me. Well, nothing except hens. And the Elder\'s cat.', 'Bring back something shiny, will you?'],
      ['Stock up at the potion shop before you set out. Heroes who forget potions tend to come back without their dignity.'],
      ['I have guarded this gate eleven years. The gate has never once been stolen. You are welcome.'],
    ],
    bubbles: ['Curfew at dusk. Do not make me ring it twice.', 'Move along, citizens.', 'All quiet at the gate.', 'Beware the Mire...'],
  },
  {   // (owner) the East Gate's guard (SIDE_GATES; townGates 'east' blocks the passage until Lv 40) (owner: stands right beside the gate doors)
    name: 'Brannoc', role: 'East Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1.05, prop: 'spear', accent: '#ffd27a', home: [43.5, 7.4],
    talk: [['Halt! Past the East Gate the wilds get nasty. Bigger beasts, meaner rocks, angrier bees.', 'Come back when you are level 40 and I will step aside. Promise.'],
      ['You again? Still the rules: level 40, then the gate is yours.', 'I do not make the rules. I just stand very firmly in front of them.'],
      ['Once you are strong enough, the whole east is yours to explore. Bring me back a nice rock.']],
    bubbles: ['None shall pass! Unless they are level 40.', 'East Gate, guarded since breakfast.', 'Halt! ...Oh, carry on, I meant the pigeon.'],
  },
  // the castle doors: two royal guards flank the steps (stationary, facing the plaza)
  {
    name: 'Sir Aldo', role: 'Castle Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#ffd36a', home: [-2.6, -20.6], y: TERRACE.h,
    talk: [
      ['The King receives heroes in the throne hall. Go on in.'],
      ['I have stood at this door for eleven years. The door has never once tried anything.', 'Still. One must be ready.'],
    ],
    bubbles: ['For the King!', 'All quiet at the castle.', 'Stand tall, Bram.'],
  },
  {
    name: 'Sir Bram', role: 'Castle Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#ffd36a', home: [2.6, -20.6], y: TERRACE.h,
    talk: [
      ['Halt! State your... ah, the new guard. Welcome to the castle.'],
      ['Aldo snores standing up. Do not tell him I said that.'],
    ],
    bubbles: ['Long live King Aldric.', 'I am standing tall, Aldo.', 'No loitering on the steps.'],
  },
  {
    name: 'Lysa', role: 'Herbalist', model: 'WIZARD', tint: '#d9f7da', scale: 1, prop: 'basket', accent: '#7ee0a0', home: [-15, 10.4], speed: 1.4,
    patrol: [[-15, 10.4], [-26, 10.4]],   // strolls past the west shops
    talk: [
      ['Moonpetal, ember root, a pinch of swamp moss... the Potion Shop pays well for the good stuff.', 'Do not forget to sell what you do not need.'],
      ['Mana potions taste like mint, health potions like regret. Drink them anyway.', 'Take this one, on the house.'],
    ],
    bubbles: ['Moonpetal, ember root...', 'Mana potions: now with mint!', 'Have you seen my cat? Ah, no, Pip\'s.'],
    gift: { item: 'potion_mana', qty: 1, text: 'Lysa slips a vial into your pack. (+1 Mana Potion)' },
  },
  {
    name: 'Dorn', role: 'Miner', model: 'BARBARIAN', tint: '#ecd2b4', scale: 1, prop: 'hammer', accent: '#ffb86a', home: [15, 9.9], speed: 1.5,
    patrol: [[15, 9.9], [34, 9.9]],     // walks past the warehouse / blacksmith / armor shop
    talk: [
      ['Out on the edges of the village you will find crystals and ore veins. Stand close and hold E to hit them.', 'They grow back after a while, and the shards are worth good coin.'],
      ['The blacksmith will turn what you dig into something sharp. Tell her Dorn sent you!'],
    ],
    bubbles: ['Hold E near an ore vein!', 'Rocks do not mine themselves.', 'My pickaxe is my best friend.'],
  },
  {
    name: 'Sera', role: 'Merchant', model: 'ROGUE', tint: '#e6d3ff', scale: 1, prop: 'none', accent: '#d9b0ff', home: [-8.4, 8.6],   // (on the south street's kerb below the plaza)
    talk: [
      ['Fine wares, rare finds! Alas, today I am only here for the fresh air.', 'The real shops are all around the square: potions and pets to the west, the smithy and the warehouse to the east.'],
      ['Coins make the world go round, friend. Spend them well, save a few for the altar.'],
    ],
    bubbles: ['Fine wares! Fine wares!', 'Everything has a price.', 'Best prices in the valley!'],
  },
  {
    name: 'Fenn', role: 'Bard', model: 'ARCHER', tint: '#d3e5ff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [-28, 9.9], speed: 1.7,
    patrol: [[-28, 9.9], [-14, 9.9], [0, 9.9], [14, 9.9], [28, 9.9], [14, 10.8], [0, 10.8], [-14, 10.8], [-28, 10.8]],
    talk: [['I wrote a ballad about the Dimming. The King liked it so much he bought every copy and burned them. I think that is a compliment. I hope.'], 
      ['La la laaa... oh, an audience! I am working on a ballad about the Tide Hydra.', 'So far it goes: "Run." Then, for the second verse: "Swim." Needs work.'],
      ['They say the Frostpeak winds sing at midnight. I shall go listen, once I find a braver bard.'],
    ],
    bubbles: ['La la laaa~', 'Beware the Mire... it rhymes with nothing!', 'Anyone have a lute string?'],
  },
  {
    name: 'Wren', role: 'Scholar', model: 'WIZARD', tint: '#d7e0ff', scale: 1, prop: 'staff', accent: '#a9b8ff', home: [-17.4, -7.6],   // by the market stall (clear of the Skill Trainer's tent)
    talk: [
      ['The Fortune Teller by the plaza answers wishes with fortune. Offer her gems and see who answers.', 'The Skill Trainer, by the castle steps on the west side, will sharpen what you already know.'],
      ['Knowledge is the sharpest weapon. And a very good staff, if I may say.'],
    ],
    bubbles: ['Fascinating...', 'The Altar hums tonight.', 'Spend your skill points!'],
  },
  {
    name: 'Hodge', role: 'Clerk', model: 'KNIGHT', tint: '#ffe8c7', scale: 1, prop: 'none', accent: '#ffcf70', home: [4.4, -8.0], speed: 1.5,
    patrol: [[4.4, -8.0], [8, -6.4], [-3, -6.4], [8, -6.4]],   // there and back (never across the castle path planters)
    talk: [
      ['Paperwork, paperwork... the old notice board north of the plaza is empty now. Heroes want runs, not errands.', 'Go and fight something, then come back and tell me about it.'],
      ['I keep the ledgers straight, and the heroes honest. Mostly the ledgers.'],
      ['A hero once asked for a bounty on his own mother-in-law. I said no. Then I met her. I said maybe.'],
    ],
    bubbles: ['Hero wanted: apply within.', 'So much paperwork...', 'Has Lysa said anything about me?'],
  },
  {
    name: 'Maeve', role: 'Gossip', model: 'WIZARD', tint: '#f0e8f7', scale: 1, prop: 'staff', accent: '#e8d0ff', home: [19, 9.9], speed: 1.2,
    patrol: [[19, 9.9], [30, 9.9], [24, 10.8], [17, 10.8]],
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
      ['Mortimer has been paid. In gold, not candles. Sister Elowen wept. I think from guilt.', 'Go and put the echoes out, and come home after.'],
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
      ['The people in town have their own small troubles, hero. Lend a hand when you are home, and the Font will lend one back in the wilds.'],
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
      ['The King prefers heroes to report in person, once a deed is done. He asks about them for days.'],
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
  { name: 'Tomas', role: 'Villager', model: 'BARBARIAN', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-6, 10], speed: 1.1, patrol: [[-6, 10], [-26, 10], [-26, 10.9], [-6, 10.9]], noHat: true, noCape: true, tunic: '#d8c4a0', hair: '#5a3a22', longHair: false,
    talk: [['They took my brother into the royal guard. He came back from the well with a new smile and could not remember my name.'], ['Fine day for it.']], bubbles: ['Have you seen my goat?', 'Curfew soon. Best hurry.', 'Fine day for it.', 'Have you seen my goat?', 'Bread\'s fresh at the stall!'] },
  { name: 'Greta', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [6, 10], speed: 1.1, patrol: [[6, 10], [34, 10], [34, 10.8], [6, 10.8]], noHat: true, noCape: true, tunic: '#efe2c8', hair: '#b0582a', longHair: true,
    talk: [['My granny used to sing a song about Princess Aelia. Sing it in the square now and a guard writes your name down.', 'So I hum it. Very quietly.'], ['Morning, hero!']], bubbles: ['Mind the puddles.', 'Morning, hero!', 'Mind the puddles.', 'The market\'s busy today.'] },
  { name: 'Bram', role: 'Villager', model: 'KNIGHT', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-1.2, 16], speed: 1.1, patrol: [[-1.2, 16], [-1.2, 32], [1.2, 32], [1.2, 16]], noHat: true, noCape: true, tunic: '#c9a77a', hair: '#2a1c12', longHair: false,
    talk: [['Gate\'s that way.']], bubbles: ['Gate\'s that way.', 'Heard the King\'s hiring.', 'Watch your step.'] },
  { name: 'Lina', role: 'Villager', model: 'WIZARD', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-14, -7], speed: 1.1, patrol: [[-14, -7], [14, -7]], noHat: true, noCape: true, tunic: '#e8d8b8', hair: '#e0c070', longHair: true,
    talk: [['Do not walk the forest road at night. The trees lean in. My cousin swears one of them whispered "is she with you?"'], ['Lovely weather.']], bubbles: ['The chapel bells are pretty.', 'Do not go in the forest at night.', 'Lovely weather.', 'The chapel bells are pretty.', 'Off to the tavern later!'] },
  { name: 'Oskar', role: 'Villager', model: 'BARBARIAN', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [4.8, 52.6], speed: 1.1, patrol: [[4.8, 52.6], [-12, 52.6]], noHat: true, noCape: true, tunic: '#b89870', hair: '#8a8a8a', longHair: false,
    talk: [['Ahh, fresh air.']], bubbles: ['Ahh, fresh air.', 'The river\'s high this year.', 'Good fishing at the beach.'] },
  { name: 'Mira\'s sister Elsa', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [24, 23.2], speed: 1.1, patrol: [[24, 23.2], [6, 23.2], [6, 24.2], [24, 24.2]], noHat: true, noCape: true, tunic: '#d6c09a', hair: '#3a2416', longHair: true,
    talk: [['Have you met my sister? She never stops talking.']], bubbles: ['Have you met my sister? She never stops talking.', 'Lovely flowers by the gate.'] },
  // (owner: more folk outside the walls) the hamlets by the portal, the riverside green, the beach
  { name: 'Tam', role: 'Villager', model: 'ARCHER', tint: '#ffffff', scale: 0.85, prop: 'none', accent: '#d9c9a8', home: [8, 110.6], speed: 1.4, patrol: [[8, 110.6], [28, 110.6]], noHat: true, noCape: true, tunic: '#e0cfa8', hair: '#c07a3a', longHair: false,
    talk: [['Are you a real hero? Can I hold your sword?']], bubbles: ['Race you to the coop!', 'I saw a fox!', 'Mum says no portals.'] },
  { name: 'Wenna', role: 'Villager', model: 'WIZARD', tint: '#ffffff', scale: 0.95, prop: 'basket', accent: '#d9c9a8', home: [-8, 112], speed: 1.0, patrol: [[-8, 112], [-38, 112]], noHat: true, noCape: true, tunic: '#d8c7a6', hair: '#6a4024', longHair: true,
    talk: [['There is something in the forest past the tower. Black, like a hole in the air. The birds fly around it, never over.'], ['The tower hums at night. I sleep with the window shut.']], bubbles: ['Mind the tower, dear.', 'Something watches from the trees.', 'Lovely mushrooms in these woods.', 'Mind the tower, dear.', 'Fresh eggs for sale!'] },
  { name: 'Old Garth', role: 'Villager', model: 'KNIGHT', tint: '#ffffff', scale: 0.95, prop: 'none', accent: '#d9c9a8', home: [-27, 55.4], speed: 0.8, patrol: [[-27, 55.4], [-13, 55.4]], noHat: true, noCape: true, tunic: '#a89070', hair: '#c8c8c8', longHair: false,
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
    name: 'Hollis', role: 'Farmer', model: 'BARBARIAN', tint: '#f3e3c3', scale: 1, prop: 'none', accent: '#d9b56a', home: [36.2, 101.9], speed: 1.2,
    patrol: [[34.8, 102.2], [38.4, 102.6], [37.4, 103.8], [33.6, 103.6]],   // (the strip of the yard between the farmhouse door and the barn door)
    talk: [['Fine morning for it. The girls are in a good mood today.', 'Cows, I mean. The cows.'], ['That barn has stood longer than the gate. Built it with my grandfather.']],
    bubbles: ['Moo-ve along now!', 'Hay for days.', 'Good girls, good girls.'],
  },
  {
    name: 'Dalla', role: 'Farmer', model: 'ARCHER', tint: '#ffe8d0', scale: 1, prop: 'basket', accent: '#f0b070', home: [COOP.x + 3.6, COOP.z + 3.0], speed: 1.3,
    patrol: [[COOP.x + 3.4, COOP.z + 3.2], [COOP.x + 3.4, COOP.z + 5.4]],   // beside the nests in front of the coop (inside the animal pen)
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
    name: 'Tilda', role: 'Travelling Merchant', model: 'ROGUE', tint: '#ffe6c4', scale: 1, prop: 'basket', accent: '#ffb86a', home: [10.8, 54.4],
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
  {   // (owner) the cabbage farmer: shouts when the hero tramples his field (engine/systems/npcs.ts cabbageWatch)
    name: 'Cabbage Man', role: 'Cabbage Farmer', model: 'BARBARIAN', tint: '#ffffff', scale: 0.95, prop: 'basket', accent: '#7fc24a', home: [23.4, 81.0], noHat: true, noCape: true, tunic: '#7a8a4a', hair: '#5a4a3a', longHair: false,
    talk: [
      ['Cabbages! Finest cabbages in the kingdom! Crisp, green, and only slightly trampled!', 'You:: Trampled by whom?', 'Monsters. Heroes. Carts. Mostly heroes.'],
      ['Every week someone comes running through my field. A hero chasing a slime. A slime chasing a hero.', 'You:: That sounds terrible.', 'It IS terrible! My poor cabbages!'],
      ['Some men dream of gold. I dream of one week where nobody steps on my cabbages.', 'One week. Is that so much to ask?'],
    ],
    bubbles: ['Cabbages! Fresh cabbages!', 'Mind the cabbages!', 'Not the cabbages...', 'Cabbage soup, cabbage pie, cabbage... cabbage!'],
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
  {   // (owner) the Stablemaster: the stable horses can be ridden from the start (her old 'hilda_shoes' quest was cut)
    name: 'Hilda', role: 'Stablemaster', model: 'BARBARIAN', tint: '#f1e2cf', scale: 1, prop: 'none', accent: '#b9783c', home: [6.6, 49.4], speed: 1.2, noHat: true, noCape: true, tunic: '#7a4a2a', hair: '#8a4a22', longHair: true,
    talk: [
      ['Easy, Chestnut. Easy. You are not getting the apple until you stop chewing the fence.', 'Welcome to the stable, traveller. These are good horses. The best in the valley, and they know it.'],
      ['A horse knows a rider by the way they sit. Heroes mostly sit like sacks of turnips.', 'You:: I resent that.', 'Fine, fine. Walk up, press E, and Space makes them charge. Mind the mane.'],
      ['Hay in the morning, oats at noon, a gallop at dusk. That is the whole secret.', 'Well, that and shoes. Always shoes.'],
    ],
    bubbles: ['Easy, easy...', 'Who left the gate open?!', 'Hay in the morning, oats at noon.', 'Heroes sit like sacks of turnips.', 'Chestnut, NO.'],
  },
  {
    name: 'Nell', role: 'Wanderer', model: 'ARCHER', tint: '#d6ecff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [2.2, 46], speed: 1.4,
    patrol: [[2.2, 46], [2.2, 56], [2.2, 84], [2.2, 96]],   // over the bridge and back
    talk: [
      ['I walk the tower road every evening. Someone has to wave at the heroes.', 'You would be surprised how many of them wave back. The brave ones, mostly.'],
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

export interface AnimalDef { kind: 'CHICKEN' | 'CAT' | 'COW' | 'HORSE' | 'SHEEP' | 'PIG' | 'DOG' | 'DUCK'; x: number; z: number; rx: number; rz: number; speed: number; tint: string }
export const ANIMALS: AnimalDef[] = [
  // wander ellipses stay well inside the fenced pen
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#f1d7a0' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.2, tint: '#e0a070' },
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#ffffff' },
  { kind: 'CAT', x: -24, z: 11, rx: 4, rz: 1.2, speed: 1.9, tint: '#ff9a4a' },
  // farm (outside the gate, nature_kit_v1 round animals): cows + a dog in the yard in front of the barn, sheep and pigs in the pasture
  // behind it, hens by the coop
  // (owner 2026-10-24) the farm animals live in the fenced pen south of the farm track (ANIMAL_PEN): hens round the coop
  // (west), cows / sheep / pigs in the east half; the dog stays in the farm yard
  { kind: 'COW', x: 40.4, z: 116.6, rx: 1.4, rz: 0.9, speed: 0.6, tint: '#ffffff' },
  { kind: 'COW', x: 44.0, z: 118.4, rx: 1.0, rz: 1.0, speed: 0.5, tint: '#8a5a3a' },
  { kind: 'COW', x: 40.2, z: 119.8, rx: 1.3, rz: 0.8, speed: 0.5, tint: '#e8e0d0' },
  { kind: 'SHEEP', x: 41.0, z: 123.2, rx: 1.6, rz: 0.9, speed: 0.6, tint: '#ffffff' },
  { kind: 'SHEEP', x: 44.2, z: 122.4, rx: 1.0, rz: 1.0, speed: 0.55, tint: '#efe4d0' },
  { kind: 'SHEEP', x: 43.4, z: 125.0, rx: 1.4, rz: 0.6, speed: 0.6, tint: '#8a7358' },
  { kind: 'PIG', x: 37.0, z: 124.6, rx: 1.0, rz: 0.8, speed: 0.7, tint: '#f6a6b8' },
  { kind: 'PIG', x: 37.6, z: 121.4, rx: 0.8, rz: 0.8, speed: 0.7, tint: '#e8949e' },
  { kind: 'DOG', x: 35, z: 102.6, rx: 3.2, rz: 0.8, speed: 1.8, tint: '#ffffff' },
  { kind: 'CHICKEN', x: COOP.x - 1.8, z: COOP.z + 6.0, rx: 1.0, rz: 0.7, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: COOP.x + 1.6, z: COOP.z + 6.4, rx: 1.0, rz: 0.7, speed: 1.0, tint: '#e0a070' },
  { kind: 'CHICKEN', x: COOP.x - 1.2, z: COOP.z + 8.2, rx: 1.2, rz: 0.6, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: COOP.x + 2.0, z: COOP.z + 8.4, rx: 1.0, rz: 0.6, speed: 1.0, tint: '#8a5a3a' },
  { kind: 'CHICKEN', x: COOP.x + 3.4, z: COOP.z + 1.0, rx: 0.6, rz: 1.0, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: COOP.x - 2.2, z: COOP.z + 2.0, rx: 0.4, rz: 0.8, speed: 1.0, tint: '#e0a070' },
  { kind: 'CHICKEN', x: COOP.x + 0.4, z: COOP.z + 7.4, rx: 1.4, rz: 0.5, speed: 1.2, tint: '#ffffff' },
  { kind: 'CAT', x: 10.4, z: 2.1, rx: 0.3, rz: 0.6, speed: 1.7, tint: '#8a8a96' },
  { kind: 'DOG', x: -16.4, z: 20.4, rx: 1.4, rz: 0.5, speed: 1.6, tint: '#ffffff' }, { kind: 'CAT', x: -8.4, z: 20.6, rx: 1.2, rz: 0.5, speed: 1.5, tint: '#e8c08a' },   // (the pet shop's front yard)
  // the east riverside park
  { kind: 'DUCK', x: 26.6, z: 57.6, rx: 1.8, rz: 0.8, speed: 0.9, tint: '#ffffff' },
  { kind: 'DUCK', x: 29.8, z: 58.0, rx: 1.8, rz: 0.8, speed: 0.8, tint: '#ffffff' },
  // (owner) the stable's horses, grazing in the paddock (rideable: E)
  { kind: 'HORSE', x: 12.6, z: 48.9, rx: 1.3, rz: 0.9, speed: 0.8, tint: '#8a5a36' },
  { kind: 'HORSE', x: 15.8, z: 49.4, rx: 1.3, rz: 0.8, speed: 0.7, tint: '#f2ece0' },
  { kind: 'HORSE', x: 18.6, z: 48.6, rx: 0.9, rz: 0.9, speed: 0.8, tint: '#3a2c26' },
];

// ---- (owner 2026-10-22) neat flat lawn strips beside the houses inside the walls: a tidy rounded rectangle against a house's side / back wall wherever the spot is completely free
// (no road, door approach, collider, lamp, seat, other house, raised tier, plaza or gate within reach). Visual only (flat lawn + the terracotta kerb of the other patches); nothing collides.
{
  const inside = (h: HouseSpec) => Math.abs(h.x) < 41 && h.z > WALL.z0 + 4 && h.z < WALL.z1 - 3 && !h.nk;
  const rects: { x: number; z: number; hx: number; hz: number }[] = HOUSES.map((h) => { const sw = Math.abs(Math.sin(h.rot)) > 0.7; return { x: h.x, z: h.z, hx: (sw ? h.d : h.w) / 2, hz: (sw ? h.w : h.d) / 2 }; });
  const segD = (px: number, pz: number, a: number, b: number, c: number, d: number): number => { const dx = c - a, dz = d - b, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - a) * dx + (pz - b) * dz) / L)); return Math.hypot(px - a - dx * t, pz - b - dz * t); };
  const rectCircle = (cx: number, cz: number, hx: number, hz: number, x: number, z: number, r: number): boolean => Math.hypot(Math.max(Math.abs(x - cx) - hx, 0), Math.max(Math.abs(z - cz) - hz, 0)) < r;
  const mine: { x: number; z: number; hx: number; hz: number }[] = [];
  const free = (cx: number, cz: number, hx: number, hz: number, own: { x: number; z: number; hx: number; hz: number }): boolean => {
    if (Math.abs(cx) + hx > 42 || cz - hz < WALL.z0 + 3.5 || cz + hz > WALL.z1 - 3.5) return false;
    for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if (townLift(cx + dx * hx, cz + dz * hz) > 0 || townLift(cx + dx * (hx + 1.5), cz + dz * (hz + 1.5)) > 0) return false;
    for (const r of rects) if (Math.abs(r.x - cx) < r.hx + hx - 0.05 && Math.abs(r.z - cz) < r.hz + hz - 0.05) return false;
    for (const r of mine) if (Math.abs(r.x - cx) < r.hx + hx + 1.2 && Math.abs(r.z - cz) < r.hz + hz + 1.2) return false;
    for (const rd of ROADS) { const m = rd.w / 2 + 1.0; for (let u = -1; u <= 1; u += 0.5) for (let v = -1; v <= 1; v += 0.5) if (segD(cx + u * hx, cz + v * hz, rd.x1, rd.z1, rd.x2, rd.z2) < m) return false; }
    for (const [x, z, r] of TOWN_COLLIDERS) { if (rectCircle(own.x, own.z, own.hx + 0.7, own.hz + 0.7, x, z, 0.05)) continue; /* (the house's own footprint ring) */ if (rectCircle(cx, cz, hx, hz, x, z, r + 0.6)) return false; }
    for (const [x, z] of LAMPS) if (rectCircle(cx, cz, hx, hz, x, z, 1.2)) return false;
    for (const s of TOWN_SEATS) if (rectCircle(cx, cz, hx, hz, s.x, s.z, 1.6)) return false;
    for (const f of FENCES) if (Math.min(segD(cx, cz, f[0], f[1], f[2], f[3]), segD(cx - hx, cz - hz, f[0], f[1], f[2], f[3]), segD(cx + hx, cz + hz, f[0], f[1], f[2], f[3])) < Math.max(hx, hz) + 1) return false;
    for (const s of STALLS) if (rectCircle(cx, cz, hx, hz, s.x, s.z, 3.0)) return false;
    for (const p of GRASS_PATCHES) if (Math.abs(p[0] - cx) < p[2] + hx + 1.5 && Math.abs(p[1] - cz) < p[3] + hz + 1.5) return false;
    if (Math.hypot(cx - PLAZA.x, cz - PLAZA.z) < PLAZA.r + 2.5 + Math.max(hx, hz)) return false;
    if (Math.hypot(cx - GATE.x, cz - GATE.z) < 9 + Math.max(hx, hz)) return false;
    return true;
  };
  for (const h of HOUSES) {
    if (!inside(h)) continue;
    const sw = Math.abs(Math.sin(h.rot)) > 0.7, hx0 = (sw ? h.d : h.w) / 2, hz0 = (sw ? h.w : h.d) / 2, ex = 0.75;
    const cands: [number, number, number, number][] = [   // [cx, cz, half x, half z]: east side, west side, back (north) strip
      [h.x + hx0 + 0.3 + ex, h.z - hz0 * 0.1, ex, Math.min(hz0 * 0.75, 3.2)], [h.x - hx0 - 0.3 - ex, h.z - hz0 * 0.1, ex, Math.min(hz0 * 0.75, 3.2)],
      [h.x, h.z - hz0 - 0.3 - ex, Math.min(hx0 * 0.8, 3.2), ex], [h.x, h.z + hz0 + 0.3 + ex, Math.min(hx0 * 0.8, 3.2), ex],
    ];
    for (const [cx, cz, rx, rz] of cands) if (free(cx, cz, rx, rz, { x: h.x, z: h.z, hx: hx0, hz: hz0 })) { GRASS_PATCHES.push([cx, cz, rx, rz, 0, 5]); mine.push({ x: cx, z: cz, hx: rx, hz: rz }); break; }
  }
}

