// ============================================================================
// HALLS room layouts (Hades-style chambers joined by corridors). Unlike the star-convex outlines of roomShape.ts, a halls
// room is a WALKABLE MASK: a 0.5 m grid (open / wall) built from a union of axis-aligned rectangles minus interior wall
// rectangles, plus an exact signed distance field (sdf > 0 = metres inside the open floor, < 0 = metres inside the wall).
// Everything that clamps or collides asks the mask: hallsPush (slide along walls), hallsSegClear (line of sight / projectile
// paths), hallsSdf (placement margins). Corridors are 4.4-5.6 m wide, long ones 12-20 m, some L / Z shaped; chambers are
// 20-32 m. Pure TS (no three / no render imports); all buffers preallocated; deterministic per seed.
// ============================================================================

export type HallsVariant = 'TWIN' | 'TRIPLE' | 'DUNGEON' | 'HALL' | 'LHALL';
export type Rect4 = [number, number, number, number];   // x0, z0, x1, z1 (x0 < x1, z0 < z1)

export const HC = 0.5;                 // cell size (m)
const MAX_W = 340;                     // grid cells per side (170 m)
const PAD = 12;                        // blocked border (cells)
const MAXN = MAX_W * MAX_W;

export const halls = {
  on: false, version: 0, variant: 'TWIN' as HallsVariant,
  w: 0, h: 0, x0: 0, z0: 0,
  open: new Uint8Array(MAXN),
  sdf: new Float32Array(MAXN),
  /** chambers (open rooms; for placement, minimap), corridors, interior walls: world coordinates, origin = hub centre. */
  chambers: [] as Rect4[], corridors: [] as Rect4[], walls: [] as Rect4[],
  /** arrival, station, exit centre, exit direction (unit axis), overall start->exit direction. */
  sx: 0, sz: 0, stx: 0, stz: 0, ex: 0, ez: 0, dx: 0, dz: -1, fx: 0, fz: -1,
  /** points that must stay clear of props (corridor mouths): x, z, r triples. */
  keep: [] as [number, number, number][],
  area: 0, extent: 0,
  /** half width of the exit chamber (the portal slots spread within it) */
  exitHalf: 10,
};

const edt = new Float32Array(MAXN);
const tmpF = new Float32Array(MAX_W + 1);
const tmpV = new Int32Array(MAX_W + 1);
const tmpZ = new Float32Array(MAX_W + 2);
const tmpD = new Float32Array(MAX_W + 1);
const INF = 1e9;

/** Felzenszwalb squared Euclidean distance transform of the grid in `edt` (0 where f = 0, INF elsewhere), in cells^2. */
function edt2d(w: number, h: number): void {
  for (let x = 0; x < w; x++) {   // columns
    for (let y = 0; y < h; y++) tmpF[y] = edt[y * w + x];
    pass1d(h);
    for (let y = 0; y < h; y++) edt[y * w + x] = tmpD[y];
  }
  for (let y = 0; y < h; y++) {   // rows
    for (let x = 0; x < w; x++) tmpF[x] = edt[y * w + x];
    pass1d(w);
    for (let x = 0; x < w; x++) edt[y * w + x] = tmpD[x];
  }
}
function pass1d(n: number): void {
  let k = 0;
  tmpV[0] = 0; tmpZ[0] = -INF; tmpZ[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const v = tmpV[k];
      s = ((tmpF[q] + q * q) - (tmpF[v] + v * v)) / (2 * q - 2 * v);
      if (s <= tmpZ[k]) k--; else break;
    }
    k++; tmpV[k] = q; tmpZ[k] = s; tmpZ[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (tmpZ[k + 1] < q) k++;
    const v = tmpV[k];
    tmpD[q] = (q - v) * (q - v) + tmpF[v];
  }
}

