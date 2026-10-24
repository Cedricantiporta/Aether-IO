// Crystal cave floors (the village "CAVE" area, engine/systems/cave.ts): a rock chamber with a lumpy outline (bigger and
// sometimes twin-chambered deeper down), a dusty stone floor, faceted rock walls (tall at the back, low at the front so the
// camera sees in), the wall ring of stacked Quaternius rocks, stalagmites, glowing crystal clusters tinted by depth, mushrooms, the way
// out (Floor 1: daylight exit; deeper: the stairs you came down by), the stairs down (boarded up while veins remain),
// lava / poison pools with embers / mist, the lucky ladder, oil flasks, and the rare-vein geodes (rarity-coloured glow,
// a light beam for Legendary / Mythic). Static scenery is merged (floor + wall + ONE lit mesh + ONE glow mesh); 3 floor
// lights + the hero's lantern light (its reach shrinks as the oil runs out, with a flicker when low).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PointLight, Points, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { CAVE, RARE_COLOR, caveLayout, type CaveLayout } from '../engine/caveData';
import { world } from '../engine/world';
import { GB, TAU, fbm, litMat, mulberry32, vnoise } from './util';
import { QtBatch } from './qtNature';
import { QT_H, QT_PREFIX, QT_R, QT_ROCKS, qtPick } from '../engine/qtData';
import type { Place } from './natureKit';
import { lookDim } from './biomeLook';
import { Npcs } from './Npcs';
import { caveCameo } from '../engine/systems/npcs';
import { QualityCfg } from './quality';

type V3 = [number, number, number];
const N = 120;   // outline segments
const WOOD = '#5a3a1e', WOOD2 = '#6e4b2b', IRON = '#2e2e33';
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Wall height around the outline: tall at the back (north, -z), low at the front so the camera looks over it. */
const wallH = (a: number) => CAVE.h + (2.2 - CAVE.h) * sstep(-0.15, 0.75, Math.sin(a));

