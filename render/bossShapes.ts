// Angular building blocks for the big organic bosses (owner 2026-10-25: "less roundy, not Minecraft"): tapered limbs, spikes and faceted
// lumps merged into GB geometries. All low-poly (5-7 radial segments, icosahedron detail 0) so flatShading reads as cut facets.
import type { GB } from './util';

type V3 = [number, number, number];
type ColorLike = number | string;

/** Euler [x, y, z] (YXZ) that turns +y toward the direction (dx, dy, dz). */
function aim(dx: number, dy: number, dz: number): V3 { return [Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0]; }

/** Tapered prism from a (radius r0) to b (radius r1), few radial segments. `scl` flattens the cross-section (applied in the limb's local frame). */
export function limb(g: GB, a: V3, b: V3, r0: number, r1: number, seg: number, color: ColorLike, scl: V3 | number = 1): GB {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1e-3;
  return g.cyl(r1, r0, len, seg, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color, aim(dx, dy, dz), scl);
}

/** Cone from `base` (radius r) to `tip`. 4 segments = a sharp pyramid. */
export function spike(g: GB, base: V3, tip: V3, r: number, seg: number, color: ColorLike, scl: V3 | number = 1): GB {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], dz = tip[2] - base[2], len = Math.hypot(dx, dy, dz) || 1e-3;
  return g.cone(r, len, seg, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2], color, aim(dx, dy, dz), scl);
}

/** Faceted lump (icosahedron detail 0, stretched): the angular replacement for a sphere. */
export function lump(g: GB, r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, rot: V3 = [0, 0, 0]): GB {
  return g.ico(r, pos, color, scl, 0, rot);
}

/** Flat blade / leaf / fin: an octahedron squashed to a thin diamond whose long axis (y) points base->tip. */
export function blade(g: GB, base: V3, tip: V3, w: number, thick: number, color: ColorLike): GB {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], dz = tip[2] - base[2], len = Math.hypot(dx, dy, dz) || 1e-3;
  return g.octa(1, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2], color, [w, len / 2, thick], aim(dx, dy, dz));
}
