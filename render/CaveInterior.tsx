// Crystal cave (the village "CAVE" area): a rock chamber with a lumpy outline, a dusty stone floor, faceted rock walls (tall
// at the back, low at the front so the camera sees in), boulders along the wall foot, stalagmites, glowing crystal
// clusters and mushrooms, a mine cart on a rail track and the daylight exit (south). Everything static is merged into ONE
// lit mesh (+ the floor and ONE glow mesh); 3 real point lights. The harvest nodes are ordinary crates (render/Crates).
// Layout / colliders: engine/caveData.ts.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { CAVE, CAVE_CRYSTALS, CAVE_EXIT, CAVE_LIGHTS, MINE_CART, MUSHROOMS, STALAGMITES, caveRadius } from '../engine/caveData';
import { GB, TAU, fbm, litMat, mulberry32, vnoise } from './util';
import { makeRockGeo } from './models';
import { QualityCfg } from './quality';

type V3 = [number, number, number];
const N = 120;   // outline segments
const WOOD = '#5a3a1e', WOOD2 = '#6e4b2b', IRON = '#2e2e33';
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Wall height around the outline: tall at the back (north, -z), low at the front so the camera looks over it. */
const wallH = (a: number) => CAVE.h + (2.2 - CAVE.h) * sstep(-0.15, 0.75, Math.sin(a));

