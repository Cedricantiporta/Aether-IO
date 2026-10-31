// Boss FORMS (owner 2026-10-31): a transforming boss fights in two forms. Form 1 is smaller and has its own full HP (stacked bars); when it
// DIES the same enemy is not killed (no loot / kill event / clear): a short dramatic beat plays (engine/systems/bossForm.ts), then it
// RESPAWNS in form 2: bigger, re-tinted, with a new aura, a fresh bar stack and a recoloured skill palette.
// This file is a LEAF (data + per-enemy form state + colour helpers): render, HUD, net and the engine all read it.
import { MAX_ENEMIES } from '../world';
import type { Enemy, EnemyKind } from '../types';

export interface BossFormDef {
  /** body scale of form 1 / form 2 relative to the boss's normal size (hit-box + model + camera follow `e.radius`) */
  s1: number; s2: number;
  /** HP multiplier of form 1 / form 2 (each form gets the FULL bar stack, BOSS_HP_X layers); `final*` = the Herald's finale fight */
  hp: readonly [number, number]; finalHp: readonly [number, number];
  /** form 2: movement speed x, hit power x (projectile + contact) */
  speed: number; dmg: number;
  /** form-2 name suffix (boss bar), floating text + notification of the death beat and of the ascension */
  suffix: string; fallText: string; ascendText: string; ascendNote: string; fallNote: string;
  /** form-2 body colour multiplier (vertex colours x tint), emissive colour + strength, aura ring / particle colours (0xRRGGBB) */
  tint: readonly [number, number, number]; emissive: number; emissiveI: number; aura: number; auraAlt: number;
  /** form-2 skill palette: hue shift (deg) / saturation x / lightness x applied to every telegraph + shockwave colour a form-2 boss casts */
  hue: number; sat: number; lum: number;
  /** form-2 telegraphs are this much bigger */
  tel: number;
  /** form-2 wing glow (the Herald's / Ignar's wings) */
  wing: number;
  /** boss colour of the death burst (form 1) */
  burst: number;
}

export const FORMS: Partial<Record<EnemyKind, BossFormDef>> = {
  // Ignar: hot orange-red fire -> white-hot azure inferno
  BOSS_WARLORD: {
    s1: 0.75, s2: 1.3, hp: [0.75, 1], finalHp: [0.75, 1], speed: 1.3, dmg: 1,
    suffix: ' - Burning Form', fallText: 'IGNAR FALLS...', ascendText: 'IGNAR BURNS ANEW', fallNote: 'Ignar collapses - but the flames are not done!', ascendNote: 'IGNAR RISES, THE BURNING FORM!',
    tint: [0.55, 1.05, 1.9], emissive: 0x2a9bff, emissiveI: 0.55, aura: 0x58c8ff, auraAlt: 0xe2f8ff,
    hue: 185, sat: 1, lum: 1.12, tel: 1.12, wing: 0x2a8cff, burst: 0xff6a1a,
  },
  // The Void Herald: violet void -> crimson-pink final form (the finale fight uses `finalHp`: form 1 = 1x, form 2 = 1.25x of the Void boss's HP)
  BOSS_VOID: {
    s1: 0.75, s2: 1.3, hp: [0.75, 1], finalHp: [1, 1.25], speed: 1.2, dmg: 1.15,
    suffix: ' - Final Form', fallText: 'THE HERALD FALLS...', ascendText: 'THE HERALD ASCENDS', fallNote: 'The Void Herald shatters - and the void gathers his remains!', ascendNote: 'THE VOID HERALD - FINAL FORM!',
    tint: [1.7, 0.55, 1.0], emissive: 0xff2a6a, emissiveI: 0.5, aura: 0xff4d8a, auraAlt: 0xffd9e6,
    hue: 62, sat: 1.05, lum: 1.1, tel: 1.12, wing: 0xff2a6a, burst: 0xc084fc,
  },
};

export const BEAT_T = 2.6;    // the whole transformation beat (seconds)
export const SWAP_T = 1.3;    // ... of which form 1 is dying; at SWAP_T the boss respawns (form 2) and rises for the rest

/** Per-enemy-id form state. form: 0 = first form, 1 = second form. beat: seconds left of the transformation beat (0 = none). */
export const bf = {
  form: new Uint8Array(MAX_ENEMIES),
  beat: new Float32Array(MAX_ENEMIES),
  /** body size of the boss at spawn (before the form scale) and the HP multiplier applied to form 1 */
  r0: new Float32Array(MAX_ENEMIES), s0: new Float32Array(MAX_ENEMIES), mul1: new Float32Array(MAX_ENEMIES),
  /** the boss being updated right now fights in form 2 (set by enemies.updateEnemies while a boss runs: telegraphs / shockwaves recolour) */
  on: false,
  def: null as BossFormDef | null,
};

/** Called when a boss of a transforming kind spawns: form 1 (smaller) with its own state. */
export function initBossForm(e: Enemy): void {
  bf.form[e.id] = 0; bf.beat[e.id] = 0; bf.mul1[e.id] = 1;
  const def = FORMS[e.kind];
  if (!def) return;
  bf.r0[e.id] = e.radius; bf.s0[e.id] = e.scale;
  e.radius = bf.r0[e.id] * def.s1; e.scale = bf.s0[e.id] * def.s1;
}
/** Right after the boss's HP is final (director.spawnBossAt): form 1 gets its HP share. `fin` = the Herald's finale fight. */
export function applyFormHp(e: Enemy, fin: boolean): void {
  const def = FORMS[e.kind];
  if (!def) return;
  const m = (fin ? def.finalHp : def.hp)[0];
  bf.mul1[e.id] = m; e.maxHp = Math.round(e.maxHp * m); e.hp = e.maxHp;
}
/** True while `e` is a boss in its second form. */
export function inForm2(e: Enemy): boolean { return bf.form[e.id] === 1 && !!FORMS[e.kind]; }
/** Boss bar name with the form-2 suffix. */
export function formName(e: Enemy, base: string): string { const d = FORMS[e.kind]; return d && bf.form[e.id] === 1 ? base + d.suffix : base; }

/** Mark (or clear) the boss that is being updated: telegraphs / waves cast now use its form palette. */
export function setFormCaster(e: Enemy | null): void {
  if (e && e.boss && bf.form[e.id] === 1) { const d = FORMS[e.kind]; if (d) { bf.on = true; bf.def = d; return; } }
  bf.on = false; bf.def = null;
}

/** Recolour a skill colour to the current caster's form palette (hue shift / saturation / lightness). No allocation. */
export function formColor(c: number): number {
  const d = bf.def;
  if (!bf.on || !d) return c;
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
  let h = 0, s = 0;
  if (dl > 1e-5) {
    s = l > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn);
    h = mx === r ? ((g - b) / dl + (g < b ? 6 : 0)) : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    h *= 60;
  }
  h = (h + d.hue) % 360; if (h < 0) h += 360;
  s = Math.min(1, s * d.sat); const l2 = Math.min(0.95, l * d.lum);
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s, p = 2 * l2 - q;
  const k = (t: number): number => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const hh = h / 360;
  const R = Math.round(k(hh + 1 / 3) * 255), G = Math.round(k(hh) * 255), B = Math.round(k(hh - 1 / 3) * 255);
  return (R << 16) | (G << 8) | B;
}
/** Telegraph size multiplier of the current caster (1 outside form 2). */
export function formTel(): number { return bf.on && bf.def ? bf.def.tel : 1; }
