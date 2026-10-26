// Gem Shop (a tab of the Summon window): consumables and shard bundles sold for gems (owner: no companions).
// Purchases go through the shared BuyDialog (quantity window) with `gems: true`.
import { useGameStore, makeItemById } from './store';
import { ITEMS_POOL } from './constants';
import { shardItem } from './shards';
import { feedReward } from './rewardFeed';
import { events } from './engine/events';
import { LOOT_BY_ID, lootItem } from './loot';
import type { Item, Rarity } from './types';

export interface GemOffer { key: string; item: Item; gems: number; max: number; give: (n: number) => Item[] | null; shards?: [Rarity, number] }

const tpl = (id: string): Item => ITEMS_POOL.find((i) => i.id === id)!;
const items = (id: string) => (n: number) => makeItemById(id, n);
/** A crafting material (loot.ts) sold for gems. */
const mat = (id: string, gems: number, max = 50): GemOffer => ({ key: `mat_${id}`, item: lootItem(LOOT_BY_ID[id]), gems, max, give: (n) => [lootItem(LOOT_BY_ID[id], n)] });
const shard = (r: Rarity, per: number, gems: number): GemOffer =>
  ({ key: `sh_${r}`, item: { ...shardItem(r, per) }, gems, max: 50, give: () => [], shards: [r, per] });

export const GEM_OFFERS: GemOffer[] = [
  { key: 'core', item: tpl('upgrade_core'), gems: 8, max: 50, give: items('upgrade_core') },
  { key: 'core2', item: tpl('upgrade_core_2'), gems: 90, max: 10, give: items('upgrade_core_2') },   // (owner) Refined Core: expensive on purpose
  { key: 'bossticket', item: tpl('boss_ticket'), gems: 300, max: 10, give: items('boss_ticket') },   // (owner 2026-10-26) a Boss Trials rematch on a boss already fought today (bossTrials.ts)
  { key: 'ankh', item: tpl('revive_ankh'), gems: 25, max: 5, give: items('revive_ankh') },
  { key: 'reforge', item: tpl('reforge_stone'), gems: 30, max: 20, give: items('reforge_stone') },
  { key: 'temper', item: tpl('temper_oil'), gems: 18, max: 20, give: items('temper_oil') },
  { key: 'seal', item: tpl('binding_seal'), gems: 28, max: 20, give: items('binding_seal') },
  { key: 'augment', item: tpl('augment_rune'), gems: 25, max: 20, give: items('augment_rune') },
  { key: 'hpbig', item: tpl('potion_hp_big'), gems: 3, max: 20, give: items('potion_hp_big') },
  { key: 'mpbig', item: tpl('potion_mana_big'), gems: 3, max: 20, give: items('potion_mana_big') },
  { key: 'hp', item: tpl('potion_hp'), gems: 1, max: 50, give: items('potion_hp') },
  { key: 'mp', item: tpl('potion_mana'), gems: 1, max: 50, give: items('potion_mana') },
  mat('ore_nugget', 2), mat('raw_gem', 5), mat('echo_crystal', 6), mat('deep_geode', 20, 20), mat('mithril_ore', 20, 20), mat('starfire_crystal', 60, 10),
  shard('RARE', 10, 6), shard('EPIC', 5, 15), shard('LEGENDARY', 1, 20), shard('MYTHIC', 1, 60),
  // (owner) no companions here any more: pets come from summons / the Pet House
];

/** Buys n of an offer. False (nothing spent) when gems or bag space are short. */
export function buyGemOffer(o: GemOffer, n: number): boolean {
  const st = useGameStore.getState(), cost = o.gems * n;
  if (st.gems < cost) { st.addNotification('Not enough gems!', 'red', 'WARNING'); return false; }
  if (o.shards) {
    useGameStore.setState({ gems: st.gems - cost }); events.emit('purchase', {}); 
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
  useGameStore.setState({ gems: useGameStore.getState().gems - cost }); events.emit('purchase', {}); 
  feedReward({ items: got.length > 1 && got[0].quantity === n ? [got[0]] : got });
  return true;
}
