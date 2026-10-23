// Toy-clay tree geometry (owner reference sheet): round oak, layered pine, palm, blossom. Built once per piece (cached by the kit), baked to
// non-indexed float geometry with position / normal / color, like every other static kit piece, so ONE BatchedMesh draws them.
// Soft rounded chunky shapes, matte, dark underside + light top (vertex colours). Each tree is ~0.6k - 1.5k triangles.
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, LatheGeometry, SphereGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ToyKind = 'oak' | 'pine' | 'palm' | 'blossom';
export interface ToyBox { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }
export interface ToyCfg { kind: ToyKind; leaf: string; leaf2: string; trunk: string; tiers?: number; lean?: number; fruit?: string }

type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number, o: Color) => void;
const _c = new Color();

/** Bake a geometry to non-indexed position / normal / color (no uv), colours from `f`. */
function paint(g0: BufferGeometry, f: Paint): BufferGeometry {
  const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { f(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), _c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
}
const flat = (c: Color): Paint => (x, y, z, nx, ny, nz, o) => { o.copy(c); };

/** A foliage ball: dark underside (by normal and by height inside the whole crown) -> light top. */
function blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, dark: Color, light: Color, y0: number, y1: number, seg = 12, rings = 8): BufferGeometry {
  const g = new SphereGeometry(1, seg, rings); g.scale(rx, ry, rz); g.translate(cx, cy, cz);
  return paint(g, (x, y, z, nx, ny, nz, o) => {
    const h = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const k = Math.min(1, Math.max(0, 0.18 + 0.42 * h + 0.5 * (ny * 0.5 + 0.5) * (0.4 + 0.6 * h)));
    o.copy(dark).lerp(light, k);
  });
}

/** Short thick trunk, flared at the root (lathe with a bulging foot). */
function flareTrunk(cx: number, cz: number, h: number, w: number, col: Color): BufferGeometry {
  const pts = [new Vector2(0.001, 0), new Vector2(w * 1.75, 0), new Vector2(w * 1.35, h * 0.12), new Vector2(w * 0.95, h * 0.35), new Vector2(w * 0.85, h * 0.7), new Vector2(w * 0.95, h), new Vector2(0.001, h)];
  const g = new LatheGeometry(pts, 10); g.translate(cx, 0, cz);
  const dk = col.clone().multiplyScalar(0.8);
  return paint(g, (x, y, z, nx, ny, nz, o) => { o.copy(dk).lerp(col, Math.min(1, y / h)); });
}

function oak(cfg: ToyCfg, box: ToyBox, cx: number, cz: number, R: number, H: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const dark = new Color(cfg.leaf), light = new Color(cfg.leaf2);
  dark.multiplyScalar(0.72);
  const tw = Math.max(0.2, R * 0.2), th = H * 0.45;
  parts.push(flareTrunk(cx, cz, th, tw, new Color(cfg.trunk)));
  // crown: a cloud of overlapping balls (centre pile + a ring of lobes + top bumps)
  const top = H, ry = Math.min(H * 0.27, R * 0.78), cy = H - ry * 1.55, y0 = cy - ry * 1.25, y1 = H;
  const lobes: [number, number, number, number][] = [   // [angle, dist (of R), dy (of ry), size (of R)]
    [0.3, 0.74, -0.2, 0.56], [1.6, 0.72, -0.05, 0.54], [2.9, 0.72, -0.25, 0.58], [4.0, 0.74, -0.1, 0.54], [5.2, 0.7, 0.0, 0.56],
  ];
  parts.push(blob(cx, cy + ry * 0.1, cz, R * 0.85, ry * 1.2, R * 0.85, dark, light, y0, y1, 14, 9));
  for (const [a, d, dy, s] of lobes) parts.push(blob(cx + Math.cos(a) * R * d, cy + dy * ry, cz + Math.sin(a) * R * d, R * s, ry * 0.9 * (s / 0.56), R * s, dark, light, y0, y1));
  parts.push(blob(cx + R * 0.12, top - ry * 0.55, cz - R * 0.1, R * 0.5, ry * 0.7, R * 0.5, dark, light, y0, y1));
  parts.push(blob(cx - R * 0.38, top - ry * 0.85, cz + R * 0.25, R * 0.38, ry * 0.55, R * 0.38, dark, light, y0, y1, 9, 6));
  parts.push(blob(cx + R * 0.42, top - ry * 0.8, cz + R * 0.22, R * 0.36, ry * 0.5, R * 0.36, dark, light, y0, y1, 9, 6));
  if (cfg.fruit) {
    const fc = new Color(cfg.fruit);
    for (let i = 0; i < 6; i++) {
      const t = i * 2.4 + 0.5, hh = 0.1 + (i % 3) * 0.3, rr = R * 0.9 * Math.sqrt(1 - hh * hh) * 0.95;
      const sp = new SphereGeometry(Math.max(0.12, R * 0.075), 7, 5); sp.translate(cx + Math.cos(t) * rr, cy + ry * hh * 0.9 - ry * 0.15, cz + Math.sin(t) * rr); parts.push(paint(sp, flat(fc)));
    }
  }
  return parts;
}

