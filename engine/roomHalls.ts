// ============================================================================
// HALLS room layouts: organic dungeon floor plans (rounded clearings joined by curving passages, tree / rock / column islands).
// Unlike the star-convex outlines of roomShape.ts, a halls room is a WALKABLE MASK: a 0.5 m grid (open / blocked) built from a
// distance field of soft blobs + bezier passages (+ noise wobble), plus an exact signed distance field (sdf > 0 = metres inside the
// open floor, < 0 = metres inside the blocked ground). Everything that clamps or collides asks the mask: hallsPush (slide along the
// edge), hallsSegClear (line of sight / projectile paths), hallsSdf (placement margins). The edge is dressed by render/HallsBorder.tsx
// (trees / rocks, or nothing but darkness + round columns in Marble Halls). Layouts: ~80% procedural (roomHallsGen.ts), else one of six fixed designs (DESIGNS below). Passages are >= 5 m wide
// (a hard core is stamped so the wobble can never pinch one shut), chambers 20-30 m. Pure TS; all buffers preallocated.
// ============================================================================

import { genHalls, pickCount, bez, classOfR, type GenOut } from './roomHallsGen';

/** 'RANDOM' = a procedural plan (engine/roomHallsGen.ts); the others are the fixed templates (COLUMNS = the fixed castle) */
export type HallsVariant = 'TWIN' | 'FROZEN' | 'DUNES' | 'COLUMNS' | 'CROSS' | 'CRESCENT' | 'RANDOM';

export const HC = 0.5;                 // cell size (m)
const MAX_W = 480;                     // grid cells per side (240 m): the long Marble Halls chains are ~210 m end to end
const PAD = 12;                        // blocked border (cells)
const MAXN = MAX_W * MAX_W;

