// Obstacle renderer: trees (Kenney GLB), pines, rocks, houses, fences, ruins. Rebuilt per run (obstaclesVersion).
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, MeshBasicMaterial, Color, Group, OctahedronGeometry } from 'three';
import { world } from '../engine/world';
import type { Obstacle } from '../engine/types';
import { Inst } from './Inst';
import { GB, glowMat, litMat, mulberry32, setInst, TAU } from './util';
import { makeRockGeo, useNature } from './models';
import { useObstaclesVersion } from './hooks';
import { QualityCfg } from './quality';

export function makeHouse() {
  const body = new GB([0.82, 1.06]);
  const glow = new GB([1, 1]);
  const stone = '#9b9488', plaster = '#efe0bd', wood = '#6e4b2b', roof = '#b9492f', roof2 = '#9c3a26';
  body.box(6.6, 1.1, 5.6, [0, 0.55, 0], stone);
  body.box(6.0, 2.7, 5.0, [0, 2.45, 0], plaster, [0, 0, 0], [0.9, 1.0]);
  // timber frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.box(0.34, 2.8, 0.34, [sx * 3.0, 2.45, sz * 2.5], wood);
  for (const sz of [-1, 1]) { body.box(6.2, 0.26, 0.3, [0, 3.7, sz * 2.52], wood); body.box(6.2, 0.22, 0.3, [0, 2.2, sz * 2.52], wood); }
  for (const sx of [-1, 1]) body.box(0.3, 0.26, 5.2, [sx * 3.02, 3.7, 0], wood);
  body.box(0.2, 1.5, 0.25, [-1.6, 3.0, 2.54], wood, [0, 0, 0.6]); body.box(0.2, 1.5, 0.25, [1.6, 3.0, 2.54], wood, [0, 0, -0.6]);
  // roof
  body.prism(7.4, 3.0, 6.2, [0, 3.8, 0], roof, [0, 0, 0], [0.8, 1.05]);
  body.box(0.35, 0.3, 6.4, [0, 6.8, 0], roof2);
  // gable trim
  body.box(0.18, 0.18, 6.4, [-3.7, 3.85, 0], wood, [0, 0, -0.78]); body.box(0.18, 0.18, 6.4, [3.7, 3.85, 0], wood, [0, 0, 0.78]);
  // chimney
  body.box(1.0, 3.0, 1.0, [2.0, 6.0, -1.0], '#8a7f74'); body.box(1.25, 0.25, 1.25, [2.0, 7.55, -1.0], '#6f665d');
  // door + steps
  body.box(1.35, 2.1, 0.22, [0, 1.65, 2.55], '#5a3a1e'); body.cyl(0.675, 0.675, 0.22, 10, [0, 2.7, 2.55], '#5a3a1e', [Math.PI / 2, 0, 0]);
  body.box(0.12, 0.12, 0.12, [0.45, 1.6, 2.7], '#e6b53a');
  body.box(2.2, 0.28, 1.0, [0, 0.14, 3.1], '#a29a8e'); body.box(1.9, 0.28, 0.7, [0, 0.42, 2.95], '#b3ab9f');
  // windows (front x2, sides)
  const win = (x: number, y: number, z: number, ry: number) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    glow.box(0.95, 0.95, 0.12, [x, y, z], '#ffd88a', [0, ry, 0]);
    body.box(1.2, 0.14, 0.2, [x, y + 0.55, z], wood, [0, ry, 0]); body.box(1.2, 0.14, 0.2, [x, y - 0.55, z], wood, [0, ry, 0]);
    body.box(0.14, 0.95, 0.2, [x - c * 0.55, y, z + s * 0.55 * 0], wood, [0, ry, 0]); body.box(0.14, 0.95, 0.2, [x + c * 0.55, y, z - s * 0.55 * 0], wood, [0, ry, 0]);
    body.box(0.06, 0.95, 0.16, [x, y, z + 0.02], wood, [0, ry, 0]);
    body.box(1.3, 0.3, 0.45, [x + s * 0.2, y - 0.85, z + c * 0.2], '#7a5230', [0, ry, 0]);
    body.sph(0.15, [x - 0.35 * c, y - 0.62, z + 0.3 * c], '#ff7aa8', 1, 5); body.sph(0.15, [x + 0.05, y - 0.62, z + 0.3], '#ffe14a', 1, 5); body.sph(0.15, [x + 0.4, y - 0.62, z + 0.3], '#ffffff', 1, 5);
  };
  win(-1.9, 2.5, 2.56, 0); win(1.9, 2.5, 2.56, 0);
  glow.box(0.12, 0.9, 0.9, [3.04, 2.5, 0.4], '#ffd88a'); glow.box(0.12, 0.9, 0.9, [-3.04, 2.5, -0.4], '#ffd88a');
  glow.cyl(0.55, 0.55, 0.12, 8, [0, 5.3, 3.0], '#ffd88a', [Math.PI / 2, 0, 0]);   // attic round window
  body.torus(0.6, 0.07, [0, 5.3, 3.03], wood, [0, 0, 0], 1, 10);
  // lantern by door
  body.box(0.08, 0.5, 0.08, [-1.1, 2.7, 2.75], '#333'); glow.sph(0.16, [-1.1, 2.45, 2.75], '#ffcf6a', 1, 6);
  return { body: body.build(), glow: glow.build() };
}

