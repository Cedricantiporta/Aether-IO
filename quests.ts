// ============================================================================
// Village quests: templates, scaling and display helpers (pure data, no store).
// The store keeps `quests: Quest[]` (board offers + up to 3 accepted, persistent) and
// drives progress of ACCEPTED quests from engine events. Unaccepted offers refresh daily.
// See store.ts (acceptQuest / abandonQuest / claimQuest / addQuestProgress).
// ============================================================================
import type { Rarity } from './types';
import type { EnemyKind } from './engine/types';
import { ENEMY_DEFS } from './engine/enemyDefs';

export type QuestType =
  | 'KILL_KIND' | 'KILL_TOTAL' | 'REACH_WAVE' | 'FAST_CLEARS' | 'BREAK_CRATES'
  | 'KILL_BOSS' | 'COLLECT_GOLD' | 'DASH' | 'GATHER_SHARDS' | 'SELL_LOOT' | 'COLLECT_LOOT'
  /** royal quests (the King lives in the castle): AUDIENCE = talk to him; KING_BOUNTY = kill count / boss, then report to him */
  | 'AUDIENCE' | 'KING_BOUNTY';

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
  /** KING_BOUNTY: which run stat counts ('KILL_TOTAL' or 'KILL_BOSS') */
  bounty?: 'KILL_TOTAL' | 'KILL_BOSS';
  /** royal quest: must be settled by talking to the King (old saves have neither field) */
  needsKing?: boolean;
  reported?: boolean; // the King has been told
  accepted?: boolean; // only accepted quests make progress
  day?: string;       // board day it was offered on (unaccepted offers expire when the day changes)
}

/** Offers shown on the board (besides the accepted ones) and the active-quest cap. */
export const QUEST_OFFERS = 6;
export const QUEST_MAX_ACTIVE = 3;
export const questDay = (): string => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const KIND_POOL: EnemyKind[] = ['SLIME', 'GOBLIN', 'BAT', 'SKELETON_ARCHER', 'CULTIST', 'BOMBER', 'BRUTE', 'SPLITTER'];
const ALL_TYPES: QuestType[] = ['KILL_KIND', 'KILL_TOTAL', 'REACH_WAVE', 'FAST_CLEARS', 'BREAK_CRATES', 'KILL_BOSS', 'COLLECT_GOLD', 'DASH', 'GATHER_SHARDS', 'SELL_LOOT', 'COLLECT_LOOT', 'AUDIENCE', 'KING_BOUNTY'];
/** Reward weight per type (relative effort). */
const EFFORT: Record<QuestType, number> = {
  KILL_KIND: 1, KILL_TOTAL: 1, REACH_WAVE: 1.4, FAST_CLEARS: 1.5, BREAK_CRATES: 1, KILL_BOSS: 2, COLLECT_GOLD: 1, DASH: 0.8, GATHER_SHARDS: 1.1, SELL_LOOT: 1, COLLECT_LOOT: 1, AUDIENCE: 1, KING_BOUNTY: 2.2,
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
  let bounty: Quest['bounty'];
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
    case 'COLLECT_GOLD': target = (300 + 150 * r) * 10; break;
    case 'DASH': target = 25 + 8 * r; break;
    case 'GATHER_SHARDS': target = 8 + 2 * r; break;
    case 'SELL_LOOT': target = 8 + 3 * r; break;
    case 'AUDIENCE': target = 1; break;
    case 'KING_BOUNTY': bounty = Math.random() < 0.4 ? 'KILL_BOSS' : 'KILL_TOTAL'; target = bounty === 'KILL_BOSS' ? 1 + Math.floor(r / 14) : 50 + 15 * r; break;
    case 'COLLECT_LOOT': lootName = pick(['Goblin Ear', 'Slime Gel', 'Bat Wing', 'Old Bone', 'Beetle Shell', 'Cultist Rune', 'Ogre Tusk'].slice(0, Math.min(7, 3 + r))); target = 4 + r; break;
  }
  const e = EFFORT[type];
  const reward: QuestReward = { gold: Math.round((100 + 55 * r) * e / 20) * 100 };   // x10 economy (owner: -50%)
  const extra = Math.random();
  if (extra < 0.3) reward.gems = Math.round((6 + 2 * r) * e);
  else if (extra < 0.55) reward.cores = 1 + Math.floor(r / 3) + (e > 1.3 ? 1 : 0);
  else if (extra < 0.8) reward.potions = 1 + Math.floor(r / 6);   // (owner: fewer potion rewards)
  else reward.item = itemRarityFor(r);
  // royal commissions pay in gems (and gear for the bounties)
  if (type === 'AUDIENCE') { reward.gems = 10 + 3 * r; delete reward.cores; delete reward.potions; delete reward.item; }
  if (type === 'KING_BOUNTY') { reward.gems = Math.round((12 + 4 * r) * (bounty === 'KILL_BOSS' ? 1.5 : 1)); if (!reward.item && Math.random() < 0.6) reward.item = itemRarityFor(r + 4); }
  const royal = type === 'AUDIENCE' || type === 'KING_BOUNTY';
  return { bounty, needsKing: royal || undefined, id: `q_${Date.now().toString(36)}_${(qid++).toString(36)}`, type, kind, lootName, target, progress: 0, reward, accepted: false, day: questDay() };
}

