// The run room: biome-tinted ground disc, walls ring (via Props: the same instanced scenery path as the town), the room's
// single station (fountain / merchant / chest / altar), exit portals with reward labels and telegraphed spawn markers.
// Only the current room exists; it is rebuilt when world.room.version changes (during the black fade). No per-frame allocations.
import { campPos } from '../engine/systems/director';
import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, CircleGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
  CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, RingGeometry, SRGBColorSpace,
} from 'three';
import { Stars } from '@react-three/drei';
import { runInfo } from '../engine/runMods';
import { Coins, Diamond, Droplets, Flame, Gem, Heart, Package, Skull, Sparkles, Store, Sword } from 'lucide-react';
import { world } from '../engine/world';
import { shape, shapeLimit } from '../engine/roomShape';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { BIOMES, biomeOf, portalLabel, variantOf, type GroundStyle } from '../engine/roomDefs';
import { feat, inLiquid, riverD, hwAt, riverS } from '../engine/roomFeatures';
import { RoomWater, LavaSea } from './RoomWater';
import { GB, fbm, litMat, mulberry32, vnoise } from './util';
import { useWorldCounter } from './hooks';
import { Props } from './Props';
import { labelMaterial } from './label';
import type { QualityCfg } from './quality';

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new Color(), _c2 = new Color(), _c3 = new Color(), _c4 = new Color();

