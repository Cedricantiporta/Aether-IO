// The three shops: procedural buildings, signs, shopkeepers, interaction rings, ambient FX.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, Color, DoubleSide, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, RingGeometry, Sprite,
} from 'three';
import { SHOP_POSITIONS } from '../constants';
import { world, QUEST_POS, SHRINE_POS, TRAINER_POS } from '../engine/world';
import { isLobbyStatus } from './CameraRig';
import { questDone } from '../quests';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, embers, smokePuff } from './fx';
import { GB, glowMat, litMat, TAU, angleLerp, damp } from './util';
import { useCharacterInstance, useClips, CharKey } from './characters';
import { labelMaterial } from './label';
import { QualityCfg } from './quality';
import { TownScenery } from './TownScenery';
import { Npcs } from './Npcs';

type ShopType = 'SUPPLIES' | 'BLACKSMITH' | 'PETS';

// ---------------------------------------------------------------- builders ---
function lantern(b: GB, g: GB, x: number, y: number, z: number) {
  b.box(0.06, 0.55, 0.06, [x, y + 0.35, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y + 0.1, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y - 0.22, z], '#2a2a2e');
  g.sph(0.15, [x, y - 0.06, z], '#ffd070', 1, 6);
}
function stripedAwning(b: GB, x0: number, x1: number, y: number, z: number, c1: string, c2: string) {
  const n = Math.round((x1 - x0) / 0.9);
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.box(w, 0.1, 1.7, [x0 + w * (i + 0.5), y, z], i % 2 ? c1 : c2, [0.42, 0, 0]);
  for (let i = 0; i < n; i++) b.box(w, 0.28, 0.06, [x0 + w * (i + 0.5), y - 0.62, z + 0.72], i % 2 ? c1 : c2);
}
function pole(b: GB, x: number, z: number, h: number, c = '#6e4b2b') { b.box(0.22, h, 0.22, [x, h / 2, z], c); }

function buildSupplies() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const cream = '#f3e6c6', blue = '#3f74d0', wood = '#6e4b2b';
  b.box(5.9, 0.6, 4.9, [0, 0.3, 0], '#9b9488');
  b.box(5.4, 2.8, 4.4, [0, 2.0, 0], cream, [0, 0, 0], [0.86, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 2.9, 0.3, [sx * 2.7, 2.05, sz * 2.2], wood);
  b.box(5.6, 0.25, 0.3, [0, 3.35, 2.22], wood); b.box(5.6, 0.2, 0.3, [0, 1.2, 2.22], wood);
  b.prism(6.9, 2.8, 5.7, [0, 3.35, 0], blue, [0, 0, 0], [0.78, 1.08]);
  b.box(0.3, 0.3, 5.8, [0, 6.15, 0], '#2c4f9a');
  b.box(0.18, 0.18, 5.9, [-3.4, 3.4, 0], wood, [0, 0, -0.78]); b.box(0.18, 0.18, 5.9, [3.4, 3.4, 0], wood, [0, 0, 0.78]);
  // alchemist tower
  b.cyl(1.15, 1.3, 5.0, 10, [-3.2, 2.5, -0.8], cream); b.cone(1.6, 2.6, 10, [-3.2, 6.3, -0.8], blue); b.octa(0.3, [-3.2, 7.8, -0.8], '#ffe14a');
  b.torus(1.2, 0.08, [-3.2, 4.4, -0.8], wood, [Math.PI / 2, 0, 0], 1, 12);
  g.cyl(0.4, 0.4, 0.1, 8, [-3.2, 3.6, 0.35], '#9ad8ff', [Math.PI / 2, 0, 0]);
  // door + round window
  b.box(1.2, 2.0, 0.2, [-1.4, 1.6, 2.25], '#5a3a1e'); b.cyl(0.6, 0.6, 0.2, 10, [-1.4, 2.6, 2.25], '#5a3a1e', [Math.PI / 2, 0, 0]);
  g.cyl(0.75, 0.75, 0.1, 12, [1.2, 2.7, 2.24], '#8fd2ff', [Math.PI / 2, 0, 0]); b.torus(0.78, 0.09, [1.2, 2.7, 2.27], wood, [0, 0, 0], 1, 12);
  stripedAwning(b, -2.6, 2.6, 3.2, 3.0, '#3f74d0', '#f4f4f4');
  pole(b, -2.6, 3.7, 2.8); pole(b, 2.6, 3.7, 2.8);
  // counter and bottles
  b.box(3.2, 0.95, 0.9, [0.9, 0.5, 3.1], wood); b.box(3.4, 0.12, 1.1, [0.9, 1.0, 3.1], '#b88556');
  const cols = ['#4ac0ff', '#ff5a6a', '#7aff7a', '#d08aff', '#ffd23a', '#4ac0ff', '#ff5a6a'];
  for (let i = 0; i < 7; i++) {
    const x = -0.3 + i * 0.45, h = 0.34 + (i % 3) * 0.1;
    g.cyl(0.14, 0.17, h, 7, [x, 1.06 + h / 2, 3.0 + (i % 2) * 0.2], cols[i]);
    b.cyl(0.06, 0.06, 0.18, 5, [x, 1.06 + h + 0.08, 3.0 + (i % 2) * 0.2], '#d8c6a0'); b.cyl(0.07, 0.07, 0.06, 5, [x, 1.06 + h + 0.2, 3.0 + (i % 2) * 0.2], '#8a5a30');
  }
  // cauldron
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; b.cyl(0.14, 0.14, 0.5, 5, [3.6 + Math.cos(a) * 0.65, 0.25, 2.4 + Math.sin(a) * 0.65], '#2a2a30'); }
  b.sph(0.95, [3.6, 1.05, 2.4], '#2f3139', [1, 0.8, 1], 10); b.torus(0.78, 0.12, [3.6, 1.6, 2.4], '#3d4048', [Math.PI / 2, 0, 0], 1, 14);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; b.box(0.12, 0.7, 0.12, [3.6 + Math.cos(a) * 0.4, 0.15, 2.4 + Math.sin(a) * 0.4], '#6e4b2b', [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]); }
  g.cone(0.22, 0.5, 5, [3.6, 0.35, 2.4], '#ff9a2a');
  // barrels, crates, mushrooms
  for (const [x, z] of [[-3.7, 2.9], [-4.3, 2.0]]) { b.cyl(0.5, 0.55, 0.9, 9, [x, 0.45, z], '#8a5a30'); b.cyl(0.56, 0.56, 0.08, 9, [x, 0.3, z], '#3a3a40'); b.cyl(0.56, 0.56, 0.08, 9, [x, 0.65, z], '#3a3a40'); }
  for (const [x, z, s] of [[2.0, -2.8, 1], [-1.2, -2.9, 0.7], [4.4, 0.4, 0.8]]) { b.cyl(0.14 * s, 0.18 * s, 0.7 * s, 6, [x, 0.35 * s, z], '#f1e6d0'); b.sph(0.55 * s, [x, 0.75 * s, z], '#e0443a', [1, 0.6, 1], 8); for (let k = 0; k < 4; k++) b.sph(0.1 * s, [x + Math.cos(k * 1.7) * 0.3 * s, 0.95 * s, z + Math.sin(k * 1.7) * 0.3 * s], '#fff', 1, 4); }
  lantern(b, g, -2.3, 2.9, 2.5); lantern(b, g, 3.0, 2.9, 2.0);
  // hanging herbs
  for (let i = 0; i < 4; i++) b.cone(0.12, 0.45, 5, [-2.2 + i * 0.5, 2.85, 2.6], i % 2 ? '#5aa03a' : '#8a6a3a', [Math.PI, 0, 0]);
  return { body: b.build(), glow: g.build() };
}