export const halls = {
  on: false, version: 0, variant: 'TWIN' as HallsVariant,
  w: 0, h: 0, x0: 0, z0: 0,
  open: new Uint8Array(MAXN),
  /** 1 = open cell inside a passage and outside every chamber (Coral Isles: a plank bridge over the sea) */
  bridge: new Uint8Array(MAXN),
  /** passage segments that are bridges: flat ax, az, bx, bz, half width */
  bridgeSegs: [] as number[],
  sdf: new Float32Array(MAXN),
  /** arrival, station, exit centre, boss-shortcut spot, exit direction (unit), overall start->exit direction. */
  sx: 0, sz: 0, stx: 0, stz: 0, ex: 0, ez: 0, scx: 0, scz: 0, dx: 0, dz: -1, fx: 0, fz: -1,
  /** unwalkable islands inside the floor (clumps / columns): x, z, radius */
  islands: [] as [number, number, number][],
  /** points that must stay clear of props (passage mouths): x, z, r triples. */
  keep: [] as [number, number, number][],
  /** castle halls (Marble): statue spots (also in `islands`, r 1.5) and arch doorways x, z, facing (rad) */
  statues: [] as [number, number][], arches: [] as [number, number, number][],
  /** dead-end pockets (off the shortest start -> exit route): x, z, detour (m) - best first, at most 2 */
  pockets: [] as [number, number, number][],
  /** the chambers ("sacs"): centre x, z and the smaller half axis (m). director: monsters fill them one by one, nearest the arrival first */
  chambers: [] as [number, number, number][],
  /** size class of each chamber (parallel to `chambers`): 0 small, 1 medium, 2 big */
  classes: [] as number[],
  /** linear route (owner 2026-10-25): chamber indexes in visiting order, start chamber first, exit chamber last, a dead-end pocket right after the chamber it hangs off */
  order: [] as number[],
  /** the procedural generator gave up for this seed and a fixed template was used (stats / QA) */
  fellBack: false,
  /** points along the passage centre lines (>= 9 m from the start / exit, ~10 m apart): some monsters are placed here (director.pickAnchor) */
  passPts: [] as [number, number][],
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

/** Is (x, z) on a passage cell outside every chamber (a bridge in the Coral Isles)? */
export function hallsBridge(x: number, z: number): boolean {
  const i = Math.floor((x - halls.x0) / HC), j = Math.floor((z - halls.z0) / HC);
  return i >= 0 && j >= 0 && i < halls.w && j < halls.h && halls.bridge[j * halls.w + i] === 1;
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

/** A random open spot >= `margin` m from every edge (rejection sampling over the grid box); false when none was found. Callers do their own spacing checks. */
export function hallsRandomSpot(margin: number, out: [number, number]): boolean {
  const gw = halls.w * HC, gh = halls.h * HC;
  for (let t = 0; t < 400; t++) {
    const x = halls.x0 + Math.random() * gw, z = halls.z0 + Math.random() * gh;
    if (hallsSdf(x, z) >= margin) { out[0] = x; out[1] = z; return true; }
  }
  return false;
}

/** Open-floor test with a margin in metres (placement helpers). */
export function hallsInside(x: number, z: number, margin: number): boolean { return hallsSdf(x, z) >= margin; }

/** Placement margin for a star-convex `margin` request: props stay out of passages (>= 3.2 m from every edge). */
export function placeMargin(margin: number): number { return Math.max(3.2, Math.min(margin, 6)); }

// ------------------------------------------------------------------ designs ---
type Blob = [number, number, number, number, number, number, number?];   // cx, cz, rx, rz, rotation (deg), kidney bend, [corner radius: > 0 = rounded rectangle (castle hall) with half sizes rx, rz]
type Path = { c: [number, number][]; w0: number; w1: number };   // cubic bezier control points + start / end width
interface Design {
  blobs: Blob[]; paths: Path[]; islands: [number, number, number][];
  start: [number, number]; exit: [number, number]; hub: [number, number];
  target: [number, number];     // wanted floor area range (m2); positions are scaled to hit it
  /** castle halls: straight passages, no wobble, quarter-turn rotation; optional statue spots (each kept at random) and arch doorways x, z, facing (deg) */
  castle?: boolean; statues?: [number, number][]; arches?: [number, number, number][];
}

const DESIGNS: Record<Exclude<HallsVariant, 'COLUMNS' | 'RANDOM'>, Design> = {
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
    start: [-28, -24], exit: [26, 22], hub: [0, -10], target: [1600, 2000],
  },
};


/** Marble Halls (indoors in the castle), generated per room: four rectangular halls (softened corners) joined by STRAIGHT passages with arch
 *  doorways, rows of columns along the long walls, statue spots at the hall ends. The halls are ~2x the old floor area (~4700 m2 in all) and the
 *  passages 1.5x - 4x longer than the old ~12 m (18 - 48 m, capped so the whole chain stays within ~100 m of the hub). The chain runs along z:
 *  start hall -> passage 1 -> middle hall (the hub) -> passage 2 -> exit hall, plus a side hall (dead-end pocket) off the middle hall via passage 3.
 *  Only the walls / dark void outside; see render/HallsMarble.tsx. */
function castleDesign(rnd: () => number): Design {
  const R = (a: number, b: number): number => a + rnd() * (b - a);
  const BASE = 12, W = 8.4, CAP = 88;
  const h1 = { hx: R(21, 27), hz: R(11, 13.5) }, h2 = { hx: R(27, 33), hz: R(14, 17) }, h3 = { hx: R(20, 26), hz: R(11, 13.5) }, h4 = { hx: R(11, 14), hz: R(9, 11) };
  const L1 = Math.min(BASE * R(1.5, 4), CAP - h2.hz - 2 * h1.hz), L2 = Math.min(BASE * R(1.5, 4), CAP - h2.hz - 2 * h3.hz);
  const side = rnd() < 0.5 ? -1 : 1, L3 = Math.min(BASE * R(1.5, 3.2), CAP - h2.hx - 2 * h4.hx);
  const c1z = -(h2.hz + L1 + h1.hz), c3z = h2.hz + L2 + h3.hz, c4x = side * (h2.hx + L3 + h4.hx);
  const o1 = R(-5, 5), o3 = R(-5, 5), o2 = 0;                       // halls sit a little off the axis; the passages stay straight
  const p1 = (o1 + o2) / 2, p2 = (o2 + o3) / 2;                       // passage lane x (inside both halls)
  const blobs: Blob[] = [[o1, c1z, h1.hx, h1.hz, 0, 0, 4], [o2, 0, h2.hx, h2.hz, 0, 0, 4], [o3, c3z, h3.hx, h3.hz, 0, 0, 4], [c4x, 0, h4.hx, h4.hz, 0, 0, 3]];
  const line = (x0: number, z0: number, x1: number, z1: number): Path => ({ c: [[x0, z0], [x0 + (x1 - x0) / 3, z0 + (z1 - z0) / 3], [x0 + (x1 - x0) * 2 / 3, z0 + (z1 - z0) * 2 / 3], [x1, z1]], w0: W, w1: W });
  const paths: Path[] = [line(p1, c1z + h1.hz - 2, p1, -h2.hz + 2), line(p2, h2.hz - 2, p2, c3z - h3.hz + 2), line(side * (h2.hx - 2), 0, side * (h2.hx + L3 + 2), 0)];
  const islands: [number, number, number][] = [];
  for (const [cx, cz, hx, hz] of [[o1, c1z, h1.hx, h1.hz], [o2, 0, h2.hx, h2.hz], [o3, c3z, h3.hx, h3.hz]]) {
    for (const rz of [-1, 1]) for (let x = 8; x <= hx - 7; x += 8) for (const sx of [-1, 1]) islands.push([cx + sx * x, cz + rz * (hz - 5), 0.85]);
  }
  // arch doorways: both ends of every passage plus one about every 14 m between
  const arches: [number, number, number][] = [];
  const lane = (x: number, za: number, zb: number, deg: number, alongX: boolean): void => {
    const n = Math.max(1, Math.round(Math.abs(zb - za) / 14));
    for (let k = 0; k <= n; k++) { const t = k / n, d = za + (zb - za) * t, e = k === 0 ? 1 : k === n ? -1 : 0, q = d + e * 1.2 * Math.sign(zb - za); arches.push(alongX ? [q, x, deg] : [x, q, deg]); }
  };
  lane(p1, c1z + h1.hz - 1, -h2.hz + 1, 0, false); lane(p2, h2.hz - 1, c3z - h3.hz + 1, 0, false); lane(0, side * (h2.hx - 1), side * (h2.hx + L3 + 1), 90, true);
  const statues: [number, number][] = [[o2 + h2.hx - 4, 0], [o2 - h2.hx + 4, 0], [c4x + side * (h4.hx - 4), 0], [o3, c3z + h3.hz - 3], [o1, c1z - h1.hz + 3]];
  return {
    castle: true, blobs, paths, islands, statues, arches,
    start: [o1, c1z - h1.hz + 6], exit: [o3 - 3, c3z + h3.hz - 6], hub: [0, 0], target: [0, 0],
  };
}

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
  blobs: { x: number; z: number; rx: number; rz: number; c: number; s: number; kid: number; box: number; hx: number; hz: number; cls?: number }[];
  segs: number[];            // flat: ax, az, bx, bz, halfWidth
  islands: [number, number, number][]; statues: [number, number][]; arches: [number, number, number][];
  start: [number, number]; exit: [number, number]; hub: [number, number];
  keep: [number, number, number][]; castle: boolean; order?: number[];
  mnx: number; mnz: number; mxx: number; mxz: number;
}

