// Trade-goods loot drops (see loot.ts tables). Each roll spawns an ITEM pickup that stacks into the bag.
import { Vector3 } from 'three';
import { LOOT_BY_ID, LOOT_CHANCE, DEFAULT_LOOT_CHANCE, rollLoot, lootItem } from '../../loot';
import { spawnPickup } from './pickups';

const p = new Vector3();

/** Rolls `source`'s table (chance-gated unless force) and drops the result around (x, z). */
export function dropLoot(source: string, luck: number, x: number, z: number, force = false, mythic = true): boolean {
  if (!force && Math.random() >= (LOOT_CHANCE[source] ?? DEFAULT_LOOT_CHANCE)) return false;
  const id = rollLoot(source, luck, mythic);
  if (!id) return false;
  p.set(x + (Math.random() - 0.5) * 1.6, 0, z + (Math.random() - 0.5) * 1.6);
  spawnPickup('ITEM', p, 0, lootItem(LOOT_BY_ID[id]));
  return true;
}
