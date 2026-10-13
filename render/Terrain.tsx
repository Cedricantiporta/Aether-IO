import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, ShaderMaterial, SRGBColorSpace, BufferAttribute, DataTexture, LinearFilter, RGBAFormat, Vector3,
} from 'three';
import { ARENA_RADIUS, world } from '../engine/world';
import { QualityCfg } from './quality';
import { useGameStore } from '../store';
import { isLobbyStatus } from './CameraRig';
import { GB, fbm, litMat, mulberry32, setInst, TAU, vnoise, lerp } from './util';
import { GROUND_SIZE, POND, dirtAmount, edgeR, groundY, pondEdge, regionAt, sstep } from './terrainFn';
import { makeRockGeo, useNature } from './models';
import { Inst } from './Inst';
import { SUN_DIR } from './Sky';

const wind = { uTime: { value: 0 }, uPlayer: { value: new Vector3(0, 0, 0) } };

// ------------------------------------------------------------------ ground ---
const cG = new Color(), cD = new Color(), cD2 = new Color(), cT = new Color();
const _rg = { w: 0, style: null as any, grass: 1, kind: '' };
function groundColor(x: number, z: number, y: number, out: Color) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), e = edgeR(a);
  const n1 = fbm(x * 0.03 + 20, z * 0.03, 3), n2 = fbm(x * 0.11 + 5, z * 0.11, 3), n3 = vnoise(x * 0.9, z * 0.9);
  cG.set('#3f9c34').lerp(cT.set('#76c648'), sstep(0.3, 0.75, n2));
  cG.lerp(cT.set('#2b7430'), sstep(0.52, 0.7, n1) * 0.8);
  cG.lerp(cT.set('#9bd04e'), sstep(0.42, 0.28, n1) * 0.45);
  cG.multiplyScalar(0.94 + n3 * 0.12);
  const d = dirtAmount(x, z);
  const rg = regionAt(x, z, _rg);
  if (rg.style && rg.w > 0) {
    cT.set(rg.style.color).multiplyScalar(0.9 + n3 * 0.2);
    if (rg.kind === 'FARM') { const f = 0.5 + 0.5 * Math.sin(z * 1.5 + Math.sin(x * 0.2) * 0.6); cT.lerp(cD.set('#7a5a30'), f * 0.55); }
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
  return out;
}

function detailTexture() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!; const img = ctx.createImageData(N, N);
  const rnd = mulberry32(5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tileable noise via wrapped sampling of 2 octaves
    const w = (f: number) => { const u = (x / N) * f, v = (y / N) * f; const xi = Math.floor(u), yi = Math.floor(v); const fx = u - xi, fy = v - yi; const h = (a: number, b: number) => { const m = ((a % f) + f) % f, n = ((b % f) + f) % f; return vnoise(m * 7.13 + 100, n * 5.71 + 100); }; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy); };
    const v = 0.5 * w(8) + 0.3 * w(16) + 0.2 * w(32) + (rnd() - 0.5) * 0.12;
    const g = 206 + v * 49;
    const i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Ground + windowed grass. The ground grid doubles as a "mask" texture (rgb = grass tint, a = density) that the
// grass vertex shader samples, so grass can wrap endlessly around the player over a huge map with a fixed instance count.
function GroundAndGrass({ q }: { q: QualityCfg }) {
  const { geo, mat, mask } = useMemo(() => {
    const seg = q.name === 'LOW' ? 120 : 180;
    const S = GROUND_SIZE, cell = S / seg, n = seg + 1;
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    const bytes = new Uint8Array(n * n * 4);
    const c = new Color(), gc = new Color();
    const idx = new Uint32Array(seg * seg * 6);
    const pe = (x: number, z: number) => pondEdge(Math.atan2(z - POND.z, x - POND.x));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -S / 2 + i * cell, z = -S / 2 + j * cell;
      const y = groundY(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      groundColor(x, z, y, c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
      // grass density + tint
      const r = Math.hypot(x, z), e = edgeR(Math.atan2(z, x));
      const pd = Math.hypot(x - POND.x, z - POND.z);
      let dens = regionAt(x, z, _rg).grass * (1 - sstep(0.15, 0.7, dirtAmount(x, z))) * sstep(e - 1, e - 6, r) * sstep(pe(x, z) + 0.3, pe(x, z) + 2.5, pd);
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
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(new BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: 0.95, metalness: 0 });
    const tex = new DataTexture(bytes, n, n, RGBAFormat);
    tex.colorSpace = SRGBColorSpace; tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.needsUpdate = true;
    return { geo: g, mat: m, mask: tex };
  }, [q.name]);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <Grass q={q} mask={mask} />
    </>
  );
}

