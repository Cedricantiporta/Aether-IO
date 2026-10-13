// ============================================================================
// Ground zones: fire trails, black holes, telegraphs, poison pools, visual rings.
// Also ticks the wizard Earthwall timer (enemy push-out lives in the enemy system).
// ============================================================================
import { world, allocZone } from '../world';
import { events } from '../events';
import type { Zone } from '../types';
import {
  damageEnemy, damageEnemiesInRadius, applyStatus, damagePlayer, addShake, type DamageOpts, type StatusEffect,
} from './combat';

const FIRE_TICK = 0.25;
const POISON_TICK = 0.5;
const PULL_RANGE = 15;
const PULL_STOP = 1.5;
const PLAYER_RADIUS = 0.6;

const HAZARD_TICK = 0.5;
const PUDDLE_FACTOR = 0.35;
/** Per-frame player speed multiplier from PUDDLE zones (1 = none). Recomputed every updateZones; player.ts reads it. */
export let envSlow = 1;

const out: number[] = [];
const gasOpts: DamageOpts = { kind: 'POISON', dot: true };
const wildOpts: DamageOpts = { kind: 'FIRE', dot: true };
const fireOpts: DamageOpts = { kind: 'FIRE', dot: true, source: 'PLAYER' };
const boomOpts: DamageOpts = { kind: 'MAGIC', source: 'PLAYER', knockback: 1.5 };
const burnVisual: StatusEffect = { type: 'BURN', duration: 1, value: 0.01 };

function fireTick(z: Zone): void {
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  const dmg = z.damage * FIRE_TICK;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z;
    const rr = z.radius + e.radius * 0.5;
    if (dx * dx + dz * dz > rr * rr) continue;
    applyStatus(e, burnVisual); // keeps the "burning" tint without adding meaningful extra DoT
    damageEnemy(e, dmg, fireOpts);
  }
}

function pullTick(z: Zone, dt: number): void {
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, PULL_RANGE + 4, out);
  const r2 = PULL_RANGE * PULL_RANGE;
  let pulled = 0;
  for (let i = 0; i < ids.length && pulled < z.maxPull; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.boss) continue;
    const dx = z.pos.x - e.pos.x, dz = z.pos.z - e.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    pulled++;
    const d = Math.sqrt(d2) || 1;
    if (d <= PULL_STOP) continue;
    const step = Math.min(d - PULL_STOP, Math.max(8, e.speed * 2) * dt);
    e.pos.x += (dx / d) * step;
    e.pos.z += (dz / d) * step;
  }
}

function poisonTick(z: Zone): void {
  const p = world.player;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
  const rr = z.radius + PLAYER_RADIUS;
  if (dx * dx + dz * dz < rr * rr) damagePlayer(z.damage * POISON_TICK, { pos: z.pos, kind: 'POISON' });
}

// ------------------------------------------------------ environmental hazards --
/** GAS vent is emitting when ((world.time + zone.life) % period) < activeFor. `life` holds the phase offset for permanent zones. */
export function gasActive(z: Zone): boolean {
  return z.period <= 0 || ((world.time + z.life) % z.period) < z.activeFor;
}

function inZone(z: Zone, x: number, y: number, pad: number): boolean {
  const dx = x - z.pos.x, dz = y - z.pos.z;
  const rr = z.radius + pad;
  return dx * dx + dz * dz < rr * rr;
}

function puddleUpdate(z: Zone): void {
  const p = world.player;
  if (p.alive && inZone(z, p.pos.x, p.pos.z, PLAYER_RADIUS * 0.5)) envSlow = Math.min(envSlow, 1 - PUDDLE_FACTOR);
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.kind === 'BAT') continue;
    if (!inZone(z, e.pos.x, e.pos.z, e.radius * 0.5)) continue;
    if (e.slowT < 0.1) e.slowT = 0.1;
    if (e.slowFactor < PUDDLE_FACTOR) e.slowFactor = PUDDLE_FACTOR;
  }
}

