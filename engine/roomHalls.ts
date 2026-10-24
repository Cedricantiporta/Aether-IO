// ============================================================================
// HALLS room layouts: organic dungeon floor plans (rounded clearings joined by curving passages, tree / rock / column islands).
// Unlike the star-convex outlines of roomShape.ts, a halls room is a WALKABLE MASK: a 0.5 m grid (open / blocked) built from a
// distance field of soft blobs + bezier passages (+ noise wobble), plus an exact signed distance field (sdf > 0 = metres inside the
// open floor, < 0 = metres inside the blocked ground). Everything that clamps or collides asks the mask: hallsPush (slide along the
// edge), hallsSegClear (line of sight / projectile paths), hallsSdf (placement margins). The edge is dressed by render/HallsBorder.tsx
// (trees / rocks, or nothing but darkness + round columns in Marble Halls). Six designs, see DESIGNS below. Passages are >= 5 m wide
// (a hard core is stamped so the wobble can never pinch one shut), chambers 20-30 m. Pure TS; all buffers preallocated.
// ============================================================================

export type HallsVariant = 'TWIN' | 'FROZEN' | 'DUNES' | 'COLUMNS' | 'CROSS' | 'CRESCENT';

export const HC = 0.5;                 // cell size (m)
const MAX_W = 380;                     // grid cells per side (190 m)
const PAD = 12;                        // blocked border (cells)
const MAXN = MAX_W * MAX_W;

export const halls = {
  on: false, version: 0, variant: 'TWIN' as HallsVariant,
  w: 0, h: 0, x0: 0, z0: 0,
  open: new Uint8Array(MAXN),
  sdf: new Float32Array(MAXN),
  /** arrival, station, exit centre, boss-shortcut spot, exit direction (unit), overall start->exit direction. */
  sx: 0, sz: 0, stx: 0, stz: 0, ex: 0, ez: 0, scx: 0, scz: 0, dx: 0, dz: -1, fx: 0, fz: -1,
  /** unwalkable islands inside the floor (clumps / columns): x, z, radius */
  islands: [] as [number, number, number][],
  /** points that must stay clear of props (passage mouths): x, z, r triples. */
  keep: [] as [number, number, number][],
  area: 0, extent: 0,
  /** half width of the exit area (the portal slots spread within it) */
  exitHalf: 10,
};

const edt = new Float32Array(MAXN);
const tmpF = new Float32Array(MAX_W + 1);
const tmpV = new Int32Array(MAX_W + 1);
const tmpZ = new Float32Array(MAX_W + 2);
const tmpD = new Float32Array(MAX_W + 1);
const tmpS = new Float32Array(MAXN);
const INF = 1e9;

/** Felzenszwalb squared Euclidean distance transform of the grid in `edt` (0 where f = 0, INF elsewhere), in cells^2. */
function edt2d(w: number, h: number): void {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) tmpF[y] = edt[y * w + x];
    pass1d(h);
    for (let y = 0; y < h; y++) edt[y * w + x] = tmpD[y];
  }
  for (let y = 0; y < h; y++) {
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
/** Signed distance to the nearest edge in metres (bilinear): > 0 open floor, < 0 blocked ground, very negative outside the grid. */
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

/** Is (x, z) inside blocked ground (or outside the layout)? */
export function hallsWall(x: number, z: number): boolean { return hallsSdf(x, z) < 0.05; }

/** Pushes (x, z) until it is at least `m` metres inside the open floor (slides along the edge). Returns true when it moved. */
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

/** Straight segment over open floor (at least `m` from every edge), sampled every 0.4 m. */
export function hallsSegClear(x0: number, z0: number, x1: number, z1: number, m = 0.2): boolean {
  const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.ceil(len / 0.4));
  for (let i = 0; i <= n; i++) { const t = i / n; if (hallsSdf(x0 + dx * t, z0 + dz * t) < m) return false; }
  return true;
}

