// ============================================================================
// Ember Wastes lava floors (owner-approved mock). Run rooms (COMBAT / ELITE) of the Ember biome get lava painted on the floor:
//   NORMAL  winding streams that branch and end in blobby pools (discs, like the soil trail of render/groundPath.ts roomTrail), scattered over the room,
//   HEAVY   (~30 % of round-ish combat rooms) the inverse: mostly lava, with a big central rock island, smaller islands and narrow rock bridges;
//           `discs` then hold the ROCK and everything else inside the room is lava.
// The centre, the arrival spot, the station, the exits and every placed hazard stay lava-free / rock. Lava is walkable (no collider): it slows and
// burns the hero (zones.ts lavaUpdate) unless dashing. One generator shared by the engine (burn grid, O(1) `lavaAt`) and the renderer
// (render/Room.tsx rasterises `discs` with pathMask into the ground shader). Pure TS; the grid is rebuilt once per room.
// ============================================================================
import { world } from './world';
import { shape, shapeLimit, insideShape } from './roomShape';
import { hallsSdf, hallsRandomSpot } from './roomHalls';
import { feat, inLiquid } from './roomFeatures';
import { startPos, stationPos, portalSlot, shortcutSlot } from './roomgen';
import { queryColliders, mulberry32, type Collider } from './mapgen';
import { hz } from './systems/biomeHazards';
import { rt } from './systems/roomTraps';
import type { RoomPlan } from './types';
import type { CaveLayout } from './caveData';

export interface LDisc { x: number; z: number; r: number }
export const EMBER_BIOME = 5, CELL = 0.5;
export const lava = {
  on: false, heavy: false, ver: 0, coverage: 0,
  /** bumps whenever `addLavaDisc` grows the floor (Ignar's creeping lava): render/Room.tsx re-rasterises the ground mask */
  growVer: 0,
  /** normal: the lava discs; heavy: the ROCK discs (lava = the rest of the room) */
  discs: [] as LDisc[],
  grid: new Uint8Array(0), n: 0, o: 0,
};

/** debug: -1 random (30 % heavy), 0 never, 1 always (headless screenshots) */
export const lavaDbg = { heavy: -1, why: '' };
const colOut: Collider[] = [];
const kx: number[] = [], kz: number[] = [], kr: number[] = [];
const keep = (x: number, z: number, r: number): void => { kx.push(x); kz.push(z); kr.push(r); };

export interface LavaGrid { grid: Uint8Array; n: number; o: number }
/** O(1): is (x, z) on lava in grid `g`? */
export function gridAt(g: LavaGrid, x: number, z: number): boolean {
  const i = Math.floor((x + g.o) / CELL), j = Math.floor((z + g.o) / CELL), n = g.n;
  return i >= 0 && j >= 0 && i < n && j < n && g.grid[j * n + i] === 1;
}
/** O(1): is (x, z) on lava right now (run rooms)? */
export function lavaAt(x: number, z: number): boolean { return lava.on && gridAt(lava, x, z); }

function floorOk(x: number, z: number, r: number): boolean {
  if (shape.kind === 'HALLS') return hallsSdf(x, z) >= r + 1.6;
  return insideShape(x, z, r + 1.6);
}

