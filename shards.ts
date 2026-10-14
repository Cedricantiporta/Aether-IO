// Crafting shards as physical bag items: one stack per rarity (ItemType 'SHARD', stacks without limit). The store keeps
// `materials` (counts used by crafting / summon / pet growth) and the bag stacks in sync both ways (store.ts subscription):
// gaining or spending shards updates the stacks, and selling / deleting / storing a stack updates the counts.
// Pure helpers (no store import).
import type { Item, Rarity } from './types';
import { GOLD_SCALE } from './constants';

export const SHARD_RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const NAME: Record<Rarity, string> = { COMMON: 'Common Shard', RARE: 'Rare Shard', EPIC: 'Epic Shard', LEGENDARY: 'Legendary Shard', MYTHIC: 'Mythic Shard' };
const PRICE: Record<Rarity, number> = { COMMON: 1, RARE: 4, EPIC: 15, LEGENDARY: 60, MYTHIC: 240 };

export const shardId = (r: Rarity): string => `shard_${r.toLowerCase()}`;
export function shardItem(r: Rarity, n: number): Item {
  return {
    id: shardId(r), name: NAME[r], type: 'SHARD', rarity: r, level: 1, stats: {}, quantity: n,
    price: PRICE[r] * GOLD_SCALE, description: 'Crafting material. Used at the Blacksmith (crafting, upgrades) and to feed and evolve pets; Common Shards also pay for the Shard summon.',
  } as Item;
}

/** Shard totals per rarity found in a bag. */
export function shardCounts(inv: Item[]): Record<Rarity, number> {
  const c: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };
  for (const it of inv) if (it.type === 'SHARD') c[it.rarity] += it.quantity || 1;
  return c;
}

/** The bag with exactly one shard stack per rarity holding `mats[r]` (0 = no stack). Returns the same array when already
 *  consistent. Existing stacks keep their slot; new ones are appended (shard stacks may exceed the slot limit). */
export function syncShardStacks(inv: Item[], mats: Record<Rarity, number>): Item[] {
  const seen = new Set<Rarity>();
  let ok = true;
  for (const it of inv) if (it.type === 'SHARD') { if (seen.has(it.rarity) || (it.quantity || 1) !== mats[it.rarity]) ok = false; seen.add(it.rarity); }
  for (const r of SHARD_RARITIES) if ((mats[r] > 0) !== seen.has(r)) ok = false;
  if (ok) return inv;
  const out: Item[] = [], placed = new Set<Rarity>();
  for (const it of inv) {
    if (it.type !== 'SHARD') { out.push(it); continue; }
    if (placed.has(it.rarity) || mats[it.rarity] <= 0) continue;
    placed.add(it.rarity);
    out.push({ ...it, id: shardId(it.rarity), quantity: mats[it.rarity] });
  }
  for (const r of SHARD_RARITIES) if (mats[r] > 0 && !placed.has(r)) out.push(shardItem(r, mats[r]));
  return out;
}
