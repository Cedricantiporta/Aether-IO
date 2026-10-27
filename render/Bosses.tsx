// Unique, non-instanced boss models: Stone Golem and Lich.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, LatheGeometry, SphereGeometry, Vector2, CanvasTexture, Color, Group, IcosahedronGeometry, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, DoubleSide,
} from 'three';
import { world } from '../engine/world';
import type { Enemy } from '../engine/types';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, dustPuff, embers, smokePuff } from './fx';
import { GB, TAU, clamp, damp, lerp, noisify } from './util';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { makeBossMats, useBossRig } from './bossKit';
import { facetGeo } from './facetRock';

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
  // (owner 2026-10-24: Gorath is built from the chunky faceted boulders of his Boulder Prison - render/facetRock.ts - same silhouette as the old blocky body)
  const chunk = (bb: GB, v: number, hx: number, hy: number, hz: number, pos: [number, number, number], color: string, rot: [number, number, number] = [0, 0, 0]) => bb.add(facetGeo(v), pos, rot, [hx, hy, hz], color);
  const rock = (bb: GB, r: number, pos: [number, number, number], scl: [number, number, number], color: string, v = 0, rot: [number, number, number] = [0, 0, 0]) => chunk(bb, v, r * scl[0], r * scl[1], r * scl[2], pos, color, rot);
  const stone = '#9a9186', stone2 = '#766d62', moss = '#5aa03a', dark = '#4a443d';
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]);
  rock(body, 0.62, [0, 0.8, 0], [1.15, 0.95, 1.0], stone2, 2, [0, 0.3, 0]);          // pelvis
  rock(body, 0.88, [0, 1.5, 0.02], [1.2, 1.0, 0.95], stone, 1, [0, 0.15, 0]);        // chest
  rock(body, 0.5, [0, 1.15, 0.1], [1.2, 0.8, 1.0], stone2, 3, [0, -0.4, 0]);         // belly
  rock(body, 0.36, [0, 2.22, 0.12], [1.05, 0.95, 1.05], stone, 0, [0, 0.5, 0]);     // head
  chunk(body, 2, 0.34, 0.1, 0.14, [0, 2.3, 0.4], dark, [0.15, 0, 0]);                 // brow
  chunk(body, 3, 0.17, 0.12, 0.13, [0, 2.0, 0.34], stone2);                          // jaw
  for (const s of [-1, 1]) chunk(body, 1, 0.12, 0.3, 0.12, [s * 0.28, 2.55, 0.0], stone2, [0, 0.4, -s * 0.4]);   // horns
  for (const [x, y, z, r] of [[0.4, 2.0, 0.1, 0.34], [-0.55, 1.95, -0.2, 0.28], [0.1, 1.2, -0.7, 0.4], [-0.3, 2.05, -0.5, 0.3]] as const) chunk(body, 2, r * 1.15, r * 0.4, r * 1.0, [x, y, z], moss, [0, x * 4, 0]);
  chunk(body, 2, 0.32, 0.12, 0.26, [0.6, 0.85, 0.5], moss);
  // shoulder pauldron rocks
  for (const s of [-1, 1]) rock(body, 0.5, [s * 1.0, 2.05, 0], [1.05, 0.85, 1.05], stone, 1 + (s > 0 ? 2 : 0), [0, s, 0.2 * s]);
  // glow: chest ring + core + cracks + eyes (pushed a little forward of the rounder chest)
  const gz = 0.1;
  for (const [w, h, x, y] of [[0.92, 0.07, 0, 1.98], [0.92, 0.07, 0, 1.06], [0.07, 0.92, 0.46, 1.52], [0.07, 0.92, -0.46, 1.52]] as const) glow.box(w, h, 0.05, [x, y, 0.8 + gz], '#ff9a2a');   // square chest frame
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; glow.box(0.04, 0.38, 0.04, [cos(a) * 0.24, 1.52 + sin(a) * 0.24, 0.81 + gz], '#ff7a1a', [0, 0, a - Math.PI / 2]); }
  glow.box(0.3, 0.3, 0.1, [0, 1.52, 0.83 + gz], '#ffe080');
  const cr = (x: number, y: number, z: number, h: number, rz: number) => glow.box(0.045, h, 0.04, [x, y, z + gz], '#ff7a1a', [0, 0, rz]);
  cr(0.5, 1.9, 0.78, 0.5, 0.4); cr(-0.55, 1.2, 0.75, 0.45, -0.5); cr(0.4, 1.1, 0.8, 0.35, -0.3); cr(-0.3, 1.9, 0.82, 0.3, 0.2); cr(0.0, 0.85, 0.7, 0.4, 0.1);
  for (const s of [-1, 1]) glow.box(0.17, 0.09, 0.08, [s * 0.15, 2.24, 0.5], '#ffb040');
  const arm = (s: number) => {
    const a = new GB([0.72, 1.12]), g = new GB([1, 1]);
    rock(a, 0.36, [0, -0.45, 0], [1.05, 1.5, 1.05], stone, 1, [0, s, 0]);
    rock(a, 0.54, [0, -1.25, 0.05], [1.15, 1.0, 1.15], stone2, 3, [0, -s, 0]);
    for (let i = 0; i < 4; i++) chunk(a, i, 0.1, 0.1, 0.17, [(i - 1.5) * 0.2, -1.6, 0.35], dark, [0.3, i, 0]);
    chunk(a, 2, 0.32, 0.11, 0.26, [0.05, -0.1, -0.1], moss);
    g.box(0.9, 0.06, 0.9, [0, -0.78, 0], '#ff9a2a');
    g.box(0.7, 0.06, 0.7, [0, -0.28, 0], '#ff9a2a');
    return { body: a.build(), glow: g.build() };
  };
  const leg = new GB([0.7, 1.1]);
  rock(leg, 0.4, [0, -0.35, 0], [1.0, 1.5, 1.05], stone2, 1, [0, 0.4, 0]); chunk(leg, 2, 0.38, 0.12, 0.5, [0, -0.85, 0.12], dark);
  return { body: body.build(), glow: glow.build(), armL: arm(-1), armR: arm(1), leg: leg.build() };
}

