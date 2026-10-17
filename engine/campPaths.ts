// ============================================================================
// Biome camps as hand-authored TRANSITION PATHS. The first floor of every biome after Greenwood is a safe stretch of
// road (50-70 units long, ~11-14 wide, winding) that carries the hero from the previous biome into the new one: the first
// part looks like the old biome, the ground and the scenery blend into the new one along the way. In the middle the
// path widens into a little waystation (storage, training post, fire, a wanderer). The exit portals sit at the far end.
//
// DATA-DRIVEN: one `CampLayout` per transition (centre line, width, bulges, ground blend, wall / decor stretches, props,
// scatter, set pieces, floating shards, edge treatment) + ONE generic builder (`buildCampRoom`) that turns it into
//   - world.obstacles (instanced scenery, rendered by render/Props like any room) + circle colliders (mapgen.installRoom),
//   - the walkable envelope (roomShape polar table; every system that clamps with edgeLimit keeps working) and the fixed
//     arrival / station / exit spots (roomShape.fixed), so walls and edges are ordinary colliders.
// Everything is deterministic (seed = layout seed): the camp is authored, not random. Pure TS (three only for Vector3).
//
// Path coordinates: `t` = 0..1 along the centre line, `l` = lateral offset in units (+ = right of the travel direction).
// The whole path is rotated / translated so the waystation (`fire`) sits at the origin on a straight run heading -z.
// ============================================================================
import { Vector3 } from 'three';
import { installRoom, commitCrates, mulberry32, type Collider } from './mapgen';
import { shape, SHAPE_N, fixed } from './roomShape';
import { world } from './world';
import type { Obstacle, ObstacleKind, CrateKind } from './types';

export type EdgeMode = 'hills' | 'flat' | 'sea' | 'lava' | 'abyss';
export type PieceType = 'GATE' | 'STAIRS' | 'BURIED_COLUMN' | 'CRACK' | 'ROCK_STEPS';
/** '_' = an invisible collider chain (a pier rail, the lip of a broken floor). */
export type WallKind = ObstacleKind | '_';

export interface Stretch { t0: number; t1: number; kinds: WallKind[] }
export interface PropSpec { k: ObstacleKind; t: number; l: number; s?: number; c?: boolean }
export interface ScatterSpec { kinds: ObstacleKind[]; t0: number; t1: number; n: number; lmin: number; lmax: number; block?: boolean }
export interface PieceSpec { ty: PieceType; t: number; l?: number; s?: number; yaw?: number }
export interface RibbonSpec { ty: 'DECK'; t0: number; t1: number }
export interface ShardSpec { t0: number; t1: number; n: number; out0: number; out1: number; y0: number; y1: number; s0: number; s1: number }
export interface CrateSpec { kind: CrateKind; t: number; l: number }
export interface TintBand { t0: number; t1: number; color: string; k: number }

export interface CampLayout {
  id: string; name: string; from: number; to: number; seed: number;
  /** Centre line (author space), start -> exit; smoothed with a Catmull-Rom spline. */
  pts: [number, number][];
  /** Full walkable width of the plain stretches. */
  width: number;
  /** Width bulges (negative = pinch): [t, amount added to the HALF width, sigma in t]. */
  bulges: [number, number, number][];
  /** Where the waystation sits (t) - the path is straight and wide there. */
  fire: number;
  /** Ground blend old -> new biome along t. */
  blend: [number, number];
  /** Blocking wall stretches (both sides, continuous collider chain) and decorative outer rings (no collision). */
  wall: Stretch[]; outer: Stretch[]; outerOff: number;
  props: PropSpec[]; scatter: ScatterSpec[]; pieces: PieceSpec[]; ribbons: RibbonSpec[]; shards: ShardSpec[]; crates: CrateSpec[];
  tints?: TintBand[];
  /** What lies beyond the walls, by t: [t, mode, hill height multiplier]. */
  edge: [number, EdgeMode, number?][];
}

// ---------------------------------------------------------------- the six transitions ----
const GW = 0, MH = 1, DS = 2, CI = 3, FP = 4, EW = 5, VD = 6;

