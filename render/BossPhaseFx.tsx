// Visuals of the boss invulnerable phases (engine/systems/bossPhases.ts state `bp`, human versions from humanBosses.ts `humanView`):
//   one big floor plane (shader) = Glacius' red Avalanche floor with glowing safe circles, and the wind / wave streaks with clear
//   "lee" lanes behind rocks / pillars (Hydra Tidal Wave, Dune Colossus Sandstorm); instanced rocks / pillars / wrecks, spore pods,
//   lava tiles, void-hand rings, Gorath's boulder, the solid-vs-flickering shadows of the Herald's illusions, Varn's giant shield and
//   Sable's footprints. Everything is pooled / instanced and skipped when idle.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide, DynamicDrawUsage, IcosahedronGeometry,
  InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, ShaderMaterial, Vector4, type BufferGeometry,
} from 'three';
import { world } from '../engine/world';
import { bp, MAX_TILES, LAVA_HITS } from '../engine/systems/bossPhaseState';
import { humanView, humanFoot } from '../engine/systems/humanBosses';
import { CELL, pushHalo } from './fx';
import { commitInst, setInst, smooth } from './util';

const mk = (g: BufferGeometry, color: Color | number, opacity: number, cap: number, additive = false): InstancedMesh => {
  const m = new InstancedMesh(g, new MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, depthWrite: false, toneMapped: false, side: DoubleSide, ...(additive ? { blending: AdditiveBlending } : {}) }), cap);
  m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage); return m;
};
const solid = (g: BufferGeometry, color: number, cap: number): InstancedMesh => {
  const m = new InstancedMesh(g, new MeshBasicMaterial({ color, toneMapped: false }), cap);
  m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage); return m;
};
const flat = (g: BufferGeometry): BufferGeometry => g.rotateX(-Math.PI / 2);
const _c = new Color();
const FLOOR_FRAG = `
uniform float uT; uniform float uA; uniform float uMode; uniform float uProg; uniform float uFlash;
uniform vec3 uC; uniform vec3 uFC; uniform vec2 uD; uniform vec2 uBoss; uniform vec4 uP[4];
varying vec2 vW;
void main(){
  vec2 p = vW; float a = 0.0; vec3 col = uC;
  if (uMode < 0.5) {
    float pulse = 0.5 + 0.5 * sin(uT * 5.0);
    a = (0.42 + 0.12 * pulse) * uA * (0.6 + 0.4 * uProg);
    col = vec3(1.0, 0.05, 0.03);
    float ring = 0.0, glow = 0.0, hole = 0.0;
    for (int i = 0; i < 4; i++) {
      if (uP[i].w < 0.5) continue;
      vec2 v = p - uP[i].xy; float r = uP[i].z, d = length(v);
      hole = max(hole, smoothstep(r, r - 0.5, d));
      float ang = atan(v.y, v.x) / 6.2831853 + 0.5;
      float fill = step(ang, 1.0 - uProg);
      ring = max(ring, smoothstep(0.34, 0.0, abs(d - r)) * mix(0.4, 1.0, fill));
      glow = max(glow, smoothstep(r + 1.4, r - 0.3, d));
    }
    a *= (1.0 - hole);
    col = mix(col, vec3(0.75, 0.96, 1.0), clamp(max(ring * 1.3, glow * 0.55), 0.0, 1.0));
    a = max(a, max(ring, glow * 0.45) * uA);
  } else {
    vec2 d = normalize(uD); vec2 pr = vec2(-d.y, d.x);
    float s = dot(p, d), q = dot(p, pr);
    float streak = smoothstep(0.8, 1.0, sin(s * 0.22 - uT * 9.0 + q * 1.3) * 0.5 + 0.5) * (sin(q * 0.5 + sin(s * 0.05) * 2.0) * 0.5 + 0.5);
    a = (0.12 + 0.24 * streak) * uA;
    float lee = 0.0;
    for (int i = 0; i < 4; i++) {
      if (uP[i].w < 0.5) continue;
      vec2 v = p - uP[i].xy; float along = dot(v, d), perp = abs(dot(v, pr));
      float edge = smoothstep(uP[i].z + 0.45, uP[i].z - 0.1, perp);
      if (along > -uP[i].z * 0.6 && along < 17.0) lee = max(lee, edge * smoothstep(17.0, 14.0, along));
    }
    col = mix(col, vec3(0.65, 1.0, 0.8), lee * 0.8);
    a = mix(a, 0.2 * uA, lee);
  }
  if (uFlash > 0.001) {
    float dist = length(p - uBoss), wave = (1.0 - uFlash) * 110.0;
    float band = smoothstep(16.0, 0.0, abs(dist - wave)) * uFlash;
    col = mix(col, uFC, clamp(band * 1.4, 0.0, 1.0)); a = max(a, band * 0.85);
  }
  gl_FragColor = vec4(col, a);
}`;

