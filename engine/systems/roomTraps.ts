// ============================================================================
// Stationary hazards and weapons of run rooms (owner request "more stationary hazards / weapons"). Every piece is telegraphed, sits clear of the
// arrival point / exits / station / each other, and the mix scales with depth (Greenwood d1-3 only gets barrels / vines):
//   BALLISTA   a siege bow on the rim: tracks you, locks a lane (orange line), then looses a fast bolt down it.
//   CATAPULT   lobs a boulder at where you WERE (circle on the floor, boulder arcs in), crushes + stuns whoever stays.
//   MAGIC TOWER charges (ring on the floor), then fires a 360 degree ring of slow orbs (the next volley is rotated: gaps shift).
//   FIRE BAR   a cross of flame (4 arms) turning round a pedestal; the hero burns when an arm sweeps over him (monsters too).
//   FIRE JET   a long straight jet that flickers (warning), blasts for ~1.5 s, rests. Burns hero and monsters.
//   VINES      a patch of rooting vines: stay on it a moment and they grab (root 1 s; a dash breaks free), then it rests.
//   FREEZE POOL frozen water: you slip on it (long glide) and chill builds up (bossFx addChill: 4 stacks freeze).
//   FIRE / FROST STATUE a stone dragon head on the rim: glowing mouth + ground strip (telegraph), then a LONG breath cone (~11.5 m, 2 s, slowly
//                sweeping) that burns (fire) or chills + slows (frost: Frostpeak / Void). Destructible like the siege weapons.
//   BOMB BARRELS clusters of explosive barrels (crates.ts EXPLOSIVE_BARREL: hit one, the chain goes off; hurts monsters AND the hero).
// Burn / poison ticks hit the hero HERO_DOT_MUL (x4, combat.ts) like every other ticking hazard: hazards here either use `env: true` ticks
// or apply BURN (whose ticks are multiplied) so the numbers stay consistent.
// All state is pooled in `rt` (no per-frame allocation); render/RoomTraps.tsx draws it.
// ============================================================================
import { world } from '../world';
import { events } from '../events';
import { useGameStore, DMG_INFLATE } from '../../store';
import type { RoomPlan } from '../types';
import { startPos, stationPos, portalSlot, shortcutSlot } from '../roomgen';
import { onBridge, feat } from '../roomFeatures';
import { queryColliders, addTempCollider, removeTempCollider, CRATE_HP, type Collider } from '../mapgen';
import { insideShape, shape } from '../roomShape';
import { hallsRandomSpot, hallsSdf, halls } from '../roomHalls';
import { damagePlayer, applyPlayerDebuff, applyStatus, addShake, type StatusEffect } from './combat';
import { spawnPickup } from './pickups';
import { spawnTelegraphCircle, spawnTelegraphLine, fireEnemyProjectile } from './enemies';
import { BT, addChill } from './bossFx';
import { hz } from './biomeHazards';
import { Vector3 } from 'three';

export const TRAP = { SIEGE: 0, TOWER: 1, BAR: 2, JET: 3, VINE: 4, POOL: 5, BARREL: 6, STATUE: 7 } as const;
const NKIND = 8;
const BALLISTA_WIND = 1.35, CATAPULT_WIND = 2.0, TOWER_WIND = 1.25, FLIGHT = 1.0;

