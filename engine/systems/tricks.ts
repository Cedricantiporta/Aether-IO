// ============================================================================
// Monster signature tricks: telegraphed, own cooldowns, readable.
// A cast = the enemy freezes for `windup` seconds (e.trickT) while a hostile telegraph zone
// (TELEGRAPH_CIRCLE / TELEGRAPH_LINE with zone.trick = id) fills up. When the zone expires,
// resolveTrick() applies the effect (debuff / hostile ground patch / wall). Dodging out of the
// telegraph or dashing (i-frames) avoids it.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { events } from '../events';
import type { Enemy, EnemyKind, Zone, ZoneKind } from '../types';
import { applyPlayerDebuff, damagePlayer } from './combat';
import { spawnTelegraphCircle, spawnTelegraphLine, fireEnemyProjectile } from './enemies';
import { addTempCollider, removeTempCollider, type Collider } from '../mapgen';

export const TRICK = {
  NONE: 0, STAMPEDE: 15, GOO: 1, FIREBOMB: 2, SCREECH: 3, PIN: 4, CURSE: 5, STOMP: 7, PLAGUE: 9, TERROR: 10, WALL: 11, CALTROPS: 12, SMOKE: 13, PINCH: 14,
} as const;

export const TRICK_NAME: Record<number, string> = {
  15: 'STAMPEDE', 1: 'GOO', 2: 'FIREBOMB', 3: 'SCREECH', 4: 'PIN', 5: 'CURSE', 7: 'STOMP', 9: 'PLAGUE', 10: 'TERROR', 11: 'WALL', 12: 'CALTROPS', 13: 'SMOKE', 14: 'PINCH',
};
const COLOR: Record<number, number> = {
  15: 0xfbbf24, 1: 0x84cc16, 2: 0xf97316, 3: 0xc084fc, 4: 0xfacc15, 5: 0xa855f7, 7: 0xef4444, 9: 0x65a30d, 10: 0x7dd3fc, 11: 0xe879f9, 12: 0x9ca3af, 13: 0x9ca3af, 14: 0xf87171,
};

interface Def { id: number; cd: number; minD: number; maxD: number; windup: number; r: number; atSelf?: boolean; line?: boolean }
const DEFS: Partial<Record<EnemyKind, Def[]>> = {
  SLIME: [{ id: TRICK.GOO, cd: 9, minD: 4, maxD: 16, windup: 0.9, r: 3.0 }],
  GOBLIN: [{ id: TRICK.FIREBOMB, cd: 11, minD: 5, maxD: 15, windup: 1.0, r: 2.6 }],
  BAT: [{ id: TRICK.SCREECH, cd: 9, minD: 2, maxD: 10, windup: 0.7, r: 8, atSelf: true }],
  SKELETON_ARCHER: [{ id: TRICK.PIN, cd: 8, minD: 8, maxD: 20, windup: 0.8, r: 1.4, line: true }],
  CULTIST: [{ id: TRICK.CURSE, cd: 10, minD: 6, maxD: 16, windup: 0.9, r: 3.2 }],
  BRUTE: [{ id: TRICK.STOMP, cd: 9, minD: 0, maxD: 7, windup: 0.9, r: 6, atSelf: true }],
  ZOMBIE: [{ id: TRICK.PLAGUE, cd: 10, minD: 3, maxD: 14, windup: 1.0, r: 3.6 }],
  WRAITH: [{ id: TRICK.TERROR, cd: 9, minD: 2, maxD: 9, windup: 0.8, r: 7, atSelf: true }],
  CRYSTAL_GOLEMITE: [{ id: TRICK.WALL, cd: 12, minD: 5, maxD: 16, windup: 0.9, r: 1.8, line: true }],
  BANDIT: [
    { id: TRICK.CALTROPS, cd: 9, minD: 4, maxD: 14, windup: 0.7, r: 3.0 },
    { id: TRICK.SMOKE, cd: 9, minD: 0, maxD: 8, windup: 0.6, r: 4, atSelf: true },
  ],
  ROCK_CRAB: [{ id: TRICK.PINCH, cd: 7, minD: 0, maxD: 3.8, windup: 0.5, r: 2.6, atSelf: true }],
};

/** Stats for QA: which tricks were cast / resolved. */
export const trickStats: Record<string, { cast: number; hit: number }> = {};
function stat(id: number): { cast: number; hit: number } {
  const n = TRICK_NAME[id] ?? String(id);
  return (trickStats[n] ??= { cast: 0, hit: 0 });
}

