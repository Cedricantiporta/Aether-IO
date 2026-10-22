// ============================================================================
// Town kit v2 (Blender-modelled, art/blender/town_kit_v2.py): public/models/town/town_kit_v2.glb.
// 17 named pieces, each at the origin with its front on +Z (houses, shop, tavern, chapel, keep, wall segment, gatehouse + lamp,
// banner, planter, market stall, barrel, crate, fountain), 12 shared flat materials (window_glow is emissive). The GLB is
// meshopt-compressed AND quantized: positions are normalised int16 and the node transform carries the real size, so every mesh
// is baked with its full world matrix. Each piece becomes one lit body geometry (material colour -> vertex colour, for litMat)
// and one emissive glow geometry (window_glow: drawn with the nightGlow material), then is placed with <Inst> (chunked + culled
// instancing). Everything is static: filled once, no per-frame work.
// (the round wall towers, the gate towers, bridges, tents and every other kit v3 piece are placed by render/natureLayout.ts + render/NatureBatch.tsx; the gate arch is
//  render/TownScenery buildGateArch: the v2 gatehouse had a solid black plug in its arch.)
// ============================================================================
import React, { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, Euler, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { cullRegister } from './distCull';
import { setInst } from './util';
import { kitColor } from './townPalette';
import {
  HOUSES, WALL_RUNS, WALL_TOWERS, GATE, CASTLE, CASTLE_S, CHURCH, TAVERN, TAVERN_DZ, TERRACE, WELL_POS, STALLS, LAMPS, PLANTERS, SHOP_LOOK, shopLocal,
  townLift,
} from '../engine/townData';
import { SHOP_POSITIONS } from '../constants';
import { CLUTTER_SPOTS } from '../engine/townFill';
import { BARRIERS, type Barrier } from '../engine/townBarriers';

/** chunk edge of the town kit's instanced sets (the dense town has many more pieces: fewer, larger chunks keep the draw calls down; the camera only sees ~25 m anyway) */
const CHUNK_V2 = 24;
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

/** Shop types drawn by a v2 shop_stall_house (the outskirts Fishmonger + Mining Supplies stalls too; the Elixir Brewer's hut is nature_kit_v1 'brewer_hut', render/NatureScenery.tsx). */
export const KIT_SHOPS = new Set(['SUPPLIES', 'BLACKSMITH', 'PETS', 'ARMORY', 'FORTUNE', 'WAREHOUSE', 'TECH', 'FISH', 'MINE']);

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
  HOUSES.forEach((h) => { if (h.kit) { const s = h.s ?? 1; add(2, h.kit, { x: h.x, y: lift(h.x, h.z), z: h.z, ry: h.rot, sx: s, sy: s, sz: s }); } });
  // the shop row
  for (const sp of SHOP_POSITIONS) if (KIT_SHOPS.has(sp.type)) add(2, 'shop_stall_house', { x: sp.position[0], y: lift(sp.position[0], sp.position[2]), z: sp.position[2], ry: sp.rot ?? 0, sx: 1, sy: 1, sz: 1 });
  // each town shop's own extras: more building pieces + props around the counter (engine/townData SHOP_LOOK, piece names; shop-local frame)
  for (const sp of SHOP_POSITIONS) {
    const L = SHOP_LOOK[sp.type]; if (!L) continue;
    for (const [piece, dx, dz, yaw, s] of [...L.extra, ...L.dress]) { const [x, z] = shopLocal(sp.position[0], sp.position[2], sp.rot ?? 0, dx, dz); add(2, piece, { x, y: lift(x, z), z, ry: (sp.rot ?? 0) + yaw, sx: s, sy: s, sz: s }); }
  }
  // landmarks
  add(2, 'tavern', { x: TAVERN.x, y: lift(TAVERN.x, TAVERN.z), z: TAVERN.z + TAVERN_DZ, ry: 0, sx: 1, sy: 1, sz: 1 });
  add(2, 'chapel', { x: CHURCH.x, y: lift(CHURCH.x, CHURCH.z), z: CHURCH.z, ry: 0, sx: 1, sy: 1, sz: 1 });
  add(2, 'castle_keep', { x: CASTLE.x, y: TERRACE.h, z: CASTLE.z, ry: 0, sx: CASTLE_S, sy: CASTLE_S, sz: CASTLE_S });
  // town wall: v2 segments (6 m, thickness 1.6 -> x1.5 = 2.4, height 4.65 -> x1.2) + the old round towers
  for (const [x1, z1, x2, z2, ox, oz] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 5)), L = len / n, ry = Math.atan2(ox, oz);   // local +Z (outer face) faces outward
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; add(2, 'castle_wall_segment', { x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, ry, sx: (L + 0.04) / 6, sy: 1.2, sz: 1.5 }); }
  }
  // street furniture
  for (const [x, z] of LAMPS) if (z < 46 && z > -40 && Math.abs(x) < 44) add(2, 'lamp_post', { x, y: lift(x, z), z, ry: 0, sx: 0.72, sy: 0.72, sz: 0.72 });
  for (const p of PLANTERS) { const along = p.w >= p.d, len = Math.max(p.w, p.d), wid = Math.min(p.w, p.d); add(2, 'flower_planter', { x: p.x, y: lift(p.x, p.z), z: p.z, ry: along ? 0 : Math.PI / 2, sx: len / 1.7, sy: 1, sz: wid / 0.9 }); }
  for (const s of STALLS) add(2, 'market_stall', { x: s.x, y: lift(s.x, s.z), z: s.z, ry: s.rot, sx: 1, sy: 1, sz: 1 });
  add(2, 'fountain_small', { x: WELL_POS.x, y: lift(WELL_POS.x, WELL_POS.z), z: WELL_POS.z, ry: 0, sx: 1, sy: 1, sz: 1 });
  for (const [x, z, s] of BANNERS) add(2, 'banner', { x, y: lift(x, z), z, ry: 0, sx: s, sy: s, sz: s });
  return P;
}

