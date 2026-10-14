// ============================================================================
// Permanent achievements + titles. Pure data: each achievement reads a number from the tracker context and unlocks
// when value >= target. Unlocking toasts, the reward (gems) is claimed in the Goals panel, `title` unlocks a title.
// ============================================================================
import type { MetaState } from './goals';

export interface AchCtx { meta: MetaState; rank: number; mythic: boolean; warehouse: number }
export interface Achievement {
  id: string; name: string; desc: string; target: number; gems: number; title?: string;
  value: (c: AchCtx) => number;
}

export const WAREHOUSE_HALF = 50;
const boss = (b: number) => (c: AchCtx) => (c.meta.bossBiomes.includes(b) ? 1 : 0);
const stat = (k: keyof MetaState['stats']) => (c: AchCtx) => c.meta.stats[k];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'boss_first', name: 'First Blood', desc: 'Defeat your first boss', target: 1, gems: 30, title: 'Boss Hunter', value: (c) => Math.max(c.meta.stats.bosses, c.meta.bossBiomes.length) },
  { id: 'boss_golem', name: 'Mountain Breaker', desc: 'Defeat Gorath the Mountain in the Meadow', target: 1, gems: 40, title: 'Mountain Breaker', value: boss(0) },
  { id: 'boss_treant', name: 'Treant Feller', desc: 'Defeat Elderroot the Ancient in the Old Grove', target: 1, gems: 40, title: 'Treant Feller', value: boss(1) },
  { id: 'boss_hydra', name: 'Hydra Hunter', desc: 'Defeat the Mire Hydra', target: 1, gems: 50, title: 'Hydra Hunter', value: boss(2) },
  { id: 'boss_wyrm', name: 'Wyrm Slayer', desc: 'Defeat Glacius the Frost Wyrm on Frostpeak', target: 1, gems: 50, title: 'Wyrm Slayer', value: boss(3) },
  { id: 'boss_warlord', name: 'Warlord\'s Bane', desc: 'Defeat Ignar the Infernal Warlord in the Ember Wastes', target: 1, gems: 60, title: 'Warlord\'s Bane', value: boss(4) },
  { id: 'boss_void', name: 'Void Walker', desc: 'Defeat the Void Herald and cross the Void', target: 1, gems: 80, title: 'Void Walker', value: boss(5) },
  { id: 'boss_all', name: 'Realm Conqueror', desc: 'Defeat the boss of every biome', target: 6, gems: 150, title: 'Conqueror', value: (c) => c.meta.bossBiomes.length },
  { id: 'rank10', name: 'Seasoned Guard', desc: 'Reach hero rank 10', target: 10, gems: 50, title: 'Veteran', value: (c) => c.rank },
  { id: 'rank20', name: 'Elite Guard', desc: 'Reach hero rank 20', target: 20, gems: 120, title: 'Champion', value: (c) => c.rank },
  { id: 'kills1k', name: 'Slime Slayer', desc: 'Defeat 1,000 enemies', target: 1000, gems: 40, title: 'Slime Slayer', value: stat('kills') },
  { id: 'kills10k', name: 'Monster Bane', desc: 'Defeat 10,000 enemies', target: 10000, gems: 150, title: 'Monster Bane', value: stat('kills') },
  { id: 'elites100', name: 'Champion Hunter', desc: 'Defeat 100 elite enemies', target: 100, gems: 60, value: stat('elites') },
  { id: 'rooms200', name: 'Delver', desc: 'Clear 200 rooms', target: 200, gems: 60, value: stat('rooms') },
  { id: 'summon100', name: 'Altar Devotee', desc: 'Summon 100 times', target: 100, gems: 80, title: 'Summoner', value: stat('summons') },
  { id: 'mythic', name: 'Mythic Bearer', desc: 'Own a Mythic item', target: 1, gems: 100, title: 'Legend', value: (c) => (c.mythic ? 1 : 0) },
  { id: 'flawless', name: 'Untouchable', desc: 'Clear a room without taking damage', target: 1, gems: 30, value: stat('flawless') },
  { id: 'flawless25', name: 'Ghost Step', desc: 'Clear 25 rooms without taking damage', target: 25, gems: 100, title: 'Ghost Step', value: stat('flawless') },
  { id: 'harvest100', name: 'Prospector', desc: 'Harvest 100 crystals or ore veins', target: 100, gems: 60, title: 'Prospector', value: stat('harvest') },
  { id: 'warehouse', name: 'Hoarder', desc: `Fill half of the warehouse (${WAREHOUSE_HALF} items)`, target: WAREHOUSE_HALF, gems: 40, value: (c) => c.warehouse },
  { id: 'quests25', name: 'Dutiful Guard', desc: 'Complete 25 quests', target: 25, gems: 60, value: stat('quests') },
  { id: 'upgrades25', name: 'Master Smith', desc: 'Upgrade items at the Blacksmith 25 times', target: 25, gems: 60, value: stat('upgrades') },
  { id: 'spent', name: 'Big Spender', desc: 'Spend 1,000,000 gold', target: 1000000, gems: 80, value: stat('spent') },
];
export const ACH_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
/** Title text of an equipped achievement id (null when none / unknown). */
export const titleOf = (id: string | null | undefined): string | null => (id && ACH_BY_ID[id]?.title) || null;
