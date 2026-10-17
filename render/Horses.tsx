// (owner) The stable horses (townData ANIMALS 'HORSE'): smooth rounded bodies with jointed legs, neck and tail, animated
// from the engine's animal state (engine/systems/npcs.ts animals[]: moving / hop phase / joy / ridden). Walk = four-beat
// leg cycle, gallop (ridden at speed) = bounding gait with body pitch; idle = grazing, tail swish, ear flicks, head toss.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, MeshStandardMaterial, SphereGeometry } from 'three';
import { ANIMALS } from '../engine/townData';
import { animals } from '../engine/systems/npcs';
import { world } from '../engine/world';
import { liftAt } from './lift';
import { dustPuff } from './fx';

const HORSES = ANIMALS.map((a, i) => ({ a, i })).filter((h) => h.a.kind === 'HORSE');
const MANE: Record<string, string> = { '#8a5a36': '#2a1a12', '#f2ece0': '#c9bfae', '#3a2c26': '#120d0b' };
/** Leg pivots: [x, z, walk phase offset, gallop phase offset, front?] */
const LEGS: [number, number, number, number, boolean][] = [
  [-0.2, 0.56, 0, 0, true], [0.2, 0.56, Math.PI, 0.35, true], [-0.2, -0.56, Math.PI * 1.5, Math.PI, false], [0.2, -0.56, Math.PI * 0.5, Math.PI + 0.35, false],
];
/** Rider bob must match render/Hero.tsx (ridden horses bob abs(sin(hop)) x 0.12). */
const bobOf = (moving: boolean, ridden: boolean, hop: number): number => (moving ? Math.abs(Math.sin(hop)) * (ridden ? 0.12 : 0.05) : 0);

function useHorseGeos() {
  return useMemo(() => ({
    barrel: new CapsuleGeometry(0.37, 0.95, 6, 14),
    ball: new SphereGeometry(1, 16, 12),
    neck: new CapsuleGeometry(0.22, 0.62, 6, 12),
    head: new CapsuleGeometry(0.14, 0.34, 5, 10),
    upper: new CapsuleGeometry(0.115, 0.34, 5, 10),
    lower: new CapsuleGeometry(0.078, 0.3, 5, 10),
    hoof: new CylinderGeometry(0.095, 0.115, 0.12, 12),
    ear: new ConeGeometry(0.05, 0.16, 6),
    tail: new CapsuleGeometry(0.075, 0.5, 4, 8),
    saddle: new CylinderGeometry(0.4, 0.42, 0.09, 16),
  }), []);
}

