// ============================================================================
// Gear affixes: random bonus lines rolled on drop / craft / summon / gift.
// COMMON 0, RARE 1, EPIC 2, LEGENDARY 3, MYTHIC 4 (+ maybe a unique on MYTHIC).
// Pure data + math (no store import).
// ============================================================================
import type { Item, ItemAffix, Rarity } from './types';
import type { StatFx } from './statFx';
import { fmtFx } from './statFx';

export const AFFIX_COUNT: Record<Rarity, number> = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
export const R_IDX: Record<Rarity, number> = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
export const UNIQUE_CHANCE = 0.4; // MYTHIC only
/** A perfect bonus line (yellow): rolled at 125% of its tier value. */
export const PERFECT_CHANCE = 0.05, PERFECT_MUL = 1.25;

export interface AffixDef {
  key: string;
  label: string;                 // "{v} Damage"
  stat: keyof import('./types').PlayerStats;
  mul?: boolean;                 // multiplicative (percent) vs additive
  tiers: number[];               // value by rarity index (COMMON..MYTHIC); COMMON unused for rolling
  weight: number;
  minRarity?: Rarity;
  cp: number;                    // combat-power weight per unit
  fixed?: boolean;               // value is not rolled (+/-15%)
}

export const AFFIXES: AffixDef[] = [
  { key: 'dmg',   label: 'Damage',            stat: 'damage',          mul: true, tiers: [0, .04, .06, .09, .12], weight: 10, cp: 600 },
  { key: 'aspd',  label: 'Attack Speed',      stat: 'fireRate',        mul: true, tiers: [0, .04, .06, .08, .11], weight: 9, cp: 400 },
  { key: 'crit',  label: 'Crit Rate',         stat: 'critRate',        tiers: [0, .02, .03, .045, .06], weight: 9, cp: 500 },
  { key: 'critd', label: 'Crit Damage',       stat: 'critDamage',      tiers: [0, .1, .15, .22, .3], weight: 9, cp: 100 },
  { key: 'hp',    label: 'Max Health',        stat: 'maxHealth',       mul: true, tiers: [0, .04, .06, .09, .12], weight: 9, cp: 300 },
  { key: 'def',   label: 'Defense',           stat: 'defense',         tiers: [0, 2, 4, 7, 11], weight: 8, cp: 8 },
  { key: 'move',  label: 'Move Speed',        stat: 'moveSpeed',       mul: true, tiers: [0, .03, .04, .06, .08], weight: 7, cp: 300 },
  { key: 'skill', label: 'Skill Damage',      stat: 'skillDamage',     tiers: [0, .05, .08, .12, .17], weight: 8, cp: 100 },
  { key: 'cdr',   label: 'Cooldown Reduction', stat: 'cooldownReduction', tiers: [0, .02, .03, .045, .06], weight: 6, cp: 500 },
  { key: 'steal', label: 'Life Steal',        stat: 'lifeSteal',       tiers: [0, .005, .008, .012, .016], weight: 5, cp: 3000 },
  { key: 'thorn', label: 'Thorns',            stat: 'thorns',          tiers: [0, 5, 9, 15, 24], weight: 5, cp: 8 },
  { key: 'gold',  label: 'Gold Find',         stat: 'goldFind',        tiers: [0, .05, .08, .12, .17], weight: 6, cp: 200 },
  { key: 'xp',    label: 'XP Gain',           stat: 'xpBonus',         tiers: [0, .04, .06, .09, .12], weight: 6, cp: 200 },
  { key: 'mag',   label: 'Pickup Range',      stat: 'magnetRadius',    tiers: [0, .8, 1.2, 1.8, 2.5], weight: 5, cp: 20 },
  { key: 'burn',  label: 'Burn on Hit',       stat: 'onHitBurnChance', tiers: [0, .04, .06, .08, .11], weight: 4, cp: 300 },
  { key: 'slow',  label: 'Slow on Hit',       stat: 'onHitSlowChance', tiers: [0, .05, .08, .11, .15], weight: 4, cp: 300 },
  { key: 'range', label: 'Attack Range',      stat: 'attackRange',     tiers: [0, .6, 1, 1.5, 2.2], weight: 4, cp: 120 },
  { key: 'pierce', label: 'Projectile Pierce', stat: 'pierceBonus',    tiers: [0, 1, 1, 1, 2], weight: 1.6, cp: 150, fixed: true },
  { key: 'proj',  label: 'Projectile',        stat: 'multishot',       tiers: [0, 1, 1, 1, 1], weight: 0,  // retired: extra projectiles come from weapon perks (weaponPerks.ts)
    minRarity: 'EPIC', cp: 200, fixed: true },
];
export const AFFIX_BY_KEY: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.key, a]));

