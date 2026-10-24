import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, BufferAttribute, DataTexture, LinearFilter, RGBAFormat, Vector3,
} from 'three';
import { ARENA_RADIUS, world } from '../engine/world';
import { QualityCfg } from './quality';
import { useGameStore } from '../store';
import { isLobbyStatus } from './CameraRig';
import { GB, fbm, litMat, mulberry32, setInst, TAU, vnoise, lerp } from './util';
import { GROUND_SIZE, POND, edgeR, groundY, lakeK, inForecourtUse, inYard, pondEdge, regionAt, sstep } from './terrainFn';
import { NatureBatch } from './NatureBatch';
import { Inst } from './Inst';
import { REGIONS } from '../engine/mapgen';
import { makeWaterMaterial } from './waterFx';
import { groundDetail } from './Room';
import { applyPathShader, dirtDiscs, pathMask } from './groundPath';
import { inCaveClear } from '../engine/caveData';
import { BEACH, beachSandK, DOCK, MAIN_BEACH, mainShoreOff, beachWobble } from '../engine/beachData';
/** Keep the shoreline boulders off the pier (and a little either side of it). */
const nearDock = (x: number, z: number): boolean => x < DOCK.x0 + 4 && Math.abs(z - DOCK.z) < 7;

const wind = { uTime: { value: 0 }, uPlayer: { value: new Vector3(0, 0, 0) } };

// ------------------------------------------------------------------ ground ---
const cG = new Color(), cD = new Color(), cD2 = new Color(), cT = new Color();
const _rg = { w: 0, style: null as any, grass: 1, kind: '' };
function groundColor(x: number, z: number, y: number, out: Color) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), e = edgeR(a);
  const n1 = fbm(x * 0.03 + 20, z * 0.03, 3), n2 = fbm(x * 0.11 + 5, z * 0.11, 3), n3 = vnoise(x * 0.9, z * 0.9);
  cG.set('#4cb83a').lerp(cT.set('#86d84a'), sstep(0.3, 0.75, n2));
  cG.lerp(cT.set('#37923a'), sstep(0.52, 0.7, n1) * 0.7);
  cG.lerp(cT.set('#a8dc50'), sstep(0.42, 0.28, n1) * 0.45);
  cG.multiplyScalar(0.975 + n3 * 0.05);   // (gentle: soft colour drifts, no speckle)
  const d = 0;
  const rg = regionAt(x, z, _rg);
  if (rg.style && rg.w > 0) {
    cT.set(rg.style.color).multiplyScalar(0.9 + n3 * 0.2);
    if (rg.kind === 'CRYSTAL_GROVE') cT.lerp(cD.set('#8fe8ff'), sstep(0.65, 0.9, n2) * 0.35);
    cG.lerp(cT, rg.w * rg.style.w);
  }
  out.copy(cG).lerp(cD2.set('#b58a58').lerp(cT.set('#8d6840'), sstep(0.3, 0.7, n2)).multiplyScalar(0.92 + n3 * 0.16), d);
  // pond shore
  const pd = Math.hypot(x - POND.x, z - POND.z);
  const pe = pondEdge(Math.atan2(z - POND.z, x - POND.x));
  if (pd < pe + 3.5) {
    const sand = sstep(pe + 3.5, pe + 0.5, pd);
    out.lerp(cT.set('#c8b784'), sand * 0.85);
    out.lerp(cT.set('#6d5a3c'), sstep(pe + 0.5, pe - 1.5, pd));
  }
  // outside the playable edge: dark forest floor, rock on height
  const t = sstep(e - 4, e + 5, r);
  if (t > 0) {
    cT.set('#2a4a22').lerp(cD.set('#3e5a2a'), n2);
    out.lerp(cT, t * 0.92).multiplyScalar(lerp(1, 0.62, t));
    out.lerp(cT.set('#59606a'), sstep(3.0, 6.5, y + (n2 - 0.5) * 2) * 0.8);
    out.lerp(cT.set('#12200f'), sstep(e + 10, e + 60, r) * 0.7);
  }
  // lakeside beach: warm dry sand, darker wet sand toward the water line
  const sk = beachSandK(x, z);
  if (sk > 0) {
    cT.set('#e2cd96').lerp(cD.set('#d4ba82'), n2).multiplyScalar(0.95 + n3 * 0.08);
    const shoreX = z > MAIN_BEACH.z0 - 6 && z < MAIN_BEACH.z1 + 6 ? -49.5 - mainShoreOff(z) : BEACH.shoreX + beachWobble(z);   // (LAKE.x1; the wet band follows the wavy water line)
    cT.lerp(cD.set('#b49a6c'), sstep(shoreX + 3.5, shoreX + 0.5, x));
    out.lerp(cT, sk);
  }
  return out;
}

