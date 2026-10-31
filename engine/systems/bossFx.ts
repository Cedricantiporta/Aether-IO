// ============================================================================
// Shared hazard state for the wave 30-70 bosses (Elderroot, Mire Hydra, Glacius, Ignar, Void Herald).
// Everything here is preallocated: expanding rings (thorn ring, gravity blast), eruption props (roots, ice spikes,
// fire pillars, acid globs), Void portals, Void echoes, the frost-breath cone, the player chill meter and the
// arena modifiers (Void shrink, Glacius blizzard). The boss AIs (bosses2.ts) spawn into these pools; render/BossFx.tsx
// draws them. Telegraphs themselves are ordinary hostile zones (Zone.trick = BT.*) resolved by resolveBossZone().
// ============================================================================
import { world, pass2 } from '../world';
import { events } from '../events';
import { Vector3 } from 'three';
import type { Zone } from '../types';
import { applyPlayerDebuff, damagePlayer, addShake, freezePlayer, KB, SLOW_BOSS } from './combat';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import { fireEnemyProjectile, spawnTelegraphCircle, spawnTelegraphLine } from './enemies';
import { formColor } from './bossForms';
import { spawnHostileZone } from './tricks';
import { edgeLimit } from '../mapgen';
import { forEachHero, nearestHero, randomHero, isAlly, shoveHero } from '../heroes';

/** Zone.trick ids owned by the new bosses (>= 30 routes through tricks.resolveTrick -> resolveBossZone). */
export const BT = {
  VISUAL: 30, ROOT: 31, SPIT: 32, SWEEP: 33, BREATH: 34, SPIKES: 35, DIVE: 36, PILLAR: 37, SURFACE: 38,
  CORE: 39, ECHO_SLAM: 40, HAIL: 41, THORN: 42, SHELL: 43, LASH: 44, FBURST: 45,
  VCONE: 46, VLANE: 47, VCOLLAPSE: 48,   // Void Herald: cone (slam + rot), lane (rot), rift collapse (slam + rot + silence)
} as const;

// ------------------------------------------------------------------ pools --
export interface Wave { active: boolean; x: number; z: number; r: number; speed: number; maxR: number; thick: number; dmg: number; color: number; kind: number; hit: boolean; /** co-op: the partner's own once-per-ring flag */ hitA: boolean; }
export const WAVE_THORN = 0, WAVE_VOID = 1, WAVE_INWARD = 2, WAVE_FIRE = 3, WAVE_FROST = 4, WAVE_TIDE = 5;   // FROST: chills; TIDE: slows
export const waves: Wave[] = Array.from({ length: 12 }, () => ({ active: false, x: 0, z: 0, r: 0, speed: 0, maxR: 0, thick: 1, dmg: 0, color: 0xffffff, kind: 0, hit: false, hitA: false }));

/** kind: 0 root, 1 ice spike, 2 fire pillar, 3 acid glob (flies sx,sz -> x,z over `delay`), 4 thorn spike */
export interface Prop { active: boolean; kind: number; x: number; z: number; sx: number; sz: number; t: number; delay: number; life: number; r: number; h: number; rot: number; }
export const PROP_ROOT = 0, PROP_ICE = 1, PROP_PILLAR = 2, PROP_GLOB = 3, PROP_THORN = 4;
export const props: Prop[] = Array.from({ length: 160 }, () => ({ active: false, kind: 0, x: 0, z: 0, sx: 0, sz: 0, t: 0, delay: 0, life: 1, r: 1, h: 1, rot: 0 }));
let propCursor = 0;

export interface Portal { active: boolean; x: number; z: number; t: number; open: number; life: number; shots: number; shotT: number; dmg: number; }
export const portals: Portal[] = Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0, t: 0, open: 0.9, life: 4, shots: 0, shotT: 0, dmg: 0 }));

/** Void echoes: kind 0 Gorath slam, 1 dark volley, 2 Elderroot ring, 3 Glacius ice line, 4 Ignar pillars. */
export interface Echo { active: boolean; x: number; z: number; kind: number; t: number; fireAt: number; life: number; fired: boolean; dmg: number; }
export const echoes: Echo[] = Array.from({ length: 4 }, () => ({ active: false, x: 0, z: 0, kind: 0, t: 0, fireAt: 1.2, life: 2.2, fired: false, dmg: 0 }));

/** Glacius frost breath (single cone, ticks while active). */
export const breath = { active: false, x: 0, z: 0, dx: 0, dz: 1, range: 20, half: 0.42, t: 0, dur: 1.5, tick: 0, dmg: 0 };
/** Player chill meter: 4 stacks freeze. */
export const chill = { stacks: 0, t: 0, immuneT: 0 };
/** Arena modifiers. Void: circular arena that shrinks; Glacius: blizzard slow. */
export const arena = { safeR: 0, safe0: 0, voidT: 0, graceT: 0, hard: false, shrink: false, cx: 0, cz: 0, r: 60, minR: 22, rate: 0.9, edgeT: 0, blizzard: false, blizzardK: 0, hailT: 0 };

/** QA counters. */
export const bossStats: Record<string, number> = {};
export function stat(name: string): void { bossStats[name] = (bossStats[name] ?? 0) + 1; }

const tv = new Vector3();

