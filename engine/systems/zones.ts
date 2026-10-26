// ============================================================================
// Ground zones: fire trails, black holes, telegraphs, poison pools, visual rings.
// Also ticks the wizard Earthwall timer (enemy push-out lives in the enemy system).
// ============================================================================
import { world, allocZone } from '../world';
import { useGameStore } from '../../store';
import { events } from '../events';
import { isAquatic, isStationary } from '../enemyDefs';
import { lava, lavaAt } from '../lavaFloor';
import { bp } from './bossPhaseState';
import { feat, riverD, riverS, hwAt } from '../roomFeatures';
import type { Zone } from '../types';
import {
  damageEnemy, damageEnemiesInRadius, applyStatus, damagePlayer, addShake, applyPlayerDebuff, type DamageOpts, type StatusEffect,
} from './combat';
import { hitRoomTraps } from './roomTraps';
import { resolveTrick, updateWalls } from './tricks';
import { resolveBossZone, arenaSlow, BT } from './bossFx';

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
const gasOpts: DamageOpts = { kind: 'POISON', dot: true, env: 'HAZARD' };
const wildOpts: DamageOpts = { kind: 'FIRE', dot: true, env: 'HAZARD' };
const fireOpts: DamageOpts = { kind: 'FIRE', dot: true, source: 'PLAYER' };
const boomOpts: DamageOpts = { kind: 'MAGIC', source: 'PLAYER', knockback: 1.5, launch: 11, slam: 0 };
const burnVisual: StatusEffect = { type: 'BURN', duration: 1, value: 0.01 };
const holeFreeze: StatusEffect = { type: 'FREEZE', duration: 1.5 };
const burnReal: StatusEffect = { type: 'BURN', duration: 3, value: 4 };
const pathBurn: StatusEffect = { type: 'BURN', duration: 0.6, value: 2 };

function fireTick(z: Zone): void {
  hitRoomTraps(z.pos.x, z.pos.z, z.radius, z.damage * FIRE_TICK);   // (owner) player fire patches scorch stationaries too
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  const dmg = z.damage * FIRE_TICK;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z;
    const rr = z.radius + e.radius * 0.5;
    if (dx * dx + dz * dz > rr * rr) continue;
    if (z.aux === 2) { pathBurn.value = Math.max(1, z.damage * 2); applyStatus(e, pathBurn); }   // fireball path: burns while inside (short refresh)
    else if (z.aux > 0) { burnReal.value = Math.max(1, z.damage * 0.5); applyStatus(e, burnReal); } // meteor / pillar craters stack real burn
    else applyStatus(e, burnVisual); // keeps the "burning" tint without adding meaningful extra DoT
    damageEnemy(e, dmg, fireOpts);
  }
}

const windOpts: DamageOpts = { kind: 'PHYSICAL', dot: true, source: 'PLAYER' };
const iceDot: DamageOpts = { kind: 'ICE', dot: true, source: 'PLAYER' };
const slowSt: StatusEffect = { type: 'SLOW', duration: 0.6, value: 0.55 };
const frzSt: StatusEffect = { type: 'FREEZE', duration: 1.2 };

/** Generic damage-over-time tick for player zones. Optionally slows. */
const curseDot: DamageOpts = { kind: 'POISON', dot: true, source: 'PLAYER' };
const curseSlow: StatusEffect = { type: 'SLOW', duration: 0.6, value: 0.35 };
/** Enemies standing in a curse zone right now (the necromancer's raise-on-death reads it). */
export function inCurse(x: number, z: number): boolean {
  for (const zn of world.zones) if (zn.active && !zn.hostile && zn.kind === 'CURSE' && (zn.pos.x - x) ** 2 + (zn.pos.z - z) ** 2 < zn.radius * zn.radius) return true;
  return false;
}
function curseTick(z: Zone): void {
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    if ((e.pos.x - z.pos.x) ** 2 + (e.pos.z - z.pos.z) ** 2 > z.radius * z.radius) continue;
    applyStatus(e, curseSlow);
    damageEnemy(e, z.damage, curseDot);
  }
}

