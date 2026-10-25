// Hand-built props of the castle wings (render/CastleInterior.tsx): everything the Blender kit v3 has no piece for (long banquet table, chairs,
// food, kitchen counters + island, writing desks, armchairs, nightstands, bench, oval rugs, treasure chests, gold heaps, crown pedestal,
// globes, mirror). Built from rounded primitives (RoundedBoxGeometry / low-poly cylinders + spheres), baked ONCE into a lit body geometry
// and a glow geometry (candle flames, gems) with vertex colours, so the whole set is two draw calls using the shared kit materials.
// No per-frame work. Positions come from engine/castleData.ts (the same lists drive the colliders).
import { BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, SphereGeometry, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DINING_TABLE, DINING_CHAIRS, DINING_SIDEBOARDS, DINING_CANDLES, KITCHEN_COUNTERS, KITCHEN_ISLAND, LIBRARY_DESK, LIBRARY_ARMCHAIRS, LIBRARY_GLOBE,
  BEDROOM_NIGHTSTANDS, BEDROOM_BENCH, BEDROOM_ARMCHAIRS, BEDROOM_VANITY, BEDROOM_RUG, BEDROOM_BED, STUDY_DESK, STUDY_MAP_TABLE, STUDY_CHAIRS, STUDY_GLOBE, STUDY_ARMCHAIRS,
  TREASURY_CHESTS, TREASURY_GOLD, TREASURY_PEDESTAL, LIBRARY_RUG,
} from '../engine/castleData';

const PI = Math.PI;
const WOOD = '#d99a55', WOOD_D = '#b9763c', CREAM = '#fff3dc', RED = '#e2605a', ROSE = '#f0a0b0', TEAL = '#58b6a8', GOLD = '#ffc83d', GOLD_D = '#e0a526';

const bodyP: BufferGeometry[] = [], glowP: BufferGeometry[] = [];
const G = { x: 0, y: 0, z: 0, yaw: 0, sc: 1 };
const _e = new Euler(), _l = new Matrix4(), _w = new Matrix4(), _s = new Matrix4(), _t = new Matrix4(), _r = new Matrix4(), _c = new Color();
/** Set the group transform every following part is placed in (local +z = the prop's front). */
function at(x: number, z: number, yaw = 0, sc = 1, y = 0): void { G.x = x; G.z = z; G.yaw = yaw; G.sc = sc; G.y = y; }
interface Opt { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; glow?: boolean; pv?: [number, number, number]; pa?: number }

/** Colour a primitive, move it to its local spot (x, y, z = its centre) inside the group transform and queue it. */
function put(geo: BufferGeometry, color: string | number, x: number, y: number, z: number, o: Opt = {}): void {
  _l.makeRotationFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
  if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) { _s.makeScale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1); _l.multiply(_s); }
  _l.setPosition(x, y, z);
  if (o.pv) {   // swing about a pivot (lids): P = T(pv) Rx(pa) T(-pv)
    const [px, py, pz] = o.pv;
    _r.makeTranslation(px, py, pz); _t.makeRotationX(o.pa ?? 0); _r.multiply(_t); _t.makeTranslation(-px, -py, -pz); _r.multiply(_t); _l.premultiply(_r);
  }
  _w.makeRotationY(G.yaw); _s.makeScale(G.sc, G.sc, G.sc); _w.multiply(_s); _w.setPosition(G.x, G.y, G.z);
  geo.applyMatrix4(_w.multiply(_l));
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, nr = g.attributes.normal, col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    const k = o.glow ? 1 : 0.8 + 0.2 * (nr.getY(i) * 0.5 + 0.5);   // soft top-light baked in
    col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  (o.glow ? glowP : bodyP).push(g);
}
/** Rounded box standing on y0 (bottom), centred on x / z. */
const rbox = (w: number, h: number, d: number, r: number, color: string | number, x: number, y0: number, z: number, o: Opt = {}) =>
  put(new RoundedBoxGeometry(w, h, d, r > 0.06 && Math.min(w, h, d) > 0.3 ? 2 : 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), color, x, y0 + h / 2, z, o);