function makeFence() {
  const g = new GB([0.8, 1.05]);
  const w = '#a97c4c', d = '#86603a';
  g.box(0.2, 1.15, 0.2, [0, 0.55, 0], d); g.box(0.26, 0.1, 0.26, [0, 1.15, 0], w);
  g.box(1.5, 0.13, 0.08, [0.75, 0.42, 0], w); g.box(1.5, 0.13, 0.08, [0.75, 0.82, 0], w);
  return g.build();
}

function makeRuin() {
  const g = new GB([0.7, 1.12]);
  const st = '#b9b3a4', st2 = '#968f80', moss = '#5aa03a';
  g.box(1.8, 0.4, 1.8, [0, 0.2, 0], st2); g.box(1.45, 0.25, 1.45, [0, 0.52, 0], st);
  g.cyl(0.58, 0.64, 3.0, 8, [0, 2.1, 0], st); g.cyl(0.7, 0.7, 0.18, 8, [0, 1.2, 0], st2); g.cyl(0.7, 0.7, 0.18, 8, [0, 2.7, 0], st2);
  g.ico(0.62, [0.05, 3.7, 0], st2, [1, 0.55, 1], 0, [0.2, 0.3, 0.3]);
  g.sph(0.5, [0.2, 0.4, 0.4], moss, [1.4, 0.45, 1.2], 6); g.sph(0.35, [-0.35, 2.0, 0.45], moss, [1, 0.6, 0.7], 5); g.sph(0.28, [0.4, 3.3, -0.3], moss, [1, 0.55, 1], 5);
  // fallen drum + chunks
  g.cyl(0.55, 0.55, 0.9, 8, [1.7, 0.5, 0.6], st, [0, 0, Math.PI / 2 - 0.2]); g.box(0.7, 0.4, 0.55, [-1.3, 0.2, -0.8], st2, [0, 0.5, 0.1]); g.box(0.4, 0.3, 0.4, [0.9, 0.15, -1.3], st, [0.2, 0.9, 0]);
  return g.build();
}

function makeBush() {
  const g = new GB([0.7, 1.15]);
  g.ico(0.7, [0, 0.45, 0], '#3f9a38', [1.2, 0.8, 1.1], 1);
  g.ico(0.5, [0.55, 0.35, 0.2], '#4eaa42', [1, 0.8, 1], 0);
  g.ico(0.45, [-0.5, 0.35, -0.2], '#2f8a34', [1, 0.8, 1], 0);
  for (let i = 0; i < 4; i++) { const a = i * 1.7; g.sph(0.07, [Math.cos(a) * 0.7, 0.62 + (i % 2) * 0.1, Math.sin(a) * 0.6], i % 2 ? '#ff7a9a' : '#ffe14a', 1, 4); }
  return g.build();
}


