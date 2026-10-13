// ============================================================================
// Player projectiles: basic attacks + every player-fired bolt in the pool.
// Movement, obstacle/crate/enemy collision, pierce, splash, bounces, boomerang.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone, ARENA_RADIUS } from '../world';
import { events, type DamageKind } from '../events';
import type { Projectile, ProjectileKind, Enemy } from '../types';
import type { ProjectileType } from '../../types';
import { MULTISHOT_CAP } from '../../constants';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, applyStatus, findNearestEnemy, getAimDir, rollCrit, lastCrit,
  type DamageOpts, type StatusEffect,
} from './combat';
import { queryColliders, type Collider } from '../mapgen';
import { hitCrate } from './crates';

export interface ProjSpec {
  life: number;
  pierce?: number;
  radius?: number;
  aoe?: number;
  knockback?: number;
  effect?: Projectile['effect'];
  bounces?: number;
  homing?: number;
  y?: number;
  emp?: boolean;
}

const ORIGIN_Y = 1.2;
const CRATE_HIT_RADIUS = 1.6;
const CRATE_ID_OFFSET = 10000;

const projOut: number[] = [];
const bounceOut: number[] = [];
const colOut: Collider[] = [];
const aim = new Vector3();
const hitOpts: DamageOpts = { kind: 'PHYSICAL', crit: false, source: 'PLAYER' };
const splashOpts: DamageOpts = { kind: 'PHYSICAL', crit: false, source: 'PLAYER' };
const knockTmp = new Vector3();
const splashStatus: StatusEffect = { type: 'BURN', duration: 0 };

/** Which damage school a projectile belongs to. */
export function damageKindOf(kind: ProjectileKind): DamageKind {
  switch (kind) {
    case 'FIREBALL': case 'BURNING_ARROW': return 'FIRE';
    case 'FREEZING_ARROW': return 'ICE';
    case 'MAGIC': case 'STORM': case 'PET_BOLT': return 'MAGIC';
    default: return 'PHYSICAL';
  }
}

/** Allocates + initialises a player projectile. Returns null when the pool is exhausted. */
export function spawnProjectile(
  kind: ProjectileKind, x: number, z: number, dx: number, dz: number, speed: number, damage: number, spec: ProjSpec,
): Projectile | null {
  const p = allocProjectile();
  if (!p) return null;
  p.active = true;
  p.kind = kind;
  p.pos.set(x, spec.y ?? ORIGIN_Y, z);
  p.vel.set(dx * speed, 0, dz * speed);
  p.life = p.maxLife = spec.life;
  p.damage = damage;
  p.pierce = spec.pierce ?? 1;
  if (spec.radius !== undefined) p.radius = spec.radius;
  p.aoeRadius = spec.aoe ?? 0;
  p.knockback = spec.knockback ?? 0;
  p.effect = spec.effect;
  p.bounces = spec.bounces ?? 0;
  p.homing = spec.homing ?? 0;
  p.emp = spec.emp === true;
  return p;
}

// ------------------------------------------------------------ proc system --
/** Per-run on-attack proc state. Reset by resetProcs() on startRun. */
export const procFlags = { stomp: 0 };   // set to skill level by the basic attack; consumed by skills.ts
let procCount = 0;                       // volleys since the last proc
let archerNext = 0;                      // 0 = fire next, 1 = ice next

let procHaste = 0;
let echoCount = 0;
const procN = (lv: number): number => Math.max(6, 13 - lv - procHaste);

export function resetProcs(): void { procCount = 0; archerNext = 0; procFlags.stomp = 0; echoCount = 0; }

