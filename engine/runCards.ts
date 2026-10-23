// Run reward cards: rarity tiers, card catalogue, weighted rolling and the per-run effects of the special cards.
// Pure TS (no React). Per-run state is reset on 'runStart'; the engine reads `runCards` directly (never the store).
import { events } from './events';
import type { Enemy } from './types';
import { POTION_COOLDOWN } from '../constants';
import { runInfo } from './runMods';
import type { Rarity, SpecialId, Upgrade, UpgradeType } from '../types';

export const TIERS: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/** Base odds (percent) per tier; renormalised inside a card's own rarity range. Mythic only while none was offered this run. */
const TIER_WEIGHT = [56, 29, 12.5, 2.2, 0.25];

export const REGEN_CAP_BASE = 0.7;   // HP regeneration stops at 70% of max HP (potions / heals are not limited)
export const DEFIANCE_MAX = 2;
export const DASH_CARD_MAX = 3;
export const POTION_CD_STACKS_MAX = 3;
export const POTION_CD_CAP = 0.5;   // total potion cooldown reduction from Quickdraw Flask never exceeds -50%
/** Hard mode shifts the card rarity odds up: tiers above Common get these weight multipliers (Common x0.7). */
const HARD_TIER_MUL = [0.7, 1.25, 1.6, 1.6, 1.6];
/** Early biomes roll lower: per-tier weight multipliers for biome 0 and 1 (later biomes use the base odds). */
const EARLY_TIER_MUL = [[1.3, 0.6, 0.4, 0.35, 0.35], [1.15, 0.8, 0.65, 0.6, 0.6]];
let earlyMul: number[] | null = null;

/** Live per-run card state. */
export const runCards = {
  /** Death Defiance charges left to spend / cards taken so far (max 2). */
  defiance: 0, defianceTaken: 0,
  mythicOffered: false,
  dashStacks: 0,
  /** Quickdraw Flask: cards taken and the total potion cooldown reduction (0..POTION_CD_CAP) */
  potionCdStacks: 0, potionCdCut: 0,
  /** extra card selections queued behind the one on screen (Guardian's Spoils) */
  extraPicks: 0,
  regenCap: REGEN_CAP_BASE,
  potionBonus: 0,
  /** special values, 0 = not owned */
  afflict: 0, sunder: 0, guardian: 0, slayer: 0, execute: 0, firstStrike: 0, secondWind: 0, linger: 0,
  /** at least one outgoing-damage special owned (fast exit) */
  anyDmg: false,
  taken: {} as Record<string, boolean>,
};

export function resetRunCards(): void {
  const r = runCards;
  r.defiance = 0; r.defianceTaken = 0; r.mythicOffered = false; r.dashStacks = 0; r.potionCdStacks = 0; r.potionCdCut = 0; r.extraPicks = 0;
  r.regenCap = REGEN_CAP_BASE; r.potionBonus = 0;
  r.afflict = 0; r.sunder = 0; r.guardian = 0; r.slayer = 0; r.execute = 0; r.firstStrike = 0; r.secondWind = 0; r.linger = 0;
  r.anyDmg = false; r.taken = {};
  aegisBiome = '';
}
events.on('runStart', resetRunCards);

/** Aegis is offered at most once per biome. */
let aegisBiome = '';

/** Potion cooldown in seconds (shared by the engine and the HUD), after Quickdraw Flask cards. */
export function potionCooldown(): number { return POTION_COOLDOWN * (1 - runCards.potionCdCut); }

// ------------------------------------------------------------------ effects --
/** Statuses currently on an enemy (burn, poison, freeze, stun, slow, armor break, fear, chill). No allocation. */
export function statusCount(e: Enemy): number {
  return (e.burnT > 0 ? 1 : 0) + (e.poisonT > 0 ? 1 : 0) + (e.freezeT > 0 ? 1 : 0) + (e.stunT > 0 ? 1 : 0) + (e.slowT > 0.05 ? 1 : 0)
    + (e.armorBreakT > 0 ? 1 : 0) + (e.fearT > 0 ? 1 : 0) + (e.chillStacks > 0 ? 1 : 0);
}

/** Outgoing player damage multiplier from the special cards (Afflictor, Slayer, Executioner, First Strike). */
export function cardDamageMul(e: Enemy): number {
  const r = runCards;
  if (!r.anyDmg) return 1;
  let m = 1;
  if (r.slayer > 0 && e.boss) m *= 1 + r.slayer;
  if (r.execute > 0 && e.hp < e.maxHp * 0.3) m *= 1 + r.execute;
  if (r.firstStrike > 0 && e.hp >= e.maxHp * 0.999) m *= 1 + r.firstStrike;
  if (r.afflict > 0 && statusCount(e) >= 3) m *= 1 + r.afflict;
  return m;
}

