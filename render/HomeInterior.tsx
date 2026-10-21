// (owner) The adventurer's house (the village "HOME" area), built from Blender kit v3 (render/kitV3.tsx): plank floor, timber walls with a
// curtained window and a painting, the patchwork bed against the north wall, wardrobe, bookshelf, desk, a round table with two stools,
// a crackling hearth, a round rug, a barrel and plants. The south wall is cut low (the camera looks in from the south) around a timber
// door frame. Static pieces merge into ONE lit + ONE glow + ONE beam mesh. Layout: homeData.ts.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, PointLight } from 'three';
import { HOME_ROOM, BED, HOME_HEARTH, HOME_TABLE, HOME_WARDROBE, HOME_SHELF, HOME_DESK, HOME_BARREL, HOME_PLANTS } from '../engine/homeData';
import { KitV3Static, type KitV3Item } from './kitV3';
import { floorGrid, wallRun, onWall } from './interiorKit';
import { QualityCfg } from './quality';

const PI = Math.PI;

function homeItems(): KitV3Item[] {
  const { hw, hd } = HOME_ROOM, T = 0.4, SY = 1.4, it: KitV3Item[] = [];
  it.push(...floorGrid('floor_wood_planks', -hw - 0.5, hw + 0.5, -hd - 0.5, hd + 0.5, -0.07));
  it.push(...wallRun('N', -hw - T, hw + T, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: SY }));
  for (const side of ['W', 'E'] as const) it.push(...wallRun(side, -hd, hd, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: SY }));
  it.push(...wallRun('S', -hw - T, -1.4, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: 0.35 }), ...wallRun('S', 1.4, hw + T, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: 0.35 }));
  it.push({ piece: 'wood_supports', x: 0, z: hd + 0.15, rotY: PI, scale: [0.65, 0.95, 1] }, { piece: 'rug_round', x: 0, z: hd - 0.9, scale: 0.6 });
  // window above the table end of the north wall + its beam, painting over the desk
  it.push(onWall('N', 'window_curtained', 3.7, hw, hd, { y: 1.1, inset: 0.0 }), onWall('N', 'light_shaft', 3.7, hw, hd, { inset: 0.1, scale: [0.9, 0.8, 1] }));
  it.push(onWall('W', 'painting_frame', HOME_DESK.z, hw, hd, { y: 2.2, inset: 0.0, scale: 1.1 }));
  // bed (head against the north wall), wardrobe, bookshelf
  it.push({ piece: 'bed_cosy', x: BED.x, z: -hd + 1.57 + 0.12 });
  it.push({ piece: 'wardrobe', x: HOME_WARDROBE.x, z: -hd + 0.57 + 0.1 });
  it.push({ piece: 'bookshelf', x: HOME_SHELF.x, z: -hd + 0.3 });
  // hearth on the east wall (back against it), a rug before it
  it.push({ piece: 'hearth', x: hw + 0.15 - 0.65 * 0.9, z: HOME_HEARTH.z, rotY: -PI / 2, scale: 0.9 });
  it.push({ piece: 'rug_round', x: -0.2, z: 1.0, scale: 1.25 });
  // table with two stools, desk with a stool, barrel, plants
  it.push({ piece: 'round_table', x: HOME_TABLE.x, z: HOME_TABLE.z, rotY: 0.4 });
  for (const dx of [-1.2, 1.2]) it.push({ piece: 'stool', x: HOME_TABLE.x + dx, z: HOME_TABLE.z, rotY: dx });
  it.push({ piece: 'desk', x: HOME_DESK.x, z: HOME_DESK.z, rotY: PI / 2 }, { piece: 'stool', x: HOME_DESK.x + 1.0, z: HOME_DESK.z + 0.1, rotY: 1 });
  it.push({ piece: 'barrel_tap', x: HOME_BARREL.x, z: HOME_BARREL.z, rotY: -PI / 2 });
  HOME_PLANTS.forEach(([x, z], i) => it.push({ piece: i ? 'potted_plant_b' : 'potted_plant', x, z, scale: 1.2, rotY: i }));
  return it;
}

export function HomeInterior({ q }: { q: QualityCfg }) {
  const items = useMemo(homeItems, []);
  const outer = useMemo(() => new MeshStandardMaterial({ color: new Color('#140f0b'), roughness: 1 }), []);
  const fire = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (fire.current) fire.current.intensity = 32 + Math.sin(clock.elapsedTime * 9.1) * 4 + Math.sin(clock.elapsedTime * 3.7) * 2; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} material={outer}><planeGeometry args={[400, 400]} /></mesh>
      <KitV3Static items={items} cast={sh} receive={sh} />
      <pointLight ref={fire} position={[HOME_HEARTH.x - 1, 1.3, HOME_HEARTH.z]} color="#ff9a4a" distance={12} decay={2} intensity={32} />
      <pointLight position={[0, 3.4, 0.5]} color="#ffe2b0" distance={16} decay={2} intensity={28} />
    </group>
  );
}
