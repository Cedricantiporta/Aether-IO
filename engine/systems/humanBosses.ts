// ============================================================================
// Humanoid mini bosses: a NEW kind of guardian (enemy kind 'HUMAN_BOSS'), hero-sized KayKit characters with boss skills.
//   VARN  'Captain Varn, the Ironwall'  (shield knight)  Shield Wall (blocks FRONTAL hits, open from behind / the sides),
//         Shield Bash (telegraphed line charge + knockback), Ground Slam (telegraphed circle), sword swings; at 50% HP
//         raises a targetable Bulwark Banner: while it stands he takes 75% less damage.
//   SABLE 'Sable, the Hexblade'  (dark mage-duelist)     Arcane Ward (absorb bubble with its own HP, re-cast every ~20 s,
//         breaking it staggers her), Blink Strike (vanishes, reappears behind the hero after a telegraph), Hex Circles
//         (delayed AoE circles), Shadow Bolt volleys.
//   ROOK  'Rook, the Huntmaster' (ranger)                Shadow-roll dodge (leaves a trap), Volley (telegraphed cone), Snare
//         Traps (visible floor traps that root), calls a hound, Marked Shot (charged telegraphed line that tracks you).
// One humanoid boss exists at a time: per-fight memory lives in the module object `S`; strikes / traps tick in
// tickHumanBoss() (also while staggered). Render: render/HumanBosses.tsx reads `humanView` / `humanTraps`.
// They are minis (e.mini = true) so the stagger bar and the WINDED free-hit windows of enemies.ts apply: every skill ends in
// RECOVER -> CHASE / KITE, and the AI is skipped by enemies.ts while winded. Pure engine code, no per-frame allocations.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { damagePlayer, applyPlayerDebuff, knockHero, KB, staggerView, towerMode, towerCrystals, playerTrickImmune } from './combat';
import { enter, requestYaw, fireEnemyProjectile, spawnEnemy, rollEliteShield, spawnTelegraphCircle, spawnTelegraphLine, spawnTelegraphCone } from './enemies';
import { hooks } from './hooks';
import { spawnPickup, dropCrystals } from './pickups';
import { dropLoot } from './loot';
import { BT } from './bossFx';
import { useGameStore, rollDropPlus } from '../../store';
import { rarityForDepth } from '../roomDefs';
import { edgeLimit } from '../mapgen';

export type HumanKind = 'VARN' | 'SABLE' | 'ROOK';
export const HUMAN_KINDS: readonly HumanKind[] = ['VARN', 'SABLE', 'ROOK'];
export const HUMAN_INFO: Record<HumanKind, { name: string; title: string; intro: string; hp: number }> = {
  VARN: { name: 'Captain Varn', title: 'the Ironwall', intro: 'Break against my shield, little hero!', hp: 1.15 },
  SABLE: { name: 'Sable', title: 'the Hexblade', intro: 'Let me show you a proper duel.', hp: 0.95 },
  ROOK: { name: 'Rook', title: 'the Huntmaster', intro: 'The hunt begins. Run, little rabbit.', hp: 1.0 },
};
const NAMES: Record<HumanKind, string[]> = {
  VARN: ['', 'Shield Wall!', 'Shield Bash!', 'Ground Slam!', '', 'Bulwark Banner!'],
  SABLE: ['', 'Arcane Ward!', 'Blink Strike!', 'Hex Circles!', 'Shadow Bolts!', ''],
  ROOK: ['', 'Shadow Roll!', 'Volley!', 'Snare Traps!', 'Hounds, to me!', 'Marked Shot!'],
};
const SWING = 4;      // Varn basic swing
const BANNER = 5;     // Varn
const MARKED = 5;     // Rook

/** Read by render/HumanBosses.tsx. atk / cast are pulse counters (a change = play the one-shot). */
export const humanView = { id: -1, kind: 'VARN' as HumanKind, atk: 0, cast: 0, wall: 0, ward: 0, charge: 0, enraged: 0, bannerId: -1, roll: 0 };
/** Snare traps on the floor: arm = seconds until armed. */
export interface HumanTrap { active: boolean; x: number; z: number; arm: number; life: number; r: number }
export const humanTraps: HumanTrap[] = Array.from({ length: 10 }, () => ({ active: false, x: 0, z: 0, arm: 0, life: 0, r: 1.7 }));

const S = {
  id: -1, kind: 'VARN' as HumanKind,
  cd: [0, 0, 0, 0, 0, 0, 0], gap: 1.2, strafe: 1, strafeT: 2,
  t: 0, wind: 0, act: 0, dirX: 0, dirZ: 1, tick: 0, flag: false, inv: 0, blockText: 0,
  wallT: 0, lockYaw: 0, bannerId: -1, bannerDone: false, bannerArmed: false,
  wardUp: false, spotX: 0, spotZ: 0, houndId: -1, volley: 0,
  markZ: null as ReturnType<typeof spawnTelegraphLine>,
};
const tmp = new Vector3(), tmp2 = new Vector3(), dirV = new Vector3();
const C_STEEL = 0xc8d0e0, C_VIOLET = 0xa04aff, C_GREEN = 0x9be04a, C_RED = 0xff4a3a;

