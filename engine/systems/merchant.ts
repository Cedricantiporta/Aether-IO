import { world } from '../world';
import { events } from '../events';
// ============================================================================
// Travelling merchant (depth 14 of every biome): 1-2 kinds of potion + three random gear pieces, always +2 or better, at a markup (gear: town price +50%),
// rarely an Ankh of Life or a Legendary shard at an inflated price; no sales.
// Stock is rolled when the room is entered and lives in a tiny zustand store so the shop tab can re-render.
// ============================================================================
import { create } from 'zustand';
import type { Item, ItemGrade, Rarity } from '../../types';
import { useGameStore, plusOne, makeItemById, potionKind, potionCount, potionCapMsg, POTION_CAP, SHOP_PRICE_OVERRIDE } from '../../store';
import { biomeGoldMul } from '../../biomeLoot';
import { shardItem } from '../../shards';
import { buyMul } from '../../constants';

export interface MerchantEntry { item: Item; price: number; oldPrice: number; left: number; sale: boolean }

export const useMerchant = create<{ items: MerchantEntry[] }>(() => ({ items: [] }));

const MARKUP = 1.5;
const SALE = 0.25;

/** Rolls a fresh stock for a merchant room at `depth`. */
/** `seed`: the room seed. The stock is rolled from it in three separately seeded parts (potions, gear, the rare extra), so a co-op partner entering the same room
 *  (same seed) sees the SAME stock: the same potions, the same number of gear pieces at the same rarity / +level / price, the same tool / Ankh / shard (gear is rolled for each player's own class).
 *  Each player buys from his own copy with his own gold. */
