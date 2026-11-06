// ============================================================================
// ELDERROOT (BOSS_TREANT, Greenwood; rooted) - the designed kit (docs/BOSS_DESIGN_REFERENCE.md "Elderroot"). The AI that used to live in
// bosses2.ts `treant()` runs here (bosses.updateBoss routes the room's Elderroot to `treantKit`; extra Elderroots of Endless Waves keep the old AI).
//
//   Skill            pattern (doc #)                 telegraph / aim lock                                         hit
//   Root Lanes       16 crossing lanes (exists)      3-4 red lanes locked on the hero at windup start; from        12% (flat, BT.ROOT roots)
//                                                    phase 1 a CROSSING set (+-90 deg) follows 0.85 s later
//   Branch Sweep     9 / 7 (exists)                  5 lashes in a fan, one after another; from phase 1 the        14% (flat, BT.LASH)
//                                                    sweep REVERSES once (4 lashes back)
//   Crushing Roots   1 + 3 (exists, close skill)     red slam circle round the trunk, then a ring of thorn         slam 25% flat + thorns (poison)
//                                                    arrows with a GAP (green wedge) toward the hero's side
//   Seed Bombs       26 baited marks (exists)        4-6 red marks, the first on the hero's spot at windup         10% flat (BT.SPIT, poison pool)
//   Grasping Vines   27 tether-style drag (exists)   locked cone, drags the hero to the trunk + root 1.2 s        flat
//   Call the Brood   31 adds (exists)                saplings run to the trunk and heal him if they arrive
//   + dodgeMechs.ts keeps Thorn Burst (DASH ring), Poison Snake and Spore Rush (Bomb Shrooms); the shared layer, the 50% Spore Garden phase
//   and the 50% barrier are untouched.
//
// SIGNATURE "Bark Armour": every ~24 s he hardens his bark (damage x0.3, `bossView.bark` draws the plates) and three glowing KNOTS appear
// round the trunk. His Root Lance (a wide lane locked on the hero at windup start, 1.0 s, every other skill while armoured) cracks a knot when its
// line runs through it: stand in line with a knot, wait for the lock, then sidestep. Three cracks = STUNNED 5 s (the bark falls off,
// damage x1.3 on top of the stagger's +25%). The old route (filling the stagger bar) still breaks the bark (bosses2 hook). 18 s at most.
// Co-op: host simulates; knots / beams are 'trick' events ("KIT_KNOT|i|state|angle|radius").
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy, Zone } from '../types';
import { edgeLimit } from '../mapgen';
import { damagePlayer, applyPlayerDebuff, KB } from './combat';
import { hurtMinionsCone } from './minionHurt';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import { enter, requestYaw, spawnEnemy, spawnTelegraphLine, spawnTelegraphCircle, spawnTelegraphCone, fireEnemyProjectile } from './enemies';
import { BT, inCone } from './bossFx';
import { bossNear, closeDue, closeUsed, proxBegin, bossGapSet } from './bossMech';
import { nearestHero, forEachHero, shoveHero } from '../heroes';
import { hooks } from './hooks';
import { bossView } from './bosses2';
import { kit, STUN_T, kitOwns, kitPhaseSafe, kitSkill, kitStun, kitStats, kitCancel, kitEvent, word, notify } from './bossKit';

const tv = new Vector3();
const dirV = new Vector3();
const ROOTS = 0, BROOD = 1, BARK = 3, VINES = 4, SEEDS = 5, SWEEP = 6, CRUSH = 7, LANCE = 8;
const NAME: Record<number, string> = { 0: 'Root Lanes', 1: 'Call the Brood', 3: 'Ironbark', 4: 'Grasping Vines', 5: 'Seed Bombs', 6: 'Branch Sweep', 7: 'Crushing Roots', 8: 'Root Lance' };
const ORDER = [ROOTS, SWEEP, BROOD, SEEDS, CRUSH, VINES, ROOTS, SWEEP, SEEDS, CRUSH];
const IDLE = 0, WIND = 1, ACT = 2, REC = 3;
const BARK_T = 20, BARK_CD0 = 9, BARK_CD = 22, KNOT_TOL = 0.3, KNOT_N = 3;
const LANE_W = 2.6, LANCE_W = 3.4;
/** Damage tuning of the flat (zone) hits: bossFx scales a zone's `damage` by BOSS_SKILL_MUL again and the test hero (def 330) takes ~5% from a 1.2 x pwr lane, so these lift the skills to the doc's feel (12 / 14 / 25 / 10%). */
const K_ROOT = 2.2, K_SWEEP = 2.6, K_LANCE = 3.8, K_SEED = 1.8, K_CRUSH = 4.2, K_VINE = 3.2;
const SOIL = 0x8a5a24, GREEN = 0x84cc16;

