// The crystal cave entrance at the back of the forest bay east of the town wall (engine/caveData CAVE_BAY / CAVE_MOUTH):
// a mossy rock mound with a dark arched opening, a timber mine frame, two hanging lanterns, a short rail track and a
// little ore pile, plus a trodden dirt path from the ring path into the bay. Static: ONE lit mesh + ONE glow mesh
// (+ one flat dirt mesh), no real lights. Clicking the opening walks the hero there and enters (like the castle door).
import React, { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, MeshBasicMaterial } from 'three';
import { CAVE_DOOR, CAVE_MOUTH } from '../engine/caveData';
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

/** Trodden dirt path from the ring path (x ~ 56) east into the bay, ending in a worn patch at the cave mouth (world coords). */
function buildPath(): BufferGeometry {
  const r = new GB([1, 1]), rnd = mulberry32(57);
  const x0 = 55.5, z0 = 12, x1 = CAVE_DOOR.x, z1 = CAVE_DOOR.z, n = Math.round(x1 - x0);
  let drift = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t * t;
    drift = drift * 0.7 + (rnd() - 0.5) * 0.4;
    const rw = 0.8 * (0.85 + rnd() * 0.35), ry = (rnd() - 0.5) * 0.5;
    r.cyl(rw + 0.45, rw + 0.45, 0.02, 9, [x, 0.022, z + drift], '#86964c', [0, ry, 0], [1.45, 1, 1]);
    r.cyl(rw, rw, 0.02, 9, [x, 0.034, z + drift], '#8f7752', [0, ry + 0.4, 0], [1.4, 1, 1]);
    if (rnd() < 0.3) r.cyl(rw * 0.35, rw * 0.35, 0.02, 7, [x, 0.046, z + drift + (rnd() - 0.5) * rw], '#a08a63', [0, rnd() * 3, 0], [1.5, 1, 1]);
  }
  // worn patch in front of the opening
  const fx = Math.sin(CAVE_MOUTH.rot), fz = Math.cos(CAVE_MOUTH.rot), px = CAVE_MOUTH.x + fx * 3.6, pz = CAVE_MOUTH.z + fz * 3.6;
  r.cyl(3.2, 3.2, 0.02, 14, [px, 0.03, pz], '#86964c', [0, CAVE_MOUTH.rot, 0], [1.25, 1, 1]);
  r.cyl(2.6, 2.6, 0.02, 14, [px, 0.04, pz], '#7d684a', [0, CAVE_MOUTH.rot + 0.3, 0], [1.2, 1, 1]);
  return r.build();
}

export function CaveEntrance({ q }: { q: QualityCfg }) {
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  const geo = useMemo(() => ({ ...buildEntrance(), path: buildPath() }), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.9, flatShading: true }),
    dirt: litMat({ roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }),
  }), []);
  useEffect(() => () => { geo.body.dispose(); geo.glow.dispose(); geo.path.dispose(); mats.lit.dispose(); mats.dirt.dispose(); mats.glow.dispose(); }, [geo, mats]);
  if (!village) return null;
  const sh = q.shadowMap > 0;
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(CAVE_DOOR.x, CAVE_DOOR.z, 'cave', '', 2.4); };
  return (
    <group>
      <mesh geometry={geo.path} material={mats.dirt} receiveShadow={sh} />
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
