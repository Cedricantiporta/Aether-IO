// ============================================================================
// Pet growth actions on the EQUIPPED pet: add XP (levels + toast), feed (loot / shards), evolve.
// Writes through store.patchEquippedPet so stats / CP are recalculated and the profile autosaves.
// Never called per frame: engine XP is buffered in world.pet.xpBuf and committed on discrete moments.
// ============================================================================
import { useGameStore } from './store';
import { world } from './engine/world';
import {
  petApplyXp, petLv, petStage, petXp, petXpNeed, petLvCap, petDisplayName, petCanEvolve, PET_EVOLVE_COST,
  PET_SHARD_XP, petEats, PET_LOOT_XP, PET_FOOD_GLYPHS, PET_STAGE_PREFIX,
} from './petGrowth';
import { LOOT_BY_NAME } from './loot';
import type { Item, Rarity } from './types';

const GOLD = '#ffd23a';

/** Add XP to the equipped pet; toasts each level reached. Returns the XP actually absorbed. */
export function addPetXp(amount: number): number {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  if (!pet || amount <= 0) return 0;
  const r = petApplyXp(pet, amount);
  if (r.used <= 0 && r.gained === 0 && r.petXp === petXp(pet)) return 0;
  st.patchEquippedPet({ petLv: r.petLv, petXp: r.petXp });
  if (r.gained > 0) {
    const name = petDisplayName(pet);
    st.addNotification(`Your ${name} reached Lv ${r.petLv}!${r.petLv >= petLvCap(petStage(pet)) && petStage(pet) < 3 ? ' It can evolve!' : ''}`, GOLD, 'SYSTEM');
  }
  return r.used;
}

/** Commit the engine's buffered kill XP to the pet item (discrete moments only). */
export function flushPetXp(): void {
  const wp = world.pet;
  if (wp.xpBuf <= 0) return;
  const amt = wp.xpBuf;
  wp.xpBuf = 0;
  addPetXp(amt);
}

/** Buffer kill XP; commit early only when it would level the pet up. */
export function bufferPetXp(amount: number): void {
  const pet = useGameStore.getState().equipment.pet;
  if (!pet) return;
  const lv = petLv(pet);
  if (lv >= petLvCap(petStage(pet))) { world.pet.xpBuf = 0; return; }
  world.pet.xpBuf += amount;
  if (petXp(pet) + world.pet.xpBuf >= petXpNeed(lv)) flushPetXp();
}

/** XP left until the stage level cap (what feeding can still use). */
export function petXpToCap(pet: Item): number {
  const cap = petLvCap(petStage(pet));
  let lv = petLv(pet), need = -petXp(pet);
  while (lv < cap) { need += petXpNeed(lv); lv++; }
  return Math.max(0, need);
}

/** Is this inventory item pet food (crystal / ore loot)? */
export const lootFoodXp = (i: Item): number => {
  if (i.type !== 'LOOT') return 0;
  const g = LOOT_BY_NAME[i.name]?.glyph;
  return g && PET_FOOD_GLYPHS.includes(g) ? PET_LOOT_XP[i.rarity] : 0;
};

/** Feed up to `n` units of a loot stack (by inventory item id). Returns units eaten. */
export function feedLoot(itemId: string, n: number): number {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  const idx = st.inventory.findIndex((i) => i.id === itemId);
  if (!pet || idx < 0) return 0;
  const it = st.inventory[idx], xp = lootFoodXp(it);
  if (xp <= 0 || !petEats(pet, it.rarity)) return 0;   // (owner) tiered feeding
  const units = Math.min(n, it.quantity ?? 1, Math.ceil(petXpToCap(pet) / xp));
  if (units <= 0) return 0;
  const inv = st.inventory.slice();
  const left = (it.quantity ?? 1) - units;
  if (left > 0) inv[idx] = { ...it, quantity: left }; else inv.splice(idx, 1);
  st.patchEquippedPet({}, { inventory: inv });
  addPetXp(units * xp);
  return units;
}

/** Feed up to `n` shards of a rarity. Returns shards eaten. */
export function feedShards(rarity: Rarity, n: number): number {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  if (!pet) return 0;
  if (!petEats(pet, rarity)) return 0;   // (owner) tiered feeding: a pet eats shards of its own rarity
  const xp = PET_SHARD_XP[rarity];
  const units = Math.min(n, st.materials[rarity] ?? 0, Math.ceil(petXpToCap(pet) / xp));
  if (units <= 0) return 0;
  st.patchEquippedPet({}, { materials: { [rarity]: units } });
  addPetXp(units * xp);
  return units;
}

export function canAffordEvolve(pet: Item, gold: number, materials: Record<Rarity, number>): boolean {
  const c = PET_EVOLVE_COST[petStage(pet)];
  if (!c || !petCanEvolve(pet) || gold < c.gold) return false;
  return (Object.keys(c.shards) as Rarity[]).every((k) => materials[k] >= (c.shards[k] ?? 0));
}

/** Evolve the equipped pet one stage (needs the stage level cap + gold + shards). */
export function evolvePet(): boolean {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  if (!pet || !canAffordEvolve(pet, st.gold, st.materials)) return false;
  const c = PET_EVOLVE_COST[petStage(pet)];
  const next = petStage(pet) + 1;
  st.patchEquippedPet({ petStage: next, petXp: 0 }, { gold: c.gold, materials: c.shards });
  st.addNotification(`${pet.name} evolved into ${PET_STAGE_PREFIX[next - 1]}${pet.name}!`, '#c58bff', 'BOSS');
  return true;
}
