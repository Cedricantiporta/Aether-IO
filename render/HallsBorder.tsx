// The look of a HALLS room (engine/roomHalls.ts). The walkable mask is the collision layer; this only dresses it.
//   * HallsBorder (all outdoor biomes): the edge of the floor and all the unwalkable ground between chambers is packed with the biome's
//     natural blockers: dense rows of Quaternius trees (cheap `_lo` variants), bushes, rocks. Camera side (floor to the north of the
//     border) stays low near the edge (bushes / rocks) so trees never hide monsters; tall trees stand only 5 m+ behind it.
//   (Marble Halls is dressed by render/HallsMarble.tsx: castle walls, columns, arches, statues.)
// One BatchedMesh set (QtBatch), built once per room. No per-frame work.
import React, { Suspense, useMemo } from 'react';
import { halls, hallsSdf, hallsBridge, HC } from '../engine/roomHalls';
import { biomeOf } from '../engine/roomDefs';
import { QT_PREFIX, QT_H, qtLod, qtPick } from '../engine/qtData';
import { hallsKit } from '../engine/hallsBorder';
import { QtBatch } from './qtNature';
import type { Place } from './natureKit';
import { mulberry32 } from './util';

const TAU = Math.PI * 2;

export function HallsBorder({ biome, seed, v, tint, shadows }: { biome: number; seed: number; v: number; tint?: string; shadows: boolean }) {
  const sets = useMemo(() => {
    const def = biomeOf(biome), kit = hallsKit(def.name, v), rnd = mulberry32(seed ^ 0x7b04d);
    const S = new Map<string, Place[]>();
    const add = (node: string, p: Place): void => { if (!(node.replace(/_lo$/, '') in QT_H)) return; const k = QT_PREFIX + node; let l = S.get(k); if (!l) S.set(k, (l = [])); l.push(p); };
    const rock = (px: number, pz: number, s: number): void => {
      add(qtPick(kit.rocks, rnd()), { x: px, y: 0, z: pz, ry: rnd() * TAU, sx: s, sy: s * (0.62 + rnd() * 0.35), sz: s * (0.9 + rnd() * 0.3) });
      if (kit.pebbles.length && rnd() < 0.4) { const q = 1.6 + rnd(); add(qtPick(kit.pebbles, rnd()), { x: px + 1.2, y: 0, z: pz + 0.7, ry: rnd() * TAU, sx: q, sy: q, sz: q }); }
    };
    /** a bush 1.4-2.2 m across (the GLB bush is 0.8 m); biomes without bushes use a small rock */
    const bush = (px: number, pz: number): void => {
      if (!kit.low.length) { rock(px, pz, 0.9 + rnd() * 0.7); return; }
      const sc = (1.4 + rnd() * 0.8) / 0.8;
      add(qtPick(kit.low, rnd()), { x: px, y: 0, z: pz, ry: rnd() * TAU, sx: sc, sy: sc * (0.9 + rnd() * 0.25), sz: sc });
    };
    const tree = (px: number, pz: number, want: number, lo: boolean): void => {
      const node = qtPick(kit.tall, rnd()), k = want / (QT_H[node] ?? 5), w = k * (1.0 + rnd() * 0.2);
      treePts.push(px, pz);
      add(lo ? qtLod(node) : node, { x: px, y: -0.05, z: pz, ry: rnd() * TAU, sx: w, sy: k * (0.92 + rnd() * 0.16), sz: w });
    };
    // Intentional clusters (owner: no even scatter): candidate centres on a loose 5 m grid inside a band round the floor, shuffled, each
    // accepted by a blotchy noise (so calm empty ground stays between groups) and by depth (dense near the edge, sparse behind).
    const treePts: number[] = [];   // x, z of every tree placed (the edge-wall pass below fills the gaps)
    const cand: [number, number, number, boolean][] = [];
    const x1 = halls.x0 + halls.w * HC, z1 = halls.z0 + halls.h * HC, STEP = 4.5;
    for (let z = halls.z0; z < z1; z += STEP) for (let x = halls.x0; x < x1; x += STEP) {
      const px = x + (rnd() - 0.5) * STEP * 0.8, pz = z + (rnd() - 0.5) * STEP * 0.8, d = -hallsSdf(px, pz);
      if (d < 1.4 || d > (kit.shore ? 2.4 : 15)) continue;
      if (kit.shore && hallsBridge(px, pz)) continue;
      const cam = hallsSdf(px, pz + 0.9) - hallsSdf(px, pz - 0.9) < -0.3;   // the camera sits to the south (+z): floor to the north = camera side
      cand.push([px, pz, d, cam]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    let nTree = 0, nLow = 0;
    const free = (px: number, pz: number, r: number): boolean => -hallsSdf(px, pz) >= r;   // a piece never leans into the walkable floor
    for (const [cx, cz, d, cam] of cand) {
      const blotch = vnoise2(cx * 0.1 + seed * 0.013, cz * 0.1) ;
      if (blotch < (d < 4 ? 0.3 : d < 8 ? 0.45 : 0.62)) continue;   // calm gaps
      const low = cam && d < 5.5;   // camera side near the edge: low groups only
      const roll = rnd();
      if (low || roll < kit.rockP * 1.6 + (kit.lowP > 0 ? 0.22 : 0)) {
        if (nLow > 420) continue;
        if (kit.lowP > 0 && roll < 0.8) { for (let k = 0, n = 3 + Math.floor(rnd() * 5); k < n; k++) { const a = rnd() * TAU, r = rnd() * 1.7, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r; if (free(px, pz, 1.0)) { bush(px, pz); nLow++; } } }   // a pile of 3-7 big bushes
        if (!kit.lowP || roll >= 0.8 || rnd() < 0.35) { for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) { const a = rnd() * TAU, r = rnd() * 1.6, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r; if (free(px, pz, 1.0)) { rock(px, pz, 1.0 + rnd() * 1.3); nLow++; } } }   // a pile of rocks
        continue;
      }
      if (nTree > 650) continue;
      const n = kit.shore ? 1 + Math.floor(rnd() * 2) : d < 4 ? 6 + Math.floor(rnd() * 6) : d < 8 ? 4 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 3), R0 = kit.shore ? 1.6 : 2.2 + n * 0.22;
      const placed: [number, number][] = [];
      for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * R0, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        if (!free(px, pz, 0.9) || placed.some((q) => Math.hypot(q[0] - px, q[1] - pz) < 1.5)) continue;
        placed.push([px, pz]); k++;
        tree(px, pz, d < 4 ? 6 + rnd() * 2.6 : 5 + rnd() * 3.2, d > 2.8 || k % 2 === 0);
        nTree++;
      }
      if (d < 7 && kit.lowP > 0) for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) { const a = rnd() * TAU, r = R0 * (0.7 + rnd() * 0.4), px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r; if (free(px, pz, 1.0)) { bush(px, pz); nLow++; } }
    }
    // Continuous tree wall (owner): walk a fine grid just behind the floor edge; wherever no tree stands within ~3.4 m, plant a big one,
    // so every stretch of the edge is lined (the bushes / rocks of the groups above stay as they are).
    {
      const gap2 = 3.4 * 3.4, STEP2 = 1.5;
      for (let z = halls.z0; z < z1; z += STEP2) for (let x = halls.x0; x < x1; x += STEP2) {
        const d = -hallsSdf(x, z);
        if (d < 1.5 || d > 2.6 || nTree > 900) continue;
        if (kit.shore && (hallsBridge(x, z) || hallsBridge(x + 2.5, z) || hallsBridge(x - 2.5, z) || hallsBridge(x, z + 2.5) || hallsBridge(x, z - 2.5))) continue;   // (the bridge mouths stay open)
        let near = false;
        for (let i = 0; i < treePts.length; i += 2) { const dx = treePts[i] - x, dz = treePts[i + 1] - z; if (dx * dx + dz * dz < gap2) { near = true; break; } }
        if (near || !free(x, z, 1.3)) continue;
        tree(x, z, kit.shore ? 6.5 + rnd() * 2 : 8 + rnd() * 3, false);
        nTree++;
      }
    }
    // the islands inside the floor: a clump (a big tree or rock pile, bushes / rocks piled round it)
    for (const [ix, iz, ir] of halls.islands) {
      if (ir >= 2.4 && rnd() < 0.8) tree(ix, iz, 6 + ir * 0.8, false); else rock(ix, iz, ir * 0.85);
      for (let k = 0, n = 3 + Math.floor(ir); k < n; k++) { const a = rnd() * TAU, rr = ir * (0.4 + rnd() * 0.5); if (rnd() < 0.55) bush(ix + Math.cos(a) * rr, iz + Math.sin(a) * rr); else rock(ix + Math.cos(a) * rr, iz + Math.sin(a) * rr, 0.8 + rnd() * 0.8); }
    }
    return S;
  }, [biome, seed, v, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Suspense fallback={null}><QtBatch sets={sets} shadows={shadows} tint={tint} /></Suspense>;
}

/** smooth 0..1 value noise (cluster blotches) */
function vnoise2(x: number, y: number): number {
  const h = (a: number, b: number): number => { const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return t - Math.floor(t); };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - vv) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * vv;
}
