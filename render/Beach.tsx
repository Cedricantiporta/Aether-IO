// Lakeside beach outside the west town wall (engine/beachData.ts): boardwalk, a pier with a T-head out into the lake,
// palms, a rocky headland closing the north end, a beached rowboat, campfire, umbrella + towels, driftwood, crates,
// barrels, a net-drying rack, foam along the water line. Everything static is ONE merged vertex-coloured mesh (+ one
// emissive mesh for lanterns / fire). FishingRig draws the rod, line, bobber and "!" from world.fishing (no React state).
// buildFishStall() is the Fishmonger's stall model (used by render/Town.tsx Shop, type 'FISH').
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
  Quaternion, RingGeometry, Sprite, Vector3,
} from 'three';
import { GB, TAU, litMat, mulberry32 } from './util';
import { groundY } from './terrainFn';
import { embers, smokePuff } from './fx';
import { labelMaterial } from './label';
import { QualityCfg } from './quality';
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import {
  BEACH, BOARDWALK, DOCK, FISH_SPOTS, HEADLAND, PALMS, CAMPFIRE, UMBRELLA, ROWBOAT, DRIFTWOOD, CRATES, BARRELS, NET_RACK, ENTRY_SIGN,
} from '../engine/beachData';
import { FISH } from '../engine/systems/fishing';

type V3 = [number, number, number];
const WOOD = '#7a5634', WOOD2 = '#8a6440', WOOD_D = '#5e4026', DARK = '#3e2a18', BLEACH = '#a89e8a';

// ------------------------------------------------------------------ pieces ---
function palm(b: GB, x: number, z: number, s: number, lean: number) {
  // curved trunk: 7 tapering segments bending toward `lean`, ringed bark; crown of drooping fronds + coconuts
  const lx = Math.sin(lean), lz = Math.cos(lean);
  let px = x, py = 0, pz = z;
  const n = 7, segH = 0.82 * s;
  for (let i = 0; i < n; i++) {
    const t = i / n, bend = 0.08 + t * 0.22;
    const r0 = (0.3 - t * 0.14) * s, r1 = (0.3 - (t + 1 / n) * 0.14) * s;
    const cx = px + lx * bend * segH * 0.5, cz = pz + lz * bend * segH * 0.5;
    b.cyl(r1, r0, segH * 1.04, 6, [cx, py + segH / 2, cz], i % 2 ? '#8a6a48' : '#7a5c3c', [lz * bend, 0, -lx * bend]);
    px += lx * bend * segH; pz += lz * bend * segH; py += segH * Math.cos(bend);
  }
  const top: V3 = [px, py, pz];
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + lean; b.sph(0.17 * s, [px + Math.cos(a) * 0.22 * s, py - 0.18 * s, pz + Math.sin(a) * 0.22 * s], '#5a3e22', 1, 6); }
  const N = 8;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * TAU + lean * 0.7, ca = Math.cos(a), sa = Math.sin(a);
    const col = f % 2 ? '#4f9a3c' : '#62ae46';
    // two-segment frond: out and up, then drooping down
    const l1 = 1.25 * s, l2 = 1.35 * s;
    b.box(l1, 0.06 * s, 0.55 * s, [top[0] + ca * l1 * 0.5, top[1] + 0.12 * s, top[2] + sa * l1 * 0.5], col, [0, -a, 0.18]);
    b.box(l2, 0.05 * s, 0.42 * s, [top[0] + ca * (l1 + l2 * 0.42), top[1] - 0.32 * s, top[2] + sa * (l1 + l2 * 0.42)], col, [0, -a, -0.55]);
  }
  b.sph(0.26 * s, [top[0], top[1] + 0.05, top[2]], '#4a8a36', [1, 0.6, 1], 6);
}

function rock(b: GB, x: number, z: number, r: number, h: number, rot: number, rnd: () => number) {
  const c = rnd() < 0.5 ? '#8a8f94' : '#7d8288';
  b.dodeca(r, [x, h * 0.32, z], c, [1, h / r * 0.62, 0.9 + rnd() * 0.2], [rnd() * 0.3, rot, rnd() * 0.3]);
  if (rnd() < 0.6) b.dodeca(r * 0.55, [x + (rnd() - 0.5) * r, h * 0.62, z + (rnd() - 0.5) * r * 0.6], '#9a9f9a', [1, 0.7, 1], [0, rot + 1, 0]);
  if (rnd() < 0.5) b.ico(r * 0.4, [x + (rnd() - 0.5) * r * 0.6, h * 0.8, z], '#6f9a4a', [1.2, 0.35, 1], 0);   // moss cap
}

