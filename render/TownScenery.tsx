// Town scenery: houses, market stalls, well, fences, lamp posts, roads/plaza and the town gate.
// Everything static is merged into per-chunk vertex-coloured meshes (frustum-culled by three), roads and the plaza
// are one flat mesh without shadows, lamp bulbs are emissive only (no real lights).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Path, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, Sprite } from 'three';
import { GB, TAU, litMat, mulberry32, setInst } from './util';
import { Inst } from './Inst';
import { useNature } from './models';
import { labelMaterial } from './label';
import {
  GATE, HOUSES, STALLS, ROADS, FENCES, LAMPS, PLAZA, WELL_POS, SIGNS, WALL, WALL_RUNS, WALL_TOWERS, PLANTERS, TOWN_TREES, GRASS_PATCHES, FARM, SCARECROW, HAYSTACK,
  HouseSpec, StallSpec, TowerSpec, PlanterSpec, TreeSpec,
} from '../engine/townData';
import { QualityCfg } from './quality';

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
  const ridgeC = darker(h.roof, 0.72);
  // stone footing + walls
  b.box(w + 0.7, base, d + 0.7, [0, base / 2, 0], STONE);
  b.box(w, wallH, d, [0, base + wallH / 2, 0], h.wall, [0, 0, 0], [0.86, 1]);
  if (h.floors === 2) b.box(w + 0.2, 0.22, d + 0.2, [0, base + 2.7, 0], WOOD);
  // timber frame: corner posts + front rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, wallH + 0.1, 0.3, [sx * (w / 2), base + wallH / 2 + 0.05, sz * (d / 2)], WOOD);
  b.box(w + 0.2, 0.26, 0.3, [0, top - 0.12, d / 2 + 0.02], WOOD); b.box(w + 0.2, 0.2, 0.3, [0, base + 1.25, d / 2 + 0.02], WOOD);
  // big gabled roof, ridge beam, diagonal eave braces
  const rh = Math.min(w, d) * 0.55 + 1.1;
  b.prism(w + 1.6, rh, d + 1.5, [0, top, 0], h.roof, [0, 0, 0], [0.78, 1.08]);
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
  awning(b, ax0, ax1, ay, az, '#e6dac0', '#e6dac0');
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
  else if (idx % 3 === 1) { b.box(0.9, 0.8, 0.9, [bx, 0.4, d / 2 - 0.5], '#a4793f', [0, 0.3, 0]); b.box(0.6, 0.55, 0.6, [bx, 1.05, d / 2 - 0.4], '#b88a4e', [0, 0.7, 0]); }
  else for (const [x, z, s] of [[bx, d / 2 - 0.5, 1], [bx - 0.7, d / 2 - 1.2, 0.7]] as number[][]) { b.cyl(0.14 * s, 0.18 * s, 0.7 * s, 6, [x, 0.35 * s, z], '#f1e6d0'); b.sph(0.55 * s, [x, 0.75 * s, z], '#e0443a', [1, 0.6, 1], 8); for (let k = 0; k < 4; k++) b.sph(0.1 * s, [x + Math.cos(k * 1.7) * 0.3 * s, 0.95 * s, z + Math.sin(k * 1.7) * 0.3 * s], '#fff', 1, 4); }
  b.sph(0.6, [w / 2 + 0.7, 0.45, d / 2 - 0.2], '#3f8f3a', [1, 0.8, 1], 6);
  for (let i = 0; i < 5; i++) { const a = rnd() * TAU; b.sph(0.12 + rnd() * 0.05, [Math.cos(a) * (w / 2 + 0.2 + rnd()), 0.16, d / 2 + 1.5 + Math.abs(Math.sin(a)) * 0.8], ['#ff7aa8', '#ffe14a', '#ffffff', '#9ac8ff', '#ff9a4a'][(i + idx) % 5], 1, 4); }
  return { b: b.build(), g: g.build() };
}

