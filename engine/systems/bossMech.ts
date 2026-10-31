// ============================================================================
// Boss mechanics shared by every biome boss, layered on top of each boss's own attack table (bosses.ts / bosses2.ts):
//  - Cataclysm: a wide rain of falling rocks / fire / ice / void across the arena (some aimed at you and where you
//    are heading), each impact carrying the boss's crowd control (stun, root, slow, silence, burn, poison...).
//  - Quake: a big telegraphed ring around the boss with its signature crowd control.
//  - Invulnerable phases (bossPhases.ts): at set hp thresholds each boss turns immune and runs its own signature mechanic.
//  - Barrier: every boss periodically wraps itself in an absorb shield (bigger in later phases).
//  - Mend: some bosses channel a heal; deal 6% of its max hp during the channel to interrupt it.
//  - Crush: a heavy melee aimed at the NEAREST unit (summons included, e.g. Necromancer skeletons).
// All boss telegraphs are also drawn ~30% bigger and resolve ~12% sooner (enemies.ts `bossTel`).
// No allocations per frame: strikes live in a fixed pool.
// ============================================================================
import { Vector3 } from 'three';
import { world, MAX_ENEMIES } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { hooks } from './hooks';
import { bp, phaseImmune } from './bossPhaseState';
import type { BossKind } from '../enemyDefs';
import { damagePlayer, applyPlayerDebuff, SLOW_BOSS, KB, type PlayerDebuff } from './combat';
import { damageMinion, nearestMinion } from './minions';
import { spawnEnemy, spawnTelegraphCircle, onEnemyDeath } from './enemies';
import { spawnHostileZone } from './tricks';
import { firePatch } from './bossFx';
import { useGameStore } from '../../store';
import { forEachHero, nearestHero } from '../heroes';

interface Mech {
  cc: PlayerDebuff; ccDur: number;      // signature crowd control (quake + crush)
  rain: PlayerDebuff; rainDur: number;  // what a falling impact applies
  rainColor: number; rainWord: string;
  rainFx: string;                       // 'trick' event kind drawn at each impact (render/TrickFx.tsx RAIN_*)
  patch: 0 | 1 | 2;                     // what an impact leaves: 0 nothing, 1 short fire patch (FIRE_CAP), 2 brief slow patch
  heal: boolean;
}
const MECH: Record<BossKind, Mech> = {
  BOSS_GOLEM:   { cc: 'STUN', ccDur: 1.0, rain: 'STUN', rainDur: 0.4, rainColor: 0xb0a090, rainWord: 'Falling Boulders!', rainFx: 'RAIN_ROCK', patch: 0, heal: false },
  BOSS_TREANT:  { cc: 'ROOT', ccDur: 1.6, rain: 'POISON', rainDur: 3, rainColor: 0x84cc16, rainWord: 'Thorn Eruption!', rainFx: 'RAIN_THORN', patch: 0, heal: true },
  BOSS_HYDRA:   { cc: 'SLOW', ccDur: 3, rain: 'SLOW', rainDur: 2, rainColor: 0x3fa8ff, rainWord: 'Water Geysers!', rainFx: 'RAIN_GEYSER', patch: 0, heal: true },
  BOSS_WYRM:    { cc: 'STUN', ccDur: 1.1, rain: 'SLOW', rainDur: 3, rainColor: 0xbfe8ff, rainWord: 'Falling Icicles!', rainFx: 'RAIN_ICE', patch: 2, heal: false },
  BOSS_WARLORD: { cc: 'SILENCE', ccDur: 2.2, rain: 'BURN', rainDur: 3.6, rainColor: 0xff5a1a, rainWord: 'Fire Meteors!', rainFx: 'RAIN_FIRE', patch: 1, heal: false },
  BOSS_WARMACH: { cc: 'STUN', ccDur: 1.0, rain: 'BURN', rainDur: 3, rainColor: 0xe0c070, rainWord: 'Artillery Barrage!', rainFx: 'RAIN_SAND', patch: 0, heal: false },
  BOSS_VOID:    { cc: 'SILENCE', ccDur: 2.4, rain: 'BLIND', rainDur: 2.5, rainColor: 0xa060ff, rainWord: 'Void Bolts!', rainFx: 'RAIN_VOID', patch: 0, heal: true },
  BOSS_LICH:    { cc: 'SILENCE', ccDur: 2.0, rain: 'SLOW', rainDur: 2.5, rainColor: 0x7dd3fc, rainWord: 'Soulfire!', rainFx: 'RAIN_VOID', patch: 0, heal: true },
};

