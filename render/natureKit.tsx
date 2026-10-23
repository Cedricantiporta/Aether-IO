// ============================================================================
// Nature kit v1 (Blender-modelled, art/blender/nature_kit_v1.py): public/models/town/nature_kit_v1.glb.
// 48 pieces, 14 flat materials (the 12 town_kit_v2 names + leaf_light + barn_red; window_glow is the emissive one), same loading
// pattern as render/townKit.tsx: the GLB is meshopt-compressed AND quantized (int16 positions, the node carries the real size), so
// every mesh is de-quantized to float and baked with its full world matrix; the material colour becomes a vertex colour (for the
// shared lit material) and window_glow goes to a separate emissive geometry. Everything static is placed with <Inst> (chunked,
// culled instancing). Pieces:
//   STATIC   trees, plants, park pieces, outskirts buildings, dock, crops ... one body (+ glow) geometry each, origin = ground centre,
//            front on +Z. `windmill_blades` is a joint (pivot = the hub, spin about local z): baked in hub space.
//   ANIMALS  cow sheep pig chicken horse cat dog duck: an Empty root whose children are JOINT empties `<animal>_body|head|tail|
//            legFL|legFR|legBL|legBR|legL|legR|wingL|wingR|saddle` (the origin of a joint IS its pivot, one `_mesh` child each).
//            All joints of one animal are baked into ONE geometry (positions in animal space) with per-vertex pivot / part id /
//            leg phase, and the pose (leg swing, head turn / peck, tail wag, wing flap) is applied in the vertex shader from
//            per-instance values: one draw call per animal species instead of ~9 meshes per animal (see render/KitAnimals.tsx).
// ============================================================================
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Material, Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, Object3D, RGBADepthPacking, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { litMat, setInst } from './util';
import { kitColor } from './townPalette';
import { useKitV3, type KitV3Data } from './kitV3';
import { toyTree, type ToyCfg } from './toyTrees';

export const NATURE_URL = `${BASE}models/town/nature_kit_v1.glb`;

export const STATIC_PIECES = [
  'tree_round_a', 'tree_round_b', 'tree_round_c', 'tree_pine_a', 'tree_pine_b', 'palm_a', 'palm_b',
  'bush_round', 'bush_flower', 'hedge_block', 'flower_patch', 'grass_tuft', 'mushroom_cluster', 'rock_round_a', 'rock_round_b',
  'park_bench', 'park_fountain', 'stone_path_tile', 'fence_wood', 'gazebo', 'well', 'signpost',
  'barn', 'farmhouse', 'windmill', 'stable', 'chicken_coop', 'mining_camp_tent', 'mine_entrance', 'brewer_hut', 'endless_tower',
  'dock_segment', 'dock_deck', 'dock_post', 'small_boat', 'market_cart', 'haystack', 'crop_wheat', 'crop_cabbage', 'crop_pumpkin', 'crop_row',
] as const;
export type NKPiece = (typeof STATIC_PIECES)[number];
export const ANIMAL_KINDS = ['cow', 'sheep', 'pig', 'chicken', 'horse', 'cat', 'dog', 'duck'] as const;
export type AnimalKind = (typeof ANIMAL_KINDS)[number];

export interface KitPiece { body: BufferGeometry; glow: BufferGeometry | null }
export interface NatureKitData {
  S: Record<string, KitPiece>;
  /** one merged, pose-able geometry per animal species (see the header) */
  A: Record<AnimalKind, BufferGeometry>;
  /** windmill_blades baked around the hub (spin about local z) */
  blades: BufferGeometry;
  /** the windmill hub, in windmill space */
  hub: [number, number, number];
  /** horse: top of the saddle seat on the centre line (animal space), where a rider sits */
  seatY: number;
}

