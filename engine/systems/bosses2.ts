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
import { useGameStore } from '../../store';
import { hooks } from './hooks';
import { damagePlayer, applyPlayerDebuff, KB } from './combat';
import { BOSS_SKILL_MUL } from '../enemyDefs';
import {
  enter, requestYaw, spawnEnemy, spawnTelegraphCircle, spawnTelegraphLine, spawnTelegraphCone, fireEnemyProjectile,
} from './enemies';
import {
  BT, WAVE_THORN, WAVE_VOID, WAVE_FIRE, PROP_GLOB, arena, breath, dive, inCone,
  spawnWave, spawnProp, spawnPortal, spawnEcho, clampToVoid, stat, endBossFx,
} from './bossFx';
import { wardedBossId } from './bossMech';

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
  heads: [-1, -1, -1] as number[], regrowT: [0, 0, 0] as number[], regrowN: 0, headsDead: 0, headAng: 0, sub: false, subX: 0, subZ: 0, subFx: 0, subFz: 0,
  // Glacius
  air: false, wantBlizz: false, blizzT: 0, diveZone: null as Zone | null,
  // Ignar
  enraged: false, wheelA: 0, ringT: 0, cleaveCd: 0, wheelN: 0,
  formT: 0, auraT: 0,   // (owner) Burning Form: formT = the transformation in progress; enraged = in the burning form
  // the Dune Colossus (desert war machine)
  rayA: 0, rayT: 0, rayN: 0, ramHit: false, stompCd: 0, turret: 0,
  // Void Herald
  voidOn: false, gravT: 0, pushed: false,
};
/** Read-only view for the renderer. */
export const bossView = S;

export function resetBosses2(): void {
  S.id = -1; S.phase = 0; S.cycle = 0; S.stompCd = 0;
  S.bark = false; S.barkT = 0; S.wantBark = false; S.rings = 0; S.ringN = 0;
  S.heads[0] = S.heads[1] = S.heads[2] = -1; S.regrowT[0] = S.regrowT[1] = S.regrowT[2] = 0; S.regrowN = 0; S.headsDead = 0; S.headAng = 0; S.sub = false;
  S.air = false; S.wantBlizz = false; S.blizzT = 0; S.diveZone = null;
  S.enraged = false; S.wheelA = 0; S.ringT = 0; S.cleaveCd = 0; S.wheelN = 0; S.formT = 0; S.auraT = 0;
  S.voidOn = false; S.gravT = 0; S.pushed = false;
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
const BASE_CD: Partial<Record<EnemyKind, number>> = { BOSS_TREANT: 2.3, BOSS_HYDRA: 2.1, BOSS_WYRM: 1.9, BOSS_WARLORD: 1.8, BOSS_WARMACH: 1.6, BOSS_VOID: 1.7 };

function cdFor(e: Enemy): number {
  return (BASE_CD[e.kind] ?? 2) * (1 - 0.14 * e.phase) * (S.enraged ? 0.5 : 1) * (S.bark ? 0.8 : 1) * (S.blizzT > 0 ? 0.85 : 1);
}

/** (owner) Ignar's Burning Form: wind-ups, telegraphs and recoveries take 70% of the time. */
const fast = (e: Enemy): number => (e.kind === 'BOSS_WARLORD' && S.enraged ? 0.7 : 1);
/** Ignar's hit power (x1.3 in the Burning Form). */
const ipwr = (e: Enemy): number => pwr(e) * (S.enraged ? 1.3 : 1);

function beginAtk(e: Enemy, list: Atk[], id: number, ux: number, uz: number, dist: number): void {
  const a = list[id];
  e.pattern = id; e.patternT = 0;
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
      if (a.windMove) keepRange(e, ux, uz, dist, 5, 12, e.speed * a.windMove, 0.3); else stand(e);
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
const HYDRA_MUL = [0.5, 0.75, 1.0, 1.4];
hooks.damageMul = (e: Enemy): number => {
  if (e.id !== S.id) return 1;
  if (e.kind === 'BOSS_TREANT') return S.bark ? 0.3 : 1;
  if (e.kind === 'BOSS_HYDRA') return HYDRA_MUL[S.headsDead];
  if (e.kind === 'BOSS_WARLORD' && S.formT > 0) return 0;   // transforming: untouchable
  return 1;
};

// ----------------------------------------------------------------- entry ------
export function initBoss2(e: Enemy): void {
  resetBosses2();
  S.id = e.id;
  e.pattern = 0; e.attackCd = 3.2;
  if (e.kind === 'BOSS_HYDRA') {
    S.headAng = Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z);
    for (let k = 0; k < 3; k++) growHead(e, k);
  }
}

/** (Re)grows hydra head k beside the body. */
function growHead(e: Enemy, k: number): void {
  const a = S.headAng + (k - 1) * 1.05;
  tv.set(e.pos.x + Math.sin(a) * (e.radius + 0.6), 0, e.pos.z + Math.cos(a) * (e.radius + 0.6));
  const h = spawnEnemy('BOSS_HYDRA_HEAD', tv);
  if (!h) return;
  h.pattern = k; h.attackCd = 2.8 + k * 1.4; h.maxHp = Math.round(h.maxHp * 0.7); h.hp = h.maxHp;
  S.heads[k] = h.id;
}

export function bossDied2(e: Enemy): void {
  if (!isBoss2(e.kind) || e.id !== S.id) return;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.active && isBossAdd(a.kind)) poofAdd(a); }
  endBossFx();
  S.id = -1; S.bark = false; S.sub = false; S.air = false; S.blizzT = 0; S.enraged = false; S.formT = 0; S.voidOn = false;
  stat('BossDied');
}

