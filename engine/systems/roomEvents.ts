// Room objectives + twists (see docs/RUN_DESIGN.md). Rolled onto combat rooms by roomDefs.plan, started by the director
// on room entry, ticked after the enemies every frame, resolved on room clear. State lives in world.roomEvt (no React).
//   DEFEND  a totem in the arena: monsters drift to it and wear it down; it must still stand when the room is cleared.
//   RESCUE  a caged captive (same rules as the totem), then free them with E once the room is clear.
//   GOBLIN  a treasure goblin flees from you and vanishes after 15 s: catch it for a pile of gold and gems.
//   HUNT    one monster is marked: kill it within 30 s for a bounty.
//   twists  DARK (small light radius, UI overlay), CURSED (weak healing, gem bonus on clear), TRAPS (spike tiles that
//           telegraph red then burst, hurting you and monsters), GOLDEN (monsters drop extra gold).
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore, DMG_INFLATE, makeItemById } from '../../store';
import type { RoomPlan } from '../types';
import { spawnEnemy } from './enemies';
import { spawnPickup } from './pickups';
import { LOOT_BY_ID, lootItem } from '../../loot';
import { damagePlayer, damageEnemiesInRadius } from './combat';
import { stationPos, startPos } from '../roomgen';
import { queryColliders, type Collider } from '../mapgen';
import { onBridge, feat } from '../roomFeatures';
import { shape } from '../roomShape';
import { halls, hallsSdf, hallsRandomSpot } from '../roomHalls';
import { portalSlot, shortcutSlot } from '../roomgen';
import { OBJ_NAME, BIOMES } from '../roomDefs';
import { isStationary } from '../enemyDefs';

const E = () => world.roomEvt;
const tmp = new Vector3();
const colOut: Collider[] = [];
const notify = (msg: string, color = '#f1d58e') => useGameStore.getState().addNotification(msg, color, 'SYSTEM');

/** (owner) treasure rooms: kill every monster within this many seconds for a blessed chest (engine/systems/director chestLoot) */
export const SPEED_TIME = 40;
const GOBLIN_TIME = 15, HUNT_TIME = 30, TRAP_PERIOD0 = 3.2, TRAP_WARN0 = 2.1, TRAP_FIRE0 = 2.75, TRAP_R0 = 1.7;
// Spike-trap tuning (live values: Marble Halls, biome #2 = index 1, gets bigger / more / faster / longer-lasting traps).
let TRAP_PERIOD = TRAP_PERIOD0, TRAP_WARN = TRAP_WARN0, TRAP_FIRE = TRAP_FIRE0, TRAP_R = TRAP_R0, TRAP_TILE = TRAP_R0 * 2;
/** (owner) spike traps hit the hero 3x harder. */
const SPIKE_MUL = 3;
let trapDrain = false;   // spikes stay up long enough to hurt anyone who steps on them (Marble Halls)
/** Size multiplier of this room's trap tiles (render scales the plates / spikes by it). */
export let trapScale = 1;
let plTrapCd = 0;
const MARBLE_BIOME = 1;
const TRAP_W_STD = [30, 30, 20, 20], TRAP_W_MARBLE = [10, 10, 35, 45];

/** True when this room's Speed Clear was won (the treasure chest gives its blessed loot). */
export const speedWon = (): boolean => E().obj === 'SPEED' && E().state === 2;
export function resetRoomEvent(): void {
  const e = E();
  e.obj = ''; e.twist = ''; e.state = 0; e.hp = 0; e.maxHp = 1; e.t = 0; e.tmax = 0; e.enemy = -1; e.nTraps = 0; e.hurtT = 0; e.darkId = -1; e.darkT = 0; e.lifted = false;
}

