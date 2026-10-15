// ============================================================================
// Town / castle path finding for click-to-walk, quest auto-path and the guide arrow.
// A walkability bitmap (0.5-unit cells) is rasterised from the SAME colliders + island edge the hero collides with
// (mapgen.queryColliders / edgeLimit / active harvest nodes), cached per area + map version, then A* (8 neighbours, no
// corner cutting) finds the shortest walkable route to any cell within `reach` of the target ("stop at talking
// distance"), and string-pulling shortens it to a few straight legs. All buffers are preallocated (no per-search
// allocation). Pure TS, no React.
// ============================================================================
import { world } from '../world';
import { queryColliders, edgeLimit, bounds, CRATE_RADIUS, type Collider } from '../mapgen';

const CELL = 0.5;
/** Hero centre clearance: the hero is pushed to collider r + 0.5, keep a little extra so routes never graze a corner. */
const CLEAR = 0.78;
/** Grid box per area (town: the whole island incl. the outer ring, farm, tower nook, portal road and the cave bay). */
const BOX = { TOWN: [-90, -64, 84, 134], OTHER: [-64, -64, 64, 64] } as const;   // (town: incl. the mainland, the portal and the tower clearing)
const MAX_W = Math.ceil((BOX.OTHER[2] - BOX.OTHER[0]) / CELL), MAX_H = Math.ceil((BOX.TOWN[3] - BOX.TOWN[1]) / CELL);
const MAX_N = Math.max(MAX_W, Math.ceil((BOX.TOWN[2] - BOX.TOWN[0]) / CELL)) * MAX_H;

const walk = new Uint8Array(MAX_N);           // 1 = walkable
const gCost = new Float32Array(MAX_N);
const parent = new Int32Array(MAX_N);
const stamp = new Uint32Array(MAX_N);         // search generation that touched the cell (no clearing between searches)
const closed = new Uint32Array(MAX_N);
const heap = new Int32Array(MAX_N), heapF = new Float32Array(MAX_N);
let gen = 1, heapN = 0;
let ox = 0, oz = 0, W = 0, H = 0, key = '';
const cols: Collider[] = [];

const cx = (x: number): number => Math.floor((x - ox) / CELL);
const cz = (z: number): number => Math.floor((z - oz) / CELL);
const inGrid = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < W && j < H;

/** (Re)builds the walkability bitmap when the area or the map changed. */
function ensureGrid(): void {
  const v = world.village, k = `${v.area}:${v.areaVer}:${world.obstaclesVersion}`;
  if (k === key) return;
  key = k;
  const b = v.area === 'TOWN' ? BOX.TOWN : BOX.OTHER;
  ox = b[0]; oz = b[1]; W = Math.ceil((b[2] - b[0]) / CELL); H = Math.ceil((b[3] - b[1]) / CELL);
  const n = W * H;
  walk.fill(1, 0, n);
  // island edge (town only; the castle interior's walls are colliders and its edge clamp is off)
  if (!bounds.room && bounds.checkR2 < 1e11) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = ox + (i + 0.5) * CELL, z = oz + (j + 0.5) * CELL, r2 = x * x + z * z;
      if (r2 <= bounds.checkR2) continue;
      const lim = edgeLimit(x, z, 2) - 0.3;
      if (lim <= 0 || r2 > lim * lim) walk[j * W + i] = 0;
    }
  }
  // every collider (buildings, walls, fences, trees, props), deduplicated from the coarse collider grid
  const hw = (b[2] - b[0]) / 2, hh = (b[3] - b[1]) / 2;
  queryColliders(b[0] + hw, b[1] + hh, Math.max(hw, hh), cols);
  const seen = new Set<Collider>();
  for (const c of cols) { if (seen.has(c)) continue; seen.add(c); stampCircle(c.x, c.z, c.r + CLEAR); }
  for (const c of world.crates) { const r = CRATE_RADIUS[c.kind]; if (c.active && r > 0) stampCircle(c.pos.x, c.pos.z, r + CLEAR); }
}
function stampCircle(x: number, z: number, r: number): void {
  const i0 = Math.max(0, cx(x - r)), i1 = Math.min(W - 1, cx(x + r)), j0 = Math.max(0, cz(z - r)), j1 = Math.min(H - 1, cz(z + r)), r2 = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = ox + (i + 0.5) * CELL - x, pz = oz + (j + 0.5) * CELL - z;
    if (px * px + pz * pz < r2) walk[j * W + i] = 0;
  }
}
/** Forces the bitmap to rebuild on the next query (e.g. after colliders were added outside a map rebuild). */
export function invalidatePathGrid(): void { key = ''; }

