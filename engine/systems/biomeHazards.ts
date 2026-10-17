// Biome environment hazards for normal combat / elite rooms (no boss arenas, camps, merchants, dreams, towers).
//   Greenwood (biome index 0): THORN BRAMBLES (light scratch ticks + 30% slow) and SPORE MUSHROOMS (poison cloud when anyone steps near).
//   Frostpeak (index 4): SLIPPERY ICE sheets (hero keeps momentum, monsters slide a little) and FALLING ICICLES (telegraph circle, then a crash).
//   The Void (index 6): VOID RIFTS (gentle pull, HP drain in the core) and GRAVITY FLIPS (warning, then the whole room drifts one way).
// All state lives in `hz` (pooled, allocation-free per frame); render/BiomeHazards.tsx draws it, ui/hud/BiomeHazardHud.tsx the flip banner.
// player.ts reads hazSlow / iceGrip / driftX / driftZ (one frame behind, fine).
import { world } from '../world';
import { events } from '../events';
import { useGameStore, DMG_INFLATE } from '../../store';
import type { RoomPlan } from '../types';
import { BIOMES } from '../roomDefs';
import { startPos, stationPos, portalSlot, shortcutSlot } from '../roomgen';
import { queryColliders, type Collider } from '../mapgen';
import { insideShape } from '../roomShape';
import { isStationary } from '../enemyDefs';
import { damagePlayer, damageEnemy, applyPlayerDebuff, freezePlayer, applyStatus, addShake, type StatusEffect, type DamageOpts } from './combat';
import { Vector3 } from 'three';

export const HZ = { NONE: 0, GREEN: 1, FROST: 2, VOID: 3 } as const;
const GREENWOOD = 0, FROSTPEAK = 4, VOID = 6;   // indices into BIOMES (see roomDefs.ts)

// ---- tuning
const BRAMBLE_TICK = 0.5, BRAMBLE_DMG = 0.012, BRAMBLE_SLOW = 0.7, BRAMBLE_HOLD = 0.45;   // 1.2% max HP per tick, 30% slow that lingers 0.45 s
const SHROOM_TRIGGER = 2.2, SHROOM_CD = 6, CLOUD_R = 2.5, CLOUD_T = 3, CLOUD_TICK = 0.5, CLOUD_HERO = 0.015, CLOUD_MOB = 0.04;
const ICE_GRIP = 0.25;   // the hero's velocity lerp rate on ice (x0.25)
const ICICLE_WARN = 1.0, ICICLE_R = 1.9, ICICLE_DMG = 0.08, ICICLE_STAY = 0.7;
const RIFT_PULL_R = 5, RIFT_CORE_R = 1.6, RIFT_PULL = 3.0, RIFT_TICK = 0.5, RIFT_HERO = 0.02, RIFT_MOB = 0.02;
const FLIP_WARN = 1.5, FLIP_T = 3, FLIP_SPEED = 3;

export const hz = {
  kind: 0 as number, ver: 0,
  nBr: 0, br: Array.from({ length: 12 }, () => ({ x: 0, z: 0, r: 0, rot: 0 })),
  nMu: 0, mu: Array.from({ length: 5 }, () => ({ x: 0, z: 0, cd: 0, rot: 0 })),
  clouds: Array.from({ length: 8 }, () => ({ on: false, x: 0, z: 0, t: 0, tick: 0, seed: 0 })),
  nIce: 0, ice: Array.from({ length: 6 }, () => ({ x: 0, z: 0, r: 0 })),
  ic: Array.from({ length: 10 }, () => ({ on: false, x: 0, z: 0, t: 0, hit: false, seed: 0 })),
  nRift: 0, rift: Array.from({ length: 3 }, () => ({ x: 0, z: 0 })),
  /** gravity flip: state 0 idle, 1 warning, 2 active; (dx, dz) = world push direction (unit) */
  flip: { state: 0, t: 0, next: 0, dx: 0, dz: 1 },
};
export const ICICLE_WARN_T = ICICLE_WARN, ICICLE_STAY_T = ICICLE_STAY, CLOUD_LIFE = CLOUD_T, FLIP_WARN_T = FLIP_WARN, FLIP_ACTIVE_T = FLIP_T;
export const HZ_CLOUD_R = CLOUD_R, HZ_RIFT_PULL_R = RIFT_PULL_R, HZ_RIFT_CORE_R = RIFT_CORE_R, HZ_SHROOM_CD = SHROOM_CD;

/** Live modifiers read by player.ts: speed multiplier, velocity-lerp multiplier (1 = normal, <1 = icy), constant drift (units/s). */
export let hazSlow = 1;
export let iceGrip = 1;
export let driftX = 0;
export let driftZ = 0;

