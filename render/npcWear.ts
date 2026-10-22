// npc_wear_v1 kit loader (art/blender/npc_wear_v1.py -> public/models/characters/npc_wear_v1.glb): hair, beards, hats and clothes of the town's
// villagers. The GLB is meshopt compressed + quantized, so (like render/kitV3.tsx) every mesh is de-quantized and baked with its world matrix; the
// piece's root Empty origin is the attach point of its KayKit bone, so the baked positions are in that bone's LOCAL frame (+Y up, +Z front).
// Material -> role: `main` = A colour, `second` = B colour, `hair` = hair colour, `skin` = skin colour, any other material is a fixed colour that
// is already multiplied (with the glTF COLOR_0 gradient) into `col`. render/npcBuild.ts skins the pieces rigidly to their bone and merges them
// into the NPC's single SkinnedMesh.
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Mesh, MeshStandardMaterial, Object3D } from 'three';
import { url } from './models';

export const NPC_WEAR_URL = url('models/characters/npc_wear_v1.glb');
useGLTF.preload(NPC_WEAR_URL);

export type WearBone = 'head' | 'chest' | 'hips';
/** one piece: indexed vertices in the bone's local frame; role[v] 0 = fixed colour, 1 = A, 2 = B, 3 = hair, 4 = skin */
export interface WearPiece { bone: WearBone; n: number; pos: Float32Array; nrm: Float32Array; col: Float32Array; role: Uint8Array; idx: Uint16Array | Uint32Array }
export type WearKit = Record<string, WearPiece>;

const ROLE: Record<string, number> = { main: 1, second: 2, hair: 3, skin: 4 };
/** which bone a piece rides on, from its name (the kit builder uses the same table) */
function boneOf(name: string): WearBone {
  if (/^(tunic|dress|apron|smock|robe_|cape_|vest|sash|scarf|collar_|tabard|pauldrons)/.test(name)) return 'chest';
  if (/^(skirt_|pouch_|belt_)/.test(name)) return 'hips';
  return 'head';
}

let cache: WearKit | null = null;

/** Bake a loaded npc_wear_v1 scene (de-quantize, world matrix, material colour x COLOR_0). */
export function bakeNpcWear(scene: Object3D): WearKit {
  scene.updateMatrixWorld(true);
  const acc: Record<string, { pos: number[]; nrm: number[]; col: number[]; role: number[]; idx: number[] }> = {};
  scene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh;
    let k: Object3D = m;
    while (k.parent && k.parent !== scene) k = k.parent;   // the root Empty of the piece
    const name = k.name;
    if (!name) return;
    const e = (acc[name] ??= { pos: [], nrm: [], col: [], role: [], idx: [] });
    const mt = m.material as MeshStandardMaterial, g = m.geometry, p = g.attributes.position, nr = g.attributes.normal, cl = g.attributes.color, ix = g.index;
    const role = ROLE[mt.name] ?? 0, c = mt.color;
    const base = e.pos.length / 3, mw = m.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      e.pos.push(mw[0] * x + mw[4] * y + mw[8] * z + mw[12], mw[1] * x + mw[5] * y + mw[9] * z + mw[13], mw[2] * x + mw[6] * y + mw[10] * z + mw[14]);
      if (nr) {
        const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
        const ax = mw[0] * nx + mw[4] * ny + mw[8] * nz, ay = mw[1] * nx + mw[5] * ny + mw[9] * nz, az = mw[2] * nx + mw[6] * ny + mw[10] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        e.nrm.push(ax / l, ay / l, az / l);
      } else e.nrm.push(0, 1, 0);
      const cr = cl ? cl.getX(i) : 1, cg = cl ? cl.getY(i) : 1, cb = cl ? cl.getZ(i) : 1;
      e.col.push(c.r * cr, c.g * cg, c.b * cb);
      e.role.push(role);
    }
    if (ix) for (let i = 0; i < ix.count; i++) e.idx.push(base + ix.getX(i)); else for (let i = 0; i < p.count; i++) e.idx.push(base + i);
  });
  const kit: WearKit = {};
  for (const [name, e] of Object.entries(acc)) {
    const n = e.pos.length / 3;
    kit[name] = { bone: boneOf(name), n, pos: new Float32Array(e.pos), nrm: new Float32Array(e.nrm), col: new Float32Array(e.col), role: new Uint8Array(e.role), idx: n > 65535 ? new Uint32Array(e.idx) : new Uint16Array(e.idx) };
  }
  return kit;
}

/** The baked kit (loaded once, cached). Suspends until the GLB is in. */
export function useNpcWear(): WearKit {
  const gltf = useGLTF(NPC_WEAR_URL);
  return useMemo(() => (cache ??= bakeNpcWear(gltf.scene)), [gltf]);
}
