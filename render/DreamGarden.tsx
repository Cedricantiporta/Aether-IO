// (owner) The Font dream (director plan.dream): the Greenwood clearing turned into a garden - a sea of flowers either side
// of the walk and a clear stream winding across it, with a little wooden footbridge where the walk to Aelia crosses it.
// Decoration only (the stream is shallow: no colliders). Built once per dream room from where the hero woke.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, CanvasTexture, Points, PointsMaterial, SRGBColorSpace, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { GB, litMat, mulberry32 } from './util';

const PETALS = ['#ff9ec4', '#ffffff', '#ffd75e', '#b9a6ff', '#ff7a8a', '#8fd0ff', '#ffb36b', '#f6c8ff'];
const MAX_FLOWERS = 1400;

interface Garden { flowers: { x: number; z: number; s: number; r: number; c: number }[]; river: BufferGeometry; deco: BufferGeometry }

function buildGarden(): Garden {
  const R = world.room.radius, p = world.player.pos, l = Math.hypot(p.x, p.z) || 1;
  const ux = -p.x / l, uz = -p.z / l, vx = -uz, vz = ux;          // u: from where you woke toward Aelia; v: across
  const rnd = mulberry32(((p.x * 131) ^ (p.z * 977)) | 0);
  // the stream: a ribbon across the clearing (perpendicular to the walk), crossing it a little past the middle
  const mx = ux * R * 0.12, mz = uz * R * 0.12, W = 1.7;
  const cl = (s: number): [number, number] => { const o = Math.sin(s * 0.16) * 2.4 + Math.sin(s * 0.41 + 1) * 0.7; return [mx + vx * s + ux * o, mz + vz * s + uz * o]; };
  const pos: number[] = [], idx: number[] = [], deco = new GB([0.85, 1.08]);
  let n = 0;
  for (let s = -R * 1.05; s <= R * 1.05; s += 0.8) {
    const [cx, cz] = cl(s), [nx, nz] = cl(s + 0.8), tx = nx - cx, tz = nz - cz, tl = Math.hypot(tx, tz) || 1, ox = -tz / tl, oz = tx / tl;
    const w = W * (0.9 + Math.sin(s * 0.7) * 0.15);
    pos.push(cx + ox * w, 0.05, cz + oz * w, cx - ox * w, 0.05, cz - oz * w);
    if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    n++;
    if (Math.hypot(cx, cz) < R - 1) for (const sd of [-1, 1]) if (rnd() < 0.55 && Math.abs(s) > 3.2) {   // bank pebbles (clear of the bridge)
      const d = w + 0.25 + rnd() * 0.4; deco.sph(0.22 + rnd() * 0.3, [cx + ox * d * sd, 0.05, cz + oz * d * sd], rnd() < 0.5 ? '#9aa0a6' : '#b8b4a8', [1.2, 0.5, 1], 6, [0, rnd() * 6, 0]);
    }
  }
  const river = new BufferGeometry(); river.setAttribute('position', new Float32BufferAttribute(pos, 3)); river.setIndex(idx); river.computeVertexNormals();
  // the footbridge over the stream where the walk crosses it (deck along u, a gentle hump)
  { const [bx, bz] = cl(0), yaw = Math.atan2(ux, uz);
    const at = (a: number, b: number, y: number): [number, number, number] => [bx + ux * a + vx * b, y, bz + uz * a + vz * b];
    for (let k = -6; k <= 6; k++) { const a = k * 0.42, y = 0.32 * (1 - (k / 6.5) ** 2) + 0.05; deco.box(2.0, 0.1, 0.36, at(a, 0, y), k % 2 ? '#b07c48' : '#9a6a3c', [0, yaw, 0]); }
    for (const sd of [-1, 1]) {
      for (let k = -6; k <= 6; k += 3) { const a = k * 0.42, y = 0.32 * (1 - (k / 6.5) ** 2); deco.cyl(0.06, 0.06, 0.7, 5, at(a, sd * 0.95, y + 0.35), '#7a5230'); }
      for (let k = -6; k < 6; k += 3) { const a0 = k * 0.42, a1 = (k + 3) * 0.42, y0 = 0.32 * (1 - (k / 6.5) ** 2), y1 = 0.32 * (1 - ((k + 3) / 6.5) ** 2), am = (a0 + a1) / 2;
        deco.box(0.07, 0.07, 1.3, at(am, sd * 0.95, (y0 + y1) / 2 + 0.68), '#8a5e36', [Math.atan2(y0 - y1, 1.26), yaw, 0]); }
    }
  }
  // flowers everywhere: clear of the walk (a band round the line through the middle) and of the stream
  const flowers: Garden['flowers'] = [];
  for (let t = 0; t < 6000 && flowers.length < MAX_FLOWERS; t++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (R - 1.2), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const along = x * ux + z * uz, across = x * vx + z * vz;
    if (Math.abs(across - (Math.sin(along * 0.11) * 1.2)) < 2.4) continue;   // the walk
    const [rx, rz] = cl(across);
    if (Math.hypot(x - rx, z - rz) < W + 0.8) continue;                        // the stream
    flowers.push({ x, z, s: 0.75 + rnd() * 0.6, r: rnd() * 6.28, c: (rnd() * PETALS.length) | 0 });
  }
  return { flowers, river, deco: deco.build() };
}

