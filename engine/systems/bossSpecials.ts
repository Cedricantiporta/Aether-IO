// ============================================================================
// Boss & mini-boss signature attacks (telegraphed, readable, using the player debuffs).
// Same model as tricks.ts: the caster freezes while a scripted timeline (e.spT) runs; telegraph
// zones carry the damage / effect. Boss bar shows the ability name while casting.
//   Gorath   BOULDER PRISON, MAGMA VEINS         Lich  SOUL CHAINS
//   Slime King  BELLY FLOP (jump, tracking circle, fast drop), ACID FLOOD (one huge pool), ACID RAIN (many small pools)
//   Warden   RAISE THE DEAD   Captain AMBUSH   Behemoth PRISM BEAM   Old Tusk STAMPEDE   Shellback TIDAL SHELL
// ============================================================================
import { Vector3 } from 'three';
import { world, allocEnemy, allocFx } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { edgeLimit } from '../mapgen';
import {
  damagePlayer, applyPlayerDebuff, addShake,
} from './combat';
import { hooks } from './hooks';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import { spawnTelegraphCircle, spawnTelegraphLine, fireEnemyProjectile, spawnEnemy } from './enemies';
import { TRICK, raiseWallAt, spawnHostileZone } from './tricks';
import { mfx, spawnRune } from './voidFx';
import { bp } from './bossPhaseState';
import { KB } from './combat';

export const SP = { NONE: 0, PRISON: 21, VEINS: 22, CHAINS: 23, CLONES: 24, DEAD: 25, AMBUSH: 26, PRISM: 27, STAMPEDE: 28, SHELL: 29, SLAM: 30, FLOOD: 31, RAIN: 32 } as const;
/** Boulder Prison: rises this long after the shout, 15 of 16 rock slots (one small opening) at PRISON_R, meteor lands PRISON_FALL s later. */
const PRISON_RISE = 0.45, PRISON_N = 16, PRISON_R = 6.0, PRISON_FALL = 1.9;
export const SP_NAME: Record<number, string> = {
  21: 'Boulder Prison!', 22: 'Magma Veins!', 23: 'Soul Chains!', 24: 'Death Clones!', 25: 'Raise the Dead!', 26: 'Ambush!', 27: 'Prism Beam!', 28: 'Stampede!', 29: 'Tidal Shell!', 30: 'Belly Flop!', 31: 'Acid Flood!', 32: 'Acid Rain!',
};
const LIST: Partial<Record<string, number[]>> = {
  BOSS_GOLEM: [SP.PRISON, SP.VEINS], BOSS_LICH: [SP.CHAINS],
  ZOMBIE: [SP.DEAD], BANDIT: [SP.AMBUSH], CRYSTAL_GOLEMITE: [SP.PRISM], BOAR: [SP.STAMPEDE], ROCK_CRAB: [SP.SHELL],
  SPLITTER: [SP.SLAM, SP.FLOOD, SP.SLAM, SP.RAIN],   // only the Slime King (see setSlimeKing)
};
/** QA: how many times each special was cast. */
export const specialStats: Record<string, number> = {};
export function resetSpecials(): void { for (const k in specialStats) delete specialStats[k]; tether.active = false; prism.zone = null; slimeKingId = -1; }

