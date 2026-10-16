// ============================================================================
// Destructible props (crates, barrels, pots, graves, crystals, ...): damage,
// per-kind loot, explosions, respawn.
// ============================================================================
import { Vector3 } from 'three';
import { world, MAX_CRATES } from '../world';
import { events } from '../events';
import type { Crate } from '../types';
import type { Rarity } from '../../types';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { spawnPickup } from './pickups';
import { dropLoot } from './loot';
import { CRATE_HP, isHarvestNode } from '../mapgen';
import { damageEnemiesInRadius, addShake, type DamageOpts } from './combat';
import { spawnEnemy } from './enemies';
import { spawnWildfire } from './zones';

export { CRATE_HP };
export { CRATE_RESPAWN_TIME } from '../mapgen';

const dropPos = new Vector3();
const batPos = new Vector3();
const RESPAWN_PLAYER_DIST2 = 25 * 25;
const EXPLOSION_RADIUS = 6;
const CHAIN_DELAY = 0.15;
const fuse = new Float32Array(MAX_CRATES);
const boomOpts: DamageOpts = { kind: 'FIRE', knockback: 1.6, env: 'BARREL' };
let lastTime = 0;

const BASE_XP: Record<Crate['kind'], number> = {
  CRATE: 50, BARREL: 40, CHEST: 150, POT: 8, HAY: 14, CRYSTAL: 120, ORE: 80, GOLD_VEIN: 80, HERB: 60, EXPLOSIVE_BARREL: 25, GRAVE: 70, CART: 100,
};

function dropAt(c: Crate, ox: number, oz: number): Vector3 {
  return dropPos.set(c.pos.x + ox, 0, c.pos.z + oz);
}
const jit = (s: number) => (Math.random() - 0.5) * s;

function rollChestRarity(): Rarity {
  const r = Math.random();
  return r < 0.05 ? 'LEGENDARY' : r < 0.35 ? 'EPIC' : 'RARE';
}

/** (owner) area skills break barrels / crates / pots in their radius too (never harvest nodes). */
export function hitCratesInRadius(x: number, z: number, r: number, amount: number): void {
  const crates = world.crates, rr = (r + 0.6) * (r + 0.6);
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c.active || isHarvestNode(c.kind)) continue;
    const dx = c.pos.x - x, dz = c.pos.z - z;
    if (dx * dx + dz * dz <= rr) hitCrate(c, amount);
  }
}

/** Deals damage to a crate; breaks it at 0 hp. */
/** `byHand`: a harvest stroke (hold E). Harvest nodes ignore every other hit (attacks, explosions). */
export function hitCrate(c: Crate, amount: number, byHand = false): void {
  if (!c.active) return;
  if (!byHand && isHarvestNode(c.kind)) return;
  c.hp -= amount;
  c.hitFlash = 1;
  if (c.hp <= 0) breakCrate(c);
}

function gold(c: Crate, n: number, each: number): void {
  for (let i = 0; i < n; i++) spawnPickup('GOLD', dropAt(c, jit(2.5), jit(2.5)), each);
}

/** Crafting shards: mostly COMMON/RARE, small chance of EPIC / LEGENDARY (value = rarity index). */
function shards(c: Crate, n: number, epic: number, legendary: number): void {
  for (let i = 0; i < Math.min(1, n); i++) {   // (owner: shards are rare - one per drop)
    const r = Math.random();
    const rarity = r < legendary ? 3 : r < legendary + epic ? 2 : Math.random() < 0.35 ? 1 : 0;
    spawnPickup('SHARD', dropAt(c, jit(2.5), jit(2.5)), rarity);
  }
}

function explode(c: Crate): void {
  const wave = world.director.wave;
  const x = c.pos.x, z = c.pos.z;
  damageEnemiesInRadius(x, z, EXPLOSION_RADIUS, 80 + wave * 30, boomOpts); // enemies only, never the player
  events.emit('explosion', { pos: c.pos, radius: EXPLOSION_RADIUS, color: 0xff7a1a });
  addShake(0.45);
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 3;
    spawnWildfire(x + Math.cos(a) * d, z + Math.sin(a) * d, 1.8 + Math.random() * 0.9, 6 + Math.random() * 4);
  }
  const crates = world.crates;
  for (let i = 0; i < crates.length; i++) {
    const o = crates[i];
    if (!o.active || o === c) continue;
    const dx = o.pos.x - x, dz = o.pos.z - z;
    if (dx * dx + dz * dz > EXPLOSION_RADIUS * EXPLOSION_RADIUS) continue;
    if (o.kind === 'EXPLOSIVE_BARREL') { if (fuse[i] <= 0) fuse[i] = CHAIN_DELAY; }
    else hitCrate(o, 40);
  }
}

