import type { Item, PlayerStats, Rarity, HeroClass } from '../../types';
import { STAT_NAME, fmtFx } from '../../statFx';

export const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: '#e5e7eb', RARE: '#3b82f6', EPIC: '#a855f7', LEGENDARY: '#eab308', MYTHIC: '#ef4444',
};
export const RARITY_RANK: Record<Rarity, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
/** Colour used for item names on dark backgrounds (slightly lifted for contrast). */
export const RARITY_TEXT: Record<Rarity, string> = {
  COMMON: '#f1f2f4', RARE: '#6ea8ff', EPIC: '#c58bff', LEGENDARY: '#f5c518', MYTHIC: '#ff6b5e',
};

export const HERO_COLOR: Record<HeroClass, string> = { ARCHER: '#3fae55', WIZARD: '#4a7fe0', BARBARIAN: '#cf4343', KNIGHT: '#d9b25a', NECROMANCER: '#8a5ad0' };

export const STAT_LABEL: Record<keyof PlayerStats, string> = {
  ...STAT_NAME,
  maxHealth: 'Health', maxMana: 'Mana', regen: 'HP Regen', manaRegen: 'Mana Regen', moveSpeed: 'Move Speed',
  damage: 'Damage', fireRate: 'Attack Speed', projectileSpeed: 'Proj. Speed', multishot: 'Multishot', spread: 'Spread',
  dashCooldown: 'Dash Cooldown', cooldownReduction: 'Cooldown Red.', magnetRadius: 'Magnet', critRate: 'Crit Rate',
  critDamage: 'Crit Damage', defense: 'Defense', skillDamage: 'Skill Damage', knockback: 'Knockback', dodge: 'Dodge',
};

const BASIC_STATS: Record<string, 1> = { maxHealth: 1, maxMana: 1, regen: 1, manaRegen: 1, moveSpeed: 1, damage: 1, fireRate: 1, projectileSpeed: 1, multishot: 1, spread: 1, dashCooldown: 1, cooldownReduction: 1, magnetRadius: 1, critRate: 1, critDamage: 1, defense: 1, skillDamage: 1, knockback: 1, dodge: 1 };
const PCT_ITEM = new Set(['critRate', 'critDamage', 'dodge', 'cooldownReduction', 'moveSpeed', 'skillDamage', 'spread']);

/** Format an ITEM stat bonus (moveSpeed etc are fractions on items). */
export function fmtItemStat(key: string, v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const a = Math.abs(v);
  if (!(key in BASIC_STATS)) return fmtFx(key as keyof PlayerStats, v);
  if (PCT_ITEM.has(key)) return `${sign}${Math.round(a * 100)}%`;
  if (key === 'regen' || key === 'manaRegen') return `${sign}${a.toFixed(1)}/s`;
  return `${sign}${Number.isInteger(a) ? a : a.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export const timeMMSS = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const GEAR_TYPES = new Set<string>(['WEAPON', 'ARMOR', 'ACCESSORY', 'HELMET', 'GLOVES', 'BOOTS', 'PET']);
export const isGear = (i: Item) => GEAR_TYPES.has(i.type);
export const slotOf = (i: Item): 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory' | 'pet' | null =>
  GEAR_TYPES.has(i.type) ? (i.type.toLowerCase() as 'weapon') : null;
/** Gear sells for 30%; trade-goods loot sells at full value. */
export const sellPrice = (i: Item) => (i.type === 'LOOT' ? i.price : Math.floor(i.price * 0.3));
export const isHighValue = (i: Item) => i.rarity === 'EPIC' || i.rarity === 'LEGENDARY' || i.rarity === 'MYTHIC' || i.level >= 5;

/** Upgrade chance: 100% up to +2, then -10% per level (min 10%). item.level 1 == +0 */
export function upgradeChance(item: Item): number {
  const plus = item.level - 1;
  if (plus < 2) return 1;
  return Math.max(0.1, 1 - (plus - 1) * 0.1);
}
export const upgradeGoldCost = (i: Item) => Math.floor(i.price * i.level * 0.5);
export const upgradeCoreCost = (i: Item) => Math.ceil(i.level / 2);
export const MAX_ITEM_LEVEL = 10;
export function upgradedStats(i: Item): Partial<PlayerStats> {
  const out: Partial<PlayerStats> = {};
  const lvl = Math.max(1, i.level);
  (Object.keys(i.stats) as (keyof PlayerStats)[]).forEach((k) => {
    out[k] = parseFloat(((i.stats[k]! / lvl) * (lvl + 1)).toFixed(2));
  });
  return out;
}

export const TYPE_LABEL: Record<Item['type'], string> = {
  WEAPON: 'Weapon', ARMOR: 'Armor', ACCESSORY: 'Accessory', POTION: 'Potion', CORE: 'Material', PET: 'Companion', REVIVE: 'Relic', HELMET: 'Helmet', GLOVES: 'Gloves', BOOTS: 'Boots', LOOT: 'Loot',
};

export const SORTS = ['RARITY', 'TYPE', 'POWER'] as const;
export type SortMode = typeof SORTS[number];

const TYPE_ORDER: Record<string, number> = { WEAPON: 9, HELMET: 8, ARMOR: 7, GLOVES: 6, BOOTS: 5, ACCESSORY: 4, PET: 3, POTION: 2, CORE: 1, REVIVE: 0, LOOT: 0 };
/** A sorted copy of `items` (Sort buttons of the bag and the warehouse). `cp` = item power. */
export function sortedItems(items: Item[], mode: SortMode, cp: (i: Item) => number): Item[] {
  return [...items].sort((a, b) => {
    if (mode === 'POWER') return cp(b) - cp(a);
    if (mode === 'TYPE') return (TYPE_ORDER[b.type] ?? 0) - (TYPE_ORDER[a.type] ?? 0) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (TYPE_ORDER[b.type] ?? 0) - (TYPE_ORDER[a.type] ?? 0);
  });
}
