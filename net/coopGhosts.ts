// Co-op: the partner's hero projectiles as harmless "ghost" copies. Each side periodically sends its OWN hero's live projectiles
// (arrows, fireballs, axes, bone spears ...); the other side draws them with the normal instanced renderer (`Projectile.ghost`:
// moved by their velocity, no hits, no pooling of their own - engine/systems/projectiles.ts). Used by both the host and the guest.
import { world, allocProjectile, MAX_PROJECTILES } from '../engine/world';
import { PROJ_KINDS } from './protocol';
import { u16ToB64, b64ToU16 } from './coopWire';

const U = new Uint16Array(8192), IN = new Uint16Array(8192);
const kindIdx: Record<string, number> = {}; PROJ_KINDS.forEach((k, i) => { kindIdx[k] = i; });
const gmap = new Int16Array(MAX_PROJECTILES).fill(-1);   // partner slot -> my slot
const gstamp = new Uint16Array(MAX_PROJECTILES);
let stamp = 0;
const q16 = (v: number): number => (v < 0 ? 0 : v > 65535 ? 65535 : Math.round(v));

export function ghostReset(): void {
  gmap.fill(-1);
  const pool = world.projectiles;
  for (let i = 0; i < pool.length; i++) if (pool[i].ghost) { pool[i].active = false; pool[i].ghost = false; }
}

/** My own live projectiles (not ghosts) as base64 records; null when there are none (an empty message is sent once so the partner clears). */
let hadAny = false;
export function packGhosts(): string | null {
  const pool = world.projectiles;
  let n = 1, c = 0;
  for (let i = 0; i < pool.length && n < 8100; i++) {
    const p = pool[i];
    if (!p.active || p.ghost) continue;
    const k = kindIdx[p.kind]; if (k === undefined) continue;
    U[n++] = (i & 1023) | (k << 10) | ((p.state & 1) << 15);
    U[n++] = q16((p.pos.x + 300) * 100); U[n++] = q16((p.pos.z + 300) * 100); U[n++] = q16((p.pos.y + 20) * 1000);
    U[n++] = q16(p.vel.x * 50 + 32768); U[n++] = q16(p.vel.z * 50 + 32768);
    U[n++] = q16(p.radius * 10000);
    // (pet shots: the aoe bits carry the pet element instead - the ghost has no splash - so the partner sees the Phoenix fireball / Dragon flame / Wisp light / Leviathan water look)
    const petEl = p.kind === 'PET_BOLT' && p.tint > 20 && p.tint < 40 ? p.tint - 20 : 0;
    U[n++] = (p.tint & 3) | (p.emp ? 4 : 0) | ((p.kind === 'PET_BOLT' ? petEl : q16(Math.min(800, p.aoeRadius * 10))) << 3);
    c++;
  }
  if (c === 0 && !hadAny) return null;
  hadAny = c > 0;
  U[0] = c;
  return u16ToB64(U, n);
}

/** The partner's projectile records arrived: create / move the ghosts, remove the ones he no longer has. */
export function applyGhosts(b64: string): void {
  const n = b64ToU16(b64, IN);
  if (n < 1) return;
  const c = IN[0];
  if (1 + c * 8 > n) return;
  stamp = (stamp + 1) & 0xffff || 1;
  const pool = world.projectiles;
  for (let r = 0, o = 1; r < c; r++, o += 8) {
    const w0 = IN[o], id = w0 & 1023, k = (w0 >> 10) & 31;
    if (id >= MAX_PROJECTILES || k >= PROJ_KINDS.length) continue;
    let p = gmap[id] >= 0 ? pool[gmap[id]] : null;
    if (!p || !p.active || !p.ghost) {
      p = allocProjectile();
      if (!p) continue;
      gmap[id] = p.id;
      p.active = true; p.ghost = true; p.hitIds.length = 0;
      p.damage = 0; p.pierce = 0; p.spin = 0; p.homing = 0; p.maxLife = 1;
    }
    gstamp[id] = stamp;
    p.kind = PROJ_KINDS[k]; p.state = (w0 >> 15) & 1;
    p.pos.set(IN[o + 1] / 100 - 300, IN[o + 3] / 1000 - 20, IN[o + 2] / 100 - 300);
    p.vel.set((IN[o + 4] - 32768) / 50, 0, (IN[o + 5] - 32768) / 50);
    p.radius = IN[o + 6] / 10000;
    const x = IN[o + 7]; p.tint = x & 3; p.emp = (x & 4) !== 0; p.aoeRadius = (x >> 3) / 10;
    if (p.kind === 'PET_BOLT') { const el = x >> 3; p.tint = el > 0 && el < 20 ? 20 + el : 0; p.aoeRadius = 0; }
    p.life = 0.6;   // dies by itself if the partner stops refreshing it
  }
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const m = gmap[i];
    if (m < 0 || gstamp[i] === stamp) continue;
    gmap[i] = -1;
    const p = pool[m];
    if (p.ghost) { p.active = false; p.ghost = false; }
  }
}
