// ============================================================================
// Procedural HALLS floor plans (build-time, pure TS, deterministic for a given rnd stream). roomHalls.ts calls `genHalls` and rasterises the
// result; when a plan is rejected (null) it asks again with the next attempt number (tighter gaps) and finally falls back to a fixed template.
//   outdoor plan: 2-6 "sacs" (chambers) = soft ellipses of a mixed SIZE CLASS (small r 8-12, medium 14-18, big 20-26 m, squished <= 1.3,
//   random rotation, kidney bend), grown as ONE LINEAR CHAIN (start = first, exit = last, no loops; owner 2026-10-25),
//   passages, curved bezier passages 6.6-10 m wide, sometimes one small dead-end pocket chamber, tree / rock islands in the chambers.
//   castle plan (Marble Halls): the same graph on axis-aligned rounded rectangles joined by STRAIGHT lanes (arch doorways), column rows
//   along the long walls, a few statue spots at free hall ends.
// All coordinates are plan coordinates with the hub chamber centre at the origin (finishPoints looks for the station within 12 m of it).
// ============================================================================

export interface GenBlob { x: number; z: number; rx: number; rz: number; rot: number; kid: number; box: number; cls: number }
export interface GenPath { c: [number, number][]; w: number }
export interface GenOut {
  blobs: GenBlob[]; paths: GenPath[]; edges: [number, number][]; castle: boolean;
  islands: [number, number, number][]; statues: [number, number][]; arches: [number, number, number][];   // arches: x, z, facing (rad)
  start: [number, number]; exit: [number, number]; hub: [number, number]; startIdx: number; exitIdx: number; pocketIdx: number;
  /** visiting order of the chambers (indexes into `blobs`): the chain start -> ... -> exit, a dead-end pocket right after the chamber it hangs off */
  order: number[];
}

/** size class radii (m): small, medium, big */
export const CLS_R: [number, number][] = [[8, 12], [14, 18], [20, 26]];
/** class of a chamber by its smaller half axis (for fixed templates / stats) */
export const classOfR = (r: number): number => (r < 13 ? 0 : r < 19.5 ? 1 : 2);

type Rnd = () => number;
const F = (reason: string): null => { void reason; return null; };   // (reason tag: handy when debugging why a plan was rejected)
const TAU = Math.PI * 2;
const hyp = Math.hypot;

export function bez(c: [number, number][], t: number, out: [number, number]): void {
  const u = 1 - t, a = u * u * u, b = 3 * t * u * u, d = 3 * t * t * u, e = t * t * t;
  out[0] = a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0]; out[1] = a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1];
}

/** chamber count: biased to 3-4; elite / treasure rooms may be smaller */
export function pickCount(rnd: Rnd, type: string): number {
  const w = type === 'COMBAT' ? [0.06, 0.3, 0.34, 0.2, 0.1] : [0.22, 0.36, 0.26, 0.1, 0.06];
  let r = rnd();
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i + 2; }
  return 4;
}

/** a mixed set of size classes (never all the same; with 4+ chambers often small AND big), and enough floor for the room type */
function pickClasses(rnd: Rnd, n: number, pocket: boolean, castle: boolean, type: string): number[] {
  const w = n >= 5 ? [0.45, 0.4, 0.15] : n === 4 ? [0.35, 0.4, 0.25] : [0.3, 0.4, 0.3];
  const cls: number[] = [];
  for (let tries = 0; tries < 30; tries++) {
    cls.length = 0;
    for (let i = 0; i < n; i++) { const r = rnd(); cls.push(r < w[0] ? 0 : r < w[0] + w[1] ? 1 : 2); }
    if (pocket) cls[n - 1] = 0;
    let mn = 2, mx = 0;
    for (const c of cls) { if (c < mn) mn = c; if (c > mx) mx = c; }
    if (mx - mn >= (n >= 4 && rnd() < 0.6 ? 2 : 1)) break;
  }
  let mn = 2, mx = 0;
  for (const c of cls) { if (c < mn) mn = c; if (c > mx) mx = c; }
  if (mx === mn) cls[0] = mx === 0 ? 2 : 0;
  // enough floor: upgrade the biggest non-big chamber (keeps the spread) while the sum of the nominal areas is low
  const area = (k: number): number => (castle ? [150, 310, 600][k] : [310, 800, 1650][k]);
  const need = type === 'COMBAT' ? (castle ? 1150 : 1250) : (castle ? 700 : 750);
  for (let g = 0; g < 8; g++) {
    let a = 0; for (const c of cls) a += area(c);
    if (a >= need) break;
    let bi = -1; for (let i = 0; i < n; i++) if (!(pocket && i === n - 1) && cls[i] < 2 && (bi < 0 || cls[i] > cls[bi])) bi = i;
    if (bi < 0) break;
    cls[bi]++;
  }
  return cls;
}