const tmp = new Vector3();
const colOut: Collider[] = [];
const ids: number[] = [];
const sx = new Float32Array(world.enemies.length), sz = new Float32Array(world.enemies.length);   // per-enemy ice slide velocity
const maxHp = () => useGameStore.getState().stats.maxHealth;
const notify = (msg: string, color: string) => useGameStore.getState().addNotification(msg, color, 'SYSTEM');
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
    if (!insideShape(x, z, rad + 2.5)) continue;
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

/** Room entry (director.enterRoom, after buildRoom): roll this room's hazards. */
export function setupBiomeHazards(biome: number, plan: RoomPlan): void {
  hz.kind = HZ.NONE; hz.nBr = hz.nMu = hz.nIce = hz.nRift = 0;
  for (const c of hz.clouds) c.on = false;
  for (const i of hz.ic) i.on = false;
  hz.flip.state = 0; hz.flip.t = 0;
  hazSlow = 1; iceGrip = 1; driftX = driftZ = 0; brCd = brHold = riftCd = plRiftCd = 0; icT = 3;
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
  if (kind === HZ.GREEN) {
    const nb = 4 + (elite ? 1 : 0) + Math.floor(Math.random() * 3), nm = 3 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nb && hz.nBr < hz.br.length; i++) {
      const r = 1.7 + Math.random() * 0.8;
      if (!spot(r, 1.5)) continue;
      const b2 = hz.br[hz.nBr++]; b2.x = spotOut[0]; b2.z = spotOut[1]; b2.r = r; b2.rot = Math.random() * 6.28;
      keep(b2.x, b2.z, r);
    }
    for (let i = 0; i < nm && hz.nMu < hz.mu.length; i++) {
      if (!spot(1.1, 3)) continue;
      const m = hz.mu[hz.nMu++]; m.x = spotOut[0]; m.z = spotOut[1]; m.cd = 1 + Math.random() * 2; m.rot = Math.random() * 6.28;
      keep(m.x, m.z, 1.1);
    }
  } else if (kind === HZ.FROST) {
    const n = 4 + Math.floor(Math.random() * 2) + (R > 34 ? 1 : 0);
    for (let i = 0; i < n && hz.nIce < hz.ice.length; i++) {
      const r = 4.5 + Math.random() * 3;
      if (!spot(r * 0.7, 1)) continue;
      const s = hz.ice[hz.nIce++]; s.x = spotOut[0]; s.z = spotOut[1]; s.r = r;
      keep(s.x, s.z, r * 0.5);
    }
    icT = 4 + Math.random() * 2;
  } else {
    const n = 2 + (R > 32 ? 1 : 0);
    for (let i = 0; i < n && hz.nRift < hz.rift.length; i++) {
      if (!spot(RIFT_PULL_R * 0.7, 3)) continue;
      const rf = hz.rift[hz.nRift++]; rf.x = spotOut[0]; rf.z = spotOut[1];
      keep(rf.x, rf.z, RIFT_PULL_R);
    }
    hz.flip.next = 9 + Math.random() * 6;
  }
  if (kind !== HZ.VOID && hz.nBr + hz.nMu + hz.nIce === 0) hz.kind = HZ.NONE;   // (the Void keeps its gravity flips even when no rift fit)
  else if (kind === HZ.GREEN) notify('Thorny brambles and spore mushrooms grow here.', '#9bd26a');
  else if (kind === HZ.FROST) notify('Slippery ice and falling icicles!', '#9fe0ff');
  else notify('Void rifts tear the floor. Gravity is unstable.', '#c9a2ff');
}

// ---------------------------------------------------------------------- tick --
const mobOk = (e: { active: boolean; state: string }): boolean => e.active && e.state !== 'DYING' && e.state !== 'SPAWN';

function puff(m: { x: number; z: number; cd: number }): void {
  m.cd = SHROOM_CD;
  let c = hz.clouds.find((q) => !q.on);
  if (!c) { c = hz.clouds[0]; for (const q of hz.clouds) if (q.t < c.t) c = q; }
  c.on = true; c.x = m.x; c.z = m.z; c.t = CLOUD_T; c.tick = 0.1; c.seed = Math.random() * 10;
}

