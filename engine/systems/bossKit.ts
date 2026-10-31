// ============================================================================
// BOSS KITS (docs/BOSS_DESIGN_REFERENCE.md, owner 2026-10-31): shared layer of the designed kits of Gorath (bossKitGorath.ts) and Elderroot
// (bossKitTreant.ts). Holds
//   - a pooled list of DELAYED STRIKES (circle / lane / beam) with their red warning bodies and a `pct` hit (share of the hero's max HP:
//     dash i-frames / dodge roll negate it, defence does not, co-op: every hero in the shape is hit through forEachHero),
//   - the marble STATUES of Gorath's "Living Statue" mechanic (circle colliders both sides, created from 'trick' events so a co-op guest
//     builds the same props),
//   - the STUN window helper (STUNNED word, `staggerT`, +damage through hooks.kitMul),
//   - QA counters.
// Telegraph rules: warning bodies are RED until the strike (METEOR_SHADOW circles / TELEGRAPH_LINE lanes), aim is locked when the skill is
// cast (the callers pass the locked spot), nothing here allocates per frame (fixed pools).
// Co-op: the host simulates (updateBossKit is host-only). A guest sees zones + projectiles through the snapshot and the statues / knots /
// beams through 'trick' events whose kind starts with "KIT_" (drawn by render/BossKitFx.tsx).
// NOTE: imports from the AI modules are only used inside functions (import cycle through enemies.ts).
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events, type DamageKind } from '../events';
import type { Enemy } from '../types';
import { damagePlayer, applyPlayerDebuff, type PlayerDebuff } from './combat';
import { spawnHostileZone } from './tricks';
import { spawnTelegraphLine, enter, bossAlive } from './enemies';
import { forEachHero } from '../heroes';
import { addTempCollider, removeTempCollider, type Collider } from '../mapgen';
import { bp } from './bossPhaseState';
import { hooks } from './hooks';
import { coopRoom } from '../../net/coopRoom';
import { useGameStore } from '../../store';
import { abortGorath, gorathStatueBroken, castGorath } from './bossKitGorath';
import { abortTreant, castTreant } from './bossKitTreant';

const tv = new Vector3();
/** QA counters: `hits[tag]` = strikes that resolved, `lost[tag]` = hero max-HP share (0..1) they took, `cur` = the skill being cast now. */
export const kitStats = { cur: '', hits: {} as Record<string, number>, lost: {} as Record<string, number>, started: {} as Record<string, number>, stuns: 0, trials: 0, statuesBroken: 0, knotsCracked: 0, barks: 0 };
export function kitSkill(name: string): void { kitStats.cur = name; kitStats.started[name] = (kitStats.started[name] ?? 0) + 1; }

/** Fire / impact flavours of a strike. */
export const FX_NONE = 0, FX_SLAM = 1, FX_BOULDER = 2, FX_DEBRIS = 3, FX_BEAM = 4, FX_THORN = 5;

// ---------------------------------------------------------------- shared state
export const kit = {
  /** the boss that owns the kit state (Gorath or Elderroot; extra bosses run their plain AI) */
  id: -1,
  /** the signature stun window is open: seconds left (damage x STUN_MUL through hooks.kitMul) */
  stunT: 0,
  /** an armour phase is up (Gorath's statues / Elderroot's bark): damage x `armourMul` on top of the boss's own hooks */
  armour: false, armourMul: 0.85,
  /** hero heal-block etc. unused: kept for later kits */
  t: 0,
};
export const STUN_T = 5.5, STUN_MUL = 1.6;
hooks.kitMul = (e: Enemy): number => (e.id !== kit.id ? 1 : kit.stunT > 0 ? STUN_MUL : kit.armour ? kit.armourMul : 1);

/** Does boss `e` own the kit now (or may it take it over)? Extra bosses (waves) never do. */
export function kitOwns(e: Enemy): boolean {
  if (kit.id === e.id) return true;
  const o = kit.id >= 0 ? world.enemies[kit.id] : null;
  if (o && o.active && o.boss && o.state !== 'DYING' && (o.kind === 'BOSS_GOLEM' || o.kind === 'BOSS_TREANT')) return false;
  kit.id = e.id; kit.stunT = 0; kit.armour = false; kit.armourMul = 0.85;
  return true;
}

