// The Adventure Plaza + Lantern Lane dressing (owner 2026-10-31): the built (non-kit) pieces, merged into the town's static chunks by TownScenery (`lifted(...)`): zero per-frame cost.
// `b` = lit vertex-coloured geometry, `g` = unlit glow geometry (lamp bulbs: they brighten at dusk with the town's nightGlow material). Layout data + colliders: engine/adventurePlaza.ts, townData.
// The cobble disc itself is TownScenery.buildRoads (same paving as the castle plaza). Soft, toy-like, creamy stone + warm wood, round shapes.
import type { GB } from './util';
import { ADV_PLAZA, ROADS } from '../engine/townData';
import { AP_LAMPS, AP_BANNERS, AP_PAVE } from '../engine/adventurePlaza';

const STONE = '#e6ddc8', STONE_D = '#cfc4aa', STONE_L = '#f6efdc', SKY = '#bfe3ec', TEAL = '#4fb6c9', WOOD_D = '#7d5a38', GOLD = '#f3cf6e', BULB = '#ffe6a8';
const TAU = Math.PI * 2;

/** True where a dirt road meets the plaza rim (the kerb leaves a gap there). */
const roadMouth = (x: number, z: number): boolean => {
  for (const r of ROADS) {
    if (!r.dirt) continue;
    const dx = r.x2 - r.x1, dz = r.z2 - r.z1, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - r.x1) * dx + (z - r.z1) * dz) / l2));
    if (Math.hypot(x - r.x1 - dx * t, z - r.z1 - dz * t) < r.w / 2 + 0.7) return true;
  }
  return false;
};

/** A lamp post: cream round base, slim wood pole, a little roofed lantern with a warm glowing bulb. */
function addLamp(b: GB, g: GB, x: number, z: number): void {
  b.cyl(0.34, 0.42, 0.34, 12, [x, 0.17, z], STONE_D);
  b.cyl(0.1, 0.13, 2.5, 8, [x, 1.55, z], WOOD_D);
  b.torus(0.12, 0.04, [x, 1.1, z], GOLD, [Math.PI / 2, 0, 0], 1, 10);
  b.box(0.5, 0.07, 0.5, [x, 2.82, z], WOOD_D);
  g.sph(0.2, [x, 3.08, z], BULB, 1, 8);
  b.cone(0.42, 0.34, 6, [x, 3.45, z], TEAL, [0, Math.PI / 6, 0]);
  b.sph(0.07, [x, 3.66, z], GOLD, 1, 6);
}

/** `lane` = Lantern Lane's lamps only (its own chunk); otherwise the plaza (kerb, inlay, rim lamps, banners). */
export function addAdventurePlaza(b: GB, g: GB, lane = false): void {
  const P = ADV_PLAZA, K = AP_PAVE;
  for (const [x, z] of AP_LAMPS) if ((x < -9.5) === lane) addLamp(b, g, x, z);
  if (lane) return;
  // ---- soft kerb: short rounded stone blocks round the ellipse, in two tones; open where the dirt roads come in
  const circ = Math.PI * (3 * (P.rx + P.rz) - Math.sqrt((3 * P.rx + P.rz) * (P.rx + 3 * P.rz))), n = Math.round(circ / 0.95);
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * TAU, x = P.x + (P.rx + 0.18) * Math.cos(t), z = P.z + (P.rz + 0.18) * Math.sin(t);
    if (roadMouth(x, z)) continue;
    const tx = -P.rx * Math.sin(t), tz = P.rz * Math.cos(t), yaw = -Math.atan2(tz, tx);
    b.box(1.02, 0.2, K.kerb, [x, 0.1, z], i % 2 ? STONE : STONE_D, [0, yaw, 0], [0.94, 1.04]);
    b.box(0.96, 0.05, K.kerb - 0.12, [x, 0.215, z], STONE_L, [0, yaw, 0], [1, 1]);
  }
  // ---- inlay in front of the portal: a pale-blue disc, a cream ring and eight sun rays (the pavement top is y 0.09)
  const I = K.inlay;
  b.cyl(I.r, I.r, 0.03, 40, [I.x, 0.1, I.z], SKY, [0, 0, 0], 1, [1, 1]);
  b.torus(I.r, 0.12, [I.x, 0.105, I.z], STONE_L, [Math.PI / 2, 0, 0], 1, 40);
  b.torus(I.r * 0.55, 0.08, [I.x, 0.105, I.z], STONE_L, [Math.PI / 2, 0, 0], 1, 28);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; b.box(0.22, 0.03, I.r * 0.78, [I.x + Math.sin(a) * I.r * 0.42, 0.108, I.z + Math.cos(a) * I.r * 0.42], i % 2 ? GOLD : TEAL, [0, a, 0], [1, 1]); }
  // ---- banners on tall poles (ry 0: cloth faces south; PI/2: faces east)
  for (const bn of AP_BANNERS) {
    const { x, z, ry } = bn, sn = Math.abs(Math.sin(ry)), cs = Math.abs(Math.cos(ry)), fx = Math.sin(ry), fz = Math.cos(ry);
    b.cyl(0.1, 0.13, 0.3, 8, [x, 0.15, z], STONE_D);
    b.cyl(0.07, 0.09, 4.3, 8, [x, 2.15, z], WOOD_D);
    b.box(1.5 * cs + 0.1 * sn, 0.09, 1.5 * sn + 0.1 * cs, [x, 4.05, z], WOOD_D);
    b.sph(0.12, [x, 4.42, z], GOLD, 1, 6);
    const ox = fx * 0.06, oz = fz * 0.06;
    b.box(1.1 * cs + 0.06 * sn, 1.7, 1.1 * sn + 0.06 * cs, [x + ox, 3.1, z + oz], bn.cloth, [0, 0, 0], [1, 1]);
    b.box(1.16 * cs + 0.08 * sn, 0.1, 1.16 * sn + 0.08 * cs, [x + ox, 3.98, z + oz], bn.trim);
    b.box(0.5 * cs + 0.08 * sn, 0.5, 0.5 * sn + 0.08 * cs, [x + ox + fx * 0.04, 3.1, z + oz + fz * 0.04], bn.trim, cs > sn ? [0, 0, Math.PI / 4] : [Math.PI / 4, 0, 0], [1, 1]);
    g.sph(0.1, [x + fx * 0.12, 3.1, z + fz * 0.12], BULB, 1, 6);
  }
}
