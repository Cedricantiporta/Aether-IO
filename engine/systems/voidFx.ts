// Malakar's violet-and-dark effects (pooled, allocation-free per frame). State lives in `mfx`; render/VoidFx.tsx draws it.
//   LASERS   a purple telegraph lane, then a visible beam fires along it (hit-test once when it fires, see tickLasers)
//   GRAVITY  a ~1.5 s indicator at the centre, then a pull across the whole arena (stronger the closer you stand), a damage core
//            (more damage nearer the middle) and a big final explosion; the black hole itself is biomeHazards' visual (spawnGravityVisual)
//   METEORS  the impact circle follows the hero (~1.2 s), locks, a meteor falls, impact (no black hole any more)
//   HOLES    a warning circle follows the hero, then a timed black hole opens under them and slowly follows (biomeHazards.spawnBlackHole)
//   EVENT HORIZON  (mechanic) the arena is a gravity well: pulled to the centre, a collapse (85% max hp) unless you stand in a drifting light pocket
//   SOUL MIRROR    (mechanic) a line splits the arena; void spikes erupt where your MIRROR image stands: move so the mirror is safe
//   BOMBS    telegraphed circles (mirror spikes, the Find-the-Real-One punish) checked against the hero or the mirror soul
//   RUNES    a violet rune ring on the floor at every teleport (departure + arrival)
//   BURNS    short-lived dark patches under his fireballs (few and rare)
// tickVoidFx runs from bosses.ts every frame he is alive; clearVoidFx on room reset.
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { events } from '../events';
import type { Zone } from '../types';
import { damagePlayer, applyPlayerDebuff, playerTrickImmune } from './combat';
import { hooks } from './hooks';
import { spawnBlackHole, spawnGravityVisual } from './biomeHazards';
import { bp } from './bossPhaseState';
import { edgeLimit } from '../mapgen';

export const C_DARK = 0x4c1d95, C_DEEP = 0x2e1065, C_VIOLET = 0x7c3aed, C_LILAC = 0xa855f7;
export const METEOR_FOLLOW = 1.0, METEOR_FALL = 0.6, METEOR_R = 3.4;
export const GRAV_IND = 1.2, GRAV_DUR = 4.0, GRAV_CORE = 6.0, LASER_FIRE = 0.4;
const HOLE_LIFE = 9, HOLE_FOLLOW = 5.0, HOLE_WARN = 0.8, VISUAL = 30;   // VISUAL = bossFx BT.VISUAL (a telegraph that only shows its colour)
export const EH_IND = 1.6, EH_DUR = 6.0, EH_POCKET_R = 3.0, EH_MAX_POCKETS = 3, EH_PCT = 0.85;
export const MIR_LINE = 1.0;
const tmp = new Vector3();

interface Laser { on: boolean; x: number; z: number; dx: number; dz: number; len: number; w: number; t: number; tel: number; dmg: number; hit: boolean }
interface Rune { on: boolean; x: number; z: number; t: number; life: number; r: number }
interface Meteor { on: boolean; x: number; z: number; ox: number; oz: number; t: number; dmg: number; z0: Zone | null }
interface HoleQ { on: boolean; t: number; x: number; z: number; z0: Zone | null }
interface Pocket { x: number; z: number; r0: number; a0: number; w: number; wob: number }
interface Bomb { on: boolean; mir: boolean; x: number; z: number; r: number; t: number; T: number; pct: number }
interface Burn { z: Zone | null; dmg: number; tick: number }