// ----------------------------------------------------------------- catalogue --
interface StatDef { type: UpgradeType; name: string; vals: number[]; fmt: (v: number) => string; weight?: number }
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
/** value per tier [COMMON, RARE, EPIC, LEGENDARY, MYTHIC] */
const STATS: StatDef[] = [
  { type: 'DAMAGE', name: 'Sharpness', vals: [0.06, 0.10, 0.15, 0.22, 0.35], fmt: (v) => `+${pct(v)} Damage` },
  { type: 'HEALTH', name: 'Vitality Rune', vals: [8, 14, 22, 34, 55], fmt: (v) => `+${v} Max HP` },   // (store rewrites the number with HP_INFLATE)
  { type: 'DEFENSE', name: 'Iron Skin', vals: [3, 5, 8, 13, 22], fmt: (v) => `+${v} Defense` },
  { type: 'FIRE_RATE', name: 'Haste', vals: [0.04, 0.07, 0.10, 0.15, 0.24], fmt: (v) => `+${pct(v)} Attack Speed` },
  { type: 'SPEED', name: 'Wind Step', vals: [0.02, 0.035, 0.05, 0.075, 0.12], fmt: (v) => `+${pct(v)} Move Speed` },
  { type: 'CRIT_RATE', name: 'Precision', vals: [0.02, 0.035, 0.05, 0.08, 0.13], fmt: (v) => `+${pct(v)} Crit Chance` },
  { type: 'CRIT_DAMAGE', name: 'Lethality', vals: [0.10, 0.18, 0.28, 0.42, 0.70], fmt: (v) => `+${pct(v)} Crit Damage` },
  { type: 'COOLDOWN', name: 'Clockwork', vals: [0.02, 0.03, 0.045, 0.07, 0.11], fmt: (v) => `-${pct(v)} Skill Cooldowns` },
  { type: 'KNOCKBACK', name: 'Impact', vals: [0.10, 0.18, 0.28, 0.42, 0.70], fmt: (v) => `+${pct(v)} Knockback` },
  { type: 'LIFESTEAL', name: 'Bloodthirst', vals: [0.005, 0.01, 0.015, 0.025, 0.04], fmt: (v) => `${pct(v)} Life Steal` },
  { type: 'DMG_REDUCE', name: 'Bulwark', vals: [0.02, 0.035, 0.05, 0.08, 0.12], fmt: (v) => `-${pct(v)} Damage Taken` },
  { type: 'MAX_MANA', name: 'Mana Crystal', vals: [10, 18, 28, 45, 75], fmt: (v) => `+${v} Max Mana` },
  { type: 'MANA_REGEN', name: 'Spring of Mana', vals: [0.3, 0.5, 0.8, 1.2, 2.0], fmt: (v) => `+${v} Mana / s` },
];

interface SpecialDef { id: SpecialId; name: string; vals: [number, number]; fmt: (v: number, tier: number) => string; weight: number }
/** vals = [LEGENDARY, MYTHIC] */
const SPECIALS: SpecialDef[] = [
  { id: 'AFFLICT', name: 'Afflictor', vals: [0.20, 0.30], weight: 0.15, fmt: (v) => `+${pct(v)} damage to enemies with 3 or more status effects (burn, poison, freeze, slow, stun...)` },
  { id: 'SUNDER', name: 'Shieldbreaker', vals: [0.20, 0.35], weight: 0.15, fmt: (v) => `Enemy shields (bosses excepted) are ${pct(v)} weaker` },
  { id: 'GUARDIAN', name: 'Guardian’s Spoils', vals: [0, 1], weight: 0.15, fmt: (_v, t) => `Every guardian or mini-boss stage also gives a card selection when cleared${t >= 4 ? ' (one more card to choose from)' : ''}` },
  { id: 'SLAYER', name: 'Giant Slayer', vals: [0.15, 0.25], weight: 0.15, fmt: (v) => `Against bosses: deal +${pct(v)} damage and take ${pct(v)} less damage` },
  { id: 'ALCHEMIST', name: 'Alchemist', vals: [0.15, 0.30], weight: 0.15, fmt: (v, t) => `Potions are ${pct(v)} more effective. Regeneration heals up to ${t >= 4 ? 90 : 85}% of max HP instead of 70%` },
  { id: 'EXECUTE', name: 'Executioner', vals: [0.25, 0.40], weight: 0.15, fmt: (v) => `+${pct(v)} damage to enemies below 30% HP` },
  { id: 'FIRST_STRIKE', name: 'First Strike', vals: [0.40, 0.70], weight: 0.15, fmt: (v) => `+${pct(v)} damage to enemies at full HP` },
  { id: 'SECOND_WIND', name: 'Second Wind', vals: [0.15, 0.25], weight: 0.15, fmt: (v) => `Heal ${pct(v)} of max HP when a room is cleared` },
  { id: 'GOLD_RUSH', name: 'Gold Rush', vals: [0.30, 0.50], weight: 0.15, fmt: (v) => `+${pct(v)} gold from all sources` },
  { id: 'LINGER', name: 'Lingering Malice', vals: [0.30, 0.50], weight: 0.15, fmt: (v) => `Status effects you inflict last ${pct(v)} longer` },
];

