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
  STABLE, BREWER_HUT, TOWER, WINDMILL, townLift, LAKE, riverBank, type FieldSpec, WALL_TOWERS, GATE, GATE_TOWER, BRIDGE, MINE_BRIDGE, PLAZA,
} from '../engine/townData';
import { V3_K } from '../engine/kitV3Data';
import { hillAt } from '../engine/townHills';
import { FILL, PIECES } from '../engine/townFill';
import { PALMS, DOCK, ROWBOAT, ENTRY_SIGN, HEADLAND, SOUTH_ROCKS, BEACH } from '../engine/beachData';
import { CAVE_MOUTH, MINE_CAMP, inCaveClear } from '../engine/caveData';
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
  TRAIL_ROCKS.forEach(([x, z, r], i) => {   // kit v3: the big boulders are cliff_rock_large, the rest rock_round / rock_cluster_small
    const sc = (r / 1.3) * (0.95 + hash2(x, z) * 0.2), ry = hash2(x, z, 1) * TAU;
    if (r >= 2.2) { const k = (r / 4.1) * (0.95 + hash2(x, z) * 0.15); put(S, 'cliff_rock_large', P(x, groundAt(x, z) - 0.25 * k, z, ry, k, k * (0.85 + hash2(x, z, 2) * 0.25))); }
    else if (r < 1.2) { const k = (r / 0.9) * 0.9; put(S, 'rock_cluster_small', P(x, groundAt(x, z) - 0.1 * k, z, ry, k, k)); }
    else put(S, i % 2 ? 'rock_round_a' : 'rock_round_b', P(x, groundAt(x, z) - 0.15 * sc, z, ry, sc, sc * (0.9 + hash2(x, z, 2) * 0.3)));
  });
  // ---- outskirts buildings (fronts south): the nature-kit houses of HOUSES (farmhouse, barn, coop)
  for (const h of HOUSES) if (h.nk) put(S, h.nk as NKPiece, P(h.x, groundAt(h.x, h.z), h.z, 0, h.s ?? 1));
  put(S, 'windmill', P(WINDMILL.x, groundAt(WINDMILL.x, WINDMILL.z), WINDMILL.z, 0, WINDMILL.s));
  put(S, 'stable', P(STABLE.x, groundAt(STABLE.x, STABLE.z), STABLE.z, 0, 1));
  put(S, 'brewer_hut', P(BREWER_HUT.x, groundAt(BREWER_HUT.x, BREWER_HUT.z), BREWER_HUT.z, 0, 1));
  put(S, 'endless_tower', P(TOWER.x, groundAt(TOWER.x, TOWER.z), TOWER.z, TOWER.ry, 1));
  put(S, 'mine_entrance', P(CAVE_MOUTH.x, groundAt(CAVE_MOUTH.x, CAVE_MOUTH.z), CAVE_MOUTH.z, 0, 1));
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
  // ---- rocks of the shore: the headland closing the beach's north end, stepping stones into the lake, the lake's south shore, a few on the east shore
  const rock = (x: number, z: number, w: number, hmul: number, y: number, k: number) => put(S, hash2(x, z, k) < 0.5 ? 'rock_round_a' : 'rock_round_b', P(x, y, z, hash2(x, z, k + 1) * TAU, w / 1.4, (w / 1.4) * hmul));
  HEADLAND.forEach(([x, z, r], i) => { rock(x, z, r * 0.95, 1.3 + hash2(x, z) * 0.5, -0.1, 3); if (hash2(x, z, 5) < 0.7) rock(x + (hash2(x, z, 6) - 0.5) * 2, z + (hash2(x, z, 7) < 0.5 ? -1.6 : 1.5), r * 0.55, 1.2, -0.1, 8 + i); });
  for (let i = 0; i < 5; i++) { const x = -70.5 - i * 1.4 - hash2(i, 1), z = 4 + (hash2(i, 2) - 0.5) * 3; rock(x, z, 0.9 + hash2(i, 3) * 0.7, 1.0, -0.15, 20 + i); }
  for (const [x, z, r] of SOUTH_ROCKS) rock(x, z, r, 1.1 + hash2(x, z, 9) * 0.5, -0.15, 30);
  for (let z = LAKE.z0 + 16; z < LAKE.z1 - 16; z += 3) {   // (the sandy east shore of the lake along the town's west wall; the beaches have their own props)
    if ((z > BEACH.z0 - 9 && z < BEACH.z1 + 8) || (z > riverBank(LAKE.x1, 0) - 3 && z < riverBank(LAKE.x1, 1) + 3) || (z > 72 && z < 103)) continue;
    if (hash2(z, 4) < 0.18) rock(LAKE.x1 - 1.5 - hash2(z, 5) * 3, z + hash2(z, 6), (0.6 + hash2(z, 7) * 0.6) * 1.5, 0.7, -0.1, 40);
  }
  // ---- kit v3 landmarks: round wall towers (door side faces the town), the two bridges (stretched to the deck / railing colliders), 
  for (const t of WALL_TOWERS) {
    const k = t.r / 3.0, inx = PLAZA.x - t.x, inz = PLAZA.z - t.z, ry = Math.atan2(inx, inz);
    put(S, 'wall_tower_round', P(t.x, 0, t.z, ry, k, k * (t.corner ? 0.86 : 0.76)));
  }
  for (const sx of [-1, 1]) { const k = GATE_TOWER.r / 3.0; put(S, 'wall_tower_round', P(GATE.x + sx * GATE_TOWER.x, 0, GATE.z, -sx * Math.PI / 2, k, k * 0.95)); }   // the gate's two towers (door side faces the passage)
  { const L = BRIDGE.z1 - BRIDGE.z0; put(S, 'bridge_stone_arch', { x: 0, y: 0, z: (BRIDGE.z0 + BRIDGE.z1) / 2, ry: Math.PI / 2, sx: L / 10.9, sy: 1.12, sz: (BRIDGE.hw * 2 + 0.4) / 3.8 }); }
  { const L = MINE_BRIDGE.z1 - MINE_BRIDGE.z0; put(S, 'bridge_wood_small', { x: MINE_BRIDGE.x, y: 0, z: (MINE_BRIDGE.z0 + MINE_BRIDGE.z1) / 2, ry: Math.PI / 2, sx: L / 6.5, sy: 0.62, sz: (MINE_BRIDGE.hw * 2 + 0.5) / 2.2 }); }
  // ---- crops: the wheat / cabbage / pumpkin rows of the fields (the soil + furrows are still the town's merged ground meshes)
  const crop = (F: { x: number; z: number; hw: number; hd: number; crop: FieldSpec['crop'] }, rnd: () => number, avoid = true) => {
    const { x, z, hw, hd } = F, wheat = F.crop === 'WHEAT', step = wheat ? 1.1 : 1.4;
    for (let zi = -hd + 1.2; zi <= hd - 0.9; zi += 1.4) for (let xi = -hw + 1.0; xi <= hw - 0.8; xi += step) {
      const px = x + xi + (rnd() - 0.5) * 0.14, pz = z + zi + (rnd() - 0.5) * 0.14;
      if (avoid && (Math.hypot(px - SCARECROW.x, pz - SCARECROW.z) < 1.3 || Math.hypot(px - HAYSTACK.x, pz - HAYSTACK.z) < 2.2)) continue;
      const r = rnd(), s = 0.8 + rnd() * 0.35, ry = rnd() * TAU;
      if (wheat) put(S, 'crop_wheat', P(px, 0.05, pz, ry, s, s * (0.9 + rnd() * 0.3)));
      else if (F.crop === 'CABBAGE') put(S, 'crop_cabbage', P(px, 0.05, pz, ry, s * 0.95));
      else { if (r < 0.7) put(S, 'crop_pumpkin', P(px, 0.05, pz, ry, s * 0.9)); else put(S, 'crop_cabbage', P(px, 0.04, pz, ry, 0.5)); }
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
  return out;
}