// ---- tuning
const RAIN_CD = [22, 19, 16];      // by phase (owner: less frequent; was 12 / 10 / 8.5)
const QUAKE_CD = 11;
const HEAL_CD = 26, HEAL_T = 3, HEAL_RATE = 0.025, HEAL_BREAK = 0.06;
const CRUSH_CD = 3.6, CRUSH_R = 3.4, CRUSH_WIND = 0.65, CRUSH_RANGE = 8;
const WARD_MAX_T = 18;   // (owner: shorter; was 25)
const PHASE_T = 5;
const WARD_AT = 0.5;    // (owner: once per fight at 50% hp; was at 66% and 33%)   // (balance pass: was 35 s of a boss that can't be hurt)
// by phase: seconds between barriers, shield as a share of max hp (balance pass: was [20, 17, 14] s / [6, 8, 10]%; low-damage
// builds stalled at 5-25% boss hp behind back-to-back barriers)
const BARRIER_CD = [32, 28, 24], BARRIER_HP = [0.05, 0.06, 0.07];   // (owner: less often; was 22 / 20 / 18)
// damage of the shared layer as multiples of the boss's power (balance pass: 1.1 / 1.3 / 1.6 -> 0.8 / 1.0 / 1.25; this layer
// sits on top of every boss's own kit and dealt a big share of the hits that killed level-8 heroes at Elderroot)
const RAIN_DMG = 1.5, QUAKE_DMG = 1.7, CRUSH_DMG = 2.1;   // (owner 2026-10-31: the meteor rain, quake and crush hit very hard: ~x3 of before, they scale with the hero via bossBalance)

// ============================================================================
// Proximity pressure (owner 2026-10-31): a boss only uses its SHORT-range skills (melee swipes, stomps, slams, tail / ring bursts, shield
// bash...) while a valid target (the hero, the co-op partner, or one of the hero's summons) is within its proximity (radius + PROX_PAD).
// The longer someone stays near, the higher the boss's pressure meter (0 -> 1 over PROX_FILL s, drains at PROX_DRAIN) and the more often
// the close skills fire: their cooldown runs up to 2.5x as fast, and at high pressure a close skill may interrupt the breather between
// two skills (never mid-wind-up / mid-attack, never during an invulnerable phase or a special, never inside the shared layer's gap).
// Every boss AI calls `proxTick` once per frame (bosses.updateBoss), asks `closeDue` from its CHASE picker and calls `closeUsed` after.
// ============================================================================
const PROX_PAD = 5.5, PROX_FILL = 6, PROX_DRAIN = 3, PROX_MAX_RATE = 2.5, PROX_INT_P = 0.7;
const PROX_MIN_GAP = 5;   // s between two forced close skills (a boss never chains them: the cycle's other skills come in between)
const prox = { p: new Float32Array(MAX_ENEMIES), t: new Float32Array(MAX_ENEMIES), lt: new Float32Array(MAX_ENEMIES), pend: new Uint8Array(MAX_ENEMIES), chain: new Uint8Array(MAX_ENEMIES) };
/** QA counters: close skills started while someone was near / while nobody was (must stay 0), interrupts, last pressure. */
export const proxStats = { near: 0, far: 0, interrupts: 0, byName: {} as Record<string, number> };
/** True when the hero, the co-op partner or a summon of the hero is within `e.radius + PROX_PAD` of the boss. */
export function bossNear(e: Enemy): boolean {
  const r = e.radius + PROX_PAD, r2 = r * r;
  const h = nearestHero(e.pos.x, e.pos.z);
  if (h.alive && (h.pos.x - e.pos.x) ** 2 + (h.pos.z - e.pos.z) ** 2 < r2) return true;
  return nearestMinion(e.pos.x, e.pos.z, r) >= 0;
}
/** Per-frame: fills the boss's pressure while a target is near, drains it otherwise; ticks the close-skill timer (faster under pressure). */
export function proxTick(e: Enemy, dt: number): void {
  const i = e.id;
  if (e.state === 'SPAWN') { prox.p[i] = 0; prox.t[i] = 2; prox.lt[i] = -99; return; }
  const p = prox.p[i] + (bossNear(e) ? dt / PROX_FILL : -dt / PROX_DRAIN);
  prox.p[i] = p < 0 ? 0 : p > 1 ? 1 : p;
  if (prox.t[i] > 0) prox.t[i] -= dt * proxRate(e);
}
/** QA: the proximity meter of boss `e` (pressure, close-skill timer, last close skill time, breather gap, special). */
export function proxDebug(e: Enemy): Record<string, number> { return { p: +prox.p[e.id].toFixed(2), t: +prox.t[e.id].toFixed(2), since: +(world.time - prox.lt[e.id]).toFixed(1), gap: S.id === e.id ? +S.gapT.toFixed(1) : -1, sp: e.spKind, ac: +e.attackCd.toFixed(2) }; }
/** Pressure 0..1. */
export function proxPressure(e: Enemy): number { return prox.p[e.id]; }
/** How much faster close-skill cooldowns run right now (1 .. 2.5). */
export function proxRate(e: Enemy): number { return 1 + (PROX_MAX_RATE - 1) * prox.p[e.id]; }
/** True while the shared layer is not in its breather after a big attack (so a pressure interrupt may not stack on it). */
function gapFree(e: Enemy): boolean { return S.id !== e.id || S.gapT <= 1.2; }   // (the last 1.2 s of a breather may be cut short, never a fresh one)
/**
 * Call from the CHASE picker: a close skill is due now (someone is near, its timer is up, and either the boss's own cooldown ended or the
 * pressure is high enough to interrupt the breather). Never mid-wind-up / invulnerable phase / special (the picker only runs in CHASE).
 */
