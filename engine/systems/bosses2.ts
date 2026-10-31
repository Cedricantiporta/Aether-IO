// ============================================================================
// Wave 30-70 boss AIs: Elderroot (30), Mire Hydra (40), Glacius (50), Ignar (60), Void Herald (70).
// Called by bosses.updateBoss() every frame once the boss is past SPAWN. Same shape as the Golem / Lich AI:
//   CHASE (position, wait for e.attackCd) -> WINDUP (telegraph) -> ATTACK (effect) -> RECOVER (punish window) -> CHASE
// e.pattern = attack id of the running attack. Everything telegraphed is a hostile Zone resolved by bossFx.resolveBossZone()
// (Zone.trick = BT.*), expanding rings / props / portals / echoes live in bossFx.ts. Only one boss exists at a time, so the
// extra per-boss memory (bark armor, hydra heads, dive state...) is one module-level object `S` (exported read-only as `bossView`
// for render/Bosses2.tsx). Boss adds (saplings / hydra heads / imps) are ordinary enemies with their own tiny AIs below.
// No allocations in the per-frame paths: scratch vectors, no closures (attack tables are built once at load).
// NOTE: imported consts (BT, WAVE_*) are only read inside functions - this module is part of an import cycle.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy, EnemyKind, Zone } from '../types';
import { isBossAdd } from '../enemyDefs';
import { edgeLimit } from '../mapgen';
import { insideShape } from '../roomShape';
import { useGameStore } from '../../store';
import { hooks } from './hooks';
import { damagePlayer, applyPlayerDebuff, KB } from './combat';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import {
  enter, requestYaw, spawnEnemy, spawnTelegraphCircle, spawnTelegraphLine, spawnTelegraphCone, fireEnemyProjectile,
} from './enemies';
import {
  BT, WAVE_THORN, WAVE_VOID, WAVE_FIRE, WAVE_FROST, WAVE_TIDE, PROP_GLOB, arena, breath, dive, inCone,
  spawnWave, spawnProp, spawnPortal, spawnEcho, clampToVoid, stat, endBossFx, firePatch, fireRoom, firePatchRaw, frostHit, burnHit,
} from './bossFx';
import { wardedBossId, bossNear, closeDue, closeUsed, proxBegin } from './bossMech';
import { tickIgnarLava, resetIgnarLava } from './ignarLava';
import { bp } from './bossPhaseState';
import { spawnIllusions, clearDecoys } from './bossSpecials';
import {
  mfx, queueHole, holesBusy, tickVoidFx, clearVoidFx, spawnRune,
} from './voidFx';

export function isBoss2(k: EnemyKind): boolean {
  return k === 'BOSS_TREANT' || k === 'BOSS_HYDRA' || k === 'BOSS_WYRM' || k === 'BOSS_WARLORD' || k === 'BOSS_WARMACH' || k === 'BOSS_VOID';
}

const tv = new Vector3();
/** Spread-out salvo spots (owner: boss impacts must not bunch up): the first on (fx, fz), the rest at rMin..rMax from it,
 *  every spot >= gap from the others. Writes into SPOT_X / SPOT_Z, returns how many were placed. */
const SPOT_X: number[] = [], SPOT_Z: number[] = [];
function spreadSpots(fx: number, fz: number, n: number, rMin: number, rMax: number, gap: number): number {
  let m = 0;
  for (let tries = 0; m < n && tries < n * 14; tries++) {
    let x = fx, z = fz;
    if (m > 0) { const a = Math.random() * 6.283, r = rMin + Math.random() * (rMax - rMin); x += Math.sin(a) * r; z += Math.cos(a) * r; }
    tv.set(x, 0, z); clampArena(tv, 2);
    let ok = true; for (let q = 0; q < m; q++) if ((SPOT_X[q] - tv.x) ** 2 + (SPOT_Z[q] - tv.z) ** 2 < gap * gap) { ok = false; break; }
    if (!ok) continue;
    SPOT_X[m] = tv.x; SPOT_Z[m] = tv.z; m++;
  }
  return m;
}
const dirV = new Vector3();

// ------------------------------------------------------------ shared state ---
export const S = {
  id: -1, phase: 0, cycle: 0,
  // Elderroot
  bark: false, barkT: 0, wantBark: false, rings: 0, ringN: 0,
  // Mire Hydra
  heads: [-1, -1, -1, -1, -1] as number[], regrowT: [0, 0, 0, 0, 0] as number[], regrowN: 0, headsDead: 0, headAng: 0, sub: false, subX: 0, subZ: 0, subFx: 0, subFz: 0,
  /** (rooted Hydra) per head / spare slot: lunge timer (0 = idle) and where it is whipping to */
  lungeT: [0, 0, 0, 0, 0, 0, 0, 0] as number[], lungeX: [0, 0, 0, 0, 0, 0, 0, 0] as number[], lungeZ: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  // Glacius
  air: false, wantBlizz: false, blizzT: 0, diveZone: null as Zone | null,
  // Ignar
  enraged: false, wheelA: 0, ringT: 0, cleaveCd: 0, wheelN: 0,
  guardT: 0, shT: 0, dashPh: 2, dashT: 0, dashLen: 0, slashT: 0, slashD: 0, trailD: 0, sx: 0, sz: 0, sdx: 0, sdz: 1,   // (owner rework) Blazing Guard / fire shield timers, dash + slash state, fire-trail lane
  formT: 0, auraT: 0,   // (owner) Burning Form: formT = the transformation in progress; enraged = in the burning form
  // the Dune Colossus (desert war machine)
  rayA: 0, rayT: 0, rayN: 0, ramHit: false, stompCd: 0, turret: 0, stride: 1, strideT: 0, trailT: 0,   // (owner 2026-10-31) the flamethrower: strafe direction / timer, fire-trail timer
  // Void Herald
  voidOn: false, gravT: 0, pushed: false,
  /** form: 0 first form, 1 transforming (untouchable), 2 final form (huge wings); formT = transformation seconds left; sweep = laser sweep direction */
  vform: 0, vformT: 0, sweep: 1,
};
/** Read-only view for the renderer. */
export const bossView = S;

/** (owner) the rooted Hydra grows this many heads (it used to be 3). */
export const NH = 5;
export function resetBosses2(): void {
  S.id = -1; S.phase = 0; S.cycle = 0; S.stompCd = 0;
  S.bark = false; S.barkT = 0; S.wantBark = false; S.rings = 0; S.ringN = 0;
  for (let k = 0; k < NH; k++) { S.heads[k] = -1; S.regrowT[k] = 0; }
  for (let k = 0; k < 8; k++) S.lungeT[k] = 0;
  S.regrowN = 0; S.headsDead = 0; S.headAng = 0; S.sub = false;
  S.air = false; S.wantBlizz = false; S.blizzT = 0; S.diveZone = null;
  S.enraged = false; S.wheelA = 0; S.ringT = 0; S.cleaveCd = 0; S.wheelN = 0; S.formT = 0; S.auraT = 0; S.guardT = 0; S.shT = 0; S.dashPh = 2;
  S.voidOn = false; S.gravT = 0; S.pushed = false; S.vform = 0; S.vformT = 0; bp.xformId = -1;
  S.stride = 1; S.strideT = 0; resetIgnarLava();
}

// ------------------------------------------------------------------ helpers ---
function stand(e: Enemy): void { e.vel.set(0, 0, 0); }
function drive(e: Enemy, ux: number, uz: number, sp: number): void { e.vel.set(ux * sp, 0, uz * sp); }
function pwr(e: Enemy): number { return Math.max(e.projectileDamage, e.contactDamage * 0.8, 8) * BOSS_SKILL_MUL; }

/** Ranged-ish positioning: back off inside `near`, close in beyond `far`, otherwise circle the player. */
function keepRange(e: Enemy, ux: number, uz: number, dist: number, near: number, far: number, sp: number, strafe: number): void {
  if (dist < near) drive(e, -ux, -uz, sp * 1.2);
  else if (dist > far) drive(e, ux, uz, sp);
  else { const s = (e.id & 1) === 0 ? 1 : -1; drive(e, uz * s, -ux * s, sp * strafe); }
}

function clampArena(v: Vector3, margin: number): void {
  const lim = edgeLimit(v.x, v.z, margin);
  const d2 = v.x * v.x + v.z * v.z;
  if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); v.x *= s; v.z *= s; }
}

function circle(x: number, z: number, r: number, life: number, trick: number, dmg: number, color: number): Zone | null {
  const zn = spawnTelegraphCircle(x, z, r, life, 0, color);
  if (zn) { zn.trick = trick; zn.damage = dmg; }
  return zn;
}
function lane(e: Enemy, dx: number, dz: number, len: number, width: number, life: number, trick: number, dmg: number, color: number): Zone | null {
  const zn = spawnTelegraphLine(e.pos.x, e.pos.z, dx, dz, len, width, life, color);
  if (zn) { zn.trick = trick; zn.damage = dmg; }
  return zn;
}
function cone(e: Enemy, dx: number, dz: number, range: number, half: number, life: number, trick: number, dmg: number, color: number): Zone | null {
  return spawnTelegraphCone(e.pos.x, e.pos.z, dx, dz, range, half, life, color, trick, dmg);
}
/** Fan index -> angle offset: 0, -1, +1, -2, +2 ... so any count is centred on the aim. */
function fan(i: number, step: number): number { return ((i & 1) ? -((i + 1) >> 1) : (i >> 1)) * step; }

function notify(msg: string, color: string): void { useGameStore.getState().addNotification(msg, color, 'BOSS'); }

function bossEnemy(): Enemy | null {
  if (S.id < 0) return null;
  const b = world.enemies[S.id];
  return b.active && b.boss && b.state !== 'DYING' ? b : null;
}
function countAdds(kind: EnemyKind): number {
  const list = world.enemies;
  let n = 0;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.active && a.kind === kind && a.state !== 'DYING') n++; }
  return n;
}
function poofAdd(a: Enemy): void {
  if (!a.active || a.state === 'DYING') return;
  a.state = 'DYING'; a.stateT = 0; a.deathT = 0; a.hp = 0; a.vel.set(0, 0, 0);
  events.emit('enemyDeath', { pos: a.pos, kind: a.kind, elite: false, boss: false, scale: a.scale, poof: true });
}
/** Spawns a boss add (capped). `hpMul` trims its wave-scaled hp; the add skips most of its rise animation. */
function spawnAdd(kind: EnemyKind, x: number, z: number, hpMul: number, speedMul: number, cap: number): Enemy | null {
  if (countAdds(kind) >= cap) return null;
  tv.set(x, 0, z); clampArena(tv, 3); clampToVoid(tv, 2);
  const a = spawnEnemy(kind, tv);
  if (!a) return null;
  a.maxHp = Math.max(1, Math.round(a.maxHp * hpMul)); a.hp = a.maxHp; a.speed *= speedMul; a.stateT = 0.25;
  return a;
}

