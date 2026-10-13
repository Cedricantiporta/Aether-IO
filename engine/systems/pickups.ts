// ============================================================================
// Pickups: XP / gold / gems / health orbs and item drops.
// Pop out with a bounce, magnetise towards the player, collect on contact.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocPickup } from '../world';
import { edgeLimit } from '../mapgen';
import { events } from '../events';
import type { PickupKind } from '../types';
import type { Item, Rarity } from '../../types';
import { useGameStore, calculateItemCP, RARITY_LEVEL_REQ, RARITY_COLOR } from '../../store';
import { healPlayer } from './combat';

const GRAVITY = 28;
const REST_Y = 0.4;
const COLLECT_RADIUS = 1.2;
const XP_MERGE_THRESHOLD = 300;
const XP_MERGE_RADIUS = 4;
const MAX_MAGNET_SPEED = 55;
const PET_COLLECT_RANGE = 20;
const MAGNET_SKILL_BONUS = 1.5; // per skill level

let xpActive = 0;
const tmpPos = new Vector3();

export function resetPickups(): void {
  xpActive = 0;
}

/**
 * Spawns a pickup at `pos` (y ignored), popping out with a random upward velocity.
 * If the pool is full the reward is granted immediately so nothing is lost.
 */
export function spawnPickup(kind: PickupKind, pos: Vector3, value: number, item?: Item): void {
  // Keep inside the arena.
  tmpPos.set(pos.x, 0, pos.z);
  const d = Math.hypot(tmpPos.x, tmpPos.z);
  const maxD = d > 70 ? edgeLimit(tmpPos.x, tmpPos.z, 2) : 1e9;
  if (d > maxD) tmpPos.multiplyScalar(maxD / d);

  // Merge XP orbs into a nearby one when there are too many.
  if (kind === 'XP' && xpActive > XP_MERGE_THRESHOLD) {
    const pk = world.pickups;
    const r2 = XP_MERGE_RADIUS * XP_MERGE_RADIUS;
    for (let i = 0; i < pk.length; i++) {
      const o = pk[i];
      if (!o.active || o.kind !== 'XP' || o.magnet) continue;
      const dx = o.pos.x - tmpPos.x, dz = o.pos.z - tmpPos.z;
      if (dx * dx + dz * dz < r2) { o.value += value; return; }
    }
  }

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
  if (kind === 'XP') xpActive++;
  if (kind === 'ITEM') world.itemPickupsVersion++;
}

/** Direct reward (pool exhausted fallback). */
function grant(kind: PickupKind, value: number, item?: Item): void {
  const st = useGameStore.getState();
  switch (kind) {
    case 'XP': st.addExperience(value); world.run.xpEarned += value; break;
    case 'GOLD': st.addGold(value); world.run.goldEarned += value; break;
    case 'GEM': st.addGems(value); break;
    case 'HEALTH': healPlayer(value); break;
    case 'ITEM': if (item) st.addItemToInventory(item); break;
  }
}

function notifyLoot(item: Item): void {
  const st = useGameStore.getState();
  let action: { label: string; onClick: () => void } | undefined;
  if (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY' || item.type === 'PET') {
    const slot = item.type === 'WEAPON' ? 'weapon' : item.type === 'ARMOR' ? 'armor' : item.type === 'ACCESSORY' ? 'accessory' : 'pet';
    const cur = st.equipment[slot];
    const better = calculateItemCP(item) > (cur ? calculateItemCP(cur) : 0);
    const usable = st.level >= RARITY_LEVEL_REQ[item.rarity] && (!item.classType || item.classType === st.hero);
    if (better && usable) action = { label: 'EQUIP', onClick: () => useGameStore.getState().equipItem(item) };
  }
  const plus = item.level > 1 ? ` +${item.level - 1}` : '';
  const qty = item.quantity && item.quantity > 1 ? ` x${item.quantity}` : '';
  st.addNotification(`${item.name}${plus}${qty}`, RARITY_COLOR[item.rarity] ?? '#ffffff', 'ITEM', action);
}

/** Player magnet radius (items outside it are candidates for the pet to fetch). */
export function getMagnetRadius(st: ReturnType<typeof useGameStore.getState>): number {
  let r = st.stats.magnetRadius + st.skillLevels.magnet * MAGNET_SKILL_BONUS;
  if (st.equipment.pet?.petSkill === 'COLLECT') r = Math.max(r, PET_COLLECT_RANGE);
  return r;
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

  let xpCount = 0;
  for (let i = 0; i < pk.length; i++) {
    const o = pk[i];
    if (!o.active) continue;
    o.t += dt;
    if (o.kind === 'XP') xpCount++;

    const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;

    // Only items respect inventory space.
    let canGet = p.alive;
    if (canGet && o.kind === 'ITEM') canGet = !!o.item && st.canPickUp(o.item);

    if (canGet && !o.magnet && o.t > 0.35 && d2 < magnetR2) o.magnet = true;
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

    if (canGet && d2 < collectR2) collect(o, st);
  }
  xpActive = xpCount;
}

function collect(o: (typeof world.pickups)[number], st: ReturnType<typeof useGameStore.getState>): void {
  const kind = o.kind;
  const value = o.value;
  let rarity: Rarity | undefined;

  switch (kind) {
    case 'XP': st.addExperience(value); world.run.xpEarned += value; break;
    case 'GOLD': st.addGold(value); world.run.goldEarned += value; break;
    case 'GEM': st.addGems(value); break;
    case 'HEALTH': healPlayer(value); break;
    case 'ITEM': {
      const item = o.item;
      if (!item || !st.addItemToInventory(item)) { o.magnet = false; return; }
      rarity = item.rarity;
      notifyLoot(item);
      world.itemPickupsVersion++;
      break;
    }
  }
  o.active = false;
  o.item = null;
  events.emit('pickup', { pos: o.pos, kind, value, rarity });
}
