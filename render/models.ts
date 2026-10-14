// Shared geometry/material libraries: Kenney trees (GLB -> merged vertex-coloured geometry) and procedural rocks.
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, ConeGeometry, DoubleSide, Color, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GB, litMat, mulberry32, noisify, vnoise } from './util';

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

/** Stylised broadleaf tree: tapered trunk + branches + a cluster of soft, noisy leaf clumps (replaces the
 *  faceted Kenney canopies that read as hexagon blocks from the top-down camera). Fitted to `ref`'s bounds. */
function makeLeafyTree(seed: number, ref: BufferGeometry, palette: [string, string, string]): BufferGeometry {
  const rnd = mulberry32(seed);
  const g = new GB([0.62, 1.12]);
  const bark = '#6e4a2c';
  g.cyl(0.11, 0.2, 1.3, 7, [0, 0.65, 0], bark);
  g.cyl(0.05, 0.09, 0.6, 5, [0.2, 1.15, 0.05], bark, [0, 0, -0.8]);
  g.cyl(0.05, 0.09, 0.55, 5, [-0.18, 1.1, -0.08], bark, [0.3, 0, 0.8]);
  const clumps: [number, number, number, number][] = [[0, 1.75, 0, 0.62], [0.42, 1.5, 0.12, 0.44], [-0.4, 1.5, -0.1, 0.46], [0.05, 1.45, 0.42, 0.42], [-0.08, 1.48, -0.42, 0.42], [0.12, 2.12, -0.05, 0.4]];
  clumps.forEach(([x, y, z, r], i) => {
    const geo = new IcosahedronGeometry(r * (0.92 + rnd() * 0.16), 2);
    noisify(geo, r * 0.16, 3.2, seed * 7 + i);
    const col = i === 5 ? palette[2] : i === 0 ? palette[1] : palette[0];
    g.add(geo, [x, y, z], [rnd(), rnd(), rnd()], [1, 0.86, 1], col);
  });
  const geo = g.build();
  ref.computeBoundingBox(); geo.computeBoundingBox();
  const rb = ref.boundingBox!, gb = geo.boundingBox!;
  const k = (rb.max.y - rb.min.y) / Math.max(0.01, gb.max.y - gb.min.y);
  geo.translate(0, -gb.min.y, 0); geo.scale(k, k, k); geo.translate(0, rb.min.y, 0);
  geo.computeBoundingSphere();
  return geo;
}

/** Stylised conifer: trunk + 4 stacked, slightly noisy many-sided cones (round silhouette from above). */
function makeConifer(seed: number, ref: BufferGeometry, cols: [string, string]): BufferGeometry {
  const rnd = mulberry32(seed);
  const g = new GB([0.6, 1.15]);
  g.cyl(0.08, 0.14, 0.9, 7, [0, 0.45, 0], '#5f4028');
  const tiers = [[0.95, 1.0, 0.75], [0.78, 0.9, 1.25], [0.6, 0.8, 1.7], [0.4, 0.7, 2.1]];
  tiers.forEach(([r, h, y], i) => {
    const geo = new ConeGeometry(r, h, 14, 2);
    noisify(geo, r * 0.07, 4, seed * 13 + i);
    g.add(geo, [(rnd() - 0.5) * 0.05, y, (rnd() - 0.5) * 0.05], [0, rnd() * 6, 0], 1, i % 2 ? cols[1] : cols[0]);
  });
  const geo = g.build();
  ref.computeBoundingBox(); geo.computeBoundingBox();
  const rb = ref.boundingBox!, gb = geo.boundingBox!;
  const k = (rb.max.y - rb.min.y) / Math.max(0.01, gb.max.y - gb.min.y);
  geo.translate(0, -gb.min.y, 0); geo.scale(k, k, k); geo.translate(0, rb.min.y, 0);
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
      oak: makeLeafyTree(11, bake(oak.scene), ['#4c9a3c', '#6cbd48', '#8fd65a']),
      palm: makeLeafyTree(23, bake(palm.scene), ['#3f8a46', '#5aa84c', '#7cc458']),
      pineA: makeConifer(31, bake(pa.scene), ['#2f7a48', '#3f9455']), pineB: makeConifer(47, bake(pb.scene), ['#2a6e44', '#38884f']),
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
