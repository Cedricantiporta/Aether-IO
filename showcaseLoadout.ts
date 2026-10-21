// Showcase fight power-up (engine/showcase.ts): the overlay the store lays over the hero for the one-off arena battle.
// Pure builder (no store import: the store passes its own helpers in), nothing here touches the save.
import type { HeroClass, Item } from './types';
import type { Equipment } from './storeTypes';
import type { ClassProg } from './classLevels';
import { ITEMS_POOL, PETS_POOL, SKILLS_INFO } from './constants';
import { SETS, setPieceId, SET_SLOTS } from './itemSets';
import { AFFIX_BY_KEY, PERFECT_MUL, R_IDX } from './affixes';
import { TALENTS, type TalentRanks } from './talents';
import { ATTR_KEYS, attrPointsTotal, autoAllocate, emptyAttrs, type Attrs } from './attributes';
import { activeDefs, dashKey } from './abilityDefs';
import { PET_MAX_LV } from './petGrowth';

import { SHOWCASE_LEVEL, SHOWCASE_PLUS } from './engine/showcase';
const MAX_PLUS_LEVEL = SHOWCASE_PLUS + 1;   // item.level n = +(n-1)

/** Mythic "Aether Sovereign" piece of `slot` for `hero` (class-agnostic set: wear + weapon per class, accessory universal), +9 with perfect bonus lines. */
function sovereign(slot: (typeof SET_SLOTS)[number], hero: HeroClass, instantiate: (t: Item) => Item, plusOne: (i: Item) => Item): Item | null {
  const set = SETS.find((s) => s.id === 'sovereign'); if (!set) return null;
  const id = setPieceId(set, slot, slot === 'accessory' ? undefined : hero);
  const tpl = ITEMS_POOL.find((i) => i.id === id); if (!tpl) return null;
  let it = instantiate(tpl);
  if (it.affixes) it.affixes = it.affixes.map((a) => { const d = AFFIX_BY_KEY[a.key]; return d && !d.fixed ? { key: a.key, value: parseFloat((d.tiers[R_IDX.MYTHIC] * PERFECT_MUL).toFixed(3)), perfect: true } : a; });
  while (it.level < MAX_PLUS_LEVEL) it = plusOne(it);
  return it;
}

export interface ShowcaseOverlay { equipment: Equipment; classProg: ClassProg; talents: TalentRanks; attrs: Attrs }
export function buildShowcaseOverlay(hero: HeroClass, cur: ClassProg, instantiate: (t: Item) => Item, plusOne: (i: Item) => Item, uid: (p: string) => string): ShowcaseOverlay {
  const equipment: Equipment = { weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null, pet: null, tool: null };
  for (const slot of SET_SLOTS) equipment[slot] = sovereign(slot, hero, instantiate, plusOne);
  const petTpl = [...ITEMS_POOL, ...PETS_POOL].find((i) => i.id === 'pet_leviathan');   // the Mythic pet
  if (petTpl) equipment.pet = { ...petTpl, id: uid('showcase_pet'), stats: { ...petTpl.stats }, petLv: PET_MAX_LV, petXp: 0, petStage: 3, quantity: 1 };
  // every skill (actives, dash, ultimate, class passives) at the max level 5
  const skills = { ...cur.skills } as unknown as Record<string, number>;
  const keys: string[] = [...activeDefs(hero).map((a) => a.slot), dashKey(hero), 'ult'];
  for (const [k, i] of Object.entries(SKILLS_INFO) as [string, { type?: string; classType?: string }][]) if (i.type === 'PASSIVE' && k !== 'dash' && (!i.classType || i.classType === hero)) keys.push(k);
  for (const k of keys) if (k in skills) skills[k] = 5;
  const talents: TalentRanks = {};   // (owner) not everything at once: no talents in the showcase
  void TALENTS;
  const attrs = autoAllocate(hero, emptyAttrs(), attrPointsTotal(SHOWCASE_LEVEL));
  void ATTR_KEYS;
  return { equipment, classProg: { lv: SHOWCASE_LEVEL, xp: 0, sp: 0, skills: skills as unknown as ClassProg['skills'] }, talents, attrs };
}