/** Ignar's fire trails (owner): a FIREPATCH that is skipped once FIRE_CAP patches are alive, so the arena never fills up. */
export const FIRE_CAP = 96;   // (owner 2026-10-26: each crescent leaves a whole field of fire along its arc; zone pool 256)
/** How many more FIREPATCH zones fit under FIRE_CAP (one pass over the pool; call once per trail batch, not per patch). */
export function fireRoom(): number {
  let n = 0;
  const zs = world.zones;
  for (let i = 0; i < zs.length; i++) { const q = zs[i]; if (q.active && q.kind === 'FIREPATCH') n++; }
  return FIRE_CAP - n;
}
/** A fire patch without the cap check (the caller checked `fireRoom()`). */
export function firePatchRaw(x: number, z: number, r: number, life: number, dps: number): boolean {
  return spawnHostileZone('FIREPATCH', x, z, r, life, dps, 0xff5a1a) !== null;
}
export function firePatch(x: number, z: number, r: number, life: number, dps: number): boolean {
  return fireRoom() > 0 && firePatchRaw(x, z, r, life, dps);
}

// ------------------------------------------------------------- spawners ----
export function spawnWave(x: number, z: number, speed: number, maxR: number, thick: number, dmg: number, kind: number, color: number, startR = 0.5): void {
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    if (w.active) continue;
    w.active = true; w.x = x; w.z = z; w.r = startR; w.speed = speed; w.maxR = maxR; w.thick = thick; w.dmg = dmg; w.kind = kind; w.color = formColor(color);   // (a boss in its second form recolours its rings, bossForms.ts) w.hit = false; w.hitA = false;
    return;
  }
}
export function spawnProp(kind: number, x: number, z: number, delay: number, life: number, r: number, h: number, sx = 0, sz = 0): void {
  if (pass2.on) return;
  for (let k = 0; k < props.length; k++) {
    const i = (propCursor + k) % props.length;
    const p = props[i];
    if (p.active) continue;
    propCursor = i + 1;
    p.active = true; p.kind = kind; p.x = x; p.z = z; p.sx = sx; p.sz = sz; p.t = 0; p.delay = delay; p.life = life; p.r = r; p.h = h; p.rot = Math.random() * 6.283;
    return;
  }
}
export function spawnPortal(x: number, z: number, open: number, life: number, shots: number, dmg: number): void {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (p.active) continue;
    p.active = true; p.x = x; p.z = z; p.t = 0; p.open = open; p.life = life; p.shots = shots; p.shotT = 0; p.dmg = dmg;
    return;
  }
}
export function spawnEcho(x: number, z: number, kind: number, dmg: number): void {
  for (let i = 0; i < echoes.length; i++) {
    const e = echoes[i];
    if (e.active) continue;
    e.active = true; e.x = x; e.z = z; e.kind = kind; e.t = 0; e.fireAt = 1.2; e.life = 2.3; e.fired = false; e.dmg = dmg;
    // telegraph shown at spawn: the attack lands at fireAt
    const p = nearestHero(x, z).pos;   // (co-op: the nearer hero)
    switch (kind) {
      case 0: { const zn = spawnTelegraphCircle(p.x, p.z, 5.2, 1.2, 0, 0x9ca3af); if (zn) { zn.trick = BT.ECHO_SLAM; zn.damage = dmg * 1.3; } break; }
      case 1: { const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1; const zn = spawnTelegraphLine(x, z, dx / l, dz / l, 30, 2.2, 1.2, 0xc084fc); if (zn) zn.trick = BT.VISUAL; break; }
      case 2: { const zn = spawnTelegraphCircle(x, z, 7, 1.2, 0, 0x84cc16); if (zn) zn.trick = BT.VISUAL; break; }
      case 3: { const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1; const zn = spawnTelegraphLine(x, z, dx / l, dz / l, 32, 3.2, 1.2, 0x7dd3fc); if (zn) { zn.trick = BT.SPIKES; zn.damage = dmg; } break; }
      default:
        for (let k = 0; k < 3; k++) {
          const a = k * 2.094 + Math.random();
          tv.set(p.x + (k === 0 ? 0 : Math.sin(a) * 4.5), 0, p.z + (k === 0 ? 0 : Math.cos(a) * 4.5));
          const zn = spawnTelegraphCircle(tv.x, tv.z, 2.4, 1.2, 0, 0xff5a1a); if (zn) { zn.trick = BT.PILLAR; zn.damage = dmg; }
        }
    }
    return;
  }
}

// ---------------------------------------------------------- chill / debuff --
export function addChill(n: number): void {
  const p = world.player;
  if (!p.alive || chill.immuneT > 0) return;
  chill.stacks += n; chill.t = 0;
  applyPlayerDebuff('SLOW', 1.2 * 1.5, SLOW_BOSS);
  events.emit('floatText', { pos: p.pos, text: chill.stacks >= 4 ? 'FROZEN' : `CHILL x${chill.stacks}`, color: 0x8fe4ff, scale: 0.8, dy: 0.8 });
  events.emit('trick', { pos: p.pos.clone(), kind: 'CHILL', radius: 2 });
  if (chill.stacks >= 4) {
    chill.stacks = 0; chill.immuneT = 4;
    freezePlayer(1.2);
    events.emit('trick', { pos: p.pos.clone(), kind: 'FREEZE', radius: 3 });
    stat('Freeze');
  }
}

/** QA counters for the strong slow / freeze rolls (Glacius) and the burns (Ignar / Colossus). */
export const ccStats = { slow: 0, freeze: 0, burn: 0, rot: 0, silence: 0, down: 0 };
/**
 * Glacius' frost hit (owner 2026-10-31): the strong boss slow (SLOW_BOSS 60%, `slowDur` s, resFrost shortens it) plus a `chance` of a short
 * FREEZE (1.2 s, resFrost / resCC shorten it). Anti-chain: no freeze while the 4 s freeze grace (chill.immuneT) runs or the hero is already
 * stunned / frozen / down; a freeze that lands starts the grace.
 */
