// The run room: biome-tinted ground disc, walls ring (via Props: the same instanced scenery path as the town), the room's
// single station (fountain / merchant / chest / altar), exit portals with reward labels and telegraphed spawn markers.
// Only the current room exists; it is rebuilt when world.room.version changes (during the black fade). No per-frame allocations.
import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, CircleGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry,
} from 'three';
import { Coins, Diamond, Droplets, Flame, Gem, Heart, Package, Skull, Sparkles, Store, Sword } from 'lucide-react';
import { world } from '../engine/world';
import { shape, shapeLimit } from '../engine/roomShape';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { BIOMES, biomeOf, portalLabel } from '../engine/roomDefs';
import { GB, fbm, litMat, mulberry32, vnoise } from './util';
import { useWorldCounter } from './hooks';
import { Props } from './Props';
import type { QualityCfg } from './quality';

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
const TYPE_I: Record<string, number> = { COMBAT: 1, ELITE: 2, MINIBOSS: 3, FOUNTAIN: 4, MERCHANT: 5, TREASURE: 6, SHRINE: 7, BOSS: 8 };
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
  return (
    <>
      {r.active && <RoomGround key={ver} biome={r.biome} R={r.radius} seed={r.seed} boss={r.plan.type === 'BOSS'} />}
      <Suspense fallback={null}><Props q={q} tint={def.propTint} /></Suspense>
      <Stations />
      <Portals />
      <PortalGuides />
      <SpawnMarkers />
    </>
  );
}
