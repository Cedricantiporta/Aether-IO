import { GOLD_SCALE } from '../../constants';
import { biomeGoldMul } from '../../biomeLoot';
// ============================================================================
// Pickups: XP / gold / gems / health orbs and item drops.
// Pop out with a bounce, magnetise towards the player, collect on contact.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocPickup } from '../world';
import { edgeLimit, bounds, pushOutOfColliders, roomHalls } from '../mapgen';
import { events } from '../events';
import type { PickupKind } from '../types';
import { hardMul, runInfo } from '../runMods';
import { waves } from '../../endlessWaves';
import { showcase } from '../showcase';
import { trial } from '../../bossTrials';
import type { Item, Rarity } from '../../types';
import { canUseClass } from '../../itemClass';
import { runWish } from '../../wishing';
import { useGameStore, calculateItemCP, RANK_REQ, itemReq, RARITY_COLOR, goldFindMul, potionKind, potionCapMsg, potionCount, POTION_CAP } from '../../store';
/** (owner) gold coins picked up from the ground are worth 70% less (kills, crates, bosses, rewards). */
const GOLD_LOOT_MUL = 0.3;
/** (owner 2026-10-31) the deeper the biome the bigger the coins (biomeLoot.BIOME_GOLD_MUL); Adventure runs only (the Endless Waves gold stays flat). */
const goldBiomeMul = (): number => (runInfo.mode === 'ADVENTURE' && world.room.active ? biomeGoldMul(world.room.biome) : 1) * (1 + runWish.gold);   // (runWish.gold: Wishing Fountain Golden Touch / Lucky Charm / Jackpot, this run only)
import { healPlayer, grantKillXp } from './combat';
import { coopRoom } from '../../net/coopRoom';

const GRAVITY = 28;
const REST_Y = 0.4;
const COLLECT_RADIUS = 1.2;
const XP_MERGE_THRESHOLD = 300;
const XP_MERGE_RADIUS = 4;
const MAX_MAGNET_SPEED = 55;

let xpActive = 0;
/** Items the player dropped on purpose (dragged out of the bag): never auto-looted, only picked up by hand (E). */
export const droppedItems = new Set<string>();
const tmpPos = new Vector3();

export function resetPickups(): void {
  xpActive = 0;
}

/**
 * Spawns a pickup at `pos` (y ignored), popping out with a random upward velocity.
 * If the pool is full the reward is granted immediately so nothing is lost.
 */
/** Seconds an item lies on the ground before it vanishes. */
export const ITEM_DESPAWN = 180;
/** (owner 2026-10-26) The tower family (Endless Tower, Daily Trial, Endless Waves run as mode 'TOWER'): in-run loot is ONLY Aether Crystals (plus hearts / mana orbs)
 *  (Endless Waves: gold only, no crystals). Every item / shard / gem pickup is dropped here, whatever system asked for it (crates, chests, reward rooms,
 *  boss rewards, champions...). Items the hero dropped on purpose are never blocked. */