export const mfx = {
  lasers: Array.from({ length: 12 }, (): Laser => ({ on: false, x: 0, z: 0, dx: 0, dz: 1, len: 40, w: 2.4, t: 0, tel: 1, dmg: 0, hit: false })),
  runes: Array.from({ length: 12 }, (): Rune => ({ on: false, x: 0, z: 0, t: 0, life: 1.2, r: 3 })),
  meteors: Array.from({ length: 6 }, (): Meteor => ({ on: false, x: 0, z: 0, ox: 0, oz: 0, t: 0, dmg: 0, z0: null })),
  holes: Array.from({ length: 4 }, (): HoleQ => ({ on: false, t: 0, x: 0, z: 0, z0: null })),
  /** gravity spell: ph 0 off, 1 indicator, 2 pulling; t = seconds in the phase */
  grav: { ph: 0, t: 0, x: 0, z: 0, tick: 0, dmg: 0, boom: 0, ramp: 0 },
  /** Event Horizon: ph 0 off, 1 pockets appear (no pull yet), 2 pulling; np pockets of radius EH_POCKET_R that drift round the centre */
  eh: { ph: 0, t: 0, np: 0, tick: 0, boom: 0, pockets: Array.from({ length: EH_MAX_POCKETS }, (): Pocket => ({ x: 0, z: 0, r0: 12, a0: 0, w: 0.2, wob: 0 })) },
  /** Soul Mirror: ph 0 off, 1 line draws, 2 spike waves; the line goes through the arena centre along (dx, dz); s = the hero's reflection (the soul) */
  mir: { ph: 0, t: 0, dx: 0, dz: 1, s: { x: 0, z: 0 }, wave: 0, waves: 3, gap: 1.5, warn: 1.25, pct: 0.3 },
  bombs: Array.from({ length: 8 }, (): Bomb => ({ on: false, mir: false, x: 0, z: 0, r: 3, t: 0, T: 1, pct: 0.3 })),
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
/** A laser lane: a purple telegraph for `tel` s, then a bright beam fires (LASER_FIRE s) and hurts the hero standing in the lane (`dmg` = share of max hp). */
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
        if (along > -0.6 && along < l.len + 0.6 && perp < l.w * 0.5 + 0.6) damagePlayer(1, { pct: l.dmg, pos: tmp.set(l.x, 0, l.z), kind: 'MAGIC' });
      }
    }
    if (l.t >= l.tel + LASER_FIRE) l.on = false;
  }
}

// -------------------------------------------------------------- gravity ----
/** The gravity spell: indicator at (x, z) for GRAV_IND s, then GRAV_DUR s of pulling, then an explosion. `dmg` = the explosion's share of max hp (core ticks are 4% of it, x1-3). */
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
      if (g.tick <= 0) { g.tick = 0.3; damagePlayer(1, { pct: g.dmg * 0.04 * (1 + 2 * (1 - d / GRAV_CORE)), pos: tmp.set(g.x, 0, g.z), kind: 'MAGIC' }); }   // the closer to the centre the harder
    }
  }
  if (g.t >= GRAV_DUR) {   // the end: the black hole collapses in an explosion
    g.ph = 0; g.boom = 0.8;
    events.emit('explosion', { pos: tmp.set(g.x, 0.5, g.z), radius: GRAV_CORE * 1.6, color: C_VIOLET });
    events.emit('shockwave', { pos: tmp.set(g.x, 0, g.z), radius: GRAV_CORE * 2.4, color: C_LILAC });
    events.emit('crater', { pos: tmp.set(g.x, 0, g.z), radius: GRAV_CORE * 0.6, color: 0x120620 });
    events.emit('shake', { amount: 0.8 });
    if (p.alive && (p.pos.x - g.x) ** 2 + (p.pos.z - g.z) ** 2 < (GRAV_CORE + 0.6) ** 2) damagePlayer(1, { pct: g.dmg, pos: tmp.set(g.x, 0, g.z), kind: 'MAGIC' });
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
    if (m.t < METEOR_FOLLOW) {   // the indicator hunts the hero (14 u/s)
      const tx = p.pos.x + m.ox, tz = p.pos.z + m.oz, dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d > 0.01) { const s = Math.min(d, 14 * dt); m.x += dx / d * s; m.z += dz / d * s; clampArena(m, 3); }
    }
    if (m.z0 && m.z0.active) m.z0.pos.set(m.x, 0, m.z);
    if (m.t < METEOR_FOLLOW + METEOR_FALL) continue;
    m.on = false; m.z0 = null;
    events.emit('explosion', { pos: tmp.set(m.x, 0.5, m.z), radius: METEOR_R * 1.5, color: C_VIOLET });
    events.emit('crater', { pos: tmp.set(m.x, 0, m.z), radius: METEOR_R * 0.7, color: 0x120620 });
    events.emit('shake', { amount: 0.35 });
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, rr = METEOR_R + 0.6;
    if (p.alive && dx * dx + dz * dz < rr * rr) damagePlayer(1, { pct: m.dmg, pos: tmp.set(m.x, 0, m.z), kind: 'MAGIC' });
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

// ----------------------------------------------------------- the banner ----
/** One-line hint banner in the boss-phase HUD (a mechanic skill announcing itself). */
function banner(name: string, sub: string, color = C_LILAC): void {
  bp.name = name; bp.sub = sub; bp.color = color; bp.bannerT = 3.2;
}