function makeStump() {
  const g = new GB([0.7, 1.1]);
  g.cyl(0.75, 0.95, 0.8, 9, [0, 0.4, 0], '#7a5430');
  g.cyl(0.7, 0.7, 0.06, 9, [0, 0.82, 0], '#d8b27a');
  g.torus(0.45, 0.025, [0, 0.86, 0], '#b08850', [Math.PI / 2, 0, 0], 1, 10); g.torus(0.22, 0.025, [0, 0.86, 0], '#b08850', [Math.PI / 2, 0, 0], 1, 8);
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; g.cone(0.22, 0.9, 4, [Math.cos(a) * 0.9, 0.18, Math.sin(a) * 0.9], '#6a4828', [0, 0, Math.cos(a) * 1.3], [1, 1, 1]); }
  g.sph(0.4, [0.3, 0.75, -0.45], '#5aa03a', [1.2, 0.35, 1], 5);
  g.sph(0.12, [-0.5, 0.15, 0.7], '#d8433a', [1, 0.7, 1], 5); g.cyl(0.04, 0.05, 0.14, 4, [-0.5, 0.07, 0.7], '#f0e6d0');
  return g.build();
}
function makeWell() {
  const g = new GB([0.75, 1.1]);
  const st = '#a29a8c', wood = '#7a5230';
  g.cyl(1.35, 1.45, 1.2, 10, [0, 0.6, 0], st); g.cyl(1.55, 1.55, 0.2, 10, [0, 1.25, 0], '#b8b0a0');
  g.cyl(1.1, 1.1, 0.05, 10, [0, 1.2, 0], '#1a3a4a');
  for (const s of [-1, 1]) g.box(0.2, 3.0, 0.2, [s * 1.3, 2.5, 0], wood);
  g.box(0.14, 0.14, 2.8, [0, 3.0, 0], wood, [0, 0, 0]); g.cyl(0.14, 0.14, 2.6, 6, [0, 3.0, 0], '#6a4828', [0, 0, Math.PI / 2]);
  g.prism(3.6, 1.4, 3.4, [0, 3.9, 0], '#b9492f', [0, Math.PI / 2, 0]);
  g.cyl(0.015, 0.015, 1.4, 4, [0.2, 2.3, 0], '#ccc'); g.cyl(0.22, 0.17, 0.3, 7, [0.2, 1.5, 0], '#6a4828');
  return g.build();
}
function makeStatue() {
  const g = new GB([0.72, 1.1]);
  const st = '#b4b0a6', st2 = '#8c887e', moss = '#5aa03a';
  g.box(2.4, 0.5, 2.4, [0, 0.25, 0], st2); g.box(1.9, 0.5, 1.9, [0, 0.75, 0], st); g.box(1.5, 0.3, 1.5, [0, 1.15, 0], st2);
  g.box(0.5, 1.5, 0.35, [-0.22, 2.1, 0], st); g.box(0.5, 1.5, 0.35, [0.22, 2.1, 0], st);
  g.box(1.1, 1.5, 0.6, [0, 3.45, 0], st); g.box(1.5, 0.35, 0.6, [0, 4.1, 0], st2);
  g.sph(0.42, [0, 4.55, 0], st, 1, 7);
  g.box(0.3, 1.3, 0.3, [-0.85, 3.3, 0.1], st, [0, 0, 0.15]); g.box(0.3, 1.5, 0.3, [0.85, 4.0, 0.15], st, [0, 0, -0.5]);
  g.box(0.14, 2.2, 0.14, [1.5, 5.0, 0.2], '#c8ccd2', [0, 0, -0.5]); g.box(0.6, 0.12, 0.14, [1.1, 4.1, 0.2], st2, [0, 0, -0.5]);
  g.box(0.25, 1.5, 1.2, [-1.1, 3.6, -0.5], st2, [0.2, 0, 0.15]);   // cape
  g.sph(0.5, [0.5, 0.55, 0.9], moss, [1.4, 0.4, 1], 5); g.sph(0.4, [-0.3, 3.9, 0.3], moss, [1, 0.5, 0.8], 5); g.sph(0.35, [-0.2, 1.4, 0.7], moss, [1.3, 0.5, 1], 5);
  return g.build();
}
function makeTent() {
  const g = new GB([0.8, 1.08]);
  const glow = new GB([1, 1]);
  g.prism(4.6, 3.0, 5.2, [0, 0, 0], '#c84a3a'); g.prism(4.62, 3.02, 1.3, [0, 0, -1.3], '#efe2c4'); g.prism(4.62, 3.02, 1.3, [0, 0, 1.3], '#efe2c4');
  g.prism(1.5, 1.9, 0.1, [0, 0, 2.62], '#2a1a14');
  g.cyl(0.06, 0.06, 3.5, 5, [0, 1.6, 2.7], '#5a3a1e'); g.cyl(0.05, 0.05, 3.3, 5, [0, 1.5, -2.7], '#5a3a1e');
  for (const s of [-1, 1]) { g.cyl(0.03, 0.03, 1.2, 4, [s * 2.7, 0.5, 2.0], '#5a3a1e', [0, 0, s * 0.5]); g.cyl(0.03, 0.03, 1.2, 4, [s * 2.7, 0.5, -2.0], '#5a3a1e', [0, 0, s * 0.5]); }
  g.box(0.9, 0.5, 0.9, [-3.2, 0.25, 1.2], '#a8733a'); g.sph(0.45, [-2.8, 0.35, 2.4], '#cdb78a', [1, 0.8, 1], 6);
  return { body: g.build(), glow: glow.build() };
}
function makeLog() {
  const g = new GB([0.75, 1.1]);
  g.cyl(0.6, 0.65, 4.0, 8, [0, 0.6, 0], '#7a5430', [0, 0, Math.PI / 2]);
  g.cyl(0.52, 0.52, 0.06, 8, [2.02, 0.6, 0], '#d8b27a', [0, 0, Math.PI / 2]);
  g.sph(0.7, [-0.5, 1.15, 0], '#5aa03a', [2.0, 0.3, 0.9], 6);
  for (let i = 0; i < 3; i++) { g.cyl(0.04, 0.05, 0.2, 4, [0.6 + i * 0.3, 1.3, 0.3 * (i - 1)], '#f0e6d0'); g.sph(0.14, [0.6 + i * 0.3, 1.43, 0.3 * (i - 1)], i % 2 ? '#d8433a' : '#e8a050', [1, 0.6, 1], 5); }
  return g.build();
}
function makeSpire() {
  const body = new GB([0.7, 1.1]);
  const glow = new GB([0.7, 1.25]);
  body.ico(1.8, [0, 0.2, 0], '#6f7480', [1.3, 0.55, 1.2], 0);
  body.sph(0.8, [0.9, 0.5, 0.8], '#5aa03a', [1.2, 0.35, 1], 5);
  const spires: [number, number, number, number, number, number][] = [[0, 0, 1.0, 5.5, 0.1, 0], [0.9, 0.4, 0.65, 3.3, 0.35, -0.3], [-0.9, -0.3, 0.7, 3.8, -0.3, 0.2], [0.2, -1.0, 0.5, 2.5, 0.2, 0.45], [-0.5, 1.0, 0.45, 2.2, -0.4, -0.3]];
  spires.forEach(([x, z, r, h, rz, rx], i) => {
    glow.add(new (OctahedronGeometry as any)(1, 0), [x, h * 0.5 + 0.2, z], [rx, i, rz], [r, h * 0.5, r], i % 2 ? '#c88bff' : '#6fe8ff', [0.7, 1.2]);
  });
  return { body: body.build(), glow: glow.build() };
}
function makeWindmillBody() {
  const g = new GB([0.75, 1.08]);
  g.cyl(2.6, 3.2, 4.0, 10, [0, 2.0, 0], '#a69e90');
  g.cyl(2.3, 2.6, 4.5, 10, [0, 6.2, 0], '#efe0bd');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.box(0.3, 4.4, 0.3, [Math.cos(a) * 2.45, 6.2, Math.sin(a) * 2.45], '#6e4b2b'); }
  g.cone(3.1, 2.6, 10, [0, 9.8, 0], '#b9492f'); g.sph(0.35, [0, 11.2, 0], '#6e4b2b', 1, 5);
  g.box(1.3, 2.2, 0.3, [0, 1.3, 3.1], '#5a3a1e'); g.box(1.0, 1.0, 0.2, [0, 7.0, 2.4], '#6e4b2b'); g.box(0.1, 0.9, 0.1, [0, 7.0, 2.5], '#ffd88a');
  g.cyl(0.4, 0.4, 1.2, 6, [0, 8.2, 2.7], '#4a3a2a', [Math.PI / 2, 0, 0]);
  return g.build();
}
function makeBlades() {
  const g = new GB([0.85, 1.05]);
  g.cyl(0.35, 0.35, 0.8, 7, [0, 0, 0], '#4a3a2a', [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const ca = Math.cos(a), sa = Math.sin(a);
    g.box(0.22, 8.4, 0.22, [-sa * 4.2, ca * 4.2, 0.1], '#6e4b2b', [0, 0, a]);
    for (let k = 0; k < 4; k++) { const d = 2.2 + k * 1.6; g.box(1.3, 0.12, 0.08, [-sa * d + ca * 0.75, ca * d + sa * 0.75, 0.2], '#efe8d4', [0, 0, a]); g.box(1.3, 0.05, 0.1, [-sa * d + ca * 0.75, ca * d + sa * 0.75, 0.22], '#b89a6a', [0, 0, a + 0.0]); }
  }
  return g.build();
}

function WindmillView({ o, body, blades, mat }: { o: Obstacle; body: any; blades: any; mat: any }) {
  const ref = useRef<Group>(null!);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.55 + o.id; });
  return (
    <group position={[o.pos.x, 0, o.pos.z]} rotation={[0, o.rot, 0]} scale={o.scale}>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <group position={[0, 8.2, 3.4]} ref={ref}><mesh geometry={blades} material={mat} castShadow /></group>
    </group>
  );
}

