// ============================================================================
// Breakable crates / barrels / chests: damage, loot, respawn.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Crate } from '../types';
import type { Rarity } from '../../types';
import { useGameStore } from '../../store';
import { spawnPickup } from './pickups';
import { CRATE_RESPAWN_TIME, CRATE_HP } from '../mapgen';

const dropPos = new Vector3();
const RESPAWN_CLEARANCE2 = 6 * 6; // do not respawn on top of the player

function dropAt(c: Crate, ox: number, oz: number): Vector3 {
  return dropPos.set(c.pos.x + ox, 0, c.pos.z + oz);
}

function rollChestRarity(): Rarity {
  const r = Math.random();
  return r < 0.05 ? 'LEGENDARY' : r < 0.35 ? 'EPIC' : 'RARE';
}

/** Deals damage to a crate; breaks it at 0 hp. */
export function hitCrate(c: Crate, amount: number): void {
  if (!c.active) return;
  c.hp -= amount;
  c.hitFlash = 1;
  if (c.hp <= 0) breakCrate(c);
}

export function breakCrate(c: Crate): void {
  if (!c.active) return;
  c.active = false;
  c.respawnT = CRATE_RESPAWN_TIME;
  const st = useGameStore.getState();

  spawnPickup('XP', dropAt(c, 0, 0), c.kind === 'CHEST' ? 150 : 50);

  if (c.kind === 'CHEST') {
    const item = st.rollItemDrop(rollChestRarity());
    if (item) spawnPickup('ITEM', dropAt(c, 1, 0), 0, item);
    for (let i = 0; i < 5; i++) spawnPickup('GOLD', dropAt(c, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5), 20);
  } else {
    const r = Math.random();
    if (r > 0.85) {
      const item = st.rollItemDrop();
      if (item) spawnPickup('ITEM', dropAt(c, 1, 0), 0, item);
    } else if (r > 0.5) {
      spawnPickup('GOLD', dropAt(c, 0.5, 0.5), 25);
    }
  }
  events.emit('crateBreak', { pos: c.pos });
}

export function updateCrates(dt: number): void {
  const crates = world.crates;
  const pp = world.player.pos;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - dt * 6);
    if (c.active || c.respawnT <= 0) continue;
    c.respawnT -= dt;
    if (c.respawnT > 0) continue;
    const dx = c.pos.x - pp.x, dz = c.pos.z - pp.z;
    if (dx * dx + dz * dz < RESPAWN_CLEARANCE2) { c.respawnT = 2; continue; }
    c.hp = c.maxHp = CRATE_HP[c.kind];
    c.hitFlash = 0;
    c.active = true;
  }
}