function dotTick(z: Zone, o: DamageOpts, slow: boolean): void {
  hitRoomTraps(z.pos.x, z.pos.z, z.radius, z.damage * 0.25);   // (owner) Frost Field / tornado ticks hit stationaries too
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  const dmg = z.damage * 0.25;
  const rr = z.radius;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z;
    if (dx * dx + dz * dz > (rr + e.radius * 0.5) * (rr + e.radius * 0.5)) continue;
    if (slow) {
      e.frostT = Math.max(e.frostT, 1.2);
      const lvl = useGameStore.getState().skillLevels.s4;
      slowSt.value = Math.min(0.9, (0.5 + 0.04 * lvl) * 1.5);   // Frost Field: strong slow
      applyStatus(e, slowSt);
      if (!e.boss && Math.random() < (0.06 + 0.01 * lvl) * 0.5) applyStatus(e, frzSt);   // ...and a small chance to freeze solid (per tick; halved)
    }
    damageEnemy(e, dmg, o);
  }
}

function pullTick(z: Zone, dt: number): void {
  if (z.kind === 'BLACKHOLE') { holeTick(z, dt); return; }
  const range = z.length > 0 ? z.length : PULL_RANGE;
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, range + 4, out);
  const r2 = range * range;
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
    // Gale tornadoes: a gentle tug that big monsters mostly shrug off (pull / size^2; mini-bosses barely move)
    const tug = z.kind === 'TORNADO' ? 0.4 / Math.max(1, e.scale * e.scale) * (e.mini ? 0.25 : 1) : 1;
    const step = Math.min(d - PULL_STOP, Math.max(8, e.speed * 2) * dt * tug);
    e.pos.x += (dx / d) * step;
    e.pos.z += (dz / d) * step;
  }
}

/** Singularity: a real trap. Heavy slow that deepens toward the core (60% edge -> 95% core), pull strongest near the edge
 *  and gentle at the core; big monsters resist the pull. Bosses / mini-bosses: 40% slow, never pulled. Anything entering while it lives is caught. */
const HOLE_TICK = 0.35;
const holeDot: DamageOpts = { kind: 'MAGIC', source: 'PLAYER' };
function holeTick(z: Zone, dt: number): void {
  const R = z.radius;
  // constant damage to everything inside while it pulls (z.damage = the total over its life)
  z.tickT += dt;
  if (z.tickT >= HOLE_TICK) { z.tickT -= HOLE_TICK; damageEnemiesInRadius(z.pos.x, z.pos.z, R, z.damage * HOLE_TICK / z.maxLife, holeDot); }
  const range = z.length > R ? z.length : R * 2;
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, range + 4, out);
  const boost = (1 + 2.2 * (1 - Math.min(1, z.life / z.maxLife))) * 0.55;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = z.pos.x - e.pos.x, dz = z.pos.z - e.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2) || 1;
    const big = e.boss || e.mini;
    if (d < R && e.chillStacks > 0 && e.freezeT <= 0 && !big) { e.chillStacks = 0; applyStatus(e, holeFreeze); events.emit('floatText', { pos: e.pos, text: 'FREEZE', color: 0x8fe4ff, scale: 0.7, dy: 0.4 }); }
    if (d < R) {
      const core = 1 - d / R; // 0 at the edge .. 1 at the core
      const f = big ? 0.4 : 0.6 + 0.35 * core;
      e.slowT = Math.max(e.slowT, 0.3);
      if (e.slowFactor < f) e.slowFactor = f;
    }
    if (d <= PULL_STOP || big || e.speed <= 0) continue;    // bosses, mini-bosses and rooted adds can't be pulled (still slowed)
    const w = d >= R ? 1 : 0.25 + 0.75 * (d / R);
    // heavier (bigger) monsters resist: slime/goblin 1.0, zombie/boar ~0.6, brute/splitter ~0.35; elites half again
    const heft = Math.min(1, Math.max(0.25, (0.7 / Math.max(0.45, e.radius)) ** 2)) * (e.elite ? 0.6 : 1);
    const step = Math.min(d - PULL_STOP, Math.max(8, e.speed * 2) * boost * w * heft * 0.55 * dt);   // overall pull -45%
    e.pos.x += (dx / d) * step;
    e.pos.z += (dz / d) * step;
  }
}