const T = {
  id: -1, mode: IDLE, skill: -1, t: 0, w: 0, n: 0, cycle: 0, lanceTurn: false, lances: 0,
  lx: 0, lz: 0, dx: 0, dz: 1, base: 0, dir: 1, set2: false, rev: false,
  bark: { on: false, t: 0, cd: BARK_CD0, cracked: 0 },
  knotAng: [0, 0, 0], knotOn: [false, false, false],
};
export const treantKit = T;
const SPOT_X: number[] = [], SPOT_Z: number[] = [];
const pickStat: Record<string, number> = {};
export const treantStats = pickStat;

const pwr = (e: Enemy): number => Math.max(e.projectileDamage, e.contactDamage * 0.8, 8) * BOSS_SKILL_MUL;
const ph = (e: Enemy): number => Math.min(2, e.phase | 0);
const stand = (e: Enemy): void => { e.vel.set(0, 0, 0); };
const fan = (i: number, step: number): number => ((i & 1) ? -((i + 1) >> 1) : (i >> 1)) * step;
const wrapPi = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

let hooked = false;
function install(): void {
  if (hooked) return; hooked = true;
  const prev = hooks.onStagger;
  hooks.onStagger = (e: Enemy): void => {   // the hero's stagger bar filled: bosses2 breaks the bark (floating text + BARK_BREAK); here the cast stops and the knots go out
    if (e.id === T.id && e.kind === 'BOSS_TREANT') { if (T.mode !== IDLE) { kitCancel(e.id); T.mode = IDLE; } }
    const was = bossView.bark;
    prev(e);
    if (e.id === T.id && was && !bossView.bark) endBark(e, false);
  };
}

export function abortTreant(full = false): void {
  const e = T.id >= 0 ? world.enemies[T.id] : null;
  if (e) kitCancel(e.id);
  T.mode = IDLE;
  if (T.bark.on) { clearKnots(e); T.bark.on = false; bossView.bark = false; kit.armour = false; T.bark.cd = Math.max(T.bark.cd, 10); }
  if (full) { T.id = -1; T.cycle = 0; T.bark.cd = BARK_CD0; T.bark.on = false; T.lanceTurn = false; for (const k in pickStat) delete pickStat[k]; }
}

function setMode(e: Enemy, m: number): void {
  T.mode = m; T.t = 0;
  enter(e, m === WIND ? 'WINDUP' : m === ACT ? 'ATTACK' : m === REC ? 'RECOVER' : 'CHASE');
}
function lane(e: Enemy, a: number, len: number, width: number, life: number, trick: number, dmg: number, color: number): Zone | null {
  const zn = spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), len, width, life, color);
  if (zn) { zn.trick = trick; zn.damage = dmg; }
  return zn;
}
function circle(x: number, z: number, r: number, life: number, trick: number, dmg: number, color: number): Zone | null {
  const zn = spawnTelegraphCircle(x, z, r, life, 0, color);
  if (zn) { zn.trick = trick; zn.damage = dmg; }
  return zn;
}
function countKind(kind: string): number { let n = 0; for (const a of world.enemies) if (a.active && a.kind === kind && a.state !== 'DYING') n++; return n; }

