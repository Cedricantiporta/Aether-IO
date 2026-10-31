import { cullRegister } from './distCull';
import type { Material as Mat3, Group as Group3 } from 'three';
// Town scenery: houses, market stalls, well, fences, lamp posts, roads/plaza and the town gate.
// Everything static is merged into per-chunk vertex-coloured meshes (frustum-culled by three), roads and the plaza
// are one flat mesh without shadows, lamp bulbs are emissive only (no real lights).
import { mainNav } from '../engine/systems/questNav';
import { STORY } from '../story';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BASE } from './models';
import { TextureLoader, type Texture } from 'three';
import { AdditiveBlending, ExtrudeGeometry, BufferGeometry, CanvasTexture, ConeGeometry, MeshStandardMaterial, PlaneGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Path, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, Sprite } from 'three';
import { GB, TAU, litMat, mulberry32, setInst } from './util';
import { Inst } from './Inst';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeShoreField, makeWaterMaterial } from './waterFx';
import { groundY, edgeR, GROUND_BOX, SEA_Y } from './terrainFn';
import { VillageQt } from './qtVillage';
import { PlazaFountain } from './PlazaFountain';
import { TownKit } from './townKit';
import { ROYAL_ROOF, TOWN_GOLD, TOWN_BLUE_CLOTH } from './townPalette';
import { labelMaterial } from './label';
import { nightGlow, forgetNightGlow } from './biomeLook';
import {
  PLAZA_DECOR, PLAZA_STATUES, GATE_TOWER, CASTLE, LAKE, HERMIT_CAMP, NK_CHIMNEY, RUINS, TRAIL_ROCKS, GATE, HOUSES, LOTS, lotW, type Lot, STALLS, ROADS, GATEWAY, GATEWAYS, FENCES, LAMPS, PLAZA, WELL_POS, SIGNS, WALL, WALL_RUNS, WALL_TOWERS, SIDE_GATES, SIDE_GATE, PLANTERS, TOWN_TREES, GRASS_PATCHES, FARM, SCARECROW, HAYSTACK, CARTS,
  BOSS_PORTAL, HouseSpec, StallSpec, TowerSpec, PlanterSpec, TreeSpec, CartSpec, PORTAL, TERRACE, townLift, TIERS, CHAPEL_SIDE, HOUSE_KIT, stairRun, STEP_RUN, tierEdgeOnWall, type TierSpec, CHURCH, TAVERN, WINDMILL, STATUE, GRAVEYARD, GRAVES, CRYPT, TOWN_SEATS, RIVER, riverBank, BRIDGE, MINE_BRIDGE, FIELDS, type FieldSpec } from '../engine/townData';
import { QualityCfg } from './quality';
import { addBossIsland } from './bossIsland';
import { BEACH, MAIN_BEACH } from '../engine/beachData';
import { world } from '../engine/world';
import { smokePuff } from './fx';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';

type V3 = [number, number, number];
const WOOD = '#6e4b2b', STONE = '#9b9488', DSTONE = '#7d776d';

// ------------------------------------------------------------------ houses ---
// OLD house style (the look of the original shop buildings): stone footing, timber frame with corner posts + rails,
// big overhanging gabled roof with a darker ridge beam and diagonal eave braces, striped shop awning over the door,
// round window, hanging lanterns, barrels / crates / mushrooms.
const darker = (hex: string, k: number) => '#' + new Color(hex).multiplyScalar(k).getHexString();
function lantern(b: GB, g: GB, x: number, y: number, z: number) {
  b.box(0.06, 0.55, 0.06, [x, y + 0.35, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y + 0.1, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y - 0.22, z], '#2a2a2e');
  g.sph(0.15, [x, y - 0.06, z], '#ffd070', 1, 6);
}
/** Plain cloth awning (single colour, no stripes). */
function awning(b: GB, x0: number, x1: number, y: number, z: number, c1: string, c2: string) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.9)), w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.box(w, 0.1, 1.7, [x0 + w * (i + 0.5), y, z], i % 2 ? c1 : c2, [0.42, 0, 0]);
  for (let i = 0; i < n; i++) b.box(w, 0.28, 0.06, [x0 + w * (i + 0.5), y - 0.62, z + 0.72], i % 2 ? c1 : c2);
}
function pole(b: GB, x: number, z: number, h: number, c = WOOD) { b.box(0.22, h, 0.22, [x, h / 2, z], c); }

function buildHouse(h: HouseSpec, idx: number): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const rnd = mulberry32(idx * 7919 + 13);
  const { w, d } = h;
  const wallH = h.floors * 2.7, base = 0.6, top = base + wallH;
  const barn = h.wall === '#9a3a2a' || h.w < 4, roofCol = barn ? h.roof : ROYAL_ROOF, ridgeC = barn ? darker(h.roof, 0.72) : TOWN_GOLD;
  // stone footing + walls
  b.box(w + 0.7, base, d + 0.7, [0, base / 2, 0], STONE);
  b.box(w, wallH, d, [0, base + wallH / 2, 0], h.wall, [0, 0, 0], [0.86, 1]);
  if (h.floors === 2) b.box(w + 0.2, 0.22, d + 0.2, [0, base + 2.7, 0], WOOD);
  // timber frame: corner posts + front rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, wallH + 0.1, 0.3, [sx * (w / 2), base + wallH / 2 + 0.05, sz * (d / 2)], WOOD);
  b.box(w + 0.2, 0.26, 0.3, [0, top - 0.12, d / 2 + 0.02], WOOD); b.box(w + 0.2, 0.2, 0.3, [0, base + 1.25, d / 2 + 0.02], WOOD);
  // big gabled roof, ridge beam, diagonal eave braces
  const rh = Math.min(w, d) * 0.55 + 1.1;
  b.prism(w + 1.6, rh, d + 1.5, [0, top, 0], roofCol, [0, 0, 0], [0.78, 1.08]);
  b.box(0.3, 0.3, d + 1.6, [0, top + rh, 0], ridgeC);
  b.box(0.18, 0.18, d + 1.5, [-(w / 2 + 0.8), top + 0.05, 0], WOOD, [0, 0, -0.78]); b.box(0.18, 0.18, d + 1.5, [w / 2 + 0.8, top + 0.05, 0], WOOD, [0, 0, 0.78]);
  if (h.chimney) {
    const cx = w * 0.24, cz = -d * 0.2;
    b.box(0.85, rh + 1.2, 0.85, [cx, top + (rh + 1.2) / 2 - 0.1, cz], '#85796f'); b.box(1.05, 0.22, 1.05, [cx, top + rh + 1.2, cz], '#5e554d');
  }
  // door with round top, step, striped awning on two poles, lanterns
  const dx = h.floors === 2 ? -w * 0.2 : -w * 0.12;
  b.box(1.2, 2.0, 0.2, [dx, base + 1.0, d / 2 + 0.05], h.door); b.cyl(0.6, 0.6, 0.2, 10, [dx, base + 2.0, d / 2 + 0.05], h.door, [Math.PI / 2, 0, 0]);
  b.box(1.7, 0.14, 0.8, [dx, 0.07, d / 2 + 0.55], DSTONE);
  const ax0 = dx - 1.5, ax1 = dx + 1.5, ay = base + 2.75, az = d / 2 + 0.55;
  awning(b, ax0, ax1, ay, az, ROYAL_ROOF, '#f4eee0');
  pole(b, ax0, d / 2 + 1.45, ay + 0.1); pole(b, ax1, d / 2 + 1.45, ay + 0.1);
  lantern(b, g, ax0 + 0.1, ay - 0.35, d / 2 + 1.4);
  // glowing windows (round on the front, square on the sides, frames + flower box)
  const wx = h.floors === 2 ? w * 0.28 : w * 0.3;
  g.cyl(0.62, 0.62, 0.1, 12, [wx + (h.floors === 2 ? 0.2 : 0.3), base + 1.9, d / 2 + 0.04], rnd() < 0.5 ? '#ffd88a' : '#9ed8ff', [Math.PI / 2, 0, 0]);
  b.torus(0.66, 0.09, [wx + (h.floors === 2 ? 0.2 : 0.3), base + 1.9, d / 2 + 0.08], WOOD, [0, 0, 0], 1, 12);
  if (h.floors === 2) for (const sx of [-1, 1]) { g.box(0.72, 0.8, 0.1, [sx * w * 0.28, base + 4.2, d / 2 + 0.04], '#ffd88a'); b.box(0.96, 0.12, 0.2, [sx * w * 0.28, base + 4.7, d / 2 + 0.06], WOOD); b.box(0.96, 0.12, 0.2, [sx * w * 0.28, base + 3.7, d / 2 + 0.06], WOOD); }
  for (const s of [-1, 1]) {
    g.box(0.1, 0.8, 0.8, [s * (w / 2 + 0.03), base + 1.6, 0], '#ffd88a');
    b.box(0.18, 0.12, 1.04, [s * (w / 2 + 0.04), base + 2.06, 0], WOOD); b.box(0.18, 0.12, 1.04, [s * (w / 2 + 0.04), base + 1.14, 0], WOOD);
    if (h.floors === 2) g.box(0.1, 0.8, 0.8, [s * (w / 2 + 0.03), base + 4.2, 0], '#ffe6a8');
  }
  b.box(1.0, 0.2, 0.3, [wx + 0.2, base + 0.85, d / 2 + 0.22], WOOD);
  for (let i = 0; i < 4; i++) b.sph(0.1, [wx + 0.2 - 0.34 + i * 0.22, base + 1.02, d / 2 + 0.24], ['#ff7aa8', '#ffe14a', '#ffffff', '#ff9a4a'][(i + idx) % 4], 1, 4);
  // clutter: barrels / crates / mushrooms / bush
  const bx = -w / 2 - 0.9;
  if (idx % 3 === 0) { for (const [x, z] of [[bx, d / 2 - 0.4], [bx - 0.5, d / 2 - 1.3]]) { b.cyl(0.5, 0.55, 0.9, 9, [x, 0.45, z], '#8a5a30'); b.cyl(0.56, 0.56, 0.08, 9, [x, 0.3, z], '#3a3a40'); b.cyl(0.56, 0.56, 0.08, 9, [x, 0.65, z], '#3a3a40'); } }
  else if (idx % 3 === 1) { for (const [x, z, s] of [[bx, d / 2 - 0.5, 1], [bx - 0.6, d / 2 - 1.2, 0.8]] as number[][]) { b.cyl(0.42 * s, 0.48 * s, 0.8 * s, 10, [x, 0.4 * s, z], '#a4793f'); b.cyl(0.48 * s, 0.48 * s, 0.07, 10, [x, 0.58 * s, z], '#6a4a2a'); } }   // (barrels, not crate cubes)
  else for (const [x, z, s] of [[bx, d / 2 - 0.5, 1], [bx - 0.7, d / 2 - 1.2, 0.7]] as number[][]) { b.cyl(0.14 * s, 0.18 * s, 0.7 * s, 6, [x, 0.35 * s, z], '#f1e6d0'); b.sph(0.55 * s, [x, 0.75 * s, z], '#e0443a', [1, 0.6, 1], 8); for (let k = 0; k < 4; k++) b.sph(0.1 * s, [x + Math.cos(k * 1.7) * 0.3 * s, 0.95 * s, z + Math.sin(k * 1.7) * 0.3 * s], '#fff', 1, 4); }
  for (let i = 0; i < 5; i++) { const a = rnd() * TAU; b.sph(0.12 + rnd() * 0.05, [Math.cos(a) * (w / 2 + 0.2 + rnd()), 0.16, d / 2 + 1.5 + Math.abs(Math.sin(a)) * 0.8], ['#ff7aa8', '#ffe14a', '#ffffff', '#9ac8ff', '#ff9a4a'][(i + idx) % 5], 1, 4); }
  return { b: b.build(), g: g.build() };
}