// ------------------------------------------------------------ attack tables ---
interface Atk {
  name: string;
  wind(e: Enemy): number;
  act(e: Enemy): number;
  rec(e: Enemy): number;
  /** WINDUP start: spawn telegraphs. */
  begin(e: Enemy, ux: number, uz: number, dist: number): void;
  /** ATTACK start (the moment the telegraphs resolve). */
  fire(e: Enemy, ux: number, uz: number): void;
  tick?(e: Enemy, dt: number, ux: number, uz: number, dist: number): void;
  /** Ends the ATTACK early when it returns true (otherwise after act()). */
  done?(e: Enemy): boolean;
  /** Cleanup; must be safe to call from any state (also used when a stagger interrupts the attack). */
  end?(e: Enemy): void;
  /** Creeping speed multiplier while winding up (default planted). */
  windMove?: number;
  /** Per-frame hook during WINDUP (turning toward the telegraph...). */
  windTick?(e: Enemy): void;
}
const LISTS: Partial<Record<EnemyKind, Atk[]>> = {};
const BASE_CD: Partial<Record<EnemyKind, number>> = { BOSS_TREANT: 2.5, BOSS_HYDRA: 2.3, BOSS_WYRM: 2.1, BOSS_WARLORD: 1.8, BOSS_WARMACH: 1.9, BOSS_VOID: 1.9 };

function cdFor(e: Enemy): number {
  // (balance pass 2026-10-26: Burning Form 0.5 -> 0.65 and a floor of 1.5 s so major attacks never chain back to back)
  return Math.max(1.5, (BASE_CD[e.kind] ?? 2) * (1 - 0.14 * e.phase) * (S.enraged ? 0.65 : 1) * (S.bark ? 0.8 : 1) * (S.blizzT > 0 ? 0.85 : 1));
}

/** (owner) Ignar's Burning Form: wind-ups, telegraphs and recoveries take 70% of the time. */
const fast = (e: Enemy): number => (e.kind === 'BOSS_WARLORD' ? (S.enraged ? 0.66 : 0.82) : 1);
/** Ignar's hit power (x1.3 in the Burning Form). */
const ipwr = (e: Enemy): number => pwr(e) * (S.enraged ? 1.3 : 1);

function beginAtk(e: Enemy, list: Atk[], id: number, ux: number, uz: number, dist: number): void {
  const a = list[id];
  e.pattern = id; e.patternT = 0;
  proxBegin(e);
  enter(e, 'WINDUP');
  const b = world.boss;
  b.ability = a.name; b.abilityT = 2.6;
  stat(a.name);
  events.emit('trick', { pos: e.pos.clone(), kind: 'BOSS_CAST', radius: 6 });
  a.begin(e, ux, uz, dist);
}

/** Runs WINDUP / ATTACK / RECOVER of the current attack. Returns true when it handled the frame. */
function runAtk(e: Enemy, list: Atk[], dt: number, ux: number, uz: number, dist: number): boolean {
  const a = list[e.pattern];
  switch (e.state) {
    case 'WINDUP':
      if (a.windMove && !e.rooted) keepRange(e, ux, uz, dist, 5, 12, e.speed * a.windMove, 0.3); else stand(e);
      if (a.windTick) a.windTick(e);
      if (e.stateT >= a.wind(e) * fast(e)) { enter(e, 'ATTACK'); a.fire(e, ux, uz); }
      return true;
    case 'ATTACK':
      if (a.tick) a.tick(e, dt, ux, uz, dist); else stand(e);
      if (a.done ? a.done(e) : e.stateT >= a.act(e)) { if (a.end) a.end(e); enter(e, 'RECOVER'); }
      return true;
    case 'RECOVER':
      stand(e);
      if (e.stateT >= a.rec(e) * fast(e)) { enter(e, 'CHASE'); e.attackCd = cdFor(e); }
      return true;
    default: return false;
  }
}

// A stagger interrupts whatever the boss is doing (and breaks Elderroot's bark armor).
hooks.onStagger = (e: Enemy): void => {
  if (e.id !== S.id || !isBoss2(e.kind)) return;
  const list = LISTS[e.kind];
  const a = list ? list[e.pattern] : undefined;
  if (a && a.end && (e.state === 'WINDUP' || e.state === 'ATTACK')) a.end(e);
  if (e.state !== 'SPAWN' && e.state !== 'DYING') { enter(e, 'CHASE'); e.attackCd = 1.6; }
  stand(e);
  if (S.bark) { S.bark = false; S.barkT = 0; events.emit('floatText', { pos: e.pos, text: 'BARK SHATTERED', color: 0xffd23a, scale: 1.0, dy: 2.2 }); events.emit('trick', { pos: e.pos.clone(), kind: 'BARK_BREAK', radius: 6 }); stat('BarkBroken'); }
};

// Incoming damage: Elderroot's bark armor, Mire Hydra's heads shielding the body.
const HYDRA_MUL = [0.45, 0.6, 0.8, 1.0, 1.25, 1.5];   // by severed heads (0..5)
hooks.damageMul = (e: Enemy): number => {
  if (e.id !== S.id) return 1;
  if (e.kind === 'BOSS_TREANT') return S.bark ? 0.3 : 1;
  if (e.kind === 'BOSS_HYDRA') return HYDRA_MUL[S.headsDead];
  if (e.kind === 'BOSS_VOID') return S.vformT > 0 ? 0 : 1;   // transforming: untouchable
  if (e.kind === 'BOSS_WARLORD') return S.formT > 0 ? 0 : S.guardT > 0 ? 0.5 : 1;   // transforming: untouchable; Blazing Guard: half damage
  return 1;
};

// ----------------------------------------------------------------- entry ------
export function initBoss2(e: Enemy): void {
  resetBosses2();
  S.id = e.id;
  e.pattern = 0; e.attackCd = 3.2;
  if (e.kind === 'BOSS_VOID') voidStage(e);   // the Void stage is up from the first second
  if (e.kind === 'BOSS_HYDRA') {
    S.headAng = Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z);
    for (let k = 0; k < NH; k++) growHead(e, k);
  }
}

/** Where hydra head slot k rests (the front row k < NH reaches in along the far rim, spare heads from the ward sit one row further in). */
export function headAnchor(b: Enemy, k: number, out: { x: number; z: number }): void {
  const R = world.room.radius, row = k < NH ? 0 : 1, i = row === 0 ? k : k - NH;
  const th = Math.atan2(b.pos.x, -b.pos.z) + (row === 0 ? (k - (NH - 1) / 2) * 0.36 : (i - 1) * 0.62 + 0.16);
  const rr = R - 3.4 - row * 6.5;
  out.x = Math.sin(th) * rr; out.z = -Math.cos(th) * rr;
}
const ha = { x: 0, z: 0 };
/** (owner 2026-10-26) heads were squishy: x1.9 of the base head hp (was x0.7 = ~2.7x tougher), armour +50%. (bossMech spare heads: x2.2.) */
const HEAD_HP_MUL = 1.9;
/** (Re)grows hydra head k at its rest spot. */
function growHead(e: Enemy, k: number): void {
  headAnchor(e, k, ha);
  tv.set(ha.x, 0, ha.z);
  const h = spawnEnemy('BOSS_HYDRA_HEAD', tv);
  if (!h) return;
  h.pattern = k; h.attackCd = 3.2 + k * 1.5; h.maxHp = Math.round(h.maxHp * HEAD_HP_MUL); h.hp = h.maxHp; h.armor = Math.round(h.armor * 1.5);
  S.heads[k] = h.id; S.lungeT[k] = 0;
}

export function bossDied2(e: Enemy): void {
  if (!isBoss2(e.kind) || e.id !== S.id) return;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.active && isBossAdd(a.kind)) poofAdd(a); }
  endBossFx();
  S.id = -1; S.bark = false; S.sub = false; S.air = false; S.blizzT = 0; S.enraged = false; S.formT = 0; S.guardT = 0; S.voidOn = false; S.vform = 0; S.vformT = 0;
  if (e.kind === 'BOSS_VOID') { clearDecoys(); clearVoidFx(); }
  stat('BossDied');
}

function checkPhase2(e: Enemy): void {
  if (e.phase === S.phase) return;
  S.phase = e.phase;
  switch (e.kind) {
    case 'BOSS_TREANT': S.wantBark = true; break;
    case 'BOSS_WYRM': S.wantBlizz = true; break;
    default: break;
  }
}

export function updateBoss2(e: Enemy, dt: number, dist: number): void {
  if (S.id !== e.id) S.id = e.id; // safety (e.g. hot reload)
  checkPhase2(e);
  const inv = 1 / Math.max(dist, 0.001);
  const ux = (world.player.pos.x - e.pos.x) * inv, uz = (world.player.pos.z - e.pos.z) * inv;
  switch (e.kind) {
    case 'BOSS_TREANT': treant(e, dt, dist, ux, uz); break;
    case 'BOSS_HYDRA': hydra(e, dt, dist, ux, uz); break;
    case 'BOSS_WYRM': wyrm(e, dt, dist, ux, uz); break;
    case 'BOSS_WARLORD': warlord(e, dt, dist, ux, uz); break;
    case 'BOSS_WARMACH': warmach(e, dt, dist, ux, uz); break;
    default: herald(e, dt, dist, ux, uz); break;
  }
}

// ============================================================ ELDERROOT =======
const T_ROOTS = 0, T_BROOD = 1, T_THORN = 2, T_BARK = 3, T_VINES = 4, T_SEEDS = 5, T_SWEEP = 6, T_SLAM = 7;
// (owner) Elderroot is ROOTED now (huge, never walks): arena-wide lanes, sweeping branches, slams round the trunk, seed pods, brood
const TREANT_ORDER = [T_ROOTS, T_SWEEP, T_BROOD, T_SEEDS, T_SLAM, T_VINES, T_THORN, T_ROOTS, T_SWEEP, T_SEEDS, T_SLAM, T_THORN];

