// Render side of the biome camp's transition path (engine/campPaths.ts): a two-layer ground (the old biome's texture and
// colours underneath, the new biome's cross-faded on top along the path), the authored set pieces (castle gate, stairs,
// half-buried columns, wooden pier, glowing cracks, rocky steps) as instanced merged meshes, and bobbing void shards.
// Scenery (trees, columns, cacti, rocks, palms, pines, basalt, spires) is ordinary world.obstacles drawn by render/Props.
// Everything is built once per room (during the black fade). The only per-frame work is the shard bob (one instanced mesh).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  OctahedronGeometry, PlaneGeometry, type Material,
} from 'three';
import { camp, campBuilt, campNearest, campHalfWidth, campAtS, type CampLayout, type CampPath, type PieceType } from '../engine/campPaths';
import { BIOMES, variantOf, type BiomeDef, type GroundStyle } from '../engine/roomDefs';
import { GB, fbm, litMat, mulberry32, vnoise } from './util';
import { groundMaterial, DETAIL_PERIOD } from './Room';
import { bakeGridShore, setSeaShore } from './waterFx';

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ ground ---
interface Pal { style: GroundStyle; g0: Color; g1: Color; edge: Color; lush: Color; dry: Color; dirt: Color; stone: Color }
function palette(biome: number): Pal {
  const def: BiomeDef = BIOMES[((biome % BIOMES.length) + BIOMES.length) % BIOMES.length], vr = variantOf(def, 0);
  const ground = vr?.ground ?? def.ground, patch = vr?.patch ?? def.patch;
  return { style: def.style, g0: new Color(ground[0]), g1: new Color(ground[1]), edge: new Color(vr?.edge ?? def.edge), lush: new Color(patch[0]), dry: new Color(patch[1]), dirt: new Color(patch[2]), stone: new Color(def.stone) };
}
const _t1 = new Color(), _t2 = new Color();