export function rollMerchantStock(depth: number, seed?: number): void {
  const orig = Math.random;
  const reseed = (n: number): void => {
    if (seed === undefined) return;
    let a = ((seed ^ Math.imul(n, 0x9e3779b1)) >>> 0) || 1;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  try { rollStock(depth, reseed); } finally { Math.random = orig; }
}
type GearTier = 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEG_LOW' | 'LEG_MID' | 'LEG_HIGH';
/** (owner 2026-10-31) Gear rarity weights per biome (0 Greenwood .. 6 Void): later biomes sell better pieces, the top tiers stay rare. */
const GEAR_TIERS: readonly Partial<Record<GearTier, number>>[] = [
  { UNCOMMON: 30, RARE: 70 },                                // Greenwood: up to Rare
  { RARE: 90, EPIC: 10 },                                    // Marble: Rare, a little Epic
  { RARE: 60, EPIC: 40 },                                    // Desert: Epic
  { RARE: 45, EPIC: 55 },                                    // Coral: Epic
  { RARE: 25, EPIC: 63, LEG_LOW: 12 },                       // Frostpeak: Epic + Legendary Low
  { EPIC: 55, LEG_LOW: 30, LEG_MID: 15 },                    // Ember: Legendary Low / Mid
  { EPIC: 55, LEG_LOW: 25, LEG_MID: 18, LEG_HIGH: 2 },       // Void: up to Legendary High
];
/** Extra "rare slot" (Void only, appears 40% of visits): the only reliable way to Legendary High. */
const RARE_SLOT_CHANCE = 0.4;
const RARE_SLOT_TIERS: Partial<Record<GearTier, number>> = { LEG_LOW: 40, LEG_MID: 40, LEG_HIGH: 20 };
/** Gear slots per biome. */
const GEAR_SLOTS = [3, 3, 3, 4, 4, 5, 5];
/** Potions per biome: [small stack, big stack, grand stack] (0 = not offered). Small = potion_hp / potion_mana. */
const POTION_PLAN: readonly (readonly [number, number, number])[] = [
  [5, 1, 0], [4, 2, 0], [3, 3, 0], [2, 4, 0], [0, 4, 1], [0, 4, 2], [0, 5, 4],
];
const tierToRarity = (t: GearTier): Rarity => (t === 'UNCOMMON' ? 'UNCOMMON' : t === 'RARE' ? 'RARE' : t === 'EPIC' ? 'EPIC' : 'LEGENDARY');
const tierGrade = (t: GearTier): ItemGrade | null => (t === 'LEG_LOW' ? 'LOW' : t === 'LEG_MID' ? 'MID' : t === 'LEG_HIGH' ? 'HIGH' : null);
function pickTier(w: Partial<Record<GearTier, number>>): GearTier {
  let tot = 0; for (const k in w) tot += w[k as GearTier] ?? 0;
  let r = Math.random() * tot;
  for (const k in w) { r -= w[k as GearTier] ?? 0; if (r < 0) return k as GearTier; }
  return 'RARE';
}

function rollStock(depth: number, reseed: (n: number) => void): void {
  const st = useGameStore.getState();
  const biome = Math.max(0, Math.min(6, world.room.biome | 0));
  const gm = biomeGoldMul(biome);
  reseed(1);
  const items: MerchantEntry[] = [];
  const add = (item: Item | undefined, left: number, markup = MARKUP): void => {
    if (!item) return;
    const oldPrice = Math.max(10, Math.round(item.price * markup));
    items.push({ item, price: oldPrice, oldPrice, left, sale: false });
  };
  // potions by biome: small -> big (bigger stacks) -> Grand (Epic) from Frostpeak on, several in the Void. Grand costs the potion-shop price (3000) + the markup.
  const [nSmall, nBig, nGrand] = POTION_PLAN[biome];
  const flip = (): 'hp' | 'mana' => (Math.random() < 0.5 ? 'hp' : 'mana');
  const other = (k: 'hp' | 'mana'): 'hp' | 'mana' => (k === 'hp' ? 'mana' : 'hp');
  const kS = flip(), kB = flip(), kG = flip();
  if (nSmall) { add(makeItemById(`potion_${kS}`, 1)[0], nSmall); if (biome <= 1 && Math.random() < 0.5) add(makeItemById(`potion_${other(kS)}`, 1)[0], nSmall); }
  if (nBig) { add(makeItemById(`potion_${kB}_big`, 1)[0], nBig); if (biome >= 3) add(makeItemById(`potion_${other(kB)}_big`, 1)[0], nBig); }
  if (nGrand) {
    const g = makeItemById(`potion_${kG}_grand`, 1)[0];
    if (g) { add({ ...g, price: SHOP_PRICE_OVERRIDE[g.id] ?? g.price }, nGrand); }
    if (biome >= 6) { const g2 = makeItemById(`potion_${other(kG)}_grand`, 1)[0]; if (g2) add({ ...g2, price: SHOP_PRICE_OVERRIDE[g2.id] ?? g2.price }, nGrand - 1); }
  }
  const gearAt = (i: number, tiers: Partial<Record<GearTier, number>>): void => {
    reseed(10 + i);   // (each gear slot has its own stream: a class with a different pool size does not shift the others)
    const tier = pickTier(tiers), grade = tierGrade(tier);
    let gear = st.rollItemDrop(tierToRarity(tier));
    for (let t = 0; t < 14 && gear && grade && gear.grade !== grade; t++) gear = st.rollItemDrop(tierToRarity(tier));   // (re-roll until the wanted Legendary grade; the stream is seeded so both screens agree)
    if (!gear) return;
    // (owner) the merchant's gear is always +2 or better (+2 / +3, rarely +4); priced on the upgraded item, then by the biome gold multiplier
    const plus = Math.random() < 0.1 ? 4 : Math.random() < 0.35 ? 3 : 2;
    while (Math.max(0, gear.level - 1) < plus) gear = plusOne(gear);
    gear = { ...gear, price: Math.round(gear.price * (1 + 0.25 * plus)) };
    add({ ...gear, id: `${gear.id}-m${i}` }, 1, buyMul(gear.type) * MARKUP * gm);
  };
  const nGear = GEAR_SLOTS[biome];
  for (let i = 0; i < nGear; i++) gearAt(i, GEAR_TIERS[biome]);
  if (biome >= 6) { reseed(40); if (Math.random() < RARE_SLOT_CHANCE) gearAt(40, RARE_SLOT_TIERS); }
  // upgrade materials: Upgrade Cores (tier I) early; Refined Cores (tier II, Epic-tier upgrade) from Coral on, always in Ember / Void
  reseed(98);
  add(makeItemById('upgrade_core', 1)[0], 2 + Math.floor(Math.random() * 3), MARKUP * gm);
  if (biome >= 3 && (biome >= 5 || Math.random() < 0.5)) add(makeItemById('upgrade_core_2', 1)[0], biome >= 6 ? 2 : 1, MARKUP * gm);
  // rarely: an Ankh of Life or a Legendary (gold) shard, at an inflated price
  reseed(99);
  const r = Math.random();
  if (r < 0.1) add(makeItemById('revive_ankh', 1)[0], 1, MARKUP * 2.5);
  else if (r < 0.12) add(shardItem('LEGENDARY', 1), 1, MARKUP * 3);   // (owner: gold very rare in shops)
  const tools = ['reforge_stone', 'temper_oil', 'reforge_stone', 'augment_rune', 'binding_seal'];
  reseed(97);
  const nTools = biome >= 4 ? 2 : Math.random() < 0.33 + biome * 0.08 ? 1 : 0;   // reforging tools: more of them later
  for (let i = 0; i < nTools; i++) add(makeItemById(tools[Math.floor(Math.random() * tools.length)], 1)[0], 1, MARKUP * 1.5 * gm);
  // (owner: no 'X% off' sale entry any more)
  void depth;
  useMerchant.setState({ items });
}

export function clearMerchantStock(): void { useMerchant.setState({ items: [] }); }

/** Buys one unit of stock entry `i`. */
export function buyMerchant(i: number): boolean {
  const entries = useMerchant.getState().items;
  const e = entries[i];
  const st = useGameStore.getState();
  if (!e || e.left <= 0) return false;
  if (st.gold < e.price) { st.addNotification('Not enough Gold!', 'red', 'WARNING'); return false; }
  if (e.item.type === 'SHARD') st.addMaterial(e.item.rarity, 1);   // shards live in the material counts (bag stack synced)
  else {
    const pk = potionKind(e.item);
    if (pk && potionCount(st.inventory, pk) >= POTION_CAP) { st.addNotification(potionCapMsg(pk), 'red', 'WARNING'); return false; }
    const copy: Item = { ...e.item, stats: { ...e.item.stats }, id: `${e.item.id}-b${Date.now().toString(36)}`, quantity: 1 };
    if (!st.addItemToInventory(copy)) { st.addNotification('Inventory Full!', 'red', 'WARNING'); return false; }
  }
  st.addGold(-e.price); events.emit('purchase', {}); 
  st.addNotification(`Bought ${e.item.name}`, 'white', 'SYSTEM');
  useMerchant.setState({ items: entries.map((x, k) => (k === i ? { ...x, left: x.left - 1 } : x)) });
  return true;
}
