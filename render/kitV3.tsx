// ============================================================================
// Kit v3 loader (Blender kit art/blender/kit_v3.py -> public/models/town/kit_v3.glb, 104 pieces: trees, town props, shop flavour and the
// interior set). Same idea as render/natureKit.tsx: the GLB is meshopt-compressed AND quantized, every mesh is de-quantized to float and
// baked with its full world matrix (so the joint wrapper `<piece>` Empty + `<piece>_mesh` child collapse into one piece), and the material
// colour becomes a vertex colour for ONE shared lit material. Differences to the nature kit:
//   - the glTF COLOR_0 layer (RGBA) is MULTIPLIED into the baked colour (material = lightest tone, COLOR_0 = the hand-painted shading);
//   - `*_glow` materials (window_glow, rune_glow) go to a separate unlit emissive geometry;
//   - `light_shaft` becomes its own additive, transparent, depth-write-off geometry using COLOR_0 alpha (the soft beam).
// API (general, the town wiring can reuse it):
//   useKitV3()                -> baked kit (suspends until loaded), cached;
//   kitV3Box(piece)           -> local bounding box of a piece (after the kit loaded) for colliders;
//   buildKitV3Static(kit, items) -> { body, glow, shaft } merged BufferGeometries (any number of items = 3 draw calls at most);
//   <KitV3Static items />     -> a room's static pieces merged into ONE lit mesh + ONE glow mesh + ONE beam mesh.
// Pieces: front = +Z, origin = ground centre; wall pieces have the room side on +Z (see HANDOFF "Kit v3").
// ============================================================================
import React, { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import { BASE } from './models';
import { litMat } from './util';
import { kitColor } from './townPalette';

export const KIT_V3_URL = `${BASE}models/town/kit_v3.glb`;

/** One baked material group of a piece: positions / normals (xyz) and colours (rgb, or rgba for the shaft). */
interface Chunk { pos: Float32Array; nrm: Float32Array; col: Float32Array; n: number }
export interface KitV3Box { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
export interface KitV3Piece { body: Chunk | null; glow: Chunk | null; shaft: Chunk | null; box: KitV3Box }
export interface KitV3Data { P: Record<string, KitV3Piece> }

/** Where a piece goes: x / y / z (y default 0), rotY (radians about +Y), scale (uniform or per axis), optional tint (colour multiplied into the lit colours). */
export interface KitV3Item { piece: string; x: number; y?: number; z: number; rotY?: number; scale?: number | [number, number, number]; tint?: string | number;
  /** recolour the emissive parts (window_glow / rune_glow) to this colour, keeping their brightness (crystals, magic fires) */ glow?: string | number }

const GLOW = (name: string) => name.includes('glow');
const cache: { data: KitV3Data | null } = { data: null };

function chunkOf(parts: { pos: number[]; nrm: number[]; col: number[] }): Chunk | null {
  const n = parts.pos.length / 3;
  if (!n) return null;
  return { pos: new Float32Array(parts.pos), nrm: new Float32Array(parts.nrm), col: new Float32Array(parts.col), n };
}

/** Bake a loaded kit_v3 scene (non-hook entry for tools / tests; useKitV3 caches this). */
export function bakeKitV3(scene: Object3D): KitV3Data {
  scene.updateMatrixWorld(true);
  const acc: Record<string, { body: { pos: number[]; nrm: number[]; col: number[] }; glow: { pos: number[]; nrm: number[]; col: number[] }; shaft: { pos: number[]; nrm: number[]; col: number[] }; box: KitV3Box }> = {};
  const mk = () => ({ pos: [] as number[], nrm: [] as number[], col: [] as number[] });
  scene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh;
    let k: Object3D = m;
    while (k.parent && k.parent !== scene) k = k.parent;   // the root Empty of the piece
    const name = k.name;
    if (!name) return;
    const e = (acc[name] ??= { body: mk(), glow: mk(), shaft: mk(), box: { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 } });
    const mt = m.material as MeshStandardMaterial, g = m.geometry, p = g.attributes.position, nr = g.attributes.normal, cl = g.attributes.color, idx = g.index;
    const base = kitColor(mt.name) ?? mt.color, br = base.r, bg = base.g, bb = base.b;
    const shaft = name === 'light_shaft', glow = !shaft && GLOW(mt.name || '');
    const dst = shaft ? e.shaft : glow ? e.glow : e.body;
    const mw = m.matrixWorld.elements;
    const cnt = idx ? idx.count : p.count;
    for (let t = 0; t < cnt; t++) {
      const i = idx ? idx.getX(t) : t;
      // de-quantize (getX applies the normalized scale) BEFORE the world matrix, whose scale carries the real size
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wx = mw[0] * x + mw[4] * y + mw[8] * z + mw[12], wy = mw[1] * x + mw[5] * y + mw[9] * z + mw[13], wz = mw[2] * x + mw[6] * y + mw[10] * z + mw[14];
      dst.pos.push(wx, wy, wz);
      if (nr) {
        const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
        let ax = mw[0] * nx + mw[4] * ny + mw[8] * nz, ay = mw[1] * nx + mw[5] * ny + mw[9] * nz, az = mw[2] * nx + mw[6] * ny + mw[10] * nz;
        const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
        dst.nrm.push(ax, ay, az);
      } else dst.nrm.push(0, 1, 0);
      const cr = cl ? cl.getX(i) : 1, cg = cl ? cl.getY(i) : 1, cb = cl ? cl.getZ(i) : 1;
      dst.col.push(br * cr, bg * cg, bb * cb);
      if (shaft) dst.col.push(cl && cl.itemSize >= 4 ? cl.getW(i) : 1);   // rgba for the beam
      if (!shaft) {
        const b = e.box;
        if (wx < b.minX) b.minX = wx; if (wx > b.maxX) b.maxX = wx; if (wy < b.minY) b.minY = wy; if (wy > b.maxY) b.maxY = wy; if (wz < b.minZ) b.minZ = wz; if (wz > b.maxZ) b.maxZ = wz;
      }
    }
  });
  const P: Record<string, KitV3Piece> = {};
  for (const [name, e] of Object.entries(acc)) {
    const shaftCols = name === 'light_shaft';
    if (shaftCols) {   // the beam keeps its own bounds (it is not a collider)
      const b = e.box; const pp = e.shaft.pos;
      for (let i = 0; i < pp.length; i += 3) { b.minX = Math.min(b.minX, pp[i]); b.maxX = Math.max(b.maxX, pp[i]); b.minY = Math.min(b.minY, pp[i + 1]); b.maxY = Math.max(b.maxY, pp[i + 1]); b.minZ = Math.min(b.minZ, pp[i + 2]); b.maxZ = Math.max(b.maxZ, pp[i + 2]); }
    }
    P[name] = { body: chunkOf(e.body), glow: chunkOf(e.glow), shaft: chunkOf(e.shaft), box: e.box };
  }
  return { P };
}

