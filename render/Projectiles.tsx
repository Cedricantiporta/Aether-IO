// Instanced projectile renderers (player + enemy) with particle trails and shader-based fireball / tornado.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, ConeGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Euler, InstancedMesh, Material, MeshBasicMaterial,
  MeshStandardMaterial, Group, Matrix4, Object3D, Quaternion, ShaderMaterial, Vector3, IcosahedronGeometry,
} from 'three';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, embers, pushHalo, sparks } from './fx';
import { GB, TAU, litMat } from './util';
import { makeAxe } from './weapons';
import { makeRockGeo } from './models';
import { inView } from './view';

const MAXP = 900, MAXE = 600;
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

const FIRE_VS = `uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vNo; ${NOISE}
void main(){
  float n = vn3(position * 2.2 + vec3(0.0, -uTime * 3.0, uTime * 0.5));
  vNo = n;
  vec3 p = position * (1.0 + (n - 0.4) * 0.55);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FS = `varying vec3 vN; varying vec3 vV; varying float vNo;
void main(){
  float f = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float heat = clamp(vNo * 1.2 + (1.0 - f) * 0.6, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.1), smoothstep(0.2, 0.6, heat));
  col = mix(col, vec3(1.0, 0.95, 0.6), smoothstep(0.6, 1.0, heat));
  col *= 1.6 + (1.0 - f) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const TORN_VS = `uniform float uTime; varying vec2 vUv; varying float vY; ${NOISE}
void main(){
  vUv = uv; vY = uv.y;
  vec3 p = position;
  float tw = uv.y * 4.0 - uTime * 3.5;
  float c = cos(tw), s = sin(tw);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.xz += vec2(sin(uTime * 2.0 + uv.y * 5.0), cos(uTime * 1.7 + uv.y * 4.0)) * 0.12 * uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const TORN_FS = `uniform float uTime; varying vec2 vUv; varying float vY; ${NOISE}
