// Shared helpers for the render layer: noise, deterministic RNG and a tiny
// low-poly geometry builder (merged, vertex-coloured, non-indexed).
import {
  BufferGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, IcosahedronGeometry,
  OctahedronGeometry, TorusGeometry, Matrix4, Quaternion, Euler, Vector3, Color, Float32BufferAttribute,
  Material, MeshStandardMaterial, MeshBasicMaterial, DodecahedronGeometry, TetrahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));
export function angleLerp(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function h2(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x: number, y: number, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f) * a; f *= 2; a *= 0.5; }
  return s;
}

// ------------------------------------------------------------ geometry builder
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _c = new Color();

export type ColorLike = number | string | Color;
type V3 = [number, number, number];

export class GB {
  parts: BufferGeometry[] = [];
  /** shade: [bottom, top] brightness multiplier across the part (fake AO / gradient) */
  constructor(public shade: [number, number] = [0.78, 1.08]) {}

  add(geo: BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1, color: ColorLike = 0xffffff, shade?: [number, number]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rot[0], rot[1], rot[2], 'YXZ');
    _q.setFromEuler(_e);
    if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _p.set(pos[0], pos[1], pos[2]);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
    const posA = g.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < posA.count; i++) { const y = posA.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const sh = shade || this.shade;
    _c.set(color as any);
    const col = new Float32Array(posA.count * 3);
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < posA.count; i++) {
      const k = lerp(sh[0], sh[1], (posA.getY(i) - minY) / span);
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  box(w: number, h: number, d: number, pos: V3, color: ColorLike, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new BoxGeometry(w, h, d), pos, rot, 1, color, shade);
  }
  cyl(rt: number, rb: number, h: number, seg: number, pos: V3, color: ColorLike, rot: V3 = [0, 0, 0], scl: V3 | number = 1, shade?: [number, number]) {
    return this.add(new CylinderGeometry(rt, rb, h, seg), pos, rot, scl, color, shade);
  }
  cone(r: number, h: number, seg: number, pos: V3, color: ColorLike, rot: V3 = [0, 0, 0], scl: V3 | number = 1, shade?: [number, number]) {
    return this.add(new ConeGeometry(r, h, seg), pos, rot, scl, color, shade);
  }
  sph(r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, seg = 8, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new SphereGeometry(r, seg, Math.max(3, seg - 2)), pos, rot, scl, color, shade);
  }
  ico(r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, detail = 0, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new IcosahedronGeometry(r, detail), pos, rot, scl, color, shade);
  }
  octa(r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new OctahedronGeometry(r, 0), pos, rot, scl, color, shade);
  }
  tetra(r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new TetrahedronGeometry(r, 0), pos, rot, scl, color, shade);
  }
  dodeca(r: number, pos: V3, color: ColorLike, scl: V3 | number = 1, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    return this.add(new DodecahedronGeometry(r, 0), pos, rot, scl, color, shade);
  }
  torus(r: number, tube: number, pos: V3, color: ColorLike, rot: V3 = [0, 0, 0], scl: V3 | number = 1, seg = 10, arc = TAU) {
    return this.add(new TorusGeometry(r, tube, 5, seg, arc), pos, rot, scl, color);
  }
  /** triangular prism: cross-section in XY (width x height, apex up), extruded along Z */
  prism(w: number, h: number, len: number, pos: V3, color: ColorLike, rot: V3 = [0, 0, 0], shade?: [number, number]) {
    const a = [-w / 2, 0], b = [w / 2, 0], c = [0, h], z0 = -len / 2, z1 = len / 2;
    const v: number[] = [];
    const tri = (p: number[][]) => { for (const q of p) v.push(q[0], q[1], q[2]); };
    tri([[a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1]]);
    tri([[b[0], b[1], z0], [a[0], a[1], z0], [c[0], c[1], z0]]);
    tri([[a[0], a[1], z0], [a[0], a[1], z1], [c[0], c[1], z1]]); tri([[a[0], a[1], z0], [c[0], c[1], z1], [c[0], c[1], z0]]);
    tri([[b[0], b[1], z1], [b[0], b[1], z0], [c[0], c[1], z0]]); tri([[b[0], b[1], z1], [c[0], c[1], z0], [c[0], c[1], z1]]);
    tri([[a[0], a[1], z1], [a[0], a[1], z0], [b[0], b[1], z0]]); tri([[a[0], a[1], z1], [b[0], b[1], z0], [b[0], b[1], z1]]);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.add(g, pos, rot, 1, color, shade);
  }
  /** Merge an already vertex-coloured geometry (keeps its colours). */
  addColored(geo: BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rot[0], rot[1], rot[2], 'YXZ'); _q.setFromEuler(_e);
    if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _p.set(pos[0], pos[1], pos[2]); _m.compose(_p, _q, _s);
    g.applyMatrix4(_m); g.deleteAttribute('uv');
    this.parts.push(g);
    return this;
  }
  /** single triangle (for wings, flags, fins) */
  tri(a: V3, b: V3, c: V3, color: ColorLike, shade?: [number, number]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    return this.add(g, [0, 0, 0], [0, 0, 0], 1, color, shade);
  }
  build(): BufferGeometry {
    if (this.parts.length === 0) {
      const e = new BufferGeometry();
      e.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3));
      e.setAttribute('normal', new Float32BufferAttribute(new Float32Array(9), 3));
      e.setAttribute('color', new Float32BufferAttribute(new Float32Array(9), 3));
      return e;
    }
    const g = mergeGeometries(this.parts, false)!;
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Displace vertices of a geometry along their (smooth) normal with noise: chunky rocks. */
export function noisify(g: BufferGeometry, amp: number, freq: number, seed = 0) {
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * freq + seed, v.y * freq + v.z * freq * 0.7 + seed * 1.7) - 0.5;
    const len = v.length();
    v.multiplyScalar(1 + (n * amp) / Math.max(0.001, len));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  return g;
}

