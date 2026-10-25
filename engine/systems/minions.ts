// Necromancer minions: skeleton warriors (melee), skeleton mages (soul bolts), skeleton bowmen (bone arrows, wand perk)
// and the bone golem (big melee, ultimate).
// A fixed pool in world.minions; each minion hunts the nearest enemy (spatial grid), otherwise trails the hero, and
// stays until its HP is gone. Nearby monsters attack minions before the hero (enemies.ts
// minionTarget), so the skeletons hold the line.
import { heroTrailAt } from './heroTrail';
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { nearestTrap, damageTrap } from './roomTraps';
import { damageEnemy, damageEnemiesInRadius, healPlayer, boneArmorMul, applyStatus, type DamageOpts } from './combat';
import type { Enemy } from '../types';
import { inCurse } from './zones';
import { abilityState } from './abilities';
import { spawnProjectile } from './projectiles';
import { weaponPerk, hordeMul } from '../../weaponPerks';
import { SRC_ALLY, allyHurt, updateAlly } from './ally';

export const MINION_WARRIOR = 0, MINION_MAGE = 1, MINION_GOLEM = 2, MINION_ARCHER = 3;
/** Skeleton warriors alive at once (Raise Dead, Grave Call, Plague Ground, the ult army): the oldest crumbles. */
export const MAX_SKELETONS = 5;
/** Summon sources (minion.src), each with its own cap so they never push each other out:
 *  1 Raise Dead (5, permanent), 3 Plague Ground (5 warriors that crumble after 8 s), 4 weapon perk (2),
 *  5 Grave Call (2 warriors that crumble after 8 s + 1 s per level),
 *  2 the ult's bone golem (no skeleton cap). */
export const SRC_RAISE = 1, SRC_ULT = 2, SRC_PLAGUE = 3, SRC_WEAPON = 4, SRC_GRAVE = 5, SRC_LAST = 7;   // (6 = the run ally, ally.ts)
/** (owner 2026-10-25) When the Necromancer's last summon falls, one skeleton warrior rises for LAST_LIFE seconds (once per wipe). */
const LAST_LIFE = 5;
let summonedN = 0;   // non-backup summons alive last frame
const trailPt = new Float32Array(2);   // delayed hero position (heroTrail)
const SRC_CAP = [MAX_SKELETONS, MAX_SKELETONS, 0, 5, 2, 2, MAX_SKELETONS, 1];
export const PLAGUE_LIFE = 8;
const skN = [0, 0, 0, 0];   // live skeletons per minion kind within one source (scratch)
function countSkeletons(src: number): number { skN[0] = skN[1] = skN[2] = skN[3] = 0; let n = 0; for (const m of world.minions) if (m.active && m.kind !== MINION_GOLEM && m.src === src) { skN[m.kind]++; n++; } return n; }
/** The next Raise Dead skeleton. The army is 3 skeleton warriors + 2 that are each a random archer or mage
 *  (3W+1A+1M, 3W+2A or 3W+2M): warriors rise first, the 4th and 5th are the ranged pair. A full army recast replaces
 *  its oldest skeleton within the same group (warrior -> warrior, archer/mage -> a re-rolled archer or mage). */
export const RAISE_WARRIORS = 3;
export function pickRaiseKind(): number {
  const n = countSkeletons(SRC_RAISE), war = skN[MINION_WARRIOR];
  if (n < MAX_SKELETONS) return war < RAISE_WARRIORS ? MINION_WARRIOR : randRanged();
  let oldK = MINION_WARRIOR, ol = 1e9;
  for (const m of world.minions) if (m.active && m.kind !== MINION_GOLEM && m.src === SRC_RAISE && m.born < ol) { ol = m.born; oldK = m.kind; }
  return oldK === MINION_WARRIOR ? MINION_WARRIOR : randRanged();
}
function randRanged(): number { return Math.random() < 0.5 ? MINION_ARCHER : MINION_MAGE; }
const ids: number[] = [];
const hitO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.3 };
const cleaveO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 0.6 };
const tmp = new Vector3();

