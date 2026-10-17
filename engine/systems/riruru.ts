// (owner cameo) Riruru, the friendly blue slime: in biome 1, once per run, a cleared combat room has a 5% chance that a
// lone small blue slime hops in after the last monster falls. It never deals damage but has 30x a slime's HP and 4x its
// armour; the room only clears once it is down. Drops 5 Mana Potions, and 10%: an Ankh of Life or a tier I / II upgrade core. render/Enemies tints it blue, the target frame names it.
import { Vector3 } from 'three';
import { world } from '../world';
import { useGameStore, makeItemById } from '../../store';
import { spawnEnemy, isSpawnable } from './enemies';
import { spawnPickup } from './pickups';
import type { Enemy } from '../types';

export const riruru = { id: -1, done: false, force: false };   // force: debug - the next quiet room always gets Riruru
const CHANCE = 0.05;
const at = new Vector3();

export function resetRiruru(): void { riruru.id = -1; riruru.done = false; }   // (keeps a pending debug force)
export const isRiruru = (e: Enemy): boolean => e.id === riruru.id && e.active;

/** The room just went quiet: maybe Riruru appears (true = it did, the room is not cleared yet). */
export function maybeRiruru(biome: number, type: string): boolean {
  if (riruru.force) riruru.force = false;
  else {
    if (riruru.done || biome !== 0 || (type !== 'COMBAT' && type !== 'ELITE')) return false;
    if (Math.random() >= CHANCE) return false;
  }
  const p = world.player.pos;
  for (let t = 0; t < 20; t++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 4;
    const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    if (!isSpawnable(x, z)) continue;
    const e = spawnEnemy('SLIME', at.set(x, 0, z));
    if (!e) return false;
    riruru.done = true; riruru.id = e.id;
    e.maxHp *= 30; e.hp = e.maxHp; e.armor = Math.max(e.armor * 4, 300);   // (owner) 30x HP and 4x tankier (armour 300+: takes 1/4 of the damage)
    e.contactDamage = 0; e.projectileDamage = 0; e.attackCd = 1e9;   // harmless
    e.scale *= 0.75; e.radius *= 0.8;   // a small slime
    useGameStore.getState().addNotification('A small blue slime bounces in... "Hi! I am Riruru! Please do not hit me!"', '#6cc4ff', 'SYSTEM');
    return true;
  }
  return false;
}

/** Riruru fell: 5 Mana Potions pop out, and 10% of the time a treasure (Ankh of Life or a tier I / II upgrade core). */
export function riruruDied(e: Enemy): void {
  if (e.id !== riruru.id) return;
  riruru.id = -1;
  const pots = makeItemById('potion_mana', 1);
  for (let k = 0; k < 5; k++) if (pots[0]) spawnPickup('ITEM', at.set(e.pos.x + Math.cos(k * 1.26) * 1.1, 0, e.pos.z + Math.sin(k * 1.26) * 1.1), 0, { ...pots[0], id: `${pots[0].id}_rr${Date.now()}_${k}` });
  if (Math.random() < 0.1) {
    const it = makeItemById(['revive_ankh', 'upgrade_core', 'upgrade_core_2'][Math.floor(Math.random() * 3)], 1)[0];
    if (it) spawnPickup('ITEM', at.set(e.pos.x, 0, e.pos.z), 0, it);
  }
  useGameStore.getState().addNotification('Riruru: "Ow... here, take these. No hard feelings!"', '#6cc4ff', 'SYSTEM');
}
