// ============================================================================
// Combat: damage in/out, death + loot, healing, status effects.
// Engine-B (enemies/bosses/director) calls into this module.
// ============================================================================
import { lockedEnemy } from './target';
import { debug } from '../debug';
import { dropLoot } from './loot';
import { Vector3 } from 'three';
import { world } from '../world';
import { events, type DamageKind } from '../events';
import type { Enemy } from '../types';
import type { Rarity, StatusEffectType } from '../../types';
import { GameStatus } from '../../types';
import { comboMul, registerHit } from './combo';
import { useGameStore } from '../../store';
import { COLORS } from '../../constants';
import { runMods, runInfo } from '../runMods';
import { GOLD_DROPPERS, isBossAdd } from '../enemyDefs';
import { spawnPickup } from './pickups';
import { onEnemyDeath, crabArmor, shieldBlock } from './enemies';
import { popDecoy } from './bossSpecials';
import { bossWarded } from './bossMech';
import { hooks } from './hooks';

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
}

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
  value?: number;
}

const dropPos = new Vector3();
let lsAcc = 0;
let thornT = -1;
const thornOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET' };

/** Counters for QA / run stats of the combat-depth systems. */
export const combatStats = { backstabs: 0, slams: 0, staggers: 0, xpFromKills: 0, armorBreaks: 0, debuffs: {} as Record<string, number> };
export const BACKSTAB_DOT = -0.3;
export const BACKSTAB_MULT = 1.3;
const ARMOR_BREAK_FACTOR = 0.75;
const ARMOR_BREAK_TIME = 6;
let lastBackstabText = -10;
let lastSlamText = -10;
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
export function resetCombat(): void { xpAcc = 0; xpTextT = 0; lastBackstabText = -10; lastSlamText = -10; }

/** Big knockback: launches the enemy `dist` units away along (dx,dz); slam damage if it hits an obstacle while flying. */
export function launchEnemy(e: Enemy, dx: number, dz: number, dist: number, slam = 0): void {
  if (!e.active || e.state === 'DYING' || e.boss || e.freezeT > 0) return;
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
  if (dmg > 0) damageEnemy(e, dmg, { kind: 'PHYSICAL', source: 'PLAYER', noBackstab: true });
}

function gainStagger(e: Enemy, amount: number): void {
  if (e.staggerT > 0 || e.staggerCd > 0 || e.staggerMax <= 0) return;
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
/** Ultimate charge (0..100) from damage dealt and kills. */
export function addUlt(n: number): void {
  const p = world.player;
  if (p.ultT > 0 || p.ult >= 100) return;
  const wl = useGameStore.getState().skillLevels.weapon;
  p.ult = Math.min(100, p.ult + n * 0.868 * (1 + 0.1 * Math.max(0, wl - 1))); // ult charge (+40% vs 0.62)
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
  }
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 0.05) out.set(Math.sin(p.facing), 0, Math.cos(p.facing));
  else out.set(dx / l, 0, dz / l);
  return out;
}