function boat(b: GB, x: number, y: number, z: number, yaw: number, tilt: number, hull = '#6b4a2e', rim = '#8a6440') {
  // a rowboat along its local z: hull box + pointed bow (cone), gunwales, two thwarts, oars inside
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const P = (lx: number, ly: number, lz: number): V3 => [x + lx * cy + lz * sy, y + ly, z - lx * sy + lz * cy];
  b.box(1.25, 0.5, 2.8, P(0, 0.25, -0.2), hull, [tilt, yaw, 0]);
  b.cone(0.66, 1.0, 4, P(0, 0.25, 1.68), hull, [Math.PI / 2, yaw + Math.PI / 4, 0], [1, 1, 0.72]);
  for (const sx of [-0.62, 0.62]) b.box(0.1, 0.12, 3.0, P(sx, 0.52, -0.1), rim, [tilt, yaw, 0]);
  b.box(1.3, 0.12, 0.1, P(0, 0.52, -1.6), rim, [tilt, yaw, 0]);
  b.box(1.15, 0.08, 0.32, P(0, 0.42, 0.5), '#a07a50', [tilt, yaw, 0]); b.box(1.15, 0.08, 0.32, P(0, 0.42, -0.8), '#a07a50', [tilt, yaw, 0]);
  b.box(0.08, 0.06, 2.4, P(0.32, 0.5, -0.2), '#c9b27a', [tilt, yaw + 0.12, 0]); b.box(0.24, 0.04, 0.5, P(0.32 + 0.14, 0.5, 0.9), '#c9b27a', [tilt, yaw + 0.12, 0]);
}

