// ============================================================================
// Frostpeak ice floors (owner-approved mock "ice_mock.png"). COMBAT / ELITE / TREASURE rooms of the ice biome (index 4) get a few BIG irregular sheets of
// slippery ice on the floor (lobed blobs of discs, like the lava pools of lavaFloor.ts); the rest of the floor stays normal snow (no small patches).
//   - the hero keeps his momentum on a sheet (player.ts: x0.1 acceleration while steering, x0.04 friction while letting go, x1.25 top speed; no dash while standing on ice),
//   - walking monsters slide a bit (biomeHazards.ts iceMobs; bosses / minis / flyers-as-stationaries excluded),
//   - the arrival spot, exits, station / chests, the centre, placed stationaries, frozen pools and liquids stay ice-free.
// One generator, deterministic per room seed: discs -> a 0.5 m Uint8Array grid (O(1) `iceAt`), rebuilt once per room in director.enterRoom; the renderer
// rasterises `discs` with pathMask into the ground shader (groundPath.ts applyIceShader). Pure TS.
// ============================================================================
import { world } from './world';
import { shape, shapeLimit, insideShape } from './roomShape';
import { hallsSdf, hallsRandomSpot } from './roomHalls';
import { feat, inLiquid } from './roomFeatures';
import { startPos, stationPos, portalSlot, shortcutSlot } from './roomgen';
import { mulberry32 } from './mapgen';
import { hz } from './systems/biomeHazards';
import { rt } from './systems/roomTraps';
import type { RoomPlan } from './types';

export interface IDisc { x: number; z: number; r: number }
export const FROST_BIOME = 4, ICE_CELL = 0.5;
export const ice = {
  on: false, ver: 0, coverage: 0,
  discs: [] as IDisc[],
  grid: new Uint8Array(0), n: 0, o: 0,
};
/** Hero slip numbers (player.ts): velocity lerp rate = 12 * grip per second. Steering on ice: x0.1; letting go: x0.04 (a very long glide); top slide speed x1.25 of walking; no dash on ice (abilities.ts tryDash). */
export const ICE_ACCEL = 0.1, ICE_FRICTION = 0.04, ICE_SPEED_MUL = 1.25;
/** Monster slide: their slide velocity lerps toward the AI's velocity at this rate per second (normal ground = instant). */
export const ICE_MOB_LERP = 3;

const kx: number[] = [], kz: number[] = [], kr: number[] = [];
const keep = (x: number, z: number, r: number): void => { kx.push(x); kz.push(z); kr.push(r); };

/** O(1): is (x, z) on ice right now (run rooms)? */
export function iceAt(x: number, z: number): boolean {
  if (!ice.on) return false;
  const n = ice.n, i = Math.floor((x + ice.o) / ICE_CELL), j = Math.floor((z + ice.o) / ICE_CELL);
  return i >= 0 && j >= 0 && i < n && j < n && ice.grid[j * n + i] === 1;
}

function floorOk(x: number, z: number, r: number, halls: boolean): boolean {
  return halls ? hallsSdf(x, z) >= r + 1.2 : insideShape(x, z, r + 1.0);
}
const centreR = (halls: boolean): number => (halls ? 0.1 * world.room.radius : 0.22 * shape.baseR);
function free(x: number, z: number, r: number, halls: boolean): boolean {
  if (!floorOk(x, z, r * 0.5, halls)) return false;
  if (Math.hypot(x, z) < centreR(halls) + r * 0.9) return false;
  for (let k = 0; k < kx.length; k++) if (Math.hypot(x - kx[k], z - kz[k]) < kr[k] + r * 0.9) return false;
  if (inLiquid(x, z, r * 0.5 + 1.2)) return false;
  return true;
}

/** One big irregular sheet: a fat core disc, a ring of lobes of varying size, a few tongues. Lobes that do not fit are dropped, so edges follow obstacles. */
function sheet(out: IDisc[], rnd: () => number, cx: number, cz: number, R0: number, halls: boolean): number {
  const n0 = out.length;
  if (!free(cx, cz, R0 * 0.75, halls)) return 0;
  out.push({ x: cx, z: cz, r: R0 * 0.78 });
  const nl = 9 + Math.floor(R0 * 0.8);
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * 6.283 + rnd() * 0.5, d = R0 * (0.5 + rnd() * 0.4), r = R0 * (0.36 + rnd() * 0.3), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (free(x, z, r, halls)) out.push({ x, z, r });
  }
  for (let i = 0, nt = 2 + Math.floor(rnd() * 3); i < nt; i++) {   // tongues: a little chain of discs reaching out
    let a = rnd() * 6.283, x = cx + Math.cos(a) * R0 * 0.8, z = cz + Math.sin(a) * R0 * 0.8;
    for (let s = 0, len = 3 + Math.floor(rnd() * 4); s < len; s++) {
      a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 1.7; z += Math.sin(a) * 1.7;
      const r = 2.0 - s * 0.18;
      if (r < 0.9 || !free(x, z, r, halls)) break;
      out.push({ x, z, r });
    }
  }
  return out.length - n0;
}

