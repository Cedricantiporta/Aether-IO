// Unique, non-instanced boss models: Stone Golem and Lich.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, Group, IcosahedronGeometry, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, DoubleSide,
} from 'three';
import { world } from '../engine/world';
import type { Enemy } from '../engine/types';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, dustPuff, embers, smokePuff } from './fx';
import { GB, TAU, clamp, damp, lerp, noisify } from './util';

const sin = Math.sin, cos = Math.cos;

function findBoss(kind: string): Enemy | null {
  const arr = world.enemies;
  for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (e.active && e.boss && e.kind === kind) return e; }
  return null;
}
function rock(b: GB, r: number, pos: [number, number, number], scl: [number, number, number], color: string, seed = 1, rot: [number, number, number] = [0, 0, 0]) {
  const g = noisify(new IcosahedronGeometry(r, 1), r * 0.28, 1.6 / r, seed);
  return b.add(g, pos, rot, scl, color);
}
function shakeOff(e: Enemy, amp: number, t: number) { return sin(t * 70) * amp; void e; }

// ===================================================================== GOLEM
function buildGolem() {
  const stone = '#8c9199', stone2 = '#6d727a', moss = '#5aa03a', dark = '#4d5158';
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]);
  rock(body, 0.62, [0, 0.8, 0], [1.1, 0.9, 0.95], stone2, 3);                       // pelvis
  rock(body, 0.88, [0, 1.5, 0.02], [1.15, 1.0, 0.92], stone, 7);                  // chest
  rock(body, 0.5, [0, 1.15, 0.1], [1.2, 0.8, 1.0], stone2, 11);                    // belly
  rock(body, 0.36, [0, 2.22, 0.12], [1.0, 0.9, 1.0], stone, 13);                  // head
  body.box(0.62, 0.12, 0.2, [0, 2.3, 0.4], dark, [0.15, 0, 0]);                  // brow
  body.box(0.3, 0.2, 0.2, [0, 2.0, 0.34], stone2);                               // jaw
  for (const s of [-1, 1]) { body.cone(0.1, 0.5, 4, [s * 0.28, 2.55, 0.0], stone2, [0, 0, -s * 0.4]); }
  for (const [x, y, z, r] of [[0.4, 2.0, 0.1, 0.34], [-0.55, 1.95, -0.2, 0.28], [0.1, 1.2, -0.7, 0.4], [-0.3, 2.05, -0.5, 0.3]] as const) body.sph(r, [x, y, z], moss, [1.2, 0.35, 1], 6);
  body.sph(0.3, [0.6, 0.85, 0.5], moss, [1, 0.3, 0.8], 5);
  // shoulder pauldron rocks
  for (const s of [-1, 1]) rock(body, 0.46, [s * 1.0, 2.05, 0], [1, 0.8, 1], stone, 17 + s);
  // glow: chest ring + core + cracks + eyes
  glow.torus(0.46, 0.04, [0, 1.52, 0.8], '#ff9a2a', [0, 0, 0], 1, 20);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; glow.box(0.04, 0.38, 0.04, [cos(a) * 0.24, 1.52 + sin(a) * 0.24, 0.81], '#ff7a1a', [0, 0, a - Math.PI / 2]); }
  glow.ico(0.17, [0, 1.52, 0.83], '#ffe080', 1, 0);
  const cr = (x: number, y: number, z: number, h: number, rz: number) => glow.box(0.045, h, 0.04, [x, y, z], '#ff7a1a', [0, 0, rz]);
  cr(0.5, 1.9, 0.78, 0.5, 0.4); cr(-0.55, 1.2, 0.75, 0.45, -0.5); cr(0.4, 1.1, 0.8, 0.35, -0.3); cr(-0.3, 1.9, 0.82, 0.3, 0.2); cr(0.0, 0.85, 0.7, 0.4, 0.1);
  for (const s of [-1, 1]) glow.box(0.17, 0.09, 0.08, [s * 0.15, 2.24, 0.42], '#ffb040');
  const arm = (s: number) => {
    const a = new GB([0.72, 1.12]), g = new GB([1, 1]);
    rock(a, 0.36, [0, -0.45, 0], [1, 1.5, 1], stone, 21 + s);
    rock(a, 0.54, [0, -1.25, 0.05], [1.1, 1.0, 1.1], stone2, 25 + s);
    for (let i = 0; i < 4; i++) a.cone(0.09, 0.28, 4, [(i - 1.5) * 0.2, -1.6, 0.35], dark, [Math.PI / 2 + 0.3, 0, 0]);
    a.sph(0.26, [0.05, -0.1, -0.1], moss, [1.2, 0.4, 1], 5);
    g.torus(0.4, 0.035, [0, -0.78, 0], '#ff9a2a', [Math.PI / 2, 0, 0], 1, 14);
    g.torus(0.32, 0.03, [0, -0.28, 0], '#ff9a2a', [Math.PI / 2, 0, 0], 1, 12);
    return { body: a.build(), glow: g.build() };
  };
  const leg = new GB([0.7, 1.1]);
  rock(leg, 0.4, [0, -0.35, 0], [0.95, 1.5, 1], stone2, 31); leg.box(0.7, 0.2, 0.9, [0, -0.85, 0.12], dark);
  return { body: body.build(), glow: glow.build(), armL: arm(-1), armR: arm(1), leg: leg.build() };
}