export function closeDue(e: Enemy): boolean {
  if (!bossNear(e) || prox.t[e.id] > 0 || prox.chain[e.id] === 1 || world.time - prox.lt[e.id] < PROX_MIN_GAP) return false;
  if (e.attackCd <= 0) return true;
  return prox.p[e.id] >= PROX_INT_P && e.spKind === 0 && !(bp.on && bp.id === e.id) && gapFree(e);
}
/** Call whenever the boss starts ANY skill (after `closeUsed` for a close one): a forced close skill never follows another close skill directly. */
export function proxBegin(e: Enemy): void { prox.chain[e.id] = prox.pend[e.id]; prox.pend[e.id] = 0; }
/** Call when a close skill is picked: restarts its timer (base `cd` s; pressure shortens it up to 2.5x) and records QA stats. */
export function closeUsed(e: Enemy, cd: number, name = ''): void {
  const int = e.attackCd > 0;
  prox.t[e.id] = cd; prox.lt[e.id] = world.time; prox.pend[e.id] = 1;
  if (bossNear(e)) proxStats.near++; else proxStats.far++;
  if (int) proxStats.interrupts++;
  if (name) proxStats.byName[name] = (proxStats.byName[name] ?? 0) + 1;
}

// ---- strike pool (delayed AoE hits we resolve ourselves so they can carry crowd control and hit minions)
const MAX_STRIKES = 72, RAIN_LIVE_CAP = 60;   // rain waves never put more than 60 telegraphs up at once
const strikes = Array.from({ length: MAX_STRIKES }, () => ({ on: false, x: 0, z: 0, r: 0, t: 0, dmg: 0, minDmg: 0, cc: 'STUN' as PlayerDebuff, ccDur: 0, kd: 0, th: null as Mech | null, pi: 0 }));
const tv = new Vector3();
const S = { id: -1, barrierUsed: false, barrierCd: 12, rainCd: 6, quakeCd: 5, healCd: 14, crushCd: 2, gapT: 0, healT: 0, healHp0: 0 };

export function resetBossMech(): void {
  prox.p.fill(0); prox.t.fill(0); prox.lt.fill(-99); prox.pend.fill(0); prox.chain.fill(0); S.id = -1; S.barrierUsed = false; S.barrierCd = 12; S.rainCd = 6; S.quakeCd = 5; S.healCd = 14; S.crushCd = 2; S.gapT = 0; S.healT = 0; hooks.phaseReset();
  for (const s of strikes) s.on = false;
  RQ.n = 3; RQ.m = null;
}