function instantiate(D: Design, rnd: () => number, scale: number, ang: number, mirror: boolean): Inst {
  const ca = Math.cos(ang), sa = Math.sin(ang), castle = !!D.castle;
  const hubP = D.hub;
  const T = (x: number, z: number): [number, number] => {   // plan -> world: scale about the hub, mirror, rotate
    let px = (x - hubP[0]) * scale, pz = (z - hubP[1]) * scale;
    if (mirror) px = -px;
    return [px * ca - pz * sa, px * sa + pz * ca];
  };
  const out: Inst = { blobs: [], segs: [], islands: [], statues: [], arches: [], start: [0, 0], exit: [0, 0], hub: [0, 0], keep: [], castle, mnx: 1e9, mnz: 1e9, mxx: -1e9, mxz: -1e9 };
  const ext = (x: number, z: number, r: number): void => { out.mnx = Math.min(out.mnx, x - r); out.mnz = Math.min(out.mnz, z - r); out.mxx = Math.max(out.mxx, x + r); out.mxz = Math.max(out.mxz, z + r); };
  for (const b of D.blobs) {
    const jx = castle ? 0 : (rnd() - 0.5) * 4, jz = castle ? 0 : (rnd() - 0.5) * 4, js = castle ? 1 : 0.92 + rnd() * 0.16;
    const [x, z] = T(b[0] + jx, b[1] + jz);
    const rot = (mirror ? -b[4] : b[4]) * Math.PI / 180 + ang, rx = b[2] * scale * js, rz = b[3] * scale * (castle ? 1 : 0.94 + rnd() * 0.12);
    out.blobs.push({ x, z, rx, rz, c: Math.cos(rot), s: Math.sin(rot), kid: mirror ? -b[5] : b[5], box: (b[6] ?? 0) * scale, hx: rx, hz: rz });
    if (castle) {   // a rectangle: its exact rotated bounding box (the grid is large enough for the long chain only when tight)
      const ex = Math.abs(rx * Math.cos(rot)) + Math.abs(rz * Math.sin(rot)) + 2, ez = Math.abs(rx * Math.sin(rot)) + Math.abs(rz * Math.cos(rot)) + 2;
      out.mnx = Math.min(out.mnx, x - ex); out.mxx = Math.max(out.mxx, x + ex); out.mnz = Math.min(out.mnz, z - ez); out.mxz = Math.max(out.mxz, z + ez);
    } else ext(x, z, Math.max(rx, rz) * 1.2 + 3);
  }
  for (const p of D.paths) {
    const pts: [number, number][] = p.c.map((q, i) => T(q[0] + (i > 0 && i < 3 && !castle ? (rnd() - 0.5) * 5 : 0), q[1] + (i > 0 && i < 3 && !castle ? (rnd() - 0.5) * 5 : 0)));
    let px = 0, pz = 0;
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
      const x = a * pts[0][0] + b * pts[1][0] + c * pts[2][0] + d * pts[3][0], z = a * pts[0][1] + b * pts[1][1] + c * pts[2][1] + d * pts[3][1];
      if (i > 0) out.segs.push(px, pz, x, z, (p.w0 + (p.w1 - p.w0) * t) / 2);
      px = x; pz = z; ext(x, z, castle ? 5 : 6);
    }
    out.keep.push([pts[0][0], pts[0][1], 5.5], [pts[3][0], pts[3][1], 5.5]);
  }
  for (const i of D.islands) {   // (an island never sits in a passage mouth)
    const [x, z] = T(i[0], i[1]);
    if (out.keep.some((k) => Math.hypot(x - k[0], z - k[1]) < i[2] + 5.5)) continue;
    out.islands.push([x, z, i[2]]); ext(x, z, i[2] + 2);
  }
  if (D.statues) for (const st of D.statues) {   // (castle: a few of the statue spots, at random: not every hall has one)
    if (rnd() > 0.3 || out.statues.length >= 2) continue;
    const [x, z] = T(st[0], st[1]);
    if (out.keep.some((k) => Math.hypot(x - k[0], z - k[1]) < 1.5 + 6.5)) continue;   // (never in a passage mouth)
    out.islands.push([x, z, 1.5]); out.statues.push([x, z]); ext(x, z, 3);
  }
  if (D.arches) for (const a of D.arches) { const [x, z] = T(a[0], a[1]); out.arches.push([x, z, a[2] * Math.PI / 180 - ang]); }
  out.start = T(D.start[0], D.start[1]); out.exit = T(D.exit[0], D.exit[1]); out.hub = T(D.hub[0], D.hub[1]);
  return out;
}

