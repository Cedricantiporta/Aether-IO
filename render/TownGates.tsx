// The story gates' blockers (engine/townGates.ts): a flooded-road barricade, a cave-in, a fallen tree and thorny brambles, drawn as
// ONE merged, static, vertex-coloured mesh each (toy-like, soft, bright). Closed gates just stand there (no per-frame work); when the
// story opens one it plays a quick removal (shake, then sink + shrink with a puff of dust / leaves / stone chips) and is hidden.
// Colliders + prompts + the unlock announcement live in engine/systems/townGatesLogic.ts / village.ts. Open gates are never drawn.
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, type Group } from 'three';
import { useGameStore } from '../store';
import { TOWN_GATES, gateOpenAt, type GateDef } from '../engine/townGates';
import { gatePlay } from '../engine/systems/townGatesLogic';
import { world } from '../engine/world';
import { GB, litMat, mulberry32 } from './util';
import { groundY } from './terrainFn';
import { dustPuff, smokePuff, chunks } from './fx';

const WOOD = '#b9824a', WOOD2 = '#8a5a34', CREAM = '#fff1d0', RED = '#e8574f', BLUE = '#6fc4ee', SAND = '#e0c68c', STONE = '#a9aab4', STONE2 = '#8f909c', G1 = '#58b25a', G2 = '#6cc86a', G3 = '#3f8f4a', PINK = '#ff8fb8', YEL = '#ffd24a';
type V3 = [number, number, number];
const REMOVE_S = 1.1;

/** Board + post at local (cx, cz) facing local yaw `ly`; `deco` adds the picture in board space (ox right, oy up, oz out of the board). */
function sign(b: GB, cx: number, cz: number, ly: number, deco: (p: (ox: number, oy: number, w: number, h: number, col: string) => void) => void): void {
  const c = Math.cos(ly), s = Math.sin(ly), y0 = 1.62;
  const at = (ox: number, oz: number): [number, number] => [cx + ox * c + oz * s, cz - ox * s + oz * c];
  b.box(0.13, 1.7, 0.13, [cx, 0.85, cz], WOOD2);
  const [bx, bz] = at(0, 0.02);
  b.box(1.25, 0.86, 0.1, [bx, y0, bz], WOOD, [0, ly, 0]);
  for (const [ox, oy, w, h] of [[0, 0.4, 1.3, 0.09], [0, -0.4, 1.3, 0.09], [-0.6, 0, 0.09, 0.9], [0.6, 0, 0.09, 0.9]] as const) { const [px, pz] = at(ox, 0.07); b.box(w, h, 0.07, [px, y0 + oy, pz], RED, [0, ly, 0]); }
  const [fx, fz] = at(0, 0.1);
  b.box(1.04, 0.64, 0.05, [fx, y0, fz], CREAM, [0, ly, 0]);
  // picture: parts are boxes (w x h) placed in board space
  deco((ox, oy, w, h, col) => { const [px, pz] = at(ox, 0.15); b.box(w, h, 0.05, [px, y0 + oy, pz], col, [0, ly, 0]); });
}

