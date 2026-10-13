// ============================================================================
// Active abilities: Q, E, 3, 4 (class kit) and R (ultimate, charge meter).
// Multi-frame effects run through the pooled ground-fx list (world.fx) + a few timers.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone, allocFx } from '../world';
import { edgeLimit, queryColliders, type Collider } from '../mapgen';
import { events } from '../events';
import { useGameStore } from '../../store';
import { abilityCd, lvMul, ULT_MAX, type ActiveSlot } from '../../abilityDefs';
import type { GroundFx, GroundFxKind } from '../types';
import {
  getAimDir, trySpendMana, damageEnemy, damageEnemiesInRadius, applyStatus, healPlayer, addShake, autoAim,
  type DamageOpts, type StatusEffect,
} from './combat';
import { spawnProjectile } from './projectiles';
import { hitStop, slowMo, fovKick } from '../game';

/** State for render/UI of multi-frame abilities. */
export const abilityState = {
  tint: 0,                 // 0..1 screen darkening (ultimates)
  tintTarget: 0,
  tintRgb: [0.04, 0.06, 0.16] as [number, number, number],
  ultKind: 0,              // 0 none, 1 archer, 2 wizard, 3 barbarian
  ultPhase: 0,
  ultT: 0,                 // time in current phase
  ultAcc: 0,
  ultX: 0, ultZ: 0,
  whirlR: 7.5,
  orbT: 0, orbN: 0, orbTick: 0, orbChain: 2, orbDmg: 0,
  orbs: [{ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }],
  leapT: 0, leapDur: 0.55, leapSx: 0, leapSz: 0, leapTx: 0, leapTz: 0, leapDmg: 0, leapLv: 1,
  whirlTick: 0, whirlDmg: 0, whirlLv: 1,
  finalSlam: 0,
  lastStep: 0,
};

const aim = new Vector3();
const tgt = new Vector3();
const out: number[] = [];
const colOut: Collider[] = [];
let lastNoMana = -10;
const lastCd: Record<string, number> = {};

const physOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const physKnock: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 1.2 };
const fireOpts: DamageOpts = { kind: 'FIRE', source: 'PLAYER', knockback: 0.8 };
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const elecOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER' };
const stunSt: StatusEffect = { type: 'STUN', duration: 1 };
const burnSt: StatusEffect = { type: 'BURN', duration: 4, value: 5 };
const freezeSt: StatusEffect = { type: 'FREEZE', duration: 1 };

export function resetAbilities(): void {
  const a = abilityState;
  a.tint = a.tintTarget = 0; a.ultKind = 0; a.ultPhase = 0; a.ultT = 0; a.ultAcc = 0;
  a.orbT = 0; a.leapT = 0; a.whirlTick = 0; a.finalSlam = 0; a.lastStep = 0;
  lastNoMana = -10;
  for (const k in lastCd) lastCd[k] = -10;
}

export function notifyCooldown(slot: 'q' | 'e' | 's3' | 's4' | 'dash' | 'r'): void {
  const last = lastCd[slot] ?? -10;
  if (world.time - last < 1) return;
  lastCd[slot] = world.time;
  events.emit('onCooldown', { slot });
}
export function notifyNoMana(): void {
  if (world.time - lastNoMana < 1) return;
  lastNoMana = world.time;
  events.emit('noMana', {});
}

function announce(name: string): void {
  const p = world.player;
  const d = getAimDir(aim);
  events.emit('ability', { pos: p.pos.clone(), dir: d.clone(), name });
  p.anim.castT = 1;
}

/** Cooldown + mana gate. Returns true when the cast may proceed (mana spent, cooldown set). */
function gate(slot: ActiveSlot): boolean {
  const st = useGameStore.getState();
  const p = world.player;
  if (p.cd[slot] > 0) { notifyCooldown(slot); return false; }
  if (abilityState.leapT > 0) return false;
  const cost = st.getManaCost(slot);
  if (!trySpendMana(cost)) { notifyNoMana(); return false; }
  const cd = abilityCd(st.hero, slot, st.skillLevels[slot]) * (1 - st.stats.cooldownReduction);
  p.cd[slot] = cd; p.cdMax[slot] = cd;
  return true;
}

