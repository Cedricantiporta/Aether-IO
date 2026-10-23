// ============================================================================
// Mining Supplies (the stall in the mining camp at the Crystal Cave, shop tab 'MINE', ui/panels/shop/MineShop.tsx):
//  * spare lantern-oil flasks the hero carries into the cave: one pours itself into the lantern the moment it runs dry
//    below Floor 1 (engine/systems/cave.ts), so a trip lasts SPARE_FLASK_OIL s longer instead of caving in;
//  * the camp buys ore / crystals / cave gems at a premium (MINE_PREMIUM), keeping what active quests still need.
// The carried flasks are a small localStorage save (like the fishing rod / cave saves), so the store contract stays as is.
// ============================================================================
import { useGameStore } from '../../store';
import { caveGoldPrice, RARITY_LABEL_COLOR, sellUnit } from '../../constants';
import { LOOT_BY_ID } from '../../loot';
import { STORY } from '../../story';
import { NPC_QUESTS } from '../../npcQuests';
import { events } from '../events';
import type { Item } from '../../types';
import { liveStep } from '../../questUnlocks';

const KEY = 'aether-survivor-cave-kit-v1';
/** Seconds of light one spare flask pours into the lantern. */
export const SPARE_FLASK_OIL = 30;
/** Most flasks the hero can carry (buying stops there; quest rewards may top it up to MAX_SPARE + 3). */
export const MAX_SPARE = 6;
/** Gold prices at Lv 27 (the level the cave opens), +4% per hero level above it (`caveGoldPrice`). */
export const FLASK_BASE = 6000, KIT_BASE = 15000;
export const flaskPrice = (level: number): number => caveGoldPrice(FLASK_BASE, level);
/** Miner's Kit: KIT_FLASKS flasks for less. */
export const KIT_FLASKS = 3;
export const kitPrice = (level: number): number => caveGoldPrice(KIT_BASE, level);
/** The camp pays this much more than the usual sell price for ore and crystals. */
export const MINE_PREMIUM = 1.1;
/** Loot the camp buys (harvest ore / gems + the cave's deep trade goods). */
export const MINE_GOODS = ['ore_nugget', 'raw_gem', 'echo_crystal', 'deep_geode', 'mithril_ore', 'starfire_crystal', 'adamant_ore', 'abyssal_diamond'];
const GOOD_NAMES = new Set(MINE_GOODS.map((id) => LOOT_BY_ID[id]?.name).filter(Boolean));
export const isMineGood = (it: Item): boolean => it.type === 'LOOT' && GOOD_NAMES.has(it.name);

let flasks = -1;
const subs = new Set<() => void>();
export function onKitChange(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
function load(): number {
  if (flasks >= 0) return flasks;
  flasks = 0;
  try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (r) flasks = Math.max(0, Math.min(MAX_SPARE + 3, Math.floor(Number(JSON.parse(r).flasks) || 0))); } catch { /* ignore */ }
  return flasks;
}
function set(n: number): void {
  flasks = n;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify({ flasks })); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export const spareFlasks = (): number => load();
/** Quest rewards / gifts (capped at MAX_SPARE + 3). Returns how many were actually added. */
export function addSpareFlasks(n: number): number { const cur = load(), next = Math.min(MAX_SPARE + 3, cur + Math.max(0, n)); set(next); return next - cur; }
/** Takes one flask (the cave pours it into the lantern). */
export function takeSpareFlask(): boolean { const cur = load(); if (cur <= 0) return false; set(cur - 1); return true; }

/** Buys `n` flasks for `price` gold (single flask or the Miner's Kit). */
export function buyFlasks(n: number, price: number): boolean {
  const st = useGameStore.getState(), cur = load();
  if (cur >= MAX_SPARE) { st.addNotification(`You can carry at most ${MAX_SPARE} spare flasks.`, '#ffd08a', 'SYSTEM'); return false; }
  if (st.gold < price) { st.addNotification('Not enough gold.', '#ff8a7a', 'WARNING'); return false; }
  useGameStore.setState({ gold: st.gold - price }); events.emit('purchase', {}); 
  const got = Math.min(n, MAX_SPARE - cur);
  set(cur + got);
  st.addNotification(`+${got} lantern oil flask${got === 1 ? '' : 's'} (${cur + got} carried).`, '#ffd070', 'ITEM');
  events.emit('hub', { kind: 'buy_flask', n: got });
  return true;
}

/** How many of a loot item active quests still want delivered (main story step + accepted NPC DELIVER quests). */
function reserved(id: string): number {
  const st = useGameStore.getState();
  let n = 0;
  const step = liveStep(st);
  if (step?.deliver?.id === id) n = Math.max(n, step.deliver.count);
  for (const d of NPC_QUESTS) if (d.objective.type === 'DELIVER' && String(d.objective.target) === id && st.npcQuests.q[d.id]?.s === 1) n = Math.max(n, d.objective.count);
  return n;
}
export const minePrice = (it: Item): number => Math.round(sellUnit(it) * MINE_PREMIUM);
/** Sells `items` (stacks from the bag; all = every ore / crystal stack), keeping what active quests still need. */
export function sellMineGoods(only?: Item): number {
  const st = useGameStore.getState();
  const keep = new Map<string, number>();
  for (const id of MINE_GOODS) { const r = reserved(id); if (r > 0) keep.set(LOOT_BY_ID[id].name, r); }
  let total = 0, count = 0, kept = 0;
  const inv: Item[] = [];
  for (const it of st.inventory) {
    if (!isMineGood(it) || (only && it.id !== only.id)) { inv.push(it); continue; }
    const q = it.quantity || 1, k = Math.min(q, keep.get(it.name) ?? 0);
    if (k > 0) { keep.set(it.name, (keep.get(it.name) ?? 0) - k); kept += k; inv.push({ ...it, quantity: k }); }
    const sold = q - k;
    if (sold > 0) { total += minePrice(it) * sold; count += sold; }
  }
  if (count === 0) { st.addNotification(kept ? 'Those are promised to a quest. The camp keeps its hands off.' : 'No ore or crystals to sell.', '#ffffff', 'SYSTEM'); return 0; }
  useGameStore.setState({ gold: st.gold + total, inventory: inv });
  st.addNotification(`Sold ${count} ore & crystal${count === 1 ? '' : 's'} for ${total.toLocaleString()}G${kept ? ` (kept ${kept} for your quests)` : ''}`, RARITY_LABEL_COLOR.LEGENDARY, 'SYSTEM');
  return total;
}