/** Roman numeral plaque of the arcana-style cards (keyed by card type or special id). */
export const ARCANA_NUMERAL: Record<string, string> = {
  DEATH_DEFIANCE: 'XIII', AEGIS: 'XI', AFFLICT: 'XV', SUNDER: 'XVI', GUARDIAN: 'IV', SLAYER: 'VIII', ALCHEMIST: 'XIV', EXECUTE: 'XII',
  FIRST_STRIKE: 'I', SECOND_WIND: 'XVII', GOLD_RUSH: 'X', LINGER: 'IX',
  DAMAGE: 'VII', HEALTH: 'III', DEFENSE: 'V', FIRE_RATE: 'VI', SPEED: 'XVIII', CRIT_RATE: 'XIX', CRIT_DAMAGE: 'XX', COOLDOWN: 'XXI',
  KNOCKBACK: 'II', LIFESTEAL: 'XIV', DMG_REDUCE: 'V', MAX_MANA: 'XVII', MANA_REGEN: 'XVII', DASH_COOLDOWN: 'VI', POTION_CD: 'XIV', RESTORE: 'III', ULT_FILL: 'XVI',
};

// ------------------------------------------------------------------- rolling --
/** Picks a tier in [min, max] with the base odds renormalised inside the range (mythic only when allowed). */
function rollTier(min: number, max: number, allowMythic: boolean): number {
  const hm = runInfo.hard, em = earlyMul;
  let tot = 0;
  for (let i = min; i <= max; i++) tot += i === 4 && !allowMythic ? 0 : TIER_WEIGHT[i] * (hm ? HARD_TIER_MUL[i] : 1) * (em ? em[i] : 1);
  if (tot <= 0) return min;
  let r = Math.random() * tot;
  for (let i = min; i <= max; i++) { r -= i === 4 && !allowMythic ? 0 : TIER_WEIGHT[i] * (hm ? HARD_TIER_MUL[i] : 1) * (em ? em[i] : 1); if (r <= 0) return i; }
  return min;
}

/** Quickdraw Flask: potion cooldown cut per tier [COMMON, RARE, EPIC, LEGENDARY] */
const POTION_CD_VALS = [0.10, 0.15, 0.20, 0.28];

interface Entry { weight: number; cat: BuildCat; make: (allowMythic: boolean) => Omit<Upgrade, 'id'> }
const mk = (type: UpgradeType, name: string, description: string, tier: number, value: number, special?: SpecialId): Omit<Upgrade, 'id'> =>
  ({ type, name, description, rarity: TIERS[tier], tier, value, special });

