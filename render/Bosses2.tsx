// Non-instanced models for the wave 30-70 bosses: Elderroot, Mire Hydra body, Glacius, Ignar and the Void Herald.
// One generic rig (body / glow / two arms / "extra" part such as a tail, bark plates or orbiting shards) with a per-boss builder
// and a per-boss animation function that reads the boss's state machine (state / pattern / stateT) from the engine.
// The hydra heads, saplings and imps are ordinary instanced enemies (enemyModels.ts / Enemies.tsx).
import { BossWard } from './BossWard';
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { world } from '../engine/world';
import type { Enemy, EnemyKind } from '../engine/types';
import { bossView } from '../engine/systems/bosses2';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { dustPuff, embers, smokePuff, FX, CELL } from './fx';
import { GB, TAU, clamp, damp } from './util';
import { WarMachine } from './WarMachine';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { makeBossMats, useBossRig } from './bossKit';
import { blade, limb, lump, spike } from './bossShapes';

/** creature-kit piece per boss (render/bossKit.tsx). EMPTY on purpose (owner 2026-10-25: the kit versions read as round baby toys): Elderroot, the Hydra body, Ignar and the Void Herald
 *  use the angular procedural rigs below. Add a kind here to switch it back to the GLB piece. */
const KIT_PIECE: Partial<Record<EnemyKind, string>> = {};

const sin = Math.sin, cos = Math.cos;
type V3 = [number, number, number];

interface Rig {
  r: number;                          // authored footprint radius (scale = enemy.radius / r)
  body: BufferGeometry; glow: BufferGeometry;
  armL?: BufferGeometry; armR?: BufferGeometry; armRGlow?: BufferGeometry;
  extra?: BufferGeometry; extraGlow?: BufferGeometry;
  armLPos: V3; armRPos: V3; extraPos: V3;
}
const NONE: V3 = [0, 0, 0];

// ================================================================ builders ===
function outward(a: number, tilt: number): V3 { return [tilt, a, 0]; }   // cone tilted from +y toward the (sin a, cos a) direction

function buildTreant(): Rig {
  const bark = '#5b3a1e', bark2 = '#7a4e28', root = '#46301a', leaf = '#4f9a26', leaf2 = '#7bc83a', thorn = '#c9b27a';
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]), plates = new GB([0.9, 1.1]);
  // gnarled trunk: 7-sided taper with buttress ridges and bark thorns (no round blobs)
  body.cyl(0.6, 1.0, 2.6, 7, [0, 1.4, 0], bark);
  body.cyl(0.62, 0.62, 1.3, 6, [0, 3.3, 0], bark2);
  body.cyl(0.4, 0.66, 0.5, 6, [0, 2.75, 0], bark);                                               // jaw block under the face
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; spike(body, [sin(a) * 0.75, 1.2 + (i % 2) * 0.8, cos(a) * 0.75], [sin(a) * 1.25, 2.0 + (i % 2) * 1.0, cos(a) * 1.25], 0.2, 4, bark2); }
  lump(body, 0.34, [0.5, 2.0, 0.6], bark2, [1, 1.2, 0.6]); lump(body, 0.28, [-0.55, 2.7, 0.5], bark2, [1, 1.2, 0.6]); lump(body, 0.26, [0.1, 1.2, 0.85], bark2, [1, 1.2, 0.6]);
  // brow ridges, nose and fangs: a scowling face
  for (const s of [-1, 1]) {
    lump(body, 0.3, [s * 0.27, 3.5, 0.52], bark, [1.1, 0.4, 0.8], [0, 0, -s * 0.45]);
    spike(body, [s * 0.18, 2.78, 0.6], [s * 0.2, 2.35, 0.78], 0.07, 4, thorn);
    spike(body, [s * 0.5, 3.6, 0.1], [s * 0.95, 4.35, -0.1], 0.12, 4, bark2);
  }
  spike(body, [0, 3.2, 0.55], [0, 2.95, 0.95], 0.1, 4, bark2);
  body.cyl(0.26, 0.2, 0.14, 5, [0, 2.78, 0.6], '#1a0e06', [Math.PI / 2, 0, 0], [1.4, 1, 0.6]);   // mouth
  for (let i = -1; i <= 1; i++) spike(body, [i * 0.14, 2.84, 0.64], [i * 0.14, 2.52 - (i === 0 ? 0.1 : 0), 0.7], 0.05, 4, thorn);
  // antler crown: forked horns + a ring of leaf blades (jagged, not leafy balls)
  for (const s of [-1, 1]) {
    limb(body, [s * 0.35, 3.9, 0], [s * 0.85, 4.8, -0.1], 0.2, 0.13, 5, bark);
    limb(body, [s * 0.85, 4.8, -0.1], [s * 1.05, 5.7, -0.25], 0.13, 0.07, 5, bark);
    spike(body, [s * 1.05, 5.7, -0.25], [s * 1.2, 6.4, -0.3], 0.07, 4, thorn);
    spike(body, [s * 0.85, 4.8, -0.1], [s * 1.7, 5.4, -0.2], 0.1, 4, bark);
    spike(body, [s * 0.6, 4.3, 0], [s * 1.3, 4.5, 0.3], 0.09, 4, bark2);
  }
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + 0.2, rr = 0.35 + (i % 3) * 0.2, y0 = 3.95 + (i % 2) * 0.15, c = i % 2 ? leaf2 : leaf, o = rr + 0.55 + (i % 3) * 0.12;
    blade(body, [sin(a) * rr, y0, cos(a) * rr], [sin(a) * o, y0 + 1.15 + (i % 3) * 0.3, cos(a) * o], 0.2, 0.07, c);
  }
  // (owner 2026-10-25: no roots: they read as floating roots)
  for (const s of [-1, 1]) { blade(glow, [s * 0.14, 3.2, 0.52], [s * 0.42, 3.32, 0.56], 0.07, 0.05, '#d8ff5a'); glow.octa(0.07, [s * 0.5, 1.9, 0.82], '#9be32a', [1, 1.4, 0.6]); }
  glow.torus(0.7, 0.04, [0, 2.2, 0], '#9be32a', [Math.PI / 2, 0, 0], 1, 8);
  // arms: tapered branch limbs with elbow thorns and long clawed twig fingers
  const arm = new GB([0.75, 1.1]);
  limb(arm, [0, 0, 0], [0, -1.1, 0.1], 0.3, 0.22, 6, bark); limb(arm, [0, -1.1, 0.1], [0, -2.0, 0.2], 0.22, 0.17, 6, bark);
  spike(arm, [0, -1.1, 0.25], [0, -1.15, 0.9], 0.1, 4, thorn); spike(arm, [0.2, -0.5, 0], [0.75, -0.2, 0], 0.09, 4, bark2);
  lump(arm, 0.3, [0, -2.1, 0.2], bark2, [1, 0.8, 1]);
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 0.18; limb(arm, [x, -2.15, 0.2], [x * 1.6, -2.75, 0.3], 0.08, 0.05, 4, bark); spike(arm, [x * 1.6, -2.75, 0.3], [x * 2.0, -3.4, 0.4], 0.05, 4, thorn); }
  blade(arm, [0.25, -0.7, 0.15], [0.65, -0.1, 0.15], 0.14, 0.05, leaf);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; plates.cone(0.2, 1.0, 4, [sin(a) * 1.05, 1.0 + (i % 3) * 0.7, cos(a) * 1.05], '#9aa0aa', outward(a, 1.0)); }
  plates.cone(0.25, 1.1, 4, [0, 4.0, 0], '#9aa0aa');
  const armG = arm.build();
  return { r: 1.15, body: body.build(), glow: glow.build(), extra: plates.build(), armL: armG, armR: armG, armLPos: [-1.0, 3.6, 0], armRPos: [1.0, 3.6, 0], extraPos: NONE };
}

