// ============================================================================
// Wave director (siege flow).
//   SIEGE (2.5 s cutscene, skippable) -> COUNTDOWN (5 s) -> FIGHT:
//     each wave has a fixed enemy quota (scaled by wave + difficulty); the field is
//     topped up whenever alive < threshold until the quota is spawned.
//     Kill them all  -> FAST CLEAR (bonus gold + chance of a 4th card)
//     45 s timer out -> leftovers poof, the wave counts as survived (no bonus)
//     Boss waves end on boss death (CLEANUP grace, then REWARD).
//   REWARD (card screen) -> RESPITE (20 s, shops reopen; none before boss waves) -> COUNTDOWN ...
// The 'BOSS' WavePhase is not used: boss waves run as FIGHT with a boss.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { EnemyKind } from '../types';
import {
  ENEMY_DEFS, SPAWNABLE_KINDS, WEAK_KINDS, BOSS_NAMES,
  waveBudget, maxAliveForWave,
} from '../enemyDefs';
import { useGameStore, makeItemById } from '../../store';
import { DIFFICULTY_MODS } from '../../constants';
import { TOWN_CENTER } from '../world';
import { spawnPickup } from './pickups';
import {
  spawnEnemy, findSpawnPoint, isSpawnable, poofAllEnemies,
} from './enemies';

const SIEGE_SECONDS = 2.5;
const COUNTDOWN_SECONDS = 5;
const WAVE_SECONDS = 45;
const BOSS_CLEANUP = 2.5;
const RESPITE_SECONDS = 20;
const GIFT_CHANCE = 0.35;
const DISCOUNT_CHANCE = 0.3;

const centerV = new Vector3();
const spawnV = new Vector3();

let lastCountdownSec = 99;
let totalBudget = 0;
let spent = 0;
let bossWave = false;
let eliteWave = false;
let elitesPending = 0;
let eliteAt = 0;
let topUpBelow = 8;

export function resetDirector(): void {
  const d = world.director;
  d.wave = 1;
  d.phase = 'COUNTDOWN';
  d.phaseT = 0;
  d.waveTime = 0;
  d.waveDuration = WAVE_SECONDS;
  d.quotaTotal = 0; d.quotaSpawned = 0; d.respiteT = 0; d.fastClear = false;
  d.countdown = COUNTDOWN_SECONDS;
  d.budget = 0;
  d.spawnT = 0;
  d.maxAlive = maxAliveForWave(1);
  d.aliveCount = 0;
  d.killsThisWave = 0;
  d.bossId = -1;
  d.eliteAnnounced = false;
  world.boss.active = false;
  world.enemyGrid.clear();
  lastCountdownSec = 99;
  totalBudget = 0;
  spent = 0;
  bossWave = false;
  eliteWave = false;
  elitesPending = 0;
  eliteAt = 0;
}

export function updateDirector(dt: number): void {
  const d = world.director;
  d.phaseT += dt;
  switch (d.phase) {
    case 'SIEGE': tickSiege(); break;
    case 'RESPITE': tickRespite(dt); break;
    case 'COUNTDOWN': tickCountdown(dt); break;
    case 'FIGHT': tickFight(dt); break;
    case 'CLEANUP': tickCleanup(); break;
    case 'REWARD': advanceWave(); break;
    case 'BOSS': d.phase = 'FIGHT'; break; // legacy phase value, never produced here
  }
}

// ------------------------------------------------------------ SIEGE / RESPITE ---
/** UI "Skip" button / Enter. */
export function skipCutscene(): void {
  if (world.director.phase === 'SIEGE') world.director.phaseT = 99;
}
export function skipRespite(): void {
  if (world.director.phase === 'RESPITE') world.director.respiteT = 0;
}

function beginCountdown(): void {
  const d = world.director;
  d.phase = 'COUNTDOWN';
  d.phaseT = 0;
  d.countdown = COUNTDOWN_SECONDS;
  lastCountdownSec = 99;
}

function tickSiege(): void {
  const d = world.director;
  if (d.phaseT >= SIEGE_SECONDS || world.input.pressed.Enter) beginCountdown();
}

function tickRespite(dt: number): void {
  const d = world.director;
  d.respiteT -= dt;
  if (d.respiteT > 0) return;
  d.respiteT = 0;
  world.village.shopsClosed = true;
  world.village.discount = 0;
  events.emit('respiteEnd', {});
  beginCountdown();
}

