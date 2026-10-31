// The Endless Tower's Haunted Hollow (owner 2026-10-31): graves, broken pillars + fences, a broken cart, bone / skull piles (static, merged geometry, one Inst per kind: chunked, frustum + draw-distance
// culled), ghost-light wisps (one Points draw), low mist patches (one instanced mesh), a few crows (one instanced mesh) and the tower's eerie violet / teal night glow. Layout = engine/townFill GLOOM
// (positions, solids); ground tint = Terrain GLOOM region; dead trees = natureLayout (gloomK); darker ambient = biomeLook (gloomFx). Cute-spooky: round soft stones, big-eyed skulls, lavender mist.
// Perf: the animated bits (wisps / mist / crows) only run while the hero is within ~95 m of the tower; nothing allocates per frame (module scratch + preallocated buffers).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, InstancedMesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, PointLight, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { TOWER } from '../engine/townData';
import { GLOOM, type GloomItem } from '../engine/townFill';
import { world } from '../engine/world';
import { townFx, gloomFx } from './biomeLook';
import { GB, litMat, mulberry32, setInst, TAU } from './util';
import { groundAt } from './natureLayout';
import { Inst } from './Inst';
import type { QualityCfg } from './quality';

const STONE = '#aaa5bc', STONE2 = '#c6c1d4', MOSS = '#6f9460', SOIL = '#5d4b52', WOOD = '#8a6c58', WOOD2 = '#6d5446', BONE = '#f0e6cf', DARK = '#2c2535';

