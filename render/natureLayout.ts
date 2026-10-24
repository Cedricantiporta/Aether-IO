// ============================================================================
// Every placement of the nature kit (render/natureKit.tsx) as pure data: piece name -> instances. No React, no three scene objects.
//   * townPlaces()  everything of the town + outskirts from engine data: trees (TOWN_TREES), shore palms, benches (TOWN_SEATS), the east
//                   park, wells, signposts, stepping stones, every fence run (FENCES), market carts, haystacks, trail boulders, the
//                   fronts-south buildings (farmhouse, barn, coop, windmill, stable, brewer hut, Endless Tower, mine entrance, tents),
//                   the pier (dock segments, deck tiles, posts, rails, boats), shore rocks and the crops of the fields
//   * natureLayout(q)  townPlaces + the terrain dressing that depends on the quality tier: forest ring, rim boulders, edge bushes,
//                   flower patches, grass tufts, mushroom clusters
//   * FILL (engine/townFill.ts, the dense dressing): every hedge, grove, bush, flower bed, rock, hay bale and cart that fills the space between the buildings
// DISTRICT PLAN (docs/TOWN_PLAN.md): inside the walls the castle terrace N, the plaza + statue centre, the market street (avenue) with stalls, residential lanes W / E of it
// (houses 6 m apart, lawns, planters, hedged back gardens), the chapel quarter + graveyard NW, the tavern square NE, the park + fountain SW; seven shops each on its own spot
// (SHOP_LOOK). Outside: gate meadow (groves, stable, east park), the portal road through a forest, the farm district, the river + bridges, lake + beach + pier, mining camp, tower
// clearing; everything else forest, hedges, rocks and props. All placements are DATA TABLES with piece names (townData lists, townFill PIECES + tables, SHOP_LOOK): kit v3 =
// rename pieces there, nothing in this file changes.
// render/NatureBatch.tsx draws all of it with ONE batched mesh (or chunked instancing where multi-draw is missing).
// ============================================================================
import {
  TOWN_TREES, FENCES, LOT_FENCES, HOUSES, TOWN_SEATS, CHURCH, PARK_EAST, WELLS, SIGNPOSTS, STEP_PATHS, CARTS, HAYSTACK, TRAIL_ROCKS, FIELDS, FARM, SCARECROW,
  STABLE, BREWER_HUT, TOWER, WINDMILL, townLift, LAKE, riverBank, RIVER, type FieldSpec, WALL_TOWERS, SIDE_GATES, SIDE_GATE, GATE, GATE_TOWER, BRIDGE, MINE_BRIDGE, PLAZA, PLANTERS, SHOP_LOOK, shopLocal,
} from '../engine/townData';
import { SHOP_POSITIONS } from '../constants';
import { V3_K, V3_BOX } from '../engine/kitV3Data';
import { QT_PREFIX, QT_H, QT_R, QT_ROCKS, QT_COMMON, QT_PINE, N2, qtLod, qtPick } from '../engine/qtData';
import { hillAt } from '../engine/townHills';
import { FILL, PIECES, QT_DECOR } from '../engine/townFill';
import { PALMS, DOCK, ROWBOAT, ENTRY_SIGN, HEADLAND, SOUTH_ROCKS, BEACH } from '../engine/beachData';
import { CAVE_MOUTH, CAVE_ROCKS, CAVE_FORMATIONS, MINE_CAMP, inCaveClear } from '../engine/caveData';
import { ARENA_RADIUS } from '../engine/world';
import { mulberry32 } from './util';
import { edgeR, groundY, inForecourtUse, inYard, lakeK } from './terrainFn';
import type { QualityCfg } from './quality';
import type { Place } from './natureKit';
type NKPiece = string;   // (nature kit v1 + kit v3 piece names: render/natureKit.tsx merges both kits)