/** The invulnerable phases of the shared layer cut in at 70% and 35% hp: a signature trial / armour must not start where one would cancel it half way. */
export function kitPhaseSafe(e: Enemy): boolean {
  const r = e.hp / e.maxHp;
  return r > 0.9 || (r < 0.66 && r > 0.55) || (r < 0.31 && r > 0.08);   // (a trial / armour lasts ~15-20 s = ~15-20% of the boss's hp)
}

// ---------------------------------------------------------------- 'trick' events
export function kitEvent(x: number, z: number, kind: string, radius = 1): void {
  tv.set(x, 0, z);
  events.emit('trick', { pos: tv.clone(), kind, radius });
}
export const word = (e: Enemy, text: string, color: number, scale = 1.5, dy = 8): void => { events.emit('floatText', { pos: e.pos, text, color, scale, dy }); };
export const notify = (msg: string, color: string): void => useGameStore.getState().addNotification(msg, color, 'BOSS');

// ---------------------------------------------------------------- statues (both sides)
export const MAX_STATUES = 4;
export interface Statue { on: boolean; x: number; z: number; r: number; col: Collider | null }
export const statues: Statue[] = Array.from({ length: MAX_STATUES }, () => ({ on: false, x: 0, z: 0, r: 1.7, col: null }));
function statueSet(i: number, on: boolean, x: number, z: number, r: number): void {
  const s = statues[i]; if (!s) return;
  if (s.col) { removeTempCollider(s.col); s.col = null; }
  s.on = on;
  if (on) { s.x = x; s.z = z; s.r = r; s.col = addTempCollider(x, z, r * 0.9, false); }
}
// every client (host and guest) builds the statue colliders from the same events: KIT_STATUE|i|state (1 up, 2 broken, 0 removed)|radius at (x, z)
events.on('trick', (ev) => {
  const k = ev.kind;
  if (k.charCodeAt(0) !== 75 || !k.startsWith('KIT_STATUE')) return;
  const a = k.split('|');
  const i = +a[1] | 0, st = +a[2] | 0;
  statueSet(i, st === 1, ev.pos.x, ev.pos.z, +a[3] || 1.7);
});
export function statueUp(i: number, x: number, z: number, r: number): void { kitEvent(x, z, `KIT_STATUE|${i}|1|${r}`, r); }
export function statueDown(i: number, broken: boolean): void {
  const s = statues[i]; if (!s || !s.on) return;
  kitEvent(s.x, s.z, `KIT_STATUE|${i}|${broken ? 2 : 0}|${s.r}`, s.r);
}
export function statuesLive(): number { let n = 0; for (const s of statues) if (s.on) n++; return n; }
/** First statue along the lane from (ox, oz) along (dx, dz) within `len` whose body the lane of half-width `hw` touches: its index and distance along, or -1. */
let hitAlong = 0;
export function statueOnLane(ox: number, oz: number, dx: number, dz: number, len: number, hw: number): number {
  let best = -1, bd = 1e9;
  for (let i = 0; i < MAX_STATUES; i++) {
    const s = statues[i]; if (!s.on) continue;
    const vx = s.x - ox, vz = s.z - oz, along = vx * dx + vz * dz, perp = Math.abs(vx * dz - vz * dx);
    if (along > 0 && along < len + s.r && perp < s.r + hw && along < bd) { bd = along; best = i; }
  }
  hitAlong = bd;
  return best;
}
export const lastHitAlong = (): number => hitAlong;

// ---------------------------------------------------------------- stun window
/** The signature reward moment: the boss is staggered for `dur` s (no AI, +25% from the stagger, x STUN_MUL from the kit) with a big STUNNED word. */
export function kitStun(e: Enemy, dur: number, why: string): void {
  e.staggerT = Math.max(e.staggerT, dur); e.stagger = 0; e.staggerCd = Math.max(e.staggerCd, dur + 4);
  kit.stunT = dur; kitStats.stuns++;
  enter(e, 'CHASE'); e.attackCd = Math.max(e.attackCd, 1.4); e.vel.set(0, 0, 0);
  word(e, 'STUNNED!', 0xffe27a, 2.2, 9);
  notify(why, '#ffe08a');
  events.emit('shake', { amount: 0.8 });
  events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 1.6, color: 0xffe27a });
  kitEvent(e.pos.x, e.pos.z, `KIT_STUN|${dur}`, e.radius);
}

