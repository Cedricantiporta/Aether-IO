// The current run's mode + combined difficulty / Ascension modifiers. Set once when a run starts (startGame),
// read by spawning, combat and the director. Pure engine state (no React).
import { DIFFICULTY_MODS } from '../constants';
import { ascensionMods, type AscMods } from '../ascension';
import type { Difficulty } from '../storeTypes';
import { dailyMods } from '../dailyChallenge';
import { showcase, SHOWCASE_HP_MUL } from './showcase';

export type RunMode = 'ADVENTURE' | 'TOWER';
/** back: where the hero reappears in town after this run ('TOWER': at the Endless Tower door; '': the plaza). */
/** startBiome: the biome an ADVENTURE run opens in (0; the captain's ship to the Coral Isles sets 3). */
export const runInfo = { mode: 'ADVENTURE' as RunMode, ascension: 0, back: '' as '' | 'TOWER', startBiome: 0, /** the next run is a Font dream (dreams.ts) */ dream: false, /** this run is on Hard mode (set at run start; better gold / XP / drop and card odds) */ hard: false };

/** (owner 2026-10-26) The ship start: the run opens in a calm camp where Captain Rhea waits. `lock`: the exit portals stay shut until the hero
 *  has chosen a deck (4 cards per skipped biome, `skipped`); `open`: the deck window is showing; `onChosen`: the director opens the portals. */
export const shipState = { lock: false, open: false, skipped: 0, onChosen: null as (() => void) | null };
export function shipDeckChosen(): void { shipState.lock = false; shipState.open = false; shipState.onChosen?.(); }

/** Hard mode reward multipliers (gold + XP, epic-and-better item odds). Applied only while a Hard run is in progress. */
export const HARD_GOLD_XP = 1.5;
export const HARD_EPIC_MUL = 1.6;
/** Hard-run reward multiplier for gold / XP (1 in town or on a non-Hard run). */
export const hardMul = (inTown: boolean): number => (runInfo.hard && !inTown ? HARD_GOLD_XP : 1);
export interface RunMods extends AscMods { loot: number }
/** (owner) Re-entering an already conquered biome (Adventure): more, tougher, angrier monsters (set per room by director.enterRoom). */
export const veteran = { on: false };
export const VET = { hp: 1.2, dmg: 1.15, spawn: 1.2, speed: 1.05, shieldChance: 0.12, attackCd: 0.85, trickCd: 0.8 };   // (owner 2026-10-25: softened, was 1.4 / 1.3 / 1.4 / 1.1 / 0.25 / 0.7 / 0.6)
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
  if (showcase.on) out.hp *= SHOWCASE_HP_MUL;   // (owner) the opening power fight lasts a bit longer
  if (veteran.on) { out.hp *= VET.hp; out.dmg *= VET.dmg; out.spawn *= VET.spawn; out.speed *= VET.speed; out.elites += 1; }
  return out;
}

/** Town-clock time 0..1 (0 dawn, .25 noon, .5 dusk, .75 midnight) to a run phase: 0 day, 1 dusk, 2 night, 3 dawn. */
export const phaseOfTime = (t: number): number => { const k = Math.round((t - Math.floor(t)) * 4) & 3; return k === 0 ? 3 : k === 1 ? 0 : k === 2 ? 1 : 2; };