/** `bossLava`: Ignar's arena (BOSS room) gets ~40% lava; normal Ember COMBAT / ELITE rooms aim for 35-50%. */
export function setupLavaFloor(biome: number, plan: RoomPlan, seed: number, bossLava = false): void {
  lava.on = false; lava.heavy = false; lava.discs = []; lava.ver++; lava.coverage = 0; lava.growVer = 0;
  lavaDbg.why = 'biome';
  if (((biome % 7) + 7) % 7 !== EMBER_BIOME) return;
  lavaDbg.why = 'plan';
  const bossRoom = plan.type === 'BOSS' && bossLava;
  if ((!bossRoom && plan.type !== 'COMBAT' && plan.type !== 'ELITE') || plan.gate !== undefined || plan.shortcut || plan.epilogue || plan.dream) return;
  boss = bossRoom;
  const halls = shape.kind === 'HALLS', rnd = mulberry32(seed ^ 0x1a7a), R = world.room.radius || shape.baseR;
  const wet = feat.river || feat.rift || feat.nLakes > 0 || hz.nRift > 0;
  kx.length = kz.length = kr.length = 0;
  const [sx, sz] = startPos(R), [stx, stz] = stationPos(R), po: [number, number] = [0, 0];
  const discs: LDisc[] = [];
  const heavy = !halls && !wet && !bossRoom && plan.type === 'COMBAT' && (lavaDbg.heavy < 0 ? rnd() < 0.15 : lavaDbg.heavy === 1);
  if (heavy) genHeavy(discs, rnd, sx, sz, stx, stz);
  else {
    keep(sx, sz, bossRoom ? 8 : 9.5); if (!bossRoom) keep(stx, stz, 6);
    if (bossRoom) for (let k = 1; k <= 6; k++) keep(sx * (1 - k / 7), sz * (1 - k / 7), 3);   // (Ignar: a bare walking lane from the arrival spot to the middle, so the creeping lava never cuts the hero off)
    for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); keep(po[0], po[1], 5.5); }
    for (let i = 0; i < 2; i++) { portalSlot(i, 2, R, po); keep(po[0], po[1], 5.5); }
    shortcutSlot(po); keep(po[0], po[1], 5);
    for (let i = 0; i < hz.nRift; i++) keep(hz.rift[i].x, hz.rift[i].z, 6);
    for (let i = 0; i < rt.nSiege; i++) keep(rt.siege[i].x, rt.siege[i].z, 4);
    for (let i = 0; i < rt.nTower; i++) keep(rt.tower[i].x, rt.tower[i].z, 4);
    for (let i = 0; i < rt.nStatue; i++) keep(rt.statue[i].x, rt.statue[i].z, 4);
    for (let i = 0; i < rt.nBar; i++) keep(rt.bar[i].x, rt.bar[i].z, 6);
    for (let i = 0; i < rt.nBeam; i++) keep(rt.beam[i].x, rt.beam[i].z, 4);
    for (let i = 0; i < rt.nJet; i++) keep(rt.jet[i].x, rt.jet[i].z, 4);
    for (let i = 0; i < rt.nVine; i++) keep(rt.vine[i].x, rt.vine[i].z, rt.vine[i].r + 1);
    for (let i = 0; i < rt.nPool; i++) keep(rt.pool[i].x, rt.pool[i].z, rt.pool[i].r + 1);
    if (feat.pChest.on) keep(feat.pChest.x, feat.pChest.z, 4);
    genStreams(discs, rnd, halls, wet);
    fillTo(discs, rnd, halls, wet, bossRoom ? 0.4 : 0.36 + rnd() * 0.14);
    lavaDbg.why = 'few:' + discs.length;
    if (discs.length < 12) return;
  }
  lava.discs = discs; lava.heavy = heavy; lava.on = true;
  buildGrid(discs, heavy);
  lava.coverage = measure();
}

// ------------------------------------------------------------------------------------------------ Ignar's creeping lava
/** Share of the room floor that is lava right now (recounts the grid). */
export function lavaCoverage(): number { lava.coverage = lava.on ? measure() : 0; return lava.coverage; }
/**
 * Plans one new lava patch for Ignar's arena (a main pool + 2 satellites) into `out` (cleared first, returns how many discs): it spreads from the
 * existing lava or the arena edge, never on the arrival keep zone / the bare lane to the middle / the centre / colliders. 0 = no spot found.
 */
