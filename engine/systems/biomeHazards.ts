// Biome environment hazards for normal combat / elite rooms (no boss arenas, camps, merchants, dreams, towers).
//   Greenwood (biome index 0): THORN BRAMBLES (light scratch ticks + 30% slow) and SPORE MUSHROOMS (poison cloud when anyone steps near).
//   Frostpeak (index 4): FALLING ICICLES (the slippery ice floor itself lives in engine/iceFloor.ts; monsters slide there, iceMobs below) (telegraph circle, then a crash).
//   The Void (index 6): BLACK HOLES (hz.rift: a violent pull that walking cannot beat - only a dash carries the hero out - plus ticking HP loss while caught).
// All state lives in `hz` (pooled, allocation-free per frame); render/BiomeHazards.tsx draws it,
// player.ts reads hazSlow / iceGrip / driftX / driftZ (one frame behind, fine); drift is scaled down while dashing.
import { world } from '../world';
import { useGameStore, DMG_INFLATE } from '../../store';
import type { RoomPlan } from '../types';
import { BIOMES } from '../roomDefs';
import { startPos, stationPos, portalSlot, shortcutSlot } from '../roomgen';
import { queryColliders, type Collider } from '../mapgen';
import { onBridge } from '../roomFeatures';
import { insideShape } from '../roomShape';
import { isStationary, isSwarm } from '../enemyDefs';
import { damagePlayer, damageEnemy, applyPlayerDebuff, freezePlayer, applyStatus, addShake, type StatusEffect, type DamageOpts } from './combat';
import { updateRoomTraps, trapMods, obPull } from './roomTraps';
import { Vector3 } from 'three';
import { iceAt, ice, ICE_MOB_LERP } from '../iceFloor';

export const HZ = { NONE: 0, GREEN: 1, FROST: 2, VOID: 3 } as const;
const GREENWOOD = 0, FROSTPEAK = 4, VOID = 6;   // indices into BIOMES (see roomDefs.ts)

// ---- tuning
const BRAMBLE_TICK = 0.5, BRAMBLE_DMG = 0.012, BRAMBLE_SLOW = 0.7, BRAMBLE_HOLD = 0.45;   // 1.2% max HP per tick, 30% slow that lingers 0.45 s
const SHROOM_TRIGGER = 2.2, SHROOM_CD = 6, CLOUD_R = 2.5, CLOUD_T = 3, CLOUD_TICK = 0.5, CLOUD_HERO = 0.015, CLOUD_MOB = 0.04;
const ICICLE_WARN = 1.0, ICICLE_R = 1.9, ICICLE_DMG = 0.08, ICICLE_STAY = 0.7;
// (owner 2026-10-26) a real black hole: the hero's pull (14 u/s at the rim, 22 at the core) beats any walk speed; only a dash (pull x0.2) gets out.
const RIFT_PULL_R = 6.5, RIFT_CORE_R = 2.0, RIFT_PULL_MIN = 14, RIFT_PULL_MAX = 22, RIFT_MOB_PULL = 5.0,
  RIFT_TICK = 0.5, RIFT_HERO = 0.04, RIFT_MOB = 0.02;
export const RIFT_DASH_DRIFT = 0.2;   // drift multiplier while the hero dashes (player.ts)