// ------------------------------------------------------------------- grass ---
function tuftGeometry() {
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  const base = new Color('#6a7a5a'), tip = new Color('#fff2b0'), c = new Color();
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + (b % 2) * 0.4;
    const ox = Math.cos(a) * 0.1, oz = Math.sin(a) * 0.1;
    const dx = Math.cos(a + 1.2), dz = Math.sin(a + 1.2);
    const lx = Math.cos(a), lz = Math.sin(a);
    const h = 0.55 + (b % 3) * 0.14, w = 0.075, lean = 0.16 + (b % 2) * 0.1;
    const rows = [[0, w, 0], [0.5, w * 0.72, lean * 0.3], [1, 0.0, lean]];
    const start = pos.length / 3;
    for (let r = 0; r < 3; r++) {
      const [t, hw, l] = rows[r];
      const y = t * h;
      if (r < 2) {
        pos.push(ox - dx * hw + lx * l, y, oz - dz * hw + lz * l, ox + dx * hw + lx * l, y, oz + dz * hw + lz * l);
        c.copy(base).lerp(tip, t * t); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        nrm.push(0, 1, 0, 0, 1, 0);
      } else {
        pos.push(ox + lx * l, y, oz + lz * l);
        c.copy(tip); col.push(c.r, c.g, c.b); nrm.push(0, 1, 0);
      }
    }
    idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

function Grass({ q, mask }: { q: QualityCfg; mask: DataTexture }) {
  const geo = useMemo(tuftGeometry, []);
  const R = q.name === 'LOW' ? 27 : q.name === 'MEDIUM' ? 33 : 38;
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = wind.uTime; sh.uniforms.uPlayer = wind.uPlayer;
      sh.uniforms.uMask = { value: mask }; sh.uniforms.uHalf = { value: GROUND_SIZE / 2 };
      sh.uniforms.uW = { value: R * 2 }; sh.uniforms.uR = { value: R };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uPlayer; uniform sampler2D uMask; uniform float uHalf; uniform float uW; uniform float uR;\nvarying float vGrassFade;')
        .replace('#include <color_vertex>', `#include <color_vertex>
          vec2 gb = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          vec2 gk = floor((uPlayer.xz - gb) / uW + 0.5);
          vec2 gwp = gb + gk * uW;
          vec4 gm = texture2D(uMask, (gwp + vec2(uHalf)) / (uHalf * 2.0));
          float gd = length(gwp - uPlayer.xz);
          float gh = fract(sin(dot(gb, vec2(12.9898, 78.233))) * 43758.5453);
          float gh2 = fract(gh * 7.31 + 0.37);
          float gsx = instanceMatrix[0][0]; float gsz = instanceMatrix[2][2];
          float gvis = step(gh, gm.a) * smoothstep(uR, uR - 8.0, gd);
          vColor.rgb *= gm.rgb * (0.85 + gh2 * 0.35);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed *= gvis;
          transformed.x += (gwp.x - gb.x) / gsx; transformed.z += (gwp.y - gb.y) / gsz;
          float hh = position.y * gvis;
          float wv = sin(uTime * 1.7 + gwp.x * 0.35 + gwp.y * 0.27) * 0.5 + sin(uTime * 2.9 + gwp.x * 0.8 + gwp.y * 0.2) * 0.2;
          transformed.x += wv * hh * hh * 0.55;
          transformed.z += wv * hh * hh * 0.25;
          vec2 away = gwp - uPlayer.xz;
          vec2 pu = normalize(away + vec2(1e-4)) * smoothstep(2.6, 0.2, gd) * hh * 1.4; transformed.x += pu.x / gsx; transformed.z += pu.y / gsz;
          transformed.y *= 1.0 - smoothstep(1.4, 0.2, gd) * 0.3;`);
    };
    return m;
  }, [mask, R]);
  const fill = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(11);
    const W = R * 2;
    for (let i = 0; i < q.grass; i++) {
      const s = 0.8 + rnd() * 0.9;
      setInst(m, i, rnd() * W, 0, rnd() * W, 0, s * (0.8 + rnd() * 0.5), s, s * (0.8 + rnd() * 0.5));
    }
  }, [q.grass, R]);
  useFrame(({ clock }) => { wind.uTime.value = clock.elapsedTime; wind.uPlayer.value.copy(isLobbyNow() ? LOBBY_FOCUS : world.player.pos); });
  return <Inst geo={geo} mat={mat} count={q.grass} fill={fill} receive culled={false} />;
}

