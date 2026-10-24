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
    const add = (node: string, p: Place): void => { if (!(node in QT_H)) return; const k = QT_PREFIX + node; let l = S.get(k); if (!l) S.set(k, (l = [])); l.push(p); };
    const rock = (px: number, pz: number, s: number): void => {
      add(qtPick(kit.rocks, rnd()), { x: px, y: 0, z: pz, ry: rnd() * TAU, sx: s, sy: s * (0.62 + rnd() * 0.35), sz: s * (0.9 + rnd() * 0.3) });
      if (kit.pebbles.length && rnd() < 0.5) { const q = 1.6 + rnd(); add(qtPick(kit.pebbles, rnd()), { x: px + 1, y: 0, z: pz + 0.6, ry: rnd() * TAU, sx: q, sy: q, sz: q }); }
    };
    const bush = (px: number, pz: number, sc: number): void => { if (kit.low.length) add(qtPick(kit.low, rnd()), { x: px, y: 0, z: pz, ry: rnd() * TAU, sx: sc, sy: sc * (0.9 + rnd() * 0.3), sz: sc }); else rock(px, pz, sc * 0.8); };
    const tree = (px: number, pz: number, want: number, lo: boolean): void => {
      const node = qtPick(kit.tall, rnd()), k = want / (QT_H[node] ?? 5), w = k * (1.0 + rnd() * 0.2);
      add(lo ? qtLod(node) : node, { x: px, y: -0.05, z: pz, ry: rnd() * TAU, sx: w, sy: k * (0.92 + rnd() * 0.16), sz: w });
    };
    const x1 = halls.x0 + halls.w * HC, z1 = halls.z0 + halls.h * HC;
    let nTree = 0, nLow = 0;
    const STEP = 1.5;
    for (let z = halls.z0; z < z1 && nTree < 700; z += STEP) for (let x = halls.x0; x < x1; x += STEP) {
      const px = x + (rnd() - 0.5) * STEP * 1.1, pz = z + (rnd() - 0.5) * STEP * 1.1, d = -hallsSdf(px, pz);
      if (d < 0.9 || d > 16) continue;
      // the camera sits to the south (+z): a border whose floor lies to its north is "camera side"
      const cam = hallsSdf(px, pz + 0.7) - hallsSdf(px, pz - 0.7) < -0.3;
      const pr = d < 3 ? 0.72 : d < 7 ? 0.22 : d < 12 ? 0.08 : 0.03, roll = rnd();
      if (cam && d < 5) {   // low dressing only: bushes / rocks
        if (nLow < 420 && d < 3.4 && roll < 0.62) { if (kit.lowP > 0 && rnd() < 0.7) bush(px, pz, 1.6 + rnd() * 1.1); else rock(px, pz, 1.0 + rnd() * 1.2); nLow++; }
        continue;
      }
      if (roll > pr) {
        if (d < 3.2 && nLow < 420 && roll < pr + kit.rockP) { rock(px, pz, 1.1 + rnd() * 1.4); nLow++; }
        else if (kit.lowP > 0 && d < 3.2 && nLow < 420 && roll < pr + kit.lowP) { bush(px, pz, 1.5 + rnd()); nLow++; }
        continue;
      }
      tree(px, pz, d < 3 ? 5.8 + rnd() * 2.6 : 5 + rnd() * 3.2, !(d < 2.2 && nTree % 3 === 0));
      nTree++;
    }
    // the islands inside the floor: a clump (one big tree or rock, bushes / rocks round it)
    for (const [ix, iz, ir] of halls.islands) {
      if (ir >= 2.4 && rnd() < 0.8) tree(ix, iz, 6 + ir * 0.8, false); else rock(ix, iz, ir * 0.85);
      for (let k = 0, n = 2 + Math.floor(ir); k < n; k++) { const a = rnd() * TAU, rr = ir * (0.55 + rnd() * 0.35); if (rnd() < 0.5) bush(ix + Math.cos(a) * rr, iz + Math.sin(a) * rr, 1.2 + rnd() * 0.8); else rock(ix + Math.cos(a) * rr, iz + Math.sin(a) * rr, 0.8 + rnd() * 0.8); }
    }
    return S;
  }, [biome, seed, v, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Suspense fallback={null}><QtBatch sets={sets} shadows={shadows} tint={tint} /></Suspense>;
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
      const brk = rnd() < 0.3, k = r * 0.9, hs = brk ? 0.9 + rnd() * 0.5 : 0.85 + rnd() * 0.3;
      o.position.set(x, 0, z); o.rotation.set(0, rnd() * TAU, 0); o.scale.set(k, k * hs, k); o.updateMatrix();
      c.set('#f3ead2').offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      if (brk) { b.setMatrixAt(nb, o.matrix); b.setColorAt(nb++, c); } else { a.setMatrixAt(na, o.matrix); a.setColorAt(na++, c); }
    }
    a.count = na; b.count = nb;
    for (const m of [a, b]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    return { full: a, broken: b };
  }, [seed, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (<><primitive object={full} /><primitive object={broken} /></>);
}
