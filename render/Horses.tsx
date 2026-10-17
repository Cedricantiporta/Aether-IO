// (owner) The stable horses (townData ANIMALS 'HORSE'): smooth rounded bodies with jointed legs, neck and tail, animated
// from the engine's animal state (engine/systems/npcs.ts animals[]: moving / hop phase / joy / ridden). Walk = four-beat
// leg cycle, gallop (ridden at speed) = bounding gait with body pitch; idle = grazing, tail swish, ear flicks, head toss.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, Group, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANIMALS } from '../engine/townData';
import { animals } from '../engine/systems/npcs';
import { world } from '../engine/world';
import { liftAt } from './lift';
import { dustPuff } from './fx';
import { GB } from './util';

const HORSES = ANIMALS.map((a, i) => ({ a, i })).filter((h) => h.a.kind === 'HORSE');
const MANE: Record<string, string> = { '#8a5a36': '#2a1a12', '#f2ece0': '#c9bfae', '#3a2c26': '#120d0b' };
/** Leg pivots: [x, z, walk phase offset, gallop phase offset, front?] */
const LEGS: [number, number, number, number, boolean][] = [
  [-0.2, 0.56, 0, 0, true], [0.2, 0.56, Math.PI, 0.35, true], [-0.2, -0.56, Math.PI * 1.5, Math.PI, false], [0.2, -0.56, Math.PI * 0.5, Math.PI + 0.35, false],
];
/** Rider bob must match render/Hero.tsx (ridden horses bob abs(sin(hop)) x 0.12). */
const bobOf = (moving: boolean, ridden: boolean, hop: number): number => (moving ? Math.abs(Math.sin(hop)) * (ridden ? 0.12 : 0.05) : 0);

type Geo = BufferGeometry;
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _v = new Vector3(), _s = new Vector3();
/** Bake a (pos, euler-XYZ, scale) transform into a built geometry. */
const xf = (g: Geo, p: [number, number, number], r: [number, number, number], sc: number): Geo => g.applyMatrix4(_m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.setScalar(sc)));
const merge = (gs: Geo[]): Geo => { const g = mergeGeometries(gs, false)!; for (const x of gs) x.dispose(); return g; };
const FLAT: [number, number] = [1, 1];

interface HorseGeos { body: Geo; neck: Geo; tail: Geo; upper: Geo[]; lower: Geo[] }
const GEO_CACHE = new Map<string, HorseGeos>();
/** The whole horse as 11 vertex-coloured static geometries (body, neck + head, tail, 4 x thigh, 4 x shin + hoof) sharing ONE material:
 *  ~28 draw calls per horse became 11. Built once per coat colour. */
