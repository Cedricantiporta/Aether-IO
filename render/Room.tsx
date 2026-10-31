// The run room: biome-tinted ground disc, walls ring (via Props: the same instanced scenery path as the town), the room's
// single station (fountain / merchant / chest / altar), exit portals with reward labels and telegraphed spawn markers.
// Only the current room exists; it is rebuilt when world.room.version changes (during the black fade). No per-frame allocations.
import { canTrainSkill } from '../ui/lib/alerts';
import { campPos } from '../engine/systems/director';
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useCharacterInstance, useClips } from './characters';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, AnimationMixer, CircleGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
  CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, RingGeometry, SphereGeometry, SRGBColorSpace,
  ShaderMaterial, Shape, ShapeGeometry, TorusGeometry, type BufferGeometry,
  Matrix4, Quaternion, Euler, Vector3, type DataTexture,
} from 'three';
import { FX, CELL } from './fx';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { Stars } from '@react-three/drei';
import { runInfo } from '../engine/runMods';
import { showcase } from '../engine/showcase';
import { Coins, Diamond, Droplets, Flame, Gem, Heart, Package, Skull, Sparkles, Store, Sword } from '../ui/components/GoldIcons';
import { world } from '../engine/world';
import { shape, shapeLimit, outlineU } from '../engine/roomShape';
import { halls, hallsSdf, hallsBridge } from '../engine/roomHalls';
import { HallsBorder } from './HallsBorder';
import { HallsMarble } from './HallsMarble';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { BIOMES, biomeOf, portalLabel, variantOf, type GroundStyle } from '../engine/roomDefs';
import { feat, inLiquid, onBridge, riverD, hwAt, riverS } from '../engine/roomFeatures';
import { navClear, navFlowGoal, navGuide } from '../engine/roomNav';
import { HallsBridges } from './HallsBridges';
import { RoomWater, LavaSea } from './RoomWater';
import { bakeGridShore, setSeaShore } from './waterFx';
import { Wanderer } from './Wanderer';
import { AllyActor } from './Ally';
import { Finale } from './Finale';
import { GB, commitInst, fbm, litMat, mulberry32, vnoise } from './util';
import { thinArrowGeo } from './arrowGeo';
import { useWorldCounter } from './hooks';
import { Props } from './Props';
import { applyPathShader, applyLavaShader, applyIceShader, lavaTime, pathMask, roomTrail, lavaLive, refreshPathMask } from './groundPath';
import { lava, lavaAt } from '../engine/lavaFloor';
import { ice, iceAt } from '../engine/iceFloor';
import { labelMaterial } from './label';
import type { QualityCfg } from './quality';
import { SpecialRooms } from './SpecialRooms';
import { CampGround, CampPieces, CampShards } from './CampPath';
import { camp, campOn } from '../engine/campPaths';

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new Color(), _c2 = new Color(), _c3 = new Color(), _c4 = new Color();

// ------------------------------------------------------------------ ground ---
/** Border band / kerb stone tone per ground style (light paved band just inside the walls). */
const RIM_TONE: Record<GroundStyle, string> = { GRASS: '#d8d0b4', MARBLE: '#e4d8bc', SAND: '#ecd09a', SNOW: '#ffffff', BASALT: '#6a5648', VOID: '#9a86d8' };
const KERB_TONES: Record<GroundStyle, string[]> = {
  GRASS: ['#cfc8b0', '#c2baa0', '#d8d2bc'], MARBLE: ['#e8dcc0', '#dccfb2', '#efe4cc'], SAND: ['#e6c98c', '#d9b87a', '#efd6a0'],
  SNOW: ['#f4f8fd', '#e4eefa', '#ffffff'], BASALT: ['#4e3e36', '#5a483e', '#46362f'], VOID: ['#6a58b0', '#7a66c4', '#5c4a9e'],
};
/** A low rounded kerb round the arena outline (owner: tidy border like the town's): one merged mesh of short stone blocks, gaps where liquid crosses. */
function buildKerb(style: GroundStyle, seed: number, hasLiquid: boolean): BufferGeometry {
  const r = new GB([1, 1]), tones = KERB_TONES[style];
  const nSeg = 150; let k = 0;
  let px = 0, pz = 0, havePrev = false;
  for (let i = 0; i <= nSeg; i++) {
    const a = (i / nSeg) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), rad = shapeLimit(dx, dz) - 1.35, x = dx * rad, z = dz * rad;
    if (havePrev) {
      const mx = (x + px) / 2, mz = (z + pz) / 2, len = Math.hypot(x - px, z - pz), yaw = -Math.atan2(z - pz, x - px);
      if (!(hasLiquid && inLiquid(mx, mz, 1.2))) {
        const c = tones[k++ % tones.length];
        r.box(len + 0.03, 0.2, 0.55, [mx, 0.1, mz], c, [0, yaw, 0], [0.88, 1.06]);
        r.box(len - 0.05, 0.05, 0.4, [mx, 0.21, mz], tones[(k + 1) % tones.length], [0, yaw, 0], [1.02, 1.1]);   // (a lighter rounded top)
      }
    }
    px = x; pz = z; havePrev = true;
  }
  return r.build();
}
/** Tileable painted-floor textures per ground style (built once each): [albedo multiplier, emissive glow or null].
 *  Zelda-style (owner 2026-10-22): soft, rounded, toy-like details (tuft marks, bevelled tiles, ripples, snow drifts, glowing seams)
 *  baked into one 512px canvas; the vertex colours supply the big colour zones. */
