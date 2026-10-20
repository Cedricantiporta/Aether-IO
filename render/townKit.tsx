// ============================================================================
// Town kit (Blender-modelled, Higgsfield 3D Jutsu project "Aether Town Kit"): public/models/town/town_kit.glb.
// Each named node (house_s, house_l, house_w, house_g1, house_g2, wall_seg, tower_mid, tower_corner, gate, ...) is baked
// once into a lit body geometry (material base colour -> vertex colour, for litMat) and an emissive glow geometry
// (material "k_glow": windows / lanterns, drawn with the nightGlow material). Pieces are placed with <Inst>
// (chunked + culled instancing) using the existing townData placement arrays. Kit front = +Z (door side), metres.
// ============================================================================
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Material, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { setInst } from './util';
import { HOUSES, WALL_RUNS, WALL_TOWERS, GATE, type HouseSpec } from '../engine/townData';

const KIT_URL = `${BASE}models/town/town_kit.glb`;
export interface KitPiece { body: BufferGeometry; glow: BufferGeometry | null }
let cache: Record<string, KitPiece> | null = null;

function bakeKit(scene: any): Record<string, KitPiece> {
  const out: Record<string, KitPiece> = {};
  scene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh;
    const name = (m.parent && m.parent.type !== 'Scene' && m.parent.name ? m.parent.name : m.name).replace(/_\d+$/, '');
    const g = m.geometry.clone().toNonIndexed();
    const mat = m.material as MeshStandardMaterial;
    const c = mat.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    const isGlow = (mat.name || '').includes('glow');
    const e = (out[name] ??= { body: null as any, glow: null }) as any;
    (e[isGlow ? '_g' : '_b'] ??= []).push(g);
  });
  for (const k of Object.keys(out)) {
    const e = out[k] as any;
    e.body = e._b ? mergeGeometries(e._b, false) : new BufferGeometry();
    e.glow = e._g ? mergeGeometries(e._g, false) : null;
    e.body.computeBoundingSphere(); e.glow?.computeBoundingSphere();
    delete e._b; delete e._g;
  }
  return out;
}

export function useTownKit(): Record<string, KitPiece> {
  const gltf = useGLTF(KIT_URL);
  return useMemo(() => (cache ??= bakeKit(gltf.scene)), [gltf]);
}

/** Kit footprint (x = width, z = depth) per house variant, used to scale to each HouseSpec. */
const HOUSE_KIT: Record<string, [number, number]> = { house_s: [5.0, 4.4], house_l: [5.6, 4.6], house_w: [7.0, 4.6], house_g1: [4.6, 5.6], house_g2: [5.0, 6.0] };
/** Barn + coop (indices 0, 1) keep their own procedural look. */
export const KIT_HOUSE_FROM = 2;
export function houseVariant(h: HouseSpec, i: number): string {
  if (h.floors === 2) return i % 2 ? 'house_l' : 'house_g2';
  if (h.w >= 5.6) return 'house_w';
  return i % 2 ? 'house_s' : 'house_g1';
}

type Place = { x: number; y?: number; z: number; ry: number; sx: number; sy: number; sz: number };
function placements(): Record<string, Place[]> {
  const P: Record<string, Place[]> = {};
  const add = (k: string, p: Place) => (P[k] ??= []).push(p);
  HOUSES.forEach((h, i) => {
    if (i < KIT_HOUSE_FROM) return;
    const v = houseVariant(h, i), [kw, kd] = HOUSE_KIT[v];
    const sx = h.w / kw, sz = h.d / kd;
    add(v, { x: h.x, z: h.z, ry: h.rot, sx, sz, sy: (sx + sz) / 2 });
  });
  for (const [x1, z1, x2, z2, ox, oz] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 4)), L = len / n;
    const ry = Math.atan2(ox, oz);   // local +Z (merlon side) faces outward
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      add('wall_seg', { x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, ry, sx: (L + 0.02) / 4, sy: 1, sz: 1 });
    }
  }
  for (const t of WALL_TOWERS) {
    const k = t.corner ? 'tower_corner' : 'tower_mid', s = t.r / (t.corner ? 3.6 : 3.1);
    add(k, { x: t.x, z: t.z, ry: 0, sx: s, sy: s, sz: s });
  }
  add('gate', { x: GATE.x, z: GATE.z, ry: 0, sx: 1, sy: 1, sz: 1 });
  return P;
}

/** All kit pieces of the walled town (houses, wall runs, towers, gate), instanced per piece (body + glow). */
export function TownKit({ lit, glow, shadows }: { lit: Material; glow: Material; shadows: boolean }) {
  const kit = useTownKit();
  const P = useMemo(placements, []);
  const fills = useMemo(() => {
    const f: Record<string, (m: InstancedMesh) => void> = {};
    for (const k of Object.keys(P)) f[k] = (m: InstancedMesh) => { P[k].forEach((p, i) => setInst(m, i, p.x, p.y ?? 0, p.z, p.ry, p.sx, p.sy, p.sz)); m.count = P[k].length; };
    return f;
  }, [P]);
  return (
    <group>
      {Object.keys(P).map((k) => kit[k] && (
        <React.Fragment key={k}>
          <Inst geo={kit[k].body} mat={lit} count={P[k].length} fill={fills[k]} cast={shadows} receive={shadows} />
          {kit[k].glow && <Inst geo={kit[k].glow!} mat={glow} count={P[k].length} fill={fills[k]} />}
        </React.Fragment>
      ))}
    </group>
  );
}
useGLTF.preload(KIT_URL);
