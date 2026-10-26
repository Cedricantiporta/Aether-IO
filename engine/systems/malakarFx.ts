// Malakar's violet-and-dark effects (pooled, allocation-free per frame). State lives in `mfx`; render/MalakarFx.tsx draws it.
//   LASERS   a purple telegraph lane, then a visible beam fires along it (hit-test once when it fires, see tickLasers)
//   GRAVITY  a ~1.5 s indicator at the centre, then a pull across the whole arena (stronger the closer you stand), a damage core
//            (more damage nearer the middle) and a big final explosion; the black hole itself is biomeHazards' visual (spawnGravityVisual)
//   METEORS  the impact circle follows the hero (~1.2 s), locks, a meteor falls, impact (no black hole any more)
//   HOLES    a warning circle follows the hero, then a timed black hole opens under them and slowly follows (biomeHazards.spawnBlackHole)
//   RUNES    a violet rune ring on the floor at every teleport (departure + arrival)
//   BURNS    short-lived dark patches under his fireballs (few and rare)
// tickMalakarFx runs from bosses.ts every frame he is alive; clearMalakarFx on room reset.
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { events } from '../events';
import type { Zone } from '../types';
import { damagePlayer, applyPlayerDebuff, playerTrickImmune } from './combat';
import { hooks } from './hooks';
import { spawnBlackHole, spawnGravityVisual } from './biomeHazards';
import { edgeLimit } from '../mapgen';

export const C_DARK = 0x4c1d95, C_DEEP = 0x2e1065, C_VIOLET = 0x7c3aed, C_LILAC = 0xa855f7;
export const METEOR_FOLLOW = 1.2, METEOR_FALL = 0.7, METEOR_R = 3.4;
export const GRAV_IND = 1.5, GRAV_DUR = 4.0, GRAV_CORE = 6.0, LASER_FIRE = 0.45;
const HOLE_LIFE = 9, HOLE_FOLLOW = 4.0, HOLE_WARN = 1.0, VISUAL = 30;   // VISUAL = bossFx BT.VISUAL (a telegraph that only shows its colour)
const tmp = new Vector3();

interface Laser { on: boolean; x: number; z: number; dx: number; dz: number; len: number; w: number; t: number; tel: number; dmg: number; hit: boolean }
interface Rune { on: boolean; x: number; z: number; t: number; life: number; r: number }
interface Meteor { on: boolean; x: number; z: number; ox: number; oz: number; t: number; dmg: number; z0: Zone | null }
interface HoleQ { on: boolean; t: number; x: number; z: number; z0: Zone | null }
interface Burn { z: Zone | null; dmg: number; tick: number }

export const mfx = {
  lasers: Array.from({ length: 12 }, (): Laser => ({ on: false, x: 0, z: 0, dx: 0, dz: 1, len: 40, w: 2.4, t: 0, tel: 1, dmg: 0, hit: false })),
  runes: Array.from({ length: 12 }, (): Rune => ({ on: false, x: 0, z: 0, t: 0, life: 1.2, r: 3 })),
  meteors: Array.from({ length: 6 }, (): Meteor => ({ on: false, x: 0, z: 0, ox: 0, oz: 0, t: 0, dmg: 0, z0: null })),
  holes: Array.from({ length: 4 }, (): HoleQ => ({ on: false, t: 0, x: 0, z: 0, z0: null })),
  /** gravity spell: ph 0 off, 1 indicator, 2 pulling; t = seconds in the phase */
  grav: { ph: 0, t: 0, x: 0, z: 0, tick: 0, dmg: 0, boom: 0, ramp: 0 },
  /** a major skill is telegraphing / resolving: his illusions hold their basic volleys */
  major: false,
};
const burns: Burn[] = Array.from({ length: 24 }, () => ({ z: null, dmg: 0, tick: 0 }));
let trailDmg = 6;