// ------------------------------------------------------------------ queries ---
/** Signed distance to the nearest wall face in metres (bilinear): > 0 open floor, < 0 inside a wall, very negative outside the grid. */
export function hallsSdf(x: number, z: number): number {
  const gx = (x - halls.x0) / HC - 0.5, gz = (z - halls.z0) / HC - 0.5;
  const w = halls.w, h = halls.h;
  if (gx < 0 || gz < 0 || gx >= w - 1 || gz >= h - 1) {
    const ox = gx < 0 ? -gx : gx > w - 1 ? gx - (w - 1) : 0, oz = gz < 0 ? -gz : gz > h - 1 ? gz - (h - 1) : 0;
    return -6 - Math.sqrt(ox * ox + oz * oz) * HC;
  }
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, S = halls.sdf, k = j * w + i;
  return (S[k] * (1 - fx) + S[k + 1] * fx) * (1 - fz) + (S[k + w] * (1 - fx) + S[k + w + 1] * fx) * fz;
}

/** Is (x, z) inside a wall (or outside the layout)? */
export function hallsWall(x: number, z: number): boolean { return hallsSdf(x, z) < 0.05; }

/** Pushes (x, z) until it is at least `m` metres inside the open floor (slides along walls; rounded corners). Returns true when it moved. */
export function hallsPush(p: { x: number; z: number }, m: number): boolean {
  let moved = false;
  for (let it = 0; it < 4; it++) {
    const d = hallsSdf(p.x, p.z);
    if (d >= m) return moved;
    const e = 0.3;
    let gx = hallsSdf(p.x + e, p.z) - hallsSdf(p.x - e, p.z), gz = hallsSdf(p.x, p.z + e) - hallsSdf(p.x, p.z - e);
    let l = Math.sqrt(gx * gx + gz * gz);
    if (l < 1e-3) { gx = -p.x; gz = -p.z; l = Math.sqrt(gx * gx + gz * gz) || 1; }
    const k = Math.min(m - d + 0.01, 2.5) / l;
    p.x += gx * k; p.z += gz * k;
    moved = true;
  }
  return moved;
}

/** Straight segment over open floor (at least `m` from every wall), sampled every 0.4 m. */
export function hallsSegClear(x0: number, z0: number, x1: number, z1: number, m = 0.2): boolean {
  const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.ceil(len / 0.4));
  for (let i = 0; i <= n; i++) { const t = i / n; if (hallsSdf(x0 + dx * t, z0 + dz * t) < m) return false; }
  return true;
}

/** Walks from (fx, fz) toward (x, z) and stops at the last open sample (>= m from walls); writes the result to `out`. */
export function hallsRayStop(fx: number, fz: number, x: number, z: number, m: number, out: { x: number; z: number }): void {
  const dx = x - fx, dz = z - fz, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.ceil(len / 0.4));
  let lx = fx, lz = fz;
  for (let i = 1; i <= n; i++) {
    const t = i / n, px = fx + dx * t, pz = fz + dz * t;
    if (hallsSdf(px, pz) < m) break;
    lx = px; lz = pz;
  }
  out.x = lx; out.z = lz;
}

// ------------------------------------------------------------------ layouts ---
const q2 = (v: number): number => Math.round(v * 2) / 2;
type Pt = [number, number];
interface Local { open: Rect4[]; chambers: Rect4[]; corridors: Rect4[]; walls: Rect4[]; start: Pt; exit: Pt; dir: Pt; hub: Pt; keep: [number, number, number][]; half: number }

const rectDist = (a: Rect4, b: Rect4): number => {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dz = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.sqrt(dx * dx + dz * dz);
};
/** A corridor rect running along (ux, uz) from `a` to `b` (coords along the run), centred on `lat`, width cw. */
function runRect(ux: number, a: number, b: number, lat: number, cw: number): Rect4 {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return ux !== 0 ? [lo, lat - cw / 2, hi, lat + cw / 2] : [lat - cw / 2, lo, lat + cw / 2, hi];
}