export function BossPhaseFx() {
  const S = useMemo(() => {
    const floorMat = new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: {
        uT: { value: 0 }, uA: { value: 0 }, uMode: { value: 0 }, uProg: { value: 0 }, uFlash: { value: 0 },
        uC: { value: new Color(0.5, 0.75, 1) }, uFC: { value: new Color(1, 1, 1) }, uD: { value: [0, 1] }, uBoss: { value: [0, 0] },
        uP: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
      },
      vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FLOOR_FRAG,
    });
    const floor = new Mesh(new PlaneGeometry(130, 130).rotateX(-Math.PI / 2), floorMat);
    floor.position.y = 0.055; floor.renderOrder = 4; floor.frustumCulled = false; floor.visible = false;
    const wallMat = new MeshBasicMaterial({ color: new Color(0.35, 0.75, 1.5), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: DoubleSide });
    const wall = new Mesh(new BoxGeometry(1, 1, 1), wallMat); wall.visible = false; wall.frustumCulled = false; wall.renderOrder = 6;
    const shieldMat = new MeshBasicMaterial({ color: new Color(0.7, 0.85, 1.4), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: DoubleSide });
    const shield = new Mesh(new CircleGeometry(1, 28), shieldMat); shield.visible = false; shield.frustumCulled = false; shield.renderOrder = 6;
    return {
      floor, floorMat, wall, wallMat, shield, shieldMat,
      beams: mk(new CylinderGeometry(1, 1, 1, 20, 1, true), new Color(0.5, 1.2, 1.6), 0.3, 4, true),
      rocks: solid(new DodecahedronGeometry(1, 0), 0x8a8f9c, 8),
      pillars: solid(new CylinderGeometry(0.62, 0.74, 1, 8), 0xc9a878, 8),
      slabs: solid(new BoxGeometry(1, 1, 1), 0x9a7a52, 8),
      rocksTop: mk(new DodecahedronGeometry(1, 0), new Color(0.55, 0.62, 0.75), 1, 8),
      pods: mk(new IcosahedronGeometry(1, 1), 0xffffff, 0.92, 8),
      rings: mk(flat(new RingGeometry(0.9, 1, 40)), 0xffffff, 0.85, 24),
      discs: mk(flat(new CircleGeometry(1, 28)), 0xffffff, 0.4, 24),
      tiles: mk(flat(new PlaneGeometry(1, 1)), 0xffffff, 0.8, MAX_TILES),
      ball: solid(new DodecahedronGeometry(1, 1), 0x7a6a58, 1),
      ballTop: solid(new DodecahedronGeometry(1, 0), 0xb09a80, 1),
      realDisc: mk(flat(new CircleGeometry(1, 24)), new Color(0.05, 0.02, 0.1), 0.92, 1),
      fakeDisc: mk(flat(new CircleGeometry(1, 24)), new Color(0.35, 0.2, 0.6), 0.5, 4),
      foot: mk(flat(new CircleGeometry(1, 12)), new Color(0.8, 0.6, 1.5), 0.7, 12, true),
    };
  }, []);
  const hold = useMemo(() => ({ k: 0 }), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const vis = bp.on || bp.tail < 0.7;
    const live = bp.on ? 1 : Math.max(0, 1 - bp.tail / 0.7);
    // ---- floor plane: Avalanche (mode 0) or wind / wave streaks (mode 1)
    const U = S.floorMat.uniforms;
    let fa = 0, mode = 0;
    const kind = bp.kind;
    if (bp.on || bp.floor > 0.01) {
      if (kind === 'AVALANCHE') { fa = bp.floor; mode = 0; }
      else if (bp.on && kind === 'TIDAL' && (bp.count >= 0 || bp.wave < 2)) { fa = 0.75; mode = 1; }
      else if (bp.on && kind === 'SAND') { fa = bp.windOn ? 1 : 0.4; mode = 1; }
    }
    hold.k += (fa - hold.k) * Math.min(1, dt * 6);
    S.floor.visible = hold.k > 0.01 || bp.flash > 0.01;
    if (S.floor.visible) {
      U.uT.value = t; U.uA.value = hold.k; U.uMode.value = mode;
      U.uProg.value = bp.countMax > 0 && bp.count >= 0 ? Math.min(1, Math.max(0, 1 - bp.count / bp.countMax)) : 1;
      U.uFlash.value = bp.flash;
      const e = world.enemies[bp.id];
      U.uBoss.value[0] = e ? e.pos.x : 0; U.uBoss.value[1] = e ? e.pos.z : 0;
      const sandShift = kind === 'SAND' && bp.shiftT > 0;
      U.uD.value[0] = sandShift ? bp.nx : bp.wx; U.uD.value[1] = sandShift ? bp.nz : bp.wz;
      if (kind === 'AVALANCHE') { U.uC.value.setRGB(1, 0.12, 0.09); U.uFC.value.setRGB(0.85, 0.96, 1); }
      else if (kind === 'TIDAL') { U.uC.value.setRGB(0.25, 0.65, 1); U.uFC.value.setRGB(0.5, 0.85, 1); }
      else { U.uC.value.setRGB(0.95, 0.72, 0.38); U.uFC.value.setRGB(1, 0.85, 0.5); }
      for (let i = 0; i < 4; i++) { const q = bp.props[i], v = U.uP.value[i]; v.set(q.x, q.z, q.r, q.on && vis ? 1 : 0); }
    }
    const e0 = world.enemies[bp.id];

    // ---- instanced props
    let nr = 0, np = 0, ns = 0, nb = 0, nring = 0, ndisc = 0, npod = 0;
    if (vis) {
      const rise = bp.on ? smooth(Math.min(1, Math.max(0, (bp.t - (kind === 'TIDAL' ? 0.9 : kind === 'SPORES' ? 0.8 : 0.1)) / 0.55))) : live;
      for (let i = 0; i < 8; i++) {
        const q = bp.props[i]; if (!q.on) continue;
        if (kind === 'TIDAL') {
          setInst(S.rocks, nr, q.x, q.r * 0.5 * rise, q.z, i * 1.3, q.r * 1.1, q.r * 0.95 * rise + 0.01, q.r * 1.0);
          setInst(S.rocksTop, nr, q.x + 0.4, q.r * 1.15 * rise, q.z - 0.3, i * 2.1, q.r * 0.6, q.r * 0.5 * rise + 0.01, q.r * 0.6);
          nr++;
        } else if (kind === 'PINBALL') {
          const h = 4.6 * rise; setInst(S.pillars, np++, q.x, h * 0.5, q.z, 0, q.r * 1.1, h, q.r * 1.1);
          pushHalo(q.x, h + 0.6, q.z, 3.2, 1.2, 0.9, 0.4, 0.35 * live, CELL.GLOW);
        } else if (kind === 'SAND') {
          const h = 3.4 * rise; setInst(S.slabs, ns++, q.x, h * 0.5, q.z, i * 1.7, q.r * 1.9, h, q.r * 1.0);
          setInst(S.pillars, np++, q.x + Math.cos(i * 1.7) * q.r * 1.6, 0.9 * rise, q.z - Math.sin(i * 1.7) * q.r * 1.6, 0, 1, 1.8 * rise, 1);
        } else if (kind === 'AVALANCHE') {
          // glowing light beams over the safe circles
          setInst(S.beams, nb++, q.x, 16, q.z, 0, 1.1, 32, 1.1);
        } else if (kind === 'SPORES') {
          const sw = 0.55 + q.h * 0.95, hot = q.h;
          _c.setRGB(0.4 + hot * 1.6, 1.0 - hot * 0.45, 0.25); S.pods.setColorAt(npod, _c);
          setInst(S.pods, npod, q.x, 0.9 + sw * 0.7, q.z, 0, sw * (1 + Math.sin(t * (6 + hot * 14)) * 0.05 * hot), sw, sw);
          npod++;
          _c.setRGB(0.5 + hot, 1.0 - hot * 0.5, 0.2); S.rings.setColorAt(nring, _c);
          setInst(S.rings, nring++, q.x, 0.1, q.z, 0, q.r * 2.1, 1, q.r * 2.1);
          _c.setRGB(0.3 + hot * 1.2, 0.7 - hot * 0.3, 0.1); S.discs.setColorAt(ndisc, _c);
          setInst(S.discs, ndisc++, q.x, 0.09, q.z, 0, q.r * 2.1 * Math.max(0.12, hot), 1, q.r * 2.1 * Math.max(0.12, hot));
        }
        if (kind === 'AVALANCHE') {
          _c.setRGB(0.6, 1.5, 1.8); S.rings.setColorAt(nring, _c);
          setInst(S.rings, nring++, q.x, 0.12, q.z, 0, q.r * 1.02, 1, q.r * 1.02);
          pushHalo(q.x, 2.5, q.z, 4.5, 0.4, 1.0, 1.4, 0.3 * live, CELL.GLOW);
        }
      }
    }
    // ---- lava tiles
    let nt = 0;
    if (vis && kind === 'LAVA') {
      const hs = bp.tileHalf - 0.2;
      for (let i = 0; i < bp.nt; i++) {
        // two eruptions per tile: show the most urgent state (erupting > flashing warning), else a dim ember (it may erupt again)
        const d0 = bp.t - bp.te[i * LAVA_HITS], d1 = bp.t - bp.te[i * LAVA_HITS + 1];
        const dtE = (d0 > -1.05 && d0 < 0.55) ? d0 : (d1 > -1.05 && d1 < 0.55) ? d1 : Math.max(d0, d1) >= 0.55 && Math.min(d0, d1) >= 0.55 ? 1 : -2;
        let r: number, g: number, b: number, y = 0.075;
        if (dtE >= 1) { r = 0.07; g = 0.09; b = 0.14; }                                      // both eruptions done: cooled for good
        else if (dtE >= 0) { r = 3; g = 1.9 * (1 - dtE); b = 0.5; y = 0.12; }                 // erupting
        else if (dtE > -1.05) { const w = 0.55 + 0.45 * Math.sin(t * 22); r = 2.2 * w + 0.4; g = 0.55 * w; b = 0.05; }   // warning
        else { r = 0.1; g = 0.1; b = 0.17; }                                                  // cool right now (safe until it flashes)
        _c.setRGB(r * live, g * live, b * live); S.tiles.setColorAt(nt, _c);
        setInst(S.tiles, nt, bp.tx[i], y, bp.tz[i], 0, hs * 2, 1, hs * 2);
        nt++;
        if (dtE >= 0 && dtE < 0.35) pushHalo(bp.tx[i], 1.0, bp.tz[i], 4, 2, 1, 0.2, 0.3 * (1 - dtE / 0.35), CELL.GLOW);
      }
    }
    // ---- void hands
    if (vis && kind === 'DARK') {
      for (let i = 0; i < bp.hands.length; i++) {
        const h = bp.hands[i]; if (!h.on) continue;
        const k = Math.min(1, h.t / h.T);
        _c.setRGB(0.9, 0.35 + k * 0.2, 1.8); S.rings.setColorAt(nring, _c);
        setInst(S.rings, nring++, h.x, 0.11, h.z, 0, 2.7, 1, 2.7);
        _c.setRGB(0.5 + k, 0.15, 1.2); S.discs.setColorAt(ndisc, _c);
        setInst(S.discs, ndisc++, h.x, 0.1, h.z, 0, 2.7 * Math.max(0.1, k), 1, 2.7 * Math.max(0.1, k));
        pushHalo(h.x, 0.6, h.z, 3 + k * 2, 0.7, 0.25, 1.6, 0.35 + 0.4 * k, CELL.GLOW);
      }
    }
    commitInst(S.rocks, nr); commitInst(S.rocksTop, nr); commitInst(S.pillars, np); commitInst(S.slabs, ns); commitInst(S.beams, nb);
    commitInst(S.pods, npod); commitInst(S.rings, nring); commitInst(S.discs, ndisc); commitInst(S.tiles, nt);
    for (const m of [S.pods, S.rings, S.discs, S.tiles]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // ---- the wave front (Tidal Wave): a moving wall of water, a pulsing preview at the starting edge during the countdown
    const W = S.wall;
    if (bp.on && kind === 'TIDAL' && (bp.count >= 0 || bp.wave < 2)) {
      const R = 40, started = bp.wave < 1.5 && bp.count <= 0, f = started ? bp.wave * R : -1.1 * R;
      W.visible = true;
      W.position.set(bp.wx * f, started ? 1.9 : 0.6, bp.wz * f); W.rotation.set(0, Math.atan2(bp.wx, bp.wz), 0);
      W.scale.set(130, started ? 3.8 : 1.0, started ? 5 : 2.4);
      S.wallMat.opacity = started ? 0.7 : 0.25 + 0.2 * Math.sin(t * 9);
      if (started) pushHalo(bp.wx * f, 2.5, bp.wz * f, 12, 0.5, 0.9, 1.6, 0.25, CELL.GLOW);
    } else W.visible = false;

    // ---- Gorath's boulder
    let nball = 0;
    if (bp.on && kind === 'PINBALL' && e0) {
      const r = e0.radius * 1.15, yaw = Math.atan2(bp.rx, bp.rz);
      if (bp.ball) {
        setInst(S.ball, 0, e0.pos.x, r, e0.pos.z, yaw, r, r, r, bp.spin);
        setInst(S.ballTop, 0, e0.pos.x, r, e0.pos.z, yaw + 0.8, r * 1.04, r * 1.04, r * 1.04, bp.spin * 1.2);
        nball = 1;
      } else if (bp.crackT > 0) pushHalo(e0.pos.x, e0.radius * 1.5, e0.pos.z, e0.radius * 3, 1.6, 1.2, 0.5, 0.45 + 0.2 * Math.sin(t * 12), CELL.GLOW);   // cracked: sparks
    }
    commitInst(S.ball, nball); commitInst(S.ballTop, nball);

    // ---- humans: Varn's giant shield, Sable's footprints
    const sh = S.shield;
    const he = humanView.id >= 0 ? world.enemies[humanView.id] : null;
    if (humanView.turn > 0 && he && he.active && he.state !== 'DYING') {
      sh.visible = true;
      sh.position.set(he.pos.x + Math.sin(he.facing) * 2.7, 2.0, he.pos.z + Math.cos(he.facing) * 2.7); sh.rotation.set(0, he.facing, 0);
      sh.scale.set(2.9, 2.5, 1);
      S.shieldMat.opacity = 0.34 + 0.08 * Math.sin(t * 6);
    } else sh.visible = false;
    let nf = 0;
    if (he && humanView.kind === 'SABLE') {
      for (let i = 0; i < humanFoot.length; i++) {
        const f = humanFoot[i]; if (f.age > 3.6) continue;
        const k = 1 - f.age / 3.6;
        setInst(S.foot, nf++, f.x, 0.1, f.z, 0, 0.55 * k + 0.15, 1, 0.8 * k + 0.2);
        if (f.age < 0.5) pushHalo(f.x, 0.4, f.z, 2.2, 0.8, 0.5, 1.6, 0.3 * (1 - f.age * 2), CELL.GLOW);
      }
    }
    commitInst(S.foot, nf);
  });

  return (
    <>
      <primitive object={S.floor} /><primitive object={S.wall} /><primitive object={S.shield} />
      <primitive object={S.beams} /><primitive object={S.rocks} /><primitive object={S.rocksTop} /><primitive object={S.pillars} /><primitive object={S.slabs} />
      <primitive object={S.pods} /><primitive object={S.rings} /><primitive object={S.discs} /><primitive object={S.tiles} />
      <primitive object={S.ball} /><primitive object={S.ballTop} /><primitive object={S.realDisc} /><primitive object={S.fakeDisc} /><primitive object={S.foot} />
    </>
  );
}