const STATIC = new Set<string>(STATIC_PIECES);
const PARTS: Record<string, number> = { body: 0, saddle: 0, head: 1, tail: 2, legFL: 3, legFR: 4, legBL: 5, legBR: 6, legL: 3, legR: 4, wingL: 7, wingR: 8 };
/** four-beat walk / bounding gallop leg phase offsets by leg slot (FL, FR, BL, BR); the two-legged birds use slots 3 / 4 as L / R */
const WALK_OFF = [0, Math.PI, Math.PI * 1.5, Math.PI * 0.5], GALLOP_OFF = [0, 0.35, Math.PI, Math.PI + 0.35];
/** the material that takes the per-animal coat tint (a species without an entry keeps its own colours) */
const COAT: Partial<Record<AnimalKind, string>> = { cow: 'stone', sheep: 'stone', pig: 'flower_pink', chicken: 'stone', horse: 'wood', cat: 'wood' };

const _inv = new Matrix4(), _rel = new Matrix4();
const cache: { data: NatureKitData | null } = { data: null };

/** The mesh's geometry as a float, non-indexed copy with `m` baked in and the material colour as vertex colour. */
function bakeMesh(m: Mesh, mat: Matrix4): BufferGeometry {
  const src = m.geometry.toNonIndexed(), g = new BufferGeometry();
  // de-quantize (int16 normalized -> float) BEFORE transforming, or world-space values get clamped to [-1, 1]
  for (const a of ['position', 'normal'] as const) {
    const at = src.attributes[a]; if (!at) continue;
    const f = new Float32Array(at.count * 3);
    for (let i = 0; i < at.count; i++) { f[i * 3] = at.getX(i); f[i * 3 + 1] = at.getY(i); f[i * 3 + 2] = at.getZ(i); }
    g.setAttribute(a, new Float32BufferAttribute(f, 3));
  }
  g.applyMatrix4(mat);
  const mt = m.material as MeshStandardMaterial;
  const c = kitColor(mt.name) ?? mt.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  src.dispose();
  return g;
}

