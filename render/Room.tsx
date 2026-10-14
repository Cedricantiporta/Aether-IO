// The run room: biome-tinted ground disc, walls ring (via Props: the same instanced scenery path as the town), the room's
// single station (fountain / merchant / chest / altar), exit portals with reward labels and telegraphed spawn markers.
// Only the current room exists; it is rebuilt when world.room.version changes (during the black fade). No per-frame allocations.
import { campPos } from '../engine/systems/director';
import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, CircleGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
  CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry, SRGBColorSpace,
} from 'three';
import { Stars } from '@react-three/drei';
import { runInfo } from '../engine/runMods';
import { Coins, Diamond, Droplets, Flame, Gem, Heart, Package, Skull, Sparkles, Store, Sword } from 'lucide-react';
import { world } from '../engine/world';
import { shape, shapeLimit } from '../engine/roomShape';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { BIOMES, biomeOf, portalLabel } from '../engine/roomDefs';
import { GB, fbm, litMat, mulberry32, vnoise } from './util';
import { useWorldCounter } from './hooks';
import { Props } from './Props';
import type { QualityCfg } from './quality';
import { SpecialRooms } from './SpecialRooms';

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new Color(), _c2 = new Color(), _c3 = new Color(), _c4 = new Color();

// ------------------------------------------------------------------ ground ---
function RoomGround({ biome, R, seed, boss }: { biome: number; R: number; seed: number; boss: boolean }) {
  const { geo, mat, tufts, slabs } = useMemo(() => {
    const def = biomeOf(biome);
    const S = 2 * (shape.maxR + 44), seg = 128;
    const g = new PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const g0 = _c.set(def.ground[0]), g1 = _c2.set(def.ground[1]), edge = _c3.set(def.edge), rim = _c4.set('#8c877c').lerp(g0, 0.4);
    const so = (seed % 997) * 0.37;
    const PATCH = [['#5fb83e', '#b7c45a', '#8f7448'], ['#3a8a3a', '#7d8a3e', '#5a4630'], ['#5c6e34', '#7e7a44', '#4a3e26'], ['#e8f2fb', '#b9c7d4', '#9aa6b2'], ['#5a3222', '#8a4a26', '#2a1a14'], ['#33245a', '#4e2c7a', '#16102a']][((biome % 6) + 6) % 6];
    const lush = new Color(PATCH[0]), dry = new Color(PATCH[1]), dirt = new Color(PATCH[2]);
    const stone = new Color(biome % 6 === 4 ? '#6e625c' : biome % 6 === 5 ? '#5e5878' : '#a39d90'), stoneC = new Color();
    const path = !boss && (seed % 5) !== 0;
    const out = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // signed distance-ish to the walkable outline (0 at the old disc edge R), so rim / outside tint follow the shape
      const u = r - (shapeLimit(x, z) - 1);
      const n1 = fbm(x * 0.06 + so, z * 0.06 - so, 3), n2 = vnoise(x * 0.9 + so, z * 0.9);
      out.copy(g0).lerp(g1, sstep(0.3, 0.72, n1)).multiplyScalar(0.9 + n2 * 0.2);
      // worn patches of the second tone
      out.lerp(g1, sstep(0.62, 0.78, fbm(x * 0.14 - so, z * 0.14 + so, 2)) * 0.35);
      // big colour zones: lush / dry grass and bare-dirt patches (more variety across the room)
      const zA = fbm(x * 0.055 - so * 1.7, z * 0.055 + so, 3), zB = fbm(x * 0.07 + so * 2.3, z * 0.07 - so * 0.6, 3);
      out.lerp(lush, sstep(0.48, 0.62, zA) * 0.85);
      out.lerp(dry, sstep(0.5, 0.64, zB) * 0.8);
      out.lerp(dirt, sstep(0.64, 0.74, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.85);
      // stone path from the arrival side to the exits (most non-boss rooms), gently winding
      if (path) {
        const t = x * shape.fx + z * shape.fz, l = x * -shape.fz + z * shape.fx;
        const cl = Math.sin(t * 0.11 + so) * 2.6 + Math.sin(t * 0.27 - so) * 0.8;
        const w = 1.9 + vnoise(t * 0.2 + so, 3.1) * 0.9;
        const pd = Math.abs(l - cl) - w;
        const k = sstep(0.6, -0.4, pd) * sstep(0.5, -1.5, u);
        if (k > 0) {
          // cobbles: cell noise darkens the gaps between stones
          const cx = x * 1.25, cz = z * 1.25, fx = cx - Math.floor(cx), fz = cz - Math.floor(cz) + (Math.floor(cx) % 2) * 0.5;
          const gap = Math.min(fx, 1 - fx, fz - Math.floor(fz), 1 - (fz - Math.floor(fz)));
          stoneC.copy(stone).multiplyScalar(0.85 + vnoise(Math.floor(cx) * 3.1, Math.floor(cz + (Math.floor(cx) % 2) * 0.5) * 2.7) * 0.3);
          if (gap < 0.09) stoneC.multiplyScalar(0.62);
          out.lerp(stoneC, k * 0.92);
        }
      }
      // stone rim just inside the walls
      out.lerp(rim, sstep(-1.4, -0.2, u) * 0.55);
      // boss arena: a faint rune circle
      if (boss) {
        const rr = Math.abs(r - (shapeLimit(x, z) - 1) * 0.62);
        out.lerp(g1, sstep(0.9, 0.2, rr) * 0.6).multiplyScalar(1 + sstep(0.5, 0.1, rr) * 0.25);
        out.multiplyScalar(1 + sstep(R * 0.2, 0, r) * 0.2);
      }
      // floor beyond the walls
      const e = sstep(0.2, 3.2, u);
      out.lerp(edge, e).multiplyScalar(1 - e * 0.35);
      col[i * 3] = out.r; col[i * 3 + 1] = out.g; col[i * 3 + 2] = out.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });

    // ground clutter: pebbles / tufts in the biome's tones (one instanced draw call)
    const N = 45; // sparse clutter (user: fewer small bushes)
    const tg = new GB([0.8, 1.1]);
    tg.ico(0.2, [0, 0.08, 0], '#ffffff', [1.3, 0.55, 1.1], 0);
    tg.cone(0.07, 0.38, 4, [0.12, 0.19, 0.05], '#ffffff', [0.2, 0, 0.3]);
    tg.cone(0.07, 0.3, 4, [-0.1, 0.15, -0.06], '#ffffff', [-0.2, 0, -0.3]);
    const tgeo = tg.build();
    const tm = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const inst = new InstancedMesh(tgeo, tm, N);
    const rnd = mulberry32(seed ^ 0x51ed);
    const o = new Object3D();
    const cc = new Color();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shapeLimit(Math.cos(a), Math.sin(a)) - 2);
      o.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      o.rotation.set(0, rnd() * 6.28, 0);
      const s = 0.6 + rnd() * 1.3;
      o.scale.set(s, s * (0.8 + rnd() * 0.6), s);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
      cc.set(def.ground[rnd() < 0.5 ? 0 : 1]).multiplyScalar(0.55 + rnd() * 0.7).offsetHSL(0, 0, rnd() < 0.15 ? 0.2 : 0);
      inst.setColorAt(i, cc);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;

    // flat stepping stones along the stone path (one instanced draw)
    const SG = new GB([0.9, 1.1]); SG.cyl(0.62, 0.7, 0.14, 6, [0, 0.05, 0], '#ffffff');
    const slabs = new InstancedMesh(SG.build(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 90);
    let ns = 0;
    if (path) {
      const r2 = mulberry32(seed ^ 0x7a11);
      for (let t = -shape.maxR; t <= shape.maxR && ns < 90; t += 0.95) {
        const cl = Math.sin(t * 0.11 + so) * 2.6 + Math.sin(t * 0.27 - so) * 0.8;
        for (let k = 0; k < 2 && ns < 90; k++) {
          const l = cl + (r2() - 0.5) * 2.6;
          const x = t * shape.fx - l * shape.fz, z = t * shape.fz + l * shape.fx;
          if (Math.hypot(x, z) > shapeLimit(x, z) - 2.5 || r2() < 0.25) continue;
          o.position.set(x, 0, z); o.rotation.set(0, r2() * 6.28, 0);
          const sc = 0.65 + r2() * 0.5; o.scale.set(sc * (0.9 + r2() * 0.4), 1, sc); o.updateMatrix();
          slabs.setMatrixAt(ns, o.matrix);
          cc.copy(stone).multiplyScalar(0.8 + r2() * 0.35); slabs.setColorAt(ns, cc); ns++;
        }
      }
    }
    slabs.count = ns; slabs.receiveShadow = true;
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    return { geo: g, mat: m, tufts: inst, slabs };
  }, [biome, R, seed, boss]);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <primitive object={tufts} />
      <primitive object={slabs} />
    </>
  );
}

