// ============================================================================
// Tavern interior (the village "TAVERN" area: the Golden Tankard east of the keep): layout + collision circles (pure
// data). Centred on the world origin like the chapel. Door at the south end (+z), the bar along the north wall, round
// tables with stools, a hearth in the east wall. Read by render/TavernInterior.tsx, engine/systems/village.ts, questNav.
// ============================================================================
import { TAVERN } from './townData';

export const TAP = { hw: 9, hd: 7, h: 6 };
/** The bar counter (along x at z BAR_Z, from BAR_X0 to BAR_X1); the barkeep stands behind it. */
export const BAR_Z = -4.2, BAR_X0 = -6, BAR_X1 = 2.5;
export const TAP_TABLES: [number, number][] = [[-5.2, 1.4], [-0.8, 3.4], [3.8, 0.6], [5.6, 4.4], [-5.6, 5.2]];
export const HEARTH = { x: 8.3, z: -1.5 };
export const TAVERN_SPAWN = { x: 0, z: 5.4 };
export const TAVERN_EXIT = { x: 0, z: 7.2, r: 3.2 };
/** The tavern door in the town (south face of the Golden Tankard). */
export const TAVERN_DOOR = { x: TAVERN.x, z: TAVERN.z + TAVERN.d / 2 + 1.6, r: 3.2 };
/** Where the hero stands after walking out of the tavern (facing the town). */
export const TAVERN_OUT = { x: TAVERN.x, z: TAVERN.z + TAVERN.d / 2 + 3.0 };

/** Stools around a round table (3 each, evenly spread; the renderer and the colliders both use this). */
export function tableStools(x: number, z: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + x; out.push([x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5]); }
  return out;
}
/** Barrels / casks (kit barrel_tap: spout toward +z / the room): x, z, yaw of the spout. */
export const TAP_BARRELS: [number, number, number][] = [[-8.1, -6, Math.PI / 2], [-8.1, -4.6, Math.PI / 2], [7.9, -6, -Math.PI / 2], [7.9, 6, -Math.PI / 2], [-5.4, -6.15, 0]];
/** Potted plants, the crate stack in the NE corner and the notice board on the west wall (visual + colliders). */
export const TAP_PLANTS: [number, number][] = [[-8.1, 5.9], [8.1, 3.4]];
export const TAP_CRATES = { x: 5.3, z: -6.0 };
export const TAP_BOARD = { x: -8.5, z: -1.6 };

export const TAVERN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = TAP;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]);
  for (let z = -hd; z <= hd; z += 1.1) c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]);
  for (let x = BAR_X0; x <= BAR_X1 + 0.01; x += 0.9) c.push([x, BAR_Z, 0.65]);   // the bar counter
  for (const [x, z] of TAP_TABLES) { c.push([x, z, 1.15]); for (const [sx, sz] of tableStools(x, z)) c.push([sx, sz, 0.35]); }   // table + its stools
  c.push([HEARTH.x, HEARTH.z - 1.1, 0.75], [HEARTH.x, HEARTH.z, 0.8], [HEARTH.x, HEARTH.z + 1.1, 0.75]);   // fireplace (3.3 m wide, against the east wall)
  for (const [x, z] of TAP_BARRELS) c.push([x, z, 0.8]);                              // barrels / casks
  for (const [x, z] of TAP_PLANTS) c.push([x, z, 0.5]);
  for (const dx of [-0.9, 0, 0.9, 1.8]) c.push([TAP_CRATES.x + dx, TAP_CRATES.z, 0.85]);
  for (const dz of [-0.8, 0, 0.8]) c.push([TAP_BOARD.x, TAP_BOARD.z + dz, 0.5]);
  return c;
})();
