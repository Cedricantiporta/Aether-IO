// ============================================================================
// Enemy traits (owner): normal monsters (and more often elites) can carry traits rolled at spawn, more of them the deeper the run.
// Pure data + helpers (no React / store). `Enemy.traits` is a bitmask of TR.*; the effects live in enemies.ts (movement, CC, flank / dodge),
// combat.ts (resists, on-hit debuffs and hero CC) and the readable markers in render/Enemies.tsx (tint) + ui/hud/TargetFrame.tsx (chips).
// ============================================================================
import type { EnemyKind } from './types';

export const TR = {
  KB_RESIST: 1,        // shrugs off knockback
  CC_RESIST: 2,        // stun / freeze / fear wear off much sooner
  ELEM_RESIST: 4,      // takes half damage from fire / ice / poison / magic / lightning
  POISON: 8,           // hits poison the hero
  DEF_BREAK: 16,       // hits lower the hero's defense (curse)
  ATK_BREAK: 32,       // hits weaken the hero's attack (blind: shots miss their aim)
  SLOW: 64,            // hits slow the hero
  STUN: 128,           // hits can stun the hero
  KNOCK: 256,          // hits knock the hero back: cancels the current cast + pauses basic attacks
  KNOCKDOWN: 512,      // hits can knock the hero down (no move / skills until the get-up)
  COMBO: 1024,         // melee: strikes 2-3 times in a quick sequence
  QUICK: 2048,         // quickdraw: faster projectiles, shorter telegraph wind-up
  // ---- hidden innate bits (no chip / tint): movement hindrance on hit (diminishing returns in combat.hinder)
  HIND_SLOW: 4096,     // its hits slow the hero briefly
  HIND_ROOT: 8192,     // its hits root the hero briefly
} as const;

/** Innate movement hindrance: telegraphed / heavy attackers of these kinds slow (or root) the hero for ~1 s on hit. */
const INNATE_SLOW: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['YETI', 'MUMMY', 'HAUNTED_ARMOR', 'SPORECAP', 'FROST_WISP', 'BRUTE', 'ZOMBIE', 'BOAR']);
const INNATE_ROOT: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['SCORPION', 'VOID_STALKER', 'SHIELDBEARER', 'WRAITH', 'CINDER_SHAMAN']);
export function innateHinder(kind: EnemyKind, elite: boolean, boss: boolean, rng: () => number = Math.random): number {
  let m = 0;
  if (INNATE_SLOW.has(kind)) m |= TR.HIND_SLOW;
  if (INNATE_ROOT.has(kind)) m |= TR.HIND_ROOT;
  if (boss) m |= TR.HIND_SLOW;                       // boss slams / swings slow
  else if (elite) m |= rng() < 0.5 ? TR.HIND_SLOW : rng() < 0.4 ? TR.HIND_ROOT : 0;   // some elites / champions hinder too
  return m;
}

