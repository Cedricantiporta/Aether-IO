// Co-op STEP 4: pulls and pushes on the PARTNER. The guest simulates his own hero, so a gravity well / black hole / obelisk / wind on the host's side cannot move him
// directly: the host's stand-in is displaced instead (engine/heroes.shoveHero -> coopRoom.fwdPull), the displacements are summed for ~100 ms and sent as one PULL
// [dx, dz, span]; the guest turns it into a velocity and moves his own hero for that span (collision-free but kept inside the room), like the host does for himself.
// No allocation per frame (two accumulators + two velocity floats).
import { world } from '../engine/world';
import { edgeLimit } from '../engine/mapgen';
import { coopRoom } from './coopRoom';
import { MSG, isNum } from './protocol';

export interface PullIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: PullIO | null = null;
export function pullBind(h: PullIO): void { io = h; }
export const pullStats = { sent: 0, got: 0 };

const FLUSH_MS = 100;
let accX = 0, accZ = 0, lastFlush = 0;
let vx = 0, vz = 0, left = 0, lastStep = 0;

/** HOST: sum a displacement of the partner's stand-in. */
coopRoom.fwdPull = (dx, dz) => { if (coopRoom.two) { accX += dx; accZ += dz; } };

/** HOST, every frame (coopTick): ship the summed pull every ~100 ms (a single PULL message, nothing when idle). */
export function pullTick(now: number): void {
  if (accX === 0 && accZ === 0) { lastFlush = now; return; }
  if (now - lastFlush < FLUSH_MS) return;
  const span = Math.min(0.3, (now - lastFlush) / 1000);
  lastFlush = now;
  const x = Math.max(-6, Math.min(6, accX)), z = Math.max(-6, Math.min(6, accZ));
  accX = accZ = 0;
  if (!io || !io.connected() || Math.hypot(x, z) < 0.005) return;
  pullStats.sent++;
  io.send([MSG.PULL, io.rv(), Math.round(x * 1000), Math.round(z * 1000), Math.round(span * 1000)]);
}
export function pullReset(): void { accX = accZ = 0; vx = vz = left = 0; lastFlush = 0; }

/** GUEST: a PULL arrived: move my own hero by (dx, dz) spread over `span` seconds. */
export function onPull(d: unknown[]): void {
  if (!coopRoom.guest || !isNum(d[2]) || !isNum(d[3]) || !isNum(d[4])) return;
  const span = Math.max(0.03, Math.min(0.3, d[4] / 1000));
  // (a newer pull replaces the velocity; the leftover of the older one is added so a long drag stays smooth)
  vx = (d[2] / 1000) / span; vz = (d[3] / 1000) / span; left = span + 0.04;
  pullStats.got++;
}

/** GUEST, every frame (coopTick): apply the current pull velocity to my hero. */
export function pullStep(now: number): void {
  const dt = lastStep ? Math.min(0.1, (now - lastStep) / 1000) : 0; lastStep = now;
  if (left <= 0 || dt <= 0) return;
  const p = world.player;
  if (!p.alive || p.downed) { left = 0; return; }
  left -= dt;
  p.pos.x += vx * dt; p.pos.z += vz * dt;
  const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
  if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
}