function beginRespite(): void {
  const d = world.director;
  d.phase = 'RESPITE';
  d.phaseT = 0;
  d.respiteT = RESPITE_SECONDS;
  world.village.shopsClosed = false;
  const discount = Math.random() < DISCOUNT_CHANCE ? 0.1 : 0;
  world.village.discount = discount;
  events.emit('respiteStart', { seconds: RESPITE_SECONDS, discount });
  if (discount > 0) useGameStore.getState().addNotification('Thank-you discount: 10% off in every shop during the respite!', '#7dd3fc', 'SYSTEM');
}

const giftPos = new Vector3();
/** Grateful villagers leave a present near the town (pickups pop out around the quest board). */
function maybeVillagerGift(): void {
  if (Math.random() >= GIFT_CHANCE) return;
  const wave = world.director.wave;
  const scale = 1 + wave * 0.12;
  const st = useGameStore.getState();
  const at = (): Vector3 => giftPos.set(TOWN_CENTER.x + (Math.random() - 0.5) * 14, 0, TOWN_CENTER.z + 12 + Math.random() * 4);
  const r = Math.random();
  let text: string;
  if (r < 0.05) {
    const item = st.rollItemDrop();
    if (item) spawnPickup('ITEM', at(), 0, item);
    text = 'A villager left you a prized piece of gear near the town!';
  } else if (r < 0.4) {
    const q = 2 + Math.floor(Math.random() * 2);
    for (const it of [...makeItemById('potion_hp', q), ...makeItemById('potion_mana', q)]) spawnPickup('ITEM', at(), 0, it);
    text = `Villagers left ${q} HP + ${q} MP potions near the town!`;
  } else if (r < 0.6) {
    for (const it of makeItemById('upgrade_core', 1)) spawnPickup('ITEM', at(), 0, it);
    text = 'A villager left an Upgrade Core near the town!';
  } else {
    const total = Math.round((100 + Math.random() * 200) * scale);
    for (let i = 0; i < 4; i++) spawnPickup('GOLD', at(), Math.round(total / 4));
    text = `Villagers pooled ${total} gold as thanks. Find it near the town!`;
  }
  st.addNotification(text, '#fbbf24', 'SYSTEM');
  events.emit('villagerGift', { pos: giftPos, text });
}

// ------------------------------------------------------------ COUNTDOWN ------
function tickCountdown(dt: number): void {
  const d = world.director;
  d.countdown -= dt;
  const sec = Math.ceil(Math.max(0, d.countdown));
  if (sec !== lastCountdownSec && sec > 0) {
    lastCountdownSec = sec;
    events.emit('countdown', { seconds: sec });
  }
  if (d.countdown <= 0) startFight();
}

function startFight(): void {
  const d = world.director;
  const mods = DIFFICULTY_MODS[useGameStore.getState().difficulty];
  d.phase = 'FIGHT';
  d.phaseT = 0;
  d.waveTime = 0;
  d.spawnT = 0.5;
  d.countdown = 0;
  d.killsThisWave = 0;
  d.bossId = -1;
  d.maxAlive = maxAliveForWave(d.wave);
  d.waveDuration = WAVE_SECONDS;
  d.fastClear = false;

  bossWave = d.wave % 10 === 0;
  eliteWave = !bossWave && d.wave >= 5 && (d.wave - 5) % 3 === 0;
  totalBudget = waveBudget(d.wave) * mods.spawn * (bossWave ? 0.5 : 1);
  spent = 0;
  d.budget = totalBudget;
  elitesPending = eliteWave ? 1 + Math.floor(Math.random() * 3) + Math.floor((d.wave - 5) / 15) : 0;
  eliteAt = 6 + Math.random() * 6;
  d.quotaTotal = Math.max(bossWave ? 6 : 8, Math.round(totalBudget / avgCost(d.wave))) + elitesPending;
  d.quotaSpawned = 0;
  topUpBelow = Math.max(5, Math.min(Math.round(d.maxAlive * 0.35), Math.round(d.quotaTotal * 0.5)));
  d.eliteAnnounced = false;

  events.emit('waveStart', { wave: d.wave, boss: bossWave, elite: eliteWave });
  if (eliteWave) {
    d.eliteAnnounced = true;
    useGameStore.getState().addNotification('Elite squad approaching!', '#a855f7', 'BOSS');
  }
  if (bossWave) spawnBoss();
}

