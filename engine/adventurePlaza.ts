// ============================================================================
// The Adventure Plaza + Lantern Lane (owner 2026-10-31): layout data of the big cobble plaza round the Adventure Portal (townData ADV_PLAZA) and of the little village stretch between it and the
// Boss Trials path. Pure data (no React / three). The houses, benches, flower beds, stalls, well, cart, fences, signposts, trees and NPCs live in townData (so colliders, the minimap, flattening
// and click-to-walk all read ONE list); this file adds the pieces that are only decoration: custom lamp posts (emissive bulbs that glow at dusk), banners, flower patches (the kit flower_patch)
// and their colliders. townFill.ts places the kit props + colliders, render/adventurePlaza.ts draws the built pieces (merged into the town chunks: zero per-frame cost).
// ============================================================================
import { ADV_PLAZA, PORTAL, inAdvPlaza, TOWN_SEATS } from './townData';

const deg = (d: number): number => (d * Math.PI) / 180;
/** Lamp posts: 8 round the plaza rim (flanking the road mouths), 5 along Lantern Lane. [x, z] */
export const AP_LAMPS: [number, number][] = [
  [-3.4, 138.6], [13.4, 138.6], [-8.6, 144.5], [18.6, 144.5], [-8.8, 153.8], [18.8, 153.8], [-3.0, 159.8], [14.8, 161.0],
  [-9.8, 147.3], [-18.1, 146.8], [-24.7, 141.5], [-26.0, 137.8], [-25.6, 150.4],
];
/** Banner poles: the plaza's north entrance, the west gate onto the lane. [x, z, cloth colour] (the cloth faces the walker coming in) */
export const AP_BANNERS: { x: number; z: number; ry: number; cloth: string; trim: string }[] = [
  { x: 0.6, z: 137.2, ry: 0, cloth: '#4fb6c9', trim: '#fff1c4' }, { x: 9.4, z: 137.2, ry: 0, cloth: '#f08aa8', trim: '#fff1c4' },
  { x: -8.4, z: 146.2, ry: Math.PI / 2, cloth: '#f4c95a', trim: '#fff1c4' }, { x: -8.4, z: 150.9, ry: Math.PI / 2, cloth: '#7fd06a', trim: '#fff1c4' },
];
/** Solid circles [x, z, r] of the built pieces (lamps, banner poles). */
export const AP_SOLIDS: [number, number, number][] = [
  ...AP_LAMPS.map(([x, z]) => [x, z, 0.3] as [number, number, number]),
  ...AP_BANNERS.map((b) => [b.x, b.z, 0.28] as [number, number, number]),
];
/** Kit flower patches (PIECES.flowers, walk-through): a ring along the plaza rim between the lamps, a few beside the portal's feet, tufts along the lane. [x, z, scale] */
export const AP_FLOWERS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  const near = (x: number, z: number, r: number): boolean => AP_SOLIDS.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < r) || TOWN_SEATS.some((s) => Math.hypot(s.x - x, s.z - z) < r + 0.5);
  for (let i = 0; i < 24; i++) {
    const t = deg(i * 15 + 7), x = ADV_PLAZA.x + (ADV_PLAZA.rx - 1.1) * Math.cos(t), z = ADV_PLAZA.z + (ADV_PLAZA.rz - 1.1) * Math.sin(t);
    const dn = Math.abs(((i * 15 + 7 - 270 + 540) % 360) - 180), dw = Math.abs(((i * 15 + 7 - 180 + 540) % 360) - 180), de = Math.min(i * 15 + 7, 360 - (i * 15 + 7));   // keep the three road mouths open
    if (dn < 30 || dw < 22 || de < 30 || near(x, z, 1.8)) continue;
    out.push([x, z, 0.85 + ((i * 7) % 5) * 0.08]);
  }
  for (const [x, z] of [[-2.4, 154.2], [12.4, 154.2], [-3.0, 148.4], [13.2, 148.6]] as const) if (!near(x, z, 1.4) && inAdvPlaza(x, z, -1)) out.push([x, z, 0.8]);
  for (const [x, z] of [[-10.6, 153.6], [-23.8, 148.0], [-9.6, 142.0], [-19.4, 148.2], [-25.0, 137.4], [-28.4, 138.2], [-14.0, 148.0]] as const) out.push([x, z, 0.75]);
  return out;
})();
/** Haystack + barrel/crate cluster spots (townFill places them where they fit). */
export const AP_HAY: [number, number, number, number][] = [[-10.6, 139.4, 0.4, 0.7], [-28.6, 155.2, 1.1, 0.6]];   // x, z, yaw, scale
export const AP_CLUTTER: [number, number, number][] = [[-13.9, 142.4, 0.3], [-24.6, 156.6, 2.4], [-30.0, 146.4, 0.8], [-9.6, 157.8, 3.5]];
/** The accent trees of Lantern Lane (kit oak / blossom / fruit / pine, with a little undergrowth by townFill). [x, z, role] 0 oak, 1 blossom, 2 fruit, 3 pine */
export const AP_TREES: [number, number, number][] = [
  [-27.4, 156.2, 1], [-9.0, 157.8, 2], [-26.4, 159.0, 0], [-31.6, 139.0, 0], [-18.2, 133.0, 1], [-12.6, 133.4, 0], [-31.0, 152.4, 3], [-16.2, 129.6, 3], [-22.0, 129.2, 0], [-28.6, 129.6, 1],
];
/** The plaza's pavement: an ellipse, a soft stone kerb round it (gaps at the three road mouths) and a lighter inlay ring + star round the portal's front. */
export const AP_PAVE = { kerb: 0.45, inlay: { x: PORTAL.x, z: PORTAL.z - 5.6, r: 3.4 } };