function buildBlacksmith() {
  const b = new GB([0.78, 1.08]), g = new GB([1, 1]);
  const stone = '#8f8b86', dark = '#4a3626', slate = '#4b5062', steel = '#aeb4be';
  b.box(5.9, 0.6, 4.9, [0, 0.3, 0], '#6f6c68');
  b.box(5.4, 2.9, 4.4, [0, 2.05, 0], stone, [0, 0, 0], [0.82, 1.05]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.34, 3.0, 0.34, [sx * 2.7, 2.1, sz * 2.2], dark);
  b.box(5.6, 0.3, 0.34, [0, 3.45, 2.22], dark);
  for (let i = 0; i < 9; i++) b.box(0.3, 0.2, 0.06, [-2.0 + (i % 5) * 0.9 + (Math.floor(i / 5) ? 0.45 : 0), 0.9 + Math.floor(i / 5) * 0.5 + (i > 8 ? 0.5 : 0), 2.24], '#a29d97');
  b.prism(6.8, 2.2, 5.6, [0, 3.55, 0], slate, [0, 0, 0], [0.8, 1.05]); b.box(0.3, 0.26, 5.7, [0, 5.75, 0], '#363a46');
  // canopy over the anvil
  b.box(5.2, 0.16, 2.4, [0, 3.35, 3.4], slate, [0.18, 0, 0]); pole(b, -2.5, 4.5, 3.0, dark); pole(b, 2.5, 4.5, 3.0, dark);
  // big chimney
  b.cyl(0.8, 1.0, 6.4, 8, [1.9, 4.4, -1.4], '#85796f'); b.cyl(1.05, 0.8, 0.5, 8, [1.9, 7.8, -1.4], '#5e554d');
  for (let i = 0; i < 4; i++) b.torus(0.92 - i * 0.03, 0.05, [1.9, 2.2 + i * 1.3, -1.4], '#5e554d', [Math.PI / 2, 0, 0], 1, 8);
  // door and window
  b.box(1.3, 2.1, 0.2, [-1.6, 1.65, 2.25], '#3e2c1e'); b.box(0.12, 2.1, 0.22, [-1.6, 1.65, 2.27], '#2a2a2e'); for (let i = 0; i < 3; i++) b.box(1.3, 0.1, 0.22, [-1.6, 0.9 + i * 0.7, 2.27], '#2a2a2e');
  g.box(0.9, 0.9, 0.1, [1.4, 2.5, 2.23], '#ffb04a'); b.box(1.15, 0.12, 0.2, [1.4, 3.0, 2.25], dark); b.box(1.15, 0.12, 0.2, [1.4, 2.0, 2.25], dark);
  // furnace outside right
  b.box(2.0, 1.7, 1.5, [3.5, 0.95, 1.2], '#7d756d'); b.box(2.2, 0.25, 1.7, [3.5, 1.9, 1.2], '#5e554d');
  b.box(1.1, 0.9, 0.2, [3.5, 0.9, 2.0], '#1c1a1a'); g.box(0.85, 0.65, 0.12, [3.5, 0.85, 2.05], '#ff7a1a'); g.box(0.5, 0.4, 0.14, [3.5, 0.8, 2.08], '#ffe060');
  b.cyl(0.3, 0.4, 2.0, 7, [3.5, 3.0, 1.0], '#6f665d');
  // anvil on stump
  b.cyl(0.55, 0.65, 0.75, 9, [-0.6, 0.38, 3.5], '#6a4828');
  b.box(0.9, 0.32, 0.5, [-0.6, 0.95, 3.5], steel); b.box(0.6, 0.3, 0.38, [-0.6, 0.72, 3.5], '#7c828c'); b.cone(0.22, 0.6, 5, [0.2, 0.98, 3.5], steel, [0, 0, -Math.PI / 2]); b.box(0.5, 0.1, 0.5, [-0.6, 1.14, 3.5], '#c4cad4');
  g.box(0.7, 0.05, 0.1, [-0.7, 1.2, 3.5], '#ff8a2a', [0, 0.3, 0]);
  b.box(0.1, 0.9, 0.1, [0.3, 0.55, 4.0], '#6a4828', [0.1, 0, 0.5]); b.box(0.35, 0.22, 0.22, [0.45, 0.95, 4.0], '#6e7480', [0.1, 0, 0.5]);
  // weapon rack on left wall
  b.box(0.12, 1.8, 2.0, [-2.78, 1.9, 0.4], dark);
  for (let i = 0; i < 3; i++) { b.box(0.08, 1.2, 0.12, [-2.88, 2.0, -0.2 + i * 0.6], steel); b.box(0.1, 0.1, 0.34, [-2.88, 1.35, -0.2 + i * 0.6], '#8a5a30'); }
  b.cyl(0.5, 0.5, 0.1, 10, [-2.9, 2.9, 1.2], '#b83a3a', [0, 0, Math.PI / 2]); b.sph(0.12, [-2.96, 2.9, 1.2], steel, 1, 5);
  // grindstone + water barrel + coal
  b.box(0.12, 0.9, 0.12, [-3.9, 0.45, 2.0], dark); b.box(0.12, 0.9, 0.12, [-3.9, 0.45, 3.0], dark); b.cyl(0.55, 0.55, 0.3, 12, [-3.9, 1.0, 2.5], '#a9a49e', [0, 0, Math.PI / 2]);
  b.cyl(0.5, 0.55, 0.95, 9, [-3.7, 0.48, 0.8], '#6a4828'); b.cyl(0.46, 0.46, 0.04, 9, [-3.7, 0.92, 0.8], '#3a6a9a');
  for (let i = 0; i < 6; i++) b.ico(0.16, [3.4 + Math.cos(i * 2.1) * 0.5, 0.12, 3.1 + Math.sin(i * 2.1) * 0.4], '#2a2626');
  g.ico(0.12, [3.45, 0.15, 3.1], '#ff7a1a'); g.ico(0.1, [3.2, 0.14, 3.3], '#ffb040');
  lantern(b, g, -2.2, 3.0, 2.6); lantern(b, g, 2.4, 3.0, 4.4);
  return { body: b.build(), glow: g.build() };
}

