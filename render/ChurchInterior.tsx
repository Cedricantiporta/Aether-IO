// Chapel interior (the village "CHURCH" area), built from Blender kit v3 (render/kitV3.tsx): flagstone nave, stone walls with stained-glass
// windows, slim pillars, pews either side of a red aisle runner, the altar with candle stands under a big stained-glass window, a rug,
// plants and coloured light beams. The south wall is cut low (the camera looks in from the south) with a gate arch; the west wall has the
// side door to the graveyard. Static pieces merge into ONE lit + ONE glow + ONE beam mesh. Layout / colliders: churchData.ts.
// The priestess is drawn by <Npcs area="CHURCH" />.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, PointLight } from 'three';
import { NAVE, PEW_Z, PEW_X, NAVE_PILLARS, CHURCH_PLANTS, CHURCH_SIDE_EXIT } from '../engine/churchData';
import { KitV3Static, type KitV3Item } from './kitV3';
import { floorGrid, wallRun, onWall } from './interiorKit';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const PI = Math.PI;

function naveItems(): KitV3Item[] {
  const { hw, hd } = NAVE, T = 0.98, it: KitV3Item[] = [];
  it.push(...floorGrid('floor_tile_castle', -hw - 0.5, hw + 0.5, -hd - 0.5, hd + 0.5, -0.04, '#fff3df'));
  // ---- walls: chapel walls with stained glass on the sides (a gap for the graveyard door in the west one) and behind the altar
  const dz = CHURCH_SIDE_EXIT.z, dw = 2.06;
  it.push(...wallRun('W', -hd, dz - dw, hw, hd, { piece: 'wall_castle_plain', off: 0.48 }));
  it.push(...wallRun('W', dz + dw, hd, hw, hd, { piece: 'wall_stone_chapel', off: 0.5 }));
  it.push({ piece: 'doorway_arch', x: -hw - 0.46, z: dz, rotY: PI / 2, scale: [1, 0.68, 1] });
  it.push(...wallRun('E', -hd, hd, hw, hd, { piece: 'wall_stone_chapel', off: 0.5 }));
  it.push(...wallRun('N', -hw - T, hw + T, hw, hd, { piece: 'wall_stone_chapel', off: 0.5 }));
  it.push(onWall('N', 'stained_glass_window', 0, hw, hd, { inset: 0.05, y: 1.9, scale: 1.4 }));
  it.push(...wallRun('S', -hw - T, -dw, hw, hd, { piece: 'wall_castle_plain', off: 0.48, sy: 0.3 }), ...wallRun('S', dw, hw + T, hw, hd, { piece: 'wall_castle_plain', off: 0.48, sy: 0.3 }));
  it.push({ piece: 'doorway_arch', x: 0, z: hd + 0.46, rotY: PI, scale: [1, 0.55, 1] });
  // coloured beams through the side windows
  for (const z of [-6, -2, 2, 6]) it.push(onWall('E', 'light_shaft', z, hw, hd, { inset: 0.15 }));
  for (const z of [-3.2, 1.2, 5.5, 9.8]) it.push(onWall('W', 'light_shaft', z, hw, hd, { inset: 0.15 }));
  // ---- pillars, aisle runner, pews
  for (const [x, z] of NAVE_PILLARS) it.push({ piece: 'pillar_castle', x, z, scale: [0.55, 0.85, 0.55] });
  for (let z = 9; z >= -9; z -= 4) it.push({ piece: 'carpet_runner', x: 0, z, scale: [2, 1, 1] });
  for (const z of PEW_Z) for (const sx of [-1, 1]) it.push({ piece: 'pew', x: sx * PEW_X, z, rotY: PI, scale: [1.3, 1, 1] });
  // ---- the altar end: altar, candle stands, rug, plants
  it.push({ piece: 'rug_round', x: 0, z: -8.1, scale: 1.25 });
  it.push({ piece: 'altar', x: 0, z: -10.8, scale: 1.15 });
  for (const sx of [-1, 1]) it.push({ piece: 'candle_stand', x: sx * 2.7, z: -9.4, scale: 1.25 }, { piece: 'candle_stand', x: sx * 1.3, z: 9.2, scale: 1.0 });
  CHURCH_PLANTS.forEach(([x, z], i) => it.push({ piece: i % 2 ? 'potted_plant_b' : 'potted_plant_a', x, z, scale: 1.5, rotY: i }));
  return it;
}

export function ChurchInterior({ q }: { q: QualityCfg }) {
  const items = useMemo(naveItems, []);
  const outer = useMemo(() => new MeshStandardMaterial({ color: new Color('#1a1613'), roughness: 1 }), []);
  const l1 = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (l1.current) l1.current.intensity = 38 + Math.sin(clock.elapsedTime * 6.3) * 3; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} material={outer}><planeGeometry args={[400, 400]} /></mesh>
      <KitV3Static items={items} cast={sh} receive={sh} />
      <pointLight ref={l1} position={[0, 3, -9]} color="#ffc070" distance={22} decay={2} intensity={38} />
      <pointLight position={[0, 4, 6]} color="#ffe0b0" distance={24} decay={2} intensity={32} />
      <Npcs area="CHURCH" />
    </group>
  );
}
