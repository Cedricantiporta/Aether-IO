import { riruruDied } from './riruru';
import { interruptHit, resetInterrupt } from './interrupt';
import { showcase, ULT_CHARGE_MUL } from '../showcase';
import { TR } from '../enemyTraits';
import { KILL_XP_MUL } from '../../classLevels';
// ============================================================================
// Combat: damage in/out, death + loot, healing, status effects.
// Engine-B (enemies/bosses/director) calls into this module.
// ============================================================================
import { hitCratesInRadius } from './crates';
import { hitRoomTraps, trapAim } from './roomTraps';
import { lockedEnemy, noteAttacker } from './target';
import { debug } from '../debug';
import { dropLoot } from './loot';
import { Vector3 } from 'three';
import { world, MAX_ENEMIES } from '../world';
import { coopRoom } from '../../net/coopRoom';
import { events, type DamageKind } from '../events';
import type { Enemy } from '../types';
import type { Rarity, StatusEffectType } from '../../types';
import { GameStatus } from '../../types';
import { comboMul, registerHit } from './combo';
import { useGameStore, makeItemById, DMG_INFLATE, rollDropPlus } from '../../store';
import { COLORS } from '../../constants';
import { runMods, runInfo, HARD_EPIC_MUL, hardMul } from '../runMods';
/** The tower modes (Endless Tower, Daily Trial, Endless Waves all run as runInfo.mode 'TOWER'): monsters drop no items
 *  or loot there, only gold and Aether Crystals (owner: that currency is for summoning). */
export const towerMode = (): boolean => runInfo.mode === 'TOWER';
/** Aether Crystals for one tower-mode kill: bosses / minis / elites pay, plain monsters rarely; deeper pays a bit more. */
export function towerCrystals(boss: boolean, mini: boolean, elite: boolean, depth: number): number {
  const deep = 1 + Math.floor(depth / 10) * 0.5;
  if (boss) return Math.round(3 * deep);
  if (mini) return Math.round(2 * deep);
  if (elite) return Math.random() < 0.35 ? Math.max(1, Math.round(deep)) : 0;
  return Math.random() < 0.015 ? 1 : 0;
}
import { dailyMods } from '../../dailyChallenge';
import { GOLD_DROPPERS, isBossAdd } from '../enemyDefs';
import { spawnPickup, dropCrystals } from './pickups';
import { waves } from '../../endlessWaves';
import { onEnemyDeath, crabArmor, shieldBlock, bossAlive, SHIELD_BACKSTAB_MULT, WINDED_DMG_MULT } from './enemies';
import { popDecoy } from './bossSpecials';
import { bossWarded } from './bossMech';
import { bp } from './bossPhaseState';
import { hooks } from './hooks';
import { runCards, cardDamageMul } from '../runCards';
import { PROJ_RESIST } from '../../dashMods';
import { procFlags } from './projectiles';   // (Righteous Riposte flag)

/** e.knock is a velocity (units/s) = knockback stat * KNOCK_SCALE, capped; Engine-B decays and scales it. */
export const KNOCK_SCALE = 12;
/** Chance that a player hit applies its knockback / launch. */
export const KNOCK_CHANCE = 0.5;
const KNOCK_MAX = 30;

export interface DamageOpts {
  kind: DamageKind;
  crit?: boolean;
  knockDir?: Vector3;
  knockback?: number;
  dot?: boolean;
  source?: 'PLAYER' | 'PET';
  /** Launch distance (units): big knockback. With `slam` damage if the enemy hits an obstacle / crystal wall. */
  launch?: number;
  slam?: number;
  /** Applies ARMOR BREAK (-25% armor, 6 s) before the hit lands. */
  armorBreak?: boolean;
  /** Skip the back-attack bonus (slam damage etc.). */
  noBackstab?: boolean;
  /** Marks the target chilled (Archer Shatter synergy). */
  frost?: boolean;
  /** Environmental source (achievements count kills by it): spike trap, exploding barrel, wall slam, room hazard. */
  env?: 'TRAP' | 'BARREL' | 'SLAM' | 'HAZARD';
  /** Where the hit comes from (a projectile's point behind its travel direction); default = the hero's position. Used by block / backstab checks. */
  fromX?: number; fromZ?: number;
  /** A hit from the hero's basic attack (ult charge: 0.1 per basic hit, 0.3 per skill hit). */
  basic?: boolean;
}
/** The env of the hit that is killing an enemy right now (read when enemyDeath is emitted). */
let killEnv: DamageOpts['env'] | undefined;

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
  value?: number;
}

const dropPos = new Vector3();
let lsAcc = 0, lsWinT = -1, lsWin = 0;
/** (owner 2026-10-25: life steal was OP in big packs) life steal heals at most LS_SEC_CAP of max HP per second, whatever the hit count */
const LS_SEC_CAP = 0.01;
let thornT = -1;
const thornOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET' };

/** Counters for QA / run stats of the combat-depth systems. */
export const combatStats = { backstabs: 0, slams: 0, staggers: 0, xpFromKills: 0, armorBreaks: 0, debuffs: {} as Record<string, number> };
export const BACKSTAB_DOT = -0.5;   // rear arc: attacker within 60 deg of straight behind (120 deg total)
export const BACKSTAB_MULT = 1.5;   // (owner) x1.5 on any hit from behind, every enemy incl. bosses
const ARMOR_BREAK_FACTOR = 0.75;
const ARMOR_BREAK_TIME = 6;
let lastBackstabText = -10;
let lastSlamText = -10;
const immuneT = new Float64Array(MAX_ENEMIES).fill(-99);   // per enemy: last 'IMMUNE' text (>= 0.8 s apart, however many hits land)
// instant-XP floating text: kills within a short window are summed into one "+N XP" number
let xpAcc = 0, xpTextT = 0;
const xpPos = new Vector3();
const XP_TEXT_COLOR = 0x6fe8ff;

/** Per-frame upkeep of combat floating text (flushes the XP accumulator). Called from game.ts. */
export function updateCombatFx(dt: number): void {
  if (xpAcc <= 0) return;
  xpTextT -= dt;
  if (xpTextT <= 0) {
    events.emit('floatText', { pos: xpPos.clone(), text: `+${Math.round(xpAcc)} XP`, color: XP_TEXT_COLOR, scale: 0.8, dy: 1.2 });
    xpAcc = 0; xpTextT = 0.45;
  }
}
export function resetCombat(): void { resetInterrupt(); xpAcc = 0; xpTextT = 0; lastBackstabText = -10; lastSlamText = -10; immuneT.fill(-99); }

/** Big knockback: launches the enemy `dist` units away along (dx,dz); slam damage if it hits an obstacle while flying. */
export function launchEnemy(e: Enemy, dx: number, dz: number, dist: number, slam = 0): void {
  if (!e.active || e.state === 'DYING' || e.boss || e.freezeT > 0) return;
  if (coopRoom.guest) return;   // (a guest's launch rides on its hit: coopRoom.sendHit carries `launch`)
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  const resist = e.mini ? 0.25 : e.elite ? 0.5 : 1;
  const v = Math.min(150, dist * 9.5 * resist);
  e.knock.x = (dx / l) * v; e.knock.z = (dz / l) * v;
  e.slamDmg = Math.max(e.slamDmg, slam); e.slamT = 0.9;
}

/** Called by the enemy system when a launched enemy collides with an obstacle / crystal wall. */
export function wallSlam(e: Enemy): void {
  const dmg = e.slamDmg;
  e.slamT = 0; e.slamDmg = 0;
  e.knock.set(0, 0, 0);
  combatStats.slams++;
  applyStatus(e, { type: 'STUN', duration: 0.5 });
  events.emit('slam', { pos: e.pos, damage: dmg });
  if (world.time - lastSlamText > 0.3) { lastSlamText = world.time; events.emit('floatText', { pos: e.pos, text: 'SLAM', color: 0xff8a3a, scale: 0.9, dy: 0.6 }); }
  if (dmg > 0) damageEnemy(e, dmg, { kind: 'PHYSICAL', source: 'PLAYER', noBackstab: true, env: 'SLAM' });
}

// ---- Stagger meter (bosses, mini-bosses, the Dark Hero): fills from crowd control (bosses are immune to full stuns),
// decays when left alone; full = STAGGERED for 2 s (+25% damage taken). It never fills while the boss is immune (ward up).
/** Bar fill for the HUD (0..1). */
export function staggerView(e: Enemy): number { return e.staggerMax > 0 ? Math.min(1, Math.max(0, e.stagger / e.staggerMax)) : 0; }
function gainStagger(e: Enemy, amount: number): void {
  if (e.staggerT > 0 || e.staggerCd > 0 || e.staggerMax <= 0 || (e.boss && bossWarded(e))) return;
  e.staggerCd = 0.35;
  e.stagger += amount;
  if (e.stagger >= e.staggerMax) {
    e.stagger = 0; e.staggerT = 2;
    combatStats.staggers++;
    events.emit('stagger', { pos: e.pos, boss: e.boss });
    hooks.onStagger(e);
    events.emit('floatText', { pos: e.pos, text: 'STAGGER', color: 0xffd23a, scale: 1.0, dy: 1.0 });
  }
}