function poisonTick(z: Zone): void {
  const p = world.player;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
  const rr = z.radius + PLAYER_RADIUS;
  if (dx * dx + dz * dz < rr * rr) damagePlayer(z.damage * POISON_TICK, { pos: z.pos, kind: 'POISON', env: true });
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

const sandOpts: DamageOpts = { kind: 'PHYSICAL', dot: true, env: 'HAZARD' };
const SAND_SLOW = 0.4, SAND_CORE = 0.35;

/** Desert quicksand pit (PUDDLE zone, aux 1): slows everyone 40%, pulls toward the centre (2-3.5 u/s, stronger near it), the inner core sinks (DoT). */
function quicksandUpdate(z: Zone, dt: number): void {
  const p = world.player, R = z.radius;
  z.tickT += dt;
  const tick = z.tickT >= HAZARD_TICK;
  if (tick) z.tickT -= HAZARD_TICK;
  const dps = 6 + world.director.wave * 1.1;
  if (p.alive) {
    const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, d2 = dx * dx + dz * dz, rr = R + PLAYER_RADIUS * 0.5;
    if (d2 < rr * rr) {
      envSlow = Math.min(envSlow, 1 - SAND_SLOW);
      const d = Math.sqrt(d2) || 1e-3;
      if (p.dashT <= 0) { const pull = 1.4 * (2 + 1.5 * (1 - Math.min(1, d / R))) * dt;   // (owner 2026-10-26: 30% less than the old 2x)
      if (d > pull) { p.pos.x += (dx / d) * pull; p.pos.z += (dz / d) * pull; } }   // (a dash breaks free)
      if (tick && d < R * SAND_CORE && p.dashT <= 0) damagePlayer(dps * HAZARD_TICK, { pos: z.pos, env: true });
    }
  }
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, R + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.kind === 'BAT' || e.kind === 'WRAITH') continue;
    const dx = z.pos.x - e.pos.x, dz = z.pos.z - e.pos.z, d2 = dx * dx + dz * dz, rr = R + e.radius * 0.5;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-3;
    if (e.slowT < 0.1) e.slowT = 0.1;
    if (e.slowFactor < SAND_SLOW) e.slowFactor = SAND_SLOW;
    if (!e.boss && !isStationary(e.kind)) { const pull = 0.2 * (2 + 1.5 * (1 - Math.min(1, d / R))) * dt;   // (owner: 80% less pull on monsters)
      if (d > pull) { e.pos.x += (dx / d) * pull; e.pos.z += (dz / d) * pull; } }
    if (tick && d < R * SAND_CORE && !isStationary(e.kind)) damageEnemy(e, dps * 2 * HAZARD_TICK, sandOpts);
  }
}

function puddleUpdate(z: Zone, dt = 0): void {
  if (z.aux === 1) { quicksandUpdate(z, dt); return; }
  const p = world.player;
  if (p.alive && inZone(z, p.pos.x, p.pos.z, PLAYER_RADIUS * 0.5)) envSlow = Math.min(envSlow, 1 - PUDDLE_FACTOR);
  const ids = world.enemyGrid.query(z.pos.x, z.pos.z, z.radius + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.kind === 'BAT') continue;
    if (!inZone(z, e.pos.x, e.pos.z, e.radius * 0.5)) continue;
    if (z.aux === 0 && isAquatic(e.kind)) { e.waterT = 0.15; continue; }   // water monsters swim: faster, no slow (quicksand still holds them)
    if (e.slowT < 0.1) e.slowT = 0.1;
    if (e.slowFactor < PUDDLE_FACTOR) e.slowFactor = PUDDLE_FACTOR;
  }
}