const pw = (e: Enemy) => Math.max(8, e.projectileDamage, e.contactDamage * 0.9);

// ------------------------------------------------------------- pending strikes ----
const STUN = 1, SLOW = 2, KNOCK = 4;
interface Pending { active: boolean; t: number; x: number; z: number; r: number; dmg: number; eff: number; color: number }
const pend: Pending[] = Array.from({ length: 16 }, () => ({ active: false, t: 0, x: 0, z: 0, r: 0, dmg: 0, eff: 0, color: 0 }));

function playerIn(x: number, z: number, r: number): boolean {
  const p = world.player;
  if (!p.alive) return false;
  const dx = p.pos.x - x, dz = p.pos.z - z, rr = r + 0.6;
  return dx * dx + dz * dz < rr * rr;
}
function shove(dx: number, dz: number, dist: number): void {
  const p = world.player;
  if (!p.alive || playerTrickImmune()) return;
  p.pos.x += dx * dist; p.pos.z += dz * dist;
  const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
  if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
}
function effects(eff: number, x: number, z: number): void {
  if (eff & STUN) applyPlayerDebuff('STUN', 0.6);
  if (eff & SLOW) applyPlayerDebuff('SLOW', 2, 0.4);
  if (eff & KNOCK) knockHero(x, z, (eff & STUN) ? KB.SLAM.kb : KB.PUSH.kb, (eff & STUN) ? KB.SLAM.down : 0);   // (stunning strikes = knockdown)
}
function clampIn(out: Vector3, pad = 3): Vector3 {
  const r = Math.hypot(out.x, out.z), lim = edgeLimit(out.x, out.z, pad);
  if (r > lim) { out.x *= lim / r; out.z *= lim / r; }
  return out;
}
function warnCircle(x: number, z: number, r: number, life: number, color: number): void {
  const zn = spawnTelegraphCircle(x, z, r, life, 0, color);
  if (zn) zn.trick = BT.VISUAL;
}
/** A telegraphed strike: the circle fills for `delay` s, then everything inside takes `dmg` (+ effects). */
function strike(x: number, z: number, r: number, delay: number, dmg: number, eff: number, color: number, show = true): void {
  for (const p of pend) {
    if (p.active) continue;
    p.active = true; p.t = delay; p.x = x; p.z = z; p.r = r; p.dmg = dmg; p.eff = eff; p.color = color;
    if (show) warnCircle(x, z, r, delay, color);
    return;
  }
}
function tickPending(dt: number): void {
  for (const p of pend) {
    if (!p.active) continue;
    p.t -= dt;
    if (p.t > 0) continue;
    p.active = false;
    tmp.set(p.x, 0, p.z);
    events.emit('explosion', { pos: tmp.clone(), radius: p.r * 0.8, color: p.color });
    if (p.r > 4.5) events.emit('quake', { pos: tmp.clone(), radius: p.r });
    if (playerIn(p.x, p.z, p.r)) { damagePlayer(p.dmg, { pos: tmp, kind: 'PHYSICAL' }); effects(p.eff, p.x, p.z); }
  }
}

// ------------------------------------------------------------- spawning ------
/** Spawns humanoid boss `kind` at (x, z) with a boss bar. HP ~ 1.25x a guardian of the depth (director applies the champion factor). */
export function spawnHumanBoss(kind: HumanKind, x: number, z: number): Enemy | null {
  const e = spawnEnemy('HUMAN_BOSS', tmp.set(x, 0, z));
  if (!e) return null;
  const info = HUMAN_INFO[kind];
  // spawnEnemy gave def.hp * wave * mods * 1.4 * level * biome; a guardian is that / 1.4 * 5 (spawnMiniBoss): +25% for these
  e.maxHp = Math.round(e.maxHp / 1.4 * 5 * 1.25 * info.hp); e.hp = e.maxHp;
  e.mini = true; e.staggerMax = 70; e.armor = Math.round(e.armor * 1.2);
  rollEliteShield(e);
  e.xp *= 12; e.gold = 0; e.pattern = 0; e.elite = false;
  e.contactDamage *= 0.7;
  if (kind === 'VARN') { e.armor = Math.round(e.armor * 1.3); e.speed *= 0.95; }
  if (kind === 'ROOK') e.speed *= 1.1;
  S.id = e.id; S.kind = kind;
  resetFight();
  const cd = S.cd;
  cd[0] = 1.5;
  if (kind === 'VARN') { cd[1] = 3; cd[2] = 5; cd[3] = 2; }
  else if (kind === 'SABLE') { cd[1] = 0.4; cd[2] = 7; cd[3] = 3; cd[4] = 1.5; }
  else { cd[1] = 6; cd[2] = 2.5; cd[3] = 5; cd[4] = 4; cd[5] = 8; }
  S.strafe = Math.random() < 0.5 ? 1 : -1;
  humanView.id = e.id; humanView.kind = kind;
  const b = world.boss;
  b.active = true; b.name = info.name; b.title = info.title; b.hp = e.hp; b.maxHp = e.maxHp; b.phase = 0; b.ability = ''; b.abilityT = 0; b.shield = 0; b.shieldMax = 0;
  events.emit('bossSpawn', { name: info.name, title: info.title });
  events.emit('floatText', { pos: e.pos, text: info.intro, color: 0xffe9a8, scale: 1.1, dy: 4.2 });
  useGameStore.getState().addNotification(`${info.name}, ${info.title}: "${info.intro}"`, '#fbbf24', 'BOSS');
  events.emit('shake', { amount: 0.3 });
  return e;
}