/** Unique lines: fixed values, only on MYTHIC gear. */
export const UNIQUES: { key: string; label: string; stat: AffixDef['stat']; value: number; text: string }[] = [
  { key: 'u_haste', label: 'Bloodrush', stat: 'lowHpHaste', value: 0.3, text: '+30% attack speed below 50% HP' },
  { key: 'u_hawk', label: 'Falcon Heart', stat: 'hawkBonus', value: 3, text: "Storm of a Thousand Arrows lasts +3s" },
  { key: 'u_proc', label: 'Resonance', stat: 'procHaste', value: 1, text: 'On-attack procs need 1 fewer attack' },
  { key: 'u_dash', label: 'Wind Walker', stat: 'dodge', value: 0.08, text: '+8% dodge' },   // (dashes no longer stack)
  { key: 'u_echo', label: 'Echoing', stat: 'echoEvery', value: 7, text: 'Every 7th attack fires twice' },
];
export const UNIQUE_BY_KEY: Record<string, typeof UNIQUES[number]> = Object.fromEntries(UNIQUES.map((u) => [u.key, u]));

export const isUnique = (a: ItemAffix): boolean => a.key.startsWith('u_');

/** Stat effect of one affix line. */
export function affixFx(a: ItemAffix): StatFx | undefined {
  const u = UNIQUE_BY_KEY[a.key];
  if (u) return { add: { [u.stat]: u.value } };
  const d = AFFIX_BY_KEY[a.key];
  if (!d) return undefined;
  return d.mul ? { mul: { [d.stat]: a.value } } : { add: { [d.stat]: a.value } };
}

/** "+6% Damage" style line for tooltips. */
export function affixText(a: ItemAffix): string {
  const u = UNIQUE_BY_KEY[a.key];
  if (u) return `${u.label}: ${u.text}`;
  const d = AFFIX_BY_KEY[a.key];
  if (!d) return a.key;
  if (d.key === 'proj') return '+1 Projectile';
  if (d.key === 'pierce') return `+${a.value} Projectile Pierce`;
  return `${fmtFx(d.stat, a.value, !!d.mul)} ${d.label}`;
}

/** Combat power added by an item's affixes (before the rarity multiplier). */
export function affixCP(item: Item): number {
  if (!item.affixes) return 0;
  let cp = 0;
  for (const a of item.affixes) cp += (UNIQUE_BY_KEY[a.key] ? 400 : (AFFIX_BY_KEY[a.key]?.cp ?? 0) * a.value);
  return cp;
}

const round = (v: number): number => parseFloat(v.toFixed(3));

/** One bonus line's value for a rarity: 85-115% of the tier value, or (PERFECT_CHANCE x `luck`) a perfect 125% line. */
export function rollAffixValue(key: string, rarity: Rarity, rng: () => number = Math.random, luck = 1): ItemAffix {
  const d = AFFIX_BY_KEY[key], base = d ? d.tiers[R_IDX[rarity]] : 0;
  if (!d || d.fixed) return { key, value: base };
  if (rng() < PERFECT_CHANCE * luck) return { key, value: round(base * PERFECT_MUL), perfect: true };
  return { key, value: round(base * (0.85 + rng() * 0.3)) };
}

/** Rolls `count` distinct affixes for a rarity. `rng` injectable for tests. */
export function rollAffixList(rarity: Rarity, rng: () => number = Math.random): ItemAffix[] {
  const n = AFFIX_COUNT[rarity];
  const ri = R_IDX[rarity];
  const pool = AFFIXES.filter((d) => d.weight > 0 && (!d.minRarity || R_IDX[rarity] >= R_IDX[d.minRarity]));
  const out: ItemAffix[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    let total = 0;
    for (const d of pool) total += d.weight;
    let r = rng() * total, idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= pool[idx].weight; if (r <= 0) break; }
    const d = pool.splice(idx, 1)[0];
    out.push(rollAffixValue(d.key, rarity, rng));
  }
  if (rarity === 'MYTHIC' && rng() < UNIQUE_CHANCE) {
    const u = UNIQUES[Math.floor(rng() * UNIQUES.length)];
    out.push({ key: u.key, value: u.value });
  }
  return out;
}

const GEAR = new Set<string>(['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY']);
export const canHaveAffixes = (item: Item): boolean => GEAR.has(item.type);

/** Rolls affixes onto a gear item in place (no-op for COMMON / non-gear). Bumps the sell price. */
export function rollAffixes(item: Item, rng: () => number = Math.random): Item {
  if (!canHaveAffixes(item)) return item;
  const list = rollAffixList(item.rarity, rng);
  if (list.length) {
    item.affixes = list;
    item.price = Math.round(item.price * (1 + 0.12 * list.length));
  } else delete item.affixes;
  return item;
}