/** 5-petal flower lying on the crown surface (petals = soft fan lobes, little centre), facing outward along (nx,ny,nz). */
function flower(px: number, py: number, pz: number, nx: number, ny: number, nz: number, r: number, spin: number, pet: Color, mid: Color): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  // tangent frame
  let ux = -nz, uy = 0, uz = nx; let ul = Math.hypot(ux, uz); if (ul < 1e-3) { ux = 1; uz = 0; ul = 1; } ux /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const P = (a: number, d: number, lift: number): number[] => { const ca = Math.cos(a + spin), sa = Math.sin(a + spin); return [px + (ux * ca + vx * sa) * d + nx * lift, py + (uy * ca + vy * sa) * d + ny * lift, pz + (uz * ca + vz * sa) * d + nz * lift]; };
  const tri = (a: number[], b: number[], c: number[], cc: Color): void => { for (const v of [a, b, c]) { pos.push(...v); nor.push(nx, ny, nz); col.push(cc.r, cc.g, cc.b); } };
  const hi = pet.clone().lerp(new Color('#ffffff'), 0.35);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, w = Math.PI / 5 * 0.95;
    const c0 = P(0, 0, r * 0.22), l = P(a - w * 0.62, r * 0.78, r * 0.06), t = P(a, r * 1.08, 0.0), rr = P(a + w * 0.62, r * 0.78, r * 0.06);
    tri(c0, l, t, hi); tri(c0, t, rr, hi);
  }
  for (let k = 0; k < 5; k++) { const a0 = (k / 5) * Math.PI * 2, a1 = ((k + 1) / 5) * Math.PI * 2; tri(P(0, 0, r * 0.4), P(a0, r * 0.26, r * 0.2), P(a1, r * 0.26, r * 0.2), mid); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(nor, 3)); g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g;
}