// ----------------------------------------------------------- tower floor ---
let cobbleTex: CanvasTexture | null = null;
/** Cobblestone / cement texture for the round tower floors: concentric rings of worn grey stones (built once). */
function towerCobbles(): CanvasTexture {
  if (cobbleTex) return cobbleTex;
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(0x70e3);
  g.fillStyle = '#4a4a4f'; g.fillRect(0, 0, N, N);   // mortar / cement
  const cx = N / 2, ringW = 17;
  for (let r0 = 0; r0 < N * 0.72; r0 += ringW) {
    const n = Math.max(6, Math.round((Math.PI * 2 * (r0 + ringW / 2)) / 24));
    const off = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2 + 0.012, a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.012;
      const rIn = r0 + 1.8, rOut = r0 + ringW - 1.8;
      const v = 0.75 + rnd() * 0.4, warm = rnd() * 10;
      g.fillStyle = `rgb(${Math.round(128 * v + warm)},${Math.round(126 * v + warm * 0.6)},${Math.round(122 * v)})`;
      g.beginPath(); g.arc(cx, cx, rOut, a0, a1); g.arc(cx, cx, Math.max(0, rIn), a1, a0, true); g.closePath(); g.fill();
      // a lighter top face for a little bevel
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.beginPath(); g.arc(cx, cx, rOut - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cx, Math.max(0, rIn + 5), a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
    }
  }
  // grime + speckle so it reads as rough rock, not tiles
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * N, y = rnd() * N, s = 1 + rnd() * 2.5;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.06)'; g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,20,30,0.18)'); gr.addColorStop(1, 'rgba(20,20,30,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cobbleTex = new CanvasTexture(c); cobbleTex.colorSpace = SRGBColorSpace; cobbleTex.anisotropy = 4;
  return cobbleTex;
}

