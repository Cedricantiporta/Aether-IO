// ============================================================================
// The dense dressing of the kingdom (pure data + a tiny deterministic generator, no React / three): every hedge, grove, bush, flower bed,
// rock, haystack, cart and barrel cluster that fills the space between the buildings. Read by render/natureLayout.ts (nature kit v1 pieces),
// render/townKit.tsx (the barrel + crate clusters) and engine/systems/village.ts (FILL_COLLIDERS = what is solid).
//
// ONE PLACE FOR PIECE NAMES: `PIECES` maps a role (oak, pine, bush, hedge, rock ...) to kit piece names. Kit v3 swaps in better trees /
// bushes / hedges / carts by editing this table (and the per-entry `piece` strings of the explicit tables below). Nothing else changes.
// Every row is [x, z, yaw, scale] (+ optional separate height scale); heights come from the ground at draw time.
//
// The district plan this implements (docs/TOWN_PLAN.md has the map):
//   inside the walls  castle terrace N | plaza + statue centre | shop row facing it | market street (the avenue, stalls both sides) |
//                     residential lanes W / E of the avenue (houses 6 m apart, lawns, planters, hedged back gardens) | chapel quarter +
//                     graveyard (NW hill) | tavern square (NE) | the park + fountain (SW) | rises with cottages at both south corners
//   outside           gate meadow (groves, stable + paddock, east park) | the road to the portal through a forest | farm district (fields,
//                     barn, windmill, animals) | river with its bridges | lake + beach, pier + ship | mining camp | tower clearing
// Everything else is forest, hedges, rocks and props: nothing is left as bare grass or bare paving.
// ============================================================================
import { HORSE_STATUES } from './qtVillage';
import {
  TOWN_COLLIDERS, SHOP_LOOK, shopLocal, NK, HOUSES, LOTS, lotW, HOUSE_KIT, ROADS, NPCS, ANIMALS, TOWN_SEATS, FIELDS, FARM, TIERS, stairRun, RIVER, BRIDGE, MINE_BRIDGE, riverBank, isTownWater,
  PORTAL, BOSS_PORTAL, TOWER, TOWER_KNOLL, NESTS, ANIMAL_PEN, VILLAGE_NODES, WHEEL_PIN, HIDDEN_CAT, WALL, GATE, CASTLE, HERO_HOUSE, townLift, TERRACE, PLAZA, PLAZA_DECOR, WELL_POS, LAKE, PLAZA_STATUES, PORTAL_S,
  SIDE_GATES, PARK_EAST,
} from './townData';
import { TOWN_CHESTS } from './townChests';
import { QT_PREFIX, QT_FLOWERS, QT_GRASS, QT_CLOVER, QT_PEBBLES } from './qtData';
import { isV3, v3Ring, v3Disc, V3_BOX } from './kitV3Data';
import { BI_DAIS, BI_SOLIDS, BI_STATUES, BI_BOARD, BI_DECK, pathX } from './bossIsland';
import { SHOP_POSITIONS, shopFront } from '../constants';
import { islandRadius } from './mapgen';
import { beachZoneK, onDeckRect, FISH_SPOTS, CAMPFIRE, UMBRELLA, CRATES, NET_RACK, SHIP, DOCK } from './beachData';
import { inCampYard, inCaveClear, CAVE_DOOR } from './caveData';

/** role -> kit piece names (kit v3 trees / bushes + the nature kit's hedge, rocks, props). Piece sizes are normalised in engine/kitV3Data V3_K, so the scale ranges below keep the old numbers. */
export const PIECES = {
  oak: ['tree_oak_small', 'tree_oak_big', 'tree_birch', 'tree_oak_small'],
  pine: ['tree_pine_layered_a', 'tree_pine_layered_b'],
  palm: ['palm_v3'],
  fruit: ['tree_fruit'],
  blossom: ['tree_blossom'],
  willow: ['tree_willow'],
  bush: ['bush_cluster', 'bush_cluster', 'bush_cluster'],   // ([2] = the flowering one: one house corner in three)
  hedge: 'hedge_block',
  rock: ['rock_round_a', 'rock_cluster_small', 'rock_round_b', 'rock_cluster_small'],
  flowers: 'flower_patch',
  tuft: 'grass_tuft',
  mushrooms: 'mushroom_cluster',
  haystack: 'haystack',
  cart: 'market_cart',
  well: 'well',
  bench: 'park_bench',
  cabbage: 'crop_cabbage',
  pumpkin: 'crop_pumpkin',
  wheat: 'crop_wheat',
} as const;

export type FillRow = [x: number, z: number, ry: number, sx: number, sy: number, sz: number, ay?: number];
export const FILL: Record<string, FillRow[]> = {};
/** Solid fill: movement colliders [x, z, r] (village.placeVillageNodes adds them; the walk grid, projectiles and the minimap stay consistent). */
export const FILL_COLLIDERS: [number, number, number][] = [];
/** Barrel + crate clusters (town_kit_v2 barrel / crate, one merged mesh, render/townKit.tsx): [x, z, yaw]. */
export const CLUTTER_SPOTS: [number, number, number][] = [];

