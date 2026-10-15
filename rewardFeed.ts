// Claimed rewards (main / NPC / board quests, goals, achievements, codex) show in the bottom-left loot feed, one line per
// currency or item, exactly like picking loot up in a run. Pure helper over the store's ITEM notifications.
import { create } from 'zustand';
import { useGameStore } from './store';
import type { Item, Rarity } from './types';

const RAR: Record<Rarity, string> = { COMMON: '#e5e7eb', RARE: '#60a5fa', EPIC: '#c084fc', LEGENDARY: '#fbbf24', MYTHIC: '#f87171' };

export interface FeedReward { gold?: number; gems?: number; crystals?: number; items?: Item[]; shards?: number; shardRarity?: Rarity }

/** "Received ..." lines shown under the quest tracker for a few seconds after a quest pays out (ui/hud/QuestTracker). */
export interface QuestToastLine { id: number; text: string; color: string; t: number }
export const useQuestToast = create<{ lines: QuestToastLine[] }>(() => ({ lines: [] }));
let toastSeq = 0;
function questToast(r: FeedReward): void {
  const now = Date.now(), lines: QuestToastLine[] = [];
  for (const it of r.items ?? []) lines.push({ id: ++toastSeq, text: `Received ${it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ''}${it.name}`, color: RAR[it.rarity] ?? '#ffffff', t: now });
  if (r.gold) lines.push({ id: ++toastSeq, text: `Received ${Math.round(r.gold).toLocaleString()} Gold`, color: '#fbd34d', t: now });
  if (r.gems) lines.push({ id: ++toastSeq, text: `Received ${r.gems.toLocaleString()} Gems`, color: '#5ee0f5', t: now });
  if (r.shards) { const rr = r.shardRarity ?? 'COMMON'; lines.push({ id: ++toastSeq, text: `Received ${r.shards} ${rr.charAt(0) + rr.slice(1).toLowerCase()} Shard${r.shards > 1 ? 's' : ''}`, color: RAR[rr], t: now }); }
  if (!lines.length) return;
  useQuestToast.setState((s) => ({ lines: [...s.lines, ...lines].slice(-6) }));
  window.setTimeout(() => useQuestToast.setState((s) => ({ lines: s.lines.filter((l) => !lines.includes(l)) })), 5000);
}

/** gold / gems are the final amounts paid (already scaled). `quest`: also list it under the quest tracker. */
export function feedReward(r: FeedReward, quest = false): void {
  if (quest) questToast(r);
  const add = useGameStore.getState().addNotification;
  if (r.gold) add(`+${Math.round(r.gold).toLocaleString()} Gold`, '#fbd34d', 'ITEM');
  if (r.gems) add(`+${r.gems.toLocaleString()} Gems`, '#5ee0f5', 'ITEM');
  if (r.crystals) add(`+${r.crystals} Aether Crystal${r.crystals > 1 ? 's' : ''}`, '#b98cff', 'ITEM');
  if (r.shards) { const rr = r.shardRarity ?? 'COMMON'; add(`+${r.shards} ${rr.charAt(0) + rr.slice(1).toLowerCase()} Shard${r.shards > 1 ? 's' : ''}`, RAR[rr], 'ITEM'); }
  for (const it of r.items ?? []) add(`${it.name}${it.quantity && it.quantity > 1 ? ` x${it.quantity}` : ''}`, RAR[it.rarity] ?? '#ffffff', 'ITEM');
}