const lastStart: Record<number, number> = {};
let casting = 0;
const tv = new Vector3();

export function resetTricks(): void { for (const k in lastStart) delete lastStart[k]; for (const k in trickStats) delete trickStats[k]; casting = 0; clearWalls(); }

export function hasTrick(kind: EnemyKind): boolean { return !!DEFS[kind]; }

/** Spawns the initial random trick cooldown (called from spawnEnemy). */
export function initTrick(e: Enemy): void {
  e.trickCd = 2 + Math.random() * 6; e.trickT = 0; e.trickKind = 0;
}

/** Advances an active cast. Returns true while the enemy is busy casting (AI must be skipped). */
export function updateTrick(e: Enemy, dt: number): boolean {
  if (e.trickT <= 0) { if (e.trickCd > 0) e.trickCd -= dt; return false; }
  e.trickT -= dt;
  if (e.trickT <= 0) { e.trickT = 0; if (casting > 0) casting--; e.attackCd = Math.max(e.attackCd, 0.5); }
  return true;
}

/** Tries to start a trick. Returns true when a cast began (caller stops the enemy this frame). */
export function tryStartTrick(e: Enemy, tdist: number, ux: number, uz: number): boolean {
  if (e.trickCd > 0 || e.boss || (e.state !== 'CHASE' && e.state !== 'KITE')) return false;
  const defs = DEFS[e.kind];
  if (!defs || !world.player.alive) return false;
  const def = defs[defs.length === 1 ? 0 : (Math.random() * defs.length) | 0];
  if (tdist < def.minD || tdist > def.maxD) return false;
  if (casting >= 10) return false;
  const now = world.time;
  if (now - (lastStart[def.id] ?? -9) < 1.2) return false; // keep same-kind casts staggered
  lastStart[def.id] = now;
  casting++;
  e.trickKind = def.id; e.trickT = def.windup; e.trickCd = def.cd * (0.85 + Math.random() * 0.3);
  stat(def.id).cast++;
  const power = Math.max(e.contactDamage, e.projectileDamage, 6);
  const p = world.player.pos;
  let z: Zone | null;
  if (def.id === TRICK.PIN) {
    z = spawnTelegraphLine(e.pos.x, e.pos.z, ux, uz, Math.min(24, tdist + 4), 1.4, def.windup, COLOR[def.id]);
  } else if (def.id === TRICK.WALL) {
    // wall segment between the golemite and the player, ~5 units in front of the player
    const wx = p.x - ux * 5, wz = p.z - uz * 5;
    const half = 3.6;
    z = spawnTelegraphLine(wx + uz * half, wz - ux * half, -uz, ux, half * 2, 2.2, def.windup, COLOR[def.id]);
  } else if (def.atSelf) {
    z = spawnTelegraphCircle(e.pos.x, e.pos.z, def.r * Math.max(1, e.scale * 0.8), def.windup, power, COLOR[def.id]);
  } else {
    z = spawnTelegraphCircle(p.x, p.z, def.r, def.windup, power, COLOR[def.id]);
  }
  if (z) { z.trick = def.id; z.damage = power; }
  events.emit('trick', { pos: e.pos, kind: TRICK_NAME[def.id] + '_CAST', radius: def.r });
  return true;
}

// ------------------------------------------------------------ hostile ground patches --
/** Persistent hostile patch (affects the player only). */
export function spawnHostileZone(kind: ZoneKind, x: number, zz: number, r: number, life: number, dps: number, color: number): Zone | null {
  const z = allocZone();
  if (!z) return null;
  z.active = true; z.kind = kind; z.hostile = true;
  z.pos.set(x, 0, zz); z.radius = r; z.life = z.maxLife = life; z.damage = dps; z.color = color; z.tickT = 0;
  return z;
}

// ------------------------------------------------------------ resolve (zone expiry) --
function inside(z: Zone): boolean {
  const p = world.player;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
  const rr = z.radius + 0.6;
  return p.alive && dx * dx + dz * dz < rr * rr;
}