// ------------------------------------------------------------ bombs ----
/** A telegraphed circle (`T` s). It hits the hero standing in it, or (mir) the hero's mirror soul. `pct` = share of max hp. */
export function queueBomb(x: number, z: number, r: number, T: number, pct: number, mir = false): void {
  const b = mfx.bombs.find((q) => !q.on);
  if (!b) return;
  b.on = true; b.mir = mir; b.x = x; b.z = z; b.r = r; b.t = 0; b.T = T; b.pct = pct;
}
function tickBombs(dt: number): void {
  const p = world.player, s = mfx.mir.s;
  for (const b of mfx.bombs) {
    if (!b.on) continue;
    b.t += dt;
    if (b.t < b.T) continue;
    b.on = false;
    events.emit('explosion', { pos: tmp.set(b.x, 0.5, b.z), radius: b.r * 1.3, color: b.mir ? C_LILAC : C_VIOLET });
    events.emit('crater', { pos: tmp.set(b.x, 0, b.z), radius: b.r * 0.5, color: 0x120620 });
    events.emit('shake', { amount: 0.3 });
    const hx = b.mir ? s.x : p.pos.x, hz = b.mir ? s.z : p.pos.z, rr = b.r + 0.4;
    if (p.alive && (hx - b.x) ** 2 + (hz - b.z) ** 2 < rr * rr) damagePlayer(1, { pct: b.pct, pos: tmp.set(b.x, 0, b.z), kind: 'MAGIC', kb: 2 });
  }
}

// ------------------------------------------------------- Event Horizon ----
/** EVENT HORIZON (mechanic): 1.6 s of warning while 2-3 light pockets appear, then 6 s in which the whole arena is dragged to the centre
 *  (unless you stand in a pocket) and finally COLLAPSES for 85% max hp anywhere outside a pocket. Pockets drift slowly round the centre. */
export function eventHorizonBegin(n: number): void {
  const e = mfx.eh;
  e.ph = 1; e.t = 0; e.np = Math.min(EH_MAX_POCKETS, n); e.tick = 0.5; e.boom = 0;
  const base = Math.random() * 6.283, dir = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; i < e.np; i++) {
    const q = e.pockets[i];
    q.a0 = base + (i / e.np) * 6.283; q.r0 = 11 + Math.random() * 6; q.w = dir * (0.16 + Math.random() * 0.06); q.wob = Math.random() * 6.283;
    pocketPos(q, 0);
  }
  banner('EVENT HORIZON', 'Stand inside a drifting LIGHT circle until the collapse!');
  events.emit('floatText', { pos: world.player.pos, text: 'GET IN THE LIGHT!', color: 0xfff1a8, scale: 1.3, dy: 4.5 });
}
function pocketPos(q: Pocket, t: number): void {
  const a = q.a0 + q.w * t;
  let r = q.r0 + 2.2 * Math.sin(t * 0.8 + q.wob);
  const lim = edgeLimit(Math.cos(a) * 10, Math.sin(a) * 10, EH_POCKET_R + 1.5);
  if (r > lim) r = lim;
  q.x = Math.cos(a) * r; q.z = Math.sin(a) * r;
}
export function ehBusy(): boolean { return mfx.eh.ph !== 0 || mfx.eh.boom > 0; }
export function inPocket(x: number, z: number): boolean {
  const e = mfx.eh;
  for (let i = 0; i < e.np; i++) { const q = e.pockets[i]; if ((x - q.x) ** 2 + (z - q.z) ** 2 < (EH_POCKET_R - 0.2) ** 2) return true; }
  return false;
}
function tickEventHorizon(dt: number): void {
  const e = mfx.eh, p = world.player;
  if (e.boom > 0) e.boom -= dt;
  if (e.ph === 0) return;
  e.t += dt;
  const tt = e.ph === 1 ? e.t : EH_IND + e.t;
  for (let i = 0; i < e.np; i++) pocketPos(e.pockets[i], tt);
  if (e.ph === 1) {
    if (e.t < EH_IND) return;
    e.ph = 2; e.t = 0; e.tick = 0.5;
    spawnGravityVisual(0, 0, EH_DUR + 0.1, 4.2);
    events.emit('shockwave', { pos: tmp.set(0, 0, 0), radius: 18, color: C_VIOLET });
    events.emit('shake', { amount: 0.4 });
    return;
  }
  const safe = p.alive && inPocket(p.pos.x, p.pos.z);
  if (p.alive && !safe && !playerTrickImmune()) {
    const d = Math.hypot(p.pos.x, p.pos.z) || 1e-3, k = e.t / EH_DUR;
    const s = (3.0 + 3.2 * k + 2.0 * Math.max(0, 1 - d / 22)) * Math.min(1, e.t / 0.5) * (p.dashT > 0 ? 0.3 : 1) * dt;   // ~3 u/s at first, ~8 u/s near the end at the core: pockets are reachable but you cannot idle
    if (d > 0.8) { p.pos.x -= p.pos.x / d * s; p.pos.z -= p.pos.z / d * s; }
    e.tick -= dt;
    if (e.tick <= 0) { e.tick = 0.5; damagePlayer(1, { pct: 0.02, pos: tmp.set(0, 0, 0), kind: 'MAGIC', env: true }); }   // the gravity wears you down outside the light
  }
  if (e.t >= EH_DUR) {   // the collapse
    e.ph = 0; e.boom = 0.9;
    events.emit('explosion', { pos: tmp.set(0, 0.5, 0), radius: 14, color: C_VIOLET });
    events.emit('shockwave', { pos: tmp.set(0, 0, 0), radius: 40, color: C_LILAC });
    events.emit('crater', { pos: tmp.set(0, 0, 0), radius: 6, color: 0x120620 });
    events.emit('shake', { amount: 1 });
    if (p.alive && !playerTrickImmune() && !inPocket(p.pos.x, p.pos.z)) damagePlayer(1, { pct: EH_PCT, pos: tmp.set(0, 0, 0), kind: 'MAGIC' });
    else events.emit('floatText', { pos: p.pos, text: 'SAFE!', color: 0xfff1a8, scale: 1.2, dy: 3.5 });
  }
}