/** Base damage unit of an active (before its per-skill multiplier). */
function base(lv: number): number {
  const st = useGameStore.getState();
  const s = st.stats, p = world.player;
  let d = s.damage * (st.hero === 'WIZARD' ? s.skillDamage * 0.45 : s.skillDamage) * lvMul(lv);
  if (p.cryT > 0) d *= 1.3;
  if (p.titanT > 0) d *= 1.5;
  return d;
}

/** Ground target point: locked enemy, else mouse aim; clamped to [minR, range] and to the arena. */
function aimPoint(range: number, minR: number, o: Vector3): Vector3 {
  const p = world.player;
  let tx = p.aim.x, tz = p.aim.z;
  if (autoAim.id >= 0) {
    const e = world.enemies[autoAim.id];
    if (e.active && e.state !== 'DYING') { tx = e.pos.x; tz = e.pos.z; }
  }
  let dx = tx - p.pos.x, dz = tz - p.pos.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); d = 1; }
  const dd = Math.min(range, Math.max(minR, d));
  let x = p.pos.x + (dx / d) * dd, z = p.pos.z + (dz / d) * dd;
  const r = Math.hypot(x, z);
  const lim = edgeLimit(x, z, 3);
  if (r > lim) { x *= lim / r; z *= lim / r; }
  return o.set(x, 0, z);
}

/** Nudges a point out of obstacle colliders. */
function safeSpot(o: Vector3): void {
  for (let pass = 0; pass < 3; pass++) {
    const cols = queryColliders(o.x, o.z, 8, colOut);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = o.x - c.x, dz = o.z - c.z, min = c.r + 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) o.x = c.x + min; else { o.x = c.x + (dx / d) * min; o.z = c.z + (dz / d) * min; }
    }
  }
}

function mkFx(kind: GroundFxKind, x: number, z: number, delay: number, life: number, radius: number, dmg: number, aux = 0, color = 0xffffff): GroundFx | null {
  const f = allocFx();
  if (!f) return null;
  f.active = true; f.kind = kind; f.x = x; f.z = z; f.delay = delay; f.life = life; f.radius = radius; f.dmg = dmg; f.aux = aux; f.color = color;
  return f;
}

function mkZone(kind: 'TORNADO' | 'FROST_FIELD' | 'METEOR_SHADOW' | 'FIRE' | 'BLACKHOLE' | 'SHOCKWAVE', x: number, z: number, r: number, life: number, dmg: number, color: number, pullRange = 0, maxPull = 0) {
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = kind; zn.hostile = false;
  zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = dmg; zn.color = color;
  zn.length = pullRange; zn.maxPull = maxPull;
  return zn;
}

// ============================================================ casting =======
export function castQ(): void { cast('q'); }
export function castE(): void { cast('e'); }
export function castS3(): void { cast('s3'); }
export function castS4(): void { cast('s4'); }

