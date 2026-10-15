// Character attributes (MMO style): STR / DEX / INT / VIT / LUK, allocated per class with points earned by levelling
// (ATTR_PER_LEVEL per level after 1, plus ATTR_START). Applied at the end of store.calculateStats. Pure data + helpers.
import type { HeroClass, PlayerStats } from './types';

export type AttrKey = 'STR' | 'DEX' | 'INT' | 'VIT' | 'LUK';
export type Attrs = Record<AttrKey, number>;
export const ATTR_KEYS: AttrKey[] = ['STR', 'DEX', 'INT', 'VIT', 'LUK'];
export const ATTR_START = 3, ATTR_PER_LEVEL = 2;
export const ATTR_RESET_GOLD = 1000;   // x GOLD_SCALE (charged by the store)

export const emptyAttrs = (): Attrs => ({ STR: 0, DEX: 0, INT: 0, VIT: 0, LUK: 0 });
export const attrPointsTotal = (lv: number): number => ATTR_START + ATTR_PER_LEVEL * Math.max(0, lv - 1);
export const attrSpent = (a: Attrs): number => ATTR_KEYS.reduce((n, k) => n + (a[k] | 0), 0);

export const ATTR_INFO: Record<AttrKey, { name: string; color: string; desc: string; per: string }> = {
  STR: { name: 'Strength', color: '#ff7a5c', desc: 'Raw power behind every hit.', per: '+0.45% damage, +0.2 knockback per 10' },
  DEX: { name: 'Dexterity', color: '#7fe08a', desc: 'Speed and precision.', per: '+0.3% attack speed, +0.12% crit rate, +0.06% dodge' },
  INT: { name: 'Intelligence', color: '#7fb8ff', desc: 'Skill power and focus.', per: '+0.45% skill damage, +1.5 max mana, +0.1% cooldown reduction' },
  VIT: { name: 'Vitality', color: '#ffd45a', desc: 'Toughness and endurance.', per: '+0.8% max HP, +0.15 defense, +0.4% HP regen' },
  LUK: { name: 'Luck', color: '#d79bff', desc: 'Fortune favours the bold.', per: '+0.6% crit damage, +0.4% gold find, +0.2% XP' },
};

export function sanitizeAttrs(raw: unknown): Record<HeroClass, Attrs> {
  const out = {} as Record<HeroClass, Attrs>;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Partial<Attrs>>;
  for (const h of ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'] as HeroClass[]) {
    const a = emptyAttrs(), e = r[h] ?? {};
    for (const k of ATTR_KEYS) a[k] = Math.max(0, Math.floor(Number(e[k]) || 0));
    out[h] = a;
  }
  return out;
}

/** Applies allocated attributes to final stats (in place). */
export function applyAttrs(s: PlayerStats, a: Attrs | undefined): void {
  if (!a) return;
  // (owner: smaller gains per point - ~60% of the original, then ~2/3 of that again)
  s.damage *= 1 + 0.0045 * a.STR; s.knockback += 0.02 * a.STR;
  s.fireRate *= 1 + 0.003 * a.DEX; s.critRate += 0.0012 * a.DEX; s.dodge += 0.0006 * a.DEX;
  s.skillDamage += 0.0045 * a.INT; s.maxMana += 1.5 * a.INT; s.cooldownReduction = Math.min(0.75, s.cooldownReduction + 0.001 * a.INT);
  s.maxHealth *= 1 + 0.008 * a.VIT; s.defense += 0.15 * a.VIT; s.regen *= 1 + 0.004 * a.VIT;
  s.critDamage += 0.006 * a.LUK; s.goldFind += 0.004 * a.LUK; s.xpBonus += 0.002 * a.LUK;
}