// ------------------------------------------------------------------ ground ---
/** Tileable detail textures per ground style (built once each): [albedo multiplier, emissive glow or null]. */
const detailTex: Partial<Record<GroundStyle, [CanvasTexture, CanvasTexture | null]>> = {};
function groundDetail(style: GroundStyle): [CanvasTexture, CanvasTexture | null] {
  const hit = detailTex[style]; if (hit) return hit;
  const N = 512, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const c = mk(), g = c.getContext('2d')!;
  const rnd = mulberry32(0xd37a1 + style.length * 977);
  let glowC: HTMLCanvasElement | null = null;
  const speck = (n: number, a: number, b: number, light: number) => { for (let i = 0; i < n; i++) { const v = a + rnd() * (b - a); g.fillStyle = rnd() < light ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`; const s = 1 + rnd() * 2.5; g.fillRect(rnd() * N, rnd() * N, s, s); } };
  /** Jittered-grid crack network (wraps seamlessly). */
  const cracks = (ctx: CanvasRenderingContext2D, cells: number, style2: string, w: number) => {
    const P: [number, number][][] = [];
    for (let y = 0; y < cells; y++) { P.push([]); for (let x = 0; x < cells; x++) P[y].push([(x + 0.2 + rnd() * 0.6) * (N / cells), (y + 0.2 + rnd() * 0.6) * (N / cells)]); }
    ctx.strokeStyle = style2; ctx.lineWidth = w; ctx.lineCap = 'round';
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const a = P[y][x];
      for (const [dx, dy] of [[1, 0], [0, 1], [1, (x + y) % 2 ? 1 : -1]]) {
        const bx = (x + dx + cells) % cells, by = (y + dy + cells) % cells;
        const b = P[by][bx];
        const tx = b[0] + (x + dx >= cells ? N : x + dx < 0 ? -N : 0), ty = b[1] + (y + dy >= cells ? N : y + dy < 0 ? -N : 0);
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
          ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy);
          const mx = (a[0] + tx) / 2 + (rnd() - 0.5) * 10, my = (a[1] + ty) / 2 + (rnd() - 0.5) * 10;
          ctx.lineTo(mx + ox, my + oy); ctx.lineTo(tx + ox, ty + oy); ctx.stroke();
        }
      }
    }
  };
  switch (style) {
    case 'MARBLE': {   // castle flagstones: staggered rows of worn grey blocks with dark mortar, chips and cracks
      g.fillStyle = 'rgb(58,52,46)'; g.fillRect(0, 0, N, N);
      const rows = 4, h = N / rows;
      for (let r = 0; r < rows; r++) {
        let px = -rnd() * 80;
        while (px < N) {
          const w = 90 + rnd() * 80, v = 150 + Math.round(rnd() * 40), warm = Math.round(rnd() * 10);
          for (const ox of [0, N, -N]) {
            const sx = px + ox + 3, sy = r * h + 3, sw = w - 6, sh = h - 6;
            g.fillStyle = `rgb(${v + warm},${v + warm * 0.5},${v - 8})`; g.fillRect(sx, sy, sw, sh);
            const gr = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
            gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
            g.fillStyle = gr; g.fillRect(sx, sy, sw, sh);
          }
          px += w;
        }
      }
      g.strokeStyle = 'rgba(40,34,28,0.55)'; g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { g.beginPath(); let x = rnd() * N, y = rnd() * N; g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
      speck(1500, 0.03, 0.08, 0.5);
      break;
    }
    case 'SAND': {   // grain + tiny wind ripples
      g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < N; y += 6) { g.strokeStyle = `rgba(150,110,60,${0.06 + rnd() * 0.05})`; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= N; x += 16) g.lineTo(x, y + Math.sin((x / N) * Math.PI * 4 + y * 0.05) * 3); g.stroke(); }
      speck(5000, 0.05, 0.14, 0.45);
      break;
    }
    case 'SNOW': g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, N, N); speck(3000, 0.04, 0.1, 0.4); for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(rnd() * N, rnd() * N, 1.5, 1.5); } break;
    case 'BASALT': {   // plain volcanic rock: grainy plates with dark seams (no glowing cracks)
      g.fillStyle = '#d4ccc6'; g.fillRect(0, 0, N, N); speck(6000, 0.06, 0.2, 0.35);
      cracks(g, 4, 'rgba(40,24,16,0.55)', 2.5);
      break;
    }
    case 'VOID': {   // faint hex-ish rune grid; the lines glow violet
      g.fillStyle = '#e8e4f0'; g.fillRect(0, 0, N, N); speck(2500, 0.05, 0.14, 0.4);
      glowC = mk(); const gg = glowC.getContext('2d')!; gg.fillStyle = '#000'; gg.fillRect(0, 0, N, N);
      gg.strokeStyle = 'rgba(150,100,255,0.55)'; gg.lineWidth = 2.2;
      const st = N / 4;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = (x + (y % 2) * 0.5) * st, cy = y * st + st / 2; gg.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; gg.lineTo(cx + Math.cos(a) * st * 0.42, cy + Math.sin(a) * st * 0.42); } gg.stroke(); }
      for (let i = 0; i < 160; i++) { gg.fillStyle = `rgba(200,170,255,${0.3 + rnd() * 0.6})`; gg.fillRect(rnd() * N, rnd() * N, 1.5, 1.5); }
      break;
    }
    default: {   // grass: blade speckle, a few clover dots
      g.fillStyle = '#ececec'; g.fillRect(0, 0, N, N);
      for (let i = 0; i < 6000; i++) { const x = rnd() * N, y = rnd() * N; g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.08 + rnd() * 0.1})` : `rgba(0,30,0,${0.06 + rnd() * 0.1})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4); g.stroke(); }
    }
  }
  if (style === 'BASALT' && glowC) {
    // glow layer = the crack mask of the albedo, hot orange on black
    const gg = glowC.getContext('2d')!;
    const img = g.getImageData(0, 0, N, N), out = gg.createImageData(N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      const k = img.data[i] < 70 ? 1 : 0;
      out.data[i] = 255 * k; out.data[i + 1] = 120 * k; out.data[i + 2] = 30 * k; out.data[i + 3] = 255;
    }
    gg.putImageData(out, 0, 0);
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4;
  let e: CanvasTexture | null = null;
  if (glowC) { e = new CanvasTexture(glowC); e.colorSpace = SRGBColorSpace; e.wrapS = e.wrapT = RepeatWrapping; }
  detailTex[style] = [t, e];
  return [t, e];
}
/** World units covered by one repeat of the detail texture. */
/** How far the floor sinks under rivers / lakes (the liquid surface sits a little above the bed). */
export const SINK = 2.4;
const DETAIL_PERIOD: Record<GroundStyle, number> = { GRASS: 7, MARBLE: 6, SAND: 9, SNOW: 8, BASALT: 10, VOID: 9 };

/** Distance outside the nearest liquid edge (negative = inside the liquid). */
function liquidEdge(x: number, z: number): number {
  let e = 1e9;
  for (let i = 0; i < feat.nLakes; i++) e = Math.min(e, Math.hypot(x - feat.lx[i], z - feat.lz[i]) - feat.lr[i]);
  if (feat.river) e = Math.min(e, Math.abs(riverD(x, z)) - hwAt(riverS(x, z)));
  return e;
}

function RoomGround({ biome, R, seed, boss, index }: { biome: number; R: number; seed: number; boss: boolean; index: number }) {
  const { geo, mat, tufts, slabs } = useMemo(() => {
    const def = biomeOf(biome);
    const vr = variantOf(def, index);
    const style = def.style;
    const S = 2 * (shape.maxR + 44), seg = feat.river || feat.nLakes > 0 ? 260 : 160;   // finer grid where banks are carved
    const g = new PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const ground = vr?.ground ?? def.ground, patch = vr?.patch ?? def.patch;
    const g0 = _c.set(ground[0]), g1 = _c2.set(ground[1]), edge = _c3.set(vr?.edge ?? def.edge), rim = _c4.set(style === 'MARBLE' ? '#9a8f7c' : style === 'SAND' ? '#b08a58' : '#8c877c').lerp(g0, 0.4);
    const so = (seed % 997) * 0.37;
    const lush = new Color(patch[0]), dry = new Color(patch[1]), dirt = new Color(patch[2]);
    const stone = new Color(def.stone), stoneC = new Color();
    const bank = new Color(style === 'BASALT' ? '#1a0e0a' : style === 'SAND' ? (feat.liquid === 'CHASM' ? '#a87440' : '#8a7a4a') : style === 'SNOW' ? '#9ab4c8' : style === 'MARBLE' ? '#8a8272' : style === 'VOID' ? '#160f2a' : '#4a5a2a');
    const hasLiquid = feat.river || feat.nLakes > 0;
    const flatLava = feat.liquid === 'LAVA' && !feat.river;   // lava pools lie flat on the rock (only lava rivers cut channels)
    const lavaSea = !!def.lavaSea;
    const path = !boss && (seed % 5) !== 0 && style !== 'MARBLE' && style !== 'VOID';
    const out = new Color(), tmpC = new Color();
    const duneA = (seed % 360) * 0.0174, dux = Math.cos(duneA), duz = Math.sin(duneA);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // signed distance-ish to the walkable outline (0 at the old disc edge R), so rim / outside tint follow the shape
      const u = r - (shapeLimit(x, z) - 1);
      const n1 = fbm(x * 0.06 + so, z * 0.06 - so, 3), n2 = vnoise(x * 0.9 + so, z * 0.9);
      out.copy(g0).lerp(g1, sstep(0.3, 0.72, n1)).multiplyScalar(0.9 + n2 * 0.2);
      out.lerp(g1, sstep(0.62, 0.78, fbm(x * 0.14 - so, z * 0.14 + so, 2)) * 0.35);
      const zA = fbm(x * 0.055 - so * 1.7, z * 0.055 + so, 3), zB = fbm(x * 0.07 + so * 2.3, z * 0.07 - so * 0.6, 3);
      if (style === 'MARBLE') {
        // slab-to-slab tone (3-unit slabs), worn darker lanes, roots / moss creeping in from the cracks
        const tx = Math.floor(x / 3), tz = Math.floor(z / 3);
        out.multiplyScalar(0.9 + vnoise(tx * 3.7 + so, tz * 5.3) * 0.16);
        out.lerp(dry, sstep(0.55, 0.7, zB) * 0.45);
        out.lerp(dirt, sstep(0.62, 0.74, zA) * 0.75);
        const lane = Math.abs(x * -shape.fz + z * shape.fx);
        if (!boss) {   // worn royal carpet down the hall: crimson with a gold border, frayed and torn in places
          const torn = sstep(0.62, 0.7, fbm(x * 0.12 + so, z * 0.12, 3));
          const inLane = sstep(2.9, 2.6, lane) * sstep(0.5, -1.5, u) * (1 - torn);
          out.lerp(tmpC.set('#6e1a20'), inLane * 0.85);
          out.lerp(tmpC.set('#b8913a'), sstep(2.9, 2.6, lane) * sstep(2.2, 2.45, lane) * sstep(0.5, -1.5, u) * (1 - torn) * 0.7);
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
        out.lerp(tmpC.set('#a8d4f0'), sstep(0.66, 0.74, zA) * 0.7);   // blue ice patches
        out.lerp(dirt, sstep(0.7, 0.8, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.6);   // rock poking through
      } else if (style === 'BASALT') {
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.6);
        out.lerp(dirt, sstep(0.55, 0.7, zB) * 0.8);
        out.lerp(tmpC.set('#5a3220'), sstep(0.7, 0.78, fbm(x * 0.09 + so, z * 0.09, 3)) * 0.35);   // faint scorch
      } else if (style === 'VOID') {
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.7);
        out.lerp(dirt, sstep(0.6, 0.72, zB) * 0.8);
      } else {
        // big colour zones: lush / dry grass and bare-dirt patches (more variety across the room)
        out.lerp(lush, sstep(0.48, 0.62, zA) * 0.85);
        out.lerp(dry, sstep(0.5, 0.64, zB) * 0.8);
        out.lerp(dirt, sstep(0.64, 0.74, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.85);
      }
      // stone path from the arrival side to the exits (most non-boss rooms), gently winding
      if (path) {
        const t = x * shape.fx + z * shape.fz, l = x * -shape.fz + z * shape.fx;
        const cl = Math.sin(t * 0.11 + so) * 2.6 + Math.sin(t * 0.27 - so) * 0.8;
        const w = 1.9 + vnoise(t * 0.2 + so, 3.1) * 0.9;
        const pd = Math.abs(l - cl) - w;
        const k = sstep(0.6, -0.4, pd) * sstep(0.5, -1.5, u) * (style === 'SAND' ? 0.55 : 1);
        if (k > 0) {
          const cx = x * 1.25, cz = z * 1.25, fx = cx - Math.floor(cx), fz = cz - Math.floor(cz) + (Math.floor(cx) % 2) * 0.5;
          const gap = Math.min(fx, 1 - fx, fz - Math.floor(fz), 1 - (fz - Math.floor(fz)));
          stoneC.copy(stone).multiplyScalar(0.85 + vnoise(Math.floor(cx) * 3.1, Math.floor(cz + (Math.floor(cx) % 2) * 0.5) * 2.7) * 0.3);
          if (gap < 0.09) stoneC.multiplyScalar(0.62);
          out.lerp(stoneC, k * 0.92);
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
      // stone rim just inside the walls
      out.lerp(rim, sstep(-1.4, -0.2, u) * 0.55);
      // boss arena: a faint rune circle
      if (boss) {
        const rr = Math.abs(r - (shapeLimit(x, z) - 1) * 0.62);
        out.lerp(g1, sstep(0.9, 0.2, rr) * 0.6).multiplyScalar(1 + sstep(0.5, 0.1, rr) * 0.25);
        out.multiplyScalar(1 + sstep(R * 0.2, 0, r) * 0.2);
      }
      // lava sea: past the wall ring the rock crumbles away under the lava (a dark scorched lip first)
      if (lavaSea) {
        const k = sstep(3.6, 6.0, u);
        if (k > 0) pos.setY(i, Math.min(pos.getY(i), -1.4 * k));
        out.lerp(tmpC.set('#1a0c08'), sstep(2.6, 4.2, u) * 0.85);
      }
      // floor beyond the walls (marble halls: dark interior void)
      const e = sstep(0.2, style === 'MARBLE' ? 2.2 : 3.2, u);
      out.lerp(edge, e).multiplyScalar(1 - e * 0.35);
      col[i * 3] = out.r; col[i * 3 + 1] = out.g; col[i * 3 + 2] = out.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const [dTex, eTex] = groundDetail(style);
    const rep = S / DETAIL_PERIOD[style];
    const map = dTex.clone(); map.repeat.set(rep, rep); map.needsUpdate = true;
    let emap: CanvasTexture | null = null;
    if (eTex) { emap = eTex.clone(); emap.repeat.set(rep, rep); emap.needsUpdate = true; }
    const m = new MeshStandardMaterial({
      vertexColors: true, map, roughness: style === 'MARBLE' ? 0.55 : style === 'SNOW' ? 0.8 : 0.96, metalness: 0,
      emissiveMap: emap, emissive: new Color(emap ? (style === 'BASALT' ? '#ff6a1a' : '#9a6aff') : '#000000'), emissiveIntensity: emap ? (style === 'BASALT' ? 1.1 : 0.7) : 0,
    });

    // ground clutter: pebbles / tufts in the biome's tones (one instanced draw call)
    const N = style === 'MARBLE' ? 26 : 45; // sparse clutter (user: fewer small bushes)
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
    const o = new Object3D();
    const cc = new Color();
    let nt = 0;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shapeLimit(Math.cos(a), Math.sin(a)) - 2);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (hasLiquid && inLiquid(x, z, 0.4)) continue;
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
    const SG = new GB([0.9, 1.1]); SG.cyl(0.62, 0.7, 0.14, 6, [0, 0.05, 0], '#ffffff');
    const slabs = new InstancedMesh(SG.build(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 90);
    let ns = 0;
    if (path) {
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
    return { geo: g, mat: m, tufts: inst, slabs };
  }, [biome, R, seed, boss]);
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <primitive object={tufts} />
      <primitive object={slabs} />
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
  g.fillStyle = '#4a4a4f'; g.fillRect(0, 0, N, N);   // mortar / cement
  const cx = N / 2, ringW = 17;
  for (let r0 = 0; r0 < N * 0.72; r0 += ringW) {
    const n = Math.max(6, Math.round((Math.PI * 2 * (r0 + ringW / 2)) / 24));
    const off = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2 + 0.012, a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.012;
      const rIn = r0 + 1.8, rOut = r0 + ringW - 1.8;
      const v = 0.75 + rnd() * 0.4, warm = rnd() * 10;
      g.fillStyle = `rgb(${Math.round(128 * v + warm)},${Math.round(126 * v + warm * 0.6)},${Math.round(122 * v)})`;
      g.beginPath(); g.arc(cx, cx, rOut, a0, a1); g.arc(cx, cx, Math.max(0, rIn), a1, a0, true); g.closePath(); g.fill();
      // a lighter top face for a little bevel
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.beginPath(); g.arc(cx, cx, rOut - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cx, Math.max(0, rIn + 5), a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
    }
  }
  // grime + speckle so it reads as rough rock, not tiles
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * N, y = rnd() * N, s = 1 + rnd() * 2.5;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.06)'; g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,20,30,0.18)'); gr.addColorStop(1, 'rgba(20,20,30,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cobbleTex = new CanvasTexture(c); cobbleTex.colorSpace = SRGBColorSpace; cobbleTex.anisotropy = 4;
  return cobbleTex;
}

/** Endless Tower floor: a round cobbled platform floating in the night sky (stone skirt below, rune ring, stars). */
function TowerFloor({ R }: { R: number }) {
  const { top, skirt, rune } = useMemo(() => {
    const rr = R + 3.4;
    const tg = new CircleGeometry(rr, 96); tg.rotateX(-Math.PI / 2);
    const top = new Mesh(tg, new MeshStandardMaterial({ map: towerCobbles(), roughness: 0.95, metalness: 0 }));
    top.position.y = 0.005; top.receiveShadow = true;
    const sg = new CylinderGeometry(rr, rr * 0.55, 7, 48, 1, true);
    const skirt = new Mesh(sg, new MeshStandardMaterial({ color: '#2c2c36', roughness: 1, side: DoubleSide }));
    skirt.position.y = -3.5;
    const rg = new RingGeometry(R * 0.62 - 0.12, R * 0.62 + 0.12, 96); rg.rotateX(-Math.PI / 2);
    const rune = new Mesh(rg, new MeshBasicMaterial({ color: '#6f8cff', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
    rune.position.y = 0.02;
    return { top, skirt, rune };
  }, [R]);
  useFrame(({ clock }) => { (rune.material as MeshBasicMaterial).opacity = 0.25 + Math.sin(clock.elapsedTime * 1.4) * 0.1; });
  return (
    <>
      <primitive object={top} />
      <primitive object={skirt} />
      <primitive object={rune} />
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
  // trader behind the counter
  m.cyl(0.5, 0.65, 1.5, 8, [0, 1.0, -0.6], '#3e5a8a'); m.sph(0.36, [0, 2.0, -0.6], '#e0b08a', 1, 7); m.cone(0.55, 0.6, 8, [0, 2.45, -0.6], '#6a4a2a');
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
  // altar
  const a = new GB([0.8, 1.08]);
  a.cyl(1.6, 1.9, 0.5, 8, [0, 0.25, 0], '#6d6a78'); a.cyl(1.1, 1.3, 0.5, 8, [0, 0.75, 0], '#807d8c'); a.box(1.0, 1.3, 1.0, [0, 1.65, 0], '#8e8a9c');
  a.box(0.4, 1.9, 0.4, [-1.7, 1.0, 0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [1.7, 1.0, 0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [-1.7, 1.0, -0.8], '#6d6a78'); a.box(0.4, 1.9, 0.4, [1.7, 1.0, -0.8], '#6d6a78');
  const ag = new GB([1, 1]);
  ag.octa(0.55, [0, 3.0, 0], '#c084fc', [0.8, 1.3, 0.8]); ag.torus(1.0, 0.07, [0, 2.3, 0], '#e0b8ff', [Math.PI / 2, 0, 0], 1, 16);
  ag.box(0.5, 0.06, 0.5, [0, 2.32, 0], '#e0b8ff', [0, 0.78, 0]);
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
    return { base: b.build(), fire: g.build(), storage: s.build(), train: t.build() };
  }, []);
  const mats = useMemo(() => ({ lit: litMat({ roughness: 0.85 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.4, 1.0) }) }), []);
  const root = useRef<Group>(null!), fire = useRef<Mesh>(null!), st = useRef<Group>(null!), tr = useRef<Group>(null!);
  // floating name tags (like the town buildings) so the storage and the training post read at a glance
  const labs = useMemo(() => ({ st: labelMaterial('Storage', '#ffe6a8', { size: 46, plate: 'mini' }), tr: labelMaterial('Training Post', '#ffe6a8', { size: 46, plate: 'mini' }), fire: labelMaterial('Campfire', '#ffc27a', { size: 40, plate: 'mini' }) }), []);
  useFrame(({ clock }) => {
    const on = world.room.active && world.room.plan.type === 'CAMP';
    if (root.current) root.current.visible = on;
    if (!on) return;
    root.current.position.set(campPos.fire[0], 0, campPos.fire[1] - 1);
    st.current.position.set(campPos.storage[0] - campPos.fire[0], 0, 0);
    tr.current.position.set(campPos.trainer[0] - campPos.fire[0], 0, 0);
    const k = 1 + Math.sin(clock.elapsedTime * 13) * 0.08 + Math.sin(clock.elapsedTime * 7.3) * 0.06;
    fire.current.scale.set(k, k * 1.1, k);
  });
  return (
    <group ref={root} visible={false}>
      <mesh geometry={geos.base} material={mats.lit} castShadow receiveShadow />
      <mesh ref={fire} geometry={geos.fire} material={mats.glow} position={[0, 0, 0]} />
      <pointLight position={[0, 1.4, 1]} color="#ffa040" intensity={8} distance={10} decay={1.6} />
      <sprite material={labs.fire.mat} position={[0, 2.4, 1]} scale={[labs.fire.aspect * 0.75, 0.75, 1]} />
      <group ref={st}><mesh geometry={geos.storage} material={mats.lit} castShadow receiveShadow />
        <sprite material={labs.st.mat} position={[0, 3.2, 0]} scale={[labs.st.aspect * 1.0, 1.0, 1]} /></group>
      <group ref={tr}><mesh geometry={geos.train} material={mats.lit} castShadow receiveShadow />
        <sprite material={labs.tr.mat} position={[0.8, 3.2, 0]} scale={[labs.tr.aspect * 1.0, 1.0, 1]} /></group>
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
      chestGlow.current.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    } else if (altar.current.visible) {
      altarGlow.current.position.y = Math.sin(t * 1.7) * 0.15;
      altarGlow.current.rotation.y = t * 0.8;
      altarGlow.current.visible = !s.used || world.room.shrineOn;
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
      </group>
      <group ref={chest}>
        <mesh geometry={geos.chest} material={mats.lit} castShadow receiveShadow />
        <group ref={lid} position={[0, 0.9, -0.65]}><mesh geometry={geos.chestLid} material={mats.lit} position={[0, 0, 0.65]} castShadow /></group>
        <mesh ref={chestGlow} geometry={geos.chestGlow} material={mats.glow} />
      </group>
      <group ref={altar}>
        <mesh geometry={geos.altar} material={mats.lit} castShadow receiveShadow />
        <mesh ref={altarGlow} geometry={geos.altarGlow} material={mats.glow} />
      </group>
    </group>
  );
}

// ----------------------------------------------------------------- portals ---
const ICONS: Record<string, React.ReactNode> = {
  card: <Sparkles size={18} />, coins: <Coins size={18} />, shard: <Diamond size={18} />, gear: <Sword size={18} />, heart: <Heart size={18} />,
  gem: <Gem size={18} />, fountain: <Droplets size={18} />, merchant: <Store size={18} />, chest: <Package size={18} />, shrine: <Flame size={18} />, boss: <Skull size={18} />,
};
const TYPE_I: Record<string, number> = { COMBAT: 1, ELITE: 2, MINIBOSS: 3, FOUNTAIN: 4, MERCHANT: 5, TREASURE: 6, SHRINE: 7, CRYSTAL: 6, BOSS: 8 };
const REW_I: Record<string, number> = { NONE: 0, CARD: 1, GOLD: 2, SHARDS: 3, ITEM: 4, HEAL: 5, GEMS: 6 };

function PortalLabel({ i }: { i: number }) {
  const sig = useWorldCounter(() => { const p = world.room.portals[i]; return p.active ? TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + 1000 * world.room.version + (p.big ? 500 : 0) : 0; });
  if (!sig) return null;
  const p = world.room.portals[i];
  const nb = BIOMES[(world.room.biome + 1) % BIOMES.length];
  const l = p.big ? { title: 'Next biome', sub: nb.name, icon: 'boss', color: '#f2c14e' } : portalLabel(p.plan, world.room.biome);
  return (
    <Html position={[0, 3.9, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="portal-tag" style={{ ['--pc' as any]: l.color }} data-testid={`portal-${i}`}>
        <span className="pi">{ICONS[l.icon]}</span>
        <span className="pt">{l.title}{l.sub && <small>{l.sub}</small>}</span>
      </div>
    </Html>
  );
}

function Portals() {
  const geos = useMemo(() => ({
    ring: (() => { const g = new GB([1, 1]); g.torus(1.55, 0.14, [0, 1.9, 0], '#ffffff', [0, 0, 0], [0.8, 1.15, 1], 28); return g.build(); })(),
    disc: new CircleGeometry(1.45, 28),
    floor: new RingGeometry(1.2, 2.2, 28).rotateX(-Math.PI / 2),
    pillar: (() => { const g = new GB([0.8, 1.1]); for (const s of [-1, 1]) { g.box(0.5, 2.4, 0.5, [s * 1.9, 1.2, 0], '#7d7a88'); g.box(0.7, 0.3, 0.7, [s * 1.9, 2.55, 0], '#9a97a8'); g.box(0.8, 0.3, 0.8, [s * 1.9, 0.15, 0], '#6a6776'); } return g.build(); })(),
  }), []);
  const groups = useRef<(Group | null)[]>([]);
  const ringMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, color: new Color(), vertexColors: true })), []);
  const discMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, color: new Color() })), []);
  const floorMats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, color: new Color() })), []);
  const lit = useMemo(() => litMat({ roughness: 0.9 }), []);
  const last = useRef<number[]>([-1, -1, -1]);
  const discs = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < 3; i++) {
      const g = groups.current[i]; if (!g) continue;
      const p = world.room.portals[i];
      g.visible = p.active;
      if (!p.active) { last.current[i] = -1; continue; }
      g.position.set(p.x, 0, p.z);
      const k = Math.min(1, p.t * (p.big ? 0.8 : 1.6)), grow = (1 - (1 - k) * (1 - k)) * (p.big ? 2.1 : 1);
      g.scale.set(grow, grow, grow);
      const key = TYPE_I[p.plan.type] * 10 + REW_I[p.plan.reward] + (p.big ? 500 : 0);
      if (key !== last.current[i]) {
        last.current[i] = key;
        const c = p.big ? '#f2c14e' : portalLabel(p.plan, world.room.biome).color;
        ringMats[i].color.set(c).multiplyScalar(1.8); discMats[i].color.set(c); floorMats[i].color.set(c);
      }
      const d = discs.current[i];
      if (d) { d.rotation.z = t * 0.6 + i; d.scale.setScalar(0.95 + Math.sin(t * 3 + i) * 0.05); }
      floorMats[i].opacity = 0.4 + Math.sin(t * 3 + i) * 0.15;
    }
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <mesh geometry={geos.pillar} material={lit} castShadow />
          <mesh geometry={geos.ring} material={ringMats[i]} />
          <mesh ref={(m) => { discs.current[i] = m; }} geometry={geos.disc} material={discMats[i]} position={[0, 1.9, 0]} scale={[0.8, 1.15, 1]} renderOrder={4} />
          <mesh geometry={geos.floor} material={floorMats[i]} position={[0, 0.05, 0]} renderOrder={3} />
          <PortalLabel i={i} />
        </group>
      ))}
    </>
  );
}


/** Small arrows around the hero pointing at exit portals that are off-screen. */
function PortalGuides() {
  const geo = useMemo(() => new ConeGeometry(0.55, 1.5, 3).rotateX(Math.PI / 2), []);
  const mats = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, color: new Color() })), []);
  const refs = useRef<(Mesh | null)[]>([]);
  const keys = useRef([-1, -1, -1]);
  useFrame(({ clock }) => {
    const r = world.room, p = world.player.pos;
    for (let i = 0; i < 3; i++) {
      const m = refs.current[i]; if (!m) continue;
      const po = r.portals[i];
      const dx = po.x - p.x, dz = po.z - p.z, d = Math.hypot(dx, dz);
      m.visible = po.active && d > 15 && r.fade < 0.5;
      if (!m.visible) continue;
      const k = 4.2 + Math.sin(clock.elapsedTime * 5 + i) * 0.25;
      m.position.set(p.x + (dx / d) * k, 0.25, p.z + (dz / d) * k);
      m.rotation.y = Math.atan2(dx, dz);
      const key = TYPE_I[po.plan.type] * 10 + REW_I[po.plan.reward];
      if (key !== keys.current[i]) { keys.current[i] = key; mats[i].color.set(portalLabel(po.plan, r.biome).color); }
    }
  });
  return <>{[0, 1, 2].map((i) => <mesh key={i} ref={(m) => { refs.current[i] = m; }} geometry={geo} material={mats[i]} visible={false} renderOrder={5} />)}</>;
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
    fill.count = ring.count = n;
    fill.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true;
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
  });
  void mf; void mr;
  return (<><primitive object={fill} /><primitive object={ring} /></>);
}

// -------------------------------------------------------------------- room ---
export function Room({ q }: { q: QualityCfg }) {
  const ver = useWorldCounter(() => world.room.version);
  const r = world.room;
  const def = biomeOf(r.biome);
  const tower = runInfo.mode === 'TOWER';
  return (
    <>
      {r.active && (tower ? <TowerFloor key={ver} R={r.radius} /> : <RoomGround key={ver} biome={r.biome} R={r.radius} seed={r.seed} boss={r.plan.type === 'BOSS'} index={r.index} />)}
      {r.active && !tower && <RoomWater />}
      {r.active && !tower && def.lavaSea && <LavaSea key={'lava' + ver} />}
      <Suspense fallback={null}><Props q={q} tint={tower ? '#c4c8d6' : variantOf(def, r.index)?.propTint ?? def.propTint} /></Suspense>
      <Stations />
      <CampProps />
      <Portals />
      <PortalGuides />
      <SpawnMarkers />
    </>
  );
}
