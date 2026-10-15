// ============================================================================
// Boss mechanics shared by every biome boss, layered on top of each boss's own attack table (bosses.ts / bosses2.ts):
//  - Cataclysm: a wide rain of falling rocks / fire / ice / void across the arena (some aimed at you and where you
//    are heading), each impact carrying the boss's crowd control (stun, root, slow, silence, burn, poison...).
//  - Quake: a big telegraphed ring around the boss with its signature crowd control.
//  - Ward: at 66% and 33% hp the boss turns immune until its crystals (or its summoned guard) are destroyed.
//  - Barrier: every boss periodically wraps itself in an absorb shield (bigger in later phases).
//  - Mend: some bosses channel a heal; deal 6% of its max hp during the channel to interrupt it.
//  - Crush: a heavy melee aimed at the NEAREST unit (summons included, e.g. Necromancer skeletons).
// All boss telegraphs are also drawn ~30% bigger and resolve ~12% sooner (enemies.ts `bossTel`).
// No allocations per frame: strikes live in a fixed pool.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy, EnemyKind } from '../types';
import type { BossKind } from '../enemyDefs';
import { damagePlayer, applyPlayerDebuff, type PlayerDebuff } from './combat';
import { damageMinion, nearestMinion } from './minions';
import { spawnEnemy, spawnTelegraphCircle, onEnemyDeath } from './enemies';
import { spawnHostileZone } from './tricks';
import { useGameStore } from '../../store';

interface Mech {
  cc: PlayerDebuff; ccDur: number;      // signature crowd control (quake + crush)
  rain: PlayerDebuff; rainDur: number;  // what a falling impact applies
  rainColor: number; rainWord: string;
  ward: 'CRYSTALS' | 'GUARD' | null; guard?: EnemyKind;
  heal: boolean;
}
const MECH: Record<BossKind, Mech> = {
  BOSS_GOLEM:   { cc: 'STUN', ccDur: 1.0, rain: 'STUN', rainDur: 0.6, rainColor: 0xb0a090, rainWord: 'Rockfall!', ward: 'CRYSTALS', heal: false },
  BOSS_TREANT:  { cc: 'ROOT', ccDur: 1.6, rain: 'POISON', rainDur: 3, rainColor: 0x84cc16, rainWord: 'Thorn rain!', ward: 'GUARD', guard: 'SPORECAP', heal: true },
  BOSS_HYDRA:   { cc: 'SLOW', ccDur: 3, rain: 'POISON', rainDur: 4, rainColor: 0x6ad04a, rainWord: 'Acid rain!', ward: 'CRYSTALS', heal: true },
  BOSS_WYRM:    { cc: 'STUN', ccDur: 1.1, rain: 'SLOW', rainDur: 3, rainColor: 0x8ae0ff, rainWord: 'Hailstorm!', ward: 'CRYSTALS', heal: false },
  BOSS_WARLORD: { cc: 'SILENCE', ccDur: 2.2, rain: 'BURN', rainDur: 3, rainColor: 0xff5a1a, rainWord: 'Meteor shower!', ward: 'GUARD', guard: 'HELLHOUND', heal: false },
  BOSS_WARMACH: { cc: 'STUN', ccDur: 1.0, rain: 'BURN', rainDur: 3, rainColor: 0xffa040, rainWord: 'Shelling!', ward: 'CRYSTALS', heal: false },
  BOSS_VOID:    { cc: 'SILENCE', ccDur: 2.4, rain: 'BLIND', rainDur: 2.5, rainColor: 0xa060ff, rainWord: 'Void rain!', ward: 'CRYSTALS', heal: true },
  BOSS_LICH:    { cc: 'SILENCE', ccDur: 2.0, rain: 'SLOW', rainDur: 2.5, rainColor: 0x7dd3fc, rainWord: 'Soulfire!', ward: 'GUARD', guard: 'CULTIST', heal: true },
};