/** Endless Tower floor: a round cobbled platform floating in the night sky (stone skirt below, rune ring, stars). */
function TowerFloor({ R }: { R: number }) {
  const { top, skirt, rune } = useMemo(() => {
    const rr = R + 3.4;
    const tg = new CircleGeometry(rr, 96); tg.rotateX(-Math.PI / 2);
    const top = new Mesh(tg, new MeshStandardMaterial({ map: towerCobbles(), roughness: 0.95, metalness: 0 }));
    top.position.y = 0.005; top.receiveShadow = true;
    const sg = new CylinderGeometry(rr, rr * 0.55, 7, 48, 1, true);
    const skirt = new Mesh(sg, new MeshStandardMaterial({ color: '#2c2c36', roughness: 1, side: DoubleSide }));
    skirt.position.y = -3.5;
    const rg = new RingGeometry(R * 0.62 - 0.12, R * 0.62 + 0.12, 96); rg.rotateX(-Math.PI / 2);
    const rune = new Mesh(rg, new MeshBasicMaterial({ color: '#6f8cff', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
    rune.position.y = 0.02;
    return { top, skirt, rune };
  }, [R]);
  useFrame(({ clock }) => { (rune.material as MeshBasicMaterial).opacity = 0.25 + Math.sin(clock.elapsedTime * 1.4) * 0.1; });
  return (
    <>
      <primitive object={top} />
      <primitive object={skirt} />
      <primitive object={rune} />
      <Stars radius={140} depth={60} count={2500} factor={5} saturation={0} fade speed={0.4} />
    </>
  );
}

// ---------------------------------------------------------------- stations ---
function stationGeos() {
  // fountain
  const f = new GB([0.8, 1.08]);
  f.cyl(2.5, 2.7, 0.7, 12, [0, 0.35, 0], '#a9a396'); f.cyl(2.2, 2.2, 0.12, 12, [0, 0.72, 0], '#8f897c');
  f.cyl(0.45, 0.65, 1.5, 8, [0, 1.35, 0], '#b9b3a4'); f.cyl(1.25, 0.6, 0.35, 10, [0, 2.15, 0], '#a9a396'); f.cyl(0.8, 0.8, 0.1, 10, [0, 2.38, 0], '#8f897c');
  f.torus(2.45, 0.1, [0, 0.72, 0], '#c9c3b4', [Math.PI / 2, 0, 0], 1, 16);
  const fw = new GB([1, 1]);
  fw.cyl(2.05, 2.05, 0.06, 14, [0, 0.76, 0], '#38b6ff'); fw.cyl(0.75, 0.75, 0.06, 10, [0, 2.4, 0], '#7fe0ff');
  fw.cone(0.22, 1.5, 6, [0, 3.1, 0], '#9ae6ff'); fw.sph(0.2, [0.6, 2.7, 0], '#bff0ff', 1, 5); fw.sph(0.2, [-0.6, 2.7, 0.2], '#bff0ff', 1, 5);
  // merchant stall + trader
  const m = new GB([0.8, 1.08]);
  const wood = '#7a5230', dark = '#5a3a1e';
  m.box(4.2, 1.0, 1.6, [0, 0.5, 0.6], wood); m.box(4.4, 0.16, 1.9, [0, 1.05, 0.6], '#9a6c3e');
  for (const sx of [-2.0, 2.0]) m.box(0.22, 3.6, 0.22, [sx, 1.8, -0.1], dark);
  for (const sx of [-2.0, 2.0]) m.box(0.22, 2.6, 0.22, [sx, 1.3, 1.3], dark);
  m.prism(5.0, 1.2, 3.0, [0, 3.0, 0.6], '#c0392b', [0, Math.PI / 2, 0]);
  m.prism(5.02, 1.22, 0.7, [0, 3.0, -0.3], '#efe2c4', [0, Math.PI / 2, 0]); m.prism(5.02, 1.22, 0.7, [0, 3.0, 1.5], '#efe2c4', [0, Math.PI / 2, 0]);
  m.box(1.0, 0.8, 0.8, [-1.5, 1.5, 0.7], '#a8733a'); m.box(0.8, 0.5, 0.7, [-0.4, 1.35, 0.7], '#c9a35f'); m.sph(0.35, [0.6, 1.4, 0.7], '#d94a3a', 1, 6); m.sph(0.3, [1.3, 1.38, 0.75], '#e8c04a', 1, 6);
  m.cyl(0.6, 0.6, 1.2, 8, [-3.0, 0.6, 0.6], wood); m.box(1.1, 0.9, 1.1, [3.0, 0.45, 0.5], '#a8733a');
  // trader behind the counter
  m.cyl(0.5, 0.65, 1.5, 8, [0, 1.0, -0.6], '#3e5a8a'); m.sph(0.36, [0, 2.0, -0.6], '#e0b08a', 1, 7); m.cone(0.55, 0.6, 8, [0, 2.45, -0.6], '#6a4a2a');
  const ml = new GB([1, 1]);
  ml.sph(0.18, [-2.0, 3.5, 1.6], '#ffd88a', 1, 6); ml.sph(0.18, [2.0, 3.5, 1.6], '#ffd88a', 1, 6);
  // chest
  const cb = new GB([0.8, 1.08]);
  cb.box(2.0, 0.9, 1.3, [0, 0.45, 0], '#7a4a24'); cb.box(2.1, 0.14, 1.4, [0, 0.2, 0], '#d4a63a'); cb.box(2.1, 0.14, 1.4, [0, 0.75, 0], '#d4a63a');
  cb.box(0.2, 0.95, 1.4, [-0.7, 0.45, 0], '#d4a63a'); cb.box(0.2, 0.95, 1.4, [0.7, 0.45, 0], '#d4a63a');
  const cl = new GB([0.8, 1.08]);
  cl.cyl(0.65, 0.65, 2.0, 10, [0, 0, 0], '#8a5a2c', [0, 0, Math.PI / 2], [1, 1, 1], undefined);
  cl.box(0.2, 1.3, 1.4, [-0.7, 0, 0], '#d4a63a'); cl.box(0.2, 1.3, 1.4, [0.7, 0, 0], '#d4a63a');
  const cg = new GB([1, 1]);
  cg.box(0.35, 0.4, 0.2, [0, 0.8, 0.7], '#ffe08a'); cg.sph(0.3, [0, 1.35, 0], '#ffd24a', [2.4, 0.3, 1.6], 6);
  // altar
  const a = new GB([0.8, 1.08]);
  a.cyl(1.6, 1.9, 0.5, 8, [0, 0.25, 0], '#6d6a78'); a.cyl(1.1, 1.3, 0.5, 8, [0, 0.75, 0], '#807d8c'); a.box(1.0, 1.3, 1.0, [0, 1.65, 0], '#8e8a9c');
  a.box(0.4, 1.9, 0.4, [-1.7, 1.0, 0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [1.7, 1.0, 0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [-1.7, 1.0, -0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [1.7, 1.0, -0.8], '#6d6a78');
  const ag = new GB([1, 1]);
  ag.octa(0.55, [0, 3.0, 0], '#c084fc', [0.8, 1.3, 0.8]); ag.torus(1.0, 0.07, [0, 2.3, 0], '#e0b8ff', [Math.PI / 2, 0, 0], 1, 16);
  ag.box(0.5, 0.06, 0.5, [0, 2.32, 0], '#e0b8ff', [0, 0.78, 0]);
  return {
    fountain: f.build(), fountainWater: fw.build(), stall: m.build(), stallLamps: ml.build(), chest: cb.build(), chestLid: cl.build(), chestGlow: cg.build(), altar: a.build(), altarGlow: ag.build(),
  };
}

/** Camp room props: tent + campfire in the middle, storage (crates + chest) on the left, training post (dummy + rack) right. */
function CampProps() {
  const geos = useMemo(() => {
    const b = new GB([0.75, 1.08]), g = new GB([1, 1]);
    // tent behind the fire
    b.cone(2.6, 3.2, 4, [0, 1.6, -3.2], '#c9a070', [0, Math.PI / 4, 0]); b.box(1.1, 1.6, 0.1, [0, 0.8, -1.4], '#5a3a1e');
    // campfire
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box(0.9, 0.18, 0.2, [Math.cos(a) * 0.35, 0.1, 1 + Math.sin(a) * 0.35], '#5a3a1e', [0, -a, 0.25]); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.ico(0.22, [Math.cos(a) * 0.85, 0.1, 1 + Math.sin(a) * 0.85], '#7a766e', [1, 0.6, 1], 0); }
    g.cone(0.4, 1.0, 6, [0, 0.6, 1], '#ffb040'); g.cone(0.22, 0.7, 5, [0.05, 0.55, 1.05], '#fff0a0');
    // storage (left): crate stack + chest
    const s = new GB([0.75, 1.08]);
    s.box(1.1, 1.1, 1.1, [0, 0.55, 0], '#8a6a44'); s.box(1.0, 1.0, 1.0, [1.15, 0.5, 0.2], '#7a5a38'); s.box(0.9, 0.9, 0.9, [0.5, 1.55, 0.1], '#9a7a50');
    s.box(1.4, 0.7, 0.9, [-1.1, 0.35, 0.9], '#6a4a2a'); s.box(1.45, 0.25, 0.95, [-1.1, 0.82, 0.9], '#8a6a3a'); s.box(0.2, 0.25, 0.1, [-1.1, 0.55, 1.36], '#e9b949');
    // training post (right): dummy + weapon rack
    const t = new GB([0.75, 1.08]);
    t.cyl(0.1, 0.1, 1.9, 6, [0, 0.95, 0], '#6a4a2a'); t.cyl(0.42, 0.36, 0.9, 8, [0, 1.25, 0], '#d9c08a'); t.sph(0.3, [0, 2.0, 0], '#d9c08a', 1, 7); t.box(1.5, 0.14, 0.14, [0, 1.5, 0], '#6a4a2a');
    t.box(0.12, 1.6, 0.12, [1.4, 0.8, -0.4], '#5a3a1e'); t.box(0.12, 1.6, 0.12, [2.6, 0.8, -0.4], '#5a3a1e'); t.box(1.4, 0.12, 0.12, [2.0, 1.4, -0.4], '#5a3a1e');
    for (let i = 0; i < 3; i++) t.box(0.08, 1.4, 0.08, [1.6 + i * 0.4, 0.75, -0.25], '#c4cad4', [0.25, 0, 0]);
    return { base: b.build(), fire: g.build(), storage: s.build(), train: t.build() };
  }, []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.4, 1.0) }) }), []);
  const root = useRef<Group>(null!), fire = useRef<Mesh>(null!), st = useRef<Group>(null!), tr = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const on = world.room.active && world.room.plan.type === 'CAMP';
    if (root.current) root.current.visible = on;
    if (!on) return;
    root.current.position.set(campPos.fire[0], 0, campPos.fire[1] - 1);
    st.current.position.set(campPos.storage[0] - campPos.fire[0], 0, 0);
    tr.current.position.set(campPos.trainer[0] - campPos.fire[0], 0, 0);
    const k = 1 + Math.sin(clock.elapsedTime * 13) * 0.08 + Math.sin(clock.elapsedTime * 7.3) * 0.06;
    fire.current.scale.set(k, k * 1.1, k);
  });
  return (
    <group ref={root} visible={false}>
      <mesh geometry={geos.base} material={mats.lit} castShadow receiveShadow />
      <mesh ref={fire} geometry={geos.fire} material={mats.glow} position={[0, 0, 0]} />
      <pointLight position={[0, 1.4, 1]} color="#ffa040" intensity={8} distance={10} decay={1.6} />
      <group ref={st}><mesh geometry={geos.storage} material={mats.lit} castShadow receiveShadow /></group>
      <group ref={tr}><mesh geometry={geos.train} material={mats.lit} castShadow receiveShadow /></group>
    </group>
  );
}

