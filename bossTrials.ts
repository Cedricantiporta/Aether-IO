// ============================================================================
// Boss Trials (owner 2026-10-26): the purple portal on the south-west headland of the outskirts (townData BOSS_PORTAL) opens after the first game clear.
// Each of the seven biome bosses can be fought alone, at Void strength, for one guaranteed top-tier piece of gear (a slot per boss).
// Once per boss per day, counted only after a WIN (loot received; a death / abandon does not use the try; local calendar day, dailyChallenge.dayKey, saved per character in progress.trialDay); a "Boss Trial Ticket" (300 gems) buys a rematch.
// Pure data + run state (no React, no store import). The store (startBossTrial / rollBossTrialLoot), the director (arena + win) and enemies.ts (strength) read it.
// ============================================================================
import type { HeroClass, Item, ItemGrade, Rarity } from './types';
import { ITEMS_POOL, PETS_POOL } from './constants';
import { canUseClass, PICKAXE_ID } from './itemClass';

/** The run in progress is a Boss Trial (set at run start by store.startBossTrial, cleared when the hero is back in town). */
export const trial = { on: false, boss: 0, /** loot panel dismissed ("Stay a while"): the HUD shows a small Return button */ stay: false, /** seconds until the summary after the kill (-1 = not won) */ endT: -1, won: false, lootName: '' };
export function armTrial(boss: number): void { trial.on = true; trial.boss = boss; trial.endT = -1; trial.won = false; trial.lootName = ''; trial.stay = false; }
export function disarmTrial(): void { trial.on = false; trial.endT = -1; trial.won = false; trial.stay = false; }

/** Strength: the boss arena of biome `boss`, but monsters scale like the Void's boss room (depthWave(6, BOSS_INDEX) = wave 70, biome 6 multipliers + level curve). */
export const TRIAL_SCALE_BIOME = 6;
/** "A bit harder": bigger attacks, harder to dodge (enemies.ts / bossSpecials). */
export const TRIAL_DMG = 1.25;     // boss damage (contact + projectile + telegraph strikes)
export const TRIAL_TELE = 1.25;    // telegraph circle radius / line width / cone range (on top of the usual boss 1.3x)
export const TRIAL_CD = 1 / 0.85;  // boss attack cooldowns tick this much faster = 15% shorter gaps

/** Gem price of a Boss Trial Ticket (gemShop.ts) and its item name (the bag stack is found by name + type LOOT). */
export const TICKET_GEMS = 300;
export const TICKET_NAME = 'Boss Trial Ticket';

export interface TrialBoss { biome: number; slot: 'boots' | 'gloves' | 'armor' | 'helmet' | 'accessory' | 'weapon' | 'pet'; slotLabel: string }
/** One row per biome (index = biome): the slot its boss drops. Names come from roomDefs.bossNameIn(biomeOf(b).boss, b). */
export const TRIAL_BOSSES: readonly TrialBoss[] = [
  { biome: 0, slot: 'boots', slotLabel: 'Boots' },
  { biome: 1, slot: 'gloves', slotLabel: 'Gloves' },
  { biome: 2, slot: 'armor', slotLabel: 'Body Armour' },
  { biome: 3, slot: 'helmet', slotLabel: 'Helmet' },
  { biome: 4, slot: 'accessory', slotLabel: 'Accessory' },
  { biome: 5, slot: 'weapon', slotLabel: 'Weapon' },
  { biome: 6, slot: 'pet', slotLabel: 'Pet' },
];

/** Every item of `slot` at `rarity` this hero class can get from the trial (class-restricted weapons / wear only for the class; pets from the pet pool). Used by the roll and the popup's drop list. */
const SLOT_TYPE = { boots: 'BOOTS', gloves: 'GLOVES', armor: 'ARMOR', helmet: 'HELMET', accessory: 'ACCESSORY', weapon: 'WEAPON', pet: 'PET' } as const;
export function trialPool(slot: TrialBoss['slot'], r: Rarity, hero: HeroClass): Item[] {
  if (slot === 'pet') return PETS_POOL.filter((i) => i.rarity === r);
  return ITEMS_POOL.filter((i) => i.type === SLOT_TYPE[slot] && !i.retired && i.id !== PICKAXE_ID && i.rarity === r && canUseClass(i, hero));
}

/** Chance of a 2nd item (same slot, rolled like the first) on every win (the first one is guaranteed). */
export const TRIAL_BONUS_ITEM = 0.5;
/** Loot odds (owner 2026-10-31): never below Legendary. Mythic is very rare, and each rarity rolls its own grade (gear only; pets have none): High Mythic is the rarest result. */
export const TRIAL_MYTHIC = 0.12;
/** [low, mid, high] shares inside each rarity. */
export const TRIAL_GRADES: Record<'LEGENDARY' | 'MYTHIC', readonly [number, number, number]> = { LEGENDARY: [0.5, 0.38, 0.12], MYTHIC: [0.7, 0.25, 0.05] };
export const rollTrialRarity = (rng: () => number = Math.random): Rarity => (rng() < TRIAL_MYTHIC ? 'MYTHIC' : 'LEGENDARY');
export function rollTrialGrade(r: Rarity, rng: () => number = Math.random): ItemGrade {
  const g = TRIAL_GRADES[r === 'MYTHIC' ? 'MYTHIC' : 'LEGENDARY'], x = rng();
  return x < g[0] ? 'LOW' : x < g[0] + g[1] ? 'MID' : 'HIGH';
}
/** Bonus (special) lines roll the yellow Perfect quality this many times as often as normal drops (affixes.PERFECT_CHANCE 5% -> 25%). */
export const TRIAL_PERFECT_LUCK = 5;
/** Upgrade level of the drop: chance of at least +1..+5 (each step rarer): +1 70%, +2 45%, +3 25%, +4 12%, +5 5%. */
export const TRIAL_PLUS_ODDS = [0.7, 0.45, 0.25, 0.12, 0.05] as const;
export function rollTrialPlus(rng: () => number = Math.random): number {
  const r = rng(); let n = 0;
  for (let k = 0; k < TRIAL_PLUS_ODDS.length; k++) if (r < TRIAL_PLUS_ODDS[k]) n = k + 1;
  return n;
}

// ---- day tracking (local calendar day, like the Daily Trial): progress.trialDay[bossIndex] = the day key it was last fought
const pad = (n: number): string => String(n).padStart(2, '0');
export const trialDayKey = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fought = (trialDay: Record<string, string> | undefined, boss: number, today: string = trialDayKey()): boolean => !!trialDay && trialDay[String(boss)] === today;
/** "5h 12m" until the next local midnight (the daily limit resets then). */
export function untilReset(now: Date = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const m = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 60000)), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Can this hero start the trial of `boss` now? 'ok' = the daily try is free, 'ticket' = already won today but a ticket pays the rematch,
 *  'locked' = won today and no ticket, 'asleep' = the portal is not open yet (no game clear). Pure; used by the window, the store and co-op (both players must pass). */
export type TrialAccess = 'ok' | 'ticket' | 'locked' | 'asleep';
export function trialAccess(endings: number, trialDay: Record<string, string> | undefined, tickets: number, boss: number, today: string = trialDayKey()): TrialAccess {
  if (endings <= 0) return 'asleep';
  if (!fought(trialDay, boss, today)) return 'ok';
  return tickets > 0 ? 'ticket' : 'locked';
}
