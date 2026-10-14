// Instanced multi-part enemies + blob shadows, elite rings, shields, ice, stun stars and health bars.
import { meleeT } from '../engine/systems/enemies';
import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, CircleGeometry, Color, DoubleSide, DynamicDrawUsage, FrontSide, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, Material, MeshBasicMaterial, MeshStandardMaterial, Mesh, OctahedronGeometry, PlaneGeometry, ShaderMaterial,
  Sphere, SphereGeometry, TorusGeometry, Vector3, Group, Matrix4,
} from 'three';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, embers } from './fx';
import { clamp, patchFlashRim, setInst } from './util';
import { inView } from './view';
import { MODEL_KINDS, ModelDef, Poser, getModels } from './enemyModels';
import type { EnemyKind } from '../engine/types';

const MAX = 400;
const _c = new Color(), _w = new Color();
const AFFIX_TINT: Record<string, [number, number, number]> = { HASTED: [1.2, 1.12, 0.75], VAMPIRIC: [1.25, 0.78, 0.82], FROZEN: [0.8, 1.0, 1.3], VOLATILE: [1.3, 0.95, 0.7], SHIELDED: [0.9, 1.0, 1.25], NONE: [1, 1, 1] };
// per-kind colour multiplier on top of the model's own colours (imps = red-hot goblins)
const KIND_TINT: Partial<Record<EnemyKind, [number, number, number]>> = { BOSS_IMP: [2.1, 0.5, 0.35] };
const AFFIX_COL: Record<string, number> = { HASTED: 0xffd23a, VAMPIRIC: 0xd0203a, FROZEN: 0x5ad0ff, VOLATILE: 0xff7a1a, SHIELDED: 0x4a8aff, NONE: 0xe8b030 };