export const col = (c: ColorLike) => new Color(c as any);

export function mixColor(a: ColorLike, b: ColorLike, t: number, out = new Color()) {
  return out.set(a as any).lerp(new Color(b as any), t);
}

// ------------------------------------------------------------------ materials
export function litMat(extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) {
  return new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.02, ...extra });
}
export function glowMat(extra: any = {}) {
  return new MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...extra });
}

/** Adds per-instance flash (white mix) + soft rim light to a standard/lambert material. Needs geometry attribute `aFlash` (instanced float) – harmless when absent. */
export function patchFlashRim(mat: Material, rim = 0.35) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;\nvarying vec3 vRimN;\nvarying vec3 vRimV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;\nvec4 rmv = modelViewMatrix * vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nrmv = modelViewMatrix * instanceMatrix * vec4(transformed,1.0);\n#endif\nvRimV = -rmv.xyz;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;\nvarying vec3 vRimV;')
      .replace('#include <opaque_fragment>', `
        {
          vec3 rv = normalize(vRimV);
          float rimF = pow(1.0 - clamp(dot(normalize(normal), rv), 0.0, 1.0), 2.5);
          outgoingLight += vec3(1.0, 0.96, 0.85) * rimF * ${rim.toFixed(2)};
          outgoingLight = mix(outgoingLight, vec3(1.0), clamp(vFlash, 0.0, 1.0) * 0.85);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'flashrim' + rim;
  return mat;
}

// ------------------------------------------------------------ instancing ----
import { BufferAttribute, InstancedMesh, Object3D } from 'three';
const _o = new Object3D();

/**
 * Flag a per-frame (pooled) attribute for upload, limited to its first `n` items. Without an update range three
 * re-uploads the WHOLE pool (e.g. 400 x 64 B per instanceMatrix) every frame even when only a few (or zero) instances
 * are live; with ~500 pooled attributes that was ~7 MB of bufferSubData per frame. Nothing is uploaded when n is 0
 * (count 0 draws nothing, and the next non-zero frame uploads its own range).
 */
export function liveRange(a: BufferAttribute, n: number): void {
  a.clearUpdateRanges();
  if (n <= 0) return;
  a.addUpdateRange(0, n * a.itemSize);
  a.needsUpdate = true;
}

/**
 * Shader warm-up for hidden pools: three compiles a material when an object using it is first DRAWN, and before pools
 * were hidden every (empty) pool was drawn on the first frame of a scene / room, i.e. behind the fade. `poolWarm.frames`
 * (set by render/Scene `ShaderWarmup` when the scene, room, area or quality changes) and each pool's own first frames
 * keep empty pools visible for a moment so that still happens (with the real lights / fog / render target) instead of
 * mid-fight on first use.
 */
export const poolWarm = { frames: 0 };
export function poolVisible(o: Object3D, n: number): boolean {
  if (n > 0 || poolWarm.frames > 0) return true;
  const w = o.userData.warmed as number | undefined;
  if (w !== undefined && w >= 2) return false;
  o.userData.warmed = (w || 0) + 1;
  return true;
}

/**
 * `m.count = n` + range-limited upload of instanceMatrix (and instanceColor when present). An empty pool is also hidden:
 * three still projects, sorts and binds (setProgram + uniforms + VAO) a count-0 InstancedMesh every frame and only skips
 * the draw call itself, which was ~250 wasted render items per frame across the pooled effect / enemy / projectile meshes.
 */
export function commitInst(m: InstancedMesh, n: number): void {
  m.count = n;
  m.visible = poolVisible(m, n);
  liveRange(m.instanceMatrix, n);
  if (m.instanceColor) liveRange(m.instanceColor, n);
}

export function setInst(m: InstancedMesh, i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _o.position.set(x, y, z);
  _o.rotation.set(rx, ry, rz, 'YXZ');
  _o.scale.set(sx, sy, sz);
  _o.updateMatrix();
  m.setMatrixAt(i, _o.matrix);
}