// ------------------------------------------------------------------ stalls ---
function buildStall(s: StallSpec): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.82, 1.08]), g = new GB([1, 1]);
  for (const sx of [-1, 1]) { b.box(0.2, 2.6, 0.2, [sx * 1.75, 1.3, 1.0], WOOD); b.box(0.2, 3.0, 0.2, [sx * 1.75, 1.5, -0.95], WOOD); }
  b.box(3.8, 0.9, 0.9, [0, 0.45, 0.8], '#8a5a30'); b.box(4.0, 0.12, 1.1, [0, 0.96, 0.8], '#b88556');
  b.box(3.8, 2.3, 0.12, [0, 1.3, -1.0], '#a4793f');
  awning(b, -1.95, 1.95, 2.9, 0.25, s.c1, s.c2);
  const fruit = ['#e0443a', '#ff9a2a', '#7ac04a', '#ffd23a'];
  if (s.goods === 0) for (let i = 0; i < 9; i++) b.sph(0.17, [-1.35 + (i % 5) * 0.62 + ((i / 5) | 0) * 0.3, 1.18 + ((i / 5) | 0) * 0.12, 0.65 + ((i / 5) | 0) * 0.3], fruit[i % 4], 1, 5);
  else if (s.goods === 1) for (let i = 0; i < 6; i++) b.cyl(0.2, 0.2, 0.9, 8, [-1.3 + i * 0.52, 1.45, 0.7], ['#3f74d0', '#d94a5a', '#e8c05a', '#7a5aa8', '#3f9a4a', '#ffffff'][i], [0, 0, Math.PI / 2], 1);
  else if (s.goods === 2) for (let i = 0; i < 5; i++) { b.box(0.55, 0.28, 0.55, [-1.3 + i * 0.65, 1.14, 0.8], '#a4793f'); b.sph(0.22, [-1.3 + i * 0.65, 1.38, 0.8], ['#4aa83a', '#ff9a2a', '#a43a4a', '#7ac04a', '#e8c05a'][i], [1, 0.8, 1], 5); }
  else for (let i = 0; i < 6; i++) { b.cyl(0.26, 0.3, 0.2, 8, [-1.3 + i * 0.52, 1.05, 0.8], '#8a5a30'); b.sph(0.2, [-1.3 + i * 0.52, 1.2, 0.8], '#d6a860', [1.1, 0.7, 0.8], 5); }
  lantern(b, g, -1.7, 2.55, 1.15); lantern(b, g, 1.7, 2.55, 1.15);
  b.box(0.8, 0.7, 0.8, [2.5, 0.35, 0.3], '#a4793f', [0, 0.3, 0]); b.cyl(0.5, 0.55, 0.9, 9, [2.6, 0.45, 1.3], '#8a5a30'); b.cyl(0.56, 0.56, 0.08, 9, [2.6, 0.65, 1.3], '#3a3a40');
  return { b: b.build(), g: g.build() };
}

// --------------------------------------------------------------- signposts ---
/** Faces +z (toward the camera); the big down arrow points south, i.e. towards the gate at the end of the main road. */
function buildSignpost(): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  b.box(0.26, 3.6, 0.26, [0, 1.8, 0], WOOD); b.cyl(0.5, 0.6, 0.2, 8, [0, 0.1, 0], DSTONE);
  b.box(2.5, 1.7, 0.18, [0, 3.2, 0.1], '#7a5230'); b.box(2.25, 1.45, 0.2, [0, 3.2, 0.12], '#e8d3a3');
  b.box(2.56, 0.1, 0.22, [0, 4.1, 0.1], '#4a3020'); b.box(2.56, 0.1, 0.22, [0, 2.3, 0.1], '#4a3020');
  g.box(0.3, 0.8, 0.06, [0, 3.35, 0.25], '#e0a020');
  g.box(0.85, 0.24, 0.06, [-0.26, 2.78, 0.25], '#e0a020', [0, 0, -0.78]); g.box(0.85, 0.24, 0.06, [0.26, 2.78, 0.25], '#e0a020', [0, 0, 0.78]);
  g.sph(0.12, [-1.0, 4.35, 0.1], '#ffd070', 1, 6); g.sph(0.12, [1.0, 4.35, 0.1], '#ffd070', 1, 6);
  return { b: b.build(), g: g.build() };
}

function buildWell(): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  b.cyl(1.35, 1.45, 0.25, 12, [0, 0.12, 0], DSTONE); b.cyl(1.15, 1.2, 1.0, 12, [0, 0.75, 0], STONE); b.cyl(1.0, 1.0, 0.1, 12, [0, 1.3, 0], '#b4ae9f');
  g.cyl(0.95, 0.95, 0.05, 12, [0, 1.1, 0], '#4a8fd9');
  b.box(0.2, 3.0, 0.2, [-1.1, 2.0, 0], WOOD); b.box(0.2, 3.0, 0.2, [1.1, 2.0, 0], WOOD);
  b.prism(3.2, 1.2, 2.4, [0, 3.4, 0], '#3b2a20', [0, 0, 0], [0.8, 1.1]); b.cyl(0.07, 0.07, 2.4, 6, [0, 2.8, 0], '#4a3020', [0, 0, Math.PI / 2]);
  b.cyl(0.17, 0.2, 0.3, 7, [0.5, 2.2, 0], '#8a5a30'); b.box(0.02, 0.6, 0.02, [0.5, 2.55, 0], '#333');
  return { b: b.build(), g: g.build() };
}