/** Mire Hydra body (mostly below the rim): a low, armoured, crocodile-like bulk: faceted back, tall dorsal plates, thick spiked neck bases, clawed legs, blade tail. */
function buildHydra(): Rig {
  const sk = '#2f6f3a', sk2 = '#4c8a3a', belly = '#a8c47a', dark = '#1f4a28', bone = '#e4e0b8';
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]), tail = new GB([0.75, 1.1]);
  lump(body, 1.55, [0, 1.0, 0], sk, [1.15, 0.6, 1.45]);
  lump(body, 1.25, [0, 0.62, 0.2], belly, [1.1, 0.38, 1.3]);
  for (let i = 0; i < 9; i++) { const z = -1.4 + i * 0.4, h = 0.9 + (i % 3) * 0.35, x = i % 2 ? 0.3 : -0.3; spike(body, [x, 1.45, z], [x, 1.45 + h, z - 0.35], 0.22, 4, dark, [1, 1, 0.5]); }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) spike(body, [s * 1.0, 1.1, -0.9 + i * 0.7], [s * 1.55, 1.2 + (i % 2) * 0.25, -1.1 + i * 0.7], 0.15, 4, bone);   // flank spikes
  for (const [x, z] of [[1.25, 0.8], [-1.25, 0.8], [1.15, -0.8], [-1.15, -0.8]]) {   // crouched, clawed legs
    const s = Math.sign(x);
    limb(body, [x * 0.8, 1.0, z], [x * 1.25, 0.55, z + 0.1], 0.5, 0.36, 5, sk2);
    limb(body, [x * 1.25, 0.55, z + 0.1], [x * 1.3, 0.05, z + 0.35], 0.36, 0.3, 5, sk2);
    for (let c = -1; c <= 1; c++) spike(body, [x * 1.3 + c * 0.18, 0.1, z + 0.4], [x * 1.3 + c * 0.24 + s * 0.05, -0.05, z + 0.95], 0.1, 4, bone);
  }
  for (let k = -1; k <= 1; k++) {   // spiked neck bases the heads grow from (hexagonal taper, not balls)
    limb(body, [k * 0.95, 0.7, 1.0], [k * 0.95, 1.35, 1.75], 0.8, 0.52, 6, sk2);
    for (const s of [-1, 1]) spike(body, [k * 0.95 + s * 0.45, 1.3, 1.55], [k * 0.95 + s * 0.85, 1.75, 1.35], 0.13, 4, bone);
  }
  for (const [x, y, z] of [[0.7, 1.4, -0.4], [-0.8, 1.3, 0.2], [0.2, 1.5, -1.0]]) lump(body, 0.42, [x, y, z], sk2, [1, 0.6, 1]);
  for (const s of [-1, 1]) glow.octa(0.11, [s * 0.9, 0.75, -0.5], '#ffe14a', [1.3, 0.8, 0.9]);
  limb(tail, [0, 0, -0.1], [0, 0, -1.4], 0.7, 0.5, 6, sk, [1, 0.75, 1]);
  limb(tail, [0, 0, -1.4], [0, 0, -2.7], 0.5, 0.3, 6, sk, [1, 0.75, 1]);
  spike(tail, [0, 0, -2.7], [0, 0, -4.9], 0.3, 4, sk2, [1, 0.5, 1]);
  for (let i = 0; i < 6; i++) spike(tail, [0, 0.5 - i * 0.04, -0.3 - i * 0.65], [0, 1.2 - i * 0.12, -0.7 - i * 0.65], 0.2 - i * 0.015, 4, dark, [1, 1, 0.5]);
  blade(tail, [0, 0, -3.3], [1.6, 0, -4.1], 0.3, 0.08, '#c8d8a0'); blade(tail, [0, 0, -3.3], [-1.6, 0, -4.1], 0.3, 0.08, '#c8d8a0');   // tail blades
  return { r: 1.75, body: body.build(), glow: glow.build(), extra: tail.build(), armLPos: NONE, armRPos: NONE, extraPos: [0, 0.95, -1.7] };
}