function blossom(cfg: ToyCfg, box: ToyBox, cx: number, cz: number, R: number, H: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const dark = new Color(cfg.leaf).multiplyScalar(0.8), light = new Color(cfg.leaf2);
  const tw = Math.max(0.2, R * 0.19), th = H * 0.5;
  parts.push(flareTrunk(cx, cz, th, tw, new Color(cfg.trunk)));
  // dark branch stubs holding the crown up
  const ry = Math.min(H * 0.27, R * 0.78), cy = H - ry * 1.55, y0 = cy - ry * 1.25, y1 = H;
  const balls: [number, number, number, number, number][] = [   // x, y, z (of R / ry), size (of R), yscale
    [0, 0, 0, 0.82, 1.15], [0.62, -0.1, 0.1, 0.52, 0.95], [-0.6, 0, 0.2, 0.52, 0.95], [0.1, -0.1, 0.62, 0.5, 0.9], [-0.1, 0.0, -0.64, 0.5, 0.95],
    [0.45, 0.05, -0.5, 0.45, 0.9], [-0.5, -0.1, -0.35, 0.44, 0.9], [0.15, 0.95, 0.0, 0.5, 0.7], [-0.38, 0.75, 0.25, 0.36, 0.6], [0.4, 0.75, 0.2, 0.36, 0.6],
  ];
  const cs: { x: number; y: number; z: number; r: number }[] = [];
  for (const [bx, by, bz, s, ys] of balls) {
    const x = cx + bx * R, y = cy + by * ry, z = cz + bz * R, rr = R * s, rY = ry * ys * (s / 0.52 > 1.2 ? 1 : 1) * (s > 0.7 ? 1 : s / 0.52 * 0.9);
    parts.push(blob(x, y, z, rr, rY, rr, dark, light, y0, y1, s > 0.7 ? 12 : 10, s > 0.7 ? 8 : 6)); cs.push({ x, y, z, r: rr });
  }
  // flowers: spread over the outer surface of the outer balls
  const pet = new Color(cfg.fruit || '#ffd9e6'), mid = new Color('#ffd35a');
  let n = 0;
  for (let i = 1; i < cs.length && n < 28; i++) {
    const b = cs[i], per = i > 6 ? 3 : 4;
    for (let j = 0; j < per; j++, n++) {
      const a = i * 2.1 + j * 2.6, el = 0.35 + ((i + j * 2) % 4) * 0.3;   // azimuth, elevation
      const nx = Math.cos(a) * Math.cos(el), ny = Math.sin(el), nz = Math.sin(a) * Math.cos(el);
      parts.push(flower(b.x + nx * b.r * 1.0, b.y + ny * b.r * 0.96, b.z + nz * b.r * 1.0, nx, ny, nz, Math.max(0.3, R * 0.2), i * 1.3 + j, pet, mid));
    }
  }
  return parts;
}

/** Layered pine: 5-6 stacked soft scalloped skirt tiers, wider at the bottom, little trunk at the foot. */
function pine(cfg: ToyCfg, box: ToyBox, cx: number, cz: number, R: number, H: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const dark = new Color(cfg.leaf).multiplyScalar(0.78), light = new Color(cfg.leaf2);
  const n = cfg.tiers ?? 6, th = H * 0.14, tw = Math.max(0.17, R * 0.15);
  parts.push(flareTrunk(cx, cz, th + 0.3, tw, new Color(cfg.trunk)));
  const base = th * 0.55, span = H - base;
  const SEG = 14, LOBES = 7;
  for (let t = 0; t < n; t++) {
    const f = t / (n - 1);                      // 0 bottom .. 1 top
    const r = R * (1 - 0.8 * f) * (t === n - 1 ? 0.95 : 1), y0 = base + span * 0.8 * f * (1 - 0.1 * f), h = span * (t === n - 1 ? 0.3 : 0.27);
    const pts = [new Vector2(0.001, y0 + h * 0.02), new Vector2(r * 0.86, y0 + h * 0.0), new Vector2(r * 1.0, y0 + h * 0.1), new Vector2(r * 0.94, y0 + h * 0.24),
      new Vector2(r * 0.66, y0 + h * 0.52), new Vector2(r * 0.36, y0 + h * 0.8), new Vector2(r * 0.1, y0 + h * 0.97), new Vector2(0.001, y0 + h)];
    const g = new LatheGeometry(pts, SEG);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {   // scalloped skirt: radius wobbles with angle, mostly at the hem
      const x = p.getX(i), z = p.getZ(i), rad = Math.hypot(x, z); if (rad < 1e-4) continue;
      const hem = Math.max(0, 1 - (p.getY(i) - y0) / (h * 0.5));
      const k = 1 + 0.17 * hem * Math.cos(Math.atan2(z, x) * LOBES);
      p.setX(i, x * k); p.setZ(i, z * k);
      p.setY(i, p.getY(i) - 0.09 * r * hem * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * LOBES)));
    }
    g.computeVertexNormals(); g.translate(cx, 0, cz);
    const yy0 = y0, yy1 = y0 + h;
    parts.push(paint(g, (x, y, z, nx, ny, nz, o) => {
      const k = Math.min(1, Math.max(0, (y - yy0) / (yy1 - yy0))), g2 = f * 0.25;   // dark skirt hem, lighter on top (and a bit lighter up the tree)
      o.copy(dark).lerp(light, 0.1 + k * 0.75 + g2 * 0.4);
    }));
  }
  return parts;
}