/** The Meadow's depth-10 Slime King (a giant mini-boss SPLITTER): the only splitter with specials. */
let slimeKingId = -1;
export function setSlimeKing(id: number): void { slimeKingId = id; }
export function isSlimeKing(e: Enemy): boolean { return e.id === slimeKingId && e.kind === 'SPLITTER'; }
// Belly Flop timeline (s): crouch, leap out of sight, hang while the circle hunts you, lock, slam down fast.
const FLOP = { up: 0.45, top: 1.05, lock: 2.75, drop: 3.0, land: 3.62, end: 4.3, h: 24, r: 5.2 };   // (owner: slower drop 0.62 s, smaller circle 5.2)
/** Height of an enemy in a Belly Flop (enemies.ts writes it to pos.y; > 2 = airborne: untouchable, no contact). */
export function flopY(e: Enemy): number {
  if (e.spKind !== SP.SLAM) return 0;
  const t = e.spT;
  if (t < FLOP.up || t >= FLOP.land) return 0;
  if (t < FLOP.top) { const k = (t - FLOP.up) / (FLOP.top - FLOP.up); return FLOP.h * (1 - (1 - k) * (1 - k)); }
  if (t < FLOP.drop) return FLOP.h;
  const k = (t - FLOP.drop) / (FLOP.land - FLOP.drop); return FLOP.h * (1 - k * k);
}
/** A telegraph circle at exactly this size / duration (boss telegraph scaling would break the acid pools' match). */
function tel(x: number, z: number, r: number, life: number, dmg: number, color: number): import('../types').Zone | null {
  const zn = spawnTelegraphCircle(x, z, r, life, dmg, color);
  if (zn) { zn.radius = r; zn.life = zn.maxLife = life; }
  return zn;
}

const casts = new Map<number, number>();
interface Data { cx: number; cz: number; slots: number[]; ang: number; dirx: number; dirz: number; power: number; flags: number; zone: import('../types').Zone | null; }
const data = new Map<number, Data>();
const tv = new Vector3();
const tv2 = new Vector3();

/** Soul-chain tether (rendered by render/TrickFx). */
export const tether = { active: false, id: -1, t: 0, maxDist: 0, lx: 0, lz: 0 };
/** Prism beam state for rendering / QA. */
export const prism: { zone: import('../types').Zone | null } = { zone: null };
hooks.onCleanse = () => { if (tether.active) { tether.active = false; events.emit('trick', { pos: world.player.pos.clone(), kind: 'CHAINS_BREAK', radius: 2 }); } };

export function hasSpecial(e: Enemy): boolean {
  return (e.boss || e.mini) && !!LIST[e.kind] && (e.kind !== 'SPLITTER' || e.id === slimeKingId); }
export function initSpecial(e: Enemy): void { e.spCd = 3.5 + Math.random() * 3; e.spKind = 0; e.spT = 0; e.spStep = 0; }

function clampArena(v: Vector3, margin: number): void {
  const lim = edgeLimit(v.x, v.z, margin), d2 = v.x * v.x + v.z * v.z;
  if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); v.x *= s; v.z *= s; }
}
function stop(e: Enemy): void { e.vel.set(0, 0, 0); }
function power(e: Enemy): number { return Math.max(e.contactDamage, e.projectileDamage, 8) * (e.boss ? BOSS_SKILL_MUL : 1); }

export function cancelSpecial(e: Enemy): void {
  if (e.spKind === 0) return;
  if (e.spKind === SP.CHAINS && tether.id === e.id) tether.active = false;
  if (e.spKind === SP.PRISM && prism.zone) { prism.zone.active = false; prism.zone = null; }
  if (e.spKind === SP.SLAM) { const d = data.get(e.id); if (d?.zone && d.zone.active && e.spT < FLOP.land) d.zone.active = false; if (d) d.zone = null; }
  e.shellT = 0; e.hideT = 0;
  e.spKind = 0; e.spT = 0;
}