const detailTex: Partial<Record<string, [CanvasTexture, CanvasTexture | null]>> = {};
const h2 = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export function groundDetail(style: GroundStyle, beach = false): [CanvasTexture, CanvasTexture | null] {
  const key = beach ? style + 'B' : style, hit = detailTex[key]; if (hit) return hit;
  const N = 512, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const c = mk(), g = c.getContext('2d')!;
  const rnd = mulberry32(0xd37a1 + style.length * 977 + style.charCodeAt(0) * 131);
  let glowC: HTMLCanvasElement | null = null;
  /** Draw f at every wrapped copy of (x, y) that can touch the tile (seamless). */
  const wrap = (x: number, y: number, r: number, f: (px: number, py: number) => void) => {
    for (const ox of [-N, 0, N]) { if (x + ox < -r || x + ox > N + r) continue; for (const oy of [-N, 0, N]) { if (y + oy < -r || y + oy > N + r) continue; f(x + ox, y + oy); } }
  };
  const blobs = (ctx: CanvasRenderingContext2D, n: number, r0: number, r1: number, rgb: string, a0: number, a1: number) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * N, y = rnd() * N, r = r0 + rnd() * (r1 - r0), a = a0 + rnd() * (a1 - a0);
      wrap(x, y, r, (px, py) => { const gr = ctx.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = gr; ctx.fillRect(px - r, py - r, r * 2, r * 2); });
    }
  };
  const speck = (n: number, a: number, b: number, light: number, size = 2.5) => { for (let i = 0; i < n; i++) { const v = a + rnd() * (b - a); g.fillStyle = rnd() < light ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`; const s = 1 + rnd() * size; g.fillRect(rnd() * N, rnd() * N, s, s); } };
  /** Per-pixel painter: f writes albedo rgb (0..255) into o[0..2] and optionally glow rgb into o[3..5]. */
  const paint = (withGlow: boolean, f: (px: number, py: number, o: number[]) => void) => {
    const img = g.createImageData(N, N), d = img.data, o = [0, 0, 0, 0, 0, 0];
    let gimg: ImageData | null = null, gd: Uint8ClampedArray | null = null;
    if (withGlow) { glowC = mk(); gimg = glowC.getContext('2d')!.createImageData(N, N); gd = gimg.data; }
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      o[3] = o[4] = o[5] = 0; f(px, py, o);
      const i = (py * N + px) * 4; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
      if (gd) { gd[i] = o[3]; gd[i + 1] = o[4]; gd[i + 2] = o[5]; gd[i + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    if (gimg) glowC!.getContext('2d')!.putImageData(gimg, 0, 0);
  };
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** Rounded-square tiles: edge distance (px, >0 inside) + tile ids. */
  const tileAt = (px: number, py: number, n: number, rad: number) => {
    const ts = N / n, tx = Math.floor(px / ts), ty = Math.floor(py / ts), lx = px - tx * ts - ts / 2, ly = py - ty * ts - ts / 2;
    const qx = Math.abs(lx) - (ts / 2 - rad), qy = Math.abs(ly) - (ts / 2 - rad);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
    return { e: -sd, tx, ty, lx, ly, ts };
  };
  /** Jittered Voronoi (G x G seeds, wraps): per pixel nearest id, second id and border distance. */
  const voro = (G: number, jit: number) => {
    const cs = N / G, sx = new Float32Array(G * G), sy = new Float32Array(G * G);
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) { sx[gy * G + gx] = (gx + 0.5 + (rnd() - 0.5) * jit) * cs; sy[gy * G + gx] = (gy + 0.5 + (rnd() - 0.5) * jit) * cs; }
    const E = new Float32Array(N * N), A = new Uint8Array(N * N), B = new Uint8Array(N * N), H = N / 2;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const cx = Math.floor(px / cs), cy = Math.floor(py / cs); let d1 = 1e9, d2 = 1e9, i1 = 0, i2 = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = (cx + ox + G) % G, gy = (cy + oy + G) % G, id = gy * G + gx;
        let dx = Math.abs(px - sx[id]), dy = Math.abs(py - sy[id]); if (dx > H) dx = N - dx; if (dy > H) dy = N - dy;
        const dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; i2 = i1; d1 = dd; i1 = id; } else if (dd < d2) { d2 = dd; i2 = id; }
      }
      const k = py * N + px; E[k] = Math.sqrt(d2) - Math.sqrt(d1); A[k] = i1; B[k] = i2;
    }
    return { E, A, B };
  };
  switch (style) {
    case 'MARBLE': {   // castle flagstones: big soft-cornered cream / grey-cream tiles, light grout, bevelled edges, faint veins
      paint(false, (px, py, o) => {
        const t = tileAt(px, py, 4, 16), tone = 0.9 + h2(t.tx, t.ty) * 0.1, warm = h2(t.ty + 7, t.tx + 3) < 0.5 ? 0 : 1;
        const sm = smooth(1.5, 6, t.e), bev = 1 - 0.1 * (1 - smooth(4, 26, t.e)) + (t.lx + t.ly < -t.ts * 0.5 + 8 ? 0.03 : 0) * smooth(2, 8, t.e) - (t.lx + t.ly > t.ts * 0.5 - 8 ? 0.05 : 0) * smooth(2, 8, t.e);
        const r = 246 * tone + warm * 4, gg = 238 * tone + warm * 1, b = 222 * tone - warm * 6;
        o[0] = 176 + (r * bev - 176) * sm; o[1] = 168 + (gg * bev - 168) * sm; o[2] = 152 + (b * bev - 152) * sm;
      });
      g.lineCap = 'round';
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(110,100,86,${0.05 + rnd() * 0.05})`; g.lineWidth = 1 + rnd() * 2; wrap(rnd() * N, rnd() * N, 90, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + (rnd() - 0.5) * 80, py + (rnd() - 0.5) * 80, px + (rnd() - 0.5) * 110, py + (rnd() - 0.5) * 110); g.stroke(); }); }
      blobs(g, 26, 40, 90, '120,105,85', 0.04, 0.08); speck(900, 0.03, 0.07, 0.5);
      break;
    }
    case 'SAND': if (beach) {   // beach (owner mock): warm golden sand, soft darker painted patches, small orange pebbles, a few tiny green sprouts
      g.fillStyle = '#f6f0e4'; g.fillRect(0, 0, N, N);
      blobs(g, 26, 40, 90, '255,248,225', 0.22, 0.38);
      // (owner 2026-10-24: no pebble / sprout dots on the beach - plain soft sand)
      break;
    } else {   // warm sand: soft wind-ripple bands (lit crest + shaded trough), tiny pebbles, grain
      g.fillStyle = '#ecebe8'; g.fillRect(0, 0, N, N);
      blobs(g, 30, 50, 110, '150,100,40', 0.04, 0.08); blobs(g, 30, 50, 110, '255,255,255', 0.1, 0.2);
      g.lineCap = 'round';
      for (let b = 0; b < 8; b++) {
        const y0 = b * 64 + 12 + rnd() * 30, ph = rnd() * 6.28, amp = 7 + rnd() * 9, k = 2 + (b % 2);
        for (const [dy, col, w] of [[0, 'rgba(150,100,45,0.17)', 7], [5, 'rgba(255,255,255,0.45)', 3.2]] as [number, string, number][]) {
          g.strokeStyle = col; g.lineWidth = w; g.beginPath();
          for (let x = 0; x <= N; x += 8) { const y = y0 + dy + Math.sin((x / N) * Math.PI * 2 * k + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
      }
      for (let i = 0; i < 26; i++) { const x = rnd() * N, y = rnd() * N, r = 1.4 + rnd() * 2.4; wrap(x, y, 6, (px, py) => { g.fillStyle = 'rgba(120,85,45,0.2)'; g.beginPath(); g.ellipse(px + 1, py + 1.2, r * 1.2, r * 0.8, 0.3, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(px, py, r, r * 0.7, 0.3, 0, 6.3); g.fill(); }); }
      speck(3500, 0.04, 0.1, 0.45);
      break;
    }
    case 'SNOW': {   // soft snow: bluish drift shading, curved drift marks, glints (emissive sparkles)
      g.fillStyle = '#e9eef6'; g.fillRect(0, 0, N, N);
      blobs(g, 44, 40, 100, '100,145,210', 0.1, 0.2); blobs(g, 44, 40, 100, '255,255,255', 0.2, 0.35);
      g.lineCap = 'round';
      for (let i = 0; i < 46; i++) { const l = 22 + rnd() * 40, a = (rnd() - 0.5) * 0.5; wrap(rnd() * N, rnd() * N, l, (px, py) => { g.strokeStyle = 'rgba(100,140,205,0.34)'; g.lineWidth = 4; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + l / 2, py - 7 + a * 20, px + l, py + a * 20); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py - 3); g.quadraticCurveTo(px + l / 2, py - 10 + a * 20, px + l, py - 3 + a * 20); g.stroke(); }); }
      speck(1400, 0.02, 0.06, 0.4);
      glowC = mk(); const gg = glowC.getContext('2d')!; gg.fillStyle = '#000'; gg.fillRect(0, 0, N, N);
      for (let i = 0; i < 34; i++) { const s = 2.2 + rnd() * 2.6, a = 0.55 + rnd() * 0.45; wrap(rnd() * N, rnd() * N, 8, (px, py) => { gg.fillStyle = `rgba(210,235,255,${a})`; gg.beginPath(); gg.moveTo(px, py - s * 1.6); gg.lineTo(px + s * 0.35, py - s * 0.35); gg.lineTo(px + s * 1.6, py); gg.lineTo(px + s * 0.35, py + s * 0.35); gg.lineTo(px, py + s * 1.6); gg.lineTo(px - s * 0.35, py + s * 0.35); gg.lineTo(px - s * 1.6, py); gg.lineTo(px - s * 0.35, py - s * 0.35); gg.closePath(); gg.fill(); }); }
      break;
    }
    case 'BASALT': {   // dark basalt slabs: soft rounded polygons, deep grout, thin warm cracks glowing between some slabs
      const { E, A, B } = voro(4, 0.75);
      paint(true, (px, py, o) => {
        const k = py * N + px, e = E[k], ia = A[k], ib = B[k], tone = 0.8 + h2(ia, 3) * 0.2, sm = smooth(1.2, 5.5, e), bev = 1 - 0.18 * (1 - smooth(3, 22, e)), n = (h2(px * 0.37, py * 0.53) - 0.5) * 0.06;
        o[0] = 52 + (238 * tone * bev - 52) * sm + n * 255; o[1] = 46 + (226 * tone * bev - 46) * sm + n * 255; o[2] = 44 + (218 * tone * bev - 44) * sm + n * 255;
        if (h2(Math.min(ia, ib), Math.max(ia, ib) + 11) < 0.34) {   // a glowing seam
          const hot = 1 - smooth(0.4, 5.5, e), core = 1 - smooth(0.2, 2.2, e);
          o[3] = 255 * hot * 0.75 + 255 * core * 0.25; o[4] = 105 * hot * 0.75 + 190 * core * 0.25; o[5] = 24 * hot * 0.75 + 80 * core * 0.25;
        }
      });
      blobs(g, 30, 30, 80, '0,0,0', 0.05, 0.1); speck(1500, 0.04, 0.12, 0.35, 2);
      break;
    }
    case 'VOID': {   // deep violet rounded tiles, faint lit seams, soft star speckle + twinkles
      paint(true, (px, py, o) => {
        const t = tileAt(px, py, 4, 20), tone = 0.82 + h2(t.tx + 5, t.ty) * 0.18, sm = smooth(1.5, 6, t.e), bev = 1 - 0.14 * (1 - smooth(4, 26, t.e));
        o[0] = 78 + (232 * tone * bev - 78) * sm; o[1] = 70 + (226 * tone * bev - 70) * sm; o[2] = 120 + (255 * tone * bev - 120) * sm;
        const seam = (1 - smooth(0.5, 5, t.e)) * 0.55; o[3] = 150 * seam; o[4] = 95 * seam; o[5] = 255 * seam;
      });
      blobs(g, 28, 40, 90, '60,30,120', 0.06, 0.12); speck(1200, 0.03, 0.08, 0.4);
      const gg = glowC!.getContext('2d')!;
      for (let i = 0; i < 150; i++) { gg.fillStyle = `rgba(${200 + rnd() * 55},${170 + rnd() * 70},255,${0.25 + rnd() * 0.6})`; const s = 1 + rnd() * 1.6; gg.fillRect(rnd() * N, rnd() * N, s, s); }
      for (let i = 0; i < 16; i++) { const s = 2.5 + rnd() * 2.5; wrap(rnd() * N, rnd() * N, 8, (px, py) => { gg.fillStyle = 'rgba(225,205,255,0.85)'; gg.fillRect(px - s, py - 0.6, s * 2, 1.2); gg.fillRect(px - 0.6, py - s, 1.2, s * 2); gg.beginPath(); gg.arc(px, py, 1.3, 0, 6.3); gg.fill(); }); }
      break;
    }
    default: {   // grass (owner mock): soft mottling + little leafy clover clumps (dark / mid / light leaves), a few white clover flowers (emissive dots)
      g.fillStyle = '#eef0ea'; g.fillRect(0, 0, N, N);
      blobs(g, 44, 40, 100, '20,90,20', 0.06, 0.12); blobs(g, 44, 40, 100, '255,255,225', 0.14, 0.26);
      const LEAF = ['rgb(128,176,104)', 'rgb(150,198,122)', 'rgb(176,214,140)', 'rgb(255,255,238)', 'rgb(112,160,92)'];
      // (owner 2026-10-24: no clover / flower dots on the grass - plain soft mottling)
      glowC = mk(); const gg = glowC.getContext('2d')!; gg.fillStyle = '#000'; gg.fillRect(0, 0, N, N);
      break;
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4;
  let e: CanvasTexture | null = null;
  if (glowC) { e = new CanvasTexture(glowC); e.colorSpace = SRGBColorSpace; e.wrapS = e.wrapT = RepeatWrapping; e.anisotropy = 4; }
  detailTex[key] = [t, e];
  return [t, e];
}
/** World units covered by one repeat of the detail texture. */
/** How far the floor sinks under rivers / lakes (the liquid surface sits a little above the bed). */
export const SINK = 2.4;
export const DETAIL_PERIOD: Record<GroundStyle, number> = { GRASS: 8, MARBLE: 8, SAND: 9, SNOW: 8, BASALT: 10, VOID: 8 };
/** The floor material of a ground style (shared by run rooms and the camp ground): detail texture repeated `rx` x `rz` times
 *  over the mesh, glow map (flowers / glints / lava seams / violet seams) added as emissive. */
export function groundMaterial(style: GroundStyle, rx: number, rz: number, glowScale = 1, beach = false): MeshStandardMaterial {
  const [dTex, eTex] = groundDetail(style, beach);
  const map = dTex.clone(); map.repeat.set(rx, rz); map.needsUpdate = true;
  let emap: CanvasTexture | null = null;
  if (eTex) { emap = eTex.clone(); emap.repeat.set(rx, rz); emap.needsUpdate = true; }
  const glow = style === 'BASALT' ? 0.62 : style === 'VOID' ? 0.8 : 0.5;
  return new MeshStandardMaterial({
    vertexColors: true, map, roughness: style === 'MARBLE' ? 0.6 : style === 'SNOW' ? 0.8 : 0.96, metalness: 0,
    emissiveMap: emap, emissive: new Color(emap ? '#ffffff' : '#000000'), emissiveIntensity: emap ? glow * glowScale : 0,
  });
}

/** Distance outside the nearest liquid edge (negative = inside the liquid). */
function liquidEdge(x: number, z: number): number {
  let e = 1e9;
  for (let i = 0; i < feat.nLakes; i++) e = Math.min(e, Math.hypot(x - feat.lx[i], z - feat.lz[i]) - feat.lr[i]);
  if (feat.river) e = Math.min(e, Math.abs(riverD(x, z)) - hwAt(riverS(x, z)));
  return e;
}

function RoomGround({ biome, R, seed, boss, index }: { biome: number; R: number; seed: number; boss: boolean; index: number }) {
  const { geo, mat, tufts, slabs, shrooms, kerb, pathTex } = useMemo(() => {
    const def = biomeOf(biome);
    const vr = variantOf(def, index);
    const style = def.style;
    const hl = shape.kind === 'HALLS';
    const S = 2 * (shape.maxR + (hl ? 24 : 44)), seg = hl ? 340 : feat.river || feat.nLakes > 0 ? 260 : 160;   // finer grid where banks are carved (halls: crisp organic edges)
    const g = new PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const ground = vr?.ground ?? def.ground, patch = vr?.patch ?? def.patch;
    const g0 = _c.set(ground[0]), g1 = _c2.set(ground[1]), edge = _c3.set(vr?.edge ?? def.edge), rim = _c4.set(RIM_TONE[style]).lerp(g0, 0.3);
    const so = (seed % 997) * 0.37;
    const lush = new Color(patch[0]), dry = new Color(patch[1]), dirt = new Color(patch[2]);
    const stone = new Color(def.stone), stoneC = new Color();
    const pathDirt = new Color(vr?.patch[2] ?? def.patch[2]).lerp(new Color('#d9b87c'), style === 'GRASS' && vr && def.variants!.indexOf(vr) === 2 ? 0.3 : 0.62);
    const bank = new Color(style === 'BASALT' ? '#1a0e0a' : style === 'SAND' ? (feat.liquid === 'CHASM' ? '#a87440' : '#8a7a4a') : style === 'SNOW' ? '#9ab4c8' : style === 'MARBLE' ? '#8a8272' : style === 'VOID' ? '#160f2a' : '#4a5a2a');
    const hasLiquid = feat.river || feat.nLakes > 0;
    const flatLava = feat.liquid === 'LAVA' && !feat.river;   // lava pools lie flat on the rock (only lava rivers cut channels)
    const lavaSea = !!def.lavaSea, waterSea = !!def.waterSea;
    const isHalls = shape.kind === 'HALLS';
    const path = !boss && !isHalls && (seed % 5) !== 0 && style !== 'MARBLE' && style !== 'VOID';
    const out = new Color(), tmpC = new Color();
    const duneA = (seed % 360) * 0.0174, dux = Math.cos(duneA), duz = Math.sin(duneA);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // signed distance-ish to the walkable outline (0 at the old disc edge R), so rim / outside tint follow the shape
      const u = outlineU(x, z, r);
      const n1 = fbm(x * 0.06 + so, z * 0.06 - so, 3), n2 = vnoise(x * 0.9 + so, z * 0.9);
      out.copy(g0).lerp(g1, sstep(0.3, 0.72, n1)).multiplyScalar(0.9 + n2 * 0.2);
      out.lerp(g1, sstep(0.62, 0.78, fbm(x * 0.14 - so, z * 0.14 + so, 2)) * 0.35);
      const zA = fbm(x * 0.055 - so * 1.7, z * 0.055 + so, 3), zB = fbm(x * 0.07 + so * 2.3, z * 0.07 - so * 0.6, 3);
      if (style === 'MARBLE') {
        // slab-to-slab tone (3-unit slabs), worn darker lanes, roots / moss creeping in from the cracks
        const tx = Math.floor(x / 3), tz = Math.floor(z / 3);
        out.multiplyScalar(0.94 + vnoise(tx * 3.7 + so, tz * 5.3) * 0.1);
        if (isHalls) out.lerp(tmpC.set('#d8d6d0'), 0.85).multiply(tmpC.set('#ffffff').setRGB(0.62, 0.66, 0.78));   // castle halls: dim stone marble (owner: biome 2 darker), no dark moss / dirt blotches
        else { out.lerp(dry, sstep(0.55, 0.7, zB) * 0.45); out.lerp(dirt, sstep(0.62, 0.74, zA) * 0.75); }
        const lane = Math.abs(x * -shape.fz + z * shape.fx);
        if (!boss && !isHalls) {   // worn royal carpet down the hall: crimson with a gold border, frayed and torn in places
          const torn = sstep(0.62, 0.7, fbm(x * 0.12 + so, z * 0.12, 3));
          const inLane = sstep(2.9, 2.6, lane) * sstep(0.5, -1.5, u) * (1 - torn);
          out.lerp(tmpC.set('#6e1a20'), inLane * 0.85);
          out.lerp(tmpC.set('#e8c870'), sstep(2.9, 2.6, lane) * sstep(2.2, 2.45, lane) * sstep(0.5, -1.5, u) * (1 - torn) * 0.7);
        }
      } else if (style === 'SAND') {
        // dunes: long wind ripples bending with the noise, troughs darker
        const w = (x * dux + z * duz) * 0.42 + fbm(x * 0.03 + so, z * 0.03, 3) * 6;
        const rip = Math.sin(w) * 0.5 + 0.5;
        out.multiplyScalar(0.86 + rip * 0.2);
        out.lerp(dry, sstep(0.5, 0.66, zB) * 0.6);
        out.lerp(dirt, sstep(0.66, 0.76, zA) * 0.5);
      } else if (style === 'SNOW') {
        out.lerp(dry, sstep(0.5, 0.64, zB) * 0.6);
        out.lerp(tmpC.set('#ffffff'), sstep(0.6, 0.66, zA) * (1 - sstep(0.66, 0.7, zA)) * 0.55);   // frost fringe round the ice
        out.lerp(tmpC.set('#9fd2f2'), sstep(0.66, 0.74, zA) * 0.75);   // blue ice patches
        out.lerp(dirt, sstep(0.7, 0.8, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.6);   // rock poking through
      } else if (style === 'BASALT') {
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.6);
        out.lerp(dirt, sstep(0.55, 0.7, zB) * 0.45);
        out.lerp(tmpC.set('#5a3220'), sstep(0.7, 0.78, fbm(x * 0.09 + so, z * 0.09, 3)) * 0.35);   // faint scorch
      } else if (style === 'VOID') {
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.7);
        out.lerp(dirt, sstep(0.6, 0.72, zB) * 0.4);   // (soft shadowed pools, not black holes)
      } else {
        // big colour zones: lush / dry grass and bare-dirt patches (more variety across the room)
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.85);
        out.lerp(dry, sstep(0.5, 0.64, zB) * 0.8);
        const zD = fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3);
        out.lerp(tmpC.copy(dirt).lerp(g1, 0.5), sstep(0.6, 0.64, zD) * (1 - sstep(0.64, 0.68, zD)) * 0.5);   // worn-grass fringe
        out.lerp(dirt, sstep(0.64, 0.74, zD) * 0.85);
      }
      // path from the arrival side to the exits (most non-boss rooms), gently winding: a clean dirt trail in the forest, flagstones elsewhere
      if (path) {
        const t = x * shape.fx + z * shape.fz, l = x * -shape.fz + z * shape.fx;
        const cl = Math.sin(t * 0.11 + so) * 2.6 + Math.sin(t * 0.27 - so) * 0.8;
        const w = 1.9 + vnoise(t * 0.2 + so, 3.1) * 0.9;
        const pd = Math.abs(l - cl) - w;
        if (style === 'GRASS') {
          // (the soil trail of the grass rooms is a per-pixel mask in the ground shader: render/groundPath.ts)
        } else {
          const k = sstep(0.6, -0.4, pd) * sstep(0.5, -1.5, u) * (style === 'SAND' ? 0.7 : 1);
          if (k > 0) {
            const sc = style === 'SAND' ? 0.62 : 1.0;   // slab size (sand: big sandstone flags)
            const cx = x * sc, cz = z * sc, fx = cx - Math.floor(cx), fz = cz - Math.floor(cz) + (Math.floor(cx) % 2) * 0.5;
            const gap = Math.min(fx, 1 - fx, fz - Math.floor(fz), 1 - (fz - Math.floor(fz)));
            stoneC.copy(stone).multiplyScalar((style === 'BASALT' ? 0.75 : 1) * (0.88 + vnoise(Math.floor(cx) * 3.1, Math.floor(cz + (Math.floor(cx) % 2) * 0.5) * 2.7) * 0.24));
            stoneC.multiplyScalar(1 - 0.38 * sstep(0.14, 0.04, gap) + 0.05 * sstep(0.1, 0.3, gap));   // soft grout line + gently domed slab
            out.lerp(stoneC, k * 0.92);
          }
        }
      }
      // shore / bank around liquids: the floor drops away into a sunken channel (rock cliff strata on the slope)
      if (hasLiquid) {
        const le = liquidEdge(x, z);
        if (le < 2.6) out.lerp(bank, sstep(2.6, 0.2, le) * (feat.liquid === 'LAVA' ? 0.9 : 0.7));
        if (le < 0.6 && !flatLava) {
          const k = sstep(0.6, -1.4, le);   // 0 at the lip -> 1 at the channel bed
          pos.setY(i, -SINK * k * (0.9 + 0.1 * vnoise(x * 0.7 + so, z * 0.7)));
          const strata = 0.7 + 0.3 * Math.sin(k * 11 + fbm(x * 0.4, z * 0.4, 2) * 3);
          out.lerp(tmpC.copy(bank).multiplyScalar(strata), Math.min(1, k * 1.4)).multiplyScalar(1 - k * 0.45);
        }
      }
      // tidy rim just inside the walls: a soft lighter paved band with a darker outer line (the 3D kerb sits on it, buildKerb)
      if (style !== 'GRASS') {
        out.lerp(rim, sstep(-2.6, -1.6, u) * (1 - sstep(-0.9, -0.3, u)) * 0.6);
        out.multiplyScalar(1 - sstep(-0.9, -0.5, u) * (1 - sstep(-0.3, 0.2, u)) * 0.22);
      }
      // boss arena: a faint rune circle
      if (boss) {
        const rr = Math.abs(r - (shapeLimit(x, z) - 1) * 0.62);
        const r2 = Math.abs(r - (shapeLimit(x, z) - 1) * 0.3);
        out.lerp(g1, Math.max(sstep(0.9, 0.2, rr), sstep(0.7, 0.15, r2)) * 0.6).multiplyScalar(1 + Math.max(sstep(0.5, 0.1, rr), sstep(0.4, 0.1, r2)) * 0.25);
        out.multiplyScalar(1 + sstep(R * 0.2, 0, r) * 0.2);
      }
      // lava sea: past the wall ring the rock crumbles away under the lava (a dark scorched lip first)
      if (lavaSea && !isHalls) {
        const k = sstep(3.6, 6.0, u);
        if (k > 0) pos.setY(i, Math.min(pos.getY(i), -1.4 * k));
        out.lerp(tmpC.set('#1a0c08'), sstep(2.6, 4.2, u) * 0.85);
      }
      // island biome: wet sand at the waterline, then the beach shelves down under the sea
      if (waterSea && isHalls) {   // Coral Isles HALLS: each chamber is a sandy island, the passages are bridges over the sea: the ground sinks under them and outside the chambers
        let ou = hallsBridge(x, z) ? 4.2 : -hallsSdf(x, z);
        if (ou < 4.2 && ou > -0.2 && ou < 2.6 && hallsSdf(x, z) < 0.05) {   // solid ground right beside a bridge deck: sink it too (no sand strips along the planks), faded out over ~0.5 m
          let db = 9;
          for (let a = -1.75; a < 2; a += 0.5) for (let b = -1.75; b < 2; b += 0.5) if (hallsBridge(x + a, z + b)) { const d = Math.hypot(a, b); if (d < db) db = d; }
          if (db < 9) ou = Math.max(ou, 4.2 - Math.max(0, db - 1.25) * 5);
        }
        const k = sstep(1.5, 4.2, ou);
        if (k > 0) pos.setY(i, Math.min(pos.getY(i), -1.6 * k));
        out.lerp(tmpC.set('#c8b07a'), sstep(0.2, 1.4, ou) * 0.7);
        out.lerp(tmpC.set('#7fe6dc'), sstep(2.0, 3.6, ou) * 0.85);
        out.lerp(tmpC.set('#ffffff'), sstep(0.7, 0, Math.abs(ou - 1.9)) * 0.45);
      }
      if (waterSea && !isHalls) {
        const k = sstep(3.4, 7.0, u);
        if (k > 0) pos.setY(i, Math.min(pos.getY(i), -1.6 * k));
        out.lerp(tmpC.set('#c8b07a'), sstep(2.4, 3.8, u) * 0.7);
        out.lerp(tmpC.set('#7fe6dc'), sstep(3.9, 5.6, u) * 0.85);   // turquoise shallows
        out.lerp(tmpC.set('#ffffff'), sstep(0.7, 0, Math.abs(u - 3.5)) * 0.55);   // foam line
      }
      // rolling hills rising beyond the outer prop ring (owner: more elevation; not in the castle halls, the void or over the lava sea)
      if (!lavaSea && !waterSea && style !== 'MARBLE' && style !== 'VOID' && !isHalls) {
        const k = sstep(7, 22, u);
        if (k > 0) pos.setY(i, pos.getY(i) + k * (1.6 + 5.5 * fbm(x * 0.045 + so, z * 0.045 - so, 3)) * (style === 'SAND' ? 0.8 : 1));
      }
      // floor beyond the walls (marble halls: dark interior void)
      let inIsl = false;   // (halls: the islands inside the floor keep the floor colour; only the outer ground fades)
      if (isHalls && u > 0.3) for (let q = 0; q < halls.islands.length; q++) { const I = halls.islands[q]; if ((x - I[0]) ** 2 + (z - I[1]) ** 2 < (I[2] + 1.2) ** 2) { inIsl = true; break; } }
      const e = inIsl || (isHalls && waterSea) ? 0 : isHalls && style !== 'MARBLE' ? sstep(0.6, 4, u) * 0.6 : sstep(0.2, style === 'MARBLE' ? 2.2 : 3.2, u);   // (halls: the ground between the chambers stays the biome floor, darkened)
      out.lerp(edge, e).multiplyScalar(1 - e * 0.35);
      col[i * 3] = out.r; col[i * 3 + 1] = out.g; col[i * 3 + 2] = out.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    setSeaShore(waterSea ? bakeGridShore(pos.array, seg, seg, -S / 2, -S / 2, S, S, -0.45, 16) : null);   // (the sea's shore distance, render/waterFx.ts)
    const m = groundMaterial(style, S / DETAIL_PERIOD[style], S / DETAIL_PERIOD[style], style === 'GRASS' && vr && def.variants!.indexOf(vr) === 2 ? 0.2 : 1, !!def.waterSea);   // (Darkwood: the flower dots stay faint)
    let pathTex: DataTexture | null = null;
    if (style === 'GRASS' && path) {   // soft wandering soil trail + branch + clearings with a ragged leafy edge (owner mock)
      const hs = shape.maxR + 6, pm = pathMask(roomTrail(seed).discs, -hs, -hs, hs * 2, hs * 2, 9);
      applyPathShader(m, pm); pathTex = pm.tex;
    }
    if (lava.on && style === 'BASALT') {   // Ember lava streams / heavy-lava islands (engine/lavaFloor.ts), glowing via the shader's emissive
      const hs = shape.maxR + 6, lm = pathMask(lava.discs, -hs, -hs, hs * 2, hs * 2, 8);
      applyLavaShader(m, lm, lava.heavy); pathTex = lm.tex;
      lavaLive.tex = lm.tex; lavaLive.hs = hs; lavaLive.seen = lava.growVer;
    }
    if (ice.on && style === 'SNOW') {   // Frostpeak slippery ice sheets (engine/iceFloor.ts): glossy pale cyan with cracks and a frosty rim
      const hs = shape.maxR + 6, im = pathMask(ice.discs, -hs, -hs, hs * 2, hs * 2, 8);
      applyIceShader(m, im); pathTex = im.tex;
    }

    // ground clutter: pebbles / tufts in the biome's tones (one instanced draw call)
    const N = style === 'MARBLE' ? (shape.kind === 'HALLS' ? 0 : 26) : 45; // sparse clutter (castle halls: none, clean marble)
    const tg = new GB([0.8, 1.1]);
    if (style === 'MARBLE') { tg.box(0.5, 0.18, 0.4, [0, 0.09, 0], '#ffffff', [0, 0.4, 0.1]); tg.box(0.3, 0.14, 0.3, [0.4, 0.07, 0.2], '#ffffff', [0.2, 1, 0]); }
    else if (style === 'SAND') { tg.ico(0.22, [0, 0.06, 0], '#ffffff', [1.4, 0.4, 1.1], 0); tg.cone(0.04, 0.4, 3, [0.15, 0.2, 0], '#ffffff', [0.3, 0, 0.4]); tg.cone(0.04, 0.35, 3, [-0.1, 0.18, 0.05], '#ffffff', [-0.3, 0, -0.4]); }
    else {
      tg.ico(0.2, [0, 0.08, 0], '#ffffff', [1.3, 0.55, 1.1], 0);
      tg.cone(0.07, 0.38, 4, [0.12, 0.19, 0.05], '#ffffff', [0.2, 0, 0.3]);
      tg.cone(0.07, 0.3, 4, [-0.1, 0.15, -0.06], '#ffffff', [-0.2, 0, -0.3]);
    }
    const tgeo = tg.build();
    const tm = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const inst = new InstancedMesh(tgeo, tm, N);
    const rnd = mulberry32(seed ^ 0x51ed);
    const trailD = style === 'GRASS' && path ? roomTrail(seed).discs : null;   // (owner 2026-10-24: no tufts on the soil trail)
    const o = new Object3D();
    const cc = new Color();
    let nt = 0;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shapeLimit(Math.cos(a), Math.sin(a)) - 2);
      const x = isHalls ? (rnd() - 0.5) * 2 * shape.maxR : Math.cos(a) * d, z = isHalls ? (rnd() - 0.5) * 2 * shape.maxR : Math.sin(a) * d;
      if (isHalls && hallsSdf(x, z) < 1.2) continue;
      if (lava.on && lavaAt(x, z)) continue;
      if (ice.on && iceAt(x, z)) continue;
      if (trailD && trailD.some((d) => (d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + 0.6) ** 2)) continue;
      if (hasLiquid && (inLiquid(x, z, 0.4) || onBridge(x, z, 1.2))) continue;
      o.position.set(x, 0, z);
      o.rotation.set(0, rnd() * 6.28, 0);
      const s = 0.6 + rnd() * 1.3;
      o.scale.set(s, s * (0.8 + rnd() * 0.6), s);
      o.updateMatrix();
      inst.setMatrixAt(nt, o.matrix);
      cc.set(style === 'MARBLE' ? def.stone : ground[rnd() < 0.5 ? 0 : 1]).multiplyScalar(0.55 + rnd() * 0.7).offsetHSL(0, 0, rnd() < 0.15 ? 0.2 : 0);
      inst.setColorAt(nt, cc); nt++;
    }
    inst.count = nt;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;

    // flat stepping stones along the stone path (one instanced draw)
    const SG = new GB([0.9, 1.1]); SG.cyl(0.62, 0.7, 0.14, 11, [0, 0.05, 0], '#ffffff');
    const slabs = new InstancedMesh(SG.build(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 90);
    let ns = 0;
    if (path && style !== 'GRASS') {   // (Greenwood: Quaternius RockPath stones, render/Props)
      const r2 = mulberry32(seed ^ 0x7a11);
      for (let t = -shape.maxR; t <= shape.maxR && ns < 90; t += 0.95) {
        const cl = Math.sin(t * 0.11 + so) * 2.6 + Math.sin(t * 0.27 - so) * 0.8;
        for (let k = 0; k < 2 && ns < 90; k++) {
          const l = cl + (r2() - 0.5) * 2.6;
          const x = t * shape.fx - l * shape.fz, z = t * shape.fz + l * shape.fx;
          if (Math.hypot(x, z) > shapeLimit(x, z) - 2.5 || r2() < 0.25) continue;
          if (hasLiquid && inLiquid(x, z, 0.8)) continue;
          o.position.set(x, 0, z); o.rotation.set(0, r2() * 6.28, 0);
          const sc = 0.65 + r2() * 0.5; o.scale.set(sc * (0.9 + r2() * 0.4), 1, sc); o.updateMatrix();
          slabs.setMatrixAt(ns, o.matrix);
          cc.copy(stone).multiplyScalar(0.8 + r2() * 0.35); slabs.setColorAt(ns, cc); ns++;
        }
      }
    }
    slabs.count = ns; slabs.receiveShadow = true;
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    // Darkwood (Greenwood's last tier): clusters of glowing mushrooms light the dim forest floor (one instanced draw)
    let shrooms: InstancedMesh | null = null;
    if (style === 'GRASS' && vr && def.variants && def.variants.indexOf(vr) === 2) {
      const sg = new GB([1, 1]);
      sg.cyl(0.05, 0.07, 0.35, 5, [0, 0.17, 0], '#e8f0d8'); sg.sph(0.2, [0, 0.38, 0], '#ffffff', [1, 0.55, 1], 8);
      sg.cyl(0.035, 0.05, 0.22, 5, [0.28, 0.11, 0.12], '#e8f0d8'); sg.sph(0.13, [0.28, 0.25, 0.12], '#ffffff', [1, 0.55, 1], 7);
      sg.cyl(0.03, 0.04, 0.16, 5, [-0.2, 0.08, 0.22], '#e8f0d8'); sg.sph(0.1, [-0.2, 0.18, 0.22], '#ffffff', [1, 0.55, 1], 6);
      const NS = 34;
      shrooms = new InstancedMesh(sg.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) }), NS);
      const r3 = mulberry32(seed ^ 0x5b00);
      const tones = ['#5ad8ff', '#7affc0', '#c08aff', '#5affe0'];
      let ns2 = 0;
      for (let i = 0; i < NS * 3 && ns2 < NS; i++) {
        const a = r3() * Math.PI * 2, d = Math.sqrt(r3()) * (shapeLimit(Math.cos(a), Math.sin(a)) + 3);
        const x = isHalls ? (r3() - 0.5) * 2 * shape.maxR : Math.cos(a) * d, z = isHalls ? (r3() - 0.5) * 2 * shape.maxR : Math.sin(a) * d;
        if (isHalls && hallsSdf(x, z) < 0.8) continue;
        if (hasLiquid && (inLiquid(x, z, 0.6) || onBridge(x, z, 1.2))) continue;
        o.position.set(x, 0, z); o.rotation.set(0, r3() * 6.28, 0); const sc = 0.9 + r3() * 1.3; o.scale.set(sc, sc, sc); o.updateMatrix();
        shrooms.setMatrixAt(ns2, o.matrix); cc.set(tones[Math.floor(r3() * tones.length)]); shrooms.setColorAt(ns2, cc); ns2++;
      }
      shrooms.count = ns2;
      if (shrooms.instanceColor) shrooms.instanceColor.needsUpdate = true;
    }
    const kerb = def.waterSea || isHalls || style === 'GRASS' ? null :   // (owner: no stone kerb round the Greenwood meadow; halls have a tree / rock border instead)
       new Mesh(buildKerb(style, seed, hasLiquid), litMat({ flatShading: false }));
    if (kerb) kerb.receiveShadow = true;
    return { geo: g, mat: m, tufts: inst, slabs, shrooms, kerb, pathTex };
  }, [biome, R, seed, boss]);
  useEffect(() => () => { pathTex?.dispose(); }, [pathTex]);
  useFrame(({ clock }) => {
    lavaTime.value = clock.elapsedTime;
    if (lava.on && lavaLive.tex && lavaLive.seen !== lava.growVer && clock.elapsedTime - lavaLive.t > 0.4) {   // Ignar's creeping lava: repaint the ground mask in place
      lavaLive.seen = lava.growVer; lavaLive.t = clock.elapsedTime;
      refreshPathMask(lavaLive.tex, lava.discs, -lavaLive.hs, -lavaLive.hs, lavaLive.hs * 2, lavaLive.hs * 2, 8);
    }
  });
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <primitive object={tufts} />
      <primitive object={slabs} />
      {shrooms && <primitive object={shrooms} />}
      {kerb && <primitive object={kerb} />}
    </>
  );
}

