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

const SHARD_COST: Record<Rarity, number> = { COMMON: 3, RARE: 4, EPIC: 5, LEGENDARY: 6, MYTHIC: 8 };
const GOLD_COST: Record<Rarity, number> = { COMMON: 1000, RARE: 4000, EPIC: 15000, LEGENDARY: 50000, MYTHIC: 150000 };   // x10 economy

/** Primary loot per slot + counts for EPIC / LEGENDARY / MYTHIC (cheap drops need more of them). */
const SLOT_LOOT: Record<Exclude<CraftSlot, 'weapon'>, { id: string; n: [number, number, number] }> = {
  helmet:    { id: 'bone_crown',     n: [2, 4, 6] },
  armor:     { id: 'ogre_tusk',      n: [8, 14, 20] },
  gloves:    { id: 'volatile_gland', n: [4, 7, 10] },
  boots:     { id: 'bat_wing',       n: [8, 14, 20] },
  accessory: { id: 'echo_crystal',   n: [4, 7, 10] },
};
const WEAPON_LOOT: Record<HeroClass, string> = { ARCHER: 'goblin_totem', WIZARD: 'forbidden_sigil', BARBARIAN: 'war_banner', KNIGHT: 'war_banner', NECROMANCER: 'forbidden_sigil' };
/** MYTHIC recipes also need one boss relic. */
const MYTHIC_RELIC: Record<CraftSlot, string> = {
  weapon: 'golem_heart', armor: 'golem_heart', gloves: 'golem_heart', helmet: 'phylactery', boots: 'phylactery', accessory: 'phylactery',
};

export const SLOT_LABEL: Record<CraftSlot, string> = {
  weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', gloves: 'Gloves', boots: 'Boots', accessory: 'Accessory',
};

/** The recipe table is derived once per (slot, rarity, hero); weapons depend on the hero class. */
export const RECIPES: Record<string, Recipe> = {};
for (const hero of ['ARCHER', 'WIZARD', 'BARBARIAN'] as HeroClass[]) {
  for (const slot of CRAFT_SLOTS) {
    for (let ri = 0; ri < CRAFT_RARITIES.length; ri++) {
      const rarity = CRAFT_RARITIES[ri];
      const loot: LootNeed[] = [];
      if (ri >= 2) {
        if (slot === 'weapon') loot.push({ id: WEAPON_LOOT[hero], count: [2, 4, 6][ri - 2] });
        else loot.push({ id: SLOT_LOOT[slot].id, count: SLOT_LOOT[slot].n[ri - 2] });
        if (rarity === 'MYTHIC') loot.push({ id: MYTHIC_RELIC[slot], count: 1 });
      }
      const key = `${hero}:${slot}:${rarity}`;
      RECIPES[key] = { key, slot, rarity, hero, shards: SHARD_COST[rarity], gold: GOLD_COST[rarity], loot, rankReq: RANK_REQ[rarity] };
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
export function consumeLoot(inv: Item[], recipe: Recipe): Item[] {
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

/** Stat scaling for "+N" items (also used by drops): every stat x new level. */
const GEAR = new Set<string>(['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY']);
export const applyPlus = (item: Item, plus: number): void => {
  if (plus <= 0 || !GEAR.has(item.type)) return; // never level potions / cores / loot
  item.level += plus;
  (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
    const v = item.stats[k];
    if (v === undefined) return;
    item.stats[k] = parseFloat((v * item.level).toFixed(2));
  });
};

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

/** Cores spent upgrading an item from +0 to +plus (level L -> L+1 costs ceil(L/2)). */
export const coresSpent = (item: Item): number => {
  let n = 0;
  for (let l = 1; l < item.level; l++) n += Math.ceil(l / 2);
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
  return slots.size ? `Crafting (Blacksmith): ${[...slots].join(', ')} recipes, Epic and above` : '';
}
