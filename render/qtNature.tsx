// ============================================================================
// Quaternius nature pieces (CC0, public/models/nature_qt.glb, art/blender/quaternius_nature.py): trees (CommonTree / Pine / TwistedTree / DeadTree),
// bushes, flowers, ferns, grass, clover, mushrooms, pebbles, rocks. Textured alpha-cutout cards, so they cannot share the kit's vertex-colour batch:
// every GLB material becomes ONE shared MeshStandardMaterial (the texture x a tint x a vertex-colour gradient, alphaTest for the cutouts), and every
// material gets ONE BatchedMesh holding all its pieces (so the whole town + forest is ~12 draw calls; frustum culled per instance). Without
// WEBGL_multi_draw it falls back to chunked instancing (<Inst>, 48 m chunks). Placement tables name pieces `qt_<node>` (engine/qtData.ts).
// Leaf cards get soft radial normals (the canopy shades like one ball, not like 400 flat cards) and never flip them on the back face.
// ============================================================================
import React, { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { BatchedMesh, BufferGeometry, Color, DoubleSide, Euler, Float32BufferAttribute, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { BASE } from './models';
import { Inst } from './Inst';
import { setInst } from './util';
import { QT_PREFIX, qtNode } from '../engine/qtData';
import type { Place } from './natureKit';

export const QT_URL = `${BASE}models/nature_qt.glb`;

/** how each GLB material is shaded: colour multiplier (linear, >1 brightens the dull source textures), leaf cards (radial normals + gradient), cutout */
interface MatCfg { color: [number, number, number]; leaf?: 'ball' | 'up'; cut?: boolean; grad?: [number, number] }
const MAT_CFG: Record<string, MatCfg> = {
  Bark_NormalTree: { color: [1.5, 1.4, 1.3], grad: [0.8, 1.05] },
  Bark_TwistedTree: { color: [1.55, 1.45, 1.55], grad: [0.8, 1.05] },
  Bark_DeadTree: { color: [1.6, 1.5, 1.4], grad: [0.8, 1.05] },
  Leaves_NormalTree: { color: [2.5, 3.1, 4], leaf: 'ball', cut: true, grad: [0.78, 1.28] },
  Leaves_TwistedTree: { color: [1.5, 20, 60], leaf: 'ball', cut: true, grad: [0.8, 1.25] },   // (the source leaf is crimson: an orchid-purple canopy reads cute, not gory)
  Leaves_Pine: { color: [3.0, 3.8, 4], leaf: 'ball', cut: true, grad: [0.78, 1.25] },
  Leaves_Bush: { color: [0.45, 60, 6], leaf: 'ball', cut: true, grad: [0.8, 1.2] },
  Leaves: { color: [1.25, 1.25, 1.25], leaf: 'up', cut: true, grad: [0.9, 1.1] },
  Flowers: { color: [1.2, 1.2, 1.2], leaf: 'up', cut: true },
  Grass: { color: [1.3, 1.4, 1.2], leaf: 'up', cut: true, grad: [0.85, 1.15] },
  Mushrooms: { color: [1.25, 1.2, 1.2] },
  Rocks: { color: [2.4, 2.35, 2.15], grad: [0.85, 1.05] },
  PathRocks: { color: [1.4, 1.4, 1.4] },
};

/** per piece: matName -> geometry (non-indexed; position / normal / uv / color) */
export interface QtKit { P: Record<string, Record<string, BufferGeometry>>; mats: Record<string, MeshStandardMaterial> }
const cache: { kit: QtKit | null } = { kit: null };
const _v = new Vector3(), _c = new Color();

function bake(scene: Object3D): QtKit {
  scene.updateMatrixWorld(true);
  const P: Record<string, Record<string, BufferGeometry>> = {}, mats: Record<string, MeshStandardMaterial> = {};
  const parts: Record<string, Record<string, BufferGeometry[]>> = {};
  scene.traverse((o) => {
    const m = o as Mesh; if (!m.isMesh) return;
    // the piece = the root-level node above this mesh (a multi-material piece is a group of one mesh per material)
    let k: Object3D = m; while (k.parent && k.parent !== scene) k = k.parent;
    const piece = k.name;
    const mt = m.material as MeshStandardMaterial, mname = (mt.name || '').split('.')[0];
    if (!MAT_CFG[mname]) return;
    if (!mats[mname]) {
      const cfg = MAT_CFG[mname];
      const lit = new MeshStandardMaterial({ map: mt.map, vertexColors: true, roughness: 0.92, metalness: 0, alphaTest: cfg.cut ? 0.5 : 0 });
      if (cfg.cut) lit.side = DoubleSide;
      lit.color.setRGB(cfg.color[0], cfg.color[1], cfg.color[2]);
      if (cfg.leaf === 'ball') {   // the back of a card keeps the front's normal: the canopy lights as one soft ball
        lit.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'); };
        lit.customProgramCacheKey = () => 'qtLeafBall';
      }
      mats[mname] = lit;
    }
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), g = new BufferGeometry();
    const n = src.attributes.position.count, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const nm = new Matrix4().copy(m.matrixWorld);
    // the piece's own transform is the node's local matrix (identity from the converter); bake the mesh's world matrix relative to the piece root
    const rel = new Matrix4(); if (k !== m) rel.copy(k.matrixWorld).invert().multiply(m.matrixWorld); else rel.copy(nm);
    let cx = 0, cy = 0, cz = 0, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(src.attributes.position, i).applyMatrix4(rel);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; cx += _v.x; cy += _v.y; cz += _v.z; minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
      uv[i * 2] = src.attributes.uv.getX(i); uv[i * 2 + 1] = src.attributes.uv.getY(i);
    }
    cx /= n; cy /= n; cz /= n;
    const cfg = MAT_CFG[mname], H = Math.max(0.01, maxY - minY);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], t = Math.min(1, Math.max(0, y / (H * 1.1)));
      if (cfg.leaf === 'ball') {   // radial + a little up, so the top catches the sun and the underside stays soft
        _v.set(x - cx, (y - cy) * 0.85 + H * 0.12, z - cz).normalize();
        nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z;
      } else if (cfg.leaf === 'up') {
        _v.set((x - cx) * 0.25, 1, (z - cz) * 0.25).normalize();
        nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z;
      } else {
        _v.fromBufferAttribute(src.attributes.normal, i).transformDirection(rel);
        nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z;
      }
      const gr = cfg.grad ? cfg.grad[0] + (cfg.grad[1] - cfg.grad[0]) * t : 1;
      col[i * 3] = gr; col[i * 3 + 1] = gr; col[i * 3 + 2] = gr * (cfg.leaf === 'ball' ? 0.94 : 1);
    }
    src.dispose();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('color', new Float32BufferAttribute(col, 3));
    ((parts[piece] ??= {})[mname] ??= []).push(g);
  });
  for (const [piece, byMat] of Object.entries(parts)) {
    P[piece] = {};
    for (const [mname, list] of Object.entries(byMat)) {
      let g = list[0];
      if (list.length > 1) { g = new BufferGeometry(); for (const a of ['position', 'normal', 'uv', 'color'] as const) { let len = 0; for (const q of list) len += q.attributes[a].array.length; const arr = new Float32Array(len); let o = 0; for (const q of list) { arr.set(q.attributes[a].array as Float32Array, o); o += q.attributes[a].array.length; } g.setAttribute(a, new Float32BufferAttribute(arr, a === 'uv' ? 2 : 3)); } }
      g.computeBoundingSphere(); g.name = 'qt:' + piece + ':' + mname;
      P[piece][mname] = g;
    }
  }
  return { P, mats };
}