export const CAMP_LAYOUTS: CampLayout[] = [
  { // Greenwood -> Marble Halls: the forest path thins into ruined walls, a broken castle gate, then marble flagstones.
    id: 'greenwood-marble', name: 'The Old Kings\' Road', from: GW, to: MH, seed: 0x6a01, width: 13,
    pts: [[-1.7, 27.4], [-6.9, 22.3], [-8.6, 15.8], [-4.3, 9.4], [0, 4.3], [0, -4.3], [5.2, -9.4], [8.6, -15.8], [6, -22.3], [1.7, -26.6], [0, -30.2]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.97, 3.5, 0.04]], fire: 0.5, blend: [0.58, 0.74],
    wall: [
      { t0: 0, t1: 0.2, kinds: ['TREE', 'PINE', 'TREE', 'PINE', 'ROCK'] },
      { t0: 0.2, t1: 0.4, kinds: ['ROCK', 'TREE', 'BOULDER', 'ROCK', 'TREE'] },
      { t0: 0.4, t1: 0.58, kinds: ['ROCK', 'LOWWALL', 'ROCK', 'TREE'] },
      { t0: 0.58, t1: 0.72, kinds: ['LOWWALL', 'LOWWALL', 'RUIN', 'COLUMN'] },
      { t0: 0.72, t1: 1.01, kinds: ['CASTLEWALL', 'CASTLEWALL', 'CASTLEWALL', 'COLUMN'] },
    ],
    outer: [
      { t0: 0, t1: 0.26, kinds: ['TREE', 'PINE', 'TREE', 'PINE'] },
      { t0: 0.26, t1: 0.52, kinds: ['PINE', 'TREE', 'ROCK'] },
      { t0: 0.52, t1: 0.68, kinds: ['RUIN', 'COLUMN', 'TREE'] },
      { t0: 0.68, t1: 1.01, kinds: ['CASTLEWALL', 'COLUMN', 'CASTLEWALL', 'BRAZIER'] },
    ], outerOff: 4.5,
    props: [
      { k: 'LOG', t: 0.47, l: -3.2, s: 1.2 }, { k: 'LOG', t: 0.53, l: 3.4, s: 1.1 },
      { k: 'BRAZIER', t: 0.69, l: -3.6, c: true }, { k: 'BRAZIER', t: 0.69, l: 3.6, c: true },
      { k: 'STATUE', t: 0.88, l: -4.2, c: true }, { k: 'STATUE', t: 0.88, l: 4.2, c: true },
      { k: 'BRAZIER', t: 0.95, l: -5.4, c: true }, { k: 'BRAZIER', t: 0.95, l: 5.4, c: true },
    ],
    scatter: [
      { kinds: ['STUMP', 'LOG', 'ROCK'], t0: 0.05, t1: 0.38, n: 7, lmin: 3, lmax: 5.4, block: false },
      { kinds: ['ROCK'], t0: 0.1, t1: 0.36, n: 3, lmin: 3.6, lmax: 4.8, block: true },
      { kinds: ['COLUMN', 'RUIN'], t0: 0.76, t1: 0.94, n: 4, lmin: 3.4, lmax: 4.9, block: true },
    ],
    pieces: [{ ty: 'GATE', t: 0.65 }], ribbons: [], shards: [],
    crates: [{ kind: 'BARREL', t: 0.46, l: 5.6 }, { kind: 'CRATE', t: 0.54, l: -5.6 }],
    tints: [{ t0: 0.2, t1: 0.5, color: '#8a7a54', k: 0.35 }],
    edge: [[0, 'hills', 1], [0.6, 'flat']],
  },
  { // Marble Halls -> Sunscorch Desert: out of the castle hall, down the exit stairs, onto dunes with half-buried columns.
    id: 'marble-desert', name: 'The Castle Stairs', from: MH, to: DS, seed: 0x6a02, width: 12,
    pts: [[5, 25], [7, 20], [4, 16], [-2.5, 12], [-4.5, 7], [0, 3.5], [0, -4], [-1.5, -8], [-6, -12.5], [-6.5, -18], [-2, -22.5], [2.5, -26.5]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 2, 0.04], [0.97, 3.5, 0.04], [0.3, 1.5, 0.03]], fire: 0.5, blend: [0.31, 0.43],
    wall: [
      { t0: 0, t1: 0.27, kinds: ['CASTLEWALL', 'CASTLEWALL', 'CASTLEWALL', 'COLUMN'] },
      { t0: 0.27, t1: 0.36, kinds: ['CASTLEWALL', 'LOWWALL', 'RUIN', 'SANDSTONE'] },
      { t0: 0.36, t1: 0.62, kinds: ['SANDSTONE', 'ROCK', 'CACTUS', 'SANDSTONE'] },
      { t0: 0.62, t1: 1.01, kinds: ['SANDSTONE', 'CACTUS', 'ROCK', 'CACTUS', 'SANDSTONE'] },
    ],
    outer: [
      { t0: 0, t1: 0.3, kinds: ['CASTLEWALL', 'COLUMN', 'CASTLEWALL'] },
      { t0: 0.3, t1: 1.01, kinds: ['SANDSTONE', 'CACTUS', 'ROCK', 'SANDSTONE', 'CACTUS'] },
    ], outerOff: 4.5,
    props: [
      { k: 'BRAZIER', t: 0.1, l: -3.4, c: true }, { k: 'BRAZIER', t: 0.1, l: 3.4, c: true }, { k: 'BRAZIER', t: 0.22, l: -3.4, c: true }, { k: 'BRAZIER', t: 0.22, l: 3.4, c: true },
      { k: 'BONES', t: 0.58, l: 3.2, c: false }, { k: 'BONES', t: 0.8, l: -4, c: false },
    ],
    scatter: [
      { kinds: ['COLUMN', 'STATUE'], t0: 0.04, t1: 0.24, n: 3, lmin: 3.6, lmax: 4.8, block: true },
      { kinds: ['CACTUS', 'BONES', 'SANDSTONE'], t0: 0.38, t1: 0.95, n: 9, lmin: 3, lmax: 5.2, block: false },
    ],
    pieces: [
      { ty: 'GATE', t: 0.27, s: 0.95 }, { ty: 'STAIRS', t: 0.325 },
      { ty: 'BURIED_COLUMN', t: 0.4, l: -3.6 }, { ty: 'BURIED_COLUMN', t: 0.57, l: 3.7 }, { ty: 'BURIED_COLUMN', t: 0.66, l: -3.2 },
      { ty: 'BURIED_COLUMN', t: 0.77, l: 3.6 }, { ty: 'BURIED_COLUMN', t: 0.88, l: -3.8 },
    ],
    ribbons: [], shards: [],
    crates: [{ kind: 'POT', t: 0.46, l: -5.8 }, { kind: 'BARREL', t: 0.55, l: 5.6 }],
    tints: [],
    edge: [[0, 'flat'], [0.3, 'hills', 0.9]],
  },
  { // Sunscorch Desert -> Coral Isles: dunes give way to beach sand, then a short wooden pier into the sea, palms on the way.
    id: 'desert-coral', name: 'The Salt Road', from: DS, to: CI, seed: 0x6a03, width: 13,
    pts: [[2, 24], [-2, 20], [-6, 15.5], [-5, 10.5], [-1, 6], [0, 3.5], [0, -4], [2.5, -8.5], [5, -13], [4, -17], [1.5, -21], [0, -25], [0, -31]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.86, -2.7, 0.12]], fire: 0.5, blend: [0.22, 0.4],
    wall: [
      { t0: 0, t1: 0.22, kinds: ['SANDSTONE', 'CACTUS', 'ROCK', 'SANDSTONE'] },
      { t0: 0.22, t1: 0.38, kinds: ['ROCK', 'PALM', 'BOULDER', 'SANDSTONE', 'PALM'] },
      { t0: 0.38, t1: 0.72, kinds: ['PALM', 'ROCK', 'PALM', 'BOULDER', 'PALM'] },
      { t0: 0.72, t1: 0.77, kinds: ['PALM', 'ROCK', 'BOULDER'] },
      { t0: 0.77, t1: 1.01, kinds: ['_'] },
    ],
    outer: [
      { t0: 0, t1: 0.3, kinds: ['SANDSTONE', 'CACTUS', 'ROCK'] },
      { t0: 0.3, t1: 0.46, kinds: ['PALM', 'ROCK'] },
    ], outerOff: 4,
    props: [
      { k: 'PALM', t: 0.8, l: -4.6, s: 1.5, c: false }, { k: 'PALM', t: 0.86, l: 4.7, s: 1.6, c: false },
      { k: 'ROCK', t: 0.62, l: 5.2, c: true }, { k: 'LOG', t: 0.47, l: 3.4, s: 1.2 }, { k: 'LOG', t: 0.53, l: -3.4, s: 1.1 },
    ],
    scatter: [
      { kinds: ['CACTUS', 'BONES', 'SANDSTONE'], t0: 0.05, t1: 0.26, n: 5, lmin: 3, lmax: 5.2, block: false },
      { kinds: ['ROCK', 'STUMP'], t0: 0.3, t1: 0.7, n: 5, lmin: 3.2, lmax: 5, block: false },
    ],
    pieces: [], ribbons: [{ ty: 'DECK', t0: 0.76, t1: 1.0 }], shards: [],
    crates: [{ kind: 'BARREL', t: 0.46, l: 5.6 }, { kind: 'CRATE', t: 0.54, l: -5.6 }],
    tints: [{ t0: 0.34, t1: 0.7, color: '#f6ecc4', k: 0.4 }],
    edge: [[0, 'hills', 0.8], [0.3, 'sea']],
  },
  { // Coral Isles -> Frostpeak: a rocky shore switchbacks up into a snowy mountain pass lined with pines.
    id: 'coral-frost', name: 'The Switchback Shore', from: CI, to: FP, seed: 0x6a04, width: 12,
    pts: [[-3, 23], [2, 20], [6, 16], [2.5, 12], [-3, 8.5], [-1.5, 4.5], [0, 3], [0, -4], [3, -8], [7, -12], [5, -16], [-1, -19.5], [-3.5, -23], [0, -26.5]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.97, 3.5, 0.04]], fire: 0.5, blend: [0.4, 0.62],
    wall: [
      { t0: 0, t1: 0.14, kinds: ['PALM', 'ROCK', 'BOULDER'] },
      { t0: 0.14, t1: 0.4, kinds: ['BOULDER', 'ROCK', 'ROCK', 'BOULDER', 'PINE'] },
      { t0: 0.4, t1: 0.64, kinds: ['PINE', 'ROCK', 'ICE_ROCK', 'PINE', 'BOULDER'] },
      { t0: 0.64, t1: 1.01, kinds: ['PINE', 'ICE_ROCK', 'PINE', 'CRYSTAL_SPIRE', 'BOULDER'] },
    ],
    outer: [
      { t0: 0, t1: 0.12, kinds: ['PALM', 'ROCK'] },
      { t0: 0.12, t1: 0.42, kinds: ['BOULDER', 'ROCK', 'PINE'] },
      { t0: 0.42, t1: 1.01, kinds: ['PINE', 'PINE', 'ICE_ROCK', 'PINE', 'BOULDER'] },
    ], outerOff: 4.5,
    props: [
      { k: 'ICE_ROCK', t: 0.52, l: -4.4, c: true }, { k: 'ICE_ROCK', t: 0.88, l: 4.4, c: true }, { k: 'CRYSTAL_SPIRE', t: 0.93, l: -4.8, c: true },
      { k: 'LOG', t: 0.47, l: 3.4, s: 1.2 }, { k: 'LOG', t: 0.53, l: -3.4, s: 1.1 },
    ],
    scatter: [
      { kinds: ['ROCK', 'BOULDER'], t0: 0.1, t1: 0.42, n: 6, lmin: 3.4, lmax: 5, block: true },
      { kinds: ['PINE', 'ICE_ROCK'], t0: 0.64, t1: 0.94, n: 5, lmin: 3.6, lmax: 5, block: true },
      { kinds: ['STUMP', 'ROCK'], t0: 0.45, t1: 0.7, n: 4, lmin: 3, lmax: 5, block: false },
    ],
    pieces: [{ ty: 'ROCK_STEPS', t: 0.25 }, { ty: 'ROCK_STEPS', t: 0.36, l: 0 }], ribbons: [], shards: [],
    crates: [{ kind: 'CRATE', t: 0.46, l: 5.6 }, { kind: 'BARREL', t: 0.54, l: -5.6 }],
    tints: [{ t0: 0.16, t1: 0.52, color: '#8d8f94', k: 0.55 }],
    edge: [[0, 'sea'], [0.16, 'hills', 1.0], [0.6, 'hills', 1.7]],
  },
  { // Frostpeak -> Ember Wastes: snow melts into ash and black basalt; a glowing crack splits the path; lava beyond the walls.
    id: 'frost-ember', name: 'The Melting Pass', from: FP, to: EW, seed: 0x6a05, width: 13,
    pts: [[3, 24], [6, 19.5], [2.5, 15], [-4, 11.5], [-5, 7.5], [0, 3.5], [0, -4], [2.5, -8], [6.5, -12], [7, -17.5], [3, -22], [0, -26]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.97, 3.5, 0.04]], fire: 0.5, blend: [0.4, 0.62],
    wall: [
      { t0: 0, t1: 0.3, kinds: ['PINE', 'ICE_ROCK', 'PINE', 'BOULDER'] },
      { t0: 0.3, t1: 0.56, kinds: ['PINE', 'ROCK', 'DEAD_TREE', 'BOULDER', 'ICE_ROCK'] },
      { t0: 0.56, t1: 1.01, kinds: ['OBSIDIAN', 'BOULDER', 'ROCK', 'OBSIDIAN', 'ROCK'] },
    ],
    outer: [
      { t0: 0, t1: 0.3, kinds: ['PINE', 'PINE', 'ICE_ROCK'] },
      { t0: 0.3, t1: 0.56, kinds: ['DEAD_TREE', 'PINE', 'ROCK'] },
      { t0: 0.56, t1: 1.01, kinds: ['OBSIDIAN', 'ROCK', 'DEAD_TREE'] },
    ], outerOff: 4.5,
    props: [
      { k: 'LOG', t: 0.47, l: 3.4, s: 1.2 }, { k: 'LOG', t: 0.53, l: -3.4, s: 1.1 },
      { k: 'OBSIDIAN', t: 0.74, l: -4.4, c: true }, { k: 'OBSIDIAN', t: 0.9, l: 4.5, c: true },
    ],
    scatter: [
      { kinds: ['ICE_ROCK', 'PINE'], t0: 0.06, t1: 0.3, n: 4, lmin: 3.6, lmax: 5, block: true },
      { kinds: ['DEAD_TREE', 'ROCK', 'STUMP'], t0: 0.36, t1: 0.6, n: 5, lmin: 3.2, lmax: 5, block: false },
      { kinds: ['OBSIDIAN', 'ROCK'], t0: 0.62, t1: 0.95, n: 4, lmin: 3.6, lmax: 5, block: true },
    ],
    pieces: [{ ty: 'CRACK', t: 0.7, s: 1 }, { ty: 'CRACK', t: 0.84, s: 1.25, yaw: 0.35 }], ribbons: [], shards: [],
    crates: [{ kind: 'BARREL', t: 0.46, l: 5.6 }, { kind: 'CRATE', t: 0.54, l: -5.6 }],
    tints: [{ t0: 0.3, t1: 0.52, color: '#4a4540', k: 0.55 }],
    edge: [[0, 'hills', 1], [0.5, 'lava']],
  },
  { // Ember Wastes -> The Void: scorched ground breaks apart into floating violet shards over the abyss.
    id: 'ember-void', name: 'The Breaking Ground', from: EW, to: VD, seed: 0x6a06, width: 12,
    pts: [[-2, 23], [3, 20], [5.5, 15.5], [1, 11.5], [-4, 8], [-2, 4], [0, 2], [0, -4], [2.5, -8], [2.5, -13], [-2.5, -17], [-5.5, -21], [-2.5, -25]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.97, 3.5, 0.04]], fire: 0.5, blend: [0.36, 0.6],
    wall: [
      { t0: 0, t1: 0.3, kinds: ['OBSIDIAN', 'BOULDER', 'ROCK', 'OBSIDIAN'] },
      { t0: 0.3, t1: 0.55, kinds: ['OBSIDIAN', '_', 'ROCK', 'CRYSTAL_SPIRE', '_'] },
      { t0: 0.55, t1: 1.01, kinds: ['_', 'CRYSTAL_SPIRE', '_', '_', 'RUIN'] },
    ],
    outer: [
      { t0: 0, t1: 0.32, kinds: ['OBSIDIAN', 'ROCK', 'BOULDER'] },
    ], outerOff: 4.5,
    props: [
      { k: 'CRYSTAL_SPIRE', t: 0.7, l: -4.6, c: true }, { k: 'CRYSTAL_SPIRE', t: 0.84, l: 4.8, c: true }, { k: 'RUIN', t: 0.92, l: -4.6, c: true },
      { k: 'LOG', t: 0.47, l: 3.4, s: 1.2 }, { k: 'LOG', t: 0.53, l: -3.4, s: 1.1 },
    ],
    scatter: [
      { kinds: ['ROCK', 'DEAD_TREE', 'BOULDER'], t0: 0.05, t1: 0.34, n: 6, lmin: 3.4, lmax: 5, block: false },
      { kinds: ['CRYSTAL_SPIRE', 'RUIN'], t0: 0.6, t1: 0.95, n: 4, lmin: 3.6, lmax: 4.9, block: true },
    ],
    pieces: [{ ty: 'CRACK', t: 0.17, s: 0.9 }, { ty: 'CRACK', t: 0.32, s: 1.3, yaw: -0.3 }], ribbons: [],
    shards: [{ t0: 0.28, t1: 1.0, n: 44, out0: 3, out1: 15, y0: 0.6, y1: 6.5, s0: 0.5, s1: 1.9 }],
    crates: [{ kind: 'CRATE', t: 0.46, l: 5.6 }, { kind: 'POT', t: 0.54, l: -5.6 }],
    tints: [{ t0: 0.1, t1: 0.4, color: '#1a1210', k: 0.4 }],
    edge: [[0, 'hills', 0.8], [0.34, 'abyss']],
  },
  { // (the loop: The Void -> Greenwood) violet shards give way to a green forest path. Simple.
    id: 'void-greenwood', name: 'The Way Back', from: VD, to: GW, seed: 0x6a00, width: 12,
    pts: [[1.7, 27.4], [5.2, 21.6], [1.7, 15.8], [-3.4, 10.1], [0, 4.3], [0, -4.3], [4.3, -10.1], [5.2, -17.3], [0.9, -24.5], [0, -29.5]],
    bulges: [[0.5, 5.5, 0.07], [0.04, 1.5, 0.04], [0.97, 3.5, 0.04]], fire: 0.5, blend: [0.4, 0.6],
    wall: [
      { t0: 0, t1: 0.4, kinds: ['CRYSTAL_SPIRE', 'BOULDER', 'CRYSTAL_SPIRE', 'RUIN'] },
      { t0: 0.4, t1: 0.6, kinds: ['ROCK', 'TREE', 'CRYSTAL_SPIRE', 'TREE'] },
      { t0: 0.6, t1: 1.01, kinds: ['TREE', 'PINE', 'TREE', 'ROCK'] },
    ],
    outer: [
      { t0: 0, t1: 0.4, kinds: ['CRYSTAL_SPIRE', 'RUIN'] },
      { t0: 0.4, t1: 1.01, kinds: ['TREE', 'PINE', 'TREE'] },
    ], outerOff: 4.5,
    props: [{ k: 'LOG', t: 0.47, l: 3.4, s: 1.2 }, { k: 'LOG', t: 0.53, l: -3.4, s: 1.1 }],
    scatter: [{ kinds: ['STUMP', 'LOG', 'ROCK'], t0: 0.62, t1: 0.94, n: 5, lmin: 3, lmax: 5, block: false }],
    pieces: [], ribbons: [],
    shards: [{ t0: 0, t1: 0.5, n: 22, out0: 3, out1: 12, y0: 0.6, y1: 5, s0: 0.5, s1: 1.5 }],
    crates: [{ kind: 'BARREL', t: 0.46, l: 5.6 }, { kind: 'CRATE', t: 0.54, l: -5.6 }],
    tints: [],
    edge: [[0, 'abyss'], [0.4, 'hills', 1]],
  },
];