export function Props({ q }: { q: QualityCfg }) {
  const nat = useNature();
  useObstaclesVersion();
  const obs = world.obstacles;
  const lists = useMemo(() => {
    const by = { oak: [] as Obstacle[], palm: [] as Obstacle[], pineA: [] as Obstacle[], pineB: [] as Obstacle[], rock: [[], [], [], []] as Obstacle[][], house: [] as Obstacle[], fence: [] as Obstacle[], ruin: [] as Obstacle[], stump: [] as Obstacle[], boulder: [[], [], []] as Obstacle[][], well: [] as Obstacle[], statue: [] as Obstacle[], tent: [] as Obstacle[], log: [] as Obstacle[], spire: [] as Obstacle[], windmill: [] as Obstacle[] };
    for (const o of obs) {
      switch (o.kind) {
        case 'TREE': (o.id % 4 === 0 ? by.palm : by.oak).push(o); break;
        case 'PINE': (o.id % 2 ? by.pineA : by.pineB).push(o); break;
        case 'ROCK': by.rock[o.id % 4].push(o); break;
        case 'HOUSE': by.house.push(o); break;
        case 'FENCE': by.fence.push(o); break;
        case 'RUIN': by.ruin.push(o); break;
        case 'STUMP': by.stump.push(o); break;
        case 'BOULDER': by.boulder[o.id % 3].push(o); break;
        case 'WELL': by.well.push(o); break;
        case 'STATUE': by.statue.push(o); break;
        case 'TENT': by.tent.push(o); break;
        case 'LOG': by.log.push(o); break;
        case 'CRYSTAL_SPIRE': by.spire.push(o); break;
        case 'WINDMILL': by.windmill.push(o); break;
      }
    }
    return by;
  }, [obs]);

  const rocks = useMemo(() => [11, 12, 13, 14].map((s, i) => makeRockGeo(s * 7, i % 2 ? '#8a929c' : '#9a9aa0', '#5fa73c', 0.7 + i * 0.1)), []);
  const house = useMemo(makeHouse, []);
  const fence = useMemo(makeFence, []);
  const ruin = useMemo(makeRuin, []);
  const bush = useMemo(makeBush, []);
  const stump = useMemo(makeStump, []), well = useMemo(makeWell, []), statue = useMemo(makeStatue, []), tent = useMemo(makeTent, []), log = useMemo(makeLog, []), spire = useMemo(makeSpire, []);
  const wmBody = useMemo(makeWindmillBody, []), wmBlades = useMemo(makeBlades, []);
  const boulders = useMemo(() => [41, 42, 43].map((s, i) => makeRockGeo(s * 5, i === 1 ? '#7d8590' : '#8d8f94', '#5a9a3a', 0.8 + i * 0.12)), []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.3, 1.0) }), crystal: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.7, 1.7) }) }), []);
  useFrame(({ clock }) => { const k = 1.5 + Math.sin(clock.elapsedTime * 1.6) * 0.35; mats.crystal.color.setRGB(k, k, k); });

  const fillFor = (list: Obstacle[], tall: number, k: number, jitter: number) => (m: InstancedMesh) => {
    const rnd = mulberry32(list.length * 31 + k);
    list.forEach((o, i) => {
      const s = o.scale * tall * (0.9 + rnd() * 0.25);
      setInst(m, i, o.pos.x, -0.05, o.pos.z, o.rot, s, s * (0.9 + rnd() * jitter), s, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06);
    });
  };
  const fills = useMemo(() => ({
    oak: fillFor(lists.oak, 3.7, 1, 0.3), palm: fillFor(lists.palm, 3.4, 2, 0.3), pineA: fillFor(lists.pineA, 4.0, 3, 0.35), pineB: fillFor(lists.pineB, 4.0, 4, 0.35),
    rock: lists.rock.map((l, k) => (m: InstancedMesh) => { const r = mulberry32(k + 5); l.forEach((o, i) => { const s = o.radius * 0.95; setInst(m, i, o.pos.x, 0, o.pos.z, o.rot, s * (0.9 + r() * 0.2), s * (0.9 + r() * 0.4), s * (0.9 + r() * 0.2)); }); }),
    boulder: lists.boulder.map((l, k) => (m: InstancedMesh) => { const r = mulberry32(k + 50); l.forEach((o, i) => { const s = Math.max(2, o.radius) * 1.0; setInst(m, i, o.pos.x, -0.2, o.pos.z, o.rot, s * (0.95 + r() * 0.2), s * (0.9 + r() * 0.5), s * (0.95 + r() * 0.2)); }); }),
    simple: (list: Obstacle[], k = 1) => (m: InstancedMesh) => list.forEach((o, i) => setInst(m, i, o.pos.x, 0, o.pos.z, o.rot, o.scale * k)),
    house: (m: InstancedMesh) => lists.house.forEach((o, i) => setInst(m, i, o.pos.x, 0, o.pos.z, o.rot, o.scale)),
    fence: (m: InstancedMesh) => lists.fence.forEach((o, i) => setInst(m, i, o.pos.x - 0.75 * Math.cos(o.rot), 0, o.pos.z + 0.75 * Math.sin(o.rot), o.rot, o.scale)),
    ruin: (m: InstancedMesh) => lists.ruin.forEach((o, i) => setInst(m, i, o.pos.x, 0, o.pos.z, o.rot, o.scale * (0.8 + (i % 3) * 0.12), o.scale * (0.55 + (i % 3) * 0.3), o.scale * (0.8 + (i % 3) * 0.12))),
    bush: (m: InstancedMesh) => {
      const r = mulberry32(99); let c = 0;
      for (const o of [...lists.oak, ...lists.palm]) { if (c >= 64) break; const a = r() * TAU; setInst(m, c++, o.pos.x + Math.cos(a) * (o.radius + 0.6), 0, o.pos.z + Math.sin(a) * (o.radius + 0.6), r() * 6, 0.9 + r() * 0.7); }
      m.count = c;
    },
  }), [lists]);

  const nTrees = lists.oak.length + lists.palm.length + lists.pineA.length + lists.pineB.length;
  void nTrees;
  return (
    <group key={world.obstaclesVersion}>
      {lists.oak.length > 0 && <Inst geo={nat.oak} mat={nat.mat} count={lists.oak.length} fill={fills.oak} cast receive />}
      {lists.palm.length > 0 && <Inst geo={nat.palm} mat={nat.mat} count={lists.palm.length} fill={fills.palm} cast receive />}
      {lists.pineA.length > 0 && <Inst geo={nat.pineA} mat={nat.mat} count={lists.pineA.length} fill={fills.pineA} cast receive />}
      {lists.pineB.length > 0 && <Inst geo={nat.pineB} mat={nat.mat} count={lists.pineB.length} fill={fills.pineB} cast receive />}
      {rocks.map((g, k) => lists.rock[k].length > 0 && <Inst key={k} geo={g} mat={mats.lit} count={lists.rock[k].length} fill={fills.rock[k]} cast receive />)}
      {lists.house.length > 0 && <>
        <Inst geo={house.body} mat={mats.lit} count={lists.house.length} fill={fills.house} cast receive />
        <Inst geo={house.glow} mat={mats.glow} count={lists.house.length} fill={fills.house} />
      </>}
      {lists.fence.length > 0 && <Inst geo={fence} mat={mats.lit} count={lists.fence.length} fill={fills.fence} cast receive />}
      {lists.ruin.length > 0 && <Inst geo={ruin} mat={mats.lit} count={lists.ruin.length} fill={fills.ruin} cast receive />}
      {boulders.map((g, k) => lists.boulder[k].length > 0 && <Inst key={'b' + k} geo={g} mat={mats.lit} count={lists.boulder[k].length} fill={fills.boulder[k]} cast receive />)}
      {lists.stump.length > 0 && <Inst geo={stump} mat={mats.lit} count={lists.stump.length} fill={fills.simple(lists.stump)} cast receive />}
      {lists.well.length > 0 && <Inst geo={well} mat={mats.lit} count={lists.well.length} fill={fills.simple(lists.well)} cast receive />}
      {lists.statue.length > 0 && <Inst geo={statue} mat={mats.lit} count={lists.statue.length} fill={fills.simple(lists.statue)} cast receive />}
      {lists.log.length > 0 && <Inst geo={log} mat={mats.lit} count={lists.log.length} fill={fills.simple(lists.log)} cast receive />}
      {lists.tent.length > 0 && <><Inst geo={tent.body} mat={mats.lit} count={lists.tent.length} fill={fills.simple(lists.tent)} cast receive /><Inst geo={tent.glow} mat={mats.glow} count={lists.tent.length} fill={fills.simple(lists.tent)} /></>}
      {lists.spire.length > 0 && <><Inst geo={spire.body} mat={mats.lit} count={lists.spire.length} fill={fills.simple(lists.spire)} cast receive /><Inst geo={spire.glow} mat={mats.crystal} count={lists.spire.length} fill={fills.simple(lists.spire)} /></>}
      {lists.windmill.map((o) => <WindmillView key={o.id} o={o} body={wmBody} blades={wmBlades} mat={mats.lit} />)}
      {lists.oak.length + lists.palm.length > 0 && <Inst geo={bush} mat={mats.lit} count={64} fill={fills.bush} receive />}
    </group>
  );
}