const pwr = (e: Enemy): number => Math.max(e.projectileDamage, e.contactDamage * 0.8, 8);
const notify = (msg: string, color: string): void => useGameStore.getState().addNotification(msg, color, 'BOSS');

function strike(x: number, z: number, r: number, delay: number, dmg: number, minDmg: number, cc: PlayerDebuff, ccDur: number, color: number, kd = 0, th: Mech | null = null, pi = 0): void {
  for (const s of strikes) if (!s.on) {
    s.th = th; s.pi = pi; s.on = true; s.x = x; s.z = z; s.r = r; s.t = delay; s.dmg = dmg; s.minDmg = minDmg; s.cc = cc; s.ccDur = ccDur; s.kd = kd;
    spawnHostileZone('METEOR_SHADOW', x, z, r, delay, 0, color);   // the warning (visual only, fills up; we resolve the hit)
    return;
  }
}

/** A delayed circle hit with crowd control (used by the boss phases too). */
export const bossStrike = strike;
export const bossPwr = pwr;
let fxN = 0;
function resolve(s: (typeof strikes)[number]): void {
  // impact: a dust ring + scorch every time, a full explosion only on every third (a rain of 25 must not white out)
  tv.set(s.x, 0, s.z);
  const th = s.th;
  if (th) {   // themed rain impact (boulder / thorn / geyser / icicle / meteor / shell / void): its own VFX, a leftover patch on every other one
    events.emit('trick', { pos: tv.clone(), kind: th.rainFx, radius: s.r });
    if (th.patch === 1 && (s.pi & 1) === 0) firePatch(s.x, s.z, s.r * 0.6, 3, Math.max(2, s.dmg * 0.1));
    else if (th.patch === 2 && (s.pi & 1) === 0) spawnHostileZone('GOO', s.x, s.z, s.r * 0.8, 2.5, 0, 0xbfe8ff);
  } else {
    events.emit('shockwave', { pos: tv.clone(), radius: s.r * 1.1, color: 0x8a7a6a });
    if ((fxN++ % 3) === 0) events.emit('explosion', { pos: tv.clone(), radius: s.r * 0.7, color: 0xa04a1a });
  }
  const rr = s.r + 0.5;
  forEachHero((p) => {   // (co-op: the impact hurts either hero standing in it; the partner's blow is forwarded to his screen)
    const dx = p.pos.x - s.x, dz = p.pos.z - s.z;
    if (p.alive && dx * dx + dz * dz < rr * rr) {
      tv.set(s.x, 0, s.z);
      damagePlayer(th ? 1 : s.dmg, { ...(th ? { pct: RAIN_PCT[Math.min(2, s.pi >> 8)] } : null), pos: tv, kind: s.cc === 'BURN' ? 'FIRE' : s.cc === 'POISON' ? 'POISON' : s.cc === 'SLOW' ? 'ICE' : 'PHYSICAL', ...(s.kd > 0 ? { kb: KB.SLAM.kb, down: s.kd } : null) });   // (owner) the quake ring and the aimed meteor knock the hero down
      if (s.ccDur > 0) applyPlayerDebuff(s.cc, s.ccDur, s.cc === 'BURN' || s.cc === 'POISON' ? s.dmg * 0.1 : s.cc === 'SLOW' ? SLOW_BOSS : 0);
    }
  });
  if (s.minDmg > 0) {
    const M = world.minions;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && (m.x - s.x) ** 2 + (m.z - s.z) ** 2 < rr * rr) damageMinion(i, s.minDmg); }
  }
}

/** The Dune Colossus is a giant: its rain / quake blasts are 2x wider (owner), all other bosses 1x. */
const bigK = (e: Enemy): number => (e.kind === 'BOSS_WARMACH' ? 2 : 1);
function arenaR(): number { return Math.max(14, world.room.radius * 0.85); }

/**
 * Cataclysm: THREE alternating waves per cast (owner: standing still must get you hit, moving must save you).
 *  A  a jittered hex lattice of big circles over the whole arena (~38-46% of the floor),
 *  B  the same lattice shifted onto A's gaps (spawned while A lands, so the freshly exploded A circles are the safe spot),
 *  C  a cluster on / around the hero (one on them, one where they are running, the rest ringed round them): no camping.
 * Each wave warns ~1 s. Waves are queued (RQ) and fired from tickBossStrikes; impacts come from the pooled strike list.
 */