const TAU = Math.PI * 2;
/** Deterministic 0..1 hash of a position (variant / rotation / scale variety without storing anything). */
export const hash2 = (x: number, z: number, k = 0): number => { const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
/** Ground height under a prop outside the walls: raised districts / bridge / knoll + the rolling hills (what the hero stands on). */
export const groundAt = (x: number, z: number): number => townLift(x, z) + hillAt(x, z);

export type Sets = Map<string, Place[]>;
const put = (S: Sets, name: NKPiece, p: Place) => { let l = S.get(name); if (!l) S.set(name, (l = [])); l.push(p); };
const P = (x: number, y: number, z: number, ry: number, s: number, sy = s): Place => ({ x, y, z, ry, sx: s, sy, sz: s });
/** (owner) Rock formation of the textured Quaternius pack-1 rocks (engine/qtData QT_ROCKS, the Ember Wastes halls-wall look): `n` (3-7) overlapping rocks of mixed size about (x, z), footprint half-size R
 *  (scaled up generously), one big core, medium ones round it, one or two small ones stacked on top, random yaw. y = the ground. */
const qtRock = (S: Sets, node: string, x: number, y: number, z: number, hw: number, hmul: number, ry: number): void => {
  const s0 = hw / QT_R[node];
  put(S, QT_PREFIX + node, { x, y, z, ry, sx: s0, sy: (hw * hmul) / QT_H[node], sz: s0 * 1.1 });
};
export const rockPut = (S: Sets, x: number, y: number, z: number, R: number, seed: number, n = 0, grow = 1.4): void => {
  const h = (k: number): number => hash2(x, z, seed * 7 + k), cnt = n || (R < 0.45 ? 3 : 3 + Math.floor(h(1) * 5)), G = R * grow, a0 = h(2) * TAU;
  const core = G * (0.8 + h(3) * 0.2), hm = 0.85 + h(4) * 0.5;
  qtRock(S, qtPick(QT_ROCKS, h(5)), x, y - 0.12, z, core, hm, h(6) * TAU);
  const nStack = cnt >= 5 ? 1 + (cnt > 6 ? 1 : 0) : 0, nSide = cnt - 1 - nStack;
  for (let i = 0; i < nSide; i++) {
    const a = a0 + (i / nSide) * TAU + (h(10 + i) - 0.5) * 0.7, d = G * (0.55 + h(20 + i) * 0.35), hw = G * (0.38 + h(30 + i) * 0.3);
    qtRock(S, qtPick(QT_ROCKS, h(40 + i)), x + Math.cos(a) * d, y - 0.12, z + Math.sin(a) * d, hw, 0.7 + h(50 + i) * 0.7, h(60 + i) * TAU);
  }
  for (let i = 0; i < nStack; i++) {   // stacked on the core: they make the formation tall
    const hw = core * (0.5 - i * 0.12);
    qtRock(S, qtPick(QT_ROCKS, h(70 + i)), x + (h(80 + i) - 0.5) * core * 0.5, y + core * hm * (0.95 + i * 0.5), z + (h(90 + i) - 0.5) * core * 0.5, hw, 0.8 + h(100 + i) * 0.4, h(110 + i) * TAU);
  }
};
/** Keep the shoreline boulders off the pier (and a little either side of it). */
const nearDock = (x: number, z: number): boolean => x < DOCK.x0 + 4 && Math.abs(z - DOCK.z) < 7;

/** Tree piece for a TOWN_TREES entry (kind 0 round, 1 palm, 2 / 3 pines), kit v3: blossom trees in the park, willows by the river and the lake, fruit trees by the farm, a natural oak / birch mix elsewhere. */
export function treeFor(kind: number, h: number, x = 0, z = 0): NKPiece {
  if (kind === 1) return x < -44 ? 'palm_v3' : h < 0.5 ? 'tree_oak_small' : 'tree_birch';   // (palms only on the beach)
  if (kind === 2) return 'tree_pine_layered_a';
  if (kind === 3) return 'tree_pine_layered_b';
  if (x > -31 && x < -13 && z > 11 && z < 23) return 'tree_blossom';                                   // the park beside the fountain
  if ((z > 50 && z < 86 && x > -46 && x < 62 && Math.abs(x) > 8) || x < -47 && z > 40 && z < 100) return 'tree_willow';   // the river banks, the lake shore
  if (z > 76 && z < 112 && x > -46 && x < 62) return h < 0.55 ? 'tree_fruit' : 'tree_oak_small';       // the farm's orchard
  return h < 0.25 ? 'tree_oak_big' : h < 0.62 ? 'tree_oak_small' : 'tree_birch';
}

/** Quaternius flowers (the nature pack) planted in a stone bed: rect of half extents hx, hz about (cx, cz) turned by ry, soil top at y. Replaces the kit's cube flowers + ball bushes. */
function bedPlants(S: Sets, cx: number, cz: number, ry: number, hx: number, hz: number, y: number, k: number): void {
  const c = Math.cos(ry), sn = Math.sin(ry), area = hx * hz * 4, n = Math.max(3, Math.min(9, Math.round(area * 2.4)));
  const FL = ['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single'], r = mulberry32(Math.floor(cx * 91 + cz * 17 + k * 7 + 1000));
  const long = hx >= hz, cols = long ? n : 1, rows = long ? 1 : n;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1, jx = (r() - 0.5) * 0.35, jz = (r() - 0.5) * 0.5;
    const lx = long ? t * (hx - 0.28) + jx * 0.4 : (r() - 0.5) * 2 * (hx - 0.28), lz = long ? (r() - 0.5) * 2 * (hz - 0.25) + jz * 0.2 : t * (hz - 0.28) + jz * 0.4;
    const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c, bush = i % 4 === 1, sc = (bush ? 0.75 : 0.55 + r() * 0.2);
    put(S, QT_PREFIX + (bush ? 'Bush_Common_Flowers' : FL[Math.floor(r() * FL.length)]), P(x, y, z, r() * TAU, sc, sc));
    void cols; void rows;
  }
}