function buildWyrm(): Rig {
  const ice = '#8fd0f0', ice2 = '#d6f1ff', deep = '#3f86b8', horn = '#e6f6ff';
  const body = new GB([0.75, 1.12]), glow = new GB([1, 1]), tail = new GB([0.8, 1.1]);
  body.sph(1.0, [0, 0, 0], ice, [0.9, 0.8, 1.55], 10);
  body.sph(0.8, [0, -0.25, 0.1], ice2, [0.8, 0.5, 1.4], 8);
  body.cyl(0.38, 0.58, 1.8, 8, [0, 0.62, 1.45], ice, [0.9, 0, 0]);                              // neck
  body.sph(0.6, [0, 1.35, 2.15], ice, [0.95, 0.85, 1.3], 9);                                     // skull
  body.box(0.42, 0.3, 0.9, [0, 1.22, 2.85], ice2);                                                // snout
  body.box(0.4, 0.14, 0.8, [0, 0.98, 2.75], deep);                                                // jaw
  for (const s of [-1, 1]) {
    body.cone(0.13, 0.95, 4, [s * 0.3, 1.9, 1.85], horn, [-0.6, 0, s * 0.35]);
    body.cone(0.06, 0.28, 4, [s * 0.14, 0.9, 3.15], '#ffffff', [Math.PI, 0, 0]);
    glow.sph(0.1, [s * 0.34, 1.52, 2.5], '#7df3ff', [1, 1, 0.7], 6);
  }
  for (let i = 0; i < 7; i++) { const z = -1.0 + i * 0.5; body.cone(0.18, 0.9 + (i % 2) * 0.3, 4, [0, 0.72 + (i < 3 ? 0.1 : 0.35), z], horn, [0.15, 0, 0]); glow.octa(0.08, [0, 1.15 + (i % 2) * 0.1, z], '#7df3ff'); }
  const wing = (s: number) => {
    const w = new GB([0.8, 1.1]);
    w.cyl(0.07, 0.05, 2.7, 5, [s * 1.35, 0.05, 0], horn, [0, 0, s * 1.5]);
    w.tri([0, 0.1, 0.5], [s * 2.7, 0.2, -0.9], [s * 2.5, 0.2, 1.2], deep);
    w.tri([0, 0.1, 0.5], [s * 2.5, 0.2, 1.2], [0, 0.1, 1.3], ice);
    return w.build();
  };
  tail.cone(0.62, 3.6, 7, [0, 0, -1.8], ice, [-Math.PI / 2, 0, 0]);
  tail.cone(0.4, 1.0, 4, [0.0, 0.55, -3.2], horn, [-0.4, 0, 0]);
  return { r: 1.25, body: body.build(), glow: glow.build(), armL: wing(-1), armR: wing(1), extra: tail.build(), armLPos: [-0.6, 0.55, 0.3], armRPos: [0.6, 0.55, 0.3], extraPos: [0, 0, -1.3] };
}

/** Ignar: a tall, spiked demon-knight. Tapered plate torso (6 sides), spiked pauldrons, long swept horns, a slit-eyed helm, tattered cape blades, a serrated flame blade. */
function buildWarlord(): Rig {
  const dark = '#5a3442', iron = '#85626e', red = '#e4562c', glowC = '#ff8a22', gold = '#ffc84a', steel = '#f2f6fc';   // (owner 2026-10-26: brighter, toy-like - same spiked silhouette)
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]);
  for (const s of [-1, 1]) {
    limb(body, [s * 0.38, 0.05, 0.05], [s * 0.4, 0.6, 0], 0.3, 0.3, 6, dark); limb(body, [s * 0.4, 0.6, 0], [s * 0.38, 1.15, 0], 0.3, 0.24, 6, dark);
    spike(body, [s * 0.4, 0.62, 0.2], [s * 0.42, 0.7, 0.72], 0.14, 4, iron);                                  // knee spike
    limb(body, [s * 0.38, 0.12, 0.1], [s * 0.38, 0.1, 0.62], 0.3, 0.14, 5, iron, [1, 0.6, 1]);               // boot: tapered toe wedge
    body.cyl(0.26, 0.42, 0.7, 6, [s * 0.9, 2.5, 0], red, [0, 0, -s * 0.35]);                                 // pauldron plate
    body.cyl(0.4, 0.5, 0.18, 6, [s * 0.95, 2.78, 0], iron, [0, 0, -s * 0.35]);
    for (let i = 0; i < 3; i++) spike(body, [s * (0.85 + i * 0.16), 2.85 - i * 0.12, i * 0.1 - 0.1], [s * (1.2 + i * 0.5), 3.5 - i * 0.28, i * 0.14 - 0.14], 0.12 - i * 0.015, 4, iron);
    limb(body, [s * 0.3, 3.0, 0.02], [s * 0.78, 3.55, -0.05], 0.14, 0.1, 5, gold);                           // helm horns: out, then up
    spike(body, [s * 0.78, 3.55, -0.05], [s * 0.98, 4.5, -0.18], 0.1, 4, gold);
    spike(body, [s * 0.4, 2.85, 0.35], [s * 0.7, 2.65, 0.75], 0.06, 4, gold);                                  // cheek tusk
    spike(body, [s * 0.5, 1.05, 0.25], [s * 0.7, 0.2, 0.55], 0.12, 4, iron);                                  // tasset blade
  }
  body.cyl(0.95, 0.55, 1.35, 6, [0, 1.8, 0], iron, [0, 0, 0], [1, 1, 0.75]);                                 // chest: wide shoulders tapering to the waist
  body.cyl(1.0, 0.8, 0.85, 6, [0, 2.1, 0.04], red, [0, 0, 0], [1, 1, 0.8]);                                  // red breastplate
  spike(body, [0, 2.3, 0.62], [0, 1.65, 0.95], 0.22, 4, iron, [1, 1, 0.6]);                                   // keel ridge
  body.cyl(0.5, 0.82, 0.8, 6, [0, 0.95, 0], dark); body.cyl(0.85, 0.85, 0.16, 6, [0, 1.2, 0], '#1a1214');     // hips + belt
  lump(body, 0.46, [0, 2.97, 0.03], dark, [0.9, 1.15, 1.05]);                                                   // helm
  limb(body, [0, 2.9, 0.15], [0, 2.75, 0.62], 0.3, 0.12, 5, iron, [0.9, 0.8, 1]);                            // long visor / muzzle
  blade(body, [0, 3.15, -0.05], [0, 3.95, -0.55], 0.12, 0.05, '#ff5a2a');
  for (let i = -2; i <= 2; i++) blade(glow, [i * 0.1, 3.3, -0.2], [i * 0.2, 4.2 - Math.abs(i) * 0.3, -0.55], 0.09, 0.04, i % 2 ? '#ffd070' : '#ff7a1a');   // flame mane on the helm                                    // crest fin
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 0.3; spike(body, [x, 1.9, -0.45], [x * 1.2, 0.2 - (i % 2) * 0.4, -0.7], 0.2, 4, '#b23418', [1, 1, 0.3]); }   // tattered cape blades
  spike(body, [0, 2.7, -0.4], [0, 2.9, -1.0], 0.12, 4, iron);
  for (let i = 0; i < 4; i++) glow.box(0.07, 0.5, 0.03, [(i - 1.5) * 0.28, 1.85 + (i % 2) * 0.12, 0.5], glowC, [0, 0, (i - 1.5) * 0.18]);   // chest cracks
  for (const s of [-1, 1]) glow.octa(0.13, [s * 0.17, 3.0, 0.5], '#ffd070', [1.7, 0.3, 0.6], [0, 0, -s * 0.35]);   // narrow slanted eye slits
  glow.octa(0.2, [0, 1.4, 0.55], '#ff4a10', [1, 1.2, 0.7]);
  const armBase = (s: number) => {
    const a = new GB([0.75, 1.1]);
    limb(a, [0, 0, 0], [0, -0.55, 0.05], 0.26, 0.22, 6, dark); limb(a, [0, -0.55, 0.05], [0, -1.1, 0.1], 0.24, 0.2, 6, dark);
    a.cyl(0.26, 0.34, 0.5, 6, [0, -1.15, 0.08], red);                                                       // gauntlet
    spike(a, [s * 0.2, -0.6, 0.1], [s * 0.7, -0.45, 0.1], 0.1, 4, iron);                                     // elbow spike
    spike(a, [s * 0.22, -1.1, 0.1], [s * 0.45, -1.7, 0.2], 0.09, 4, iron);
    return a;
  };
  const aR = armBase(1), gR = new GB([1, 1]);
  aR.cyl(0.07, 0.07, 0.7, 5, [0, -1.35, 0.25], '#2a1a1a', [Math.PI / 2, 0, 0]);
  spike(aR, [0.2, -1.15, 0.35], [0.7, -0.85, 0.35], 0.1, 4, gold); spike(aR, [-0.2, -1.15, 0.35], [-0.7, -0.85, 0.35], 0.1, 4, gold);   // swept cross-guard
  spike(aR, [0, -1.2, 0.35], [0, -4.7, 0.35], 0.22, 4, steel, [1, 1, 0.22]);                                // blade: long diamond section tapering to a point
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) spike(aR, [s * 0.12, -2.0 - i * 0.55, 0.35], [s * 0.3, -2.25 - i * 0.55, 0.35], 0.06, 3, steel);   // serrations
  spike(gR, [0, -1.3, 0.35], [0, -4.4, 0.35], 0.09, 4, glowC, [1, 1, 0.5]);
  return { r: 1.0, body: body.build(), glow: glow.build(), armL: armBase(-1).build(), armR: aR.build(), armRGlow: gR.build(), armLPos: [-0.95, 2.45, 0], armRPos: [0.95, 2.45, 0], extraPos: NONE };
}