/** radius of a blob (ellipse) along world angle `a` from its centre, with a little extra for the kidney bend */
function dirR(b: GenBlob, a: number): number {
  const p = a - b.rot, c = Math.cos(p), s = Math.sin(p);
  return (b.rx * b.rz / Math.sqrt((b.rz * c) ** 2 + (b.rx * s) ** 2)) * (1 + Math.abs(b.kid) * 0.4);
}
/** metres outside (+) / inside (-) a chamber (the rasteriser's distance for ellipses; rounded rectangles: exact) */
function blobD(b: GenBlob, x: number, z: number): number {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot), u = dx * c + dz * s;
  let v = -dx * s + dz * c;
  if (b.box > 0) {
    const qx = Math.abs(u) - (b.rx - b.box), qz = Math.abs(v) - (b.rz - b.box);
    return hyp(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - b.box;
  }
  if (b.kid) v += b.kid * (u / b.rx) * (u / b.rx) * b.rz;
  return (hyp(u / b.rx, v / b.rz) - 1) * Math.min(b.rx, b.rz) * 0.9 - Math.abs(b.kid) * b.rz * 0.5;
}

const NS = 14, tmp: [number, number] = [0, 0];
interface PathRec { c: [number, number][]; w: number; a: number; b: number; pts: number[]; }   // pts: flat sample x, z

function samplePath(c: [number, number][], out: number[]): void {
  out.length = 0;
  for (let i = 0; i <= NS; i++) { bez(c, i / NS, tmp); out.push(tmp[0], tmp[1]); }
}

/** does the passage run clear of every other chamber and of unrelated passages? */
function pathClear(c: [number, number][], w: number, blobs: GenBlob[], np: number, ia: number, ib: number, others: PathRec[], castle: boolean): boolean {
  const pts: number[] = []; samplePath(c, pts);
  const hw = w / 2;
  for (let i = 1; i < NS; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    for (let k = 0; k < np; k++) { if (k === ia || k === ib) continue; if (blobD(blobs[k], x, z) < hw + (castle ? 3 : 3.2)) return false; }
    for (const o of others) {
      if (o.a === ia || o.a === ib || o.b === ia || o.b === ib) continue;
      for (let j = 0; j < o.pts.length; j += 2) if (hyp(o.pts[j] - x, o.pts[j + 1] - z) < hw + o.w / 2 + 3) return false;
    }
  }
  return true;
}