function barricade(L: number, ly: number): BufferGeometry {
  const b = new GB([0.82, 1.08]), fz = Math.cos(ly);   // fz: +1 when the sign faces local +z
  const n = Math.max(2, Math.round(L / 2.4)) + 1;
  for (let i = 0; i < n; i++) {   // sawhorse A-frames along the line
    const px = -L / 2 + 0.35 + ((L - 0.7) * i) / (n - 1);
    b.box(0.17, 1.3, 0.17, [px, 0.62, 0.24], WOOD2, [-0.28, 0, 0]); b.box(0.17, 1.3, 0.17, [px, 0.62, -0.24], WOOD2, [0.28, 0, 0]);
    b.sph(0.17, [px, 1.42, 0], '#ffb347', [1, 1, 1], 8);   // a small amber lamp on every post
  }
  const m = Math.ceil(L / 0.62);
  for (const y of [0.56, 1.0]) for (let k = 0; k < m; k++) b.box(L / m + 0.01, 0.24, 0.08, [-L / 2 + (L * (k + 0.5)) / m, y, 0], (k + (y > 0.8 ? 1 : 0)) % 2 ? CREAM : RED);
  for (const e of [-1, 1]) for (const [dx, dy, dz, s] of [[0, 0.28, 0, 1], [0.7, 0.26, 0.2, 0.9], [-0.7, 0.26, -0.2, 0.9], [0.1, 0.62, 0.05, 0.8]] as const) b.sph(0.46 * s, [e * (L / 2 + 0.55) + dx * e, dy, dz], SAND, [1.15, 0.62, 0.78], 8);   // sandbags
  for (const [px, pz, s] of [[-1.6, -fz * 1.7, 1], [0.4, -fz * 2.1, 1.25], [2.0, -fz * 1.6, 0.9]] as const) b.cyl(1.2 * s, 1.2 * s, 0.05, 14, [px, 0.04, pz], BLUE, [0, 0, 0], [1, 1, 0.62]);   // the flood
  { const dx = 0.4, dz = -fz * 2.1;   // a little yellow duck bobbing on the flood
    b.sph(0.3, [dx, 0.3, dz], YEL, [1.1, 0.8, 0.9], 8); b.sph(0.19, [dx + 0.2, 0.62, dz], YEL, 1, 8); b.cone(0.07, 0.2, 6, [dx + 0.42, 0.6, dz], '#ff9a3c', [0, 0, -Math.PI / 2]); }
  sign(b, -L / 2 + 0.2, fz * 1.5, ly, (p) => { p(-0.18, -0.02, 0.32, 0.07, BLUE); p(0.18, -0.02, 0.32, 0.07, BLUE); p(0, 0.17, 0.5, 0.07, BLUE); p(0, -0.2, 0.7, 0.05, '#9ad8f6'); });
  return b.build();
}

function fallenTree(L: number, ly: number): BufferGeometry {
  const b = new GB([0.8, 1.1]), rnd = mulberry32(31), fz = Math.cos(ly), R90 = Math.PI / 2;
  b.cyl(0.98, 0.78, L - 1.0, 12, [0.1, 0.9, 0.05], '#a8723f', [0, 0, R90]);                       // the trunk (thicker at the root end, -x)
  b.cyl(0.9, 0.9, 0.18, 12, [-L / 2 + 0.25, 0.9, 0.05], '#d9b27a', [0, 0, R90]); b.cyl(0.55, 0.55, 0.2, 10, [-L / 2 + 0.25, 0.9, 0.05], '#c9984e', [0, 0, R90]);   // (the torn root end: pale rings)
  b.sph(0.66, [-1.2, 1.7, 0.1], G1, [2.2, 0.28, 0.9], 8); b.sph(0.5, [1.8, 1.55, -0.1], G2, [1.7, 0.25, 0.8], 8);      // moss
  { const x = -L / 2 - 0.15;   // the root ball: an upturned disc of earth, stones and roots
    b.cyl(1.75, 1.65, 0.55, 14, [x, 1.65, 0], '#6a4a2c', [0, 0, R90]); b.sph(2.0, [x - 0.1, 0.35, 0], '#7a5834', [1.0, 0.32, 1.05], 8);
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = 0.4 + rnd() * 1.1; b.ico(0.26 + rnd() * 0.12, [x - 0.3, 1.65 + Math.sin(a) * r, Math.cos(a) * r], STONE, 1, 0); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28 + 0.3, r = 1.45; b.cyl(0.07, 0.17, 1.3, 5, [x - 0.65, 1.65 + Math.sin(a) * r * 0.95, Math.cos(a) * r * 0.95], WOOD2, [Math.cos(a) * 0.5, 0, R90 + Math.sin(a) * 0.5]); } }
  for (const [x, y, z, r, c] of [[L / 2 - 1.5, 1.6, 0.45, 1.55, G1], [L / 2 - 0.1, 1.15, -0.7, 1.3, G2], [L / 2 - 2.8, 1.2, -0.75, 1.15, G3], [L / 2 + 0.35, 0.95, 0.95, 1.0, G3], [L / 2 - 1.2, 2.25, -0.15, 0.95, G2]] as const) b.ico(r, [x, y, z], c, [1, 0.88, 1], 1);   // the leafy crown
  b.cyl(0.1, 0.17, 1.8, 5, [L / 2 - 2.0, 1.3, 1.0], WOOD2, [0.7, 0, 0.2]); b.cyl(0.1, 0.17, 1.6, 5, [L / 2 - 3.4, 1.35, -1.05], WOOD2, [-0.7, 0, -0.15]);
  for (const [x, sg] of [[-1.6, 1], [-0.3, -1]] as const) { b.cyl(0.07, 0.09, 0.22, 6, [x, 1.5, sg * 0.9], CREAM, [sg * 0.35, 0, 0]); b.sph(0.2, [x, 1.66, sg * 0.94], RED, [1, 0.6, 1], 8); }   // mushrooms on the trunk
  sign(b, 2.2, fz * 1.9, ly, (p) => { p(-0.05, 0, 0.08, 0.5, WOOD2); p(0.1, 0.13, 0.3, 0.18, STONE2); });   // (an axe)
  return b.build();
}