/** The baked kit v3 (loaded once, cached). Suspends until the GLB is in. */
export function useKitV3(): KitV3Data {
  const gltf = useGLTF(KIT_V3_URL);
  return useMemo(() => { if (!cache.data) cache.data = bakeKitV3(gltf.scene); return cache.data; }, [gltf]);
}
useGLTF.preload(KIT_V3_URL);

/** Local bounding box (scale 1, rotation 0) of a piece, once the kit is loaded (null before / for an unknown piece). Use it for colliders. */
export function kitV3Box(piece: string): KitV3Box | null { return cache.data?.P[piece]?.box ?? null; }

// ------------------------------------------------------------------ merging
const _tint = new Color(), _gtint = new Color();
function merge(kit: KitV3Data, items: KitV3Item[], which: 'body' | 'glow' | 'shaft'): BufferGeometry | null {
  const stride = which === 'shaft' ? 4 : 3;
  let total = 0;
  for (const it of items) { const c = kit.P[it.piece]?.[which]; if (c) total += c.n; }
  if (!total) return null;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * stride);
  let o = 0;
  for (const it of items) {
    const c = kit.P[it.piece]?.[which];
    if (!c) continue;
    const s = it.scale ?? 1, sx = typeof s === 'number' ? s : s[0], sy = typeof s === 'number' ? s : s[1], sz = typeof s === 'number' ? s : s[2];
    const cs = Math.cos(it.rotY ?? 0), sn = Math.sin(it.rotY ?? 0), ox = it.x, oy = it.y ?? 0, oz = it.z;
    const tr = it.tint !== undefined && which !== 'shaft' ? _tint.set(it.tint as any) : null;
    const gl = which === 'glow' && it.glow !== undefined ? _gtint.set(it.glow as any) : null;
    for (let i = 0; i < c.n; i++, o++) {
      const x = c.pos[i * 3] * sx, y = c.pos[i * 3 + 1] * sy, z = c.pos[i * 3 + 2] * sz;
      pos[o * 3] = cs * x + sn * z + ox; pos[o * 3 + 1] = y + oy; pos[o * 3 + 2] = -sn * x + cs * z + oz;
      let nx = c.nrm[i * 3] / sx, ny = c.nrm[i * 3 + 1] / sy, nz = c.nrm[i * 3 + 2] / sz;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      nrm[o * 3] = cs * nx + sn * nz; nrm[o * 3 + 1] = ny; nrm[o * 3 + 2] = -sn * nx + cs * nz;
      const r = c.col[i * stride], g = c.col[i * stride + 1], b = c.col[i * stride + 2];
      if (gl) { const m = Math.max(r, g, b); col[o * stride] = gl.r * m; col[o * stride + 1] = gl.g * m; col[o * stride + 2] = gl.b * m; }
      else { col[o * stride] = tr ? r * tr.r : r; col[o * stride + 1] = tr ? g * tr.g : g; col[o * stride + 2] = tr ? b * tr.b : b; }
      if (stride === 4) col[o * 4 + 3] = c.col[i * 4 + 3];
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, stride));
  g.computeBoundingSphere();
  return g;
}

