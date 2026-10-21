// ============================================================================
// Shared hazard state for the wave 30-70 bosses (Elderroot, Mire Hydra, Glacius, Ignar, Void Herald).
// Everything here is preallocated: expanding rings (thorn ring, gravity blast), eruption props (roots, ice spikes,
// fire pillars, acid globs), Void portals, Void echoes, the frost-breath cone, the player chill meter and the
// arena modifiers (Void shrink, Glacius blizzard). The boss AIs (bosses2.ts) spawn into these pools; render/BossFx.tsx
// draws them. Telegraphs themselves are ordinary hostile zones (Zone.trick = BT.*) resolved by resolveBossZone().
// ============================================================================
import { world } from '../world';
import { events } from '../events';
import { Vector3 } from 'three';
import type { Zone } from '../types';
import { applyPlayerDebuff, damagePlayer, addShake, freezePlayer, KB } from './combat';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import { fireEnemyProjectile, spawnTelegraphCircle, spawnTelegraphLine } from './enemies';
import { spawnHostileZone } from './tricks';
import { edgeLimit } from '../mapgen';

/** Zone.trick ids owned by the new bosses (>= 30 routes through tricks.resolveTrick -> resolveBossZone). */
export const BT = {
  VISUAL: 30, ROOT: 31, SPIT: 32, SWEEP: 33, BREATH: 34, SPIKES: 35, DIVE: 36, PILLAR: 37, SURFACE: 38,
  CORE: 39, ECHO_SLAM: 40, HAIL: 41, THORN: 42, SHELL: 43,
} as const;

// ------------------------------------------------------------------ pools --
export interface Wave { active: boolean; x: number; z: number; r: number; speed: number; maxR: number; thick: number; dmg: number; color: number; kind: number; hit: boolean; }
export const WAVE_THORN = 0, WAVE_VOID = 1, WAVE_INWARD = 2, WAVE_FIRE = 3;
export const waves: Wave[] = Array.from({ length: 12 }, () => ({ active: false, x: 0, z: 0, r: 0, speed: 0, maxR: 0, thick: 1, dmg: 0, color: 0xffffff, kind: 0, hit: false }));

/** kind: 0 root, 1 ice spike, 2 fire pillar, 3 acid glob (flies sx,sz -> x,z over `delay`), 4 thorn spike */
export interface Prop { active: boolean; kind: number; x: number; z: number; sx: number; sz: number; t: number; delay: number; life: number; r: number; h: number; rot: number; }
export const PROP_ROOT = 0, PROP_ICE = 1, PROP_PILLAR = 2, PROP_GLOB = 3, PROP_THORN = 4;
export const props: Prop[] = Array.from({ length: 110 }, () => ({ active: false, kind: 0, x: 0, z: 0, sx: 0, sz: 0, t: 0, delay: 0, life: 1, r: 1, h: 1, rot: 0 }));
let propCursor = 0;

export interface Portal { active: boolean; x: number; z: number; t: number; open: number; life: number; shots: number; shotT: number; dmg: number; }
export const portals: Portal[] = Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0, t: 0, open: 0.9, life: 4, shots: 0, shotT: 0, dmg: 0 }));

/** Void echoes: kind 0 Gorath slam, 1 Malakar volley, 2 Elderroot ring, 3 Glacius ice line, 4 Ignar pillars. */
export interface Echo { active: boolean; x: number; z: number; kind: number; t: number; fireAt: number; life: number; fired: boolean; dmg: number; }
export const echoes: Echo[] = Array.from({ length: 4 }, () => ({ active: false, x: 0, z: 0, kind: 0, t: 0, fireAt: 1.2, life: 2.2, fired: false, dmg: 0 }));

