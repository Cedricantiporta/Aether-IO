// Instanced billboard damage numbers sampling a canvas digit atlas.
import { inView } from './view';
import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, PlaneGeometry,
  ShaderMaterial, SRGBColorSpace, Sphere, Vector3,
} from 'three';
import { events } from '../engine/events';
import type { DamageKind } from '../engine/events';
import { GameStatus } from '../types';
import { useGameStore } from '../store';

const GLYPHS = '0123456789!+-XPBACKSTLMHERINGF';
const POOL = 256, MAXG = 10;

let tex: CanvasTexture | null = null;
function atlas() {
  if (tex) return tex;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  ctx.font = '900 54px "Arial Black", Impact, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = (i % 8) * 64 + 32, cy = Math.floor(i / 8) * 64 + 34;
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(20,10,10,0.95)'; ctx.strokeText(GLYPHS[i], cx, cy);
    ctx.fillStyle = '#ffffff'; ctx.fillText(GLYPHS[i], cx, cy);
  }
  tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; tex.minFilter = LinearFilter; tex.generateMipmaps = false;
  return tex;
}

interface Num { active: boolean; x: number; y: number; z: number; t: number; dur: number; n: number; g: Int8Array; r: number; gc: number; b: number; scale: number; dot: boolean; amount: number; crit: boolean; kind: string; vx: number; }
const nums: Num[] = Array.from({ length: POOL }, () => ({ active: false, x: 0, y: 0, z: 0, t: 0, dur: 0.8, n: 0, g: new Int8Array(MAXG), r: 1, gc: 1, b: 1, scale: 1, dot: false, amount: 0, crit: false, kind: '', vx: 0 }));
let cursor = 0;
const _c = new Color();

const COLORS: Record<DamageKind, number> = {
  PHYSICAL: 0xffffff, FIRE: 0xff7a2a, ICE: 0x6fc3ff, POISON: 0x7ddc3a, MAGIC: 0xc9a0ff, LIGHTNING: 0xfff6a0, TRUE: 0xffffff,
};

function setText(n: Num, amount: number, crit: boolean) {
  const s = String(Math.max(1, Math.round(amount)));
  let k = 0;
  for (let i = 0; i < s.length && k < MAXG - 1; i++) n.g[k++] = s.charCodeAt(i) - 48;
  if (crit) n.g[k++] = 10;
  n.n = k;
}

// Token bucket: ordinary hits are rate-limited so AoE / multishot crowds don't flood the screen.
// Crits, big hits and damage to the player always show.
let bucket = 3, bucketT = 0;
function allow(amount: number, crit: boolean, toPlayer: boolean): boolean {
  if (crit || toPlayer || amount > 400) return true;
  const now = performance.now();
  bucket = Math.min(3, bucket + (now - bucketT) * 0.010); // ~10 numbers / second sustained
  bucketT = now;
  if (bucket < 1) return false;
  bucket -= 1;
  return true;
}

/** Free-form label (e.g. "+12 XP", "BACKSTAB", "SLAM"): supports the atlas glyphs only. */
function spawnLabel(x: number, y: number, z: number, text: string, hex: number, scale: number, dy: number) {
  const n = nums[cursor]; cursor = (cursor + 1) % POOL;
  n.active = true; n.t = 0; n.dur = 1.0; n.crit = false; n.dot = false; n.kind = 'LABEL'; n.amount = 0;
  n.x = x + (Math.random() - 0.5) * 0.5; n.y = y + 1.8 + dy; n.z = z; n.vx = (Math.random() - 0.5) * 0.6;
  _c.setHex(hex); n.r = _c.r; n.gc = _c.g; n.b = _c.b;
  n.scale = scale;
  let k = 0;
  for (let i = 0; i < text.length && k < MAXG; i++) { const gi = GLYPHS.indexOf(text[i]); if (gi >= 0) n.g[k++] = gi; }
  n.n = k;
}

function spawnNum(x: number, y: number, z: number, amount: number, crit: boolean, kind: DamageKind, toPlayer: boolean, dot: boolean) {
  if (dot) {
    for (const n of nums) {
      if (n.active && n.dot && n.kind === kind && n.t < 0.45 && Math.abs(n.x - x) < 1.4 && Math.abs(n.z - z) < 1.4) {
        n.amount += amount; setText(n, n.amount, false); n.scale = Math.min(1.5, n.scale + 0.03); return;
      }
    }
  }
  if (!crit && !toPlayer && !dot) {
    // aggregate ordinary hits on the same target within 0.25 s into one number
    for (const n of nums) {
      if (n.active && !n.crit && !n.dot && n.t < 0.25 && Math.abs(n.x - x) < 1.6 && Math.abs(n.z - z) < 1.6) {
        n.amount += amount; setText(n, n.amount, false); n.scale = Math.min(1.3, n.scale + 0.02); return;
      }
    }
  }
  if (!allow(amount, crit, toPlayer)) return;
  const n = nums[cursor]; cursor = (cursor + 1) % POOL;
  n.active = true; n.t = 0; n.dur = crit ? 1.05 : 0.85; n.crit = crit; n.dot = dot; n.kind = kind; n.amount = amount;
  n.x = x + (Math.random() - 0.5) * 0.8; n.y = y + 1.8 + Math.random() * 0.4; n.z = z + (Math.random() - 0.5) * 0.6; n.vx = (Math.random() - 0.5) * 1.2;
  let hex = toPlayer ? 0xff4040 : crit ? 0xffd23a : dot && kind === 'PHYSICAL' ? 0xffa13a : dot && kind === 'FIRE' ? 0xff9a3a : COLORS[kind];
  _c.setHex(hex); n.r = _c.r; n.gc = _c.g; n.b = _c.b;
  n.scale = crit ? 1.65 : toPlayer ? 1.25 : dot ? 0.7 : amount > 400 ? 1.2 : amount > 100 ? 1.0 : 0.85;
  setText(n, amount, crit);
}

const VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iG; attribute vec4 iCol;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float scale = iG.z;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += vec2(iG.x + position.x * scale * 0.9, position.y * scale * 0.9);
  gl_Position = projectionMatrix * mv;
  float col = mod(iG.y, 8.0); float row = floor(iG.y / 8.0);
  vUv = (vec2(col, 3.0 - row) + position.xy + 0.5) / vec2(8.0, 4.0);
  vCol = vec4(iCol.rgb, iG.w);
}`;
const FS = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vCol.a; if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * vCol.rgb, a);
  #include <colorspace_fragment>
}`;

export function DamageNumbers() {
  const show = useGameStore((s) => s.settings?.showDamageNumbers);
  const { geo, mat, A } = useMemo(() => {
    const cap = POOL * MAXG;
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    const mk = (n: number) => { const a = new InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(DynamicDrawUsage); return a; };
    const A = { pos: mk(3), g: mk(4), col: mk(4) };
    g.setAttribute('iPos', A.pos); g.setAttribute('iG', A.g); g.setAttribute('iCol', A.col);
    g.instanceCount = 0; g.boundingSphere = new Sphere(new Vector3(), 1e6);
    const m = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uMap: { value: atlas() } }, transparent: true, depthWrite: false, depthTest: false });
    return { geo: g, mat: m, A };
  }, []);

  useEffect(() => {
    if (!show) { for (const n of nums) n.active = false; return; }
    const off1 = events.on('damage', (e) => {
      if (useGameStore.getState().status !== GameStatus.PLAYING) return;
      spawnNum(e.pos.x, e.pos.y, e.pos.z, e.amount, e.crit, e.kind, e.toPlayer, !!e.dot);
    });
    const off2 = events.on('floatText', (e) => {
      if (useGameStore.getState().status !== GameStatus.PLAYING) return;
      spawnLabel(e.pos.x, e.pos.y, e.pos.z, e.text, e.color, e.scale ?? 0.8, e.dy ?? 0.6);
    });
    return () => { off1(); off2(); };
  }, [show]);

  useFrame((_, dtRaw) => {
    const paused = useGameStore.getState().status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dtRaw, 0.05);
    let c = 0;
    const P = A.pos.array as Float32Array, G = A.g.array as Float32Array, C = A.col.array as Float32Array;
    for (let i = 0; i < POOL; i++) {
      const n = nums[i];
      if (!n.active) continue;
      n.t += dt;
      if (n.t >= n.dur) { n.active = false; continue; }
      if (!inView(n.x, n.z, 3)) continue;
      const k = n.t / n.dur;
      const pop = n.t < 0.14 ? (() => { const u = n.t / 0.14; return 1 + 0.35 * Math.sin(u * Math.PI) - (1 - u) * 0.6 + (1 - u) * 0.0; })() : 1;
      const sc = n.scale * Math.max(0.2, pop) * (n.crit ? 1 + 0.06 * Math.sin(n.t * 40) * (1 - k) : 1);
      const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const rise = (1 - (1 - k) * (1 - k)) * (n.crit ? 2.4 : 1.7);
      const w = 0.5 * sc;
      const total = n.n * w;
      for (let j = 0; j < n.n; j++) {
        const o = c++;
        P[o * 3] = n.x + n.vx * k; P[o * 3 + 1] = n.y + rise; P[o * 3 + 2] = n.z;
        G[o * 4] = -total / 2 + w * (j + 0.5); G[o * 4 + 1] = n.g[j]; G[o * 4 + 2] = sc; G[o * 4 + 3] = alpha;
        C[o * 4] = n.r; C[o * 4 + 1] = n.gc; C[o * 4 + 2] = n.b; C[o * 4 + 3] = 1;
      }
    }
    geo.instanceCount = c;
    A.pos.clearUpdateRanges(); A.g.clearUpdateRanges(); A.col.clearUpdateRanges();
    if (c > 0) { A.pos.addUpdateRange(0, c * 3); A.g.addUpdateRange(0, c * 4); A.col.addUpdateRange(0, c * 4); }
    A.pos.needsUpdate = A.g.needsUpdate = A.col.needsUpdate = true;
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={50} visible={!!show} />;
}
