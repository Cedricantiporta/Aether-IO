// Castle (the village "CASTLE" area): the throne hall in the middle + a west wing (Dining Hall, Kitchen, Library) and an east wing (King's
// Bedroom, Study, Treasury), all from Blender kit v3 (render/kitV3.tsx) plus the hand-built props of render/castleProps.ts (long table,
// chairs, food, chests, gold...). Layout, doorways and colliders: engine/castleData.ts. The hall: cream flagstone tiles, stone walls with
// arched windows and red banners, pillars, a long red carpet to the stepped dais with the golden throne, round banquet tables with
// stools, candle stands, armour, bookshelves, plants and soft light beams through the windows. The south wall is cut low (the camera
// looks in from the south) with a gate arch. Every static piece is merged into ONE lit mesh + ONE glow mesh + ONE beam mesh. Layout and
// colliders: engine/castleData.ts. The court NPCs (King, guards, steward, noble) are drawn by <Npcs area="CASTLE" />.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, PointLight } from 'three';
import {
  HALL, DAIS, PILLARS, TABLES, TABLE_STOOLS, BRAZIERS, BANNER_Z, THRONE_Z, ARMORS, HALL_PLANTS, HALL_SHELVES, DAIS_CANDLES, RACK_Z, CASTLE_EXT, CASTLE_ROOMS, WALLS, DOORS, WALL_X, LOW_WALL_SY,
  DINING_FIRE, DINING_STANDS, DINING_PLANTS, KITCHEN_FIRE, KITCHEN_CAULDRON, KITCHEN_CRATES, KITCHEN_BARRELS, KITCHEN_SHELVES, LIB_SHELF_Z, LIBRARY_STANDS, LIBRARY_PLANTS,
  BEDROOM_BED, BEDROOM_STANDS, BEDROOM_WARDROBES, BEDROOM_FIRE, BEDROOM_PLANTS, STUDY_STANDS, STUDY_PLANTS, TREASURY_ARMORS, TREASURY_STANDS,
  type WallSeg,
} from '../engine/castleData';
import { buildWingProps } from './castleProps';
import { KitV3Static, kitV3Lit, kitV3Glow, type KitV3Item } from './kitV3';
import { floorGrid, wallRun, onWall } from './interiorKit';
import { Npcs } from './Npcs';
import { flagTexture, FLAG_TILE } from './TownScenery';
import { QualityCfg } from './quality';

const PI = Math.PI;

/** A wall run as two thin pieces back to back (each 0.48 thick, facing opposite ways), so both rooms see a finished face. The hall face of the
 *  hall's side walls gets the two windows. */
function segPieces(w: WallSeg): KitV3Item[] {
  const out: KitV3Item[] = [], len = w.b - w.a, n = Math.max(1, Math.round(len / 4)), sp = len / n, sy = w.low ? LOW_WALL_SY : 1;
  const hallWall = !w.alongX && Math.abs(Math.abs(w.line) - WALL_X) < 0.01;
  for (let i = 0; i < n; i++) {
    const c = w.a + sp * (i + 0.5), scale: [number, number, number] = [sp / 4, sy, 0.5];
    if (w.alongX) out.push({ piece: 'wall_castle_plain', x: c, z: w.line + 0.24, rotY: 0, scale }, { piece: 'wall_castle_plain', x: c, z: w.line - 0.24, rotY: PI, scale });
    else {
      const toRight = w.line < 0;   // the hall is on +x of the west wall, on -x of the east wall
      const hallFace = hallWall && n >= 3 && (i === 1 || i === 2) ? 'wall_castle_window' : 'wall_castle_plain';
      out.push({ piece: toRight ? hallFace : 'wall_castle_plain', x: w.line + 0.24, z: c, rotY: PI / 2, scale }, { piece: toRight ? 'wall_castle_plain' : hallFace, x: w.line - 0.24, z: c, rotY: -PI / 2, scale });
    }
  }
  return out;
}