/** Floor: rings of the outline (+ a lip under the walls), vertex coloured dusty stone with darker edges. */
function buildFloor(L: CaveLayout): BufferGeometry {
  const R = 12, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new Color(), a1 = new Color('#4d453c'), a2 = new Color('#62584c'), dust = new Color('#766a5a'), edge = new Color('#2a2521');
  if (L.hazard === 'LAVA') { a1.set('#4a3a32'); a2.set('#5e4a3e'); dust.set('#6e4a36'); }
  if (L.hazard === 'POISON') { a1.set('#3e463a'); a2.set('#505a48'); dust.set('#5e6a4e'); }
  for (let k = 0; k <= R; k++) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, t = k / R, r = L.radius(a) * t + (k === R ? 2.5 : 0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, 0, z);
      c.copy(a1).lerp(a2, fbm(x * 0.18 + 3, z * 0.18, 3)).lerp(dust, sstep(0.55, 0.85, fbm(x * 0.07, z * 0.07 + 7, 2)) * 0.6);
      c.multiplyScalar(0.9 + vnoise(x * 1.3, z * 1.3) * 0.2).lerp(edge, sstep(0.6, 1, t) * 0.75);
      col.push(c.r, c.g, c.b);
    }
  }
  pos.push(0, 0, 0); c.copy(a2); col.push(c.r, c.g, c.b);
  const ctr = (R + 1) * N;
  for (let i = 0; i < N; i++) idx.push(ctr, (i + 1) % N, i);
  for (let k = 0; k < R; k++) for (let i = 0; i < N; i++) {
    const a = k * N + i, b = k * N + ((i + 1) % N), d = a + N, e = b + N;
    idx.push(a, b, d, b, e, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeVertexNormals();
  return g;
}

/** Rock wall: a strip around the outline, rows from the floor to the wall top, then a cap running outward (hides the void). */
function buildWall(L: CaveLayout): BufferGeometry {
  const M = 7, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new Color(), lo = new Color('#3a342f'), hi = new Color('#5a534b'), cap = new Color('#1b1815'), tint = new Color(L.tint[0]).lerp(new Color('#4f777c'), 0.6);
  if (L.hazard === 'LAVA') tint.set('#8a4a30');
  if (L.hazard === 'POISON') tint.set('#4f7a44');
  const rows = M + 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, R0 = L.radius(a), h = wallH(a);
      let r: number, y: number;
      if (j <= M) {
        const t = j / M;
        y = h * t;
        r = R0 + 0.35 - 0.7 * Math.sin(Math.PI * t * 0.8) + 1.4 * t * t;   // bulges in a little, flares out at the top
        r += (fbm(a * 6 + y * 0.35 + L.floor, y * 0.5 + a * 2, 3) - 0.5) * 2.2 * (0.35 + t);
        c.copy(lo).lerp(hi, sstep(0, 0.9, t) * (0.7 + vnoise(a * 20, y) * 0.5)).lerp(tint, sstep(0.55, 0.8, fbm(a * 3, y * 0.3 + 5 + L.floor, 2)) * 0.45);
      } else {
        y = h + 0.4; r = R0 + 1.4 + 0.35 + 9; c.copy(cap);
      }
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + ((i + 1) % N), d = a + N, e = b + N;
    idx.push(a, d, b, b, d, e);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  const ng = g.toNonIndexed(); g.dispose();
  ng.computeVertexNormals();   // faceted rock
  return ng;
}

/** (owner) Rock formations along the wall foot (Quaternius Rock_Medium_1-3, the Ember halls-wall look): 3-5 overlapping rocks per group, the back wall (north) taller, the exit gap kept free. */
function caveRockSets(L: CaveLayout): Map<string, Place[]> {
  const S = new Map<string, Place[]>(), rnd = mulberry32(5151 + L.floor * 77 + Math.round(L.rx * 100));
  const add = (x: number, y: number, z: number, hw: number, hm: number): void => {
    const node = qtPick(QT_ROCKS, rnd()), k = hw / QT_R[node], key = QT_PREFIX + node; let l = S.get(key); if (!l) S.set(key, (l = []));
    l.push({ x, y, z, ry: rnd() * TAU, sx: k, sy: (hw * hm) / QT_H[node], sz: k * (0.9 + rnd() * 0.3) });
  };
  // the wall ring: stacked rocks all round the outline (more layers where the wall is tall: the back), the exit gap kept free
  const ng = Math.round(64 * (L.rx + L.rz) / (CAVE.rx + CAVE.rz));
  for (let i = 0; i < ng; i++) {
    const a = ((i + rnd() * 0.5) / ng) * TAU;
    if (Math.abs(a - Math.PI / 2) < 0.2) continue;
    const R0 = L.radius(a), h = wallH(a), layers = Math.max(1, Math.ceil(h / 3.4));
    for (let j = 0; j < layers; j++) {
      const hw = (2.2 + rnd() * 1.3) * (1 - j * 0.12), rr = R0 + 0.5 + j * 0.9 + rnd() * 0.5, aj = a + (rnd() - 0.5) * 0.04;
      add(Math.cos(aj) * rr, j * 2.9 - 0.2, Math.sin(aj) * rr, hw, 1.0 + rnd() * 0.5);
    }
    if (rnd() < 0.55) { const hw = 0.9 + rnd() * 0.9, rr = R0 - 0.2 - rnd() * 0.9; add(Math.cos(a + 0.05) * rr, -0.15, Math.sin(a + 0.05) * rr, hw, 0.7 + rnd() * 0.6); }   // a small boulder at the foot
  }
  return S;
}

function buildProps(L: CaveLayout): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.75, 1.08]), g = new GB([1, 1]);
  const rnd = mulberry32(4242 + L.floor * 77 + Math.round(L.rx * 100));
  const rocks: BufferGeometry[] = [];   // (the wall-foot boulders are Quaternius rock formations now: caveRockSets)
  rocks.forEach((r) => r.dispose());
  // ---- stalagmites: a main spike + 1-2 smaller ones
  for (const [x, z, s] of L.stalagmites) {
    const c = rnd() < 0.5 ? '#6d655d' : '#776e64';
    b.cyl(0.62 * s, 0.75 * s, 0.35 * s, 7, [x, 0.17 * s, z], '#4a433d');
    b.cone(0.55 * s, 2.8 * s, 6, [x, 1.55 * s, z], c, [(rnd() - 0.5) * 0.12, rnd() * 3, (rnd() - 0.5) * 0.12]);
    b.cone(0.3 * s, 1.5 * s, 5, [x + 0.45 * s, 0.85 * s, z + 0.25 * s], c, [0, rnd() * 3, 0.15]);
    if (rnd() < 0.6) b.cone(0.22 * s, 1.0 * s, 5, [x - 0.4 * s, 0.6 * s, z - 0.3 * s], c, [0.1, rnd() * 3, -0.1]);
  }
  // ---- glowing crystal clusters (lit rock base + glowing shards, tinted by depth)
  for (const [x, z, s, k] of L.crystals) {
    b.dodeca(0.7 * s, [x, 0.1, z], '#3e3833', [1.2, 0.55, 1.1]);
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.6, d = i === 0 ? 0 : 0.35 * s + rnd() * 0.3 * s, h = (i === 0 ? 1.9 : 0.9 + rnd() * 0.9) * s;
      const tilt = i === 0 ? 0 : 0.35 + rnd() * 0.35;
      g.octa(0.28 * s, [x + Math.cos(a) * d, h * 0.42, z + Math.sin(a) * d], L.tint[k], [0.75, h / (0.56 * s) * 0.5, 0.75], [Math.sin(a) * tilt, rnd() * 3, -Math.cos(a) * tilt]);
    }
  }
  // ---- glowing mushrooms (pale stems, glowing caps)
  for (const [x, z, s] of L.mushrooms) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = rnd() * 0.8 * s, h = (0.25 + rnd() * 0.35) * s, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      b.cyl(0.04 * s, 0.06 * s, h, 5, [cx, h / 2, cz], '#d8d0c0');
      g.sph((0.12 + rnd() * 0.08) * s, [cx, h, cz], rnd() < 0.5 ? '#5fffd0' : '#7fd8ff', [1, 0.45, 1], 6);
    }
  }
  // ---- Floor 1: rail track + mine cart, Grit's lantern bench
  if (L.cart) {
    const rx = L.cart.x, z0 = L.exit.z + 1.5, z1 = L.cart.z - 4.5;
    for (const sx of [-1, 1]) b.box(0.09, 0.09, z0 - z1, [rx + sx * 0.58, 0.08, (z0 + z1) / 2], IRON);
    for (let z = z1 + 0.3; z < z0; z += 0.72) b.box(1.6, 0.07, 0.26, [rx, 0.04, z], WOOD);
    const { x, z, rot } = L.cart, cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (lx: number, ly: number, lz: number): V3 => [x + lx * cr + lz * sr, ly, z - lx * sr + lz * cr];
    b.box(1.5, 0.9, 2.1, at(0, 0.85, 0), WOOD2, [0, rot, 0]);
    b.box(1.6, 0.1, 2.2, at(0, 1.3, 0), IRON, [0, rot, 0]); b.box(1.6, 0.1, 2.2, at(0, 0.45, 0), IRON, [0, rot, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.3, 0.3, 0.14, 8, at(sx * 0.78, 0.3, sz * 0.65), IRON, [0, rot, Math.PI / 2]);
    for (let i = 0; i < 9; i++) b.dodeca(0.24 + rnd() * 0.12, at((rnd() - 0.5) * 1.0, 1.35 + rnd() * 0.2, (rnd() - 0.5) * 1.5), i % 3 ? '#6e6a66' : '#a8742e');
    g.octa(0.14, at(0.3, 1.6, 0.3), '#5fe0ff', [0.8, 1.6, 0.8]);
  }
  if (L.bench) {
    const { x, z } = L.bench;
    b.box(2.2, 0.12, 1.0, [x, 0.95, z], WOOD2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.95, 0.12, [x + sx * 0.95, 0.47, z + sz * 0.38], WOOD);
    for (const [lx, c] of [[-0.6, '#ffc86a'], [0.1, '#ffd890'], [0.7, '#ffb85a']] as const) { b.box(0.26, 0.05, 0.26, [x + lx, 1.03, z], IRON); g.box(0.2, 0.3, 0.2, [x + lx, 1.22, z], c); b.cone(0.18, 0.16, 4, [x + lx, 1.43, z], IRON, [0, Math.PI / 4, 0]); }
    for (const [ox, oz] of [[1.5, 0.3], [1.6, -0.6]]) { b.cyl(0.36, 0.36, 0.85, 9, [x + ox, 0.43, z + oz], '#6a4526'); b.cyl(0.38, 0.38, 0.08, 9, [x + ox, 0.7, z + oz], IRON); b.cyl(0.38, 0.38, 0.08, 9, [x + ox, 0.2, z + oz], IRON); }
    b.box(1.6, 1.4, 0.1, [x, 1.75, z - 0.55], WOOD); for (let i = 0; i < 3; i++) b.box(0.08, 0.4, 0.08, [x - 0.5 + i * 0.5, 2.1, z - 0.45], IRON);
  }
  // ---- the way out (south): Floor 1 = timber frame with daylight; deeper = wooden stairs climbing into the rock
  const ez = L.radius(Math.PI / 2) + 0.25, slab = new GB([0.8, 1]).dodeca(1, [0, 0, 0], '#4d4640').build();
  if (L.floor === 1) {
    g.box(3.4, 2.8, 0.1, [0, 1.4, ez + 0.5], '#fff0c8'); g.cyl(1.7, 1.7, 0.1, 14, [0, 2.8, ez + 0.5], '#fff0c8', [Math.PI / 2, 0, 0]);
    g.box(4.6, 0.04, 2.4, [0, 0.02, ez - 0.6], '#6d6048');   // warm daylight spill on the floor
  } else {
    for (let k = 0; k < 6; k++) b.box(3.0, 0.3 + k * 0.32, 0.6, [0, (0.3 + k * 0.32) / 2, ez - 1.6 + k * 0.55], k % 2 ? WOOD : WOOD2);
    g.box(3.0, 2.2, 0.1, [0, 3.0, ez + 1.6], '#ffd9a0'); g.box(3.6, 0.04, 1.8, [0, 0.02, ez - 2.4], '#5d5040');
  }
  for (const sx of [-1, 1]) {
    b.box(0.34, 3.4, 0.34, [sx * 1.9, 1.7, ez], WOOD); b.box(0.2, 0.9, 0.2, [sx * 1.5, 3.05, ez], WOOD2, [0, 0, sx * 0.8]);
    b.box(0.18, 2.4, 0.18, [sx * 3.1, 1.2, ez - 0.9], WOOD); b.box(0.3, 0.06, 0.3, [sx * 3.1, 2.42, ez - 0.9], IRON);
    g.box(0.24, 0.36, 0.24, [sx * 3.1, 2.22, ez - 0.9], '#ffc86a');
    b.addColored(slab, [sx * 3.4, 0.6, ez + 0.6], [0, sx, 0], [1.8, 1.6, 1.2]);
  }
  slab.dispose();
  b.box(4.4, 0.4, 0.44, [0, 3.5, ez], WOOD2);
  // ---- the stairs down (north): a dark stairwell with steps going down, a rim of stones, a lantern post
  const { x: dx, z: dz } = L.down;
  b.box(3.0, 0.04, 3.4, [dx, 0.03, dz - 0.4], '#050405');
  for (let k = 0; k < 4; k++) b.box(2.6, 0.06, 0.5, [dx, 0.05, dz + 0.9 - k * 0.65], k % 2 ? '#3a2a1c' : '#2a1e14', [0, 0, 0], [0.4 + k * 0.1, 0.4]);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; b.dodeca(0.35 + rnd() * 0.15, [dx + Math.cos(a) * 1.85, 0.12, dz - 0.4 + Math.sin(a) * 2.05], '#5a524a', [1, 0.6, 1]); }
  b.box(0.16, 2.4, 0.16, [dx + 2.3, 1.2, dz + 1.0], WOOD); b.box(0.7, 0.1, 0.1, [dx + 2.0, 2.35, dz + 1.0], WOOD); g.box(0.22, 0.32, 0.22, [dx + 1.75, 2.08, dz + 1.0], '#ffc86a');
  return { body: b.build(), glow: g.build() };
}