const TAU = Math.PI * 2;
// ---------------------------------------------------------------- deterministic helpers
function rng(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(l: readonly T[], r: number): T => l[Math.min(l.length - 1, Math.floor(r * l.length))];

// ---------------------------------------------------------------- what is already solid / reserved
const CELL = 4;
const grid = new Map<number, [number, number, number][]>();
const gk = (i: number, j: number): number => (i + 512) * 4096 + (j + 512);
function gridAdd(c: [number, number, number]): void {
  const i0 = Math.floor((c[0] - c[2]) / CELL), i1 = Math.floor((c[0] + c[2]) / CELL), j0 = Math.floor((c[1] - c[2]) / CELL), j1 = Math.floor((c[1] + c[2]) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = gk(i, j); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(c); }
}
for (const c of TOWN_COLLIDERS) gridAdd(c);
const solidNear = (x: number, z: number, pad: number): boolean => {
  const l = grid.get(gk(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!l) return false;
  for (const c of l) { const dx = c[0] - x, dz = c[1] - z, r = c[2] + pad; if (dx * dx + dz * dz < r * r) return true; }
  return false;
};
const addSolid = (x: number, z: number, r: number): void => { const c: [number, number, number] = [x, z, r]; FILL_COLLIDERS.push(c); gridAdd(c); };

/** Reserved ground: roads / lanes (+ half width), NPC homes + patrol legs, doors and shop fronts, stairs, fields, water, the camp, the portal ... */
const reserved: { x: number; z: number; r: number }[] = [];
const resv = (x: number, z: number, r: number): void => { reserved.push({ x, z, r }); };
const legs: [number, number, number, number, number][] = [];   // x1 z1 x2 z2 halfWidth
for (const rd of ROADS) legs.push([rd.x1, rd.z1, rd.x2, rd.z2, rd.w / 2 + 0.5]);
for (const n of NPCS) {
  if (n.area) continue;
  resv(n.home[0], n.home[1], 1.6);
  const p = n.patrol; if (p) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; legs.push([a[0], a[1], b[0], b[1], 1.3]); }
}
for (const a of ANIMALS) legs.push([a.x - a.rx, a.z, a.x + a.rx, a.z, a.rz + 1.4]);
for (const sp of SHOP_POSITIONS) { const f = shopFront(sp, 3.8); resv(f.x, f.z, 3.2); }
for (const [x, z] of NESTS) resv(x, z, 2.2);
// (owner) the animal pen stays clear of decor (animals wander it; the entrance must stay open)
for (let x = ANIMAL_PEN.x0 + 1; x < ANIMAL_PEN.x1; x += 2.5) for (let z = ANIMAL_PEN.z0 - 1; z < ANIMAL_PEN.z1; z += 2.5) resv(x, z, 2.2);
for (const n of VILLAGE_NODES) resv(n.x, n.z, 3.2);
resv(WHEEL_PIN.x, WHEEL_PIN.z, 2.4); resv(HIDDEN_CAT.x, HIDDEN_CAT.z, 2.4); resv(PORTAL.x, PORTAL.z, 5.5); resv(PORTAL.front.x, PORTAL.front.z, 3); resv(PORTAL.out.x, PORTAL.out.z, 3); resv(BOSS_PORTAL.x, BOSS_PORTAL.z, 5.5); resv(BOSS_PORTAL.front.x, BOSS_PORTAL.front.z, 3); resv(BOSS_PORTAL.out.x, BOSS_PORTAL.out.z, 3);
for (const h of HORSE_STATUES) resv(h.x, h.z, 2.4);   // (the horse statues by the portal)
resv(TOWER.door.x, TOWER.door.z, 4); resv(TOWER.out.x, TOWER.out.z, 3); resv(TOWER.x, TOWER.z, TOWER.r + 2); resv(CAVE_DOOR.x, CAVE_DOOR.z, 5); resv(0, CASTLE.z + 5, 6); resv(GATE.x, GATE.z + 2, 6);
for (const f of FISH_SPOTS) resv(f.x, f.z, 3.6);
resv(HERO_HOUSE.x, HERO_HOUSE.z - HERO_HOUSE.d / 2 - 1.1, 3.2); resv(HERO_HOUSE.wake.x, HERO_HOUSE.wake.z, 2.4);   // (the adventurer's door + wake spot)
for (const s of TOWN_SEATS) resv(s.x, s.z, 1.7);
for (const ch of TOWN_CHESTS) resv(ch.x, ch.z, 2.6);   // (the hidden treasure chests: no tree / bush / rock dropped on or right beside them)
for (const g of SIDE_GATES) for (const dx of [-3.5, 0, 3.5]) resv(g.x + dx, g.z, 2.6);   // (owner) the side gates' passages stay clear
const rects: [number, number, number, number][] = [];   // x0 z0 x1 z1
for (const F of [...FIELDS, FARM]) rects.push([F.x - F.hw - 1.5, F.z - F.hd - 1.5, F.x + F.hw + 1.5, F.z + F.hd + 1.5]);
for (const T of TIERS) {
  const run = stairRun(T.h);
  for (const s of T.stairs) {
    const a = s.c - s.hw - 0.9, b = s.c + s.hw + 0.9;
    if (s.side === 'S') rects.push([a, T.z1 - 1, b, T.z1 + run + 1]);
    else if (s.side === 'N') rects.push([a, T.z0 - run - 1, b, T.z0 + 1]);
    else if (s.side === 'E') rects.push([T.x1 - 1, a, T.x1 + run + 1, b]);
    else rects.push([T.x0 - run - 1, a, T.x0 + 1, b]);
  }
}
// (houses are axis-aligned boxes on the streets: no hedge / grove / bed of the loose fill may run through one)
for (const h of HOUSES) if (h.kit && Math.abs(h.x) < 44 && h.z > -40 && h.z < 37) { const k = HOUSE_KIT[h.kit], sc = h.s ?? 1, hw = k.half * sc + 0.2, d0 = (k.d / 2 + 0.4) * sc, d1 = k.front * sc; rects.push(h.rot ? [h.x - hw, h.z - d1, h.x + hw, h.z + d0] : [h.x - hw, h.z - d0, h.x + hw, h.z + d1]); }
rects.push([-BRIDGE.hw - 2, BRIDGE.z0 - 3, BRIDGE.hw + 2, BRIDGE.z1 + 3], [MINE_BRIDGE.x - 3, MINE_BRIDGE.z0 - 3, MINE_BRIDGE.x + 3, MINE_BRIDGE.z1 + 3]);
// the hermit's trail round the north-east corner and along the north wall (narrow, rocky): keep a 5 m lane
legs.push([55, -4, 55, -47, 2.6], [55, -47, 10, -47.5, 2.6], [10, -47.5, -44, -47.5, 2.6]);
const distSeg = (x: number, z: number, x1: number, z1: number, x2: number, z2: number): number => {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)) : 0;
  return Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
};
/** True when something solid or reserved is within `pad` of (x, z), or it is water / off the island. */
function blocked(x: number, z: number, pad = 0.4, edge = 3.6): boolean {
  if (solidNear(x, z, pad)) return true;
  for (const r of reserved) if ((r.x - x) ** 2 + (r.z - z) ** 2 < (r.r + pad) ** 2) return true;
  for (const l of legs) if (distSeg(x, z, l[0], l[1], l[2], l[3]) < l[4] + pad) return true;
  for (const q of rects) if (x > q[0] - pad && x < q[2] + pad && z > q[1] - pad && z < q[3] + pad) return true;
  if (Math.hypot(x, z) > islandRadius(Math.atan2(z, x)) - edge) return true;
  if (isTownWater(x, z) || onDeckRect(x, z, 2) >= 0 || beachZoneK(x, z) > 0.1) return true;
  if (x > RIVER.x0 - 2 && x < RIVER.x1 + 2 && z > riverBank(x, 0) - 1.4 && z < riverBank(x, 1) + 1.4) return true;
  if (inCampYard(x, z, 1) || inCaveClear(x, z, 1)) return true;
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER_KNOLL.r + 1) return true;
  if (Math.hypot(x - PORTAL.x, z - PORTAL.z) < 6 || Math.hypot(x - BOSS_PORTAL.x, z - BOSS_PORTAL.z) < 8) return true;   // (the portal's clearing)
  return false;
}
/** Free for a prop of radius r that also keeps `gap` from every earlier fill placement. */
const placed: { x: number; z: number; r: number }[] = [];
const placedGrid = new Map<number, { x: number; z: number; r: number }[]>();
function free(x: number, z: number, r: number, gap = 0.3, edge = 3.6): boolean {
  if (blocked(x, z, r + 0.2, edge)) return false;
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const l = placedGrid.get(gk(a, b)); if (l) for (const p of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r + gap) ** 2) return false; }
  return true;
}
function claim(x: number, z: number, r: number): void { const p = { x, z, r }; placed.push(p); const k = gk(Math.floor(x / CELL), Math.floor(z / CELL)); let l = placedGrid.get(k); if (!l) placedGrid.set(k, (l = [])); l.push(p); }
/** A barrel + crate cluster (render/townKit.tsx draws it): only where it fits, solid (r 1) like every other prop. */
function cluster(...l: [number, number, number][]): void {
  for (const [x, z, ry] of l) if (free(x, z, 1.1, 0.3, 1.5)) { CLUTTER_SPOTS.push([x, z, ry]); claim(x, z, 1.1); addSolid(x, z, 1.0); }
}
const put = (piece: string, x: number, z: number, ry: number, sx: number, sy = sx, sz = sx, ay?: number): void => { (FILL[piece] ??= []).push(ay === undefined ? [x, z, ry, sx, sy, sz] : [x, z, ry, sx, sy, sz, ay]); };

