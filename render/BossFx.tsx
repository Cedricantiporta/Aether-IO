// Draws the hazard pools of engine/systems/bossFx.ts for the wave 30-70 bosses.
// One InstancedMesh per prop type (roots, ice spikes, fire pillars, acid globs, thorns), one shader-quad mesh for the expanding rings,
// portals (torus + disc), void echoes (ghost silhouettes), the Void arena veil and particle emitters for the frost breath and blizzard.
// Everything is preallocated, culled with inView(), and `mesh.count` = live instances. Telegraphs themselves are drawn by Zones.tsx.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Color, ConeGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, SphereGeometry, TorusGeometry, Group,
} from 'three';
import { world } from '../engine/world';
import {
  waves, props, portals, echoes, breath, arena, chill,
  PROP_ROOT, PROP_ICE, PROP_PILLAR, PROP_GLOB, PROP_THORN,
} from '../engine/systems/bossFx';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX } from './fx';
import { GB, TAU, clamp, commitInst, liveRange, setInst } from './util';
import { inView } from './view';

const MAXW = 12, MAXP = 160, MAXPORT = 8, MAXECHO = 4;
const _c = new Color();
const ECHO_COL = [0x9ca3af, 0xc084fc, 0x84cc16, 0x7dd3fc, 0xff5a1a];
const rnd = Math.random;