const LOBBY_FOCUS = new Vector3(0, 0, -8);
function isLobbyNow() { return isLobbyStatus(useGameStore.getState().status); }

// ---------------------------------------------------- flowers and pebbles ---
function Flowers({ q }: { q: QualityCfg }) {
  const { stem, head, sm, hm } = useMemo(() => {
    const s = new GB([1, 1]).cyl(0.02, 0.025, 0.5, 4, [0, 0.25, 0], '#3f8a30').build();
    const h = new GB([0.9, 1.1]);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; h.sph(0.085, [Math.cos(a) * 0.09, 0.52, Math.sin(a) * 0.09], '#ffffff', [1, 0.5, 1], 5); }
    h.sph(0.06, [0, 0.54, 0], '#ffd23a', 1, 5);
    return { stem: s, head: h.build(), sm: litMat({ flatShading: true }), hm: litMat({ flatShading: true }) };
  }, []);
  const pts = useMemo(() => {
    const rnd = mulberry32(31), out: number[] = [];
    let g = 0;
    while (out.length < q.flowers * 4 && g++ < q.flowers * 10) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (ARENA_RADIUS + 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (dirtAmount(x, z) > 0.2 || r > edgeR(a) - 2) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
      if (fbm(x * 0.08 + 40, z * 0.08, 2) < 0.5 && rnd() < 0.6) continue; // clustered
      out.push(x, z, 0.8 + rnd() * 0.7, rnd());
    }
    return out;
  }, [q.flowers]);
  const n = pts.length / 4;
  const palette = useMemo(() => ['#ffffff', '#ffe14a', '#ff7aa8', '#9ac8ff', '#ff9a3a', '#d9a0ff'].map((c) => new Color(c)), []);
  const fillS = useMemo(() => (m: InstancedMesh) => { for (let i = 0; i < n; i++) setInst(m, i, pts[i * 4], 0, pts[i * 4 + 1], pts[i * 4 + 3] * 6, pts[i * 4 + 2]); }, [pts, n]);
  const fillH = useMemo(() => (m: InstancedMesh) => { for (let i = 0; i < n; i++) { setInst(m, i, pts[i * 4], 0, pts[i * 4 + 1], pts[i * 4 + 3] * 6, pts[i * 4 + 2]); m.setColorAt(i, palette[Math.floor(pts[i * 4 + 3] * 977) % palette.length]); } }, [pts, n, palette]);
  return (<>
    <Inst geo={stem} mat={sm} count={n} fill={fillS} />
    <Inst geo={head} mat={hm} count={n} fill={fillH} />
  </>);
}