export function breakCrate(c: Crate): void {
  if (!c.active) return;
  c.active = false;
  c.respawnT = 60 + Math.random() * 30;
  fuse[c.id] = 0;
  const st = useGameStore.getState();
  const wave = world.director.wave;
  const inRun = st.status === GameStatus.PLAYING;
  const xp = Math.max(1, Math.round(BASE_XP[c.kind] * (1 + 0.05 * (wave - 1)) * (isHarvestNode(c.kind) ? 0.08 : 1)));   // (owner: harvesting gives very little EXP)
  if (inRun) spawnPickup('XP', dropAt(c, 0, 0), xp); // village harvesting never grants run xp

  switch (c.kind) {
    case 'POT': {
      const r = Math.random();
      if (r < 0.016) spawnPickup('HEALTH', dropAt(c, 0.4, 0.4), 25);
      else if (r < 0.2) spawnPickup('GOLD', dropAt(c, 0.4, 0.4), 4 + Math.floor(Math.random() * 8));
      break;
    }
    case 'HAY':
      break;
    case 'BARREL':
      if (Math.random() < 0.15) spawnPickup('GOLD', dropAt(c, 0.5, 0.5), 20);
      break;
    case 'CRATE': {
      const r = Math.random();
      if (r > 0.94) { const item = st.rollItemDrop('UNCOMMON'); if (item) spawnPickup('ITEM', dropAt(c, 1, 0), 0, item); }
      else if (r > 0.8) spawnPickup('GOLD', dropAt(c, 0.5, 0.5), 25);
      break;
    }
    case 'CHEST': {
      const item = st.rollItemDrop(rollChestRarity());
      if (item) spawnPickup('ITEM', dropAt(c, 1, 0), 0, item);
      gold(c, 2, 20);
      break;
    }
    case 'CRYSTAL': {
      if (inRun) {
        const total = 5 + Math.floor(Math.random() * 11); // 5..15 gems
        const k = Math.min(total, 6);
        const each = Math.floor(total / k);
        for (let i = 0; i < k; i++) spawnPickup('GEM', dropAt(c, jit(2.5), jit(2.5)), i === 0 ? each + (total - each * k) : each);
      }
      shards(c, 2 + Math.floor(Math.random() * 3), 0.08, 0.01);
      break;
    }
    case 'ORE':
      shards(c, 1 + Math.floor(Math.random() * 3), 0.05, 0.005);
      break;
    case 'GOLD_VEIN':
      gold(c, 5, Math.round(30 * (1 + 0.08 * (wave - 1))));
      shards(c, 1, 0.03, 0);
      break;
    case 'HERB': {
      if (inRun) { spawnPickup('HEALTH', dropAt(c, 0.6, 0), 30); spawnPickup('HEALTH', dropAt(c, -0.6, 0.3), 30); spawnPickup('HEALTH', dropAt(c, 0, -0.6), 30); }
      else gold(c, 2, 15);
      break;
    }
    case 'EXPLOSIVE_BARREL':
      explode(c);
      break;
    case 'GRAVE':
      if (Math.random() < 0.25) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          batPos.set(c.pos.x + Math.cos(a) * 1.5, 0, c.pos.z + Math.sin(a) * 1.5);
          spawnEnemy('BAT', batPos);
        }
      }
      break;
    case 'CART': {
      gold(c, 3, 25);
      if (Math.random() < 0.12) { const item = st.rollItemDrop('UNCOMMON'); if (item) spawnPickup('ITEM', dropAt(c, 1, 0), 0, item); }
      break;
    }
  }
  if (c.kind !== 'EXPLOSIVE_BARREL' && c.kind !== 'HAY') dropLoot(c.kind, 1 + wave * 0.01, c.pos.x, c.pos.z);
  events.emit('crateBreak', { pos: c.pos, kind: c.kind });
}

export function updateCrates(dt: number): void {
  if (world.time < lastTime) fuse.fill(0); // new run
  lastTime = world.time;
  const crates = world.crates;
  const pp = world.player.pos;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - dt * 6);
    if (c.active) {
      if (fuse[i] > 0) { fuse[i] -= dt; if (fuse[i] <= 0) { fuse[i] = 0; breakCrate(c); } }
      continue;
    }
    if (c.respawnT <= 0) continue;
    c.respawnT -= dt;
    if (c.respawnT > 0) continue;
    const dx = c.pos.x - pp.x, dz = c.pos.z - pp.z;
    if (dx * dx + dz * dz < RESPAWN_PLAYER_DIST2) { c.respawnT = 3; continue; }
    c.hp = c.maxHp = CRATE_HP[c.kind];
    c.hitFlash = 0;
    c.active = true;
  }
}
