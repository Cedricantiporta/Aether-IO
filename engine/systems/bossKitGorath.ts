// ============================================================================
// GORATH (BOSS_GOLEM, Marble Halls) - the designed kit (docs/BOSS_DESIGN_REFERENCE.md "Gorath"), replacing the old SLAM circle-cluster:
//
//   Skill          pattern (doc #)                       telegraph / aim lock                                   hit
//   Fist Drop      2 delayed slam (hold, then drop)      red circle on the hero's spot at cast, fakes out once  28%  (KB.SLAM down)
//   Boulder Throw  26 baited ground marks                3-4 marks, each on the hero's spot when it is placed   12% each
//   Boulder Roll   4 charge through the room             wide red lane locked at windup start, 1.3 s rush       25%  (stops at a statue = crash stun)
//   Rock Ring      1 + 3 ring with a gap (exists)        green safe wedge toward the hero's side, locked        flat rock projectiles, 3 s knockdown
//   Debris Grid    16 crossing lanes                     5 lanes, then 5 crossing lanes                        12% per lane
//   Stone Gaze     24 pillar-hide beam                   red lane locked at windup start, absorbed by statues   30%
//   + dodgeMechs.ts keeps Ground Slam (DASH ring) and the Fissure Cross, the shared layer (rain / quake / crush / barrier) and the 50% Boulder
//   Pinball phase are untouched.
//
// SIGNATURE "Living Statue" (a recurring trial, not an invulnerable phase): every ~26 s three marble statues rise round the arena (colliders,
// armour: Gorath takes 25% less while they stand). Then he fires up to four Stone Gazes / one Boulder Roll at the hero's locked spot. A statue on
// the lane stops the blow (the hero behind it is safe) and shatters; a roll that meets a statue crashes into it (short stagger). Three broken
// statues = STUNNED 5 s (+30% damage on top of the stagger's +25%). Leftover statues crumble after the last cast.
// All timers are real seconds (own `G.t`), the boss's stateT is only used by the render poses. Co-op: host simulates, statues are 'trick' events.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { edgeLimit } from '../mapgen';
import { KB, damagePlayer } from './combat';
import { hurtMinionsLineOnce } from './minionHurt';
import { enter, requestYaw, fireEnemyProjectile, spawnTelegraphLine, spawnTelegraphCone } from './enemies';
import { bossNear, closeDue, closeUsed, proxBegin, proxPressure, bossGapSet } from './bossMech';
import { nearestHero, heroesFill, HL } from '../heroes';
import { hooks } from './hooks';
import {
  kit, STUN_T, kitPhaseSafe, kitCircle, kitLane, kitCancel, kitSkill, kitStun, kitStats, kitOwns, statues, statueUp, statueDown, statuesLive, word, notify, MAX_STATUES,
  FX_SLAM, FX_BOULDER, FX_DEBRIS, FX_BEAM,
} from './bossKit';

const dirV = new Vector3();
const FIST = 0, RING = 1, CHARGE = 2, THROW = 3, GRID = 4, GAZE = 5;
const NAME = ['Fist Drop', 'Rock Ring', 'Boulder Roll', 'Boulder Throw', 'Debris Grid', 'Stone Gaze'];
const CYCLE = [FIST, THROW, CHARGE, GRID, FIST, THROW, GRID, CHARGE];
const GOLEM_CD = [3.0, 2.4, 1.9];
const IDLE = 0, WIND = 1, ACT = 2, REC = 3;
/** hit shares (of the hero's max HP): normal 10-14%, big 25-35% */
const PCT_FIST = [0.26, 0.28, 0.30], PCT_GAZE = [0.28, 0.30, 0.32], PCT_ROLL = 0.25, PCT_THROW = 0.12, PCT_GRID = 0.12;
const FIST_R = 6.2, THROW_R = 3.6, GRID_W = 4.4, GRID_GAP = 10, GAZE_W = 3.6;
const ROLL_HW = 4.4, ROLL_DUR = 1.3;
const STATUE_N = 3, STATUE_R = 1.7, TRIAL_CD0 = 10;
const TRIAL_GAP = 2.0, TRIAL_RISE = 1.8;