export function updateBiomeHazards(dt: number): void {
  const room = world.room, pl = world.player;
  if (!room.active || hz.kind === HZ.NONE) { hazSlow = 1; iceGrip = 1; driftX = driftZ = 0; return; }
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
      if (brCd <= 0) { brCd = BRAMBLE_TICK; tmp.set(px, 0, pz); damagePlayer(maxHp() * BRAMBLE_DMG / DMG_INFLATE, { pos: tmp, kind: 'PHYSICAL' }); }
    } else if (brHold > 0) brHold -= dt;
    hazSlow = brHold > 0 ? BRAMBLE_SLOW : 1;
    // ---- spore mushrooms: anyone (hero or monster) steps close -> a poison cloud, then a cooldown
    for (let i = 0; i < hz.nMu; i++) {
      const m = hz.mu[i];
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
    // ---- ice: the hero's velocity lerp drops to x0.25 while on a sheet
    let on = false;
    if (alive) for (let i = 0; i < hz.nIce; i++) { const s = hz.ice[i]; const dx = px - s.x, dz = pz - s.z; if (dx * dx + dz * dz < s.r * s.r) { on = true; break; } }
    iceGrip = on ? ICE_GRIP : 1;
    // ---- monsters keep a little momentum on ice (their slide velocity lerps toward the AI's velocity at ~3/s)
    const k = 1 - Math.exp(-3 * dt), list = world.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      const vx = e.vel.x, vz = e.vel.z;
      let onIce = false;
      if (!e.boss && !e.mini && e.state !== 'DYING' && e.state !== 'SPAWN' && !isStationary(e.kind)) {
        for (let j = 0; j < hz.nIce; j++) { const s = hz.ice[j]; const dx = e.pos.x - s.x, dz = e.pos.z - s.z; if (dx * dx + dz * dz < s.r * s.r) { onIce = true; break; } }
      }
      if (onIce) {
        sx[i] += (vx - sx[i]) * k; sz[i] += (vz - sz[i]) * k;
        e.pos.x += (sx[i] - vx) * dt; e.pos.z += (sz[i] - vz) * dt;
      } else { sx[i] = vx; sz[i] = vz; }
    }
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
  } else {
    // ---- rifts: a gentle pull inside the pull radius, an HP drain in the core (hero and monsters)
    riftCd -= dt; plRiftCd -= dt;
    const tick = riftCd <= 0; if (tick) riftCd = RIFT_TICK;
    for (let i = 0; i < hz.nRift; i++) {
      const r = hz.rift[i];
      if (alive) {
        const dx = r.x - px, dz = r.z - pz, d = Math.sqrt(dx * dx + dz * dz);
        if (d < RIFT_PULL_R && d > 0.05) {
          const s = RIFT_PULL * (1 - d / RIFT_PULL_R);
          dX += dx / d * s; dZ += dz / d * s;
          if (d < RIFT_CORE_R && plRiftCd <= 0) { plRiftCd = RIFT_TICK; tmp.set(r.x, 0, r.z); damagePlayer(maxHp() * RIFT_HERO / DMG_INFLATE, { pos: tmp, kind: 'MAGIC', dot: true }); }
        }
      }
      world.enemyGrid.query(r.x, r.z, RIFT_PULL_R + 4, ids);
      for (let k = 0; k < ids.length; k++) {
        const e = world.enemies[ids[k]];
        if (!mobOk(e) || e.boss || e.mini || isStationary(e.kind)) continue;
        const dx = r.x - e.pos.x, dz = r.z - e.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d >= RIFT_PULL_R || d < 0.05) continue;
        const s = RIFT_PULL * 0.8 * (1 - d / RIFT_PULL_R);
        e.pos.x += dx / d * s * dt; e.pos.z += dz / d * s * dt;
        if (tick && d < RIFT_CORE_R) damageEnemy(e, e.maxHp * RIFT_MOB * (e.elite ? 0.5 : 1), riftOpts);
      }
    }
    // ---- gravity flip: warning banner, then the whole room drifts one way (bosses and champions are immune)
    const f = hz.flip;
    if (f.state === 0) {
      if (fighting && alive) {
        f.next -= dt;
        if (f.next <= 0) {
          f.state = 1; f.t = FLIP_WARN;
          const k = Math.floor(Math.random() * 8), a = k * Math.PI / 4;   // a screen direction (so the banner arrow reads the same), turned into world space
          const c = Math.cos(world.camera.yaw), s = Math.sin(world.camera.yaw), scx = Math.sin(a), scz = -Math.cos(a);
          f.dx = scx * c + scz * s; f.dz = -scx * s + scz * c;
          events.emit('floatText', { pos: pl.pos, text: 'GRAVITY SHIFT!', color: 0xc9a2ff, scale: 1.1, dy: 2.6 });
        }
      }
    } else if (!fighting || !alive) { f.state = 0; f.next = 15 + Math.random() * 5; }
    else {
      f.t -= dt;
      if (f.state === 1 && f.t <= 0) { f.state = 2; f.t = FLIP_T; }
      else if (f.state === 2) {
        if (f.t <= 0) { f.state = 0; f.next = 15 + Math.random() * 5; }
        else {
          const ramp = Math.min(1, (FLIP_T - f.t) / 0.3, f.t / 0.3);
          const v = FLIP_SPEED * Math.max(0, ramp);
          dX += f.dx * v; dZ += f.dz * v;
          const list = world.enemies, mx = f.dx * v * dt, mz = f.dz * v * dt;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!mobOk(e) || e.boss || e.mini || isStationary(e.kind)) continue;
            e.pos.x += mx; e.pos.z += mz;
          }
        }
      }
    }
  }
  driftX = dX; driftZ = dZ;
}
