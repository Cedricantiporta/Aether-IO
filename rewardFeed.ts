// Claimed rewards (main / NPC / board quests, goals, achievements, codex) show in the bottom-left loot feed, one line per
// currency or item, exactly like picking loot up in a run. Pure helper over the store's ITEM notifications.
import { useGameStore } from './store';
import type { Item, Rarity } from './types';

const RAR: Record<Rarity, string> = { COMMON: '#e5e7eb', RARE: '#60a5fa', EPIC: '#c084fc', LEGENDARY: '#fbbf24', MYTHIC: '#f87171' };

export interface FeedReward { gold?: number; gems?: number; items?: Item[]; shards?: number; shardRarity?: Rarity }

/** gold / gems are the final amounts paid (already scaled). */
export function feedReward(r: FeedReward): void {
  const add = useGameStore.getState().addNotification;
  if (r.gold) add(`+${Math.round(r.gold).toLocaleString()} Gold`, '#fbd34d', 'ITEM');
  if (r.gems) add(`+${r.gems.toLocaleString()} Gems`, '#5ee0f5', 'ITEM');
  if (r.shards) { const rr = r.shardRarity ?? 'COMMON'; add(`+${r.shards} ${rr.charAt(0) + rr.slice(1).toLowerCase()} Shard${r.shards > 1 ? 's' : ''}`, RAR[rr], 'ITEM'); }
  for (const it of r.items ?? []) add(`${it.name}${it.quantity && it.quantity > 1 ? ` x${it.quantity}` : ''}`, RAR[it.rarity] ?? '#ffffff', 'ITEM');
}
