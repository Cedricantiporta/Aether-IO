// ============================================================================
// Recipe-based crafting + recycling math. Pure (no store / React imports) so the
// store, the Blacksmith UI and tests can share it.
// ============================================================================
import type { HeroClass, Item, PlayerStats, Rarity } from './types';
import { ITEMS_POOL, RANK_REQ, MATERIAL_DOWNGRADE_YIELD } from './constants';
import { LOOT_BY_ID } from './loot';
import { rollAffixes } from './affixes';

export type CraftSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory';
export const CRAFT_SLOTS: CraftSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'];
export const CRAFT_RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

export const CRAFT_VARIANCE = 0.15;      // +-15% per stat
export const CRAFT_PLUS1_CHANCE = 0.15;  // 15% -> +1
export const CRAFT_PLUS2_CHANCE = 0.03;  // 3%  -> +2
/** Chance a craft succeeds (a failure spends the gold and shards; monster loot is kept). A success that rolls +1/+2 is a
 *  Great Success. */
export const CRAFT_SUCCESS: Record<Rarity, number> = { COMMON: 1, RARE: 0.95, EPIC: 0.85, LEGENDARY: 0.75, MYTHIC: 0.65 };
export type CraftOutcome = 'GREAT' | 'SUCCESS' | 'FAIL';

export interface LootNeed { id: string; count: number }
export interface Recipe {
  key: string;
  slot: CraftSlot;
  rarity: Rarity;
  hero: HeroClass;
  shards: number;     // shards of `rarity`
  gold: number;
  loot: LootNeed[];   // specific monster loot (EPIC and above)
  rankReq: number;
}

const SHARD_COST: Record<Rarity, number> = { COMMON: 3, RARE: 5, EPIC: 7, LEGENDARY: 10, MYTHIC: 15 };
const GOLD_COST: Record<Rarity, number> = { COMMON: 2000, RARE: 10000, EPIC: 40000, LEGENDARY: 150000, MYTHIC: 600000 };   // x10 economy

/** Monster loot family per slot: [common, rare, epic] drops (weapons: by class). */
const SLOT_FAMILY: Record<Exclude<CraftSlot, 'weapon'>, [string, string, string]> = {
  helmet:    ['old_bone', 'cursed_skull', 'bone_crown'],
  armor:     ['ogre_tusk', 'brute_knuckle', 'war_banner'],
  gloves:    ['beetle_shell', 'volatile_gland', 'marsh_scale'],
  boots:     ['bat_wing', 'echo_crystal', 'frost_scale'],
  accessory: ['slime_gel', 'shimmer_core', 'jelly_heart'],
};
const GOBLIN: [string, string, string] = ['goblin_ear', 'goblin_fang', 'goblin_totem'];
const CULT: [string, string, string] = ['cultist_rune', 'dark_page', 'forbidden_sigil'];
const BRUTE: [string, string, string] = ['ogre_tusk', 'brute_knuckle', 'war_banner'];
const WEAPON_FAMILY: Record<HeroClass, [string, string, string]> = { ARCHER: GOBLIN, WIZARD: CULT, NECROMANCER: CULT, BARBARIAN: BRUTE, KNIGHT: BRUTE };
/** Legendary boss relic per slot (Legendary recipes), all from the late biomes (owner: Gorath's Heartstone etc. are
 *  farmable in biome 1, so top-tier gear must not hang on them): Hydra (Coral Isles), Glacius (Frostpeak), Ignar (Ember
 *  Wastes). Weapons need two different ones. */
const SLOT_RELIC: Record<CraftSlot, string[]> = {
  weapon: ['ignar_brand', 'glacius_heart'], helmet: ['hydra_fang'], armor: ['glacius_heart'], gloves: ['ignar_brand'],
  boots: ['glacius_heart'], accessory: ['hydra_fang'],
};
/** Mythic recipes: only the last biome (the Void Herald's shards + his very rare Void Heart) and, for weapons, Malakar's
 *  Soul Ember on top. */
