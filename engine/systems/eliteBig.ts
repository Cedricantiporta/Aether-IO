// ============================================================================
// Elite signature BIG attack (the Phalanx-Captain-style ground telegraph, for ordinary elites).
// One archetype per monster family, all built on the shared telegraph zones (spawnTelegraph*), so the warning is the same
// readable purple / orange shape the mini-bosses use. Windup 0.85-1.1 s (dodgeable), 6-9 s cooldown, then a ~1.4 s
// punish window (e.winT: dizzy stars + WINDED_DMG_MULT, same as bosses). Mini-bosses keep their own slam (enemies.ts miniSlam).
//   SLAM  circle around the elite       CONE  frontal cleave        LINE  charge / lunge rectangle
//   RAIN  5 marked circles on the hero  RING  ring of orbs after a charge-up
// Resolution rides Zone.trick (ids 20-24, routed from tricks.resolveTrick) so it fires exactly when the telegraph fills.
// No per-frame allocation: all state lives on the pooled Enemy (bigCd/bigT/bigRec/bigDash/bigKind).
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy, EnemyKind, Zone } from '../types';
import { damagePlayer, applyPlayerDebuff, KB } from './combat';
import { spawnTelegraphCircle, spawnTelegraphLine, spawnTelegraphCone, fireEnemyProjectile, enter, requestYaw } from './enemies';
import { inCone } from './bossFx';

export const EB = { SLAM: 20, CONE: 21, LINE: 22, RAIN: 23, RING: 24 } as const;
export const isEliteBigTrick = (id: number): boolean => id >= EB.SLAM && id <= EB.RING;

const FAMILY: Partial<Record<EnemyKind, number>> = {
  // heavy melee: ground slam
  BRUTE: EB.SLAM, YETI: EB.SLAM, SHIELDBEARER: EB.SLAM, ROCK_CRAB: EB.SLAM, CRYSTAL_GOLEMITE: EB.SLAM, SLIME: EB.SLAM, SPLITTER: EB.SLAM, SPORECAP: EB.SLAM,
  // blade / claw users: frontal cone cleave
  HAUNTED_ARMOR: EB.CONE, SCORPION: EB.CONE, ZOMBIE: EB.CONE, GOBLIN: EB.CONE, MUMMY: EB.CONE, SKELETON_WARRIOR: EB.CONE,
  // chargers and pouncers: line lunge
  BOAR: EB.LINE, WRAITH: EB.LINE, BANDIT: EB.LINE, DIREWOLF: EB.LINE, HELLHOUND: EB.LINE, GARGOYLE: EB.LINE, VOID_STALKER: EB.LINE,
  // archers and casters: delayed rain on marked circles
  SKELETON_ARCHER: EB.RAIN, CULTIST: EB.RAIN, SKELETON_MAGE: EB.RAIN, CINDER_SHAMAN: EB.RAIN,
  // floaters: nova ring of orbs
  FROST_WISP: EB.RING, VOID_EYE: EB.RING,
};

const CD_MIN = 6, CD_MAX = 9;          // seconds between big attacks (random)
const FIRST_MIN = 3, FIRST_MAX = 6.5;  // first one after spawning
const REC_MIN = 1.2, REC_MAX = 1.6;    // punish window
const LAUNCH_GAP = 1.0;                // two elites never begin a big attack within this many seconds of each other
const DASH_T = 0.3;
let lastLaunch = -9;
const tv = new Vector3();

export function hasEliteBig(kind: EnemyKind): boolean { return FAMILY[kind] !== undefined; }

export function initEliteBig(e: Enemy): void {
  e.bigT = 0; e.bigRec = 0; e.bigDash = 0; e.bigKind = 0;
  e.bigCd = FIRST_MIN + Math.random() * (FIRST_MAX - FIRST_MIN);
}