/** Called while the enemy acts. Returns true while a special is running (normal AI is skipped). */
export function updateSpecial(e: Enemy, dt: number): boolean {
  if (e.spKind === 0) { if (e.spCd > 0) e.spCd -= dt; return false; }
  e.spT += dt;
  const d = data.get(e.id)!;
  const p = world.player;
  const t = e.spT;
  stop(e);
  switch (e.spKind) {
    case SP.PRISON: {
      // (owner) the ring rises ON the hero (re-centred at the moment it rises), closed rocks shoulder to shoulder with ONE small opening
      // (dash cannot pass: the rocks are solid colliders), then a meteor falls into the middle
      if (e.spStep === 0 && t >= PRISON_RISE) {
        e.spStep = 1;
        tv.set(p.pos.x, 0, p.pos.z); clampArena(tv, PRISON_R + 1.5); d.cx = tv.x; d.cz = tv.z;
        const gap = (Math.random() * PRISON_N) | 0;
        for (let i = 0; i < PRISON_N; i++) {
          if (i === gap) continue;
          const a = (i / PRISON_N) * 6.283;
          raiseWallAt(d.cx + Math.sin(a) * PRISON_R, d.cz + Math.cos(a) * PRISON_R, 1.5, PRISON_FALL + 1.6, true);
        }
        const mz = spawnTelegraphCircle(d.cx, d.cz, PRISON_R - 0.6, PRISON_FALL, power(e) * 2.2, 0xef4444);
        if (mz) { mz.kb = KB.BOULDER.kb; mz.down = KB.BOULDER.down; }   // (owner) the meteor is rock: 3 s down
        const f = allocFx();
        if (f) { f.active = true; f.hostile = false; f.kind = 'BOSS_METEOR'; f.x = d.cx; f.z = d.cz; f.delay = PRISON_FALL; f.life = PRISON_FALL + 0.2; f.radius = PRISON_R; f.dmg = 0; f.aux = 0; f.color = 0xff7a1a; }
        events.emit('trick', { pos: tv.set(d.cx, 0, d.cz).clone(), kind: 'PRISON', radius: 7 });
        addShake(0.4);
      }
      if (e.spStep === 1 && t >= PRISON_RISE + PRISON_FALL) {
        e.spStep = 2;
        events.emit('ultImpact', { pos: tv.set(d.cx, 0, d.cz).clone(), name: 'METEOR', radius: PRISON_R * 1.4 });
        events.emit('crater', { pos: tv.set(d.cx, 0, d.cz).clone(), radius: PRISON_R * 0.7, color: 0x1a0d06 });
        addShake(0.8);
      }
      if (t >= PRISON_RISE + PRISON_FALL + 0.5) e.spKind = 0;
      break;
    }
    case SP.VEINS: {
      if (t >= 1.0) {
        const n = Math.min(10, Math.floor((t - 1.0) / 0.07) + 1);
        while (e.spStep < n) {
          const i = e.spStep++;
          for (let l = 0; l < 3; l++) {
            const a = d.ang + (l - 1) * 0.55, dist = 3 + i * 2.8;
            tv.set(e.pos.x + Math.sin(a) * dist, 0, e.pos.z + Math.cos(a) * dist); clampArena(tv, 2);
            spawnHostileZone('FIREPATCH', tv.x, tv.z, 2.1, 3.5, power(e) * 0.35, 0xff5a1a);
          }
        }
        if (e.spStep === 1) events.emit('trick', { pos: e.pos.clone(), kind: 'VEINS', radius: 28 });
      }
      if (t >= 2.2) e.spKind = 0;
      break;
    }
    case SP.CHAINS: {
      if (e.spStep === 0 && t >= 0.7) {
        e.spStep = 1;
        const dist = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        tether.active = true; tether.id = e.id; tether.t = 0; tether.maxDist = dist + 7;
        events.emit('trick', { pos: p.pos.clone(), kind: 'CHAINS', radius: 3 });
      }
      if (tether.active && tether.id === e.id) {
        tether.t += dt; tether.lx = e.pos.x; tether.lz = e.pos.z;
        const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dist = Math.hypot(dx, dz) || 1;
        if (p.alive && p.dashT <= 0 && p.stunT <= 0) { p.pos.x += (dx / dist) * 6.5 * dt; p.pos.z += (dz / dist) * 6.5 * dt; }
        if (dist > tether.maxDist || !p.alive) { tether.active = false; events.emit('trick', { pos: p.pos.clone(), kind: 'CHAINS_BREAK', radius: 2 }); e.spKind = 0; }
        else if (dist < 3.4) {
          tether.active = false;
          damagePlayer(power(e) * 1.1, { pos: e.pos, kind: 'MAGIC' });
          applyPlayerDebuff('SILENCE', 1.5);
          events.emit('trick', { pos: p.pos.clone(), kind: 'CHAINS_END', radius: 3 });
          e.spKind = 0;
        } else if (tether.t > 3.2) { tether.active = false; e.spKind = 0; }
      } else if (e.spStep === 1) e.spKind = 0;
      break;
    }
    case SP.DEAD: {
      if (e.spStep === 0 && t >= 1.0) {
        e.spStep = 1;
        if (world.director.aliveCount < 70) for (let i = 0; i < d.slots.length; i += 2) { tv.set(d.slots[i], 0, d.slots[i + 1]); const z = spawnEnemy('ZOMBIE', tv); if (z) z.stateT = 0.3; }
        events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 8 });
        addShake(0.3);
      }
      if (t >= 1.6) e.spKind = 0;
      break;
    }
    case SP.AMBUSH: {
      if (e.spStep === 0) { e.hideT = 1.6; e.spStep = 1; spawnHostileZone('SMOKE', e.pos.x, e.pos.z, 4, 3.5, 0, 0x6b7280); events.emit('trick', { pos: e.pos.clone(), kind: 'SMOKE', radius: 4 }); }
      if (e.spStep === 1 && t >= 0.9) {
        e.spStep = 2; e.hideT = 0;
        tv.set(p.pos.x - Math.sin(p.facing) * 3.6, 0, p.pos.z - Math.cos(p.facing) * 3.6); clampArena(tv, 3);
        e.pos.set(tv.x, 0, tv.z);
        const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
        d.dirx = dx / l; d.dirz = dz / l; e.facing = Math.atan2(d.dirx, d.dirz); e.dir.set(d.dirx, 0, d.dirz);
        spawnTelegraphLine(e.pos.x, e.pos.z, d.dirx, d.dirz, 12, 3.8, 0.5, 0xef4444)!.damage = power(e) * 2.2;
        events.emit('trick', { pos: e.pos.clone(), kind: 'SMOKE', radius: 4 });
      }
      if (e.spStep === 2 && t >= 1.4) e.spStep = 3;
      if (e.spStep === 3) e.vel.set(d.dirx * 30, 0, d.dirz * 30); // the dash-slash
      if (e.spStep === 3 && t >= 1.75) {
        e.spStep = 4;
        const z = spawnTelegraphCircle(p.pos.x, p.pos.z, 3, 0.7, power(e), 0x9ca3af);
        if (z) { z.trick = TRICK.CALTROPS; z.damage = power(e); }
      }
      if (t >= 2.4) e.spKind = 0;
      break;
    }
    case SP.PRISM: {
      const w = 1.0, dur = 3.6;
      const ang = d.ang + Math.min(1.1, t) * 0 + (t > w ? (t - w) * 1.0 : 0);
      const z = prism.zone;
      if (z && z.active) {
        z.pos.set(e.pos.x, 0, e.pos.z); z.dir.set(Math.sin(ang), 0, Math.cos(ang));
        z.maxLife = 1; z.life = t < w ? Math.max(0.06, 1 - t / w * 0.9) : 0.04; // fills during the wind-up, solid while firing
      }
      if (t >= w && z) {
        if ((e.spStep & 1) === 0 && Math.floor(t * 8) !== Math.floor((t - dt) * 8)) {
          const rx = p.pos.x - e.pos.x, rz = p.pos.z - e.pos.z;
          const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
          if (p.alive && along > 0 && along < z.length && perp < 1.3 + 0.6) {
            damagePlayer(power(e) * 0.28, { pos: e.pos, kind: 'MAGIC' });
            if (world.time - d.power > 0.6) { d.power = world.time; applyPlayerDebuff('BLIND', 0.9); }
          }
        }
      }
      if (e.spStep === 0 && t >= w) { e.spStep = 2; events.emit('trick', { pos: e.pos.clone(), kind: 'PRISM', radius: 36 }); for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283, r = 6 + Math.random() * 6; raiseWallAt(p.pos.x + Math.sin(a) * r, p.pos.z + Math.cos(a) * r, 1.3, 4, false); } }
      if (t >= dur) { if (z) z.active = false; prism.zone = null; e.spKind = 0; }
      break;
    }
    case SP.STAMPEDE: {
      if (t >= 2.0) e.spKind = 0;
      break;
    }
    case SP.SHELL: {
      e.shellT = Math.max(e.shellT, 0.2);
      if (t < 1.2) { stop(e); }
      else {
        if (e.spStep === 0) { e.spStep = 1; const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, l = Math.hypot(dx, dz) || 1; d.dirx = dx / l; d.dirz = dz / l; events.emit('trick', { pos: e.pos.clone(), kind: 'SHELL_SPIN', radius: 4 }); }
        e.state = 'ATTACK';
        e.vel.set(d.dirx * 15, 0, d.dirz * 15);
        e.facing += dt * 14;
      }
      if (t >= 3.8) { e.shellT = 0; e.state = 'CHASE'; e.stateT = 0; e.spKind = 0; }
      break;
    }
    case SP.SLAM: {
      const z = d.zone;
      if (z && z.active && t < FLOP.lock) {   // the shadow circle hunts you (a bit slower than you run)
        const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.05) { const k = Math.min(l, 8.5 * dt) / l; z.pos.x += dx * k; z.pos.z += dz * k; }
      }
      if (z && t >= FLOP.top && t < FLOP.land) { e.pos.x = z.pos.x; e.pos.z = z.pos.z; }   // hangs right above it
      if (e.spStep === 0 && t >= FLOP.up) { e.spStep = 1; events.emit('trick', { pos: e.pos.clone(), kind: 'TAKEOFF', radius: 5 }); addShake(0.15); }
      if (e.spStep === 1 && t >= FLOP.land) {   // SPLAT (the zone's expiry deals the hit + shake)
        e.spStep = 2;
        if (z) { e.pos.x = z.pos.x; e.pos.z = z.pos.z; }
        spawnHostileZone('ACID', e.pos.x, e.pos.z, 3, 4, power(e) * 0.25, 0x9be32a);
        events.emit('trick', { pos: e.pos.clone(), kind: 'ACID', radius: FLOP.r });
        events.emit('shockwave', { pos: e.pos.clone(), radius: FLOP.r, color: 0x9be32a });
        addShake(0.55);
        if (world.director.aliveCount < 60) for (let i = 0; i < 2 + e.phase; i++) {
          const a = Math.random() * 6.283; tv.set(e.pos.x + Math.sin(a) * 3, 0, e.pos.z + Math.cos(a) * 3); clampArena(tv, 2);
          const sl = spawnEnemy('SLIME', tv); if (sl) { sl.stateT = 0.3; sl.knock.set(Math.sin(a) * 7, 0, Math.cos(a) * 7); }
        }
      }
      if (t >= FLOP.end) { d.zone = null; e.spKind = 0; }   // (a short stuck-in-the-mud moment after landing)
      break;
    }
    case SP.FLOOD: {
      if (e.spStep === 0 && t >= 1.5) {
        e.spStep = 1;
        spawnHostileZone('ACID', d.cx, d.cz, 8.5, 7, power(e) * 0.32, 0x9be32a);
        events.emit('trick', { pos: tv.set(d.cx, 0, d.cz).clone(), kind: 'ACID', radius: 8.5 });
        addShake(0.3);
      }
      if (t >= 2.0) e.spKind = 0;
      break;
    }
    case SP.RAIN: {
      const n = d.slots.length / 2;
      while (e.spStep < n && t >= 1.0 + e.spStep * 0.09) {
        const i = e.spStep++;
        spawnHostileZone('ACID', d.slots[i * 2], d.slots[i * 2 + 1], 2.1, 6, power(e) * 0.3, 0x9be32a);
        if ((i & 1) === 0) events.emit('trick', { pos: tv.set(d.slots[i * 2], 0, d.slots[i * 2 + 1]).clone(), kind: 'ACID', radius: 2.1 });
      }
      if (t >= 1.0 + n * 0.09 + 0.4) e.spKind = 0;
      break;
    }
    default: e.spKind = 0;
  }
  if (e.spKind === 0) { cancelSpecial(e); e.attackCd = Math.max(e.attackCd, 0.6); }
  return true;
}

