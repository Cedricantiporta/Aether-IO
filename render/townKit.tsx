// ============================================================================
// Town kit v2 (Blender-modelled, art/blender/town_kit_v2.py): public/models/town/town_kit_v2.glb.
// 17 named pieces, each at the origin with its front on +Z (houses, shop, tavern, chapel, keep, wall segment, gatehouse + lamp,
// banner, planter, market stall, barrel, crate, fountain), 12 shared flat materials (window_glow is emissive). The GLB is
// meshopt-compressed AND quantized: positions are normalised int16 and the node transform carries the real size, so every mesh
// is baked with its full world matrix. Each piece becomes one lit body geometry (material colour -> vertex colour, for litMat)
// and one emissive glow geometry (window_glow: drawn with the nightGlow material), then is placed with <Inst> (chunked + culled
// instancing). Everything is static: filled once, no per-frame work.
// The two round wall towers still come from the old kit (town_kit.glb): v2 has no tower piece.
// ============================================================================
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, Euler, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { setInst } from './util';
import { kitColor } from './townPalette';
import {
  HOUSES, WALL_RUNS, WALL_TOWERS, GATE, CASTLE, CASTLE_S, CHURCH, TAVERN, TAVERN_DZ, TERRACE, WELL_POS, STALLS, LAMPS, PLANTERS, SHOP_GAPS, SHOP_ROW_Z, PLAZA,
  townLift,
} from '../engine/townData';
import { SHOP_POSITIONS } from '../constants';

const V1_URL = `${BASE}models/town/town_kit.glb`;
const V2_URL = `${BASE}models/town/town_kit_v2.glb`;
export interface KitPiece { body: BufferGeometry; glow: BufferGeometry | null }
type Kit = Record<string, KitPiece>;
const cache = new Map<string, Kit>();

/** Old kit only: where each piece was built in its Blender scene (Blender x, y), so it can be moved back to the origin. */
const V1_LOC: Record<string, [number, number]> = { tower_mid: [14, 16], tower_corner: [28, 16] };

function bakeKit(scene: any, loc: Record<string, [number, number]> | null): Kit {
  const out: Kit = {};
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh;
    const name = (m.parent && m.parent.type !== 'Scene' && m.parent.name ? m.parent.name : m.name).replace(/_\d+$/, '');
    const src = m.geometry.toNonIndexed(), g = new BufferGeometry();
    // de-quantize (int16 normalized -> float) BEFORE transforming, or world-space values get clamped to [-1, 1]
    for (const a of ['position', 'normal'] as const) {
      const at = src.attributes[a]; if (!at) continue;
      const f = new Float32Array(at.count * 3);
      for (let i = 0; i < at.count; i++) { f[i * 3] = at.getX(i); f[i * 3 + 1] = at.getY(i); f[i * 3 + 2] = at.getZ(i); }
      g.setAttribute(a, new Float32BufferAttribute(f, 3));
    }
    g.applyMatrix4(m.matrixWorld);
    const l = loc?.[name];
    if (l) g.translate(-l[0], 0, l[1]);   // Blender (x, y) -> glTF (x, -z)
    const mat = m.material as MeshStandardMaterial;
    const c = kitColor(mat.name) ?? mat.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const isGlow = (mat.name || '').includes('glow');
    const e = (out[name] ??= { body: null as any, glow: null }) as any;
    (e[isGlow ? '_g' : '_b'] ??= []).push(g);
    src.dispose();
  });
  for (const k of Object.keys(out)) {
    const e = out[k] as any;
    e.body = e._b ? mergeGeometries(e._b, false) : new BufferGeometry();
    e.glow = e._g ? mergeGeometries(e._g, false) : null;
    e.body.computeBoundingSphere(); e.glow?.computeBoundingSphere();
    for (const g of [...(e._b ?? []), ...(e._g ?? [])]) g.dispose();
    delete e._b; delete e._g;
  }
  return out;
}

function useKit(url: string, loc: Record<string, [number, number]> | null): Kit {
  const gltf = useGLTF(url);
  return useMemo(() => { let k = cache.get(url); if (!k) { k = bakeKit(gltf.scene, loc); cache.set(url, k); } return k; }, [gltf, url, loc]);
}

