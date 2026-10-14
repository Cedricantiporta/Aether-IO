// Shared geometry/material libraries: Kenney trees (GLB -> merged vertex-coloured geometry) and procedural rocks.
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Color, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMat, mulberry32, noisify, vnoise } from './util';

export const BASE = ((import.meta as any).env?.BASE_URL as string) || '/';
export const url = (p: string) => BASE + p;

export const TREE_URLS = {
  oak: url('models/nature/tree_oak.glb'),
  palm: url('models/nature/tree_palm.glb'),
  pineA: url('models/nature/tree_pineDefaultA.glb'),
  pineB: url('models/nature/tree_pineDefaultB.glb'),
};
Object.values(TREE_URLS).forEach((u) => useGLTF.preload(u));

const LEAF: Record<string, [string, string]> = {
  leafsGreen: ['#4aa83a', '#97e04c'],
  leafsDark: ['#2a7a45', '#58b85a'],
};
const BARK: Record<string, string> = { woodBark: '#7d5533', woodBarkDark: '#5f4028' };

function bake(gltfScene: any): BufferGeometry {
  gltfScene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  const c = new Color(), c2 = new Color();
  gltfScene.traverse((o: any) => {
    if (!(o as Mesh).isMesh) return;
    const m = o as Mesh;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const mn = (m.material as any).name as string;
    const p = g.attributes.position;
    let minY = 1e9, maxY = -1e9;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    const col = new Float32Array(p.count * 3);
    const leaf = LEAF[mn];
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) - minY) / Math.max(0.001, maxY - minY);
      if (leaf) { c.set(leaf[0]); c2.set(leaf[1]); c.lerp(c2, Math.min(1, t * 1.25)); const j = 0.92 + 0.16 * vnoise(p.getX(i) * 9, p.getZ(i) * 9 + p.getY(i) * 7); c.multiplyScalar(j); }
      else { c.set(BARK[mn] || '#7d5533'); c.multiplyScalar(0.8 + 0.3 * t); }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    parts.push(ng);
  });
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingSphere();
  return geo;
}

export interface NatureGeos { oak: BufferGeometry; palm: BufferGeometry; pineA: BufferGeometry; pineB: BufferGeometry; mat: MeshStandardMaterial }
let _nat: NatureGeos | null = null;
export function useNature(): NatureGeos {
  const oak = useGLTF(TREE_URLS.oak), palm = useGLTF(TREE_URLS.palm), pa = useGLTF(TREE_URLS.pineA), pb = useGLTF(TREE_URLS.pineB);
  return useMemo(() => {
    if (_nat) return _nat;
    _nat = {
      oak: bake(oak.scene), palm: bake(palm.scene), pineA: bake(pa.scene), pineB: bake(pb.scene),
      // DoubleSide: some Kenney canopy faces are wound inward and looked hollow from above
      mat: (() => { const m = litMat({ roughness: 0.85 }); m.side = DoubleSide; return m; })(),
    };
    return _nat;
  }, [oak, palm, pa, pb]);
}

// --------------------------------------------------------------------- rocks
const _n = new Vector3();
export function makeRockGeo(seed: number, stone = '#8d95a0', moss = '#5fa73c', squash = 0.78): BufferGeometry {
  const rnd = mulberry32(seed);
  const g0 = new IcosahedronGeometry(1, 1);
  noisify(g0, 0.55, 1.7 + rnd(), seed * 3.1);
  g0.scale(1 + rnd() * 0.3, squash, 1 + rnd() * 0.3);
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  const p = g.attributes.position, nrm = g.attributes.normal;
  const c = new Color(), cs = new Color(stone), cm = new Color(moss);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    _n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const mossK = Math.min(1, Math.max(0, (_n.y - 0.45) * 3.2)) * (0.65 + 0.35 * vnoise(i * 0.37, seed));
    const dark = 0.72 + 0.4 * ((cy + 0.8) / 1.6) + (rnd() - 0.5) * 0.12;
    c.copy(cs).multiplyScalar(dark).lerp(cm, mossK);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  // sit on the ground
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y * 0.85, 0);
  g.computeBoundingSphere();
  return g;
}