export function setupIceFloor(biome: number, plan: RoomPlan, seed: number): void {
  ice.on = false; ice.coverage = 0; ice.discs = []; ice.ver++;
  if (((biome % 7) + 7) % 7 !== FROST_BIOME) return;
  if ((plan.type !== 'COMBAT' && plan.type !== 'ELITE' && plan.type !== 'TREASURE') || plan.gate !== undefined || plan.shortcut || plan.epilogue || plan.dream) return;
  const halls = shape.kind === 'HALLS', rnd = mulberry32(seed ^ 0x1ce5), R = world.room.radius || shape.baseR;
  kx.length = kz.length = kr.length = 0;
  const [sx, sz] = startPos(R), [stx, stz] = stationPos(R), po: [number, number] = [0, 0];
  keep(sx, sz, 9.5); keep(stx, stz, 6.5);
  for (let i = 0; i < 3; i++) { portalSlot(i, 3, R, po); keep(po[0], po[1], 5.5); }
  for (let i = 0; i < 2; i++) { portalSlot(i, 2, R, po); keep(po[0], po[1], 5.5); }
  shortcutSlot(po); keep(po[0], po[1], 5);
  for (let i = 0; i < hz.nRift; i++) keep(hz.rift[i].x, hz.rift[i].z, 6);
  for (let i = 0; i < rt.nSiege; i++) keep(rt.siege[i].x, rt.siege[i].z, 4);
  for (let i = 0; i < rt.nTower; i++) keep(rt.tower[i].x, rt.tower[i].z, 4);
  for (let i = 0; i < rt.nStatue; i++) keep(rt.statue[i].x, rt.statue[i].z, 4);
  for (let i = 0; i < rt.nLaser; i++) keep(rt.laser[i].x, rt.laser[i].z, 3.2);
  for (let i = 0; i < rt.nBar; i++) keep(rt.bar[i].x, rt.bar[i].z, 6);
  for (let i = 0; i < rt.nBeam; i++) keep(rt.beam[i].x, rt.beam[i].z, 4);
  for (let i = 0; i < rt.nJet; i++) keep(rt.jet[i].x, rt.jet[i].z, 4);
  for (let i = 0; i < rt.nPool; i++) keep(rt.pool[i].x, rt.pool[i].z, rt.pool[i].r + 1);
  if (feat.pChest.on) keep(feat.pChest.x, feat.pChest.z, 4);
  for (let i = 0; i < feat.nTowers; i++) keep(feat.tx[i], feat.tz[i], 3.5);

  const discs: IDisc[] = [];
  const area = halls ? Math.PI * R * R * 0.5 : Math.PI * shape.baseR * shape.baseR;
  const nSheets = halls ? 4 : Math.max(2, Math.min(5, Math.round(area / 650))), sp: [number, number] = [0, 0];
  let big = 0;
  for (let s = 0; s < nSheets + 3 && big < nSheets; s++) {
    const R0 = halls ? 4.5 + rnd() * 3 : 6.5 + rnd() * 4.5;   // (halls: chamber-sized sheets)
    let got = false;
    for (let t = 0; t < 50 && !got; t++) {
      if (halls) { if (!hallsRandomSpot(R0 * 0.55 + 1.3, sp)) break; }
      else { const a = rnd() * 6.283, d = (0.25 + rnd() * 0.65) * shapeLimit(Math.cos(a), Math.sin(a)); sp[0] = Math.cos(a) * d; sp[1] = Math.sin(a) * d; }
      if (free(sp[0], sp[1], R0 * 0.75, halls)) got = true;
    }
    if (!got) continue;
    if (sheet(discs, rnd, sp[0], sp[1], R0, halls) > (halls ? 4 : 8)) big++;
  }
  if (big === 0 || discs.length < 10) return;
  ice.discs = discs; ice.on = true;
  buildGrid(discs);
}

function buildGrid(discs: IDisc[]): void {
  const hs = shape.maxR + 6, n = Math.ceil((hs * 2) / ICE_CELL);
  if (ice.grid.length < n * n) ice.grid = new Uint8Array(n * n); else ice.grid.fill(0);
  ice.n = n; ice.o = hs;
  const g = ice.grid;
  for (let q = 0; q < discs.length; q++) {
    const d = discs[q], r = d.r * 0.9, i0 = Math.max(0, Math.floor((d.x - r + hs) / ICE_CELL)), i1 = Math.min(n - 1, Math.floor((d.x + r + hs) / ICE_CELL));
    const j0 = Math.max(0, Math.floor((d.z - r + hs) / ICE_CELL)), j1 = Math.min(n - 1, Math.floor((d.z + r + hs) / ICE_CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * ICE_CELL - hs, z = (j + 0.5) * ICE_CELL - hs;
      if ((x - d.x) ** 2 + (z - d.z) ** 2 < r * r) g[j * n + i] = 1;
    }
  }
  let c = 0, tot = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * ICE_CELL - hs, cz = (j + 0.5) * ICE_CELL - hs;
    if (shape.kind === 'HALLS' ? hallsSdf(cx, cz) < 0.5 : !insideShape(cx, cz, 0.5)) continue;
    tot++; if (g[j * n + i] === 1) c++;
  }
  ice.coverage = tot ? c / tot : 0;
}
