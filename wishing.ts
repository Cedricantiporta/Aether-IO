// ============================================================================
// Wishing Fountain (owner 2026-10-31): once per real day the hero tosses a coin into the plaza fountain and gets ONE random
// Luck buff. Pure data + helpers (no store import). Runtime pieces: engine/systems/wishing.ts (effects / animation),
// store.makeWish / store.wishUse (save in progress.wish, per character), render/PlazaFountain (coin + sparkles),
// ui/screens/WishWindow.tsx (result popup) and ui/hud/WishChips.tsx (HUD chips).
//
// BUFF TABLE (each buff has target activities; a target is used up by its own duration measure):
//   Fortune's Favour  RUN   +20% rarity weight shift on kill drops (never past the biome's rarity cap)   next run started
//   Golden Touch      RUN   +20% gold from coins                                                          next run started
//   Fisher's Fortune  FISH  reel zone +25%, rarer fish odds x1.25                                         next 6 hooked fish
//   Miner's Mercy     MINE  +12% crystal chance and +40% ore / trade-good chance per vein                 next crystal-cave trip (that mines)
//   Smith's Blessing  CRAFT great-success chance +50%, bonus-line Perfect odds x1.25                      next 5 crafts
//   Lucky Charm       all   small bonus to everything (loot +10%, gold +10%, zone +12%, crystal +6%, ...)  each target on its own measure
//   Jackpot           all   roughly double Lucky Charm + a bit more                                      each target on its own measure
// One wish per day; the buff lasts until used but ENDS at the next day's reset (day key of the wish != today = expired),
// so a new wish is always possible the next day. One buff at a time per activity (a day only ever has one wish).
// ============================================================================
import type { Rarity } from './types';

export type WishTarget = 'RUN' | 'FISH' | 'MINE' | 'CRAFT';
export type WishId = 'FORTUNE' | 'GOLDEN' | 'FISHER' | 'MINER' | 'SMITH' | 'CHARM' | 'JACKPOT';
/** Effect numbers of one target (only the keys of that target are read). */
export interface WishFx { loot?: number; gold?: number; reelZone?: number; fishLuck?: number; crystal?: number; ore?: number; great?: number; perfect?: number }
export interface WishDef { id: WishId; name: string; tier: Rarity; weight: number; color: string; blurb: string; fx: Partial<Record<WishTarget, WishFx>> }

/** How long each target lasts (the duration measure). */
export const WISH_TARGET: Record<WishTarget, { label: string; when: string; n: number }> = {
  RUN: { label: 'Next run', when: 'until your next run starts', n: 1 },
  FISH: { label: 'Fishing', when: 'for your next 6 hooked fish', n: 6 },
  MINE: { label: 'Mining', when: 'for your next crystal cave trip', n: 1 },
  CRAFT: { label: 'Crafting', when: 'for your next 5 crafts', n: 5 },
};
export const WISH_TARGETS: WishTarget[] = ['RUN', 'FISH', 'MINE', 'CRAFT'];

export const WISHES: WishDef[] = [
  { id: 'FORTUNE', name: "Fortune's Favour", tier: 'RARE', weight: 20, color: '#ffd86a', blurb: 'Better gear drops on your next run.', fx: { RUN: { loot: 0.2 } } },
  { id: 'GOLDEN', name: 'Golden Touch', tier: 'RARE', weight: 20, color: '#ffc23a', blurb: 'Coins are worth more on your next run.', fx: { RUN: { gold: 0.2 } } },
  { id: 'FISHER', name: "Fisher's Fortune", tier: 'RARE', weight: 17, color: '#7fd8ff', blurb: 'A wider reel zone and rarer fish.', fx: { FISH: { reelZone: 0.25, fishLuck: 1.25 } } },
  { id: 'MINER', name: "Miner's Mercy", tier: 'RARE', weight: 17, color: '#c9a8ff', blurb: 'More ore and a better crystal chance.', fx: { MINE: { crystal: 0.12, ore: 0.4 } } },
  { id: 'SMITH', name: "Smith's Blessing", tier: 'RARE', weight: 17, color: '#ff9a6a', blurb: 'Great successes and Perfect lines come more often.', fx: { CRAFT: { great: 0.5, perfect: 1.25 } } },
  { id: 'CHARM', name: 'Lucky Charm', tier: 'EPIC', weight: 7, color: '#ff9fd0', blurb: 'A little luck for everything you do.',
    fx: { RUN: { loot: 0.1, gold: 0.1 }, FISH: { reelZone: 0.12, fishLuck: 1.1 }, MINE: { crystal: 0.06, ore: 0.2 }, CRAFT: { great: 0.25, perfect: 1.1 } } },
  { id: 'JACKPOT', name: 'Jackpot', tier: 'LEGENDARY', weight: 2, color: '#fff08a', blurb: 'The fountain overflows with luck. Twice the charm.',
    fx: { RUN: { loot: 0.4, gold: 0.4 }, FISH: { reelZone: 0.3, fishLuck: 1.5 }, MINE: { crystal: 0.2, ore: 0.8 }, CRAFT: { great: 1, perfect: 1.5 } } },
];
export const WISH_BY_ID: Record<WishId, WishDef> = Object.fromEntries(WISHES.map((w) => [w.id, w])) as Record<WishId, WishDef>;