/** Shellback bounces off obstacles while spinning. */
export function shellBounce(e: Enemy): void {
  const d = data.get(e.id); if (!d) return;
  const a = Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z) + (Math.random() - 0.5) * 1.6;
  d.dirx = Math.sin(a); d.dirz = Math.cos(a);
  events.emit('trick', { pos: e.pos.clone(), kind: 'SHELL_BOUNCE', radius: 2 });
}

/** Starts a special if off cooldown (boss / mini-boss, in CHASE/KITE). */
export function tryStartSpecial(e: Enemy, tdist: number): boolean {
  if (e.spCd > 0 || (e.state !== 'CHASE' && e.state !== 'KITE') || !world.player.alive || e.staggerT > 0) return false;
  const list = LIST[e.kind]; if (!list) return false;
  const n = casts.get(e.id) ?? 0;
  const id = list[n % list.length];
  if (e.mini && tdist > 26) return false;
  if (id === SP.AMBUSH && tdist > 20) return false;
  casts.set(e.id, n + 1);
  e.spKind = id; e.spT = 0; e.spStep = 0;
  e.spCd = (e.boss ? 13 : 15) * (1 - 0.17 * e.phase) * (0.9 + Math.random() * 0.2);
  specialStats[SP_NAME[id]] = (specialStats[SP_NAME[id]] ?? 0) + 1;
  const b = world.boss;
  b.ability = SP_NAME[id]; b.abilityT = 2.6;
  const p = world.player.pos;
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
  const d: Data = { cx: p.x, cz: p.z, slots: [], ang: Math.atan2(dx, dz), dirx: dx / l, dirz: dz / l, power: -10, flags: 0, zone: null };
  data.set(e.id, d);
  const pw = power(e);
  switch (id) {
    case SP.PRISON: break;   // (the ring is placed when it rises, see updateSpecial)
    case SP.VEINS:
      for (let l2 = 0; l2 < 3; l2++) {
        const a = d.ang + (l2 - 1) * 0.55;
        const z = spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 30, 3.4, 1.0, 0xff6a1a);
        if (z) z.damage = pw * 1.3;
      }
      break;
    case SP.CHAINS: spawnTelegraphCircle(p.x, p.z, 2.2, 0.7, 0, 0xc084fc); break;
    case SP.CLONES: spawnTelegraphCircle(e.pos.x, e.pos.z, 6, 0.8, 0, 0x38bdf8); break;
    case SP.DEAD: {
      const N = 6, base = Math.random() * 6.283;
      for (let i = 0; i < N; i++) {
        const a = base + (i / N) * 6.283;
        tv.set(e.pos.x + Math.sin(a) * 7, 0, e.pos.z + Math.cos(a) * 7); clampArena(tv, 3);
        d.slots.push(tv.x, tv.z);
        spawnTelegraphCircle(tv.x, tv.z, 2.2, 1.0, 0, 0x84cc16);
      }
      const z = spawnTelegraphCircle(e.pos.x, e.pos.z, 12, 1.0, 0, 0xa855f7);
      if (z) z.trick = TRICK.CURSE;
      break;
    }
    case SP.PRISM: {
      d.ang = d.ang - 1.1; // sweep starts to the player's left
      const z = spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(d.ang), Math.cos(d.ang), 36, 2.6, 100, 0xe879f9);
      if (z) { z.damage = 0; prism.zone = z; z.life = z.maxLife = 1; }
      break;
    }
    case SP.STAMPEDE: {
      const ux = d.dirx, uz = d.dirz, vx = -uz, vz = ux;
      const side = Math.random() < 0.5 ? -1 : 1;   // (owner: only 2 lanes: one on the hero, one beside it)
      for (let i = 0; i < 2; i++) {
        const off = i === 0 ? 0 : side * 6;
        tv.set(p.x - ux * 22 + vx * off, 0, p.z - uz * 22 + vz * off);
        const z = spawnTelegraphLine(tv.x, tv.z, ux, uz, 44, 3.4, 1.0 + i * 0.18, 0xfbbf24);
        if (z) { z.trick = TRICK.STAMPEDE; z.damage = pw * 1.6; }
      }
      break;
    }
    case SP.SHELL: break;
    case SP.SLAM: d.zone = tel(p.x, p.z, FLOP.r, FLOP.land, pw * 2.2, 0x9be32a); if (d.zone) { d.zone.kb = KB.SLAM.kb; d.zone.down = KB.SLAM.down; } break;   // (owner) the Slime King's slam knocks you down
    case SP.FLOOD: tel(p.x, p.z, 8.5, 1.5, 0, 0x9be32a); break;
    case SP.RAIN: {
      const N = 9 + 3 * e.phase;
      for (let i = 0; i < N; i++) {
        if (i === 0) tv.set(p.x, 0, p.z);
        else { const a = Math.random() * 6.283, r = 3.5 + Math.random() * 10; tv.set(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r); clampArena(tv, 2); }
        d.slots.push(tv.x, tv.z);
        tel(tv.x, tv.z, 2.1, 1.0 + i * 0.09, 0, 0x9be32a);
      }
      break;
    }
    default: break;
  }
  events.emit('trick', { pos: e.pos.clone(), kind: 'BOSS_CAST', radius: 6 });
  void tv2; void fireEnemyProjectile;
  return true;
}

