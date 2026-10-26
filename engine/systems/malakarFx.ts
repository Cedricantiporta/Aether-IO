// Malakar's black-purple ground effects (pooled, allocation-free per frame): the big gravity well that drags the hero in, the burning
// trails left by his giant fireballs, and the meteor shower whose impacts open timed black holes (biomeHazards.spawnBlackHole,
// capped there at 4 alive). Zones are drawn by render/Zones.tsx like any hostile zone; the damage / pull is applied here.
// tickMalakarFx runs from bosses.ts every frame he is alive.
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { events } from '../events';
import type { Zone } from '../types';
import { damagePlayer, applyPlayerDebuff, playerTrickImmune } from './combat';
import { hooks } from './hooks';
import { spawnBlackHole } from './biomeHazards';
import { edgeLimit } from '../mapgen';

export const C_DARK = 0x4c1d95, C_DEEP = 0x2e1065, C_VIOLET = 0x7c3aed;
const METEOR_R = 3.2, HOLE_LIFE = 6;
const tmp = new Vector3();

interface Well { z: Zone | null; dmg: number; tick: number }
interface Burn { z: Zone | null; dmg: number; tick: number }
interface Meteor { on: boolean; x: number; z: number; t: number; dmg: number; z0: Zone | null }
const wells: Well[] = Array.from({ length: 2 }, () => ({ z: null, dmg: 0, tick: 0 }));
const burns: Burn[] = Array.from({ length: 60 }, () => ({ z: null, dmg: 0, tick: 0 }));
const meteors: Meteor[] = Array.from({ length: 14 }, () => ({ on: false, x: 0, z: 0, t: 0, dmg: 0, z0: null }));
let trailDmg = 6;

function hostileZone(kind: 'BLACKHOLE' | 'FIRE' | 'METEOR_SHADOW', x: number, z: number, r: number, life: number, color: number): Zone | null {
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = kind; zn.hostile = true; zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = 0; zn.color = color;
  zn.tickT = 0; zn.length = 0; zn.maxPull = 0; zn.trick = 0; zn.aux = 0;
  return zn;
}

/** The giant gravity spell (a bigger Singularity): drags the hero toward its core (walkable against, but strong), slows and hurts. */
export function gravityWell(x: number, z: number, r: number, life: number, dmgPerTick: number): void {
  const w = wells.find((q) => !q.z) ?? wells[0];
  w.z = hostileZone('BLACKHOLE', x, z, r, life, C_VIOLET); w.dmg = dmgPerTick; w.tick = 0.4;
  events.emit('shockwave', { pos: tmp.set(x, 0, z), radius: r, color: C_VIOLET });
}

/** Called by Malakar's fireballs (EnemyProjectile.trail): a short-lived burning patch. */
export function setTrailDamage(d: number): void { trailDmg = d; }
function burnPatch(x: number, z: number): void {
  const b = burns.find((q) => !q.z || !q.z.active);
  if (!b) return;
  b.z = hostileZone('FIRE', x, z, 1.9, 3.2, C_DARK); b.dmg = trailDmg; b.tick = 0.3;
}

/** One meteor: a violet shadow grows for `delay` s, then it strikes (damage in METEOR_R) and a timed black hole opens there. */
export function queueMeteor(x: number, z: number, delay: number, dmg: number): void {
  const m = meteors.find((q) => !q.on);
  if (!m) return;
  m.on = true; m.x = x; m.z = z; m.t = delay; m.dmg = dmg;
  m.z0 = hostileZone('METEOR_SHADOW', x, z, METEOR_R, delay, C_VIOLET);
  events.emit('telegraph', { pos: tmp.set(x, 0, z), radius: METEOR_R, duration: delay });
}

/** Room reset / boss gone: drop everything. */
export function clearMalakarFx(): void {
  for (const w of wells) w.z = null;
  for (const b of burns) b.z = null;
  for (const m of meteors) m.on = false;
}

export function tickMalakarFx(dt: number): void {
  const p = world.player;
  for (const w of wells) {
    const z = w.z;
    if (!z) continue;
    if (!z.active || !z.hostile || z.kind !== 'BLACKHOLE' || z.life <= 0) { w.z = null; continue; }
    if (!p.alive) continue;
    const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1e-3, R = z.radius;
    w.tick -= dt;
    if (d < R * 1.7 && d > 0.8 && !playerTrickImmune()) {   // pull: ~6.5 u/s at the edge, a bit more near the core (hero walks ~6-8)
      const s = (6.5 + 3 * (1 - Math.min(1, d / R))) * dt;
      p.pos.x += dx / d * s; p.pos.z += dz / d * s;
      const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
      if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
    }
    if (d < R && p.slowT < 0.3) applyPlayerDebuff('SLOW', 0.3);
    if (w.tick <= 0) { w.tick = 0.4; if (d < R) damagePlayer(w.dmg, { pos: z.pos, kind: 'MAGIC' }); }
  }
  for (const b of burns) {
    const z = b.z;
    if (!z) continue;
    if (!z.active || z.kind !== 'FIRE' || z.life <= 0) { b.z = null; continue; }
    b.tick -= dt;
    if (b.tick > 0 || !p.alive) continue;
    b.tick = 0.5;
    const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z, rr = z.radius + 0.5;
    if (dx * dx + dz * dz < rr * rr) damagePlayer(b.dmg, { pos: z.pos, kind: 'FIRE', env: true });
  }
  for (const m of meteors) {
    if (!m.on) continue;
    m.t -= dt;
    if (m.t > 0) continue;
    m.on = false;
    events.emit('explosion', { pos: tmp.set(m.x, 0.5, m.z), radius: METEOR_R * 1.4, color: C_VIOLET });
    events.emit('shake', { amount: 0.25 });
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, rr = METEOR_R + 0.6;
    if (p.alive && dx * dx + dz * dz < rr * rr) damagePlayer(m.dmg, { pos: tmp.set(m.x, 0, m.z), kind: 'MAGIC' });
    spawnBlackHole(m.x, m.z, HOLE_LIFE);
  }
}

hooks.burnTrail = burnPatch;
hooks.darkImpact = (x: number, z: number, r: number): void => {
  burnPatch(x, z);
  events.emit('explosion', { pos: new Vector3(x, 0.5, z), radius: r * 1.4, color: C_VIOLET });
};
