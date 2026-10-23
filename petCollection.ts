// ============================================================================
// Pet Collection: every pet species the hero ever owned (store `petSeen`, template ids, saved per character).
// Milestones by number of species collected give small permanent stats, applied in store.calculateStats. Pure data.
// `petMirror.n` is a copy of the species count for calculateStats (kept in sync by store.ts).
// ============================================================================
import { PETS_POOL } from './constants';
import type { PlayerStats } from './types';

export const PET_IDS: readonly string[] = PETS_POOL.map((p) => p.id);
const PET_ID_SET = new Set(PET_IDS);
const PET_ID_BY_NAME = new Map(PETS_POOL.map((p) => [p.name, p.id]));
export const PET_TOTAL = PET_IDS.length;

export interface PetMilestone { n: number; label: string; fx: Partial<{ hp: number; dmg: number; move: number; gold: number; def: number }> }
const T = PET_TOTAL;
/** Thresholds scale with the real species total (the last one is "all of them"). */
export const PET_MILESTONES: readonly PetMilestone[] = [
  { n: Math.max(1, Math.round(T * 0.18)), label: '+30 max HP', fx: { hp: 30 } },
  { n: Math.max(2, Math.round(T * 0.3)), label: '+2% damage', fx: { dmg: 0.02 } },
  { n: Math.max(3, Math.round(T * 0.47)), label: '+3% move speed', fx: { move: 0.03 } },
  { n: Math.max(4, Math.round(T * 0.65)), label: '+5% gold find', fx: { gold: 0.05 } },
  { n: Math.max(5, Math.round(T * 0.82)), label: '+3 defense', fx: { def: 3 } },
  { n: T, label: '+3% damage, +50 max HP', fx: { dmg: 0.03, hp: 50 } },
].filter((m, i, a) => i === 0 || m.n > a[i - 1].n);

export const petMirror = { n: 0 };

/** Template id for a saved / instantiated pet item (instances carry a fresh uid, so go by name). */
export const petSpeciesId = (it: { type: string; id: string; name: string } | null | undefined): string | undefined =>
  !it || it.type !== 'PET' ? undefined : PET_ID_SET.has(it.id) ? it.id : PET_ID_BY_NAME.get(it.name);

export const sanitizePetSeen = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && PET_ID_SET.has(x)))] : []);

export const petMilestonesReached = (n: number): number => PET_MILESTONES.filter((m) => n >= m.n).length;

/** Applies every reached milestone to the final stats (in place). */
export function applyPetCollection(s: PlayerStats, n: number = petMirror.n): void {
  for (const m of PET_MILESTONES) {
    if (n < m.n) break;
    const f = m.fx;
    if (f.hp) s.maxHealth += f.hp;
    if (f.dmg) s.damage *= 1 + f.dmg;
    if (f.move) s.moveSpeed *= 1 + f.move;
    if (f.gold) s.goldFind += f.gold;
    if (f.def) s.defense += f.def;
  }
}
