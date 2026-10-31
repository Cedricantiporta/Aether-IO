// ============================================================================
// The Hall of the Undying (owner 2026-10-31): the long dark hall between the Dark Castle door and the Void Throne.
// A narrow 132 m hall (engine/gates.ts HALL_*, layout in engine/arenaRooms.ts): rune-carpet floor, two rows of pillars with
// banners, purple-flame braziers as the only light (emissive flames + additive glow pools; just 2 point lights), glowing wall
// windows, a stepped dais + glowing backdrop behind the far portal (the portal itself is the shared exit portal of Room.tsx,
// recoloured dark purple), a few ambient wisps. No monsters. Built once per room version; per-frame work is ~100 instance matrices.
// ============================================================================
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, CanvasTexture, CircleGeometry, Color, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, PointLight, RepeatWrapping, SphereGeometry, SRGBColorSpace,
} from 'three';
import { world } from '../engine/world';
import { HALL_HL, HALL_HW, HALL_PORTAL_Z } from '../engine/gates';
import { HALL_PILLAR_X, HALL_BRAZIER_X, HALL_PILLAR_STEP, HALL_PILLARS, hallPillarZ } from '../engine/arenaRooms';
import { CELL, FX, embers } from './fx';
import { GB, TAU, litMat, mulberry32, setInst } from './util';
import { useWorldCounter } from './hooks';
import { inView } from './view';
import type { QualityCfg } from './quality';

const NB = (HALL_PILLARS - 1) * 2;   // braziers (one between each pair of pillars, both sides)
const NP = HALL_PILLARS * 2;         // pillars / banners
const NW = 18;                       // ambient wisps
const FLOOR_W = HALL_HW * 2 + 0.6, FLOOR_L = HALL_HL * 2 + 2;
const WALL_X = HALL_HW + 0.7;        // wall centre line

let floorTex: CanvasTexture | null = null, glowTex: CanvasTexture | null = null;
/** Soft dark flagstones with a deep-violet rune carpet down the middle (one tile = FLOOR_W m, repeated along the hall). */
function hallFloorTex(): CanvasTexture {
  if (floorTex) return floorTex;
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, rnd = mulberry32(0x7a11);
  g.fillStyle = '#3a2b5e'; g.fillRect(0, 0, N, N);
  const T = 64;
  for (let y = 0; y < N; y += T) for (let x = 0; x < N; x += T) {
    const v = 0.86 + rnd() * 0.22, ck = ((x + y) / T) % 2 ? 1 : 0.88;
    g.fillStyle = `rgb(${Math.round(38 * v * ck)},${Math.round(28 * v * ck)},${Math.round(66 * v * ck)})`;
    g.beginPath(); g.roundRect(x + 2.5, y + 2.5, T - 5, T - 5, 9); g.fill();
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(190,160,255,0.05)'; g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2); }
  // the carpet
  const x0 = N * 0.3, w = N * 0.4;
  g.fillStyle = '#4a2784'; g.fillRect(x0, 0, w, N);
  for (let y = 0; y < N; y += 32) { g.fillStyle = (y / 32) % 2 ? 'rgba(160,110,255,0.10)' : 'rgba(0,0,0,0.10)'; g.fillRect(x0, y, w, 32); }
  g.strokeStyle = '#b58cff'; g.lineWidth = 6; g.shadowColor = '#b58cff'; g.shadowBlur = 10;
  g.strokeRect(x0 + 7, -4, w - 14, N + 8);
  g.lineWidth = 2.5; g.strokeRect(x0 + 18, -4, w - 36, N + 8);
  // rune medallion + little diamonds
  const cx = N / 2, cy = N / 2;
  g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 52, 0, TAU); g.stroke();
  g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, 38, 0, TAU); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU; g.save(); g.translate(cx + Math.cos(a) * 45, cy + Math.sin(a) * 45); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(-5, -5); g.lineTo(0, 5); g.lineTo(5, -5); g.stroke(); g.restore();
  }
  g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 14, cy); g.lineTo(cx, cy + 22); g.lineTo(cx - 14, cy); g.closePath(); g.stroke();
  for (const y of [N * 0.12, N * 0.88]) { g.beginPath(); g.moveTo(cx, y - 14); g.lineTo(cx + 10, y); g.lineTo(cx, y + 14); g.lineTo(cx - 10, y); g.closePath(); g.stroke(); }
  g.shadowBlur = 0;
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, FLOOR_L / FLOOR_W);
  return (floorTex = t);
}
/** A round soft glow (white centre fading out) tinted by the material colour. */
function hallGlowTex(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (glowTex = new CanvasTexture(c));
}
const glowMat = (r: number, g: number, b: number, o: number, map?: CanvasTexture) =>
  new MeshBasicMaterial({ color: new Color(r, g, b), map, transparent: true, opacity: o, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });

const bz = (k: number): number => hallPillarZ(k >> 1) - HALL_PILLAR_STEP / 2;   // brazier k: z (k even = left, odd = right)
const bx = (k: number): number => (k & 1 ? HALL_BRAZIER_X : -HALL_BRAZIER_X);
const pz = (k: number): number => hallPillarZ(k >> 1);
const px = (k: number): number => (k & 1 ? HALL_PILLAR_X : -HALL_PILLAR_X);

function Hall({ q }: { q: QualityCfg }) {
  const res = useMemo(() => {
    // ---- floor
    const fg = new PlaneGeometry(FLOOR_W, FLOOR_L); fg.rotateX(-Math.PI / 2);
    const tex = hallFloorTex();
    const floor = new Mesh(fg, new MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.14, emissive: new Color('#6a44c0'), emissiveMap: tex, emissiveIntensity: 0.3 }));
    floor.position.y = 0.02; floor.receiveShadow = true;
    // ---- walls, end walls, far-end dais + frame
    const b = new GB([0.72, 1.1]), g = new GB([1, 1]);
    const wallC = '#2f2350', trim = '#52417f', plinth = '#3d2f66';
    for (const sx of [-1, 1]) {
      b.box(1.8, 8, FLOOR_L + 2, [sx * WALL_X, 4, 0], wallC);
      b.box(2.5, 0.7, FLOOR_L + 2, [sx * (WALL_X - 0.3), 8.3, 0], trim);
      b.box(1.2, 0.75, FLOOR_L, [sx * (WALL_X - 0.9), 0.37, 0], plinth);
      for (let i = 0; i < HALL_PILLARS - 1; i++) {   // a glowing arched window between each pair of pillars
        const z = hallPillarZ(i) - HALL_PILLAR_STEP / 2;
        b.box(1.9, 4.6, 0.3, [sx * (HALL_HW - 0.1), 4.4, z], trim);
        g.box(1.5, 3.8, 0.16, [sx * (HALL_HW - 0.2), 4.1, z], '#7a3cf0'); g.cyl(0.75, 0.75, 0.16, 12, [sx * (HALL_HW - 0.2), 6.0, z], '#7a3cf0', [0, 0, Math.PI / 2]);
      }
    }
    // the near end: the closed Dark Castle gate the hero just came through
    b.box(22, 9, 2.2, [0, 4.5, HALL_HL + 1.6], wallC); b.box(7.4, 7, 0.9, [0, 3.5, HALL_HL + 0.4], trim); b.box(5.4, 6.2, 0.5, [0, 3.1, HALL_HL + 0.1], '#150d26');
    for (let i = 0; i < 5; i++) b.box(0.22, 5.8, 0.3, [-2 + i, 3.0, HALL_HL - 0.2], '#4a3a6e');
    g.box(0.5, 0.5, 0.2, [0, 6.6, HALL_HL - 0.1], '#9b5cff', [0, 0, Math.PI / 4]);
    // the far end: a great stone frame round the portal, a stepped dais and crystals
    const zE = HALL_PORTAL_Z;
    b.box(26, 15, 2.6, [0, 7.5, zE - 8.6], wallC);
    for (const sx of [-1, 1]) {
      b.cyl(1.0, 1.25, 12, 12, [sx * 6.2, 6, zE - 4.4], trim); b.cyl(1.5, 1.5, 0.7, 12, [sx * 6.2, 12.2, zE - 4.4], plinth); b.sph(1.1, [sx * 6.2, 12.9, zE - 4.4], trim, [1, 0.6, 1], 10);
      g.octa(0.55, [sx * 4.4, 2.0, zE - 3.6], '#a56bff', [1, 2.6, 1]); g.octa(0.35, [sx * 3.6, 1.2, zE - 2.4], '#c8a0ff', [1, 2.2, 1]);
    }
    b.box(15, 1.6, 1.4, [0, 10.4, zE - 4.4], trim);
    b.cyl(6.2, 6.6, 0.3, 24, [0, 0.15, zE], plinth); b.cyl(5.2, 5.6, 0.3, 24, [0, 0.42, zE], '#4a3a76');
    g.torus(5.4, 0.07, [0, 0.6, zE], '#b58cff', [Math.PI / 2, 0, 0], 1, 40);
    const body = new Mesh(b.build(), litMat({ roughness: 0.85 })); body.castShadow = false; body.receiveShadow = true;
    const glow = new Mesh(g.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.3, 0.8, 2.0) }));
    // ---- pillars + banners (instanced)
    const pb = new GB([0.78, 1.1]);
    pb.box(1.6, 0.5, 1.6, [0, 0.25, 0], '#4b3a78'); pb.cyl(0.5, 0.6, 6.4, 12, [0, 3.7, 0], '#3f3066'); pb.cyl(0.66, 0.66, 0.35, 12, [0, 1.0, 0], '#6a58a0'); pb.cyl(0.66, 0.66, 0.35, 12, [0, 6.3, 0], '#6a58a0');
    pb.box(1.5, 0.4, 1.5, [0, 7.05, 0], '#4b3a78'); pb.sph(0.82, [0, 7.4, 0], '#5a488a', [1, 0.5, 1], 10);
    const pillars = new InstancedMesh(pb.build(), litMat({ roughness: 0.8 }), NP); pillars.frustumCulled = false; pillars.castShadow = true;
    const bn = new GB([0.85, 1.05]);
    bn.box(1.5, 0.12, 0.12, [0, 0.0, 0], '#8a7040'); bn.box(1.1, 2.7, 0.07, [0, -1.4, 0], '#5a2aa8'); bn.box(0.8, 0.8, 0.07, [0, -2.8, 0], '#5a2aa8', [0, 0, Math.PI / 4]);
    bn.box(0.16, 2.3, 0.09, [0, -1.3, 0.02], '#f2dc8a'); bn.octa(0.2, [0, -1.0, 0.07], '#f2dc8a', [1, 1.3, 0.4]);
    const banners = new InstancedMesh(bn.build(), litMat({ roughness: 0.95, side: DoubleSide }), NP); banners.frustumCulled = false;
    for (let k = 0; k < NP; k++) setInst(pillars, k, px(k), 0, pz(k), 0);
    pillars.instanceMatrix.needsUpdate = true;
    // ---- braziers: bowls (lit) + flames (emissive) + floor glow pools (additive)
    const bb = new GB([0.75, 1.1]);
    bb.cyl(0.14, 0.24, 1.3, 8, [0, 0.65, 0], '#3a2c5c'); bb.cyl(0.66, 0.36, 0.42, 10, [0, 1.46, 0], '#4f3d80'); bb.torus(0.64, 0.07, [0, 1.68, 0], '#b58cff', [Math.PI / 2, 0, 0], 1, 12);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; bb.box(0.1, 0.8, 0.1, [Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3], '#3a2c5c', [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); }
    const bowls = new InstancedMesh(bb.build(), litMat({ roughness: 0.7 }), NB); bowls.frustumCulled = false; bowls.castShadow = true;
    const fl = new GB([1, 1]);
    fl.cone(0.48, 1.35, 7, [0, 2.4, 0], '#8a3dff'); fl.cone(0.3, 0.95, 6, [0, 2.3, 0], '#cf9bff'); fl.sph(0.14, [0, 2.0, 0], '#ffffff', 1, 6);
    const flames = new InstancedMesh(fl.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.1, 2.2) }), NB); flames.frustumCulled = false;
    const pools = new InstancedMesh(new CircleGeometry(4.2, 20).rotateX(-Math.PI / 2), glowMat(0.45, 0.16, 0.95, 0.5, hallGlowTex()), NB); pools.frustumCulled = false; pools.renderOrder = 2;
    for (let k = 0; k < NB; k++) { setInst(bowls, k, bx(k), 0, bz(k), k * 1.3); setInst(pools, k, bx(k), 0.045, bz(k), 0); }
    bowls.instanceMatrix.needsUpdate = true; pools.instanceMatrix.needsUpdate = true;
    // ---- glow behind the far portal + a soft light beam above it
    const halo = new Mesh(new PlaneGeometry(22, 16), glowMat(0.34, 0.1, 0.8, 0.55, hallGlowTex())); halo.position.set(0, 5, zE - 3.2); halo.renderOrder = 2;
    // ---- wisps
    const wisps = new InstancedMesh(new SphereGeometry(0.13, 6, 5), glowMat(1.0, 0.7, 2.2, 0.85), NW); wisps.frustumCulled = false;
    const ws = new Float32Array(NW * 4), r = mulberry32(0x3c9d);
    for (let i = 0; i < NW; i++) { ws[i * 4] = (r() - 0.5) * 9; ws[i * 4 + 1] = r() * (HALL_HL * 2 - 8); ws[i * 4 + 2] = r() * TAU; ws[i * 4 + 3] = 0.4 + r() * 0.5; }
    return { floor, body, glow, pillars, banners, bowls, flames, pools, halo, wisps, ws };
  }, []);
  const light = useRef<PointLight>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, p = world.player.pos;
    // flames flicker (only those near the view)
    for (let k = 0; k < NB; k++) {
      const x = bx(k), z = bz(k);
      if (!inView(x, z, 6)) { setInst(res.flames, k, x, -20, z, 0); continue; }
      const f = 1 + Math.sin(t * 9 + k * 1.7) * 0.13 + Math.sin(t * 5.3 + k) * 0.08;
      setInst(res.flames, k, x, 0, z, t * 0.6 + k, f, f * 1.15, f);
      if (dt > 0 && Math.abs(z - p.z) < 34 && Math.random() < dt * 2.2) embers(x, 2.9, z, 1, 0xa66bff, 0.25, 2.2, 1.1, 0.14);
    }
    res.flames.instanceMatrix.needsUpdate = true;
    (res.pools.material as MeshBasicMaterial).opacity = 0.42 + Math.sin(t * 2.1) * 0.08;
    (res.halo.material as MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 1.3) * 0.1;
    // banners sway a little
    for (let k = 0; k < NP; k++) {
      const inward = px(k) > 0 ? -1 : 1;
      setInst(res.banners, k, px(k) + inward * 0.2, 6.0, pz(k), inward * Math.PI / 2, 1, 1, 1, Math.sin(t * 0.9 + k * 0.7) * 0.05, Math.sin(t * 0.7 + k) * 0.03);
    }
    res.banners.instanceMatrix.needsUpdate = true;
    // wisps drift down the hall
    const L = HALL_HL * 2 - 8;
    for (let i = 0; i < NW; i++) {
      const a = res.ws[i * 4 + 2] + t * res.ws[i * 4 + 3] * 0.5;
      const z = ((res.ws[i * 4 + 1] + t * 0.7 * res.ws[i * 4 + 3]) % L) - L / 2;
      setInst(res.wisps, i, res.ws[i * 4] + Math.sin(a) * 0.8, 1.3 + Math.sin(a * 1.7 + i) * 0.5, z, 0, 0.8 + Math.sin(a * 2) * 0.25);
    }
    res.wisps.instanceMatrix.needsUpdate = true;
    // the hero's own soft light + motes gathering round the far portal
    if (light.current) light.current.position.set(p.x, 4.5, p.z);
    const dp = Math.abs(p.z - HALL_PORTAL_Z);
    if (dt > 0 && dp < 52 && Math.random() < dt * 22) {
      const a = Math.random() * TAU, rr = 2.5 + Math.random() * 3.2;
      FX.add.emit(Math.cos(a) * rr, 0.3 + Math.random() * 4, HALL_PORTAL_Z + Math.sin(a) * rr * 0.6, -Math.cos(a) * 0.9, 0.7 + Math.random() * 0.8, -Math.sin(a) * 0.5, 1.5, 0.3, 0.04, 1.0, 0.35, 2.2, 0.9, CELL.GLOW);
    }
  });
  return (
    <>
      <primitive object={res.floor} />
      <primitive object={res.body} />
      <primitive object={res.glow} />
      <primitive object={res.pillars} />
      <primitive object={res.banners} />
      <primitive object={res.bowls} />
      <primitive object={res.flames} />
      <primitive object={res.pools} />
      <primitive object={res.halo} />
      <primitive object={res.wisps} />
      {q.lights && <pointLight position={[0, 6, HALL_PORTAL_Z + 3]} color="#8a3dff" intensity={38} distance={32} decay={1.5} />}
      {q.lights && <pointLight ref={light} position={[0, 4.5, HALL_HL - 6]} color="#b49cff" intensity={11} distance={20} decay={1.6} />}
    </>
  );
}

/** Mount: only while the current room is the Hall of the Undying. */
export function DarkHall({ q }: { q: QualityCfg }) {
  const sig = useWorldCounter(() => (world.room.active && world.room.plan.type === 'HALL' ? 1 + world.room.version : 0));
  if (!sig) return null;
  return <Hall key={sig} q={q} />;
}
