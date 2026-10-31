// ============================================================================
// The Boss Trials headland (owner 2026-10-31): the purple portal (townData BOSS_PORTAL) stands on a stone dais with purple-lit pillars, banners, a little shrine,
// seven boss statues, glowing floor runes, lantern posts along the path, a notice board and a lookout deck on the south shore. Pure layout data (no React / three):
// townFill.ts reads it for the kit props + colliders (nav / projectiles stay consistent), render/bossIsland.ts draws the built pieces (merged into the town chunks, no per-frame cost).
// ============================================================================
import { BOSS_PORTAL, BOSS_PATH, OLD_SPOT } from './townData';
import { islandRadius } from './mapgen';

const TAU = Math.PI * 2;
/** The dais: a round paved plaza round (and a little in front of) the portal. */
export const BI_DAIS = { x: BOSS_PORTAL.x, z: BOSS_PORTAL.z - 1.8, r: 8.2 };
const polar = (a: number, r: number): [number, number] => [BI_DAIS.x + Math.cos(a) * r, BI_DAIS.z + Math.sin(a) * r];
const deg = (d: number): number => (d * Math.PI) / 180;

/** Six lamp pillars on the rim, framing the entrance (north = angle 270 deg is left open for the path). */
export const BI_PILLARS: [number, number][] = [200, 238, 302, 340, 0, 180].map((d) => polar(deg(d), 7.7));
/** One small statue per boss (index = biome / boss), in an arc behind the portal; `tint` is the colour of the gem on the plinth. */
export const BI_STATUE_TINT = ['#7fd06a', '#d9c9a0', '#f4c95a', '#4fb8e8', '#9fe0ff', '#ff8a4c', '#b784ff'];
export const BI_STATUES: { x: number; z: number; ry: number; tint: string }[] = BI_STATUE_TINT.map((tint, i) => {
  const a = deg(12 + i * 26), [x, z] = polar(a, 6.5);
  return { x, z, ry: Math.atan2(BI_DAIS.x - x, BI_DAIS.z - z), tint };   // (turned to face the dais centre)
});
/** The small shrine / altar east of the dais (faces west, towards the portal). */
export const BI_ALTAR = { x: BOSS_PORTAL.x + 11.2, z: BOSS_PORTAL.z - 3.4, ry: -Math.PI / 2 };
/** Banner poles flanking the path entrance (cloth faces the path) + two more at the back corners. */
export const BI_BANNERS: [number, number][] = [[BOSS_PORTAL.x - 3.6, BOSS_PORTAL.z - 9.2], [BOSS_PORTAL.x + 3.6, BOSS_PORTAL.z - 9.2], [BOSS_PORTAL.x - 10.4, BOSS_PORTAL.z - 1.4], [BOSS_PORTAL.x + 10.4, BOSS_PORTAL.z - 1.4]];
/** The dirt path (townData BOSS_PATH: plaza rim -> down the peninsula -> portal front): point + unit direction `d` metres BEFORE its end (the portal front), toward the plaza. Layout-time helper (allocates). */
const PATH_LEN: number[] = [0];
for (let i = 1; i < BOSS_PATH.length; i++) PATH_LEN.push(PATH_LEN[i - 1] + Math.hypot(BOSS_PATH[i][0] - BOSS_PATH[i - 1][0], BOSS_PATH[i][1] - BOSS_PATH[i - 1][1]));
export const BOSS_PATH_LEN = PATH_LEN[PATH_LEN.length - 1];
export function pathBack(d: number): { x: number; z: number; tx: number; tz: number } {
  const s = Math.max(0, BOSS_PATH_LEN - d);
  let i = 1; while (i < BOSS_PATH.length - 1 && PATH_LEN[i] < s) i++;
  const a = BOSS_PATH[i - 1], b = BOSS_PATH[i], l = PATH_LEN[i] - PATH_LEN[i - 1], t = l > 0 ? (s - PATH_LEN[i - 1]) / l : 0;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
}
/** Lantern posts, a pair every few metres on both edges of the path's last 28 m. */
export const BI_LANTERNS: [number, number][] = [];
for (const d of [6.6, 13.6, 20.6, 27.6]) { const p = pathBack(d); for (const sd of [-1, 1]) BI_LANTERNS.push([p.x - p.tz * sd * 2.7, p.z + p.tx * sd * 2.7]); }
/** The notice board (kit notice_board) beside the path, and the lookout deck on the south-east shore. */
export const BI_BOARD = (() => { const p = pathBack(9.5); return { x: p.x + 3.7, z: p.z, ry: -0.5 }; })();
export const BI_DECK = { x: BOSS_PORTAL.x + 13.5, z: BOSS_PORTAL.z + 8, w: 4.4, d: 3.2 };