export function townPlaces(): Sets {
  const S: Sets = new Map();
  // ---- trees (round / pine / palm), free rotation + a little size variety; scale from the old tree size (s ~ 3.0 .. 3.9)
  for (const t of TOWN_TREES) {
    const h = hash2(t.x, t.z), sc = t.s * 0.3 * (0.9 + hash2(t.x, t.z, 2) * 0.22);
    put(S, treeFor(t.kind, h, t.x, t.z), P(t.x, groundAt(t.x, t.z), t.z, hash2(t.x, t.z, 1) * TAU, sc, sc * (0.95 + hash2(t.x, t.z, 3) * 0.14)));
  }
  // ---- the dense dressing (engine/townFill.ts): rows are [x, z, yaw, sx, sy, sz]; the ground height is added here
  for (const name of Object.keys(FILL)) for (const [x, z, ry, sx, sy, sz, ay] of FILL[name]) {
    const low = /rock/.test(name) ? 0.2 * sx : /tree|palm|pine/.test(name) ? 0.1 : 0;
    put(S, name as NKPiece, { x, y: ay !== undefined ? ay : groundAt(x, z) - low, z, ry, sx, sy, sz });
  }
  // ---- plant boxes (owner 2026-10-24): the stone beds keep their stone, the flowers are the Quaternius nature pack
  for (const p of PLANTERS) { const along = p.w >= p.d, len = Math.max(p.w, p.d), wid = Math.min(p.w, p.d); bedPlants(S, p.x, p.z, along ? 0 : Math.PI / 2, len / 2 - 0.1, wid / 2 - 0.1, townLift(p.x, p.z) + 0.68, 1); }
  for (const sp of SHOP_POSITIONS) { const L = SHOP_LOOK[sp.type]; if (!L) continue; for (const [piece, dx, dz, yaw, sx, sz] of [...L.extra, ...L.dress] as [string, number, number, number, number, number][]) { if (piece !== 'flower_planter') continue; const [x, z] = shopLocal(sp.position[0], sp.position[2], sp.rot ?? 0, dx, dz); bedPlants(S, x, z, (sp.rot ?? 0) + yaw, 0.85 * (sx ?? 1) - 0.1, 0.45 * (sz ?? 1) - 0.1, townLift(x, z) + 0.68, 2); } }
  for (const name of ['flower_bed_long', 'flower_bed_round']) for (const [x, z, ry, sx, , sz, ay] of (FILL[name] ?? [])) { const y = (ay !== undefined ? ay : groundAt(x, z)) + 0.5 * sx; if (name === 'flower_bed_long') bedPlants(S, x, z, ry, 2.0 * sx, 0.55 * sz, y, 3); else bedPlants(S, x, z, ry, 1.0 * sx, 1.0 * sz, y, 4); }
  // ---- palms along the beach and the lake shore (beachData PALMS: x, z, scale, lean yaw)
  PALMS.forEach(([x, z, s, lean]) => put(S, 'palm_v3', P(x, Math.max(0, groundAt(x, z)), z, lean, s * (0.9 + hash2(x, z) * 0.2))));
  // ---- park: benches (the seats' sit points), the gazebo + fountain, wells, signposts, stepping stones
  for (const s of TOWN_SEATS) { if (s.x === CHURCH.x + CHURCH.w / 2 - 0.6) continue; put(S, 'park_bench', P(s.x, townLift(s.x, s.z), s.z, s.yaw, 1.05)); }
  put(S, 'gazebo', P(PARK_EAST.gazebo.x, townLift(PARK_EAST.gazebo.x, PARK_EAST.gazebo.z), PARK_EAST.gazebo.z, 0, 1));
  put(S, 'park_fountain', P(PARK_EAST.fountain.x, 0, PARK_EAST.fountain.z, 0, 0.95));
  for (const [x, z] of WELLS) put(S, 'well', P(x, groundAt(x, z), z, 0, 1));
  for (const [x, z] of SIGNPOSTS) put(S, 'signpost', P(x, groundAt(x, z), z, 0, 0.9));
  put(S, 'signpost', P(ENTRY_SIGN.x, 0, ENTRY_SIGN.z, 0, 0.9)); put(S, 'signpost', P(MINE_CAMP.sign.x, groundAt(MINE_CAMP.sign.x, MINE_CAMP.sign.z), MINE_CAMP.sign.z, 0, 0.9));
  for (const [x1, z1, x2, z2] of STEP_PATHS.slice(0, 0)) {   // (owner 2026-10-22: no stepping-stone discs)
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i <= n; i++) { const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n; put(S, 'stone_path_tile', P(x + (hash2(x, z) - 0.5) * 0.25, groundAt(x, z), z + (hash2(x, z, 1) - 0.5) * 0.25, hash2(x, z, 2) * TAU, 0.72 + hash2(x, z, 3) * 0.12)); }
  }
  // ---- every fence run (FENCES): ~3 m pieces stretched to fit, along the run
  for (const [x1, z1, x2, z2] of FENCES) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / (len > 9 ? 4.4 : 3.0))), L = len / n, ry = Math.atan2(-dz, dx);   // (pieces stretched x1.3 .. x1.9: fewer triangles, still a picket fence)
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = x1 + dx * t, z = z1 + dz * t; put(S, 'fence_wood', { x, y: groundAt(x, z), z, ry, sx: (L + 0.05) / 2.32, sy: 1, sz: 1.15 }); }
  }
  // ---- the cottage lots' low garden fences (a gate opening in front of each door)
  for (const [x1, z1, x2, z2] of LOT_FENCES) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 2.2)), L = len / n, ry = Math.atan2(-dz, dx);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = x1 + dx * t, z = z1 + dz * t; put(S, 'fence_wood', { x, y: groundAt(x, z), z, ry, sx: (L + 0.04) / 2.32, sy: 0.72, sz: 0.9 }); }
  }
  // ---- market carts on the meadow (kind 1 = a haystack), the haystack in the wheat field, trail boulders
  for (const k of CARTS) { if (k.kind === 1) put(S, 'haystack', P(k.x, groundAt(k.x, k.z), k.z, 0, 0.8)); else put(S, 'market_cart', P(k.x, groundAt(k.x, k.z), k.z, 0, 1)); }
  put(S, 'haystack', P(HAYSTACK.x, 0, HAYSTACK.z, 0, 0.85));
  TRAIL_ROCKS.forEach(([x, z, r], i) => rockPut(S, x, groundAt(x, z), z, r * 1.05, 700 + i, r >= 1.5 ? 6 : 0));
  { // (owner 2026-10-24) river-bank stones + the rocky spring at the river's east end: real rock formations (were faceted chunks in TownScenery)
    const rr = mulberry32(4711);
    for (let x = RIVER.x0 + 22; x < RIVER.x1; x += 2.6) {
      if (Math.abs(x) < BRIDGE.hw + 2) continue;
      for (const zb of [riverBank(x, 0) - 0.4, riverBank(x, 1) + 0.4]) if (rr() < 0.55) { const px = x + rr() * 1.6, pz = zb + (rr() - 0.5) * 0.8; rockPut(S, px, groundAt(px, pz), pz, 0.45 + rr() * 0.4, 1300 + Math.round(x * 3)); }
    }
    for (let i = 0; i < 6; i++) { const px = RIVER.x1 - 1 + rr() * 3, pz = RIVER.z0 + 4 + rr() * (RIVER.z1 - RIVER.z0 - 8); rockPut(S, px, groundAt(px, pz), pz, 1.0 + rr() * 0.9, 1500 + i, 6); }
  }   // formations of faceted boulders (collider r unchanged)
  // ---- outskirts buildings (fronts south): the nature-kit houses of HOUSES (farmhouse, barn, coop)
  for (const h of HOUSES) if (h.nk) put(S, h.nk as NKPiece, P(h.x, groundAt(h.x, h.z), h.z, 0, h.s ?? 1));
  put(S, 'windmill', P(WINDMILL.x, groundAt(WINDMILL.x, WINDMILL.z), WINDMILL.z, 0, WINDMILL.s));
  put(S, 'stable', P(STABLE.x, groundAt(STABLE.x, STABLE.z), STABLE.z, 0, 1));
  put(S, 'brewer_hut', P(BREWER_HUT.x, groundAt(BREWER_HUT.x, BREWER_HUT.z), BREWER_HUT.z, 0, 1));
  put(S, 'endless_tower', P(TOWER.x, groundAt(TOWER.x, TOWER.z), TOWER.z, TOWER.ry, 1));
  {   // the Crystal Cave mouth: a big cliff of faceted boulders (engine/caveData CAVE_ROCKS; the dark opening + crystals are drawn by render/CaveEntrance.tsx)
    const gy = Math.max(0, groundAt(CAVE_MOUTH.x, CAVE_MOUTH.z)) - 0.15;
    for (const [lx, lz, base, R, hr, , v] of CAVE_ROCKS) qtRock(S, QT_ROCKS[v % 3], CAVE_MOUTH.x + lx, gy + base - 0.15, CAVE_MOUTH.z + lz, R * 1.15, (R * hr * 1.7) / (R * 1.15), hash2(lx, lz) * TAU);
    CAVE_FORMATIONS.forEach(([lx, lz, R], i) => rockPut(S, CAVE_MOUTH.x + lx, gy, CAVE_MOUTH.z + lz, R, 900 + i, 6, 1.5));
  }
  for (const t of MINE_CAMP.tents) put(S, 'mining_camp_tent', P(t.x, groundAt(t.x, t.z), t.z, 0, 1));
  // ---- the pier: dock segments along the walkway (posts every 3.8 m), plank tiles + edge posts on the T-head, rails on its north / south edges, boats
  {
    const y = DOCK.y - 0.62, z = DOCK.z, x0 = DOCK.x0 - 0.1, x1 = DOCK.x1, n = Math.round((x0 - x1) / 3.8), L = (x0 - x1) / n;
    for (let i = 0; i < n; i++) put(S, 'dock_segment', { x: x0 - (i + 0.5) * L, y, z, ry: Math.PI / 2, sx: (DOCK.hw * 2) / 2.68, sy: 1, sz: L / 4 });
    const H = DOCK.head, cols = 4, rows = 5, tw = (H.x1 - H.x0) / cols, th = (H.z1 - H.z0) / rows;   // (x1 = -80 is the walkway end, x0 = -94 the far end: x0 < x1)
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) put(S, 'dock_deck', { x: H.x0 + tw * (i + 0.5), y, z: H.z0 + th * (j + 0.5), ry: Math.PI / 2, sx: th / 2.5, sy: 1, sz: tw / 3.94 });
    for (const px of [H.x0 + 0.3, (H.x0 + H.x1) / 2, H.x1 - 0.3]) for (const pz of [H.z0 + 0.3, (H.z0 + H.z1) / 2, H.z1 - 0.3]) put(S, 'dock_post', P(px, DOCK.y - 0.55 + 0.02, pz, 0, 1));
    for (const pz of [H.z0 + 0.12, H.z1 - 0.12]) { const len = H.x1 - H.x0 - 2.4, m = Math.round(len / 2.3), Lf = len / m; for (let i = 0; i < m; i++) put(S, 'fence_wood', { x: H.x0 + 1.4 + Lf * (i + 0.5), y: DOCK.y, z: pz, ry: 0, sx: (Lf + 0.05) / 2.32, sy: 0.9, sz: 1 }); }
    put(S, 'small_boat', P(H.x0 + 3, -0.3, H.z1 + 1.8, Math.PI / 2 + 0.12, 1.05));   // moored on the north side of the head
  }
  put(S, 'small_boat', P(ROWBOAT.x, 0.02, ROWBOAT.z, ROWBOAT.rot + Math.PI, 1.05));   // beached on the sand
  // ---- rocks of the shore (owner beach mock 2026-10-24): chunky rounded SANDSTONE boulders (pack 2 Rock_Sand_1-7: warm orange, lit tops, darker sides, faint strata) stacked in clusters of 5-9 that read as a
  //      cliff: the headland closing the beach's north end, a rocky outcrop where sand meets water, a small islet in the shallows, lone rocks on the sand, the lake's south + east shores
  const rockC = (x: number, z: number, r: number, y: number, k: number, n = 6) => {   // (owner: Quaternius rock formations, same footprint but bigger)
    const R = Math.max(0.7, r);
    if (R > 1.9) { rockPut(S, x - R * 0.3, y, z, R * 0.85, k, 6); rockPut(S, x + R * 0.35, y, z + R * 0.2, R * 0.7, k + 1, 5); }
    else rockPut(S, x, y, z, R * (n >= 6 ? 1.1 : 0.95), k, n >= 6 ? 7 : n >= 4 ? 5 : 3);
  };
  HEADLAND.forEach(([x, z, r], i) => rockC(x, z, r, -0.2, 3 + i, i % 3 === 0 ? 8 : 6));
  for (let i = 0; i < 5; i++) { const x = -70.5 - i * 1.4 - hash2(i, 1), z = 4 + (hash2(i, 2) - 0.5) * 3; rockC(x, z, 0.9 + hash2(i, 3) * 0.5, -0.5, 20 + i, 4); }
  rockC(-72.5, 15.5, 1.5, -0.55, 61, 6);   // the islet in the shallows
  rockC(-66.4, 44.5, 1.2, -0.4, 62, 5);   // a small outcrop where the sand meets the water
  for (const [x, z, r] of [[-62.9, 18.6, 0.6], [-52.6, 40.4, 0.55], [-56.4, 52.4, 0.65]]) rockC(x, z, r, -0.05, 70 + x, 3);   // lone rocks on the sand
  for (const [x, z, r] of SOUTH_ROCKS) rockC(x, z, r * 1.05, -0.25, 30, r > 1.1 ? 6 : 4);
  for (let z = LAKE.z0 + 16; z < LAKE.z1 - 16; z += 3) {   // (the sandy east shore of the lake along the town's west wall; the beaches have their own props)
    if ((z > BEACH.z0 - 9 && z < BEACH.z1 + 8) || (z > riverBank(LAKE.x1, 0) - 3 && z < riverBank(LAKE.x1, 1) + 3) || (z > 72 && z < 103)) continue;
    if (hash2(z, 4) < 0.18) rockC(LAKE.x1 - 1.5 - hash2(z, 5) * 3, z + hash2(z, 6), 0.7 + hash2(z, 7) * 0.5, -0.2, 40, 4);
  }
  // a few cacti only at the dry back of the beach (by the wall), the palms (beachData PALMS) stand further out
  for (const [x, z, s] of [[-47.3, 16, 1.0], [-47.0, 22.5, 1.25], [-47.8, 52.5, 1.1], [-47.2, 61, 0.9]]) { const node = qtPick(N2.cactus, hash2(x, z)), k = (2.6 * s) / QT_H[node]; put(S, QT_PREFIX + node, { x, y: Math.max(0, groundAt(x, z)) - 0.03, z, ry: hash2(x, z, 1) * TAU, sx: k, sy: k, sz: k }); }
  // ---- kit v3 landmarks: round wall towers (door side faces the town), the two bridges (stretched to the deck / railing colliders), 
  for (const t of WALL_TOWERS) {
    const k = t.r / 3.0, inx = PLAZA.x - t.x, inz = PLAZA.z - t.z, ry = Math.atan2(inx, inz);
    put(S, 'wall_tower_round', P(t.x, 0, t.z, ry, k, k * (t.corner ? 0.86 : 0.76)));
  }
  for (const g of SIDE_GATES) for (const s of [-1, 1]) { const k = SIDE_GATE.r / 3.0; put(S, 'wall_tower_round', P(g.x, 0, g.z + s * SIDE_GATE.off, s > 0 ? Math.PI : 0, k, k * 0.95)); }   // (owner) side gates: two small towers, doors facing the passage
  for (const sx of [-1, 1]) { const k = GATE_TOWER.r / 3.0; put(S, 'wall_tower_round', P(GATE.x + sx * GATE_TOWER.x, 0, GATE.z, -sx * Math.PI / 2, k, k * 0.95)); }   // the gate's two towers (door side faces the passage)
  { const L = BRIDGE.z1 - BRIDGE.z0; put(S, 'bridge_stone_arch', { x: 0, y: 0, z: (BRIDGE.z0 + BRIDGE.z1) / 2, ry: Math.PI / 2, sx: L / 10.9, sy: 1.12, sz: (BRIDGE.hw * 2 + 0.4) / 3.8 }); }
  { const L = MINE_BRIDGE.z1 - MINE_BRIDGE.z0; put(S, 'bridge_wood_small', { x: MINE_BRIDGE.x, y: 0, z: (MINE_BRIDGE.z0 + MINE_BRIDGE.z1) / 2, ry: Math.PI / 2, sx: L / 6.5, sy: 0.62, sz: (MINE_BRIDGE.hw * 2 + 0.5) / 2.2 }); }
  // ---- lilypads: small clusters on the river and the lake (never under a bridge / the pier)
  for (let x = -66; x <= 100; x += 7.4) {
    if (Math.abs(x - 0) < BRIDGE.hw + 3.5 || Math.abs(x - MINE_BRIDGE.x) < MINE_BRIDGE.hw + 3.5) continue;
    const hh = hash2(x, 61); if (hh < 0.3) continue;
    const cz = (riverBank(x, 0) + riverBank(x, 1)) / 2 + (hash2(x, 62) - 0.5) * 2.6;
    for (let k = 0, n = 3 + Math.floor(hash2(x, 63) * 3); k < n; k++) { const a = hash2(x, 64 + k) * TAU, d = hash2(x, 70 + k) * 1.6, sc = 0.8 + hash2(x, 80 + k) * 0.5; put(S, QT_PREFIX + 'N_Lilypad', P(x + Math.cos(a) * d, -0.17, cz + Math.sin(a) * d * 0.7, hash2(x, 90 + k) * TAU, sc)); }
  }
  for (let x = -76; x <= -58; x += 9) for (let z = LAKE.z0 + 24; z < LAKE.z1 - 20; z += 9) {
    if ((z > BEACH.z0 - 12 && z < BEACH.z1 + 10) || (z > riverBank(LAKE.x1, 0) - 6 && z < riverBank(LAKE.x1, 1) + 6) || hash2(x, z, 5) < 0.55) continue;
    const px = x + (hash2(x, z, 6) - 0.5) * 6, pz = z + (hash2(x, z, 7) - 0.5) * 6;
    if (nearDock(px, pz)) continue;
    for (let k = 0, n = 3 + Math.floor(hash2(x, z, 8) * 3); k < n; k++) { const a = hash2(x, z, 10 + k) * TAU, d = hash2(x, z, 20 + k) * 1.7; put(S, QT_PREFIX + 'N_Lilypad', P(px + Math.cos(a) * d, -0.17, pz + Math.sin(a) * d * 0.7, hash2(x, z, 30 + k) * TAU, 0.85 + hash2(x, z, 40 + k) * 0.5)); }
  }
  // ---- crops: the wheat / cabbage / pumpkin rows of the fields (the soil + furrows are still the town's merged ground meshes)
  const crop = (F: { x: number; z: number; hw: number; hd: number; crop: FieldSpec['crop'] }, rnd: () => number, avoid = true) => {
    const { x, z, hw, hd } = F, wheat = F.crop === 'WHEAT', step = wheat ? 1.1 : 1.4;
    for (let zi = -hd + 1.2; zi <= hd - 0.9; zi += 1.4) for (let xi = -hw + 1.0; xi <= hw - 0.8; xi += step) {
      const px = x + xi + (rnd() - 0.5) * 0.14, pz = z + zi + (rnd() - 0.5) * 0.14;
      if (avoid && (Math.hypot(px - SCARECROW.x, pz - SCARECROW.z) < 1.3 || Math.hypot(px - HAYSTACK.x, pz - HAYSTACK.z) < 2.2)) continue;
      const r = rnd(), s = 0.8 + rnd() * 0.35, ry = rnd() * TAU;
      // (owner 2026-10-24: pack wheat + corn fill the fields; the soil + furrows are still the town's ground meshes)
      if (wheat) { for (let k = 0; k < 3; k++) put(S, QT_PREFIX + 'N_Wheat', P(px + (rnd() - 0.5) * 0.95, 0.04, pz + (rnd() - 0.5) * 0.95, rnd() * TAU, s * (0.9 + rnd() * 0.3), s * (0.85 + rnd() * 0.4))); }
      else if (F.crop === 'CABBAGE' || r < 0.7) { for (let k = 0; k < 2; k++) put(S, QT_PREFIX + (rnd() < 0.5 ? 'N_Corn_1' : 'N_Corn_2'), P(px + (rnd() - 0.5) * 0.9, 0.04, pz + (rnd() - 0.5) * 0.9, rnd() * TAU, s * 0.95, s * (0.9 + rnd() * 0.25))); }
      else put(S, 'crop_pumpkin', P(px, 0.05, pz, ry, s * 0.9));
    }
  };
  { const r = mulberry32(88); crop({ ...FARM, crop: 'WHEAT' }, r); for (const F of FIELDS) crop(F, r, false); }
  return S;
}

