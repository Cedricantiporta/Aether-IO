// Procedural multi-part enemy models + per-kind pose functions (all allocation-free per frame).
import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3, InstancedMesh } from 'three';
import type { Enemy, EnemyKind } from '../engine/types';
import { GB, TAU, clamp, lerp } from './util';
import { makeBow } from './weapons';

export type MatKey = 'lit' | 'lit2' | 'jelly' | 'glow' | 'ghost';
export interface Part { geo: BufferGeometry; mat: MatKey }
export interface ModelDef {
  parts: Part[];
  headY: number;
  shadow: number;       // blob radius
  pose: (e: Enemy, P: Poser, t: number) => void;
}

/** Writes per-part instance matrices: base (enemy transform) * local (part transform). */
export class Poser {
  meshes: InstancedMesh[] = [];
  idx = 0;
  glow = 1;                // glow multiplier for 'glow' parts (read by renderer after pose)
  fade = 1;                // brightness multiplier for 'ghost' (additive) parts: 0 = invisible
  private base = new Matrix4(); private local = new Matrix4(); private out = new Matrix4();
  private q = new Quaternion(); private qb = new Quaternion(); private eul = new Euler(); private p = new Vector3(); private s = new Vector3();
  bx = 0; by = 0; bz = 0; yaw = 0; sc = 1; fx = 1; fy = 1; yOff = 0;
  begin(x: number, y: number, z: number, yaw: number, scale: number, fx = 1, fy = 1, yOff = 0) { this.bx = x; this.by = y; this.bz = z; this.yaw = yaw; this.sc = scale; this.fx = fx; this.fy = fy; this.yOff = yOff; this.glow = 1; this.fade = 1; this.body(0, 0, 0, 1, 1); }
  /** adjust whole-body transform: dy offset, pitch (lean fwd +), roll, horizontal and vertical squash */
  body(dy: number, pitch: number, roll: number, sxz: number, sy: number) {
    this.eul.set(pitch, this.yaw, roll, 'YXZ');
    this.qb.setFromEuler(this.eul);
    this.p.set(this.bx, this.by + this.yOff + dy * this.sc * this.fy, this.bz);
    this.s.set(this.sc * sxz * this.fx, this.sc * sy * this.fy, this.sc * sxz * this.fx);
    this.base.compose(this.p, this.qb, this.s);
  }
  part(i: number, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    this.eul.set(rx, ry, rz, 'YXZ'); this.q.setFromEuler(this.eul);
    this.p.set(px, py, pz); this.s.set(sx, sy, sz);
    this.local.compose(this.p, this.q, this.s);
    this.out.multiplyMatrices(this.base, this.local);
    this.meshes[i].setMatrixAt(this.idx, this.out);
  }
}

const sin = Math.sin, cos = Math.cos, max = Math.max, abs = Math.abs;

/** limb hanging down from its pivot (origin) */
function limb(b: GB, len: number, r0: number, r1: number, color: string, hand?: string, handR = 0) {
  b.cyl(r0, r1, len, 6, [0, -len / 2, 0], color);
  if (hand) b.sph(handR || r1 * 1.4, [0, -len, 0], hand, 1, 6);
  return b;
}

// ------------------------------------------------------------------ SLIME ---
function slime(): ModelDef {
  const body = new GB([0.9, 1.15]).sph(0.62, [0, 0.55, 0], '#8be04a', [1, 0.86, 1], 12).build();
  const core = new GB([1, 1]).ico(0.2, [0, 0.5, 0], '#3f9a1c', 1, 1).sph(0.06, [0.3, 0.35, 0.1], '#6fc22a', 1, 5).sph(0.05, [-0.28, 0.75, -0.1], '#6fc22a', 1, 5).sph(0.04, [0.1, 0.8, -0.3], '#6fc22a', 1, 5).build();
  const eyes = new GB([1, 1]);
  for (const s of [-1, 1]) {
    eyes.sph(0.13, [s * 0.2, 0.68, 0.45], '#ffffff', [1, 1.15, 0.7], 7); eyes.sph(0.065, [s * 0.2, 0.66, 0.55], '#101018', [1, 1, 0.6], 6);
  }
  eyes.box(0.2, 0.05, 0.04, [0, 0.46, 0.58], '#2a5a14');
  return {
    parts: [{ geo: body, mat: 'jelly' }, { geo: core, mat: 'lit' }, { geo: eyes.build(), mat: 'lit' }], headY: 1.15, shadow: 0.75,
    pose(e, P, t) {
      const h = max(0, sin(t * 5)), w = e.state === 'WINDUP' ? 1 : 0;
      P.body(h * 0.55, 0, 0, 1.1 - 0.2 * h, 0.8 + 0.45 * h);
      P.part(0, 0, 0, 0);
      P.part(1, sin(t * 3) * 0.05, h * 0.06 - 0.03, cos(t * 2.3) * 0.05);
      P.part(2, 0, h * 0.05, 0.0);
      void w;
    },
  };
}

function splitter(): ModelDef {
  const body = new GB([0.85, 1.15]).sph(0.78, [0, 0.7, 0], '#2fb89a', [1, 0.88, 1], 12).build();
  const lit = new GB([0.8, 1.2]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; lit.cone(0.1, 0.34, 4, [cos(a) * 0.5, 1.2 - (i % 2) * 0.1, sin(a) * 0.5], '#1f7f6e', [sin(a) * 0.5, 0, -cos(a) * 0.5]); }
  lit.cone(0.13, 0.42, 4, [0, 1.42, 0], '#1f7f6e');
  for (let i = 0; i < 4; i++) { const a = i * 1.7; lit.sph(0.07, [cos(a) * 0.3, 0.45 + i * 0.1, sin(a) * 0.3], '#5fe0c0', 1, 5); }
  for (const s of [-1, 1]) { lit.sph(0.15, [s * 0.26, 0.88, 0.55], '#ffe14a', [1, 0.9, 0.7], 7); lit.sph(0.07, [s * 0.26, 0.87, 0.66], '#201010', [1, 1.3, 0.6], 6); lit.box(0.3, 0.07, 0.08, [s * 0.26, 1.04, 0.6], '#143a34', [0, 0, s * -0.4]); }
  const core = new GB([1, 1]).ico(0.3, [0, 0.62, 0], '#b070ff', 1, 1).build();
  return {
    parts: [{ geo: body, mat: 'jelly' }, { geo: lit.build(), mat: 'lit' }, { geo: core, mat: 'glow' }], headY: 1.6, shadow: 0.95,
    pose(e, P, t) {
      const h = max(0, sin(t * 5));
      P.body(h * 0.7, 0, 0, 1.08 - 0.16 * h, 0.82 + 0.38 * h);
      P.part(0, 0, 0, 0);
      P.part(1, 0, 0, 0);
      const pulse = 1 + 0.18 * sin(t * 6);
      P.part(2, 0, 0, 0, t * 1.5, t * 2.1, 0, pulse);
      P.glow = 1.2 + 0.6 * sin(t * 6);
    },
  };
}

// ----------------------------------------------------------------- GOBLIN ---
function goblin(): ModelDef {
  const skin = '#62a82f', skin2 = '#79c43e';
  const body = new GB([0.82, 1.1]);
  body.box(0.46, 0.5, 0.3, [0, 0.88, 0], '#5a9a2a'); body.sph(0.27, [0, 0.8, 0.06], '#6bb336', [1, 0.9, 0.8], 7);
  body.cyl(0.26, 0.3, 0.3, 7, [0, 0.58, 0], '#7a4a22');  // loincloth
  body.box(0.5, 0.06, 0.34, [0, 0.72, 0], '#3a2616');
  body.sph(0.29, [0, 1.3, 0.04], skin2, [1.08, 1, 1], 8);
  for (const s of [-1, 1]) {
    body.cone(0.1, 0.44, 4, [s * 0.36, 1.36, 0], skin2, [0, 0, -s * 1.25]); body.cone(0.06, 0.3, 4, [s * 0.33, 1.35, 0.02], '#e89a8a', [0, 0, -s * 1.25]);
    body.sph(0.07, [s * 0.11, 1.35, 0.25], '#ffe14a', 1, 6); body.sph(0.035, [s * 0.11, 1.35, 0.31], '#101018', 1, 5);
    body.box(0.15, 0.04, 0.05, [s * 0.11, 1.44, 0.26], '#2a4a14', [0, 0, s * 0.35]);
  }
  body.cone(0.06, 0.16, 4, [0, 1.27, 0.32], skin, [Math.PI / 2, 0, 0]);
  body.box(0.18, 0.05, 0.05, [0, 1.17, 0.27], '#2a1a14');
  for (const s of [-1, 1]) body.cone(0.02, 0.07, 3, [s * 0.05, 1.2, 0.29], '#ffffff', [Math.PI, 0, 0]);
  const armL = limb(new GB([0.85, 1.1]), 0.5, 0.07, 0.06, skin, skin2, 0.09).build();
  const armRb = limb(new GB([0.85, 1.1]), 0.5, 0.07, 0.06, skin, skin2, 0.09);
  // club: extends along local -y past hand, angled forward
  armRb.cyl(0.04, 0.05, 0.55, 5, [0, -0.62, 0.12], '#6a4828', [0.5, 0, 0]);
  armRb.ico(0.17, [0, -0.88, 0.26], '#7a5430', [1, 1.3, 1], 0);
  for (let i = 0; i < 5; i++) { const a = i * 1.3; armRb.cone(0.04, 0.12, 4, [cos(a) * 0.15, -0.88 + sin(a * 2) * 0.1, 0.26 + sin(a) * 0.15], '#c8ccd2', [sin(a) * 1.4, 0, -cos(a) * 1.4]); }
  const legL = limb(new GB([0.8, 1.1]), 0.5, 0.09, 0.07, skin).box(0.14, 0.07, 0.24, [0, -0.5, 0.05], '#4a3a24').build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: armL, mat: 'lit' }, { geo: armRb.build(), mat: 'lit' }, { geo: legL, mat: 'lit' }, { geo: legL, mat: 'lit' }], headY: 1.75, shadow: 0.6,
    pose(e, P, t) {
      const ph = t * 9, atk = e.state === 'ATTACK' ? 1 : 0;
      P.body(abs(sin(ph)) * 0.08, 0.12, sin(ph) * 0.1, 1, 1);
      P.part(0, 0, 0, 0);
      P.part(1, -0.34, 1.08, 0, sin(ph) * 0.8, 0, 0.1);
      P.part(2, 0.34, 1.08, 0, -sin(ph) * 0.7 - 0.5 - atk * 1.3, 0, -0.1);
      P.part(3, -0.13, 0.52, 0, -sin(ph) * 0.9);
      P.part(4, 0.13, 0.52, 0, sin(ph) * 0.9);
    },
  };
}