/** Damage / HP (life) multiplier from talents and the wand perk. */
function minionMul(): { dmg: number; life: number; haste: number } {
  const st = useGameStore.getState(), s = st.stats, wp = weaponPerk(st.equipment.weapon);
  const h = wp?.k === 'HORDE' ? hordeMul(wp.lv) : 1;
  // (owner 2026-10-25) flatter scaling: summons start stronger (BASE_MUL) but talents / gear / the wand perk count at UPG_K
  const hk = 1 + UPG_K * (h - 1);
  return { dmg: (1 + UPG_K * (s.minionDmg || 0)) * hk, life: hk, haste: 1 + UPG_K * (s.minionHaste || 0) };
}

/** Summons are permanent: they stay until slain (life 0 = permanent). */
export const PERMANENT = 0;
/** Skeleton tuning: move speed x0.8, damage x0.7, attack speed x0.7 (attack interval / 0.7). */
const SPEED_MUL = 0.8, DMG_MUL = 0.7, ATK_SPD_MUL = 0.7;
/** (owner 2026-10-25) necro scaling: every summon +35% damage and HP at the base, upgrades (talents, gear, perk, skill level) count less. */
const BASE_MUL = 1.35, UPG_K = 0.6;
/** A summon farther than this from the hero teleports back beside it. */
const TELE_R = 22;
let bornSeq = 0;
let ultHold = 0;   // the ult cooldown frozen while the ult army stands

/** Raises a minion at (x, z). dmg = damage per hit (before talents), life in seconds (PERMANENT = until slain).
 *  src 1 = Raise Dead, 2 = Army of the Dead (their cooldowns only start once all of those minions are gone). */
export function spawnMinion(kind: number, x: number, z: number, dmg: number, life: number, src = 0, dropped = false): void {
  const M = world.minions, mm = minionMul();
  // too many skeletons: the oldest one crumbles to make room
  if (kind !== MINION_GOLEM) {   // (each summon source has its own cap)
    const n = countSkeletons(src);
    if (n >= (SRC_CAP[src] ?? MAX_SKELETONS)) {   // full: the oldest skeleton of this source in the same group (warrior / ranged) crumbles
      let same = -1, sOl = 1e9, oldest = -1, ol = 1e9;
      const war = kind === MINION_WARRIOR;
      for (let i = 0; i < M.length; i++) {
        const m = M[i]; if (!m.active || m.kind === MINION_GOLEM || m.src !== src) continue;
        if (m.born < ol) { ol = m.born; oldest = i; }
        if ((m.kind === MINION_WARRIOR) === war && m.born < sOl) { sOl = m.born; same = i; }   // same group: warrior / ranged
      }
      const k = same >= 0 ? same : oldest;
      if (k >= 0) crumble(M[k]);
    }
  }
  const m = M.find((o) => !o.active);
  if (!m) return;
  m.active = true; m.kind = kind; m.x = x; m.z = z; m.facing = world.player.facing;
  m.life = m.maxLife = life <= 0 ? Infinity : dropped ? life : life * mm.life;   // (the ult golem lasts exactly its timer)
  m.dmg = dmg * mm.dmg * DMG_MUL * BASE_MUL * (kind === MINION_GOLEM ? 1.04 : 1);   // (the bone golem hits 4% harder: 1.3 x 0.8)
  m.src = src; m.born = ++bornSeq; m.atkT = 0.4 + Math.random() * 0.3; m.tgt = -1; m.retarget = 0;
  m.shield = 0; m.shieldT = 0; m.burnT = m.poisonT = m.stunT = m.slowT = 0; m.burnDps = m.poisonDps = 0;
  m.rise = dropped ? 0 : 0.6; m.swing = 0; m.slot = Math.random() * Math.PI * 2; m.hitT = 0; m.walk = 0; m.mv = 0;
  // HP from the hero's max HP (golems are the tanks, mages are frail)
  const st = useGameStore.getState().stats;
  // skeleton warriors grow with Raise Dead's level: +5% HP and +2% damage reduction per level (max 20%)
  const rdLv = Math.max(1, useGameStore.getState().skillLevels.q || 1), warrior = kind === MINION_WARRIOR;
  m.hp = m.maxHp = st.maxHealth * (kind === MINION_GOLEM ? 1.6 * 1.3 : warrior ? 0.5 * (src === 1 ? 1.3 : 1) : 0.22)   // Raise Dead skeletons +30% HP; archers / mages are frail (0.22, was 0.3)
    * 1.2                                                    // every summon +20% HP
    * (warrior ? 1 + 0.05 * (rdLv - 1) : 1)                 // (+5% per Raise Dead level; was 10%)
    * BASE_MUL
    * (src === SRC_RAISE ? 1.5 : 1)                         // Raise Dead skeletons: +50% HP
    * (1 + (st.minionLife || 0) * 0.1 * UPG_K) * mm.life;   // minionLife talent: +6% HP per point (x UPG_K); HORDE perk too
  m.def = (warrior ? Math.min(0.2, 0.02 * (rdLv - 1)) : kind === MINION_GOLEM ? 0.15 : 0) + (src === SRC_RAISE && (warrior || kind === MINION_GOLEM) ? 0.1 : 0);   // Raise Dead warriors: +10% defense (archers / mages get none)
  m.skillT = 1.5 + Math.random() * 2; m.spin = 0;
  if (!dropped) events.emit('explosion', { pos: tmp.set(x, 0, z).clone(), radius: kind === MINION_GOLEM ? 3 : 1.4, color: 0x9a6bd8 });
}