const _cache: { town: Sets | null } = { town: null };
const add = (S: Sets, name: string, l: Place[]) => { let t = S.get(name); if (!t) S.set(name, (t = [])); t.push(...l); };

/** Edge bushes, flower patches, grass tufts, mushroom clusters (quality-scaled). */
function dressing(q: QualityCfg, S: Sets): void {
  // ---- bushes just inside the island edge (round + flowering), never in the walled yard, the avenue or the fields
  {
    const target = q.name === 'LOW' ? 40 : q.name === 'MEDIUM' ? 70 : 100;
    const rnd = mulberry32(77), pts: number[] = [];
    let guard = 0;
    while (pts.length < target * 4 && guard++ < target * 60) {
      const a = rnd() * TAU, e = edgeR(a);
      const r = e - 1.5 - rnd() * 4, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inYard(x, z, 3) || inForecourtUse(x, z, 2) || Math.hypot(x, z) > e - 1 || inCaveClear(x, z)) continue;
      const n = pts.length / 4; let tooClose = false;
      for (let i = 0; i < n; i++) { const dx = pts[i * 4] - x, dz = pts[i * 4 + 1] - z; if (dx * dx + dz * dz < 4.5) { tooClose = true; break; } }
      if (tooClose) continue;
      pts.push(x, z, 0.8 + rnd() * 0.9, rnd() * TAU);
    }
    for (let i = 0; i < pts.length / 4; i++) {
      const x = pts[i * 4], z = pts[i * 4 + 1], s0 = pts[i * 4 + 2] * 0.62;
      add(S, 'bush_cluster', [{ x, y: groundY(x, z), z, ry: pts[i * 4 + 3], sx: s0, sy: s0 * (0.85 + hash2(x, z, 1) * 0.3), sz: s0 }]);
    }
  }
  // ---- flower fields (flower_patch rings), tufts toward the forest edge, mushrooms
  {
    const rnd = mulberry32(31), Pt: Place[] = [], T: Place[] = [], M: Place[] = [];
    const ok = (x: number, z: number) => { const a = Math.atan2(z, x), r = Math.hypot(x, z); return !(r > edgeR(a) - 3 || inYard(x, z, 2) || inForecourtUse(x, z, 1)); };
    const fields: { x: number; z: number; r: number }[] = [];
    for (let t = 0; t < 800 && fields.length < 3; t++) {
      const a = rnd() * TAU, d = 30 + rnd() * 50, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!ok(x, z) || fields.some((f) => Math.hypot(x - f.x, z - f.z) < 14)) continue;
      fields.push({ x, z, r: 3.5 + rnd() * 2 });
    }
    const fieldBudget = Math.round(q.flowers * 0.014), scatter = Math.round(q.flowers * 0.005);
    let g = 0, k = 0;
    while (Pt.length < fieldBudget && fields.length && g++ < fieldBudget * 8) {
      const f = fields[Math.floor(rnd() * fields.length)], a = rnd() * TAU, d = Math.sqrt(rnd()) * f.r * (0.6 + rnd() * 0.5), x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      if (!ok(x, z)) continue;
      const s0 = 0.8 + rnd() * 0.6; Pt.push({ x, y: groundY(x, z), z, ry: rnd() * TAU, sx: s0, sy: s0, sz: s0 });
    }
    for (g = 0, k = 0; k < scatter && g++ < scatter * 20;) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (ARENA_RADIUS + 2), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z)) continue;
      const s0 = 0.7 + rnd() * 0.5; Pt.push({ x, y: groundY(x, z), z, ry: rnd() * TAU, sx: s0, sy: s0, sz: s0 }); k++;
    }
    const nT = Math.round(q.flowers * 0.14);
    for (g = 0, k = 0; k < nT && g < nT * 30; g++) {
      const a = rnd() * TAU, e = edgeR(a), r = e - 1.5 - Math.pow(rnd(), 1.6) * 38, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z) || lakeK(x, z) > 0.02 || inCaveClear(x, z, 1)) continue;
      const s0 = 0.9 + rnd() * 0.9; T.push({ x, y: groundY(x, z) - 0.02, z, ry: rnd() * TAU, sx: s0, sy: s0 * (0.8 + rnd() * 0.5), sz: s0 }); k++;
    }
    const nM = Math.round(q.flowers * 0.012);
    for (g = 0, k = 0; k < nM && g < nM * 40; g++) {
      const a = rnd() * TAU, e = edgeR(a), r = e - 2 - rnd() * 8, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z) || lakeK(x, z) > 0.02 || inCaveClear(x, z, 1)) continue;
      const s0 = 0.9 + rnd() * 0.6; M.push({ x, y: groundY(x, z), z, ry: rnd() * TAU, sx: s0, sy: s0, sz: s0 }); k++;
    }
    void Pt; void T; void M;   // (owner 2026-10-22: no flower mounds / grass tufts / mushrooms on the lawns)
  }
  // ---- rim boulders + boundary stones (rock_round_a / b) and the forest ring (5 species; the town's own trees add round_b + palm_b)
  {
    const nRock = Math.round(70 * q.forest) + 24, rnd = mulberry32(100), A: Place[] = [], B: Place[] = [], Cl: Place[] = [], Sm: Place[] = [];
    for (let i = 0; i < nRock; i++) {
      const a = ((i + rnd()) / nRock) * TAU, e = edgeR(a), r = e + (rnd() - 0.3) * 6, x = Math.cos(a) * r, z = Math.sin(a) * r, s0 = (0.9 + rnd() * 1.3) * 0.62;
      if (z < 38 && rnd() < 0.6) continue;   // back and sides of the walled town: keep it sparse
      if (lakeK(x, z) > 0.02 || inCaveClear(x, z, 1) || nearDock(x, z)) continue;   // (the cave mouth + the pier stay clear)
      if (i % 6 === 0) { const k = s0 * 0.5; Cl.push({ x, y: groundY(x, z) - k * 0.35, z, ry: rnd() * 6.28, sx: k, sy: k * (0.9 + rnd() * 0.5), sz: k }); continue; }   // (kit v3 cliff_rock_large: the big boulders of the rim)
      (i % 2 ? A : B).push({ x, y: groundY(x, z) - s0 * 0.2, z, ry: rnd() * 6.28, sx: s0 * (0.9 + rnd() * 0.5), sy: s0 * (0.9 + rnd() * 0.9), sz: s0 * (0.9 + rnd() * 0.5) });
    }
    const nStone = 70;
    for (let i = 0; i < nStone; i++) {
      const a = ((i + rnd() * 0.5) / nStone) * TAU, r = edgeR(a) - 0.4 + rnd() * 1.2, x = Math.cos(a) * r, z = Math.sin(a) * r, s0 = (0.7 + rnd() * 0.9) * 0.5;
      if (!inCaveClear(x, z) && !nearDock(x, z)) { const pl = { x, y: groundY(x, z) - 0.05, z, ry: rnd() * 6.28, sx: s0, sy: s0 * (0.8 + rnd() * 0.6), sz: s0 }; if (i % 3 === 0) { pl.sx = pl.sz = s0 * 1.1; pl.sy = s0 * 1.1; Sm.push(pl); } else (i % 2 ? A : B).push(pl); }   // (a third of the boundary stones are kit v3 rock_cluster_small)
    }
    add(S, 'rock_round_a', A); add(S, 'rock_round_b', B); add(S, 'cliff_rock_large', Cl); add(S, 'rock_cluster_small', Sm);
    const fr = mulberry32(2024), total = Math.round(1100 * q.forest);
    for (let i = 0; i < total; i++) {
      const a = fr() * TAU, e = edgeR(a), d = Math.pow(fr(), 1.5) * 58 + 3, r = e + d, x = Math.cos(a) * r, z = Math.sin(a) * r, t = fr();
      if (lakeK(x, z) > 0.02 || inCaveClear(x, z, 1)) continue;   // no forest in the lake / on the cave mound
      const kind: string = d < 18 ? (t < 0.3 ? 'oak' : t < 0.65 ? 'pineA' : 'pineB') : (t < 0.1 ? 'oak' : t < 0.55 ? 'pineA' : 'pineB');
      const f = fr(), name = kind === 'oak' ? (f < 0.3 ? 'tree_oak_big' : f < 0.65 ? 'tree_oak_small' : 'tree_birch') : kind === 'palm' ? 'palm_v3' : kind === 'pineA' ? 'tree_pine_layered_a' : 'tree_pine_layered_b';
      const sc = (kind === 'oak' ? 0.24 : kind === 'palm' ? 0.26 : 0.2) * (kind === 'oak' ? 5 : kind === 'palm' ? 5 : 6) * (0.8 + fr() * 0.7) * (1 + d * 0.004) * 0.8;
      add(S, name, [{ x, y: groundY(x, z) - 0.2, z, ry: fr() * 6.28, sx: sc, sy: sc * (0.9 + fr() * 0.25), sz: sc }]);
    }
  }
}