function resetFight(): void {
  S.cd.fill(0); S.gap = 1.2; S.t = 0; S.inv = 0; S.wallT = 0; S.bannerId = -1; S.bannerDone = false; S.bannerArmed = false;
  S.wardUp = false; S.houndId = -1; S.volley = 0; S.markZ = null; S.flag = false;
  for (const p of pend) p.active = false;
  for (const t of humanTraps) t.active = false;
  humanView.wall = 0; humanView.ward = 0; humanView.charge = 0; humanView.enraged = 0; humanView.bannerId = -1; humanView.roll = 0;
}

function aliveId(id: number): boolean { const w = id >= 0 ? world.enemies[id] : null; return !!w && w.active && w.state !== 'DYING'; }
function killSummon(id: number): void {
  const w = id >= 0 ? world.enemies[id] : null;
  if (!w || !w.active || w.state === 'DYING') return;
  w.state = 'DYING'; w.stateT = 0; w.deathT = 0; w.hp = 0; w.vel.set(0, 0, 0);
  events.emit('enemyDeath', { pos: w.pos, kind: w.kind, elite: false, boss: false, scale: w.scale, poof: true });
}

/** Called from enemies.onEnemyDeath: rewards like a guardian, summons crumble, boss bar off. */
export function humanBossDied(e: Enemy): void {
  if (e.id !== S.id) return;
  killSummon(S.bannerId); killSummon(S.houndId);
  S.id = -1;
  resetFight();
  humanView.id = -1;
  world.boss.active = false; world.boss.hp = 0; world.boss.abilityT = 0; world.boss.shield = 0; world.boss.shieldMax = 0;
  events.emit('shake', { amount: 0.6 });
  events.emit('explosion', { pos: e.pos, radius: e.radius * 3, color: 0xffd27a });
  events.emit('floatText', { pos: e.pos, text: 'CHAMPION DEFEATED', color: 0xffe9a8, scale: 1.1, dy: 2.6 });
  const st = useGameStore.getState(), wave = world.director.wave;
  const luck = 2 * (1 + wave * 0.02);
  if (towerMode()) { dropCrystals(towerCrystals(false, true, false, wave), e.pos); return; }
  dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
  dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
  const item = rollDropPlus(st.rollItemDrop(wave >= 25 && Math.random() < 0.35 ? 'LEGENDARY' : wave >= 15 ? 'EPIC' : 'RARE'), 1);
  if (item) spawnPickup('ITEM', tmp.set(e.pos.x, 0, e.pos.z), 0, item);
  const it2 = rollDropPlus(st.rollItemDrop(rarityForDepth(wave, 0.5, world.run.bossKills)), 1);
  if (it2) spawnPickup('ITEM', tmp.set(e.pos.x + 0.9, 0, e.pos.z), 0, it2);
  for (let i = 0; i < 5; i++) spawnPickup('GOLD', tmp.set(e.pos.x + (Math.random() - 0.5) * 3, 0, e.pos.z + (Math.random() - 0.5) * 3), 10 + wave);
}

// ------------------------------------------------------------- damage hook ---
/**
 * Damage multiplier for a hit on the humanoid boss from (fx, fz). Varn's raised Shield Wall blocks everything from the front
 * arc (0) and takes +50% from behind / the sides; his Bulwark Banner takes 75% off all damage while it stands.
 */