// -------------------------------------------------------------------- BAT ---
function bat(): ModelDef {
  const fur = '#4a3566', fur2 = '#35244c';
  const body = new GB([0.8, 1.15]);
  body.sph(0.3, [0, 0, 0], fur, [0.85, 0.8, 1.15], 8);
  body.sph(0.21, [0, 0.1, 0.38], fur, 1, 7);
  for (const s of [-1, 1]) {
    body.cone(0.09, 0.3, 4, [s * 0.13, 0.32, 0.36], fur2, [0, 0, -s * 0.2]); body.cone(0.05, 0.2, 4, [s * 0.13, 0.31, 0.37], '#d89ab0', [0, 0, -s * 0.2]);
    body.cone(0.02, 0.09, 3, [s * 0.06, -0.02, 0.5], '#ffffff', [Math.PI, 0, 0]);
    body.cyl(0.02, 0.02, 0.2, 3, [s * 0.1, -0.33, -0.1], fur2);
  }
  body.cone(0.05, 0.1, 4, [0, 0.07, 0.58], '#2a1a30', [Math.PI / 2, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.05, [s * 0.09, 0.15, 0.53], '#ff3a3a', 1, 5);
  // wing for +x side, pivot at shoulder
  const w = new GB([0.85, 1.1]);
  w.box(0.95, 0.05, 0.06, [0.48, 0.05, 0], fur2, [0, 0, 0.12]);
  const tip: [number, number, number] = [0.98, 0.17, 0];
  const fing: [number, number, number][] = [[0.78, -0.32, 0.38], [0.72, -0.28, -0.1], [0.3, -0.12, -0.42], [0.62, -0.3, 0.7]];
  for (const f of fing) {
    const len = Math.hypot(f[0] - 0.0, f[1], f[2]);
    w.cyl(0.015, 0.02, len * 0.7, 3, [(f[0]) * 0.5 + 0.5 * 0.0, f[1] * 0.5, f[2] * 0.5], fur2, [f[2] * 0.0 + 0, 0, 0]);
  }
  w.tri([0.0, 0.0, 0.1], tip, [0.78, -0.32, 0.38], '#5a3f7a'); w.tri([0.0, 0.0, 0.1], [0.78, -0.32, 0.38], [0.3, -0.12, 0.5], '#5a3f7a');
  w.tri([0.0, 0.0, -0.1], tip, [0.72, -0.28, -0.1], '#5a3f7a'); w.tri([0.0, 0.0, -0.1], [0.72, -0.28, -0.1], [0.3, -0.12, -0.42], '#4e3470');
  w.tri(tip, [0.78, -0.32, 0.38], [0.72, -0.28, -0.1], '#6a4a8a');
  const wing = w.build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: wing, mat: 'lit2' }, { geo: wing, mat: 'lit2' }], headY: 2.2, shadow: 0.55,
    pose(e, P, t) {
      const flap = sin(t * 20), hov = 1.5 + sin(t * 3 + e.id) * 0.15 + (e.state === 'SPAWN' ? 0 : 0);
      P.body(hov, 0.25 + abs(flap) * 0.05, sin(t * 2.3 + e.id) * 0.2, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.part(2, 0.2, 0.08, 0, 0.05, 0, flap * 0.85 + 0.15);
      P.part(3, -0.2, 0.08, 0, 0.05, 0, -(flap * 0.85 + 0.15), -1, 1, 1);
      P.glow = 1.4;
    },
  };
}

// --------------------------------------------------------------- SKELETON ---
function skeleton(): ModelDef {
  const bone = '#ebe5d0', bone2 = '#c9c2a8';
  const body = new GB([0.85, 1.1]);
  body.sph(0.2, [0, 1.62, 0], bone, [1, 1.05, 1.05], 8); body.box(0.2, 0.07, 0.17, [0, 1.44, 0.07], bone2);
  for (const s of [-1, 1]) body.sph(0.065, [s * 0.075, 1.63, 0.17], '#15110e', 1, 6);
  body.box(0.05, 0.07, 0.04, [0, 1.56, 0.2], '#15110e');
  body.cyl(0.035, 0.04, 0.6, 5, [0, 1.1, 0], bone2);
  for (let i = 0; i < 4; i++) body.torus(0.17 - i * 0.012, 0.018, [0, 1.3 - i * 0.12, 0.0], bone, [Math.PI / 2, 0, 0], [1, 0.75, 1], 8);
  body.box(0.46, 0.05, 0.08, [0, 1.4, 0], bone); body.box(0.3, 0.1, 0.18, [0, 0.76, 0], bone2);
  body.cyl(0.07, 0.07, 0.5, 6, [-0.09, 1.2, -0.22], '#6a4828', [0.25, 0, 0.1]);
  for (let i = 0; i < 3; i++) body.box(0.02, 0.02, 0.2, [-0.09 + (i - 1) * 0.03, 1.5, -0.27], '#cfcfc0', [0.25, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.032, [s * 0.075, 1.63, 0.2], '#ff3a2a', 1, 5);
  const legs = limb(new GB([0.85, 1.1]), 0.76, 0.045, 0.035, bone2).sph(0.06, [0, -0.38, 0.0], bone, 1, 5).box(0.1, 0.05, 0.2, [0, -0.76, 0.05], bone).build();
  const armR = limb(new GB([0.85, 1.1]), 0.55, 0.035, 0.03, bone2, bone, 0.05).build();
  const bow = makeBow('#aa2222', 0);
  const armLb = limb(new GB([0.85, 1.1]), 0.55, 0.035, 0.03, bone2, bone, 0.05);
  armLb.addColored(bow.body, [0, -0.55, 0], [Math.PI / 2, 0, 0], 0.62);
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armR, mat: 'lit' }, { geo: armLb.build(), mat: 'lit' }, { geo: legs, mat: 'lit' }, { geo: legs, mat: 'lit' }],
    headY: 2.1, shadow: 0.6,
    pose(e, P, t) {
      const ph = t * 5.5, moving = e.state === 'WINDUP' ? 0 : 1;
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 0.6, 0, 1) : 0;
      const rec = e.state === 'ATTACK' ? clamp(1 - e.stateT / 0.25, 0, 1) : 0;
      P.body(abs(sin(ph)) * 0.04 * moving, -0.08 * k + rec * -0.1, sin(ph) * 0.03 * moving, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const raise = max(k, rec * 0.8);
      P.part(2, 0.26, 1.38, 0, lerp(-sin(ph) * 0.5 * moving, -1.25 - k * 0.45, max(raise, 0)), lerp(0, -0.5, k), 0);
      P.part(3, -0.26, 1.38, 0, lerp(sin(ph) * 0.5 * moving, -1.5, max(raise, 0)), lerp(0, 0.1, k), 0.05);
      P.part(4, -0.1, 0.78, 0, -sin(ph) * 0.55 * moving); P.part(5, 0.1, 0.78, 0, sin(ph) * 0.55 * moving);
      P.glow = 1.2 + k * 3;
    },
  };
}

// ---------------------------------------------------------------- CULTIST ---
function cultist(): ModelDef {
  const robe = '#5b2a8a', robe2 = '#3d1a63', gold = '#e0b040';
  const body = new GB([0.7, 1.15]);
  body.cone(0.62, 1.55, 10, [0, 0.78, 0], robe); body.torus(0.55, 0.05, [0, 0.1, 0], gold, [Math.PI / 2, 0, 0], 1, 14);
  body.cyl(0.28, 0.34, 0.1, 10, [0, 0.95, 0], gold);
  body.sph(0.3, [0, 1.45, 0], robe2, [1.2, 0.8, 1.1], 8);
  body.sph(0.32, [0, 1.68, 0], robe2, [1, 1.1, 1.05], 8); body.cone(0.3, 0.55, 8, [0, 2.0, -0.08], robe2, [-0.3, 0, 0]);
  body.sph(0.23, [0, 1.64, 0.14], '#0a0610', [1, 1.1, 0.8], 8);
  body.box(0.1, 0.8, 0.02, [0, 0.8, 0.5], gold);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.box(0.09, 0.035, 0.03, [s * 0.09, 1.66, 0.3], '#ff6ae0', [0, 0, s * -0.25]);
  const sleeve = new GB([0.8, 1.1]); sleeve.cyl(0.13, 0.09, 0.5, 6, [0, -0.25, 0], robe); sleeve.torus(0.1, 0.025, [0, -0.5, 0], gold, [Math.PI / 2, 0, 0], 1, 8);
  const sl = sleeve.build();
  const orb = new GB([1, 1]).sph(0.12, [0, 0, 0], '#e070ff', 1, 8).build();
  const big = new GB([1, 1]).sph(0.3, [0, 0, 0], '#ff70f0', 1, 8).ico(0.42, [0, 0, 0], '#9a40ff', 1, 1).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: sl, mat: 'lit' }, { geo: sl, mat: 'lit' }, { geo: orb, mat: 'glow' }, { geo: orb, mat: 'glow' }, { geo: big, mat: 'glow' }],
    headY: 2.5, shadow: 0.7,
    pose(e, P, t) {
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 0.8, 0, 1) : e.state === 'ATTACK' ? 1 : 0;
      const hov = 0.12 + sin(t * 2.2) * 0.06;
      P.body(hov, k * -0.08, sin(t * 1.7) * 0.04, 1, 1);
      P.part(0, 0, 0, 0, 0, sin(t * 1.3) * 0.05, 0); P.part(1, 0, 0, 0);
      const a = lerp(0.8, 2.1, k), L = 0.5, sy = 1.35;
      for (const s of [-1, 1]) {
        P.part(s < 0 ? 2 : 3, s * 0.32, sy, 0, -a, 0, s * 0.18);
        const tipY = sy - L * cos(a) + hov * 0, tipZ = L * sin(a);
        P.part(s < 0 ? 4 : 5, s * 0.36, tipY - 0.02, tipZ + 0.02, 0, 0, 0, 0.8 + k * 0.9 + sin(t * 8 + s) * 0.08);
      }
      P.part(6, 0, 1.55 + sin(t * 3) * 0.05, 0.75 + k * 0.2, t * 2, t * 3, 0, k < 0.05 ? 0.001 : k * 0.9);
      P.glow = 1.4 + k * 2.6;
    },
  };
}

// ----------------------------------------------------------------- BOMBER ---
function bomber(): ModelDef {
  const shell = '#d4561b', dark = '#2a2020';
  const body = new GB([0.8, 1.12]);
  body.sph(0.52, [0, 0.5, 0.0], shell, [1.05, 0.72, 1.2], 10);
  body.box(0.03, 0.4, 1.0, [0, 0.82, 0.0], dark);
  for (const [x, z] of [[0.28, 0.1], [-0.28, 0.1], [0.2, -0.25], [-0.2, -0.25]]) body.sph(0.1, [x, 0.74, z], dark, [1, 0.3, 1], 6);
  body.sph(0.23, [0, 0.38, 0.62], dark, 1, 8);
  for (const s of [-1, 1]) {
    body.cone(0.05, 0.22, 4, [s * 0.1, 0.27, 0.8], '#6a5a4a', [Math.PI / 2 + 0.3, 0, s * 0.3]);
    body.sph(0.06, [s * 0.11, 0.45, 0.76], '#ffffff', 1, 5); body.sph(0.03, [s * 0.11, 0.45, 0.8], '#101018', 1, 4);
    body.cyl(0.012, 0.012, 0.4, 3, [s * 0.1, 0.7, 0.85], dark, [0.7, 0, s * 0.3]);
  }
  body.cyl(0.03, 0.03, 0.25, 4, [0, 0.95, -0.45], '#6a5a4a');
  const legs = (s: number) => {
    const g = new GB([0.8, 1.1]);
    for (let i = 0; i < 3; i++) { g.box(0.45, 0.04, 0.05, [s * 0.22, 0, (i - 1) * 0.3], dark, [0, (i - 1) * 0.35 * s, -s * 0.6]); g.box(0.04, 0.3, 0.05, [s * 0.4, -0.12, (i - 1) * 0.34], dark, [0, 0, s * 0.3]); }
    return g.build();
  };
  const sack = new GB([1, 1]).sph(0.3, [0, 0.58, -0.62], '#ff3a1a', 1, 8).build();
  const spark = new GB([1, 1]).sph(0.07, [0, 1.1, -0.45], '#ffe060', 1, 5).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: legs(1), mat: 'lit' }, { geo: legs(-1), mat: 'lit' }, { geo: sack, mat: 'glow' }, { geo: spark, mat: 'glow' }], headY: 1.4, shadow: 0.7,
    pose(e, P, t) {
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 1.0, 0, 1) : 0;
      const rate = lerp(3, 14, k) * (k > 0.7 ? 1.5 : 1);
      const blink = 0.5 + 0.5 * sin(t * rate * TAU * 0.5 + (k > 0 ? e.stateT * 40 : 0));
      const sw = 1 + k * 0.28 + blink * 0.05 * (1 + k * 3);
      const sh = k > 0 ? sin(e.stateT * 70) * 0.03 * k : 0;
      P.body(abs(sin(t * 14)) * 0.04, 0, sh * 2, sw, sw);
      P.part(0, 0, 0, 0);
      P.part(1, 0, 0.3, 0, 0, sin(t * 14) * 0.3, 0); P.part(2, 0, 0.3, 0, 0, -sin(t * 14) * 0.3, 0);
      P.part(3, 0, 0, 0, 0, 0, 0, 1 + blink * 0.12 + k * 0.2);
      P.part(4, 0, 0, 0);
      P.glow = 0.9 + blink * (1.4 + k * 3.2);
    },
  };
}