/** Room entry: set up this room's objective / twist. */
export function startRoomEvent(plan: RoomPlan): void {
  resetRoomEvent();
  const e = E();
  e.obj = plan.obj ?? ''; e.twist = plan.twist ?? '';
  if (e.twist === 'TRAPS' && BIOMES[world.room.biome % BIOMES.length].name === 'Sunscorch Desert') e.twist = '';   // (owner) no spike floor traps in the Sunscorch Desert
  if (!e.twist && shape.kind === 'HALLS' && (plan.type === 'COMBAT' || (plan.type === 'ELITE' && world.room.biome % BIOMES.length === MARBLE_BIOME)) && Math.random() < (world.room.biome % BIOMES.length === MARBLE_BIOME ? 1 : 0.5)) e.twist = 'TRAPS';   // (owner) HALLS rooms hold more spike traps
  if (!e.obj && !e.twist) return;
  const [cx, cz] = stationPos(world.room.radius);
  e.x = cx; e.z = cz;
  if (e.obj) {
    e.state = 1;
    if (e.obj === 'DEFEND' || e.obj === 'RESCUE') { e.maxHp = e.hp = e.obj === 'DEFEND' ? 100 : 80; }
    if (e.obj === 'GOBLIN') e.tmax = GOBLIN_TIME;
    if (e.obj === 'HUNT') e.tmax = HUNT_TIME;
    if (e.obj === 'SPEED') e.tmax = SPEED_TIME;
    notify(`Objective: ${OBJ_NAME[e.obj]}`);
  }
  if (e.twist === 'TRAPS') placeTraps();
}

/** Spike-trap layouts, in tiles (dx, dz): single, 1x3 line, cross, 3x3 block. A group's tiles fire together. */
const TRAP_PATTERNS: readonly (readonly [number, number])[][] = [
  [[0, 0]],
  [[-1, 0], [0, 0], [1, 0]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
];
const tileX: number[] = [], tileZ: number[] = [];
const hp: [number, number] = [0, 0], pp2: [number, number] = [0, 0];
/** HALLS: is (x, z) within `r` of a portal slot, the boss shortcut, the station or a chest? */
function clearSpot(x: number, z: number, r: number): boolean {
  const R = world.room.radius;
  for (let n = 1; n <= 3; n++) for (let i = 0; i < n; i++) { portalSlot(i, n, R, pp2); if (Math.hypot(x - pp2[0], z - pp2[1]) < r + 4) return true; }
  shortcutSlot(pp2); if (Math.hypot(x - pp2[0], z - pp2[1]) < r + 4) return true;
  const [sx, sz] = stationPos(R);   // (the station / chests are placed after this runs: use the planned spots)
  if (Math.hypot(x - sx, z - sz) < r + 8) return true;
  if (feat.pChest.on && Math.hypot(x - feat.pChest.x, z - feat.pChest.z) < r + 3) return true;
  return false;
}
void halls;

function placeTraps(): void {
  if (BIOMES[world.room.biome % BIOMES.length].name === 'Sunscorch Desert') { E().nTraps = 0; return; }
  const e = E(), R = world.room.radius, cap = e.traps.length;
  const marble = world.room.biome % BIOMES.length === MARBLE_BIOME;
  // Marble Halls: tiles x1.4, warning->spike 0.75x faster cycle, spikes up 1.6x longer, 1.75x the groups, 3x3 / cross favoured
  // (owner 2026-10-25) step-triggered: a tile rests flat (t = 0) until a foot lands on it (hero or monster), then a fast cycle
  // (short glow -> spikes up -> down) that repeats for as long as anyone still stands on it
  TRAP_WARN = 0.0001; TRAP_FIRE = 0.3; TRAP_PERIOD = marble ? 1.0 : 0.85;
  trapScale = marble ? 1.4 : 1; TRAP_R = TRAP_R0 * trapScale; TRAP_TILE = TRAP_R * 2; trapDrain = marble; plTrapCd = 0;
  const isH = shape.kind === 'HALLS', TRAP_W = marble ? TRAP_W_MARBLE : TRAP_W_STD, maxGroups = (marble ? 10 : 6) * (isH ? 2 : 1);
  const [sx, sz] = startPos(R);
  let n = 0, groups = 0;
  for (let t = 0; t < 300 && groups < maxGroups && n < cap; t++) {
    let r = Math.random() * 100, pi = 0;
    for (; pi < TRAP_W.length - 1; pi++) { r -= TRAP_W[pi]; if (r <= 0) break; }
    const pat = TRAP_PATTERNS[pi], swap = Math.random() < 0.5;   // 1x3 lines run along x or z
    if (n + pat.length > cap) continue;
    const a = Math.random() * Math.PI * 2, d = 5 + Math.sqrt(Math.random()) * (R * 0.66 - 5);
    let cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    if (isH) { if (!hallsRandomSpot(TRAP_TILE * 1.5 + 1.5, hp)) continue; cx = hp[0]; cz = hp[1]; }   // (HALLS: anywhere on the open floor, away from the edges)
    let ok = true;
    tileX.length = tileZ.length = 0;
    for (const [ox, oz] of pat) {
      const x = cx + (swap ? oz : ox) * TRAP_TILE, z = cz + (swap ? ox : oz) * TRAP_TILE;
      if ((isH ? hallsSdf(x, z) < TRAP_R + 1.2 : Math.hypot(x, z) > R * 0.82) || Math.hypot(x - sx, z - sz) < 6.5 || onBridge(x, z, TRAP_R + 1) || (isH && clearSpot(x, z, TRAP_R + 1.5))) { ok = false; break; }   // inside the arena, never under the hero's arrival / exits / chests
      if (queryColliders(x, z, TRAP_R + 0.6, colOut).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + TRAP_R)) { ok = false; break; }
      for (let k = 0; k < n; k++) if (Math.abs(e.traps[k].x - x) < TRAP_TILE * 1.6 && Math.abs(e.traps[k].z - z) < TRAP_TILE * 1.6) { ok = false; break; }   // a gap between groups
      if (!ok) break;
      tileX.push(x); tileZ.push(z);
    }
    if (!ok) continue;
    for (let k = 0; k < tileX.length; k++) { const tr = e.traps[n++]; tr.x = tileX[k]; tr.z = tileZ[k]; tr.t = 0; tr.hit = false; }
    groups++;
  }
  e.nTraps = n;
}