LISTS.BOSS_TREANT = [
  { // Root Eruption: lanes of roots burst out of the ground, rooting whoever stands in them. Sidestep or dash through.
    name: 'Root Eruption!', wind: (e) => 1.15 - 0.1 * e.phase, act: (e) => (e.phase >= 1 ? 0.9 : 0.4), rec: () => 0.9,
    begin(e, ux, uz) {
      const n = 3 + e.phase, base = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const a = base + fan(i, 0.4); lane(e, Math.sin(a), Math.cos(a), 38, 2.6, 1.15 - 0.1 * e.phase, BT.ROOT, pwr(e) * 1.2, 0x8a5a24); }
    },
    fire(e, ux, uz) {
      if (e.phase < 1) return;
      const base = Math.atan2(ux, uz);
      for (let i = 0; i < e.phase + 1; i++) { const a = base + fan(i, 0.5); lane(e, Math.sin(a), Math.cos(a), 38, 2.6, 0.85, BT.ROOT, pwr(e) * 1.2, 0x8a5a24); }
    },
  },
  { // Brood: saplings rise and waddle to Elderroot. Kill them (they burst into thorns) or he fuses with them and heals.
    name: 'Call the Brood!', wind: () => 1.0, act: () => 0.4, rec: () => 0.9,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 5, 1.0, BT.VISUAL, 0, 0x84cc16); },
    fire(e) {
      const n = 3 + e.phase, base = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283, r = e.radius + 3.5;
        spawnAdd('BOSS_SAPLING', e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 0.35, 1.5, 8);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 7 });
    },
  },
  { // Thorn Ring: expanding rings of thorns. Jump / dash through the ring (i-frames) or outrun it.
    name: 'Thorn Ring!', wind: () => 1.0, act: (e) => 0.6 * (1 + e.phase) + 0.1, rec: () => 1.0,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 4, 1.0, BT.VISUAL, 0, 0x84cc16); },
    fire(e) { S.rings = 1 + e.phase; S.ringN = 0; },
    tick(e) {
      stand(e);
      while (S.ringN < S.rings && e.stateT >= S.ringN * 0.6) {
        spawnWave(e.pos.x, e.pos.z, 13, 40, 1.8, pwr(e) * 1.1, WAVE_THORN, 0x84cc16, e.radius);   // (balance pass 2: x1.1; was x1.3, x0.9 while the dash came at Lv 20 - it now unlocks at Lv 6)
        events.emit('shockwave', { pos: e.pos.clone(), radius: 8, color: 0x84cc16 });
        events.emit('shake', { amount: 0.35 });
        S.ringN++;
      }
    },
  },
  { // Ironbark: bark armor, heavy damage reduction until he is staggered (or 16 s pass).
    name: 'Ironbark!', wind: () => 1.2, act: () => 0.3, rec: () => 0.6,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 3, 1.2, BT.VISUAL, 0, 0xc8a050); },
    fire(e) {
      S.bark = true; S.barkT = 16;
      events.emit('floatText', { pos: e.pos, text: 'IRONBARK', color: 0xc8a050, scale: 1.0, dy: 2.4 });
      notify('Elderroot hardens his bark - STAGGER him to break it!', '#c8a050');
    },
  },
  { // Grasping Vines: a cone of vines lashes out; anyone caught is dragged to Elderroot and rooted at his feet.
    name: 'Grasping Vines!', wind: (e) => 1.0 - 0.08 * e.phase, act: () => 0.3, rec: () => 1.0,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, 24, 0.5, 1.0 - 0.08 * e.phase, BT.VISUAL, 0, 0x6aa82a); },
    fire(e) {
      const p = world.player;
      events.emit('trick', { pos: e.pos.clone(), kind: 'ROOTS', radius: 10 });
      if (!p.alive || !inCone(p.pos.x, p.pos.z, e.pos.x, e.pos.z, e.dir.x, e.dir.z, 24, 0.5)) return;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1, pull = Math.max(0, d - (e.radius + 1.5));
      p.pos.x += (dx / d) * pull; p.pos.z += (dz / d) * pull;
      damagePlayer(pwr(e), { pos: e.pos, kind: 'PHYSICAL' });
      applyPlayerDebuff('ROOT', 1.2);
      events.emit('floatText', { pos: p.pos, text: 'DRAGGED IN', color: 0x9be32a, scale: 0.9, dy: 2.2 });
    },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
  { // Seed Barrage: seed pods are lobbed around you and burst into lingering poison pools.
    name: 'Seed Barrage!', wind: () => 0.9, act: () => 0.4, rec: () => 0.9,
    begin(e) {
      const p = world.player, n = spreadSpots(p.pos.x + p.vel.x * 0.5, p.pos.z + p.vel.z * 0.5, 4 + e.phase, 6, 12, 6.5);   // (fewer, spread out)
      for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 2.4, 1.0 + i * 0.16, BT.SPIT, pwr(e) * 1.1, 0x84cc16);
    },
    fire() { /* pods burst as their telegraphs expire */ },
  },
  { // Branch Sweep: five thick branches lash across the arena one after another (a sweeping fan; slip through the gaps or dash).
    name: 'Branch Sweep!', wind: (e) => 1.2 - 0.08 * e.phase, act: () => 0.9, rec: () => 1.1,
    begin(e, ux, uz) {
      const base = Math.atan2(ux, uz), dir = (S.cycle & 1) ? 1 : -1, n = 5;
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.5 * dir; lane(e, Math.sin(a), Math.cos(a), 40, 3.2, 1.2 + i * 0.26, BT.LASH, pwr(e) * 1.2, 0x8a5a24); }
    },
    fire() { /* each branch lashes as its own telegraph expires */ },
    windTick(e) { requestYaw(Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z)); },
  },
  { // Crushing Roots: both fists slam round the trunk (stay away from his feet!), then a thorn ring runs outward.
    name: 'Crushing Roots!', wind: () => 1.25, act: () => 0.5, rec: () => 1.2,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 4.2, 1.25, BT.SURFACE, pwr(e) * 1.1, 0x8a5a24); },
    fire(e) {
      spawnWave(e.pos.x, e.pos.z, 11, 34, 1.8, pwr(e) * 0.9, WAVE_THORN, 0x84cc16, e.radius + 3);
      events.emit('shockwave', { pos: e.pos.clone(), radius: 10, color: 0x84cc16 });
      events.emit('shake', { amount: 0.45 });
    },
  },
];

function treant(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_TREANT!;
  if (S.bark) { S.barkT -= dt; if (S.barkT <= 0) { S.bark = false; events.emit('floatText', { pos: e.pos, text: 'BARK CRACKS', color: 0xffd23a, scale: 0.9, dy: 2.2 }); } }
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  stand(e);   // rooted: Elderroot never walks, he waits for the next lash
  requestYaw(Math.atan2(ux, uz));
  const cDue = closeDue(e);   // (proximity) Crushing Roots + Thorn Ring are his close skills: only with someone near, more often the longer they stay
  if (e.attackCd > 0 && !cDue) return;
  let id: number;
  if (cDue) { id = (S.cycle++ & 1) === 0 ? T_SLAM : T_THORN; closeUsed(e, 22, LISTS.BOSS_TREANT![id].name); }
  else if (S.wantBark && !S.bark) { S.wantBark = false; id = T_BARK; }
  else {
    id = TREANT_ORDER[S.cycle++ % TREANT_ORDER.length];
    if (id === T_BROOD && (S.bark || countAdds('BOSS_SAPLING') >= 5)) id = T_SEEDS;
    if (id === T_VINES && dist > 28) id = T_ROOTS;
    if (id === T_SLAM || id === T_THORN) { if (bossNear(e)) closeUsed(e, 22, LISTS.BOSS_TREANT![id].name); else id = id === T_SLAM ? T_SWEEP : T_SEEDS; }
  }
  beginAtk(e, list, id, ux, uz, dist);
}

// --- saplings ------------------------------------------------------------------
export function aiSapling(e: Enemy): void {
  const b = bossEnemy();
  const p = world.player.pos;
  const tx = b ? b.pos.x : p.x, tz = b ? b.pos.z : p.z;
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  if (b && d < b.radius + 0.8) { // fuse: Elderroot drinks the sapling
    const heal = b.maxHp * 0.025;
    b.hp = Math.min(b.maxHp, b.hp + heal);
    events.emit('floatText', { pos: b.pos, text: `+${Math.round(heal)}`, color: 0x84cc16, scale: 0.8, dy: 2.0 });
    events.emit('trick', { pos: e.pos.clone(), kind: 'FUSE', radius: 2 });
    stat('SaplingFused');
    poofAdd(e);
    return;
  }
  e.state = 'CHASE';
  e.vel.set((dx / d) * e.speed, 0, (dz / d) * e.speed);
  requestYaw(Math.atan2(dx, dz));
}
/** A killed sapling bursts into a thorn patch. */
export function saplingDied(e: Enemy): void {
  circle(e.pos.x, e.pos.z, 3.0, 0.9, BT.THORN, e.projectileDamage * 0.9, 0x84cc16);
  stat('SaplingBurst');
}

// ============================================================ MIRE HYDRA =====
// (owner) ROOTED: the body lies beyond the far rim (only its back shows), FIVE heads reach in along the rim on long necks. Severing heads strips
// its armour; the body is hurt through the neck stumps at the rim. Patterns: acid barrage, a sweeping fan of three head-beams, head slams
// (the heads whip across the arena to telegraphed spots and rest there: a free-hit window) and a tidal surge ring from the body.
const H_SPIT = 0, H_SWEEP = 1, H_SLAM = 2, H_SURGE = 3;
const HYDRA_REGROWS = 4;          // heads that may grow back per fight (was unlimited)
const HYDRA_REGROW_HEAL = 0.025;  // hp mended per regrown head (was 4%)
const HYDRA_ORDER = [H_SPIT, H_SWEEP, H_SLAM, H_SPIT, H_SURGE, H_SLAM, H_SWEEP];
const LUNGE_T = 2.4, LUNGE_HIT = 1.2, LUNGE_HOLD = 1.8;
const slamZone: (Zone | null)[] = [null, null, null, null, null, null, null, null];   // the telegraph of each head's slam (cancelled when that head dies)   // whip out (telegraph resolves at LUNGE_HIT), hold, snap back

