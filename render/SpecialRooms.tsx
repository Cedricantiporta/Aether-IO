// Set pieces of the hand-laid rooms (engine/arenaRooms.ts): the dark hero DUEL ring (dark flagstones, a red rune circle,
// eight braziers), the GATEKEEPER courtyard (five trial gates, the hooded Gatekeeper statue, the Dark Castle with its
// five key sockets) and the FOUNTAIN plaza (marble floor, columns, a tiered glowing fountain, drifting petals and motes).
// Built once per room (keyed by world.room.version); per-frame work is a few uniforms / instanced matrices.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Euler, Matrix4, Object3D, PlaneGeometry, Quaternion, RingGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { thinArrowGeo } from './arrowGeo';
import { events } from '../engine/events';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Flame, Lock, Unlock, Skull } from '../ui/components/GoldIcons';
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { runInfo } from '../engine/runMods';
import { GATES, GATE_KEYS_NEEDED, gateState, gatePos, CASTLE_DOOR, KEEPER_POS } from '../engine/gates';
import { PLAZA_COLS, PLAZA_COL_R, MOAT_R, MOAT_HW, DUEL_BRAZIERS } from '../engine/arenaRooms';
import { shape } from '../engine/roomShape';
import { CELL, FX, embers } from './fx';
import { GB, TAU, litMat, mulberry32, setInst } from './util';
import { useWorldCounter } from './hooks';
import type { QualityCfg } from './quality';