// ------------------------------------------------------------------ helpers --
/** (owner) flat ult charge per landed hit (meter 0..100): basic attack 0.1, skill 0.3 (before the weapon-level / showcase multipliers). */
export const ULT_PER_BASIC = 0.1, ULT_PER_SKILL = 0.3;
/** Ultimate charge (0..100) from damage dealt and kills. */
export function addUlt(n: number): void {
  const p = world.player;
  if (p.ultT > 0 || p.ult >= 100) return;
  const sl = useGameStore.getState().skillLevels;
  if (sl.ult <= 0) return;   // the ult is locked until Lv 10 (no charge)
  const wl = sl.weapon;
  p.ult = Math.min(100, p.ult + n * 0.868 * (1 + 0.1 * Math.max(0, wl - 1)) * (showcase.on ? ULT_CHARGE_MUL : 1) * (1 + runCards.ultCharge));   // (+ Surging Heart run card) // ult charge (+40% vs 0.62)
  if (p.ult >= 100) events.emit('ultReady', {});
}

export function addShake(amount: number): void {
  events.emit('shake', { amount });
}

/** Spends mana if available. `cost` already includes class modifiers (store.getManaCost). */
export function trySpendMana(cost: number): boolean {
  const p = world.player;
  if (p.mana < cost) return false;
  p.mana -= cost;
  return true;
}

/** Rolls a crit: returns the damage multiplier (1 when no crit) and sets lastCrit. */
export let lastCrit = false;
export function rollCrit(critRate: number, critDamage: number): number {
  lastCrit = Math.random() < critRate;
  return lastCrit ? critDamage : 1;
}

const _aimTmp = new Vector3();
/** Unit xz direction from the player towards the aim point (falls back to facing when aim is on top of the player). */
/** Auto-target lock (enemy id or -1). Maintained by player.ts; when valid it overrides the mouse aim. */
export const autoAim = { id: -1 };
/** The enemy the hero is attacking right now: the click-locked one, else the auto-aim pick (ring + HP card follow it). */
export function currentTarget(): Enemy | null {
  const lk = lockedEnemy();
  if (lk) return lk;
  const e = autoAim.id >= 0 ? world.enemies[autoAim.id] : null;
  return e && e.active && e.state !== 'DYING' && e.state !== 'SPAWN' && e.hideT <= 0 ? e : null;
}

/** Aimed casting: while `on`, skills use this ground point instead of the pointer / auto-target lock. */
export const aimOverride = { on: false, x: 0, z: 0 };

export function getAimDir(out: Vector3 = _aimTmp): Vector3 {
  const p = world.player;
  let tx = p.aim.x, tz = p.aim.z;
  if (aimOverride.on) { tx = aimOverride.x; tz = aimOverride.z; }
  else if (autoAim.id >= 0) {
    const e = world.enemies[autoAim.id];
    if (e.active && e.state !== 'DYING') { tx = e.pos.x; tz = e.pos.z; }
  } else if (trapAim.obj && !trapAim.obj.dead) { tx = trapAim.obj.x; tz = trapAim.obj.z; }   // (owner) a targeted siege weapon / tower / statue
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 0.05) out.set(Math.sin(p.facing), 0, Math.cos(p.facing));
  else out.set(dx / l, 0, dz / l);
  return out;
}