// ---------------------------------------------------------------- delayed strikes
const MAX_STRIKES = 40;
interface Strike {
  on: boolean; shape: 0 | 1;
  x: number; z: number; r: number;          // circle centre + radius | lane origin + half width
  dx: number; dz: number; len: number;      // lane direction + length
  sh: number; t: number; shown: boolean;    // time until the warning shows / until the hit
  pct: number; kb: number; down: number; kind: DamageKind; fx: number; src: number; tag: string;
  cc: PlayerDebuff | ''; ccDur: number;
}
const strikes: Strike[] = Array.from({ length: MAX_STRIKES }, () => ({ on: false, shape: 0, x: 0, z: 0, r: 1, dx: 0, dz: 1, len: 0, sh: 0, t: 0, shown: false, pct: 0, kb: 0, down: 0, kind: 'PHYSICAL', fx: 0, src: -1, tag: '', cc: '', ccDur: 0 }));
let live = false;
function alloc(): Strike | null { for (const s of strikes) if (!s.on) return s; return null; }
/** A delayed circle: the red warning shows after `sh` s and fills until `t` s, then every hero inside takes `pct` of his max HP. pct 0 = a warning only (the fist's fake-out). */
export function kitCircle(src: number, tag: string, x: number, z: number, r: number, sh: number, t: number, pct: number, fx: number, kb = 0, down = 0, kind: DamageKind = 'PHYSICAL', cc: PlayerDebuff | '' = '', ccDur = 0): void {
  const s = alloc(); if (!s) return;
  live = true; s.on = true; s.shape = 0; s.x = x; s.z = z; s.r = r; s.sh = sh; s.t = t; s.shown = false; s.pct = pct; s.kb = kb; s.down = down; s.kind = kind; s.fx = fx; s.src = src; s.tag = tag; s.cc = cc; s.ccDur = ccDur;
}
/** A delayed lane (width `w`, length `len` from (x, z) along (dx, dz)). fx FX_BEAM: stops at the first statue it meets (the hero behind it is safe), the statue breaks. */
export function kitLane(src: number, tag: string, x: number, z: number, dx: number, dz: number, len: number, w: number, sh: number, t: number, pct: number, fx: number, kb = 0, down = 0, kind: DamageKind = 'PHYSICAL'): void {
  const s = alloc(); if (!s) return;
  live = true; s.on = true; s.shape = 1; s.x = x; s.z = z; s.dx = dx; s.dz = dz; s.len = len; s.r = w * 0.5; s.sh = sh; s.t = t; s.shown = false; s.pct = pct; s.kb = kb; s.down = down; s.kind = kind; s.fx = fx; s.src = src; s.tag = tag; s.cc = ''; s.ccDur = 0;
}
/** Drops every pending strike of boss `src` (a stagger / phase cut the cast). */
export function kitCancel(src: number): void { for (const s of strikes) if (s.on && s.src === src) s.on = false; }
export function kitStrikesLive(): number { let n = 0; for (const s of strikes) if (s.on) n++; return n; }

function iframes(h: typeof world.player): boolean { return h.invulnT > 0 || (h.dashIframes && (h.anim.dashing || h.dashT > 0)); }

function hitHeroes(s: Strike, len: number): void {
  const src = s.src >= 0 ? world.enemies[s.src] : undefined;
  const maxHp = Math.max(1, useGameStore.getState().stats.maxHealth);
  forEachHero((h) => {
    if (!h.alive) return;
    let inside: boolean;
    if (s.shape === 0) { const rr = s.r + 0.55; inside = (h.pos.x - s.x) ** 2 + (h.pos.z - s.z) ** 2 < rr * rr; }
    else {
      const vx = h.pos.x - s.x, vz = h.pos.z - s.z, along = vx * s.dx + vz * s.dz, perp = Math.abs(vx * s.dz - vz * s.dx);
      inside = along > -0.5 && along < len && perp < s.r + 0.55;
    }
    if (!inside || s.pct <= 0) return;
    tv.set(s.shape === 0 ? s.x : s.x - s.dx * 4, 0, s.shape === 0 ? s.z : s.z - s.dz * 4);
    const hp0 = h.hp, safe = iframes(h);
    damagePlayer(1, { pct: s.pct, pos: tv, kind: s.kind, ...(src && src.active ? { src } : null), kb: s.kb, down: s.down });
    if (safe) { kitStats.hits[s.tag + ':avoided'] = (kitStats.hits[s.tag + ':avoided'] ?? 0) + 1; return; }
    kitStats.hits[s.tag] = (kitStats.hits[s.tag] ?? 0) + 1;
    kitStats.lost[s.tag] = (kitStats.lost[s.tag] ?? 0) + Math.max(0, hp0 - h.hp) / maxHp;
    if (s.cc) applyPlayerDebuff(s.cc, s.ccDur, 0);
  });
}

