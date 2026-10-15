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
import { useGameStore } from '../../store';
import type { RoomPlan } from '../types';
import { spawnEnemy } from './enemies';
import { spawnPickup } from './pickups';
import { damagePlayer, damageEnemiesInRadius } from './combat';
import { stationPos, startPos } from '../roomgen';
import { queryColliders, type Collider } from '../mapgen';
import { OBJ_NAME } from '../roomDefs';
import { isStationary } from '../enemyDefs';

const E = () => world.roomEvt;
const tmp = new Vector3();
const colOut: Collider[] = [];
const notify = (msg: string, color = '#f1d58e') => useGameStore.getState().addNotification(msg, color, 'SYSTEM');

const GOBLIN_TIME = 15, HUNT_TIME = 30, TRAP_PERIOD = 3.2, TRAP_WARN = 2.1, TRAP_FIRE = 2.75, TRAP_R = 1.7;

export function resetRoomEvent(): void {
  const e = E();
  e.obj = ''; e.twist = ''; e.state = 0; e.hp = 0; e.maxHp = 1; e.t = 0; e.tmax = 0; e.enemy = -1; e.nTraps = 0; e.hurtT = 0;
}

/** Room entry: set up this room's objective / twist. */
export function startRoomEvent(plan: RoomPlan): void {
  resetRoomEvent();
  const e = E();
  e.obj = plan.obj ?? ''; e.twist = plan.twist ?? '';
  if (!e.obj && !e.twist) return;
  const [cx, cz] = stationPos(world.room.radius);
  e.x = cx; e.z = cz;
  if (e.obj) {
    e.state = 1;
    if (e.obj === 'DEFEND' || e.obj === 'RESCUE') { e.maxHp = e.hp = e.obj === 'DEFEND' ? 100 : 80; }
    if (e.obj === 'GOBLIN') e.tmax = GOBLIN_TIME;
    if (e.obj === 'HUNT') e.tmax = HUNT_TIME;
    notify(`Objective: ${OBJ_NAME[e.obj]}`);
  }
  if (e.twist === 'TRAPS') placeTraps();
}

function placeTraps(): void {
  const e = E(), R = world.room.radius;
  const [sx, sz] = startPos(R);
  let n = 0;
  for (let t = 0; t < 200 && n < 8; t++) {
    const a = Math.random() * Math.PI * 2, d = 4 + Math.sqrt(Math.random()) * (R * 0.7 - 4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - sx, z - sz) < 6) continue;   // never under the hero's arrival
    if (queryColliders(x, z, TRAP_R + 0.6, colOut).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + TRAP_R)) continue;
    let ok = true;
    for (let k = 0; k < n; k++) if (Math.hypot(e.traps[k].x - x, e.traps[k].z - z) < TRAP_R * 2.6) { ok = false; break; }
    if (!ok) continue;
    const tr = e.traps[n++]; tr.x = x; tr.z = z; tr.t = Math.random() * TRAP_PERIOD; tr.hit = false;
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
      for (const m of world.enemies) {
        if (!m.active || m.state === 'DYING' || m.state === 'SPAWN' || m.boss || m.mini || isStationary(m.kind)) continue;
        const dx = e.x - m.pos.x, dz = e.z - m.pos.z, d = Math.hypot(dx, dz) || 0.01;
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
        tmp.set(Math.cos(a) * R * 0.45, 0, Math.sin(a) * R * 0.45);
        const g = spawnEnemy('GOBLIN', tmp);
        if (g) {
          g.maxHp = g.hp = Math.round(g.maxHp * 5); g.contactDamage = 0; g.scale *= 1.25; g.elite = false;
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
          // flee: away from the hero, faster than it chases, kept inside the room
          const dx = g.pos.x - pl.pos.x, dz = g.pos.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
          const s = 7.5 * dt * (d < 10 ? 1 : 0.6);
          let nx = g.pos.x + (dx / d) * s, nz = g.pos.z + (dz / d) * s;
          const R = world.room.radius * 0.78, r = Math.hypot(nx, nz);
          if (r > R) { const a = Math.atan2(nz, nx) + 0.9 * dt * 3; nx = Math.cos(a) * R; nz = Math.sin(a) * R; }   // slide along the rim
          g.pos.x = nx; g.pos.z = nz; g.facing = Math.atan2(dx, dz);
        }
      }
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
  if (e.twist === 'TRAPS' && fighting) {
    for (let i = 0; i < e.nTraps; i++) {
      const tr = e.traps[i];
      tr.t += dt;
      if (tr.t >= TRAP_PERIOD) { tr.t -= TRAP_PERIOD; tr.hit = false; }
      if (tr.t >= TRAP_FIRE && !tr.hit) {
        tr.hit = true;
        if (pl.alive && Math.hypot(pl.pos.x - tr.x, pl.pos.z - tr.z) < TRAP_R) { tmp.set(tr.x, 0, tr.z); damagePlayer(useGameStore.getState().stats.maxHealth * 0.12, { pos: tmp }); }
        damageEnemiesInRadius(tr.x, tr.z, TRAP_R, Math.max(20, useGameStore.getState().stats.damage * 2.5), { kind: 'PHYSICAL', source: 'PLAYER' });
      }
    }
  }
}

/** The room was cleared: totems / captives that held count now. */
export function roomEventCleared(): void {
  const e = E();
  if (e.state === 1 && e.obj === 'DEFEND') { e.state = 2; reward(40 + e.hp * 0.4, e.hp > 60 ? 5 : 3, `The totem stands (${Math.round(e.hp)}%)! Its blessing pours out.`); }
  else if (e.state === 1 && e.obj === 'RESCUE') { e.state = 4; notify('Free the captive: press E at the cage.'); }
  else if (e.state === 1) fail(e.obj === 'GOBLIN' ? 'The goblin escaped with its gold.' : 'The bounty got away.');
  if (e.twist === 'CURSED') { tmp.set(world.player.pos.x, 0, world.player.pos.z + 1.2); spawnPickup('GEM', tmp, 4); notify('The curse lifts: gems for your trouble.', '#c58bff'); }
}

/** E at the cage after the room is clear. */
export function freeCaptive(): void {
  const e = E();
  if (e.obj !== 'RESCUE' || e.state !== 4) return;
  e.state = 2;
  reward(50, 5, 'Captive freed! "Thank you, guard! Take this, I will tell everyone in Aether."');
  events.emit('captiveFreed', {});
  useGameStore.getState().addMaterial('RARE', 2);
}

/** Healing multiplier of the current room (Cursed Ground). */
export const healMul = (): number => (world.roomEvt.twist === 'CURSED' && world.director.phase === 'FIGHT' ? 0.35 : 1);

// Golden Hour: monsters drop extra gold
events.on('enemyDeath', (d) => {
  if (world.roomEvt.twist !== 'GOLDEN' || d.poof) return;
  if (Math.random() < 0.6) { tmp.set(d.pos.x + (Math.random() - 0.5), 0, d.pos.z + (Math.random() - 0.5)); spawnPickup('GOLD', tmp, 3 + Math.round(world.director.wave * 0.5)); }
});