// ------------------------------------------------------------------- misc ---
/** Per-pixel grain + a few specks, baked into a canvas once (cheap detail that survives mipmapping). */
function grain(x: CanvasRenderingContext2D, N: number, rnd: () => number, amp: number, specks: number, speck: string) {
  const img = x.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * amp; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  x.putImageData(img, 0, 0);
  x.fillStyle = speck;
  for (let i = 0; i < specks; i++) { const sx = rnd() * N, sy = rnd() * N, r = 0.8 + rnd() * 2.2; x.globalAlpha = 0.25 + rnd() * 0.35; x.beginPath(); x.ellipse(sx, sy, r, r * 0.7, rnd() * 3, 0, TAU); x.fill(); }
  x.globalAlpha = 1;
}
/** The town's flagstones (owner ref 2026-10-21): big soft irregular polygonal slabs in light cream with thin warm-grey grout, a few slabs a touch darker. A tileable Voronoi baked once into a
 *  canvas (4x4 jittered seeds per tile; distance to the nearest / second nearest seed gives the grout line, softened so the slabs look rounded). */
export function flagTexture(): Texture {
  // (owner 2026-10-24 tiles mock) the baked seamless pale cream-peach puffy flagstone tile: public/art/ground/flagstone.webp, 1 tile = FLAG_TILE m (~1.2 m stones); art/bake_flagstone.py
  const t = new TextureLoader().load(`${BASE}art/ground/flagstone.webp`);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const FLAG_TILE = 9.6;
/** Height of the kit flower_planter's soil (its lawn top sits there). */
const PLANTER_TOP = 0.62;

/** World-space planar UVs (xz / tile) so the stones line up across roads and the plaza. */
function planarUv(g: BufferGeometry, tile: number): BufferGeometry {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** The part of a road between z0 and z1 (roads are straight), or null. */
function clipZ(rd: { x1: number; z1: number; x2: number; z2: number }, z0: number, z1: number): [number, number, number, number] | null {
  let a = 0, b = 1; const dz = rd.z2 - rd.z1;
  if (Math.abs(dz) < 1e-6) { if (rd.z1 < z0 || rd.z1 > z1) return null; }
  else {
    let t0 = (z0 - rd.z1) / dz, t1 = (z1 - rd.z1) / dz; if (t0 > t1) [t0, t1] = [t1, t0];
    a = Math.max(a, t0); b = Math.min(b, t1); if (b - a < 1e-3) return null;
  }
  const lx = (t: number) => rd.x1 + (rd.x2 - rd.x1) * t, lz = (t: number) => rd.z1 + dz * t;
  return [lx(a), lz(a), lx(b), lz(b)];
}
/** Outside the walls the roads are packed-earth paths: brown strips, a bit narrower, with ragged darker edges. */
/** Outside the walls: a soft trodden path of overlapping rounded blobs (worn grass rim, dirt, a few paler spots), so it
 *  reads as part of the ground rather than built strips. Flat low-poly ellipses; each layer is one colour, so overlaps vanish. */
function buildDirtPaths(): BufferGeometry {
  const r = new GB([1, 1]);
  const rnd = mulberry32(17);
  for (const rd of ROADS) {
    const seg = rd.dirt ? [rd.x1, rd.z1, rd.x2, rd.z2] : clipZ(rd, WALL.z1 + 2.5, 1e9); if (!seg) continue;   // (dirt: a path outside the walls, whole length)
    const [x1, z1, x2, z2] = seg;
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
    const nx = -dz / len, nz = dx / len;   // sideways
    // (owner 2026-10-22: the Greenwood trail look) one even width, smooth rounded edges: a dense run of round discs, a darker packed rim under a lighter trodden centre. No blotches, no loose discs.
    const w = Math.max(1.8, rd.w * 0.8), n = Math.max(2, Math.round(len / 0.45));
    for (let i = 0; i <= n; i++) {
      const t = i / n, mx = x1 + dx * t, mz = z1 + dz * t, gy = groundY(mx, mz);
      r.cyl(w / 2 + 0.22, w / 2 + 0.22, 0.02, 14, [mx, gy + 0.03, mz], '#a98d5f');   // packed edge
      r.cyl(w / 2, w / 2, 0.02, 14, [mx, gy + 0.045, mz], '#bd9e6e');                  // trodden path
      r.cyl(w / 2 - 0.5, w / 2 - 0.5, 0.02, 14, [mx, gy + 0.06, mz], '#c8ab7b');       // lighter centre
    }
  }
  return r.build();
}

/** All road strips share ONE layer: edge strips at y .055, surface at y .075 (identical for every road, so overlaps and
 *  junctions are seamless; higher road tops simply cover lower edge strips). */
function buildRoads(): BufferGeometry {
  const r = new GB([1, 1]);
  const SURF = '#ffffff';   // (the terracotta kerb along every paved street is its own mesh, buildKerbs)
  for (const rd of ROADS) {
    // only the part inside the walls is paved (outside: a dirt path, see buildDirtPaths)
    if (rd.dirt) continue;
    const seg = clipZ(rd, -1e9, WALL.z1 + 2.5); if (!seg) continue;
    const [x1, z1, x2, z2] = seg;
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
    // in pieces, each on the ground under it (raised districts); pieces on a flight of steps are left out
    const n = Math.max(1, Math.ceil(len / 1.0)), pl = len / n;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, mx = x1 + dx * (t0 + t1) / 2, mz = z1 + dz * (t0 + t1) / 2;
      const ya = townLift(x1 + dx * t0, z1 + dz * t0), yb = townLift(x1 + dx * t1, z1 + dz * t1), y = townLift(mx, mz);
      if (Math.abs(ya - yb) > 0.01 || Math.abs(y - ya) > 0.01) continue;
      r.box(pl + 0.4, 0.06, rd.w, [mx, 0.045 + y, mz], SURF, [0, yaw, 0]);   // (owner: the 1 m pieces overlap well: their end faces showed as thin 'l l l' stripes across the street)
    }
  }
  // plaza (owner 2026-10-23: ONE pattern): a plain disc of the same cobble paving as the streets (no slab rings / grout disc on top of it)
  const px = PLAZA.x, pz = PLAZA.z;
  r.cyl(PLAZA.r, PLAZA.r, 0.08, 72, [px, 0.05, pz], SURF);
  // (owner 2026-10-23: no orange ring inlays - the orange lines read as clutter)
  // gate forecourt
  r.cyl(6.5, 6.5, 0.08, 24, [GATE.x, 0.05, GATE.z], SURF);
  return planarUv(tessellate(r.build(), 2.5), FLAG_TILE);
}

/** Terracotta kerb (owner ref): a thin rounded orange-brick curb along both edges of every paved street inside the walls, round the plaza and the gate forecourt. Pieces that would cross
 *  another street, sit on a flight of steps or fall inside a plaza are left out. One merged mesh (no per-frame work). */
// (owner 2026-10-23: the street kerbs are gone - the orange lines read as clutter; kept for reference, not built)
export function buildKerbs(): BufferGeometry {
  const r = new GB([1, 1]);
  const BR = ['#d9703a', '#e07f42', '#d36a36', '#e48a4c'];
  const paved = ROADS.filter((rd) => !rd.dirt).map((rd) => { const seg = clipZ(rd, -1e9, WALL.z1 + 2.5); return seg ? { rd, seg } : null; }).filter(Boolean) as { rd: typeof ROADS[number]; seg: [number, number, number, number] }[];
  const inside = (o: typeof paved[number], x: number, z: number, pad: number) => {   // inside street o's rectangle (+pad)?
    const [x1, z1, x2, z2] = o.seg, dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const t = (x - x1) * ux + (z - z1) * uz, s = -(x - x1) * uz + (z - z1) * ux;
    return t > -pad && t < len + pad && Math.abs(s) < o.rd.w / 2 + pad;
  };
  let k = 0;
  const piece = (len: number, x: number, z: number, yaw: number, y: number) => {
    r.box(len, 0.12, 0.42, [x, y + 0.085, z], BR[k++ % 4], [0, yaw, 0], [0.92, 1.06]);
    r.box(len - 0.04, 0.04, 0.3, [x, y + 0.15, z], '#ee9a5c', [0, yaw, 0], [1, 1]);   // (a lighter rounded top)
  };
  for (const o of paved) {
    const [x1, z1, x2, z2] = o.seg, dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx), nx = -dz / len, nz = dx / len;
    const n = Math.max(1, Math.ceil(len / 0.9)), pl = len / n, off = o.rd.w / 2 + 0.2;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, mx = x1 + dx * (t0 + t1) / 2, mz = z1 + dz * (t0 + t1) / 2;
      const ya = townLift(x1 + dx * t0, z1 + dz * t0), yb = townLift(x1 + dx * t1, z1 + dz * t1), y = townLift(mx, mz);
      if (Math.abs(ya - yb) > 0.01 || Math.abs(y - ya) > 0.01) continue;
      for (const sd of [-1, 1]) {
        const kx = mx + nx * off * sd, kz = mz + nz * off * sd;
        if (Math.hypot(kx - PLAZA.x, kz - PLAZA.z) < PLAZA.r + 0.5 || Math.hypot(kx - GATE.x, kz - GATE.z) < 6.9) continue;
        if (paved.some((p) => p !== o && inside(p, kx, kz, 0.12))) continue;
        piece(pl + 0.02, kx, kz, yaw, y);
      }
    }
  }
  const ring = (cx: number, cz: number, R: number, n: number, y: number, skip?: (x: number, z: number) => boolean) => {
    const arc = (TAU * R) / n;
    for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * TAU, kx = cx + Math.cos(a) * R, kz = cz + Math.sin(a) * R; if (skip?.(kx, kz)) continue; piece(arc + 0.02, kx, kz, -a + Math.PI / 2, y); }
  };
  const gap = (x: number, z: number) => paved.some((p) => inside(p, x, z, 0.1));   // (leave the street mouths open)
  ring(PLAZA.x, PLAZA.z, PLAZA.r - 0.1, Math.round((TAU * (PLAZA.r - 0.1)) / 0.95), 0, gap);
  ring(GATE.x, GATE.z, 6.4, 30, 0, gap);
  return r.build();
}