/** Cylinder standing on y0. */
const cyl = (rt: number, rb: number, h: number, color: string | number, x: number, y0: number, z: number, o: Opt = {}, seg = 10) => put(new CylinderGeometry(rt, rb, h, seg), color, x, y0 + h / 2, z, o);
/** Ball centred at y. */
const ball = (r: number, color: string | number, x: number, y: number, z: number, o: Opt = {}) => put(new SphereGeometry(r, 9, 6), color, x, y, z, o);
const flame = (x: number, y: number, z: number, s = 1) => ball(0.07 * s, '#ffb347', x, y, z, { glow: true, sy: 1.6 });
const gem = (x: number, y: number, z: number, color: string, r = 0.07) => put(new SphereGeometry(r, 5, 3), color, x, y, z, { glow: true });

// ---------------------------------------------------------------------------------------------- small pieces
function chair(x: number, z: number, yaw: number, cushion = RED, wood = WOOD_D): void {
  at(x, z, yaw);
  for (const sx of [-0.32, 0.32]) for (const sz of [-0.32, 0.32]) cyl(0.055, 0.045, 0.56, wood, sx, 0, sz, {}, 6);
  rbox(0.82, 0.14, 0.82, 0.05, WOOD, 0, 0.55, 0);
  rbox(0.68, 0.1, 0.68, 0.045, cushion, 0, 0.69, 0.02);
  rbox(0.82, 0.88, 0.12, 0.05, wood, 0, 0.62, -0.36);
  rbox(0.5, 0.44, 0.05, 0.03, cushion, 0, 0.9, -0.3);
  for (const sx of [-0.4, 0.4]) ball(0.07, GOLD, sx, 1.52, -0.36);
}
function candelabra(x: number, y: number, z: number): void {
  at(x, z, 0, 1, y);
  cyl(0.3, 0.34, 0.06, GOLD_D, 0, 0, 0);
  cyl(0.05, 0.07, 0.3, GOLD, 0, 0.06, 0, {}, 6);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094, cx = Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17;
    cyl(0.055, 0.055, 0.38, CREAM, cx, 0.06, cz, {}, 6); flame(cx, 0.52, cz);
  }
  cyl(0.055, 0.055, 0.5, CREAM, 0, 0.36, 0, {}, 6); flame(0, 0.92, 0);
}
function plate(x: number, y: number, z: number, food: number): void {
  at(x, z, 0, 1, y);
  cyl(0.3, 0.26, 0.05, CREAM, 0, 0, 0, {}, 12);
  if (food === 0) { ball(0.2, '#c9733a', 0, 0.18, 0, { sx: 1.25, sy: 0.85 }); cyl(0.045, 0.06, 0.3, '#f6e7cf', 0.28, 0.1, 0.05, { rz: 1.2 }, 6); }   // roast + bone
  else if (food === 1) { rbox(0.46, 0.16, 0.22, 0.07, '#e8b361', 0, 0.05, 0, { ry: 0.3 }); rbox(0.3, 0.12, 0.2, 0.06, '#f0c47a', 0.06, 0.18, 0.02, { ry: 0.3 }); }   // loaf
  else if (food === 2) { for (let i = 0; i < 3; i++) ball(0.12, ['#ee5b5b', '#ffd75a', '#9fd466'][i], Math.cos(i * 2.1) * 0.12, 0.17, Math.sin(i * 2.1) * 0.12); }   // fruit
  else { cyl(0.2, 0.2, 0.1, '#ffe07a', 0, 0.05, 0, {}, 10); put(new CylinderGeometry(0.2, 0.2, 0.1, 3), '#fff0a8', 0.1, 0.1, 0, { rz: 0 }); }   // cheese
}
function goblet(x: number, y: number, z: number): void { at(x, z, 0, 1, y); cyl(0.1, 0.06, 0.2, GOLD, 0, 0.1, 0, {}, 8); cyl(0.025, 0.025, 0.1, GOLD_D, 0, 0, 0, {}, 5); cyl(0.07, 0.07, 0.02, GOLD_D, 0, 0, 0, {}, 8); }
function jug(x: number, y: number, z: number, color = '#7bb3e0'): void { at(x, z, 0, 1, y); ball(0.2, color, 0, 0.22, 0, { sy: 1.1 }); cyl(0.08, 0.1, 0.16, color, 0, 0.4, 0, {}, 8); ball(0.05, color, 0.18, 0.28, 0, { sy: 1.4 }); }
function fruitBowl(x: number, y: number, z: number): void {
  at(x, z, 0, 1, y);
  cyl(0.4, 0.24, 0.24, TEAL, 0, 0, 0, {}, 12);
  const cs = ['#ee5b5b', '#ffd75a', '#9fd466', '#ff9a3c', '#ee5b5b', '#c46bd6'];
  for (let i = 0; i < 6; i++) ball(0.15, cs[i], Math.cos(i * 1.05) * 0.2, 0.28 + (i % 2) * 0.07, Math.sin(i * 1.05) * 0.2);
}
function book(x: number, y: number, z: number, color: string, ry = 0, w = 0.34, h = 0.08, d = 0.24): void { at(x, z, 0, 1, y); rbox(w, h, d, 0.025, color, 0, 0, 0, { ry }); }
function globe(x: number, z: number): void {
  at(x, z);
  cyl(0.38, 0.44, 0.1, WOOD_D, 0, 0, 0, {}, 10);
  cyl(0.06, 0.08, 0.7, GOLD_D, 0, 0.1, 0, {}, 6);
  ball(0.5, '#6cc3e8', 0, 1.2, 0);
  ball(0.22, '#9fd466', 0.18, 1.3, 0.38, { sz: 0.45, sy: 1.2 }); ball(0.2, '#9fd466', -0.3, 1.1, 0.34, { sz: 0.45 }); ball(0.16, '#f6e7cf', 0, 1.62, 0.1, { sy: 0.5 });
  put(new TorusGeometry(0.58, 0.03, 5, 22), GOLD, 0, 1.2, 0, { ry: 1.5708, rz: 0.4 });
}
function rug(x: number, z: number, rx: number, rz: number, colors: string[], yaw = 0): void {
  at(x, z, yaw);
  colors.forEach((c, i) => { const k = 1 - i * (0.34 / colors.length); cyl(1, 1, 0.02, c, 0, 0.012 + i * 0.012, 0, { sx: rx * k, sz: rz * k }, 26); });
}
function armchair(x: number, z: number, yaw: number, color: string): void {
  at(x, z, yaw);
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.36, 0.36]) ball(0.07, GOLD_D, sx, 0.06, sz);
  rbox(1.0, 0.36, 0.96, 0.12, color, 0, 0.1, 0);
  rbox(0.78, 0.18, 0.74, 0.08, '#fff0ee', 0, 0.44, 0.06);
  rbox(1.0, 0.95, 0.26, 0.12, color, 0, 0.3, -0.4);
  for (const sx of [-0.46, 0.46]) rbox(0.2, 0.52, 0.94, 0.09, color, sx, 0.3, 0.02);
}
/** Writing desk, front (+z) toward the room, with books / candle / quill on top. */
function desk(x: number, z: number, yaw: number, len: number, items = 0): void {
  at(x, z, yaw);
  rbox(len, 0.1, 1.1, 0.045, '#e3a566', 0, 0.84, 0);
  for (const sx of [-1, 1]) {
    rbox(0.95, 0.84, 1.0, 0.06, WOOD_D, sx * (len / 2 - 0.55), 0, 0);
    for (const sy of [0.12, 0.46]) { rbox(0.78, 0.3, 0.04, 0.02, '#f2c38a', sx * (len / 2 - 0.55), sy, 0.5); ball(0.04, GOLD, sx * (len / 2 - 0.55), sy + 0.15, 0.54); }
  }
  rbox(len - 1.7, 0.12, 0.08, 0.03, WOOD_D, 0, 0.62, -0.46);
  const y = 0.94;
  const cx = len / 2 - 0.55;
  if (items === 0) {   // library: book stack, open book, candle
    at(x, z, yaw); rbox(0.3, 0.09, 0.24, 0.03, TEAL, -cx, y, 0.05); rbox(0.28, 0.09, 0.22, 0.03, '#f6c85f', -cx, y + 0.09, 0.05, { ry: 0.3 }); rbox(0.3, 0.08, 0.22, 0.03, RED, -cx, y + 0.18, 0.04, { ry: -0.2 });
    rbox(0.46, 0.04, 0.34, 0.02, CREAM, 0.1, y, 0.1); rbox(0.01, 0.045, 0.34, 0, '#c9a37a', 0.1, y, 0.1);
    cyl(0.07, 0.07, 0.24, CREAM, cx, y, 0.1, {}, 6); flame(cx, y + 0.3, 0.1);
  } else {   // study: scrolls, ink + quill, lamp
    at(x, z, yaw); cyl(0.06, 0.06, 0.6, '#f6e7cf', -cx + 0.2, y + 0.07, 0.1, { rz: 1.5708, ry: 0.2 }, 8); cyl(0.065, 0.065, 0.2, RED, -cx + 0.2, y + 0.07, 0.1, { rz: 1.5708, ry: 0.2 }, 8);
    rbox(0.8, 0.03, 0.6, 0.015, '#f3e2bd', 0.2, y, 0.05, { ry: 0.1 });
    ball(0.08, '#3c3c6e', 0.8, y + 0.08, 0.2); cyl(0.012, 0.004, 0.5, '#ffffff', 0.86, y + 0.1, 0.22, { rz: -0.5 }, 4);
    cyl(0.1, 0.12, 0.05, GOLD_D, cx, y, 0.1, {}, 8); cyl(0.03, 0.03, 0.34, GOLD, cx, y + 0.05, 0.1, {}, 5); cyl(0.07, 0.07, 0.2, CREAM, cx, y + 0.38, 0.1, {}, 6); flame(cx, y + 0.65, 0.1, 1.2);
    for (let i = 0; i < 3; i++) rbox(0.34, 0.08, 0.24, 0.03, [RED, TEAL, '#f6c85f'][i], -cx + 0.1, y + i * 0.08, -0.25, { ry: i * 0.2 - 0.2 });
  }
}
function counter(x: number, z: number, len: number, kind: number): void {
  at(x, z, PI / 2);
  rbox(len, 0.95, 0.9, 0.07, '#f6e4c0', 0, 0, 0);
  for (let i = 0; i < 3; i++) { rbox(len / 3 - 0.2, 0.58, 0.05, 0.03, '#e8b87c', (i - 1) * len / 3, 0.18, 0.45); ball(0.045, GOLD, (i - 1) * len / 3, 0.5, 0.5); }
  rbox(len + 0.1, 0.1, 1.0, 0.05, '#c98a4b', 0, 0.95, 0);
  const y = 1.05;
  if (kind === 0) {   // bread + cheese + a rolling pin
    for (let i = 0; i < 3; i++) rbox(0.5, 0.2, 0.26, 0.09, '#e8b361', -1.2 + i * 0.42, y, -0.1 + (i % 2) * 0.12, { ry: 0.2 * i });
    cyl(0.25, 0.25, 0.16, '#ffe07a', 0.3, y, 0.0, {}, 12); cyl(0.07, 0.07, 0.8, '#d9b27c', 1.1, y + 0.07, 0.1, { rz: 1.5708 }, 6);
    ball(0.12, '#ee5b5b', -0.4, y + 0.12, 0.3); ball(0.12, '#9fd466', -0.2, y + 0.12, 0.34);
  } else {   // pots + a basket of apples
    for (const px of [-1.2, -0.2]) { cyl(0.26, 0.22, 0.3, '#d98a4e', px, y, 0, {}, 10); cyl(0.28, 0.28, 0.04, '#c46f36', px, y + 0.3, 0, {}, 10); ball(0.05, GOLD, px, y + 0.36, 0); }
    cyl(0.4, 0.3, 0.26, '#c98a4b', 0.9, y, 0.05, {}, 10);
    for (let i = 0; i < 5; i++) ball(0.13, i % 2 ? '#ee5b5b' : '#9fd466', 0.9 + Math.cos(i * 1.3) * 0.2, y + 0.3, 0.05 + Math.sin(i * 1.3) * 0.2);
  }
}

