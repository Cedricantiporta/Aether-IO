// The crystal cave entrance at the back of the forest bay east of the town wall (engine/caveData CAVE_BAY / CAVE_MOUTH):
// a mossy rock mound with a dark arched opening, a timber mine frame, two hanging lanterns, a short rail track and a
// little ore pile, plus the MINING CAMP in the bay in front of it (caveData MINE_CAMP: rail tracks with mine carts, ore
// heaps, crates, barrels, an open timber shed, a tool rack, lantern posts, a signpost, a trodden yard). The dirt paths to
// the camp are townData ROADS (drawn by TownScenery). Static: ONE lit mesh + ONE glow mesh for the mouth, the same for the
// camp (world coords) + one flat dirt mesh, no real lights. buildMineStall() is the Mining Supplies stall model (used by
// render/Town.tsx Shop, type 'MINE'). Clicking the opening walks the hero there and enters (like the castle door).
import React, { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, MeshBasicMaterial } from 'three';
import { CAVE_DOOR, CAVE_MOUTH, MINE_CAMP } from '../engine/caveData';
import { walkTo } from '../engine/systems/village';
import { GB, litMat, mulberry32 } from './util';
import { makeRockGeo } from './models';
import { QualityCfg } from './quality';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';

type V3 = [number, number, number];
const WOOD = '#5a3a1e', WOOD2 = '#6e4b2b', IRON = '#2e2e33', DARK = '#050405';