/** Paved yard: one flat polygon over the whole walled area with small grass patches cut out as holes. */
/** Splits every triangle (longest edge first) until no edge is longer than `maxLen`, carrying every float attribute along:
 *  no long thin slivers (owner: sliver fans - the holed paving shape, the plaza disc - showed as thin 'l l l' lines). Non-indexed output. */
function tessellate(src: BufferGeometry, maxLen: number): BufferGeometry {
  const g0 = src.index ? src.toNonIndexed() : src, names = Object.keys(g0.attributes), A = names.map((n) => g0.attributes[n]), out: number[][] = names.map(() => []);
  const P = g0.attributes.position, vtx = (i: number): number[][] => A.map((a) => { const r: number[] = []; for (let k = 0; k < a.itemSize; k++) r.push(a.getComponent(i, k)); return r; });
  const mid = (u: number[][], v: number[][]): number[][] => u.map((x, j) => x.map((c, k) => (c + v[j][k]) / 2));
  const pi = names.indexOf('position'), len = (u: number[][], v: number[][]): number => Math.hypot(u[pi][0] - v[pi][0], u[pi][1] - v[pi][1], u[pi][2] - v[pi][2]);
  const split = (a: number[][], b: number[][], c: number[][], d: number): void => {
    const ab = len(a, b), bc = len(b, c), ca = len(c, a), m = Math.max(ab, bc, ca);
    if (m <= maxLen || d > 18) { for (const v of [a, b, c]) v.forEach((x, j) => out[j].push(...x)); return; }
    if (m === ab) { const k = mid(a, b); split(a, k, c, d + 1); split(k, b, c, d + 1); }
    else if (m === bc) { const k = mid(b, c); split(a, b, k, d + 1); split(a, k, c, d + 1); }
    else { const k = mid(c, a); split(a, b, k, d + 1); split(k, b, c, d + 1); }
  };
  for (let i = 0; i < P.count; i += 3) split(vtx(i), vtx(i + 1), vtx(i + 2), 0);
  const g = new BufferGeometry();
  names.forEach((n, j) => g.setAttribute(n, new Float32BufferAttribute(out[j], A[j].itemSize)));
  return g;
}
function buildPaving(): { geo: BufferGeometry; patches: [number, number][][] } {
  const sh = new Shape();
  const X0 = WALL.x0 + 0.6, X1 = WALL.x1 - 0.6, Z0 = WALL.z0 + 0.6, Z1 = WALL.z1 + 0.6;
  sh.moveTo(X0, -Z0); sh.lineTo(X1, -Z0); sh.lineTo(X1, -Z1); sh.lineTo(X0, -Z1); sh.closePath();
  const rnd = mulberry32(99);
  const patches: [number, number][][] = [];
  for (const [cx, cz, rx, rz, prot, pexp] of GRASS_PATCHES) {
    const n = pexp ? 36 : 20, ph = rnd() * 6, pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, k = pexp ? 1 : 1 + 0.1 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 5 + ph * 1.7);
      let ux = Math.cos(a), uz = Math.sin(a);
      if (pexp) { const m = Math.pow(Math.abs(ux) ** pexp + Math.abs(uz) ** pexp, 1 / pexp); ux /= m; uz /= m; }   // (lots: a rounded rectangle, turned with its house)
      let px = ux * rx * k, pz = uz * rz * k;
      if (prot) { const c = Math.cos(prot), sn = Math.sin(prot); [px, pz] = [px * c + pz * sn, -px * sn + pz * c]; }
      pts.push([cx + px, cz + pz]);
    }
    patches.push(pts);
    const hole = new Path();
    pts.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    hole.closePath();
    sh.holes.push(hole);
  }
  const g = tessellate(new ShapeGeometry(sh), 2.5);   // (owner: the long sliver triangles of the holed shape showed as thin 'l l l' lines across the paving)
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return { geo: planarUv(g, FLAG_TILE), patches };
}

/** Low stone kerb around a grass patch. */
function addPatchKerb(b: GB, pts: [number, number][], rnd: () => number) {
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    b.box(len + 0.08, 0.14, 0.26, [(x1 + x2) / 2, 0.07, (z1 + z2) / 2], i % 2 ? '#d9703a' : '#e07f42', [0, -Math.atan2(z2 - z1, x2 - x1), 0], [0.92, 1.06]);
  }
  void rnd;   // (owner 2026-10-31: no loose dot flowers inside the kerb: flowers are the kit flower-on-mound patches, placed by engine/townFill)
}

/** Flat lawn polygon (fan) for a grass patch that sits on a raised district (the terrain grass is under the tier). */
function addGrassCap(b: GB, pts: [number, number][]) {
  let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    b.tri([cx, 0.05, cz], [x2, 0.05, z2], [x1, 0.05, z1], i % 2 ? '#74ad4c' : '#6ea648', [0.95, 1.03]);
  }
}



/** Wheat field ground: soil bed + furrows + the scarecrow (the wheat stalks and the haystack are nature_kit_v1 pieces, render/NatureScenery.tsx). */
function addFarm(b: GB) {
  const { x, z, hw, hd } = FARM;
  b.box(hw * 2 - 0.5, 0.06, hd * 2 - 0.5, [x, 0.04, z], '#6d5336');
  for (let zi = -hd + 1.3; zi <= hd - 1.0; zi += 1.1) b.box(hw * 2 - 1.0, 0.04, 0.28, [x, 0.08, z + zi], '#58412a');
  // scarecrow
  const sx = SCARECROW.x, sz = SCARECROW.z;
  b.box(0.12, 2.3, 0.12, [sx, 1.15, sz], '#6e4b2b'); b.box(1.6, 0.1, 0.1, [sx, 1.75, sz], '#6e4b2b');
  b.box(0.55, 0.8, 0.32, [sx, 1.5, sz], '#8d7a58'); b.sph(0.24, [sx, 2.15, sz], '#d8c08a', 1, 6);
  b.cone(0.38, 0.35, 6, [sx, 2.5, sz], '#3b2a20'); b.cyl(0.46, 0.46, 0.04, 8, [sx, 2.33, sz], '#3b2a20');
  b.box(0.12, 0.45, 0.06, [sx - 0.8, 1.55, sz], '#d6b64a'); b.box(0.12, 0.45, 0.06, [sx + 0.8, 1.55, sz], '#d6b64a');
}

/** An extra crop field's ground (dirt bed + furrows; the plants are nature_kit_v1 pieces). */
function addField(b: GB, F: FieldSpec): void {
  const { x, z, hw, hd } = F;
  b.box(hw * 2 - 0.5, 0.06, hd * 2 - 0.5, [x, 0.04, z], '#6d5336');
  for (let zi = -hd + 1.1; zi <= hd - 0.9; zi += 1.15) b.box(hw * 2 - 1.0, 0.04, 0.3, [x, 0.08, z + zi], '#58412a');
}

/** Rocks along the river banks + a rocky spring where the river starts (its east end). */
function addRiverBanks(b: GB, rnd: () => number): void {
  for (let x = RIVER.x0 + 22; x < RIVER.x1; x += 2.6) {
    if (Math.abs(x) < BRIDGE.hw + 2) continue;
    // (the bank stones + the spring rocks are Quaternius rock formations now: render/natureLayout townPlaces)
    if (rnd() < 0.3) { const zr = rnd() < 0.5 ? riverBank(x, 0) + 0.6 : riverBank(x, 1) - 0.6; for (let k = 0; k < 3; k++) b.cyl(0.03, 0.05, 1.1 + rnd() * 0.6, 4, [x + rnd(), 0.2, zr + (rnd() - 0.5)], '#6f8f3a'); }
  }
}

interface Chunk { b: GB; g: GB }
const CH = 40;


/** Hermit camp: stone-ringed campfire with logs, a bedroll and a small lean-to. */
function addCamp(b: GB, g: GB, x: number, z: number) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.sph(0.22, [x + Math.cos(a) * 0.75, 0.15, z + Math.sin(a) * 0.75], '#8a867c', [1, 0.7, 1], 5); }
  b.cyl(0.08, 0.08, 1.1, 5, [x, 0.22, z], '#4a2f1a', [0, 0, 0.5]); b.cyl(0.08, 0.08, 1.1, 5, [x, 0.22, z], '#4a2f1a', [0.5, 1.2, 0]);
  g.cone(0.3, 0.9, 6, [x, 0.7, z], '#ffb050'); g.sph(0.18, [x, 0.4, z], '#ffe090', 1, 5);
  b.box(1.0, 0.14, 2.0, [x - 2.6, 0.08, z + 0.6], '#6b5a3a', [0, 0.3, 0]); b.box(0.9, 0.18, 0.5, [x - 2.7, 0.2, z - 0.2], '#8c1d28', [0, 0.3, 0]);
  b.box(0.1, 1.9, 0.1, [x + 1.2, 0.95, z - 2.2], '#4a2f1a'); b.box(0.1, 1.9, 0.1, [x + 3.2, 0.95, z - 2.2], '#4a2f1a');
  b.box(2.6, 0.08, 1.8, [x + 2.2, 1.7, z - 2.9], '#7a6a48', [0.6, 0, 0]);
  b.box(0.7, 0.6, 0.5, [x + 2.4, 0.3, z - 1.6], '#6e4b2b'); b.cyl(0.22, 0.2, 0.3, 8, [x - 0.2, 0.15, z + 1.5], '#3a3a3e');
}