/** All of it for a quality tier: the town + outskirts placements (computed once) plus the quality-scaled dressing + forest. */
export function natureLayout(q: QualityCfg): Sets {
  const out: Sets = new Map();
  (_cache.town ??= townPlaces()).forEach((l, k) => out.set(k, l.slice()));
  dressing(q, out);
  // kit v3 pieces take their own size (engine/kitV3Data V3_K): the tables above keep the numbers of the old pieces
  out.forEach((l, k) => { const m = V3_K[k]; if (m) out.set(k, l.map((p) => ({ x: p.x, y: p.y, z: p.z, ry: p.ry, sx: p.sx * m, sy: p.sy * m, sz: p.sz * m }))); });
  qtRockSwap(out);
  bushSwap(q, out);
  qtDecor(q, out);
  qtForest(q, out);
  if (q.name !== 'HIGH') for (const k of ['N_Wheat', 'N_Corn_1', 'N_Corn_2']) { const l = out.get(QT_PREFIX + k); if (l) out.set(QT_PREFIX + k, l.filter((_, i) => (q.name === 'LOW' ? i % 2 === 0 : i % 4 !== 3))); }   // (the fields thin out on the lower tiers)
  return out;
}

/** (owner) Every round kit rock of the town map (grove / river-bank / rim boulders, boundary stones: rock_round_a / b, rock_cluster_small, cliff_rock_large) becomes a formation of
 *  3-6 Quaternius rocks on the same spot and footprint. Small stones stay small (3 pebbles), the big rim boulders become real formations. */