/** Procedural plan -> instance (world = plan: the hub chamber is at the origin) */
function instFromGen(G: GenOut): Inst {
  const out: Inst = { blobs: [], segs: [], islands: [], statues: [], arches: [], start: [G.start[0], G.start[1]], exit: [G.exit[0], G.exit[1]], hub: [0, 0], keep: [], castle: G.castle, order: G.order, mnx: 1e9, mnz: 1e9, mxx: -1e9, mxz: -1e9 };
  const ext = (x: number, z: number, r: number): void => { out.mnx = Math.min(out.mnx, x - r); out.mnz = Math.min(out.mnz, z - r); out.mxx = Math.max(out.mxx, x + r); out.mxz = Math.max(out.mxz, z + r); };
  for (const b of G.blobs) {
    out.blobs.push({ x: b.x, z: b.z, rx: b.rx, rz: b.rz, c: Math.cos(b.rot), s: Math.sin(b.rot), kid: b.kid, box: b.box, hx: b.rx, hz: b.rz, cls: b.cls });
    if (G.castle) { out.mnx = Math.min(out.mnx, b.x - b.rx - 2); out.mxx = Math.max(out.mxx, b.x + b.rx + 2); out.mnz = Math.min(out.mnz, b.z - b.rz - 2); out.mxz = Math.max(out.mxz, b.z + b.rz + 2); }
    else ext(b.x, b.z, Math.max(b.rx, b.rz) * 1.2 + 3);
  }
  for (const p of G.paths) {
    let px = 0, pz = 0;
    const N = 36, t4: [number, number] = [0, 0];
    for (let i = 0; i <= N; i++) {
      bez(p.c, i / N, t4);
      if (i > 0) out.segs.push(px, pz, t4[0], t4[1], p.w / 2);
      px = t4[0]; pz = t4[1]; ext(px, pz, G.castle ? 5 : 6);
    }
    out.keep.push([p.c[0][0], p.c[0][1], 5.5], [p.c[3][0], p.c[3][1], 5.5]);
  }
  for (const i of G.islands) { out.islands.push([i[0], i[1], i[2]]); ext(i[0], i[1], i[2] + 2); }
  for (const s of G.statues) out.statues.push([s[0], s[1]]);
  for (const a of G.arches) out.arches.push([a[0], a[1], a[2]]);
  return out;
}