// ================================================================ the AI
export function treantAI(e: Enemy, dt: number, dist: number): void {
  install();
  if (T.id !== e.id) { if (!kitOwns(e)) return; T.id = e.id; T.mode = IDLE; T.cycle = 0; T.bark.cd = BARK_CD0; T.bark.on = false; bossView.bark = false; }
  const h = nearestHero(e.pos.x, e.pos.z);
  const inv = 1 / Math.max(dist, 0.001), ux = (h.pos.x - e.pos.x) * inv, uz = (h.pos.z - e.pos.z) * inv;
  T.t += dt;
  if (T.mode !== IDLE && e.state === 'CHASE') { kitCancel(e.id); T.mode = IDLE; }   // a phase / stagger cut the cast
  if (T.bark.on) {
    bossGapSet(e, 0.8);   // (nothing of the shared layer / dodge kit starts while the bark is up: one signature at a time)
    T.bark.t -= dt;
    if (!bossView.bark) endBark(e, false);   // the stagger bar broke it
    else if (T.bark.t <= 0) { endBark(e, false); word(e, 'BARK CRACKS', 0xffd23a, 1.2, 8); }
  } else T.bark.cd -= dt;
  switch (T.mode) {
    case IDLE: idle(e, dist, ux, uz); return;
    case WIND: wind(e, ux, uz); return;
    case ACT: act(e); return;
    default: rec(e);
  }
}

function idle(e: Enemy, dist: number, ux: number, uz: number): void {
  stand(e);   // rooted: he never walks, he waits for the next lash
  requestYaw(Math.atan2(ux, uz));
  const cDue = closeDue(e);
  if (e.attackCd > 0 && !cDue) return;
  let s: number;
  if (cDue) { s = CRUSH; closeUsed(e, 22, 'Crushing Roots'); }
  else if (!T.bark.on && T.bark.cd <= 0 && kitPhaseSafe(e)) s = BARK;
  else if (T.bark.on && T.lanceTurn) { s = LANCE; T.lances++; T.lanceTurn = (T.lances % 3) !== 0 ? true : false; }
  else {
    s = ORDER[T.cycle++ % ORDER.length];
    if (s === BROOD && (T.bark.on || countKind('BOSS_SAPLING') >= 5)) s = SEEDS;
    if (s === VINES && dist > 28) s = ROOTS;
    if (s === CRUSH) { if (bossNear(e)) closeUsed(e, 22, 'Crushing Roots'); else s = SWEEP; }
    if (T.bark.on) T.lanceTurn = true;
  }
  begin(e, s);
}

function spreadSpots(fx: number, fz: number, n: number, rMin: number, rMax: number, gap: number): number {
  let m = 0;
  for (let tries = 0; m < n && tries < n * 14; tries++) {
    let x = fx, z = fz;
    if (m > 0) { const a = Math.random() * 6.283, r = rMin + Math.random() * (rMax - rMin); x += Math.sin(a) * r; z += Math.cos(a) * r; }
    tv.set(x, 0, z);
    const lim = edgeLimit(tv.x, tv.z, 2), d2 = tv.x * tv.x + tv.z * tv.z;
    if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); tv.x *= s; tv.z *= s; }
    let ok = true; for (let q = 0; q < m; q++) if ((SPOT_X[q] - tv.x) ** 2 + (SPOT_Z[q] - tv.z) ** 2 < gap * gap) { ok = false; break; }
    if (!ok) continue;
    SPOT_X[m] = tv.x; SPOT_Z[m] = tv.z; m++;
  }
  return m;
}

