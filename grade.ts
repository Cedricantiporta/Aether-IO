// ============================================================================
// Item grade (owner 2026-10-25): EVERY gear piece rolls LOW / MID / HIGH inside its rarity tier ("Low Epic", "Mid Rare",
// "High Common"). The catalog template is the MID value; LOW = x0.85, HIGH = x1.15 (GRADE_MUL). Stored on the item
// (`item.grade`); gear without it (shop copies, very old saves) counts as MID. Also: the one-time rescale of pre-ladder gear
// in saves (migrateGear). Pure; no store import.
// ============================================================================
import type { Item, ItemGrade, PlayerStats, Rarity } from './types';
import { GENERATED_ITEMS, TIER_REL, OLD_TIER_REL } from './itemCatalog';
import { PICKAXE_ID } from './itemClass';

export const GRADE_MUL: Record<ItemGrade, number> = { LOW: 0.85, MID: 1, HIGH: 1.15 };
/** price factor per grade (a High piece sells / costs a bit more) */
const GRADE_PRICE: Record<ItemGrade, number> = { LOW: 0.9, MID: 1, HIGH: 1.1 };
/** chance of LOW and HIGH (the rest is MID): drops / summons / fusion, and crafting (better odds of High) */
export interface GradeOdds { low: number; high: number }
export const GRADE_DROP_ODDS: GradeOdds = { low: 0.3, high: 0.18 };
export const GRADE_CRAFT_ODDS: GradeOdds = { low: 0.12, high: 0.3 };
const RIDX: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const GEAR = new Set<string>(['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY']);
/** stats that are not part of the tier ladder (archer bow reach is its own per-rarity table) */
const FIXED_STATS = new Set<string>(['attackRange']);

/** every gear piece has a grade, except the fixed-stat Mining Pickaxe */
export const isGraded = (i: Item): boolean => GEAR.has(i.type) && i.id !== PICKAXE_ID;
export const gradeOf = (i: Item): ItemGrade => (i.grade === 'HIGH' || i.grade === 'LOW' ? i.grade : 'MID');
const cap = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
const GRADE_WORD: Record<ItemGrade, string> = { LOW: 'Low', MID: 'Mid', HIGH: 'High' };
/** "High Epic" / "Mid Rare" */
export const gradeLabel = (i: Item): string => (isGraded(i) ? `${GRADE_WORD[gradeOf(i)]} ${cap(i.rarity)}` : cap(i.rarity));

const roundStat = (v: number): number => (Math.abs(v) >= 10 ? Math.round(v) : parseFloat(v.toFixed(3)));
function scaleStats(i: Item, f: number): void {
  for (const k of Object.keys(i.stats) as (keyof PlayerStats)[]) {
    const v = i.stats[k];
    if (v === undefined || FIXED_STATS.has(k)) continue;
    i.stats[k] = roundStat(v * f);
  }
}

/** Rolls the grade of a freshly made gear piece IN PLACE (the stats given are the MID value; LOW / HIGH scale them).
 *  `force` fixes it (starter gear = MID). */
export function rollGrade(i: Item, rng: () => number = Math.random, odds: GradeOdds = GRADE_DROP_ODDS, force?: ItemGrade): Item {
  if (!isGraded(i)) return i;
  const r = rng();
  const g: ItemGrade = force ?? (r < odds.low ? 'LOW' : r < odds.low + odds.high ? 'HIGH' : 'MID');
  i.grade = g;
  if (g !== 'MID') { scaleStats(i, GRADE_MUL[g]); i.price = Math.round(i.price * GRADE_PRICE[g]); }
  return i;
}

/** Save migration (idempotent: stamps `grade`, so a migrated piece is never rescaled again). Generated-catalog gear that
 *  has no grade yet was made on the pre-2026-10-21 ladder: its stats are multiplied by new/old for its rarity (attackRange and
 *  the old hand-written retired pieces are left alone) and it becomes MID. Any other gear without a grade just becomes MID.
 *  Gear stamped LOW under the 2-grade system (2026-10-21..25) keeps its stored stats and is relabelled MID (`legacyLowToMid`,
 *  run once per save through the `grade3` flag in store.ts). */
const GEN_NAMES = new Set(GENERATED_ITEMS.filter((t) => GEAR.has(t.type)).map((t) => t.name));
export const GEAR_RESCALE: Record<Rarity, number> = Object.fromEntries((Object.keys(RIDX) as Rarity[]).map((r) => [r, TIER_REL[RIDX[r]] / OLD_TIER_REL[RIDX[r]]])) as Record<Rarity, number>;
export function migrateGear<T extends Item | null | undefined>(it: T): T {
  if (!it || !GEAR.has(it.type) || it.grade) return it;
  const out = { ...it, stats: { ...it.stats }, grade: 'MID' as ItemGrade };
  if (GEN_NAMES.has(it.name)) scaleStats(out, GEAR_RESCALE[it.rarity] ?? 1);
  return out as T;
}

/** One-time relabel of the old 2-grade system: its LOW was the plain tier value, which is the new MID. HIGH stays HIGH. */
export function legacyLowToMid<T extends Item | null | undefined>(it: T): T {
  return it && GEAR.has(it.type) && it.grade === 'LOW' ? ({ ...it, grade: 'MID' } as T) : it;
}