hooks.humanMul = (e: Enemy, fx: number, fz: number): number => {
  if (e.id !== S.id) return 1;
  if (S.inv > 0) return 0;
  let m = 1;
  if (S.kind === 'VARN') {
    if (S.wallT > 0 && e.state === 'ATTACK' && e.pattern === 1 && e.staggerT <= 0) {
      const dx = fx - e.pos.x, dz = fz - e.pos.z, l = Math.hypot(dx, dz) || 1;
      const fwd = (dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / l;
      if (fwd > 0.26) {   // within ~75 deg of his facing (flanks are open)
        e.hitFlash = Math.max(e.hitFlash, 0.25);
        if (world.time - S.blockText > 0.35) { S.blockText = world.time; events.emit('floatText', { pos: e.pos, text: 'BLOCKED', color: 0xc8d4e6, scale: 0.9, dy: 2.4 }); events.emit('projectileImpact', { pos: e.pos, kind: 'ENEMY' }); }
        return 0;
      }
      m *= 1.5;
      if (world.time - S.blockText > 0.5) { S.blockText = world.time; events.emit('floatText', { pos: e.pos, text: 'BACKSTAB!', color: 0xffc23a, scale: 1.0, dy: 2.3 }); }
    }
    if (aliveId(S.bannerId)) {
      m *= 0.25;
      if (world.time - S.blockText > 0.7) { S.blockText = world.time; events.emit('floatText', { pos: e.pos, text: 'BANNER SHIELD', color: 0xffd27a, scale: 0.8, dy: 2.0 }); }
    }
  }
  return m;
};

// ------------------------------------------------------------- helpers -------
function aimAt(e: Enemy, px: number, pz: number): number {
  const dx = px - e.pos.x, dz = pz - e.pos.z, l = Math.hypot(dx, dz) || 1;
  S.dirX = dx / l; S.dirZ = dz / l;
  return l;
}
function shoot(e: Enemy, dx: number, dz: number, kind: 'ARROW' | 'ORB' | 'BOSS_ORB', speed: number, dmg: number, radius?: number, life?: number): void {
  tmp.set(e.pos.x + dx * 0.8, 1.3, e.pos.z + dz * 0.8);
  tmp2.set(dx, 0, dz);
  fireEnemyProjectile(tmp, tmp2, kind, speed, dmg, { radius, life });
}
function announce(k: number): void {
  const b = world.boss;
  b.ability = NAMES[S.kind][k] ?? ''; b.abilityT = 2.2;
}
function blinkFx(kind: 'BLINK' | 'ROLL', x: number, z: number, r: number, tx = x, tz = z): void {
  events.emit('darkFx', { pos: new Vector3(x, 0, z), kind, radius: r, to: new Vector3(tx, 0, tz) });
}
/** A free spot `d` from the hero opposite to the boss, inside the room. */
function retreatPoint(e: Enemy, px: number, pz: number, d: number, out: Vector3): void {
  let dx = e.pos.x - px, dz = e.pos.z - pz;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  for (let k = 0; k < 8; k++) {
    const a = Math.atan2(dx, dz) + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55);
    const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    const lim = edgeLimit(x, z, 3);
    if (x * x + z * z < lim * lim) { out.set(x, 0, z); return; }
  }
  out.set(e.pos.x * 0.3, 0, e.pos.z * 0.3);
}
function addTrap(x: number, z: number, arm: number): void {
  for (const t of humanTraps) {
    if (t.active) continue;
    t.active = true; t.x = x; t.z = z; t.arm = arm; t.life = 16; t.r = 1.7;
    return;
  }
}

// ------------------------------------------------------------- skills --------
function wants(k: number, d: number): boolean {
  switch (S.kind) {
    case 'VARN': return k === 1 ? d < 10 : k === 2 ? d > 4 && d < 16 : k === 3 ? d < 7.5 : false;
    case 'SABLE': return k === 1 ? true : k === 2 ? d > 3 : k === 3 ? d < 24 : k === 4 ? d < 22 : false;
    default: return k === 1 ? d < 5.5 : k === 2 ? d < 20 : k === 3 ? d < 22 : k === 4 ? !aliveId(S.houndId) : k === MARKED ? d > 6 && d < 30 : false;
  }
}
/** Cooldown (s) after skill k. */
function cdOf(k: number): number {
  switch (S.kind) {
    case 'VARN': return [0, 12, 8, 7, 1.3][k] ?? 5;
    case 'SABLE': return [0, 20, 9, 10, 6][k] ?? 5;
    default: return [0, 5, 8, 12, 26, 11][k] ?? 5;
  }
}