export function resolveTrick(z: Zone): void {
  const id = z.trick;
  const power = z.damage;
  const p = world.player;
  const name = TRICK_NAME[id];
  let hit = false;
  switch (id) {
    case TRICK.GOO:
      spawnHostileZone('GOO', z.pos.x, z.pos.z, z.radius, 6, 0, 0x84cc16);
      hit = inside(z); break;
    case TRICK.FIREBOMB:
      if (inside(z)) { damagePlayer(power * 0.9, { pos: z.pos, kind: 'FIRE' }); hit = applyPlayerDebuff('BURN', 3, power * 0.2); }
      spawnHostileZone('FIREPATCH', z.pos.x, z.pos.z, z.radius * 1.05, 4, power * 0.35, 0xff5a1a);
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius, color: 0xf97316 });
      break;
    case TRICK.SCREECH:
      if (inside(z)) hit = applyPlayerDebuff('SILENCE', 1.5);
      break;
    case TRICK.PIN:
      tv.copy(z.dir);
      fireEnemyProjectile(z.pos, tv, 'ARROW', 26, power * 0.8, { life: 1.4, radius: 0.5, debuff: 1 });
      hit = true; break;
    case TRICK.CURSE:
      if (inside(z)) hit = applyPlayerDebuff('DEFDOWN', 5);
      break;
    case TRICK.STOMP:
      if (inside(z)) { damagePlayer(power * 1.1, { pos: z.pos, kind: 'PHYSICAL' }); hit = applyPlayerDebuff('STUN', 0.8); }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius, color: 0xef4444 });
      events.emit('shake', { amount: 0.3 });
      break;
    case TRICK.PLAGUE:
      spawnHostileZone('PLAGUE', z.pos.x, z.pos.z, z.radius, 6, power * 0.3, 0x6aa84f);
      hit = inside(z); break;
    case TRICK.TERROR:
      if (inside(z)) hit = applyPlayerDebuff('BLIND', 2);
      break;
    case TRICK.WALL: raiseWall(z); hit = true; break;
    case TRICK.CALTROPS:
      spawnHostileZone('CALTROPS', z.pos.x, z.pos.z, z.radius, 6, power * 0.15, 0x9ca3af);
      hit = inside(z); break;
    case TRICK.SMOKE:
      spawnHostileZone('SMOKE', z.pos.x, z.pos.z, z.radius, 3.5, 0, 0x6b7280);
      break;
    case TRICK.STAMPEDE: {
      const rx = p.pos.x - z.pos.x, rz = p.pos.z - z.pos.z;
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) { damagePlayer(power, { pos: z.pos, kind: 'PHYSICAL' }); hit = applyPlayerDebuff('STUN', 0.6); }
      for (let d = 0; d < z.length; d += 4) events.emit('trick', { pos: tv.set(z.pos.x + z.dir.x * d, 0, z.pos.z + z.dir.z * d).clone(), kind: 'STAMPEDE_DUST', radius: z.radius });
      break;
    }
    case TRICK.PINCH:
      if (inside(z)) { damagePlayer(power * 0.9, { pos: z.pos, kind: 'PHYSICAL' }); hit = applyPlayerDebuff('BLEED', 4, power * 0.3); }
      break;
    default: break;
  }
  if (hit) stat(id).hit++;
  void p;
  events.emit('trick', { pos: z.pos.clone(), kind: name, radius: z.radius });
}

// ------------------------------------------------------------ crystal wall --
const WALL_LIFE = 4;
export function raiseWallAt(x: number, zz: number, r: number, life: number, rock = false): boolean {
  const w = world.walls.find((q) => !q.active);
  if (!w) return false;
  w.x = x; w.z = zz; w.r = r; w.t = 0; w.life = life; w.rot = Math.random() * 6.28; w.rock = rock;
  w.collider = addTempCollider(x, zz, r, true);
  w.active = true;
  return true;
}
function raiseWall(z: Zone): void {
  const len = z.length, n = Math.max(3, Math.round(len / 1.5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n * len;
    raiseWallAt(z.pos.x + z.dir.x * t, z.pos.z + z.dir.z * t, 1.25, WALL_LIFE, false);
  }
  events.emit('shake', { amount: 0.2 });
}
function clearWalls(): void {
  for (const w of world.walls) { if (w.collider) removeTempCollider(w.collider as Collider); w.collider = null; w.active = false; }
}
export function updateWalls(dt: number): void {
  const ws = world.walls;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (!w.active) continue;
    w.t += dt;
    if (w.t >= w.life) {
      if (w.collider) removeTempCollider(w.collider as Collider);
      w.collider = null; w.active = false;
      events.emit('trick', { pos: tv.set(w.x, 0, w.z).clone(), kind: 'WALL_BREAK', radius: 1.5 });
    }
  }
}
