// Boss crystal / shard VFX layer (Glacius frost breath spires, hero freeze cage, chill crystals, generic ballistic debris).
// Everything is pooled and preallocated: one faceted crystal geometry drawn twice (translucent emissive solid + additive wire edge
// glints), one debris mesh with a CPU ballistic loop over typed arrays. No per-frame allocation; counts scale with the quality tier.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, MeshStandardMaterial,
  OctahedronGeometry, Group, BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { world } from '../engine/world';
import { breath, chill } from '../engine/systems/bossFx';
import { playerFreeze } from '../engine/systems/combat';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, DECALS, FX, flashStar, pushHalo, smokePuff } from './fx';
import { TAU, clamp, commitInst, setInst } from './util';
import { inView } from './view';

const rnd = Math.random;
const _c = new Color();

/** Elongated hexagonal prism with a pointed tip (unit height, radius 0.5). */
let _geo: BufferGeometry | null = null;
export function crystalGeo(): BufferGeometry {
  if (_geo) return _geo;
  const body = new CylinderGeometry(0.34, 0.5, 0.62, 6, 1).translate(0, 0.31, 0);
  const tip = new ConeGeometry(0.34, 0.38, 6, 1).translate(0, 0.81, 0);
  body.deleteAttribute('uv'); tip.deleteAttribute('uv');
  _geo = mergeGeometries([body, tip])!;
  return _geo;
}

/** A solid translucent crystal mesh + a wire-edge additive overlay sharing instance matrices. */
export class CrystalSet {
  solid: InstancedMesh; wire: InstancedMesh; group = new Group();
  constructor(public cap: number, order = 3) {
    const g = crystalGeo();
    this.solid = new InstancedMesh(g, new MeshStandardMaterial({
      color: 0xffffff, emissive: 0x2a9ae8, emissiveIntensity: 1.15, roughness: 0.05, metalness: 0.25, flatShading: true,
      transparent: true, opacity: 0.9, depthWrite: true,
    }), cap);
    this.wire = this.solid;   // (a wireframe edge overlay read as noisy diagonals; facets + tip glints do the job)
    for (const m of [this.solid]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = order; this.group.add(m); }
    this.solid.setColorAt(0, _c.setRGB(1, 1, 1)); this.solid.instanceColor!.setUsage(DynamicDrawUsage);
    this.solid.castShadow = false;
  }
  /** colour is a tint multiplied on the pale-white base (r,g,b linear) */
  set(i: number, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, rx: number, rz: number, r = 0.55, g = 0.85, b = 1) {
    setInst(this.solid, i, x, y, z, ry, sx, sy, sz, rx, rz);
    const a = this.solid.instanceColor!.array as Float32Array; a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b;
  }
  commit(n: number) { commitInst(this.solid, n); }
}

// ------------------------------------------------------------ spire pool ----
const MAXS = 150, MAXD = 220;
interface Spire { a: boolean; x: number; z: number; h: number; r: number; ry: number; rx: number; rz: number; t: number; delay: number; life: number; tint: number }
const spires: Spire[] = Array.from({ length: MAXS }, () => ({ a: false, x: 0, z: 0, h: 1, r: 0.5, ry: 0, rx: 0, rz: 0, t: 0, delay: 0, life: 2, tint: 0 }));
let sCursor = 0;

function capNow(): number { return Math.max(24, Math.round(MAXS * Math.min(1, FX.scale + 0.15))); }
function liveSpires(): number { let n = 0; for (let i = 0; i < MAXS; i++) if (spires[i].a) n++; return n; }

/** Raise one crystal spire at x,z (h metres tall, base radius r, lives `life` s after growing, shatters at the end). */
export function raiseSpire(x: number, z: number, h: number, r: number, life: number, delay = 0, tilt = 0.18, tint = 0): boolean {
  if (liveSpires() >= capNow()) return false;
  for (let k = 0; k < MAXS; k++) {
    const i = (sCursor + k) % MAXS, s = spires[i];
    if (s.a) continue;
    sCursor = i + 1;
    s.a = true; s.x = x; s.z = z; s.h = h; s.r = r; s.ry = rnd() * TAU; s.rx = (rnd() - 0.5) * tilt * 2; s.rz = (rnd() - 0.5) * tilt * 2;
    s.t = -delay; s.delay = delay; s.life = life; s.tint = tint;
    return true;
  }
  return false;
}

// ----------------------------------------------------------- debris pool ----
const dx = new Float32Array(MAXD), dy = new Float32Array(MAXD), dz = new Float32Array(MAXD), dvx = new Float32Array(MAXD), dvy = new Float32Array(MAXD), dvz = new Float32Array(MAXD);
const drx = new Float32Array(MAXD), dry = new Float32Array(MAXD), drv = new Float32Array(MAXD), dsz = new Float32Array(MAXD), dlen = new Float32Array(MAXD);
const dlife = new Float32Array(MAXD), dmax = new Float32Array(MAXD), dcol = new Float32Array(MAXD * 3);
let dCursor = 0;