function begin(e: Enemy, k: number, px: number, pz: number): void {
  aimAt(e, px, pz);
  e.pattern = k; enter(e, 'WINDUP'); e.vel.set(0, 0, 0);
  S.t = 0; S.tick = 0; S.flag = false; S.volley = 0;
  const P = pw(e), dx = S.dirX, dz = S.dirZ;
  if (!(S.kind === 'VARN' && k === SWING)) announce(k);
  humanView.cast++;
  if (S.kind === 'VARN') {
    if (k === 1) { S.wind = 0.35; S.act = 3.0; }
    else if (k === 2) {
      S.wind = 0.8; S.act = 0.5;
      const zn = spawnTelegraphLine(e.pos.x, e.pos.z, dx, dz, 14, 3, 0.8, C_STEEL); if (zn) zn.trick = BT.VISUAL;
    } else if (k === 3) { S.wind = 0.9; S.act = 0.25; strike(e.pos.x, e.pos.z, 6, 0.9, P * 2.0, STUN | KNOCK, C_RED); }
    else if (k === SWING) { S.wind = 0.45; S.act = 0.15; strike(e.pos.x + dx * 2.1, e.pos.z + dz * 2.1, 2.7, 0.45, P * 0.8, 0, C_STEEL); }
    else { S.wind = 0.9; S.act = 0.2; warnCircle(e.pos.x, e.pos.z, 4, 0.9, 0xffd27a); }   // BANNER
  } else if (S.kind === 'SABLE') {
    if (k === 1) { S.wind = 0.7; S.act = 0.2; warnCircle(e.pos.x, e.pos.z, 3, 0.7, C_VIOLET); }
    else if (k === 2) {   // vanish now, reappear behind the hero at the marked circle
      S.wind = 0.85; S.act = 0.25;
      const p = world.player, fx = Math.sin(p.facing), fz = Math.cos(p.facing);
      tmp.set(p.pos.x - fx * 2.8, 0, p.pos.z - fz * 2.8); clampIn(tmp, 3);
      S.spotX = tmp.x; S.spotZ = tmp.z;
      warnCircle(S.spotX, S.spotZ, 3.4, S.wind, C_VIOLET);
      e.hideT = S.wind + 0.3;
      blinkFx('BLINK', e.pos.x, e.pos.z, 3.5, S.spotX, S.spotZ);
    } else if (k === 3) { S.wind = 0.6; S.act = 0.3; warnCircle(e.pos.x, e.pos.z, 2.4, 0.6, C_VIOLET); }
    else { S.wind = 0.5; S.act = 1.2; }
  } else {
    if (k === 1) { S.wind = 0.05; S.act = 0.38; retreatPoint(e, px, pz, 9, dirV); aimAt(e, dirV.x, dirV.z); addTrap(e.pos.x, e.pos.z, 0.8); }
    else if (k === 2) { S.wind = 0.9; S.act = 0.2; spawnTelegraphCone(e.pos.x, e.pos.z, dx, dz, 17, 0.5, 0.9, C_GREEN, BT.VISUAL, 0); }
    else if (k === 3) { S.wind = 0.5; S.act = 0.2; }
    else if (k === 4) { S.wind = 0.7; S.act = 0.2; }
    else {   // Marked Shot: the line tracks the hero for the first 60% of the charge, then locks
      S.wind = 1.5; S.act = 0.2;
      S.markZ = spawnTelegraphLine(e.pos.x, e.pos.z, dx, dz, 36, 1.8, 1.5, C_RED);
      if (S.markZ) S.markZ.trick = BT.VISUAL;
    }
  }
}

function release(e: Enemy, px: number, pz: number): void {
  const k = e.pattern, P = pw(e);
  enter(e, 'ATTACK'); S.t = 0; humanView.charge = 0;
  if (S.kind === 'VARN') {
    if (k === 1) { S.wallT = S.act; S.lockYaw = Math.atan2(S.dirX, S.dirZ); humanView.wall = 1; events.emit('shieldBlock', { pos: e.pos.clone(), radius: 3 }); }
    else if (k === 3) { events.emit('shake', { amount: 0.25 }); humanView.atk++; }
    else if (k === BANNER) spawnBanner(e);
    else humanView.atk++;
  } else if (S.kind === 'SABLE') {
    if (k === 1) raiseWard(e);
    else if (k === 2) {   // appear behind the hero with a burst
      blinkFx('BLINK', S.spotX, S.spotZ, 3.5, e.pos.x, e.pos.z);
      e.pos.x = S.spotX; e.pos.z = S.spotZ; e.hideT = 0;
      tmp2.set(S.spotX, 0, S.spotZ);
      events.emit('explosion', { pos: tmp2.clone(), radius: 3.4, color: C_VIOLET });
      if (playerIn(S.spotX, S.spotZ, 3.4)) { damagePlayer(P * 1.7, { pos: tmp2, kind: 'PHYSICAL' }); effects(KNOCK | SLOW, S.spotX, S.spotZ); }
      humanView.atk++;
    } else if (k === 3) {
      const p = world.player;
      strike(p.pos.x, p.pos.z, 3.2, 0.9, P * 1.2, SLOW, C_VIOLET);
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.283, r = 3 + Math.random() * 5;
        tmp.set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r); clampIn(tmp, 3);
        strike(tmp.x, tmp.z, 3.2, 1.2 + i * 0.25, P * 1.2, SLOW, C_VIOLET);
      }
      humanView.atk++;
    }
  } else {
    if (k === 1) { S.inv = S.act + 0.05; humanView.roll++; blinkFx('ROLL', e.pos.x, e.pos.z, 1.5); }
    else if (k === 2) {
      const base = Math.atan2(S.dirX, S.dirZ);
      for (let i = 0; i < 9; i++) { const a = base + (i / 8 - 0.5) * 1.0; shoot(e, Math.sin(a), Math.cos(a), 'ARROW', 21, P * 0.55, 0.32, 1.2); }
      humanView.atk++; events.emit('shake', { amount: 0.12 });
    } else if (k === 3) {
      const p = world.player;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * 6.283 + Math.random() * 0.8, r = 2.5 + Math.random() * 3.5;
        tmp.set(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r); clampIn(tmp, 3);
        addTrap(tmp.x, tmp.z, 0.9);
      }
      humanView.atk++;
    } else if (k === 4) callHound(e);
    else {   // Marked Shot lands
      S.markZ = null;
      events.emit('lightning', { from: new Vector3(e.pos.x, 1.4, e.pos.z), to: new Vector3(e.pos.x + S.dirX * 36, 1.2, e.pos.z + S.dirZ * 36) });
      events.emit('shake', { amount: 0.3 });
      const rx = px - e.pos.x, rz = pz - e.pos.z, t = rx * S.dirX + rz * S.dirZ, perp = Math.abs(rx * S.dirZ - rz * S.dirX);
      if (world.player.alive && t > -0.6 && t < 36.6 && perp < 1.5) { damagePlayer(P * 3.2, { pos: e.pos, kind: 'PHYSICAL', ...KB.PUSH }); applyPlayerDebuff('BLEED', 3, Math.max(2, P * 0.1)); }
      humanView.atk++;
    }
  }
}

