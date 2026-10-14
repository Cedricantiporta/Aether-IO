// Town scenery: houses, market stalls, well, fences, lamp posts, roads/plaza and the town gate.
// Everything static is merged into per-chunk vertex-coloured meshes (frustum-culled by three), roads and the plaza
// are one flat mesh without shadows, lamp bulbs are emissive only (no real lights).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, Sprite } from 'three';
import { GB, TAU, litMat, mulberry32 } from './util';
import { labelMaterial } from './label';
import {
  GATE, HOUSES, STALLS, ROADS, FENCES, LAMPS, PLAZA, WELL_POS, SIGNS, HouseSpec, StallSpec,
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
  awning(b, ax0, ax1, ay, az, h.roof, '#f4f4f4');
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
  b.prism(3.2, 1.2, 2.4, [0, 3.4, 0], '#8a5a3a', [0, 0, 0], [0.8, 1.1]); b.cyl(0.07, 0.07, 2.4, 6, [0, 2.8, 0], '#4a3020', [0, 0, Math.PI / 2]);
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
    b.cone(2.7, 3.2, 10, [x, 10.8, 0], '#b8483a', [0, 0, 0], 1, [0.8, 1.12]); b.sph(0.22, [x, 12.5, 0], '#e8c05a', 1, 5);
    // slit windows + torch
    g.box(0.25, 0.9, 0.1, [x, 6.4, 1.95], '#ffd88a'); g.box(0.25, 0.9, 0.1, [x, 4.2, 1.95], '#ffd88a');
    b.box(0.08, 0.7, 0.08, [x - sx * 2.3, 2.3, 1.0], WOOD); g.sph(0.2, [x - sx * 2.3, 2.8, 1.0], '#ff9a2a', [1, 1.4, 1], 5);
    // open gate door
    b.box(2.2, 4.6, 0.22, [sx * 3.7, 2.4, -1.2], '#6e4b2b', [0, -sx * 1.15, 0]); b.box(2.2, 0.2, 0.26, [sx * 3.7, 1.0, -1.2], '#3a3a40', [0, -sx * 1.15, 0]); b.box(2.2, 0.2, 0.26, [sx * 3.7, 3.6, -1.2], '#3a3a40', [0, -sx * 1.15, 0]);
    // wall stub with crenellations
    b.box(11.4, 3.0, 1.5, [sx * 14.1, 1.5, 0], STONE);
    for (let i = 0; i < 6; i++) b.box(1.1, 0.7, 1.6, [sx * (8.8 + i * 2.1), 3.3, 0], DSTONE);
  }
  b.box(10.4, 1.3, 2.0, [0, 7.0, 0], STONE); b.box(10.6, 0.3, 2.2, [0, 6.3, 0], DSTONE); b.box(10.6, 0.35, 2.2, [0, 7.8, 0], DSTONE);
  for (let i = 0; i < 5; i++) b.box(1.2, 0.6, 2.1, [-4.4 + i * 2.2, 8.2, 0], DSTONE);
  for (const sx of [-1, 1]) { b.box(1.4, 3.0, 0.1, [sx * 2.4, 4.6, 1.1], '#b3342a'); b.tri([sx * 2.4 - 0.7, 3.1, 1.12], [sx * 2.4 + 0.7, 3.1, 1.12], [sx * 2.4, 2.4, 1.12], '#b3342a'); g.box(0.7, 0.1, 0.02, [sx * 2.4, 5.2, 1.17], '#ffd070'); g.box(0.1, 0.7, 0.02, [sx * 2.4, 5.2, 1.17], '#ffd070'); }
  g.sph(0.2, [-4.2, 6.1, 1.2], '#ffd070', 1, 6); g.sph(0.2, [4.2, 6.1, 1.2], '#ffd070', 1, 6);
  // big hanging banner under the lintel (the 'TOWN GATE' text sprite sits on it) + tall banners on the tower faces
  b.box(5.6, 1.7, 0.2, [0, 5.15, 1.2], '#b3342a'); b.box(5.9, 0.16, 0.26, [0, 6.05, 1.2], '#4a3020'); b.box(5.9, 0.16, 0.26, [0, 4.25, 1.2], '#4a3020');
  g.box(5.2, 0.07, 0.04, [0, 5.95, 1.34], '#ffd070'); g.box(5.2, 0.07, 0.04, [0, 4.35, 1.34], '#ffd070');
  for (const sx of [-1, 1]) { b.box(1.5, 5.2, 0.12, [sx * 6.6, 5.6, 2.05], '#b3342a'); g.box(0.9, 0.1, 0.04, [sx * 6.6, 7.6, 2.13], '#ffd070'); g.box(0.1, 0.9, 0.04, [sx * 6.6, 7.6, 2.13], '#ffd070'); b.box(1.7, 0.14, 0.18, [sx * 6.6, 8.2, 2.05], '#4a3020'); }
  // guard house hut + hay beside the road
  b.box(2.6, 0.9, 1.4, [-3.6, 0.45, 5.6], '#a4793f'); b.box(1.2, 0.5, 0.9, [-3.2, 1.15, 5.7], '#b88a4e', [0, 0.4, 0]);
  return { b: b.build(), g: g.build() };
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
/** Procedural cobblestone texture: staggered rounded stones with mortar, light top-left bevel, tone variation. */
function cobbleTexture(): CanvasTexture {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!;
  x.fillStyle = '#5a5247'; x.fillRect(0, 0, N, N);
  const rnd = mulberry32(7);
  const rows = 8, h = N / rows;
  for (let r = 0; r < rows; r++) {
    let px = (r % 2) * -h * 0.5 - rnd() * 6;
    while (px < N) {
      const w = h * (0.8 + rnd() * 0.6), y = r * h;
      const tone = 150 + Math.floor(rnd() * 55), warm = Math.floor(rnd() * 14);
      for (const ox of [0, N, -N]) {
        const sx = px + ox + 2, sy = y + 2, sw = w - 4, sh = h - 4, rr = 7;
        x.beginPath(); x.roundRect(sx, sy, sw, sh, rr);
        x.fillStyle = `rgb(${tone + warm},${tone + warm * 0.6},${tone - 6})`; x.fill();
        x.save(); x.clip();
        const gr = x.createLinearGradient(sx, sy, sx + sw, sy + sh);
        gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.28)');
        x.fillStyle = gr; x.fillRect(sx, sy, sw, sh);
        for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.06})`; x.fillRect(sx + rnd() * sw, sy + rnd() * sh, 2 + rnd() * 3, 2 + rnd() * 3); }
        x.restore();
      }
      px += w;
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** World-space planar UVs (xz / tile) so the cobbles line up across roads and the plaza. */
function planarUv(g: BufferGeometry, tile: number): BufferGeometry {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

function buildRoads(): BufferGeometry {
  const r = new GB([1, 1]);
  const S = ['#e8e0d0', '#ece4d4', '#e4dccb'];
  ROADS.forEach((rd, i) => {
    const dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
    r.box(len, 0.05, rd.w + 0.7, [(rd.x1 + rd.x2) / 2, 0.03, (rd.z1 + rd.z2) / 2], '#8f8778', [0, yaw, 0]);
    r.box(len, 0.06, rd.w, [(rd.x1 + rd.x2) / 2, 0.045, (rd.z1 + rd.z2) / 2], S[i % 3], [0, yaw, 0]);
  });
  // plaza
  r.cyl(PLAZA.r, PLAZA.r, 0.08, 28, [PLAZA.x, 0.05, PLAZA.z], '#9c958a');
  r.cyl(PLAZA.r - 0.7, PLAZA.r - 0.7, 0.1, 28, [PLAZA.x, 0.06, PLAZA.z], '#e2dacb');
  r.cyl(PLAZA.r * 0.62, PLAZA.r * 0.62, 0.11, 24, [PLAZA.x, 0.065, PLAZA.z], '#efe7d6');
  r.cyl(2.2, 2.2, 0.12, 20, [PLAZA.x, 0.07, PLAZA.z], '#cdb88a');
  r.cyl(1.7, 1.7, 0.13, 20, [PLAZA.x, 0.075, PLAZA.z], '#e0c98f');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; r.box(0.5, 0.13, 1.5, [PLAZA.x + Math.cos(a) * 4.3, 0.075, PLAZA.z + Math.sin(a) * 4.3], '#8d8678', [0, -a + Math.PI / 2, 0]); }
  // golden chevrons painted on the main road: follow them to the gate
  for (let z = 14; z <= 33; z += 4.5) for (const s of [-1, 1]) r.box(1.6, 0.04, 0.34, [s * 0.52, 0.09, z], '#e6c35a', [0, s * 0.8, 0]);
  // gate forecourt
  r.cyl(6.5, 6.5, 0.08, 20, [GATE.x, 0.05, GATE.z], '#9c958a'); r.cyl(5.8, 5.8, 0.1, 20, [GATE.x, 0.06, GATE.z], '#e2dacb');
  return planarUv(r.build(), 3.2);
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
  const out: { body: BufferGeometry; glow: BufferGeometry }[] = [];
  chunks.forEach((c) => out.push({ body: c.b.build(), glow: c.g.build() }));
  return { chunks: out, roads: buildRoads() };
}

export function TownScenery({ q }: { q: QualityCfg }) {
  const town = useMemo(() => buildTown(), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    road: (() => { const m = litMat({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); m.map = cobbleTexture(); return m; })(),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    beam: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => {
    town.chunks.forEach((c) => { c.body.dispose(); c.glow.dispose(); }); town.roads.dispose();
    mats.lit.dispose(); mats.road.map?.dispose(); mats.road.dispose(); mats.glow.dispose(); mats.ring.dispose(); mats.beam.dispose();
  }, [town, mats]);
  const label = useMemo(() => labelMaterial('Town Gate', '#ffe69a', { size: 60 }), []);
  const label2 = useMemo(() => labelMaterial('TOWN GATE', '#ffe69a', { size: 64, stroke: 'rgba(60,10,10,0.95)' }), []);
  const label3 = useMemo(() => labelMaterial('Set out here', '#cfe4ff', { size: 40 }), []);
  const signLabel = useMemo(() => labelMaterial('Town Gate', '#ffe69a', { size: 44 }), []);
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
      <mesh geometry={town.roads} material={mats.road} receiveShadow={shadows} />
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