/** Cards that can be offered right now (limits, stacks, once-per-run specials, once-per-biome Aegis). */
function candidates(ultUnlocked: boolean, multishotOk: boolean, biomeKey: string): Entry[] {
  const out: Entry[] = [];
  for (const d of STATS) {
    out.push({ weight: 1, cat: TYPE_CAT[d.type] ?? 'UTILITY', make: (am) => { const t = rollTier(0, 4, am); return mk(d.type, d.name, d.fmt(d.vals[t]), t, d.vals[t]); } });
  }
  if (runCards.dashStacks < DASH_CARD_MAX) {
    out.push({ weight: 0.7, cat: 'UTILITY', make: () => mk('DASH_COOLDOWN', 'Shadow Step', `-10% Dash cooldown (${runCards.dashStacks + 1}/${DASH_CARD_MAX})`, 1, 0.1) });
  }
  if (runCards.potionCdStacks < POTION_CD_STACKS_MAX && runCards.potionCdCut < POTION_CD_CAP - 1e-6) {
    out.push({ weight: 0.6, cat: 'UTILITY', make: () => {
      const t = rollTier(0, 3, false), v = Math.min(POTION_CD_VALS[t], POTION_CD_CAP - runCards.potionCdCut);
      return mk('POTION_CD', 'Quickdraw Flask', `-${pct(v)} Potion cooldown (${runCards.potionCdStacks + 1}/${POTION_CD_STACKS_MAX}, max -${pct(POTION_CD_CAP)} total)`, t, v);
    } });
  }
  out.push({ weight: 0.3, cat: 'DEFENSE', make: () => mk('RESTORE', 'Second Breath', 'Restore 30% HP and Mana', 1, 1) });
  if (ultUnlocked) out.push({ weight: 0.25, cat: 'MAGIC', make: () => mk('ULT_FILL', 'Surge of Fury', 'Fill your Ultimate meter', 2, 100) });
  if (aegisBiome !== biomeKey) out.push({ weight: 0.3 * (earlyMul?.[3] ?? 1), cat: 'DEFENSE', make: () => mk('AEGIS', 'Aegis', 'An 80 HP shield (absorbs damage until broken) · once per biome', 3, 80) });
  if (runCards.defianceTaken < DEFIANCE_MAX) {
    out.push({ weight: 0.2 * (earlyMul?.[3] ?? 1), cat: 'DEFENSE', make: () => mk('DEATH_DEFIANCE', 'Death Defiance', `When you would die, return with 50% HP instead (automatic). Charges ${runCards.defiance} → ${runCards.defiance + 1} (max ${DEFIANCE_MAX} per run)`, 3, 1) });
  }
  for (const s of SPECIALS) {
    if (runCards.taken[s.id]) continue;
    out.push({ weight: s.weight * (earlyMul?.[3] ?? 1), cat: SPECIAL_CAT[s.id] ?? 'UTILITY', make: (am) => { const t = am && Math.random() < 0.04 ? 4 : 3; const v = s.vals[t === 4 ? 1 : 0]; return mk('SPECIAL', s.name, s.fmt(v, t), t, v, s.id); } });
  }
  void multishotOk;
  return out;
}

// ------------------------------------------------------------- build trend --
/** (owner) Build categories: card offers lean toward what the hero has been picking this run. */
export type BuildCat = 'OFFENSE' | 'DEFENSE' | 'UTILITY' | 'MAGIC';
export const BUILD_CATS: BuildCat[] = ['OFFENSE', 'DEFENSE', 'UTILITY', 'MAGIC'];
export const BUILD_NAME: Record<BuildCat, string> = { OFFENSE: 'Offense', DEFENSE: 'Defense', UTILITY: 'Speed', MAGIC: 'Magic' };
const TYPE_CAT: Partial<Record<UpgradeType, BuildCat>> = {
  DAMAGE: 'OFFENSE', FIRE_RATE: 'OFFENSE', CRIT_RATE: 'OFFENSE', CRIT_DAMAGE: 'OFFENSE', MULTISHOT: 'OFFENSE', KNOCKBACK: 'OFFENSE',
  HEALTH: 'DEFENSE', DEFENSE: 'DEFENSE', DMG_REDUCE: 'DEFENSE', LIFESTEAL: 'DEFENSE', RESTORE: 'DEFENSE', AEGIS: 'DEFENSE', DEATH_DEFIANCE: 'DEFENSE',
  SPEED: 'UTILITY', DASH_COOLDOWN: 'UTILITY', COOLDOWN: 'UTILITY', POTION_CD: 'UTILITY',
  MAX_MANA: 'MAGIC', MANA_REGEN: 'MAGIC', ULT_FILL: 'MAGIC',
};
const SPECIAL_CAT: Partial<Record<SpecialId, BuildCat>> = {
  AFFLICT: 'OFFENSE', SUNDER: 'OFFENSE', SLAYER: 'OFFENSE', EXECUTE: 'OFFENSE', FIRST_STRIKE: 'OFFENSE', LINGER: 'OFFENSE',
  ALCHEMIST: 'DEFENSE', SECOND_WIND: 'DEFENSE', GUARDIAN: 'UTILITY', GOLD_RUSH: 'UTILITY',
};
/** Build category of a card (skill cards, if ever offered again, count as Magic). */
export const cardCat = (c: { type: UpgradeType; special?: SpecialId }): BuildCat =>
  (c.type === 'SPECIAL' ? (c.special ? SPECIAL_CAT[c.special] : undefined) : TYPE_CAT[c.type]) ?? (String(c.type).startsWith('SKILL_') ? 'MAGIC' : 'UTILITY');