const nearOut: number[] = [];
/** Nearest hittable enemy within maxR of (x,z), or null. */
export function findNearestEnemy(x: number, z: number, maxR: number): Enemy | null {
  // (owner: auto skills ignored big bosses) distance to the enemy's EDGE, so a big boss whose centre is out of reach still counts
  const ids = world.enemyGrid.query(x, z, maxR + 6, nearOut);
  let best: Enemy | null = null;
  let bestD = maxR;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const d = Math.hypot(e.pos.x - x, e.pos.z - z) - Math.min(6, e.radius * 0.8);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** (owner) "In a fight": a live hostile within ~22 units of the hero (runs, hermit-path / cave monsters). Never true in an empty town. Pets / item procs gate their timers on it. */
export function inFight(): boolean {
  const pl = world.player;
  return findNearestEnemy(pl.pos.x, pl.pos.z, 22) !== null;
}

const aoeOut: number[] = [];
const aoeDir = new Vector3();
/**
 * Damages every hittable enemy whose centre is within `radius` of (x,z).
 * Optionally knocks away from the centre and applies a status. Returns hit count.
 */
export function damageEnemiesInRadius(
  x: number, z: number, radius: number, amount: number, o: DamageOpts, status?: StatusEffect, excludeId = -1, maxHits = 1e9,
): number {
  hitCratesInRadius(x, z, radius, amount);   // (owner) skills break barrels too
  if (o.source === 'PLAYER' && !o.env && !o.dot) hitRoomTraps(x, z, radius, amount);   // (owner) ...and siege weapons / magic towers
  const ids = world.enemyGrid.query(x, z, radius + 4, aoeOut);
  const r2 = radius * radius;
  let hits = 0;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (e.id === excludeId || !e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    if (dx * dx + dz * dz > r2) continue;
    if (hits >= maxHits) break;
    hits++;
    if (status) applyStatus(e, status);
    if (o.knockback || o.launch) {
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      aoeDir.set(dx / d, 0, dz / d);
      o.knockDir = aoeDir;
    }
    damageEnemy(e, amount, o);
  }
  return hits;
}

/** Instant XP + coalesced "+N XP" floating text. */
export function grantKillXp(xp: number, pos: Vector3): void {
  if (towerMode()) return;   // (no EXP in the tower modes: no floating +xp either)
  xp *= KILL_XP_MUL;
  const st = useGameStore.getState();
  st.addExperience(xp);
  world.run.xpEarned += xp;
  combatStats.xpFromKills += xp;
  const gain = (st.level >= 10 ? xp * 2 : xp) * 2 * (1 + st.stats.xpBonus) * hardMul(false);
  xpAcc += gain; xpPos.copy(pos);
}

// ------------------------------------------------------------------ enemies --
// ---- floating status words ("BURNED", "FROZEN" ...) when a status newly lands; a small budget keeps crowds readable
const STATUS_WORD: Partial<Record<string, [string, number]>> = {
  BURN: ['BURNED', 0xff8a3a], POISON: ['POISONED', 0x8be05a], FREEZE: ['FROZEN', 0x9fe4ff], STUN: ['STUNNED', 0xffe27a], SLOW: ['SLOWED', 0x7fc8ff],
  ROOT: ['ROOTED', 0xb08a5a], SILENCE: ['SILENCED', 0xc58bff], DEFDOWN: ['ARMOR DOWN', 0xff9a6a], BLIND: ['BLINDED', 0xcfcfcf], BLEED: ['BLEEDING', 0xff4a4a],
  ARMOR_BREAK: ['ARMOR BROKEN', 0xffb070],
};
let wordBudget = 6, wordT = 0;
function statusWord(pos: Vector3, type: string, player = false): void {
  const w = STATUS_WORD[type]; if (!w) return;
  if (type !== 'DEFDOWN') return;   // statuses now show as persistent tags (render/StatusFx: BRN PSN FRZ ...) instead of a one-off word
  const now = world.time;
  wordBudget = Math.min(6, wordBudget + (now - wordT) * 8); wordT = now;
  if (!player && wordBudget < 1) return;
  wordBudget -= 1;
  events.emit('floatText', { pos, text: w[0], color: w[1], scale: player ? 0.8 : 0.55, dy: player ? 2.6 : 2.0 });
}
const statusActive = (e: Enemy, t: string): boolean =>
  t === 'BURN' ? e.burnT > 0 : t === 'POISON' ? e.poisonT > 0 : t === 'FREEZE' ? e.freezeT > 0 : t === 'STUN' ? e.stunT > 0 : t === 'SLOW' ? e.slowT > 0.05 : false;

export function applyStatus(e: Enemy, effect: StatusEffect): void {
  if (!e.active || e.state === 'DYING') return;
  if (coopRoom.guest) { coopRoom.sendStatus?.(e, effect); return; }   // co-op guest: the host owns the monster
  const fresh = !statusActive(e, effect.type);
  applyStatusRaw(e, effect);
  if (fresh && statusActive(e, effect.type)) statusWord(e.pos, effect.type);
}

function applyStatusRaw(e: Enemy, effect: StatusEffect): void {
  const lm = 1 + runCards.linger;   // Lingering Malice: statuses last longer
  const durMult = e.boss ? 0.25 : e.elite ? 0.5 : 1;
  switch (effect.type) {
    case 'BURN': {
      const v = effect.value ?? 5;
      if (v >= 0.5) { // real burn source (not the visual-only tint of fire zones): stack up to 3 (+talents)
        if (e.burnT <= 0) { e.burnStacks = 1; e.burnStackCd = 0.3; }
        else if (e.burnStackCd <= 0) { e.burnStacks = Math.min(3 + (useGameStore.getState().stats.burnStacks | 0), e.burnStacks + 1); e.burnStackCd = 0.3; }
      } else if (e.burnT <= 0) e.burnStacks = Math.max(1, e.burnStacks);
      e.burnT = Math.max(e.burnT, effect.duration * lm);
      e.burnDps = Math.max(e.burnDps, v);
      break;
    }
    case 'POISON':
      e.poisonT = Math.max(e.poisonT, effect.duration * lm);
      e.poisonDps = Math.max(e.poisonDps, effect.value ?? 3);
      break;
    case 'FREEZE':
    case 'STUN': {
      const bonus = useGameStore.getState().stats.stunBonus || 0;
      const dur = (effect.duration + (bonus > 0 ? bonus : 0)) * lm;
      if (e.boss || e.mini) { gainStagger(e, dur * (effect.type === 'STUN' ? 30 : 24)); return; } // immune to full stun: fills STAGGER instead
      if (effect.type === 'FREEZE') e.freezeT = Math.max(e.freezeT, dur * durMult);
      else e.stunT = Math.max(e.stunT, dur * durMult);
      break;
    }
    case 'SLOW': {
      const f = Math.min(0.9, Math.max(0, effect.value ?? 0.5)) * (e.boss ? 0.5 : 1);
      e.slowT = Math.max(e.slowT, effect.duration * lm);
      e.slowFactor = Math.max(e.slowFactor, f);
      break;
    }
    case 'CHILL': {
      e.chillStacks++; e.chillT = effect.duration || 4; e.frostT = Math.max(e.frostT, 4);
      if (e.chillStacks >= 4) { e.chillStacks = 0; applyStatus(e, freezeOne); }
      else {
        e.slowT = Math.max(e.slowT, effect.duration || 4);
        e.slowFactor = Math.max(e.slowFactor, 0.15 * e.chillStacks * (e.boss ? 0.5 : 1));
      }
      break;
    }
    case 'ARMOR_BREAK':
      if (e.armorBreakT <= 0) { combatStats.armorBreaks++; events.emit('armorBreak', { pos: e.pos }); }
      e.armorBreakT = Math.max(e.armorBreakT, (effect.duration || ARMOR_BREAK_TIME) * lm);
      break;
  }
}

const freezeOne: StatusEffect = { type: 'FREEZE', duration: 1 };
const abStatus: StatusEffect = { type: 'ARMOR_BREAK', duration: ARMOR_BREAK_TIME };

// ---- Ankh of Life: a very long real-time cooldown (15 min) between revives, kept across runs and reloads
export const ANKH_COOLDOWN_MS = 15 * 60 * 1000;
const ANKH_KEY = 'aether-survivor-ankh-cd-v1';
let ankhReadyAt = (() => { try { return Number(localStorage.getItem(ANKH_KEY)) || 0; } catch { return 0; } })();
/** ms until an Ankh can revive again (0 = ready). */
export function ankhCooldownLeft(): number { return Math.max(0, ankhReadyAt - Date.now()); }
/** Death screen offer: set by the death flow (player.ts) while an Ankh is ready; read by ui/screens/AnkhPrompt.tsx. */
export const ankhOffer = { open: false, declined: false };
/** An Ankh in the bag, off cooldown. */
export function ankhAvailable(): boolean { return !towerMode() && ankhCooldownLeft() <= 0 &&   // (no Ankh in the tower modes)
   useGameStore.getState().inventory.some((i) => i.type === 'REVIVE'); }
/** The player chose to use the Ankh of Life: consume it, start its cooldown and bring the hero back (half HP, 5 s invuln). */
export function reviveWithAnkh(): boolean {
  const st = useGameStore.getState(), p = world.player;
  ankhOffer.open = false;
  if (towerMode() || ankhCooldownLeft() > 0 || !st.consumeItem((i) => i.type === 'REVIVE')) return false;
  startAnkhCooldown();
  p.alive = true; p.downed = false; p.hp = st.stats.maxHealth * 0.5; p.mana = Math.max(p.mana, st.stats.maxMana * 0.5);
  p.invulnT = Math.max(p.invulnT, 5);
  p.reviveFx = 1;
  hooks.onRevive();
  st.addNotification('REVIVED BY THE ANKH OF LIFE!', COLORS.rarityEpic, 'SYSTEM');
  events.emit('playerRevive', { pos: p.pos, source: 'ANKH' });
  return true;
}
/** Co-op: the partner finished reviving this DOWNED hero (net/coop.ts MSG.REVIVE): back on his feet at ~30% HP with a short invulnerability. */
export const REVIVE_HP = 0.3;
export function reviveByFriend(): void {
  const st = useGameStore.getState(), p = world.player;
  if (!p.downed) return;
  ankhOffer.open = false;
  p.alive = true; p.downed = false;
  p.hp = Math.max(1, st.stats.maxHealth * REVIVE_HP);
  p.mana = Math.max(p.mana, st.stats.maxMana * 0.3);
  p.invulnT = Math.max(p.invulnT, 3);
  p.stunT = 0; p.rootT = 0; p.downT = 0; p.knockT = 0;
  p.reviveFx = 1;
  hooks.onRevive();
  st.addNotification('Your friend got you back on your feet!', '#9be7ff', 'SYSTEM');
  events.emit('playerRevive', { pos: p.pos, source: 'FRIEND' });
}
function startAnkhCooldown(): void { ankhReadyAt = Date.now() + ANKH_COOLDOWN_MS; try { localStorage.setItem(ANKH_KEY, String(ankhReadyAt)); } catch { /* ignore */ } }

/** Co-op GUEST side of damageEnemy: the enemies on this screen are a mirror of the host's, so a hit is only claimed here (combo, cards,
 *  ult charge and life steal are the guest's own, the armour / shield / hp maths run on the host) and sent over the link. */
function guestHit(e: Enemy, amount: number, o: DamageOpts): void {
  if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.shellT > 0 || !(amount > 0) || !coopRoom.sendHit) return;
  if (!o.dot && o.source !== 'PET') { amount *= comboMul(); registerHit(); }
  if (o.source === 'PLAYER') amount *= cardDamageMul(e);
  const p = world.player;
  if (o.source === 'PLAYER') {
    addUlt((o.dot ? 0.04 : 0.28) * Math.min(1, amount / Math.max(1, e.maxHp)) + (o.dot ? 0 : o.basic ? ULT_PER_BASIC : ULT_PER_SKILL));
    if (!o.dot) {
      const ls = useGameStore.getState().stats.lifeSteal;
      if (ls > 0) { lsAcc += Math.min(amount, 4000) * ls; if (lsAcc >= 2) { const h = Math.min(lsAcc, useGameStore.getState().stats.maxHealth * LS_SEC_CAP); if (h > 0) healPlayer(h); lsAcc = 0; } }
    }
  }
  world.run.damageDealt += amount;
  e.hitFlash = o.dot ? Math.max(e.hitFlash, 0.35) : 1;
  const knockRoll = o.source === 'PLAYER' ? Math.random() < KNOCK_CHANCE : true;
  coopRoom.sendHit(e, amount, o, knockRoll, p.pos.x, p.pos.z);
}

