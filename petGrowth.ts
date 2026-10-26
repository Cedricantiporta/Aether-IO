// ============================================================================
// Pet growth: levels 1-20, XP curve, evolution stages, stat/power multipliers.
// Pure data + helpers (no store / React imports) so engine, UI and store share them.
// State lives ON the pet Item (petLv / petXp / petStage) so it survives bag / warehouse / equip moves.
// ============================================================================
import { GOLD_SCALE, PETS_POOL } from './constants';
import { SHARD_RARITIES, shardTier } from './shards';
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
/** (owner 2026-10-26) a little extra size on top of the evolution scale: +6% per growth stage above I and +4% per ascension star, capped at +45% total. */
export const petSizeBonus = (stage: number, stars: number): number => 1 + Math.min(0.45, Math.max(0, stage - 1) * 0.06 + stars * 0.04);

export const petLv = (p: Pick<Item, 'petLv'>): number => Math.max(1, Math.min(PET_MAX_LV, Math.floor(p.petLv ?? 1)));
export const petStage = (p: Pick<Item, 'petStage'>): number => Math.max(1, Math.min(3, Math.floor(p.petStage ?? 1)));
export const PET_MAX_STARS = 5;
export const PET_STAR_BONUS = 0.1;
export const petStars = (p: Pick<Item, 'petStars'>): number => Math.max(0, Math.min(PET_MAX_STARS, Math.floor(p.petStars ?? 0)));
export const petXp = (p: Pick<Item, 'petXp'>): number => Math.max(0, p.petXp ?? 0);

/** XP needed to go from level `lv` to `lv + 1`: 60 * lv^1.5 (Lv1->2 = 60, Lv9->10 = 1620, Lv19->20 = 4970). */
export const petXpNeed = (lv: number): number => Math.round(60 * Math.pow(Math.max(1, lv), 1.5));
/** Highest level the pet may reach at its current stage (Lv 10 / 20 until it evolves). */
export const petLvCap = (stage: number): number => (stage >= 3 ? PET_MAX_LV : PET_EVOLVE_LV[stage] ?? PET_MAX_LV);

/** Multiplier on the pet's base stats AND pet skill power. 1.0 at Lv 1 stage 1; Lv 20 stage 3 = 2.7. */
export const petPowerAt = (lv: number, stage: number, stars = 0): number => (1 + PET_LV_BONUS * (lv - 1) + PET_STAGE_BONUS[stage]) * (1 + PET_STAR_BONUS * stars);
export const petPower = (p: Item): number => (p.type === 'PET' ? petPowerAt(petLv(p), petStage(p), petStars(p)) : 1);
/** Stats that are NOT a share of the hero's own value (flat small numbers or fractions); kept for gear upgrades (store.ts / ui/lib/game.ts). */
export const PET_PCT_STATS = new Set(['critRate', 'critDamage', 'cooldownReduction', 'dodge', 'moveSpeed', 'skillDamage', 'lifeSteal', 'fireRate', 'goldFind', 'xpBonus', 'multishot']);

// ---- Pet stat model (owner 2026-10-26): a pet's `stats` in the catalog are WEIGHTS (1.0 = a full line), not numbers.
//   value = share(rarity) x weight x growth x (a hero reference stat)       (damage, health, defense, regen, mana regen, attack speed, move speed)
//   value = absolute cap(stat) x (share(rarity) / Mythic share) x weight x growth   (crit, crit damage, cooldown, dodge, knockback ...)
// share(rarity) is the line size at max growth (Lv 20, Stage III, 0 stars): Common 10% ... Mythic 47.5% of the hero's own stat.
// growth runs 0.6 (Lv 1 Stage I) .. 1.0 (Lv 20 Stage III), +10% per ascension star. Weights are looked up by pet NAME in PETS_POOL,
// so saved pets (whose stored stats come from the old number scale) follow the new model without a migration.
// (owner 2026-10-26: 4%..19% was 'unimaginably weak'; the reference is the hero BEFORE talents / attributes / % bonuses, so the shares are 2.5x)
export const PET_LINE_SHARE: Record<Rarity, number> = { COMMON: 0.10, UNCOMMON: 0.15, RARE: 0.21, EPIC: 0.29, LEGENDARY: 0.375, MYTHIC: 0.475 };
/** Absolute stats at share = Mythic, weight 1, growth 1. */
export const PET_ABS_MAX: Record<string, number> = { critRate: 0.16, critDamage: 0.65, cooldownReduction: 0.15, dodge: 0.09, knockback: 1.2, skillDamage: 0.25, lifeSteal: 0.015, goldFind: 0.16, xpBonus: 0.16 };
/** Share-of-reference stats: damage / maxHealth / defense / moveSpeed / fireRate use their own reference; regen is % of max HP per second, manaRegen % of max mana per second. */
const REL_FACTOR: Record<string, number> = { damage: 1, maxHealth: 1, defense: 1, moveSpeed: 0.2, fireRate: 0.25, regen: 0.012, manaRegen: 0.025 };   // (speed / regen lines kept near their old size when the shares went 2.5x)
/** The hero's stats BEFORE the pet is added (gear + class + talents): kept up to date by store.calculateStats. `hpMul` = the HP inflation shown in game. */
export const petRef = { damage: 18, maxHealth: 100, defense: 3, maxMana: 100, fireRate: 1.4, moveSpeed: 10, hpMul: 1 };
const REF_KEY: Record<string, 'damage' | 'maxHealth' | 'defense' | 'moveSpeed' | 'fireRate'> = { damage: 'damage', maxHealth: 'maxHealth', defense: 'defense', moveSpeed: 'moveSpeed', fireRate: 'fireRate' };

