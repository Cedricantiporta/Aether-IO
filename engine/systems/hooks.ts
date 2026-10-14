// Tiny leaf module for cross-system callbacks (avoids circular-import init problems).
import type { Enemy } from '../types';
export const hooks = {
  onCleanse: () => {},
  /** A boss / mini-boss just became staggered (stagger bar filled). */
  onStagger: (_e: Enemy) => {},
  /** Damage multiplier applied to a boss (bark armor, hydra heads shielding the body...). Returns 1 for everything else. */
  damageMul: (_e: Enemy): number => 1,
  /** Damage multiplier for a dark hero champion (Dark Knight shield block = 0). Set by darkHero.ts. */
  heroMul: (_e: Enemy): number => 1,
};
