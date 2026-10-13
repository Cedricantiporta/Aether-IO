// Renders the pooled ground effects of the active kit (falling arrows / meteors, stone spikes, ice crystals,
// frost traps, fire pillars, expanding rings) plus orbiting storm orbs and fear icons.
import { inView } from './view';
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, Object3D,
} from 'three';
import { world } from '../engine/world';
import { abilityState } from '../engine/systems/abilities';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, gate, pushHalo } from './fx';
import { GB, TAU, clamp, glowMat, litMat } from './util';
import { makeBeamMaterial } from './beam';

const o = new Object3D();
const rnd = Math.random;
const ease = (k: number) => 1 - (1 - k) * (1 - k);

export function GroundFx() {
  const sys = useMemo(() => {
    const mk = (g: any, m: any, cap: number) => {
      const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im;
    };
    // glowing arrow (points +Z)
    const ag = new GB([1, 1]);
    ag.cyl(0.05, 0.05, 1.8, 5, [0, 0, 0], '#fff0b8', [Math.PI / 2, 0, 0]);
    ag.cone(0.16, 0.6, 5, [0, 0, 1.15], '#ffffff', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; ag.box(0.02, 0.3, 0.45, [Math.sin(a) * 0.1, Math.cos(a) * 0.1, -0.85], '#ffc850', [0, 0, -a]); }
    const arrowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.4, 2.0, 1.2) });
    // meteor: glowing rock
    const metMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.4, 1.1, 0.35) });
    const mg = new GB([0.7, 1.2]).ico(1, [0, 0, 0], '#ff9a30', 1, 1).ico(0.72, [0.1, 0.1, 0.1], '#ffe080', 1, 0).build();
    // stone spike
    const sg = new GB([0.55, 1.1]).cone(0.5, 1.0, 6, [0, 0.5, 0], '#8e8576').cone(0.3, 0.7, 5, [0.35, 0.35, 0.1], '#a09684', [0, 0, -0.25]).cone(0.26, 0.6, 5, [-0.3, 0.3, -0.12], '#7a7266', [0, 0, 0.3]).build();
    const spikeMat = litMat({ roughness: 0.9 });
    // ice crystal
    const cg = new GB([0.9, 1.2]).octa(0.5, [0, 0.9, 0], '#bff4ff', [0.7, 1.9, 0.7]).octa(0.32, [0.45, 0.5, 0.1], '#7fd8ff', [0.7, 1.5, 0.7], [0, 0, -0.4]).octa(0.28, [-0.4, 0.45, -0.1], '#e8fcff', [0.7, 1.4, 0.7], [0, 0, 0.4]).build();
    const iceMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.0, 1.9, 2.4) });
    // trap
    const tg = new GB([1, 1]).box(0.7, 0.5, 0.7, [0, 0, 0], '#9fe8ff').octa(0.5, [0, 0.4, 0], '#ffffff', 1).build();
    const trapMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.2, 2.0, 2.6) });
    // rock
    const rg = new GB([0.7, 1.15]).dodeca(0.9, [0, 0, 0], '#8a7a6a', [1, 0.85, 1]).dodeca(0.5, [0.5, 0.3, 0.2], '#6e6256').build();
    const rockMat = litMat({ roughness: 0.95 });

    const arrows = mk(ag.build(), arrowMat, 200);
    const meteors = mk(mg, metMat, 40);
    const spikes = mk(sg, spikeMat, 260);
    const crystals = mk(cg, iceMat, 80);
    const traps = mk(tg, trapMat, 8);
    const rocks = mk(rg, rockMat, 60);
    spikes.castShadow = false;
    const big = new Mesh(new IcosahedronGeometry(1, 2), new MeshBasicMaterial({ color: new Color(2.6, 1.0, 0.25), toneMapped: false }));
    big.visible = false; big.frustumCulled = false;
    const pg = new CylinderGeometry(1, 1.25, 30, 24, 1, true).translate(0, 15, 0);
    const pillars = [0, 1].map(() => { const m = new Mesh(pg, makeBeamMaterial(0xff7a1a, { speed: 7, stripes: 8, power: 0.7 })); m.visible = false; m.frustumCulled = false; return m; });
    return { arrows, meteors, spikes, crystals, traps, rocks, big, pillars, root: new Object3D() };
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const status = useGameStore.getState().status;
    const t = clock.elapsedTime;
    const paused = status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dtRaw, 0.05);
    const n = { a: 0, m: 0, s: 0, c: 0, t: 0, r: 0, p: 0 };
    let bigOn = false;
    const fx = world.fx;
    const place = (im: InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx: number, sy = sx, sz = sx) => {
      o.position.set(x, y, z); o.rotation.set(pitch, yaw, roll, 'YXZ'); o.scale.set(sx, sy, sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    };
    for (const p of sys.pillars) p.visible = false;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (!f.active) continue;
      if (f.kind !== 'BIG_METEOR' && f.kind !== 'TRAP' && !inView(f.x, f.z, 20 + f.radius)) continue;
      const sd = f.seed;
      switch (f.kind) {
        case 'RAIN_ARROW': {
          if (n.a >= 200) break;
          const k = clamp(f.t / f.delay, 0, 1);
          const post = f.t - f.delay;
          const y = post < 0 ? 0.4 + 30 * (1 - k) * (1 - k * 0.2) : 0.35;
          const s = post < 0 ? 1 : clamp(1 - post / 0.25, 0, 1);
          if (s <= 0.01) break;
          place(sys.arrows, n.a++, f.x + (post < 0 ? (1 - k) * 3 : 0), y, f.z, sd * 6, post < 0 ? 1.45 : 1.25, 0, s * 1.1, s * 1.1, s * (post < 0 ? 2.6 : 1.2));
          break;
        }
        case 'ARROW_STICK': {
          if (n.a >= 200) break;
          const post = f.t - f.delay;
          if (post > 0) break;
          const grow = clamp(f.t / 0.12, 0, 1);
          place(sys.arrows, n.a++, f.x, 0.55, f.z, sd * 6, 0.9 + sd * 0.4, 0, 0.7 * grow);
          if (f.dmg > 0) {
            const pulse = clamp(f.t / f.delay, 0, 1);
            pushHalo(f.x, 0.8, f.z, 2 + pulse * 5, 2.2, 1.6, 0.4, 0.3 + pulse * 0.5, CELL.GLOW);
          }
          break;
        }
        case 'METEOR': {
          if (n.m >= 40) break;
          const k = clamp(f.t / f.delay, 0, 1);
          if (f.t >= f.delay) break;
          const x = f.x + 16 * (1 - k), y = 0.8 + 34 * (1 - k), z = f.z - 16 * (1 - k);
          place(sys.meteors, n.m++, x, y, z, f.t * 4, f.t * 3, 0, 1.5);
          pushHalo(x, y, z, 5, 2.2, 0.8, 0.15, 0.6, CELL.GLOW);
          if (dt > 0 && gate()) FX.add.emit(x, y, z, 0, 2, 0, 0.45, 1.6, 0.2, 2.4, 0.9, 0.2, 0.7, CELL.FLAME, -1, 1);
          if (dt > 0 && rnd() < 0.5 && gate()) FX.norm.emit(x, y, z, (rnd() - 0.5), 1, (rnd() - 0.5), 0.8, 1.0, 2.0, 0.2, 0.17, 0.15, 0.4, CELL.SMOKE, 0, 1, rnd() * 6, 0.5);
          break;
        }
        case 'BIG_METEOR': {
          if (f.t >= f.delay) break;
          const k = clamp(f.t / f.delay, 0, 1);
          const e = k * k;
          const x = f.x + 55 * (1 - e), y = 1 + 90 * (1 - e), z = f.z - 55 * (1 - e);
          const sc = 4 + 6 * k;
          sys.big.visible = true; bigOn = true;
          sys.big.position.set(x, y, z); sys.big.scale.setScalar(sc); sys.big.rotation.set(t * 0.8, t * 0.5, 0);
          pushHalo(x, y, z, sc * 3.6, 2.4, 0.9, 0.2, 0.55, CELL.GLOW);
          pushHalo(x, y, z, sc * 1.8, 2.6, 1.8, 0.8, 0.8, CELL.GLOW);
          if (dt > 0) {
            for (let q = 0; q < 6; q++) if (gate()) {
              const a = rnd() * TAU;
              FX.add.emit(x + Math.cos(a) * sc * 0.6, y + rnd() * sc * 0.4, z + Math.sin(a) * sc * 0.6, (x - f.x) * 0.9, (y) * 0.9, (z - f.z) * 0.9, 0.6, sc * 0.55, sc * 0.1, 2.5, 0.9, 0.2, 0.7, CELL.FLAME, 0, 1);
            }
            if (gate()) FX.norm.emit(x, y, z, 0, 0, 0, 1.2, sc * 0.8, sc * 1.8, 0.15, 0.12, 0.1, 0.45, CELL.SMOKE, 0, 0.5, rnd() * 6, 0.4);
          }
          break;
        }
        case 'SPIKE': {
          if (n.s >= 260) break;
          const post = f.t - f.delay;
          if (post < 0) {
            if (post > -0.16 && dt > 0 && gate()) FX.norm.emit(f.x + (rnd() - 0.5) * f.radius, 0.1, f.z + (rnd() - 0.5) * f.radius, 0, 1.2, 0, 0.4, 0.5, 1.0, 0.55, 0.48, 0.38, 0.5, CELL.SMOKE);
            break;
          }
          const life = f.life - f.delay;
          const up = ease(clamp(post / 0.13, 0, 1)), sink = clamp((life - post) / 0.4, 0, 1);
          const h = f.radius * 2.0 * up * sink;
          if (h < 0.05) break;
          place(sys.spikes, n.s++, f.x, -0.1, f.z, sd * 6, (sd - 0.5) * 0.35, (sd * 7 % 1 - 0.5) * 0.35, f.radius * 0.5, h, f.radius * 0.5);
          if (post < 0.05 && dt > 0 && gate()) FX.norm.emit(f.x, 0.3, f.z, (rnd() - 0.5) * 3, 3, (rnd() - 0.5) * 3, 0.5, 0.45, 0.2, 0.5, 0.45, 0.36, 0.9, CELL.SHARD, 14, 0.4, rnd() * 6, 8);
          break;
        }
        case 'ROCK': {
          if (n.r >= 60) break;
          const k = clamp(f.t / f.delay, 0, 1);
          const post = f.t - f.delay;
          if (post > 0.6) break;
          const y = post < 0 ? 0.8 + 30 * (1 - k) * (1 - k) : 0.4;
          const s = (post < 0 ? 1 : clamp(1 - post / 0.6, 0, 1)) * f.radius * 0.6;
          place(sys.rocks, n.r++, f.x, y, f.z, f.t * 3, f.t * 2.2, f.t * 1.7, s);
          break;
        }
        case 'CRYSTAL': {
          if (n.c >= 80) break;
          const grow = ease(clamp(f.t / 0.22, 0, 1)), sink = clamp((f.life - f.t) / 0.6, 0, 1);
          const s = grow * sink;
          if (s < 0.02) break;
          place(sys.crystals, n.c++, f.x, -0.05, f.z, sd * 6, (sd - 0.5) * 0.4, (sd * 5 % 1 - 0.5) * 0.4, 1.6 * s, 1.7 * s, 1.6 * s);
          if (dt > 0 && rnd() < dt * 2 && gate()) FX.add.emit(f.x + (rnd() - 0.5), 0.8 + rnd() * 2, f.z + (rnd() - 0.5), 0, 0.5, 0, 0.7, 0.3, 0.05, 1.2, 2.0, 2.5, 0.9, CELL.STAR, 0, 0.3, rnd() * 3, 2);
          break;
        }
        case 'TRAP': {
          if (n.t >= 8 || f.t >= f.delay) break;
          const k = clamp(f.t / f.delay, 0, 1);
          const x = f.sx + (f.x - f.sx) * k, z = f.sz + (f.z - f.sz) * k, y = 1.0 + 7 * 4 * k * (1 - k);
          place(sys.traps, n.t++, x, y, z, f.t * 9, f.t * 7, 0, 1.0);
          pushHalo(x, y, z, 2.6, 0.5, 1.5, 2.2, 0.6, CELL.GLOW);
          if (dt > 0 && gate()) FX.add.emit(x, y, z, 0, 0, 0, 0.4, 0.6, 0.05, 0.6, 1.8, 2.4, 0.7, CELL.STAR, 0, 1, rnd() * 6, 3);
          break;
        }
        case 'PILLAR': {
          const post = f.t - f.delay;
          if (post < 0) break;
          const life = f.life - f.delay;
          const k = clamp(post / life, 0, 1);
          if (n.p >= 2) break;
          const mm = sys.pillars[n.p++];
          mm.visible = true;
          const w = f.radius * (0.55 + 0.15 * Math.sin(t * 14)) * (post < 0.12 ? ease(post / 0.12) : 1) * (1 - k * 0.35);
          mm.position.set(f.x, 0, f.z); mm.scale.set(w, 1, w);
          const mat = mm.material as any;
          mat.uniforms.uAlpha.value = Math.pow(1 - k, 0.6); mat.uniforms.uTime.value = t;
          pushHalo(f.x, 1.4, f.z, f.radius * 2.6, 2.4, 0.9, 0.25, 0.5 * (1 - k), CELL.GLOW);
          if (dt > 0) for (let q = 0; q < 5; q++) if (gate()) {
            const a = rnd() * TAU, d = Math.sqrt(rnd()) * f.radius * 0.7;
            FX.add.emit(f.x + Math.cos(a) * d, 0.2, f.z + Math.sin(a) * d, 0, 9 + rnd() * 7, 0, 0.7 + rnd() * 0.4, 1.4, 0.2, 2.5, 0.9, 0.18, 0.8, CELL.FLAME, -2, 0.6);
          }
          break;
        }
        case 'RING': {
          const r = f.radius;
          if (r < 0.5 || dt <= 0) break;
          FX.add.emit(f.x, 0.3, f.z, 0, 0, 0, 0.09, r * 2.1, r * 2.1, 2.4, 0.8, 0.15, 0.55 * (1 - f.t / f.life), CELL.RING);
          const cnt = Math.min(14, Math.ceil(r * 0.9));
          for (let q = 0; q < cnt; q++) if (gate()) {
            const a = rnd() * TAU;
            FX.add.emit(f.x + Math.cos(a) * r, 0.2, f.z + Math.sin(a) * r, Math.cos(a) * 2, 2.4 + rnd() * 2.4, Math.sin(a) * 2, 0.5 + rnd() * 0.3, 1.5, 0.2, 2.4, 0.8, 0.15, 0.8, CELL.FLAME, -1, 1);
          }
          break;
        }
        default: break;
      }
    }
    const fin = (im: InstancedMesh, c: number) => { im.count = c; im.instanceMatrix.needsUpdate = true; };
    fin(sys.arrows, n.a); fin(sys.meteors, n.m); fin(sys.spikes, n.s); fin(sys.crystals, n.c); fin(sys.traps, n.t); fin(sys.rocks, n.r);
    sys.big.visible = bigOn;

    // ---- storm orbs
    const A = abilityState;
    if (A.orbT > 0 && A.orbN > 0) {
      const fade = clamp(A.orbT / 0.4, 0, 1);
      for (let i = 0; i < A.orbN; i++) {
        const b = A.orbs[i];
        pushHalo(b.x, b.y, b.z, 4.2, 0.5, 0.9, 2.6, 0.55 * fade, CELL.GLOW);
        pushHalo(b.x, b.y, b.z, 1.6, 2.4, 2.4, 2.8, 0.95 * fade, CELL.GLOW);
        pushHalo(b.x, b.y, b.z, 2.4 + Math.sin(t * 12 + i) * 0.4, 0.6, 1.2, 2.6, 0.55 * fade, CELL.STAR);
        if (dt > 0 && rnd() < dt * 40 && gate()) {
          const a = rnd() * TAU;
          FX.add.emit(b.x, b.y, b.z, Math.cos(a) * 3, (rnd() - 0.5) * 3, Math.sin(a) * 3, 0.3, 0.4, 0.05, 0.9, 1.5, 2.6, 0.9, CELL.STREAK, 0, 1, 0, 0, 0.08);
        }
      }
    }

    // ---- fear icons above terrified enemies
    if (dt > 0) {
      const es = world.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.active || e.fearT <= 0 || e.state === 'DYING' || !inView(e.pos.x, e.pos.z, 2)) continue;
        if (rnd() < dt * 2.5 && gate()) FX.add.emit(e.pos.x + (rnd() - 0.5) * 0.5, 2.2 * e.scale + 0.4, e.pos.z, 0, 1.2, 0, 0.8, 0.9, 0.6, 1.9, 0.6, 2.4, 0.95, CELL.STAR, 0, 0.5, 0, 2);
      }
    }
  });

  return (
    <>
      <primitive object={sys.arrows} /><primitive object={sys.meteors} /><primitive object={sys.spikes} />
      <primitive object={sys.crystals} /><primitive object={sys.traps} /><primitive object={sys.rocks} />
      <primitive object={sys.big} />
      {sys.pillars.map((p, i) => <primitive key={i} object={p} />)}
    </>
  );
}
void glowMat;
