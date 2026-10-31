// ============================================================================
// Pet Collection: every pet species the hero ever owned (store `petSeen`, template ids, saved per character); only REGISTERED ones (store `petReg`, a button per species) count.
// Milestones by number of species collected: reaching one auto-claims it (store.autoClaimPets), CLAIMED ones give permanent stats,
// applied in store.calculateStats. Pure data. `petMirror` holds the claimed list for calculateStats (kept in sync by store.ts).
// ============================================================================
import { PETS_POOL } from './constants';
import type { PlayerStats } from './types';

export const PET_IDS: readonly string[] = PETS_POOL.map((p) => p.id);
const PET_ID_SET = new Set(PET_IDS);
const PET_ID_BY_NAME = new Map(PETS_POOL.map((p) => [p.name, p.id]));
export const PET_TOTAL = PET_IDS.length;

/** Spacing (owner): frequent small steps at the start (1,2,3,4,5,6,8), wider and much bigger later, the last two at consecutive counts. Counts are REGISTERED species.
 *  One reward step. Percent fields are fractions (0.02 = +2%); hp / def are flat; `crit` adds to crit rate; `gems` is paid once on claim. */
export interface PetFx { hp?: number; hpPct?: number; dmg?: number; move?: number; gold?: number; xp?: number; def?: number; crit?: number; critDmg?: number }
export interface PetMilestone { n: number; label: string; fx: PetFx; gems?: number; final?: boolean; title?: string }

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** "+30 max HP, +2% damage" text for a reward (gems / title are shown by the window itself). */
export function fxLabel(fx: PetFx): string {
  const out: string[] = [];
  if (fx.hp) out.push(`+${fx.hp} max HP`);
  if (fx.hpPct) out.push(`+${pct(fx.hpPct)} max HP`);
  if (fx.dmg) out.push(`+${pct(fx.dmg)} damage`);
  if (fx.def) out.push(`+${fx.def} defense`);
  if (fx.crit) out.push(`+${pct(fx.crit)} crit chance`);
  if (fx.critDmg) out.push(`+${pct(fx.critDmg)} crit damage`);
  if (fx.move) out.push(`+${pct(fx.move)} move speed`);
  if (fx.gold) out.push(`+${pct(fx.gold)} gold find`);
  if (fx.xp) out.push(`+${pct(fx.xp)} XP`);
  return out.join(', ');
}

/** The reward ramp (small and frequent early, big and spaced late). The last step is always "every species" (n = PET_TOTAL). */
const STEPS: readonly { n: number; fx: PetFx }[] = [
  { n: 1, fx: { hp: 20 } },
  { n: 2, fx: { dmg: 0.01 } },
  { n: 3, fx: { move: 0.02 } },
  { n: 4, fx: { hp: 30 } },
  { n: 5, fx: { gold: 0.04 } },
  { n: 6, fx: { def: 2, xp: 0.02 } },
  { n: 8, fx: { dmg: 0.02, hp: 50 } },
  { n: 10, fx: { dmg: 0.03, hpPct: 0.03, def: 3, gold: 0.06 } },
  { n: 12, fx: { dmg: 0.04, hpPct: 0.05, crit: 0.02, xp: 0.04, def: 4 } },
  { n: 14, fx: { dmg: 0.06, hpPct: 0.06, critDmg: 0.1, move: 0.05, gold: 0.08, def: 6 } },
  { n: 16, fx: { dmg: 0.09, hpPct: 0.09, crit: 0.04, def: 10, gold: 0.1, xp: 0.05 } },   // one pet short of the end: already big
];
/** 100% completion: a big package, 1,000 gems and the Beast Whisperer title. */
export const PET_FINAL_TITLE = 'Beast Whisperer';
const FINAL: Omit<PetMilestone, 'n'> = { label: '', fx: { dmg: 0.1, hpPct: 0.1, hp: 200, def: 10, crit: 0.05, gold: 0.15, xp: 0.08, move: 0.05 }, gems: 1000, final: true, title: PET_FINAL_TITLE };

const T = PET_TOTAL;
export const PET_MILESTONES: readonly PetMilestone[] = [
  ...STEPS.filter((m) => m.n < T).map((m) => ({ ...m, label: fxLabel(m.fx) })),
  { ...FINAL, n: T, label: fxLabel(FINAL.fx) },
];

/** Milestone n values the hero has claimed (store.petClaimed, copied here for calculateStats). Reached-but-unclaimed ones give nothing. */
export const petMirror: { n: number; claimed: readonly number[] } = { n: 0, claimed: [] };

/** Template id for a saved / instantiated pet item (instances carry a fresh uid, so go by name). */
export const petSpeciesId = (it: { type: string; id: string; name: string } | null | undefined): string | undefined =>
  !it || it.type !== 'PET' ? undefined : PET_ID_SET.has(it.id) ? it.id : PET_ID_BY_NAME.get(it.name);

export const sanitizePetSeen = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && PET_ID_SET.has(x)))] : []);

export const sanitizePetReg = sanitizePetSeen;
export const sanitizePetClaimed = (raw: unknown): number[] => (Array.isArray(raw) ? [...new Set(raw.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0 && x <= PET_TOTAL))] : []);

export const petMilestonesReached = (n: number): number => PET_MILESTONES.filter((m) => n >= m.n).length;
/** Milestones reached (species count) but not claimed yet. */
export const petClaimable = (n: number, claimed: readonly number[]): PetMilestone[] => PET_MILESTONES.filter((m) => n >= m.n && !claimed.includes(m.n));

/** Applies every CLAIMED milestone to the final stats (in place). */
export function applyPetCollection(s: PlayerStats, claimed: readonly number[] = petMirror.claimed): void {
  for (const m of PET_MILESTONES) {
    if (!claimed.includes(m.n)) continue;
    const f = m.fx;
    if (f.hp) s.maxHealth += f.hp;
    if (f.hpPct) s.maxHealth *= 1 + f.hpPct;
    if (f.dmg) s.damage *= 1 + f.dmg;
    if (f.move) s.moveSpeed *= 1 + f.move;
    if (f.gold) s.goldFind += f.gold;
    if (f.xp) s.xpBonus += f.xp;
    if (f.def) s.defense += f.def;
    if (f.crit) s.critRate += f.crit;
    if (f.critDmg) s.critDamage += f.critDmg;
  }
}