export function Golem() {
  const geo = useMemo(buildGolem, []);
  const mats = useMemo(() => ({
    lit: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2) }),
  }), []);
  const g = useRef<Group>(null!), body = useRef<Group>(null!), aL = useRef<Group>(null!), aR = useRef<Group>(null!), lL = useRef<Group>(null!), lR = useRef<Group>(null!);
  const kb = useRef<Group>(null!), kw = useRef<Group>(null!);
  const km = useMemo(() => makeBossMats(), []), rig = useBossRig('boss_golem', km, true, false);   // (owner 2026-10-24: blocky Gorath - the rounded kit body is off)   // creature kit look (old meshes stay until the kit is in)
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
    if (rig && kw.current) {
      const J = rig.J, T = clock.elapsedTime;
      kw.current.scale.setScalar(e.scale / ENEMY_DEFS.BOSS_GOLEM.scale / sc);
      kb.current.position.y = s.dy; kb.current.rotation.x = s.pitch; kb.current.rotation.z = body.current.rotation.z;
      J.armL.rotation.x = s.armL; J.armR.rotation.x = s.armR; J.armL.rotation.z = aL.current.rotation.z; J.armR.rotation.z = aR.current.rotation.z;
      J.legL.rotation.x = lL.current.rotation.x; J.legR.rotation.x = lR.current.rotation.x;
      J.head.rotation.x = sin(T * 1.3) * 0.04 - s.pitch * 0.4; J.head.rotation.y = sin(T * 0.7) * 0.12;
      J.core.scale.setScalar(1 + 0.08 * sin(T * 4) + (s.gl - 1) * 0.06);
      km.glow.color.setScalar(0.9 + s.gl * 0.8 + 0.2 * sin(T * 5));
    }
    // stomp dust
    if (e.state === 'CHASE' && dt > 0) { const ph = Math.sin(legPh) > 0 ? 1 : 0; if (ph !== s.lastStep) { s.lastStep = ph; dustPuff(e.pos.x + (ph ? -1 : 1) * e.scale * 0.2, e.pos.z, 3, 2, 0xb8a888, 3); } }
    if (e.phase >= 1 && Math.random() < dt * (e.phase * 10) && e.state !== 'DYING') embers(e.pos.x + (Math.random() - 0.5) * 4, 3 + Math.random() * 4, e.pos.z + (Math.random() - 0.5) * 3, 1, 0xff7a1a, 0.2, 1.5, 1, 0.3);
  });
  const hips = 0.95;
  return (
    <group ref={g} visible={false}>
      {rig && <group ref={kb}><group ref={kw}><primitive object={rig.root} /></group></group>}
      <group visible={!rig}>
      <group ref={body}>
        <mesh geometry={geo.body} material={mats.lit} castShadow receiveShadow />
        <mesh geometry={geo.glow} material={mats.glow} />
        <group ref={aL} position={[-1.0, 1.85, 0]}><mesh geometry={geo.armL.body} material={mats.lit} castShadow receiveShadow /><mesh geometry={geo.armL.glow} material={mats.glow} /></group>
        <group ref={aR} position={[1.0, 1.85, 0]}><mesh geometry={geo.armR.body} material={mats.lit} castShadow receiveShadow /><mesh geometry={geo.armR.glow} material={mats.glow} /></group>
      </group>
      <group ref={lL} position={[-0.42, hips, 0]}><mesh geometry={geo.leg} material={mats.lit} castShadow receiveShadow /></group>
      <group ref={lR} position={[0.42, hips, 0]}><mesh geometry={geo.leg} material={mats.lit} castShadow receiveShadow /></group>
      </group>
    </group>
  );
}
const abs = Math.abs;