function extinguished(z: Zone): boolean {
  const zs = world.zones;
  for (let i = 0; i < zs.length; i++) {
    const q = zs[i];
    if (!q.active || q.kind !== 'PUDDLE') continue;
    const dx = q.pos.x - z.pos.x, dz = q.pos.z - z.pos.z;
    const rr = q.radius + z.radius * 0.5;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

function hazardTick(z: Zone): void {
  const wave = world.director.wave;
  const gas = z.kind === 'GAS';
  const dps = gas ? 7 + wave * 1.2 : 6 + wave * 1.0;
  const p = world.player;
  if (p.alive && inZone(z, p.pos.x, p.pos.z, PLAYER_RADIUS)) {
    damagePlayer(dps * HAZARD_TICK, { pos: z.pos, kind: gas ? 'POISON' : 'FIRE' });
  }
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    if (!inZone(z, e.pos.x, e.pos.z, e.radius * 0.5)) continue;
    if (gas) {
      if (e.poisonT < 1) e.poisonT = 1;
      if (e.poisonDps < dps * 0.1) e.poisonDps = dps * 0.1;
    } else {
      if (e.burnT < 1.5) e.burnT = 1.5;
      if (e.burnDps < dps * 0.1) e.burnDps = dps * 0.1;
    }
    damageEnemy(e, dps * 2 * HAZARD_TICK, gas ? gasOpts : wildOpts);
  }
}

/** Spawns a burning patch (WILDFIRE) that burns out after `life` s. Extinguished by PUDDLE overlap. */
export function spawnWildfire(x: number, zz: number, radius: number, life: number): void {
  const z = allocZone();
  if (!z) return;
  z.active = true; z.kind = 'WILDFIRE'; z.hostile = false;
  z.pos.set(x, 0, zz); z.radius = radius; z.life = life; z.maxLife = life;
  z.damage = 0; z.color = 0xff5a1a; z.tickT = Math.random() * HAZARD_TICK;
  if (extinguished(z)) z.active = false;
}

function lineHitsPlayer(z: Zone): boolean {
  const p = world.player;
  const rx = p.pos.x - z.pos.x, rz = p.pos.z - z.pos.z;
  const t = rx * z.dir.x + rz * z.dir.z;
  if (t < -PLAYER_RADIUS || t > z.length + PLAYER_RADIUS) return false;
  const perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
  return perp < z.radius * 0.5 + PLAYER_RADIUS;
}

function expire(z: Zone): void {
  switch (z.kind) {
    case 'BLACKHOLE':
      damageEnemiesInRadius(z.pos.x, z.pos.z, z.radius, z.damage, boomOpts);
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius, color: z.color });
      addShake(0.3);
      break;
    case 'TELEGRAPH_CIRCLE': {
      const p = world.player;
      const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
      const rr = z.radius + PLAYER_RADIUS;
      if (dx * dx + dz * dz < rr * rr) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL' });
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius, color: z.color });
      addShake(Math.min(0.5, 0.1 + z.radius * 0.03));
      break;
    }
    case 'TELEGRAPH_LINE':
      if (z.damage > 0 && lineHitsPlayer(z)) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL' });
      break;
    default: break;
  }
  z.active = false;
}

export function updateZones(dt: number): void {
  const ew = world.player.earthwall;
  if (ew.active) {
    ew.t -= dt;
    if (ew.t <= 0) ew.active = false;
  }

  envSlow = 1;
  const zones = world.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.active) continue;
    if (z.permanent) {
      if (z.kind === 'PUDDLE') puddleUpdate(z);
      else if (z.kind === 'GAS') {
        z.tickT += dt;
        if (z.tickT >= HAZARD_TICK) { z.tickT -= HAZARD_TICK; if (gasActive(z)) hazardTick(z); }
      }
      continue;
    }
    z.life -= dt;

    if (z.life > 0) {
      switch (z.kind) {
        case 'FIRE':
          z.tickT += dt;
          if (z.tickT >= FIRE_TICK) { z.tickT -= FIRE_TICK; fireTick(z); }
          break;
        case 'BLACKHOLE':
          pullTick(z, dt);
          break;
        case 'POISON_POOL':
          z.tickT += dt;
          if (z.tickT >= POISON_TICK) { z.tickT -= POISON_TICK; poisonTick(z); }
          break;
        case 'PUDDLE': puddleUpdate(z); break;
        case 'GAS':
          z.tickT += dt;
          if (z.tickT >= HAZARD_TICK) { z.tickT -= HAZARD_TICK; if (gasActive(z)) hazardTick(z); }
          break;
        case 'WILDFIRE':
          z.tickT += dt;
          if (z.tickT >= HAZARD_TICK) {
            z.tickT -= HAZARD_TICK;
            if (extinguished(z)) { z.active = false; break; }
            hazardTick(z);
          }
          break;
        default: break; // FROST_NOVA / SHOCKWAVE: visual only, TELEGRAPH_*: resolves on expiry
      }
    } else {
      expire(z);
    }
  }
}