/** Overgrown ruins on the hermit path: 0 broken pillar (+ fallen drum), 1 ruined wall stub, 2 fallen arch. */
function buildRuin(kind: number, seed: number) {
  const b = new GB([0.8, 1.06]), g = new GB([1, 1]);
  const st = ['#9a958a', '#8c877c', '#a5a091'], moss = '#5f7a3a';
  const r = mulberry32(seed);
  if (kind === 0) {
    b.box(1.6, 0.3, 1.6, [0, 0.15, 0], st[1]);
    const h = 1.6 + r() * 1.6;
    b.cyl(0.5, 0.55, h, 10, [0, 0.3 + h / 2, 0], st[0]); b.cyl(0.52, 0.52, 0.12, 10, [0, 0.3 + h, 0], st[2], [0.15, 0, 0.1]);
    b.sph(0.35, [0.2, 0.4 + h * 0.4, 0.45], moss, [1, 0.5, 0.6], 6);
    b.cyl(0.5, 0.5, 1.1, 10, [1.5, 0.5, 0.6], st[2], [0, 0.4, Math.PI / 2]);   // fallen drum
  } else if (kind === 1) {
    for (let i = 0; i < 5; i++) {
      const h = 0.6 + r() * 2.2;
      b.box(0.95, h, 0.8, [-2 + i, h / 2, (r() - 0.5) * 0.15], st[i % 3]);
      if (r() < 0.6) b.sph(0.3, [-2 + i, h + 0.05, 0], moss, [1.2, 0.4, 1], 6);
    }
    for (let i = 0; i < 4; i++) b.box(0.5, 0.35, 0.45, [-1.8 + r() * 3.6, 0.18, 0.9 + r() * 0.6], st[i % 3], [0, r() * 2, 0]);
  } else {
    for (const sx of [-1, 1]) { b.box(0.7, 2.6, 0.7, [sx * 1.4, 1.3, 0], st[0]); b.sph(0.32, [sx * 1.4, 2.65, 0.2], moss, [1, 0.5, 1], 6); }
    b.box(3.6, 0.55, 0.7, [0.3, 0.35, 1.2], st[2], [0, 0.25, 0.12]);   // the fallen lintel
    b.box(0.6, 0.4, 0.5, [-0.6, 0.2, -0.9], st[1], [0, 0.7, 0]);
  }
  g.sph(0.06, [0, 0.05, 0], '#000000', 0.01, 3);
  return { b: b.build(), g: g.build() };
}

// --------------------------------------------------------------- landmarks ---
/** A raised district (townData TIERS): simple cream block retaining wall (big plain blocks, owner: "simple, not too
 *  detailed full bricks"), a paved top, a low parapet along the open edges with gaps for the stairs, and flights of
 *  steps with plain side walls + a lamp post at the foot. */
function addTier(b: GB, g: GB, T: TierSpec): void {
  const h = T.h, w = T.x1 - T.x0, d = T.z1 - T.z0, cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2, run = stairRun(h);
  const face = '#ddd6c4', joint = '#c2bba9', cap = '#ebe5d6';
  b.box(w, h, d, [cx, h / 2, cz], face, [0, 0, 0], [0.94, 1.02]);
  // (the top is the shared flagstone paving: buildTierTops)
  const sides: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];
  for (const side of sides) {
    if (tierEdgeOnWall(side, T)) continue;
    const alongX = side === 'N' || side === 'S', a0 = alongX ? T.x0 : T.z0, a1 = alongX ? T.x1 : T.z1;
    const f = side === 'N' ? T.z0 : side === 'S' ? T.z1 : side === 'W' ? T.x0 : T.x1, out = side === 'N' || side === 'W' ? -1 : 1;
    const P = (a: number, y: number, o = 0): [number, number, number] => alongX ? [a, y, f + out * o] : [f + out * o, y, a];
    // big plain blocks: one horizontal joint line per course, staggered vertical joints
    const rows = Math.max(1, Math.round(h / 0.55)), rh = h / rows;
    for (let r = 1; r < rows; r++) b.box(alongX ? a1 - a0 : 0.04, 0.05, alongX ? 0.04 : a1 - a0, P((a0 + a1) / 2, r * rh, 0.01), joint);
    for (let r = 0; r < rows; r++) for (let a = a0 + (r % 2 ? 0.8 : 1.6); a < a1 - 0.3; a += 1.6) b.box(alongX ? 0.05 : 0.04, rh - 0.06, alongX ? 0.04 : 0.05, P(a, r * rh + rh / 2, 0.01), joint);
    // parapet + cap, with gaps for the stairs
    const gaps = T.stairs.filter((st) => st.side === side).map((st) => [st.c - st.hw - 0.05, st.c + st.hw + 0.05]).sort((p, q) => p[0] - q[0]);
    let a = a0;
    const seg = (s0: number, s1: number) => { if (s1 - s0 < 0.2) return; const m = (s0 + s1) / 2, L = s1 - s0;
      b.box(alongX ? L : 0.42, 0.42, alongX ? 0.42 : L, P(m, h + 0.21, -0.21), face, [0, 0, 0], [0.94, 1.02]);
      b.box(alongX ? L + 0.06 : 0.52, 0.09, alongX ? 0.52 : L + 0.06, P(m, h + 0.46, -0.21), cap); };
    for (const [g0, g1] of gaps) { seg(a, g0); a = g1; }
    seg(a, a1);
  }
  // stairs: plain steps running outward + side walls stepping down, a lamp at each foot
  for (const st of T.stairs) {
    const n = Math.round(run / STEP_RUN), alongX = st.side === 'N' || st.side === 'S', out = st.side === 'N' || st.side === 'W' ? -1 : 1;
    const f = st.side === 'N' ? T.z0 : st.side === 'S' ? T.z1 : st.side === 'W' ? T.x0 : T.x1;
    const P = (a: number, y: number, o: number): [number, number, number] => alongX ? [a, y, f + out * o] : [f + out * o, y, a];
    for (let k = 0; k < n; k++) {
      const hh = h * (n - k) / n, o = STEP_RUN * (k + 0.5);
      b.box(alongX ? st.hw * 2 : STEP_RUN + 0.02, hh, alongX ? STEP_RUN + 0.02 : st.hw * 2, P(st.c, hh / 2, o), k % 2 ? '#e2dccb' : '#d9d2c0');
    }
    for (const sd of [-1, 1]) {
      const a = st.c + sd * (st.hw + 0.22);
      for (let k = 0; k < n; k++) { const hh = h * (n - k) / n + 0.35; b.box(alongX ? 0.44 : STEP_RUN + 0.02, hh, alongX ? STEP_RUN + 0.02 : 0.44, P(a, hh / 2, STEP_RUN * (k + 0.5)), face); }
      const [lx, , lz] = P(a, 0, run + 0.25);
      b.box(0.5, 0.5, 0.5, [lx, 0.25, lz], cap);
      b.cyl(0.06, 0.08, 1.7, 6, [lx, 1.35, lz], '#34343a'); b.box(0.3, 0.05, 0.3, [lx, 2.25, lz], '#2a2a2e');
      g.box(0.2, 0.26, 0.2, [lx, 2.08, lz], '#ffd070');
    }
  }
}

/** Flat tops of the raised districts + the castle terrace with the SAME flagstone texture / world-planar UVs as the ground paving (rendered with the paving material). */
function buildTierTops(): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const quad = (x0: number, x1: number, z0: number, z1: number, y: number) => { const o = pos.length / 3; pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); };
  for (const T of TIERS) quad(T.x0 + 0.1, T.x1 - 0.1, T.z0 + 0.1, T.z1 - 0.1, T.h + 0.04);
  quad(TERRACE.x0 + 0.15, TERRACE.x1 - 0.15, TERRACE.z0 + 0.15, TERRACE.z1 - 0.15, TERRACE.h + 0.04);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.setIndex(idx);
  return planarUv(tessellate(g, 2.5), FLAG_TILE);
}

/** The chapel's side door (west wall of the kit nave, out to the graveyard; interact spot = townData CHAPEL_SIDE): the v2 chapel has only
 *  the front door, so a small arched oak door, a stone frame, two steps and a lantern are added here (world coords at y 0). */
function addChapelSideDoor(b: GB, g: GB): void {
  const x0 = CHURCH.x - CHURCH.w / 2, z = CHAPEL_SIDE.z, STN = '#bcae90', LIGHT = '#f4ead3', OAK = '#9a6a40';
  b.box(0.34, 2.5, 1.7, [x0 - 0.1, 1.25, z], STN);
  b.cyl(0.85, 0.85, 0.34, 10, [x0 - 0.1, 2.5, z], STN, [0, 0, Math.PI / 2], [1, 1, 1]);
  b.box(0.24, 2.0, 1.15, [x0 - 0.22, 1.0, z], OAK);
  b.cyl(0.575, 0.575, 0.24, 10, [x0 - 0.22, 2.0, z], OAK, [0, 0, Math.PI / 2], [1, 1, 1]);
  b.box(0.1, 1.9, 0.07, [x0 - 0.36, 1.0, z], '#4d2e1c'); b.box(0.1, 0.1, 0.12, [x0 - 0.38, 1.0, z + 0.35], TOWN_GOLD);
  b.box(1.1, 0.2, 2.0, [x0 - 0.75, 0.1, z], LIGHT); b.box(0.6, 0.38, 1.7, [x0 - 0.5, 0.19, z], STN);
  b.box(0.08, 0.8, 0.08, [x0 - 0.3, 2.9, z + 1.1], '#34363d'); g.sph(0.17, [x0 - 0.3, 2.45, z + 1.1], '#ffd070', 1, 6);
}

/** The raised stone terrace in front of the keep: block + paved top, low parapet along the edges (gap for the stairs), a
 *  wide flight of steps with sloped balustrades and lamp posts, and the foundation the keep stands on. */
