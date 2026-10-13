// ============================================================================
// Ground zones: fire trails, black holes, telegraphs, poison pools, visual rings.
// Also ticks the wizard Earthwall timer (enemy push-out lives in the enemy system).
// ============================================================================
import { world } from '../world';
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

const out: number[] = [];
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

  const zones = world.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.active) continue;
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
        default: break; // FROST_NOVA / SHOCKWAVE: visual only, TELEGRAPH_*: resolves on expiry
      }
    } else {
      expire(z);
    }
  }
}