/** Collider radius per piece at scale 1 (0 = walk-through decoration: flowers, tufts, mushrooms, crops). */
export const SOLID_R: Record<string, number> = {
  tree_round_a: 0.8, tree_round_b: 0.8, tree_round_c: 0.8, tree_pine_a: 0.7, tree_pine_b: 0.7, palm_a: 0.6, palm_b: 0.6,
  bush_round: 0.85, bush_flower: 0.9, rock_round_a: 0.95, rock_round_b: 0.85, haystack: 1.9,
  // kit v3 (radius at the fill scale s; the drawn size is s x V3_K)
  tree_oak_big: 0.85, tree_oak_small: 0.75, tree_birch: 0.6, tree_fruit: 0.75, tree_blossom: 0.75, tree_willow: 0.85, tree_pine_layered_a: 0.65, tree_pine_layered_b: 0.6,
  palm_v3: 0.55, bush_cluster: 0.9, rock_cluster_small: 1.0,
};

/** One solid prop: placed only where it fits (never on a road / door / NPC leg), with its collider. Returns whether it was placed. */
function prop(piece: string, x: number, z: number, ry: number, s: number, sy?: number, gap = 0.25): boolean {
  const r = (SOLID_R[piece] ?? 0) * s;
  if (!free(x, z, Math.max(r, 0.35), r > 0 ? gap : 0.1)) return false;
  put(piece, x, z, ry, s, sy); claim(x, z, Math.max(r, 0.35)); if (r > 0) addSolid(x, z, r);
  return true;
}
/** Walk-through decoration (flowers, tufts): only needs the ground to be free of roads / doors / water. */
const deg = (d: number): number => (d * Math.PI) / 180;
function deco(piece: string, x: number, z: number, ry: number, s: number, sy?: number): boolean {
  if (piece === PIECES.tuft) return false;   // (owner 2026-10-22: no loose grass tufts; owner 2026-10-31: the flower-on-mound patches + little mushroom clusters are back - they are the look he likes)
  if (blocked(x, z, 0.1, 2.6)) return false;
  put(piece, x, z, ry, s, sy); return true;
}

// ---------------------------------------------------------------- generators
/** A hedge along a run (hedge_block is 2.04 m long): pieces end to end, one collider every ~0.95 m. Skips pieces that would sit on a reserved spot. */
function hedge(x1: number, z1: number, x2: number, z2: number, s = 1): void {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / (2.0 * s))), ry = Math.atan2(-dz, dx);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x1 + dx * t, z = z1 + dz * t, L = len / n;
    if (blocked(x, z, 0.35, 2.6)) continue;
    put(PIECES.hedge, x, z, ry, (L / 2.04) * 1.04, s, s);   // (stretched along the run to meet the next piece)
    const m = Math.max(1, Math.round(L / 0.95));
    for (let k = 0; k < m; k++) { const u = (k + 0.5) / m - 0.5; addSolid(x + (dx / len) * L * u, z + (dz / len) * L * u, 0.5 * s); }
  }
}
interface Zone { cx: number; cz: number; rx: number; rz: number }
const inZone = (zn: Zone, x: number, z: number): boolean => ((x - zn.cx) / zn.rx) ** 2 + ((z - zn.cz) / zn.rz) ** 2 <= 1;
/** Scatter `n` solid props of the given roles inside an ellipse (rejection sampling, `gap` apart). */
function grove(zn: Zone, n: number, roles: { piece: readonly string[]; w: number; s: [number, number] }[], seed: number, gap = 0.8, edge = 3.6): number {
  const r = rng(seed), tw = roles.reduce((a, q) => a + q.w, 0);
  let placedN = 0;
  for (let t = 0; t < n * 40 && placedN < n; t++) {
    const x = zn.cx + (r() * 2 - 1) * zn.rx, z = zn.cz + (r() * 2 - 1) * zn.rz;
    if (!inZone(zn, x, z)) continue;
    let w = r() * tw, role = roles[0]; for (const q of roles) { if (w < q.w) { role = q; break; } w -= q.w; }
    const s = role.s[0] + r() * (role.s[1] - role.s[0]), piece = pick(role.piece, r());
    const rad = (SOLID_R[piece] ?? 0.5) * s;
    if (!free(x, z, rad, gap, edge)) continue;
    put(piece, x, z, r() * TAU, s, s * (0.92 + r() * 0.2)); claim(x, z, rad); if (SOLID_R[piece]) addSolid(x, z, rad); placedN++;
  }
  return placedN;
}
/** Walk-through scatter (flower beds, tufts, mushrooms) inside an ellipse. */
function carpet(zn: Zone, n0: number, piece: string, s: [number, number], seed: number): void {
  const r = rng(seed), n = Math.max(1, Math.round(n0 * (piece === PIECES.flowers ? 0.34 : piece === PIECES.mushrooms ? 0.4 : 1))), big = piece === PIECES.flowers ? 1.3 : 1;   // (a flower patch is ~950 triangles: fewer, bigger beds)
  for (let t = 0, k = 0; t < n * 12 && k < n; t++) {
    const x = zn.cx + (r() * 2 - 1) * zn.rx, z = zn.cz + (r() * 2 - 1) * zn.rz;
    if (!inZone(zn, x, z) || blocked(x, z, 0.8)) continue;   // (owner 2026-10-24: never on a road / soil path)
    const sc = (s[0] + r() * (s[1] - s[0])) * big;
    if (deco(piece, x, z, r() * TAU, sc, sc * (0.85 + r() * 0.3))) k++;
  }
}
const Z = (cx: number, cz: number, rx: number, rz: number): Zone => ({ cx, cz, rx, rz });
const Z0 = Z;
const OAKS = (w: number, s: [number, number] = [0.85, 1.1]) => ({ piece: PIECES.oak, w, s });
const PINES = (w: number, s: [number, number] = [0.85, 1.15]) => ({ piece: PIECES.pine, w, s });
const FRUITS = (w: number, s: [number, number] = [0.85, 1.05]) => ({ piece: PIECES.fruit, w, s });
const BLOSSOMS = (w: number, s: [number, number] = [0.9, 1.1]) => ({ piece: PIECES.blossom, w, s });
const BUSHES = (w: number, s: [number, number] = [0.55, 0.85]) => ({ piece: PIECES.bush, w, s });
const ROCKS = (w: number, s: [number, number] = [0.5, 0.9]) => ({ piece: PIECES.rock, w, s });