/** a curved passage between two chambers (control points pulled sideways), or null when it would cut through something */
function makeCurve(rnd: Rnd, blobs: GenBlob[], np: number, ia: number, ib: number, w: number, others: PathRec[], gs: number): [number, number][] | null {
  const A = blobs[ia], B = blobs[ib], ang = Math.atan2(B.z - A.z, B.x - A.x), ux = Math.cos(ang), uz = Math.sin(ang);
  const p0: [number, number] = [A.x + ux * (dirR(A, ang) - 2.6), A.z + uz * (dirR(A, ang) - 2.6)];
  const p3: [number, number] = [B.x - ux * (dirR(B, ang + Math.PI) - 2.6), B.z - uz * (dirR(B, ang + Math.PI) - 2.6)];
  const len = hyp(p3[0] - p0[0], p3[1] - p0[1]);
  if (len < 3) return null;
  for (let t = 0; t < 5; t++) {
    const curv = t === 4 ? 0 : (0.08 + rnd() * 0.4) * (rnd() < 0.5 ? -1 : 1), o1 = curv * len * (0.7 + rnd() * 0.6), o2 = curv * len * (rnd() < 0.5 ? -0.7 : 0.9) * (0.5 + rnd() * 0.7);
    const c: [number, number][] = [p0, [p0[0] + (p3[0] - p0[0]) / 3 - uz * o1, p0[1] + (p3[1] - p0[1]) / 3 + ux * o1], [p0[0] + (p3[0] - p0[0]) * 2 / 3 - uz * o2, p0[1] + (p3[1] - p0[1]) * 2 / 3 + ux * o2], p3];
    void gs;
    if (pathClear(c, w, blobs, np, ia, ib, others, false)) return c;
  }
  return null;
}

function hopDist(n: number, edges: [number, number][], src: number): number[] {
  const d = new Array<number>(n).fill(-1); d[src] = 0;
  const q = [src];
  for (let h = 0; h < q.length; h++) for (const e of edges) {
    const o = e[0] === q[h] ? e[1] : e[1] === q[h] ? e[0] : -1;
    if (o >= 0 && d[o] < 0) { d[o] = d[q[h]] + 1; q.push(o); }
  }
  return d;
}

/** visiting order of a chain 0..m-1 (+ optional pocket index m hanging off chamber `pp`): the pocket comes right after its parent */
function chainOrder(m: number, pocket: number, pp: number): number[] {
  const o: number[] = [];
  for (let i = 0; i < m; i++) { o.push(i); if (pocket >= 0 && i === pp) o.push(pocket); }
  return o;
}

/** the hub chamber (origin): a middle chamber near the centroid; with 2 chambers the exit one */
function pickHub(blobs: GenBlob[], si: number, ei: number, pocket: number): number {
  const n = blobs.length;
  if (n === 2) return ei;
  let cx = 0, cz = 0; for (const b of blobs) { cx += b.x; cz += b.z; }
  cx /= n; cz /= n;
  let best = -1, bd = 1e9;
  for (let i = 0; i < n; i++) {
    if (i === si || i === ei || i === pocket) continue;
    const d = hyp(blobs[i].x - cx, blobs[i].z - cz) - blobs[i].rz * 0.3;
    if (d < bd) { bd = d; best = i; }
  }
  return best >= 0 ? best : (si === 0 ? 1 : 0);
}

function shiftAll(G: GenOut, dx: number, dz: number): void {
  for (const b of G.blobs) { b.x -= dx; b.z -= dz; }
  for (const p of G.paths) for (const q of p.c) { q[0] -= dx; q[1] -= dz; }
  for (const q of G.islands) { q[0] -= dx; q[1] -= dz; }
  for (const q of G.statues) { q[0] -= dx; q[1] -= dz; }
  for (const q of G.arches) { q[0] -= dx; q[1] -= dz; }
  G.start[0] -= dx; G.start[1] -= dz; G.exit[0] -= dx; G.exit[1] -= dz;
}

/** start / exit spot of chamber `i`: pushed away from its passages */
function endSpot(G: { blobs: GenBlob[]; edges: [number, number][]; paths: GenPath[] }, i: number, rnd: Rnd): [number, number] {
  const B = G.blobs[i];
  let sx = 0, sz = 0;
  for (let k = 0; k < G.edges.length; k++) {
    const e = G.edges[k];
    if (e[0] !== i && e[1] !== i) continue;
    const o = G.blobs[e[0] === i ? e[1] : e[0]], d = hyp(o.x - B.x, o.z - B.z) || 1;
    sx += (o.x - B.x) / d; sz += (o.z - B.z) / d;
  }
  let a = Math.atan2(-sz, -sx);
  if (hyp(sx, sz) < 0.2) a = rnd() * TAU;
  const reach = B.box > 0 ? Math.min(B.rx, B.rz) - 7 : dirR(B, a) - 8.5;
  const off = Math.max(0, Math.min(reach * 0.75, 14));
  return [B.x + Math.cos(a) * off, B.z + Math.sin(a) * off];
}

