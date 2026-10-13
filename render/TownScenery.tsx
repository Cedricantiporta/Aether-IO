// Town scenery: houses, market stalls, well, fences, lamp posts, roads/plaza and the town gate.
// Everything static is merged into per-chunk vertex-coloured meshes (frustum-culled by three), roads and the plaza
// are one flat mesh without shadows, lamp bulbs are emissive only (no real lights).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Sprite } from 'three';
import { GB, TAU, litMat, mulberry32 } from './util';
import { labelMaterial } from './label';
import {
  GATE, HOUSES, STALLS, ROADS, FENCES, LAMPS, PLAZA, WELL_POS, HouseSpec, StallSpec,
} from '../engine/townData';
import { QualityCfg } from './quality';

type V3 = [number, number, number];
const WOOD = '#6e4b2b', STONE = '#9b9488', DSTONE = '#7d776d';

// ------------------------------------------------------------------ houses ---
function buildHouse(h: HouseSpec, idx: number): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const rnd = mulberry32(idx * 7919 + 13);
  const { w, d } = h;
  const wallH = h.floors * 2.6, base = 0.45, top = base + wallH;
  b.box(w + 0.5, base, d + 0.5, [0, base / 2, 0], STONE);
  b.box(w, wallH, d, [0, base + wallH / 2, 0], h.wall, [0, 0, 0], [0.84, 1.04]);
  if (h.floors === 2) b.box(w + 0.18, 0.2, d + 0.18, [0, base + 2.6, 0], h.trim);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.26, wallH + 0.05, 0.26, [sx * (w / 2), base + wallH / 2, sz * (d / 2)], h.trim);
  // timber beams on the front
  b.box(w, 0.16, 0.12, [0, top - 0.1, d / 2 + 0.02], h.trim);
  // roof
  const rh = Math.min(w, d) * 0.5 + 0.9;
  b.prism(w + 1.1, rh, d + 1.1, [0, top, 0], h.roof, [0, 0, 0], [0.8, 1.12]);
  b.box(0.26, 0.22, d + 1.2, [0, top + rh, 0], h.roof, [0, 0, 0], [0.7, 0.9]);
  if (h.chimney) {
    const cx = w * 0.22, cz = -d * 0.18;
    b.box(0.75, rh + 1.1, 0.75, [cx, top + (rh + 1.1) / 2 - 0.1, cz], '#8f857a'); b.box(0.95, 0.2, 0.95, [cx, top + rh + 1.1, cz], '#5e554d');
  }
  // door + step + frame + lantern
  const dx = h.floors === 2 ? -w * 0.18 : 0;
  b.box(1.05, 1.9, 0.2, [dx, base + 0.95, d / 2 + 0.04], h.door);
  b.box(1.3, 0.16, 0.26, [dx, base + 1.98, d / 2 + 0.05], h.trim); b.box(0.14, 1.95, 0.26, [dx - 0.6, base + 0.98, d / 2 + 0.05], h.trim); b.box(0.14, 1.95, 0.26, [dx + 0.6, base + 0.98, d / 2 + 0.05], h.trim);
  b.box(1.6, 0.14, 0.7, [dx, 0.07, d / 2 + 0.45], DSTONE);
  b.sph(0.07, [dx + 0.38, base + 1.0, d / 2 + 0.16], '#e8c05a', 1, 4);
  g.sph(0.13, [dx + 0.95, base + 1.7, d / 2 + 0.2], '#ffd070', 1, 6); b.box(0.04, 0.3, 0.04, [dx + 0.95, base + 1.95, d / 2 + 0.2], '#2a2a2e');
  // windows (glowing panes, frames, flower boxes)
  const win = (x: number, y: number, z: number, side: boolean) => {
    const sz: V3 = side ? [0.12, 0.72, 0.72] : [0.72, 0.72, 0.12];
    g.box(sz[0], sz[1], sz[2], [x, y, z], rnd() < 0.5 ? '#ffd88a' : '#ffe6a8');
    if (side) { b.box(0.16, 0.12, 0.94, [x, y + 0.42, z], h.trim); b.box(0.16, 0.12, 0.94, [x, y - 0.42, z], h.trim); }
    else { b.box(0.94, 0.12, 0.16, [x, y + 0.42, z], h.trim); b.box(0.94, 0.12, 0.16, [x, y - 0.42, z], h.trim); b.box(0.1, 0.72, 0.14, [x, y, z + 0.01], h.trim); }
  };
  const wx = h.floors === 2 ? w * 0.28 : w * 0.3;
  win(wx, base + 1.5, d / 2 + 0.02, false);
  if (h.floors === 1) win(-wx, base + 1.5, d / 2 + 0.02, false);
  if (h.floors === 2) { win(-w * 0.28, base + 4.1, d / 2 + 0.02, false); win(w * 0.28, base + 4.1, d / 2 + 0.02, false); }
  win(w / 2 + 0.02, base + 1.5, 0, true); win(-w / 2 - 0.02, base + 1.5, 0, true);
  if (h.floors === 2) { win(w / 2 + 0.02, base + 4.1, 0, true); win(-w / 2 - 0.02, base + 4.1, 0, true); }
  // flower box under the front window
  b.box(0.95, 0.2, 0.3, [wx, base + 1.0, d / 2 + 0.2], WOOD);
  for (let i = 0; i < 4; i++) b.sph(0.1, [wx - 0.33 + i * 0.22, base + 1.17, d / 2 + 0.22], ['#ff7aa8', '#ffe14a', '#ffffff', '#ff9a4a'][(i + idx) % 4], 1, 4);
  // garden flowers + bush
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, r = 1.8 + rnd() * 0.9;
    b.sph(0.12 + rnd() * 0.05, [Math.cos(a) * (w / 2 + 0.2 + rnd()), 0.16, d / 2 + 0.8 + Math.abs(Math.sin(a)) * r * 0.5], ['#ff7aa8', '#ffe14a', '#ffffff', '#9ac8ff', '#ff9a4a'][(i + idx) % 5], 1, 4);
  }
  b.sph(0.6, [w / 2 + 0.55, 0.45, d / 2 - 0.4], '#3f8f3a', [1, 0.8, 1], 6);
  // barrel / crates now and then
  if (idx % 3 === 0) { b.cyl(0.4, 0.45, 0.8, 8, [-w / 2 - 0.7, 0.4, d / 2 - 0.5], '#8a5a30'); b.cyl(0.46, 0.46, 0.07, 8, [-w / 2 - 0.7, 0.5, d / 2 - 0.5], '#3a3a40'); }
  else if (idx % 3 === 1) { b.box(0.8, 0.7, 0.8, [-w / 2 - 0.7, 0.35, d / 2 - 0.4], '#a4793f', [0, 0.3, 0]); b.box(0.55, 0.5, 0.55, [-w / 2 - 0.65, 0.95, d / 2 - 0.3], '#b88a4e', [0, 0.7, 0]); }
  return { b: b.build(), g: g.build() };
}