function cast(slot: ActiveSlot): void {
  const st = useGameStore.getState();
  const p = world.player;
  if (!p.alive) return;
  if (!gate(slot)) return;
  const lv = st.skillLevels[slot];
  const dir = getAimDir(aim);
  const dx = dir.x, dz = dir.z;
  const stats = st.stats;
  const b = base(lv);
  const hero = st.hero;

  if (hero === 'ARCHER') {
    if (slot === 'q') {
      const w = (1 + stats.galeWidth) * (1 + 0.1 * (lv - 1));
      const pr = spawnProjectile('GALE_ARROW', p.pos.x + dx, p.pos.z + dz, dx, dz, 55, b * 6,
        { life: 1.5, pierce: Infinity, knockback: 0.4, radius: 3.0 * w, y: 1.5 });
      if (pr) { pr.state = 0; pr.procLv = 0; pr.spin = w; pr.trailT = 0; pr.homing = 0; pr.aoeRadius = 0; pr.bounces = 3 + lv; }
      announce('GALE_ARROW');
    } else if (slot === 'e') {
      let mx = 0, mz = 0;
      const k = world.input.keys;
      if (k.KeyW || k.ArrowUp) mz -= 1;
      if (k.KeyS || k.ArrowDown) mz += 1;
      if (k.KeyA || k.ArrowLeft) mx -= 1;
      if (k.KeyD || k.ArrowRight) mx += 1;
      const jj = world.input.joy;
      if (jj.active && Math.hypot(jj.x, jj.z) > 0.2) { mx = jj.x; mz = jj.z; }
      const ml = Math.hypot(mx, mz);
      if (ml > 0) { mx /= ml; mz /= ml; } else { mx = -dx; mz = -dz; }
      const inv = 0.3 + 0.03 * lv;
      p.dashT = 0.25; p.dashDir.set(mx, 0, mz);
      p.invulnT = Math.max(p.invulnT, inv);
      events.emit('dash', { from: p.pos.clone(), dir: p.dashDir.clone() });
      const R = 7 + 0.5 * (lv - 1);
      mkFx('ARROW_STICK', p.pos.x, p.pos.z, 0.6, 0.85, R, b * 8, 0, 0xffe8a0);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * 6.283, d = 0.4 + Math.random() * 1.1;
        mkFx('ARROW_STICK', p.pos.x + Math.cos(a) * d, p.pos.z + Math.sin(a) * d, 0.6, 0.85, 0, 0, 0, 0xffe8a0);
      }
      announce('SHADOW_ROLL');
    } else if (slot === 's3') {
      const n = 8 + lv;
      const spread = 0.62;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 2 * spread;
        const c = Math.cos(a), s = Math.sin(a);
        const vx = dx * c - dz * s, vz = dx * s + dz * c;
        const pr = spawnProjectile('BURNING_ARROW', p.pos.x + vx, p.pos.z + vz, vx, vz, 30, b * 2.2,
          { life: 0.95, pierce: 3, radius: 2.0, knockback: 0.4, effect: { type: 'BURN', duration: 4, value: b * 0.3 } });
        if (pr) { pr.state = 2; pr.trailT = Math.random() * 0.1; }
      }
      announce('FAN_FLAMES');
    } else {
      const R = 7.5 + 0.5 * (lv - 1);
      const baseAng = Math.atan2(dz, dx);
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.5;
        let x = p.pos.x + Math.cos(a) * 17, z = p.pos.z + Math.sin(a) * 17;
        const r = Math.hypot(x, z), lim = edgeLimit(x, z, 3);
        if (r > lim) { x *= lim / r; z *= lim / r; }
        const f = mkFx('TRAP', x, z, 0.5, 0.6, 5.5, b * 3, R, 0x7fe0ff);
        if (f) { f.sx = p.pos.x; f.sz = p.pos.z; }
      }
      announce('FROST_FIELD');
    }
    return;
  }

  if (hero === 'WIZARD') {
    if (slot === 'q') {
      aimPoint(28, 7, tgt);
      const R = 11 + 0.6 * (lv - 1);
      mkZone('BLACKHOLE', tgt.x, tgt.z, R, 3 + 0.1 * lv, b * 14, 0x6d28d9, R * 2.1, 999);
      announce('SINGULARITY');
    } else if (slot === 'e') {
      aimPoint(22 + lv, 4, tgt);
      safeSpot(tgt);
      const R = 8.5 + 0.4 * (lv - 1);
      const from = p.pos.clone();
      novaAt(from.x, from.z, R, b * 3, lv);
      p.pos.set(tgt.x, 0, tgt.z); p.vel.set(0, 0, 0);
      p.invulnT = Math.max(p.invulnT, 0.35);
      novaAt(tgt.x, tgt.z, R, b * 3, lv);
      events.emit('blink', { from, to: p.pos.clone() });
      announce('BLINK_NOVA');
    } else if (slot === 's3') {
      const a = abilityState;
      a.orbN = 3 + (lv >= 3 ? 1 : 0) + (stats.orbBonus | 0);
      if (a.orbN > 6) a.orbN = 6;
      a.orbT = 6 + stats.stormBonus; a.orbTick = 0.15; a.orbChain = 2 + Math.floor(lv / 2) + (stats.thunderChain | 0);
      a.orbDmg = b * 2.4;
      announce('STORM_ORBS');
    } else {
      aimPoint(26, 5, tgt);
      const R = 6.5 + 0.4 * (lv - 1);
      mkZone('METEOR_SHADOW', tgt.x, tgt.z, R, 0.5, 0, 0xff7a1a);
      mkFx('PILLAR', tgt.x, tgt.z, 0.5, 1.9, R, b * 10, 0, 0xff7a1a);
      events.emit('telegraph', { pos: tgt.clone(), radius: R, duration: 0.5 });
      announce('INFERNO_PILLAR');
    }
    return;
  }

  // ---- BARBARIAN
  if (slot === 'q') {
    aimPoint(24, 5, tgt);
    safeSpot(tgt);
    const a = abilityState;
    a.leapT = a.leapDur; a.leapSx = p.pos.x; a.leapSz = p.pos.z; a.leapTx = tgt.x; a.leapTz = tgt.z;
    a.leapDmg = b * 7; a.leapLv = lv;
    p.invulnT = Math.max(p.invulnT, a.leapDur + 0.1);
    events.emit('leap', { from: p.pos.clone(), to: tgt.clone(), dur: a.leapDur });
    announce('BLOODRAGE_LEAP');
  } else if (slot === 'e') {
    const a = abilityState;
    p.whirlT = 3; a.whirlTick = 0; a.whirlDmg = b * 1.6; a.whirlLv = lv; a.whirlR = 7.5 + 0.3 * (lv - 1);
    announce('WHIRLWIND');
  } else if (slot === 's3') {
    const L = 34 + 2 * (lv - 1), n = 18;
    const stun = 0.6 + 0.1 * lv;
    for (let i = 0; i < n; i++) {
      const d = 3 + (i / (n - 1)) * L;
      const x = p.pos.x + dx * d, z = p.pos.z + dz * d;
      mkFx('SPIKE', x, z, 0.1 + i * 0.045, 1.5 + i * 0.045, 2.8, b * 5, stun, 0xa89a80);
      if (i % 2 === 0) mkFx('SPIKE', x - dz * 2.2, z + dx * 2.2, 0.2 + i * 0.045, 1.4 + i * 0.045, 1.4, b * 2, 0.3, 0xa89a80);
      else mkFx('SPIKE', x + dz * 2.2, z - dx * 2.2, 0.2 + i * 0.045, 1.4 + i * 0.045, 1.4, b * 2, 0.3, 0xa89a80);
    }
    events.emit('fissure', { from: p.pos.clone(), dir: dir.clone(), length: L + 3 });
    announce('EARTHSPLITTER');
  } else {
    const R = 15 + lv;
    const fear = 3 + 0.3 * lv;
    stunSt.duration = 1.5;
    damageEnemiesInRadius(p.pos.x, p.pos.z, R, b * 2, physKnock, stunSt);
    const ids = world.enemyGrid.query(p.pos.x, p.pos.z, R + 4, out);
    const r2 = R * R;
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.boss) continue;
      const ex = e.pos.x - p.pos.x, ez = e.pos.z - p.pos.z;
      if (ex * ex + ez * ez <= r2) e.fearT = Math.max(e.fearT, fear);
    }
    p.cryT = 8;
    events.emit('shout', { pos: p.pos.clone(), radius: R });
    addShake(0.35);
    announce('BATTLE_CRY');
  }
}

