// ============================================================================
// Extended hero kit (keys 4 / 5, slots 's5' / 's6'; class Lv 12 / 18). Two skills per class, each modelled on a proven
// skill from another game (sources in abilityDefs.ts). Damage goes through the normal pipeline (damageEnemy /
// damageEnemiesInRadius: skill damage, crit, life steal, co-op hit claims; knockdowns only via `down`, never bosses).
// Multi-frame effects use one small preallocated job pool (no per-frame allocations); FX reuse existing events.
// Own-hero effects simulate on the caster's screen (a guest's hits are forwarded to the host by combat.ts).
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { damageEnemy, damageEnemiesInRadius, applyStatus, healPlayer, addShake, type DamageOpts, type StatusEffect } from './combat';
import { spawnProjectile } from './projectiles';
import { mkFx } from './abilities';
import { hitRoomTraps, damageTrap, nearestTrap, trapAim, trapCount, trapAt, trapDist } from './roomTraps';
import type { Enemy } from '../types';

const J_AEGIS = 1, J_CHAIN = 2, J_HAMMER = 3, J_TRAP = 4, J_REND = 5, J_BLAST = 6;
interface Job {
  on: boolean; k: number; t: number; age: number; x: number; z: number; dmg: number; lv: number; n: number;
  r: number; life: number; tick: number; ang: number; flag: number; hit: number[];
}
const jobs: Job[] = Array.from({ length: 24 }, () => ({ on: false, k: 0, t: 0, age: 0, x: 0, z: 0, dmg: 0, lv: 1, n: 0, r: 0, life: 0, tick: 0, ang: 0, flag: 0, hit: [] }));
function newJob(k: number): Job | null {
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    if (!j.on) { j.on = true; j.k = k; j.t = 0; j.age = 0; j.n = 0; j.flag = 0; j.tick = 0; j.hit.length = 0; return j; }
  }
  return null;
}

// ------------------------------------------------------------------ corpses --
// Fallen monsters leave a corpse for CORPSE_LIFE s (Necromancer Corpse Explosion). Ring buffer, no allocation.
const CORPSE_LIFE = 8, CORPSE_MAX = 24;
const cx = new Float32Array(CORPSE_MAX), cz = new Float32Array(CORPSE_MAX), ct = new Float32Array(CORPSE_MAX).fill(-99);
let cHead = 0, exploding = false;
events.on('enemyDeath', (e) => {
  if (exploding || e.boss || e.poof) return;
  cx[cHead] = e.pos.x; cz[cHead] = e.pos.z; ct[cHead] = world.time; cHead = (cHead + 1) % CORPSE_MAX;
});
function corpseAlive(i: number): boolean { return ct[i] > -50 && world.time - ct[i] < CORPSE_LIFE && ct[i] <= world.time; }
/** Number of corpses lying around (Corpse Explosion needs at least one). */
export function corpseCount(): number { let n = 0; for (let i = 0; i < CORPSE_MAX; i++) if (corpseAlive(i)) n++; return n; }

// ------------------------------------------------------------------ helpers --
const v1 = new Vector3(), v2 = new Vector3();
const nIds: number[] = [], nD: number[] = [];
const gridOut: number[] = [];
/** The `n` nearest hittable enemies to (x,z) inside `range`, filled into nIds (returns the count). Allocation free. */
function nearestN(x: number, z: number, range: number, n: number): number {
  const ids = world.enemyGrid.query(x, z, range + 2, gridOut);
  nIds.length = 0; nD.length = 0;
  const r2 = range * range;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, d = dx * dx + dz * dz;
    if (d > r2) continue;
    let k = nD.length;
    if (k >= n && d >= nD[k - 1]) continue;
    if (k < n) { nD.push(d); nIds.push(ids[i]); k++; } else { nD[k - 1] = d; nIds[k - 1] = ids[i]; }
    while (k > 1 && nD[k - 1] < nD[k - 2]) {   // insertion sort step
      const td = nD[k - 1]; nD[k - 1] = nD[k - 2]; nD[k - 2] = td;
      const ti = nIds[k - 1]; nIds[k - 1] = nIds[k - 2]; nIds[k - 2] = ti; k--;
    }
  }
  return nIds.length;
}
/** Nearest un-hit enemy to (x,z) within `range`, or null. */
function nextTarget(x: number, z: number, range: number, hit: number[]): Enemy | null {
  const ids = world.enemyGrid.query(x, z, range + 2, gridOut);
  let best: Enemy | null = null, bd = range * range;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || hit.indexOf(e.id) !== -1) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/** (owner 2026-10-31: auto attack / skills must include stationaries) the single-target skills also strike a siege weapon / tower / statue:
 *  the targeted one (trapAim) if it is within `r` of (x,z), else the nearest one. Returns it (already hit) or null. */