/** HUD: attacks remaining until `skill` procs (0 when locked / not a proc skill of this hero). */
export function procHud(skill: string, out: { t: number; max: number }): void {
  const st = useGameStore.getState();
  const lv = st.skillLevels;
  procHaste = st.stats.procHaste;
  let n = 0, left = 0;
  if (st.hero === 'ARCHER' && (skill === 'burning' || skill === 'freezing')) {
    const fire = lv.burning > 0, ice = lv.freezing > 0;
    if (!fire && !ice) { out.t = 0; out.max = 0; return; }
    const nextIce = fire && ice ? archerNext === 1 : ice;
    const next = nextIce ? 'freezing' : 'burning';
    const nNext = procN(nextIce ? lv.freezing : lv.burning);
    if (skill === next) { n = nNext; left = n - procCount; }
    else {
      const l = skill === 'freezing' ? lv.freezing : lv.burning;
      if (l <= 0) { out.t = 0; out.max = 0; return; }
      n = nNext + procN(l); left = n - procCount;
    }
  } else if (st.hero === 'WIZARD' && skill === 'thunder' && lv.thunder > 0) {
    n = procN(lv.thunder); left = n - procCount;
  } else if (st.hero === 'BARBARIAN' && skill === 'stamp' && lv.stamp > 0) {
    n = procN(lv.stamp); left = n - procCount;
  } else { out.t = 0; out.max = 0; return; }
  out.t = left > 0 ? left : 0; out.max = n;
}

const chainOut: number[] = [];
const chainOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER', crit: false };
const chainHit: Enemy[] = [];
/** Thundercaller proc: lightning leaps from `from` to 2 + lvl nearby enemies. */
function chainLightning(from: Enemy, lvl: number): void {
  const st = useGameStore.getState().stats;
  const dmg = st.damage * 0.9 * st.skillDamage * (1 + 0.15 * Math.max(0, lvl - 1));
  const ids = world.enemyGrid.query(from.pos.x, from.pos.z, 24, chainOut);
  chainHit.length = 0;
  chainHit.push(from);
  let cur = from;
  for (let n = 2 + lvl + (useGameStore.getState().stats.thunderChain | 0); n > 0; n--) {
    let best: Enemy | null = null, bd = 18 * 18;
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || chainHit.indexOf(e) !== -1) continue;
      const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    events.emit('lightning', { from: new Vector3(cur.pos.x, 1.2, cur.pos.z), to: new Vector3(best.pos.x, 1.2, best.pos.z) });
    damageEnemy(best, dmg, chainOpts);
    chainHit.push(best);
    cur = best;
  }
}

// ------------------------------------------------------------ basic attack --
function defaultProjectileType(): ProjectileType {
  const hero = useGameStore.getState().hero;
  return hero === 'WIZARD' ? 'MAGIC' : hero === 'BARBARIAN' ? 'AXE' : 'ARROW';
}