/** Flying shards. kind 0 = sharp ice (long), 1 = chunky rock / bark (stubby). hex colours are sRGB, hex2 optional second colour. */
export function shardBurst(x: number, y: number, z: number, n: number, hex: number, hex2 = hex, speed = 7, size = 0.28, kind = 0, up = 1) {
  const cnt = Math.max(1, Math.round(n * Math.min(1, FX.scale + 0.1)));
  for (let k = 0; k < cnt; k++) {
    let i = dCursor;
    for (let j = 0; j < 8; j++) { if (dlife[i] <= 0) break; i = (i + 1) % MAXD; }
    dCursor = (i + 1) % MAXD;
    const a = rnd() * TAU, sp = speed * (0.35 + rnd() * 0.8);
    dx[i] = x; dy[i] = y; dz[i] = z; dvx[i] = Math.cos(a) * sp; dvz[i] = Math.sin(a) * sp; dvy[i] = (2.5 + rnd() * speed * 0.8) * up;
    drx[i] = rnd() * TAU; dry[i] = rnd() * TAU; drv[i] = (rnd() - 0.5) * 16;
    dsz[i] = size * (0.55 + rnd() * 0.9); dlen[i] = kind === 0 ? 2.6 : 1.1;
    dlife[i] = dmax[i] = 0.9 + rnd() * 0.6;
    _c.setHex(rnd() < 0.5 ? hex : hex2);
    dcol[i * 3] = _c.r; dcol[i * 3 + 1] = _c.g; dcol[i * 3 + 2] = _c.b;
  }
}

/** Frozen-block shatter: shards + mist + a glint. */
export function crystalShatter(x: number, y: number, z: number, r: number, n = 7) {
  shardBurst(x, y, z, n, 0xdff6ff, 0x7fd0f5, 5 + r * 3, 0.26 + r * 0.2, 0);
  smokePuff(x, 0.5, z, 2, 0xe6f8ff, r * 2.2, 0.8, 0.8, r * 1.2, 0.4);
  flashStar(x, y + 0.4, z, 0xbfefff, r * 3, 0.2);
}

const CAGE_N = 6;
let wasFrozen = false, lastChill = 0;

/** Crystal cage round the hero while frozen: grows with the freeze, shatters when it ends. */
function cageStart(dur: number) {
  const p = world.player.pos;
  for (let i = 0; i < CAGE_N; i++) {
    const a = (i / CAGE_N) * TAU + rnd() * 0.3;
    raiseSpire(p.x + Math.cos(a) * 1.05, p.z + Math.sin(a) * 1.05, 2.0 + rnd() * 1.0, 0.42 + rnd() * 0.12, Math.max(0.4, dur), i * 0.03, 0.05, 0);
    const s = spires[(sCursor + MAXS - 1) % MAXS];
    if (s.a) { s.rx = Math.sin(a) * 0.32; s.rz = -Math.cos(a) * 0.32; }   // lean outward (YXZ: +rx tips +z, +rz tips -x)
  }
  crystalShatterBurstSmall(p.x, p.z);
}
function crystalShatterBurstSmall(x: number, z: number) {
  smokePuff(x, 0.4, z, 3, 0xe6f8ff, 2, 0.7, 0.6, 1.5, 0.45);
  DECALS.add(x, z, 1.5, 3.4, 1.2, 0.7, 0.95, 1, 0.8, CELL.RINGW);
}