export function Golem() {
  const geo = useMemo(buildGolem, []);
  const mats = useMemo(() => ({
    lit: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2) }),
  }), []);
  const g = useRef<Group>(null!), body = useRef<Group>(null!), aL = useRef<Group>(null!), aR = useRef<Group>(null!), lL = useRef<Group>(null!), lR = useRef<Group>(null!);
  const S = useRef({ armL: 0, armR: 0, pitch: 0, dy: 0, gl: 1, lastStep: 0, dustT: 0 });
  useFrame(({ clock }, dtRaw) => {
    const st = useGameStore.getState().status;
    const e = findBoss('BOSS_GOLEM');
    if (!e || st === GameStatus.MENU || st === GameStatus.HERO_SELECT) { if (g.current) g.current.visible = false; return; }
    const root = g.current; root.visible = true;
    const dt = st === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const s = S.current, t = e.animT;
    let armT = 0, pitchT = 0, dyT = 0, glT = 1 + e.phase * 0.5, legPh = t * 3, legAmp = e.state === 'CHASE' ? 0.4 : 0.1, arm2 = 0, fast = 30;
    const sk = e.stateT;
    if (e.state === 'WINDUP') {
      const k = clamp(sk / 0.9, 0, 1);
      if (e.pattern === 2) { armT = 0.9 * k; arm2 = armT; pitchT = 0.35 * k; dyT = -0.25 * k; glT += 1.5 * k; }
      else { armT = -2.9 * k; arm2 = armT; pitchT = -0.22 * k; dyT = 0.12 * k; glT += 2.2 * k; }
    } else if (e.state === 'ATTACK') {
      if (e.pattern === 2) { armT = 0.9; arm2 = 0.9; pitchT = 0.55; dyT = -0.2; legPh = t * 14; legAmp = 0.8; glT += 1.2; }
      else if (e.pattern === 1) { const st2 = abs(sin(sk * 11)); armT = -0.5 - st2 * 0.8; arm2 = armT; dyT = -0.28 * st2; glT += 1.4; }
      else { armT = sk < 0.12 ? lerp(-2.9, 0.15, sk / 0.12) : 0.15; arm2 = armT; pitchT = sk < 0.12 ? 0.2 : 0.05; dyT = -0.2; glT += 1.8; fast = 60; }
    } else if (e.state === 'RECOVER') { armT = 0.1; arm2 = 0.1; glT += 0.2; }
    else { armT = sin(t * 3) * 0.35; arm2 = -sin(t * 3) * 0.35; dyT = Math.abs(sin(t * 3)) * 0.05; }
    s.armL = damp(s.armL, armT, fast, dt); s.armR = damp(s.armR, arm2, fast, dt); s.pitch = damp(s.pitch, pitchT, 8, dt); s.dy = damp(s.dy, dyT, 10, dt); s.gl = damp(s.gl, glT, 8, dt);
    let yOff = 0, fy = 1, shx = 0, shz = 0;
    if (e.state === 'SPAWN') { const k = clamp(e.stateT / 1.6, 0, 1); yOff = -(1 - k * k) * 2.4 * e.scale * 0.5; shx = sin(clock.elapsedTime * 60) * 0.05 * (1 - k); s.dustT += dt; if (s.dustT > 0.07) { s.dustT = 0; dustPuff(e.pos.x + (Math.random() - 0.5) * 5, e.pos.z + (Math.random() - 0.5) * 5, 2, 2.4, 0xb8a888, 3); } glT = 0.6 + k; s.gl = glT; }
    if (e.state === 'DYING') { const k = clamp(e.deathT / 0.6, 0, 1); fy = 1 - k * 0.7; shx = sin(clock.elapsedTime * 80) * 0.08 * (1 - k); shz = cos(clock.elapsedTime * 73) * 0.08 * (1 - k); s.gl = Math.max(0, 1 - k * 1.3); yOff = -k * 1.0; }
    root.position.set(e.pos.x + shx * e.scale, e.pos.y + yOff, e.pos.z + shz * e.scale);
    root.rotation.y = e.facing;
    const sc = e.scale * 0.85; root.scale.set(sc, sc * fy, sc);
    body.current.position.y = s.dy;
    body.current.rotation.x = s.pitch; body.current.rotation.z = e.state === 'CHASE' ? sin(t * 3) * 0.04 : 0;
    aL.current.rotation.x = s.armL; aR.current.rotation.x = s.armR;
    aL.current.rotation.z = 0.12 + (e.state === 'WINDUP' ? 0.15 : 0); aR.current.rotation.z = -0.12 - (e.state === 'WINDUP' ? 0.15 : 0);
    lL.current.rotation.x = sin(legPh) * legAmp; lR.current.rotation.x = -sin(legPh) * legAmp;
    mats.glow.color.setScalar(1.3 + s.gl * 1.1 + 0.25 * sin(clock.elapsedTime * 5));
    // stomp dust
    if (e.state === 'CHASE' && dt > 0) { const ph = Math.sin(legPh) > 0 ? 1 : 0; if (ph !== s.lastStep) { s.lastStep = ph; dustPuff(e.pos.x + (ph ? -1 : 1) * e.scale * 0.2, e.pos.z, 3, 2, 0xb8a888, 3); } }
    if (e.phase >= 1 && Math.random() < dt * (e.phase * 10) && e.state !== 'DYING') embers(e.pos.x + (Math.random() - 0.5) * 4, 3 + Math.random() * 4, e.pos.z + (Math.random() - 0.5) * 3, 1, 0xff7a1a, 0.2, 1.5, 1, 0.3);
  });
  const hips = 0.95;
  return (
    <group ref={g} visible={false}>
      <group ref={body}>
        <mesh geometry={geo.body} material={mats.lit} castShadow receiveShadow />
        <mesh geometry={geo.glow} material={mats.glow} />
        <group ref={aL} position={[-1.0, 1.85, 0]}><mesh geometry={geo.armL.body} material={mats.lit} castShadow receiveShadow /><mesh geometry={geo.armL.glow} material={mats.glow} /></group>
        <group ref={aR} position={[1.0, 1.85, 0]}><mesh geometry={geo.armR.body} material={mats.lit} castShadow receiveShadow /><mesh geometry={geo.armR.glow} material={mats.glow} /></group>
      </group>
      <group ref={lL} position={[-0.42, hips, 0]}><mesh geometry={geo.leg} material={mats.lit} castShadow receiveShadow /></group>
      <group ref={lR} position={[0.42, hips, 0]}><mesh geometry={geo.leg} material={mats.lit} castShadow receiveShadow /></group>
    </group>
  );
}
const abs = Math.abs;