/** Floor: rings of the outline (+ a lip under the walls), vertex coloured dusty stone with darker edges. */
function buildFloor(): BufferGeometry {
  const R = 10, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new Color(), a1 = new Color('#4d453c'), a2 = new Color('#62584c'), dust = new Color('#766a5a'), edge = new Color('#2a2521');
  for (let k = 0; k <= R; k++) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, t = k / R, r = caveRadius(a) * t + (k === R ? 2.5 : 0);
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
function buildWall(): BufferGeometry {
  const M = 7, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new Color(), lo = new Color('#3a342f'), hi = new Color('#8a8074'), cap = new Color('#1b1815'), teal = new Color('#4f777c');
  const rows = M + 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, R0 = caveRadius(a), h = wallH(a);
      let r: number, y: number;
      if (j <= M) {
        const t = j / M;
        y = h * t;
        r = R0 + 0.35 - 0.7 * Math.sin(Math.PI * t * 0.8) + 1.4 * t * t;   // bulges in a little, flares out at the top
        r += (fbm(a * 6 + y * 0.35, y * 0.5 + a * 2, 3) - 0.5) * 2.2 * (0.35 + t);
        c.copy(lo).lerp(hi, sstep(0, 0.9, t) * (0.7 + vnoise(a * 20, y) * 0.5)).lerp(teal, sstep(0.55, 0.8, fbm(a * 3, y * 0.3 + 5, 2)) * 0.45);
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

function buildProps(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.75, 1.08]), g = new GB([1, 1]);
  const rnd = mulberry32(4242);
  const rocks = [3, 7, 13, 19].map((s, i) => makeRockGeo(900 + s, i % 2 ? '#736b63' : '#665f58', '#56706e', 0.85));
  // ---- boulders along the wall foot (breaks up the outline), skipping the exit gap
  for (let i = 0; i < 46; i++) {
    const a = ((i + rnd() * 0.6) / 46) * TAU;
    if (Math.abs(a - Math.PI / 2) < 0.2) continue;
    const r = caveRadius(a) + 0.2 + rnd() * 0.6, s = 0.9 + rnd() * 1.3 + (Math.sin(a) < 0 ? 0.6 : 0);
    b.addColored(rocks[i % rocks.length], [Math.cos(a) * r, -0.15, Math.sin(a) * r], [0, rnd() * TAU, 0], [s * (0.9 + rnd() * 0.5), s * (0.7 + rnd() * 0.6), s * (0.9 + rnd() * 0.5)]);
  }
  rocks.forEach((r) => r.dispose());
  // ---- stalagmites: a main spike + 1-2 smaller ones
  for (const [x, z, s] of STALAGMITES) {
    const c = rnd() < 0.5 ? '#6d655d' : '#776e64';
    b.cyl(0.62 * s, 0.75 * s, 0.35 * s, 7, [x, 0.17 * s, z], '#4a433d');
    b.cone(0.55 * s, 2.8 * s, 6, [x, 1.55 * s, z], c, [(rnd() - 0.5) * 0.12, rnd() * 3, (rnd() - 0.5) * 0.12]);
    b.cone(0.3 * s, 1.5 * s, 5, [x + 0.45 * s, 0.85 * s, z + 0.25 * s], c, [0, rnd() * 3, 0.15]);
    if (rnd() < 0.6) b.cone(0.22 * s, 1.0 * s, 5, [x - 0.4 * s, 0.6 * s, z - 0.3 * s], c, [0.1, rnd() * 3, -0.1]);
  }
  // ---- glowing crystal clusters (lit rock base + glowing shards)
  const CRY = ['#5fe0ff', '#b98aff'];
  for (const [x, z, s, k] of CAVE_CRYSTALS) {
    b.dodeca(0.7 * s, [x, 0.1, z], '#3e3833', [1.2, 0.55, 1.1]);
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.6, d = i === 0 ? 0 : 0.35 * s + rnd() * 0.3 * s, h = (i === 0 ? 1.9 : 0.9 + rnd() * 0.9) * s;
      const tilt = i === 0 ? 0 : 0.35 + rnd() * 0.35;
      g.octa(0.28 * s, [x + Math.cos(a) * d, h * 0.42, z + Math.sin(a) * d], CRY[k], [0.75, h / (0.56 * s) * 0.5, 0.75], [Math.sin(a) * tilt, rnd() * 3, -Math.cos(a) * tilt]);
    }
  }
  // ---- glowing mushrooms (pale stems, glowing caps)
  for (const [x, z, s] of MUSHROOMS) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = rnd() * 0.8 * s, h = (0.25 + rnd() * 0.35) * s, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      b.cyl(0.04 * s, 0.06 * s, h, 5, [cx, h / 2, cz], '#d8d0c0');
      g.sph((0.12 + rnd() * 0.08) * s, [cx, h, cz], rnd() < 0.5 ? '#5fffd0' : '#7fd8ff', [1, 0.45, 1], 6);
    }
  }
  // ---- rail track from the exit to past the cart + the cart itself (wood box, iron rims, wheels, ore heap)
  const rx = MINE_CART.x, z0 = CAVE_EXIT.z + 1.5, z1 = MINE_CART.z - 4.5;
  for (const sx of [-1, 1]) b.box(0.09, 0.09, z0 - z1, [rx + sx * 0.58, 0.08, (z0 + z1) / 2], IRON);
  for (let z = z1 + 0.3; z < z0; z += 0.72) b.box(1.6, 0.07, 0.26, [rx, 0.04, z], WOOD);
  {
    const { x, z, rot } = MINE_CART, cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (lx: number, ly: number, lz: number): V3 => [x + lx * cr + lz * sr, ly, z - lx * sr + lz * cr];
    b.box(1.5, 0.9, 2.1, at(0, 0.85, 0), WOOD2, [0, rot, 0]);
    b.box(1.6, 0.1, 2.2, at(0, 1.3, 0), IRON, [0, rot, 0]); b.box(1.6, 0.1, 2.2, at(0, 0.45, 0), IRON, [0, rot, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.3, 0.3, 0.14, 8, at(sx * 0.78, 0.3, sz * 0.65), IRON, [0, rot, Math.PI / 2]);
    for (let i = 0; i < 9; i++) b.dodeca(0.24 + rnd() * 0.12, at((rnd() - 0.5) * 1.0, 1.35 + rnd() * 0.2, (rnd() - 0.5) * 1.5), i % 3 ? '#6e6a66' : '#a8742e');
    g.octa(0.14, at(0.3, 1.6, 0.3), '#5fe0ff', [0.8, 1.6, 0.8]);
  }
  // ---- the way out: timber frame in the south wall with daylight behind it, lanterns either side
  const ez = caveRadius(Math.PI / 2) + 0.25, slab = new GB([0.8, 1]).dodeca(1, [0, 0, 0], '#4d4640').build();
  g.box(3.4, 2.8, 0.1, [0, 1.4, ez + 0.5], '#fff0c8'); g.cyl(1.7, 1.7, 0.1, 14, [0, 2.8, ez + 0.5], '#fff0c8', [Math.PI / 2, 0, 0]);
  g.box(4.6, 0.04, 2.4, [0, 0.02, ez - 0.6], '#6d6048');   // warm daylight spill on the floor
  for (const sx of [-1, 1]) {
    b.box(0.34, 3.4, 0.34, [sx * 1.9, 1.7, ez], WOOD); b.box(0.2, 0.9, 0.2, [sx * 1.5, 3.05, ez], WOOD2, [0, 0, sx * 0.8]);
    b.box(0.18, 2.4, 0.18, [sx * 3.1, 1.2, ez - 0.9], WOOD); b.box(0.3, 0.06, 0.3, [sx * 3.1, 2.42, ez - 0.9], IRON);
    g.box(0.24, 0.36, 0.24, [sx * 3.1, 2.22, ez - 0.9], '#ffc86a');
    b.addColored(slab, [sx * 3.4, 0.6, ez + 0.6], [0, sx, 0], [1.8, 1.6, 1.2]);
  }
  slab.dispose();
  b.box(4.4, 0.4, 0.44, [0, 3.5, ez], WOOD2);
  return { body: b.build(), glow: g.build() };
}