function buildPets() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const plank = '#b98a52', trim = '#f1e6d0', thatch = '#d6b052', dthatch = '#b58d38', wood = '#6e4b2b', hay = '#e6c85e';
  b.box(5.9, 0.5, 4.9, [0, 0.25, 0], '#7b5a38');
  b.box(5.5, 2.9, 4.5, [0, 1.95, 0], plank, [0, 0, 0], [0.85, 1.05]);
  for (let i = 0; i < 12; i++) b.box(0.06, 2.8, 0.05, [-2.4 + i * 0.44, 1.95, 2.27], '#8f6838');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 3.0, 0.3, [sx * 2.75, 2.0, sz * 2.25], trim);
  b.box(5.7, 0.2, 0.3, [0, 3.45, 2.28], trim);
  b.prism(7.1, 3.1, 5.9, [0, 3.4, 0], thatch, [0, 0, 0], [0.78, 1.08]);
  for (let i = 0; i < 4; i++) b.box(0.07, 0.12, 6.0, [-2.6 + i * 0.35 + 0.0, 3.8 + i * 0.55, 0], dthatch, [0, 0, 0.0]);
  b.box(0.3, 0.3, 6.0, [0, 6.55, 0], dthatch);
  // big barn doors
  b.box(2.5, 2.3, 0.2, [-0.9, 1.65, 2.3], '#27190f'); b.box(1.15, 2.3, 0.14, [-1.75, 1.65, 2.5], '#9a6a38', [0, -0.7, 0]); b.box(1.15, 2.3, 0.14, [0.0, 1.65, 2.5], '#9a6a38', [0, 0.7, 0]);
  b.box(2.7, 0.18, 0.26, [-0.9, 2.9, 2.35], trim); b.box(0.2, 2.5, 0.26, [-2.2, 1.7, 2.35], trim); b.box(0.2, 2.5, 0.26, [0.4, 1.7, 2.35], trim);
  // hay loft window
  g.box(0.9, 0.9, 0.1, [1.5, 3.4, 2.3], '#ffd88a'); b.box(1.1, 0.14, 0.2, [1.5, 3.9, 2.3], trim); b.box(1.1, 0.14, 0.2, [1.5, 2.9, 2.3], trim); b.box(0.14, 1.0, 0.2, [1.5, 3.4, 2.3], trim);
  g.box(0.9, 0.9, 0.1, [1.5, 1.7, 2.3], '#ffd88a');
  // hay bales
  const bale = (x: number, y: number, z: number, r = 0) => { b.box(1.0, 0.6, 0.7, [x, y, z], hay, [0, r, 0]); b.box(1.02, 0.06, 0.72, [x, y, z], '#8a6a2a', [0, r, 0]); };
  bale(3.6, 0.3, 1.0); bale(3.6, 0.3, 2.1, 0.1); bale(3.5, 0.9, 1.5, 0.3); bale(-3.6, 0.3, 2.9, 0.4);
  // pen on right
  for (let i = 0; i < 6; i++) { const z = -2 + i * 1.0; pole(b, 4.9, z, 1.1, wood); }
  b.box(0.1, 0.12, 5.2, [4.9, 0.45, 0.5], wood); b.box(0.1, 0.12, 5.2, [4.9, 0.85, 0.5], wood);
  b.box(2.6, 0.12, 0.1, [3.6, 0.45, -2.1], wood); b.box(2.6, 0.12, 0.1, [3.6, 0.85, -2.1], wood);
  b.cyl(0.55, 0.6, 0.18, 10, [4.0, 0.1, -0.8], '#d94a5a'); b.cyl(0.4, 0.4, 0.2, 10, [4.0, 0.2, -0.8], '#c43a4a');
  b.cyl(0.4, 0.5, 0.2, 10, [3.9, 0.1, 0.3], '#4a8fd9');
  // trough
  b.box(1.5, 0.4, 0.55, [-3.7, 0.3, -1.4], wood); b.box(1.3, 0.05, 0.4, [-3.7, 0.52, -1.4], '#4a8fd9');
  // weather vane
  b.cyl(0.04, 0.04, 1.2, 4, [0, 7.1, 0], '#333'); b.box(1.1, 0.14, 0.05, [0, 7.6, 0], '#d94a2a'); b.cone(0.18, 0.4, 4, [0.6, 7.6, 0], '#d94a2a', [0, 0, -Math.PI / 2]);
  lantern(b, g, -2.3, 3.0, 2.7); lantern(b, g, 1.9, 3.0, 2.7);
  // flowers
  for (let i = 0; i < 6; i++) { b.sph(0.12, [-2.2 + i * 0.35, 0.3, 2.9], ['#ff7aa8', '#ffe14a', '#fff', '#9ac8ff'][i % 4], 1, 5); }
  return { body: b.build(), glow: g.build() };
}