// ------------------------------------------------------------- textures ----
const texCache: Record<string, CanvasTexture> = {};
/** Concentric flagstone rings (shared look for the duel ring and the courtyard); `rune` draws a glowing circle of glyphs. */
function flagTex(key: string, base: [number, number, number], mortar: string, rune: string | null): CanvasTexture {
  if (texCache[key]) return texCache[key];
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(key.length * 7919 + 13);
  g.fillStyle = mortar; g.fillRect(0, 0, N, N);
  const cx = N / 2, ringW = 30;
  for (let r0 = 0; r0 < N * 0.72; r0 += ringW) {
    const n = Math.max(5, Math.round((Math.PI * 2 * (r0 + ringW / 2)) / 46));
    const off = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU + 0.015, a1 = off + ((i + 1) / n) * TAU - 0.015;
      const v = 0.75 + rnd() * 0.4;
      g.fillStyle = `rgb(${Math.round(base[0] * v)},${Math.round(base[1] * v)},${Math.round(base[2] * v)})`;
      g.beginPath(); g.arc(cx, cx, r0 + ringW - 2.5, a0, a1); g.arc(cx, cx, Math.max(0, r0 + 2.5), a1, a0, true); g.closePath(); g.fill();
    }
  }
  for (let i = 0; i < 7000; i++) { const x = rnd() * N, y = rnd() * N, s = 1 + rnd() * 2.5; g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)'; g.fillRect(x, y, s, s); }
  if (rune) {
    g.strokeStyle = rune; g.lineWidth = 7; g.shadowColor = rune; g.shadowBlur = 18;
    g.beginPath(); g.arc(cx, cx, N * 0.3, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, N * 0.27, 0, TAU); g.stroke();
    for (let i = 0; i < 16; i++) {   // glyphs between the two circles
      const a = (i / 16) * TAU, x = cx + Math.cos(a) * N * 0.285, y = cx + Math.sin(a) * N * 0.285;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.moveTo(-7, -6); g.lineTo(0, 6); g.lineTo(7, -6); if (i % 2) { g.moveTo(-6, 0); g.lineTo(6, 0); } g.stroke();
      g.restore();
    }
    g.shadowBlur = 0;
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  texCache[key] = t;
  return t;
}
/** White marble tiles with grey veins and a gold inlay ring (fountain plaza). */
function marbleTex(): CanvasTexture {
  if (texCache.marble) return texCache.marble;
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, rnd = mulberry32(0x3a7b1e);
  g.fillStyle = '#cfc8bd'; g.fillRect(0, 0, N, N);
  const T = 64;
  for (let y = 0; y < N; y += T) for (let x = 0; x < N; x += T) {
    const v = 0.9 + rnd() * 0.12, w = ((x / T + y / T) % 2) ? 1 : 0.94;
    g.fillStyle = `rgb(${Math.round(238 * v * w)},${Math.round(232 * v * w)},${Math.round(222 * v * w)})`; g.fillRect(x + 1.5, y + 1.5, T - 3, T - 3);
  }
  g.strokeStyle = 'rgba(120,115,125,0.28)'; g.lineWidth = 1.4;
  for (let i = 0; i < 60; i++) { let x = rnd() * N, y = rnd() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.3) * 50; g.lineTo(x, y); } g.stroke(); }
  const cx = N / 2;
  for (const [r, w, col] of [[N * 0.47, 10, '#b8913a'], [N * 0.44, 3, '#d8b45a'], [N * 0.2, 6, '#b8913a']] as [number, number, string][]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(cx, cx, r, 0, TAU); g.stroke(); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.fillStyle = '#9fb8d8'; g.beginPath(); g.ellipse(cx + Math.cos(a) * N * 0.32, cx + Math.sin(a) * N * 0.32, 20, 9, a, 0, TAU); g.fill(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  texCache.marble = t;
  return t;
}

const glowM = (r: number, g: number, b: number, o = 0.9) => new MeshBasicMaterial({ color: new Color(r, g, b), transparent: true, opacity: o, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });

// ------------------------------------------------------------- duel ring ---
function DuelArena({ R, q }: { R: number; q: QualityCfg }) {
  const res = useMemo(() => {
    const fg = new CircleGeometry(R + 3.5, 72); fg.rotateX(-Math.PI / 2);
    const floor = new Mesh(fg, new MeshStandardMaterial({ map: flagTex('duel', [72, 64, 78], '#17131c', '#ff2a3a'), roughness: 0.92 }));
    floor.position.y = 0.012; floor.receiveShadow = true;
    const rg = new RingGeometry(R * 0.6 - 0.18, R * 0.6 + 0.18, 96); rg.rotateX(-Math.PI / 2);
    const rune = new Mesh(rg, glowM(1.8, 0.15, 0.3, 0.5)); rune.position.y = 0.03;
    const b = new GB([0.75, 1.1]);
    b.cyl(0.18, 0.28, 1.5, 6, [0, 0.75, 0], '#2a2430'); b.cyl(0.75, 0.45, 0.45, 10, [0, 1.6, 0], '#3a3240'); b.torus(0.72, 0.07, [0, 1.82, 0], '#7a6a50', [Math.PI / 2, 0, 0], 1, 12);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; b.box(0.1, 0.9, 0.1, [Math.cos(a) * 0.45, 0.3, Math.sin(a) * 0.45], '#2a2430', [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]); }
    const f = new GB([1, 1]); f.cone(0.5, 1.3, 7, [0, 2.4, 0], '#ff7a2a'); f.cone(0.28, 0.9, 6, [0, 2.3, 0], '#ffe08a');
    const n = DUEL_BRAZIERS;
    const bodies = new InstancedMesh(b.build(), litMat({ roughness: 0.8 }), n), flames = new InstancedMesh(f.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.2, 1.0) }), n);
    bodies.castShadow = true;
    const pos: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.PI / n; const x = Math.cos(a) * (R - 1.4), z = Math.sin(a) * (R - 1.4); pos.push([x, z]); setInst(bodies, i, x, 0, z, a); }
    bodies.instanceMatrix.needsUpdate = true;
    return { floor, rune, bodies, flames, pos };
  }, [R]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    (res.rune.material as MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2.2) * 0.15;
    for (let i = 0; i < res.pos.length; i++) {
      const k = 1 + Math.sin(t * 11 + i * 1.7) * 0.12 + Math.sin(t * 6.3 + i) * 0.08;
      setInst(res.flames, i, res.pos[i][0], 0, res.pos[i][1], t * 0.5 + i, k, k * 1.15, k);
      if (dt > 0 && Math.random() < dt * 6) embers(res.pos[i][0], 2.6, res.pos[i][1], 1, 0xff8a2a, 0.3, 2.6, 0.9, 0.16);
    }
    res.flames.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <primitive object={res.floor} />
      <primitive object={res.rune} />
      <primitive object={res.bodies} />
      <primitive object={res.flames} />
      {q.lights && <pointLight position={[0, 6, 0]} color="#ff4a3a" intensity={30} distance={R * 2} decay={1.4} />}
    </>
  );
}

