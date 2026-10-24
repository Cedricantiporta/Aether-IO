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
/** The house door in the town (the house faces south, +z, toward the camera; the kit door sits 0.8 left of the centre line). */
export const HOME_DOOR = { x: HERO_HOUSE.x, z: HERO_HOUSE.z - HERO_HOUSE.d / 2 - 1.1, r: 2.6 };   // (the house faces NORTH onto the lane z 23.2 now, backs to the south wall)
/** Where the hero stands after walking out of the house (facing the town). */
export const HOME_OUT = { x: HERO_HOUSE.x, z: HERO_HOUSE.z - HERO_HOUSE.d / 2 - 2.2 };

/** Furniture placed around the room (visual + colliders): wardrobe + bookshelf on the north wall, desk with a stool on the west wall, a barrel + plants. */
export const HOME_WARDROBE = { x: -0.9, z: -3.5 };
export const HOME_SHELF = { x: 1.6, z: -3.85 };
export const HOME_DESK = { x: -4.5, z: 1.6 };
export const HOME_BARREL = { x: 4.4, z: 2.9 };
export const HOME_PLANTS: [number, number][] = [[3.0, 3.5], [-4.4, 3.3]];

export const HOME_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = HOME_ROOM;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]);
  for (let z = -hd; z <= hd; z += 1.1) c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]);
  c.push([BED.x, BED.z - 0.6, 0.9], [BED.x, BED.z + 0.6, 0.9]);   // the bed (head against the north wall)
  c.push([HOME_HEARTH.x + 0.1, HOME_HEARTH.z - 0.8, 0.7], [HOME_HEARTH.x + 0.1, HOME_HEARTH.z, 0.75], [HOME_HEARTH.x + 0.1, HOME_HEARTH.z + 0.8, 0.7]);   // hearth (2.6 m wide, against the east wall)
  c.push([HOME_TABLE.x, HOME_TABLE.z, 0.95], [HOME_TABLE.x - 1.2, HOME_TABLE.z, 0.35], [HOME_TABLE.x + 1.2, HOME_TABLE.z, 0.35]);   // table + its two stools
  c.push([HOME_WARDROBE.x - 0.4, HOME_WARDROBE.z, 0.6], [HOME_WARDROBE.x + 0.4, HOME_WARDROBE.z, 0.6]);   // wardrobe
  c.push([HOME_SHELF.x - 0.6, HOME_SHELF.z, 0.5], [HOME_SHELF.x + 0.6, HOME_SHELF.z, 0.5]);               // bookshelf
  c.push([HOME_DESK.x, HOME_DESK.z - 0.4, 0.55], [HOME_DESK.x, HOME_DESK.z + 0.4, 0.55]);                 // desk
  c.push([HOME_BARREL.x, HOME_BARREL.z, 0.7]);
  for (const [x, z] of HOME_PLANTS) c.push([x, z, 0.5]);
  return c;
})();
