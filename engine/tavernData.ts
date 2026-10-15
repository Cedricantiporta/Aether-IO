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

export const TAVERN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = TAP;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]);
  for (let z = -hd; z <= hd; z += 1.1) c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]);
  for (let x = BAR_X0; x <= BAR_X1 + 0.01; x += 0.9) c.push([x, BAR_Z, 0.65]);   // the bar counter
  for (const [x, z] of TAP_TABLES) c.push([x, z, 1.15]);                             // table + its stools
  c.push([HEARTH.x - 0.3, HEARTH.z, 1.3]);                                           // hearth
  c.push([-8, -6, 0.9], [-8, -4.6, 0.9], [7.6, -6, 0.9], [7.6, 6, 0.8]);             // barrels / casks
  return c;
})();