function Stations() {
  const geos = useMemo(stationGeos, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.5, 1.5), transparent: true, opacity: 0.92 }),
  }), []);
  const root = useRef<Group>(null!);
  const fount = useRef<Group>(null!), stall = useRef<Group>(null!), chest = useRef<Group>(null!), altar = useRef<Group>(null!);
  const lid = useRef<Group>(null!), water = useRef<Mesh>(null!), chestGlow = useRef<Mesh>(null!), altarGlow = useRef<Mesh>(null!);
  const lidT = useRef(0);
  useFrame(({ clock }, dt) => {
    const s = world.room.station, t = clock.elapsedTime;
    const on = world.room.active;
    fount.current.visible = on && s.kind === 'FOUNTAIN';
    stall.current.visible = on && s.kind === 'MERCHANT';
    chest.current.visible = on && s.kind === 'CHEST';
    altar.current.visible = on && s.kind === 'ALTAR';
    root.current.position.set(s.x, 0, s.z);
    if (fount.current.visible) {
      water.current.position.y = Math.sin(t * 2.2) * 0.04;
      const k = s.used ? 0.25 : 1;
      mats.glow.color.setScalar(1.5 * k + 0.2 * Math.sin(t * 3) * k);
      water.current.scale.y = s.used ? 0.2 : 1 + Math.sin(t * 5) * 0.08;
    } else if (chest.current.visible) {
      lidT.current += ((s.used ? 1 : 0) - lidT.current) * Math.min(1, dt * 6);
      lid.current.rotation.x = -lidT.current * 1.25;
      chestGlow.current.visible = s.ready && !s.used;
      chestGlow.current.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    } else if (altar.current.visible) {
      altarGlow.current.position.y = Math.sin(t * 1.7) * 0.15;
      altarGlow.current.rotation.y = t * 0.8;
      altarGlow.current.visible = !s.used || world.room.shrineOn;
    }
  });
  return (
    <group ref={root}>
      <group ref={fount}>
        <mesh geometry={geos.fountain} material={mats.lit} castShadow receiveShadow />
        <mesh ref={water} geometry={geos.fountainWater} material={mats.glow} />
      </group>
      <group ref={stall} rotation={[0, 0, 0]}>
        <mesh geometry={geos.stall} material={mats.lit} castShadow receiveShadow />
        <mesh geometry={geos.stallLamps} material={mats.glow} />
      </group>
      <group ref={chest}>
        <mesh geometry={geos.chest} material={mats.lit} castShadow receiveShadow />
        <group ref={lid} position={[0, 0.9, -0.65]}><mesh geometry={geos.chestLid} material={mats.lit} position={[0, 0, 0.65]} castShadow /></group>
        <mesh ref={chestGlow} geometry={geos.chestGlow} material={mats.glow} />
      </group>
      <group ref={altar}>
        <mesh geometry={geos.altar} material={mats.lit} castShadow receiveShadow />
        <mesh ref={altarGlow} geometry={geos.altarGlow} material={mats.glow} />
      </group>
    </group>
  );
}

