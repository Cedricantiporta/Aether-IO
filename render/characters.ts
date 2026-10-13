// KayKit character + animation loading helpers (shared by Hero and shopkeeper NPCs).
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { AnimationClip, Bone, Group, Mesh, Object3D, SkinnedMesh, Material } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
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
