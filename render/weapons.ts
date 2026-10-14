// Procedural hand-held weapons. Authored frame: grip at origin, long axis +Y, "forward" (bow belly / blade edge) +Z.
import { Color } from 'three';
import { BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { GB, TAU } from './util';

export const RARITY_ACCENT: Record<string, string> = {
  COMMON: '#cfd6dd', RARE: '#3b82f6', EPIC: '#a855f7', LEGENDARY: '#eab308', MYTHIC: '#ef4444',
};
export const RARITY_TIER: Record<string, number> = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };

/** Quaternion mapping authored weapon axes onto KayKit `handslot` local axes (X->-Z, Y->-X, Z->+Y). */
export const HANDSLOT_QUAT = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)));

/** The necromancer's hooded model is dyed a dusky violet (multiplied with the character's outfit tint). */
export const NECRO_TINT = new Color('#7d6a9a');
export interface WeaponGeo { body: BufferGeometry; glow: BufferGeometry; tip: [number, number, number] }

export function makeBow(accent: string, tier: number): WeaponGeo {
  const b = new GB([0.85, 1.1]), g = new GB([1, 1]);
  const wood = tier >= 3 ? '#caa24a' : '#8a5a2e';
  const N = 9, half = 1.05, bulge = 0.34;
  const pt = (t: number): [number, number] => [t * half, bulge * (1 - t * t) - bulge];
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
    const [y0, z0] = pt(t0), [y1, z1] = pt(t1);
    const len = Math.hypot(y1 - y0, z1 - z0);
    const ang = Math.atan2(z1 - z0, y1 - y0);
    const taper = 0.1 - 0.05 * Math.abs((t0 + t1) / 2);
    b.box(taper, len + 0.02, taper * 1.25, [0, (y0 + y1) / 2, (z0 + z1) / 2], wood, [-ang, 0, 0]);
  }
  b.box(0.13, 0.42, 0.16, [0, 0, 0.0], '#3a2616');
  b.box(0.15, 0.06, 0.18, [0, 0.24, 0], accent); b.box(0.15, 0.06, 0.18, [0, -0.24, 0], accent);
  const [ty, tz] = pt(1);
  b.sph(0.06, [0, ty, tz], accent, 1, 5); b.sph(0.06, [0, -ty, tz], accent, 1, 5);
  // string
  b.box(0.018, half * 2, 0.018, [0, 0, tz], '#efe7cf');
  if (tier >= 1) { g.sph(0.07 + tier * 0.01, [0, 0.38, pt(0.36)[1] + 0.03], accent, 1, 6); g.sph(0.07 + tier * 0.01, [0, -0.38, pt(-0.36)[1] + 0.03], accent, 1, 6); }
  if (tier >= 2) { g.sph(0.05, [0, ty, tz], accent, 1, 5); g.sph(0.05, [0, -ty, tz], accent, 1, 5); }
  return { body: b.build(), glow: g.build(), tip: [0, ty, tz] };
}

export function makeStaff(accent: string, tier: number): WeaponGeo {
  const b = new GB([0.8, 1.1]), g = new GB([1, 1]);
  const wood = '#6b4426', dark = '#3a2616';
  b.cyl(0.055, 0.07, 2.9, 7, [0, 0.8, 0], wood);
  for (let i = 0; i < 5; i++) b.torus(0.075, 0.018, [0, -0.3 + i * 0.28, 0], dark, [Math.PI / 2, 0, 0], 1, 8);
  b.cone(0.05, 0.3, 5, [0, -0.78, 0], '#8a8f98', [Math.PI, 0, 0]);
  b.box(0.16, 0.12, 0.16, [0, 0.18, 0], accent);
  // crown prongs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    b.cone(0.05, 0.62, 4, [Math.cos(a) * 0.17, 2.0, Math.sin(a) * 0.17], tier >= 3 ? '#e6c25a' : '#9a7a4a', [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]);
  }
  const gs = 0.2 + tier * 0.02;
  g.octa(gs, [0, 2.12, 0], accent, [1, 1.4, 1]);
  if (tier >= 2) { for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.octa(0.06, [Math.cos(a) * 0.36, 2.2 + (i % 2) * 0.1, Math.sin(a) * 0.36], accent); } }
  return { body: b.build(), glow: g.build(), tip: [0, 2.12, 0] };
}

