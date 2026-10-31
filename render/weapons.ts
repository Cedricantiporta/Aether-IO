// Procedural hand-held weapons. Authored frame: grip at origin, long axis +Y, "forward" (bow belly / blade edge) +Z.
import { Color } from 'three';
import { BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { GB, TAU } from './util';

export const RARITY_ACCENT: Record<string, string> = {
  COMMON: '#cfd6dd', UNCOMMON: '#4cc35a', RARE: '#3b82f6', EPIC: '#a855f7', LEGENDARY: '#f97316', MYTHIC: '#ef4444',
};
export const RARITY_TIER: Record<string, number> = { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };

/** Quaternion mapping authored weapon axes onto KayKit `handslot` local axes (X->-Z, Y->-X, Z->+Y). */
export const HANDSLOT_QUAT = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)));

/** The necromancer's hooded model is dyed a dusky violet (multiplied with the character's outfit tint). */
export const NECRO_TINT = new Color('#7d6a9a');
/** A slowly turning emissive extra (halo ring, floating shards). Geometry is authored round the origin; `pos` places it in weapon space. */
export interface WeaponSpin { geo: BufferGeometry; pos: [number, number, number]; axis: 0 | 1 | 2; speed: number }
export interface WeaponGeo { body: BufferGeometry; glow: BufferGeometry; tip: [number, number, number]; spins?: WeaponSpin[] }
/** Optional look overrides: `r` = full rarity look 0..5 (Common, Uncommon, Rare, Epic, Legendary, Mythic; default derives from `tier`), `g` = grade 0 Low / 1 Mid / 2 High, `necro` = skull-topped staff. */
export interface WOpts { r?: number; g?: number; necro?: boolean }
export const RARITY_LOOK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
export const GRADE_LOOK: Record<string, number> = { LOW: 0, MID: 1, HIGH: 2 };
export const wopts = (rarity: string, grade?: string, necro = false): WOpts => ({ r: RARITY_LOOK[rarity] ?? 0, g: GRADE_LOOK[grade ?? 'MID'] ?? 1, necro });
const lk = (tier: number, o?: WOpts) => ({ L: o?.r ?? (tier <= 0 ? 0 : tier + 1), g: o?.g ?? 1 });
// palettes by look 0..5: metal / trim (rarity colour) / guard metal / wood
const STEEL = ['#b3bac5', '#d3dbe4', '#e4edfa', '#ece2ff', '#fff2c8', '#ffe4dc'];
const TRIM = ['#8a6a44', '#4fcf62', '#4a90f5', '#b568f2', '#f6c443', '#ef3d55'];
const GOLDM = ['#a98a5a', '#d9b25a', '#e3c070', '#e8c874', '#ffd35a', '#ffd070'];
const WOODC = ['#8a5a2e', '#97683a', '#7e5a3a', '#6a4a8a', '#d9a94a', '#a82a3e'];
const SPARK = ['#ffffff', '#e4ffe4', '#e4f0ff', '#f6e8ff', '#fff6c4', '#ffe0e0'];
/** feathered wing on side `s` (+1 / -1), in the XY plane: n feathers fanning out from (x0, y0). */
function wing(b: GB, s: number, x0: number, y0: number, n: number, len: number, col: string, col2: string = col, spread = 0.2) {
  for (let k = 0; k < n; k++) {
    const th = 1.35 - k * spread, l = len * (1 - k * 0.12);
    b.cone(0.065, l, 5, [s * (x0 + Math.sin(th) * l * 0.5 + k * 0.03), y0 + Math.cos(th) * l * 0.5 + k * 0.04, 0], k % 2 ? col2 : col, [0, 0, -s * th], [1, 1, 0.45]);
  }
}
const ring = (gb: GB, r: number, tube: number, col: string, rot: [number, number, number]) => gb.torus(r, tube, [0, 0, 0], col, rot, 1, 18);