/** Shop types drawn by a v2 shop_stall_house (the Brewer / Fishmonger / Mining stalls keep their own look). */
export const KIT_SHOPS = new Set(['SUPPLIES', 'BLACKSMITH', 'PETS', 'ARMORY', 'FORTUNE', 'WAREHOUSE', 'TECH']);
/** Barn + coop (HOUSES 0, 1) keep their procedural look; every other house is a v2 piece. */
export const KIT_HOUSE_FROM = 2;

type Place = { x: number; y?: number; z: number; ry: number; sx: number; sy: number; sz: number };
/** A piece of a placement set: `v` = which kit file. */
const key = (v: 1 | 2, name: string) => `${v}:${name}`;
const _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _m = new Matrix4();

/** Every placement of the walled town, by piece. All static scenery of the town kit lives here so the lists stay next to each other. */
function placements(): Record<string, Place[]> {
  const P: Record<string, Place[]> = {};
  const add = (v: 1 | 2, k: string, p: Place) => (P[key(v, k)] ??= []).push(p);
  const lift = (x: number, z: number) => townLift(x, z);
  // houses (fronts south)
  HOUSES.forEach((h, i) => { if (i >= KIT_HOUSE_FROM && h.kit) { const s = h.s ?? 1; add(2, h.kit, { x: h.x, y: lift(h.x, h.z), z: h.z, ry: h.rot, sx: s, sy: s, sz: s }); } });
  // the shop row
  for (const sp of SHOP_POSITIONS) if (KIT_SHOPS.has(sp.type)) add(2, 'shop_stall_house', { x: sp.position[0], y: lift(sp.position[0], sp.position[2]), z: sp.position[2], ry: sp.rot ?? 0, sx: 1, sy: 1, sz: 1 });
  // landmarks
  add(2, 'tavern', { x: TAVERN.x, y: lift(TAVERN.x, TAVERN.z), z: TAVERN.z + TAVERN_DZ, ry: 0, sx: 1, sy: 1, sz: 1 });
  add(2, 'chapel', { x: CHURCH.x, y: lift(CHURCH.x, CHURCH.z), z: CHURCH.z, ry: 0, sx: 1, sy: 1, sz: 1 });
  add(2, 'castle_keep', { x: CASTLE.x, y: TERRACE.h, z: CASTLE.z, ry: 0, sx: CASTLE_S, sy: CASTLE_S, sz: CASTLE_S });
  add(2, 'castle_gatehouse', { x: GATE.x, z: GATE.z, ry: 0, sx: 1.15, sy: 1.15, sz: 1.15 });
  // town wall: v2 segments (6 m, thickness 1.6 -> x1.5 = 2.4, height 4.65 -> x1.2) + the old round towers
  for (const [x1, z1, x2, z2, ox, oz] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 5)), L = len / n, ry = Math.atan2(ox, oz);   // local +Z (outer face) faces outward
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; add(2, 'castle_wall_segment', { x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, ry, sx: (L + 0.04) / 6, sy: 1.2, sz: 1.5 }); }
  }
  for (const t of WALL_TOWERS) { const s = (t.r / (t.corner ? 3.6 : 3.1)) * 0.85; add(1, t.corner ? 'tower_corner' : 'tower_mid', { x: t.x, z: t.z, ry: 0, sx: s, sy: s, sz: s }); }
  // street furniture
  for (const [x, z] of LAMPS) if (z < 46 && z > -40 && Math.abs(x) < 44) add(2, 'lamp_post', { x, y: lift(x, z), z, ry: 0, sx: 0.72, sy: 0.72, sz: 0.72 });
  for (const p of PLANTERS) { const along = p.w >= p.d, len = Math.max(p.w, p.d), wid = Math.min(p.w, p.d); add(2, 'flower_planter', { x: p.x, y: lift(p.x, p.z), z: p.z, ry: along ? 0 : Math.PI / 2, sx: len / 1.7, sy: 1, sz: wid / 0.9 }); }
  for (const s of STALLS) add(2, 'market_stall', { x: s.x, y: lift(s.x, s.z), z: s.z, ry: s.rot, sx: 1, sy: 1, sz: 1 });
  add(2, 'fountain_small', { x: WELL_POS.x, y: lift(WELL_POS.x, WELL_POS.z), z: WELL_POS.z, ry: 0, sx: 1, sy: 1, sz: 1 });
  for (const [x, z, s] of BANNERS) add(2, 'banner', { x, y: lift(x, z), z, ry: 0, sx: s, sy: s, sz: s });
  return P;
}

