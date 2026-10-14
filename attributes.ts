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
  STR: { name: 'Strength', color: '#ff7a5c', desc: 'Raw power behind every hit.', per: '+1.2% damage, +0.5 knockback per 10' },
  DEX: { name: 'Dexterity', color: '#7fe08a', desc: 'Speed and precision.', per: '+0.8% attack speed, +0.3% crit rate, +0.15% dodge' },
  INT: { name: 'Intelligence', color: '#7fb8ff', desc: 'Skill power and focus.', per: '+1.2% skill damage, +3 max mana, +0.25% cooldown reduction' },
  VIT: { name: 'Vitality', color: '#ffd45a', desc: 'Toughness and endurance.', per: '+2% max HP, +0.4 defense, +1% HP regen' },
  LUK: { name: 'Luck', color: '#d79bff', desc: 'Fortune favours the bold.', per: '+1.5% crit damage, +1% gold find, +0.5% XP' },
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
  s.damage *= 1 + 0.012 * a.STR; s.knockback += 0.05 * a.STR;
  s.fireRate *= 1 + 0.008 * a.DEX; s.critRate += 0.003 * a.DEX; s.dodge += 0.0015 * a.DEX;
  s.skillDamage += 0.012 * a.INT; s.maxMana += 3 * a.INT; s.cooldownReduction = Math.min(0.75, s.cooldownReduction + 0.0025 * a.INT);
  s.maxHealth *= 1 + 0.02 * a.VIT; s.defense += 0.4 * a.VIT; s.regen *= 1 + 0.01 * a.VIT;
  s.critDamage += 0.015 * a.LUK; s.goldFind += 0.01 * a.LUK; s.xpBonus += 0.005 * a.LUK;
}
