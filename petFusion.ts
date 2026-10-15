// Pet fusion (Pet House > Fuse): five pets of one tier make a roll for one pet of the next tier. The higher the tier,
// the lower the chance; a failed fusion still gives back one pet of the same tier. Store action: fusePets (store.ts).
import { PETS_POOL } from './constants';
import type { Item, Rarity } from './types';

export const FUSE_COUNT = 5;
const ORDER: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/** Success chance by the tier being fused (Mythic pets cannot be fused further). */
export const FUSE_CHANCE: Partial<Record<Rarity, number>> = { COMMON: 0.6, RARE: 0.4, EPIC: 0.2, LEGENDARY: 0.08 };   // (hidden from the player - owner)

export const nextTier = (r: Rarity): Rarity | null => { const i = ORDER.indexOf(r); return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null; };

/** A random pet template of this tier (summon-only pets included: fusion is a way to get them). */
export function randomPetOf(r: Rarity): Item | null {
  const pool = PETS_POOL.filter((p) => p.rarity === r);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
