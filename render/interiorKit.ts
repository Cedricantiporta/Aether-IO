// Placement helpers for the kit-v3 interiors (castle / chapel / tavern / house / cave): tile a floor, run walls along a room edge, hang a
// piece on a wall. Pure data (KitV3Item lists), no three / no React. Rooms are centred on the world origin; the camera looks north (-z),
// so N = the back wall (-z), S = the front wall (+z, door side), W = -x, E = +x. Wall pieces have the room side on local +Z.
import type { KitV3Item } from './kitV3';

export type Side = 'N' | 'S' | 'W' | 'E';
const PI = Math.PI;
const hash = (i: number, j: number): number => { let h = (Math.imul(i + 101, 374761393) ^ Math.imul(j + 57, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };

/** Tile the rectangle [x0..x1] x [z0..z1] with 4 m floor tiles, squeezed a little so they fit without gaps. Alternate tiles turn 180 degrees. */
export function floorGrid(piece: string, x0: number, x1: number, z0: number, z1: number, y = 0, tint?: string | number): KitV3Item[] {
  const nx = Math.max(1, Math.ceil((x1 - x0) / 4 - 0.01)), nz = Math.max(1, Math.ceil((z1 - z0) / 4 - 0.01)), sx = (x1 - x0) / nx / 4, sz = (z1 - z0) / nz / 4, out: KitV3Item[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ piece, x: x0 + (i + 0.5) * sx * 4, z: z0 + (j + 0.5) * sz * 4, y, rotY: hash(i, j) < 0.5 ? 0 : PI, scale: [sx, 1, sz], tint });
  return out;
}

/** Floor tiles of any outline: 4 m cells on the world grid whose centre passes `inside` (no squeezing, random 90 degree turns). */
export function floorCells(piece: string, inside: (x: number, z: number) => boolean, ext: number, y = 0, tint?: string | number): KitV3Item[] {
  const out: KitV3Item[] = [], n = Math.ceil(ext / 4);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const x = i * 4, z = j * 4;
    if (inside(x, z)) out.push({ piece, x, z, y, rotY: Math.floor(hash(i, j) * 4) * PI / 2, tint });
  }
  return out;
}

export interface WallRunOpts {
  /** piece name, or a picker (index, centre along the wall, count) -> piece / null to leave a gap */
  piece: string | ((i: number, c: number, n: number) => string | null);
  /** distance from the room edge to the piece origin (= the wall piece's front depth, so its inner face sits on the edge) */
  off: number;
  /** height scale (1 = the piece's own height) */
  sy?: number;
  tint?: string | number;
}
/** A run of wall pieces along one side of the room from `a` to `b` (x for N / S, z for W / E), rotated so the +Z face looks into the room. */
export function wallRun(side: Side, a: number, b: number, hw: number, hd: number, o: WallRunOpts): KitV3Item[] {
  const len = b - a, n = Math.max(1, Math.round(len / 4)), sp = len / n, out: KitV3Item[] = [];
  for (let i = 0; i < n; i++) {
    const c = a + sp * (i + 0.5), piece = typeof o.piece === 'string' ? o.piece : o.piece(i, c, n);
    if (!piece) continue;
    const scale: [number, number, number] = [sp / 4, o.sy ?? 1, 1];
    if (side === 'N') out.push({ piece, x: c, z: -hd - o.off, rotY: 0, scale, tint: o.tint });
    else if (side === 'S') out.push({ piece, x: c, z: hd + o.off, rotY: PI, scale, tint: o.tint });
    else if (side === 'W') out.push({ piece, x: -hw - o.off, z: c, rotY: PI / 2, scale, tint: o.tint });
    else out.push({ piece, x: hw + o.off, z: c, rotY: -PI / 2, scale, tint: o.tint });
  }
  return out;
}

/** Hang / stand a piece against a wall: `c` runs along the wall, `inset` is how far its origin plane sits in front of the room edge, +Z looks into the room. */
export function onWall(side: Side, piece: string, c: number, hw: number, hd: number, o: { y?: number; inset?: number; scale?: number | [number, number, number]; tint?: string | number } = {}): KitV3Item {
  const inset = o.inset ?? 0, y = o.y ?? 0, scale = o.scale, tint = o.tint;
  if (side === 'N') return { piece, x: c, y, z: -hd + inset, rotY: 0, scale, tint };
  if (side === 'S') return { piece, x: c, y, z: hd - inset, rotY: PI, scale, tint };
  if (side === 'W') return { piece, x: -hw + inset, y, z: c, rotY: PI / 2, scale, tint };
  return { piece, x: hw - inset, y, z: c, rotY: -PI / 2, scale, tint };
}

/** Yaw (about +Y) that makes a piece's +Z face look toward (tx, tz) from (x, z). */
export const faceYaw = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);