/** Chain of chambers joined by straight / Z / L corridors (journey starts along +x). Returns null when parts collide. */
function chain(rnd: () => number, n: number, sz: number, forceStraight: boolean): Local | null {
  const R = (a: number, b: number): number => q2(a + rnd() * (b - a));
  const cs: { cx: number; cz: number; w: number; h: number }[] = [];
  const parts: Rect4[] = [];          // every rect in order (for the spacing test)
  const partGroup: number[] = [];     // chamber index (chambers: 2i, links: 2i+1)
  const corridors: Rect4[] = [];
  const dim = (wr: [number, number], hr: [number, number]): { w: number; h: number } => ({ w: R(wr[0] * sz, wr[1] * sz), h: R(hr[0] * sz, hr[1] * sz) });
  const d0 = n === 2 ? dim([26, 32], [22, 28]) : n === 3 ? dim([20, 25], [18, 23]) : dim([15, 21], [14, 20]);
  let cur = { cx: 0, cz: 0, w: d0.w, h: d0.h };
  cs.push(cur); parts.push([cur.cx - cur.w / 2, cur.cz - cur.h / 2, cur.cx + cur.w / 2, cur.cz + cur.h / 2]); partGroup.push(0);
  let dx = 1, dz = 0;   // current journey direction (unit axis)
  const keep: [number, number, number][] = [];
  for (let i = 1; i < n; i++) {
    const cw = R(4.5, 5.5), lk = n === 4 ? 0.62 : 1;   // (dungeon floors: shorter links, more rooms)
    const dn = n === 4 ? dim([14, 21], [14, 20]) : i === n - 1 && n === 3 ? dim([20, 25], [18, 23]) : n === 2 ? dim([26, 32], [22, 28]) : dim([22, 27], [20, 25]);
    const half = (c: { w: number; h: number }): number => (dx !== 0 ? c.w : c.h) / 2;   // half extent along the journey
    const halfL = (c: { w: number; h: number }): number => (dx !== 0 ? c.h : c.w) / 2;   // lateral half extent
    const lat0 = dx !== 0 ? cur.cz : cur.cx, along0 = dx !== 0 ? cur.cx : cur.cz, s = dx !== 0 ? dx : dz;   // s: sign along the axis
    const r = rnd();
    let kind = forceStraight || r < (n === 4 ? 0.2 : 0.38) ? 'S' : r < (n === 4 ? 0.45 : 0.68) ? 'Z' : 'L';
    // an L turn is only legal while heading along +x (second link of a triple must not turn back)
    if (kind === 'L' && !(dx === 1 && dz === 0)) kind = 'S';
    const links: Rect4[] = [];
    let next: { cx: number; cz: number; w: number; h: number };
    const at = (along: number, lat: number): Pt => (dx !== 0 ? [along, lat] : [lat, along]);   // axis-run coords -> x, z
    if (kind === 'S') {
      const L = R(12 * lk, 20 * lk), off = R(-3, 3);
      const aEdge = along0 + s * half(cur), nC = aEdge + s * (L + half(dn)), zc = lat0 + off / 2;
      const [nx, nz] = at(nC, lat0 + off);
      next = { cx: nx, cz: nz, ...dn };
      links.push(runRect(dx, aEdge - s * 1, aEdge + s * (L + 1), zc, cw));
      keep.push([...at(aEdge + s * 2, zc), 5.5], [...at(aEdge + s * (L - 2), zc), 5.5]);
    } else if (kind === 'Z') {
      const La = R(6 * lk, 9 * lk), Lc = R(6 * lk, 9 * lk), J = R(9, 14 * lk) * (rnd() < 0.5 ? 1 : -1);
      const aEdge = along0 + s * half(cur), a1 = aEdge + s * La, a2 = a1 + s * Lc, off = R(-2, 2);
      const lat1 = lat0 + off, lat2 = lat0 + J + off;
      const nC = a2 + s * half(dn);
      const [nx, nz] = at(nC, lat0 + J);
      next = { cx: nx, cz: nz, ...dn };
      links.push(runRect(dx, aEdge - s, a1 + s * cw / 2, lat1, cw), runRect(dx !== 0 ? 0 : 1, lat1, lat2, a1, cw), runRect(dx, a1 - s * cw / 2, a2 + s, lat2, cw));
      keep.push([...at(aEdge + s * 2, lat1), 5.5], [...at(a2 - s * 2, lat2), 5.5]);
    } else {
      // L: run along +x to the bend, then turn +-z into the next chamber (which sits above / below)
      const Lh = R(10 * lk, 16 * lk), Lv = R(8, 13 * lk), side = rnd() < 0.5 ? 1 : -1, off = R(-2, 2);
      const aEdge = cur.cx + cur.w / 2, bendX = aEdge + Lh, lat1 = cur.cz + off;
      const ncx = bendX + R(-3, 3), nzC = lat1 + side * (Lv + dn.h / 2);
      const nearZ = nzC - side * dn.h / 2;
      next = { cx: ncx, cz: nzC, ...dn };
      links.push([aEdge - 1, lat1 - cw / 2, bendX + cw / 2, lat1 + cw / 2],
        side > 0 ? [bendX - cw / 2, lat1 - cw / 2, bendX + cw / 2, nearZ + 1] : [bendX - cw / 2, nearZ - 1, bendX + cw / 2, lat1 + cw / 2]);
      keep.push([aEdge + 2, lat1, 5.5], [bendX, nearZ - side * 2, 5.5]);
      dx = 0; dz = side;
    }
    void halfL;
    for (const l of links) { parts.push(l); partGroup.push(2 * i - 1); corridors.push(l); }
    cs.push(next); parts.push([next.cx - next.w / 2, next.cz - next.h / 2, next.cx + next.w / 2, next.cz + next.h / 2]); partGroup.push(2 * i);
    cur = next;
  }
  // spacing: parts that are not neighbours must keep >= 4.5 m of wall between them
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    if (Math.abs(partGroup[a] - partGroup[b]) <= 1) continue;
    if (rectDist(parts[a], parts[b]) < 4.5) return null;
  }
  {   // keep the whole floor within ~70 m of the hub (walking time, nav grid size)
    const m0 = cs[Math.floor(n / 2)];
    for (const r of parts) for (const x of [r[0], r[2]]) for (const z of [r[1], r[3]]) if (Math.hypot(x - m0.cx, z - m0.cz) > 70) return null;
  }
  const chambers: Rect4[] = cs.map((c) => [c.cx - c.w / 2, c.cz - c.h / 2, c.cx + c.w / 2, c.cz + c.h / 2]);
  const walls: Rect4[] = [];
  // pillars: a symmetric pair / quad in the bigger chambers (never near the arrival, the hub or the exit)
  const first = chambers[0], last = chambers[chambers.length - 1], mid = cs[Math.floor(n / 2)];
  const startP: Pt = [first[0] + 7, (first[1] + first[3]) / 2];
  const dirP: Pt = [dx, dz];
  const exitP: Pt = [(last[0] + last[2]) / 2 + dx * ((dx !== 0 ? last[2] - last[0] : last[3] - last[1]) / 2 - 6), (last[1] + last[3]) / 2 + dz * ((dx !== 0 ? last[2] - last[0] : last[3] - last[1]) / 2 - 6)];
  for (let ci = 0; ci < chambers.length; ci++) {
    if (rnd() < 0.4) continue;
    const c = cs[ci], px = c.w * 0.22, pz = c.h * 0.22, pr = q2(1 + rnd() * 0.5);   // pillar half size 1..1.5
    const spots: Pt[] = rnd() < 0.5 ? [[c.cx - px, c.cz - pz], [c.cx + px, c.cz + pz]] : [[c.cx - px, c.cz - pz], [c.cx + px, c.cz - pz], [c.cx - px, c.cz + pz], [c.cx + px, c.cz + pz]];
    for (const [x, z] of spots) {
      const bad = (a: Pt, r: number): boolean => Math.hypot(x - a[0], z - a[1]) < r;
      if (bad(startP, 7) || bad(exitP, 7) || bad([exitP[0] - dirP[0] * 9, exitP[1] - dirP[1] * 9], 5) || (ci === Math.floor(n / 2) && bad([mid.cx, mid.cz], 6))) continue;
      let nearMouth = false;
      for (const k of keep) if (Math.hypot(x - k[0], z - k[1]) < 7.5) { nearMouth = true; break; }
      if (nearMouth) continue;
      walls.push([q2(x - pr), q2(z - pr), q2(x + pr), q2(z + pr)]);
    }
  }
  // an optional side room off the hub chamber (dead end: a good spot for a chest / ambush)
  if (rnd() < 0.65) {
    const hi = Math.floor(n / 2), hc = cs[hi], sw = R(12, 16), sh = R(12, 16), Ls = R(5, 8), cw = R(4.5, 5);
    const dirs: Pt[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let t = dirs.length - 1; t > 0; t--) { const j = Math.floor(rnd() * (t + 1)); const tmp = dirs[t]; dirs[t] = dirs[j]; dirs[j] = tmp; }
    for (const [ux, uz] of dirs) {
      const reach = ux !== 0 ? hc.w / 2 : hc.h / 2, sreach = ux !== 0 ? sw / 2 : sh / 2;
      const lat = R(-3, 3);
      const room: Rect4 = ux !== 0
        ? [hc.cx + ux * (reach + Ls + sreach) - sw / 2, hc.cz + lat - sh / 2, hc.cx + ux * (reach + Ls + sreach) + sw / 2, hc.cz + lat + sh / 2]
        : [hc.cx + lat - sw / 2, hc.cz + uz * (reach + Ls + sreach) - sh / 2, hc.cx + lat + sw / 2, hc.cz + uz * (reach + Ls + sreach) + sh / 2];
      const link: Rect4 = ux !== 0
        ? [Math.min(hc.cx + ux * (reach - 1), hc.cx + ux * (reach + Ls + 1)), hc.cz + lat - cw / 2, Math.max(hc.cx + ux * (reach - 1), hc.cx + ux * (reach + Ls + 1)), hc.cz + lat + cw / 2]
        : [hc.cx + lat - cw / 2, Math.min(hc.cz + uz * (reach - 1), hc.cz + uz * (reach + Ls + 1)), hc.cx + lat + cw / 2, Math.max(hc.cz + uz * (reach - 1), hc.cz + uz * (reach + Ls + 1))];
      let ok = true;
      for (let a = 0; a < parts.length; a++) {
        const g = partGroup[a];
        if (rectDist(parts[a], room) < 4.5 && g !== hi * 2) { ok = false; break; }
        if (rectDist(parts[a], link) < 4.5 && g !== hi * 2 && g !== hi * 2 - 1 && g !== hi * 2 + 1) { ok = false; break; }
      }
      if (!ok) continue;
      chambers.push(room); corridors.push(link);
      keep.push([hc.cx + ux * (reach + 2), hc.cz + uz * (reach + 2) + (ux !== 0 ? lat : 0), 5]);
      break;
    }
  }
  return { open: [...chambers, ...corridors], chambers, corridors, walls, start: startP, exit: exitP, dir: dirP, hub: [mid.cx, mid.cz], keep, half: (dx !== 0 ? last[3] - last[1] : last[2] - last[0]) / 2 };
}