/** Walks from (fx, fz) toward (x, z) and stops at the last open sample (>= m from the edge); writes the result to `out`. */
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

/** Open-floor test with a margin in metres (placement helpers). */
export function hallsInside(x: number, z: number, margin: number): boolean { return hallsSdf(x, z) >= margin; }

/** Placement margin for a star-convex `margin` request: props stay out of passages (>= 3.2 m from every edge). */
export function placeMargin(margin: number): number { return Math.max(3.2, Math.min(margin, 6)); }

// ------------------------------------------------------------------ designs ---
type Blob = [number, number, number, number, number, number];   // cx, cz, rx, rz, rotation (deg), kidney bend
type Path = { c: [number, number][]; w0: number; w1: number };   // cubic bezier control points + start / end width
interface Design {
  blobs: Blob[]; paths: Path[]; islands: [number, number, number][];
  start: [number, number]; exit: [number, number]; hub: [number, number];
  target: [number, number];     // wanted floor area range (m2); positions are scaled to hit it
}

const DESIGNS: Record<HallsVariant, Design> = {
  // two big kidney clearings joined by one long winding path, a tree island in each
  TWIN: {
    blobs: [[-22, -30, 24, 17, 20, 0.25], [17, 26, 25, 18, -15, -0.25]],
    paths: [{ c: [[-14, -22], [6, -10], [-8, 6], [10, 19]], w0: 6.9, w1: 6.9 }],
    islands: [[-26, -30, 3.2], [-14, -34, 2.2], [19, 29, 3.4], [10, 22, 2.2]],
    start: [-30, -34], exit: [26, 32], hub: [14, 34], target: [1500, 1900],
  },
  // three snowy hollows in a chain + a side pocket
  FROZEN: {
    blobs: [[0, -38, 20, 14, 5, 0.1], [-4, 0, 22, 16, -10, -0.15], [6, 40, 19, 14, 8, 0.15], [30, 2, 11, 9, 0, 0]],
    paths: [{ c: [[0, -26], [14, -16], [-12, -14], [-8, -10]], w0: 6.9, w1: 6.9 }, { c: [[-2, 12], [-10, 22], [14, 24], [6, 30]], w0: 6.9, w1: 6.9 }, { c: [[18, 0], [22, 0], [24, 2], [26, 2]], w0: 6.9, w1: 6.9 }],
    islands: [[-8, 2, 2.6], [6, -2, 2.0], [-12, 42, 2.4], [8, -40, 2.2]],
    start: [0, -42], exit: [6, 44], hub: [-2, 8], target: [1500, 1900],
  },
  // two sand bowls, a canyon between them and a dead-end canyon pocket
  DUNES: {
    blobs: [[-24, 28, 22, 15, -20, 0.3], [20, -24, 22, 16, 25, -0.3], [-31, -24, 9, 8, 0, 0]],
    paths: [{ c: [[-10, 20], [6, 6], [-6, -4], [8, -13]], w0: 6.9, w1: 6.9 }, { c: [[-8, 24], [-34, 6], [-40, -10], [-30, -22]], w0: 6.9, w1: 6.9 }],
    islands: [[-28, 30, 2.8], [24, -26, 3.0], [-18, 22, 2.0], [14, -18, 2.0]],
    start: [-32, 38], exit: [30, -32], hub: [-18, 34], target: [1450, 1850],
  },
  // Marble Halls: three hall-clearings + a side room, floor ends in black, rows of round columns
  COLUMNS: {
    blobs: [[0, -34, 20, 13, 0, 0], [0, 4, 24, 15, 0, 0], [-6, 42, 18, 13, 0, 0], [-34, 6, 10, 8, 0, 0]],
    paths: [{ c: [[0, -22], [4, -16], [-4, -12], [0, -8]], w0: 6.9, w1: 6.9 }, { c: [[-2, 18], [6, 24], [-8, 30], [-6, 32]], w0: 6.9, w1: 6.9 }, { c: [[-22, 6], [-26, 6], [-28, 6], [-30, 6]], w0: 6.9, w1: 6.9 }],
    islands: [[-9, 3, 1.9], [-3, 3, 1.9], [3, 3, 1.9], [9, 3, 1.9], [-13, 14, 1.9], [13, 14, 1.9], [-6, -36, 1.9], [6, -36, 1.9], [-8, 44, 1.9], [6, 44, 1.9]],
    start: [0, -40], exit: [-6, 46], hub: [0, 8], target: [1500, 1900],
  },
  // a big heart clearing with three spokes (arrival pocket, dead-end pocket, exit pocket)
  CROSS: {
    blobs: [[0, 0, 21, 19, 0, 0], [-4, -44, 15, 11, 0, 0.1], [36, 20, 14, 12, 0, 0], [-34, 24, 15, 12, 0, 0]],
    paths: [{ c: [[0, -16], [6, -26], [-8, -30], [-4, -36]], w0: 6.9, w1: 6.9 }, { c: [[16, 8], [24, 8], [24, 16], [30, 18]], w0: 6.9, w1: 6.9 }, { c: [[-16, 8], [-22, 14], [-26, 18], [-28, 20]], w0: 6.9, w1: 6.9 }],
    islands: [[-2, 1, 4.0], [10, -8, 2.2], [-10, 9, 2.2], [-34, 26, 2.2]],
    start: [-4, -46], exit: [38, 22], hub: [6, 8], target: [1600, 2000],
  },
  // one sweeping crescent hall with lanes round tree clumps
  CRESCENT: {
    blobs: [[-4, -2, 30, 20, 15, 0.55], [26, 18, 12, 14, 0, 0], [-26, -22, 11, 10, 0, 0]],
    paths: [{ c: [[-24, -20], [0, -30], [24, -10], [26, 14]], w0: 12, w1: 10 }],
    islands: [[-2, 2, 5.0], [-16, 6, 2.6], [10, -2, 2.8], [-8, -14, 2.4], [18, 14, 2.4]],
    start: [-28, -24], exit: [26, 22], hub: [-4, -12], target: [1600, 2000],
  },
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Which design a room gets: by biome look (style = ground style, name = biome name). */
export function pickVariant(style: string, name: string, rnd: () => number): HallsVariant {
  const r = rnd();
  if (style === 'MARBLE') return 'COLUMNS';
  if (style === 'SNOW') return r < 0.65 ? 'FROZEN' : 'CRESCENT';
  if (style === 'SAND' && name !== 'Coral Isles') return r < 0.65 ? 'DUNES' : 'CRESCENT';
  if (style === 'BASALT') return r < 0.65 ? 'DUNES' : 'CRESCENT';
  return r < 0.34 ? 'TWIN' : r < 0.67 ? 'CROSS' : 'CRESCENT';
}

// smooth value noise (organic outlines)
const hash2 = (x: number, y: number): number => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v) + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v;
}