export function damageEnemy(e: Enemy, amount: number, o: DamageOpts): void {
  if (coopRoom.guest) { guestHit(e, amount, o); return; }   // co-op guest: the monsters live on the host, send it the hit (net/coopGuest.ts)
  if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') return;
  if (e.shellT > 0) return; // Shellback's Tidal Shell: immune
  if ((e.boss || e.mini) && bossWarded(e)) { if (!o.dot) hooks.phaseHit(e); if (!o.dot && world.time - immuneT[e.id] > 0.8 && Math.random() < 0.25) { immuneT[e.id] = world.time; events.emit('floatText', { pos: e.pos, text: 'IMMUNE', color: 0x8ab8ff, scale: 0.9, dy: 3.5 }); } return; }   // ward up
  let blockBackstab = false;
  if (!o.dot && e.kind === 'SHIELDBEARER') {   // braced shield: frontal hits deal 0 (BLOCKED); from behind / the side they bypass it for +50%
    const sb = o.fromX !== undefined ? shieldBlock(e, o.fromX, o.fromZ!) : shieldBlock(e, world.player.pos.x, world.player.pos.z);
    if (sb === 1) return;
    blockBackstab = sb === 2;
  }
  if (!o.dot && e.kind === 'HUMAN_BOSS') {   // humanoid mini boss: Varn's Shield Wall blocks the front arc, his banner soaks 75%
    const hm = hooks.humanMul(e, o.fromX ?? world.player.pos.x, o.fromZ ?? world.player.pos.z);
    if (hm <= 0) return;
    amount *= hm;
  }
  if (!(amount > 0)) return;
  if (!o.dot && (e.boss || e.mini) && !e.decoy) interruptHit(e, amount);   // (owner) boss interrupt meter
  amount *= dailyMods.dealt;   // Daily Trial: Glass Cannon
  if (debug.oneHit) { e.shield = 0; amount = Math.max(amount, (e.hp + 1) * 20); }   // debug: one-hit kills (armor-proof)

  let dealt = amount;
  if (e.traits & TR.ELEM_RESIST && o.kind && o.kind !== 'PHYSICAL' && o.kind !== 'TRUE') dealt *= 0.5;   // Warded trait
  if (o.kind === 'POISON' && (e.kind === 'SLIME' || e.kind === 'SPLITTER')) dealt *= 0.4;   // (owner) slimes shrug off poison (-60%)
  if (o.armorBreak) applyStatus(e, abStatus);
  if (o.frost) e.frostT = Math.max(e.frostT, 4);
  if (!o.dot) {
    if (e.armor > 0) dealt *= 100 / (100 + e.armor * (e.armorBreakT > 0 ? ARMOR_BREAK_FACTOR : 1));
    if (e.kind === 'GOBLIN_ARCHER') dealt *= 0.5;   // (owner) tower archers: 2x defense like every stationary (roomTraps TRAP_DEF)
    if (e.staggerT > 0) dealt *= 1.25;
    if (e.winT > 0) dealt *= WINDED_DMG_MULT;   // boss / mini-boss free-hit window
    // BACK ATTACK: the attacker (a projectile's origin, a pet / minion, else the hero) is in the enemy's rear 120 deg arc.
    // Applies to every enemy kind (bosses, elites, minis, humanoids, dark heroes); a braced shieldbearer's bypass counts too.
    if (blockBackstab) {
      dealt *= SHIELD_BACKSTAB_MULT + useGameStore.getState().stats.backstab; combatStats.backstabs++;
    } else if (!o.noBackstab) {
      const ox = o.fromX !== undefined ? o.fromX : world.player.pos.x, oz = o.fromZ !== undefined ? o.fromZ : world.player.pos.z;
      const pdx = ox - e.pos.x, pdz = oz - e.pos.z;
      const pl = Math.sqrt(pdx * pdx + pdz * pdz);
      if (pl > 0.05 && (pdx * Math.sin(e.facing) + pdz * Math.cos(e.facing)) / pl < BACKSTAB_DOT) {
        dealt *= BACKSTAB_MULT + (o.source === 'PLAYER' ? useGameStore.getState().stats.backstab : 0);
        combatStats.backstabs++;
        if (world.time - lastBackstabText > 0.5) { lastBackstabText = world.time; events.emit('floatText', { pos: e.pos, text: 'BACKSTAB', color: 0xffc23a, scale: 0.7, dy: 0.5 }); }
      }
    }
  }
  if (!o.dot && o.source !== 'PET') { dealt *= comboMul(); registerHit(); }
  if (o.source === 'PLAYER') dealt *= cardDamageMul(e);   // special cards: Afflictor / Giant Slayer / Executioner / First Strike
  if (e.kind === 'ROCK_CRAB' && !o.dot) dealt = crabArmor(e, dealt);
  if (e.boss) dealt *= hooks.damageMul(e) * hooks.phaseMul(e); // Elderroot bark armor, Mire Hydra heads shielding the body
  else if (e.kind === 'DARK_HERO') { dealt *= hooks.heroMul(e); if (dealt <= 0) { e.hitFlash = 0.4; return; } }   // Dark Knight shield block: no damage at all
  else if (e.decoy && e.trickKind === 1) dealt *= 3;   // the Herald's illusions mirror his HP bar but crumble 3x faster (balance pass: auto-aim
                                                       // kept hitting them and half the bot fights never finished)
  if (e.shield > 0) {
    const sw = !e.boss && runCards.sunder > 0 ? 1 / (1 - runCards.sunder) : 1;   // Shieldbreaker: non-boss shields are weaker
    const sd = dealt * sw;
    if (sd <= e.shield) { e.shield -= sd; dealt = 0; }
    else { dealt -= e.shield / sw; e.shield = 0; }
  }

  e.hitFlash = o.dot ? Math.max(e.hitFlash, 0.35) : 1;

  if (dealt > 0) {
    e.hp -= dealt;
    const run = world.run;
    run.damageDealt += dealt;
    if (o.source === 'PLAYER') addUlt((o.dot ? 0.04 : 0.28) * Math.min(1, dealt / Math.max(1, e.maxHp)) + (o.dot ? 0 : o.basic ? ULT_PER_BASIC : ULT_PER_SKILL));
    if (!o.dot && dealt > run.highestHit) run.highestHit = dealt;
    // Life steal (gear affixes / sets / talents): direct player damage only; healed in chunks to limit floating text.
    if (o.source === 'PLAYER' && !o.dot) {
      const ls = useGameStore.getState().stats.lifeSteal;
      if (ls > 0) {
        lsAcc += Math.min(dealt, 4000) * ls;
        if (lsAcc >= 2) {
          if (world.time - lsWinT >= 1) { lsWinT = world.time; lsWin = 0; }
          const room = Math.max(0, useGameStore.getState().stats.maxHealth * LS_SEC_CAP - lsWin), h = Math.min(lsAcc, room);
          if (h > 0) { healPlayer(h); lsWin += h; }
          lsAcc = 0;
        }
      }
    }
  }

  // Player knockback / launches only trigger on half of the hits (designer: 50% less knockback chance).
  const knockRoll = o.source === 'PLAYER' ? Math.random() < KNOCK_CHANCE : true;
  if (o.launch && o.knockDir) { if (knockRoll) launchEnemy(e, o.knockDir.x, o.knockDir.z, o.launch, o.slam ?? 0); }
  else if (knockRoll && o.knockDir && o.knockback && !e.boss && e.freezeT <= 0) {
    const k = Math.min(KNOCK_MAX, o.knockback * KNOCK_SCALE) * (e.elite ? 0.5 : 1) * (e.mini ? 0.5 : 1);
    e.knock.x += o.knockDir.x * k;
    e.knock.z += o.knockDir.z * k;
  }

  events.emit('damage', { pos: e.pos, amount: dealt > 0 ? dealt : amount, crit: !!o.crit, kind: o.kind, toPlayer: false, dot: o.dot });
  if (!o.dot) events.emit('enemyHit', { pos: e.pos, kind: e.kind, dmgKind: o.kind, dir: o.knockDir });

  if (e.hp <= 0) {
    if (e.boss && hooks.bossFormDeath(e)) return;   // a transforming boss's first form: it respawns in form 2, no kill
    killEnv = o.env; killEnemy(e); killEnv = undefined;
  }
}