// ------------------------------------------------------------------ BRUTE ---
function brute(): ModelDef {
  const skin = '#a8744a', skin2 = '#bd8a5c', dark = '#4a3022';
  const body = new GB([0.8, 1.12]);
  body.sph(0.62, [0, 1.0, 0.05], skin, [1.15, 1.0, 1.0], 9); body.sph(0.5, [0, 1.35, 0], skin2, [1.35, 0.7, 1.0], 8);
  body.sph(0.27, [0, 1.72, 0.18], skin2, [1, 0.95, 1], 8); body.box(0.5, 0.09, 0.2, [0, 1.84, 0.34], dark, [0.2, 0, 0]);
  for (const s of [-1, 1]) {
    body.cone(0.06, 0.3, 4, [s * 0.15, 1.62, 0.42], '#f2ecd8', [-0.2, 0, -s * 0.15]);
    body.cone(0.07, 0.2, 4, [s * 0.3, 1.78, 0.1], skin2, [0, 0, -s * 1.2]);
  }
  body.box(0.3, 0.07, 0.05, [0, 1.58, 0.43], '#2a1210');
  body.box(0.85, 0.16, 0.6, [0, 0.62, 0.05], dark); body.cone(0.45, 0.4, 6, [0, 0.38, 0.05], '#6a4a2a', [Math.PI, 0, 0]);
  for (let i = 0; i < 6; i++) body.cone(0.05, 0.18, 4, [-0.4 + i * 0.16, 0.66, 0.36], '#c8ccd2', [Math.PI / 2, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.055, [s * 0.1, 1.77, 0.4], '#ff3030', 1, 5);
  const armL = limb(new GB([0.8, 1.1]), 0.85, 0.17, 0.15, skin, skin2, 0.22).build();
  const armRb = limb(new GB([0.8, 1.1]), 0.85, 0.17, 0.15, skin, skin2, 0.22);
  armRb.cyl(0.07, 0.09, 1.2, 6, [0, -1.05, 0.2], '#6a4828', [0.25, 0, 0]);
  armRb.ico(0.34, [0, -1.7, 0.4], '#7a5430', [1, 1.3, 1], 0);
  for (let i = 0; i < 8; i++) { const a = i * 0.9; armRb.cone(0.06, 0.2, 4, [cos(a) * 0.3, -1.7 + sin(a * 1.7) * 0.2, 0.4 + sin(a) * 0.3], '#c8ccd2', [sin(a) * 1.4, 0, -cos(a) * 1.4]); }
  const leg = limb(new GB([0.8, 1.1]), 0.75, 0.18, 0.15, skin).box(0.3, 0.12, 0.42, [0, -0.75, 0.08], dark).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armL, mat: 'lit' }, { geo: armRb.build(), mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.2, shadow: 0.9,
    pose(e, P, t) {
      const charge = e.state === 'ATTACK' ? 1 : 0;
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 0.9, 0, 1) : 0;
      const ph = t * (charge ? 13 : 4.5);
      const shake = k * sin(t * 55) * 0.02;
      P.body(abs(sin(ph)) * (charge ? 0.1 : 0.07), -0.4 * k + 0.42 * charge, sin(ph) * (charge ? 0.03 : 0.06) + shake, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.part(2, -0.72, 1.4, 0, -sin(ph) * 0.5 - k * 1.2 + charge * 0.9, 0, 0.15);
      P.part(3, 0.72, 1.4, 0, sin(ph) * 0.4 - k * 2.7 + charge * 0.7, 0, -0.15);
      P.part(4, -0.27, 0.78, 0, -sin(ph) * 0.7); P.part(5, 0.27, 0.78, 0, sin(ph) * 0.7);
      P.glow = 1.2 + k * 3.4 + charge * 1.5;
    },
  };
}


// ================================================================ REGIONAL KINDS ===
// ----------------------------------------------------------------- ZOMBIE ---
function zombie(): ModelDef {
  const skin = '#6f8a5a', skin2 = '#5a7448', rag = '#4a3a2c', dark = '#2a2a1e';
  const body = new GB([0.8, 1.12]);
  body.box(0.5, 0.62, 0.3, [0, 1.0, 0], rag); body.sph(0.3, [0, 1.0, 0.04], skin2, [1, 1.1, 0.7], 7);
  body.box(0.52, 0.12, 0.32, [0, 0.66, 0], dark);
  body.sph(0.27, [0, 1.52, 0.08], skin, [1, 1.05, 1], 8);
  body.box(0.28, 0.08, 0.1, [0, 1.38, 0.28], '#3a2a1a'); // slack jaw
  for (const s of [-1, 1]) { body.sph(0.06, [s * 0.1, 1.56, 0.3], '#e8e0a0', 1, 5); body.sph(0.025, [s * 0.1, 1.56, 0.35], '#101008', 1, 4); }
  body.box(0.3, 0.05, 0.05, [0, 1.62, 0.31], '#3a4a2a', [0, 0, 0.2]);
  body.cone(0.05, 0.16, 4, [0.18, 1.8, 0], '#2a3a1a', [0, 0, -0.5]); // tuft
  const arm = limb(new GB([0.8, 1.1]), 0.62, 0.08, 0.07, skin, skin2, 0.1).build();
  const leg = limb(new GB([0.8, 1.1]), 0.62, 0.1, 0.08, rag).box(0.14, 0.07, 0.26, [0, -0.62, 0.06], dark).build();
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.03, [s * 0.1, 1.56, 0.36], '#ffe040', 1, 4);
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: arm, mat: 'lit' }, { geo: arm, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }],
    headY: 2.0, shadow: 0.8,
    pose(e, P, t) {
      const ph = t * 3.2, k = e.state === 'WINDUP' ? clamp(e.stateT / 0.6, 0, 1) : e.state === 'ATTACK' ? 1 : 0;
      P.body(abs(sin(ph)) * 0.05, 0.1 + k * 0.28, sin(ph) * 0.09, 1, 1);
      P.part(0, 0, 0, 0);
      const up = -1.45 * lerp(0.55, 1, k);
      P.part(1, -0.36, 1.25, 0.02, up + sin(ph) * 0.12, 0, 0.12 + k * 0.1);
      P.part(2, 0.36, 1.25, 0.02, up - sin(ph) * 0.12, 0, -0.12 - k * 0.1);
      P.part(3, -0.14, 0.68, 0, -sin(ph) * 0.55); P.part(4, 0.14, 0.68, 0, sin(ph) * 0.55 * 0.9);
      P.part(5, 0, 0, 0);
      P.glow = 1.1 + k * 2.5;
    },
  };
}

// ----------------------------------------------------------------- WRAITH ---
function wraith(): ModelDef {
  const cloak = '#9bdcff', cloak2 = '#5aa6d8';
  const body = new GB([0.7, 1.15]);
  body.cone(0.55, 1.6, 8, [0, 0.9, 0], cloak2);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; body.cone(0.12, 0.7, 4, [cos(a) * 0.42, 0.2, sin(a) * 0.42], cloak, [0, 0, 0], ); }
  body.sph(0.3, [0, 1.65, 0], cloak, [1, 1.15, 1], 8);
  body.cone(0.32, 0.5, 8, [0, 1.95, -0.08], cloak2, [-0.35, 0, 0]);
  body.sph(0.2, [0, 1.62, 0.14], '#04101a', [1, 1.1, 0.8], 7);
  const arm = new GB([0.8, 1.1]); arm.cone(0.1, 0.9, 5, [0, -0.4, 0], cloak, [Math.PI, 0, 0]); arm.cone(0.03, 0.2, 4, [0.04, -0.9, 0.04], cloak2, [Math.PI, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.045, [s * 0.08, 1.64, 0.26], '#ffffff', [1, 1.4, 0.6], 5);
  return {
    parts: [{ geo: body.build(), mat: 'ghost' }, { geo: arm.build(), mat: 'ghost' }, { geo: arm.build(), mat: 'ghost' }, { geo: eyes.build(), mat: 'glow' }],
    headY: 2.4, shadow: 0.55,
    pose(e, P, t) {
      const wind = e.state === 'WINDUP' ? clamp(e.stateT / 0.75, 0, 1) : 0;
      const lunge = e.state === 'ATTACK' ? 1 : 0;
      const hov = 0.35 + sin(t * 2.4 + e.id) * 0.12;
      P.body(hov, 0.1 + lunge * 0.6, sin(t * 1.5) * 0.05, 1 - wind * 0.25, 1 + wind * 0.1 + lunge * 0.15);
      P.part(0, 0, 0, 0, 0, sin(t * 1.1) * 0.15, 0);
      const r = 0.7 + lunge * 1.2 + wind * 0.6;
      P.part(1, -0.38, 1.45, 0.05, -r, 0, 0.35 + sin(t * 2) * 0.1);
      P.part(2, 0.38, 1.45, 0.05, -r, 0, -0.35 - sin(t * 2) * 0.1);
      P.part(3, 0, 0, 0);
      // phase out while winding up (untargetable), solid-ish while lunging
      P.fade = e.state === 'WINDUP' ? 0.12 + 0.1 * sin(e.stateT * 30) : e.state === 'ATTACK' ? 0.9 : 0.55 + 0.1 * sin(t * 3);
      P.glow = 0.4 + P.fade * 2;
    },
  };
}

// ------------------------------------------------------- CRYSTAL GOLEMITE ---
function golemite(): ModelDef {
  const rock = '#6a5a80', rock2 = '#4a3e60';
  const body = new GB([0.8, 1.15]);
  body.ico(0.55, [0, 0.75, 0], rock, [1.05, 0.95, 0.95], 0);
  body.ico(0.34, [0, 1.35, 0.02], rock2, 1, 0);
  body.box(0.5, 0.2, 0.4, [0, 0.35, 0], rock2);
  for (const s of [-1, 1]) { body.ico(0.2, [s * 0.58, 1.0, 0], rock, 1, 0); }
  const cry = new GB([1, 1.15]);
  for (let i = 0; i < 7; i++) { const a = i * 2.4; cry.cone(0.1, 0.5 + (i % 3) * 0.14, 5, [cos(a) * 0.38, 1.05 + sin(a * 1.3) * 0.25, sin(a) * 0.38], '#f0a0ff', [sin(a) * 0.9, 0, -cos(a) * 0.9]); }
  cry.cone(0.14, 0.6, 5, [0, 1.75, 0], '#ffd0ff');
  const core = new GB([1, 1]).ico(0.2, [0, 0.8, 0.32], '#ff80ff', 1, 0).build();
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.box(0.1, 0.045, 0.03, [s * 0.1, 1.38, 0.3], '#ffffff');
  const arm = limb(new GB([0.85, 1.1]), 0.5, 0.15, 0.12, rock2).ico(0.17, [0, -0.52, 0], rock, 1, 0).build();
  const leg = limb(new GB([0.8, 1.1]), 0.36, 0.14, 0.12, rock2).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: cry.build(), mat: 'jelly' }, { geo: core, mat: 'glow' }, { geo: eyes.build(), mat: 'glow' }, { geo: arm, mat: 'lit' }, { geo: arm, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.0, shadow: 0.8,
    pose(e, P, t) {
      const ph = t * 3.6, low = e.hp < e.maxHp * 0.3 ? 1 : 0;
      P.body(abs(sin(ph)) * 0.06, 0.05, sin(ph) * 0.07 + low * sin(t * 40) * 0.02, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0, 0, t * 0.2, 0);
      P.part(2, 0, 0, 0, 0, 0, 0, 1 + 0.15 * sin(t * (4 + low * 14)));
      P.part(3, 0, 0, 0);
      P.part(4, -0.66, 1.1, 0, -sin(ph) * 0.5, 0, 0.12); P.part(5, 0.66, 1.1, 0, sin(ph) * 0.5, 0, -0.12);
      P.part(6, -0.2, 0.4, 0, -sin(ph) * 0.6); P.part(7, 0.2, 0.4, 0, sin(ph) * 0.6);
      P.glow = 1.3 + low * (1 + sin(t * 30)) * 1.5;
    },
  };
}