function barrel(b: GB, x: number, z: number, y = 0) {
  b.cyl(0.42, 0.46, 0.9, 9, [x, y + 0.45, z], '#8a5a30'); b.cyl(0.47, 0.47, 0.07, 9, [x, y + 0.25, z], '#3a3a40'); b.cyl(0.47, 0.47, 0.07, 9, [x, y + 0.68, z], '#3a3a40');
  b.cyl(0.38, 0.38, 0.04, 9, [x, y + 0.91, z], '#6e4b2b');
}
function crate(b: GB, x: number, y: number, z: number, rot: number, s = 0.85) {
  b.box(s, s, s, [x, y + s / 2, z], '#9c7245', [0, rot, 0]);
  b.box(s + 0.04, 0.1, s + 0.04, [x, y + s * 0.82, z], '#6e4b2b', [0, rot, 0]); b.box(s + 0.04, 0.1, s + 0.04, [x, y + s * 0.18, z], '#6e4b2b', [0, rot, 0]);
}
function fishShape(b: GB, x: number, y: number, z: number, yaw: number, s: number, col: string, vertical = false) {
  // a tiny low-poly fish: squashed body + tail fin
  const rot: V3 = vertical ? [0, yaw, Math.PI / 2] : [0, yaw, 0];
  b.sph(0.18 * s, [x, y, z], col, [1.6, 0.7, 0.45], 6, rot);
  const tx = vertical ? 0 : -Math.cos(yaw) * 0.32 * s, tz = vertical ? 0 : Math.sin(yaw) * 0.32 * s, ty = vertical ? -0.32 * s : 0;
  b.cone(0.13 * s, 0.2 * s, 3, [x + tx, y + ty, z + tz], col, vertical ? [Math.PI, yaw, 0] : [0, yaw, Math.PI / 2], [1, 1, 0.35]);
}
function lanternPost(b: GB, g: GB, x: number, z: number, y0: number, h = 2.2) {
  b.box(0.14, h, 0.14, [x, y0 + h / 2, z], DARK); b.box(0.6, 0.08, 0.08, [x + 0.25, y0 + h - 0.05, z], DARK);
  const lx = x + 0.5, ly = y0 + h - 0.45;
  b.box(0.04, 0.3, 0.04, [lx, ly + 0.28, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [lx, ly + 0.14, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [lx, ly - 0.2, z], '#2a2a2e');
  g.sph(0.14, [lx, ly - 0.03, z], '#ffd070', 1, 6);
}

function buildBeach(): { body: BufferGeometry; glow: BufferGeometry; fire: BufferGeometry } {
  const b = new GB([0.82, 1.06]), g = new GB([1, 1]), rnd = mulberry32(4242);
  const yTop = DOCK.y;
  // ---- boardwalk: along z = BOARDWALK.z from the entrance west, then north along x = BOARDWALK.x
  {
    const { z: bz, xE, x: bx, zN, w } = BOARDWALK;
    for (let x = xE; x > bx - w / 2; x -= 0.52) b.box(0.46, 0.12, w, [x, 0.06, bz], rnd() < 0.5 ? WOOD : WOOD2, [0, (rnd() - 0.5) * 0.04, 0]);
    for (const s of [-1, 1]) b.box(xE - bx + w / 2, 0.08, 0.14, [(xE + bx - w / 2) / 2, 0.04, bz + s * (w / 2 - 0.08)], WOOD_D);
    for (let z = bz - w / 2; z > zN; z -= 0.52) b.box(w, 0.12, 0.46, [bx, 0.06, z], rnd() < 0.5 ? WOOD : WOOD2, [0, (rnd() - 0.5) * 0.04, 0]);
    for (const s of [-1, 1]) b.box(0.14, 0.08, bz - zN, [bx + s * (w / 2 - 0.08), 0.04, (bz + zN) / 2], WOOD_D);
    // rope posts along the water side of the north run
    for (let z = bz - 3; z > zN + 1; z -= 4.5) { if (Math.abs(z - DOCK.z) < 2.2) continue; b.cyl(0.08, 0.09, 0.8, 5, [bx - w / 2 - 0.15, 0.4, z], DARK); }
  }
  // ---- the pier: walkway planks across, stringers, posts into the water, T-head with rails, lanterns, bollards
  {
    const z = DOCK.z, hw = DOCK.hw, x0 = BOARDWALK.x - BOARDWALK.w / 2, x1 = DOCK.x1;
    for (let x = x0; x > x1; x -= 0.5) b.box(0.44, 0.12, hw * 2, [x, yTop - 0.06, z + (rnd() - 0.5) * 0.06], rnd() < 0.5 ? WOOD : '#84603c', [0, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03]);
    for (const s of [-1, 1]) b.box(x0 - x1, 0.16, 0.16, [(x0 + x1) / 2, yTop - 0.18, z + s * (hw - 0.1)], WOOD_D);
    for (let x = -64; x > x1; x -= 2.6) for (const s of [-1, 1]) b.cyl(0.13, 0.15, 2.0, 7, [x, yTop - 1.0, z + s * (hw + 0.05)], DARK);
    const H = DOCK.head;
    for (let zz = H.z0 + 0.25; zz < H.z1; zz += 0.5) b.box(H.x1 - H.x0, 0.12, 0.44, [(H.x0 + H.x1) / 2, yTop - 0.06, zz], rnd() < 0.5 ? WOOD : '#84603c', [0, (rnd() - 0.5) * 0.02, 0]);
    for (const zz of [H.z0 + 0.1, H.z1 - 0.1]) b.box(H.x1 - H.x0, 0.16, 0.16, [(H.x0 + H.x1) / 2, yTop - 0.18, zz], WOOD_D);
    for (const xx of [H.x0, (H.x0 + H.x1) / 2, H.x1]) for (const zz of [H.z0, (H.z0 + H.z1) / 2, H.z1]) b.cyl(0.15, 0.17, 2.1, 7, [xx, yTop - 1.0, zz], DARK);
    // rails along the north and south edges of the head (the west end stays open for fishing)
    for (const zz of [H.z0 + 0.12, H.z1 - 0.12]) {
      for (let xx = H.x1 - 0.3; xx > H.x0 + 0.8; xx -= 1.5) b.box(0.12, 0.9, 0.12, [xx, yTop + 0.45, zz], WOOD_D);
      b.box(H.x1 - H.x0 - 1.0, 0.1, 0.1, [(H.x0 + H.x1) / 2 + 0.4, yTop + 0.88, zz], WOOD);
      b.box(H.x1 - H.x0 - 1.0, 0.08, 0.08, [(H.x0 + H.x1) / 2 + 0.4, yTop + 0.48, zz], WOOD);
    }
    lanternPost(b, g, H.x0 + 0.5, H.z0 + 0.5, yTop); lanternPost(b, g, H.x0 + 0.5, H.z1 - 0.5, yTop);
    // bollards + rope coil, a bench, a bucket, a lifebuoy on the rail
    for (const zz of [H.z0 + 0.6, H.z1 - 0.6]) { b.cyl(0.16, 0.18, 0.45, 8, [H.x1 - 0.6, yTop + 0.22, zz], DARK); b.cyl(0.22, 0.22, 0.06, 8, [H.x1 - 0.6, yTop + 0.47, zz], DARK); }
    b.torus(0.3, 0.07, [H.x1 - 1.6, yTop + 0.07, H.z0 + 0.7], '#c9b27a', [Math.PI / 2, 0, 0], 1, 10);
    b.box(1.8, 0.1, 0.45, [H.x1 - 2.6, yTop + 0.45, H.z1 - 0.6], WOOD2); for (const o of [-0.7, 0.7]) b.box(0.12, 0.45, 0.4, [H.x1 - 2.6 + o, yTop + 0.22, H.z1 - 0.6], WOOD_D);
    b.cyl(0.24, 0.2, 0.42, 8, [H.x0 + 1.6, yTop + 0.21, z + 1.4], '#7f8a94'); b.torus(0.22, 0.025, [H.x0 + 1.6, yTop + 0.55, z + 1.4], '#3a3a40', [0, 0, Math.PI / 2], 1, 8, Math.PI);
    fishShape(b, H.x0 + 1.6, yTop + 0.46, z + 1.4, 0.4, 0.9, '#b8c8d4');
    b.torus(0.32, 0.09, [H.x1 - 3.8, yTop + 0.6, H.z0 + 0.22], '#e8553a', [0, 0, 0], 1, 12, Math.PI);
    b.torus(0.32, 0.09, [H.x1 - 3.8, yTop + 0.6, H.z0 + 0.22], '#f2efe6', [0, 0, Math.PI], 1, 12, Math.PI);
    // a rowboat moored on the north side of the head
    boat(b, H.x0 + 3.0, -0.22, H.z1 + 1.6, Math.PI / 2 + 0.12, 0, '#3f5a6e', '#8a6440');
    b.box(0.05, 0.05, 1.6, [H.x1 - 0.6, yTop + 0.3, H.z1 + 0.7], '#c9b27a', [0.3, 0.6, 0]);
  }
  // ---- rocky headland closing the north end (partly in the water)
  for (let i = 0; i < HEADLAND.length; i++) {
    const [x, z, r] = HEADLAND[i];
    rock(b, x, z, r * 0.95, r * (1.2 + rnd() * 0.7), rnd() * 6, rnd);
    if (rnd() < 0.7) rock(b, x + (rnd() - 0.5) * 2, z + (rnd() < 0.5 ? -1.6 : 1.5) * (0.6 + rnd() * 0.5), r * 0.55, r * 0.7, rnd() * 6, rnd);
  }
  for (let i = 0; i < 5; i++) rock(b, -70.5 - i * 1.4 - rnd(), 4 + (rnd() - 0.5) * 3, 0.9 + rnd() * 0.7, 0.8 + rnd() * 0.6, rnd() * 6, rnd);   // stepping stones out into the lake
  // ---- palms
  for (const [x, z, s, lean] of PALMS) palm(b, x, z, s, lean);
  // ---- campfire with stone ring, logs and two log benches
  {
    const { x, z } = CAMPFIRE;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; b.dodeca(0.22, [x + Math.cos(a) * 0.72, 0.1, z + Math.sin(a) * 0.72], i % 2 ? '#8a8f94' : '#6f747a', [1, 0.7, 1]); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; b.cyl(0.08, 0.1, 1.0, 5, [x + Math.cos(a) * 0.18, 0.22, z + Math.sin(a) * 0.18], '#4a3020', [0, -a, Math.PI / 2 - 0.45]); }
    b.cyl(0.42, 0.45, 0.06, 8, [x, 0.03, z], '#2a2420');
    b.cyl(0.24, 0.26, 2.0, 7, [x, 0.24, z + 2.2], '#6e5236', [0, 0, Math.PI / 2]);
    b.cyl(0.24, 0.26, 2.0, 7, [x - 2.3, 0.24, z - 0.3], '#6e5236', [Math.PI / 2, 0, 0]);
  }
  // ---- umbrella, towels, a deck chair and a sandcastle
  {
    const { x, z } = UMBRELLA;
    b.cyl(0.05, 0.05, 2.6, 5, [x, 1.3, z], '#e8e0d0', [0.08, 0, 0]);
    b.cone(1.7, 0.75, 8, [x + 0.1, 2.7, z + 0.1], '#e8553a', [0.08, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + TAU / 16; b.cone(0.52, 0.26, 3, [x + 0.1 + Math.cos(a) * 1.05, 2.58, z + 0.1 + Math.sin(a) * 1.05], '#f4efe4', [0.08, -a - Math.PI / 2, 0], [1, 1, 0.2]); }
    b.sph(0.08, [x + 0.15, 3.1, z + 0.15], '#f4efe4', 1, 5);
    b.box(0.95, 0.03, 1.9, [x - 1.2, 0.02, z + 1.1], '#5fb6d8', [0, 0.2, 0]); b.box(0.95, 0.031, 0.25, [x - 1.17, 0.025, z + 0.5], '#f4efe4', [0, 0.2, 0]);
    b.box(0.95, 0.03, 1.9, [x + 1.3, 0.02, z + 1.4], '#f2c14e', [0, -0.15, 0]);
    // deck chair (seen side-on: slatted back + seat on an A frame)
    const cx = x + 0.3, cz = z - 1.9;
    b.box(0.7, 0.06, 1.0, [cx, 0.42, cz], '#f4efe4', [-0.15, 0.3, 0]); b.box(0.7, 0.06, 0.9, [cx - 0.12, 0.85, cz - 0.62], '#f4efe4', [-1.05, 0.3, 0]);
    for (const o of [-0.34, 0.34]) { b.box(0.05, 0.05, 1.3, [cx + o * Math.cos(0.3), 0.32, cz - o * Math.sin(0.3)], WOOD, [-0.3, 0.3, 0]); b.box(0.05, 0.9, 0.05, [cx + o * Math.cos(0.3) - 0.15, 0.55, cz - 0.6 - o * Math.sin(0.3)], WOOD, [0.5, 0.3, 0]); }
    const sx = x - 2.6, sz = z - 2.2;
    b.box(0.9, 0.35, 0.9, [sx, 0.17, sz], '#d8c08a'); for (const [ox, oz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) b.cyl(0.14, 0.17, 0.6, 6, [sx + ox, 0.3, sz + oz], '#d4bc86');
    b.cyl(0.2, 0.26, 0.45, 6, [sx, 0.55, sz], '#dcc590'); b.cone(0.22, 0.3, 6, [sx, 0.92, sz], '#d0b880'); b.box(0.02, 0.3, 0.02, [sx, 1.2, sz], '#6e4b2b'); b.box(0.2, 0.12, 0.02, [sx + 0.1, 1.3, sz], '#e8553a');
  }
  // ---- beached rowboat (bow pulled up the sand toward the land), tilted on its keel
  boat(b, ROWBOAT.x, 0.05, ROWBOAT.z, ROWBOAT.rot + Math.PI, 0.05);
  // ---- driftwood logs
  for (const [x, z, rot] of DRIFTWOOD) {
    b.cyl(0.16, 0.2, 2.2, 6, [x, 0.14, z], BLEACH, [0, rot, Math.PI / 2]);
    b.cyl(0.06, 0.09, 0.7, 5, [x + Math.cos(rot) * 0.4, 0.3, z - Math.sin(rot) * 0.4], BLEACH, [0.4, rot + 0.9, 0.7]);
  }
  // ---- crates (one stacked), barrels, a pile of rope
  crate(b, CRATES[0][0], 0, CRATES[0][1], CRATES[0][2]); crate(b, CRATES[1][0], 0, CRATES[1][1], CRATES[1][2], 0.75); crate(b, CRATES[0][0] + 0.05, 0.85, CRATES[0][1] + 0.02, CRATES[2][2], 0.62);
  for (const [x, z] of BARRELS) barrel(b, x, z);
  b.torus(0.32, 0.08, [BARRELS[0][0] + 0.9, 0.08, BARRELS[0][1] - 0.6], '#c9b27a', [Math.PI / 2, 0, 0], 1, 10); b.torus(0.22, 0.07, [BARRELS[0][0] + 0.9, 0.2, BARRELS[0][1] - 0.6], '#c9b27a', [Math.PI / 2, 0, 0], 1, 10);
  // ---- net-drying rack along the wall: two posts, a pole, nets with floats
  {
    const { x, z } = NET_RACK;
    for (const o of [-1.4, 1.4]) b.box(0.16, 2.0, 0.16, [x, 1.0, z + o], WOOD_D);
    b.cyl(0.06, 0.06, 3.2, 5, [x, 1.95, z], WOOD, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) b.box(0.04, 1.3, 0.72, [x + 0.05 + (i % 2) * 0.05, 1.3, z - 1.05 + i * 0.7], '#4c5e4a', [(i % 2 ? 0.08 : -0.06), 0, 0.06]);
    for (let i = 0; i < 5; i++) b.sph(0.08, [x + 0.1, 1.9 - (i % 2) * 0.05, z - 1.2 + i * 0.6], i % 2 ? '#e8553a' : '#f4efe4', 1, 5);
  }
  // ---- signpost at the entrance (planks pointing to the beach, a fish emblem)
  {
    const { x, z } = ENTRY_SIGN;
    b.box(0.16, 2.1, 0.16, [x, 1.05, z], WOOD_D);
    b.box(1.4, 0.38, 0.08, [x - 0.55, 1.75, z], WOOD2); b.cone(0.22, 0.25, 3, [x - 1.35, 1.75, z], WOOD2, [0, 0, Math.PI / 2], [1, 1, 0.35]);
    fishShape(b, x - 0.6, 1.76, z + 0.06, 0, 1.3, '#4fb6d8');
    b.box(1.1, 0.32, 0.08, [x + 0.3, 1.3, z], '#7a5634', [0, 0, -0.06]);
  }
  // ---- shore spots: a forked rod rest, a bucket and a stool behind each shore fishing spot
  for (let i = 1; i < FISH_SPOTS.length; i++) {
    const s = FISH_SPOTS[i], x = s.x + 1.4, z = s.z + 1.3;
    b.cyl(0.035, 0.05, 1.0, 4, [x, 0.5, z], DARK, [0, 0, 0.35]); b.cyl(0.035, 0.05, 1.0, 4, [x - 0.2, 0.5, z], DARK, [0, 0, -0.25]);
    b.cyl(0.02, 0.03, 2.4, 4, [x - 0.9, 1.15, z], '#b08850', [0, 0, 1.05]);
    b.cyl(0.22, 0.18, 0.38, 8, [x + 0.5, 0.19, z - 1.0], '#7f8a94');
    b.cyl(0.25, 0.25, 0.06, 8, [x + 0.7, 0.42, z + 0.6], WOOD2); for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; b.cyl(0.03, 0.03, 0.42, 4, [x + 0.7 + Math.cos(a) * 0.17, 0.21, z + 0.6 + Math.sin(a) * 0.17], WOOD_D); }
  }
  // ---- shells / starfish on the sand
  for (let i = 0; i < 26; i++) {
    const x = -48 - rnd() * 16, z = BEACH.z0 + 3 + rnd() * (BEACH.z1 - BEACH.z0 - 6);
    if (Math.abs(z - BOARDWALK.z) < 1.8 || Math.abs(x - BOARDWALK.x) < 1.8 || Math.abs(z - DOCK.z) < 1.8) continue;
    if (rnd() < 0.4) { for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; b.box(0.2, 0.04, 0.06, [x + Math.cos(a) * 0.09, 0.03, z + Math.sin(a) * 0.09], '#ff9a6a', [0, -a, 0]); } }
    else b.sph(0.09, [x, 0.03, z], rnd() < 0.5 ? '#f4e8d8' : '#f0c8b8', [1, 0.5, 1.2], 5, [0, rnd() * 6, 0]);
  }
  // ---- foam along the water line (where the sand dips under the lake surface y = -0.15) + a few reeds at the ends
  for (let z = BEACH.z0 + 1; z < BEACH.z1 + 4; z += 1.4) {
    let wx = BEACH.shoreX;
    for (let x = -60; x > -76; x -= 0.25) if (groundY(x, z) < -0.15) { wx = x; break; }
    if (Math.abs(z - DOCK.z) < 1.5) continue;
    b.box(0.35 + rnd() * 0.4, 0.02, 1.0 + rnd() * 0.8, [wx - 0.1 + (rnd() - 0.5) * 0.4, -0.125, z], '#eef6f2', [0, (rnd() - 0.5) * 0.4, 0]);
    if (rnd() < 0.3) b.box(0.25, 0.02, 0.6, [wx - 0.9 - rnd() * 0.6, -0.13, z + rnd()], '#dcecea', [0, rnd(), 0]);
    if ((z < BEACH.z0 + 8 || z > BEACH.z1 - 6) && rnd() < 0.7) for (let k = 0; k < 4; k++) { const rx = wx - 0.4 - rnd() * 1.6, rz = z + (rnd() - 0.5) * 1.4, h = 1.0 + rnd() * 0.8; b.cyl(0.03, 0.05, h, 4, [rx, h / 2 - 0.2, rz], k % 2 ? '#6f8f3a' : '#5d7d2e', [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]); }
  }
  // ---- campfire flames (emissive, local to the fire so they can flicker)
  const fire = new GB([0.85, 1.15]);
  fire.cone(0.32, 0.8, 6, [0, 0.42, 0], '#ff8a2a'); fire.cone(0.18, 0.55, 5, [0.1, 0.4, -0.08], '#ffe070'); fire.cone(0.14, 0.45, 5, [-0.12, 0.3, 0.1], '#ffb040');
  return { body: b.build(), glow: g.build(), fire: fire.build() };
}

/** The Fishmonger's stall (shop-local, door / counter faces +z): plank platform, back wall, a counter with fish on ice, a plain
 *  pale cloth awning, fish hanging from a line, barrels, a crate of fish, nets on the side and a lantern. */
export function buildFishStall(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  b.box(5.0, 0.22, 3.8, [0, 0.11, 0], WOOD_D);
  for (let i = 0; i < 9; i++) b.box(0.52, 0.04, 3.7, [-2.2 + i * 0.55, 0.23, 0], i % 2 ? WOOD : WOOD2);
  b.box(4.7, 2.7, 0.18, [0, 1.55, -1.7], '#9a7a56', [0, 0, 0], [0.86, 1]);
  for (let i = 0; i < 5; i++) b.box(4.72, 0.05, 0.2, [0, 0.6 + i * 0.55, -1.6], '#6e5236');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.24, 3.2, 0.24, [sx * 2.3, 1.6, sz * 1.65 - 0.05], DARK);
  b.box(0.16, 1.4, 3.2, [-2.3, 0.92, 0], '#8a6a48');   // low side wall (left)
  // counter + ice tray with fish
  b.box(4.2, 1.0, 0.8, [0, 0.72, 1.25], WOOD2); b.box(4.4, 0.1, 1.0, [0, 1.25, 1.25], '#a07a50');
  b.box(2.4, 0.12, 0.72, [0.5, 1.36, 1.25], '#dff2fa');
  for (let i = 0; i < 6; i++) fishShape(b, -0.4 + i * 0.36, 1.48, 1.12 + (i % 2) * 0.25, 0.3 + (i % 3) * 0.9, 1.1, ['#b8c8d4', '#ff9a3a', '#9ab84a', '#7fb0d8', '#ffc94a', '#c8d4dc'][i]);
  b.box(0.7, 0.4, 0.5, [-1.5, 1.5, 1.2], '#5a3d24'); b.box(0.5, 0.04, 0.32, [-1.5, 1.72, 1.15], '#e8dcc0', [0.4, 0, 0]);   // scale + slate
  // plain pale cloth awning (slopes down to the front) + valance
  b.box(5.4, 0.1, 4.3, [0, 3.15, 0.25], '#e6ebe8', [0.2, 0, 0]);
  for (let i = 0; i < 6; i++) b.box(0.9, 0.3, 0.06, [-2.25 + i * 0.9, 2.62, 2.36], '#e6ebe8');
  // hanging fish on a line under the awning
  b.box(4.4, 0.03, 0.03, [0, 2.45, 1.65], '#c9b27a');
  for (let i = 0; i < 5; i++) { const x = -1.8 + i * 0.9; b.box(0.02, 0.25, 0.02, [x, 2.3, 1.65], '#c9b27a'); fishShape(b, x, 1.95, 1.65, 0, 1.15, ['#b8c8d4', '#9ab84a', '#ff9a3a', '#7fb0d8', '#c8d4dc'][i], true); }
  // sign board on the awning front: a big blue fish
  b.box(2.2, 0.6, 0.1, [0, 3.45, 2.3], '#7a5634', [0.2, 0, 0]); fishShape(b, 0, 3.45, 2.38, 0, 2.6, '#4fb6d8');
  // barrels, a crate of fish, a net, buckets
  barrel(b, 3.0, 0.4); barrel(b, 3.0, -0.6);
  crate(b, -3.0, 0, 1.0, 0.2, 0.8); for (let i = 0; i < 3; i++) fishShape(b, -3.1 + i * 0.18, 0.86, 0.95 + (i % 2) * 0.15, 1.2 + i, 1, '#b8c8d4');
  b.box(0.04, 1.2, 1.6, [-2.42, 1.9, -0.5], '#4c5e4a', [0, 0, 0.05]); for (let i = 0; i < 3; i++) b.sph(0.07, [-2.45, 2.45, -1.1 + i * 0.6], '#e8553a', 1, 5);
  b.cyl(0.24, 0.2, 0.4, 8, [2.0, 0.45, 1.9], '#7f8a94');
  b.box(0.06, 0.5, 0.06, [-2.0, 2.4, 1.95], '#2a2a2e'); b.box(0.24, 0.05, 0.24, [-2.0, 2.12, 1.95], '#2a2a2e'); b.box(0.24, 0.05, 0.24, [-2.0, 1.84, 1.95], '#2a2a2e');
  g.sph(0.13, [-2.0, 1.98, 1.95], '#ffd070', 1, 6);
  return { body: b.build(), glow: g.build() };
}