// -------------------------------------------------------------------- gate ---
function buildGate(): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.78, 1.08]), g = new GB([1, 1]);
  for (const sx of [-1, 1]) {
    const x = sx * 6.6;
    b.cyl(2.2, 2.45, 0.6, 10, [x, 0.3, 0], DSTONE); b.cyl(1.9, 2.1, 8.2, 10, [x, 4.5, 0], STONE);
    for (let i = 0; i < 4; i++) b.torus(1.95, 0.07, [x, 1.6 + i * 1.9, 0], DSTONE, [Math.PI / 2, 0, 0], 1, 10);
    b.cyl(2.35, 2.0, 0.6, 10, [x, 8.9, 0], '#6f6a62');
    b.cone(2.7, 3.2, 10, [x, 10.8, 0], '#2f2520', [0, 0, 0], 1, [0.8, 1.12]); b.sph(0.22, [x, 12.5, 0], '#e8c05a', 1, 5);
    // slit windows + torch
    g.box(0.25, 0.9, 0.1, [x, 6.4, 1.95], '#ffd88a'); g.box(0.25, 0.9, 0.1, [x, 4.2, 1.95], '#ffd88a');
    b.box(0.08, 0.7, 0.08, [x - sx * 2.3, 2.3, 1.0], WOOD); g.sph(0.2, [x - sx * 2.3, 2.8, 1.0], '#ff9a2a', [1, 1.4, 1], 5);
    // open gate door
    b.box(2.2, 4.6, 0.22, [sx * 3.7, 2.4, -1.2], '#6e4b2b', [0, -sx * 1.15, 0]); b.box(2.2, 0.2, 0.26, [sx * 3.7, 1.0, -1.2], '#3a3a40', [0, -sx * 1.15, 0]); b.box(2.2, 0.2, 0.26, [sx * 3.7, 3.6, -1.2], '#3a3a40', [0, -sx * 1.15, 0]);
    // (the town wall itself, see addWallRun, joins the towers from x = +-8.4 outwards)
  }
  b.box(10.4, 1.3, 2.0, [0, 7.0, 0], STONE); b.box(10.6, 0.3, 2.2, [0, 6.3, 0], DSTONE); b.box(10.6, 0.35, 2.2, [0, 7.8, 0], DSTONE);
  for (let i = 0; i < 5; i++) b.box(1.2, 0.6, 2.1, [-4.4 + i * 2.2, 8.2, 0], DSTONE);
  for (const sx of [-1, 1]) { b.box(1.4, 3.0, 0.1, [sx * 2.4, 4.6, 1.1], '#6b2a28'); b.tri([sx * 2.4 - 0.7, 3.1, 1.12], [sx * 2.4 + 0.7, 3.1, 1.12], [sx * 2.4, 2.4, 1.12], '#6b2a28'); g.box(0.7, 0.1, 0.02, [sx * 2.4, 5.2, 1.17], '#ffd070'); g.box(0.1, 0.7, 0.02, [sx * 2.4, 5.2, 1.17], '#ffd070'); }
  g.sph(0.2, [-4.2, 6.1, 1.2], '#ffd070', 1, 6); g.sph(0.2, [4.2, 6.1, 1.2], '#ffd070', 1, 6);
  // big hanging banner under the lintel (the 'TOWN GATE' text sprite sits on it) + tall banners on the tower faces
  b.box(5.6, 1.7, 0.2, [0, 5.15, 1.2], '#6b2a28'); b.box(5.9, 0.16, 0.26, [0, 6.05, 1.2], '#4a3020'); b.box(5.9, 0.16, 0.26, [0, 4.25, 1.2], '#4a3020');
  g.box(5.2, 0.07, 0.04, [0, 5.95, 1.34], '#ffd070'); g.box(5.2, 0.07, 0.04, [0, 4.35, 1.34], '#ffd070');
  for (const sx of [-1, 1]) { b.box(1.5, 5.2, 0.12, [sx * 6.6, 5.6, 2.05], '#6b2a28'); g.box(0.9, 0.1, 0.04, [sx * 6.6, 7.6, 2.13], '#ffd070'); g.box(0.1, 0.9, 0.04, [sx * 6.6, 7.6, 2.13], '#ffd070'); b.box(1.7, 0.14, 0.18, [sx * 6.6, 8.2, 2.05], '#4a3020'); }
  // guard house hut + hay beside the road
  b.box(2.6, 0.9, 1.4, [-5.4, 0.45, 5.6], '#a4793f'); b.box(1.2, 0.5, 0.9, [-5.0, 1.15, 5.7], '#b88a4e', [0, 0.4, 0]);
  return { b: b.build(), g: g.build() };
}