/** Ignar's devil wings (Burning Form): a big bat wing, plane xy, root at the shoulder, reaching out along +x (mirror for the left one).
 *  Dark-red membrane with deep scalloped cuts between long pointed finger bones, each ending in a claw tip; a jagged, menacing silhouette. */
function buildDevilWing(): { skin: BufferGeometry; bones: BufferGeometry } {
  const S: V3 = [0, 0, 0], E: V3 = [1.4, 1.9, 0], W: V3 = [3.0, 2.6, 0], B: V3 = [0.25, -1.9, 0];
  const T: V3[] = [[5.4, 4.4, 0], [6.6, 1.9, 0], [5.2, -0.9, 0], [3.4, -2.5, 0]];
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2 + (W[0] - (a[0] + b[0]) / 2) * 0.5, (a[1] + b[1]) / 2 + (W[1] - (a[1] + b[1]) / 2) * 0.5, 0.05];   // deep scallop: tips stay sharp
  const ring: V3[] = [T[0], mid(T[0], T[1]), T[1], mid(T[1], T[2]), T[2], mid(T[2], T[3]), T[3], mid(T[3], B), B];
  const pos: number[] = [], col: number[] = [];
  const c1 = new Color('#e0483c'), c2 = new Color('#7a1224'), tmp = new Color();
  const vtx = (v: V3) => { pos.push(v[0], v[1], v[2]); const d = Math.hypot(v[0] - W[0], v[1] - W[1]) / 3.6; tmp.copy(c1).lerp(c2, Math.min(1, d)); col.push(tmp.r, tmp.g, tmp.b); };
  for (let i = 0; i < ring.length - 1; i++) { vtx(W); vtx(ring[i]); vtx(ring[i + 1]); }
  vtx(W); vtx(B); vtx(S);
  const skin = new BufferGeometry();
  skin.setAttribute('position', new Float32BufferAttribute(pos, 3)); skin.setAttribute('color', new Float32BufferAttribute(col, 3)); skin.computeVertexNormals();
  const bn = new GB([0.85, 1.1]), bone = '#3a1418', knob = '#e8a060';
  limb(bn, S, E, 0.26, 0.18, 5, bone); limb(bn, E, W, 0.18, 0.14, 5, bone);
  for (const t of T) {
    limb(bn, W, t, 0.1, 0.05, 5, bone);
    const dx = t[0] - W[0], dy = t[1] - W[1], l = Math.hypot(dx, dy);
    spike(bn, t, [t[0] + dx / l * 0.55, t[1] + dy / l * 0.55, 0], 0.07, 4, knob);                     // claw tip
  }
  spike(bn, [S[0], S[1], 0], [-0.1, 0.5, 0], 0.3, 5, '#5a1a20');
  spike(bn, [E[0], E[1], 0], [E[0] + 0.1, E[1] + 0.6, 0], 0.16, 4, knob);                               // elbow spur
  spike(bn, [W[0], W[1], 0], [W[0] - 0.3, W[1] + 1.0, 0], 0.14, 4, knob);                               // wrist thumb claw
  return { skin, bones: bn.build() };
}