/** One biome's ground colour at (x, z): the same colour language as the run rooms (render/Room.tsx RoomGround), plus the road. */
function paint(p: Pal, x: number, z: number, l: number, inRoad: number, so: number, out: Color): void {
  const n1 = fbm(x * 0.06 + so, z * 0.06 - so, 3), n2 = vnoise(x * 0.9 + so, z * 0.9);
  out.copy(p.g0).lerp(p.g1, sstep(0.3, 0.72, n1)).multiplyScalar(0.9 + n2 * 0.2);
  out.lerp(p.g1, sstep(0.62, 0.78, fbm(x * 0.14 - so, z * 0.14 + so, 2)) * 0.35);
  const zA = fbm(x * 0.055 - so * 1.7, z * 0.055 + so, 3), zB = fbm(x * 0.07 + so * 2.3, z * 0.07 - so * 0.6, 3);
  switch (p.style) {
    case 'MARBLE': {
      out.multiplyScalar(0.9 + vnoise(Math.floor(x / 3) * 3.7 + so, Math.floor(z / 3) * 5.3) * 0.16);
      out.lerp(p.dry, sstep(0.55, 0.7, zB) * 0.45);
      out.lerp(p.dirt, sstep(0.62, 0.74, zA) * 0.75);
      const lane = Math.abs(l), torn = sstep(0.62, 0.7, fbm(x * 0.12 + so, z * 0.12, 3));   // the worn royal carpet down the hall
      const k = sstep(2.9, 2.6, lane) * inRoad * (1 - torn);
      out.lerp(_t1.set('#6e1a20'), k * 0.85);
      out.lerp(_t1.set('#b8913a'), sstep(2.9, 2.6, lane) * sstep(2.2, 2.45, lane) * inRoad * (1 - torn) * 0.7);
      return;
    }
    case 'SAND': {
      const w = x * 0.42 * 0.8 + z * 0.42 * 0.6 + fbm(x * 0.03 + so, z * 0.03, 3) * 6, rip = Math.sin(w) * 0.5 + 0.5;
      out.multiplyScalar(0.86 + rip * 0.2);
      out.lerp(p.dry, sstep(0.5, 0.66, zB) * 0.6);
      out.lerp(p.dirt, sstep(0.66, 0.76, zA) * 0.5);
      break;
    }
    case 'SNOW':
      out.lerp(p.dry, sstep(0.5, 0.64, zB) * 0.6);
      out.lerp(_t1.set('#a8d4f0'), sstep(0.66, 0.74, zA) * 0.7);
      out.lerp(p.dirt, sstep(0.7, 0.8, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.6);
      break;
    case 'BASALT':
      out.lerp(p.lush, sstep(0.48, 0.62, zA) * 0.6);
      out.lerp(p.dirt, sstep(0.55, 0.7, zB) * 0.8);
      out.lerp(_t1.set('#5a3220'), sstep(0.7, 0.78, fbm(x * 0.09 + so, z * 0.09, 3)) * 0.35);
      break;
    case 'VOID':
      out.lerp(p.lush, sstep(0.48, 0.62, zA) * 0.7);
      out.lerp(p.dirt, sstep(0.6, 0.72, zB) * 0.8);
      break;
    default:
      out.lerp(p.lush, sstep(0.48, 0.62, zA) * 0.85);
      out.lerp(p.dry, sstep(0.5, 0.64, zB) * 0.8);
      out.lerp(p.dirt, sstep(0.64, 0.74, fbm(x * 0.09 + so, z * 0.09 + so * 0.3, 3)) * 0.85);
  }
  // the road: a worn stone trail down the middle (paler on sand)
  const w = 1.9 + vnoise(x * 0.2 + so, z * 0.2) * 0.9, pd = Math.abs(l - Math.sin(x * 0.3 + z * 0.2) * 0.4) - w;
  const k = sstep(0.6, -0.4, pd) * inRoad * (p.style === 'SAND' ? 0.5 : p.style === 'VOID' ? 0.45 : 0.9);
  if (k > 0) {
    const cx = x * 1.25, cz = z * 1.25, fx = cx - Math.floor(cx), fz = cz - Math.floor(cz) + (Math.floor(cx) % 2) * 0.5;
    const gap = Math.min(fx, 1 - fx, fz - Math.floor(fz), 1 - (fz - Math.floor(fz)));
    _t2.copy(p.stone).multiplyScalar(0.85 + vnoise(Math.floor(cx) * 3.1, Math.floor(cz) * 2.7) * 0.3);
    if (gap < 0.09) _t2.multiplyScalar(0.62);
    out.lerp(_t2, k * 0.92);
  }
}

const MODE_I = { hills: 0, flat: 1, sea: 2, lava: 3, abyss: 4 } as const;
const _w = [0, 0, 0, 0, 0];
/** Blend weights [hills, flat, sea, lava, abyss] of the beyond-the-walls treatment at t; returns the hill height multiplier. */
function edgeBlend(L: CampLayout, t: number): number {
  _w[0] = _w[1] = _w[2] = _w[3] = _w[4] = 0;
  let hk = 0;
  for (let j = 0; j < L.edge.length; j++) {
    const a = j === 0 ? 1 : sstep(L.edge[j][0] - 0.05, L.edge[j][0] + 0.05, t), b = j + 1 < L.edge.length ? sstep(L.edge[j + 1][0] - 0.05, L.edge[j + 1][0] + 0.05, t) : 0;
    const wj = Math.max(0, a - b);
    _w[MODE_I[L.edge[j][1]]] += wj; hk += wj * (L.edge[j][2] ?? 1);
  }
  return hk;
}

function buildGround(P: CampPath) {
  const L = P.layout, A = palette(L.from), B = palette(L.to);
  const M = 40, x0 = P.minX - M, x1 = P.maxX + M, z0 = P.minZ - M, z1 = P.maxZ + M;
  const W = x1 - x0, H = z1 - z0, sx = Math.ceil(W / 1.2), sz = Math.ceil(H / 1.2);
  const g = new PlaneGeometry(W, H, sx, sz);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = g.attributes.position, n = pos.count;
  const colA = new Float32Array(n * 3), colB = new Float32Array(n * 4);
  const so = (L.seed % 997) * 0.37, near = [0, 0, 0];
  const out = new Color(), tint = new Color(), cA = new Color(), cB = new Color();
  const seaTone = new Color('#c8b07a'), lavaLip = new Color('#1a0c08'), voidDark = new Color('#160e2c');
  const tints = (L.tints ?? []).map((tb) => ({ ...tb, c: new Color(tb.color) }));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    campNearest(P, x, z, near);
    const t = near[0], l = near[1], d = near[2];
    const hw = campHalfWidth(P, Math.min(1, Math.max(0, t)));
    const u = d - hw;   // distance outside the walkable road (negative = on the road)
    const inRoad = sstep(0.5, -1.5, u);
    const hk = edgeBlend(L, t);
    // terrain beyond the walls
    const nz = fbm(x * 0.045 + so, z * 0.045 - so, 3);
    const ua = u - Math.max(0, fbm(x * 0.12 + so, z * 0.12, 3) - 0.38) * 14;   // (abyss: a ragged lip with tongues of floor)
    let y = _w[0] * sstep(6, 20, u) * (1.2 + 5.5 * nz) * hk;
    y += _w[2] * -1.6 * sstep(1.0, 5.0, u) + _w[3] * -1.4 * sstep(3.4, 6.0, u) + _w[4] * -10 * sstep(0.8, 3.5, ua);
    pos.setY(i, y);
    // colours: the old biome everywhere, the new one cross-faded in along t (organic edge from noise)
    paint(A, x, z, l, inRoad, so, cA); paint(B, x, z, l, inRoad, so, cB);
    for (const tb of tints) {
      const k = tb.k * sstep(tb.t0, tb.t0 + 0.08, t) * sstep(tb.t1, tb.t1 - 0.08, t) * (0.7 + 0.3 * vnoise(x * 0.3 + so, z * 0.3));
      if (k > 0) { tint.copy(tb.c); cA.lerp(tint, k); cB.lerp(tint, k); }
    }
    const tb2 = t + (fbm(x * 0.07 + so, z * 0.07 - so, 2) - 0.5) * 0.1;
    const alpha = sstep(L.blend[0], L.blend[1], tb2);
    for (const [P2, c, edgeC] of [[A, cA, A.edge], [B, cB, B.edge]] as const) {
      out.copy(c);
      const e = sstep(0.2, P2.style === 'MARBLE' ? 2.2 : 3.2, u) * (1 - Math.min(1, _w[2] + _w[4]));
      out.lerp(edgeC, e).multiplyScalar(1 - e * 0.35);
      if (_w[2] > 0) out.lerp(seaTone, sstep(1.4, 3.6, u) * 0.7 * _w[2]);
      if (_w[3] > 0) out.lerp(lavaLip, sstep(2.6, 4.2, u) * 0.85 * _w[3]);
      if (_w[4] > 0) out.lerp(voidDark, sstep(0.4, 2.6, ua) * _w[4]);
      if (c === cA) { colA[i * 3] = out.r; colA[i * 3 + 1] = out.g; colA[i * 3 + 2] = out.b; }
      else { colB[i * 4] = out.r; colB[i * 4 + 1] = out.g; colB[i * 4 + 2] = out.b; colB[i * 4 + 3] = alpha; }
      void P2;
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(colA, 3));
  g.computeVertexNormals();
  setSeaShore(L.edge.some((e) => e[1] === 'sea') ? bakeGridShore(pos.array, sx, sz, x0, z0, W, H, -0.45, 16) : null);   // (the sea's shore distance, render/waterFx.ts)
  const g2 = new BufferGeometry();
  g2.setAttribute('position', g.attributes.position); g2.setAttribute('normal', g.attributes.normal); g2.setAttribute('uv', g.attributes.uv); g2.setIndex(g.index);
  g2.setAttribute('color', new Float32BufferAttribute(colB, 4));
  const mat = (pal: Pal, overlay: boolean): MeshStandardMaterial => {
    const m = groundMaterial(pal.style, W / DETAIL_PERIOD[pal.style], H / DETAIL_PERIOD[pal.style]);
    if (overlay) { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
    return m;
  };
  return { g, g2, mA: mat(A, false), mB: mat(B, true) };
}

export function CampGround({ ver }: { ver: number }) {
  const built = useMemo(() => (camp.cur ? buildGround(camp.cur) : null), [ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (built) { built.g.dispose(); built.g2.dispose(); built.mA.dispose(); built.mB.dispose(); } }, [built]);
  if (!built) return null;
  return (
    <>
      <mesh geometry={built.g} material={built.mA} receiveShadow />
      <mesh geometry={built.g2} material={built.mB} receiveShadow renderOrder={1} />
    </>
  );
}

// ------------------------------------------------------------- set pieces ---
const ST = ['#8c8a92', '#7c7a84', '#9a97a2', '#85838c'], MOSS = '#5f8a3e';

/** Broken castle gate: two stacked-block pillars (the right one snapped), the arch's springers, a fallen keystone, rubble, torn banners.
 *  Local frame: x lateral, travel = -z. */
function gateGeo(): BufferGeometry {
  const b = new GB([0.72, 1.08]), rnd = mulberry32(4711);
  for (const sx of [-1, 1]) {
    let y = 0.3; const top = sx < 0 ? 5 : 3;
    b.box(2.4, 0.5, 2.3, [sx * 4.5, 0.25, 0], '#6a6772');
    for (let k = 0; k < top; k++) {
      const h = 0.9 + rnd() * 0.15, w = 1.75 - k * 0.04 + rnd() * 0.1;
      b.box(w, h, 1.7 + rnd() * 0.1, [sx * 4.5 + (rnd() - 0.5) * 0.12, y + h / 2 + 0.25, (rnd() - 0.5) * 0.08], ST[(k + (sx > 0 ? 1 : 0)) % 4], [0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.04]);
      if (rnd() < 0.5) b.box(w * 0.7, 0.07, 1.2, [sx * 4.5, y + h + 0.28, 0.1], MOSS);
      y += h;
    }
    // flanking stub of wall (links the gate to the wall chain)
    b.box(2.6, 1.8 + (sx < 0 ? 0.8 : 0), 1.6, [sx * 6.5, 1.0 + (sx < 0 ? 0.4 : 0), 0], ST[2]);
    b.box(1.8, 0.6, 1.4, [sx * 6.9, 2.2 + (sx < 0 ? 0.8 : 0), 0.1], ST[1], [0, 0.2, 0.1]);
  }
  // arch springers on the left pillar and a partial span, broken on the right
  const cy = 5.15, R = 4.5, N = 11;
  for (let k = 0; k < N; k++) {
    const a = Math.PI - (k + 0.5) * (Math.PI / N);
    if (k > 4 && k < 8) continue;   // the collapsed middle
    const cx = Math.cos(a) * R, y = cy + Math.sin(a) * R;
    if (k >= 8 && y < 4.4) continue;
    b.box(1.5, 1.15, 1.8, [cx, y, 0], ST[k % 4], [0, 0, a - Math.PI / 2]);
  }
  b.box(1.5, 1.4, 1.8, [Math.cos(Math.PI - 4.5 * (Math.PI / N)) * R, cy + Math.sin(Math.PI - 4.5 * (Math.PI / N)) * R + 0.1, 0], '#a8a4b0', [0, 0, 0.3]);   // keystone-ish
  // fallen blocks + rubble
  b.box(1.5, 1.1, 1.6, [2.2, 0.6, -2.0], ST[1], [0.5, 0.8, 0.3]); b.box(1.2, 0.9, 1.3, [-1.6, 0.5, 2.1], ST[3], [0.2, 0.4, 0.6]); b.box(1.3, 1.0, 1.5, [0.9, 0.5, 2.6], ST[0], [0.3, 1.2, 0.2]);
  for (let k = 0; k < 14; k++) { const a = rnd() * Math.PI * 2, d = 2 + rnd() * 5; b.ico(0.22 + rnd() * 0.3, [Math.cos(a) * d, 0.14, Math.sin(a) * d * 0.5], ST[k % 4], [1, 0.7, 1], 0, [rnd(), rnd(), rnd()]); }
  for (let k = 0; k < 6; k++) { const a = rnd() * Math.PI * 2; b.sph(0.3 + rnd() * 0.2, [Math.cos(a) * 5.2, 0.2, Math.sin(a) * 1.6], MOSS, [1.4, 0.4, 1.4], 5); }
  // torn banners hanging from the left springer
  b.box(0.9, 2.2, 0.06, [-3.5, 3.4, 0.95], '#8a2a2a', [0.05, 0, 0.04]); b.box(0.7, 1.4, 0.06, [-5.3, 3.9, 0.95], '#7a2424', [0.04, 0, -0.06]);
  return b.build();
}

/** Castle exit stairs: wide treads dropping from the castle floor (behind, +z) to the sand (ahead). */
function stairsGeo(): BufferGeometry {
  const b = new GB([0.8, 1.06]);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const h = 0.1 * (n - i);   // the highest tread is on the castle side
    b.box(11.6, h, 1.0, [0, h / 2, -2.4 + (n - 1 - i) * 0.0 + (i - 3) * 1.0], i % 2 ? '#a39d90' : '#938d80');
  }
  for (const sx of [-1, 1]) {   // side cheeks with ornaments
    b.box(0.9, 1.0, 7.4, [sx * 6.2, 0.5, 0], '#85838c'); b.box(1.1, 0.25, 7.6, [sx * 6.2, 1.1, 0], '#9a97a2');
    for (const z of [-3, 3]) b.box(0.7, 1.7, 0.7, [sx * 6.2, 0.85, z], '#9a97a2');
  }
  return b.build();
}

/** A column drowned in sand: a mound, the shaft leaning out of it, a broken capital and a fallen drum. */
function buriedColumnGeo(): BufferGeometry {
  const b = new GB([0.74, 1.1]);
  b.ico(1.9, [0, 0.0, 0], '#e0bb78', [1.25, 0.55, 1.1], 1);
  b.cyl(0.6, 0.66, 2.7, 12, [0, 1.1, 0], '#b3ab9a', [0.1, 0, 0.12]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box(0.06, 2.5, 0.06, [Math.cos(a) * 0.6 + 0.12, 1.1, Math.sin(a) * 0.6], '#938c7c', [0.1, 0, 0.12]); }
  b.ico(0.62, [0.2, 2.45, 0.05], '#938c7c', [1, 0.5, 1], 0, [0.3, 0.2, 0.1]);
  b.cyl(0.55, 0.55, 1.1, 10, [1.7, 0.4, 0.8], '#a8a194', [0.2, 0.3, Math.PI / 2]);
  b.ico(0.5, [-1.4, 0.18, -0.6], '#d4ae6a', [1.4, 0.4, 1.1], 0);
  return b.build();
}

/** A glowing fissure across the road: dark scorched rim + zig-zag molten core (glow layer). */
function crackGeos(): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.9, 1.0]), g = new GB([1, 1]), rnd = mulberry32(99);
  let x = -9.5, z = 0;
  for (let k = 0; k < 11; k++) {
    const dz = (rnd() - 0.5) * 1.6, len = 1.9 + rnd() * 0.5, ang = Math.atan2(dz, len);
    const cx = x + len / 2, cz = z + dz / 2;
    b.box(len + 0.2, 0.05, 0.95 + rnd() * 0.5, [cx, 0.03, cz], '#120a08', [0, -ang, 0]);
    g.box(len, 0.06, 0.34 + rnd() * 0.16, [cx, 0.06, cz], '#ff6a1a', [0, -ang, 0]);
    g.box(len * 0.8, 0.07, 0.12, [cx, 0.075, cz], '#ffd070', [0, -ang, 0]);
    if (rnd() < 0.5) { const s = rnd() < 0.5 ? -1 : 1; g.box(1.3, 0.06, 0.18, [cx, 0.06, cz + s * 0.9], '#ff7a22', [0, -ang + s * 0.7, 0]); b.box(1.5, 0.05, 0.6, [cx, 0.03, cz + s * 0.9], '#120a08', [0, -ang + s * 0.7, 0]); }
    x += len; z += dz * 0.6;
  }
  return { body: b.build(), glow: g.build() };
}