// ----------------------------------------------------------- town wall ---
const BLOCKS = ['#9b9488', '#a39c90', '#8f897e', '#a8a296', '#968f83', '#8a857b'];
/** One straight piece of the town wall: stone-block courses, walkway ledge, outer parapet with merlons, low inner parapet. */
function addWallRun(b: GB, x1: number, z1: number, x2: number, z2: number, ox: number, oz: number, rnd: () => number) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, yaw = -Math.atan2(dz, dx);
  const P = (s: number, off: number, y: number): V3 => [x1 + ux * s + ox * off, y, z1 + uz * s + oz * off];
  const CH_ = 1.25, COURSES = 4;
  for (let c = 0; c < COURSES; c++) {
    const th = c === 0 ? 3.0 : 2.6, y = CH_ * (c + 0.5), BL = 3.1;
    for (let s0 = -(c % 2) * 1.55; s0 < len; s0 += BL) {
      const a = Math.max(0, s0), e = Math.min(len, s0 + BL);
      if (e - a < 0.3) continue;
      b.box(e - a, CH_, th, P((a + e) / 2, 0, y), BLOCKS[Math.floor(rnd() * BLOCKS.length)], [0, yaw, 0], [0.82, 1.02]);
    }
  }
  const top = CH_ * COURSES;
  b.box(len, 0.35, 3.3, P(len / 2, 0, top + 0.17), DSTONE, [0, yaw, 0], [0.9, 1.0]);          // walkway ledge (corbel lip)
  b.box(len, 1.2, 0.8, P(len / 2, 1.2, top + 0.95), STONE, [0, yaw, 0], [0.85, 1.0]);          // outer parapet
  b.box(len, 0.1, 1.0, P(len / 2, 1.2, top + 1.6), DSTONE, [0, yaw, 0]);                       // parapet cap
  b.box(len, 0.5, 0.3, P(len / 2, -1.4, top + 0.6), STONE, [0, yaw, 0]);                       // low inner parapet
  for (let s = 1.2; s + 0.6 <= len; s += 2.4) b.box(1.2, 0.95, 0.85, P(s, 1.2, top + 2.1), BLOCKS[Math.floor(rnd() * BLOCKS.length)], [0, yaw, 0], [0.85, 1.05]); // merlons
}
function addWallTower(b: GB, g: GB, t: TowerSpec, idx: number) {
  const { x, z, r } = t, h = t.corner ? 9.6 : 8.4;
  b.cyl(r + 0.3, r + 0.4, 0.8, 12, [x, 0.4, z], DSTONE);
  b.cyl(r, r + 0.12, h, 12, [x, h / 2, z], STONE, [0, 0, 0], 1, [0.8, 1.05]);
  for (let i = 0; i < 4; i++) b.torus(r + 0.06, 0.08, [x, 1.8 + i * 1.9, z], DSTONE, [Math.PI / 2, 0, 0], 1, 12);
  b.cyl(r + 0.55, r, 0.7, 12, [x, h + 0.15, z], DSTONE);                                      // corbelled top
  b.cyl(r + 0.55, r + 0.55, 0.2, 12, [x, h + 0.5, z], '#6f6a62');
  if (t.corner) {
    b.cone(r + 0.9, 4.0, 12, [x, h + 2.5, z], '#2f2520', [0, 0, 0], 1, [0.8, 1.12]); b.sph(0.22, [x, h + 4.6, z], '#e8c05a', 1, 5);
  } else {
    const n = Math.round((TAU * (r + 0.35)) / 2.1);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; b.box(1.2, 1.0, 0.85, [x + Math.cos(a) * (r + 0.3), h + 1.1, z + Math.sin(a) * (r + 0.3)], BLOCKS[(i + idx) % BLOCKS.length], [0, -a - Math.PI / 2, 0]); }
  }
  for (let k = 0; k < 3; k++) { const a = idx * 0.9 + (k / 3) * TAU; g.box(0.24, 0.9, 0.1, [x + Math.cos(a) * (r + 0.1), h * 0.62, z + Math.sin(a) * (r + 0.1)], '#ffd88a', [0, -a + Math.PI / 2, 0]); }
}