function buildVoid(): Rig {
  const dk = '#1b0b30', mid = '#2a1048', pur = '#c084fc', hi = '#e9d5ff';
  const body = new GB([0.7, 1.15]), glow = new GB([1, 1]), shards = new GB([0.8, 1.2]), sg = new GB([1, 1]);
  body.cone(0.95, 2.5, 6, [0, 1.25, 0], dk);                                                              // 6-sided tapered robe
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; spike(body, [sin(a) * 0.85, 0.25, cos(a) * 0.85], [sin(a) * 1.05, -0.35, cos(a) * 1.05], 0.16, 4, mid); }   // tattered hem blades
  body.octa(0.75, [0, 2.35, 0], mid, [1.1, 1.3, 0.8]);
  for (const s of [-1, 1]) {   // spiked shoulder mantle + back blades
    spike(body, [s * 0.5, 2.55, 0], [s * 1.3, 3.0, -0.1], 0.2, 4, mid);
    spike(body, [s * 0.35, 2.2, -0.3], [s * 0.9, 3.4, -0.9], 0.14, 4, dk);
  }
  lump(body, 0.4, [0, 3.15, 0.1], '#0b0416', [0.8, 1.25, 1]);                                              // hooded skull
  limb(body, [0, 3.05, 0.2], [0, 2.9, 0.62], 0.22, 0.08, 5, '#0b0416', [0.9, 0.7, 1]);                      // pointed mask snout
  for (const s of [-1, 1]) {   // crown: two long swept horns, each with a fork
    limb(body, [s * 0.28, 3.4, -0.05], [s * 0.6, 4.1, -0.3], 0.13, 0.09, 5, mid);
    spike(body, [s * 0.6, 4.1, -0.3], [s * 0.75, 5.0, -0.55], 0.09, 4, mid);
    spike(body, [s * 0.5, 3.9, -0.2], [s * 1.2, 4.3, -0.3], 0.08, 4, mid);
  }
  glow.torus(0.78, 0.045, [0, 3.2, -0.4], pur, [0, 0, 0], 1, 8);
  for (const s of [-1, 1]) glow.octa(0.11, [s * 0.15, 3.2, 0.42], hi, [1.7, 0.35, 0.6], [0, 0, -s * 0.4]);   // narrow slanted eyes
  glow.octa(0.2, [0, 2.35, 0.5], pur, [1, 1.4, 0.8]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, y = 1.6 + (i % 3) * 0.55, r = 1.7 + (i % 2) * 0.3; shards.octa(0.3 + (i % 2) * 0.1, [sin(a) * r, y, cos(a) * r], mid, [0.6, 2.0, 0.6], [0.3, a, 0.2]); sg.octa(0.1, [sin(a) * r, y, cos(a) * r], pur); }
  const arm = new GB([0.7, 1.15]);
  arm.cone(0.2, 1.8, 5, [0, -0.75, 0], mid, [Math.PI, 0, 0]);
  const hand = new GB([1, 1]);
  hand.octa(0.2, [0, -1.75, 0], hi, [0.8, 1.3, 0.8]);
  for (let i = -1; i <= 1; i++) spike(hand, [i * 0.1, -1.85, 0.05], [i * 0.2, -2.45, 0.15], 0.05, 4, hi);    // claws
  const armG = arm.build();
  return { r: 1.0, body: body.build(), glow: glow.build(), armL: armG, armR: armG, armRGlow: hand.build(), extra: shards.build(), extraGlow: sg.build(), armLPos: [-0.8, 2.6, 0], armRPos: [0.8, 2.6, 0], extraPos: NONE };
}

const BUILD: Partial<Record<EnemyKind, () => Rig>> = { BOSS_TREANT: buildTreant, BOSS_HYDRA: buildHydra, BOSS_WYRM: buildWyrm, BOSS_WARLORD: buildWarlord, BOSS_VOID: buildVoid };

