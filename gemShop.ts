// Gem Shop (a tab of the Summon window): consumables, shard bundles and a few Rare / Epic companions sold for gems.
// Purchases go through the shared BuyDialog (quantity window) with `gems: true`.
import { useGameStore, makeItemById } from './store';
import { ITEMS_POOL, PETS_POOL } from './constants';
import { shardItem } from './shards';
import { feedReward } from './rewardFeed';
import type { Item, Rarity } from './types';

export interface GemOffer { key: string; item: Item; gems: number; max: number; give: (n: number) => Item[] | null; shards?: [Rarity, number] }

const tpl = (id: string): Item => ITEMS_POOL.find((i) => i.id === id)!;
const pet = (id: string): Item | undefined => PETS_POOL.find((i) => i.id === id);
const items = (id: string) => (n: number) => makeItemById(id, n);
const shard = (r: Rarity, per: number, gems: number): GemOffer =>
  ({ key: `sh_${r}`, item: { ...shardItem(r, per) }, gems, max: 50, give: () => [], shards: [r, per] });

export const GEM_OFFERS: GemOffer[] = [
  { key: 'core', item: tpl('upgrade_core'), gems: 8, max: 50, give: items('upgrade_core') },
  { key: 'ankh', item: tpl('revive_ankh'), gems: 25, max: 5, give: items('revive_ankh') },
  { key: 'hpbig', item: tpl('potion_hp_big'), gems: 3, max: 20, give: items('potion_hp_big') },
  { key: 'mpbig', item: tpl('potion_mana_big'), gems: 3, max: 20, give: items('potion_mana_big') },
  shard('RARE', 10, 6), shard('EPIC', 5, 15), shard('LEGENDARY', 1, 20), shard('MYTHIC', 1, 60),
  // companions: some Rare (300 gems) and some Epic (500 gems) pets; Legendary / Mythic ones stay summon-only
  ...(['pet_fox', 'pet_owl', 'pet_sprite', 'pet_turtle'].map((id) => pet(id)).filter(Boolean) as Item[]).map((p): GemOffer => ({
    key: p.id, item: p, gems: p.rarity === 'EPIC' ? 500 : 300, max: 1,
    give: (n) => Array.from({ length: n }, () => ({ ...p, stats: { ...p.stats }, id: `gem-${p.id}-${Date.now().toString(36)}`, quantity: 1 })),
  })),
];

/** Buys n of an offer. False (nothing spent) when gems or bag space are short. */
export function buyGemOffer(o: GemOffer, n: number): boolean {
  const st = useGameStore.getState(), cost = o.gems * n;
  if (st.gems < cost) { st.addNotification('Not enough gems!', 'red', 'WARNING'); return false; }
  if (o.shards) {
    useGameStore.setState({ gems: st.gems - cost });
    st.addMaterial(o.shards[0], o.shards[1] * n);
    feedReward({ shards: o.shards[1] * n, shardRarity: o.shards[0] });
    return true;
  }
  const got = o.give(n) ?? [];
  const before = st.inventory;
  for (const it of got) if (!useGameStore.getState().addItemToInventory(it)) {
    useGameStore.setState({ inventory: before });
    st.addNotification('Inventory Full!', 'red', 'WARNING');
    return false;
  }
  useGameStore.setState({ gems: useGameStore.getState().gems - cost });
  feedReward({ items: got.length > 1 && got[0].quantity === n ? [got[0]] : got });
  return true;
}