// ------------------------------------------------------------------- misc ---
function addFence(b: GB, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 1.7)), yaw = -Math.atan2(dz, dx);
  for (let i = 0; i <= n; i++) b.box(0.16, 1.0, 0.16, [x1 + (dx * i) / n, 0.5, z1 + (dz * i) / n], WOOD);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  b.box(len, 0.1, 0.08, [mx, 0.8, mz], '#8a5a30', [0, yaw, 0]); b.box(len, 0.1, 0.08, [mx, 0.45, mz], '#8a5a30', [0, yaw, 0]);
}
function addLamp(b: GB, g: GB, x: number, z: number) {
  b.cyl(0.07, 0.1, 2.7, 6, [x, 1.35, z], '#34343a'); b.cyl(0.18, 0.2, 0.18, 6, [x, 0.09, z], '#34343a');
  b.box(0.38, 0.06, 0.38, [x, 2.82, z], '#2a2a2e'); b.cone(0.3, 0.3, 4, [x, 3.06, z], '#2a2a2e', [0, Math.PI / 4, 0]);
  g.box(0.24, 0.34, 0.24, [x, 2.55, z], '#ffd070');
}
/** Procedural cobblestone texture for roads / plaza: pale off-white stones, thin soft mortar, very low contrast. */
function cobbleTexture(): CanvasTexture {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!;
  x.fillStyle = '#cdc8be'; x.fillRect(0, 0, N, N);                 // soft mortar
  const rnd = mulberry32(7);
  const rows = 6, h = N / rows;
  for (let r = 0; r < rows; r++) {
    let px = (r % 2) * -h * 0.55 - rnd() * 6;
    while (px < N) {
      const w = h * (0.95 + rnd() * 0.55), y = r * h;
      const tone = 226 + Math.floor(rnd() * 10), warm = Math.floor(rnd() * 4);
      for (const ox of [0, N, -N]) {
        const sx = px + ox + 1.2, sy = y + 1.2, sw = w - 2.4, sh = h - 2.4;
        x.beginPath(); x.roundRect(sx, sy, sw, sh, 6);
        x.fillStyle = `rgb(${tone + warm},${tone + warm * 0.7},${tone - 3})`; x.fill();
        x.save(); x.clip();
        const gr = x.createLinearGradient(sx, sy, sx + sw, sy + sh);
        gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.06)');
        x.fillStyle = gr; x.fillRect(sx, sy, sw, sh);
        x.restore();
      }
      px += w;
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}
/** Second subtle texture for the yard: large pale flagstone / cement slabs with hairline joints. */
function pavingTexture(): CanvasTexture {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!;
  x.fillStyle = '#bdb8ae'; x.fillRect(0, 0, N, N);
  const rnd = mulberry32(19);
  const rows = 3, h = N / rows;
  for (let r = 0; r < rows; r++) {
    let px = -rnd() * 60;
    while (px < N) {
      const w = 96 + rnd() * 70, y = r * h;
      const tone = 199 + Math.floor(rnd() * 9);
      for (const ox of [0, N, -N]) {
        x.fillStyle = `rgb(${tone},${tone - 1},${tone - 5})`;
        x.fillRect(px + ox + 1.5, y + 1.5, w - 3, h - 3);
      }
      px += w;
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** World-space planar UVs (xz / tile) so the stones line up across roads and the plaza. */
function planarUv(g: BufferGeometry, tile: number): BufferGeometry {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** All road strips share ONE layer: edge strips at y .055, surface at y .075 (identical for every road, so overlaps and
 *  junctions are seamless; higher road tops simply cover lower edge strips). */
function buildRoads(): BufferGeometry {
  const r = new GB([1, 1]);
  const EDGE = '#cfcac0', SURF = '#ffffff';
  for (const rd of ROADS) {
    const dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
    const mx = (rd.x1 + rd.x2) / 2, mz = (rd.z1 + rd.z2) / 2;
    r.box(len, 0.05, rd.w + 0.7, [mx, 0.03, mz], EDGE, [0, yaw, 0]);
    r.box(len, 0.06, rd.w, [mx, 0.045, mz], SURF, [0, yaw, 0]);
  }
  // plaza: pale concentric discs (above the road layer, so roads simply end at its rim)
  r.cyl(PLAZA.r, PLAZA.r, 0.08, 32, [PLAZA.x, 0.05, PLAZA.z], '#cbc6bb');
  r.cyl(PLAZA.r - 0.7, PLAZA.r - 0.7, 0.1, 32, [PLAZA.x, 0.06, PLAZA.z], '#f4f0e6');
  r.cyl(PLAZA.r * 0.62, PLAZA.r * 0.62, 0.11, 28, [PLAZA.x, 0.065, PLAZA.z], '#fbf8ef');
  r.cyl(2.2, 2.2, 0.12, 24, [PLAZA.x, 0.07, PLAZA.z], '#d9ccaa');
  r.cyl(1.7, 1.7, 0.13, 24, [PLAZA.x, 0.075, PLAZA.z], '#e9deba');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; r.box(0.5, 0.13, 1.5, [PLAZA.x + Math.cos(a) * 4.3, 0.075, PLAZA.z + Math.sin(a) * 4.3], '#c4bfb3', [0, -a + Math.PI / 2, 0]); }
  // soft golden chevrons on the avenue: follow them to the gate
  for (let z = 14; z <= 33; z += 4.5) for (const s of [-1, 1]) r.box(1.6, 0.04, 0.34, [s * 0.52, 0.09, z], '#dccb8a', [0, s * 0.8, 0]);
  // gate forecourt
  r.cyl(6.5, 6.5, 0.08, 24, [GATE.x, 0.05, GATE.z], '#cbc6bb'); r.cyl(5.8, 5.8, 0.1, 24, [GATE.x, 0.06, GATE.z], '#f4f0e6');
  return planarUv(r.build(), 4);
}

/** Paved yard: one flat polygon over the whole walled area with small grass patches cut out as holes. */
function buildPaving(): { geo: BufferGeometry; patches: [number, number][][] } {
  const sh = new Shape();
  const X0 = WALL.x0 + 0.6, X1 = WALL.x1 - 0.6, Z0 = WALL.z0 + 0.6, Z1 = WALL.z1 + 0.6;
  sh.moveTo(X0, -Z0); sh.lineTo(X1, -Z0); sh.lineTo(X1, -Z1); sh.lineTo(X0, -Z1); sh.closePath();
  const rnd = mulberry32(99);
  const patches: [number, number][][] = [];
  for (const [cx, cz, rx, rz] of GRASS_PATCHES) {
    const n = 20, ph = rnd() * 6, pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, k = 1 + 0.1 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 5 + ph * 1.7);
      pts.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
    }
    patches.push(pts);
    const hole = new Path();
    pts.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    hole.closePath();
    sh.holes.push(hole);
  }
  const g = new ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return { geo: planarUv(g, 8), patches };
}

/** Low stone kerb around a grass patch + a few muted wild flowers inside. */
function addPatchKerb(b: GB, pts: [number, number][], rnd: () => number) {
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    b.box(len + 0.08, 0.16, 0.34, [(x1 + x2) / 2, 0.08, (z1 + z2) / 2], i % 2 ? '#bdb8ac' : '#c9c4b8', [0, -Math.atan2(z2 - z1, x2 - x1), 0], [0.9, 1.05]);
  }
  let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
  const cols = ['#ece3c8', '#e8c86a', '#e3a9b8', '#b9b0e0'];
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = 1.4 + rnd() * 1.4; b.sph(0.09, [cx + Math.cos(a) * d, 0.2, cz + Math.sin(a) * d * 0.9], cols[i % 4], 1, 4); }
}