function tickActive(e: Enemy, dt: number, px: number, pz: number): void {
  const k = e.pattern, P = pw(e);
  if (S.kind === 'VARN') {
    if (k === 1) {   // Shield Wall: facing locked, shuffles forward
      // (facing fully locked at the yaw it started with: S.lockYaw never turns during the wall)
      requestYaw(S.lockYaw);
      e.vel.set(Math.sin(S.lockYaw) * e.speed * 0.35, 0, Math.cos(S.lockYaw) * e.speed * 0.35);
      S.wallT -= dt;
      return;
    }
    if (k === 2) {   // Shield Bash: charge along the telegraphed line, one hit + knockback
      e.vel.set(S.dirX * 26, 0, S.dirZ * 26); requestYaw(Math.atan2(S.dirX, S.dirZ));
      if (!S.flag && playerIn(e.pos.x, e.pos.z, 1.6)) {
        S.flag = true;
        damagePlayer(P * 1.6, { pos: e.pos, kind: 'PHYSICAL', ...KB.SLAM });   // shield bash connects: knockdown
        applyPlayerDebuff('STUN', 0.4);
        events.emit('shake', { amount: 0.3 });
      }
      return;
    }
  } else if (S.kind === 'SABLE') {
    if (k === 4) {   // Shadow Bolts: three fans of three
      e.vel.set(0, 0, 0);
      S.tick -= dt;
      if (S.tick <= 0 && S.volley < 3) {
        S.tick = 0.4; S.volley++;
        aimAt(e, px, pz);
        const base = Math.atan2(S.dirX, S.dirZ);
        for (let i = -1; i <= 1; i++) { const a = base + i * 0.28; shoot(e, Math.sin(a), Math.cos(a), 'BOSS_ORB', 11, P * 0.7, 0.55, 2.6); }
        humanView.atk++;
      }
      requestYaw(Math.atan2(S.dirX, S.dirZ));
      return;
    }
  } else if (k === 1) {   // Rook roll
    e.vel.set(S.dirX * 18, 0, S.dirZ * 18); requestYaw(Math.atan2(S.dirX, S.dirZ));
    return;
  }
  e.vel.set(0, 0, 0);
}

function finish(e: Enemy): void {
  const k = e.pattern;
  if (S.kind === 'VARN' && k === 1) { S.wallT = 0; humanView.wall = 0; }
  if (S.kind === 'ROOK' && k === 1) { aimAt(e, world.player.pos.x, world.player.pos.z); shoot(e, S.dirX, S.dirZ, 'ARROW', 24, pw(e) * 0.6); humanView.atk++; }
  const rate = e.phase > 0 && !(S.kind === 'SABLE' && k === 1) ? 1.4 : 1;
  S.cd[S.kind === 'VARN' && k === SWING ? 0 : k] = cdOf(k) * (0.85 + Math.random() * 0.3) / rate;
  S.gap = 0.9; e.pattern = 0; e.vel.set(0, 0, 0);
  enter(e, 'RECOVER'); S.t = 0;
}

function cancel(e: Enemy): void {
  humanView.wall = 0; humanView.charge = 0; S.wallT = 0; S.inv = 0; e.hideT = 0; S.markZ = null;
  if (e.pattern > 0) { S.cd[S.kind === 'VARN' && e.pattern === SWING ? 0 : e.pattern] = 2; e.pattern = 0; }
  enter(e, 'RECOVER'); S.t = 0;
}