/** v2 banner poles: castle steps, the gate, the plaza's north rim, the avenue mouth. [x, z, scale] (fronts face the camera). */
const BANNERS: [number, number, number][] = [
  [-5.4, -19.6, 0.8], [5.4, -19.6, 0.8],
  [-8.2, 41.6, 0.9], [8.2, 41.6, 0.9],
  [-4.9, -3.2, 0.7], [4.9, -3.2, 0.7],
  [-3.9, 11.6, 0.7], [3.9, 11.6, 0.7],
];

/** Barrel + crate clusters (one merged geometry, one instanced draw): [x, z, ry]. In the gaps of the shop row, by the stalls, at the gate. */
function clutterSpots(): number[][] {
  const P: number[][] = [];
  for (const gx of SHOP_GAPS) P.push([gx, SHOP_ROW_Z + 0.2, gx * 1.7]);
  for (const s of STALLS) P.push([s.x + 2.7, s.z + 0.4, s.rot + 0.4]);
  P.push([PLAZA.x - 9.8, PLAZA.z + 6.6, 0.5], [PLAZA.x + 9.8, PLAZA.z + 6.4, -0.4]);
  P.push([GATE.x - 11.2, GATE.z + 3.6, 0.3], [GATE.x + 11.2, GATE.z + 3.6, 2.6]);
  return P;
}

/** One cluster of the kit's barrel + crate pieces, merged into a single geometry (body only: both are plain wood). */
function buildClutter(kit: Kit): BufferGeometry | null {
  const barrel = kit.barrel?.body, crate = kit.crate?.body;
  if (!barrel || !crate) return null;
  const parts: BufferGeometry[] = [];
  const put = (g: BufferGeometry, x: number, y: number, z: number, ry: number, s: number) => {
    _q.setFromEuler(_e.set(0, ry, 0)); _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
    parts.push(g.clone().applyMatrix4(_m));
  };
  put(barrel, 0, 0, 0, 0.3, 0.95); put(barrel, 0.95, 0, 0.15, 1.2, 0.9); put(barrel, 0.45, 0, -0.85, 2.0, 0.9);
  put(crate, -0.95, 0, 0.1, 0.35, 0.95); put(crate, -0.85, 0.85, 0.1, -0.2, 0.75);
  const g = mergeGeometries(parts, false); parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** All kit pieces of the walled town, instanced per piece (body + glow). */
export function TownKit({ lit, glow, shadows }: { lit: Material; glow: Material; shadows: boolean }) {
  const k1 = useKit(V1_URL, V1_LOC), k2 = useKit(V2_URL, null);
  const sets = useMemo(() => {
    const P = placements();
    const list = Object.keys(P).map((k) => {
      const [v, name] = k.split(':'), piece = (v === '1' ? k1 : k2)[name];
      return piece ? { k, piece, places: P[k], fill: (m: InstancedMesh) => { P[k].forEach((p, i) => setInst(m, i, p.x, p.y ?? 0, p.z, p.ry, p.sx, p.sy, p.sz)); m.count = P[k].length; } } : null;
    }).filter(Boolean) as { k: string; piece: KitPiece; places: Place[]; fill: (m: InstancedMesh) => void }[];
    const spots = clutterSpots(), cg = buildClutter(k2);
    const clutter = cg ? { geo: cg, n: spots.length, fill: (m: InstancedMesh) => { spots.forEach((s, i) => setInst(m, i, s[0], townLift(s[0], s[1]), s[1], s[2], 1, 1, 1)); m.count = spots.length; } } : null;
    return { list, clutter };
  }, [k1, k2]);
  return (
    <group>
      {sets.list.map((s) => (
        <React.Fragment key={s.k}>
          <Inst geo={s.piece.body} mat={lit} count={s.places.length} fill={s.fill} cast={shadows} receive={shadows} />
          {s.piece.glow && <Inst geo={s.piece.glow} mat={glow} count={s.places.length} fill={s.fill} />}
        </React.Fragment>
      ))}
      {sets.clutter && <Inst geo={sets.clutter.geo} mat={lit} count={sets.clutter.n} fill={sets.clutter.fill} cast={false} receive={shadows} />}
    </group>
  );
}
useGLTF.preload(V1_URL);
useGLTF.preload(V2_URL);

/** v2 shop_stall_house geometry for the Shop component (render/Town.tsx): the chimney top, in shop-local metres, for the smoke FX. */
export const SHOP_CHIMNEY: [number, number, number] = [1.6, 6.3, -0.5];