/** Trap phase for the renderer: 0 idle, 0..1 warning glow, 2 spikes up. */
export function trapPhase(t: number): number {
  if (t < TRAP_WARN) return 0;
  if (t < TRAP_FIRE) return (t - TRAP_WARN) / (TRAP_FIRE - TRAP_WARN);
  return 2;
}

function reward(gold: number, gems: number, msg: string): void {
  const p = world.player.pos, depth = world.director.wave;
  const g = Math.round(gold * (1 + depth * 0.15)), n = 8;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; tmp.set(p.x + Math.cos(a) * 1.4, 0, p.z + Math.sin(a) * 1.4); spawnPickup('GOLD', tmp, Math.max(1, Math.round(g / n))); }
  if (gems > 0) { tmp.set(p.x, 0, p.z + 1); spawnPickup('GEM', tmp, gems); }
  notify(msg, '#ffd24a');
  events.emit('floatText', { pos: world.player.pos, text: 'OBJECTIVE!', color: 0xffd24a, scale: 1.1, dy: 2.4 });
}
function fail(msg: string): void {
  const e = E(); e.state = 3;
  notify(msg, '#ff8a7a');
}

/** Every frame of a run room (after the enemies moved). */
export function updateRoomEvents(dt: number): void {
  const e = E();
  if (!e.obj && !e.twist) return;
  const fighting = world.director.phase === 'FIGHT';
  e.t += dt;
  if (e.hurtT > 0) e.hurtT -= dt;
  const pl = world.player;
  // ---- objectives
  if (e.state === 1 && fighting) {
    if (e.obj === 'DEFEND' || e.obj === 'RESCUE') {
      // monsters target the totem / cage: every other one (and any closer to it than to the hero) walks to it and wears it
      // down, unless the hero is right next to it. (Enemies moved toward the hero this frame already: undo that step.)
      let n = 0;
      const reach = e.obj === 'DEFEND' ? 3.2 : 2.6;
      const guard = Math.hypot(pl.pos.x - e.x, pl.pos.z - e.z) < 7;   // the hero guards it: every monster comes for the hero instead
      for (const m of world.enemies) {
        if (!m.active || m.state === 'DYING' || m.state === 'SPAWN' || m.boss || m.mini || isStationary(m.kind)) continue;
        const dx = e.x - m.pos.x, dz = e.z - m.pos.z, d = Math.hypot(dx, dz) || 0.01;
        if (guard) continue;
        if (d < reach + m.radius) { n++; m.facing = Math.atan2(dx, dz); continue; }
        const pd = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        const toTotem = pd > 4 && ((m.id & 1) === 0 || d < pd);
        if (toTotem) {
          if (m.state === 'CHASE' || m.state === 'KITE') { m.pos.x -= m.vel.x * dt; m.pos.z -= m.vel.z * dt; }
          const s = Math.min(d - reach, m.speed * 0.9 * dt);
          m.pos.x += (dx / d) * s; m.pos.z += (dz / d) * s; m.facing = Math.atan2(dx, dz);
        } else if (d < 16) { const s = Math.min(d - reach, m.speed * 0.45 * dt); m.pos.x += (dx / d) * s; m.pos.z += (dz / d) * s; }
      }
      if (n > 0) { e.hp -= Math.min(4, n) * 3.2 * dt; e.hurtT = 0.25; }
      if (e.hp <= 0) { e.hp = 0; fail(e.obj === 'DEFEND' ? 'The totem fell.' : 'The captive was lost...'); }
    } else if (e.obj === 'GOBLIN') {
      if (e.enemy < 0 && e.t > 1.2) {
        // pops out at the far side of the room from the hero
        const R = world.room.radius, a = Math.atan2(-pl.pos.z, -pl.pos.x);
        tmp.set(Math.cos(a) * R * 0.18, 0, Math.sin(a) * R * 0.18);
        const g = spawnEnemy('GOBLIN', tmp);
        if (g) {
          g.maxHp = g.hp = Math.round(g.maxHp * 2.5); g.contactDamage = 0; g.scale *= 1.25; g.elite = false;
          e.enemy = g.id; e.t = 0;
          events.emit('floatText', { pos: g.pos, text: 'TREASURE GOBLIN!', color: 0xffd24a, scale: 1.0, dy: 2.2 });
        }
      } else if (e.enemy >= 0) {
        const g = world.enemies[e.enemy];
        if (!g.active || g.state === 'DYING') {
          e.state = 2; reward(60, 6, 'Treasure Goblin caught! It drops its hoard.');
        } else if (e.t >= e.tmax) {
          g.active = false; e.state = 3;
          events.emit('explosion', { pos: g.pos.clone(), radius: 2, color: 0xffd24a });
          notify('The goblin escaped with its gold.', '#ff8a7a');
        } else {
          // (the flee itself is steered smoothly in enemies.ts goblinFlee: a readable, constant-speed run)
        }
      }
    } else if (e.obj === 'SPEED') {
      if (e.t >= e.tmax) fail('Too slow! The chest stays plain.');
    } else if (e.obj === 'HUNT') {
      if (e.enemy < 0 && e.t > 2.5) {
        let best = -1, bd = 0;
        for (const m of world.enemies) {
          if (!m.active || m.state === 'DYING' || m.state === 'SPAWN' || m.boss || m.mini) continue;
          const d = Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z);
          if (d > bd) { bd = d; best = m.id; }   // the farthest one: you have to go get it
        }
        if (best >= 0) {
          const m = world.enemies[best];
          m.maxHp = m.hp = Math.round(m.maxHp * 2.5); m.scale *= 1.2;
          e.enemy = best; e.t = 0;
          events.emit('floatText', { pos: m.pos, text: 'BOUNTY!', color: 0xff5a4a, scale: 1.0, dy: 2.2 });
        }
      } else if (e.enemy >= 0) {
        const m = world.enemies[e.enemy];
        if (!m.active || m.state === 'DYING') { e.state = 2; reward(45, 4, 'Bounty claimed!'); }
        else if (e.t >= e.tmax) fail('The bounty got away.');
      }
    }
  }
  // ---- twists
  if (e.twist === 'DARK' && fighting && !e.lifted) {   // one monster casts the darkness: slay it and the light returns
    e.darkT += dt;
    if (e.darkId < 0 && e.darkT > 1.5) {
      let best = -1, bd = 1e9;
      for (const m of world.enemies) {
        if (!m.active || m.state === 'DYING' || m.state === 'SPAWN' || m.boss || m.mini || m.id === e.enemy) continue;
        const d = Math.abs(Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) - 14);   // one at mid range: findable in the gloom
        if (d < bd) { bd = d; best = m.id; }
      }
      if (best >= 0) {
        const m = world.enemies[best];
        m.maxHp = m.hp = Math.round(m.maxHp * 5); m.scale *= 1.25;   // (owner) the Shadowcaster: 2x the old 2.5x
        e.darkId = best;
        events.emit('floatText', { pos: m.pos, text: 'SHADOWCASTER', color: 0xb47cff, scale: 1.0, dy: 2.4 });
      }
    } else if (e.darkId >= 0) {
      const m = world.enemies[e.darkId];
      if (!m.active || m.state === 'DYING') { e.lifted = true; e.darkId = -1; notify('The Shadowcaster falls: the darkness lifts!', '#c9b6ff'); }
    }
  }
  if (e.twist === 'TRAPS' && fighting) {
    if (plTrapCd > 0) plTrapCd -= dt;
    for (let i = 0; i < e.nTraps; i++) {
      const tr = e.traps[i];
      if (tr.t <= 0) { if (stepOn(tr.x, tr.z)) { tr.t = 0.0002; tr.hit = false; } continue; }   // resting flat until something steps on it
      tr.t += dt;
      if (tr.t >= TRAP_PERIOD) { tr.hit = false; tr.t = stepOn(tr.x, tr.z) ? 0.0002 : 0; continue; }   // still occupied: fire again at once
      if (tr.t >= TRAP_FIRE && !tr.hit) {
        tr.hit = true;
        if (pl.alive && plTrapCd <= 0 && Math.abs(pl.pos.x - tr.x) < TRAP_R && Math.abs(pl.pos.z - tr.z) < TRAP_R) { tmp.set(tr.x, 0, tr.z); damagePlayer(useGameStore.getState().stats.maxHealth * 0.12 * SPIKE_MUL / DMG_INFLATE, { pos: tmp }); plTrapCd = 0.7; /* (12% max HP: already scales with the x2 HP) */ }
        damageEnemiesInRadius(tr.x, tr.z, TRAP_R * 1.15, Math.max(20, useGameStore.getState().stats.damage * 2.5), { kind: 'PHYSICAL', source: 'PLAYER', env: 'TRAP' });
      } else if (trapDrain && tr.t >= TRAP_FIRE && plTrapCd <= 0 && pl.alive && Math.abs(pl.pos.x - tr.x) < TRAP_R && Math.abs(pl.pos.z - tr.z) < TRAP_R) {
        // raised spikes: stepping onto a raised tile still hurts (at most one hit per 0.7 s, 60% of the burst)
        plTrapCd = 0.7; tmp.set(tr.x, 0, tr.z); damagePlayer(useGameStore.getState().stats.maxHealth * 0.07 * SPIKE_MUL / DMG_INFLATE, { pos: tmp });
      }
    }
  }
}