function checkPhase2(e: Enemy): void {
  if (e.phase === S.phase) return;
  S.phase = e.phase;
  switch (e.kind) {
    case 'BOSS_TREANT': S.wantBark = true; break;
    case 'BOSS_WYRM': S.wantBlizz = true; break;
    case 'BOSS_VOID': arena.rate = 0.9 + 0.35 * e.phase; break;
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
const T_ROOTS = 0, T_BROOD = 1, T_THORN = 2, T_BARK = 3, T_VINES = 4, T_SEEDS = 5;
const TREANT_ORDER = [T_ROOTS, T_VINES, T_BROOD, T_SEEDS, T_THORN, T_ROOTS, T_VINES, T_THORN];

LISTS.BOSS_TREANT = [
  { // Root Eruption: lanes of roots burst out of the ground, rooting whoever stands in them. Sidestep or dash through.
    name: 'Root Eruption!', wind: (e) => 1.15 - 0.1 * e.phase, act: (e) => (e.phase >= 1 ? 0.9 : 0.4), rec: () => 0.9,
    begin(e, ux, uz) {
      const n = 3 + e.phase, base = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const a = base + fan(i, 0.4); lane(e, Math.sin(a), Math.cos(a), 28, 2.6, 1.15 - 0.1 * e.phase, BT.ROOT, pwr(e) * 1.2, 0x8a5a24); }
    },
    fire(e, ux, uz) {
      if (e.phase < 1) return;
      const base = Math.atan2(ux, uz);
      for (let i = 0; i < e.phase + 1; i++) { const a = base + fan(i, 0.5); lane(e, Math.sin(a), Math.cos(a), 28, 2.6, 0.85, BT.ROOT, pwr(e) * 1.2, 0x8a5a24); }
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
    begin(e) { circle(e.pos.x, e.pos.z, 6, 1.0, BT.VISUAL, 0, 0x84cc16); },
    fire(e) { S.rings = 1 + e.phase; S.ringN = 0; },
    tick(e) {
      stand(e);
      while (S.ringN < S.rings && e.stateT >= S.ringN * 0.6) {
        spawnWave(e.pos.x, e.pos.z, 13, 26, 1.8, pwr(e) * 1.1, WAVE_THORN, 0x84cc16, e.radius);   // (balance pass 2: x1.1; was x1.3, x0.9 while the dash came at Lv 20 - it now unlocks at Lv 6)
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
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, 18, 0.5, 1.0 - 0.08 * e.phase, BT.VISUAL, 0, 0x6aa82a); },
    fire(e) {
      const p = world.player;
      events.emit('trick', { pos: e.pos.clone(), kind: 'ROOTS', radius: 10 });
      if (!p.alive || !inCone(p.pos.x, p.pos.z, e.pos.x, e.pos.z, e.dir.x, e.dir.z, 18, 0.5)) return;
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
];

function treant(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_TREANT!;
  if (S.bark) { S.barkT -= dt; if (S.barkT <= 0) { S.bark = false; events.emit('floatText', { pos: e.pos, text: 'BARK CRACKS', color: 0xffd23a, scale: 0.9, dy: 2.2 }); } }
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  // Elderroot lumbers into melee range and keeps stalking (slow circle when already close).
  keepRange(e, ux, uz, dist, 2.5, e.radius + 3.5, e.speed * (1 + 0.15 * e.phase), 0.55);
  if (e.attackCd > 0) return;
  let id: number;
  if (S.wantBark && !S.bark) { S.wantBark = false; id = T_BARK; }
  else {
    id = TREANT_ORDER[S.cycle++ % TREANT_ORDER.length];
    if (id === T_BROOD && (S.bark || countAdds('BOSS_SAPLING') >= 5)) id = T_ROOTS;
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
const H_SPIT = 0, H_SWEEP = 1, H_SUBMERGE = 2;
const HYDRA_REGROWS = 4;          // heads that may grow back per fight (was unlimited)
const HYDRA_REGROW_HEAL = 0.025;  // hp mended per regrown head (was 4%)
const HYDRA_ORDER = [H_SPIT, H_SWEEP, H_SUBMERGE, H_SPIT, H_SWEEP];

LISTS.BOSS_HYDRA = [
  { // Acid Spit: globs lob onto the player's area, each leaving an acid patch.
    name: 'Acid Barrage!', wind: () => 0.9, act: () => 0.5, rec: () => 0.9, windMove: 0.4,
    begin() { /* the globs' own telegraphs appear on fire */ },
    fire(e) {
      const p = world.player.pos, n = spreadSpots(p.x, p.z, 3 + e.phase, 6.5, 11, 7);   // (spread out)
      for (let i = 0; i < n; i++) {
        const x = SPOT_X[i], z = SPOT_Z[i];
        circle(x, z, 2.7, 1.25, BT.SPIT, pwr(e) * 1.1, 0x9be32a);
        spawnProp(PROP_GLOB, x, z, 1.25, 0.35, 1.1, 1, e.pos.x, e.pos.z);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
    },
  },
  { // Tail Sweep: the hydra turns its back and whips its tail through a wide cone.
    name: 'Tail Sweep!', wind: (e) => 1.2 - 0.1 * e.phase, act: () => 0.5, rec: () => 1.1,
    begin(e, ux, uz) {
      e.dir.set(ux, 0, uz);
      cone(e, ux, uz, 17, 1.0, 1.2 - 0.1 * e.phase, BT.SWEEP, pwr(e) * 1.5, 0x6b8f5a);
    },
    fire() { /* the cone resolves with the telegraph */ },
    windTick(e) { requestYaw(Math.atan2(-e.dir.x, -e.dir.z)); }, // tail first
    tick(e) { stand(e); requestYaw(Math.atan2(-e.dir.x, -e.dir.z)); },
  },
  { // Submerge: sinks out of sight (untargetable) and resurfaces under a marked spot, stunning anything above.
    name: 'Submerge!', wind: () => 0.7, act: () => 1.5, rec: () => 1.3,
    begin() { /* sinks */ },
    fire(e) {
      const p = world.player.pos;
      S.sub = true; S.subX = p.x; S.subZ = p.z; S.subFx = e.pos.x; S.subFz = e.pos.z;
      e.hideT = 60;
      circle(p.x, p.z, 5.5, 1.5, BT.SURFACE, pwr(e) * 1.3, 0x6b8f5a);
      events.emit('trick', { pos: e.pos.clone(), kind: 'SUBMERGE', radius: 5 });
    },
    tick(e) {
      stand(e);
      const k = Math.min(1, e.stateT / 1.5);
      e.pos.x = S.subFx + (S.subX - S.subFx) * k; e.pos.z = S.subFz + (S.subZ - S.subFz) * k;
    },
    end(e) {
      if (!S.sub) return;
      S.sub = false; e.hideT = 0;
      e.pos.x = S.subX; e.pos.z = S.subZ;
    },
  },
];

function hydra(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_HYDRA!;
  // heads follow the player (angle), count the severed ones
  S.headAng += Math.max(-3 * dt, Math.min(3 * dt, wrap(Math.atan2(ux, uz) - S.headAng)));
  for (let k = 0; k < 3; k++) {
    const id = S.heads[k];
    if (id < 0) continue;
    const h = world.enemies[id];
    if (h.active && h.state !== 'DYING' && h.kind === 'BOSS_HYDRA_HEAD') continue;
    S.heads[k] = -1; S.headsDead++; S.regrowT[k] = e.phase >= 1 ? 10 : 14;   // it grows back unless the hydra is nearly dead
    e.armor = Math.max(0, e.armor - 12);
    events.emit('floatText', { pos: e.pos, text: 'HEAD SEVERED', color: 0xffd23a, scale: 1.0, dy: 2.4 });
    events.emit('shake', { amount: 0.5 });
    notify(S.headsDead >= 3 ? 'The Hydra is defenseless!' : `The Hydra weakens (${S.headsDead}/3 heads)`, '#9be32a');
    stat('HeadSevered');
  }
  // severed heads regrow (and the hydra mends a little) while it is above 30% hp
  for (let k = 0; k < 3; k++) {
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
    e.armor += 12; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HYDRA_REGROW_HEAL);
    events.emit('floatText', { pos: e.pos, text: 'A HEAD REGROWS!', color: 0x9be32a, scale: 1.0, dy: 2.4 });
    events.emit('heal', { pos: e.pos, amount: e.maxHp * HYDRA_REGROW_HEAL });
    notify('The Hydra regrows a head! Strike while it is weak.', '#9be32a');
  }
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 6, 11, e.speed * (1 + 0.15 * e.phase), 0.25);
  if (e.attackCd > 0) return;
  let id = HYDRA_ORDER[S.cycle++ % HYDRA_ORDER.length];
  if (id === H_SWEEP && dist > 18) id = H_SPIT;
  beginAtk(e, list, id, ux, uz, dist);
}
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// --- hydra heads -----------------------------------------------------------------
export function aiHydraHead(e: Enemy): void {
  const b = bossEnemy();
  if (!b || b.kind !== 'BOSS_HYDRA') { poofAdd(e); return; }
  const a = S.headAng + (e.pattern - 1) * 1.05, r = b.radius + 0.6;
  e.pos.set(b.pos.x + Math.sin(a) * r, 0, b.pos.z + Math.cos(a) * r);
  e.vel.set(0, 0, 0);
  e.state = 'CHASE';
  if (S.sub) { e.hideT = 0.3; return; }
  if (e.hideT > 0 && e.hideT < 0.3) e.hideT = 0;
  const p = world.player.pos;
  requestYaw(Math.atan2(p.x - e.pos.x, p.z - e.pos.z));
  if (e.attackCd > 0 || !world.player.alive) return;
  e.attackCd = (5.4 - 0.9 * b.phase) * (0.9 + Math.random() * 0.2);
  const x = p.x + (Math.random() - 0.5) * 2.5, z = p.z + (Math.random() - 0.5) * 2.5;
  circle(x, z, 2.5, 1.3, BT.SPIT, e.projectileDamage * 1.1, 0x9be32a);
  spawnProp(PROP_GLOB, x, z, 1.3, 0.35, 1.0, 1, e.pos.x, e.pos.z);
  events.emit('trick', { pos: e.pos.clone(), kind: 'SPIT_CAST', radius: 2 });
  stat('HeadSpit');
}

// ============================================================ GLACIUS =========
const G_BREATH = 0, G_SPIKES = 1, G_DIVE = 2, G_BLIZZ = 3, G_BROOD = 4;
const WYRM_ORDER = [G_BREATH, G_SPIKES, G_BROOD, G_DIVE, G_SPIKES, G_BLIZZ, G_BREATH];

LISTS.BOSS_WYRM = [
  { // Frost Breath: a cone that chills (4 chill stacks freeze you). The beam drifts toward you - keep moving out of it.
    name: 'Frost Breath!', wind: (e) => 1.2 - 0.1 * e.phase, act: () => 1.9, rec: () => 1.0,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, 22, 0.42, 1.2 - 0.1 * e.phase, BT.BREATH, pwr(e), 0x8fdcff); },
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
      const n = 1 + e.phase, base = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const a = base + fan(i, 0.5); lane(e, Math.sin(a), Math.cos(a), 34, 3.2, 1.0 - 0.08 * e.phase, BT.SPIKES, pwr(e) * 1.3, 0x7dd3fc); }
    },
    fire(e, ux, uz) {
      if (e.phase < 1) return;
      const base = Math.atan2(ux, uz);
      for (let i = 0; i < e.phase; i++) { const a = base + fan(i, 0.6) + 0.3; lane(e, Math.sin(a), Math.cos(a), 34, 3.2, 0.8, BT.SPIKES, pwr(e) * 1.3, 0x7dd3fc); }
    },
  },
  { // Dive Bomb: takes off (untargetable), a circle tracks you and locks in, then Glacius crashes down and is stuck on the ground.
    name: 'Dive Bomb!', wind: () => 0.9, act: () => 3.2, rec: () => 1.9,
    begin() { /* wings beat (render) */ },
    fire(e) {
      const p = world.player.pos;
      S.air = true; e.hideT = 60; dive.landed = false;
      S.diveZone = circle(p.x, p.z, 7.5, 2.0, BT.DIVE, pwr(e) * 1.8, 0x8fdcff);
      events.emit('trick', { pos: e.pos.clone(), kind: 'TAKEOFF', radius: 6 });
    },
    tick(e, dt) {
      stand(e);
      const z = S.diveZone;
      if (z && z.active && z.trick === BT.DIVE && z.life > 0.7) { // tracks the player until 0.7 s before impact
        const p = world.player.pos, dx = p.x - z.pos.x, dz = p.z - z.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.05) { const s = Math.min(d, 13 * dt) / d; z.pos.x += dx * s; z.pos.z += dz * s; }
      }
    },
    done: (e) => dive.landed || e.stateT > 3.2,
    end(e) {
      if (!S.air) return;
      S.air = false; e.hideT = 0;
      if (dive.landed) e.pos.set(dive.x, 0, dive.z);
      else if (S.diveZone && S.diveZone.active) e.pos.set(S.diveZone.pos.x, 0, S.diveZone.pos.z);
      dive.landed = false; S.diveZone = null;
    },
  },
  { // Blizzard: the whole arena slows and hail drops around you for a while.
    name: 'Blizzard!', wind: () => 1.4, act: () => 0.4, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, 14, 1.4, BT.VISUAL, 0, 0x93d8ff); },
    fire(e) {
      arena.blizzard = true; S.blizzT = 16;
      events.emit('floatText', { pos: e.pos, text: 'BLIZZARD', color: 0x93d8ff, scale: 1.1, dy: 2.4 });
      notify('A blizzard engulfs the arena!', '#93d8ff');
    },
  },
  { // Brood of Ice: wyrmlings hatch from the frost around Glacius and harry you with slowing ice shards.
    name: 'Brood of Ice!', wind: () => 1.1, act: () => 0.4, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, 7, 1.1, BT.VISUAL, 0, 0x8fdcff); },
    fire(e) {
      const n = 2 + e.phase, base = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283, r = e.radius + 2.5;
        spawnAdd('BOSS_WYRMLING', e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 1, 1, 6);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 6 });
    },
  },
];