function bake(scene: Object3D): NatureKitData {
  scene.updateMatrixWorld(true);
  const stat: Record<string, { b: BufferGeometry[]; g: BufferGeometry[] }> = {};
  const anim: Record<string, BufferGeometry[]> = {};
  const seat: number[] = [];
  let blades: BufferGeometry[] = [], hub: [number, number, number] = [0, 6.9, 2.15];
  scene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh, mt = m.material as MeshStandardMaterial;
    // the owner: the nearest ancestor (or the mesh itself) that is a known piece / joint
    let k: Object3D | null = m, kind: 'static' | 'joint' | 'blades' | '' = '';
    for (; k && k.type !== 'Scene'; k = k.parent) {
      const nm = k.name;
      if (nm === 'windmill_blades') { kind = 'blades'; break; }
      if (STATIC.has(nm)) { kind = 'static'; break; }
      if (/^(cow|sheep|pig|chicken|horse|cat|dog|duck)_(body|head|tail|legFL|legFR|legBL|legBR|legL|legR|wingL|wingR|saddle)$/.test(nm)) { kind = 'joint'; break; }
    }
    if (!k || !kind) return;
    if (kind === 'static') {
      const g = bakeMesh(m, m.matrixWorld), e = (stat[k.name] ??= { b: [], g: [] });
      ((mt.name || '').includes('glow') ? e.g : e.b).push(g);
      if (k.name === 'dock_segment' && mt.name === 'wood') (stat.dock_deck ??= { b: [], g: [] }).b.push(bakeMesh(m, m.matrixWorld));   // the planks alone (the T-head tiles get their own posts)
    } else if (kind === 'blades') {
      _inv.copy(k.matrixWorld).invert(); _rel.multiplyMatrices(_inv, m.matrixWorld);
      blades.push(bakeMesh(m, _rel)); hub = [k.position.x, k.position.y, k.position.z];
    } else {
      const [animal, part] = k.name.split('_') as [AnimalKind, string];
      const pivot = new Vector3().setFromMatrixPosition(k.matrixWorld);   // joints are bare translations under the animal root (at the origin)
      _inv.copy(k.matrixWorld).invert(); _rel.multiplyMatrices(_inv, m.matrixWorld);
      const g = bakeMesh(m, _rel);
      g.translate(pivot.x, pivot.y, pivot.z);   // joint space -> animal space (the shader turns it back around the pivot)
      const n = g.attributes.position.count, id = PARTS[part];
      const pv = new Float32Array(n * 3), inf = new Float32Array(n * 4), coat = new Float32Array(n);
      const slot = id >= 3 && id <= 6 ? id - 3 : 0, isCoat = COAT[animal] !== undefined && mt.name === COAT[animal] ? 1 : 0;
      for (let i = 0; i < n; i++) {
        pv[i * 3] = pivot.x; pv[i * 3 + 1] = pivot.y; pv[i * 3 + 2] = pivot.z;
        inf[i * 4] = id; inf[i * 4 + 1] = WALK_OFF[slot]; inf[i * 4 + 2] = GALLOP_OFF[slot]; inf[i * 4 + 3] = pivot.x < 0 ? -1 : 1;
        coat[i] = isCoat;
      }
      g.setAttribute('aPivot', new Float32BufferAttribute(pv, 3));
      g.setAttribute('aInfo', new Float32BufferAttribute(inf, 4));
      g.setAttribute('aCoat', new Float32BufferAttribute(coat, 1));
      (anim[animal] ??= []).push(g);
      if (animal === 'horse' && part === 'saddle') {   // the seat: highest vertex of the saddle near the centre line (ignores the pommel / horn)
        const p = g.attributes.position; let top = -1e9;
        for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.2 && Math.abs(p.getZ(i) - pivot.z) < 0.35 && p.getY(i) > top) top = p.getY(i);
        seat.push(top);
      }
    }
  });
  const S: Record<string, KitPiece> = {};
  for (const [name, e] of Object.entries(stat)) {
    const body = e.b.length ? mergeGeometries(e.b, false) : new BufferGeometry(), glow = e.g.length ? mergeGeometries(e.g, false) : null;
    body.computeBoundingSphere(); glow?.computeBoundingSphere();
    body.name = 'nk:' + name; if (glow) glow.name = 'nk:' + name + ':glow';
    for (const g of [...e.b, ...e.g]) g.dispose();
    S[name] = { body, glow };
  }
  const A = {} as Record<AnimalKind, BufferGeometry>;
  for (const [name, list] of Object.entries(anim)) {
    const g = mergeGeometries(list, false); for (const p of list) p.dispose();
    g.computeBoundingSphere(); g.name = 'nk:' + name; A[name as AnimalKind] = g;
  }
  const bg = mergeGeometries(blades, false); for (const p of blades) p.dispose(); bg.computeBoundingSphere();
  return { S, A, blades: bg, hub, seatY: seat.length ? Math.max(...seat) : 1.65 };
}

/** Kit v3 pieces (public/models/town/kit_v3.glb, render/kitV3.tsx) as ordinary static pieces of this kit: the body (vertex colours = material x COLOR_0) and the
 *  emissive part (window_glow / rune_glow) become non-indexed float geometries with position / normal / color, exactly like the nature pieces, so ONE BatchedMesh
 *  (render/NatureBatch.tsx) draws trees, props and landmarks of both kits. Piece names never collide (v3: tree_oak_big, palm_v3, bush_cluster ...). */

/** Owner 2026-10-22 ("I didn't like the rounded trees"): the lumpy multi-blob kit canopies (oak / birch / fruit / blossom) are replaced by ONE soft rounded canopy on a visible trunk,
 *  the clean Zelda / Nintendo toy-tree look. Same footprint + height as the kit piece (so V3_K, colliders and layouts are unchanged). */