export function frostHit(slowDur: number, chance: number, freezeDur = 1.2): void {
  const p = world.player;
  if (!p.alive) return;
  if (applyPlayerDebuff('SLOW', slowDur, SLOW_BOSS)) ccStats.slow++;
  if (chill.immuneT > 0 || p.stunT > 0 || p.downT > 0 || Math.random() >= chance) return;
  if (freezePlayer(freezeDur)) {
    chill.immuneT = 4; chill.stacks = 0; ccStats.freeze++; stat('Freeze');
    events.emit('floatText', { pos: p.pos, text: 'FROZEN', color: 0x8fe4ff, scale: 0.9, dy: 0.9 });
    events.emit('trick', { pos: p.pos.clone(), kind: 'FREEZE', radius: 3 });
  }
}
/** Ignar / Colossus burn (owner 2026-10-31): 3.6 s, refreshes while standing in / being hit by fire (the strongest dps wins). */
export const BURN_DUR = 3.6;
export function burnHit(dps: number): void { if (applyPlayerDebuff('BURN', BURN_DUR, Math.max(2, dps))) ccStats.burn++; }

/**
 * VOID ROT (Void Herald, owner 2026-10-31): the Herald's counterpart of Ignar's burn. Every rot hit adds a stack (max ROT_MAX, they fall off after ROT_KEEP s
 * without a new hit); the ticking poison dps is `dmg * ROT_DPS * stacks` for 4.5 s (resPoison shortens it) and the hero is slowed 25% per stack-pair.
 * `dmg` = the flat hit that carried it (post BOSS_SKILL_MUL), so it scales with the same bossDmgScale as the hit itself.
 */
export const rot = { stacks: 0, t: 0, ref: 40 };   // ref = the Herald's reference hit (raw pwr), refreshed each frame by bosses2.herald
export const ROT_MAX = 4, ROT_KEEP = 7, ROT_DPS = 0.0065;   // poison ticks skip defence and are x4 (HERO_DOT_MUL): one stack of a 10% hit costs ~4% max hp over 4.5 s
export function voidRotHit(dmg: number, n = 1): void {
  const p = world.player;
  if (!p.alive || p.invulnT > 0) return;
  rot.stacks = Math.min(ROT_MAX, (rot.t > 0 ? rot.stacks : 0) + n); rot.t = ROT_KEEP;
  if (applyPlayerDebuff('POISON', 4.5, Math.max(2, (dmg > 0 ? dmg : rot.ref) * ROT_DPS * rot.stacks))) ccStats.rot++;
  if (rot.stacks >= 2) applyPlayerDebuff('SLOW', 1.4, 0.18 * (rot.stacks >> 1));
  events.emit('floatText', { pos: p.pos, text: `VOID ROT x${rot.stacks}`, color: 0xc084fc, scale: 0.8, dy: 1.1 });
}
// ------------------------------------------------------------------ continuous ramp zones (owner 2026-10-31) --
/**
 * CONTINUOUS damage zones (Void Herald: collapsing Void Pool, rotating Void Beam). After a `warn` s telegraph (a ground ring / thin beam that fills),
 * the zone is live for `life` s and ticks every RAMP_TICK s on every hero inside: a share of MAX HP (`pct`, ticking `dot` so dash i-frames do not
 * hide the tick) x a multiplier that grows 1 -> RAMP_MUL over RAMP_RISE s of STAYING inside (leaving decays it twice as fast), plus Void Rot every second.
 * A full stay costs roughly 60-100% of max HP (the pct path never kills a hero above 25%); leaving early costs little. The visible hazard is a pinned
 * telegraph zone (host-synced like every telegraph): a circle that shrinks over its last second, or a thin solid rotating beam.
 */