function hostileZone(kind: 'FIRE' | 'TELEGRAPH_CIRCLE' | 'TELEGRAPH_LINE', x: number, z: number, r: number, life: number, color: number): Zone | null {
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = kind; zn.hostile = true; zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = 0; zn.color = color;
  zn.tickT = 0; zn.length = 0; zn.maxPull = 0; zn.trick = 0; zn.aux = 0; zn.kb = 0; zn.down = 0;
  return zn;
}
/** A purple (colour-only) telegraph circle: resolves without any effect; the real effect is applied here. */
function purpleCircle(x: number, z: number, r: number, life: number): Zone | null {
  const zn = hostileZone('TELEGRAPH_CIRCLE', x, z, r, life, C_LILAC);
  if (zn) { zn.trick = VISUAL; events.emit('telegraph', { pos: zn.pos, radius: r, duration: life }); }
  return zn;
}
function clampArena(v: { x: number; z: number }, margin: number): void {
  const lim = edgeLimit(v.x, v.z, margin), d2 = v.x * v.x + v.z * v.z;
  if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); v.x *= s; v.z *= s; }
}

// ---------------------------------------------------------------- runes ----
/** A violet magic circle on the floor (every Malakar teleport: departure + arrival). */
export function spawnRune(x: number, z: number, r = 3.4, life = 1.2): void {
  let q = mfx.runes.find((k) => !k.on);
  if (!q) { q = mfx.runes[0]; for (const k of mfx.runes) if (k.t > q.t) q = k; }
  q.on = true; q.x = x; q.z = z; q.t = 0; q.life = life; q.r = r;
}

// --------------------------------------------------------------- lasers ----
/** A laser lane: a purple telegraph for `tel` s, then a bright beam fires (LASER_FIRE s) and hurts the hero standing in the lane. */
export function queueLaser(x: number, z: number, dx: number, dz: number, len: number, w: number, tel: number, dmg: number): void {
  const l = mfx.lasers.find((q) => !q.on);
  if (!l) return;
  const d = Math.hypot(dx, dz) || 1;
  l.on = true; l.x = x; l.z = z; l.dx = dx / d; l.dz = dz / d; l.len = len; l.w = w; l.t = 0; l.tel = tel; l.dmg = dmg; l.hit = false;
  const zn = hostileZone('TELEGRAPH_LINE', x, z, w, tel, C_LILAC);
  if (zn) { zn.dir.set(l.dx, 0, l.dz); zn.length = len; zn.trick = VISUAL; events.emit('telegraph', { pos: zn.pos, radius: w, duration: tel }); }
}
function tickLasers(dt: number): void {
  const p = world.player;
  for (const l of mfx.lasers) {
    if (!l.on) continue;
    l.t += dt;
    if (!l.hit && l.t >= l.tel) {
      l.hit = true;
      events.emit('shake', { amount: 0.18 });
      events.emit('shockwave', { pos: tmp.set(l.x, 0, l.z), radius: 3, color: C_LILAC });
      if (p.alive) {
        const rx = p.pos.x - l.x, rz = p.pos.z - l.z, along = rx * l.dx + rz * l.dz, perp = Math.abs(rx * l.dz - rz * l.dx);
        if (along > -0.6 && along < l.len + 0.6 && perp < l.w * 0.5 + 0.6) damagePlayer(l.dmg, { pos: tmp.set(l.x, 0, l.z), kind: 'MAGIC' });
      }
    }
    if (l.t >= l.tel + LASER_FIRE) l.on = false;
  }
}

