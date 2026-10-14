import { world } from '../world';
// ============================================================================
// Travelling merchant (merchant rooms): potions + three random gear pieces at a markup, one of them on sale.
// Stock is rolled when the room is entered and lives in a tiny zustand store so the shop tab can re-render.
// ============================================================================
import { create } from 'zustand';
import type { Item } from '../../types';
import { useGameStore, makeItemById } from '../../store';
import { rarityForDepth } from '../roomDefs';

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
  add(makeItemById('potion_hp', 1)[0], 4);
  add(makeItemById('potion_mana', 1)[0], 4);
  if (depth >= 8) add(makeItemById(Math.random() < 0.5 ? 'potion_hp_big' : 'potion_mana_big', 1)[0], 2);
  for (let i = 0; i < 3; i++) {
    const gear = st.rollItemDrop(rarityForDepth(depth, 0.05, world.run.bossKills));
    if (gear) add({ ...gear, id: `${gear.id}-m${i}` }, 1, MARKUP + 0.2);
  }
  // exactly one entry on sale
  const s = items[Math.floor(Math.random() * items.length)];
  if (s) { s.sale = true; s.price = Math.max(1, Math.round(s.oldPrice * (1 - SALE))); }
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
  const copy: Item = { ...e.item, stats: { ...e.item.stats }, id: `${e.item.id}-b${Date.now().toString(36)}`, quantity: 1 };
  if (!st.addItemToInventory(copy)) { st.addNotification('Inventory Full!', 'red', 'WARNING'); return false; }
  st.addGold(-e.price);
  st.addNotification(`Bought ${e.item.name}`, 'white', 'SYSTEM');
  useMerchant.setState({ items: entries.map((x, k) => (k === i ? { ...x, left: x.left - 1 } : x)) });
  return true;
}