/** Rocky steps: staggered slate slabs climbing across the road. */
function rockStepsGeo(): BufferGeometry {
  const b = new GB([0.75, 1.1]), rnd = mulberry32(31);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const w = 2.6 + rnd() * 0.8, h = 0.1 + r * 0.04;
    b.box(w, h, 1.1, [-5.2 + k * 3.4 + (r % 2) * 1.0, h / 2, -1.5 + r * 1.0], ['#7d8590', '#6e7681', '#8d8f94'][(r + k) % 3], [0, (rnd() - 0.5) * 0.15, 0]);
  }
  for (let k = 0; k < 6; k++) b.ico(0.3 + rnd() * 0.3, [(rnd() - 0.5) * 11, 0.12, (rnd() - 0.5) * 4], '#7a828c', [1, 0.6, 1], 0, [rnd(), rnd(), rnd()]);
  return b.build();
}

/** The wooden pier: planks, rails, posts down into the sea and lanterns, built along the path samples. World coordinates. */
function deckGeos(P: CampPath, t0: number, t1: number): { body: BufferGeometry; glow: BufferGeometry } {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]), rnd = mulberry32(2024), a = [0, 0, 0, 0, 0];
  const W = ['#8a5a30', '#7a4e2a', '#9a6a3a', '#85562e'];
  const s0 = t0 * P.len, s1 = t1 * P.len;
  let k = 0;
  for (let s = s0; s <= s1; s += 0.6, k++) {
    campAtS(P, s, a);
    const hw = a[4] + 0.3, yaw = Math.atan2(-a[2], -a[3]);
    b.box(hw * 2, 0.14, 0.52, [a[0], 0.1, a[1]], W[Math.floor(rnd() * 4)], [0, yaw, 0]);
  }
  k = 0;
  for (let s = s0; s <= s1; s += 3.0, k++) {
    campAtS(P, s, a);
    const hw = a[4] + 0.15, yaw = Math.atan2(-a[2], -a[3]);
    for (const side of [-1, 1]) {
      const px = a[0] - a[3] * side * hw, pz = a[1] + a[2] * side * hw;
      b.cyl(0.17, 0.21, 1.5, 7, [px, 0.8, pz], '#5a3a1e');
      b.cyl(0.2, 0.24, 2.4, 7, [px, -0.9, pz], '#4a301a');   // pile down into the water
      if (k % 2 === 1) { g.sph(0.17, [px, 1.7, pz], '#ffd890', 1, 6); }
      // rope rail to the next post
      if (s + 3.0 <= s1) {
        campAtS(P, s + 1.5, a);
        const hw2 = a[4] + 0.15, mx = a[0] - a[3] * side * hw2, mz = a[1] + a[2] * side * hw2, ry = -Math.atan2(a[3], a[2]);
        b.box(3.05, 0.07, 0.07, [mx, 1.15, mz], '#c9b27a', [0, ry, 0]);
      }
    }
    // cross beam under the deck
    b.box(hw * 2 + 0.4, 0.2, 0.3, [a[0], -0.1, a[1]], '#4a301a', [0, yaw, 0]);
  }
  // pier head: a wider square deck with bollards
  campAtS(P, s1, a);
  const yaw = Math.atan2(-a[2], -a[3]);
  b.box(8.6, 0.16, 5.0, [a[0], 0.09, a[1]], '#8f5f33', [0, yaw, 0]);
  for (const sx of [-3.9, 3.9]) for (const sz of [-1.9, 1.9]) {
    const wx = a[0] - a[3] * sx + a[2] * sz, wz = a[1] + a[2] * sx + a[3] * sz;   // lateral sx (right of travel), forward sz
    b.cyl(0.2, 0.26, 0.8, 7, [wx, 0.5, wz], '#4a301a');
  }
  return { body: b.build(), glow: g.build() };
}