function Pebbles({ q }: { q: QualityCfg }) {
  const geo = useMemo(() => new GB([0.8, 1.05]).dodeca(0.5, [0, 0.12, 0], '#9a9a94', [1, 0.55, 0.85]).build(), []);
  const mat = useMemo(() => litMat(), []);
  const fill = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(77), c = new Color();
    let i = 0;
    while (i < q.pebbles) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (ARENA_RADIUS + 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const d = dirtAmount(x, z);
      if (rnd() > 0.25 + d) continue;
      const s = 0.15 + rnd() * 0.35;
      setInst(m, i, x, 0, z, rnd() * 6, s, s * (0.7 + rnd() * 0.6), s * 1.1);
      c.set('#8e8f8a').lerp(c.clone().set('#b9a98c'), rnd()).multiplyScalar(0.8 + rnd() * 0.4);
      m.setColorAt(i, c); i++;
    }
  }, [q.pebbles]);
  return <Inst geo={geo} mat={mat} count={q.pebbles} fill={fill} receive />;
}

// -------------------------------------------------------------------- pond ---
function pondGeometry() {
  const rings = 9, segs = 64;
  const pos: number[] = [], rr: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * TAU;
      const e = pondEdge(a) * 1.0;
      const k = r / rings;
      pos.push(Math.cos(a) * e * k, 0, Math.sin(a) * e * k); rr.push(k);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * (segs + 1) + s, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new Float32BufferAttribute(rr, 1));
  g.setIndex(idx);
  return g;
}
const WATER_VS = `varying float vR; varying vec3 vW; attribute float aR;
void main(){ vR = aR; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = `
uniform float uTime; uniform vec3 uSun; varying float vR; varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  float t = uTime;
  vec2 g = vec2(0.0);
  g += cos(dot(p, vec2(1.0, 0.6)) * 1.7 + t * 1.3) * vec2(1.0, 0.6) * 1.7;
  g += cos(dot(p, vec2(-0.7, 1.0)) * 2.6 - t * 1.1) * vec2(-0.7, 1.0) * 2.6 * 0.7;
  g += cos(dot(p, vec2(0.3, -1.0)) * 4.9 + t * 1.9) * vec2(0.3, -1.0) * 4.9 * 0.4;
  vec3 N = normalize(vec3(-g.x * 0.035, 1.0, -g.y * 0.035));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 deep = vec3(0.05, 0.32, 0.48), shallow = vec3(0.28, 0.72, 0.70), sky = vec3(0.70, 0.88, 1.0);
  vec3 col = mix(shallow, deep, smoothstep(0.95, 0.25, vR));
  col = mix(col, sky, fres * 0.7 + 0.12);
  vec3 H = normalize(normalize(uSun) + V);
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 120.0) * 1.6;
  float ripple = sin(vR * 55.0 - t * 2.2 + sin(p.x * 1.3 + p.y) * 2.0);
  float foam = smoothstep(0.9, 0.985, vR + ripple * 0.012);
  col = mix(col, vec3(0.95, 1.0, 1.0), foam * 0.85);
  float alpha = mix(0.9, 0.7, smoothstep(0.75, 0.99, vR)) ;
  alpha = mix(alpha, 0.95, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function Pond({ q }: { q: QualityCfg }) {
  const { geo, mat } = useMemo(() => ({
    geo: pondGeometry(),
    mat: new ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() } } }),
  }), []);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
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