/** Saved per character in progress.wish. `day` = local day key of the wish; `used` = targets already used up. */
export interface WishSave { day: string; id: WishId | ''; used: WishTarget[]; fishLeft: number; craftLeft: number }
export const emptyWish = (): WishSave => ({ day: '', id: '', used: [], fishLeft: 0, craftLeft: 0 });

export function sanitizeWish(w: Partial<WishSave> | undefined | null): WishSave {
  if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !(w.id in WISH_BY_ID) || typeof w.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.day)) return emptyWish();
  return {
    day: w.day, id: w.id as WishId,
    used: Array.isArray(w.used) ? w.used.filter((t): t is WishTarget => WISH_TARGETS.includes(t as WishTarget)) : [],
    fishLeft: Math.max(0, Math.min(WISH_TARGET.FISH.n, Math.floor(Number(w.fishLeft) || 0))),
    craftLeft: Math.max(0, Math.min(WISH_TARGET.CRAFT.n, Math.floor(Number(w.craftLeft) || 0))),
  };
}
export const wishedToday = (w: WishSave | undefined, today: string): boolean => !!w && w.id !== '' && w.day === today;

/** Targets of today's buff that are still waiting to be used. */
export function liveTargets(w: WishSave | undefined, today: string): WishTarget[] {
  if (!w || !wishedToday(w, today)) return [];
  const out: WishTarget[] = [];
  for (const t of WISH_TARGETS) {
    if (!WISH_BY_ID[w.id as WishId].fx[t] || w.used.includes(t)) continue;
    if (t === 'FISH' && w.fishLeft <= 0) continue;
    if (t === 'CRAFT' && w.craftLeft <= 0) continue;
    out.push(t);
  }
  return out;
}
/** Effect numbers of one target, or null when that target has no live buff. */
export function liveFx(w: WishSave | undefined, today: string, t: WishTarget): WishFx | null {
  if (!w || !wishedToday(w, today) || !liveTargets(w, today).includes(t)) return null;
  return WISH_BY_ID[w.id as WishId].fx[t] ?? null;
}
/** Starting save after a wish. */
export const newWish = (id: WishId, day: string): WishSave => ({ day, id, used: [], fishLeft: WISH_TARGET.FISH.n, craftLeft: WISH_TARGET.CRAFT.n });

export function rollWishId(rng: () => number = Math.random): WishId {
  let sum = 0; for (const w of WISHES) sum += w.weight;
  let r = rng() * sum;
  for (const w of WISHES) { if (r < w.weight) return w.id; r -= w.weight; }
  return WISHES[0].id;
}

/** "+20% better gear luck" style lines of one target (tooltips / result popup). */
export function fxLines(t: WishTarget, f: WishFx): string[] {
  const p = (n: number): string => `+${Math.round(n * 100)}%`;
  const out: string[] = [];
  if (t === 'RUN') { if (f.loot) out.push(`${p(f.loot)} better gear luck`); if (f.gold) out.push(`${p(f.gold)} gold from coins`); }
  if (t === 'FISH') { if (f.reelZone) out.push(`${p(f.reelZone)} wider reel zone`); if (f.fishLuck) out.push(`${p(f.fishLuck - 1)} rarer fish`); }
  if (t === 'MINE') { if (f.crystal) out.push(`${p(f.crystal)} crystal chance`); if (f.ore) out.push(`${p(f.ore)} more ore and goods`); }
  if (t === 'CRAFT') { if (f.great) out.push(`${p(f.great)} great success chance`); if (f.perfect) out.push(`${p(f.perfect - 1)} Perfect line odds`); }
  return out;
}

/** What the current run carries (set when a run starts, cleared when it ends): the loot / gold luck of the consumed RUN buff. */
export const runWish = { loot: 0, gold: 0 };