// ------------------------------------------------------------------ stalls ---
function buildStall(s: StallSpec): { b: BufferGeometry; g: BufferGeometry } {
  const b = new GB([0.82, 1.08]), g = new GB([1, 1]);
  for (const sx of [-1, 1]) { b.box(0.16, 2.5, 0.16, [sx * 1.7, 1.25, 0.9], WOOD); b.box(0.16, 2.9, 0.16, [sx * 1.7, 1.45, -0.9], WOOD); }
  b.box(3.7, 0.9, 0.9, [0, 0.45, 0.8], '#8a5a30'); b.box(3.9, 0.1, 1.1, [0, 0.95, 0.8], '#b88556');
  b.box(3.7, 2.2, 0.12, [0, 1.3, -0.95], '#a4793f');
  const n = 7, w = 3.9 / n;
  for (let i = 0; i < n; i++) {
    b.box(w, 0.1, 2.5, [-1.95 + w * (i + 0.5), 2.7, 0], i % 2 ? s.c1 : s.c2, [0.28, 0, 0]);
    b.box(w, 0.26, 0.06, [-1.95 + w * (i + 0.5), 2.38, 1.2], i % 2 ? s.c1 : s.c2);
  }
  const fruit = ['#e0443a', '#ff9a2a', '#7ac04a', '#ffd23a'];
  if (s.goods === 0) for (let i = 0; i < 9; i++) b.sph(0.17, [-1.35 + (i % 5) * 0.62 + ((i / 5) | 0) * 0.3, 1.18 + ((i / 5) | 0) * 0.12, 0.65 + ((i / 5) | 0) * 0.3], fruit[i % 4], 1, 5);
  else if (s.goods === 1) for (let i = 0; i < 6; i++) b.cyl(0.2, 0.2, 0.9, 8, [-1.3 + i * 0.52, 1.45, 0.7], ['#3f74d0', '#d94a5a', '#e8c05a', '#7a5aa8', '#3f9a4a', '#ffffff'][i], [0, 0, Math.PI / 2], 1);
  else if (s.goods === 2) for (let i = 0; i < 5; i++) { b.box(0.55, 0.28, 0.55, [-1.3 + i * 0.65, 1.14, 0.8], '#a4793f'); b.sph(0.22, [-1.3 + i * 0.65, 1.38, 0.8], ['#4aa83a', '#ff9a2a', '#a43a4a', '#7ac04a', '#e8c05a'][i], [1, 0.8, 1], 5); }
  else for (let i = 0; i < 6; i++) { b.cyl(0.26, 0.3, 0.2, 8, [-1.3 + i * 0.52, 1.05, 0.8], '#8a5a30'); b.sph(0.2, [-1.3 + i * 0.52, 1.2, 0.8], '#d6a860', [1.1, 0.7, 0.8], 5); }
  // hanging lantern + crates beside
  g.sph(0.14, [0, 2.2, 1.0], '#ffd070', 1, 6); b.box(0.03, 0.3, 0.03, [0, 2.4, 1.0], '#2a2a2e');
  b.box(0.8, 0.7, 0.8, [2.3, 0.35, 0.3], '#a4793f', [0, 0.3, 0]); b.cyl(0.4, 0.45, 0.8, 8, [2.5, 0.4, 1.3], '#8a5a30');
  void fruit;
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
function buildRoads(): BufferGeometry {
  const r = new GB([1, 1]);
  const S = ['#bfa87c', '#c4ad82', '#b9a276'];
  ROADS.forEach((rd, i) => {
    const dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, len = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx);
    r.box(len, 0.05, rd.w + 0.7, [(rd.x1 + rd.x2) / 2, 0.03, (rd.z1 + rd.z2) / 2], '#9c8a64', [0, yaw, 0]);
    r.box(len, 0.06, rd.w, [(rd.x1 + rd.x2) / 2, 0.045, (rd.z1 + rd.z2) / 2], S[i % 3], [0, yaw, 0]);
  });
  // plaza
  r.cyl(PLAZA.r, PLAZA.r, 0.08, 28, [PLAZA.x, 0.05, PLAZA.z], '#8d8678');
  r.cyl(PLAZA.r - 0.7, PLAZA.r - 0.7, 0.1, 28, [PLAZA.x, 0.06, PLAZA.z], '#a8a090');
  r.cyl(PLAZA.r * 0.62, PLAZA.r * 0.62, 0.11, 24, [PLAZA.x, 0.065, PLAZA.z], '#b6ae9d');
  r.cyl(2.2, 2.2, 0.12, 20, [PLAZA.x, 0.07, PLAZA.z], '#cdb88a');
  r.cyl(1.7, 1.7, 0.13, 20, [PLAZA.x, 0.075, PLAZA.z], '#e0c98f');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; r.box(0.5, 0.13, 1.5, [PLAZA.x + Math.cos(a) * 4.3, 0.075, PLAZA.z + Math.sin(a) * 4.3], '#8d8678', [0, -a + Math.PI / 2, 0]); }
  // gate forecourt
  r.cyl(6.5, 6.5, 0.08, 20, [GATE.x, 0.05, GATE.z], '#8d8678'); r.cyl(5.8, 5.8, 0.1, 20, [GATE.x, 0.06, GATE.z], '#a8a090');
  return r.build();
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
    road: litMat({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color('#ffd36a'), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => {
    town.chunks.forEach((c) => { c.body.dispose(); c.glow.dispose(); }); town.roads.dispose();
    mats.lit.dispose(); mats.road.dispose(); mats.glow.dispose(); mats.ring.dispose();
  }, [town, mats]);
  const label = useMemo(() => labelMaterial('Town Gate', '#ffe69a', { size: 60 }), []);
  const label2 = useMemo(() => labelMaterial('Adventure awaits', '#cfe4ff', { size: 40 }), []);
  const ring = useRef<Mesh>(null!), sprite = useRef<Sprite>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.ring.opacity = 0.22 + 0.16 * Math.sin(t * 2.2);
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
      <sprite material={label2.mat} position={[GATE.x, 9.6, GATE.z + 1.2]} scale={[label2.aspect * 0.7, 0.7, 1]} />
    </group>
  );
}