/** Per-frame: counts the cooldown down while idle, drives windup / dash / recovery. Returns true while the elite is busy. */
export function updateEliteBig(e: Enemy, dt: number): boolean {
  if (e.bigT > 0) {
    e.bigT -= dt; e.vel.set(0, 0, 0);
    requestYaw(e.bigKind === EB.LINE || e.bigKind === EB.CONE ? Math.atan2(e.dir.x, e.dir.z) : Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z));
    if (e.bigT <= 0) {   // the telegraph zone resolves on its own this frame; lunges now actually travel
      e.bigT = 0;
      e.bigRec = REC_MIN + Math.random() * (REC_MAX - REC_MIN);
      if (e.bigKind === EB.LINE) { e.bigDash = DASH_T; enter(e, 'ATTACK'); } else enter(e, 'RECOVER');
    }
    return true;
  }
  if (e.bigDash > 0) {
    e.bigDash -= dt;
    const sp = Math.max(e.speed, 3) * 4.2;
    e.vel.set(e.dir.x * sp, 0, e.dir.z * sp);
    requestYaw(Math.atan2(e.dir.x, e.dir.z));
    if (e.bigDash <= 0) { e.bigDash = 0; enter(e, 'RECOVER'); }
    return true;
  }
  if (e.bigRec > 0) {   // punish window: stands there panting, takes +10% (combat.ts winT)
    e.bigRec -= dt; e.vel.set(0, 0, 0);
    e.winT = Math.max(e.winT, e.bigRec);
    requestYaw(Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z));
    if (e.bigRec <= 0) { e.bigRec = 0; e.winT = 0; e.bigKind = 0; e.bigCd = CD_MIN + Math.random() * (CD_MAX - CD_MIN); e.attackCd = Math.max(e.attackCd, 0.6); enter(e, 'CHASE'); }
    return true;
  }
  if (e.bigCd > 0) e.bigCd -= dt;
  return false;
}

/** Tries to start the family's big attack. True when it began. */
export function tryStartEliteBig(e: Enemy, tdist: number, ux: number, uz: number): boolean {
  if (e.bigCd > 0 || !world.player.alive || (e.state !== 'CHASE' && e.state !== 'KITE')) return false;
  if (e.freezeT > 0 || e.stunT > 0 || e.staggerT > 0) return false;
  const id = FAMILY[e.kind];
  if (id === undefined || world.time - lastLaunch < LAUNCH_GAP) return false;
  const bi = Math.max(0, Math.min(7, world.room.biome | 0));
  const power = Math.max(e.contactDamage, e.projectileDamage, 6) * (1 + 0.04 * bi);   // (damagePlayer applies DMG_INFLATE itself)
  const rBonus = 1 + 0.03 * bi;
  const p = world.player.pos;
  let z: Zone | null = null, windup = 1.0;
  switch (id) {
    case EB.SLAM: {
      if (tdist > 7) return false;
      const r = 4.4 * rBonus * Math.max(1, e.scale * 0.75);
      windup = 1.0;
      z = spawnTelegraphCircle(e.pos.x, e.pos.z, r, windup, power * 2.6, 0xf97316);
      break;
    }
    case EB.CONE: {
      if (tdist > 6.5) return false;
      e.dir.set(ux, 0, uz);
      windup = 0.9;
      z = spawnTelegraphCone(e.pos.x, e.pos.z, ux, uz, 7 * rBonus, 0.78, windup, 0xef4444, id, power * 2.4);
      break;
    }
    case EB.LINE: {
      if (tdist < 4 || tdist > 14) return false;
      e.dir.set(ux, 0, uz);
      windup = 0.85;
      const len = Math.min(16, tdist + 3);
      z = spawnTelegraphLine(e.pos.x, e.pos.z, ux, uz, len, 2.4 * rBonus, windup, 0xef4444);
      break;
    }
    case EB.RAIN: {
      if (tdist < 3 || tdist > 20) return false;
      windup = 1.1;
      z = spawnTelegraphCircle(p.x, p.z, 2.4 * rBonus, windup, power * 1.6, 0xa855f7);
      if (z) z.trick = id;
      const a0 = Math.random() * 6.283;
      for (let i = 0; i < 4; i++) {   // ring of four extra marks, spaced so the circles never overlap (no double hits)
        const a = a0 + i * 1.5708;
        const zr = spawnTelegraphCircle(p.x + Math.sin(a) * 5.6, p.z + Math.cos(a) * 5.6, 2.0 * rBonus, windup, power * 1.6, 0xa855f7);
        if (zr) zr.trick = id;
      }
      break;
    }
    default: {   // RING: a charging glyph around the caster, then a ring of orbs
      if (tdist > 17) return false;
      windup = 1.0;
      z = spawnTelegraphCircle(e.pos.x, e.pos.z, 2.8 * rBonus, windup, power * 0.9, 0xa855f7);
      break;
    }
  }
  if (!z) return false;
  if (id !== EB.RAIN) z.trick = id;
  z.damage = id === EB.SLAM ? power * 2.6 : id === EB.CONE ? power * 2.4 : id === EB.RING ? power * 0.9 : id === EB.RAIN ? power * 1.6 : 0;
  if (id === EB.LINE) z.damage = power * 2.4;
  lastLaunch = world.time;
  e.bigKind = id; e.bigT = windup; e.bigRec = 0; e.bigDash = 0;
  e.vel.set(0, 0, 0);
  enter(e, 'WINDUP');
  return true;
}