function crumble(m: (typeof world.minions)[number]): void {
  m.active = false;
  if (m.kind === MINION_GOLEM && m.src === SRC_ULT && world.player.alive) golemExplode(m.x, m.z, m.dmg);
  events.emit('explosion', { pos: tmp.set(m.x, 0, m.z).clone(), radius: m.kind === MINION_GOLEM ? 2.5 : 1.2, color: 0xd8d0b8 });
}

/** (owner 2026-10-25) Status effects on summons: BURN / POISON tick `dps` for `dur` s, STUN freezes it in place, SLOW = 60% speed.
 *  The ally (ally.ts) is left alone. A short float text marks a fresh effect. */
export type MinionDebuff = 'BURN' | 'POISON' | 'STUN' | 'SLOW';
const DEBUFF_TXT: Record<MinionDebuff, [string, number]> = { BURN: ['BURN', 0xff8a3a], POISON: ['POISON', 0x8be04a], STUN: ['STUN', 0xffe066], SLOW: ['SLOW', 0x8fd3ff] };
export function minionDebuff(i: number, type: MinionDebuff, dur: number, dps = 0): void {
  const m = world.minions[i];
  if (!m || !m.active || m.src === SRC_ALLY || m.rise > 0) return;
  let fresh = false;
  if (type === 'BURN') { fresh = m.burnT <= 0; m.burnT = Math.max(m.burnT, dur); m.burnDps = Math.max(fresh ? 0 : m.burnDps, dps); }
  else if (type === 'POISON') { fresh = m.poisonT <= 0; m.poisonT = Math.max(m.poisonT, dur); m.poisonDps = Math.max(fresh ? 0 : m.poisonDps, dps); }
  else if (type === 'STUN') { fresh = m.stunT <= 0; m.stunT = Math.max(m.stunT, dur * (m.kind === MINION_GOLEM ? 0.5 : 1)); }
  else { fresh = m.slowT <= 0; m.slowT = Math.max(m.slowT, dur); }
  if (fresh) events.emit('floatText', { pos: tmp.set(m.x, 2.2, m.z).clone(), text: DEBUFF_TXT[type][0], color: DEBUFF_TXT[type][1], scale: 0.7, dy: 1 });
}
/** On-hit effects of a monster's traits (enemyTraits TR) on a summon. */
export function minionTraitHit(i: number, tr: number): void {
  if (!tr) return;
  const wave = world.director.wave;
  if (tr & 8) minionDebuff(i, 'POISON', 4, 1 + wave * 0.3);              // TR.POISON
  if (tr & 128 && Math.random() < 0.3) minionDebuff(i, 'STUN', 0.8);     // TR.STUN
  if (tr & (64 | 4096)) minionDebuff(i, 'SLOW', 1.5);                    // TR.SLOW / HIND_SLOW
}