export const VOID_HEART = 'void_heart';
/** The last-boss drop every Mythic weapon needs (dropped only when Malakar falls for good, ~5%: director.ts). */
export const SOUL_EMBER = 'soul_ember';

/** Material list for one recipe (owner: crafting must be extensive, the top tiers built from very rare boss + deep-mine
 *  materials, Mythic weapons above all). Weapons need 1.5x the counts of armour pieces. */
function recipeLoot(slot: CraftSlot, rarity: Rarity, hero: HeroClass): LootNeed[] {
  const fam = slot === 'weapon' ? WEAPON_FAMILY[hero] : SLOT_FAMILY[slot];
  const w = slot === 'weapon' ? 1.5 : 1;
  const n = (x: number) => Math.ceil(x * w);
  const out: LootNeed[] = [];
  const add = (id: string, count: number) => { const e = out.find((l) => l.id === id); if (e) e.count += count; else out.push({ id, count }); };
  switch (rarity) {
    case 'COMMON': add(fam[0], n(5)); add('ore_nugget', n(2)); break;
    case 'RARE': add(fam[0], n(10)); add(fam[1], n(4)); add('ore_nugget', n(4)); break;
    case 'EPIC': add(fam[1], n(10)); add(fam[2], n(4)); add('elite_trophy', n(3)); add('raw_gem', n(3)); break;
    case 'LEGENDARY':
      add(fam[2], n(10)); add('champion_medal', n(4)); add(slot === 'weapon' ? 'mithril_ore' : 'deep_geode', n(4));
      add(slot === 'weapon' ? 'adamant_ore' : 'starfire_crystal', 2);
      for (const r of SLOT_RELIC[slot]) add(r, 1);
      break;
    case 'MYTHIC':
      add(fam[2], n(20)); add('champion_medal', n(10)); add('adamant_ore', n(5)); add('starfire_crystal', n(5));
      add('void_shard', n(3)); add('ignar_brand', 2); add('abyssal_diamond', slot === 'weapon' ? 3 : 2);
      add(VOID_HEART, slot === 'weapon' ? 2 : 1);
      if (slot === 'weapon') add(SOUL_EMBER, 1);
      break;
  }
  return out;
}

export const SLOT_LABEL: Record<CraftSlot, string> = {
  weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', gloves: 'Gloves', boots: 'Boots', accessory: 'Accessory',
};

/** The recipe table is derived once per (slot, rarity, hero); weapons depend on the hero class. */
export const RECIPES: Record<string, Recipe> = {};
for (const hero of ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'] as HeroClass[]) {   // (every class: a missing class crashed the Workshop - the 'pitch black craft' bug)
  for (const slot of CRAFT_SLOTS) {
    for (let ri = 0; ri < CRAFT_RARITIES.length; ri++) {
      const rarity = CRAFT_RARITIES[ri];
      const loot = recipeLoot(slot, rarity, hero);
      const key = `${hero}:${slot}:${rarity}`;
      RECIPES[key] = { key, slot, rarity, hero, shards: SHARD_COST[rarity], gold: GOLD_COST[rarity] * (slot === 'weapon' ? 1.5 : 1), loot, rankReq: RANK_REQ[rarity] };
    }
  }
}

export const getRecipe = (slot: CraftSlot, rarity: Rarity, hero: HeroClass): Recipe => RECIPES[`${hero}:${slot}:${rarity}`];

export interface CraftState {
  gold: number; heroRank: number;
  materials: Record<Rarity, number>;
  inventory: Item[];
  maxInventorySlots?: number;
}
export interface Missing { kind: 'rank' | 'shards' | 'gold' | 'loot' | 'space'; label: string; have: number; need: number }

export const lootOwned = (inv: Item[], id: string): number => {
  const name = LOOT_BY_ID[id]?.name;
  let n = 0;
  for (const i of inv) if (i.type === 'LOOT' && i.name === name) n += i.quantity || 1;
  return n;
};