export function CampPieces({ ver }: { ver: number }) {
  const res = useMemo(() => {
    const P = camp.cur; if (!P) return null;
    const lit = litMat({ roughness: 0.85 });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.4, 1.1) });
    const geos: Partial<Record<PieceType, BufferGeometry>> = {};
    const by: Record<string, { x: number; z: number; yaw: number; s: number }[]> = {};
    for (const pc of campBuilt.pieces) (by[pc.ty] ??= []).push(pc);
    const meshes: Mesh[] = [];
    const place = (ty: PieceType, geo: BufferGeometry, mat: Material): void => {
      const list = by[ty]; if (!list) return;
      const m = new InstancedMesh(geo, mat, list.length), o = new Object3D();
      list.forEach((p, i) => { o.position.set(p.x, 0, p.z); o.rotation.set(0, p.yaw, 0); o.scale.setScalar(p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.instanceMatrix.needsUpdate = true; m.castShadow = ty !== 'CRACK'; m.receiveShadow = true; meshes.push(m as unknown as Mesh);
    };
    if (by.GATE) { geos.GATE = gateGeo(); place('GATE', geos.GATE, lit); }
    if (by.STAIRS) { geos.STAIRS = stairsGeo(); place('STAIRS', geos.STAIRS, lit); }
    if (by.BURIED_COLUMN) { geos.BURIED_COLUMN = buriedColumnGeo(); place('BURIED_COLUMN', geos.BURIED_COLUMN, lit); }
    if (by.ROCK_STEPS) { geos.ROCK_STEPS = rockStepsGeo(); place('ROCK_STEPS', geos.ROCK_STEPS, lit); }
    if (by.CRACK) { const c = crackGeos(); place('CRACK', c.body, lit); place('CRACK', c.glow, glow); geos.CRACK = c.body; (geos as any).crackGlow = c.glow; }
    for (const r of P.layout.ribbons) {
      if (r.ty !== 'DECK') continue;
      const d = deckGeos(P, r.t0, r.t1);
      const mb = new Mesh(d.body, lit), mg = new Mesh(d.glow, glow);
      mb.castShadow = true; mb.receiveShadow = true; meshes.push(mb, mg);
      (geos as any).deckBody = d.body; (geos as any).deckGlow = d.glow;
    }
    return { meshes, geos, lit, glow };
  }, [ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (res) { for (const g of Object.values(res.geos)) (g as BufferGeometry).dispose(); res.lit.dispose(); res.glow.dispose(); } }, [res]);
  if (!res) return null;
  return <>{res.meshes.map((m, i) => <primitive key={i} object={m} />)}</>;
}

