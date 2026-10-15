// The three shops: procedural buildings, signs, shopkeepers, interaction rings, ambient FX.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, Color, DoubleSide, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, RingGeometry, Sprite,
} from 'three';
import { SHOP_TAB, SHOP_POSITIONS } from '../constants';
import { world, QUEST_POS, TRAINER_POS } from '../engine/world';
import { isLobbyStatus } from './CameraRig';
import { questDone } from '../quests';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { canTrainSkill, canBuyTalent, canCraftAny } from '../ui/lib/alerts';
import { CELL, FX, embers, smokePuff } from './fx';
import { GB, glowMat, litMat, TAU, angleLerp, damp } from './util';
import { disposeMerged, mergeCharacter, useCharacterInstance, useClips, CharKey } from './characters';
import { labelMaterial } from './label';
import { QualityCfg } from './quality';
import { TownScenery } from './TownScenery';
import { Npcs } from './Npcs';
import { walkAndOpen, walkTo } from '../engine/systems/village';
import { TOWER, TOWER_KNOLL, PORTAL } from '../engine/townData';
import { useUiStore } from '../ui/uiStore';
import { Beach, buildFishStall } from './Beach';
import { buildMineStall } from './CaveEntrance';

type ShopType = 'SUPPLIES' | 'BLACKSMITH' | 'PETS' | 'ARMORY' | 'FORTUNE' | 'WAREHOUSE' | 'TECH' | 'BREWER' | 'FISH' | 'MINE';

// ---------------------------------------------------------------- builders ---
function lantern(b: GB, g: GB, x: number, y: number, z: number) {
  b.box(0.06, 0.55, 0.06, [x, y + 0.35, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y + 0.1, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y - 0.22, z], '#2a2a2e');
  g.sph(0.15, [x, y - 0.06, z], '#ffd070', 1, 6);
}
/** Plain (unstriped) cloth awning. */
function stripedAwning(b: GB, x0: number, x1: number, y: number, z: number, c1: string, c2: string) {
  const n = Math.round((x1 - x0) / 0.9);
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.box(w, 0.1, 1.7, [x0 + w * (i + 0.5), y, z], i % 2 ? c1 : c2, [0.42, 0, 0]);
  for (let i = 0; i < n; i++) b.box(w, 0.28, 0.06, [x0 + w * (i + 0.5), y - 0.62, z + 0.72], i % 2 ? c1 : c2);
}
function pole(b: GB, x: number, z: number, h: number, c = '#6e4b2b') { b.box(0.22, h, 0.22, [x, h / 2, z], c); }

function buildSupplies() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const cream = '#f3e6c6', roofC = '#372a21', wood = '#6e4b2b';
  b.box(5.9, 0.6, 4.9, [0, 0.3, 0], '#9b9488');
  b.box(5.4, 2.8, 4.4, [0, 2.0, 0], cream, [0, 0, 0], [0.86, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 2.9, 0.3, [sx * 2.7, 2.05, sz * 2.2], wood);
  b.box(5.6, 0.25, 0.3, [0, 3.35, 2.22], wood); b.box(5.6, 0.2, 0.3, [0, 1.2, 2.22], wood);
  b.prism(6.9, 2.8, 5.7, [0, 3.35, 0], roofC, [0, 0, 0], [0.78, 1.08]);
  b.box(0.3, 0.3, 5.8, [0, 6.15, 0], '#1f1814');
  b.box(0.18, 0.18, 5.9, [-3.4, 3.4, 0], wood, [0, 0, -0.78]); b.box(0.18, 0.18, 5.9, [3.4, 3.4, 0], wood, [0, 0, 0.78]);
  // alchemist tower
  b.cyl(1.15, 1.3, 5.0, 10, [-3.2, 2.5, -0.8], cream); b.cone(1.6, 2.6, 10, [-3.2, 6.3, -0.8], '#2e2420'); b.octa(0.3, [-3.2, 7.8, -0.8], '#ffe14a');
  b.torus(1.2, 0.08, [-3.2, 4.4, -0.8], wood, [Math.PI / 2, 0, 0], 1, 12);
  g.cyl(0.4, 0.4, 0.1, 8, [-3.2, 3.6, 0.35], '#9ad8ff', [Math.PI / 2, 0, 0]);
  // door + round window
  b.box(1.2, 2.0, 0.2, [-1.4, 1.6, 2.25], '#5a3a1e'); b.cyl(0.6, 0.6, 0.2, 10, [-1.4, 2.6, 2.25], '#5a3a1e', [Math.PI / 2, 0, 0]);
  g.cyl(0.75, 0.75, 0.1, 12, [1.2, 2.7, 2.24], '#8fd2ff', [Math.PI / 2, 0, 0]); b.torus(0.78, 0.09, [1.2, 2.7, 2.27], wood, [0, 0, 0], 1, 12);
  stripedAwning(b, -2.6, 2.6, 3.2, 3.0, '#e6dac0', '#e6dac0');
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
  const stone = '#8f8b86', dark = '#4a3626', slate = '#2f2c2d', steel = '#aeb4be';
  b.box(5.9, 0.6, 4.9, [0, 0.3, 0], '#6f6c68');
  b.box(5.4, 2.9, 4.4, [0, 2.05, 0], stone, [0, 0, 0], [0.82, 1.05]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.34, 3.0, 0.34, [sx * 2.7, 2.1, sz * 2.2], dark);
  b.box(5.6, 0.3, 0.34, [0, 3.45, 2.22], dark);
  for (let i = 0; i < 9; i++) b.box(0.3, 0.2, 0.06, [-2.0 + (i % 5) * 0.9 + (Math.floor(i / 5) ? 0.45 : 0), 0.9 + Math.floor(i / 5) * 0.5 + (i > 8 ? 0.5 : 0), 2.24], '#a29d97');
  b.prism(6.8, 2.2, 5.6, [0, 3.55, 0], slate, [0, 0, 0], [0.8, 1.05]); b.box(0.3, 0.26, 5.7, [0, 5.75, 0], '#1f1c1d');
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
  const plank = '#b98a52', trim = '#f1e6d0', thatch = '#3d2e22', dthatch = '#2a2019', wood = '#6e4b2b', hay = '#e6c85e';
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

/** Armor shop: stone-and-timber store with a dark roof, mannequins in plate, a shield wall and a weapon rack out front. */
function buildArmory() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const stone = '#a39e93', plaster = '#e9e0cc', wood = '#5e4026', roofC = '#2b2420', steel = '#b8bec8', steel2 = '#8e959f';
  b.box(6.2, 0.6, 5.0, [0, 0.3, 0], '#8f897d');
  b.box(5.8, 1.4, 4.6, [0, 1.3, 0], stone);
  b.box(5.6, 2.2, 4.4, [0, 3.1, 0], plaster);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 3.6, 0.3, [sx * 2.85, 2.4, sz * 2.25], wood);
  b.box(5.8, 0.24, 0.3, [0, 4.15, 2.27], wood); b.box(5.8, 0.2, 0.3, [0, 2.05, 2.27], wood);
  b.prism(7.0, 2.6, 5.8, [0, 4.2, 0], roofC, [0, 0, 0], [0.78, 1.08]);
  b.box(0.3, 0.3, 5.9, [0, 6.85, 0], '#1a1512');
  // door + windows
  b.box(1.25, 2.1, 0.2, [-1.6, 1.65, 2.32], '#3e2a18'); b.box(1.45, 0.18, 0.24, [-1.6, 2.8, 2.34], wood);
  g.box(0.9, 0.9, 0.1, [1.3, 3.1, 2.32], '#ffd88a'); b.box(1.1, 0.12, 0.2, [1.3, 3.6, 2.35], wood); b.box(1.1, 0.12, 0.2, [1.3, 2.6, 2.35], wood); b.box(0.08, 0.9, 0.16, [1.3, 3.1, 2.36], wood);
  // plain cloth awning over the display
  stripedAwning(b, 0.0, 2.9, 2.75, 3.1, '#e2d8c4', '#e2d8c4'); pole(b, 0.05, 3.8, 2.4); pole(b, 2.85, 3.8, 2.4);
  // two mannequins in plate armour
  for (const mx of [0.7, 2.2]) {
    b.box(0.12, 1.0, 0.12, [mx, 0.5, 3.4], wood); b.box(0.6, 0.08, 0.6, [mx, 0.04, 3.4], wood);
    b.cyl(0.32, 0.27, 0.75, 12, [mx, 1.35, 3.4], steel, [0, 0, 0], [1, 1, 0.75]);
    for (const s2 of [-1, 1]) b.sph(0.17, [mx + s2 * 0.36, 1.66, 3.4], steel2, [1.1, 0.7, 1], 10);
    b.sph(0.2, [mx, 1.98, 3.4], steel, [1, 1.05, 1], 12); b.box(0.24, 0.05, 0.05, [mx, 1.97, 3.6], '#2a2a2e');
  }
  // shield wall on the left side
  for (let i = 0; i < 3; i++) { const z = -1.4 + i * 1.3; b.cyl(0.45, 0.45, 0.1, 14, [-2.98, 2.6, z], i === 1 ? '#7a1f22' : steel2, [0, 0, Math.PI / 2]); b.sph(0.1, [-3.06, 2.6, z], '#d9b56a', 1, 6); }
  // weapon rack
  b.box(1.6, 0.12, 0.12, [-2.3, 1.4, 3.3], wood); b.box(0.12, 1.4, 0.12, [-3.05, 0.7, 3.3], wood); b.box(0.12, 1.4, 0.12, [-1.55, 0.7, 3.3], wood);
  for (let i = 0; i < 3; i++) b.box(0.08, 1.5, 0.06, [-2.75 + i * 0.45, 1.3, 3.36], steel, [0, 0, 0.08 - i * 0.08]);
  lantern(b, g, -2.6, 3.1, 2.7);
  return { body: b.build(), glow: g.build() };
}