function buildEntrance(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.06]), g = new GB([1, 1]);
  const rocks = [11, 23, 37, 41, 53].map((s, i) => makeRockGeo(700 + s, i % 2 ? '#7c8188' : '#6c7178', '#4c7432', 0.9));
  const rock = (k: number, pos: V3, scl: V3, ry = 0) => b.addColored(rocks[k % rocks.length], pos, [0, ry, 0], scl);
  // ---- the mound (local +z = the opening side): a big hill of rock behind, shoulders either side, a lintel slab
  rock(0, [0, -0.6, -6.2], [7.2, 4.6, 5.0], 0.3);
  rock(1, [-6.4, -0.4, -3.2], [4.2, 3.6, 4.4], 1.1);
  rock(2, [6.6, -0.4, -3.0], [4.4, 3.3, 4.2], 2.0);
  rock(3, [-3.9, -0.2, -0.4], [2.3, 3.4, 2.2], 0.6);   // left jamb
  rock(4, [3.9, -0.2, -0.5], [2.2, 3.1, 2.2], 2.4);    // right jamb
  rock(1, [0.2, 3.2, -1.3], [3.6, 1.6, 2.4], 0.2);      // lintel slab over the arch
  rock(2, [-1.6, 5.2, -4.0], [3.0, 2.2, 3.0], 1.7);     // top knobs
  rock(3, [2.4, 4.6, -3.6], [2.6, 1.8, 2.6], 0.4);
  rock(4, [-9.6, -0.3, -0.6], [2.4, 2.0, 2.4], 0.9);
  rock(0, [9.6, -0.3, -0.2], [2.2, 1.8, 2.2], 2.6);
  rock(1, [-5.2, -0.1, 2.6], [1.1, 0.9, 1.1], 0.2);     // loose boulders at the foot
  rock(2, [5.4, -0.1, 2.4], [0.9, 0.8, 0.9], 1.2);
  rock(3, [6.4, -0.1, 3.8], [0.55, 0.5, 0.55], 0.5);
  rock(4, [-6.6, -0.1, 1.2], [0.7, 0.6, 0.7], 2.2);
  rocks.forEach((r) => r.dispose());
  // ---- the dark arched opening (a black tunnel mouth going back into the rock)
  b.box(3.8, 3.0, 5.0, [0, 1.5, -1.6], DARK, [0, 0, 0], [1, 1]);
  b.cyl(1.9, 1.9, 5.0, 14, [0, 3.0, -1.6], DARK, [Math.PI / 2, 0, 0], 1, [1, 1]);
  b.box(4.6, 0.06, 2.4, [0, 0.03, 0.4], '#3a2f26', [0, 0, 0], [1, 1]);   // dark trodden floor at the threshold
  // ---- timber mine frame inside the arch: two posts, a lintel beam, corner braces
  for (const sx of [-1, 1]) {
    b.box(0.32, 3.3, 0.32, [sx * 1.62, 1.65, 1.1], WOOD);
    b.box(0.2, 0.9, 0.2, [sx * 1.25, 3.0, 1.1], WOOD2, [0, 0, sx * 0.8]);
  }
  b.box(4.0, 0.38, 0.42, [0, 3.45, 1.1], WOOD2);
  b.box(4.3, 0.18, 0.5, [0, 3.72, 1.05], WOOD);
  // ---- lanterns on posts either side of the opening (glow only)
  for (const sx of [-1, 1]) {
    const x = sx * 2.75, z = 2.1;
    b.box(0.18, 2.6, 0.18, [x, 1.3, z], WOOD); b.box(0.9, 0.12, 0.12, [x - sx * 0.35, 2.5, z], WOOD);
    b.box(0.05, 0.25, 0.05, [x - sx * 0.7, 2.33, z], IRON);
    b.box(0.34, 0.06, 0.34, [x - sx * 0.7, 2.22, z], IRON); b.box(0.34, 0.06, 0.34, [x - sx * 0.7, 1.74, z], IRON);
    b.cone(0.26, 0.22, 4, [x - sx * 0.7, 2.34, z], IRON, [0, Math.PI / 4, 0]);
    g.box(0.24, 0.42, 0.24, [x - sx * 0.7, 1.98, z], '#ffc86a');
  }
  // ---- a short mine-cart rail track coming out of the dark + sleepers
  for (const sx of [-1, 1]) b.box(0.09, 0.09, 6.6, [sx * 0.58, 0.1, 1.2], IRON);
  for (let k = 0; k < 9; k++) b.box(1.6, 0.08, 0.26, [0, 0.05, -1.6 + k * 0.72], k % 2 ? WOOD : WOOD2);
  // ---- a faint cold glow from deep inside + crystal glints at the threshold (a hint of what is in there)
  g.box(3.3, 2.4, 0.02, [0, 1.2, 0.93], '#17414c', [0, 0, 0], [1, 0.15]);
  g.octa(0.26, [0.95, 0.35, 1.05], '#6fe6ff', [0.7, 1.6, 0.7], [0.2, 0, 0.3]); g.octa(0.18, [1.2, 0.25, 1.4], '#6fe6ff', [0.7, 1.4, 0.7], [-0.3, 0, 0.5]);
  g.octa(0.22, [-1.05, 0.3, 1.15], '#c49aff', [0.7, 1.6, 0.7], [0.1, 0, -0.4]);
  // ---- ore pile, a crate and a pick by the right lantern
  const r = mulberry32(31);
  for (let i = 0; i < 7; i++) b.dodeca(0.22 + r() * 0.14, [3.6 + r() * 0.9, 0.12 + (i > 4 ? 0.22 : 0), 2.9 + r() * 0.8], i % 3 ? '#6e6a66' : '#9a6a3a');
  g.octa(0.12, [4.0, 0.42, 3.2], '#6fe6ff', [0.8, 1.4, 0.8]);
  b.box(0.9, 0.7, 0.9, [-3.7, 0.35, 3.0], WOOD2, [0, 0.4, 0]); b.box(0.95, 0.08, 0.95, [-3.7, 0.72, 3.0], WOOD, [0, 0.4, 0]);
  b.cyl(0.04, 0.04, 1.3, 5, [-3.1, 0.62, 3.9], WOOD, [0.2, 0, 1.0]); b.box(0.7, 0.1, 0.1, [-3.62, 1.12, 3.82], IRON, [0, 0.1, 0.2]);
  return { body: b.build(), glow: g.build() };
}

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
function shed(b: GB, g: GB, x: number, z: number, rot: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  b.box(4.6, 0.16, 3.0, P(0, 0.08, 0), '#5e4026', R);   // plank floor
  for (const sx of [-2.1, 0, 2.1]) { b.box(0.22, 2.9, 0.22, P(sx, 1.45, -1.3), WOOD, R); b.box(0.22, 2.2, 0.22, P(sx, 1.1, 1.3), WOOD, R); }
  for (let i = 0; i < 5; i++) b.box(4.4, 0.42, 0.08, P(0, 0.4 + i * 0.5, -1.38), i % 2 ? '#7a5634' : '#6e4b2b', R);   // back wall
  for (const sx of [-1, 1]) b.box(0.08, 1.2, 2.5, P(sx * 2.2, 0.7, -0.1), '#6e4b2b', R);                        // low side walls
  // sloped plank roof (down to the open front) + a ridge beam
  b.box(5.0, 0.12, 3.6, P(0, 2.6, 0.05), '#3b2a20', [0, rot, 0]); b.box(5.1, 0.16, 0.18, P(0, 2.95, -1.45), '#2b211a', R);
  // stacked pit props (logs) + sacks + a coil of rope + a hanging lantern
  for (let i = 0; i < 6; i++) { const row = i < 3 ? 0 : 1, k = row ? i - 3 : i; b.cyl(0.2, 0.2, 2.2, 7, P(-0.8 + k * 0.42 + row * 0.21, 0.36 + row * 0.36, -0.7), k % 2 ? '#8a6440' : '#7a5634', [0, rot, Math.PI / 2]); }
  b.sph(0.36, P(1.3, 0.42, -0.6), '#c9b28a', [1, 0.85, 1], 6); b.sph(0.32, P(1.75, 0.38, -0.2), '#b9a27a', [1, 0.85, 1], 6);
  b.torus(0.28, 0.08, P(1.5, 0.95, -1.28), '#b8a070', [0, rot, 0], 1, 10);
  b.box(0.05, 0.4, 0.05, P(-1.2, 2.25, 0.6), IRON, R); b.box(0.26, 0.05, 0.26, P(-1.2, 2.04, 0.6), IRON, R); b.box(0.26, 0.05, 0.26, P(-1.2, 1.7, 0.6), IRON, R);
  g.box(0.18, 0.3, 0.18, P(-1.2, 1.87, 0.6), '#ffc86a', R);
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
function signpost(b: GB, x: number, z: number, rot: number) {
  const P = placer(x, z, rot), R: V3 = [0, rot, 0];
  b.box(0.16, 2.2, 0.16, P(0, 1.1, 0), WOOD, R);
  b.box(1.5, 0.5, 0.08, P(0.45, 1.75, 0), '#8a6440', R);
  b.box(0.06, 0.34, 0.03, P(0.3, 1.75, 0.06), '#2b2b30', R); b.box(0.4, 0.07, 0.03, P(0.3, 1.9, 0.06), '#2b2b30', R);   // pickaxe glyph
  b.box(0.06, 0.34, 0.03, P(0.75, 1.75, 0.06), '#2b2b30', R); b.box(0.4, 0.07, 0.03, P(0.75, 1.9, 0.06), '#2b2b30', R);
}
function buildCamp(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.06]), g = new GB([1, 1]), m = MINE_CAMP;
  for (const [x1, z1, x2, z2] of m.rails) rails(b, x1, z1, x2, z2);
  for (const k of m.carts) mineCart(b, g, k.x, k.z, k.rot, k.load);
  for (const [x, z, s] of m.ore) oreHeap(b, g, x, z, s);
  for (const [x, z, r] of m.crates) crateStack(b, x, z, r);
  for (const [x, z] of m.barrels) barrel(b, x, z);
  shed(b, g, m.shed.x, m.shed.z, m.shed.rot);
  toolRack(b, m.rack.x, m.rack.z, m.rack.rot);
  for (const [x, z] of m.lanterns) lanternPost(b, g, x, z, Math.atan2(m.yard.x - x, m.yard.z - z));
  signpost(b, m.sign.x, m.sign.z, 0.6);
  return { body: b.build(), glow: g.build() };
}