const G = {
  id: -1, mode: IDLE, skill: -1, t: 0, w: 0, n: 0, cycle: 0,
  lx: 0, lz: 0, dx: 0, dz: 1, yaw: 0, hitMask: 0, mMask: 0, set2: false, markT: 0, ring: 0, crashed: false,
  trial: { on: false, stage: 0, t: 0, gap: 0, casts: 0, max: 4, broken: 0, cd: TRIAL_CD0, n: 0 },
};
const pickStat: Record<string, number> = {};
export const gorathStats = pickStat;

let hooked = false;
function install(): void {
  if (hooked) return; hooked = true;
  const prev = hooks.onStagger;
  hooks.onStagger = (e: Enemy): void => {
    if (e.id === G.id && e.kind === 'BOSS_GOLEM') cancelCast(e);
    prev(e);
  };
}

function cancelCast(e: Enemy | null): void {
  if (G.mode !== IDLE) { if (e) kitCancel(e.id); G.mode = IDLE; }
  if (G.trial.on) G.trial.gap = Math.max(G.trial.gap, 1.8);
}

/** The phase cut in / the boss left / the room changed. */
export function abortGorath(full = false): void {
  const e = G.id >= 0 ? world.enemies[G.id] : null;
  if (e) kitCancel(e.id);
  G.mode = IDLE;
  if (G.trial.on) { for (let i = 0; i < MAX_STATUES; i++) statueDown(i, false); G.trial.on = false; kit.armour = false; G.trial.cd = Math.max(G.trial.cd, 12); }
  if (full) { G.id = -1; G.cycle = 0; G.trial.cd = TRIAL_CD0; G.trial.on = false; G.trial.n = 0; for (const k in pickStat) delete pickStat[k]; }
}

const wrapPi = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const stop = (e: Enemy): void => { e.vel.set(0, 0, 0); };
const ph = (e: Enemy): number => Math.min(2, e.phase | 0);
function setMode(e: Enemy, m: number): void {
  G.mode = m; G.t = 0;
  enter(e, m === WIND ? 'WINDUP' : m === ACT ? 'ATTACK' : m === REC ? 'RECOVER' : 'CHASE');
}
function clampArena(v: Vector3, margin: number): void {
  const lim = edgeLimit(v.x, v.z, margin), d2 = v.x * v.x + v.z * v.z;
  if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); v.x *= s; v.z *= s; }
}

// ================================================================ the AI
export function gorathKit(e: Enemy, dt: number, dist: number): void {
  install();
  if (G.id !== e.id || !kitOwns(e)) { if (!kitOwns(e)) return; G.id = e.id; G.mode = IDLE; G.cycle = 0; G.trial.cd = TRIAL_CD0; G.trial.on = false; }
  const h = nearestHero(e.pos.x, e.pos.z);
  const dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z, inv = 1 / Math.max(dist, 0.001), ux = dx * inv, uz = dz * inv;
  G.t += dt;
  if (G.mode !== IDLE && e.state === 'CHASE') { cancelCast(e); }   // something (a phase, a stagger) took the boss out of its cast
  if (!G.trial.on) G.trial.cd -= dt; else bossGapSet(e, 1.0);   // (nothing of the shared layer / dodge kit starts between the casts of a trial)

  switch (G.mode) {
    case IDLE: idle(e, dt, dist, ux, uz); return;
    case WIND: wind(e, dt); return;
    case ACT: act(e, dt); return;
    default: rec(e, ux, uz); return;
  }
}

function idle(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  if (G.trial.on) { trialIdle(e, dt, ux, uz); return; }
  if (dist > 4.5) e.vel.set(ux * e.speed * (1 + 0.25 * ph(e)), 0, uz * e.speed * (1 + 0.25 * ph(e))); else stop(e);
  // Living Statue trial first when due (not right before the invulnerable phase would cut it, not with someone hugging him: the ring answers that)
  if (G.trial.cd <= 0 && e.attackCd <= 1.2 && kitPhaseSafe(e) && !bossNear(e)) { startTrial(e); return; }
  if (!(e.attackCd <= 0 || closeDue(e))) return;
  const near = bossNear(e);
  let s: number;
  if (closeDue(e)) { s = RING; closeUsed(e, 22, 'Rock Ring'); }
  else {
    s = CYCLE[G.cycle++ % CYCLE.length];
  }
  void near;
  begin(e, s, ux, uz);
}