/** Weights of a pet (template by name; the item's own stats only for unknown pets). */
export const petWeights = (p: Pick<Item, 'name' | 'stats'>): Partial<Record<string, number>> => {
  const t = PETS_POOL.find((q) => q.name === p.name);
  return (t ?? p).stats as Partial<Record<string, number>>;
};
/** 0.6 at Lv 1 Stage I -> 1.0 at Lv 20 Stage III (the same raw curve as petPowerAt), x(1 + 10%) per star. */
export const petStatGrowth = (lv: number, stage: number, stars = 0): number => {
  const raw = 1 + PET_LV_BONUS * (lv - 1) + PET_STAGE_BONUS[stage];
  return (0.6 + 0.4 * (raw - 1) / (PET_LV_BONUS * (PET_MAX_LV - 1) + PET_STAGE_BONUS[3])) * (1 + PET_STAR_BONUS * stars);
};
/** Share of the hero's reference stat (0.17 = +17%) for the relative stats, or undefined for absolute ones. */
export const petStatShare = (p: Item, k: string, lv = petLv(p), stage = petStage(p), stars = petStars(p)): number | undefined => {
  const w = petWeights(p)[k];
  if (w === undefined || REL_FACTOR[k] === undefined) return undefined;
  return PET_LINE_SHARE[p.rarity] * w * petStatGrowth(lv, stage, stars) * REL_FACTOR[k];
};
/** The number a pet stat line gives (flat for damage / health / ..., a fraction for crit / cooldown ...). `ref` = hero reference stats. */
export const petStatAt = (p: Item, k: string, lv: number, stage: number, stars: number, ref = petRef): number => {
  const sh = petStatShare(p, k, lv, stage, stars);
  if (sh !== undefined) {
    if (k === 'regen') return ref.maxHealth * sh;
    if (k === 'manaRegen') return ref.maxMana * sh;
    if (k === 'defense') return Math.max(ref.defense, ref.maxHealth * 0.03) * sh;
    return ref[REF_KEY[k]] * sh;
  }
  const w = petWeights(p)[k] ?? 0, cap = PET_ABS_MAX[k] ?? 0;
  return cap * (PET_LINE_SHARE[p.rarity] / PET_LINE_SHARE.MYTHIC) * w * petStatGrowth(lv, stage, stars);
};
/** Value of a pet stat line at the pet's current growth (applied to the hero by store.calculateStats; maxHealth is pre-inflation there). */
export const petStatValue = (p: Item, k: string, ref = petRef): number => (p.type === 'PET' ? petStatAt(p, k, petLv(p), petStage(p), petStars(p), ref) : 0);
/** What the player sees for a pet line: the in-game number (HP inflation included) and the share of the hero's stat when it has one. */
export const petStatShown = (p: Item, k: string, lv = petLv(p), stage = petStage(p), stars = petStars(p)): { value: number; share?: number } => {
  const v = petStatAt(p, k, lv, stage, stars);
  return { value: k === 'maxHealth' ? v * petRef.hpMul : v, share: petStatShare(p, k, lv, stage, stars) };
};
/** (owner) feeding is tiered: a pet eats food of its own rarity (Common / Uncommon count as one tier). */
const FOOD_TIER: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
export const petEats = (p: Item, food: Rarity): boolean => FOOD_TIER[p.rarity] === FOOD_TIER[food];

export const petDisplayName = (p: Item): string => (p.type === 'PET' ? PET_STAGE_PREFIX[petStage(p) - 1] + p.name : p.name);

/** True when the pet sits at its stage level cap and may evolve. */
export const petCanEvolve = (p: Item): boolean => { const st = petStage(p); return st < 3 && petLv(p) >= PET_EVOLVE_LV[st]; };

export interface EvolveCost { gold: number; shards: Partial<Record<Rarity, number>> }
/** Evolve costs by pet rarity (owner 2026-10-26): shards of the pet's OWN tier (Uncommon pets use Common shards, the only low tier
 *  without an Uncommon shard) and, for the second evolution, a smaller pile of the tier below; gold grows with rarity and stage.
 *  [gold / GOLD_SCALE, own-tier shards, below-tier shards] for stage I -> II and II -> III. Shard counts follow the crafting recipes
 *  (a Mythic piece costs 12 Mythic shards) and the Gem Shop (Mythic 60 gems each). */
const EVOLVE_TABLE: Record<Rarity, [[number, number, number], [number, number, number]]> = {
  COMMON: [[2000, 60, 0], [6000, 150, 0]],
  UNCOMMON: [[3000, 90, 0], [8000, 220, 0]],
  RARE: [[4500, 25, 0], [12000, 60, 100]],
  EPIC: [[7000, 15, 0], [18000, 35, 40]],
  LEGENDARY: [[10000, 8, 0], [26000, 20, 25]],
  MYTHIC: [[15000, 5, 0], [40000, 12, 15]],
};
/** Cost to evolve `p` FROM its current stage (1 -> 2 or 2 -> 3), or null at the final stage. Gold is pre-scaled by GOLD_SCALE. */
export const petEvolveCost = (p: Pick<Item, 'rarity' | 'petStage'>): EvolveCost | null => {
  const st = petStage(p);
  if (st >= 3) return null;
  const [gold, own, below] = EVOLVE_TABLE[p.rarity][st - 1];
  const tier = shardTier(p.rarity), shards: Partial<Record<Rarity, number>> = { [tier]: own };
  const lower = SHARD_RARITIES[SHARD_RARITIES.indexOf(tier) - 1];
  if (below > 0 && lower) shards[lower] = below;
  return { gold: gold * GOLD_SCALE, shards };
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
