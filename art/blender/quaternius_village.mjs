// Quaternius "Medieval Village MegaKit" houses (CC0) -> public/models/village_qt.glb      (no Blender needed: plain node, no dependencies)
//
// Run:   node art/blender/quaternius_village.mjs [--shots]
// Input: art/House_1..4.obj + .mtl, art/Inn.obj + .mtl   (flat Kd colours, no textures: checked, no map_Kd in any of them)
// Out:   public/models/village_qt.glb   one GLB, one named node per piece (House_1 ... Inn), ONE material, vertex colours (= the MTL Kd)
//        so the game draws every house of every variant through one material (render/qtVillage.tsx: one instanced draw call per variant).
//
// What it does
//   * parses the OBJ (v / vn / f, fan-triangulated), colours each face with its material's Kd, welds identical (position, normal, colour) vertices
//   * scales by S (the pack's houses are ~2 m wide for a ~1 m hero; the town's hero is 1.8 m: S 2.6 -> a 5-6 m house with a 2.3 m door)
//   * turns each piece so its FRONT (the door side) faces +z (the town kit's convention: rot 0 = door south) and centres it on the ground footprint
//   * lightly lifts the colours (the pack's linear Kd are dark: roof 0.015) so the toy palette reads bright under the town light
//   * writes uint16 indices, float positions, int8 normals, uint8 colours (~20 bytes per vertex)
// The piece sizes the game needs (footprint, door, height) are measured here and printed as the table to paste into engine/qtVillage.ts.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'art');
const OUT = path.join(ROOT, 'public', 'models', 'village_qt.glb');
const S_HOUSE = 2.3;   // houses (the hero is 1.8 m: a 2.1 m door)
/** piece -> yaw (rad, about +y) that turns the OBJ's front to +z. Measured by looking at the door (see the viewer page notes in docs). */
const PIECES = { House_1: 0, House_2: 0, Inn: 0, Barrel: 0, Barrel2: 0, Crate: 0, Bucket: 0, Statue_Horse: 0, Pedestal: 0 };   // (House_3 / House_4 are flat-roofed grey boxes: not used)
const SCALE = { Barrel: 0.62, Barrel2: 0.62, Crate: 0.55, Bucket: 1.3, Statue_Horse: 0.62, Pedestal: 0.85 };   // the dungeon props are ~1.3 m barrels: the town's are ~0.85 m
const YAW = JSON.parse(process.env.VILLAGE_YAW || '{}');
const LIFT = (c) => Math.min(1, Math.pow(c, 0.82) * 1.12);   // soft brightening of the dark linear Kd

function parseMtl(file) {
  const out = {}; let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') cur = out[t[1]] = { kd: [0.8, 0.8, 0.8] };
    else if (t[0] === 'Kd' && cur) cur.kd = [+t[1], +t[2], +t[3]];
    else if (t[0] === 'map_Kd') throw new Error('textured material in ' + file);
  }
  return out;
}

function convert(name) {
  const S = SCALE[name] ?? S_HOUSE;
  const mtl = parseMtl(path.join(ART, name + '.mtl'));
  const V = [], N = [], tris = [];   // tris: [vi, ni, mtlName] x3
  let cur = '';
  for (const line of fs.readFileSync(path.join(ART, name + '.obj'), 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'vn') N.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'usemtl') cur = t[1];
    else if (t[0] === 'f') {
      const c = t.slice(1).map((s) => { const a = s.split('/'); return [(+a[0]) - 1, (+a[2]) - 1]; });
      for (let i = 1; i + 1 < c.length; i++) tris.push([c[0], c[i], c[i + 1], cur]);
    }
  }
  const yaw = YAW[name] ?? PIECES[name], cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rot = (p) => [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy];
  // footprint centre after the turn (ground centre of the bounding box)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
  for (const v of V) { const r = rot(v); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); z0 = Math.min(z0, r[2]); z1 = Math.max(z1, r[2]); y1 = Math.max(y1, r[1]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pos = [], nrm = [], col = [], idx = [], map = new Map();
  for (const tr of tris) {
    const kd = (name === 'Statue_Horse' && tr[3] === 'Statue') ? [0.42, 0.4, 0.36] : (mtl[tr[3]] ?? { kd: [0.8, 0.8, 0.8] }).kd, rgb = kd.map((c) => Math.round(LIFT(c) * 255));
    for (let k = 0; k < 3; k++) {
      const [vi, ni] = tr[k], key = vi + '/' + ni + '/' + tr[3];
      let id = map.get(key);
      if (id === undefined) {
        const p = rot(V[vi]), n = rot(N[ni]);
        id = pos.length / 3; map.set(key, id);
        pos.push((p[0] - cx) * S, p[1] * S, (p[2] - cz) * S);
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        nrm.push(Math.round((n[0] / l) * 127), Math.round((n[1] / l) * 127), Math.round((n[2] / l) * 127), 0);
        col.push(rgb[0], rgb[1], rgb[2], 255);
      }
      idx.push(id);
    }
  }
  return { name, pos, nrm, col, idx, w: (x1 - x0) * S, d: (z1 - z0) * S, h: y1 * S };
}

function glb(pieces) {
  const chunks = [], views = [], accessors = [], meshes = [], nodes = [], scene = [];
  const push = (buf, target) => { while (chunks.reduce((a, c) => a + c.length, 0) % 4) chunks.push(Buffer.alloc(1)); const off = chunks.reduce((a, c) => a + c.length, 0); chunks.push(buf); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); return views.length - 1; };
  for (const p of pieces) {
    const P = Buffer.from(new Float32Array(p.pos).buffer), Nn = Buffer.from(new Int8Array(p.nrm).buffer), C = Buffer.from(new Uint8Array(p.col).buffer);
    const big = p.pos.length / 3 > 65535, I = Buffer.from((big ? new Uint32Array(p.idx) : new Uint16Array(p.idx)).buffer);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.pos[i + k]); mx[k] = Math.max(mx[k], p.pos[i + k]); }
    const a0 = accessors.length;
    accessors.push({ bufferView: push(P, 34962), componentType: 5126, count: p.pos.length / 3, type: 'VEC3', min: mn, max: mx });
    accessors.push({ bufferView: push(Nn, 34962), componentType: 5120, normalized: true, count: p.nrm.length / 4, type: 'VEC4' });
    accessors.push({ bufferView: push(C, 34962), componentType: 5121, normalized: true, count: p.col.length / 4, type: 'VEC4' });
    accessors.push({ bufferView: push(I, 34963), componentType: big ? 5125 : 5123, count: p.idx.length, type: 'SCALAR' });
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: a0, NORMAL: a0 + 1, COLOR_0: a0 + 2 }, indices: a0 + 3, material: 0 }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1 }); scene.push(nodes.length - 1);
  }
  const bin = Buffer.concat(chunks); const pad = (4 - (bin.length % 4)) % 4; const binP = Buffer.concat([bin, Buffer.alloc(pad)]);
  const json = { asset: { version: '2.0', generator: 'art/blender/quaternius_village.mjs' }, scene: 0, scenes: [{ nodes: scene }], nodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: binP.length }], materials: [{ name: 'Village', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }] };
  let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binP.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, binP]);
}

const list = Object.keys(PIECES).map(convert);
fs.writeFileSync(OUT, glb(list));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
for (const p of list) console.log(p.name, 'verts', p.pos.length / 3, 'tris', p.idx.length / 3, 'w', p.w.toFixed(2), 'd', p.d.toFixed(2), 'h', p.h.toFixed(2));