export function killEnemy(e: Enemy): void {
  if (!e.active || e.state === 'DYING') return;
  if (coopRoom.guest) return;   // co-op guest: only the host kills
  if (e.decoy) { popDecoy(e); return; } // Death Clones: no rewards
  e.hp = 0; // state -> DYING is set by onEnemyDeath (Engine-B)

  // Boss adds / body parts (saplings, hydra heads, imps): no xp, loot, gold or kill credit.
  if (isBossAdd(e.kind)) {
    onEnemyDeath(e);
    events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: false, boss: false, scale: e.scale });
    return;
  }

  if (e.bossAdd && !e.mini) {   // (owner 2026-10-26) summoned adds in a boss fight: no gold / xp / loot, only a small chance of an HP / MP orb or potion
    e.bossAdd = false;
    world.run.kills++;
    if (Math.random() < 0.22) {
      dropPos.set(e.pos.x + (Math.random() - 0.5), 0, e.pos.z + (Math.random() - 0.5));
      const r = Math.random();
      if (r < 0.4) spawnPickup('HEALTH', dropPos, 20);
      else if (r < 0.7) spawnPickup('MANA', dropPos, Math.max(25, useGameStore.getState().stats.maxMana * 0.2));
      else spawnPickup('ITEM', dropPos, 0, makeItemById(Math.random() < 0.5 ? 'potion_hp' : 'potion_mana', 1)[0]);
    }
    onEnemyDeath(e);
    events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: false, boss: false, scale: e.scale, env: killEnv });
    return;
  }
  riruruDied(e);   // (owner cameo) Riruru drops 3 Mana Potions
  const run = world.run;
  run.kills++;
  if (e.elite) run.eliteKills++;
  if (e.boss) run.bossKills++;
  addUlt(e.boss ? 15 : e.elite ? 4 : 0.85);

  const st = useGameStore.getState();
  const loot = runMods(st.difficulty).loot;
  const wave = world.director.wave;
  const px = e.pos.x, pz = e.pos.z;

  // Gold coins: humanoids (+ the Lich) only. Others still drop their loot items.
  let killGold = 0;   // (co-op: the partner is paid the same coins directly, see coopRoom.onKill)
  {
    let coins = 0, value = 10;
    const gd = GOLD_DROPPERS[e.kind];
    if (waves.on) { coins = e.boss ? 8 : e.mini ? 4 : e.elite ? 2 : Math.random() < 0.3 ? 1 : 0; value = Math.round(8 + wave * 1.5); }   // Endless Waves pays gold only
    else if (towerMode()) coins = 0;   // (tower / daily: Aether Crystals only, spawnPickup would drop the coins anyway)
    else if (gd) { value = gd[1]; coins = e.elite ? 2 : Math.random() < gd[0] ? 1 : 0; }
    for (let i = 0; i < coins; i++) {
      dropPos.set(px + (Math.random() - 0.5) * (e.boss ? 4 : 1.5), 0, pz + (Math.random() - 0.5) * (e.boss ? 4 : 1.5));
      spawnPickup('GOLD', dropPos, value);
    }
    killGold = coins * value;
  }

  // Trade-goods loot: kind table (chance), elites always add an Elite table roll, bosses roll their table twice.
  {
    const luck = loot * (1 + wave * 0.01) * (e.elite ? 1.5 : 1);
    if (towerMode()) { const c = towerCrystals(e.boss, e.mini, e.elite, wave); if (c > 0) dropCrystals(c, e.pos); }   // tower modes: crystals, never loot
    else dropTable(e, luck, px, pz);   // (owner) one weighted table per kill: few drops, each a core / gear / material
  }

  // XP is granted instantly (no orbs), scaled by monster strength at spawn time (see spawnEnemy).
  if (e.xp > 0) grantKillXp(e.xp, e.pos);
  coopRoom.onKill?.(e, e.xp, killGold);   // co-op host: the partner earns the same XP / gold

  if (Math.random() < 0.006) {   // heart drops: -80%
    dropPos.set(px + (Math.random() - 0.5), 0, pz + (Math.random() - 0.5));
    if (Math.random() < 0.4) spawnPickup('MANA', dropPos, Math.max(25, useGameStore.getState().stats.maxMana * 0.2));   // (owner) sometimes a mana orb instead of a heart
    else spawnPickup('HEALTH', dropPos, 20);
  }

  onEnemyDeath(e);
  events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: e.elite, boss: e.boss, scale: e.scale, mini: e.mini, env: killEnv });
  if (e.boss) addShake(0.8);
  else if (e.elite) addShake(0.25);
}

// ------------------------------------------------------------------- drops ---
/** (owner) Kill drops: bosses 1-2 rolls (rarely 3), elites 1 (sometimes 2), normal monsters only on a 8% chance, 1 roll.
 *  Boss roll: 40% upgrade core (Refined: 10% + 4% per biome, max 40%), 30% gear (+0..4), 20% the boss's own rare material, 10% gold.
 *  Elite roll: 50% gear (capped at Epic), 20% upgrade core, 30% crafting material (+ the elite trophy table).
 *  Normal roll: 10% upgrade core, 60% monster loot (1 in 6 of those a low-rarity piece of gear), 30% crafting material. */
const CRAFT_TABLES = ['ORE', 'CRYSTAL'];
function dropCore(x: number, z: number, refined: number): void {
  dropPos.set(x + (Math.random() - 0.5) * 1.6, 0, z + (Math.random() - 0.5) * 1.6);
  spawnPickup('ITEM', dropPos, 0, makeItemById(Math.random() < refined ? 'upgrade_core_2' : 'upgrade_core', 1)[0]);
}
function dropGear(it: ReturnType<ReturnType<typeof useGameStore.getState>['rollItemDrop']>, x: number, z: number): void {
  if (!it) return;
  dropPos.set(x + (Math.random() - 0.5) * 1.6, 0, z + (Math.random() - 0.5) * 1.6);
  spawnPickup('ITEM', dropPos, 0, it);
}
const RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
/** `special`: mini bosses / champions use the elite table with 1-2 rolls and better + odds. */
export function dropTable(e: Enemy, luck: number, px: number, pz: number, special = false): void {
  const st = useGameStore.getState(), run = world.run;
  const biome = Math.max(0, world.room.biome | 0);
  if (e.boss) {
    const n = Math.random() < 0.08 ? 3 : Math.random() < 0.4 ? 2 : 1;
    const before = run.bossKills - 1, hm = runInfo.hard ? HARD_EPIC_MUL : 1;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.4) { if (Math.random() < 0.5) dropCore(px, pz, Math.min(0.4, 0.1 + 0.04 * biome)); }   // (owner) core drops halved
      else if (r < 0.7) {
        // bosses beaten before this one: the first boss never drops MYTHIC, LEGENDARY opens up after it
        let rarity: Rarity = 'EPIC';
        if (before >= 1 && Math.random() < Math.min(0.012, 0.004 * before) * hm) rarity = 'MYTHIC';
        else if (Math.random() < (before >= 1 ? Math.min(0.22, 0.07 + 0.04 * before) : 0.02) * hm) rarity = 'LEGENDARY';
        dropGear(rollDropPlus(st.rollItemDrop(rarity), 2), px, pz);
      } else if (r < 0.9) dropLoot(e.kind, luck, px, pz, true, run.bossKills >= 2);
      else for (let k = 0; k < 4; k++) { dropPos.set(px + (Math.random() - 0.5) * 3, 0, pz + (Math.random() - 0.5) * 3); spawnPickup('GOLD', dropPos, 12 + world.director.wave); }
    }
    return;
  }
  if (e.elite || special) {
    const n = Math.random() < (special ? 0.45 : 0.15) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.5) dropGear(rollDropPlus(st.rollItemDrop(undefined, { biome, elite: true }), special ? 1 : 0), px, pz);   // biome table, up to Legendary High (biomeLoot.ts)
      else if (r < 0.7) { if (Math.random() < 0.5) dropCore(px, pz, 0.03 + 0.01 * biome); }
      else dropLoot(Math.random() < 0.5 ? 'ELITE' : CRAFT_TABLES[Math.floor(Math.random() * 2)], luck, px, pz, true);
    }
    return;
  }
  if (Math.random() >= 0.08 * Math.max(1, luck * 0.5)) return;
  const r = Math.random();
  if (r < 0.1) { if (Math.random() < 0.5) dropCore(px, pz, 0); }
  else if (r < 0.7) { if (Math.random() < 1 / 6) { dropGear(st.rollItemDrop(undefined, { biome, elite: false }), px, pz); } else dropLoot(e.kind, luck, px, pz, true); }   // gear: biome table, up to Legendary Low
  else dropLoot(CRAFT_TABLES[Math.floor(Math.random() * 2)], luck, px, pz, true);
}

// ------------------------------------------------------------------- player --
const knockOut: number[] = [];
const phoenixColor = COLORS.rarityLegendary;

export function healPlayer(amount: number): void {
  const p = world.player;
  if (!p.alive || amount <= 0) return;
  amount *= runInfo.ascension >= 4 ? runMods(useGameStore.getState().difficulty).heal : 1;   // Ascension 4: weaker healing
  amount *= world.roomEvt.twist === 'CURSED' && world.director.phase === 'FIGHT' ? 0.35 : 1;   // Cursed Ground twist
  amount *= dailyMods.heal;   // Daily Trial: Bloodthirst
  if (towerMode()) amount *= 0.6;   // tower modes: healing -40% (owner)
  const max = useGameStore.getState().stats.maxHealth;
  const before = p.hp;
  p.hp = Math.min(max, p.hp + amount);
  if (p.hp > before) events.emit('heal', { pos: p.pos, amount: p.hp - before });
}

function triggerBarrier(level: number): void {
  const p = world.player;
  p.shieldCharges--;
  if (p.shieldCd <= 0) p.shieldCd = p.shieldCdMax;
  p.invulnT = Math.max(p.invulnT, 1 + 0.2 * level);
  const radius = 10 + 2 * level;
  const force = (5 + level) * 4;
  const ids = world.enemyGrid.query(p.pos.x, p.pos.z, radius + 4, knockOut);
  const r2 = radius * radius;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) || 1;
    if (!e.boss) { e.knock.x += (dx / d) * force; e.knock.z += (dz / d) * force; }
    applyStatus(e, { type: 'STUN', duration: 2 });
  }
  events.emit('shieldBlock', { pos: p.pos, radius });
  events.emit('shockwave', { pos: p.pos.clone(), radius, color: 0x22d3ee });
  addShake(0.2);
}