/** The concrete (jittered, scaled, rotated) layout in WORLD coordinates (origin = hub). */
interface Inst {
  blobs: { x: number; z: number; rx: number; rz: number; c: number; s: number; kid: number }[];
  segs: number[];            // flat: ax, az, bx, bz, halfWidth
  islands: [number, number, number][];
  start: [number, number]; exit: [number, number]; hub: [number, number];
  keep: [number, number, number][];
  mnx: number; mnz: number; mxx: number; mxz: number;
}

function instantiate(D: Design, rnd: () => number, scale: number, ang: number, mirror: boolean): Inst {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const hubP = D.hub;
  const T = (x: number, z: number): [number, number] => {   // plan -> world: scale about the hub, mirror, rotate
    let px = (x - hubP[0]) * scale, pz = (z - hubP[1]) * scale;
    if (mirror) px = -px;
    return [px * ca - pz * sa, px * sa + pz * ca];
  };
  const out: Inst = { blobs: [], segs: [], islands: [], start: [0, 0], exit: [0, 0], hub: [0, 0], keep: [], mnx: 1e9, mnz: 1e9, mxx: -1e9, mxz: -1e9 };
  const ext = (x: number, z: number, r: number): void => { out.mnx = Math.min(out.mnx, x - r); out.mnz = Math.min(out.mnz, z - r); out.mxx = Math.max(out.mxx, x + r); out.mxz = Math.max(out.mxz, z + r); };
  for (const b of D.blobs) {
    const jx = (rnd() - 0.5) * 4, jz = (rnd() - 0.5) * 4, js = 0.92 + rnd() * 0.16;
    const [x, z] = T(b[0] + jx, b[1] + jz);
    const rot = (mirror ? -b[4] : b[4]) * Math.PI / 180 + ang, rx = b[2] * scale * js, rz = b[3] * scale * (0.94 + rnd() * 0.12);
    out.blobs.push({ x, z, rx, rz, c: Math.cos(rot), s: Math.sin(rot), kid: mirror ? -b[5] : b[5] });
    ext(x, z, Math.max(rx, rz) * 1.2 + 3);
  }
  for (const p of D.paths) {
    const pts: [number, number][] = p.c.map((q, i) => T(q[0] + (i > 0 && i < 3 ? (rnd() - 0.5) * 5 : 0), q[1] + (i > 0 && i < 3 ? (rnd() - 0.5) * 5 : 0)));
    let px = 0, pz = 0;
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
      const x = a * pts[0][0] + b * pts[1][0] + c * pts[2][0] + d * pts[3][0], z = a * pts[0][1] + b * pts[1][1] + c * pts[2][1] + d * pts[3][1];
      if (i > 0) out.segs.push(px, pz, x, z, (p.w0 + (p.w1 - p.w0) * t) / 2);
      px = x; pz = z; ext(x, z, 6);
    }
    out.keep.push([pts[0][0], pts[0][1], 5.5], [pts[3][0], pts[3][1], 5.5]);
  }
  for (const i of D.islands) {   // (an island never sits in a passage mouth)
    const [x, z] = T(i[0], i[1]);
    if (out.keep.some((k) => Math.hypot(x - k[0], z - k[1]) < i[2] + 9)) continue;
    out.islands.push([x, z, i[2]]); ext(x, z, i[2] + 2);
  }
  out.start = T(D.start[0], D.start[1]); out.exit = T(D.exit[0], D.exit[1]); out.hub = T(D.hub[0], D.hub[1]);
  return out;
}

