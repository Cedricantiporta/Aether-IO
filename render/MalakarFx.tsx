// Malakar's violet effects (engine/systems/malakarFx.ts `mfx`): laser beams (lilac-white core in a dark violet shell), teleport rune circles,
// the gravity spell's indicator, falling meteors. Pooled instanced meshes written from `mfx` each frame; everything is skipped when idle.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, Color, DoubleSide, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, type BufferGeometry } from 'three';
import { world } from '../engine/world';
import { mfx, GRAV_CORE, GRAV_IND, METEOR_FALL, METEOR_FOLLOW, LASER_FIRE } from '../engine/systems/malakarFx';
import { inView } from './view';
import { CELL, pushHalo } from './fx';
import { clamp, commitInst, setInst } from './util';

const mk = (g: BufferGeometry, color: Color | string, opacity: number, cap: number): InstancedMesh => {
  const m = new InstancedMesh(g, new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false, side: DoubleSide }), cap);
  m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage); return m;
};
const ring = (a: number, b: number, seg: number): BufferGeometry => new RingGeometry(a, b, seg).rotateX(-Math.PI / 2);
const BEAM_Y = 1.5;

export function MalakarFx() {
  const S = useMemo(() => ({
    bOut: mk(new BoxGeometry(1, 1, 1), new Color(0.3, 0.08, 0.55), 0.85, 12),     // dark violet shell
    bMid: mk(new BoxGeometry(1, 1, 1), new Color(1.5, 0.7, 2.4), 0.9, 12),         // lilac glow
    bCore: mk(new BoxGeometry(1, 1, 1), new Color(3, 2.7, 3.2), 1, 12),            // white-lilac core
    bFloor: mk(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0), new Color(0.6, 0.2, 1.2), 0.55, 12),
    rOut: mk(ring(0.93, 1, 64), new Color(1.6, 0.7, 2.6), 0.9, 28),
    rIn: mk(ring(0.58, 0.63, 48), new Color(1.3, 0.5, 2.4), 0.85, 28),
    rTriA: mk(ring(0.72, 0.78, 3), new Color(1.9, 1.0, 2.8), 0.9, 28),
    rTriB: mk(ring(0.72, 0.78, 3), new Color(1.9, 1.0, 2.8), 0.9, 28),
    rFill: mk(new RingGeometry(0, 0.93, 40).rotateX(-Math.PI / 2), new Color(0.25, 0.06, 0.5), 0.35, 28),
    mShell: mk(new IcosahedronGeometry(1, 1), new Color(0.22, 0.05, 0.45), 1, 6),
    mCore: mk(new IcosahedronGeometry(0.6, 1), new Color(3, 2.6, 3.2), 1, 6),
  }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let nb = 0, nr = 0, nm = 0;
    for (const l of mfx.lasers) {
      if (!l.on || l.t < l.tel) continue;
      const k = clamp((l.t - l.tel) / LASER_FIRE, 0, 1), f = 1 - k * k, cx = l.x + l.dx * l.len * 0.5, cz = l.z + l.dz * l.len * 0.5, yaw = Math.atan2(l.dx, l.dz);
      if (!inView(cx, cz, l.len * 0.6 + 4)) continue;
      const wv = l.w * (0.55 + 0.45 * f);
      setInst(S.bOut, nb, cx, BEAM_Y, cz, yaw, wv * 0.95, 1.5 * f + 0.1, l.len);
      setInst(S.bMid, nb, cx, BEAM_Y, cz, yaw, wv * 0.55, 0.8 * f + 0.05, l.len);
      setInst(S.bCore, nb, cx, BEAM_Y, cz, yaw, wv * 0.28, 0.4 * f + 0.03, l.len);
      setInst(S.bFloor, nb, cx, 0.09, cz, yaw, wv * 1.15, 1, l.len);
      nb++;
      pushHalo(l.x + l.dx * 1.5, BEAM_Y, l.z + l.dz * 1.5, 7 * f + 1, 1.4, 0.6, 2.4, 0.8 * f, CELL.GLOW);   // muzzle flash
    }
    const rune = (x: number, z: number, r: number, s: number, spin: number) => {
      if (nr >= 28) return;
      setInst(S.rOut, nr, x, 0.1, z, 0, r * s, 1, r * s);
      setInst(S.rIn, nr, x, 0.105, z, -spin * 0.5, r * s, 1, r * s);
      setInst(S.rTriA, nr, x, 0.11, z, spin, r * s, 1, r * s);
      setInst(S.rTriB, nr, x, 0.112, z, spin + Math.PI / 3, r * s, 1, r * s);
      setInst(S.rFill, nr, x, 0.09, z, 0, r * s, 1, r * s);
      nr++;
    };
    for (const q of mfx.runes) {
      if (!q.on || !inView(q.x, q.z, q.r + 2)) continue;
      const k = q.t / q.life, s = Math.min(1, k * 5) * (k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1);   // pops open, holds, shrinks away
      rune(q.x, q.z, q.r, s, t * 2.2 + q.x);
      pushHalo(q.x, 0.5, q.z, q.r * 1.8 * s, 0.9, 0.35, 2.0, 0.45 * s, CELL.GLOW);
    }
    const g = mfx.grav;
    if (g.ph === 1) {   // the gravity indicator: a big pulsing rune at the centre, a converging ring and a beacon
      const k = g.t / GRAV_IND, pulse = 1 + 0.07 * Math.sin(t * 16);
      rune(g.x, g.z, GRAV_CORE * pulse, 1, t * 1.5);
      rune(g.x, g.z, GRAV_CORE * (2.6 - 1.6 * k), 1, -t);
      for (let h = 0; h < 4; h++) pushHalo(g.x, 1.2 + h * 1.6, g.z, 3.2 + 2.5 * (1 - k), 0.7, 0.25, 1.6 + k, 0.5, CELL.GLOW);
    }
    for (const m of mfx.meteors) {
      if (!m.on || m.t < METEOR_FOLLOW || nm >= 6) continue;
      const k = clamp((m.t - METEOR_FOLLOW) / METEOR_FALL, 0, 1), y = 1.6 + 36 * (1 - k * k), sc = 1.7;
      setInst(S.mShell, nm, m.x, y, m.z, t * 3, sc, sc, sc);
      setInst(S.mCore, nm, m.x, y, m.z, -t * 4, sc, sc, sc);
      nm++;
      pushHalo(m.x, y, m.z, 7, 0.9, 0.3, 2.0, 0.6, CELL.GLOW);
      pushHalo(m.x, y, m.z, 3, 1.8, 1.4, 2.4, 0.8, CELL.GLOW);
      for (let h = 1; h <= 4; h++) pushHalo(m.x, y + h * 2.2, m.z, 5 - h * 0.8, 0.5, 0.15, 1.2, 0.35, CELL.GLOW);   // a violet tail streaming up
    }
    commitInst(S.bOut, nb); commitInst(S.bMid, nb); commitInst(S.bCore, nb); commitInst(S.bFloor, nb);
    commitInst(S.rOut, nr); commitInst(S.rIn, nr); commitInst(S.rTriA, nr); commitInst(S.rTriB, nr); commitInst(S.rFill, nr);
    commitInst(S.mShell, nm); commitInst(S.mCore, nm);
    void world;
  });

  return (
    <>
      <primitive object={S.bFloor} /><primitive object={S.bOut} /><primitive object={S.bMid} /><primitive object={S.bCore} />
      <primitive object={S.rFill} /><primitive object={S.rOut} /><primitive object={S.rIn} /><primitive object={S.rTriA} /><primitive object={S.rTriB} />
      <primitive object={S.mShell} /><primitive object={S.mCore} />
    </>
  );
}