function wyrm(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WYRM!;
  if (S.blizzT > 0) { S.blizzT -= dt; if (S.blizzT <= 0) arena.blizzard = false; }
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 7, 14, e.speed * (1 + 0.15 * e.phase), 0.5);
  if (e.attackCd > 0) return;
  let id: number;
  if (S.wantBlizz && S.blizzT <= 0) { S.wantBlizz = false; id = G_BLIZZ; }
  else { id = WYRM_ORDER[S.cycle++ % WYRM_ORDER.length]; if (id === G_BLIZZ && S.blizzT > 0) id = G_BREATH; }
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ IGNAR ===========
const I_WHEEL = 0, I_PILLARS = 1, I_IMPS = 2, I_CLEAVE = 3;
const WARLORD_ORDER = [I_PILLARS, I_WHEEL, I_IMPS, I_PILLARS, I_WHEEL];

LISTS.BOSS_WARLORD = [
  { // Flame Wheel: Ignar plants himself and spins; rings of fire bolts with a rotating gap pattern fly outward.
    name: 'Flame Wheel!', wind: () => 1.0, act: () => (S.enraged ? 4.4 : 3.6), rec: () => 1.1,
    begin(e) { circle(e.pos.x, e.pos.z, 5, 1.0, BT.VISUAL, 0, 0xff6a1a); },
    fire(e) { S.wheelA = Math.random() * 6.283; S.ringT = 0; S.wheelN = 0; void e; },
    tick(e, dt) {
      stand(e);
      S.ringT -= dt;
      if (S.ringT > 0) return;
      S.ringT = (S.enraged ? 0.27 : 0.34) - 0.03 * e.phase;
      S.wheelA += 0.21;
      const n = 10 + (S.enraged ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const a = S.wheelA + (i / n) * 6.283;
        dirV.set(Math.sin(a), 0, Math.cos(a));
        tv.set(e.pos.x, 1.2, e.pos.z);
        fireEnemyProjectile(tv, dirV, 'FLAME', S.enraged ? 11.5 : 9, ipwr(e) * 0.6, { life: 4.5, radius: 0.55, debuff: 2 });
      }
      S.wheelN++;
      if ((S.wheelN & 3) === 0) events.emit('shake', { amount: 0.2 });
    },
  },
  { // Fire Pillars: a salvo of erupting pillars, the first under you, the rest fanning out where you are heading.
    name: 'Pillars of Cinder!', wind: () => 1.0, act: () => 0.4, rec: () => 1.0,
    begin(e) {
      const p = world.player, n = 4 + e.phase + (S.enraged ? 1 : 0);   // (owner: fewer + spread out; was 5 + 2 phase + 2)
      const px: number[] = [], pz: number[] = [];
      for (let i = 0, tries = 0; i < n && tries < n * 10; tries++) {
        const life = (1.0 + i * 0.2) * fast(e);
        let x = p.pos.x, z = p.pos.z;
        if (i > 0) { const a = Math.random() * 6.283, r = 6 + Math.random() * 8; x += Math.sin(a) * r + p.vel.x * life * 0.5; z += Math.cos(a) * r + p.vel.z * life * 0.5; }
        tv.set(x, 0, z); clampArena(tv, 2); clampToVoid(tv, 2);
        let ok = true; for (let k = 0; k < px.length; k++) if ((px[k] - tv.x) ** 2 + (pz[k] - tv.z) ** 2 < 7 * 7) { ok = false; break; }
        if (!ok) continue;
        px.push(tv.x); pz.push(tv.z); i++;
        circle(tv.x, tv.z, S.enraged ? 3.0 : 2.6, life, BT.PILLAR, ipwr(e) * 1.5, S.enraged ? 0xff2a0a : 0xff5a1a);
      }
    },
    fire() { /* pillars erupt as their telegraphs expire */ },
  },
  { // Summon Imps: fire imps pour out of a portal at his feet.
    name: 'Summon Imps!', wind: () => 1.0, act: () => 0.4, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, 5, 1.0, BT.VISUAL, 0, 0xff3a1a); },
    fire(e) {
      const n = 2 + e.phase + (S.enraged ? 1 : 0), base = Math.random() * 6.283;   // (balance pass: 2-4 per call, max 6 alive; was 3-5, max 10)
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283, r = e.radius + 2;
        spawnAdd('BOSS_IMP', e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, 0.5, 0.75, 6);
      }
      events.emit('trick', { pos: e.pos.clone(), kind: 'RAISE', radius: 6 });
    },
  },
  { // Hellcleave: a close-range cone slash with a shove and a stun.
    name: 'Hellcleave!', wind: () => 0.8, act: () => 0.3, rec: () => 0.7,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); cone(e, ux, uz, S.enraged ? 12 : 10, 0.95, 0.8 * fast(e), BT.SWEEP, ipwr(e) * 1.6, 0xff6a1a); },
    fire() { /* resolves with the telegraph */ },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
];

