// ============================================================================
// Marble Halls dressing (HALLS rooms, engine/roomHalls.ts 'COLUMNS' castle design): the floor plan is a set of rectangular halls joined by
// straight passages; there are no trees. The mask edge is lined with Quaternius dungeon wall pieces (low on the camera side so they never hide
// monsters), arches stand in the doorways, columns march along the halls, banners / torches hang on the far walls, a few halls have a horse
// statue on a pedestal, vases cluster along the walls. Source: public/models/dungeon/*.obj (Quaternius dungeon kit, art/*.obj), recoloured here to a
// bright cream / blue / gold palette (the MTL colours are near-black). Walls, columns and statues are colliders: the walls ARE the mask edge,
// columns / statues are mask islands. One InstancedMesh per piece (~10 draw calls), built once per room.
// ============================================================================
import React, { Suspense, use, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, PointLight, DoubleSide } from 'three';
import { world } from '../engine/world';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { halls, hallsSdf, HC } from '../engine/roomHalls';
import { BASE } from './models';
import { mulberry32 } from './util';
import { events } from '../engine/events';

const TAU = Math.PI * 2;

/** bright cute castle palette per OBJ material name */
const PAL: Record<string, string> = {
  Wall_Dark: '#e6e4e8', Wall_Medium: '#f4f2f4', Wall_Highlights: '#ffffff',
  Grey_Floor: '#f6f4f6', DarkGrey_Floor: '#9cc6f2',   // (column bands: soft blue)
  Marble: '#ffffff', Statue: '#e8f0fc',
  Metal: '#ffd25e', DarkMetal: '#f0b840', Wood: '#c48a58', DarkWood: '#a06c40',
  Main: '#ee5a58', Fire: '#ffc040', Ceramic: '#7cb8f8', Cobweb: '#ffffff',
};
const PIECES = ['Column', 'Column2', 'Wall_Modular', 'Arch', 'Pedestal', 'Pedestal2', 'Statue_Horse', 'Banner_wall', 'Torch', 'Vase', 'Cobweb'] as const;
type Piece = typeof PIECES[number];
type Kit = Record<Piece, BufferGeometry> & { flame: BufferGeometry };
/** centroid of the torch flame in the Torch's local space (set by loadKit) */
const flameC = { x: 0, y: 0.5, z: 0 };

/** per-piece pivot fix: recentre x/z and/or drop the bottom to y = 0 */
const FIX: Partial<Record<Piece, { cxz?: boolean; floor?: boolean }>> = { Statue_Horse: { cxz: true }, Vase: { cxz: true }, Wall_Modular: { floor: true } };

