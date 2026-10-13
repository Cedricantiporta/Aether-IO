// ============================================================================
// Item sets: named gear collections with 2 / 4 / 6-piece bonuses.
// Set pieces are templates in ITEMS_POOL (generated in itemCatalog.ts) carrying
// `setName`. Sets are never craftable; they drop from elites / bosses / chests
// (see store.rollItemDrop) and can be summoned.
// ============================================================================
import type { Equipment } from './storeTypes';
import type { HeroClass, Item, Rarity } from './types';
import type { StatFx } from './statFx';
import { accumulate, type FxAcc } from './statFx';

export type SetSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory';
export const SET_SLOTS: SetSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'];

export interface SetBonus { pieces: 2 | 4 | 6; text: string; fx: StatFx }
export interface SetDef {
  id: string;
  name: string;
  rarity: Rarity;
  hero?: HeroClass;                    // class-locked set (weapon only fits that class)
  blurb: string;
  /** Piece names per slot; weapons of class-agnostic sets have one entry per class. */
  names: Record<Exclude<SetSlot, 'weapon'>, string> & { weapon: string | Record<HeroClass, string> };
  flavour: Record<SetSlot, string>;    // stat flavour key per slot (itemCatalog)
  bonuses: SetBonus[];
}

export const SET_COLOR = '#1f7a2e';      // parchment tooltips
export const SET_COLOR_DARK = '#7be08a'; // dark panels

export const SETS: SetDef[] = [
  {
    id: 'gale', name: "Ranger's Gale", rarity: 'EPIC', hero: 'ARCHER', blurb: 'Swift hunters of the open plains.',
    names: { weapon: 'Gale Longbow', helmet: 'Gale Hood', armor: 'Gale Tunic', gloves: 'Gale Bracers', boots: 'Gale Striders', accessory: 'Gale Feather' },
    flavour: { weapon: 'swift', helmet: 'light', armor: 'light', gloves: 'light', boots: 'swift', accessory: 'light' },
    bonuses: [
      { pieces: 2, text: '+10% attack speed, +8% move speed', fx: { mul: { fireRate: 0.1, moveSpeed: 0.08 } } },
      { pieces: 4, text: 'Every 5th attack fires twice', fx: { add: { echoEvery: 5 } } },
      { pieces: 6, text: "Storm of Arrows lasts +4s, +20% crit damage", fx: { add: { hawkBonus: 4, critDamage: 0.2 } } },
    ],
  },
  {
    id: 'regalia', name: "Archmage's Regalia", rarity: 'EPIC', hero: 'WIZARD', blurb: 'Woven from pure mana threads.',
    names: { weapon: "Archmage's Scepter", helmet: "Archmage's Circlet", armor: "Archmage's Robes", gloves: "Archmage's Gloves", boots: "Archmage's Slippers", accessory: "Archmage's Sigil" },
    flavour: { weapon: 'arcane', helmet: 'arcane', armor: 'arcane', gloves: 'arcane', boots: 'arcane', accessory: 'arcane' },
    bonuses: [
      { pieces: 2, text: '+15% skill damage, +60 max mana', fx: { add: { skillDamage: 0.15, maxMana: 60 } } },
      { pieces: 4, text: 'Chain lightning +2 targets, procs need 1 fewer cast', fx: { add: { thunderChain: 2, procHaste: 1 } } },
      { pieces: 6, text: 'Spells cost 25% less mana, Storm summons a twin typhoon, +8% cooldown reduction', fx: { add: { manaCostCut: 0.25, stormTwin: 1, cooldownReduction: 0.08 } } },
    ],
  },
  {
    id: 'bulwark', name: "Warlord's Bulwark", rarity: 'EPIC', hero: 'BARBARIAN', blurb: 'Forged in a hundred sieges.',
    names: { weapon: "Warlord's Greataxe", helmet: "Warlord's Helm", armor: "Warlord's Plate", gloves: "Warlord's Gauntlets", boots: "Warlord's Greaves", accessory: "Warlord's Banner" },
    flavour: { weapon: 'bulwark', helmet: 'heavy', armor: 'heavy', gloves: 'heavy', boots: 'vital', accessory: 'heavy' },
    bonuses: [
      { pieces: 2, text: '+20 defense, +10% max health', fx: { add: { defense: 20 }, mul: { maxHealth: 0.1 } } },
      { pieces: 4, text: '+20 thorns, Mega Stamp radius +4', fx: { add: { thorns: 20, stompRadius: 4 } } },
      { pieces: 6, text: 'Take 12% less damage, Rage lasts +2s, +10% damage', fx: { add: { dmgReduce: 0.12, rageBonus: 2 }, mul: { damage: 0.1 } } },
    ],
  },
  {
    id: 'shadowstep', name: 'Shadowstep', rarity: 'RARE', blurb: 'Light leathers for those who are never where you aimed.',
    names: { weapon: { ARCHER: 'Shadowstep Bow', WIZARD: 'Shadowstep Wand', BARBARIAN: 'Shadowstep Hatchet' }, helmet: 'Shadowstep Cowl', armor: 'Shadowstep Leathers', gloves: 'Shadowstep Wraps', boots: 'Shadowstep Treads', accessory: 'Shadowstep Locket' },
    flavour: { weapon: 'swift', helmet: 'light', armor: 'light', gloves: 'light', boots: 'swift', accessory: 'light' },
    bonuses: [
      { pieces: 2, text: '+8% move speed, +5% dodge', fx: { mul: { moveSpeed: 0.08 }, add: { dodge: 0.05 } } },
      { pieces: 4, text: '+1 dash charge, +5% cooldown reduction', fx: { add: { dashCharges: 1, cooldownReduction: 0.05 } } },
      { pieces: 6, text: '+10% crit rate, +8% dodge, +10% attack speed', fx: { add: { critRate: 0.1, dodge: 0.08 }, mul: { fireRate: 0.1 } } },
    ],
  },
  {
    id: 'dragonbone', name: 'Dragonbone', rarity: 'LEGENDARY', blurb: 'Carved from the ribs of an ancient wyrm.',
    names: { weapon: { ARCHER: 'Dragonbone Longbow', WIZARD: 'Dragonbone Staff', BARBARIAN: 'Dragonbone Cleaver' }, helmet: 'Dragonbone Visage', armor: 'Dragonbone Hauberk', gloves: 'Dragonbone Claws', boots: 'Dragonbone Sabatons', accessory: 'Dragonbone Fang' },
    flavour: { weapon: 'fury', helmet: 'heavy', armor: 'heavy', gloves: 'medium', boots: 'vital', accessory: 'medium' },
    bonuses: [
      { pieces: 2, text: '+15% max health', fx: { mul: { maxHealth: 0.15 } } },
      { pieces: 4, text: '25% chance to ignite on hit, +20 thorns', fx: { add: { onHitBurnChance: 0.25, thorns: 20 } } },
      { pieces: 6, text: '+4% life steal, +20% damage', fx: { add: { lifeSteal: 0.04 }, mul: { damage: 0.2 } } },
    ],
  },
  {
    id: 'sovereign', name: 'Aether Sovereign', rarity: 'MYTHIC', blurb: 'Regalia of a king who ruled between the stars.',
    names: { weapon: { ARCHER: "Sovereign's Arc", WIZARD: "Sovereign's Scepter", BARBARIAN: "Sovereign's Crusher" }, helmet: 'Sovereign Diadem', armor: 'Sovereign Mantle', gloves: 'Sovereign Grasp', boots: 'Sovereign Treads', accessory: 'Sovereign Orb' },
    flavour: { weapon: 'fury', helmet: 'arcane', armor: 'medium', gloves: 'light', boots: 'swift', accessory: 'arcane' },
    bonuses: [
      { pieces: 2, text: '+10% damage, +20% skill damage', fx: { mul: { damage: 0.1 }, add: { skillDamage: 0.2 } } },
      { pieces: 4, text: '+1 projectile, +1 pierce', fx: { add: { multishot: 1, pierceBonus: 1 } } },
      { pieces: 6, text: 'Every 4th attack fires twice, +12% cooldown reduction, +25% XP and gold', fx: { add: { cooldownReduction: 0.12, echoEvery: 4, xpBonus: 0.25, goldFind: 0.25 } } },
    ],
  },
];
export const SET_BY_NAME: Record<string, SetDef> = Object.fromEntries(SETS.map((s) => [s.name, s]));

