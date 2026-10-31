// ============================================================================
// The outskirts' dirt tracks as discs (pure data, no three / React): read by render/groundPath (the soil mask the ground shader paints) AND by the layout code
// (townData fences, townFill.blocked: the roadside-clearance rule) so props are measured against the SAME dirt that is drawn, not against the nominal road width.
// Roadside clearance rule (owner 2026-10-31): every prop stands >= CLEAR m outside the visible dirt edge, on its own side of the road.
// ============================================================================
/** Minimal road shape (townData RoadSpec). */
export interface DirtRoad { x1: number; z1: number; x2: number; z2: number; w: number; dirt?: boolean }

export interface Disc { x: number; z: number; r: number }

// (same helpers as render/util: copied so the engine does not import three)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function h2(x: number, y: number): number { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  const l1 = a + (b - a) * u, l2 = c + (d - c) * u;
  return l1 + (l2 - l1) * v;
}

/** The outskirts' dirt tracks (townData ROADS dirt:true): wandering a little off the straight segment, width varying, a few bare patches. */
export function dirtDiscs(ROADS: readonly DirtRoad[], wallZ1: number): Disc[] {
  const out: Disc[] = [], rnd = mulberry32(4242);
  let k = 0;
  for (const rd0 of ROADS) {
    let rd = rd0;
    if (!rd0.dirt) {   // a paved street's part beyond the wall is a dirt track too
      const z0 = wallZ1 + 2.5, a = rd0.z1, b = rd0.z2, dzz = b - a;
      if (Math.max(a, b) <= z0) continue;
      if (Math.abs(dzz) < 1e-6) { if (a < z0) continue; }
      else if (dzz > 0) { if (a < z0) rd = { ...rd0, x1: rd0.x1 + (rd0.x2 - rd0.x1) * ((z0 - a) / dzz), z1: z0 }; }   // (clip only the part inside the walls; the old code pulled EVERY paved road that starts south of z 40.5 back to z 40.5, drawing a bogus diagonal strip parallel to the forest road = the 8-10 m wide dirt the owner saw)
      else if (b < z0) rd = { ...rd0, x2: rd0.x1 + (rd0.x2 - rd0.x1) * ((z0 - a) / dzz), z2: z0 };
    }
    const dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, n = Math.max(2, Math.round(len / 0.4)), ph = k * 1.7; k++;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.sin(t * Math.PI) ** 0.6, off = (Math.sin(t * len * 0.21 + ph) * 0.7 + Math.sin(t * len * 0.53 + ph * 2) * 0.3) * 1.0 * w;
      out.push({ x: rd.x1 + dx * t + nx * off, z: rd.z1 + dz * t + nz * off, r: Math.max(0.8, rd.w * 0.5) * (0.78 + vnoise(t * len * 0.2 + ph, 5.5) * 0.5) });
    }
    // (roadside clearance 2026-10-31: the bare clearings beside a track made the mainland roads look 8+ m wide with props 'on' them: the mainland tracks (both ends south of the bridge area) keep their winding centre line but no side patches; the random draws stay so the other tracks' patches do not move)
    const bare = (d: Disc): void => { if (Math.min(rd.z1, rd.z2) <= 52.1) out.push(d); };
    if (rnd() < 0.5) { const t = 0.25 + rnd() * 0.5, sd = rnd() < 0.5 ? -1 : 1, cx = rd.x1 + dx * t + nx * sd * 1.6, cz = rd.z1 + dz * t + nz * sd * 1.6, rad = 1.6 + rnd() * 1.2; bare({ x: cx, z: cz, r: rad * 0.7 }); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + rnd(), d = rad * 0.6; bare({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: rad * 0.45 }); } }
  }
  return out;
}

/** Clear gap (m) between the visible dirt edge and any prop's edge (fence line, bench, planter, signpost, lamp, hay ...). */
export const ROADSIDE_CLEAR = 0.8;
/** The soil's ragged leafy edge + the mask blur spill ~0.5 m past the nominal disc edge (render/groundPath FRAG: edge = mask + noise), so the VISIBLE dirt edge is the disc edge + this. */
const SPILL = 0.5;
const CELL = 6;
const ck = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
/** Builds `dirtEdge(x, z)`: the signed distance from (x, z) to the nearest visible dirt edge of the mainland tracks (negative = standing on the dirt; 99 when nothing is near). */
export function makeDirtEdge(discs: readonly Disc[]): (x: number, z: number) => number {
  const m = new Map<number, Disc[]>();
  for (const d of discs) {
    if (d.z < 40) continue;   // (only the outskirts matter here)
    const i0 = Math.floor((d.x - d.r) / CELL), i1 = Math.floor((d.x + d.r) / CELL), j0 = Math.floor((d.z - d.r) / CELL), j1 = Math.floor((d.z + d.r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = ck(i, j); let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(d); }
  }
  return (x, z) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let best = 99;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const l = m.get(ck(i, j)); if (!l) continue;
      for (const d of l) { const v = Math.hypot(x - d.x, z - d.z) - d.r; if (v < best) best = v; }
    }
    return best - SPILL;
  };
}