// ---- tuning
const RAIN_CD = [12, 10, 8.5];      // by phase
const QUAKE_CD = 9;
const HEAL_CD = 26, HEAL_T = 3, HEAL_RATE = 0.025, HEAL_BREAK = 0.06;
const CRUSH_CD = 3.6, CRUSH_R = 3.4, CRUSH_WIND = 0.65, CRUSH_RANGE = 8;
const WARD_MAX_T = 35;
const BARRIER_CD = [20, 17, 14], BARRIER_HP = [0.06, 0.08, 0.1];   // by phase: seconds between barriers, shield as a share of max hp

// ---- strike pool (delayed AoE hits we resolve ourselves so they can carry crowd control and hit minions)
const MAX_STRIKES = 64;
const strikes = Array.from({ length: MAX_STRIKES }, () => ({ on: false, x: 0, z: 0, r: 0, t: 0, dmg: 0, minDmg: 0, cc: 'STUN' as PlayerDebuff, ccDur: 0 }));
const tv = new Vector3();
const S = { id: -1, barrierCd: 12, rainCd: 6, quakeCd: 5, healCd: 14, crushCd: 2, ward: 0, wardOn: false, wardT: 0, wards: [] as number[], healT: 0, healHp0: 0 };

export function resetBossMech(): void {
  S.id = -1; S.barrierCd = 12; S.rainCd = 6; S.quakeCd = 5; S.healCd = 14; S.crushCd = 2; S.ward = 0; S.wardOn = false; S.wardT = 0; S.wards.length = 0; S.healT = 0;
  for (const s of strikes) s.on = false;
}

const pwr = (e: Enemy): number => Math.max(e.projectileDamage, e.contactDamage * 0.8, 8);
const notify = (msg: string, color: string): void => useGameStore.getState().addNotification(msg, color, 'BOSS');

function strike(x: number, z: number, r: number, delay: number, dmg: number, minDmg: number, cc: PlayerDebuff, ccDur: number, color: number): void {
  for (const s of strikes) if (!s.on) {
    s.on = true; s.x = x; s.z = z; s.r = r; s.t = delay; s.dmg = dmg; s.minDmg = minDmg; s.cc = cc; s.ccDur = ccDur;
    spawnHostileZone('METEOR_SHADOW', x, z, r, delay, 0, color);   // the warning (visual only, fills up; we resolve the hit)
    return;
  }
}

let fxN = 0;
function resolve(s: (typeof strikes)[number]): void {
  const p = world.player;
  // impact: a dust ring + scorch every time, a full explosion only on every third (a rain of 25 must not white out)
  tv.set(s.x, 0, s.z);
  events.emit('shockwave', { pos: tv.clone(), radius: s.r * 1.1, color: 0x8a7a6a });
  if ((fxN++ % 3) === 0) events.emit('explosion', { pos: tv.clone(), radius: s.r * 0.7, color: 0xa04a1a });
  const dx = p.pos.x - s.x, dz = p.pos.z - s.z, rr = s.r + 0.5;
  if (p.alive && dx * dx + dz * dz < rr * rr) {
    tv.set(s.x, 0, s.z);
    damagePlayer(s.dmg, { pos: tv, kind: s.cc === 'BURN' ? 'FIRE' : s.cc === 'POISON' ? 'POISON' : s.cc === 'SLOW' ? 'ICE' : 'PHYSICAL' });
    if (s.ccDur > 0) applyPlayerDebuff(s.cc, s.ccDur, s.cc === 'BURN' || s.cc === 'POISON' ? s.dmg * 0.1 : s.cc === 'SLOW' ? 0.4 : 0);
  }
  if (s.minDmg > 0) {
    const M = world.minions;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && (m.x - s.x) ** 2 + (m.z - s.z) ** 2 < rr * rr) damageMinion(i, s.minDmg); }
  }
}

function arenaR(): number { return Math.max(14, world.room.radius * 0.85); }