/** Raised stone planter with shrubs (kind 0) or flowers (kind 1). */
function addPlanter(b: GB, p: PlanterSpec, rnd: () => number) {
  const { x, z, w, d } = p;
  b.box(w, 0.6, d, [x, 0.3, z], '#bab4a7', [0, 0, 0], [0.88, 1.04]);
  b.box(w + 0.14, 0.1, d + 0.14, [x, 0.63, z], '#d0cabd');
  b.box(w - 0.3, 0.06, d - 0.3, [x, 0.66, z], '#4a3a2c');
  const alongX = w >= d, len = Math.max(w, d), n = Math.max(1, Math.round(len / 1.15));
  const greens = ['#4f7f40', '#5d8c46', '#456f38', '#68964c'], cols = ['#ece3c8', '#e8c86a', '#e3a9b8', '#b9b0e0', '#f0f0e8'];
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (len * (i + 0.5)) / n, px = x + (alongX ? o : 0), pz = z + (alongX ? 0 : o);
    if (p.kind === 0) {
      b.sph(0.5 + rnd() * 0.12, [px, 0.98, pz], greens[i % 4], [1, 0.85, 1], 6);
      if (n > 1 || len > 2.5) b.sph(0.3, [px + (alongX ? 0.15 : 0.1), 1.3, pz + (alongX ? 0.05 : 0.1)], greens[(i + 1) % 4], [1, 0.9, 1], 5);
    } else {
      b.sph(0.38, [px, 0.85, pz], greens[(i + 2) % 4], [1.1, 0.6, 1.1], 5);
      for (let k = 0; k < 4; k++) {
        const a = rnd() * TAU, dd = 0.15 + rnd() * 0.3;
        b.sph(0.1, [px + Math.cos(a) * dd * (alongX ? 1.3 : 0.7), 1.0 + rnd() * 0.12, pz + Math.sin(a) * dd * (alongX ? 0.7 : 1.3)], cols[(i + k) % 5], 1, 4);
      }
    }
  }
}