const ROCK_SWAP: Record<string, number> = { rock_round_a: 1.1, rock_round_b: 1.1, rock_cluster_small: 1.05, cliff_rock_large: 4.1 };
function qtRockSwap(out: Sets): void {
  for (const name of Object.keys(ROCK_SWAP)) {
    const list = out.get(name); if (!list) continue;
    list.forEach((p, i) => { const R = Math.max(0.35, ROCK_SWAP[name] * p.sx * (name === 'cliff_rock_large' ? 0.8 : 0.95)); rockPut(out, p.x, (p.y ?? 0) + 0.12 * R, p.z, R, i * 3 + name.length, R > 2.4 ? 7 : 0); });
    out.set(name, []);
  }
}

/** Every old faceted bush (kit bush_cluster / bush_round / bush_flower) becomes a pile of 2-3 soft rounded pack bushes (BushBerries / Bush_1-2) on the same spot and footprint. */
function bushSwap(q: QualityCfg, out: Sets): void {
  const n = q.name === 'LOW' ? 2 : 3, pool = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];
  for (const name of ['bush_cluster', 'bush_round', 'bush_flower']) {
    const list = out.get(name); if (!list) continue;
    const box = V3_BOX[name], hw = box ? (box[1] - box[0]) / 2 : 0.8;
    for (const p of list) {
      const R = hw * p.sx;
      for (let i = 0; i < n; i++) {
        const a = hash2(p.x, p.z, 50 + i) * TAU, d = i === 0 ? 0 : R * 0.5, sc = Math.max(0.55, R * 0.8) * (0.85 + hash2(p.x, p.z, 60 + i) * 0.3) * (i === 0 ? 1.1 : 0.85);
        put(out, QT_PREFIX + qtPick(pool, hash2(p.x, p.z, 70 + i)), { x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d, ry: hash2(p.x, p.z, 80 + i) * TAU, sx: sc, sy: sc * (0.9 + hash2(p.x, p.z, 90 + i) * 0.2), sz: sc });
      }
    }
    out.set(name, []);
  }
}