export const rt = {
  on: false, ver: 0,
  nSiege: 0, siege: Array.from({ length: 6 }, () => ({ kind: 0, x: 0, z: 0, yaw: 0, state: 0, t: 0, cd: 0, lx: 0, lz: 0, locked: false, fired: false, tier: 0, hp: 1, maxHp: 1, dead: false, col: null as Collider | null, rad: 1.7, flash: 0, hitSeq: 0 })),
  nTower: 0, tower: Array.from({ length: 3 }, () => ({ x: 0, z: 0, state: 0, t: 0, cd: 0, a0: 0, volley: 0, glow: 0, tier: 0, hp: 1, maxHp: 1, dead: false, col: null as Collider | null, rad: 1.4, flash: 0, hitSeq: 0 })),
  nStatue: 0, statue: Array.from({ length: 3 }, () => ({ x: 0, z: 0, yaw: 0, state: 0, t: 0, cd: 0, kind: 0, tier: 0, lock: 0, sw: 1, tick: 0, acc: 0, glow: 0, hp: 1, maxHp: 1, dead: false, col: null as Collider | null, rad: 1.5, flash: 0, hitSeq: 0 })),
  nBar: 0, bar: Array.from({ length: 3 }, () => ({ x: 0, z: 0, a: 0, w: 1, len: 6.5, hitCd: 0, tick: 0 })),
  /** HALLS only: a pillar that sends ONE very long (8 - 12 m) flame beam round: idle -> telegraph (floor line) -> rotating blaze -> rest */
  nBeam: 0, beam: Array.from({ length: 3 }, () => ({ x: 0, z: 0, a: 0, w: 0.5, len: 10, state: 0, t: 0, off: 3, hitCd: 0, tick: 0 })),
  nJet: 0, jet: Array.from({ length: 5 }, () => ({ x: 0, z: 0, ang: 0, len: 13, state: 0, t: 0, off: 4, tick: 0 })),
  nVine: 0, vine: Array.from({ length: 5 }, () => ({ x: 0, z: 0, r: 2.2, state: 0, t: 0, touch: 0, seed: 0 })),
  nPool: 0, pool: Array.from({ length: 4 }, () => ({ x: 0, z: 0, r: 2.8, acc: 0 })),
  /** boulders in flight (catapult): drawn by the renderer, the damage is the floor circle's */
  boulders: Array.from({ length: 6 }, () => ({ on: false, sx: 0, sz: 0, tx: 0, tz: 0, t: 0, T: 1 })),
};
/** Movement modifiers read by biomeHazards.ts (combined with its own ice / bramble numbers). */
export const trapMods = { grip: 1, slow: 1 };
/** Breath statue numbers: telegraph 1.4 s, breath 2.0 s sweeping ~0.5 rad, reach 11.5 m from the mouth, ticks every 0.4 s. */
export const STATUE_WARN = 1.4, STATUE_ON = 2.0, STATUE_LEN = 17.25, STATUE_SWEEP = 0.5, STATUE_MOUTH = 1.7, STATUE_TICK = 0.4, FIRE_TICK = 0.25;
/** Current beam heading: the locked lane, swept across STATUE_SWEEP radians during the breath. */
export const statueBeamYaw = (q: { lock: number; sw: number; t: number }): number => q.lock + q.sw * STATUE_SWEEP * (q.t / STATUE_ON - 0.5);
/** Is (px, pz) inside the breath cone (narrow at the mouth, ~1.5 m half-width at the end)? */
function coneHit(q: { x: number; z: number; yaw: number }, px: number, pz: number, extra: number): boolean {
  const dx = px - q.x, dz = pz - q.z, ux = Math.sin(q.yaw), uz = Math.cos(q.yaw);
  const along = dx * ux + dz * uz - STATUE_MOUTH;
  if (along < -0.3 || along > STATUE_LEN) return false;
  return Math.abs(dx * uz - dz * ux) < 0.55 + 0.95 * Math.max(0, along) / STATUE_LEN + extra;
}
export const BEAM_WARN = 1.5, BEAM_ON = 6.0;
export const JET_WARN = 1.0, JET_ON = 1.5, VINE_REST = 4.5, BAR_LEN = 6.5, TOWER_WIND_T = TOWER_WIND, CATAPULT_WIND_T = CATAPULT_WIND, BOULDER_FLIGHT = FLIGHT;
const POOL_GRIP = 0.16;
/** (owner) at most this many stationaries of the room's one kind */
const MAX_PIECES = 3;
/** (owner) siege weapons and magic towers can be destroyed: HP = this many of the hero's average hits, a little more deeper in */
const SIEGE_HP_HITS = 9, TOWER_HP_HITS = 12, STATUE_HP_HITS = 10;
const trapHp = (hits: number, depth: number): number => Math.max(30, useGameStore.getState().stats.damage * hits * (1 + 0.02 * depth));
/** A destroyable stationary (siege weapon / magic tower / breath statue). */
export interface TrapObj { x: number; z: number; rad: number; hp: number; maxHp: number; dead: boolean; col: Collider | null; flash: number; hitSeq: number }
/** The stationary the hero is aiming at (auto-target pick, written by player.ts) and the click-locked one (target.ts clearTarget clears it). */
export const trapAim = { obj: null as TrapObj | null };
export const trapLock = { obj: null as TrapObj | null };
let curDepth = 0;
export const lockedTrap = (): TrapObj | null => { const o = trapLock.obj; return o && !o.dead && rt.on && world.room.active ? o : null; };
/** i-th live-or-dead stationary across the three pools (no allocation). */
const trapAt = (i: number): TrapObj => i < rt.nSiege ? rt.siege[i] : i < rt.nSiege + rt.nTower ? rt.tower[i - rt.nSiege] : rt.statue[i - rt.nSiege - rt.nTower];
export const trapCount = (): number => rt.nSiege + rt.nTower + rt.nStatue;
/** Distance from (x,z) to the surface of a piece. */
export const trapDist = (o: TrapObj, x: number, z: number): number => Math.hypot(o.x - x, o.z - z) - o.rad;
/** Nearest live stationary whose surface is within maxR of (x,z). */
export function nearestTrap(x: number, z: number, maxR: number, skip?: readonly TrapObj[]): TrapObj | null {
  if (!rt.on || !world.room.active) return null;
  let best: TrapObj | null = null, bd = maxR;
  for (let i = 0, n = trapCount(); i < n; i++) {
    const o = trapAt(i);
    if (o.dead || (skip && skip.indexOf(o) !== -1)) continue;
    const d = trapDist(o, x, z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/** Click pick: a live piece whose body is under the ground point (+ a little slack). */
export function pickTrapAt(x: number, z: number): TrapObj | null {
  if (!rt.on || !world.room.active) return null;
  let best: TrapObj | null = null, bd = 1.4;
  for (let i = 0, n = trapCount(); i < n; i++) {
    const o = trapAt(i);
    if (o.dead) continue;
    const d = Math.hypot(o.x - x, o.z - z) - o.rad;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/** Destroyed: collider gone, blast, rubble (renderer), a little gold + xp. */
function breakPiece(o: TrapObj): void {
  o.dead = true; o.hp = 0;
  if (o.col) { removeTempCollider(o.col); o.col = null; }
  if (trapAim.obj === o) trapAim.obj = null;
  if (trapLock.obj === o) trapLock.obj = null;
  events.emit('explosion', { pos: new Vector3(o.x, 1, o.z), radius: 3.4, color: 0xffb060 });
  events.emit('floatText', { pos: tmp.set(o.x, 3.4, o.z), text: 'DESTROYED!', color: 0xffe08a, scale: 1.1, dy: 1.6 });
  addShake(0.32);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * 6.283 + o.x;
    tmp.set(o.x + Math.cos(a) * 1.6, 0, o.z + Math.sin(a) * 1.6);
    spawnPickup('GOLD', tmp, 8 + curDepth * 0.3);
  }
  tmp.set(o.x, 0, o.z);
  spawnPickup('XP', tmp, 12 + curDepth * 1.2);
}
const hitOne = (o: TrapObj, x: number, z: number, r: number, dmg: number): boolean => {
  if (o.dead || (o.x - x) ** 2 + (o.z - z) ** 2 > (r + o.rad) ** 2) return false;
  o.hp -= dmg; o.flash = 1; o.hitSeq++;
  events.emit('floatText', { pos: tmp.set(o.x, 3, o.z), text: String(Math.round(dmg)), color: 0xffffff, scale: 0.8, dy: 1.2 });
  if (o.hp <= 0) breakPiece(o);
  return true;
};
/** (owner) the hero's attacks / skills damage siege weapons, magic towers and breath statues. True if something was hit. */
export function hitRoomTraps(x: number, z: number, r: number, dmg: number): boolean {
  if (!rt.on) return false;
  let hit = false;
  for (let i = 0, n = trapCount(); i < n; i++) hit = hitOne(trapAt(i), x, z, r, dmg) || hit;
  return hit;
}
/** Single-target hit on one stationary (chain / bounce jumps, minion strikes, orb zaps). True if it took the hit. */
export function damageTrap(o: TrapObj, dmg: number): boolean {
  return rt.on && hitOne(o, o.x, o.z, 0, dmg);
}
/** Expanding ring pulse: hits every stationary whose body overlaps the band |dist - r| <= band. */
export function hitRoomTrapsRing(x: number, z: number, r: number, band: number, dmg: number): boolean {
  if (!rt.on) return false;
  let hit = false;
  for (let i = 0, n = trapCount(); i < n; i++) {
    const o = trapAt(i);
    if (o.dead || Math.abs(Math.hypot(o.x - x, o.z - z) - r) > band + o.rad) continue;
    hit = hitOne(o, o.x, o.z, 0, dmg) || hit;
  }
  return hit;
}
/** QA: force these hazard kinds (TRAP.*) into the next room, and the siege weapon kind (0 ballista / 1 catapult). */
export const dbgTraps = { force: null as number[] | null, siege: -1, depth: -1, noObs: false, statue: -1 /* 0 fire, 1 frost */ };

const tmp = new Vector3(), tmpD = new Vector3();
const colOut: Collider[] = [];
const ids: number[] = [];
const burn: StatusEffect = { type: 'BURN', duration: 2.2, value: 5 };
const chillMob: StatusEffect = { type: 'SLOW', duration: 1.6, value: 0.55 };
const maxHp = () => useGameStore.getState().stats.maxHealth;
/** Hazard strength by depth (index through the whole run: biome * 15 + room): +1.1% per room, capped. */
let scale = 1;
const dmgOf = (pct: number): number => maxHp() * pct * scale / DMG_INFLATE;

// ------------------------------------------------------------------ placement --
const kx: number[] = [], kz: number[] = [], kr: number[] = [];
const keep = (x: number, z: number, r: number): void => { kx.push(x); kz.push(z); kr.push(r); };
const out: [number, number] = [0, 0];
/** Marble Halls pockets: when set, spot() samples within near[2] m of (near[0], near[1]) instead of anywhere on the floor. */
let near: [number, number, number] | null = null;
/** Marble Halls: siege weapons reach across a whole hall (fire range, bolt life, lane length). */
let siegeLong = false;
/** HALLS: when < 99, spot() only accepts floor within this many m of the wall (statues / edge siege weapons hug the walls). */
let wallD = 99;
const SIEGE_RANGE = 42, SIEGE_RANGE_LONG = 95;
/** A free floor spot for a disc of `rad` between rimMin..rimMax (fractions of the room radius; turrets hug the rim). */
function spot(rad: number, pad = 0.6, rimMin = 0, rimMax = 0.9, awayFromStart = 0): boolean {
  const R = world.room.radius, H = shape.kind === 'HALLS';
  for (let t = 0; t < (H ? 400 : 160); t++) {
    let x: number, z: number;
    if (H && near) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * near[2]; x = near[0] + Math.cos(a) * d; z = near[1] + Math.sin(a) * d; if (hallsSdf(x, z) < rad + 2.5) continue; }
    else if (H) { if (!hallsRandomSpot(rad + 2.0, out)) return false; x = out[0]; z = out[1]; }   // (HALLS: anywhere on the open floor; the rim fractions mean nothing)
    else { const a = Math.random() * Math.PI * 2, d = (rimMin + Math.random() * (rimMax - rimMin)) * R; x = Math.cos(a) * d; z = Math.sin(a) * d; }
    if (H && wallD < 99 && hallsSdf(x, z) > wallD) continue;
    if (!insideShape(x, z, rad + 2.0) || onBridge(x, z, rad + 1)) continue;   // (bridge decks stay clear)
    let ok = true;
    for (let k = 0; k < kx.length && ok; k++) if (Math.hypot(x - kx[k], z - kz[k]) < kr[k] + rad + pad) ok = false;
    if (!ok) continue;
    if (awayFromStart > 0 && Math.hypot(x - kx[0], z - kz[0]) < awayFromStart) continue;
    queryColliders(x, z, rad + 1.5, colOut);
    for (let k = 0; k < colOut.length; k++) if (Math.hypot(colOut[k].x - x, colOut[k].z - z) < colOut[k].r + rad) { ok = false; break; }
    if (!ok) continue;
    const ob = dbgTraps.noObs ? [] : world.obstacles;   // (decor props that are not colliders, e.g. statues)
    for (let k = 0; k < ob.length; k++) if (Math.hypot(ob[k].pos.x - x, ob[k].pos.z - z) < ob[k].radius + rad) { ok = false; break; }
    if (!ok) continue;
    out[0] = x; out[1] = z;
    return true;
  }
  return false;
}

/** Room entry (director.enterRoom, after setupBiomeHazards). biome: 0 Greenwood, 1 Marble, 2 Desert, 3 Swamp, 4 Frost, 5 Ember, 6 Void; idx: room 0..14. */
export function setupRoomTraps(biome: number, plan: RoomPlan, idx: number): void {
  rt.on = false; rt.nSiege = rt.nTower = rt.nStatue = rt.nBar = rt.nBeam = rt.nJet = rt.nVine = rt.nPool = 0;
  trapAim.obj = null; trapLock.obj = null;
  for (const b of rt.boulders) b.on = false;
  trapMods.grip = 1; trapMods.slow = 1;
  rt.ver++;
  if ((plan.type !== 'COMBAT' && plan.type !== 'ELITE') || plan.gate !== undefined || plan.shortcut || plan.epilogue || plan.dream) return;
  const b = ((biome % 7) + 7) % 7, depth = dbgTraps.depth >= 0 ? dbgTraps.depth : biome * 15 + idx, elite = plan.type === 'ELITE';
  scale = Math.min(1.45, 0.82 + 0.011 * depth); curDepth = depth;
  const R = world.room.radius;
  kx.length = kz.length = kr.length = 0;
  const [sx0, sz0] = startPos(R), [stx, stz] = stationPos(R);
  keep(sx0, sz0, 8.5); keep(stx, stz, 4.5);
  const po: [number, number] = [0, 0];
  for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); keep(po[0], po[1], 4.2); }
  for (let i = 0; i < 2; i++) { portalSlot(i, 2, R, po); keep(po[0], po[1], 4.2); }
  shortcutSlot(po); keep(po[0], po[1], 4);
  for (let i = 0; i < hz.nBr; i++) keep(hz.br[i].x, hz.br[i].z, hz.br[i].r + 0.5);   // (biome hazards were placed first)
  for (let i = 0; i < hz.nMu; i++) keep(hz.mu[i].x, hz.mu[i].z, 1.5);
  for (let i = 0; i < hz.nIce; i++) keep(hz.ice[i].x, hz.ice[i].z, hz.ice[i].r * 0.5);
  for (let i = 0; i < hz.nRift; i++) keep(hz.rift[i].x, hz.rift[i].z, 4);
  for (const c of world.crates) if (c.active) keep(c.pos.x, c.pos.z, 0.9);
  if (feat.pChest.on) keep(feat.pChest.x, feat.pChest.z, 4);
  for (let i = 0; i < feat.nTowers; i++) keep(feat.tx[i], feat.tz[i], 3.5);

  const rnd = Math.random, early = b === 0 && idx < 3;
  // ---- candidate hazard kinds with a weight (0 = not in this biome / depth yet)
  const w: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  w[TRAP.BARREL] = idx >= 2 ? 30 : 0;
  w[TRAP.VINE] = 0;   // (owner 2026-10-24: the grabbing snare plant is gone everywhere)
  w[TRAP.POOL] = b === 4 ? 40 : b >= 2 ? 8 : 0;
  const marbleH = b === 1 && shape.kind === 'HALLS';
  siegeLong = marbleH; near = null;
  w[TRAP.SIEGE] = marbleH ? 0 : b === 0 ? (idx >= 5 ? 12 : 0) : 14 + 3 * b;   // (Marble Halls gets its own siege placement below)
  w[TRAP.TOWER] = b === 0 ? (idx >= 6 ? 8 : 0) : b === 6 ? 40 : 8 + 3 * b;
  w[TRAP.BAR] = b === 0 || (b === 1 && idx < 6) ? 0 : b === 5 ? 38 : 8 + 2 * b;
  w[TRAP.JET] = b <= 1 ? 0 : b === 5 ? 34 : 7 + 2 * b;
  // (owner) breath statues on the rim: Ember Wastes most, Desert / Frostpeak (frost variant) / Void next, Greenwood rarely and only from room 5
  w[TRAP.STATUE] = b === 0 ? (idx >= 5 ? 5 : 0) : b === 1 ? 8 : b === 2 ? 26 : b === 3 ? 12 : b === 4 ? 26 : b === 5 ? 38 : 22;
  if (b === 2) { w[TRAP.SIEGE] = 0; w[TRAP.TOWER] = 34; }   // (owner 2026-10-24) Sunscorch Desert: magic towers, never ballistas
  if (b === 0 || b === 3 || b === 6) w[TRAP.SIEGE] = w[TRAP.TOWER] = w[TRAP.STATUE] = w[TRAP.BAR] = w[TRAP.JET] = 0;   // (owner 2026-10-24) Greenwood: no stationaries but its goblin archer towers; Coral Isles: none at all (its lake hydras are the danger)
  const wS = w.slice();   // (the stationary weights, kept for the HALLS mix below)
  if (shape.kind === 'HALLS') w[TRAP.SIEGE] = w[TRAP.TOWER] = w[TRAP.STATUE] = w[TRAP.BAR] = w[TRAP.JET] = 0;   // (HALLS: the stationaries come as one planned mix below)
  // (owner) most rooms have no stationaries; a room that has them gets ONE kind, at most 3 pieces
  const n = dbgTraps.force ? 1 : rnd() < (early ? 0.15 : elite ? 0.5 : 0.3) ? 1 : 0;
  const picked: number[] = dbgTraps.force ? dbgTraps.force.slice() : [];
  for (let k = 0; k < n && !dbgTraps.force; k++) {
    let tot = 0; for (let i = 0; i < NKIND; i++) if (!picked.includes(i)) tot += w[i];
    if (tot <= 0) break;
    let r = rnd() * tot, pick = -1;
    for (let i = 0; i < NKIND; i++) { if (picked.includes(i)) continue; r -= w[i]; if (r <= 0) { pick = i; break; } }
    if (pick < 0) break;
    picked.push(pick);
  }
  const more = depth >= 30 ? 2 : depth >= 14 ? 1 : 0;
  for (const kind of picked) {
    if (kind === TRAP.SIEGE) {
      const cnt = Math.min(MAX_PIECES, 2 + (more > 0 && rnd() < 0.5 ? 1 : 0));   // (owner) 2-3 of the same kind
      for (let i = 0; i < cnt && rt.nSiege < rt.siege.length; i++) {
        if (!spot(1.7, 1.2, 0.72, 0.9, 16)) continue;
        const s = rt.siege[rt.nSiege++];
        s.kind = dbgTraps.siege >= 0 ? dbgTraps.siege : 0;   // ballista only (owner: catapults removed from the game)
        s.x = out[0]; s.z = out[1]; s.yaw = Math.atan2(-out[0], -out[1]); s.state = 0; s.t = 0; s.cd = 4 + rnd() * 3 + i * 2.5; s.locked = false; s.fired = false; s.tier = more;
        s.maxHp = s.hp = trapHp(SIEGE_HP_HITS, depth); s.dead = false; s.flash = 0; s.hitSeq = 0;
        keep(s.x, s.z, 3.2); s.col = addTempCollider(s.x, s.z, 1.7, false);
      }
    } else if (kind === TRAP.STATUE) {
      const cnt = Math.min(MAX_PIECES, 2 + (more > 0 && rnd() < 0.4 ? 1 : 0));
      for (let i = 0; i < cnt && rt.nStatue < rt.statue.length; i++) {
        if (!spot(1.5, 1.2, 0.74, 0.9, 14) && !spot(1.5, 0.8, 0.55, 0.92, 10)) continue;   // on the sides, near the wall, facing inward like the siege weapons
        const q = rt.statue[rt.nStatue++];
        q.kind = dbgTraps.statue >= 0 ? dbgTraps.statue : b === 4 ? 1 : b === 6 ? (rnd() < 0.5 ? 1 : 0) : 0;   // 0 fire, 1 frost
        q.x = out[0]; q.z = out[1]; q.yaw = Math.atan2(-out[0], -out[1]); q.state = 0; q.t = 0; q.cd = 4.5 + rnd() * 3 + i * 2.5; q.tier = more; q.lock = q.yaw; q.sw = 1; q.tick = 0; q.acc = 0; q.glow = 0;
        q.maxHp = q.hp = trapHp(STATUE_HP_HITS, depth); q.dead = false; q.flash = 0; q.hitSeq = 0;
        keep(q.x, q.z, 3.2); q.col = addTempCollider(q.x, q.z, 1.5, false);
      }
    } else if (kind === TRAP.TOWER) {
      const cnt = Math.min(MAX_PIECES, 2 + (more > 0 && rnd() < 0.4 ? 1 : 0));
      for (let i = 0; i < cnt && rt.nTower < rt.tower.length; i++) {
        if (!spot(1.5, 1.2, 0.0, 0.42, 10) && !spot(1.5, 1.2, 0.0, 0.6, 10)) continue;   // (owner) towers stand mostly in the middle
        const t = rt.tower[rt.nTower++];
        t.x = out[0]; t.z = out[1]; t.state = 0; t.t = 0; t.cd = 4.5 + rnd() * 3 + i * 2; t.a0 = rnd() * 6.28; t.volley = 0; t.glow = 0; t.tier = more + (b === 6 ? 1 : 0);
        t.maxHp = t.hp = trapHp(TOWER_HP_HITS, depth); t.dead = false; t.flash = 0; t.hitSeq = 0;
        keep(t.x, t.z, 4); t.col = addTempCollider(t.x, t.z, 1.3, false);
      }
    } else if (kind === TRAP.BAR) {
      const cnt = 1 + (more > 0 && rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < cnt && rt.nBar < rt.bar.length; i++) {
        if (!spot(BAR_LEN * 0.62, 0.6, 0.0, 0.6, 6)) continue;
        const bar = rt.bar[rt.nBar++];
        bar.x = out[0]; bar.z = out[1]; bar.a = rnd() * 6.28; bar.w = (rnd() < 0.5 ? -1 : 1) * (0.62 + 0.09 * Math.min(4, depth / 8)); bar.len = BAR_LEN; bar.hitCd = 0; bar.tick = 0;
        keep(bar.x, bar.z, BAR_LEN * 0.62); addTempCollider(bar.x, bar.z, 1.0, false);
      }
    } else if (kind === TRAP.JET) {
      const cnt = 1 + (more > 0 && rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < cnt && rt.nJet < rt.jet.length; i++) {
        if (!spot(2.0, 0.8, 0.1, 0.8, 8)) continue;
        const j = rt.jet[rt.nJet++];
        j.x = out[0]; j.z = out[1]; j.ang = rnd() * 6.28; j.len = (12 + rnd() * 3) * 1.5; j.state = 0; j.off = 1.6 + rnd() * 0.8; j.tick = 0;
        j.t = -(rnd() * 2.5);   // staggered start
        keep(j.x, j.z, 3); addTempCollider(j.x, j.z, 1.1, false);
      }
    } else if (kind === TRAP.VINE) {
      const cnt = Math.min(MAX_PIECES, 2 + Math.floor(rnd() * 2) + (more > 0 ? 1 : 0));
      for (let i = 0; i < cnt && rt.nVine < rt.vine.length; i++) {
        const r = 2.0 + rnd() * 0.5;
        if (!spot(r, 0.6, 0, 0.88, 0)) continue;
        const v = rt.vine[rt.nVine++];
        v.x = out[0]; v.z = out[1]; v.r = r; v.state = 0; v.t = 0; v.touch = 0; v.seed = rnd() * 10;
        keep(v.x, v.z, r);
      }
    } else if (kind === TRAP.POOL) {
      const cnt = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < cnt && rt.nPool < rt.pool.length; i++) {
        const r = 2.6 + rnd() * 1.4;
        if (!spot(r * 0.8, 0.5, 0, 0.85, 0)) continue;
        const p = rt.pool[rt.nPool++];
        p.x = out[0]; p.z = out[1]; p.r = r; p.acc = 0;
        keep(p.x, p.z, r * 0.9);
      }
    } else if (kind === TRAP.BARREL) {
      const clusters = 1 + (more > 0 ? 1 : 0);
      for (let i = 0; i < clusters; i++) {
        if (!spot(2.6, 0.8, 0, 0.85, 0)) continue;
        const cx = out[0], cz = out[1], cnt = 3 + (rnd() < 0.4 ? 1 : 0), a0 = rnd() * 6.28;
        for (let k = 0; k < cnt; k++) {
          const slot = world.crates.find((c) => !c.active && c.respawnT <= 0);
          if (!slot) break;
          const a = a0 + (k / cnt) * 6.28;
          slot.kind = 'EXPLOSIVE_BARREL'; slot.pos.set(cx + Math.cos(a) * 1.5, 0, cz + Math.sin(a) * 1.5);
          slot.maxHp = slot.hp = CRATE_HP.EXPLOSIVE_BARREL; slot.rot = rnd() * 6.28; slot.hitFlash = 0; slot.active = true;
        }
        keep(cx, cz, 2.8);
      }
    }
  }
  // ---- (owner) HALLS rooms: the stationaries come as ONE planned mix, never more than 4: a main kind x2-3, plus 1-2 of other kinds
  // (2 ballista + 2 fire breath, 3 fire breath + 1 ballista, 2 ballista + 1 fire breath + 1 rotating beam ...). Marble Halls: no goblin towers;
  // ballistas sit in the dead-end pockets / along the hall edges and shoot across a whole hall. No catapults anywhere any more.
  if (shape.kind === 'HALLS' && (plan.type === 'COMBAT' || elite) && b !== 0 && b !== 3 && b !== 6 && !dbgTraps.force && (marbleH || rnd() < 0.75)) {
    const pool: number[] = [];   // TRAP.* kinds this room may use (TRAP.BAR slot stands for the rotating flame beam here)
    if (marbleH ? true : wS[TRAP.SIEGE] > 0) pool.push(TRAP.SIEGE);
    if (marbleH ? true : wS[TRAP.STATUE] > 0) pool.push(TRAP.STATUE);
    if (!marbleH && wS[TRAP.TOWER] > 0) pool.push(TRAP.TOWER);
    pool.push(TRAP.BAR, TRAP.JET);
    const take = (): number => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const mix: [number, number][] = [];
    const mainN = rnd() < 0.5 ? 2 : 3;
    mix.push([b === 2 && pool.includes(TRAP.TOWER) ? pool.splice(pool.indexOf(TRAP.TOWER), 1)[0] : take(), mainN]);   // (owner: the desert always has its magic towers)
    if (mainN === 3) { if (rnd() < 0.7) mix.push([take(), 1]); }
    else if (rnd() < 0.5) mix.push([take(), 2]);
    else { mix.push([take(), 1]); if (pool.length && rnd() < 0.5) mix.push([take(), 1]); }
    let pk = 0;
    for (const [kind, cnt] of mix) for (let i = 0; i < cnt; i++) {
      if (kind === TRAP.SIEGE) {
        if (rt.nSiege >= rt.siege.length) continue;
        let ok = false;
        if (marbleH && pk < halls.pockets.length) { const p = halls.pockets[pk++]; near = [p[0], p[1], 6]; ok = spot(1.7, 1.2, 0, 1, 14); near = null; }
        if (!ok) { wallD = 8; ok = spot(1.7, 1.2, 0, 1, 14); wallD = 99; }
        if (!ok) continue;
        const s = rt.siege[rt.nSiege++];
        s.kind = dbgTraps.siege >= 0 ? dbgTraps.siege : 0;
        s.x = out[0]; s.z = out[1]; s.yaw = Math.atan2(-out[0], -out[1]); s.state = 0; s.t = 0; s.cd = 4 + rnd() * 3 + rt.nSiege * 1.5; s.locked = false; s.fired = false; s.tier = more;
        s.maxHp = s.hp = trapHp(SIEGE_HP_HITS, depth); s.dead = false; s.flash = 0; s.hitSeq = 0;
        keep(s.x, s.z, 3.2); s.col = addTempCollider(s.x, s.z, 1.7, false);
      } else if (kind === TRAP.STATUE) {
        if (rt.nStatue >= rt.statue.length) continue;
        wallD = 8; const ok = spot(1.5, 1.2, 0, 1, 14); wallD = 99;
        if (!ok) continue;
        const q = rt.statue[rt.nStatue++];
        q.kind = dbgTraps.statue >= 0 ? dbgTraps.statue : b === 4 ? 1 : b === 6 ? (rnd() < 0.5 ? 1 : 0) : 0;
        q.x = out[0]; q.z = out[1]; q.yaw = Math.atan2(-out[0], -out[1]); q.state = 0; q.t = 0; q.cd = 4.5 + rnd() * 3 + i * 2.5; q.tier = more; q.lock = q.yaw; q.sw = 1; q.tick = 0; q.acc = 0; q.glow = 0;
        q.maxHp = q.hp = trapHp(STATUE_HP_HITS, depth); q.dead = false; q.flash = 0; q.hitSeq = 0;
        keep(q.x, q.z, 3.2); q.col = addTempCollider(q.x, q.z, 1.5, false);
      } else if (kind === TRAP.TOWER) {
        if (rt.nTower >= rt.tower.length || !spot(1.5, 1.2, 0, 1, 10)) continue;
        const t = rt.tower[rt.nTower++];
        t.x = out[0]; t.z = out[1]; t.state = 0; t.t = 0; t.cd = 4.5 + rnd() * 3 + i * 2; t.a0 = rnd() * 6.28; t.volley = 0; t.glow = 0; t.tier = more + (b === 6 ? 1 : 0);
        t.maxHp = t.hp = trapHp(TOWER_HP_HITS, depth); t.dead = false; t.flash = 0; t.hitSeq = 0;
        keep(t.x, t.z, 4); t.col = addTempCollider(t.x, t.z, 1.3, false);
      } else if (kind === TRAP.JET) {
        if (rt.nJet >= rt.jet.length || !spot(2.0, 0.8, 0, 1, 10)) continue;
        const j = rt.jet[rt.nJet++];
        j.x = out[0]; j.z = out[1]; j.ang = rnd() * 6.28; j.len = (10 + rnd() * 3) * 1.5; j.state = 0; j.off = 1.6 + rnd() * 0.8; j.tick = 0; j.t = -(rnd() * 2.5);
        keep(j.x, j.z, 3); addTempCollider(j.x, j.z, 1.1, false);
      } else {   // rotating flame beam
        if (rt.nBeam >= rt.beam.length) continue;
        const len = 8 + rnd() * 4;
        let got = false;   // a roomy spot (the arm reaches ~len m): the pillar's disc is small, the open floor round it is checked here
        for (let t = 0; t < 30 && !got; t++) if (spot(2.4, 1.0, 0, 1, 16) && hallsSdf(out[0], out[1]) >= len * 0.42) got = true;
        if (!got) continue;
        const m = rt.beam[rt.nBeam++];
        m.x = out[0]; m.z = out[1]; m.a = rnd() * 6.28; m.w = (rnd() < 0.5 ? -1 : 1) * (0.42 + 0.05 * Math.min(4, depth / 10)); m.len = len;
        m.state = 0; m.t = 0; m.off = 0.8 + rnd() * 1.2; m.hitCd = 0; m.tick = 0;
        keep(m.x, m.z, 5); addTempCollider(m.x, m.z, 1.1, false);
      }
    }
  }
  rt.on = rt.nSiege + rt.nTower + rt.nStatue + rt.nBar + rt.nBeam + rt.nJet + rt.nVine + rt.nPool > 0;
}