function novaAt(x: number, z: number, R: number, dmg: number, lv: number): void {
  freezeSt.duration = 1 + 0.2 * (lv - 1);
  damageEnemiesInRadius(x, z, R, dmg, iceOpts, freezeSt);
  events.emit('frostNova', { pos: new Vector3(x, 0, z), radius: R });
}

// ============================================================ ultimate ======
export function castUlt(): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;
  if (!p.alive || p.ultT > 0 || a.ultKind !== 0) return;
  if (p.ult < ULT_MAX - 0.001) { notifyCooldown('r'); return; }
  p.ult = 0;
  const lv = st.skillLevels.ult;
  const b = base(lv);
  a.ultT = 0; a.ultPhase = 0; a.ultAcc = 0;
  events.emit('ultStart', { hero: st.hero, pos: p.pos.clone() });
  p.anim.castT = 1;
  if (st.hero === 'ARCHER') {
    a.ultKind = 1;
    p.ultT = 0.3 + 6 + st.stats.hawkBonus + 0.5;
    a.tintRgb = [0.02, 0.03, 0.14]; a.tintTarget = 0.85;
    slowMo(0.8, 0.3); fovKick(0.5);
    a.ultX = b;
  } else if (st.hero === 'WIZARD') {
    a.ultKind = 2;
    p.ultT = 1.2 + 4.2;
    aimPoint(30, 8, tgt);
    a.ultX = tgt.x; a.ultZ = tgt.z;
    a.tintRgb = [0.16, 0.03, 0.02]; a.tintTarget = 0.4;
    mkZone('METEOR_SHADOW', tgt.x, tgt.z, 16, 1.2, 0, 0xff5a1a);
    mkFx('BIG_METEOR', tgt.x, tgt.z, 1.2, 1.5, 16, b * 60, 0, 0xff7a1a);
    events.emit('telegraph', { pos: tgt.clone(), radius: 16, duration: 1.2 });
    slowMo(0.5, 0.45);
  } else {
    a.ultKind = 3;
    p.ultT = 8; p.titanT = 8; p.invulnT = Math.max(p.invulnT, 0.8);
    a.tintRgb = [0.12, 0.06, 0.02]; a.tintTarget = 0.18;
    a.lastStep = Math.floor(p.anim.stepPhase / Math.PI);
    a.ultX = b;
    addShake(0.6); fovKick(0.7); slowMo(0.4, 0.4);
    events.emit('shockwave', { pos: p.pos.clone(), radius: 12, color: 0xd99a4a });
  }
}