// ----------------------------------------------------------------- portals ---
const ICONS: Record<string, React.ReactNode> = {
  card: <Sparkles size={18} />, coins: <Coins size={18} />, shard: <Diamond size={18} />, gear: <Sword size={18} />, heart: <Heart size={18} />,
  gem: <Gem size={18} />, fountain: <Droplets size={18} />, merchant: <Store size={18} />, chest: <Package size={18} />, shrine: <Flame size={18} />, boss: <Skull size={18} />,
};
const TYPE_I: Record<string, number> = { COMBAT: 1, ELITE: 2, MINIBOSS: 3, FOUNTAIN: 4, MERCHANT: 5, TREASURE: 6, SHRINE: 7, CRYSTAL: 6, BOSS: 8, CAMP: 9, DUEL: 10, GATEKEEPER: 11 };
const REW_I: Record<string, number> = { NONE: 0, CARD: 1, GOLD: 2, SHARDS: 3, ITEM: 4, HEAL: 5, GEMS: 6 };

function PortalLabel({ i }: { i: number }) {
  const sig = useWorldCounter(() => { const p = world.room.portals[i]; return p.active ? TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + 1000 * world.room.version + (p.big ? 500 : 0) : 0; });
  if (!sig) return null;
  const p = world.room.portals[i];
  const nb = BIOMES[(world.room.biome + 1) % BIOMES.length];
  const l = p.big ? { title: 'Next biome', sub: nb.name, icon: 'boss', color: '#f2c14e' } : portalLabel(p.plan, world.room.biome);
  return (
    <Html position={[0, 3.9, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="portal-tag" style={{ ['--pc' as any]: l.color }} data-testid={`portal-${i}`}>
        <span className="pi">{ICONS[l.icon]}</span>
        <span className="pt">{l.title}<small>{l.sub}</small></span>
      </div>
    </Html>
  );
}

function Portals() {
  const geos = useMemo(() => ({
    ring: (() => { const g = new GB([1, 1]); g.torus(1.55, 0.14, [0, 1.9, 0], '#ffffff', [0, 0, 0], [0.8, 1.15, 1], 28); return g.build(); })(),
    disc: new CircleGeometry(1.45, 28),
    floor: new RingGeometry(1.2, 2.2, 28).rotateX(-Math.PI / 2),
    pillar: (() => { const g = new GB([0.8, 1.1]); for (const s of [-1, 1]) { g.box(0.5, 2.4, 0.5, [s * 1.9, 1.2, 0], '#7d7a88'); g.box(0.7, 0.3, 0.7, [s * 1.9, 2.55, 0], '#9a97a8'); g.box(0.8, 0.3, 0.8, [s * 1.9, 0.15, 0], '#6a6776'); } return g.build(); })(),
  }), []);
  const groups = useRef<(Group | null)[]>([]);
  const ringMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, color: new Color(), vertexColors: true })), []);
  const discMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, color: new Color() })), []);
  const floorMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, color: new Color() })), []);
  const lit = useMemo(() => litMat({ roughness: 0.9 }), []);
  const last = useRef<number[]>([-1, -1, -1]);
  const discs = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < 3; i++) {
      const g = groups.current[i]; if (!g) continue;
      const p = world.room.portals[i];
      g.visible = p.active;
      if (!p.active) { last.current[i] = -1; continue; }
      g.position.set(p.x, 0, p.z);
      const k = Math.min(1, p.t * (p.big ? 0.8 : 1.6)), grow = (1 - (1 - k) * (1 - k)) * (p.big ? 2.1 : 1);
      g.scale.set(grow, grow, grow);
      const key = TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + (p.big ? 500 : 0);
      if (key !== last.current[i]) {
        last.current[i] = key;
        const c = p.big ? '#f2c14e' : portalLabel(p.plan, world.room.biome).color;
        ringMats[i].color.set(c).multiplyScalar(1.8); discMats[i].color.set(c); floorMats[i].color.set(c);
      }
      const d = discs.current[i];
      if (d) { d.rotation.z = t * 0.6 + i; d.scale.setScalar(0.95 + Math.sin(t * 3 + i) * 0.05); }
      floorMats[i].opacity = 0.4 + Math.sin(t * 3 + i) * 0.15;
    }
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <mesh geometry={geos.pillar} material={lit} castShadow />
          <mesh geometry={geos.ring} material={ringMats[i]} />
          <mesh ref={(m) => { discs.current[i] = m; }} geometry={geos.disc} material={discMats[i]} position={[0, 1.9, 0]} scale={[0.8, 1.15, 1]} renderOrder={4} />
          <mesh geometry={geos.floor} material={floorMats[i]} position={[0, 0.05, 0]} renderOrder={3} />
          <PortalLabel i={i} />
        </group>
      ))}
    </>
  );
}


