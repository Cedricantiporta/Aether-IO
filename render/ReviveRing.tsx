// Co-op downed hero: a soft ring on the ground around a hero who is DOWN (mine, or my friend's) that fills up while the revive progresses
// (3 s of the partner standing next to him, net/coop.ts reviveTick). The fill is a growing mint disc inside the pink ring; nothing is allocated per frame.
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, Mesh } from 'three';
import { world } from '../engine/world';
import { coopRoom } from '../net/coopRoom';
import { useCoop } from '../net/coopStore';
import { F_DOWN, REVIVE_RANGE } from '../net/protocol';

function Ring({ who }: { who: 'me' | 'friend' }) {
  const g = useRef<Group>(null!), fill = useRef<Mesh>(null!), base = useRef<Mesh>(null!);
  useFrame((state) => {
    const grp = g.current; if (!grp) return;
    const R = world.remote, me = world.player;
    const on = who === 'me' ? me.downed && world.room.active : R.active && (R.flags & F_DOWN) !== 0 && world.room.active;
    grp.visible = on; if (!on) return;
    if (who === 'me') grp.position.set(me.pos.x, 0.07, me.pos.z); else grp.position.set(R.x, 0.07, R.z);
    const prog = who === 'me' ? R.reviveIn : coopRoom.reviveOut;
    const t = state.clock.elapsedTime, pulse = 1 + Math.sin(t * 4) * 0.05;
    base.current.scale.setScalar(pulse);
    const k = Math.max(0.001, Math.min(1, prog));
    fill.current.visible = prog > 0.001; fill.current.scale.setScalar(k * 0.98);
    (base.current.material as unknown as { color: { set(c: string): void } }).color.set(prog > 0.001 ? '#9bffc8' : '#ff8fb0');
  });
  return (
    <group ref={g} visible={false}>
      <mesh ref={base} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <ringGeometry args={[REVIVE_RANGE * 0.88, REVIVE_RANGE, 48]} />
        <meshBasicMaterial color="#ff8fb0" transparent opacity={0.85} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh ref={fill} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} visible={false}>
        <circleGeometry args={[REVIVE_RANGE * 0.86, 40]} />
        <meshBasicMaterial color="#9bffc8" transparent opacity={0.35} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Mounted by Scene during runs; nothing unless a co-op partner is connected. */
export function ReviveRing() {
  const state = useCoop((s) => s.state);
  if (state !== 'connected') return null;
  return <><Ring who="me" /><Ring who="friend" /></>;
}