// --------------------------------------------------------------- fishing rig ---
const UP = new Vector3(0, 1, 0), _h = new Vector3(), _tip = new Vector3(), _d = new Vector3(), _q = new Quaternion();
const LINE_N = 12;
function FishingRig() {
  const rod = useRef<Group>(null!), bob = useRef<Group>(null!), ring = useRef<Mesh>(null!), bang = useRef<Sprite>(null!);
  const { line, lineMat, ringMat, bangMat, rodGeo, lp } = useMemo(() => {
    const lp = new Float32Array(LINE_N * 3);
    const lg = new BufferGeometry(); lg.setAttribute('position', new BufferAttribute(lp, 3));
    const lineMat = new LineBasicMaterial({ color: new Color('#f4f0e6'), transparent: true, opacity: 0.85 });
    const line = new Line(lg, lineMat); line.frustumCulled = false;
    const r = new GB([0.85, 1.05]);
    r.cyl(0.018, 0.04, 2.6, 5, [0, 1.3, 0], '#8a6440'); r.cyl(0.05, 0.05, 0.5, 6, [0, 0.3, 0], '#3e2a18'); r.cyl(0.07, 0.07, 0.1, 8, [0.06, 0.62, 0], '#9aa2ae', [0, 0, Math.PI / 2]);
    return { line, lineMat, ringMat: new MeshBasicMaterial({ color: new Color('#e8f6ff'), transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }),
      bangMat: (() => { const l = labelMaterial('!', '#ffd24a', { size: 96 }); l.mat.depthTest = false; return l; })(), rodGeo: r.build(), lp };
  }, []);
  const bobGeo = useMemo(() => { const g = new GB([0.9, 1.05]); g.sph(0.13, [0, 0.07, 0], '#e8402e', [1, 0.8, 1], 8); g.sph(0.12, [0, -0.04, 0], '#f4efe6', [1, 0.7, 1], 8); g.cyl(0.015, 0.015, 0.2, 4, [0, 0.2, 0], '#2a2a2e'); return g.build(); }, []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.8 }) }), []);
  const ringGeo = useMemo(() => new RingGeometry(0.3, 0.42, 20).rotateX(-Math.PI / 2), []);
  useEffect(() => () => { line.geometry.dispose(); lineMat.dispose(); ringMat.dispose(); rodGeo.dispose(); bobGeo.dispose(); ringGeo.dispose(); mats.lit.dispose(); }, [line, lineMat, ringMat, rodGeo, bobGeo, ringGeo, mats]);

  useFrame(({ clock }) => {
    const F = world.fishing, on = F.state !== FISH.IDLE && useGameStore.getState().status === GameStatus.MENU;
    if (rod.current) rod.current.visible = on;
    line.visible = on && F.state !== FISH.RESULT;
    if (bob.current) bob.current.visible = on && F.state !== FISH.RESULT && F.state !== FISH.CAST;
    if (ring.current) ring.current.visible = on && (F.state === FISH.WAIT || F.state === FISH.BITE || F.state === FISH.REEL);
    if (bang.current) bang.current.visible = on && F.state === FISH.BITE;
    if (!on) return;
    const p = world.player, f = p.facing, fx = Math.sin(f), fz = Math.cos(f), t = clock.elapsedTime;
    // rod: from the right hand, pitched up; swung back then forward while casting, bending while reeling
    let pitch = 0.62;
    if (F.state === FISH.CAST) { const k = Math.min(1, F.t / F.dur); pitch = k < 0.35 ? 0.62 + (k / 0.35) * 0.95 : 1.57 - ((k - 0.35) / 0.65) * 1.15; }
    else if (F.state === FISH.BITE) pitch = 0.5 + Math.sin(t * 30) * 0.04;
    else if (F.state === FISH.REEL) pitch = 0.75 + Math.sin(t * 9) * 0.08 + (F.flash > 0 ? F.flash * 0.25 : 0);
    else if (F.state === FISH.RESULT) pitch = F.ok ? 1.2 : 0.4;
    _h.set(p.pos.x - fz * 0.32 + fx * 0.3, p.pos.y + 1.0, p.pos.z + fx * 0.32 + fz * 0.3);
    _d.set(fx * Math.cos(pitch), Math.sin(pitch), fz * Math.cos(pitch)).normalize();
    _q.setFromUnitVectors(UP, _d);
    const g = rod.current; g.position.copy(_h); g.quaternion.copy(_q);
    _tip.copy(_h).addScaledVector(_d, 2.6);
    // bobber position: arcs out while casting, floats + bobs, dips on a bite, tugs around while reeling (and comes closer)
    let bx = F.bx, bz = F.bz, by = -0.12 + Math.sin(t * 2.6) * 0.03;
    if (F.state === FISH.CAST) { const k = Math.min(1, F.t / F.dur); bx = _tip.x + (F.bx - _tip.x) * k; bz = _tip.z + (F.bz - _tip.z) * k; by = _tip.y + (-0.12 - _tip.y) * k + Math.sin(k * Math.PI) * 1.6; }
    else if (F.state === FISH.BITE) { by = -0.3 + Math.sin(t * 24) * 0.07; bx += Math.sin(t * 17) * 0.06; }
    else if (F.state === FISH.REEL) {
      const pull = F.need > 0 ? F.hits / F.need : 0;
      bx = F.bx + (p.pos.x - F.bx) * pull * 0.45 + Math.sin(t * 7.3) * 0.35; bz = F.bz + (p.pos.z - F.bz) * pull * 0.45 + Math.cos(t * 5.9) * 0.35; by = -0.2 + Math.sin(t * 13) * 0.06;
    }
    if (bob.current) bob.current.position.set(bx, by, bz);
    if (ring.current) { const k = (t * (F.state === FISH.WAIT ? 0.7 : 1.8)) % 1; ring.current.position.set(bx, -0.12, bz); ring.current.scale.setScalar(0.6 + k * (F.state === FISH.WAIT ? 2.2 : 3.4)); ringMat.opacity = (1 - k) * (F.state === FISH.WAIT ? 0.35 : 0.7); }
    if (bang.current) { bang.current.position.set(bx, 1.4 + Math.abs(Math.sin(t * 8)) * 0.25, bz); const s = 0.9 + Math.sin(t * 16) * 0.08; bang.current.scale.set(bangMat.aspect * s, s, 1); }
    // fishing line: tip -> bobber with a little sag (taut while reeling)
    const sag = F.state === FISH.REEL || F.state === FISH.BITE ? 0.15 : 0.8;
    for (let i = 0; i < LINE_N; i++) {
      const k = i / (LINE_N - 1);
      lp[i * 3] = _tip.x + (bx - _tip.x) * k; lp[i * 3 + 1] = _tip.y + (by + 0.18 - _tip.y) * k - Math.sin(k * Math.PI) * sag * (F.state === FISH.CAST ? 0 : 1); lp[i * 3 + 2] = _tip.z + (bz - _tip.z) * k;
    }
    (line.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });
  return (
    <>
      <group ref={rod} visible={false}><mesh geometry={rodGeo} material={mats.lit} castShadow /></group>
      <primitive object={line} />
      <group ref={bob} visible={false}><mesh geometry={bobGeo} material={mats.lit} /></group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} visible={false} renderOrder={2} />
      <sprite ref={bang} material={bangMat.mat} visible={false} renderOrder={6} />
    </>
  );
}