function warlord(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WARLORD!;
  // (owner) Second form at half health: Ignar bursts into flame (a short untouchable transformation that ends in a fire
  // nova), then fights as the Burning Form - faster moves, shorter telegraphs, harder hits, a scorching aura.
  if (!S.enraged && S.formT <= 0 && e.hp < e.maxHp * 0.5) {
    const a = list[e.pattern];
    if (a && a.end && (e.state === 'WINDUP' || e.state === 'ATTACK')) a.end(e);
    enter(e, 'CHASE'); stand(e);
    S.formT = 2.0;
    circle(e.pos.x, e.pos.z, 9, 2.0, BT.PILLAR, pwr(e) * 1.4, 0xff2a0a);   // get out before the nova
    events.emit('shake', { amount: 0.6 });
    events.emit('floatText', { pos: e.pos, text: 'IGNITING...', color: 0xff6a1a, scale: 1.3, dy: 2.6 });
    notify('Ignar ignites - get clear of the flames!', '#ff5a1a');
    world.boss.ability = 'Burning Form'; world.boss.abilityT = 2.6;
  }
  if (S.formT > 0) {
    S.formT -= dt; stand(e);
    if (S.formT <= 0) {
      S.enraged = true; e.speed *= 1.35;
      spawnWave(e.pos.x, e.pos.z, 16, 22, 1.4, pwr(e) * 0.8, WAVE_FIRE, 0xff4a1a, e.radius);
      events.emit('shake', { amount: 1.0 });
      events.emit('floatText', { pos: e.pos, text: 'BURNING FORM', color: 0xff3a1a, scale: 1.5, dy: 2.8 });
      notify('IGNAR, THE BURNING FORM!', '#ff3a1a');
      e.attackCd = 0.6; S.cleaveCd = 0;
    }
    return;
  }
  if (S.enraged) {   // scorching aura: standing close to him burns
    S.auraT -= dt;
    if (S.auraT <= 0) {
      S.auraT = 0.5;
      const p = world.player;
      if (p.alive && (p.pos.x - e.pos.x) ** 2 + (p.pos.z - e.pos.z) ** 2 < (e.radius + 3.2) ** 2) damagePlayer(pwr(e) * 0.22, { pos: e.pos, kind: 'FIRE', dot: true, noDotMul: true });
    }
  }
  if (S.cleaveCd > 0) S.cleaveCd -= dt;
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  if (dist > 4.5) drive(e, ux, uz, e.speed * (1 + 0.12 * e.phase)); else stand(e);
  if (e.attackCd > 0) return;
  let id: number;
  if (dist < (S.enraged ? 10 : 8) && S.cleaveCd <= 0) { id = I_CLEAVE; S.cleaveCd = S.enraged ? 3.5 : 6; }
  else id = WARLORD_ORDER[S.cycle++ % WARLORD_ORDER.length];
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ THE DUNE COLOSSUS ===
// The Sunscorch Desert boss (shown as 'The Dune Colossus', roomDefs bossName): a six-legged war machine. Keeps its distance and shells you.
const M_ARTY = 0, M_RAY = 1, M_STOMP = 2, M_MISSILE = 3, M_RAM = 4;
const WARMACH_ORDER = [M_ARTY, M_RAY, M_MISSILE, M_ARTY, M_RAM, M_RAY];

LISTS.BOSS_WARMACH = [
  { // Artillery Barrage: mortar shells rain where you are and where you are heading (sand blasts, no fire).
    name: 'Artillery Barrage!', wind: () => 0.9, act: () => 0.4, rec: () => 1.0,
    begin(e) {
      const p = world.player, n = spreadSpots(p.pos.x + p.vel.x * 0.6, p.pos.z + p.vel.z * 0.6, 5 + e.phase, 6.5, 13, 7);   // (was 8 + 2 phase, bunched)
      for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 2.8, 1.0 + i * 0.17, BT.SHELL, pwr(e) * 1.3, 0xd9b36a);
      events.emit('shake', { amount: 0.3 });
    },
    fire() { /* shells land as their telegraphs expire */ },
  },
  { // Molten Ray: the turret sweeps a stream of molten bolts across the arena.
    name: 'Molten Ray!', wind: () => 1.1, act: () => 1.7, rec: () => 1.0,
    begin(e, ux, uz) { S.rayA = Math.atan2(ux, uz) - 0.75; cone(e, ux, uz, 30, 0.8, 1.1, BT.VISUAL, 0, 0xffa040); },
    fire() { S.rayT = 0; S.rayN = 0; },
    tick(e, dt) {
      stand(e);
      S.rayT -= dt;
      if (S.rayT > 0) return;
      S.rayT = 0.05;
      S.rayA += 1.5 / 34;   // sweeps ~1.5 rad over the attack
      dirV.set(Math.sin(S.rayA), 0, Math.cos(S.rayA));
      tv.set(e.pos.x + dirV.x * e.radius, 2.2, e.pos.z + dirV.z * e.radius);
      fireEnemyProjectile(tv, dirV, 'FLAME', 24, pwr(e) * 0.5, { life: 1.6, radius: 0.7, debuff: 2 });
      if ((S.rayN++ & 3) === 0) events.emit('shake', { amount: 0.12 });
    },
    windTick(e) { requestYaw(S.rayA + 0.75); },
  },
  { // Seismic Stomp: all six legs slam down; shockwaves under each leg and around the hull.
    name: 'Seismic Stomp!', wind: () => 0.9, act: () => 0.3, rec: () => 0.9,
    begin(e) {
      for (let i = 0; i < 6; i++) { const a = e.facing + (i / 6) * 6.283 + 0.52; spawnTelegraphCircle(e.pos.x + Math.sin(a) * e.radius * 1.5, e.pos.z + Math.cos(a) * e.radius * 1.5, 3.4, 0.9, pwr(e) * 1.4, 0xff7a1a); }
      spawnTelegraphCircle(e.pos.x, e.pos.z, e.radius + 2.5, 1.1, pwr(e) * 1.2, 0xffa040);
    },
    fire() { events.emit('shake', { amount: 0.7 }); },
  },
  { // Missile Swarm: three volleys of seeking fire missiles.
    name: 'Missile Swarm!', wind: () => 0.8, act: () => 1.6, rec: () => 1.0,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 1, 0.8, BT.VISUAL, 0, 0xffa040); },
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
        tv.set(e.pos.x, 3, e.pos.z);
        fireEnemyProjectile(tv, dirV, 'FLAME', 10, pwr(e) * 0.7, { life: 4, radius: 0.6, homing: 1.4, debuff: 2 });
      }
    },
  },
  { // Rampage: the machine lowers itself and charges along a lane, trampling anything in the way.
    name: 'Rampage!', wind: () => 1.0, act: () => 0.9, rec: () => 1.2,
    begin(e, ux, uz) { e.dir.set(ux, 0, uz); S.ramHit = false; lane(e, ux, uz, 28, e.radius * 2 + 1, 1.0, BT.VISUAL, 0, 0xff5a1a); },
    fire() { events.emit('shake', { amount: 0.5 }); },
    tick(e) {
      drive(e, e.dir.x, e.dir.z, e.speed * 9);
      const p = world.player, d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (!S.ramHit && p.alive && d < e.radius + 1.2) { S.ramHit = true; damagePlayer(pwr(e) * 1.8, { pos: e.pos, kind: 'PHYSICAL', ...KB.SLAM }); applyPlayerDebuff('STUN', 0.6); }
    },
    end(e) { stand(e); },
    windTick(e) { requestYaw(Math.atan2(e.dir.x, e.dir.z)); },
  },
];

