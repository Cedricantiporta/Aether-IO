// Procedural multi-part enemy models + per-kind pose functions (all allocation-free per frame).
import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3, InstancedMesh } from 'three';
import type { Enemy, EnemyKind } from '../engine/types';
import { GB, TAU, clamp, lerp } from './util';
import { makeBow } from './weapons';

export type MatKey = 'lit' | 'lit2' | 'jelly' | 'glow';
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
  private base = new Matrix4(); private local = new Matrix4(); private out = new Matrix4();
  private q = new Quaternion(); private qb = new Quaternion(); private eul = new Euler(); private p = new Vector3(); private s = new Vector3();
  bx = 0; by = 0; bz = 0; yaw = 0; sc = 1; fx = 1; fy = 1; yOff = 0;
  begin(x: number, y: number, z: number, yaw: number, scale: number, fx = 1, fy = 1, yOff = 0) { this.bx = x; this.by = y; this.bz = z; this.yaw = yaw; this.sc = scale; this.fx = fx; this.fy = fy; this.yOff = yOff; this.glow = 1; this.body(0, 0, 0, 1, 1); }
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

let cache: Partial<Record<EnemyKind, ModelDef>> | null = null;
export function getModels(): Partial<Record<EnemyKind, ModelDef>> {
  if (!cache) cache = { SLIME: slime(), SPLITTER: splitter(), GOBLIN: goblin(), BAT: bat(), SKELETON_ARCHER: skeleton(), CULTIST: cultist(), BOMBER: bomber(), BRUTE: brute() };
  return cache;
}
export const MODEL_KINDS: EnemyKind[] = ['SLIME', 'SPLITTER', 'GOBLIN', 'BAT', 'SKELETON_ARCHER', 'CULTIST', 'BOMBER', 'BRUTE'];