/** Everything that blocks crafting right now (empty list = can craft). */
export function canCraft(state: CraftState, recipe: Recipe): Missing[] {
  const m: Missing[] = [];
  if (state.heroRank < recipe.rankReq) m.push({ kind: 'rank', label: `Lv ${recipe.rankReq}`, have: state.heroRank, need: recipe.rankReq });
  if (state.materials[recipe.rarity] < recipe.shards) m.push({ kind: 'shards', label: `${recipe.rarity} Shards`, have: state.materials[recipe.rarity], need: recipe.shards });
  if (state.gold < recipe.gold) m.push({ kind: 'gold', label: 'Gold', have: state.gold, need: recipe.gold });
  for (const l of recipe.loot) {
    const have = lootOwned(state.inventory, l.id);
    if (have < l.count) m.push({ kind: 'loot', label: LOOT_BY_ID[l.id].name, have, need: l.count });
  }
  if (state.maxInventorySlots !== undefined && m.length === 0) {
    // loot stacks that will be emptied free their slots; approximate with "net zero or better" check
    const freed = freedSlots(state.inventory, recipe);
    if (state.inventory.length - freed >= state.maxInventorySlots) m.push({ kind: 'space', label: 'Inventory space', have: 0, need: 1 });
  }
  return m;
}

function freedSlots(inv: Item[], recipe: Recipe): number {
  let freed = 0;
  for (const l of recipe.loot) {
    let left = l.count;
    for (const i of inv) {
      if (left <= 0) break;
      if (i.type === 'LOOT' && i.name === LOOT_BY_ID[l.id].name) { const q = i.quantity || 1; if (q <= left) freed++; left -= q; }
    }
  }
  return freed;
}

/** Removes the recipe's loot from an inventory (returns a new array). */
export function consumeLoot(inv: Item[], recipe: { loot: LootNeed[] }): Item[] {
  let out = inv.slice();
  for (const l of recipe.loot) {
    let left = l.count;
    const name = LOOT_BY_ID[l.id].name;
    out = out.flatMap((i) => {
      if (left <= 0 || i.type !== 'LOOT' || i.name !== name) return [i];
      const q = i.quantity || 1;
      if (q <= left) { left -= q; return []; }
      const rest = q - left; left = 0;
      return [{ ...i, quantity: rest }];
    });
  }
  return out;
}

/** Templates this recipe can produce (class-matched for weapons). */
export const recipeTemplates = (recipe: Recipe): Item[] =>
  ITEMS_POOL.filter((i) => i.type === recipe.slot.toUpperCase() && i.rarity === recipe.rarity && !i.setName && !i.id.startsWith('start_') && (!i.classType || i.classType === recipe.hero));

/** Stat scaling for "+N" items (also used by drops and the blacksmith): each + adds 25% of the base stats (owner: was
 *  x level - a +3 item had 4x its stats and out-ranked the tiers above it). plusMul(level) = 1 + 0.25 * (level - 1). */
export const plusMul = (level: number): number => 1 + 0.25 * (Math.max(1, level) - 1);
const GEAR = new Set<string>(['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY']);
export const applyPlus = (item: Item, plus: number): void => {
  if (plus <= 0 || !GEAR.has(item.type)) return; // never level potions / cores / loot
  const from = plusMul(item.level);
  item.level += plus;
  const f = plusMul(item.level) / from;
  (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
    const v = item.stats[k];
    if (v === undefined) return;
    item.stats[k] = parseFloat((v * f).toFixed(2));
  });
};

// ------------------------------------------------------------------ upgrade --
/** Blacksmith upgrade odds/costs by the item's level (level 1 == +0). Owner rules: every + tier fails 10% more, higher +
 *  needs many more cores, gold x1.8, and going past +7 can shatter the item on a failure. */