void main(){
  float st = vn3(vec3(vUv.x * 14.0, vUv.y * 6.0 - uTime * 3.0, uTime * 0.4));
  float st2 = 0.5 + 0.5 * sin(vUv.x * 40.0 + vUv.y * 8.0 - uTime * 6.0);
  float a = (0.15 + 0.5 * st * st2) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  vec3 col = mix(vec3(0.75, 0.85, 0.95), vec3(0.45, 0.65, 1.0), vUv.y) * 1.3;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function arrow(shaft: string, head: string, fletch: string, glowHead?: string, len = 1.1) {
  const b = new GB([0.85, 1.1]), g = new GB([1, 1]);
  b.cyl(0.028, 0.028, len, 5, [0, 0, 0], shaft, [Math.PI / 2, 0, 0]);
  if (glowHead) g.cone(0.07, 0.28, 5, [0, 0, len / 2 + 0.13], glowHead, [Math.PI / 2, 0, 0]);
  else b.cone(0.07, 0.26, 4, [0, 0, len / 2 + 0.12], head, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; b.box(0.012, 0.15, 0.22, [Math.sin(a) * 0.07, Math.cos(a) * 0.07, -len / 2 + 0.12], fletch, [0, 0, -a]); }
  b.sph(0.035, [0, 0, -len / 2], '#222', 1, 4);
  return { body: b.build(), glow: g.build() };
}

type MeshSet = { meshes: InstancedMesh[] };

export function Projectiles() {
  const sys = useMemo(() => {
    const group = new Group();
    const lit = litMat({ roughness: 0.55, metalness: 0.2 });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.8, 1.8) });
    const fireMat = new ShaderMaterial({ vertexShader: FIRE_VS, fragmentShader: FIRE_FS, uniforms: { uTime: { value: 0 } } });
    const tornMat = new ShaderMaterial({ vertexShader: TORN_VS, fragmentShader: TORN_FS, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: DoubleSide });
    const mk = (parts: [BufferGeometry, Material][], cap: number) => parts.map(([g, m]) => {
      const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); group.add(im); return im;
    });
    const castLit = (ims: InstancedMesh[]) => ims;
    void castLit;
    const arr = arrow('#8a5a30', '#c8ccd2', '#f2f2f2');
    const rain = arrow('#c8a050', '#e0e4ea', '#ffd860', undefined, 0.9);
    const burn = arrow('#6a3a20', '#c8ccd2', '#ff7a2a', '#ff9a30');
    const frz = arrow('#8ab0c8', '#c8ccd2', '#bfeaff', '#7fe0ff');
    // piercing: huge spectral arrow
    const pa = new GB([1, 1]);
    pa.cyl(0.07, 0.07, 2.6, 6, [0, 0, -0.3], '#c8ffff', [Math.PI / 2, 0, 0]); pa.cone(0.2, 0.9, 6, [0, 0, 1.45], '#e8ffff', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; pa.box(0.02, 0.5, 0.8, [Math.sin(a) * 0.12, Math.cos(a) * 0.12, -1.4], '#40e0ff', [0, 0, -a]); }
    pa.torus(0.26, 0.03, [0, 0, 0.6], '#6ff0ff', [0, 0, 0], 1, 14); pa.torus(0.34, 0.03, [0, 0, -0.2], '#6ff0ff', [0, 0, 0], 1, 14);
    // gale arrow: giant wind arrow with rings
    const ga = new GB([1, 1]);
    ga.cyl(0.1, 0.1, 4.2, 6, [0, 0, -0.6], '#d8fff0', [Math.PI / 2, 0, 0]); ga.cone(0.34, 1.4, 6, [0, 0, 2.0], '#ffffff', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; ga.box(0.03, 0.8, 1.3, [Math.sin(a) * 0.2, Math.cos(a) * 0.2, -2.4], '#7affc8', [0, 0, -a]); }
    ga.torus(0.5, 0.05, [0, 0, 0.9], '#aaffe0', [0, 0, 0], 1, 16); ga.torus(0.7, 0.05, [0, 0, -0.3], '#aaffe0', [0, 0, 0], 1, 16); ga.torus(0.9, 0.05, [0, 0, -1.5], '#aaffe0', [0, 0, 0], 1, 16);
    // axe (flat spin)
    const aw = makeAxe('#ffb060', 1);
    const axeB = new GB().addColored(aw.body, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    const axeG = new GB().addColored(aw.glow, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    // orbital blade
    const bl = new GB([1, 1]);
    bl.torus(0.62, 0.08, [0, 0, 0], '#8ff4ff', [Math.PI / 2, 0, 0], [1, 1, 0.7], 14, 2.3); bl.torus(0.5, 0.05, [0, 0, 0], '#ffffff', [Math.PI / 2, 0, 0], [1, 1, 0.5], 14, 2.0);
    const blB = new GB([0.9, 1.1]).box(0.1, 0.1, 0.5, [0.0, 0, -0.35], '#3a4a6a').build();
    // magic / pet / enemy orbs
    const orbG = (r: number, c1: string, c2: string) => new GB([1, 1]).ico(r, [0, 0, 0], c1, 1, 1).ico(r * 0.6, [0, 0, 0], c2, 1, 0).build();
    const earrow = arrow('#3a2a26', '#4a4a50', '#8a1a1a', '#ff3a2a');
    const rockG = makeRockGeo(901, '#8a7a6a', '#6a8a4a', 0.9);
    rockG.scale(0.55, 0.55, 0.55);
    const fireG = new IcosahedronGeometry(0.75, 3);
    const tornA = new CylinderGeometry(1.7, 0.25, 3.8, 18, 6, true).translate(0, 1.9, 0);
    const tornB = new CylinderGeometry(1.1, 0.12, 3.3, 16, 5, true).translate(0, 1.65, 0);

    const S = {
      ARROW: mk([[arr.body, lit], [arr.glow, glow]], MAXP),
      RAIN_ARROW: mk([[rain.body, lit], [rain.glow, glow]], MAXP),
      PIERCING_ARROW: mk([[pa.build(), glow]], 120),
      GALE_ARROW: mk([[ga.build(), glow]], 20),
      BURNING_ARROW: mk([[burn.body, lit], [burn.glow, glow]], MAXP),
      FREEZING_ARROW: mk([[frz.body, lit], [frz.glow, glow]], MAXP),
      MAGIC: mk([[orbG(0.26, '#e8c8ff', '#ffffff'), glow]], MAXP),
      AXE: mk([[axeB, lit], [axeG, glow]], 200),
      FIREBALL: mk([[fireG, fireMat]], 200),
      STORM: mk([[tornA, tornMat], [tornB, tornMat]], 100),
      ORBITAL_BLADE: mk([[bl.build(), glow], [blB, lit]], 100),
      PET_BOLT: mk([[orbG(0.15, '#ffd0f0', '#ffffff'), glow]], 200),
    } as Record<string, InstancedMesh[]>;
    const E = {
      ARROW: mk([[earrow.body, lit], [earrow.glow, glow]], MAXE),
      ORB: mk([[orbG(0.3, '#ff5a4a', '#ffe0d0'), glow]], MAXE),
      SLOW_ORB: mk([[orbG(0.3, '#7a7aff', '#e0e0ff'), glow]], MAXE),
      BOSS_ORB: mk([[orbG(0.48, '#ff3ae0', '#ffe0ff'), glow]], MAXE),
      ROCK: mk([[rockG, lit]], 200),
    } as Record<string, InstancedMesh[]>;
    for (const k in S) if (k !== 'FIREBALL' && k !== 'STORM') S[k].forEach((m) => { if (m.material === lit) m.castShadow = false; });
    return { group, S, E, fireMat, tornMat };
  }, []);

  const counts = useMemo(() => ({} as Record<string, number>), []);
  const o = useMemo(() => new Object3D(), []);
  const mats = useMemo(() => ({ m: new Matrix4() }), []);
  void mats;

  useFrame(({ clock }, dtRaw) => {
    const status = useGameStore.getState().status;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    sys.fireMat.uniforms.uTime.value = t; sys.tornMat.uniforms.uTime.value = t;
    for (const k in sys.S) counts[k] = 0;
    for (const k in sys.E) counts['e' + k] = 0;

    const place = (ims: InstancedMesh[], i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx: number, sy = sx, sz = sx) => {
      o.position.set(x, y, z); o.rotation.set(pitch, yaw, roll, 'YXZ'); o.scale.set(sx, sy, sz); o.updateMatrix();
      for (let m = 0; m < ims.length; m++) ims[m].setMatrixAt(i, o.matrix);
    };

    const pr = world.projectiles;
    for (let n = 0; n < pr.length; n++) {
      const p = pr[n];
      if (!p.active) continue;
      const ims = sys.S[p.kind]; if (!ims) continue;
      if (!inView(p.pos.x, p.pos.z, 6)) continue;
      const i = counts[p.kind]++;
      const x = p.pos.x, y = p.pos.y, z = p.pos.z, vx = p.vel.x, vy = p.vel.y, vz = p.vel.z;
      const hs = Math.hypot(vx, vz);
      const yaw = Math.atan2(vx, vz), pitch = -Math.atan2(vy, hs);
      const emit = dt > 0;
      switch (p.kind) {
        case 'ARROW':
          if (p.emp) {
            place(ims, i, x, y, z, yaw, pitch, 0, 1.25);
            pushHalo(x, y, z, 1.6, 2.2, 1.7, 0.4, 0.7, CELL.GLOW);
            if (emit) FX.add.emit(x - vx * 0.03, y, z - vz * 0.03, 0, 0, 0, 0.3, 0.5, 0.05, 2.4, 1.9, 0.5, 0.8, CELL.STREAK, 0, 0, 0, 0, 0);
          } else place(ims, i, x, y, z, yaw, pitch, 0, 1);
          break;
        case 'RAIN_ARROW': place(ims, i, x, y, z, yaw, pitch, 0, 1); break;
        case 'PIERCING_ARROW':
          place(ims, i, x, y, z, yaw, pitch, t * 12, 1);
          pushHalo(x, y, z, 2.6, 0.3, 1.5, 1.9, 0.55, CELL.GLOW);
          if (emit) {
            FX.add.emit(x - vx * 0.03, y, z - vz * 0.03, 0, 0, 0, 0.3, 0.55, 0.05, 0.4, 1.7, 2.2, 0.8, CELL.STREAK, 0, 0, 0, 0, 0);
            for (let k = 0; k < 2; k++) FX.add.emit(x - vx * 0.02 * k, y, z - vz * 0.02 * k, vx * -0.08, vy * -0.08, vz * -0.08, 0.35, 0.9, 0.2, 0.3, 1.5, 2.0, 0.6, CELL.STREAK, 0, 1, 0, 0, 0.12);
          }
          break;
        case 'GALE_ARROW': {
          const w = p.spin || 1;
          place(ims, i, x, y, z, yaw, pitch, t * 9, w * 1.1, w * 1.1, 1.1);
          pushHalo(x, y, z, 5 * w, 0.4, 1.7, 1.2, 0.5, CELL.GLOW);
          if (emit) {
            for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, rr = (0.8 + Math.random() * 1.6) * w; FX.add.emit(x - vx * 0.01 * k + Math.cos(a) * rr * 0.3, y + Math.sin(a) * rr * 0.3, z, -vx * 0.15, 0, -vz * 0.15, 0.4, 0.5 * w, 0.1, 0.6, 1.9, 1.4, 0.7, CELL.STREAK, 0, 1, 0, 0, 0.12); }
            if (Math.random() < dt * 40) FX.norm.emit(x, 0.4, z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, 0.6, 0.8, 1.6, 0.8, 0.95, 0.9, 0.3, CELL.SMOKE);
          }
          break;
        }
        case 'BURNING_ARROW':
          place(ims, i, x, y, z, yaw, pitch, 0, 1);
          pushHalo(x + vx * 0.03, y, z + vz * 0.03, 1.1, 1.8, 0.7, 0.15, 0.6, CELL.GLOW);
          if (emit) { FX.add.emit(x, y, z, (Math.random() - 0.5), 0.8 + Math.random(), (Math.random() - 0.5), 0.45, 0.45, 0.05, 2.4, 1.0, 0.2, 0.8, CELL.FLAME, -1, 1); if (Math.random() < dt * 40) embers(x, y, z, 1, 0xff9a30, 0.15, 1.5, 0.6, 0.12); }
          break;
        case 'FREEZING_ARROW':
          place(ims, i, x, y, z, yaw, pitch, 0, 1);
          pushHalo(x + vx * 0.03, y, z + vz * 0.03, 1.2, 0.3, 1.2, 1.9, 0.5, CELL.GLOW);
          if (emit && Math.random() < dt * 45) FX.add.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, 0.26, 0.04, 1.0, 1.9, 2.4, 0.9, CELL.SHARD, 2, 1, Math.random() * 6, 5);
          break;
        case 'MAGIC':
          place(ims, i, x, y, z, yaw, pitch, t * 6 + n, 1 + 0.08 * Math.sin(t * 20 + n));
          pushHalo(x, y, z, 1.7, 1.0, 0.45, 1.8, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 50) FX.add.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 + 0.5, (Math.random() - 0.5) * 2, 0.5, 0.3, 0.05, 1.4, 0.7, 2.2, 0.9, CELL.STAR, 0, 1, Math.random() * 3, 4);
          break;
        case 'AXE':
          place(ims, i, x, y, z, p.spin, 0, 0, 1.15);
          if (emit) FX.add.emit(x, y, z, 0, 0, 0, 0.18, 1.4, 0.3, 1.2, 0.9, 0.5, 0.35, CELL.GLOW);
          break;
        case 'FIREBALL':
          place(ims, i, x, y, z, 0, 0, 0, 1 + 0.06 * Math.sin(t * 18 + n));
          pushHalo(x, y, z, 3.4, 1.6, 0.55, 0.1, 0.55, CELL.GLOW);
          if (emit) {
            if (Math.random() < dt * 60) FX.add.emit(x, y, z, (Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5, 0.5, 0.8, 0.1, 2.2, 0.8, 0.15, 0.7, CELL.FLAME, -1, 1.2);
            if (Math.random() < dt * 25) embers(x, y, z, 1, 0xffa030, 0.4, 2.2, 0.8, 0.16);
            if (Math.random() < dt * 14) FX.norm.emit(x, y + 0.3, z, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), 0.9, 0.6, 1.6, 0.12, 0.1, 0.09, 0.5, CELL.SMOKE, -0.2, 1.4, Math.random() * 6, 0.6);
          }
          break;
        case 'STORM': {
          const s = 1.0;
          place(ims, i, x, y - 1.0, z, t * 3, 0, 0, s);
          if (emit && Math.random() < dt * 40) { const a = Math.random() * TAU; FX.norm.emit(x + Math.cos(a) * 1.2, 0.2, z + Math.sin(a) * 1.2, -Math.sin(a) * 4, 2 + Math.random() * 3, Math.cos(a) * 4, 0.8, 0.3, 0.1, 0.8, 0.75, 0.6, 0.8, CELL.SHARD, 3, 0.6, Math.random() * 6, 8); }
          if (emit && Math.random() < dt * 12) FX.norm.emit(x + (Math.random() - 0.5) * 2, 0.3, z + (Math.random() - 0.5) * 2, 0, 1.2, 0, 0.6, 0.8, 1.6, 0.8, 0.8, 0.8, 0.35, CELL.SMOKE);
          pushHalo(x, y + 0.5, z, 3.5, 0.5, 0.8, 1.8, 0.2, CELL.GLOW);
          break;
        }
        case 'ORBITAL_BLADE': {
          const a = t * 14 + n;
          place(ims, i, x, y, z, a, 0, 0, 1.2);
          pushHalo(x, y, z, 2.0, 0.4, 1.6, 2.0, 0.5, CELL.GLOW);
          if (emit) FX.add.emit(x, y, z, 0, 0, 0, 0.2, 1.1, 0.2, 0.3, 1.5, 2.0, 0.5, CELL.GLOW);
          break;
        }
        case 'PET_BOLT':
          place(ims, i, x, y, z, yaw, pitch, t * 8, 1);
          pushHalo(x, y, z, 1.0, 1.6, 1.0, 0.7, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 30) FX.add.emit(x, y, z, 0, 0.3, 0, 0.35, 0.2, 0.03, 2.0, 1.3, 0.8, 0.8, CELL.STAR, 0, 1, 0, 3);
          break;
      }
    }

    const ep = world.enemyProjectiles;
    for (let n = 0; n < ep.length; n++) {
      const p = ep[n];
      if (!p.active) continue;
      const ims = sys.E[p.kind]; if (!ims) continue;
      if (!inView(p.pos.x, p.pos.z, 4)) continue;
      const i = counts['e' + p.kind]++;
      const x = p.pos.x, y = p.pos.y, z = p.pos.z, vx = p.vel.x, vy = p.vel.y, vz = p.vel.z;
      const hs = Math.hypot(vx, vz);
      const emit = dt > 0;
      switch (p.kind) {
        case 'ARROW':
          place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), 0, 1.15);
          pushHalo(x, y, z, 1.1, 1.8, 0.2, 0.15, 0.55, CELL.GLOW);
          break;
        case 'ORB': {
          const pu = 1 + 0.15 * Math.sin(t * 14 + n);
          place(ims, i, x, y, z, t * 3, t * 2, 0, pu);
          pushHalo(x, y, z, 2.1 * pu, 1.7, 0.2, 0.25, 0.6, CELL.GLOW);
          pushHalo(x, y, z, 0.9, 2, 1.4, 1.2, 0.8, CELL.GLOW);
          if (emit && Math.random() < dt * 20) FX.add.emit(x, y, z, 0, 0, 0, 0.35, 0.4, 0.05, 1.6, 0.2, 0.3, 0.7, CELL.DISC);
          break;
        }
        case 'SLOW_ORB': {
          const pu = 1 + 0.12 * Math.sin(t * 10 + n);
          place(ims, i, x, y, z, t * 2, t, 0, pu);
          pushHalo(x, y, z, 2.3 * pu, 0.6, 0.5, 1.9, 0.6, CELL.GLOW);
          pushHalo(x, y, z, 1.3, 0.6, 0.7, 2.0, 0.6, CELL.RING);
          if (emit && Math.random() < dt * 20) FX.add.emit(x, y, z, 0, 0, 0, 0.4, 0.4, 0.05, 0.7, 0.6, 1.9, 0.7, CELL.DISC);
          break;
        }
        case 'BOSS_ORB': {
          const pu = 1 + 0.18 * Math.sin(t * 12 + n);
          place(ims, i, x, y, z, t * 2, t * 3, 0, pu);
          pushHalo(x, y, z, 3.2 * pu, 2.0, 0.2, 1.8, 0.65, CELL.GLOW);
          pushHalo(x, y, z, 1.6, 2, 1.4, 2, 0.8, CELL.GLOW);
          pushHalo(x, y, z, 2.0 + Math.sin(t * 8) * 0.3, 1.8, 0.4, 1.8, 0.5, CELL.RING);
          if (emit && Math.random() < dt * 30) FX.add.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, 0.45, 0.05, 1.8, 0.3, 1.8, 0.8, CELL.STAR, 0, 1, 0, 3);
          break;
        }
        case 'ROCK':
          place(ims, i, x, y, z, t * 3 + n, t * 2.2, t * 1.7, 1.3);
          if (emit && Math.random() < dt * 20) FX.norm.emit(x, y, z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.5, 0.4, 0.9, 0.55, 0.5, 0.42, 0.5, CELL.SMOKE);
          break;
      }
    }
    for (const k in sys.S) { const n = counts[k]; for (const m of sys.S[k]) { m.count = n; m.instanceMatrix.needsUpdate = true; } }
    for (const k in sys.E) { const n = counts['e' + k]; for (const m of sys.E[k]) { m.count = n; m.instanceMatrix.needsUpdate = true; } }
  }, -0.2);
  return <primitive object={sys.group} />;
}
void sparks; void Euler; void Quaternion; void Vector3; void ConeGeometry; void MeshStandardMaterial;
