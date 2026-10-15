// ============================================================================
// Reforging the blue bonus lines (affixes) of gear at the Blacksmith (Blacksmith > Reforge):
//   Reforge Stone  - rerolls every bonus line (new lines, new values; same count)
//   Tempering Oil  - rerolls only the values of the lines (keeps which stats they are; better odds of a perfect roll)
//   Erasure Scroll - deletes one chosen bonus line
// A "perfect" roll (yellow in tooltips) is a line at 125% of its tier value (affixes.ts PERFECT_*).
// Pure helpers; the store applies them (store.reforgeItem). Sources: Gem Shop, the run merchant, boss chests.
// ============================================================================
import type { Item } from './types';
import { rollAffixList, rollAffixValue, canHaveAffixes, UNIQUE_BY_KEY } from './affixes';

export type ReforgeMode = 'REROLL' | 'TEMPER' | 'ERASE';
export const REFORGE_ITEM: Record<ReforgeMode, { id: string; name: string }> = {
  REROLL: { id: 'reforge_stone', name: 'Reforge Stone' },
  TEMPER: { id: 'temper_oil', name: 'Tempering Oil' },
  ERASE: { id: 'erase_scroll', name: 'Erasure Scroll' },
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
  if (line < 0 || line >= cur.length) return null;
  return { ...item, affixes: cur.filter((_, i) => i !== line) };
}