function Horse({ i, tint, geos }: { i: number; tint: string; geos: ReturnType<typeof useHorseGeos> }) {
  const mats = useMemo(() => ({
    coat: new MeshStandardMaterial({ color: tint, roughness: 0.62 }),
    mane: new MeshStandardMaterial({ color: MANE[tint] ?? '#2a1a12', roughness: 0.8 }),
    hoof: new MeshStandardMaterial({ color: '#2a2420', roughness: 0.6 }),
    saddle: new MeshStandardMaterial({ color: '#7a2e1c', roughness: 0.55 }),
    blanket: new MeshStandardMaterial({ color: '#2f5c8a', roughness: 0.85 }),
    eye: new MeshStandardMaterial({ color: '#111111', roughness: 0.2 }),
  }), [tint]);
  useEffect(() => () => { for (const m of Object.values(mats)) m.dispose(); }, [mats]);
  const root = useRef<Group>(null!), body = useRef<Group>(null!), neck = useRef<Group>(null!), tail = useRef<Group>(null!);
  const ears = useRef<(Group | null)[]>([]), upper = useRef<(Group | null)[]>([]), knee = useRef<(Group | null)[]>([]);
  const graze = useRef(0);
  useFrame((_, dt) => {
    const a = animals[i]; if (!a || !root.current) return;
    const t = world.time + i * 3.7, ph = a.hop, rd = world.village.ride;
    if (a.ridden && rd.horse === i) {   // horse dash: dust burst at the start, a trail of puffs while charging
      if (rd.puff) { rd.puff = false; dustPuff(a.x, a.z, 6, 1.0, 0xcdbd98, 1.6); }
      else if (rd.dashT > 0 && Math.sin(ph * 2) > 0.9) dustPuff(a.x - Math.sin(a.yaw) * 0.8, a.z - Math.cos(a.yaw) * 0.8, 1, 0.7, 0xcdbd98, 0.8);
    }
    const gallop = a.ridden && a.moving, amp = !a.moving ? 0 : gallop ? 0.75 : 0.38;
    root.current.position.set(a.x, liftAt(a.x, a.z) + bobOf(a.moving, a.ridden, ph), a.z);
    root.current.rotation.y = a.yaw;
    body.current.rotation.x = gallop ? Math.sin(ph * 2) * 0.07 : 0;
    for (let k = 0; k < 4; k++) {
      const [, , wOff, gOff, front] = LEGS[k], off = gallop ? gOff : wOff, s = Math.sin(ph * (gallop ? 2 : 1) + off);
      const u = upper.current[k], kn = knee.current[k];
      if (u) u.rotation.x = s * amp;
      if (kn) kn.rotation.x = (front ? 1 : -1) * Math.max(0, Math.sin(ph * (gallop ? 2 : 1) + off + 1.2)) * amp * 1.3;
    }
    // idle grazing (head down for a while, now and then), a head toss when it is happy (petted / mounted)
    const wantGraze = !a.moving && !a.ridden && Math.sin(t * 0.21) > 0.35 ? 1 : 0;
    graze.current += (wantGraze - graze.current) * Math.min(1, dt * 1.8);
    const toss = a.joy > 0 ? Math.sin(Math.min(1, a.joy) * Math.PI) * 0.55 : 0;
    neck.current.rotation.x = 0.5 + graze.current * 0.95 - toss + (a.moving ? Math.sin(ph * (gallop ? 2 : 1)) * 0.08 : Math.sin(t * 1.1) * 0.03);
    tail.current.rotation.z = Math.sin(t * (a.moving ? 5 : 2.3)) * (a.moving ? 0.12 : 0.28);
    tail.current.rotation.x = 0.35 + (gallop ? 0.5 : a.moving ? 0.15 : 0);
    const flick = Math.max(0, Math.sin(t * 1.7)) ** 12;
    ears.current.forEach((e, k) => { if (e) e.rotation.z = (k ? -1 : 1) * (0.15 + flick * 0.5); });
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={geos.barrel} material={mats.coat} position={[0, 1.24, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.95, 1, 1.02]} castShadow />
        <mesh geometry={geos.ball} material={mats.coat} position={[0, 1.3, 0.5]} scale={[0.37, 0.41, 0.42]} castShadow />
        <mesh geometry={geos.ball} material={mats.coat} position={[0, 1.32, -0.52]} scale={[0.4, 0.42, 0.42]} castShadow />
        {/* blanket + saddle (rider sits at y 1.62, render/Hero.tsx RIDE_SEAT_Y) */}
        <mesh geometry={geos.saddle} material={mats.blanket} position={[0, 1.58, 0]} scale={[1.02, 0.6, 1.25]} />
        <mesh geometry={geos.saddle} material={mats.saddle} position={[0, 1.63, -0.02]} scale={[0.82, 1, 0.95]} castShadow />
        <mesh geometry={geos.ball} material={mats.saddle} position={[0, 1.7, 0.3]} scale={[0.1, 0.09, 0.08]} />
        {/* neck + head */}
        <group ref={neck} position={[0, 1.45, 0.72]}>
          <mesh geometry={geos.neck} material={mats.coat} position={[0, 0.4, 0]} scale={[0.85, 1, 1.15]} castShadow />
          <mesh geometry={geos.ball} material={mats.mane} position={[0, 0.44, -0.2]} scale={[0.08, 0.48, 0.1]} />
          <group position={[0, 0.8, 0.04]} rotation={[1.75, 0, 0]} scale={1.55}>
            <mesh geometry={geos.head} material={mats.coat} position={[0, 0.2, 0]} castShadow />
            <mesh geometry={geos.ball} material={mats.coat} position={[0, 0.43, -0.02]} scale={[0.13, 0.14, 0.12]} />
            <mesh geometry={geos.ball} material={mats.mane} position={[0, -0.05, -0.09]} scale={[0.05, 0.12, 0.07]} />
            {[-1, 1].map((sx) => <mesh key={sx} geometry={geos.ball} material={mats.eye} position={[sx * 0.125, 0.1, -0.04]} scale={0.032} />)}
            {[-1, 1].map((sx, k) => (
              <group key={sx} ref={(g) => { ears.current[k] = g; }} position={[sx * 0.08, -0.08, -0.1]} rotation={[-1.4, 0, 0]}>
                <mesh geometry={geos.ear} material={mats.coat} position={[0, 0.08, 0]} />
              </group>
            ))}
          </group>
        </group>
        {/* tail */}
        <group ref={tail} position={[0, 1.42, -0.92]}>
          <mesh geometry={geos.tail} material={mats.mane} position={[0, -0.32, 0]} />
        </group>
        {/* legs: hip / shoulder pivot -> knee pivot -> hoof */}
        {LEGS.map(([x, z], k) => (
          <group key={k} ref={(g) => { upper.current[k] = g; }} position={[x, 1.08, z]}>
            <mesh geometry={geos.upper} material={mats.coat} position={[0, -0.27, 0]} castShadow />
            <group ref={(g) => { knee.current[k] = g; }} position={[0, -0.54, 0]}>
              <mesh geometry={geos.lower} material={mats.coat} position={[0, -0.22, 0]} castShadow />
              <mesh geometry={geos.hoof} material={mats.hoof} position={[0, -0.48, 0]} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

export function Horses() {
  const geos = useHorseGeos();
  useEffect(() => () => { for (const g of Object.values(geos)) g.dispose(); }, [geos]);
  return <>{HORSES.map(({ a, i }) => <Horse key={i} i={i} tint={a.tint} geos={geos} />)}</>;
}