export const upgradeChanceAt = (level: number): number => { const plus = level - 1; return plus <= 0 ? 1 : Math.max(0.05, 0.9 - plus * 0.1); };
export const upgradeCoresAt = (level: number): number => Math.ceil((level * level) / 3);
/** Tiered cores (owner: 2 tiers): Common / Rare gear upgrades with Upgrade Cores, Epic and above with Refined Cores. */
export const CORE_IDS = ['upgrade_core', 'upgrade_core_2'] as const;
export const CORE_NAMES = ['Upgrade Core', 'Refined Core'] as const;
export const CORE_FUSE = 5;
export const upgradeCoreTierFor = (rarity: string): number => (rarity === 'COMMON' || rarity === 'RARE' ? 0 : 1);
/** Tier (0..2) of a bag core by its name, -1 when not a core. */
export const coreTierOf = (item: { type: string; name: string }): number => (item.type === 'CORE' ? (item.name === 'Upgrade Core' ? 0 : 1) : -1)   // (an old 'Radiant Core' counts as a Refined Core);
export const upgradeGoldFor = (price: number, level: number): number => Math.floor(price * level * 0.5 * 1.8);
/** Chance a FAILED upgrade towards +8 or more destroys the item (target +8: 25%, +9: 40%). */
export const upgradeBreakAt = (level: number): number => (level >= 8 ? 0.25 + (level - 8) * 0.15 : 0);

const roundStat = (v: number): number => (Math.abs(v) >= 10 ? Math.round(v) : parseFloat(v.toFixed(2)));

/** Min/max a single stat can roll at +0 (before the +1/+2 bonus). */
export const statRange = (v: number): [number, number] => [roundStat(v * (1 - CRAFT_VARIANCE)), roundStat(v * (1 + CRAFT_VARIANCE))];

let seq = 0;
/** Rolls a crafted item. `rng` is injectable for tests. */
export function craft(recipe: Recipe, rng: () => number = Math.random): Item {
  const pool = recipeTemplates(recipe);
  const tpl = pool[Math.floor(rng() * pool.length)];
  const stats: Partial<PlayerStats> = {};
  (Object.keys(tpl.stats) as (keyof PlayerStats)[]).forEach((k) => {
    const v = tpl.stats[k];
    if (v === undefined) return;
    stats[k] = roundStat(v * (1 - CRAFT_VARIANCE + rng() * 2 * CRAFT_VARIANCE));
  });
  const item: Item = {
    ...tpl, stats, quantity: 1,
    id: `it_craft_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`,
    onHitEffect: tpl.onHitEffect ? { ...tpl.onHitEffect } : undefined,
    affixes: undefined,
  };
  rollAffixes(item, rng);
  const r = rng();
  applyPlus(item, r < CRAFT_PLUS2_CHANCE ? 2 : r < CRAFT_PLUS2_CHANCE + CRAFT_PLUS1_CHANCE ? 1 : 0);
  return item;
}

// ------------------------------------------------------------------ recycle --
export const RECYCLE_BASE: Record<Rarity, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
export const RECYCLE_CORE_REFUND = 0.3;

/** Cores spent upgrading an item from +0 to +plus (level L -> L+1 costs upgradeCoresAt(L)). */
export const coresSpent = (item: Item): number => {
  let n = 0;
  for (let l = 1; l < item.level; l++) n += upgradeCoresAt(l);
  return n;
};
export interface RecycleYield { shards: number; cores: number }
export function recycleYield(item: Item): RecycleYield {
  const plus = Math.max(0, item.level - 1);
  const shards = RECYCLE_BASE[item.rarity] + Math.floor(plus / 3);
  const cores = plus >= 3 ? Math.round(coresSpent(item) * RECYCLE_CORE_REFUND) : 0;
  return { shards, cores };
}
export function recycleYieldAll(items: Item[]): RecycleYield {
  return items.reduce((a, i) => { const y = recycleYield(i); return { shards: a.shards + y.shards, cores: a.cores + y.cores }; }, { shards: 0, cores: 0 });
}

export { MATERIAL_DOWNGRADE_YIELD };

/** Human-readable list of slots whose EPIC+ recipes use this loot id (for Codex / tooltips). */
export function lootCraftUse(id: string): string {
  const slots = new Set<string>();
  for (const r of Object.values(RECIPES)) if (r.loot.some((l) => l.id === id)) slots.add(r.slot === 'weapon' ? 'Weapon' : SLOT_LABEL[r.slot]);
  return slots.size ? `Crafting (Blacksmith): ${[...slots].join(', ')} recipes` : '';
}