/** Mining Supplies stall (shop 'MINE'; local, counter faces +z): a timber stall with a pale cloth roof, a counter of
 *  lantern-oil flasks (warm glow) and lanterns, pickaxes on the back wall, rope, sacks and a crate of crystals. */
export function buildMineStall(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  b.box(5.0, 0.22, 3.8, [0, 0.11, 0], '#5e4026');
  for (let i = 0; i < 9; i++) b.box(0.52, 0.04, 3.7, [-2.2 + i * 0.55, 0.23, 0], i % 2 ? '#7a5634' : '#8a6440');
  b.box(4.7, 2.7, 0.18, [0, 1.55, -1.7], '#8a6a48'); for (let i = 0; i < 5; i++) b.box(4.72, 0.05, 0.2, [0, 0.6 + i * 0.55, -1.6], '#5e4026');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.26, 3.2, 0.26, [sx * 2.3, 1.6, sz * 1.65 - 0.05], '#3e2a18');
  b.box(0.16, 1.4, 3.2, [2.3, 0.92, 0], '#7a5634');
  // pickaxes + a shovel hung on the back wall
  for (let i = 0; i < 3; i++) { const x = -1.5 + i * 1.0; b.box(0.07, 1.3, 0.07, [x, 1.75, -1.55], '#8a6440', [0, 0, 0.25]); b.box(0.8, 0.1, 0.1, [x - 0.17, 2.36, -1.53], '#5c6068', [0, 0, 0.25]); }
  b.box(0.07, 1.4, 0.07, [1.6, 1.4, -1.55], '#8a6440'); b.box(0.32, 0.42, 0.05, [1.6, 0.75, -1.53], '#6e737c');
  // counter: oil flasks (amber glow) + lanterns for sale + a ledger
  b.box(4.2, 1.0, 0.8, [0, 0.72, 1.25], '#7a5634'); b.box(4.4, 0.1, 1.0, [0, 1.25, 1.25], '#a07a50');
  for (let i = 0; i < 5; i++) { const x = -1.9 + i * 0.32, z = 1.12 + (i % 2) * 0.22; g.sph(0.13, [x, 1.43, z], '#ffb84a', [1, 1.15, 1], 7); b.cyl(0.045, 0.045, 0.16, 5, [x, 1.63, z], '#d8c6a0'); b.cyl(0.055, 0.055, 0.05, 5, [x, 1.73, z], '#5a3a1e'); }
  for (const x of [0.25, 0.85]) { b.box(0.3, 0.05, 0.3, [x, 1.32, 1.25], IRON); b.box(0.3, 0.05, 0.3, [x, 1.78, 1.25], IRON); b.cone(0.22, 0.18, 4, [x, 1.88, 1.25], IRON, [0, Math.PI / 4, 0]); g.box(0.2, 0.38, 0.2, [x, 1.55, 1.25], '#ffd27a'); }
  b.box(0.55, 0.06, 0.4, [1.6, 1.33, 1.2], '#e8dcc0', [0, 0.3, 0]); b.box(0.5, 0.05, 0.36, [1.6, 1.37, 1.2], '#7a3a2a', [0, 0.3, 0]);
  // roof: pale cloth over a plank edge (slopes to the front) + valance
  b.box(5.4, 0.1, 4.3, [0, 3.15, 0.25], '#e6dfcf', [0.2, 0, 0]); b.box(5.5, 0.14, 0.16, [0, 2.75, 2.35], '#5e4026');
  for (let i = 0; i < 6; i++) b.box(0.9, 0.3, 0.06, [-2.25 + i * 0.9, 2.55, 2.4], '#e6dfcf');
  // rope coil, sacks of ore, a crate of crystals beside the stall, a hanging lantern
  b.torus(0.3, 0.08, [-2.0, 2.0, -1.5], '#b8a070', [0, 0, 0], 1, 10);
  b.sph(0.36, [3.0, 0.4, 0.6], '#c9b28a', [1, 0.85, 1], 6); b.sph(0.32, [3.05, 0.36, -0.35], '#b9a27a', [1, 0.85, 1], 6);
  b.box(0.8, 0.6, 0.8, [-3.0, 0.3, 0.6], '#9c7245'); for (let i = 0; i < 3; i++) g.octa(0.12, [-3.15 + i * 0.16, 0.72, 0.5 + (i % 2) * 0.2], i % 2 ? '#c49aff' : '#6fe6ff', [0.8, 1.5, 0.8]);
  b.box(0.06, 0.5, 0.06, [2.0, 2.3, 1.95], IRON); b.box(0.24, 0.05, 0.24, [2.0, 2.02, 1.95], IRON); b.box(0.24, 0.05, 0.24, [2.0, 1.74, 1.95], IRON);
  g.sph(0.13, [2.0, 1.88, 1.95], '#ffd070', 1, 6);
  return { body: b.build(), glow: g.build() };
}

export function CaveEntrance({ q }: { q: QualityCfg }) {
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  const geo = useMemo(() => ({ ...buildEntrance(), path: buildPath(), camp: buildCamp() }), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.9, flatShading: true }),
    dirt: litMat({ roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
  }), []);
  useEffect(() => () => { geo.body.dispose(); geo.glow.dispose(); geo.path.dispose(); geo.camp.body.dispose(); geo.camp.glow.dispose(); mats.lit.dispose(); mats.dirt.dispose(); mats.glow.dispose(); }, [geo, mats]);
  if (!village) return null;
  const sh = q.shadowMap > 0;
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(CAVE_DOOR.x, CAVE_DOOR.z, 'cave', '', 2.4); };
  return (
    <group>
      <mesh geometry={geo.path} material={mats.dirt} receiveShadow={sh} />
      <mesh geometry={geo.camp.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.camp.glow} material={mats.glow} />
      <group position={[CAVE_MOUTH.x, 0, CAVE_MOUTH.z]} rotation={[0, CAVE_MOUTH.rot, 0]}>
        <mesh geometry={geo.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
        <mesh geometry={geo.glow} material={mats.glow} />
        <mesh position={[0, 2, 0.6]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
          <boxGeometry args={[5, 4.4, 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