/** A monster hits minion i (melee or projectile). Bone Armor-free: minions take the full hit. */
export function damageMinion(i: number, dmg: number): void {
  const m = world.minions[i];
  if (!m || !m.active || m.rise > 0) return;
  if (m.src === SRC_ALLY) { allyHurt(m, dmg); return; }   // the run ally (ally.ts): retreats at 0 HP, no soul link
  let hit = dmg * (1 - m.def) * boneArmorMul(); m.hitT = 0.25;   // armour + Bone Armor
  if (m.shield > 0) { const a = Math.min(m.shield, hit); m.shield -= a; hit -= a; }   // Bone Ward soaks it first
  m.hp -= hit;
  if (m.hp <= 0) {
    crumble(m);
    // soul link: every summon slain costs the necromancer 9% of max HP (never the killing blow: stops at 1 HP)
    const pl = world.player, mx = useGameStore.getState().stats.maxHealth;
    if (pl.alive && mx > 0) {
      const loss = Math.min(mx * 0.09, pl.hp - 1);
      if (loss > 0) { pl.hp -= loss; events.emit('floatText', { pos: pl.pos.clone(), text: `-${Math.round(loss)}`, color: 0xb47cff, scale: 0.9, dy: 2.4 }); }
    }
  }
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

// ---- bone golem extras (owner 2026-10-25): area slam, boulder lob, burning explosion when it ends
const GOLEM_HIT_R = 3.4;
const rockO: DamageOpts = { kind: 'PHYSICAL', source: 'PET', knockback: 1.5 };
const boomO: DamageOpts = { kind: 'FIRE', source: 'PET', knockback: 2 };
const boomBurn = { type: 'BURN' as const, duration: 4, value: 4 };
const rockStun = { type: 'STUN' as const, duration: 0.5 };
const ROCK_T = 0.9, ROCK_R = 3.6;
const rocks = Array.from({ length: 4 }, () => ({ on: false, x: 0, z: 0, t: 0, dmg: 0 }));
let rockCd = 0;
function mkBurnPatch(x: number, z: number, r: number, life: number, dps: number): void {
  const zn = allocZone();
  if (!zn) return;
  zn.active = true; zn.kind = 'FIRE'; zn.hostile = false;
  zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = dps; zn.color = 0xff5a1a;
  zn.length = 0; zn.maxPull = 0; zn.tickT = 0; zn.aux = 1;   // aux 1 = real burn on everything inside (zones.fireTick)
}
/** The golem ends (timer out or slain): fiery blast + burn on everything near, and a burning patch for 5 s. */
function golemExplode(x: number, z: number, dmg: number): void {
  const R = 6;
  boomBurn.value = Math.max(2, dmg * 0.4);
  damageEnemiesInRadius(x, z, R, dmg * 2.5, boomO, boomBurn);
  mkBurnPatch(x, z, R * 0.8, 5, dmg * 0.5);
  tmp.set(x, 0, z);
  events.emit('explosion', { pos: tmp.clone(), radius: R * 0.7, color: 0xff6a2a });
  events.emit('shockwave', { pos: tmp.clone(), radius: R * 1.4, color: 0xffa050 });
  events.emit('crater', { pos: tmp.clone(), radius: R * 0.45, color: 0x1a0c08 });
}
/** Every 4-6 s, if an enemy is 6-16 m away: lob a boulder (telegraphed by a shadow circle) that lands after ROCK_T. */
function golemRockAI(m: (typeof world.minions)[number], dt: number, e: Enemy | null): void {
  rockCd -= dt;
  if (rockCd > 0 || m.rise > 0) return;
  const ids2 = world.enemyGrid.query(m.x, m.z, 16, ids);
  let best: Enemy | null = null, bd = 1e9;
  for (let k = 0; k < ids2.length; k++) {
    const c = world.enemies[ids2[k]];
    if (!c.active || c.state === 'DYING' || c.state === 'SPAWN' || c.hideT > 0) continue;
    const d2 = (c.pos.x - m.x) ** 2 + (c.pos.z - m.z) ** 2;
    if (d2 < 36 || d2 > 256) continue;
    if (d2 < bd) { bd = d2; best = c; }
  }
  if (!best) { rockCd = 0.5; return; }
  for (let k = 0; k < rocks.length; k++) {
    const r = rocks[k]; if (r.on) continue;
    r.on = true; r.x = best.pos.x; r.z = best.pos.z; r.t = ROCK_T; r.dmg = m.dmg * 1.5;
    const zn = allocZone();
    if (zn) { zn.active = true; zn.kind = 'METEOR_SHADOW'; zn.hostile = false; zn.pos.set(r.x, 0, r.z); zn.radius = ROCK_R; zn.life = zn.maxLife = ROCK_T; zn.damage = 0; zn.color = 0xb8a888; zn.length = 0; zn.maxPull = 0; zn.tickT = 0; }
    m.swing = 1;
    break;
  }
  rockCd = 4 + Math.random() * 2;
}
function updateRocks(dt: number): void {
  for (let k = 0; k < rocks.length; k++) {
    const r = rocks[k]; if (!r.on) continue;
    r.t -= dt;
    if (r.t > 0) continue;
    r.on = false;
    damageEnemiesInRadius(r.x, r.z, ROCK_R, r.dmg, rockO, rockStun);
    tmp.set(r.x, 0, r.z);
    events.emit('explosion', { pos: tmp.clone(), radius: ROCK_R * 0.6, color: 0xb8a888 });
    events.emit('shockwave', { pos: tmp.clone(), radius: ROCK_R * 1.2, color: 0xb8a888 });
    events.emit('crater', { pos: tmp.clone(), radius: ROCK_R * 0.4, color: 0x1a1208 });
  }
}

export function clearMinions(): void { for (const m of world.minions) m.active = false; summonedN = 0; for (const r of rocks) r.on = false; rockCd = 0; }
export function minionCount(kind = -1, src = -1): number { let n = 0; for (const m of world.minions) if (m.active && (kind < 0 || m.kind === kind) && (src < 0 || m.src === src)) n++; return n; }

export function updateMinions(dt: number): void {
  const M = world.minions, pl = world.player, haste = minionMul().haste;
  updateRocks(dt);
  updateAlly(dt);   // the run ally lives in a minion slot but has its own brain
  let slotI = 0, army = false, raised = false;
  let alive = 0;
  for (let i = 0; i < M.length; i++) if (M[i].active) { if (M[i].src === SRC_ULT) army = true; else if (M[i].src === SRC_RAISE) raised = true; if (M[i].src !== SRC_ALLY && M[i].src !== SRC_LAST) alive++; }
  // the last summon fell: one skeleton warrior claws up beside the hero for a few seconds (not again until a new summon has risen)
  if (alive === 0 && summonedN > 0 && pl.alive && world.room.active) {
    const st = useGameStore.getState();
    if (st.hero === 'NECROMANCER') spawnMinion(MINION_WARRIOR, pl.pos.x + Math.sin(pl.facing) * 2, pl.pos.z + Math.cos(pl.facing) * 2, st.stats.damage * 0.9, LAST_LIFE, SRC_LAST, true);
  }
  summonedN = alive;
  // Raise Dead: its cooldown stays full while any of its skeletons stands (it only ticks once the last one has fallen)
  if (raised && pl.cdMax.q > 0) pl.cd.q = pl.cdMax.q;
  // Army of the Dead: the ultimate's cooldown stays full until the whole army has fallen
  if (army) { if (ultHold <= 0) ultHold = abilityState.ultCd; abilityState.ultCd = ultHold; } else ultHold = 0;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (!m.active || m.src === SRC_ALLY) continue;
    m.life -= dt;
    if (m.life <= 0 || !pl.alive) { crumble(m); continue; }
    if (m.rise > 0) { m.rise -= dt; m.mv = 0; continue; }   // still clawing out of the ground
    // status effects: burn / poison tick down its HP (a DoT kill counts like any other death), stun holds it still
    if (m.burnT > 0 || m.poisonT > 0) {
      let dot = 0;
      if (m.burnT > 0) { m.burnT -= dt; dot += m.burnDps * dt; }
      if (m.poisonT > 0) { m.poisonT -= dt; dot += m.poisonDps * dt; }
      m.hp -= dot;
      if (m.hp <= 0) { m.hp = 0.001; damageMinion(i, 1); if (!m.active) continue; }
    }
    if (m.slowT > 0) m.slowT -= dt;
    if (m.stunT > 0) { m.stunT -= dt; m.mv = 0; continue; }
    if (m.swing > 0) m.swing = Math.max(0, m.swing - dt * 2.4);
    if (m.hitT > 0) m.hitT -= dt;
    if (m.shieldT > 0) { m.shieldT -= dt; if (m.shieldT <= 0) m.shield = 0; }
    if (m.spin > 0) m.spin = Math.max(0, m.spin - dt * 2.5);
    if (m.skillT > 0) m.skillT -= dt;
    const golem = m.kind === MINION_GOLEM, mage = m.kind === MINION_MAGE, bow = m.kind === MINION_ARCHER;
    const reach = golem ? 4.8 : mage ? 10 : bow ? 13 : 1.5, speed = (golem ? 6 : mage || bow ? 7.5 : 8.5) * SPEED_MUL * (m.slowT > 0 ? 0.6 : 1), cd = (golem ? 1.3 / 1.2 : mage ? 1.1 : bow ? 0.95 : 0.85) / (haste * ATK_SPD_MUL);
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
    // (owner) no monster in reach: summons go after the nearest stationary (siege weapon / tower / statue)
    const tr = e ? null : nearestTrap(m.x, m.z, 16);
    let tx: number, tz: number, stop: number;
    if (e) { tx = e.pos.x; tz = e.pos.z; stop = reach + e.radius * 0.8; }
    else if (tr) { tx = tr.x; tz = tr.z; stop = reach + tr.rad * 0.9; }
    else {   // trail the hero in a loose ring
      const a = m.slot + slotI++ * 0.9;
      heroTrailAt(0.8 + (m.slot % 3) * 0.1, trailPt);   // (owner: summons follow with a ~1 s delay)
      tx = trailPt[0] + Math.cos(a) * 3.2; tz = trailPt[1] + Math.sin(a) * 3.2; stop = 0.6;
    }
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    // (owner 2026-10-25) a summon too far from the hero blinks back to its side (a puff where it left and where it lands)
    const hx = m.x - pl.pos.x, hz = m.z - pl.pos.z;
    if (hx * hx + hz * hz > TELE_R * TELE_R || d > 30) {
      events.emit('explosion', { pos: tmp.set(m.x, 0, m.z).clone(), radius: 1.1, color: 0x9a6bd8 });
      const a = m.slot + i * 0.9;
      m.x = pl.pos.x + Math.cos(a) * 2.6; m.z = pl.pos.z + Math.sin(a) * 2.6; m.tgt = -1; m.retarget = 0;
      events.emit('explosion', { pos: tmp.set(m.x, 0, m.z).clone(), radius: 1.1, color: 0x9a6bd8 });
      continue;
    }
    let mv = 0;
    if (d > stop) {
      const s = Math.min(d - stop, speed * dt);
      m.x += (dx / d) * s; m.z += (dz / d) * s;
      mv = dt > 0 ? s / (speed * dt) : 0;
    }
    // bodies: never stand inside a monster or another summon (pushed out to touching distance)
    const mr = golem ? 1.95 : 0.55;
    const near = world.enemyGrid.query(m.x, m.z, mr + 6, ids);
    for (let k = 0; k < near.length; k++) {
      const c = world.enemies[near[k]];
      if (!c.active || c.state === 'DYING' || c.hideT > 0) continue;
      const ox = m.x - c.pos.x, oz = m.z - c.pos.z, min = mr + c.radius * 0.9, o2 = ox * ox + oz * oz;
      if (o2 < min * min) { const od = Math.sqrt(o2) || 0.001, push = min - od; m.x += (od > 0.001 ? ox / od : Math.sin(m.slot)) * push; m.z += (od > 0.001 ? oz / od : Math.cos(m.slot)) * push; }
    }
    for (let k = 0; k < M.length; k++) {
      if (k === i) continue;
      const o = M[k]; if (!o.active || o.rise > 0) continue;
      const ox = m.x - o.x, oz = m.z - o.z, min = mr + (o.kind === MINION_GOLEM ? 1.95 : 0.55), o2 = ox * ox + oz * oz;
      if (o2 < min * min && o2 > 1e-6) { const od = Math.sqrt(o2), push = (min - od) * 0.5; m.x += (ox / od) * push; m.z += (oz / od) * push; }
    }
    m.mv += (mv - m.mv) * Math.min(1, dt * 10);
    m.walk += dt * speed * m.mv * (golem ? 0.9 : 1.6);
    if (d > 0.05) m.facing = Math.atan2(dx, dz);
    m.atkT -= dt;
    if (golem && m.src === SRC_ULT) golemRockAI(m, dt, e);
    if (tr && d <= stop + 0.3 && m.atkT <= 0) {
      m.atkT = cd; m.swing = 1;
      if (mage) { const p = spawnProjectile('PET_BOLT', m.x, m.z, dx / d, dz / d, 22, m.dmg, { life: 1, pierce: 1, radius: 0.9, y: 1.2 }); if (p) p.tint = 9; }
      else if (bow) { const p = spawnProjectile('ARROW', m.x, m.z, dx / d, dz / d, 32, m.dmg, { life: 0.8, pierce: 1, radius: 0.6, y: 1.4 }); if (p) p.tint = 10; }
      else {
        damageTrap(tr, m.dmg);
        if (golem) events.emit('shockwave', { pos: tmp.set(tr.x, 0, tr.z).clone(), radius: GOLEM_HIT_R, color: 0xb8a888 });
      }
    } else if (e && d <= stop + 0.3 && m.atkT <= 0) {
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
        hitO.fromX = cleaveO.fromX = m.x; hitO.fromZ = cleaveO.fromZ = m.z;   // (backstab / block origin = the minion)
        if (!golem && m.skillT <= 0) {   // skeleton skill: CLEAVE, a spinning swing that hits everything close (small AoE)
          m.skillT = 5 / haste; m.spin = 1; m.swing = 0;
          cleaveO.knockback = 0.6;
          damageEnemiesInRadius(m.x, m.z, 2.8, m.dmg * 2, cleaveO);
          events.emit('shockwave', { pos: tmp.set(m.x, 0, m.z).clone(), radius: 2.8, color: 0xc9b8ff });
        } else if (golem) {   // (owner 2026-10-25) the golem's slam hits everything around the target
          damageEnemiesInRadius(e.pos.x, e.pos.z, GOLEM_HIT_R, m.dmg, hitO);
          events.emit('shockwave', { pos: tmp.set(e.pos.x, 0, e.pos.z).clone(), radius: GOLEM_HIT_R, color: 0xb8a888 });
        } else damageEnemy(e, m.dmg, hitO);
      }
    }
  }
}