// ------------------------------------------------------------- courtyard ---
const gp: [number, number] = [0, 0];
function castleGeo() {
  const b = new GB([0.7, 1.08]), g = new GB([1, 1]);
  const stone = '#4a4260', trim = '#6e6288', roof = '#241c34';
  const z0 = CASTLE_DOOR[1] - 3.2;   // wall face
  b.box(28, 9, 3, [0, 4.5, z0 - 1.5], stone);                                   // curtain wall
  for (let x = -13.5; x <= 13.5; x += 2.25) b.box(1.2, 1.1, 3.2, [x, 9.5, z0 - 1.5], trim);   // crenellations
  for (const sx of [-1, 1]) {                                                    // flanking towers
    b.cyl(3.1, 3.4, 15, 10, [sx * 14.5, 7.5, z0 - 2], stone); b.cyl(3.5, 3.5, 1, 10, [sx * 14.5, 15.3, z0 - 2], trim);
    b.cone(3.6, 6, 10, [sx * 14.5, 18.8, z0 - 2], roof);
    g.box(0.6, 1.4, 0.2, [sx * 14.5, 10, z0 + 1.35], '#ff3a4a'); g.box(0.6, 1.4, 0.2, [sx * 14.5, 5.5, z0 + 1.35], '#ff3a4a');
  }
  b.box(12, 18, 7, [0, 9, z0 - 7], stone); b.box(12.6, 1, 7.6, [0, 18.2, z0 - 7], trim);   // keep
  b.cone(5.2, 9, 4, [0, 23, z0 - 7], roof, [0, Math.PI / 4, 0]);
  for (const sx of [-1, 1]) { b.cyl(1.4, 1.6, 22, 8, [sx * 5.8, 11, z0 - 4.2], stone); b.cone(1.8, 5, 8, [sx * 5.8, 24.5, z0 - 4.2], roof); }
  g.box(1, 2.2, 0.2, [-2.5, 13, z0 - 3.4], '#ff3a4a'); g.box(1, 2.2, 0.2, [2.5, 13, z0 - 3.4], '#ff3a4a'); g.sph(1.1, [0, 15.5, z0 - 3.4], '#c060ff', [1, 1, 0.3], 10);
  // gatehouse arch + door
  b.box(9, 8, 2.4, [0, 4, z0 + 0.6], trim);
  b.box(5.2, 6.2, 0.6, [0, 3.1, z0 + 1.6], '#140f1a');
  for (let i = 0; i < 5; i++) b.box(0.25, 6.0, 0.3, [-2 + i, 3.0, z0 + 1.95], '#3a2a1c');   // door planks / bars
  b.box(5.6, 0.5, 0.5, [0, 6.3, z0 + 1.9], '#5a4a6a');
  // steps
  b.box(8, 0.3, 2.2, [0, 0.15, z0 + 2.6], '#3c3446'); b.box(6.4, 0.3, 1.2, [0, 0.45, z0 + 2.2], '#443a50');
  return { body: b.build(), glow: g.build(), z0 };
}
function gateGeo() {
  const b = new GB([0.72, 1.12]), g = new GB([1, 1]);
  for (const sx of [-1, 1]) {
    b.box(1.1, 5.4, 1.1, [sx * 2.3, 2.7, 0], '#8a82a0'); b.box(1.5, 0.5, 1.5, [sx * 2.3, 0.25, 0], '#6a6280'); b.box(1.35, 0.4, 1.35, [sx * 2.3, 5.45, 0], '#9a92b0');
    b.cone(0.55, 1.1, 4, [sx * 2.3, 6.2, 0], '#6a6280', [0, Math.PI / 4, 0]);
    g.box(0.18, 3.8, 0.12, [sx * 1.72, 2.8, 0.2], '#ffffff'); g.box(0.18, 3.8, 0.12, [sx * 1.72, 2.8, -0.2], '#ffffff');   // rune strips on the inner faces
  }
  b.box(6.2, 1.0, 1.3, [0, 5.9, 0], '#7a7290'); b.box(1.3, 1.5, 1.5, [0, 6.2, 0], '#9a92b0');
  b.box(5.2, 0.2, 2.8, [0, 0.1, 0], '#5a5270');
  g.octa(0.5, [0, 7.6, 0], '#ffffff', [1, 1.5, 1]);   // the key crystal over the arch
  return { body: b.build(), glow: g.build() };
}
function keeperGeo() {
  const b = new GB([0.7, 1.1]), g = new GB([1, 1]);
  b.cyl(2.0, 2.3, 1.2, 8, [0, 0.6, 0], '#7a7290'); b.cyl(1.6, 1.8, 0.4, 8, [0, 1.4, 0], '#8a82a0');
  b.cone(1.5, 4.2, 9, [0, 3.7, 0], '#4a3e66');                       // robe
  b.sph(0.75, [0, 5.95, 0.05], '#4a3e66', [1, 1.15, 1], 9);         // hood
  g.torus(1.95, 0.06, [0, 1.25, 0], '#7fe8ff', [Math.PI / 2, 0, 0], 1, 24);   // a rune band round the pedestal
  b.sph(0.5, [0, 5.85, 0.32], '#0a0810', [1, 1.1, 0.8], 8);          // the dark under the hood
  b.cyl(0.42, 0.55, 2.2, 7, [0, 4.6, 0], '#30283e');                 // shoulders / chest
  b.cyl(0.12, 0.12, 5.6, 6, [1.25, 3.2, 0.4], '#4a3a2a');            // staff
  b.box(0.5, 0.5, 0.5, [1.25, 6.1, 0.4], '#5a4a3a'); g.sph(0.28, [1.25, 6.1, 0.4], '#ffc060', 1, 8);   // lantern
  g.sph(0.07, [-0.16, 5.95, 0.72], '#7fe8ff', 1, 6); g.sph(0.07, [0.16, 5.95, 0.72], '#7fe8ff', 1, 6);    // eyes
  return { body: b.build(), glow: g.build() };
}