export interface Ramp { on: boolean; beam: boolean; x: number; z: number; r: number; ang: number; w: number; len: number; t: number; warn: number; life: number; pct: number; color: number; tick: number; stay: number[]; rotT: number[]; zone: Zone | null }
export const RAMP_TICK = 0.35, RAMP_MUL = 3, RAMP_RISE = 3;
export const ramps: Ramp[] = Array.from({ length: 6 }, () => ({ on: false, beam: false, x: 0, z: 0, r: 5, ang: 0, w: 0, len: 40, t: 0, warn: 0.9, life: 5, pct: 0.02, color: 0xa855f7, tick: 0, stay: [0, 0], rotT: [0, 0], zone: null }));
export const rampStats = { ticks: 0, maxMul: 0 };
export function spawnRamp(beam: boolean, x: number, z: number, r: number, warn: number, life: number, pct: number, color: number, ang = 0, w = 0, len = 40): void {
  for (let i = 0; i < ramps.length; i++) {
    const q = ramps[i];
    if (q.on) continue;
    q.on = true; q.beam = beam; q.x = x; q.z = z; q.r = r; q.ang = ang; q.w = w; q.len = len; q.t = 0; q.warn = warn; q.life = life; q.pct = pct; q.color = color; q.tick = 0;
    q.stay[0] = q.stay[1] = 0; q.rotT[0] = q.rotT[1] = 0;
    const zn = beam ? spawnTelegraphLine(x, z, Math.sin(ang), Math.cos(ang), len, r, 1, color) : spawnTelegraphCircle(x, z, r, 1, 0, color);
    if (zn) { zn.trick = BT.VISUAL; zn.damage = 0; zn.maxLife = 10; zn.life = 9.7; }   // (maxLife 10: the fill is 1 - life / maxLife and life is re-pinned every frame, always > dt so the zone never expires by itself)
    q.zone = zn;
    return;
  }
}
function tickRamps(dt: number): void {
  for (let i = 0; i < ramps.length; i++) {
    const q = ramps[i];
    if (!q.on) continue;
    q.t += dt;
    const zn = q.zone, live = q.t >= q.warn;
    if (!zn || !zn.active || q.t >= q.warn + q.life) { if (zn && zn.active) zn.active = false; q.on = false; q.zone = null; continue; }
    if (q.beam && live) q.ang += q.w * dt;
    if (q.beam) { zn.dir.set(Math.sin(q.ang), 0, Math.cos(q.ang)); }
    // look: fills during the warning, solid + pulsing while live, the circle shrinks over its last second (the visible timer)
    zn.maxLife = 10;
    zn.life = live ? 0.5 + 0.2 * Math.sin(q.t * 9) : Math.max(0.6, 10 * (1 - 0.95 * (q.t / q.warn)));
    if (!q.beam) { const left = q.warn + q.life - q.t; zn.radius = q.r * (left < 1 ? 0.55 + 0.45 * left : 1); }
    if (!live) continue;
    q.tick -= dt;
    const doTick = q.tick <= 0;
    if (doTick) q.tick = RAMP_TICK;
    const lr = q.beam ? zn.radius * 0.5 + 0.7 : (zn.radius + 0.4), blen = q.beam ? zn.length : 0;   // (the telegraph's own scaled size = what the player sees)
    const dxd = Math.sin(q.ang), dzd = Math.cos(q.ang);
    forEachHero((h) => {
      const k = isAlly(h) ? 1 : 0;
      let inside = false;
      if (h.alive) {
        const rx = h.pos.x - q.x, rz = h.pos.z - q.z;
        if (q.beam) { const along = rx * dxd + rz * dzd, perp = Math.abs(rx * dzd - rz * dxd); inside = along > -1.5 && along < blen && perp < lr && h.air < 0.5; }
        else inside = rx * rx + rz * rz < lr * lr;
      }
      if (inside) q.stay[k] = Math.min(RAMP_RISE, q.stay[k] + dt); else q.stay[k] = Math.max(0, q.stay[k] - dt * 2);
      if (!inside || !doTick) return;
      const mul = 1 + (RAMP_MUL - 1) * (q.stay[k] / RAMP_RISE);
      rampStats.ticks++; if (mul > rampStats.maxMul) rampStats.maxMul = mul;
      damagePlayer(1, { pct: q.pct * mul, pos: tv.set(q.x, 0, q.z), kind: 'MAGIC', dot: true, noDotMul: true });
      q.rotT[k] += RAMP_TICK;
      if (q.rotT[k] >= 1) { q.rotT[k] = 0; voidRotHit(rot.ref * 0.6); }
      if (q.beam) applyPlayerDebuff('SLOW', 0.5, 0.3);
    });
  }
}

/** A heavy Herald slam: knockdown (the normal anti-chain rules apply) + rot. */
function voidSlam(z: Zone, dmg: number, kind: 'slam' | 'hit'): void {
  damagePlayer(dmg, { pos: z.pos, kind: 'MAGIC', ...(kind === 'slam' ? KB.SLAM : KB.PUSH) });
  if (kind === 'slam') ccStats.down++;
  voidRotHit(dmg);
}

export function inCone(px: number, pz: number, ox: number, oz: number, dx: number, dz: number, range: number, half: number): boolean {
  const rx = px - ox, rz = pz - oz, d = Math.hypot(rx, rz);
  if (d > range + 0.6) return false;
  if (d < 1) return true;
  return (rx * dx + rz * dz) / d > Math.cos(half + 0.12);
}

