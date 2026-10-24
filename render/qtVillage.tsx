// ============================================================================
// Quaternius village houses + dungeon props (CC0): public/models/village_qt.glb (art/blender/quaternius_village.mjs; engine/qtVillage.ts has the data).
// One GLB node per piece, ONE vertex-coloured material (the town's lit material), so every house variant is a single instanced draw call
// (chunked + culled by <Inst>): House_1 / House_2 / Inn, the pedestal + horse statue pair in front of the portal, and the barrel / crate clusters
// that replaced the old kit barrels. Static: filled once, no per-frame work.
// ============================================================================
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Material, Mesh } from 'three';
import { ROYAL_ROOF, ROYAL_ROOF_DARK } from './townPalette';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE } from './models';
import { Inst } from './Inst';
import { setInst } from './util';
import { HOUSES, townLift } from '../engine/townData';
import { clutterSpots } from './townKit';
import { QV_HOUSES, isQvKit, qvPiece, HORSE_STATUES, PEDESTAL_H } from '../engine/qtVillage';

export const VILLAGE_URL = `${BASE}models/village_qt.glb`;

/** node name -> geometry (position / normal / colour as floats; the uint8 RGBA colours become RGB so any vertex-colour material takes them) */
function pieces(scene: import('three').Object3D): Record<string, BufferGeometry> {
  const out: Record<string, BufferGeometry> = {};
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as Mesh; if (!m.isMesh) return;
    const src = m.geometry, n = src.attributes.position.count, col = new Float32Array(n * 3), c = src.attributes.color;
    for (let i = 0; i < n; i++) { col[i * 3] = c.getX(i); col[i * 3 + 1] = c.getY(i); col[i * 3 + 2] = c.getZ(i); }
    const g = new BufferGeometry();
    g.setAttribute('position', src.attributes.position); g.setAttribute('normal', src.attributes.normal); g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(src.index); g.computeBoundingSphere();
    out[m.name] = g;
  });
  return out;
}

/** Roof colour variants (owner 2026-10-24: roofs in deep blue / red / green, the same blue as the kit shops' roof_blue). The pack's roof vertices (RoofTiles teal 0x09 0x2a 0x31, the Inn's red 0x31 0x0c 0x08) are repainted. */
export type RoofVariant = 'blue' | 'red' | 'green';
export const ROOF_CYCLE: RoofVariant[] = ['blue', 'red', 'blue', 'green', 'blue', 'red', 'green'];
const ROOF_RGB: Record<RoofVariant, Color> = { blue: new Color(ROYAL_ROOF), red: new Color('#b5472f'), green: new Color('#3f8a4c') };
const ROOF_SRC = [[9, 42, 49], [49, 12, 8]];
function recolorRoof(src: BufferGeometry, v: RoofVariant): BufferGeometry {
  const g = src.clone(), c = g.attributes.color, t = ROOF_RGB[v], dark = v === 'blue' ? new Color(ROYAL_ROOF_DARK) : t;
  for (let i = 0; i < c.count; i++) {
    const r = Math.round(c.getX(i) * 255), gg = Math.round(c.getY(i) * 255), b = Math.round(c.getZ(i) * 255);
    if (ROOF_SRC.some((q) => Math.abs(q[0] - r) < 2 && Math.abs(q[1] - gg) < 2 && Math.abs(q[2] - b) < 2)) { const k = 0.9 + ((i * 7) % 5) * 0.025; c.setXYZ(i, (i % 2 ? t.r : dark.r) * k, (i % 2 ? t.g : dark.g) * k, (i % 2 ? t.b : dark.b) * k); }
  }
  c.needsUpdate = true; return g;
}

type P = { x: number; y: number; z: number; ry: number; s: number };

/** All village-pack scenery of the walled town + the hamlet: houses, the statue pair, the barrel clusters. `lit` = the town's lit vertex-colour material. */
export function VillageQt({ lit, shadows }: { lit: Material; shadows: boolean }) {
  const gltf = useGLTF(VILLAGE_URL);
  const sets = useMemo(() => {
    const G = pieces(gltf.scene), list: { k: string; geo: BufferGeometry; places: P[] }[] = [];
    const by: Record<string, P[]> = {};
    let hi = 0;
    for (const h of HOUSES) if (isQvKit(h.kit)) (by[qvPiece(h.kit!) + '|' + ROOF_CYCLE[hi++ % ROOF_CYCLE.length]] ??= []).push({ x: h.x, y: townLift(h.x, h.z), z: h.z, ry: h.rot, s: 1 });
    for (const key of Object.keys(by)) { const [k, v] = key.split('|'); if (QV_HOUSES[k] && G[k]) list.push({ k: key, geo: recolorRoof(G[k], v as RoofVariant), places: by[key] }); }
    // the horse statues: pedestal + statue (the statue stands on the pedestal's top)
    if (G.Pedestal && G.Statue_Horse) {
      list.push({ k: 'Pedestal', geo: G.Pedestal, places: HORSE_STATUES.map((s) => ({ x: s.x, y: townLift(s.x, s.z), z: s.z, ry: s.ry, s: 1 })) });
      list.push({ k: 'Statue_Horse', geo: G.Statue_Horse, places: HORSE_STATUES.map((s) => ({ x: s.x, y: townLift(s.x, s.z) + PEDESTAL_H, z: s.z, ry: s.ry, s: 1 })) });
    }
    // barrel / crate clusters (one merged geometry, like the kit's old clutter)
    if (G.Barrel && G.Barrel2 && G.Crate && G.Bucket) {
      const part = (g: BufferGeometry, x: number, z: number, ry: number, s = 1) => { const c = g.clone(); c.rotateY(ry); c.scale(s, s, s); c.translate(x, 0, z); return c; };
      const parts = [part(G.Barrel, 0, 0, 0.3), part(G.Barrel2, 0.8, 0.1, 1.2), part(G.Crate, -0.8, 0.15, 0.35), part(G.Bucket, 0.35, -0.75, 0.5)];
      const cl = mergeGeometries(parts, false)!; parts.forEach((p) => p.dispose()); cl.computeBoundingSphere();
      list.push({ k: 'cluster', geo: cl, places: clutterSpots().map((c) => ({ x: c[0], y: townLift(c[0], c[1]), z: c[1], ry: c[2], s: 1 })) });
    }
    return list.filter((l) => l.places.length);
  }, [gltf]);
  return (
    <group>
      {sets.map((s) => (
        <Inst key={s.k} geo={s.geo} mat={lit} count={s.places.length} cast={shadows} receive={shadows} chunk={24}
          fill={(m: InstancedMesh) => { s.places.forEach((p, i) => setInst(m, i, p.x, p.y, p.z, p.ry, p.s, p.s, p.s)); m.count = s.places.length; }} />
      ))}
    </group>
  );
}
/** (owner 2026-10-24: the horse is the only statue) one merged pedestal + horse geometry for run-room STATUE obstacles (render/Props). */
export function useHorseStatueGeo(): BufferGeometry | null {
  const gltf = useGLTF(VILLAGE_URL);
  return useMemo(() => {
    const G = pieces(gltf.scene);
    if (!G.Pedestal || !G.Statue_Horse) return null;
    const h = G.Statue_Horse.clone(); h.translate(0, PEDESTAL_H, 0);
    const g = mergeGeometries([G.Pedestal.clone(), h], false); h.dispose();
    g?.computeBoundingSphere(); return g;
  }, [gltf]);
}
useGLTF.preload(VILLAGE_URL);