const nearOut: number[] = [];
/** Nearest hittable enemy within maxR of (x,z), or null. */
export function findNearestEnemy(x: number, z: number, maxR: number): Enemy | null {
  const ids = world.enemyGrid.query(x, z, maxR, nearOut);
  let best: Enemy | null = null;
  let bestD = maxR * maxR;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

const aoeOut: number[] = [];
const aoeDir = new Vector3();
/**
 * Damages every hittable enemy whose centre is within `radius` of (x,z).
 * Optionally knocks away from the centre and applies a status. Returns hit count.
 */
export function damageEnemiesInRadius(
  x: number, z: number, radius: number, amount: number, o: DamageOpts, status?: StatusEffect, excludeId = -1,
): number {
  const ids = world.enemyGrid.query(x, z, radius + 4, aoeOut);
  const r2 = radius * radius;
  let hits = 0;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (e.id === excludeId || !e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    if (dx * dx + dz * dz > r2) continue;
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
  const st = useGameStore.getState();
  st.addExperience(xp);
  world.run.xpEarned += xp;
  combatStats.xpFromKills += xp;
  const gain = (st.level >= 10 ? xp * 2 : xp) * 2 * (1 + st.stats.xpBonus);
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
  const fresh = !statusActive(e, effect.type);
  applyStatusRaw(e, effect);
  if (fresh && statusActive(e, effect.type)) statusWord(e.pos, effect.type);
}

function applyStatusRaw(e: Enemy, effect: StatusEffect): void {
  const durMult = e.boss ? 0.25 : e.elite ? 0.5 : 1;
  switch (effect.type) {
    case 'BURN': {
      const v = effect.value ?? 5;
      if (v >= 0.5) { // real burn source (not the visual-only tint of fire zones): stack up to 3 (+talents)
        if (e.burnT <= 0) { e.burnStacks = 1; e.burnStackCd = 0.3; }
        else if (e.burnStackCd <= 0) { e.burnStacks = Math.min(3 + (useGameStore.getState().stats.burnStacks | 0), e.burnStacks + 1); e.burnStackCd = 0.3; }
      } else if (e.burnT <= 0) e.burnStacks = Math.max(1, e.burnStacks);
      e.burnT = Math.max(e.burnT, effect.duration);
      e.burnDps = Math.max(e.burnDps, v);
      break;
    }
    case 'POISON':
      e.poisonT = Math.max(e.poisonT, effect.duration);
      e.poisonDps = Math.max(e.poisonDps, effect.value ?? 3);
      break;
    case 'FREEZE':
    case 'STUN': {
      const bonus = useGameStore.getState().stats.stunBonus || 0;
      const dur = effect.duration + (bonus > 0 ? bonus : 0);
      if (e.boss || e.mini) { gainStagger(e, dur * (effect.type === 'STUN' ? 30 : 24)); return; } // immune to full stun: fills STAGGER instead
      if (effect.type === 'FREEZE') e.freezeT = Math.max(e.freezeT, dur * durMult);
      else e.stunT = Math.max(e.stunT, dur * durMult);
      break;
    }
    case 'SLOW': {
      const f = Math.min(0.9, Math.max(0, effect.value ?? 0.5)) * (e.boss ? 0.5 : 1);
      e.slowT = Math.max(e.slowT, effect.duration);
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
      e.armorBreakT = Math.max(e.armorBreakT, effect.duration || ARMOR_BREAK_TIME);
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
function startAnkhCooldown(): void { ankhReadyAt = Date.now() + ANKH_COOLDOWN_MS; try { localStorage.setItem(ANKH_KEY, String(ankhReadyAt)); } catch { /* ignore */ } }

export function damageEnemy(e: Enemy, amount: number, o: DamageOpts): void {
  if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') return;
  if (e.shellT > 0) return; // Shellback's Tidal Shell: immune
  if (e.boss && bossWarded(e)) { if (!o.dot && Math.random() < 0.25) events.emit('floatText', { pos: e.pos, text: 'IMMUNE', color: 0x8ab8ff, scale: 0.9, dy: 3.5 }); return; }   // ward up
  if (!o.dot && e.kind === 'SHIELDBEARER' && shieldBlock(e)) return;   // braced shield: frontal hits deal 0 (BLOCKED)
  if (!(amount > 0)) return;
  if (debug.oneHit) { e.shield = 0; amount = Math.max(amount, (e.hp + 1) * 20); }   // debug: one-hit kills (armor-proof)

  let dealt = amount;
  if (o.armorBreak) applyStatus(e, abStatus);
  if (o.frost) e.frostT = Math.max(e.frostT, 4);
  if (!o.dot) {
    if (e.armor > 0) dealt *= 100 / (100 + e.armor * (e.armorBreakT > 0 ? ARMOR_BREAK_FACTOR : 1));
    if (e.staggerT > 0) dealt *= 1.25;
    // BACK ATTACK: the player is behind the enemy's facing
    if (o.source === 'PLAYER' && !o.noBackstab) {
      const pdx = world.player.pos.x - e.pos.x, pdz = world.player.pos.z - e.pos.z;
      const pl = Math.sqrt(pdx * pdx + pdz * pdz);
      if (pl > 0.5 && (pdx * Math.sin(e.facing) + pdz * Math.cos(e.facing)) / pl < BACKSTAB_DOT) {
        dealt *= BACKSTAB_MULT + useGameStore.getState().stats.backstab;
        combatStats.backstabs++;
        if (world.time - lastBackstabText > 0.5) { lastBackstabText = world.time; events.emit('floatText', { pos: e.pos, text: 'BACKSTAB', color: 0xffc23a, scale: 0.7, dy: 0.5 }); }
      }
    }
  }
  if (!o.dot && o.source !== 'PET') { dealt *= comboMul(); registerHit(); }
  if (e.kind === 'ROCK_CRAB' && !o.dot) dealt = crabArmor(e, dealt);
  if (e.boss) dealt *= hooks.damageMul(e); // Elderroot bark armor, Mire Hydra heads shielding the body
  if (e.shield > 0) {
    if (dealt <= e.shield) { e.shield -= dealt; dealt = 0; }
    else { dealt -= e.shield; e.shield = 0; }
  }

  e.hitFlash = o.dot ? Math.max(e.hitFlash, 0.35) : 1;

  if (dealt > 0) {
    e.hp -= dealt;
    const run = world.run;
    run.damageDealt += dealt;
    if (o.source === 'PLAYER') addUlt((o.dot ? 0.04 : 0.28) * Math.min(1, dealt / Math.max(1, e.maxHp)) + (o.dot ? 0 : 0.015));
    if (!o.dot && dealt > run.highestHit) run.highestHit = dealt;
    // Life steal (gear affixes / sets / talents): direct player damage only; healed in chunks to limit floating text.
    if (o.source === 'PLAYER' && !o.dot) {
      const ls = useGameStore.getState().stats.lifeSteal;
      if (ls > 0) { lsAcc += Math.min(dealt, 4000) * ls; if (lsAcc >= 2) { healPlayer(lsAcc); lsAcc = 0; } }
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

  if (e.hp <= 0) killEnemy(e);
}

export function killEnemy(e: Enemy): void {
  if (!e.active || e.state === 'DYING') return;
  if (e.decoy) { popDecoy(e); return; } // Death Clones: no rewards
  e.hp = 0; // state -> DYING is set by onEnemyDeath (Engine-B)

  // Boss adds / body parts (saplings, hydra heads, imps): no xp, loot, gold or kill credit.
  if (isBossAdd(e.kind)) {
    onEnemyDeath(e);
    events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: false, boss: false, scale: e.scale });
    return;
  }

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
  {
    let coins = 0, value = 10;
    const gd = GOLD_DROPPERS[e.kind];
    if (e.kind === 'BOSS_LICH') { coins = 8; value = 12; }
    else if (gd) { value = gd[1]; coins = e.elite ? 2 : Math.random() < gd[0] ? 1 : 0; }
    for (let i = 0; i < coins; i++) {
      dropPos.set(px + (Math.random() - 0.5) * (e.boss ? 4 : 1.5), 0, pz + (Math.random() - 0.5) * (e.boss ? 4 : 1.5));
      spawnPickup('GOLD', dropPos, value);
    }
  }

  // Trade-goods loot: kind table (chance), elites always add an Elite table roll, bosses roll their table twice.
  {
    const luck = loot * (1 + wave * 0.01) * (e.elite ? 1.5 : 1);
    if (e.boss) { const my = run.bossKills >= 2; dropLoot(e.kind, luck, px, pz, true, my); dropLoot(e.kind, luck, px, pz, false, my); }
    else { dropLoot(e.kind, luck, px, pz); if (e.elite) dropLoot('ELITE', luck, px, pz, true); }
  }

  // XP is granted instantly (no orbs), scaled by monster strength at spawn time (see spawnEnemy).
  if (e.xp > 0) grantKillXp(e.xp, e.pos);

  // Item drops.
  if (e.boss) {
    // bosses beaten before this one: the first boss never drops MYTHIC, LEGENDARY opens up after it
    const before = run.bossKills - 1;
    let rarity: Rarity = 'EPIC';
    if (before >= 1 && Math.random() < Math.min(0.03, 0.01 * before)) rarity = 'MYTHIC';
    else if (Math.random() < (before >= 1 ? Math.min(0.45, 0.15 + 0.08 * before) : 0.04)) rarity = 'LEGENDARY';
    const item = st.rollItemDrop(rarity);
    if (item) { dropPos.set(px, 0, pz); spawnPickup('ITEM', dropPos, 0, item); }
  } else if (Math.random() < Math.min(1, (e.elite ? 0.25 : 0.015) * loot)) {
    const item = st.rollItemDrop();
    if (item) { dropPos.set(px + (Math.random() - 0.5), 0, pz + (Math.random() - 0.5)); spawnPickup('ITEM', dropPos, 0, item); }
  }

  if (Math.random() < 0.006) {   // heart drops: -80%
    dropPos.set(px + (Math.random() - 0.5), 0, pz + (Math.random() - 0.5));
    spawnPickup('HEALTH', dropPos, 20);
  }

  onEnemyDeath(e);
  events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: e.elite, boss: e.boss, scale: e.scale, mini: e.mini });
  if (e.boss) addShake(0.8);
  else if (e.elite) addShake(0.25);
}

// ------------------------------------------------------------------- player --
const knockOut: number[] = [];
const phoenixColor = COLORS.rarityLegendary;

export function healPlayer(amount: number): void {
  const p = world.player;
  if (!p.alive || amount <= 0) return;
  amount *= runInfo.ascension >= 4 ? runMods(useGameStore.getState().difficulty).heal : 1;   // Ascension 4: weaker healing
  amount *= world.roomEvt.twist === 'CURSED' && world.director.phase === 'FIGHT' ? 0.35 : 1;   // Cursed Ground twist
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

/** Applies a monster-trick debuff to the player. Dash/i-frames ignore it. Returns true when applied. */
export function applyPlayerDebuff(type: PlayerDebuff, duration: number, value = 0): boolean {
  const p = world.player;
  if (playerTrickImmune()) return false;
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
    case 'SLOW': p.slowT = Math.max(p.slowT, duration); break;
  }
  combatStats.debuffs[type] = (combatStats.debuffs[type] ?? 0) + 1;
  events.emit('playerDebuff', { type, duration });
  return true;
}

/** Dash cleanses root and slows (and ends DoTs' slow component). */
/** Hook so boss specials can react to a dash (Soul Chains break). */
export function cleansePlayer(): void {
  const p = world.player;
  p.rootT = 0; p.slowT = 0;
  hooks.onCleanse();
}

/** Necromancer Bone Armor: each living minion soaks a little damage (max 30%) for the hero AND the minions. 1 = none. */
export function boneArmorMul(): number {
  const st = useGameStore.getState();
  if (st.hero !== 'NECROMANCER' || !(st.skillLevels.boneArmor > 0)) return 1;
  let n = 0; for (const m of world.minions) if (m.active) n++;
  return 1 - Math.min(0.3, n * (0.03 + 0.01 * (st.skillLevels.boneArmor - 1)));
}

export function damagePlayer(amount: number, o?: { pos?: Vector3; kind?: DamageKind; slow?: number; dot?: boolean }): void {
  const p = world.player;
  const st = useGameStore.getState();
  if (!p.alive || st.status !== GameStatus.PLAYING) return;
  if (debug.god) return;   // debug god mode
  const isDot = !!o?.dot;
  if (!isDot && (p.invulnT > 0 || (p.dashIframes && (p.anim.dashing || p.dashT > 0)))) return;
  const kind = o?.kind ?? 'PHYSICAL';

  if (!isDot && st.stats.dodge > 0 && Math.random() < st.stats.dodge) return;

  const barrier = st.skillLevels.barrier;
  const mods = runMods(st.difficulty);
  const def = (st.stats.defense + p.buffDef) * (p.defDownT > 0 ? 0.7 : 1); // CURSE: defense -30%
  const holy = (p.guardT > 0 ? 1 - p.guardRed : 1);   // knight Shield Wall
  // Necromancer Bone Armor: each living minion soaks a little (max 30%)
  const bone = boneArmorMul();
  const reduced = Math.max(1, amount * (100 / (100 + def)) * mods.dmg * (1 - Math.min(0.8, st.stats.dmgReduce)) * holy * bone);
  // Energy Shield only saves you when this hit would leave you under 20% HP.
  if (!isDot && barrier > 0 && p.shieldCharges > 0 && kind !== 'POISON' && p.hp - reduced < st.stats.maxHealth * 0.2) {
    triggerBarrier(barrier);
    return;
  }
  p.hp -= reduced;
  if (!isDot) p.anim.hurtT = 1;
  if (o?.slow && o.slow > 0) p.slowT = Math.max(p.slowT, 1.5);

  const run = world.run;
  run.damageTaken += reduced;

  // Thorns: reflect flat damage to enemies in melee range (at most ~3 times a second).
  if (!isDot && st.stats.thorns > 0 && kind !== 'POISON' && world.run.time - thornT > 0.33) {
    thornT = world.run.time;
    damageEnemiesInRadius(p.pos.x, p.pos.z, 4.5, st.stats.thorns * (1 + st.stats.damage * 0.04), thornOpts);
  }

  if (!isDot) events.emit('playerHit', { pos: p.pos, amount: reduced });
  events.emit('damage', { pos: p.pos, amount: reduced, crit: false, kind, toPlayer: true, dot: isDot });
  if (!isDot) addShake(Math.min(0.4, Math.max(0.15, (reduced / st.stats.maxHealth) * 1.2)));

  if (p.hp > 0) return;

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
  const ankh = ankhCooldownLeft() <= 0 ? st.consumeItem((i) => i.type === 'REVIVE') : null;
  if (ankh) {
    startAnkhCooldown();
    p.hp = st.stats.maxHealth * 0.5;
    p.invulnT = Math.max(p.invulnT, 5);
    p.reviveFx = 1;
    st.addNotification('REVIVED BY ANKH!', COLORS.rarityEpic, 'SYSTEM');
    events.emit('playerRevive', { pos: p.pos, source: 'ANKH' });
    return;
  }

  p.hp = 0;
  p.alive = false;
  p.vel.set(0, 0, 0);
  events.emit('playerDeath', { pos: p.pos });
  addShake(0.5);
}