// --------------------------------------------------------- Soul Mirror ----
/** SOUL MIRROR (mechanic): a line through the arena centre. Your MIRROR image (your soul) walks the other side as you walk. Waves of void
 *  spikes (telegraphed circles) erupt around the SOUL, never around you: move so the soul steps out of the circles. */
export function soulMirrorBegin(waves: number, warn: number, gap: number, pct: number): void {
  const m = mfx.mir, a = Math.random() * 3.1416;
  m.ph = 1; m.t = 0; m.dx = Math.sin(a); m.dz = Math.cos(a); m.wave = 0; m.waves = waves; m.warn = warn; m.gap = gap; m.pct = pct;
  mirrorOf(world.player.pos.x, world.player.pos.z);
  banner('SOUL MIRROR', 'Spikes hit your MIRROR across the line - move your reflection out of the circles!');
}
/** Reflects (x, z) over the mirror line into mfx.mir.s. */
function mirrorOf(x: number, z: number): void {
  const m = mfx.mir, nx = m.dz, nz = -m.dx, d = x * nx + z * nz;
  m.s.x = x - 2 * d * nx; m.s.z = z - 2 * d * nz;
  clampArena(m.s, 1.5);
}
export function mirrorBusy(): boolean {
  if (mfx.mir.ph !== 0) return true;
  for (const b of mfx.bombs) if (b.on && b.mir) return true;
  return false;
}
function tickMirror(dt: number): void {
  const m = mfx.mir, p = world.player;
  if (m.ph === 0) return;
  m.t += dt;
  mirrorOf(p.pos.x, p.pos.z);
  if (m.ph === 1) { if (m.t >= MIR_LINE) { m.ph = 2; m.t = 0; } return; }
  if (m.wave < m.waves && m.t >= m.wave * m.gap) {
    // wave: one circle exactly on the soul + two more 8-10 u off it (there is always a gap to step into)
    queueBomb(m.s.x, m.s.z, 3.6, m.warn, m.pct, true);
    const a0 = Math.random() * 6.283;
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * 3.1416 + (Math.random() - 0.5) * 0.9, d = 8.3 + Math.random() * 2;
      tmp.set(m.s.x + Math.sin(a) * d, 0, m.s.z + Math.cos(a) * d); clampArena(tmp, 3);
      queueBomb(tmp.x, tmp.z, 3.2, m.warn, m.pct, true);
    }
    m.wave++;
  }
  if (m.wave >= m.waves && m.t >= (m.waves - 1) * m.gap + m.warn + 0.5) m.ph = 0;
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
export function clearVoidFx(): void {
  for (const b of burns) b.z = null;
  for (const l of mfx.lasers) l.on = false;
  for (const r of mfx.runes) r.on = false;
  for (const m of mfx.meteors) { m.on = false; m.z0 = null; }
  for (const h of mfx.holes) { h.on = false; h.z0 = null; }
  mfx.grav.ph = 0; mfx.grav.boom = 0; mfx.major = false;
  mfx.eh.ph = 0; mfx.eh.boom = 0; mfx.mir.ph = 0;
  for (const b of mfx.bombs) b.on = false;
}

export function tickVoidFx(dt: number): void {
  const p = world.player;
  tickLasers(dt); tickGravity(dt); tickMeteors(dt); tickHoles(dt); tickEventHorizon(dt); tickMirror(dt); tickBombs(dt);
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
