// Boss / elite / hazard AREA damage that also hurts the Necromancer's summons (owner 2026-11-06: "at max level the summons are almost
// immortal, even in boss fights"). Every attack that calls damagePlayer for an area (circle / line / cone / ring / whole-room) calls one of these
// at the SAME moment with the SAME shape, outside any "is the hero inside" test. Allocation-free (iterates the world.minions pool).
//   - dmg = the attack's hero damage BEFORE hero defence (or pct = share of the hero's max HP for pct attacks); summons apply their own m.def / shield.
//   - one hit never takes more than HIT_CAP of that summon's max HP (a nova cannot delete a golem / dragon without counterplay).
//   - never the run ally (SRC_ALLY), never on the co-op guest (host-authoritative), never twice per strike: calls made while
//     world.player is the guest's stand-in (forEachHero / expire second pass) are ignored.
import { world } from '../world';
import { useGameStore, DMG_INFLATE } from '../../store';
import { HERO_DOT_MUL } from './combat';
import { coopRoom } from '../../net/coopRoom';
import { SRC_ALLY } from './ally';
import { damageMinion } from './minions';

const HIT_CAP = 0.35;
const PAD = 0.5;   // a summon's body radius (the hero's own pad is ~0.6)

function live(): boolean { return !coopRoom.guest && world.player !== coopRoom.ally; }
/** What the hero would take before defence: pct attacks = share of max HP; flat attacks get the same x2 monster inflation damagePlayer applies. */
function amount(dmg: number, pct: number): number { return pct > 0 ? pct * useGameStore.getState().stats.maxHealth : dmg * DMG_INFLATE; }
/** Multiply a per-second ticking value by this for a tick of `dt` s (the hero's ticking damage hurts HERO_DOT_MUL x more). */
export const dotAmt = (dps: number, dt: number): number => dps * dt * HERO_DOT_MUL;
function hurt(i: number, d: number): void {
  const m = world.minions[i];
  const cap = m.maxHp * HIT_CAP;
  damageMinion(i, d > cap ? cap : d);
}

/** Every summon within r (+ body pad) of (x, z). */
export function hurtMinionsCircle(x: number, z: number, r: number, dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions, rr = (r + PAD) * (r + PAD);
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0) continue;
    if ((m.x - x) ** 2 + (m.z - z) ** 2 < rr) hurt(i, d);
  }
}

/** Every summon with r0 <= distance < r1 from (x, z), no padding (an expanding ring: pass the radius swept this frame so each summon is hit once as the front passes). */
export function hurtMinionsRing(x: number, z: number, r0: number, r1: number, dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions, a = r0, b = r1;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0) continue;
    const q = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (q >= a * a && q < b * b) hurt(i, d);
  }
}

/** A lane / beam from (ox, oz) along the unit vector (dx, dz): `len` long, `halfW` half-width (same along > -1 .. len + 1 rule as the hero test). */
export function hurtMinionsLine(ox: number, oz: number, dx: number, dz: number, len: number, halfW: number, dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0) continue;
    const rx = m.x - ox, rz = m.z - oz;
    const along = rx * dx + rz * dz, perp = Math.abs(rx * dz - rz * dx);
    if (along > -1 && along < len + 1 && perp < halfW) hurt(i, d);
  }
}

/** A cone from (ox, oz) facing the unit vector (dx, dz): `range` long, `half` half-angle (rad). Same rule as bossFx.inCone. */
export function hurtMinionsCone(ox: number, oz: number, dx: number, dz: number, range: number, half: number, dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions, c = Math.cos(half + 0.12);
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0) continue;
    const rx = m.x - ox, rz = m.z - oz, dd = Math.hypot(rx, rz);
    if (dd > range + 0.6) continue;
    if (dd < 1 || (rx * dx + rz * dz) / dd > c) hurt(i, d);
  }
}

/** Every summon in the room (an arena-wide pulse). */
export function hurtMinionsAll(dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions;
  for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && m.src !== SRC_ALLY && m.rise <= 0) hurt(i, d); }
}

/** A moving charge / roll: like hurtMinionsLine but each summon is hit once per charge. `mask` = bit i set for summon slot i already hit; returns the new mask (start each charge with 0). */
export function hurtMinionsLineOnce(ox: number, oz: number, dx: number, dz: number, back: number, fwd: number, halfW: number, dmg: number, pct: number, mask: number): number {
  if (!live()) return mask;
  const d = amount(dmg, pct); if (d <= 0) return mask;
  const M = world.minions;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0 || ((mask >> i) & 1)) continue;
    const rx = m.x - ox, rz = m.z - oz;
    const along = rx * dx + rz * dz, perp = Math.abs(rx * dz - rz * dx);
    if (along > -back && along < fwd && perp < halfW) { mask |= 1 << i; hurt(i, d); }
  }
  return mask;
}

/** Every summon standing where `test(x, z)` is true (lava tiles, outside the safe sigils...). Pass a module-level function, never a fresh closure. */
export function hurtMinionsWhere(test: (x: number, z: number) => boolean, dmg: number, pct = 0): void {
  if (!live()) return;
  const d = amount(dmg, pct); if (d <= 0) return;
  const M = world.minions;
  for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && m.src !== SRC_ALLY && m.rise <= 0 && test(m.x, m.z)) hurt(i, d); }
}

/** A moving body (a charge / ram): every summon within r of (x, z) is hit once per charge. `mask` as hurtMinionsLineOnce; returns the new mask (start each charge with 0). */
export function hurtMinionsCircleOnce(x: number, z: number, r: number, dmg: number, pct: number, mask: number): number {
  if (!live()) return mask;
  const d = amount(dmg, pct); if (d <= 0) return mask;
  const M = world.minions, rr = (r + PAD) * (r + PAD);
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY || m.rise > 0 || ((mask >> i) & 1)) continue;
    if ((m.x - x) ** 2 + (m.z - z) ** 2 < rr) { mask |= 1 << i; hurt(i, d); }
  }
  return mask;
}