function towerBlocks(kind: PickupKind, item?: Item): boolean {
  if (runInfo.mode !== 'TOWER' || !world.room.active || showcase.on) return false;
  if (kind === 'ITEM') return !(item && droppedItems.has(item.id));
  if (waves.on) return kind === 'SHARD' || kind === 'GEM' || kind === 'CRYSTAL';   // Endless Waves: gold only
  return kind === 'SHARD' || kind === 'GEM' || kind === 'GOLD';   // Endless Tower / Daily Trial: Aether Crystals only
}
export function spawnPickup(kind: PickupKind, pos: Vector3, value: number, item?: Item): void {
  if (towerBlocks(kind, item)) return;
  // co-op (STEP 3): every player gets HIS OWN loot. The host's world drops something -> the guest is sent a DROP and spawns his own copy (items re-rolled for his class);
  // each side only ever collects the pickups of its own world. XP is never forwarded (kills pay both players directly); crates / harvest nodes / the pet are
  // not forwarded either (coopRoom.noFwd): they exist on both screens and every player breaks his own copy.
  if (coopRoom.fwdDrop && coopRoom.noFwd === 0 && kind !== 'XP' && !(item && droppedItems.has(item.id))) coopRoom.fwdDrop(kind, pos.x, pos.z, value, item);
  // Interiors (castle / chapel / tavern / house) draw no ground loot and have no ground of their own (the pickup physics would settle it on the
  // TOWN terrain under the same coordinates, i.e. float or sink): anything dropped there goes straight to the bag / purse.
  const ar = world.village.area;
  if (ar === 'CASTLE' || ar === 'CHURCH' || ar === 'TAVERN' || ar === 'HOME') { grant(kind, value, item); return; }
  // Keep inside the arena.
  tmpPos.set(pos.x, 0, pos.z);
  const d = Math.hypot(tmpPos.x, tmpPos.z);
  const maxD = d > bounds.checkR && !roomHalls() ? edgeLimit(tmpPos.x, tmpPos.z, 2) : 1e9;   // (HALLS: pushOutOfColliders slides it off the walls)
  if (d > maxD) tmpPos.multiplyScalar(maxD / d);
  if (bounds.room) pushOutOfColliders(tmpPos, 1.3);   // never inside a lake, river or rock

  // XP orbs are gone: experience is granted instantly (with a coalesced floating number).
  if (kind === 'XP') { grantKillXp(value, tmpPos); return; }

  const p = allocPickup();
  if (!p) {
    grant(kind, value, item);
    return;
  }
  p.active = true;
  p.kind = kind;
  p.value = value;
  p.item = item ?? null;
  p.pos.set(tmpPos.x, 0.8, tmpPos.z);
  const a = Math.random() * Math.PI * 2;
  const s = 2 + Math.random() * 4;
  p.vel.set(Math.cos(a) * s, 7 + Math.random() * 4, Math.sin(a) * s);
  if (kind === 'ITEM') { world.itemPickupsVersion++; if (item) events.emit('lootDrop', { pos: p.pos, rarity: item.rarity }); }
}

