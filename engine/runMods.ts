// The current run's mode + combined difficulty / Ascension modifiers. Set once when a run starts (startGame),
// read by spawning, combat and the director. Pure engine state (no React).
import { DIFFICULTY_MODS } from '../constants';
import { ascensionMods, type AscMods } from '../ascension';
import type { Difficulty } from '../storeTypes';
import { dailyMods } from '../dailyChallenge';

export type RunMode = 'ADVENTURE' | 'TOWER';
/** back: where the hero reappears in town after this run ('TOWER': at the Endless Tower door; '': the plaza). */
/** startBiome: the biome an ADVENTURE run opens in (0; the captain's ship to the Coral Isles sets 3). */
export const runInfo = { mode: 'ADVENTURE' as RunMode, ascension: 0, back: '' as '' | 'TOWER', startBiome: 0, /** the next run is a Font dream (dreams.ts) */ dream: false };

export interface RunMods extends AscMods { loot: number }
const asc: AscMods = { hp: 1, dmg: 1, spawn: 1, heal: 1, bossHp: 1, speed: 1, elites: 0, reward: 1 };
const out: RunMods = { ...asc, loot: 1 };
/** Difficulty x Ascension (one shared object: read it, don't keep it). */
export function runMods(difficulty: Difficulty): RunMods {
  const d = DIFFICULTY_MODS[difficulty];
  ascensionMods(runInfo.ascension, asc);
  out.hp = d.hp * asc.hp; out.dmg = d.dmg * asc.dmg; out.spawn = d.spawn * asc.spawn; out.loot = d.loot * asc.reward;
  out.heal = asc.heal; out.bossHp = asc.bossHp; out.speed = asc.speed; out.elites = asc.elites; out.reward = asc.reward;
  // Daily Trial modifiers (neutral outside a daily run)
  out.hp *= dailyMods.hp; out.spawn *= dailyMods.spawn; out.speed *= dailyMods.enemySpeed; out.elites += dailyMods.elites;
  return out;
}