const MAX_EXTENT = 102;
/** Is the rasterised procedural plan playable? Every chamber reachable from the arrival, exit reachable, start / exit / station with room, extent inside the buffer. */
function genOk(G: GenOut): boolean {
  if (halls.extent > MAX_EXTENT || halls.w >= MAX_W || halls.h >= MAX_W) return false;
  if (hallsSdf(halls.sx, halls.sz) < 4.5 || hallsSdf(halls.ex, halls.ez) < 4.5 || hallsSdf(halls.stx, halls.stz) < 3.4) return false;
  const a = cellOf(halls.sx, halls.sz), b = cellOf(halls.ex, halls.ez), w = halls.w, O = halls.open;
  if (!O[a] || !O[b]) return false;
  bfs(a, gdS);
  if (gdS[b] < 0) return false;
  for (const ch of halls.chambers) {   // (the nearest open cell to every chamber centre, within 4 m, must be reachable)
    let ok = false;
    const ci = Math.floor((ch[0] - halls.x0) / HC), cj = Math.floor((ch[1] - halls.z0) / HC);
    for (let dj = -8; dj <= 8 && !ok; dj++) for (let di = -8; di <= 8; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= w || j >= halls.h) continue;
      const k = j * w + i;
      if (O[k] && gdS[k] >= 0 && halls.sdf[k] > 2) { ok = true; break; }
    }
    if (!ok) return false;
  }
  void G;
  return true;
}

/** Builds the mask for a room of nominal radius R. Fills `halls` (origin = hub).
 *  ~80% of the rooms (85% in Marble Halls) get a procedural plan (roomHallsGen.ts: random chamber count / size classes / connections), the rest
 *  one of the fixed templates; `force` = 'RANDOM' always generates. A plan the checks reject is regenerated (tighter) up to 40 times, then the template. */