export type PlayerDebuff = 'STUN' | 'ROOT' | 'SILENCE' | 'DEFDOWN' | 'BLIND' | 'BURN' | 'POISON' | 'BLEED' | 'SLOW';

/** True while the player cannot be affected by monster tricks (dash / i-frames). */
export function playerTrickImmune(): boolean {
  const p = world.player;
  return !p.alive || p.invulnT > 0 || (p.dashIframes && (p.dashT > 0 || p.anim.dashing));
}

/** (owner) Hero slow strength = share of move speed lost. Normal monsters / projectiles / traps 45%, bosses 60% (was a flat 40% for everything). */
export const SLOW_HERO = 0.45;
export const SLOW_BOSS = 0.6;
/** Direct slow (no debuff word / immunity): used by hit-with-slow paths. */
export function slowHero(dur: number, pow = SLOW_HERO): void {
  if (world.player === coopRoom.ally) { coopRoom.fwdDebuff?.('SLOW', dur, pow, 2); return; }
  const p = world.player;
  p.slowPow = p.slowT > 0 ? Math.max(p.slowPow, pow) : pow;
  p.slowT = Math.max(p.slowT, dur);
}
/** Applies a monster-trick debuff to the player. Dash/i-frames ignore it. Returns true when applied. */
/** A freeze is a stun shown as ice (StatusFx): set by real freezes only, so other stuns (boar knockdown etc.) read as stuns. */
export const playerFreeze = { until: 0 };
export function freezePlayer(duration: number): boolean {
  if (world.player === coopRoom.ally) { if (playerTrickImmune()) return false; coopRoom.fwdDebuff?.('STUN', duration, 0, 1); return true; }
  duration *= 1 - useGameStore.getState().stats.resFrost;   // Frost Resistance shortens freezes
  if (!applyPlayerDebuff('STUN', duration)) return false;
  playerFreeze.until = Math.max(playerFreeze.until, world.time + duration);
  return true;
}
export function applyPlayerDebuff(type: PlayerDebuff, duration: number, value = 0): boolean {
  if (world.player === coopRoom.ally) { if (!playerTrickImmune()) coopRoom.fwdDebuff?.(type, duration, value, 0); return true; }
  const p = world.player;
  if (playerTrickImmune()) return false;
  {   // status resistance: burn / poison / slow (and freezes, via freezePlayer) last shorter
    const rs = useGameStore.getState().stats;
    const r = type === 'BURN' ? rs.resBurn : type === 'POISON' ? rs.resPoison : type === 'SLOW' ? rs.resFrost : 0;
    if (r > 0) duration *= 1 - r;
    if ((type === 'STUN' || type === 'ROOT') && rs.resCC > 0) duration *= 1 - rs.resCC;   // CC Resistance: stuns (fear / freeze too) and roots last shorter
  }
  const was = type === 'STUN' ? p.stunT : type === 'ROOT' ? p.rootT : type === 'SILENCE' ? p.silenceT : type === 'DEFDOWN' ? p.defDownT : type === 'BLIND' ? p.blindT
    : type === 'BURN' ? p.burnT : type === 'POISON' ? p.poisonT : type === 'BLEED' ? p.bleedT : p.slowT;
  if (was <= 0) statusWord(p.pos, type, true);
  switch (type) {
    case 'STUN': p.stunT = Math.max(p.stunT, duration); break;
    case 'ROOT': p.rootT = Math.max(p.rootT, duration); break;
    case 'SILENCE': p.silenceT = Math.max(p.silenceT, duration); break;
    case 'DEFDOWN': p.defDownT = Math.max(p.defDownT, duration); break;
    case 'BLIND': p.blindT = Math.max(p.blindT, duration); break;
    case 'BURN': p.burnT = Math.max(p.burnT, duration); p.burnDps = Math.max(p.burnDps, value); break;
    case 'POISON': p.poisonT = Math.max(p.poisonT, duration); p.poisonDps = Math.max(p.poisonDps, value); break;
    case 'BLEED': p.bleedT = Math.max(p.bleedT, duration); p.bleedDps = Math.max(p.bleedDps, value); break;
    case 'SLOW': {   // (owner) stronger slows: `value` = share of speed lost (default SLOW_HERO), the strongest live slow wins
      const pow = Math.min(0.75, value > 0 ? value : SLOW_HERO);
      p.slowPow = p.slowT > 0 ? Math.max(p.slowPow, pow) : pow;
      p.slowT = Math.max(p.slowT, duration); break;
    }
  }
  combatStats.debuffs[type] = (combatStats.debuffs[type] ?? 0) + 1;
  events.emit('playerDebuff', { type, duration });
  return true;
}

/** Dash cleanses root and slows (and ends DoTs' slow component). */
/** Hook so boss specials can react to a dash (Soul Chains break). */
export function cleansePlayer(): void {
  const p = world.player;
  p.rootT = 0; p.slowT = 0; p.slowPow = 0;
  hooks.onCleanse();
}

/** Necromancer Bone Armor: each living minion soaks a little damage (max 30%) for the hero AND the minions. 1 = none. */
export function boneArmorMul(): number {
  const st = useGameStore.getState();
  if (st.hero !== 'NECROMANCER' || !(st.skillLevels.boneArmor > 0)) return 1;
  let n = 0; for (const m of world.minions) if (m.active) n++;
  return 1 - Math.min(0.3, n * (0.03 + 0.01 * (st.skillLevels.boneArmor - 1)));
}

/** Second Wind (run card): heal a share of max HP whenever a room is cleared. */
events.on('waveClear', () => { if (runCards.secondWind > 0) healPlayer(useGameStore.getState().stats.maxHealth * runCards.secondWind); });

const reflectOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', noBackstab: true };
/** Radiant shield reflect: to the known attacker, else the nearest enemy within 6 units of the hero. */
function reflectRadiant(dmg: number, src?: Enemy): void {
  const p = world.player;
  const t = src && src.active && src.state !== 'DYING' ? src : findNearestEnemy(p.pos.x, p.pos.z, 6);
  if (!t) return;
  events.emit('floatText', { pos: t.pos, text: 'REFLECT', color: 0xffe08a, scale: 0.6, dy: 2.0 });
  damageEnemy(t, dmg, reflectOpts);
}

/** Hero knockback / knockdown tuning (owner: big telegraphed hits push the hero, the heaviest knock it down; ordinary hits never). */
export const KNOCK_TIME = 0.2;          // s of the eased slide
export const KNOCK_IMMUNE = 1.6;        // s after a knockdown starts during which no new knockdown lands (down + get-up + invuln gap)
export const GETUP_INVULN = 0.6;        // s of invulnerability after getting up
export const KB_MAX = 6;                // clamp for a single push (units)
/** Attack-strength presets: { kb: push distance (u), down: knockdown seconds (0 = none) }. Passed as damagePlayer `kb`/`down`. */
export const KB = {
  FLINCH: { kb: 0.5, down: 0 },    // big monsters' ordinary swings
  PUSH:   { kb: 3.2, down: 0 },    // mini-boss / elite cones, charges that clip, boss secondary hits
  HEAVY:  { kb: 4.5, down: 0 },    // big telegraphed strikes that stun
  SLAM:   { kb: 5, down: 1.0 },    // boss signature slams, elite ground slams, charges / tackles that connect (owner: high-impact hits = 1 s down)
  CRUSH:  { kb: 6, down: 1.2 },    // the very heaviest (final bosses' ults)
  ROCK:   { kb: 4.5, down: 1.0 },  // (owner) any rock hit is hard + heavy: thrown rocks, rock slams, rockfall
  BOULDER: { kb: 6, down: 3.0 },   // (owner) Gorath's 360 rock ring + the prison meteor: 3 s on the ground (a dash gets you up)
} as const;
let knockWordT = -10;

/** Knocks the hero back from (fromX, fromZ) by `force` units (eased over KNOCK_TIME, resolved against walls / colliders in player.ts)
 *  and, when `downSec` > 0, knocks it down for that long (no move / attack / skills, get up with GETUP_INVULN s of invulnerability).
 *  Shield Wall / Divine Avatar / giant form / ult / Radiant shield / heavy Bone Armor resist the knockdown and shorten the push. */
