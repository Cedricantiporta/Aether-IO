// Boss Trials headland dressing (owner 2026-10-31): the built (non-kit) pieces, merged into the town's static chunks by TownScenery (`lifted(...)`): zero per-frame cost.
// `b` = lit vertex-coloured geometry, `g` = unlit glow geometry (runes, lantern glass, crystals). Layout data + colliders: engine/bossIsland.ts. Soft, toy-like, lilac stone + warm wood.
import type { GB } from './util';
import { BOSS_PORTAL } from '../engine/townData';
import { BI_DAIS, BI_PILLARS, BI_STATUES, BI_ALTAR, BI_BANNERS, BI_LANTERNS, BI_DECK, pathX } from '../engine/bossIsland';

const STONE = '#d4cce0', STONE_D = '#b9afcb', STONE_L = '#e6e0ee', PURPLE = '#8a5fd0', PURPLE_D = '#5f3fa0', GLOW = '#d68cff', GOLD = '#f3cf6e', WOOD = '#b98b5a', WOOD_D = '#7d5a38';
const Y0 = 0.1;   // paving top (the hero walks over it; sunk feet at this height are hidden by the soft stone edge)

export function addBossIsland(b: GB, g: GB): void {
  const D = BI_DAIS;
  // ---- the dais: two low discs + a rounded kerb, an inner star ring, and a paved apron running up the path
  b.cyl(D.r + 0.45, D.r + 0.55, 0.08, 40, [D.x, 0.04, D.z], STONE_D, [0, 0, 0], 1, [1, 1]);
  b.cyl(D.r, D.r + 0.1, 0.1, 40, [D.x, 0.05, D.z], STONE, [0, 0, 0], 1, [1, 1]);
  b.cyl(5.9, 5.9, 0.04, 36, [D.x, Y0 - 0.01, D.z + 0.0], STONE_L, [0, 0, 0], 1, [1, 1]);
  b.torus(D.r + 0.12, 0.13, [D.x, 0.1, D.z], STONE_L, [Math.PI / 2, 0, 0], 1, 40);
  const ax = BOSS_PORTAL.front.x, az0 = BOSS_PORTAL.front.z - 6.4;
  for (let i = 0; i < 6; i++) b.cyl(1.05, 1.1, 0.07, 10, [pathX(az0 + i * 1.2) * 0.5 + ax * 0.5 + (i % 2 ? 0.4 : -0.4), 0.035, az0 + i * 1.2], i % 2 ? STONE : STONE_L, [0, 0, 0], [1, 1, 0.8], [1, 1]);   // stepping slabs
  // ---- glowing runes: two thin rings with 14 glyphs between them
  g.torus(5.35, 0.07, [D.x, Y0 + 0.03, D.z], GLOW, [Math.PI / 2, 0, 0], 1, 56);
  g.torus(3.7, 0.07, [D.x, Y0 + 0.03, D.z], GLOW, [Math.PI / 2, 0, 0], 1, 48);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2, cx = D.x + Math.cos(a) * 4.52, cz = D.z + Math.sin(a) * 4.52, ry = -a + Math.PI / 2;
    const k = i % 4;
    g.box(0.15, 0.03, 0.7, [cx, Y0 + 0.03, cz], GLOW, [0, ry, 0]);
    if (k === 0 || k === 2) g.box(0.14, 0.03, 0.4, [cx + Math.cos(ry) * 0.17, Y0 + 0.03, cz - Math.sin(ry) * 0.17], GLOW, [0, ry + 0.9, 0]);
    if (k === 1 || k === 2) g.box(0.14, 0.03, 0.4, [cx - Math.cos(ry) * 0.17, Y0 + 0.03, cz + Math.sin(ry) * 0.17], GLOW, [0, ry - 0.9, 0]);
    if (k === 3) g.box(0.4, 0.03, 0.14, [cx, Y0 + 0.03, cz], GLOW, [0, ry, 0]);
  }
  // ---- six lamp pillars (round shaft, purple band, soft cap, glowing lantern ball on top)
  for (const [x, z] of BI_PILLARS) {
    b.cyl(0.62, 0.7, 0.3, 14, [x, 0.25, z], STONE_D);
    b.cyl(0.36, 0.44, 2.5, 14, [x, 1.65, z], STONE);
    b.cyl(0.5, 0.4, 0.22, 14, [x, 2.98, z], STONE_L);
    b.torus(0.4, 0.07, [x, 1.0, z], PURPLE, [Math.PI / 2, 0, 0], 1, 14);
    b.torus(0.38, 0.07, [x, 2.55, z], PURPLE, [Math.PI / 2, 0, 0], 1, 14);
    b.cyl(0.3, 0.3, 0.06, 12, [x, 3.12, z], PURPLE_D);
    g.sph(0.36, [x, 3.5, z], GLOW, 1, 10);
    b.cone(0.3, 0.3, 10, [x, 3.98, z], PURPLE_D);
    b.sph(0.07, [x, 4.18, z], GOLD, 1, 6);
  }
  // ---- boss statue plinths (the statue itself is a kit piece): a stone block + a coloured gem for each boss
  for (const s of BI_STATUES) {
    b.cyl(0.74, 0.82, 0.18, 14, [s.x, 0.18, s.z], STONE_D);
    b.cyl(0.55, 0.62, 0.34, 14, [s.x, 0.43, s.z], STONE);
    g.sph(0.1, [s.x + Math.sin(s.ry) * 0.64, 0.45, s.z + Math.cos(s.ry) * 0.64], s.tint, 1, 6);
  }
  // ---- the shrine / altar: stone table, glowing crystal, two candle posts, a tiny roof on posts
  { const A = BI_ALTAR, c = Math.cos(A.ry), sn = Math.sin(A.ry), at = (lx: number, lz: number): [number, number] => [A.x + c * lx + sn * lz, A.z - sn * lx + c * lz];
    b.box(1.9, 0.3, 1.5, [A.x, 0.15, A.z], STONE_D, [0, A.ry, 0]);
    b.box(1.5, 0.55, 1.1, [A.x, 0.58, A.z], STONE, [0, A.ry, 0]);
    b.box(1.7, 0.14, 1.3, [A.x, 0.92, A.z], STONE_L, [0, A.ry, 0]);
    g.octa(0.28, [A.x, 1.55, A.z], GLOW, [1, 1.7, 1], [0, 0.6, 0]);
    b.cyl(0.18, 0.24, 0.12, 8, [A.x, 1.05, A.z], PURPLE_D);
    for (const sd of [-1, 1]) {
      const [px, pz] = at(0.0, sd * 0.9);
      b.cyl(0.07, 0.09, 1.2, 8, [px, 0.6, pz], WOOD_D);
      g.sph(0.14, [px, 1.3, pz], '#ffe2a8', 1, 6);
    }
  }
  // ---- banners on tall poles: purple cloth, gold trim + a glowing diamond
  for (const [x, z] of BI_BANNERS) {
    b.cyl(0.07, 0.09, 4.5, 8, [x, 2.25, z], WOOD_D);
    b.box(1.4, 0.09, 0.09, [x, 4.15, z], WOOD_D);
    b.sph(0.12, [x, 4.58, z], GOLD, 1, 6);
    b.box(1.1, 1.75, 0.06, [x, 3.2, z + 0.06], PURPLE, [0, 0, 0], [1, 1]);
    b.box(0.78, 0.78, 0.06, [x, 2.32, z + 0.06], PURPLE, [0, 0, Math.PI / 4], [1, 1]);
    b.box(1.1, 0.1, 0.07, [x, 4.05, z + 0.07], GOLD);
    g.octa(0.2, [x, 3.3, z + 0.12], GLOW, [1, 1.3, 0.25]);
  }
  // ---- little lantern posts along the path
  for (const [x, z] of BI_LANTERNS) {
    b.cyl(0.06, 0.08, 1.9, 7, [x, 0.95, z], WOOD_D);
    b.box(0.34, 0.06, 0.34, [x, 1.92, z], PURPLE_D);
    g.box(0.24, 0.3, 0.24, [x, 2.12, z], '#ffe6b0');
    b.cone(0.26, 0.2, 4, [x, 2.37, z], PURPLE_D, [0, Math.PI / 4, 0]);
  }
  // ---- the lookout deck on the south-east shore: planks, rail posts on the sea side, bucket, two rods leaning on the rail
  { const K = BI_DECK;
    b.box(K.w + 0.5, 0.3, K.d + 0.5, [K.x, 0.1, K.z], STONE_D, [0, 0, 0], [1, 1]);   // stone footing (the ground rolls here)
    b.box(K.w, 0.14, K.d, [K.x, 0.34, K.z], WOOD, [0, 0, 0], [1, 1]);
    for (let i = 0; i < 7; i++) b.box(K.w - 0.06, 0.02, 0.05, [K.x, 0.42, K.z - K.d / 2 + 0.25 + i * (K.d - 0.5) / 6], WOOD_D);
    for (const sx of [-1, 0, 1]) { b.cyl(0.06, 0.07, 0.95, 7, [K.x + sx * (K.w / 2 - 0.1), 0.55, K.z + K.d / 2 - 0.08], WOOD_D); }
    b.box(K.w - 0.1, 0.08, 0.08, [K.x, 0.98, K.z + K.d / 2 - 0.08], WOOD_D);
    for (const sz of [-1, 1]) { b.cyl(0.06, 0.07, 0.95, 7, [K.x + K.w / 2 - 0.1, 0.55, K.z + sz * (K.d / 2 - 0.08)], WOOD_D); b.cyl(0.06, 0.07, 0.95, 7, [K.x - K.w / 2 + 0.1, 0.55, K.z + sz * (K.d / 2 - 0.08)], WOOD_D); }
    b.cyl(0.2, 0.17, 0.28, 10, [K.x + 1.5, 0.28, K.z - 0.6], '#7aa8c8');
    for (const o of [-0.5, 0.2]) b.cyl(0.025, 0.04, 2.4, 5, [K.x + 0.4 + o, 1.1, K.z + K.d / 2 - 0.3], '#6b4a2a', [-0.55, 0, 0.1]);
    g.sph(0.07, [K.x + 0.4 - 0.5, 0.4, K.z + K.d / 2 + 0.9], '#ff7a5a', 1, 5);
  }
}
