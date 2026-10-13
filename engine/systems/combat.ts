// ============================================================================
// Combat: damage in/out, death + loot, healing, status effects.
// Engine-B (enemies/bosses/director) calls into this module.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events, type DamageKind } from '../events';
import type { Enemy } from '../types';
import type { Rarity, StatusEffectType } from '../../types';
import { GameStatus } from '../../types';
import { useGameStore } from '../../store';
import { DIFFICULTY_MODS, COLORS } from '../../constants';
import { spawnPickup } from './pickups';
import { onEnemyDeath } from './enemies';

/** e.knock is a velocity (units/s) = knockback stat * KNOCK_SCALE, capped; Engine-B decays and scales it. */
export const KNOCK_SCALE = 12;
const KNOCK_MAX = 30;

export interface DamageOpts {
  kind: DamageKind;
  crit?: boolean;
  knockDir?: Vector3;
  knockback?: number;
  dot?: boolean;
  source?: 'PLAYER' | 'PET';
}

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
  value?: number;
}

const dropPos = new Vector3();

// ------------------------------------------------------------------ helpers --
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
export function getAimDir(out: Vector3 = _aimTmp): Vector3 {
  const p = world.player;
  const dx = p.aim.x - p.pos.x, dz = p.aim.z - p.pos.z;
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
    if (o.knockback) {
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      aoeDir.set(dx / d, 0, dz / d);
      o.knockDir = aoeDir;
    }
    damageEnemy(e, amount, o);
  }
  return hits;
}

// ------------------------------------------------------------------ enemies --
export function applyStatus(e: Enemy, effect: StatusEffect): void {
  if (!e.active || e.state === 'DYING') return;
  const durMult = e.boss ? 0.25 : e.elite ? 0.5 : 1;
  switch (effect.type) {
    case 'BURN':
      e.burnT = Math.max(e.burnT, effect.duration);
      e.burnDps = Math.max(e.burnDps, effect.value ?? 5);
      break;
    case 'POISON':
      e.poisonT = Math.max(e.poisonT, effect.duration);
      e.poisonDps = Math.max(e.poisonDps, effect.value ?? 3);
      break;
    case 'FREEZE':
      if (e.boss) return;
      e.freezeT = Math.max(e.freezeT, effect.duration * durMult);
      break;
    case 'STUN':
      if (e.boss) return;
      e.stunT = Math.max(e.stunT, effect.duration * durMult);
      break;
    case 'SLOW': {
      const f = Math.min(0.9, Math.max(0, effect.value ?? 0.5)) * (e.boss ? 0.5 : 1);
      e.slowT = Math.max(e.slowT, effect.duration);
      e.slowFactor = Math.max(e.slowFactor, f);
      break;
    }
  }
}

export function damageEnemy(e: Enemy, amount: number, o: DamageOpts): void {
  if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') return;
  if (!(amount > 0)) return;

  let dealt = amount;
  if (e.shield > 0) {
    if (dealt <= e.shield) { e.shield -= dealt; dealt = 0; }
    else { dealt -= e.shield; e.shield = 0; }
  }

  e.hitFlash = o.dot ? Math.max(e.hitFlash, 0.35) : 1;

  if (dealt > 0) {
    e.hp -= dealt;
    const run = world.run;
    run.damageDealt += dealt;
    if (!o.dot && dealt > run.highestHit) run.highestHit = dealt;
  }

  if (o.knockDir && o.knockback && !e.boss && e.freezeT <= 0) {
    const k = Math.min(KNOCK_MAX, o.knockback * KNOCK_SCALE) * (e.elite ? 0.5 : 1);
    e.knock.x += o.knockDir.x * k;
    e.knock.z += o.knockDir.z * k;
  }

  events.emit('damage', { pos: e.pos, amount: dealt > 0 ? dealt : amount, crit: !!o.crit, kind: o.kind, toPlayer: false, dot: o.dot });
  if (!o.dot) events.emit('enemyHit', { pos: e.pos, kind: e.kind, dmgKind: o.kind, dir: o.knockDir });

  if (e.hp <= 0) killEnemy(e);
}