export function knockHero(fromX: number, fromZ: number, force: number, downSec = 0, cancel = false): void {
  if (world.player === coopRoom.ally) { coopRoom.fwdKnock?.(fromX, fromZ, force, downSec, cancel); return; }
  const p = world.player;
  if (!p.alive || force <= 0 && downSec <= 0) return;
  if (((p.dashT > 0 || p.anim.dashing) && p.dashIframes) || p.sprintT > 0 || p.invulnT > 0) return;   // i-frames: not even pushed
  if (p.downT > 0) return;   // already on the ground
  const unstoppable = p.guardT > 0 || p.avatarT > 0 || p.titanT > 0 || p.ultT > 0 || p.radiant > 0 || p.whirlT > 0 || boneArmorMul() <= 0.8;
  if (unstoppable) { force *= 0.35; downSec = 0; }
  else if (p.arcane > 0 || p.aegis > 0) force *= 0.7;
  { const cc = useGameStore.getState().stats.resCC; if (cc > 0) { force *= 1 - cc; downSec *= 1 - cc; } }   // CC Resistance: shorter knockdown, shorter push
  if (downSec > 0 && (p.knockImmuneT > 0 || p.stunT > 0 || p.rootT > 0)) { downSec = 0; force *= 0.5; }   // no chain knockdowns; already stunned / frozen / rooted: only the push
  force = Math.min(KB_MAX, force);
  if (force < 0.05 && downSec <= 0) return;
  let dx = p.pos.x - fromX, dz = p.pos.z - fromZ;
  let l = Math.sqrt(dx * dx + dz * dz);
  if (l < 0.05) { dx = -Math.sin(p.facing); dz = -Math.cos(p.facing); l = 1; }   // dead centre: fall backwards
  p.knockDx = dx / l; p.knockDz = dz / l;
  p.knockDist = force; p.knockDur = KNOCK_TIME; p.knockT = KNOCK_TIME; p.knockDone = 0;
  if (cancel) { hooks.cancelCast(); p.fireT = Math.max(p.fireT, KNOCK_TIME + 0.25); }   // (monster trait) the shove interrupts the cast and pauses basic attacks during the knockback
  if (downSec > 0) {
    p.downT = p.downMax = downSec; p.knockImmuneT = downSec + KNOCK_IMMUNE;
    p.dashT = 0; p.fireT = Math.max(p.fireT, downSec); p.vel.set(0, 0, 0);
    if (world.village.ride.on) hooks.dismount();
    if (world.time - knockWordT > 0.8) { knockWordT = world.time; events.emit('floatText', { pos: p.pos, text: 'DOWN', color: 0xffd27a, scale: 1.1, dy: 2.8 }); }
    addShake(0.35);
  }
}

/** (owner) ticking damage on the hero (poison / burn / bleed, lava, rifts, spikes, thorns, gas, fire patches) is multiplied by this. */
export const HERO_DOT_MUL = 4;

/** (monster traits) the on-hit effects of a trait-carrying monster's hit on the hero: poison / defense / attack / slow debuffs, stun, knockback (cancels the
 *  cast), knockdown. Each has a chance or short duration so a pack of them stays fair. */
let hindGuard = -10;
/** Slow / root on the hero with diminishing returns: right after one the next root is skipped and slows are cut short, so the hero is never perma-rooted. */
function hinder(type: 'SLOW' | 'ROOT', dur: number, pow = 0): void {
  const now = world.time;
  if (now < hindGuard) { if (type === 'ROOT') return; dur *= 0.4; }
  if (applyPlayerDebuff(type, dur, pow)) hindGuard = Math.max(hindGuard, now + dur + (type === 'ROOT' ? 3 : 1));
}
function applyTraitHit(tr: number, from?: Vector3, boss = false): void {
  const p = world.player, wave = world.director.wave;
  if (tr & TR.POISON) applyPlayerDebuff('POISON', 4, 1 + wave * 0.3);
  if (tr & TR.DEF_BREAK) applyPlayerDebuff('DEFDOWN', 5);
  if (tr & TR.ATK_BREAK && !playerTrickImmune()) { p.buffDmg = Math.min(p.buffDmg, -0.25); p.buffT = Math.max(p.buffT, 6); events.emit('floatText', { pos: p.pos, text: 'WEAKENED', color: 0xcbd5e1, scale: 0.9, dy: 2.6 }); }
  if (tr & TR.SLOW) hinder('SLOW', 2.5, boss ? SLOW_BOSS : SLOW_HERO);
  if (tr & TR.HIND_SLOW) hinder('SLOW', boss ? 2.4 : 1.8, boss ? SLOW_BOSS : SLOW_HERO);
  if (tr & TR.HIND_ROOT) hinder('ROOT', 0.8);
  if (tr & TR.STUN && Math.random() < 0.3) applyPlayerDebuff('STUN', 0.8);
  if (!from) return;
  if (tr & TR.KNOCKDOWN && Math.random() < 0.35) knockHero(from.x, from.z, 3.4, 0.7);
  else if (tr & TR.KNOCK) knockHero(from.x, from.z, 3.2, 0, true);
}