/** Small arrows around the hero pointing at exit portals that are off-screen. */
function PortalGuides() {
  const geo = useMemo(() => new ConeGeometry(0.55, 1.5, 3).rotateX(Math.PI / 2), []);
  const mats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, color: new Color() })), []);
  const refs = useRef<(Mesh | null)[]>([]);
  const keys = useRef([-1, -1, -1]);
  useFrame(({ clock }) => {
    const r = world.room, p = world.player.pos;
    for (let i = 0; i < 3; i++) {
      const m = refs.current[i]; if (!m) continue;
      const po = r.portals[i];
      const dx = po.x - p.x, dz = po.z - p.z, d = Math.hypot(dx, dz);
      m.visible = po.active && d > 15 && r.fade < 0.5;
      if (!m.visible) continue;
      const k = 4.2 + Math.sin(clock.elapsedTime * 5 + i) * 0.25;
      m.position.set(p.x + (dx / d) * k, 0.25, p.z + (dz / d) * k);
      m.rotation.y = Math.atan2(dx, dz);
      const key = TYPE_I[po.plan.type] * 10 + REW_I[po.plan.reward];
      if (key !== keys.current[i]) { keys.current[i] = key; mats[i].color.set(portalLabel(po.plan, r.biome).color); }
    }
  });
  return <>{[0, 1, 2].map((i) => <mesh key={i} ref={(m) => { refs.current[i] = m; }} geometry={geo} material={mats[i]} visible={false} renderOrder={5} />)}</>;
}