// (a stray `l` line in Statue_Horse.obj makes OBJLoader turn the whole horse into line segments: those lines are dropped before parsing)
let kitP: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  return (kitP ??= Promise.all(PIECES.map((n) => fetch(`${BASE}models/dungeon/${n}.obj`).then((r) => r.text()).then((t) => new OBJLoader().parse(t.replace(/^l .*$/gm, ''))))).then((objs) => {
    const kit = {} as Kit, c = new Color();
    PIECES.forEach((n, pi) => {
      const pos: number[] = [], nor: number[] = [], col: number[] = [], fpos: number[] = [], fnor: number[] = [];
      objs[pi].traverse((o) => {
        const m = o as Mesh; if (!m.isMesh) return;
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
        for (const gr of groups) {
          const mn = mats[gr.materialIndex ?? 0].name;
          c.set(PAL[mn] ?? '#eee6d2');
          if (n === 'Torch' && mn === 'Fire') {   // the flame is its own emissive mesh (the lit torch glows)
            for (let i = gr.start; i < gr.start + gr.count; i++) { fpos.push(P.getX(i), P.getY(i), P.getZ(i)); fnor.push(0, 1, 0); }
            continue;
          }
          for (let i = gr.start; i < gr.start + gr.count; i++) {
            pos.push(P.getX(i), P.getY(i), P.getZ(i)); if (N) nor.push(N.getX(i), N.getY(i), N.getZ(i)); else nor.push(0, 1, 0);
            col.push(c.r, c.g, c.b);
          }
        }
      });
      const fx = FIX[n];
      if (fx) {
        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, mny = 1e9;
        for (let i = 0; i < pos.length; i += 3) { mnx = Math.min(mnx, pos[i]); mxx = Math.max(mxx, pos[i]); mny = Math.min(mny, pos[i + 1]); mnz = Math.min(mnz, pos[i + 2]); mxz = Math.max(mxz, pos[i + 2]); }
        for (let i = 0; i < pos.length; i += 3) {
          if (fx.cxz) { pos[i] -= (mnx + mxx) / 2; pos[i + 2] -= (mnz + mxz) / 2; }
          if (fx.floor) pos[i + 1] -= mny;
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(nor, 3)); g.setAttribute('color', new Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
      kit[n] = g;
      if (n === 'Torch') {
        const fg = new BufferGeometry();
        fg.setAttribute('position', new Float32BufferAttribute(fpos, 3)); fg.setAttribute('normal', new Float32BufferAttribute(fnor, 3));
        fg.computeBoundingSphere(); kit.flame = fg;
        if (fpos.length) { let sx = 0, sy = 0, sz = 0; const k = fpos.length / 3; for (let i = 0; i < fpos.length; i += 3) { sx += fpos[i]; sy += fpos[i + 1]; sz += fpos[i + 2]; } flameC.x = sx / k; flameC.y = sy / k; flameC.z = sz / k; }
      }
    });
    return kit;
  }));
}

/** Kicks off the OBJ fetch + geometry build early (the first run room of biome 1 does it), so entering Marble Halls never waits on the network. */
export function preloadHallsMarble(): void { loadKit().catch(() => { kitP = null; }); }
let preQueued = false;
events.on('roomEnter', (e) => { if (!preQueued && e.biome === 0 && !e.boss) { preQueued = true; preloadHallsMarble(); } });

interface Put { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number }

function layout(seed: number): Partial<Record<Piece, Put[]>> {
  const rnd = mulberry32(seed ^ 0x3a11), L: Partial<Record<Piece, Put[]>> = {};
  const add = (p: Piece, x: number, y: number, z: number, ry: number, sx: number, sy = sx, sz = sx): void => { (L[p] ??= []).push({ x, y, z, ry, sx, sy, sz }); };
  const isl = halls.islands;
  const nearIsl = (x: number, z: number, m: number): boolean => { for (const q of isl) if ((x - q[0]) ** 2 + (z - q[1]) ** 2 < (q[2] + m) ** 2) return true; return false; };
  const nearArch = (x: number, z: number, m: number): boolean => { for (const a of halls.arches) if (Math.hypot(x - a[0], z - a[1]) < m) return true; return false; };
  const nrm = (x: number, z: number, o: { x: number; z: number }): void => {
    const e = 0.3, gx = hallsSdf(x + e, z) - hallsSdf(x - e, z), gz = hallsSdf(x, z + e) - hallsSdf(x, z - e), l = Math.hypot(gx, gz) || 1;
    o.x = gx / l; o.z = gz / l;
  };
  const n = { x: 0, z: 0 };
  // ---- columns (mask islands r < 1.2) and statues (r >= 1.2)
  for (const [x, z, r] of isl) {
    if (r < 1.2) { const k = r / 0.652 * 0.85; add(rnd() < 0.7 ? 'Column' : 'Column2', x, 0, z, rnd() * TAU, k, 0.93 * 1.0, k); }
    else {
      const ped: Piece = rnd() < 0.5 ? 'Pedestal' : 'Pedestal2', ry = rnd() * TAU, ph = ped === 'Pedestal' ? 2.19 : 2.33;
      add(ped, x, 0, z, ry, 0.85); add('Statue_Horse', x, ph * 0.85, z, ry, 0.65);
    }
  }
  // ---- arches in the doorways (the arch opening is 2.24 wide x 3.0 = the 6.9 m passage; the posts stand in the passage walls)
  for (const [x, z, ry] of halls.arches) add('Arch', x, 0, z, ry, 3.0, 1.0, 1.2);
  // ---- walls along the mask edge
  const w = halls.w, h = halls.h, O = halls.open, cand: [number, number][] = [];
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i; if (!O[k]) continue;
    if (O[k - 1] && O[k + 1] && O[k - w] && O[k + w]) continue;
    const x = halls.x0 + (i + 0.5) * HC, z = halls.z0 + (j + 0.5) * HC;
    if (nearIsl(x, z, 1.9)) continue;
    cand.push([x, z]);
  }
  const chosen: [number, number][] = [];
  for (const [sp, pass] of [[2.9, 0], [3.3, 1]] as [number, number][]) {
    for (const c of cand) {
      let ok = true; for (const q of chosen) if ((q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 < sp * sp) { ok = false; break; }
      if (ok) chosen.push(c);
    }
    void pass;
  }
  let wi = 0;
  const free = (x: number, z: number, m: number): boolean => hallsSdf(x, z) >= m && !nearIsl(x, z, 1.2) && !nearArch(x, z, 4.2);
  for (const c of chosen) {
    nrm(c[0], c[1], n);
    const d = hallsSdf(c[0], c[1]), px = c[0] - n.x * (d + 0.42), pz = c[1] - n.z * (d + 0.42);
    const ry = Math.atan2(n.x, n.z), cam = n.z < -0.5, side = n.z < -0.2 && !cam;
    const hs = cam ? 0.36 : side ? 0.8 : 1;   // camera side: a low balustrade, so monsters / the hero stay visible
    add('Wall_Modular', px, 0, pz, ry, 1.7, 1.75 * hs, 1.7);
    wi++;
    if (hs === 1 && !nearArch(px, pz, 4.5)) {
      const ryf = Math.atan2(-n.x, -n.z);   // banner / torch fronts face -z: turn so the front looks into the hall
      const fx = px + n.x * 0.42, fz = pz + n.z * 0.42;
      if (wi % 5 === 0) add('Banner_wall', fx, 3.2, fz, ryf, 0.95);
      else if (wi % 4 === 0) add('Torch', fx, 1.9, fz, ryf, 1.6);
      else if (wi % 11 === 3) add('Cobweb', fx, 2.5, fz, ryf, 2.2);
    }
  }
  // (jars / barrels along the walls are breakable crates now: engine/roomgen.ts)
  return L;
}

function Pieces({ seed, shadows }: { seed: number; shadows: boolean }) {
  const kit = use(loadKit());
  const meshes = useMemo(() => {
    const L = layout(seed), out: InstancedMesh[] = [], o = new Object3D();
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: DoubleSide });
    mat.color.setRGB(1.25, 1.32, 1.6);   // the biome light is warm and dim: a cool boost keeps the stone a bright cream-white
    for (const p of PIECES) {
      const l = L[p]; if (!l || !l.length) continue;
      const im = new InstancedMesh(kit[p], mat, l.length);
      l.forEach((q, i) => { o.position.set(q.x, q.y, q.z); o.rotation.set(0, q.ry, 0); o.scale.set(q.sx, q.sy, q.sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      im.castShadow = shadows && p !== 'Cobweb'; im.receiveShadow = true;
      out.push(im);
    }
    return out;
  }, [seed, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const torches = useMemo(() => layout(seed).Torch ?? [], [seed, halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <>{meshes.map((m) => <primitive key={m.id} object={m} />)}<TorchGlow torches={torches} flame={kit.flame} shadows={shadows} /></>;
}

const NLIGHT = 3;
let poolTex: CanvasTexture | null = null;
function glowTex(): CanvasTexture {
  if (poolTex) return poolTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,170,70,0.55)'); gr.addColorStop(0.5, 'rgba(255,140,50,0.2)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (poolTex = new CanvasTexture(cv));
}

/** Wall torches that really glow: an emissive flame per torch, a warm additive light pool on the floor in front of it, and (on the higher
 *  quality tiers) NLIGHT real point lights that hop to the torches nearest the hero. */
function TorchGlow({ torches, flame, shadows }: { torches: Put[]; flame: BufferGeometry; shadows: boolean }) {
  const lights = useRef<(PointLight | null)[]>([]);
  const res = useMemo(() => {
    const fm = new MeshBasicMaterial({ color: new Color(3.2, 1.9, 0.5), toneMapped: false, side: DoubleSide });
    const o = new Object3D(), n = torches.length;
    const fl = new InstancedMesh(flame, fm, Math.max(1, n)), pm = new MeshBasicMaterial({ map: glowTex(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const pools = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pm, Math.max(1, n));
    const pos = new Float32Array(n * 3);
    torches.forEach((q, i) => {
      o.position.set(q.x, q.y, q.z); o.rotation.set(0, q.ry, 0); o.scale.set(q.sx, q.sy, q.sz); o.updateMatrix(); fl.setMatrixAt(i, o.matrix);
      const c = Math.cos(q.ry), s = Math.sin(q.ry), lx = flameC.x * q.sx, lz = flameC.z * q.sz;
      pos[i * 3] = q.x + lx * c + lz * s; pos[i * 3 + 1] = q.y + flameC.y * q.sy; pos[i * 3 + 2] = q.z - lx * s + lz * c;
      // the pool lies on the floor a little way out from the wall (the torch front faces into the hall)
      o.position.set(pos[i * 3] + Math.sin(q.ry + Math.PI) * 2.2, 0.07, pos[i * 3 + 2] + Math.cos(q.ry + Math.PI) * 2.2); o.rotation.set(0, 0, 0); o.scale.set(11, 1, 11); o.updateMatrix(); pools.setMatrixAt(i, o.matrix);
    });
    fl.count = n; pools.count = n; fl.frustumCulled = false; pools.frustumCulled = false; pools.renderOrder = 2;
    fl.instanceMatrix.needsUpdate = true; pools.instanceMatrix.needsUpdate = true;
    return { fl, pools, pos };
  }, [torches, flame]);
  useFrame(({ clock }) => {
    const L = lights.current, n = res.pos.length / 3, p = world.player.pos, t = clock.elapsedTime;
    res.pools.material.opacity = 0.9 + Math.sin(t * 7.3) * 0.08;
    for (let k = 0; k < NLIGHT; k++) {
      const li = L[k]; if (!li) continue;
      let best = -1, bd = 1e9;
      for (let i = 0; i < n; i++) {
        const dx = res.pos[i * 3] - p.x, dz = res.pos[i * 3 + 2] - p.z, d = dx * dx + dz * dz;
        if (d >= bd) continue;
        let taken = false;
        for (let j = 0; j < k; j++) { const o = L[j]; if (o && o.userData.i === i) { taken = true; break; } }
        if (!taken) { bd = d; best = i; }
      }
      if (best < 0) { li.visible = false; continue; }
      li.visible = true; li.userData.i = best;
      li.position.set(res.pos[best * 3] + (p.x - res.pos[best * 3]) * 0.04, res.pos[best * 3 + 1] - 0.3, res.pos[best * 3 + 2] + (p.z - res.pos[best * 3 + 2]) * 0.04);
      li.intensity = 38 + Math.sin(t * 9 + best) * 5;
    }
  });
  return <>
    <primitive object={res.fl} /><primitive object={res.pools} />
    {shadows && Array.from({ length: NLIGHT }, (_, k) => <pointLight key={k} ref={(l) => { lights.current[k] = l; }} color="#ffa24a" intensity={38} distance={17} decay={2} />)}
  </>;
}

export function HallsMarble({ seed, shadows }: { seed: number; shadows: boolean }) {
  return <Suspense fallback={null}><Pieces seed={seed} shadows={shadows} /></Suspense>;
}