export function buildHallsLayout(type: string, R: number, seed: number, style: string, name: string, force?: HallsVariant): void {
  void R;
  const rnd = mulberry(seed ^ 0x3c6ef372);
  const marble = style === 'MARBLE';
  const tplVariant = force && force !== 'RANDOM' ? force : pickVariant(style, name, rnd);
  const useGen = force === 'RANDOM' || !force;   // (owner 2026-10-25: maps are linear -> always the procedural chain; the fixed templates remain only as a QA force / last-resort fallback)
  halls.fellBack = false;
  if (useGen) {
    const count = pickCount(mulberry(seed ^ 0x1b873593), type);   // (chosen once; later attempts lose a chamber when the plan will not fit)
    for (let attempt = 0; attempt < 40; attempt++) {
      const G = genHalls(mulberry((seed ^ 0x7f4a7c15) + attempt * 0x9e3779b1), type, marble, attempt, Math.max(2, count - (attempt >= 28 ? 2 : attempt >= 16 ? 1 : 0)));
      if (!G) continue;
      const I = instFromGen(G);
      rasterise(I, seed);
      finishPoints(I);
      if (!genOk(G)) continue;
      findPockets();
      findPassPts(I);
      halls.variant = 'RANDOM';
      halls.on = true; halls.version++;
      return;
    }
    halls.fellBack = true;
  }
  const variant: HallsVariant = tplVariant === 'RANDOM' ? (marble ? 'COLUMNS' : 'TWIN') : tplVariant;
  const D = variant === 'COLUMNS' ? castleDesign(mulberry(seed ^ 0xca571e)) : DESIGNS[variant as Exclude<HallsVariant, 'COLUMNS' | 'RANDOM'>];
  const ang = D.castle ? Math.floor(rnd() * 4) * Math.PI / 2 : rnd() * Math.PI * 2, mirror = D.castle ? false : rnd() < 0.5;
  const target = D.target[0] + rnd() * (D.target[1] - D.target[0]);
  let scale = 1, I: Inst;
  for (let pass = 0; ; pass++) {
    if (D.castle) { I = instantiate(D, mulberry(seed ^ 0x51ed270b), 1, ang, mirror); rasterise(I, seed); break; }   // (the castle plan is authored at its final size)
    I = instantiate(D, mulberry(seed ^ 0x51ed270b), scale, ang, mirror);   // (same jitter every pass)
    rasterise(I, seed);
    const cap = D.castle ? 86 : 76;   // (Marble Halls are the biggest layouts)
    let ns = Math.min(D.castle ? 1.45 : 1.3, Math.max(0.7, scale * Math.sqrt(target / Math.max(100, halls.area))));
    if (halls.extent * (ns / scale) > cap) ns = (scale * cap) / halls.extent;
    if (pass >= 2 || Math.abs(ns / scale - 1) < 0.04 && halls.extent <= cap) break;
    scale = ns;
  }
  finishPoints(I);
  findPockets();
  findPassPts(I);
  halls.variant = variant;
  halls.on = true; halls.version++;
}

/** Points along the passage centre lines (inside the corridor, not in a chamber), >= 9 m from the start / exit, at least ~9 m apart. */
function findPassPts(I: Inst): void {
  halls.passPts.length = 0;
  const ns = I.segs.length / 5;
  let acc = 0;
  for (let s = 0; s < ns; s++) {
    const a = s * 5, ax = I.segs[a], az = I.segs[a + 1], bx = I.segs[a + 2], bz = I.segs[a + 3], hw = I.segs[a + 4];
    acc += Math.hypot(bx - ax, bz - az);
    if (acc < 9) continue;
    const d = hallsSdf(bx, bz);
    if (d < 2.4 || d > hw + 0.7) continue;                                   // (inside a chamber: not a passage point)
    if (Math.hypot(bx - halls.sx, bz - halls.sz) < 9 || Math.hypot(bx - halls.ex, bz - halls.ez) < 9) continue;
    if (halls.passPts.some((q) => Math.hypot(q[0] - bx, q[1] - bz) < 8)) continue;
    halls.passPts.push([bx, bz]); acc = 0;
  }
}

const gdS = new Int32Array(MAXN), gdE = new Int32Array(MAXN), gq = new Int32Array(MAXN);
/** 4-neighbour BFS over the open cells from cell `src` (distance in cells, -1 = unreachable). */
function bfs(src: number, out: Int32Array): void {
  const w = halls.w, n = w * halls.h, O = halls.open;
  out.fill(-1, 0, n);
  let h = 0, t = 0; gq[t++] = src; out[src] = 0;
  while (h < t) {
    const c = gq[h++], d = out[c] + 1;
    if (c % w > 0 && O[c - 1] && out[c - 1] < 0) { out[c - 1] = d; gq[t++] = c - 1; }
    if (c % w < w - 1 && O[c + 1] && out[c + 1] < 0) { out[c + 1] = d; gq[t++] = c + 1; }
    if (c >= w && O[c - w] && out[c - w] < 0) { out[c - w] = d; gq[t++] = c - w; }
    if (c < n - w && O[c + w] && out[c + w] < 0) { out[c + w] = d; gq[t++] = c + w; }
  }
}
const cellOf = (x: number, z: number): number => Math.floor((z - halls.z0) / HC) * halls.w + Math.floor((x - halls.x0) / HC);