/** Quaternius (render/qtNature.tsx) walk-through decor of the town + meadows (engine/townFill QT_DECOR), thinned on the lower tiers. */
function qtDecor(q: QualityCfg, out: Sets): void {
  QT_DECOR.forEach(([piece, [x, z, ry, sx, sy, sz]], i) => {
    if (q.name === 'LOW' ? i % 3 !== 0 : q.name === 'MEDIUM' ? i % 3 === 2 : false) return;
    put(out, piece, { x, y: groundAt(x, z) - 0.02, z, ry, sx, sy, sz });
  });
}

/** EVERY tree of the town + outskirts (oak / birch / fruit / blossom / willow / the two layered pines / palms: TOWN_TREES, the grove + park tables of townFill, the forest ring, the beach palms)
 *  becomes a Quaternius pack 2 tree (`N_*`, public/models/nature_qt2.glb), sized like the toy tree it replaces (same height x 1.12 x 1.4, 4.8 .. 7.6 m, crowns widened with it): oak -> CommonTree /
 *  BirchTree, blossom -> the Autumn variants (colour), fruit -> CommonTree with some Autumn, willow -> Willow (rivers + lake), pines -> PineTree, palm -> PalmTree_1-4; ~14 % of the trees outside
 *  the walls are Autumn ones. On the island: the full ~1.7k-triangle models; off the island's edge: ~600-triangle LODs (Common / Birch / Pine). No toy tree is drawn any more:
 *  colliders, positions and counts are untouched. */
