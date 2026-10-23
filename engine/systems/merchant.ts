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

/** Rolls a fresh stock for a merchant room at `depth`. */
export function rollMerchantStock(depth: number): void {
  const st = useGameStore.getState();
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
    let gear = st.rollItemDrop(rarityForDepth(depth, 0.05, world.run.bossKills));
    if (gear) {   // (owner) the merchant's gear is always +2 or better (+2 / +3, rarely +4); priced on the upgraded item
      const plus = Math.random() < 0.1 ? 4 : Math.random() < 0.35 ? 3 : 2;
      while (Math.max(0, gear.level - 1) < plus) gear = plusOne(gear);
      gear = { ...gear, price: Math.round(gear.price * (1 + 0.25 * plus)) };
      add({ ...gear, id: `${gear.id}-m${i}` }, 1, buyMul(gear.type) * MARKUP);
    }   // gear: the town shop price +50% (owner: it used to undercut the town)
  }
  // rarely: an Ankh of Life or a Legendary (gold) shard, at an inflated price
  const r = Math.random();
  if (r < 0.1) add(makeItemById('revive_ankh', 1)[0], 1, MARKUP * 2.5);
  else if (r < 0.22) add(shardItem('LEGENDARY', 1), 1, MARKUP * 3);
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