/** Warehouse: long timber storehouse on a stone plinth, wide barn doors, a loading hoist, crates, barrels and grain sacks out front. */
function buildWarehouse() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const stone = '#9d978a', plank = '#d9ccb0', beam = '#5a3d24', roofC = '#3a2e26', crate = '#9c7245', crate2 = '#7d5733', sack = '#d8c8a0';
  b.box(7.2, 0.6, 5.4, [0, 0.3, 0], '#8a8478');
  b.box(6.8, 1.0, 5.0, [0, 1.1, 0], stone);
  b.box(6.6, 3.2, 4.8, [0, 3.2, 0], plank);
  for (const sx of [-1, -0.33, 0.33, 1]) b.box(0.3, 4.4, 0.3, [sx * 3.3, 2.6, 2.42], beam);
  for (const sx of [-1, 1]) b.box(0.3, 4.4, 0.3, [sx * 3.3, 2.6, -2.42], beam);
  b.box(6.9, 0.26, 0.3, [0, 4.75, 2.44], beam); b.box(6.9, 0.22, 0.3, [0, 1.6, 2.44], beam);
  // roof + loft gable with a hoist beam
  b.prism(8.0, 2.8, 6.0, [0, 4.85, 0], roofC, [0, 0, 0], [0.78, 1.08]);
  b.box(0.3, 0.3, 6.1, [0, 7.65, 0], '#1d1713');
  b.box(1.4, 1.2, 0.2, [0, 5.6, 2.62], '#3e2a18'); b.box(1.6, 0.14, 0.24, [0, 6.25, 2.66], beam);
  b.box(0.2, 0.2, 1.6, [0, 6.6, 3.2], beam); b.cyl(0.03, 0.03, 2.4, 4, [0, 5.4, 3.95], '#6b5a44'); b.box(0.5, 0.4, 0.5, [0, 4.1, 3.95], crate);
  // wide double barn doors (X braces)
  for (const sx of [-1, 1]) {
    const x = sx * 0.78;
    b.box(1.5, 2.9, 0.18, [x, 3.05, 2.5], '#6e4a2a');
    b.box(1.5, 0.14, 0.22, [x, 4.4, 2.53], beam); b.box(1.5, 0.14, 0.22, [x, 1.7, 2.53], beam);
    b.box(0.14, 2.9, 0.22, [x, 3.05, 2.54], beam, [0, 0, sx * 0.5]);
  }
  b.box(0.08, 0.5, 0.1, [-0.12, 3.0, 2.64], '#2a2a2e'); b.box(0.08, 0.5, 0.1, [0.12, 3.0, 2.64], '#2a2a2e');
  b.box(3.4, 0.25, 1.4, [0, 1.47, 3.1], '#7a6a56');   // loading step
  // small side windows
  for (const sx of [-1, 1]) { g.box(0.8, 0.7, 0.1, [sx * 2.35, 3.5, 2.47], '#ffd88a'); b.box(1.0, 0.12, 0.18, [sx * 2.35, 3.9, 2.5], beam); b.box(1.0, 0.12, 0.18, [sx * 2.35, 3.1, 2.5], beam); }
  // goods out front: crates, barrels, sacks
  const crateAt = (x: number, y: number, z: number, sz: number, c: string, r = 0) => { b.box(sz, sz, sz, [x, y + sz / 2, z], c, [0, r, 0]); b.box(sz + 0.04, 0.08, sz * 0.3, [x, y + sz / 2, z], beam, [0, r, 0]); };
  crateAt(-2.9, 0, 3.6, 0.9, crate, 0.2); crateAt(-2.0, 0, 3.9, 0.75, crate2, -0.3); crateAt(-2.75, 0.9, 3.6, 0.6, crate2, 0.5);
  crateAt(2.9, 0, 3.2, 0.8, crate2, -0.15);
  for (const [x, z] of [[2.1, 3.9], [2.9, 4.2]]) { b.cyl(0.38, 0.34, 0.95, 10, [x, 0.48, z], '#7a5432'); b.cyl(0.4, 0.4, 0.07, 10, [x, 0.2, z], '#3a3a3e'); b.cyl(0.4, 0.4, 0.07, 10, [x, 0.78, z], '#3a3a3e'); }
  for (const [x, z, r] of [[-1.2, 4.1, 0.3], [-0.7, 4.3, -0.4]]) b.sph(0.36, [x, 0.3, z], sack, [1, 0.8, 1.25], 8, [0, r, 0]);
  lantern(b, g, 1.9, 3.3, 2.7);
  return { body: b.build(), glow: g.build() };
}

/** Tech House: tinkerer's workshop - stone + timber, copper roof trim, big brass gears on the wall, pipes, a chimney,
 *  a lens window and a workbench with gadgets out front. */