/** One big hall with interior wall segments (weave) or a central spine (two lanes) plus pillars. Journey along +x. */
function bigHall(rnd: () => number, sz: number): Local {
  const R = (a: number, b: number): number => q2(a + rnd() * (b - a));
  const w = R(46, 54) * sz, h = R(30, 36) * sz, hw = q2(w / 2), hh = q2(h / 2);
  const hall: Rect4 = [-hw, -hh, hw, hh];
  const walls: Rect4[] = [];
  const spine = rnd() < 0.4;
  let hub: Pt = [0, 0];
  if (spine) {
    const len = (0.4 + rnd() * 0.1) * w;
    walls.push([-q2(len / 2), -1, q2(len / 2), 1]);
    hub = [0, q2(hh * 0.5)];
    for (const sd of [-1, 1]) for (const px of [-0.28, 0.28]) { const x = q2(px * w), z = q2(sd * hh * 0.5), r = 1.5; walls.push([x - r, z - r, x + r, z + r]); }
  } else {
    const a = R(6.5, 8), la = R(15, 19);
    walls.push([-q2(w * 0.30), q2(a - 1), -q2(w * 0.30) + la, q2(a + 1)]);   // upper wall, left half
    walls.push([q2(w * 0.30) - la, -q2(a + 1), q2(w * 0.30), -q2(a - 1)]);   // lower wall, right half
    hub = [0, q2(-hh * 0.3)];
    for (const [x, z] of [[-0.28 * w, -hh * 0.55], [0.28 * w, hh * 0.55], [0, 0]] as Pt[]) { const r = q2(1 + rnd() * 0.5); walls.push([q2(x - r), q2(z - r), q2(x + r), q2(z + r)]); }
  }
  return { open: [hall], chambers: [hall], corridors: [], walls, start: [-hw + 6, 0], exit: [hw - 6, 0], dir: [1, 0], hub, keep: [], half: hh };
}

