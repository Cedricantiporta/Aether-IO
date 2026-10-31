// ============================================================================
// Loot by biome (owner 2026-10-31): "the higher the biome the bigger the gold and the rarer the loot; monsters max Legendary LOW,
// elites Legendary HIGH; the rarer the item the rarer it drops; no Rare or below in the Void" (gear / weapons / accessories only).
// Pure data + helpers (no store import). Used by store.rollItemDrop (ADVENTURE kill drops, `DropCtx`) and by the pickup gold payout.
// Mythic never comes from here (boss / Boss Trial / summon / crafting only).
// ============================================================================
import type { ItemGrade, Rarity } from './types';
import { GRADE_DROP_ODDS } from './grade';

/** Where a plain kill drop comes from: the biome index (0 Greenwood .. 6 Void) and whether the killer was an elite / mini-boss. */
export interface DropCtx { biome: number; elite?: boolean }

/** Gold multiplier per biome (on top of the depth scaling): applied when a gold coin is picked up in an ADVENTURE run. */
export const BIOME_GOLD_MUL: readonly number[] = [1.0, 1.3, 1.65, 2.05, 2.5, 3.0, 3.6];
export const biomeGoldMul = (biome: number): number => BIOME_GOLD_MUL[Math.max(0, Math.min(BIOME_GOLD_MUL.length - 1, biome | 0))];

type W5 = readonly [number, number, number, number, number];   // weights: COMMON, UNCOMMON, RARE, EPIC, LEGENDARY (any scale, normalised on use)
const TIERS: readonly Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** Rarity weights (percent) of a dropped gear piece per biome, ordinary monsters. The floor rises with the biome (lower tiers shrink, then vanish);
 *  Legendary from a plain monster is always LOW grade. */
export const MONSTER_RARITY: readonly W5[] = [
  [78,   18.5, 3.2,  0.3,  0],      // Greenwood: Common+
  [20,   62,   15,   2.88, 0.02],   // Marble: Common / Uncommon+
  [0,    80,   16.5, 3.45, 0.05],   // Desert: Uncommon+
  [0,    18,   64,   17.88, 0.12],  // Coral: Uncommon / Rare+
  [0,    0,    78,   21.75, 0.25],  // Frostpeak: Rare+
  [0,    0,    22,   77.55, 0.45],  // Ember: Rare / Epic+
  [0,    0,    0,    99.2,  0.8],   // Void: Epic+ (no Rare or below)
];
/** Same for elites / mini-bosses (one tier richer, a few times more Legendary; Legendary may roll Low / Mid / High). */
export const ELITE_RARITY: readonly W5[] = [
  [55,   33,   10.5, 1.5,  0],
  [12,   55,   27,   5.9,  0.1],
  [0,    55,   34,   10.6, 0.4],
  [0,    12,   56,   31.1, 0.9],
  [0,    0,    62,   36.6, 1.4],
  [0,    0,    14,   83.8, 2.2],
  [0,    0,    0,    96.8, 3.2],
];

const clampB = (b: number): number => Math.max(0, Math.min(MONSTER_RARITY.length - 1, b | 0));
/** Rolls the rarity of one kill-dropped gear piece (never Mythic). */
export function rollBiomeRarity(ctx: DropCtx, rng: () => number = Math.random, luck = 0): Rarity {
  const w = (ctx.elite ? ELITE_RARITY : MONSTER_RARITY)[clampB(ctx.biome)];
  // luck (Wishing Fountain): tier i weighs x(1 + luck * 0.5 * i), only tiers the biome already allows (weight > 0), so the biome's floor / cap never moves
  const k = (i: number): number => (w[i] > 0 ? w[i] * (1 + luck * 0.5 * i) : 0);
  let sum = 0; for (let i = 0; i < 5; i++) sum += k(i);
  let r = rng() * sum;
  for (let i = 0; i < 5; i++) { const wi = k(i); if (wi > 0 && r < wi) return TIERS[i]; r -= wi; }
  for (let i = 4; i >= 0; i--) if (w[i] > 0) return TIERS[i];
  return 'COMMON';
}

/** Grade for a kill drop: a plain monster's Legendary is forced Low; everything else follows the normal grade odds (undefined = the usual roll). */
export function dropGradeFor(rarity: Rarity, elite: boolean | undefined): ItemGrade | undefined {
  return rarity === 'LEGENDARY' && !elite ? 'LOW' : undefined;
}
/** Rarity ceiling of a kill drop: Legendary for everyone (Legendary High for elites, Low for monsters via `dropGradeFor`); never Mythic. */
export const clampKillRarity = (r: Rarity): Rarity => (r === 'MYTHIC' ? 'LEGENDARY' : r);
export { GRADE_DROP_ODDS };