// ----------------------------------------------------------------- BANDIT ---
function bandit(): ModelDef {
  const cloth = '#7a3a22', skin = '#d0a07a', dark = '#2a1a14', bandana = '#b02a2a';
  const body = new GB([0.8, 1.1]);
  body.box(0.48, 0.58, 0.28, [0, 0.98, 0], cloth); body.box(0.5, 0.08, 0.3, [0, 0.72, 0], dark);
  body.cone(0.34, 0.5, 6, [0, 0.55, 0], '#5a2a18', [Math.PI, 0, 0]);
  body.sph(0.25, [0, 1.52, 0.03], skin, 1, 8);
  body.box(0.3, 0.11, 0.3, [0, 1.63, 0.02], bandana); body.box(0.3, 0.14, 0.05, [0, 1.46, 0.2], bandana); // mask
  body.cone(0.06, 0.25, 4, [-0.18, 1.6, -0.2], bandana, [0.9, 0, 0.3]);
  for (const s of [-1, 1]) body.sph(0.035, [s * 0.09, 1.56, 0.22], '#101010', 1, 4);
  body.box(0.5, 0.05, 0.1, [0, 1.15, 0.0], dark, [0, 0, 0.4]); // bandolier
  const arm = limb(new GB([0.8, 1.1]), 0.5, 0.07, 0.06, cloth, skin, 0.08).build();
  const blade = limb(new GB([0.8, 1.1]), 0.5, 0.07, 0.06, cloth, skin, 0.08);
  blade.box(0.05, 0.62, 0.02, [0, -0.85, 0.12], '#d8dce2', [0.3, 0, 0]); blade.box(0.16, 0.04, 0.05, [0, -0.54, 0.06], '#5a4a30', [0.3, 0, 0]);
  const leg = limb(new GB([0.8, 1.1]), 0.55, 0.09, 0.07, '#3a2a1e').box(0.13, 0.07, 0.24, [0, -0.55, 0.05], dark).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: arm, mat: 'lit' }, { geo: blade.build(), mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 1.9, shadow: 0.6,
    pose(e, P, t) {
      const ph = t * 12, wind = e.state === 'WINDUP' ? clamp(e.stateT / 0.5, 0, 1) : 0, dash = e.state === 'ATTACK' ? 1 : 0;
      P.body(abs(sin(ph)) * 0.08 * (1 - dash), 0.15 + dash * 0.55 - wind * 0.25, sin(ph) * 0.08, 1, 1);
      P.part(0, 0, 0, 0);
      P.part(1, -0.32, 1.12, 0, sin(ph) * 0.8 * (1 - dash) + dash * 0.6, 0, 0.1);
      P.part(2, 0.32, 1.12, 0, -sin(ph) * 0.6 - 0.8 - wind * 1.1 - dash * 0.9, 0, -0.1);
      P.part(3, -0.12, 0.56, 0, -sin(ph) * 1.0); P.part(4, 0.12, 0.56, 0, sin(ph) * 1.0);
    },
  };
}

// ------------------------------------------------------------------- BOAR ---
function boar(): ModelDef {
  const fur = '#6a4428', fur2 = '#4a2e1a', tusk = '#f2ecd8';
  const body = new GB([0.8, 1.12]);
  body.sph(0.55, [0, 0.8, -0.1], fur, [0.95, 0.9, 1.45], 9);
  body.sph(0.5, [0, 0.95, 0.35], fur2, [1.0, 1.0, 0.9], 8); // shoulders
  body.sph(0.36, [0, 0.82, 0.8], fur, [1, 0.95, 1.05], 8);
  body.cyl(0.17, 0.2, 0.28, 7, [0, 0.72, 1.12], '#c08a78', [Math.PI / 2, 0, 0]); // snout
  for (const s of [-1, 1]) {
    body.cone(0.06, 0.34, 4, [s * 0.18, 0.72, 1.08], tusk, [-0.9, 0, -s * 0.5]);
    body.cone(0.09, 0.22, 4, [s * 0.2, 1.12, 0.66], fur2, [0, 0, -s * 0.3]);
    body.sph(0.045, [s * 0.19, 0.94, 0.95], '#ffd24a', 1, 5);
  }
  for (let i = 0; i < 6; i++) body.cone(0.05, 0.22, 4, [0, 1.28 - i * 0.04, 0.5 - i * 0.28], fur2, [0.2, 0, 0]); // mane
  body.cyl(0.03, 0.02, 0.3, 4, [0, 0.95, -0.82], fur2, [-0.9, 0, 0]);
  const leg = limb(new GB([0.8, 1.1]), 0.5, 0.1, 0.08, fur2).box(0.13, 0.06, 0.16, [0, -0.5, 0.04], '#2a1a10').build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 1.7, shadow: 0.95,
    pose(e, P, t) {
      const charge = e.state === 'ATTACK' ? 1 : 0, k = e.state === 'WINDUP' ? clamp(e.stateT / 0.7, 0, 1) : 0;
      const ph = t * (charge ? 17 : 6);
      // wind-up: lower head, paw the ground (rear up slightly then dip)
      P.body(abs(sin(ph)) * (charge ? 0.1 : 0.05) - k * 0.08, 0.1 * charge + 0.18 * k, sin(ph) * 0.03 + sin(t * 60) * 0.02 * k, 1, 1);
      P.part(0, 0, 0, 0);
      const sw = charge ? 0.9 : 0.6;
      P.part(1, -0.28, 0.58, 0.6, sin(ph) * sw - k * 1.0 * abs(sin(t * 14))); P.part(2, 0.28, 0.58, 0.6, -sin(ph) * sw);
      P.part(3, -0.28, 0.58, -0.6, -sin(ph) * sw); P.part(4, 0.28, 0.58, -0.6, sin(ph) * sw);
      P.glow = 1 + k * 3;
    },
  };
}

// -------------------------------------------------------------- ROCK CRAB ---
function crab(): ModelDef {
  const shell = '#8a93a2', shell2 = '#5c6574', red = '#c0553a';
  const body = new GB([0.85, 1.12]);
  body.sph(0.62, [0, 0.5, 0], shell, [1.35, 0.55, 1.0], 9);
  for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; body.ico(0.16, [sin(a) * 0.55, 0.78, cos(a) * 0.3], shell2, [1, 0.8, 1], 0); }
  body.ico(0.2, [0.3, 0.88, -0.15], shell2, 1, 0); body.ico(0.16, [-0.35, 0.86, -0.2], shell2, 1, 0);
  // front armour plate (facing +Z): the shielded side
  body.box(1.0, 0.5, 0.1, [0, 0.55, 0.62], shell2, [-0.15, 0, 0]);
  body.box(0.8, 0.08, 0.14, [0, 0.82, 0.62], '#c8ccd6');
  for (const s of [-1, 1]) { body.cyl(0.03, 0.03, 0.22, 4, [s * 0.2, 0.9, 0.5], red); body.sph(0.06, [s * 0.2, 1.02, 0.5], '#ffe24a', 1, 5); }
  const claw = new GB([0.85, 1.1]);
  claw.cyl(0.07, 0.09, 0.45, 5, [0, 0, 0.22], red, [Math.PI / 2, 0, 0]);
  claw.sph(0.2, [0, 0, 0.55], red, [1.2, 0.8, 1.3], 7); claw.cone(0.09, 0.28, 4, [0.1, 0, 0.8], '#e07858', [Math.PI / 2, 0, 0.2]); claw.cone(0.07, 0.24, 4, [-0.1, 0, 0.78], '#e07858', [Math.PI / 2, 0, -0.2]);
  const leg = new GB([0.85, 1.1]);
  leg.cyl(0.045, 0.035, 0.5, 4, [0.25, -0.05, 0], shell2, [0, 0, -1.1]); leg.cyl(0.035, 0.025, 0.4, 4, [0.55, -0.22, 0], shell2, [0, 0, 0.5]);
  const legG = leg.build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: claw.build(), mat: 'lit2' }, { geo: claw.build(), mat: 'lit2' }, { geo: legG, mat: 'lit2' }, { geo: legG, mat: 'lit2' }, { geo: legG, mat: 'lit2' }, { geo: legG, mat: 'lit2' }, { geo: legG, mat: 'lit2' }, { geo: legG, mat: 'lit2' }],
    headY: 1.3, shadow: 0.95,
    pose(e, P, t) {
      const ph = t * 8;
      P.body(abs(sin(ph)) * 0.03, 0, sin(ph * 0.5) * 0.03, 1, 1);
      P.part(0, 0, 0, 0);
      P.part(1, -0.7, 0.5, 0.35, 0, 0.35 + sin(t * 2) * 0.1, 0); P.part(2, 0.7, 0.5, 0.35, 0, -0.35 - sin(t * 2) * 0.1, 0, -1, 1, 1);
      for (let i = 0; i < 3; i++) {
        const z = 0.3 - i * 0.28, w = sin(ph + i * 2.1) * 0.25;
        P.part(3 + i, 0.5, 0.45, z, 0, w, 0.0);
        P.part(6 + i, -0.5, 0.45, z, 0, w + 0.0, 0.0, -1, 1, 1);
      }
    },
  };
}

// --------------------------------------------------------- BOSS ADDS ----------
/** Elderroot's sapling: a walking stump with a leafy crown and glowing eyes. */
function sapling(): ModelDef {
  const bark = '#6b4423', leaf = '#5fae2a', leaf2 = '#3f8a1c';
  const body = new GB([0.8, 1.1]);
  body.cyl(0.3, 0.42, 1.0, 7, [0, 0.75, 0], bark);
  body.cone(0.12, 0.5, 4, [-0.36, 1.1, 0], bark, [0, 0, 1.0]); body.cone(0.12, 0.5, 4, [0.36, 1.1, 0], bark, [0, 0, -1.0]);
  body.ico(0.62, [0, 1.55, 0], leaf, [1.1, 0.85, 1.1], 1);
  body.ico(0.34, [0.4, 1.35, 0.2], leaf2, 1, 0); body.ico(0.3, [-0.36, 1.7, -0.1], leaf2, 1, 0);
  body.cone(0.07, 0.3, 4, [0, 0.55, 0.42], '#4a2c14', [Math.PI / 2, 0, 0]);
  const eyes = new GB([1, 1]);
  for (const s of [-1, 1]) eyes.sph(0.09, [s * 0.15, 0.98, 0.34], '#d8ff5a', [1, 1.2, 0.6], 6);
  const leg = new GB([0.7, 1.1]).cyl(0.11, 0.16, 0.4, 5, [0, -0.2, 0], '#4a2c14').cone(0.16, 0.14, 5, [0, -0.42, 0.06], '#3a2210', [Math.PI / 2, 0, 0]).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }], headY: 2.2, shadow: 0.7,
    pose(e, P, t) {
      const ph = t * 6;
      P.body(abs(sin(ph)) * 0.06, 0.08, sin(ph) * 0.1, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.part(2, -0.18, 0.4, 0, sin(ph) * 0.7); P.part(3, 0.18, 0.4, 0, -sin(ph) * 0.7);
      P.glow = 1.4 + 0.4 * sin(t * 5);
    },
  };
}