/** L-shaped hall: two long arms (14-18 m) turning a corner, with end chambers and a pillar in each arm. */
function lHall(rnd: () => number, sz: number): Local {
  const R = (a: number, b: number): number => q2(a + rnd() * (b - a));
  const aw = R(14, 18), L1 = q2(R(30, 36) * sz), L2 = q2(R(30, 36) * sz), hw = q2(aw / 2);
  // arm 1 along x from the far end to the corner, arm 2 along +z from the corner; end chambers widen both ends
  const arm1: Rect4 = [-L1, -hw, hw, hw], arm2: Rect4 = [-hw, -hw, hw, L2];
  const c1: Rect4 = [-L1 - 4, -11, -L1 + 18, 11], c2: Rect4 = [-11, L2 - 18, 11, L2 + 4];
  const walls: Rect4[] = [];
  const pr = 1.5, p1 = q2(-L1 * 0.5), p2 = q2(L2 * 0.55);
  walls.push([p1 - pr, -pr, p1 + pr, pr]);
  walls.push([-pr, p2 - pr, pr, p2 + pr]);
  return { open: [arm1, arm2, c1, c2], chambers: [c1, c2], corridors: [arm1, arm2], walls, start: [c1[0] + 7, 0], exit: [0, c2[3] - 6], dir: [0, 1], hub: [0, 0], keep: [], half: 11 };
}