function buildTech() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const stone = '#8f8a80', plaster = '#e4dccb', wood = '#5a3d24', roofC = '#2a2f36', brass = '#c9a24a', copper = '#b8693a', steel = '#9aa2ae';
  b.box(6.2, 0.6, 5.0, [0, 0.3, 0], '#857f74');
  b.box(5.8, 1.3, 4.6, [0, 1.25, 0], stone);
  b.box(5.6, 2.3, 4.4, [0, 3.1, 0], plaster);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 3.7, 0.3, [sx * 2.85, 2.4, sz * 2.25], wood);
  b.box(5.8, 0.22, 0.3, [0, 4.2, 2.27], wood);
  b.prism(7.0, 2.4, 5.8, [0, 4.25, 0], roofC, [0, 0, 0], [0.78, 1.08]);
  b.box(7.1, 0.16, 0.2, [0, 4.3, 2.95], copper); b.box(0.3, 0.3, 5.9, [0, 6.7, 0], copper);
  // chimney with a brass cap, steam pipe
  b.box(0.8, 2.4, 0.8, [1.8, 6.2, -1.2], stone); b.cyl(0.5, 0.45, 0.25, 10, [1.8, 7.5, -1.2], brass);
  b.cyl(0.12, 0.12, 3.2, 8, [-2.95, 2.4, 1.4], copper); b.cyl(0.12, 0.12, 1.2, 8, [-2.95, 4.0, 0.8], copper, [Math.PI / 2, 0, 0]);
  // door + round lens window
  b.box(1.2, 2.1, 0.2, [-1.4, 1.65, 2.32], '#3a2a1c'); b.box(1.4, 0.16, 0.24, [-1.4, 2.8, 2.34], wood); b.sph(0.07, [-1.0, 1.6, 2.45], brass, 1, 6);
  b.torus(0.62, 0.1, [1.3, 3.1, 2.3], brass, [0, 0, 0], 1, 16); g.cyl(0.55, 0.55, 0.06, 16, [1.3, 3.1, 2.28], '#9fe8ff', [Math.PI / 2, 0, 0]);
  // big gears on the front wall
  const gear = (x: number, y: number, z: number, r: number, teeth: number, c: string) => {
    b.cyl(r, r, 0.12, 16, [x, y, z], c, [Math.PI / 2, 0, 0]); b.cyl(r * 0.3, r * 0.3, 0.16, 10, [x, y, z + 0.02], '#5b4a2a', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; b.box(r * 0.28, r * 0.28, 0.12, [x + Math.cos(a) * r, y + Math.sin(a) * r, z], c, [0, 0, a]); }
  };
  gear(-0.1, 3.55, 2.33, 0.42, 9, brass); gear(0.5, 3.0, 2.34, 0.26, 7, copper);
  // workbench out front with gadgets
  b.box(1.9, 0.12, 0.8, [1.9, 0.95, 3.5], wood); for (const x of [1.1, 2.7]) b.box(0.12, 0.9, 0.7, [x, 0.48, 3.5], wood);
  b.box(0.5, 0.35, 0.4, [1.5, 1.2, 3.5], steel); g.sph(0.1, [1.5, 1.45, 3.5], '#7df3ff', 1, 6);
  b.cyl(0.06, 0.06, 0.6, 6, [2.3, 1.3, 3.4], brass, [0, 0, 0.6]); b.sph(0.18, [2.5, 1.55, 3.4], copper, 1, 8);
  b.box(0.9, 0.7, 0.6, [-2.4, 0.35, 3.3], '#7d5733'); b.cyl(0.3, 0.3, 0.8, 10, [-2.6, 0.4, 2.7], steel);
  lantern(b, g, -2.2, 3.0, 2.7);
  return { body: b.build(), glow: g.build() };
}

/** Fortune teller's house: crooked dark-roofed cottage, round window, crystal ball on a draped table, moon & star charms. */
function buildFortune() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const plaster = '#e6dccb', wood = '#4e3524', roofC = '#241e1c', cloth = '#3a2550', gold = '#d9b56a';
  b.box(5.8, 0.6, 4.8, [0, 0.3, 0], '#8f897d');
  b.box(5.2, 3.0, 4.3, [0, 2.1, 0], plaster, [0, 0, 0], [0.86, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.3, 3.1, 0.3, [sx * 2.6, 2.15, sz * 2.15], wood);
  b.box(5.4, 0.24, 0.3, [0, 3.55, 2.18], wood); b.box(5.4, 0.2, 0.3, [0, 1.3, 2.18], wood);
  b.prism(6.6, 3.4, 5.6, [0, 3.55, 0], roofC, [0, 0, 0.05], [0.78, 1.08]);
  b.box(0.28, 0.28, 5.7, [0.12, 6.9, 0], '#1a1512', [0, 0, 0.05]);
  // little tower with a pointed hat
  b.cyl(1.0, 1.1, 5.2, 12, [2.6, 2.6, -1.0], plaster); b.cone(1.45, 3.0, 12, [2.6, 6.7, -1.0], roofC, [0.08, 0, -0.1]);
  g.octa(0.22, [2.75, 8.3, -1.1], gold);
  // door + round window with violet glow
  b.box(1.2, 2.1, 0.2, [-1.4, 1.65, 2.2], '#3a2618'); b.cyl(0.6, 0.6, 0.2, 12, [-1.4, 2.7, 2.2], '#3a2618', [Math.PI / 2, 0, 0]);
  g.cyl(0.62, 0.62, 0.1, 14, [1.2, 2.7, 2.21], '#c9a0ff', [Math.PI / 2, 0, 0]); b.torus(0.66, 0.08, [1.2, 2.7, 2.25], wood, [0, 0, 0], 1, 14);
  // draped table with the crystal ball
  b.box(1.6, 0.9, 1.0, [1.2, 0.45, 3.3], cloth); b.box(1.75, 0.08, 1.15, [1.2, 0.92, 3.3], '#5a3a78');
  b.cyl(0.18, 0.24, 0.16, 10, [1.2, 1.02, 3.3], gold); g.sph(0.32, [1.2, 1.38, 3.3], '#b98aff', 1, 14);
  // hanging moon & star charms under the eave
  for (const [x, c] of [[-2.4, gold], [0.0, '#e8e0ff'], [2.3, gold]] as [number, string][]) { b.cyl(0.01, 0.01, 0.6, 3, [x, 3.15, 2.45], '#444'); g.octa(0.12, [x, 2.8, 2.45], c, [1, 1.3, 0.4]); }
  b.torus(0.22, 0.05, [-1.2, 2.85, 2.45], gold, [0, 0, 0], 1, 10, 4.2);
  lantern(b, g, -2.4, 3.0, 2.6);
  return { body: b.build(), glow: g.build() };
}

/** Elixir Brewer's hut (outside the gate): small timber-and-plaster cottage with a dark roof, a stone chimney puffing green
 *  smoke, a big iron cauldron bubbling in front (liquid + bubbles are animated in Shop), a table of elixir flasks, herbs and
 *  jars of monster parts. Door faces +z. Props in front are also town colliders (townData BREWER_HUT). */