/** Hostile trick patches: affect the player only. */
function hostilePatch(z: Zone, dt: number): void {
  const p = world.player;
  if (!p.alive) return;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
  const rr = z.radius + PLAYER_RADIUS * 0.5;
  const inside = dx * dx + dz * dz < rr * rr;
  if (!inside || p.dashT > 0) return;
  switch (z.kind) {
    case 'GOO': envSlow = Math.min(envSlow, 0.45); break;
    case 'CALTROPS': envSlow = Math.min(envSlow, 0.6); break;
    case 'SMOKE': p.blindT = Math.max(p.blindT, 0.6); break;
    default: break;
  }
  if (z.kind === 'FIREPATCH' || z.kind === 'ACID' || z.kind === 'PLAGUE' || z.kind === 'CALTROPS') {
    z.tickT += dt;
    if (z.tickT >= HAZARD_TICK) {
      z.tickT -= HAZARD_TICK;
      if (z.kind === 'FIREPATCH') applyPlayerDebuff('BURN', 1.5, z.damage);
      else if (z.kind === 'CALTROPS') applyPlayerDebuff('BLEED', 1.5, z.damage);
      else applyPlayerDebuff('POISON', 1.5, z.damage);
    }
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
    damagePlayer(dps * HAZARD_TICK, { pos: z.pos, kind: gas ? 'POISON' : 'FIRE', env: true });
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
  if (z.trick > 0) { if (z.trick >= BT.VISUAL) resolveBossZone(z); else resolveTrick(z); z.active = false; return; }
  switch (z.kind) {
    case 'BLACKHOLE':   // no collapse explosion any more (it deals its damage while pulling): just fades out
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 0.6, color: 0x6d28d9 });
      break;
    case 'TELEGRAPH_CIRCLE': {
      const p = world.player;
      const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z;
      const rr = z.radius + PLAYER_RADIUS;
      if (dx * dx + dz * dz < rr * rr) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL', tr: z.aux | 0, kb: z.kb || undefined, down: z.down || undefined });
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius, color: z.color });
      addShake(Math.min(0.5, 0.1 + z.radius * 0.03));
      break;
    }
    case 'TELEGRAPH_LINE':
      if (z.damage > 0 && lineHitsPlayer(z)) damagePlayer(z.damage, { pos: z.pos, kind: 'PHYSICAL', tr: z.aux | 0, kb: z.kb || undefined, down: z.down || undefined });
      break;
    default: break;
  }
  z.active = false;
}

const RIFT_BURN: StatusEffect = { type: 'BURN', duration: 2, value: 6 };
let riftT = 0;
/** Ember Wastes lava rift (walkable, not a wall): the hero is slowed and burns heavily unless dashing across it; monsters that wade in burn too. */
function riftUpdate(dt: number): void {
  const p = world.player;
  if (p.alive && p.dashT <= 0) {
    const d = riverD(p.pos.x, p.pos.z);
    if (Math.abs(d) < hwAt(riverS(p.pos.x, p.pos.z)) + 0.2) {
      envSlow = Math.min(envSlow, 0.55);
      if (p.burnT <= 0.5) applyPlayerDebuff('BURN', 3, 10 + world.director.wave * 1.6);
    }
  }
  riftT += dt;
  if (riftT < 0.25) return;
  riftT = 0;
  const es = world.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.boss || e.kind === 'BAT' || e.kind === 'WRAITH') continue;
    if (Math.abs(riverD(e.pos.x, e.pos.z)) < hwAt(riverS(e.pos.x, e.pos.z))) { RIFT_BURN.value = Math.max(1, e.maxHp * 0.03); applyStatus(e, RIFT_BURN); }
  }
}