function strikeTrap(x: number, z: number, r: number, dmg: number): boolean {
  let tr = trapAim.obj && !trapAim.obj.dead && trapDist(trapAim.obj, x, z) <= r ? trapAim.obj : null;
  if (!tr) tr = nearestTrap(x, z, r);
  if (!tr) return false;
  if (damageTrap(tr, dmg)) { v1.set(tr.x, 1.4, tr.z); events.emit('shieldBlock', { pos: v1, radius: 2.4, gold: true }); return true; }
  return false;
}
let hamTrapT = -9;   // Blessed Hammers: one stationary hit per 0.35 s (the hammers tick every 0.05 s)
const heroHp = (): number => useGameStore.getState().stats.maxHealth;

const aegisOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 0.5 };
const aegisStun: StatusEffect = { type: 'STUN', duration: 0.5 };
const hammerOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 0.3 };
const spearOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', down: 1.0, armorBreak: true };
const rendOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 0.4, armorBreak: true };
const trapOpts: DamageOpts = { kind: 'FIRE', source: 'PLAYER', knockback: 1.4, down: 1.0 };
const trapBurn: StatusEffect = { type: 'BURN', duration: 3, value: 0 };
const chainOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER' };
const novaOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER', knockback: 0.8, frost: true };
const novaSlow: StatusEffect = { type: 'SLOW', duration: 3, value: 0.5 };
const novaFreeze: StatusEffect = { type: 'FREEZE', duration: 1 };
const blastOpts: DamageOpts = { kind: 'POISON', source: 'PLAYER', knockback: 1.0 };
const blastPoison: StatusEffect = { type: 'POISON', duration: 3, value: 0 };
const siphonOpts: DamageOpts = { kind: 'POISON', source: 'PLAYER' };
const siphonPoison: StatusEffect = { type: 'POISON', duration: 4, value: 0 };
const slowArrow = { type: 'SLOW' as const, duration: 2, value: 0.35 };
const sortIds: number[] = [], sortAl: number[] = [];

export function resetExtras(): void {
  for (const j of jobs) j.on = false;
  ct.fill(-99); cHead = 0; exploding = false;
}

