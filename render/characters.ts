// KayKit character + animation loading helpers (shared by Hero and shopkeeper NPCs).
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { AnimationClip, Bone, BufferGeometry, Group, Matrix4, Mesh, Object3D, Skeleton, SkinnedMesh, Material, Uint16BufferAttribute } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { url } from './models';

export const CHAR_URLS = {
  ARCHER: url('models/characters/Ranger.glb'),
  WIZARD: url('models/characters/Mage.glb'),
  BARBARIAN: url('models/characters/Barbarian.glb'),
  KNIGHT: url('models/characters/Knight.glb'),
  ROGUE: url('models/characters/Rogue_Hooded.glb'),
};
export const ANIM_URLS = [url('models/anims/Rig_Medium_General.glb'), url('models/anims/Rig_Medium_MovementBasic.glb')];
Object.values(CHAR_URLS).forEach((u) => useGLTF.preload(u));
ANIM_URLS.forEach((u) => useGLTF.preload(u));

export type CharKey = keyof typeof CHAR_URLS;

let _clips: Record<string, AnimationClip> | null = null;
export function useClips(): Record<string, AnimationClip> {
  const a = useGLTF(ANIM_URLS[0]), b = useGLTF(ANIM_URLS[1]);
  return useMemo(() => {
    if (_clips) return _clips;
    const out: Record<string, AnimationClip> = {};
    for (const c of [...a.animations, ...b.animations]) {
      const clip = c.clone();
      clip.tracks = clip.tracks.filter((t) => !(t.name.startsWith('root.position')));
      out[c.name] = clip;
    }
    _clips = out;
    return out;
  }, [a, b]);
}

const UPPER = ['spine', 'chest', 'upperarm', 'lowerarm', 'wrist', 'hand', 'handslot', 'head'];
const _upper = new WeakMap<AnimationClip, AnimationClip>();
/** Upper-body-only copy of a clip so attacks layer over locomotion. */
export function upperBody(clip: AnimationClip): AnimationClip {
  let c = _upper.get(clip);
  if (!c) {
    c = clip.clone();
    c.name = clip.name + '_upper';
    c.tracks = c.tracks.filter((t) => UPPER.some((u) => t.name.startsWith(u)));
    _upper.set(clip, c);
  }
  return c;
}

export interface CharInstance { root: Group; mats: Material[]; meshes: Mesh[]; handR: Object3D | null; handL: Object3D | null; }

/** Clone a skinned character with private materials (so per-instance emissive flashes work). */
export function useCharacterInstance(key: CharKey): CharInstance {
  const gltf = useGLTF(CHAR_URLS[key]);
  return useMemo(() => {
    const root = cloneSkeleton(gltf.scene) as Group;
    const mats: Material[] = [], meshes: Mesh[] = [];
    root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.material = (m.material as Material).clone();
        mats.push(m.material as Material);
        m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        meshes.push(m);
      }
    });
    return { root, mats, meshes, handR: root.getObjectByName('handslotr') || null, handL: root.getObjectByName('handslotl') || null };
  }, [gltf, key]);
}

/**
 * Merge a cloned KayKit character's skinned parts (arms, legs, head, cape, hat...: 7-9 meshes sharing one atlas) into ONE
 * SkinnedMesh: 1 draw call instead of 7-9 (x2 with shadows). The parts share bones but each carries its own inverse-bind
 * matrices, so the merged skeleton concatenates every part's (bone, inverse) block and each part's skinIndex is offset into
 * its block: the skinning maths (and the bone-matrix count per frame) is exactly what the separate meshes did.
 * Idempotent per instance; falls back to the original meshes when the parts don't fit (other material, hidden part...).
 * Only for characters that never toggle / re-material single parts (town NPCs, shopkeepers). `disposeMerged` on unmount.
 */
export function mergeCharacter(ch: CharInstance): Mesh[] {
  const c = ch as CharInstance & { __merged?: Mesh[] };
  if (c.__merged) return c.__merged;
  const sk = ch.meshes as SkinnedMesh[];
  const s0 = sk[0];
  const map = s0 ? (s0.material as any).map : null;
  if (sk.length < 2 || sk.some((m) => !m.isSkinnedMesh || !m.visible || (m.material as any).map !== map || !m.geometry.attributes.skinIndex
    || m.parent !== s0.parent || !m.bindMatrix.equals(s0.bindMatrix) || !m.matrix.equals(s0.matrix))) return (c.__merged = ch.meshes);
  const bones: Bone[] = [], inverses: Matrix4[] = [];
  const parts = sk.map((m) => {
    const src = m.geometry, off = bones.length;
    for (let i = 0; i < m.skeleton.bones.length; i++) { bones.push(m.skeleton.bones[i]); inverses.push(m.skeleton.boneInverses[i].clone()); }
    const si = src.attributes.skinIndex, idx = new Uint16Array(si.count * 4);
    for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) idx[v * 4 + k] = si.getComponent(v, k) + off;
    const g = new BufferGeometry();
    for (const name in src.attributes) g.setAttribute(name, name === 'skinIndex' ? new Uint16BufferAttribute(idx, 4) : src.attributes[name]);
    g.setIndex(src.index);
    return g;
  });
  const geo = mergeGeometries(parts, false);
  if (!geo) return (c.__merged = ch.meshes);
  geo.computeBoundingSphere();
  const merged = new SkinnedMesh(geo, s0.material);
  merged.name = 'mergedCharacter';
  merged.position.copy(s0.position); merged.quaternion.copy(s0.quaternion); merged.scale.copy(s0.scale);
  merged.frustumCulled = false; merged.castShadow = s0.castShadow; merged.receiveShadow = s0.receiveShadow;
  s0.parent!.add(merged);
  merged.updateMatrixWorld(true);
  merged.bind(new Skeleton(bones, inverses), s0.bindMatrix);
  for (const m of sk) m.parent!.remove(m);
  return (c.__merged = [merged]);
}

/** Free the GPU buffers / bone texture of a character merged by `mergeCharacter`. */
export function disposeMerged(ch: CharInstance): void {
  const c = ch as CharInstance & { __merged?: Mesh[] };
  if (!c.__merged || c.__merged === ch.meshes) return;
  for (const m of c.__merged) { m.geometry.dispose(); (m as SkinnedMesh).skeleton?.dispose(); }
}