// ---------------------------------------------------------------------- tick --
const mobOk = (e: { active: boolean; state: string }): boolean => e.active && e.state !== 'DYING' && e.state !== 'SPAWN';
const wrapPi = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Perpendicular distance from (px, pz) to the arm from (x, z) of length `len` at angle `a` (0 = +z); 99 beyond its ends. */
function armDist(px: number, pz: number, x: number, z: number, a: number, len: number): number {
  const dx = px - x, dz = pz - z, ux = Math.sin(a), uz = Math.cos(a);
  const along = dx * ux + dz * uz;
  if (along < -0.6 || along > len + 0.4) return 99;
  return Math.abs(dx * uz - dz * ux);
}

export function updateRoomTraps(dt: number): void {
  const room = world.room;
  trapMods.grip = 1; trapMods.slow = 1;
  if (!room.active || !rt.on) return;
  const pl = world.player, alive = pl.alive, px = pl.pos.x, pz = pl.pos.z;
  const fighting = world.director.phase === 'FIGHT';

  for (let i = 0, n = trapCount(); i < n; i++) { const o = trapAt(i); if (o.flash > 0) o.flash = Math.max(0, o.flash - dt * 5); }

  // ---- siege weapons
  for (let i = 0; i < rt.nSiege; i++) {
    const s = rt.siege[i];
    if (s.dead) continue;
    const W = s.kind === 0 ? BALLISTA_WIND : CATAPULT_WIND;
    if (s.state === 0) {
      const dx = px - s.x, dz = pz - s.z, d = Math.hypot(dx, dz);
      if (d > 2) s.yaw += wrapPi(Math.atan2(dx, dz) - s.yaw) * Math.min(1, dt * 2.4);   // idles, slowly turning to face you
      if (!fighting || !alive) { s.cd = Math.max(s.cd, 1.5); continue; }
      s.cd -= dt;
      if (s.cd <= 0 && d > 9 && d < (siegeLong ? SIEGE_RANGE_LONG : SIEGE_RANGE)) { s.state = 1; s.t = 0; s.locked = false; s.fired = false; }
    } else if (s.state === 1) {
      s.t += dt;
      if (!fighting || !alive) { s.state = 0; s.cd = 3; continue; }
      if (s.kind === 0) {   // ballista: tracks you, locks the lane at 45%, fires at the end
        if (!s.locked) {
          s.yaw += wrapPi(Math.atan2(px - s.x, pz - s.z) - s.yaw) * Math.min(1, dt * 7);
          if (s.t >= W * 0.45) {
            s.locked = true; s.lx = Math.sin(s.yaw); s.lz = Math.cos(s.yaw);
            const zn = spawnTelegraphLine(s.x + s.lx * 1.5, s.z + s.lz * 1.5, s.lx, s.lz, siegeLong ? 90 : 48, 1.4, W * 0.55, 0xffa040);
            if (zn) zn.trick = BT.VISUAL;
          }
        }
        if (s.t >= W) {
          tmp.set(s.x + s.lx * 1.8, 1.3, s.z + s.lz * 1.8); tmpD.set(s.lx, 0, s.lz);
          fireEnemyProjectile(tmp, tmpD, 'BALLISTA', 31, dmgOf(0.1), { life: siegeLong ? 3.4 : 2.0, radius: 0.55 });
          events.emit('shake', { amount: 0.12 });
          s.state = 2; s.t = 0;
        }
      } else {   // catapult: locks where you ARE a moment into the wind-up (you have ~1.7 s to leave), then the boulder arcs in
        if (!s.locked && s.t >= 0.25) {
          s.locked = true;
          s.lx = px + pl.vel.x * 0.25; s.lz = pz + pl.vel.z * 0.25;
          spawnTelegraphCircle(s.lx, s.lz, 2.9, W - 0.25, dmgOf(0.12), 0xff9a50);
        }
        const tx = s.locked ? s.lx : px, tz = s.locked ? s.lz : pz;
        s.yaw += wrapPi(Math.atan2(tx - s.x, tz - s.z) - s.yaw) * Math.min(1, dt * 5);
        if (s.locked && !s.fired && s.t >= W - FLIGHT) {   // the boulder leaves the bucket
          s.fired = true;
          const bo = rt.boulders.find((q) => !q.on);
          if (bo) { bo.on = true; bo.sx = s.x; bo.sz = s.z; bo.tx = s.lx; bo.tz = s.lz; bo.t = 0; bo.T = FLIGHT; }
          events.emit('shake', { amount: 0.1 });
        }
        if (s.t >= W) { s.state = 2; s.t = 0; addShake(0.3); stunNear(s.lx, s.lz, 2.9, 0.5); }
      }
    } else {   // recoil, then the next cooldown
      s.t += dt;
      if (s.t >= 0.7) { s.state = 0; s.cd = (s.kind === 0 ? 5.2 : 6.2) * (1 - 0.06 * s.tier) * (0.85 + Math.random() * 0.4); }
    }
  }
  for (const b of rt.boulders) if (b.on) { b.t += dt; if (b.t >= b.T) b.on = false; }

  // ---- magic towers: charge, ring of orbs, (a second rotated ring deeper in)
  for (let i = 0; i < rt.nTower; i++) {
    const m = rt.tower[i];
    if (m.dead) continue;
    m.glow = Math.max(0, m.glow - dt * 2);
    if (m.state === 0) {
      if (!fighting || !alive) { m.cd = Math.max(m.cd, 1.5); continue; }
      m.cd -= dt;
      if (m.cd <= 0 && Math.hypot(px - m.x, pz - m.z) < 40) {
        m.state = 1; m.t = 0;
        const zn = spawnTelegraphCircle(m.x, m.z, 3.4, TOWER_WIND, 0, 0xc080ff); if (zn) zn.trick = BT.VISUAL;
      }
    } else if (m.state === 1) {
      m.t += dt; m.glow = Math.min(1, m.t / TOWER_WIND);
      if (!fighting || !alive) { m.state = 0; m.cd = 3; continue; }
      if (m.t >= TOWER_WIND) { towerRing(m); m.volley = 1; m.state = 2; m.t = 0; }
    } else {
      m.t += dt;
      if (m.volley === 1 && m.tier >= 2 && m.t >= 0.55) { towerRing(m); m.volley = 2; }
      if (m.t >= 0.9) { m.state = 0; m.cd = (6.2 - 0.4 * m.tier) * (0.85 + Math.random() * 0.4); }
    }
  }

  // ---- breath statues: idle (faces you), telegraph (glowing mouth + ground strip, tracks you for the first part), breath (long sweeping cone), rest
  for (let i = 0; i < rt.nStatue; i++) {
    const q = rt.statue[i];
    if (q.dead) continue;
    q.glow = q.state === 1 ? Math.min(1, q.t / STATUE_WARN) : q.state === 2 ? 1 : Math.max(0, q.glow - dt * 2.5);
    if (q.state === 0) {
      const dx = px - q.x, dz = pz - q.z, d = Math.hypot(dx, dz);
      if (d > 2) q.yaw += wrapPi(Math.atan2(dx, dz) - q.yaw) * Math.min(1, dt * 2.0);
      if (!fighting || !alive) { q.cd = Math.max(q.cd, 1.5); continue; }
      q.cd -= dt;
      if (q.cd <= 0 && d < 30) { q.state = 1; q.t = 0; q.lock = q.yaw; q.sw = Math.random() < 0.5 ? -1 : 1; }
    } else if (q.state === 1) {
      q.t += dt;
      if (!fighting || !alive) { q.state = 0; q.cd = 3; continue; }
      if (q.t < STATUE_WARN * 0.6) { q.yaw += wrapPi(Math.atan2(px - q.x, pz - q.z) - q.yaw) * Math.min(1, dt * 6); q.lock = q.yaw; }   // aims at you, then the lane is locked
      else q.yaw += wrapPi(q.lock - q.sw * STATUE_SWEEP * 0.5 - q.yaw) * Math.min(1, dt * 9);   // swings to the start of the sweep
      if (q.t >= STATUE_WARN) { q.state = 2; q.t = 0; q.tick = 0; q.acc = 0; addShake(0.15); }
    } else if (q.state === 2) {
      q.t += dt;
      q.yaw = statueBeamYaw(q);
      q.tick -= dt;
      if (q.tick <= 0) {
        q.tick = q.kind === 0 ? FIRE_TICK : STATUE_TICK;   // (owner) fire breath: continuous direct hits while you stand in it
        if (alive && coneHit(q, px, pz, 0.3)) {
          tmp.set(q.x, 0, q.z);
          if (q.kind === 0) {
            damagePlayer(maxHp() * 0.016 * scale / DMG_INFLATE, { pos: tmp, kind: 'FIRE', env: true });   // env: ticking hazard (x HERO_DOT_MUL)
            applyPlayerDebuff('BURN', 2, Math.max(2, 3 + world.director.wave * 0.5) * scale);
          } else {
            damagePlayer(maxHp() * 0.006 * scale / DMG_INFLATE, { pos: tmp, kind: 'ICE', env: true });
            applyPlayerDebuff('SLOW', 1.4);
            q.acc += STATUE_TICK;
            if (q.acc >= 0.8) { q.acc = 0; addChill(1); }
          }
        }
        const mx = q.x + Math.sin(q.yaw) * (STATUE_MOUTH + STATUE_LEN * 0.5), mz = q.z + Math.cos(q.yaw) * (STATUE_MOUTH + STATUE_LEN * 0.5);
        world.enemyGrid.query(mx, mz, STATUE_LEN * 0.5 + 3, ids);
        for (let k = 0; k < ids.length; k++) {
          const e = world.enemies[ids[k]];
          if (!mobOk(e) || e.boss) continue;
          if (!coneHit(q, e.pos.x, e.pos.z, e.radius * 0.6)) continue;
          if (q.kind === 0) { burn.value = Math.max(2, e.maxHp * 0.04 * (e.elite ? 0.5 : 1)); applyStatus(e, burn); }
          else applyStatus(e, chillMob);
        }
      }
      if (q.t >= STATUE_ON) { q.state = 3; q.t = 0; }
    } else {
      q.t += dt;
      if (q.t >= 0.5) { q.state = 0; q.cd = 7 * (1 - 0.05 * q.tier) * (0.85 + Math.random() * 0.4); }
    }
  }

  // ---- fire bars
  for (let i = 0; i < rt.nBar; i++) {
    const b = rt.bar[i];
    b.a += b.w * dt; if (b.hitCd > 0) b.hitCd -= dt;
    if (alive && b.hitCd <= 0 && pl.dashT <= 0) {
      let hit = Math.hypot(px - b.x, pz - b.z) < 1.1;
      for (let k = 0; k < 4 && !hit; k++) if (armDist(px, pz, b.x, b.z, b.a + k * Math.PI / 2, b.len) < 0.95) hit = true;
      if (hit) {
        b.hitCd = 0.9;
        tmp.set(b.x, 0, b.z);
        damagePlayer(dmgOf(0.06), { pos: tmp, kind: 'FIRE' });
        applyPlayerDebuff('BURN', 2.2, Math.max(2, 3 + world.director.wave * 0.5) * scale);
      }
    }
    b.tick += dt;
    if (b.tick >= 0.3) {   // monsters caught by the arms burn too
      b.tick = 0;
      world.enemyGrid.query(b.x, b.z, b.len + 1.5, ids);
      for (let k = 0; k < ids.length; k++) {
        const e = world.enemies[ids[k]];
        if (!mobOk(e) || e.boss) continue;
        let hit = Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 1.1 + e.radius * 0.5;
        for (let q = 0; q < 4 && !hit; q++) if (armDist(e.pos.x, e.pos.z, b.x, b.z, b.a + q * Math.PI / 2, b.len) < 0.9 + e.radius * 0.6) hit = true;
        if (hit) { burn.value = Math.max(2, e.maxHp * 0.03 * (e.elite ? 0.5 : 1)); applyStatus(e, burn); }
      }
    }
  }

  // ---- rotating flame beams (HALLS): rest -> telegraph (the lane glows on the floor, the pillar flares) -> a slowly turning beam -> rest
  for (let i = 0; i < rt.nBeam; i++) {
    const m = rt.beam[i];
    m.t += dt;
    if (m.hitCd > 0) m.hitCd -= dt;
    if (!fighting && m.state > 0) { m.state = 0; m.t = 0; m.off = 99; }   // (the room is clear: the beams rest for good, the exits stay safe)
    if (m.state === 0) { if (m.t >= m.off && fighting && alive) { m.state = 1; m.t = 0; } }
    else if (m.state === 1) { if (m.t >= BEAM_WARN) { m.state = 2; m.t = 0; m.tick = 0; addShake(0.1); } }
    else {
      m.a += m.w * dt;
      if (alive && m.hitCd <= 0 && pl.dashT <= 0 && armDist(px, pz, m.x, m.z, m.a, m.len) < 0.95) {
        m.hitCd = 1.0; tmp.set(m.x, 0, m.z);
        damagePlayer(dmgOf(0.05), { pos: tmp, kind: 'FIRE' });
        applyPlayerDebuff('BURN', 2.0, Math.max(2, 3 + world.director.wave * 0.5) * scale);
      }
      m.tick += dt;
      if (m.tick >= 0.3) {
        m.tick = 0;
        world.enemyGrid.query(m.x, m.z, m.len + 1.5, ids);
        for (let k = 0; k < ids.length; k++) {
          const e = world.enemies[ids[k]];
          if (!mobOk(e) || e.boss) continue;
          if (armDist(e.pos.x, e.pos.z, m.x, m.z, m.a, m.len) < 0.9 + e.radius * 0.6) { burn.value = Math.max(2, e.maxHp * 0.03 * (e.elite ? 0.5 : 1)); applyStatus(e, burn); }
        }
      }
      // (owner 2026-10-25) once lit, the rotating beam stays on for the whole fight (it only rests when the room is clear)
    }
  }

  // ---- fire jets
  for (let i = 0; i < rt.nJet; i++) {
    const j = rt.jet[i];
    j.t += dt;
    if (j.state === 0 && j.t >= j.off) { j.state = 1; j.t = 0; }
    else if (j.state === 1 && j.t >= JET_WARN) { j.state = 2; j.t = 0; j.tick = 0; addShake(0.12); }
    else if (j.state === 2) {
      j.tick -= dt;
      if (j.tick <= 0) {
        j.tick = FIRE_TICK;
        if (alive && armDist(px, pz, j.x, j.z, j.ang, j.len) < 1.05) {
          tmp.set(j.x, 0, j.z);
          damagePlayer(maxHp() * 0.02 * scale / DMG_INFLATE, { pos: tmp, kind: 'FIRE', env: true });   // env: a ticking hazard, x HERO_DOT_MUL like the others
          applyPlayerDebuff('BURN', 2, Math.max(2, 3 + world.director.wave * 0.5) * scale);
        }
        world.enemyGrid.query(j.x + Math.sin(j.ang) * j.len * 0.5, j.z + Math.cos(j.ang) * j.len * 0.5, j.len * 0.5 + 2, ids);
        for (let k = 0; k < ids.length; k++) {
          const e = world.enemies[ids[k]];
          if (!mobOk(e) || e.boss) continue;
          if (armDist(e.pos.x, e.pos.z, j.x, j.z, j.ang, j.len) < 1.0 + e.radius * 0.6) { burn.value = Math.max(2, e.maxHp * 0.04 * (e.elite ? 0.5 : 1)); applyStatus(e, burn); }
        }
      }
      if (j.t >= JET_ON) { j.state = 0; j.t = 0; j.off = 1.5 + Math.random() * 0.9; }   // (owner 2026-10-25: breathes fire much more often)
    }
  }

  // ---- rooting vines
  for (let i = 0; i < rt.nVine; i++) {
    const v = rt.vine[i];
    if (v.state === 2) { v.t -= dt; if (v.t <= 0) { v.state = 0; v.touch = 0; } continue; }
    const dx = px - v.x, dz = pz - v.z, rr = v.r + 0.1;
    if (alive && dx * dx + dz * dz < rr * rr) {
      v.touch += dt;
      if (v.touch >= 0.32) {
        v.state = 2; v.t = VINE_REST;
        tmp.set(v.x, 0, v.z);
        damagePlayer(dmgOf(0.035), { pos: tmp, kind: 'PHYSICAL' });
        applyPlayerDebuff('ROOT', 1.0);
        events.emit('trick', { pos: new Vector3(v.x, 0, v.z), kind: 'ROOTS', radius: v.r * 2 });
        events.emit('floatText', { pos: pl.pos, text: 'ENTANGLED!', color: 0x9be32a, scale: 0.9, dy: 2.4 });
      }
    } else v.touch = Math.max(0, v.touch - dt * 2);
  }

  // ---- freezing pools: slip + chill build-up
  let on = false;
  for (let i = 0; i < rt.nPool; i++) {
    const p = rt.pool[i];
    const dx = px - p.x, dz = pz - p.z;
    if (alive && dx * dx + dz * dz < p.r * p.r) {
      on = true; p.acc += dt;
      if (p.acc >= 0.85) { p.acc = 0; addChill(1); }
    } else p.acc = Math.max(0, p.acc - dt * 0.5);
  }
  if (on) trapMods.grip = POOL_GRIP;
}

function towerRing(m: { x: number; z: number; a0: number; tier: number; glow: number }): void {
  const n = 12 + m.tier * 2;
  m.a0 += Math.PI / n;   // every ring is rotated by half a step: the gaps shift
  tmp.set(m.x, 2.7, m.z);
  for (let k = 0; k < n; k++) {
    const a = m.a0 + (k / n) * Math.PI * 2;
    tmpD.set(Math.sin(a), 0, Math.cos(a));
    fireEnemyProjectile(tmp, tmpD, 'SLOW_ORB', 6.3 + 0.35 * m.tier, dmgOf(0.045), { slow: 0.3, life: 4.2, radius: 0.5 });
  }
  m.glow = 0;
  events.emit('shockwave', { pos: new Vector3(m.x, 0, m.z), radius: 5, color: 0xc080ff });
}

/** A short stun on the hero where the boulder lands (inside the circle only). */
function stunNear(x: number, z: number, r: number, sec: number): void {
  const p = world.player;
  if (!p.alive) return;
  const dx = p.pos.x - x, dz = p.pos.z - z;
  if (dx * dx + dz * dz < (r + 0.6) * (r + 0.6)) applyPlayerDebuff('STUN', sec);
}
