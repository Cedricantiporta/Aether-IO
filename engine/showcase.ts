// ============================================================================
// Showcase fight (owner): right after a NEW character is created, the hero fights one fully powered arena battle (max level,
// all skills at max, a Mythic +9 set, a max Mythic pet, full ultimate with fast charge) as a taste of what is to come. It is a
// temporary state overlay: store.startShowcase snapshots the whole profile, overlays the power-ups and starts the run;
// store.endShowcase restores the snapshot (nothing is kept, nothing is written to the save in between).
// This file is the engine side: run flag + timers + the per-character "pending" marker (localStorage). Pure TS, no store import.
// ============================================================================
export const SHOWCASE_BIOME = 4;      // (owner) Frostpeak: an ice arena
export const SHOWCASE_DEPTH = 28;     // monster strength (a late-biome pack)
export const INTRO_SEC = 5;           // the intro line is up this long
export const OUTRO_SEC = 6;           // after the last kill: the outro line, then back to town
export const ULT_CHARGE_MUL = 8;      // basic hits fill the ultimate bar this much faster
export const ULT_CD_MUL = 0.12;       // ... and its cooldown is this much shorter
/** (owner) a longer fight: monster HP x this, and most ordinary monsters carry a shield */
export const SHOWCASE_HP_MUL = 2.2, SHOWCASE_SHIELD_CHANCE = 0.6;
/** (owner) hero power: every skill maxed, but not everything: this class level, gear at this +level, no talents */
export const SHOWCASE_LEVEL = 40, SHOWCASE_PLUS = 5;

export const showcase = { on: false, t: 0, victory: false, outroT: 0, ended: false };
/** Registered by the store (it owns the snapshot): ends the showcase and returns the hero to town. */
export const showcaseHooks = { end: null as null | ((won: boolean) => void) };

export function resetShowcase(): void { showcase.t = 0; showcase.victory = false; showcase.outroT = 0; showcase.ended = false; }
function finish(won: boolean): void { if (showcase.ended) return; showcase.ended = true; showcaseHooks.end?.(won); }
/** The skip button / Esc: back to town at once. */
export function skipShowcase(): void { if (showcase.on) finish(false); }
/** The director calls this when the boss and the whole pack are down. */
export function showcaseVictory(): void { if (showcase.on && !showcase.victory) { showcase.victory = true; showcase.outroT = 0; } }
/** Per-frame from updateGame (playing only). */
export function tickShowcase(dt: number): void {
  if (!showcase.on) return;
  showcase.t += dt;
  if (showcase.victory) { showcase.outroT += dt; if (showcase.outroT >= OUTRO_SEC) finish(true); }
}

// ---- "pending" marker: set when a character is created, consumed when its showcase starts (so it plays exactly once per character)
const KEY = 'aether-survivor-showcase-v1';
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const write = (l: string[]): void => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } };
export const markShowcasePending = (charId: string): void => { const l = read(); if (!l.includes(charId)) write([...l, charId]); };
export const showcasePending = (charId: string): boolean => !!charId && read().includes(charId);
export const consumeShowcase = (charId: string): void => write(read().filter((x) => x !== charId));