/** Merge placed pieces into one lit body geometry, one glow geometry and one light-beam geometry (each null when empty). Caller disposes. */
export function buildKitV3Static(kit: KitV3Data, items: KitV3Item[]): { body: BufferGeometry | null; glow: BufferGeometry | null; shaft: BufferGeometry | null } {
  return { body: merge(kit, items, 'body'), glow: merge(kit, items, 'glow'), shaft: merge(kit, items, 'shaft') };
}

// ------------------------------------------------------------------ materials (shared by every user of the kit)
let _lit: MeshStandardMaterial | null = null, _glow: MeshBasicMaterial | null = null, _shaft: MeshBasicMaterial | null = null;
/** Shared lit material of the kit's static pieces (vertex colours, smooth shading: the pieces carry their own normals). */
export function kitV3Lit(): MeshStandardMaterial { return (_lit ??= litMat({ roughness: 0.88, flatShading: false })); }
/** Shared unlit emissive material for window_glow / rune_glow (fire, candles, glass). */
export function kitV3Glow(): MeshBasicMaterial { return (_glow ??= new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.1, 1.06, 1.0) })); }
/** Shared additive beam material for light_shaft (COLOR_0 alpha = soft falloff). */
export function kitV3Shaft(): MeshBasicMaterial {
  return (_shaft ??= new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide, color: new Color(0.22, 0.2, 0.15) }));
}

/** A room's static kit pieces merged into as few draw calls as possible (lit body + emissive glow + beams = 3). */
export function KitV3Static({ items, cast = true, receive = true, glow, lit }: { items: KitV3Item[]; cast?: boolean; receive?: boolean; glow?: Material; lit?: Material }) {
  const kit = useKitV3();
  const geo = useMemo(() => buildKitV3Static(kit, items), [kit, items]);
  useEffect(() => () => { geo.body?.dispose(); geo.glow?.dispose(); geo.shaft?.dispose(); }, [geo]);
  return (
    <>
      {geo.body && <mesh geometry={geo.body} material={lit ?? kitV3Lit()} castShadow={cast} receiveShadow={receive} />}
      {geo.glow && <mesh geometry={geo.glow} material={glow ?? kitV3Glow()} />}
      {geo.shaft && <mesh geometry={geo.shaft} material={kitV3Shaft()} renderOrder={3} />}
    </>
  );
}
