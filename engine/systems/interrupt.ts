// ============================================================================
// Boss interrupt meter (owner): while a boss / champion channels something that can be stopped (its healing channel, a signature
// special like Boulder Prison / Soul Chains / Raise the Dead ...), every hit the hero lands fills a meter under the boss bar. Full =
// the cast is cancelled, the boss is staggered (a short vulnerable window, +25% damage). The meter drains when the hero stops hitting.
// Per-enemy state lives in flat typed arrays; the boss HUD mirror is world.boss.interrupt / interruptOn / interruptLabel.
// ============================================================================
import { world } from '../world';
import { events } from '../events';
import { MAX_ENEMIES } from '../world';
import type { Enemy } from '../types';
import { bossMending, interruptMend } from './bossMech';
import { cancelSpecial, SP_NAME } from './bossSpecials';

const HIT_FILL = 0.085, DMG_FILL = 2.0, DMG_FILL_MAX = 0.12;   // per hit: a flat share + a share of the boss's max hp
const IDLE_GRACE = 0.7, DRAIN = 0.4;                           // no hit for this long, then it drains per second
const STAGGER_T = 1.8;
const meter = new Float32Array(MAX_ENEMIES), idle = new Float32Array(MAX_ENEMIES), lock = new Float32Array(MAX_ENEMIES);

/** The boss / champion is in a cast the hero can interrupt right now. */
export function interruptible(e: Enemy): boolean {
  if (!(e.boss || e.mini) || e.decoy || e.state === 'SPAWN' || e.state === 'DYING' || e.staggerT > 0) return false;
  return bossMending(e) || (e.spKind !== 0 && e.shellT <= 0 && e.hideT <= 0 && e.pos.y < 2);
}
export const interruptLabel = (e: Enemy): string => (bossMending(e) ? 'Healing' : SP_NAME[e.spKind] ?? 'Casting');

/** A hero hit landed on a boss / champion (damageEnemy, non-DoT). */
export function interruptHit(e: Enemy, amount: number): void {
  if (!interruptible(e) || lock[e.id] > 0) return;
  idle[e.id] = 0;
  meter[e.id] += HIT_FILL + Math.min(DMG_FILL_MAX, (amount / Math.max(1, e.maxHp)) * DMG_FILL);
  if (meter[e.id] < 1) return;
  meter[e.id] = 0; lock[e.id] = 1.2;
  if (bossMending(e)) interruptMend(e); else { cancelSpecial(e); e.spCd = Math.max(e.spCd, 4.5); }
  e.staggerT = Math.max(e.staggerT, STAGGER_T); e.stagger = 0;
  events.emit('stagger', { pos: e.pos, boss: e.boss });
  events.emit('floatText', { pos: e.pos, text: 'INTERRUPTED!', color: 0xffd24a, scale: 1.3, dy: 5 });
}

/** Per frame for every boss / champion: decay + lock timers. */
export function tickInterrupt(e: Enemy, dt: number): void {
  if (lock[e.id] > 0) lock[e.id] -= dt;
  if (!interruptible(e)) { meter[e.id] = 0; return; }
  idle[e.id] += dt;
  if (idle[e.id] > IDLE_GRACE && meter[e.id] > 0) meter[e.id] = Math.max(0, meter[e.id] - DRAIN * dt);
}

/** Mirrors the bar owner's meter to the boss HUD (enemies.ts calls it for the enemy the bar follows). */
export function interruptView(e: Enemy): void {
  const b = world.boss, on = interruptible(e);
  b.interruptOn = on; b.interrupt = on ? Math.min(1, meter[e.id]) : 0;
  if (on) b.interruptLabel = interruptLabel(e);
}
export function resetInterrupt(): void { meter.fill(0); idle.fill(0); lock.fill(0); }