function buildBrewer() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const plaster = '#e2d8c0', wood = '#5a3d24', roofC = '#2b2420', stone = '#8f897d', iron = '#2f3139';
  const cz = -0.4;   // body centre (z)
  b.box(5.2, 0.5, 4.4, [0, 0.25, cz], stone);
  b.box(4.6, 2.5, 3.8, [0, 1.75, cz], plaster, [0, 0, 0], [0.86, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.28, 2.6, 0.28, [sx * 2.3, 1.8, cz + sz * 1.9], wood);
  b.box(4.8, 0.22, 0.28, [0, 2.95, cz + 1.92], wood); b.box(4.8, 0.18, 0.28, [0, 1.15, cz + 1.92], wood);
  b.box(0.18, 1.8, 0.2, [0.25, 2.05, cz + 1.95], wood, [0, 0, 0.6]); b.box(0.18, 1.8, 0.2, [2.0, 2.05, cz + 1.95], wood, [0, 0, -0.6]);
  b.prism(5.8, 2.5, 4.9, [0, 3.0, cz], roofC, [0, 0, 0], [0.78, 1.08]);
  b.box(0.26, 0.26, 5.0, [0, 5.45, cz], '#1a1512');
  // stone chimney (green smoke, see Shop FX)
  b.box(0.8, 3.0, 0.8, [1.5, 4.0, cz - 1.0], '#6d6a66'); b.box(0.95, 0.2, 0.95, [1.5, 5.55, cz - 1.0], '#57544f');
  // door + round window with a green glow
  b.box(1.05, 1.85, 0.2, [-1.25, 1.42, cz + 1.95], '#3e5a2e'); b.cyl(0.52, 0.52, 0.2, 10, [-1.25, 2.3, cz + 1.95], '#3e5a2e', [Math.PI / 2, 0, 0]);
  g.cyl(0.5, 0.5, 0.1, 12, [1.1, 2.15, cz + 1.94], '#7dffa0', [Math.PI / 2, 0, 0]); b.torus(0.54, 0.07, [1.1, 2.15, cz + 1.98], wood, [0, 0, 0], 1, 12);
  // plain cloth awning on two poles over the work area
  stripedAwning(b, -2.4, 2.4, 2.9, cz + 2.9, '#dfe6cf', '#dfe6cf');
  pole(b, -2.4, cz + 3.6, 2.6); pole(b, 2.4, cz + 3.6, 2.6);
  // the cauldron: three iron legs, round belly, thick rim, a fire under it (liquid disc is a separate mesh in Shop)
  const kx = 1.4, kz = 3.4;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; b.cyl(0.12, 0.12, 0.55, 5, [kx + Math.cos(a) * 0.62, 0.27, kz + Math.sin(a) * 0.62], '#24252b'); }
  b.sph(0.9, [kx, 1.05, kz], iron, [1, 0.78, 1], 12); b.torus(0.76, 0.12, [kx, 1.6, kz], '#3d4048', [Math.PI / 2, 0, 0], 1, 16);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.box(0.13, 0.55, 0.13, [kx + Math.cos(a) * 0.42, 0.14, kz + Math.sin(a) * 0.42], '#5a3a1e', [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]); }
  g.cone(0.26, 0.5, 6, [kx, 0.32, kz], '#ff9a2a'); g.cone(0.14, 0.38, 5, [kx + 0.15, 0.3, kz - 0.1], '#ffe070');
  b.box(0.07, 1.5, 0.07, [kx + 0.35, 1.9, kz - 0.15], wood, [0.25, 0, -0.35]);   // stirring ladle
  // work table with elixir flasks (the five elixir colours), a mortar and a jar of monster parts
  b.box(1.7, 0.85, 0.75, [-1.6, 0.43, 2.6], wood); b.box(1.85, 0.1, 0.9, [-1.6, 0.9, 2.6], '#8a6340');
  const cols = ['#ff7a2a', '#9eacc2', '#5fd35a', '#ffc94a', '#ff4a5e'];
  for (let i = 0; i < 5; i++) {
    const x = -2.3 + i * 0.36, z = 2.45 + (i % 2) * 0.28;
    g.sph(0.15, [x, 1.1, z], cols[i], [1, 1.05, 1], 7); b.cyl(0.05, 0.05, 0.2, 5, [x, 1.33, z], '#d8c6a0'); b.cyl(0.06, 0.06, 0.06, 5, [x, 1.45, z], '#8a5a30');
  }
  b.cyl(0.2, 0.15, 0.22, 8, [-0.95, 1.06, 2.75], '#9a948a'); b.cyl(0.03, 0.03, 0.35, 4, [-0.9, 1.25, 2.72], '#6e4b2b', [0, 0, 0.5]);
  // shelves of jars on the front wall + hanging herbs under the awning
  b.box(1.3, 0.08, 0.3, [-0.9, 2.2, cz + 2.12], wood);
  for (let i = 0; i < 3; i++) { b.cyl(0.13, 0.13, 0.32, 7, [-1.3 + i * 0.4, 2.4, cz + 2.12], '#c8d8c0'); g.cyl(0.1, 0.1, 0.16, 6, [-1.3 + i * 0.4, 2.36, cz + 2.14], ['#9be86a', '#d08aff', '#ff9a5a'][i]); }
  for (let i = 0; i < 6; i++) b.cone(0.11, 0.42, 5, [-2.0 + i * 0.75, 2.45, cz + 2.75], i % 2 ? '#5aa03a' : '#8a6a3a', [Math.PI, 0, 0]);
  // barrels + a crate of bones / slime jars on the side
  for (const [x, z] of [[-2.9, 0.6], [-3.0, -0.5]]) { b.cyl(0.45, 0.5, 0.85, 9, [x, 0.43, z], '#8a5a30'); b.cyl(0.51, 0.51, 0.07, 9, [x, 0.28, z], '#3a3a40'); b.cyl(0.51, 0.51, 0.07, 9, [x, 0.62, z], '#3a3a40'); }
  b.box(0.8, 0.6, 0.8, [2.95, 0.3, 0.9], '#9c7245'); g.sph(0.16, [2.85, 0.72, 0.8], '#7ddc4a', 1, 6); b.cyl(0.07, 0.07, 0.45, 4, [3.1, 0.75, 1.0], '#e8e0cc', [0, 0, 1.2]);
  lantern(b, g, -2.0, 2.75, cz + 2.6);
  return { body: b.build(), glow: g.build() };
}