// ------------------------------------------------------- zone resolution ----
/** Called from tricks.resolveTrick for Zone.trick >= 30. Applies the effect of an expired boss telegraph. */
export function resolveBossZone(z: Zone): void {
  const p = world.player;
  const rx = p.pos.x - z.pos.x, rz = p.pos.z - z.pos.z;
  const inside = p.alive && rx * rx + rz * rz < (z.radius + 0.6) * (z.radius + 0.6);
  const pw = z.damage * BOSS_SKILL_MUL;
  switch (z.trick) {
    case BT.ROOT:
      if (z.kind === 'TELEGRAPH_LINE') {
        // root eruption lane: roots burst up along the whole line, in sequence away from the caster
        const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
        if (p.alive && p.air < 0.5 && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) {
          damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL' });
          if (applyPlayerDebuff('ROOT', 1.1)) stat('Rooted');
        }
        for (let d = 2, i = 0; d < z.length; d += 2.6, i++) spawnProp(PROP_ROOT, z.pos.x + z.dir.x * d, z.pos.z + z.dir.z * d, i * 0.045, 1.2, 0.9 + (i % 3) * 0.15, 2.4 + (i % 2) * 0.9);
        events.emit('trick', { pos: z.pos.clone(), kind: 'ROOTS', radius: z.radius });
        break;
      }
      if (inside && p.air < 0.5) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL' }); if (applyPlayerDebuff('ROOT', 1.0)) stat('Rooted'); }
      spawnProp(PROP_ROOT, z.pos.x, z.pos.z, 0, 1.1, Math.max(1, z.radius * 0.5), 3);
      events.emit('trick', { pos: z.pos.clone(), kind: 'ROOTS', radius: z.radius });
      break;
    case BT.SPIT:
      if (inside) damagePlayer(pw, { pos: z.pos, kind: 'POISON' });
      spawnHostileZone('ACID', z.pos.x, z.pos.z, z.radius * 1.05, 7, pw * 0.22, 0x9be32a);
      events.emit('trick', { pos: z.pos.clone(), kind: 'ACID', radius: z.radius });
      break;
    case BT.SWEEP:
    case BT.BREATH: {
      const hit = inCone(p.pos.x, p.pos.z, z.pos.x, z.pos.z, z.dir.x, z.dir.z, z.radius, z.aux);
      if (z.trick === BT.SWEEP) {
        if (hit && p.alive) {
          damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM });   // (owner) the tail sweep knocks down
          applyPlayerDebuff('STUN', 0.5);
        }
        events.emit('trick', { pos: z.pos.clone(), kind: 'TAIL_SWEEP', radius: z.radius });
        events.emit('shake', { amount: 0.4 });
      } else {
        // the breath starts now (ticks run in updateBossFx)
        breath.active = true; breath.x = z.pos.x; breath.z = z.pos.z; breath.dx = z.dir.x; breath.dz = z.dir.z;
        breath.range = z.radius; breath.half = z.aux; breath.t = 0; breath.tick = 0; breath.dmg = pw;
        if (hit && p.alive) { damagePlayer(pw * 0.8, { pos: z.pos, kind: 'ICE' }); addChill(2); frostHit(3.5, 0.22); }
        events.emit('trick', { pos: z.pos.clone(), kind: 'BREATH', radius: z.radius });
      }
      break;
    }
    case BT.SPIKES: {
      // damage now; spikes erupt in sequence for the visual
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && p.air < 0.5 && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) { damagePlayer(pw, { pos: z.pos, kind: 'ICE', ...KB.SLAM }); addChill(2); frostHit(4.5, 0.25); }   // (owner) ice spikes launch the hero: knockdown, strong slow, 25% freeze
      // (owner 2026-10-31) icicles ~2x bigger: a tall central row every 4.8 m with a flanking pair on every third row (the lane is 6.4 m wide)
      const wide = Math.min(1, z.radius / 6.4), sx = z.dir.z, sz = -z.dir.x;
      for (let d = 2.2, i = 0; d < z.length; d += 4.8, i++) {
        const bx = z.pos.x + z.dir.x * d, bz = z.pos.z + z.dir.z * d, rr = 2.0 + (i % 3) * 0.4, hh = 7 + (i % 2) * 2.6;
        spawnProp(PROP_ICE, bx, bz, i * 0.06, 1.4, rr, hh);
        if (i % 3 === 1) for (let s = -1; s <= 1; s += 2) spawnProp(PROP_ICE, bx + sx * s * 2.1 * wide, bz + sz * s * 2.1 * wide, i * 0.06 + 0.05, 1.3, rr * 0.8, hh * 0.8);
      }
      events.emit('trick', { pos: z.pos.clone(), kind: 'ICE_SPIKES', radius: z.radius });
      break;
    }
    case BT.DIVE:
      events.emit('trick', { pos: z.pos.clone(), kind: 'DIVE_CRASH', radius: z.radius });
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.8, color: 0xbfe8ff });
      events.emit('crater', { pos: z.pos.clone(), radius: z.radius * 0.7, color: 0x16303f });
      addShake(0.7);
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.5); addChill(2); frostHit(4.5, 0.25); }
      diveLanded(z.pos.x, z.pos.z);
      break;
    case BT.PILLAR:
      if (inside && p.air < 0.5) { damagePlayer(pw, { pos: z.pos, kind: 'FIRE', ...KB.PUSH }); burnHit(pw * 0.14); }
      spawnProp(PROP_PILLAR, z.pos.x, z.pos.z, 0, 0.9, z.radius, 6.5);   // (owner rework: 20+ pillars at once, so a bit lower to keep the screen readable)
      firePatch(z.pos.x, z.pos.z, z.radius * 0.7, 2.4, pw * 0.12);
      events.emit('trick', { pos: z.pos.clone(), kind: 'PILLAR', radius: z.radius });
      break;
    case BT.FBURST:   // Ignar's Radiant Burst / Blazing Guard: a fiery knock-back burst around him that leaves a ring of embers
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'FIRE', ...KB.SLAM }); burnHit(pw * 0.14); }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.5, color: 0xff7a2a });
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius * 0.8, color: 0xff6a1a });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283 + z.pos.x; firePatch(z.pos.x + Math.sin(a) * z.radius * 0.75, z.pos.z + Math.cos(a) * z.radius * 0.75, 1.5, 2.2, pw * 0.1); }
      addShake(0.4);
      break;
    case BT.SHELL:   // the Dune Colossus' mortar shell: a sand blast and a crater, no fire left behind
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.PUSH }); applyPlayerDebuff('SLOW', 1.5 * 1.5, SLOW_BOSS); }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.4, color: 0xd9b36a });
      events.emit('crater', { pos: z.pos.clone(), radius: z.radius * 0.6, color: 0x5a4220 });
      addShake(0.15);
      break;
    case BT.SURFACE:
      if (inside) { damagePlayer(pw * 1.2, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.6); }
      events.emit('trick', { pos: z.pos.clone(), kind: 'SURFACE', radius: z.radius });
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.5, color: 0x6b8f5a });
      break;
    case BT.CORE:
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'MAGIC', ...KB.HEAVY }); applyPlayerDebuff('STUN', 0.7); }
      break;
    case BT.ECHO_SLAM:
      if (inside) damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM });
      events.emit('trick', { pos: z.pos.clone(), kind: 'ECHO_SLAM', radius: z.radius });
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.5, color: 0xa8a29e });
      addShake(0.3);
      break;
    case BT.HAIL:
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'ICE' }); addChill(2); frostHit(3, 0.2); }
      spawnProp(PROP_ICE, z.pos.x, z.pos.z, 0, 0.9, 0.9, 2.6);
      events.emit('trick', { pos: z.pos.clone(), kind: 'HAIL', radius: z.radius });
      break;
    case BT.LASH: {   // Elderroot's branch: a thick lash along a lane (shoves a little, slows)
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && p.air < 0.5 && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('SLOW', 1.2 * 1.5, SLOW_BOSS); }   // (owner) Elderroot's branch sweep knocks down
      for (let d = 2, i = 0; d < z.length; d += 3, i++) spawnProp(PROP_ROOT, z.pos.x + z.dir.x * d, z.pos.z + z.dir.z * d, i * 0.03, 0.7, 0.9 + (i % 3) * 0.12, 2.0);
      events.emit('shake', { amount: 0.12 });
      break;
    }
    case BT.THORN:
      if (inside) damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL' });
      spawnProp(PROP_THORN, z.pos.x, z.pos.z, 0, 0.7, z.radius * 0.5, 2.4);
      events.emit('trick', { pos: z.pos.clone(), kind: 'THORN_POP', radius: z.radius });
      break;
    case BT.VCONE:   // Void Nova cone: a heavy slam inside the cone
      if (inCone(p.pos.x, p.pos.z, z.pos.x, z.pos.z, z.dir.x, z.dir.z, z.radius, z.aux) && p.alive) voidSlam(z, pw, 'slam');
      events.emit('trick', { pos: z.pos.clone(), kind: 'ECHO_SLAM', radius: 6 });
      events.emit('shake', { amount: 0.3 });
      break;
    case BT.VLANE: {   // mirrored void lanes / rift lances: a lane hit + rot
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && p.air < 0.5 && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) voidSlam(z, pw, z.aux > 0.5 ? 'slam' : 'hit');
      for (let d = 3; d < z.length; d += 5) events.emit('explosion', { pos: tv.set(z.pos.x + z.dir.x * d, 0.5, z.pos.z + z.dir.z * d).clone(), radius: 1.6, color: formColor(0xa855f7) });
      events.emit('shake', { amount: 0.15 });
      break;
    }
    case BT.VCOLLAPSE:   // Rift Collapse: the void implodes on the marked ring: slam + rot, and the signature SILENCE when it is the big (aux > 0.5) final one
      if (inside) {
        damagePlayer(pw, { pos: z.pos, kind: 'MAGIC', ...KB.SLAM }); ccStats.down++;   // (knockHero BEFORE any stun: a stun would block the knockdown)
        voidRotHit(pw);
        if (z.aux > 0.5 && applyPlayerDebuff('SILENCE', 2.2)) ccStats.silence++;
      }
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.4, color: formColor(0xa855f7) });
      events.emit('explosion', { pos: z.pos.clone(), radius: z.radius * 0.8, color: formColor(0x7c3aed) });
      events.emit('shake', { amount: 0.35 });
      break;
    default: break; // VISUAL
  }
}