function spawnBanner(e: Enemy): void {
  const a = Math.random() * 6.283;
  tmp.set(e.pos.x + Math.cos(a) * 8, 0, e.pos.z + Math.sin(a) * 8); clampIn(tmp, 4);
  const w = spawnEnemy('BOSS_CRYSTAL', tmp);
  if (!w) return;
  w.maxHp = Math.max(60, Math.round(e.maxHp * 0.08)); w.hp = w.maxHp; w.shield = 0;
  S.bannerId = w.id; S.bannerDone = true; humanView.bannerId = w.id;
  events.emit('shockwave', { pos: tmp.clone(), radius: 7, color: 0xffd27a });
  events.emit('floatText', { pos: w.pos, text: 'BULWARK BANNER', color: 0xffd27a, scale: 1.2, dy: 3.5 });
  useGameStore.getState().addNotification('Destroy the Bulwark Banner to break his shield!', '#ffd27a', 'BOSS');
}
function raiseWard(e: Enemy): void {
  e.shield = Math.max(e.shield, e.maxHp * (e.phase > 0 ? 0.16 : 0.12));
  S.wardUp = true; humanView.ward = 1;
  world.boss.shieldMax = Math.max(world.boss.shieldMax, e.shield);
  events.emit('shockwave', { pos: e.pos.clone(), radius: 5, color: C_VIOLET });
  events.emit('floatText', { pos: e.pos, text: 'ARCANE WARD', color: 0xc9a2ff, scale: 1.1, dy: 3.5 });
}
function callHound(e: Enemy): void {
  tmp.set(e.pos.x - S.dirX * 2, 0, e.pos.z - S.dirZ * 2); clampIn(tmp, 3);
  const w = spawnEnemy('DIREWOLF', tmp);
  if (!w) return;
  w.maxHp = Math.round(w.maxHp * 1.4); w.hp = w.maxHp; w.speed *= 1.1;
  S.houndId = w.id;
  events.emit('floatText', { pos: e.pos, text: 'Hounds, to me!', color: 0xd9f99d, scale: 1.0, dy: 3.8 });
  events.emit('shockwave', { pos: tmp.clone(), radius: 4, color: C_GREEN });
  humanView.atk++;
}

// ------------------------------------------------------------- AI ------------
/** Per-frame AI (called from enemies.runAI). (px, pz) = the hero, d = distance to it. */
export function aiHumanBoss(e: Enemy, dt: number, px: number, pz: number, d: number): void {
  if (S.id !== e.id) { S.id = e.id; humanView.id = e.id; }
  S.t += dt;
  const kind = S.kind;
  if (e.phase === 0 && e.hp < e.maxHp * 0.5) {   // enrage: faster cooldowns; Varn raises his banner
    e.phase = 1; world.boss.phase = 1; humanView.enraged = 1;
    events.emit('bossPhase', { phase: 1 });
    events.emit('floatText', { pos: e.pos, text: 'ENRAGED', color: 0xff3a5a, scale: 1, dy: 2.4 });
    if (kind === 'VARN') S.bannerArmed = true;
  }
  const rate = e.phase > 0 ? 1.4 : 1;
  for (let i = 0; i < S.cd.length; i++) if (S.cd[i] > 0) S.cd[i] -= dt * (kind === 'SABLE' && i === 1 ? 1 : rate);
  if (S.gap > 0) S.gap -= dt * rate;

  switch (e.state) {
    case 'WINDUP':
      e.vel.set(0, 0, 0);
      if (!(kind === 'SABLE' && e.pattern === 2) && !(kind === 'ROOK' && e.pattern === MARKED && S.t >= S.wind * 0.6)
        && !(kind === 'VARN' && e.pattern === 2)) aimAt(e, px, pz);
      if (kind === 'ROOK' && e.pattern === MARKED && S.t < S.wind * 0.6) {
        const z = S.markZ;
        if (z && z.active && z.kind === 'TELEGRAPH_LINE') { z.dir.set(S.dirX, 0, S.dirZ); z.pos.set(e.pos.x, 0, e.pos.z); }
      }
      requestYaw(Math.atan2(S.dirX, S.dirZ));
      if (!(kind === 'VARN' && e.pattern === SWING)) humanView.charge = Math.min(1, S.t / Math.max(0.1, S.wind));
      if (S.t >= S.wind) release(e, px, pz);
      return;
    case 'ATTACK':
      tickActive(e, dt, px, pz);
      if (S.t >= S.act) finish(e);
      return;
    case 'RECOVER':
      e.vel.set(0, 0, 0);
      if (S.t >= 0.3) enter(e, kind === 'VARN' ? 'CHASE' : 'KITE');
      return;
    default: break;
  }

  // ---- pick a skill
  if (S.gap <= 0 && world.player.alive) {
    if (kind === 'VARN' && S.bannerArmed && !S.bannerDone) { S.bannerArmed = false; begin(e, BANNER, px, pz); return; }
    const n = kind === 'VARN' ? 3 : kind === 'SABLE' ? 4 : 5;
    for (let j = 0; j < n; j++) {
      const k = ((j + (world.frame % n)) % n) + 1;   // rotate the check order so no skill starves
      if (S.cd[k] <= 0 && wants(k, d)) { begin(e, k, px, pz); return; }
    }
  }

  // ---- move + basic attack
  const inv = 1 / Math.max(0.001, d);
  const ux = (px - e.pos.x) * inv, uz = (pz - e.pos.z) * inv;
  if (kind === 'VARN') {
    if (e.state !== 'CHASE') enter(e, 'CHASE');
    if (d > 2.3) e.vel.set(ux * e.speed, 0, uz * e.speed); else e.vel.set(0, 0, 0);
    requestYaw(Math.atan2(ux, uz));
    if (world.player.alive && S.cd[0] <= 0 && d < 4.3) begin(e, SWING, px, pz);
    return;
  }
  if (e.state !== 'KITE') enter(e, 'KITE');
  S.strafeT -= dt;
  if (S.strafeT <= 0) { S.strafeT = 1.6 + Math.random() * 1.8; S.strafe = -S.strafe; }
  const lo = kind === 'SABLE' ? 7 : 9, hi = kind === 'SABLE' ? 12 : 14;
  let vx = -uz * S.strafe * 0.65, vz = ux * S.strafe * 0.65;
  if (d < lo) { vx -= ux; vz -= uz; } else if (d > hi) { vx += ux; vz += uz; }
  const lim = edgeLimit(e.pos.x + vx * 2, e.pos.z + vz * 2, 2.5);
  if ((e.pos.x + vx * 2) ** 2 + (e.pos.z + vz * 2) ** 2 > lim * lim) { S.strafe = -S.strafe; vx = ux * 0.4; vz = uz * 0.4; }
  const vl = Math.hypot(vx, vz) || 1;
  e.vel.set((vx / vl) * e.speed * 0.85, 0, (vz / vl) * e.speed * 0.85);
  requestYaw(Math.atan2(ux, uz));
  if (S.cd[0] <= 0 && d < 20 && world.player.alive) {   // basic shot
    S.cd[0] = (kind === 'SABLE' ? 1.5 : 1.1) * (0.85 + Math.random() * 0.3);
    if (kind === 'SABLE') shoot(e, ux, uz, 'ORB', 14, pw(e) * 0.6, 0.45);
    else shoot(e, ux, uz, 'ARROW', 24, pw(e) * 0.55);
    humanView.atk++;
  }
}