type TreeShape = 'ball' | 'capsule' | 'cube' | 'cone';
const CUTE_TREES: Record<string, { shape: TreeShape; leaf: string; leaf2: string; trunk: string; dots?: string }> = {
  tree_oak_big: { shape: 'ball', leaf: '#4fa83a', leaf2: '#8fd24f', trunk: '#8a5a34' },
  tree_oak_small: { shape: 'cube', leaf: '#60b845', leaf2: '#a2de5a', trunk: '#8a5a34' },
  tree_birch: { shape: 'capsule', leaf: '#74c04a', leaf2: '#b9e164', trunk: '#d9ccb2' },
  tree_fruit: { shape: 'ball', leaf: '#4fa83a', leaf2: '#8fd24f', trunk: '#8a5a34', dots: '#e5483a' },
  tree_blossom: { shape: 'ball', leaf: '#ee9bbd', leaf2: '#ffc8dc', trunk: '#7d5236' },
  tree_pine_layered_a: { shape: 'cone', leaf: '#2f9a4a', leaf2: '#6cc86a', trunk: '#8a5a34' },
  tree_pine_layered_b: { shape: 'cone', leaf: '#3aa552', leaf2: '#7ad072', trunk: '#8a5a34' },
};
/** The four reference-sheet toy trees (render/toyTrees.ts): round oak, layered pine, palm, blossom. Same footprint + height as the kit pieces they replace. */
const TOY_TREES: Record<string, ToyCfg> = {
  tree_oak_big: { kind: 'oak', leaf: '#4a9f3a', leaf2: '#98d856', trunk: '#8a5a34' },
  tree_oak_small: { kind: 'oak', leaf: '#56ad40', leaf2: '#a6e060', trunk: '#8f5e36' },
  tree_fruit: { kind: 'oak', leaf: '#4a9f3a', leaf2: '#98d856', trunk: '#8a5a34', fruit: '#e5483a' },
  tree_blossom: { kind: 'blossom', leaf: '#e8708a', leaf2: '#ffa6b4', trunk: '#5a3822', fruit: '#ffe3ee' },
  tree_pine_layered_a: { kind: 'pine', leaf: '#2f8f4a', leaf2: '#74cf6c', trunk: '#8a5a34', tiers: 6 },
  tree_pine_layered_b: { kind: 'pine', leaf: '#379f50', leaf2: '#7fd672', trunk: '#8a5a34', tiers: 5 },
  palm_v3: { kind: 'palm', leaf: '#3e9e46', leaf2: '#8fd65a', trunk: '#c79a62', lean: 1.0 },
};
function cuteTree(name: string, box: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }): BufferGeometry {
  const cfg = CUTE_TREES[name], H = box.maxY, R = Math.min(box.maxX - box.minX, box.maxZ - box.minZ) * 0.5 * 0.98;
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  const parts: BufferGeometry[] = [];
  const paint = (g0: BufferGeometry, f: (x: number, y: number, z: number, o: Color) => void): BufferGeometry => {
    const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new Color();
    for (let i = 0; i < p.count; i++) { f(p.getX(i), p.getY(i), p.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
  };
  const a = new Color(cfg.leaf), b = new Color(cfg.leaf2), tc = new Color(cfg.trunk);
  const grad = (y0: number, y1: number) => (x: number, y: number, z: number, o: Color) => { const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); o.copy(a).lerp(b, k * k * 0.9 + 0.05); };
  let cy = 0, Ry = 0;
  if (cfg.shape === 'cone') {   // 3 stacked soft cone tiers on a short trunk
    const th = H * 0.2, tw = Math.max(0.16, R * 0.16);
    const tr = new CylinderGeometry(tw * 0.8, tw * 1.15, th + 0.2, 10, 1); tr.translate(cx, (th + 0.2) / 2, cz);
    parts.push(paint(tr, (x, y, z, o) => { o.copy(tc); }));
    for (let t = 0; t < 3; t++) {
      const h = H * 0.42, r = R * (1 - t * 0.27), y0 = th * 0.8 + t * H * 0.25, cn = new ConeGeometry(r, h, 14, 1); cn.translate(cx, y0 + h / 2, cz);
      parts.push(paint(cn, grad(y0, y0 + h)));
    }
    const g = mergeGeometries(parts, false); for (const q of parts) q.dispose(); g.computeBoundingSphere(); return g;
  }
  const rx = cfg.shape === 'capsule' ? R * 0.78 : R;
  Ry = cfg.shape === 'capsule' ? Math.min(H * 0.34, R * 1.7) : cfg.shape === 'cube' ? Math.min(H * 0.3, R * 0.85) : Math.min(H * 0.42, R * 0.95);
  cy = H - Ry;
  const trunkH = Math.max(0.6, cy - Ry * 0.25), tw = Math.max(0.16, R * 0.17);
  const tr = new CylinderGeometry(tw * 0.78, tw * 1.15, trunkH, 10, 1); tr.translate(cx, trunkH / 2, cz);
  parts.push(paint(tr, (x, y, z, o) => { o.copy(tc).multiplyScalar(0.88 + 0.12 * (y / trunkH)); }));
  let cn: BufferGeometry;
  if (cfg.shape === 'cube') {   // soft rounded cube: a subdivided box pulled toward a sphere
    const bx = new BoxGeometry(2, 2, 2, 8, 8, 8), pos = bx.attributes.position, v = new Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const n = v.clone().normalize().multiplyScalar(1.38); v.lerp(n, 0.55); pos.setXYZ(i, v.x, v.y, v.z); }
    bx.computeVertexNormals(); cn = bx; cn.scale(rx * 0.74, Ry * 0.74, rx * 0.74);
  } else { cn = new IcosahedronGeometry(1, 3); cn.scale(rx, Ry, rx); }
  cn.translate(cx, cy, cz);
  parts.push(paint(cn, grad(cy - Ry, cy + Ry)));
  if (cfg.dots) {
    const dc = new Color(cfg.dots);
    for (let i = 0; i < 6; i++) { const t = i * 2.4 + 0.5, h = 0.25 + (i % 3) * 0.2, sp = new IcosahedronGeometry(Math.max(0.11, R * 0.07), 1); sp.translate(cx + Math.cos(t) * R * 0.86 * Math.sqrt(1 - h * h), cy + Ry * h * 0.9, cz + Math.sin(t) * R * 0.86 * Math.sqrt(1 - h * h)); parts.push(paint(sp, (x, y, z, o) => { o.copy(dc); })); }
  }
  const g = mergeGeometries(parts, false); for (const q of parts) q.dispose(); g.computeBoundingSphere(); return g;
}
function addKitV3(d: NatureKitData, k3: KitV3Data): void {
  const geo = (c: { pos: Float32Array; nrm: Float32Array; col: Float32Array } | null, name: string): BufferGeometry | null => {
    if (!c) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(c.pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(c.nrm, 3)); g.setAttribute('color', new Float32BufferAttribute(c.col, 3));
    g.computeBoundingSphere(); g.name = name; return g;
  };
  for (const [name, p] of Object.entries(k3.P)) {
    if (name === 'light_shaft' || d.S[name]) continue;
    let body = geo(p.body, 'v3:' + name);
    const toy = TOY_TREES[name], cute = CUTE_TREES[name];
    if (body && (toy || cute)) { body.dispose(); body = toy ? toyTree(toy, p.box) : cuteTree(name, p.box); body.name = 'v3:' + name; }
    if (body) d.S[name] = { body, glow: toy || cute ? null : geo(p.glow, 'v3:' + name + ':glow') };
  }
}

