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
  STR: { name: 'Strength', color: '#ff7a5c', desc: 'Raw power behind every hit.', per: '+0.7% damage, +0.3 knockback per 10' },
  DEX: { name: 'Dexterity', color: '#7fe08a', desc: 'Speed and precision.', per: '+0.5% attack speed, +0.2% crit rate, +0.1% dodge' },
  INT: { name: 'Intelligence', color: '#7fb8ff', desc: 'Skill power and focus.', per: '+0.7% skill damage, +2 max mana, +0.15% cooldown reduction' },
  VIT: { name: 'Vitality', color: '#ffd45a', desc: 'Toughness and endurance.', per: '+1.2% max HP, +0.25 defense, +0.6% HP regen' },
  LUK: { name: 'Luck', color: '#d79bff', desc: 'Fortune favours the bold.', per: '+0.9% crit damage, +0.6% gold find, +0.3% XP' },
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
  s.damage *= 1 + 0.007 * a.STR; s.knockback += 0.03 * a.STR;   // (owner: smaller gains per point, ~60% of before)
  s.fireRate *= 1 + 0.005 * a.DEX; s.critRate += 0.002 * a.DEX; s.dodge += 0.001 * a.DEX;
  s.skillDamage += 0.007 * a.INT; s.maxMana += 2 * a.INT; s.cooldownReduction = Math.min(0.75, s.cooldownReduction + 0.0015 * a.INT);
  s.maxHealth *= 1 + 0.012 * a.VIT; s.defense += 0.25 * a.VIT; s.regen *= 1 + 0.006 * a.VIT;
  s.critDamage += 0.009 * a.LUK; s.goldFind += 0.006 * a.LUK; s.xpBonus += 0.003 * a.LUK;
}
