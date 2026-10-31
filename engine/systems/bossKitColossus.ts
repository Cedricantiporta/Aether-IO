// ============================================================================
// DUNE COLOSSUS signature: OVERHEAT CORE (docs/BOSS_DESIGN_REFERENCE.md, pattern 35 = weak point; Zelda / Hollow Knight style).
// Every FLAME BURST (a flamethrower sweep from dodgeMechs.ts, or a Missile Salvo) heats the machine up. At HEAT_MAX (3) it VENTS: it turns its back
// to the hero (rear plates open, steam ring round the hull), freezes its aim and for VENT_T = 5 s its BACK CORE is exposed: hits from the rear 120 deg
// arc take x1.3 on top of the usual x1.5 back attack (= ~x2 in all). While it vents it spits red spark circles at the hero's feet, so he has
// to keep moving while he stays behind it. Also here: the two new skills' helpers (Missile Salvo with ground-marked impacts, Shrapnel Wall).
// Host-only state `WX`; a co-op guest derives the exposed core from the synced enemy (state ATTACK + pattern M_VENT, see render/BossKitFx.tsx).
// The old 'Molten Ray' (bosses2) is retired: the dodgeMechs flamethrower is the Colossus' only flame stream now.
// No per-frame allocation: module scratch vectors, pooled zones / projectiles.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { fireEnemyProjectile, spawnTelegraphLine } from './enemies';
import { BT, stat } from './bossFx';
import { dodgeStats } from './dodgeMechs';
import { BACKSTAB_DOT } from './combat';
import { circle, pwr, notify, clampArena, spreadSpots, SPOT_X, SPOT_Z } from './bosses2';
import { edgeLimit } from '../mapgen';

/** Pattern index of the vent in bosses2's LISTS.BOSS_WARMACH (render/BossKitFx.tsx reads the same number). */
export const M_VENT = 1;
export const HEAT_MAX = 3, VENT_T = 5, VENT_BACK_MUL = 1.3, VENT_MIN_GAP = 20, VENT_WIND = 1.5;

export const WX = { heat: 0, ventT: 0, flameSeen: 0, lastVent: -99, vents: 0, yaw: 0, sparkT: 0, t: 0, salvos: 0, walls: 0 };
const tv = new Vector3(), dv = new Vector3();

export function warmReset(): void {
  WX.heat = 0; WX.ventT = 0; WX.flameSeen = dodgeStats.Flamethrower | 0; WX.lastVent = -99; WX.vents = 0; WX.sparkT = 0; WX.t = 0; WX.salvos = 0; WX.walls = 0;
}

function heatText(e: Enemy): void {
  const h = Math.min(HEAT_MAX, WX.heat);
  events.emit('floatText', { pos: e.pos, text: `HEAT ${'●'.repeat(h)}${'○'.repeat(HEAT_MAX - h)}`, color: h >= HEAT_MAX ? 0xff5a2a : 0xffb347, scale: h >= HEAT_MAX ? 1.5 : 1.1, dy: 9 });
}
export function addHeat(e: Enemy, n = 1): void { WX.heat += n; heatText(e); }

/** Every frame from bosses2.warmach (host): turns new flamethrower casts (dodgeMechs counter) into heat. */
export function warmTick(e: Enemy): void {
  const f = dodgeStats.Flamethrower | 0;
  if (f > WX.flameSeen) { const n = f - WX.flameSeen; WX.flameSeen = f; addHeat(e, n); stat('FlameBurst'); }
}
/** True when the vent is due: heat full, not too soon after the last one. */
export const ventDue = (): boolean => WX.heat >= HEAT_MAX && world.time - WX.lastVent >= VENT_MIN_GAP;
/** The core is open right now (host: timer; used by the damage hook). */
export const ventOpen = (e: Enemy): boolean => WX.ventT > 0 && e.state === 'ATTACK' && e.pattern === M_VENT;