/** Fenced wheat field: soil bed, rows of merged golden stalks, scarecrow, haystack. */
function addFarm(b: GB, rnd: () => number) {
  const { x, z, hw, hd } = FARM;
  b.box(hw * 2 - 0.5, 0.06, hd * 2 - 0.5, [x, 0.04, z], '#6d5336');
  const gold = ['#d6b64a', '#dec062', '#c9a63c', '#e0c870'];
  for (let zi = -hd + 1.3; zi <= hd - 1.0; zi += 1.1) {
    b.box(hw * 2 - 1.0, 0.04, 0.28, [x, 0.08, z + zi], '#58412a');
    for (let xi = -hw + 1.1; xi <= hw - 0.9; xi += 0.7) {
      const px = x + xi + (rnd() - 0.5) * 0.15, pz = z + zi + (rnd() - 0.5) * 0.15;
      if (Math.hypot(px - SCARECROW.x, pz - SCARECROW.z) < 1.3 || Math.hypot(px - HAYSTACK.x, pz - HAYSTACK.z) < 2.0) continue;
      const h = 0.85 + rnd() * 0.25, c = gold[Math.floor(rnd() * 4)];
      b.cone(0.19, h, 5, [px, h / 2 + 0.05, pz], c, [0, 0, 0], 1, [0.7, 1.1]);
      b.cone(0.1, h * 0.8, 4, [px + 0.12, h * 0.4 + 0.05, pz + 0.05], gold[Math.floor(rnd() * 4)], [0.12, 0, -0.18]);
    }
  }
  // scarecrow
  const sx = SCARECROW.x, sz = SCARECROW.z;
  b.box(0.12, 2.3, 0.12, [sx, 1.15, sz], '#6e4b2b'); b.box(1.6, 0.1, 0.1, [sx, 1.75, sz], '#6e4b2b');
  b.box(0.55, 0.8, 0.32, [sx, 1.5, sz], '#8d7a58'); b.sph(0.24, [sx, 2.15, sz], '#d8c08a', 1, 6);
  b.cone(0.38, 0.35, 6, [sx, 2.5, sz], '#3b2a20'); b.cyl(0.46, 0.46, 0.04, 8, [sx, 2.33, sz], '#3b2a20');
  b.box(0.12, 0.45, 0.06, [sx - 0.8, 1.55, sz], '#d6b64a'); b.box(0.12, 0.45, 0.06, [sx + 0.8, 1.55, sz], '#d6b64a');
  // haystack
  const hx = HAYSTACK.x, hz = HAYSTACK.z;
  b.cyl(1.2, 1.3, 0.9, 9, [hx, 0.45, hz], '#cfae4e'); b.sph(1.2, [hx, 0.95, hz], '#d8b958', [1, 0.95, 1], 8); b.cone(0.3, 0.5, 5, [hx, 2.2, hz], '#c19a3a');
}

interface Chunk { b: GB; g: GB }
const CH = 40;

function buildTown() {
  const chunks = new Map<string, Chunk>();
  const at = (x: number, z: number): Chunk => {
    const k = Math.floor((x + 80) / CH) + ',' + Math.floor((z + 80) / CH);
    let c = chunks.get(k);
    if (!c) { c = { b: new GB([1, 1]), g: new GB([1, 1]) }; chunks.set(k, c); }
    return c;
  };
  const put = (x: number, z: number, rot: number, geos: { b: BufferGeometry; g: BufferGeometry }) => {
    const c = at(x, z);
    c.b.addColored(geos.b, [x, 0, z], [0, rot, 0]); c.g.addColored(geos.g, [x, 0, z], [0, rot, 0]);
    geos.b.dispose(); geos.g.dispose();
  };
  HOUSES.forEach((h, i) => put(h.x, h.z, h.rot, buildHouse(h, i)));
  STALLS.forEach((s) => put(s.x, s.z, s.rot, buildStall(s)));
  put(WELL_POS.x, WELL_POS.z, 0, buildWell());
  put(GATE.x, GATE.z, 0, buildGate());
  const sign = buildSignpost();
  for (const sg of SIGNS) put(sg.x, sg.z, 0, { b: sign.b.clone(), g: sign.g.clone() });
  sign.b.dispose(); sign.g.dispose();
  // fences + lamps go straight into the chunk of their midpoint / position
  for (const [x1, z1, x2, z2] of FENCES) addFence(at((x1 + x2) / 2, (z1 + z2) / 2).b, x1, z1, x2, z2);
  for (const [x, z] of LAMPS) { const c = at(x, z); addLamp(c.b, c.g, x, z); }
  const pr = mulberry32(555);
  for (const p of PLANTERS) addPlanter(at(p.x, p.z).b, p, pr);
  const paving = buildPaving();
  for (const pts of paving.patches) { let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } addPatchKerb(at(cx / pts.length, cz / pts.length).b, pts, pr); }
  addFarm(at(FARM.x, FARM.z).b, pr);
  // town wall: runs are cut into ~15-unit pieces so every piece lands in its own spatial chunk (frustum culling)
  const wr = mulberry32(4242);
  for (const [x1, z1, x2, z2, ox, oz] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 15));
    for (let i = 0; i < n; i++) {
      const ax = x1 + ((x2 - x1) * i) / n, az = z1 + ((z2 - z1) * i) / n, bx = x1 + ((x2 - x1) * (i + 1)) / n, bz = z1 + ((z2 - z1) * (i + 1)) / n;
      addWallRun(at((ax + bx) / 2, (az + bz) / 2).b, ax, az, bx, bz, ox, oz, wr);
    }
  }
  WALL_TOWERS.forEach((t, i) => { const c = at(t.x, t.z); addWallTower(c.b, c.g, t, i); });
  const out: { body: BufferGeometry; glow: BufferGeometry }[] = [];
  chunks.forEach((c) => out.push({ body: c.b.build(), glow: c.g.build() }));
  return { chunks: out, roads: buildRoads(), paving: paving.geo };
}

