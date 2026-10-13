// ============================================================================
// Click / tap target lock. input.ts queues a click (`clickReq`), CameraRig turns it into a ground point
// (it owns the camera) and calls selectAt(). The locked enemy then drives basic attacks and skill auto-target.
// ============================================================================
import { world } from '../world';
import type { Enemy, EnemyKind } from '../types';

/** Locked enemy (pool id or -1). `kind`/`at` guard against the pool slot being recycled by another enemy. */
export const target = { id: -1, kind: '' as EnemyKind | '', boss: false, at: 0 };
/** Pending click in NDC, written by input.ts and consumed by CameraRig. */
export const clickReq = { pending: false, nx: 0, ny: 0 };

export const TARGET_DROP_RANGE = 40;
const PICK_SLACK = 1.2;
const out: number[] = [];

export function clearTarget(): void { target.id = -1; target.kind = ''; target.boss = false; }

/** The locked enemy if it is still valid, else null. */
export function lockedEnemy(): Enemy | null {
  if (target.id < 0) return null;
  const e = world.enemies[target.id];
  if (!e || !e.active || e.state === 'DYING' || e.kind !== target.kind || world.time < target.at) return null;
  return e;
}

/** Per-frame validation: drops the lock when the enemy died / despawned / ran far away. */
export function updateTarget(): void {
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
export function selectAt(x: number, z: number): void {
  const e = pickEnemyAt(x, z);
  if (e) { if (target.id !== e.id) lockEnemy(e); } else clearTarget();
}

/** Queue a click/tap at client coordinates (processed next frame by CameraRig). */
export function requestClick(clientX: number, clientY: number): void {
  clickReq.nx = (clientX / window.innerWidth) * 2 - 1;
  clickReq.ny = -((clientY / window.innerHeight) * 2 - 1);
  clickReq.pending = true;
}
