// 3D preview of a hero class for the character screen: the KayKit model (with the class weapon and outfit tint) idling
// on a slow turntable in its own small canvas over the dark golden backdrop.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AnimationMixer, Group, Mesh, MeshStandardMaterial } from 'three';
import type { HeroClass } from '../../types';
import { useCharacterInstance, useClips, type CharKey } from '../../render/characters';
import { makeBow, makeStaff, makeSword, makeAxe, HANDSLOT_QUAT, NECRO_TINT } from '../../render/weapons';
import { litMat } from '../../render/util';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN', KNIGHT: 'KNIGHT', NECROMANCER: 'ROGUE' };

function Model({ hero, tint }: { hero: HeroClass; tint: string }) {
  const ch = useCharacterInstance(CHAR[hero]);
  const clips = useClips();
  const spin = useRef<Group>(null!);
  const mixer = useMemo(() => new AnimationMixer(ch.root), [ch]);
  useEffect(() => {
    const c = clips['Idle_A'] ?? Object.values(clips)[0];
    const a = c ? mixer.clipAction(c) : null; a?.play();
    return () => { mixer.stopAllAction(); };
  }, [mixer, clips]);
  useEffect(() => { for (const m of ch.mats as MeshStandardMaterial[]) if (m.color) { m.color.set(tint); if (hero === 'NECROMANCER') m.color.multiply(NECRO_TINT); } }, [ch, tint, hero]);
  // the class weapon in the right hand
  useEffect(() => {
    if (!ch.handR) return;
    const w = hero === 'ARCHER' ? makeBow('#c9a052', 0) : hero === 'WIZARD' ? makeStaff('#8fb8ff', 0) : hero === 'NECROMANCER' ? makeStaff('#7a4ad0', 0) : hero === 'KNIGHT' ? makeSword('#c9a052', 0) : makeAxe('#c9a052', 0);
    const g = new Group();
    g.quaternion.copy(HANDSLOT_QUAT);
    const mat = litMat({ roughness: 0.6, metalness: 0.3 });
    g.add(new Mesh(w.body, mat), new Mesh(w.glow, mat));
    ch.handR.add(g);
    return () => { ch.handR!.remove(g); w.body.dispose(); w.glow.dispose(); };
  }, [ch, hero]);
  // gentle sway toward the camera instead of a full turntable
  useFrame(({ clock }, dt) => { mixer.update(Math.min(dt, 0.05)); if (spin.current) spin.current.rotation.y = 0.35 + Math.sin(clock.elapsedTime * 0.5) * 0.35; });
  return <group ref={spin}><primitive object={ch.root} /></group>;
}

export const HeroPreview: React.FC<{ hero: HeroClass; tint: string }> = ({ hero, tint }) => (
  <div className="cs-preview" aria-hidden>
    <Canvas camera={{ position: [0, 1.25, 6.4], fov: 30 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
      <ambientLight intensity={0.9} color="#ffe2b0" />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff0d0" />
      <directionalLight position={[-4, 2, -3]} intensity={1.0} color="#c9a052" />
      <Suspense fallback={null}><Model key={hero} hero={hero} tint={tint} /></Suspense>
    </Canvas>
  </div>
);