function rubble(L: number, ly: number): BufferGeometry {
  const b = new GB([0.78, 1.1]), rnd = mulberry32(57);
  b.sph(L / 2 + 0.7, [0, 0.03, 0.3], '#d8c49a', [1.0, 0.05, 0.62], 10);   // dusty ground
  const rocks: [number, number, number, number, string][] = [[-1.5, 0.5, 0.2, 0.95, STONE], [-0.3, 0.55, 0.1, 1.1, STONE2], [1.2, 0.5, 0.15, 1.0, STONE], [0.5, 1.3, 0.0, 0.85, STONE2], [-0.9, 1.25, -0.1, 0.8, STONE], [1.9, 0.32, 0.5, 0.55, STONE2], [-2.0, 0.3, 0.7, 0.5, STONE], [0.2, 0.3, 0.9, 0.62, STONE2], [-0.6, 0.28, 0.95, 0.46, STONE]];
  for (const [x, y, z, r, c] of rocks) b.dodeca(r, [x, y, z], c, [1.15, 0.85, 1.05], [rnd() * 2, rnd() * 6, rnd() * 2]);
  b.box(0.26, 0.26, 3.1, [-1.5, 1.0, 0.2], WOOD, [0.2, 0.5, 0.3]); b.box(0.26, 0.26, 2.7, [1.2, 0.95, 0.3], WOOD2, [-0.25, -0.6, -0.3]);   // broken timber props
  b.cyl(0.05, 0.05, 1.3, 5, [0.1, 1.35, 1.0], WOOD2, [0.9, 0.2, 0.5]); b.box(0.72, 0.1, 0.12, [-0.18, 1.82, 1.38], '#6c6f7a', [0.0, 0.2, 0.5]);   // a pickaxe stuck in the pile
  for (const [x, z, c] of [[-1.1, 1.3, '#7ae0ff'], [1.4, 1.1, '#ff9ad0'], [0.5, 1.7, '#9aa8ff']] as const) b.octa(0.26, [x, 0.34, z], c, [0.7, 1.4, 0.7], [0, rnd() * 3, 0.2]);   // a few crystal glints
  const fz = Math.cos(ly);
  sign(b, 2.6, fz * 1.9 + 0.2, ly, (p) => { p(0, 0, 0.55, 0.1, RED); p(0, 0, 0.1, 0.55, RED); });   // a red cross
  return b.build();
}

