// Biome hazard visuals (engine/systems/biomeHazards.ts): Greenwood brambles / spore mushrooms / poison clouds, Frostpeak ice sheets /
// icicle telegraphs + falling icicles, Void black holes. Pooled InstancedMeshes, written from `hz` each frame (tiny counts), culled with inView.
import React, { Suspense, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, RingGeometry, type BufferGeometry, type Material } from 'three';
import { world } from '../engine/world';
import {
  hz, HZ, HZ_CLOUD_R, HZ_RIFT_PULL_R, HZ_RIFT_CORE_R, ICICLE_WARN_T, ICICLE_STAY_T, CLOUD_LIFE, HZ_SHROOM_CD, PLANT_WARN,
} from '../engine/systems/biomeHazards';
import { inView } from './view';
import { CELL, pushHalo } from './fx';
import { QtBatch } from './qtNature';
import { QT_PREFIX, qtPick } from '../engine/qtData';
import type { Place } from './natureKit';
import { GB, TAU, clamp, commitInst, glowMat, litMat, setInst } from './util';

const mk = (g: BufferGeometry, m: Material, cap: number): InstancedMesh => {
  const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im;
};
const flat = (color: Color | string | number, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const PUFFS = 6;
const ICICLE_H = 3.4;
const MOTES = 16, CORE_Y = 1.3;

/** Greenwood bramble patches (hz.br) drawn as dense piles of 4-6 overlapping pack bushes (BushBerries / Bush_1-2), 1.4-2.2 m each; rebuilt only when the patch set changes. */
function BrambleBushes() {
  const [sig, setSig] = useState('');
  const last = useRef('');
  useFrame(() => {
    let k = '';
    if (world.room.active && hz.kind === HZ.GREEN) for (let i = 0; i < hz.nBr; i++) { const b = hz.br[i]; k += Math.round(b.x * 10) + ',' + Math.round(b.z * 10) + ',' + Math.round(b.r * 10) + ';'; }
    if (k !== last.current) { last.current = k; setSig(k); }
  });
  const sets = useMemo(() => {
    const S = new Map<string, Place[]>();
    if (!sig) return S;
    const add = (node: string, p: Place) => { const key = QT_PREFIX + node; let l = S.get(key); if (!l) S.set(key, (l = [])); l.push(p); };
    for (let i = 0; i < hz.nBr; i++) {
      const b = hz.br[i];
      let h = 0; const rnd = () => { h = (h * 1664525 + 1013904223 + i * 7919) >>> 0; return h / 4294967296; };
      const n = 5 + Math.floor(rnd() * 2), pool = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];   // (owner 2026-10-24: textured pack-1 bushes, not pack-2 lumps)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rnd() * 0.8, d = k === 0 ? 0 : b.r * (0.35 + rnd() * 0.45), sc = (0.85 + rnd() * 0.5) * Math.max(0.9, b.r * 0.8);
        add(qtPick(pool, rnd()), { x: b.x + Math.cos(a) * d, y: 0, z: b.z + Math.sin(a) * d, ry: rnd() * TAU, sx: sc, sy: sc * (0.9 + rnd() * 0.25), sz: sc });
      }
    }
    return S;
  }, [sig]);
  if (sets.size === 0) return null;
  return <Suspense fallback={null}><QtBatch key={sig} sets={sets} shadows={false} /></Suspense>;
}