/** Walkable for the hero (with clearance). */
export function walkableAt(x: number, z: number): boolean {
  ensureGrid();
  const i = cx(x), j = cz(z);
  return inGrid(i, j) && walk[j * W + i] === 1;
}
/** True when a straight walk from a to b stays on walkable cells (sampled every quarter unit). */
export function lineClear(ax: number, az: number, bx: number, bz: number): boolean {
  ensureGrid();
  const dx = bx - ax, dz = bz - az, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.5)));
  for (let k = 0; k <= n; k++) {
    const i = cx(ax + (dx * k) / n), j = cz(az + (dz * k) / n);
    if (!inGrid(i, j) || walk[j * W + i] === 0) return false;
  }
  return true;
}

/** lineClear that ignores samples within `skip` units of the start. */
function los(ax: number, az: number, bx: number, bz: number, skip: number): boolean {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / (CELL * 0.5)));
  for (let k = 0; k <= n; k++) {
    if ((L * k) / n < skip) continue;
    const i = cx(ax + (dx * k) / n), j = cz(az + (dz * k) / n);
    if (!inGrid(i, j) || walk[j * W + i] === 0) return false;
  }
  return true;
}
function heapPush(node: number, f: number): void {
  let i = heapN++;
  while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heap[i] = heap[p]; heapF[i] = heapF[p]; i = p; }
  heap[i] = node; heapF[i] = f;
}
function heapPop(): number {
  const top = heap[0], last = heap[--heapN], lf = heapF[heapN];
  let i = 0;
  for (;;) {
    let c = i * 2 + 1; if (c >= heapN) break;
    if (c + 1 < heapN && heapF[c + 1] < heapF[c]) c++;
    if (heapF[c] >= lf) break;
    heap[i] = heap[c]; heapF[i] = heapF[c]; i = c;
  }
  heap[i] = last; heapF[i] = lf;
  return top;
}
/** Nearest walkable cell to (x, z) within `maxR` units (ring search), or -1. */
function nearestWalkable(x: number, z: number, maxR: number): number {
  const i0 = cx(x), j0 = cz(z);
  if (inGrid(i0, j0) && walk[j0 * W + i0]) return j0 * W + i0;
  const R = Math.ceil(maxR / CELL);
  let best = -1, bd = 1e9;
  for (let r = 1; r <= R && best < 0; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (!inGrid(i, j) || !walk[j * W + i]) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = j * W + i; }
    }
  }
  return best;
}

const SQ2 = Math.SQRT2;
const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const raw = new Int32Array(4096);
/**
 * Shortest walkable route from (fx, fz) to any point within `reach` of (tx, tz). Writes the waypoints (start excluded,
 * last = the arrival point) as x, z pairs into `out` (at most out.length / 2 points) and returns their count; 0 when there
 * is no route (or the target is already within reach of the start). `-1` when the start / target lie outside the grid.
 */