/** share of MAX hp one rain impact takes (~10-15%: a mid-geared hero survives several, standing still through a cast does not) */
const RAIN_PCT = [0.2, 0.24, 0.28];   // (owner 2026-10-31: meteors / boulders / geysers / icicles hit very hard; was 10 / 12 / 14 % of max HP)
const RAIN_WAVE_GAP = 0.9, RAIN_WARN = [1.1, 1.0, 0.95];
const RQ = { n: 3, t: 0, m: null as Mech | null, dmg: 0, big: 1, phase: 0, pi: 0 };
const rainSeed = { th: 0, ox: 0, oz: 0 };
const rainX: number[] = [], rainZ: number[] = [];
let rainN = 0, liveStrikes = 0;
function rain(e: Enemy, m: Mech): void {
  events.emit('floatText', { pos: e.pos, text: m.rainWord, color: m.rainColor, scale: 1.2, dy: 5 });
  RQ.n = 0; RQ.t = 0; RQ.m = m; RQ.dmg = pwr(e) * RAIN_DMG; RQ.big = bigK(e); RQ.phase = Math.min(2, e.phase | 0); RQ.pi = 0;
}
function place(x: number, z: number, r: number, t: number, kd = 0): void {
  if (liveStrikes >= RAIN_LIVE_CAP) return;
  liveStrikes++;
  const m = RQ.m!;
  strike(x, z, r, t, RQ.dmg, RQ.dmg * 0.6, m.rain, m.rainDur, m.rainColor, kd, m, (RQ.phase << 8) | (RQ.pi++ & 255));
}
function rainWave(w: number): void {
  const m = RQ.m; if (!m) return;
  liveStrikes = 0; for (const s of strikes) if (s.on) liveStrikes++;
  const p = world.player, R = arenaR(), k = RQ.big > 1 ? 1.4 : 1, r = 4.2 * k, tw = RAIN_WARN[w];
  if (w < 2) {
    const cover = 0.38 + 0.04 * RQ.phase;
    const D = r * Math.sqrt(Math.PI / (0.866 * cover));   // lattice spacing that gives that coverage
    // the lattice is fixed per cast (seeded once in wave 0) so B really is A's gaps
    if (w === 0) { rainSeed.th = Math.random() * Math.PI; rainSeed.ox = Math.random() * D; rainSeed.oz = Math.random() * D; }
    const c = Math.cos(rainSeed.th), s = Math.sin(rainSeed.th);
    const sh = w === 1 ? 1 / 3 : 0;   // B: shifted by (a + b) / 3 = onto the centroids of A's triangles
    const N = Math.ceil((R + D) / (D * 0.866)) + 1;
    for (let j = -N; j <= N; j++) for (let i = -N; i <= N; i++) {
      const lx = (i + j * 0.5 + sh * 1.5) * D + rainSeed.ox, lz = (j * 0.866 + sh * 0.866) * D + rainSeed.oz;
      const jx = (Math.random() - 0.5) * D * 0.14, jz = (Math.random() - 0.5) * D * 0.14;
      const x = lx * c - lz * s + jx, z = lx * s + lz * c + jz;
      if (x * x + z * z <= (R + r * 0.4) * (R + r * 0.4)) place(x, z, r * (0.95 + Math.random() * 0.1), tw);
    }
  } else {
    const n = 9 + RQ.phase;
    rainN = 0;
    const put = (x: number, z: number, rr: number, kd: number): boolean => {
      const d = Math.hypot(x, z); if (d > R) { x *= R / d; z *= R / d; }
      for (let i = 0; i < rainN; i++) if ((rainX[i] - x) ** 2 + (rainZ[i] - z) ** 2 < (r * 0.8) ** 2) return false;
      rainX[rainN] = x; rainZ[rainN] = z; rainN++; place(x, z, rr, tw, kd); return true;
    };
    forEachHero((h) => {   // on each hero (co-op: both; no knockdown for these small impacts) and where he is running to
      put(h.pos.x, h.pos.z, r * 0.95, 0);
      put(h.pos.x + h.vel.x * 1.1, h.pos.z + h.vel.z * 1.1, r * 0.9, 0);
    });
    for (let i = 2, tries = 0; i < n && tries < n * 14; tries++) {
      const a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 7 * k;
      if (put(p.pos.x + Math.cos(a) * d, p.pos.z + Math.sin(a) * d, r * (0.85 + Math.random() * 0.15), 0)) i++;
    }
  }
}