/** Set by BT.DIVE resolution; read by the Glacius AI (position + grounded state live there). */
export const dive = { landed: false, x: 0, z: 0 };
function diveLanded(x: number, z: number): void { dive.landed = true; dive.x = x; dive.z = z; }

// ----------------------------------------------------------- per-frame ------
const orbDir = new Vector3();

export function updateBossFx(dt: number): void {
  const p = world.player;
  const pa = p.pos;

  // ---- expanding rings (dash / leap through to avoid)
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    if (!w.active) continue;
    w.r += w.speed * dt;
    if (w.speed > 0 ? w.r >= w.maxR : w.r <= w.maxR) { w.active = false; continue; }
    if (w.dmg <= 0 || (w.hit && w.hitA)) continue;
    forEachHero((h) => {   // (co-op: the ring hits each hero once)
      const ally = isAlly(h);
      if ((ally ? w.hitA : w.hit) || !h.alive) return;
      const d = Math.hypot(h.pos.x - w.x, h.pos.z - w.z);
      if (Math.abs(d - w.r) < w.thick * 0.5 + 0.55 && h.air < 0.5) {
        if (ally) w.hitA = true; else w.hit = true;
        damagePlayer(w.dmg * BOSS_SKILL_MUL, { pos: tv.set(w.x, 0, w.z), kind: w.kind === WAVE_VOID ? 'MAGIC' : w.kind === WAVE_FIRE ? 'FIRE' : w.kind === WAVE_FROST ? 'ICE' : 'PHYSICAL', ...(w.kind === WAVE_VOID || w.kind === WAVE_TIDE ? KB.SLAM : KB.PUSH) });   // (owner) the gravity push and the tidal surge knock down
        if (w.kind === WAVE_VOID) { applyPlayerDebuff('SLOW', 1.0 * 1.5, SLOW_BOSS); voidRotHit(w.dmg * BOSS_SKILL_MUL); ccStats.down++; }
        if (w.kind === WAVE_THORN) applyPlayerDebuff('BLEED', 3, w.dmg * 0.12);
        if (w.kind === WAVE_FROST) { addChill(1); frostHit(3, 0.22); }
        if (w.kind === WAVE_TIDE) applyPlayerDebuff('SLOW', 1.6 * 1.5, SLOW_BOSS);
      }
    });
  }

  tickRamps(dt);

  // ---- eruption props are visual only
  for (let i = 0; i < props.length; i++) {
    const q = props[i];
    if (!q.active) continue;
    q.t += dt;
    if (q.t >= q.delay + q.life) q.active = false;
  }

  // ---- portals fire aimed volleys at the player
  for (let i = 0; i < portals.length; i++) {
    const q = portals[i];
    if (!q.active) continue;
    q.t += dt;
    if (q.t >= q.life) { q.active = false; continue; }
    if (q.t < q.open || q.shots <= 0) continue;
    const tgt = nearestHero(q.x, q.z);   // (co-op: the nearer hero)
    if (!tgt.alive) continue;
    q.shotT -= dt;
    if (q.shotT <= 0) {
      q.shotT = 0.6; q.shots--;
      const dx = tgt.pos.x - q.x, dz = tgt.pos.z - q.z, base = Math.atan2(dx, dz);
      for (let k = -1; k <= 1; k++) {
        orbDir.set(Math.sin(base + k * 0.2), 0, Math.cos(base + k * 0.2));
        tv.set(q.x, 1.4, q.z);
        fireEnemyProjectile(tv, orbDir, 'BOSS_ORB', 13, q.dmg, { life: 3.2, radius: 0.7, debuff: 7, dark: true });
      }
      events.emit('trick', { pos: tv.set(q.x, 0, q.z).clone(), kind: 'PORTAL_SHOT', radius: 1.5 });
      stat('PortalVolley');
    }
  }

  // ---- echoes (shadow copies of earlier bosses' signature attacks)
  for (let i = 0; i < echoes.length; i++) {
    const q = echoes[i];
    if (!q.active) continue;
    q.t += dt;
    if (!q.fired && q.t >= q.fireAt) {
      q.fired = true;
      switch (q.kind) {
        case 1: {
          const eh = nearestHero(q.x, q.z).pos, dx = eh.x - q.x, dz = eh.z - q.z, base = Math.atan2(dx, dz);
          for (let k = -3; k <= 3; k++) { orbDir.set(Math.sin(base + k * 0.2), 0, Math.cos(base + k * 0.2)); tv.set(q.x, 1.4, q.z); fireEnemyProjectile(tv, orbDir, 'BOSS_ORB', 13, q.dmg * 0.8, { life: 3.2, radius: 0.7, debuff: 7, dark: true }); }
          break;
        }
        case 2: spawnWave(q.x, q.z, 12, 20, 1.5, q.dmg, WAVE_THORN, 0x84cc16); break;
        default: break; // 0, 3, 4 resolve through their telegraph zones
      }
      events.emit('trick', { pos: tv.set(q.x, 0, q.z).clone(), kind: 'ECHO_FIRE', radius: 3 });
    }
    if (q.t >= q.life) q.active = false;
  }

  // ---- frost breath cone
  if (breath.active) {
    breath.t += dt;
    breath.tick -= dt;
    if (breath.tick <= 0) {
      breath.tick = 0.45;
      forEachHero((h) => {   // (co-op: the breath chills either hero standing in the cone)
        if (h.alive && inCone(h.pos.x, h.pos.z, breath.x, breath.z, breath.dx, breath.dz, breath.range, breath.half)) {
          damagePlayer(breath.dmg * 0.3 * BOSS_SKILL_MUL, { pos: tv.set(breath.x, 0, breath.z), kind: 'ICE', dot: false });
          addChill(1); frostHit(2.5, 0.08);
        }
      });
    }
    if (breath.t >= breath.dur) breath.active = false;
  }
  if (rot.t > 0) { rot.t -= dt; if (rot.t <= 0) rot.stacks = 0; }
  if (chill.immuneT > 0) chill.immuneT -= dt;
  if (chill.stacks > 0) { chill.t += dt; if (chill.t > 3) { chill.t = 0; chill.stacks--; } }

  // ---- Void arena: `hard` = the Herald's void stage, a fixed ring the heroes cannot leave (an invisible wall at the dark swirling edge)
  if (arena.shrink && arena.hard) {
    const lim = arena.r - 0.6;
    forEachHero((h) => {
      const dx = h.pos.x - arena.cx, dz = h.pos.z - arena.cz, d2 = dx * dx + dz * dz;
      if (d2 <= lim * lim) return;
      const d = Math.sqrt(d2), back = d - lim;
      if (isAlly(h)) shoveHero(h, -dx / d * back, -dz / d * back); else { h.pos.x -= dx / d * back; h.pos.z -= dz / d * back; }
      arenaStat.pushes++;
      if (!isAlly(h) && world.time - lastVoidText > 1.5) { lastVoidText = world.time; events.emit('floatText', { pos: h.pos, text: 'THE VOID', color: 0xc084fc, scale: 0.9, dy: 0.9 }); }
    });
  }
  // ---- the Herald's void rim (owner 2026-10-31): beyond `safeR` the void burns: VOID_PCT of max hp per tick (~10% / s) + Void Rot; the hard wall further out stays
  if (arena.shrink && arena.hard && arena.safeR > 0) {
    if (arena.graceT > 0) arena.graceT -= dt;
    arena.voidT -= dt;
    const tickNow = arena.voidT <= 0;
    if (tickNow) arena.voidT = VOID_TICK;
    forEachHero((h) => {
      if (!h.alive || arena.graceT > 0) return;
      const d2 = (h.pos.x - arena.cx) ** 2 + (h.pos.z - arena.cz) ** 2;
      if (d2 <= arena.safeR * arena.safeR || !tickNow) return;
      voidRimStat.ticks++;
      damagePlayer(1, { pct: VOID_PCT, pos: tv.set(arena.cx, 0, arena.cz), kind: 'MAGIC', dot: true, noDotMul: true });
      if ((voidRimStat.ticks & 3) === 0) voidRotHit(rot.ref * 0.6);
      if (!isAlly(h) && world.time - lastVoidText > 1.2) { lastVoidText = world.time; events.emit('floatText', { pos: h.pos, text: 'THE VOID BURNS', color: 0xc084fc, scale: 0.9, dy: 0.9 }); }
    });
  }
  // ---- Void shrinking arena
  if (arena.shrink) {
    if (arena.r > arena.minR) arena.r = Math.max(arena.minR, arena.r - arena.rate * dt);
    arena.edgeT -= dt;
    if (arena.edgeT <= 0) {
      arena.edgeT = 0.4;
      forEachHero((h) => {   // (co-op: the closing void burns both heroes outside the ring)
        if (!h.alive) return;
        const d = Math.hypot(h.pos.x - arena.cx, h.pos.z - arena.cz);
        if (d > arena.r) {
          damagePlayer(Math.max(6, world.boss.maxHp * 0.0022), { pos: tv.set(arena.cx, 0, arena.cz), kind: 'MAGIC', dot: true, noDotMul: true });
          applyPlayerDebuff('SLOW', 0.6 * 1.5, SLOW_BOSS);
          if (!isAlly(h) && world.time - lastVoidText > 1.5) { lastVoidText = world.time; events.emit('floatText', { pos: h.pos, text: 'THE VOID', color: 0xc084fc, scale: 0.9, dy: 0.9 }); }
        }
      });
    }
  }

  // ---- Glacius blizzard: slows the arena, hail drops near the player
  if (arena.blizzard) {
    arena.blizzardK = Math.min(1, arena.blizzardK + dt * 0.5);
    arena.hailT -= dt;
    const hh = arena.hailT <= 0 ? randomHero() : p;   // (co-op: the hail falls near either hero)
    if (arena.hailT <= 0 && hh.alive) {
      arena.hailT = 2.4;
      const a = Math.random() * 6.283, r = 1.5 + Math.random() * 6;
      const hz = spawnTelegraphCircle(hh.pos.x + Math.sin(a) * r, hh.pos.z + Math.cos(a) * r, 2.1, 1.0, 0, 0x93d8ff);
      if (hz) { hz.trick = BT.HAIL; hz.damage = Math.max(world.boss.maxHp * 0.004, 10); }
    }
  } else arena.blizzardK = Math.max(0, arena.blizzardK - dt);
}
let lastVoidText = -9;
/** The Herald's void rim: 2.5% max hp per 0.25 s = 10% per second outside the safe radius. */
export const VOID_TICK = 0.25, VOID_PCT = 0.025;
export const voidRimStat = { ticks: 0 };
/** QA: how many times the void wall pushed a hero back. */
export const arenaStat = { pushes: 0 };