// ------------------------------------------------------------ Void Herald illusions --
/** The Void Herald's illusions: up to `max` (4) copies of the boss with his current HP and half his armour. They cast his basic volleys (orb fans and rings)
 *  for `life` seconds, then fade. No rewards. The Herald and every live illusion then teleport ONCE into an even ring round the hero. */
export function countIllusions(): number {
  let have = 0;
  for (const o of world.enemies) if (o.active && o.decoy && o.trickKind === 1 && o.state !== 'DYING') have++;
  return have;
}
/** `ring` = also do the teleport. */
export function spawnIllusions(real: Enemy, n: number, life: number, max = 4, ring = true): void {
  let have = countIllusions();
  for (let k = 0; k < n && have < max; k++, have++) {
    const e = allocEnemy();
    if (!e) break;
    e.kind = real.kind; e.boss = false; e.elite = false; e.decoy = true; e.bossAdd = false; e.trickKind = 1; e.trickT = life;
    e.pos.set(real.pos.x, 0, real.pos.z); e.maxHp = real.maxHp; e.hp = Math.max(1, real.hp);   // same X/X as the Herald's bar, to confuse
    e.shield = 0;
    e.armor = real.armor * 0.5; e.staggerMax = 0; e.stagger = 0; e.staggerT = 0;   // same HP as Malakar, half his defense
    e.speed = real.speed; e.radius = real.radius; e.scale = real.scale;
    e.contactDamage = 0; e.projectileDamage = real.projectileDamage; e.xp = 0; e.gold = 0;
    e.state = 'CHASE'; e.stateT = 0; e.attackCd = 2 + Math.random(); e.facing = real.facing; e.active = true; e.spT = 0; e.pattern = 0;
  }
  if (ring) ringTeleport(real);
}