// -------------------------------------------------------------- gravity ----
/** The gravity spell: indicator at (x, z) for GRAV_IND s, then GRAV_DUR s of pulling, then an explosion. `dmg` = base damage unit. */
export function gravityBegin(x: number, z: number, dmg: number): void {
  const g = mfx.grav;
  g.ph = 1; g.t = 0; g.x = x; g.z = z; g.dmg = dmg; g.tick = 0.3; g.boom = 0; g.ramp = 0;
  events.emit('telegraph', { pos: tmp.set(x, 0, z), radius: GRAV_CORE, duration: GRAV_IND });
}
export function gravityBusy(): boolean { return mfx.grav.ph !== 0 || mfx.grav.boom > 0; }
function tickGravity(dt: number): void {
  const g = mfx.grav, p = world.player;
  if (g.boom > 0) g.boom -= dt;
  if (g.ph === 0) return;
  g.t += dt;
  if (g.ph === 1) {
    if (g.t < GRAV_IND) return;
    g.ph = 2; g.t = 0; g.tick = 0.3;
    spawnGravityVisual(g.x, g.z, GRAV_DUR + 0.1, 3);
    events.emit('shockwave', { pos: tmp.set(g.x, 0, g.z), radius: 12, color: C_VIOLET });
    events.emit('shake', { amount: 0.3 });
    return;
  }
  const R = Math.max(30, world.room.radius * 1.1);
  g.ramp = Math.min(1, g.t / 0.7);
  if (p.alive) {
    const dx = g.x - p.pos.x, dz = g.z - p.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    if (!playerTrickImmune() && d > 0.6) {   // the whole arena is pulled: ~1.5 u/s far away, up to ~12 u/s at the core (the hero walks ~6-8; a dash resists)
      const near = Math.max(0, 1 - d / R);
      const s = (1.5 + 10.5 * Math.pow(near, 1.4)) * g.ramp * (p.dashT > 0 ? 0.3 : 1) * dt;
      p.pos.x += dx / d * s; p.pos.z += dz / d * s;
      const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
      if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
    }
    if (d < GRAV_CORE) {
      if (p.slowT < 0.3) applyPlayerDebuff('SLOW', 0.3);
      g.tick -= dt;
      if (g.tick <= 0) { g.tick = 0.3; damagePlayer(g.dmg * 0.3 * (1 + 2 * (1 - d / GRAV_CORE)), { pos: tmp.set(g.x, 0, g.z), kind: 'MAGIC' }); }   // the closer to the centre the harder
    }
  }
  if (g.t >= GRAV_DUR) {   // the end: the black hole collapses in an explosion
    g.ph = 0; g.boom = 0.8;
    events.emit('explosion', { pos: tmp.set(g.x, 0.5, g.z), radius: GRAV_CORE * 1.6, color: C_VIOLET });
    events.emit('shockwave', { pos: tmp.set(g.x, 0, g.z), radius: GRAV_CORE * 2.4, color: C_LILAC });
    events.emit('crater', { pos: tmp.set(g.x, 0, g.z), radius: GRAV_CORE * 0.6, color: 0x120620 });
    events.emit('shake', { amount: 0.8 });
    if (p.alive && (p.pos.x - g.x) ** 2 + (p.pos.z - g.z) ** 2 < (GRAV_CORE + 0.6) ** 2) damagePlayer(g.dmg * 4, { pos: tmp.set(g.x, 0, g.z), kind: 'MAGIC' });
  }
}

