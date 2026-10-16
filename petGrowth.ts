// ============================================================================
// Pet growth: levels 1-20, XP curve, evolution stages, stat/power multipliers.
// Pure data + helpers (no store / React imports) so engine, UI and store share them.
// State lives ON the pet Item (petLv / petXp / petStage) so it survives bag / warehouse / equip moves.
// ============================================================================
import { GOLD_SCALE } from './constants';
import type { Item, Rarity } from './types';

export const PET_MAX_LV = 20;
/** Stage 1 pets stop at Lv 10, stage 2 at Lv 20; evolving unlocks the next band. Stage 3 is the final form. */
export const PET_EVOLVE_LV: Record<number, number> = { 1: 10, 2: 20 };
export const PET_STAGE_PREFIX = ['', 'Greater ', 'Ancient '];
export const PET_STAGE_LABEL = ['', 'Stage I', 'Stage II', 'Stage III'];
/** Per-level growth (+5% of base stats) and the flat jump each evolution adds on top. */
export const PET_LV_BONUS = 0.05;
export const PET_STAGE_BONUS = [0, 0, 0.3, 0.75];
/** Render scale per stage. */
export const PET_STAGE_SCALE = [1, 1, 1.28, 1.6];

export const petLv = (p: Pick<Item, 'petLv'>): number => Math.max(1, Math.min(PET_MAX_LV, Math.floor(p.petLv ?? 1)));
export const petStage = (p: Pick<Item, 'petStage'>): number => Math.max(1, Math.min(3, Math.floor(p.petStage ?? 1)));
export const petXp = (p: Pick<Item, 'petXp'>): number => Math.max(0, p.petXp ?? 0);

/** XP needed to go from level `lv` to `lv + 1`: 60 * lv^1.5 (Lv1->2 = 60, Lv9->10 = 1620, Lv19->20 = 4970). */
export const petXpNeed = (lv: number): number => Math.round(60 * Math.pow(Math.max(1, lv), 1.5));
/** Highest level the pet may reach at its current stage (Lv 10 / 20 until it evolves). */
export const petLvCap = (stage: number): number => (stage >= 3 ? PET_MAX_LV : PET_EVOLVE_LV[stage] ?? PET_MAX_LV);

/** Multiplier on the pet's base stats AND pet skill power. 1.0 at Lv 1 stage 1; Lv 20 stage 3 = 2.7. */
export const petPowerAt = (lv: number, stage: number): number => 1 + PET_LV_BONUS * (lv - 1) + PET_STAGE_BONUS[stage];
export const petPower = (p: Item): number => (p.type === 'PET' ? petPowerAt(petLv(p), petStage(p)) : 1);
/** (owner balance) percentage stats a pet gives (crit, cooldown, dodge, speed ...) count half and grow at a quarter of the
 *  flat-stat rate: a maxed Mythic pet no longer hands out +54% crit. Flat stats (damage, health, defense, regen) use petPower. */
export const PET_PCT_STATS = new Set(['critRate', 'critDamage', 'cooldownReduction', 'dodge', 'moveSpeed', 'skillDamage', 'lifeSteal', 'fireRate', 'goldFind', 'xpBonus', 'multishot']);
export const petStatMul = (p: Item, k: string): number => {
  if (p.type !== 'PET') return 1;
  const pm = petPower(p);
  return PET_PCT_STATS.has(k) ? 0.5 * (1 + (pm - 1) * 0.25) : pm;
};
/** (owner) feeding is tiered: a pet eats food of its own rarity (Common / Uncommon count as one tier). */
const FOOD_TIER: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
export const petEats = (p: Item, food: Rarity): boolean => FOOD_TIER[p.rarity] === FOOD_TIER[food];

export const petDisplayName = (p: Item): string => (p.type === 'PET' ? PET_STAGE_PREFIX[petStage(p) - 1] + p.name : p.name);

/** True when the pet sits at its stage level cap and may evolve. */
export const petCanEvolve = (p: Item): boolean => { const st = petStage(p); return st < 3 && petLv(p) >= PET_EVOLVE_LV[st]; };

export interface EvolveCost { gold: number; shards: Partial<Record<Rarity, number>> }
/** Cost to evolve FROM `stage` (1 -> 2 or 2 -> 3). Gold is pre-scaled by GOLD_SCALE. */
export const PET_EVOLVE_COST: Record<number, EvolveCost> = {
  1: { gold: 2000 * GOLD_SCALE, shards: { COMMON: 150, RARE: 30 } },
  2: { gold: 8000 * GOLD_SCALE, shards: { COMMON: 300, RARE: 80, EPIC: 15 } },
};

/** XP granted per feed unit. Shards: 1 shard; loot: 1 crystal / ore item. */
export const PET_SHARD_XP: Record<Rarity, number> = { COMMON: 5, UNCOMMON: 10, RARE: 20, EPIC: 80, LEGENDARY: 300, MYTHIC: 1200 };
export const PET_LOOT_XP: Record<Rarity, number> = { COMMON: 10, UNCOMMON: 20, RARE: 40, EPIC: 160, LEGENDARY: 640, MYTHIC: 2500 };
/** Loot glyphs that count as pet food (crystals and ore). */
export const PET_FOOD_GLYPHS = ['crystal', 'nugget', 'orb', 'shard'];

/** XP a kill is worth to the pet. */
export const petKillXp = (elite: boolean, boss: boolean, wave: number): number => (boss ? 150 : elite ? 25 : 3 + 0.15 * wave);

/** Apply `gain` XP to a pet (pure). Respects the stage level cap. Returns the new fields + levels gained + xp actually used. */
export function petApplyXp(p: Item, gain: number): { petLv: number; petXp: number; gained: number; used: number } {
  let lv = petLv(p), xp = petXp(p) + Math.max(0, gain);
  const cap = petLvCap(petStage(p));
  let gained = 0;
  while (lv < cap && xp >= petXpNeed(lv)) { xp -= petXpNeed(lv); lv++; gained++; }
  let used = Math.max(0, gain);
  if (lv >= cap) { const over = xp; xp = 0; used = Math.max(0, used - over); }
  return { petLv: lv, petXp: Math.floor(xp), gained, used };
}
