// (owner) In a run, once only STATIONARY monsters are left (goblin archer towers, lake hydras, crystals, gargoyles: engine/enemyDefs
// isStationary), a red ground arrow beside the hero points at the nearest one so a cleared-looking room is never a
// mystery. Hidden while one is close by. Scans the enemy pool a few times a second (no per-frame allocations).
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, MeshBasicMaterial } from 'three';
import { triArrowGeo } from './arrowGeo';
import { world } from '../engine/world';
import { isStationary } from '../engine/enemyDefs';
import { useGameStore } from '../store';
import { GameStatus } from '../types';

const SHOW_BEYOND = 9;   // hide when the nearest stationary monster is this close

export function StationaryArrow() {
  const geo = useMemo(() => ({ core: triArrowGeo(0.5, 1.3, 0.38), rim: triArrowGeo(0.62, 1.48, 0.36).translate(0, 0, -0.09) }), []);
  const rim = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, side: DoubleSide, color: '#ff5a4a' }), []);
  const dark = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false, side: DoubleSide, color: '#170c0a' }), []);
  const ref = useRef<Group>(null!);
  const S = useRef({ acc: 1, has: false, x: 0, z: 0 });
  useFrame(({ clock }, dt) => {
    const g = ref.current; if (!g) return;
    const s = S.current, p = world.player.pos;
    s.acc += dt;
    if (s.acc > 0.3) {
      s.acc = 0; s.has = false;
      if (useGameStore.getState().status === GameStatus.PLAYING && world.room.active) {
        let any = false, onlyStill = true, best = Infinity;
        for (const e of world.enemies) {
          if (!e.active || e.state === 'DYING' || e.decoy) continue;
          any = true;
          if (!isStationary(e.kind) && e.kind !== 'GARGOYLE') { onlyStill = false; break; }   // gargoyles perch and barely move: point at them too
          const d = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
          if (d < best) { best = d; s.x = e.pos.x; s.z = e.pos.z; }
        }
        s.has = any && onlyStill && best > SHOW_BEYOND * SHOW_BEYOND;
      }
    }
    g.visible = s.has;
    if (!s.has) return;
    const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz) || 1;
    const k = 3.6 + Math.sin(clock.elapsedTime * 5) * 0.25;
    g.position.set(p.x + (dx / d) * k, 0.3, p.z + (dz / d) * k);
    g.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={geo.rim} material={rim} renderOrder={5} />
      <mesh geometry={geo.core} material={dark} position={[0, 0.01, 0]} renderOrder={6} />
    </group>
  );
}
