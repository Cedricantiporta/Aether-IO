// (owner) Aether Crystals as a physical bag item: one stack (ItemType 'CRYSTAL', no stack limit) mirroring the store's
// `crystals` count both ways (store.ts subscription), like the shard stacks (shards.ts). They drop on the ground as
// pickups (engine/systems/pickups.ts dropCrystals). They can be stored / deleted, never sold. Pure helpers.
import type { Item } from './types';

export const CRYSTAL_ID = 'aether_crystal';
export function crystalItem(n: number): Item {
  return {
    id: CRYSTAL_ID, name: 'Aether Crystal', type: 'CRYSTAL', rarity: 'EPIC', level: 1, stats: {}, quantity: n, price: 0,
    description: 'A shard of condensed aether. Offer them at the Crystal Altar (Summon) for gear, pets and shards. Mined in the deep, won on adventures and dropped by bosses. Cannot be sold.',
  } as Item;
}
/** Crystals held in a bag. */
export function crystalCount(inv: Item[]): number {
  let n = 0;
  for (const it of inv) if (it.type === 'CRYSTAL') n += it.quantity || 1;
  return n;
}
/** The bag with exactly one crystal stack holding `n` (none when 0). Same array when already consistent. */
export function syncCrystalStack(inv: Item[], n: number): Item[] {
  let stacks = 0, ok = true;
  for (const it of inv) if (it.type === 'CRYSTAL') { stacks++; if ((it.quantity || 1) !== n) ok = false; }
  if (ok && stacks === (n > 0 ? 1 : 0)) return inv;
  const out: Item[] = []; let placed = false;
  for (const it of inv) {
    if (it.type !== 'CRYSTAL') { out.push(it); continue; }
    if (placed || n <= 0) continue;
    placed = true; out.push({ ...it, id: CRYSTAL_ID, quantity: n });
  }
  if (!placed && n > 0) out.push(crystalItem(n));
  return out;
}
