// Tavern interior (the village "TAVERN" area, the Golden Tankard): plank floor, timber walls with posts, a long bar with
// taps, bottles and mugs along the north wall, round tables with stools and candles, a crackling hearth in the east wall,
// casks in the corners. Static geometry is merged into ONE lit + ONE glow mesh; 2 point lights. Layout: tavernData.ts.
// The barkeep and the regulars are drawn by <Npcs area="TAVERN" />.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { TAP, BAR_Z, BAR_X0, BAR_X1, TAP_TABLES, HEARTH } from '../engine/tavernData';
import { GB, litMat } from './util';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const WOOD = '#6a4528', WOOD2 = '#8a5c34', WOOD3 = '#4a2f1c', PLASTER = '#d8c7a4', STONE = '#8f877a', BRASS = '#c9a24a';

function buildTavern() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const { hw, hd, h } = TAP, T = 1.0;
  // walls: plaster with timber frame
  b.box(T, h, hd * 2 + T, [-hw - T / 2, h / 2, -T / 2], PLASTER); b.box(T, h, hd * 2 + T, [hw + T / 2, h / 2, -T / 2], PLASTER);
  b.box(hw * 2, h, T, [0, h / 2, -hd - T / 2], PLASTER); for (const sx of [-1, 1]) b.box(hw + T - 1.6, 1.0, T, [sx * (1.6 + (hw + T - 1.6) / 2), 0.5, hd + T / 2], WOOD3);   // (south wall cut away to a rail: the camera looks in from the south)
  // the exit door: a timber frame in the rail gap with both leaves swung open inward, a lantern over it, a mat before it
  const dz = hd + T / 2, a = 1.2, lw = 1.45;
  for (const sx of [-1, 1]) {
    b.box(0.36, 3.6, 0.5, [sx * 1.68, 1.8, dz], WOOD3);
    b.box(lw, 3.1, 0.12, [sx * (1.5 - (lw / 2) * Math.cos(a)), 1.58, dz - (lw / 2) * Math.sin(a)], WOOD2, [0, sx < 0 ? a : -a, 0]);
    for (const y of [0.7, 2.5]) b.box(lw * 0.9, 0.12, 0.16, [sx * (1.5 - (lw / 2) * Math.cos(a)), y, dz - (lw / 2) * Math.sin(a)], '#3a3a3a', [0, sx < 0 ? a : -a, 0]);
  }
  b.box(3.8, 0.4, 0.55, [0, 3.6, dz], WOOD3);
  b.box(2.4, 0.03, 1.4, [0, 0.02, hd - 0.9], '#7a3a2a');
  b.box(0.22, 0.32, 0.22, [0, 4.0, dz + 0.1], WOOD3); g.box(0.16, 0.24, 0.16, [0, 4.0, dz + 0.1], '#ffcf5a');
  for (const sx of [-1, 1]) for (let z = -hd; z <= hd; z += 3.5) b.box(0.35, h, 0.35, [sx * (hw - 0.15), h / 2, z], WOOD3);
  for (let x = -hw; x <= hw; x += 3) b.box(0.35, h, 0.35, [x, h / 2, -hd + 0.15], WOOD3);
  for (const sx of [-1, 1]) b.box(0.3, 0.35, hd * 2, [sx * (hw - 0.15), 1.1, 0], WOOD3);
  // the bar: counter, top, taps, shelves of bottles behind
  const bl = BAR_X1 - BAR_X0 + 1.2, bx = (BAR_X0 + BAR_X1) / 2;
  b.box(bl, 1.1, 1.0, [bx, 0.55, BAR_Z], WOOD); b.box(bl + 0.2, 0.12, 1.2, [bx, 1.16, BAR_Z], WOOD2);
  for (let i = 0; i < 3; i++) { const x = BAR_X0 + 1 + i * 1.2; b.cyl(0.05, 0.05, 0.5, 6, [x, 1.45, BAR_Z - 0.2], BRASS); b.box(0.16, 0.08, 0.2, [x, 1.66, BAR_Z - 0.12], BRASS); }
  for (let i = 0; i < 5; i++) { const x = BAR_X0 + 0.6 + i * 1.6; b.cyl(0.13, 0.11, 0.26, 8, [x, 1.35, BAR_Z + 0.25], '#d9c79a'); b.box(0.06, 0.12, 0.04, [x + 0.15, 1.35, BAR_Z + 0.25], '#d9c79a'); }   // mugs
  for (const y of [1.8, 2.7]) {
    b.box(bl, 0.1, 0.5, [bx, y, -hd + 0.4], WOOD2);
    for (let i = 0; i < 10; i++) { const x = BAR_X0 - 0.2 + i * (bl / 10); const col = ['#3a7a3a', '#7a2a2a', '#c9a24a', '#2a4a7a'][(i + (y > 2 ? 1 : 0)) % 4]; b.cyl(0.09, 0.1, 0.42, 6, [x, y + 0.26, -hd + 0.4], col); b.cyl(0.03, 0.03, 0.14, 5, [x, y + 0.53, -hd + 0.4], col); }
  }
  // tables + stools + candles
  for (const [x, z] of TAP_TABLES) {
    b.cyl(0.9, 0.9, 0.12, 12, [x, 0.95, z], WOOD2); b.cyl(0.14, 0.2, 0.9, 8, [x, 0.45, z], WOOD3);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + x; b.cyl(0.32, 0.3, 0.1, 8, [x + Math.cos(a) * 1.35, 0.55, z + Math.sin(a) * 1.35], WOOD2); b.cyl(0.07, 0.07, 0.5, 5, [x + Math.cos(a) * 1.35, 0.27, z + Math.sin(a) * 1.35], WOOD3); }
    b.cyl(0.06, 0.06, 0.18, 6, [x, 1.1, z], '#f2e8d0'); g.sph(0.07, [x, 1.25, z], '#ffd070', [1, 1.6, 1], 5);
    b.cyl(0.11, 0.1, 0.22, 7, [x + 0.4, 1.12, z - 0.2], '#d9c79a');
  }
  // hearth in the east wall
  b.box(1.4, 3.2, 2.6, [HEARTH.x, 1.6, HEARTH.z], STONE); b.box(1.6, 0.3, 3.0, [HEARTH.x - 0.1, 3.3, HEARTH.z], STONE);
  b.box(0.6, 1.2, 1.6, [HEARTH.x - 0.5, 0.6, HEARTH.z], '#1a120c');
  g.cone(0.35, 0.8, 6, [HEARTH.x - 0.5, 0.5, HEARTH.z - 0.3], '#ff8a2a'); g.cone(0.28, 0.65, 6, [HEARTH.x - 0.5, 0.45, HEARTH.z + 0.35], '#ffb84a'); g.cone(0.2, 0.5, 6, [HEARTH.x - 0.6, 0.4, HEARTH.z], '#ffe08a');
  // casks
  for (const [x, z, r] of [[-8, -6, 0.75], [-8, -4.6, 0.75], [7.6, -6, 0.75], [7.6, 6, 0.65]] as [number, number, number][]) { b.cyl(r, r, 1.4, 10, [x, 0.7, z], WOOD2); b.torus(r + 0.02, 0.05, [x, 0.35, z], '#3a3a3e', [Math.PI / 2, 0, 0], 1, 12); b.torus(r + 0.02, 0.05, [x, 1.05, z], '#3a3a3e', [Math.PI / 2, 0, 0], 1, 12); }
  // door (inside face), a sign over the bar, wall lanterns
  b.box(3.4, 0.9, 0.12, [bx, 3.9, -hd + 0.1], WOOD2); g.box(2.6, 0.4, 0.05, [bx, 3.9, -hd + 0.18], '#ffcf5a');
  for (const sx of [-1, 1]) for (const z of [-3.5, 3.5]) { b.box(0.1, 0.45, 0.1, [sx * (hw - 0.25), 2.8, z], '#2a2a2e'); g.sph(0.15, [sx * (hw - 0.3), 3.15, z], '#ffb860', [1, 1.4, 1], 6); }
  return { body: b.build(), glow: g.build() };
}

