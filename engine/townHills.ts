// ============================================================================
// Rolling hills outside the town walls (owner: "more terrain elevation"). Pure TS, no three.
// A height grid (1 unit cells) is built once: gentle noise mounds, faded to 0 near everything that has to stand flat
// (the walls, roads + dirt paths, fields, the river, the beach, buildings, fences, lamps, trees, carts, the camp, the
// portal / tower). The fade uses a chamfer distance transform over a rasterised "flat" mask, so it stays cheap.
// Walkable: the engine keeps y = 0; renderers add it via render/lift.ts liftAt(), the ground mesh via terrainFn.groundY.
// ============================================================================
import { ROADS, FIELDS, FARM, WALL, RIVER, BRIDGE, TOWER, PORTAL, BOSS_PORTAL, OLD_SPOT, TOWN_COLLIDERS, VILLAGE_NODES, ADV_PLAZA, ADV_VILLAGE, inAdvPlaza } from './townData';
import { SHOP_POSITIONS } from '../constants';
import { inCampYard } from './caveData';

const X0 = -80, Z0 = -80, NX = 170, NZ = 365;   // grid covers x -80..90, z -80..285 (+ the Boss Trials headland) (the forest south of the portal clearing + the tower clearing)
let H: Float32Array | null = null;

function noise(x: number, z: number): number {
  // a few rotated sine layers (smooth, deterministic, 0..1)
  const a = Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.063 - 0.7);
  const b = Math.sin((x * 0.6 + z * 0.8) * 0.045 + 2.1);
  const c = Math.sin(x * 0.13 - z * 0.11 + 0.4) * 0.5;
  return Math.max(0, Math.min(1, 0.5 + 0.32 * a + 0.28 * b + 0.18 * c));
}

function build(): Float32Array {
  const n = NX * NZ, INF = 1e9;
  const d = new Float32Array(n).fill(INF);
  const mark = (x0: number, z0: number, x1: number, z1: number, inside: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor(x0 - X0)), i1 = Math.min(NX - 1, Math.ceil(x1 - X0));
    const j0 = Math.max(0, Math.floor(z0 - Z0)), j1 = Math.min(NZ - 1, Math.ceil(z1 - Z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inside(i + X0, j + Z0)) d[j * NX + i] = 0;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number) => mark(x0, z0, x1, z1, () => true);
  const circle = (cx: number, cz: number, r: number) => mark(cx - r, cz - r, cx + r, cz + r, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r);
  // the walled town, the lake / beach side, the river band, the bridge
  rect(WALL.x0 - 4, WALL.z0 - 4, WALL.x1 + 4, WALL.z1 + 5);
  rect(X0, Z0, -45, Z0 + NZ);
  rect(RIVER.x0, RIVER.z0 - 2, RIVER.x1 + 3, RIVER.z1 + 2);
  rect(-BRIDGE.hw - 2, BRIDGE.z0 - 2, BRIDGE.hw + 2, BRIDGE.z1 + 2);
  // roads + dirt paths (a band around each segment)
  for (const r of ROADS) {
    const w = r.w / 2 + 1.5, len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1), steps = Math.max(1, Math.ceil(len / 0.8));
    for (let k = 0; k <= steps; k++) circle(r.x1 + ((r.x2 - r.x1) * k) / steps, r.z1 + ((r.z2 - r.z1) * k) / steps, w);
  }
  // fields, the farm, buildings, the portal + tower clearings, harvest nodes, the mining camp
  for (const F of [...FIELDS, FARM]) rect(F.x - F.hw - 2, F.z - F.hd - 2, F.x + F.hw + 2, F.z + F.hd + 2);
  for (const s of SHOP_POSITIONS) circle(s.position[0], s.position[2], 7);
  circle(TOWER.x, TOWER.z, 11); circle(TOWER.door.x, TOWER.door.z, 3); circle(PORTAL.x, PORTAL.z, 11); circle(PORTAL.front.x, PORTAL.front.z, 3); circle(BOSS_PORTAL.x, BOSS_PORTAL.z - 2, 13); circle(BOSS_PORTAL.front.x, BOSS_PORTAL.front.z, 3); circle(OLD_SPOT.x, OLD_SPOT.z, 6);
  mark(ADV_PLAZA.x - ADV_PLAZA.rx - 1, ADV_PLAZA.z - ADV_PLAZA.rz - 1, ADV_PLAZA.x + ADV_PLAZA.rx + 1, ADV_PLAZA.z + ADV_PLAZA.rz + 1, (x, z) => inAdvPlaza(x, z, 1.5));   // (owner 2026-10-31) the Adventure Plaza is dead flat
  rect(ADV_VILLAGE.x0, ADV_VILLAGE.z0, ADV_VILLAGE.x1, ADV_VILLAGE.z1);   // ... and so is Lantern Lane
  for (const v of VILLAGE_NODES) circle(v.x, v.z, 3);
  mark(30, -20, 90, 40, (x, z) => inCampYard(x, z, 3));
  // every town collider (houses, barn, coop, fences, lamps, trees, carts, ruins, windmill...) with a small apron
  for (const [x, z, r] of TOWN_COLLIDERS) circle(x, z, r + 1.2);
  // chamfer distance transform (two passes)
  const A = 1, B = 1.414;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + A);
    if (j > 0) { v = Math.min(v, d[k - NX] + A); if (i > 0) v = Math.min(v, d[k - NX - 1] + B); if (i < NX - 1) v = Math.min(v, d[k - NX + 1] + B); }
    d[k] = v;
  }
  for (let j = NZ - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) {
    const k = j * NX + i; let v = d[k];
    if (i < NX - 1) v = Math.min(v, d[k + 1] + A);
    if (j < NZ - 1) { v = Math.min(v, d[k + NX] + A); if (i < NX - 1) v = Math.min(v, d[k + NX + 1] + B); if (i > 0) v = Math.min(v, d[k + NX - 1] + B); }
    d[k] = v;
  }
  const h = new Float32Array(n);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = i + X0, z = j + Z0, k = j * NX + i;
    const t = Math.min(1, Math.max(0, (d[k] - 1.5) / 6)), fade = t * t * (3 - 2 * t);
    const amp = z > RIVER.z1 ? 2.4 : z > WALL.z1 ? 1.1 : 1.6;   // the mainland rolls most, the green a little, the back trail some
    h[k] = fade * amp * noise(x, z);
  }
  return h;
}

/** Hill height at (x, z) (0 inside the walls, on roads, fields, the river...). Bilinear in the 1-unit grid. */
export function hillAt(x: number, z: number): number {
  const fx = x - X0, fz = z - Z0;
  if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return 0;
  if (!H) H = build();
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * NX + i;
  const a = H[k] + (H[k + 1] - H[k]) * u, b = H[k + NX] + (H[k + NX + 1] - H[k + NX]) * u;
  return a + (b - a) * v;
}