// ====================================================================== LICH
function buildLich() {
  const robe = '#3a1f5c', robe2 = '#25123f', bone = '#ece6cc', gold = '#e0b040', purple = '#b050ff';
  const body = new GB([0.7, 1.15]), glow = new GB([1, 1]);
  body.cone(0.72, 2.0, 10, [0, 0.9, 0], robe);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; body.cone(0.14, 0.55, 4, [cos(a) * 0.66, -0.12, sin(a) * 0.66], robe2, [0, 0, 0], 1); body.cone(0.1, 0.4, 4, [cos(a + 0.2) * 0.5, -0.2, sin(a + 0.2) * 0.5], robe, [Math.PI, 0, 0]); }
  body.torus(0.5, 0.06, [0, 1.15, 0], gold, [Math.PI / 2, 0, 0], 1, 14);
  body.sph(0.52, [0, 1.85, 0], robe2, [1.35, 0.55, 1.05], 8);                   // mantle
  for (const s of [-1, 1]) { body.cone(0.14, 0.6, 4, [s * 0.72, 2.05, -0.05], bone, [0, 0, -s * 0.9]); body.cone(0.1, 0.45, 4, [s * 0.5, 2.15, -0.25], bone, [-0.3, 0, -s * 0.5]); }
  body.sph(0.3, [0, 2.4, 0.04], bone, [1, 1.05, 1.05], 9);
  body.box(0.26, 0.1, 0.2, [0, 2.18, 0.14], bone);
  for (const s of [-1, 1]) body.sph(0.075, [s * 0.11, 2.42, 0.28], '#120818', 1, 6);
  body.box(0.06, 0.09, 0.05, [0, 2.32, 0.31], '#120818');
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; body.cone(0.06, 0.34 + (i === 2 ? 0.14 : 0), 4, [sin(a) * 0.34, 2.72 + (i === 2 ? 0.05 : 0), cos(a) * 0.1 - 0.05], gold, [0, 0, -a * 0.6]); }
  body.torus(0.31, 0.05, [0, 2.66, 0.0], gold, [Math.PI / 2, 0, 0], 1, 12);
  for (const s of [-1, 1]) glow.sph(0.06, [s * 0.11, 2.42, 0.31], '#d070ff', 1, 6);
  glow.ico(0.07, [0, 2.7, 0.3], '#ff60e0', 1, 0);
  glow.cyl(0.04, 0.04, 0.55, 5, [0, 0.9, 0.55], '#a050ff'); // robe seam glow
  const arm = (s: number) => {
    const a = new GB([0.75, 1.1]);
    a.cone(0.2, 0.9, 7, [0, -0.35, 0], robe, [Math.PI, 0, 0]);
    a.cyl(0.04, 0.035, 0.5, 5, [0, -0.9, 0], bone);
    a.sph(0.07, [0, -1.17, 0], bone, 1, 5);
    for (let i = 0; i < 3; i++) a.cone(0.015, 0.2, 3, [(i - 1) * 0.05, -1.3, 0.05], bone, [0.3, 0, (i - 1) * 0.25]);
    return a;
  };
  const armR = arm(1);
  // staff in right hand
  const staff = new GB([0.8, 1.1]), sg = new GB([1, 1]);
  staff.cyl(0.04, 0.05, 2.6, 6, [0, -1.0, 0.1], '#2a1a30');
  staff.sph(0.18, [0, 0.38, 0.1], bone, [1, 1.1, 1], 7); for (const s of [-1, 1]) staff.cone(0.05, 0.3, 4, [s * 0.16, 0.5, 0.1], gold, [0, 0, -s * 0.6]);
  sg.ico(0.14, [0, 0.72, 0.1], '#c070ff', 1, 1);
  const orb = new GB([1, 1]).ico(0.16, [0, 0, 0], '#c070ff', 1, 1).sph(0.07, [0, 0, 0], '#ffffff', 1, 5).build();
  const rune = new PlaneGeometry(1, 1); rune.rotateX(-Math.PI / 2);
  return { body: body.build(), glow: glow.build(), armL: arm(-1).build(), armR: armR.build(), staff: staff.build(), staffGlow: sg.build(), orb };
}