// ---------------------------------------------------------------- geometry (front = +z, fences / fallen columns run along x)
function graveGeo(k: number): BufferGeometry {
  const b = new GB([0.88, 1.06]);
  if (k === 0) { b.box(0.95, 1.0, 0.28, [0, 0.5, 0], STONE); b.cyl(0.475, 0.475, 0.28, 12, [0, 1.0, 0], STONE, [Math.PI / 2, 0, 0]); b.box(0.12, 0.36, 0.05, [0, 0.82, 0.16], STONE2); b.box(0.3, 0.1, 0.05, [0, 0.9, 0.16], STONE2); }
  else if (k === 1) { b.box(0.22, 1.35, 0.22, [0, 0.68, 0], STONE2); b.box(0.86, 0.22, 0.22, [0, 1.0, 0], STONE2); b.box(0.5, 0.14, 0.5, [0, 0.07, 0], STONE); }
  else if (k === 2) { b.box(0.85, 0.7, 0.3, [0, 0.35, 0], STONE); b.sph(0.43, [0, 0.72, 0], STONE, [1, 0.95, 0.36], 10); b.sph(0.13, [0, 0.55, 0.16], DARK, [1, 1.4, 0.4], 6); b.sph(0.13, [0.0, 0.84, 0.16], DARK, [0.8, 0.8, 0.4], 6); }
  else if (k === 3) { b.box(0.95, 0.55, 0.28, [0, 0.28, 0], STONE); b.box(0.5, 0.34, 0.28, [0.7, 0.14, 0.5], STONE, [0.15, 0.6, 0.35]); b.sph(0.2, [-0.2, 0.55, 0.05], MOSS, [1.4, 0.35, 1], 5); }
  else { b.box(0.8, 0.28, 0.8, [0, 0.14, 0], STONE); b.cyl(0.26, 0.38, 1.7, 6, [0, 1.1, 0], STONE2); b.sph(0.3, [0, 2.0, 0], STONE2, [1, 1.2, 1], 8); b.sph(0.16, [0.2, 0.35, 0.3], MOSS, [1.4, 0.4, 1], 5); }
  if (k !== 3 && k !== 4) b.sph(0.2, [0.28, 0.9 - (k === 1 ? 0.1 : 0.35), 0.05], MOSS, [1.2, 0.35, 1], 5);
  b.sph(0.5, [0, 0.1, 0.9], SOIL, [1, 0.35, 1.5], 7);   // the mound in front
  return b.build();
}
function pillarGeo(k: number): BufferGeometry {
  const b = new GB([0.86, 1.06]);
  if (k === 0) { b.box(1.6, 0.3, 1.6, [0, 0.15, 0], STONE); b.cyl(0.55, 0.62, 3.0, 10, [0, 1.8, 0], STONE2); b.cyl(0.46, 0.56, 0.5, 8, [0.06, 3.5, 0], STONE2, [0.28, 0, 0.22]); b.cone(0.3, 0.5, 5, [0.1, 3.9, 0], STONE2, [0.2, 0, 0.3]); b.sph(0.4, [0.35, 1.0, 0.45], MOSS, [1.2, 0.6, 1], 6); b.box(0.9, 0.5, 0.8, [1.35, 0.25, 0.7], STONE, [0.1, 0.5, 0.2]); }
  else if (k === 1) { b.box(1.5, 0.28, 1.5, [0, 0.14, 0], STONE); b.cyl(0.55, 0.62, 1.1, 10, [0, 0.8, 0], STONE2); b.cyl(0.42, 0.52, 0.3, 8, [0.05, 1.45, 0], STONE2, [0.3, 0, -0.25]); b.sph(0.35, [-0.3, 0.9, 0.4], MOSS, [1.2, 0.6, 1], 6); }
  else { b.cyl(0.52, 0.52, 2.8, 10, [0, 0.52, 0], STONE2, [0, 0, Math.PI / 2]); b.cyl(0.5, 0.5, 0.9, 10, [2.1, 0.45, 0.4], STONE2, [0, 0.3, Math.PI / 2]); b.box(0.9, 0.5, 0.9, [-1.8, 0.25, 0.3], STONE, [0.1, 0.4, 0.15]); b.sph(0.4, [0.4, 0.95, 0], MOSS, [1.4, 0.4, 1], 6); }
  return b.build();
}
function fenceGeo(k: number): BufferGeometry {
  const b = new GB([0.86, 1.06]);
  if (k === 0) { for (const x of [-0.95, 0, 0.95]) { b.box(0.15, 1.05, 0.15, [x, 0.52, 0], WOOD2); b.cone(0.11, 0.2, 4, [x, 1.12, 0], WOOD2); } b.box(2.1, 0.11, 0.07, [0, 0.38, 0.1], WOOD); b.box(2.1, 0.11, 0.07, [0, 0.76, 0.1], WOOD); }
  else { b.box(0.15, 1.0, 0.15, [-0.95, 0.5, 0], WOOD2, [0, 0, 0.12]); b.box(0.15, 0.55, 0.15, [0.1, 0.27, 0.05], WOOD2, [0.1, 0, -0.2]); b.box(1.1, 0.11, 0.07, [-0.45, 0.4, 0.1], WOOD, [0, 0, 0.1]); b.box(1.0, 0.11, 0.07, [0.45, 0.18, 0.55], WOOD, [0.1, 0.3, 0.05]); b.box(0.9, 0.1, 0.07, [0.7, 0.07, -0.4], WOOD2, [0, 0.5, 0.0]); }
  return b.build();
}
function cartGeo(): BufferGeometry {
  const b = new GB([0.86, 1.06]);
  b.box(2.2, 0.2, 1.3, [0, 0.68, 0], WOOD, [0, 0, 0.16]);
  b.box(2.2, 0.5, 0.1, [0, 1.0, 0.62], WOOD2, [0, 0, 0.16]); b.box(2.2, 0.5, 0.1, [0, 1.0, -0.62], WOOD2, [0, 0, 0.16]); b.box(0.1, 0.5, 1.3, [-1.05, 1.0, 0], WOOD2, [0, 0, 0.16]);
  b.cyl(0.52, 0.52, 0.12, 12, [0.0, 0.52, 0.78], WOOD2, [Math.PI / 2, 0, 0]); b.cyl(0.08, 0.08, 0.2, 6, [0.0, 0.52, 0.78], DARK, [Math.PI / 2, 0, 0]);
  b.cyl(0.52, 0.52, 0.12, 12, [1.6, 0.08, -1.0], WOOD2, [0.12, 0.5, 0.05]);   // the other wheel lies in the grass
  b.cyl(0.06, 0.06, 1.8, 5, [1.95, 0.45, 0.2], WOOD, [0, 0, 1.3]); b.cyl(0.06, 0.06, 1.6, 5, [1.9, 0.12, -0.35], WOOD, [0, 0, 1.45]);
  b.sph(0.35, [-0.4, 1.1, 0], MOSS, [1.8, 0.4, 1.2], 5);
  return b.build();
}
function bonesGeo(k: number): BufferGeometry {
  const b = new GB([0.9, 1.05]);
  const bone = (x: number, z: number, ry: number, l: number): void => { b.cyl(0.045, 0.045, l, 5, [x, 0.07, z], BONE, [0, ry, Math.PI / 2]); b.sph(0.075, [x + Math.cos(ry) * l / 2, 0.08, z - Math.sin(ry) * l / 2], BONE, 1, 5); b.sph(0.075, [x - Math.cos(ry) * l / 2, 0.08, z + Math.sin(ry) * l / 2], BONE, 1, 5); };
  const skull = (x: number, y: number, z: number, ry: number, s: number): void => {
    b.sph(0.2 * s, [x, y + 0.2 * s, z], BONE, [1, 0.92, 1.05], 8, [0, ry, 0]);
    b.box(0.2 * s, 0.1 * s, 0.2 * s, [x + Math.sin(ry) * 0.08 * s, y + 0.07 * s, z + Math.cos(ry) * 0.08 * s], BONE, [0, ry, 0]);
    for (const e of [-1, 1]) b.sph(0.058 * s, [x + Math.sin(ry) * 0.17 * s + Math.cos(ry) * e * 0.085 * s, y + 0.22 * s, z + Math.cos(ry) * 0.17 * s - Math.sin(ry) * e * 0.085 * s], DARK, 1, 6);
  };
  if (k === 0) { bone(0, 0, 0.3, 0.7); bone(0.1, 0.15, 1.7, 0.6); bone(-0.2, -0.1, 2.6, 0.55); b.torus(0.28, 0.035, [0.4, 0.2, 0.3], BONE, [Math.PI / 2, 0.2, 0], [1, 0.8, 1], 6, Math.PI); b.torus(0.24, 0.032, [0.4, 0.2, 0.5], BONE, [Math.PI / 2, 0.2, 0], [1, 0.8, 1], 6, Math.PI); skull(-0.55, 0, 0.2, 0.6, 0.9); }
  else { skull(0, 0, 0, 0.3, 1); skull(0.42, 0, 0.12, -0.5, 0.9); skull(0.1, 0, 0.45, 1.2, 0.95); skull(0.22, 0.34, 0.2, 2.0, 0.85); bone(-0.45, 0.35, 0.9, 0.6); bone(0.8, 0.5, 2.2, 0.5); }
  return b.build();
}
function crowGeo(): BufferGeometry {
  const b = new GB([0.85, 1.1]);
  b.sph(0.2, [0, 0.2, 0], DARK, [1, 0.85, 1.7], 7); b.sph(0.13, [0, 0.33, 0.3], DARK, 1, 6); b.cone(0.05, 0.16, 4, [0, 0.32, 0.46], '#e8a24a', [Math.PI / 2, 0, 0]);
  b.sph(0.03, [0.06, 0.36, 0.38], '#fff6d8', 1, 4); b.sph(0.03, [-0.06, 0.36, 0.38], '#fff6d8', 1, 4);
  b.box(0.5, 0.04, 0.26, [0.34, 0.26, -0.02], DARK, [0, -0.25, 0.25]); b.box(0.5, 0.04, 0.26, [-0.34, 0.26, -0.02], DARK, [0, 0.25, -0.25]);   // wings (flapped by scaling the instance)
  b.box(0.14, 0.03, 0.3, [0, 0.2, -0.38], DARK, [-0.2, 0, 0]);
  return b.build();
}
let radialTex: CanvasTexture | null = null;
function radial(): CanvasTexture {
  if (radialTex) return radialTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  radialTex = new CanvasTexture(cv); radialTex.colorSpace = SRGBColorSpace; return radialTex;
}

