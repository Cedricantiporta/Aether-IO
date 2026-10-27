import { world } from '../world';
import { events } from '../events';
// ============================================================================
// Travelling merchant (depth 14 of every biome): 1-2 kinds of potion + three random gear pieces, always +2 or better, at a markup (gear: town price +50%),
// rarely an Ankh of Life or a Legendary shard at an inflated price; no sales.
// Stock is rolled when the room is entered and lives in a tiny zustand store so the shop tab can re-render.
// ============================================================================
import { create } from 'zustand';
import type { Item } from '../../types';
import { useGameStore, plusOne, makeItemById, potionKind, potionCount, potionCapMsg, POTION_CAP } from '../../store';
import { rarityForDepth } from '../roomDefs';
import { shardItem } from '../../shards';
import { buyMul } from '../../constants';

export interface MerchantEntry { item: Item; price: number; oldPrice: number; left: number; sale: boolean }

export const useMerchant = create<{ items: MerchantEntry[] }>(() => ({ items: [] }));

const MARKUP = 1.5;
const SALE = 0.25;
/** (owner 2026-10-25) chance a Legendary gear roll stays Legendary in the shop (else it becomes Epic). */
const GOLD_KEEP = 0.05;

/** Rolls a fresh stock for a merchant room at `depth`. */
/** `seed`: the room seed. The stock is rolled from it in three separately seeded parts (potions, gear, the rare extra), so a co-op partner entering the same room
 *  (same seed) sees the SAME stock: the same potions, the same number of gear pieces at the same rarity / +level / price, the same tool / Ankh / shard (gear is rolled for each player's own class).
 *  Each player buys from his own copy with his own gold. */
export function rollMerchantStock(depth: number, seed?: number): void {
  const orig = Math.random;
  const reseed = (n: number): void => {
    if (seed === undefined) return;
    let a = ((seed ^ Math.imul(n, 0x9e3779b1)) >>> 0) || 1;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  try { rollStock(depth, reseed); } finally { Math.random = orig; }
}
function rollStock(depth: number, reseed: (n: number) => void): void {
  const st = useGameStore.getState();
  reseed(1);
  const items: MerchantEntry[] = [];
  const add = (item: Item | undefined, left: number, markup = MARKUP): void => {
    if (!item) return;
    const oldPrice = Math.max(10, Math.round(item.price * markup));
    items.push({ item, price: oldPrice, oldPrice, left, sale: false });
  };
  // potions: one or two kinds (e.g. big HP + HP, HP + mana, or just big mana)
  const kinds = ['potion_hp', 'potion_hp_big', 'potion_mana', 'potion_mana_big'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const nPot = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < nPot; i++) add(makeItemById(kinds[i], 1)[0], kinds[i].endsWith('_big') ? 2 : 4);
  for (let i = 0; i < 3; i++) {
    reseed(10 + i);   // (each gear slot has its own stream: a class with a different pool size does not shift the others)
    let rar = rarityForDepth(depth, 0.05, world.run.bossKills);
    if (rar === 'MYTHIC' || (rar === 'LEGENDARY' && Math.random() >= GOLD_KEEP)) rar = 'EPIC';   // (owner) shops never sell Mythic, gold (Legendary) only very rarely
    let gear = st.rollItemDrop(rar);
    if (gear) {   // (owner) the merchant's gear is always +2 or better (+2 / +3, rarely +4); priced on the upgraded item
      const plus = Math.random() < 0.1 ? 4 : Math.random() < 0.35 ? 3 : 2;
      while (Math.max(0, gear.level - 1) < plus) gear = plusOne(gear);
      gear = { ...gear, price: Math.round(gear.price * (1 + 0.25 * plus)) };
      add({ ...gear, id: `${gear.id}-m${i}` }, 1, buyMul(gear.type) * MARKUP);
    }   // gear: the town shop price +50% (owner: it used to undercut the town)
  }
  // rarely: an Ankh of Life or a Legendary (gold) shard, at an inflated price
  reseed(99);
  const r = Math.random();
  if (r < 0.1) add(makeItemById('revive_ankh', 1)[0], 1, MARKUP * 2.5);
  else if (r < 0.12) add(shardItem('LEGENDARY', 1), 1, MARKUP * 3);   // (owner: gold very rare in shops)
  else if (r < 0.45) add(makeItemById(['reforge_stone', 'temper_oil', 'reforge_stone', 'augment_rune', 'binding_seal'][Math.floor(Math.random() * 5)], 1)[0], 1, MARKUP * 1.5);   // a reforging tool
  // (owner: no 'X% off' sale entry any more)
  useMerchant.setState({ items });
}

export function clearMerchantStock(): void { useMerchant.setState({ items: [] }); }

/** Buys one unit of stock entry `i`. */
export function buyMerchant(i: number): boolean {
  const entries = useMerchant.getState().items;
  const e = entries[i];
  const st = useGameStore.getState();
  if (!e || e.left <= 0) return false;
  if (st.gold < e.price) { st.addNotification('Not enough Gold!', 'red', 'WARNING'); return false; }
  if (e.item.type === 'SHARD') st.addMaterial(e.item.rarity, 1);   // shards live in the material counts (bag stack synced)
  else {
    const pk = potionKind(e.item);
    if (pk && potionCount(st.inventory, pk) >= POTION_CAP) { st.addNotification(potionCapMsg(pk), 'red', 'WARNING'); return false; }
    const copy: Item = { ...e.item, stats: { ...e.item.stats }, id: `${e.item.id}-b${Date.now().toString(36)}`, quantity: 1 };
    if (!st.addItemToInventory(copy)) { st.addNotification('Inventory Full!', 'red', 'WARNING'); return false; }
  }
  st.addGold(-e.price); events.emit('purchase', {}); 
  st.addNotification(`Bought ${e.item.name}`, 'white', 'SYSTEM');
  useMerchant.setState({ items: entries.map((x, k) => (k === i ? { ...x, left: x.left - 1 } : x)) });
  return true;
}