// ================================================================ INSIDE THE WALLS
// ---- shop dressing (nature kit pieces of SHOP_LOOK; the v2 pieces are drawn by render/townKit.tsx): placed solid, in the shop's local frame
for (const sp of SHOP_POSITIONS) {
  const L = SHOP_LOOK[sp.type]; if (!L) continue;
  for (const [piece, dx, dz, yaw, sc, col, py] of L.nk) {
    const [x, z] = shopLocal(sp.position[0], sp.position[2], sp.rot ?? 0, dx, dz), ry = (sp.rot ?? 0) + yaw;
    if (isV3(piece)) {   // kit v3 signature pieces: `col` > 0 one disc, < 0 a ring round the footprint
      put(piece, x, z, ry, sc, sc, sc, py !== undefined ? townLift(x, z) + py : undefined); claim(x, z, 1);
      const cc: [number, number, number][] = [];
      if (col && col > 0) v3Disc(cc, piece, x, z, ry, sc, col); else if (col && col < 0) v3Ring(cc, piece, x, z, ry, sc, -col, true);
      for (const c of cc) addSolid(c[0], c[1], c[2]);
      continue;
    }
    put(piece, x, z, ry, sc); claim(x, z, 1);
    if (piece === 'market_cart') { const f = NK.market_cart; for (const o of [-0.6, 0.6]) addSolid(x + o * sc * Math.cos(sp.rot ?? 0), z + (f[3] - 1.2) * sc * 0.4, 0.9 * sc); }
    else if (SOLID_R[piece]) addSolid(x, z, SOLID_R[piece] * sc);
    else if (piece === 'chicken_coop') addSolid(x, z, 1.1 * sc);
  }
}
// (owner: no flower patches scattered on the town paving)
// ================================================================ KIT V3 DECOR (owner 2026-10-21): landmarks + props of the new kit
/** Decor that did not fit (logged by the layout check: engine/townFill DECOR_SKIPPED). */
export const DECOR_SKIPPED: string[] = [];
type DecorOpt = { y?: number; solid?: 'ring' | 'fill' | 'disc' | 'legs' | 'none'; r?: number; force?: boolean; sy?: number; rad?: number };
/** One kit v3 prop: placed only where it fits (never on a road / door / NPC leg, `force` skips the check), with a collider from its footprint (ring / fill / disc, `legs` = the two posts of an arch). */
function decor(piece: string, x: number, z: number, ry: number, s = 1, o: DecorOpt = {}): boolean {
  const b = V3_BOX[piece]; if (!b) return false;
  const rad = o.rad ?? Math.max(b[1] - b[0], b[3] - b[2]) * 0.5 * s * 0.8;
  if (!o.force && !free(x, z, rad, 0.15, 1.5)) { DECOR_SKIPPED.push(`${piece}@${x},${z}`); return false; }
  put(piece, x, z, ry, s, o.sy ?? s, s, o.y); claim(x, z, Math.min(rad, 2.4));
  const cc: [number, number, number][] = [], kind = o.solid ?? 'ring', r = o.r ?? 0.6;
  if (kind === 'ring') v3Ring(cc, piece, x, z, ry, s, r, false); else if (kind === 'fill') v3Ring(cc, piece, x, z, ry, s, r, true); else if (kind === 'disc') v3Disc(cc, piece, x, z, ry, s, r);
  else if (kind === 'legs') for (const sd of [-1, 1]) { const lx = sd * (b[1] - 0.55) * s; cc.push([x + lx * Math.cos(ry), z - lx * Math.sin(ry), r]); }
  for (const c of cc) addSolid(c[0], c[1], c[2]);
  return true;
}
// ---- the plaza (owner 2026-10-24: the Adventure Portal left it, the paved disc is open): four double lamps on the rim diagonals (the two benches are TOWN_SEATS); nothing else (TownScenery addPlaza draws the plinths)
// ---- the Adventure Portal (kit v3, scale PORTAL_S, front north, down the forest road) stands in the forest clearing south of the walls, where the Endless Tower used to be
put('adventure_portal', PORTAL.x, PORTAL.z, PORTAL.ry, PORTAL_S, PORTAL_S, PORTAL_S, 0);
put('adventure_portal', BOSS_PORTAL.x, BOSS_PORTAL.z, BOSS_PORTAL.ry, PORTAL_S, PORTAL_S, PORTAL_S, 0);   // (owner 2026-10-26: the Boss Trials portal on the south-west headland; Town.tsx tints it purple)
// ---- (owner 2026-10-31) the Boss Trials headland dressed as a place (layout data: engine/bossIsland.ts; the built pieces - dais, pillars, runes, banners, altar, lanterns, deck - are render/bossIsland.ts):
// kit props here: boss statues, notice board, bench + trees / bushes / flowers (every tree gets a little undergrowth nest like the forest outskirts), rocks and tufts along the shore, flower patches along the path.
{
  for (const [x, z, r] of BI_SOLIDS) { addSolid(x, z, r); claim(x, z, r + 0.2); }
  claim(BI_DAIS.x, BI_DAIS.z, BI_DAIS.r + 0.6);
  for (const st of BI_STATUES) put('statue_hero', st.x, st.z, st.ry, 0.34, 0.34, 0.34, 0.5);
  decor('notice_board', BI_BOARD.x, BI_BOARD.z, BI_BOARD.ry, 1, { solid: 'ring', r: 0.4, rad: 1.0, force: true });
  put(PIECES.bench, BI_DECK.x - 0.2, BI_DECK.z - 0.3, Math.PI, 1, 1, 1, 0.14); addSolid(BI_DECK.x - 0.2, BI_DECK.z - 0.3, 0.7); claim(BI_DECK.x, BI_DECK.z, 5.5);
  const r = rng(2610);
  /** a small flower patch / bush / tuft / mushroom nest, walk-through except the bushes (owner: flowers + bushes huddle round the foot of every tree) */
  const bloom = (x: number, z: number, s: number): void => { if (!blocked(x, z, 0.1, 2.0)) put(PIECES.flowers, x, z, r() * TAU, s, s * (0.85 + r() * 0.3), s); };
  const nest = (x: number, z: number, rad: number): void => {
    const nb = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) { const a = r() * TAU, d = rad + 0.4 + r() * 0.9; prop(pick(PIECES.bush, r()), x + Math.cos(a) * d, z + Math.sin(a) * d, r() * TAU, 0.5 + r() * 0.32, undefined, 0.1); }
    const nf = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nf; k++) { const a = r() * TAU, d = rad + 0.5 + r() * 1.5; bloom(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.55 + r() * 0.45); }
    for (let k = 0; k < 2; k++) { const a = r() * TAU, d = rad + 0.2 + r() * 1.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (!blocked(px, pz, 0.1, 2.0)) put(k ? PIECES.mushrooms : PIECES.tuft, px, pz, r() * TAU, k ? 0.5 + r() * 0.3 : 0.8 + r() * 0.5); }
  };
  const tree = (piece: readonly string[], x: number, z: number, s: number): void => { const p = pick(piece, r()); if (prop(p, x, z, r() * TAU, s, s * (0.92 + r() * 0.2), 0.4)) nest(x, z, (SOLID_R[p] ?? 0.7) * s); };
  // trees with undergrowth: a west copse, an east copse by the path, the back (south-west) and a few on the lookout side
  for (const [x, z, k] of [[-54, 136, 0], [-50.5, 142, 1], [-56, 146, 0], [-52, 153, 1], [-57, 158, 0], [-48, 160, 1], [-28.5, 128, 1], [-27, 134, 0], [-24.5, 140, 1], [-22.5, 147, 0], [-19, 139, 1], [-17.5, 146, 0], [-20, 153, 1], [-17, 158, 0], [-23, 161, 1], [-46, 161, 1], [-37, 162.2, 0]] as const) tree(k ? PIECES.pine : PIECES.oak, x + (r() - 0.5), z + (r() - 0.5), 0.8 + r() * 0.3);
  tree(PIECES.blossom, -30.5, 143.5, 0.95); tree(PIECES.fruit, -49.5, 148, 0.95); tree(PIECES.blossom, -53.5, 130, 0.95);
  // bushes, flower patches and tufts along the dirt path (both edges) and round the dais rim
  for (let z = 116; z < 146; z += 2.6) for (const sd of [-1, 1]) { if (r() < 0.45) continue; const off = 2.7 + r() * 1.6; if (r() < 0.4) prop(pick(PIECES.bush, r()), pathX(z) + sd * (off + 0.4), z + r(), r() * TAU, 0.5 + r() * 0.3, undefined, 0.1); else bloom(pathX(z) + sd * off, z + r(), 0.6 + r() * 0.5); }
  for (let k = 0; k < 16; k++) { const a = deg(160 + k * 14 + r() * 8), d = BI_DAIS.r + 1.0 + r() * 1.2; const x = BI_DAIS.x + Math.cos(a) * d, z = BI_DAIS.z + Math.sin(a) * d; if (k % 3 === 0) prop(pick(PIECES.bush, r()), x, z, r() * TAU, 0.55 + r() * 0.3, undefined, 0.1); else bloom(x, z, 0.7 + r() * 0.5); }
  // rocks + tufts along the shore, a few flower beds on the meadow
  for (let k = 0; k < 14; k++) { const x = -60 + r() * 42, z = 163.5 + r() * 2.2; prop(pick(PIECES.rock, r()), x, z, r() * TAU, 0.55 + r() * 0.5, undefined, 0.2); }
  for (let k = 0; k < 8; k++) prop(pick(PIECES.rock, r()), -62 + r() * 1.5, 132 + r() * 30, r() * TAU, 0.6 + r() * 0.5, undefined, 0.2);
  for (let k = 0; k < 22; k++) bloom(-58 + r() * 34, 130 + r() * 30, 0.7 + r() * 0.6);
}
{
  const D = PLAZA_DECOR;
  for (const m of PLAZA_STATUES) put('statue_hero', m.x, m.z, 0, m.s, m.s, m.s, D.statueY);
  claim(PLAZA.x, PLAZA.z, PLAZA.r + 0.3);
  for (const sx of [-1, 1]) for (const dz of [-1, 1]) decor('lamp_post_double', PLAZA.x + sx * 5.7, PLAZA.z + dz * 5.7, 0, 1, { solid: 'disc', r: 0.35, force: true });
  decor('banner_pole', -5.4, -16.6, 0, 1, { solid: 'disc', r: 0.35 }); decor('banner_pole', 5.4, -16.6, 0, 1, { solid: 'disc', r: 0.35 });
}
// ---- the castle terrace's great flight: stairs_stone stretched to the lift ramp (TERRACE: z1 -> stairZ over h; the code-built steps in TownScenery addTerrace are gone)
{ const T = TERRACE, run = T.stairZ - T.z1; put('stairs_stone', 0, T.z1 + run + 0.5 * (-1.9 + 2.23) * 0 - 2.23 * (run / 4.13), 0, (T.stairHw * 2) / 4.18, T.h / 1.75, run / 4.13, 0); }
// ---- the market street: two market_tents (red / green) a side between the stalls, a flower cart on the south street
// (owner: the open market tents looked unfinished: removed, with the market stalls in townData STALLS)
{ let n = 0; for (const [x, z, ry] of [[-20.0, 12.9, 0.3], [-4.6, 13.0, 0.2], [4.8, 13.0, -0.2], [17.0, 13.0, -0.3], [-33, 12.9, 0.1]] as const) if (n < 2 && decor('flower_cart', x, z, ry, 1, { solid: 'ring', r: 0.5, rad: 0.8 })) n++; }
// ---- the notice board where the old quest board stood, 
for (const [x, z] of [[-3.8, -8.4], [3.8, -8.4], [16.4, -9.0], [-16.4, -9.0]]) if (decor('notice_board', x, z, 0, 1, { solid: 'ring', r: 0.4, rad: 1.0 })) break;
// ---- (owner 2026-10-23: dense medieval town) cosy dressing in the pockets between the house rows: each is skipped when it does not fit
for (const [pc, x, z, ry, sc] of [
  ['flower_cart', 14.4, 30.6, 0.3, 1],   // (owner 2026-10-24: no carts in front of the castle steps)
  ['fruit_crate', 32.4, 28, 0.3, 1], ['fruit_crate', -33.6, 28, -0.3, 1], ['fruit_crate', 31.2, -36.8, 0.2, 1],
  ['potted_plant_a', -26.4, 24.9, 0, 1], ['potted_plant_b', 7.2, 14.8, 0, 1], ['potted_plant_a', 18, 14.8, 0, 1], 
  ['flower_bed_long', -33.6, -16.4, 0, 0.8], ['flower_bed_long', 8.4, 30.4, 0, 0.8], ['flower_bed_long', -36, 8.2, 0, 0.8],
] as [string, number, number, number, number][]) decor(pc, x, z, ry, sc, { solid: 'ring', r: 0.45 });
// ---- (park entrances: no arches)
// (owner 2026-10-24: the hedge arches are gone)
// ---- landmark outside: the Coral Isles ship at the pier head
put('ship_big', SHIP.x, SHIP.z, Math.PI / 2, 1.5, 1.5, 1.5, -0.1);
// ---- the beach: umbrella, crates, net rack, campfire (positions + colliders: engine/beachData)
put('beach_umbrella', UMBRELLA.x, UMBRELLA.z, 0.4, 1, 1, 1, 0); put('beach_crates', CRATES[0][0], CRATES[0][1], 0.3, 1, 1, 1, 0); put('campfire', CAMPFIRE.x, CAMPFIRE.z, 0, 1, 1, 1, 0);
put('fishing_net_rack', NET_RACK.x, NET_RACK.z, NET_RACK.rot, 1, 1, 1, 0);
// ---- reeds + lily pads in the water along both river banks and the lake's east shore (no colliders: they stand in the water)
{
  const r = rng(731);
  for (let x = -66; x <= 60; x += 4.2) {
    if (Math.abs(x) < BRIDGE.hw + 3 || Math.abs(x - MINE_BRIDGE.x) < MINE_BRIDGE.hw + 2.5) continue;
    for (const side of [0, 1] as const) {
      const bz = riverBank(x, side), dir = side === 0 ? 1 : -1;
      if (r() < 0.55) put('reed_cluster', x + (r() - 0.5) * 2, bz + dir * (0.5 + r() * 0.8), r() * TAU, 0.8 + r() * 0.5, 0.8 + r() * 0.5, 0.8 + r() * 0.5, -0.32);
      if (r() < 0.4) put('lily_pads', x + 1.2 + r() * 2, bz + dir * (1.8 + r() * 2.4), r() * TAU, 0.8 + r() * 0.6, 1, 0.8 + r() * 0.6, -0.2);
    }
  }
  for (let z = -6; z <= 80; z += 4.6) {   // the lake's east shore along the town wall and the mainland
    if (z > DOCK.z - 7 && z < DOCK.z + 7) continue;
    let x = LAKE.x1 + 3.5; while (x > LAKE.x1 - 22 && !isTownWater(x, z)) x -= 0.6;
    if (x <= LAKE.x1 - 22 || onDeckRect(x, z, 2) >= 0) continue;
    if (r() < 0.6) put('reed_cluster', x - 0.9 - r(), z + (r() - 0.5) * 1.5, r() * TAU, 0.8 + r() * 0.5, 0.9 + r() * 0.5, 0.8 + r() * 0.5, -0.3);
    if (r() < 0.5) put('lily_pads', x - 2.6 - r() * 2, z + (r() - 0.5) * 2, r() * TAU, 0.8 + r() * 0.6, 1, 0.8 + r() * 0.6, -0.17);
  }
}
// ---- the park round the fountain: blossom trees + bushes
for (const [gx, gz] of [[WELL_POS.x, 12.6], [-15.3, 17.6], [WELL_POS.x, 21.4]]) resv(gx, gz, 2.4);   // the park's N / E / S entrance gaps stay free
grove(Z(WELL_POS.x + 0.3, WELL_POS.z, 6.8, 4.4), 3, [BLOSSOMS(1)], 29, 0.6, 1.4);
// ---- (owner 2026-10-24) more green inside the town: round trees + bushes between the buildings and along the terrace edges (all textured Quaternius pack-1 pieces via natureLayout.qtForest); each only where it fits
grove(Z(-17, -12.8, 7, 2.4), 3, [OAKS(2, [0.75, 0.95]), BUSHES(3, [0.6, 0.85])], 811, 0.7, 1.4); grove(Z(17, -12.8, 7, 2.4), 3, [OAKS(2, [0.75, 0.95]), BUSHES(3, [0.6, 0.85])], 812, 0.7, 1.4);   // (south of the Chapel Hill / Tavern Row edges)
grove(Z(-33, -10.8, 8, 1.6), 3, [BUSHES(3, [0.6, 0.85]), OAKS(1, [0.7, 0.9])], 813, 0.7, 1.4); grove(Z(38, -10.8, 5, 1.6), 2, [BUSHES(3, [0.6, 0.85])], 814, 0.7, 1.4);
grove(Z(-6, 15.4, 3.2, 1.2), 2, [BUSHES(3, [0.55, 0.75])], 815, 0.6, 1.4); grove(Z(6.4, 15.4, 3.2, 1.2), 2, [BUSHES(3, [0.55, 0.75])], 816, 0.6, 1.4);   // (either side of the avenue below the south street)
grove(Z(-28, 30, 5, 2), 3, [OAKS(1, [0.65, 0.85]), BUSHES(3, [0.55, 0.8])], 817, 0.6, 1.4); grove(Z(28, 30, 5, 2), 3, [OAKS(1, [0.65, 0.85]), BUSHES(3, [0.55, 0.8])], 818, 0.6, 1.4);
grove(Z(-23, 8, 2.2, 2), 2, [OAKS(1, [0.7, 0.9]), BUSHES(2, [0.6, 0.8])], 819, 0.6, 1.4); grove(Z(23.4, 7, 2, 2.5), 2, [BUSHES(1, [0.6, 0.8])], 820, 0.6, 1.4);
// ---- the garden strip along the south wall (z 33..36): beds, bushes, small trees; the avenue + hero's door stay free
// ---- the rises (cottages at both south corners)
grove(Z(-36.5, 22.4, 6.4, 1.8), 2, [OAKS(1, [0.6, 0.8])], 23, 0.6, 1.4); grove(Z(36.5, 22.4, 6.4, 1.8), 2, [OAKS(1, [0.6, 0.8])], 24, 0.6, 1.4);   // (owner: no loose bushes on the town paving)
// ---- chapel quarter: a cloister garden east of the chapel (hedged on three sides, beds inside), pines on the hill's north edge
hedge(-22.6, -37.2, -13.4, -37.2); hedge(-13.4, -37.2, -13.4, -22.6);
grove(Z(-31, -37.4, 5, 1.4), 4, [PINES(1, [0.8, 1])], 32, 1.0, 2.4); grove(Z(-11.8, -26, 1.2, 9), 5, [PINES(1, [0.8, 1.05])], 33, 1.0, 2.4);
// ---- trainer yard (north of the street, west of the castle path): hay, crates, a verge of flowers
// (owner 2026-10-22: loose barrels / crates are tucked against walls, never in the open: the hill's retaining wall, the terrace corner)
cluster([-32.6, -18.1, 0.2], [-9.4, -16.6, 0.3]);