/** Is a foot on this spike tile? The hero (not mid-dash) or any walking monster (no bosses, flyers or stationaries). */
const stepIds: number[] = [];
function stepOn(x: number, z: number): boolean {
  const pl = world.player;
  if (pl.alive && pl.dashT <= 0 && Math.abs(pl.pos.x - x) < TRAP_R && Math.abs(pl.pos.z - z) < TRAP_R) return true;
  world.enemyGrid.query(x, z, TRAP_R + 1.5, stepIds);
  for (let k = 0; k < stepIds.length; k++) {
    const m = world.enemies[stepIds[k]];
    if (!m.active || m.state === 'DYING' || m.state === 'SPAWN' || m.boss || m.kind === 'BAT' || m.kind === 'WRAITH' || isStationary(m.kind)) continue;
    if (Math.abs(m.pos.x - x) < TRAP_R && Math.abs(m.pos.z - z) < TRAP_R) return true;
  }
  return false;
}

/** The room was cleared: totems / captives that held count now. */
export function roomEventCleared(): void {
  const e = E();
  if (e.state === 1 && e.obj === 'DEFEND') { e.state = 2; reward(40 + e.hp * 0.4, e.hp > 60 ? 5 : 3, `The totem stands (${Math.round(e.hp)}%)! Its blessing pours out.`); }
  else if (e.state === 1 && e.obj === 'RESCUE') { e.state = 4; notify('Free the captive: press E at the cage.'); }
  else if (e.state === 1 && e.obj === 'SPEED') { e.state = 2; notify('Cleared in time! The chest glows with a blessing.', '#ffd24a'); events.emit('floatText', { pos: world.player.pos, text: 'IN TIME!', color: 0xffd24a, scale: 1.1, dy: 2.4 }); }
  else if (e.state === 1) fail(e.obj === 'GOBLIN' ? 'The goblin escaped with its gold.' : 'The bounty got away.');
  if (e.twist === 'CURSED') { tmp.set(world.player.pos.x, 0, world.player.pos.z + 1.2); spawnPickup('GEM', tmp, 4); notify('The curse lifts: gems for your trouble.', '#c58bff'); }
}