export function planLavaPatch(out: LDisc[], rnd: () => number): number {
  out.length = 0;
  if (!lava.on || lava.heavy) return 0;
  const R = shape.baseR, rr = 3.4 + rnd() * 0.8;
  for (let t = 0; t < 60; t++) {
    const a = rnd() * 6.283, c = Math.cos(a), sn = Math.sin(a), d = (t < 30 ? 0.62 + rnd() * 0.33 : 0.2 + rnd() * 0.7) * shapeLimit(c, sn);
    const x = c * d, z = sn * d;
    if (gridAt(lava, x, z) || !free(x, z, rr, false, false)) continue;
    // spreads outward: next to existing lava (a probe 1.6 r away on any side) or hugging the arena edge
    let adj = d > 0.8 * shapeLimit(c, sn);
    for (let k = 0; k < 8 && !adj; k++) { const b = (k / 8) * 6.283; if (gridAt(lava, x + Math.cos(b) * rr * 1.6, z + Math.sin(b) * rr * 1.6)) adj = true; }
    if (!adj && t < 45) continue;
    out.push({ x, z, r: rr });
    for (let k = 0; k < 2; k++) {
      const b = rnd() * 6.283, sx = x + Math.cos(b) * rr * 0.9, sz = z + Math.sin(b) * rr * 0.9, sr = rr * (0.6 + rnd() * 0.15);
      if (free(sx, sz, sr, false, false)) out.push({ x: sx, z: sz, r: sr });
    }
    void R;
    return out.length;
  }
  return 0;
}
/** Turns a disc of floor into lava now (grid + the ground mask refresh via `lava.growVer`). */
export function addLavaDisc(x: number, z: number, r: number): void {
  if (!lava.on || lava.heavy) return;
  const d: LDisc = { x, z, r };
  lava.discs.push(d);
  fillGrid(lava.grid, lava.n, lava.o, [d], false);
  lava.growVer++;
}

// ------------------------------------------------------------------------------------------------ normal
let boss = false;   // true while the generator runs for Ignar's arena
const centreR = (halls: boolean): number => (halls ? 0.08 * world.room.radius : (boss ? 0.14 : 0.2) * shape.baseR);
function free(x: number, z: number, r: number, halls: boolean, wet: boolean): boolean {
  if (cv) return caveFree(x, z, r);
  if (!floorOk(x, z, r)) return false;
  if (Math.hypot(x, z) < centreR(halls) + r) return false;
  for (let k = 0; k < kx.length; k++) if (Math.hypot(x - kx[k], z - kz[k]) < kr[k] + r) return false;
  if ((wet || feat.river || feat.nLakes > 0) && inLiquid(x, z, r + 2.5)) return false;
  queryColliders(x, z, r + 2, colOut);
  for (let k = 0; k < colOut.length; k++) if (Math.hypot(colOut[k].x - x, colOut[k].z - z) < colOut[k].r + r * 0.6) return false;
  return true;
}
function pool(out: LDisc[], rnd: () => number, cx: number, cz: number, rad: number, halls: boolean, wet: boolean): void {
  const c = { x: cx, z: cz, r: rad * 0.7 };
  if (free(c.x, c.z, c.r, halls, wet)) out.push(c);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283 + rnd(), d = rad * (0.45 + rnd() * 0.35), r = rad * (0.4 + rnd() * 0.25), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (free(x, z, r, halls, wet)) out.push({ x, z, r });
  }
}
const TURNS = [0, 0.5, -0.5, 1.0, -1.0];
function stream(out: LDisc[], rnd: () => number, x: number, z: number, ang: number, len: number, w0: number, halls: boolean, wet: boolean, depth: number): void {
  const ph = rnd() * 20, step = 0.55;
  let travelled = 0, lx = x, lz = z, since = 0, pushed = 0;
  while (travelled < len) {
    const t = travelled;
    const w = w0 * (0.8 + 0.35 * Math.sin(t * 0.21 + ph) + 0.2 * Math.sin(t * 0.55 + ph * 2)) * (1 - 0.3 * (t / len));
    ang += (rnd() - 0.5) * 0.22 + Math.sin(t * 0.17 + ph) * 0.085;
    let ok = false;
    for (let q = 0; q < TURNS.length; q++) {
      const a2 = ang + TURNS[q], nx = lx + Math.cos(a2) * step, nz = lz + Math.sin(a2) * step;
      if (free(nx, nz, w, halls, wet)) { ang = a2; lx = nx; lz = nz; ok = true; break; }
    }
    if (!ok) break;
    out.push({ x: lx, z: lz, r: Math.max(0.7, w) }); pushed++;
    travelled += step; since += step;
    if (depth < 2 && since > 7 && t > 6 && len - t > 9 && rnd() < 0.045) { since = 0; stream(out, rnd, lx, lz, ang + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5), 8 + rnd() * 10, w0 * 0.7, halls, wet, depth + 1); }
  }
  if (pushed > 6 && rnd() < 0.85) pool(out, rnd, lx, lz, 1.7 + rnd() * 1.0, halls, wet);
}
function genStreams(out: LDisc[], rnd: () => number, halls: boolean, wet: boolean): void {
  const R = halls ? world.room.radius : shape.baseR;
  const n = Math.max(3, Math.min(halls ? 7 : 6, Math.round(R / (halls ? 9 : 8)))) - (wet ? 1 : 0);
  const sp: [number, number] = [0, 0];
  for (let s = 0; s < n; s++) {
    let got = false;
    for (let t = 0; t < 60 && !got; t++) {
      if (halls) { if (!hallsRandomSpot(3, sp)) break; }
      else { const a = rnd() * 6.283, d = (0.4 + rnd() * 0.55) * shapeLimit(Math.cos(a), Math.sin(a)); sp[0] = Math.cos(a) * d; sp[1] = Math.sin(a) * d; }
      if (free(sp[0], sp[1], 1.4, halls, wet)) got = true;
    }
    if (!got) continue;
    stream(out, rnd, sp[0], sp[1], rnd() * 6.283, 22 + rnd() * 24, 1.0 + rnd() * 0.5, halls, wet, 0);
  }
  if (!wet) for (let k = 0; k < 2; k++) {
    const a = rnd() * 6.283, d = (0.45 + rnd() * 0.45) * shapeLimit(Math.cos(a), Math.sin(a));
    pool(out, rnd, Math.cos(a) * d, Math.sin(a) * d, 2.0 + rnd() * 1.2, halls, wet);
  }
}