// ---- castle approach: a bush + bed either side of the terrace stairs' foot

// ---- tavern square + Tavern Row: barrels and crates by the stairs and the tables, a verge of beds, hedged back gardens behind the row
cluster([23.4, -15.2, 0.4], [34.2, -15.2, -0.4], [12.9, -14.9, 1.6], [24.3, -32.4, 0.9], [35.6, -33.0, 2.2], [42.0, -22.5, 0.2]);   // (against the Tavern Row retaining wall, the back houses' sides and the east wall)

// ---- plaza + shop row: beds between the shops' backs and the street, banners are in townKit
// (inside the sealed pockets between the houses, hugging a house wall: not on any walkway)
cluster([-35.9, 4.6, 0.7], [-25.6, 4.4, 2.1]);
// ---- along the inside of the wall: a ragged line of bushes (the paving is bare up to the wall otherwise)
for (const sx of [-1, 1]) {
  grove(Z(sx * 42.6, 0, 0.7, 38), 22, [PINES(1, [0.55, 0.7])], 71 + sx, 0.5, 1.2);   // (owner: no bushes along the walls)
}
grove(Z(0, -38.6, 42, 0.9), 10, [PINES(1, [0.6, 0.8])], 73, 0.6, 1.2);

// ================================================================ OUTSIDE: THE GATE MEADOW (z 38..60)
// west half: a thick grove of oaks and pines (the woodcutters' wood) with the beach path + the carts' lane left open; flowers on the clearings
grove(Z(-30, 49.5, 16, 9), 18, [OAKS(5), PINES(2), BUSHES(4, [0.6, 0.95])], 101, 0.7);
grove(Z(-6, 56, 8, 4), 5, [BUSHES(3), OAKS(1, [0.8, 1])], 102, 0.8);
// the gate's flanks and the bit between the stable and the east park
grove(Z(-14, 42.4, 9, 2.2), 4, [BUSHES(3, [0.55, 0.8]), OAKS(1, [0.7, 0.9])], 103, 0.7); grove(Z(40, 44, 6, 6), 5, [OAKS(2), BUSHES(3), PINES(1)], 104, 0.8);
carpet(Z(-20, 47, 14, 6), 36, PIECES.flowers, [0.8, 1.3], 105); carpet(Z(10, 56, 18, 3), 22, PIECES.flowers, [0.8, 1.3], 106);
hedge(24, 41.8, 31, 41.8); hedge(-8, 40.4, -16, 40.4);
prop(PIECES.haystack, -44, 45, 0.3, 0.8); prop(PIECES.haystack, -41, 47.5, 1.2, 0.7);
// ================================================================ OUTSIDE: RIVER BANKS (bushes, rocks, reeds on both banks)
for (let x = -44; x <= 54; x += 3.0) {
  const rr = rng(Math.floor(x * 10) + 900);
  for (const side of [0, 1] as const) {
    const bz = riverBank(x, side) + (side === 0 ? -1.9 : 1.9) + (rr() - 0.5) * 1.2;
    if (rr() < 0.22) prop(rr() < 0.6 ? PIECES.bush[0] : PIECES.bush[1], x + (rr() - 0.5), bz, rr() * TAU, 0.55 + rr() * 0.3, undefined, 0.2);
    else if (rr() < 0.2) prop(pick(PIECES.rock, rr()), x, bz + (side ? 0.3 : -0.3), rr() * TAU, 0.45 + rr() * 0.4, undefined, 0.2);
    deco(PIECES.tuft, x + 0.6, bz + (side ? -0.5 : 0.5), rr() * TAU, 0.9 + rr() * 0.7);
  }
}
for (let x = -44; x <= 54; x += 7) {   // willows by the water: the south bank in a row, a few on the north bank
  const rr = rng(Math.floor(x) + 1400);
  if (rr() < 0.7) prop(PIECES.willow[0], x + rr() * 3, riverBank(x, 1) + 4.2 + rr() * 1.2, rr() * TAU, 0.9, undefined, 0.5);
  if (rr() < 0.35) prop(PIECES.willow[0], x + 3 + rr() * 3, riverBank(x, 0) - 3.8 - rr(), rr() * TAU, 0.85, undefined, 0.5);
}
// ================================================================ OUTSIDE: THE MAINLAND (z 76..130)
// west: an orchard of round trees in rows, then meadow flowers; the lakeshore is rocks + palms (beachData)
{
  const r = rng(301);
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) { const x = -42 + ix * 4.4 + (iz % 2) * 2.2 + (r() - 0.5) * 0.6, z = 80.5 + iz * 4.6 + (r() - 0.5) * 0.6; prop(PIECES.fruit[0], x, z, r() * TAU, 0.85 + r() * 0.2, undefined, 0.3); }
}
carpet(Z(-38, 91, 7, 12), 30, PIECES.flowers, [0.8, 1.2], 302);
grove(Z(-8, 86, 3.5, 6), 3, [BUSHES(3), OAKS(1, [0.75, 0.95])], 303, 0.7);
grove(Z(10.5, 98, 3.6, 18), 6, [FRUITS(2), OAKS(1), PINES(1), BUSHES(3)], 304, 0.8);   // east of the road, west of the fields (the strip along the fence)
grove(Z(56, 96, 6, 16), 7, [PINES(3), OAKS(1), ROCKS(2, [0.6, 1.1])], 305, 0.9);
grove(Z(-25, 108, 20, 2.4), 4, [BUSHES(3), OAKS(1, [0.7, 0.9])], 306, 0.8);   // north verge of the Brewer's lane
// the hamlets: hedges, beds, hay and crates between the houses
cluster([17.8, 123.2, 0.4], [28, 121.8, 1.9], [-18.2, 123.2, 0.5], [-28.6, 122.6, 2.5], [-37.8, 123.4, 1.1]);
for (const hx of [13, 23, 32, -13.5, -23.5, -33, -42]) { prop(PIECES.bush[0], hx - 3.4, 123.2, hx, 0.7); prop(PIECES.bush[1], hx + 3.4, 123.6, hx + 1, 0.65); deco(PIECES.flowers, hx + 1.2, 125.2, hx, 1.0); }
prop(PIECES.haystack, 36.5, 121, 0.6, 0.7); prop(PIECES.haystack, -46.5, 122.5, 0.2, 0.7);
carpet(Z(-4, 118, 3, 6), 10, PIECES.flowers, [0.8, 1.1], 307);
grove(Z(0, 125, 20, 3), 6, [BUSHES(3), OAKS(1, [0.7, 0.9]), PINES(1)], 308, 0.8);
// ================================================================ OUTSIDE: THE TOWER ROAD (a forest on both sides, the road itself stays open; the Endless Tower stands at its end)
grove(Z(-7, 148, 13, 18), 24, [PINES(4), OAKS(2), BUSHES(3, [0.6, 0.9]), ROCKS(1, [0.6, 1])], 401, 0.7, 2.4);
grove(Z(17, 148, 11, 18), 18, [PINES(4), OAKS(2), BUSHES(3, [0.6, 0.9]), ROCKS(1, [0.6, 1])], 402, 0.7, 2.4);
grove(Z(5, 161, 15, 8), 22, [PINES(4), OAKS(3), BUSHES(2)], 403, 0.7, 2.4);
grove(Z(-40, 160, 15, 4), 16, [PINES(4), OAKS(3), BUSHES(2)], 407, 0.7, 2.4);   // (owner 2026-10-26) a screen of trees behind the Boss Trials portal   // (owner 2026-10-24) the Adventure Portal's back: a thick wall of trees behind it
grove(Z(5, 172, 20, 8), 18, [PINES(4), OAKS(2), BUSHES(2)], 405, 0.7, 2.4);
// ---- the Endless Tower's own clearing (east, deeper): forest round its back and sides, its dirt path stays open
grove(Z(31, 176, 20, 8), 20, [PINES(4), OAKS(2), BUSHES(3, [0.6, 0.9]), ROCKS(1, [0.6, 1])], 406, 0.7, 2.4);
grove(Z(46, 160, 7, 14), 10, [PINES(4), OAKS(2), BUSHES(2)], 407, 0.7, 2.4);
grove(Z(24, 160, 9, 6), 8, [PINES(3), OAKS(2), BUSHES(2)], 408, 0.7, 2.4);
carpet(Z(3, 138, 5, 12), 16, PIECES.flowers, [0.8, 1.1], 404);
// ================================================================ OUTSIDE: THE OLD TOWER SITE (west, z 100..125): just forest now
grove(Z(-62, 108, 22, 6), 14, [PINES(3), OAKS(2), BUSHES(3), ROCKS(1)], 501, 0.7, 2.4);
grove(Z(-62, 118.6, 22, 3), 7, [PINES(3), OAKS(1), BUSHES(3)], 502, 0.7, 2.4);
// ================================================================ OUTSIDE: THE MINES' SIDE + THE NORTH RING
grove(Z(61, 60, 5, 22), 10, [PINES(3), ROCKS(2, [0.6, 1.1]), OAKS(1)], 601, 0.8, 2.6);
grove(Z(60, 110, 8, 8), 6, [PINES(3), OAKS(1), ROCKS(1)], 602, 0.8, 2.6);
grove(Z(58, -2, 8, 9), 5, [PINES(3), ROCKS(2, [0.6, 1.1]), BUSHES(2)], 603, 0.8, 2.6);
grove(Z(0, -47, 34, 5), 16, [PINES(3), OAKS(2), ROCKS(2, [0.6, 1.1]), BUSHES(3)], 604, 0.8, 2.4);
// stones + tufts on every bare outer edge of the meadows
carpet(Z(0, 56, 44, 3), 60, PIECES.tuft, [0.9, 1.4], 701); carpet(Z(0, 112, 50, 14), 80, PIECES.tuft, [0.9, 1.4], 702); carpet(Z(30, 30, 24, 20), 40, PIECES.tuft, [0.9, 1.4], 703);
carpet(Z(0, -47, 40, 4), 40, PIECES.mushrooms, [0.8, 1.2], 704);
// (owner 2026-10-31) more flower-on-mound patches in the sparse outskirts meadows (carpet() keeps them off roads / soil paths / buildings / fields via blocked(), and thins to ~1/3: 'n' is the pre-thinning count)
carpet(Z(0, 56, 44, 3), 70, PIECES.flowers, [0.8, 1.2], 711); carpet(Z(0, 112, 50, 14), 90, PIECES.flowers, [0.8, 1.2], 712); carpet(Z(30, 30, 24, 20), 50, PIECES.flowers, [0.8, 1.2], 713);
carpet(Z(-44, 30, 12, 16), 36, PIECES.flowers, [0.8, 1.2], 714); carpet(Z(0, -47, 40, 4), 50, PIECES.flowers, [0.8, 1.2], 715);
carpet(Z(0, 112, 50, 14), 24, PIECES.mushrooms, [0.8, 1.1], 716); carpet(Z(-44, 30, 12, 16), 16, PIECES.mushrooms, [0.8, 1.1], 717);

