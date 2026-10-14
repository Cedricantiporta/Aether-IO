// Castle throne hall (the village "CASTLE" area): flagstone floor, walls, pillars + ceiling beams, long red carpet to the
// raised dais with the throne, maroon banners, braziers / sconces (glow geometry, 3 real point lights), tables + benches.
// Everything static is merged into ONE lit mesh + ONE glow mesh. Layout / colliders: engine/castleData.ts. The court NPCs
// (King, guards, steward, noble) are drawn by <Npcs area="CASTLE" /> which this component mounts.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, PointLight, RepeatWrapping, SRGBColorSpace } from 'three';
import { HALL, DAIS, PILLARS, TABLES, BRAZIERS, BANNER_Z, THRONE_Z } from '../engine/castleData';
import { GB, litMat, mulberry32 } from './util';
import { Npcs } from './Npcs';
import { QualityCfg } from './quality';

const STONE = '#9d978b', STONE2 = '#847f75', STONE3 = '#b4aea0', WOOD = '#4a2f1a', WOOD2 = '#6a4526', IRON = '#2a2a2e';
const MAROON = '#5a1520', RED = '#8c1d28', GOLD = '#d9b04a';

function flagstones(): CanvasTexture {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6f6a62'; x.fillRect(0, 0, N, N);              // joints
  const rnd = mulberry32(31);
  const rows = 4, h = N / rows;
  for (let r = 0; r < rows; r++) {
    let px = -rnd() * 90;
    while (px < N) {
      const w = 110 + rnd() * 90, y = r * h, tone = 150 + Math.floor(rnd() * 22), warm = Math.floor(rnd() * 6);
      for (const ox of [0, N, -N]) {
        const sx = px + ox + 2, sy = y + 2, sw = w - 4, sh = h - 4;
        x.fillStyle = `rgb(${tone + warm},${tone + warm * 0.6},${tone - 6})`; x.fillRect(sx, sy, sw, sh);
        const gr = x.createLinearGradient(sx, sy, sx + sw, sy + sh);
        gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.10)');
        x.fillStyle = gr; x.fillRect(sx, sy, sw, sh);
      }
      px += w;
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set((HALL.hw * 2) / 8, (HALL.hd * 2) / 8);
  return t;
}

function buildHall() {
  const b = new GB([0.82, 1.08]), g = new GB([1, 1]);
  const { hw, hd, h } = HALL;
  const T = 1.4;   // wall thickness
  // ---- walls (inner faces at +-hw / +-hd) with a darker plinth, stone courses and a cornice
  b.box(T, h, hd * 2 + 2 * T, [-hw - T / 2, h / 2, 0], STONE); b.box(T, h, hd * 2 + 2 * T, [hw + T / 2, h / 2, 0], STONE);
  b.box(hw * 2, h, T, [0, h / 2, -hd - T / 2], STONE); b.box(hw * 2, h, T, [0, h / 2, hd + T / 2], STONE);
  for (const sx of [-1, 1]) {
    b.box(0.35, 1.1, hd * 2, [sx * (hw - 0.17), 0.55, 0], STONE2);               // plinth
    b.box(0.3, 0.45, hd * 2, [sx * (hw - 0.15), h - 0.25, 0], STONE3);           // cornice
    for (let k = 1; k < 4; k++) b.box(0.12, 0.1, hd * 2, [sx * (hw - 0.05), 1.1 + k * 1.9, 0], STONE2);
  }
  for (const sz of [-1, 1]) {
    b.box(hw * 2, 1.1, 0.35, [0, 0.55, sz * (hd - 0.17)], STONE2);
    b.box(hw * 2, 0.45, 0.3, [0, h - 0.25, sz * (hd - 0.15)], STONE3);
    for (let k = 1; k < 4; k++) b.box(hw * 2, 0.1, 0.12, [0, 1.1 + k * 1.9, sz * (hd - 0.05)], STONE2);
  }
  // ---- windows on the side walls (tall arched panes with a bright glow) between the banners
  for (const sx of [-1, 1]) for (const z of [-17, -9, -0, 9, 17]) {
    if (Math.abs(z) < 0.1) continue;
    const x = sx * (hw - 0.06);
    b.box(0.3, 4.2, 1.9, [x, 5.0, z], STONE3);
    b.cyl(0.95, 0.95, 0.3, 10, [x, 7.1, z], STONE3, [0, 0, Math.PI / 2]);
    g.box(0.12, 3.6, 1.4, [sx * (hw - 0.2), 4.9, z], '#9fc4ee'); g.cyl(0.7, 0.7, 0.12, 10, [sx * (hw - 0.2), 6.7, z], '#9fc4ee', [0, 0, Math.PI / 2]);
    for (const dz of [-0.35, 0.35]) b.box(0.1, 3.6, 0.07, [sx * (hw - 0.26), 4.9, z + dz], IRON);
    b.box(0.1, 0.07, 1.4, [sx * (hw - 0.26), 5.2, z], IRON);
  }
  // ---- pillars + ceiling beams
  for (const [px, pz] of PILLARS) {
    b.box(1.7, 0.5, 1.7, [px, 0.25, pz], STONE2); b.cyl(0.62, 0.7, h - 1.4, 10, [px, 0.5 + (h - 1.4) / 2, pz], STONE);
    b.box(1.5, 0.5, 1.5, [px, h - 0.95, pz], STONE3); b.box(1.8, 0.35, 1.8, [px, h - 0.55, pz], STONE2);
    const sx = px > 0 ? -1 : 1;   // sconce on the aisle-facing side
    b.box(0.1, 0.5, 0.1, [px + sx * 0.78, 3.25, pz], IRON); g.box(0.2, 0.3, 0.2, [px + sx * 0.78, 3.65, pz], '#ffb860');
  }
  // ---- red carpet from the door to the dais (+ gold edges), over the dais steps up to the throne
  const cz0 = hd - 0.4, cz1 = DAIS.z1;
  b.box(3.4, 0.05, cz0 - cz1, [0, 0.03, (cz0 + cz1) / 2], RED, [0, 0, 0], [1, 1]);
  for (const sx of [-1, 1]) b.box(0.16, 0.06, cz0 - cz1, [sx * 1.6, 0.035, (cz0 + cz1) / 2], GOLD, [0, 0, 0], [1, 1]);
  b.box(3.4, 0.05, 3.2, [0, DAIS.h + 0.03, DAIS.z1 - 1.6 - 0.7], RED, [0, 0, 0], [1, 1]);
  b.box(3.4, 0.06, 1.4, [0, 0.33, DAIS.z1 + 0.5], RED, [0, 0, 0], [1, 1]);
  // ---- dais: two steps, gold trim
  const dz = (DAIS.z0 + DAIS.z1) / 2, dl = DAIS.z1 - DAIS.z0;
  b.box(DAIS.hw * 2, DAIS.h, dl, [0, DAIS.h / 2, dz], STONE3);
  b.box(DAIS.hw * 2 + 1.4, 0.3, 1.2, [0, 0.15, DAIS.z1 + 0.6], STONE2);
  b.box(DAIS.hw * 2 + 0.1, 0.08, 0.14, [0, DAIS.h - 0.01, DAIS.z1 - 0.05], GOLD);
  // ---- throne (high backed, gold trim, red cushion) against the north wall + maroon hanging behind it
  const tz = THRONE_Z, ty = DAIS.h;
  b.box(3.4, 0.5, 2.0, [0, ty + 0.25, tz], WOOD); b.box(2.6, 0.35, 1.6, [0, ty + 0.68, tz + 0.05], RED);
  b.box(3.0, 4.6, 0.5, [0, ty + 2.3, tz - 0.9], WOOD); b.box(2.5, 3.9, 0.12, [0, ty + 2.4, tz - 0.6], RED);
  b.box(0.45, 1.5, 1.9, [-1.5, ty + 0.9, tz], WOOD); b.box(0.45, 1.5, 1.9, [1.5, ty + 0.9, tz], WOOD);
  b.cone(0.5, 1.2, 4, [0, ty + 5.2, tz - 0.9], GOLD, [0, Math.PI / 4, 0]); b.sph(0.22, [-1.5, ty + 1.75, tz + 0.5], GOLD, 1, 5); b.sph(0.22, [1.5, ty + 1.75, tz + 0.5], GOLD, 1, 5);
  g.box(0.5, 0.5, 0.06, [0, ty + 4.2, tz - 0.55], GOLD, [0, Math.PI / 4, 0]);
  b.box(10, 8.2, 0.1, [0, 4.8, -hd + 0.2], MAROON); b.box(10.4, 0.25, 0.2, [0, 8.8, -hd + 0.25], GOLD);
  g.box(2.2, 0.35, 0.06, [0, 6.6, -hd + 0.28], '#e8c868'); g.box(0.35, 2.4, 0.06, [0, 6.0, -hd + 0.28], '#e8c868');
  // ---- banners between the windows (maroon with gold bar and emblem)
  for (const sx of [-1, 1]) for (const z of BANNER_Z) {
    const x = sx * (hw - 0.1);
    b.box(0.07, 4.4, 1.5, [x, 5.0, z], MAROON); b.box(0.12, 0.14, 1.9, [x, 7.3, z], GOLD); b.box(0.1, 0.5, 1.5, [x, 2.55, z], GOLD, [0, 0, 0], [1, 1]);
    g.box(0.05, 0.6, 0.6, [x - sx * 0.05, 5.0, z], '#e8c868', [Math.PI / 4, 0, 0]);
  }
  // ---- entrance door (south wall): wood leaves with iron bands under a stone arch, lanterns either side
  b.box(4.8, 6.2, 0.4, [0, 3.1, hd - 0.2], STONE3); b.cyl(2.2, 2.2, 0.4, 14, [0, 6.0, hd - 0.2], STONE3, [Math.PI / 2, 0, 0]);
  b.box(3.8, 4.4, 0.3, [0, 2.2, hd - 0.25], WOOD); b.cyl(1.9, 1.9, 0.3, 14, [0, 4.4, hd - 0.25], WOOD, [Math.PI / 2, 0, 0], [1, 1, 1]);
  for (const yy of [1.0, 2.6, 4.0]) b.box(3.8, 0.14, 0.34, [0, yy, hd - 0.28], IRON);
  b.box(0.1, 4.6, 0.36, [0, 2.3, hd - 0.28], IRON);
  for (const sx of [-1, 1]) { b.box(0.14, 0.14, 0.14, [sx * 3.0, 3.6, hd - 0.2], IRON); g.box(0.28, 0.4, 0.28, [sx * 3.0, 3.35, hd - 0.2], '#ffcf7a'); }
  // ---- braziers (iron bowl + flame glow)
  for (const [x, z] of BRAZIERS) {
    b.cyl(0.14, 0.2, 1.0, 6, [x, 0.5, z], IRON); b.cyl(0.5, 0.2, 0.34, 8, [x, 1.15, z], IRON);
    g.cone(0.3, 0.85, 6, [x, 1.65, z], '#ffb050'); g.sph(0.2, [x, 1.5, z], '#ffe090', 1, 5);
  }
  // ---- long tables with benches, goblets and candles
  for (const [x, z, hl] of TABLES) {
    b.box(1.6, 0.12, hl * 2, [x, 1.0, z], WOOD2); b.box(1.2, 0.8, 0.14, [x, 0.5, z - hl + 0.3], WOOD); b.box(1.2, 0.8, 0.14, [x, 0.5, z + hl - 0.3], WOOD);
    b.box(0.14, 0.14, hl * 2 - 0.6, [x, 0.2, z], WOOD);
    for (const s of [-1, 1]) { b.box(0.55, 0.1, hl * 2 - 0.4, [x + s * 1.35, 0.55, z], WOOD2); for (const e of [-1, 1]) b.box(0.45, 0.55, 0.1, [x + s * 1.35, 0.27, z + e * (hl - 0.5)], WOOD); }
    b.box(1.0, 0.04, hl * 2 - 0.6, [x, 1.08, z], MAROON);   // runner
    for (let i = -2; i <= 2; i++) { b.cyl(0.07, 0.05, 0.2, 6, [x - 0.4, 1.2, z + i * 1.1], GOLD); b.cyl(0.07, 0.05, 0.2, 6, [x + 0.4, 1.2, z + i * 1.1 + 0.3], GOLD); b.cyl(0.15, 0.15, 0.05, 8, [x, 1.13, z + i * 1.1 + 0.55], '#d8d4cc'); }
    for (const i of [-1, 1]) { b.cyl(0.05, 0.06, 0.3, 6, [x, 1.28, z + i * 1.6], '#f0e8d0'); g.sph(0.06, [x, 1.5, z + i * 1.6], '#ffd070', [1, 1.5, 1], 4); }
  }
  // ---- weapon racks / shields on the side walls
  for (const sx of [-1, 1]) for (const z of [-8.6, 10.1]) {
    const x = sx * (hw - 0.55);
    b.box(0.2, 0.15, 1.8, [x, 0.8, z], WOOD); b.box(0.2, 0.15, 1.8, [x, 2.4, z], WOOD);
    for (const dz2 of [-0.6, -0.2, 0.2, 0.6]) { b.cyl(0.04, 0.04, 2.5, 5, [x, 1.6, z + dz2], WOOD2); b.cone(0.07, 0.3, 4, [x, 3.0, z + dz2], '#c4cad4'); }
  }
  return { body: b.build(), glow: g.build() };
}

export function CastleInterior({ q }: { q: QualityCfg }) {
  const hall = useMemo(buildHall, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    floor: new MeshStandardMaterial({ map: flagstones(), roughness: 0.95 }),
    outer: new MeshStandardMaterial({ color: new Color('#1a1613'), roughness: 1 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }),
  }), []);
  useEffect(() => () => { hall.body.dispose(); hall.glow.dispose(); mats.lit.dispose(); mats.floor.map?.dispose(); mats.floor.dispose(); mats.outer.dispose(); mats.glow.dispose(); }, [hall, mats]);
  const l1 = useRef<PointLight>(null!), l2 = useRef<PointLight>(null!), l3 = useRef<PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (l1.current) l1.current.intensity = 34 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.1) * 2;
    if (l2.current) l2.current.intensity = 34 + Math.sin(t * 6.1 + 1) * 4 + Math.sin(t * 11.7) * 2;
    if (l3.current) l3.current.intensity = 26 + Math.sin(t * 5.3 + 2) * 3;
  });
  const sh = q.shadowMap > 0;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={mats.floor} receiveShadow={sh}><planeGeometry args={[HALL.hw * 2, HALL.hd * 2]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} material={mats.outer}><planeGeometry args={[400, 400]} /></mesh>
      <mesh geometry={hall.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={hall.glow} material={mats.glow} />
      <pointLight ref={l1} position={[-4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={34} />
      <pointLight ref={l2} position={[4.4, 2.6, -11.6]} color="#ffb070" distance={24} decay={2} intensity={34} />
      <pointLight ref={l3} position={[0, 3.2, 12]} color="#ffc080" distance={22} decay={2} intensity={26} />
      <Npcs area="CASTLE" />
    </group>
  );
}