/** Palm: gently curved trunk of stacked rings, crown of big soft drooping fronds. The box is asymmetric (the trunk leans toward +x). */
function palm(cfg: ToyCfg, box: ToyBox, H: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const lean = cfg.lean ?? 1.0, N = 9, tt = new Color(cfg.trunk), dark = new Color(cfg.leaf).multiplyScalar(0.7), light = new Color(cfg.leaf2);
  const th = H * 0.8, pt = (t: number): [number, number] => [lean * t * t * 1.15, th * t];   // trunk centre line (x, y)
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, [x, y] = pt(t), rr = 0.5 - 0.15 * t, hh = (th / N) * 0.82;
    const g = new SphereGeometry(1, 9, 5); g.scale(rr * (i === 0 ? 1.35 : 1), hh, rr * (i === 0 ? 1.35 : 1)); g.translate(x, y, 0);
    const c = tt.clone().multiplyScalar(i % 2 ? 0.86 : 1.04);
    parts.push(paint(g, (px, py, pz, nx, ny, nz, o) => { o.copy(c).multiplyScalar(0.8 + 0.2 * (ny * 0.5 + 0.5)); }));
  }
  const [crX, crY] = pt(1);
  const cb = new SphereGeometry(0.62, 9, 6); cb.translate(crX, crY + 0.05, 0); parts.push(paint(cb, (x, y, z, nx, ny, nz, o) => { o.copy(dark).lerp(light, 0.4); }));
  const nutC = new Color('#7a4e2c');
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4, nt = new SphereGeometry(0.2, 7, 5); nt.translate(crX + Math.cos(a) * 0.42, crY - 0.3, Math.sin(a) * 0.42); parts.push(paint(nt, flat(nutC))); }
  const F = 8, L = 2.45;
  for (let k = 0; k < F; k++) {
    const yaw = (k / F) * Math.PI * 2 + (k % 2) * 0.12, droop = 0.34 + 0.28 * (k % 2), len = L * (k % 2 ? 0.88 : 1);
    const g = new SphereGeometry(1, 9, 6); g.scale(0.95, 0.26, len);      // a fat leaf pointing +z
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {   // arch + droop: the tip bends down, the sides curl down a little
      const z = p.getZ(i) + len, x = p.getX(i), y0 = p.getY(i), tz = z / (2 * len);
      p.setY(i, y0 + 0.3 * Math.sin(Math.min(1, tz * 1.6) * 1.6) - droop * 2.6 * Math.pow(tz, 1.6) * len * 0.5 - 0.18 * x * x);
      p.setZ(i, z);
    }
    g.computeVertexNormals();
    g.rotateY(yaw); g.translate(crX, crY, 0);
    const cy = crY;
    parts.push(paint(g, (x, y, z, nx, ny, nz, o) => { const k2 = Math.min(1, Math.max(0, 0.35 + 0.65 * (ny * 0.5 + 0.5) + (y - cy) * 0.05)); o.copy(dark).lerp(light, k2); }));
  }
  return parts;
}

export function toyTree(cfg: ToyCfg, box: ToyBox): BufferGeometry {
  const H = box.maxY, R = Math.min(box.maxX - box.minX, box.maxZ - box.minZ) * 0.5 * 0.98;
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  const parts = cfg.kind === 'oak' ? oak(cfg, box, cx, cz, R, H) : cfg.kind === 'blossom' ? blossom(cfg, box, cx, cz, R, H) : cfg.kind === 'pine' ? pine(cfg, box, cx, cz, R, H) : palm(cfg, box, H);
  const g = mergeGeometries(parts, false); for (const q of parts) q.dispose(); g.computeBoundingSphere(); return g;
}