// ================================================================ QUATERNIUS DECOR (owner 2026-10-24: "use the nature kit on various parts")
// Walk-through dressing from public/models/nature_qt.glb (render/qtNature.tsx): bushes with flowers, flower groups, ferns, grass tufts, clover, pebbles, mushrooms.
// NOT solid and never claimed, but only where `blocked()` says the ground is free (never on a road / door / NPC leg / field / water, never touching a collider).
// Rows are [x, z, yaw, sx, sy, sz] like FILL; natureLayout draws them (names `qt_<node>`), thinned on the lower quality tiers.
export const QT_DECOR: [piece: string, row: FillRow][] = [];
{
  type Kind = 'garden' | 'wild' | 'stone';
  // (owner 2026-10-24 "everything is scattered": no loose plants on paving / verges / wall feet / house corners. Flowers + bushes only in the parks, round flower beds and a few tidy bush piles.)
  const MIX: Record<Kind, [string, number, number, number][]> = {   // piece, weight, scale lo, scale hi
    garden: [['Bush_Common_Flowers', 0.8, 0.8, 1.1], ['Bush_Common', 0.8, 0.8, 1.1], ['N_Flowers', 3.0, 1.0, 1.5], ['Flower_3_Group', 2.0, 0.9, 1.2], ['Flower_4_Group', 2.0, 0.9, 1.2], ['Flower_3_Single', 1.0, 1.0, 1.4], ['Flower_4_Single', 1.0, 1.0, 1.4]],
    wild: [['Bush_Common', 1, 0.9, 1.2], ['Bush_Common_Flowers', 1, 0.9, 1.2], ['Bush_Common_Flowers', 0.7, 0.9, 1.2]],
    stone: [['Pebble_Round_1', 1, 1.7, 2.4]],
  };
  void QT_FLOWERS; void QT_GRASS; void QT_CLOVER; void QT_PEBBLES;
  const dr = rng(2410);
  const okSpot = (x: number, z: number): boolean => !blocked(x, z, 0.2, 2.4) && Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.r + 1.5;
  /** `n` pieces of a mix scattered in a disc (rejection against blocked ground). */
  const clump = (cx: number, cz: number, rad: number, n: number, kind: Kind): void => {
    const mix = MIX[kind], tw = mix.reduce((a, m) => a + m[1], 0);
    for (let t = 0, k = 0; t < n * 8 && k < n; t++) {
      const a = dr() * TAU, d = Math.sqrt(dr()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!okSpot(x, z)) continue;
      let w = dr() * tw, m = mix[0]; for (const e of mix) { if (w < e[1]) { m = e; break; } w -= e[1]; }
      const sc = m[2] + dr() * (m[3] - m[2]);
      QT_DECOR.push([QT_PREFIX + m[0], [x, z, dr() * TAU, sc, sc * (0.9 + dr() * 0.25), sc]]); k++;
    }
  };
  /** clumps every ~`step` m along a segment, `off` m to the side (+ = left of the direction), a little jitter */
  const along = (x1: number, z1: number, x2: number, z2: number, step: number, off: number, rad: number, n: number, kind: Kind): void => {
    const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, m = Math.max(1, Math.floor(L / step));
    for (let i = 0; i < m; i++) { const t = (i + 0.3 + dr() * 0.4) * (L / m); clump(x1 + ux * t - uz * off, z1 + uz * t + ux * off, rad, n, kind); }
  };
  // ---- the fountain park (south-west quarter) and the little riverside park beside the east gazebo
  clump(WELL_POS.x, WELL_POS.z, 9, 18, 'garden'); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.4; clump(WELL_POS.x + Math.cos(a) * 6.5, WELL_POS.z + Math.sin(a) * 4.6, 1.8, 5, 'garden'); }
  clump(PARK_EAST.fountain.x - 3, PARK_EAST.fountain.z, 8, 14, 'garden'); clump(PARK_EAST.gazebo.x, PARK_EAST.gazebo.z, 6, 8, 'garden');
  // ---- round the flower beds and planters (positions of the decor() list above)
  for (const [x, z] of [[-33.6, -16.4], [8.4, 30.4], [-36, 8.2], [-26.4, 24.9], [7.2, 14.8], [18, 14.8], [-7.4, -15.2], [8.6, -15.2]]) clump(x, z, 2.6, 5, 'garden');
  // ---- a few tidy bush piles outside the walls (3-6 overlapping bushes each) on the meadows, with calm empty ground between them
  const pile = (cx: number, cz: number, n: number, rad: number): void => {
    for (let t = 0, k = 0; t < n * 12 && k < n; t++) {
      const a = dr() * TAU, d = Math.sqrt(dr()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!okSpot(x, z)) continue;
      const sc = 1.0 + dr() * 0.6, name = ['Bush_Common_Flowers', 'Bush_Common', 'Bush_Common_Flowers', 'Bush_Common'][Math.floor(dr() * 4)];
      QT_DECOR.push([QT_PREFIX + name, [x, z, dr() * TAU, sc, sc * (0.9 + dr() * 0.2), sc]]); k++;
    }
  };
  for (const [x, z] of [[-30, 46], [28, 47], [-8, 52], [14, 58], [-40, 60], [40, 62], [-22, 112], [20, 114], [-36, 120], [36, 118], [6, 132], [-6, 146], [10, 150]]) pile(x, z, 3 + Math.floor(dr() * 4), 1.5);
  // ---- gardens: a small tidy flower + berry-bush clump in a few meadow spots (garden kind, not sprinkled)
  clump(-20, 47, 2.4, 9, 'garden'); clump(10, 56, 2.4, 9, 'garden'); clump(-38, 91, 2.6, 10, 'garden'); clump(3, 138, 2.4, 8, 'garden');
}