/** Share of the room floor that is lava right now in `lava.grid` (normal mode: painted cells; the grid must be built for `discs`). */
function measure(): number {
  const n = lava.n, hs = lava.o, g = lava.grid, halls = shape.kind === 'HALLS';
  let c = 0, tot = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * CELL - hs, z = (j + 0.5) * CELL - hs;
    if (halls ? hallsSdf(x, z) < 0.5 : !insideShape(x, z, 0.5)) continue;
    tot++; if (g[j * n + i] === 1) c++;
  }
  return tot ? c / tot : 0;
}
/** Keeps laying winding streams (wider, longer) with pool blobs at their ends from random bare spots until `target` of the floor is lava. */
function fillTo(out: LDisc[], rnd: () => number, halls: boolean, wet: boolean, target: number): void {
  const sp: [number, number] = [0, 0];
  buildGrid(out, false);
  let cov = measure();
  for (let s = 0; s < 140 && cov < target; s++) {
    let got = false;
    for (let t = 0; t < 40 && !got; t++) {
      if (halls) { if (!hallsRandomSpot(3, sp)) break; }
      else { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 0.93 * shapeLimit(Math.cos(a), Math.sin(a)); sp[0] = Math.cos(a) * d; sp[1] = Math.sin(a) * d; }
      if (t < 30 && gridAt(lava, sp[0], sp[1])) continue;   // start on bare rock
      if (free(sp[0], sp[1], s < 50 ? 1.8 : 1.1, halls, wet)) got = true;
    }
    if (!got) continue;
    stream(out, rnd, sp[0], sp[1], rnd() * 6.283, 24 + rnd() * 26, (s < 50 ? 1.5 : 1.2) + rnd() * 0.9, halls, wet, 0);
    if (rnd() < 0.5) pool(out, rnd, sp[0], sp[1], 2.4 + rnd() * 1.6, halls, wet);   // (a pool where the stream starts too)
    buildGrid(out, false);
    cov = measure();
  }
}