function addTerrace(b: GB, g: GB): void {
  const T = TERRACE, h = T.h, cx = (T.x0 + T.x1) / 2, w = T.x1 - T.x0, d = T.z1 - T.z0, cz = (T.z0 + T.z1) / 2;
  const st = '#a39d90', cap = '#c4beb0';
  b.box(w, h, d, [cx, h / 2, cz], st, [0, 0, 0], [0.8, 1.02]);
  const { x: kx, z: kz, w: kw, d: kd } = CASTLE;
  b.box(kw + 2.4, h, kd + 1.6, [kx, h / 2, kz - 0.4], st, [0, 0, 0], [0.8, 1.02]);   // the keep's foundation
  for (let x = T.x0 + 0.6; x < T.x1; x += 1.6) b.box(1.3, 0.12, 0.4, [x, h * 0.5, T.z1 + 0.02], '#958f82');      // stone courses on the front face
  // parapet: front (both sides of the stairs) + sides
  for (const sx of [-1, 1]) {
    const a = T.stairHw + 0.35, bb = sx < 0 ? -T.x0 : T.x1, len = bb - a;
    b.box(len, 0.55, 0.45, [sx * (a + len / 2), h + 0.27, T.z1 + 0.2], cap);
    for (let x = a + 0.2; x <= bb; x += 2.0) b.box(0.6, 0.75, 0.6, [sx * x, h + 0.37, T.z1 + 0.2], st);
    b.box(0.45, 0.55, d, [sx < 0 ? T.x0 + 0.2 : T.x1 - 0.2, h + 0.27, cz], cap);
  }
  // stairs: kit v3 stairs_stone (engine/townFill, stretched to the lift ramp); the lamp posts at the foot stay code-built
  for (const sx of [-1, 1]) {
    const x = sx * (T.stairHw + 0.3);
    b.box(0.7, 1.1, 0.7, [x, 0.55, T.stairZ + 0.1], st); b.box(0.85, 0.12, 0.85, [x, 1.14, T.stairZ + 0.1], cap);
    b.cyl(0.08, 0.08, 1.2, 6, [x, 1.8, T.stairZ + 0.1], '#2a2a2e'); g.sph(0.24, [x, 2.5, T.stairZ + 0.1], '#ffd070', 1, 8);
  }
}





/** The graveyard: gravestones, the crypt at the west end, a dead tree, lanterns, a gravel path, candles + flowers. */
function addGraveyard(b: GB, g: GB, rnd: () => number): void {
  const G = GRAVEYARD, st = '#8f8a80', st2 = '#a8a296', moss = '#5f7a3a';
  b.box(G.x1 - G.x0 - 1, 0.04, 2.0, [(G.x0 + G.x1) / 2 + 0.5, 0.02, G.pathZ], '#9a9080');   // gravel path
  b.box(1.8, 0.04, G.z1 - G.pathZ - 1, [G.gateX, 0.02, (G.pathZ + G.z1) / 2], '#9a9080');   // ... and from the south gate
  for (const [x, z, k] of GRAVES) {
    const tilt = (rnd() - 0.5) * 0.18, yaw = (rnd() - 0.5) * 0.25, face = z < G.pathZ ? 0 : Math.PI;   // stones face the path
    if (k === 0) { b.box(0.9, 1.0, 0.22, [x, 0.5, z], st, [tilt, yaw + face, 0]); b.box(1.0, 0.12, 0.3, [x, 1.02, z], st2, [tilt, yaw + face, 0]); }
    else if (k === 1) { b.box(0.2, 1.3, 0.2, [x, 0.65, z], st2, [tilt, yaw, 0]); b.box(0.8, 0.2, 0.2, [x, 0.95, z], st2, [tilt, yaw, 0]); }
    else { b.box(0.8, 0.8, 0.24, [x, 0.4, z], st, [tilt, yaw + face, 0]); b.cyl(0.4, 0.4, 0.24, 10, [x, 0.8, z], st, [Math.PI / 2, yaw + face, 0]); }
    b.box(0.9, 0.06, 1.5, [x, 0.03, z + (z < G.pathZ ? 0.95 : -0.95)], '#5a4a32');   // the mound
    if (rnd() < 0.5) b.sph(0.18, [x + 0.3, 0.12, z + (z < G.pathZ ? 1.2 : -1.2)], ['#ff7aa8', '#ffffff', '#c79bff'][(rnd() * 3) | 0], [1, 0.6, 1], 5);
    if (rnd() < 0.35) b.sph(0.22, [x - 0.35, 0.95, z], moss, [1.3, 0.4, 1], 5);
    if (rnd() < 0.3) { b.cyl(0.05, 0.05, 0.22, 6, [x + 0.4, 0.11, z + (z < G.pathZ ? 0.5 : -0.5)], '#f4ecd8'); g.sph(0.05, [x + 0.4, 0.27, z + (z < G.pathZ ? 0.5 : -0.5)], '#ffd070', [1, 1.6, 1], 5); }
  }
  // the crypt (door faces the path, east)
  const { x, z } = CRYPT;
  b.box(3.0, 0.4, 4.2, [x, 0.2, z], st);
  b.box(2.6, 2.6, 3.6, [x, 1.7, z], st2);
  b.prism(3.4, 1.2, 2.9, [x, 3.0, z], '#5e5a56', [0, Math.PI / 2, 0]);
  b.box(0.15, 1.8, 1.2, [x + 1.32, 1.3, z], '#2a241e'); b.cyl(0.6, 0.6, 0.15, 10, [x + 1.32, 2.2, z], '#2a241e', [0, 0, Math.PI / 2]);
  for (const sz of [-1, 1]) { b.cyl(0.18, 0.2, 2.6, 8, [x + 1.45, 1.5, z + sz * 0.95], st); g.sph(0.14, [x + 1.6, 2.2, z + sz * 1.3], '#9fe8ff', 1, 6); }
  b.box(0.2, 0.9, 0.2, [x, 4.0, z], st2); b.box(0.6, 0.18, 0.2, [x, 4.15, z], st2);
  // dead tree
  b.cyl(0.18, 0.32, 3.4, 6, [-34.2, 1.7, -38.4], '#3e3026', [0.08, 0, -0.06]);
  for (const [a, h, l] of [[0.6, 2.6, 1.6], [-0.9, 3.0, 1.3], [2.4, 2.2, 1.2]]) b.cyl(0.06, 0.12, l, 5, [-34.2 + Math.cos(a) * l * 0.4, h, -38.4 + Math.sin(a) * l * 0.4], '#3e3026', [Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9]);
  // lanterns on posts by the gates
  for (const [lx, lz] of [[-39.6, -20.6], [-36.4, -20.6], [-32.4, -29.6], [-32.4, -33.4]]) {
    b.box(0.14, 1.9, 0.14, [lx, 0.95, lz], '#2a2a2e'); b.box(0.32, 0.36, 0.32, [lx, 2.0, lz], '#2a2a2e'); g.sph(0.14, [lx, 2.0, lz], '#9fe8ff', 1, 6);
  }
}

// ------------------------------------------------------------------ plaza ---
/** The plaza (owner 2026-10-22: bare open paving, the floor is in buildGround): just the two little round plinths of the guardian statue_heroes (engine/townFill) beside the portal. */
function addPlaza(b: GB, g: GB): void {
  const D = PLAZA_DECOR, x = PLAZA.x, z = PLAZA.z;
  for (const m of PLAZA_STATUES) {                                                                      // the guardians' little round plinths
    b.cyl(D.plinthR + 0.12, D.plinthR + 0.16, 0.12, 24, [m.x, D.lawnY + 0.04, m.z], '#bdb5a3');
    b.cyl(D.plinthR - 0.1, D.plinthR, D.statueY - D.lawnY - 0.1, 24, [m.x, D.lawnY + 0.1 + (D.statueY - D.lawnY - 0.1) / 2, m.z], '#d6cfbd');
    b.torus(D.plinthR - 0.06, 0.035, [m.x, D.statueY - 0.03, m.z], TOWN_GOLD, [Math.PI / 2, 0, 0], 1, 28);
  }
  // (owner 2026-10-23: the statues stand straight on the paving, no grass bed / flowers / ring)
  g.sph(0.05, [x, 0.01, z], '#000000', 0.01, 3);
}


// ------------------------------------------------------------------- lots ---
/** One cottage lot's built dressing (the plants / bench / bushes are kit pieces, engine/townFill): stepping-stone pavers from the gate to the door, a mailbox by the gate, and for the
 *  adventurer's lot (owner: "unique") a blue-and-gold gate arch, a flag pole with a pennant and a red welcome rug. World-space geometry, y 0. */
function addLot(b: GB, g: GB, L: Lot): void {
  const h = HOUSES[L.i], kt = HOUSE_KIT[h.kit!] ?? HOUSE_KIT.house_small, s = h.s ?? 1, front = kt.front * s, ry: [number, number, number] = [0, L.rot, 0];
  const W = (lx: number, lz: number): [number, number, number] => { const q = lotW(L, lx, lz); return [q[0], 0, q[1]]; };
  const at = (lx: number, y: number, lz: number): [number, number, number] => { const q = W(lx, lz); return [q[0], y, q[2]]; };
  // pavers
  const n = Math.max(2, Math.round((L.zf - front) / 0.75));
  for (let i = 0; i < n; i++) { const t = i / n, lz = L.zf - 0.2 - t * (L.zf - front - 0.1); b.cyl(0.3, 0.32, 0.05, 8, at(L.gx + (i % 2 ? 0.12 : -0.12), 0.04, lz), i % 2 ? '#efe7d2' : '#e3d9c0', [0, i, 0], [1.15, 1, 0.9]); }
  // mailbox (blue box on a post, a little red flag) just right of the gate
  const mx = L.gx + L.gw / 2 + 0.55, mz = L.zf - 0.2;
  b.box(0.1, 0.95, 0.1, at(mx, 0.48, mz), '#7a5230', ry); b.box(0.42, 0.3, 0.62, at(mx, 1.05, mz), '#3d63b8', ry); b.box(0.44, 0.08, 0.64, at(mx, 1.22, mz), '#ffd070', ry);
  b.box(0.04, 0.22, 0.04, at(mx + 0.24, 1.2, mz - 0.1), '#d64a3a', ry);
  if (!L.hero) return;
  // the adventurer's gate arch: two blue posts, a gold beam and a little roof, a hanging gold star
  for (const sx of [-1, 1]) { const px = L.gx + sx * (L.gw / 2 + 0.1); b.box(0.28, 3.1, 0.28, at(px, 1.55, L.zf), '#3d63b8', ry); b.sph(0.2, at(px, 3.2, L.zf), '#ffd070', 1, 6); }
  b.box(L.gw + 0.9, 0.3, 0.34, at(L.gx, 3.05, L.zf), '#ffd070', ry); b.box(L.gw + 0.5, 0.2, 0.5, at(L.gx, 3.3, L.zf), '#3d63b8', ry);
  g.octa(0.22, at(L.gx, 2.2, L.zf), '#fff0a0');
  // flag pole + pennant (front-left corner)
  const fx = -L.hx + 0.7, fz = L.zf - 0.8;
  b.cyl(0.06, 0.08, 4.6, 6, at(fx, 2.3, fz), '#e8e0cc'); b.sph(0.14, at(fx, 4.65, fz), '#ffd070', 1, 6);
  b.box(1.1, 0.7, 0.04, at(fx + 0.6, 4.2, fz), '#3d63b8', ry); b.box(1.0, 0.1, 0.05, at(fx + 0.6, 4.2, fz), '#ffd070', ry);
  // welcome rug on the path to the door
  b.box(1.5, 0.04, 1.0, at(L.gx, 0.05, front + 0.6), '#c9453a', ry); b.box(1.3, 0.045, 0.14, at(L.gx, 0.055, front + 0.6), '#ffd070', ry);
}

