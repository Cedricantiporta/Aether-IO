// Necromancer minions: skeleton warriors (melee), skeleton mages (soul bolts), skeleton bowmen (bone arrows, wand perk)
// and the bone golem (big melee, ultimate).
// A fixed pool in world.minions; each minion hunts the nearest enemy (spatial grid), otherwise trails the hero, and
// stays until its HP is gone. Nearby monsters attack minions before the hero (enemies.ts
// minionTarget), so the skeletons hold the line.
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { damageEnemy, damageEnemiesInRadius, healPlayer, boneArmorMul, applyStatus, type DamageOpts } from './combat';
import type { Enemy } from '../types';
import { inCurse } from './zones';
import { abilityState } from './abilities';
import { spawnProjectile } from './projectiles';
import { weaponPerk, hordeMul } from '../../weaponPerks';

export const MINION_WARRIOR = 0, MINION_MAGE = 1, MINION_GOLEM = 2, MINION_ARCHER = 3;
/** Skeleton warriors alive at once (Raise Dead, Grave Call, Plague Ground, the ult army): the oldest crumbles. */
export const MAX_SKELETONS = 5;
/** Summon sources (minion.src), each with its own cap so they never push each other out:
 *  1 Raise Dead (5, permanent), 3 Plague Ground (5 warriors that crumble after 7 s), 4 weapon perk / Grave Call (2),
 *  2 the ult's bone golem (no skeleton cap). */
export const SRC_RAISE = 1, SRC_ULT = 2, SRC_PLAGUE = 3, SRC_WEAPON = 4;
const SRC_CAP = [MAX_SKELETONS, MAX_SKELETONS, 0, 5, 2];
export const PLAGUE_LIFE = 7;
const skN = [0, 0, 0, 0];   // live skeletons per minion kind within one source (scratch)
const SK_KINDS = [MINION_WARRIOR, MINION_ARCHER, MINION_MAGE];
function countSkeletons(src: number): number { skN[0] = skN[1] = skN[2] = skN[3] = 0; let n = 0; for (const m of world.minions) if (m.active && m.kind !== MINION_GOLEM && m.src === src) { skN[m.kind]++; n++; } return n; }
/** The next Raise Dead skeleton: a random warrior / archer / mage, but the army always holds at least one of each
 *  (a missing kind rises first). Recasting re-rolls the army: each new skeleton replaces the oldest one that isn't
 *  the last of its kind (spawnMinion). */
export function pickRaiseKind(): number {
  countSkeletons(SRC_RAISE);
  let miss = 0;
  for (const k of SK_KINDS) if (skN[k] === 0) miss++;
  if (miss > 0) { let r = Math.floor(Math.random() * miss); for (const k of SK_KINDS) if (skN[k] === 0 && r-- === 0) return k; }
  return SK_KINDS[Math.floor(Math.random() * 3)];
}
const ids: number[] = [];
const hitO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.3 };
const cleaveO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.6 };
const tmp = new Vector3();

/** Damage / HP (life) multiplier from talents and the wand perk. */
function minionMul(): { dmg: number; life: number; haste: number } {
  const st = useGameStore.getState(), s = st.stats, wp = weaponPerk(st.equipment.weapon);
  const h = wp?.k === 'HORDE' ? hordeMul(wp.lv) : 1;
  return { dmg: (1 + (s.minionDmg || 0)) * h, life: h, haste: 1 + (s.minionHaste || 0) };
}

/** Summons are permanent: they stay until slain (life 0 = permanent). */
export const PERMANENT = 0;
/** Skeleton tuning: move speed x0.8, damage x0.7, attack speed x0.7 (attack interval / 0.7). */
const SPEED_MUL = 0.8, DMG_MUL = 0.7, ATK_SPD_MUL = 0.7;
let bornSeq = 0;
let ultHold = 0;   // the ult cooldown frozen while the ult army stands

/** Raises a minion at (x, z). dmg = damage per hit (before talents), life in seconds (PERMANENT = until slain).
 *  src 1 = Raise Dead, 2 = Army of the Dead (their cooldowns only start once all of those minions are gone). */