function randomTarget(range: number, fromEnemyChance: number, o: Vector3): void {
  const p = world.player;
  if (Math.random() < fromEnemyChance) {
    const list = world.enemies;
    const start = (Math.random() * list.length) | 0;
    for (let k = 0; k < 40; k++) {
      const e = list[(start + k) % list.length];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 60 * 60) continue;
      o.set(e.pos.x + (Math.random() - 0.5) * 2, 0, e.pos.z + (Math.random() - 0.5) * 2);
      return;
    }
  }
  o.set(p.pos.x + (Math.random() * 2 - 1) * range, 0, p.pos.z + (Math.random() * 2 - 0.9) * range * 0.62);
}

function updateUlt(dt: number): void {
  const st = useGameStore.getState();
  const a = abilityState, p = world.player;
  if (a.ultKind === 0) return;
  const lv = st.skillLevels.ult;
  const b = base(lv);
  p.ultT = Math.max(0, p.ultT - dt);
  a.ultT += dt;

  if (a.ultKind === 1) {
    // phase 0 intro (0.3s), phase 1 rain, phase 2 finale
    const dur = 6 + st.stats.hawkBonus;
    if (a.ultPhase === 0) {
      if (a.ultT >= 0.3) { a.ultPhase = 1; a.ultT = 0; }
    } else if (a.ultPhase === 1) {
      const rate = 70 * (1 + 0.1 * (lv - 1));
      a.ultAcc += rate * dt;
      while (a.ultAcc >= 1) {
        a.ultAcc -= 1;
        randomTarget(46, 0.5, tgt);
        const fall = 0.45 + Math.random() * 0.15;
        mkFx('RAIN_ARROW', tgt.x, tgt.z, fall, fall + 0.3, 2.6, b * 2.4, 0, 0xffe8a0);
      }
      if (a.ultT >= dur) {
        a.ultPhase = 2; a.ultT = 0;
        // final volley: dense carpet arrows spreading outwards
        const n = 140;
        for (let i = 0; i < n; i++) {
          const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 46;
          const fall = 0.4 + (d / 46) * 0.5 + Math.random() * 0.1;
          mkFx('RAIN_ARROW', p.pos.x + Math.cos(ang) * d, p.pos.z + Math.sin(ang) * d * 0.65, fall, fall + 0.3, 3.4, b * 25 / 6, 0, 0xfff0b0);
        }
        events.emit('ultImpact', { pos: p.pos.clone(), name: 'FINAL_VOLLEY', radius: 46 });
        addShake(0.6); fovKick(0.6);
        a.tintTarget = 0.3;
      }
    } else if (a.ultT >= 1.2) { a.ultKind = 0; a.tintTarget = 0; }
    return;
  }

  if (a.ultKind === 2) {
    if (a.ultPhase === 1) {
      a.ultAcc += 9 * dt;
      while (a.ultAcc >= 1) {
        a.ultAcc -= 1;
        randomTarget(34, 0.55, tgt);
        mkFx('METEOR', tgt.x, tgt.z, 0.7, 0.95, 5, b * 5, 0, 0xff7a1a);
      }
      if (a.ultT >= 4) { a.ultKind = 0; a.tintTarget = 0; }
    }
    return;
  }

  // barbarian
  if (a.ultKind === 3) {
    const step = Math.floor(p.anim.stepPhase / Math.PI);
    if (step !== a.lastStep) {
      a.lastStep = step;
      if (Math.hypot(p.vel.x, p.vel.z) > 1) {
        damageEnemiesInRadius(p.pos.x, p.pos.z, 9, b * 3.5, physKnock);
        events.emit('quake', { pos: p.pos.clone(), radius: 9 });
        addShake(0.18);
      }
    }
    if (a.ultT >= 8 || p.titanT <= 0) {
      a.ultKind = 0; a.tintTarget = 0;
      finalSlam(b);
    }
  }
}