function begin(e: Enemy, s: number): void {
  const p = ph(e), h = nearestHero(e.pos.x, e.pos.z);
  T.skill = s; T.set2 = false; T.rev = false; T.n = 0;
  T.lx = h.pos.x; T.lz = h.pos.z;
  const dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
  T.dx = dx / d; T.dz = dz / d; T.base = Math.atan2(T.dx, T.dz);
  proxBegin(e); stand(e);
  kitSkill(NAME[s]); pickStat[NAME[s]] = (pickStat[NAME[s]] ?? 0) + 1;
  const world_ = world.boss;
  world_.ability = NAME[s]; world_.abilityT = 2.6;
  events.emit('trick', { pos: e.pos.clone(), kind: 'BOSS_CAST', radius: 6 });
  e.pattern = s === LANCE ? 0 : s;
  switch (s) {
    case ROOTS: {
      T.w = 1.15 - 0.1 * p;
      const n = 3 + p;
      for (let i = 0; i < n; i++) lane(e, T.base + fan(i, 0.4), 38, LANE_W, T.w, BT.ROOT, pwr(e) * 1.2 * K_ROOT, SOIL);
      break;
    }
    case SWEEP: {
      T.w = 1.2 - 0.08 * p; T.dir = (T.cycle & 1) ? 1 : -1;
      for (let i = 0; i < 5; i++) lane(e, T.base + (i - 2) * 0.5 * T.dir, 40, 3.2, T.w + i * 0.26, BT.LASH, pwr(e) * 1.2 * K_SWEEP, SOIL);
      break;
    }
    case CRUSH: {
      T.w = 1.25;
      circle(e.pos.x, e.pos.z, e.radius + 4.2, T.w, BT.SURFACE, pwr(e) * 1.1 * K_CRUSH, SOIL);
      const half = 0.42 - 0.04 * p;
      const cone = spawnTelegraphCone(e.pos.x, e.pos.z, T.dx, T.dz, e.radius + 14, half / 1.15, T.w, 0x4ade80, BT.VISUAL, 0);   // the SAFE wedge of the thorn ring
      if (cone) cone.safe = true;
      break;
    }
    case SEEDS: {
      T.w = 0.9;
      const n = spreadSpots(h.pos.x + h.vel.x * 0.5, h.pos.z + h.vel.z * 0.5, 4 + p, 6, 12, 6.5);
      for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 2.4, 1.0 + i * 0.16, BT.SPIT, pwr(e) * 1.1 * K_SEED, GREEN);
      break;
    }
    case VINES: {
      T.w = 1.0 - 0.08 * p; e.dir.set(T.dx, 0, T.dz);
      spawnTelegraphCone(e.pos.x, e.pos.z, T.dx, T.dz, 24, 0.5, T.w, 0x6aa82a, BT.VISUAL, 0);
      break;
    }
    case BROOD: T.w = 1.0; circle(e.pos.x, e.pos.z, e.radius + 5, 1.0, BT.VISUAL, 0, GREEN); break;
    case BARK: T.w = 1.2; circle(e.pos.x, e.pos.z, e.radius + 3, 1.2, BT.VISUAL, 0, 0xc8a050); break;
    default: {   // LANCE
      T.w = 1.0;
      lane(e, T.base, 44, LANCE_W, T.w, BT.LASH, pwr(e) * 1.3 * K_LANCE, SOIL);
      word(e, 'ROOT LANCE!', 0xffd36a, 1.2, 8);
      break;
    }
  }
  setMode(e, WIND);
}

function wind(e: Enemy, ux: number, uz: number): void {
  stand(e);
  void ux; void uz;
  if (T.skill === VINES || T.skill === LANCE || T.skill === CRUSH || T.skill === ROOTS) requestYaw(T.base);
  if (T.t < T.w) return;
  const p = ph(e);
  switch (T.skill) {
    case ROOTS: if (p >= 1) { T.set2 = true; const per = 1 + p; for (let side = -1; side <= 1; side += 2) for (let j = 0; j < per; j++) lane(e, T.base + side * Math.PI / 2 + (j - (per - 1) / 2) * 0.45, 38, LANE_W, 0.85, BT.ROOT, pwr(e) * 1.2 * K_ROOT, SOIL); } setMode(e, ACT); break;
    case SWEEP: setMode(e, ACT); break;
    case CRUSH: fireThorns(e); setMode(e, ACT); break;
    case VINES: fireVines(e); setMode(e, ACT); break;
    case BROOD: fireBrood(e); setMode(e, ACT); break;
    case BARK: startBark(e); setMode(e, ACT); break;
    case LANCE: crackKnots(e); if (T.mode === IDLE) return; setMode(e, ACT); break;
    default: setMode(e, ACT); break;
  }
}