// ====================================================================== LICH
/** The Undying Lich (owner 2026-10-26: "round, blobby"): a tall toy-like lich-sorcerer. Flared layered robe (lathe), gold collar fins, big rounded
 *  pauldrons with bone horns, a skull under a violet hood + spiked crown, floating skeletal hands out of wide tattered sleeves, a crescent-topped staff
 *  with a glowing orb. Authored ~3.1 tall in the `body` frame (the group floats at `hover`). Arm pivots (+-0.62, 2.0) and the staff hand (0,-1.15,0.1) are unchanged. */
function buildLich() {
  const robe = '#8d5cf2', robe2 = '#6234c4', robeD = '#43208f', lav = '#cdb0ff', bone = '#fff1d6', gold = '#ffc93c', cyan = '#6af4ff', pink = '#ff6be6';
  const body = new GB([0.72, 1.12]), glow = new GB([1, 1]);
  const lathe = (pts: [number, number][], seg = 16) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);
  // lower skirt: wide flared bell with a scalloped hem
  body.add(lathe([[1.08, 0.0], [1.04, 0.12], [0.9, 0.42], [0.7, 0.8], [0.52, 1.15], [0.48, 1.3]], 18), [0, 0.0, 0], [0, 0, 0], 1, robe2);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; body.sph(0.21, [cos(a) * 1.02, 0.02, sin(a) * 1.02], robe2, [1, 1.7, 0.42], 7, [0, Math.PI / 2 - a, 0], [0.9, 1.1]); body.sph(0.15, [cos(a + 0.22) * 0.94, 0.12, sin(a + 0.22) * 0.94], robeD, [1, 1.5, 0.4], 6, [0, Math.PI / 2 - a - 0.22, 0]); }
  body.torus(1.02, 0.045, [0, 0.14, 0], gold, [Math.PI / 2, 0, 0], 1, 24);                     // gold hem band
  // upper robe: narrower, lighter layer that overlaps the skirt, then the chest narrowing to the neck
  body.add(lathe([[0.74, 0.55], [0.66, 0.85], [0.5, 1.2], [0.4, 1.5], [0.44, 1.75], [0.5, 1.95], [0.4, 2.12], [0.22, 2.2]], 16), [0, 0, 0], [0, 0, 0], 1, robe);
  body.torus(0.7, 0.04, [0, 0.62, 0], gold, [Math.PI / 2, 0, 0], 1, 18);                       // trim ring at the overlap
  // front tabard: a lavender panel from collar to hem with a rune stripe
  body.cone(0.2, 1.05, 4, [0, 0.82, 0.7], lav, [Math.PI - 0.32, 0, 0], [1, 1, 0.22]);               // lavender ribbon hanging from the sash down the skirt
  glow.box(0.045, 0.7, 0.03, [0, 0.84, 0.735], cyan, [-0.3, 0, 0]);
  body.sph(0.1, [0, 1.78, 0.44], gold, [1, 1.1, 0.6], 8); glow.sph(0.062, [0, 1.78, 0.5], pink, 1, 7);   // chest jewel
  // gold sash + a little skull charm
  body.torus(0.5, 0.075, [0, 1.3, 0.0], gold, [Math.PI / 2, 0, 0], [1, 1, 1], 18);
  body.sph(0.13, [0.28, 1.2, 0.42], bone, [1, 1.05, 0.9], 8); glow.sph(0.03, [0.25, 1.22, 0.53], cyan, 1, 5); glow.sph(0.03, [0.32, 1.22, 0.53], cyan, 1, 5);
  // back cape fin behind the shoulders
  body.cone(0.55, 1.5, 4, [0, 1.15, -0.55], robeD, [-0.28, Math.PI / 4, 0], [1.15, 1, 0.4]);
  // standing collar: two gold-trimmed fins swept up behind the head + a gold neck ring
  for (const s of [-1, 1]) { body.cone(0.2, 0.95, 4, [s * 0.34, 2.45, -0.2], robeD, [-0.15, 0.4 * s, -s * 0.5], [1, 1, 0.4]); body.cone(0.07, 0.8, 4, [s * 0.4, 2.44, -0.18], gold, [-0.15, 0.4 * s, -s * 0.5], [1, 1, 0.4]); }
  body.torus(0.3, 0.07, [0, 2.2, 0.0], gold, [Math.PI / 2, 0, 0], 1, 16);
  // pauldrons: big rounded caps with a gold rim and three bone horns
  for (const s of [-1, 1]) {
    body.sph(0.36, [s * 0.66, 2.04, 0], robe2, [1.15, 0.7, 1.1], 12);
    body.torus(0.3, 0.05, [s * 0.66, 1.95, 0], gold, [Math.PI / 2, 0, 0], [1.15, 1.1, 1], 14);
    body.cone(0.09, 0.42, 5, [s * 0.85, 2.3, 0], bone, [0, 0, -s * 0.65]);
    body.cone(0.07, 0.3, 5, [s * 0.66, 2.38, 0.14], bone, [0.45, 0, -s * 0.15]);
    body.cone(0.07, 0.3, 5, [s * 0.62, 2.36, -0.15], bone, [-0.45, 0, -s * 0.15]);
  }
  // head: skull + jaw + dark sockets under a violet hood, spiked gold crown
  const hy = 2.58;
  body.sph(0.29, [0, hy, 0.05], bone, [1, 1.05, 1.02], 12);
  body.sph(0.2, [0, hy - 0.2, 0.12], bone, [1, 0.62, 0.95], 10);                               // jaw
  body.box(0.2, 0.05, 0.05, [0, hy - 0.26, 0.28], '#3a2850');                                   // teeth line
  for (const s of [-1, 1]) body.sph(0.095, [s * 0.115, hy + 0.02, 0.27], '#241046', [1, 1.15, 0.7], 8);
  body.tetra(0.045, [0, hy - 0.1, 0.33], '#3a2850', [1, 1.2, 0.6]);                             // nose
  const hood = new SphereGeometry(0.4, 14, 10, Math.PI / 2 + 0.72, TAU - 1.44, 0, Math.PI * 0.78);   // open to the front (+z)
  body.add(hood, [0, hy + 0.02, -0.02], [0, 0, 0], [1.02, 1.12, 1.08], robe2);
  body.cone(0.2, 0.55, 8, [0, hy + 0.22, -0.38], robe2, [-1.15, 0, 0]);                         // droopy hood tip
  body.torus(0.3, 0.035, [0, hy + 0.2, 0.0], gold, [Math.PI / 2 - 0.12, 0, 0], [1, 1.05, 1], 16);  // crown band
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.52, mid = i === 2; body.cone(0.065, 0.3 + (mid ? 0.16 : 0), 5, [sin(a) * 0.3, hy + 0.34 + (mid ? 0.05 : 0), cos(a) * 0.3 - 0.02], gold, [-0.12, 0, -a * 0.55]); }
  for (const s of [-1, 1]) glow.sph(0.062, [s * 0.115, hy + 0.025, 0.31], cyan, 1, 7);        // eyes
  glow.ico(0.05, [0, hy + 0.36, 0.3], pink, 1, 0);                                              // forehead gem
  // tattered hem wisps that trail below the robe
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; glow.cone(0.04, 0.3, 4, [cos(a) * 0.55, -0.12, sin(a) * 0.55], '#b080ff', [Math.PI, 0, 0]); }

  // arms: pivot at the shoulder. A wide tattered sleeve; the skeletal hand floats just past its cuff
  const arm = (s: number) => {
    const a = new GB([0.75, 1.1]), ag = new GB([1, 1]);
    a.add(lathe([[0.15, 0.04], [0.2, -0.3], [0.3, -0.72], [0.34, -0.9]], 10), [0, 0, 0], [0, 0, 0], 1, robe2);
    for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; a.cone(0.09, 0.26, 4, [cos(t) * 0.3, -0.9, sin(t) * 0.3], robeD, [Math.PI, 0, 0]); }
    a.torus(0.31, 0.045, [0, -0.78, 0], gold, [Math.PI / 2, 0, 0], 1, 12);
    a.sph(0.09, [0, -1.15, 0.05], bone, [1.2, 0.9, 1], 8);                                       // palm
    for (let i = 0; i < 4; i++) a.cone(0.02, 0.2, 4, [(i - 1.5) * 0.055, -1.3, 0.1], bone, [0.35, 0, (i - 1.5) * 0.18]);
    a.cone(0.022, 0.15, 4, [s * -0.1, -1.2, 0.08], bone, [0.3, 0, s * 1.0]);
    ag.torus(0.13, 0.014, [0, -1.0, 0.04], cyan, [Math.PI / 2, 0, 0], 1, 10);                    // little glow ring where the hand floats
    return { body: a.build(), glow: ag.build() };
  };
  const armL = arm(-1), armR = arm(1);
  // staff in the right hand: violet shaft, gold bands, a crescent cradle with a big glowing orb, a bone knob below it
  const staff = new GB([0.8, 1.1]), sg = new GB([1, 1]);
  staff.cyl(0.045, 0.055, 3.6, 7, [0, -0.5, 0.1], '#5a2f98');
  for (const y of [-2.05, 0.2]) staff.torus(0.06, 0.02, [0, y, 0.1], gold, [Math.PI / 2, 0, 0], 1, 8);
  staff.sph(0.09, [0, 0.85, 0.1], bone, [1, 1.1, 1], 8);
  staff.torus(0.24, 0.045, [0, 1.45, 0.1], gold, [0, 0, Math.PI * 0.85], 1, 14, Math.PI * 1.3);   // gold crescent cradle (opening up)
  for (const s of [-1, 1]) staff.cone(0.045, 0.2, 5, [s * 0.2, 1.7, 0.1], gold, [0, 0, -s * 0.2]);
  sg.sph(0.2, [0, 1.48, 0.1], pink, 1, 10); sg.sph(0.09, [0, 1.48, 0.1], '#ffffff', 1, 6);
  const orb = new GB([1, 1]).sph(0.14, [0, 0, 0], cyan, 1, 8).sph(0.06, [0, 0, 0], '#ffffff', 1, 5).build();
  return { body: body.build(), glow: glow.build(), armL: armL.body, armLGlow: armL.glow, armR: armR.body, armRGlow: armR.glow, staff: staff.build(), staffGlow: sg.build(), orb };
}