function finalSlam(b: number): void {
  const p = world.player;
  const px = p.pos.x, pz = p.pos.z;
  p.titanT = 0;
  stunSt.duration = 2;
  damageEnemiesInRadius(px, pz, 24, b * 12, physKnock, stunSt);
  for (let i = 0; i < 110; i++) {
    const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 48;
    mkFx('SPIKE', px + Math.cos(ang) * d, pz + Math.sin(ang) * d * 0.7, 0.15 + d / 55 + Math.random() * 0.1, 1.4 + d / 55, 3, b * 4, 1.0, 0xa89a80);
  }
  for (let i = 0; i < 28; i++) {
    const ang = Math.random() * 6.283, d = 4 + Math.random() * 38;
    mkFx('ROCK', px + Math.cos(ang) * d, pz + Math.sin(ang) * d * 0.7, 0.7 + Math.random() * 0.6, 1.9, 3.2, b * 3, 0, 0x8a7a6a);
  }
  events.emit('ultImpact', { pos: p.pos.clone(), name: 'TITAN_SLAM', radius: 48 });
  events.emit('shockwave', { pos: p.pos.clone(), radius: 40, color: 0xd99a4a });
  events.emit('crater', { pos: p.pos.clone(), radius: 11, color: 0x3a2a1a });
  hitStop(0.16, 0.04, true); fovKick(1); addShake(1);
}

function bigMeteorImpact(f: GroundFx): void {
  const st = useGameStore.getState();
  const a = abilityState;
  const px = f.x, pz = f.z;
  const R = 70;
  stunSt.duration = 1.5;
  const ids = world.enemyGrid.query(px, pz, R + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > R) continue;
    const fall = 1 - 0.55 * (d / R);
    if (d < 40) applyStatus(e, stunSt);
    burnSt.duration = 4; burnSt.value = f.dmg * 0.04;
    applyStatus(e, burnSt);
    if (!e.boss) {
      const k = (1 - d / R) * 32 + 6;
      const inv = 1 / (d || 1);
      e.knock.x += dx * inv * k; e.knock.z += dz * inv * k;
    }
    damageEnemy(e, f.dmg * fall, fireOpts);
  }
  mkZone('FIRE', px, pz, 10, 8, f.dmg * 0.05, 0xff5a1a);
  mkZone('SHOCKWAVE', px, pz, 60, 0.9, 0, 0xff8a40);
  events.emit('explosion', { pos: new Vector3(px, 0, pz), radius: 14, color: 0xff7a1a });
  events.emit('shockwave', { pos: new Vector3(px, 0, pz), radius: 60, color: 0xffb060 });
  events.emit('crater', { pos: new Vector3(px, 0, pz), radius: 13, color: 0x1a0a04 });
  events.emit('ultImpact', { pos: new Vector3(px, 0, pz), name: 'METEOR', radius: 60 });
  hitStop(0.2, 0.04, true); fovKick(1); addShake(1);
  a.ultPhase = 1; a.ultT = 0; a.ultAcc = 0;
  a.tintTarget = 0.28;
  void st;
}