export function spawnMinion(kind: number, x: number, z: number, dmg: number, life: number, src = 0, dropped = false): void {
  const M = world.minions, mm = minionMul();
  // too many skeletons: the oldest one crumbles to make room
  if (kind !== MINION_GOLEM) {   // (each summon source has its own cap)
    const n = countSkeletons(src);
    if (n >= (SRC_CAP[src] ?? MAX_SKELETONS)) {   // full: the oldest skeleton of this source that isn't the last of its kind crumbles
      let any = -1, aOl = 1e9, same = -1, sOl = 1e9, oldest = -1, ol = 1e9;
      for (let i = 0; i < M.length; i++) {
        const m = M[i]; if (!m.active || m.kind === MINION_GOLEM || m.src !== src) continue;
        if (m.born < ol) { ol = m.born; oldest = i; }
        if ((skN[m.kind] > 1 || m.kind === kind) && m.born < aOl) { aOl = m.born; any = i; }
        if (m.kind === kind && m.born < sOl) { sOl = m.born; same = i; }
      }
      const k = any >= 0 ? any : same >= 0 ? same : oldest;
      if (k >= 0) crumble(M[k]);
    }
  }
  const m = M.find((o) => !o.active);
  if (!m) return;
  m.active = true; m.kind = kind; m.x = x; m.z = z; m.facing = world.player.facing;
  m.life = m.maxLife = life <= 0 ? Infinity : dropped ? life : life * mm.life;   // (the ult golem lasts exactly its timer)
  m.dmg = dmg * mm.dmg * DMG_MUL * (kind === MINION_GOLEM ? 1.04 : 1);   // (the bone golem hits 4% harder: 1.3 x 0.8)
  m.src = src; m.born = ++bornSeq; m.atkT = 0.4 + Math.random() * 0.3; m.tgt = -1; m.retarget = 0;
  m.rise = dropped ? 0 : 0.6; m.swing = 0; m.slot = Math.random() * Math.PI * 2; m.hitT = 0; m.walk = 0; m.mv = 0;
  // HP from the hero's max HP (golems are the tanks, mages are frail)
  const st = useGameStore.getState().stats;
  // skeleton warriors grow with Raise Dead's level: +10% HP and +4% damage reduction per level (max 40%)
  const rdLv = Math.max(1, useGameStore.getState().skillLevels.q || 1), warrior = kind === MINION_WARRIOR;
  m.hp = m.maxHp = st.maxHealth * (kind === MINION_GOLEM ? 1.6 * 1.3 : warrior ? 0.5 * (src === 1 ? 1.3 : 1) : 0.3)   // Raise Dead skeletons +30% HP
    * 1.2                                                    // every summon +20% HP
    * (warrior ? 1 + 0.1 * (rdLv - 1) : 1)
    * (1 + (st.minionLife || 0) * 0.1) * mm.life;   // minionLife talent: +10% HP per point; HORDE perk too
  m.def = warrior ? Math.min(0.4, 0.04 * (rdLv - 1)) : kind === MINION_GOLEM ? 0.15 : 0;
  m.skillT = 1.5 + Math.random() * 2; m.spin = 0;
  if (!dropped) events.emit('explosion', { pos: tmp.set(x, 0, z).clone(), radius: kind === MINION_GOLEM ? 3 : 1.4, color: 0x9a6bd8 });
}

function crumble(m: (typeof world.minions)[number]): void {
  m.active = false;
  events.emit('explosion', { pos: tmp.set(m.x, 0, m.z).clone(), radius: m.kind === MINION_GOLEM ? 2.5 : 1.2, color: 0xd8d0b8 });
}

/** A monster hits minion i (melee or projectile). Bone Armor-free: minions take the full hit. */
export function damageMinion(i: number, dmg: number): void {
  const m = world.minions[i];
  if (!m || !m.active || m.rise > 0) return;
  m.hp -= dmg * (1 - m.def) * boneArmorMul(); m.hitT = 0.25;   // armour + Bone Armor
  if (m.hp <= 0) crumble(m);
}

/** The nearest risen minion within r of (x, z), or -1 (monsters use it to pick a target). */
export function nearestMinion(x: number, z: number, r: number): number {
  const M = world.minions;
  let best = -1, bd = r * r;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.rise > 0) continue;
    const d = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---- skeleton skills (shared scratch: no per-cast allocation)