export function CaveInterior({ q }: { q: QualityCfg }) {
  const geo = useMemo(() => ({ floor: buildFloor(), wall: buildWall(), ...buildProps() }), []);
  const mats = useMemo(() => ({
    floor: new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    wall: litMat({ roughness: 0.95, flatShading: true, side: DoubleSide }),
    lit: litMat({ roughness: 0.9, flatShading: true }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.3, 1.3, 1.3) }),
    outer: new MeshBasicMaterial({ color: new Color('#050608') }),
  }), []);
  useEffect(() => () => {
    geo.floor.dispose(); geo.wall.dispose(); geo.body.dispose(); geo.glow.dispose();
    mats.floor.dispose(); mats.wall.dispose(); mats.lit.dispose(); mats.glow.dispose(); mats.outer.dispose();
  }, [geo, mats]);
  const l0 = useRef<PointLight>(null!), l1 = useRef<PointLight>(null!), l2 = useRef<PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = 1.25 + Math.sin(t * 1.3) * 0.08;   // crystals breathe a little
    mats.glow.color.setRGB(k, k, k);
    if (l0.current) l0.current.intensity = CAVE_LIGHTS[0][4] * (1 + Math.sin(t * 1.1) * 0.08);
    if (l1.current) l1.current.intensity = CAVE_LIGHTS[1][4] * (1 + Math.sin(t * 0.9 + 2) * 0.08);
    if (l2.current) l2.current.intensity = CAVE_LIGHTS[2][4] + Math.sin(t * 7.3) * 2 + Math.sin(t * 12.9) * 1.2;   // lantern flicker
  });
  const sh = q.shadowMap > 0;
  const refs = [l0, l1, l2];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={mats.outer}><planeGeometry args={[400, 400]} /></mesh>
      <mesh geometry={geo.floor} material={mats.floor} receiveShadow={sh} />
      <mesh geometry={geo.wall} material={mats.wall} receiveShadow={sh} />
      <mesh geometry={geo.body} material={mats.lit} castShadow={sh} receiveShadow={sh} />
      <mesh geometry={geo.glow} material={mats.glow} />
      {CAVE_LIGHTS.map(([x, y, z, c, i, d], n) => <pointLight key={n} ref={refs[n]} position={[x, y, z]} color={c} intensity={i} distance={d} decay={2} />)}
    </group>
  );
}
