// ============================================================================
// The Boss Trials headland (owner 2026-10-31): the purple portal (townData BOSS_PORTAL) stands on a stone dais with purple-lit pillars, banners, a little shrine,
// seven boss statues, glowing floor runes, lantern posts along the path, a notice board and a lookout deck on the south shore. Pure layout data (no React / three):
// townFill.ts reads it for the kit props + colliders (nav / projectiles stay consistent), render/bossIsland.ts draws the built pieces (merged into the town chunks, no per-frame cost).
// ============================================================================
import { BOSS_PORTAL } from './townData';

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
/** The dirt path's centre line (townData ROADS: (-34,114) -> (-37.5,130) -> portal front): x at a given z. */
export const pathX = (z: number): number => (z < 130 ? -34 - (3.5 * (z - 114)) / 16 : -37.5 - (2.5 * (z - 130)) / (BOSS_PORTAL.front.z - 130));
/** Lantern posts, a pair every few metres on both edges of the path. */
export const BI_LANTERNS: [number, number][] = [];
for (const z of [120, 127, 134, 141]) for (const s of [-1, 1]) BI_LANTERNS.push([pathX(z) + s * 2.7, z]);
/** The notice board (kit notice_board) beside the path, and the lookout deck on the south-east shore. */
export const BI_BOARD = { x: pathX(138.5) + 3.7, z: 138.5, ry: -0.5 };
export const BI_DECK = { x: BOSS_PORTAL.x + 13.5, z: BOSS_PORTAL.z + 8, w: 4.4, d: 3.2 };
/** Solid circles [x, z, r] for everything the builder draws (the kit props add their own in townFill). */
export const BI_SOLIDS: [number, number, number][] = [
  ...BI_PILLARS.map(([x, z]) => [x, z, 0.55] as [number, number, number]),
  ...BI_STATUES.map((s) => [s.x, s.z, 0.65] as [number, number, number]),
  [BI_ALTAR.x, BI_ALTAR.z, 1.15], [BI_ALTAR.x, BI_ALTAR.z - 0.9, 0.5], [BI_ALTAR.x, BI_ALTAR.z + 0.9, 0.5],
  ...BI_BANNERS.map(([x, z]) => [x, z, 0.28] as [number, number, number]),
  ...BI_LANTERNS.map(([x, z]) => [x, z, 0.22] as [number, number, number]),
];
export { TAU as BI_TAU };