export function BiomeHazards() {
  const S = useMemo(() => {
    // ---- Greenwood
    const bg = new GB([0.7, 1.1]);   // a patch of thorny bramble (unit radius): dark green lumps, red-brown canes and thorns
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.4, d = i === 0 ? 0 : 0.55 + (i % 3) * 0.12, s = 0.34 + ((i * 37) % 10) / 40;
      bg.ico(s, [Math.cos(a) * d, s * 0.7, Math.sin(a) * d], i % 2 ? '#3f6a2a' : '#2f5a26', [1, 0.75, 1], 0);
      for (let k = 0; k < 4; k++) { const b = a + k * 1.6 + i; bg.cone(0.05, 0.42, 4, [Math.cos(a) * d + Math.cos(b) * s * 0.7, s * 0.9 + (k % 2) * 0.12, Math.sin(a) * d + Math.sin(b) * s * 0.7], '#7a3a2a', [Math.sin(b) * 0.9, 0, -Math.cos(b) * 0.9]); }
    }
    const sg = new GB([0.8, 1.1]);
    sg.cyl(0.14, 0.2, 0.7, 6, [0, 0.35, 0], '#e6dcc0');
    const cg = new GB([0.85, 1.2]);
    cg.sph(0.62, [0, 0.82, 0], '#7fe8c8', [1, 0.62, 1], 8);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; cg.sph(0.09, [Math.cos(a) * 0.32, 0.98, Math.sin(a) * 0.32], '#ffffff', 1, 5); }
    const puffG = new GB([1, 1]).ico(1, [0, 0, 0], '#ffffff', 1, 1).build();
    // ---- Frostpeak
    const ig = new GB([0.95, 1.05]);
    ig.cyl(1, 1, 0.06, 28, [0, 0, 0], '#9fd4ee'); ig.cyl(0.82, 0.82, 0.05, 28, [0, 0.015, 0], '#c8ecfb'); ig.cyl(0.5, 0.5, 0.04, 20, [0.08, 0.03, -0.05], '#e6f8ff');
    for (let i = 0; i < 5; i++) { const a = i * 1.26; ig.box(0.5 + (i % 2) * 0.3, 0.02, 0.025, [Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4], '#ffffff', [0, a, 0]); }
    const icg = new GB([1, 1]).cone(0.55, ICICLE_H, 6, [0, 0, 0], '#d8f6ff', [Math.PI, 0, 0]).cone(0.3, 2.2, 5, [0.5, -0.5, 0.1], '#a8e2ff', [Math.PI, 0, 0.12]).build();
    // ---- Void
    // black hole (unit = core radius 1): spinning accretion disk (outer violet band + inner orange band, segmented so the spin reads),
    // a vertical lensing rim facing the camera, and swirl motes that spiral inward.
    const band = (r0: number, n: number, w: number, c0: string, c1: string) => {
      const g = new GB([1, 1]);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = r0 + (i % 3) * 0.07; g.box(TAU * r0 / n * (1.1 + (i % 2) * 0.5), 0.05, w * (0.7 + (i % 3) * 0.2), [Math.cos(a) * r, 0, Math.sin(a) * r], i % 2 ? c0 : c1, [0, -a - Math.PI / 2, 0]); }
      return g.build();
    };
    const lens = new GB([1, 1]).torus(1.0, 0.045, [0, 0, 0], '#fff2d8', [0, 0, 0], 1, 32).torus(1.12, 0.025, [0, 0, 0], '#ffb060', [0, 0, 0], 1, 32).build();
    const u = (g: BufferGeometry, m: Material, cap: number) => mk(g, m, cap);
    const disc = new CylinderGeometry(1, 1, 0.04, 32);
    return {
      br: u(bg.build(), litMat({ roughness: 0.9 }), 12),
      stem: u(sg.build(), litMat({ roughness: 0.8 }), 8),
      cap: u(cg.build(), glowMat({ color: new Color(1.1, 1.9, 1.5) }), 8),
      puff: u(puffG, flat('#7ad84a', 0.3), 8 * PUFFS),
      cring: u(disc, flat('#6fd04a', 0.16), 16),
      ice: u(ig.build(), litMat({ roughness: 0.12, metalness: 0.25 }), 6),
      tFill: u(disc, flat(new Color(1.0, 1.7, 2.2), 0.3), 10),
      tRing: u(new RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), flat(new Color(2.4, 0.9, 0.8), 0.9), 10),
      icicle: u(icg, glowMat({ color: new Color(1.1, 1.8, 2.3) }), 10),
      rDark: u(new CylinderGeometry(1, 1, 0.05, 32), new MeshBasicMaterial({ color: '#07020f', toneMapped: false }), 9),
      rCore: u(new IcosahedronGeometry(1, 2), new MeshBasicMaterial({ color: '#000000', toneMapped: false }), 9),
      rDiskO: u(band(2.5, 30, 0.7, '#7a3cff', '#c58bff'), glowMat({ color: new Color(1.2, 0.6, 2.0) }), 9),
      rDiskI: u(band(1.75, 24, 0.45, '#ff8a2a', '#ffd070'), glowMat({ color: new Color(2.2, 1.2, 0.6) }), 9),
      rLens: u(lens, glowMat({ color: new Color(2.0, 1.6, 1.3), side: DoubleSide }), 9),
      rMote: u(new IcosahedronGeometry(0.1, 0), glowMat({ color: new Color(1.6, 0.9, 2.2) }), 9 * MOTES),
      rTel: u(new RingGeometry(0.965, 1, 64).rotateX(-Math.PI / 2), flat(new Color(1.8, 0.7, 2.4), 0.85), 9),
      rTel2: u(new RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2), flat(new Color(2.4, 1.1, 0.4), 0.55), 9),
      rField: u(disc, flat(new Color(0.28, 0.07, 0.5), 0.5), 9),   // (owner 2026-10-24: the black-hole field must read clearly: a deep violet disc over its whole pull radius)
    };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const on = world.room.active && hz.kind !== HZ.NONE, bh = world.room.active && hz.nRift > 0;
    let nBr = 0, nMu = 0, nPuff = 0, nRing = 0, nIce = 0, nTel = 0, nIc = 0, nRift = 0, nMote = 0;
    if (on && hz.kind === HZ.GREEN) {
      // (the bramble patches are drawn as piled pack bushes now: BrambleBushes below; the collider / sting zone is unchanged)
      for (let i = 0; i < hz.nMu; i++) {
        const m = hz.mu[i]; if (!inView(m.x, m.z, 4)) continue;
        if (m.auto > 0) {   // boss-arena poison plant: grows while it charges, swells + shows the cloud ring in the last PLANT_WARN s, then puffs
          const warn = clamp(1 - m.cd / PLANT_WARN, 0, 1), sc = (0.85 + 0.2 * (1 - m.cd / m.auto) + 0.4 * warn) * 1.3 * (1 + warn * Math.sin(t * 22) * 0.06);
          setInst(S.stem, nMu, m.x, 0, m.z, m.rot, sc, sc, sc);
          setInst(S.cap, nMu++, m.x, 0, m.z, m.rot, sc, sc, sc);
          if (warn > 0 && nRing < 16) setInst(S.cring, nRing++, m.x, 0.06, m.z, 0, HZ_CLOUD_R * (0.4 + 0.6 * warn), 1, HZ_CLOUD_R * (0.4 + 0.6 * warn));
          pushHalo(m.x, 1.1, m.z, 3.2 + warn * 3, warn > 0 ? 1.9 : 0.3, warn > 0 ? 1.2 : 1.5, 0.4, 0.3 + warn * 0.45, CELL.GLOW);
          continue;
        }
        const ready = m.cd <= 0, pulse = ready ? 1 + Math.sin(t * 3 + i) * 0.07 : 0.7;   // recharging: shrunken
        setInst(S.stem, nMu, m.x, 0, m.z, m.rot, 1.3, 1.3, 1.3);
        setInst(S.cap, nMu++, m.x, 0, m.z, m.rot, 1.3 * pulse, 1.3 * pulse * (ready ? 1 : 0.8), 1.3 * pulse);
        if (ready) pushHalo(m.x, 1.1, m.z, 3.2 + Math.sin(t * 3 + i) * 0.4, 0.3, 1.5, 0.9, 0.55, CELL.GLOW);
        else if (m.cd > HZ_SHROOM_CD - 0.5) pushHalo(m.x, 1.0, m.z, 4, 0.3, 1.5, 0.9, 0.4, CELL.GLOW);
      }
      for (let i = 0; i < hz.clouds.length && nRing < 16; i++) {
        const c = hz.clouds[i]; if (!c.on || !inView(c.x, c.z, 6)) continue;
        const grow = clamp((CLOUD_LIFE - c.t) / 0.4, 0, 1), fade = clamp(c.t / 0.6, 0, 1), k = grow * (0.6 + 0.4 * fade);
        setInst(S.cring, nRing++, c.x, 0.06, c.z, 0, HZ_CLOUD_R * k, 1, HZ_CLOUD_R * k);
        for (let q = 0; q < PUFFS; q++) {
          const a = c.seed + q * 1.05 + t * (0.35 + (q % 2) * 0.2), d = HZ_CLOUD_R * k * (0.3 + 0.45 * ((q * 0.37 + c.seed) % 1)), s = (1.0 + 0.25 * Math.sin(t * 2 + q + c.seed)) * k;
          setInst(S.puff, nPuff++, c.x + Math.cos(a) * d, 0.7 + 0.25 * Math.sin(t * 1.7 + q * 2), c.z + Math.sin(a) * d, 0, s * 1.15, s * 0.8, s * 1.15);
        }
        pushHalo(c.x, 0.9, c.z, HZ_CLOUD_R * 2.2 * k, 0.4, 1.3, 0.3, 0.3 * fade, CELL.GLOW);
      }
    } else if (on && hz.kind === HZ.FROST) {
      for (let i = 0; i < hz.nIce; i++) { const s = hz.ice[i]; if (inView(s.x, s.z, s.r + 4)) setInst(S.ice, nIce++, s.x, 0.05, s.z, i * 1.7, s.r, 1, s.r); }
      for (let i = 0; i < hz.ic.length; i++) {
        const ic = hz.ic[i]; if (!ic.on || ic.t < 0 || !inView(ic.x, ic.z, 6)) continue;
        const k = clamp(ic.t / ICICLE_WARN_T, 0, 1);
        if (k < 1) {
          setInst(S.tFill, nTel, ic.x, 0.07, ic.z, 0, 1.9 * k, 1, 1.9 * k);
          setInst(S.tRing, nTel++, ic.x, 0.09, ic.z, 0, 1.9, 1, 1.9);
          const y = 1.8 + 18 * (1 - k * k);   // falls from above while the shadow grows
          setInst(S.icicle, nIc++, ic.x, y, ic.z, ic.seed * 6, 1, 1, 1);
          pushHalo(ic.x, 0.1, ic.z, 2.4 + k * 1.6, 1.4, 0.6, 0.5, 0.25 + k * 0.35, CELL.GLOW);
        } else {
          const p = clamp((ic.t - ICICLE_WARN_T) / ICICLE_STAY_T, 0, 1), s = 1 - p * p;   // embedded in the floor, then it shatters away
          if (s > 0.02) setInst(S.icicle, nIc++, ic.x, 0.1 + 1.7 * s * 0.75 - (1 - s) * 0.3, ic.z, ic.seed * 6, s, s * 0.75, s);
          if (p < 0.3) pushHalo(ic.x, 0.6, ic.z, 5 * (1 - p), 1.0, 1.9, 2.4, 0.7 * (1 - p / 0.3), CELL.GLOW);
        }
      }
    }
    if (bh) {
      for (let i = 0; i < hz.nRift; i++) {
        const r = hz.rift[i]; const sc = r.s; if (!inView(r.x, r.z, HZ_RIFT_PULL_R * sc + 2)) continue;
        const kk = r.k, pulse = (1 + Math.sin(t * 2.2 + i * 2) * 0.04) * (0.15 + 0.85 * kk) * sc, rp = HZ_RIFT_PULL_R * sc * (r.life - r.age < 0.6 ? Math.max(0.2, kk) : 1), yaw = world.camera.yaw;
        setInst(S.rDark, nRift, r.x, 0.05, r.z, 0, HZ_RIFT_CORE_R * 1.25 * pulse, 1, HZ_RIFT_CORE_R * 1.25 * pulse);
        setInst(S.rField, nRift, r.x, 0.045, r.z, 0, rp, 1, rp);
        // the pull radius is ringed on the floor (a violet line + an inward-marching orange one)
        setInst(S.rTel, nRift, r.x, 0.08, r.z, 0, rp, 1, rp);
        const m = 1 - ((t * 0.5 + i * 0.3) % 1);
        setInst(S.rTel2, nRift, r.x, 0.085, r.z, 0, rp * (0.35 + 0.65 * m), 1, rp * (0.35 + 0.65 * m));
        setInst(S.rCore, nRift, r.x, CORE_Y * sc, r.z, t * 0.3, 1.25 * pulse);
        setInst(S.rDiskO, nRift, r.x, (CORE_Y - 0.05) * sc, r.z, t * 1.3 + i, sc, sc, sc);
        setInst(S.rDiskI, nRift, r.x, CORE_Y * sc, r.z, -t * 3.1 + i, sc, sc, sc);
        setInst(S.rLens, nRift, r.x, CORE_Y * sc, r.z, yaw, 1.38 * pulse);
        for (let q = 0; q < MOTES; q++) {   // swirl motes: spiral in from the rim, faster and smaller as they fall
          const u = (t * 0.32 + q / MOTES + i * 0.19) % 1, rad = 1.1 + (rp - 1.1) * Math.pow(1 - u, 1.4), ang = q * 2.4 + i + t * 0.8 + u * u * 9;
          setInst(S.rMote, nMote++, r.x + Math.cos(ang) * rad, (0.25 + (1 - u) * 0.9 + u * (CORE_Y - 0.4)) * sc, r.z + Math.sin(ang) * rad, 0, (0.5 + (1 - u) * 1.1) * sc);
        }
        pushHalo(r.x, CORE_Y * sc, r.z, (5.5 + Math.sin(t * 2 + i) * 0.5) * sc, 0.5, 0.12, 0.8, 0.3, CELL.GLOW);
        pushHalo(r.x, CORE_Y * sc, r.z, 3.2 * sc, 1.5, 0.7, 0.2, 0.22, CELL.GLOW);
        nRift++;
      }
    }
    commitInst(S.br, nBr); commitInst(S.stem, nMu); commitInst(S.cap, nMu); commitInst(S.puff, nPuff); commitInst(S.cring, nRing);
    commitInst(S.ice, nIce); commitInst(S.tFill, nTel); commitInst(S.tRing, nTel); commitInst(S.icicle, nIc);
    commitInst(S.rDark, nRift); commitInst(S.rField, nRift); commitInst(S.rTel, nRift); commitInst(S.rTel2, nRift);
    commitInst(S.rCore, nRift); commitInst(S.rDiskO, nRift); commitInst(S.rDiskI, nRift); commitInst(S.rLens, nRift); commitInst(S.rMote, nMote);
  });

  return (
    <>
      <primitive object={S.ice} /><primitive object={S.rField} /><primitive object={S.rDark} /><primitive object={S.rTel} /><primitive object={S.rTel2} />
      <primitive object={S.rCore} /><primitive object={S.rDiskO} /><primitive object={S.rDiskI} /><primitive object={S.rLens} /><primitive object={S.rMote} />
      <primitive object={S.br} /><primitive object={S.stem} /><primitive object={S.cap} />
      <primitive object={S.cring} /><primitive object={S.puff} />
      <primitive object={S.tFill} /><primitive object={S.tRing} /><primitive object={S.icicle} />
      <BrambleBushes />
    </>
  );
}