// ---------------------------------------------------------------- static kinds (one Inst each)
function Kind({ items, geo, mat, scaleY = true }: { items: GloomItem[]; geo: BufferGeometry; mat: MeshBasicMaterial | ReturnType<typeof litMat>; scaleY?: boolean }) {
  const fill = useMemo(() => (m: InstancedMesh) => {
    items.forEach((it, i) => { const s = it.s; setInst(m, i, it.x, groundAt(it.x, it.z) - 0.04, it.z, it.ry, s, scaleY ? s : 1, s); });
    m.count = items.length;
  }, [items, scaleY]);
  if (items.length === 0) return null;
  return <Inst geo={geo} mat={mat} count={items.length} fill={fill} cast receive />;
}

const T0 = TOWER, FAR2 = 95 * 95;
const near = (): boolean => { const p = world.player.pos; return (p.x - T0.x) ** 2 + (p.z - T0.z) ** 2 < FAR2; };

export function GloomTower({ q }: { q: QualityCfg }) {
  const stone = useMemo(() => litMat({ roughness: 0.92 }), []);
  const graves = useMemo(() => [0, 1, 2, 3, 4].map((k) => ({ k, geo: graveGeo(k), items: GLOOM.graves.filter((g) => g.k === k) })), []);
  const pillars = useMemo(() => [0, 1, 2].map((k) => ({ k, geo: pillarGeo(k), items: GLOOM.pillars.filter((g) => g.k === k) })), []);
  const fences = useMemo(() => [0, 1].map((k) => ({ k, geo: fenceGeo(k), items: GLOOM.fences.filter((g) => g.k === k) })), []);
  const bones = useMemo(() => [0, 1].map((k) => ({ k, geo: bonesGeo(k), items: GLOOM.bones.filter((g) => g.k === k) })), []);
  const cart = useMemo(() => cartGeo(), []);
  useEffect(() => () => { for (const l of [graves, pillars, fences, bones]) for (const e of l) e.geo.dispose(); cart.dispose(); stone.dispose(); }, [graves, pillars, fences, bones, cart, stone]);
  return (
    <>
      {graves.map((e) => <Kind key={'g' + e.k} items={e.items} geo={e.geo} mat={stone} />)}
      {pillars.map((e) => <Kind key={'p' + e.k} items={e.items} geo={e.geo} mat={stone} />)}
      {fences.map((e) => <Kind key={'f' + e.k} items={e.items} geo={e.geo} mat={stone} scaleY={false} />)}
      {bones.map((e) => <Kind key={'b' + e.k} items={e.items} geo={e.geo} mat={stone} />)}
      <Kind items={GLOOM.carts} geo={cart} mat={stone} />
      <Wisps q={q} />
      <Mist q={q} />
      <Crows q={q} />
      <TowerAura q={q} />
    </>
  );
}

