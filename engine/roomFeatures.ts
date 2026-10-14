// ============================================================================
// Run-room terrain features (pure TS, no three / no React): the stage LAYOUT of a room (plain, big, long, river with
// bridges, lake) and its non-walkable liquids. Built by roomgen.buildRoom from the room seed; read by the engine
// (enemy routing over bridges / around lakes, lava burns) and by the render layer (render/RoomWater.tsx, minimap).
//
// Liquids are ALSO installed as ordinary circle colliders (mapgen.Collider with `liquid` set and blocksProjectiles
// false), so the hero, enemies, spawn checks, blink / dash, traps and crate placement all treat them as solid ground
// obstacles for free, while projectiles fly over. This module only adds what colliders cannot do: steering.
// ============================================================================

export type Layout = 'PLAIN' | 'BIG' | 'LONG' | 'RIVER' | 'LAKE';
export type Liquid = 'WATER' | 'LAVA' | 'CHASM' | 'ICE';
/** Collider.liquid codes. */
export const LIQ = { NONE: 0, WATER: 1, LAVA: 2, CHASM: 3, ICE: 1 } as const;
export const liquidCode = (l: Liquid): number => (l === 'LAVA' ? 2 : l === 'CHASM' ? 3 : 1);

export const MAX_LAKES = 6;
export const MAX_BRIDGES = 3;
export const MAX_FIXED = 4;

export const feat = {
  version: 0,
  layout: 'PLAIN' as Layout,
  liquid: 'WATER' as Liquid,
  /** Biome sub-variant (Greenwood: 0 meadow, 1 deep grove, 2 mire). */
  variant: 0,
  // ---- river / channel: a band across the room, perpendicular to the room's forward axis (arrival -> exits).
  // Signed distance d(x,z) = (p . n) - off - amp * sin(freq * s + ph), s = p . t (t = n rotated +90 deg).
  river: false,
  nx: 0, nz: -1, off: 0, hw: 2.5, amp: 0, freq: 0.1, ph: 0, straight: false,
  // second meander harmonic + width wobble (uneven banks): hw(s) = hw * (1 + wAmp * sin(wFreq * s + wPh))
  amp2: 0, freq2: 0.2, ph2: 0, wAmp: 0, wFreq: 0.2, wPh: 0,
  nb: 0, bridgeS: new Float32Array(MAX_BRIDGES), bw: 1.6,
  // ---- lakes: circles (x, z, r). r is the visual water radius; the collider is a bit smaller.
  nLakes: 0, lx: new Float32Array(MAX_LAKES), lz: new Float32Array(MAX_LAKES), lr: new Float32Array(MAX_LAKES),
  // ---- stationary monsters placed by the layout: archer towers (GOBLIN_ARCHER on top) and lake hydras
  nTowers: 0, tx: new Float32Array(MAX_FIXED), tz: new Float32Array(MAX_FIXED),
  nHydras: 0, hx: new Float32Array(MAX_FIXED), hz: new Float32Array(MAX_FIXED),
};

export function resetFeatures(): void {
  feat.layout = 'PLAIN'; feat.river = false; feat.nb = 0; feat.nLakes = 0; feat.nTowers = 0; feat.nHydras = 0; feat.variant = 0;
  feat.version++;
}