/** (owner) Aether Crystals drop as glowing pickups (up to 5 pieces sharing `n`) that fly to the hero like coins. */
const crystalAt = new Vector3();
export function dropCrystals(n: number, at: { x: number; z: number }): void {
  n = Math.floor(n);
  if (n <= 0) return;
  const k = Math.min(5, n);
  for (let i = 0; i < k; i++) spawnPickup('CRYSTAL', crystalAt.set(at.x, 0, at.z), Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/** Co-op: pick up everything still lying on the floor into the bag (a guest leaving a room / going home; the host does it in director.finishLeave). */
export function collectAllPickups(): void {
  const pk = world.pickups, st = useGameStore.getState();
  for (let i = 0; i < pk.length; i++) if (pk[i].active) collect(pk[i], st);
}

/** Co-op: gold earned from a partner's kill (the same coin value the host's pickup would pay, with this player's own gold-find). */
export function grantGoldCoin(value: number): void {
  const st = useGameStore.getState();
  const g = Math.max(1, Math.round(value * GOLD_SCALE * GOLD_LOOT_MUL * (goldFindMul(st.heroRank) + st.stats.goldFind) * hardMul(st.status === 'MENU') * goldBiomeMul()));
  st.addGold(g); world.run.goldEarned += g;
  events.emit('floatText', { pos: world.player.pos, text: `+${g} G`, color: 0xffd24a, scale: 0.8, dy: 2.0 });
}

/** Direct reward (pool exhausted fallback). */
function grant(kind: PickupKind, value: number, item?: Item): void {
  const st = useGameStore.getState();
  switch (kind) {
    case 'XP': st.addExperience(value); world.run.xpEarned += value; break;
    case 'GOLD': { const g = Math.max(1, Math.round(value * GOLD_SCALE * GOLD_LOOT_MUL * (goldFindMul(st.heroRank) + st.stats.goldFind) * hardMul(st.status === 'MENU') * goldBiomeMul())); st.addGold(g); world.run.goldEarned += g; break; }
    case 'SHARD': giveShard(value, st); break;
    case 'CRYSTAL': st.addCrystals(value); break;
    case 'GEM': st.addGems(value); break;
    case 'HEALTH': healPlayer(value); break;
    case 'MANA': { const p = world.player, mx = useGameStore.getState().stats.maxMana; p.mana = Math.min(mx, p.mana + value); events.emit('floatText', { pos: p.pos, text: `+${Math.round(value)} MP`, color: 0x6ab8ff, scale: 0.9, dy: 2.2 }); break; }
    case 'ITEM': if (item) st.addItemToInventory(item); break;
  }
}

const SHARD_RARITY: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
let shardNote = { rarity: '' as string, count: 0, at: 0, id: '' };

/** Adds a crafting shard and keeps one coalesced "+N Rare Shards" loot-feed line (rarity coloured). */
function giveShard(idx: number, st: ReturnType<typeof useGameStore.getState>): void {
  const rarity = SHARD_RARITY[Math.max(0, Math.min(4, idx | 0))];
  st.addMaterial(rarity, 1);
  const now = performance.now();
  if (shardNote.rarity === rarity && now - shardNote.at < 2000) {
    shardNote.count++;
    if (shardNote.id) st.removeNotification(shardNote.id);
  } else shardNote = { rarity, count: 1, at: now, id: '' };
  shardNote.at = now;
  const name = rarity.charAt(0) + rarity.slice(1).toLowerCase();
  st.addNotification(`+${shardNote.count} ${name} Shard${shardNote.count > 1 ? 's' : ''}`, RARITY_COLOR[rarity], 'ITEM');
  const list = useGameStore.getState().notifications;
  shardNote.id = list[list.length - 1]?.id ?? '';
}

function notifyLoot(item: Item): void {
  const st = useGameStore.getState();
  let action: { label: string; onClick: () => void } | undefined;
  if (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY' || item.type === 'PET' || item.type === 'HELMET' || item.type === 'GLOVES' || item.type === 'BOOTS') {
    const slot = item.type.toLowerCase() as 'weapon';
    const cur = st.equipment[slot];
    const better = calculateItemCP(item) > (cur ? calculateItemCP(cur) : 0);
    const usable = (item.type === 'PET' || st.heroRank >= itemReq(item)) && canUseClass(item, st.hero);
    if (better && usable) action = { label: 'EQUIP', onClick: () => useGameStore.getState().equipItem(item) };
  }
  const plus = item.level > 1 && item.type !== 'POTION' && item.type !== 'CORE' && item.type !== 'REVIVE' && item.type !== 'LOOT' ? ` +${item.level - 1}` : '';
  const qty = item.quantity && item.quantity > 1 ? ` x${item.quantity}` : '';
  st.addNotification(`${item.name}${plus}${qty}`, RARITY_COLOR[item.rarity] ?? '#ffffff', 'ITEM', action);
}

/** Player magnet radius (items outside it are candidates for the pet to fetch). */
export function getMagnetRadius(st: ReturnType<typeof useGameStore.getState>): number {
  let r = st.stats.magnetRadius;   // (the Looter passive is gone)
  return r;
}

/** E / tap on a loot pill: the item flies to the hero and is collected (bag full -> a warning, it stays). */
const ITEM_GRAB_R2 = 2.4 * 2.4;
const RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 0.5, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };
const GEAR_MIN: Record<string, number> = { OFF: 99, COMMON: 0, UNCOMMON: 0.5, RARE: 1, EPIC: 2, LEGENDARY: 3 };
const MATERIAL: Record<string, boolean> = { LOOT: true, SHARD: true, POTION: true, REVIVE: true, CORE: true };
/** Does the auto-loot setting pick this item up by itself? */
function autoLootWants(it: Item, set: { autoLootGear: string; autoLootMaterials: boolean }): boolean {
  if (MATERIAL[it.type]) return set.autoLootMaterials || it.rarity !== 'COMMON';   // (owner default: materials on = every tier)
  return RARITY_RANK[it.rarity] >= GEAR_MIN[set.autoLootGear];
}
/** "Bag is full!" at most once per 3 s (many drops grabbed / vacuumed at once used to stack a dozen toasts). */
let lastBagFull = -1e9;
export function warnPotionCap(st: { addNotification: (m: string, c?: string, t?: any) => void }, pk: 'hp' | 'mp'): void {
  const now = performance.now();
  if (now - lastBagFull < 3000) return;
  lastBagFull = now;
  st.addNotification(potionCapMsg(pk), 'red', 'WARNING');
}
export function warnBagFull(st: { addNotification: (m: string, c?: string, t?: any) => void }): void {
  const now = performance.now();
  if (now - lastBagFull < 3000) return;
  lastBagFull = now;
  st.addNotification('Bag is full!', 'red', 'WARNING');
}
export function lootPickup(i: number): void {
  const o = world.pickups[i], st = useGameStore.getState();
  if (!o || !o.active || o.kind !== 'ITEM' || !o.item) return;
  if (!st.canPickUp(o.item)) { const pk = potionKind(o.item); if (pk && potionCount(st.inventory, pk) >= POTION_CAP) warnPotionCap(st, pk); else warnBagFull(st); return; }   // (a full bag is not the potion cap)
  o.magnet = true; o.t = Math.max(o.t, 0.4);
}
/** Nearest lootable item pickup within r of (x, z): index or -1. */
export function nearestLoot(x: number, z: number, r: number): number {
  let best = -1, bd = r * r;
  const pk = world.pickups;
  for (let i = 0; i < pk.length; i++) { const o = pk[i]; if (!o.active || o.kind !== 'ITEM' || o.magnet || o.t < 0.35) continue; const d = (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
/** Pet grabs a pickup: same reward path as the player collecting it. */
export function petCollect(o: (typeof world.pickups)[number]): void {
  collect(o, useGameStore.getState());
}

export function updatePickups(dt: number): void {
  const st = useGameStore.getState();
  const p = world.player;
  const pk = world.pickups;

  const magnetR = getMagnetRadius(st);
  const magnetR2 = magnetR * magnetR;
  const collectR2 = COLLECT_RADIUS * COLLECT_RADIUS;
  const damp = Math.exp(-4 * dt);
  const lerpK = Math.min(1, 10 * dt);

  const set = st.settings, farLoot = set.autoLootRange === 'FAR';
  const sweep = set.autoLootOnClear && world.room.active && world.director.phase === 'CLEARED';
  let xpCount = 0;
  for (let i = 0; i < pk.length; i++) {
    const o = pk[i];
    if (!o.active) continue;
    o.t += dt;
    if (o.kind === 'ITEM' && o.t > ITEM_DESPAWN && !o.magnet && !(trial.on && trial.won)) {   // (a won Boss Trial keeps its loot on the floor until you leave)   // items left on the field vanish after 3 minutes (owner)
      o.active = false; if (o.item) droppedItems.delete(o.item.id);
      events.emit('floatText', { pos: o.pos, text: 'vanished', color: 0x9a9a9a, scale: 0.6, dy: 0.8 });
      continue;
    }
    if (o.kind === 'XP') xpCount++;

    const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;

    // Only items respect inventory space.
    let canGet = p.alive;
    if (canGet && o.kind === 'ITEM') canGet = !!o.item && st.canPickUp(o.item);

    // Common items are looted by hand (E / tap the pill: lootPickup); Rare and better, currency, xp and hearts fly in by themselves
    // (Rare+ items only when you walk up to them: a short grab radius, no long-range pull)
    // (Settings > Auto loot: minimum gear rarity, materials, range, sweep the floor once the room is cleared)
    const autoItem = o.kind !== 'ITEM' || (!!o.item && !droppedItems.has(o.item.id) && (sweep || (autoLootWants(o.item, set) && (farLoot || d2 < ITEM_GRAB_R2))));
    if (canGet && !o.magnet && o.t > 0.35 && (sweep || d2 < magnetR2) && autoItem) o.magnet = true;
    if (o.magnet && !canGet) o.magnet = false;

    if (o.magnet) {
      const d = Math.sqrt(d2) || 1;
      const speed = Math.min(MAX_MAGNET_SPEED, 14 + o.t * 10 + (magnetR - d) * 2.5);
      const tx = (dx / d) * speed, tz = (dz / d) * speed;
      o.vel.x += (tx - o.vel.x) * lerpK;
      o.vel.z += (tz - o.vel.z) * lerpK;
      o.vel.y = 0;
      o.pos.x += o.vel.x * dt;
      o.pos.z += o.vel.z * dt;
      o.pos.y += (1.0 - o.pos.y) * lerpK;
    } else {
      // Pop-out physics.
      o.vel.y -= GRAVITY * dt;
      o.pos.x += o.vel.x * dt;
      o.pos.y += o.vel.y * dt;
      o.pos.z += o.vel.z * dt;
      o.vel.x *= damp;
      o.vel.z *= damp;
      if (o.pos.y < REST_Y) {
        o.pos.y = REST_Y;
        o.vel.y = -o.vel.y * 0.45;
        if (o.vel.y < 1.5) o.vel.y = 0;
      }
    }

    if (canGet && d2 < collectR2 && (o.kind !== 'ITEM' || o.magnet)) collect(o, st);
  }
  xpActive = xpCount;
}

/** (owner) every pickup shows in the loot feed: gold / gems picked up close together (a chest, a pile) become one line. */
const coin = { gold: 0, gems: 0, t: 0 as ReturnType<typeof setTimeout> | 0 };
function feedCoin(k: 'gold' | 'gems', n: number): void {
  coin[k] += n;
  if (coin.t) return;
  coin.t = setTimeout(() => {
    const add = useGameStore.getState().addNotification;
    if (coin.gold > 0) add(`+${coin.gold.toLocaleString()} Gold`, '#fbd34d', 'ITEM');
    if (coin.gems > 0) add(`+${coin.gems.toLocaleString()} Gems`, '#5ee0f5', 'ITEM');
    coin.gold = 0; coin.gems = 0; coin.t = 0;
  }, 700);
}

function collect(o: (typeof world.pickups)[number], st: ReturnType<typeof useGameStore.getState>): void {
  const kind = o.kind;
  const value = o.value;
  let rarity: Rarity | undefined;
  let grade: string | undefined;
  let name: string | undefined;

  switch (kind) {
    case 'XP': st.addExperience(value); world.run.xpEarned += value; break;
    case 'GOLD': { const g = Math.max(1, Math.round(value * GOLD_SCALE * GOLD_LOOT_MUL * (goldFindMul(st.heroRank) + st.stats.goldFind) * hardMul(st.status === 'MENU') * goldBiomeMul())); st.addGold(g); world.run.goldEarned += g; feedCoin('gold', g); break; }
    case 'SHARD': giveShard(value, st); break;
    case 'CRYSTAL': st.addCrystals(value); break;
    case 'GEM': st.addGems(value); feedCoin('gems', value); break;
    case 'HEALTH': healPlayer(value); break;
    case 'MANA': { const p = world.player, mx = useGameStore.getState().stats.maxMana; p.mana = Math.min(mx, p.mana + value); events.emit('floatText', { pos: p.pos, text: `+${Math.round(value)} MP`, color: 0x6ab8ff, scale: 0.9, dy: 2.2 }); break; }
    case 'ITEM': {
      const item = o.item;
      if (!item || !st.addItemToInventory(item)) { o.magnet = false; return; }
      rarity = item.rarity; grade = item.grade;
      name = item.type === 'LOOT' ? item.name : undefined;
      notifyLoot(item);
      world.itemPickupsVersion++;
      break;
    }
  }
  o.active = false;
  o.item = null;
  events.emit('pickup', { pos: o.pos, kind, value, rarity, name, grade });
}