/** Builds the mask for a room of nominal radius R. Fills `halls` (origin = hub). */
export function buildHallsLayout(type: string, R: number, seed: number, style: string, name: string, force?: HallsVariant): void {
  void type; void R;
  const rnd = mulberry(seed ^ 0x3c6ef372);
  const variant = force ?? pickVariant(style, name, rnd);
  const D = DESIGNS[variant];
  const ang = rnd() * Math.PI * 2, mirror = rnd() < 0.5;
  const target = D.target[0] + rnd() * (D.target[1] - D.target[0]);
  let scale = 1, I: Inst;
  for (let pass = 0; ; pass++) {
    I = instantiate(D, mulberry(seed ^ 0x51ed270b), scale, ang, mirror);   // (same jitter every pass)
    rasterise(I, seed);
    let ns = Math.min(1.3, Math.max(0.7, scale * Math.sqrt(target / Math.max(100, halls.area))));
    if (halls.extent * (ns / scale) > 76) ns = (scale * 76) / halls.extent;
    if (pass >= 2 || Math.abs(ns / scale - 1) < 0.04 && halls.extent <= 76) break;
    scale = ns;
  }
  finishPoints(I);
  halls.variant = variant;
  halls.on = true; halls.version++;
}

const wob = new Float32Array(MAXN), ppass = new Float32Array(MAXN), pcore = new Float32Array(MAXN);