/** Dead-end pockets: cells whose shortest start -> exit detour is long. Picks up to 2 spots (>= 3.4 m inside, >= 22 m apart). */
function findPockets(): void {
  halls.pockets.length = 0;
  const a = cellOf(halls.sx, halls.sz), b = cellOf(halls.ex, halls.ez), n = halls.w * halls.h, O = halls.open;
  if (!O[a] || !O[b]) return;
  bfs(a, gdS); bfs(b, gdE);
  const L = gdS[b];
  if (L < 0) return;
  // the main route = cells on a shortest start -> exit path; `edt` becomes the squared distance (cells^2) to it
  for (let c = 0; c < n; c++) edt[c] = O[c] && gdS[c] >= 0 && gdS[c] + gdE[c] <= L + 4 ? 0 : INF;
  edt2d(halls.w, halls.h);
  const need = 17 / HC;   // a pocket is >= 17 m from the route (the far corner of a big chamber is not)
  for (let k = 0; k < 2; k++) {
    let best = -1, bd = 0;
    for (let c = 0; c < n; c++) {
      if (!O[c] || gdS[c] < 0 || halls.sdf[c] < 3.4) continue;
      const d = Math.sqrt(edt[c]);
      if (d < need || d <= bd) continue;
      const x = halls.x0 + ((c % halls.w) + 0.5) * HC, z = halls.z0 + (Math.floor(c / halls.w) + 0.5) * HC;
      let ok = true;
      for (const p of halls.pockets) if (Math.hypot(p[0] - x, p[1] - z) < 22) { ok = false; break; }
      
      if (ok) { best = c; bd = d; }
    }
    if (best < 0) break;
    halls.pockets.push([halls.x0 + ((best % halls.w) + 0.5) * HC, halls.z0 + (Math.floor(best / halls.w) + 0.5) * HC, bd * HC]);
  }
}

const bdist = new Float32Array(MAXN), wob = new Float32Array(MAXN), ppass = new Float32Array(MAXN), pcore = new Float32Array(MAXN);

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
      if (B.box > 0) {   // rounded rectangle: exact distance in metres
        const qx = Math.abs(u) - (B.hx - B.box), qz = Math.abs(v) - (B.hz - B.box);
        d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - B.box);
        continue;
      }
      const q = Math.hypot(u / B.rx, v / B.rz);
      d = Math.min(d, (q - 1) * Math.min(B.rx, B.rz) * 0.9);
    }
    bdist[j * w + i] = d;   // (distance to the nearest chamber blob)
    // passages: core distance (hard-stamped open) and the soft one
    const core = pcore[j * w + i];
    d = Math.min(d, ppass[j * w + i]);
    // soft wobble: strongest deep inside / far out, small at the edge so passages keep their width
    const nz = (vnoise(x * 0.16 + p1, z * 0.16) - 0.5) * 2 * 1.3 + (vnoise(x * 0.45, z * 0.45 + p2) - 0.5) * 2 * 0.5;
    d += nz * (I.castle ? 0.12 : 1) * Math.min(1, Math.max(0.15, (-d + 2) / 6));
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
  for (let k = 0; k < w * h; k++) halls.bridge[k] = O[k] && bdist[k] > 0.8 ? 1 : 0;
  finishMask(I);
  halls.bridgeSegs.length = 0;
  for (let q = 0; q < I.segs.length; q += 5) { const mx = (I.segs[q] + I.segs[q + 2]) / 2, mz = (I.segs[q + 1] + I.segs[q + 3]) / 2; if (hallsBridge(mx, mz)) halls.bridgeSegs.push(I.segs[q], I.segs[q + 1], I.segs[q + 2], I.segs[q + 3], I.segs[q + 4]); }
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
  halls.chambers = I.blobs.map((b) => [b.x, b.z, Math.min(b.rx, b.rz)] as [number, number, number]);
  halls.classes = I.blobs.map((b) => b.cls ?? classOfR(Math.min(b.rx, b.rz)));
  if (I.order) halls.order = I.order.slice();
  else {   // fixed template (QA only): nearest the arrival first
    const ds = halls.chambers.map((c) => Math.hypot(c[0] - I.start[0], c[1] - I.start[1]));
    halls.order = halls.chambers.map((_, i) => i).sort((a, b) => ds[a] - ds[b]);
  }
  halls.keep = I.keep.slice();
  halls.statues = I.statues.slice(); halls.arches = I.arches.slice();
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