/** v2 banner poles: castle steps, the gate, the avenue mouth. [x, z, scale] (fronts face the camera). */
const BANNERS: [number, number, number][] = [
  [-5.4, -19.6, 0.8], [5.4, -19.6, 0.8],
  [-8.2, 41.6, 0.9], [8.2, 41.6, 0.9],
  [-3.9, 11.6, 0.7], [3.9, 11.6, 0.7],
];

/** Barrel + crate clusters (one merged geometry, one instanced draw): [x, z, ry]. In the gaps of the shop row, by the stalls, at the gate. */
function clutterSpots(): number[][] {
  const P: number[][] = CLUTTER_SPOTS.map((c) => [c[0], c[1], c[2]]);   // (engine/townFill.ts: only the spots that fit, each one solid)
  for (const s of STALLS) if (Math.abs(s.x) > 8) P.push([s.x + 2.7, s.z + 0.4, s.rot + 0.4]);
  for (const sp of SHOP_POSITIONS) { const L = SHOP_LOOK[sp.type]; if (L) for (const [dx, dz, yaw] of L.cluster) { const [x, z] = shopLocal(sp.position[0], sp.position[2], sp.rot ?? 0, dx, dz); P.push([x, z, yaw]); } }
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


// ---- street-edge barriers (engine/townBarriers.ts): wooden plant boxes with greenery + flowers, trimmed flowering hedges, low stone walls.
// Procedural + vertex-coloured (like the kit pieces), baked into the same 32 m chunks as the other light pieces: no extra draw calls beyond the chunk meshes.
const hash1 = (a: number, b: number, c = 0): number => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const FLOWER_COLS = ['#ff8fb1', '#ffd84d', '#fff3e0', '#ff7a6b', '#c3a6ff'].map((c) => new Color(c));
const LEAF_COLS = ['#5cbf4e', '#49ab46', '#76cf5c', '#58b84f'].map((c) => new Color(c));
const WOOD = new Color('#c78d55'), WOOD_D = new Color('#a06a3a'), WOOD_L = new Color('#e0aa72'), SOIL = new Color('#6b4630');
const STONE_A = new Color('#eadfc6'), STONE_B = new Color('#dccfb0'), STONE_CAP = new Color('#f3ead6'), HEDGE = new Color('#4ea64a');
/** Coloured, non-indexed, position + normal + colour only (so it merges with the kit geometries). */
function coloured(g: BufferGeometry, c: Color, m: Matrix4): BufferGeometry {
  const n = g.toNonIndexed(); g.dispose(); n.deleteAttribute('uv'); n.applyMatrix4(m);
  const cnt = n.attributes.position.count, col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  n.setAttribute('color', new Float32BufferAttribute(col, 3));
  return n;
}
/** All barrier geometry in world space, bucketed by 32 m chunk (same keys as the kit's light pieces). */
function barrierParts(into: (key: string, g: BufferGeometry) => void): void {
  const M = new Matrix4(), Q = new Quaternion(), E = new Euler(), P = new Vector3(), S = new Vector3(1, 1, 1);
  for (const b of BARRIERS as Barrier[]) {
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), cs = Math.cos(ry), sn = Math.sin(ry);
    const n = Math.max(1, Math.round(len / (b.kind === 2 ? 1.2 : 1.6))), L = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = b.x1 + dx * t, cz = b.z1 + dz * t, y0 = townLift(cx, cz), key = Math.floor(cx / MERGE_CH) + ',' + Math.floor(cz / MERGE_CH);
      const seed = hash1(cx, cz);
      /** a part in the piece's local frame (u along the run, h up, v across), size (w, h, d), spun by yaw about the piece centre */
      const put = (g: BufferGeometry, c: Color, u: number, h: number, v: number, sx = 1, sy = 1, sz = 1, spin = 0): void => {
        Q.setFromEuler(E.set(0, ry + spin, 0)); P.set(cx + u * cs + v * sn, y0 + h, cz - u * sn + v * cs); S.set(sx, sy, sz); M.compose(P, Q, S);
        into(key, coloured(g, c, M));
      };
      const flowers = (cnt: number, y: number, half: number, wide: number, off = 0): void => {
        for (let f = 0; f < cnt; f++) {
          const r1 = hash1(cx, cz, 10 + f + off), r2 = hash1(cx, cz, 30 + f + off), r3 = hash1(cx, cz, 50 + f + off);
          put(new IcosahedronGeometry(0.11 + r3 * 0.04, 0), FLOWER_COLS[Math.floor(hash1(cx, cz, 70 + f + off) * FLOWER_COLS.length)], (r1 - 0.5) * 2 * half, y + r3 * 0.05, (r2 - 0.5) * wide);
        }
      };
      if (b.kind === 0) {   // wooden plant box: planks, corner posts, a lighter rim, soil, round bushes and a few flowers
        const w = L - 0.1;
        put(new BoxGeometry(w, 0.46, 0.66), WOOD, 0, 0.23, 0);
        put(new BoxGeometry(w + 0.02, 0.05, 0.68), WOOD_D, 0, 0.15, 0); put(new BoxGeometry(w + 0.02, 0.05, 0.68), WOOD_D, 0, 0.33, 0);
        put(new BoxGeometry(w + 0.1, 0.07, 0.76), WOOD_L, 0, 0.5, 0);
        for (const sd of [-1, 1]) put(new BoxGeometry(0.12, 0.54, 0.74), WOOD_D, sd * (w / 2 - 0.02), 0.27, 0);
        put(new BoxGeometry(w - 0.1, 0.05, 0.56), SOIL, 0, 0.53, 0);
        const nb = Math.max(2, Math.round(w / 0.5));
        for (let k = 0; k < nb; k++) {
          const u = -w / 2 + (w * (k + 0.5)) / nb, r = 0.27 + hash1(cx, cz, k) * 0.07;
          put(new IcosahedronGeometry(r, 1), LEAF_COLS[Math.floor(hash1(cz, cx, k) * LEAF_COLS.length)], u, 0.62 + r * 0.55, (hash1(cx, cz, k + 5) - 0.5) * 0.08, 1, 0.8, 1);
        }
        flowers(2 + Math.round(seed * 2), 0.98, w / 2 - 0.15, 0.3);
      } else if (b.kind === 1) {   // trimmed hedge: a green block with a rounded top of overlapping lumps + white / pink blossoms
        const w = L - 0.06;
        put(new BoxGeometry(w, 0.5, 0.68), HEDGE, 0, 0.25, 0);
        const nb = Math.max(2, Math.round(w / 0.6));
        for (let k = 0; k < nb; k++) put(new IcosahedronGeometry(0.4, 1), LEAF_COLS[(k + Math.floor(seed * 3)) % LEAF_COLS.length], -w / 2 + (w * (k + 0.5)) / nb, 0.58, 0, 1.1, 0.78, 0.95);
        flowers(2, 0.95, w / 2 - 0.2, 0.4, 3);
      } else {   // low stone wall: two-tone blocks with a pale cap and a tuft of green on top
        const w = L - 0.04;
        put(new BoxGeometry(w, 0.5, 0.56), seed < 0.5 ? STONE_A : STONE_B, 0, 0.25, 0);
        put(new BoxGeometry(w + 0.04, 0.09, 0.66), STONE_CAP, 0, 0.55, 0);
        put(new BoxGeometry(0.03, 0.5, 0.58), STONE_B, 0, 0.25, 0);
        put(new IcosahedronGeometry(0.2, 1), LEAF_COLS[Math.floor(seed * LEAF_COLS.length)], (seed - 0.5) * w * 0.6, 0.72, 0, 1.2, 0.8, 1);
        flowers(1, 0.8, w / 2 - 0.2, 0.2, 7);
      }
    }
  }
}