// --------------------------------------------------------------------- beach ---
export function Beach({ q }: { q: QualityCfg }) {
  const geo = useMemo(() => buildBeach(), []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) }) }), []);
  useEffect(() => () => { geo.body.dispose(); geo.glow.dispose(); geo.fire.dispose(); mats.lit.dispose(); mats.glow.dispose(); }, [geo, mats]);
  const flame = useRef<Mesh>(null!);
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime, p = world.player.pos;
    if (flame.current) { flame.current.scale.set(1 + Math.sin(t * 13) * 0.06, 1 + Math.sin(t * 9.3) * 0.12 + Math.sin(t * 21) * 0.05, 1 + Math.cos(t * 11) * 0.06); }
    // campfire embers + smoke only while the hero is around (and not paused)
    if ((p.x - CAMPFIRE.x) ** 2 + (p.z - CAMPFIRE.z) ** 2 < 45 * 45 && useGameStore.getState().status === GameStatus.MENU) {
      if (Math.random() < dt * 5) embers(CAMPFIRE.x, 0.6, CAMPFIRE.z, 1, 0xff8a2a, 0.25, 2.0, 0.9, 0.12);
      if (Math.random() < dt * 1.6) smokePuff(CAMPFIRE.x, 1.3, CAMPFIRE.z, 1, 0x8a8580, 1.0, 2.4, 1.1, 0.25, 0.35);
    }
  });
  const shadows = q.shadowMap > 0;
  return (
    <group>
      <mesh geometry={geo.body} material={mats.lit} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={geo.glow} material={mats.glow} />
      <mesh ref={flame} geometry={geo.fire} material={mats.glow} position={[CAMPFIRE.x, 0, CAMPFIRE.z]} />
      <FishingRig />
    </group>
  );
}
