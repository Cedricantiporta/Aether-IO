// ============================================================================
// Reforging the blue bonus lines (affixes) of gear at the Blacksmith (Blacksmith > Reforge):
//   (owner 2026-10-25 redesign)
//   Reforge Stone  - rerolls VALUES only, the stat types stay (Crit DMG 1% -> Crit DMG 2%): one chosen line, or all lines at once
//   Tempering Oil  - rerolls the TYPES of all lines at once (new stats, fresh values: Crit Rate / ATK / Crit DMG -> Crit DMG / ATK Speed / ATK)
//   Binding Seal   - locks one bonus line (lock persists on the item; the all-lines Stone and the Oil skip locked lines; at most lines-1 locks; unlocking is free)
//   Augment Rune   - fills an empty bonus slot (old saves: lines erased before the Erasure Scroll was retired)
// A "perfect" roll (yellow in tooltips) is a line at 125% of its tier value (affixes.ts PERFECT_*).
// Pure helpers; the store applies them (store.reforgeItem). Sources: Gem Shop, the run merchant, boss chests.
// ============================================================================
import type { Item } from './types';
import { rollAffixList, rollAffixValue, rollAffixAtQuality, affixQuality, canHaveAffixes, affixAllowed, UNIQUE_BY_KEY, AFFIX_COUNT, AFFIXES, R_IDX } from './affixes';

/** Bonus line slots of an item by rarity (blue 1, purple 2, gold 3, mythic 4; Mythic uniques ride on top). */
export const affixSlots = (item: Item): number => (canHaveAffixes(item) ? AFFIX_COUNT[item.rarity] : 0);
/** Empty bonus line slots (lines erased): an Augment Rune fills one. */
export const emptyAffixSlots = (item: Item): number => Math.max(0, affixSlots(item) - (item.affixes ?? []).filter((a) => !UNIQUE_BY_KEY[a.key]).length);

/** Locked bonus lines (Binding Seal). */
export const lockedCount = (item: Item): number => (item.affixes ?? []).filter((a) => a.locked && !UNIQUE_BY_KEY[a.key]).length;
/** Most lines that may be locked at once: all rerollable lines but one. */
export const maxLocks = (item: Item): number => Math.max(0, (item.affixes ?? []).filter((a) => !UNIQUE_BY_KEY[a.key]).length - 1);

export type ReforgeMode = 'VALUE' | 'TEMPER' | 'ADD' | 'SEAL' | 'UNSEAL';
/** UNSEAL (take a lock off a line) needs no tool. */
export const REFORGE_ITEM: Record<Exclude<ReforgeMode, 'UNSEAL'>, { id: string; name: string }> = {
  SEAL: { id: 'binding_seal', name: 'Binding Seal' },
  VALUE: { id: 'reforge_stone', name: 'Reforge Stone' },   // (values: one line or all lines)
  TEMPER: { id: 'temper_oil', name: 'Tempering Oil' },     // (types: all lines)
  ADD: { id: 'augment_rune', name: 'Augment Rune' },
};
export const REFORGE_IDS = new Set(Object.values(REFORGE_ITEM).map((r) => r.id));

/** The reforged copy of `item` (null when the mode does not apply). VALUE: `line` = one line (-1 = every unsealed line). */
export function reforge(item: Item, mode: ReforgeMode, line = -1, rng: () => number = Math.random): Item | null {
  if (!canHaveAffixes(item)) return null;
  const cur = item.affixes ?? [];
  const isFree = (a: { key: string; locked?: boolean }) => !UNIQUE_BY_KEY[a.key] && !a.locked;   // a line a stone / oil may touch
  if (mode === 'VALUE') {   // same stat, new value
    const one = line >= 0;
    if (one && (line >= cur.length || UNIQUE_BY_KEY[cur[line].key])) return null;
    if (!one && !cur.some(isFree)) return null;
    const out = cur.map((a, i) => {
      if (one ? i !== line : !isFree(a)) return a;
      const v = rollAffixValue(a.key, item.rarity, rng);
      return a.locked ? { ...v, locked: true } : v;
    });
    return { ...item, affixes: out };
  }
  if (mode === 'TEMPER') {   // every unsealed line becomes a new stat type (fresh value)
    if (item.rarity === 'COMMON' || !cur.some(isFree)) return null;
    const kept = cur.filter((a) => !isFree(a));
    const need = cur.filter(isFree).length;
    const fresh = rollAffixList(item.rarity, rng, item.type, kept.map((a) => a.key), need).filter((a) => !UNIQUE_BY_KEY[a.key]);
    let n = 0;
    const lines = cur.map((a) => (isFree(a) && n < fresh.length ? fresh[n++] : a));
    return { ...item, affixes: lines };
  }
  if (mode === 'SEAL' || mode === 'UNSEAL') {
    const a = cur[line];
    if (!a || UNIQUE_BY_KEY[a.key]) return null;
    if (mode === 'SEAL') { if (a.locked || lockedCount(item) >= maxLocks(item)) return null; }
    else if (!a.locked) return null;
    return { ...item, affixes: cur.map((x, i) => (i === line ? (mode === 'SEAL' ? { ...x, locked: true } : { key: x.key, value: x.value, ...(x.perfect ? { perfect: true } : {}) }) : x)) };
  }
  // a new random line: a stat the item does not have yet (besides the one being replaced)
  const fresh = (skip: number) => {
    const pool = AFFIXES.filter((d) => d.weight > 0 && affixAllowed(d, item.type) && (!d.minRarity || R_IDX[item.rarity] >= R_IDX[d.minRarity]) && !cur.some((a, i) => i !== skip && a.key === d.key));
    if (!pool.length) return null;
    let total = 0; for (const d of pool) total += d.weight;
    let r = rng() * total, k = 0; for (; k < pool.length - 1; k++) { r -= pool[k].weight; if (r <= 0) break; }
    return rollAffixValue(pool[k].key, item.rarity, rng);
  };
  if (mode === 'ADD') {   // fill one empty slot
    if (emptyAffixSlots(item) <= 0) return null;
    const a = fresh(-1);
    return a ? { ...item, affixes: [...cur, a] } : null;
  }
  return null;
}