/** One of the Mire Hydra's three heads: a tall swaying neck with a fanged snout (the body stays with the boss). */
function hydraHead(): ModelDef {
  const skin = '#3f8f4a', skin2 = '#6bc25a', belly = '#c8d88a';
  const g = new GB([0.8, 1.1]);
  g.cyl(0.62, 0.78, 1.2, 8, [0, 0.6, 0], skin);                     // base
  g.cyl(0.46, 0.6, 1.4, 8, [0, 1.8, 0.1], skin, [0.12, 0, 0]);      // neck
  g.cyl(0.4, 0.46, 1.2, 8, [0, 2.9, 0.3], skin2, [0.28, 0, 0]);
  for (let i = 0; i < 4; i++) g.cone(0.1, 0.34, 4, [0, 1.2 + i * 0.5, -0.45 + i * 0.12], '#2a6a32', [-0.5, 0, 0]); // back spines
  g.box(0.5, 0.7, 0.3, [0, 1.6, 0.52], belly, [0.1, 0, 0]);          // throat plates
  g.sph(0.62, [0, 3.6, 0.7], skin2, [1, 0.85, 1.15], 9);             // skull
  g.box(0.62, 0.34, 0.9, [0, 3.38, 1.4], skin2);                    // snout
  g.box(0.56, 0.16, 0.8, [0, 3.1, 1.34], '#2a5a30');                // jaw
  for (const s of [-1, 1]) {
    g.cone(0.07, 0.3, 4, [s * 0.22, 3.12, 1.7], '#fff4d0', [Math.PI, 0, 0]);   // fangs
    g.cone(0.12, 0.5, 4, [s * 0.4, 4.05, 0.45], '#2a5a30', [-0.5, 0, s * 0.5]); // horns
  }
  const eyes = new GB([1, 1]);
  for (const s of [-1, 1]) eyes.sph(0.12, [s * 0.34, 3.78, 1.05], '#ffe14a', [1, 1, 0.7], 6);
  return {
    parts: [{ geo: g.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }], headY: 4.6, shadow: 1.1,
    pose(e, P, t) {
      const lunge = e.state === 'WINDUP' ? 0.25 : 0;
      P.body(0, sin(t * 1.7 + e.pattern) * 0.1 + lunge, sin(t * 1.3 + e.pattern * 2) * 0.12, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.glow = 1.6;
    },
  };
}

// ------------------------------------------------------------ STAGE MONSTERS ---
const TOWER_Y = 3.15;   // deck height of the archer tower (render/Props makeArcherTower)
/** Goblin archer: a hooded goblin with a short bow, standing on its tower deck. */
function goblinArcher(): ModelDef {
  const skin = '#62a82f', skin2 = '#79c43e', hood = '#5a3a1e';
  const body = new GB([0.82, 1.1]);
  body.box(0.46, 0.5, 0.3, [0, 0.88, 0], '#4a6a2a'); body.sph(0.27, [0, 0.8, 0.06], '#5a7a30', [1, 0.9, 0.8], 7);
  body.cyl(0.26, 0.3, 0.3, 7, [0, 0.58, 0], '#7a4a22'); body.box(0.5, 0.06, 0.34, [0, 0.72, 0], '#3a2616');
  body.sph(0.29, [0, 1.3, 0.04], skin2, [1.08, 1, 1], 8);
  body.cone(0.36, 0.5, 6, [0, 1.52, -0.02], hood, [-0.25, 0, 0]);   // hood
  for (const s of [-1, 1]) {
    body.cone(0.1, 0.4, 4, [s * 0.36, 1.33, 0], skin2, [0, 0, -s * 1.25]);
    body.sph(0.07, [s * 0.11, 1.33, 0.25], '#ffe14a', 1, 6); body.sph(0.035, [s * 0.11, 1.33, 0.31], '#101018', 1, 5);
  }
  body.cone(0.06, 0.16, 4, [0, 1.25, 0.32], skin, [Math.PI / 2, 0, 0]);
  body.cyl(0.09, 0.09, 0.55, 6, [0.18, 1.05, -0.24], '#6a4828', [0.3, 0, 0.2]);   // quiver
  for (let i = 0; i < 3; i++) body.box(0.02, 0.02, 0.22, [0.15 + i * 0.04, 1.38, -0.32], '#e8e0c8', [0.3, 0, 0]);
  const armR = limb(new GB([0.85, 1.1]), 0.5, 0.07, 0.06, skin, skin2, 0.09).build();
  const bow = makeBow('#6a4828', 0);
  const armLb = limb(new GB([0.85, 1.1]), 0.5, 0.07, 0.06, skin, skin2, 0.09);
  armLb.addColored(bow.body, [0, -0.5, 0], [Math.PI / 2, 0, 0], 0.6);
  const legL = limb(new GB([0.8, 1.1]), 0.5, 0.09, 0.07, skin).box(0.14, 0.07, 0.24, [0, -0.5, 0.05], '#4a3a24').build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: armR, mat: 'lit' }, { geo: armLb.build(), mat: 'lit' }, { geo: legL, mat: 'lit' }, { geo: legL, mat: 'lit' }], headY: TOWER_Y + 1.8, shadow: 0.01,
    pose(e, P, t) {
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 0.75, 0, 1) : 0;
      const rec = e.state === 'RECOVER' ? clamp(1 - e.stateT / 0.45, 0, 1) : 0;
      P.body(TOWER_Y + abs(sin(t * 2.2)) * 0.03, -0.05 * k, 0, 1, 1);
      P.part(0, 0, 0, 0);
      const raise = max(k, rec * 0.8);
      P.part(1, 0.32, 1.08, 0, lerp(-0.3, -1.4, raise), lerp(0, 0.6, k), -0.1);   // draw hand
      P.part(2, -0.32, 1.08, 0, lerp(sin(t * 2) * 0.1, -1.45, raise), 0, 0.1);    // bow arm
      P.part(3, -0.13, 0.52, 0, 0); P.part(4, 0.13, 0.52, 0, 0);
    },
  };
}

/** Lurking hydra: the boss-head mesh, smaller, sunk into the water so only the neck and head peek out. */
function lakeHydra(): ModelDef {
  const h = hydraHead();
  return {
    parts: h.parts.map((p) => ({ geo: p.geo.clone(), mat: p.mat })), headY: 3.3, shadow: 0.01,   // own geometry copies (each kind gets its own flash attribute)
    pose(e, P, t) {
      const k = e.state === 'WINDUP' ? clamp(e.stateT / 0.8, 0, 1) : 0;
      const sink = e.state === 'SPAWN' ? 0 : -1.55 + k * 0.45 + sin(t * 1.4 + e.id) * 0.12;
      P.body(sink, sin(t * 1.7 + e.id) * 0.12 - k * 0.35 + (e.state === 'RECOVER' ? 0.25 : 0), sin(t * 1.2 + e.id * 2) * 0.12, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.glow = 1.6 + k * 2;
    },
  };
}

/** Sand scarab: a small glossy beetle (swarm). */
function scarab(): ModelDef {
  const shell = '#1f8f86', shell2 = '#c8a040', dark = '#1a1a14';
  const body = new GB([0.75, 1.2]);
  body.sph(0.5, [0, 0.42, -0.05], shell, [1.0, 0.62, 1.25], 10);
  body.box(0.03, 0.3, 1.0, [0, 0.66, -0.05], dark);
  body.sph(0.26, [0, 0.36, 0.58], dark, [1.2, 0.8, 1], 8);
  for (const s of [-1, 1]) {
    body.cone(0.05, 0.42, 4, [s * 0.14, 0.34, 0.92], shell2, [Math.PI / 2 - 0.15, 0, s * 0.35]);   // mandibles
    body.sph(0.05, [s * 0.14, 0.44, 0.78], '#ff8a2a', 1, 5);
  }
  body.sph(0.12, [0, 0.72, 0.25], shell2, [1, 0.4, 1], 6);   // gold sun mark
  const legs = (s: number) => {
    const g = new GB([0.8, 1.1]);
    for (let i = 0; i < 3; i++) { g.box(0.42, 0.04, 0.05, [s * 0.22, 0, (i - 1) * 0.28], dark, [0, (i - 1) * 0.35 * s, -s * 0.5]); g.box(0.04, 0.26, 0.05, [s * 0.4, -0.1, (i - 1) * 0.32], dark, [0, 0, s * 0.3]); }
    return g.build();
  };
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: legs(1), mat: 'lit' }, { geo: legs(-1), mat: 'lit' }], headY: 1.0, shadow: 0.55,
    pose(e, P, t) {
      const r = t * 22 + e.id;
      P.body(abs(sin(r)) * 0.05, 0.05, sin(r * 0.5) * 0.06, 1, 1);
      P.part(0, 0, 0, 0);
      P.part(1, 0, 0.26, 0, 0, sin(r) * 0.45, 0); P.part(2, 0, 0.26, 0, 0, -sin(r) * 0.45, 0);
    },
  };
}

/** Shieldbearer: a bronze hoplite with a big round shield (raised to the front while braced) and a short spear. */
function shieldbearer(): ModelDef {
  const bronze = '#c08a3a', bronze2 = '#8a5a24', cloth = '#8a2a22', skin = '#c89a74', dark = '#3a2a1e';
  const body = new GB([0.78, 1.12]);
  body.box(0.62, 0.72, 0.42, [0, 1.12, 0], bronze);                     // cuirass
  body.box(0.66, 0.12, 0.46, [0, 0.78, 0], bronze2);
  for (let i = 0; i < 5; i++) body.box(0.12, 0.34, 0.06, [-0.26 + i * 0.13, 0.58, 0.21], cloth);   // pteruges
  for (let i = 0; i < 5; i++) body.box(0.12, 0.34, 0.06, [-0.26 + i * 0.13, 0.58, -0.21], cloth);
  body.sph(0.22, [0, 1.68, 0.02], skin, 1, 8);
  body.sph(0.26, [0, 1.74, 0], bronze, [1, 1.05, 1.08], 9);               // helmet
  body.box(0.08, 0.3, 0.06, [0, 1.62, 0.25], bronze2);                    // nose guard
  for (const s of [-1, 1]) body.box(0.1, 0.28, 0.08, [s * 0.15, 1.6, 0.21], bronze2);
  body.box(0.08, 0.32, 0.72, [0, 2.06, -0.04], cloth);                    // crest
  for (const s of [-1, 1]) body.sph(0.17, [s * 0.4, 1.42, 0], bronze2, [1, 0.8, 1], 7);   // pauldrons
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.035, [s * 0.08, 1.7, 0.24], '#ffd24a', 1, 5);
  const armR = limb(new GB([0.85, 1.1]), 0.6, 0.08, 0.07, skin, bronze2, 0.1);
  armR.cyl(0.035, 0.035, 2.0, 5, [0, -0.62, 0.5], '#6a4828', [Math.PI / 2, 0, 0]); armR.cone(0.08, 0.3, 4, [0, -0.62, 1.6], '#d8dce4', [Math.PI / 2, 0, 0]);
  const shield = new GB([0.75, 1.15]);
  shield.cyl(0.62, 0.62, 0.1, 14, [0, 0, 0], bronze, [Math.PI / 2, 0, 0]);
  shield.torus(0.6, 0.05, [0, 0, 0.06], bronze2, [0, 0, 0], 1, 16);
  shield.cyl(0.18, 0.2, 0.08, 10, [0, 0, 0.08], bronze2, [Math.PI / 2, 0, 0]);
  shield.box(0.5, 0.08, 0.02, [0, 0.22, 0.07], cloth); shield.box(0.08, 0.5, 0.02, [0, -0.1, 0.07], cloth);
  const leg = limb(new GB([0.8, 1.1]), 0.62, 0.1, 0.09, skin).box(0.16, 0.36, 0.16, [0, -0.38, 0.02], bronze).box(0.16, 0.07, 0.26, [0, -0.62, 0.05], dark).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armR.build(), mat: 'lit' }, { geo: shield.build(), mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.3, shadow: 0.8,
    pose(e, P, t) {
      const brace = e.state === 'KITE' ? clamp(e.stateT / 0.2, 0, 1) : 0;
      const wind = e.state === 'WINDUP' ? 1 : 0, bash = e.state === 'ATTACK' ? 1 : 0, open = e.state === 'RECOVER' ? 1 : 0;
      const g = max(brace, wind, bash);
      const ph = t * (brace ? 3 : 6.5), mv = brace ? 0.35 : 1;
      P.body(abs(sin(ph)) * 0.05 * mv - g * 0.12, g * 0.18 + bash * 0.2 - open * 0.1, sin(ph) * 0.05 * mv, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.part(2, 0.42, 1.38, 0, -0.9 - g * 0.4 + sin(ph) * 0.2 * (1 - g), 0, -0.1);
      // shield: at the side while walking, square in front while braced / bashing, dropped low after the bash
      P.part(3, lerp(-0.62, -0.06, g), lerp(1.05, 1.15, g) - open * 0.35, lerp(0.15, 0.62 + bash * 0.25, g), open * 0.5, lerp(-1.25, 0, g), 0);
      P.part(4, -0.17, 0.66, 0, -sin(ph) * 0.6 * mv); P.part(5, 0.17, 0.66, 0, sin(ph) * 0.6 * mv);
      P.glow = 1.2;
    },
  };
}