// ------------------------------------------------------------------------------------------------ heavy (rock discs)
function island(out: LDisc[], rnd: () => number, cx: number, cz: number, rad: number): void {
  out.push({ x: cx, z: cz, r: rad * 0.8 });
  const n = Math.max(7, Math.round(rad * 1.6));
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd() * 0.5, d = rad * (0.45 + rnd() * 0.3); out.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: rad * (0.45 + rnd() * 0.2) }); }
}
function bridge(out: LDisc[], rnd: () => number, ax: number, az: number, bx: number, bz: number, hw: number): void {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, ph = rnd() * 9;
  for (let s = 0; s <= len; s += 0.6) {
    const o = Math.sin(s * 0.3 + ph) * 0.7 * Math.min(1, s / 3, (len - s) / 3 + 0.01);
    out.push({ x: ax + dx * (s / len) + nx * o, z: az + dz * (s / len) + nz * o, r: hw * (0.9 + 0.25 * Math.sin(s * 0.7 + ph)) });
  }
}
function genHeavy(out: LDisc[], rnd: () => number, sx: number, sz: number, stx: number, stz: number): void {
  const R = shape.baseR, po: [number, number] = [0, 0];
  const lim = (a: number): number => shapeLimit(Math.cos(a), Math.sin(a));
  // the rim just inside the walls stays rock
  const nr = Math.ceil(6.283 * shape.maxR / 2.0);
  for (let i = 0; i < nr; i++) { const a = (i / nr) * 6.283, l = lim(a); out.push({ x: Math.cos(a) * (l - 0.5), z: Math.sin(a) * (l - 0.5), r: 3.2 }); }
  island(out, rnd, 0, 0, R * (0.36 + rnd() * 0.04));   // the big central fight island
  island(out, rnd, sx, sz, 5.5); bridge(out, rnd, sx, sz, 0, 0, 1.7);
  if (Math.hypot(stx, stz) > R * 0.2) { island(out, rnd, stx, stz, 4.0); bridge(out, rnd, stx, stz, 0, 0, 1.6); }
  for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); island(out, rnd, po[0], po[1], 4.6); bridge(out, rnd, po[0], po[1], 0, 0, 1.6); }
  shortcutSlot(po); island(out, rnd, po[0], po[1], 3.2);
  const na = 3 + Math.floor(rnd() * 3), a0 = rnd() * 6.283;
  for (let i = 0; i < na; i++) {
    const a = a0 + (i / na) * 6.283 + (rnd() - 0.5) * 0.4, d = lim(a) * (0.58 + rnd() * 0.14), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - sx, z - sz) < 9) continue;
    island(out, rnd, x, z, 3.4 + rnd() * 1.8); bridge(out, rnd, x, z, Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, 1.4 + rnd() * 0.3);
  }
  // props / placed hazards keep a rock pad under them
  const pad = (x: number, z: number, r: number): void => { out.push({ x, z, r }); };
  queryColliders(0, 0, shape.maxR + 4, colOut);
  for (let k = 0; k < colOut.length; k++) pad(colOut[k].x, colOut[k].z, colOut[k].r + 0.9);
  for (let i = 0; i < rt.nSiege; i++) pad(rt.siege[i].x, rt.siege[i].z, 3);
  for (let i = 0; i < rt.nTower; i++) pad(rt.tower[i].x, rt.tower[i].z, 3);
  for (let i = 0; i < rt.nStatue; i++) pad(rt.statue[i].x, rt.statue[i].z, 3);
  for (let i = 0; i < rt.nBar; i++) pad(rt.bar[i].x, rt.bar[i].z, 4);
  for (let i = 0; i < rt.nJet; i++) pad(rt.jet[i].x, rt.jet[i].z, 3);
  for (let i = 0; i < rt.nVine; i++) pad(rt.vine[i].x, rt.vine[i].z, rt.vine[i].r);
  for (let i = 0; i < rt.nPool; i++) pad(rt.pool[i].x, rt.pool[i].z, rt.pool[i].r);
}

// ------------------------------------------------------------------------------------------------ burn grid
function buildGrid(discs: LDisc[], heavy: boolean): void {
  const hs = shape.maxR + 6, n = Math.ceil((hs * 2) / CELL);
  if (lava.grid.length < n * n) lava.grid = new Uint8Array(n * n); else lava.grid.fill(0);
  lava.n = n; lava.o = hs;
  fillGrid(lava.grid, n, hs, discs, heavy);
}
function fillGrid(g: Uint8Array, n: number, hs: number, discs: LDisc[], heavy: boolean): void {
  if (heavy) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + 0.5) * CELL - hs, z = (j + 0.5) * CELL - hs; if (insideShape(x, z, 0.5)) g[j * n + i] = 1; }
  }
  const v = heavy ? 0 : 1, k = heavy ? 1.0 : 0.9;
  for (let q = 0; q < discs.length; q++) {
    const d = discs[q], r = d.r * k, i0 = Math.max(0, Math.floor((d.x - r + hs) / CELL)), i1 = Math.min(n - 1, Math.floor((d.x + r + hs) / CELL));
    const j0 = Math.max(0, Math.floor((d.z - r + hs) / CELL)), j1 = Math.min(n - 1, Math.floor((d.z + r + hs) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CELL - hs, z = (j + 0.5) * CELL - hs;
      if ((x - d.x) ** 2 + (z - d.z) ** 2 < r * r) g[j * n + i] = v;
    }
  }
}