// --------------------------------------------------------------- build / API ---
/** Local -> world: rotation k (quarter turns) after an optional mirror of z. */
function mapPt(k: number, mirror: boolean, x: number, z: number, out: Pt): Pt {
  if (mirror) z = -z;
  switch (k & 3) {
    case 0: out[0] = x; out[1] = z; break;
    case 1: out[0] = -z; out[1] = x; break;
    case 2: out[0] = -x; out[1] = -z; break;
    default: out[0] = z; out[1] = -x; break;
  }
  return out;
}
function mapRect(k: number, mirror: boolean, r: Rect4, ox: number, oz: number): Rect4 {
  const a = mapPt(k, mirror, r[0], r[1], [0, 0]), b = mapPt(k, mirror, r[2], r[3], [0, 0]);
  return [Math.min(a[0], b[0]) - ox, Math.min(a[1], b[1]) - oz, Math.max(a[0], b[0]) - ox, Math.max(a[1], b[1]) - oz];
}

export function pickVariant(type: string, rnd: () => number): HallsVariant {
  const r = rnd();
  if (type === 'TREASURE') return r < 0.3 ? 'TWIN' : r < 0.7 ? 'TRIPLE' : r < 0.9 ? 'DUNGEON' : 'LHALL';
  return r < 0.15 ? 'TWIN' : r < 0.4 ? 'TRIPLE' : r < 0.7 ? 'DUNGEON' : r < 0.85 ? 'HALL' : 'LHALL';
}