const TREE_SWAP = ['tree_oak_big', 'tree_oak_small', 'tree_birch', 'tree_fruit', 'tree_willow', 'tree_blossom', 'tree_pine_layered_a', 'tree_pine_layered_b', 'palm_v3'];
export const QT_FOREST_STATS = { hi: 0, lo: 0, tris: 0 };
function qtForest(q: QualityCfg, out: Sets): void {
  const low = q.name === 'LOW';
  QT_FOREST_STATS.hi = QT_FOREST_STATS.lo = QT_FOREST_STATS.tris = 0;
  for (const piece of TREE_SWAP) {
    const list = out.get(piece); if (!list) continue;
    const H0 = V3_BOX[piece][4];
    for (const p of list) {
      const dEdge = Math.hypot(p.x, p.z) - edgeR(Math.atan2(p.z, p.x)), h1 = hash2(p.x, p.z, 11), h2 = hash2(p.x, p.z, 12), outside = !inYard(p.x, p.z, 0);
      let pool: string[];
      switch (piece) {
        case 'tree_willow': pool = QT_COMMON; break;   // (owner 2026-10-24: textured pack-1 trees, not pack-2's flat low-poly ones)
        case 'tree_blossom': pool = QT_COMMON; break;
        case 'tree_fruit': pool = QT_COMMON; break;
        case 'tree_pine_layered_a': case 'tree_pine_layered_b': pool = QT_PINE; break;
        case 'palm_v3': pool = N2.palm; break;
        default: pool = QT_COMMON;
      }
      const node = qtPick(pool, hash2(p.x, p.z, 13)), lo = (low || dEdge > 0) && qtLod(node) !== node, name = QT_PREFIX + (lo ? qtLod(node) : node);
      const hh = piece === 'palm_v3' ? Math.min(8, Math.max(5.5, H0 * p.sy * 1.12 * 1.5)) : Math.min(9, Math.max(7, H0 * p.sy * 1.12 * 1.4 * 1.5)), k = hh / QT_H[node], w = k * 1.02 * (p.sx / p.sy);
      put(out, name, { x: p.x, y: p.y, z: p.z, ry: p.ry, sx: w, sy: k, sz: w });
      if (!lo && outside && dEdge < -8 && piece !== 'palm_v3' && hash2(p.x, p.z, 14) < 0.7) {   // (owner) 2-4 pack bushes huddled round the trunk of the outskirts trees (walk-through; the trunk's own table collider is unchanged)
        const nb = 2 + Math.floor(hash2(p.x, p.z, 15) * 3), pool = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];
        for (let i = 0; i < nb; i++) { const a = hash2(p.x, p.z, 16 + i) * TAU, d = 1.1 + hash2(p.x, p.z, 26 + i) * 0.9, sc = 0.7 + hash2(p.x, p.z, 36 + i) * 0.8; put(out, QT_PREFIX + qtPick(pool, hash2(p.x, p.z, 46 + i)), { x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d, ry: hash2(p.x, p.z, 56 + i) * TAU, sx: sc, sy: sc * 0.95, sz: sc }); }
      }
      if (lo) { QT_FOREST_STATS.lo++; QT_FOREST_STATS.tris += 600; } else { QT_FOREST_STATS.hi++; QT_FOREST_STATS.tris += 1700; }
    }
    out.set(piece, []);
  }
}
