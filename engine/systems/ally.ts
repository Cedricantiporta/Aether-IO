// ============================================================================
// Ally encounter: once per biome, in one randomly picked normal combat room, an adventurer (a KayKit knight / ranger /
// mage) strides in beside the hero with a short line, fights the room's monsters alongside the hero, and after the
// room is cleared says goodbye and fades away.
//
// The ally lives in a world.minions slot (src = SRC_ALLY), so monsters already aggro on it (enemies.ts minionTarget)
// and can hurt it (damageMinion -> allyHurt). It is NOT invulnerable: when its HP runs out it says a line and
// retreats (untargetable) instead of dying. updateMinions skips ally slots and calls updateAlly instead;
// render/Ally.tsx draws it from the slot (position / swing / hit) and `ally` (name, speech line, fade).
// Pure TS (no React). No per-frame allocations.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { runInfo } from '../runMods';
import { damageEnemy, damageEnemiesInRadius, type DamageOpts } from './combat';
import { spawnProjectile } from './projectiles';
import { heroTrailAt } from './heroTrail';
import { isSpawnable } from './enemies';
import { PREBOSS_INDEX } from '../roomDefs';
import type { CharKey } from '../../render/characters';

/** minion.src of the ally (minions.ts skips it; the necromancer caps use other values). */
export const SRC_ALLY = 6;

export interface AllyDef {
  id: string; name: string; title: string; model: CharKey; tint: string; accent: string;
  style: 'MELEE' | 'BOW' | 'MAGE';
  hello: string; bye: string; fall: string;
}
export const ALLIES: readonly AllyDef[] = [
  { id: 'CORWIN', name: 'Ser Corwin', title: 'Wandering Knight', model: 'KNIGHT', tint: '#b8c4d8', accent: '#c8d4e6', style: 'MELEE',
    hello: 'Need a hand? I\'ve got your back!', bye: 'Well fought! Stay sharp, friend.', fall: 'Argh! I must fall back. Finish it!' },
  { id: 'TAMSIN', name: 'Tamsin', title: 'Ranger of the Wild', model: 'ARCHER', tint: '#c8e0b0', accent: '#9bd26a', style: 'BOW',
    hello: 'Mind if I join? I never miss.', bye: 'Easy work. See you down the road!', fall: 'Too many of them! Retreating!' },
  { id: 'ORLEN', name: 'Orlen', title: 'Hedge Mage', model: 'WIZARD', tint: '#d8c0ff', accent: '#c8a8ff', style: 'MAGE',
    hello: 'Stand behind me... no, beside me. Let us burn them!', bye: 'A fine display. Farewell, hero!', fall: 'My wards are spent! I must flee!' },
];

/** The ally in the current room (render reads it). `slot` = its world.minions index. */
export const ally = { on: false, slot: -1, def: 0, phase: 0 as 0 | 1 | 2, t: 0, say: '', sayT: 0, fade: 0, ver: 0, force: false };
const FIGHT = 0, GOODBYE = 1, FLEE = 2;   // phases: fighting / room cleared (walking off) / HP gone (retreating)
const LEAVE_T = 2.6;
const DMG_FRAC = 0.5;   // of the hero's damage stat (the brief: 40-60% of a basic attack)

const ids: number[] = [];
const trailPt = new Float32Array(2);
const tmp = new Vector3();
const hitO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.4 };
const cleaveO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.7 };
const boltO = { life: 0.8, pierce: 1, radius: 0.9, y: 1.2 };
const arrowO = { life: 0.6, pierce: 1, radius: 0.6, y: 1.4 };
let doneBiome = -1;   // the biome that already had its ally

export function resetAlly(): void { removeAlly(); doneBiome = -1; }
/** Drops the ally (room change / reset / death). */
export function removeAlly(): void {
  if (ally.slot >= 0) { const m = world.minions[ally.slot]; if (m && m.src === SRC_ALLY) m.active = false; }
  if (ally.on) { ally.on = false; ally.ver++; }
  ally.slot = -1;
}

function say(text: string, t = 3.6): void { ally.say = text; ally.sayT = t; }