/** hooks.damageMul for the Colossus: extra damage from the rear arc while the core is vented. */
export function warmDamageMul(e: Enemy, fx?: number, fz?: number): number {
  if (!ventOpen(e) || fx === undefined || fz === undefined) return 1;
  const dx = fx - e.pos.x, dz = fz - e.pos.z, l = Math.hypot(dx, dz);
  if (l < 0.05) return 1;
  return (dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / l < BACKSTAB_DOT ? VENT_BACK_MUL : 1;
}

// ---------------------------------------------------------------- Core Vent ---
/** Wind-up: aim the BACK at the hero (yaw = away from him), steam ring telegraph round the hull. */
export function ventBegin(e: Enemy, ux: number, uz: number): void {
  WX.yaw = Math.atan2(-ux, -uz); WX.t = 0;
  circle(e.pos.x, e.pos.z, e.radius + 6.5, VENT_WIND, BT.SHELL, pwr(e) * 0.8, 0xffa040);
  events.emit('floatText', { pos: e.pos, text: 'OVERHEATING!', color: 0xff5a2a, scale: 1.7, dy: 9 });
  notify('The Colossus overheats - get BEHIND it and hit the glowing core!', '#ff8a3a');
}
export function ventAim(e: Enemy): number {
  const p = world.player.pos;
  if (WX.t < 0.9) WX.yaw = Math.atan2(e.pos.x - p.x, e.pos.z - p.z);   // keeps turning its back on the hero until the aim freezes
  return WX.yaw;
}
export function ventFire(e: Enemy): void {
  WX.ventT = VENT_T; WX.heat = 0; WX.lastVent = world.time; WX.vents++; WX.sparkT = 1.1; WX.t = 0;
  events.emit('floatText', { pos: e.pos, text: 'CORE EXPOSED!', color: 0xffe08a, scale: 1.9, dy: 9 });
  events.emit('trick', { pos: e.pos.clone(), kind: 'KIT_CORE|1', radius: e.radius });
  events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 2.6, color: 0xffa040 });
  events.emit('shake', { amount: 0.6 });
  stat('CoreVent');
}
/** ATTACK tick: the aim is frozen after the turn; red spark circles keep the hero moving behind it. */
export function ventTick(e: Enemy, dt: number): void {
  WX.ventT -= dt; WX.t += dt; WX.sparkT -= dt;
  if (WX.sparkT <= 0 && WX.ventT > 1.1) {
    WX.sparkT = 1.5;
    const p = world.player.pos, v = world.player.vel;
    const n = spreadSpots(p.x + v.x * 0.35, p.z + v.z * 0.35, 2, 5, 9, 6.5);   // one on the hero, one beside
    for (let i = 0; i < n; i++) circle(SPOT_X[i], SPOT_Z[i], 3.4, 1.0, BT.SHELL, pwr(e) * 0.8, 0xffa040);
    stat('VentSparks');
  }
  if (WX.ventT <= 0) { WX.ventT = 0; events.emit('trick', { pos: e.pos.clone(), kind: 'KIT_CORE|0', radius: e.radius }); events.emit('floatText', { pos: e.pos, text: 'CORE SEALED', color: 0x9ca3af, scale: 1.1, dy: 8 }); }
}
export function ventEnd(): void { WX.ventT = 0; }

// ---------------------------------------------------------------- Missile Salvo ---
/** One volley: `n` ground circles on the hero's trail (first on his lead position), a fire missile streaking from the hull onto each. Impact = fire pillar + burn + short fire patch. */
export function missileVolley(e: Enemy, n: number, life: number): void {
  const p = world.player.pos, v = world.player.vel;
  const m = spreadSpots(p.x + v.x * 0.55, p.z + v.z * 0.55, n, 3.5, 11, 7.6);
  for (let i = 0; i < m; i++) {
    const x = SPOT_X[i], z = SPOT_Z[i], lf = life + i * 0.12;
    const zn = circle(x, z, 3.5, lf, BT.PILLAR, pwr(e) * 0.8, 0xff5a1a);
    if (zn) { zn.life = zn.maxLife = Math.max(zn.life, lf); }
    // harmless streak (damage 0: only the red circle hurts) from the hull to the marked spot, landing as the circle fills
    tv.set(e.pos.x, 9, e.pos.z);
    dv.set(x - tv.x, -8.6, z - tv.z);
    const d = Math.hypot(dv.x, dv.z) || 1, fl = Math.max(0.3, lf - 0.05), sp = Math.hypot(dv.x, dv.y, dv.z) / fl;
    dv.multiplyScalar(1 / Math.hypot(dv.x, dv.y, dv.z));
    fireEnemyProjectile(tv, dv, 'FLAME', sp, 0, { life: fl, radius: 1.3 });
    void d;
  }
  events.emit('shake', { amount: 0.15 });
}