/** The baked nature kit (loaded once, cached; kit v3's pieces are merged in). Suspends until both GLBs are in. */
export function useNatureKit(): NatureKitData {
  const gltf = useGLTF(NATURE_URL);
  const k3 = useKitV3();
  return useMemo(() => { if (!cache.data) { cache.data = bake(gltf.scene); addKitV3(cache.data, k3); } return cache.data; }, [gltf, k3]);
}
useGLTF.preload(NATURE_URL);
/** Saddle height of the kit horse (scale 1) once the kit is loaded: where a rider's hips sit (render/Hero.tsx). */
export const kitSeatY = (): number => (cache.data ? cache.data.seatY : 2.2);

// ------------------------------------------------------------------ materials
let _lit: MeshStandardMaterial | null = null;
/** Shared lit material of the kit's static pieces (smooth shading: the balls are smooth, the architecture carries its own flat normals). */
export function natureLit(): MeshStandardMaterial { return (_lit ??= litMat({ roughness: 0.86, flatShading: false })); }

// ---- animal pose shader: ONE program for every species (pivot / part id / phase are vertex data, the pose is per-instance)
const POSE_GLSL = /* glsl */ `
attribute vec3 aPivot; attribute vec4 aInfo; attribute float aCoat;
attribute vec4 aPoseA;   // gait phase, gait amplitude, head yaw, head pitch (+ = nose down)
attribute vec4 aPoseB;   // tail wag, wing flap, gallop (0..1), unused
attribute vec3 aTint;
mat3 poseRx(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 poseRy(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 poseRz(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }
mat3 poseR(){
  float p = aInfo.x;
  if (p < 0.5) return mat3(1.0);
  if (p < 1.5) return poseRy(aPoseA.z) * poseRx(aPoseA.w);                 // head
  if (p < 2.5) return poseRy(aPoseB.x) * poseRz(aPoseB.x * 0.5);          // tail
  if (p < 6.5) return poseRx(sin(aPoseA.x + mix(aInfo.y, aInfo.z, aPoseB.z)) * aPoseA.y);   // legs
  return poseRz(aInfo.w * aPoseB.y);                                       // wings
}
`;
function injectPose(sh: { vertexShader: string }, normals: boolean): void {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + POSE_GLSL);
  if (normals) {
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = poseR() * objectNormal;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.xyz = mix(vColor.xyz, aTint, aCoat);\n#endif');
  }
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = aPivot + poseR() * (position - aPivot);');
}
let _am: { lit: MeshStandardMaterial; depth: MeshDepthMaterial } | null = null;
/** Lit + shadow-depth materials of every animal species (both run the pose shader). */
export function animalMats(): { lit: MeshStandardMaterial; depth: MeshDepthMaterial } {
  if (_am) return _am;
  const lit = litMat({ roughness: 0.84, flatShading: false });
  lit.onBeforeCompile = (sh) => injectPose(sh, true);
  lit.customProgramCacheKey = () => 'kitAnimalPose';
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (sh) => injectPose(sh, false);
  depth.customProgramCacheKey = () => 'kitAnimalPoseDepth';
  return (_am = { lit, depth });
}

// ------------------------------------------------------------------ placement
export interface Place { x: number; y?: number; z: number; ry: number; sx: number; sy: number; sz: number }
const fillOf = (places: Place[]) => (m: InstancedMesh) => { places.forEach((p, i) => setInst(m, i, p.x, p.y ?? 0, p.z, p.ry, p.sx, p.sy, p.sz)); m.count = places.length; };

/** One instanced set of a static kit piece: body (lit) + optional glow. Chunked + culled by <Inst>. */
export function KitSet({ piece, places, lit, glow, cast = false, receive = false, chunk = 96 }: { piece: KitPiece; places: Place[]; lit: Material; glow?: Material; cast?: boolean; receive?: boolean; chunk?: number }) {
  const fill = useMemo(() => fillOf(places), [places]);
  if (!places.length) return null;
  return (
    <>
      <Inst geo={piece.body} mat={lit} count={places.length} fill={fill} cast={cast} receive={receive} chunk={chunk} />
      {piece.glow && glow && <Inst geo={piece.glow} mat={glow} count={places.length} fill={fill} chunk={chunk} />}
    </>
  );
}
