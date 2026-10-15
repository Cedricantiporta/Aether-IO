// Chapel interior (the village "CHURCH" area): flagstone nave, timber wall posts, pews either side of a blue aisle
// runner, stone pillars, tall stained-glass windows, the altar in a raised apse with candles and a glowing rose window.
// Static geometry is merged into ONE lit mesh + ONE glow mesh; 2 real point lights. Layout / colliders: churchData.ts.
// The priestess is drawn by <Npcs area="CHURCH" />.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { NAVE, APSE, PEW_Z, PEW_X, PEW_HL, NAVE_PILLARS } from '../engine/churchData';
import { GB, litMat } from './util';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const STONE = '#c9c2b2', STONE2 = '#a59e8f', STONE3 = '#ddd6c6', WOOD = '#5a3a22', WOOD2 = '#7a5232', GOLD = '#d9b04a', BLUE = '#2f4f8a';
const GLASS = ['#ff9a4a', '#6fb8ff', '#ffd24a', '#c27cff', '#7fe08a'];

function buildNave() {
  const b = new GB([0.82, 1.08]), g = new GB([1, 1]);
  const { hw, hd, h } = NAVE, T = 1.2;
  b.box(T, h, hd * 2 + 2 * T, [-hw - T / 2, h / 2, 0], STONE); b.box(T, h, hd * 2 + 2 * T, [hw + T / 2, h / 2, 0], STONE);
  b.box(hw * 2, h, T, [0, h / 2, -hd - T / 2], STONE); b.box(hw * 2, h, T, [0, h / 2, hd + T / 2], STONE);
  for (const sx of [-1, 1]) { b.box(0.3, 1.0, hd * 2, [sx * (hw - 0.15), 0.5, 0], STONE2); b.box(0.3, 0.4, hd * 2, [sx * (hw - 0.15), h - 0.2, 0], STONE3); }
  // roof beams + ridge
  for (let z = -hd + 1.5; z < hd; z += 3) for (const sx of [-1, 1]) { b.box(0.3, 2.2, 0.3, [sx * (hw - 0.3), h - 1.1, z], WOOD); b.box(1.2, 0.3, 0.3, [sx * (hw - 0.75), h - 0.15, z], WOOD); }   // (no beams across: the camera looks down from above)
  // stained-glass windows on both side walls
  let k = 0;
  for (const sx of [-1, 1]) for (const z of [-9, -3, 3, 9]) {
    if (sx < 0 && z === -9) continue;   // (the side door to the graveyard is here)
    const x = sx * (hw - 0.05);
    b.box(0.25, 4.0, 1.7, [x, 4.6, z], STONE3); b.cyl(0.85, 0.85, 0.25, 10, [x, 6.6, z], STONE3, [0, 0, Math.PI / 2]);
    for (let j = 0; j < 3; j++) g.box(0.12, 1.1, 1.2, [sx * (hw - 0.2), 3.4 + j * 1.15, z], GLASS[(k + j) % GLASS.length]);
    g.cyl(0.62, 0.62, 0.12, 10, [sx * (hw - 0.2), 6.5, z], GLASS[(k + 3) % GLASS.length], [0, 0, Math.PI / 2]);
    b.box(0.1, 3.5, 0.06, [sx * (hw - 0.26), 4.5, z], '#2a2a2e'); k++;
  }
  // rose window over the altar + tall lancets either side
  g.cyl(1.8, 1.8, 0.12, 18, [0, 5.4, -hd + 0.08], '#ffb85a', [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) g.box(0.6, 0.6, 0.1, [Math.cos((i / 8) * Math.PI * 2) * 1.1, 5.4 + Math.sin((i / 8) * Math.PI * 2) * 1.1, -hd + 0.14], GLASS[i % GLASS.length]);
  b.torus(1.85, 0.16, [0, 5.4, -hd + 0.15], STONE3, [0, 0, 0], 1, 18);
  for (const sx of [-1, 1]) { g.box(0.8, 3.2, 0.1, [sx * 3.4, 4.2, -hd + 0.08], '#9ec8ff'); b.box(1.1, 0.2, 0.3, [sx * 3.4, 5.9, -hd + 0.15], STONE3); }
  // pillars
  for (const [px, pz] of NAVE_PILLARS) { b.box(1.4, 0.4, 1.4, [px, 0.2, pz], STONE2); b.cyl(0.5, 0.56, h - 1.0, 10, [px, 0.4 + (h - 1.0) / 2, pz], STONE); b.box(1.3, 0.4, 1.3, [px, h - 0.6, pz], STONE3); }
  // aisle runner
  b.box(2.0, 0.04, hd * 2 - 4.4, [0, 0.02, 1.6], BLUE); for (const sx of [-1, 1]) b.box(0.12, 0.05, hd * 2 - 4.4, [sx * 0.96, 0.025, 1.6], GOLD);
  // pews
  for (const z of PEW_Z) for (const sx of [-1, 1]) {
    const x = sx * PEW_X;
    b.box(PEW_HL * 2, 0.12, 0.7, [x, 0.5, z], WOOD2); b.box(PEW_HL * 2, 0.8, 0.12, [x, 0.95, z + 0.36], WOOD);
    for (const e of [-1, 1]) b.box(0.12, 1.0, 0.8, [x + e * PEW_HL, 0.5, z + 0.05], WOOD);
  }
  // apse: altar step, altar with cloth, cross, candles
  b.box(APSE.hw * 2, APSE.h, APSE.z1 - APSE.z0, [0, APSE.h / 2, (APSE.z0 + APSE.z1) / 2], STONE3);
  b.box(3.2, 1.1, 1.3, [0, APSE.h + 0.55, -10.6], STONE2); b.box(3.4, 0.08, 1.5, [0, APSE.h + 1.14, -10.6], '#f2ead8');
  b.box(0.9, 1.15, 0.06, [0, APSE.h + 0.55, -9.93], '#8c1d28'); g.box(0.12, 0.6, 0.07, [0, APSE.h + 0.6, -9.88], GOLD);
  b.box(0.22, 2.6, 0.22, [0, APSE.h + 2.5, -11.4], GOLD); b.box(1.3, 0.22, 0.22, [0, APSE.h + 3.2, -11.4], GOLD);
  for (const sx of [-1, 1]) {
    b.cyl(0.12, 0.25, 1.5, 6, [sx * 2.7, 0.75, -9.4], '#2a2a2e'); b.cyl(0.09, 0.09, 0.35, 6, [sx * 2.7, 1.65, -9.4], '#f4ecd8'); g.sph(0.1, [sx * 2.7, 1.9, -9.4], '#ffd070', [1, 1.6, 1], 6);
    for (let i = 0; i < 3; i++) { b.cyl(0.05, 0.05, 0.25 + i * 0.08, 6, [sx * (0.9 + i * 0.3), APSE.h + 1.3 + i * 0.04, -10.9], '#f4ecd8'); g.sph(0.06, [sx * (0.9 + i * 0.3), APSE.h + 1.47 + i * 0.08, -10.9], '#ffd070', [1, 1.6, 1], 5); }
  }
  // side door to the graveyard (west wall)
  b.box(0.3, 3.2, 2.2, [-hw + 0.1, 1.6, -7.4], STONE3); b.box(0.2, 2.6, 1.6, [-hw + 0.2, 1.3, -7.4], WOOD); b.cyl(0.8, 0.8, 0.2, 10, [-hw + 0.2, 2.6, -7.4], WOOD, [0, 0, Math.PI / 2]);
  g.sph(0.12, [-hw + 0.4, 3.3, -7.4], '#9fe8ff', [1, 1.4, 1], 6);
  // door (inside face) + wall sconces
  b.box(2.6, 3.4, 0.2, [0, 1.7, hd - 0.05], WOOD); b.cyl(1.3, 1.3, 0.2, 12, [0, 3.4, hd - 0.05], WOOD, [Math.PI / 2, 0, 0]);
  for (const sx of [-1, 1]) for (const z of [-6, 0, 6]) { b.box(0.1, 0.5, 0.1, [sx * (hw - 0.25), 3.0, z + 1.5], '#2a2a2e'); g.sph(0.14, [sx * (hw - 0.3), 3.4, z + 1.5], '#ffb860', [1, 1.4, 1], 6); }
  return { body: b.build(), glow: g.build() };
}

export function ChurchInterior({ q }: { q: QualityCfg }) {
  const nave = useMemo(buildNave, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    floor: new MeshStandardMaterial({ color: new Color('#a8a194'), roughness: 0.95 }),
    outer: new MeshStandardMaterial({ color: new Color('#1a1613'), roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }),
  }), []);
  useEffect(() => () => { nave.body.dispose(); nave.glow.dispose(); mats.lit.dispose(); mats.floor.dispose(); mats.outer.dispose(); mats.glow.dispose(); }, [nave, mats]);
  const l1 = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (l1.current) l1.current.intensity = 30 + Math.sin(clock.elapsedTime * 6.3) * 3; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow={sh}><planeGeometry args={[NAVE.hw * 2, NAVE.hd * 2]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} material={mats.outer}><planeGeometry args={[400, 400]} /></mesh>
      <mesh geometry={nave.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={nave.glow} material={mats.glow} />
      <pointLight ref={l1} position={[0, 3, -9]} color="#ffc070" distance={22} decay={2} intensity={30} />
      <pointLight position={[0, 4, 6]} color="#ffe0b0" distance={24} decay={2} intensity={22} />
      <Npcs area="CHURCH" />
    </group>
  );
}