// ---------------------------------------------------------------- shaders ---
const RING_VS = `attribute vec4 iW; attribute vec3 iC; varying vec2 vQ; varying vec4 vW; varying vec3 vC; varying float vSz;
void main(){ vQ = position.xz * 2.0; vW = iW; vC = iC; vSz = length(instanceMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const RING_FS = `uniform float uTime; varying vec2 vQ; varying vec4 vW; varying vec3 vC; varying float vSz;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float d = length(vQ) * vSz * 0.5; float r = vW.x, th = vW.y, kind = vW.z;
  float ang = atan(vQ.y, vQ.x);
  float a = 0.0; vec3 c = vC;
  if (kind < 0.5) { // thorns: a ring of jagged spikes pointing outward
    float tooth = pow(0.5 + 0.5 * sin(ang * 34.0), 2.0);
    float outer = r + th * 0.5 + tooth * th * 1.1;
    a = smoothstep(r - th * 0.5 - 0.1, r - th * 0.4, d) * (1.0 - smoothstep(outer - 0.12, outer, d));
    c = mix(vC * 0.45, vC * 1.5, smoothstep(r - th * 0.5, outer, d));
  } else { // void / inward / fire: bright band with a fading trail
    float band = smoothstep(th * 0.5, th * 0.12, abs(d - r));
    float trail = smoothstep(r - th * 3.2, r, d) * step(d, r) * 0.28;
    float fl = kind > 2.5 ? 0.75 + 0.25 * sin(ang * 14.0 + uTime * 18.0) : 1.0;
    a = (band + trail) * fl; c = vC * (1.0 + band * 1.2);
  }
  a *= vW.w;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const VEIL_VS = `varying vec2 vQ; void main(){ vQ = position.xz * 2.0; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const VEIL_FS = `uniform float uTime; uniform float uR; varying vec2 vQ;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  float d = length(vQ); float r = uR;               // vQ in [-1,1] over the whole quad, uR = arena radius / half size
  float edge = exp(-pow((d - r) / (0.0035 + r * 0.012), 2.0));
  float out_ = smoothstep(r, r + 0.01, d);
  float n = noise(vQ * 90.0 + uTime * 0.6) * 0.6 + noise(vQ * 220.0 - uTime) * 0.4;
  float a = out_ * (0.34 + 0.2 * n) + edge * (0.65 + 0.35 * sin(uTime * 6.0));
  vec3 c = mix(vec3(0.16, 0.03, 0.3), vec3(0.85, 0.45, 1.5), edge);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.85));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function BossFx() {
  const status = useGameStore((s) => s.status);
  const sys = useMemo(() => {
    const group = new Group();
    const dyn = (m: InstancedMesh, order = 2) => { m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = order; group.add(m); return m; };

    // expanding rings (shader quad per ring)
    const rg = new PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    const iW = new InstancedBufferAttribute(new Float32Array(MAXW * 4), 4), iC = new InstancedBufferAttribute(new Float32Array(MAXW * 3), 3);
    iW.setUsage(DynamicDrawUsage); iC.setUsage(DynamicDrawUsage); rg.setAttribute('iW', iW); rg.setAttribute('iC', iC);
    const ringMat = new ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const rings = dyn(new InstancedMesh(rg, ringMat, MAXW), 4);

    // props
    const litM = (hex: number, em = 0) => new MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.85, emissive: em, emissiveIntensity: em ? 0.6 : 0 });
    const root = dyn(new InstancedMesh(new ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), litM(0x6b4423), MAXP)); root.castShadow = false;
    const ice = dyn(new InstancedMesh(new ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), new MeshStandardMaterial({ color: 0xbfe8ff, flatShading: true, roughness: 0.15, metalness: 0.1, emissive: 0x2a8ac0, emissiveIntensity: 0.7 }), MAXP));
    const thorn = dyn(new InstancedMesh(new ConeGeometry(0.4, 1, 4).translate(0, 0.5, 0), litM(0x4f7a1e), MAXP));
    const pillar = dyn(new InstancedMesh(new CylinderGeometry(1, 0.8, 1, 12, 1, true).translate(0, 0.5, 0), new MeshBasicMaterial({ color: new Color(2.2, 0.9, 0.2), transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }), MAXP), 3);
    const core = dyn(new InstancedMesh(new CylinderGeometry(0.55, 0.45, 1, 10, 1, true).translate(0, 0.5, 0), new MeshBasicMaterial({ color: new Color(2.4, 2.0, 0.9), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }), MAXP), 3);
    const glob = dyn(new InstancedMesh(new SphereGeometry(0.5, 8, 6), new MeshBasicMaterial({ color: new Color(0.8, 1.6, 0.25), toneMapped: false }), MAXP));

    // portals: a standing double ring + a dark disc
    const portalRing = dyn(new InstancedMesh(new TorusGeometry(1, 0.12, 6, 22), new MeshBasicMaterial({ color: new Color(1.6, 0.6, 2.4), transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), MAXPORT), 3);
    const portalIn = dyn(new InstancedMesh(new TorusGeometry(0.66, 0.07, 5, 18), new MeshBasicMaterial({ color: new Color(2.2, 1.2, 2.8), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), MAXPORT), 3);
    const portalDisc = dyn(new InstancedMesh(new SphereGeometry(0.95, 14, 2).scale(1, 1, 0.04), new MeshBasicMaterial({ color: 0x14052a, transparent: true, opacity: 0.88, depthWrite: false }), MAXPORT), 3);

    // echoes: ghostly figure
    const eg = new GB([0.7, 1.1]);
    eg.cone(0.85, 2.6, 8, [0, 1.3, 0], '#ffffff'); eg.sph(0.4, [0, 2.9, 0], '#ffffff', 1, 8);
    eg.cone(0.14, 0.9, 4, [0.4, 3.35, 0], '#ffffff', [0, 0, -0.5]); eg.cone(0.14, 0.9, 4, [-0.4, 3.35, 0], '#ffffff', [0, 0, 0.5]);
    const echo = dyn(new InstancedMesh(eg.build(), new MeshBasicMaterial({ vertexColors: false, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), MAXECHO), 3);
    echo.setColorAt(0, _c.setRGB(1, 1, 1)); echo.instanceColor!.setUsage(DynamicDrawUsage);

    // Void arena veil (one big quad centred on the arena)
    const vg = new PlaneGeometry(1, 1); vg.rotateX(-Math.PI / 2);
    const veilMat = new ShaderMaterial({ vertexShader: VEIL_VS, fragmentShader: VEIL_FS, uniforms: { uTime: { value: 0 }, uR: { value: 0.5 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const veil = new Mesh(vg, veilMat); veil.frustumCulled = false; veil.renderOrder = 2; veil.visible = false; group.add(veil);
    return { group, rings, iW, iC, ringMat, root, ice, thorn, pillar, core, glob, portalRing, portalIn, portalDisc, echo, veil, veilMat };
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const st = useGameStore.getState().status;
    const dt = st === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    const pp = world.player.pos;

    // ---- expanding rings
    {
      const W = sys.iW.array as Float32Array, C = sys.iC.array as Float32Array;
      let n = 0;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        if (!w.active || !inView(w.x, w.z, w.r + w.thick + 4)) continue;
        const sz = (Math.max(w.r, 0.5) + w.thick * 2 + 1) * 2;
        setInst(sys.rings, n, w.x, 0.14, w.z, 0, sz, 1, sz);
        W[n * 4] = w.r; W[n * 4 + 1] = Math.max(0.6, w.thick); W[n * 4 + 2] = w.kind; W[n * 4 + 3] = w.hit ? 0.35 : 1;
        _c.setHex(w.color); C[n * 3] = _c.r; C[n * 3 + 1] = _c.g; C[n * 3 + 2] = _c.b;
        n++;
      }
      commitInst(sys.rings, n); liveRange(sys.iW, n); liveRange(sys.iC, n); sys.ringMat.uniforms.uTime.value = t;
    }

    // ---- props
    {
      let nR = 0, nI = 0, nT = 0, nP = 0, nC = 0, nG = 0;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.active) continue;
        const tt = p.t - p.delay;
        if (p.kind === PROP_GLOB) {
          if (!inView(p.x, p.z, 8) && !inView(p.sx, p.sz, 4)) continue;
          if (tt < 0) { // in flight, a lob from the spitter to the target
            const k = clamp(p.t / Math.max(0.05, p.delay), 0, 1);
            setInst(sys.glob, nG++, p.sx + (p.x - p.sx) * k, 0.8 + Math.sin(k * Math.PI) * 5.5, p.sz + (p.z - p.sz) * k, 0, p.r, p.r, p.r);
            if (dt > 0 && rnd() < dt * 30) FX.add.emit(p.sx + (p.x - p.sx) * k, 0.8 + Math.sin(k * Math.PI) * 5.5, p.sz + (p.z - p.sz) * k, 0, 0, 0, 0.35, 0.4, 0.05, 0.6, 1.6, 0.2, 0.7, CELL.DISC);
          } else { const s = p.r * 1.8 * (1 - tt / p.life); if (s > 0.05) setInst(sys.glob, nG++, p.x, 0.15, p.z, 0, s * 2, s * 0.25, s * 2); }
          continue;
        }
        if (tt < 0 || !inView(p.x, p.z, p.r + 4)) continue;
        const grow = clamp(tt / 0.14, 0, 1) * clamp((p.life - tt) / 0.3, 0, 1);
        const e = grow * (2 - grow); // ease out
        if (e <= 0.01) continue;
        switch (p.kind) {
          case PROP_ROOT: setInst(sys.root, nR++, p.x, 0, p.z, p.rot, p.r * 1.3, p.h * e, p.r * 1.3, 0.12, -0.1); break;
          case PROP_ICE: setInst(sys.ice, nI++, p.x, 0, p.z, p.rot, p.r * 1.2, p.h * e, p.r * 1.2, 0.08, 0.05); break;
          case PROP_THORN: setInst(sys.thorn, nT++, p.x, 0, p.z, p.rot, p.r * 1.4, p.h * e, p.r * 1.4); break;
          default: { // pillar of fire
            const fl = 1 + 0.12 * Math.sin(t * 30 + p.rot);
            setInst(sys.pillar, nP++, p.x, 0, p.z, t * 2, p.r * fl, p.h * e, p.r * fl);
            setInst(sys.core, nC++, p.x, 0, p.z, -t * 3, p.r * fl, p.h * e * 0.9, p.r * fl);
            if (dt > 0 && rnd() < dt * 40) FX.add.emit(p.x + (rnd() - 0.5) * p.r, 0.5, p.z + (rnd() - 0.5) * p.r, 0, 8 + rnd() * 6, 0, 0.6, 0.5, 0.1, 2.4, 1.0, 0.2, 0.8, CELL.FLAME);
          }
        }
      }
      const set = commitInst;
      set(sys.root, nR); set(sys.ice, nI); set(sys.thorn, nT); set(sys.pillar, nP); set(sys.core, nC); set(sys.glob, nG);
    }

    // ---- portals
    {
      let n = 0;
      for (let i = 0; i < portals.length; i++) {
        const q = portals[i];
        if (!q.active || !inView(q.x, q.z, 6)) continue;
        const k = Math.min(clamp(q.t / Math.max(0.05, q.open), 0, 1), clamp((q.life - q.t) / 0.4, 0, 1));
        const e = k * (2 - k) * 2.0;
        const yaw = Math.atan2(pp.x - q.x, pp.z - q.z);
        setInst(sys.portalRing, n, q.x, 2.3 * k, q.z, yaw, e, e, e, 0, t * 0.8);
        setInst(sys.portalIn, n, q.x, 2.3 * k, q.z, yaw, e, e, e, 0, -t * 2.2);
        setInst(sys.portalDisc, n, q.x, 2.3 * k, q.z, yaw, e, e, e);
        if (dt > 0 && rnd() < dt * 26 && k > 0.5) { const a = rnd() * TAU; FX.add.emit(q.x + Math.sin(a) * e * 0.9, 2.3 + Math.cos(a) * e * 0.9, q.z, 0, 0, 0, 0.5, 0.3, 0.05, 1.8, 0.6, 2.4, 0.8, CELL.STAR); }
        n++;
      }
      commitInst(sys.portalRing, n); commitInst(sys.portalIn, n); commitInst(sys.portalDisc, n);
    }

    // ---- echoes
    {
      let n = 0;
      for (let i = 0; i < echoes.length; i++) {
        const q = echoes[i];
        if (!q.active || !inView(q.x, q.z, 6)) continue;
        const k = clamp(q.t / 0.35, 0, 1) * clamp((q.life - q.t) / 0.4, 0, 1);
        const fl = 0.85 + 0.15 * Math.sin(t * 40 + i);
        setInst(sys.echo, n, q.x, 0.4 + Math.sin(t * 2 + i) * 0.2, q.z, Math.atan2(pp.x - q.x, pp.z - q.z), k * fl, k, k * fl);
        _c.setHex(ECHO_COL[q.kind] ?? 0xffffff); _c.multiplyScalar(1.6);
        sys.echo.setColorAt(n, _c);
        if (dt > 0 && rnd() < dt * 18) FX.add.emit(q.x + (rnd() - 0.5) * 1.4, 0.4 + rnd() * 3, q.z + (rnd() - 0.5) * 1.4, 0, 1.4, 0, 0.7, 0.3, 0.05, _c.r, _c.g, _c.b, 0.7, CELL.DISC);
        n++;
      }
      commitInst(sys.echo, n);
    }

    // ---- Void arena veil
    {
      const v = sys.veil;
      v.visible = arena.shrink;
      if (arena.shrink) {
        const half = arena.r + 160; // the quad reaches 160 units past the ring
        v.position.set(arena.cx, 0.13, arena.cz); v.scale.set(half * 2, 1, half * 2);
        sys.veilMat.uniforms.uTime.value = t; sys.veilMat.uniforms.uR.value = arena.r / half;
      }
    }

    // ---- frost breath + blizzard + chill particles
    if (dt > 0) {
      if (breath.active) {
        const n = Math.ceil(dt * 80);
        const baseA = Math.atan2(breath.dx, breath.dz);
        for (let k = 0; k < n; k++) {
          const d = rnd() * breath.range, a = baseA + (rnd() * 2 - 1) * breath.half * (0.3 + 0.7 * d / breath.range);
          const sx = Math.sin(a), cz = Math.cos(a);
          FX.add.emit(breath.x + sx * d * 0.3, 1.2 + rnd() * 1.5, breath.z + cz * d * 0.3, sx * (12 + rnd() * 6), (rnd() - 0.5) * 1.5, cz * (12 + rnd() * 6), 0.5 + rnd() * 0.3, 0.5, 1.9, 0.7, 1.5, 1.9, 0.5, CELL.SMOKE, 0, 0.4, rnd() * 6, 1);
          if (rnd() < 0.35) FX.add.emit(breath.x + sx * d * 0.5, 1.5, breath.z + cz * d * 0.5, sx * 14, 0, cz * 14, 0.45, 0.28, 0.05, 1.4, 2.0, 2.4, 0.9, CELL.STAR, 0, 0.3, rnd() * 3, 3);
        }
      }
      if (arena.blizzard && rnd() < 0.9) {
        const n = Math.ceil(dt * 70);
        for (let k = 0; k < n; k++) FX.add.emit(pp.x + (rnd() - 0.5) * 70, 9 + rnd() * 7, pp.z + (rnd() - 0.5) * 50, -7, -13, 3, 0.9, 0.5, 0.08, 1.2, 1.5, 1.8, 0.7, CELL.STREAK, 0, 0, 0, 0, 0.12);
      }
      if (chill.stacks > 0 && rnd() < dt * (6 + chill.stacks * 6)) FX.add.emit(pp.x + (rnd() - 0.5) * 1.2, 0.4 + rnd() * 2, pp.z + (rnd() - 0.5) * 1.2, 0, 0.8, 0, 0.6, 0.3, 0.05, 1.2, 1.9, 2.4, 0.8, CELL.STAR, 0, 0, rnd() * 3, 2);
    }
  });

  return <primitive object={sys.group} visible={status !== GameStatus.MENU && status !== GameStatus.HERO_SELECT} />;
}
