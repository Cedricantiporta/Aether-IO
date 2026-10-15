// GPU particle layers + decals + event-driven emitters.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending,
  PlaneGeometry, PointLight, ShaderMaterial, Float32BufferAttribute, Sphere, Vector3,
} from 'three';
import { events } from '../engine/events';
import type { DamageKind } from '../engine/events';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import {
  CELL, DECALS, FLASHES, FX, Particles, bolt, chunks, dustPuff, embers, flashLight, flashStar, getAtlas, glowPuff,
  ringBurst, scorch, smokePuff, sparks, splat,
} from './fx';
import { TAU, liveRange } from './util';
import { adaptive, getQuality, useQuality } from "./quality";

const PARTICLE_VS = /* glsl */ `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iData;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iData.x; float cell = iData.y; float rot = iData.z; float stretch = iData.w;
  vec2 q = position.xy; vec2 off;
  if (stretch > 0.0) {
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 d = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
    float len = size + stretch * sp;
    off = d * q.x * len + vec2(-d.y, d.x) * q.y * size;
  } else {
    float c = cos(rot), s = sin(rot);
    off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float col = mod(cell, 4.0); float row = floor(cell / 4.0);
  vUv = (vec2(col, 3.0 - row) + (q + 0.5)) / 4.0;
  vCol = iCol;
}`;
const PARTICLE_FS = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){
  float a = texture2D(uMap, vUv).a * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function ParticleLayer({ sys, additive }: { sys: Particles; additive: boolean }) {
  const ref = useRef<Mesh>(null!);
  const { geo, mat, attrs } = useMemo(() => {
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const mk = (arr: Float32Array, size: number) => { const a = new InstancedBufferAttribute(arr, size); a.setUsage(DynamicDrawUsage); return a; };
    const attrs = { pos: mk(sys.iPos, 3), vel: mk(sys.iVel, 3), col: mk(sys.iCol, 4), data: mk(sys.iData, 4) };
    g.setAttribute('iPos', attrs.pos); g.setAttribute('iVel', attrs.vel); g.setAttribute('iCol', attrs.col); g.setAttribute('iData', attrs.data);
    g.instanceCount = 0;
    g.boundingSphere = new Sphere(new Vector3(), 1e6);
    const m = new ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      uniforms: { uMap: { value: getAtlas() } },
      transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, side: DoubleSide,
    });
    return { geo: g, mat: m, attrs };
  }, [sys, additive]);

  useFrame(() => {
    const n = sys.n;
    geo.instanceCount = n;
    if (ref.current) ref.current.visible = n > 0;   // an empty layer would still be bound + set up every frame
    liveRange(attrs.pos, n); liveRange(attrs.vel, n); liveRange(attrs.col, n); liveRange(attrs.data, n);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={additive ? 12 : 10} />;
}

const DECAL_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iData;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float c = cos(iPos.z), s = sin(iPos.z);
  vec2 p = vec2(c * position.x - s * position.z, s * position.x + c * position.z) * iData.x;
  vec4 wp = vec4(iPos.x + p.x, 0.045, iPos.y + p.y, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  float col = mod(iData.y, 4.0); float row = floor(iData.y / 4.0);
  vUv = (vec2(col, 3.0 - row) + (position.xz + 0.5)) / 4.0;
  vCol = iCol;
}`;
const DECAL_FS = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){
  float a = texture2D(uMap, vUv).a * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function DecalLayer() {
  const { geo, mat, attrs } = useMemo(() => {
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    const mk = (arr: Float32Array, size: number) => { const a = new InstancedBufferAttribute(arr, size); a.setUsage(DynamicDrawUsage); return a; };
    const attrs = { pos: mk(DECALS.iPos, 3), col: mk(DECALS.iCol, 4), data: mk(DECALS.iData, 2) };
    g.setAttribute('iPos', attrs.pos); g.setAttribute('iCol', attrs.col); g.setAttribute('iData', attrs.data);
    g.instanceCount = 0; g.boundingSphere = new Sphere(new Vector3(), 1e6);
    const m = new ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: DECAL_FS, uniforms: { uMap: { value: getAtlas() } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { geo: g, mat: m, attrs };
  }, []);
  const dref = useRef<Mesh>(null!);
  useFrame(() => {
    geo.instanceCount = DECALS.n;
    if (dref.current) dref.current.visible = DECALS.n > 0;
    liveRange(attrs.pos, DECALS.n); liveRange(attrs.col, DECALS.n); liveRange(attrs.data, DECALS.n);
  });
  return <mesh ref={dref} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

function FlashLights() {
  const refs = useRef<(PointLight | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < FLASHES.length; i++) {
      const l = refs.current[i]; if (!l) continue;
      const f = FLASHES[i];
      if (f.life > 0) {
        const k = f.life / f.max;
        l.position.set(f.x, f.y, f.z); l.color.setRGB(f.r, f.g, f.b); l.intensity = f.i * k * k;
      } else l.intensity = 0;
    }
  });
  return <>{FLASHES.map((_, i) => <pointLight key={i} ref={(r) => { refs.current[i] = r; }} distance={22} decay={1.6} intensity={0} />)}</>;
}

// -------------------------------------------------------- colour tables -----
const DMG_COLOR: Record<DamageKind, number> = {
  PHYSICAL: 0xffe6a0, FIRE: 0xff7a1a, ICE: 0x8fdcff, POISON: 0x8be03a, MAGIC: 0xc58bff, LIGHTNING: 0xfff08a, TRUE: 0xffffff,
};
const KIND_COLORS: Record<string, [number, number, number]> = {
  SLIME: [0x7ddc3a, 0xb6f26a, 0x7ddc3a], SPLITTER: [0x2fb89a, 0x8f5bd8, 0x2fb89a], GOBLIN: [0x5fa02a, 0x7a4a20, 0xd8c8a0],
  BAT: [0x4a2a6a, 0x2a1a3a, 0x8a4ab0], SKELETON_ARCHER: [0xe8e0c8, 0xbfb59a, 0xe8e0c8], CULTIST: [0x7a3ab0, 0x3a1a5a, 0xc880ff],
  BOMBER: [0xd86a1a, 0x3a2a1a, 0xffb040], BRUTE: [0x8a5a3a, 0x5a3a24, 0xb89a6a], BOSS_GOLEM: [0x8a8f98, 0x5f6a55, 0xffa040], BOSS_LICH: [0x7a3ab0, 0x2a1a3a, 0xd070ff],
  BOSS_TREANT: [0x6b4423, 0x3f8a1c, 0xd8ff5a], BOSS_HYDRA: [0x2f6f3a, 0x1f4a28, 0xb6f06a], BOSS_WYRM: [0x8fd0f0, 0xd6f1ff, 0x7df3ff],
  BOSS_WARLORD: [0x8a2a20, 0x2e2022, 0xff7a1a], BOSS_WARMACH: [0x6e7a45, 0x3a4024, 0xffa040], BOSS_VOID: [0x2a1048, 0x0b0416, 0xc084fc],
  BOSS_SAPLING: [0x6b4423, 0x5fae2a, 0xd8ff5a], BOSS_WYRMLING: [0x8fd0f0, 0xd6f1ff, 0x7df3ff], BOSS_HYDRA_HEAD: [0x3f8f4a, 0x2a5a30, 0xb6f06a], BOSS_IMP: [0xff6a1a, 0x7a2a10, 0xffb040],
};

const _v = new Vector3();
let pendingBoss = 0;
let stepPrev = 0;
let pollenT = 0;

// ---- pet attacks (engine PET_EL): every pet hit reads as its element
const EL_HEX = [0xffffff, 0xff7a1a, 0xffc23a, 0xffffff, 0x3aa8ff, 0x9fe8ff, 0xb070ff, 0xff3048, 0x9a7a52, 0x7ae8ff, 0x7ad04a, 0xffd23a];
const clawC = new Color();
const _bc = new Color();
function claws(x: number, y: number, z: number, dx: number, dz: number, hex: number, big: boolean): void {
  // three parallel claw rakes across the target
  const px = -dz, pz = dx, s = big ? 1.4 : 1, c = clawC.setHex(hex);
  for (let k = -1; k <= 1; k++) {
    const ox = x + px * k * 0.32 * s - dx * 0.5 * s, oz = z + pz * k * 0.32 * s - dz * 0.5 * s;
    FX.add.emit(ox, y + 0.5 * s, oz, dx * 9 * s, -6 * s, dz * 9 * s, 0.2, 0.42 * s, 0.1, c.r * 2.2, c.g * 2.2, c.b * 2.2, 1, CELL.STREAK, 0, 2, 0, 0, 0.06);
  }
}
function petFx(x: number, y: number, z: number, el: number, dx: number, dz: number, ranged: boolean, big: boolean): void {
  const hex = EL_HEX[el] ?? 0xffffff;
  switch (el) {
    case 1:   // FIRE: Phoenix fireball burst / Ember Fox burning bite
      glowPuff(x, y, z, 0xff8a2a, ranged ? 3.4 : 2, 0.3, 1.8); sparks(x, y, z, ranged ? 12 : 6, 0xff7a1a, 8, 0.28, 0.4, 1.8); embers(x, y, z, ranged ? 8 : 4, 0xff8a2a, ranged ? 1.4 : 0.6);
      for (let i = 0; i < (ranged ? 8 : 3); i++) { const a = Math.random() * TAU, r = Math.random() * (ranged ? 1.8 : 0.6); FX.add.emit(x + Math.cos(a) * r, 0.4, z + Math.sin(a) * r, 0, 2 + Math.random() * 2, 0, 0.45, 0.9, 0.2, 2.4, 1.0, 0.25, 0.9, CELL.FLAME, -0.5, 1); }
      if (ranged) { ringBurst(x, 0.15, z, 0xff6a1a, 0.6, 2.6, 0.4, 1.6); scorch(x, z, 2.2, 4); }
      if (!ranged) claws(x, y, z, dx, dz, 0xffa040, big);
      break;
    case 2:   // GOLD: dragon fire
      glowPuff(x, y, z, 0xffc23a, 2.6, 0.28, 1.8); sparks(x, y, z, 10, 0xffd23a, 8, 0.26, 0.4, 1.8); embers(x, y, z, 5, 0xffc23a, 1); ringBurst(x, 0.15, z, 0xffb020, 0.5, 1.9, 0.35, 1.5); break;
    case 3:   // LIGHT: a starburst
      flashStar(x, y, z, 0xffffff, 2.6, 0.25); sparks(x, y, z, 10, 0xe8f4ff, 9, 0.24, 0.35, 2.2); glowPuff(x, y, z, 0xcfe8ff, 2, 0.25, 2); break;
    case 4:   // WATER: splash + ripple
      glowPuff(x, y, z, 0x3aa8ff, 2.4, 0.3, 1.6); ringBurst(x, 0.12, z, 0x6ac8ff, 0.5, 2.4, 0.5, 1.4);
      for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 3; FX.add.emit(x, y, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 0.6, 0.24, 0.06, 0.6, 1.6, 2.6, 0.95, CELL.DISC, 14, 0.3); }
      break;
    case 5: case 6: case 7:   // SPIRIT wolf / SHADOW cat / BLOOD bat: claw or fang rakes
      claws(x, y, z, dx, dz, hex, big); glowPuff(x, y, z, hex, 1.4, 0.2, 1.6); sparks(x, y, z, 4, hex, 6, 0.2, 0.3, 1.8, dx * 4, 0, dz * 4);
      if (el === 7) chunks(x, y, z, 3, 0xc01830, 0x801020, 3, 0.16);
      if (el === 6) smokePuff(x, y, z, 2, 0x3a1a5a, 0.8, 0.5, 0.6, 0.8, 0.5);
      break;
    case 8:   // EARTH: Iron Golem pound
      ringBurst(x, 0.12, z, 0xb08a5a, 0.6, big ? 3 : 2, 0.4, 1.2); chunks(x, 0.4, z, 6, 0x8a7a6a, 0x5a4a3a, 5, 0.3); dustPuff(x, z, 4, 1.0); break;
    case 9:   // CRYSTAL: shards
      flashStar(x, y, z, 0x8fe8ff, 1.8); chunks(x, y, z, 6, 0x9ff0ff, 0x4ac0ff, 6, 0.24); glowPuff(x, y, z, 0x7ae8ff, 1.6, 0.25, 1.8); break;
    case 10:  // NATURE: green ooze splat (poisons)
      glowPuff(x, y, z, 0x7ad04a, 1.6, 0.25, 1.5); sparks(x, y, z, 6, 0x9af060, 5, 0.22, 0.35, 1.6); smokePuff(x, y * 0.5, z, 2, 0x6ab040, 0.7, 0.6, 0.5, 0.8, 0.45); break;
    case 11:  // TREASURE: a chomp that spits coins
      flashStar(x, y, z, 0xffe080, 1.4); sparks(x, y, z, 6, 0xffd23a, 6, 0.22, 0.3, 2);
      for (let i = 0; i < 4; i++) { const a = Math.random() * TAU; FX.add.emit(x, y, z, Math.cos(a) * 2.5, 3 + Math.random() * 2, Math.sin(a) * 2.5, 0.6, 0.3, 0.2, 2.4, 2.0, 0.6, 1, CELL.DISC, 12, 0.4, 0, 6); }
      break;
    default: glowPuff(x, y, z, hex, 1.4, 0.2, 1.5); break;
  }
}

export function VFX() {
  const q = useQuality();
  useEffect(() => { FX.scale = q.fxScale * adaptive.fxMul; }, [q]);

  useEffect(() => {
    const off: (() => void)[] = [];
    const on = events.on.bind(events) as typeof events.on;
    const quality = () => getQuality();

    off.push(on('enemyHit', (e) => {
      const hex = DMG_COLOR[e.dmgKind] ?? 0xffffff;
      const dx = e.dir ? e.dir.x * 4 : 0, dz = e.dir ? e.dir.z * 4 : 0;
      sparks(e.pos.x, e.pos.y + 1, e.pos.z, 5, hex, 7, 0.26, 0.3, 1.8, dx, 0, dz, 0.9);
      flashStar(e.pos.x, e.pos.y + 1, e.pos.z, 0xffffff, 0.9, 0.12);
      const kc = KIND_COLORS[e.kind];
      if (kc && (e.kind === 'SLIME' || e.kind === 'SPLITTER')) chunks(e.pos.x, e.pos.y + 0.8, e.pos.z, 4, kc[0], kc[1], 5, 0.22);
      else if (e.kind === 'SKELETON_ARCHER') chunks(e.pos.x, e.pos.y + 1, e.pos.z, 3, kc![0], kc![1], 5, 0.18);
    }));

    off.push(on('enemyDeath', (e) => {
      const kc = KIND_COLORS[e.kind] || [0xffffff, 0xaaaaaa, 0xffffff];
      const s = e.scale || 1;
      const x = e.pos.x, y = e.pos.y + 0.8 * s, z = e.pos.z;
      const big = e.boss ? 4 : e.elite ? 1.8 : 1;
      glowPuff(x, y, z, kc[2], 2.4 * s * big, 0.3, 1.2, 0.7);
      chunks(x, y, z, Math.round(10 * s * big), kc[0], kc[1], 7 * Math.min(2, s), 0.3 * s);
      smokePuff(x, 0.4, z, Math.round(5 * big), kc[1], 1.4 * s, 0.8, 1.2, 2, 0.45);
      sparks(x, y, z, Math.round(8 * big), kc[2], 9, 0.3, 0.45, 1.6);
      if (e.kind === 'SLIME' || e.kind === 'SPLITTER') splat(x, z, 2.2 * s, kc[0], 6);
      else scorch(x, z, 1.2 * s * (big > 1 ? 1.5 : 1), 3, 0.28);
      if (e.elite || e.boss) { ringBurst(x, 0.3, z, kc[2], 0.5, 5 * big, 0.6); flashLight(x, 2.5, z, kc[2], 22, 0.35); }
      if (e.boss) { for (let i = 0; i < 6; i++) setTimeout(() => { sparks(x + (Math.random() - 0.5) * 5, 1 + Math.random() * 3, z + (Math.random() - 0.5) * 5, 14, kc[2], 12, 0.4, 0.6, 2); }, i * 90); }
    }));

    off.push(on('explosion', (e) => {
      const r = e.radius, x = e.pos.x, y = Math.max(0.6, e.pos.y), z = e.pos.z;
      const hex = e.color || 0xff8a1a;
      flashStar(x, y + 0.5, z, 0xffffff, r * 1.9, 0.2);
      glowPuff(x, y + 0.6, z, 0xffc060, r * 2.6, 0.32, 1.6, 0.9);
      ringBurst(x, 0.25, z, hex, r * 0.3, r * 1.15, 0.5, 1.6);
      // fire billows
      const n = Math.min(40, Math.round(r * 9));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = (0.4 + Math.random()) * r * 1.9, h = Math.random();
        FX.add.emit(x, y * 0.7, z, Math.cos(a) * sp, 1 + h * r * 1.4, Math.sin(a) * sp, 0.45 + Math.random() * 0.45, r * 0.5, r * 0.15, 3 - h, 1.3 - h * 0.7, 0.25, 0.9, CELL.FLAME, -2.2, 3.2, 0, 0, 0);
      }
      smokePuff(x, y, z, Math.min(12, Math.round(r * 2.4)), 0x3a3430, r * 0.8, 1.4, 2.2, r * 0.9, 0.5);
      sparks(x, y, z, Math.round(r * 6), hex, r * 4.5, 0.32, 0.6, 2);
      chunks(x, y, z, Math.round(r * 2.4), 0x6b4a2a, 0x3a3a3a, r * 2.4, 0.3);
      dustPuff(x, z, 6, r * 0.7, 0xc9b88a, r * 1.8);
      scorch(x, z, r * 1.5, 8, 0.6);
      if (quality().lights) flashLight(x, y + 2, z, 0xff9a40, 60, 0.4);
    }));

    off.push(on('shockwave', (e) => {
      const r = e.radius, x = e.pos.x, z = e.pos.z;
      dustPuff(x, z, 2, 1.2, 0xcdbd98, 1);
      for (let i = 0; i < Math.round(Math.min(26, r * 2.5)); i++) {
        const a = (i / Math.min(26, r * 2.5)) * TAU + Math.random() * 0.2;
        const sp = r * 1.6;
        FX.norm.emit(x + Math.cos(a) * 0.6, 0.3, z + Math.sin(a) * 0.6, Math.cos(a) * sp, 0.6, Math.sin(a) * sp, 0.6, 1.0, 1.9, 0.82, 0.75, 0.58, 0.55, CELL.SMOKE, 0, 3, Math.random() * 6, 0.5, 0);
      }
      ringBurst(x, 0.3, z, e.color || 0xffe0a0, r * 0.2, r, 0.45, 1.3);
      DECALS.add(x, z, r * 0.3, r * 1.1, 0.5, 1, 0.9, 0.7, 0.6, CELL.RINGW);
      scorch(x, z, r * 0.5, 4, 0.35);
      DECALS.add(x, z, r * 0.9, r * 0.9, 6, 0.05, 0.04, 0.03, 0.4, CELL.CRACK);
    }));

    off.push(on('lightning', (e) => {
      bolt(e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z);
      bolt(e.from.x, e.from.y, e.from.z, e.to.x, e.to.y, e.to.z, 0xffffff, 0.25);
      glowPuff(e.to.x, e.to.y + 0.3, e.to.z, 0xcfe0ff, 3.2, 0.25, 1.6, 0.9);
      flashStar(e.to.x, e.to.y + 0.8, e.to.z, 0xffffff, 3, 0.2);
      sparks(e.to.x, e.to.y + 0.5, e.to.z, 10, 0xcfe4ff, 10, 0.3, 0.45, 2);
      scorch(e.to.x, e.to.z, 1.6, 6, 0.55);
      if (quality().lights) flashLight(e.to.x, e.to.y + 3, e.to.z, 0xaac4ff, 40, 0.25);
    }));

    off.push(on('frostNova', (e) => {
      const r = e.radius, x = e.pos.x, z = e.pos.z;
      // sharp frost: a crisp ring, a crown of ice spikes jutting up around the edge and flying shards (no soft mist)
      ringBurst(x, 0.3, z, 0xbfefff, r * 0.3, r, 0.35, 2.2);
      DECALS.add(x, z, r * 0.5, r * 1.02, 0.85, 0.75, 0.95, 1, 0.9, CELL.RINGW);
      const spikes = Math.round(10 + r * 1.6);
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * TAU + Math.random() * 0.2, rr = r * (0.75 + Math.random() * 0.25);
        FX.add.emit(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, 0, 3.5 + Math.random() * 2.5, 0, 0.9, 0.9 + Math.random() * 0.5, 0.05, 1.3, 2.0, 2.6, 1.0, CELL.SHARD, -6, 1.2, a, 0, 0);
      }
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * TAU, sp = r * (1.2 + Math.random() * 1.2);
        FX.add.emit(x, 0.6, z, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 0.45, 0.45, 0.1, 1.6, 2.2, 2.6, 0.95, CELL.SHARD, 4, 1.4, Math.random() * 6, Math.random() * 6, 0);
      }
    }));

    off.push(on('petStrike', (e) => petFx(e.pos.x, 1.1, e.pos.z, e.el, e.dx, e.dz, false, !!e.big)));
    off.push(on('petBurst', (e) => {   // Legendary / Mythic pet burst: an element-coloured blast ring + its impact + a sky strike
      const x = e.pos.x, z = e.pos.z, hex = EL_HEX[e.el] ?? 0xffd76a;
      ringBurst(x, 0.15, z, hex, 0.8, e.r, 0.55, 2);
      ringBurst(x, 0.2, z, 0xffffff, 0.5, e.r * 0.6, 0.4, 1.6);
      petFx(x, 1.2, z, e.el || 3, 0, 1, true, true);
      glowPuff(x, 1, z, hex, e.r * 0.9, 0.4, 1.8, 0.7);
      const n = e.tier === 2 ? 7 : 5;
      for (let k = 0; k < n; k++) {   // strikes falling around the target (starfall / flames / water spouts / shards)
        const a = Math.random() * TAU, rr = Math.random() * e.r * 0.8, sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
        _bc.setHex(hex);
        FX.add.emit(sx, 9, sz, 0, -28, 0, 0.32, 0.55, 0.2, _bc.r * 2.4, _bc.g * 2.4, _bc.b * 2.4, 1, CELL.STREAK, 0, 0, 0, 0, 0.12);
        window.setTimeout(() => { flashStar(sx, 0.5, sz, hex, 1.6, 0.2); sparks(sx, 0.4, sz, 5, hex, 6, 0.24, 0.3, 2); }, 280);
      }
      flashLight(x, 3, z, hex, 40, 0.4);
    }));

    off.push(on('projectileImpact', (e) => {
      const p = e.pos;
      if (e.kind === 'PET_BOLT' && e.tint !== undefined && e.tint > 20) { petFx(p.x, p.y, p.z, e.tint - 20, 0, 1, true, false); return; }
      switch (e.kind) {
        case 'ARROW': case 'RAIN_ARROW': case 'PIERCING_ARROW':
          sparks(p.x, p.y, p.z, 4, e.kind === 'PIERCING_ARROW' ? 0xffffff : 0xffe8b0, 5, 0.2, 0.25, 1.5); chunks(p.x, p.y, p.z, 2, 0x8a5a2a, 0xb88a50, 3, 0.14); break;
        case 'BURNING_ARROW': sparks(p.x, p.y, p.z, 7, 0xff7a1a, 6, 0.25, 0.4, 1.8); embers(p.x, p.y, p.z, 4); break;
        case 'FREEZING_ARROW': sparks(p.x, p.y, p.z, 7, 0x9fe4ff, 6, 0.25, 0.4, 1.8); chunks(p.x, p.y, p.z, 3, 0xbfeaff, 0x7fd0ff, 4, 0.18); break;
        case 'MAGIC': case 'PET_BOLT': case 'STORM':
          glowPuff(p.x, p.y, p.z, 0xc58bff, 1.8, 0.2, 1.6); sparks(p.x, p.y, p.z, 8, 0xd8a8ff, 7, 0.24, 0.35, 1.8); break;
        case 'FIREBALL': glowPuff(p.x, p.y, p.z, 0xffa040, 2.4, 0.25, 1.6); sparks(p.x, p.y, p.z, 8, 0xff8a2a, 8, 0.26, 0.4, 1.8); break;
        case 'AXE': case 'ORBITAL_BLADE': sparks(p.x, p.y, p.z, 7, 0xfff0c0, 8, 0.24, 0.3, 1.8); flashStar(p.x, p.y, p.z, 0xffffff, 1.0, 0.12); break;
        case 'ENEMY': default: glowPuff(p.x, p.y, p.z, 0xff4a4a, 1.5, 0.2, 1.6); sparks(p.x, p.y, p.z, 6, 0xff6a5a, 6, 0.22, 0.3, 1.7);
      }
    }));

    off.push(on('pickup', (e) => {
      const p = e.pos;
      const hex = e.kind === 'GOLD' ? 0xffd23a : e.kind === 'GEM' ? 0x5ae0ff : e.kind === 'HEALTH' ? 0xff4a6a : e.kind === 'XP' ? 0x6ad0ff : 0xffffff;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * TAU;
        FX.add.emit(p.x, p.y + 0.6, p.z, Math.cos(a) * 2, 2 + Math.random() * 2, Math.sin(a) * 2, 0.5, 0.35, 0.05, 2, 2, 2, 1, CELL.STAR, 4, 1, Math.random() * 3, 5, 0);
      }
      glowPuff(p.x, p.y + 0.5, p.z, hex, 1.1, 0.22, 1.5);
    }));

    off.push(on('crateBreak', (e: any) => {
      const p = e.pos, kind: string = e.kind || 'CRATE';
      const x = p.x, z = p.z;
      switch (kind) {
        case 'POT':
          chunks(x, 0.6, z, 10, 0xc4673a, 0x8a4524, 5, 0.26); dustPuff(x, z, 3, 0.8, 0xc9a07a, 1.2); break;
        case 'HAY':
          for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 4; FX.norm.emit(x, 0.7, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 1.2 + Math.random() * 0.6, 0.35, 0.25, 0.9, 0.72, 0.25, 1, CELL.STREAK, 6, 0.8, Math.random() * 6, (Math.random() - 0.5) * 8, 0); }
          dustPuff(x, z, 4, 1.0, 0xd8c070, 1.6); break;
        case 'CRYSTAL':
          for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, sp = 3 + Math.random() * 6; FX.add.emit(x, 0.8, z, Math.cos(a) * sp, 3 + Math.random() * 5, Math.sin(a) * sp, 0.9, 0.4, 0.08, i % 2 ? 0.5 : 1.2, i % 2 ? 1.8 : 0.7, 2.4, 1, CELL.SHARD, 14, 0.6, Math.random() * 6, (Math.random() - 0.5) * 14, 0); }
          glowPuff(x, 1, z, 0x8fe8ff, 4.5, 0.3, 1.6, 0.9); ringBurst(x, 0.3, z, 0x8fe8ff, 0.4, 3.4, 0.5, 1.6); sparks(x, 1, z, 14, 0xc88bff, 8, 0.3, 0.6, 2);
          flashLight(x, 2, z, 0x8fe8ff, 22, 0.35); break;
        case 'EXPLOSIVE_BARREL':
          chunks(x, 0.8, z, 10, 0xb8321f, 0x2a2a30, 7, 0.3); smokePuff(x, 0.6, z, 4, 0x2a2420, 1.6, 1.2, 1.5, 1.6, 0.5); break;
        case 'GRAVE':
          chunks(x, 0.7, z, 10, 0x9a9aa2, 0x6a6a72, 5, 0.3); dustPuff(x, z, 5, 1.1, 0x8a7a68, 1.6);
          for (let i = 0; i < 6; i++) FX.add.emit(x + (Math.random() - 0.5), 0.4, z + (Math.random() - 0.5), (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 1.4, 0.8, 1.2, 0.5, 0.9, 2.0, 0.5, CELL.SMOKE, 0, 0.6, Math.random() * 6, 0.5); break;
        case 'CART':
          chunks(x, 0.9, z, 14, 0x9a6a38, 0x6a4624, 7, 0.34); dustPuff(x, z, 6, 1.2, 0xc9ac7a, 2.2);
          for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, sp = 3 + Math.random() * 4; FX.add.emit(x, 1, z, Math.cos(a) * sp, 4 + Math.random() * 4, Math.sin(a) * sp, 0.9, 0.25, 0.05, 2.2, 1.7, 0.4, 1, CELL.STAR, 12, 0.5, Math.random() * 6, 6, 0); }
          break;
        case 'CHEST':
          chunks(x, 0.8, z, 12, 0x9a6a38, 0xe0b040, 6, 0.3); glowPuff(x, 1, z, 0xffd870, 3.5, 0.3, 1.5, 0.8); sparks(x, 1, z, 16, 0xffd23a, 8, 0.3, 0.6, 2); break;
        default:
          chunks(p.x, 0.8, p.z, 12, 0xa8733a, 0x6b4423, 6, 0.34); dustPuff(p.x, p.z, 5, 1, 0xc9ac7a, 1.8); sparks(p.x, 0.9, p.z, 4, 0xffd870, 5, 0.2, 0.4, 1.6);
      }
    }));

    off.push(on('spawn', (e) => {
      const p = e.pos;
      const hex = e.elite ? 0xffc040 : 0x9a6a3a;
      chunks(p.x, 0.2, p.z, e.elite ? 12 : 6, 0x6a4a2a, 0x4a3a20, 4, 0.22);
      dustPuff(p.x, p.z, 4, 0.9, 0xa8906a, 1.2);
      ringBurst(p.x, 0.2, p.z, hex, 0.3, e.elite ? 3 : 1.8, 0.45, 1.2);
      for (let i = 0; i < 8; i++) {  // swirl
        const a = (i / 8) * TAU;
        FX.add.emit(p.x + Math.cos(a) * 1.4, 0.1, p.z + Math.sin(a) * 1.4, -Math.sin(a) * 3, 2.5, Math.cos(a) * 3, 0.6, 0.35, 0.05, 1.4, 1.1, 0.6, 0.9, CELL.GLOW, 0, 0.5);
      }
    }));

    off.push(on('dash', (e) => {
      const p = e.from;
      dustPuff(p.x, p.z, 5, 0.9, 0xd9c9a3, 1.6);
      for (let i = 0; i < 10; i++) {
        FX.add.emit(p.x + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 0.8, -e.dir.x * 6, 0, -e.dir.z * 6, 0.3, 0.3, 0.05, 1.4, 1.4, 1.6, 0.9, CELL.STREAK, 0, 2, 0, 0, 0.08);
      }
    }));

    off.push(on('levelUp', (e) => {
      const p = e.pos;
      ringBurst(p.x, 0.2, p.z, 0xffd23a, 0.5, 5, 0.7, 1.8);
      DECALS.add(p.x, p.z, 1, 5, 0.8, 1, 0.8, 0.2, 0.7, CELL.RINGW);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU * 2.5;
        const h = (i / 28);
        setTimeout(() => {
          const pp = world.player.pos;
          FX.add.emit(pp.x + Math.cos(a) * 1.4, 0.1 + h * 0.2, pp.z + Math.sin(a) * 1.4, -Math.sin(a) * 1.5, 4 + Math.random() * 2, Math.cos(a) * 1.5, 1.1, 0.4, 0.05, 2.2, 1.8, 0.5, 1, CELL.STAR, 0, 0.3, Math.random() * 3, 3, 0);
        }, h * 450);
      }
      if (quality().lights) flashLight(p.x, 3, p.z, 0xffd870, 30, 0.6);
    }));

    off.push(on('playerHit', (e) => {
      sparks(e.pos.x, e.pos.y + 1.2, e.pos.z, 8, 0xff3a3a, 7, 0.26, 0.4, 1.7);
      glowPuff(e.pos.x, e.pos.y + 1.2, e.pos.z, 0xff5050, 2.0, 0.2, 1.3, 0.6);
    }));
    off.push(on('shieldBlock', (e) => {
      const ring = e.gold ? 0xffd24a : 0x7ad0ff, spark = e.gold ? 0xffe9a0 : 0x9fe4ff;   // Shield Wall: golden
      ringBurst(e.pos.x, 1.2, e.pos.z, ring, e.radius * 0.6, e.radius * 1.3, 0.4, 2);
      sparks(e.pos.x, 1.2, e.pos.z, 14, spark, 9, 0.28, 0.4, 2);
      glowPuff(e.pos.x, 1.2, e.pos.z, spark, e.radius * 2.4, 0.25, 1.4, 0.7);
    }));
    off.push(on('heal', (e) => {
      for (let i = 0; i < 6; i++) {
        FX.add.emit(e.pos.x + (Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 0.8, e.pos.z + (Math.random() - 0.5) * 1.4, 0, 1.8 + Math.random(), 0, 1.0, 0.5, 0.35, 0.5, 2.2, 0.8, 0.95, CELL.PLUS, 0, 0.2, 0, 0, 0);
      }
    }));
    off.push(on('shoot', (e) => {
      const hex = e.kind === 'FIREBALL' || e.kind === 'BURNING_ARROW' ? 0xff8a2a : e.kind === 'FREEZING_ARROW' ? 0x9fe4ff : e.kind === 'PIERCING_ARROW' || e.kind === 'GALE_ARROW' ? 0x7af0ff : e.kind === 'MAGIC' || e.kind === 'STORM' || e.kind === 'PET_BOLT' ? 0xc58bff : 0xfff0c0;
      const p = e.pos;
      glowPuff(p.x + e.dir.x * 0.8, p.y, p.z + e.dir.z * 0.8, hex, 0.9, 0.12, 1.4, 0.8);
      flashStar(p.x + e.dir.x * 1.0, p.y, p.z + e.dir.z * 1.0, hex, 0.7, 0.07);
    }));
    off.push(on('ability', (e) => {
      const p = e.pos;
      const hex = e.name === 'GALE_ARROW' ? 0x7affc8 : e.name === 'SHADOW_ROLL' ? 0xc0e0a0 : e.name === 'FAN_FLAMES' ? 0xff7a2a : e.name === 'LIGHT_ARROW' ? 0xffffff : e.name === 'FROST_FIELD' ? 0x8fe4ff : e.name === 'SINGULARITY' ? 0xa050ff : e.name === 'BLINK_NOVA' ? 0x9fe4ff : e.name === 'STORM_ORBS' ? 0x9ab8ff : e.name === 'CHAIN_FROST' ? 0x7fe4ff : e.name === 'BLOODRAGE_LEAP' ? 0xff3a2a : e.name === 'WHIRLWIND' ? 0xffc070 : e.name === 'EARTHSPLITTER' ? 0xc9a070 : e.name === 'BATTLE_CRY' ? 0xff8a3a : e.name === 'RAGE' ? 0xff3a2a : e.name === 'SPRINT' ? 0xaaff80 : e.name === 'EARTHWALL' ? 0xc9a070 : e.name === 'VITALITY' ? 0x7aff9a : e.name === 'GRAVITY_SPELL' ? 0xa050ff : e.name === 'FIREBALL' ? 0xff8a2a : e.name === 'PIERCING_SHOT' ? 0x7af0ff : 0xffe08a;
      ringBurst(p.x, 0.25, p.z, hex, 0.4, 3.2, 0.5, 1.6);
      sparks(p.x, 1.1, p.z, 12, hex, 8, 0.26, 0.45, 1.8);
      if (e.name === 'EARTHWALL') { dustPuff(p.x, p.z, 8, 1.3, 0xb8a078, 4); }
    }));
    // ------------------------------------------------ active-kit events --
    off.push(on('fxImpact', (e) => {
      const p = e.pos, r = e.radius;
      switch (e.kind) {
        case 'RAIN_ARROW':
          flashStar(p.x, 0.5, p.z, 0xfff0b0, r * 0.9, 0.14);
          sparks(p.x, 0.4, p.z, 3, 0xffd870, 6, 0.22, 0.28, 1.8);
          ringBurst(p.x, 0.15, p.z, 0xffc860, r * 0.2, r * 0.9, 0.28, 1.4);
          break;
        case 'METEOR':
          glowPuff(p.x, 0.8, p.z, 0xffa040, r * 1.8, 0.3, 1.6, 0.9);
          flashStar(p.x, 0.8, p.z, 0xffffff, r * 1.4, 0.18);
          ringBurst(p.x, 0.2, p.z, 0xff7a1a, r * 0.3, r * 1.3, 0.45, 1.6);
          sparks(p.x, 0.8, p.z, 10, 0xff8a2a, 9, 0.3, 0.5, 1.9);
          smokePuff(p.x, 0.5, p.z, 3, 0x2a2420, r * 0.5, 1.0, 1.6, 1.4, 0.5);
          scorch(p.x, p.z, r * 1.1, 8, 0.5);
          break;
        case 'SPIKE':
          chunks(p.x, 0.6, p.z, 4, 0x8e8576, 0x6a6258, 5, 0.26);
          dustPuff(p.x, p.z, 2, r * 0.45, 0xb8a888, r);
          break;
        default: // ROCK
          chunks(p.x, 0.6, p.z, 6, 0x8a7a6a, 0x5a4e44, 6, 0.3);
          dustPuff(p.x, p.z, 3, r * 0.5, 0xa89878, r);
          ringBurst(p.x, 0.2, p.z, 0xc9b08a, r * 0.3, r * 1.2, 0.35, 1.2);
      }
    }));
    off.push(on('blink', (e) => {
      for (const p of [e.from, e.to]) {
        glowPuff(p.x, 1.2, p.z, 0xb8e8ff, 4.5, 0.35, 1.8, 0.9);
        flashStar(p.x, 1.2, p.z, 0xffffff, 5, 0.22);
        sparks(p.x, 1.2, p.z, 22, 0xa8e0ff, 11, 0.32, 0.6, 2.2);
        for (let i = 0; i < 14; i++) FX.add.emit(p.x + (Math.random() - 0.5) * 1.6, 0.2, p.z + (Math.random() - 0.5) * 1.6, 0, 8 + Math.random() * 6, 0, 0.5, 0.5, 0.05, 0.8, 1.7, 2.6, 0.8, CELL.STREAK, 0, 0.5, 0, 0, 0.14);
        ringBurst(p.x, 0.2, p.z, 0x9fe4ff, 0.5, 4.5, 0.4, 1.8);
      }
      if (quality().lights) flashLight(e.to.x, 3, e.to.z, 0x9fd8ff, 40, 0.4);
    }));
    off.push(on('leap', (e) => {
      dustPuff(e.from.x, e.from.z, 6, 1.2, 0xcdbd98, 2.4);
      ringBurst(e.from.x, 0.2, e.from.z, 0xff5a3a, 0.5, 4.5, 0.4, 1.6);
      scorch(e.to.x, e.to.z, 3, 0.8, 0.0);
      for (let i = 0; i < 8; i++) setTimeout(() => {
        const k = (i + 1) / 9, pl = world.player.pos;
        void pl;
        const x = e.from.x + (e.to.x - e.from.x) * k, z = e.from.z + (e.to.z - e.from.z) * k, y = 1 + 24 * k * (1 - k) * 0.25 * 4;
        FX.add.emit(x, y, z, 0, 0, 0, 0.45, 1.8, 0.2, 2.4, 0.4, 0.15, 0.55, CELL.GLOW);
      }, i * e.dur * 1000 / 9);
    }));
    off.push(on('crater', (e) => {
      const r = e.radius, x = e.pos.x, z = e.pos.z;
      DECALS.add(x, z, r * 1.7, r * 1.7, 20, 0.04, 0.03, 0.025, 0.7, CELL.SCORCH);
      DECALS.add(x, z, r * 2.2, r * 2.2, 22, 0.05, 0.04, 0.03, 0.55, CELL.CRACK);
      DECALS.add(x, z, r * 1.2, r * 1.2, 16, 1.6, 0.5, 0.1, 0.35, CELL.SPLAT);
      chunks(x, 0.8, z, Math.round(10 + r), 0x6b5a48, 0x3a3228, r * 1.1, 0.4);
    }));
    off.push(on('shout', (e) => {
      const r = e.radius, x = e.pos.x, z = e.pos.z;
      for (let i = 0; i < 3; i++) setTimeout(() => {
        const pp = world.player.pos;
        ringBurst(pp.x, 0.4 + i * 0.3, pp.z, i === 1 ? 0xffd070 : 0xff6a3a, r * 0.1, r, 0.5, 1.8);
        DECALS.add(pp.x, pp.z, r * 0.2, r * 1.05, 0.55, 1, 0.55, 0.25, 0.65, CELL.RINGW);
      }, i * 110);
      dustPuff(x, z, 8, 1.6, 0xcdbd98, r * 0.5);
      glowPuff(x, 1.5, z, 0xffa860, r * 0.8, 0.35, 1.5, 0.5);
      sparks(x, 1.4, z, 28, 0xffb060, r * 1.4, 0.34, 0.6, 2);
      if (quality().lights) flashLight(x, 3, z, 0xff9050, 40, 0.5);
    }));
    off.push(on('fissure', (e) => {
      const n = Math.max(4, Math.round(e.length / 4));
      for (let i = 0; i < n; i++) {
        const d = ((i + 0.5) / n) * e.length, x = e.from.x + e.dir.x * d, z = e.from.z + e.dir.z * d;
        DECALS.add(x, z, 6.5, 6.5, 6, 0.05, 0.04, 0.03, 0.7, CELL.CRACK, Math.atan2(e.dir.x, e.dir.z) + (Math.random() - 0.5) * 0.3);
        DECALS.add(x, z, 2.6, 2.6, 5, 1.8, 0.5, 0.1, 0.4, CELL.GLOW);
      }
    }));
    off.push(on('quake', (e) => {
      ringBurst(e.pos.x, 0.25, e.pos.z, 0xd9b27a, e.radius * 0.2, e.radius, 0.4, 1.4);
      dustPuff(e.pos.x, e.pos.z, 4, 1.4, 0xc9b88a, e.radius * 0.5);
      DECALS.add(e.pos.x, e.pos.z, e.radius * 0.7, e.radius * 0.7, 3.5, 0.05, 0.04, 0.03, 0.4, CELL.CRACK);
      chunks(e.pos.x, 0.5, e.pos.z, 6, 0x7a6a58, 0x4a4036, e.radius * 0.6, 0.3);
    }));
    off.push(on('ultStart', (e) => {
      const p = e.pos;
      const hex = e.hero === 'ARCHER' ? 0xffd870 : e.hero === 'WIZARD' ? 0xff7a3a : 0xff9a3a;
      for (let i = 0; i < 2; i++) setTimeout(() => {
        const pp = world.player.pos;
        ringBurst(pp.x, 0.3, pp.z, hex, 1, 12 + i * 5, 0.7, 2);
      }, i * 140);
      DECALS.add(p.x, p.z, 2, 14, 0.9, 1, 0.8, 0.3, 0.7, CELL.RINGW);
      sparks(p.x, 1.2, p.z, 28, hex, 14, 0.4, 0.8, 2.2);
      glowPuff(p.x, 1.4, p.z, hex, 9, 0.5, 1.6, 0.7);
      if (quality().lights) flashLight(p.x, 4, p.z, hex, 70, 0.8);
    }));
    off.push(on('ultImpact', (e) => {
      const x = e.pos.x, z = e.pos.z;
      if (e.name === 'METEOR') {
        flashStar(x, 3, z, 0xffffff, 60, 0.45);
        glowPuff(x, 4, z, 0xffb060, 36, 0.8, 1.8, 0.9);
        for (let i = 0; i < 2; i++) setTimeout(() => ringBurst(x, 0.4, z, i === 0 ? 0xffffff : 0xff8a3a, 3, 26 + i * 8, 0.8, 2), i * 120);
        for (let i = 0; i < 48; i++) {
          const a = Math.random() * TAU, sp = 12 + Math.random() * 26, h = Math.random();
          FX.add.emit(x, 1, z, Math.cos(a) * sp, 6 + h * 22, Math.sin(a) * sp, 0.9 + Math.random() * 0.8, 2.6, 0.5, 3 - h, 1.3 - h * 0.8, 0.25, 0.9, CELL.FLAME, 14, 1.1);
        }
        smokePuff(x, 1, z, 10, 0x241c18, 8, 2.4, 6, 12, 0.6);
        chunks(x, 2, z, 12, 0x6b4a2a, 0x2a2420, 18, 0.5);
        if (quality().lights) flashLight(x, 8, z, 0xff9040, 140, 1.0);
      } else if (e.name === 'JUDGMENT') {   // one ray of holy light from the sky
        const R = e.radius;
        for (let k = 0; k < 9; k++) glowPuff(x, 1 + k * 2.2, z, k < 2 ? 0xffffff : 0xffe7a0, 2.6 - k * 0.12, 0.32, 2.2, 0.85);
        for (let k = 0; k < 14; k++) { const o = (Math.random() - 0.5) * R * 0.5, o2 = (Math.random() - 0.5) * R * 0.5; FX.add.emit(x + o, 14 + Math.random() * 6, z + o2, 0, -70, 0, 0.26, 0.7, 0.4, 2.4, 2.2, 1.6, 1, CELL.STREAK, 0, 0, 0, 0, 0.06); }
        flashStar(x, 1.2, z, 0xffffff, 7, 0.25);
        ringBurst(x, 0.3, z, 0xffe08a, 0.6, R * 1.4, 0.45, 2);
        sparks(x, 0.8, z, 16, 0xfff0b0, 12, 0.35, 0.5, 2.2);
        if (quality().lights) flashLight(x, 4, z, 0xffe090, 40, 0.3);
      } else if (e.name === 'TITAN_SLAM') {
        flashStar(x, 2, z, 0xffe0a0, 22, 0.35);
        for (let i = 0; i < 2; i++) setTimeout(() => ringBurst(x, 0.4, z, 0xd9b27a, 2, 18 + i * 6, 0.7, 1.8), i * 130);
        dustPuff(x, z, 9, 3, 0xcdbd98, 12);
        chunks(x, 2, z, 10, 0x7a6a58, 0x4a4036, 10, 0.4);
        if (quality().lights) flashLight(x, 6, z, 0xffb060, 90, 0.8);
      } else { // FINAL_VOLLEY
        flashStar(x, 2, z, 0xfff0b0, 20, 0.35);
        for (let i = 0; i < 2; i++) setTimeout(() => ringBurst(x, 0.4, z, 0xffd870, 2, 16 + i * 6, 0.7, 2), i * 120);
        sparks(x, 2, z, 40, 0xffe090, 20, 0.4, 0.9, 2.2);
        if (quality().lights) flashLight(x, 6, z, 0xffe090, 80, 0.7);
      }
    }));
    off.push(on('playerRevive', (e) => {
      if (e.source === 'ANKH') {   // Ankh of Life: a column of light falls on the hero, golden rings ripple out, motes rise
        const x = e.pos.x, z = e.pos.z;
        for (let i = 0; i < 70; i++) {   // the pillar
          const a = Math.random() * TAU, r = Math.random() * 1.1;
          FX.add.emit(x + Math.cos(a) * r, Math.random() * 1.5, z + Math.sin(a) * r, 0, 6 + Math.random() * 8, 0, 1.0 + Math.random() * 0.6, 0.55, 0.1, 2.4, 2.1, 1.2, 0.9, CELL.STREAK, -2, 0.4, 0, 0, 0.12);
        }
        for (let h = 0; h < 6; h++) glowPuff(x, 0.6 + h * 1.6, z, 0xffe8a0, 4.5 - h * 0.4, 0.9 + h * 0.08, 1.8, 0.75);
        for (let k = 0; k < 3; k++) window.setTimeout(() => ringBurst(x, 0.25, z, 0xffd76a, 0.6, 6 + k * 3, 0.9, 2.2), k * 220);
        for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; FX.add.emit(x + Math.cos(a) * 3.5, 0.3, z + Math.sin(a) * 3.5, -Math.cos(a) * 2.5, 2.5 + Math.random() * 2, -Math.sin(a) * 2.5, 1.3, 0.35, 0.05, 2.4, 2.2, 1.4, 1, CELL.STAR, -1, 0.6, 0, 3); }
        flashLight(x, 4, z, 0xffe8a0, 90, 1.2);
        events.emit('floatText', { pos: e.pos, text: 'ANKH OF LIFE', color: 0xffd76a, scale: 1.3, dy: 3 });
      }
      ringBurst(e.pos.x, 0.3, e.pos.z, 0xfff0a0, 0.5, 7, 0.8, 2);
      sparks(e.pos.x, 1, e.pos.z, 30, 0xfff0a0, 11, 0.32, 0.8, 2);
      glowPuff(e.pos.x, 1.2, e.pos.z, 0xffffff, 5, 0.5, 1.5, 0.8);
      flashLight(e.pos.x, 3, e.pos.z, 0xffe8a0, 50, 0.7);
    }));
    // crit pop: bigger star burst on the target
    off.push(on('damage', (e) => {
      if (e.toPlayer || !e.crit || e.dot) return;
      const p = e.pos;
      flashStar(p.x, p.y + 1.2, p.z, 0xfff2b0, 2.2, 0.16);
      sparks(p.x, p.y + 1.2, p.z, 10, 0xffd23a, 10, 0.36, 0.4, 2.2);
    }));
    // elite / boss kill confetti
    off.push(on('enemyDeath', (e) => {
      if ((!e.elite && !e.boss) || e.poof) return;
      const cols = [0xff5a5a, 0xffd23a, 0x5ad0ff, 0xa86bff, 0x6bff9a];
      const n = e.boss ? 40 : 22;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 3 + Math.random() * 6, c = cols[i % 5];
        FX.add.emit(e.pos.x, e.pos.y + 1, e.pos.z, Math.cos(a) * sp, 5 + Math.random() * 5, Math.sin(a) * sp, 1.1 + Math.random() * 0.5, 0.3, 0.2, ((c >> 16) & 255) / 120, ((c >> 8) & 255) / 120, (c & 255) / 120, 1, CELL.STAR, 9, 0.7, Math.random() * 6, (Math.random() - 0.5) * 12, 0);
      }
    }));
    // dark hero champion (engine/systems/darkHero.ts): the hero's own effects, dyed violet
    off.push(on('darkFx', (e) => {
      const x = e.pos.x, z = e.pos.z, r = e.radius;
      switch (e.kind) {
        case 'RAIN':   // one violet light-arrow lands
          flashStar(x, 0.5, z, 0xd8b0ff, r * 0.8, 0.14);
          sparks(x, 0.4, z, 3, 0xb070ff, 6, 0.22, 0.28, 1.8);
          ringBurst(x, 0.15, z, 0x9a5aff, r * 0.2, r * 0.9, 0.28, 1.4);
          break;
        case 'VOLLEY':   // Storm of a Thousand Arrows: the final volley
          flashStar(x, 2, z, 0xe0c0ff, 20, 0.35);
          for (let i = 0; i < 2; i++) setTimeout(() => ringBurst(x, 0.4, z, 0xa060ff, 2, r * 1.5 + i * 5, 0.7, 2), i * 120);
          sparks(x, 2, z, 40, 0xc090ff, 20, 0.4, 0.9, 2.2);
          if (quality().lights) flashLight(x, 6, z, 0xa070ff, 80, 0.7);
          break;
        case 'JUDGMENT': case 'THUNDER': case 'AVATAR': {   // a ray / column from the sky (Judgment, Smite, Divine Avatar, Thunder)
          const big = e.kind === 'AVATAR', th = e.kind === 'THUNDER';
          if (th) { bolt(x + 1, 16, z - 1, x, 0.3, z, 0xc8b0ff, 0.6); bolt(x + 1, 16, z - 1, x, 0.3, z, 0xffffff, 0.22); }
          else {
            for (let k = 0; k < 9; k++) glowPuff(x, 1 + k * 2.2, z, k < 2 ? 0xffffff : 0xd8b0ff, (big ? 5 : 2.6) - k * 0.12, 0.32, 2.2, 0.85);
            for (let k = 0; k < (big ? 26 : 14); k++) { const o = (Math.random() - 0.5) * r * 0.5, o2 = (Math.random() - 0.5) * r * 0.5; FX.add.emit(x + o, 14 + Math.random() * 6, z + o2, 0, -70, 0, 0.26, 0.7, 0.4, 1.8, 1.0, 2.6, 1, CELL.STREAK, 0, 0, 0, 0, 0.06); }
          }
          flashStar(x, 1.2, z, 0xffffff, big ? 14 : 7, 0.25);
          ringBurst(x, 0.3, z, 0xc890ff, 0.6, r * 1.3, 0.45, 2);
          sparks(x, 0.8, z, big ? 30 : 16, 0xe0c8ff, 12, 0.35, 0.5, 2.2);
          if (quality().lights) flashLight(x, 4, z, 0xb080ff, big ? 70 : 40, 0.3);
          break;
        }
        case 'NOVA': case 'SOUL': {   // Blink Nova frost / Soul Step bone burst
          const soul = e.kind === 'SOUL';
          ringBurst(x, 0.3, z, soul ? 0xd8d0b8 : 0xb8c8ff, r * 0.3, r, 0.4, 2);
          DECALS.add(x, z, r * 0.5, r * 1.02, 0.8, 0.6, 0.5, 1, 0.8, CELL.RINGW);
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * TAU, sp = r * (1.2 + Math.random());
            FX.add.emit(x, 0.6, z, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 0.45, 0.45, 0.1, soul ? 1.8 : 1.3, soul ? 1.7 : 1.4, soul ? 1.5 : 2.6, 0.95, CELL.SHARD, 4, 1.4, Math.random() * 6, Math.random() * 6, 0);
          }
          glowPuff(x, 1, z, soul ? 0x9a6bd8 : 0x9fb8ff, r * 0.9, 0.3, 1.5, 0.6);
          break;
        }
        case 'BLINK': case 'ROLL': {   // Blink Nova / Soul Step teleport, Shadow Roll smoke
          const pts = e.to ? [e.pos, e.to] : [e.pos];
          for (const p of pts) {
            glowPuff(p.x, 1.2, p.z, 0xa070ff, e.kind === 'ROLL' ? 2.5 : 4.5, 0.35, 1.8, 0.9);
            sparks(p.x, 1.2, p.z, e.kind === 'ROLL' ? 10 : 22, 0xc090ff, 11, 0.32, 0.6, 2.2);
            smokePuff(p.x, 0.6, p.z, 3, 0x2a1a3a, 1.4, 0.8, 1.2, 1.2, 0.5);
            if (e.kind === 'BLINK') ringBurst(p.x, 0.2, p.z, 0x9a5aff, 0.5, r, 0.4, 1.8);
          }
          break;
        }
        case 'GUARD':   // Shield Wall burst
          ringBurst(x, 1.2, z, 0xd8b0ff, 1, r, 0.4, 2);
          sparks(x, 1.2, z, 18, 0xe8d0ff, 9, 0.28, 0.4, 2);
          glowPuff(x, 1.2, z, 0xc8a0ff, 6, 0.3, 1.4, 0.7);
          break;
        case 'ROAR': case 'SLAM': case 'STAMP': {   // Titan's Wrath roar / final slam, Bloodrage landing, Stamp
          const roar = e.kind === 'ROAR';
          for (let i = 0; i < 3; i++) setTimeout(() => ringBurst(x, 0.4 + i * 0.3, z, i === 1 ? 0xff7a9a : 0xb04aff, r * 0.1, r, 0.5, 1.8), i * 110);
          dustPuff(x, z, roar ? 8 : 6, 1.6, 0x8a7a8a, r * 0.5);
          if (!roar) { DECALS.add(x, z, r * 0.7, r * 0.7, 3.5, 0.05, 0.04, 0.03, 0.45, CELL.CRACK); chunks(x, 0.5, z, 8, 0x5a4a58, 0x3a3036, r * 0.6, 0.3); }
          glowPuff(x, 1.5, z, 0xc050ff, r * 0.7, 0.35, 1.5, 0.5);
          sparks(x, 1.4, z, roar ? 28 : 16, 0xff70a0, r * 1.3, 0.34, 0.6, 2);
          if (quality().lights) flashLight(x, 3, z, 0xb050ff, 40, 0.5);
          break;
        }
        case 'ULT': {   // a champion begins its ultimate
          for (let i = 0; i < 2; i++) setTimeout(() => ringBurst(x, 0.3, z, 0xb060ff, 1, 9 + i * 5, 0.7, 2), i * 140);
          sparks(x, 1.2, z, 28, 0xd090ff, 14, 0.4, 0.8, 2.2);
          glowPuff(x, 1.4, z, 0x9a40ff, 7, 0.5, 1.6, 0.7);
          if (quality().lights) flashLight(x, 4, z, 0xa050ff, 70, 0.8);
          break;
        }
        default: break;
      }
    }));
    off.push(on('bossSpawn', () => { pendingBoss = 0.15; }));
    off.push(on('runStart', () => { FX.add.clear(); FX.norm.clear(); DECALS.clear(); }));
    return () => off.forEach((f) => f());
  }, []);

  useFrame((_, dtRaw) => {
    FX.halo.n = 0;   // immediate-mode halos are re-pushed by their owners each frame
    const paused = useGameStore.getState().status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dtRaw, 1 / 20);
    if (dt > 0) {
      FX.add.update(dt); FX.norm.update(dt); DECALS.update(dt);
      for (const f of FLASHES) if (f.life > 0) f.life -= dt;
      const st = useGameStore.getState().status;
      const pl = world.player;
      if (st === GameStatus.PLAYING && pl.alive) {
        // footsteps
        const s = Math.sin(pl.anim.stepPhase);
        if (pl.anim.moveBlend > 0.5 && ((s > 0) !== (stepPrev > 0))) dustPuff(pl.pos.x + (Math.random() - 0.5) * 0.4, pl.pos.z + (Math.random() - 0.5) * 0.4, 1, 0.55, 0xcdbf9a, 0.7);
        stepPrev = s;
        // pollen motes
        pollenT += dt;
        if (pollenT > 0.09 && FX.scale > 0.5) {
          pollenT = 0;
          const a = Math.random() * TAU, r = 6 + Math.random() * 22;
          FX.add.emit(pl.pos.x + Math.cos(a) * r, 0.5 + Math.random() * 3, pl.pos.z + Math.sin(a) * r, 0.6, 0.3, 0.2, 4, 0.14, 0.1, 1.3, 1.2, 0.6, 0.55, CELL.GLOW, 0, 0.2);
        }
        if (pendingBoss > 0) {
          pendingBoss -= dt;
          if (pendingBoss <= 0) {
            for (const e of world.enemies) if (e.active && e.boss) {
              ringBurst(e.pos.x, 0.3, e.pos.z, 0x9a40ff, 1, 14, 0.9, 1.8);
              smokePuff(e.pos.x, 0.5, e.pos.z, 14, 0x2a1a3a, 3, 1.4, 2, 5, 0.6);
              sparks(e.pos.x, 2, e.pos.z, 30, 0xc070ff, 14, 0.4, 0.8, 2);
              flashLight(e.pos.x, 4, e.pos.z, 0x9a40ff, 60, 0.9);
              break;
            }
          }
        }
      }
    }
  }, -0.5);

  return (
    <>
      <DecalLayer />
      <ParticleLayer sys={FX.norm} additive={false} />
      <ParticleLayer sys={FX.add} additive />
      {q.lights && <FlashLights />}
    </>
  );
}

/** Mount LAST in the scene so its upload runs after every owner pushed this frame's halos. */
export function HaloLayer() { return <ParticleLayer sys={FX.halo} additive />; }