// ---------------------------------------------------------------------------------------------- bigger pieces
function longTable(): void {
  const { x, z, len, w } = DINING_TABLE;
  at(x, z);
  rbox(len, 0.16, w, 0.07, '#dba15f', 0, 0.98, 0);
  rbox(len + 0.1, 0.05, w + 0.1, 0.02, '#c98a4b', 0, 0.94, 0);
  rbox(len * 0.92, 0.03, w * 0.42, 0.012, RED, 0, 1.14, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(0.34, 0.95, 0.34, 0.12, WOOD_D, sx * (len / 2 - 0.7), 0, sz * (w / 2 - 0.3));
  rbox(len - 1.6, 0.14, 0.12, 0.04, WOOD_D, 0, 0.55, 0);
  const y = 1.17;
  const plates = [-4.7, -3.5, -2.3, -1.1, 0.1, 1.3, 2.5, 3.7, 4.9];
  plates.forEach((px, i) => { plate(x + px, y, z + (i % 2 ? 0.62 : -0.62), i % 4); });
  fruitBowl(x - 1.75, y, z); fruitBowl(x + 1.75, y, z);
  jug(x - 3.6, y, z + 0.05); jug(x + 3.6, y, z - 0.05, '#e8a0c0'); jug(x + 0.05, y, z + 0.05, '#7bb3e0');
  for (const [cx, cz] of DINING_CANDLES) candelabra(cx, y, cz);
  for (const [cx, cz, yaw] of DINING_CHAIRS) if (Math.abs(Math.sin(yaw)) < 0.5) goblet(cx + 0.4, y, z + (cz < z ? -0.95 : 0.95));
}
function sideboard(x: number, z: number): void {
  at(x, z);
  rbox(3.3, 1.2, 1.0, 0.08, '#f0c488', 0, 0, 0);
  rbox(3.5, 0.1, 1.1, 0.05, '#c98a4b', 0, 1.2, 0);
  for (let i = 0; i < 3; i++) { rbox(0.95, 0.85, 0.05, 0.03, '#d99a55', (i - 1) * 1.05, 0.15, 0.51); ball(0.05, GOLD, (i - 1) * 1.05 + 0.3, 0.58, 0.56); }
  cyl(0.42, 0.34, 0.06, GOLD, -0.9, 1.3, 0, {}, 12); for (let i = 0; i < 4; i++) ball(0.14, ['#ee5b5b', '#ffd75a', '#9fd466', '#ff9a3c'][i], -0.9 + Math.cos(i * 1.6) * 0.17, 1.5, Math.sin(i * 1.6) * 0.17);
  jug(0.5, 1.3, 0.0, '#e8a0c0'); ball(0.12, '#ff7aa8', 0.5, 1.95, 0); ball(0.1, '#ffd75a', 0.64, 1.88, 0.06); ball(0.1, '#ffffff', 0.38, 1.9, -0.05);
  for (const sx of [1.05, 1.45]) cyl(0.3, 0.3, 0.04, CREAM, sx, 1.3, 0.1, { rx: 1.2 }, 12);
}
function island(): void {
  const { x, z, len, w } = KITCHEN_ISLAND;
  at(x, z);
  rbox(len - 0.2, 0.95, w - 0.2, 0.08, '#f6e4c0', 0, 0, 0);
  for (let i = 0; i < 3; i++) { rbox(len / 3 - 0.3, 0.55, 0.05, 0.03, '#e8b87c', (i - 1) * (len / 3), 0.2, w / 2 - 0.08); ball(0.04, GOLD, (i - 1) * (len / 3), 0.5, w / 2 - 0.04); }
  rbox(len, 0.1, w, 0.05, '#d8a066', 0, 0.95, 0);
  const y = 1.05;
  rbox(0.9, 0.05, 0.6, 0.025, '#f1d3a0', -0.9, y, 0.1);   // chopping board with veg
  for (let i = 0; i < 3; i++) cyl(0.05, 0.02, 0.38, '#ff9a3c', -1.15 + i * 0.12, y + 0.07, 0.1 + i * 0.05, { rz: 1.5708, ry: 0.3 }, 6);
  ball(0.17, '#7fd36b', -0.55, y + 0.2, 0.1); ball(0.12, '#ee5b5b', -0.3, y + 0.14, 0.25);
  cyl(0.45, 0.32, 0.3, '#ffffff', 0.45, y, 0, {}, 14); ball(0.34, '#ffe9b0', 0.45, y + 0.28, 0, { sy: 0.2 });   // mixing bowl with dough
  cyl(0.06, 0.06, 0.7, '#d9b27c', 1.15, y + 0.06, 0.2, { rz: 1.5708, ry: 0.5 }, 6);
}
function bedroomBits(): void {
  for (const [x, z] of BEDROOM_NIGHTSTANDS) {
    at(x, z);
    rbox(0.95, 0.86, 0.75, 0.07, '#f0c488', 0, 0, 0); rbox(0.8, 0.28, 0.04, 0.02, '#d99a55', 0, 0.45, 0.39); ball(0.04, GOLD, 0, 0.6, 0.42);
    rbox(1.02, 0.08, 0.82, 0.04, '#c98a4b', 0, 0.86, 0);
    cyl(0.1, 0.12, 0.05, GOLD_D, -0.15, 0.94, 0, {}, 8); cyl(0.06, 0.06, 0.26, CREAM, -0.15, 0.99, 0, {}, 6); flame(-0.15, 1.34, 0);
    book(0.22, 0.94, 0.05, ROSE, 0.3);
  }
  const b = BEDROOM_BENCH;
  at(b.x, b.z);
  rbox(3.1, 0.14, 0.86, 0.06, WOOD, 0, 0.5, 0); rbox(2.9, 0.12, 0.7, 0.05, ROSE, 0, 0.64, 0);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.3, 0.3]) cyl(0.07, 0.05, 0.5, WOOD_D, sx, 0, sz, {}, 6);
  armchair(BEDROOM_ARMCHAIRS[0][0], BEDROOM_ARMCHAIRS[0][1], BEDROOM_ARMCHAIRS[0][2], TEAL); armchair(BEDROOM_ARMCHAIRS[1][0], BEDROOM_ARMCHAIRS[1][1], BEDROOM_ARMCHAIRS[1][2], TEAL);
  // vanity: a desk along the hall wall with a round mirror and little bottles
  const v = BEDROOM_VANITY;
  desk(v.x, v.z, PI / 2, 2.4, 2);
  at(v.x, v.z, PI / 2);
  put(new TorusGeometry(0.62, 0.07, 6, 22), GOLD, 0, 2.2, -0.42, { sy: 1.25 });
  cyl(0.6, 0.6, 0.03, '#cfeaff', 0, 2.2 - 0.0, -0.42, { rx: 1.5708, sy: 1, sz: 1.25 }, 20);
  for (let i = 0; i < 3; i++) { cyl(0.1, 0.1, 0.2, ['#ff9ac0', '#9ad0ff', '#c8a0ff'][i], -0.7 + i * 0.28, 0.94, -0.2, {}, 8); ball(0.06, GOLD, -0.7 + i * 0.28, 1.2, -0.2); }
  at(v.x + 1.55, v.z, PI / 2); cyl(0.38, 0.34, 0.5, ROSE, 0, 0, 0, {}, 12); cyl(0.4, 0.4, 0.1, '#ffc7d6', 0, 0.5, 0, {}, 12);
}
function chest(x: number, z: number, yaw: number, open: boolean): void {
  at(x, z, yaw);
  rbox(1.55, 0.72, 1.0, 0.1, WOOD_D, 0, 0, 0);
  for (const sx of [-0.5, 0.5]) rbox(0.14, 0.76, 1.06, 0.05, GOLD, sx, -0.01, 0);
  rbox(1.6, 0.1, 1.05, 0.05, GOLD_D, 0, 0.62, 0);
  if (!open) {
    put(new CylinderGeometry(0.5, 0.5, 1.55, 14, 1, false, 0, PI), WOOD, 0, 0.72, 0, { rz: PI / 2 });
    for (const sx of [-0.5, 0.5]) put(new CylinderGeometry(0.52, 0.52, 0.14, 14, 1, false, 0, PI), GOLD, sx, 0.72, 0, { rz: PI / 2 });
    rbox(0.22, 0.26, 0.08, 0.04, GOLD, 0, 0.58, 0.52); ball(0.04, '#7a4b1c', 0, 0.55, 0.57);
  } else {
    ball(0.7, GOLD, 0, 0.7, 0, { sy: 0.32, sz: 0.6 }); ball(0.35, GOLD_D, -0.4, 0.78, 0.1, { sy: 0.7 }); ball(0.3, '#ffd96a', 0.35, 0.82, -0.05, { sy: 0.7 });
    gem(0.1, 0.98, 0.1, '#ff6fa8', 0.09); gem(-0.3, 0.98, 0.2, '#6fd8ff', 0.08); gem(0.5, 0.92, 0.2, '#9dff8a', 0.07);
    // the lid swung open behind the chest
    put(new CylinderGeometry(0.5, 0.5, 1.55, 14, 1, false, 0, PI), WOOD, 0, 0.72, 0, { rz: PI / 2, pv: [0, 0.72, -0.5], pa: -1.9 });
  }
}
function goldHeap(x: number, z: number, s: number): void {
  at(x, z, 0, s);
  ball(0.95, GOLD, 0, 0.45, 0, { sy: 0.62 }); ball(0.55, '#ffd96a', 0.3, 0.8, 0.1, { sy: 0.8 }); ball(0.45, GOLD_D, -0.45, 0.35, 0.3, { sy: 0.7 });
  for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.3; ball(0.38, i % 2 ? GOLD : '#ffd96a', Math.cos(a) * 0.85, 0.2, Math.sin(a) * 0.8, { sy: 0.6 }); }
  for (let i = 0; i < 9; i++) { const a = i * 2.4; cyl(0.15, 0.15, 0.04, i % 2 ? GOLD_D : '#ffe27a', Math.cos(a) * (0.9 + (i % 3) * 0.25), 0.04 + (i % 2) * 0.03, Math.sin(a) * (0.8 + (i % 3) * 0.2), { rx: 0.2 * (i % 3) }, 8); }
  gem(0.15, 1.0, 0.1, '#ff6fa8', 0.1); gem(-0.35, 0.72, 0.4, '#6fd8ff', 0.09); gem(0.55, 0.55, 0.45, '#9dff8a', 0.08); gem(-0.6, 0.5, -0.2, '#fff27a', 0.08);
}
function pedestal(): void {
  const { x, z } = TREASURY_PEDESTAL;
  at(x, z);
  cyl(0.8, 0.9, 0.2, '#efe6d2', 0, 0, 0, {}, 14); cyl(0.5, 0.58, 0.9, '#f8f1e0', 0, 0.2, 0, {}, 14); cyl(0.72, 0.58, 0.14, '#efe6d2', 0, 1.1, 0, {}, 14);
  cyl(0.45, 0.5, 0.12, RED, 0, 1.24, 0, {}, 12);   // velvet cushion
  cyl(0.34, 0.38, 0.26, GOLD, 0, 1.36, 0, {}, 12);   // the crown
  for (let i = 0; i < 5; i++) { const a = i * 1.2566, cx = Math.cos(a) * 0.34, cz = Math.sin(a) * 0.34; put(new CylinderGeometry(0, 0.1, 0.3, 5), GOLD, cx, 1.78, cz); gem(cx, 1.96, cz, ['#ff6fa8', '#6fd8ff', '#9dff8a', '#fff27a', '#c8a0ff'][i], 0.08); }
  gem(0, 1.5, 0.37, '#ff4f7a', 0.1);
}
function bookPiles(): void {
  // a few gold-spined stacks on the library floor corner + the study table (cute clutter)
  const cols = [RED, TEAL, '#f6c85f', '#9b7be0', ROSE];
  for (let k = 0; k < 2; k++) { const bx = k ? -17.0 : -23.4, bz = k ? 18.7 : 18.5; for (let i = 0; i < 4; i++) book(bx, i * 0.1, bz, cols[(i + k) % 5], i * 0.4 - 0.5, 0.6, 0.1, 0.42); }
}
function mapTable(): void {
  const { x, z } = STUDY_MAP_TABLE;
  at(x, z);
  rbox(2.8, 0.14, 1.8, 0.07, '#dba15f', 0, 0.96, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(0.3, 0.96, 0.3, 0.1, WOOD_D, sx * 1.2, 0, sz * 0.7);
  const y = 1.1;
  rbox(2.2, 0.03, 1.4, 0.015, '#f6e6bc', 0, y, 0); rbox(1.4, 0.035, 0.9, 0.015, '#bfe3a0', -0.2, y + 0.005, 0.05); rbox(0.5, 0.036, 0.4, 0.015, '#8fd0ee', 0.5, y + 0.006, -0.2);
  ball(0.08, RED, -0.3, y + 0.16, 0.1); cyl(0.012, 0.012, 0.16, '#ffffff', -0.3, y, 0.1, {}, 4);
  ball(0.08, '#4f8cf0', 0.6, y + 0.16, 0.1); cyl(0.012, 0.012, 0.16, '#ffffff', 0.6, y, 0.1, {}, 4);
  cyl(0.06, 0.06, 0.8, '#f6e7cf', 0.9, y + 0.06, -0.5, { rz: 1.5708, ry: 0.4 }, 8);
  cyl(0.1, 0.12, 0.05, GOLD_D, 1.1, y, 0.4, {}, 8); cyl(0.06, 0.06, 0.22, CREAM, 1.1, y + 0.05, 0.4, {}, 6); flame(1.1, y + 0.32, 0.4);
}

/** Build every wing prop once. Caller owns (and disposes) the two geometries; `glow` is null when empty. */
export function buildWingProps(): { body: BufferGeometry; glow: BufferGeometry | null } {
  bodyP.length = 0; glowP.length = 0;
  longTable();
  for (const [x, z, yaw] of DINING_CHAIRS) chair(x, z, yaw, [RED, TEAL][Math.abs(Math.round(x)) % 2]);
  for (const [x, z] of DINING_SIDEBOARDS) sideboard(x, z);
  KITCHEN_COUNTERS.forEach(([x, z], i) => counter(x, z, 3.9, i));
  island();
  desk(LIBRARY_DESK.x, LIBRARY_DESK.z, 0, 2.6, 0); chair(LIBRARY_DESK.x, 18.8, PI, TEAL);
  for (const [x, z, yaw] of LIBRARY_ARMCHAIRS) armchair(x, z, yaw, ROSE);
  globe(LIBRARY_GLOBE.x, LIBRARY_GLOBE.z); globe(STUDY_GLOBE.x, STUDY_GLOBE.z);
  rug(LIBRARY_RUG.x, LIBRARY_RUG.z, 3.4, 2.3, ['#d86a7a', '#f6e7cf', '#7bb3e0', '#f6e7cf']);
  bedroomBits();
  rug(BEDROOM_RUG.x, BEDROOM_RUG.z, 7.2, 5.4, ['#e8798c', '#f6e7cf', '#8fd0c0', '#f6e7cf', '#e8798c']);
  rug(BEDROOM_BED.x, BEDROOM_BED.z + 1.4, 3.6, 3.4, ['#ffffff', '#f2c3d0']);
  desk(STUDY_DESK.x, STUDY_DESK.z, 0, 3.4, 1); chair(STUDY_DESK.x, 18.8, PI, RED);
  mapTable();
  for (const [x, z, yaw] of STUDY_CHAIRS) chair(x, z, yaw, TEAL);
  for (const [x, z, yaw] of STUDY_ARMCHAIRS) armchair(x, z, yaw, TEAL);
  rug(STUDY_MAP_TABLE.x, STUDY_MAP_TABLE.z, 3.6, 2.6, ['#6aa6d8', '#f6e7cf', '#6aa6d8']);
  for (const [x, z, yaw, open] of TREASURY_CHESTS) chest(x, z, yaw, open);
  for (const [x, z, s] of TREASURY_GOLD) goldHeap(x, z, s);
  pedestal();
  bookPiles();
  const body = mergeGeometries(bodyP, false)!;
  const glow = glowP.length ? mergeGeometries(glowP, false) : null;
  for (const g of bodyP) g.dispose();
  for (const g of glowP) g.dispose();
  bodyP.length = 0; glowP.length = 0;
  body.computeBoundingSphere(); glow?.computeBoundingSphere();
  return { body, glow };
}
