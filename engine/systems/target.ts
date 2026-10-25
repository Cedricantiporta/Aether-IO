// ============================================================================
// Click / tap target lock. input.ts queues a click (`clickReq`), CameraRig turns it into a ground point
// (it owns the camera) and calls selectAt(). The locked enemy then drives basic attacks and skill auto-target.
// ============================================================================
import { world } from '../world';
import type { Enemy, EnemyKind } from '../types';
import { pickTrapAt, trapLock, type TrapObj } from './roomTraps';
import { isHarvestNode } from '../mapgen';

/** Locked enemy (pool id or -1). `kind`/`at` guard against the pool slot being recycled by another enemy. */
export const target = { id: -1, kind: '' as EnemyKind | '', boss: false, at: 0 };
/** Pending click in NDC, written by input.ts and consumed by CameraRig. */
export const clickReq = { pending: false, nx: 0, ny: 0 };
/** Last ground click for the click marker (render/ClickMarker): t = performance.now() ms, attack = clicked an enemy. */
export const clickMark = { x: 0, z: 0, t: -1e9, attack: false };

export const TARGET_DROP_RANGE = 40;
/** (owner 2026-10-25) The red "lost" trail's goal (render/EnemyGuide writes it): the PATH auto-walk follows it too. */
export const lostGuide = { on: false, x: 0, z: 0 };
/** (owner 2026-10-25) whoever just hurt the hero: the hero hits it back while not fighting anything else (player.ts). */
export const retaliate = { id: -1, kind: '' as EnemyKind | '', until: 0 };
export function noteAttacker(e: Enemy): void { retaliate.id = e.id; retaliate.kind = e.kind; retaliate.until = world.time + 4; }
/** The enemy to hit back at, if any (alive, recent). */
export function retaliateEnemy(): Enemy | null {
  if (retaliate.id < 0 || world.time > retaliate.until) return null;
  const e = world.enemies[retaliate.id];
  if (!e || !e.active || e.state === 'DYING' || e.kind !== retaliate.kind || e.decoy) return null;
  return e;
}
const PICK_SLACK = 1.2;
const out: number[] = [];

export function clearTarget(): void { target.id = -1; target.kind = ''; target.boss = false; trapLock.obj = null; crateLock.id = -1; }
/** (owner 2026-10-25) A clicked barrel / crate / pot (anything breakable that is not a harvest node) becomes the lock through a
 *  stand-in TrapObj, so aiming, the AUTO bot and the target ring treat it like a clicked stationary; real hits break the crate. */
export const crateLock = { id: -1 };
const crateProxy: TrapObj = { x: 0, z: 0, rad: 0.7, hp: 1, maxHp: 1, dead: true, col: null, flash: 0, hitSeq: 0, proxy: true };
function pickCrateAt(x: number, z: number): number {
  let best = -1, bd = 1.7 * 1.7;
  const cs = world.crates;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.active || isHarvestNode(c.kind)) continue;
    const d = (c.pos.x - x) ** 2 + (c.pos.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** The locked enemy if it is still valid, else null. */
export function lockedEnemy(): Enemy | null {
  if (target.id < 0) return null;
  const e = world.enemies[target.id];
  if (!e || !e.active || e.state === 'DYING' || e.kind !== target.kind || world.time < target.at) return null;
  return e;
}

/** Per-frame validation: drops the lock when the enemy died / despawned / ran far away. */
export function updateTarget(): void {
  if (crateLock.id >= 0) {   // the clicked crate: follow it, drop the lock once it breaks
    const c = world.crates[crateLock.id];
    if (!c || !c.active || trapLock.obj !== crateProxy) { crateProxy.dead = true; if (trapLock.obj === crateProxy) trapLock.obj = null; crateLock.id = -1; }
    else { crateProxy.x = c.pos.x; crateProxy.z = c.pos.z; }
  }
  if (target.id < 0) return;
  const e = lockedEnemy(), p = world.player;
  if (!e || (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2 > TARGET_DROP_RANGE * TARGET_DROP_RANGE) clearTarget();
}

/** Nearest hittable enemy to a ground point (within its radius + slack), or null. */
export function pickEnemyAt(x: number, z: number): Enemy | null {
  const ids = world.enemyGrid.query(x, z, 6, out);
  let best: Enemy | null = null, bestD = 1e9;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const d = Math.hypot(e.pos.x - x, e.pos.z - z) - e.radius;
    if (d < PICK_SLACK && d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function lockEnemy(e: Enemy): void { target.id = e.id; target.kind = e.kind; target.boss = e.boss; target.at = world.time; }

/** Click at a ground point: lock the enemy there, or clear the lock on empty ground. */
/** (owner setting) left-click walk target in runs: the hero heads there until it arrives or any movement key is pressed. */
export const clickMoveTo = { on: false, x: 0, z: 0 };
/** Returns true when something (monster, stationary, barrel) was locked. */
export function selectAt(x: number, z: number): boolean {
  const e = pickEnemyAt(x, z);
  if (e) { trapLock.obj = null; crateLock.id = -1; if (target.id !== e.id) lockEnemy(e); return true; }
  // (owner) no monster there: a siege weapon / tower / statue under the click becomes the lock, else a barrel / crate
  const t = pickTrapAt(x, z);
  clearTarget();
  if (t) { trapLock.obj = t; return true; }
  const ci = pickCrateAt(x, z);
  if (ci < 0) return false;
  const c = world.crates[ci];
  crateLock.id = ci; crateProxy.x = c.pos.x; crateProxy.z = c.pos.z; crateProxy.dead = false; trapLock.obj = crateProxy;
  return true;
}

/** Queue a click/tap at client coordinates (processed next frame by CameraRig). */
export function requestClick(clientX: number, clientY: number): void {
  clickReq.nx = (clientX / window.innerWidth) * 2 - 1;
  clickReq.ny = -((clientY / window.innerHeight) * 2 - 1);
  clickReq.pending = true;
}
