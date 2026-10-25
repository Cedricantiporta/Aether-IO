// ============================================================================
// Run-room navigation grid (every run room; the monster flow field only in rooms with a river / lake / lava / chasm).
//
// Built ONCE per room by roomgen (after the colliders are installed) from the SAME colliders + outline the hero and the
// monsters collide with: a cell is blocked when it is outside the walkable outline or within CLEAR of any collider
// (liquids are colliders, with gaps where the bridge decks are, so bridges are the only way over water).
// Two consumers, both allocation-free (every buffer is preallocated at module load):
//   * navFindPath  - A* (8 neighbours, no corner cutting) + string pulling, for the hero's AUTO-chase.
//   * navTick / navFlow - ONE Dijkstra flow field from the hero's cell, refreshed ~3x per second; ground monsters sample it
//     when liquid forces a detour (walking distance >> straight distance), instead of running per-monster A*.
// Pure TS, no React.
// ============================================================================
import { world } from './world';
import { queryColliders, edgeLimit, bounds, roomHalls, type Collider } from './mapgen';
import { hallsSdf } from './roomHalls';
import { feat } from './roomFeatures';

const MAX_DIM = 176;
const MAX_N = MAX_DIM * MAX_DIM;
/** Distance a cell centre keeps from a collider (hero push-out is r + 0.5; + half a cell of slack). */
const CLEAR = 1.0;
const FLOW_EVERY = 0.33;

/** water: the room has liquid / halls (monsters use the flow field); else the grid only routes the hero round trees and rocks. */
export const nav = { on: false, water: false, w: 0, cell: 1, x0: 0, z0: 0, featVer: -1, obsVer: -1 };

const blocked = new Uint8Array(MAX_N);
const flow = new Float32Array(MAX_N);
const gA = new Float32Array(MAX_N);
const parA = new Int32Array(MAX_N);
const stampA = new Uint32Array(MAX_N);
const closedA = new Uint32Array(MAX_N);
let gen = 0;
const chain = new Int32Array(MAX_N);
const HEAP_CAP = MAX_N * 6;
const heapK = new Float32Array(HEAP_CAP);
const heapV = new Int32Array(HEAP_CAP);
let heapN = 0;
const cols: Collider[] = [];

/** Waypoints of the last navFindPath (x, z pairs, world units), start excluded, goal included. */
export const navPath = new Float32Array(2 * 512);

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const SQ2 = 1.41421356;

function hpush(k: number, v: number): void {
  if (heapN >= HEAP_CAP) return;
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapK[p] <= k) break;
    heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p;
  }
  heapK[i] = k; heapV[i] = v;
}
function hpop(): number {
  const top = heapV[0];
  heapN--;
  if (heapN > 0) {
    const k = heapK[heapN], v = heapV[heapN];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= heapN) break;
      if (c + 1 < heapN && heapK[c + 1] < heapK[c]) c++;
      if (heapK[c] >= k) break;
      heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c;
    }
    heapK[i] = k; heapV[i] = v;
  }
  return top;
}

/** Is the grid valid for the room that is installed right now? (stale after a camp / arena / town install) */
export function navActive(): boolean {
  return nav.on && bounds.room && nav.featVer === feat.version;   // (obstaclesVersion also moves for town gate changes mid-run: camp / arena builds call disableRoomNav instead)
}

export function disableRoomNav(): void { nav.on = false; }

/** Rasterises the installed room. `extent` = max walkable radius. Call after installRoom + the final feat.version++. */
export function buildRoomNav(extent: number): void {
  nav.on = false;
  const halls = roomHalls();
  if (!bounds.room) return;
  nav.water = halls || (feat.river && !feat.rift) || feat.nLakes > 0;   // (owner 2026-10-25: the hero's auto-walks got stuck on forest trees, so every room gets the grid)
  const half = Math.ceil(extent + 3);
  nav.cell = Math.max(1, (2 * half) / MAX_DIM);
  nav.w = Math.min(MAX_DIM, Math.ceil((2 * half) / nav.cell));
  nav.x0 = -half; nav.z0 = -half;
  const w = nav.w, c = nav.cell;
  for (let cz = 0; cz < w; cz++) for (let cx = 0; cx < w; cx++) {
    const x = nav.x0 + (cx + 0.5) * c, z = nav.z0 + (cz + 0.5) * c;
    let b = 0;
    if (halls ? hallsSdf(x, z) < 1.2 : x * x + z * z > edgeLimit(x, z, 1.5) ** 2) b = 1;
    else {
      const l = queryColliders(x, z, 0.6, cols);
      for (let i = 0; i < l.length; i++) {
        const o = l[i], dx = x - o.x, dz = z - o.z, m = o.r + CLEAR;
        if (dx * dx + dz * dz < m * m) { b = 1; break; }
      }
    }
    blocked[cz * w + cx] = b;
  }
  nav.featVer = feat.version; nav.obsVer = world.obstaclesVersion;
  nav.on = true;
  flowGoal = -1; flowT = 0; flowOk = false;
}

