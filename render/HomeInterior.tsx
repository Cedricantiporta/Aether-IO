// (owner) The adventurer's house (the village "HOME" area): plank floor, plaster walls with timber posts (the south wall cut
// to a rail so the camera sees in), a bed with a quilt against the north wall, a crackling hearth, a table with a candle,
// a chest, a wardrobe and a rug. Static geometry merged into one lit + one glow mesh; 2 point lights. Layout: homeData.ts.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { HOME_ROOM, BED, HOME_HEARTH, HOME_TABLE } from '../engine/homeData';
import { GB, litMat } from './util';
import { QualityCfg } from './quality';

const WOOD = '#6a4528', WOOD2 = '#8a5c34', WOOD3 = '#4a2f1c', PLASTER = '#e2d3b2', STONE = '#8f877a';

function buildHome() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const { hw, hd, h } = HOME_ROOM, T = 0.8;
  b.box(T, h, hd * 2 + T, [-hw - T / 2, h / 2, -T / 2], PLASTER); b.box(T, h, hd * 2 + T, [hw + T / 2, h / 2, -T / 2], PLASTER);
  b.box(hw * 2, h, T, [0, h / 2, -hd - T / 2], PLASTER);
  for (const sx of [-1, 1]) b.box(hw + T - 1.4, 0.9, T, [sx * (1.4 + (hw + T - 1.4) / 2), 0.45, hd + T / 2], WOOD3);   // south rail (door gap in the middle)
  for (const sx of [-1, 1]) b.box(0.3, 3.2, 0.4, [sx * 1.4, 1.6, hd + T / 2], WOOD3);
  b.box(3.1, 0.35, 0.45, [0, 3.2, hd + T / 2], WOOD3);
  for (const sx of [-1, 1]) for (let z = -hd; z <= hd; z += 2.8) b.box(0.28, h, 0.28, [sx * (hw - 0.12), h / 2, z], WOOD3);
  for (let x = -hw; x <= hw; x += 2.6) b.box(0.28, h, 0.28, [x, h / 2, -hd + 0.12], WOOD3);
  b.box(hw * 2, 0.25, 0.3, [0, h - 0.4, -hd + 0.15], WOOD3);
  // window in the north wall (warm daylight)
  b.box(1.6, 1.3, 0.12, [1.4, 2.5, -hd + 0.06], WOOD3); g.box(1.3, 1.0, 0.05, [1.4, 2.5, -hd + 0.14], '#ffe9b0');
  // the bed: frame, mattress, quilt, pillow, headboard
  b.box(1.9, 0.45, 3.0, [BED.x, 0.3, BED.z], WOOD2); b.box(1.8, 0.25, 2.9, [BED.x, 0.62, BED.z], '#efe6d2');
  b.box(1.84, 0.12, 1.9, [BED.x, 0.78, BED.z + 0.5], '#8a2f22'); b.box(1.84, 0.1, 0.3, [BED.x, 0.8, BED.z - 0.42], '#c9a24a');
  b.box(1.2, 0.22, 0.6, [BED.x, 0.85, BED.z - 1.05], '#f6f1e6'); b.box(2.0, 1.4, 0.18, [BED.x, 0.9, BED.z - 1.55], WOOD3);
  // hearth (east wall) with a fire
  b.box(1.2, 3.0, 2.2, [HOME_HEARTH.x + 0.4, 1.5, HOME_HEARTH.z], STONE); b.box(1.4, 0.25, 2.5, [HOME_HEARTH.x + 0.3, 3.05, HOME_HEARTH.z], STONE);
  b.box(0.5, 1.0, 1.3, [HOME_HEARTH.x, 0.5, HOME_HEARTH.z], '#1a120c');
  g.cone(0.3, 0.7, 6, [HOME_HEARTH.x, 0.45, HOME_HEARTH.z - 0.2], '#ff8a2a'); g.cone(0.22, 0.55, 6, [HOME_HEARTH.x, 0.4, HOME_HEARTH.z + 0.25], '#ffc04a');
  // table, two stools, candle, bread
  b.box(1.6, 0.1, 1.0, [HOME_TABLE.x, 0.9, HOME_TABLE.z], WOOD2); for (const [dx, dz] of [[-0.65, -0.4], [0.65, -0.4], [-0.65, 0.4], [0.65, 0.4]]) b.box(0.1, 0.9, 0.1, [HOME_TABLE.x + dx, 0.45, HOME_TABLE.z + dz], WOOD3);
  for (const dx of [-1.2, 1.2]) { b.cyl(0.28, 0.26, 0.08, 8, [HOME_TABLE.x + dx, 0.55, HOME_TABLE.z], WOOD2); b.cyl(0.06, 0.06, 0.5, 5, [HOME_TABLE.x + dx, 0.27, HOME_TABLE.z], WOOD3); }
  b.cyl(0.06, 0.06, 0.16, 6, [HOME_TABLE.x, 1.03, HOME_TABLE.z], '#f2e8d0'); g.sph(0.07, [HOME_TABLE.x, 1.18, HOME_TABLE.z], '#ffd070', [1, 1.6, 1], 5);
  b.sph(0.18, [HOME_TABLE.x + 0.45, 1.0, HOME_TABLE.z - 0.15], '#c98a3a', [1.4, 0.7, 1], 6);
  // chest, barrel, wardrobe, rug, a sword on the wall
  b.box(1.1, 0.6, 0.7, [-4.3, 0.3, 2.4], WOOD); b.box(1.12, 0.12, 0.72, [-4.3, 0.62, 2.4], '#c9a24a');
  b.cyl(0.55, 0.55, 1.1, 10, [3.9, 0.55, 2.6], WOOD2);
  b.box(1.4, 2.6, 0.7, [0.6 - 2.4, 1.3, -3.7], WOOD); b.box(0.06, 2.2, 0.05, [0.6 - 2.4, 1.3, -3.33], WOOD3);
  b.box(2.6, 0.03, 1.8, [-0.2, 0.02, 1.2], '#7a3a2a'); b.box(2.2, 0.035, 1.4, [-0.2, 0.025, 1.2], '#a0583a');
  b.box(0.12, 1.4, 0.06, [-hw + 0.1, 2.4, 0.6], '#c8ccd4'); b.box(0.5, 0.1, 0.1, [-hw + 0.1, 1.8, 0.6], '#c9a24a');
  return { body: b.build(), glow: g.build() };
}

