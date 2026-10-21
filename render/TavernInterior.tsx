// Tavern interior (the village "TAVERN" area, the Golden Tankard), built from Blender kit v3 (render/kitV3.tsx): honey plank floor, timber
// walls with curtained windows and a painting, a long bar with a tap barrel, shelves and mugs along the north wall, round tables with
// stools, a roaring fireplace in the east wall, crates, barrels, plants and a notice board. The south wall is cut low (the camera looks in
// from the south) around a timber door frame. Static pieces merge into ONE lit + ONE glow + ONE beam mesh. Layout: tavernData.ts.
// The barkeep and the regulars are drawn by <Npcs area="TAVERN" />.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, PointLight } from 'three';
import { TAP, BAR_Z, BAR_X0, BAR_X1, TAP_TABLES, HEARTH, TAP_BARRELS, TAP_PLANTS, TAP_CRATES, TAP_BOARD, tableStools } from '../engine/tavernData';
import { KitV3Static, type KitV3Item } from './kitV3';
import { floorGrid, wallRun, onWall } from './interiorKit';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const PI = Math.PI;

function tavernItems(): KitV3Item[] {
  const { hw, hd } = TAP, T = 0.4, SY = 1.5, it: KitV3Item[] = [];
  it.push(...floorGrid('floor_wood_planks', -hw - 0.5, hw + 0.5, -hd - 0.5, hd + 0.5, -0.07));
  // ---- walls (the south one is cut low around the door frame)
  it.push(...wallRun('N', -hw - T, hw + T, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: SY }));
  for (const side of ['W', 'E'] as const) it.push(...wallRun(side, -hd, hd, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: SY }));
  it.push(...wallRun('S', -hw - T, -1.7, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: 0.35 }), ...wallRun('S', 1.7, hw + T, hw, hd, { piece: 'wall_wood_house', off: 0.2, sy: 0.35 }));
  it.push({ piece: 'wood_supports', x: 0, z: hd + 0.15, rotY: PI, scale: [0.78, 1, 1] }, { piece: 'rug_round', x: 0, z: hd - 1.0, scale: 0.75 });
  // ---- windows, painting, board, light beams
  it.push(onWall('W', 'window_curtained', 2.8, hw, hd, { y: 1.1, inset: 0.0 }), onWall('E', 'window_curtained', 2.6, hw, hd, { y: 1.1, inset: 0.0 }), onWall('N', 'window_curtained', 6.6, hw, hd, { y: 1.5, inset: 0.0 }));
  it.push(onWall('W', 'light_shaft', 2.8, hw, hd, { inset: 0.1, scale: [0.9, 0.8, 1] }), onWall('E', 'light_shaft', 2.6, hw, hd, { inset: 0.1, scale: [0.9, 0.8, 1] }));
  it.push(onWall('W', 'painting_frame', -4.6, hw, hd, { y: 2.2, inset: 0.0, scale: 1.2 }));
  it.push(onWall('W', 'notice_board', TAP_BOARD.z, hw, hd, { inset: 0.45 }));
  // ---- the bar: two counters end to end, tap barrel + shelves behind, mugs on top
  const bl = BAR_X1 - BAR_X0, bs = bl / 2;
  for (let i = 0; i < 2; i++) it.push({ piece: 'bar_counter', x: BAR_X0 + bs * (i + 0.5), z: BAR_Z, scale: [bs / 3.9, 1, 1] });
  for (const x of [-4.4, -1.2, 1.6]) it.push({ piece: 'mug_cluster', x, y: 1.1, z: BAR_Z + 0.1, rotY: x });
  for (const x of [-3.9, -0.2]) it.push(onWall('N', 'tavern_shelf', x, hw, hd, { y: 1.35, inset: 0.0 }));
  it.push(onWall('N', 'tavern_shelf', 3.4, hw, hd, { y: 2.0, inset: 0.0, scale: 0.9 }));
  it.push({ piece: 'hanging_pot', x: -1.2, z: -hd + 0.6 });
  // ---- round tables with stools, rugs
  it.push({ piece: 'rug_round', x: 0, z: 1.5, scale: 1.7 });
  for (const [x, z] of TAP_TABLES) {
    it.push({ piece: 'round_table', x, z, scale: 1.25, rotY: x });
    tableStools(x, z).forEach(([sx, sz], i) => it.push({ piece: 'stool', x: sx, z: sz, rotY: i * 2.2 + x, scale: 1.1 }));
  }
  // ---- fireplace on the east wall (back against it, front toward the room), rug before it
  it.push({ piece: 'fireplace', x: hw + 0.15 - 0.65 * 0.9, z: HEARTH.z, rotY: -PI / 2, scale: 0.9 }, { piece: 'rug_round', x: 6.7, z: HEARTH.z, scale: 1.0 });
  // ---- barrels, crates, plants
  for (const [x, z, r] of TAP_BARRELS) it.push({ piece: 'barrel_tap', x, z, rotY: r });
  it.push({ piece: 'crate_stack_big', x: TAP_CRATES.x + 0.3, z: TAP_CRATES.z, rotY: 0, scale: 0.9 }, { piece: 'fruit_crate', x: 3.5, z: -6.2, rotY: 0.3 });
  TAP_PLANTS.forEach(([x, z], i) => it.push({ piece: i ? 'potted_plant_b' : 'potted_plant', x, z, scale: 1.3, rotY: i }));
  return it;
}

export function TavernInterior({ q }: { q: QualityCfg }) {
  const items = useMemo(tavernItems, []);
  const outer = useMemo(() => new MeshStandardMaterial({ color: new Color('#140f0b'), roughness: 1 }), []);
  const fire = useRef<PointLight>(null!);
  useFrame(({ clock }) => { if (fire.current) fire.current.intensity = 44 + Math.sin(clock.elapsedTime * 9.1) * 5 + Math.sin(clock.elapsedTime * 3.7) * 3; });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} material={outer}><planeGeometry args={[400, 400]} /></mesh>
      <KitV3Static items={items} cast={sh} receive={sh} />
      <pointLight ref={fire} position={[HEARTH.x - 1.2, 1.4, HEARTH.z]} color="#ff9a4a" distance={18} decay={2} intensity={44} />
      <pointLight position={[-1, 3.6, 0]} color="#ffd9a0" distance={24} decay={2} intensity={38} />
      <Npcs area="TAVERN" />
    </group>
  );
}