function detailTexture() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!; const img = ctx.createImageData(N, N);
  const rnd = mulberry32(5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tileable noise via wrapped sampling of 2 octaves
    const w = (f: number) => { const u = (x / N) * f, v = (y / N) * f; const xi = Math.floor(u), yi = Math.floor(v); const fx = u - xi, fy = v - yi; const h = (a: number, b: number) => { const m = ((a % f) + f) % f, n = ((b % f) + f) % f; return vnoise(m * 7.13 + 100, n * 5.71 + 100); }; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy); };
    const v = 0.5 * w(8) + 0.3 * w(16) + 0.2 * w(32) + (rnd() - 0.5) * 0.02;
    const g = 228 + v * 27;   // (soft: Zelda-style ground, no noisy speckle)
    const i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Ground + windowed grass. The ground grid doubles as a "mask" texture (rgb = grass tint, a = density) that the
// grass vertex shader samples, so grass can wrap endlessly around the player over a huge map with a fixed instance count.
function Ground({ q }: { q: QualityCfg }) {
  const { geo, mat, mask } = useMemo(() => {
    const seg = q.name === 'LOW' ? 120 : 180;
    const S = GROUND_SIZE, cell = S / seg, n = seg + 1;
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    const bytes = new Uint8Array(n * n * 4), sandA = new Float32Array(n * n);
    const c = new Color(), gc = new Color();
    const idx = new Uint32Array(seg * seg * 6);
    const pe = (x: number, z: number) => pondEdge(Math.atan2(z - POND.z, x - POND.x));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
      const y = groundY(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      groundColor(x, z, y, c); sandA[k] = beachSandK(x, z);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 8; uv[k * 2 + 1] = z / 8;   // (the Greenwood run rooms' painted lawn texture, period 8 m)
      // grass density + tint
      const r = Math.hypot(x, z), e = edgeR(Math.atan2(z, x));
      const pd = Math.hypot(x - POND.x, z - POND.z);
      let dens = regionAt(x, z, _rg).grass *  sstep(e - 1, e - 6, r) * sstep(pe(x, z) + 0.3, pe(x, z) + 2.5, pd);
      gc.copy(c).multiplyScalar(1.55); gc.convertLinearToSRGB();
      bytes[k * 4] = Math.min(255, gc.r * 255); bytes[k * 4 + 1] = Math.min(255, gc.g * 255); bytes[k * 4 + 2] = Math.min(255, gc.b * 255);
      bytes[k * 4 + 3] = Math.round(dens * 255);
    }
    let t = 0;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, d = a + n, e2 = d + 1;
      idx[t++] = a; idx[t++] = d; idx[t++] = b; idx[t++] = b; idx[t++] = d; idx[t++] = e2;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('aSand', new Float32BufferAttribute(sandA, 1));
    g.setIndex(new BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const [gTex, gGlow] = groundDetail('GRASS');
    const m = new MeshStandardMaterial({ vertexColors: true, map: gTex, roughness: 0.96, metalness: 0, emissiveMap: gGlow, emissive: new Color(gGlow ? '#ffffff' : '#000000'), emissiveIntensity: gGlow ? 0.5 : 0 });
    // the outskirts' dirt tracks (ROADS beyond the wall + dirt:true): wandering soft soil paths with a ragged leafy edge, per pixel in the ground shader (render/groundPath.ts)
    const dd = dirtDiscs(); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const d of dd) { x0 = Math.min(x0, d.x - 5); x1 = Math.max(x1, d.x + 5); z0 = Math.min(z0, d.z - 5); z1 = Math.max(z1, d.z + 5); }
    const pm = pathMask(dd, x0, z0, x1 - x0, z1 - z0, 6);
    applyPathShader(m, pm, groundDetail('SAND', true)[0]);   // (+ the beach sand's own painted texture where the lakeside / mainland beach colour is)
    const tex = new DataTexture(bytes, n, n, RGBAFormat);
    tex.colorSpace = SRGBColorSpace; tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.needsUpdate = true;
    return { geo: g, mat: m, mask: tex };
  }, [q.name]);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
    </>
  );
}