// ----------------------------------------------------------- tower floor ---
let cobbleTex: CanvasTexture | null = null;
/** Cobblestone / cement texture for the round tower floors: concentric rings of worn grey stones (built once). */
function towerCobbles(): CanvasTexture {
  if (cobbleTex) return cobbleTex;
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(0x70e3);
  g.fillStyle = '#9a948a'; g.fillRect(0, 0, N, N);   // mortar / cement (light, warm)
  const cx = N / 2, ringW = 17;
  for (let r0 = 0; r0 < N * 0.72; r0 += ringW) {
    const n = Math.max(6, Math.round((Math.PI * 2 * (r0 + ringW / 2)) / 24));
    const off = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2 + 0.012, a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.012;
      const rIn = r0 + 1.8, rOut = r0 + ringW - 1.8;
      const v = 0.82 + rnd() * 0.22, warm = rnd() * 12;
      g.fillStyle = `rgb(${Math.round(226 * v + warm)},${Math.round(216 * v + warm * 0.6)},${Math.round(198 * v)})`;
      g.beginPath(); g.arc(cx, cx, rOut, a0, a1); g.arc(cx, cx, Math.max(0, rIn), a1, a0, true); g.closePath(); g.fill();
      // a lighter top face for a little bevel
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.beginPath(); g.arc(cx, cx, rOut - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cx, Math.max(0, rIn + 5), a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
    }
  }
  // grime + speckle so it reads as rough rock, not tiles
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * N, y = rnd() * N, s = 1 + rnd() * 2.5;
    g.fillStyle = rnd() < 0.5 ? 'rgba(60,40,20,0.1)' : 'rgba(255,255,255,0.08)'; g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(90,70,50,0.12)'); gr.addColorStop(1, 'rgba(90,70,50,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cobbleTex = new CanvasTexture(c); cobbleTex.colorSpace = SRGBColorSpace; cobbleTex.anisotropy = 4;
  return cobbleTex;
}

/** Endless Tower floor: a round cobbled platform floating in the night sky (stone skirt below, rune ring, stars). */
function TowerFloor({ R }: { R: number }) {
  const { top, skirt, rune, kerb } = useMemo(() => {
    const rr = R + 3.4;
    const tg = new CircleGeometry(rr, 96); tg.rotateX(-Math.PI / 2);
    const top = new Mesh(tg, new MeshStandardMaterial({ map: towerCobbles(), roughness: 0.95, metalness: 0 }));
    top.position.y = 0.005; top.receiveShadow = true;
    const sg = new CylinderGeometry(rr, rr * 0.55, 7, 48, 1, true);
    const skirt = new Mesh(sg, new MeshStandardMaterial({ color: '#5e5a6c', roughness: 1, side: DoubleSide }));
    skirt.position.y = -3.5;
    const rg = new RingGeometry(R * 0.62 - 0.12, R * 0.62 + 0.12, 96); rg.rotateX(-Math.PI / 2);
    const rune = new Mesh(rg, new MeshBasicMaterial({ color: '#6f8cff', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
    rune.position.y = 0.02;
    const kg = new TorusGeometry(rr - 0.35, 0.38, 8, 96); kg.rotateX(Math.PI / 2);   // rounded cream kerb round the platform
    const kerb = new Mesh(kg, new MeshStandardMaterial({ color: '#efe4cc', roughness: 0.85 }));
    kerb.position.y = 0.12; kerb.scale.y = 0.55; kerb.receiveShadow = true;
    return { top, skirt, rune, kerb };
  }, [R]);
  useFrame(({ clock }) => { (rune.material as MeshBasicMaterial).opacity = 0.25 + Math.sin(clock.elapsedTime * 1.4) * 0.1; });
  return (
    <>
      <primitive object={top} />
      <primitive object={skirt} />
      <primitive object={rune} />
      <primitive object={kerb} />
      <Stars radius={140} depth={60} count={2500} factor={5} saturation={0} fade speed={0.4} />
    </>
  );
}

// ---------------------------------------------------------------- stations ---
function stationGeos() {
  // fountain
  const f = new GB([0.8, 1.08]);
  f.cyl(2.5, 2.7, 0.7, 12, [0, 0.35, 0], '#a9a396'); f.cyl(2.2, 2.2, 0.12, 12, [0, 0.72, 0], '#8f897c');
  f.cyl(0.45, 0.65, 1.5, 8, [0, 1.35, 0], '#b9b3a4'); f.cyl(1.25, 0.6, 0.35, 10, [0, 2.15, 0], '#a9a396'); f.cyl(0.8, 0.8, 0.1, 10, [0, 2.38, 0], '#8f897c');
  f.torus(2.45, 0.1, [0, 0.72, 0], '#c9c3b4', [Math.PI / 2, 0, 0], 1, 16);
  const fw = new GB([1, 1]);
  fw.cyl(2.05, 2.05, 0.06, 14, [0, 0.76, 0], '#38b6ff'); fw.cyl(0.75, 0.75, 0.06, 10, [0, 2.4, 0], '#7fe0ff');
  fw.cone(0.22, 1.5, 6, [0, 3.1, 0], '#9ae6ff'); fw.sph(0.2, [0.6, 2.7, 0], '#bff0ff', 1, 5); fw.sph(0.2, [-0.6, 2.7, 0.2], '#bff0ff', 1, 5);
  // merchant stall + trader
  const m = new GB([0.8, 1.08]);
  const wood = '#7a5230', dark = '#5a3a1e';
  m.box(4.2, 1.0, 1.6, [0, 0.5, 0.6], wood); m.box(4.4, 0.16, 1.9, [0, 1.05, 0.6], '#9a6c3e');
  for (const sx of [-2.0, 2.0]) m.box(0.22, 3.6, 0.22, [sx, 1.8, -0.1], dark);
  for (const sx of [-2.0, 2.0]) m.box(0.22, 2.6, 0.22, [sx, 1.3, 1.3], dark);
  m.prism(5.0, 1.2, 3.0, [0, 3.0, 0.6], '#c0392b', [0, Math.PI / 2, 0]);
  m.prism(5.02, 1.22, 0.7, [0, 3.0, -0.3], '#efe2c4', [0, Math.PI / 2, 0]); m.prism(5.02, 1.22, 0.7, [0, 3.0, 1.5], '#efe2c4', [0, Math.PI / 2, 0]);
  m.box(1.0, 0.8, 0.8, [-1.5, 1.5, 0.7], '#a8733a'); m.box(0.8, 0.5, 0.7, [-0.4, 1.35, 0.7], '#c9a35f'); m.sph(0.35, [0.6, 1.4, 0.7], '#d94a3a', 1, 6); m.sph(0.3, [1.3, 1.38, 0.75], '#e8c04a', 1, 6);
  m.cyl(0.6, 0.6, 1.2, 8, [-3.0, 0.6, 0.6], wood); m.box(1.1, 0.9, 1.1, [3.0, 0.45, 0.5], '#a8733a');
  // (the trader behind the counter is a real character: MerchantNpc)
  const ml = new GB([1, 1]);
  ml.sph(0.18, [-2.0, 3.5, 1.6], '#ffd88a', 1, 6); ml.sph(0.18, [2.0, 3.5, 1.6], '#ffd88a', 1, 6);
  // chest
  const cb = new GB([0.8, 1.08]);
  cb.box(2.0, 0.9, 1.3, [0, 0.45, 0], '#7a4a24'); cb.box(2.1, 0.14, 1.4, [0, 0.2, 0], '#d4a63a'); cb.box(2.1, 0.14, 1.4, [0, 0.75, 0], '#d4a63a');
  cb.box(0.2, 0.95, 1.4, [-0.7, 0.45, 0], '#d4a63a'); cb.box(0.2, 0.95, 1.4, [0.7, 0.45, 0], '#d4a63a');
  const cl = new GB([0.8, 1.08]);
  cl.cyl(0.65, 0.65, 2.0, 10, [0, 0, 0], '#8a5a2c', [0, 0, Math.PI / 2], [1, 1, 1], undefined);
  cl.box(0.2, 1.3, 1.4, [-0.7, 0, 0], '#d4a63a'); cl.box(0.2, 1.3, 1.4, [0.7, 0, 0], '#d4a63a');
  const cg = new GB([1, 1]);
  cg.box(0.35, 0.4, 0.2, [0, 0.8, 0.7], '#ffe08a'); cg.sph(0.3, [0, 1.35, 0], '#ffd24a', [2.4, 0.3, 1.6], 6);
  // altar (owner 2026-10-24: a cute cream shrine; its big crystal is dull stone-violet until the challenge is activated, then it glows)
  const a = new GB([0.8, 1.08]), PI2 = Math.PI / 2;
  a.cyl(2.0, 2.2, 0.35, 18, [0, 0.175, 0], '#d6cbb2'); a.cyl(1.6, 1.75, 0.3, 18, [0, 0.5, 0], '#ece4d2');
  a.torus(1.63, 0.07, [0, 0.66, 0], '#5b8fd9', [PI2, 0, 0], 1, 28);
  a.cyl(0.42, 0.58, 1.1, 12, [0, 1.2, 0], '#f2ebdc'); a.torus(0.5, 0.06, [0, 0.95, 0], '#e8c04a', [PI2, 0, 0], 1, 18);
  a.cyl(0.78, 0.48, 0.28, 12, [0, 1.88, 0], '#ece4d2'); a.torus(0.74, 0.07, [0, 2.02, 0], '#e8c04a', [PI2, 0, 0], 1, 22);
  for (let k = 0; k < 4; k++) {   // four little standing stones round the dais, each crowned with a small gem (in the glow mesh)
    const ang = Math.PI / 4 + (k * Math.PI) / 2, x = Math.cos(ang) * 1.72, z = Math.sin(ang) * 1.72;
    a.box(0.4, 0.9, 0.4, [x, 1.05, z], '#e2d8c2', [0, ang, 0]); a.cyl(0.26, 0.26, 0.12, 8, [x, 1.56, z], '#e8c04a');
  }
  const ag = new GB([1, 1]);
  ag.octa(0.5, [0, 3.05, 0], '#a98bff', [0.95, 2.0, 0.95]);
  ag.octa(0.17, [0.78, 2.6, 0.18], '#cdb6ff', [0.8, 1.5, 0.8]); ag.octa(0.15, [-0.72, 2.75, -0.2], '#cdb6ff', [0.8, 1.5, 0.8]);
  for (let k = 0; k < 4; k++) { const ang = Math.PI / 4 + (k * Math.PI) / 2; ag.octa(0.14, [Math.cos(ang) * 1.72, 1.78, Math.sin(ang) * 1.72], '#c4a8ff', [0.9, 1.4, 0.9]); }
  return {
    fountain: f.build(), fountainWater: fw.build(), stall: m.build(), stallLamps: ml.build(), chest: cb.build(), chestLid: cl.build(), chestGlow: cg.build(), altar: a.build(), altarGlow: ag.build(),
  };
}

/** Camp room props: tent + campfire in the middle, storage (crates + chest) on the left, training post (dummy + rack) right. */
function CampProps() {
  const geos = useMemo(() => {
    const b = new GB([0.75, 1.08]), g = new GB([1, 1]);
    // tent behind the fire
    b.cone(2.6, 3.2, 4, [0, 1.6, -3.2], '#c9a070', [0, Math.PI / 4, 0]); b.box(1.1, 1.6, 0.1, [0, 0.8, -1.4], '#5a3a1e');
    // campfire
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box(0.9, 0.18, 0.2, [Math.cos(a) * 0.35, 0.1, 1 + Math.sin(a) * 0.35], '#5a3a1e', [0, -a, 0.25]); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.ico(0.22, [Math.cos(a) * 0.85, 0.1, 1 + Math.sin(a) * 0.85], '#7a766e', [1, 0.6, 1], 0); }
    g.cone(0.4, 1.0, 6, [0, 0.6, 1], '#ffb040'); g.cone(0.22, 0.7, 5, [0.05, 0.55, 1.05], '#fff0a0');
    // storage (left): crate stack + chest
    const s = new GB([0.75, 1.08]);
    s.box(1.1, 1.1, 1.1, [0, 0.55, 0], '#8a6a44'); s.box(1.0, 1.0, 1.0, [1.15, 0.5, 0.2], '#7a5a38'); s.box(0.9, 0.9, 0.9, [0.5, 1.55, 0.1], '#9a7a50');
    s.box(1.4, 0.7, 0.9, [-1.1, 0.35, 0.9], '#6a4a2a'); s.box(1.45, 0.25, 0.95, [-1.1, 0.82, 0.9], '#8a6a3a'); s.box(0.2, 0.25, 0.1, [-1.1, 0.55, 1.36], '#e9b949');
    // training post (right): dummy + weapon rack
    const t = new GB([0.75, 1.08]);
    t.cyl(0.1, 0.1, 1.9, 6, [0, 0.95, 0], '#6a4a2a'); t.cyl(0.42, 0.36, 0.9, 8, [0, 1.25, 0], '#d9c08a'); t.sph(0.3, [0, 2.0, 0], '#d9c08a', 1, 7); t.box(1.5, 0.14, 0.14, [0, 1.5, 0], '#6a4a2a');
    t.box(0.12, 1.6, 0.12, [1.4, 0.8, -0.4], '#5a3a1e'); t.box(0.12, 1.6, 0.12, [2.6, 0.8, -0.4], '#5a3a1e'); t.box(1.4, 0.12, 0.12, [2.0, 1.4, -0.4], '#5a3a1e');
    for (let i = 0; i < 3; i++) t.box(0.08, 1.4, 0.08, [1.6 + i * 0.4, 0.75, -0.25], '#c4cad4', [0.25, 0, 0]);
    // (owner) blacksmith anvil (front left): stump + anvil + hammer
    const an = new GB([0.75, 1.08]);
    an.cyl(0.55, 0.65, 0.7, 10, [0, 0.35, 0], '#7a5a38'); an.box(1.1, 0.35, 0.55, [0, 0.95, 0], '#5c6470'); an.box(0.6, 0.3, 0.4, [0, 0.72, 0], '#4c535e');
    an.cone(0.22, 0.6, 6, [0.8, 0.98, 0], '#5c6470', [0, 0, -Math.PI / 2]); an.box(0.12, 0.08, 0.7, [-0.15, 1.18, 0.1], '#6a4a2a', [0, 0.5, 0]); an.box(0.28, 0.2, 0.2, [-0.3, 1.2, -0.18], '#8a929e');
    return { base: b.build(), fire: g.build(), storage: s.build(), train: t.build(), anvil: an.build() };
  }, []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.4, 1.0) }) }), []);
  const root = useRef<Group>(null!), fire = useRef<Mesh>(null!), st = useRef<Group>(null!), tr = useRef<Group>(null!), an = useRef<Group>(null!);
  // floating name tags (like the town buildings) so the storage and the training post read at a glance
  const trDot = useGameStore((s) => canTrainSkill(s));   // (owner) red dot: a skill can be learned / upgraded
  const labs = useMemo(() => ({ st: labelMaterial('Storage', '#ffe6a8', { size: 46, plate: 'mini' }), tr: labelMaterial('Training Post', '#ffe6a8', { size: 46, plate: 'mini', dot: trDot }), an: labelMaterial('Blacksmith', '#ffe6a8', { size: 46, plate: 'mini' }) }), [trDot]);
  useFrame(({ clock }) => {
    const on = world.room.active && world.room.plan.type === 'CAMP' && !world.room.plan.epilogue;
    if (root.current) root.current.visible = on;
    if (!on) return;
    root.current.position.set(campPos.fire[0], 0, campPos.fire[1] - 1);
    st.current.position.set(campPos.storage[0] - campPos.fire[0], 0, 0);
    tr.current.position.set(campPos.trainer[0] - campPos.fire[0], 0, 0);
    an.current.position.set(campPos.anvil[0] - campPos.fire[0], 0, campPos.anvil[1] - (campPos.fire[1] - 1));
    const k = 1 + Math.sin(clock.elapsedTime * 13) * 0.08 + Math.sin(clock.elapsedTime * 7.3) * 0.06;
    fire.current.scale.set(k, k * 1.1, k);
  });
  return (
    <group ref={root} visible={false}>
      <mesh geometry={geos.base} material={mats.lit} castShadow receiveShadow />
      <mesh ref={fire} geometry={geos.fire} material={mats.glow} position={[0, 0, 0]} />
      <pointLight position={[0, 1.4, 1]} color="#ffa040" intensity={8} distance={10} decay={1.6} />
      <group ref={st}><mesh geometry={geos.storage} material={mats.lit} castShadow receiveShadow />
        <sprite material={labs.st.mat} position={[0, 3.2, 0]} scale={[labs.st.aspect * 1.0, 1.0, 1]} /></group>
      <group ref={tr}><mesh geometry={geos.train} material={mats.lit} castShadow receiveShadow />
        <sprite material={labs.tr.mat} position={[0.8, 3.2, 0]} scale={[labs.tr.aspect * 1.0, 1.0, 1]} /></group>
      <group ref={an}><mesh geometry={geos.anvil} material={mats.lit} castShadow receiveShadow />
        <sprite material={labs.an.mat} position={[0, 2.4, 0]} scale={[labs.an.aspect * 1.0, 1.0, 1]} /></group>
    </group>
  );
}