/** Cataclysm: a wide rain of impacts over the arena, aimed bursts on the player and their heading. */
function rain(e: Enemy, m: Mech): void {
  const p = world.player, n = 12 + 4 * e.phase, R = arenaR(), dmg = pwr(e) * 1.1;
  events.emit('floatText', { pos: e.pos, text: m.rainWord, color: m.rainColor, scale: 1.2, dy: 5 });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
    strike(Math.cos(a) * d, Math.sin(a) * d, 2.6 + Math.random() * 1.0, 1.1 + Math.random() * 1.1, dmg, dmg * 0.6, m.rain, m.rainDur, m.rainColor);
  }
  // aimed: on the player, where they are running to, and a ring around them (no safe standing still)
  strike(p.pos.x, p.pos.z, 3.2, 1.2, dmg, 0, m.rain, m.rainDur, m.rainColor);
  strike(p.pos.x + p.vel.x * 1.1, p.pos.z + p.vel.z * 1.1, 3.0, 1.5, dmg, 0, m.rain, m.rainDur, m.rainColor);
  for (let i = 0; i < 4 + e.phase; i++) { const a = (i / (4 + e.phase)) * Math.PI * 2; strike(p.pos.x + Math.cos(a) * 5, p.pos.z + Math.sin(a) * 5, 2.6, 1.7, dmg, 0, m.rain, m.rainDur, m.rainColor); }
}

/** Quake: a big ring around the boss carrying its signature crowd control. */
function quake(e: Enemy, m: Mech): void {
  strike(e.pos.x, e.pos.z, e.radius + 6 + e.phase * 1.5, 1.15, pwr(e) * 1.3, pwr(e) * 1.5, m.cc, m.ccDur, 0xffd24a);
}

/** Ward: immune until the crystals (or the summoned guard) fall. */
function raiseWard(e: Enemy, m: Mech): void {
  S.wards.length = 0; S.wardOn = true; S.wardT = 0;
  const R = arenaR() * 0.7, n = 3 + e.phase;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    if (m.ward === 'CRYSTALS') tv.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    else tv.set(e.pos.x + Math.cos(a) * 4, 0, e.pos.z + Math.sin(a) * 4);
    const w = spawnEnemy(m.ward === 'CRYSTALS' ? 'BOSS_CRYSTAL' : m.guard!, tv);
    if (!w) continue;
    if (m.ward === 'CRYSTALS') { w.maxHp = Math.round(e.maxHp * 0.045); w.hp = w.maxHp; }
    else { w.maxHp = Math.round(w.maxHp * 1.5); w.hp = w.maxHp; }
    S.wards.push(w.id);
  }
  e.shield = 1;   // draws the shield bubble (damage is refused in combat.damageEnemy via bossWarded)
  events.emit('shockwave', { pos: e.pos.clone(), radius: 8, color: 0x8ab8ff });
  notify(m.ward === 'CRYSTALS' ? 'The boss is warded! Destroy the crystals!' : 'The boss is warded! Defeat its guard!', '#8ab8ff');
}

function wardAlive(): number {
  let n = 0;
  for (const id of S.wards) { const w = world.enemies[id]; if (w && w.active && w.state !== 'DYING') n++; }
  return n;
}

/** Advances the pending impacts (every frame, even while the boss is stunned). */
export function tickBossStrikes(dt: number): void {
  for (const s of strikes) if (s.on) { s.t -= dt; if (s.t <= 0) { s.on = false; resolve(s); } }
}

/** True while the boss refuses all damage (ward up). */
export function bossWarded(e: Enemy): boolean { return e.boss && S.wardOn && e.id === S.id; }

/**
 * Per-frame boss mechanics. Returns true when the boss is busy (healing channel) and its normal AI must be skipped.
 */