/** Casts the extended-kit skill of `hero` in `slot` ('s5' | 's6'). b = base damage unit, (dx,dz) aim direction, (tx,tz) aim point. */
export function castExtra(slot: 's5' | 's6', lv: number, hero: string, b: number, dx: number, dz: number, tx: number, tz: number): string {
  const p = world.player;
  const st = useGameStore.getState();
  if (hero === 'KNIGHT') {
    if (slot === 's5') {   // AEGIS THROW: a ricocheting shield
      const j = newJob(J_AEGIS);
      if (j) {
        j.x = p.pos.x; j.z = p.pos.z; j.dmg = b * 1.9; j.lv = lv; j.n = 3 + lv; j.t = 0.05; j.r = 24;   // r: first-hop reach
        const first = nextTarget(tx, tz, 9, j.hit) ?? nextTarget(p.pos.x, p.pos.z, 24, j.hit);
        if (first) j.hit.push(-first.id - 1);   // negative marker: the opening target (picked in the first step)
        else { j.on = false; if (!strikeTrap(tx, tz, 9, b * 1.9) && !strikeTrap(p.pos.x, p.pos.z, 24, b * 1.9)) { v1.set(tx, 1, tz); events.emit('shieldBlock', { pos: v1, radius: 3, gold: true }); } }
      }
      p.anim.attackT = 1; addShake(0.1);
      return 'AEGIS_THROW';
    }
    // BLESSED HAMMERS: hammers spiral outward around the hero
    const j = newJob(J_HAMMER);
    if (j) { j.n = 2 + lv; j.dmg = b * 1.5; j.life = 2.2 + 0.15 * lv; j.ang = Math.random() * 6.283; j.lv = lv; }
    p.anim.castT = 1; addShake(0.12);
    return 'BLESSED_HAMMERS';
  }
  if (hero === 'BARBARIAN') {
    if (slot === 's5') return castSpear(lv, b, dx, dz);
    // REND: two slashes, the first one heals
    const R = 8 + 0.4 * (lv - 1);
    const hits = damageEnemiesInRadius(p.pos.x, p.pos.z, R, b * 1.7, rendOpts, undefined, -1, 99);
    if (hits > 0) healPlayer(Math.min(5, hits) * heroHp() * (0.015 + 0.003 * (lv - 1)));
    p.rageT = Math.max(p.rageT, 1.5 + 0.5 * lv + st.stats.rageBonus);
    const j = newJob(J_REND);
    if (j) { j.t = 0.3; j.dmg = b * 1.7; j.r = R; }
    v1.set(p.pos.x, 0, p.pos.z);
    events.emit('shockwave', { pos: v1, radius: R, color: 0xd8322a });
    p.anim.attackT = 1; addShake(0.2);
    return 'REND';
  }
  if (hero === 'ARCHER') {
    if (slot === 's5') {   // EXPLOSIVE TRAP(s)
      const n = 1 + (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 4;
        const j = newJob(J_TRAP);
        if (!j) break;
        j.x = tx - dz * off; j.z = tz + dx * off; j.dmg = b * 4.2; j.r = 6 + 0.4 * (lv - 1); j.life = 8; j.lv = lv; j.tick = 0;
        mkFx('ARROW_STICK', j.x, j.z, 0, 8.2, 0, 0, 0, 0xff9a40);   // the planted trap (arrows in the ground)
        v1.set(j.x, 0, j.z); events.emit('fxImpact', { pos: v1, kind: 'RAIN_ARROW', radius: 1.6 });
      }
      p.anim.castT = 1;
      return 'FROST_FIELD';
    }
    // VAULT SHOT: backflip + arrow fan
    const inv = 0.35 + 0.05 * lv;
    p.dashDir.set(-dx, 0, -dz); p.dashT = 0.25; p.dashIframes = true; p.invulnT = Math.max(p.invulnT, inv);
    events.emit('dash', { from: p.pos.clone(), dir: p.dashDir.clone() });
    const n = [3, 3, 5, 5, 7][Math.min(5, Math.max(1, lv)) - 1];
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.17, c = Math.cos(a), s = Math.sin(a);
      spawnProjectile('ARROW', p.pos.x + dx, p.pos.z + dz, dx * c - dz * s, dx * s + dz * c, 38, b * 1.5, { life: 0.8, pierce: 2, radius: 1.6, knockback: 0.3, y: 1.3, effect: slowArrow });
    }
    p.facing = Math.atan2(dx, dz);
    return 'SHADOW_ROLL';
  }
  if (hero === 'WIZARD') {
    if (slot === 's5') {   // CHAIN LIGHTNING
      const j = newJob(J_CHAIN);
      if (j) {
        j.x = p.pos.x; j.z = p.pos.z; j.dmg = b * 3; j.n = 3 + lv; j.t = 0.02; j.r = 10; j.lv = lv;
        const first = nextTarget(tx, tz, 10, j.hit) ?? nextTarget(p.pos.x, p.pos.z, 22, j.hit);
        if (first) j.hit.push(-first.id - 1); else { j.on = false; strikeTrap(tx, tz, 10, j.dmg); }   // no monster: the bolt strikes a stationary
      }
      p.anim.castT = 1;
      return 'STORM_ORBS';
    }
    // FROST BARRIER: shield + nova
    const R = 8 + 0.4 * (lv - 1);
    damageEnemiesInRadius(p.pos.x, p.pos.z, R, b * 1.8, novaOpts, novaSlow);
    novaFreeze.duration = 0.8 + 0.1 * (lv - 1);
    damageEnemiesInRadius(p.pos.x, p.pos.z, R * 0.5, 0, novaOpts, novaFreeze);
    const hp = heroHp() * (0.06 + 0.009 * (lv - 1));   // (owner 2026-11-04) shield -70%
    p.arcane = Math.max(p.arcane, hp); p.arcaneMax = Math.max(p.arcaneMax, p.arcane); p.arcaneT = Math.max(p.arcaneT, 8);   // shares the purple Arcane Shield bar
    v1.set(p.pos.x, 0, p.pos.z);
    events.emit('frostNova', { pos: v1, radius: R * 1.1 });
    v2.set(p.pos.x, 1.2, p.pos.z);
    events.emit('shieldBlock', { pos: v2, radius: 3, gold: false });
    addShake(0.15);
    return 'CHAIN_FROST';
  }
  // NECROMANCER
  if (slot === 's5') {   // CORPSE EXPLOSION: the corpses nearest the aim point
    const n = 2 + lv, R = 4.5 + 0.2 * (lv - 1);
    let used = 0;
    for (let k = 0; k < n; k++) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < CORPSE_MAX; i++) {
        if (!corpseAlive(i)) continue;
        const ddx = cx[i] - tx, ddz = cz[i] - tz, d = ddx * ddx + ddz * ddz;
        const px = cx[i] - p.pos.x, pz = cz[i] - p.pos.z;
        if (px * px + pz * pz > 28 * 28) continue;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) break;
      const j = newJob(J_BLAST);
      if (!j) break;
      j.x = cx[best]; j.z = cz[best]; j.dmg = b * 3.2; j.r = R; j.t = 0.1 + used * 0.12; used++;
      ct[best] = -99;
      v1.set(j.x, 0.5, j.z); events.emit('telegraph', { pos: v1, radius: R, duration: j.t });
    }
    p.anim.castT = 1;
    return 'CURSE';
  }
  // SOUL SIPHON
  const n = 2 + lv;
  const cnt = nearestN(p.pos.x, p.pos.z, 16, n);
  siphonPoison.value = b * 0.3;
  let drained = 0;
  strikeTrap(p.pos.x, p.pos.z, 16, b * 1.8);
  for (let i = 0; i < cnt; i++) {
    const e = world.enemies[nIds[i]];
    applyStatus(e, siphonPoison);
    damageEnemy(e, b * 1.8, siphonOpts);
    v1.set(e.pos.x, 1, e.pos.z); events.emit('explosion', { pos: v1, radius: 1.8, color: 0x9b6bff });
    drained++;
  }
  if (drained > 0) healPlayer(drained * heroHp() * (0.015 + 0.004 * (lv - 1)));
  v2.set(p.pos.x, 1, p.pos.z); events.emit('explosion', { pos: v2, radius: 2.2, color: 0x6fe08a });
  p.anim.castT = 1;
  return 'CURSE';
}