// -------------------------------------------------------------------- gate ---
/** The town gate's arch (owner 2026-10-21: the v2 gatehouse was a solid black box): a real round passage cut through a stone block between the two kit v3 wall_tower_round
 *  towers (engine/townFill / natureLayout, GATE_TOWER), the oak doors swung open into the town, a raised portcullis, hanging lanterns and wall torches (lit underside). */
function buildGateArch(b: GB, g: GB): void {
  gateArch(b, g, GATE.x, GATE.z, { hp: GATE_TOWER.x - GATE_TOWER.r - 0.15, W: 5.2, depth: 2.6, H: 8.6, spring: 3.1, ry: 2.3, doors: true });
}
/** A gatehouse arch in local frame (passage along z through a block spanning x): the main gate, and (owner 2026-10-23) the smaller side gates. */
interface ArchP { hp: number; W: number; depth: number; H: number; spring: number; ry: number; doors: boolean }
function gateArch(b: GB, g: GB, x: number, z: number, P: ArchP): void {
  const { hp, depth, H, spring, ry, W } = P, k = H / 8.6;
  const STN = '#bfb8a8', TRIM = '#e4dcc8', IRON = '#34343a';
  // the wall block with the arch cut out of it (extruded shape: outer rectangle, elliptical-arch hole)
  const outer = new Shape(); outer.moveTo(-W, 0); outer.lineTo(W, 0); outer.lineTo(W, H); outer.lineTo(-W, H); outer.closePath();
  const hole = new Path(); hole.moveTo(-hp, 0); hole.lineTo(-hp, spring); hole.absellipse(0, spring, hp, ry, Math.PI, 0, true); hole.lineTo(hp, 0); hole.closePath();
  outer.holes.push(hole);
  b.add(new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 14 }), [x, 0, z - depth / 2], [0, 0, 0], 1, STN, [0.9, 1.06]);
  // a lighter arch ring, a little proud on both faces
  const ringO = new Shape(); const ro = hp + 0.5 * k;
  ringO.moveTo(-ro, 0); ringO.lineTo(-ro, spring); ringO.absellipse(0, spring, ro, ry + 0.5 * k, Math.PI, 0, true); ringO.lineTo(ro, 0); ringO.lineTo(hp, 0); ringO.lineTo(hp, spring); ringO.absellipse(0, spring, hp, ry, 0, Math.PI, false); ringO.lineTo(-hp, 0); ringO.closePath();
  b.add(new ExtrudeGeometry(ringO, { depth: depth + 0.3, bevelEnabled: false, curveSegments: 14 }), [x, 0, z - depth / 2 - 0.15], [0, 0, 0], 1, TRIM, [1, 1]);
  b.box(0.7 * k, 0.5 * k, depth + 0.5, [x, spring + ry + 0.55 * k, z], TOWN_GOLD);                                              // keystone
  // cornice + battlements on the block between the towers
  b.box(2 * W - 0.8, 0.4 * k, depth + 0.5, [x, H + 0.2 * k, z], '#a79f8e'); b.box(2 * W - 1.2, 0.18 * k, depth + 0.7, [x, H + 0.5 * k, z], '#d8d0bc');
  const nB = Math.max(3, Math.round((2 * W - 1.6) / 1.6)), step = (2 * W - 2.4) / (nB - 1);
  for (const sz of [1, -1]) for (let i = 0; i < nB; i++) b.box(1.05 * k, 0.85 * k, 0.9 * k, [x - (W - 1.2) + i * step, H + 0.95 * k, z + sz * (depth - 0.8 * k) / 2], '#b3ac9c');
  if (P.doors) for (const sx of [-1, 1]) {   // the two oak doors, swung open INTO the town (hinged on the north face of the passage, lying along its walls)
    const hx = sx * (hp - 0.1), hz = z - depth / 2 + 0.05, len = 2.3 * k, dh = 3.4 * k;
    b.box(0.16, dh, len, [x + hx, dh / 2, hz - len / 2], '#7a5230', [0, 0, 0]);
    for (const y of [0.16, 0.5, 0.84]) b.box(0.2, 0.16, len + 0.04, [x + hx, dh * y, hz - len / 2], IRON);
    for (let q = 0; q < 4; q++) b.box(0.2, dh, 0.07, [x + hx, dh / 2, hz - 0.35 * k - q * 0.55 * k], '#5c3c20');
    b.box(0.3, 0.22, 0.3, [x + hx, 0.5 * k, hz], IRON); b.box(0.3, 0.22, 0.3, [x + hx, 2.9 * k, hz], IRON);
  }
  // raised portcullis: the iron grille tucked up inside the arch (bars end in points above the opening)
  for (let i = 0; i < 9; i++) b.box(0.08, 1.35 * k, 0.1, [x - hp + 0.42 * k + i * ((2 * hp - 0.84 * k) / 8), spring + ry - 0.55 * k - 0.15 * k * Math.abs(i - 4) / 4, z + 0.55 * k], IRON);
  b.box(2 * hp - 0.3, 0.1, 0.12, [x, spring + 1.5 * k, z + 0.55 * k], IRON); b.box(2 * hp - 0.3, 0.1, 0.12, [x, spring + 0.65 * k, z + 0.55 * k], IRON);
  // lit underside: two hanging lanterns inside the arch + torches on the passage walls
  for (const lx of [-0.48 * hp, 0.48 * hp]) { b.cyl(0.02, 0.02, 0.9 * k, 4, [x + lx, spring + ry - 0.45 * k, z], IRON); b.box(0.34 * k, 0.06, 0.34 * k, [x + lx, spring + ry - 1.1 * k, z], IRON); g.box(0.24 * k, 0.34 * k, 0.24 * k, [x + lx, spring + ry - 1.3 * k, z], '#ffd070'); b.box(0.34 * k, 0.06, 0.34 * k, [x + lx, spring + ry - 1.5 * k, z], IRON); }
  for (const sx of [-1, 1]) for (const dz of [-0.7 * k, 0.7 * k]) { b.box(0.2, 0.7 * k, 0.08, [x + sx * (hp - 0.1), 2.6 * k, z + dz], IRON); g.sph(0.17 * k, [x + sx * (hp - 0.25), 3.1 * k, z + dz], '#ffb04a', [1, 1.4, 1], 6); }
  // banners on the block's faces and the cornice
  for (const dz of [-1, 1]) { b.box(2.4 * k, 2.4 * k, 0.1, [x, 6.3 * k, z + dz * (depth / 2 + 0.3)], '#2f58b0'); g.box(2.0 * k, 0.07, 0.04, [x, 7.4 * k, z + dz * (depth / 2 + 0.37)], '#ffd070'); g.box(2.0 * k, 0.07, 0.04, [x, 5.3 * k, z + dz * (depth / 2 + 0.37)], '#ffd070'); }
}
/** (owner 2026-10-23) the side gates (townData SIDE_GATES): a smaller copy of the main gate between their two small towers, the passage running east-west.
 *  The East Gate has no open doors here: while its guard holds it, closed doors stand in the passage (render/TownGates, gate 'east'). */
export const SIDE_ARCH: ArchP = { hp: SIDE_GATE.off - SIDE_GATE.r - 0.12, W: SIDE_GATE.off, depth: 1.9, H: 6.2, spring: 2.5, ry: 1.55, doors: true };
function buildSideGateArch(east: boolean): { b: BufferGeometry; g: BufferGeometry } {
  const tb = new GB([1, 1]), tg = new GB([1, 1]);
  gateArch(tb, tg, 0, 0, { ...SIDE_ARCH, doors: !east });
  return { b: tb.build(), g: tg.build() };
}

/** A free-standing stone gateway on an outskirts road (local frame: passage along z, origin = road centre): a short wall block with an arched opening, a lighter arch ring, keystone, battlements and a banner each side. */
function buildWayGate(b: GB, g: GB, accent: string): void {
  const hp = GATEWAY.hp, depth = 1.6, H = 4.4, spring = 2.3, ry = 1.5, W = GATEWAY.px + GATEWAY.pr + 0.1;
  const outer = new Shape(); outer.moveTo(-W, 0); outer.lineTo(W, 0); outer.lineTo(W, H); outer.lineTo(-W, H); outer.closePath();
  const hole = new Path(); hole.moveTo(-hp, 0); hole.lineTo(-hp, spring); hole.absellipse(0, spring, hp, ry, Math.PI, 0, true); hole.lineTo(hp, 0); hole.closePath(); outer.holes.push(hole);
  // (the passage runs along z, so the block is extruded across x: rotate the shape's x axis onto the road's side axis)
  b.add(new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 14 }), [0, 0, -depth / 2], [0, 0, 0], 1, '#cbc4b2', [0.92, 1.05]);
  const ringO = new Shape(), ro = hp + 0.4;
  ringO.moveTo(-ro, 0); ringO.lineTo(-ro, spring); ringO.absellipse(0, spring, ro, ry + 0.4, Math.PI, 0, true); ringO.lineTo(ro, 0); ringO.lineTo(hp, 0); ringO.lineTo(hp, spring); ringO.absellipse(0, spring, hp, ry, 0, Math.PI, false); ringO.lineTo(-hp, 0); ringO.closePath();
  b.add(new ExtrudeGeometry(ringO, { depth: depth + 0.24, bevelEnabled: false, curveSegments: 14 }), [0, 0, -depth / 2 - 0.12], [0, 0, 0], 1, '#ece4d0', [1, 1]);
  b.box(0.5, 0.4, depth + 0.4, [0, spring + ry + 0.45, 0], accent);   // keystone
  b.box(2 * W + 0.3, 0.3, depth + 0.4, [0, H + 0.15, 0], '#a79f8e');
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) b.box(0.8, 0.6, depth * 0.8, [sx * (hp + 0.55 + i * 1.05), H + 0.6, 0], '#b9b2a2');
  for (const sx of [-1, 1]) for (const dz of [-1, 1]) { b.box(0.06, 1.9, 0.06, [sx * (hp + 0.5), 3.0, dz * (depth / 2 + 0.2)], '#6a5238'); b.box(0.04, 1.5, 0.9, [sx * (hp + 0.5) + dz * 0.0, 3.0, dz * (depth / 2 + 0.2)], accent); }
  g.box(0.2, 0.3, 0.2, [0, spring + ry - 0.35, 0], '#ffd070');
}