LISTS.BOSS_HYDRA = [
  { // Acid Spit: globs lob onto the player's area, each leaving an acid patch.
    name: 'Acid Barrage!', wind: () => 0.9, act: () => 0.5, rec: () => 0.9,
    begin() { /* the globs' own telegraphs appear on fire */ },
    fire(e) {
      const p = world.player.pos, n = spreadSpots(p.x, p.z, 4 + e.phase, 6.5, 13, 7.5);   // (spread out; owner 2026-10-26: one more glob, bigger pools)
      for (let i = 0; i < n; i++) {
        const x = SPOT_X[i], z = SPOT_Z[i];
        circle(x, z, 3.3, 1.25, BT.SPIT, pwr(e) * 1.2, 0x9be32a);
        spawnProp(PROP_GLOB, x, z, 1.25, 0.35, 1.4, 1, e.pos.x, e.pos.z);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
    },
  },
  { // Sweeping Heads: three beams of the necks sweep the arena one after another (slip between them).
    name: 'Sweeping Heads!', wind: (e) => 1.1 - 0.08 * e.phase, act: () => 0.6, rec: () => 1.1,
    begin(e, ux, uz) {
      const base = Math.atan2(ux, uz), dir = (S.cycle & 1) ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const a = base + (i - 1) * 0.62 * dir;
        cone(e, Math.sin(a), Math.cos(a), 56, 0.21, 1.1 + i * 0.4, BT.SWEEP, pwr(e) * 1.4, 0x6b8f5a);
      }
    },
    fire() { /* each cone resolves with its own telegraph */ },
    windTick(e) { requestYaw(Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z)); },
  },
  { // Head Slam: the heads nearest to you whip across the arena, crash down on marked spots, and lie there stunned for a moment.
    name: 'Head Slam!', wind: () => 0.6, act: () => 0.4, rec: () => 1.4,
    begin(e) {
      const p = world.player.pos, want = 2 + e.phase;
      let used = 0;
      for (let tries = 0; tries < NH && used < want; tries++) {   // nearest rested heads first
        let best = -1, bd = 1e9;
        for (let k = 0; k < NH; k++) {
          const id = S.heads[k]; if (id < 0 || S.lungeT[k] > 0) continue;
          const h = world.enemies[id]; if (!h.active || h.state === 'DYING' || h.state === 'SPAWN') continue;   // only living, grown heads bash
          headAnchor(e, k, ha);
          const d = (ha.x - p.x) ** 2 + (ha.z - p.z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
        if (best < 0) break;
        const a = (used / Math.max(1, want)) * 6.283 + Math.random(), r = used === 0 ? 0 : 3.5 + Math.random() * 3;
        tv.set(p.x + world.player.vel.x * 0.45 + Math.sin(a) * r, 0, p.z + world.player.vel.z * 0.45 + Math.cos(a) * r); clampArena(tv, 3);
        S.lungeX[best] = tv.x; S.lungeZ[best] = tv.z; S.lungeT[best] = LUNGE_T;
        const zn = circle(tv.x, tv.z, 3.8, LUNGE_HIT, BT.SURFACE, pwr(e) * 1.3, 0x6b8f5a);
        if (zn) { zn.life = zn.maxLife = LUNGE_HIT; }   // (boss telegraphs resolve 12% sooner: pin it to the head's arrival)
        slamZone[best] = zn;
        used++;
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
    },
    fire() { /* the heads crash as their circles expire */ },
    windTick(e) { requestYaw(Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z)); },
  },
  { // Tidal Surge: a wave rolls out from the body across the whole arena. Dash through it (or jump it).
    name: 'Tidal Surge!', wind: () => 1.2, act: () => 0.4, rec: () => 1.2,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 5, 1.2, BT.VISUAL, 0, 0x4ad0c0); },
    fire(e) {
      spawnWave(e.pos.x, e.pos.z, 10.5, 2 * world.room.radius + 14, 2.6, pwr(e) * 1.2, WAVE_TIDE, 0x4ad8c8, e.radius);
      events.emit('shockwave', { pos: e.pos.clone(), radius: 10, color: 0x4ad8c8 });
      events.emit('shake', { amount: 0.5 });
    },
  },
];

function hydra(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_HYDRA!;
  stand(e);
  // count the severed heads
  for (let k = 0; k < NH; k++) {
    const id = S.heads[k];
    if (id < 0) continue;
    const h = world.enemies[id];
    if (h.active && h.state !== 'DYING' && h.kind === 'BOSS_HYDRA_HEAD') continue;
    cancelSlam(k);   // a severed head leaves no bash behind
    S.heads[k] = -1; S.headsDead++; S.regrowT[k] = e.phase >= 1 ? 10 : 14; S.lungeT[k] = 0;   // it grows back unless the hydra is nearly dead
    e.armor = Math.max(0, e.armor - 7);
    events.emit('floatText', { pos: h.pos, text: 'HEAD SEVERED', color: 0xffd23a, scale: 1.0, dy: 2.4 });
    events.emit('shake', { amount: 0.5 });
    notify(S.headsDead >= NH ? 'The Hydra is defenseless!' : `The Hydra weakens (${S.headsDead}/${NH} heads)`, '#9be32a');
    stat('HeadSevered');
  }
  // severed heads regrow (and the hydra mends a little) while it is above 30% hp
  for (let k = 0; k < NH; k++) {
    if (S.heads[k] >= 0 || S.regrowT[k] <= 0) continue;
    S.regrowT[k] -= dt;
    if (S.regrowT[k] > 0) continue;
    // (balance pass) never while warded (it can't be hurt then), and at most HYDRA_REGROWS times per fight: low-damage
    // builds used to lose the race against endless regrowth (3 of 5 classes never finished the fight in 10 min)
    if (e.hp < e.maxHp * 0.3 || e.state === 'DYING' || S.regrowN >= HYDRA_REGROWS) continue;
    if (wardedBossId() === e.id) { S.regrowT[k] = 1; continue; }
    growHead(e, k);
    if (S.heads[k] < 0) continue;
    S.regrowN++;
    S.headsDead = Math.max(0, S.headsDead - 1);
    e.armor += 7; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HYDRA_REGROW_HEAL);
    events.emit('floatText', { pos: e.pos, text: 'A HEAD REGROWS!', color: 0x9be32a, scale: 1.0, dy: 2.4 });
    events.emit('heal', { pos: e.pos, amount: e.maxHp * HYDRA_REGROW_HEAL });
    notify('The Hydra regrows a head! Strike while it is weak.', '#9be32a');
  }
  requestYaw(Math.atan2(ux, uz));
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  const cDue = closeDue(e);   // (proximity) Tidal Surge (the ring round the body) is the close skill
  if (e.attackCd > 0 && !cDue) return;
  let id: number;
  if (cDue) { id = H_SURGE; closeUsed(e, 22, list[id].name); }
  else {
    id = HYDRA_ORDER[S.cycle++ % HYDRA_ORDER.length];
    if (id === H_SURGE) { if (bossNear(e)) closeUsed(e, 22, list[id].name); else id = H_SPIT; }
  }
  beginAtk(e, list, id, ux, uz, dist);
}
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// --- hydra heads -----------------------------------------------------------------
/** Removes the pending slam telegraph of head slot k (its head died before the bash landed). */
function cancelSlam(k: number): void {
  const zn = slamZone[k]; slamZone[k] = null;
  if (zn && zn.active && zn.kind === 'TELEGRAPH_CIRCLE' && zn.trick === BT.SURFACE && zn.pos.x === S.lungeX[k] && zn.pos.z === S.lungeZ[k]) zn.active = false;
}

/** Every frame (enemies.updateEnemies, after the AI pass): places each living head at its rest spot + sway, or on its
 *  slam path. Runs apart from the head's AI so a stunned / frozen / spawning head still goes exactly where its telegraph
 *  is (the old bug: bashes landing where no head was). */
export function tickHydraHeads(dt: number): void {
  if (S.id < 0) return;
  const b = world.enemies[S.id];
  if (!b.active || b.kind !== 'BOSS_HYDRA') return;
  const list = world.enemies, T = world.time;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (!h.active || h.kind !== 'BOSS_HYDRA_HEAD' || h.state === 'DYING') continue;
    const k = h.pattern;
    headAnchor(b, k, ha);
    let x = ha.x + Math.sin(T * 0.8 + k * 1.7) * 1.4, z = ha.z + Math.cos(T * 0.6 + k * 2.3) * 1.0;   // swaying
    if (S.lungeT[k] > 0) {   // whipping out to its slam spot, resting there, snapping back (the body's Head Slam)
      S.lungeT[k] = Math.max(0, S.lungeT[k] - dt);
      const t = LUNGE_T - S.lungeT[k];
      const f = t < LUNGE_HIT ? 1 - Math.pow(1 - t / LUNGE_HIT, 3) : t < LUNGE_HOLD ? 1 : 1 - Math.pow((t - LUNGE_HOLD) / (LUNGE_T - LUNGE_HOLD), 2);
      x += (S.lungeX[k] - x) * f; z += (S.lungeZ[k] - z) * f;   // (full reach: the head sits exactly on the marked circle)
      if (t >= LUNGE_HIT && t < LUNGE_HIT + 0.06) events.emit('shake', { amount: 0.3 });
    }
    h.pos.set(x, 0, z);
    h.vel.set(0, 0, 0);
  }
}