/** E at the cage after the room is clear. */
export function freeCaptive(): void {
  const e = E();
  if (e.obj !== 'RESCUE' || e.state !== 4) return;
  e.state = 2;
  captiveReward();
  events.emit('captiveFreed', {});
}

/** Captive thank-you: ONE non-gear reward (never wearables / weapons), weighted by rarity, amounts scale a little with depth. */
const CAPTIVE_POOL: readonly (readonly [string, number])[] = [
  ['gold', 30], ['potion_small', 20], ['loot_common', 18], ['shard_common', 12],
  ['potion_big', 6], ['shard_rare', 5], ['core', 2], ['medal', 3], ['shard_epic', 1.5], ['core2', 0.25],
];
function captiveReward(): void {
  const depth = world.director.wave, p = world.player.pos;
  let tot = 0; for (const [, w] of CAPTIVE_POOL) tot += w;
  let r = Math.random() * tot, pick = 'gold';
  for (const [id, w] of CAPTIVE_POOL) { r -= w; if (r <= 0) { pick = id; break; } }
  const at = () => tmp.set(p.x + (Math.random() - 0.5) * 1.6, 0, p.z + 1 + Math.random() * 0.6);
  const give = (it: import('../../types').Item | undefined) => { if (it) spawnPickup('ITEM', at(), 0, it); };
  const q = 1 + Math.floor(depth / 12);
  let what = '';
  switch (pick) {
    case 'gold': { const g = Math.round(60 * (1 + depth * 0.15)); for (let i = 0; i < 6; i++) spawnPickup('GOLD', at(), Math.max(1, Math.round(g / 6))); what = 'a purse of gold'; break; }
    case 'potion_small': give(makeItemById(Math.random() < 0.5 ? 'potion_hp' : 'potion_mana', 1 + Math.floor(depth / 10))[0]); what = 'a potion'; break;
    case 'potion_big': give(makeItemById(Math.random() < 0.5 ? 'potion_hp_big' : 'potion_mana_big', 1)[0]); what = 'a big potion'; break;
    case 'loot_common': {
      const pool = Object.values(LOOT_BY_ID).filter((l) => l.rarity === 'COMMON' || l.rarity === 'UNCOMMON');
      if (pool.length) give(lootItem(pool[Math.floor(Math.random() * pool.length)], q + 1));
      what = 'some trade goods'; break;
    }
    case 'shard_common': for (let i = 0; i < 2 + q; i++) spawnPickup('SHARD', at(), 0); what = 'shards'; break;
    case 'shard_rare': for (let i = 0; i < 1 + q; i++) spawnPickup('SHARD', at(), 1); what = 'rare shards'; break;
    case 'shard_epic': spawnPickup('SHARD', at(), 2); what = 'an epic shard'; break;
    case 'core': give(makeItemById('upgrade_core', 1)[0]); what = 'an Upgrade Core'; break;
    case 'core2': give(makeItemById('upgrade_core_2', 1)[0]); what = 'a Refined Core'; break;
    case 'medal': { const m = LOOT_BY_ID['champion_medal']; if (m) give(lootItem(m, 1)); what = "a Champion's Medal"; break; }
  }
  notify(`Captive freed! "Thank you, guard! Take ${what}, I will tell everyone in Aether."`, '#ffd24a');
  events.emit('floatText', { pos: world.player.pos, text: 'OBJECTIVE!', color: 0xffd24a, scale: 1.1, dy: 2.4 });
}

/** Healing multiplier of the current room (Cursed Ground). */
export const healMul = (): number => (world.roomEvt.twist === 'CURSED' && world.director.phase === 'FIGHT' ? 0.35 : 1);

// Golden Hour: monsters drop extra gold
events.on('enemyDeath', (d) => {
  if (world.roomEvt.twist !== 'GOLDEN' || d.poof) return;
  if (Math.random() < 0.6) { tmp.set(d.pos.x + (Math.random() - 0.5), 0, d.pos.z + (Math.random() - 0.5)); spawnPickup('GOLD', tmp, 3 + Math.round(world.director.wave * 0.5)); }
});
