// The look of a HALLS room (engine/roomHalls.ts). The walkable mask is the collision layer; this only dresses it.
//   * HallsBorder (all outdoor biomes): the edge of the floor and all the unwalkable ground between chambers is packed with the biome's
//     natural blockers: dense rows of Quaternius trees (cheap `_lo` variants), bushes, rocks. Camera side (floor to the north of the
//     border) stays low near the edge (bushes / rocks) so trees never hide monsters; tall trees stand only 5 m+ behind it.
//   * HallsColumns (Marble Halls): no walls at all, the floor plan just ends in darkness (render/Room.tsx fades the ground to black);
//     free-standing islands are drawn as round fluted columns (some broken), never cubes.
// One BatchedMesh set (QtBatch) / two InstancedMeshes, built once per room. No per-frame work.
import React, { Suspense, useMemo } from 'react';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { halls, hallsSdf, HC } from '../engine/roomHalls';
import { biomeOf } from '../engine/roomDefs';
import { QT_PREFIX, QT_H, qtLod, qtPick } from '../engine/qtData';
import { hallsKit } from '../engine/hallsBorder';
import { QtBatch } from './qtNature';
import type { Place } from './natureKit';
import { GB, mulberry32 } from './util';

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
      add(lo ? qtLod(node) : node, { x: px, y: -0.05, z: pz, ry: rnd() * TAU, sx: w, sy: k * (0.92 + rnd() * 0.16), sz: w });
    };
    // Intentional clusters (owner: no even scatter): candidate centres on a loose 5 m grid inside a band round the floor, shuffled, each
    // accepted by a blotchy noise (so calm empty ground stays between groups) and by depth (dense near the edge, sparse behind).
    const cand: [number, number, number, boolean][] = [];
    const x1 = halls.x0 + halls.w * HC, z1 = halls.z0 + halls.h * HC, STEP = 4.5;
    for (let z = halls.z0; z < z1; z += STEP) for (let x = halls.x0; x < x1; x += STEP) {
      const px = x + (rnd() - 0.5) * STEP * 0.8, pz = z + (rnd() - 0.5) * STEP * 0.8, d = -hallsSdf(px, pz);
      if (d < 1.4 || d > 15) continue;
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
      const n = d < 4 ? 6 + Math.floor(rnd() * 6) : d < 8 ? 4 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 3), R0 = 2.2 + n * 0.22;
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

// -------------------------------------------------------------- Marble columns
let colGeo: { full: ReturnType<GB['build']>; broken: ReturnType<GB['build']> } | null = null;
function columnGeos() {
  if (colGeo) return colGeo;
  const mk = (broken: boolean) => {
    const g = new GB([0.82, 1.06]);
    g.cyl(1.0, 1.08, 0.5, 18, [0, 0.25, 0], '#ffffff');                 // round base drum
    g.cyl(1.12, 1.12, 0.14, 18, [0, 0.55, 0], '#ffffff');                // base ring
    if (!broken) {
      g.cyl(0.78, 0.86, 5.2, 12, [0, 3.2, 0], '#ffffff');              // fluted shaft (12 soft facets)
      g.cyl(1.12, 0.84, 0.3, 18, [0, 5.95, 0], '#ffffff');             // capital flare
      g.cyl(1.2, 1.2, 0.34, 18, [0, 6.25, 0], '#ffffff');              // abacus (round)
    } else {
      g.cyl(0.74, 0.86, 2.4, 12, [0, 1.9, 0], '#ffffff');
      g.ico(0.8, [0, 3.1, 0], '#ffffff', [1, 0.55, 1], 0);             // jagged broken top
    }
    return g.build();
  };
  return (colGeo = { full: mk(false), broken: mk(true) });
}

export function HallsColumns({ seed }: { seed: number }) {
  const { full, broken } = useMemo(() => {
    const geos = columnGeos(), rnd = mulberry32(seed ^ 0xc01a);
    const isl = halls.islands, nF = isl.length;
    const mat = () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    const a = new InstancedMesh(geos.full, mat(), Math.max(1, nF)), b = new InstancedMesh(geos.broken, mat(), Math.max(1, nF));
    const o = new Object3D(), c = new Color();
    let na = 0, nb = 0;
    for (const [x, z, r] of isl) {
      const brk = rnd() < 0.3, k = r * 0.8, hs = 0.73 * (brk ? 0.9 + rnd() * 0.4 : 0.92 + rnd() * 0.2);   // shaft ~3.8 m, broken ones ~2.3 m
      o.position.set(x, 0, z); o.rotation.set(0, rnd() * TAU, 0); o.scale.set(k, hs, k); o.updateMatrix();
      c.set('#f3ead2').offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      if (brk) { b.setMatrixAt(nb, o.matrix); b.setColorAt(nb++, c); } else { a.setMatrixAt(na, o.matrix); a.setColorAt(na++, c); }
    }
    a.count = na; b.count = nb;
    for (const m of [a, b]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    return { full: a, broken: b };
  }, [seed, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (<><primitive object={full} /><primitive object={broken} /></>);
}