// ---------------------------------------------------------------- campfire ---
import { REGIONS } from '../engine/mapgen';
import { CELL, FX, embers, pushHalo, smokePuff } from './fx';
import { PointLight } from 'three';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { isLobbyStatus } from './CameraRig';

export function Campfire({ q }: { q: QualityCfg }) {
  const camp = REGIONS.find((r) => r.kind === 'CAMP') || { x: 66, z: -12 };
  const { body, glow } = useMemo(() => {
    const b = new GB([0.75, 1.1]), g = new GB([1, 1]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.cyl(0.13, 0.15, 1.5, 6, [Math.cos(a) * 0.45, 0.28, Math.sin(a) * 0.45], '#5a3a1e', [Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15]); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.ico(0.28, [Math.cos(a) * 1.15, 0.14, Math.sin(a) * 1.15], i % 2 ? '#8a8a86' : '#706f6c', [1, 0.7, 1]); }
    b.cyl(1.0, 1.05, 0.08, 12, [0, 0.03, 0], '#2a2420');
    g.ico(0.35, [0, 0.22, 0], '#ff7a1a', [1.4, 0.5, 1.4], 0); g.ico(0.22, [0.2, 0.28, 0.1], '#ffc040', 1, 0);
    // roasting spit
    b.cyl(0.04, 0.04, 2.8, 5, [0, 1.15, 0], '#4a3626', [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) b.cyl(0.05, 0.05, 1.3, 5, [s * 1.4, 0.65, 0], '#4a3626', [0, 0, s * 0.2]);
    return { body: b.build(), glow: g.build() };
  }, []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.9 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.4, 1) }) }), []);
  const light = useRef<PointLight>(null!);
  useFrame(({ clock }, dtRaw) => {
    const st = useGameStore.getState().status;
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 22 + Math.sin(t * 11) * 4 + Math.sin(t * 23) * 2.5;
    const px = world.player.pos.x - camp.x, pz = world.player.pos.z - camp.z;
    if (isLobbyStatus(st)) return;
    const dist2 = px * px + pz * pz;
    if (dist2 > 70 * 70) return;
    pushHalo(camp.x, 1.2, camp.z, 5 + Math.sin(t * 9) * 0.5, 1.8, 0.6, 0.12, 0.45, CELL.GLOW);
    if (st === GameStatus.PAUSED) return;
    const dt = Math.min(dtRaw, 0.05);
    if (Math.random() < dt * 30) FX.add.emit(camp.x + (Math.random() - 0.5) * 0.9, 0.3, camp.z + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.4, 1.8 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.3, 0.9, 0.1, 2.4, 0.85, 0.18, 0.85, CELL.FLAME, -0.4, 1.2);
    if (Math.random() < dt * 8) embers(camp.x, 0.8, camp.z, 1, 0xffa030, 0.4, 3, 1.2, 0.14);
    if (Math.random() < dt * 3) smokePuff(camp.x, 1.8, camp.z, 1, 0x5a5550, 1.4, 2.4, 1.2, 0.4, 0.3);
  }, -0.2);
  return (
    <group position={[camp.x, 0, camp.z]}>
      <mesh geometry={body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={glow} material={mats.glow} />
      {q.lights && <pointLight ref={light} position={[0, 1.6, 0]} color="#ff9a50" distance={22} decay={1.7} intensity={22} />}
    </group>
  );
}
export const __builders = { makeHouse, makeFence, makeRuin, makeBush, makeStump, makeWell, makeStatue, makeTent, makeLog, makeSpire, makeWindmillBody, makeBlades };