// ============================================================ fx pool =======
function resolveFx(f: GroundFx): void {
  const pos = new Vector3(f.x, 0, f.z);
  switch (f.kind) {
    case 'RAIN_ARROW':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physOpts);
      events.emit('fxImpact', { pos, kind: 'RAIN_ARROW', radius: f.radius });
      break;
    case 'METEOR':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, fireOpts);
      mkZone('FIRE', f.x, f.z, 2.6, 2.5, f.dmg * 0.18, 0xff5a1a);
      events.emit('fxImpact', { pos, kind: 'METEOR', radius: f.radius });
      addShake(0.05);
      break;
    case 'SPIKE':
      stunSt.duration = f.aux;
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock, stunSt);
      events.emit('fxImpact', { pos, kind: 'SPIKE', radius: f.radius });
      break;
    case 'ROCK':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock);
      events.emit('fxImpact', { pos, kind: 'ROCK', radius: f.radius });
      break;
    case 'ARROW_STICK':
      if (f.dmg > 0) {
        damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock);
        events.emit('explosion', { pos, radius: f.radius * 0.8, color: 0xffd070 });
        addShake(0.25);
      }
      break;
    case 'TRAP': {
      freezeSt.duration = 1.2;
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, iceOpts, freezeSt);
      const lvq = useGameStore.getState().skillLevels.s4;
      mkZone('FROST_FIELD', f.x, f.z, f.aux, 5 + 0.5 * lvq, f.dmg * 0.25, 0x7fe0ff);
      events.emit('frostNova', { pos, radius: f.radius * 1.3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283 + f.seed * 6, d = 1.5 + (i % 2) * 1.6;
        mkFx('CRYSTAL', f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, 0, 4, 0, 0, 0, 0x9fe8ff);
      }
      addShake(0.15);
      break;
    }
    case 'PILLAR': {
      burnSt.duration = 4; burnSt.value = f.dmg * 0.06;
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, fireOpts, burnSt);
      mkZone('FIRE', f.x, f.z, f.radius * 0.7, 3.5, f.dmg * 0.15, 0xff5a1a);
      mkFx('RING', f.x, f.z, 0, 1.2, 0, f.dmg * 0.4, 17, 0xff7a1a);
      events.emit('explosion', { pos, radius: f.radius * 0.7, color: 0xff7a1a });
      addShake(0.3);
      break;
    }
    case 'BIG_METEOR': bigMeteorImpact(f); break;
    default: break;
  }
}

function stepFx(dt: number): void {
  const list = world.fx;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f.active) continue;
    f.t += dt;
    if (f.kind === 'RING') {
      const k = Math.min(1, f.t / f.life);
      const r = f.aux * Math.pow(k, 0.75);
      f.radius = r;
      f.sx += dt;
      if (f.sx >= 0.12) {
        f.sx = 0;
        const ids = world.enemyGrid.query(f.x, f.z, r + 5, out);
        for (let n = 0; n < ids.length; n++) {
          const e = world.enemies[ids[n]];
          if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
          const dx = e.pos.x - f.x, dz = e.pos.z - f.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (Math.abs(d - r) > 2.6) continue;
          burnSt.duration = 3; burnSt.value = f.dmg * 0.25;
          applyStatus(e, burnSt);
          damageEnemy(e, f.dmg, fireOpts);
        }
      }
    } else if (!f.done && f.t >= f.delay) {
      f.done = true;
      resolveFx(f);
    }
    if (f.t >= f.life) f.active = false;
  }
}

