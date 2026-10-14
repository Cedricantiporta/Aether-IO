// Necromancer minions (engine/systems/minions.ts): skeleton warriors, skeleton mages and the bone golem. A small fixed
// pool of groups (one per world.minions slot); poses are written in useFrame (rise from the ground, walk bob, swing).
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { world } from '../engine/world';
import { GB, litMat } from './util';
import { CELL, pushHalo } from './fx';

const BONE = '#ebe5d0', BONE2 = '#c9c2a8';

function skeletonGeo(mage: boolean) {
  const g = new GB([0.85, 1.1]);
  g.sph(0.22, [0, 1.62, 0], BONE, [1, 1.05, 1.05], 8);                              // skull
  for (const s of [-1, 1]) g.sph(0.06, [s * 0.08, 1.64, 0.18], '#1a1020', 1, 5);    // sockets
  g.cyl(0.04, 0.045, 0.6, 5, [0, 1.1, 0], BONE2);                                   // spine
  for (let i = 0; i < 4; i++) g.torus(0.18 - i * 0.012, 0.02, [0, 1.3 - i * 0.12, 0], BONE, [Math.PI / 2, 0, 0], [1, 0.75, 1], 8);
  g.box(0.5, 0.06, 0.09, [0, 1.42, 0], BONE); g.box(0.32, 0.1, 0.18, [0, 0.78, 0], BONE2);
  for (const s of [-1, 1]) { g.cyl(0.04, 0.035, 0.75, 5, [s * 0.1, 0.4, 0], BONE2); g.cyl(0.035, 0.03, 0.55, 5, [s * 0.3, 1.15, 0], BONE2); }
  if (mage) {
    g.cone(0.32, 0.55, 8, [0, 1.85, -0.03], '#4a2a6a');                              // hood
    g.cyl(0.25, 0.38, 0.75, 8, [0, 1.0, 0], '#3a2050');                              // robe
    g.cyl(0.03, 0.03, 1.5, 5, [0.38, 1.0, 0.1], '#5a3a2a'); g.sph(0.11, [0.38, 1.8, 0.1], '#b08aff', 1, 6);   // staff
  } else {
    g.box(0.07, 0.8, 0.02, [0.34, 1.2, 0.25], '#9aa0aa', [0.6, 0, 0]);                // rusty sword
    g.box(0.24, 0.05, 0.05, [0.34, 0.85, 0.05], '#5a4a3a', [0.6, 0, 0]);
    g.cyl(0.26, 0.26, 0.06, 8, [-0.34, 1.15, 0.1], '#6a5040', [0, 0, Math.PI / 2]);   // round shield
  }
  return g.build();
}
function golemGeo() {
  const g = new GB([0.85, 1.1]);
  g.sph(0.9, [0, 1.6, 0], '#bdb59c', [1.2, 1, 0.9], 7);                          // bone-plated torso
  for (let i = 0; i < 5; i++) g.cone(0.14, 0.6, 4, [-0.8 + i * 0.4, 2.4, -0.2], BONE, [-0.4, 0, 0]);   // spine spikes
  g.sph(0.4, [0, 2.45, 0.35], BONE, 1, 7); for (const s of [-1, 1]) g.sph(0.08, [s * 0.15, 2.5, 0.68], '#9a6bff', 1, 5);
  for (const s of [-1, 1]) { g.sph(0.42, [s * 1.15, 1.7, 0.1], '#a8a088', 1, 6); g.cyl(0.3, 0.38, 1.3, 6, [s * 1.25, 0.95, 0.2], BONE2); g.sph(0.4, [s * 1.3, 0.3, 0.3], '#a8a088', 1, 6); }
  for (const s of [-1, 1]) g.cyl(0.32, 0.36, 0.9, 6, [s * 0.45, 0.45, 0], BONE2);
  return g.build();
}

export function Minions() {
  const groups = useRef<(Group | null)[]>([]);
  const mat = useMemo(() => litMat({ roughness: 0.8 }), []);
  const geo = useMemo(() => ({ w: skeletonGeo(false), m: skeletonGeo(true), g: golemGeo() }), []);
  const N = world.minions.length;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const g = groups.current[i]; if (!g) continue;
      const m = world.minions[i];
      g.visible = m.active;
      if (!m.active) continue;
      for (let k = 0; k < 3; k++) g.children[k].visible = k === m.kind;
      const rise = m.rise > 0 ? Math.min(1, m.rise / 0.6) : 0;   // climbing out of the ground
      const bob = Math.abs(Math.sin(t * 9 + i)) * 0.06;
      g.position.set(m.x, -rise * 1.6 + bob, m.z);
      g.rotation.set(m.swing * -0.35, m.facing, 0);
      const fade = m.life < 1 ? m.life : 1;
      g.scale.setScalar(fade * (m.kind === 2 ? 1.25 : 1));
      if (m.kind !== 1 || (i + Math.floor(t * 4)) % 2 === 0) pushHalo(m.x, m.kind === 2 ? 2.4 : 1.6, m.z, m.kind === 2 ? 2.2 : 1.1, 1.0, 0.5, 2.0, 0.22, CELL.GLOW);   // violet necromantic glow
    }
  });
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <mesh geometry={geo.w} material={mat} castShadow />
          <mesh geometry={geo.m} material={mat} castShadow />
          <mesh geometry={geo.g} material={mat} castShadow />
        </group>
      ))}
    </>
  );
}