export function makeAxe(accent: string, tier: number): WeaponGeo {
  const b = new GB([0.82, 1.1]), g = new GB([1, 1]);
  const steel = tier >= 3 ? '#e1e6ee' : '#b4bac4', wood = '#5b3a20';
  b.cyl(0.06, 0.07, 2.4, 6, [0, 0.35, 0], wood);
  for (let i = 0; i < 3; i++) b.box(0.15, 0.1, 0.15, [0, -0.35 + i * 0.35, 0], '#2f2018');
  b.box(0.17, 0.08, 0.17, [0, 1.35, 0], accent);
  b.cone(0.07, 0.28, 5, [0, -0.95, 0], steel, [Math.PI, 0, 0]);
  // double bearded head
  b.octa(0.62, [0, 1.12, 0.38], steel, [0.16, 0.95, 1.0], [0, 0, 0]);
  b.octa(0.62, [0, 1.12, -0.38], steel, [0.16, 0.95, 1.0], [0, 0, 0]);
  b.box(0.22, 0.42, 0.34, [0, 1.12, 0], '#6b727e');
  b.cone(0.1, 0.34, 4, [0, 1.62, 0], steel); b.cone(0.1, 0.34, 4, [0, 0.64, 0], steel, [Math.PI, 0, 0]);
  if (tier >= 1) { g.octa(0.09 + tier * 0.012, [0.0, 1.12, 0.0], accent, [1.4, 1.2, 1.4]); }
  if (tier >= 3) { g.box(0.03, 0.8, 0.05, [0.09, 1.12, 0.9], accent); g.box(0.03, 0.8, 0.05, [0.09, 1.12, -0.9], accent); }
  return { body: b.build(), glow: g.build(), tip: [0, 1.12, 0.9] };
}

/** Knight longsword: fuller-grooved steel blade, gold crossguard, leather grip, round pommel (blade up = +y). */
export function makeSword(accent: string, tier: number): WeaponGeo {
  const b = new GB([0.82, 1.1]), g = new GB([1, 1]);
  const steel = tier >= 3 ? '#eef2f8' : '#c4cad4', gold = '#d9b25a';
  b.cyl(0.06, 0.06, 0.6, 6, [0, -0.15, 0], '#4a2e1c');                    // grip
  b.sph(0.11, [0, -0.5, 0], gold, 1, 8);                                    // pommel
  b.box(0.75 + tier * 0.05, 0.1, 0.14, [0, 0.18, 0], gold);                 // crossguard
  b.box(0.12, 0.14, 0.18, [0, 0.18, 0], accent);
  b.box(0.2, 1.55 + tier * 0.08, 0.05, [0, 1.05 + tier * 0.04, 0], steel);  // blade
  b.box(0.05, 1.4 + tier * 0.08, 0.06, [0, 1.0 + tier * 0.04, 0], '#9aa2ae'); // fuller
  b.cone(0.1, 0.3, 4, [0, 1.98 + tier * 0.08, 0], steel, [0, Math.PI / 4, 0]);
  if (tier >= 1) g.box(0.05, 1.2 + tier * 0.08, 0.07, [0, 1.0 + tier * 0.04, 0], accent);
  if (tier >= 3) { g.sph(0.07, [-0.38, 0.18, 0], accent, 1, 6); g.sph(0.07, [0.38, 0.18, 0], accent, 1, 6); }
  return { body: b.build(), glow: g.build(), tip: [0, 1.9, 0] };
}