/** Quake: a big ring around the boss carrying its signature crowd control. */
function quake(e: Enemy, m: Mech): void {
  strike(e.pos.x, e.pos.z, e.radius + (6 + e.phase * 1.5) * bigK(e), 1.15, pwr(e) * QUAKE_DMG, pwr(e) * 1.5, m.cc, m.ccDur, 0xffd24a, 1.0);
}

/** Advances the pending impacts (every frame, even while the boss is stunned). */
export function tickBossStrikes(dt: number): void {
  if (RQ.m && RQ.n < 3) { RQ.t -= dt; if (RQ.t <= 0) { rainWave(RQ.n++); RQ.t = RAIN_WAVE_GAP; if (RQ.n >= 3) RQ.m = null; } }
  for (const s of strikes) if (s.on) { s.t -= dt; if (s.t <= 0) { s.on = false; resolve(s); } }
}

/** Id of the boss whose invulnerable phase is up (-1 = none): render/BossWard.tsx draws the shield sphere. */
export function wardedBossId(): number { return bp.on && bp.immune ? bp.id : -1; }
/** True while the boss channels its heal (mid-cast: no free-hit window). */
/** Interrupt meter full (systems/interrupt.ts): the healing channel stops. */
export function interruptMend(e: Enemy): void { if (S.healT > 0 && S.id === e.id) S.healT = 0; }
export function bossMending(e: Enemy): boolean { return S.healT > 0 && S.id === e.id; }
/** True while the boss (or the Slime King) refuses all damage (invulnerable phase). */
export function bossWarded(e: Enemy): boolean { return phaseImmune(e.id); }

/**
 * Per-frame boss mechanics. Returns true when the boss is busy (healing channel) and its normal AI must be skipped.
 */