// ================================================================ NPC ROUTE CHECK (owner: NPCs "teleport" when a patrol leg crosses a collider and they wedge)
// Every NPC home + patrol leg is validated against the FINAL colliders (a straight segment with the 0.45 m body radius, like pushOut); a blocked waypoint is nudged to the
// nearest spot (<= 2.6 m) where it and its two legs are clear. NPC_FIXED lists what moved (the layout check prints it).
export const NPC_FIXED: string[] = [];
{
  const cols = [...TOWN_COLLIDERS, ...FILL_COLLIDERS];
  const dS = (x: number, z: number, a: number, b: number, c: number, d: number): number => { const dx = c - a, dz = d - b, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / L)); return Math.hypot(x - a - dx * t, z - b - dz * t); };
  const clear = (a: number, b: number, c: number, d: number): boolean => { for (const k of cols) if (dS(k[0], k[1], a, b, c, d) < k[2] + 0.47) return false; return true; };
  const offs: [number, number][] = [[0, 0]];
  for (let r = 0.25; r <= 2.6; r += 0.25) for (let i = 0; i < 16; i++) offs.push([Math.cos((i / 16) * TAU) * r, Math.sin((i / 16) * TAU) * r]);
  for (const n of NPCS) {
    if (n.area) continue;
    const pts: [number, number][] = n.patrol ?? [n.home];
    const synced = !!n.patrol && n.patrol[0][0] === n.home[0] && n.patrol[0][1] === n.home[1];
    const ok = (i: number, x: number, z: number): boolean => {
      if (!clear(x, z, x, z)) return false;
      if (pts.length > 1) { const p = pts[(i + pts.length - 1) % pts.length], q = pts[(i + 1) % pts.length]; if (!clear(p[0], p[1], x, z) || !clear(x, z, q[0], q[1])) return false; }
      return true;
    };
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < pts.length; i++) {
      if (ok(i, pts[i][0], pts[i][1])) continue;
      const [x0, z0] = pts[i];
      for (const [dx, dz] of offs) if (ok(i, x0 + dx, z0 + dz)) { pts[i] = [+(x0 + dx).toFixed(2), +(z0 + dz).toFixed(2)]; if (pass === 0) NPC_FIXED.push(`${n.name}#${i} ${x0},${z0} -> ${pts[i]}`); break; }
    }
    if (synced) n.home = [pts[0][0], pts[0][1]];
    else if (!n.patrol) n.home = [pts[0][0], pts[0][1]];
    else { for (const [dx, dz] of offs) if (clear(n.home[0] + dx, n.home[1] + dz, n.home[0] + dx, n.home[1] + dz)) { if (dx || dz) NPC_FIXED.push(`${n.name} home -> ${n.home[0] + dx},${n.home[1] + dz}`); n.home = [n.home[0] + dx, n.home[1] + dz]; break; } }
  }
}