const SHADOW_VS = `attribute float iA; varying vec2 vUv; varying float vA;
void main(){ vUv = position.xz + 0.5; vA = iA; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const SHADOW_FS = `varying vec2 vUv; varying float vA; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.25, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.02, 0.03, 0.02, a);
#include <colorspace_fragment>
}`;
const RING_VS = `attribute vec3 iC; varying vec2 vUv; varying vec3 vC;
void main(){ vUv = position.xz + 0.5; vC = iC; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const RING_FS = `uniform float uTime; varying vec2 vUv; varying vec3 vC;
void main(){ vec2 p = (vUv - 0.5) * 2.0; float d = length(p); float ang = atan(p.y, p.x);
  float ring = smoothstep(0.62, 0.74, d) * smoothstep(1.0, 0.86, d);
  float dash = 0.65 + 0.35 * sin(ang * 8.0 + uTime * 3.0);
  float glow = smoothstep(1.0, 0.5, d) * 0.22;
  float a = ring * dash + glow; if (a < 0.01) discard;
  gl_FragColor = vec4(vC * 1.7, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const BAR_VS = `attribute vec3 iPos; attribute vec3 iD; varying vec2 vUv; varying vec3 vD;
void main(){ vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * vec2(iD.z, iD.z * 0.16); gl_Position = projectionMatrix * mv; vUv = position.xy + 0.5; vD = iD; }`;
const BAR_FS = `varying vec2 vUv; varying vec3 vD;
void main(){ float fill = vD.x; float kind = vD.y; vec2 p = vUv;
  float border = step(p.x, 0.018) + step(0.982, p.x) + step(p.y, 0.16) + step(0.84, p.y);
  vec3 col = vec3(0.07, 0.06, 0.09);
  vec3 f = mix(vec3(0.85, 0.15, 0.12), vec3(0.3, 0.85, 0.25), fill);
  if (kind > 0.5 && kind < 1.5) f = mix(vec3(0.75, 0.2, 0.9), vec3(1.0, 0.8, 0.2), fill);
  if (kind > 1.5) f = vec3(0.9, 0.12, 0.2);
  float inner = step(0.02, p.x) * step(p.x, 0.98) * step(0.16, p.y) * step(p.y, 0.84);
  if (inner > 0.5 && p.x < fill) { col = f * (0.75 + 0.5 * p.y); }
  if (border > 0.5) col = vec3(0.02, 0.02, 0.03);
  gl_FragColor = vec4(col, 0.95);
#include <colorspace_fragment>
}`;

interface KindRT { def: ModelDef; meshes: InstancedMesh[]; mats: ('lit' | 'lit2' | 'jelly' | 'glow' | 'ghost')[]; flash: InstancedBufferAttribute; }

export function Enemies() {
  const status = useGameStore((s) => s.status);
  const sys = useMemo(() => {
    const models = getModels();
    const lit = patchFlashRim(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.02 }), 0.4);
    const lit2 = patchFlashRim(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: DoubleSide }), 0.4);
    const jelly = patchFlashRim(new MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.8, depthWrite: false }), 0.7);
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const ghost = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const mats = { lit, lit2, jelly, glow, ghost };
    const group = new Group();
    const kinds: Partial<Record<EnemyKind, KindRT>> = {};
    const poser = new Poser();
    for (const k of MODEL_KINDS) {
      const def = models[k]!;
      const flash = new InstancedBufferAttribute(new Float32Array(MAX), 1); flash.setUsage(DynamicDrawUsage);
      const meshes = def.parts.map((p) => {
        if (p.mat !== 'glow' && p.mat !== 'ghost') p.geo.setAttribute('aFlash', flash);
        const m = new InstancedMesh(p.geo, (mats as any)[p.mat] as Material, MAX);
        m.instanceMatrix.setUsage(DynamicDrawUsage);
        m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = p.mat !== 'glow' && p.mat !== 'ghost';
        m.setColorAt(0, _c.setRGB(1, 1, 1)); m.instanceColor!.setUsage(DynamicDrawUsage);
        if (p.mat === 'jelly' || p.mat === 'ghost') m.renderOrder = 3;
        group.add(m);
        return m;
      });
      kinds[k] = { def, meshes, mats: def.parts.map((p) => p.mat), flash };
    }
    // blob shadows
    const flatPlane = new PlaneGeometry(1, 1); flatPlane.rotateX(-Math.PI / 2);
    const mk1 = (g: BufferGeometry, name: string, n = MAX) => { const a = new InstancedBufferAttribute(new Float32Array(n * (name === 'iC' ? 3 : 1)), name === 'iC' ? 3 : 1); a.setUsage(DynamicDrawUsage); g.setAttribute(name, a); return a; };
    const shGeo = flatPlane.clone(); const shA = mk1(shGeo, 'iA');
    const shadows = new InstancedMesh(shGeo, new ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), MAX);
    shadows.frustumCulled = false; shadows.count = 0; shadows.renderOrder = 1; shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    const rGeo = flatPlane.clone(); const rC = mk1(rGeo, 'iC', 128);
    const ringMat = new ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const rings = new InstancedMesh(rGeo, ringMat, 128); rings.frustumCulled = false; rings.count = 0; rings.renderOrder = 2; rings.instanceMatrix.setUsage(DynamicDrawUsage);
    const bubble = new InstancedMesh(new SphereGeometry(1, 14, 10), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 128);
    bubble.frustumCulled = false; bubble.count = 0; bubble.setColorAt(0, _c.setRGB(1, 1, 1));
    const ice = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, flatShading: true, emissive: 0x2a6a9a, emissiveIntensity: 0.6 }), MAX);
    ice.frustumCulled = false; ice.count = 0;
    const stars = new InstancedMesh(new OctahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: new Color(2.2, 1.9, 0.4), toneMapped: false }), 300);
    stars.frustumCulled = false; stars.count = 0;
    const halo = new InstancedMesh(new TorusGeometry(0.42, 0.06, 5, 16).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 128);
    halo.frustumCulled = false; halo.count = 0; halo.setColorAt(0, _c.setRGB(1, 1, 1));
    // health bars
    const bg = new InstancedBufferGeometry(); const bq = new PlaneGeometry(1, 1);
    bg.index = bq.index; bg.setAttribute('position', bq.attributes.position);
    const bPos = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3), bD = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    bPos.setUsage(DynamicDrawUsage); bD.setUsage(DynamicDrawUsage);
    bg.setAttribute('iPos', bPos); bg.setAttribute('iD', bD); bg.instanceCount = 0; bg.boundingSphere = new Sphere(new Vector3(), 1e6);
    const barMesh = new Mesh(bg, new ShaderMaterial({ vertexShader: BAR_VS, fragmentShader: BAR_FS, transparent: true, depthTest: false, depthWrite: false }));
    barMesh.frustumCulled = false; barMesh.renderOrder = 60;
    group.add(shadows, rings, bubble, ice, stars, halo, barMesh);
    return { group, kinds, poser, shadows, shA, rings, rC, ringMat, bubble, ice, stars, halo, bg, bPos, bD, frozenAt: new Float32Array(MAX), wasFrozen: new Uint8Array(MAX) };
  }, []);
  useEffect(() => () => { sys.group.traverse((o: any) => { o.geometry?.dispose?.(); }); }, [sys]);

  const counts = useMemo(() => new Int32Array(MODEL_KINDS.length), []);
  const M = useMemo(() => new Matrix4(), []);
  void M;

  useFrame(({ clock }, dtRaw) => {
    const st = useGameStore.getState().status;
    const dt = st === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    const { poser, kinds } = sys;
    counts.fill(0);
    let nSh = 0, nRing = 0, nBub = 0, nIce = 0, nStar = 0, nHalo = 0, nBar = 0;
    const enemies = world.enemies;
    const showBars = useGameStore.getState().settings?.showEnemyBars !== false;
    const bP = sys.bPos.array as Float32Array, bDd = sys.bD.array as Float32Array;
    const shAa = sys.shA.array as Float32Array, rCa = sys.rC.array as Float32Array;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active || e.boss || e.decoy || e.hideT > 0) continue;
      if (!inView(e.pos.x, e.pos.z, 4)) continue;   // off-screen: no pose, shadow, bar or particles
      const ki = MODEL_KINDS.indexOf(e.kind);   // 8 entries: tiny linear scan
      if (ki < 0) continue;
      const K = kinds[e.kind]!;
      const idx = counts[ki]++;
      const eliteK = e.elite ? 1.14 : 1;
      let s = e.scale * eliteK;
      let fx = 1, fy = 1, yOff = 0, alpha = 1;
      if (e.state === 'SPAWN') {
        const k = clamp(e.stateT / 0.6, 0, 1);
        yOff = -(1 - k) * 1.3 * s; fx = fy = 0.75 + 0.25 * k; alpha = k;
      } else if (e.state === 'DYING') {
        const k = clamp(e.deathT / 0.6, 0, 1);
        fy = Math.max(0.02, 1 - k * 1.25); fx = 1 + k * 0.5 * (1 - k) + 0.1; if (k > 0.55) { fx *= Math.max(0, 1 - (k - 0.55) / 0.45); } alpha = 1 - k;
      }
      // animation clock (frozen / stunned hold their pose)
      const hold = e.freezeT > 0 || e.stunT > 0;
      if (hold && !sys.wasFrozen[i]) sys.frozenAt[i] = e.animT;
      sys.wasFrozen[i] = hold ? 1 : 0;
      const at = hold ? sys.frozenAt[i] : e.animT;

      poser.meshes = K.meshes; poser.idx = idx;
      poser.begin(e.pos.x, e.pos.y, e.pos.z, e.facing, s, fx, fy, yOff);
      K.def.pose(e, poser, at);

      // tint + flash
      let r = 1, g = 1, b = 1, fl = e.hitFlash;
      const kt = KIND_TINT[e.kind]; if (kt) { r = kt[0]; g = kt[1]; b = kt[2]; }
      if (e.affix !== 'NONE') { const a = AFFIX_TINT[e.affix]; r *= a[0]; g *= a[1]; b *= a[2]; }
      if (e.freezeT > 0) { r *= 0.6; g *= 0.92; b *= 1.4; fl = Math.max(fl, 0.14); }
      if (e.burnT > 0) { const p = 0.5 + 0.5 * Math.sin(t * 14 + i); r *= 1.3; g *= 0.78 + 0.12 * p; b *= 0.55; }
      if (e.poisonT > 0) { r *= 0.72; g *= 1.25; b *= 0.62; }
      if (e.slowT > 0) { r *= 0.85; g *= 0.95; b *= 1.18; }
      if (e.state === 'WINDUP') fl = Math.max(fl, 0.1 + 0.12 * Math.sin(e.stateT * 34));
      else if (meleeT[e.id] > 0) fl = Math.max(fl, 0.22 + 0.14 * Math.sin(e.animT * 40));   // winding up a basic strike
      sys.kinds[e.kind]!.flash.array[idx] = fl;
      const gl = poser.glow;
      for (let m = 0; m < K.meshes.length; m++) {
        if (K.mats[m] === 'glow') K.meshes[m].setColorAt(idx, _c.setRGB(gl * (0.7 + 0.3 * r), gl * (0.7 + 0.3 * g), gl * (0.7 + 0.3 * b)));
        else if (K.mats[m] === 'ghost') { const f = poser.fade * alpha; K.meshes[m].setColorAt(idx, _c.setRGB(r * f, g * f, b * f)); }
        else K.meshes[m].setColorAt(idx, _c.setRGB(r, g, b));
      }

      // blob shadow
      if (nSh < MAX) {
        const rr = K.def.shadow * s * 1.5;
        setInst(sys.shadows, nSh, e.pos.x, 0.05, e.pos.z, 0, rr, 1, rr);
        shAa[nSh] = 0.42 * alpha * (e.state === 'DYING' ? 0.5 : 1);
        nSh++;
      }
      if (e.state === 'DYING') continue;

      // elite ring / halo / shield
      if (e.elite) {
        const hex = e.affix === 'NONE' ? (e.id % 2 ? 0xa855f7 : 0xe8b030) : AFFIX_COL[e.affix];
        _w.setHex(hex);
        if (nRing < 128) { const rr = (e.radius * 1.6 + 1.1) * Math.max(0.8, eliteK); setInst(sys.rings, nRing, e.pos.x, 0.07, e.pos.z, t * 0.5, rr * 2, 1, rr * 2); rCa[nRing * 3] = _w.r; rCa[nRing * 3 + 1] = _w.g; rCa[nRing * 3 + 2] = _w.b; nRing++; }
        if (nHalo < 128) { setInst(sys.halo, nHalo, e.pos.x, e.pos.y + K.def.headY * s + 0.55 + Math.sin(t * 3 + i) * 0.06, e.pos.z, t * 2, 1.0, 1, 1); sys.halo.setColorAt(nHalo, _c.setRGB(_w.r * 1.8, _w.g * 1.8, _w.b * 1.8)); nHalo++; }
      }
      if (e.shield > 0 && nBub < 128) {
        const rr = (e.radius * 1.5 + 0.5) * Math.max(1, s * 0.7);
        setInst(sys.bubble, nBub, e.pos.x, e.pos.y + 0.9 * s, e.pos.z, t, rr, rr * 1.15, rr);
        sys.bubble.setColorAt(nBub, _c.setRGB(0.3, 0.6, 1.2)); nBub++;
      }
      if (e.freezeT > 0 && nIce < MAX) {
        const rr = (e.radius * 1.05 + 0.35) * Math.max(1, s * 0.75);
        setInst(sys.ice, nIce, e.pos.x, e.pos.y + 0.8 * s, e.pos.z, e.id, rr, rr * 1.35, rr, 0.2, 0.1); nIce++;
      }
      if (e.stunT > 0 && nStar + 3 <= 300) {
        for (let k = 0; k < 3; k++) { const a = t * 5 + (k / 3) * 6.283; setInst(sys.stars, nStar++, e.pos.x + Math.cos(a) * 0.5 * s, e.pos.y + K.def.headY * s + 0.35, e.pos.z + Math.sin(a) * 0.5 * s, t * 8, 1, 1, 1); }
      }
      // status particles
      if (dt > 0) {
        if (e.burnT > 0 && Math.random() < dt * 9) embers(e.pos.x, e.pos.y + 0.6 * s, e.pos.z, 1, 0xff8a2a, 0.35 * s, 3, 0.7, 0.16);
        if (e.poisonT > 0 && Math.random() < dt * 5) FX.add.emit(e.pos.x + (Math.random() - 0.5) * 0.7 * s, e.pos.y + 0.5 * s, e.pos.z + (Math.random() - 0.5) * 0.7 * s, 0, 1.4, 0, 0.8, 0.22, 0.05, 0.4, 1.6, 0.3, 0.7, CELL.DISC);
        if (e.freezeT > 0 && Math.random() < dt * 3) FX.add.emit(e.pos.x + (Math.random() - 0.5) * s, e.pos.y + Math.random() * 1.5 * s, e.pos.z + (Math.random() - 0.5) * s, 0, 0.3, 0, 0.5, 0.3, 0.1, 1.4, 2.0, 2.4, 0.9, CELL.STAR, 0, 0, Math.random() * 3, 3);
      }
      // health bar
      if ((e.hp < e.maxHp || e.elite) && e.state !== 'SPAWN' && nBar < MAX && showBars) {
        bP[nBar * 3] = e.pos.x; bP[nBar * 3 + 1] = e.pos.y + K.def.headY * s + (e.elite ? 1.15 : 0.5); bP[nBar * 3 + 2] = e.pos.z;
        bDd[nBar * 3] = clamp(e.hp / e.maxHp, 0, 1); bDd[nBar * 3 + 1] = e.elite ? 1 : 0; bDd[nBar * 3 + 2] = e.elite ? 1.9 : 1.25;
        nBar++;
      }
    }

    for (let ki = 0; ki < MODEL_KINDS.length; ki++) {
      const K = kinds[MODEL_KINDS[ki]]!, n = counts[ki];
      for (const m of K.meshes) {
        m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      K.flash.needsUpdate = true;
    }
    const upd = (m: InstancedMesh, n: number) => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    upd(sys.shadows, nSh); sys.shA.needsUpdate = true;
    upd(sys.rings, nRing); sys.rC.needsUpdate = true; sys.ringMat.uniforms.uTime.value = t;
    upd(sys.bubble, nBub); upd(sys.ice, nIce); upd(sys.stars, nStar); upd(sys.halo, nHalo);
    sys.bg.instanceCount = nBar; sys.bPos.needsUpdate = true; sys.bD.needsUpdate = true;
  });

  return <primitive object={sys.group} visible={status !== GameStatus.HERO_SELECT} />;
}