// ----------------------------------------------------------------------------- outdoor plan
function genOutdoor(rnd: Rnd, type: string, attempt: number, count: number): GenOut | null {
  const R = (a: number, b: number): number => a + rnd() * (b - a);
  const n = count, pocket = n >= 4 && rnd() < 0.4 ? n - 1 : -1, m = pocket >= 0 ? n - 1 : n;
  let pocketParent = -1;
  const cls = pickClasses(rnd, n, pocket >= 0, false, type);
  const gs = 1 - Math.min(0.4, attempt * 0.02);
  const blobs: GenBlob[] = [];
  for (let i = 0; i < n; i++) {
    const r = R(CLS_R[cls[i]][0], CLS_R[cls[i]][1]), sq = 1 + rnd() * (cls[i] === 2 ? 0.22 : 0.3);
    blobs.push({ x: 0, z: 0, rx: r * sq, rz: r, rot: rnd() * TAU, kid: cls[i] >= 1 ? (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.2, box: 0, cls: cls[i] });
  }
  // LINEAR map: chamber i is attached to i-1 (a gentle turn from the previous direction); the pocket hangs off a middle chamber
  let prevA = rnd() * TAU;
  const deg = new Array<number>(n).fill(0), edges: [number, number][] = [], recs: PathRec[] = [], angs: number[][] = blobs.map(() => []);
  for (let i = 1; i < n; i++) {
    let ok = false;
    for (let tries = 0; tries < 70 && !ok; tries++) {
      const isPk = i === pocket, p = isPk ? Math.floor(rnd() * (m - 1)) : i - 1;
      if (deg[p] >= (blobs[p].cls === 0 ? 2 : 3)) continue;
      const a = isPk || i === 1 ? rnd() * TAU : prevA + R(-1.5, 1.5);
      let crowd = false; for (const q of angs[p]) { let d = Math.abs(a - q) % TAU; if (d > Math.PI) d = TAU - d; if (d < 0.8) crowd = true; }
      if (crowd) continue;
      const P = blobs[p], C = blobs[i], gap = (n === 2 ? R(16, 30) : R(9, 26)) * gs;
      const dist = dirR(P, a) + dirR(C, a + Math.PI) + gap;
      C.x = P.x + Math.cos(a) * dist; C.z = P.z + Math.sin(a) * dist;
      let bad = false;
      for (let k = 0; k < i && !bad; k++) {
        if (k === p) continue;
        const O = blobs[k], ak = Math.atan2(O.z - C.z, O.x - C.x);
        if (hyp(O.x - C.x, O.z - C.z) < dirR(C, ak) + dirR(O, ak + Math.PI) + 8) bad = true;
      }
      if (bad) continue;
      for (const o of recs) { for (let j = 0; j < o.pts.length && !bad; j += 2) if (blobD(C, o.pts[j], o.pts[j + 1]) < o.w / 2 + 3.5) bad = true; if (bad) break; }
      if (bad) continue;
      const w = R(6.6, 10), c = makeCurve(rnd, blobs, i + 1, p, i, w, recs, gs);
      if (!c) continue;
      const rec: PathRec = { c, w, a: p, b: i, pts: [] }; samplePath(c, rec.pts);
      recs.push(rec); edges.push([p, i]); deg[p]++; deg[i]++; angs[p].push(a); angs[i].push(a + Math.PI);
      if (isPk) pocketParent = p; else prevA = a;
      ok = true;
    }
    if (!ok) return F('o1');
  }
  const si = 0, ei = m - 1;
  if (hyp(blobs[si].x - blobs[ei].x, blobs[si].z - blobs[ei].z) < (n === 2 ? 30 : 40)) return F('o3');
  const hub = pickHub(blobs, si, ei, pocket);
  const G: GenOut = {
    blobs, paths: recs.map((r) => ({ c: r.c, w: r.w })), edges, castle: false, islands: [], statues: [], arches: [],
    start: [0, 0], exit: [0, 0], hub: [0, 0], startIdx: si, exitIdx: ei, pocketIdx: pocket, order: chainOrder(m, pocket, pocketParent),
  };
  G.start = endSpot(G, si, rnd); G.exit = endSpot(G, ei, rnd);
  shiftAll(G, blobs[hub].x, blobs[hub].z);
  for (const b of blobs) if (hyp(b.x, b.z) + Math.max(b.rx, b.rz) * 1.05 + 3 > 92) return F('o4');
  // islands (tree / rock clumps), away from the passage mouths, start, exit and the station area
  const mouths: [number, number][] = []; for (const p of G.paths) mouths.push(p.c[0], p.c[3]);
  for (let i = 0; i < n; i++) {
    const B = blobs[i], k = B.cls === 0 ? (rnd() < 0.4 ? 1 : 0) : B.cls === 1 ? Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
    for (let m = 0; m < k; m++) {
      const ir = B.cls === 0 ? R(1.8, 2.3) : B.cls === 1 ? R(2, 3) : R(2.6, 4);
      for (let t = 0; t < 24; t++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.62, lx = Math.cos(a) * rr * B.rx, lz = Math.sin(a) * rr * B.rz;
        const x = B.x + lx * Math.cos(B.rot) - lz * Math.sin(B.rot), z = B.z + lx * Math.sin(B.rot) + lz * Math.cos(B.rot);
        if (blobD(B, x, z) > -(ir + 4.2)) continue;
        if (mouths.some((q) => hyp(q[0] - x, q[1] - z) < ir + 6.5) || hyp(x - G.start[0], z - G.start[1]) < ir + 7 || hyp(x - G.exit[0], z - G.exit[1]) < ir + 7 || hyp(x, z) < ir + 6) continue;
        if (G.islands.some((q) => hyp(q[0] - x, q[1] - z) < q[2] + ir + 3.4)) continue;
        G.islands.push([x, z, ir]); break;
      }
    }
  }
  return G;
}

// ----------------------------------------------------------------------------- castle plan (axis-aligned rounded rectangles + straight lanes)
const HALL: [number, number][][] = [[[10, 13], [8, 10]], [[18, 23], [11.5, 14]], [[24, 29], [15, 18]]];   // per class: hx range, hz range
interface Corr { x0: number; z0: number; x1: number; z1: number; a: number; b: number; w: number; alongX: boolean; lane: number; ea: number; eb: number }
const hit = (a: { x0: number; z0: number; x1: number; z1: number }, b: { x0: number; z0: number; x1: number; z1: number }, m: number): boolean => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const rectOf = (b: GenBlob): { x0: number; z0: number; x1: number; z1: number } => ({ x0: b.x - b.rx, z0: b.z - b.rz, x1: b.x + b.rx, z1: b.z + b.rz });

/** straight lane between facing sides of halls a and b (side s of a faces b), or null */
function laneBetween(rnd: Rnd, blobs: GenBlob[], np: number, a: number, b: number, s: number, w: number, corrs: Corr[]): Corr | null {
  const A = blobs[a], B = blobs[b], alongX = s < 2, sg = s % 2 === 0 ? 1 : -1;
  let lo: number, hi: number, e0: number, e1: number;
  if (alongX) { lo = Math.max(A.z - A.rz, B.z - B.rz) + 4 + w / 2; hi = Math.min(A.z + A.rz, B.z + B.rz) - 4 - w / 2; e0 = A.x + sg * A.rx; e1 = B.x - sg * B.rx; }
  else { lo = Math.max(A.x - A.rx, B.x - B.rx) + 4 + w / 2; hi = Math.min(A.x + A.rx, B.x + B.rx) - 4 - w / 2; e0 = A.z + sg * A.rz; e1 = B.z - sg * B.rz; }
  if (hi < lo || (e1 - e0) * sg < 8) return F('o5');
  const lane = lo + (hi - lo) * (0.5 + (rnd() - 0.5) * 0.9);
  const c: Corr = alongX
    ? { x0: Math.min(e0, e1), x1: Math.max(e0, e1), z0: lane - w / 2 - 3, z1: lane + w / 2 + 3, a, b, w, alongX, lane, ea: e0, eb: e1 }
    : { z0: Math.min(e0, e1), z1: Math.max(e0, e1), x0: lane - w / 2 - 3, x1: lane + w / 2 + 3, a, b, w, alongX, lane, ea: e0, eb: e1 };
  for (let k = 0; k < np; k++) if (k !== a && k !== b && hit(c, rectOf(blobs[k]), 3)) return F('o6');
  for (const o of corrs) { if (o.a === a || o.b === a || o.a === b || o.b === b) continue; if (hit(c, o, 2)) return F('o7'); }
  return c;
}

function genCastle(rnd: Rnd, type: string, attempt: number, count: number): GenOut | null {
  const R = (a: number, b: number): number => a + rnd() * (b - a);
  const n = count, pocket = n >= 4 && rnd() < 0.4 ? n - 1 : -1, m = pocket >= 0 ? n - 1 : n;
  let pocketParent = -1;
  const cls = pickClasses(rnd, n, pocket >= 0, true, type);
  const gs = 1 - Math.min(0.4, attempt * 0.02);
  const blobs: GenBlob[] = [];
  for (let i = 0; i < n; i++) { const H = HALL[cls[i]]; blobs.push({ x: 0, z: 0, rx: R(H[0][0], H[0][1]), rz: R(H[1][0], H[1][1]), rot: 0, kid: 0, box: 4, cls: cls[i] }); }
  const used = new Array<number>(n).fill(0), edges: [number, number][] = [], corrs: Corr[] = [];
  for (let i = 1; i < n; i++) {
    let ok = false;
    for (let tries = 0; tries < 80 && !ok; tries++) {
      const isPk = i === pocket, p = isPk ? Math.floor(rnd() * (m - 1)) : i - 1, s = Math.floor(rnd() * 4);
      if (used[p] & (1 << s)) continue;
      const P = blobs[p], C = blobs[i], w = R(7, 10), gap = (n === 2 ? R(22, 38) : R(14, 34)) * gs, sg = s % 2 === 0 ? 1 : -1;
      if (s < 2) { C.x = P.x + sg * (P.rx + gap + C.rx); C.z = P.z + (rnd() - 0.5) * 2 * Math.max(0, P.rz + C.rz - (w + 10)); }
      else { C.z = P.z + sg * (P.rz + gap + C.rz); C.x = P.x + (rnd() - 0.5) * 2 * Math.max(0, P.rx + C.rx - (w + 10)); }
      const rc = rectOf(C);
      let bad = false;
      for (let k = 0; k < i && !bad; k++) if (hit(rc, rectOf(blobs[k]), k === p ? 2 : 6)) bad = true;
      if (bad) continue;
      for (const o of corrs) if (hit(rc, o, 3)) { bad = true; break; }
      if (bad) continue;
      const cr = laneBetween(rnd, blobs, i + 1, p, i, s, w, corrs);
      if (!cr) continue;
      corrs.push(cr); edges.push([p, i]); used[p] |= 1 << s; used[i] |= 1 << (s ^ 1);
      if (isPk) pocketParent = p;
      ok = true;
    }
    if (!ok) return F('c1');
  }
  const si = 0, ei = m - 1;
  if (hyp(blobs[si].x - blobs[ei].x, blobs[si].z - blobs[ei].z) < (n === 2 ? 36 : 44)) return F('c3');
  const hub = pickHub(blobs, si, ei, pocket);
  const paths: GenPath[] = [], arches: [number, number, number][] = [];
  for (const c of corrs) {
    const sg = c.eb >= c.ea ? 1 : -1, a0 = c.ea - sg * 2, b0 = c.eb + sg * 2;
    const L = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x0 + (x1 - x0) / 3, z0 + (z1 - z0) / 3], [x0 + (x1 - x0) * 2 / 3, z0 + (z1 - z0) * 2 / 3], [x1, z1]];
    paths.push({ c: c.alongX ? L(a0, c.lane, b0, c.lane) : L(c.lane, a0, c.lane, b0), w: c.w });
    const za = c.ea - sg, zb = c.eb + sg, m = Math.max(1, Math.round(Math.abs(zb - za) / 14));
    for (let k = 0; k <= m; k++) {
      const t = k / m, d = za + (zb - za) * t, e = k === 0 ? 1 : k === m ? -1 : 0, q = d + e * 1.2 * Math.sign(zb - za);
      if (c.alongX) arches.push([q, c.lane, Math.PI / 2]); else arches.push([c.lane, q, 0]);
    }
  }
  const G: GenOut = {
    blobs, paths, edges, castle: true, islands: [], statues: [], arches,
    start: [0, 0], exit: [0, 0], hub: [0, 0], startIdx: si, exitIdx: ei, pocketIdx: pocket, order: chainOrder(m, pocket, pocketParent),
  };
  // start / exit: at the far end of a free side of their hall (else the middle)
  const spot = (i: number): [number, number] => {
    const B = blobs[i], free: number[] = []; for (let s = 0; s < 4; s++) if (!(used[i] & (1 << s))) free.push(s);
    if (!free.length) return [B.x, B.z];
    const s = free[Math.floor(rnd() * free.length)], sg = s % 2 === 0 ? 1 : -1;
    return s < 2 ? [B.x + sg * Math.max(0, B.rx - 7), B.z] : [B.x, B.z + sg * Math.max(0, B.rz - 7)];
  };
  G.start = spot(si); G.exit = spot(ei);
  shiftAll(G, blobs[hub].x, blobs[hub].z);
  for (const b of blobs) if (hyp(Math.abs(b.x) + b.rx, Math.abs(b.z) + b.rz) + 2 > 96) return F('c4');
  const mouths: [number, number][] = []; for (const p of paths) mouths.push(p.c[0], p.c[3]);
  // column rows along the long walls (not in doorways / near the start and exit), statue spots at free hall ends
  for (let i = 0; i < n; i++) {
    const B = blobs[i];
    if (B.rx < 14) continue;
    for (const rz of [-1, 1]) for (let x = 8; x <= B.rx - 7; x += 8) for (const sx of [-1, 1]) {
      const px = B.x + sx * x, pz = B.z + rz * (B.rz - 5);
      if (mouths.some((q) => hyp(q[0] - px, q[1] - pz) < 6.4) || hyp(px - G.start[0], pz - G.start[1]) < 5 || hyp(px - G.exit[0], pz - G.exit[1]) < 5) continue;
      G.islands.push([px, pz, 0.85]);
    }
  }
  for (let i = 0; i < n && G.statues.length < 2; i++) {
    if (i === si || i === ei || rnd() > 0.35) continue;
    const B = blobs[i], free: number[] = []; for (let s = 0; s < 4; s++) if (!(used[i] & (1 << s))) free.push(s);
    // (the plan is shifted already: `used` refers to the hall, not its position)
    if (!free.length) continue;
    const s = free[Math.floor(rnd() * free.length)], sg = s % 2 === 0 ? 1 : -1, x = s < 2 ? B.x + sg * (B.rx - 4) : B.x, z = s < 2 ? B.z : B.z + sg * (B.rz - 4);
    if (hyp(x, z) < 6 || hyp(x - G.start[0], z - G.start[1]) < 8 || hyp(x - G.exit[0], z - G.exit[1]) < 8 || mouths.some((q) => hyp(q[0] - x, q[1] - z) < 8)) continue;
    G.islands.push([x, z, 1.5]); G.statues.push([x, z]);
  }
  return G;
}

/** One procedural plan (or null: the caller retries with attempt + 1 and a fresh rnd stream). */
export function genHalls(rnd: Rnd, type: string, castle: boolean, attempt: number, count: number): GenOut | null {
  return castle ? genCastle(rnd, type, attempt, count) : genOutdoor(rnd, type, attempt, count);
}