function GateLabel({ i }: { i: number }) {
  const done = useWorldCounter(() => (gateState.done[i] ? 1 : 0));
  const g = GATES[i];
  return (
    <Html position={[0, 7.2, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="portal-tag" style={{ ['--pc' as any]: done ? '#ffd24a' : g.color }} data-testid={`gate-${i}`}>
        <span className="pi">{done ? <Unlock size={16} /> : g.id === 'ECHOES' ? <Skull size={16} /> : <Flame size={16} />}</span>
        <span className="pt">{g.name}<small>{done ? 'Cleared · key taken' : g.sub}</small></span>
      </div>
    </Html>
  );
}
function CastleLabel() {
  const keys = useWorldCounter(() => gateState.keys);
  const open = keys >= GATE_KEYS_NEEDED;
  return (
    <Html position={[0, 9.5, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="portal-tag" style={{ ['--pc' as any]: open ? '#ffd24a' : '#c9a2ff' }} data-testid="castle-tag">
        <span className="pi">{open ? <Unlock size={16} /> : <Lock size={16} />}</span>
        <span className="pt">The Dark Castle<small>{open ? 'Open · the Herald awaits' : `Sealed · Gate Keys ${keys}/${GATE_KEYS_NEEDED}`}</small></span>
      </div>
    </Html>
  );
}

// ------------------------------------------- "the Dark Castle is open" cue ---
// Persists while gateState.keys >= GATE_KEYS_NEEDED: a pillar of light + rising rings on the castle door, a golden beam + halo on the
// Gatekeeper statue, a scrolling ">>>>" chevron trail from the hero to the door. One-shot on the moment it opens (and on arriving with it open):
// a "THE GATE IS OPEN!" float text + notice, bell, camera nudge. All meshes are made once; per frame only opacity / matrices change.
const CUE_N = 26, CUE_STEP = 1.5;
const _cm = new Matrix4(), _cq = new Quaternion(), _ce = new Euler(), _cp = new Vector3(), _cs = new Vector3(1, 1, 1);
function HubOpenCue({ doorZ }: { doorZ: number }) {
  const res = useMemo(() => {
    const pillarG = new CylinderGeometry(1.5, 2.3, 44, 24, 1, true).translate(0, 22, 0);
    const pillar = new Mesh(pillarG, glowM(1.7, 1.45, 0.5, 0.0)); pillar.renderOrder = 5;
    const core = new Mesh(new CylinderGeometry(0.5, 0.8, 44, 16, 1, true).translate(0, 22, 0), glowM(2.2, 2.0, 1.2, 0.0)); core.renderOrder = 5;
    const ringG = new RingGeometry(1.7, 2.2, 36).rotateX(-Math.PI / 2);
    const rings = [0, 1, 2].map(() => { const m = new Mesh(ringG, glowM(2.0, 1.7, 0.6, 0.0)); m.renderOrder = 5; return m; });
    const kBeam = new Mesh(new CylinderGeometry(0.45, 0.9, 30, 16, 1, true).translate(0, 15, 0), glowM(0.9, 1.6, 2.0, 0.0)); kBeam.renderOrder = 5;
    const kHalo = new Mesh(new RingGeometry(1.2, 1.7, 32).rotateX(-Math.PI / 2), glowM(1.4, 2.0, 2.2, 0.0)); kHalo.renderOrder = 5;
    const chev = new InstancedMesh(thinArrowGeo(0.7, 0.7, 0, 0.3), new MeshBasicMaterial({ color: new Color(2.2, 1.8, 0.5), transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false, side: DoubleSide }), CUE_N);
    chev.frustumCulled = false; chev.renderOrder = 6; chev.visible = false;
    return { pillar, core, rings, kBeam, kHalo, chev };
  }, []);
  const prev = useRef(false), armed = useRef(0);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, open = gateState.keys >= GATE_KEYS_NEEDED;
    if (open && !prev.current) armed.current = 0.9;   // the cue fires just after the room appears (or the key lands)
    prev.current = open;
    if (armed.current > 0) {
      armed.current -= dt;
      if (armed.current <= 0) {
        events.emit('portalsOpen', {}); events.emit('shake', { amount: 0.4 });
        events.emit('floatText', { pos: world.player.pos, text: 'THE GATE IS OPEN!', color: 0xffe27a, scale: 1.7, dy: 3.2 });
        useGameStore.getState().addNotification('THE GATE IS OPEN! Follow the golden arrows to the Dark Castle.', '#ffe27a', 'SYSTEM');
      }
    }
    const v = open && world.room.fade < 0.5;
    for (const m of [res.pillar, res.core, res.kBeam, res.kHalo, ...res.rings]) m.visible = v;
    res.chev.visible = v;
    if (!v) return;
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    (res.pillar.material as MeshBasicMaterial).opacity = 0.22 + pulse * 0.1;
    (res.core.material as MeshBasicMaterial).opacity = 0.5 + pulse * 0.2;
    (res.kBeam.material as MeshBasicMaterial).opacity = 0.2 + pulse * 0.1;
    (res.kHalo.material as MeshBasicMaterial).opacity = 0.5 + pulse * 0.3;
    res.kHalo.scale.setScalar(1 + pulse * 0.15);
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.45 + i / 3) % 1, m = res.rings[i];
      m.position.y = 0.1 + f * 8; m.scale.setScalar(1 + f * 0.9); (m.material as MeshBasicMaterial).opacity = (1 - f) * 0.75;
    }
    // chevron trail, hero -> door, scrolling toward the door
    const p = world.player.pos, dx = 0 - p.x, dz = doorZ - p.z, d = Math.hypot(dx, dz);
    let n = 0;
    if (d > 6) {
      _ce.set(0, Math.atan2(dx, dz), 0); _cq.setFromEuler(_ce);
      const scroll = (t * 2.2) % CUE_STEP;
      for (let u = 2 + scroll; u < d - 3 && n < CUE_N; u += CUE_STEP, n++) {
        const f = Math.min(1, n / 3 + 0.4);
        _cp.set(p.x + (dx / d) * u, 0.3, p.z + (dz / d) * u); _cs.set(f, 1, f); _cm.compose(_cp, _cq, _cs);
        res.chev.setMatrixAt(n, _cm);
      }
    }
    res.chev.count = n; res.chev.visible = n > 0; res.chev.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <group position={[0, 0, doorZ]}><primitive object={res.pillar} /><primitive object={res.core} />{res.rings.map((r, i) => <primitive key={i} object={r} />)}</group>
      <group position={[KEEPER_POS[0], 0, KEEPER_POS[1]]}><primitive object={res.kBeam} /><group position={[0, 0.08, 0]}><primitive object={res.kHalo} /></group></group>
      <primitive object={res.chev} />
    </>
  );
}

function GatekeeperHub({ R, q }: { R: number; q: QualityCfg }) {
  const res = useMemo(() => {
    const fg = new CircleGeometry(R + 5, 80); fg.rotateX(-Math.PI / 2);
    const floor = new Mesh(fg, new MeshStandardMaterial({ map: flagTex('hub', [70, 64, 84], '#151219', '#9b5cff'), roughness: 0.95 }));
    floor.position.y = 0.012; floor.receiveShadow = true;
    const lit = litMat({ roughness: 0.85 }), glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) });
    const c = castleGeo(), k = keeperGeo(), gate = gateGeo();
    const castle = new Mesh(c.body, lit); castle.castShadow = true; castle.receiveShadow = true;
    const castleGlow = new Mesh(c.glow, glow);
    const keeper = new Mesh(k.body, lit); keeper.castShadow = true;
    const keeperGlow = new Mesh(k.glow, glow);
    const gates = new InstancedMesh(gate.body, lit, 5); gates.castShadow = true;
    const gateGlow = new InstancedMesh(gate.glow, new MeshBasicMaterial({ toneMapped: false }), 5);
    const portalGeo = new CircleGeometry(1.85, 32);
    const portals: Mesh[] = [], portalMats: MeshBasicMaterial[] = [], groundMats: MeshBasicMaterial[] = [], grounds: Mesh[] = [];
    const ringGeo = new RingGeometry(1.6, 2.6, 32).rotateX(-Math.PI / 2);
    const sockets: Mesh[] = [], sockMats: MeshBasicMaterial[] = [];
    const sockGeo = new CylinderGeometry(0.32, 0.32, 0.2, 6).rotateX(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const yaw = gatePos(i, gp);
      setInst(gates, i, gp[0], 0, gp[1], yaw); setInst(gateGlow, i, gp[0], 0, gp[1], yaw);
      const col = new Color(GATES[i].color);
      gateGlow.setColorAt(i, new Color(col.r * 2, col.g * 2, col.b * 2));
      const pm = glowM(col.r * 1.8, col.g * 1.8, col.b * 1.8, 0.7); portalMats.push(pm);
      const pmesh = new Mesh(portalGeo, pm); pmesh.position.set(gp[0], 2.8, gp[1]); pmesh.rotation.y = yaw; pmesh.scale.set(1.1, 1.45, 1); pmesh.renderOrder = 4; portals.push(pmesh);
      const gm = glowM(col.r, col.g, col.b, 0.5); groundMats.push(gm);
      const gr = new Mesh(ringGeo, gm); gr.position.set(gp[0] + Math.sin(yaw) * 1.8, 0.04, gp[1] + Math.cos(yaw) * 1.8); gr.renderOrder = 3; grounds.push(gr);
      const sm = new MeshBasicMaterial({ color: new Color(0.25, 0.22, 0.3), toneMapped: false }); sockMats.push(sm);
      const so = new Mesh(sockGeo, sm); so.position.set(-2.4 + i * 1.2, 7.1, c.z0 + 2.2); sockets.push(so);
    }
    gates.instanceMatrix.needsUpdate = true; gateGlow.instanceMatrix.needsUpdate = true;
    const door = new Mesh(new PlaneGeometry(4.8, 5.8), glowM(1.2, 0.5, 2.2, 0)); door.position.set(0, 3.1, c.z0 + 1.95); door.renderOrder = 4;
    const aura = new Mesh(new RingGeometry(2.1, 2.9, 40).rotateX(-Math.PI / 2), glowM(0.5, 1.4, 1.8, 0.35)); aura.position.set(KEEPER_POS[0], 0.05, KEEPER_POS[1]);
    return { floor, castle, castleGlow, keeper, keeperGlow, gates, gateGlow, portals, portalMats, grounds, groundMats, sockets, sockMats, door, aura, z0: c.z0 };
  }, [R]);
  const lastKey = useRef(-1);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < 5; i++) {
      const done = gateState.done[i];
      const p = res.portals[i];
      p.visible = !done;
      if (!done) { res.portalMats[i].opacity = 0.45 + Math.sin(t * 3 + i) * 0.15; p.rotation.z = t * 0.8 + i; }
      res.groundMats[i].opacity = done ? 0.55 + Math.sin(t * 2 + i) * 0.1 : 0.35 + Math.sin(t * 3 + i) * 0.12;
      if (done) res.groundMats[i].color.setRGB(2.0, 1.6, 0.5);
      if (dt > 0 && !done && Math.random() < dt * 5) { gatePos(i, gp); FX.add.emit(gp[0] + (Math.random() - 0.5) * 3, 0.3, gp[1] + (Math.random() - 0.5) * 3, 0, 1.6, 0, 1.0, 0.3, 0.05, res.portalMats[i].color.r, res.portalMats[i].color.g, res.portalMats[i].color.b, 0.7, CELL.GLOW); }
    }
    const keys = gateState.keys;
    if (keys !== lastKey.current) {
      lastKey.current = keys;
      let n = 0;
      for (let i = 0; i < 5; i++) if (gateState.done[i]) { const c = new Color(GATES[i].color); res.sockMats[n].color.setRGB(c.r * 2.2, c.g * 2.2, c.b * 2.2); n++; }
      for (let i = n; i < 5; i++) res.sockMats[i].color.setRGB(0.25, 0.22, 0.3);
      for (let i = 0; i < 5; i++) { const c = gateState.done[i] ? new Color(2.4, 1.9, 0.6) : new Color(GATES[i].color).multiplyScalar(2); res.gateGlow.setColorAt(i, c); }
      if (res.gateGlow.instanceColor) res.gateGlow.instanceColor.needsUpdate = true;
    }
    const open = keys >= GATE_KEYS_NEEDED;
    (res.door.material as MeshBasicMaterial).opacity = open ? 0.55 + Math.sin(t * 2.5) * 0.15 : 0.08 + Math.sin(t * 1.5) * 0.04;
    if (open && dt > 0 && Math.random() < dt * 10) FX.add.emit((Math.random() - 0.5) * 4.5, 0.3 + Math.random() * 5, res.z0 + 2.2, 0, 1.2, 0.6, 1.0, 0.4, 0.05, 1.4, 0.6, 2.2, 0.8, CELL.GLOW);
    (res.aura.material as MeshBasicMaterial).opacity = 0.28 + Math.sin(t * 1.8) * 0.1;
    if (dt > 0 && Math.random() < dt * 4) embers(KEEPER_POS[0] + 1.25, 6.3, KEEPER_POS[1] + 0.4, 1, 0xffc060, 0.15, 1.6, 0.8, 0.14);
  });
  return (
    <>
      <primitive object={res.floor} />
      <primitive object={res.castle} />
      <primitive object={res.castleGlow} />
      <primitive object={res.door} />
      {res.sockets.map((s, i) => <primitive key={'s' + i} object={s} />)}
      <group position={[KEEPER_POS[0], 0, KEEPER_POS[1]]}><primitive object={res.keeper} /><primitive object={res.keeperGlow} />
        <Html position={[0, 8, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="portal-tag" style={{ ['--pc' as any]: '#7fe8ff' }}><span className="pt">The Gatekeeper<small>Five gates · five keys</small></span></div>
        </Html>
      </group>
      <primitive object={res.aura} />
      <primitive object={res.gates} />
      <primitive object={res.gateGlow} />
      {res.portals.map((p, i) => <primitive key={'p' + i} object={p} />)}
      {res.grounds.map((p, i) => <primitive key={'g' + i} object={p} />)}
      {GATES.map((_, i) => { const yaw = gatePos(i, gp); return <group key={'l' + i} position={[gp[0], 0, gp[1]]} rotation={[0, yaw, 0]}><GateLabel i={i} /></group>; })}
      <group position={[0, 0, res.z0 + 2]}><CastleLabel /></group>
      <HubOpenCue doorZ={res.z0 + 3} />
      {q.lights && <pointLight position={[0, 5, CASTLE_DOOR[1] + 2]} color="#b070ff" intensity={25} distance={22} decay={1.5} />}
      {q.lights && <pointLight position={[KEEPER_POS[0] + 1.25, 6.4, KEEPER_POS[1] + 1]} color="#ffc060" intensity={14} distance={14} decay={1.6} />}
    </>
  );
}

// ------------------------------------------------------------- fountain ----
const PETALS = 70;
function FountainPlaza({ q }: { q: QualityCfg }) {
  const res = useMemo(() => {
    const cz = -shape.baseR * 0.1;
    // marble paving: the island inside the moat + a wide ring on the outer bank (the moat itself is carved water: no floor over it)
    const fg = mergeGeometries([new CircleGeometry(MOAT_R - MOAT_HW + 0.5, 56).rotateX(-Math.PI / 2), new RingGeometry(MOAT_R + MOAT_HW - 0.5, PLAZA_COL_R + 2.6, 72).rotateX(-Math.PI / 2)])!;
    const floor = new Mesh(fg, new MeshStandardMaterial({ map: marbleTex(), roughness: 0.45, metalness: 0.05 }));
    floor.position.set(0, 0.014, cz); floor.receiveShadow = true;
    const b = new GB([0.82, 1.06]);
    // columns + flower planters between them
    for (let i = 0; i < PLAZA_COLS; i++) {
      const a = (i / PLAZA_COLS) * TAU + Math.PI / PLAZA_COLS, x = Math.cos(a) * PLAZA_COL_R, z = cz + Math.sin(a) * PLAZA_COL_R;
      b.box(1.3, 0.4, 1.3, [x, 0.2, z], '#e4ddd0'); b.cyl(0.42, 0.48, 4.6, 12, [x, 2.7, z], '#f2ede4'); b.box(1.2, 0.35, 1.2, [x, 5.15, z], '#e4ddd0'); b.cyl(0.7, 0.45, 0.3, 10, [x, 4.85, z], '#ece6da');
      const a2 = a + Math.PI / PLAZA_COLS, px = Math.cos(a2) * (PLAZA_COL_R + 0.4), pz = cz + Math.sin(a2) * (PLAZA_COL_R + 0.4);
      b.box(1.8, 0.5, 0.8, [px, 0.25, pz], '#d8d0c2', [0, -a2, 0]);
      for (let k = 0; k < 5; k++) b.sph(0.22, [px + Math.cos(a2 + Math.PI / 2) * (k - 2) * 0.32, 0.62, pz + Math.sin(a2 + Math.PI / 2) * (k - 2) * 0.32], k % 2 ? '#f08aa8' : '#fff0f4', 1, 5);
    }
    // the outer tier of the fountain: a wide marble basin around the station's fountain
    b.cyl(4.6, 4.8, 0.55, 28, [0, 0.27, cz], '#e8e2d6'); b.torus(4.55, 0.16, [0, 0.56, cz], '#f4efe6', [Math.PI / 2, 0, 0], 1, 28);
    const body = new Mesh(b.build(), litMat({ roughness: 0.4 })); body.castShadow = true; body.receiveShadow = true;
    const wg = new CircleGeometry(4.35, 40); wg.rotateX(-Math.PI / 2);
    const water = new Mesh(wg, glowM(0.25, 0.9, 1.5, 0.55)); water.position.set(0, 0.5, cz); water.renderOrder = 3;
    const beam = new Mesh(new CylinderGeometry(0.9, 1.6, 9, 20, 1, true).translate(0, 4.5, 0), glowM(0.4, 1.1, 1.6, 0.12)); beam.position.set(0, 0, cz); beam.renderOrder = 4;
    const pg = new PlaneGeometry(0.18, 0.12);
    const petals = new InstancedMesh(pg, new MeshBasicMaterial({ color: new Color(1.4, 0.75, 0.9), side: DoubleSide, toneMapped: false, transparent: true, opacity: 0.9 }), PETALS);
    petals.frustumCulled = false;
    const seeds = new Float32Array(PETALS * 4);
    const r = mulberry32(0x9e11);
    for (let i = 0; i < PETALS; i++) { seeds[i * 4] = r() * TAU; seeds[i * 4 + 1] = 2 + r() * 9; seeds[i * 4 + 2] = r() * 10; seeds[i * 4 + 3] = 0.15 + r() * 0.25; }
    return { floor, body, water, beam, petals, seeds, cz };
  }, []);
  const o = useMemo(() => new Object3D(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, s = res.seeds, used = world.room.station.used;
    (res.water.material as MeshBasicMaterial).opacity = (used ? 0.3 : 0.5) + Math.sin(t * 2) * 0.08;
    (res.beam.material as MeshBasicMaterial).opacity = used ? 0.04 : 0.1 + Math.sin(t * 1.6) * 0.04;
    for (let i = 0; i < PETALS; i++) {
      const a = s[i * 4] + t * s[i * 4 + 3], rr = s[i * 4 + 1], h = ((s[i * 4 + 2] - t * 0.6) % 10 + 10) % 10 * 0.6 + 0.1;
      o.position.set(Math.cos(a) * rr + Math.sin(t + i) * 0.4, h, res.cz + Math.sin(a) * rr);
      o.rotation.set(t * 2 + i, t * 1.3 + i * 0.7, t * 0.7);
      o.updateMatrix(); res.petals.setMatrixAt(i, o.matrix);
    }
    res.petals.instanceMatrix.needsUpdate = true;
    if (dt > 0 && Math.random() < dt * (used ? 4 : 14)) { const a = Math.random() * TAU, rr = Math.random() * 4; FX.add.emit(Math.cos(a) * rr, 0.6, res.cz + Math.sin(a) * rr, 0, 1.2 + Math.random(), 0, 1.6, 0.35, 0.05, 0.8, 1.7, 2.2, 0.8, CELL.GLOW); }
  });
  return (
    <>
      <primitive object={res.floor} />
      <primitive object={res.body} />
      <primitive object={res.water} />
      <primitive object={res.beam} />
      <primitive object={res.petals} />
      {q.lights && <pointLight position={[0, 3, res.cz]} color="#7fd8ff" intensity={18} distance={16} decay={1.5} />}
    </>
  );
}

// ------------------------------------------------------------- mount -------
const KIND: Record<string, number> = { DUEL: 1, GATEKEEPER: 2, FOUNTAIN: 3 };
export function SpecialRooms({ q }: { q: QualityCfg }) {
  const sig = useWorldCounter(() => (world.room.active && runInfo.mode !== 'TOWER' ? (KIND[world.room.plan.type] ?? 0) + world.room.version * 4 : 0));
  const kind = sig & 3, R = world.room.radius;
  if (!kind) return null;
  return kind === 1 ? <DuelArena key={sig} R={R} q={q} /> : kind === 2 ? <GatekeeperHub key={sig} R={R} q={q} /> : <FountainPlaza key={sig} q={q} />;
}