// ---- the shore: walkable shore line, the sand beach on both sides of the portal, driftwood / shells ----
/** z of the walkable shore (island edge) at x, south of the portal (the edge is polar: a few fixed-point steps). */
export function shoreZ(x: number): number {
  let z = BOSS_PORTAL.z + 12;
  for (let i = 0; i < 8; i++) z = Math.sqrt(Math.max(1, islandRadius(Math.atan2(z, x)) ** 2 - x * x));
  return z;
}
const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0..1 sand coverage of the headland beach: a soft strip along the waterline, narrow in front of the portal and wide (about 10 m, wavy) on both sides of it; fades into the grass inland. The terrain ground colour
 *  (render/Terrain.tsx sandAt), the town fill (townFill.blocked) and the forecourt rule (terrainFn.inForecourtUse) all read it. */
export function headSandK(x: number, z: number): number {
  if (z < 228 || x < -3 || x > 64) return 0;
  const s = islandRadius(Math.atan2(z, x)) - Math.hypot(x, z);   // metres inland of the walkable edge (the edge is ~ the shore normal here)
  const dx = Math.abs(x - BOSS_PORTAL.x), side = sst(8.5, 15.5, dx) * sst(38, 29, dx);
  const w = 3.4 + 7.6 * side + Math.sin(x * 0.37 + 1.1) * 0.9 + Math.sin(x * 0.91) * 0.45;
  return sst(w, w - 2.4, s);
}
/** Tiny deterministic generator for the layout tables below (engine side, build time only). */
const lcg = (seed: number): (() => number) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
/** Driftwood logs and shells scattered on the sand strips (x, z, yaw, size): drawn in render/bossIsland.ts; the palms (kit palm_v3) are placed by townFill. */
export const BI_DRIFT: [number, number, number, number][] = [];
export const BI_SHELLS: [number, number, number, number][] = [];
export const BI_PALMS: [number, number, number][] = [];   // x, z, scale
{
  const r = lcg(2631);
  for (let i = 0; i < 34; i++) {
    const sd = i % 2 ? 1 : -1, dx = 10 + r() * 24, x = BOSS_PORTAL.x + sd * dx, zS = shoreZ(x), z = zS - 2.4 - r() * 4.6;   // (the edge wobbles +-1.2 m per session: keep every prop well inland)
    if (i % 3 === 0 && BI_DRIFT.length < 8) BI_DRIFT.push([x, z, r() * Math.PI, 1.3 + r() * 1.3]);
    else if (BI_SHELLS.length < 22) BI_SHELLS.push([x, z, r() * 6.28, i % 4]);
  }
  for (const [dx, back] of [[-13, 7], [-20, 8.5], [-28, 6.5], [15, 7.5], [22, 9], [31, 7]] as const) { const x = BOSS_PORTAL.x + dx; BI_PALMS.push([x, shoreZ(x) - back, 0.95 + r() * 0.2]); }
}

/** The old south-west Boss Trials site (townData OLD_SPOT) as a quiet seaside rest spot at the end of the old path: a small stone pad, two benches looking at the sea, two lamp posts. */
export const BI_OLD_PAD = { x: OLD_SPOT.x, z: OLD_SPOT.z, r: 3.3 };
export const BI_OLD_BENCHES: [number, number, number][] = [[OLD_SPOT.x - 1.6, OLD_SPOT.z + 0.7, Math.PI], [OLD_SPOT.x + 1.6, OLD_SPOT.z + 0.7, Math.PI]];
export const BI_OLD_LAMPS: [number, number][] = [[OLD_SPOT.x - 3.1, OLD_SPOT.z - 0.4], [OLD_SPOT.x + 3.1, OLD_SPOT.z - 0.4]];
/** Solid circles [x, z, r] for everything the builder draws (the kit props add their own in townFill). */
export const BI_SOLIDS: [number, number, number][] = [
  ...BI_PILLARS.map(([x, z]) => [x, z, 0.55] as [number, number, number]),
  ...BI_STATUES.map((s) => [s.x, s.z, 0.65] as [number, number, number]),
  [BI_ALTAR.x, BI_ALTAR.z, 1.15], [BI_ALTAR.x, BI_ALTAR.z - 0.9, 0.5], [BI_ALTAR.x, BI_ALTAR.z + 0.9, 0.5],
  ...BI_BANNERS.map(([x, z]) => [x, z, 0.28] as [number, number, number]),
  ...BI_LANTERNS.map(([x, z]) => [x, z, 0.22] as [number, number, number]),
  ...BI_PALMS.map(([x, z]) => [x, z, 0.5] as [number, number, number]),
  ...BI_OLD_LAMPS.map(([x, z]) => [x, z, 0.22] as [number, number, number]), ...BI_OLD_BENCHES.map(([x, z]) => [x, z, 0.75] as [number, number, number]),
];
export { TAU as BI_TAU };