// ---------------------------------------------------------------- ghost lights: one Points draw, teal + violet motes bobbing over the graves
function Wisps({ q }: { q: QualityCfg }) {
  const n = q.fxScale >= 0.7 ? GLOOM.wisps.length : q.fxScale >= 0.5 ? 14 : 8;
  const pts = useRef<Points>(null!);
  const { geo, mat } = useMemo(() => {
    const geo = new BufferGeometry(), col = new Float32Array(n * 3), teal = new Color('#7ff5e0'), vio = new Color('#c59bff');
    for (let i = 0; i < n; i++) { const c = i % 3 === 0 ? vio : teal; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new BufferAttribute(col, 3));
    const mat = new PointsMaterial({ map: radial(), size: 1.5, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
    return { geo, mat };
  }, [n]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(({ clock }) => {
    const p = pts.current; if (!p) return;
    p.visible = near(); if (!p.visible) return;
    mat.opacity = 0.42 + 0.5 * townFx.lamp;   // faint by day, glowing at night
    const t = clock.elapsedTime, a = geo.attributes.position.array as Float32Array, W = GLOOM.wisps;
    for (let i = 0; i < n; i++) {
      const w = W[i], ph = w[3] + t * 0.5;
      a[i * 3] = w[0] + Math.sin(ph) * 1.3; a[i * 3 + 1] = groundAt(w[0], w[2]) + w[1] + Math.sin(ph * 1.7 + i) * 0.35; a[i * 3 + 2] = w[2] + Math.cos(ph * 0.8) * 1.3;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}

// ---------------------------------------------------------------- low mist: flat soft discs hugging the ground, drifting slowly (one instanced draw, no depth write)
function Mist({ q }: { q: QualityCfg }) {
  const n = q.fxScale >= 0.5 ? GLOOM.mist.length : 7;
  const ref = useRef<InstancedMesh>(null!);
  const { geo, mat, ph } = useMemo(() => {
    const geo = new PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({ map: radial(), color: new Color('#d9cdf0'), transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide });
    const r = mulberry32(5), ph = Array.from({ length: n }, () => r() * TAU);
    return { geo, mat, ph };
  }, [n]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(({ clock }) => {
    const m = ref.current; if (!m) return;
    m.visible = near() && gloomFx.k > 0.02; if (!m.visible) return;
    const t = clock.elapsedTime, M = GLOOM.mist;
    mat.opacity = 0.24 + 0.1 * townFx.lamp;
    for (let i = 0; i < n; i++) {
      const c = M[i], a = ph[i] + t * 0.07, x = c[0] + Math.sin(a) * 2.4, z = c[1] + Math.cos(a * 0.8) * 2.0;
      setInst(m, i, x, groundAt(x, z) + 0.3 + 0.06 * Math.sin(t * 0.6 + i), z, a, c[2] * (1 + 0.06 * Math.sin(t * 0.4 + i * 2)), 1, c[2] * 0.8);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, n]} frustumCulled={false} renderOrder={4} />;
}

// ---------------------------------------------------------------- crows: 4 circle over the tower (wings flap by squashing the instance), 6 perch on stones / pillars / the cart
const FLY = 4;
function Crows({ q }: { q: QualityCfg }) {
  const perch = useMemo(() => {
    const out: [number, number, number, number][] = [], r = mulberry32(77);
    const add = (it: GloomItem | undefined, h: number): void => { if (it) out.push([it.x, groundAt(it.x, it.z) + h * it.s, it.z, r() * TAU]); };
    add(GLOOM.pillars.find((p) => p.k === 0), 3.95); add(GLOOM.graves.find((g) => g.k === 4), 2.25); add(GLOOM.graves.filter((g) => g.k === 1)[1], 1.35); add(GLOOM.graves.filter((g) => g.k === 0)[2], 1.45);
    add(GLOOM.carts[0], 1.3); add(GLOOM.graves.filter((g) => g.k === 4)[1], 2.25);
    return out;
  }, []);
  const n = q.fxScale >= 0.5 ? FLY + perch.length : 2 + Math.min(2, perch.length);
  const nf = Math.min(FLY, n), ref = useRef<InstancedMesh>(null!);
  const geo = useMemo(() => crowGeo(), []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    for (let i = nf; i < n; i++) { const p = perch[i - nf]; if (p) setInst(m, i, p[0], p[1] - 0.02, p[2], p[3], 1.3); }
    m.instanceMatrix.needsUpdate = true;
  }, [perch, n, nf]);
  useFrame(({ clock }) => {
    const m = ref.current; if (!m) return;
    m.visible = near(); if (!m.visible) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < nf; i++) {
      const R = 11 + i * 2.5, w = (i % 2 ? -1 : 1) * (0.2 - i * 0.02), a = i * 1.7 + t * w, y = groundAt(T0.x, T0.z) + 15 + i * 1.8 + Math.sin(t * 0.7 + i) * 0.8;
      setInst(m, i, T0.x + Math.cos(a) * R, y, T0.z + Math.sin(a) * R, -a + (w > 0 ? 0 : Math.PI), 1.15, 0.5 + 0.5 * Math.abs(Math.sin(t * 7 + i * 2)), 1.15, 0, Math.sin(t * 7 + i * 2) * 0.12 + (w > 0 ? 0.12 : -0.12));
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, n]} frustumCulled={false} />;
}

// ---------------------------------------------------------------- the tower's eerie glow: violet halo + teal door light, brighter at night; a flickering violet light on the front
function TowerAura({ q }: { q: QualityCfg }) {
  const halo = useRef<Sprite>(null!), doorGlow = useRef<Sprite>(null!), lA = useRef<PointLight>(null!), lB = useRef<PointLight>(null!);
  const mats = useMemo(() => ({
    halo: new SpriteMaterial({ map: radial(), color: new Color('#a56bff'), transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false }),
    door: new SpriteMaterial({ map: radial(), color: new Color('#6ff0e0'), transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false }),
  }), []);
  useEffect(() => () => { mats.halo.dispose(); mats.door.dispose(); }, [mats]);
  useFrame(({ clock }) => {
    if (!near()) { if (halo.current) halo.current.visible = false; if (doorGlow.current) doorGlow.current.visible = false; return; }
    const t = clock.elapsedTime, n = townFx.lamp, fl = 0.85 + 0.15 * Math.sin(t * 2.3) * Math.sin(t * 5.1);
    if (halo.current) { halo.current.visible = true; mats.halo.opacity = (0.12 + 0.34 * n) * fl; }
    if (doorGlow.current) { doorGlow.current.visible = true; mats.door.opacity = (0.28 + 0.4 * n) * fl; }
    if (lA.current) lA.current.intensity = (4 + 16 * n) * fl;
    if (lB.current) lB.current.intensity = (3 + 12 * n) * (1.05 - 0.2 * Math.sin(t * 3.1 + 1));
  });
  const y0 = groundAt(T0.x, T0.z);
  return (
    <group position={[T0.x, y0, T0.z]}>
      <sprite ref={halo} material={mats.halo} position={[0, 10, -1]} scale={[22, 28, 1]} renderOrder={5} />
      <sprite ref={doorGlow} material={mats.door} position={[0, 1.8, -6.4]} scale={[5.5, 5.5, 1]} renderOrder={6} />
      <pointLight ref={lA} color="#9b6dff" position={[0, 9, -2.6]} distance={26} decay={1.5} intensity={6} />
      {q.lights && <pointLight ref={lB} color="#5fe8d6" position={[1.4, 2.4, -7.2]} distance={14} decay={1.6} intensity={5} />}
    </group>
  );
}
