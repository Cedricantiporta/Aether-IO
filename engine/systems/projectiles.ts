// ============================================================================
// Player projectiles: basic attacks + every player-fired bolt in the pool.
// Movement, obstacle/crate/enemy collision, pierce, splash, bounces, boomerang.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone, ARENA_RADIUS } from '../world';
import { events, type DamageKind } from '../events';
import type { Projectile, ProjectileKind, Enemy } from '../types';
import type { ProjectileType } from '../../types';
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
  return p;
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
  const count = Math.max(1, Math.min(7, Math.floor(stats.multishot + 1e-6)));

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
    case 'AXE': kind = 'AXE'; speed *= 2.7; life = 3.5; pierce = Infinity; break;
    case 'MAGIC': kind = 'MAGIC'; speed *= 0.6; pierce = 4; aoe = 4; radius = 2.5; break;
    default: kind = 'ARROW'; speed *= 1.5; life = 2.2; break;
  }

  const baseX = pl.pos.x + dir.x * 0.9;
  const baseZ = pl.pos.z + dir.z * 0.9;
  for (let i = 0; i < count; i++) {
    const off = i - (count - 1) / 2;
    let dx = dir.x, dz = dir.z, ox = baseX, oz = baseZ;
    if (kind === 'AXE') {
      ox += -dir.z * off * 2.0;
      oz += dir.x * off * 2.0;
    } else if (off !== 0) {
      const a = off * stats.spread;
      const c = Math.cos(a), s = Math.sin(a);
      dx = dir.x * c - dir.z * s;
      dz = dir.x * s + dir.z * c;
    }
    spawnProjectile(kind, ox, oz, dx, dz, speed, stats.damage, {
      life, pierce, aoe, radius, knockback: stats.knockback, effect,
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
  return !(kind === 'STORM' || kind === 'FIREBALL' || kind === 'AXE' || kind === 'ORBITAL_BLADE' || kind === 'PET_BOLT');
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

  if (p.aoeRadius > 0) {
    splashOpts.kind = dkind;
    splashOpts.knockback = 0;
    let status: StatusEffect | undefined;
    if (fx && (p.kind === 'BURNING_ARROW' || p.kind === 'FREEZING_ARROW')) {
      splashStatus.type = fx.type; splashStatus.duration = fx.duration; splashStatus.value = fx.value;
      status = splashStatus;
    }
    damageEnemiesInRadius(e.pos.x, e.pos.z, p.aoeRadius, dmg * 0.5, splashOpts, status, e.id);
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
