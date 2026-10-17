// ============================================================================
// (owner) The adventurer's house (the village "HOME" area; townData HERO_HOUSE in the south-west wall corner): a small
// one-room cottage with a bed (E: sleep - the next Font dream if one is due), a hearth, a table and a chest. Layout +
// collision circles (pure data), centred on the world origin like the tavern; door at the south end (+z).
// Read by render/HomeInterior.tsx, engine/systems/village.ts, questNav, the minimap.
// ============================================================================
import { HERO_HOUSE } from './townData';

export const HOME_ROOM = { hw: 5.2, hd: 4.2, h: 4.6 };
export const BED = { x: -3.3, z: -2.4 };
export const HOME_HEARTH = { x: 4.4, z: -1.6 };
export const HOME_TABLE = { x: 1.2, z: 0.4 };
export const HOME_SPAWN = { x: 0, z: 2.8 };
export const HOME_EXIT = { x: 0, z: 4.2, r: 2.6 };
/** The house door in the town (the house faces north, -z: rot PI). */
export const HOME_DOOR = { x: HERO_HOUSE.x, z: HERO_HOUSE.z - HERO_HOUSE.d / 2 - 1.1, r: 2.6 };
/** Where the hero stands after walking out of the house (facing the town). */
export const HOME_OUT = { x: HERO_HOUSE.x, z: HERO_HOUSE.z - HERO_HOUSE.d / 2 - 2.2 };

export const HOME_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = HOME_ROOM;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]);
  for (let z = -hd; z <= hd; z += 1.1) c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]);
  c.push([BED.x, BED.z - 0.6, 0.9], [BED.x, BED.z + 0.6, 0.9]);   // the bed (head against the north wall)
  c.push([HOME_HEARTH.x + 0.3, HOME_HEARTH.z, 1.1]);              // hearth
  c.push([HOME_TABLE.x, HOME_TABLE.z, 0.9]);                      // table
  c.push([-4.3, 2.4, 0.6], [3.9, 2.6, 0.7], [0.6, -3.6, 0.7]);    // chest, barrel, wardrobe
  return c;
})();
