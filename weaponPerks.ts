// ============================================================================
// Weapon perks: every class weapon above Common carries ONE class-specific perk whose strength follows the rarity
// (Rare I, Epic II, Legendary III, Mythic IV). The perk is derived from the item id (stable, nothing to save or migrate).
// Replaces the old "Multicast" upgrade card: extra projectiles now only come from weapons (bows mostly).
// Pure data + helpers (no store import): projectiles.ts reads it for the basic attack, store.ts for stat perks.
// ============================================================================
import type { HeroClass, Item, Rarity } from './types';

export type PerkKind = 'MULTI' | 'PIERCE' | 'TWIN' | 'GREAT' | 'BLEED' | 'LIFESTEAL' | 'AXES' | 'BIG' | 'ELEMENT' | 'HORDE' | 'MAGES' | 'BOWMEN';
export type PerkElement = 'FIRE' | 'ICE' | 'LIGHTNING';
export interface WeaponPerk { k: PerkKind; lv: number; el: PerkElement }

const BY_CLASS: Record<HeroClass, PerkKind[]> = {
  ARCHER: ['MULTI', 'PIERCE'],              // bow: a forward fan of arrows, or a chance for green piercing arrows
  KNIGHT: ['TWIN', 'GREAT'],                // sword: more slashes, or bigger / harder slashes
  BARBARIAN: ['BLEED', 'LIFESTEAL', 'AXES'],   // axe: bleeding hits, lifesteal, or 2-3 axes at once
  WIZARD: ['BIG', 'ELEMENT'],              // staff: bigger and faster bolts, or elemental bolts (fire / ice / lightning)
  // wand: stronger, longer-lived minions, bigger soul bolts, or bolts that raise skeleton mages / skeleton bowmen
  NECROMANCER: ['HORDE', 'BIG', 'MAGES', 'BOWMEN'],
};
const LV: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
const ELS: PerkElement[] = ['FIRE', 'ICE', 'LIGHTNING'];
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Bow MULTI: arrows per shot by perk level (up to 6, forward fan only). */
export const MULTI_ARROWS = [1, 2, 3, 4, 6];
export const pierceChance = (lv: number): number => [0, 0.2, 0.3, 0.4, 0.55][lv] ?? 0;
export const twinSlashes = (lv: number): number => (lv >= 3 ? 3 : 2);
export const greatMul = (lv: number): { size: number; dmg: number } => ({ size: 1 + 0.15 * lv, dmg: 1 + 0.1 * lv });
export const bleedChance = (lv: number): number => 0.2 + 0.1 * lv;
export const lifeStealOf = (lv: number): number => 0.02 * lv;
export const axeCount = (lv: number): number => (lv >= 3 ? 3 : 2);
export const bigMul = (lv: number): { size: number; speed: number } => ({ size: 1 + 0.2 * lv, speed: 1 + 0.12 * lv });
export const hordeMul = (lv: number): number => 1 + 0.2 * lv;   // minion damage + HP
/** Wand MAGES / BOWMEN: every Nth soul bolt raises a ranged skeleton, up to a cap alive (by perk level). */
export const raiseEvery = (lv: number): number => [0, 12, 10, 9, 8][lv] ?? 12;   // (+30% over 9/8/7/6)
export const raiseCap = (k: PerkKind, lv: number): number => (k === 'MAGES' ? (lv >= 3 ? 2 : 1) : lv >= 4 ? 3 : lv >= 2 ? 2 : 1);
export const elementChance = (lv: number): number => 0.15 + 0.1 * lv;

/** The perk of a weapon (null: not a class weapon, or Common). */
export function weaponPerk(it: Item | null | undefined): WeaponPerk | null {
  if (!it || it.type !== 'WEAPON' || !it.classType) return null;
  const lv = LV[it.rarity] ?? 0;
  if (!lv) return null;
  const list = BY_CLASS[it.classType as HeroClass];
  if (!list) return null;
  const h = hash(it.id || it.name);
  return { k: list[h % list.length], lv, el: ELS[(h >>> 8) % ELS.length] };
}

/** Name + one-line description for tooltips. */
export function perkText(p: WeaponPerk): { name: string; desc: string } {
  const r = ROMAN[p.lv], pc = (n: number) => `${Math.round(n * 100)}%`;
  switch (p.k) {
    case 'MULTI': return { name: `Multishot ${r}`, desc: `Fires ${MULTI_ARROWS[p.lv]} arrows in a forward fan.` };
    case 'PIERCE': return { name: `Piercing Arrows ${r}`, desc: `${pc(pierceChance(p.lv))} chance an arrow glows green and pierces one more enemy.` };
    case 'TWIN': return { name: `Twin Slash ${r}`, desc: `Each swing cuts ${twinSlashes(p.lv)} slashes in a spread.` };
    case 'GREAT': { const g = greatMul(p.lv); return { name: `Great Slash ${r}`, desc: `Slashes ${pc(g.size - 1)} bigger, +${pc(g.dmg - 1)} damage.` }; }
    case 'BLEED': return { name: `Bleeding Edge ${r}`, desc: `${pc(bleedChance(p.lv))} chance on hit to make the enemy bleed for 3s.` };
    case 'LIFESTEAL': return { name: `Bloodthirst ${r}`, desc: `+${pc(lifeStealOf(p.lv))} life steal.` };
    case 'AXES': return { name: `Twin Axes ${r}`, desc: `Throws ${axeCount(p.lv)} axes side by side.` };
    case 'BIG': { const b = bigMul(p.lv); return { name: `Arcane Swell ${r}`, desc: `Bolts ${pc(b.size - 1)} bigger and ${pc(b.speed - 1)} faster.` }; }
    case 'HORDE': return { name: `Lord of Bones ${r}`, desc: `Your minions deal +${pc(hordeMul(p.lv) - 1)} damage and have +${pc(hordeMul(p.lv) - 1)} HP.` };
    case 'MAGES': return { name: `Bone Choir ${r}`, desc: `Every ${raiseEvery(p.lv)}th soul bolt raises a skeleton mage (up to ${raiseCap('MAGES', p.lv)}).` };
    case 'BOWMEN': return { name: `Grave Archers ${r}`, desc: `Every ${raiseEvery(p.lv)}th soul bolt raises a skeleton bowman (up to ${raiseCap('BOWMEN', p.lv)}).` };
    case 'ELEMENT': {
      const what = p.el === 'FIRE' ? 'burn' : p.el === 'ICE' ? 'chill and slow' : 'chain lightning to';
      const nm = p.el === 'FIRE' ? 'Flame' : p.el === 'ICE' ? 'Frost' : 'Storm';
      return { name: `${nm} Bolts ${r}`, desc: `${pc(elementChance(p.lv))} chance a bolt will ${what} enemies.` };
    }
  }
}