function flowerGeo(): BufferGeometry {
  const b = new GB([0.9, 1.08]);
  b.cyl(0.02, 0.025, 0.36, 4, [0, 0.18, 0], '#3f8a3a');
  b.box(0.16, 0.02, 0.07, [0.07, 0.12, 0], '#4f9a44', [0, 0, 0.5]);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.sph(0.075, [Math.cos(a) * 0.08, 0.38, Math.sin(a) * 0.08], '#ffffff', [1, 0.45, 1], 5); }
  b.sph(0.05, [0, 0.4, 0], '#ffe9a0', 1, 5);
  return b.build();
}

export function DreamGarden() {
  const [ver, setVer] = useState(0);
  const [garden, setGarden] = useState<Garden | null>(null);
  useEffect(() => events.on('roomEnter', () => setVer((v) => v + 1)), []);
  useEffect(() => {
    setGarden(null);
    const t = setTimeout(() => { if (world.room.active && world.room.plan.dream) setGarden(buildGarden()); }, 120);   // (once the hero is placed)
    return () => clearTimeout(t);
  }, [ver]);
  useEffect(() => () => { garden?.river.dispose(); garden?.deco.dispose(); }, [garden]);
  if (!garden) return null;
  return <GardenMeshes g={garden} />;
}

function GardenMeshes({ g }: { g: Garden }) {
  const geo = useMemo(flowerGeo, []);
  const mat = useMemo(() => litMat({ roughness: 0.8 }), []);
  const water = useMemo(() => new MeshStandardMaterial({ color: '#6cc4f0', emissive: new Color('#2a7ab0'), emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, side: DoubleSide }), []);
  const decoMat = useMemo(() => litMat({ roughness: 0.9 }), []);
  const inst = useRef<InstancedMesh>(null!);
  useEffect(() => {
    const o = new Object3D(), c = new Color();
    g.flowers.forEach((f, i) => { o.position.set(f.x, 0, f.z); o.rotation.set(0, f.r, 0); o.scale.setScalar(f.s); o.updateMatrix(); inst.current.setMatrixAt(i, o.matrix); inst.current.setColorAt(i, c.set(PETALS[f.c])); });
    inst.current.count = g.flowers.length; inst.current.instanceMatrix.needsUpdate = true; if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true;
  }, [g]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); water.dispose(); decoMat.dispose(); }, [geo, mat, water, decoMat]);
  useFrame(({ clock }) => { water.emissiveIntensity = 0.22 + Math.sin(clock.elapsedTime * 1.6) * 0.08; });
  return (
    <>
      <instancedMesh ref={inst} args={[geo, mat, MAX_FLOWERS]} frustumCulled={false} receiveShadow />
      <mesh geometry={g.river} material={water} receiveShadow />
      <DreamMotes />
      <mesh geometry={g.deco} material={decoMat} castShadow receiveShadow />
    </>
  );
}

/** Slow drifting light motes / petals round the hero: one Points draw (40 points), updated per frame without allocation. */
const N_MOTES = 40;
function DreamMotes() {
  const pts = useRef<Points>(null!);
  const { geo, base, mat } = useMemo(() => {
    const r = mulberry32(5), base = new Float32Array(N_MOTES * 5);   // dx, y, dz, phase, speed
    for (let i = 0; i < N_MOTES; i++) { const a = r() * 6.283, d = 2 + r() * 20; base[i * 5] = Math.cos(a) * d; base[i * 5 + 1] = 0.4 + r() * 3.2; base[i * 5 + 2] = Math.sin(a) * d; base[i * 5 + 3] = r() * 6.283; base[i * 5 + 4] = 0.15 + r() * 0.3; }
    const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(new Float32Array(N_MOTES * 3), 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.4, 'rgba(255,225,190,0.5)'); g.addColorStop(1, 'rgba(255,210,230,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const map = new CanvasTexture(cv); map.colorSpace = SRGBColorSpace;
    const mat = new PointsMaterial({ map, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
    return { geo, base, mat };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.map?.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, a = geo.attributes.position.array as Float32Array, px = world.player.pos.x, pz = world.player.pos.z;
    mat.opacity = 0.55 + 0.25 * Math.sin(t * 0.8);
    for (let i = 0; i < N_MOTES; i++) {
      const b = i * 5, ph = base[b + 3] + t * base[b + 4];
      a[i * 3] = px + base[b] + Math.sin(ph) * 1.8; a[i * 3 + 1] = base[b + 1] + Math.sin(ph * 1.3) * 0.6 + ((t * 0.08 + base[b + 3]) % 1) * 0.5; a[i * 3 + 2] = pz + base[b + 2] + Math.cos(ph * 0.8) * 1.8;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}