export type TrendCounts = Record<BuildCat, number>;
/** Picks per category in this run (derived from the store's `runPicks`, so there is no second copy to keep in sync). */
export function trendCounts(picks: readonly { type: UpgradeType; special?: SpecialId }[]): TrendCounts {
  const t: TrendCounts = { OFFENSE: 0, DEFENSE: 0, UTILITY: 0, MAGIC: 0 };
  for (const p of picks) t[cardCat(p)]++;
  return t;
}
/** The category the hero leans on (a unique maximum with at least 1 pick), else null. */
export function trendLeader(t: TrendCounts): BuildCat | null {
  let best: BuildCat | null = null, bv = 0, tie = false;
  for (const c of BUILD_CATS) { if (t[c] > bv) { best = c; bv = t[c]; tie = false; } else if (t[c] === bv && bv > 0) tie = true; }
  return tie ? null : best;
}
/** +25% offer weight per pick of that category, capped at x2.5. */
export const TREND_STEP = 0.25, TREND_CAP = 2.5;
const trendMul = (t: TrendCounts | undefined, c: BuildCat): number => (t ? Math.min(TREND_CAP, 1 + TREND_STEP * t[c]) : 1);

// ------------------------------------------------------------ rarity tools --
/** Statted cards whose numbers scale with the tier (the ones Card Polish can raise). */
const statDef = (type: UpgradeType): StatDef | undefined => STATS.find((d) => d.type === type);
/** Highest tier this card can be raised to (0 = cannot be raised: its numbers do not depend on the rarity). */
function maxTierOf(c: Pick<Upgrade, 'type' | 'special'>): number {
  if (statDef(c.type)) return 4;
  if (c.type === 'SPECIAL') return 4;
  if (c.type === 'POTION_CD') return 3;
  return 0;
}
/** True when Card Polish can raise this card by one tier. */
export const canRarityUp = (c: Pick<Upgrade, 'type' | 'special' | 'tier'>): boolean => (c.tier ?? 0) < maxTierOf(c);
/** The same card one rarity tier higher (new numbers + description), or null when it cannot go higher. Mythic marks the run's Mythic as offered. */
export function rarityUpCard(c: Upgrade): Omit<Upgrade, 'id'> | null {
  if (!canRarityUp(c)) return null;
  const t = (c.tier ?? 0) + 1;
  let out: Omit<Upgrade, 'id'> | null = null;
  const d = statDef(c.type);
  if (d) out = mk(d.type, d.name, d.fmt(d.vals[t]), t, d.vals[t]);
  else if (c.type === 'POTION_CD') { const v = Math.min(POTION_CD_VALS[t], POTION_CD_CAP - runCards.potionCdCut); out = mk('POTION_CD', 'Quickdraw Flask', `-${pct(v)} Potion cooldown (${runCards.potionCdStacks + 1}/${POTION_CD_STACKS_MAX}, max -${pct(POTION_CD_CAP)} total)`, t, v); }
  else if (c.type === 'SPECIAL') { const s = SPECIALS.find((x) => x.id === c.special); if (s) { const v = s.vals[1]; out = mk('SPECIAL', s.name, s.fmt(v, 4), 4, v, s.id); } }
  if (out && out.tier === 4) runCards.mythicOffered = true;
  return out;
}

export interface RollOpts { trend?: TrendCounts; /** (owner) the run's first pick: 3 special cards, one Offense / Defense / Speed */ opener?: boolean; /** Lucky Start: make sure at least one offered card is Epic or better */ epic?: boolean }
/** Rolls `count` distinct cards. Marks the Mythic as offered (one per run) and Aegis as offered for this biome.
 *  Offer weights lean toward the build categories the hero picked from (x1.25 per pick, max x2.5), but the leading
 *  category never fills more than 2 of the 3-4 cards, so there is always variety. */
