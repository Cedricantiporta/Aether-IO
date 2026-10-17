// Enhanced-gear glow (Cabal-style "+N effect"): hero only. Pure helpers; Hero.tsx applies them per frame with no allocations.
import { Color } from 'three';
import { MAX_ITEM_LEVEL } from '../ui/lib/game';
import { RARITY_ACCENT, RARITY_TIER } from './weapons';
import type { Item } from '../types';

export const GLOW_MIN_PLUS = 7;
export const MAX_PLUS = MAX_ITEM_LEVEL - 1;   // item.level 1 = +0
export const WEAR_SLOTS = ['helmet', 'armor', 'gloves', 'boots'] as const;
export const plusOf = (it?: Item | null): number => (it && it.level > 1 ? it.level - 1 : 0);

/** 0 below +7; +7 subtle (0.3), rising to 1 (full aura) at the max level. */
export const glowAmt = (plus: number): number => {
  if (plus < GLOW_MIN_PLUS) return 0;
  if (plus >= MAX_PLUS) return 1;
  return 0.3 + 0.5 * (plus - GLOW_MIN_PLUS) / Math.max(1, MAX_PLUS - GLOW_MIN_PLUS);
};

/** Primitive "RARITY:plus" per slot, so a store selector returns a stable string (re-renders only when it changes). */
export const glowKeyOf = (it?: Item | null): string => (it ? `${it.rarity}:${plusOf(it)}` : '');
export const parseGlowKey = (k: string): { rarity: string; plus: number } | null => {
  if (!k) return null; const [rarity, p] = k.split(':'); return { rarity, plus: +p || 0 };
};
export const glowColor = (rarity: string): Color => new Color(RARITY_ACCENT[rarity] || RARITY_ACCENT.COMMON);

/** Strongest enhanced piece among the keys (colour for the aura sparkles). */
export function bestGlow(keys: string[]): { amt: number; color: string } {
  let amt = 0, tier = -1, color = RARITY_ACCENT.COMMON;
  for (const k of keys) {
    const g = parseGlowKey(k); if (!g) continue;
    const a = glowAmt(g.plus); if (a <= 0) continue;
    const t = RARITY_TIER[g.rarity] ?? 0;
    if (a > amt || (a === amt && t > tier)) { amt = a; tier = t; color = RARITY_ACCENT[g.rarity] || color; }
  }
  return { amt, color };
}