// ------------------------------------------------------------- meteors ----
/** One meteor (Slime-King style): the circle follows the hero (+ offset) for METEOR_FOLLOW s, locks, the meteor falls METEOR_FALL s, impact. */
export function queueMeteor(ox: number, oz: number, dmg: number): void {
  const m = mfx.meteors.find((q) => !q.on);
  if (!m) return;
  const p = world.player.pos;
  m.on = true; m.x = p.x + ox; m.z = p.z + oz; m.ox = ox; m.oz = oz; m.t = 0; m.dmg = dmg;
  clampArena(m, 3);
  m.z0 = purpleCircle(m.x, m.z, METEOR_R, METEOR_FOLLOW + METEOR_FALL);
}
export function meteorsBusy(): boolean { for (const m of mfx.meteors) if (m.on) return true; return false; }
function tickMeteors(dt: number): void {
  const p = world.player;
  for (const m of mfx.meteors) {
    if (!m.on) continue;
    m.t += dt;
    if (m.t < METEOR_FOLLOW) {   // the indicator hunts the hero (12 u/s: a sprint outruns it)
      const tx = p.pos.x + m.ox, tz = p.pos.z + m.oz, dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d > 0.01) { const s = Math.min(d, 12 * dt); m.x += dx / d * s; m.z += dz / d * s; clampArena(m, 3); }
    }
    if (m.z0 && m.z0.active) m.z0.pos.set(m.x, 0, m.z);
    if (m.t < METEOR_FOLLOW + METEOR_FALL) continue;
    m.on = false; m.z0 = null;
    events.emit('explosion', { pos: tmp.set(m.x, 0.5, m.z), radius: METEOR_R * 1.5, color: C_VIOLET });
    events.emit('crater', { pos: tmp.set(m.x, 0, m.z), radius: METEOR_R * 0.7, color: 0x120620 });
    events.emit('shake', { amount: 0.35 });
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, rr = METEOR_R + 0.6;
    if (p.alive && dx * dx + dz * dz < rr * rr) damagePlayer(m.dmg, { pos: tmp.set(m.x, 0, m.z), kind: 'MAGIC' });
  }
}

// ------------------------------------------------------------ black holes ----
/** Summoned black hole: a warning circle that follows the hero for HOLE_WARN s, then a hole opens exactly there and slowly follows the hero. */
export function queueHole(delay: number): void {
  const h = mfx.holes.find((q) => !q.on);
  if (!h) return;
  h.on = true; h.t = -delay; h.z0 = null; h.x = world.player.pos.x; h.z = world.player.pos.z;
}
export function holesBusy(): boolean { for (const h of mfx.holes) if (h.on) return true; return false; }
function tickHoles(dt: number): void {
  const p = world.player.pos;
  for (const h of mfx.holes) {
    if (!h.on) continue;
    const t0 = h.t; h.t += dt;
    if (h.t < 0) continue;
    if (t0 < 0) h.z0 = purpleCircle(p.x, p.z, 3.2, HOLE_WARN);
    h.x = p.x; h.z = p.z;
    if (h.z0 && h.z0.active) h.z0.pos.set(h.x, 0, h.z);
    if (h.t >= HOLE_WARN) {
      h.on = false; h.z0 = null;
      spawnBlackHole(h.x, h.z, HOLE_LIFE, HOLE_FOLLOW);
      events.emit('shake', { amount: 0.2 });
    }
  }
}

// ------------------------------------------------------------ fire trails ----
/** Called by Malakar's fireballs (EnemyProjectile.trail): a short-lived burning patch (rare). */
export function setTrailDamage(d: number): void { trailDmg = d; }
function burnPatch(x: number, z: number): void {
  const b = burns.find((q) => !q.z || !q.z.active);
  if (!b) return;
  b.z = hostileZone('FIRE', x, z, 1.7, 2.6, C_DARK); b.dmg = trailDmg; b.tick = 0.3;
}

/** Room reset / boss gone: drop everything. */
export function clearMalakarFx(): void {
  for (const b of burns) b.z = null;
  for (const l of mfx.lasers) l.on = false;
  for (const r of mfx.runes) r.on = false;
  for (const m of mfx.meteors) { m.on = false; m.z0 = null; }
  for (const h of mfx.holes) { h.on = false; h.z0 = null; }
  mfx.grav.ph = 0; mfx.grav.boom = 0; mfx.major = false;
}

export function tickMalakarFx(dt: number): void {
  const p = world.player;
  tickLasers(dt); tickGravity(dt); tickMeteors(dt); tickHoles(dt);
  for (const r of mfx.runes) if (r.on) { r.t += dt; if (r.t >= r.life) r.on = false; }
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
}

hooks.burnTrail = burnPatch;
hooks.darkImpact = (x: number, z: number, r: number): void => {
  events.emit('explosion', { pos: new Vector3(x, 0.5, z), radius: r * 1.4, color: C_VIOLET });   // (no burning patch any more: less floor clutter)
};