/** Mining Pickaxe (tool slot): wooden haft + iron double-pointed head (authored like the other weapons: grip at origin, +Y long axis, head curves toward +Z). */
export function makePickaxe(): WeaponGeo {
  const b = new GB([0.8, 1.1]), g = new GB([1, 1]);
  b.cyl(0.05, 0.06, 1.7, 7, [0, 0.45, 0], '#7a5230');
  b.box(0.1, 0.2, 0.1, [0, -0.45, 0], '#3a2616');
  b.box(0.16, 0.14, 0.2, [0, 1.3, 0], '#5a5f68');
  for (const s of [1, -1]) {
    b.box(0.12, 0.1, 0.5, [0, 1.3 + 0.03, s * 0.42], '#aab2bd', [s * 0.18, 0, 0]);
    b.cone(0.06, 0.34, 5, [0, 1.3 - 0.06, s * 0.78], '#d6dde6', [s * (Math.PI / 2 + 0.35), 0, 0]);
  }
  g.box(0.04, 0.04, 0.9, [0, 1.38, 0], '#e8eef5');
  return { body: b.build(), glow: g.build(), tip: [0, 1.3, 0.78] };
}



const done = (b: GB, g: GB, tip: [number, number, number], spins?: WeaponSpin[]): WeaponGeo => ({ body: b.build(), glow: g.build(), tip, spins });
/** a ring of small floating crystals round the origin (spun by the hero) */
function shards(n: number, rx: number, rz: number, col: string, hy = 0.14): BufferGeometry {
  const s = new GB([1, 1]);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; s.octa(0.06, [Math.cos(a) * rx, i % 2 ? hy : -hy, Math.sin(a) * rz], col, [0.8, 1.5, 0.8]); }
  return s.build();
}
function halo(r: number, tube: number, col: string, rot: [number, number, number]): BufferGeometry {
  const h = new GB([1, 1]); h.torus(r, tube, [0, 0, 0], col, rot, 1, 20); return h.build();
}

// ---------------------------------------------------------------------------------------------------------------
// Bow (Archer). Common plain wood -> Uncommon leaf-green tips -> Rare blue gems + fin tips -> Epic ornate purple studs + crystals
// -> Legendary golden limbs, winged riser, glowing string -> Mythic crimson double-limb silhouette + halo + floating shards.
export function makeBow(accent: string, tier: number, o?: WOpts): WeaponGeo {
  const { L, g } = lk(tier, o);
  const b = new GB([0.85, 1.1]), gl = new GB([1, 1]);
  const wood = ['#8a5a2e', '#a8763e', '#c09050', '#8a6ab0', '#e0b04c', '#c0344a'][L];
  const trim = TRIM[L], gold = GOLDM[L];
  const N = 9, half = 1.05 + 0.03 * L, bulge = 0.34 + 0.015 * L;
  const pt = (t: number): [number, number] => [t * half, bulge * (1 - t * t) - bulge];
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
    const [y0, z0] = pt(t0), [y1, z1] = pt(t1);
    const ang = Math.atan2(z1 - z0, y1 - y0), len = Math.hypot(y1 - y0, z1 - z0);
    const taper = 0.1 + 0.012 * L - 0.05 * Math.abs((t0 + t1) / 2);
    b.box(taper, len + 0.02, taper * 1.25, [0, (y0 + y1) / 2, (z0 + z1) / 2], wood, [-ang, 0, 0]);
  }
  if (L >= 3) for (let i = 2; i < N - 2; i += 2) { const t = -1 + (2 * (i + 0.5)) / N; const [y, z] = pt(t); b.sph(0.062, [0, y, z + 0.055], trim, [0.8, 1.3, 0.7], 7); }
  b.cyl(0.075, 0.075, 0.46, 9, [0, 0, 0], L === 0 ? '#4a3220' : '#5a3a24');
  for (const s of [-1, 1]) b.torus(0.078, 0.02, [0, s * 0.2, 0], L === 0 ? '#8f949c' : trim, [Math.PI / 2, 0, 0], 1, 9);
  const [ty, tz] = pt(1);
  for (const s of [-1, 1]) {
    b.sph(0.065 + 0.008 * L, [0, s * ty, tz], L === 0 ? '#8f949c' : trim, 1, 7);
    if (L >= 1) b.cone(0.075, 0.26, 5, [0, s * (ty + 0.1), tz + 0.04], L === 1 ? '#5fd35a' : trim, [s > 0 ? 0.2 : Math.PI - 0.2, 0, 0], [1, 1, 0.5]);
  }
  b.box(0.018, half * 2, 0.018, [0, 0, tz], L >= 4 ? '#fff6c4' : '#efe7cf');
  if (L >= 4) gl.box(0.02, half * 2, 0.02, [0, 0, tz], accent);
  if (L >= 2) gl.sph(0.065 + 0.01 * L, [0, 0, 0.1], accent, [1, 1.2, 0.8], 8);
  if (L >= 2) for (const s of [-1, 1]) gl.sph(0.05, [0, s * ty, tz], accent, 1, 6);
  if (L >= 3) for (const s of [-1, 1]) gl.octa(0.07, [0, s * 0.62, pt(s * 0.6)[1] + 0.07], accent, [0.8, 1.4, 0.8]);
  if (L >= 4) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.cone(0.055, 0.42 - k * 0.07, 5, [0, s * (0.3 + k * 0.1), -0.2 - k * 0.1], k % 2 ? '#fff6c4' : gold, [s > 0 ? -(0.8 + k * 0.25) : Math.PI + 0.8 + k * 0.25, 0, 0], [1, 1, 0.45]);
  if (L >= 5) {   // second, smaller limb pair behind the main bow = unique silhouette
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      const y0 = t0 * half * 0.62, y1 = t1 * half * 0.62, z0 = -bulge * 0.7 * (1 - t0 * t0) - 0.38, z1 = -bulge * 0.7 * (1 - t1 * t1) - 0.38;
      b.box(0.06, Math.hypot(y1 - y0, z1 - z0) + 0.02, 0.07, [0, (y0 + y1) / 2, (z0 + z1) / 2], '#ff9aa6', [-Math.atan2(z1 - z0, y1 - y0), 0, 0]);
    }
    b.box(0.05, 0.2, 0.05, [0, 0, -0.25], gold);
  }
  if (g >= 1 && L >= 1) for (const s of [-1, 1]) gl.sph(0.05, [0, s * 0.3, pt(s * 0.3)[1] + 0.07], accent, 1, 6);
  if (g >= 2 && L >= 1) for (const s of [-1, 1]) gl.sph(0.04, [0, s * 0.7, pt(s * 0.7)[1] + 0.07], accent, 1, 6);
  const spins: WeaponSpin[] = [];
  return done(b, gl, [0, ty, tz], spins);
}

