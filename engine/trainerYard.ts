// ============================================================================
// The Skill Trainer's TRAINING YARD (owner 2026-10-31: "the skill trainer is at the bottom now, please move this elsewhere").
// It used to stand on the stair landing of the Middle Town (x -16, z -17) and was drawn at ground level (y 0, under the h 1.8 terrace).
// Now it fills the old cloister garden east of the chapel, wrapping round the chapel's north-east corner (Middle Town, h 1.8):
//   * main yard  x -23..-13  z -31..-21   (dummies, weapon rack, hay, sand floor)
//   * north strip x -27.8..-13 z -38.2..-31 (the tent in the north-east corner, the archery row along the north hedge, benches)
// Pure data (NO imports but TRAINER_POS: townData, townFill, mapgen, the Station renderer and the layout audit all read it).
// Coordinates are WORLD x / z; the renderer subtracts TRAINER_POS (the tent's anchor; the tent faces +z = south, the camera).
// ============================================================================
import { TRAINER_POS } from './world';

/** The yard's bounding box (hedge / fence ring inside it). */
export const TY_BOX = { x0: -27.8, x1: -13.0, z0: -38.2, z1: -21.0 };
/** South gate (the approach road runs x TRAINER_POS[0] from the stair flight at x -16 to here) + east gate (a lane to the Royal Way). */
export const TY_GATE_S = { x: TRAINER_POS[0], z: TY_BOX.z1, hw: 2.2 };
export const TY_GATE_E = { x: TY_BOX.x1, z: -28.6, hw: 2.2 };

/** Low picket fence runs [x1, z1, x2, z2] (townData FENCES): the south side, a gap for the gate. The other sides are hedges (townFill). */
export const TY_FENCES: [number, number, number, number][] = [
  [-23.0, TY_BOX.z1, TY_GATE_S.x - TY_GATE_S.hw, TY_BOX.z1],
  [TY_GATE_S.x + TY_GATE_S.hw, TY_BOX.z1, TY_BOX.x1, TY_BOX.z1],
];
/** Hedge runs [x1, z1, x2, z2] (townFill hedge()): north, west (to the chapel's north wall) and east (gap = the east gate, then down to the fence). */
export const TY_HEDGES: [number, number, number, number][] = [
  [TY_BOX.x0, TY_BOX.z0, TY_BOX.x1, TY_BOX.z0],
  [TY_BOX.x0, TY_BOX.z0, TY_BOX.x0, -31.4],
  [TY_BOX.x1, TY_BOX.z0, TY_BOX.x1, TY_GATE_E.z - TY_GATE_E.hw],
  [TY_BOX.x1, TY_GATE_E.z + TY_GATE_E.hw, TY_BOX.x1, TY_BOX.z1],
];

/** Straw dummies [x, z, yaw], archery targets (face south) [x, z], weapon rack [x, z, yaw side], hay [x, z]. */
export const TY_DUMMIES: [number, number, number][] = [[-21.3, -23.0, 0.3], [-19.5, -24.9, -0.4], [-21.3, -26.8, 0.2]];
export const TY_TARGETS: [number, number][] = [[-25.8, -37.0], [-23.8, -37.0], [-21.8, -37.0], [-19.8, -37.0]];
export const TY_RACK = { x: -13.9, z: -23.6 };   // against the east hedge, faces west
export const TY_HAY: [number, number][] = [[-14.0, -25.9]];
/** Banner poles (flag points toward `dir`), inside the south gate. */
export const TY_BANNERS: [number, number, -1 | 1][] = [[-18.4, -22.3, 1], [-14.0, -22.3, -1]];
/** Gate posts of the east gate (stone pillars with a lantern) [x, z]. */
export const TY_POSTS: [number, number][] = [[TY_BOX.x1, TY_GATE_E.z - TY_GATE_E.hw + 0.2], [TY_BOX.x1, TY_GATE_E.z + TY_GATE_E.hw - 0.2], [TY_GATE_S.x - TY_GATE_S.hw, TY_BOX.z1], [TY_GATE_S.x + TY_GATE_S.hw, TY_BOX.z1]];

/** Benches [x, z, yaw] (sit spots, townData TOWN_SEATS; yaw 0 faces south, PI faces north). */
export const TY_SEATS: [number, number, number][] = [[-26.2, -33.0, Math.PI], [-20.4, -18.6, 0]];
/** Lamp posts [x, z] (townData LAMPS). */
export const TY_LAMPS: [number, number][] = [[-19.4, -19.9], [-13.9, -19.9], [-27.0, -31.9], [-22.4, -29.9]];
/** Trees [x, z, role 0 oak / 1 blossom] and flower clumps [x, z, scale] (townFill, walk-through flowers). */
export const TY_TREES: [number, number, number][] = [[-27.0, -36.9, 0], [-22.0, -18.3, 1]];
export const TY_FLOWERS: [number, number, number][] = [
  [-27.2, -32.1, 0.7], [-27.2, -34.3, 0.7], [-17.0, -37.3, 0.8], [-23.0, -31.9, 0.7],
  [-22.2, -29.5, 0.8], [-13.7, -37.2, 0.8],
  [-22.2, -22.0, 0.8], [-22.2, -24.9, 0.7],
  [-21.6, -19.9, 0.9], [-23.2, -19.6, 0.8], [-18.9, -17.4, 0.8], [-13.4, -17.4, 0.8],
];