const HEAD_SPIT_FAN = 0.3;   // radians between the blobs of a head's acid fan
export function aiHydraHead(e: Enemy): void {
  const b = bossEnemy();
  if (!b || b.kind !== 'BOSS_HYDRA') { poofAdd(e); return; }
  const k = e.pattern;
  e.vel.set(0, 0, 0);   // (position: tickHydraHeads)
  e.state = 'CHASE';
  if (e.hideT > 0 && e.hideT < 0.3) e.hideT = 0;
  const p = world.player.pos;
  requestYaw(Math.atan2(p.x - e.pos.x, p.z - e.pos.z));
  if (S.lungeT[k] > 0 || e.attackCd > 0 || !world.player.alive) return;
  e.attackCd = (8.5 - 1.2 * b.phase) * (0.9 + Math.random() * 0.2);
  // (owner 2026-10-26) Acid Fan: 3-5 big blobs in a cone toward the hero (one lands on him, the rest bracket him)
  const dx = p.x + world.player.vel.x * 0.35 - e.pos.x, dz = p.z + world.player.vel.z * 0.35 - e.pos.z;
  const d = Math.max(6, Math.hypot(dx, dz)), a0 = Math.atan2(dx, dz), n = 3 + Math.min(2, b.phase + (b.hp < b.maxHp * 0.5 ? 1 : 0));
  for (let i = 0; i < n; i++) {
    const a = a0 + fan(i, HEAD_SPIT_FAN), r = i === 0 ? d : d + ((i & 2) ? 4.5 : -4.5);
    tv.set(e.pos.x + Math.sin(a) * r, 0, e.pos.z + Math.cos(a) * r); clampArena(tv, 2);
    circle(tv.x, tv.z, 3.2, 1.3 + 0.12 * i, BT.SPIT, e.projectileDamage * 1.3, 0x9be32a);   // (staggered landings: a ripple, not one instant)
    spawnProp(PROP_GLOB, tv.x, tv.z, 1.3 + 0.12 * i, 0.35, 1.4, 1, e.pos.x, e.pos.z);
  }
  events.emit('trick', { pos: e.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
  stat('HeadSpit');
}

// ============================================================ GLACIUS =========
// (owner) ROOTED: Glacius is a giant dragon rising out of the far rim of the arena; only his head, neck and front claws show. His head is the
// target (radius 4.4). Patterns reach the whole arena: a long frost-breath cone, lanes of ice, hail on you, a frost ring, the arena-wide
// blizzard and a brood of wyrmlings that hatches at his claws.
const G_BREATH = 0, G_SPIKES = 1, G_HAIL = 2, G_BLIZZ = 3, G_BROOD = 4, G_NOVA = 5;
const WYRM_ORDER = [G_BREATH, G_BROOD, G_HAIL, G_SPIKES, G_NOVA, G_BLIZZ, G_BREATH, G_BROOD, G_HAIL, G_SPIKES];   // (owner 2026-10-31: more broods)
const WYRMLING_CAP = 10;

LISTS.BOSS_WYRM = [
  { // Frost Breath: a cone that chills (4 chill stacks freeze you). The beam drifts toward you - keep moving out of it.
    name: 'Frost Breath!', wind: (e) => 1.2 - 0.1 * e.phase, act: () => 1.9, rec: () => 1.0,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, 40, 0.4, 1.2 - 0.1 * e.phase, BT.BREATH, pwr(e), 0x8fdcff); },
    fire() { /* the breath starts when the cone resolves */ },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
    tick(e, dt) {
      stand(e);
      if (!breath.active) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); return; }
      const p = world.player.pos;
      const want = Math.atan2(p.x - breath.x, p.z - breath.z), cur = Math.atan2(breath.dx, breath.dz);
      const a = cur + Math.max(-0.55 * dt, Math.min(0.55 * dt, wrap(want - cur)));
      breath.dx = Math.sin(a); breath.dz = Math.cos(a);
      requestYaw(a);
    },
    end() { breath.active = false; },
  },
  { // Ice Spikes: lanes of ice erupt from the ground in sequence. Chills.
    name: 'Ice Spikes!', wind: (e) => 1.0 - 0.08 * e.phase, act: (e) => (e.phase >= 1 ? 0.8 : 0.4), rec: () => 0.9,
    begin(e, ux, uz) {
      const n = 2 + e.phase, base = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const a = base + fan(i, 0.5); lane(e, Math.sin(a), Math.cos(a), 56, 6.4, 1.0 - 0.08 * e.phase, BT.SPIKES, pwr(e) * 1.45, 0x7dd3fc); }   // (owner 2026-10-31) ground icicles 2x wider lanes, bigger icicles, a bit harder, slow + freeze
    },
    fire(e, ux, uz) {
      if (e.phase < 1) return;
      const base = Math.atan2(ux, uz);
      for (let i = 0; i < e.phase; i++) { const a = base + fan(i, 0.5) + 0.25; lane(e, Math.sin(a), Math.cos(a), 56, 6.4, 0.8, BT.SPIKES, pwr(e) * 1.45, 0x7dd3fc); }
    },
  },
  { // Hail: the dragon roars at the sky; ice crashes down on marked circles around (and on) you.
    name: 'Hailstorm!', wind: () => 1.0, act: () => 0.5, rec: () => 1.0,
    begin(e) {
      const p = world.player.pos, n = spreadSpots(p.x + world.player.vel.x * 0.5, p.z + world.player.vel.z * 0.5, 5 + e.phase, 3.5, 12, 5.4);
      for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 2.7, 1.0 + i * 0.17, BT.HAIL, pwr(e) * 0.95, 0x8fdcff);
      events.emit('trick', { pos: e.pos.clone(), kind: 'BOSS_CAST', radius: 6 });
    },
    fire() { /* each ice block lands as its telegraph expires */ },
    windTick(e) { requestYaw(Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z)); },
  },
  { // Blizzard: the whole arena slows and hail drops around you for a while.
    name: 'Blizzard!', wind: () => 1.4, act: () => 0.4, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 9, 1.4, BT.VISUAL, 0, 0x93d8ff); },
    fire(e) {
      arena.blizzard = true; S.blizzT = 16;
      events.emit('floatText', { pos: e.pos, text: 'BLIZZARD', color: 0x93d8ff, scale: 1.1, dy: 2.4 });
      notify('A blizzard engulfs the arena!', '#93d8ff');
    },
  },
  { // Brood of Ice: wyrmlings hatch from the frost round Glacius's claws and harry you with slowing ice shards.
    name: 'Brood of Ice!', wind: () => 1.1, act: () => 0.4, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, 8, 1.1, BT.VISUAL, 0, 0x8fdcff); },
    fire(e) {
      const n = 4 + Math.min(2, e.phase), base = Math.atan2(-e.pos.x, -e.pos.z) - 1.3;   // (owner 2026-10-31) 4 / 5 / 6 baby drakes per call (was 2-4), cap 10 (was 6)
      for (let i = 0; i < n; i++) {
        const a = base + (i / Math.max(1, n - 1)) * 2.6, r = e.radius + 2.5 + (i & 1) * 1.6;
        spawnAdd('BOSS_WYRMLING', e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 0.85, 1, WYRMLING_CAP);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 6 });
    },
  },
  { // Glacial Ring: a ring of frost rolls out across the arena. Dash through it.
    name: 'Glacial Ring!', wind: () => 1.2, act: () => 0.4, rec: () => 1.1,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 5, 1.2, BT.VISUAL, 0, 0x9be8ff); },
    fire(e) {
      spawnWave(e.pos.x, e.pos.z, 12, 2 * world.room.radius + 6, 2.3, pwr(e) * 1.1, WAVE_FROST, 0x9be8ff, e.radius);
      events.emit('shockwave', { pos: e.pos.clone(), radius: 10, color: 0xbfe8ff });
      events.emit('shake', { amount: 0.5 });
    },
  },
];