// ------------------------------------------------------------- world tick ----
/** Once per frame from enemies.updateEnemies: boss bar, strikes, traps, banner / ward bookkeeping (also while staggered). */
export function tickHumanBoss(dt: number): void {
  if (S.id < 0) return;
  const e = world.enemies[S.id];
  if (!e || !e.active || e.kind !== 'HUMAN_BOSS') {   // room left / run ended
    S.id = -1; humanView.id = -1; resetFight(); return;
  }
  if (e.state === 'DYING') return;
  const b = world.boss;
  b.active = true; b.hp = e.hp; b.maxHp = e.maxHp; b.stagger = staggerView(e); b.staggered = e.staggerT > 0;
  b.shield = e.shield > 1 ? e.shield : 0;
  if (b.shield <= 0) b.shieldMax = 0; else if (b.shield > b.shieldMax) b.shieldMax = b.shield;
  if (e.staggerT > 0 && (e.state === 'WINDUP' || e.state === 'ATTACK')) cancel(e);
  if (S.inv > 0) S.inv -= dt;
  if (e.hideT > 0 && !(e.state === 'WINDUP' && e.pattern === 2 && S.kind === 'SABLE')) e.hideT = 0;   // (only Blink Strike vanishes)
  tickPending(dt);

  // Sable: the ward broke -> she is staggered (a window to punish)
  if (S.kind === 'SABLE' && S.wardUp && e.shield <= 1) {
    S.wardUp = false; humanView.ward = 0; e.shield = 0;
    events.emit('explosion', { pos: e.pos, radius: 3.5, color: C_VIOLET });
    events.emit('floatText', { pos: e.pos, text: 'WARD BROKEN', color: 0xc9a2ff, scale: 1.2, dy: 3.5 });
    e.staggerT = Math.max(e.staggerT, 2.2);
  }
  // Varn: the banner fell -> his guard breaks, he reels
  if (S.kind === 'VARN' && S.bannerDone && S.bannerId >= 0 && !aliveId(S.bannerId)) {
    S.bannerId = -1; humanView.bannerId = -1;
    events.emit('explosion', { pos: e.pos, radius: 3.5, color: 0xffd27a });
    events.emit('floatText', { pos: e.pos, text: 'BANNER DESTROYED', color: 0xffd27a, scale: 1.2, dy: 3.5 });
    e.staggerT = Math.max(e.staggerT, 2.2);
  }

  // Rook: snare traps root whoever steps on an armed one
  if (S.kind === 'ROOK') {
    const p = world.player;
    for (const t of humanTraps) {
      if (!t.active) continue;
      t.life -= dt; if (t.arm > 0) t.arm -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      if (t.arm <= 0 && p.alive && playerIn(t.x, t.z, t.r - 0.4)) {
        t.active = false;
        tmp.set(t.x, 0, t.z);
        events.emit('explosion', { pos: tmp.clone(), radius: 2, color: 0xc8a050 });
        damagePlayer(pw(e) * 0.8, { pos: tmp, kind: 'PHYSICAL' });
        applyPlayerDebuff('ROOT', 1.8);
      }
    }
  }
}

/** Debug: the kind to fight next in a champion room (consumed by director.rollRoomSpawns). */
export const debugHuman = { kind: '' as HumanKind | '' };