export function Lich() {
  const geo = useMemo(buildLich, []);
  const mats = useMemo(() => {
    const lit = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05, transparent: true });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2), transparent: true });
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d')!;
    const gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const aura = new MeshBasicMaterial({ map: new CanvasTexture(gc), color: new Color(1.4, 0.4, 2.2), transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
    return { lit, glow, aura };
  }, []);
  const g = useRef<Group>(null!), body = useRef<Group>(null!), aL = useRef<Group>(null!), aR = useRef<Group>(null!), orbs = useRef<Group>(null!), rune = useRef<Mesh>(null!);
  const S = useRef({ armL: 0, armR: 0, gl: 1, alpha: 1, pitch: 0, runeK: 0 });
  const runeGeo = useMemo(() => { const p = new PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p; }, []);
  const runeMat = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
    x.strokeStyle = '#d070ff'; x.lineWidth = 6; x.shadowColor = '#d070ff'; x.shadowBlur = 14;
    x.beginPath(); x.arc(128, 128, 112, 0, TAU); x.stroke(); x.beginPath(); x.arc(128, 128, 88, 0, TAU); x.stroke();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU * 2 - Math.PI / 2; const px = 128 + cos(a) * 88, py = 128 + sin(a) * 88; if (i) x.lineTo(px, py); else { x.beginPath(); x.moveTo(px, py); } }
    x.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; x.beginPath(); x.moveTo(128 + cos(a) * 112, 128 + sin(a) * 112); x.lineTo(128 + cos(a) * 124, 128 + sin(a) * 124); x.stroke(); }
    const tex = new CanvasTexture(c);
    return new MeshBasicMaterial({ map: tex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, color: new Color(1.6, 0.8, 2.2) });
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const st = useGameStore.getState().status;
    const e = findBoss('BOSS_LICH');
    if (!e || st === GameStatus.MENU || st === GameStatus.HERO_SELECT) { if (g.current) g.current.visible = false; return; }
    const root = g.current; root.visible = true;
    const dt = st === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const s = S.current, t = e.animT, k = e.state;
    let armLT = 0.25, armRT = 0.25, glT = 1.1 + e.phase * 0.5, alphaT = 1, pitchT = 0, runeT = 0, orbSpeed = 1.4 + e.phase * 0.6, orbR = 1.7;
    if (k === 'WINDUP') {
      const w = e.pattern === 3 ? clamp(e.stateT / 1.0, 0, 1) : clamp(e.stateT / 0.6, 0, 1);
      if (e.pattern === 2) { alphaT = clamp(1 - e.stateT / 0.5, 0, 1); glT += 1.5; }
      else { armLT = -2.3 * w; armRT = -2.2 * w; glT += 2 * w; orbSpeed += 3 * w; orbR = 1.7 - 0.5 * w; if (e.pattern === 3) runeT = w; }
    } else if (k === 'ATTACK') {
      if (e.pattern === 2) { alphaT = clamp(e.stateT / 0.4, 0, 1); glT += 1; }
      else if (e.pattern === 0) { armLT = -1.4; armRT = -1.9 + sin(t * 8) * 0.2; glT += 1.8; orbSpeed += 2.2; pitchT = -0.1; }
      else if (e.pattern === 1) { armLT = -1.55; armRT = -1.55; glT += 1.6; pitchT = 0.12; }
      else { armLT = -2.6; armRT = -2.6; glT += 2; runeT = 1; orbSpeed += 3; }
    }
    if (e.state === 'DYING') { const d = clamp(e.deathT / 0.6, 0, 1); alphaT = 1 - d; glT = 3; }
    if (e.state === 'SPAWN') { const sp = clamp(e.stateT / 1.6, 0, 1); alphaT = sp; glT = 3 - sp * 2; }
    s.armL = damp(s.armL, armLT, 12, dt); s.armR = damp(s.armR, armRT, 12, dt); s.gl = damp(s.gl, glT, 8, dt); s.alpha = e.pattern === 2 && (k === 'WINDUP' || k === 'ATTACK') ? alphaT : damp(s.alpha, alphaT, 14, dt); s.pitch = damp(s.pitch, pitchT, 8, dt); s.runeK = damp(s.runeK, runeT, 6, dt);
    const T = clock.elapsedTime;
    const hover = 1.35 + sin(T * 1.8) * 0.18;
    const sc = e.scale * 0.65;   // authored ~3 tall
    root.position.set(e.pos.x, e.pos.y, e.pos.z);
    root.rotation.y = e.facing;
    root.scale.setScalar(sc);
    body.current.position.y = hover;
    body.current.rotation.x = s.pitch + 0.08 + Math.min(0.25, Math.hypot(e.vel.x, e.vel.z) * 0.03);
    body.current.rotation.z = sin(T * 1.3) * 0.04;
    aL.current.rotation.x = s.armL; aR.current.rotation.x = s.armR;
    aL.current.rotation.z = 0.35; aR.current.rotation.z = -0.35;
    mats.glow.color.setScalar(1.2 + s.gl * 1.0 + 0.3 * sin(T * 6));
    mats.lit.opacity = s.alpha; mats.glow.opacity = s.alpha; mats.lit.depthWrite = s.alpha > 0.95;
    mats.aura.opacity = 0.35 * s.alpha;
    root.visible = s.alpha > 0.01;
    // orbiting souls
    const os = orbs.current.children;
    for (let i = 0; i < os.length; i++) {
      const a = T * orbSpeed + (i / os.length) * TAU;
      os[i].position.set(cos(a) * orbR, hover + 0.9 + sin(T * 2 + i * 1.7) * 0.4, sin(a) * orbR);
      os[i].scale.setScalar(0.9 + 0.2 * sin(T * 6 + i));
    }
    // ground rune
    rune.current.visible = s.runeK > 0.02;
    if (s.runeK > 0.02) { rune.current.scale.setScalar(9 * s.runeK + 1); rune.current.rotation.y = T * 0.8; runeMat.opacity = s.runeK; }
    // particles
    if (dt > 0 && e.state !== 'DYING') {
      if (Math.random() < dt * 20) FX.add.emit(e.pos.x + (Math.random() - 0.5) * 2.4 * sc, hover * sc + Math.random() * 2 * sc, e.pos.z + (Math.random() - 0.5) * 2.4 * sc, 0, 1.5, 0, 1.1, 0.32, 0.05, 1.4, 0.4, 2.2, 0.8, CELL.GLOW);
      if (Math.random() < dt * 6) smokePuff(e.pos.x, 0.2, e.pos.z, 1, 0x2a1840, 2.6, 1.4, 0.4, 1.6, 0.4);
      for (let i = 0; i < os.length; i += 1) if (Math.random() < dt * 14) { const wp = os[i].position; FX.add.emit(e.pos.x + wp.x * sc * Math.cos(-e.facing) - wp.z * sc * Math.sin(-e.facing), wp.y * sc, e.pos.z + wp.x * sc * Math.sin(-e.facing) + wp.z * sc * Math.cos(-e.facing), 0, 0.5, 0, 0.4, 0.5, 0.05, 1.2, 0.4, 2, 0.7, CELL.GLOW); }
    }
  });
  const orbIdx = [0, 1, 2, 3, 4];
  return (
    <>
      <group ref={g} visible={false}>
        <group ref={body}>
          <mesh geometry={geo.body} material={mats.lit} castShadow />
          <mesh geometry={geo.glow} material={mats.glow} />
          <group ref={aL} position={[-0.62, 2.0, 0.05]}><mesh geometry={geo.armL} material={mats.lit} castShadow /></group>
          <group ref={aR} position={[0.62, 2.0, 0.05]}>
            <mesh geometry={geo.armR} material={mats.lit} castShadow />
            <group position={[0, -1.15, 0.1]} rotation={[0, 0, 0]}><mesh geometry={geo.staff} material={mats.lit} castShadow /><mesh geometry={geo.staffGlow} material={mats.glow} /></group>
          </group>
        </group>
        <group ref={orbs}>{orbIdx.map((i) => <mesh key={i} geometry={geo.orb} material={mats.glow} />)}</group>
        <mesh geometry={runeGeo} material={runeMat} ref={rune} position={[0, 0.08, 0]} visible={false} />
        <mesh geometry={runeGeo} material={mats.aura} position={[0, 0.06, 0]} scale={4.6} />
      </group>
    </>
  );
}

export function Bosses() {
  return (<><Golem /><Lich /></>);
}
void shakeOff;
export const __builders = { buildGolem, buildLich };