/** Glacius frost breath (single cone, ticks while active). */
export const breath = { active: false, x: 0, z: 0, dx: 0, dz: 1, range: 20, half: 0.42, t: 0, dur: 1.5, tick: 0, dmg: 0 };
/** Player chill meter: 4 stacks freeze. */
export const chill = { stacks: 0, t: 0, immuneT: 0 };
/** Arena modifiers. Void: circular arena that shrinks; Glacius: blizzard slow. */
export const arena = { shrink: false, cx: 0, cz: 0, r: 60, minR: 22, rate: 0.9, edgeT: 0, blizzard: false, blizzardK: 0, hailT: 0 };

/** QA counters. */
export const bossStats: Record<string, number> = {};
export function stat(name: string): void { bossStats[name] = (bossStats[name] ?? 0) + 1; }

const tv = new Vector3();

// ------------------------------------------------------------- spawners ----
export function spawnWave(x: number, z: number, speed: number, maxR: number, thick: number, dmg: number, kind: number, color: number, startR = 0.5): void {
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    if (w.active) continue;
    w.active = true; w.x = x; w.z = z; w.r = startR; w.speed = speed; w.maxR = maxR; w.thick = thick; w.dmg = dmg; w.kind = kind; w.color = color; w.hit = false;
    return;
  }
}
export function spawnProp(kind: number, x: number, z: number, delay: number, life: number, r: number, h: number, sx = 0, sz = 0): void {
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
    const p = world.player.pos;
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
  applyPlayerDebuff('SLOW', 1.2);
  events.emit('floatText', { pos: p.pos, text: chill.stacks >= 4 ? 'FROZEN' : `CHILL x${chill.stacks}`, color: 0x8fe4ff, scale: 0.8, dy: 0.8 });
  events.emit('trick', { pos: p.pos.clone(), kind: 'CHILL', radius: 2 });
  if (chill.stacks >= 4) {
    chill.stacks = 0; chill.immuneT = 4;
    freezePlayer(1.2);
    events.emit('trick', { pos: p.pos.clone(), kind: 'FREEZE', radius: 3 });
    stat('Freeze');
  }
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
          damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.HEAVY });   // shoved away (eased, collides)
          applyPlayerDebuff('STUN', 0.5);
        }
        events.emit('trick', { pos: z.pos.clone(), kind: 'TAIL_SWEEP', radius: z.radius });
        events.emit('shake', { amount: 0.4 });
      } else {
        // the breath starts now (ticks run in updateBossFx)
        breath.active = true; breath.x = z.pos.x; breath.z = z.pos.z; breath.dx = z.dir.x; breath.dz = z.dir.z;
        breath.range = z.radius; breath.half = z.aux; breath.t = 0; breath.tick = 0; breath.dmg = pw;
        if (hit && p.alive) { damagePlayer(pw * 0.8, { pos: z.pos, kind: 'ICE' }); addChill(2); }
        events.emit('trick', { pos: z.pos.clone(), kind: 'BREATH', radius: z.radius });
      }
      break;
    }
    case BT.SPIKES: {
      // damage now; spikes erupt in sequence for the visual
      const along = rx * z.dir.x + rz * z.dir.z, perp = Math.abs(rx * z.dir.z - rz * z.dir.x);
      if (p.alive && p.air < 0.5 && along > -1 && along < z.length + 1 && perp < z.radius * 0.5 + 0.6) { damagePlayer(pw, { pos: z.pos, kind: 'ICE' }); addChill(2); applyPlayerDebuff('SLOW', 3); }
      for (let d = 1.5, i = 0; d < z.length; d += 2.4, i++) spawnProp(PROP_ICE, z.pos.x + z.dir.x * d, z.pos.z + z.dir.z * d, i * 0.035, 1.3, 1.1 + (i % 3) * 0.2, 3.2 + (i % 2) * 1.2);
      events.emit('trick', { pos: z.pos.clone(), kind: 'ICE_SPIKES', radius: z.radius });
      break;
    }
    case BT.DIVE:
      events.emit('trick', { pos: z.pos.clone(), kind: 'DIVE_CRASH', radius: z.radius });
      events.emit('shockwave', { pos: z.pos.clone(), radius: z.radius * 1.8, color: 0xbfe8ff });
      events.emit('crater', { pos: z.pos.clone(), radius: z.radius * 0.7, color: 0x16303f });
      addShake(0.7);
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.5); addChill(2); applyPlayerDebuff('SLOW', 3); }
      diveLanded(z.pos.x, z.pos.z);
      break;
    case BT.PILLAR:
      if (inside && p.air < 0.5) { damagePlayer(pw, { pos: z.pos, kind: 'FIRE', ...KB.PUSH }); applyPlayerDebuff('BURN', 3, pw * 0.14); }
      spawnProp(PROP_PILLAR, z.pos.x, z.pos.z, 0, 0.9, z.radius, 9);
      spawnHostileZone('FIREPATCH', z.pos.x, z.pos.z, z.radius * 0.8, 2.5, pw * 0.12, 0xff5a1a);
      events.emit('trick', { pos: z.pos.clone(), kind: 'PILLAR', radius: z.radius });
      break;
    case BT.SHELL:   // the Dune Colossus' mortar shell: a sand blast and a crater, no fire left behind
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL', ...KB.PUSH }); applyPlayerDebuff('SLOW', 1.5); }
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
      if (inside) { damagePlayer(pw, { pos: z.pos, kind: 'ICE' }); addChill(2); }
      spawnProp(PROP_ICE, z.pos.x, z.pos.z, 0, 0.9, 0.9, 2.6);
      events.emit('trick', { pos: z.pos.clone(), kind: 'HAIL', radius: z.radius });
      break;
    case BT.THORN:
      if (inside) damagePlayer(pw, { pos: z.pos, kind: 'PHYSICAL' });
      spawnProp(PROP_THORN, z.pos.x, z.pos.z, 0, 0.7, z.radius * 0.5, 2.4);
      events.emit('trick', { pos: z.pos.clone(), kind: 'THORN_POP', radius: z.radius });
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
    if (w.hit || w.dmg <= 0 || !p.alive) continue;
    const d = Math.hypot(pa.x - w.x, pa.z - w.z);
    if (Math.abs(d - w.r) < w.thick * 0.5 + 0.55 && p.air < 0.5) {
      w.hit = true;
      damagePlayer(w.dmg * BOSS_SKILL_MUL, { pos: tv.set(w.x, 0, w.z), kind: w.kind === WAVE_VOID ? 'MAGIC' : w.kind === WAVE_FIRE ? 'FIRE' : 'PHYSICAL', ...KB.PUSH });
      if (w.kind === WAVE_VOID) applyPlayerDebuff('SLOW', 1.0);
      if (w.kind === WAVE_THORN) applyPlayerDebuff('BLEED', 3, w.dmg * 0.12);
    }
  }

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
    if (q.t < q.open || q.shots <= 0 || !p.alive) continue;
    q.shotT -= dt;
    if (q.shotT <= 0) {
      q.shotT = 0.85; q.shots--;
      const dx = pa.x - q.x, dz = pa.z - q.z, base = Math.atan2(dx, dz);
      for (let k = -1; k <= 1; k++) {
        orbDir.set(Math.sin(base + k * 0.2), 0, Math.cos(base + k * 0.2));
        tv.set(q.x, 1.4, q.z);
        fireEnemyProjectile(tv, orbDir, 'BOSS_ORB', 11.5, q.dmg, { life: 3.2, radius: 0.5 });
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
          const dx = pa.x - q.x, dz = pa.z - q.z, base = Math.atan2(dx, dz);
          for (let k = -3; k <= 3; k++) { orbDir.set(Math.sin(base + k * 0.2), 0, Math.cos(base + k * 0.2)); tv.set(q.x, 1.4, q.z); fireEnemyProjectile(tv, orbDir, 'BOSS_ORB', 12, q.dmg * 0.8, { life: 3.2, radius: 0.5 }); }
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
      if (p.alive && inCone(pa.x, pa.z, breath.x, breath.z, breath.dx, breath.dz, breath.range, breath.half)) {
        damagePlayer(breath.dmg * 0.3 * BOSS_SKILL_MUL, { pos: tv.set(breath.x, 0, breath.z), kind: 'ICE', dot: false });
        addChill(1);
      }
    }
    if (breath.t >= breath.dur) breath.active = false;
  }
  if (chill.immuneT > 0) chill.immuneT -= dt;
  if (chill.stacks > 0) { chill.t += dt; if (chill.t > 3) { chill.t = 0; chill.stacks--; } }

  // ---- Void shrinking arena
  if (arena.shrink) {
    if (arena.r > arena.minR) arena.r = Math.max(arena.minR, arena.r - arena.rate * dt);
    arena.edgeT -= dt;
    if (arena.edgeT <= 0 && p.alive) {
      arena.edgeT = 0.4;
      const d = Math.hypot(pa.x - arena.cx, pa.z - arena.cz);
      if (d > arena.r) {
        damagePlayer(Math.max(6, world.boss.maxHp * 0.0022), { pos: tv.set(arena.cx, 0, arena.cz), kind: 'MAGIC', dot: true });
        applyPlayerDebuff('SLOW', 0.6);
        if (world.time - lastVoidText > 1.5) { lastVoidText = world.time; events.emit('floatText', { pos: p.pos, text: 'THE VOID', color: 0xc084fc, scale: 0.9, dy: 0.9 }); }
      }
    }
  }

  // ---- Glacius blizzard: slows the arena, hail drops near the player
  if (arena.blizzard) {
    arena.blizzardK = Math.min(1, arena.blizzardK + dt * 0.5);
    arena.hailT -= dt;
    if (arena.hailT <= 0 && p.alive) {
      arena.hailT = 2.4;
      const a = Math.random() * 6.283, r = 1.5 + Math.random() * 6;
      const hz = spawnTelegraphCircle(pa.x + Math.sin(a) * r, pa.z + Math.cos(a) * r, 2.1, 1.0, 0, 0x93d8ff);
      if (hz) { hz.trick = BT.HAIL; hz.damage = Math.max(world.boss.maxHp * 0.004, 10); }
    }
  } else arena.blizzardK = Math.max(0, arena.blizzardK - dt);
}
let lastVoidText = -9;