// ============================================================ per frame =====
export function updateAbilities(dt: number): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;

  stepFx(dt);
  updateUlt(dt);

  // screen tint easing
  a.tint += (a.tintTarget - a.tint) * Math.min(1, dt * 4);
  if (a.tintTarget === 0 && a.tint < 0.003) a.tint = 0;

  // ---- leap
  if (a.leapT > 0) {
    a.leapT -= dt;
    const k = 1 - Math.max(0, a.leapT) / a.leapDur;
    p.pos.x = a.leapSx + (a.leapTx - a.leapSx) * k;
    p.pos.z = a.leapSz + (a.leapTz - a.leapSz) * k;
    p.air = 6 * 4 * k * (1 - k);
    p.vel.set((a.leapTx - a.leapSx) / a.leapDur, 0, (a.leapTz - a.leapSz) / a.leapDur);
    p.facing = Math.atan2(a.leapTx - a.leapSx, a.leapTz - a.leapSz);
    if (a.leapT <= 0) {
      p.air = 0; p.vel.set(0, 0, 0);
      const lv = a.leapLv;
      const R = 9 + 0.5 * (lv - 1);
      stunSt.duration = 1;
      damageEnemiesInRadius(p.pos.x, p.pos.z, R, a.leapDmg, physKnock, stunSt);
      p.rageT = Math.max(p.rageT, 3 + lv + st.stats.rageBonus);
      events.emit('shockwave', { pos: p.pos.clone(), radius: R, color: 0xff5a3a });
      events.emit('crater', { pos: p.pos.clone(), radius: R * 0.7, color: 0x2a1408 });
      events.emit('quake', { pos: p.pos.clone(), radius: R });
      addShake(0.5);
    }
  }

  // ---- whirlwind
  if (p.whirlT > 0) {
    p.whirlT = Math.max(0, p.whirlT - dt);
    a.whirlTick += dt;
    const R = a.whirlR;
    // pull inward every frame
    const ids = world.enemyGrid.query(p.pos.x, p.pos.z, R + 8, out);
    const R2 = (R + 6) * (R + 6);
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.boss) continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      const d = Math.sqrt(d2) || 1;
      if (d < 1.8) continue;
      const step = Math.min(d - 1.8, 14 * dt);
      e.pos.x += (dx / d) * step; e.pos.z += (dz / d) * step;
    }
    if (a.whirlTick >= 0.15) {
      a.whirlTick = 0;
      const hits = damageEnemiesInRadius(p.pos.x, p.pos.z, R, a.whirlDmg, physOpts);
      if (hits > 0) healPlayer(Math.min(6, hits) * st.stats.maxHealth * (0.005 + 0.001 * (a.whirlLv - 1)));
    }
  }

  // ---- storm orbs
  if (a.orbT > 0) {
    a.orbT -= dt;
    a.orbTick -= dt;
    const n = a.orbN;
    const ang = world.time * 2.8;
    const fade = Math.min(1, a.orbT / 0.4);
    for (let i = 0; i < n; i++) {
      const o = a.orbs[i];
      const aa = ang + (i * 6.283) / n;
      o.x = p.pos.x + Math.cos(aa) * 4.5; o.z = p.pos.z + Math.sin(aa) * 4.5; o.y = 1.4 + Math.sin(world.time * 5 + i) * 0.2;
    }
    if (a.orbTick <= 0 && fade > 0.3) {
      a.orbTick = 0.4;
      for (let i = 0; i < n; i++) orbZap(a.orbs[i], a);
    }
    if (a.orbT <= 0) a.orbN = 0;
  }
}

const hitList: number[] = [];
const orbFrom = new Vector3();
function orbZap(o: { x: number; y: number; z: number }, a: typeof abilityState): void {
  const ids = world.enemyGrid.query(o.x, o.z, 18, out);
  let best = -1, bd = 16 * 16;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - o.x, dz = e.pos.z - o.z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e.id; }
  }
  if (best < 0) return;
  hitList.length = 0;
  let cur = world.enemies[best];
  orbFrom.set(o.x, o.y, o.z);
  events.emit('lightning', { from: orbFrom.clone(), to: new Vector3(cur.pos.x, 1.2, cur.pos.z) });
  damageEnemy(cur, a.orbDmg, elecOpts);
  hitList.push(cur.id);
  for (let c = 0; c < a.orbChain; c++) {
    const near = world.enemyGrid.query(cur.pos.x, cur.pos.z, 14, out);
    let nb: number = -1, nd = 12 * 12;
    for (let i = 0; i < near.length; i++) {
      const e = world.enemies[near[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || hitList.indexOf(e.id) !== -1) continue;
      const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z, d = dx * dx + dz * dz;
      if (d < nd) { nd = d; nb = e.id; }
    }
    if (nb < 0) break;
    const nx = world.enemies[nb];
    events.emit('lightning', { from: new Vector3(cur.pos.x, 1.2, cur.pos.z), to: new Vector3(nx.pos.x, 1.2, nx.pos.z) });
    damageEnemy(nx, a.orbDmg * 0.7, elecOpts);
    hitList.push(nx.id);
    cur = nx;
  }
}