const LAVA_BURN: StatusEffect = { type: 'BURN', duration: 2, value: 3 };
let lavaT = 0;
/** Ember lava floor (lavaFloor.ts): walkable; the hero is slowed and burns unless dashing, monsters burn a little. O(1) grid lookups. */
function lavaUpdate(dt: number): void {
  const p = world.player;
  if (p.alive && p.dashT <= 0 && !(bp.on && bp.kind === 'LAVA') && lavaAt(p.pos.x, p.pos.z)) {   // (Ignar's Floor is Lava: only the eruption tiles hurt, a cool tile is safe wherever it sits)
    envSlow = Math.min(envSlow, 0.7);
    if (p.burnT <= 0.5) applyPlayerDebuff('BURN', 3, 8 + world.director.wave * 1.2);
  }
  lavaT += dt;
  if (lavaT < 0.3) return;
  lavaT = 0;
  const es = world.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.boss || e.kind === 'BAT' || e.kind === 'WRAITH' || isStationary(e.kind)) continue;
    if (lavaAt(e.pos.x, e.pos.z)) { LAVA_BURN.value = Math.max(1, e.maxHp * 0.012); applyStatus(e, LAVA_BURN); }
  }
}

export function updateZones(dt: number): void {
  const ew = world.player.earthwall;
  if (ew.active) {
    ew.t -= dt;
    if (ew.t <= 0) ew.active = false;
  }

  envSlow = arenaSlow(); // Glacius blizzard slows the whole arena
  if (feat.rift) riftUpdate(dt);
  if (lava.on && world.room.active) lavaUpdate(dt);
  updateWalls(dt);
  const zones = world.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.active) continue;
    if (z.permanent) {
      if (z.kind === 'PUDDLE') puddleUpdate(z, dt);
      else if (z.kind === 'GAS') {
        z.tickT += dt;
        if (z.tickT >= HAZARD_TICK) { z.tickT -= HAZARD_TICK; if (gasActive(z)) hazardTick(z); }
      }
      continue;
    }
    z.life -= dt;

    if (z.life > 0) {
      // hostile copies of the hero's own fields (the dark hero champion): drawn as usual, but they never touch monsters;
      // darkHero.ts applies their effect to the player
      if (z.hostile && (z.kind === 'FIRE' || z.kind === 'BLACKHOLE' || z.kind === 'TORNADO' || z.kind === 'FROST_FIELD' || z.kind === 'CURSE')) continue;
      switch (z.kind) {
        case 'FIRE':
          z.tickT += dt;
          if (z.tickT >= FIRE_TICK) { z.tickT -= FIRE_TICK; fireTick(z); }
          break;
        case 'BLACKHOLE':
          pullTick(z, dt);
          break;
        case 'TORNADO':
          pullTick(z, dt);
          z.tickT += dt;
          if (z.tickT >= FIRE_TICK) { z.tickT -= FIRE_TICK; dotTick(z, windOpts, false); }
          break;
        case 'FROST_FIELD':
          z.tickT += dt;
          if (z.tickT >= FIRE_TICK) { z.tickT -= FIRE_TICK; dotTick(z, iceDot, true); }
          break;
        case 'CURSE':   // necromancer Plague Ground: rot + slow
          z.tickT += dt;
          if (z.tickT >= FIRE_TICK) { z.tickT -= FIRE_TICK; curseTick(z); }
          break;
        case 'POISON_POOL':
          z.tickT += dt;
          if (z.tickT >= POISON_TICK) { z.tickT -= POISON_TICK; poisonTick(z); }
          break;
        case 'PUDDLE': puddleUpdate(z, dt); break;
        case 'GOO': case 'CALTROPS': case 'FIREPATCH': case 'ACID': case 'PLAGUE': case 'SMOKE': hostilePatch(z, dt); break;
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