function lockHero(e: Enemy): void {
  const h = nearestHero(e.pos.x, e.pos.z);
  G.lx = h.pos.x; G.lz = h.pos.z;
  const dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
  G.dx = dx / d; G.dz = dz / d; G.yaw = Math.atan2(G.dx, G.dz);
}

function begin(e: Enemy, s: number, ux: number, uz: number): void {
  void ux; void uz;
  const p = ph(e);
  G.skill = s; G.hitMask = 0; G.mMask = 0; G.set2 = false; G.n = 0; G.crashed = false;
  proxBegin(e);
  stop(e);
  lockHero(e);
  kitSkill(NAME[s]);
  pickStat[NAME[s]] = (pickStat[NAME[s]] ?? 0) + 1;
  switch (s) {
    case FIST: {
      e.pattern = 0;
      const W = 1.15 - 0.08 * p;
      G.w = W + 0.55;
      kitCircle(e.id, NAME[s], G.lx, G.lz, FIST_R, 0, W, 0, 0);   // the first fill: dashing on its flash is the mistake
      kitCircle(e.id, NAME[s], G.lx, G.lz, FIST_R, W, W + 0.55, PCT_FIST[p], FX_SLAM, KB.SLAM.kb, KB.SLAM.down);   // ... the fist HOLDS, then drops
      word(e, 'FIST DROP - WAIT FOR IT!', 0xffd36a, 1.3, 8);
      break;
    }
    case THROW: e.pattern = 0; G.w = 0.75; G.n = 0; G.markT = 0; break;
    case GRID: {
      e.pattern = 0; G.w = 1.0 - 0.05 * p;
      const a = Math.random() * Math.PI, dx = Math.sin(a), dz = Math.cos(a);
      G.dx = dx; G.dz = dz;
      gridSet(e, G.lx, G.lz, dx, dz, 0, G.w);
      break;
    }
    case CHARGE: {
      e.pattern = 2; G.w = 1.05 - 0.04 * p;
      const speed = 15 + 2 * p, L = speed * ROLL_DUR + e.radius * 0.6;
      spawnTelegraphLine(e.pos.x, e.pos.z, G.dx, G.dz, L / 1.12, (ROLL_HW * 2) / 1.3, G.w, 0xef4444);   // (inside the boss update the lane is drawn 1.3x wide / 1.12x long: the passed size is pre-divided so the red body IS the hit area)
      break;
    }
    case GAZE: {
      e.pattern = 0; G.w = 1.3 - 0.1 * p;
      const ox = e.pos.x + G.dx * e.radius * 0.5, oz = e.pos.z + G.dz * e.radius * 0.5;
      kitLane(e.id, NAME[s], ox, oz, G.dx, G.dz, 75, GAZE_W, 0, G.w, PCT_GAZE[p], FX_BEAM, KB.HEAVY.kb, KB.HEAVY.down);
      word(e, 'STONE GAZE!', 0xffe9a0, 1.3, 8);
      break;
    }
    default: { // RING
      e.pattern = 1; G.w = 0.9 - 0.1 * p; G.ring = 0;
      const half = 0.42 - 0.04 * p;
      kitCircle(e.id, NAME[s], e.pos.x, e.pos.z, e.radius + 4.5, 0, G.w, 0, 0);   // red body round his feet (a warning only: the rocks do the damage)
      const cone = spawnTelegraphCone(e.pos.x, e.pos.z, G.dx, G.dz, e.radius + 12, half / 1.15, G.w, 0x4ade80, 30, 0);   // the SAFE wedge (green): the ring has a hole toward the hero's side
      if (cone) cone.safe = true;
      break;
    }
  }
  setMode(e, WIND);
  G.t = 0;
}