// =============================================================== animation ===
interface Pose { armL: number; armR: number; spread: number; pitch: number; dy: number; glow: number; extraY: number; spin: number }
/** Fills the animation targets for this frame from the boss's attack state. t = e.animT, k = e.stateT. */
function targets(e: Enemy, T: Pose, t: number): void {
  const k = e.stateT, st = e.state, p = e.pattern;
  T.armL = sin(t * 1.4) * 0.18; T.armR = -sin(t * 1.4) * 0.18; T.spread = 0.12; T.pitch = 0; T.dy = 0; T.glow = 1 + e.phase * 0.35; T.extraY = 0; T.spin = 0;
  const W = st === 'WINDUP', A = st === 'ATTACK', R = st === 'RECOVER';
  switch (e.kind) {
    case 'BOSS_TREANT':
      if (st === 'CHASE') { // rooted: he sways slowly, branches creaking (never walks)
        T.dy = sin(t * 1.1) * 0.08; T.armL = sin(t * 1.3) * 0.32; T.armR = -sin(t * 1.15) * 0.32; T.pitch = 0.03 * sin(t * 0.9);
      }
      if (p === 0) { if (W) { const w = clamp(k / 1.0, 0, 1); T.armL = T.armR = -2.5 * w; T.pitch = -0.15 * w; T.glow += w; } else if (A) { T.armL = T.armR = 0.7; T.pitch = 0.25; T.dy = -0.15; T.glow += 1.2; } }
      else if (p === 1) { if (W || A) { T.armL = T.armR = -2.9; T.spread = 0.5; T.glow += 1.2; } }
      else if (p === 2) { if (W) { T.armL = T.armR = -0.6; T.spread = 1.3 * clamp(k, 0, 1); T.dy = clamp(k, 0, 1) * 0.1; T.glow += clamp(k, 0, 1); } else if (A) { T.dy = -0.2; T.spread = 0.3; T.glow += 1.5; } }
      else if (p === 3) { if (W || A) { T.armL = T.armR = -1.3; T.spread = -0.7; T.glow += 1.5; T.pitch = 0.12; } }
      else if (p === 6) { if (W) { const w = clamp(k / 1.2, 0, 1); T.armL = T.armR = -2.9 * w; T.spread = 0.9 * w; T.glow += w * 1.3; } else if (A) { T.armL = 0.8; T.armR = -0.6; T.spread = 0.2; T.pitch = 0.25; T.glow += 1.4; } }   // branch sweep: arms up, then across
      else if (p === 7) { if (W) { const w = clamp(k / 1.25, 0, 1); T.armL = T.armR = -3.1 * w; T.pitch = -0.2 * w; T.dy = w * 0.5; T.glow += w * 1.6; } else if (A) { T.armL = T.armR = 1.0; T.pitch = 0.35; T.dy = -0.45; T.glow += 1.8; } }   // slam
      break;
    case 'BOSS_HYDRA':   // (rooted body beyond the rim) it heaves up on each attack
      T.dy = sin(t * 1.2) * 0.2;
      if (p === 0) { if (W) T.dy += 0.9 * clamp(k / 0.9, 0, 1); else if (A) T.dy -= 0.3; }
      else if (p === 1) { if (W) T.dy += 1.1 * clamp(k / 1.1, 0, 1); T.pitch = W ? -0.12 : 0; }
      else if (p === 2) { if (W || A) T.dy += 0.8; }
      else if (p === 3) { if (W) { T.dy += 1.6 * clamp(k / 1.2, 0, 1); T.glow += clamp(k / 1.2, 0, 1) * 1.5; } else if (A) { T.dy -= 0.5; T.glow += 1.4; } }
      T.extraY += sin(t * 1.5) * 0.08;
      break;
    case 'BOSS_WYRM':
      T.dy = 1.8 + sin(t * 1.6) * 0.2;
      T.armL = sin(t * 3.2) * 0.45 + 0.1; T.armR = T.armL; T.spread = 0.2;
      if (p === 0) { if (W) { T.pitch = 0.1; T.glow += 0.8; } else if (A) { T.pitch = -0.28; T.glow += 1.4; T.armL = T.armR = 0.5; } }
      else if (p === 2) { if (W) { T.armL = T.armR = sin(t * 14) * 0.9; T.dy += clamp(k / 0.9, 0, 1) * 2.5; } else if (R) T.dy = 0.35; }
      else if (p === 3 && (W || A)) { T.glow += 1.4; T.armL = T.armR = sin(t * 8) * 0.8; }
      T.extraY = sin(t * 1.9) * 0.35;
      break;
    case 'BOSS_WARLORD':
      T.dy = Math.abs(sin(t * 3)) * 0.06 * (st === 'CHASE' ? 1 : 0);
      if (bossView.enraged) T.glow += 1.8;
      if (bossView.formT > 0) { T.armL = T.armR = -2.8; T.glow += 2.5 + (2 - bossView.formT) * 1.5; T.dy = 0.25; }   // igniting
      if (p === 0) { if (W) { const w = clamp(k, 0, 1); T.armR = -2.9 * w; T.armL = -1.5 * w; T.glow += w * 1.5; } else if (A) { T.armR = -2.4; T.armL = -1.2; T.spin = bossView.enraged ? 11 : 8; T.glow += 1.8; } }
      else if (p === 1) { if (W) { const w = clamp(k, 0, 1); T.armR = -3.0 * w; T.glow += w; } else if (A) { T.armR = 0.5; T.pitch = 0.3; T.dy = -0.2; T.glow += 1.4; } }
      else if (p === 2) { if (W || A) { T.armR = T.armL = -2.7; T.glow += 1.3; } }
      else if (p === 3) { if (W) { T.armR = -1.2 * clamp(k / 0.8, 0, 1); T.pitch = -0.2; } else if (A) { T.armR = 0.9; T.pitch = 0.3; T.glow += 1.4; } }
      else if (p === 4) { if (W) { const w = clamp(k / 0.5, 0, 1); T.armR = -2.8 * w; T.pitch = -0.15 * w; T.glow += w * 1.4; } else if (A || R) { T.armR = 0.9; T.pitch = 0.3; T.glow += 1.6; } }   // Flame Crescent: sword up, then a sweeping cut
      else if (p === 5) { if (W || A) { const w = W ? clamp(k / 0.8, 0, 1) : 1; T.armR = T.armL = -2.9 * w; T.spread = 0.5 * w; T.dy = 0.2 * w; T.glow += 1.8 * w; } }   // Radiant Burst: arms thrown up
      else if (p === 6) { if (W || A) { T.armR = T.armL = -1.0; T.spread = -0.6; T.pitch = 0.12; T.glow += 1.6; } }   // Blazing Guard: arms crossed in front
      else if (p === 7) { if (W) { T.pitch = -0.25 * clamp(k / 0.5, 0, 1); T.armR = -1.6; T.glow += 1.0; } else if (A) { T.pitch = bossView.dashPh === 0 ? 0.55 : 0.2; T.armR = bossView.dashPh === 0 ? 1.2 : 0.9; T.armL = 0.6; T.glow += 1.8; } }   // Blazing Rush: leaning into the charge
      if (bossView.guardT > 0) T.glow += 1.0;
      break;
    default: // BOSS_VOID
      T.dy = 1.5 + sin(t * 1.7) * 0.2; T.spin = 0.7;
      if (p === 0 && (W || A)) { T.armL = T.armR = -0.5; T.spread = 1.3; T.glow += 1.0; T.spin = 2; }
      else if (p === 1) { if (W || A) { T.armL = T.armR = -1.6; T.spread = 0.3; T.glow += 1.6 + (bossView.pushed ? 1.2 : 0); T.spin = A ? (bossView.pushed ? 7 : -5) : 3; } }
      else if (p === 2 && (W || A)) { T.armL = T.armR = -2.7; T.spread = 0.5; T.glow += 1.2; T.spin = 3; }
  }
}