export function findPath(fx: number, fz: number, tx: number, tz: number, reach: number, out: Float32Array): number {
  ensureGrid();
  const s = nearestWalkable(fx, fz, 3);
  if (s < 0) return -1;
  const R = Math.max(CELL * 0.75, reach), R2 = R * R;
  const tiC = (tx - ox) / CELL - 0.5, tjC = (tz - oz) / CELL - 0.5, Rc = R / CELL;
  gen++;
  if (gen > 0xfffffff0) { gen = 1; stamp.fill(0); closed.fill(0); }
  heapN = 0;
  stamp[s] = gen; gCost[s] = 0; parent[s] = -1;
  const h = (n: number): number => { const di = (n % W) - tiC, dj = ((n / W) | 0) - tjC; return Math.max(0, Math.hypot(di, dj) - Rc) * 1.05; };
  heapPush(s, h(s));
  let goal = -1, iter = 0;
  while (heapN > 0 && iter++ < 120000) {
    const c = heapPop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    const ci = c % W, cj = (c / W) | 0;
    const px = ox + (ci + 0.5) * CELL - tx, pz = oz + (cj + 0.5) * CELL - tz;
    if (px * px + pz * pz <= R2) { goal = c; break; }
    for (let k = 0; k < 8; k++) {
      const ni = ci + DI[k], nj = cj + DJ[k];
      if (!inGrid(ni, nj)) continue;
      const nn = nj * W + ni;
      if (!walk[nn] || closed[nn] === gen) continue;
      if (k >= 4 && (!walk[cj * W + ni] || !walk[nj * W + ci])) continue;   // no corner cutting
      const g = gCost[c] + (k >= 4 ? SQ2 : 1);
      if (stamp[nn] === gen && gCost[nn] <= g) continue;
      stamp[nn] = gen; gCost[nn] = g; parent[nn] = c;
      heapPush(nn, g + h(nn));
    }
  }
  if (goal < 0) return 0;
  // cell chain goal -> start, reversed into raw[]
  let len = 0;
  for (let c = goal; c >= 0 && len < raw.length; c = parent[c]) raw[len++] = c;
  for (let a = 0, b = len - 1; a < b; a++, b--) { const t = raw[a]; raw[a] = raw[b]; raw[b] = t; }
  // the exact arrival point: the target itself when it is walkable and within reach of the goal cell, else the goal cell
  const gx = ox + ((goal % W) + 0.5) * CELL, gz = oz + (((goal / W) | 0) + 0.5) * CELL;
  const endX = reach <= CELL && walkableAt(tx, tz) ? tx : gx, endZ = reach <= CELL && walkableAt(tx, tz) ? tz : gz;
  // string pulling: walk the cell chain, keep extending the current straight leg while it stays clear (the first metre
  // around the hero is ignored: standing flush against a wall puts the hero's own cell inside the clearance band)
  const max = out.length >> 1;
  let n = 0, ax = fx, az = fz, skip = 1, last = -1;
  for (let m = 0; m < len && n < max - 1; m++) {
    const mx = ox + ((raw[m] % W) + 0.5) * CELL, mz = oz + (((raw[m] / W) | 0) + 0.5) * CELL;
    if (los(ax, az, mx, mz, skip)) { last = m; continue; }
    if (last < 0) { last = m; continue; }
    ax = ox + ((raw[last] % W) + 0.5) * CELL; az = oz + (((raw[last] / W) | 0) + 0.5) * CELL; skip = 0;
    out[n * 2] = ax; out[n * 2 + 1] = az; n++;
    last = m;
  }
  out[n * 2] = endX; out[n * 2 + 1] = endZ; n++;
  return n;
}

// ---- route hint for the guide arrow: a cached route to the current target; the arrow points at the farthest waypoint
// still in straight sight, so it leads around walls / fences instead of straight at the target. Re-planned only when
// the target moves, the hero strays from the route or the map changed (cheap enough to call 4x a second).
const hintWp = new Float32Array(64);
let hintN = -2, hintI = 0, hintTx = 1e9, hintTz = 1e9, hintKey = '', hintAge = 0;
export const routeHint = { x: 0, z: 0, len: 0, ok: false };
export function updateRouteHint(fx: number, fz: number, tx: number, tz: number, reach: number, dt: number): typeof routeHint {
  ensureGrid();
  hintAge += dt;
  let replan = key !== hintKey || (tx - hintTx) ** 2 + (tz - hintTz) ** 2 > 2.25 || hintAge > (hintN > 0 ? 4 : 2);
  if (!replan && hintI < hintN && !los(fx, fz, hintWp[hintI * 2], hintWp[hintI * 2 + 1], 1)) replan = true;   // strayed off the route
  if (replan) {
    hintKey = key; hintTx = tx; hintTz = tz; hintAge = 0; hintI = 0;
    hintN = findPath(fx, fz, tx, tz, reach, hintWp);
  }
  if (hintN <= 0) { routeHint.ok = false; routeHint.x = tx; routeHint.z = tz; routeHint.len = Math.hypot(tx - fx, tz - fz); return routeHint; }
  while (hintI < hintN - 1 && los(fx, fz, hintWp[hintI * 2 + 2], hintWp[hintI * 2 + 3], 1)) hintI++;   // skip legs already cut short
  routeHint.ok = true; routeHint.x = hintWp[hintI * 2]; routeHint.z = hintWp[hintI * 2 + 1];
  let len = Math.hypot(routeHint.x - fx, routeHint.z - fz);
  for (let k = hintI + 1; k < hintN; k++) len += Math.hypot(hintWp[k * 2] - hintWp[k * 2 - 2], hintWp[k * 2 + 1] - hintWp[k * 2 - 1]);
  routeHint.len = len;
  return routeHint;
}

/** Length of a route (from the start through `n` waypoints of `wp`). */
export function routeLength(fx: number, fz: number, wp: Float32Array, n: number): number {
  let len = 0, px = fx, pz = fz;
  for (let k = 0; k < n; k++) { len += Math.hypot(wp[k * 2] - px, wp[k * 2 + 1] - pz); px = wp[k * 2]; pz = wp[k * 2 + 1]; }
  return len;
}