/** Fires the hero's basic attack towards the aim point. Called by player.ts on its fire timer. */
export function fireBasicAttack(): void {
  const st = useGameStore.getState();
  const stats = st.stats;
  const weapon = st.equipment.weapon;
  const ptype = weapon?.projectileType ?? defaultProjectileType();
  const pl = world.player;
  const dir = getAimDir(aim);
  const count = Math.max(1, Math.min(MULTISHOT_CAP, Math.floor(stats.multishot + 1e-6)));
  procHaste = stats.procHaste;
  const extraPierce = stats.pierceBonus | 0;

  let effect: Projectile['effect'];
  if (weapon?.onHitEffect) {
    const w = weapon.onHitEffect;
    effect = {
      type: w.type, duration: w.duration, chance: w.chance,
      value: w.type === 'BURN' || w.type === 'POISON' ? stats.damage * 0.3 : w.value,
    };
  }

  let kind: ProjectileKind;
  let speed = stats.projectileSpeed;
  let life = 3;
  let pierce = 1;
  let aoe = 0;
  let radius = 1.5;
  switch (ptype) {
    case 'AXE': kind = 'AXE'; speed *= 2.7; life = 3.5; pierce = 4; break;
    case 'MAGIC': kind = 'MAGIC'; speed *= 0.6; pierce = 4 + extraPierce; aoe = 2.2; radius = 2.5; break;
    default: kind = 'ARROW'; speed *= 1.5; life = 2.2; pierce = 1 + extraPierce; break;
  }

  // ---- on-attack procs (per-volley counter)
  const lv = st.skillLevels;
  const hero = st.hero;
  procCount++;
  let special: 'BURNING_ARROW' | 'FREEZING_ARROW' | null = null;
  let specialLv = 0;
  let thunderProc = 0;
  if (hero === 'ARCHER' && kind === 'ARROW' && (lv.burning > 0 || lv.freezing > 0)) {
    const useIce = lv.burning > 0 && lv.freezing > 0 ? archerNext === 1 : lv.freezing > 0;
    specialLv = useIce ? lv.freezing : lv.burning;
    if (procCount >= procN(specialLv)) {
      procCount = 0;
      special = useIce ? 'FREEZING_ARROW' : 'BURNING_ARROW';
      if (lv.burning > 0 && lv.freezing > 0) archerNext = useIce ? 0 : 1;
    }
  } else if (hero === 'WIZARD' && kind === 'MAGIC' && lv.thunder > 0) {
    if (procCount >= procN(lv.thunder)) { procCount = 0; thunderProc = lv.thunder; }
  } else if (hero === 'BARBARIAN' && kind === 'AXE' && lv.stamp > 0) {
    if (procCount >= procN(lv.stamp)) { procCount = 0; procFlags.stomp = lv.stamp; }
  }

  const emp = false;
  const lowHp = stats.berserk > 0 && pl.hp < stats.maxHealth * 0.35;
  const dmgMul = (pl.cryT > 0 ? 1.3 : 1) * (pl.titanT > 0 ? 1.5 : 1) * (lowHp ? 1 + stats.berserk : 1);
  // Echo (sets / talents): every Nth attack fires a second volley.
  let echo = false;
  if (stats.echoEvery > 0 && ++echoCount >= stats.echoEvery) { echo = true; echoCount = 0; }
  const baseX = pl.pos.x + dir.x * 0.9;
  const baseZ = pl.pos.z + dir.z * 0.9;
  for (let rp = 0; rp < (echo ? 2 : 1); rp++) for (let i = 0; i < count; i++) {
    const off = i - (count - 1) / 2;
    let dx = dir.x, dz = dir.z, ox = baseX, oz = baseZ;
    if (rp === 1) { ox += -dir.z * 0.8; oz += dir.x * 0.8; }
    if (kind === 'AXE') {
      ox += -dir.z * off * 2.0;
      oz += dir.x * off * 2.0;
    } else if (off !== 0) {
      const a = off * stats.spread;
      const c = Math.cos(a), s = Math.sin(a);
      dx = dir.x * c - dir.z * s;
      dz = dir.x * s + dir.z * c;
    }
    if (rp === 0 && i === Math.floor((count - 1) / 2) && (special || thunderProc)) {
      if (special) {
        // Main projectile of this volley becomes the special arrow.
        const burn = special === 'BURNING_ARROW';
        const dmg = stats.damage * dmgMul * (burn ? 1.05 : 1.2) * stats.skillDamage * (1 + 0.15 * (specialLv - 1));
        spawnProjectile(special, ox, oz, dx, dz, 30, dmg, {
          emp, life: 3, pierce: (burn ? 3 : 2) + extraPierce, aoe: burn ? 2.5 : 2, radius: 3, knockback: stats.knockback,
          effect: burn ? { type: 'BURN', duration: 4, value: stats.damage * 0.3 }
            : { type: 'SLOW', duration: 3 + 0.3 * specialLv, value: 0.6 },
        });
        continue;
      }
      const p = spawnProjectile(kind, ox, oz, dx, dz, speed, stats.damage * dmgMul, {
        life, pierce, aoe, radius, knockback: stats.knockback, effect, emp,
      });
      if (p) p.procLv = thunderProc;
      continue;
    }
    spawnProjectile(kind, ox, oz, dx, dz, speed, stats.damage * dmgMul, {
      life, pierce, aoe, radius, knockback: stats.knockback, effect, emp,
    });
  }
  pl.anim.attackT = 1;
  events.emit('shoot', { pos: pl.pos, dir, kind });
}