const burnFx = { type: 'BURN' as const, duration: 3, value: 4 };
const zapOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PET' };
const zapStun = { type: 'STUN' as const, duration: 0.3 };
const zapHit: number[] = [];
const zapIds: number[] = [];
/** Skeleton mage: lightning from (x, z) into `first`, then jumping to the nearest unhit enemy within 7 (4 targets, -15% per jump). */
function chainLightning(x: number, z: number, first: Enemy, dmg: number): void {
  zapHit.length = 0;
  let cur: Enemy | null = first, fromX = x, fromZ = z;
  for (let j = 0; j < 4 && cur; j++) {
    zapHit.push(cur.id);
    events.emit('lightning', { from: tmp.set(fromX, 1.4, fromZ).clone(), to: cur.pos });
    damageEnemy(cur, dmg * (1 - j * 0.15), zapOpts);
    applyStatus(cur, zapStun);
    fromX = cur.pos.x; fromZ = cur.pos.z;
    const found = world.enemyGrid.query(fromX, fromZ, 7, zapIds);
    let next: Enemy | null = null, bd = 1e9;
    for (let k = 0; k < found.length; k++) {
      const c = world.enemies[found[k]];
      if (!c.active || c.state === 'DYING' || c.state === 'SPAWN' || zapHit.includes(c.id)) continue;
      const dd = (c.pos.x - fromX) ** 2 + (c.pos.z - fromZ) ** 2;
      if (dd < bd) { bd = dd; next = c; }
    }
    cur = next;
  }
}

export function clearMinions(): void { for (const m of world.minions) m.active = false; }
export function minionCount(kind = -1, src = -1): number { let n = 0; for (const m of world.minions) if (m.active && (kind < 0 || m.kind === kind) && (src < 0 || m.src === src)) n++; return n; }