export function Lich() {
  const geo = useMemo(buildLich, []);
  const mats = useMemo(() => {
    const lit = new MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.62, metalness: 0.02, transparent: true, side: DoubleSide });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2), transparent: true });
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d')!;
    const gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const aura = new MeshBasicMaterial({ map: new CanvasTexture(gc), color: new Color(1.4, 0.4, 2.2), transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
    return { lit, glow, aura };
  }, []);
  const g = useRef<Group>(null!), body = useRef<Group>(null!), aL = useRef<Group>(null!), aR = useRef<Group>(null!), orbs = useRef<Group>(null!), rune = useRef<Mesh>(null!);
  const S = useRef({ armL: 0, armR: 0, gl: 1, alpha: 1, pitch: 0, runeK: 0 });
  const kb = useRef<Group>(null!), kw = useRef<Group>(null!);
  const km = useMemo(() => makeBossMats(true), []), rig = useBossRig('boss_lich', km, true, false);   // (owner 2026-10-26: the rounded kit body is off - procedural lich below)   // creature kit look (old meshes stay until the kit is in)
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
    aL.current.rotation.z = -0.3; aR.current.rotation.z = 0.3;   // sleeves swing OUT (the robe is wide)
    mats.glow.color.setScalar(1.2 + s.gl * 1.0 + 0.3 * sin(T * 6));
    mats.lit.opacity = s.alpha; mats.glow.opacity = s.alpha; mats.lit.depthWrite = s.alpha > 0.95;
    mats.aura.opacity = 0.35 * s.alpha;
    root.visible = s.alpha > 0.01;
    if (rig && kw.current) {
      const J = rig.J;
      kw.current.scale.setScalar(e.scale / ENEMY_DEFS.BOSS_LICH.scale / sc);
      kb.current.position.y = hover * 0.55; kb.current.rotation.x = body.current.rotation.x; kb.current.rotation.z = body.current.rotation.z;
      J.armL.rotation.x = s.armL; J.armR.rotation.x = s.armR; J.armL.rotation.z = -0.22; J.armR.rotation.z = 0.22;
      J.head.rotation.x = sin(T * 1.7) * 0.05 - s.pitch * 0.5; J.head.rotation.y = sin(T * 0.9) * 0.18;
      J.orb.rotation.y = T * orbSpeed; J.orb.position.y = 2.5 + sin(T * 2.1) * 0.15;
      km.glow.color.setScalar(0.9 + s.gl * 0.8 + 0.25 * sin(T * 6));
      km.lit.opacity = s.alpha; km.glow.opacity = s.alpha; km.lit.depthWrite = s.alpha > 0.95;
    }
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
        {rig && <group ref={kb}><group ref={kw}><primitive object={rig.root} /></group></group>}
        <group visible={!rig}>
        <group ref={body}>
          <mesh geometry={geo.body} material={mats.lit} castShadow />
          <mesh geometry={geo.glow} material={mats.glow} />
          <group ref={aL} position={[-0.62, 2.0, 0.05]}><mesh geometry={geo.armL} material={mats.lit} castShadow /><mesh geometry={geo.armLGlow} material={mats.glow} /></group>
          <group ref={aR} position={[0.62, 2.0, 0.05]}>
            <mesh geometry={geo.armR} material={mats.lit} castShadow /><mesh geometry={geo.armRGlow} material={mats.glow} />
            <group position={[0, -1.15, 0.1]} rotation={[0, 0, 0]}><mesh geometry={geo.staff} material={mats.lit} castShadow /><mesh geometry={geo.staffGlow} material={mats.glow} /></group>
          </group>
        </group>
        <group ref={orbs} visible={!rig}>{orbIdx.map((i) => <mesh key={i} geometry={geo.orb} material={mats.glow} />)}</group>
        </group>
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