/** Multiplier applied to player move speed (read by zones.updateZones -> envSlow). */
export function arenaSlow(): number { return arena.blizzard ? 0.6 : 1; }   // Glacius's blizzard: -40% move speed everywhere

/** Keeps `v` inside the Void arena (bosses use it). */
export function clampToVoid(v: Vector3, margin: number): void {
  if (!arena.shrink) return;
  const dx = v.x - arena.cx, dz = v.z - arena.cz, d = Math.hypot(dx, dz), lim = Math.max(4, (arena.hard && arena.safeR > 0 ? arena.safeR : arena.r) - margin);   // (the Herald's void rim: nothing spawns in the damaging void)
  if (d > lim) { v.x = arena.cx + (dx / d) * lim; v.z = arena.cz + (dz / d) * lim; }
}
export function mapLimit(x: number, z: number, margin: number): number { return edgeLimit(x, z, margin); }

/** Boss died / wave ended: clear every hazard but keep the QA counters. */
export function endBossFx(): void {
  for (const w of waves) w.active = false;
  for (const q of props) q.active = false;
  for (const q of portals) q.active = false;
  for (const q of echoes) q.active = false;
  rot.stacks = 0; rot.t = 0;
  for (const q of ramps) { q.on = false; q.zone = null; }
  breath.active = false; chill.stacks = 0; chill.t = 0; chill.immuneT = 0;
  arena.shrink = false; arena.hard = false; arena.safeR = 0; arena.safe0 = 0; arena.blizzard = false; arena.blizzardK = 0; arena.hailT = 1.5; arena.r = 60; arena.edgeT = 0;
  dive.landed = false;
  // pending boss telegraphs must not fire after their caster is gone
  const zs = world.zones;
  for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.active && z.hostile && z.trick >= BT.VISUAL) z.active = false; }
}

export function resetBossFx(): void {
  endBossFx();
  for (const k in bossStats) delete bossStats[k];
}
