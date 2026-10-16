// ============================================================================
// Reforging the blue bonus lines (affixes) of gear at the Blacksmith (Blacksmith > Reforge):
//   Reforge Stone  - rerolls every bonus line (new lines, new values; same count)
//   Tempering Oil  - rerolls only the values of the lines (keeps which stats they are; better odds of a perfect roll)
//   Erasure Scroll - deletes one chosen bonus line
// A "perfect" roll (yellow in tooltips) is a line at 125% of its tier value (affixes.ts PERFECT_*).
// Pure helpers; the store applies them (store.reforgeItem). Sources: Gem Shop, the run merchant, boss chests.
// ============================================================================
import type { Item } from './types';
import { rollAffixList, rollAffixValue, canHaveAffixes, UNIQUE_BY_KEY, AFFIX_COUNT, AFFIXES, R_IDX } from './affixes';

/** Bonus line slots of an item by rarity (blue 1, purple 2, gold 3, mythic 4; Mythic uniques ride on top). */
export const affixSlots = (item: Item): number => (canHaveAffixes(item) ? AFFIX_COUNT[item.rarity] : 0);
/** Empty bonus line slots (lines erased): an Augment Rune fills one. */
export const emptyAffixSlots = (item: Item): number => Math.max(0, affixSlots(item) - (item.affixes ?? []).filter((a) => !UNIQUE_BY_KEY[a.key]).length);

export type ReforgeMode = 'REROLL' | 'TEMPER' | 'ERASE' | 'ADD';
export const REFORGE_ITEM: Record<ReforgeMode, { id: string; name: string }> = {
  REROLL: { id: 'reforge_stone', name: 'Reforge Stone' },
  TEMPER: { id: 'temper_oil', name: 'Tempering Oil' },
  ERASE: { id: 'erase_scroll', name: 'Erasure Scroll' },
  ADD: { id: 'augment_rune', name: 'Augment Rune' },
};
export const REFORGE_IDS = new Set(Object.values(REFORGE_ITEM).map((r) => r.id));

/** The reforged copy of `item` (null when the mode does not apply). `line` = the bonus line to erase. */
export function reforge(item: Item, mode: ReforgeMode, line = -1, rng: () => number = Math.random): Item | null {
  if (!canHaveAffixes(item)) return null;
  const cur = item.affixes ?? [];
  if (mode === 'REROLL') {
    if (item.rarity === 'COMMON') return null;
    const keepUnique = cur.filter((a) => UNIQUE_BY_KEY[a.key]);
    const fresh = rollAffixList(item.rarity, rng).filter((a) => !UNIQUE_BY_KEY[a.key]);
    return { ...item, affixes: [...fresh, ...keepUnique] };
  }
  if (mode === 'TEMPER') {
    if (!cur.some((a) => !UNIQUE_BY_KEY[a.key])) return null;
    return { ...item, affixes: cur.map((a) => (UNIQUE_BY_KEY[a.key] ? a : rollAffixValue(a.key, item.rarity, rng, 2))) };
  }
  if (mode === 'ADD') {   // fill one empty slot with a new random line (a stat the item does not have yet)
    if (emptyAffixSlots(item) <= 0) return null;
    const pool = AFFIXES.filter((d) => d.weight > 0 && (!d.minRarity || R_IDX[item.rarity] >= R_IDX[d.minRarity]) && !cur.some((a) => a.key === d.key));
    if (!pool.length) return null;
    let total = 0; for (const d of pool) total += d.weight;
    let r = rng() * total, k = 0; for (; k < pool.length - 1; k++) { r -= pool[k].weight; if (r <= 0) break; }
    return { ...item, affixes: [...cur, rollAffixValue(pool[k].key, item.rarity, rng)] };
  }
  if (line < 0 || line >= cur.length) return null;
  return { ...item, affixes: cur.filter((_, i) => i !== line) };
}