function brambles(L: number, ly: number): BufferGeometry {
  const b = new GB([0.74, 1.1]), rnd = mulberry32(88), fz = Math.cos(ly);
  const n = Math.ceil(L / 1.25) + 1;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (L * i) / (n - 1), z = (rnd() - 0.5) * 0.7, r = 0.9 + rnd() * 0.35;
    b.ico(r * 1.15, [x, 0.75 + rnd() * 0.15, z], i % 2 ? '#52b058' : '#44a04e', [1, 1, 1.05], 1);
    b.ico(r * 0.85, [x + (rnd() - 0.5) * 0.8, 1.6 + rnd() * 0.25, z + (rnd() - 0.5) * 0.5], i % 2 ? '#62c264' : '#52b058', 1, 1);
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28; b.cone(0.07, 0.34, 5, [x + Math.cos(a) * r * 0.85, 0.7 + rnd() * 0.9, z + Math.sin(a) * r * 0.85], '#f3e6c2', [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0]); }   // thorns
    for (let k = 0; k < 2; k++) b.sph(0.22, [x + (rnd() - 0.5) * 1.2, 1.9 + rnd() * 0.4, z + (rnd() - 0.5) * 0.8], rnd() < 0.6 ? PINK : '#ffffff', 1, 7);   // blossoms
  }
  for (let i = 0; i < n - 1; i++) b.torus(0.7, 0.09, [-L / 2 + (L * (i + 0.5)) / (n - 1), 1.35, 0.2 * (i % 2 ? 1 : -1)], '#8b4fa0', [0, 0, 0], 1, 10, Math.PI);   // purple vines arching between the clumps
  sign(b, L / 2 + 0.2, fz * 1.5, ly, (p) => { p(0, 0.14, 0.12, 0.3, RED); p(0, -0.12, 0.12, 0.12, RED); p(-0.3, -0.12, 0.16, 0.16, G2); p(0.3, -0.12, 0.16, 0.16, PINK); });   // "!" + a thorny sprig
  return b.build();
}
const BUILD: Record<GateDef['kind'], (L: number, ly: number) => BufferGeometry> = { barricade, tree: fallenTree, rubble, bramble: brambles, guard: closedDoors };   // (guard: the side gate's closed oak doors; the guard NPC stands beside them)

/** (owner) the East Gate while its guard holds it: two closed oak doors filling the side-gate arch (span = the passage, local x). */
function closedDoors(L: number): BufferGeometry {
  const b = new GB([0.85, 1.05]), H = 4.0, IRON = '#34343a';
  for (const sx of [-1, 1]) {
    const cx = sx * L / 4;
    b.box(L / 2 - 0.04, H, 0.22, [cx, H / 2, 0], '#7a5230');
    for (let q = 0; q < 4; q++) b.box(0.07, H, 0.26, [cx - L / 4 + 0.25 + q * (L / 2 - 0.5) / 3, H / 2, 0], '#5c3c20');
    for (const y of [0.5, 1.6, 2.8]) b.box(L / 2 - 0.1, 0.16, 0.28, [cx, y, 0], IRON);
    b.sph(0.11, [sx * 0.3, 1.5, 0.16], '#c9a44a', 1, 6); b.sph(0.11, [sx * 0.3, 1.5, -0.16], '#c9a44a', 1, 6);   // ring handles
  }
  b.box(0.12, H, 0.3, [0, H / 2, 0], '#4a3018');   // the seam
  return b.build();
}

interface Place { cx: number; cz: number; y0: number; L: number; ry: number }
function placeOf(g: GateDef): Place {
  const [x1, z1, x2, z2] = g.span, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, L = Math.hypot(x2 - x1, z2 - z1);
  return { cx, cz, L, ry: Math.atan2(-(z2 - z1), x2 - x1), y0: groundY(cx, cz) };
}