function rasterise(I: Inst, seed: number): void {
  const pad = PAD * HC;
  halls.x0 = Math.floor((I.mnx - pad) / HC) * HC; halls.z0 = Math.floor((I.mnz - pad) / HC) * HC;
  const w = Math.min(MAX_W, Math.ceil((I.mxx - halls.x0) / HC) + PAD), h = Math.min(MAX_W, Math.ceil((I.mxz - halls.z0) / HC) + PAD);
  halls.w = w; halls.h = h;
  const O = halls.open, n = w * h;
  const p1 = (seed % 997) * 0.37, p2 = p1 + 31.7;
  const ns = I.segs.length / 5, nb = I.blobs.length, ni = I.islands.length;
  // passages: stamp each segment into its own bounding box (soft distance, and the hard "core" that is always open)
  ppass.fill(99, 0, n); pcore.fill(99, 0, n);
  for (let s = 0; s < ns; s++) {
    const a = s * 5, ax = I.segs[a], az = I.segs[a + 1], bx = I.segs[a + 2], bz = I.segs[a + 3], hw = I.segs[a + 4], rr = hw + 4;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - rr - halls.x0) / HC)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + rr - halls.x0) / HC));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - rr - halls.z0) / HC)), j1 = Math.min(h - 1, Math.ceil((Math.max(az, bz) + rr - halls.z0) / HC));
    const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz + 1e-9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = halls.x0 + (i + 0.5) * HC, z = halls.z0 + (j + 0.5) * HC, t = Math.min(1, Math.max(0, ((x - ax) * sx + (z - az) * sz) / l2));
      const dist = Math.hypot(x - (ax + t * sx), z - (az + t * sz)), k = j * w + i;
      if (dist - hw < ppass[k]) ppass[k] = dist - hw;
      if (dist - (hw - 0.45) < pcore[k]) pcore[k] = dist - (hw - 0.45);
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = halls.x0 + (i + 0.5) * HC, z = halls.z0 + (j + 0.5) * HC;
    // blobs (negative inside)
    let d = 99;
    for (let b = 0; b < nb; b++) {
      const B = I.blobs[b], dx = x - B.x, dz = z - B.z;
      const u = dx * B.c + dz * B.s;
      let v = -dx * B.s + dz * B.c;
      if (B.kid) v += B.kid * (u / B.rx) * (u / B.rx) * B.rz;
      const q = Math.hypot(u / B.rx, v / B.rz);
      d = Math.min(d, (q - 1) * Math.min(B.rx, B.rz) * 0.9);
    }
    // passages: core distance (hard-stamped open) and the soft one
    const core = pcore[j * w + i];
    d = Math.min(d, ppass[j * w + i]);
    // soft wobble: strongest deep inside / far out, small at the edge so passages keep their width
    const nz = (vnoise(x * 0.16 + p1, z * 0.16) - 0.5) * 2 * 1.3 + (vnoise(x * 0.45, z * 0.45 + p2) - 0.5) * 2 * 0.5;
    d += nz * Math.min(1, Math.max(0.15, (-d + 2) / 6));
    // islands (blocked): carve a wobbly disc
    let isl = 0;
    for (let k = 0; k < ni; k++) {
      const q = I.islands[k];
      const dd = Math.hypot(x - q[0], z - q[1]);
      if (dd > q[2] + 1) continue;
      const e = q[2] - dd + (vnoise(x * 0.5 + q[0], z * 0.5 + q[1]) - 0.5) * 1.1;
      if (e > isl) isl = e;
    }
    wob[j * w + i] = isl > 0 ? 1 : (d < 0 || core < 0 ? -1 : 1);   // -1 = open
  }
  // borders stay blocked; majority pass removes specks / stair-steps
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (i < 2 || j < 2 || i >= w - 2 || j >= h - 2) { O[k] = 0; continue; }
    let c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c += wob[(j + dj) * w + i + di] < 0 ? 1 : 0;
    O[k] = c >= 5 ? 1 : 0;
  }
  finishMask(I);
  void n;
}