/** Instanced trees (nature geometry from models.ts), one draw call per species. Colliders: TOWN_COLLIDERS. */
function TownTrees() {
  const nat = useNature();
  const lists = useMemo(() => {
    const l: TreeSpec[][] = [[], [], [], []];
    for (const t of TOWN_TREES) l[t.kind].push(t);
    return l;
  }, []);
  const geos = [nat.oak, nat.palm, nat.pineA, nat.pineB];
  return (
    <>
      {lists.map((list, k) => list.length > 0 && (
        <Inst key={k} geo={geos[k]} mat={nat.mat} count={list.length} cast receive fill={(m: InstancedMesh) => {
          list.forEach((t, i) => { const sc = t.s * 1.25; setInst(m, i, t.x, -0.05, t.z, (t.x * 7.3 + t.z * 3.1) % 6.28, sc, sc * (0.92 + (i % 3) * 0.06), sc); });
        }} />
      ))}
    </>
  );
}

export function TownScenery({ q }: { q: QualityCfg }) {
  const town = useMemo(() => buildTown(), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    road: (() => { const m = litMat({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); m.map = cobbleTexture(); return m; })(),
    paving: (() => { const m = litMat({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 }); m.map = pavingTexture(); return m; })(),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    beam: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => {
    town.chunks.forEach((c) => { c.body.dispose(); c.glow.dispose(); }); town.roads.dispose(); town.paving.dispose();
    mats.lit.dispose(); mats.road.map?.dispose(); mats.road.dispose(); mats.paving.map?.dispose(); mats.paving.dispose(); mats.glow.dispose(); mats.ring.dispose(); mats.beam.dispose();
  }, [town, mats]);
  const label = useMemo(() => labelMaterial('Town Gate', '#f1e2b8', { size: 60, plate: 'plate' }), []);
  const label2 = useMemo(() => labelMaterial('TOWN GATE', '#f1e2b8', { size: 64, plate: 'plate' }), []);
  const label3 = useMemo(() => labelMaterial('Set out here', '#f1e2b8', { size: 40, plate: 'mini' }), []);
  const signLabel = useMemo(() => labelMaterial('Town Gate', '#f1e2b8', { size: 44, plate: 'mini' }), []);
  const ring = useRef<Mesh>(null!), sprite = useRef<Sprite>(null!), beam = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.ring.opacity = 0.22 + 0.16 * Math.sin(t * 2.2);
    mats.beam.opacity = 0.1 + 0.05 * Math.sin(t * 1.7);
    if (sprite.current) sprite.current.position.y = 11.2 + Math.sin(t * 1.3) * 0.15;
  });
  const shadows = q.shadowMap > 0;
  return (
    <group>
      <mesh geometry={town.paving} material={mats.paving} receiveShadow={shadows} />
      <mesh geometry={town.roads} material={mats.road} receiveShadow={shadows} />
      <React.Suspense fallback={null}><TownTrees /></React.Suspense>
      {town.chunks.map((c, i) => (
        <React.Fragment key={i}>
          <mesh geometry={c.body} material={mats.lit} castShadow={shadows} receiveShadow={shadows} />
          <mesh geometry={c.glow} material={mats.glow} />
        </React.Fragment>
      ))}
      <mesh ref={ring} material={mats.ring} position={[GATE.x, 0.12, GATE.z - 1]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.6, 4.0, 40]} /></mesh>
      <sprite ref={sprite} material={label.mat} position={[GATE.x, 11.2, GATE.z]} scale={[label.aspect * 1.2, 1.2, 1]} />
      <sprite material={label2.mat} position={[GATE.x, 5.15, GATE.z + 1.5]} scale={[label2.aspect * 1.0, 1.0, 1]} />
      <sprite material={label3.mat} position={[GATE.x, 9.6, GATE.z + 1.2]} scale={[label3.aspect * 0.6, 0.6, 1]} />
      <mesh ref={beam} material={mats.beam} position={[GATE.x, 18, GATE.z - 1]}><cylinderGeometry args={[1.0, 1.7, 36, 14, 1, true]} /></mesh>
      {SIGNS.map((sg, i) => <sprite key={i} material={signLabel.mat} position={[sg.x, 4.9, sg.z + 0.3]} scale={[signLabel.aspect * 0.6, 0.6, 1]} />)}
    </group>
  );
}