// ---------------------------------------------------------------------------------------------------------------
// Staff / wand (Wizard, Necromancer: `o.necro` swaps the orb for a skull). Common plain stick with a dull stone -> Uncommon forked leaf top
// -> Rare gem in a claw -> Epic crescent + floating gems -> Legendary winged golden crystal -> Mythic crimson crystal, halo and orbiting shards.
export function makeStaff(accent: string, tier: number, o?: WOpts): WeaponGeo {
  const { L, g } = lk(tier, o);
  const necro = !!o?.necro;
  const b = new GB([0.8, 1.1]), gl = new GB([1, 1]);
  const wood = ['#7a5230', '#8a5e34', '#7a4f30', '#6a4a8a', '#e2b64e', '#b8304a'][L];
  const dark = '#3a2616', trim = TRIM[L], gold = GOLDM[L];
  const top = 2.12;
  b.cyl(0.055 + 0.004 * L, 0.07, 2.9, 8, [0, 0.8, 0], wood);
  for (let i = 0; i < 5; i++) b.torus(0.078, 0.018, [0, -0.3 + i * 0.28, 0], L === 0 ? dark : (i % 2 ? trim : gold), [Math.PI / 2, 0, 0], 1, 9);
  b.cone(0.05, 0.3, 6, [0, -0.78, 0], L === 0 ? '#8a8f98' : gold, [Math.PI, 0, 0]);
  b.sph(0.1, [0, 0.18, 0], L === 0 ? dark : trim, [1, 0.8, 1], 8);
  const bone = L >= 4 ? '#fff0cf' : '#efe6d2';
  const orb = (r: number, sy = 1.35) => {
    if (necro) {
      b.sph(0.21 + r * 0.2, [0, top + 0.02, 0], bone, [1, 1.05, 1.05], 10);
      b.box(0.19, 0.09, 0.17, [0, top - 0.16, 0.04], bone);
      gl.sph(0.052 + 0.006 * L, [-0.085, top + 0.03, 0.18], accent, 1, 6); gl.sph(0.052 + 0.006 * L, [0.085, top + 0.03, 0.18], accent, 1, 6);
    } else gl.octa(r, [0, top, 0], accent, [1, sy, 1]);
  };
  const spins: WeaponSpin[] = [];
  if (L === 0) {
    if (necro) orb(0); else { b.sph(0.13, [0, top + 0.1, 0], '#9aa0aa', 1, 9); gl.sph(0.035, [0, top + 0.12, 0.11], accent, 1, 5); }
  } else if (L === 1) {
    for (const s of [-1, 1]) { b.cone(0.05, 0.62, 6, [s * 0.16, top - 0.15, 0], wood, [0, 0, -s * 0.38]); b.cone(0.08, 0.22, 5, [s * 0.28, top + 0.1, 0], '#5fd35a', [0, 0, -s * 0.9], [1, 1, 0.5]); }
    orb(0.15 + 0.01 * g);
  } else if (L === 2) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; b.cone(0.05, 0.62, 5, [Math.cos(a) * 0.17, 2.0, Math.sin(a) * 0.17], gold, [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]); }
    b.torus(0.15, 0.03, [0, 1.84, 0], trim, [Math.PI / 2, 0, 0], 1, 12);
    orb(0.2 + 0.015 * g);
    for (const s of [-1, 1]) gl.octa(0.05, [s * 0.32, 1.95, 0], accent);
  } else if (L === 3) {
    b.torus(0.34, 0.05, [0, top, 0], trim, [0, 0, Math.PI * 0.8], 1, 14, Math.PI * 1.4);
    for (const s of [-1, 1]) b.cone(0.06, 0.2, 5, [s * 0.3, top + 0.3, 0], gold, [0, 0, -s * 0.2]);
    b.torus(0.16, 0.03, [0, 1.84, 0], gold, [Math.PI / 2, 0, 0], 1, 12);
    orb(0.22 + 0.02 * g, 1.3);
  } else if (L === 4) {
    wing(b, 1, 0.12, 1.98, 4, 0.55, gold, '#fff0b0', 0.2); wing(b, -1, 0.12, 1.98, 4, 0.55, gold, '#fff0b0', 0.2);
    b.torus(0.17, 0.035, [0, 1.84, 0], gold, [Math.PI / 2, 0, 0], 1, 12);
    orb(0.22 + 0.02 * g, 1.9);
    gl.octa(0.07, [0, top + 0.42 + 0.03 * g, 0], '#ffffff', [1, 1.5, 1]);
  } else {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.cone(0.055, 0.5 + (i % 2) * 0.2, 5, [Math.cos(a) * 0.2, 1.95, Math.sin(a) * 0.2], i % 2 ? gold : '#e03a52', [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
    wing(b, 1, 0.14, 1.9, 3, 0.5, '#ff6a7e', gold, 0.28); wing(b, -1, 0.14, 1.9, 3, 0.5, '#ff6a7e', gold, 0.28);
    b.torus(0.18, 0.035, [0, 1.82, 0], gold, [Math.PI / 2, 0, 0], 1, 12);
    orb(0.26 + 0.02 * g, 1.7);
  }
  if (g >= 2 && L >= 1) for (let i = 0; i < 3; i++) gl.sph(0.035, [0, 1.5 - i * 0.28, 0.07], accent, 1, 5);
  return done(b, gl, [0, top, 0], spins);
}

// ---------------------------------------------------------------------------------------------------------------
// Axe (Barbarian). Common single dull bit -> Uncommon clean crescent + green band -> Rare double bit + blue gem edge
// -> Epic ornate purple horned head -> Legendary winged golden fan head -> Mythic crimson triple-blade with halo and shards.
export function makeAxe(accent: string, tier: number, o?: WOpts): WeaponGeo {
  const { L, g } = lk(tier, o);
  const b = new GB([0.82, 1.1]), gl = new GB([1, 1]);
  const steel = ['#a9b0bb', '#bfd2dc', '#a9c8f5', '#cdb8f5', '#ffd979', '#ffa9a0'][L], trim = TRIM[L], gold = GOLDM[L];
  const wood = ['#6b4a2c', '#5b3a20', '#5b3a20', '#4a3a6a', '#c8962e', '#8a2236'][L];
  const hy = 1.12;
  b.cyl(0.06, 0.07, 2.4, 8, [0, 0.35, 0], wood);
  for (let i = 0; i < 3; i++) b.cyl(0.078, 0.078, 0.1, 8, [0, -0.35 + i * 0.35, 0], L === 0 ? '#2f2018' : (i % 2 ? gold : trim));
  b.sph(0.1, [0, -0.88, 0], L === 0 ? '#8a8f98' : gold, 1, 8);
  b.cone(0.07, 0.24, 6, [0, -1.0, 0], L === 0 ? '#8a8f98' : steel, [Math.PI, 0, 0]);
  b.cyl(0.095, 0.095, 0.5, 9, [0, hy, 0], L === 0 ? '#6b727e' : gold);
  const bit = (s: number, sc: number) => {
    b.sph(0.55 * sc, [0, hy, s * 0.4 * sc], steel, [0.12, 0.72, 1.0], 12);                  // rounded crescent bit
    b.sph(0.26 * sc, [0, hy + 0.4 * sc, s * 0.2 * sc], steel, [0.12, 1, 0.9], 8);          // upper / lower horns
    b.sph(0.26 * sc, [0, hy - 0.4 * sc, s * 0.2 * sc], steel, [0.12, 1, 0.9], 8);
  };
  bit(1, L === 0 ? 0.85 : 1);
  if (L >= 2) bit(-1, 1);
  if (L >= 1) b.box(0.19, 0.08, 0.2, [0, hy, 0], trim);
  b.cone(0.1, 0.3, 5, [0, hy + 0.62, 0], steel);
  if (L < 2) b.cone(0.08, 0.26, 5, [0, hy - 0.62, 0], steel, [Math.PI, 0, 0]);
  if (L >= 1) gl.sph(0.07 + 0.012 * L, [0.1, hy, 0], accent, 1, 8);
  if (L >= 2) { gl.box(0.04, 0.9, 0.03, [0.08, hy, 0.78], accent); gl.box(0.04, 0.9, 0.03, [0.08, hy, -0.78], accent); }
  if (L === 1) gl.box(0.04, 0.8, 0.03, [0.08, hy, 0.8], accent);
  if (L >= 3) {
    for (const s of [-1, 1]) { b.cone(0.07, 0.4, 5, [0, hy + 0.22, s * 0.95], trim, [s * 1.2, 0, 0]); b.sph(0.07, [0, hy - 0.1, s * 0.98], trim, 1, 6); }
    b.cone(0.09, 0.5, 5, [0, hy + 0.9, 0], gold);
    b.torus(0.17, 0.03, [0, hy, 0], gold, [0, Math.PI / 2, 0], 1, 12);
    gl.octa(0.07, [0, hy + 0.4, 0.02], accent, [1, 1.4, 1]);
  }
  if (L >= 4) {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.cone(0.07, 0.5 - k * 0.1, 4, [0, hy + 0.55 - k * 0.5, s * (0.98 + 0.08 * (k % 2))], k % 2 ? '#fff0b0' : gold, [s * (1.25 + (k - 1) * 0.35), 0, 0], [0.5, 1, 1]);
    gl.box(0.05, 1.3, 0.04, [0.09, hy, 0], '#ffffff');
  }
  if (L >= 5) {
    for (const s of [-1, 1]) { b.cone(0.1, 0.55, 4, [0, hy + 0.2, s * 1.25], '#ff6a7e', [s * 1.5, 0, 0]); gl.sph(0.05, [0.05, hy, s * 1.45], accent, 1, 6); }
    b.cone(0.12, 0.6, 5, [0, hy + 1.2, 0], '#ff6a7e');
  }
  if (g >= 1 && L >= 2) { gl.sph(0.05, [0.1, hy + 0.35, 0.3], accent, 1, 6); gl.sph(0.05, [0.1, hy - 0.35, -0.3], accent, 1, 6); }
  if (g >= 2 && L >= 2) { gl.sph(0.045, [0.1, hy - 0.35, 0.3], accent, 1, 6); gl.sph(0.045, [0.1, hy + 0.35, -0.3], accent, 1, 6); gl.sph(0.04, [0.08, -0.35, 0], accent, 1, 6); }
  const spins: WeaponSpin[] = [];
  return done(b, gl, [0, hy, L >= 2 ? 0.95 : 0.8], spins);
}

// ---------------------------------------------------------------------------------------------------------------
// Knight kite shield (left hand; face normal +Z). Common plain wood + dull iron -> Uncommon steel + green rim -> Rare blue cross + gem
// -> Epic ornate crest with finials -> Legendary golden winged star -> Mythic crimson spiked shield with halo and shards.
export function makeShield(accent: string, tier: number, o?: WOpts): WeaponGeo {
  const { L, g } = lk(tier, o);
  const b = new GB([0.85, 1.1]), gl = new GB([1, 1]);
  const face = ['#b08452', '#d4dce6', '#e2ecfa', '#e9dcff', '#ffe49a', '#e24a5c'][L];
  const rim = ['#8a8f98', '#4fcf62', '#4a90f5', '#b568f2', '#f4bd3a', '#ffd070'][L];
  const trim = TRIM[L], gold = GOLDM[L];
  b.box(0.78, 0.8, 0.07, [0, 0.12, 0], face);
  b.cone(0.55, 0.6, 4, [0, -0.5, 0], face, [Math.PI, Math.PI / 4, 0]);
  b.box(0.86, 0.09, 0.1, [0, 0.54, 0], rim);
  b.box(0.07, 0.82, 0.1, [-0.41, 0.12, 0], rim); b.box(0.07, 0.82, 0.1, [0.41, 0.12, 0], rim);
  b.sph(0.08, [-0.41, 0.54, 0], rim, 1, 8); b.sph(0.08, [0.41, 0.54, 0], rim, 1, 8);
  if (L === 0) { for (const x of [-0.13, 0.13]) b.box(0.025, 0.8, 0.08, [x, 0.12, 0.01], '#7a5430'); b.sph(0.1, [0, 0.12, 0.07], '#8a8f98', [1, 1, 0.6], 8); }
  else {
    b.box(0.12, 0.62, 0.04, [0, 0.05, 0.05], trim); b.box(0.46, 0.12, 0.04, [0, 0.2, 0.05], trim);
    b.sph(0.1, [0, 0.2, 0.07], gold, [1, 1, 0.7], 9);
  }
  if (L >= 2) { gl.sph(0.065, [0, 0.2, 0.12], accent, 1, 8); gl.box(0.035, 0.5, 0.02, [0, 0.05, 0.085], accent); }
  if (L >= 3) {
    for (const s of [-1, 1]) { b.cone(0.07, 0.3, 5, [s * 0.41, 0.74, 0], gold); b.cone(0.06, 0.22, 5, [s * 0.5, 0.2, 0], rim, [0, 0, -s * 1.1], [1, 1, 0.5]); gl.sph(0.04, [s * 0.41, 0.58, 0.06], accent, 1, 6); }
    b.octa(0.17, [0, 0.2, 0.05], gold, [1, 1.2, 0.5]);
    gl.sph(0.075, [0, 0.2, 0.12], accent, 1, 8);
  }
  if (L >= 4) {
    wing(b, 1, 0.38, 0.28, 4, 0.55, gold, '#fff0b0', 0.2); wing(b, -1, 0.38, 0.28, 4, 0.55, gold, '#fff0b0', 0.2);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; gl.cone(0.05, 0.42, 4, [Math.cos(a) * 0.22, 0.2 + Math.sin(a) * 0.22, 0.09], '#ffffff', [0, 0, a - Math.PI / 2 + Math.PI]); }
    gl.octa(0.09, [0, 0.2, 0.12], '#ffffff', [1, 1.2, 0.8]);
  }
  if (L >= 5) {
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; b.cone(0.05, 0.3, 4, [Math.cos(a) * 0.46, 0.2 + Math.sin(a) * 0.5, 0.03], '#ff6a7e', [0, 0, a - Math.PI / 2]); }
    b.cone(0.1, 0.4, 5, [0, -0.9, 0], gold, [Math.PI, 0, 0]);
  }
  if (g >= 1 && L >= 1) { gl.sph(0.04, [-0.34, 0.46, 0.07], accent, 1, 6); gl.sph(0.04, [0.34, 0.46, 0.07], accent, 1, 6); }
  if (g >= 2 && L >= 1) { gl.sph(0.04, [-0.3, -0.12, 0.07], accent, 1, 6); gl.sph(0.04, [0.3, -0.12, 0.07], accent, 1, 6); gl.sph(0.04, [0, -0.5, 0.07], accent, 1, 6); }
  const spins: WeaponSpin[] = [];
  return done(b, gl, [0, 0.2, 0.12], spins);
}

