// ============================================================================
// Village quests: templates, scaling and display helpers (pure data, no store).
// The store keeps `quests: Quest[]` (3 active, persistent) and drives progress
// from engine events. See store.ts (claimQuest / addQuestProgress).
// ============================================================================
import type { Rarity } from './types';
import type { EnemyKind } from './engine/types';
import { ENEMY_DEFS } from './engine/enemyDefs';

export type QuestType =
  | 'KILL_KIND' | 'KILL_TOTAL' | 'REACH_WAVE' | 'FAST_CLEARS' | 'BREAK_CRATES'
  | 'KILL_BOSS' | 'COLLECT_GOLD' | 'DASH' | 'GATHER_SHARDS' | 'SELL_LOOT' | 'COLLECT_LOOT';

export interface QuestReward {
  gold?: number;
  gems?: number;
  cores?: number;
  potions?: number;   // HP + mana potions each
  item?: Rarity;      // one random gear piece of this rarity
}

export interface Quest {
  id: string;
  type: QuestType;
  kind?: EnemyKind;   // KILL_KIND only
  lootName?: string;  // COLLECT_LOOT only
  target: number;
  progress: number;
  reward: QuestReward;
}

export const QUEST_COUNT = 3;
const KIND_POOL: EnemyKind[] = ['SLIME', 'GOBLIN', 'BAT', 'SKELETON_ARCHER', 'CULTIST', 'BOMBER', 'BRUTE', 'SPLITTER'];
const ALL_TYPES: QuestType[] = ['KILL_KIND', 'KILL_TOTAL', 'REACH_WAVE', 'FAST_CLEARS', 'BREAK_CRATES', 'KILL_BOSS', 'COLLECT_GOLD', 'DASH', 'GATHER_SHARDS', 'SELL_LOOT', 'COLLECT_LOOT'];
/** Reward weight per type (relative effort). */
const EFFORT: Record<QuestType, number> = {
  KILL_KIND: 1, KILL_TOTAL: 1, REACH_WAVE: 1.4, FAST_CLEARS: 1.5, BREAK_CRATES: 1, KILL_BOSS: 2, COLLECT_GOLD: 1, DASH: 0.8, GATHER_SHARDS: 1.1, SELL_LOOT: 1, COLLECT_LOOT: 1,
};

let qid = 0;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

function itemRarityFor(rank: number): Rarity {
  const r = Math.random();
  if (rank >= 15 && r < 0.25) return 'LEGENDARY';
  if (rank >= 6 && r < 0.6) return 'EPIC';
  return rank >= 2 ? 'RARE' : 'COMMON';
}

/** New quest scaled by hero rank; avoids the given types so the board stays varied. */
export function makeQuest(rank: number, avoid: QuestType[] = []): Quest {
  const r = Math.max(1, rank);
  let types = ALL_TYPES.filter((t) => !avoid.includes(t));
  if (types.length === 0) types = ALL_TYPES;
  const type = pick(types);
  let target = 10;
  let kind: EnemyKind | undefined;
  let lootName: string | undefined;
  switch (type) {
    case 'KILL_KIND': {
      const pool = KIND_POOL.filter((k) => ENEMY_DEFS[k].minWave <= 2 + r * 1.5);
      kind = pick(pool);
      target = Math.max(5, Math.round((22 + 4 * r) / Math.pow(ENEMY_DEFS[kind].cost, 0.8)));
      break;
    }
    case 'KILL_TOTAL': target = 60 + 20 * r; break;
    case 'REACH_WAVE': target = Math.min(40, 4 + 2 * r); break;
    case 'FAST_CLEARS': target = Math.min(8, 2 + Math.floor(r / 3)); break;
    case 'BREAK_CRATES': target = 8 + 3 * r; break;
    case 'KILL_BOSS': target = 1 + Math.floor(r / 12); break;
    case 'COLLECT_GOLD': target = 300 + 150 * r; break;
    case 'DASH': target = 25 + 8 * r; break;
    case 'GATHER_SHARDS': target = 8 + 2 * r; break;
    case 'SELL_LOOT': target = 8 + 3 * r; break;
    case 'COLLECT_LOOT': lootName = pick(['Goblin Ear', 'Slime Gel', 'Bat Wing', 'Old Bone', 'Beetle Shell', 'Cultist Rune', 'Ogre Tusk'].slice(0, Math.min(7, 3 + r))); target = 4 + r; break;
  }
  const e = EFFORT[type];
  const reward: QuestReward = { gold: Math.round((100 + 55 * r) * e / 10) * 10 };
  const extra = Math.random();
  if (extra < 0.3) reward.gems = Math.round((6 + 2 * r) * e);
  else if (extra < 0.55) reward.cores = 1 + Math.floor(r / 3) + (e > 1.3 ? 1 : 0);
  else if (extra < 0.8) reward.potions = 3 + Math.floor(r / 4);
  else reward.item = itemRarityFor(r);
  return { id: `q_${Date.now().toString(36)}_${(qid++).toString(36)}`, type, kind, lootName, target, progress: 0, reward };
}

export function fillQuests(rank: number, existing: Quest[]): Quest[] {
  const list = existing.slice(0, QUEST_COUNT);
  while (list.length < QUEST_COUNT) list.push(makeQuest(rank, list.map((q) => q.type)));
  return list;
}

export const questDone = (q: Quest): boolean => q.progress >= q.target;

export function questTitle(q: Quest): string {
  const n = q.target;
  switch (q.type) {
    case 'KILL_KIND': return `Slay ${n} ${ENEMY_DEFS[q.kind ?? 'SLIME'].name}${n > 1 ? 's' : ''}`;
    case 'KILL_TOTAL': return `Defeat ${n} monsters`;
    case 'REACH_WAVE': return `Survive until wave ${n}`;
    case 'FAST_CLEARS': return `Fast-clear ${n} wave${n > 1 ? 's' : ''}`;
    case 'BREAK_CRATES': return `Break ${n} crates and barrels`;
    case 'KILL_BOSS': return n > 1 ? `Defeat ${n} bosses` : 'Defeat a boss';
    case 'COLLECT_GOLD': return `Collect ${n} gold in battle`;
    case 'DASH': return `Dash ${n} times`;
    case 'GATHER_SHARDS': return `Gather ${n} crafting shards`;
    case 'SELL_LOOT': return `Sell ${n} loot items`;
    case 'COLLECT_LOOT': return `Collect ${n} ${q.lootName}${n > 1 ? 's' : ''}`;
  }
}

export function questFlavor(q: Quest): string {
  switch (q.type) {
    case 'KILL_KIND': return 'They keep ruining our crops!';
    case 'KILL_TOTAL': return 'Thin out the horde, guard.';
    case 'REACH_WAVE': return 'Hold the line as long as you can.';
    case 'FAST_CLEARS': return 'Kill them all before the timer ends.';
    case 'BREAK_CRATES': return 'The village needs the supplies inside.';
    case 'KILL_BOSS': return 'Bring down one of the big ones.';
    case 'COLLECT_GOLD': return 'Recover what the monsters looted.';
    case 'DASH': return 'Stay nimble. Footwork wins fights.';
    case 'GATHER_SHARDS': return 'Smash crystals and ore for the smith.';
    case 'SELL_LOOT': return 'Sell monster spoils at the potion shop.';
    case 'COLLECT_LOOT': return 'The captain pays a bounty for these.';
  }
}
