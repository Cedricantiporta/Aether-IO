// What each altar can give (shared by store.summon and the Summon window preview).
//  Gem Altar  : every class-appropriate gear piece and every companion.
//  Shard Altar: the same up to Epic, but only a few Legendary / Mythic armour pieces (no weapons, no companions).
import { ITEMS_POOL, PETS_POOL } from './constants';
import type { HeroClass, Item, Rarity } from './types';

const isGearItem = (i: Item): boolean => i.type === 'WEAPON' || i.type === 'ARMOR' || i.type === 'HELMET' || i.type === 'GLOVES' || i.type === 'BOOTS' || i.type === 'ACCESSORY';

export function summonPool(altar: 'GEM' | 'SHARD', hero: HeroClass): Item[] {
  const gear = ITEMS_POOL.filter((i) => isGearItem(i) && (!i.classType || i.classType === hero));
  if (altar === 'GEM') return [...PETS_POOL, ...gear];
  const high = (r: Rarity) => r === 'LEGENDARY' || r === 'MYTHIC';
  const base = [...PETS_POOL.filter((p) => !high(p.rarity)), ...gear.filter((i) => !high(i.rarity))];
  // a few top-tier armour pieces: every other one (stable order by id), never weapons
  const top: Item[] = [];
  for (const r of ['LEGENDARY', 'MYTHIC'] as const) {
    const list = gear.filter((i) => i.rarity === r && i.type !== 'WEAPON').sort((a, b) => a.id.localeCompare(b.id));
    list.forEach((it, k) => { if (k % 2 === 0) top.push(it); });
  }
  return [...base, ...top];
}