export function HomeInterior({ q }: { q: QualityCfg }) {
  const geo = useMemo(buildHome, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    floor: new MeshStandardMaterial({ color: new Color('#8a6440'), roughness: 0.95 }),
    outer: new MeshStandardMaterial({ color: new Color('#140f0b'), roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.35, 1.05) }),
  }), []);
  useEffect(() => () => { geo.body.dispose(); geo.glow.dispose(); mats.lit.dispose(); mats.floor.dispose(); mats.outer.dispose(); mats.glow.dispose(); }, [geo, mats]);
  const fire = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (fire.current) fire.current.intensity = 22 + Math.sin(clock.elapsedTime * 9.1) * 4 + Math.sin(clock.elapsedTime * 3.7) * 2; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow={sh}><planeGeometry args={[HOME_ROOM.hw * 2, HOME_ROOM.hd * 2]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} material={mats.outer}><planeGeometry args={[400, 400]} /></mesh>
      <mesh geometry={geo.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.glow} material={mats.glow} />
      <pointLight ref={fire} position={[HOME_HEARTH.x - 1, 1.3, HOME_HEARTH.z]} color="#ff9a4a" distance={12} decay={2} intensity={22} />
      <pointLight position={[0, 3.4, 0.5]} color="#ffe2b0" distance={16} decay={2} intensity={18} />
    </group>
  );
}