const BUILD: Record<ShopType, () => { body: any; glow: any }> = { SUPPLIES: buildSupplies, BLACKSMITH: buildBlacksmith, PETS: buildPets };
const TITLES: Record<ShopType, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet Stable' };
type NpcCfg = { key: CharKey; tint: string; pos: [number, number] };
/** Shop-local door the keeper runs to when the siege starts. */
const DOOR: Record<ShopType, [number, number]> = { SUPPLIES: [-1.4, 2.6], BLACKSMITH: [-1.6, 2.6], PETS: [-0.9, 2.7] };
const NPC: Record<ShopType, NpcCfg> = {
  SUPPLIES: { key: 'ROGUE', tint: '#ffffff', pos: [2.4, 4.7] },
  BLACKSMITH: { key: 'KNIGHT', tint: '#ffffff', pos: [1.6, 4.9] },
  PETS: { key: 'ROGUE', tint: '#bfffcf', pos: [2.2, 4.7] },
};

// -------------------------------------------------------------------- signs ---
function buildSign(type: ShopType, color: string) {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  b.box(2.0, 1.3, 0.16, [0, 0, 0], '#7a5230'); b.box(1.75, 1.05, 0.18, [0, 0, 0.01], '#e8d3a3');
  b.box(2.06, 0.1, 0.2, [0, 0.64, 0], '#4a3020'); b.box(2.06, 0.1, 0.2, [0, -0.64, 0], '#4a3020');
  b.cyl(0.015, 0.015, 0.5, 4, [-0.8, 0.9, 0], '#555'); b.cyl(0.015, 0.015, 0.5, 4, [0.8, 0.9, 0], '#555');
  if (type === 'SUPPLIES') {
    g.sph(0.3, [0, -0.1, 0.16], '#3fa8ff', [1, 1, 0.5], 8); g.cyl(0.1, 0.12, 0.32, 6, [0, 0.28, 0.16], '#8fd2ff');
    b.cyl(0.11, 0.11, 0.08, 6, [0, 0.47, 0.16], '#8a5a30');
    g.sph(0.06, [-0.1, 0.0, 0.3], '#ffffff', 1, 4);
  } else if (type === 'BLACKSMITH') {
    b.box(0.7, 0.2, 0.2, [0, -0.1, 0.17], '#555b66'); b.box(0.45, 0.22, 0.2, [0, -0.28, 0.17], '#555b66'); b.cone(0.12, 0.35, 4, [0.5, -0.04, 0.17], '#6e7480', [0, 0, -Math.PI / 2]);
    b.box(0.08, 0.7, 0.08, [-0.3, 0.2, 0.2], '#6a4828', [0, 0, 0.6]); b.box(0.3, 0.2, 0.14, [-0.4, 0.45, 0.2], '#888e98', [0, 0, 0.6]);
    g.box(0.5, 0.04, 0.06, [0, 0.03, 0.28], '#ff8a2a');
  } else {
    g.sph(0.2, [0, -0.15, 0.16], '#2fd29a', [1.2, 1, 0.45], 7);
    for (const [x, y] of [[-0.3, 0.1], [-0.12, 0.28], [0.12, 0.28], [0.3, 0.1]]) g.sph(0.1, [x, y, 0.16], '#2fd29a', [1, 1.2, 0.45], 6);
  }
  const c = new Color(color);
  b.box(1.9, 0.06, 0.2, [0, 0.58, 0.02], '#' + c.getHexString());
  return { body: b.build(), glow: g.build() };
}