// ======================================================= biome-unique monsters ===
const wind = (e: Enemy, d: number) => (e.state === 'WINDUP' ? clamp(e.stateT / d, 0, 1) : 0);

/** Greenwood Sporecap: a waddling red toadstool with a stubby face; puffs up before bursting into spores. */
function sporecap(): ModelDef {
  const stem = '#efe2c4', cap = '#c8382c', dot = '#fff4e0';
  const body = new GB([0.8, 1.12]);
  body.cyl(0.32, 0.4, 0.8, 9, [0, 0.55, 0], stem);
  body.sph(0.62, [0, 1.05, 0], cap, [1.15, 0.62, 1.15], 12);
  body.cyl(0.62, 0.66, 0.08, 12, [0, 0.95, 0], '#d8c49a');
  for (let i = 0; i < 7; i++) { const a = i * 1.7, r = i ? 0.42 : 0; body.sph(0.1, [cos(a) * r, 1.32 - r * 0.25, sin(a) * r], dot, [1, 0.4, 1], 6); }
  for (const s of [-1, 1]) { body.sph(0.06, [s * 0.13, 0.7, 0.33], '#1a1010', 1, 5); }
  body.box(0.14, 0.04, 0.04, [0, 0.56, 0.36], '#5a2a1a');
  const foot = new GB([0.8, 1.1]); foot.sph(0.16, [0, -0.05, 0.05], '#d8c8a8', [1, 0.6, 1.3], 6);
  const spore = new GB([1, 1]); for (let i = 0; i < 5; i++) { const a = i * 1.26; spore.sph(0.05, [cos(a) * 0.5, 1.45, sin(a) * 0.5], '#d08aff', 1, 4); }
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: foot.build(), mat: 'lit' }, { geo: foot.build(), mat: 'lit' }, { geo: spore.build(), mat: 'glow' }], headY: 1.7, shadow: 0.7,
    pose(e, P, t) {
      const k = wind(e, 0.75), ph = t * 7;
      P.body(abs(sin(ph)) * 0.08, 0, sin(ph) * 0.12, 1 + k * 0.25 + sin(t * 40) * 0.03 * k, 1 - k * 0.15);
      P.part(0, 0, 0, 0);
      P.part(1, -0.2, 0.15, sin(ph) * 0.15); P.part(2, 0.2, 0.15, -sin(ph) * 0.15);
      P.part(3, 0, k * 0.3, 0, 0, t * 2, 0, 1 + k);
      P.glow = 0.6 + k * 2.5;
    },
  };
}

/** Greenwood Dire Wolf (also the Ember Hellhound with `hound`): lean quadruped, raised hackles, glowing eyes. */
function wolf(hound: boolean): ModelDef {
  const fur = hound ? '#3a1a14' : '#7a7f88', fur2 = hound ? '#1e0e0a' : '#5a5e66', belly = hound ? '#6a2a1a' : '#b8bcc4', eye = hound ? '#ffb02a' : '#ffe14a';
  const body = new GB([0.78, 1.15]);
  body.sph(0.42, [0, 0.82, -0.15], fur, [0.8, 0.8, 1.5], 9);
  body.sph(0.4, [0, 0.9, 0.35], fur2, [0.9, 0.95, 0.9], 8);
  body.sph(0.3, [0, 1.05, 0.82], fur, [0.9, 0.85, 1.0], 8);
  body.box(0.22, 0.2, 0.42, [0, 0.96, 1.15], fur, [0.1, 0, 0]);   // muzzle
  body.sph(0.06, [0, 1.02, 1.37], '#101010', 1, 5);
  for (let i = 0; i < 4; i++) body.cone(0.035, 0.12, 3, [(i % 2 ? 0.06 : -0.06), 0.88, 1.18 + i * 0.04], '#ffffff', [Math.PI, 0, 0]);
  for (const s of [-1, 1]) body.cone(0.1, 0.28, 4, [s * 0.15, 1.32, 0.72], fur2, [-0.2, 0, -s * 0.2]);
  for (let i = 0; i < 6; i++) body.cone(0.07, 0.26, 4, [0, 1.2 - i * 0.03, 0.4 - i * 0.18], fur2, [-0.5, 0, 0]);   // hackles
  body.sph(0.3, [0, 0.66, 0.1], belly, [0.7, 0.5, 1.2], 7);
  body.cone(0.1, 0.7, 5, [0, 0.95, -0.95], fur2, [-1.9, 0, 0]);   // tail
  if (hound) for (let i = 0; i < 4; i++) body.cone(0.06, 0.3, 4, [0, 1.25 - i * 0.02, 0.2 - i * 0.3], '#ff6a1a', [-0.4, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.05, [s * 0.12, 1.12, 1.06], eye, 1, 5);
  if (hound) { eyes.cone(0.1, 0.4, 5, [0, 1.35, 0.3], '#ff8a2a', [-0.3, 0, 0]); eyes.cone(0.08, 0.35, 5, [0, 1.3, -0.3], '#ffb040', [-0.3, 0, 0]); }
  const leg = limb(new GB([0.8, 1.1]), 0.58, 0.08, 0.06, fur2).sph(0.08, [0, -0.6, 0.04], fur2, [1, 0.6, 1.4], 5).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 1.7, shadow: 0.85,
    pose(e, P, t) {
      const k = wind(e, 0.4), leap = e.state === 'ATTACK' ? 1 : 0, ph = t * (leap ? 18 : 11);
      P.body(abs(sin(ph)) * 0.1 + leap * 0.5 - k * 0.15, 0.08 - k * 0.15 + leap * -0.25, sin(ph) * 0.04, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const sw = leap ? 1.2 : 0.8;
      P.part(2, -0.2, 0.62, 0.5, sin(ph) * sw - leap * 0.8); P.part(3, 0.2, 0.62, 0.5, sin(ph + 0.5) * sw - leap * 0.8);
      P.part(4, -0.2, 0.62, -0.62, -sin(ph) * sw + leap * 0.8); P.part(5, 0.2, 0.62, -0.62, -sin(ph + 0.5) * sw + leap * 0.8);
      P.glow = 1.3 + k * 2 + (hound ? 0.6 + 0.3 * sin(t * 13) : 0);
    },
  };
}

/** Marble Halls Haunted Armor: an empty suit of plate with a ghostly glow inside the visor and a two-handed greatsword. */
function hauntedArmor(): ModelDef {
  const steel = '#8a94a8', steel2 = '#5a6274', trim = '#b8923a', cloth = '#3a2a5a';
  const body = new GB([0.75, 1.15]);
  body.box(0.7, 0.8, 0.44, [0, 1.25, 0], steel); body.box(0.6, 0.2, 0.46, [0, 0.82, 0], steel2);
  body.box(0.08, 0.7, 0.46, [0, 1.25, 0.01], trim);
  for (const s of [-1, 1]) body.sph(0.24, [s * 0.46, 1.58, 0], steel2, [1, 0.8, 1.1], 8);
  body.box(0.5, 0.5, 0.1, [0, 0.55, 0.2], cloth); body.box(0.5, 0.5, 0.1, [0, 0.55, -0.2], cloth);   // tabard
  body.cyl(0.24, 0.26, 0.42, 9, [0, 1.92, 0], steel); body.sph(0.24, [0, 2.12, 0], steel, [1, 0.6, 1], 9);   // great helm
  body.box(0.36, 0.05, 0.05, [0, 1.95, 0.25], '#101016');
  body.box(0.06, 0.4, 0.06, [0, 2.38, -0.05], '#8a2a3a'); body.box(0.06, 0.06, 0.5, [0, 2.55, -0.2], '#8a2a3a');   // plume
  const glow = new GB([1, 1]); glow.box(0.3, 0.035, 0.04, [0, 1.95, 0.26], '#7ad0ff'); glow.sph(0.18, [0, 1.25, 0.12], '#5aa0ff', [1, 1, 0.3], 6);
  const arm = new GB([0.8, 1.1]); limb(arm, 0.7, 0.1, 0.09, steel2, steel, 0.12);
  arm.box(0.08, 1.8, 0.18, [0, -1.55, 0.35], '#c8ccd8', [0.2, 0, 0]); arm.box(0.5, 0.08, 0.12, [0, -0.72, 0.18], trim); arm.cyl(0.04, 0.04, 0.3, 5, [0, -0.55, 0.15], '#3a2a1a');
  const arm2 = limb(new GB([0.8, 1.1]), 0.7, 0.1, 0.09, steel2, steel, 0.12).build();
  const leg = limb(new GB([0.8, 1.1]), 0.75, 0.13, 0.11, steel2).box(0.2, 0.08, 0.32, [0, -0.76, 0.06], steel).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: glow.build(), mat: 'glow' }, { geo: arm.build(), mat: 'lit' }, { geo: arm2, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.8, shadow: 0.85,
    pose(e, P, t) {
      const k = wind(e, 0.85), rec = e.state === 'RECOVER' ? clamp(1 - e.stateT / 0.3, 0, 1) : 0, ph = t * 4.5;
      P.body(abs(sin(ph)) * 0.04, 0.05 + rec * 0.25 - k * 0.1, sin(ph) * 0.04, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      // greatsword: raised high over the shoulder in the wind-up, brought down on release
      P.part(2, 0.48, 1.55, 0, -0.4 - k * 2.6 + rec * 1.8, 0, -0.15 - k * 0.3);
      P.part(3, -0.48, 1.55, 0, -0.3 - k * 2.2 + rec * 1.5, 0, 0.3);
      P.part(4, -0.18, 0.78, 0, -sin(ph) * 0.45); P.part(5, 0.18, 0.78, 0, sin(ph) * 0.45);
      P.glow = 1.2 + k * 2 + 0.3 * sin(t * 3);
    },
  };
}

/** Marble Halls Gargoyle: crouched stone statue with folded wings; spreads them and flies once awake. */
function gargoyle(): ModelDef {
  const st = '#8a847a', st2 = '#6a655c', moss = '#5a7040';
  const body = new GB([0.72, 1.12]);
  body.sph(0.45, [0, 0.9, 0], st, [0.9, 1.0, 0.85], 9);
  body.sph(0.3, [0, 1.42, 0.22], st, [1, 0.95, 1.05], 8);
  body.box(0.26, 0.16, 0.26, [0, 1.36, 0.46], st2);
  for (const s of [-1, 1]) { body.cone(0.07, 0.42, 4, [s * 0.18, 1.7, 0.12], st2, [-0.6, 0, -s * 0.35]); body.cone(0.04, 0.14, 3, [s * 0.08, 1.24, 0.55], '#e8e2d4', [Math.PI, 0, 0]); }
  body.cone(0.06, 0.8, 4, [0, 0.55, -0.6], st2, [-2.1, 0, 0]);   // tail
  body.sph(0.2, [0.2, 1.2, -0.25], moss, [1.2, 0.4, 1], 5);
  for (const s of [-1, 1]) { body.cyl(0.08, 0.06, 0.55, 5, [s * 0.3, 0.45, 0.25], st2, [0.3, 0, 0]); body.cyl(0.11, 0.08, 0.5, 5, [s * 0.32, 0.35, -0.15], st2, [-0.4, 0, 0]); }
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.05, [s * 0.11, 1.48, 0.48], '#ff5a2a', 1, 5);
  const w = new GB([0.75, 1.1]);
  w.box(1.1, 0.06, 0.08, [0.55, 0, 0], st2, [0, 0, 0.15]);
  w.tri([0, 0, 0.05], [1.1, 0.16, 0], [0.9, -0.45, -0.35], st); w.tri([0, 0, 0.05], [0.9, -0.45, -0.35], [0.4, -0.35, -0.5], st2);
  const wing = w.build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: wing, mat: 'lit2' }, { geo: wing, mat: 'lit2' }], headY: 2.1, shadow: 0.75,
    pose(e, P, t) {
      const perched = e.phase === 0;
      const flap = perched ? 0 : sin(t * 14), dive = e.state === 'ATTACK' ? 1 : 0;
      const hov = perched ? 0 : 1.3 + sin(t * 3 + e.id) * 0.15 - dive * 0.9;
      P.body(hov, perched ? 0 : 0.35 + dive * 0.4, perched ? 0 : sin(t * 2 + e.id) * 0.15, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const fold = perched ? -1.1 : flap * 0.8 + 0.2 - dive * 0.6;
      P.part(2, 0.25, 1.1, -0.1, 0, perched ? -0.9 : 0, fold);
      P.part(3, -0.25, 1.1, -0.1, 0, perched ? 0.9 : 0, -fold, -1, 1, 1);
      P.glow = perched ? 0.25 + 0.15 * sin(t * 2) : 1.6;
    },
  };
}