/** Ancient Spear: skewers the nearest enemies in a lane and yanks them to the hero's feet (not bosses / mini-bosses: those are only hit). */
function castSpear(lv: number, b: number, dx: number, dz: number): string {
  const p = world.player;
  const L = 22 + (lv - 1), W = 1.7, N = 1 + Math.ceil(lv / 2);
  const ids = world.enemyGrid.query(p.pos.x + dx * L * 0.5, p.pos.z + dz * L * 0.5, L * 0.5 + 3, gridOut);
  sortIds.length = 0; sortAl.length = 0;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const ex = e.pos.x - p.pos.x, ez = e.pos.z - p.pos.z;
    const al = ex * dx + ez * dz, pe = Math.abs(ex * dz - ez * dx);
    if (al < 0 || al > L || pe > W + e.radius) continue;
    let k = sortAl.length;
    sortAl.push(al); sortIds.push(e.id);
    while (k > 0 && sortAl[k] < sortAl[k - 1]) { const ta = sortAl[k]; sortAl[k] = sortAl[k - 1]; sortAl[k - 1] = ta; const ti = sortIds[k]; sortIds[k] = sortIds[k - 1]; sortIds[k - 1] = ti; k--; }
  }
  for (let i = 0, nt = trapCount(); i < nt; i++) {   // the lane also skewers stationaries
    const o = trapAt(i);
    if (o.dead) continue;
    const ex = o.x - p.pos.x, ez = o.z - p.pos.z, al = ex * dx + ez * dz, pe = Math.abs(ex * dz - ez * dx);
    if (al > -o.rad && al < L + o.rad && pe <= W + o.rad) damageTrap(o, b * 3.6);
  }
  const n = Math.min(N, sortIds.length);
  for (let i = 0; i < n; i++) {
    const e = world.enemies[sortIds[i]];
    const al = sortAl[i];
    if (!e.boss && !e.mini && al > 3.5) { const k = 9 * (al - 3.5); e.knock.x -= dx * k; e.knock.z -= dz * k; }   // knock is a velocity: ~v/9 units of travel
    damageEnemy(e, b * 3.6, spearOpts);
  }
  // the spear's flight: an earth-crack lane + an impact burst at the furthest skewered enemy (or the lane's end)
  const endD = n > 0 ? sortAl[n - 1] : L;
  v1.set(p.pos.x, 0, p.pos.z); v2.set(dx, 0, dz);
  events.emit('fissure', { from: v1, dir: v2, length: endD });
  v1.set(p.pos.x + dx * endD, 0, p.pos.z + dz * endD);
  events.emit('shockwave', { pos: v1, radius: 3.2, color: 0xe8d8a8 });
  p.anim.attackT = 1; addShake(0.2);
  return 'EARTHSPLITTER';
}