/** Builds the mask for a room of nominal radius R. Fills `halls` (origin = hub chamber centre). */
export function buildHallsLayout(type: string, R: number, rnd: () => number, force?: HallsVariant): void {
  const sz = Math.min(1.12, Math.max(0.9, (R + 1) / 27));
  const variant = force ?? pickVariant(type, rnd);
  let L: Local | null = null;
  for (let t = 0; t < 12 && !L; t++) {
    if (variant === 'TWIN') L = chain(rnd, 2, sz, t >= 8);
    else if (variant === 'TRIPLE') L = chain(rnd, 3, sz, t >= 8);
    else if (variant === 'DUNGEON') L = chain(rnd, 4, sz, t >= 8);
    else if (variant === 'HALL') L = bigHall(rnd, sz);
    else L = lHall(rnd, sz);
  }
  if (!L) L = bigHall(rnd, sz);
  const k = Math.floor(rnd() * 4), mirror = rnd() < 0.5;
  const hubW = mapPt(k, mirror, L.hub[0], L.hub[1], [0, 0]);
  const ox = hubW[0], oz = hubW[1];
  const tr = (r: Rect4): Rect4 => mapRect(k, mirror, r, ox, oz);
  halls.chambers = L.chambers.map(tr); halls.corridors = L.corridors.map(tr); halls.walls = L.walls.map(tr);
  const pt = (p: Pt): Pt => { const o = mapPt(k, mirror, p[0], p[1], [0, 0]); return [o[0] - ox, o[1] - oz]; };
  const s = pt(L.start), e = pt(L.exit), d = mapPt(k, mirror, L.dir[0], L.dir[1], [0, 0]);
  halls.sx = s[0]; halls.sz = s[1]; halls.ex = e[0]; halls.ez = e[1]; halls.dx = d[0]; halls.dz = d[1];
  halls.stx = 0; halls.stz = 0; halls.exitHalf = L.half;
  const fl = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1;
  halls.fx = (e[0] - s[0]) / fl; halls.fz = (e[1] - s[1]) / fl;
  halls.keep = L.keep.map((p) => { const q = pt([p[0], p[1]]); return [q[0], q[1], p[2]] as [number, number, number]; });
  halls.variant = variant;
  // keep points: the mouths of every chamber (where a corridor enters) are covered by L.keep (chains); halls / L-halls have none
  rasterise(L.open.map(tr), halls.walls);
  halls.on = true; halls.version++;
}

function rasterise(open: Rect4[], walls: Rect4[]): void {
  let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
  for (const r of open) { mnx = Math.min(mnx, r[0]); mnz = Math.min(mnz, r[1]); mxx = Math.max(mxx, r[2]); mxz = Math.max(mxz, r[3]); }
  halls.x0 = Math.floor(mnx / HC) * HC - PAD * HC; halls.z0 = Math.floor(mnz / HC) * HC - PAD * HC;
  const w = Math.min(MAX_W, Math.ceil((mxx - halls.x0) / HC) + PAD), h = Math.min(MAX_W, Math.ceil((mxz - halls.z0) / HC) + PAD);
  halls.w = w; halls.h = h;
  const O = halls.open, n = w * h;
  O.fill(0, 0, n);
  const fill = (r: Rect4, v: number): void => {
    const i0 = Math.max(0, Math.ceil((r[0] - halls.x0) / HC - 0.5)), i1 = Math.min(w - 1, Math.floor((r[2] - halls.x0) / HC - 0.5));
    const j0 = Math.max(0, Math.ceil((r[1] - halls.z0) / HC - 0.5)), j1 = Math.min(h - 1, Math.floor((r[3] - halls.z0) / HC - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) O[j * w + i] = v;
  };
  for (const r of open) fill(r, 1);
  for (const r of walls) fill(r, 0);
  let area = 0;
  for (let i = 0; i < n; i++) area += O[i];
  halls.area = area * HC * HC;
  // sdf: distance to the nearest wall cell for open cells (positive), to the nearest open cell for wall cells (negative)
  for (let i = 0; i < n; i++) edt[i] = O[i] ? INF : 0;
  edt2d(w, h);
  for (let i = 0; i < n; i++) if (O[i]) halls.sdf[i] = (Math.sqrt(edt[i]) - 0.5) * HC;
  for (let i = 0; i < n; i++) edt[i] = O[i] ? 0 : INF;
  edt2d(w, h);
  for (let i = 0; i < n; i++) if (!O[i]) halls.sdf[i] = -(Math.sqrt(edt[i]) - 0.5) * HC;
  // farthest open cell from the origin
  let ext = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (O[j * w + i]) {
    const x = halls.x0 + (i + 0.5) * HC, z = halls.z0 + (j + 0.5) * HC, d = x * x + z * z;
    if (d > ext) ext = d;
  }
  halls.extent = Math.sqrt(ext);
}

/** Open-floor test with a margin in metres (placement helpers). */
export function hallsInside(x: number, z: number, margin: number): boolean { return hallsSdf(x, z) >= margin; }

/** Placement margin for a star-convex `margin` request: props stay out of corridors and lanes (>= 3.2 m from every wall). */
export function placeMargin(margin: number): number { return Math.max(3.2, Math.min(margin, 6)); }