export function updateBossMech(e: Enemy, dt: number): boolean {
  const m = MECH[e.kind as BossKind];
  if (!m) return false;
  if (S.id !== e.id) { resetBossMech(); S.id = e.id; }
  if (e.state === 'SPAWN') return false;
  const hpF = e.hp / e.maxHp;

  // ward
  if (m.ward && !S.wardOn && ((S.ward === 0 && hpF < 0.66) || (S.ward === 1 && hpF < 0.33))) { S.ward++; raiseWard(e, m); }
  if (S.wardOn) {
    S.wardT += dt;
    if (wardAlive() === 0 || S.wardT > WARD_MAX_T) {
      S.wardOn = false; e.shield = 0;
      events.emit('explosion', { pos: e.pos, radius: e.radius * 2, color: 0x8ab8ff });
      events.emit('floatText', { pos: e.pos, text: 'WARD BROKEN', color: 0x8ab8ff, scale: 1.3, dy: 5 });
      e.staggerT = Math.max(e.staggerT, 2.5);   // staggered: a window to punish
    }
  }

  // barrier: a periodic absorb shield (Malakar's final fight has its own in bosses.ts)
  if (!S.wardOn && !world.boss.final) {
    S.barrierCd -= dt;
    if (S.barrierCd <= 0 && e.shield <= 0) {
      const ph = Math.min(2, e.phase | 0);
      S.barrierCd = BARRIER_CD[ph];
      e.shield = e.maxHp * BARRIER_HP[ph];
      events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 2.5, color: 0x93c5fd });
      events.emit('floatText', { pos: e.pos, text: 'BARRIER', color: 0x93c5fd, scale: 1.1, dy: 5 });
    }
  }

  // mend (healing channel; heavy damage interrupts it)
  if (S.healT > 0) {
    S.healT -= dt;
    e.vel.set(0, 0, 0);
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_RATE * dt);
    if (S.healHp0 - e.hp > e.maxHp * HEAL_BREAK + e.maxHp * HEAL_RATE * (HEAL_T - S.healT)) {
      S.healT = 0; e.staggerT = Math.max(e.staggerT, 1.5);
      events.emit('floatText', { pos: e.pos, text: 'INTERRUPTED', color: 0xffd24a, scale: 1.2, dy: 5 });
    }
    return S.healT > 0;
  }
  S.healCd -= dt;
  if (m.heal && S.healCd <= 0 && hpF < 0.7 && e.state !== 'WINDUP' && e.state !== 'ATTACK') {
    S.healCd = HEAL_CD; S.healT = HEAL_T; S.healHp0 = e.hp;
    spawnTelegraphCircle(e.pos.x, e.pos.z, e.radius + 2, HEAL_T, 0, 0x4ade80);
    events.emit('floatText', { pos: e.pos, text: 'HEALING...', color: 0x4ade80, scale: 1.2, dy: 5 });
    notify('The boss is healing! Hit it hard to interrupt!', '#4ade80');
    return true;
  }

  // crush: heavy melee on the nearest unit (a summon if one is closer than the hero)
  S.crushCd -= dt;
  if (S.crushCd <= 0) {
    const p = world.player;
    const mi = nearestMinion(e.pos.x, e.pos.z, e.radius + CRUSH_RANGE);
    const pd = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    let tx = NaN, tz = 0;
    if (mi >= 0) { const mm = world.minions[mi]; const md = Math.hypot(mm.x - e.pos.x, mm.z - e.pos.z); if (md < pd) { tx = mm.x; tz = mm.z; } }
    if (Number.isNaN(tx) && pd < e.radius + 4) { tx = p.pos.x; tz = p.pos.z; }
    if (!Number.isNaN(tx)) {
      S.crushCd = CRUSH_CD;
      strike(tx, tz, CRUSH_R, CRUSH_WIND, pwr(e) * 1.6, pwr(e) * 4, m.cc, m.ccDur * 0.5, 0xff3a2a);
    }
  }

  // cataclysm + quake
  S.rainCd -= dt; S.quakeCd -= dt;
  if (S.rainCd <= 0) { S.rainCd = RAIN_CD[Math.min(2, e.phase)]; rain(e, m); }
  else if (S.quakeCd <= 0) { S.quakeCd = QUAKE_CD - e.phase; quake(e, m); }
  return false;
}

/** Boss died / room left: drop the pending impacts and the ward. */
export function bossMechDied(): void {
  for (const id of S.wards) { const w = world.enemies[id]; if (w && w.active && w.state !== 'DYING' && w.kind === 'BOSS_CRYSTAL') onEnemyDeath(w); }   // (a summoned guard stays to be finished off)
  resetBossMech();
}