function wyrm(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WYRM!;
  if (S.blizzT > 0) { S.blizzT -= dt; if (S.blizzT <= 0) arena.blizzard = false; }
  stand(e);
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  requestYaw(Math.atan2(ux, uz));
  const cDue = closeDue(e);   // (proximity) the Glacial Ring (frost nova round him) is his close skill
  if (e.attackCd > 0 && !cDue) return;
  let id: number;
  if (cDue) { id = G_NOVA; closeUsed(e, 22, list[id].name); }
  else if (S.wantBlizz && S.blizzT <= 0) { S.wantBlizz = false; id = G_BLIZZ; }
  else {
    id = WYRM_ORDER[S.cycle++ % WYRM_ORDER.length]; if (id === G_BLIZZ && S.blizzT > 0) id = G_BREATH; if (id === G_BROOD && countAdds('BOSS_WYRMLING') >= 7) id = G_HAIL;
    if (id === G_NOVA) { if (bossNear(e)) closeUsed(e, 22, list[id].name); else id = G_HAIL; }
  }
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ IGNAR ===========
// (owner 2026-10-25: crescents ~50% bigger, orange-yellow fire; Ignar resists burn, enemies.ts) (owner rework) Ignar fights like a FIRE version of the hero Knight: Flame Crescent (knight skill 1), Radiant Burst (ring of
// crescents + a fire shield), Blazing Guard (knight skill 2: knock-back burst then -50% damage), a Dash into a Slash. Plus giant
// fireballs, 360-degree rings of fire pillars, and dark knights (they use the knight's crescent). Every hit burns; fire trails
// are FIREPATCH zones capped by bossFx.firePatch() so the arena never fills up.
const I_WHEEL = 0, I_PILLARS = 1, I_KNIGHTS = 2, I_CLEAVE = 3, I_CRESCENT = 4, I_BURST = 5, I_GUARD = 6, I_DASH = 7;
const WARLORD_ORDER = [I_CRESCENT, I_DASH, I_PILLARS, I_WHEEL, I_BURST, I_CRESCENT, I_KNIGHTS, I_DASH, I_PILLARS, I_GUARD, I_WHEEL];
const DASH_SP = 40, CRESC_SP = 27, KNIGHT_CAP = 3;

/** A fiery knight crescent from Ignar towards angle `a` (x, z = sin, cos). Burns on hit. */
function crescent(e: Enemy, a: number, speed: number, life: number, radius: number, dmg: number): void {
  dirV.set(Math.sin(a), 0, Math.cos(a));
  tv.set(e.pos.x + dirV.x * 1.6, 1.2, e.pos.z + dirV.z * 1.6);
  fireEnemyProjectile(tv, dirV, 'FIRE_CRESCENT', speed, dmg, { life, radius, debuff: 5 });   // (owner 2026-10-31) 5 = Ignar's burn: 3.6 s, refreshes
}
/** Drops fire patches behind a travelling slash / dash: every `step` metres along the lane from (S.sx, S.sz), up to `upTo`.
 *  `halfW` > 0 (a crescent slash): each row also lays patches ACROSS the arc, `halfW` either side, the outer ones trailing back like the crescent's tips
 *  (owner 2026-10-26: fire along the whole arc, proportional to the slash size). A dash (halfW 0) keeps its single centre line. */
function laneTrail(e: Enemy, upTo: number, step: number, r: number, halfW = 0): void {
  let room = fireRoom();
  const lat = r * 1.1, nSide = halfW > 0 ? Math.max(1, Math.round(halfW / lat)) : 0, pr = nSide > 0 ? r * 0.82 : r, dmg = ipwr(e) * 0.1;
  while (S.trailD <= upTo && room > 0) {
    const d = S.trailD;
    for (let k = -nSide; k <= nSide && room > 0; k++) {
      const o = nSide > 0 ? (k / nSide) * halfW : 0, f = d - (nSide > 0 ? (o * o) / (halfW * 2.4) : 0);   // tips lag behind the middle of the arc
      const x = S.sx + S.sdx * f + S.sdz * o, z = S.sz + S.sdz * f - S.sdx * o;
      if (!insideShape(x, z, 0.5)) continue;
      if (firePatchRaw(x, z, pr, 2.6, dmg)) room--;
    }
    S.trailD += step;
  }
}
function ipwrNow(): number { const b = bossEnemy(); return b ? ipwr(b) : 10; }
hooks.fireImpact = (x: number, z: number, r: number): void => {   // a giant fireball ends: a burst and a (capped) fire patch
  firePatch(x, z, r * 1.15, 2.6, ipwrNow() * 0.1);
  events.emit('explosion', { pos: new Vector3(x, 0.5, z), radius: r * 1.4, color: 0xff6a1a });
};

LISTS.BOSS_WARLORD = [
  { // Flame Wheel: Ignar plants himself and spins; rings of GIANT fireballs with a rotating gap pattern fly outward.
    name: 'Flame Wheel!', wind: () => 0.9, act: () => (S.enraged ? 4.2 : 3.4), rec: () => 0.9,
    begin(e) { circle(e.pos.x, e.pos.z, 5, 0.9 * fast(e), BT.VISUAL, 0, 0xff6a1a); },
    fire(e) { S.wheelA = Math.random() * 6.283; S.ringT = 0; S.wheelN = 0; void e; },
    tick(e, dt) {
      stand(e);
      S.ringT -= dt;
      if (S.ringT > 0) return;
      S.ringT = (S.enraged ? 0.5 : 0.62) - 0.03 * e.phase;
      S.wheelA += 0.55;
      const n = S.enraged ? 7 : 6;   // (owner) fireballs ~2.5x bigger: fewer per ring so there are always gaps
      for (let i = 0; i < n; i++) {
        const a = S.wheelA + (i / n) * 6.283;
        dirV.set(Math.sin(a), 0, Math.cos(a));
        tv.set(e.pos.x + dirV.x * 1.5, 1.6, e.pos.z + dirV.z * 1.5);
        fireEnemyProjectile(tv, dirV, 'BIG_FLAME', S.enraged ? 10.5 : 8.5, ipwr(e) * 0.8, { life: 3.0, radius: 1.4, debuff: 5 });
      }
      S.wheelN++;
      if ((S.wheelN & 1) === 0) events.emit('shake', { amount: 0.2 });
    },
  },
  { // Pillars of Cinder: rings of erupting pillars all the way round him (360 degrees), rippling outwards.
    name: 'Pillars of Cinder!', wind: () => 1.0, act: () => 0.4, rec: () => 0.9,
    begin(e) {
      const en = S.enraged, base = Math.random() * 6.283, pr = en ? 2.5 : 2.2;
      const rings = en ? 3 : 2;
      for (let ri = 0; ri < rings; ri++) {
        const rr = en ? 6.5 + ri * 5.8 : 7.5 + ri * 6.5, n = en ? (ri === 1 ? 10 : 7) : (ri === 0 ? 8 : 12);   // normal 20 pillars, burning form 24
        for (let k = 0; k < n; k++) {
          const a = base + ri * 0.45 + (k / n) * 6.283, x = e.pos.x + Math.sin(a) * rr, z = e.pos.z + Math.cos(a) * rr;
          const lim = edgeLimit(x, z, 2); if (x * x + z * z > lim * lim) continue;
          circle(x, z, pr, (0.95 + ri * 0.4) * fast(e), BT.PILLAR, ipwr(e) * 1.4, en ? 0xff2a0a : 0xff5a1a);
        }
      }
      events.emit('shake', { amount: 0.15 });
    },
    fire() { /* pillars erupt as their telegraphs expire */ },
  },
  { // Call the Dark Knights: 2-3 dark knights step out of a ring of shadow (max 3 alive).
    name: 'Call the Dark Knights!', wind: () => 0.9, act: () => 0.4, rec: () => 0.7,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 4.5, 0.9 * fast(e), BT.VISUAL, 0, 0x8a4aff); },
    fire(e) {
      const room = KNIGHT_CAP - countAdds('BOSS_DKNIGHT'), n = Math.min(room, 2 + (S.enraged || e.phase >= 1 ? 1 : 0)), base = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / Math.max(n, 1)) * 6.283, r = e.radius + 3.2;
        spawnAdd('BOSS_DKNIGHT', e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 1, 1, KNIGHT_CAP);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 6 });
    },
  },
  { // Hellcleave: a close-range cone slash with a shove and a stun; it burns and scorches the ground in its arc.
    name: 'Hellcleave!', wind: () => 0.7, act: () => 0.3, rec: () => 0.6,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, S.enraged ? 12 : 10, 0.95, 0.7 * fast(e), BT.SWEEP, ipwr(e) * 1.6, 0xff6a1a); },
    fire(e) {
      const p = world.player, rg = S.enraged ? 12 : 10;
      if (p.alive && inCone(p.pos.x, p.pos.z, e.pos.x, e.pos.z, e.dir.x, e.dir.z, rg, 0.95)) burnHit(ipwr(e) * 0.14);
      const a0 = Math.atan2(e.dir.x, e.dir.z);
      for (let k = -1; k <= 1; k++) firePatch(e.pos.x + Math.sin(a0 + k * 0.55) * rg * 0.62, e.pos.z + Math.cos(a0 + k * 0.55) * rg * 0.62, 1.7, 2.6, ipwr(e) * 0.1);
    },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
  { // Flame Crescent (knight skill 1): a huge crescent of fire sweeps along a lane (a fan of three in the Burning Form).
    name: 'Flame Crescent!', wind: () => 0.6, act: () => 0.55, rec: () => 0.5,
    begin(e, ux, uz) {
      e.dir.set(ux, 0, uz);
      const n = S.enraged ? 3 : 1;
      for (let i = 0; i < n; i++) { const a = Math.atan2(ux, uz) + (n === 1 ? 0 : (i - 1) * 0.42); lane(e, Math.sin(a), Math.cos(a), 30, 14, 0.6 * fast(e), BT.VISUAL, 0, 0xff2a2a); }   // (owner 2026-10-26) crescents 2x bigger + red
    },
    fire(e) {
      const base = Math.atan2(e.dir.x, e.dir.z), n = S.enraged ? 3 : 1;
      for (let i = 0; i < n; i++) crescent(e, base + (n === 1 ? 0 : (i - 1) * 0.42), CRESC_SP, 1.0, 6.8, ipwr(e) * 1.5);
      S.sx = e.pos.x; S.sz = e.pos.z; S.sdx = e.dir.x; S.sdz = e.dir.z; S.trailD = 3; S.slashD = 0;
      events.emit('shake', { amount: 0.18 });
    },
    tick(e, dt) { stand(e); S.slashD += CRESC_SP * dt; laneTrail(e, Math.min(S.slashD, 30), 3.6, 3.0, 6.4); },   // the fire trail follows the crescent (owner 2026-10-26: longer, wider, denser)
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
  { // Radiant Burst (knight passive): a fiery burst round him and a ring of crescents, then a fire shield wraps him.
    name: 'Radiant Burst!', wind: () => 0.85, act: () => 0.4, rec: () => 0.7,
    begin(e) {
      circle(e.pos.x, e.pos.z, 15, 0.85 * fast(e), BT.FBURST, ipwr(e) * 1.3, 0xff3a1a);   // (owner 2026-10-26) Radiant Burst 2x bigger
      const n = S.enraged ? 10 : 8; S.wheelA = Math.random() * 6.283;
      for (let i = 0; i < n; i++) { const a = S.wheelA + (i / n) * 6.283; lane(e, Math.sin(a), Math.cos(a), 19, 9.2, 0.85 * fast(e), BT.VISUAL, 0, 0xff2a2a); }
    },
    fire(e) {
      const n = S.enraged ? 10 : 8;
      for (let i = 0; i < n; i++) { crescent(e, S.wheelA + (i / n) * 6.283, 17, 1.0, 4.4, ipwr(e) * 0.9); for (let k = 1; k <= 3; k++) { const a = S.wheelA + (i / n) * 6.283; firePatch(e.pos.x + Math.sin(a) * k * 5, e.pos.z + Math.cos(a) * k * 5, 2.6, 2.8, ipwr(e) * 0.1); } }
      e.shield = Math.max(e.shield, e.maxHp * 0.04); S.shT = 7;   // fire shield (a small absorb, 7 s)
      events.emit('floatText', { pos: e.pos, text: 'FIRE SHIELD', color: 0xffb040, scale: 0.9, dy: 2.8 });
      events.emit('shockwave', { pos: e.pos.clone(), radius: 8, color: 0xffb040 });
      for (let i = 0; i < 4; i++) { const a = S.wheelA + (i / 4) * 6.283 + 0.4; firePatch(e.pos.x + Math.sin(a) * 4, e.pos.z + Math.cos(a) * 4, 1.5, 2.4, ipwr(e) * 0.1); }
    },
  },
  { // Blazing Guard (knight skill 2): a knock-back burst, then he takes half damage for a few seconds.
    name: 'Blazing Guard!', wind: () => 0.6, act: () => 0.4, rec: () => 0.5,
    begin(e) { circle(e.pos.x, e.pos.z, 8.5, 0.6 * fast(e), BT.FBURST, ipwr(e) * 1.1, 0xff7a1a); },
    fire(e) {
      S.guardT = 3.5;
      events.emit('shieldBlock', { pos: e.pos.clone(), radius: 3.4, gold: true });
      events.emit('floatText', { pos: e.pos, text: 'BLAZING GUARD', color: 0xffd070, scale: 0.9, dy: 2.8 });
    },
  },
  { // Dash and Slash: a telegraphed rush along a lane (burning trail, hits what it touches), then an instant crescent slash.
    name: 'Blazing Rush!', wind: () => 0.55, act: () => 1.0, rec: () => 0.55,
    begin(e, ux, uz, dist) {
      e.dir.set(ux, 0, uz); S.dashLen = Math.min(Math.max(dist - 3, 6), 20);
      lane(e, ux, uz, S.dashLen + 1, 5.4, 0.55 * fast(e), BT.VISUAL, 0, 0xff5a1a);   // (owner 2026-10-26) wider red lane + bigger hit area on every boss dash
    },
    fire(e) {
      S.dashPh = 0; S.dashT = S.dashLen / DASH_SP; S.ramHit = false;
      S.sx = e.pos.x; S.sz = e.pos.z; S.sdx = e.dir.x; S.sdz = e.dir.z; S.trailD = 1.5; S.slashD = 0;
      events.emit('trick', { pos: e.pos.clone(), kind: 'LEAP', radius: 4 });
    },
    tick(e, dt, ux, uz) {
      if (S.dashPh === 0) {
        drive(e, S.sdx, S.sdz, DASH_SP); S.slashD += DASH_SP * dt; S.dashT -= dt;
        laneTrail(e, S.slashD, 2.4, 3.2);
        const p = world.player;
        if (!S.ramHit && p.alive && (p.pos.x - e.pos.x) ** 2 + (p.pos.z - e.pos.z) ** 2 < (e.radius + 2.2) ** 2) {
          S.ramHit = true; damagePlayer(ipwr(e) * 1.3, { pos: e.pos, kind: 'FIRE', ...KB.SLAM });   // (owner) the Blazing Rush knocks down
          burnHit(ipwr(e) * 0.14);
        }
        if (S.dashT <= 0) {   // arrived: a quick aimed slash
          S.dashPh = 1; stand(e); e.dir.set(ux, 0, uz); S.slashT = 0.34 * fast(e);
          lane(e, ux, uz, 30, 14, S.slashT, BT.VISUAL, 0, 0xff2a2a);
        }
      } else if (S.dashPh === 1) {
        stand(e); requestYaw(Math.atan2(e.dir.x, e.dir.z)); S.slashT -= dt;
        if (S.slashT <= 0) {
          const a = Math.atan2(e.dir.x, e.dir.z);
          crescent(e, a, CRESC_SP, 1.0, 6.8, ipwr(e) * 1.4);
          if (S.enraged) { crescent(e, a + 0.5, CRESC_SP, 1.0, 6.0, ipwr(e) * 1.1); crescent(e, a - 0.5, CRESC_SP, 1.0, 6.0, ipwr(e) * 1.1); }
          S.sx = e.pos.x; S.sz = e.pos.z; S.sdx = e.dir.x; S.sdz = e.dir.z; S.trailD = 3; S.slashD = 0;
          S.dashPh = 2; S.slashT = 0.3; events.emit('shake', { amount: 0.2 });
        }
      } else { stand(e); S.slashD += CRESC_SP * dt; laneTrail(e, Math.min(S.slashD, 30), 3.6, 3.0, 6.4); S.slashT -= dt; }
    },
    done: () => S.dashPh === 2 && S.slashT <= 0,
    end(e) { stand(e); S.dashPh = 2; },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
];

function warlord(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WARLORD!;
  // (owner) Second form at half health: Ignar bursts into flame (a short untouchable transformation that ends in a fire
  // nova), then fights as the Burning Form - faster moves, shorter telegraphs, harder hits, a scorching aura, devil wings.
  if (!S.enraged && S.formT <= 0 && e.hp < e.maxHp * 0.5) {
    const a = list[e.pattern];
    if (a && a.end && (e.state === 'WINDUP' || e.state === 'ATTACK')) a.end(e);
    enter(e, 'CHASE'); stand(e);
    S.formT = 2.0; S.guardT = 0;
    circle(e.pos.x, e.pos.z, 9, 2.0, BT.PILLAR, pwr(e) * 1.4, 0xff2a0a);   // get out before the nova
    events.emit('shake', { amount: 0.6 });
    events.emit('floatText', { pos: e.pos, text: 'IGNITING...', color: 0xff6a1a, scale: 1.3, dy: 2.6 });
    notify('Ignar ignites - get clear of the flames!', '#ff5a1a');
    world.boss.ability = 'Burning Form'; world.boss.abilityT = 2.6;
  }
  if (S.formT > 0) {
    S.formT -= dt; stand(e);
    if (S.formT <= 0) {
      S.enraged = true; e.speed *= 1.3;
      spawnWave(e.pos.x, e.pos.z, 16, 22, 1.4, pwr(e) * 0.8, WAVE_FIRE, 0xff4a1a, e.radius);
      events.emit('shake', { amount: 1.0 });
      events.emit('floatText', { pos: e.pos, text: 'BURNING FORM', color: 0xff3a1a, scale: 1.5, dy: 2.8 });
      notify('IGNAR, THE BURNING FORM!', '#ff3a1a');
      e.attackCd = 0.6; S.cleaveCd = 0;
    }
    return;
  }
  if (S.guardT > 0) S.guardT -= dt;
  if (S.shT > 0) { S.shT -= dt; if (S.shT <= 0) e.shield = 0; }
  if (S.enraged) {   // scorching aura: standing close to him burns
    S.auraT -= dt;
    if (S.auraT <= 0) {
      S.auraT = 0.5;
      const p = world.player;
      if (p.alive && (p.pos.x - e.pos.x) ** 2 + (p.pos.z - e.pos.z) ** 2 < (e.radius + 3.2) ** 2) { damagePlayer(pwr(e) * 0.22, { pos: e.pos, kind: 'FIRE', dot: true, noDotMul: true }); burnHit(pwr(e) * 0.12); }
    }
  }
  tickIgnarLava(e, dt);   // (owner 2026-10-31) the longer the fight, the more of the floor turns to lava (ignarLava.ts)
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  if (dist > 4.5) drive(e, ux, uz, e.speed * (1 + 0.12 * e.phase)); else stand(e);
  // (proximity) Hellcleave / Radiant Burst / Blazing Guard are the close skills: only with someone near, more often the longer they stay
  const cDue = closeDue(e);
  if (e.attackCd > 0 && !cDue) return;
  let id: number;
  if (cDue) { id = (S.cycle & 3) === 3 ? I_BURST : (S.cycle & 3) === 2 && !S.enraged ? I_GUARD : I_CLEAVE; S.cycle++; closeUsed(e, S.enraged ? 14 : 20, list[id].name); }
  else {
    id = WARLORD_ORDER[S.cycle++ % WARLORD_ORDER.length];
    if (id === I_DASH && dist < 9) id = I_PILLARS;                                 // too close to rush: pillars instead
    if (id === I_KNIGHTS && countAdds('BOSS_DKNIGHT') >= KNIGHT_CAP) id = I_CRESCENT;   // knights capped
    if (id === I_BURST || id === I_GUARD) { if (bossNear(e)) closeUsed(e, S.enraged ? 14 : 20, list[id].name); else id = id === I_BURST ? I_CRESCENT : I_WHEEL; }
  }
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ THE DUNE COLOSSUS ===
// The Sunscorch Desert boss (shown as 'The Dune Colossus', roomDefs bossName): a six-legged war machine. Keeps its distance and shells you.
const M_ARTY = 0, M_RAY = 1, M_STOMP = 2, M_MISSILE = 3, M_RAM = 4;
const STRAFE_SP = 9;   // (flamethrower pacing speed)
const WARMACH_ORDER = [M_ARTY, M_RAY, M_MISSILE, M_ARTY, M_RAM, M_RAY];

LISTS.BOSS_WARMACH = [
  { // Artillery Barrage: mortar shells rain where you are and where you are heading (sand blasts, no fire).
    name: 'Artillery Barrage!', wind: () => 0.9, act: () => 0.4, rec: () => 1.0,
    begin(e) {
      const p = world.player, n = spreadSpots(p.pos.x + p.vel.x * 0.6, p.pos.z + p.vel.z * 0.6, 5 + e.phase, 11, 22, 12);   // (was 8 + 2 phase, bunched)
      for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 5.6, 1.1 + i * 0.17, BT.SHELL, pwr(e) * 1.3, 0xd9b36a);
      events.emit('shake', { amount: 0.3 });
    },
    fire() { /* shells land as their telegraphs expire */ },
  },
  { // Molten Ray = the FLAMETHROWER (owner 2026-10-31): a much fatter, faster stream (flames 2x wider, 1.5x faster, wider telegraph cone) that
    // sweeps wider while the Colossus PACES back and forth across the hero's line, laying FIRE TRAILS on the ground; flame hits burn.
    name: 'Molten Ray!', wind: () => 1.0, act: () => 1.45, rec: () => 1.0,
    begin(e, ux, uz) { S.rayA = Math.atan2(ux, uz) - 0.95; cone(e, ux, uz, 70, 1.05, 1.0, BT.VISUAL, 0, 0xffa040); },
    fire(e) { S.rayT = 0; S.rayN = 0; S.trailT = 0; S.stride = (S.cycle & 1) ? 1 : -1; S.strideT = 0.55; void e; },
    tick(e, dt, ux, uz) {
      // strafe along the line perpendicular to the hero, reversing every ~0.9 s; keep inside the arena
      S.strideT -= dt;
      if (S.strideT <= 0) { S.strideT = 0.9; S.stride = -S.stride; }
      tv.set(e.pos.x + uz * S.stride * 6, 0, e.pos.z - ux * S.stride * 6);
      const lim = edgeLimit(tv.x, tv.z, e.radius + 2);
      if (tv.x * tv.x + tv.z * tv.z > lim * lim) { S.stride = -S.stride; S.strideT = 0.9; }
      drive(e, uz * S.stride, -ux * S.stride, STRAFE_SP);
      S.rayT -= dt;
      if (S.rayT > 0) return;
      S.rayT = 0.045;
      S.rayA += 1.9 / 32;   // sweeps ~1.9 rad over the attack (was 1.5)
      dirV.set(Math.sin(S.rayA), 0, Math.cos(S.rayA));
      tv.set(e.pos.x + dirV.x * e.radius * 0.9, 6, e.pos.z + dirV.z * e.radius * 0.9);
      fireEnemyProjectile(tv, dirV, 'FLAME', 46, pwr(e) * 0.5, { life: 1.5, radius: 2.7, debuff: 5 });
      if ((S.rayN++ & 3) === 0) events.emit('shake', { amount: 0.12 });
      S.trailT -= 0.045;
      if (S.trailT <= 0) {   // fire trail: a patch on the ground along the flame (within the global fire patch cap), every ~0.18 s at a random reach
        S.trailT = 0.18;
        const d = 12 + Math.random() * 40;
        firePatch(e.pos.x + dirV.x * d, e.pos.z + dirV.z * d, 3.2, 4.2, pwr(e) * 0.12);
      }
    },
    end(e) { stand(e); },
    windTick(e) { requestYaw(S.rayA + 0.95); },
  },
  { // Seismic Stomp: all six legs slam down; shockwaves under each leg and around the hull.
    name: 'Seismic Stomp!', wind: () => 1.2, act: () => 0.3, rec: () => 0.9,
    begin(e) {
      for (let i = 0; i < 6; i++) { const a = e.facing + (i / 6) * 6.283 + 0.52; stompKd(spawnTelegraphCircle(e.pos.x + Math.sin(a) * e.radius * 2.0, e.pos.z + Math.cos(a) * e.radius * 2.0, 6.8, 1.1, pwr(e) * 1.4, 0xff7a1a)); }
      stompKd(spawnTelegraphCircle(e.pos.x, e.pos.z, e.radius + 5, 1.3, pwr(e) * 1.2, 0xffa040));
    },
    fire() { events.emit('shake', { amount: 0.7 }); },
  },
  { // Missile Swarm: three volleys of seeking fire missiles.
    name: 'Missile Swarm!', wind: () => 0.8, act: () => 1.6, rec: () => 1.0,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 2, 0.8, BT.VISUAL, 0, 0xffa040); },
    fire() { S.rayT = 0; S.rayN = 0; },
    tick(e, dt, ux, uz) {
      stand(e);
      S.rayT -= dt;
      if (S.rayT > 0 || S.rayN >= 3) return;
      S.rayT = 0.5; S.rayN++;
      const base = Math.atan2(ux, uz), n = 5 + e.phase;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.32;
        dirV.set(Math.sin(a), 0, Math.cos(a));
        tv.set(e.pos.x + dirV.x * e.radius * 0.7, 8, e.pos.z + dirV.z * e.radius * 0.7);
        fireEnemyProjectile(tv, dirV, 'FLAME', 12, pwr(e) * 0.7, { life: 5, radius: 1.2, homing: 1.4, debuff: 5 });
      }
    },
  },
  { // Rampage: the machine lowers itself and charges along a lane, trampling anything in the way.
    name: 'Rampage!', wind: () => 1.6, act: () => 1.8, rec: () => 1.4,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); S.ramHit = false; lane(e, ux, uz, 30, e.radius * 2 + 3, 1.6, BT.VISUAL, 0, 0xff5a1a); },
    fire() { events.emit('shake', { amount: 0.5 }); },
    tick(e) {
      drive(e, e.dir.x, e.dir.z, 13 + 1.5 * e.phase);   // (very slow walker, but the charge is still a real threat: ~25 m lane)
      const p = world.player, d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (!S.ramHit && p.alive && d < e.radius + 2.2) { S.ramHit = true; damagePlayer(pwr(e) * 1.8, { pos: e.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.6); }
    },
    end(e) { stand(e); },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
];

