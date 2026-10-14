// Design tokens that JavaScript needs too (rarity / hero colours). The rest of the tokens (surfaces, ink,
// radii, safe areas, type scale) live as CSS variables at the top of index.css.
// `installTheme()` mirrors this palette onto :root as CSS variables so there is exactly one source.
import type { HeroClass, Rarity } from '../types';

export const ACCENT = '#f2a93b';

export const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
export const RARITY_STARS: Record<Rarity, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
export const RARITY_NAME: Record<Rarity, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

/** Stripe / star / accent colour of a rarity (works on both glass and cream surfaces). */
export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: '#9aa0ac', RARE: '#4d9be8', EPIC: '#a470ec', LEGENDARY: '#f0a92b', MYTHIC: '#ee5a52',
};
/** Rarity text on dark surfaces (glass HUD, painted icon backgrounds). */
export const RARITY_LIGHT: Record<Rarity, string> = {
  COMMON: '#e4e6ea', RARE: '#79b4f2', EPIC: '#c3a0f6', LEGENDARY: '#ffc861', MYTHIC: '#ff8a82',
};
/** Rarity text on menu surfaces (dark metal theme: same as the light variants). */
export const RARITY_INK: Record<Rarity, string> = RARITY_LIGHT;

export const HERO_COLOR: Record<HeroClass, string> = { ARCHER: '#4aa86a', WIZARD: '#5b8ef0', BARBARIAN: '#e0564a', KNIGHT: '#e2bd62', NECROMANCER: '#9a6bd8' };

export function installTheme(): void {
  const s = document.documentElement.style;
  s.setProperty('--ac', ACCENT);
  RARITIES.forEach((r, i) => {
    s.setProperty(`--r${i + 1}`, RARITY_COLOR[r]);
    s.setProperty(`--r${i + 1}-ink`, RARITY_INK[r]);
    s.setProperty(`--r${i + 1}-lt`, RARITY_LIGHT[r]);
  });
}