const BUILD: Record<ShopType, () => { body: any; glow: any }> = { SUPPLIES: buildSupplies, BLACKSMITH: buildBlacksmith, PETS: buildPets, ARMORY: buildArmory, FORTUNE: buildFortune, WAREHOUSE: buildWarehouse, TECH: buildTech, BREWER: buildBrewer, FISH: buildFishStall, MINE: buildMineStall };
const TITLES: Record<ShopType, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet Stable', ARMORY: 'Armor Shop', FORTUNE: 'Fortune Teller', WAREHOUSE: 'Warehouse', TECH: 'Tech House', BREWER: 'Elixir Brewer', FISH: 'Fishmonger', MINE: 'Mining Supplies' };
type NpcCfg = { key: CharKey; tint: string; pos: [number, number] };
/** Shop-local door the keeper runs to when the siege starts. */
const DOOR: Record<ShopType, [number, number]> = { SUPPLIES: [-1.4, 2.6], BLACKSMITH: [-1.6, 2.6], PETS: [-0.9, 2.7], ARMORY: [-1.6, 2.7], FORTUNE: [-1.4, 2.6], WAREHOUSE: [0, 2.7], TECH: [-1.4, 2.6], BREWER: [-1.25, 1.7], FISH: [-1.6, -0.9], MINE: [-1.6, -0.9] };
const NPC: Record<ShopType, NpcCfg> = {
  SUPPLIES: { key: 'ROGUE', tint: '#ffffff', pos: [2.4, 4.7] },
  BLACKSMITH: { key: 'KNIGHT', tint: '#ffffff', pos: [1.6, 4.9] },
  PETS: { key: 'ROGUE', tint: '#bfffcf', pos: [2.2, 4.7] },
  ARMORY: { key: 'KNIGHT', tint: '#e8e0d0', pos: [-0.6, 4.6] },
  FORTUNE: { key: 'WIZARD', tint: '#e6dcff', pos: [0.1, 4.2] },
  WAREHOUSE: { key: 'ROGUE', tint: '#f0dcc0', pos: [0.9, 4.4] },
  TECH: { key: 'WIZARD', tint: '#cfe6ff', pos: [0.2, 4.4] },
  BREWER: { key: 'WIZARD', tint: '#d8f5d0', pos: [1.4, 2.25] },   // stirring behind the cauldron
  FISH: { key: 'ROGUE', tint: '#cfe4f0', pos: [0.3, 0.35] },       // behind the counter of the beach stall (render/Beach.tsx)
  MINE: { key: 'BARBARIAN', tint: '#e8d2b0', pos: [-0.6, 0.35] },  // the camp's supply keeper behind the counter (render/CaveEntrance.tsx)
};
/** Bubbling liquid disc of the shops with a cauldron: shop-local [x, y, z, radius]. */
const CAULDRON: Partial<Record<ShopType, [number, number, number, number]>> = { SUPPLIES: [3.6, 1.55, 2.4, 0.72], BREWER: [1.4, 1.62, 3.4, 0.68] };

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
  } else if (type === 'ARMORY') {
    b.cyl(0.36, 0.36, 0.08, 12, [0, -0.05, 0.17], '#9aa2ae', [Math.PI / 2, 0, 0], [1, 1.2, 1]); b.box(0.08, 0.6, 0.04, [0, -0.05, 0.22], '#d9b56a'); b.box(0.5, 0.08, 0.04, [0, 0.05, 0.22], '#d9b56a');
  } else if (type === 'TECH') {
    b.cyl(0.32, 0.32, 0.1, 12, [0, -0.08, 0.17], '#c9a24a', [Math.PI / 2, 0, 0]); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.box(0.1, 0.1, 0.1, [Math.cos(a) * 0.36, -0.08 + Math.sin(a) * 0.36, 0.17], '#c9a24a'); }
    b.cyl(0.1, 0.1, 0.12, 8, [0, -0.08, 0.2], '#5b4a2a', [Math.PI / 2, 0, 0]);
  } else if (type === 'WAREHOUSE') {
    b.box(0.7, 0.55, 0.12, [0, -0.08, 0.17], '#9c7245'); b.box(0.74, 0.08, 0.14, [0, -0.08, 0.2], '#5a3d24'); b.box(0.08, 0.55, 0.14, [0, -0.08, 0.2], '#5a3d24');
  } else if (type === 'BREWER') {
    g.sph(0.24, [0, -0.14, 0.16], '#5fd35a', [1, 1, 0.5], 8); g.cyl(0.07, 0.09, 0.28, 6, [0, 0.18, 0.16], '#9be8a8'); b.cyl(0.09, 0.09, 0.07, 6, [0, 0.35, 0.16], '#8a5a30');
    g.sph(0.05, [-0.08, -0.06, 0.3], '#ffffff', 1, 4);
  } else if (type === 'FISH') {
    b.sph(0.26, [0.05, -0.08, 0.17], '#4fb6d8', [1.5, 0.75, 0.4], 7); b.cone(0.2, 0.3, 3, [-0.42, -0.08, 0.17], '#4fb6d8', [0, 0, Math.PI / 2], [1, 1, 0.35]);
    g.sph(0.04, [0.32, -0.02, 0.28], '#ffffff', 1, 4);
  } else if (type === 'MINE') {   // crossed pickaxes over a lantern-oil flask
    for (const sx of [-1, 1]) { b.box(0.07, 0.75, 0.05, [sx * 0.12, -0.02, 0.18], '#6a4828', [0, 0, sx * 0.75]); b.box(0.5, 0.1, 0.06, [sx * 0.3, 0.26, 0.2], '#5c6068', [0, 0, -sx * 0.35]); }
    g.sph(0.14, [0, -0.25, 0.22], '#ffb84a', [1, 1.1, 0.5], 7);
  } else if (type === 'FORTUNE') {
    g.sph(0.26, [0, -0.08, 0.17], '#b98aff', [1, 1, 0.5], 10); b.box(0.5, 0.1, 0.12, [0, -0.36, 0.17], '#d9b56a'); g.octa(0.08, [0.32, 0.24, 0.2], '#fff3c0');
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
  useEffect(() => () => disposeMerged(ch), [ch]);
  useEffect(() => {
    mergeCharacter(ch);   // 1 draw call instead of 7-9
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
    else if (near.current) {   // face the hero (the shop group may be rotated: work in its local frame)
      const pr = g.parent!.rotation.y, c = Math.cos(pr), s2 = Math.sin(pr);
      const lx = c * (world.player.pos.x - wp.x) - s2 * (world.player.pos.z - wp.z), lz = s2 * (world.player.pos.x - wp.x) + c * (world.player.pos.z - wp.z);
      target = Math.atan2(lx - g.position.x, lz - g.position.z);
    }
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

// --------------------------------------------------------------------- shop ---
const ringGeo1 = new RingGeometry(4.6, 5.05, 72), ringGeo2 = new RingGeometry(5.25, 5.4, 72);

function Shop({ type, position, color, q, facing = 0 }: { type: ShopType; position: number[]; color: string; q: QualityCfg; facing?: number }) {
  const geos = useMemo(() => BUILD[type](), [type]);
  const sign = useMemo(() => buildSign(type, color), [type, color]);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }),
    ring: new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    ring2: new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    liquid: new MeshBasicMaterial({ color: new Color(0.6, 2.0, 0.7), toneMapped: false }),
  }), [color]);
  const craftDot = useGameStore((s) => type === 'BLACKSMITH' && canCraftAny(s));   // red dot: something can be forged
  const label = useMemo(() => { const l = labelMaterial(TITLES[type], '#f1e2b8', { size: 64, plate: 'plate', dot: craftDot }); l.mat.depthTest = false; return l; }, [type, color, craftDot]);   // drawn over roofs
  const near = useRef(false);
  const closedK = useRef(0);
  const ringRef = useRef<Group>(null!), signRef = useRef<Group>(null!), titleRef = useRef<Sprite>(null!), light = useRef<PointLight>(null!), liquid = useRef<Mesh>(null!);
  const rot = useRef(0);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.MENU && useUiStore.getState().titleDone) walkAndOpen(px + Math.cos(facing) * NPC[type].pos[0] * 0.5 + Math.sin(facing) * 5.2, pz - Math.sin(facing) * NPC[type].pos[0] * 0.5 + Math.cos(facing) * 5.2, SHOP_TAB[type]);   // walk up to the counter first
    else if (st === GameStatus.PLAYING) useGameStore.getState().openSpecificShop(SHOP_TAB[type]);
  };

  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += (0 - closedK.current) * Math.min(1, dt * 2.2);
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
    if (titleRef.current) {   // the name tag rides on the shopkeeper (who walks to the door and in when the shop closes)
      const e = smooth(closedK.current), c = NPC[type].pos, dr = DOOR[type];
      titleRef.current.position.set(c[0] + (dr[0] - c[0]) * e, 3.5, c[1] + (dr[1] - c[1]) * e);
      titleRef.current.visible = closedK.current < 0.985;
    }
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
      } else if (type === 'BREWER') {   // bubbles from the cauldron + green smoke from the chimney (shop-local -> world via the facing)
        const cf = Math.cos(facing), sf = Math.sin(facing);
        if (Math.random() < dt * 5) {
          const a = Math.random() * TAU, r = Math.random() * 0.5, lx = 1.4 + Math.cos(a) * r, lz = 3.4 + Math.sin(a) * r;
          FX.add.emit(px + lx * cf + lz * sf, 1.7, pz - lx * sf + lz * cf, 0, 1.4, 0, 1.0, 0.16, 0.3, 0.5, 2.0, 0.7, 0.8, CELL.RING, 0, 0.5);
        }
        if (Math.random() < dt * 2.5) smokePuff(px + 1.5 * cf - 1.4 * sf, 5.8, pz - 1.5 * sf - 1.4 * cf, 1, 0x7fbf7a, 1.4, 2.6, 1.2, 0.25, 0.45);
      } else if (type === 'PETS' && Math.random() < dt * 1.5) {
        FX.add.emit(px - 0.9 + (Math.random() - 0.5) * 2, 2.6, pz + 3 + Math.random(), 0, 0.9, 0, 1.6, 0.35, 0.3, 0.5, 2.0, 1.1, 0.9, CELL.PLUS, 0, 0.1);
      }
    }
  });

  const hover = (on: boolean) => { document.body.style.cursor = on ? 'pointer' : ''; mats.ring2.color.set(on ? '#ffffff' : color); };
  const labelW = label.aspect * 0.55;   // small name tag over the shopkeeper's head
  return (
    <group position={[px, 0, pz]} rotation={[0, facing, 0]}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      {CAULDRON[type] && <mesh ref={liquid} material={mats.liquid} position={[CAULDRON[type]![0], CAULDRON[type]![1], CAULDRON[type]![2]]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[CAULDRON[type]![3], 12]} /></mesh>}
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
      <sprite ref={titleRef} material={label.mat} renderOrder={5} position={[NPC[type].pos[0], 3.5, NPC[type].pos[1]]} scale={[labelW, 0.55, 1]} />
      <Shopkeeper cfg={NPC[type]} door={DOOR[type]} near={near} closed={closedK} onOpen={open} />
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
  b.prism(3.5, 0.7, 0.9, [0, 3.0, 0], '#2d2520', [0, 0, 0], [0.9, 1]);
  for (const [x, y, r] of [[-0.8, 2.3, 0.1], [0.1, 2.5, -0.08], [0.85, 2.2, 0.06], [-0.2, 1.75, 0.04]] as number[][]) { b.box(0.62, 0.78, 0.04, [x, y, 0.14], paper, [0, 0, r]); g.sph(0.05, [x, y + 0.3, 0.18], '#e33a3a', 1, 4); }
  b.box(0.6, 0.3, 0.5, [1.9, 0.15, 0.6], '#8a5a30'); b.cyl(0.4, 0.45, 0.8, 8, [-1.9, 0.4, 0.7], '#7a4a28');
  g.sph(0.12, [-1.35, 2.9, 0.2], '#ffd070', 1, 6); g.sph(0.12, [1.35, 2.9, 0.2], '#ffd070', 1, 6);
  return { body: b.build(), glow: g.build() };
}
const questNpc: NpcCfg = { key: 'KNIGHT', tint: '#ffd9a0', pos: [2.9, 1.3] };