// ---------------------------------------------------------------------- NPC ---
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** `closed` is 0..1 (siege progress): the NPC runs to `door` and vanishes inside, and comes back out on reopen. */
function Shopkeeper({ cfg, door, near, closed, onOpen }: { cfg: NpcCfg; door: [number, number]; near: React.MutableRefObject<boolean>; closed: React.MutableRefObject<number>; onOpen: () => void }) {
  const ch = useCharacterInstance(cfg.key);
  const clips = useClips();
  const group = useRef<Group>(null!);
  const st = useRef({ mixer: null as AnimationMixer | null, interact: null as AnimationAction | null, run: null as AnimationAction | null, idle: null as AnimationAction | null, wasNear: false, yaw: 0, prevK: 0, runW: 0 });
  useEffect(() => {
    const m = new AnimationMixer(ch.root);
    const idle = m.clipAction(clips['Idle_A'] || clips['Idle_B']);
    idle.play(); idle.time = Math.random() * 2;
    const run = clips['Running_A'] ? m.clipAction(clips['Running_A']) : null;
    if (run) { run.setEffectiveWeight(0); run.play(); }
    const it = clips['Interact'] ? m.clipAction(clips['Interact']) : null;
    if (it) { it.setLoop(LoopOnce, 1); it.clampWhenFinished = false; }
    const tint = new Color(cfg.tint);
    ch.mats.forEach((mt: any) => mt.color && mt.color.copy(tint));
    st.current.mixer = m; st.current.interact = it; st.current.run = run; st.current.idle = idle;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); };
  }, [ch, clips, cfg.tint]);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05), s = st.current;
    s.mixer?.update(dt);
    const g = group.current; if (!g) return;
    const k = closed.current;
    const e = smooth(k);
    g.visible = k < 0.985;
    g.position.set(cfg.pos[0] + (door[0] - cfg.pos[0]) * e, 0, cfg.pos[1] + (door[1] - cfg.pos[1]) * e);
    const moving = Math.abs(k - s.prevK) > 1e-4 && k > 0.01 && k < 0.99;
    const dk = k - s.prevK;
    s.prevK = k;
    s.runW += ((moving ? 1 : 0) - s.runW) * Math.min(1, dt * 12);
    s.run?.setEffectiveWeight(s.runW); s.idle?.setEffectiveWeight(1 - s.runW + 1e-3);
    if (near.current && !s.wasNear && s.interact) { s.interact.reset().setEffectiveWeight(3).play(); }
    s.wasNear = near.current;
    const wp = g.parent!.position;
    let target = s.yaw;
    if (moving) target = Math.atan2((dk > 0 ? door[0] - cfg.pos[0] : cfg.pos[0] - door[0]), (dk > 0 ? door[1] - cfg.pos[1] : cfg.pos[1] - door[1]));
    else if (near.current) target = Math.atan2(world.player.pos.x - (wp.x + g.position.x), world.player.pos.z - (wp.z + g.position.z));
    s.yaw = angleLerp(s.yaw, target, 1 - Math.exp(-8 * dt));
    g.rotation.y = s.yaw;
  });
  return (
    <group ref={group} position={[cfg.pos[0], 0, cfg.pos[1]]}>
      <primitive object={ch.root} />
      <mesh position={[0, 1.1, 0]} onClick={(e) => { e.stopPropagation(); onOpen(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <cylinderGeometry args={[0.7, 0.7, 2.4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Wooden boards that drop over the shop front during the siege, plus a CLOSED sign. */
const boardMat = new MeshStandardMaterial({ color: '#7a5230', flatShading: true, roughness: 0.9 });
const boardMat2 = new MeshStandardMaterial({ color: '#5e3d22', flatShading: true, roughness: 0.9 });
function Shutters({ k }: { k: React.MutableRefObject<number> }) {
  const grp = useRef<Group>(null!), cross = useRef<Group>(null!), sign = useRef<Sprite>(null!);
  const closedLabel = useMemo(() => labelMaterial('CLOSED', '#ff8a7a', { size: 64 }), []);
  useFrame(() => {
    const e = smooth(k.current);
    if (grp.current) { grp.current.visible = e > 0.01; grp.current.scale.y = Math.max(0.001, e); }
    if (cross.current) cross.current.visible = e > 0.9;
    if (sign.current) { sign.current.visible = e > 0.75; sign.current.position.y = 2.1; }
  });
  return (
    <>
      <group ref={grp} position={[0, 3.5, 2.55]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[0, -0.28 - i * 0.56, 0]} material={i % 2 ? boardMat : boardMat2} castShadow><boxGeometry args={[5.2, 0.52, 0.14]} /></mesh>
        ))}
      </group>
      <group ref={cross} position={[0, 2.0, 2.68]}>
        <mesh rotation={[0, 0, 0.55]} material={boardMat}><boxGeometry args={[5.6, 0.3, 0.12]} /></mesh>
        <mesh rotation={[0, 0, -0.55]} material={boardMat}><boxGeometry args={[5.6, 0.3, 0.12]} /></mesh>
      </group>
      <sprite ref={sign} material={closedLabel.mat} position={[0, 2.1, 3.0]} scale={[closedLabel.aspect * 0.95, 0.95, 1]} />
    </>
  );
}

// --------------------------------------------------------------------- shop ---
const ringGeo1 = new RingGeometry(4.6, 5.05, 72), ringGeo2 = new RingGeometry(5.25, 5.4, 72);

function Shop({ type, position, color, q }: { type: ShopType; position: number[]; color: string; q: QualityCfg }) {
  const geos = useMemo(() => BUILD[type](), [type]);
  const sign = useMemo(() => buildSign(type, color), [type, color]);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    ring2: new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    liquid: new MeshBasicMaterial({ color: new Color(0.6, 2.0, 0.7), toneMapped: false }),
  }), [color]);
  const label = useMemo(() => labelMaterial(TITLES[type], color === '#3b82f6' ? '#9fd0ff' : color === '#ef4444' ? '#ffb0a0' : '#9ff0d0', { size: 64 }), [type, color]);
  const near = useRef(false);
  const closedK = useRef(0);
  const ringRef = useRef<Group>(null!), signRef = useRef<Group>(null!), titleRef = useRef<Sprite>(null!), light = useRef<PointLight>(null!), liquid = useRef<Mesh>(null!);
  const rot = useRef(0);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.PLAYING || (st === GameStatus.MENU && !isLobbyStatus(st))) useGameStore.getState().openSpecificShop(type);
  };

  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += ((world.village.shopsClosed && !lobby ? 1 : 0) - closedK.current) * Math.min(1, dt * 2.2);
    if (closedK.current > 0.999) closedK.current = 1; else if (closedK.current < 0.001) closedK.current = 0;
    const closed = closedK.current > 0.5;
    const dx = world.player.pos.x - px, dz = world.player.pos.z - pz;
    const d = Math.hypot(dx, dz);
    near.current = !lobby && !closed && d < 6;
    // ring
    rot.current += dt * (near.current ? 1.2 : 0.3);
    const pulse = 0.5 + 0.5 * Math.sin(t * (near.current ? 5 : 1.6));
    mats.ring.opacity = near.current ? 0.55 + 0.4 * pulse : 0.2 + 0.1 * pulse;
    mats.ring2.opacity = near.current ? 0.4 + 0.3 * pulse : 0.12;
    if (ringRef.current) { ringRef.current.visible = false; ringRef.current.rotation.y = rot.current; const s = near.current ? 1 + pulse * 0.04 : 1; ringRef.current.scale.set(s, 1, s); }
    if (signRef.current) signRef.current.rotation.z = Math.sin(t * 1.3 + px) * 0.05;
    if (titleRef.current) titleRef.current.position.y = 9.4 + Math.sin(t * 1.5 + pz) * 0.18;
    if (light.current) light.current.intensity = 14 + Math.sin(t * 9 + px) * 2 + Math.sin(t * 17) * 1.2;
    if (liquid.current) { const k = 1.4 + Math.sin(t * 4) * 0.35; mats.liquid.color.setRGB(0.5 * k, 1.8 * k, 0.6 * k); liquid.current.scale.y = 1 + Math.sin(t * 6) * 0.15; }
    // ambient emitters only when nearby (and not paused)
    if (d < 55 && useGameStore.getState().status !== GameStatus.PAUSED) {
      if (type === 'SUPPLIES' && Math.random() < dt * 6) {
        const a = Math.random() * TAU, r = Math.random() * 0.55;
        FX.add.emit(px + 3.6 + Math.cos(a) * r, 1.6, pz + 2.4 + Math.sin(a) * r, 0, 1.6, 0, 1.0, 0.18, 0.3, 0.6, 2.0, 0.7, 0.8, CELL.RING, 0, 0.5);
        if (Math.random() < 0.4) FX.add.emit(px + 3.6 + (Math.random() - 0.5) * 0.8, 1.7, pz + 2.4 + (Math.random() - 0.5) * 0.8, 0, 2.2, 0, 1.6, 0.12, 0.02, 0.7, 2.0, 0.8, 0.9, CELL.DISC, -0.3, 0.2);
      } else if (type === 'BLACKSMITH') {
        if (Math.random() < dt * 5) smokePuff(px + 1.9, 8.1, pz - 1.4, 1, 0x6b6560, 1.8, 3.2, 1.4, 0.3, 0.5);
        if (Math.random() < dt * 4) embers(px + 3.5, 1.2, pz + 2.1, 1, 0xff8a2a, 0.3, 2.2, 0.9, 0.15);
        if (Math.random() < dt * 1.2) embers(px - 0.6, 1.3, pz + 3.5, 3, 0xffb040, 0.2, 2.5, 0.5, 0.1);
      } else if (type === 'PETS' && Math.random() < dt * 1.5) {
        FX.add.emit(px - 0.9 + (Math.random() - 0.5) * 2, 2.6, pz + 3 + Math.random(), 0, 0.9, 0, 1.6, 0.35, 0.3, 0.5, 2.0, 1.1, 0.9, CELL.PLUS, 0, 0.1);
      }
    }
  });

  const hover = (on: boolean) => { document.body.style.cursor = on ? 'pointer' : ''; mats.ring2.color.set(on ? '#ffffff' : color); };
  const labelW = label.aspect * 1.0;
  return (
    <group position={[px, 0, pz]}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      {type === 'SUPPLIES' && <mesh ref={liquid} material={mats.liquid} position={[3.6, 1.55, 2.4]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.72, 12]} /></mesh>}
      <group position={[-3.4, 0, 3.9]}>
        <mesh position={[0, 2.0, 0]} castShadow><boxGeometry args={[0.22, 4.0, 0.22]} /><meshStandardMaterial color="#6e4b2b" flatShading /></mesh>
        <mesh position={[0.9, 3.85, 0]} castShadow><boxGeometry args={[1.9, 0.16, 0.16]} /><meshStandardMaterial color="#6e4b2b" flatShading /></mesh>
        <group ref={signRef} position={[1.2, 3.0, 0]}>
          <mesh geometry={sign.body} material={mats.lit} position={[0, -0.0, 0]} castShadow />
          <mesh geometry={sign.glow} material={mats.glow} />
        </group>
      </group>
      <group ref={ringRef} position={[0, 0.07, 0]}>
        <mesh geometry={ringGeo1} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} />
        <mesh geometry={ringGeo2} material={mats.ring2} rotation={[-Math.PI / 2, 0, 0]} />
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[Math.cos((i / 12) * TAU) * 5.32, 0.02, Math.sin((i / 12) * TAU) * 5.32]} rotation={[-Math.PI / 2, 0, -(i / 12) * TAU]}>
            <circleGeometry args={[0.2, 3]} /><primitive object={mats.ring2} attach="material" />
          </mesh>
        ))}
      </group>
      <sprite ref={titleRef} material={label.mat} position={[0, 9.4, 1]} scale={[labelW, 1.0, 1]} />
      <Shopkeeper cfg={NPC[type]} door={DOOR[type]} near={near} closed={closedK} onOpen={open} />
      <Shutters k={closedK} />
      <mesh position={[0, 2.8, 0.2]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <boxGeometry args={[7, 5.6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {q.lights && <pointLight ref={light} position={[0, 3.6, 4.2]} color="#ffc47a" distance={14} decay={1.6} intensity={14} />}
    </group>
  );
}

// -------------------------------------------------------------- quest board ---
function buildBoard() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  const wood = '#6e4b2b', paper = '#eadbb2';
  b.box(0.22, 3.0, 0.22, [-1.2, 1.5, 0], wood); b.box(0.22, 3.0, 0.22, [1.2, 1.5, 0], wood);
  b.box(2.9, 1.8, 0.18, [0, 2.0, 0.02], '#8a5a30'); b.box(3.1, 0.14, 0.26, [0, 2.95, 0.02], '#4a3020'); b.box(3.1, 0.14, 0.26, [0, 1.08, 0.02], '#4a3020');
  b.prism(3.5, 0.7, 0.9, [0, 3.0, 0], '#4b4b60', [0, 0, 0], [0.9, 1]);
  for (const [x, y, r] of [[-0.8, 2.3, 0.1], [0.1, 2.5, -0.08], [0.85, 2.2, 0.06], [-0.2, 1.75, 0.04]] as number[][]) { b.box(0.62, 0.78, 0.04, [x, y, 0.14], paper, [0, 0, r]); g.sph(0.05, [x, y + 0.3, 0.18], '#e33a3a', 1, 4); }
  b.box(0.6, 0.3, 0.5, [1.9, 0.15, 0.6], '#8a5a30'); b.cyl(0.4, 0.45, 0.8, 8, [-1.9, 0.4, 0.7], '#7a4a28');
  g.sph(0.12, [-1.35, 2.9, 0.2], '#ffd070', 1, 6); g.sph(0.12, [1.35, 2.9, 0.2], '#ffd070', 1, 6);
  return { body: b.build(), glow: g.build() };
}
const questNpc: NpcCfg = { key: 'KNIGHT', tint: '#ffd9a0', pos: [2.9, 1.3] };

