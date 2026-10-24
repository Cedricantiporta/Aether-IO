// The walls of a HALLS room (engine/roomHalls.ts): chunky, rounded, toy-like blocks tiled over the wall cells next to the
// walkable floor (3 m deep), tinted per biome; a lighter rounded cap on each block. Two InstancedMesh draws (bodies + caps),
// built once per room from the walkable mask. No per-frame work.
import { useMemo } from 'react';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { halls, HC } from '../engine/roomHalls';
import { biomeOf, type GroundStyle } from '../engine/roomDefs';
import { mulberry32 } from './util';

/** [block body, block cap] per ground style: bright, soft, Zelda-toy colours (no dark metal). */
const WALL_TONE: Record<GroundStyle, [string, string]> = {
  GRASS: ['#cbc3a2', '#8ed25c'], MARBLE: ['#eadfc6', '#fff4dc'], SAND: ['#e6c78a', '#f7deaa'],
  SNOW: ['#b4cde6', '#f4f9ff'], BASALT: ['#a98772', '#e59a5c'], VOID: ['#a898dd', '#d9ccff'],
};
const DEPTH = 3.2;   // wall cells within this distance of the floor get a block (the rest is hidden behind them)

let bodyGeo: BufferGeometry | null = null, capGeo: BufferGeometry | null = null;

export function HallsWalls({ biome, seed }: { biome: number; seed: number }) {
  const { body, cap } = useMemo(() => {
    const style = biomeOf(biome).style;
    const [bc, cc] = WALL_TONE[style];
    bodyGeo ??= new RoundedBoxGeometry(1, 1, 1, 2, 0.13).translate(0, 0.5, 0);
    capGeo ??= new RoundedBoxGeometry(1, 0.22, 1, 2, 0.09).translate(0, 0.11, 0);
    const w = halls.w, h = halls.h, O = halls.open, S = halls.sdf;
    const eligible = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && !O[j * w + i] && S[j * w + i] > -DEPTH;
    const seen = new Uint8Array(w * h);
    const rnd = mulberry32(seed ^ 0x9a11);
    const rects: number[] = [];   // x, z, sx, sz per block
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (seen[j * w + i] || !eligible(i, j)) continue;
      const tw = 3 + Math.floor(rnd() * 4), td = 3 + Math.floor(rnd() * 4);   // 1.5 - 3 m blocks
      let a = 0;
      while (a < tw && eligible(i + a, j) && !seen[j * w + i + a]) a++;
      let b = 1;
      for (; b < td; b++) {
        let ok = true;
        for (let k = 0; k < a; k++) if (!eligible(i + k, j + b) || seen[(j + b) * w + i + k]) { ok = false; break; }
        if (!ok) break;
      }
      for (let jj = 0; jj < b; jj++) for (let k = 0; k < a; k++) seen[(j + jj) * w + i + k] = 1;
      rects.push(halls.x0 + (i + a / 2) * HC, halls.z0 + (j + b / 2) * HC, a * HC, b * HC);
    }
    const n = rects.length / 4;
    const mat = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const capMat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    const body = new InstancedMesh(bodyGeo!, mat, n), cap = new InstancedMesh(capGeo!, capMat, n);
    const o = new Object3D(), col = new Color(), hsl = { h: 0, s: 0, l: 0 };
    for (let k = 0; k < n; k++) {
      const x = rects[k * 4], z = rects[k * 4 + 1], sx = rects[k * 4 + 2], sz = rects[k * 4 + 3];
      const ht = 2.1 + rnd() * 0.6, jit = rnd();
      o.position.set(x, 0, z); o.rotation.set(0, 0, 0);
      o.scale.set(Math.max(0.3, sx - 0.06), ht, Math.max(0.3, sz - 0.06)); o.updateMatrix();
      body.setMatrixAt(k, o.matrix);
      o.position.set(x, ht - 0.02, z); o.scale.set(sx + 0.04, 1, sz + 0.04); o.updateMatrix();
      cap.setMatrixAt(k, o.matrix);
      col.set(bc).getHSL(hsl); col.setHSL(hsl.h, hsl.s, Math.min(0.95, Math.max(0.2, hsl.l + (jit - 0.5) * 0.1))); body.setColorAt(k, col);
      col.set(cc).getHSL(hsl); col.setHSL(hsl.h, hsl.s, Math.min(0.97, Math.max(0.25, hsl.l + (jit - 0.5) * 0.08))); cap.setColorAt(k, col);
    }
    body.instanceMatrix.needsUpdate = true; cap.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    body.frustumCulled = false; cap.frustumCulled = false;
    return { body, cap };
  }, [biome, seed, halls.version]);
  return (<><primitive object={body} /><primitive object={cap} /></>);
}
