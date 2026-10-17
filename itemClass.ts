// ============================================================================
// Class restrictions for equipment (owner): WEAPONS are exclusive per class (Wizard + Necromancer share); WEAR (helmet / armor / gloves / boots) is
// shared by armour group: HEAVY (Knight, Barbarian) and LIGHT (Archer, Necromancer) and ARCANE (Wizard). Wizard and Necromancer share magic weapons. Rings / amulets / charms,
// the tool, potions and materials stay universal. Pure helpers, no store / React imports.
// Old saves without the new fields are inferred (weapon projectile, wear's old classType, class set) or universal.
// ============================================================================
import type { ArmorGroup, HeroClass, Item, ProjectileType } from './types';
import { SET_BY_NAME } from './itemSets';

const BY_PROJECTILE: Partial<Record<ProjectileType, HeroClass>> = { ARROW: 'ARCHER', MAGIC: 'WIZARD', AXE: 'BARBARIAN', SWORD: 'KNIGHT', SOUL: 'NECROMANCER' };
const WEAR = new Set(['HELMET', 'ARMOR', 'GLOVES', 'BOOTS']);
export const CLASS_NAME: Record<HeroClass, string> = { KNIGHT: 'Knight', BARBARIAN: 'Barbarian', ARCHER: 'Archer', WIZARD: 'Wizard', NECROMANCER: 'Necromancer' };
export const HERO_CLASSES: HeroClass[] = ['KNIGHT', 'BARBARIAN', 'ARCHER', 'WIZARD', 'NECROMANCER'];
export const GROUP_OF: Record<HeroClass, ArmorGroup> = { KNIGHT: 'HEAVY', BARBARIAN: 'HEAVY', ARCHER: 'LIGHT', WIZARD: 'ARCANE', NECROMANCER: 'LIGHT' };
export const GROUP_HEROES: Record<ArmorGroup, HeroClass[]> = { HEAVY: ['KNIGHT', 'BARBARIAN'], LIGHT: ['ARCHER', 'NECROMANCER'], ARCANE: ['WIZARD'] };
export const GROUP_NAME: Record<ArmorGroup, string> = { HEAVY: 'Heavy armor', LIGHT: 'Light armor', ARCANE: 'Arcane robes' };

/** Weapon: the one class that can wield it (undefined = anyone). */
export function itemClass(i: Item): HeroClass | undefined {
  if (i.type !== 'WEAPON') return undefined;
  if (i.classType) return i.classType;
  return i.projectileType ? BY_PROJECTILE[i.projectileType] : undefined;
}
/** Wear: the armour group it belongs to (undefined = universal, e.g. old generic pieces). */
export function armorGroup(i: Item): ArmorGroup | undefined {
  if (!WEAR.has(i.type)) return undefined;
  if (i.armorGroup) return i.armorGroup;
  if (i.classType) return GROUP_OF[i.classType];   // saves from before groups: the piece's style class
  if (i.setName) { const h = SET_BY_NAME[i.setName]?.hero; if (h) return GROUP_OF[h]; }
  return undefined;
}
/** Weapon: every class that can wield it (Wizard and Necromancer weapons fit both). */
export function weaponClasses(i: Item): HeroClass[] {
  const c = itemClass(i); if (!c) return [];
  return c === 'WIZARD' || c === 'NECROMANCER' ? ['WIZARD', 'NECROMANCER'] : [c];
}
/** Is this piece restricted at all? */
export const isRestricted = (i: Item): boolean => !!itemClass(i) || !!armorGroup(i);
/** May `hero` equip this? (universal items: always) */
export function canUseClass(i: Item, hero: HeroClass): boolean {
  const c = weaponClasses(i); if (c.length) return c.includes(hero);
  const g = armorGroup(i); return !g || GROUP_OF[hero] === g;
}
/** Tooltip tag text, e.g. 'Knight only' / 'Heavy armor · Knight, Barbarian' (null = universal). */
export function classTag(i: Item): string | null {
  const c = weaponClasses(i); if (c.length) return c.map((h) => CLASS_NAME[h]).join(', ');
  const g = armorGroup(i); if (!g) return null;
  return GROUP_HEROES[g].length === 1 ? `${GROUP_NAME[g]} · ${CLASS_NAME[GROUP_HEROES[g][0]]} only` : `${GROUP_NAME[g]} · ${GROUP_HEROES[g].map((h) => CLASS_NAME[h]).join(', ')}`;
}
/** Refusal toast: 'Knight only' / 'Heavy armor: Knight, Barbarian only'. */
export function classOnlyMsg(i: Item): string {
  const c = weaponClasses(i); if (c.length) return `${c.map((h) => CLASS_NAME[h]).join(', ')} only`;
  const g = armorGroup(i); return g ? `${GROUP_NAME[g]}: ${GROUP_HEROES[g].map((h) => CLASS_NAME[h]).join(', ')} only` : 'Cannot equip';
}

/** Drops, chests, merchants: ~85% gear the active class can use (plus universal), 15% other classes' gear (shared warehouse / alts). */
export const OTHER_CLASS_SHARE = 0.15;
export function classFilter(hero: HeroClass, other: boolean): (i: Item) => boolean {
  return (i) => !isRestricted(i) || (canUseClass(i, hero) !== other);
}
