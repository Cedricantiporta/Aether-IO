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
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Material, Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, Object3D, RGBADepthPacking, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { litMat, setInst } from './util';
import { kitColor } from './townPalette';

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

/** The baked nature kit (loaded once, cached). Suspends until the GLB is in. */
export function useNatureKit(): NatureKitData {
  const gltf = useGLTF(NATURE_URL);
  return useMemo(() => { if (!cache.data) cache.data = bake(gltf.scene); return cache.data; }, [gltf]);
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