// ------------------------------------------------------------ void shards ---
export function CampShards({ ver }: { ver: number }) {
  const res = useMemo(() => {
    const n = campBuilt.shards.length; if (!n || !camp.cur) return null;
    const geo = new OctahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ color: '#4a2f8a', emissive: '#8a5cff', emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.2, flatShading: true });
    const m = new InstancedMesh(geo, mat, n); m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false;
    const rot = campBuilt.shards.map((s) => s.ph);
    return { m, geo, mat, rot };
  }, [ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  const o = useRef<Object3D>(null as unknown as Object3D);
  if (!o.current) o.current = new Object3D();
  useEffect(() => () => { if (res) { res.geo.dispose(); res.mat.dispose(); } }, [res]);
  useFrame(({ clock }) => {
    if (!res) return;
    const t = clock.elapsedTime, d = o.current, S = campBuilt.shards;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      d.position.set(s.x, s.y + Math.sin(t * s.sp + s.ph) * 0.35, s.z);
      d.rotation.set(0.4 + Math.sin(t * 0.3 + s.ph) * 0.2, t * 0.25 * s.sp + s.ph, 0.2);
      d.scale.set(s.s * 0.55, s.s * 1.5, s.s * 0.55);
      d.updateMatrix(); res.m.setMatrixAt(i, d.matrix);
    }
    res.m.instanceMatrix.needsUpdate = true;
  });
  if (!res) return null;
  return <primitive object={res.m} />;
}

