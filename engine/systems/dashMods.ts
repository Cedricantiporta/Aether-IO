// Dash Charms (dashMods.ts): the chosen mod's runtime effects. Mirror Step reflects enemy shots touched mid-dash, Guard Step grants a
// short shield after the dash, Blade Step slashes enemies passed through, Swift Step shortens the cooldown and adds a speed burst.
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { runCards } from '../runCards';
import { damageEnemy, type DamageOpts } from './combat';
import { spawnProjectile } from './projectiles';
import { MIRROR_DMG_MUL, GUARD_FRAC, GUARD_SEC, BLADE_DMG, BLADE_KNOCK, BLADE_RADIUS, BLADE_BASE_BONUS, SWIFT_CD_MUL, SWIFT_SPEED, SWIFT_SEC, type DashMod } from '../../dashMods';

let cur: DashMod | null = null;       // the mod latched at the start of the current / last dash
let wasDash = false;
let guardT = 0, guardAmt = 0, swiftT = 0;
const hitIds: number[] = [];
const ids: number[] = [];
const kd = new Vector3(), fxPos = new Vector3(), fxDir = new Vector3();
const bladeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', noBackstab: true, knockDir: kd, knockback: BLADE_KNOCK };

/** The Dash Charm card taken this run, else null. */
export function chosenDashMod(): DashMod | null {
  return runCards.dashMod;   // (owner) a once-per-run card now, not a trainer pick
}

/** Multiplier on the dash's own damage (Blade Step sharpens it). Valid after dashModStart. */
export const dashDmgBonus = (): number => (cur === 'BLADE' ? BLADE_BASE_BONUS : 1);
/** Swift Step: dash cooldown multiplier (applies whenever it is the chosen charm). */
export const dashCdMul = (): number => (chosenDashMod() === 'SWIFT' ? SWIFT_CD_MUL : 1);
/** Swift Step: move-speed multiplier right after a dash. */
export const dashSpeedMul = (): number => (swiftT > 0 ? SWIFT_SPEED : 1);

/** Called by tryDash just BEFORE the class dash is cast. */
export function dashModStart(): void {
  cur = chosenDashMod();
  hitIds.length = 0;
}
/** Called by tryDash just AFTER the class dash is cast (its direction is known). */
export function dashModFx(): void {
  if (!cur) return;
  const p = world.player;
  events.emit('dashFx', { pos: p.pos, dir: p.dashDir, mod: cur, end: false });
}

export function resetDashMods(): void {
  cur = null; wasDash = false; guardT = 0; guardAmt = 0; swiftT = 0; hitIds.length = 0;
}

function dropGuard(): void {
  const p = world.player;
  if (guardAmt > 0) { p.aegis = Math.max(0, p.aegis - guardAmt); if (p.aegis <= 0) { p.aegis = 0; p.aegisMax = 0; } }
  guardAmt = 0; guardT = 0;
}

export function updateDashMods(dt: number, leaping: boolean): void {
  const p = world.player;
  if (swiftT > 0) swiftT -= dt;
  if (guardT > 0) { guardT -= dt; if (guardT <= 0 || !p.alive) dropGuard(); }
  if (!p.alive) { wasDash = false; return; }
  const dashing = p.dashT > 0 || leaping;

  if (dashing && cur) {
    if (cur === 'MIRROR') {
      const list = world.enemyProjectiles, st = useGameStore.getState();
      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        if (!q.active || q.damage <= 0) continue;
        const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, r = q.radius + 2.0;
        if (dx * dx + dz * dz > r * r) continue;
        const sp = Math.hypot(q.vel.x, q.vel.z) || 1;
        const dmg = Math.min(q.damage * MIRROR_DMG_MUL, Math.max(10, st.stats.damage * 6));
        const kind = q.kind === 'ARROW' || q.kind === 'POISON_ARROW' || q.kind === 'BALLISTA' ? 'ARROW' : 'MAGIC';
        const pr = spawnProjectile(kind, p.pos.x - (q.vel.x / sp) * 0.2, p.pos.z - (q.vel.z / sp) * 0.2, -q.vel.x / sp, -q.vel.z / sp, Math.max(18, sp * 1.1), dmg, { life: 1.8, pierce: 1, radius: 0.7, y: q.pos.y > 0.5 ? q.pos.y : 1.2 });
        q.active = false;
        if (pr) pr.tint = 1;
        fxPos.set(q.pos.x, 1.2, q.pos.z); fxDir.set(-q.vel.x / sp, 0, -q.vel.z / sp);
        events.emit('dashFx', { pos: fxPos, dir: fxDir, mod: 'MIRROR', end: true });
      }
    } else if (cur === 'BLADE') {
      const dmg = useGameStore.getState().stats.damage * BLADE_DMG;
      const found = world.enemyGrid.query(p.pos.x, p.pos.z, BLADE_RADIUS + 3, ids);
      for (let i = 0; i < found.length; i++) {
        const e = world.enemies[found[i]];
        if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || hitIds.indexOf(e.id) !== -1) continue;
        const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, r = BLADE_RADIUS + e.radius;
        if (dx * dx + dz * dz > r * r) continue;
        hitIds.push(e.id);
        const l = Math.hypot(dx, dz) || 1;
        kd.set(dx / l, 0, dz / l);
        damageEnemy(e, dmg, bladeOpts);
        fxPos.set(e.pos.x, 1.2, e.pos.z);
        events.emit('dashFx', { pos: fxPos, dir: kd, mod: 'BLADE', end: true });
      }
    }
  }

  if (wasDash && !dashing && cur) {   // the dash just ended
    if (cur === 'GUARD') {
      const amt = useGameStore.getState().stats.maxHealth * GUARD_FRAC;
      dropGuard();
      p.aegis += amt; p.aegisMax = Math.max(p.aegisMax, p.aegis); guardAmt = amt; guardT = GUARD_SEC;
      events.emit('dashFx', { pos: p.pos, dir: p.dashDir, mod: 'GUARD', end: true });
    } else if (cur === 'SWIFT') {
      swiftT = SWIFT_SEC;
      events.emit('dashFx', { pos: p.pos, dir: p.dashDir, mod: 'SWIFT', end: true });
    }
  }
  wasDash = dashing;
}
