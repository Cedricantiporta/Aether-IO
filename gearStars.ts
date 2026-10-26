// Item ascension: gear stars (Item.stars 0..5, missing = 0). Each star adds 6% of the piece's base stats. The bonus is folded
// into item.stats at ascend time (the same way +N upgrades rescale them, so later upgrades scale it too); affixes and set bonuses are not scaled.
import type { Item, PlayerStats } from './types';

export const GEAR_MAX_STARS = 5;
export const GEAR_STAR_BONUS = 0.06;
export const gearStars = (p: Pick<Item, 'stars'>): number => Math.max(0, Math.min(GEAR_MAX_STARS, Math.floor(p.stars ?? 0)));
const mulAt = (n: number): number => 1 + GEAR_STAR_BONUS * n;

/** The piece with one more star and its base stats scaled from the current star level to the next. */
export const withNextStar = (item: Item): Item => {
  const n = gearStars(item), f = mulAt(n + 1) / mulAt(n);
  const stats = { ...item.stats } as Partial<PlayerStats>;
  (Object.keys(stats) as (keyof PlayerStats)[]).forEach((k) => { const v = stats[k]; if (v !== undefined) stats[k] = parseFloat((v * f).toFixed(2)); });
  return { ...item, stats, stars: n + 1 };
};
