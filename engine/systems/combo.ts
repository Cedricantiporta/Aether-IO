// ============================================================================
// Skill combo: different active casts within 3 s of each other build stacks (max 3).
// Each stack = +20% damage to the NEXT skill. Ult cast at 3 stacks = COMBO FINISHER
// (+50% ult damage, refunds 25% ult charge). Repeating the same skill breaks the chain.
// ============================================================================
import { world } from '../world';
import { events } from '../events';

export const COMBO_WINDOW = 3;
export const combo = { stacks: 0, t: 0, last: '', finisher: 0, lastSlot: '', lastSlotT: -10 };

export function resetCombo(): void { combo.stacks = 0; combo.t = 0; combo.last = ''; combo.finisher = 0; combo.lastSlot = ''; combo.lastSlotT = -10; }

export function updateCombo(dt: number): void {
  if (combo.finisher > 0) combo.finisher = Math.max(0, combo.finisher - dt);
  if (combo.t > 0) {
    combo.t -= dt;
    if (combo.t <= 0) { combo.t = 0; combo.stacks = 0; combo.last = ''; }
  }
}

/** Damage multiplier the skill about to be cast receives (stacks BEFORE this cast). */
export function comboMul(): number { return 1 + 0.2 * combo.stacks; }

/**
 * Registers an active / ult cast. `id` is the skill identity ('s1','s2','s3','ult'); returns true when this ult cast is a finisher.
 */
export function registerCast(id: string, isUlt: boolean): boolean {
  const had = combo.t > 0;
  let finisher = false;
  if (isUlt && had && combo.stacks >= 3) finisher = true;
  if (finisher) {
    combo.stacks = 0; combo.t = 0; combo.last = ''; combo.finisher = 1.4;
    events.emit('combo', { stacks: 3, finisher: true });
  } else if (!had) {
    combo.stacks = 1; combo.t = COMBO_WINDOW; combo.last = id;
    events.emit('combo', { stacks: 1, finisher: false });
  } else if (id === combo.last) {
    // repeating the same skill breaks the chain (and starts a new one)
    combo.stacks = 1; combo.t = COMBO_WINDOW; combo.last = id;
    events.emit('combo', { stacks: 0, finisher: false });
  } else {
    combo.stacks = Math.min(3, combo.stacks + 1); combo.t = COMBO_WINDOW; combo.last = id;
    events.emit('combo', { stacks: combo.stacks, finisher: false });
  }
  void world;
  return finisher;
}