function QuestBoard() {
  const geos = useMemo(() => buildBoard(), []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) }) }), []);
  const label = useMemo(() => labelMaterial('Quest Board', '#f1e2b8', { size: 60, plate: 'plate' }), []);
  const mark = useMemo(() => labelMaterial('!', '#ffd24a', { size: 120 }), []);
  const near = useRef(false), k = useRef(0);
  const markRef = useRef<Sprite>(null!), titleRef = useRef<Sprite>(null!);
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.MENU && useUiStore.getState().titleDone) walkAndOpen(QUEST_POS[0], QUEST_POS[2] + 2.6, 'QUESTS', 1.8);
    else if (st === GameStatus.PLAYING) useGameStore.getState().openSpecificShop('QUESTS');
  };
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    k.current += (0 - k.current) * Math.min(1, dt * 2.2);
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
/** Skill Trainer: open-front striped training pavilion (rug, bench, scroll shelf, weapon wall) with straw dummies,
 *  a weapon rack, an archery target and hay bales out front. Faces +z (the north street). */
function buildTrainer() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  const wood = '#7a5230', dark = '#4a3020', canvas = '#efe4cc', red = '#a8352b', straw = '#d6b56a', steel = '#b8bcc6';
  const tz = -1.3, half = 2.4, poleH = 2.7;
  // floor: low wooden deck + rug
  b.box(5.4, 0.18, 5.2, [0, 0.09, tz], '#8a6a48');
  b.box(3.2, 0.03, 2.6, [0, 0.2, tz + 0.2], '#7a2a24'); b.box(2.8, 0.035, 2.2, [0, 0.21, tz + 0.2], '#b8873a');
  // poles + pyramid roof (cream canvas, red cap) + scalloped red / cream valance
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.09, 0.11, poleH, 6, [sx * half, poleH / 2, tz + sz * half], dark);
  b.cone(half * 1.5, 2.0, 4, [0, poleH + 1.0, tz], canvas, [0, Math.PI / 4, 0]);
  b.cone(half * 0.62, 0.83, 4, [0, poleH + 2.0 - 0.415 + 0.0, tz], red, [0, Math.PI / 4, 0]);
  b.cyl(0.04, 0.04, 0.9, 4, [0, poleH + 2.4, tz], dark); b.box(0.5, 0.32, 0.03, [0.27, poleH + 2.65, tz], red);
  for (let side = 0; side < 4; side++) {
    const ang = side * Math.PI / 2;
    for (let k = 0; k < 6; k++) {
      const u = -half + (k + 0.5) * (2 * half / 6);
      const lx = Math.cos(ang) * u - Math.sin(ang) * half * 1.02, lz = Math.sin(ang) * u + Math.cos(ang) * half * 1.02;
      b.box(2 * half / 6 + 0.02, 0.42, 0.05, [lx, poleH - 0.12, tz + lz], k % 2 ? canvas : red, [0, -ang, 0]);
    }
  }
  // back + side walls (sides tied half-open), front open
  b.box(2 * half, poleH - 0.3, 0.06, [0, (poleH - 0.3) / 2 + 0.18, tz - half], canvas);
  for (const sx of [-1, 1]) { b.box(0.06, poleH - 0.3, 2 * half * 0.55, [sx * half, (poleH - 0.3) / 2 + 0.18, tz - half * 0.45], canvas); b.box(0.12, 0.12, 0.5, [sx * half, 1.3, tz + 0.2], red); }
  // inside: weapon wall on the back, bench, scroll shelf
  b.box(2.2, 0.12, 0.1, [0, 1.95, tz - half + 0.1], dark); b.box(2.2, 0.12, 0.1, [0, 1.1, tz - half + 0.1], dark);
  for (let i = 0; i < 4; i++) b.box(0.08, 1.4, 0.06, [-0.75 + i * 0.5, 1.5, tz - half + 0.18], steel, [0, 0, 0.12 - i * 0.08]);
  b.cyl(0.35, 0.35, 0.06, 10, [-0.25, 1.55, tz - half + 0.22], '#7a1f22', [Math.PI / 2, 0, 0]);
  b.box(1.8, 0.12, 0.5, [-1.2, 0.62, tz + 0.6], wood); for (const x of [-1.95, -0.45]) b.box(0.12, 0.42, 0.42, [x, 0.4, tz + 0.6], dark);
  b.box(0.9, 1.3, 0.4, [1.7, 0.85, tz - 1.6], dark); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.cyl(0.07, 0.07, 0.34, 6, [1.45 + j * 0.25, 0.55 + i * 0.4, tz - 1.45], i === 1 ? '#e8dcc0' : '#d8c49a', [0, 0, Math.PI / 2]);
  // straw training dummies (left of the entrance)
  const dummy = (x: number, z: number, r: number) => {
    b.cyl(0.55, 0.6, 0.16, 8, [x, 0.08, z], '#6a6358');
    b.box(0.16, 1.9, 0.16, [x, 0.95, z], wood);
    b.cyl(0.3, 0.36, 0.95, 8, [x, 1.55, z], straw, [0, r, 0]);
    b.box(0.08, 0.95, 0.08, [x, 1.55, z], dark, [0, r, 0]);
    b.box(1.35, 0.14, 0.14, [x, 1.85, z], wood, [0, r, 0]);
    b.sph(0.27, [x, 2.32, z], '#e0c37e', 1, 8);
    b.box(0.5, 0.05, 0.5, [x, 1.4, z], red, [0, r + 0.4, 0]);
    b.torus(0.31, 0.04, [x, 1.25, z], '#7a5230', [Math.PI / 2, 0, 0]); b.torus(0.33, 0.04, [x, 1.85 - 0.25, z], '#7a5230', [Math.PI / 2, 0, 0]);
  };
  dummy(-3.4, 1.7, 0.3); dummy(-3.9, 3.6, -0.4);
  // weapon rack + archery target + hay (right of the entrance)
  b.box(0.16, 1.6, 0.16, [2.9, 0.8, 1.5], dark); b.box(0.16, 1.6, 0.16, [4.5, 0.8, 1.5], dark);
  b.box(1.8, 0.12, 0.16, [3.7, 1.45, 1.5], dark); b.box(1.8, 0.12, 0.16, [3.7, 0.55, 1.5], dark);
  for (let i = 0; i < 4; i++) { b.box(0.08, 1.5, 0.06, [3.1 + i * 0.4, 1.15, 1.62], steel, [0, 0, 0.1 - i * 0.07]); b.box(0.3, 0.07, 0.1, [3.1 + i * 0.4, 0.5, 1.62], '#6b4a2a'); }
  b.box(0.12, 1.7, 0.12, [3.6, 0.85, 3.6], dark, [0.25, 0, 0]); b.box(0.12, 1.7, 0.12, [4.4, 0.85, 3.6], dark, [0.25, 0, 0]);
  b.cyl(0.75, 0.75, 0.16, 16, [4.0, 1.55, 3.85], straw, [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.55, 0.55, 0.17, 16, [4.0, 1.55, 3.86], '#efe4cc', [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.36, 0.36, 0.18, 16, [4.0, 1.55, 3.87], red, [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.16, 0.16, 0.19, 12, [4.0, 1.55, 3.88], '#e9b949', [Math.PI / 2 - 0.2, 0, 0]);
  b.box(0.04, 0.04, 0.7, [3.85, 1.7, 4.15], dark, [0.3, 0.2, 0]); b.box(0.04, 0.04, 0.7, [4.2, 1.45, 4.2], dark, [0.2, -0.2, 0]);
  b.box(1.1, 0.6, 0.7, [2.6, 0.3, 3.9], straw); b.box(1.1, 0.06, 0.72, [2.6, 0.45, 3.9], '#b89850'); b.box(0.9, 0.5, 0.6, [2.75, 0.85, 3.85], straw, [0, 0.3, 0]);
  // banner pole (left back corner)
  b.box(0.18, 4.4, 0.18, [-3.6, 2.2, -2.6], dark); b.box(1.6, 0.14, 0.14, [-2.85, 4.2, -2.6], dark); b.box(1.3, 2.0, 0.06, [-2.85, 3.15, -2.6], red);
  b.tri([-3.5, 2.15, -2.57], [-2.2, 2.15, -2.57], [-2.85, 1.6, -2.57], red);
  g.sph(0.14, [-3.6, 4.5, -2.6], '#ffd070', 1, 6); g.box(0.7, 0.1, 0.02, [-2.85, 3.35, -2.54], '#ffd070'); g.box(0.1, 0.7, 0.02, [-2.85, 3.35, -2.54], '#ffd070');
  // lanterns on the front poles
  for (const sx of [-1, 1]) { g.sph(0.13, [sx * half, 2.1, tz + half + 0.15], '#ffd88a', 1, 6); b.box(0.22, 0.05, 0.22, [sx * half, 2.27, tz + half + 0.15], dark); }
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
  const trainDot = useGameStore((s) => !shrine && (canTrainSkill(s) || canBuyTalent(s)));   // only when a lesson / talent is affordable (owner)
  const canTrain = useGameStore((s) => !shrine && canTrainSkill(s));
  const label = useMemo(() => labelMaterial(shrine ? 'Summoning Shrine' : 'Skill Trainer', '#f1e2b8', { size: 60, plate: 'plate', dot: trainDot }), [shrine, trainDot]);
  const sp = useGameStore((s) => s.skillPoints);
  const spLabel = useMemo(() => (canTrain && sp > 0 ? labelMaterial(`${sp} SP to spend!`, '#ffffff', { size: 50, bg: 'rgba(10,8,6,0.86)', border: '#c8962e' }) : null), [sp]);
  const near = useRef(false), closedK = useRef(0), rot = useRef(0);
  const ringRef = useRef<Group>(null!), crystalRef = useRef<Mesh>(null!), runeRef = useRef<Mesh>(null!), titleRef = useRef<Sprite>(null!), spRef = useRef<Sprite>(null!);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.MENU && useUiStore.getState().titleDone) walkAndOpen(px, pz + (shrine ? 3.2 : 2.8), shrine ? 'SUMMON' : 'SKILLS', 1.8);
    else if (st === GameStatus.PLAYING) useGameStore.getState().openSpecificShop(shrine ? 'SUMMON' : 'SKILLS');
  };
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += (0 - closedK.current) * Math.min(1, dt * 2.2);
    const closed = closedK.current > 0.5;
    const d = Math.hypot(world.player.pos.x - px, world.player.pos.z - pz);
    near.current = !lobby && !closed && d < 6;
    rot.current += dt * (near.current ? 1.2 : 0.3);
    const pulse = 0.5 + 0.5 * Math.sin(t * (near.current ? 5 : 1.6));
    mats.ring.opacity = near.current ? 0.55 + 0.4 * pulse : 0.2 + 0.1 * pulse;
    mats.ring2.opacity = near.current ? 0.4 + 0.3 * pulse : 0.12;
    if (ringRef.current) { ringRef.current.visible = false; ringRef.current.rotation.y = rot.current; }
    if (titleRef.current) titleRef.current.visible = !closed;
    if (spRef.current) { spRef.current.visible = !closed; spRef.current.position.y = 7.4; }
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
      <sprite ref={titleRef} material={label.mat} position={[0, shrine ? 5.4 : 6.2, 0]} scale={[label.aspect * 0.85, 0.85, 1]} />
      {spLabel && !shrine && <sprite ref={spRef} material={spLabel.mat} position={[0, 7.4, 0]} scale={[spLabel.aspect * 0.8, 0.8, 1]} />}
      <mesh position={[0, 1.8, shrine ? 0 : 0.4]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <boxGeometry args={shrine ? [5, 4, 5] : [9, 4.4, 7.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
const q_light = (c: string) => <pointLight position={[0, 3, 0]} color={c} distance={12} decay={1.6} intensity={10} />;

// ------------------------------------------------------------- endless tower ---
/** The Endless Tower: a tall round stone tower in the forecourt, purple-lit windows, a glowing rune door facing the road. */
function buildTowerGeo() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const st = ['#a29fab', '#94919e', '#aeabb8'], dark = '#2a2733';
  b.cyl(5.0, 5.4, 1.2, 16, [0, 0.6, 0], '#5d5a66');
  for (let i = 0; i < 7; i++) b.cyl(4.05 - i * 0.12, 4.15 - i * 0.12, 3.2, 14, [0, 1.2 + 1.6 + i * 3.2, 0], st[i % 3]);   // stacked drums
  for (let i = 1; i < 7; i++) b.cyl(4.2 - i * 0.12, 4.2 - i * 0.12, 0.25, 14, [0, 1.2 + i * 3.2, 0], '#56535f');           // course lines
  const top = 1.2 + 7 * 3.2;
  b.cyl(4.6, 3.6, 0.8, 16, [0, top + 0.4, 0], st[1]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.box(1.0, 1.1, 0.7, [Math.cos(a) * 4.2, top + 1.35, Math.sin(a) * 4.2], st[i % 3], [0, -a, 0]); }   // crenellations
  b.cone(3.4, 5.5, 12, [0, top + 3.6, 0], '#3a2f4a'); b.cyl(0.08, 0.08, 2.4, 6, [0, top + 7.4, 0], dark);
  g.sph(0.35, [0, top + 8.7, 0], '#c58bff', 1, 8);
  // glowing windows spiralling up
  for (let i = 0; i < 9; i++) { const a = i * 1.15 + 0.4, y = 4 + i * 2.25, r = 4.0 - (y / 30) * 0.8; g.box(0.55, 1.0, 0.12, [Math.cos(a) * r, y, Math.sin(a) * r], '#b77dff', [0, -a + Math.PI / 2, 0]); }
  // door (faces +x): stone frame, dark doorway, rune arch
  b.box(0.6, 4.2, 3.2, [4.1, 2.6, 0], st[2]);
  b.box(0.3, 3.2, 2.0, [4.35, 2.2, 0], dark);
  g.torus(1.2, 0.09, [4.45, 3.7, 0], '#c58bff', [0, Math.PI / 2, 0], 1, 16, Math.PI);
  for (const sz of [-1, 1]) { b.box(0.9, 1.4, 0.9, [4.9, 0.7, sz * 2.1], st[0]); g.sph(0.28, [4.9, 1.65, sz * 2.1], '#d9b4ff', 1, 7); }   // braziers
  b.box(2.6, 0.25, 3.4, [5.4, 0.12, 0], '#5d5a66');   // threshold
  return { body: b.build(), glow: g.build() };
}
function TowerLandmark() {
  const geos = useMemo(() => buildTowerGeo(), []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.9 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.5, 2.2) }) }), []);
  const label = useMemo(() => labelMaterial('Endless Tower', '#e9d6ff', { size: 64, plate: 'plate' }), []);
  const best = useGameStore((s) => s.progress.towerBest[s.hero] ?? 0);
  const sub = useMemo(() => (best > 0 ? labelMaterial(`Best floor ${best}`, '#c9a6ff', { size: 46 }) : null), [best]);
  const titleRef = useRef<Sprite>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.glow.color.setRGB(1.6 + Math.sin(t * 2) * 0.3, 1.3 + Math.sin(t * 2.4) * 0.2, 2.2);
    if (titleRef.current) titleRef.current.position.y = 32.5;
  });
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(TOWER.door.x + 1.2, TOWER.door.z, 'tower', '', 2.2); };
  return (
    <group position={[TOWER.x, TOWER_KNOLL.h, TOWER.z]}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      <sprite ref={titleRef} material={label.mat} position={[0, 32.5, 0]} scale={[label.aspect * 1.4, 1.4, 1]} />
      {sub && <sprite material={sub.mat} position={[0, 31.0, 0]} scale={[sub.aspect * 0.8, 0.8, 1]} />}
      <pointLight position={[6.5, 3, 0]} color="#b77dff" distance={12} decay={1.6} intensity={12} />
      <mesh position={[1, 6, 0]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <cylinderGeometry args={[5, 5, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---- Adventure Portal: an ancient stone gate in the forest clearing south of the town (runs start here)
function buildPortalGeo() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const st = ['#8f8c86', '#9c988f', '#85827c', '#a6a299'], dark = '#3a3833', moss = '#5d7a3a';
  // round stepped platform
  b.cyl(7.6, 8.0, 0.5, 28, [0, 0.25, 0], '#6f6c66'); b.cyl(6.6, 6.9, 0.4, 28, [0, 0.7, 0], st[0]); b.cyl(5.4, 5.6, 0.3, 28, [0, 1.05, 0], st[1]);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.box(0.28, 0.04, 0.5, [Math.cos(a) * 6.1, 0.92, Math.sin(a) * 6.1], '#7ad8ff', [0, -a, 0]); }   // rune ring
  // steps up to it (front, -z)
  for (let i = 0; i < 3; i++) b.box(4.2, 0.35, 0.8, [0, 0.18 + i * 0.32, -8.2 + i * 0.75], st[i % 3]);
  // two massive carved pillars
  for (const sx of [-1, 1]) {
    const x = sx * 4.3;
    b.box(2.3, 1.0, 2.3, [x, 1.6, 0], st[2]);
    for (let k = 0; k < 5; k++) b.box(1.7 - (k % 2) * 0.12, 1.9, 1.7 - (k % 2) * 0.12, [x, 3.05 + k * 1.9, 0], st[k % 4]);
    b.box(2.1, 0.5, 2.1, [x, 12.6, 0], st[0]);
    for (let k = 0; k < 4; k++) g.box(0.12, 0.7, 0.08, [x - sx * 0.86, 4 + k * 2.1, -0.4], '#7ad8ff');   // glowing runes facing the opening
    b.box(0.5, 2.4, 1.75, [x + sx * 0.95, 4.2, 0], moss);   // moss streak on the outer face
  }
  // arch: stone voussoirs on a semicircle over the pillars, keystone on top
  const R = 4.3, cy = 12.9;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (i / 10), x = Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.75;
    b.box(1.5, 1.2, 1.9, [x, y, 0], st[i % 4], [0, 0, a - Math.PI / 2]);
  }
  b.box(1.4, 1.8, 2.3, [0, cy + R * 0.75 + 0.4, 0], '#b0aca2'); g.sph(0.36, [0, cy + R * 0.75 + 0.4, -1.2], '#9fe8ff', 1, 8);
  // broken standing stones around the clearing
  for (let i = 0; i < 6; i++) { const a = -0.4 + (i / 5) * (Math.PI + 0.8) + Math.PI, r = 9.3; b.box(1.0, 2.2 + (i % 3) * 0.8, 0.8, [Math.cos(a) * r, 1.1 + (i % 3) * 0.4, Math.sin(a) * r * -1 + 1], st[i % 4], [0.08 * (i % 2 ? 1 : -1), a, 0.1]); }
  // braziers flanking the steps
  for (const sx of [-1, 1]) { b.cyl(0.55, 0.7, 1.6, 10, [sx * 3.4, 0.8, -8.0], '#4a4842'); b.cyl(0.85, 0.6, 0.4, 10, [sx * 3.4, 1.8, -8.0], dark); g.sph(0.5, [sx * 3.4, 2.2, -8.0], '#ffb347', [1, 1.3, 1], 8); }
  return { body: b.build(), glow: g.build() };
}
function PortalLandmark() {
  const geos = useMemo(() => buildPortalGeo(), []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.92 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.8) }),
    disc: new MeshBasicMaterial({ color: new Color(0.25, 0.6, 1.4), transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false, toneMapped: false }),
    swirl: new MeshBasicMaterial({ color: new Color(0.7, 1.4, 2.4), transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    swirl2: new MeshBasicMaterial({ color: new Color(1.4, 0.8, 2.2), transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
  }), []);
  const label = useMemo(() => labelMaterial('Adventure Portal', '#d6f2ff', { size: 64, plate: 'plate' }), []);
  const r1 = useRef<Mesh>(null!), r2 = useRef<Mesh>(null!), r3 = useRef<Mesh>(null!), stones = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (r1.current) r1.current.rotation.z = t * 0.9;
    if (r2.current) r2.current.rotation.z = -t * 1.4;
    if (r3.current) { r3.current.rotation.z = t * 0.4; r3.current.scale.setScalar(1 + Math.sin(t * 2) * 0.04); }
    mats.disc.opacity = 0.45 + Math.sin(t * 1.7) * 0.1;
    if (stones.current) { stones.current.rotation.y = t * 0.35; stones.current.children.forEach((c, i) => { c.position.y = 3 + i * 1.6 + Math.sin(t * 1.5 + i) * 0.35; }); }
  });
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(PORTAL.front.x, PORTAL.front.z, 'none', '', 2.2); };
  return (
    <group position={[PORTAL.x, 0, PORTAL.z]}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      {/* the swirling gateway between the pillars */}
      <group position={[0, 7.6, 0]}>
        <mesh material={mats.disc}><circleGeometry args={[3.3, 40]} /></mesh>
        <mesh ref={r1} material={mats.swirl} position={[0, 0, -0.02]}><ringGeometry args={[1.2, 3.3, 40, 1, 0, Math.PI * 1.3]} /></mesh>
        <mesh ref={r2} material={mats.swirl2} position={[0, 0, -0.04]}><ringGeometry args={[0.4, 2.6, 36, 1, 0, Math.PI * 0.9]} /></mesh>
        <mesh ref={r3} material={mats.swirl} position={[0, 0, -0.06]}><ringGeometry args={[2.9, 3.35, 48]} /></mesh>
      </group>
      {/* rune stones floating around the arch */}
      <group ref={stones}>
        {[0, 1, 2, 3].map((i) => <mesh key={i} material={mats.glow} position={[Math.cos(i * 1.57) * 6, 3 + i * 1.6, Math.sin(i * 1.57) * 6]}><octahedronGeometry args={[0.45, 0]} /></mesh>)}
      </group>
      <sprite material={label.mat} position={[0, 20.5, 0]} scale={[label.aspect * 1.4, 1.4, 1]} />
      <pointLight position={[0, 7, -2.5]} color="#7ad8ff" distance={18} decay={1.6} intensity={18} />
      <mesh position={[0, 7, 0]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <boxGeometry args={[10, 14, 3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Town({ q }: { q: QualityCfg }) {
  // houses / stalls / gate / NPCs / animals: only in the peaceful village (and behind the title screen)
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  return (
    <>
      {village && <TownScenery q={q} />}
      {village && <Npcs />}
      {village && <TowerLandmark />}
      {village && <PortalLandmark />}
      {village && <Beach q={q} />}
      {SHOP_POSITIONS.map((s) => <Shop key={s.type} type={s.type as ShopType} position={s.position} color={s.color} q={q} facing={s.rot ?? 0} />)}
      <QuestBoard />
      <Station kind="TRAINER" position={TRAINER_POS} />
    </>
  );
}
export const __builders = { buildSupplies, buildBlacksmith, buildPets, buildSign };