function warmach(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WARMACH!;
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 20, 36, e.speed * (1 + 0.12 * e.phase), 0.35);
  const cDue = closeDue(e);   // (proximity) Seismic Stomp is the close skill: only with someone near, more often the longer they stay
  if (e.attackCd > 0 && !cDue) return;
  let id: number;
  if (cDue) { id = M_STOMP; closeUsed(e, 22, list[id].name); }   // too close: stomp you away
  else { id = WARMACH_ORDER[S.cycle++ % WARMACH_ORDER.length]; }
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ VOID HERALD =====
const V_PORTALS = 0, V_GRAVITY = 1, V_ECHOES = 2;

/** (owner) the Dune Colossus' stomp knocks the hero down. */
function stompKd(z: import('../types').Zone | null): void { if (z) { z.kb = KB.SLAM.kb; z.down = KB.SLAM.down; } }

LISTS.BOSS_VOID = [
  { // Rift Portals: portals open around you and fire aimed volleys.
    name: 'Rift Portals!', wind: () => 0.9, act: () => 0.4, rec: () => 1.0, windMove: 0.4,
    begin() { /* portals appear on fire */ },
    fire(e) {
      const p = world.player.pos, n = 3 + e.phase, base = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283, r = 7 + Math.random() * 6;
        tv.set(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r); clampArena(tv, 2); clampToVoid(tv, 2);
        spawnPortal(tv.x, tv.z, 0.9, 5.2, 3, pwr(e) * 0.7);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RIFT', radius: 6 });
    },
  },
  { // Gravity Flip: pulls you in, then PUSHES with a shockwave - dash / jump through the ring.
    name: 'Gravity Flip!', wind: () => 1.3, act: () => 1.85, rec: () => 1.1,
    begin(e) { circle(e.pos.x, e.pos.z, 16, 1.3, BT.VISUAL, 0, 0xa855f7); },
    fire() { S.gravT = 0; S.pushed = false; },
    tick(e, dt) {
      stand(e);
      S.gravT += dt;
      const p = world.player;
      if (S.gravT < 1.4) { // PULL
        if (p.alive && p.dashT <= 0 && p.stunT <= 0) {
          const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
          if (d > 3.5) { p.pos.x += (dx / d) * 7 * dt; p.pos.z += (dz / d) * 7 * dt; }
        }
      } else if (!S.pushed) { // FLIP -> PUSH
        S.pushed = true;
        spawnWave(e.pos.x, e.pos.z, 24, 30, 2.2, pwr(e) * 1.4, WAVE_VOID, 0xc084fc, e.radius);
        events.emit('shockwave', { pos: e.pos.clone(), radius: 14, color: 0xc084fc });
        events.emit('trick', { pos: e.pos.clone(), kind: 'GRAVITY_PUSH', radius: 8 });
        events.emit('shake', { amount: 0.6 });
      }
    },
  },
  { // Echoes: shadow copies of the earlier bosses replay their signature attacks around you.
    name: 'Echoes of the Fallen!', wind: () => 0.9, act: () => 0.5, rec: () => 1.0,
    begin(e) { circle(e.pos.x, e.pos.z, 4, 0.9, BT.VISUAL, 0, 0xa8a29e); },
    fire(e) {
      const p = world.player.pos, n = 2 + (e.phase >= 1 ? 1 : 0) + (e.phase >= 2 ? 1 : 0), base = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283, kind = ((Math.random() * 5) | 0);
        tv.set(p.x + Math.sin(a) * 13, 0, p.z + Math.cos(a) * 13); clampArena(tv, 3); clampToVoid(tv, 3);
        spawnEcho(tv.x, tv.z, kind, pwr(e));
      }
      stat('EchoCast');
    },
  },
];

