// (owner 2026-10-25) The plaza fountain: a round two-tier storybook fountain (cream stone, soft rounded rims, blue
// water, little falling water sheets, a sparkling top jet, lily pads and ripples). Built from lathe shapes; the
// droplets are one InstancedMesh animated in place (no per-frame allocations).
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Vector2 } from 'three';
import { PLAZA_FOUNTAIN, townLift } from '../engine/townData';
import { TAU } from './util';

const BASIN_R = 3.6;
const DROPS = 28;
const m4 = new Matrix4();

/** A lathe from (radius, height) pairs. */
const lathe = (pts: number[][], seg = 40): LatheGeometry => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);

export function PlazaFountain({ shadows }: { shadows: boolean }) {
  const geo = useMemo(() => ({
    // outer basin: low wall with a fat rounded rim, the inside drops to the water floor
    basin: lathe([[0, 0.05], [BASIN_R - 0.3, 0.05], [BASIN_R - 0.3, 0.42], [BASIN_R - 0.34, 0.6], [BASIN_R - 0.2, 0.74], [BASIN_R, 0.78], [BASIN_R + 0.2, 0.74], [BASIN_R + 0.34, 0.6], [BASIN_R + 0.34, 0.12], [BASIN_R + 0.46, 0.02], [BASIN_R + 0.46, 0]], 56),
    // centre column with a bulb, lower bowl, slim neck, upper bowl, top knob
    column: lathe([[0, 0], [0.62, 0], [0.62, 0.2], [0.42, 0.34], [0.38, 0.9], [0.5, 1.1], [0.36, 1.32], [0, 1.32]]),
    bowl1: lathe([[0, 1.25], [0.5, 1.28], [1.2, 1.5], [1.62, 1.72], [1.7, 1.84], [1.6, 1.9], [1.5, 1.8], [0, 1.74]]),
    neck: lathe([[0, 1.8], [0.26, 1.8], [0.2, 2.2], [0.3, 2.45], [0.16, 2.62], [0, 2.62]]),
    bowl2: lathe([[0, 2.56], [0.3, 2.58], [0.72, 2.74], [0.9, 2.9], [0.84, 2.96], [0.76, 2.88], [0, 2.84]]),
    knob: lathe([[0, 2.86], [0.14, 2.9], [0.2, 3.04], [0.14, 3.2], [0.05, 3.32], [0, 3.36]], 20),
    water: lathe([[0, 0.52], [BASIN_R - 0.3, 0.52]], 56),
    pool1: lathe([[0, 1.84], [1.52, 1.84]]),
    pool2: lathe([[0, 2.88], [0.78, 2.88]]),
    // thin water curtains falling from each bowl's lip
    fall1: lathe([[1.66, 1.88], [1.78, 1.6], [1.86, 1.0], [1.9, 0.52]]),
    fall2: lathe([[0.88, 2.94], [0.96, 2.6], [1.02, 2.1], [1.06, 1.86]]),
    ripple: lathe([[0.92, 0.535], [1.0, 0.535]], 40),
    pad: lathe([[0, 0.54], [0.34, 0.54], [0.34, 0.56], [0, 0.56]], 14),
    drop: lathe([[0, -0.07], [0.05, -0.03], [0.045, 0.03], [0, 0.07]], 6),
    flower: lathe([[0, 0.55], [0.09, 0.58], [0.1, 0.64], [0, 0.66]], 8),
  }), []);
  const mats = useMemo(() => ({
    stone: new MeshStandardMaterial({ color: new Color('#f2e8d4'), roughness: 0.75 }),
    trim: new MeshStandardMaterial({ color: new Color('#cfe9f5'), roughness: 0.6 }),
    water: new MeshStandardMaterial({ color: new Color('#58c8ee'), roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88, emissive: new Color('#1a6a8a'), emissiveIntensity: 0.25 }),
    fall: new MeshStandardMaterial({ color: new Color('#bfeeff'), roughness: 0.1, transparent: true, opacity: 0.42, side: DoubleSide, depthWrite: false, emissive: new Color('#5fd6ff'), emissiveIntensity: 0.3 }),
    foam: new MeshStandardMaterial({ color: new Color('#ffffff'), transparent: true, opacity: 0.6, depthWrite: false, emissive: new Color('#ffffff'), emissiveIntensity: 0.4 }),
    drop: new MeshStandardMaterial({ color: new Color('#e4f8ff'), emissive: new Color('#8fe3ff'), emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
    pad: new MeshStandardMaterial({ color: new Color('#7ccf5a'), roughness: 0.8 }),
    flower: new MeshStandardMaterial({ color: new Color('#ff9fc4'), roughness: 0.7 }),
    gold: new MeshStandardMaterial({ color: new Color('#ffd36a'), roughness: 0.4, metalness: 0.3 }),
  }), []);
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geo, mats]);
  const drops = useRef<InstancedMesh>(null!), rip1 = useRef<Mesh>(null!), rip2 = useRef<Mesh>(null!), f1 = useRef<Mesh>(null!), f2 = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // the top jet: droplets arc up from the knob and fall into the upper bowl / over its lip
    const d = drops.current;
    if (d) {
      for (let i = 0; i < DROPS; i++) {
        const ph = (t * 0.9 + i / DROPS) % 1, a = (i * 2.399) % TAU, rr = 0.25 + ph * 0.7;
        const y = 3.3 + ph * 1.5 - ph * ph * 1.9;
        m4.makeTranslation(Math.cos(a) * rr, y, Math.sin(a) * rr); d.setMatrixAt(i, m4);
      }
      d.instanceMatrix.needsUpdate = true;
    }
    const s1 = 1 + ((t * 0.5) % 1) * 2.2, s2 = 1 + ((t * 0.5 + 0.5) % 1) * 2.2;
    if (rip1.current) { rip1.current.scale.set(s1, 1, s1); }
    if (rip2.current) rip2.current.scale.set(s2, 1, s2);
    mats.foam.opacity = 0.35 + 0.2 * Math.sin(t * 2);
    if (f1.current) f1.current.rotation.y = t * 0.4;
    if (f2.current) f2.current.rotation.y = -t * 0.5;
    mats.fall.opacity = 0.38 + 0.08 * Math.sin(t * 6);
  });
  const { x, z } = PLAZA_FOUNTAIN, y = townLift(x, z) + 0.1;
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo.basin} material={mats.stone} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={geo.water} material={mats.water} />
      <mesh geometry={geo.column} material={mats.stone} castShadow={shadows} />
      <mesh geometry={geo.bowl1} material={mats.stone} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={geo.pool1} material={mats.water} />
      <mesh geometry={geo.neck} material={mats.trim} castShadow={shadows} />
      <mesh geometry={geo.bowl2} material={mats.stone} castShadow={shadows} />
      <mesh geometry={geo.pool2} material={mats.water} />
      <mesh geometry={geo.knob} material={mats.gold} />
      <mesh ref={f1} geometry={geo.fall1} material={mats.fall} />
      <mesh ref={f2} geometry={geo.fall2} material={mats.fall} />
      <mesh ref={rip1} geometry={geo.ripple} material={mats.foam} position={[0, 0.005, 0]} />
      <mesh ref={rip2} geometry={geo.ripple} material={mats.foam} position={[0, 0.005, 0]} />
      <instancedMesh ref={drops} args={[geo.drop, mats.drop, DROPS]} frustumCulled={false} />
      {/* lily pads + little pink flowers floating in the outer pool */}
      {[[2.5, 0.6], [-2.1, 1.6], [0.4, -2.7], [-1.4, -2.2], [2.2, -1.5]].map(([px, pz], i) => (
        <group key={i} position={[px, 0, pz]} rotation={[0, i * 1.3, 0]}>
          <mesh geometry={geo.pad} material={mats.pad} />
          {i % 2 === 0 && <mesh geometry={geo.flower} material={mats.flower} position={[0.08, 0, 0.04]} />}
        </group>
      ))}
    </group>
  );
}