export function TownGates() {
  const mask = useGameStore((s) => TOWN_GATES.reduce((m, g, i) => (gateOpenAt(g, s.story.step, s.heroRank) ? m : m | (1 << i)), 0));   // closed gates (changes only when a gate opens / closes)
  const mat = useMemo(() => litMat({ roughness: 0.85 }), []);
  const geos = useMemo(() => TOWN_GATES.map((g) => { const p = placeOf(g); return BUILD[g.kind](p.L, g.yaw - p.ry); }), []);
  const places = useMemo(() => TOWN_GATES.map(placeOf), []);
  const outer = useRef<(Group | null)[]>([]), inner = useRef<(Group | null)[]>([]), t = useRef<number[]>(TOWN_GATES.map(() => -1));
  useLayoutEffect(() => {   // before paint: closed gates stand, open ones are gone (or start their removal when the story just opened them)
    TOWN_GATES.forEach((g, i) => {
      const o = outer.current[i], n = inner.current[i]; if (!o || !n) return;
      const closed = !!(mask & (1 << i));
      if (closed) { t.current[i] = -1; o.visible = true; n.position.y = 0; n.scale.set(1, 1, 1); n.rotation.z = 0; return; }
      if (gatePlay.has(g.id)) {
        gatePlay.delete(g.id);
        const p = places[i], d = Math.hypot(world.player.pos.x - p.cx, world.player.pos.z - p.cz);
        if (d < 70 && o.visible !== false && t.current[i] < 0) { t.current[i] = 0; o.visible = true; puff(g, p); return; }
      }
      if (t.current[i] < 0) o.visible = false;
    });
  }, [mask, places]);
  useFrame((_, dt) => {
    for (let i = 0; i < TOWN_GATES.length; i++) {
      const ti = t.current[i]; if (ti < 0) continue;
      const k = Math.min(1, ti + Math.min(dt, 0.05) / REMOVE_S), e = k * k * (3 - 2 * k), n = inner.current[i]!;
      t.current[i] = k;
      n.position.y = -1.1 * e; n.scale.set(1 - 0.15 * e, 1 - e * 0.95, 1 - 0.15 * e); n.rotation.z = Math.sin(k * 38) * 0.025 * (1 - k);
      if (k >= 1) { t.current[i] = -1; outer.current[i]!.visible = false; }
    }
  });
  return (<>
    {TOWN_GATES.map((g, i) => (
      <group key={g.id} ref={(o) => { outer.current[i] = o; }} position={[places[i].cx, places[i].y0, places[i].cz]} rotation={[0, places[i].ry, 0]} visible={!!(mask & (1 << i))}>
        <group ref={(o) => { inner.current[i] = o; }}>
          <mesh geometry={geos[i]} material={mat} castShadow receiveShadow />
        </group>
      </group>
    ))}
  </>);
}

/** The removal's puffs: dust along the blocker, leaves / stone chips on top. */
function puff(g: GateDef, p: Place): void {
  const [x1, z1, x2, z2] = g.span, y = p.y0;
  const col = g.kind === 'bramble' || g.kind === 'tree' ? 0x9fd88a : g.kind === 'rubble' ? 0xcbbfa6 : 0xcfe9f4;
  for (let i = 0; i <= 4; i++) { const f = i / 4, x = x1 + (x2 - x1) * f, z = z1 + (z2 - z1) * f; dustPuff(x, z, 3, 1.1, col, 1.8); smokePuff(x, y + 0.8, z, 2, 0xe9e2d0, 1.4, 1.0, 1.4, 1.0, 0.45); }
  if (g.kind === 'rubble') chunks(p.cx, y + 1.0, p.cz, 22, 0xa9aab4, 0x8f909c, 5, 0.3);
  else if (g.kind === 'tree' || g.kind === 'bramble') chunks(p.cx, y + 1.2, p.cz, 26, 0x58b25a, 0x6cc86a, 4.5, 0.26);
  else chunks(p.cx, y + 0.8, p.cz, 16, 0xb9824a, 0xfff1d0, 4.5, 0.26);
}