// ---- the Herald's three additions on top of his original kit (portals / gravity flip / echoes): illusions, black-hole summons, the final form's wing storm.
const V_MIRRORS = 3, V_HOLES = 4, V_STORM = 5;
const f2 = (): boolean => S.vform === 2;
const DARKP = { dark: true } as const;
LISTS.BOSS_VOID!.push(
  { // Mirror Images: up to 4 illusions of the Herald (same bar, same shield, they crumble 3x faster) and one teleport into a ring round you.
    name: 'Mirror Images!', wind: () => 0.8, act: () => 1.0, rec: () => 0.9,
    begin(e) { circle(e.pos.x, e.pos.z, 5, 0.8, BT.VISUAL, 0, 0xc084fc); },
    fire(e) { spawnIllusions(e, 4, f2() ? 30 : 22, 4); stat('Illusions'); },
  },
  { // Black Holes: warning circles follow you, each opens a hole under you that then drifts after you (at most 4 alive).
    name: 'Black Holes!', wind: () => 0.8, act: () => 1, rec: () => 1.0,
    begin(e) { circle(e.pos.x, e.pos.z, 4, 0.8, BT.VISUAL, 0, 0xc084fc); },
    fire() { const n = f2() ? 3 : 2; for (let i = 0; i < n; i++) queueHole(i * 1.0); },
    tick() { /* waits */ },
    done: (e) => e.stateT >= 0.8 && !holesBusy(),
  },
  { // (final form) Wing Storm: the great wings beat out spiralling void feathers, then a void shockwave ring.
    name: 'Wing Storm!', wind: () => 1.0, act: () => 3.4, rec: () => 1.1,
    begin(e) { circle(e.pos.x, e.pos.z, 7, 1.0, BT.VISUAL, 0, 0xc084fc); e.angle = Math.random() * 6.283; e.patternT = 0; S.pushed = false; },
    fire() { /* feathers in tick */ },
    tick(e, dt) {
      stand(e);
      e.angle += 1.9 * dt;
      if (e.stateT >= e.patternT * 0.14) {
        e.patternT++;
        for (let k = 0; k < 4; k++) {
          const a = e.angle + (k * Math.PI) / 2;
          dirV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, dirV, 'BOSS_ORB', 11, e.projectileDamage * 0.6, { pct: 0.04, life: 5, radius: 0.9, ...DARKP });
        }
      }
      if (S.pushed === false && e.stateT >= 1.8) {
        S.pushed = true;
        spawnWave(e.pos.x, e.pos.z, 20, 30, 2.2, pwr(e) * 1.2, WAVE_VOID, 0xc084fc, e.radius);
        events.emit('shockwave', { pos: e.pos.clone(), radius: 14, color: 0xc084fc });
        events.emit('shake', { amount: 0.5 });
      }
    },
    done: (e) => e.stateT >= 3.4,
    end() { S.pushed = false; },
  },
);
/** The final fight's HP pool = form 1 (1x the Void boss's HP) + form 2 (1.25x); the transformation starts when form 1's share is spent. */
export const FINAL_SPLIT = 1.25 / 2.25;
const HERALD_F1 = [V_PORTALS, V_ECHOES, V_GRAVITY, V_MIRRORS, V_PORTALS, V_HOLES, V_ECHOES, V_GRAVITY, V_MIRRORS, V_HOLES];
const HERALD_F2 = [V_STORM, V_PORTALS, V_HOLES, V_GRAVITY, V_MIRRORS, V_ECHOES, V_STORM, V_HOLES, V_PORTALS, V_GRAVITY];

/** Starts the transformation at half health: an untouchable 3 s burst (wings tear open) that ends in a void nova and the final form. */
function startTransform(e: Enemy): void {
  const list = LISTS.BOSS_VOID!, a = list[e.pattern];
  if (a && a.end && (e.state === 'WINDUP' || e.state === 'ATTACK')) a.end(e);
  enter(e, 'CHASE'); stand(e);
  S.vformT = 3.0; S.vform = 1; e.attackCd = 1.0; bp.xformId = e.id;   // untouchable while the wings tear open
  clearDecoys(); clearVoidFx();
  circle(e.pos.x, e.pos.z, 12, 3.0, BT.VISUAL, 0, 0xc084fc);   // get clear of the nova
  events.emit('shake', { amount: 0.7 });
  events.emit('floatText', { pos: e.pos, text: 'THE VOID UNFOLDS...', color: 0xe9d5ff, scale: 1.4, dy: 5 });
  notify('The Void Herald tears open his wings - get clear of the nova!', '#c084fc');
  world.boss.ability = 'Final Form'; world.boss.abilityT = 3;
  spawnRune(e.pos.x, e.pos.z, 6, 3.0);
}

/** The void stage: a fixed ring (the room outline minus a margin) the heroes cannot leave; outside it is the dark swirling void (render/BossFx veil). */
function voidStage(e: Enemy): void {
  let r = 1e9;
  for (let k = 0; k < 24; k++) { const a = (k / 24) * 6.2832; r = Math.min(r, edgeLimit(Math.cos(a) * 10, Math.sin(a) * 10, 0)); }
  arena.shrink = true; arena.hard = true; arena.cx = 0; arena.cz = 0; arena.r = Math.max(24, r - 3); arena.minR = arena.r; arena.rate = 0; arena.edgeT = 0;
  notify('The Void is all around - you cannot leave the ring!', '#c084fc');
  void e;
}

function herald(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_VOID!;
  tickVoidFx(dt);
  mfx.major = e.state !== 'CHASE' && (e.pattern === V_HOLES || e.pattern === V_STORM || e.pattern === V_GRAVITY) && S.vformT <= 0;   // his illusions hold their basic volleys during a major skill
  if (S.vform === 0 && !bp.on && e.hp < e.maxHp * (world.boss.final ? FINAL_SPLIT : 0.5)) startTransform(e);
  if (S.vformT > 0) {
    S.vformT -= dt; stand(e);
    if (Math.random() < dt * 6) events.emit('explosion', { pos: tv.set(e.pos.x + (Math.random() - 0.5) * 8, 1 + Math.random() * 5, e.pos.z + (Math.random() - 0.5) * 8).clone(), radius: 1.6, color: 0xa855f7 });
    if (S.vformT <= 0) {
      S.vform = 2; S.cycle = 0; bp.xformId = -1;
      e.radius *= 1.15; e.scale *= 1.15; e.speed *= 1.2; e.projectileDamage *= 1.15; e.contactDamage *= 1.15; e.attackCd = 0.8;
      world.boss.stage = 2;
      spawnWave(e.pos.x, e.pos.z, 18, 26, 1.8, pwr(e) * 1.1, WAVE_VOID, 0xc084fc, e.radius);
      events.emit('shockwave', { pos: e.pos.clone(), radius: 22, color: 0xe9d5ff });
      events.emit('shake', { amount: 1.0 });
      events.emit('floatText', { pos: e.pos, text: 'FINAL FORM', color: 0xe9d5ff, scale: 1.6, dy: 5 });
      notify('THE VOID HERALD - FINAL FORM!', '#e9d5ff');
    }
    return;
  }
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 10, 17, e.speed * (1 + 0.12 * e.phase), 0.45);
  if (e.attackCd > 0) return;
  const order = S.vform === 2 ? HERALD_F2 : HERALD_F1;
  beginAtk(e, list, order[S.cycle++ % order.length], ux, uz, dist);
}