function buildTown() {
  const chunks = new Map<string, Chunk>();
  const at = (x: number, z: number): Chunk => {
    const k = Math.floor((x + 80) / CH) + ',' + Math.floor((z + 80) / CH);
    let c = chunks.get(k);
    if (!c) { c = { b: new GB([1, 1]), g: new GB([1, 1]) }; chunks.set(k, c); }
    return c;
  };
  const put = (x: number, z: number, rot: number, geos: { b: BufferGeometry; g: BufferGeometry }) => {
    const c = at(x, z), y = townLift(x, z);   // (raised districts: everything on them stands on the tier top)
    c.b.addColored(geos.b, [x, y, z], [0, rot, 0]); c.g.addColored(geos.g, [x, y, z], [0, rot, 0]);
    geos.b.dispose(); geos.g.dispose();
  };
  /** Build world-space geometry at y = 0 and drop it into the chunk at (x, z), lifted onto the ground there. */
  const lifted = (x: number, z: number, fn: (b: GB, g: GB) => void) => {
    const y = townLift(x, z), c = at(x, z);
    if (y <= 0) { fn(c.b, c.g); return; }
    const tb = new GB([1, 1]), tg = new GB([1, 1]); fn(tb, tg);
    const kb = tb.build(), kg = tg.build(); c.b.addColored(kb, [0, y, 0]); c.g.addColored(kg, [0, y, 0]); kb.dispose(); kg.dispose();
  };
  for (const T of TIERS) { const c = at((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2); addTier(c.b, c.g, T); }
  HOUSES.forEach((h, i) => { if (!h.kit && !h.nk) put(h.x, h.z, h.rot, buildHouse(h, i)); });   // (every house is a Blender kit piece: town_kit_v2 in render/townKit.tsx, the farm buildings nature_kit_v1 in render/NatureScenery.tsx)
  { const c = at(CASTLE.x, CASTLE.z); addTerrace(c.b, c.g); }
  lifted(CHURCH.x - 3, CHURCH.z, (b, g) => addChapelSideDoor(b, g));   // (keep, chapel, tavern: town_kit_v2, render/townKit.tsx)
  { const c = at(PLAZA.x, PLAZA.z); addPlaza(c.b, c.g); }
  lifted(BOSS_PORTAL.x, BOSS_PORTAL.z, (b, g) => addBossIsland(b, g));   // (owner 2026-10-31: the Boss Trials headland: dais, pillars, runes, banners, altar, lanterns, lookout deck)
  // (owner 2026-10-24) every flower box gets a flat green lawn top (a plain rounded green slab, not grass blades)
  for (const p of PLANTERS) { const along = p.w >= p.d, len = Math.max(p.w, p.d), wid = Math.min(p.w, p.d); at(p.x, p.z).b.box(len * 0.88, 0.06, wid * 0.72, [p.x, townLift(p.x, p.z) + PLANTER_TOP, p.z], '#7cbf4e', [0, along ? 0 : Math.PI / 2, 0]); }
  { const c = at(GATE.x, GATE.z); buildGateArch(c.b, c.g); }
  for (const sg of SIDE_GATES) put(sg.x, sg.z, Math.PI / 2, buildSideGateArch(sg.x > 0));   // (local passage along z -> world along x)
  for (const w of GATEWAYS) { const wb = new GB([1, 1]), wg = new GB([1, 1]); buildWayGate(wb, wg, w.name === 'beach' ? '#2f8fd0' : '#d08a2f'); put(w.x, w.z, w.rot, { b: wb.build(), g: wg.build() }); }
  for (const L of LOTS) lifted(L.x, L.z, (b, g) => addLot(b, g, L));
  lifted(-38, -30, (b, g) => addGraveyard(b, g, mulberry32(777)));
  // (benches: nature_kit_v1 park_bench at every TOWN_SEATS spot, render/NatureScenery.tsx)
  { const c = at(HERMIT_CAMP.x, HERMIT_CAMP.z); addCamp(c.b, c.g, HERMIT_CAMP.x, HERMIT_CAMP.z); }
  RUINS.forEach((r, i) => put(r.x, r.z, r.rot, buildRuin(r.kind, 900 + i)));
  // (the boulders on the back trail are nature_kit_v1 rock_round pieces, render/NatureScenery.tsx; colliders: townData TRAIL_ROCKS)
  // (gate, wall runs and wall towers: Blender kit, render/townKit.tsx)
  // (fences: nature_kit_v1 fence_wood along every FENCES run, market carts: market_cart; render/NatureScenery.tsx)
  const pr = mulberry32(555);
  const paving = buildPaving();
  for (const pts of paving.patches) {
    let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
    lifted(cx, cz, (b) => { addPatchKerb(b, pts, pr); if (townLift(cx, cz) > 0) addGrassCap(b, pts); });   // (on a raised district: a grass top, the lawn below is covered)
  }
  addFarm(at(FARM.x, FARM.z).b);
  for (const F of FIELDS) addField(at(F.x, F.z).b, F);
  // (both bridges are kit v3 bridge_stone_arch / bridge_wood_small, render/natureLayout; the railing colliders are townData TOWN_COLLIDERS)
  addRiverBanks(at((RIVER.x0 + RIVER.x1) / 2, 68).b, mulberry32(4711));
  const out: { body: BufferGeometry; glow: BufferGeometry }[] = [];
  chunks.forEach((c) => out.push({ body: c.b.build(), glow: c.g.build() }));
  return { chunks: out, roads: buildRoads(), paving: paving.geo, tops: buildTierTops() };
}

/** Instanced trees (nature geometry from models.ts), one draw call per species. Colliders: TOWN_COLLIDERS. */
/** The lake west of the town: animated water surface, sandy shore line, reeds and a few shore rocks. */
function Lake() {
  const { water, sea, shore, mat, shoreMat, field } = useMemo(() => {
    const w = LAKE.x1 - LAKE.x0 + 10, d = LAKE.z1 + 10 - LAKE.z0;   // (+10: the wavy south shore, townData.lakeSouth)
    const lakeG = new PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2).translate((LAKE.x0 + LAKE.x1) / 2 - 3, -0.15, (LAKE.z0 + LAKE.z1 + 10) / 2);
    // the river south of the gate (same water, joins the lake at its west end)
    const riverG = new PlaneGeometry(RIVER.x1 + 1.5 - LAKE.x1 + 6, RIVER.z1 - RIVER.z0 + 6, 1, 1).rotateX(-Math.PI / 2).translate((RIVER.x1 + 1.5 + LAKE.x1 - 6) / 2, -0.2, (RIVER.z0 + RIVER.z1) / 2);
    // stylised water (render/waterFx.ts): the lake + river are ONE merged mesh; the shore distance is baked once from groundY
    const lakeX0 = (LAKE.x0 + LAKE.x1) / 2 - 3 - w / 2, lakeX1 = lakeX0 + w, lakeZ0 = LAKE.z0, lakeZ1 = LAKE.z1 + 10;
    const rvX0 = LAKE.x1 - 6, rvX1 = RIVER.x1 + 1.5, rvZ0 = RIVER.z0 - 3, rvZ1 = RIVER.z1 + 3;
    // ONE shore field for the lake, the river AND the surrounding sea: water wherever the ground is below the water line (the field's edge texels
    // are deep sea, so the rest of the sea, far beyond it, reads as open water)
    const B = GROUND_BOX, fx0 = B.x0 - 8, fz0 = B.z0 - 8, fx1 = B.x1 + 8, fz1 = B.z1 + 8;
    const field = bakeShoreField(fx0, fz0, fx1 - fx0, fz1 - fz0, 0.9, 10, (x, z) =>
      (x > rvX0 && x < rvX1 && z > rvZ0 && z < rvZ1 && groundY(x, z) < -0.2) || groundY(x, z) < SEA_Y);
    // the open sea: a ring from just inside the island's edge out to the horizon (fog hides its far edge), at the lake's water level
    const SEG = 360, R_OUT = 700, ringPos = new Float32Array(SEG * 2 * 3), ringIdx: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, rin = Math.max(2, edgeR(a) - 3);
      ringPos.set([Math.cos(a) * rin, SEA_Y, Math.sin(a) * rin, Math.cos(a) * R_OUT, SEA_Y, Math.sin(a) * R_OUT], i * 6);
      const n = (i + 1) % SEG; ringIdx.push(i * 2, n * 2, i * 2 + 1, n * 2, n * 2 + 1, i * 2 + 1);
    }
    const sea = new BufferGeometry();
    sea.setAttribute('position', new Float32BufferAttribute(ringPos, 3)); sea.setIndex(ringIdx);
    const water = mergeGeometries([lakeG, riverG], false)!;
    lakeG.dispose(); riverG.dispose();
    const mat = makeWaterMaterial({ shore: 'tex', field, span: 8 });
    const b = new GB([0.85, 1.05]), rnd = mulberry32(303);
    // sandy shore strip + reeds + rocks along the waterline
    for (let z = LAKE.z0 + 16; z < LAKE.z1 - 16; z += 3) {
      if (z > BEACH.z0 - 9 && z < BEACH.z1 + 8) { rnd(); continue; }   // the beach stretch has its own shore (render/Beach.tsx)
      if (z > riverBank(LAKE.x1, 0) - 3 && z < riverBank(LAKE.x1, 1) + 3) { rnd(); continue; }   // (no slab floating in the river mouth)
      if (z > MAIN_BEACH.z0 - 6 && z < MAIN_BEACH.z1 + 6) { rnd(); continue; }   // (the mainland beach has its own sand)
      { const r = 2.1 + rnd() * 0.4, sx = LAKE.x1 - 0.6 + (rnd() - 0.5) * 0.8; if (groundY(sx, z) > -0.6) b.cyl(r, r + 0.15, 0.12, 14, [sx, -0.08, z], '#d9c99e'); }   // (rounded, not slabs; none out in the open sea)
      if (rnd() < 0.55) for (let k = 0; k < 4; k++) { const rx = LAKE.x1 - 2.4 - rnd() * 2.2, rz = z + (rnd() - 0.5) * 2.6, h = 1.0 + rnd() * 0.9; if (groundY(rx, rz) < -0.9) continue; b.cyl(0.03, 0.05, h, 4, [rx, h / 2 - 0.2, rz], k % 2 ? '#6f8f3a' : '#5d7d2e', [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]); if (k === 0) b.cyl(0.07, 0.07, 0.3, 5, [rx, h - 0.1, rz], '#6a4a2a'); }
      rnd(); rnd(); rnd();   // (the shore rocks are nature_kit_v1 rock_round pieces, render/NatureScenery.tsx)
      if (rnd() < 0.12) { const lx = LAKE.x1 - 6 - rnd() * 6; if (groundY(lx, z) > -1.4) b.cyl(0.5, 0.5, 0.06, 10, [lx, -0.1, z], '#4f8f3e'); }   // lily pad (shallows only)
    }
    // (the old small dock here was replaced by the beach pier, render/Beach.tsx)
    // (the mainland beach is painted into the ground like the lakeside one: engine/beachData MAIN_BEACH, palms in render/Beach)
    const shore = b.build();
    return { water, sea, shore, mat, shoreMat: litMat({ roughness: 0.9 }), field };
  }, []);
  useEffect(() => () => { water.dispose(); sea.dispose(); shore.dispose(); field.tex.dispose(); mat.dispose(); shoreMat.dispose(); }, [water, sea, shore, mat, shoreMat, field]);
  return (
    <>
      <mesh geometry={water} material={mat} renderOrder={1} />
      <mesh geometry={sea} material={mat} renderOrder={1} frustumCulled={false} />
      <mesh geometry={shore} material={shoreMat} castShadow receiveShadow />
    </>
  );
}