export function killEnemy(e: Enemy): void {
  if (!e.active || e.state === 'DYING') return;
  e.hp = 0; // state -> DYING is set by onEnemyDeath (Engine-B)

  const run = world.run;
  run.kills++;
  if (e.elite) run.eliteKills++;
  if (e.boss) run.bossKills++;

  const st = useGameStore.getState();
  const loot = DIFFICULTY_MODS[st.difficulty].loot;
  const wave = world.director.wave;
  const px = e.pos.x, pz = e.pos.z;

  // Gold coins.
  const coins = e.boss ? 10 : e.elite ? 3 : Math.random() < 0.5 ? 1 : 0;
  for (let i = 0; i < coins; i++) {
    dropPos.set(px + (Math.random() - 0.5) * (e.boss ? 4 : 1.5), 0, pz + (Math.random() - 0.5) * (e.boss ? 4 : 1.5));
    spawnPickup('GOLD', dropPos, 10);
  }

  // XP gems (split into several orbs for big kills).
  if (e.xp > 0) {
    const orbs = e.boss ? 8 : e.elite ? 4 : 1;
    const value = e.xp / orbs;
    for (let i = 0; i < orbs; i++) {
      dropPos.set(px + (Math.random() - 0.5) * 2, 0, pz + (Math.random() - 0.5) * 2);
      spawnPickup('XP', dropPos, value);
    }
  }

  // Item drops.
  if (e.boss) {
    let rarity: Rarity = 'EPIC';
    if (wave >= 60 && Math.random() < Math.min(0.2, (wave - 50) * 0.01)) rarity = 'MYTHIC';
    else if (wave >= 30 && Math.random() < Math.min(0.5, (wave - 20) * 0.02)) rarity = 'LEGENDARY';
    const item = st.rollItemDrop(rarity);
    if (item) { dropPos.set(px, 0, pz); spawnPickup('ITEM', dropPos, 0, item); }
  } else if (Math.random() < Math.min(1, (e.elite ? 0.5 : 0.04) * loot)) {
    const item = st.rollItemDrop();
    if (item) { dropPos.set(px + (Math.random() - 0.5), 0, pz + (Math.random() - 0.5)); spawnPickup('ITEM', dropPos, 0, item); }
  }

  if (Math.random() < 0.03) {
    dropPos.set(px + (Math.random() - 0.5), 0, pz + (Math.random() - 0.5));
    spawnPickup('HEALTH', dropPos, 20);
  }

  onEnemyDeath(e);
  events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: e.elite, boss: e.boss, scale: e.scale });
  if (e.boss) addShake(0.8);
  else if (e.elite) addShake(0.25);
}

// ------------------------------------------------------------------- player --
const knockOut: number[] = [];
const phoenixColor = COLORS.rarityLegendary;

export function healPlayer(amount: number): void {
  const p = world.player;
  if (!p.alive || amount <= 0) return;
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

export function damagePlayer(amount: number, o?: { pos?: Vector3; kind?: DamageKind; slow?: number }): void {
  const p = world.player;
  const st = useGameStore.getState();
  if (!p.alive || st.status !== GameStatus.PLAYING) return;
  if (p.invulnT > 0 || p.anim.dashing || p.dashT > 0) return;
  const kind = o?.kind ?? 'PHYSICAL';

  if (st.stats.dodge > 0 && Math.random() < st.stats.dodge) return;

  const barrier = st.skillLevels.barrier;
  if (barrier > 0 && p.shieldCharges > 0 && kind !== 'POISON') {
    triggerBarrier(barrier);
    return;
  }

  const mods = DIFFICULTY_MODS[st.difficulty];
  const reduced = Math.max(1, amount * (100 / (100 + st.stats.defense)) * mods.dmg);
  p.hp -= reduced;
  p.anim.hurtT = 1;
  if (o?.slow && o.slow > 0) p.slowT = Math.max(p.slowT, 1.5);

  const run = world.run;
  run.damageTaken += reduced;

  events.emit('playerHit', { pos: p.pos, amount: reduced });
  events.emit('damage', { pos: p.pos, amount: reduced, crit: false, kind, toPlayer: true });
  addShake(Math.min(0.4, Math.max(0.15, (reduced / st.stats.maxHealth) * 1.2)));

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
  const ankh = st.consumeItem((i) => i.type === 'REVIVE');
  if (ankh) {
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
