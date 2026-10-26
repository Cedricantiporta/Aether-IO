// Ascension: after the ending (Malakar defeated) the hero can climb Ascension levels 1..10. Every level stacks one more
// hardship on top of the chosen difficulty and pays more (gold / loot luck / rank xp). Unlocked one level per clear, and the FIRST
// clear of every level pays a big one-time reward (ASC_REWARDS below: gems, Aether Crystals, Legendary / Mythic gear, pets).

import type { Rarity } from './types';

export interface AscensionLevel { lv: number; name: string; hardship: string }
export const ASCENSION_MAX = 10;
export const ASCENSIONS: AscensionLevel[] = [
  { lv: 1, name: 'Tempered', hardship: 'Enemies have +20% health' },
  { lv: 2, name: 'Bloodied', hardship: 'Enemies deal +15% damage' },
  { lv: 3, name: 'Swarming', hardship: '+15% more enemies per room' },
  { lv: 4, name: 'Parched', hardship: 'All healing is 25% weaker' },
  { lv: 5, name: 'Tyrants', hardship: 'Bosses have +25% health' },
  { lv: 6, name: 'Relentless', hardship: 'Enemies move 8% faster' },
  { lv: 7, name: 'Ironhide', hardship: 'Enemies have another +20% health' },
  { lv: 8, name: 'Merciless', hardship: 'Enemies deal another +15% damage' },
  { lv: 9, name: 'Champions', hardship: 'Elite rooms bring one more elite' },
  { lv: 10, name: 'Apotheosis', hardship: 'Bosses +25% health, +15% more enemies' },
];
export interface AscMods { hp: number; dmg: number; spawn: number; heal: number; bossHp: number; speed: number; elites: number; reward: number }
/** Cumulative modifiers of Ascension `lv` (0 = none). `reward` multiplies gold / loot luck / rank xp. */
export function ascensionMods(lv: number, out: AscMods): AscMods {
  out.hp = 1; out.dmg = 1; out.spawn = 1; out.heal = 1; out.bossHp = 1; out.speed = 1; out.elites = 0;
  if (lv >= 1) out.hp *= 1.2;
  if (lv >= 2) out.dmg *= 1.15;
  if (lv >= 3) out.spawn *= 1.15;
  if (lv >= 4) out.heal *= 0.75;
  if (lv >= 5) out.bossHp *= 1.25;
  if (lv >= 6) out.speed *= 1.08;
  if (lv >= 7) out.hp *= 1.2;
  if (lv >= 8) out.dmg *= 1.15;
  if (lv >= 9) out.elites += 1;
  if (lv >= 10) { out.bossHp *= 1.25; out.spawn *= 1.15; }
  out.reward = 1 + 0.12 * lv;
  return out;
}

// ------------------------------------------------------------------ first-clear rewards --
/** One-time reward for the FIRST clear (Malakar defeated) at Ascension level `lv` (0 = the plain adventure). Gear is rolled for the hero
 *  who finished the run; the pets are Legendary / Mythic companions. Paid by store.completeEnding. */
export interface AscReward { gems: number; crystals: number; gear: Rarity[]; pets: Rarity[] }
export const ASC_REWARDS: AscReward[] = [
  { gems: 300, crystals: 10, gear: ['LEGENDARY'], pets: [] },                         // 0: the first ending
  { gems: 400, crystals: 15, gear: ['LEGENDARY'], pets: [] },                         // 1
  { gems: 500, crystals: 15, gear: ['LEGENDARY'], pets: [] },                         // 2
  { gems: 650, crystals: 20, gear: ['LEGENDARY'], pets: ['LEGENDARY'] },              // 3
  { gems: 800, crystals: 25, gear: ['LEGENDARY'], pets: [] },                         // 4
  { gems: 1000, crystals: 30, gear: ['LEGENDARY', 'LEGENDARY'], pets: [] },           // 5
  { gems: 1200, crystals: 35, gear: ['LEGENDARY'], pets: ['LEGENDARY'] },             // 6
  { gems: 1500, crystals: 40, gear: ['LEGENDARY', 'LEGENDARY'], pets: [] },           // 7
  { gems: 1800, crystals: 50, gear: ['MYTHIC'], pets: [] },                           // 8
  { gems: 2200, crystals: 60, gear: ['MYTHIC', 'LEGENDARY'], pets: [] },              // 9
  { gems: 3000, crystals: 80, gear: ['MYTHIC', 'MYTHIC'], pets: ['MYTHIC'] },         // 10
];
export const ascReward = (lv: number): AscReward => ASC_REWARDS[Math.max(0, Math.min(ASCENSION_MAX, Math.floor(lv)))];
const cap = (r: Rarity) => r.charAt(0) + r.slice(1).toLowerCase();
/** Readable one-liner: "800 gems, 25 Aether Crystals, 1 Legendary gear piece". */
export function ascRewardText(lv: number): string {
  const r = ascReward(lv), parts = [`${r.gems.toLocaleString()} gems`, `${r.crystals} Aether Crystals`];
  const count = (list: Rarity[]) => { const m = new Map<Rarity, number>(); for (const x of list) m.set(x, (m.get(x) ?? 0) + 1); return [...m]; };
  for (const [rar, n] of count(r.gear)) parts.push(`${n > 1 ? n + ' ' : 'a '}${cap(rar)} gear piece${n > 1 ? 's' : ''}`);
  for (const [rar, n] of count(r.pets)) parts.push(`${n > 1 ? n + ' ' : 'a '}${cap(rar)} pet${n > 1 ? 's' : ''}`);
  return parts.join(', ');
}