function spawnBoss(): void {
  const d = world.director;
  const kind: EnemyKind = (d.wave / 10) % 2 === 1 ? 'BOSS_GOLEM' : 'BOSS_LICH';
  if (!findSpawnPoint(18, 22, spawnV)) {
    spawnV.set(world.player.pos.x, 0, world.player.pos.z - 18);
  }
  const e = spawnEnemy(kind, spawnV);
  if (!e) return;
  const names = BOSS_NAMES[kind === 'BOSS_GOLEM' ? 'BOSS_GOLEM' : 'BOSS_LICH'];
  d.bossId = e.id;
  const hud = world.boss;
  hud.active = true; hud.name = names.name; hud.title = names.title;
  hud.hp = e.hp; hud.maxHp = e.maxHp; hud.phase = 0;
  events.emit('bossSpawn', { name: names.name, title: names.title });
  events.emit('shake', { amount: 0.5 });
  useGameStore.getState().addNotification(`${names.name}, the ${names.title}, approaches!`, '#ef4444', 'BOSS');
}

// ------------------------------------------------------------ FIGHT ----------
function bossDefeated(): boolean {
  const d = world.director;
  if (d.bossId < 0) return true; // spawn failed
  const b = world.enemies[d.bossId];
  return !b.active || b.state === 'DYING' || !b.boss;
}

function avgCost(wave: number): number {
  let w = 0, c = 0;
  for (let i = 0; i < SPAWNABLE_KINDS.length; i++) {
    const def = ENEMY_DEFS[SPAWNABLE_KINDS[i]];
    if (def.minWave > wave) continue;
    w += def.weight; c += def.weight * def.cost;
  }
  return w > 0 ? c / w : 1;
}

function tickFight(dt: number): void {
  const d = world.director;
  d.waveTime += dt;

  runSpawner(dt);

  if (elitesPending > 0 && d.waveTime >= eliteAt) spawnEliteSquad();

  if (bossWave) {
    if (d.waveTime > 2 && bossDefeated()) { d.phase = 'CLEANUP'; d.phaseT = 0; d.budget = 0; }
    return;
  }
  if (d.quotaSpawned >= d.quotaTotal && elitesPending === 0 && d.aliveCount === 0 && d.waveTime > 1) finishWave(true);
  else if (d.waveTime >= d.waveDuration) finishWave(false);
}

function runSpawner(dt: number): void {
  const d = world.director;
  d.spawnT -= dt;
  if (d.spawnT > 0) return;
  const normalLeft = d.quotaTotal - d.quotaSpawned - elitesPending;
  if (normalLeft < 1) { d.spawnT = 0.5; return; }
  if (d.aliveCount >= topUpBelow || d.aliveCount >= d.maxAlive - 1) { d.spawnT = 0.35; return; }
  spawnGroup(99);
  d.budget = Math.max(0, normalLeft);
  d.spawnT = 0.5 + Math.random() * 0.8;
}

function pickKind(maxCost: number, weakOnly: boolean, minCost = 0): EnemyKind {
  const wave = world.director.wave;
  const pool = weakOnly ? WEAK_KINDS : SPAWNABLE_KINDS;
  let total = 0;
  for (let i = 0; i < pool.length; i++) {
    const def = ENEMY_DEFS[pool[i]];
    if (def.minWave <= wave && def.cost <= maxCost && def.cost >= minCost) total += def.weight;
  }
  if (total <= 0) return 'SLIME';
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    const def = ENEMY_DEFS[pool[i]];
    if (def.minWave > wave || def.cost > maxCost || def.cost < minCost) continue;
    r -= def.weight;
    if (r <= 0) return pool[i];
  }
  return 'SLIME';
}

function spawnUnit(kind: EnemyKind, x: number, z: number): boolean {
  spawnV.set(x, 0, z);
  const wave = world.director.wave;
  const elite = wave >= 8 && Math.random() < 0.02;
  const ok = spawnEnemy(kind, spawnV, elite ? { elite: true } : undefined) !== null;
  if (ok) world.director.quotaSpawned++;
  return ok;
}