function castleItems(): KitV3Item[] {
  const { hw, hd } = HALL, T = 0.96, it: KitV3Item[] = [];
  it.push(...floorGrid('floor_tile_castle', -WALL_X, WALL_X, -hd - 0.5, hd + 0.5, -0.04));
  for (const r of CASTLE_ROOMS) {   // wing floors: up to the partition centre lines, 0.5 m under the outer walls
    if (r.id === 'hall') continue;
    const x0 = r.x0 <= -CASTLE_EXT.hw ? r.x0 - 0.5 : r.x0, x1 = r.x1 >= CASTLE_EXT.hw ? r.x1 + 0.5 : r.x1, z0 = r.z0 <= -hd ? r.z0 - 0.5 : r.z0, z1 = r.z1 >= hd ? r.z1 + 0.5 : r.z1;
    it.push(...floorGrid(r.floor === 'wood' ? 'floor_wood_planks' : 'floor_tile_castle', x0, x1, z0, z1, r.floor === 'wood' ? -0.07 : -0.04, r.tint));
  }
  // ---- walls
  // ---- outer north / south / west / east walls span the whole castle (hall + wings); the south one stays low (camera side)
  const { hw: ew } = CASTLE_EXT, E = ew + T;
  const nWin = (c: number): boolean => { const a = Math.round(Math.abs(c)); return a === 6 || a === 18 || a === 34 || (a === 26 && c < 0); };
  it.push(...wallRun('N', -E, E, ew, hd, { piece: (i, c) => (nWin(c) ? 'wall_castle_window' : 'wall_castle_plain'), off: 0.48 }));
  for (const c of [-4.3, 4.3, -30, -20, 20.5, 33.2]) it.push(onWall('N', 'banner_wall_red', c, ew, hd, { y: 2.0 }));
  for (const c of [-8.5, 8.5, -34, -26, -18, 18, 34]) it.push(onWall('N', 'light_shaft', c, ew, hd, { inset: 0.15 }));
  it.push(onWall('N', 'painting_frame', -25, ew, hd, { y: 2.6, inset: 0.05, scale: 1.5 }), onWall('N', 'painting_frame', BEDROOM_BED.x, ew, hd, { y: 3.4, inset: 0.05, scale: 1.7 }));
  it.push(...wallRun('S', -E, E, ew, hd, { piece: (i, c) => (Math.abs(c) < 1 ? null : 'wall_castle_plain'), off: 0.48, sy: LOW_WALL_SY }));
  it.push({ piece: 'doorway_arch', x: 0, z: hd + 0.46, rotY: PI, scale: [1.0, 0.62, 1] });
  const sWin = (c: number): boolean => c === -6 || c === 6 || c === 10 || c === 14;
  for (const side of ['W', 'E'] as const) {
    it.push(...wallRun(side, -hd, hd, ew, hd, { piece: (i, c) => (sWin(c) ? 'wall_castle_window' : 'wall_castle_plain'), off: 0.48 }));
    for (const c of [-6, 6, 10, 14]) it.push(onWall(side, 'light_shaft', c, ew, hd, { inset: 0.15 }));
  }
  // ---- inner walls (two-sided, 0.96 thick): the hall's side walls (windows on the hall face), the partitions of each wing, arches + lintels on every doorway
  for (const w of WALLS) it.push(...segPieces(w));
  for (const d of DOORS) {
    it.push({ piece: 'doorway_arch', x: d.x, z: d.z, rotY: d.alongX ? 0 : PI / 2, scale: [1.0, 0.62, 1] });
    if (!d.low) for (const k of [-1, 1]) it.push({ piece: 'wall_castle_plain', x: d.alongX ? d.x : d.x + k * 0.24, y: 3.1, z: d.alongX ? d.z + k * 0.24 : d.z, rotY: d.alongX ? (k > 0 ? 0 : PI) : (k > 0 ? PI / 2 : -PI / 2), scale: [1, 0.48, 0.5] });
  }
  for (const side of ['W', 'E'] as const) {
    for (const z of BANNER_Z) it.push(onWall(side, 'banner_wall_red', z, hw, hd, { y: 2.0 }));
    for (const z of [-2, 2]) it.push(onWall(side, 'light_shaft', z, hw, hd, { inset: 0.15 }));
  }
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
    for (const z of RACK_Z) it.push(onWall(side, 'weapon_rack', z, hw, hd, { inset: 0.4, scale: 1.1 }));
    for (const z of [-16.2, 15.6]) it.push(onWall(side, 'shield_rack', z, hw, hd, { inset: 0.4, scale: 1.1 }));
  }
  // ================================================================ WEST WING
  // ---- dining hall: a red runner under the long table, fireplace in the west wall, candle stands, plants
  for (const x of [-31, -27, -23, -19]) it.push({ piece: 'carpet_runner', x, z: -5, rotY: PI / 2, scale: [5.2, 1, 1] });
  it.push({ piece: 'fireplace', x: DINING_FIRE.x, z: DINING_FIRE.z, rotY: PI / 2, scale: 0.9 });
  DINING_STANDS.forEach(([x, z]) => it.push({ piece: 'candle_stand', x, z, scale: 1.3 }));
  DINING_PLANTS.forEach(([x, z], i) => it.push({ piece: 'potted_plant', x, z, scale: 1.2, rotY: i }));
  // ---- kitchen: hearth + cauldron, crates, barrels, shelves with mugs
  it.push({ piece: 'fireplace', x: KITCHEN_FIRE.x, z: KITCHEN_FIRE.z, rotY: PI / 2, scale: 0.9 }, { piece: 'cauldron', x: KITCHEN_CAULDRON.x, z: KITCHEN_CAULDRON.z, scale: 1.2 });
  KITCHEN_CRATES.forEach(([x, z], i) => it.push({ piece: 'fruit_crate', x, z, scale: 1.1, rotY: 1.57 + i * 0.3 }));
  KITCHEN_BARRELS.forEach(([x, z], i) => it.push({ piece: 'barrel_tap', x, z, rotY: i * 1.3 }));
  KITCHEN_SHELVES.forEach(([x, z]) => it.push({ piece: 'tavern_shelf', x, y: 1.5, z, rotY: -PI / 2, scale: 0.95 }, { piece: 'mug_cluster', x: x - 0.25, y: 2.5, z, rotY: z }));
  it.push({ piece: 'potted_plant_b', x: -33.8, z: 3.4, scale: 1.2 });
  // ---- library: shelves on both long walls (the doorway at z 11 stays open), plants, reading lamps
  for (const z of LIB_SHELF_Z) it.push({ piece: 'bookshelf', x: -24.27, z, rotY: PI / 2, scale: [1, 1.2, 1.1] }, { piece: 'bookshelf', x: -15.2, z, rotY: -PI / 2, scale: [1, 1.2, 1.1] });
  LIBRARY_STANDS.forEach(([x, z]) => it.push({ piece: 'candle_stand', x, z, scale: 1.2 }));
  LIBRARY_PLANTS.forEach(([x, z]) => it.push({ piece: 'potted_plant_b', x, z, scale: 1.2 }));
  // ================================================================ EAST WING
  // ---- king's bedroom: the big bed, wardrobes, fireplace, candle stands, plants
  it.push({ piece: 'bed_cosy', x: BEDROOM_BED.x, z: BEDROOM_BED.z, scale: BEDROOM_BED.s });
  BEDROOM_WARDROBES.forEach(([x, z]) => it.push({ piece: 'wardrobe', x: x + 0.27, z, rotY: -PI / 2, scale: 1.3 }));
  it.push({ piece: 'fireplace', x: BEDROOM_FIRE.x, z: BEDROOM_FIRE.z, rotY: -PI / 2, scale: 0.9 });
  BEDROOM_STANDS.forEach(([x, z]) => it.push({ piece: 'candle_stand', x, z, scale: 1.3 }));
  BEDROOM_PLANTS.forEach(([x, z], i) => it.push({ piece: 'potted_plant', x, z, scale: 1.2, rotY: i }));
  // ---- study: shelves along both long walls, candle stands, plants
  for (const z of LIB_SHELF_Z) it.push({ piece: 'bookshelf', x: 15.21, z, rotY: PI / 2, scale: [1, 1.2, 1.1] }, { piece: 'bookshelf', x: 24.27, z, rotY: -PI / 2, scale: [1, 1.2, 1.1] });
  STUDY_STANDS.forEach(([x, z]) => it.push({ piece: 'candle_stand', x, z, scale: 1.2 }));
  STUDY_PLANTS.forEach(([x, z]) => it.push({ piece: 'potted_plant_b', x, z, scale: 1.2 }));
  // ---- treasury: a red runner to the crown, armour, candle stands
  for (const x of [27.5, 31.5]) it.push({ piece: 'carpet_runner', x, z: 11, rotY: PI / 2, scale: [3.4, 1, 1] });
  TREASURY_ARMORS.forEach(([x, z]) => it.push({ piece: 'armor_stand', x, z, rotY: PI / 2, scale: 1.1 }));
  TREASURY_STANDS.forEach(([x, z]) => it.push({ piece: 'candle_stand', x, z, scale: 1.3 }));
  return it;
}

