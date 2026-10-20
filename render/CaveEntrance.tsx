// The crystal cave entrance at the back of the forest bay east of the town wall (engine/caveData CAVE_BAY / CAVE_MOUTH) and the
// MINING CAMP in the bay in front of it (caveData MINE_CAMP: a siding with a mine cart, ore heaps, crates, barrels, a tool rack,
// lantern posts, a trodden yard). The mine mouth, the two tents and the signpost are nature_kit_v1 pieces (render/NatureScenery.tsx),
// the Mining Supplies stall is a town_kit_v2 shop_stall_house (render/townKit.tsx); the dirt paths are townData ROADS (TownScenery).
// Static: ONE lit mesh + ONE glow mesh for the camp props (world coords) + one flat dirt mesh, no real lights. Clicking the opening
// walks the hero there and enters (like the castle door).
import React, { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, MeshBasicMaterial } from 'three';
import { CAVE_DOOR, CAVE_MOUTH, MINE_CAMP } from '../engine/caveData';
import { walkTo } from '../engine/systems/village';
import { GB, litMat, mulberry32 } from './util';
import { QualityCfg } from './quality';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';

type V3 = [number, number, number];
const WOOD = '#5a3a1e', WOOD2 = '#6e4b2b', IRON = '#2e2e33', DARK = '#050405';

/** Trodden ground of the mining camp (a worn yard of overlapping flat blobs) + a worn patch at the cave mouth (world coords;
 *  the paths themselves are townData ROADS). */
function buildPath(): BufferGeometry {
  const r = new GB([1, 1]), rnd = mulberry32(57), y = MINE_CAMP.yard;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.8, x = y.x + Math.cos(a) * y.rx * d, z = y.z + Math.sin(a) * y.rz * d;
    const rw = 1.6 + rnd() * 1.6, ry = rnd() * 3;
    r.cyl(rw + 0.5, rw + 0.5, 0.02, 9, [x, 0.02, z], '#86964c', [0, ry, 0], [1.4, 1, 1]);
    r.cyl(rw, rw, 0.02, 9, [x, 0.03, z], i % 3 ? '#8f7752' : '#857049', [0, ry + 0.4, 0], [1.35, 1, 1]);
    if (rnd() < 0.4) r.cyl(rw * 0.4, rw * 0.4, 0.02, 7, [x + (rnd() - 0.5) * rw, 0.042, z + (rnd() - 0.5) * rw], '#a08a63', [0, rnd() * 3, 0], [1.5, 1, 1]);
  }
  // worn patch in front of the opening
  const fx = Math.sin(CAVE_MOUTH.rot), fz = Math.cos(CAVE_MOUTH.rot), px = CAVE_MOUTH.x + fx * 3.6, pz = CAVE_MOUTH.z + fz * 3.6;
  r.cyl(3.2, 3.2, 0.02, 14, [px, 0.03, pz], '#86964c', [0, CAVE_MOUTH.rot, 0], [1.25, 1, 1]);
  r.cyl(2.6, 2.6, 0.02, 14, [px, 0.04, pz], '#7d684a', [0, CAVE_MOUTH.rot + 0.3, 0], [1.2, 1, 1]);
  return r.build();
}

