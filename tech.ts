// Tech House: permanent account upgrades bought with gems (bag / warehouse space, potion strength, gold, xp, vitality).
// Each level is sold as its own one-time upgrade (tier I, II, ...), bought in order; `cost(lv)` = gems for tier lv + 1.
export type TechId = 'bag' | 'warehouse' | 'potion' | 'gold' | 'xp' | 'vitality';
export interface TechDef { id: TechId; name: string; max: number; per: string; cost: (lv: number) => number }
export const TECH: TechDef[] = [
  { id: 'bag', name: 'Bigger Bag', max: 5, per: '+10 bag slots', cost: (lv) => 20 * 2 ** lv },
  { id: 'warehouse', name: 'Warehouse Expansion', max: 4, per: '+25 warehouse slots', cost: (lv) => 25 * 2 ** lv },
  { id: 'potion', name: 'Potion Brewing', max: 5, per: 'Potions restore +12% more', cost: (lv) => 15 * 2 ** lv },
  { id: 'gold', name: 'Treasure Sense', max: 5, per: '+4% gold found', cost: (lv) => 20 * 2 ** lv },
  { id: 'xp', name: 'Scholar', max: 5, per: '+4% experience', cost: (lv) => 20 * 2 ** lv },
  { id: 'vitality', name: 'Vitality Training', max: 5, per: '+3% max health', cost: (lv) => 25 * 2 ** lv },
];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export type TechLevels = Partial<Record<TechId, number>>;
export const techLv = (t: TechLevels | undefined, id: TechId): number => Math.max(0, Math.min(TECH.find((d) => d.id === id)!.max, Math.floor(t?.[id] ?? 0)));
export const sanitizeTech = (raw: unknown): TechLevels => {
  const out: TechLevels = {};
  if (raw && typeof raw === 'object') for (const d of TECH) { const v = Number((raw as Record<string, unknown>)[d.id]); if (v > 0) out[d.id] = Math.min(d.max, Math.floor(v)); }
  return out;
};