// ----------------------------------------------------------------- helpers --
function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = 0;
  if (l2 > 1e-8) {
    t = ((px - ax) * abx + (pz - az) * abz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return cx * cx + cz * cz;
}

function blockedByObstacles(kind: ProjectileKind): boolean {
  return !(kind === 'GALE_ARROW' || kind === 'STORM' || kind === 'FIREBALL' || kind === 'AXE' || kind === 'ORBITAL_BLADE' || kind === 'PET_BOLT');
}

function dropFireZone(p: Projectile): void {
  const z = allocZone();
  if (!z) return;
  z.active = true;
  z.kind = 'FIRE';
  z.hostile = false;
  z.pos.set(p.pos.x, 0, p.pos.z);
  z.radius = 2.2;
  z.life = z.maxLife = 3;
  z.damage = p.damage * 0.03; // dps per zone (trail zones overlap heavily)
  z.color = 0xf97316;
}

function bounceStorm(p: Projectile, from: Enemy): void {
  if (p.bounces <= 0) return;
  const ids = world.enemyGrid.query(from.pos.x, from.pos.z, 30, bounceOut);
  let best: Enemy | null = null;
  let bestD = 30 * 30;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (e === from || !e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    if (p.hitIds.indexOf(e.id) !== -1) continue;
    const dx = e.pos.x - from.pos.x, dz = e.pos.z - from.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return;
  p.bounces--;
  const dx = best.pos.x - from.pos.x, dz = best.pos.z - from.pos.z;
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  p.vel.set((dx / l) * 15, 0, (dz / l) * 15);
  p.pos.x = from.pos.x + (dx / l);
  p.pos.z = from.pos.z + (dz / l);
}

function hitEnemy(p: Projectile, e: Enemy, critRate: number, critDamage: number): void {
  const mult = p.kind === 'ORBITAL_BLADE' ? 1 : rollCrit(critRate, critDamage);
  const crit = p.kind === 'ORBITAL_BLADE' ? false : lastCrit;
  const dmg = p.damage * mult;
  const dkind = damageKindOf(p.kind);

  const fx = p.effect;
  if (fx && (fx.chance === undefined || Math.random() < fx.chance)) applyStatusFast(e, fx);
  if (p.kind !== 'PET_BOLT') {
    const ps = useGameStore.getState().stats;
    if (ps.onHitBurnChance > 0 && Math.random() < ps.onHitBurnChance) { fxTmp.type = 'BURN'; fxTmp.duration = 3; fxTmp.value = Math.max(3, ps.damage * 0.25); applyStatus(e, fxTmp); }
    if (ps.onHitSlowChance > 0 && Math.random() < ps.onHitSlowChance) { fxTmp.type = 'SLOW'; fxTmp.duration = 2.5; fxTmp.value = 0.4; applyStatus(e, fxTmp); }
  }

  if (p.aoeRadius > 0) {
    splashOpts.kind = dkind;
    splashOpts.knockback = 0;
    let status: StatusEffect | undefined;
    let splashMul = p.kind === 'MAGIC' ? 0.35 : 0.5;
    if (p.kind === 'FREEZING_ARROW') {
      // Much less explosive than before: small, weak splash, softer slow.
      splashMul = 0.4;
      splashStatus.type = 'SLOW'; splashStatus.duration = 2; splashStatus.value = 0.4;
      status = splashStatus;
    } else if (fx && p.kind === 'BURNING_ARROW') {
      splashStatus.type = fx.type; splashStatus.duration = fx.duration; splashStatus.value = fx.value;
      status = splashStatus;
    }
    damageEnemiesInRadius(e.pos.x, e.pos.z, p.aoeRadius, dmg * splashMul, splashOpts, status, e.id);
    if (p.kind === 'BURNING_ARROW' || p.kind === 'FREEZING_ARROW') {
      events.emit('explosion', { pos: e.pos.clone(), radius: p.aoeRadius, color: p.kind === 'BURNING_ARROW' ? 0xef4444 : 0x38bdf8 });
    }
  }

  // Knock away from the projectile.
  const kx = e.pos.x - p.pos.x, kz = e.pos.z - p.pos.z;
  const kl = Math.sqrt(kx * kx + kz * kz);
  if (kl > 1e-4) knockTmp.set(kx / kl, 0, kz / kl);
  else knockTmp.set(p.vel.x, 0, p.vel.z).normalize();
  hitOpts.kind = dkind;
  hitOpts.crit = crit;
  hitOpts.knockDir = knockTmp;
  hitOpts.knockback = p.knockback;
  hitOpts.source = p.kind === 'PET_BOLT' ? 'PET' : 'PLAYER';
  damageEnemy(e, dmg, hitOpts);

  if (p.procLv > 0) { const l = p.procLv; p.procLv = 0; chainLightning(e, l); }

  p.hitIds.push(e.id);
  events.emit('projectileImpact', { pos: p.pos, kind: p.kind });

  if (p.kind === 'STORM') { bounceStorm(p, e); return; }
  p.pierce -= 1;
  if (p.pierce <= 0) p.active = false;
}

// Allocation-free status application for projectile effects (same rules as combat.applyStatus).
const fxTmp: StatusEffect = { type: 'BURN', duration: 0 };
function applyStatusFast(e: Enemy, fx: NonNullable<Projectile['effect']>): void {
  fxTmp.type = fx.type; fxTmp.duration = fx.duration; fxTmp.value = fx.value;
  applyStatus(e, fxTmp);
}

// ------------------------------------------------------------------ update --
export function updateProjectiles(dt: number): void {
  const st = useGameStore.getState();
  const critRate = st.stats.critRate, critDamage = st.stats.critDamage;
  const pl = world.player;
  const pool = world.projectiles;
  const maxR2 = (ARENA_RADIUS + 20) * (ARENA_RADIUS + 20);

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    // Orbiting blades are driven entirely by skills.ts until launched.
    if (p.kind === 'ORBITAL_BLADE' && p.state === 0) continue;

    // --- per-kind steering ---
    switch (p.kind) {
      case 'AXE':
        if (p.state === 0) {
          const k = Math.exp(-3.08 * dt);
          p.vel.x *= k; p.vel.z *= k;
          if (p.vel.x * p.vel.x + p.vel.z * p.vel.z < 4) { p.state = 1; p.hitIds.length = 0; }
        } else {
          const dx = pl.pos.x - p.pos.x, dz = pl.pos.z - p.pos.z;
          const l = Math.sqrt(dx * dx + dz * dz) || 1;
          if (l < 1.5) { p.active = false; continue; }
          p.vel.x += (dx / l) * 90 * dt;
          p.vel.z += (dz / l) * 90 * dt;
          const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
          if (sp > 60) { p.vel.x *= 60 / sp; p.vel.z *= 60 / sp; }
        }
        p.spin += dt * 25;
        break;
      case 'FIREBALL':
        p.trailT += dt;
        while (p.trailT >= 0.1) { p.trailT -= 0.1; dropFireZone(p); }
        p.spin += dt * 4;
        break;
      case 'GALE_ARROW':
        p.trailT += dt;
        while (p.trailT >= 0.11) {
          p.trailT -= 0.11;
          if (p.state < p.bounces && p.maxLife - p.life > 0.2) {
            p.state++;
            const z = allocZone();
            if (z) {
              z.active = true; z.kind = 'TORNADO'; z.hostile = false;
              z.pos.set(p.pos.x, 0, p.pos.z); z.radius = 4.2; z.life = z.maxLife = 2.4;
              z.damage = p.damage * 0.12; z.color = 0xa8f0d0; z.length = 10; z.maxPull = 24;
            }
          }
        }
        break;
      case 'BURNING_ARROW':
        if (p.state === 2) {
          p.trailT += dt;
          while (p.trailT >= 0.2) {
            p.trailT -= 0.2;
            const z = allocZone();
            if (z) {
              z.active = true; z.kind = 'FIRE'; z.hostile = false;
              z.pos.set(p.pos.x, 0, p.pos.z); z.radius = 2.7; z.life = z.maxLife = 3.2;
              z.damage = p.damage * 0.4; z.color = 0xf97316;
            }
          }
        }
        break;
      case 'MAGIC': p.spin += dt * 6; break;
      case 'STORM': p.spin += dt * 15; break;
      default: break;
    }

    if (p.homing > 0) {
      const t = findNearestEnemy(p.pos.x, p.pos.z, 25);
      if (t) {
        const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
        const tx = t.pos.x - p.pos.x, tz = t.pos.z - p.pos.z;
        const tl = Math.sqrt(tx * tx + tz * tz) || 1;
        const k = Math.min(1, p.homing * dt);
        let nx = p.vel.x / sp + (tx / tl - p.vel.x / sp) * k;
        let nz = p.vel.z / sp + (tz / tl - p.vel.z / sp) * k;
        const nl = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= nl; nz /= nl;
        p.vel.x = nx * sp; p.vel.z = nz * sp;
      }
    }

    // --- move ---
    const px = p.pos.x, pz = p.pos.z;
    const nx = px + p.vel.x * dt, nz = pz + p.vel.z * dt;
    p.pos.x = nx; p.pos.z = nz;

    p.life -= dt;
    if (p.life <= 0 || nx * nx + nz * nz > maxR2) { p.active = false; continue; }

    // --- obstacles ---
    if (blockedByObstacles(p.kind)) {
      const cols = queryColliders(nx, nz, 1.2, colOut);
      let blocked = false;
      for (let c = 0; c < cols.length; c++) {
        const o = cols[c];
        if (!o.blocksProjectiles) continue;
        const dx = nx - o.x, dz = nz - o.z;
        const rr = o.r + 0.3;
        if (dx * dx + dz * dz < rr * rr) { blocked = true; break; }
      }
      if (blocked) {
        events.emit('projectileImpact', { pos: p.pos, kind: p.kind });
        p.active = false;
        continue;
      }
    }

    // --- crates ---
    const crates = world.crates;
    for (let c = 0; c < crates.length; c++) {
      const cr = crates[c];
      if (!cr.active) continue;
      const dx = cr.pos.x - nx, dz = cr.pos.z - nz;
      if (dx * dx + dz * dz > CRATE_HIT_RADIUS * CRATE_HIT_RADIUS) continue;
      const key = CRATE_ID_OFFSET + cr.id;
      if (p.hitIds.indexOf(key) !== -1) continue;
      p.hitIds.push(key);
      hitCrate(cr, p.damage);
      events.emit('projectileImpact', { pos: p.pos, kind: p.kind });
      p.pierce -= 1;
      if (p.pierce <= 0) { p.active = false; break; }
    }
    if (!p.active) continue;

    // --- enemies (swept test against the grid) ---
    const mx = (px + nx) * 0.5, mz = (pz + nz) * 0.5;
    const half = Math.sqrt((nx - px) * (nx - px) + (nz - pz) * (nz - pz)) * 0.5;
    const ids = world.enemyGrid.query(mx, mz, half + p.radius + 4, projOut);
    for (let k = 0; k < ids.length && p.active; k++) {
      const e = world.enemies[ids[k]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
      if (p.hitIds.indexOf(e.id) !== -1) continue;
      const rr = e.radius + p.radius;
      if (segDist2(px, pz, p.pos.x, p.pos.z, e.pos.x, e.pos.z) < rr * rr) hitEnemy(p, e, critRate, critDamage);
    }
  }
}