function resolve(s: Strike): void {
  let len = s.len;
  if (s.shape === 1 && s.fx === FX_BEAM) {   // the Stone Gaze: the first statue on the lane absorbs it
    const i = statueOnLane(s.x, s.z, s.dx, s.dz, s.len, s.r * 0.7);
    let ex = s.x + s.dx * s.len, ez = s.z + s.dz * s.len;
    if (i >= 0) {
      len = Math.max(1, lastHitAlong() - statues[i].r * 0.6);
      ex = s.x + s.dx * len; ez = s.z + s.dz * len;
      kitStats.statuesBroken++;
      statueDown(i, true); gorathStatueBroken();
    }
    kitEvent(s.x, s.z, `KIT_BEAM|${ex.toFixed(2)}|${ez.toFixed(2)}|ffe9a0|${(s.r * 2).toFixed(1)}`, s.r * 2);
    events.emit('shake', { amount: 0.5 });
  } else if (s.fx === FX_SLAM) {
    tv.set(s.x, 0, s.z);
    events.emit('shockwave', { pos: tv.clone(), radius: s.r * 1.15, color: 0xa8a29e });
    events.emit('shake', { amount: 0.7 });
    kitEvent(s.x, s.z, 'STOMP', s.r);
  } else if (s.fx === FX_BOULDER) { kitEvent(s.x, s.z, 'RAIN_ROCK', s.r); events.emit('shake', { amount: 0.3 }); }
  else if (s.fx === FX_DEBRIS) { kitEvent(s.x, s.z, 'RAIN_ROCK', s.r * 0.7); }
  else if (s.fx === FX_THORN) { kitEvent(s.x, s.z, 'RAIN_THORN', s.r); }
  hitHeroes(s, len);
}

// ---------------------------------------------------------------- per-frame (game.ts, host only)
export function updateBossKit(dt: number): void {
  if (coopRoom.guest) return;
  if (kit.stunT > 0) kit.stunT -= dt;
  if (!live) return;
  if (!bossAlive()) { abortAll(); return; }
  if (bp.on) abortAll();   // an invulnerable phase (Boulder Pinball / Spore Garden) took the boss over: the kit steps aside
  let any = false;
  for (const s of strikes) {
    if (!s.on) continue;
    any = true;
    if (s.sh > 0) { s.sh -= dt; s.t -= dt; }
    else s.t -= dt;
    if (!s.shown && s.sh <= 0) {   // the red warning body (spawned here, outside the boss update, so it is not enlarged by `bossTel`)
      s.shown = true;
      const life = Math.max(0.05, s.t);
      if (s.shape === 0) spawnHostileZone('METEOR_SHADOW', s.x, s.z, s.r, life, 0, 0xff2a22);
      else spawnTelegraphLine(s.x, s.z, s.dx, s.dz, s.len, s.r * 2, life, 0xff2a22);
    }
    if (s.t <= 0) { s.on = false; resolve(s); }
  }
  if (!any) live = false;
}

export function abortAll(): void {
  for (const s of strikes) s.on = false;
  live = false;
  abortGorath(); abortTreant();
}

/** Room change / run end / boss died (bossMech.resetBossMech): drop everything. */
hooks.kitReset = (): void => {
  for (const s of strikes) s.on = false;
  live = false; kit.id = -1; kit.stunT = 0; kit.armour = false;
  for (let i = 0; i < MAX_STATUES; i++) { const s = statues[i]; if (s.col) { removeTempCollider(s.col); s.col = null; } s.on = false; }
  abortGorath(true); abortTreant(true);
};

/** Dev: kit counters for the headless QA. */
if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as Record<string, unknown>).__kit = { stats: kitStats, kit, statues, live: kitStrikesLive, castG: castGorath, castT: castTreant };
}