// ----------------------------------------------------------- spawn markers ---
function SpawnMarkers() {
  const MAX = world.room.markers.length;
  const { fill, ring, mf, mr } = useMemo(() => {
    const mkMat = (o: number) => new MeshBasicMaterial({ transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, });
    const mf = mkMat(0.42), mr = mkMat(0.95);
    const fill = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), mf, MAX);
    const ring = new InstancedMesh(new RingGeometry(0.86, 1, 24).rotateX(-Math.PI / 2), mr, MAX);
    for (const m of [fill, ring]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = 3; m.count = 0; }
    return { fill, ring, mf, mr };
  }, [MAX]);
  const o = useMemo(() => new Object3D(), []);
  const c1 = useMemo(() => new Color('#ff2e22'), []), c2 = useMemo(() => new Color('#b04dff'), []), c3 = useMemo(() => new Color('#ff8a00'), []), cc = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const ms = world.room.markers;
    let n = 0;
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 14) * 0.1;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (!m.active) continue;
      const base = m.tag === 2 ? 4.2 : m.tag === 1 ? 2.4 : Math.max(0.9, ENEMY_DEFS[m.kind].radius * (m.elite ? 1.9 : 1.35));
      const k = Math.min(1, m.t / m.dur);
      o.position.set(m.x, 0.06, m.z); o.rotation.set(0, 0, 0);
      o.scale.set(base * (0.25 + 0.75 * k), 1, base * (0.25 + 0.75 * k));
      o.updateMatrix(); fill.setMatrixAt(n, o.matrix);
      o.scale.set(base * pulse, 1, base * pulse);
      o.updateMatrix(); ring.setMatrixAt(n, o.matrix);
      cc.copy(m.tag > 0 ? c3 : m.elite ? c2 : c1);
      fill.setColorAt(n, cc); ring.setColorAt(n, cc);
      n++;
    }
    fill.count = ring.count = n;
    fill.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
  });
  void mf; void mr;
  return (<><primitive object={fill} /><primitive object={ring} /></>);
}

// -------------------------------------------------------------------- room ---
export function Room({ q }: { q: QualityCfg }) {
  const ver = useWorldCounter(() => world.room.version);
  const r = world.room;
  const def = biomeOf(r.biome);
  const tower = runInfo.mode === 'TOWER';
  return (
    <>
      {r.active && (tower ? <TowerFloor key={ver} R={r.radius} /> : <RoomGround key={ver} biome={r.biome} R={r.radius} seed={r.seed} boss={r.plan.type === 'BOSS'} />)}
      <Suspense fallback={null}><Props q={q} tint={tower ? '#c4c8d6' : def.propTint} /></Suspense>
      <Stations />
      <CampProps />
      <SpecialRooms q={q} />
      <Portals />
      <PortalGuides />
      <SpawnMarkers />
    </>
  );
}
