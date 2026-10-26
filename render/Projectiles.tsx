// Instanced projectile renderers (player + enemy) with particle trails and shader-based fireball / tornado.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, ConeGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Euler, Float32BufferAttribute, InstancedMesh, Material, MeshBasicMaterial,
  MeshStandardMaterial, Group, Matrix4, Object3D, Quaternion, ShaderMaterial, Vector3, IcosahedronGeometry,
} from 'three';
import { world } from '../engine/world';
import { abilityState } from '../engine/systems/abilities';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, embers, pushHalo, sparks } from './fx';
import { GB, TAU, commitInst, litMat } from './util';
import { makeAxe } from './weapons';
import { makeRockGeo } from './models';

const PET_KEYS = ['PET_FIRE', 'PET_GOLD', 'PET_LIGHT', 'PET_WATER'];   // PET_BOLT tint 21..24
import { inView } from './view';

const MAXP = 900, MAXE = 600;
const DARKABLE: ReadonlySet<string> = new Set(['ARROW', 'POISON_ARROW', 'ORB', 'SLOW_ORB', 'FIRE_BOLT', 'BOLT', 'ICE_SHARD', 'FLAME', 'BOSS_ORB', 'BIG_FLAME']);
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
  float heat = clamp(vNo * 0.9 + (1.0 - f) * 0.3, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.1), smoothstep(0.2, 0.6, heat));
  col = mix(col, vec3(1.0, 0.85, 0.45), smoothstep(0.7, 1.0, heat));
  col *= 0.9 + (1.0 - f) * 0.3;
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
    // Lightpiercer: a slim arrow of white light
    pa.cyl(0.07, 0.07, 2.6, 6, [0, 0, -0.3], '#ffffff', [Math.PI / 2, 0, 0]); pa.cone(0.2, 0.9, 6, [0, 0, 1.45], '#ffffff', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; pa.box(0.02, 0.5, 0.8, [Math.sin(a) * 0.12, Math.cos(a) * 0.12, -1.4], '#e8f2ff', [0, 0, -a]); }
    // gale arrow: giant wind arrow with rings
    const ga = new GB([1, 1]);
    ga.cyl(0.1, 0.1, 4.2, 6, [0, 0, -0.6], '#9dffb0', [Math.PI / 2, 0, 0]); ga.cone(0.34, 1.4, 6, [0, 0, 2.0], '#d8ffd8', [Math.PI / 2, 0, 0]);   // green wind arrow
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; ga.box(0.03, 0.8, 1.3, [Math.sin(a) * 0.2, Math.cos(a) * 0.2, -2.4], '#4aff6a', [0, 0, -a]); }
    ga.torus(0.5, 0.05, [0, 0, 0.9], '#8aff9a', [0, 0, 0], 1, 16); ga.torus(0.7, 0.05, [0, 0, -0.3], '#8aff9a', [0, 0, 0], 1, 16); ga.torus(0.9, 0.05, [0, 0, -1.5], '#8aff9a', [0, 0, 0], 1, 16);
    // axe (flat spin)
    const aw = makeAxe('#ffb060', 1);
    const axeB = new GB().addColored(aw.body, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    const axeG = new GB().addColored(aw.glow, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    // giant ricocheting axe (Axe Storm)
    const gw = makeAxe('#ff4a2a', 3);
    const gaxB = new GB().addColored(gw.body, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    const gaxG = new GB().addColored(gw.glow, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1.0).build();
    // Knight: one flat crescent arc (forward = +z), bowed forward; sword swing (white steel, gold edge) / Holy Wave (gold light)
    const crescent = (c1: string, c2: string, core: string, span: number, thick: number) => {
      // a smooth tapered crescent: outer arc (front) + inner arc that meets it at both tips; colour runs edge -> bright core
      const N = 40, A = 1.05, R = span / (2 * Math.sin(A)), cz = 0.6 - R;   // arc centre behind, apex at z 0.6
      const ca = new Color(c1), cb2 = new Color(c2), cc = new Color(core), tmp = new Color();
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, th = -A + u * 2 * A, taper = Math.sin(u * Math.PI);   // 0 at the tips, 1 in the middle
        const w = thick * Math.pow(taper, 0.8);
        const rings = [R, R - w * 0.45, R - w];                                 // outer edge, bright core line, inner edge
        rings.forEach((r, k) => {
          pos.push(Math.sin(th) * r, k === 1 ? 0.01 : 0, Math.cos(th) * r + cz);
          if (k === 1) tmp.copy(cc); else tmp.copy(ca).lerp(cb2, k === 0 ? 0.65 : 0.15);
          col.push(tmp.r, tmp.g, tmp.b);
        });
      }
      for (let i = 0; i < N; i++) for (let k = 0; k < 2; k++) {
        const a0 = i * 3 + k, a1 = a0 + 1, b0 = a0 + 3, b1 = b0 + 1;
        idx.push(a0, b0, a1, a1, b0, b1, a0, a1, b0, a1, b1, b0);   // both windings: visible from any angle
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const slashG = crescent('#d8ecff', '#7fbcff', '#ffffff', 4.2, 0.42);   // white steel, blue edge
    const slashGoldG = crescent('#fff6d8', '#ffd76a', '#ffffff', 4.2, 0.48);   // Divine Avatar swing: gold / white
    const slashRedG = crescent('#ffd0d0', '#ff3a3a', '#ffffff', 4.2, 0.46);   // Legendary sword: crimson
    const slashDarkG = crescent('#3a2440', '#0c060e', '#c060ff', 4.2, 0.48);  // Mythic sword: black with a violet edge
    // Ignar: bold fire crescent (his knight skill) / his dark knights' violet crescent
    const fireCrescG = crescent('#ff6a5a', '#d01010', '#ffd0c0', 4.4, 0.95);   // (owner 2026-10-26: red fire)
    const darkCrescG = crescent('#7a4ab8', '#1c0e2e', '#e0b0ff', 4.4, 0.95);
    // Bone Spear: a long jagged spear of bone
    const bs = new GB([0.85, 1.1]);
    bs.cyl(0.13, 0.18, 3.6, 6, [0, 0, -0.6], '#ebe5d0', [Math.PI / 2, 0, 0]); bs.cone(0.26, 1.3, 6, [0, 0, 1.75], '#f4efe0', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) { const a = i * 2.4; bs.cone(0.08, 0.5, 4, [Math.sin(a) * 0.16, Math.cos(a) * 0.16, -1.6 + i * 0.6], '#d8d0b8', [Math.PI / 2 + 0.6, 0, a]); }
    const boneSpearG = bs.build();
    const holyG = crescent('#ffd76a', '#ffe9a0', '#fffbe8', 6.4, 0.85);
    // Cross Slash: two big smooth flaming crescents crossed in an X, lying flat (forward = +z); ~3x the old size
    const xA = crescent('#ff7a1a', '#e8400a', '#ffd27a', 11.4, 1.35).rotateY(0.62), xB = crescent('#ff7a1a', '#e8400a', '#ffd27a', 11.4, 1.35).rotateY(-0.62);
    const xsG = mergeGeometries([xA, xB], false)!;
    // orbital blade
    const bl = new GB([1, 1]);
    bl.torus(0.62, 0.08, [0, 0, 0], '#8ff4ff', [Math.PI / 2, 0, 0], [1, 1, 0.7], 14, 2.3); bl.torus(0.5, 0.05, [0, 0, 0], '#ffffff', [Math.PI / 2, 0, 0], [1, 1, 0.5], 14, 2.0);
    const blB = new GB([0.9, 1.1]).box(0.1, 0.1, 0.5, [0.0, 0, -0.35], '#3a4a6a').build();
    // magic / pet / enemy orbs
    const orbG = (r: number, c1: string, c2: string) => new GB([1, 1]).ico(r, [0, 0, 0], c1, 1, 1).ico(r * 0.6, [0, 0, 0], c2, 1, 0).build();
    const earrow = arrow('#3a2a26', '#4a4a50', '#8a1a1a', '#ff3a2a');
    const rockG = makeRockGeo(901, '#8a7a6a', '#6a8a4a', 0.9);
    rockG.scale(0.55, 0.55, 0.55);
    // elemental enemy shots (owner): fire bolt = fat orange core, lightning = thin white-blue streak, ice = pale crystal, poison arrow = green tipped
    const fireBoltG = orbG(0.38, '#ff6a1a', '#fff0a0');
    const boltG = new GB([1, 1]).cone(0.12, 0.9, 5, [0, 0, 0.45], '#fff8c0', [Math.PI / 2, 0, 0]).cone(0.12, 0.9, 5, [0, 0, -0.45], '#8ad0ff', [-Math.PI / 2, 0, 0]).build();
    const iceG = new GB([1, 1]).cone(0.2, 0.9, 5, [0, 0, 0.35], '#d6f6ff', [Math.PI / 2, 0, 0]).cone(0.2, 0.45, 5, [0, 0, -0.1], '#8fd8ff', [-Math.PI / 2, 0, 0]).octa(0.12, [0, 0, 0.75], '#ffffff').build();
    const darkArrow = arrow('#120818', '#1c0c28', '#2a0f44', '#7a2fd0');
    const pois = arrow('#3a4a22', '#6a8a2a', '#76d33a', '#8aff3a', 1.2);
    const paGeo = pa.build();
    const fireG = new IcosahedronGeometry(0.75, 3);
    const tornA = new CylinderGeometry(1.7, 0.25, 3.8, 18, 6, true).translate(0, 1.9, 0);
    const tornB = new CylinderGeometry(1.1, 0.12, 3.3, 16, 5, true).translate(0, 1.65, 0);

    const S = {
      ARROW: mk([[arr.body, lit], [arr.glow, glow]], MAXP),
      RAIN_ARROW: mk([[rain.body, lit], [rain.glow, glow]], MAXP),
      PIERCING_ARROW: mk([[paGeo, glow]], 120),
      GALE_ARROW: mk([[ga.build(), glow]], 20),
      BURNING_ARROW: mk([[burn.body, lit], [burn.glow, glow]], MAXP),
      FREEZING_ARROW: mk([[frz.body, lit], [frz.glow, glow]], MAXP),
      MAGIC: mk([[orbG(0.5, '#e8c8ff', '#ffffff'), glow]], MAXP),
      AXE: mk([[axeB, lit], [axeG, glow]], 200),
      GIANT_AXE: mk([[gaxB, lit], [gaxG, glow]], 40),
      FIREBALL: mk([[fireG, fireMat]], 200),
      STORM: mk([[tornA, tornMat], [tornB, tornMat]], 100),
      ORBITAL_BLADE: mk([[bl.build(), glow], [blB, lit]], 100),
      PET_BOLT: mk([[orbG(0.15, '#ffd0f0', '#ffffff'), glow]], 200),
      PET_FIRE: mk([[orbG(0.34, '#ff6a1a', '#fff2a0'), glow]], 60),    // pet elements (tint 20 + PET_EL)
      PET_GOLD: mk([[orbG(0.3, '#ffb020', '#fff6c8'), glow]], 60),
      PET_LIGHT: mk([[orbG(0.26, '#ffffff', '#cfe8ff'), glow]], 60),
      PET_WATER: mk([[orbG(0.32, '#2a9aff', '#d8f6ff'), glow]], 60),
      SOUL_BOLT: mk([[orbG(0.22, '#a86bff', '#d8ffd0'), glow]], MAXP),   // necromancer: a violet soul with a pale green core
      BONE_SPEAR: mk([[boneSpearG, lit]], 40),
      X_SLASH: mk([[xsG, glow]], 40),
      SLASH: mk([[slashG, glow]], 120),
      SLASH_GOLD: mk([[slashGoldG, glow]], 80),
      SLASH_RED: mk([[slashRedG, glow]], 80),
      SLASH_DARK: mk([[slashDarkG, glow]], 80),
      HOLY_WAVE: mk([[holyG, glow]], 60),
    } as Record<string, InstancedMesh[]>;
    const E = {
      ARROW: mk([[earrow.body, lit], [earrow.glow, glow]], MAXE),
      ORB: mk([[orbG(0.3, '#ff5a4a', '#ffe0d0'), glow]], MAXE),
      SLOW_ORB: mk([[orbG(0.3, '#7a7aff', '#e0e0ff'), glow]], MAXE),
      BOSS_ORB: mk([[orbG(0.48, '#ff3ae0', '#ffe0ff'), glow]], MAXE),
      ROCK: mk([[rockG, lit]], 200),
      FLAME: mk([[orbG(0.42, '#ff6a1a', '#fff0b0'), glow]], MAXE),
      FIRE_BOLT: mk([[fireBoltG, glow]], MAXE),
      BOLT: mk([[boltG, glow]], 120),
      ICE_SHARD: mk([[iceG, glow]], MAXE),
      POISON_ARROW: mk([[pois.body, lit], [pois.glow, glow]], MAXE),
      BIG_FLAME: mk([[orbG(0.42, '#ff6a1a', '#fff0b0'), glow]], 60),   // Ignar's giant fireball (scaled by its radius below)
      FIRE_CRESCENT: mk([[fireCrescG, glow]], 80),
      DARK_CRESCENT: mk([[darkCrescG, glow]], 40),
      DARK_ORB: mk([[orbG(0.34, '#12051e', '#5a1a9a'), glow]], MAXE),   // (owner 2026-10-26) corrupted Void monsters' shots: black cores, violet rims
      DARK_ARROW: mk([[darkArrow.body, lit], [darkArrow.glow, glow]], MAXE),
      MAL_ORB: mk([[new GB([1, 1]).ico(0.34, [0, 0, 0], '#2c0b5e', 1, 1).ico(0.2, [0, 0, 0], '#f6eaff', 1, 0).build(), glow]], MAXE),   // (owner 2026-10-26) Malakar's shots: a bright lilac-white core in a dark violet shell
      BALLISTA: mk([[paGeo, glow]], 60),   // (owner) the siege bolt: a smaller Lightpiercer-style white arrow of light
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

    // Lightpiercer charge: a ball of light gathering in front of the archer, growing until the shot
    {
      const a = abilityState;
      if (a.lpT > 0 && a.lpMax > 0) {
        const ch = a.lpCharge / 1.5, k = Math.min(1, 1 - a.lpT / a.lpMax + ch), pl = world.player.pos;   // ch: extra charge from holding
        const bx = pl.x + a.lpDx * 1.3, bz = pl.z + a.lpDz * 1.3, by = 1.3;
        pushHalo(bx, by, bz, 0.8 + 2.6 * k + 2.4 * ch, 2.4, 2.4, 2.5, 0.5 + 0.4 * k, CELL.GLOW);
        if (ch >= 1) pushHalo(bx, by, bz, 6 + Math.sin(performance.now() * 0.02) * 0.6, 2.6, 2.2, 1.4, 0.35, CELL.GLOW);   // full charge: pulsing gold rim
        if (dt > 0 && Math.random() < dt * 40) {   // motes drawn into the ball
          const an = Math.random() * TAU, rr = 1.6 + Math.random();
          FX.add.emit(bx + Math.cos(an) * rr, by + (Math.random() - 0.5), bz + Math.sin(an) * rr, -Math.cos(an) * rr * 3, 0, -Math.sin(an) * rr * 3, 0.3, 0.25, 0.05, 2.2, 2.2, 2.4, 0.9, CELL.STAR, 0, 0, 0, 0, 0);
        }
      }
    }
    const pr = world.projectiles;
    for (let n = 0; n < pr.length; n++) {
      const p = pr[n];
      if (!p.active) continue;
      const key = p.kind === 'SLASH' ? (p.emp ? 'SLASH_GOLD' : p.tint === 4 ? 'SLASH_RED' : p.tint === 5 ? 'SLASH_DARK' : 'SLASH')
        : p.kind === 'PET_BOLT' && p.tint >= 21 && p.tint <= 24 ? PET_KEYS[p.tint - 21] : p.kind;   // Divine Avatar = gold; Legendary / Mythic swords = red / black
      const ims = sys.S[key]; if (!ims) continue;
      if (!inView(p.pos.x, p.pos.z, 6)) continue;
      const i = counts[key]++;
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
          } else if (p.tint === 1) {   // Piercing Shot: blue light
            place(ims, i, x, y, z, yaw, pitch, 0, 1.15);
            pushHalo(x, y, z, 1.5, 0.5, 1.4, 2.6, 0.75, CELL.GLOW);
            if (emit) FX.add.emit(x - vx * 0.03, y, z - vz * 0.03, 0, 0, 0, 0.25, 0.45, 0.05, 0.6, 1.6, 2.6, 0.8, CELL.STREAK, 0, 0, 0, 0, 0);
          } else if (p.tint === 10) {   // skeleton bowman: bone arrow with a violet glow
            place(ims, i, x, y, z, yaw, pitch, 0, 1.0);
            pushHalo(x, y, z, 1.0, 1.3, 0.7, 2.2, 0.5, CELL.GLOW);
          } else if (p.tint === 3) {   // bow perk: green piercing arrow
            place(ims, i, x, y, z, yaw, pitch, 0, 1.15);
            pushHalo(x, y, z, 1.5, 0.5, 2.4, 0.7, 0.75, CELL.GLOW);
            if (emit) FX.add.emit(x - vx * 0.03, y, z - vz * 0.03, 0, 0, 0, 0.25, 0.45, 0.05, 0.7, 2.4, 0.9, 0.8, CELL.STREAK, 0, 0, 0, 0, 0);
          } else if (p.tint === 2) {   // Inspire: white light
            place(ims, i, x, y, z, yaw, pitch, 0, 1.1);
            pushHalo(x, y, z, 1.3, 2.2, 2.2, 2.2, 0.6, CELL.GLOW);
          } else place(ims, i, x, y, z, yaw, pitch, 0, 1);
          break;
        case 'RAIN_ARROW': place(ims, i, x, y, z, yaw, pitch, 0, 1); break;
        case 'PIERCING_ARROW':
          { const sz = p.radius / 2.4;   // a charged shot is up to twice as big
          place(ims, i, x, y, z, yaw, pitch, t * 12, 2.6 * (1 + 0.6 * (sz - 1)));   // Lightpiercer: a big arrow of light (up to 1.6x when charged)
          pushHalo(x, y, z, 4.6 * (1 + 0.6 * (sz - 1)), 2.4, 2.4, 2.5, 0.65, CELL.GLOW); }
          if (emit) {
            FX.add.emit(x - vx * 0.02, y, z - vz * 0.02, 0, 0, 0, 0.35, 0.6, 0.05, 2.2, 2.2, 2.4, 0.85, CELL.STREAK, 0, 0, 0, 0, 0);
            for (let k = 0; k < 2; k++) FX.add.emit(x - vx * 0.015 * k, y, z - vz * 0.015 * k, vx * -0.05, vy * -0.05, vz * -0.05, 0.3, 0.8, 0.2, 2.0, 2.0, 2.3, 0.6, CELL.STREAK, 0, 1, 0, 0, 0.12);
          }
          break;
        case 'GALE_ARROW': {
          const w = p.spin || 1;
          place(ims, i, x, y, z, yaw, pitch, t * 9, w * 0.75, w * 0.75, 0.8);   // smaller, green
          pushHalo(x, y, z, 3.4 * w, 0.4, 2.2, 0.5, 0.55, CELL.GLOW);
          if (emit) {
            for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, rr = (0.8 + Math.random() * 1.6) * w; FX.add.emit(x - vx * 0.01 * k + Math.cos(a) * rr * 0.3, y + Math.sin(a) * rr * 0.3, z, -vx * 0.15, 0, -vz * 0.15, 0.4, 0.4 * w, 0.1, 0.5, 2.2, 0.6, 0.7, CELL.STREAK, 0, 1, 0, 0, 0.12); }
            if (Math.random() < dt * 40) FX.norm.emit(x, 0.4, z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, 0.6, 0.8, 1.6, 0.8, 0.95, 0.9, 0.3, CELL.SMOKE);
          }
          break;
        }
        case 'X_SLASH': {
          const life = p.maxLife > 0 ? p.life / p.maxLife : 1, sc = (1.0 + (1 - life) * 0.2) * (p.radius / 6.0);   // bigger with level (radius)
          place(ims, i, x, y, z, yaw, 0, 0, sc);
          pushHalo(x, y, z, 9.5 * sc, 1.9, 0.75, 0.25, 0.45, CELL.GLOW);
          if (emit) {
            if (Math.random() < dt * 120) { const o = (Math.random() - 0.5) * 10 * sc; FX.add.emit(x + Math.cos(yaw) * o, y, z - Math.sin(yaw) * o, -vx * 0.06, 0.6 + Math.random(), -vz * 0.06, 0.35, 0.45, 0.05, 2.4, 1.0, 0.3, 0.8, CELL.FLAME, -0.5, 1); }
            if (Math.random() < dt * 30) embers(x, y, z, 1, 0xff9a40, 0.6, 2.4, 0.8, 0.14);
          }
          break;
        }
        case 'SLASH': {   // a quick sword arc: fades / widens over its short life, mirrored on alternate swings
          const life = p.maxLife > 0 ? p.life / p.maxLife : 1, sc = (0.85 + (1 - life) * 0.35) * (p.radius / 2.5);
          place(ims, i, x, y, z, yaw, 0, p.bounces & 1 ? 0.25 : -0.25, p.bounces & 1 ? -sc : sc, sc, sc);
          if (p.emp) pushHalo(x, y, z, 2.8 * sc, 2.2, 1.8, 0.9, 0.4 * life + 0.15, CELL.GLOW);
          else if (p.tint === 4) pushHalo(x, y, z, 2.7 * sc, 2.4, 0.4, 0.3, 0.38 * life + 0.12, CELL.GLOW);
          else if (p.tint === 5) pushHalo(x, y, z, 2.7 * sc, 0.9, 0.2, 1.6, 0.4 * life + 0.12, CELL.GLOW);
          else pushHalo(x, y, z, 2.6 * sc, 1.0, 1.4, 2.2, 0.35 * life + 0.1, CELL.GLOW);
          if (emit && Math.random() < dt * 40) { const o = (Math.random() - 0.5) * 3; FX.add.emit(x + Math.cos(yaw) * o, y, z - Math.sin(yaw) * o, 0, 0.4, 0, 0.25, 0.3, 0.05, 1.3, 1.8, 2.5, 0.7, CELL.STAR, 0, 0.3); }
          break;
        }
        case 'HOLY_WAVE': {
          const life = p.maxLife > 0 ? p.life / p.maxLife : 1, sc = (1.0 + (1 - life) * 0.35) * (p.radius / 3.6);
          place(ims, i, x, y, z, yaw, 0, 0, sc);
          pushHalo(x, y, z, 6.2 * sc, 2.0, 1.7, 0.9, 0.6, CELL.GLOW);
          if (emit) {
            if (Math.random() < dt * 60) { const o = (Math.random() - 0.5) * 6 * sc; FX.add.emit(x + Math.cos(yaw) * o, y, z - Math.sin(yaw) * o, -vx * 0.05, 0.8 + Math.random(), -vz * 0.05, 0.5, 0.35, 0.05, 2.2, 1.9, 1.2, 0.8, CELL.STAR, -0.2, 0.4); }
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
          place(ims, i, x, y, z, yaw, pitch, t * 6 + n, (1 + 0.08 * Math.sin(t * 20 + n)) * (p.radius / 3.4));   // staff perk Arcane Swell = bigger bolts
          if (p.tint === 6) pushHalo(x, y, z, 2.8 * (p.radius / 3.4), 2.4, 0.9, 0.2, 0.6, CELL.GLOW);        // staff perk: fire bolt
          else if (p.tint === 7) pushHalo(x, y, z, 2.8 * (p.radius / 3.4), 0.5, 1.8, 2.6, 0.6, CELL.GLOW);   // ice bolt
          else if (p.tint === 8) pushHalo(x, y, z, 2.8 * (p.radius / 3.4), 2.4, 2.3, 0.6, 0.6, CELL.GLOW);   // lightning bolt
          else pushHalo(x, y, z, 2.6 * (p.radius / 3.4), 1.0, 0.45, 1.8, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 50) FX.add.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 + 0.5, (Math.random() - 0.5) * 2, 0.5, 0.3, 0.05, 1.4, 0.7, 2.2, 0.9, CELL.STAR, 0, 1, Math.random() * 3, 4);
          break;
        case 'AXE':
          place(ims, i, x, y, z, p.spin, 0, 0, 1.15 * Math.max(1, p.radius / 1.5));   // (bigger during Titan's Wrath)
          if (emit) FX.add.emit(x, y, z, 0, 0, 0, 0.18, 1.4, 0.3, 1.2, 0.9, 0.5, 0.35, CELL.GLOW);
          break;
        case 'GIANT_AXE': {
          const sz = (p.spin || 1) * 1.4;   // Axe Storm axes ~40% smaller (user)
          place(ims, i, x, y, z, t * 20 + n * 2, 0, 0, sz);
          pushHalo(x, y, z, 3.3 * (p.spin || 1), 1.8, 0.45, 0.2, 0.6, CELL.GLOW);
          if (emit) {
            FX.add.emit(x - vx * 0.02, y, z - vz * 0.02, 0, 0, 0, 0.35, 1.6 * (p.spin || 1), 0.2, 2.4, 0.5, 0.2, 0.55, CELL.RING);
            if (Math.random() < dt * 60) FX.add.emit(x, y, z, -vx * 0.08 + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 3, -vz * 0.08 + (Math.random() - 0.5) * 3, 0.4, 0.5, 0.05, 2.4, 1.2, 0.4, 0.9, CELL.STREAK, 0, 1, 0, 0, 0.1);
            if (Math.random() < dt * 30) embers(x, y, z, 1, 0xff7a30, 0.4, 2.6, 0.9, 0.16);
          }
          break;
        }
        case 'FIREBALL':
          place(ims, i, x, y, z, 0, 0, 0, (1 + 0.06 * Math.sin(t * 18 + n)) * (p.radius / 1.3));   // big rolling fireball
          pushHalo(x, y, z, 1.7 * (p.radius / 1.3), 1.0, 0.28, 0.04, 0.22, CELL.GLOW);
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
        case 'SOUL_BOLT':
          place(ims, i, x, y, z, yaw, pitch, t * 7 + n, p.radius / 1.2);
          pushHalo(x, y, z, 1.5 * (p.radius / 1.2), 1.3, 0.5, 2.2, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 40) FX.add.emit(x, y, z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.4, 0.25, 0.04, 0.8, 1.9, 0.9, 0.8, CELL.STAR, 0, 1, 0, 3);
          break;
        case 'BONE_SPEAR':
          place(ims, i, x, y, z, yaw, pitch, t * 4, 1.3);
          pushHalo(x, y, z, 2.2, 1.4, 1.2, 1.9, 0.35, CELL.GLOW);
          if (emit && Math.random() < dt * 30) FX.norm.emit(x, 0.3, z, (Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3, 0.5, 0.4, 0.1, 0.9, 0.88, 0.8, 0.6, CELL.SMOKE);
          break;
        case 'PET_BOLT':
          if (p.tint === 21) {   // Phoenix: a fireball with a flame trail
            place(ims, i, x, y, z, yaw, pitch, t * 9, 1.15);
            pushHalo(x, y, z, 2.6, 2.4, 1.0, 0.25, 0.7, CELL.GLOW);
            if (emit) {
              if (Math.random() < dt * 70) FX.add.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, -vx * 0.08, 0.8, -vz * 0.08, 0.35, 0.7, 0.1, 2.4, 1.0, 0.25, 0.9, CELL.FLAME, -0.5, 1);
              if (Math.random() < dt * 20) embers(x, y, z, 1, 0xff8a2a, 0.3, 2, 0.6, 0.14);
            }
            break;
          }
          if (p.tint === 22) {   // Gold Dragon: a golden flame bolt
            place(ims, i, x, y, z, yaw, pitch, t * 9, 1.05);
            pushHalo(x, y, z, 2.2, 2.4, 1.7, 0.5, 0.65, CELL.GLOW);
            if (emit && Math.random() < dt * 45) FX.add.emit(x, y, z, -vx * 0.06, 0.6, -vz * 0.06, 0.3, 0.55, 0.08, 2.4, 1.8, 0.5, 0.85, CELL.FLAME, -0.5, 1);
            break;
          }
          if (p.tint === 23) {   // Celestial Wisp: a streak of starlight
            place(ims, i, x, y, z, yaw, pitch, t * 12, 1.0);
            pushHalo(x, y, z, 2.0, 2.4, 2.4, 2.6, 0.7, CELL.GLOW);
            if (emit) FX.add.emit(x - vx * 0.02, y, z - vz * 0.02, 0, 0, 0, 0.25, 0.5, 0.05, 2.2, 2.3, 2.6, 0.85, CELL.STREAK, 0, 0, 0, 0, 0);
            if (emit && Math.random() < dt * 30) FX.add.emit(x, y, z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.4, 0.3, 0.05, 2.4, 2.4, 2.6, 0.9, CELL.STAR, 0, 1, 0, 3);
            break;
          }
          if (p.tint === 24) {   // Aether Leviathan: a water orb shedding droplets
            place(ims, i, x, y, z, yaw, pitch, t * 6, 1.1);
            pushHalo(x, y, z, 2.4, 0.5, 1.4, 2.6, 0.6, CELL.GLOW);
            if (emit && Math.random() < dt * 50) FX.add.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, -vx * 0.05, 1.5, -vz * 0.05, 0.45, 0.22, 0.05, 0.6, 1.6, 2.6, 0.9, CELL.DISC, 9, 0.5);
            break;
          }
          place(ims, i, x, y, z, yaw, pitch, t * 8, 1);
          if (p.tint === 9) { pushHalo(x, y, z, 1.2, 1.2, 0.5, 2.2, 0.55, CELL.GLOW); break; }   // skeleton mage bolt
          pushHalo(x, y, z, 1.0, 1.6, 1.0, 0.7, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 30) FX.add.emit(x, y, z, 0, 0.3, 0, 0.35, 0.2, 0.03, 2.0, 1.3, 0.8, 0.8, CELL.STAR, 0, 1, 0, 3);
          break;
      }
    }

    const ep = world.enemyProjectiles;
    for (let n = 0; n < ep.length; n++) {
      const p = ep[n];
      if (!p.active) continue;
      const dk = p.dark === true && DARKABLE.has(p.kind), mal = dk && (p.kind === 'BOSS_ORB' || p.kind === 'BIG_FLAME'), ek = mal ? 'MAL_ORB' : dk ? (p.kind === 'ARROW' || p.kind === 'POISON_ARROW' ? 'DARK_ARROW' : 'DARK_ORB') : p.kind;
      const ims = sys.E[ek]; if (!ims) continue;
      if (!inView(p.pos.x, p.pos.z, 4)) continue;
      const i = counts['e' + ek]++;
      const x = p.pos.x, y = p.pos.y, z = p.pos.z, vx = p.vel.x, vy = p.vel.y, vz = p.vel.z;
      const hs = Math.hypot(vx, vz);
      const emit = dt > 0;
      if (mal) {   // Malakar's shot: lilac-white core, dark violet shell, a violet halo and a dark smoke + lilac spark trail
        const pu = (1 + 0.15 * Math.sin(t * 14 + n)) * Math.max(1, p.radius / 0.4) * 1.1;
        place(ims, i, x, y, z, t * 3, t * 2, 0, pu);
        pushHalo(x, y, z, 2.6 * Math.max(1, p.radius / 0.6), 1.0, 0.35, 2.2, 0.55, CELL.GLOW);
        pushHalo(x, y, z, 1.2 * Math.max(1, p.radius / 0.6), 2.0, 1.6, 2.4, 0.8, CELL.GLOW);
        if (emit && Math.random() < dt * 50 * Math.max(1, p.radius / 0.5)) FX.norm.emit(x + (Math.random() - 0.5) * p.radius, y, z + (Math.random() - 0.5) * p.radius, -vx * 0.04 + (Math.random() - 0.5) * 0.6, 0.2, -vz * 0.04 + (Math.random() - 0.5) * 0.6, 0.55, 0.3, 0.5, 0.16, 0.04, 0.3, 0.65, CELL.SMOKE, -0.2, 1.2);
        if (emit && Math.random() < dt * 30) FX.add.emit(x, y, z, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, 0.4, 0.3, 0.05, 1.7, 1.2, 2.4, 0.8, CELL.STAR, 0, 1, 0, 3);
        continue;
      }
      if (dk) {   // corrupted monster's shot: a black core (arrow / orb) with a dim violet glow and a black-violet smoke trail
        if (ek === 'DARK_ARROW') place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), 0, 1.2);
        else { const pu = 1 + 0.15 * Math.sin(t * 14 + n); const big = Math.max(1, p.radius / 0.4); place(ims, i, x, y, z, t * 3, t * 2, 0, pu * big * (p.kind === 'SLOW_ORB' || p.kind === 'ICE_SHARD' ? 0.9 : 1.1)); }
        pushHalo(x, y, z, 1.6 * Math.max(1, p.radius / 0.5), 0.55, 0.12, 1.1, 0.4, CELL.GLOW);
        if (emit && Math.random() < dt * 40 * Math.max(1, p.radius / 0.5)) FX.norm.emit(x + (Math.random() - 0.5) * p.radius, y, z + (Math.random() - 0.5) * p.radius, (Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6, 0.45, 0.22, 0.5, 0.12, 0.04, 0.2, 0.6, CELL.SMOKE, -0.2, 1.2);
        continue;
      }
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
        case 'FLAME': {
          const pu = 1 + 0.2 * Math.sin(t * 16 + n);
          place(ims, i, x, y, z, t * 2, t * 3, 0, pu);
          pushHalo(x, y, z, 2.8 * pu, 2.2, 0.8, 0.2, 0.65, CELL.GLOW);
          pushHalo(x, y, z, 1.3, 2.2, 1.6, 0.8, 0.8, CELL.GLOW);
          if (emit && Math.random() < dt * 34) FX.add.emit(x, y, z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2, 0.45, 0.4, 0.05, 2.2, 0.9, 0.2, 0.8, CELL.FLAME, -0.6, 0.8);
          break;
        }
        case 'BIG_FLAME': {   // (owner) ~2.5x bigger fireball: a fat swirling core, a big halo, a streaming ember tail
          const pu = (1 + 0.15 * Math.sin(t * 14 + n)) * (p.radius / 0.5);
          place(ims, i, x, y, z, t * 2, t * 3, 0, pu);
          pushHalo(x, y, z, 2.8 * pu, 2.2, 0.8, 0.2, 0.6, CELL.GLOW);
          pushHalo(x, y, z, 1.3 * pu, 2.2, 1.6, 0.8, 0.8, CELL.GLOW);
          if (emit && Math.random() < dt * 70) FX.add.emit(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 1.2, -vx * 0.08 + (Math.random() - 0.5), 0.8 + Math.random() * 1.4, -vz * 0.08 + (Math.random() - 0.5), 0.55, 1.1, 0.1, 2.3, 0.85, 0.2, 0.8, CELL.FLAME, -0.6, 0.8);
          break;
        }
        case 'FIRE_CRESCENT': case 'DARK_CRESCENT': {   // a bold flat crescent sweeping along its lane (the knight's skill 1, in fire / shadow)
          const fire = p.kind === 'FIRE_CRESCENT', sc = p.radius / 2.2, lf = 1 + 0.08 * Math.sin(t * 20 + n);
          place(ims, i, x, y, z, Math.atan2(vx, vz), 0, 0, sc * lf, sc, sc);
          if (fire) pushHalo(x, y, z, 3.6 * sc, 2.6, 0.45, 0.3, 0.55, CELL.GLOW); else pushHalo(x, y, z, 3.2 * sc, 1.2, 0.4, 2.0, 0.45, CELL.GLOW);
          if (emit && Math.random() < dt * 60) {
            const yw = Math.atan2(vx, vz), o = (Math.random() - 0.5) * 4 * sc;
            if (fire) FX.add.emit(x + Math.cos(yw) * o, y, z - Math.sin(yw) * o, -vx * 0.05, 0.8 + Math.random(), -vz * 0.05, 0.5, 1.0 * sc, 0.1, 2.6, 0.5, 0.2, 0.85, CELL.FLAME, -0.5, 0.8);
            else FX.add.emit(x + Math.cos(yw) * o, y, z - Math.sin(yw) * o, -vx * 0.05, 0.5, -vz * 0.05, 0.4, 0.4, 0.05, 1.4, 0.5, 2.2, 0.7, CELL.STAR, 0, 0.3);
          }
          break;
        }
        case 'FIRE_BOLT': {
          const pu = 1 + 0.2 * Math.sin(t * 18 + n);
          place(ims, i, x, y, z, t * 3, t * 2, 0, pu);
          pushHalo(x, y, z, 2.8 * pu, 2.2, 0.8, 0.2, 0.65, CELL.GLOW);
          pushHalo(x, y, z, 1.2, 2.2, 1.7, 0.9, 0.85, CELL.GLOW);
          if (emit && Math.random() < dt * 60) FX.add.emit(x, y, z, -vx * 0.1 + (Math.random() - 0.5), 0.5 + Math.random(), -vz * 0.1 + (Math.random() - 0.5), 0.5, 0.5, 0.05, 2.3, 0.8, 0.15, 0.8, CELL.FLAME, -0.6, 0.8);
          break;
        }
        case 'BOLT': {
          place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), 0, 1.4);
          pushHalo(x, y, z, 3.0, 1.6, 1.8, 2.6, 0.7, CELL.GLOW);
          pushHalo(x, y, z, 1.3, 2.4, 2.4, 2.6, 0.9, CELL.GLOW);
          if (emit && Math.random() < dt * 90) FX.add.emit(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5, -vx * 0.05 + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, -vz * 0.05 + (Math.random() - 0.5) * 3, 0.22, 0.28, 0.03, 1.5, 1.9, 2.6, 0.9, CELL.STAR, 0, 1, 0, 3);
          break;
        }
        case 'ICE_SHARD': {
          place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), t * 6 + n, 1.1);
          pushHalo(x, y, z, 2.3, 0.7, 1.7, 2.4, 0.6, CELL.GLOW);
          if (emit && Math.random() < dt * 40) FX.add.emit(x, y, z, (Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 0.8, 0.5, 0.25, 0.04, 1.2, 2.0, 2.6, 0.8, CELL.STAR, -0.5, 1, 0, 3);
          break;
        }
        case 'POISON_ARROW':
          place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), 0, 1.2);
          pushHalo(x, y, z, 2.0, 0.5, 1.8, 0.3, 0.55, CELL.GLOW);
          if (emit && Math.random() < dt * 36) FX.add.emit(x, y, z, (Math.random() - 0.5) * 0.4, -0.8, (Math.random() - 0.5) * 0.4, 0.55, 0.28, 0.05, 0.7, 1.9, 0.2, 0.75, CELL.DISC, -1, 1);
          break;
        case 'BALLISTA':
          place(ims, i, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, hs), t * 10, 1.5);
          pushHalo(x, y, z, 3.0, 2.3, 2.3, 2.5, 0.55, CELL.GLOW);
          if (emit) FX.add.emit(x - vx * 0.02, y, z - vz * 0.02, 0, 0, 0, 0.3, 0.45, 0.05, 2.1, 2.1, 2.3, 0.7, CELL.STREAK, 0, 0, 0, 0, 0);
          break;
        case 'ROCK':
          place(ims, i, x, y, z, t * 3 + n, t * 2.2, t * 1.7, 1.3 * Math.max(1, p.radius / 0.8));   // (Gorath's ring boulders are bigger)
          if (emit && Math.random() < dt * 20) FX.norm.emit(x, y, z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.5, 0.4, 0.9, 0.55, 0.5, 0.42, 0.5, CELL.SMOKE);
          break;
      }
    }
    for (const k in sys.S) { const n = counts[k]; for (const m of sys.S[k]) commitInst(m, n); }
    for (const k in sys.E) { const n = counts['e' + k]; for (const m of sys.E[k]) commitInst(m, n); }
  }, -0.2);
  return <primitive object={sys.group} />;
}
void sparks; void Euler; void Quaternion; void Vector3; void ConeGeometry; void MeshStandardMaterial;