function finishMask(I: Inst): void {
  const w = halls.w, h = halls.h, n = w * h, O = halls.open;
  let area = 0;
  for (let i = 0; i < n; i++) area += O[i];
  halls.area = area * HC * HC;
  for (let i = 0; i < n; i++) edt[i] = O[i] ? INF : 0;
  edt2d(w, h);
  for (let i = 0; i < n; i++) if (O[i]) halls.sdf[i] = (Math.sqrt(edt[i]) - 0.5) * HC;
  for (let i = 0; i < n; i++) edt[i] = O[i] ? 0 : INF;
  edt2d(w, h);
  for (let i = 0; i < n; i++) if (!O[i]) halls.sdf[i] = -(Math.sqrt(edt[i]) - 0.5) * HC;
  // one 3x3 blur of the sdf smooths the 0.5 m stair-steps (the zero crossing stays put), so pushes slide smoothly
  const S = halls.sdf;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    let s = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += S[(j + dj) * w + i + di];
    tmpS[j * w + i] = s / 9;
  }
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) S[j * w + i] = tmpS[j * w + i];
  let ext = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (O[j * w + i]) {
    const x = halls.x0 + (i + 0.5) * HC, z = halls.z0 + (j + 0.5) * HC, d = x * x + z * z;
    if (d > ext) ext = d;
  }
  halls.extent = Math.sqrt(ext);
  halls.islands = I.islands.slice();
  halls.keep = I.keep.slice();
}

/** Arrival / exit / station / shortcut points (pulled inward until they have room), exit slot spread. */
function finishPoints(I: Inst): void {
  const snap = (p: [number, number], toward: [number, number], need: number): [number, number] => {
    void toward;
    if (hallsSdf(p[0], p[1]) >= need) return p;
    let best: [number, number] = p, bs = -99;   // nearest spot with enough room (rings of growing radius), else the roomiest seen
    for (let r = 0.5; r <= 16; r += 0.5) {
      const n = Math.max(8, Math.round(r * 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r, q = hallsSdf(x, z);
        if (q >= need) return [x, z];
        if (q > bs) { bs = q; best = [x, z]; }
      }
    }
    return best;
  };
  const s = snap(I.start, I.hub, 6), e = snap(I.exit, I.hub, 6);
  halls.sx = s[0]; halls.sz = s[1]; halls.ex = e[0]; halls.ez = e[1];
  const fl = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1;
  halls.fx = (e[0] - s[0]) / fl; halls.fz = (e[1] - s[1]) / fl; halls.dx = halls.fx; halls.dz = halls.fz;
  // station: the roomiest spot within 8 m of the hub (a chest / fountain stands there)
  let best = -1, bx = 0, bz = 0;
  for (let a = -12; a <= 12; a += 1) for (let b = -12; b <= 12; b += 1) {
    if (a * a + b * b > 144) continue;
    const q = hallsSdf(a, b);
    if (q > best) { best = q; bx = a; bz = b; }
  }
  halls.stx = bx; halls.stz = bz;
  // portal slots spread across the exit: widest lateral reach (<= 5.6) that keeps both ends on open floor
  let lat = 5.6;
  while (lat > 2 && (hallsSdf(e[0] - halls.dz * lat, e[1] + halls.dx * lat) < 2.5 || hallsSdf(e[0] + halls.dz * lat, e[1] - halls.dx * lat) < 2.5)) lat -= 0.4;
  halls.exitHalf = lat + 3.4;
  // boss-shortcut door: back from the exit along the journey
  halls.scx = e[0]; halls.scz = e[1];
  for (const t of [9, 7.5, 6]) { const x = e[0] - halls.dx * t, z = e[1] - halls.dz * t; if (hallsSdf(x, z) >= 3.5) { halls.scx = x; halls.scz = z; break; } }
}