export const hz = {
  kind: 0 as number, ver: 0,
  nBr: 0, br: Array.from({ length: 12 }, () => ({ x: 0, z: 0, r: 0, rot: 0 })),
  nMu: 0, mu: Array.from({ length: 8 }, () => ({ x: 0, z: 0, cd: 0, rot: 0, auto: 0 })),   // auto > 0: a boss-arena poison plant that puffs by itself every `auto` s
  clouds: Array.from({ length: 8 }, () => ({ on: false, x: 0, z: 0, t: 0, tick: 0, seed: 0 })),
  nIce: 0, ice: Array.from({ length: 6 }, () => ({ x: 0, z: 0, r: 0 })),
  ic: Array.from({ length: 10 }, () => ({ on: false, x: 0, z: 0, t: 0, hit: false, seed: 0 })),
  /** black holes: permanent ones (Void rooms, life = Infinity) and timed ones (the Herald's meteors / spell); k = 0..1 fade in / out */
  nRift: 0, rift: Array.from({ length: 9 }, () => ({ x: 0, z: 0, life: Infinity, age: 0, k: 1, s: 1, vis: false, follow: 0 })),   // s = visual scale, vis = picture only (no pull / damage: Malakar's gravity spell), follow = chase speed
};
export const ICICLE_WARN_T = ICICLE_WARN, ICICLE_STAY_T = ICICLE_STAY, CLOUD_LIFE = CLOUD_T;
export const BH_FORM = 0.9, BH_FADE = 0.6, BH_MAX_TIMED = 4;   // a timed black hole forms for 0.9 s (no pull yet), fades over its last 0.6 s; at most 4 alive
/** A timed black hole (the Herald): the oldest timed one is recycled when 4 are already alive. Works in any room (the tick below runs whenever nRift > 0). */
export function spawnBlackHole(x: number, z: number, life: number, follow = 0): void {
  let timed = 0, oldest = -1;
  for (let i = 0; i < hz.nRift; i++) { const q = hz.rift[i]; if (q.life !== Infinity && !q.vis) { timed++; if (oldest < 0 || q.age > hz.rift[oldest].age) oldest = i; } }
  let r;
  if (timed >= BH_MAX_TIMED && oldest >= 0) r = hz.rift[oldest];
  else if (hz.nRift < hz.rift.length) r = hz.rift[hz.nRift++];
  else if (oldest >= 0) r = hz.rift[oldest];
  else return;
  r.x = x; r.z = z; r.life = life; r.age = 0; r.k = 0; r.s = 1; r.vis = false; r.follow = follow;
  hz.ver++;
}
/** A picture-only black hole `scale` times the normal size (the Herald's gravity spell: the pull / damage are applied by voidFx). */
export function spawnGravityVisual(x: number, z: number, life: number, scale: number): void {
  if (hz.nRift >= hz.rift.length) return;
  const r = hz.rift[hz.nRift++];
  r.x = x; r.z = z; r.life = life; r.age = 0; r.k = 0; r.s = scale; r.vis = true; r.follow = 0;
  hz.ver++;
}
export const HZ_CLOUD_R = CLOUD_R, HZ_RIFT_PULL_R = RIFT_PULL_R, HZ_RIFT_CORE_R = RIFT_CORE_R, HZ_SHROOM_CD = SHROOM_CD;

/** Live modifiers read by player.ts: speed multiplier, velocity-lerp multiplier (1 = normal, <1 = icy), constant drift (units/s). */
export let hazSlow = 1;
export let iceGrip = 1;
export let driftX = 0;
/** The hero is caught in a black hole's pull. */
export let inRift = false;
export let driftZ = 0;

const tmp = new Vector3();
const colOut: Collider[] = [];
const ids: number[] = [];
const sx = new Float32Array(world.enemies.length), sz = new Float32Array(world.enemies.length);   // per-enemy ice slide velocity
const maxHp = () => useGameStore.getState().stats.maxHealth;
const psn: StatusEffect = { type: 'POISON', duration: 1.0, value: 3 };
const riftOpts: DamageOpts = { kind: 'MAGIC', dot: true, env: 'HAZARD' };

let brCd = 0, brHold = 0, riftCd = 0, icT = 3, plRiftCd = 0;

// ------------------------------------------------------------------ placement --
const kx: number[] = [], kz: number[] = [], kr: number[] = [];   // keep-clear discs (arrival, station, exits) + everything placed so far
function keep(x: number, z: number, r: number): void { kx.push(x); kz.push(z); kr.push(r); }
const spotOut: [number, number] = [0, 0];
/** A free floor spot for a disc of radius `rad` (clear of props, the arrival point, exits, station and earlier hazards). */
function spot(rad: number, pad = 1, tries = 60): boolean {
  const R = world.room.radius;
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R * 0.9;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!insideShape(x, z, rad + 2.5) || onBridge(x, z, rad + 1)) continue;   // (never on a bridge deck: bridges must stay usable)
    let ok = true;
    for (let k = 0; k < kx.length && ok; k++) if (Math.hypot(x - kx[k], z - kz[k]) < kr[k] + rad + pad) ok = false;
    if (!ok) continue;
    queryColliders(x, z, rad + 1.5, colOut);
    for (let k = 0; k < colOut.length; k++) if (Math.hypot(colOut[k].x - x, colOut[k].z - z) < colOut[k].r + rad) { ok = false; break; }
    if (!ok) continue;
    spotOut[0] = x; spotOut[1] = z;
    return true;
  }
  return false;
}