function act(e: Enemy): void {
  stand(e);
  const p = ph(e);
  let dur = 0.4;
  switch (T.skill) {
    case ROOTS: dur = p >= 1 ? 1.0 : 0.4; break;
    case SWEEP: {
      if (p >= 1) {   // the sweep REVERSES once: four lashes back along the same fan, after the first set resolved
        if (!T.rev && T.t >= 4 * 0.26 + 0.1) {
          T.rev = true;
          for (let j = 0; j < 4; j++) lane(e, T.base + (3 - j - 2) * 0.5 * T.dir, 40, 3.2, 1.0 + j * 0.24, BT.LASH, pwr(e) * 1.2 * K_SWEEP, SOIL);
        }
        dur = 4 * 0.26 + 0.1 + 1.0 + 4 * 0.24;
      } else dur = 4 * 0.26 + 0.3;
      break;
    }
    case CRUSH: dur = 0.5; break;
    case LANCE: dur = 0.4; break;
    default: dur = 0.4;
  }
  if (T.t >= dur) setMode(e, REC);
}

function rec(e: Enemy): void {
  stand(e);
  const r = T.skill === ROOTS ? 0.9 : T.skill === SWEEP ? 1.1 : T.skill === CRUSH ? 1.2 : T.skill === BROOD ? 0.9 : T.skill === VINES ? 1.0 : T.skill === SEEDS ? 0.9 : T.skill === LANCE ? 0.9 : 0.6;
  if (T.t < r) return;
  T.mode = IDLE; enter(e, 'CHASE');
  const p = ph(e);
  e.attackCd = T.bark.on && T.skill === LANCE ? 1.0 : Math.max(1.5, 2.5 * (1 - 0.14 * p) * (T.bark.on ? 0.8 : 1));
}

// ---------------------------------------------------------------- skills' strike moments
function fireThorns(e: Enemy): void {
  const p = ph(e), n = 22 + 4 * p, step = (Math.PI * 2) / n, gapHalf = 0.42 - 0.04 * p;
  const yaw = Math.atan2(T.dx, T.dz);
  e.angle += step * 0.5;
  for (let i = 0; i < n; i++) {
    const a = e.angle + i * step;
    if (Math.abs(wrapPi(a - yaw)) < gapHalf) continue;
    dirV.set(Math.sin(a), 0, Math.cos(a));
    fireEnemyProjectile(e.pos, dirV, 'POISON_ARROW', 11, e.projectileDamage * 0.9, { life: 3.4, radius: 0.9, pct: 0.08 });   // (a thorn = 8% of max HP: ~1-2 reach a hero standing in the ring)
  }
  events.emit('shockwave', { pos: e.pos.clone(), radius: 10, color: GREEN });
  events.emit('shake', { amount: 0.45 });
}

function fireVines(e: Enemy): void {
  events.emit('trick', { pos: e.pos.clone(), kind: 'ROOTS', radius: 10 });
  hurtMinionsCone(e.pos.x, e.pos.z, e.dir.x, e.dir.z, 24, 0.5, pwr(e) * K_VINE);   // the vines lash summons in the cone too
  forEachHero((p) => {
    if (!p.alive || !inCone(p.pos.x, p.pos.z, e.pos.x, e.pos.z, e.dir.x, e.dir.z, 24, 0.5)) return;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1, pull = Math.max(0, d - (e.radius + 1.5));
    shoveHero(p, (dx / d) * pull, (dz / d) * pull);
    damagePlayer(pwr(e) * K_VINE, { pos: e.pos, kind: 'PHYSICAL' });
    applyPlayerDebuff('ROOT', 1.2);
    events.emit('floatText', { pos: p.pos, text: 'DRAGGED IN', color: 0x9be32a, scale: 0.9, dy: 2.2 });
  });
}