export function BossCrystals() {
  const status = useGameStore((s) => s.status);
  const sys = useMemo(() => {
    const set = new CrystalSet(MAXS, 3);
    const dm = new InstancedMesh(new OctahedronGeometry(0.5, 0), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, flatShading: true, emissive: 0x335577, emissiveIntensity: 0.25 }), MAXD);
    dm.instanceMatrix.setUsage(DynamicDrawUsage); dm.frustumCulled = false; dm.count = 0; dm.renderOrder = 3; dm.castShadow = false;
    dm.setColorAt(0, _c.setRGB(1, 1, 1)); dm.instanceColor!.setUsage(DynamicDrawUsage);
    const group = new Group(); group.add(set.group); group.add(dm);
    return { set, dm, group, acc: 0 };
  }, []);

  useFrame((_, dtRaw) => {
    const st = useGameStore.getState().status;
    const dt = st === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const pp = world.player.pos;

    if (dt > 0) {
      // ---- Glacius breath: a sweeping front raises tall ice spires inside the cone (sparse so the telegraph stays readable)
      if (breath.active) {
        sys.acc += dt * 34 * Math.max(0.35, FX.scale);
        const baseA = Math.atan2(breath.dx, breath.dz);
        const front = breath.range * clamp(breath.t / Math.max(0.3, breath.dur * 0.55), 0.1, 1);
        while (sys.acc >= 1) {
          sys.acc -= 1;
          const span = Math.max(0.5, front - 2.5), d = 2.5 + span * Math.pow(rnd(), 0.55);   // denser toward the far end
          const kd = d / breath.range, grow = 0.6 + 1.4 * kd;                                 // 0.6x at the mouth -> 2x at the tip
          const a = baseA + (rnd() * 2 - 1) * breath.half * 0.85 * (0.35 + 0.65 * kd);
          const x = breath.x + Math.sin(a) * d, z = breath.z + Math.cos(a) * d;
          const tall = (1.6 + rnd() * 1.8) * grow;
          if (raiseSpire(x, z, tall, (0.4 + rnd() * 0.3) * grow, 1.6 + rnd() * 0.7, 0, 0.16, 0)) {
            if (rnd() < 0.5) DECALS.add(x, z, 1.2, 3.2, 2.4, 0.65, 0.92, 1, 0.55, CELL.RINGW);
            if (rnd() < 0.5) smokePuff(x, 0.3, z, 1, 0xeaf8ff, 1.6, 0.8, 0.6, 1.0, 0.4);
          }
        }
      } else sys.acc = 0;

      // ---- hero frozen: crystal cage; chill stacks: small frost crystals at the feet
      const frozen = world.player.alive && playerFreeze.until > world.time;
      if (frozen && !wasFrozen) cageStart(playerFreeze.until - world.time);
      wasFrozen = frozen;
      if (chill.stacks > lastChill && chill.stacks < 4) {
        for (let i = 0; i < 2 + chill.stacks; i++) {
          const a = rnd() * TAU, d = 0.5 + rnd() * 0.6;
          raiseSpire(pp.x + Math.cos(a) * d, pp.z + Math.sin(a) * d, 0.5 + rnd() * 0.5 + chill.stacks * 0.12, 0.14 + rnd() * 0.06, 1.0 + rnd() * 0.5, i * 0.02, 0.3, 0);
        }
        shardBurst(pp.x, 0.4, pp.z, 4, 0xdff6ff, 0x9fe0ff, 4, 0.14, 0);
      }
      lastChill = chill.stacks;
    }

    // ---- update + draw spires
    let n = 0;
    for (let i = 0; i < MAXS; i++) {
      const s = spires[i];
      if (!s.a) continue;
      s.t += dt;
      if (s.t < 0) continue;
      const grown = s.t / 0.25;
      if (s.t > s.life + 0.25) {
        s.a = false;
        if (inView(s.x, s.z, 6)) crystalShatter(s.x, s.h * 0.4, s.z, s.r, 4 + Math.round(s.h * 1.5));
        continue;
      }
      if (!inView(s.x, s.z, s.r + 3)) continue;
      // grow with a little overshoot (easeOutBack), then tremble and shrink slightly just before the shatter
      const k = clamp(grown, 0, 1), c1 = 1.9, e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      const end = clamp((s.t - s.life) / 0.25, 0, 1);
      const sh = Math.sin(s.t * 70) * 0.035 * end;
      const sy = s.h * Math.max(0.02, e) * (1 - end * 0.25), sxz = s.r * 2 * (0.6 + 0.4 * Math.min(1, e));
      sys.set.set(n, s.x + sh, 0, s.z, s.ry, sxz, sy, sxz, s.rx, s.rz, 0.55 + end * 0.3, 0.85 + end * 0.1, 1);
      if (n < 40 && k > 0.4) pushHalo(s.x, sy * 0.92, s.z, 0.8 + s.r, 1.2, 2.0, 2.6, 0.5 * (0.6 + 0.4 * Math.sin(s.t * 14 + i)), CELL.STAR);
      n++;
    }
    sys.set.commit(n);

    // ---- debris
    let nd = 0;
    for (let i = 0; i < MAXD; i++) {
      let l = dlife[i];
      if (l <= 0) continue;
      l -= dt; dlife[i] = l;
      if (l <= 0) continue;
      dvy[i] -= 22 * dt;
      dx[i] += dvx[i] * dt; dy[i] += dvy[i] * dt; dz[i] += dvz[i] * dt;
      if (dy[i] < 0.05) { dy[i] = 0.05; dvy[i] *= -0.3; dvx[i] *= 0.6; dvz[i] *= 0.6; drv[i] *= 0.5; }
      drx[i] += drv[i] * dt; dry[i] += drv[i] * 0.6 * dt;
      if (!inView(dx[i], dz[i], 4)) continue;
      const k = l / dmax[i], s = dsz[i] * Math.min(1, k * 3);
      setInst(sys.dm, nd, dx[i], dy[i], dz[i], dry[i], s, s * dlen[i], s, drx[i], 0);
      const a = sys.dm.instanceColor!.array as Float32Array; a[nd * 3] = dcol[i * 3]; a[nd * 3 + 1] = dcol[i * 3 + 1]; a[nd * 3 + 2] = dcol[i * 3 + 2];
      nd++;
    }
    commitInst(sys.dm, nd);
  });

  return <primitive object={sys.group} visible={status !== GameStatus.MENU && status !== GameStatus.HERO_SELECT} />;
}
