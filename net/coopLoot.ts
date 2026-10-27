// Co-op STEP 3: every player gets his OWN loot and his OWN run cards.
//  - HOST -> guest DROP: whenever the host's world drops something (engine/systems/pickups.spawnPickup -> coopRoom.fwdDrop) the guest is sent
//    [kind, x, z, value, item]. He spawns HIS OWN copy at the same spot: gear is re-rolled for HIS class / level (store.rollItemDrop with the
//    same rarity), potions / materials / trophies are rebuilt from the catalog by name, hearts / mana orbs scale with HIS max HP / MP.
//    Gold / gems / crystals / shards carry their value (collecting pays with HIS gold-find). Each side only collects the pickups of its own world.
//  - HOST -> guest REWARD: the room-clear card choice (store.openWaveReward) and the fountain's boon open on the guest's own client.
// The guest never forwards anything of this kind back (his pickups are his).
import { Vector3 } from 'three';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { spawnPickup } from '../engine/systems/pickups';
import { useGameStore, makeItemById } from '../store';
import { ITEMS_POOL } from '../constants';
import { LOOT, lootItem } from '../loot';
import type { Item, Rarity } from '../types';
import type { PickupKind } from '../engine/types';
import { coopRoom } from './coopRoom';
import { MSG, DROP_KINDS, isNum } from './protocol';

export interface LootIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: LootIO | null = null;
export function lootBind(h: LootIO): void { io = h; }
/** QA counters (window.__coop.stats()) */
export const lootStats = { sent: 0, got: 0, itemsRolled: 0, cards: 0 };

const kindIdx: Record<string, number> = {}; DROP_KINDS.forEach((k, i) => { kindIdx[k] = i; });
const GEAR = new Set(['WEAPON', 'ARMOR', 'HELMET', 'GLOVES', 'BOOTS', 'ACCESSORY']);
const RARITIES: readonly string[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

// ------------------------------------------------------------------ host ---
coopRoom.fwdDrop = (kind, x, z, value, item) => {
  if (!io || !io.connected() || !coopRoom.two || coopRoom.guest) return;
  const k = kindIdx[kind];
  if (k === undefined) return;
  let v = value, w: unknown = 0;
  const s = useGameStore.getState().stats;
  if (kind === 'HEALTH') v = (value / Math.max(1, s.maxHealth)) * 1000;       // a share of the hero's HP, not a flat number
  else if (kind === 'MANA') v = (value / Math.max(1, s.maxMana)) * 1000;
  if (kind === 'ITEM') {
    if (!item || item.type === 'PET') return;
    w = [item.type, item.name, item.rarity, item.quantity ?? 1];
  }
  lootStats.sent++;
  io.send([MSG.DROP, io.rv(), k, Math.round(x * 10), Math.round(z * 10), Math.round(v * 100) / 100, w]);
};
coopRoom.fwdReward = (what, bonus) => {
  if (!io || !io.connected() || !coopRoom.two || coopRoom.guest) return;
  io.send([MSG.REWARD, io.rv(), what, bonus ? 1 : 0]);
};

// ----------------------------------------------------------------- guest ---
const pos = new Vector3();
/** An item of the host's drop, as the GUEST's own copy (null = nothing for him). */
function myItem(w: unknown): Item | null {
  if (!Array.isArray(w) || typeof w[0] !== 'string' || typeof w[1] !== 'string' || typeof w[2] !== 'string' || !RARITIES.includes(w[2])) return null;
  const type = w[0], name = w[1].slice(0, 40), rarity = w[2] as Rarity, qty = isNum(w[3]) ? Math.max(1, Math.min(99, Math.round(w[3]))) : 1;
  if (GEAR.has(type)) { lootStats.itemsRolled++; return useGameStore.getState().rollItemDrop(rarity); }   // his own roll: his class, his level
  if (type === 'LOOT') { const def = LOOT.find((l) => l.name === name); return def ? lootItem(def, qty) : null; }
  const tpl = ITEMS_POOL.find((i) => i.name === name && i.type === type);
  return tpl ? makeItemById(tpl.id, qty)[0] ?? null : null;
}

/** DROP (host -> guest): spawn my own copy of what the host's world dropped. */
export function onDrop(d: unknown[]): void {
  if (!coopRoom.guest || !world.room.active) return;
  const kind = isNum(d[2]) ? DROP_KINDS[d[2] | 0] : undefined;
  if (!kind || !isNum(d[3]) || !isNum(d[4]) || !isNum(d[5])) return;
  let value = Math.max(0, Math.min(1e6, d[5]));
  const st = useGameStore.getState();
  let item: Item | undefined;
  if (kind === 'HEALTH') value = Math.min(1, value / 1000) * st.stats.maxHealth;
  else if (kind === 'MANA') value = Math.min(1, value / 1000) * st.stats.maxMana;
  else if (kind === 'ITEM') { const it = myItem(d[6]); if (!it) return; item = it; }
  lootStats.got++;
  spawnPickup(kind as PickupKind, pos.set(d[3] / 10, 0, d[4] / 10), value, item);
}

/** REWARD (host -> guest): open my own card choice / drink from the fountain myself. */
export function onReward(d: unknown[]): void {
  if (!coopRoom.guest || !world.room.active || !isNum(d[2])) return;
  const st = useGameStore.getState();
  if (d[2] === 0) { lootStats.cards++; st.openWaveReward(d[3] === 1); return; }
  if (d[2] === 1) {   // the fountain: +40% HP / MP and a random blessing for the rest of the run (same as the host's)
    const p = world.player, max = st.stats.maxHealth, mp = st.stats.maxMana;
    if (!p.alive) return;
    const before = p.hp;
    p.hp = Math.min(max, p.hp + max * 0.4); p.mana = Math.min(mp, p.mana + mp * 0.4);
    events.emit('heal', { pos: p.pos, amount: p.hp - before });
    const kinds = ['FORTUNE', 'MIGHT', 'AEGIS', 'SWIFT', 'VITALITY', 'PRECISION'] as const;
    const kind = kinds[Math.floor(Math.random() * kinds.length)], label = st.applyBlessing(kind);
    if (kind === 'AEGIS') p.shieldCharges += 1;
    events.emit('floatText', { pos: p.pos, text: label.split(':')[0], color: 0xffd36a, scale: 1.1, dy: 1.6 });
    events.emit('shockwave', { pos: p.pos.clone(), radius: 5, color: 0xffd36a });
  }
}