const ringA: Enemy[] = [null as unknown as Enemy, null as unknown as Enemy, null as unknown as Enemy, null as unknown as Enemy, null as unknown as Enemy];
/** One teleport: the Herald and the live illusions land evenly spaced on a ring (radius ~12) around the hero, random starting angle and order. */
function ringTeleport(real: Enemy): void {
  let n = 0; ringA[n++] = real;
  for (const o of world.enemies) if (n < 5 && o.active && o.decoy && o.trickKind === 1 && o.state !== 'DYING') ringA[n++] = o;
  for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const x = ringA[i]; ringA[i] = ringA[j]; ringA[j] = x; }   // who stands where is random
  const p = world.player.pos, base = Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    const o = ringA[i], a = base + (i / n) * 6.283;
    tv.set(p.x + Math.sin(a) * 12, 0, p.z + Math.cos(a) * 12); clampArena(tv, 4);
    spawnRune(o.pos.x, o.pos.z); spawnRune(tv.x, tv.z);   // departure + arrival circles
    o.pos.set(tv.x, 0, tv.z);
    events.emit('spawn', { pos: o.pos, kind: o.kind, elite: false });
    events.emit('explosion', { pos: o.pos.clone(), radius: 2.5, color: 0x7c3aed });
  }
}

function updateIllusion(e: Enemy, dt: number): void {
  const p = world.player.pos, s2 = world.boss.stage === 2;
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z, dist = Math.hypot(dx, dz) || 1, ux = dx / dist, uz = dz / dist;
  e.facing = Math.atan2(dx, dz);
  // keep a casting distance, strafing around the hero
  const sp = e.speed * 0.8, side = (e.id & 1) ? 1 : -1;
  const mx = dist < 9 ? -ux : dist > 15 ? ux : uz * side * 0.5, mz = dist < 9 ? -uz : dist > 15 ? uz : -ux * side * 0.5;
  e.pos.x += mx * sp * dt; e.pos.z += mz * sp * dt; clampArena(e.pos, 3);
  e.attackCd -= dt;
  if (e.attackCd <= 0) {
    if (mfx.major) { e.attackCd = Math.max(e.attackCd, 0.5); return; }   // his basic volleys hold while Malakar runs a major skill
    e.attackCd = (s2 ? 3.0 : 3.8) + Math.random() * 1.0;   // (4 copies: each one fires a little less often)
    const spd = s2 ? 12 : 9.5, r = s2 ? 0.7 : 0.5;
    if ((e.pattern++ & 1) === 0) {   // fan of 5 orbs at the hero
      const b = Math.atan2(ux, uz);
      for (let i = -2; i <= 2; i++) { tv.set(Math.sin(b + i * 0.24), 0, Math.cos(b + i * 0.24)); fireEnemyProjectile(e.pos, tv, 'BOSS_ORB', spd + 3, e.projectileDamage * 0.7, { life: 4, radius: r * 1.4, dark: true }); }
    } else {   // ring of orbs
      const m = s2 ? 12 : 9, b = Math.random() * 6.283;
      for (let i = 0; i < m; i++) { const a = b + (i / m) * 6.283; tv.set(Math.sin(a), 0, Math.cos(a)); fireEnemyProjectile(e.pos, tv, 'BOSS_ORB', spd, e.projectileDamage * 0.55, { life: 5, radius: r * 1.4, dark: true }); }
    }
  }
  if (e.stateT > e.trickT) popDecoy(e);
}

export function updateDecoy(e: Enemy, dt: number): void {
  e.stateT += dt; e.animT += dt;
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6.5);
  updateIllusion(e, dt);
}
export function popDecoy(e: Enemy): void {
  if (!e.active || e.state === 'DYING') return;
  e.state = 'DYING'; e.stateT = 0; e.deathT = 0; e.hp = 0;
  events.emit('explosion', { pos: e.pos.clone(), radius: 3, color: 0x7c3aed });
  events.emit('trick', { pos: e.pos.clone(), kind: 'DECOY_POP', radius: 3 });
}
export function clearDecoys(): void {
  for (const e of world.enemies) if (e.active && e.decoy && e.state !== 'DYING') popDecoy(e);
}