function Boss2({ kind }: { kind: EnemyKind }) {
  const rig = useMemo(() => BUILD[kind]!(), [kind]);
  const mats = useMemo(() => ({
    lit: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05, side: DoubleSide }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2) }),
  }), []);
  const root = useRef<Group>(null!), body = useRef<Group>(null!), aL = useRef<Group>(null!), aR = useRef<Group>(null!), extra = useRef<Group>(null!);
  const kb = useRef<Group>(null!), kw = useRef<Group>(null!), wingL = useRef<Group>(null!), wingR = useRef<Group>(null!);
  const wing = useMemo(() => (kind === 'BOSS_WARLORD' ? buildDevilWing() : null), [kind]);
  const wingMat = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: DoubleSide, emissive: new Color('#5a0c12'), emissiveIntensity: 0.7 }), []);
  const km = useMemo(() => makeBossMats(), []), rig2 = useBossRig(KIT_PIECE[kind] || '', km);
  const S = useRef<Pose & { yaw: number; lastStep: number }>({ armL: 0, armR: 0, spread: 0.12, pitch: 0, dy: 0, glow: 1, extraY: 0, spin: 0, yaw: 0, lastStep: 0 });
  const T = useMemo<Pose>(() => ({ armL: 0, armR: 0, spread: 0, pitch: 0, dy: 0, glow: 1, extraY: 0, spin: 0 }), []);

  useFrame(({ clock }, dtRaw) => {
    const r = root.current;
    const status = useGameStore.getState().status;
    const id = bossView.id;
    const e = id >= 0 ? world.enemies[id] : null;
    if (!e || !e.active || e.kind !== kind || e.decoy || status === GameStatus.MENU || status === GameStatus.HERO_SELECT) { r.visible = false; return; }
    if (e.hideT > 0 && e.state !== 'DYING') { r.visible = false; return; }   // submerged / airborne
    r.visible = true;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const s = S.current, t = e.animT, TT = clock.elapsedTime;
    targets(e, T, t);
    const fast = e.state === 'WINDUP' || e.state === 'ATTACK' ? 14 : 8;
    s.armL = damp(s.armL, T.armL, fast, dt); s.armR = damp(s.armR, T.armR, fast, dt); s.spread = damp(s.spread, T.spread, fast, dt);
    s.pitch = damp(s.pitch, T.pitch, 9, dt); s.dy = damp(s.dy, T.dy, 9, dt); s.glow = damp(s.glow, T.glow, 8, dt); s.extraY = damp(s.extraY, T.extraY, 14, dt);
    s.yaw += T.spin * dt;
    if (T.spin === 0) { const home = Math.round(s.yaw / 6.283185) * 6.283185; s.yaw = damp(s.yaw, home, 7, dt); }   // (owner: Ignar fought facing away) a spin pose must not leave the body turned once it ends
    // spawn rise / death sink
    let yOff = 0, fy = 1, shx = 0;
    if (kind === 'BOSS_HYDRA') yOff = -2.4;   // (rooted beyond the rim) the body lies low, mostly below the arena edge
    if (e.state === 'SPAWN') { const k = clamp(e.stateT / 1.6, 0, 1); yOff += -(1 - k * k) * 4; shx = sin(TT * 60) * 0.05 * (1 - k); }
    if (e.state === 'DYING') { const k = clamp(e.deathT / 0.6, 0, 1); fy = 1 - k * 0.7; shx = sin(TT * 80) * 0.08 * (1 - k); s.glow = 3 * (1 - k); }
    const sc = e.radius / rig.r;
    r.position.set(e.pos.x + shx * sc, e.pos.y + yOff, e.pos.z);
    r.rotation.y = e.facing + s.yaw;
    const big = kind === 'BOSS_WARLORD' && bossView.enraged ? 1.12 : 1;   // (owner) the Burning Form looms larger
    r.scale.set(sc * big, sc * fy * big, sc * big);
    const b = body.current;
    b.position.y = s.dy; b.rotation.x = s.pitch; b.rotation.z = e.state === 'CHASE' ? sin(t * (kind === 'BOSS_TREANT' ? 3 : 2.6)) * (kind === 'BOSS_TREANT' ? 0.09 : 0.035) : 0;
    if (aL.current) { aL.current.rotation.x = s.armL; aL.current.rotation.z = s.spread * (kind === 'BOSS_WYRM' ? 1 : 1); }
    if (aR.current) { aR.current.rotation.x = s.armR; aR.current.rotation.z = -s.spread; }
    if (extra.current) {
      if (kind === 'BOSS_VOID') { extra.current.rotation.y = TT * (0.8 + s.glow * 0.5); extra.current.position.y = sin(TT * 1.3) * 0.15; }
      else if (kind === 'BOSS_TREANT') extra.current.visible = bossView.bark;
      else extra.current.rotation.y = s.extraY;
    }
    if (wingL.current) {   // (owner) devil wings in the Burning Form: they unfurl during the ignition and flap a little
      const f = bossView.enraged ? 1 : bossView.formT > 0 ? 1 - bossView.formT / 2 : 0, wr = wingR.current, wl = wingL.current;
      wl.visible = wr.visible = f > 0.02;
      const act = e.state === 'WINDUP' || e.state === 'ATTACK', fl = sin(TT * (act ? 7 : 4)) * (act ? 0.3 : 0.2), open = 0.25 + 0.35 * f;
      const ws = 0.85 * f;
      wr.scale.set(ws, ws, ws); wl.scale.set(-ws, ws, ws);
      wr.rotation.y = open + fl; wl.rotation.y = -(open + fl);
      wr.rotation.z = wl.rotation.z = 0.12 + fl * 0.35;
      wr.rotation.z = 0.12 + fl * 0.35; wl.rotation.z = -(0.12 + fl * 0.35);
    }
    mats.glow.color.setScalar(1.1 + s.glow * 0.9 + 0.2 * sin(TT * 5));
    if (kind === 'BOSS_TREANT') mats.lit.color.setRGB(bossView.bark ? 0.62 : 1, bossView.bark ? 0.58 : 1, bossView.bark ? 0.55 : 1);
    if (kind === 'BOSS_WARLORD') { const f = bossView.enraged ? 1 : bossView.formT > 0 ? 1 - bossView.formT / 2 : 0, fl = 0.15 * sin(TT * 9) * f; mats.lit.color.setRGB(1 + 0.8 * f + fl, 1 - 0.3 * f, 1 - 0.45 * f); }   // charred red-hot body, flickering

    if (rig2 && kw.current) {   // creature-kit joints follow the same targets as the old rig
      const J = rig2.J, K = J.armL;
      kw.current.scale.setScalar(e.scale / ENEMY_DEFS[kind].scale / sc / big);
      kb.current.position.y = s.dy; kb.current.rotation.x = s.pitch; kb.current.rotation.z = b.rotation.z;
      if (K) { K.rotation.x = s.armL; K.rotation.z = s.spread; J.armR.rotation.x = s.armR; J.armR.rotation.z = -s.spread; }
      if (J.head) { J.head.rotation.x = sin(t * 1.3) * 0.04 - s.pitch * 0.4; J.head.rotation.y = sin(t * 0.7) * 0.12 * (kind === 'BOSS_VOID' ? 0.5 : 1); }
      if (J.crown) { J.crown.rotation.z = sin(t * 1.1) * 0.03; J.crown.rotation.x = sin(t * 0.9) * 0.03; }
      if (J.plates) J.plates.visible = bossView.bark;
      if (J.tail) { J.tail.rotation.y = sin(t * 1.5) * 0.3 + s.extraY * 2; J.tail.rotation.x = sin(t * 1.1) * 0.06; }
      if (J.legFL) { const lp = t * 2; J.legFL.rotation.x = J.legBR.rotation.x = sin(lp) * 0.08; J.legFR.rotation.x = J.legBL.rotation.x = -sin(lp) * 0.08; }
      if (J.shards) J.shards.rotation.y = TT * (0.8 + s.glow * 0.5);
      if (J.halo) { J.halo.rotation.y = TT * 1.2; J.halo.rotation.z = sin(TT * 0.9) * 0.06; }
      km.glow.color.setScalar(0.8 + s.glow * 0.8 + 0.2 * sin(TT * 5));
      km.lit.color.copy(mats.lit.color);
    }

    // ambient particles / footfalls
    if (dt > 0 && e.state !== 'DYING' && e.state !== 'SPAWN') {
      const wx = e.pos.x + (Math.random() - 0.5) * e.radius * 1.6, wz = e.pos.z + (Math.random() - 0.5) * e.radius * 1.6;
      switch (kind) {
        case 'BOSS_TREANT': if (Math.random() < dt * 5) FX.add.emit(wx, 3 + Math.random() * 6, wz, 0, -0.8, 0, 1.6, 0.3, 0.05, 1.0, 0.5, 2.0, 0.9, CELL.DISC, 0, 0.2); break;
        case 'BOSS_HYDRA': if (Math.random() < dt * 3) smokePuff(wx, 0.4, wz, 1, 0x4c8a3a, 1.5, 1.2, 0.6, 1.0, 0.3); break;
        case 'BOSS_WYRM': if (Math.random() < dt * 6) smokePuff(wx, 1.2 + s.dy, wz, 1, 0xd6f1ff, 1.6, 1.2, 0.3, 1.5, 0.3); break;
        case 'BOSS_WARLORD':
          if (Math.random() < dt * (bossView.enraged ? 30 : bossView.formT > 0 ? 45 : 8)) embers(wx, 1 + Math.random() * 5, wz, 1, 0xff7a1a, 0.3, 2.4, 0.9, 0.2);
          if ((bossView.enraged || bossView.formT > 0) && Math.random() < dt * 14) smokePuff(wx, 0.6 + Math.random() * 3, wz, 1, Math.random() < 0.5 ? 0xff5a1a : 0xffb02a, 1.4, 1.6, 0.25, 2.2, 0.35);   // body flames
          break;
        default: if (Math.random() < dt * 10) FX.add.emit(wx, 1 + Math.random() * 5, wz, 0, 1.5, 0, 0.9, 0.3, 0.05, 1.6, 0.4, 2.0, 0.9, CELL.STAR, 0, 0.3, 0, 2);
      }
      if (kind === 'BOSS_TREANT' || kind === 'BOSS_WARLORD' || kind === 'BOSS_HYDRA') {
        const ph = Math.sin(t * (kind === 'BOSS_HYDRA' ? 2 : 3)) > 0 ? 1 : 0;
        if (e.state === 'CHASE' && ph !== s.lastStep) { s.lastStep = ph; dustPuff(e.pos.x, e.pos.z, 3, 1.8, 0xb8a888, 2.5); }
      }
    }
  });

  return (
    <group ref={root} visible={false}>
      {wing && ([wingR, wingL] as const).map((ref, k) => (
        <group key={k} ref={ref} position={[k === 0 ? 0.55 : -0.55, 2.3, -0.7]} visible={false}>
          <mesh geometry={wing.skin} material={wingMat} castShadow />
          <mesh geometry={wing.bones} material={wingMat} castShadow />
        </group>
      ))}
      {rig2 && <group ref={kb}><group ref={kw}><primitive object={rig2.root} /></group></group>}
      <group visible={!rig2}>
      <group ref={body}>
        <mesh geometry={rig.body} material={mats.lit} castShadow />
        <mesh geometry={rig.glow} material={mats.glow} />
        {rig.armL && <group ref={aL} position={rig.armLPos}><mesh geometry={rig.armL} material={mats.lit} castShadow /></group>}
        {rig.armR && (
          <group ref={aR} position={rig.armRPos}>
            <mesh geometry={rig.armR} material={mats.lit} castShadow />
            {rig.armRGlow && <mesh geometry={rig.armRGlow} material={mats.glow} />}
          </group>
        )}
        {rig.extra && (
          <group ref={extra} position={rig.extraPos}>
            <mesh geometry={rig.extra} material={mats.lit} castShadow />
            {rig.extraGlow && <mesh geometry={rig.extraGlow} material={mats.glow} />}
          </group>
        )}
      </group>
      </group>
    </group>
  );
}

export function Bosses2() {
  return (<><Boss2 kind="BOSS_TREANT" /><Boss2 kind="BOSS_HYDRA" /><Boss2 kind="BOSS_WARLORD" /><Boss2 kind="BOSS_VOID" /><WarMachine /><BossWard /></>);
}
export const __builders = { buildTreant, buildHydra, buildWyrm, buildWarlord, buildVoid };