export function damagePlayer(amount: number, o?: { /** hit for this share of the hero's MAX hp (boss phase attacks, see bossPhases.ts) */ pct?: number; pos?: Vector3; kind?: DamageKind; slow?: number; dot?: boolean; src?: Enemy; /** push distance (u) */ kb?: number; /** knockdown seconds */ down?: number; /** the attacker's TR.* trait bits (projectiles / telegraphs that carry them) */ tr?: number; /** terrain / hazard tick (spikes, lava, thorns, gas, fire patches): counts as ticking damage (HERO_DOT_MUL) */ env?: boolean; /** a boss aura tick: ticking, but not multiplied */ noDotMul?: boolean; /** an enemy PROJECTILE hit: the class projectile resist applies (dashMods.PROJ_RESIST) */ proj?: boolean; /** the shooter's enemy id (projectiles) */ srcId?: number; /** MECHANIC-CHECK hit (Avalanche, Tidal Wave, Sandstorm, collapses): needs `pct`; dodge roll, dash / dodge i-frames and the Energy Shield do NOT stop it (only the safe spot does); no defence reduction; leaves 1 HP when the hero is above 50% max HP, can kill at or below it. Big red number + screen flash */ crit?: boolean }): void {
  if (world.player === coopRoom.ally) { coopRoom.fwdHit?.(amount, o); return; }   // co-op host: this blow lands on the partner's hero (he applies his own defence)
  const p = world.player;
  const st = useGameStore.getState();
  if (!p.alive || (st.status !== GameStatus.PLAYING && !(world.village.cave.combat && world.village.area === 'CAVE'))) return;   // (deep cave floors fight too)
  if (debug.god) return;   // debug god mode
  if (o?.proj) amount *= (1 - PROJ_RESIST[st.hero]) * (1 - st.stats.resProj);   // class projectile resist (Knight 25%, Barbarian 15%, Necromancer 10%) x the gear / talent Projectile Resistance
  {   // damage-type resistances (gear / talents): fire / poison / ice hits, burn / poison ticks included
    const dk = o?.kind;
    if (dk === 'FIRE') amount *= 1 - st.stats.resBurn; else if (dk === 'POISON') amount *= 1 - st.stats.resPoison; else if (dk === 'ICE') amount *= 1 - st.stats.resFrost;
  }
  amount *= DMG_INFLATE;   // (owner) monsters / bosses / hazards hit twice as hard (hero HP is x2 too, store HP_INFLATE)
  const isDot = !!o?.dot;
  if ((isDot || o?.env) && !o?.noDotMul) amount *= HERO_DOT_MUL;   // (owner) ticking damage hurts the hero 4x more
  const crit = !!(o?.crit && o.pct);   // mechanic-check hit: dash / dodge i-frames never negate it (an ultimate or a fresh revive still does)
  if (!isDot && (crit ? (p.ultT > 0 || p.reviveFx > 0) : (p.invulnT > 0 || (p.dashIframes && (p.anim.dashing || p.dashT > 0))))) return;
  const kind = o?.kind ?? 'PHYSICAL';
  if (!isDot && world.village.miningT > 0) {   // a hit knocks the hero out of mining (owner)
    world.village.miningT = 0; world.village.harvestCd = 1.2;
    events.emit('floatText', { pos: p.pos, text: 'Interrupted!', color: 0xffb070, scale: 0.9, dy: 2.4 });
  }

  if (!isDot && !crit && st.stats.dodge > 0 && Math.random() < st.stats.dodge) return;
  if (!isDot && !o?.env) {   // (owner 2026-10-25) remember who hit the hero: it hits back (player.ts)
    let src: Enemy | null = o?.src ?? (o?.srcId !== undefined && o.srcId >= 0 ? world.enemies[o.srcId] ?? null : null);
    if (!src && o?.pos) {   // melee / scripted hits pass the attacker's position: the nearest monster to it
      let bd = 16;
      const L = world.enemies;
      for (let i = 0; i < L.length; i++) {
        const q = L[i]; if (!q.active || q.state === 'DYING') continue;
        const d2 = (q.pos.x - o.pos.x) ** 2 + (q.pos.z - o.pos.z) ** 2;
        if (d2 < bd) { bd = d2; src = q; }
      }
    }
    if (!src && world.boss.active) { const L = world.enemies; for (let i = 0; i < L.length; i++) if (L[i].active && L[i].boss) { src = L[i]; break; } }   // boss scripts (beams, slams far away)
    if (src && src.active && src.state !== 'DYING') noteAttacker(src);
  }

  const barrier = st.skillLevels.barrier;
  const mods = runMods(st.difficulty);
  // CURSE: defense -30%. Deeper monsters pierce armour (defense counts 1/(1 + 2.5% per depth)): late-game gear stacks
  // hundreds of defense, which made the last biomes easier than the first ones.
  const def = (st.stats.defense + p.buffDef) * (p.defDownT > 0 ? 0.7 : 1) / (1 + 0.025 * Math.max(0, world.director.wave - 1));
  const holy = (p.guardT > 0 ? 1 - p.guardRed : 1);   // knight Shield Wall
  // Necromancer Bone Armor: each living minion soaks a little (max 30%)
  const bone = boneArmorMul();
  let reduced = Math.max(1, amount * (100 / (100 + def)) * mods.dmg * (1 - Math.min(0.6, st.stats.dmgReduce))   /* (owner 2026-10-25: cap 60%, was 80%: stacked Bulwark cards made the hero unkillable) */ * holy * bone * dailyMods.taken * (runCards.slayer > 0 && bossAlive() ? 1 - runCards.slayer : 1));   // (dailyMods.taken: Daily Trial Glass Cannon)
  if (crit) { reduced = st.stats.maxHealth * o!.pct!; if (p.hp > st.stats.maxHealth * 0.5) reduced = Math.min(reduced, p.hp - 1); }   // mechanic hit: flat share of max HP; above 50% HP it leaves at least 1 HP, at or below 50% it can kill
  else if (o?.pct) { reduced = st.stats.maxHealth * o.pct * (1 - Math.min(0.3, st.stats.dmgReduce * 0.5)); if (p.hp > st.stats.maxHealth * 0.25) reduced = Math.min(reduced, p.hp - 1); }   // boss phase hits: a share of max HP (bypasses defence; never lethal unless the hero is already under 25%)
  // Energy Shield only saves you when this hit would leave you under 20% HP.
  if (!isDot && barrier > 0 && p.shieldCharges > 0 && kind !== 'POISON' && (crit ? p.hp - reduced <= 0 : p.hp - reduced < st.stats.maxHealth * 0.2)) {   // (a mechanic hit only trips it when it would kill)
    triggerBarrier(barrier);
    return;
  }
  // Aegis (card): the shield soaks the hit first; only what breaks through reaches health
  let toHp = reduced;
  if (p.radiant > 0 && !crit) {   // (a mechanic hit ignores every soak shield: only the safe spot saves you) Knight Radiant shield (gold): soaks first and reflects 20% of the hit to the attacker
    const soak = Math.min(p.radiant, toHp);
    p.radiant -= soak; toHp -= soak;
    if (!isDot) reflectRadiant(reduced * 0.2, o?.src);
    if (p.radiant <= 0) {
      p.radiant = 0; p.radiantMax = 0; p.radiantT = 0;
      events.emit('floatText', { pos: p.pos, text: 'RADIANCE FADES', color: 0xffe08a, scale: 0.9, dy: 2.6 });
      events.emit('shockwave', { pos: p.pos.clone(), radius: 3.4, color: 0xffe08a });
    }
  }
  if (p.arcane > 0 && !crit) {   // Wizard Arcane Shield (purple) soaks first
    const soak = Math.min(p.arcane, toHp);
    p.arcane -= soak; toHp -= soak;
    if (p.arcane <= 0) {
      p.arcane = 0; p.arcaneMax = 0; p.arcaneT = 0;
      events.emit('floatText', { pos: p.pos, text: 'SHIELD SHATTERED', color: 0xc084fc, scale: 0.9, dy: 2.6 });
      events.emit('shockwave', { pos: p.pos.clone(), radius: 3.4, color: 0xa855f7 });
      events.emit('explosion', { pos: p.pos.clone(), radius: 1.6, color: 0xc084fc });
    }
  }
  if (p.aegis > 0 && !crit) {
    const soak = Math.min(p.aegis, toHp);
    p.aegis -= soak; toHp -= soak;
    if (p.aegis <= 0) { p.aegis = 0; p.aegisMax = 0; events.emit('floatText', { pos: p.pos, text: 'SHIELD BROKEN', color: 0x9fdcff, scale: 0.9, dy: 2.6 }); events.emit('shockwave', { pos: p.pos.clone(), radius: 3, color: 0x9fdcff }); }
  }
  p.hp -= toHp;
  if (!isDot && !o?.env && st.hero === 'KNIGHT' && st.skillLevels.smite > 0 && p.hp > 0) procFlags.smite = st.skillLevels.smite;   // Righteous Riposte (skills.ts)
  if (!isDot) p.anim.hurtT = 1;
  if (!isDot && o && o.pos && (o.kb || o.down) && p.hp > 0) knockHero(o.pos.x, o.pos.z, o.kb ?? 0, o.down ?? 0);
  if (o?.slow && o.slow > 0) slowHero(2 * (1 - st.stats.resFrost), o.src?.boss ? SLOW_BOSS : SLOW_HERO);   // (owner) 2 s (was 1.5), 45% / boss 60%
  { const tr = o?.tr ?? o?.src?.traits ?? 0; if (!isDot && tr && p.hp > 0) applyTraitHit(tr, o?.pos ?? o?.src?.pos, !!o?.src?.boss); }

  const run = world.run;
  run.damageTaken += reduced;

  // Thorns: reflect flat damage to enemies in melee range (at most ~3 times a second).
  if (!isDot && st.stats.thorns > 0 && kind !== 'POISON' && world.run.time - thornT > 0.33) {
    thornT = world.run.time;
    damageEnemiesInRadius(p.pos.x, p.pos.z, 4.5, st.stats.thorns * (1 + st.stats.damage * 0.04), thornOpts);
  }

  if (!isDot) events.emit('playerHit', { pos: p.pos, amount: reduced, big: crit && o!.pct! >= 0.3 });
  events.emit('damage', { pos: p.pos, amount: reduced, crit: crit && o!.pct! >= 0.3, kind, toPlayer: true, dot: isDot });
  if (!isDot) addShake(Math.min(0.4, Math.max(0.15, (reduced / st.stats.maxHealth) * 1.2)));

  if (p.hp > 0) return;
  if (st.status !== GameStatus.PLAYING) { p.hp = 0; return; }   // cave: no game over (engine/systems/cave.ts turns it into a cave-in)

  // Death: Phoenix -> Ankh -> game over.
  const pet = st.equipment.pet;
  if (pet && pet.petSkill === 'REVIVE' && p.petReviveCd <= 0) {
    p.hp = st.stats.maxHealth * 0.5;
    p.petReviveCd = pet.petCooldown || 300;
    p.invulnT = Math.max(p.invulnT, 5);
    p.reviveFx = 1;
    st.addNotification('PHOENIX REVIVE!', phoenixColor, 'SYSTEM');
    events.emit('playerRevive', { pos: p.pos, source: 'PHOENIX' });
    return;
  }
  // Death Defiance (run card): spend a charge, rise again with the card's HP share (automatic, no prompt)
  if (runCards.defiance > 0) {
    runCards.defiance--;
    p.hp = st.stats.maxHealth * runCards.defianceHp;   // (40 / 50 / 70% by the best Death Defiance card's rarity)
    p.mana = Math.max(p.mana, st.stats.maxMana * 0.5);
    p.invulnT = Math.max(p.invulnT, 5);
    p.reviveFx = 1;
    st.addNotification(`DEATH DEFIED! (${runCards.defiance} charge${runCards.defiance === 1 ? '' : 's'} left)`, COLORS.rarityLegendary ?? COLORS.rarityEpic, 'SYSTEM');
    events.emit('playerRevive', { pos: p.pos, source: 'DEFIANCE' });
    return;
  }
  // (the Ankh of Life is no longer automatic: the death flow offers it, see ankhOffer / reviveWithAnkh)

  p.hp = 0;
  p.alive = false;
  p.vel.set(0, 0, 0);
  if (coopRoom.canBeDowned()) {   // co-op: with the partner still on his feet we go DOWN instead of dying; he can revive us (3 s next to us), see net/coop.ts reviveTick + player.ts death flow
    p.downed = true;
    st.addNotification('You are down! Your friend can revive you.', '#ff9a9a', 'WARNING');
  }
  events.emit('playerDeath', { pos: p.pos });
  addShake(0.5);
}