function spawnAlly(): boolean {
  const M = world.minions, pl = world.player;
  let k = -1;
  for (let i = 0; i < M.length; i++) if (!M[i].active) { k = i; break; }
  if (k < 0) return false;
  let x = pl.pos.x + 2.5, z = pl.pos.z - 1;
  for (let t = 0; t < 16; t++) {   // a free spot a few steps from the hero
    const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 2;
    const cx = pl.pos.x + Math.sin(a) * d, cz = pl.pos.z + Math.cos(a) * d;
    if (isSpawnable(cx, cz)) { x = cx; z = cz; break; }
  }
  const st = useGameStore.getState(), s = st.stats;
  const m = M[k];
  m.active = true; m.kind = 0; m.src = SRC_ALLY; m.x = x; m.z = z; m.facing = Math.atan2(pl.pos.x - x, pl.pos.z - z);
  m.life = m.maxLife = Infinity; m.born = 0; m.atkT = 0.8; m.tgt = -1; m.retarget = 0; m.shield = 0; m.shieldT = 0;
  m.rise = 0; m.swing = 0; m.slot = Math.random() * Math.PI * 2; m.hitT = 0; m.walk = 0; m.mv = 0; m.spin = 0;
  m.skillT = 2 + Math.random() * 2;
  m.dmg = Math.max(4, s.damage * DMG_FRAC);
  m.hp = m.maxHp = Math.max(120, s.maxHealth * 3);   // (owner) helpers last twice as long
  m.def = 0.2;
  ally.def = Math.floor(Math.random() * ALLIES.length);
  ally.on = true; ally.slot = k; ally.phase = FIGHT; ally.t = 0; ally.fade = 0; ally.ver++;
  const d = ALLIES[ally.def];
  say(d.hello, 4);
  st.addNotification(`${d.name}, ${d.title}, joins the fight!`, d.accent, 'SYSTEM');
  events.emit('explosion', { pos: tmp.set(x, 0, z).clone(), radius: 1.6, color: 0xfff3c4 });
  return true;
}

/**
 * A run room was entered (director.enterRoom). Once per biome one normal combat room (random: the chance rises as the
 * biome's rooms run out, certain by depth 14) gets the ally. `ok` = ADVENTURE run, not a gate/final/dream/epilogue room.
 */
export function maybeAlly(biome: number, index: number, type: string, ok: boolean): void {
  if (!ok || runInfo.mode !== 'ADVENTURE') return;
  const forced = ally.force && (type === 'COMBAT' || type === 'ELITE' || type === 'MINIBOSS');
  if (type !== 'COMBAT' && !forced) return;   // normal combat rooms only (never boss / miniboss / camp / merchant / treasure)
  if (!forced) {
    if (index < 1 || index >= PREBOSS_INDEX + 4 || biome === doneBiome) return;
    if (Math.random() >= 1 / Math.max(1, PREBOSS_INDEX + 4 - index)) return;
  }
  ally.force = false;
  if (spawnAlly() && !forced) doneBiome = biome;
}

/** Debug: put the ally into the current fight now (returns true), or, when there is no fight to join, into the next combat room. */
export function debugAlly(): boolean {
  const d = world.director;
  if (runInfo.mode === 'ADVENTURE' && world.room.active && d.phase === 'FIGHT' && !world.room.plan.dream && !world.room.plan.epilogue && world.room.plan.type !== 'BOSS') {
    removeAlly(); ally.force = false; return spawnAlly();
  }
  ally.force = true; return false;
}

/** A monster hit the ally (minions.damageMinion). At 0 HP it retreats instead of dying. */
export function allyHurt(m: (typeof world.minions)[number], dmg: number): void {
  if (ally.phase !== FIGHT || m.rise > 0) return;
  m.hitT = 0.25;
  let hit = dmg * (1 - m.def);
  if (m.shield > 0) { const a = Math.min(m.shield, hit); m.shield -= a; hit -= a; }
  m.hp -= hit;
  if (m.hp <= 0) {
    m.hp = 0; m.rise = 1;   // untargetable from now on (nearestMinion / damageMinion skip rising minions)
    ally.phase = FLEE; ally.t = 0; say(ALLIES[ally.def].fall, 3);
  }
}