/** 5 parallel lanes `GRID_GAP` apart through (cx, cz) along (dx, dz); `set2` lanes are the crossing ones. */
function gridSet(e: Enemy, cx: number, cz: number, dx: number, dz: number, sh: number, t: number): void {
  const px = dz, pz = -dx;
  for (let k = -2; k <= 2; k++) {
    const mx = cx + px * k * GRID_GAP, mz = cz + pz * k * GRID_GAP;
    kitLane(e.id, NAME[GRID], mx - dx * 38, mz - dz * 38, dx, dz, 76, GRID_W, sh, t, PCT_GRID, FX_DEBRIS, KB.PUSH.kb * 0.5, 0);
  }
}

function wind(e: Enemy, dt: number): void {
  stop(e);
  void dt;
  if (G.skill === CHARGE || G.skill === GAZE || G.skill === RING) requestYaw(G.yaw);   // aim locked at windup start
  let W = G.w;
  if (G.skill === FIST) W = G.w;
  if (G.skill === THROW) W = 0.75;
  if (G.t < W) return;
  const p = ph(e);
  switch (G.skill) {
    case FIST: setMode(e, ACT); events.emit('shake', { amount: 0.4 }); break;
    case THROW: setMode(e, ACT); G.n = 0; G.markT = 0; break;
    case GRID: {   // set 1 lands: the crossing set shows up now, locked on the hero's spot now
      const h = nearestHero(e.pos.x, e.pos.z);
      gridSet(e, h.pos.x, h.pos.z, G.dz, -G.dx, 0, 0.95 - 0.05 * p);
      G.set2 = true;
      setMode(e, ACT);
      break;
    }
    case CHARGE: setMode(e, ACT); G.hitMask = 0; G.mMask = 0; break;
    case GAZE: setMode(e, ACT); break;
    default: setMode(e, ACT); G.ring = 0; break;
  }
}

function act(e: Enemy, dt: number): void {
  const p = ph(e);
  switch (G.skill) {
    case FIST: {
      stop(e);
      if (G.t >= 0.45) setMode(e, REC);
      return;
    }
    case THROW: {
      stop(e);
      const n = p >= 1 ? 4 : 3;
      G.markT -= dt;
      if (G.n < n && G.markT <= 0) {
        const h = nearestHero(e.pos.x, e.pos.z);
        const lead = 0.25;
        kitCircle(e.id, NAME[THROW], h.pos.x + h.vel.x * lead, h.pos.z + h.vel.z * lead, THROW_R, 0, 1.0, PCT_THROW, FX_BOULDER, 0.8, 0);
        G.n++; G.markT = 0.65;
        events.emit('shake', { amount: 0.12 });
      }
      if (G.n >= n && G.markT <= -0.2) setMode(e, REC);
      return;
    }
    case GRID: {
      stop(e);
      if (G.t >= 1.0) setMode(e, REC);
      return;
    }
    case CHARGE: { charge(e); return; }
    case GAZE: {
      stop(e);
      requestYaw(G.yaw);
      if (G.t >= 0.5) setMode(e, REC);
      return;
    }
    default: {   // ROCK RING: 1 (2 from phase 1) rings 0.55 s apart, the gap toward the hero's locked side
      stop(e);
      const rings = p > 0 ? 2 : 1;
      if (G.ring < rings && G.t >= G.ring * 0.55) { fireRing(e); G.ring++; }
      if (G.ring >= rings && G.t >= (rings - 1) * 0.55 + 0.3) setMode(e, REC);
    }
  }
}