export function CastleInterior({ q }: { q: QualityCfg }) {
  const items = useMemo(castleItems, []);
  const flag = useMemo(() => { const m = new MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); const t = flagTexture().clone(); t.repeat.set((HALL.hw * 2 + 1) / FLAG_TILE, (HALL.hd * 2 + 1) / FLAG_TILE); t.needsUpdate = true; m.map = t; return m; }, []);   // (owner 2026-10-24: the town's pale puffy flagstones on the hall floor too)
  const outer = useMemo(() => new MeshStandardMaterial({ color: new Color('#1a1613'), roughness: 1 }), []);
  const props = useMemo(buildWingProps, []);
  useEffect(() => () => { props.body.dispose(); props.glow?.dispose(); }, [props]);
  const l1 = useRef<PointLight>(null!), l2 = useRef<PointLight>(null!), l3 = useRef<PointLight>(null!);
  const w1 = useRef<PointLight>(null!), w2 = useRef<PointLight>(null!), w3 = useRef<PointLight>(null!), w4 = useRef<PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (l1.current) l1.current.intensity = 42 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.1) * 2;
    if (l2.current) l2.current.intensity = 42 + Math.sin(t * 6.1 + 1) * 4 + Math.sin(t * 11.7) * 2;
    if (l3.current) l3.current.intensity = 34 + Math.sin(t * 5.3 + 2) * 3;
    if (w1.current) w1.current.intensity = 38 + Math.sin(t * 6.7 + 3) * 3.5 + Math.sin(t * 12.3) * 2;
    if (w2.current) w2.current.intensity = 38 + Math.sin(t * 5.9 + 4) * 3.5 + Math.sin(t * 10.9) * 2;
    if (w3.current) w3.current.intensity = 34 + Math.sin(t * 7.7 + 5) * 3;
    if (w4.current) w4.current.intensity = 34 + Math.sin(t * 6.3 + 6) * 3;
  });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} material={outer}><planeGeometry args={[400, 400]} /></mesh>
      <KitV3Static items={items} cast={sh} receive={sh} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} material={flag} receiveShadow={sh}><planeGeometry args={[HALL.hw * 2 + 1, HALL.hd * 2 + 1]} /></mesh>
      <pointLight ref={l1} position={[-4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={42} />
      <pointLight ref={l2} position={[4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={42} />
      <pointLight ref={l3} position={[0, 3.2, 12]} color="#ffc080" distance={22} decay={2} intensity={34} />
      <mesh geometry={props.body} material={kitV3Lit()} castShadow={sh} receiveShadow={sh} />
      {props.glow && <mesh geometry={props.glow} material={kitV3Glow()} />}
      <pointLight ref={w1} position={[-25, 3.6, -6]} color="#ffb070" distance={22} decay={2} intensity={38} />
      <pointLight ref={w2} position={[26, 3.6, -9]} color="#ffb59a" distance={22} decay={2} intensity={38} />
      <pointLight ref={w3} position={[-25, 3.4, 11]} color="#ffc27a" distance={20} decay={2} intensity={34} />
      <pointLight ref={w4} position={[25, 3.4, 11]} color="#ffd27a" distance={20} decay={2} intensity={34} />
      <Npcs area="CASTLE" />
    </group>
  );
}