// ---------------------------------------------------------------- Shrapnel Wall ---
const WALL_STEP = 2.4, WALL_GAP = 7, WALL_SPEED = 15;
let wallGapA = 0, wallGapB = 0, wallRx = 0, wallRz = 0, wallLx = 0, wallLz = 0, wallLen = 0, wallOx = 0, wallOz = 0, wallDx = 0, wallDz = 0;
/** Wind-up: a row across the arena in front of the Colossus (perpendicular to the line to the hero), with one 7 m gap placed >= 6 m beside the hero's line. Two red lanes mark the danger, the gap is bare floor. */
export function wallBegin(e: Enemy, ux: number, uz: number): void {
  const R = Math.max(20, world.room.radius * 1.05);
  wallDx = ux; wallDz = uz; wallRx = uz; wallRz = -ux;   // travel direction / lateral axis
  wallOx = e.pos.x + ux * (e.radius + 3); wallOz = e.pos.z + uz * (e.radius + 3);
  wallLen = 2 * R;
  const p = world.player.pos, lat = (p.x - wallOx) * wallRx + (p.z - wallOz) * wallRz;   // where the hero stands along the row
  let g = (Math.random() * 2 - 1) * R * 0.75;
  for (let t = 0; t < 8 && Math.abs(g - lat) < 6; t++) g = (Math.random() * 2 - 1) * R * 0.75;
  if (Math.abs(g - lat) < 6) g = lat + (lat > 0 ? -1 : 1) * 8;
  wallGapA = g - WALL_GAP / 2; wallGapB = g + WALL_GAP / 2;
  wallLx = wallOx - wallRx * R; wallLz = wallOz - wallRz * R;   // the row's left end
  const lenA = wallGapA + R, lenB = R - wallGapB;
  if (lenA > 1) { const zn = spawnTelegraphLine(wallLx, wallLz, wallRx, wallRz, lenA, 2.6, 1.15, 0xff5a3a); if (zn) { zn.trick = BT.VISUAL; zn.damage = 0; } }
  if (lenB > 1) { const zn = spawnTelegraphLine(wallOx + wallRx * wallGapB, wallOz + wallRz * wallGapB, wallRx, wallRz, lenB, 2.6, 1.15, 0xff5a3a); if (zn) { zn.trick = BT.VISUAL; zn.damage = 0; } }
  events.emit('floatText', { pos: e.pos, text: 'SHRAPNEL WALL!', color: 0xffd36a, scale: 1.5, dy: 9 });
  WX.walls++;
}
/** Release: one shrapnel round per 2.4 m along the row except the gap, all flying along the travel direction. */
export function wallFire(e: Enemy): void {
  const R = wallLen / 2;
  dv.set(wallDx, 0, wallDz);
  for (let s = -R; s <= R; s += WALL_STEP) {
    if (s > wallGapA - 0.6 && s < wallGapB + 0.6) continue;
    tv.set(wallOx + wallRx * s, 1.2, wallOz + wallRz * s);
    if (tv.x * tv.x + tv.z * tv.z > (edgeLimit(tv.x, tv.z, 0) + 10) ** 2) continue;
    fireEnemyProjectile(tv, dv, 'BOSS_ORB', WALL_SPEED, pwr(e) * 1.5, { life: 4.4, radius: 1.35 });   // (one round = ~12% of max hp; an idle hero in the row eats two)
  }
  events.emit('shake', { amount: 0.35 });
  void clampArena;
  stat('ShrapnelWall');
}