function charge(e: Enemy): void {
  const p = ph(e), speed = 15 + 2 * p;
  e.vel.set(G.dx * speed, 0, G.dz * speed);
  requestYaw(G.yaw);
  // statues on the way: the boss rams the first one (crash)
  for (let i = 0; i < MAX_STATUES; i++) {
    const s = statues[i]; if (!s.on) continue;
    if ((s.x - e.pos.x) ** 2 + (s.z - e.pos.z) ** 2 < (e.radius * 0.75 + s.r) ** 2) {
      statueDown(i, true); kitStats.statuesBroken++;
      events.emit('shake', { amount: 0.9 }); events.emit('explosion', { pos: new Vector3(s.x, 1, s.z), radius: 6, color: 0xe8e0d0 });
      stop(e); G.crashed = true;
      if (!statueBroken(e, true)) { word(e, 'CRASHED!', 0xffe9a0, 1.6, 8); e.staggerT = Math.max(e.staggerT, 2.4); setMode(e, REC); G.mode = IDLE; enter(e, 'CHASE'); e.attackCd = Math.max(e.attackCd, 1.6); }
      return;
    }
  }
  G.mMask = hurtMinionsLineOnce(e.pos.x, e.pos.z, G.dx, G.dz, e.radius, e.radius + 3, ROLL_HW + 0.55, 0, PCT_ROLL, G.mMask);   // ...and every summon in it once
  // the roll hits every hero in its lane once
  const n = heroesFill(), cur = world.player;
  for (let i = 0; i < n; i++) {
    const h = HL[i];
    if (!h.alive || ((G.hitMask >> i) & 1)) continue;
    const vx = h.pos.x - e.pos.x, vz = h.pos.z - e.pos.z, along = vx * G.dx + vz * G.dz, perp = Math.abs(vx * G.dz - vz * G.dx);
    if (along > -e.radius && along < e.radius + 3 && perp < ROLL_HW + 0.55) {
      G.hitMask |= 1 << i;
      world.player = h;
      dirV.set(e.pos.x - G.dx * 4, 0, e.pos.z - G.dz * 4);
      const hp0 = h.hp;
      damagePlayer(1, { pct: PCT_ROLL, pos: dirV, kind: 'PHYSICAL', src: e, kb: KB.SLAM.kb, down: KB.SLAM.down });
      kitStats.hits[NAME[CHARGE]] = (kitStats.hits[NAME[CHARGE]] ?? 0) + 1;
      kitStats.lost[NAME[CHARGE]] = (kitStats.lost[NAME[CHARGE]] ?? 0) + Math.max(0, hp0 - h.hp) / 7419;
    }
  }
  world.player = cur;
  // walls stop the roll
  dirV.set(e.pos.x, 0, e.pos.z);
  const lim = edgeLimit(e.pos.x, e.pos.z, e.radius * 0.6);
  if (dirV.x * dirV.x + dirV.z * dirV.z > lim * lim) { stop(e); events.emit('shake', { amount: 0.5 }); setMode(e, REC); return; }
  if (G.t >= ROLL_DUR) setMode(e, REC);
}

function fireRing(e: Enemy): void {
  const p = ph(e), n = 18 + 4 * p, step = (Math.PI * 2) / n;
  const gapHalf = 0.42 - 0.04 * p;
  e.angle += step * 0.5;
  const speed = 10 + 1.5 * p;
  for (let i = 0; i < n; i++) {
    const a = e.angle + i * step;
    if (Math.abs(wrapPi(a - G.yaw)) < gapHalf) continue;   // the hole toward the hero's side
    dirV.set(Math.sin(a), 0, Math.cos(a));
    fireEnemyProjectile(e.pos, dirV, 'ROCK', speed, e.projectileDamage, { life: 4, radius: 1.5, debuff: 3 });
  }
  events.emit('shake', { amount: 0.3 });
  events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius + 3, color: 0xa8a29e });
}

function rec(e: Enemy, ux: number, uz: number): void {
  stop(e);
  void ux; void uz;
  const r = G.skill === CHARGE ? 1.0 : G.skill === FIST ? 0.9 : G.skill === GAZE ? (G.trial.on ? 0.5 : 0.8) : G.skill === THROW ? 1.3 : 0.7;
  if (G.t < r) return;
  G.mode = IDLE; enter(e, 'CHASE');
  if (G.trial.on) { G.trial.gap = TRIAL_GAP; e.attackCd = Math.max(e.attackCd, 1.5); return; }
  e.attackCd = GOLEM_CD[ph(e)] / (1 + 0.35 * proxPressure(e));
}