/** Gold arrow on the ground beside the hero pointing at the town gate (like the exit-portal guides in rooms); hidden near the gate. */
// (replaced by render/GuideArrow.tsx, which is quest-aware)
export function GateGuideOld() {
  const geo = useMemo(() => new ConeGeometry(0.55, 1.5, 3).rotateX(Math.PI / 2), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, color: new Color('#f2c14e') }), []);
  const ref = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const m = ref.current; if (!m) return;
    const p = world.player.pos, st = useGameStore.getState().status;
    const dx = GATE.x - p.x, dz = GATE.z - p.z, d = Math.hypot(dx, dz);
    m.visible = st === GameStatus.MENU && useUiStore.getState().titleDone && d > 14;
    if (!m.visible) return;
    const k = 4.2 + Math.sin(clock.elapsedTime * 5) * 0.25;
    m.position.set(p.x + (dx / d) * k, 0.25, p.z + (dz / d) * k);
    m.rotation.y = Math.atan2(dx, dz);
  });
  return <mesh ref={ref} geometry={geo} material={mat} visible={false} renderOrder={5} />;
}

/** One merged town chunk (body + glow), hidden past the fog by the draw-distance culler (render/distCull). */
function TownChunk({ body, glow, lit, glowMat, shadows }: { body: BufferGeometry; glow: BufferGeometry; lit: Mat3; glowMat: Mat3; shadows: boolean }) {
  const g = useRef<Group3>(null!);
  useEffect(() => { if (!body.boundingSphere) body.computeBoundingSphere(); const s = body.boundingSphere!; return cullRegister(g.current, s.center.x, s.center.z, s.radius, false); }, [body]);
  return (
    <group ref={g}>
      <mesh geometry={body} material={lit} castShadow={shadows} receiveShadow={shadows} />
      {(glow.attributes.position?.count ?? 0) > 0 && <mesh geometry={glow} material={glowMat} />}
    </group>
  );
}

/** Thin smoke curling out of the cottage chimneys near the hero (existing FX pool: no extra draw calls; the pool's own quality gate thins it on phones). */
const CHIMNEYS: [number, number, number][] = HOUSES.filter((h) => h.chimney).map((h) => {
  if (h.nk) { const k = NK_CHIMNEY[h.nk] ?? [0, 5, 0], s = h.s ?? 1; return [h.x + k[0] * s, k[1] * s + 0.4 + townLift(h.x, h.z), h.z + k[2] * s]; }   // (nature kit: the farmhouse's chimney cap)
  if (h.kit) { const k = HOUSE_KIT[h.kit].chimney, s = h.s ?? 1, c = Math.cos(h.rot), sn = Math.sin(h.rot); return [h.x + k[0] * s * c + k[2] * s * sn, k[1] * s + 0.4 + townLift(h.x, h.z), h.z - k[0] * s * sn + k[2] * s * c]; }   // (turned houses: chimney cap rotated with the piece)   // (v2 kit: chimney cap position from the Blender script)
  const top = 0.6 + h.floors * 2.7, rh = Math.min(h.w, h.d) * 0.55 + 1.1, lx = h.w * 0.24, lz = -h.d * 0.2, c = Math.cos(h.rot), s = Math.sin(h.rot);
  return [h.x + lx * c + lz * s, top + rh + 1.45 + townLift(h.x, h.z), h.z - lx * s + lz * c];
});
function ChimneySmoke({ q }: { q: QualityCfg }) {
  const on = q.fxScale >= 0.7;   // (a live smoke particle keeps the FX pool uploading: skipped on the low / phone tiers)
  useFrame((_, dt0) => {
    if (!on || useGameStore.getState().status === GameStatus.PAUSED) return;
    const dt = Math.min(dt0, 0.05), px = world.player.pos.x, pz = world.player.pos.z;
    for (let i = 0; i < CHIMNEYS.length; i++) {
      const c = CHIMNEYS[i], dx = c[0] - px, dz = c[2] - pz;
      if (dx * dx + dz * dz < 900 && Math.random() < dt * 0.8) smokePuff(c[0], c[1], c[2], 1, 0xc9c5be, 1.5, 3.0, 1.1, 0.25, 0.32);
    }
  });
  return null;
}

export function TownScenery({ q }: { q: QualityCfg }) {
  const town = useMemo(() => buildTown(), []);
  const mats = useMemo(() => { const flagTex = flagTexture(); return {
    lit: litMat({ roughness: 0.85 }),
    road: (() => { const m = litMat({ roughness: 1, flatShading: false }); m.map = flagTex;   /* (no polygonOffset: on the big flat paving it drew thin streaks; the layers are cm apart anyway) */ return m; })(),
    paving: (() => { const m = litMat({ roughness: 1, flatShading: false }); m.map = flagTex; return m; })(),
    tops: (() => { const m = litMat({ roughness: 1, flatShading: false }); m.map = flagTex; return m; })(),
    glow: nightGlow(new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) })),
    ring: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    dirt: litMat({ roughness: 1 }),
    beam: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }; }, []);
  useEffect(() => () => {
    town.chunks.forEach((c) => { c.body.dispose(); c.glow.dispose(); }); town.roads.dispose(); town.paving.dispose(); town.tops.dispose();
    mats.lit.dispose(); mats.road.map?.dispose(); mats.road.dispose(); mats.paving.dispose(); mats.tops.dispose(); forgetNightGlow(mats.glow); mats.glow.dispose(); mats.ring.dispose(); mats.beam.dispose();
  }, [town, mats]);
  const ring = useRef<Mesh>(null!), beam = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.ring.opacity = 0.22 + 0.16 * Math.sin(t * 2.2);
    mats.beam.opacity = 0.1 + 0.05 * Math.sin(t * 1.7);
    // the light column + ground ring stand where the main quest continues (an NPC, a shop, the castle door), else on
    // the gate; hidden while the step is done from the bag
    // (questNav.mainNav: the same target the guide arrow and the tracker auto-path use)
    // (owner) no ray on the Adventure Portal: when the quest leads out to a run (or the step is done in the field) it is hidden
    const ms = world.village.area === 'TOWN' ? mainNav() : null, hide = !ms || !!ms.field;
    let bx = PORTAL.x, bz = PORTAL.front.z;
    if (ms && !ms.field) { bx = ms.x; bz = ms.z; if (ms.act === 'castle') bz -= 0.5; }
    if (beam.current) { beam.current.position.set(bx, 18, bz); beam.current.visible = !hide; }
    if (ring.current) { ring.current.position.set(bx, 0.12 + townLift(bx, bz), bz); ring.current.visible = !hide; }
  });
  const shadows = q.shadowMap > 0;
  return (
    <group>
      <mesh geometry={town.paving} material={mats.paving} receiveShadow={shadows} />
      <mesh geometry={town.tops} material={mats.tops} receiveShadow={shadows} />
      <mesh geometry={town.roads} material={mats.road} receiveShadow={shadows} />
      <ChimneySmoke q={q} />
      <Lake />
      <PlazaFountain shadows={shadows} />
      <React.Suspense fallback={null}><TownKit lit={mats.lit} glow={mats.glow} shadows={shadows} /></React.Suspense>
      <React.Suspense fallback={null}><VillageQt lit={mats.lit} shadows={shadows} /></React.Suspense>
      {town.chunks.map((c, i) => <TownChunk key={i} body={c.body} glow={c.glow} lit={mats.lit} glowMat={mats.glow} shadows={shadows} />)}
      <mesh ref={ring} material={mats.ring} position={[GATE.x, 0.12, GATE.z - 1]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.6, 4.0, 40]} /></mesh>
      <mesh ref={beam} material={mats.beam} position={[GATE.x, 18, GATE.z - 1]}><cylinderGeometry args={[1.0, 1.7, 36, 14, 1, true]} /></mesh>
    </group>
  );
}
