// Castle throne hall (the village "CASTLE" area), built from Blender kit v3 (render/kitV3.tsx): cream flagstone tiles, stone walls with
// arched windows and red banners, pillars, a long red carpet to the stepped dais with the golden throne, round banquet tables with
// stools, candle stands, armour, bookshelves, plants and soft light beams through the windows. The south wall is cut low (the camera
// looks in from the south) with a gate arch. Every static piece is merged into ONE lit mesh + ONE glow mesh + ONE beam mesh. Layout and
// colliders: engine/castleData.ts. The court NPCs (King, guards, steward, noble) are drawn by <Npcs area="CASTLE" />.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, PointLight } from 'three';
import { HALL, DAIS, PILLARS, TABLES, TABLE_STOOLS, BRAZIERS, BANNER_Z, THRONE_Z, ARMORS, HALL_PLANTS, HALL_SHELVES, DAIS_CANDLES } from '../engine/castleData';
import { KitV3Static, type KitV3Item } from './kitV3';
import { floorGrid, wallRun, onWall } from './interiorKit';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const PI = Math.PI;

function castleItems(): KitV3Item[] {
  const { hw, hd } = HALL, T = 0.96, it: KitV3Item[] = [];
  it.push(...floorGrid('floor_tile_castle', -hw - 0.5, hw + 0.5, -hd - 0.5, hd + 0.5, -0.04));
  // ---- walls: windows + banners down the sides, windows beside the throne, a low front wall with the gate arch
  const win = new Set([0, 2, 4, 5, 7, 9]);
  for (const side of ['W', 'E'] as const) {
    it.push(...wallRun(side, -hd, hd, hw, hd, { piece: (i) => (win.has(i) ? 'wall_castle_window' : 'wall_castle_plain'), off: 0.48 }));
    for (const z of BANNER_Z) it.push(onWall(side, 'banner_wall_red', z, hw, hd, { y: 2.0 }));
    for (const z of [-10, -2, 2, 10]) it.push(onWall(side, 'light_shaft', z, hw, hd, { inset: 0.15 }));
  }
  it.push(...wallRun('N', -hw - T, hw + T, hw, hd, { piece: (i) => (i === 1 || i === 5 ? 'wall_castle_window' : 'wall_castle_plain'), off: 0.48 }));
  it.push(onWall('N', 'banner_wall_red', -4.3, hw, hd, { y: 2.0 }), onWall('N', 'banner_wall_red', 4.3, hw, hd, { y: 2.0 }));
  it.push(onWall('N', 'light_shaft', -8.5, hw, hd, { inset: 0.15 }), onWall('N', 'light_shaft', 8.5, hw, hd, { inset: 0.15 }));
  it.push(...wallRun('S', -hw - T, hw + T, hw, hd, { piece: (i, c) => (Math.abs(c) < 1 ? null : 'wall_castle_plain'), off: 0.48, sy: 0.3 }));
  it.push({ piece: 'doorway_arch', x: 0, z: hd + 0.46, rotY: PI, scale: [1.0, 0.62, 1] });
  // ---- pillars down the nave
  for (const [x, z] of PILLARS) it.push({ piece: 'pillar_castle', x, z, scale: [1, 0.92, 1] });
  // ---- red carpet from the gate to the dais, the stepped dais and the throne
  for (let z = 17; z > DAIS.z1 - 3; z -= 4) it.push({ piece: 'carpet_runner', x: 0, z, scale: [3.4, 1, 1] });
  it.push({ piece: 'throne_dais_steps', x: 0, z: (DAIS.z0 + DAIS.z1) / 2, scale: [2, DAIS.h / 0.875, (DAIS.z1 - DAIS.z0) / 5] });
  it.push({ piece: 'throne', x: 0, y: DAIS.h, z: THRONE_Z + 0.1, scale: 1.25 });
  for (const [x, z] of DAIS_CANDLES) it.push({ piece: 'candle_stand', x, y: DAIS.h, z, scale: 1.1 });
  // ---- banquet tables with stools, rugs underneath
  for (const [x, z] of TABLES) { it.push({ piece: 'rug_round', x, z, scale: 1.55 }); it.push({ piece: 'round_table', x, z, scale: 1.5, rotY: x + z }); }
  TABLE_STOOLS.forEach(([x, z], i) => it.push({ piece: 'stool', x, z, rotY: i * 1.9, scale: 1.15 }));
  // ---- candle stands, armour, plants, shelves, weapon + shield racks
  for (const [x, z] of BRAZIERS) it.push({ piece: 'candle_stand', x, z, scale: 1.35 });
  ARMORS.forEach(([x, z], i) => it.push({ piece: 'armor_stand', x, z, rotY: x < 0 ? 0.35 : -0.35, scale: 1.1 }));
  HALL_PLANTS.forEach(([x, z], i) => it.push({ piece: 'potted_plant', x, z, scale: 1.2, rotY: i }));
  for (const [x, z] of HALL_SHELVES) it.push({ piece: 'bookshelf', x, z: z + 0.3, rotY: 0, scale: [1, 1.2, 1.1] }, { piece: 'painting_frame', x: x < 0 ? x + 1.7 : x - 1.7, y: 2.5, z: -hd + 0.05, scale: 1.3 });
  for (const side of ['W', 'E'] as const) {
    for (const z of [-8.6, 10.1]) it.push(onWall(side, 'weapon_rack', z, hw, hd, { inset: 0.4, scale: 1.1 }));
    for (const z of [-16.2, 15.6]) it.push(onWall(side, 'shield_rack', z, hw, hd, { inset: 0.4, scale: 1.1 }));
  }
  return it;
}

export function CastleInterior({ q }: { q: QualityCfg }) {
  const items = useMemo(castleItems, []);
  const outer = useMemo(() => new MeshStandardMaterial({ color: new Color('#1a1613'), roughness: 1 }), []);
  const l1 = useRef<PointLight>(null!), l2 = useRef<PointLight>(null!), l3 = useRef<PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (l1.current) l1.current.intensity = 42 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.1) * 2;
    if (l2.current) l2.current.intensity = 42 + Math.sin(t * 6.1 + 1) * 4 + Math.sin(t * 11.7) * 2;
    if (l3.current) l3.current.intensity = 34 + Math.sin(t * 5.3 + 2) * 3;
  });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} material={outer}><planeGeometry args={[400, 400]} /></mesh>
      <KitV3Static items={items} cast={sh} receive={sh} />
      <pointLight ref={l1} position={[-4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={42} />
      <pointLight ref={l2} position={[4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={42} />
      <pointLight ref={l3} position={[0, 3.2, 12]} color="#ffc080" distance={22} decay={2} intensity={34} />
      <Npcs area="CASTLE" />
    </group>
  );
}