export function TavernInterior({ q }: { q: QualityCfg }) {
  const geo = useMemo(buildTavern, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    floor: new MeshStandardMaterial({ color: new Color('#8a6440'), roughness: 0.95 }),
    outer: new MeshStandardMaterial({ color: new Color('#140f0b'), roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.35, 1.05) }),
  }), []);
  useEffect(() => () => { geo.body.dispose(); geo.glow.dispose(); mats.lit.dispose(); mats.floor.dispose(); mats.outer.dispose(); mats.glow.dispose(); }, [geo, mats]);
  const fire = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (fire.current) fire.current.intensity = 34 + Math.sin(clock.elapsedTime * 9.1) * 5 + Math.sin(clock.elapsedTime * 3.7) * 3; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow={sh}><planeGeometry args={[TAP.hw * 2, TAP.hd * 2]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} material={mats.outer}><planeGeometry args={[400, 400]} /></mesh>
      <mesh geometry={geo.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.glow} material={mats.glow} />
      <pointLight ref={fire} position={[HEARTH.x - 1.2, 1.4, HEARTH.z]} color="#ff9a4a" distance={18} decay={2} intensity={34} />
      <pointLight position={[-1, 3.6, 0]} color="#ffd9a0" distance={24} decay={2} intensity={26} />
      <Npcs area="TAVERN" />
    </group>
  );
}