/** River tangent coordinate of (x, z). */
export function riverS(x: number, z: number): number { return -x * feat.nz + z * feat.nx; }
/** River signed distance (0 on the centre line; |d| < hw = water). */
export function riverD(x: number, z: number): number {
  const s = -x * feat.nz + z * feat.nx;
  return x * feat.nx + z * feat.nz - feat.off - feat.amp * Math.sin(feat.freq * s + feat.ph) - feat.amp2 * Math.sin(feat.freq2 * s + feat.ph2);
}
/** River half width at tangent coordinate s (the banks wobble). */
export function hwAt(s: number): number { return feat.hw * (1 + feat.wAmp * Math.sin(feat.wFreq * s + feat.wPh)); }
/** Centre-line point of the river at tangent coordinate s, pushed `d` along the normal. */
export function riverPoint(s: number, d: number, out: [number, number]): void {
  const c = feat.off + feat.amp * Math.sin(feat.freq * s + feat.ph) + feat.amp2 * Math.sin(feat.freq2 * s + feat.ph2) + d;
  out[0] = feat.nx * c - feat.nz * s;
  out[1] = feat.nz * c + feat.nx * s;
}
/** Index of the bridge whose deck covers tangent coordinate s (-1 = none). */
export function bridgeAt(s: number, pad = 0): number {
  for (let i = 0; i < feat.nb; i++) if (Math.abs(s - feat.bridgeS[i]) < feat.bw + pad) return i;
  return -1;
}
/** Is (x, z) on open liquid (river band outside the bridges, or inside a lake)? `pad` grows the liquid. */
export function inLiquid(x: number, z: number, pad = 0): boolean {
  if (feat.river) {
    const d = riverD(x, z);
    const s = riverS(x, z);
    if (Math.abs(d) < hwAt(s) + pad && bridgeAt(s, -pad) < 0) return true;
  }
  for (let i = 0; i < feat.nLakes; i++) {
    const dx = x - feat.lx[i], dz = z - feat.lz[i], r = feat.lr[i] + pad;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/**
 * Steering for walkers: when liquid separates (ex, ez) from its target (tx, tz), writes an intermediate waypoint into
 * `out` (the near end of the best bridge, then its far end; or a point around a lake) and returns true.
 * Allocation-free; a handful of float ops per call.
 */
export function routeAround(ex: number, ez: number, tx: number, tz: number, rad: number, out: [number, number]): boolean {
  if (feat.river && feat.nb > 0) {
    const de = riverD(ex, ez), dt = riverD(tx, tz);
    const hw = hwAt(riverS(ex, ez));
    if ((de > 0) !== (dt > 0) && Math.abs(dt) > hw * 0.5) {
      const se = riverS(ex, ez), st = riverS(tx, tz);
      // best bridge: shortest detour
      let bi = 0, best = 1e9;
      for (let i = 0; i < feat.nb; i++) { const b = feat.bridgeS[i]; const c = Math.abs(se - b) + Math.abs(st - b); if (c < best) { best = c; bi = i; } }
      const b = feat.bridgeS[bi];
      const side = de > 0 ? 1 : -1;
      const lat = Math.abs(se - b);
      const lim = feat.bw - rad - 0.15;
      if (Math.abs(de) <= hw + 1.4 && lat < Math.max(0.3, lim)) {
        // on the deck (or at its mouth, lined up): walk across, keeping to the deck's lane
        const sl = Math.max(-lim, Math.min(lim, se - b));
        riverPoint(b + sl * 0.7, -side * (hw + 2.6), out);
      } else {
        // walk to the mouth of the bridge on our side
        riverPoint(b, side * (hw + 1.2), out);
      }
      return true;
    }
  }
  for (let i = 0; i < feat.nLakes; i++) {
    const cx = feat.lx[i], cz = feat.lz[i], R = feat.lr[i] + rad + 0.6;
    const ux = ex - cx, uz = ez - cz, ue = Math.sqrt(ux * ux + uz * uz);
    if (ue < 1e-3) continue;
    const vx = tx - ex, vz = tz - ez, vl2 = vx * vx + vz * vz;
    if (vl2 < 1e-4) continue;
    // closest point of the segment E->T to the centre
    const k = -(ux * vx + uz * vz) / vl2;
    if (k <= 0 || k >= 1) continue;
    const qx = ux + vx * k, qz = uz + vz * k;
    if (qx * qx + qz * qz >= R * R) continue;
    // blocked: head for a point 55 degrees further round the shore, on the target's side
    const nx = ux / ue, nz = uz / ue;
    const side = nx * (tz - cz) - nz * (tx - cx) > 0 ? 1 : -1;
    const c = 0.57, s = 0.82 * side, rr = Math.max(R * 1.12, ue);
    out[0] = cx + (nx * c - nz * s) * rr;
    out[1] = cz + (nz * c + nx * s) * rr;
    return true;
  }
  return false;
}