/** Barricade over the stairwell (shown while veins remain) and the cool glow rising from it once open. */
function buildStairState(L: CaveLayout): { boards: BufferGeometry; open: BufferGeometry } {
  const b = new GB([0.8, 1.05]), g = new GB([1, 1]), { x, z } = L.down;
  for (let k = 0; k < 4; k++) b.box(3.6, 0.12, 0.5, [x, 0.25 + (k % 2) * 0.05, z - 1.6 + k * 0.85], k % 2 ? '#7a5434' : '#6a4526', [0, (k - 1.5) * 0.06, 0]);
  b.box(0.45, 0.12, 4.0, [x - 0.8, 0.36, z - 0.4], '#5a3a1e', [0, 0.5, 0]); b.box(0.45, 0.12, 4.0, [x + 0.8, 0.36, z - 0.4], '#5a3a1e', [0, -0.5, 0]);
  for (let i = 0; i < 5; i++) b.dodeca(0.3 + i * 0.05, [x - 1 + i * 0.5, 0.45, z - 0.2 + (i % 2) * 0.6], '#6e665e', [1, 0.7, 1]);
  g.box(2.6, 0.03, 3.0, [x, 0.06, z - 0.4], '#2d6f86');
  g.cyl(1.0, 1.4, 2.2, 10, [x, 1.1, z - 0.4], '#1d4656');
  return { boards: b.build(), open: g.build() };
}