/** Board upkeep: keeps accepted quests (old saves: the 3 legacy quests count as accepted), drops offers from an
 *  earlier day, and tops the offers up to QUEST_OFFERS. Returns `existing` itself when nothing changed. */
export function fillQuests(rank: number, existing: Quest[]): Quest[] {
  const today = questDay();
  let changed = false;
  const list: Quest[] = [];
  for (const q of existing) {
    if (q.accepted === undefined && q.day === undefined) { list.push({ ...q, accepted: true, day: today }); changed = true; continue; }
    if (!q.accepted && q.day !== today) { changed = true; continue; }
    list.push(q);
  }
  let active = 0;
  for (const q of list) if (q.accepted) active++;
  if (active > QUEST_MAX_ACTIVE) changed = true;
  const kept = active > QUEST_MAX_ACTIVE ? list.filter((q, i) => !q.accepted || list.slice(0, i + 1).filter((x) => x.accepted).length <= QUEST_MAX_ACTIVE) : list;
  while (kept.length - Math.min(active, QUEST_MAX_ACTIVE) < QUEST_OFFERS) { kept.push(makeQuest(rank, kept.map((q) => q.type))); changed = true; }
  return changed ? kept : existing;
}

export const activeQuests = (qs: Quest[]): Quest[] => qs.filter((q) => q.accepted);
export const questOffers = (qs: Quest[]): Quest[] => qs.filter((q) => !q.accepted);
/** Accepted and finished (ready to claim). */
export const questDone = (q: Quest): boolean => !!q.accepted && q.progress >= q.target && (!q.needsKing || !!q.reported);
/** Accepted royal quest still waiting for the King: AUDIENCE (go and talk to him) or KING_BOUNTY whose count is done (report). */
export const questNeedsKing = (q: Quest): boolean => !!q.accepted && !!q.needsKing && !q.reported && (q.type === 'AUDIENCE' || q.progress >= q.target);
/** The run stat a quest listens to (KING_BOUNTY counts like its base type). */
export const questCounts = (q: Quest): QuestType => (q.type === 'KING_BOUNTY' && q.bounty ? q.bounty : q.type);

export function questTitle(q: Quest): string {
  const n = q.target;
  switch (q.type) {
    case 'KILL_KIND': return `Slay ${n} ${ENEMY_DEFS[q.kind ?? 'SLIME'].name}${n > 1 ? 's' : ''}`;
    case 'KILL_TOTAL': return `Defeat ${n} monsters`;
    case 'REACH_WAVE': return `Reach depth ${n}`;
    case 'FAST_CLEARS': return `Clear ${n} room${n > 1 ? 's' : ''} in under 40 s`;
    case 'BREAK_CRATES': return `Break ${n} crates and barrels`;
    case 'KILL_BOSS': return n > 1 ? `Defeat ${n} bosses` : 'Defeat a boss';
    case 'COLLECT_GOLD': return `Collect ${n} gold in battle`;
    case 'DASH': return `Dash ${n} times`;
    case 'GATHER_SHARDS': return `Gather ${n} crafting shards`;
    case 'SELL_LOOT': return `Sell ${n} loot items`;
    case 'COLLECT_LOOT': return `Collect ${n} ${q.lootName}${n > 1 ? 's' : ''}`;
    case 'AUDIENCE': return 'Seek an audience with the King';
    case 'KING_BOUNTY': return q.bounty === 'KILL_BOSS' ? (n > 1 ? `Defeat ${n} bosses and report to the King` : 'Defeat a boss and report to the King') : `Slay ${n} monsters and report to the King`;
  }
}

export function questFlavor(q: Quest): string {
  switch (q.type) {
    case 'KILL_KIND': return 'They keep ruining our crops!';
    case 'KILL_TOTAL': return 'Thin out the horde, guard.';
    case 'REACH_WAVE': return 'Delve deeper: each room is one step (a boss room is a multiple of ten).';
    case 'FAST_CLEARS': return 'Swift hands: wipe out a whole room in under forty seconds.';
    case 'BREAK_CRATES': return 'The village needs the supplies inside.';
    case 'KILL_BOSS': return 'Bring down one of the big ones.';
    case 'COLLECT_GOLD': return 'Recover what the monsters looted.';
    case 'DASH': return 'Stay nimble. Footwork wins fights.';
    case 'GATHER_SHARDS': return 'Smash crystals and ore for the smith.';
    case 'SELL_LOOT': return 'Sell monster spoils at the potion shop.';
    case 'COLLECT_LOOT': return 'The captain pays a bounty for these.';
    case 'AUDIENCE': return 'The King asks to meet heroes. Enter the castle keep in the north of town and speak to him on his throne.';
    case 'KING_BOUNTY': return 'A royal commission: finish the deed, then return to the castle and report to the King in person.';
  }
}