function blast(x: number, z: number, r: number, dmg: number): void {
  exploding = true;   // corpses made by corpse blasts don't make new corpses
  blastPoison.value = dmg * 0.08;
  damageEnemiesInRadius(x, z, r, dmg, blastOpts, blastPoison);
  exploding = false;
  v1.set(x, 0.6, z);
  events.emit('explosion', { pos: v1, radius: r * 0.7, color: 0x8fe05a });
  events.emit('shockwave', { pos: v1, radius: r, color: 0xb8ff8a });
  addShake(0.15);
}

// ------------------------------------------------------------------ update --
const hitT = new Float32Array(400).fill(-9);   // per-enemy last Blessed Hammer hit time
export function updateExtras(dt: number): void {
  const p = world.player;
  for (let ji = 0; ji < jobs.length; ji++) {
    const j = jobs[ji];
    if (!j.on) continue;
    j.age += dt;
    switch (j.k) {
      case J_AEGIS: case J_CHAIN: {
        j.t -= dt;
        if (j.t > 0) break;
        const chain = j.k === J_CHAIN;
        let e: Enemy | null = null;
        if (j.hit.length === 1 && j.hit[0] < 0) { e = world.enemies[-j.hit[0] - 1]; j.hit[0] = e.id; if (!e.active || e.state === 'DYING') e = null; }
        else e = nextTarget(j.x, j.z, chain ? j.r : 11, j.hit);
        if (!e && j.hit.length > 0 && strikeTrap(j.x, j.z, chain ? j.r : 11, j.dmg * 0.8)) { j.on = false; break; }   // no monster left: the last hop hits a stationary
        if (!e) {
          if (!chain && j.flag === 0 && j.hit.length > 0) {   // a lone target: the shield flies back for one more hit
            j.flag = 1;
            const back = world.enemies[j.hit[j.hit.length - 1]];
            if (back.active && back.state !== 'DYING') { e = back; j.n = 1; } else { j.on = false; break; }
          } else { j.on = false; break; }
        }
        const fromX = j.x, fromZ = j.z;
        j.x = e.pos.x; j.z = e.pos.z;
        if (j.flag === 0) j.hit.push(e.id);
        if (chain) {
          v1.set(fromX, fromX === p.pos.x && j.hit.length === 1 ? 1.6 : 1.2, fromZ); v2.set(e.pos.x, 1.2, e.pos.z);
          events.emit('lightning', { from: v1, to: v2 });
          damageEnemy(e, j.dmg * Math.pow(0.92, j.hit.length - 1), chainOpts);
          j.t = 0.07;
        } else {
          aegisStun.duration = 0.4 + 0.1 * j.lv;
          applyStatus(e, aegisStun);
          damageEnemy(e, j.dmg * (j.flag ? 0.7 : 1), aegisOpts);
          healPlayer(heroHp() * 0.005);
          v1.set(e.pos.x, 1.2, e.pos.z); events.emit('shieldBlock', { pos: v1, radius: 2.2, gold: true });
          addShake(0.06);
          j.t = 0.1 + Math.hypot(e.pos.x - fromX, e.pos.z - fromZ) * 0.012;
        }
        if (--j.n <= 0) j.on = false;
        break;
      }
      case J_HAMMER: {
        j.tick -= dt;
        if (j.tick > 0) { if (j.age >= j.life) j.on = false; break; }
        j.tick = 0.05;
        const fade = j.age >= j.life; if (fade) { j.on = false; break; }
        const rad = 2.2 + j.age * 5.0, base = j.ang + j.age * 4.2;
        const show = (j.flag++ % 3) === 0;
        for (let i = 0; i < j.n; i++) {
          const a = base + (i * 6.2832) / j.n;
          const hx = p.pos.x + Math.cos(a) * rad, hz = p.pos.z + Math.sin(a) * rad;
          if (show) { v1.set(hx, 0.8, hz); events.emit('fxImpact', { pos: v1, kind: 'RAIN_ARROW', radius: 1.7 }); }
          if (world.time - hamTrapT >= 0.35 && hitRoomTraps(hx, hz, 2.0, j.dmg)) hamTrapT = world.time;
          const ids = world.enemyGrid.query(hx, hz, 5, gridOut);
          for (let q = 0; q < ids.length; q++) {
            const e = world.enemies[ids[q]];
            if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
            const ex = e.pos.x - hx, ez = e.pos.z - hz, rr = 2.0 + e.radius;
            if (ex * ex + ez * ez > rr * rr || world.time - hitT[e.id] < 0.35) continue;
            hitT[e.id] = world.time;
            const d = Math.hypot(ex, ez) || 1;
            v2.set(ex / d, 0, ez / d); hammerOpts.knockDir = v2;
            damageEnemy(e, j.dmg, hammerOpts);
          }
        }
        break;
      }
      case J_REND: {
        j.t -= dt;
        if (j.t > 0) break;
        j.on = false;
        damageEnemiesInRadius(p.pos.x, p.pos.z, j.r, j.dmg, rendOpts, undefined, -1, 99);
        v1.set(p.pos.x, 0, p.pos.z); events.emit('shockwave', { pos: v1, radius: j.r, color: 0xff6a3a });
        addShake(0.2);
        break;
      }
      case J_BLAST: {
        j.t -= dt;
        if (j.t > 0) break;
        j.on = false;
        blast(j.x, j.z, j.r, j.dmg);
        break;
      }
      case J_TRAP: {
        if (j.age < 0.5) break;
        j.tick -= dt;
        if (j.tick <= 0) { j.tick = 0.9; v1.set(j.x, 0.4, j.z); events.emit('fxImpact', { pos: v1, kind: 'RAIN_ARROW', radius: 1.2 }); }
        let go = j.age >= j.life;
        if (!go) {
          const ids = world.enemyGrid.query(j.x, j.z, 6, gridOut);
          for (let q = 0; q < ids.length && !go; q++) {
            const e = world.enemies[ids[q]];
            if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
            const ex = e.pos.x - j.x, ez = e.pos.z - j.z, rr = 2.8 + e.radius;
            if (ex * ex + ez * ez < rr * rr) go = true;
          }
        }
        if (!go && nearestTrap(j.x, j.z, 2.8)) go = true;   // a stationary next to the planted trap sets it off too
        if (!go) break;
        j.on = false;
        trapBurn.value = j.lv >= 3 ? j.dmg * 0.04 : 0;
        damageEnemiesInRadius(j.x, j.z, j.r, j.dmg, trapOpts, j.lv >= 3 ? trapBurn : undefined);
        v1.set(j.x, 0.6, j.z);
        events.emit('explosion', { pos: v1, radius: j.r * 0.7, color: 0xffa040 });
        events.emit('shockwave', { pos: v1, radius: j.r, color: 0xffd080 });
        addShake(0.3);
        break;
      }
      default: j.on = false;
    }
  }
}