/** Hazard pools (flat glowing discs + a dark crusted rim) and their particle field. */
function buildPools(L: CaveLayout): { glow: BufferGeometry; rim: BufferGeometry; pts: BufferGeometry } | null {
  if (!L.pools.length) return null;
  const g = new GB([1, 1]), b = new GB([0.85, 1]), rnd = mulberry32(77 + L.floor);
  const lava = L.hazard === 'LAVA', c1 = lava ? '#ff5a1a' : '#5aff4a', c2 = lava ? '#ffc23a' : '#b4ff6a', rim = lava ? '#2a1612' : '#24301e';
  const pp: number[] = [];
  for (const [x, z, r] of L.pools) {
    b.cyl(r + 0.35, r + 0.45, 0.06, 16, [x, 0.025, z], rim, [0, rnd() * 3, 0], [1, 1, 0.85 + rnd() * 0.3]);
    g.cyl(r, r, 0.05, 16, [x, 0.05, z], c1, [0, rnd() * 3, 0], [1, 1, 0.85 + rnd() * 0.3]);
    for (let i = 0; i < 4; i++) { const a = rnd() * TAU, d = rnd() * r * 0.6; g.cyl(r * 0.25, r * 0.25, 0.05, 8, [x + Math.cos(a) * d, 0.07, z + Math.sin(a) * d], c2, [0, rnd() * 3, 0]); }
    const n = Math.round(6 + r * 4);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r; pp.push(x + Math.cos(a) * d, rnd(), z + Math.sin(a) * d); }
  }
  const pts = new BufferGeometry(); pts.setAttribute('position', new Float32BufferAttribute(pp, 3));
  return { glow: g.build(), rim: b.build(), pts };
}
const PT_VS = `uniform float uTime; uniform float uRise; varying float vA;
void main(){ float ph = fract(position.y + uTime * 0.25); vec3 p = vec3(position.x + sin(uTime + position.y * 20.0) * 0.25, ph * uRise, position.z);
  vA = sin(ph * 3.14159); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 9.0 * (30.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const PT_FS = `uniform vec3 uColor; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d)) * vA; gl_FragColor = vec4(uColor, a); }`;

/** Lucky ladder (a hole with a ladder sticking out), oil flask, rare-vein geode (base + glowing crystals) and its beam. */
function buildBits() {
  const lad = new GB([0.8, 1.05]), ladG = new GB([1, 1]);
  lad.cyl(1.0, 1.0, 0.04, 12, [0, 0.03, 0], '#050405');
  for (const sx of [-1, 1]) lad.box(0.1, 2.0, 0.1, [sx * 0.42, 0.8, 0.15], '#7a5434', [-0.25, 0, 0]);
  for (let k = 0; k < 4; k++) lad.box(0.8, 0.07, 0.07, [0, 0.2 + k * 0.42, 0.2 - k * 0.1], '#6a4526', [-0.25, 0, 0]);
  ladG.cyl(1.25, 1.25, 0.03, 16, [0, 0.04, 0], '#ffe08a');
  const fl = new GB([1, 1]);
  fl.cyl(0.18, 0.24, 0.42, 8, [0, 0.21, 0], '#ffb83a'); fl.cyl(0.07, 0.09, 0.16, 6, [0, 0.5, 0], '#ffd890'); fl.cyl(0.38, 0.38, 0.02, 12, [0, 0.02, 0], '#7a5a20');
  const base = new GB([0.7, 1]).dodeca(1.0, [0, 0.15, 0], '#2a2430', [1.25, 0.6, 1.2]).dodeca(0.55, [0.7, 0.1, 0.5], '#221d28', [1, 0.6, 1]);
  const cry = new GB([0.75, 1.15]);
  const r = mulberry32(9);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, d = i === 0 ? 0 : 0.55 + r() * 0.3, h = i === 0 ? 2.4 : 1.1 + r() * 0.9, t = i === 0 ? 0 : 0.4 + r() * 0.3; cry.octa(0.34, [Math.cos(a) * d, h * 0.45 + 0.2, Math.sin(a) * d], '#ffffff', [0.75, h * 0.9, 0.75], [Math.sin(a) * t, r() * 3, -Math.cos(a) * t]); }
  return { ladder: lad.build(), ladderGlow: ladG.build(), flask: fl.build(), geode: base.build(), crystals: cry.build() };
}

const MAXR = 16;
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _c = new Color();

export function CaveInterior({ q }: { q: QualityCfg }) {
  const cv = world.village.cave;
  const L = caveLayout(cv.floor, cv.seed);
  const rockSets = useMemo(() => caveRockSets(L), [L]);
  const geo = useMemo(() => ({ floor: buildFloor(L), wall: buildWall(L), ...buildProps(L), stairs: buildStairState(L), pools: buildPools(L), bits: buildBits() }), [L]);
  const mats = useMemo(() => ({
    floor: new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    wall: litMat({ roughness: 0.95, flatShading: true, side: DoubleSide }),
    lit: litMat({ roughness: 0.9, flatShading: true }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.3, 1.3, 1.3) }),
    pool: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.4, 1.4, 1.4), transparent: L.hazard === 'POISON', opacity: 0.85 }),
    open: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    outer: new MeshBasicMaterial({ color: new Color('#050608') }),
    gem: new MeshBasicMaterial({ toneMapped: false, color: new Color(1.5, 1.5, 1.5) }),
    beam: new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    pts: new ShaderMaterial({
      vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uRise: { value: L.hazard === 'LAVA' ? 3.5 : 1.6 }, uColor: { value: new Color(L.hazard === 'LAVA' ? '#ffa040' : '#9aff7a') } },
    }),
  }), [L]);
  useEffect(() => () => {
    geo.floor.dispose(); geo.wall.dispose(); geo.body.dispose(); geo.glow.dispose(); geo.stairs.boards.dispose(); geo.stairs.open.dispose();
    if (geo.pools) { geo.pools.glow.dispose(); geo.pools.rim.dispose(); geo.pools.pts.dispose(); }
    Object.values(geo.bits).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
    lookDim.k = 1;
  }, [geo, mats]);
  const l0 = useRef<PointLight>(null!), l1 = useRef<PointLight>(null!), l2 = useRef<PointLight>(null!), hero = useRef<PointLight>(null!);
  const boards = useRef<Mesh>(null!), open = useRef<Mesh>(null!), ladder = useRef<Group>(null!);
  // stairs unlocked: a golden light + beam + pulsing ring fade in so the way down is obvious
  const stairFx = useRef<Group>(null!), stairLight = useRef<PointLight>(null!), stairBeam = useRef<Mesh>(null!), stairRing = useRef<Mesh>(null!), openK = useRef(0);
  const stairMats = useMemo(() => ({
    beam: new MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    ring: new MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => { stairMats.beam.dispose(); stairMats.ring.dispose(); }, [stairMats]);
  const flasks = useRef<Group>(null!), geodes = useRef<InstancedMesh>(null!), gems = useRef<InstancedMesh>(null!), beams = useRef<InstancedMesh>(null!);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, oil = cv.oilMax > 0 ? cv.oil / cv.oilMax : 1, deep = cv.floor > 1;
    // low oil: the lantern's reach shrinks, the scene darkens, the light flickers; empty = pitch black
    const low = deep ? sstep(0, 0.25, oil) : 1, flick = deep && oil < 0.25 ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.1) : 1;
    const dim = (0.25 + 0.75 * low) * flick * (1 - cv.dark);
    lookDim.k = dim;
    const k = 1.25 + Math.sin(t * 1.3) * 0.08;   // crystals breathe a little
    mats.glow.color.setRGB(k * (0.4 + 0.6 * dim), k * (0.4 + 0.6 * dim), k * (0.4 + 0.6 * dim));
    mats.pool.color.setScalar(1.2 + Math.sin(t * 2.1) * 0.2);
    mats.pts.uniforms.uTime.value = t;
    const lr = [l0, l1, l2];
    for (let i = 0; i < 3; i++) { const l = lr[i].current; if (l) l.intensity = L.lights[i][4] * (1 + Math.sin(t * (1.1 + i * 0.4) + i) * 0.08) * dim; }
    if (hero.current) {
      const p = world.player.pos; hero.current.position.set(p.x, 3.2, p.z);
      hero.current.distance = deep ? 6 + 14 * low : 12;
      hero.current.intensity = (deep ? 30 : 12) * flick * (1 - cv.dark);
    }
    if (boards.current) boards.current.visible = cv.left > 0;
    if (open.current) { open.current.visible = cv.left <= 0; mats.open.opacity = 0.35 + Math.sin(t * 2.4) * 0.12; }
    {
      const ok = cv.left <= 0 ? 1 : 0; openK.current += (ok - openK.current) * Math.min(1, dt * 2.5);
      const o = openK.current, pulse = 0.8 + 0.2 * Math.sin(t * 3);
      if (stairFx.current) stairFx.current.visible = o > 0.01;
      if (stairLight.current) stairLight.current.intensity = 70 * o * pulse;
      stairMats.beam.opacity = 0.22 * o * pulse; stairMats.ring.opacity = 0.75 * o * (0.6 + 0.4 * Math.sin(t * 4));
      if (stairRing.current) { const s = 1 + ((t * 0.6) % 1) * 0.5; stairRing.current.scale.set(s, s, 1); }
    }
    if (ladder.current) { ladder.current.visible = cv.ladderFound; ladder.current.position.set(cv.lx, 0, cv.lz); }
    if (flasks.current) for (let i = 0; i < flasks.current.children.length; i++) {
      const c = flasks.current.children[i], f = cv.flasks[i];
      c.visible = !!f && f.on; if (f && f.on) { c.position.set(f.x, 0.1 + Math.sin(t * 3 + i) * 0.1, f.z); c.rotation.y = t; }
    }
    // rare veins: geode + glowing crystals (shrinking as they crack), beam for Legendary / Mythic
    const G = geodes.current, C = gems.current, B = beams.current;
    if (G && C && B) {
      let n = 0, nb = 0;
      for (let i = 0; i < L.nodes.length && n < MAXR; i++) {
        const tier = cv.rare[i], c = world.crates[i];
        if (tier <= 0 || !c.active) continue;
        const hp = c.maxHp > 0 ? c.hp / c.maxHp : 1, pulse = 1 + Math.sin(t * (2 + tier) + i) * 0.04;
        const sc = (0.55 + 0.45 * hp) * (1 + tier * 0.12);
        _p.set(c.pos.x, 0, c.pos.z); _q.identity(); _s.setScalar(1 + tier * 0.1); _m.compose(_p, _q, _s); G.setMatrixAt(n, _m);
        _s.set(sc * pulse, sc * pulse, sc * pulse); _m.compose(_p, _q, _s); C.setMatrixAt(n, _m);
        _c.set(RARE_COLOR[tier]).multiplyScalar(tier === 4 ? 1.4 + 0.4 * Math.sin(t * 3) : 1.2); C.setColorAt(n, _c);
        if (tier >= 3) { _p.y = 9; _s.set(1, 1, 1); _m.compose(_p, _q, _s); B.setMatrixAt(nb, _m); _c.set(RARE_COLOR[tier]); B.setColorAt(nb, _c); nb++; }
        n++;
      }
      G.count = n; C.count = n; B.count = nb;
      G.instanceMatrix.needsUpdate = true; C.instanceMatrix.needsUpdate = true; B.instanceMatrix.needsUpdate = true;
      if (C.instanceColor) C.instanceColor.needsUpdate = true;
      if (B.instanceColor) B.instanceColor.needsUpdate = true;
      mats.beam.opacity = 0.16 + Math.sin(t * 2) * 0.06;
    }
    void dt;
  });
  const sh = q.shadowMap > 0;
  const refs = [l0, l1, l2];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={mats.outer}><planeGeometry args={[600, 600]} /></mesh>
      <mesh geometry={geo.floor} material={mats.floor} receiveShadow={sh} />
      <mesh geometry={geo.wall} material={mats.wall} receiveShadow={sh} />
      <mesh geometry={geo.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.glow} material={mats.glow} />
      <React.Suspense fallback={null}><QtBatch sets={rockSets} shadows={sh} tint={L.hazard === 'LAVA' ? '#d9a088' : L.hazard === 'POISON' ? '#a9c9a0' : '#a9a6c8'} /></React.Suspense>
      <mesh ref={boards} geometry={geo.stairs.boards} material={mats.lit} castShadow={sh} />
      <mesh ref={open} geometry={geo.stairs.open} material={mats.open} visible={false} />
      {/* (the light stays mounted at intensity 0: toggling a light's visibility would recompile every material) */}
      <pointLight ref={stairLight} color="#ffcf6a" intensity={0} distance={16} decay={1.6} position={[L.down.x, 2.4, L.down.z - 0.4]} />
      <group ref={stairFx} position={[L.down.x, 0, L.down.z - 0.4]} visible={false}>
        <mesh ref={stairBeam} material={stairMats.beam} position={[0, 4.5, 0]}><cylinderGeometry args={[1.2, 1.8, 9, 16, 1, true]} /></mesh>
        <mesh ref={stairRing} material={stairMats.ring} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.2, 2.6, 32]} /></mesh>
      </group>
      {geo.pools && <>
        <mesh geometry={geo.pools.rim} material={mats.lit} receiveShadow={sh} />
        <mesh geometry={geo.pools.glow} material={mats.pool} />
        <points geometry={geo.pools.pts} material={mats.pts} frustumCulled={false} />
      </>}
      <group ref={ladder} visible={false}>
        <mesh geometry={geo.bits.ladder} material={mats.lit} />
        <mesh geometry={geo.bits.ladderGlow} material={mats.open} />
      </group>
      <group ref={flasks}>
        {cv.flasks.map((_, i) => <mesh key={i} geometry={geo.bits.flask} material={mats.glow} visible={false} />)}
      </group>
      <instancedMesh ref={geodes} args={[geo.bits.geode, mats.lit, MAXR]} frustumCulled={false} />
      <instancedMesh ref={gems} args={[geo.bits.crystals, mats.gem, MAXR]} frustumCulled={false} />
      <instancedMesh ref={beams} args={[undefined as unknown as BufferGeometry, mats.beam, MAXR]} frustumCulled={false}><cylinderGeometry args={[0.6, 0.9, 18, 10, 1, true]} /></instancedMesh>
      {L.lights.map(([x, y, z, c, i, d], n) => <pointLight key={n} ref={refs[n]} position={[x, y, z]} color={c} intensity={i} distance={d} decay={2} />)}
      <pointLight ref={hero} color="#ffc27a" intensity={12} distance={12} decay={1.6} />
      {L.floor === 1 && <Npcs area="CAVE" />}
      {L.floor > 1 && L.floor === caveCameo.floor && <Npcs area="CAVE" deep />}
    </group>
  );
}