function horseGeos(tint: string): HorseGeos {
  const hit = GEO_CACHE.get(tint); if (hit) return hit;
  const mane = MANE[tint] ?? '#2a1a12', hoof = '#2a2420', saddle = '#7a2e1c', blanket = '#2f5c8a', eye = '#111111';
  const body = new GB(FLAT);
  body.add(new CapsuleGeometry(0.37, 0.95, 4, 12), [0, 1.24, 0], [Math.PI / 2, 0, 0], [0.95, 1, 1.02], tint);
  body.add(new SphereGeometry(1, 12, 8), [0, 1.3, 0.5], [0, 0, 0], [0.37, 0.41, 0.42], tint);
  body.add(new SphereGeometry(1, 12, 8), [0, 1.32, -0.52], [0, 0, 0], [0.4, 0.42, 0.42], tint);
  body.add(new CylinderGeometry(0.4, 0.42, 0.09, 14), [0, 1.58, 0], [0, 0, 0], [1.02, 0.6, 1.25], blanket);   // blanket + saddle (rider sits at y 1.62, render/Hero.tsx RIDE_SEAT_Y)
  body.add(new CylinderGeometry(0.4, 0.42, 0.09, 14), [0, 1.63, -0.02], [0, 0, 0], [0.82, 1, 0.95], saddle);
  body.add(new SphereGeometry(1, 6, 5), [0, 1.7, 0.3], [0, 0, 0], [0.1, 0.09, 0.08], saddle);
  const neck = new GB(FLAT);
  neck.add(new CapsuleGeometry(0.22, 0.62, 4, 10), [0, 0.4, 0], [0, 0, 0], [0.85, 1, 1.15], tint);
  neck.add(new SphereGeometry(1, 6, 5), [0, 0.44, -0.2], [0, 0, 0], [0.08, 0.48, 0.1], mane);
  const head = new GB(FLAT);
  head.add(new CapsuleGeometry(0.14, 0.34, 4, 8), [0, 0.2, 0], [0, 0, 0], 1, tint);
  head.add(new SphereGeometry(1, 8, 6), [0, 0.43, -0.02], [0, 0, 0], [0.13, 0.14, 0.12], tint);
  head.add(new SphereGeometry(1, 6, 5), [0, -0.05, -0.09], [0, 0, 0], [0.05, 0.12, 0.07], mane);
  for (const sx of [-1, 1]) {
    head.add(new SphereGeometry(1, 5, 4), [sx * 0.125, 0.1, -0.04], [0, 0, 0], 0.032, eye);
    const ear = new GB(FLAT); ear.add(new ConeGeometry(0.05, 0.16, 5), [0, 0.08, 0], [0, 0, 0], 1, tint);   // (ears are static now: the flick was invisible at play distance)
    head.parts.push(xf(ear.build(), [sx * 0.08, -0.08, -0.1], [-1.4, 0, sx * 0.15], 1));
  }
  neck.parts.push(xf(head.build(), [0, 0.8, 0.04], [1.75, 0, 0], 1.55));
  const tail = new GB(FLAT); tail.add(new CapsuleGeometry(0.075, 0.5, 3, 6), [0, -0.32, 0], [0, 0, 0], 1, mane);
  const upper: Geo[] = [], lower: Geo[] = [];
  for (let k = 0; k < 4; k++) {
    const u = new GB(FLAT); u.add(new CapsuleGeometry(0.115, 0.34, 3, 8), [0, -0.27, 0], [0, 0, 0], 1, tint); upper.push(u.build());
    const l = new GB(FLAT); l.add(new CapsuleGeometry(0.078, 0.3, 3, 7), [0, -0.22, 0], [0, 0, 0], 1, tint); l.add(new CylinderGeometry(0.095, 0.115, 0.12, 8), [0, -0.48, 0], [0, 0, 0], 1, hoof); lower.push(l.build());
  }
  const out = { body: merge(body.parts), neck: merge(neck.parts), tail: merge(tail.parts), upper, lower };
  GEO_CACHE.set(tint, out);
  return out;
}
let horseMat: MeshStandardMaterial | null = null;
const getHorseMat = () => horseMat || (horseMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }));

function Horse({ i, tint }: { i: number; tint: string }) {
  const geos = useMemo(() => horseGeos(tint), [tint]);
  const mat = getHorseMat();
  const root = useRef<Group>(null!), body = useRef<Group>(null!), neck = useRef<Group>(null!), tail = useRef<Group>(null!);
  const upper = useRef<(Group | null)[]>([]), knee = useRef<(Group | null)[]>([]);
  const graze = useRef(0);
  useFrame((_, dt) => {
    const a = animals[i]; if (!a || !root.current) return;
    // (perf) out of the visible ground rect (+ margin): skip the whole animation + draw
    const V = world.view, vis = !V.on || (a.x >= V.minX - 2 && a.x <= V.maxX + 2 && a.z >= V.minZ - 2 && a.z <= V.maxZ + 2) || a.ridden;
    if (root.current.visible !== vis) root.current.visible = vis;
    if (!vis) return;
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
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={geos.body} material={mat} castShadow />
        <group ref={neck} position={[0, 1.45, 0.72]}>
          <mesh geometry={geos.neck} material={mat} castShadow />
        </group>
        <group ref={tail} position={[0, 1.42, -0.92]}>
          <mesh geometry={geos.tail} material={mat} />
        </group>
        {/* legs: hip / shoulder pivot -> knee pivot -> hoof */}
        {LEGS.map(([x, z], k) => (
          <group key={k} ref={(g) => { upper.current[k] = g; }} position={[x, 1.08, z]}>
            <mesh geometry={geos.upper[k]} material={mat} castShadow />
            <group ref={(g) => { knee.current[k] = g; }} position={[0, -0.54, 0]}>
              <mesh geometry={geos.lower[k]} material={mat} castShadow />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

export function Horses() {
  return <>{HORSES.map(({ a, i }) => <Horse key={i} i={i} tint={a.tint} />)}</>;
}