export const setPieceName = (s: SetDef, slot: SetSlot, hero: HeroClass): string =>
  slot === 'weapon' ? (typeof s.names.weapon === 'string' ? s.names.weapon : s.names.weapon[hero]) : s.names[slot];
export const setPieceId = (s: SetDef, slot: SetSlot, hero?: HeroClass): string => `set_${s.id}_${slot}${hero ? '_' + hero.toLowerCase() : ''}`;

/** Equipped piece count per set name. */
export function equippedSetCounts(equipment: Equipment): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sl of SET_SLOTS) { const it = equipment[sl]; if (it?.setName) out[it.setName] = (out[it.setName] || 0) + 1; }
  return out;
}

/** Adds every active set bonus into `acc`. */
export function accumulateSets(acc: FxAcc, equipment: Equipment): void {
  const counts = equippedSetCounts(equipment);
  for (const name of Object.keys(counts)) {
    const def = SET_BY_NAME[name];
    if (!def) continue;
    for (const b of def.bonuses) if (counts[name] >= b.pieces) accumulate(acc, b.fx);
  }
}

export interface ActiveSet { def: SetDef; count: number; active: SetBonus[] }
/** Sets with at least one equipped piece, with their active bonuses. */
export function activeSets(equipment: Equipment): ActiveSet[] {
  const counts = equippedSetCounts(equipment);
  return Object.keys(counts).map((n) => SET_BY_NAME[n]).filter(Boolean)
    .map((def) => ({ def, count: counts[def.name], active: def.bonuses.filter((b) => counts[def.name] >= b.pieces) }));
}

/** For a tooltip: per slot, is the set piece equipped / in the bag / missing. */
export function setProgress(def: SetDef, hero: HeroClass, equipment: Equipment, inventory: Item[]): { slot: SetSlot; name: string; state: 'equipped' | 'owned' | 'missing' }[] {
  return SET_SLOTS.map((slot) => {
    const name = setPieceName(def, slot, hero);
    const anyWeapon = slot === 'weapon' && typeof def.names.weapon !== 'string' ? Object.values(def.names.weapon) : [name];
    const eq = equipment[slot];
    if (eq && eq.setName === def.name) return { slot, name: eq.name, state: 'equipped' as const };
    const own = inventory.find((i) => i.setName === def.name && (slot === 'weapon' ? i.type === 'WEAPON' : i.type === slot.toUpperCase()) && anyWeapon.includes(i.name));
    return own ? { slot, name: own.name, state: 'owned' as const } : { slot, name, state: 'missing' as const };
  });
}