const cellIdx = (x: number, z: number): number => {
  const cx = Math.floor((x - nav.x0) / nav.cell), cz = Math.floor((z - nav.z0) / nav.cell);
  if (cx < 0 || cz < 0 || cx >= nav.w || cz >= nav.w) return -1;
  return cz * nav.w + cx;
};

/** Nearest free cell to (x, z) within `maxR` cells (the cell itself when free); -1 = none. */
function freeCell(x: number, z: number, maxR: number): number {
  const w = nav.w;
  const cx0 = Math.floor((x - nav.x0) / nav.cell), cz0 = Math.floor((z - nav.z0) / nav.cell);
  let best = -1, bd = 1e18;
  for (let r = 0; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = cx0 + dx, cz = cz0 + dz;
      if (cx < 0 || cz < 0 || cx >= w || cz >= w || blocked[cz * w + cx]) continue;
      const ex = nav.x0 + (cx + 0.5) * nav.cell - x, ez = nav.z0 + (cz + 0.5) * nav.cell - z, d = ex * ex + ez * ez;
      if (d < bd) { bd = d; best = cz * w + cx; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Straight segment over free cells only (sampled every ~0.4 cell). */
export function navClear(x0: number, z0: number, x1: number, z1: number): boolean {
  const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.ceil(len / (nav.cell * 0.4)));
  for (let i = 1; i <= n; i++) {
    const t = i / n, ci = cellIdx(x0 + dx * t, z0 + dz * t);
    if (ci < 0 || blocked[ci]) return false;
  }
  return true;
}

function ok(cx: number, cz: number): boolean { return cx >= 0 && cz >= 0 && cx < nav.w && cz < nav.w && !blocked[cz * nav.w + cx]; }

/**
 * A* from (sx, sz) to (gx, gz) (both snapped to the nearest free cell). Writes string-pulled waypoints to `navPath`;
 * returns the waypoint count (0 = no route: caller walks straight).
 */
export function navFindPath(sx: number, sz: number, gx: number, gz: number): number {
  if (!navActive()) return 0;
  const w = nav.w, s = freeCell(sx, sz, 3), g = freeCell(gx, gz, 6);
  if (s < 0 || g < 0) return 0;
  if (s === g) { navPath[0] = gx; navPath[1] = gz; return 1; }
  gen++;
  const gcx = g % w, gcz = (g / w) | 0;
  heapN = 0;
  gA[s] = 0; parA[s] = -1; stampA[s] = gen;
  hpush(0, s);
  let found = false;
  while (heapN > 0) {
    const cur = hpop();
    if (closedA[cur] === gen) continue;
    closedA[cur] = gen;
    if (cur === g) { found = true; break; }
    const cx = cur % w, cz = (cur / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], nz = cz + DZ[k];
      if (!ok(nx, nz)) continue;
      if (k >= 4 && (!ok(cx + DX[k], cz) || !ok(cx, cz + DZ[k]))) continue;   // no corner cutting
      const ni = nz * w + nx;
      if (closedA[ni] === gen) continue;
      const ng = gA[cur] + (k < 4 ? 1 : SQ2);
      if (stampA[ni] === gen && gA[ni] <= ng) continue;
      stampA[ni] = gen; gA[ni] = ng; parA[ni] = cur;
      const ax = Math.abs(nx - gcx), az = Math.abs(nz - gcz);
      hpush(ng + (ax + az) + (SQ2 - 2) * Math.min(ax, az), ni);
    }
  }
  if (!found) return 0;
  // cell chain goal -> start, reversed into chain[0..n)
  let n = 0;
  for (let c = g; c >= 0 && c !== s; c = parA[c]) chain[n++] = c;
  for (let i = 0, j = n - 1; i < j; i++, j--) { const t = chain[i]; chain[i] = chain[j]; chain[j] = t; }
  // string pulling: from the current anchor, jump to the furthest cell centre it can see
  let ax = sx, az = sz, out = 0, i = 0;
  while (i < n && out < 510) {
    let far = i;
    for (let j = n - 1; j > i; j--) {
      const cx = nav.x0 + ((chain[j] % w) + 0.5) * nav.cell, cz = nav.z0 + (((chain[j] / w) | 0) + 0.5) * nav.cell;
      if (navClear(ax, az, cx, cz)) { far = j; break; }
    }
    ax = nav.x0 + ((chain[far] % w) + 0.5) * nav.cell; az = nav.z0 + (((chain[far] / w) | 0) + 0.5) * nav.cell;
    navPath[out * 2] = ax; navPath[out * 2 + 1] = az; out++;
    i = far + 1;
  }
  navPath[out * 2 - 2] = gx; navPath[out * 2 - 1] = gz;   // end exactly on the target
  return out;
}

// ---------------------------------------------------------------- flow field --
let flowGoal = -1, flowT = 0, flowOk = false;

/** Called once per frame (enemies.updateEnemies): refreshes the flow field from the hero's cell ~3x per second. */
export function navTick(dt: number, px: number, pz: number): void {
  if (!navActive()) { flowOk = false; return; }
  flowT -= dt;
  if (flowT > 0) return;
  const g = freeCell(px, pz, 4);
  if (g < 0) return;
  flowT = FLOW_EVERY; flowGoal = g;
  const w = nav.w, n = w * w;
  for (let i = 0; i < n; i++) flow[i] = 1e9;
  heapN = 0;
  flow[g] = 0; hpush(0, g);
  while (heapN > 0) {
    const k = heapK[0], cur = hpop();
    if (k > flow[cur]) continue;
    const cx = cur % w, cz = (cur / w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], nz = cz + DZ[d];
      if (!ok(nx, nz)) continue;
      if (d >= 4 && (!ok(cx + DX[d], cz) || !ok(cx, cz + DZ[d]))) continue;
      const ni = nz * w + nx, nd = k + (d < 4 ? 1 : SQ2);
      if (nd < flow[ni]) { flow[ni] = nd; hpush(nd, ni); }
    }
  }
  flowOk = true;
}