/** Desert Giant Scorpion: armoured body, two pincers and a segmented tail that arcs forward to sting. */
function scorpion(): ModelDef {
  const sh = '#b8742a', sh2 = '#8a5218', dark = '#3a2410';
  const body = new GB([0.75, 1.15]);
  body.sph(0.5, [0, 0.5, 0], sh, [0.95, 0.5, 1.3], 9);
  for (let i = 0; i < 3; i++) body.box(0.9 - i * 0.1, 0.06, 0.12, [0, 0.74, -0.3 + i * 0.3], sh2);
  body.sph(0.28, [0, 0.52, 0.62], sh2, [1.1, 0.6, 0.8], 7);
  for (const s of [-1, 1]) body.sph(0.05, [s * 0.1, 0.66, 0.82], '#101010', 1, 4);
  const tail = new GB([0.75, 1.15]);
  for (let i = 0; i < 5; i++) tail.sph(0.17 - i * 0.015, [0, 0.12 + i * 0.32, -i * 0.08], i % 2 ? sh : sh2, [1, 1.1, 1], 7);
  tail.cone(0.12, 0.42, 5, [0, 1.75, 0.18], sh2, [2.2, 0, 0]); tail.cone(0.04, 0.22, 4, [0, 1.62, 0.42], '#e8e0c0', [2.4, 0, 0]);
  const tg = new GB([1, 1]); tg.sph(0.09, [0, 1.75, 0.2], '#9ad040', 1, 5);
  const claw = new GB([0.8, 1.1]);
  claw.cyl(0.08, 0.08, 0.55, 5, [0, 0, 0.27], sh2, [Math.PI / 2, 0, 0]); claw.sph(0.2, [0, 0, 0.62], sh, [0.9, 0.7, 1.3], 7);
  claw.cone(0.07, 0.38, 4, [0.09, 0, 0.92], sh2, [Math.PI / 2, 0, -0.2]); claw.cone(0.06, 0.32, 4, [-0.09, 0, 0.88], sh2, [Math.PI / 2, 0, 0.3]);
  const legs = (s: number) => { const g = new GB([0.8, 1.1]); for (let i = 0; i < 4; i++) { g.box(0.55, 0.05, 0.06, [s * 0.32, 0, (i - 1.5) * 0.24], dark, [0, 0, -s * 0.5]); g.box(0.05, 0.36, 0.05, [s * 0.58, -0.17, (i - 1.5) * 0.26], dark, [0, 0, s * 0.25]); } return g.build(); };
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: tail.build(), mat: 'lit' }, { geo: tg.build(), mat: 'glow' }, { geo: claw.build(), mat: 'lit' }, { geo: claw.build(), mat: 'lit' }, { geo: legs(1), mat: 'lit' }, { geo: legs(-1), mat: 'lit' }],
    headY: 1.6, shadow: 0.95,
    pose(e, P, t) {
      const k = wind(e, 0.55), rec = e.state === 'RECOVER' ? clamp(1 - e.stateT / 0.25, 0, 1) : 0, r = t * 14 + e.id;
      P.body(abs(sin(r)) * 0.03, 0.03, sin(r * 0.5) * 0.04, 1, 1);
      P.part(0, 0, 0, 0);
      const arc = -k * 0.55 + rec * 1.1;   // tail cocks back, then whips over
      P.part(1, 0, 0.5, -0.55, arc); P.part(2, 0, 0.5, -0.55, arc);
      P.part(3, -0.38, 0.5, 0.45, 0, 0.35 + sin(t * 3) * 0.12 + k * 0.4, 0); P.part(4, 0.38, 0.5, 0.45, 0, -0.35 - sin(t * 3) * 0.12 - k * 0.4, 0);
      P.part(5, 0, 0.42, 0, 0, sin(r) * 0.3, 0); P.part(6, 0, 0.42, 0, 0, -sin(r) * 0.3, 0);
      P.glow = 1 + k * 2.5;
    },
  };
}

/** Desert Mummy: bandaged shambler with trailing wraps and glowing eye slits. */
function mummy(): ModelDef {
  const w1 = '#d8c8a0', w2 = '#bfae84', w3 = '#a89870';
  const body = new GB([0.75, 1.12]);
  for (let i = 0; i < 6; i++) body.cyl(0.3 - abs(i - 2.5) * 0.02, 0.31 - abs(i - 2.5) * 0.02, 0.16, 9, [0, 0.82 + i * 0.15, 0], [w1, w2, w3][i % 3], [0.08 * ((i % 2) * 2 - 1), 0, 0.05]);
  body.sph(0.25, [0, 1.92, 0.02], w1, [1, 1.1, 1], 8);
  for (let i = 0; i < 3; i++) body.box(0.52, 0.06, 0.52, [0, 1.8 + i * 0.12, 0], w3, [0.2 * (i - 1), 0.4 * i, 0]);
  body.box(0.12, 0.6, 0.04, [0.12, 0.85, -0.3], w2, [0.3, 0, 0.2]); body.box(0.1, 0.5, 0.04, [-0.15, 0.95, 0.31], w3, [-0.2, 0, -0.3]);   // loose wraps
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.box(0.09, 0.03, 0.04, [s * 0.09, 1.95, 0.24], '#7affc0');
  const arm = limb(new GB([0.8, 1.1]), 0.68, 0.08, 0.07, w2, w1, 0.09); arm.box(0.06, 0.45, 0.03, [0.05, -0.85, 0], w3);
  const leg = limb(new GB([0.8, 1.1]), 0.7, 0.11, 0.09, w2).build();
  const armG = arm.build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armG, mat: 'lit' }, { geo: armG, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.4, shadow: 0.7,
    pose(e, P, t) {
      const k = wind(e, 0.65), ph = t * 3.6;
      P.body(abs(sin(ph)) * 0.04, 0.15, sin(ph) * 0.08, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      P.part(2, -0.38, 1.55, 0, -1.5 + sin(ph) * 0.15, 0, 0.1);   // arms out in front, zombie-like
      P.part(3, 0.38, 1.55, 0, -1.5 - sin(ph) * 0.15 - k * 1.2, 0, -0.1 - k * 0.4);
      P.part(4, -0.15, 0.78, 0, -sin(ph) * 0.4); P.part(5, 0.15, 0.78, 0, sin(ph) * 0.4);
      P.glow = 1 + k * 2;
    },
  };
}