export interface TraitInfo { bit: number; id: string; name: string; glyph: string; color: string; tint: [number, number, number]; desc: string }
export const TRAIT_LIST: TraitInfo[] = [
  { bit: TR.KB_RESIST, id: 'kbres', name: 'Heavy', glyph: '⛰', color: '#c9a46a', tint: [1.1, 0.98, 0.8], desc: 'Hard to push: resists knockback.' },
  { bit: TR.CC_RESIST, id: 'ccres', name: 'Steadfast', glyph: '✦', color: '#ffd23a', tint: [1.18, 1.1, 0.75], desc: 'Stuns, freezes and fear wear off much sooner.' },
  { bit: TR.ELEM_RESIST, id: 'elres', name: 'Warded', glyph: '❖', color: '#9ad0ff', tint: [0.85, 1.0, 1.25], desc: 'Takes half damage from fire, ice, poison, magic and lightning.' },
  { bit: TR.POISON, id: 'poison', name: 'Venomous', glyph: '☠', color: '#84cc16', tint: [0.85, 1.2, 0.7], desc: 'Its hits poison you.' },
  { bit: TR.DEF_BREAK, id: 'defbreak', name: 'Corroding', glyph: '⛉', color: '#c084fc', tint: [1.15, 0.85, 1.25], desc: 'Its hits lower your defense for a while.' },
  { bit: TR.ATK_BREAK, id: 'atkbreak', name: 'Dazzling', glyph: '✺', color: '#cbd5e1', tint: [1.15, 1.15, 1.2], desc: 'Its hits blind you: your aim suffers for a while.' },
  { bit: TR.SLOW, id: 'slow', name: 'Chilling', glyph: '❄', color: '#60a5fa', tint: [0.85, 1.05, 1.3], desc: 'Its hits slow you.' },
  { bit: TR.STUN, id: 'stun', name: 'Concussive', glyph: '★', color: '#facc15', tint: [1.25, 1.2, 0.7], desc: 'Its hits can stun you.' },
  { bit: TR.KNOCK, id: 'knock', name: 'Shover', glyph: '➤', color: '#fb923c', tint: [1.25, 1.0, 0.75], desc: 'Its hits knock you back and interrupt your cast.' },
  { bit: TR.KNOCKDOWN, id: 'down', name: 'Crusher', glyph: '⤓', color: '#ef4444', tint: [1.3, 0.8, 0.8], desc: 'Its hits can knock you down.' },
  { bit: TR.COMBO, id: 'combo', name: 'Flurry', glyph: '≫', color: '#f472b6', tint: [1.25, 0.85, 1.05], desc: 'Strikes 2-3 times in a quick sequence.' },
  { bit: TR.QUICK, id: 'quick', name: 'Quickdraw', glyph: '➶', color: '#fde047', tint: [1.2, 1.15, 0.8], desc: 'Faster projectiles and a shorter wind-up.' },
];
export const TRAIT_BY_BIT: Record<number, TraitInfo> = Object.fromEntries(TRAIT_LIST.map((t) => [t.bit, t]));

/** Kinds that strike in melee (COMBO) / throw things or telegraph (QUICK). Others never roll them. */
const MELEE: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['SLIME', 'GOBLIN', 'BAT', 'ZOMBIE', 'BANDIT', 'DIREWOLF', 'HELLHOUND', 'HAUNTED_ARMOR', 'SCORPION', 'SCARAB', 'SKELETON_WARRIOR', 'GARGOYLE', 'YETI', 'BRUTE', 'BOAR', 'MUMMY']);
const NO_TRAITS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['BOMBER', 'SPLITTER', 'CRYSTAL_GOLEMITE', 'GOBLIN_ARCHER', 'LAKE_HYDRA', 'DARK_HERO', 'HUMAN_BOSS']);
const HITS_HERO = TR.POISON | TR.DEF_BREAK | TR.ATK_BREAK | TR.SLOW | TR.STUN | TR.KNOCK | TR.KNOCKDOWN;

/** Chance that an ordinary monster rolls a trait: grows with the biome and the depth (Greenwood d1-3 stays almost clean). */
export const traitChance = (biome: number, wave: number, elite: boolean): number =>
  Math.min(0.85, (0.05 + 0.045 * Math.max(0, biome) + 0.006 * Math.max(0, wave - 1)) * (elite ? 3 : 1) + (elite ? 0.25 : 0));

/** Rolls the trait bitmask of a freshly spawned enemy (0 = none). Elites roll 1-2 (a third deep in), others 0-1 (a second deep in). */
export function rollTraits(kind: EnemyKind, biome: number, wave: number, elite: boolean, rng: () => number = Math.random): number {
  if (NO_TRAITS.has(kind)) return 0;
  if (rng() >= traitChance(biome, wave, elite)) return 0;
  const n = 1 + (rng() < (elite ? 0.5 : 0.12) + 0.02 * biome ? 1 : 0) + (elite && rng() < 0.1 * biome ? 1 : 0);
  let mask = 0;
  for (let k = 0; k < n; k++) {
    const t = TRAIT_LIST[Math.floor(rng() * TRAIT_LIST.length)];
    if (t.bit === TR.COMBO && !MELEE.has(kind)) continue;
    if ((t.bit & HITS_HERO) && mask & HITS_HERO && k > 0 && rng() < 0.6) continue;   // (not a pile of debuffs on one monster)
    mask |= t.bit;
  }
  return mask;
}
export const traitList = (mask: number): TraitInfo[] => TRAIT_LIST.filter((t) => mask & t.bit);