/**
 * Flow-field sample for a ground monster at (x, z): writes the next steering point (three cells downhill) to `out` and returns
 * the WALKING distance to the hero (world units), or -1 when there is no field / the monster is cut off.
 */
export function navFlow(x: number, z: number, out: [number, number]): number {
  if (!flowOk || !navActive()) return -1;
  const w = nav.w;
  let c = cellIdx(x, z);
  if (c < 0) return -1;
  if (blocked[c]) { c = freeCell(x, z, 2); if (c < 0) return -1; }
  const d0 = flow[c];
  if (d0 >= 1e8) return -1;
  let cur = c;
  for (let step = 0; step < 3; step++) {
    const cx = cur % w, cz = (cur / w) | 0;
    let best = cur, bv = flow[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], nz = cz + DZ[d];
      if (!ok(nx, nz)) continue;
      if (d >= 4 && (!ok(cx + DX[d], cz) || !ok(cx, cz + DZ[d]))) continue;
      const v = flow[nz * w + nx];
      if (v < bv) { bv = v; best = nz * w + nx; }
    }
    if (best === cur) break;
    cur = best;
  }
  out[0] = nav.x0 + ((cur % w) + 0.5) * nav.cell;
  out[1] = nav.z0 + (((cur / w) | 0) + 0.5) * nav.cell;
  return d0 * nav.cell;
}

/** Cell the flow field was last computed from (the hero's cell): changes only when the hero walks into a new cell. -1 = no field. */
export const navFlowGoal = (): number => (flowOk && navActive() ? flowGoal : -1);

/**
 * Guide route for the exit arrows (render/Room.tsx PortalGuides): follows the flow field downhill from the goal (a portal) to the hero's cell,
 * string-pulls it, and writes waypoints HERO-FIRST (x, z pairs, the goal last) to `out`. Returns the waypoint count, 0 = no field / no route
 * (the caller then draws a straight trail). Allocation-free; call it only when `navFlowGoal()` changes.
 */
export function navGuide(gx: number, gz: number, out: Float32Array): number {
  if (!flowOk || !navActive()) return 0;
  const w = nav.w;
  const g = freeCell(gx, gz, 6);
  if (g < 0 || flow[g] >= 1e8) return 0;
  let n = 0, cur = g;
  while (n < MAX_N - 1 && flow[cur] > 0) {   // downhill: goal -> hero
    chain[n++] = cur;
    const cx = cur % w, cz = (cur / w) | 0;
    let best = cur, bv = flow[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], nz = cz + DZ[d];
      if (!ok(nx, nz)) continue;
      if (d >= 4 && (!ok(cx + DX[d], cz) || !ok(cx, cz + DZ[d]))) continue;
      const v = flow[nz * w + nx];
      if (v < bv) { bv = v; best = nz * w + nx; }
    }
    if (best === cur) break;
    cur = best;
  }
  chain[n++] = cur;
  // chain[0] = goal ... chain[n-1] = hero cell: reverse to hero-first, then string-pull (lookahead window 48 cells)
  for (let i = 0, j = n - 1; i < j; i++, j--) { const t = chain[i]; chain[i] = chain[j]; chain[j] = t; }
  const cap = out.length >> 1;
  let o = 0, i = 0;
  const px = (c: number): number => nav.x0 + ((c % w) + 0.5) * nav.cell, pz = (c: number): number => nav.z0 + (((c / w) | 0) + 0.5) * nav.cell;
  let ax = px(chain[0]), az = pz(chain[0]);
  out[o * 2] = ax; out[o * 2 + 1] = az; o++;
  while (i < n - 1 && o < cap - 1) {
    let far = i + 1;
    for (let j = Math.min(n - 1, i + 48); j > i + 1; j--) if (navClear(ax, az, px(chain[j]), pz(chain[j]))) { far = j; break; }
    ax = px(chain[far]); az = pz(chain[far]);
    out[o * 2] = ax; out[o * 2 + 1] = az; o++;
    i = far;
  }
  out[(o - 1) * 2] = gx; out[(o - 1) * 2 + 1] = gz;
  return o;
}
