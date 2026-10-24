// ============================================================================
// Faceted boulders: the chunky flat-shaded low-poly rock of Gorath's Boulder Prison (DodecahedronGeometry(1, 0), render/TrickFx.tsx),
// used for Gorath's body (render/Bosses.tsx). (The town / beach / cave rock formations use the textured Quaternius rocks: render/natureLayout.ts qtFormation.)
//  * facetGeo(v): 4 variants of the dodecahedron (chunky / tall / slab / plain), each with a slight vertex jitter baked ONCE (the jitter is a
//    hash of the corner position, so shared corners move together and the solid stays closed), non-indexed with a dark-bottom vertex gradient.
//  * FACET_TINTS: earthy / grey tints (the material colour is multiplied by the vertex gradient).
// ============================================================================
import { BufferGeometry, DodecahedronGeometry, Float32BufferAttribute } from 'three';

export const FACET_VARIANTS = 4;

const SHAPE: [number, number, number][] = [[1.05, 0.82, 1], [0.86, 1.18, 0.92], [1.2, 0.66, 1.05], [1, 1, 1]];
const _geo: BufferGeometry[] = [];
const h3 = (x: number, y: number, z: number, k: number): number => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3) * 43758.5453; return v - Math.floor(v); };

/** Shared faceted-boulder geometry, variant 0..3 (unit radius, centred on the origin; scale it per instance). Never dispose it. */
export function facetGeo(v: number): BufferGeometry {
  v = ((v % FACET_VARIANTS) + FACET_VARIANTS) % FACET_VARIANTS;
  if (_geo[v]) return _geo[v];
  const g = new DodecahedronGeometry(1, 0), p = g.attributes.position, n = p.count, sh = SHAPE[v];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = (a: number) => Math.round(a * 100);   // same corner -> same jitter
    const j = 0.88 + h3(q(x), q(y), q(z), v) * 0.26, jy = 0.92 + h3(q(x), q(y), q(z), v + 9) * 0.16;
    p.setXYZ(i, x * j * sh[0], y * jy * sh[1], z * j * sh[2]);
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 0.74 + 0.38 * Math.min(1, Math.max(0, (p.getY(i) / sh[1] + 1) / 2)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return (_geo[v] = g);
}