/** Spawns one group of at most `maxCost` points; returns the points spent. */
function spawnGroup(maxCost: number): number {
  const d = world.director;
  const room = Math.min(d.maxAlive - d.aliveCount, d.quotaTotal - d.quotaSpawned - elitesPending);
  const roll = Math.random();
  const ring = d.wave >= 4 && room >= 8 && roll < 0.12;
  const kind = pickKind(maxCost, ring);
  const cost = ENEMY_DEFS[kind].cost;
  let spawned = 0;

  if (ring) {
    const count = Math.min(10 + Math.floor(Math.random() * 7), Math.floor(maxCost / cost), room);
    const px = world.player.pos.x;
    const pz = world.player.pos.z;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      const x = px + Math.sin(a) * 24;
      const z = pz + Math.cos(a) * 24;
      if (isSpawnable(x, z) && spawnUnit(kind, x, z)) spawned++;
    }
    return spawned * cost;
  }

  const pack = roll < 0.65;
  let count: number;
  if (kind === 'BAT') count = 4 + Math.floor(Math.random() * 3);
  else if (pack) count = Math.max(1, Math.round((3 + Math.random() * 3) / Math.sqrt(cost)));
  else count = 1;
  count = Math.max(1, Math.min(count, Math.floor(maxCost / cost), room));
  if (count < 1 || room < 1) return 0;

  if (!findSpawnPoint(26, 34, centerV, Math.random() * Math.PI * 2)) return 0;
  for (let i = 0; i < count; i++) {
    let x = centerV.x;
    let z = centerV.z;
    if (i > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 2.5;
      const tx = x + Math.sin(a) * r;
      const tz = z + Math.cos(a) * r;
      if (isSpawnable(tx, tz)) { x = tx; z = tz; }
    }
    if (spawnUnit(kind, x, z)) spawned++;
  }
  return spawned * cost;
}

function spawnEliteSquad(): void {
  const d = world.director;
  const n = elitesPending;
  elitesPending = 0;
  if (!findSpawnPoint(26, 34, centerV, Math.random() * Math.PI * 2)) return;
  for (let i = 0; i < n; i++) {
    const kind = pickKind(99, false, 1.5);
    const a = (i / n) * Math.PI * 2;
    let x = centerV.x + Math.sin(a) * 2;
    let z = centerV.z + Math.cos(a) * 2;
    if (!isSpawnable(x, z)) { x = centerV.x; z = centerV.z; }
    spawnV.set(x, 0, z);
    if (spawnEnemy(kind, spawnV, { elite: true })) d.quotaSpawned++;
  }
}

// ------------------------------------------------------------ CLEANUP / REWARD --
/** Boss wave: short grace after the boss falls, then finish. */
function tickCleanup(): void {
  const d = world.director;
  if (d.phaseT < BOSS_CLEANUP) return;
  finishWave(false);
}

/** fast = every quota enemy was killed before the timer ran out. */
function finishWave(fast: boolean): void {
  const d = world.director;
  poofAllEnemies(); // leftovers flee / poof (no loot, no xp)
  const eps = world.enemyProjectiles;
  for (let i = 0; i < eps.length; i++) eps[i].active = false;
  d.phase = 'REWARD';
  d.phaseT = 0;
  d.fastClear = fast;
  const st = useGameStore.getState();
  let bonus = 0;
  if (fast) {
    bonus = 40 + d.wave * 15;
    st.addGold(bonus);
    world.run.goldEarned += bonus;
    events.emit('fastClear', { wave: d.wave, gold: bonus });
  }
  events.emit('waveClear', { wave: d.wave, fast });
  st.openWaveReward(fast); // status -> LEVEL_UP halts updateGame
}

/** Runs once updateGame resumes after the player picked a reward card. */
function advanceWave(): void {
  const d = world.director;
  d.wave++;
  useGameStore.getState().setWave(d.wave);
  d.waveTime = 0;
  d.budget = 0;
  d.killsThisWave = 0;
  d.maxAlive = maxAliveForWave(d.wave);
  d.eliteAnnounced = false;
  maybeVillagerGift();
  if (d.wave % 10 === 0) beginCountdown(); // no respite before a boss wave
  else beginRespite();
}