// --------------------------------------------------------------------- rim ---
function Rim({ q }: { q: QualityCfg }) {
  const nat = useNature();
  const rocks = useMemo(() => [1, 2, 3, 4].map((s) => makeRockGeo(s * 17, s % 2 ? '#8a929c' : '#76808a', '#5fa73c', 0.85 + s * 0.12)), []);
  const rockMat = useMemo(() => litMat({ roughness: 0.92 }), []);
  const nRock = Math.round(230 * q.forest) + 60;
  const rockFills = useMemo(() => rocks.map((_, k) => (m: InstancedMesh) => {
    const rnd = mulberry32(100 + k); let c = 0;
    const per = Math.ceil(nRock / rocks.length);
    for (let i = 0; i < per; i++) {
      const a = ((i + rnd()) / per) * TAU; const e = edgeR(a);
      const r = e + (rnd() - 0.3) * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 2 + rnd() * 3.8;
      setInst(m, c++, x, groundY(x, z) - s * 0.15, z, rnd() * 6, s * (0.9 + rnd() * 0.6), s * (0.9 + rnd() * 1.1), s * (0.9 + rnd() * 0.6), (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
    }
    m.count = c;
  }), [rocks, nRock]);
  const perRock = Math.ceil(nRock / rocks.length);
  // boundary stones just beyond playable radius
  const stones = useMemo(() => makeRockGeo(333, '#9aa2a8', '#6cb844', 0.8), []);
  const nStone = 70;
  const stoneFill = useMemo(() => (m: InstancedMesh) => {
    const rnd = mulberry32(55);
    for (let i = 0; i < nStone; i++) { const a = ((i + rnd() * 0.5) / nStone) * TAU; const r = ARENA_RADIUS + 1.6 + rnd() * 1.2; setInst(m, i, Math.cos(a) * r, 0, Math.sin(a) * r, rnd() * 6, 0.7 + rnd() * 0.9, 0.7 + rnd() * 0.9, 0.7 + rnd() * 0.9); }
  }, []);

  // forest
  const total = Math.round(1100 * q.forest);
  const spec = useMemo(() => {
    const rnd = mulberry32(2024);
    const lists = { oak: [] as number[], palm: [] as number[], pineA: [] as number[], pineB: [] as number[] };
    const inner = { oak: [] as number[], palm: [] as number[], pineA: [] as number[], pineB: [] as number[] };
    for (let i = 0; i < total; i++) {
      const a = rnd() * TAU, e = edgeR(a);
      const d = Math.pow(rnd(), 1.5) * 58 + 3;
      const r = e + d, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const t = rnd();
      const kind = d < 18 ? (t < 0.38 ? 'oak' : t < 0.52 ? 'palm' : t < 0.76 ? 'pineA' : 'pineB') : (t < 0.1 ? 'oak' : t < 0.55 ? 'pineA' : 'pineB');
      const sc = (kind === 'oak' ? 5 : kind === 'palm' ? 5 : 6) * (0.8 + rnd() * 0.7) * (1 + d * 0.004);
      const arr = d < 16 ? inner[kind] : lists[kind];
      arr.push(x, groundY(x, z) - 0.2, z, rnd() * 6.28, sc);
    }
    return { lists, inner };
  }, [total]);
  const mkFill = (arr: number[]) => (m: InstancedMesh) => { for (let i = 0; i < arr.length / 5; i++) setInst(m, i, arr[i * 5], arr[i * 5 + 1], arr[i * 5 + 2], arr[i * 5 + 3], arr[i * 5 + 4], arr[i * 5 + 4] * (0.9 + (i % 5) * 0.08), arr[i * 5 + 4]); };
  const fills = useMemo(() => ({
    inner: (['oak', 'palm', 'pineA', 'pineB'] as const).map((k) => mkFill(spec.inner[k])),
    outer: (['oak', 'palm', 'pineA', 'pineB'] as const).map((k) => mkFill(spec.lists[k])),
  }), [spec]);
  const keys = ['oak', 'palm', 'pineA', 'pineB'] as const;
  return (
    <>
      {rocks.map((g, k) => <Inst key={'r' + k} geo={g} mat={rockMat} count={perRock} fill={rockFills[k]} cast={k < 2} receive />)}
      <Inst geo={stones} mat={rockMat} count={nStone} fill={stoneFill} cast receive />
      {keys.map((k, i) => (spec.inner[k].length ? <Inst key={'i' + k} geo={nat[k]} mat={nat.mat} count={spec.inner[k].length / 5} fill={fills.inner[i]} cast receive /> : null))}
      {keys.map((k, i) => (spec.lists[k].length ? <Inst key={'o' + k} geo={nat[k]} mat={nat.mat} count={spec.lists[k].length / 5} fill={fills.outer[i]} /> : null))}
    </>
  );
}

export function Terrain({ q }: { q: QualityCfg }) {
  return (
    <>
      <GroundAndGrass q={q} />
      <Flowers q={q} />
      <Pebbles q={q} />
      <Pond q={q} />
      <Rim q={q} />
    </>
  );
}