// ------------------------------------------------------------------------------------------------ Crystal Cave (LAVA floors, engine/caveData.ts hazard 'LAVA')
// The same streams + pools generator on the cave chamber's outline; the arrival / exit / stairs, the veins, the props and the walk between the stairs stay clear.
let cv: CaveLayout | null = null;
function caveFree(x: number, z: number, r: number): boolean {
  const L = cv!;
  if (Math.hypot(x, z) > L.radius(Math.atan2(z, x)) - r - 1.8) return false;
  for (let k = 0; k < kx.length; k++) if (Math.hypot(x - kx[k], z - kz[k]) < kr[k] + r) return false;
  const ax = L.spawn.x, az = L.spawn.z, bx = L.down.x, bz = L.down.z, ll = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ll));
  if (Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) < 3.4 + r) return false;
  return true;
}
export interface CaveLava extends LavaGrid { discs: LDisc[] }
const caveCache = new WeakMap<CaveLayout, CaveLava | null>();
/** The lava floor of a cave layout (cached per layout; null when the floor has no LAVA hazard). Shared by cave.ts (burn) and CaveInterior.tsx (mask). */
export function caveLava(L: CaveLayout): CaveLava | null {
  if (L.hazard !== 'LAVA') return null;
  const hit = caveCache.get(L);
  if (hit !== undefined) return hit;
  cv = L; kx.length = kz.length = kr.length = 0;
  keep(L.spawn.x, L.spawn.z, 5); keep(L.exit.x, L.exit.z, L.exit.r + 1.5); keep(L.down.x, L.down.z, L.down.r + 1.5);
  for (const n of L.nodes) keep(n.x, n.z, 3.8);
  for (const q of L.stalagmites) keep(q[0], q[1], 1.5 * q[2] + 0.6);
  for (const q of L.crystals) keep(q[0], q[1], 1.6 * q[2] + 0.6);
  for (const q of L.colliders) keep(q[0], q[1], q[2] + 0.5);
  const rnd = mulberry32(Math.imul(L.floor, 7919) ^ Math.round(L.rx * 100) ^ 0x5eed), discs: LDisc[] = [];
  const n = Math.max(3, Math.min(6, Math.round((L.rx + L.rz) / 9)));
  for (let s = 0; s < n; s++) {
    let got = false, x = 0, z = 0;
    for (let t = 0; t < 80 && !got; t++) { const a = rnd() * 6.283, k = 0.3 + rnd() * 0.65, rr = L.radius(a) * k; x = Math.cos(a) * rr; z = Math.sin(a) * rr; got = caveFree(x, z, 1.4); }
    if (got) stream(discs, rnd, x, z, rnd() * 6.283, 16 + rnd() * 16, 1.0 + rnd() * 0.4, false, false, 0);
  }
  for (let k = 0; k < 2; k++) { const a = rnd() * 6.283, rr = L.radius(a) * (0.4 + rnd() * 0.45); pool(discs, rnd, Math.cos(a) * rr, Math.sin(a) * rr, 2.0 + rnd() * 1.0, false, false); }
  cv = null;
  if (discs.length < 8) { caveCache.set(L, null); return null; }
  const hs = Math.max(L.rx, L.rz) * 1.2 + 6, gn = Math.ceil((hs * 2) / CELL), out: CaveLava = { discs, grid: new Uint8Array(gn * gn), n: gn, o: hs };
  fillGrid(out.grid, gn, hs, discs, false);
  caveCache.set(L, out);
  return out;
}
