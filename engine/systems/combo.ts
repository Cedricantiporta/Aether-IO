// ============================================================================
// Hit combo: every hit the player lands (basic attacks, skills, ults — not DoT ticks or pets) adds 1.
// The chain drops after COMBO_WINDOW seconds without a hit. Bonus damage on all player hits:
// +2.5% per 10 hits (cap +25% at 100). An ult cast at FINISHER_HITS+ is a COMBO FINISHER
// (+50% ult damage, refunds 25% ult charge) and resets the chain.
// ============================================================================
import { events } from '../events';

export const COMBO_WINDOW = 3;
export const FINISHER_HITS = 50;
/** `stacks` = current hit count (name kept for the HUD). */
export const combo = { stacks: 0, t: 0, finisher: 0, best: 0, lastSlot: '', lastSlotT: -10 };

export function resetCombo(): void { combo.stacks = 0; combo.t = 0; combo.finisher = 0; combo.best = 0; combo.lastSlot = ''; combo.lastSlotT = -10; }

export function updateCombo(dt: number): void {
  if (combo.finisher > 0) combo.finisher = Math.max(0, combo.finisher - dt);
  if (combo.t > 0) {
    combo.t -= dt;
    if (combo.t <= 0) { combo.t = 0; combo.stacks = 0; }
  }
}

/** 0..3 visual tier (10 / 30 / FINISHER_HITS hits). */
export function comboTier(): number {
  const n = combo.stacks;
  return n >= FINISHER_HITS ? 3 : n >= 30 ? 2 : n >= 10 ? 1 : 0;
}

/** Damage multiplier for player hits from the current chain. */
export function comboMul(): number { return 1 + Math.min(0.05, Math.floor(combo.stacks / 10) * 0.005); }

/** Called by damageEnemy for every direct player hit. */
export function registerHit(): void {
  const prevTier = comboTier();
  combo.stacks++; combo.t = COMBO_WINDOW;
  if (combo.stacks > combo.best) combo.best = combo.stacks;
  const tier = comboTier();
  if (tier > prevTier) events.emit('combo', { stacks: tier, finisher: false });
}

/** Ult cast: returns true when it is a finisher (consumes the chain). */
export function registerUlt(): boolean {
  if (combo.t <= 0 || combo.stacks < FINISHER_HITS) return false;
  combo.stacks = 0; combo.t = 0; combo.finisher = 1.4;
  events.emit('combo', { stacks: 3, finisher: true });
  return true;
}