/** Zone.trick 20-24 expiry (called from tricks.resolveTrick). */
export function resolveEliteBig(z: Zone): void {
  const p = world.player;
  const rx = p.pos.x - z.pos.x, rz = p.pos.z - z.pos.z;
  const rr = z.radius + 0.6;
  const inside = p.alive && rx * rx + rz * rz < rr * rr;
  switch (z.trick) {
    case EB.SLAM:
      if (inside) { damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.5); }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius, color: 0xf97316 });
      events.emit('trick', { pos: z.pos.clone(), kind: 'STOMP', radius: z.radius });
      events.emit('shake', { amount: 0.5 });
      break;
    case EB.CONE:
      if (p.alive && inCone(p.pos.x, p.pos.z, z.pos.x, z.pos.z, z.dir.x, z.dir.z, z.radius, z.aux)) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL', ...KB.PUSH });
      tv.set(z.pos.x + z.dir.x * z.radius * 0.5, 0, z.pos.z + z.dir.z * z.radius * 0.5);
      events.emit('trick', { pos: tv.clone(), kind: 'TAIL_SWEEP', radius: z.radius });
      events.emit('shake', { amount: 0.35 });
      break;
    case EB.LINE: {
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM });
      for (let d = 0; d < z.length; d += 4) events.emit('trick', { pos: tv.set(z.pos.x + z.dir.x * d, 0, z.pos.z + z.dir.z * d).clone(), kind: 'STAMPEDE_DUST', radius: z.radius });
      events.emit('shake', { amount: 0.3 });
      break;
    }
    case EB.RAIN:
      if (inside) damagePlayer(z.damage, { pos: z.pos, kind: 'MAGIC' });
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius, color: 0xa855f7 });
      events.emit('trick', { pos: z.pos.clone(), kind: 'CURSE', radius: z.radius });
      events.emit('shake', { amount: 0.2 });
      break;
    default: {   // RING: 14 orbs, random phase
      const a0 = Math.random() * 6.283, n = 14;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.283;
        tv.set(Math.sin(a), 0, Math.cos(a));
        fireEnemyProjectile(z.pos, tv, 'ORB', 7.5, z.damage, { life: 2.8, radius: 0.45 });
      }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.6, color: 0xa855f7 });
      events.emit('trick', { pos: z.pos.clone(), kind: 'SCREECH', radius: z.radius });
      break;
    }
  }
}