function fireBrood(e: Enemy): void {
  const n = 3 + ph(e), base = Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    if (countKind('BOSS_SAPLING') >= 8) break;
    const a = base + (i / n) * 6.283, r = e.radius + 3.5;
    tv.set(e.pos.x + Math.sin(a) * r, 0, e.pos.z + Math.cos(a) * r);
    const lim = edgeLimit(tv.x, tv.z, 3), d2 = tv.x * tv.x + tv.z * tv.z;
    if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); tv.x *= s; tv.z *= s; }
    const sp = spawnEnemy('BOSS_SAPLING', tv);
    if (sp) { sp.maxHp = Math.max(1, Math.round(sp.maxHp * 0.35)); sp.hp = sp.maxHp; sp.speed *= 1.5; sp.stateT = 0.25; }
  }
  events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 7 });
}

// ================================================================ Bark Armour
function startBark(e: Enemy): void {
  T.bark.on = true; T.bark.t = BARK_T; T.bark.cracked = 0; T.lanceTurn = true; T.lances = 0; kitStats.barks++;
  bossView.bark = true; bossView.barkT = BARK_T;
  kit.armour = true; kit.armourMul = 0.5 / 0.3;   // (bosses2's bark hook already takes x0.3: net x0.5 while the armour is up)
  // three knots round the trunk, >= 1.8 rad apart, anywhere the hero can stand in line with them
  const a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < KNOT_N; i++) { T.knotAng[i] = a0 + (i * Math.PI * 2) / KNOT_N + (Math.random() - 0.5) * 0.5; T.knotOn[i] = true; knotEvent(e, i, 1); }
  word(e, 'BARK ARMOUR!', 0xc8a050, 1.6, 9);
  notify('Elderroot is armoured! Stand in line with a glowing knot - his Root Lance cracks it. Crack all three!', '#e6c36a');
}
function knotEvent(e: Enemy, i: number, state: number): void { kitEvent(e.pos.x, e.pos.z, `KIT_KNOT|${i}|${state}|${T.knotAng[i].toFixed(3)}|${e.radius.toFixed(2)}`, e.radius); }
function clearKnots(e: Enemy | null): void {
  if (!e) return;
  for (let i = 0; i < KNOT_N; i++) if (T.knotOn[i]) { T.knotOn[i] = false; knotEvent(e, i, 0); }
}
/** The Root Lance resolves: a knot whose bearing lies within KNOT_TOL of the lance's bearing cracks. */
function crackKnots(e: Enemy): void {
  if (!T.bark.on) return;
  for (let i = 0; i < KNOT_N; i++) {
    if (!T.knotOn[i]) continue;
    if (Math.abs(wrapPi(T.knotAng[i] - T.base)) > KNOT_TOL) continue;
    T.knotOn[i] = false; T.bark.cracked++; kitStats.knotsCracked++;
    knotEvent(e, i, 2);
    word(e, `KNOT CRACKED ${T.bark.cracked}/${KNOT_N}`, 0xffd23a, 1.3, 9);
    events.emit('shake', { amount: 0.45 });
    if (T.bark.cracked >= KNOT_N) { endBark(e, true); return; }
  }
}
function endBark(e: Enemy, won: boolean): void {
  if (!T.bark.on) return;
  clearKnots(e);
  T.bark.on = false; bossView.bark = false; bossView.barkT = 0; kit.armour = false;
  T.bark.cd = won ? BARK_CD + 4 : BARK_CD + 4;
  T.lanceTurn = false;
  if (won) {
    kitEvent(e.pos.x, e.pos.z, 'BARK_BREAK', 6);
    T.mode = IDLE; kitCancel(e.id);
    kitStun(e, STUN_T, 'The bark shatters - STUNNED! Hit him!');
  }
}

export function treantBarkOn(): boolean { return T.bark.on; }

/** Dev / QA: force skill `s` (0 Roots, 1 Brood, 3 Bark Armour, 4 Vines, 5 Seeds, 6 Sweep, 7 Crush, 8 Root Lance) on the live Elderroot. */
export function castTreant(s: number): string {
  const e = T.id >= 0 ? world.enemies[T.id] : null;
  if (!e || !e.active || e.state === 'DYING') return 'none';
  if (T.mode !== IDLE) return 'busy';
  begin(e, s);
  return NAME[s];
}