/** The baked kit (loaded once; suspends until the GLB is in). */
export function useQtKit(): QtKit {
  const gltf = useGLTF(QT_URL);
  return useMemo(() => (cache.kit ??= bake(gltf.scene)), [gltf]);
}
useGLTF.preload(QT_URL);

// ------------------------------------------------------------------ drawing
const _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _m = new Matrix4();
const matOf = (p: Place): Matrix4 => { _q.setFromEuler(_e.set(0, p.ry, 0)); return _m.compose(_p.set(p.x, p.y ?? 0, p.z), _q, _s.set(p.sx, p.sy, p.sz)); };

/** Piece -> places (names `qt_<node>`) as ONE BatchedMesh per GLB material. `tint` multiplies every material (run rooms tint scenery per biome). */
export function QtBatch({ sets, shadows, tint }: { sets: Map<string, Place[]>; shadows: boolean; tint?: string }) {
  const kit = useQtKit();
  const gl = useThree((s) => s.gl);
  const multi = useMemo(() => !!gl.extensions.has('WEBGL_multi_draw'), [gl]);
  const mats = useMemo(() => {
    if (!tint) return kit.mats;
    const t = new Color(tint), out: Record<string, MeshStandardMaterial> = {};
    for (const [k, m] of Object.entries(kit.mats)) { const c = m.clone(); c.color.multiply(t); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; out[k] = c; }
    return out;
  }, [kit, tint]);
  useEffect(() => () => { if (mats !== kit.mats) for (const m of Object.values(mats)) m.dispose(); }, [mats, kit]);
  // pieces by material: material -> [[geometry, places]]
  const byMat = useMemo(() => {
    const out = new Map<string, [BufferGeometry, Place[]][]>();
    sets.forEach((places, name) => {
      if (!places.length || !name.startsWith(QT_PREFIX)) return;
      const pc = kit.P[qtNode(name)]; if (!pc) return;
      for (const [mn, g] of Object.entries(pc)) { let l = out.get(mn); if (!l) out.set(mn, (l = [])); l.push([g, places]); }
    });
    return out;
  }, [sets, kit]);
  const [batches, setBatches] = React.useState<BatchedMesh[] | null>(null);
  useEffect(() => {
    if (!multi) { setBatches(null); return; }
    const made: BatchedMesh[] = [];
    byMat.forEach((list, mn) => {
      let nI = 0, nV = 0;
      for (const [g, pl] of list) { nI += pl.length; nV += g.attributes.position.count; }
      const b = new BatchedMesh(nI, nV, 0, mats[mn]);
      for (const [g, pl] of list) { const gid = b.addGeometry(g); for (const p of pl) b.setMatrixAt(b.addInstance(gid), matOf(p)); }
      b.sortObjects = false; b.perObjectFrustumCulled = true; b.frustumCulled = false; b.castShadow = shadows; b.receiveShadow = shadows && !MAT_CFG[mn]?.leaf;   // (leaf cards self-shadow into mud: they cast, they do not receive)
      made.push(b);
    });
    setBatches(made);
    return () => { for (const b of made) b.dispose(); };
  }, [multi, byMat, mats, shadows]);
  if (multi) return <group>{batches?.map((b, i) => <primitive key={i} object={b} />)}</group>;
  return (
    <group>
      {Array.from(byMat.entries()).flatMap(([mn, list]) => list.map(([g, pl], i) => <QtSet key={mn + i + g.name} geo={g} places={pl} mat={mats[mn]} shadows={shadows} receive={shadows && !MAT_CFG[mn]?.leaf} />))}
    </group>
  );
}
function QtSet({ geo, places, mat, shadows, receive }: { geo: BufferGeometry; places: Place[]; mat: Material; shadows: boolean; receive: boolean }) {
  const fill = useMemo(() => (m: import('three').InstancedMesh) => { places.forEach((p, i) => setInst(m, i, p.x, p.y ?? 0, p.z, p.ry, p.sx, p.sy, p.sz)); m.count = places.length; }, [places]);
  return <Inst geo={geo} mat={mat} count={places.length} fill={fill} cast={shadows} receive={receive} chunk={48} />;
}