/** Pieces up to this many vertices (planters, lamps, banners, stalls, wall segments, barrel clusters ...) are baked together per 32 m chunk: one draw call for the lot instead of one per
 *  piece type per chunk (the dense town has ~25 small piece types). Bigger pieces (houses, shops, landmarks) stay instanced per piece. */
const LIGHT_VERTS = 1500, MERGE_CH = 32;
function MergedKitChunk({ body, glow, lit, glowMat, cast, receive }: { body: BufferGeometry; glow: BufferGeometry | null; lit: Material; glowMat: Material; cast: boolean; receive: boolean }) {
  const g = useRef<Group>(null!);
  useEffect(() => { if (!body.boundingSphere) body.computeBoundingSphere(); const sp = body.boundingSphere!; return cullRegister(g.current, sp.center.x, sp.center.z, sp.radius, false); }, [body]);
  useEffect(() => () => { body.dispose(); glow?.dispose(); }, [body, glow]);
  return (
    <group ref={g}>
      <mesh geometry={body} material={lit} castShadow={cast} receiveShadow={receive} />
      {glow && <mesh geometry={glow} material={glowMat} />}
    </group>
  );
}

/** All kit pieces of the walled town: heavy pieces instanced per piece (body + glow), light ones baked per chunk. */
export function TownKit({ lit, glow, shadows }: { lit: Material; glow: Material; shadows: boolean }) {
  const k2 = useKit(V2_URL, null);
  const sets = useMemo(() => {
    const P = placements();
    const list = Object.keys(P).map((k) => {
      const [, name] = k.split(':'), piece = k2[name];
      return piece ? { k, piece, places: P[k], fill: (m: InstancedMesh) => { P[k].forEach((p, i) => setInst(m, i, p.x, p.y ?? 0, p.z, p.ry, p.sx, p.sy, p.sz)); m.count = P[k].length; } } : null;
    }).filter(Boolean) as { k: string; piece: KitPiece; places: Place[]; fill: (m: InstancedMesh) => void }[];
    const heavy = list.filter((s) => s.piece.body.attributes.position.count >= LIGHT_VERTS), light = list.filter((s) => s.piece.body.attributes.position.count < LIGHT_VERTS);
    const by = new Map<string, { b: BufferGeometry[]; g: BufferGeometry[] }>();
    const bake = (geo: BufferGeometry, glowGeo: BufferGeometry | null, p: Place) => {
      _q.setFromEuler(_e.set(0, p.ry, 0)); _m.compose(_p.set(p.x, p.y ?? 0, p.z), _q, _s.set(p.sx, p.sy, p.sz));
      const key = Math.floor(p.x / MERGE_CH) + ',' + Math.floor(p.z / MERGE_CH);
      let e = by.get(key); if (!e) by.set(key, (e = { b: [], g: [] }));
      e.b.push(geo.clone().applyMatrix4(_m)); if (glowGeo) e.g.push(glowGeo.clone().applyMatrix4(_m));
    };
    for (const s of light) for (const p of s.places) bake(s.piece.body, s.piece.glow, p);
    const spots = clutterSpots(), cg = buildClutter(k2);
    if (cg) for (const sp of spots) bake(cg, null, { x: sp[0], y: townLift(sp[0], sp[1]), z: sp[1], ry: sp[2], sx: 1, sy: 1, sz: 1 });
    barrierParts((key, g) => { let e = by.get(key); if (!e) by.set(key, (e = { b: [], g: [] })); e.b.push(g); });
    const merged = Array.from(by.values()).map((e) => ({ body: mergeGeometries(e.b, false)!, glow: e.g.length ? mergeGeometries(e.g, false) : null }));
    for (const e of by.values()) for (const x of [...e.b, ...e.g]) x.dispose();
    return { heavy, merged };
  }, [k2]);
  return (
    <group>
      {sets.heavy.map((s) => (
        <React.Fragment key={s.k}>
          <Inst geo={s.piece.body} mat={lit} count={s.places.length} fill={s.fill} cast={shadows} receive={shadows} chunk={CHUNK_V2} />
          {s.piece.glow && <Inst geo={s.piece.glow} mat={glow} count={s.places.length} fill={s.fill} chunk={CHUNK_V2} />}
        </React.Fragment>
      ))}
      {sets.merged.map((c, i) => <MergedKitChunk key={i} body={c.body} glow={c.glow} lit={lit} glowMat={glow} cast={shadows} receive={shadows} />)}
    </group>
  );
}
useGLTF.preload(V2_URL);

/** v2 shop_stall_house geometry for the Shop component (render/Town.tsx): the chimney top, in shop-local metres, for the smoke FX. */
export const SHOP_CHIMNEY: [number, number, number] = [1.6, 6.3, -0.5];