/** The authored layout for the camp that opens biome `b` (b % 7 === 0 is the loop back to Greenwood). */
export function campLayoutFor(biome: number): CampLayout {
  const to = ((biome % 7) + 7) % 7;
  return CAMP_LAYOUTS.find((l) => l.to === to) ?? CAMP_LAYOUTS[0];
}

// ---------------------------------------------------------------- the built path ----
const MAX_S = 200;
export interface CampPath {
  layout: CampLayout;
  n: number; len: number;
  /** Samples every ~1 unit along the centre line: position, unit tangent, half width, arc length. */
  px: Float32Array; pz: Float32Array; tx: Float32Array; tz: Float32Array; hw: Float32Array; ss: Float32Array;
  /** Axis-aligned bounds of the walkable region (+ the walls). */
  minX: number; maxX: number; minZ: number; maxZ: number;
}
export const camp = { cur: null as CampPath | null, ver: 0 };
/** Is the current room a transition-path camp? (roomShape.fixed is switched off by every procedural room.) */
export const campOn = (): boolean => fixed.on && camp.cur !== null;

const cache = new Map<string, CampPath>();

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function buildPath(L: CampLayout): CampPath {
  const hit = cache.get(L.id); if (hit) return hit;
  // dense spline, then resample by arc length
  const P = L.pts, dense: [number, number][] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) { const u = k / 16; dense.push([catmull(a[0], b[0], c[0], d[0], u), catmull(a[1], b[1], c[1], d[1], u)]); }
  }
  dense.push([P[P.length - 1][0], P[P.length - 1][1]]);
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.min(MAX_S, Math.floor(len) + 1);
  const at = (s: number): [number, number] => {
    let j = 1; while (j < cum.length - 1 && cum[j] < s) j++;
    const f = (s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    return [dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f];
  };
  const step = len / (n - 1);
  const rx = new Float32Array(n), rz = new Float32Array(n);
  for (let i = 0; i < n; i++) { const q = at(i * step); rx[i] = q[0]; rz[i] = q[1]; }
  // rotate / translate so the waystation is at the origin on a run heading -z
  const wi = Math.round(L.fire * (n - 1)), w0 = Math.max(0, wi - 2), w1 = Math.min(n - 1, wi + 2);
  const dxw = rx[w1] - rx[w0], dzw = rz[w1] - rz[w0], ang = Math.atan2(dzw, dxw), rot = -Math.PI / 2 - ang;
  const cs = Math.cos(rot), sn = Math.sin(rot), ox = rx[wi], oz = rz[wi];
  const px = new Float32Array(n), pz = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n), hw = new Float32Array(n), ss = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = rx[i] - ox, z = rz[i] - oz;
    px[i] = x * cs - z * sn; pz[i] = x * sn + z * cs; ss[i] = i * step;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    const t = i / (n - 1);
    let h = L.width / 2;
    for (const [bt, amt, sg] of L.bulges) h += amt * Math.exp(-((t - bt) * (t - bt)) / (2 * sg * sg));
    hw[i] = Math.max(3.4, h);
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i] - hw[i]); maxX = Math.max(maxX, px[i] + hw[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const path: CampPath = { layout: L, n, len, px, pz, tx, tz, hw, ss, minX: minX - 8, maxX: maxX + 8, minZ: minZ - 8, maxZ: maxZ + 8 };
  cache.set(L.id, path);
  return path;
}

/** Interpolated centre-line state at arc position s (clamped). out = [x, z, tx, tz, hw]. */
export function campAtS(p: CampPath, s: number, out: Float32Array | number[]): void {
  const f = Math.min(p.n - 1, Math.max(0, s / p.len * (p.n - 1))), i = Math.min(p.n - 2, Math.floor(f)), k = f - i;
  out[0] = p.px[i] + (p.px[i + 1] - p.px[i]) * k; out[1] = p.pz[i] + (p.pz[i + 1] - p.pz[i]) * k;
  let tx = p.tx[i] + (p.tx[i + 1] - p.tx[i]) * k, tz = p.tz[i] + (p.tz[i + 1] - p.tz[i]) * k; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  out[2] = tx; out[3] = tz; out[4] = p.hw[i] + (p.hw[i + 1] - p.hw[i]) * k;
}
const _a = [0, 0, 0, 0, 0];
/** World point at (t, l): t along the path (0..1, may overshoot the ends by extrapolating), l lateral (+ right of travel). */
export function campPoint(p: CampPath, t: number, l: number, out: [number, number]): void {
  const s = t * p.len;
  if (s < 0 || s > p.len) {   // beyond the ends: continue straight
    campAtS(p, s < 0 ? 0 : p.len, _a);
    const d = s < 0 ? s : s - p.len;
    out[0] = _a[0] + _a[2] * d - _a[3] * l; out[1] = _a[1] + _a[3] * d + _a[2] * l;
    return;
  }
  campAtS(p, s, _a);
  out[0] = _a[0] - _a[3] * l; out[1] = _a[1] + _a[2] * l;
}
/** Nearest centre-line sample to (x, z): sets out = [t, l, distance]. Used by the ground painter and the minimap. */
export function campNearest(p: CampPath, x: number, z: number, out: number[]): void {
  let best = 1e18, bi = 0;
  for (let i = 0; i < p.n; i++) { const dx = x - p.px[i], dz = z - p.pz[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  const dx = x - p.px[bi], dz = z - p.pz[bi];
  const along = dx * p.tx[bi] + dz * p.tz[bi];
  const t = Math.min(1.02, Math.max(-0.02, (p.ss[bi] + along) / p.len));
  out[0] = t; out[1] = dx * -p.tz[bi] + dz * p.tx[bi]; out[2] = Math.sqrt(best);
}
/** Half width at t. */
export function campHalfWidth(p: CampPath, t: number): number {
  const f = Math.min(p.n - 1, Math.max(0, t * (p.n - 1))), i = Math.min(p.n - 2, Math.floor(f));
  return p.hw[i] + (p.hw[i + 1] - p.hw[i]) * (f - i);
}

// ---------------------------------------------------------------- obstacle specs ----
interface KSpec { s: [number, number]; r: (s: number) => number; blocks: boolean; walk?: boolean; wall?: boolean }
const KS: Partial<Record<ObstacleKind, KSpec>> = {
  TREE: { s: [1.5, 2.4], r: (s) => 0.8 + s * 0.25, blocks: true },
  PINE: { s: [1.5, 2.4], r: (s) => 0.8 + s * 0.25, blocks: true },
  DEAD_TREE: { s: [1.3, 2.0], r: (s) => 0.7 + s * 0.2, blocks: true },
  ROCK: { s: [0.9, 1.7], r: (s) => 0.6 + s * 0.9, blocks: true },
  ICE_ROCK: { s: [0.9, 1.7], r: (s) => 0.6 + s * 0.9, blocks: true },
  BOULDER: { s: [1.6, 2.5], r: (s) => 1 + s * 0.7, blocks: true },
  OBSIDIAN: { s: [1.0, 1.8], r: (s) => 0.8 + s * 0.35, blocks: true },
  STUMP: { s: [0.9, 1.5], r: () => 0.6, blocks: false },
  LOG: { s: [1, 1.2], r: () => 0.9, blocks: false },
  BONES: { s: [0.9, 1.4], r: () => 0.8, blocks: false, walk: true },
  RUIN: { s: [1, 1.6], r: () => 0.9, blocks: true },
  STATUE: { s: [1, 1.3], r: () => 1.0, blocks: true },
  CRYSTAL_SPIRE: { s: [1.1, 1.9], r: () => 1.0, blocks: true },
  CACTUS: { s: [1.0, 1.6], r: () => 0.75, blocks: true },
  SANDSTONE: { s: [1.0, 1.6], r: (s) => 1.1 + s * 0.25, blocks: true },
  COLUMN: { s: [1.0, 1.3], r: () => 0.95, blocks: true },
  LOWWALL: { s: [1.0, 1.15], r: () => 1.45, blocks: true, wall: true },
  CASTLEWALL: { s: [1.0, 1.12], r: () => 1.7, blocks: true, wall: true },
  BRAZIER: { s: [1.0, 1.15], r: () => 0.75, blocks: true },
  PALM: { s: [1.2, 1.7], r: () => 1.0, blocks: true },
};
const kspec = (k: ObstacleKind): KSpec => KS[k] ?? KS.ROCK!;

/** Set-piece colliders in the piece's frame: [lateral, forward, r] (forward = the travel direction). */
const PIECE_COL: Partial<Record<PieceType, [number, number, number][]>> = {
  GATE: [[-4.5, 0, 1.15], [4.5, 0, 1.15], [-3.3, 0, 0.7], [3.3, 0, 0.7]],
  BURIED_COLUMN: [[0, 0, 1.0]],
};

// ---------------------------------------------------------------- the builder ----
/** Where each prop ended up (render: set pieces + shards read this). */
export interface PlacedPiece { ty: PieceType; x: number; z: number; yaw: number; s: number }
export interface PlacedShard { x: number; z: number; y: number; s: number; ph: number; sp: number }
export const campBuilt = { pieces: [] as PlacedPiece[], shards: [] as PlacedShard[], wayX: 0, wayZ: 0 };

const tmpP: [number, number] = [0, 0];
const SAMPLE = 0.25;

/** Builds the transition-path camp that opens biome `biome`: scenery, colliders, bounds envelope, fixed spots. */
export function buildCampRoom(biome: number): void {
  const L = campLayoutFor(biome), P = buildPath(L);
  camp.cur = P; camp.ver++;
  const rnd = mulberry32(L.seed);
  const rand = (a: number, b: number): number => a + rnd() * (b - a);
  const obstacles: Obstacle[] = [], colliders: Collider[] = [];
  let id = 1;
  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, collide: boolean, rot: number, blocksProj = true): void => {
    obstacles.push({ id: id++, kind, pos: new Vector3(x, 0, z), radius, scale, rot, blocksProjectiles: blocksProj });
    if (collide) colliders.push({ x, z, r: radius, blocksProjectiles: blocksProj });
  };
  const pickStretch = (list: Stretch[], t: number): Stretch | null => { for (const s of list) if (t >= s.t0 && t < s.t1) return s; return list.length ? list[list.length - 1] : null; };
  const tangentYaw = (tx: number, tz: number): number => -Math.atan2(tz, tx);   // lays a wall segment (built along local x) along the tangent

  // keep-clear discs (arrival, waystation clearing, exit): scatter never lands there
  const way = [0, 0], start = [0, 0], exit = [0, 0];
  campAtS(P, 3.5, _a); start[0] = _a[0]; start[1] = _a[1];
  campAtS(P, P.len - 4.5, _a); exit[0] = _a[0]; exit[1] = _a[1]; const edx = _a[2], edz = _a[3];
  campBuilt.wayX = 0; campBuilt.wayZ = 0;
  const keep = [{ x: start[0], z: start[1], r: 5 }, { x: way[0], z: way[1], r: 11 }, { x: exit[0], z: exit[1], r: 9 }];
  const nearKeep = (x: number, z: number, r: number): boolean => { for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return true; return false; };
  const blocked = (x: number, z: number, r: number, gap: number): boolean => { for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + gap) return true; return false; };

  // ---- continuous wall chains down both sides (distance-based spacing: tight on the outside of a bend, never a gap)
  /** Would a wall circle at (x, z, r) eat into the walkable strip anywhere along the road? */
  const intrudes = (x: number, z: number, r: number, hwOwn: number): boolean => {
    const need = hwOwn * 0.82, n2 = need * need;   // (only the fold of a tight bend gets this close to the road; flaring bulges stay well clear)
    for (let i = 0; i < P.n; i++) { const dx = x - P.px[i], dz = z - P.pz[i]; if (dx * dx + dz * dz < n2) return true; }
    return false;
  };
  const chain = (getPoint: (u: number, r: number, o: [number, number]) => void, U: number, stretchAt: (u: number) => Stretch | null, yawAt: (u: number) => number, roadSide = false): void => {
    let lx = 1e9, lz = 1e9, lastR = 0, kind: WallKind = 'ROCK', spec: KSpec | null = null, s = 1, r = 0.8, pending = false;
    const o: [number, number] = [0, 0];
    for (let u = 0; u <= U; u += SAMPLE) {
      const st = stretchAt(u);
      if (!st) continue;
      if (!pending || !st.kinds.includes(kind)) {   // the next slot's kind (kept until it is placed; re-rolled when the stretch changes)
        kind = st.kinds[Math.floor(rnd() * st.kinds.length)];
        spec = kind === '_' ? null : kspec(kind);
        s = spec ? rand(spec.s[0], spec.s[1]) : 1; r = spec ? spec.r(s) : 0.8; pending = true;
      }
      getPoint(u, r, o);
      if (roadSide) { campAtS(P, u, _a); if (intrudes(o[0], o[1], r, _a[4])) continue; }   // the inside of a tight bend: the offset curve folds over the road
      if (lastR > 0 && Math.hypot(o[0] - lx, o[1] - lz) < (lastR + r) * (spec?.wall ? 0.97 : 0.9)) continue;
      if (!spec) colliders.push({ x: o[0], z: o[1], r, blocksProjectiles: false });
      else add(kind as ObstacleKind, o[0], o[1], r, s, true, spec.wall ? yawAt(u) : rnd() * Math.PI * 2);
      lx = o[0]; lz = o[1]; lastR = r; pending = false;
    }
  };
  for (const side of [-1, 1]) {
    chain((u, r, o) => {
      campAtS(P, u, _a);
      const off = _a[4] + r * 0.75 + 0.35;   // the circle's centre: its inner edge just outside the walkable half width
      o[0] = _a[0] - _a[3] * side * off; o[1] = _a[1] + _a[2] * side * off;
    }, P.len, (u) => pickStretch(L.wall, u / P.len), (u) => { campAtS(P, u, _a); return tangentYaw(_a[2], _a[3]); }, true);
  }
  // end caps: the road starts and ends in a wall of the first / last stretch's kinds
  for (const end of [0, 1]) {
    const st = L.wall[end ? L.wall.length - 1 : 0];
    const s0 = end ? P.len + 3.4 : -2.4;
    campAtS(P, end ? P.len : 0, _a);
    const d = end ? s0 - P.len : s0, hw0 = _a[4] + 2.5, cx = _a[0] + _a[2] * d, cz = _a[1] + _a[3] * d, nx = -_a[3], nz = _a[2];
    const kinds = st.kinds.filter((k) => k !== '_');
    const fake: Stretch = { t0: 0, t1: 1, kinds: kinds.length ? kinds : ['ROCK', 'BOULDER'] };
    chain((u, _r, o) => { o[0] = cx + nx * (-hw0 + u); o[1] = cz + nz * (-hw0 + u); }, hw0 * 2, () => fake, () => tangentYaw(nx, nz));
  }

  // ---- decorative outer ring (no collision): taller scenery behind the walls frames the road
  for (const side of [-1, 1]) {
    let lx = 1e9, lz = 1e9, lastR = 0;
    for (let u = 0; u <= P.len; u += SAMPLE * 2) {
      const t = u / P.len, st = pickStretch(L.outer, t);
      if (!st || t < st.t0 || t >= st.t1) continue;
      const kind = st.kinds[Math.floor(rnd() * st.kinds.length)];
      if (kind === '_') continue;
      const spec = kspec(kind), s = rand(spec.s[0], spec.s[1]) * (spec.wall ? 1.25 : 1.2), r = spec.r(s);
      campAtS(P, u, _a);
      const off = _a[4] + L.outerOff + rand(-0.5, 1.2);
      const x = _a[0] - _a[3] * side * off, z = _a[1] + _a[2] * side * off;
      if (Math.hypot(x - lx, z - lz) < (lastR + r) * 1.15 + 0.8) continue;
      add(kind, x, z, r, s, false, spec.wall ? tangentYaw(_a[2], _a[3]) : rnd() * Math.PI * 2);
      lx = x; lz = z; lastR = r;
    }
  }

  // ---- authored props
  for (const p of L.props) {
    const spec = kspec(p.k), s = p.s ?? rand(spec.s[0], spec.s[1]);
    campPoint(P, p.t, p.l, tmpP);
    const collide = p.c ?? spec.blocks;
    add(p.k, tmpP[0], tmpP[1], spec.r(s), s, collide, rnd() * Math.PI * 2);
  }
  // ---- scatter (seeded): inside the road but off the middle, away from the arrival / waystation / exit
  for (const sc of L.scatter) {
    for (let k = 0, tries = 0; k < sc.n && tries < sc.n * 40; tries++) {
      const kind = sc.kinds[Math.floor(rnd() * sc.kinds.length)], spec = kspec(kind), s = rand(spec.s[0], spec.s[1]), r = spec.r(s);
      const t = rand(sc.t0, sc.t1), hw = campHalfWidth(P, t);
      const lo = sc.block && spec.blocks ? r + 2.4 : 0;   // blocking props leave a clear lane of >= 2.4 beside the centre line
      if (lo > hw - 0.6) continue;
      const l = (rnd() < 0.5 ? -1 : 1) * Math.min(Math.max(rand(sc.lmin, sc.lmax), lo), hw - r * 0.6 - 0.3);
      campPoint(P, t, l, tmpP);
      if (nearKeep(tmpP[0], tmpP[1], r) || blocked(tmpP[0], tmpP[1], r, 1.2)) continue;
      add(kind, tmpP[0], tmpP[1], r, s, !!sc.block && spec.blocks, rnd() * Math.PI * 2);
      k++;
    }
  }
  // ---- set pieces (their colliders) and shards
  campBuilt.pieces.length = 0; campBuilt.shards.length = 0;
  for (const pc of L.pieces) {
    const t = pc.t, s = pc.s ?? 1;
    campPoint(P, t, pc.l ?? 0, tmpP);
    campAtS(P, t * P.len, _a);
    const yaw = Math.atan2(-_a[2], -_a[3]) + (pc.yaw ?? 0);
    campBuilt.pieces.push({ ty: pc.ty, x: tmpP[0], z: tmpP[1], yaw, s });
    const cols = PIECE_COL[pc.ty];
    if (cols) for (const [lat, fwd, r] of cols) {
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      // local x (lateral) -> (cos, -sin); local -z (forward) -> (-sin, -cos)
      colliders.push({ x: tmpP[0] + (lat * c - fwd * sn) * s, z: tmpP[1] + (-lat * sn - fwd * c) * s, r: r * s, blocksProjectiles: true });
    }
  }
  for (const sh of L.shards) {
    for (let i = 0; i < sh.n; i++) {
      const t = rand(sh.t0, sh.t1), side = rnd() < 0.5 ? -1 : 1, hw = campHalfWidth(P, t);
      campPoint(P, t, side * (hw + rand(sh.out0, sh.out1)), tmpP);
      campBuilt.shards.push({ x: tmpP[0], z: tmpP[1], y: rand(sh.y0, sh.y1), s: rand(sh.s0, sh.s1), ph: rnd() * 6.28, sp: rand(0.4, 1.1) });
    }
  }
  // crates (decor + a little loot)
  const crateList: { kind: CrateKind; x: number; z: number }[] = [];
  for (const c of L.crates) { campPoint(P, c.t, c.l, tmpP); crateList.push({ kind: c.kind, x: tmpP[0], z: tmpP[1] }); }

  // ---- fixed spots + the walkable envelope
  fixed.on = true;
  fixed.sx = start[0]; fixed.sz = start[1]; fixed.stx = way[0]; fixed.stz = way[1];
  fixed.ex = exit[0]; fixed.ez = exit[1]; fixed.dx = edx; fixed.dz = edz;
  buildEnvelope(P);
  world.obstacles = obstacles;
  world.obstaclesVersion++;
  installRoom(colliders, shape.maxR);
  commitCrates(crateList, rnd);
}

/** Facing of the hero on arrival (along the first stretch of the path). */
export function campStartFacing(): number {
  const P = camp.cur; if (!P) return Math.PI;
  campAtS(P, 3.5, _a);
  return Math.atan2(_a[2], _a[3]);
}

/** Polar envelope of the whole road (the roomShape table): for every direction the farthest road point. Colliders keep the
 *  hero on the road itself; this just bounds everything that clamps with edgeLimit (blink, dashes, loot ...). */
function buildEnvelope(P: CampPath): void {
  const T = shape.table, TAU = Math.PI * 2;
  T.fill(0);
  const mark = (x: number, z: number): void => {
    const r = Math.hypot(x, z); if (r < 1e-3) return;
    const b = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * SHAPE_N) % SHAPE_N;
    if (r > T[b]) T[b] = r;
  };
  for (let s = -3; s <= P.len + 4; s += 0.4) {
    campAtS(P, Math.min(P.len, Math.max(0, s)), _a);
    const d = s < 0 ? s : s > P.len ? s - P.len : 0, cx = _a[0] + _a[2] * d, cz = _a[1] + _a[3] * d, h = _a[4] + 3;
    for (let l = -h; l <= h; l += 0.5) mark(cx - _a[3] * l, cz + _a[2] * l);
  }
  // close gaps (bins no sample landed in): the smaller neighbour, then a small max filter
  for (let pass = 0; pass < 6; pass++) for (let i = 0; i < SHAPE_N; i++) if (T[i] === 0) { const a = T[(i + SHAPE_N - 1) % SHAPE_N], b = T[(i + 1) % SHAPE_N]; if (a > 0 && b > 0) T[i] = Math.min(a, b); else if (pass > 2) T[i] = Math.max(a, b); }
  const tmp = new Float32Array(SHAPE_N);
  for (let i = 0; i < SHAPE_N; i++) { let m = T[i]; for (let k = -2; k <= 2; k++) m = Math.max(m, T[(i + k + SHAPE_N) % SHAPE_N]); tmp[i] = m + 0.5; }
  let mx = 0, mn = 1e9;
  for (let i = 0; i < SHAPE_N; i++) { T[i] = Math.max(8, tmp[i]); mx = Math.max(mx, T[i]); mn = Math.min(mn, T[i]); }
  T[SHAPE_N] = T[0]; T[SHAPE_N + 1] = T[1];
  shape.kind = 'RECT'; shape.maxR = mx; shape.minR = mn; shape.baseR = Math.min(30, P.len * 0.4); shape.fx = 0; shape.fz = -1; shape.version++;
}
