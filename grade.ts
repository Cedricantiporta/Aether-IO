// ============================================================================
// Item grade (owner 2026-10-21): every gear piece is LOW or HIGH grade inside its rarity tier ("Low Epic" / "High Epic").
// HIGH = base stats x GRADE_HIGH_MUL, ~22% of drops. Stored on the item (`item.grade`); gear without it (old saves, shop
// copies) counts as LOW. Also: the one-time rescale of old-ladder gear in saves (migrateGear). Pure; no store import.
// ============================================================================
import type { Item, ItemGrade, PlayerStats, Rarity } from './types';
import { GENERATED_ITEMS, TIER_REL, OLD_TIER_REL } from './itemCatalog';

export const GRADE_HIGH_MUL = 1.35, GRADE_HIGH_CHANCE = 0.22;
const RIDX: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const GEAR = new Set<string>(['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY']);
/** stats that are not part of the tier ladder (archer bow reach is its own per-rarity table) */
const FIXED_STATS = new Set<string>(['attackRange']);

/** (owner 2026-10-24) only Epic / Legendary / Mythic gear has a Low / High grade; Common, Uncommon and Rare have none. */
const GRADED_RARITY = new Set<string>(['EPIC', 'LEGENDARY', 'MYTHIC']);
export const isGraded = (i: Item): boolean => GEAR.has(i.type) && GRADED_RARITY.has(i.rarity);
export const gradeOf = (i: Item): ItemGrade => (i.grade === 'HIGH' && isGraded(i) ? 'HIGH' : 'LOW');
const cap = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
/** "High Epic" / "Low Rare" */
export const gradeLabel = (i: Item): string => (isGraded(i) ? `${gradeOf(i) === 'HIGH' ? 'High' : 'Low'} ${cap(i.rarity)}` : cap(i.rarity));

const roundStat = (v: number): number => (Math.abs(v) >= 10 ? Math.round(v) : parseFloat(v.toFixed(3)));
function scaleStats(i: Item, f: number): void {
  for (const k of Object.keys(i.stats) as (keyof PlayerStats)[]) {
    const v = i.stats[k];
    if (v === undefined || FIXED_STATS.has(k)) continue;
    i.stats[k] = roundStat(v * f);
  }
}

/** Rolls the grade of a freshly made gear piece IN PLACE (stats are scaled for HIGH). `force` fixes it (starter gear = LOW). */
export function rollGrade(i: Item, rng: () => number = Math.random, chance = GRADE_HIGH_CHANCE, force?: ItemGrade): Item {
  if (!isGraded(i)) return i;
  const high = force ? force === 'HIGH' : rng() < chance;
  i.grade = high ? 'HIGH' : 'LOW';
  if (high) { scaleStats(i, GRADE_HIGH_MUL); i.price = Math.round(i.price * 1.25); }
  return i;
}

/** Save migration (idempotent: stamps `grade`, so a migrated piece is never rescaled again). Generated-catalog gear that
 *  has no grade yet was made on the old tier ladder: its stats are multiplied by new/old for its rarity (attackRange and
 *  the old hand-written retired pieces are left alone). Any other gear without a grade just becomes LOW. */
const GEN_NAMES = new Set(GENERATED_ITEMS.filter((t) => GEAR.has(t.type)).map((t) => t.name));
export const GEAR_RESCALE: Record<Rarity, number> = Object.fromEntries((Object.keys(RIDX) as Rarity[]).map((r) => [r, TIER_REL[RIDX[r]] / OLD_TIER_REL[RIDX[r]]])) as Record<Rarity, number>;
export function migrateGear<T extends Item | null | undefined>(it: T): T {
  if (!it || !GEAR.has(it.type) || it.grade) return it;
  const out = { ...it, stats: { ...it.stats }, grade: 'LOW' as ItemGrade };
  if (GEN_NAMES.has(it.name)) scaleStats(out, GEAR_RESCALE[it.rarity] ?? 1);
  return out as T;
}