/** Frost Yeti: huge white-furred ape with blue face and long arms; pounds the ground at the end of a charge. */
function yeti(): ModelDef {
  const fur = '#eef2f8', fur2 = '#c8d4e2', skin = '#5a8ab8';
  const body = new GB([0.72, 1.12]);
  body.sph(0.62, [0, 1.25, 0], fur, [1.05, 1.0, 0.85], 10);
  body.sph(0.48, [0, 0.78, 0], fur2, [1.0, 0.8, 0.8], 9);
  for (let i = 0; i < 10; i++) { const a = i * 0.63; body.cone(0.12, 0.3, 4, [cos(a) * 0.55, 1.5 + sin(i) * 0.15, sin(a) * 0.45], fur, [sin(a) * 0.6, 0, -cos(a) * 0.6]); }
  body.sph(0.34, [0, 1.85, 0.25], fur, [1, 0.95, 0.95], 8);
  body.sph(0.22, [0, 1.8, 0.45], skin, [1.2, 0.9, 0.6], 7);
  body.box(0.26, 0.06, 0.08, [0, 1.68, 0.56], '#2a3a5a');
  for (const s of [-1, 1]) body.cone(0.05, 0.14, 3, [s * 0.09, 1.66, 0.58], '#ffffff', [Math.PI, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.sph(0.05, [s * 0.1, 1.86, 0.6], '#9ae8ff', 1, 5);
  const arm = new GB([0.8, 1.1]); arm.cyl(0.2, 0.17, 1.0, 7, [0, -0.5, 0], fur2); arm.sph(0.24, [0, -1.05, 0.05], skin, [1, 0.8, 1.1], 7);
  const leg = limb(new GB([0.8, 1.1]), 0.55, 0.2, 0.17, fur2).box(0.32, 0.1, 0.42, [0, -0.56, 0.08], skin).build();
  const armG = arm.build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armG, mat: 'lit' }, { geo: armG, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.5, shadow: 1.1,
    pose(e, P, t) {
      const k = wind(e, 0.85), ch = e.state === 'ATTACK' ? 1 : 0, slam = e.state === 'RECOVER' ? clamp(1 - e.stateT / 0.35, 0, 1) : 0;
      const ph = t * (ch ? 14 : 5);
      P.body(abs(sin(ph)) * 0.08 - slam * 0.2, 0.15 + ch * 0.35 + slam * 0.3, sin(ph) * 0.06, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const up = k * 2.6 - slam * 0.4;   // arms raised over the head, then pounded down
      P.part(2, -0.7, 1.6, 0, -sin(ph) * 0.6 * (1 - k) - up - ch * 0.6, 0, 0.25); P.part(3, 0.7, 1.6, 0, sin(ph) * 0.6 * (1 - k) - up - ch * 0.6, 0, -0.25);
      P.part(4, -0.28, 0.58, 0, -sin(ph) * 0.6); P.part(5, 0.28, 0.58, 0, sin(ph) * 0.6);
      P.glow = 1.2 + k * 2;
    },
  };
}

/** Frost Wisp: a floating ice crystal core inside a ring of orbiting shards and a soft glow. */
function frostWisp(): ModelDef {
  const core = new GB([0.8, 1.2]); core.ico(0.36, [0, 0, 0], '#bfefff', [0.8, 1.4, 0.8]); core.ico(0.22, [0, 0.42, 0], '#e8fbff', [0.6, 1.2, 0.6]); core.ico(0.18, [0, -0.38, 0], '#9adcff', [0.6, 1.2, 0.6]);
  const ring = new GB([1, 1]); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ring.ico(0.1, [cos(a) * 0.62, 0, sin(a) * 0.62], '#8ae0ff', [0.6, 1.4, 0.6]); }
  const glow = new GB([1, 1]); glow.sph(0.22, [0, 0, 0], '#c8f4ff', 1, 7); for (const s of [-1, 1]) glow.sph(0.05, [s * 0.09, 0.08, 0.26], '#ffffff', 1, 4);
  return {
    parts: [{ geo: core.build(), mat: 'lit' }, { geo: ring.build(), mat: 'glow' }, { geo: glow.build(), mat: 'ghost' }], headY: 2.4, shadow: 0.45,
    pose(e, P, t) {
      const k = wind(e, 0.6);
      P.body(1.4 + sin(t * 2.5 + e.id) * 0.2, 0, 0, 1 + k * 0.2, 1);
      P.part(0, 0, 0, 0, 0, t * 1.5, 0);
      P.part(1, 0, 0, 0, sin(t) * 0.3, t * (2.5 + k * 6), 0, 1 + k * 0.3);
      P.part(2, 0, 0, 0, 0, 0, 0, 1.6 + k * 0.8 + sin(t * 4) * 0.1);
      P.fade = 0.7 + k * 0.6; P.glow = 1.4 + k * 1.5;
    },
  };
}

/** Ember Cinder Shaman: hunched robed fire-caster with a horned mask and a burning staff. */
function cinderShaman(): ModelDef {
  const robe = '#4a1810', robe2 = '#7a2a14', bone = '#e8dcc0', skin = '#2a1a14';
  const body = new GB([0.75, 1.12]);
  body.cone(0.6, 1.5, 9, [0, 0.75, 0], robe);
  body.cyl(0.36, 0.5, 0.25, 9, [0, 1.4, 0], robe2);
  body.box(0.62, 0.1, 0.46, [0, 1.0, 0], '#b8923a');
  body.sph(0.25, [0, 1.72, 0.08], skin, 1, 8);
  body.box(0.34, 0.36, 0.08, [0, 1.72, 0.3], bone);   // mask
  for (const s of [-1, 1]) body.cone(0.06, 0.5, 4, [s * 0.22, 2.05, 0.12], bone, [-0.3, 0, -s * 0.8]);
  for (let i = 0; i < 5; i++) body.box(0.1, 0.1, 0.06, [-0.24 + i * 0.12, 1.45, 0.38], ['#ff8a2a', bone][i % 2]);   // bead necklace
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.box(0.07, 0.04, 0.03, [s * 0.08, 1.76, 0.35], '#ffb02a');
  const staff = limb(new GB([0.8, 1.1]), 0.6, 0.08, 0.07, robe2, skin, 0.09);
  staff.cyl(0.04, 0.05, 2.0, 5, [0, -0.6, 0.18], '#3a2414', [0.1, 0, 0]); staff.torus(0.16, 0.03, [0, 0.42, 0.24], '#b8923a', [0, 0, 0], 1, 8);
  const flame = new GB([1, 1]); flame.cone(0.18, 0.5, 6, [0, 0.62, 0.26], '#ff8a2a'); flame.cone(0.1, 0.35, 5, [0, 0.58, 0.26], '#ffe08a');
  const arm = limb(new GB([0.8, 1.1]), 0.6, 0.08, 0.07, robe2, skin, 0.09).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: staff.build(), mat: 'lit' }, { geo: flame.build(), mat: 'glow' }, { geo: arm, mat: 'lit' }],
    headY: 2.4, shadow: 0.7,
    pose(e, P, t) {
      const k = wind(e, 0.5), ph = t * 4;
      P.body(abs(sin(ph)) * 0.04, 0.2 - k * 0.3, sin(ph) * 0.05, 1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const raise = -0.3 - k * 2.4;   // staff thrust skyward to call the fire
      P.part(2, 0.42, 1.4, 0, raise, 0, -0.1); P.part(3, 0.42, 1.4, 0, raise, 0, -0.1, 1 + k * 0.8 + sin(t * 17) * 0.1);
      P.part(4, -0.42, 1.4, 0, -0.6 - k * 1.2 + sin(ph) * 0.1, 0, 0.3);
      P.glow = 1.4 + k * 2 + 0.2 * sin(t * 11);
    },
  };
}

/** Void Stalker: lanky shadow assassin with twin curved blades; flickers while it blinks. */
function voidStalker(): ModelDef {
  const dark = '#1a1028', dark2 = '#2a1a44', vio = '#8a4aff';
  const body = new GB([0.7, 1.15]);
  body.box(0.42, 0.75, 0.3, [0, 1.25, 0], dark2, [0.15, 0, 0]);
  body.cone(0.36, 0.7, 7, [0, 0.7, 0], dark, [Math.PI, 0, 0]);
  body.sph(0.22, [0, 1.82, 0.12], dark, [0.9, 1.1, 1.1], 8);
  body.cone(0.24, 0.5, 6, [0, 2.0, 0.02], dark2, [-0.5, 0, 0]);   // hood point
  for (let i = 0; i < 4; i++) body.cone(0.06, 0.4, 4, [0, 1.6 - i * 0.2, -0.2], dark2, [-2.6, 0, 0]);
  const eyes = new GB([1, 1]); for (const s of [-1, 1]) eyes.box(0.08, 0.03, 0.03, [s * 0.08, 1.84, 0.32], '#d0a0ff', [0, 0, s * 0.3]); eyes.sph(0.12, [0, 1.25, 0.16], vio, [1, 1, 0.3], 6);
  const arm = limb(new GB([0.8, 1.1]), 0.75, 0.06, 0.05, dark2, dark, 0.07);
  arm.box(0.04, 0.9, 0.12, [0, -1.15, 0.2], '#b080ff', [0.5, 0, 0]);
  const armG = arm.build();
  const leg = limb(new GB([0.8, 1.1]), 0.75, 0.08, 0.06, dark).build();
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: eyes.build(), mat: 'glow' }, { geo: armG, mat: 'lit' }, { geo: armG, mat: 'lit' }, { geo: leg, mat: 'lit' }, { geo: leg, mat: 'lit' }],
    headY: 2.4, shadow: 0.6,
    pose(e, P, t) {
      const k = wind(e, 0.5), rec = e.state === 'RECOVER' ? clamp(1 - e.stateT / 0.25, 0, 1) : 0, ph = t * 8;
      P.body(abs(sin(ph)) * 0.05, 0.3 + k * 0.2, sin(ph) * 0.05, 1 - k * 0.1, 1);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0);
      const cross = -0.8 - k * 1.8 + rec * 2.4;   // blades crossed high, then scissored down
      P.part(2, -0.3, 1.55, 0, cross, 0, 0.3 + k * 0.4); P.part(3, 0.3, 1.55, 0, cross, 0, -0.3 - k * 0.4);
      P.part(4, -0.13, 0.75, 0, -sin(ph) * 0.7); P.part(5, 0.13, 0.75, 0, sin(ph) * 0.7);
      P.glow = 1.3 + k * 2.5 + 0.3 * sin(t * 9);
    },
  };
}

/** Void Eye: a floating eyeball with a split violet pupil, ringed by tentacles. */
function voidEye(): ModelDef {
  const body = new GB([0.75, 1.2]);
  body.sph(0.55, [0, 0, 0], '#2a1840', 1, 12);
  body.sph(0.42, [0, 0, 0.2], '#efe6ff', [1, 1, 0.8], 10);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; body.cone(0.1, 0.8, 5, [cos(a) * 0.3, -0.45 + sin(a) * 0.15, -0.2 + sin(a) * 0.2], '#3a2058', [0.4 + sin(a) * 0.2, 0, cos(a) * 0.5 + Math.PI]); }
  for (let i = 0; i < 4; i++) body.box(0.3, 0.03, 0.02, [(i - 1.5) * 0.14, 0.18 - abs(i - 1.5) * 0.06, 0.53], '#c03a5a', [0, 0, (i - 1.5) * 0.5]);   // veins
  const pupil = new GB([1, 1]); pupil.sph(0.2, [0, 0, 0.5], '#c070ff', [1, 1, 0.3], 8); pupil.box(0.06, 0.3, 0.03, [0, 0, 0.58], '#120820');
  const ring = new GB([1, 1]); ring.torus(0.8, 0.03, [0, 0, 0], '#a050ff', [Math.PI / 2, 0, 0], 1, 20);
  return {
    parts: [{ geo: body.build(), mat: 'lit' }, { geo: pupil.build(), mat: 'glow' }, { geo: ring.build(), mat: 'ghost' }], headY: 2.6, shadow: 0.6,
    pose(e, P, t) {
      const k = wind(e, 0.85);
      P.body(1.6 + sin(t * 2 + e.id) * 0.2, sin(t * 1.3) * 0.15, sin(t * 0.9) * 0.1, 1 + k * 0.15, 1 + k * 0.15);
      P.part(0, 0, 0, 0); P.part(1, 0, 0, 0, 0, 0, 0, 1 + k * 0.4);
      P.part(2, 0, 0, 0, 0, t * 2, 0, 1 + k * 0.6);
      P.fade = 0.3 + k * 0.9; P.glow = 1.5 + k * 2.5;
    },
  };
}

let cache: Partial<Record<EnemyKind, ModelDef>> | null = null;
export function getModels(): Partial<Record<EnemyKind, ModelDef>> {
  if (!cache) cache = { SLIME: slime(), SPLITTER: splitter(), GOBLIN: goblin(), BAT: bat(), SKELETON_ARCHER: skeleton(), CULTIST: cultist(), BOMBER: bomber(), BRUTE: brute(), ZOMBIE: zombie(), WRAITH: wraith(), CRYSTAL_GOLEMITE: golemite(), BANDIT: bandit(), BOAR: boar(), ROCK_CRAB: crab(),
    BOSS_SAPLING: sapling(), BOSS_HYDRA_HEAD: hydraHead(), BOSS_IMP: goblin(), // imps: a goblin model, tinted red in Enemies.tsx
    GOBLIN_ARCHER: goblinArcher(), LAKE_HYDRA: lakeHydra(), SCARAB: scarab(), SHIELDBEARER: shieldbearer(),
    SPORECAP: sporecap(), DIREWOLF: wolf(false), HAUNTED_ARMOR: hauntedArmor(), GARGOYLE: gargoyle(), SCORPION: scorpion(), MUMMY: mummy(), YETI: yeti(), FROST_WISP: frostWisp(),
    HELLHOUND: wolf(true), CINDER_SHAMAN: cinderShaman(), VOID_STALKER: voidStalker(), VOID_EYE: voidEye() };
  return cache;
}
export const MODEL_KINDS: EnemyKind[] = ['SLIME', 'SPLITTER', 'GOBLIN', 'BAT', 'SKELETON_ARCHER', 'CULTIST', 'BOMBER', 'BRUTE', 'ZOMBIE', 'WRAITH', 'CRYSTAL_GOLEMITE', 'BANDIT', 'BOAR', 'ROCK_CRAB', 'BOSS_SAPLING', 'BOSS_HYDRA_HEAD', 'BOSS_IMP',
  'GOBLIN_ARCHER', 'LAKE_HYDRA', 'SCARAB', 'SHIELDBEARER',
  'SPORECAP', 'DIREWOLF', 'HAUNTED_ARMOR', 'GARGOYLE', 'SCORPION', 'MUMMY', 'YETI', 'FROST_WISP', 'HELLHOUND', 'CINDER_SHAMAN', 'VOID_STALKER', 'VOID_EYE'];