// Knight longsword (blade up = +y). Common plain blade + bar guard -> Uncommon green wrap -> Rare blue curved guard + gem -> Epic ornate crest guard,
// glowing fuller -> Legendary golden wings + crystal -> Mythic crimson twin side blades, halo and floating shards.
export function makeSword(accent: string, tier: number, o?: WOpts): WeaponGeo {
  const { L, g } = lk(tier, o);
  const b = new GB([0.82, 1.1]), gl = new GB([1, 1]);
  const steel = STEEL[L], trim = TRIM[L], gold = GOLDM[L];
  const len = 1.5 + 0.07 * L + 0.05 * g, bw = 0.22 + 0.018 * Math.min(L, 4), y0 = 0.26;
  b.cyl(0.06, 0.06, 0.6, 8, [0, -0.15, 0], L === 0 ? '#5a3a22' : '#4a2e1c');
  if (L >= 1) for (let i = 0; i < 3; i++) b.torus(0.066, 0.018, [0, -0.32 + i * 0.16, 0], trim, [Math.PI / 2, 0, 0], 1, 9);
  b.sph(0.11 + 0.008 * Math.min(L, 3), [0, -0.5, 0], L === 0 ? '#8a8f98' : gold, 1, 10);
  b.box(bw, len, 0.055, [0, y0 + len / 2, 0], steel);
  b.cone(bw * 0.72, 0.32, 4, [0, y0 + len + 0.14, 0], steel, [0, Math.PI / 4, 0]);
  b.box(0.05, len * 0.88, 0.065, [0, y0 + len / 2, 0], L === 0 ? '#8f97a3' : '#a8b2c2');
  if (L >= 4) for (const s of [-1, 1]) b.box(0.025, len * 0.9, 0.06, [s * bw / 2, y0 + len / 2, 0], gold);
  if (L === 0) b.box(0.6, 0.09, 0.12, [0, 0.18, 0], gold);
  else if (L === 1) { b.box(0.7, 0.1, 0.13, [0, 0.18, 0], gold); for (const s of [-1, 1]) b.sph(0.075, [s * 0.36, 0.18, 0], trim, 1, 8); }
  else if (L === 2) { for (const s of [-1, 1]) { b.box(0.38, 0.09, 0.12, [s * 0.22, 0.2, 0], gold, [0, 0, s * 0.22]); b.sph(0.075, [s * 0.4, 0.27, 0], trim, 1, 8); } b.sph(0.1, [0, 0.18, 0], trim, 1, 9); }
  else if (L === 3) {
    for (const s of [-1, 1]) { b.box(0.46, 0.1, 0.13, [s * 0.26, 0.2, 0], gold, [0, 0, s * 0.3]); b.cone(0.07, 0.3, 5, [s * 0.52, 0.38, 0], trim, [0, 0, -s * 0.35]); b.sph(0.07, [s * 0.5, 0.26, 0], trim, 1, 8); }
    b.octa(0.15, [0, 0.2, 0], trim, [1, 1.4, 0.6]);
  } else {
    const c1 = L === 4 ? gold : '#ff6a7e', c2 = L === 4 ? '#fff0b0' : gold;
    wing(b, 1, 0.2, 0.2, L === 4 ? 3 : 4, 0.52, c1, c2, 0.22); wing(b, -1, 0.2, 0.2, L === 4 ? 3 : 4, 0.52, c1, c2, 0.22);
    b.sph(0.11, [0, 0.18, 0], gold, 1, 9);
  }
  if (L >= 2) gl.sph(0.065 + 0.006 * L, [0, 0.18, 0.075], accent, 1, 8);
  if (L >= 3) { gl.box(0.03, len * 0.8, 0.07, [0, y0 + len / 2, 0], accent); gl.sph(0.05, [0, -0.5, 0.08], accent, 1, 6); }
  if (L >= 4) { gl.octa(0.09, [0, 0.4, 0.04], '#ffffff', [1, 1.5, 0.8]); gl.octa(0.07, [0, -0.56, 0], accent, [1, 1.4, 1]); }
  if (L >= 5) for (const s of [-1, 1]) { b.box(0.11, len * 0.5, 0.05, [s * 0.3, y0 + 0.12 + len * 0.25, 0], '#ffe4dc', [0, 0, -s * 0.14]); b.cone(0.08, 0.24, 4, [s * 0.4, y0 + 0.22 + len * 0.5, 0], '#ffe4dc', [0, Math.PI / 4, -s * 0.14]); }
  if (L === 1 && g >= 1) gl.box(0.03, len * 0.6, 0.07, [0, y0 + len * 0.5, 0], accent);
  if (g >= 1 && L >= 1) gl.box(0.05, 0.14 * (1 + g), 0.075, [0, y0 + 0.1 + 0.07 * (1 + g), 0], accent);
  if (g >= 2 && L >= 1) for (const s of [-1, 1]) gl.sph(0.05, [s * 0.38, 0.2, 0], accent, 1, 6);
  const spins: WeaponSpin[] = [];
  return done(b, gl, [0, y0 + len + 0.2, 0], spins);
}