export function updateMinions(dt: number): void {
  const M = world.minions, pl = world.player, haste = minionMul().haste;
  let slotI = 0, army = false;
  for (let i = 0; i < M.length; i++) if (M[i].active && M[i].src === 2) { army = true; break; }
  // Army of the Dead: the ultimate's cooldown stays full until the whole army has fallen
  if (army) { if (ultHold <= 0) ultHold = abilityState.ultCd; abilityState.ultCd = ultHold; } else ultHold = 0;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active) continue;
    m.life -= dt;
    if (m.life <= 0 || !pl.alive) { crumble(m); continue; }
    if (m.rise > 0) { m.rise -= dt; m.mv = 0; continue; }   // still clawing out of the ground
    if (m.swing > 0) m.swing = Math.max(0, m.swing - dt * 2.4);
    if (m.hitT > 0) m.hitT -= dt;
    if (m.spin > 0) m.spin = Math.max(0, m.spin - dt * 2.5);
    if (m.skillT > 0) m.skillT -= dt;
    const golem = m.kind === MINION_GOLEM, mage = m.kind === MINION_MAGE, bow = m.kind === MINION_ARCHER;
    const reach = golem ? 3.2 : mage ? 10 : bow ? 13 : 1.5, speed = (golem ? 6 : mage || bow ? 7.5 : 8.5) * SPEED_MUL, cd = (golem ? 1.3 : mage ? 1.1 : bow ? 0.95 : 0.85) / (haste * ATK_SPD_MUL);
    // target: the nearest enemy within 16 of the minion (re-picked every 0.3 s)
    m.retarget -= dt;
    let e = m.tgt >= 0 ? world.enemies[m.tgt] : null;
    if (!e || !e.active || e.state === 'DYING' || m.retarget <= 0) {
      m.retarget = 0.3; m.tgt = -1; e = null;
      const found = world.enemyGrid.query(m.x, m.z, 16, ids);
      let bd = 1e9;
      for (let k = 0; k < found.length; k++) {
        const c = world.enemies[found[k]];
        if (!c.active || c.state === 'DYING' || c.state === 'SPAWN' || c.hideT > 0) continue;
        const d = (c.pos.x - m.x) ** 2 + (c.pos.z - m.z) ** 2;
        if (d < bd) { bd = d; m.tgt = c.id; e = c; }
      }
    }
    let tx: number, tz: number, stop: number;
    if (e) { tx = e.pos.x; tz = e.pos.z; stop = reach + e.radius * 0.8; }
    else {   // trail the hero in a loose ring
      const a = m.slot + slotI++ * 0.9;
      tx = pl.pos.x + Math.cos(a) * 3.2; tz = pl.pos.z + Math.sin(a) * 3.2; stop = 0.6;
    }
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d > 30) { m.x = pl.pos.x; m.z = pl.pos.z; continue; }   // left far behind (room change): catch up
    let mv = 0;
    if (d > stop) {
      const s = Math.min(d - stop, speed * dt);
      m.x += (dx / d) * s; m.z += (dz / d) * s;
      mv = dt > 0 ? s / (speed * dt) : 0;
    }
    m.mv += (mv - m.mv) * Math.min(1, dt * 10);
    m.walk += dt * speed * m.mv * (golem ? 0.9 : 1.6);
    if (d > 0.05) m.facing = Math.atan2(dx, dz);
    m.atkT -= dt;
    if (e && d <= stop + 0.3 && m.atkT <= 0) {
      m.atkT = cd; m.swing = 1;
      if (mage && m.skillT <= 0) {   // skeleton mage skill: CHAIN LIGHTNING, jumps through up to 4 enemies (brief stun)
        m.skillT = 7 / haste; m.spin = 1;
        chainLightning(m.x, m.z, e, m.dmg * 1.3);
      } else if (mage) {
        const p = spawnProjectile('PET_BOLT', m.x, m.z, dx / d, dz / d, 22, m.dmg, { life: 0.8, pierce: 1, radius: 0.9, y: 1.2 });
        if (p) p.tint = 9;
      } else if (bow && m.skillT <= 0) {   // skeleton archer skill: BURNING ARROW, a heavy shot that sets the target ablaze and leaves a burning patch
        m.skillT = 6 / haste;
        const p = spawnProjectile('BURNING_ARROW', m.x, m.z, dx / d, dz / d, 30, m.dmg * 1.8, { life: 0.8, pierce: 1, radius: 0.8, y: 1.4 });
        // tint 10 = minion shot (pet damage, no hero procs); state 2 = leaves a burning patch where it lands (projectiles fanPatch)
        if (p) { burnFx.value = Math.max(2, m.dmg * 0.35); p.effect = burnFx; p.tint = 10; p.state = 2; }
      } else if (bow) {   // bone arrow (tint 10 = minion arrow: pet damage, violet-white glow)
        const p = spawnProjectile('ARROW', m.x, m.z, dx / d, dz / d, 32, m.dmg, { life: 0.6, pierce: 1, radius: 0.6, y: 1.4 });
        if (p) p.tint = 10;
      } else {
        hitO.knockback = golem ? 1.2 : 0.3;
        if (!golem && m.skillT <= 0) {   // skeleton skill: CLEAVE, a spinning swing that hits everything close (small AoE)
          m.skillT = 5 / haste; m.spin = 1; m.swing = 0;
          cleaveO.knockback = 0.6;
          damageEnemiesInRadius(m.x, m.z, 2.8, m.dmg * 2, cleaveO);
          events.emit('shockwave', { pos: tmp.set(m.x, 0, m.z).clone(), radius: 2.8, color: 0xc9b8ff });
        } else damageEnemy(e, m.dmg, hitO);
        if (golem) events.emit('shockwave', { pos: tmp.set(e.pos.x, 0, e.pos.z).clone(), radius: 2.2, color: 0xb8a888 });
      }
    }
  }
}

// ---- necromancer passives that react to kills
events.on('enemyDeath', (d) => {
  const st = useGameStore.getState();
  if (st.hero !== 'NECROMANCER' || d.poof) return;
  const pl = world.player, lv = st.skillLevels;
  // Plague Ground: every enemy that dies in it rises as a skeleton warrior for 7 s (up to 5 at a time)
  if (lv.s4 > 0 && inCurse(d.pos.x, d.pos.z)) {
    spawnMinion(MINION_WARRIOR, d.pos.x, d.pos.z, st.stats.damage * 0.8 * (1 + 0.2 * (lv.s4 - 1)), PLAGUE_LIFE, SRC_PLAGUE);
  }
  // Soul Harvest: kills near you (or near a minion) restore HP and mana
  if (lv.soulHarvest > 0 && pl.alive) {
    let near = (d.pos.x - pl.pos.x) ** 2 + (d.pos.z - pl.pos.z) ** 2 < 14 * 14;
    if (!near) for (const m of world.minions) if (m.active && (d.pos.x - m.x) ** 2 + (d.pos.z - m.z) ** 2 < 36) { near = true; break; }
    if (near) {
      healPlayer(st.stats.maxHealth * (0.01 + 0.005 * (lv.soulHarvest - 1)));
      pl.mana = Math.min(st.stats.maxMana, pl.mana + 2 + (lv.soulHarvest - 1));
    }
  }
});