// ---- necromancer passives that react to kills
events.on('enemyDeath', (d) => {
  const st = useGameStore.getState();
  if (st.hero !== 'NECROMANCER' || d.poof) return;
  const pl = world.player, lv = st.skillLevels;
  // Plague Ground: every enemy that dies in it rises as a skeleton warrior for 8 s (up to 5 at a time)
  if (lv.s4 > 0 && inCurse(d.pos.x, d.pos.z)) {
    spawnMinion(MINION_WARRIOR, d.pos.x, d.pos.z, st.stats.damage * 0.8 * (1 + 0.2 * (lv.s4 - 1)), PLAGUE_LIFE, SRC_PLAGUE);
  }
  // Soul Harvest: kills near you (or near a minion) restore HP and mana
  if (lv.soulHarvest > 0 && pl.alive) {
    let near = (d.pos.x - pl.pos.x) ** 2 + (d.pos.z - pl.pos.z) ** 2 < 14 * 14;
    if (!near) for (const m of world.minions) if (m.active && (d.pos.x - m.x) ** 2 + (d.pos.z - m.z) ** 2 < 36) { near = true; break; }
    if (near) {
      healPlayer(st.stats.maxHealth * (0.007 + 0.0035 * (lv.soulHarvest - 1)));   // (-30%, owner)
      pl.mana = Math.min(st.stats.maxMana, pl.mana + 2 + (lv.soulHarvest - 1));
    }
  }
});