function Stations() {
  const geos = useMemo(stationGeos, []);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.5, 1.5), transparent: true, opacity: 0.92 }),
  }), []);
  const root = useRef<Group>(null!);
  const fount = useRef<Group>(null!), stall = useRef<Group>(null!), chest = useRef<Group>(null!), altar = useRef<Group>(null!);
  const lid = useRef<Group>(null!), water = useRef<Mesh>(null!), chestGlow = useRef<Mesh>(null!), altarGlow = useRef<Mesh>(null!);
  const lidT = useRef(0);
  const xc = useRef<(Group | null)[]>([]), xl = useRef<(Group | null)[]>([]), xb = useRef<(Mesh | null)[]>([]), xlid = useRef([0, 0]);   // (owner) extra chests
  // (owner) a pillar of golden light over the treasure once the room is cleared, until it is opened
  const beam = useRef<Mesh>(null!);
  const beamRes = useMemo(() => ({
    geo: new CylinderGeometry(0.75, 1.25, 26, 18, 1, true).translate(0, 13, 0),
    mat: new MeshBasicMaterial({ color: new Color(1.6, 1.25, 0.55), transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => { beamRes.geo.dispose(); beamRes.mat.dispose(); }, [beamRes]);
  // (owner) "glow = the crystal glows": a soft additive halo hugging the crystal (no light column)
  const shrineHalo = useRef<Mesh>(null!);
  const haloRes = useMemo(() => ({
    geo: new SphereGeometry(0.95, 20, 14).scale(1, 1.55, 1).translate(0, 3.05, 0),
    mat: new MeshBasicMaterial({ color: new Color(0.9, 0.6, 1.6), transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  }), []);
  useEffect(() => () => { haloRes.geo.dispose(); haloRes.mat.dispose(); }, [haloRes]);
  useFrame(({ clock }, dt) => {
    const s = world.room.station, t = clock.elapsedTime;
    const on = world.room.active;
    fount.current.visible = on && s.kind === 'FOUNTAIN';
    stall.current.visible = on && s.kind === 'MERCHANT';
    chest.current.visible = on && s.kind === 'CHEST';
    altar.current.visible = on && s.kind === 'ALTAR';
    root.current.position.set(s.x, 0, s.z);
    if (fount.current.visible) {
      water.current.position.y = Math.sin(t * 2.2) * 0.04;
      const k = s.used ? 0.25 : 1;
      mats.glow.color.setScalar(1.5 * k + 0.2 * Math.sin(t * 3) * k);
      water.current.scale.y = s.used ? 0.2 : 1 + Math.sin(t * 5) * 0.08;
    } else if (chest.current.visible) {
      lidT.current += ((s.used ? 1 : 0) - lidT.current) * Math.min(1, dt * 6);
      lid.current.rotation.x = -lidT.current * 1.25;
      chestGlow.current.visible = s.ready && !s.used;
      beam.current.visible = s.ready && !s.used;
      if (beam.current.visible) { beamRes.mat.opacity = 0.26 + Math.sin(t * 2.6) * 0.07; beam.current.rotation.y = t * 0.4; }
      chestGlow.current.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }
    for (let i = 0; i < 2; i++) {   // extra chests (positions relative to the station)
      const g = xc.current[i], c = world.room.chests[i]; if (!g) continue;
      g.visible = on && (s.kind === 'CHEST' || !!c.pocket) && c.on;
      if (!g.visible) continue;
      g.position.set(c.x - s.x, 0, c.z - s.z);
      xlid.current[i] += ((c.used ? 1 : 0) - xlid.current[i]) * Math.min(1, dt * 6);
      if (xl.current[i]) xl.current[i]!.rotation.x = -xlid.current[i] * 1.25;
      /* (owner) a pocket chest stays dark (no light beam) until every monster of the room is dead */
      if (xb.current[i]) { xb.current[i]!.visible = (c.pocket ? world.director.phase !== 'FIGHT' : s.ready) && !c.used; xb.current[i]!.rotation.y = t * 0.4; }
    }
    if (altar.current.visible) {
      // (owner) the shrine crystal is dull until the challenge is won, then it lights up and spins
      // (owner) ...and from the moment it is activated: the challenge runs under a pulsing violet light column
      const done = world.room.shrineDone, active = world.room.shrineOn && !done, lit = done || active;
      altarGlow.current.material = lit ? mats.glow : mats.lit;
      altarGlow.current.position.y = lit ? Math.sin(t * (active ? 3 : 1.7)) * 0.15 : 0;
      altarGlow.current.rotation.y = lit ? t * (active ? 2.2 : 0.8) : 0.4;
      altarGlow.current.visible = true;
      shrineHalo.current.visible = lit;
      if (lit) { const pulse = active ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0.5; haloRes.mat.opacity = active ? 0.2 + pulse * 0.18 : 0.16; shrineHalo.current.position.y = altarGlow.current.position.y; }
    }
  });
  return (
    <group ref={root}>
      <group ref={fount}>
        <mesh geometry={geos.fountain} material={mats.lit} castShadow receiveShadow />
        <mesh ref={water} geometry={geos.fountainWater} material={mats.glow} />
      </group>
      <group ref={stall} rotation={[0, 0, 0]}>
        <mesh geometry={geos.stall} material={mats.lit} castShadow receiveShadow />
        <mesh geometry={geos.stallLamps} material={mats.glow} />
        <Suspense fallback={null}><MerchantNpc /></Suspense>
      </group>
      <group ref={chest}>
        <mesh geometry={geos.chest} material={mats.lit} castShadow receiveShadow />
        <group ref={lid} position={[0, 0.9, -0.65]}><mesh geometry={geos.chestLid} material={mats.lit} position={[0, 0, 0.65]} castShadow /></group>
        <mesh ref={chestGlow} geometry={geos.chestGlow} material={mats.glow} />
        <mesh ref={beam} geometry={beamRes.geo} material={beamRes.mat} visible={false} renderOrder={3} />
      </group>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => { xc.current[i] = g; }} visible={false}>
          <mesh geometry={geos.chest} material={mats.lit} castShadow receiveShadow />
          <group ref={(g) => { xl.current[i] = g; }} position={[0, 0.9, -0.65]}><mesh geometry={geos.chestLid} material={mats.lit} position={[0, 0, 0.65]} castShadow /></group>
          <mesh ref={(m) => { xb.current[i] = m; }} geometry={beamRes.geo} material={beamRes.mat} visible={false} renderOrder={3} />
        </group>
      ))}
      <group ref={altar} scale={1.7}>   {/* a big shrine */}
        <mesh geometry={geos.altar} material={mats.lit} castShadow receiveShadow />
        <mesh ref={altarGlow} geometry={geos.altarGlow} material={mats.glow} />
        <mesh ref={shrineHalo} geometry={haloRes.geo} material={haloRes.mat} visible={false} renderOrder={3} />
      </group>
    </group>
  );
}

// ----------------------------------------------------------------- portals ---
const ICONS: Record<string, React.ReactNode> = {
  card: <Sparkles size={18} />, coins: <Coins size={18} />, shard: <Diamond size={18} />, gear: <Sword size={18} />, heart: <Heart size={18} />,
  gem: <Gem size={18} />, fountain: <Droplets size={18} />, merchant: <Store size={18} />, chest: <Package size={18} />, shrine: <Flame size={18} />, boss: <Skull size={18} />,
};
const TYPE_I: Record<string, number> = { COMBAT: 1, ELITE: 2, MINIBOSS: 3, FOUNTAIN: 4, MERCHANT: 5, TREASURE: 6, SHRINE: 7, CRYSTAL: 6, BOSS: 8, CAMP: 9, DUEL: 10, GATEKEEPER: 11 };
const REW_I: Record<string, number> = { NONE: 0, CARD: 1, GOLD: 2, SHARDS: 3, ITEM: 4, HEAL: 5, GEMS: 6 };

function PortalLabel({ i }: { i: number }) {
  const sig = useWorldCounter(() => { const p = world.room.portals[i]; return p.active ? TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + 1000 * world.room.version + (p.big ? 500 : 0) + (p.plan.shortcut ? 250 : 0) : 0; });
  if (!sig) return null;
  const p = world.room.portals[i];
  const nb = BIOMES[(world.room.biome + 1) % BIOMES.length];
  const l = p.big ? { title: 'Next biome', sub: nb.name, icon: 'boss', color: '#f2c14e' } : portalLabel(p.plan, world.room.biome);
  return (
    <Html position={[0, 5.6, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="portal-tag" style={{ ['--pc' as any]: l.color }} data-testid={`portal-${i}`}>
        <span className="pi">{ICONS[l.icon]}</span>
        <span className="pt">{l.title}{l.sub && <small>{l.sub}</small>}</span>
      </div>
    </Html>
  );
}

// Exit portals (owner): an ancient ruined stone arch that rises out of the ground when the room is cleared, filled with
// a swirling vortex in the portal's reward colour, glowing runes, a ground sigil and sparks drifting up through it.
const VORTEX_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VORTEX_FS = `
uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 c = vUv - vec2(0.5, 0.42); c.x *= 1.25;
  float r = length(c), a = atan(c.y, c.x);
  float sw = a + 3.2 / (r + 0.18) - uTime * 1.6;                       // spiral swirl, tighter toward the eye
  float n = noise(vec2(sw * 1.6, r * 6.0 - uTime * 0.8)) * 0.65 + noise(vec2(sw * 3.4, r * 14.0 + uTime)) * 0.35;
  float arms = 0.5 + 0.5 * sin(sw * 3.0 + n * 3.0);
  float core = smoothstep(0.32, 0.0, r);
  vec3 col = mix(uColor * 0.55, uColor * 1.6, arms * n) + vec3(1.0, 0.97, 0.9) * core * 1.4;
  float edge = smoothstep(0.62, 0.38, r);
  float alpha = (0.55 + 0.45 * arms * n + core) * edge * uAlpha;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;
/** The arch opening (portal plane): a rectangle with a round top, x -1.45..1.45, y 0.25..3.0 + a semicircle to 4.45. */
function archOpening(): ShapeGeometry {
  const sh = new Shape();
  sh.moveTo(-1.45, 0.25); sh.lineTo(1.45, 0.25); sh.lineTo(1.45, 3.0);
  sh.absarc(0, 3.0, 1.45, 0, Math.PI, false); sh.lineTo(-1.45, 0.25);
  const g = new ShapeGeometry(sh, 24);
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + 1.6) / 3.2; uv[i * 2 + 1] = pos.getY(i) / 4.6; }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}
/** Weathered stone arch: stacked irregular pillar blocks, a ring of wedge stones (one fallen), a stepped round dais,
 *  moss, rubble; `runes` gets the glowing rune inlays (tinted per portal). */
function buildRuinArch(): { stone: BufferGeometry; runes: BufferGeometry } {
  const b = new GB([0.72, 1.08]), g = new GB([1, 1]), rnd = mulberry32(911);
  const ST = ['#8c8a92', '#7c7a84', '#9a97a2', '#85838c'], MOSS = '#5f8a3e';
  // dais: two worn round steps + cracked flagstones
  b.cyl(2.85, 3.0, 0.28, 14, [0, 0.14, 0], '#6f6c76'); b.cyl(2.35, 2.5, 0.22, 14, [0, 0.38, 0], '#7d7a85');
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + rnd() * 0.4; b.box(0.7 + rnd() * 0.4, 0.06, 0.5 + rnd() * 0.3, [Math.cos(a) * 1.6, 0.5, Math.sin(a) * 1.6], ST[k % 4], [0, a, 0]); }
  // pillars: 4 stacked blocks each, slightly offset / tilted; the left one is broken lower and leans
  for (const sx of [-1, 1]) {
    let y = 0.5;
    for (let k = 0; k < 4; k++) {
      const h = 0.62 + rnd() * 0.12, w = 0.78 - k * 0.03 + rnd() * 0.06;
      b.box(w, h, 0.8 + rnd() * 0.08, [sx * 1.95 + (rnd() - 0.5) * 0.08, y + h / 2, (rnd() - 0.5) * 0.06], ST[(k + (sx > 0 ? 1 : 0)) % 4], [0, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.05]);
      if (rnd() < 0.55) b.box(w * 0.7, 0.07, 0.5, [sx * 1.95, y + h + 0.02, 0.1], MOSS);   // moss on the ledge
      // rune inlay on the front face
      g.box(0.08, h * 0.5, 0.04, [sx * 1.95, y + h / 2, 0.43], '#ffffff'); g.box(0.26, 0.05, 0.04, [sx * 1.95, y + h * 0.62, 0.43], '#ffffff');
      y += h;
    }
    b.box(1.0, 0.24, 1.0, [sx * 1.95, 0.62, 0], '#6a6772');   // plinth
  }
  // arch: 9 wedge stones on a radius-1.95 half ring centred at y 3.0 (the 7th has fallen to the ground)
  for (let k = 0; k < 9; k++) {
    const a = Math.PI - (k + 0.5) * (Math.PI / 9), cx = Math.cos(a) * 1.95, cy = 3.0 + Math.sin(a) * 1.95;
    if (k === 6) { b.box(0.72, 0.6, 0.82, [1.9, 0.78, 1.25], ST[k % 4], [0.4, 0.7, 0.3]); continue; }
    b.box(0.72, 0.62, 0.84, [cx, cy, 0], ST[k % 4], [0, 0, a - Math.PI / 2]);
    if (k === 4) { b.box(0.5, 0.5, 0.9, [cx, cy + 0.05, 0], '#a8a4b0', [0, 0, a - Math.PI / 2]); g.octa(0.18, [cx, cy, 0.46], '#ffffff'); }   // keystone + gem
    else g.box(0.18, 0.06, 0.04, [cx * 0.86, 3.0 + Math.sin(a) * 1.68, 0.43], '#ffffff', [0, 0, a]);
  }
  // rubble + moss tufts round the base
  for (let k = 0; k < 9; k++) { const a = rnd() * Math.PI * 2, d = 2.6 + rnd() * 1.1; b.ico(0.18 + rnd() * 0.22, [Math.cos(a) * d, 0.12, Math.sin(a) * d], ST[k % 4], [1, 0.7, 1], 0, [rnd(), rnd(), rnd()]); }
  for (let k = 0; k < 6; k++) { const a = rnd() * Math.PI * 2; b.sph(0.2 + rnd() * 0.15, [Math.cos(a) * 2.7, 0.3, Math.sin(a) * 2.7], MOSS, [1.3, 0.5, 1.3], 5); }
  return { stone: b.build(), runes: g.build() };
}

const RISE = 1.25;   // seconds for the arch to rise out of the ground
function Portals() {
  const geos = useMemo(() => {
    const { stone, runes } = buildRuinArch();
    return { stone, runes, opening: archOpening(), sigil: new RingGeometry(2.0, 2.9, 40).rotateX(-Math.PI / 2), inner: new CircleGeometry(2.0, 32).rotateX(-Math.PI / 2) };
  }, []);
  const groups = useRef<(Group | null)[]>([]), lifts = useRef<(Group | null)[]>([]);
  const runeMats = useMemo(() => [0, 1, 2, 3].map(() => new MeshBasicMaterial({ toneMapped: false, color: new Color(), vertexColors: true })), []);
  const vortexMats = useMemo(() => [0, 1, 2, 3].map(() => new ShaderMaterial({ vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, uniforms: { uTime: { value: 0 }, uColor: { value: new Color() }, uAlpha: { value: 0 } } })), []);
  const sigilMats = useMemo(() => [0, 1, 2, 3].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, color: new Color() })), []);
  const innerMats = useMemo(() => [0, 1, 2, 3].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, color: new Color() })), []);
  const lit = useMemo(() => litMat({ roughness: 0.95 }), []);
  const last = useRef<number[]>([-1, -1, -1, -1]);
  const cols = useMemo(() => [0, 1, 2, 3].map(() => new Color()), []);
  const sigils = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, paused = useGameStore.getState().status === GameStatus.PAUSED;
    for (let i = 0; i < 4; i++) {
      const g = groups.current[i], L = lifts.current[i]; if (!g || !L) continue;
      const p = world.room.portals[i];
      g.visible = p.active || p.pre === true;
      if (!p.active) {   // (HALLS) a dormant arch: only the dim stone + runes stand there (no vortex, ring, label)
        last.current[i] = -1;
        if (p.pre) {
          g.position.set(p.x, 0, p.z); g.scale.setScalar(1);
          const L0 = lifts.current[i]; if (L0) { L0.position.y = 0; L0.rotation.z = 0; }
          runeMats[i].color.setRGB(0.22, 0.22, 0.24);
          vortexMats[i].uniforms.uAlpha.value = 0; sigilMats[i].opacity = 0; innerMats[i].opacity = 0;
        }
        continue;
      }
      const sc = p.big ? 2.1 : 1;
      g.position.set(p.x, 0, p.z); g.scale.setScalar(sc);
      const key = TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + (p.big ? 500 : 0) + (p.plan.shortcut ? 250 : 0);
      if (key !== last.current[i]) {
        last.current[i] = key;
        cols[i].set(p.big ? '#f2c14e' : portalLabel(p.plan, world.room.biome).color);
        runeMats[i].color.copy(cols[i]).multiplyScalar(2.0); vortexMats[i].uniforms.uColor.value.copy(cols[i]); sigilMats[i].color.copy(cols[i]); innerMats[i].color.copy(cols[i]);
      }
      // rise out of the ground (ease-out with a little settle), then the vortex ignites
      const pre = p.pre === true, tt = pre ? p.t + RISE * 0.8 : p.t;   // (an arch that already stood there only ignites)
      const k = pre ? 1 : Math.min(1, p.t / RISE), e = 1 - Math.pow(1 - k, 3), settle = pre || k < 1 ? 0 : Math.max(0, 0.06 * Math.sin(Math.min(1, (p.t - RISE) / 0.35) * Math.PI));
      L.position.y = -4.9 * (1 - e) - settle; L.rotation.z = (1 - e) * 0.05 * Math.sin(t * 40);   // (tremble while rising)
      const ign = Math.min(1, Math.max(0, (tt - RISE * 0.8) / 0.6));
      vortexMats[i].uniforms.uTime.value = t + i * 3; vortexMats[i].uniforms.uAlpha.value = ign * (0.85 + 0.15 * Math.sin(t * 2.3 + i));
      runeMats[i].color.copy(cols[i]).multiplyScalar(0.4 + 1.8 * ign * (0.8 + 0.2 * Math.sin(t * 3 + i)));
      sigilMats[i].opacity = (0.25 + 0.3 * ign) * (0.8 + 0.2 * Math.sin(t * 2.5 + i)); innerMats[i].opacity = 0.08 + 0.14 * ign;
      const sg = sigils.current[i]; if (sg) sg.rotation.y = t * 0.35 + i;
      if (paused || dt <= 0) continue;
      const cr = cols[i].r, cg = cols[i].g, cb = cols[i].b;
      if (k < 1) {   // dust + rubble bursting up round the dais while it rises
        for (let n = 0; n < 2; n++) { const a = Math.random() * Math.PI * 2, d = (2.4 + Math.random() * 0.9) * sc;
          FX.norm.emit(p.x + Math.cos(a) * d, 0.2, p.z + Math.sin(a) * d, Math.cos(a) * 1.2, 1.5 + Math.random() * 2, Math.sin(a) * 1.2, 0.7 + Math.random() * 0.5, 0.6 * sc, 1.6 * sc, 0.62, 0.58, 0.52, 0.55, CELL.SMOKE); }
      } else if (Math.random() < dt * 14 * ign) {   // sparks drifting up through the opening + motes swirling in
        const x = (Math.random() - 0.5) * 2.4 * sc, y = (0.4 + Math.random() * 3.2) * sc;
        FX.add.emit(p.x + x, y, p.z + (Math.random() - 0.5) * 0.4, -x * 0.25, 1.4 + Math.random() * 1.4, 0, 0.9 + Math.random() * 0.6, 0.22 * sc, 0.03, cr * 2.2, cg * 2.2, cb * 2.2, 0.95, CELL.STAR, 0, 0.3, Math.random() * 3, 3);
      }
    }
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <group ref={(g) => { lifts.current[i] = g; }}>
            <mesh geometry={geos.stone} material={lit} castShadow receiveShadow />
            <mesh geometry={geos.runes} material={runeMats[i]} />
            <mesh geometry={geos.opening} material={vortexMats[i]} position={[0, 0.3, 0]} renderOrder={4} />
          </group>
          <mesh ref={(m) => { sigils.current[i] = m; }} geometry={geos.sigil} material={sigilMats[i]} position={[0, 0.06, 0]} renderOrder={3} />
          <mesh geometry={geos.inner} material={innerMats[i]} position={[0, 0.055, 0]} renderOrder={3} />
          <PortalLabel i={i} />
        </group>
      ))}
    </>
  );
}


/** The travelling merchant: a KayKit character idling behind the stall counter + a name tag above the awning. */
const MERCHANT_TAG = labelMaterial('Travelling Merchant', '#f1e2b8', { size: 56 });
function MerchantNpc() {
  const ch = useCharacterInstance('ROGUE');
  const clips = useClips();
  const mixer = useRef<AnimationMixer | null>(null);
  useEffect(() => {
    const tint = new Color('#ffe2b8');
    ch.mats.forEach((mt: any) => { if (mt.color) mt.color.copy(tint); });
    const m = new AnimationMixer(ch.root); const idle = clips['Idle_B'] || clips['Idle_A']; if (idle) m.clipAction(idle).play();
    mixer.current = m;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); mixer.current = null; };
  }, [ch, clips]);
  useFrame((_, dt) => { if (world.room.station.kind === 'MERCHANT') mixer.current?.update(Math.min(dt, 0.05)); });
  return (
    <group position={[0, 0, -0.7]}>
      <primitive object={ch.root} />
      <sprite material={MERCHANT_TAG.mat} position={[0, 4.4, 0.6]} scale={[MERCHANT_TAG.aspect * 0.8, 0.8, 1]} renderOrder={6} />
    </group>
  );
}

/** (owner) A scrolling chevron trail ">>>>" from the hero to every open exit portal, in the portal's colour (dark outline). */
const TRAIL_PER = 34, TRAIL_STEP = 1.3;
const _tm = new Matrix4(), _tq = new Quaternion(), _te = new Euler(), _tp = new Vector3(), _ts = new Vector3(1, 1, 1);
/** (owner) HALLS / water rooms: the trail follows the walkable route (engine/roomNav flow field), cached per portal and rebuilt only when the hero enters a new nav cell. */
const GUIDE_PTS = 160;
const gPath = [0, 1, 2, 3].map(() => new Float32Array(GUIDE_PTS * 2)), gN = [0, 0, 0, 0], gKey = [-2, -2, -2, -2], gPKey = [-1, -1, -1, -1];
function PortalGuides() {
  const geo = useMemo(() => ({ chev: thinArrowGeo(0.5, 0.5, 0, 0.22), sh: thinArrowGeo(0.58, 0.58, 0, 0.42).translate(0.06, -0.01, -0.1) }), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false, side: DoubleSide }), []);
  const shMat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false, side: DoubleSide, color: '#1a1410' }), []);
  const N = TRAIL_PER * 4;
  const trail = useRef<InstancedMesh>(null!), sh = useRef<InstancedMesh>(null!);
  const keys = useRef([-1, -1, -1, -1]);
  const cols = useMemo(() => [0, 1, 2, 3].map(() => new Color()), []);
  useFrame(({ clock }) => {
    const r = world.room, p = world.player.pos, tr = trail.current, sm = sh.current;
    if (!tr || !sm) return;
    let n = 0;
    const scroll = (clock.elapsedTime * 1.6) % TRAIL_STEP;
    const goal = navFlowGoal();
    for (let i = 0; i < 4; i++) {
      const po = r.portals[i];
      if (!po.active || r.fade >= 0.5) { gKey[i] = -2; continue; }
      const dx = po.x - p.x, dz = po.z - p.z, d = Math.hypot(dx, dz);
      if (d < 5) continue;
      const key = TYPE_I[po.plan.type] * 10 + REW_I[po.plan.reward] + (po.plan.shortcut ? 250 : 0);
      if (key !== keys.current[i]) { keys.current[i] = key; cols[i].set(portalLabel(po.plan, r.biome).color).offsetHSL(0, 0.3, 0.06).multiplyScalar(1.35); }   // vivid: more saturated + brighter (not tone-mapped)
      // route: straight when the way is open, else the cached walkable path (rebuilt only when the hero's nav cell or the portal changed)
      let np = 0;
      if (goal >= 0 && !navClear(p.x, p.z, po.x, po.z)) {
        const pk = (po.x * 7 + po.z * 13) | 0;
        if (gKey[i] !== goal || gPKey[i] !== pk) { gKey[i] = goal; gPKey[i] = pk; gN[i] = navGuide(po.x, po.z, gPath[i]); }
        np = gN[i];
      }
      let c = 0;
      if (np > 1) {
        const P = gPath[i];
        let ax = p.x, az = p.z, seg = 0, next = 1.6 + scroll, acc = 0;
        // walk the polyline hero -> waypoints, dropping a chevron every TRAIL_STEP, aligned to the segment
        while (seg < np && c < TRAIL_PER) {
          const bx = P[seg * 2], bz = P[seg * 2 + 1], sx = bx - ax, sz = bz - az, sl = Math.hypot(sx, sz);
          if (sl < 1e-3) { seg++; continue; }
          while (acc + sl >= next && c < TRAIL_PER) {
            const t = (next - acc) / sl, last = seg >= np - 1 && Math.hypot(bx - (ax + sx * t), bz - (az + sz * t)) < 3;
            if (last) { seg = np; break; }
            const f = Math.min(1, c / 3 + 0.35);
            _te.set(0, Math.atan2(sx, sz), 0); _tq.setFromEuler(_te);
            _tp.set(ax + sx * t, 0.25, az + sz * t); _ts.set(f, 1, f); _tm.compose(_tp, _tq, _ts);
            tr.setMatrixAt(n, _tm); sm.setMatrixAt(n, _tm); tr.setColorAt(n, cols[i]); n++; c++;
            next += TRAIL_STEP;
          }
          acc += sl; ax = bx; az = bz; seg++;
        }
        continue;
      }
      _te.set(0, Math.atan2(dx, dz), 0); _tq.setFromEuler(_te);
      for (let u = 1.6 + scroll; u < d - 3 && c < TRAIL_PER; u += TRAIL_STEP, c++) {
        const f = Math.min(1, c / 3 + 0.35);
        _tp.set(p.x + (dx / d) * u, 0.25, p.z + (dz / d) * u); _ts.set(f, 1, f); _tm.compose(_tp, _tq, _ts);
        tr.setMatrixAt(n, _tm); sm.setMatrixAt(n, _tm); tr.setColorAt(n, cols[i]); n++;
      }
    }
    tr.count = sm.count = n; tr.visible = sm.visible = n > 0;
    if (n > 0) { tr.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true; if (tr.instanceColor) tr.instanceColor.needsUpdate = true; }
  });
  return (
    <>
      <instancedMesh ref={sh} args={[geo.sh, shMat, N]} renderOrder={5} frustumCulled={false} visible={false} />
      <instancedMesh ref={trail} args={[geo.chev, mat, N]} renderOrder={6} frustumCulled={false} visible={false} />
    </>
  );
}

// ----------------------------------------------------------- spawn markers ---
function SpawnMarkers() {
  const MAX = world.room.markers.length;
  const { fill, ring, mf, mr } = useMemo(() => {
    const mkMat = (o: number) => new MeshBasicMaterial({ transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, });
    const mf = mkMat(0.42), mr = mkMat(0.95);
    const fill = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), mf, MAX);
    const ring = new InstancedMesh(new RingGeometry(0.86, 1, 24).rotateX(-Math.PI / 2), mr, MAX);
    for (const m of [fill, ring]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = 3; m.count = 0; }
    return { fill, ring, mf, mr };
  }, [MAX]);
  const o = useMemo(() => new Object3D(), []);
  const c1 = useMemo(() => new Color('#ff2e22'), []), c2 = useMemo(() => new Color('#b04dff'), []), c3 = useMemo(() => new Color('#ff8a00'), []), cc = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const ms = world.room.markers;
    let n = 0;
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 14) * 0.1;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (!m.active) continue;
      const base = m.tag === 2 ? 4.2 : m.tag === 1 ? 2.4 : Math.max(0.9, ENEMY_DEFS[m.kind].radius * (m.elite ? 1.9 : 1.35));
      const k = Math.min(1, m.t / m.dur);
      o.position.set(m.x, 0.06, m.z); o.rotation.set(0, 0, 0);
      o.scale.set(base * (0.25 + 0.75 * k), 1, base * (0.25 + 0.75 * k));
      o.updateMatrix(); fill.setMatrixAt(n, o.matrix);
      o.scale.set(base * pulse, 1, base * pulse);
      o.updateMatrix(); ring.setMatrixAt(n, o.matrix);
      cc.copy(m.tag > 0 ? c3 : m.elite ? c2 : c1);
      fill.setColorAt(n, cc); ring.setColorAt(n, cc);
      n++;
    }
    commitInst(fill, n); commitInst(ring, n);
  });
  void mf; void mr;
  return (<><primitive object={fill} /><primitive object={ring} /></>);
}

// -------------------------------------------------------------------- room ---
export function Room({ q }: { q: QualityCfg }) {
  const ver = useWorldCounter(() => world.room.version);
  const r = world.room;
  const def = biomeOf(r.biome);
  const tower = runInfo.mode === 'TOWER' && !showcase.on;   // (owner) the showcase fights in its biome (Frostpeak), not the tower arena
  const isCamp = r.active && !tower && r.plan.type === 'CAMP' && campOn();   // the biome camp: a hand-authored transition path (render/CampPath.tsx)
  const campSea = isCamp && camp.cur ? (camp.cur.layout.edge.some((e) => e[1] === 'sea') ? 'sea' : camp.cur.layout.edge.some((e) => e[1] === 'lava') ? 'lava' : null) : null;
  return (
    <>
      {r.active && (tower ? <TowerFloor key={ver} R={r.radius} /> : isCamp ? <CampGround key={ver} ver={ver} /> : <RoomGround key={ver} biome={r.biome} R={r.radius} seed={r.seed} boss={r.plan.type === 'BOSS'} index={r.index} />)}
      {r.active && !tower && !isCamp && shape.kind === 'HALLS' && (def.style === 'MARBLE'
        ? <HallsMarble key={'hm' + ver} seed={r.seed} shadows={q.shadowMap > 0} />
        : <HallsBorder key={'hb' + ver} biome={r.biome} seed={r.seed} v={def.variants ? Math.min(def.variants.length - 1, Math.floor(r.index / 5)) : 0} tint={variantOf(def, r.index)?.propTint ?? def.propTint} shadows={q.shadowMap > 0} />)}
      {r.active && isCamp && <><CampPieces key={'cp' + ver} ver={ver} /><CampShards key={'cs' + ver} ver={ver} /></>}
      {r.active && !tower && <RoomWater />}
      {r.active && !tower && !isCamp && (shape.kind !== 'HALLS' ? (def.lavaSea || def.waterSea) : def.waterSea) && <LavaSea key={'lava' + ver} water={!!def.waterSea} />}
      {r.active && !tower && !isCamp && shape.kind === 'HALLS' && def.waterSea && <HallsBridges key={'hbr' + ver} />}
      {r.active && isCamp && campSea && <LavaSea key={'csea' + ver} water={campSea === 'sea'} />}
      <Suspense fallback={null}><Props q={q} tint={tower ? '#c4c8d6' : isCamp ? '#ffffff' : variantOf(def, r.index)?.propTint ?? def.propTint} qt={r.active && !tower ? { biome: isCamp && camp.cur ? (BIOMES[camp.cur.layout.to]?.name ?? def.name) : def.name, v: isCamp ? 0 : def.variants ? Math.min(def.variants.length - 1, Math.floor(r.index / 5)) : 0, seed: r.seed, boss: r.plan.type === 'BOSS', camp: isCamp } : undefined} /></Suspense>
      <Stations />
      <CampProps />
      {!tower && <Suspense fallback={null}><Wanderer /><AllyActor /></Suspense>}
      <Finale />
      <SpecialRooms q={q} />
      <Portals />
      <PortalGuides />
      <SpawnMarkers />
    </>
  );
}