export function updateBossMech(e: Enemy, dt: number): boolean {
  const m = MECH[e.kind as BossKind];
  if (!m) return false;
  if (S.id !== e.id) {
    // ONE boss owns this single-boss state (barrier / rain / mend timers + the invulnerable phase `bp`). Extra bosses alive at once
    // (Endless Waves, summons) run their plain AI: they must never reset it (owner 2026-10-28: the reset ran every frame, each
    // frame re-began the phase and spammed hundreds of 'INVULNERABLE' texts). The room's own boss (director.bossId) may take it over.
    const o = S.id >= 0 ? world.enemies[S.id] : null;
    const ownerLive = !!o && o.active && o.state !== 'DYING' && o.boss && !!MECH[o.kind as BossKind];
    if (ownerLive && !(world.director.bossId === e.id && world.director.bossId !== S.id)) return false;
    resetBossMech(); S.id = e.id;
  }
  if (e.state === 'SPAWN') return false;
  const hpF = e.hp / e.maxHp;

  // invulnerable phase (bossPhases.ts): at its hp thresholds the boss turns immune and runs its own mechanic; the boss is held
  // (no other attack, no barrier / mend / rain) until it resolves. The phase itself is driven from enemies.updateEnemies.
  hooks.phaseCheck(e);
  if (bp.on && bp.id === e.id) return true;
  S.gapT -= dt;

  // barrier: a periodic absorb shield (never in the Herald's final fight)
  // (owner 2026-10-31) the damageable barrier comes ONCE per fight, when the boss drops to 50% hp
  if (!world.boss.final && !S.barrierUsed) {
    if (e.hp <= e.maxHp * 0.5 && e.shield <= 0) {
      S.barrierUsed = true;
      e.shield = e.maxHp * 0.1;
      events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 2.5, color: 0x93c5fd });
      events.emit('floatText', { pos: e.pos, text: 'BARRIER', color: 0x93c5fd, scale: 1.1, dy: 5 });
    }
  }

  // mend (healing channel; heavy damage interrupts it)
  if (S.healT > 0) {
    S.healT -= dt;
    e.vel.set(0, 0, 0);
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_RATE * dt);
    if (S.healHp0 - e.hp > e.maxHp * HEAL_BREAK + e.maxHp * HEAL_RATE * (HEAL_T - S.healT)) {
      S.healT = 0; e.staggerT = Math.max(e.staggerT, 1.5);
      events.emit('floatText', { pos: e.pos, text: 'INTERRUPTED', color: 0xffd24a, scale: 1.2, dy: 5 });
    }
    return S.healT > 0;
  }
  S.healCd -= dt;
  if (m.heal && !world.boss.final && S.healCd <= 0 && hpF < 0.7 && e.state !== 'WINDUP' && e.state !== 'ATTACK') {   // (never while warded: it could not be interrupted then; never for the final Herald)
    S.healCd = HEAL_CD; S.healT = HEAL_T; S.healHp0 = e.hp;
    spawnTelegraphCircle(e.pos.x, e.pos.z, e.radius + 2, HEAL_T, 0, 0x4ade80);
    events.emit('floatText', { pos: e.pos, text: 'HEALING...', color: 0x4ade80, scale: 1.2, dy: 5 });
    notify('The boss is healing! Hit it hard to interrupt!', '#4ade80');
    return true;
  }

  // balance pass: ONE major attack at a time. The shared layer (crush / rain / quake) only starts while the boss itself is idle
  // (not winding up, not casting a special) and keeps a breather gap after it, during which the boss's own attacks also wait.
  const idle = e.state !== 'WINDUP' && e.state !== 'ATTACK' && e.spKind === 0 && S.gapT <= 0;
  const pr = proxRate(e);   // (proximity pressure: the quake ring, a close skill, comes up to 2.5x as often; crush keeps its pace so it cannot starve the boss's own picker)
  S.crushCd -= dt; S.rainCd -= dt; S.quakeCd -= dt * pr;
  if (!idle) return false;

  // crush: heavy melee on the nearest unit (a summon if one is closer than the hero)
  if (S.crushCd <= 0) {
    const p = nearestHero(e.pos.x, e.pos.z);   // (co-op: the nearer of the two heroes)
    const mi = nearestMinion(e.pos.x, e.pos.z, e.radius + CRUSH_RANGE);
    const pd = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    let tx = NaN, tz = 0;
    if (mi >= 0) { const mm = world.minions[mi]; const md = Math.hypot(mm.x - e.pos.x, mm.z - e.pos.z); if (md < pd) { tx = mm.x; tz = mm.z; } }
    if (Number.isNaN(tx) && pd < e.radius + 4) { tx = p.pos.x; tz = p.pos.z; }
    if (!Number.isNaN(tx)) {
      S.crushCd = CRUSH_CD; S.gapT = 1.5; e.attackCd = Math.max(e.attackCd, 1.2);
      strike(tx, tz, CRUSH_R, CRUSH_WIND, pwr(e) * CRUSH_DMG, pwr(e) * 4, m.cc, m.ccDur * 0.5, 0xff3a2a);
    }
  }

  // cataclysm + quake
  if (S.rainCd <= 0) { S.rainCd = RAIN_CD[Math.min(2, e.phase)]; S.gapT = 4.2; e.attackCd = Math.max(e.attackCd, 3.8); rain(e, m); }
  else if (S.quakeCd <= 0 && bossNear(e)) {   // (the quake ring is a close skill: only with someone near)
    proxStats.near++; S.quakeCd = QUAKE_CD - e.phase; S.gapT = 2.2; e.attackCd = Math.max(e.attackCd, 1.8); quake(e, m); }
  return false;
}

/** Boss died / room left: drop the pending impacts. */
export function bossMechDied(e?: Enemy): void {
  if (e && S.id >= 0 && S.id !== e.id) return;   // an extra boss died: the owner's state stays
  resetBossMech();
}

if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {   // QA: cast the cataclysm now (`__bossRain.cast()`), `live()` = pending impacts
  (window as unknown as Record<string, unknown>).__bossRain = {
    cast: (): string => { for (const e of world.enemies) if (e.active && e.boss && MECH[e.kind as BossKind]) { rain(e, MECH[e.kind as BossKind]); return e.kind; } return 'none'; },
    live: (): number => strikes.reduce((n, s) => n + (s.on ? 1 : 0), 0),
  };
}