function QuestBoard() {
  const geos = useMemo(() => buildBoard(), []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }) }), []);
  const label = useMemo(() => labelMaterial('Quest Board', '#ffe69a', { size: 60 }), []);
  const mark = useMemo(() => labelMaterial('!', '#ffd24a', { size: 120 }), []);
  const near = useRef(false), k = useRef(0);
  const markRef = useRef<Sprite>(null!), titleRef = useRef<Sprite>(null!);
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.PLAYING || (st === GameStatus.MENU && !isLobbyStatus(st))) useGameStore.getState().openSpecificShop('QUESTS');
  };
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    k.current += ((world.village.shopsClosed && !lobby ? 1 : 0) - k.current) * Math.min(1, dt * 2.2);
    if (k.current > 0.999) k.current = 1; else if (k.current < 0.001) k.current = 0;
    near.current = !lobby && k.current < 0.5 && Math.hypot(world.player.pos.x - QUEST_POS[0], world.player.pos.z - QUEST_POS[2]) < 6;
    const claimable = k.current < 0.5 && useGameStore.getState().quests.some(questDone);
    if (markRef.current) { markRef.current.visible = claimable; markRef.current.position.y = 5.3 + Math.sin(t * 3.4) * 0.25; const sc = 1.5 + Math.sin(t * 6) * 0.1; markRef.current.scale.set(sc * mark.aspect, sc, 1); }
    if (titleRef.current) titleRef.current.visible = k.current < 0.5;
  });
  const hover = (on: boolean) => { document.body.style.cursor = on ? 'pointer' : ''; };
  return (
    <group position={QUEST_POS}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      <sprite ref={titleRef} material={label.mat} position={[0, 4.4, 0.5]} scale={[label.aspect * 0.8, 0.8, 1]} />
      <sprite ref={markRef} material={mark.mat} position={[0, 5.3, 0.5]} scale={[1.5, 1.5, 1]} visible={false} />
      <Shopkeeper cfg={questNpc} door={questNpc.pos} near={near} closed={k} onOpen={open} />
      <mesh position={[0, 1.8, 0.4]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <boxGeometry args={[3.4, 3.6, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------- shrine + skill trainer ---
function buildShrine() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  b.cyl(2.0, 2.3, 0.35, 10, [0, 0.17, 0], '#6d6a76'); b.cyl(1.5, 1.7, 0.35, 10, [0, 0.52, 0], '#85828f'); b.cyl(0.9, 1.1, 1.0, 8, [0, 1.2, 0], '#9d9aa8'); b.cyl(1.15, 0.95, 0.2, 8, [0, 1.8, 0], '#b4b1c0');
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; b.box(0.35, 2.6, 0.35, [Math.cos(a) * 2.9, 1.3, Math.sin(a) * 2.9], '#7a7784'); g.octa(0.16, [Math.cos(a) * 2.9, 2.85, Math.sin(a) * 2.9], '#c58bff'); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.box(0.12, 0.05, 0.3, [Math.cos(a) * 1.25, 0.72, Math.sin(a) * 1.25], '#e9b949', [0, -a, 0]); }
  return { body: b.build(), glow: g.build() };
}
function buildTrainer() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  const wood = '#7a5230', dark = '#4a3020';
  // dummy
  b.box(0.22, 2.0, 0.22, [0, 1.0, 0], wood); b.cyl(0.34, 0.4, 1.0, 8, [0, 1.7, 0], '#c9a96a'); b.box(1.5, 0.2, 0.2, [0, 1.95, 0], wood); b.sph(0.3, [0, 2.55, 0], '#d9bd82', 1, 8);
  b.cyl(0.8, 0.9, 0.2, 8, [0, 0.1, 0], '#6a6358'); b.box(0.5, 0.06, 0.5, [0, 1.35, 0.3], '#a33', [0, 0.4, 0]);
  // weapon rack
  b.box(0.2, 2.4, 0.2, [2.8, 1.2, 0.4], dark); b.box(0.2, 2.4, 0.2, [4.6, 1.2, 0.4], dark); b.box(2.0, 0.16, 0.2, [3.7, 2.0, 0.4], dark); b.box(2.0, 0.16, 0.2, [3.7, 1.2, 0.4], dark);
  for (let i = 0; i < 3; i++) { b.box(0.1, 1.9, 0.08, [3.15 + i * 0.5, 1.7, 0.55], '#b8bcc6', [0, 0, 0.1 - i * 0.08]); b.box(0.36, 0.08, 0.1, [3.15 + i * 0.5, 0.95, 0.55], '#6b4a2a'); }
  b.cyl(0.55, 0.5, 0.2, 8, [3.7, 0.1, 1.3], '#6a6358');
  // banner
  b.box(0.18, 4.2, 0.18, [-3.4, 2.1, 0], dark); b.box(1.8, 0.14, 0.14, [-2.55, 4.0, 0], dark); b.box(1.5, 2.2, 0.06, [-2.55, 2.85, 0], '#b3342a'); b.tri([-3.3, 1.75, 0.03], [-1.8, 1.75, 0.03], [-2.55, 1.2, 0.03], '#b3342a');
  g.sph(0.14, [-3.4, 4.3, 0], '#ffd070', 1, 6); g.box(0.8, 0.1, 0.02, [-2.55, 3.1, 0.06], '#ffd070'); g.box(0.1, 0.8, 0.02, [-2.55, 3.1, 0.06], '#ffd070');
  return { body: b.build(), glow: g.build() };
}

function Station({ kind, position }: { kind: 'SHRINE' | 'TRAINER'; position: [number, number, number] }) {
  const shrine = kind === 'SHRINE';
  const geos = useMemo(() => (shrine ? buildShrine() : buildTrainer()), [shrine]);
  const col = shrine ? '#b57cff' : '#ffb04a';
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    ring2: new MeshBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    crystal: new MeshBasicMaterial({ color: new Color(1.8, 0.9, 2.6), toneMapped: false }),
    rune: new MeshBasicMaterial({ color: new Color(2.2, 1.6, 0.5), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), [col]);
  const label = useMemo(() => labelMaterial(shrine ? 'Summoning Shrine' : 'Skill Trainer', shrine ? '#d9b8ff' : '#ffd9a0', { size: 60 }), [shrine]);
  const sp = useGameStore((s) => s.skillPoints);
  const spLabel = useMemo(() => (sp > 0 ? labelMaterial(`${sp} SP to spend!`, '#7dffb0', { size: 56 }) : null), [sp]);
  const near = useRef(false), closedK = useRef(0), rot = useRef(0);
  const ringRef = useRef<Group>(null!), crystalRef = useRef<Mesh>(null!), runeRef = useRef<Mesh>(null!), titleRef = useRef<Sprite>(null!), spRef = useRef<Sprite>(null!);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.PLAYING || (st === GameStatus.MENU && !isLobbyStatus(st))) useGameStore.getState().openSpecificShop(shrine ? 'SUMMON' : 'SKILLS');
  };
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += ((world.village.shopsClosed && !lobby ? 1 : 0) - closedK.current) * Math.min(1, dt * 2.2);
    const closed = closedK.current > 0.5;
    const d = Math.hypot(world.player.pos.x - px, world.player.pos.z - pz);
    near.current = !lobby && !closed && d < 6;
    rot.current += dt * (near.current ? 1.2 : 0.3);
    const pulse = 0.5 + 0.5 * Math.sin(t * (near.current ? 5 : 1.6));
    mats.ring.opacity = near.current ? 0.55 + 0.4 * pulse : 0.2 + 0.1 * pulse;
    mats.ring2.opacity = near.current ? 0.4 + 0.3 * pulse : 0.12;
    if (ringRef.current) { ringRef.current.visible = false; ringRef.current.rotation.y = rot.current; }
    if (titleRef.current) titleRef.current.visible = !closed;
    if (spRef.current) { spRef.current.visible = !closed; spRef.current.position.y = 6.6 + Math.sin(t * 2.4) * 0.2; }
    if (shrine) {
      if (crystalRef.current) { crystalRef.current.position.y = 3.3 + Math.sin(t * 1.6) * 0.25; crystalRef.current.rotation.y = t * 0.9; mats.crystal.color.setRGB(1.6 + Math.sin(t * 2) * 0.3, 0.9 + Math.sin(t * 2.7) * 0.25, 2.4); }
      if (runeRef.current) { runeRef.current.rotation.z = -t * 0.4; mats.rune.opacity = 0.35 + 0.3 * pulse; }
      if (d < 55 && status !== GameStatus.PAUSED && Math.random() < dt * 4) {
        const a = Math.random() * TAU, r = 0.5 + Math.random() * 0.9, gold = Math.random() < 0.5;
        FX.add.emit(px + Math.cos(a) * r, 2.0, pz + Math.sin(a) * r, 0, 0.7, 0, 2.4, 0.16, 0.02, gold ? 2.2 : 1.4, gold ? 1.6 : 0.6, gold ? 0.4 : 2.2, 0.8, CELL.GLOW);
      }
    }
  });
  const hover = (on: boolean) => { document.body.style.cursor = on ? 'pointer' : ''; mats.ring2.color.set(on ? '#ffffff' : col); };
  return (
    <group position={position}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      {shrine && <>
        <mesh ref={crystalRef} material={mats.crystal} position={[0, 3.3, 0]} scale={[0.6, 1.0, 0.6]}><octahedronGeometry args={[0.8, 0]} /></mesh>
        <mesh ref={runeRef} material={mats.rune} position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.55, 8]} /></mesh>
        {q_light(col)}
      </>}
      <group ref={ringRef} position={[0, 0.07, 0]}>
        <mesh geometry={ringGeo1} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} scale={0.8} />
        <mesh geometry={ringGeo2} material={mats.ring2} rotation={[-Math.PI / 2, 0, 0]} scale={0.8} />
      </group>
      <sprite ref={titleRef} material={label.mat} position={[0, shrine ? 5.4 : 5.2, 0]} scale={[label.aspect * 0.85, 0.85, 1]} />
      {spLabel && !shrine && <sprite ref={spRef} material={spLabel.mat} position={[0, 6.6, 0]} scale={[spLabel.aspect * 0.8, 0.8, 1]} />}
      <mesh position={[shrine ? 0 : 1.2, 1.8, 0.4]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <boxGeometry args={shrine ? [5, 4, 5] : [9, 4, 3.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
const q_light = (c: string) => <pointLight position={[0, 3, 0]} color={c} distance={12} decay={1.6} intensity={10} />;

export function Town({ q }: { q: QualityCfg }) {
  // houses / stalls / gate / NPCs / animals: only in the peaceful village (and behind the title screen)
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  return (
    <>
      {village && <TownScenery q={q} />}
      {village && <Npcs />}
      {SHOP_POSITIONS.map((s) => <Shop key={s.type} type={s.type as ShopType} position={s.position} color={s.color} q={q} />)}
      <QuestBoard />
      <Station kind="SHRINE" position={SHRINE_POS} />
      <Station kind="TRAINER" position={TRAINER_POS} />
    </>
  );
}
export const __builders = { buildSupplies, buildBlacksmith, buildPets, buildSign };