// ================================================================ the Living Statue trial
function startTrial(e: Enemy): void {
  const T = G.trial;
  // three statues in an arc round the boss on the hero's side, ~70 deg apart (hide spots ~20 u apart: one hop per cast), off his body and inside the arena
  const h = nearestHero(e.pos.x, e.pos.z);
  const d = e.radius + 10, bearing = Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z), spread = 1.22;
  for (let k = 0; k < STATUE_N; k++) {
    const a = bearing + (k - (STATUE_N - 1) / 2) * spread;
    dirV.set(e.pos.x + Math.sin(a) * d, 0, e.pos.z + Math.cos(a) * d);
    clampArena(dirV, STATUE_R + 3);
    statueUp(k, dirV.x, dirV.z, STATUE_R);
  }
  T.on = true; T.stage = 0; T.t = 0; T.gap = 0; T.casts = 0; T.max = ph(e) >= 1 ? 5 : 4; T.broken = 0; T.n++;
  kit.armour = true; kit.armourMul = 0.85; kitStats.trials++;
  kitSkill('Living Statue');
  stop(e);
  word(e, 'LIVING STATUES!', 0xffe9a0, 1.8, 9);
  notify('Stand behind a statue - bait Gorath\'s beam into it! Break all three!', '#ffe9a0');
  events.emit('shake', { amount: 0.6 });
}

function trialIdle(e: Enemy, dt: number, ux: number, uz: number): void {
  const T = G.trial;
  stop(e);
  requestYaw(Math.atan2(ux, uz));
  bossGapSet(e, 1.0);   // nothing else of the shared layer / dodge kit starts during the trial
  e.attackCd = Math.max(e.attackCd, 1.0);
  T.t += dt;
  if (T.stage === 0) { if (T.t >= TRIAL_RISE) { T.stage = 1; T.gap = 0.2; } return; }
  T.gap -= dt;
  if (T.gap > 0) return;
  if (statuesLive() === 0) { endTrial(e, true); return; }
  if (T.casts >= T.max) { endTrial(e, false); return; }
  const c = T.casts++;
  const s = (c === T.max - 1) ? CHARGE : GAZE;   // gazes first; the last cast is the roll (a second way to ram a statue)
  begin(e, s, ux, uz);
}

function endTrial(e: Enemy | null, won: boolean): void {
  const T = G.trial;
  for (let i = 0; i < MAX_STATUES; i++) statueDown(i, false);
  T.on = false; kit.armour = false;
  T.cd = (won ? 24 : 15) - 2 * (e ? ph(e) : 0);
  if (!won && e) { word(e, 'THE STATUES CRUMBLE', 0xd6cdb8, 1.0, 6); }
}

/** A statue just broke (bossKit: his beam hit it; or the roll rammed it). Three = STUNNED. Returns true when it stunned him. */
function statueBroken(e: Enemy, byRoll: boolean): boolean {
  const T = G.trial; T.broken++;
  if (T.broken >= STATUE_N || statuesLive() === 0) {
    G.mode = IDLE; kitCancel(e.id);
    const br = T.broken;
    endTrial(e, true);
    kitStun(e, STUN_T, `All ${br} statues shattered - STUNNED! Hit him!`);
    return true;
  }
  if (!byRoll) events.emit('floatText', { pos: e.pos, text: `${T.broken}/${STATUE_N}`, color: 0xffe9a0, scale: 1.2, dy: 9 });
  return false;
}
export function gorathStatueBroken(): void {
  const e = G.id >= 0 ? world.enemies[G.id] : null;
  if (!e || !e.active || !G.trial.on) return;
  statueBroken(e, false);
}
export const gorathTrial = G.trial;

/** Dev / QA: force skill `s` (0 Fist, 1 Ring, 2 Roll, 3 Throw, 4 Grid, 5 Gaze, 99 = the Living Statue trial) on the live Gorath. */
export function castGorath(s: number): string {
  const e = G.id >= 0 ? world.enemies[G.id] : null;
  if (!e || !e.active || e.state === 'DYING') return 'none';
  if (G.mode !== IDLE || G.trial.on) return 'busy';
  if (s === 99) { startTrial(e); return 'trial'; }
  begin(e, s, 0, 0);
  return NAME[s];
}