/** Multiplier applied to player move speed (read by zones.updateZones -> envSlow). */
export function arenaSlow(): number { return arena.blizzard ? 0.6 : 1; }   // Glacius's blizzard: -40% move speed everywhere

/** Keeps `v` inside the Void arena (bosses use it). */
export function clampToVoid(v: Vector3, margin: number): void {
  if (!arena.shrink) return;
  const dx = v.x - arena.cx, dz = v.z - arena.cz, d = Math.hypot(dx, dz), lim = Math.max(4, arena.r - margin);
  if (d > lim) { v.x = arena.cx + (dx / d) * lim; v.z = arena.cz + (dz / d) * lim; }
}
export function mapLimit(x: number, z: number, margin: number): number { return edgeLimit(x, z, margin); }

/** Boss died / wave ended: clear every hazard but keep the QA counters. */
export function endBossFx(): void {
  for (const w of waves) w.active = false;
  for (const q of props) q.active = false;
  for (const q of portals) q.active = false;
  for (const q of echoes) q.active = false;
  breath.active = false; chill.stacks = 0; chill.t = 0; chill.immuneT = 0;
  arena.shrink = false; arena.blizzard = false; arena.blizzardK = 0; arena.hailT = 1.5; arena.r = 60; arena.edgeT = 0;
  dive.landed = false;
  // pending boss telegraphs must not fire after their caster is gone
  const zs = world.zones;
  for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.active && z.hostile && z.trick >= BT.VISUAL) z.active = false; }
}

export function resetBossFx(): void {
  endBossFx();
  for (const k in bossStats) delete bossStats[k];
}