// ------------------------------------------------------------ mining camp ---
type P3 = (lx: number, y: number, lz: number) => V3;
/** Local -> world placer for a prop at (x, z) turned by yaw `rot` (local +z = facing (sin rot, cos rot)). */
const placer = (x: number, z: number, rot: number): P3 => { const c = Math.cos(rot), s = Math.sin(rot); return (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c]; };
function rails(b: GB, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), rot = Math.atan2(dx, dz), P = placer((x1 + x2) / 2, (z1 + z2) / 2, rot), R: V3 = [0, rot, 0];
  for (const sx of [-1, 1]) b.box(0.09, 0.09, len, P(sx * 0.58, 0.1, 0), IRON, R);
  const n = Math.round(len / 0.72);
  for (let k = 0; k <= n; k++) b.box(1.6, 0.08, 0.26, P(0, 0.05, -len / 2 + (len * k) / n), k % 2 ? WOOD : WOOD2, R);
  b.box(1.5, 0.45, 0.3, P(0, 0.24, len / 2 + 0.25), WOOD2, R); b.box(1.7, 0.12, 0.36, P(0, 0.5, len / 2 + 0.25), WOOD, R);   // end buffer
}
function mineCart(b: GB, g: GB, x: number, z: number, rot: number, load: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  b.box(1.2, 0.62, 1.7, P(0, 0.78, 0), '#5d4a36', R); b.box(1.3, 0.08, 1.8, P(0, 1.1, 0), IRON, R);   // tub + rim
  for (const sz of [-0.55, 0.55]) b.box(1.26, 0.66, 0.08, P(0, 0.78, sz), IRON, R);                  // iron bands
  b.box(1.0, 0.12, 1.5, P(0, 0.42, 0), '#3a332c', R);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl(0.24, 0.24, 0.12, 9, P(sx * 0.62, 0.26, sz * 0.52), '#2b2b30', [0, rot, Math.PI / 2]); b.cyl(0.08, 0.08, 0.14, 6, P(sx * 0.64, 0.26, sz * 0.52), '#6e6e74', [0, rot, Math.PI / 2]); }
  b.box(0.08, 0.08, 0.7, P(0, 0.9, -1.15), IRON, R);   // tow bar
  const r = mulberry32(Math.round(x * 13 + z * 7));
  if (load === 0) { b.sph(0.62, P(0, 1.08, 0), '#6e6a66', [1, 0.45, 1.3], 7); for (let i = 0; i < 6; i++) b.dodeca(0.16 + r() * 0.1, P((r() - 0.5) * 0.8, 1.25 + r() * 0.12, (r() - 0.5) * 1.2), i % 3 ? '#6e6a66' : '#9a6a3a'); g.octa(0.1, P(0.2, 1.38, 0.3), '#6fe6ff', [0.8, 1.4, 0.8]); }
  else if (load === 1) { b.sph(0.6, P(0, 1.05, 0), '#4b4f58', [1, 0.4, 1.3], 7); for (let i = 0; i < 5; i++) g.octa(0.14 + r() * 0.08, P((r() - 0.5) * 0.7, 1.32 + r() * 0.15, (r() - 0.5) * 1.1), i % 2 ? '#6fe6ff' : '#c49aff', [0.7, 1.7, 0.7], [r() - 0.5, 0, r() - 0.5]); }
}
function oreHeap(b: GB, g: GB, x: number, z: number, s: number) {
  const r = mulberry32(Math.round(x * 31 + z * 17));
  b.sph(1.1 * s, [x, 0.05, z], '#6a6560', [1.2, 0.5, 1], 7);
  for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = r() * 0.95 * s; b.dodeca((0.2 + r() * 0.18) * s, [x + Math.cos(a) * d, 0.25 + (1 - d / s) * 0.4 * s, z + Math.sin(a) * d], i % 4 ? (i % 2 ? '#6e6a66' : '#7d7670') : '#9a6a3a'); }
  for (let i = 0; i < 3; i++) g.octa(0.1 * s, [x + (r() - 0.5) * s, 0.5 * s, z + (r() - 0.5) * s], i % 2 ? '#6fe6ff' : '#c49aff', [0.8, 1.5, 0.8]);
  b.cyl(0.04, 0.04, 1.3, 5, [x + 0.6 * s, 0.75 * s, z - 0.3 * s], WOOD, [0.3, 0, 0.7]); b.box(0.75, 0.1, 0.1, [x + 0.95 * s, 1.18 * s, z - 0.42 * s], IRON, [0, 0.2, 0.6]);   // a pick stuck in the heap
}
function crateStack(b: GB, x: number, z: number, rot: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  b.box(0.9, 0.8, 0.9, P(-0.3, 0.4, 0), WOOD2, R); b.box(0.95, 0.07, 0.95, P(-0.3, 0.8, 0), WOOD, R);
  b.box(0.8, 0.7, 0.8, P(0.62, 0.35, 0.15), '#7a5a36', R); b.box(0.7, 0.6, 0.7, P(-0.2, 1.14, 0.05), '#8a6a42', [0, rot + 0.4, 0]);
  b.box(0.6, 0.05, 0.08, P(0.62, 0.72, 0.15), IRON, R);
}
function barrel(b: GB, x: number, z: number) { b.cyl(0.42, 0.46, 0.95, 9, [x, 0.48, z], '#7a4f2a'); b.cyl(0.47, 0.47, 0.06, 9, [x, 0.25, z], '#3a3a3e'); b.cyl(0.47, 0.47, 0.06, 9, [x, 0.72, z], '#3a3a3e'); b.cyl(0.4, 0.4, 0.04, 9, [x, 0.96, z], '#5a3a1e'); }
function lanternPost(b: GB, g: GB, x: number, z: number, rot: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  b.box(0.18, 2.7, 0.18, P(0, 1.35, 0), WOOD, R); b.box(0.12, 0.12, 0.85, P(0, 2.6, 0.35), WOOD, R);
  b.box(0.05, 0.22, 0.05, P(0, 2.43, 0.7), IRON, R); b.box(0.32, 0.06, 0.32, P(0, 2.3, 0.7), IRON, R); b.box(0.32, 0.06, 0.32, P(0, 1.86, 0.7), IRON, R);
  b.cone(0.24, 0.2, 4, P(0, 2.42, 0.7), IRON, [0, rot + Math.PI / 4, 0]);
  g.box(0.22, 0.38, 0.22, P(0, 2.08, 0.7), '#ffc86a', R);
}
function toolRack(b: GB, x: number, z: number, rot: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  for (const sx of [-1.1, 1.1]) b.box(0.16, 1.7, 0.16, P(sx, 0.85, 0), WOOD, R);
  b.box(2.5, 0.12, 0.14, P(0, 1.55, 0), WOOD2, R); b.box(2.5, 0.1, 0.12, P(0, 0.35, 0.05), WOOD2, R);
  for (let i = 0; i < 4; i++) {   // pickaxes + shovels leaning on the bar
    const lx = -0.8 + i * 0.53;
    b.box(0.07, 1.75, 0.07, P(lx, 0.85, 0.22), '#8a6440', R);
    if (i % 2 === 0) b.box(0.72, 0.1, 0.12, P(lx, 1.68, 0.22), '#5c6068', R);   // pick head
    else b.box(0.3, 0.4, 0.05, P(lx, 0.14, 0.24), '#6e737c', R);              // shovel blade
  }
}
function buildCamp(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.06]), g = new GB([1, 1]), m = MINE_CAMP;
  for (const [x1, z1, x2, z2] of m.rails) rails(b, x1, z1, x2, z2);
  for (const k of m.carts) mineCart(b, g, k.x, k.z, k.rot, k.load);
  for (const [x, z, s] of m.ore) oreHeap(b, g, x, z, s);
  for (const [x, z, r] of m.crates) crateStack(b, x, z, r);
  for (const [x, z] of m.barrels) barrel(b, x, z);
  toolRack(b, m.rack.x, m.rack.z, m.rack.rot);
  for (const [x, z] of m.lanterns) lanternPost(b, g, x, z, Math.atan2(m.yard.x - x, m.yard.z - z));
  return { body: b.build(), glow: g.build() };
}

export function CaveEntrance({ q }: { q: QualityCfg }) {
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  const geo = useMemo(() => ({ path: buildPath(), camp: buildCamp() }), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.9, flatShading: true }),
    dirt: litMat({ roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
  }), []);
  useEffect(() => () => { geo.path.dispose(); geo.camp.body.dispose(); geo.camp.glow.dispose(); mats.lit.dispose(); mats.dirt.dispose(); mats.glow.dispose(); }, [geo, mats]);
  if (!village) return null;
  const sh = q.shadowMap > 0;
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(CAVE_DOOR.x, CAVE_DOOR.z, 'cave', '', 2.4); };
  return (
    <group>
      <mesh geometry={geo.path} material={mats.dirt} receiveShadow={sh} />
      <mesh geometry={geo.camp.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.camp.glow} material={mats.glow} />
      <group position={[CAVE_MOUTH.x, 0, CAVE_MOUTH.z]} rotation={[0, CAVE_MOUTH.rot, 0]}>
        <mesh position={[0, 2, 0.6]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
          <boxGeometry args={[5, 4.4, 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