export function rollRunCards(count: number, ultUnlocked: boolean, biomeKey: string, opts: RollOpts = {}): Omit<Upgrade, 'id'>[] {
  earlyMul = EARLY_TIER_MUL[Number(biomeKey)] ?? null;
  const pool = candidates(ultUnlocked, true, biomeKey);
  const cards: Omit<Upgrade, 'id'>[] = [];
  if (opts.opener) {   // (owner) the first card choice of every run: one special per category
    for (const cat of ['OFFENSE', 'DEFENSE', 'UTILITY'] as const) {
      const opt = SPECIALS.filter((x) => !runCards.taken[x.id] && (SPECIAL_CAT[x.id] ?? 'UTILITY') === cat);
      const sp = opt[Math.floor(Math.random() * opt.length)];
      if (!sp) continue;
      const t = !runCards.mythicOffered && Math.random() < 0.04 ? 4 : 3, v = sp.vals[t === 4 ? 1 : 0];
      if (t === 4) runCards.mythicOffered = true;
      cards.push(mk('SPECIAL', sp.name, sp.fmt(v, t), t, v, sp.id));
    }
    if (cards.length === 3) return cards;
    cards.length = 0;
  }
  const lead = opts.trend ? trendLeader(opts.trend) : null, leadCap = 2;   // (owner: at most 2 cards of the leading category; with 2 cards on offer that is no cap, the lean is the weight)
  let leadN = 0;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const capped = lead && leadN >= leadCap && pool.some((e) => e.cat !== lead);   // leader is full: roll among the others
    let tot = 0; for (const e of pool) tot += (capped && e.cat === lead ? 0 : e.weight * trendMul(opts.trend, e.cat));
    let r = Math.random() * tot, idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= (capped && pool[idx].cat === lead ? 0 : pool[idx].weight * trendMul(opts.trend, pool[idx].cat)); if (r <= 0) break; }
    const e = pool.splice(idx, 1)[0];
    const c = e.make(!runCards.mythicOffered);
    if (c.tier === 4) runCards.mythicOffered = true;
    if (c.type === 'AEGIS') aegisBiome = biomeKey;
    if (lead && e.cat === lead) leadN++;
    cards.push(c);
  }
  if (opts.epic && cards.length > 0 && !cards.some((c) => (c.tier ?? 0) >= 2)) {   // Lucky Start: raise a card (or swap in a stat card) to Epic
    const up = cards.map((c, i) => ({ c, i })).filter((x) => maxTierOf(x.c as Upgrade) >= 2);
    if (up.length) {
      const pick = up[Math.floor(Math.random() * up.length)];
      const tmp = { ...pick.c, id: '' } as Upgrade;
      let n: Omit<Upgrade, 'id'> | null = tmp;
      while (n && (n.tier ?? 0) < 2) n = rarityUpCard({ ...n, id: '' });
      if (n) cards[pick.i] = n;
    } else {
      const d = STATS[Math.floor(Math.random() * STATS.length)];
      cards[0] = mk(d.type, d.name, d.fmt(d.vals[2]), 2, d.vals[2]);
    }
  }
  return cards;
}

/** Applies the engine-side part of a picked card (the store applies the stat part). Returns true when handled here. */
export function takeRunCard(u: Upgrade): boolean {
  const r = runCards, v = u.value;
  if (u.type === 'DASH_COOLDOWN') { r.dashStacks = Math.min(DASH_CARD_MAX, r.dashStacks + 1); return true; }
  if (u.type === 'POTION_CD') { r.potionCdStacks = Math.min(POTION_CD_STACKS_MAX, r.potionCdStacks + 1); r.potionCdCut = Math.min(POTION_CD_CAP, r.potionCdCut + v); return true; }
  if (u.type === 'DEATH_DEFIANCE') { if (r.defianceTaken < DEFIANCE_MAX) { r.defianceTaken++; r.defiance++; } return true; }
  if (u.type !== 'SPECIAL' || !u.special) return false;
  if (r.taken[u.special]) return true;
  r.taken[u.special] = true;
  const t = u.tier ?? 3;
  switch (u.special) {
    case 'AFFLICT': r.afflict = v; break;
    case 'SUNDER': r.sunder = v; break;
    case 'GUARDIAN': r.guardian = 1 + (t >= 4 ? 1 : 0); break;
    case 'SLAYER': r.slayer = v; break;
    case 'ALCHEMIST': r.potionBonus = v; r.regenCap = t >= 4 ? 0.9 : 0.85; break;
    case 'EXECUTE': r.execute = v; break;
    case 'FIRST_STRIKE': r.firstStrike = v; break;
    case 'SECOND_WIND': r.secondWind = v; break;
    case 'LINGER': r.linger = v; break;
    case 'GOLD_RUSH': break;   // +gold is a stat (goldFind), applied by the store
  }
  r.anyDmg = r.afflict > 0 || r.slayer > 0 || r.execute > 0 || r.firstStrike > 0;
  return true;
}