export const PLANT_WARN = 1.4;   // a boss-arena poison plant swells + shows its cloud ring this long before it puffs
/** Elderroot's arena (BOSS room, Greenwood): 6 poison plants round the rim. Each puffs a poison cloud (the room's spore cloud: 2.5 m, 3 s) every 6.5 s, staggered,
 *  after a 1.4 s swell + ring telegraph. Not destructible, no collider; they stay off the boss's root, the arrival spot and the exits. Call after setupBiomeHazards. */
export function setupBossPlants(): void {
  const R = world.room.radius;
  hz.kind = HZ.GREEN; hz.nBr = hz.nMu = 0; hz.ver++;
  kx.length = kz.length = kr.length = 0;
  const [sx0, sz0] = startPos(R), po: [number, number] = [0, 0];
  keep(sx0, sz0, 7); keep(0, -R * 0.16, 7); keep(0, 0, 5);
  for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); keep(po[0], po[1], 5); }
  for (let i = 0; i < 2; i++) { portalSlot(i, 2, R, po); keep(po[0], po[1], 5); }
  for (let i = 0, tries = 0; i < 6 && tries < 40; tries++) {
    if (!spot(1.1, 6, 12)) continue;
    const x = spotOut[0], z = spotOut[1];
    if (Math.hypot(x, z) < R * 0.42) continue;   // out on the sides, the middle stays clear for the fight
    const m = hz.mu[hz.nMu++]; m.x = x; m.z = z; m.rot = Math.random() * 6.28; m.auto = 6.5; m.cd = 2.5 + i * 1.1;
    keep(x, z, 1.1); i++;
  }
}

/** Room entry (director.enterRoom, after buildRoom): roll this room's hazards. */
export function setupBiomeHazards(biome: number, plan: RoomPlan): void {
  hz.kind = HZ.NONE; hz.nBr = hz.nMu = hz.nIce = hz.nRift = 0;
  for (const c of hz.clouds) c.on = false;
  for (const i of hz.ic) i.on = false;
  hazSlow = 1; iceGrip = 1; driftX = driftZ = 0; inRift = false; brCd = brHold = riftCd = plRiftCd = 0; icT = 3;
  hz.ver++;
  if ((plan.type !== 'COMBAT' && plan.type !== 'ELITE') || plan.gate !== undefined || plan.shortcut || plan.epilogue) return;
  const b = biome % BIOMES.length;
  const kind = b === GREENWOOD ? HZ.GREEN : b === FROSTPEAK ? HZ.FROST : b === VOID ? HZ.VOID : HZ.NONE;
  if (kind === HZ.NONE) return;
  const R = world.room.radius, elite = plan.type === 'ELITE';
  kx.length = kz.length = kr.length = 0;
  const [sx0, sz0] = startPos(R), [stx, stz] = stationPos(R);
  keep(sx0, sz0, kind === HZ.VOID ? 9 : 7);
  keep(stx, stz, 5);
  const po: [number, number] = [0, 0];
  for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); keep(po[0], po[1], 6); }
  for (let i = 0; i < 2; i++) { portalSlot(i, 2, R, po); keep(po[0], po[1], 6); }   // (a 2-exit room spreads them differently)
  shortcutSlot(po); keep(po[0], po[1], 5);
  hz.kind = kind;
  if (kind === HZ.GREEN) {   // (owner 2026-10-24: no damaging / entangling bramble bushes - nb = 0; the mushroom patches stay)
    const nb = 0, nm = 3 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nb && hz.nBr < hz.br.length; i++) {
      const r = 1.7 + Math.random() * 0.8;
      if (!spot(r, 1.5)) continue;
      const b2 = hz.br[hz.nBr++]; b2.x = spotOut[0]; b2.z = spotOut[1]; b2.r = r; b2.rot = Math.random() * 6.28;
      keep(b2.x, b2.z, r);
    }
    for (let i = 0; i < nm && hz.nMu < hz.mu.length; i++) {
      if (!spot(1.1, 3)) continue;
      const m = hz.mu[hz.nMu++]; m.x = spotOut[0]; m.z = spotOut[1]; m.cd = 1 + Math.random() * 2; m.rot = Math.random() * 6.28; m.auto = 0;
      keep(m.x, m.z, 1.1);
    }
  } else if (kind === HZ.FROST) {
    // (the slippery ice sheets are the floor of engine/iceFloor.ts now: big sheets painted on the ground, built after the stationaries)
    icT = 4 + Math.random() * 2;
  } else {
    const n = 3;   // (owner 2026-10-24: the black holes are the Void's stationaries)
    for (let i = 0; i < n && hz.nRift < hz.rift.length; i++) {
      if (!spot(RIFT_PULL_R * 0.7, 3)) continue;
      const rf = hz.rift[hz.nRift++]; rf.x = spotOut[0]; rf.z = spotOut[1]; rf.life = Infinity; rf.age = 1; rf.k = 1; rf.s = 1; rf.vis = false; rf.follow = 0;
      keep(rf.x, rf.z, RIFT_PULL_R);
    }
  }
  if (kind !== HZ.VOID && kind !== HZ.FROST && hz.nBr + hz.nMu + hz.nIce === 0) hz.kind = HZ.NONE;   // (the Void keeps its kind even when no black hole fit; no 'hazards here' toast: the owner found them noisy)
}

