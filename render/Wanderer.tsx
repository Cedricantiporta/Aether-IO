// The wanderer resting in a cleared run room (engine/wanderers.ts): a KayKit character, idle, facing the hero, with a
// name tag and a gold "!" until their offer has been taken.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Color, Group, Mesh, MeshStandardMaterial, Sprite, SphereGeometry, CylinderGeometry, BoxGeometry, type Object3D } from 'three';
import { world } from '../engine/world';
import { wander, WANDERERS } from '../engine/wanderers';
import { useWorldCounter } from './hooks';
import { useCharacterInstance, useClips } from './characters';
import { labelMaterial } from './label';
import { angleLerp } from './util';

const MARK = labelMaterial('!', '#ffd24a', { size: 120 });

/** Aelia, Keeper of the Font: the Mage model with no hat, a plain white dress and long blonde hair. Returns an undo. */
export function dressKeeper(meshes: Mesh[], root: Object3D): () => void {
  const undo: (() => void)[] = [];
  for (const m of meshes) {
    if (/Hat/i.test(m.name)) { m.visible = false; undo.push(() => { m.visible = true; }); continue; }
    if (/Body|Cape|Leg|Arm/.test(m.name)) {   // white dress (flat cloth, no texture)
      const mat = m.material as MeshStandardMaterial, map = mat.map, col = mat.color.clone();
      mat.map = null; mat.color.set('#f6f3ec'); mat.needsUpdate = true;
      undo.push(() => { mat.map = map; mat.color.copy(col); mat.needsUpdate = true; });
    }
  }
  // long blonde hair on the head bone: a cap and a fall down the back
  const head = root.getObjectByName('head') || root.getObjectByName('Head');
  if (head) {
    const hairMat = new MeshStandardMaterial({ color: '#f2d27a', roughness: 0.55 });
    const cap = new Mesh(new SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.set(0, 0.42, -0.03); cap.scale.set(1.12, 1, 1.12);
    const fall = new Mesh(new CylinderGeometry(0.36, 0.3, 0.75, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8), hairMat);
    fall.position.set(0, 0.12, -0.05); fall.rotation.y = Math.PI;
    hairMat.side = 2;   // (DoubleSide: the open fall is seen from both sides)
    head.add(cap, fall);
    undo.push(() => { head.remove(cap, fall); cap.geometry.dispose(); fall.geometry.dispose(); hairMat.dispose(); });
  }
  return () => { for (const u of undo) u(); };
}
const WHITE = new Color(1, 1, 1);

/** (owner) Keeto: black coat and boots, and a long blade in each hand (a dark one and a pale one). Returns an undo. */
function dressKeeto(mats: any[], root: Object3D): () => void {
  const old = mats.map((m) => (m.color ? m.color.clone() : null));
  mats.forEach((m) => { if (m.color) m.color.set('#2a2a33'); });
  const blades: Mesh[] = [];
  const mk = (col: string, glow: string) => {
    const m = new MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.25, emissive: glow, emissiveIntensity: 0.35 });
    const b = new Mesh(new BoxGeometry(0.07, 1.25, 0.02), m); b.position.set(0, 0.62, 0); return b;
  };
  for (const [bone, col, glow] of [['handslotr', '#1b1b24', '#202060'], ['handslotl', '#dfe8f2', '#5a8aff']] as const) {
    const h = root.getObjectByName(bone); if (!h) continue;
    const b = mk(col, glow); h.add(b); blades.push(b);
  }
  return () => {
    mats.forEach((m, i) => { if (m.color && old[i]) m.color.copy(old[i]); });
    for (const b of blades) { b.parent?.remove(b); b.geometry.dispose(); (b.material as MeshStandardMaterial).dispose(); }
  };
}


function Actor({ def }: { def: number }) {
  const d = WANDERERS[def];
  const ch = useCharacterInstance(d.model);
  const clips = useClips();
  const g = useRef<Group>(null!), mark = useRef<Sprite>(null!);
  const tag = useMemo(() => labelMaterial(`${d.name} · ${d.title}`, d.accent, { size: 44, plate: 'mini' }), [d]);
  const S = useRef({ mixer: null as AnimationMixer | null, yaw: 0 });
  useEffect(() => {
    if (d.id === 'KEEPER') return dressKeeper(ch.meshes, ch.root);
    if (d.look === 'DUAL_BLACK') return dressKeeto(ch.mats, ch.root);
    const tint = new Color(d.tint).lerp(WHITE, 0.35);
    ch.mats.forEach((m: any) => { if (m.color) m.color.copy(tint); });
    return undefined;
  }, [ch, d]);
  useEffect(() => {
    const m = new AnimationMixer(ch.root);
    const idle = clips['Idle_B'] || clips['Idle_A'];
    if (idle) m.clipAction(idle).play();
    S.current.mixer = m;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); S.current.mixer = null; };
  }, [ch, clips, d]);
  useFrame((_, dt) => {
    const s = S.current;
    if (!g.current || !s.mixer) return;
    s.mixer.update(Math.min(dt, 0.05));
    const p = world.player.pos;
    s.yaw = angleLerp(s.yaw, Math.atan2(p.x - wander.x, p.z - wander.z), 1 - Math.exp(-4 * dt));
    g.current.position.set(wander.x, 0, wander.z);
    g.current.rotation.y = s.yaw;
    if (mark.current) { mark.current.visible = !wander.used; mark.current.position.y = 3.3 + Math.sin(world.time * 3) * 0.1; }
  });
  return (
    <group ref={g} position={[wander.x, 0, wander.z]}>
      <primitive object={ch.root} />
      <sprite ref={mark} material={MARK.mat} position={[0, 3.3, 0]} scale={[MARK.aspect * 1.2, 1.2, 1]} renderOrder={6} />
      <sprite material={tag.mat} position={[0, 2.7, 0]} scale={[tag.aspect * 0.75, 0.75, 1]} />
      <pointLight position={[0, 1.6, 0.8]} color={d.id === 'KEEPER' ? '#fff6dc' : '#ffcf8a'} intensity={d.id === 'KEEPER' ? 10 : 4} distance={d.id === 'KEEPER' ? 10 : 7} decay={1.6} />
    </group>
  );
}

export function Wanderer() {
  const ver = useWorldCounter(() => wander.ver);
  if (!wander.on || !world.room.active) return null;
  return <Actor key={ver} def={wander.def} />;
}