export function updateAlly(dt: number): void {
  if (!ally.on) return;
  const m = world.minions[ally.slot], pl = world.player;
  if (!m || !m.active || m.src !== SRC_ALLY || !pl.alive || !world.room.active) { removeAlly(); return; }
  ally.t += dt;
  if (ally.sayT > 0) ally.sayT -= dt;
  if (m.swing > 0) m.swing = Math.max(0, m.swing - dt * 2.4);
  if (m.hitT > 0) m.hitT -= dt;
  if (m.shieldT > 0) { m.shieldT -= dt; if (m.shieldT <= 0) m.shield = 0; }
  if (m.skillT > 0) m.skillT -= dt;
  if (m.spin > 0) m.spin = Math.max(0, m.spin - dt * 2.5);
  const def = ALLIES[ally.def], melee = def.style === 'MELEE', bow = def.style === 'BOW';

  if (ally.phase === FIGHT && world.director.phase === 'CLEARED') { ally.phase = GOODBYE; ally.t = 0; say(def.bye, 3); }
  if (ally.phase !== FIGHT) {   // saying goodbye / retreating: walk away from the hero and fade
    ally.fade = Math.max(0, Math.min(1, (LEAVE_T - ally.t) / 1.0));
    const dx = m.x - pl.pos.x, dz = m.z - pl.pos.z, d = Math.hypot(dx, dz) || 1, sp = ally.phase === FLEE ? 7 : 3.2;
    if (ally.t > (ally.phase === FLEE ? 0 : 0.8)) { m.x += (dx / d) * sp * dt; m.z += (dz / d) * sp * dt; m.mv += (1 - m.mv) * Math.min(1, dt * 8); m.facing = Math.atan2(dx, dz); }
    else { m.mv += (0 - m.mv) * Math.min(1, dt * 8); m.facing = Math.atan2(-dx, -dz); }   // (a beat facing the hero while talking)
    m.walk += dt * sp * m.mv * 1.6;
    if (ally.t >= LEAVE_T) removeAlly();
    return;
  }
  ally.fade = Math.min(1, ally.fade + dt * 2);

  const reach = melee ? 1.7 : bow ? 11 : 9, speed = melee ? 8.2 : 7.6, cd = melee ? 0.8 : bow ? 0.85 : 1.0;
  // target: the nearest enemy within 16 (re-picked every 0.3 s)
  m.retarget -= dt;
  let e = m.tgt >= 0 ? world.enemies[m.tgt] : null;
  if (!e || !e.active || e.state === 'DYING' || m.retarget <= 0) {
    m.retarget = 0.3; m.tgt = -1; e = null;
    const found = world.enemyGrid.query(m.x, m.z, 16, ids);
    let bd = 1e9;
    for (let k = 0; k < found.length; k++) {
      const c = world.enemies[found[k]];
      if (!c.active || c.state === 'DYING' || c.state === 'SPAWN' || c.hideT > 0) continue;
      const d2 = (c.pos.x - m.x) ** 2 + (c.pos.z - m.z) ** 2;
      if (d2 < bd) { bd = d2; m.tgt = c.id; e = c; }
    }
  }
  let tx: number, tz: number, stop: number;
  if (e) { tx = e.pos.x; tz = e.pos.z; stop = reach * (melee ? 1 : 0.8) + e.radius * 0.8; }
  else {   // trail the hero at their shoulder
    heroTrailAt(0.6, trailPt);
    tx = trailPt[0] + Math.cos(m.slot) * 2.6; tz = trailPt[1] + Math.sin(m.slot) * 2.6; stop = 0.6;
  }
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d > 30) { m.x = pl.pos.x; m.z = pl.pos.z; return; }   // left far behind: catch up
  let mv = 0;
  if (d > stop) { const s = Math.min(d - stop, speed * dt); m.x += (dx / d) * s; m.z += (dz / d) * s; mv = dt > 0 ? s / (speed * dt) : 0; }
  else if (e && !melee && d < reach * 0.35) { const s = speed * 0.8 * dt; m.x -= (dx / (d || 1)) * s; m.z -= (dz / (d || 1)) * s; mv = 0.8; }   // ranged allies back off from point-blank
  // bodies: never stand inside a monster
  const near = world.enemyGrid.query(m.x, m.z, 6.6, ids);
  for (let k = 0; k < near.length; k++) {
    const c = world.enemies[near[k]];
    if (!c.active || c.state === 'DYING' || c.hideT > 0) continue;
    const ox = m.x - c.pos.x, oz = m.z - c.pos.z, min = 0.55 + c.radius * 0.9, o2 = ox * ox + oz * oz;
    if (o2 < min * min) { const od = Math.sqrt(o2) || 0.001, push = min - od; m.x += ox / od * push; m.z += oz / od * push; }
  }
  m.mv += (mv - m.mv) * Math.min(1, dt * 10);
  m.walk += dt * speed * m.mv * 1.6;
  if (e && d > 0.05) m.facing = Math.atan2(dx, dz); else if (d > 0.3) m.facing = Math.atan2(dx, dz);
  m.atkT -= dt;
  if (e && d <= stop + 0.3 && m.atkT <= 0) {
    m.atkT = cd; m.swing = 1;
    const nx = dx / (d || 1), nz = dz / (d || 1);
    if (melee) {
      if (m.skillT <= 0) {   // knight skill: a spinning cleave around him
        m.skillT = 5; m.spin = 1; m.swing = 0;
        damageEnemiesInRadius(m.x, m.z, 2.8, m.dmg * 1.8, cleaveO);
        events.emit('shockwave', { pos: tmp.set(m.x, 0, m.z).clone(), radius: 2.8, color: 0xdfe8f6 });
      } else damageEnemy(e, m.dmg, hitO);
    } else if (bow) {
      const p = spawnProjectile('ARROW', m.x, m.z, nx, nz, 32, m.dmg, arrowO);
      if (p) p.tint = 10;   // tint 10 = minion shot: pet damage, no hero procs
    } else {
      const p = spawnProjectile('PET_BOLT', m.x, m.z, nx, nz, 22, m.dmg * 1.1, boltO);
      if (p) p.tint = 9;
    }
  }
}