function warmach(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_WARMACH!;
  if (S.stompCd > 0) S.stompCd -= dt;
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 9, 17, e.speed * (1 + 0.12 * e.phase), 0.35);
  if (e.attackCd > 0) return;
  let id: number;
  if (dist < e.radius + 6 && S.stompCd <= 0) { id = M_STOMP; S.stompCd = 7; }   // too close: stomp you away
  else id = WARMACH_ORDER[S.cycle++ % WARMACH_ORDER.length];
  beginAtk(e, list, id, ux, uz, dist);
}

// ============================================================ VOID HERALD =====
const V_PORTALS = 0, V_GRAVITY = 1, V_ECHOES = 2;
const HERALD_ORDER = [V_PORTALS, V_ECHOES, V_GRAVITY, V_PORTALS, V_ECHOES];

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

function herald(e: Enemy, dt: number, dist: number, ux: number, uz: number): void {
  const list = LISTS.BOSS_VOID!;
  if (!S.voidOn) { // the arena ring starts closing in
    S.voidOn = true;
    const p = world.player.pos;
    arena.shrink = true; arena.cx = (e.pos.x + p.x) * 0.5; arena.cz = (e.pos.z + p.z) * 0.5; arena.r = 60; arena.edgeT = 0; arena.rate = 0.9 + 0.35 * e.phase;
    notify('The Void closes in - stay inside the ring!', '#c084fc');
  }
  clampToVoid(e.pos, 3);
  if (e.state !== 'CHASE') { runAtk(e, list, dt, ux, uz, dist); return; }
  keepRange(e, ux, uz, dist, 10, 17, e.speed * (1 + 0.12 * e.phase), 0.45);
  if (e.attackCd > 0) return;
  beginAtk(e, list, HERALD_ORDER[S.cycle++ % HERALD_ORDER.length], ux, uz, dist);
}

