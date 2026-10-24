// Tiny leaf module for cross-system callbacks (avoids circular-import init problems).
import type { Enemy, GroundFx } from '../types';
export const hooks = {
  onCleanse: () => {},
  /** A giant fireball (Ignar) ended at (x, z): bosses2.ts leaves a capped fire patch + burst there. */
  fireImpact: (_x: number, _z: number, _r: number) => {},
  /** A boss / mini-boss just became staggered (stagger bar filled). */
  onStagger: (_e: Enemy) => {},
  /** Damage multiplier applied to a boss (bark armor, hydra heads shielding the body...). Returns 1 for everything else. */
  damageMul: (_e: Enemy): number => 1,
  /** Damage multiplier for a dark hero champion (Dark Knight shield block = 0). Set by darkHero.ts. */
  heroMul: (_e: Enemy): number => 1,
  /** Damage multiplier for a humanoid mini boss hit from (x, z) (Varn's frontal Shield Wall block = 0, banner shield). Set by humanBosses.ts. */
  humanMul: (_e: Enemy, _fx: number, _fz: number): number => 1,
  /** A hostile ground fx (dark hero copy of a hero skill) resolved: darkHero.ts applies its hit to the player. */
  hostileFx: (_f: GroundFx) => {},
  /** The hero was brought back (Ankh of Life): player.ts resets its death flow. */
  onRevive: () => {},
  /** The hero was knocked down while on a horse: village.ts dismounts. */
  dismount: () => {},
  /** A knockback (monster trait) cancels the hero's current skill cast / aim: player.ts clears it. */
  cancelCast: () => {},
};