function isLobbyNow() { return isLobbyStatus(useGameStore.getState().status); }

// (bushes, flower patches, grass tufts, mushrooms, the forest ring and the rim boulders are nature_kit_v1 pieces: render/natureLayout.ts + render/NatureBatch.tsx)

function Pebbles({ q }: { q: QualityCfg }) {
  const geo = useMemo(() => new GB([0.8, 1.05]).dodeca(0.5, [0, 0.12, 0], '#9a9a94', [1, 0.55, 0.85]).build(), []);
  const mat = useMemo(() => litMat(), []);
  const pebbleCount = Math.round(q.pebbles * 0.15);
  const fill = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(77), c = new Color();
    let i = 0;
    for (let g = 0; i < pebbleCount && g < pebbleCount * 60; g++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (ARENA_RADIUS + 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r > edgeR(a) - 2 || inYard(x, z, 1) || inForecourtUse(x, z, 0)) continue;
      if (rnd() > 0.25) continue;
      const s = 0.15 + rnd() * 0.35;
      setInst(m, i, x, groundY(x, z), z, rnd() * 6, s, s * (0.7 + rnd() * 0.6), s * 1.1);
      c.set('#8e8f8a').lerp(c.clone().set('#b9a98c'), rnd()).multiplyScalar(0.8 + rnd() * 0.4);
      m.setColorAt(i, c); i++;
    }
    m.count = i;
  }, [pebbleCount]);
  return <Inst geo={geo} mat={mat} count={pebbleCount} fill={fill} receive />;
}

// -------------------------------------------------------------------- pond ---
function pondGeometry() {
  const rings = 9, segs = 64;
  const pos: number[] = [], rr: number[] = [], idx: number[] = [];   // rr = metres to the shore
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * TAU;
      const e = pondEdge(a) * 1.0;
      const k = r / rings;
      pos.push(Math.cos(a) * e * k, 0, Math.sin(a) * e * k); rr.push((1 - k) * e);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * (segs + 1) + s, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new Float32BufferAttribute(rr, 1));
  g.setIndex(idx);
  return g;
}
function Pond({ q }: { q: QualityCfg }) {
  const { geo, mat } = useMemo(() => ({
    geo: pondGeometry(),
    mat: makeWaterMaterial({ shore: 'attr', span: 3.2 }),
  }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const reeds = useMemo(() => {
    const g = new GB([0.7, 1.1]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.cyl(0.015, 0.03, 1.1 + (i % 2) * 0.4, 4, [Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12], '#6a9a3a', [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12]); }
    g.cyl(0.05, 0.05, 0.28, 5, [0, 1.15, 0], '#7a4a24');
    return g.build();
  }, []);
  const pads = useMemo(() => new GB([1, 1]).cyl(0.55, 0.55, 0.04, 9, [0, 0, 0], '#4aa83a').cyl(0.1, 0.1, 0.06, 5, [0.2, 0.03, 0.1], '#ff9ac0').build(), []);
  const rm = useMemo(() => litMat({ flatShading: true, side: DoubleSide }), []);
  const fillReeds = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(5); let i = 0;
    while (i < 46) { const a = rnd() * TAU; const e = pondEdge(a); const r = e + (rnd() - 0.2) * 1.4; setInst(m, i, POND.x + Math.cos(a) * r, groundY(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r) - 0.05, POND.z + Math.sin(a) * r, rnd() * 6, 0.9 + rnd() * 0.8, 0.8 + rnd() * 0.9, 0.9 + rnd() * 0.8, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2); i++; }
  }, []);
  const fillPads = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 12; i++) { const a = rnd() * TAU, r = rnd() * pondEdge(a) * 0.7; setInst(m, i, POND.x + Math.cos(a) * r, -0.09, POND.z + Math.sin(a) * r, rnd() * 6, 0.7 + rnd() * 0.6); }
  }, []);
  return (
    <>
      <mesh geometry={geo} material={mat} position={[POND.x, -0.12, POND.z]} renderOrder={1} />
      <Inst geo={reeds} mat={rm} count={46} fill={fillReeds} />
      <Inst geo={pads} mat={rm} count={12} fill={fillPads} />
    </>
  );
}

export function Terrain({ q }: { q: QualityCfg }) {
  return (
    <>
      <Ground q={q} />
      <Pebbles q={q} />
      <React.Suspense fallback={null}><NatureBatch q={q} /></React.Suspense>
    </>
  );
}