// ---------------------------------------------------------------------- tick --
const mobOk = (e: { active: boolean; state: string }): boolean => e.active && e.state !== 'DYING' && e.state !== 'SPAWN';

function puff(m: { x: number; z: number; cd: number }): void {
  m.cd = SHROOM_CD;
  let c = hz.clouds.find((q) => !q.on);
  if (!c) { c = hz.clouds[0]; for (const q of hz.clouds) if (q.t < c.t) c = q; }
  c.on = true; c.x = m.x; c.z = m.z; c.t = CLOUD_T; c.tick = 0.1; c.seed = Math.random() * 10;
}

/** Every frame: the room's stationary traps (roomTraps.ts), then the biome hazards; the traps' slip / slow combine with the biome's own. */
export function updateBiomeHazards(dt: number): void {
  updateRoomTraps(dt);
  tickBiomeHazards(dt);
  if (obPull.on) { driftX += obPull.x; driftZ += obPull.z; }   // (Void gravity obelisk: the same drift the black holes use; tickBiomeHazards rewrites it each frame)
  if (ice.on && world.room.active) iceMobs(dt);
  if (trapMods.grip < iceGrip) iceGrip = trapMods.grip;
  if (trapMods.slow < hazSlow) hazSlow = trapMods.slow;
}
/** Frostpeak ice floor (iceFloor.ts): walking monsters keep a little momentum on a sheet (their slide velocity lerps toward the AI's at ~3/s). Bosses, minis and stationaries do not slide. */
function iceMobs(dt: number): void {
  const k = 1 - Math.exp(-ICE_MOB_LERP * dt), list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active) continue;
    const vx = e.vel.x, vz = e.vel.z;
    if (!e.boss && !e.mini && e.state !== 'DYING' && e.state !== 'SPAWN' && !isStationary(e.kind) && !isSwarm(e.kind) && iceAt(e.pos.x, e.pos.z)) {
      sx[i] += (vx - sx[i]) * k; sz[i] += (vz - sz[i]) * k;
      e.pos.x += (sx[i] - vx) * dt; e.pos.z += (sz[i] - vz) * dt;
    } else { sx[i] = vx; sz[i] = vz; }
  }
}
function tickBiomeHazards(dt: number): void {
  const room = world.room, pl = world.player;
  if (!room.active || (hz.kind === HZ.NONE && hz.nRift === 0)) { hazSlow = 1; iceGrip = 1; driftX = driftZ = 0; inRift = false; return; }
  const fighting = world.director.phase === 'FIGHT';
  const alive = pl.alive;
  const px = pl.pos.x, pz = pl.pos.z;
  let dX = 0, dZ = 0;

  if (hz.kind === HZ.GREEN) {
    // ---- brambles: a scratch tick + slow while the hero stands in a patch
    let inB = false;
    if (alive) for (let i = 0; i < hz.nBr; i++) { const b = hz.br[i]; const dx = px - b.x, dz = pz - b.z, rr = b.r + 0.2; if (dx * dx + dz * dz < rr * rr) { inB = true; break; } }
    if (brCd > 0) brCd -= dt;
    if (inB) {
      brHold = BRAMBLE_HOLD;
      if (brCd <= 0) { brCd = BRAMBLE_TICK; tmp.set(px, 0, pz); damagePlayer(maxHp() * BRAMBLE_DMG / DMG_INFLATE, { pos: tmp, kind: 'PHYSICAL', env: true }); }
    } else if (brHold > 0) brHold -= dt;
    hazSlow = brHold > 0 ? BRAMBLE_SLOW : 1;
    // ---- spore mushrooms: anyone (hero or monster) steps close -> a poison cloud, then a cooldown
    for (let i = 0; i < hz.nMu; i++) {
      const m = hz.mu[i];
      if (m.auto > 0) { if (fighting) { m.cd -= dt; if (m.cd <= 0) { puff(m); m.cd = m.auto; } } continue; }   // boss-arena plant: swells for PLANT_WARN s (render), then puffs on its own
      if (m.cd > 0) { m.cd -= dt; continue; }
      let trig = alive && (px - m.x) * (px - m.x) + (pz - m.z) * (pz - m.z) < SHROOM_TRIGGER * SHROOM_TRIGGER;
      if (!trig) {
        world.enemyGrid.query(m.x, m.z, SHROOM_TRIGGER + 2, ids);
        for (let k = 0; k < ids.length; k++) {
          const e = world.enemies[ids[k]];
          if (!mobOk(e) || isStationary(e.kind)) continue;
          const rr = SHROOM_TRIGGER + e.radius * 0.5;
          if ((e.pos.x - m.x) * (e.pos.x - m.x) + (e.pos.z - m.z) * (e.pos.z - m.z) < rr * rr) { trig = true; break; }
        }
      }
      if (trig) puff(m);
    }
    // ---- clouds: poison the hero and every monster inside (monsters too: lure them)
    for (let i = 0; i < hz.clouds.length; i++) {
      const c = hz.clouds[i];
      if (!c.on) continue;
      c.t -= dt;
      if (c.t <= 0) { c.on = false; continue; }
      c.tick -= dt;
      if (c.tick > 0) continue;
      c.tick += CLOUD_TICK;
      if (alive && (px - c.x) * (px - c.x) + (pz - c.z) * (pz - c.z) < CLOUD_R * CLOUD_R) applyPlayerDebuff('POISON', 1.0, maxHp() * CLOUD_HERO / DMG_INFLATE / 0.5);
      world.enemyGrid.query(c.x, c.z, CLOUD_R + 4, ids);
      for (let k = 0; k < ids.length; k++) {
        const e = world.enemies[ids[k]];
        if (!mobOk(e) || e.boss) continue;
        const rr = CLOUD_R + e.radius * 0.5;
        if ((e.pos.x - c.x) * (e.pos.x - c.x) + (e.pos.z - c.z) * (e.pos.z - c.z) > rr * rr) continue;
        psn.value = Math.max(2, e.maxHp * CLOUD_MOB * (e.mini ? 0.3 : e.elite ? 0.6 : 1));
        applyStatus(e, psn);
      }
    }
  } else if (hz.kind === HZ.FROST) {
    // ---- icicles: telegraph circle, then a crash (damage + chill/freeze), every ~3-5 s near the hero, sometimes in clusters
    if (fighting && alive) {
      icT -= dt;
      if (icT <= 0) {
        icT = 3 + Math.random() * 2;
        const n = Math.random() < 0.3 ? 3 : 1;
        const a0 = Math.random() * 6.28, d0 = 1.5 + Math.random() * 6.5;
        const bx = px + Math.cos(a0) * d0, bz = pz + Math.sin(a0) * d0;
        for (let q = 0; q < n; q++) {
          const a = Math.random() * 6.28, d = q === 0 ? 0 : 1.8 + Math.random() * 2.2;
          const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
          if (!insideShape(x, z, 1.5)) continue;
          const ic = hz.ic.find((w) => !w.on);
          if (!ic) break;
          ic.on = true; ic.x = x; ic.z = z; ic.t = -q * 0.18; ic.hit = false; ic.seed = Math.random();
        }
      }
    }
    for (let i = 0; i < hz.ic.length; i++) {
      const ic = hz.ic[i];
      if (!ic.on) continue;
      ic.t += dt;
      if (!ic.hit && ic.t >= ICICLE_WARN) {
        ic.hit = true;
        addShake(0.25);
        if (alive && (px - ic.x) * (px - ic.x) + (pz - ic.z) * (pz - ic.z) < ICICLE_R * ICICLE_R) {
          tmp.set(ic.x, 0, ic.z);
          damagePlayer(maxHp() * ICICLE_DMG / DMG_INFLATE, { pos: tmp, kind: 'ICE' });
          applyPlayerDebuff('SLOW', 2.0);
          freezePlayer(0.4);
        }
      } else if (ic.t >= ICICLE_WARN + ICICLE_STAY) ic.on = false;
    }
  }
  if (hz.nRift > 0) {
    // ---- black holes: a violent pull + ticking damage for the hero inside the radius (dash to escape); monsters get a gentle pull and an HP drain in the core
    riftCd -= dt; plRiftCd -= dt; inRift = false;
    const tick = riftCd <= 0; if (tick) riftCd = RIFT_TICK;
    for (let i = 0; i < hz.nRift; i++) {
      const r = hz.rift[i];
      if (r.life !== Infinity) {   // timed: form, live, fade, then swap-remove
        r.age += dt;
        if (r.age >= r.life) { hz.rift[i] = hz.rift[hz.nRift - 1]; hz.rift[hz.nRift - 1] = r; hz.nRift--; hz.ver++; i--; continue; }
        r.k = Math.min(1, r.age / BH_FORM, (r.life - r.age) / BH_FADE);
      }
      if (r.vis) continue;   // (picture only)
      if (r.follow > 0 && alive && r.age > BH_FORM) {   // a summoned hole drifts after the hero, slower than walking
        const fx = px - r.x, fz = pz - r.z, fd = Math.hypot(fx, fz);
        if (fd > 1.2) { r.x += fx / fd * r.follow * dt; r.z += fz / fd * r.follow * dt; }
      }
      const live = r.k >= 1 || (r.life !== Infinity && r.age > BH_FORM && r.k > 0);   // (still forming = harmless)
      if (alive && live) {
        const dx = r.x - px, dz = r.z - pz, d = Math.sqrt(dx * dx + dz * dz);
        if (d < RIFT_PULL_R && d > 0.05) {
          const s = (RIFT_PULL_MIN + (RIFT_PULL_MAX - RIFT_PULL_MIN) * (1 - d / RIFT_PULL_R)) * r.k;
          dX += dx / d * s; dZ += dz / d * s;
          inRift = true;
          if (plRiftCd <= 0 && pl.dashT <= 0) { plRiftCd = RIFT_TICK; tmp.set(r.x, 0, r.z); damagePlayer(maxHp() * RIFT_HERO / DMG_INFLATE, { pos: tmp, kind: 'MAGIC', env: true }); }   // 4% max HP / 0.5 s while caught (not flagged dot: that would x4, HERO_DOT_MUL)
        }
      }
      world.enemyGrid.query(r.x, r.z, RIFT_PULL_R + 4, ids);
      for (let k = 0; k < ids.length; k++) {
        const e = world.enemies[ids[k]];
        if (!mobOk(e) || e.boss || e.mini || e.decoy || isStationary(e.kind) || !live) continue;
        const dx = r.x - e.pos.x, dz = r.z - e.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d >= RIFT_PULL_R || d < 0.05) continue;
        const s = RIFT_MOB_PULL * (1 - d / RIFT_PULL_R);
        e.pos.x += dx / d * s * dt; e.pos.z += dz / d * s * dt;
        if (tick && d < RIFT_CORE_R) damageEnemy(e, e.maxHp * RIFT_MOB * (e.elite ? 0.5 : 1), riftOpts);
      }
    }
  }
  driftX = dX; driftZ = dZ;
}
