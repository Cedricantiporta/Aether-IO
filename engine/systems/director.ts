// ============================================================================
// Wave director.
//   COUNTDOWN (5 s) -> FIGHT (30 s spawn window; boss waves end on boss death)
//   -> CLEANUP (until the field is empty or 15 s) -> REWARD (store opens the
//   card screen, status leaves PLAYING; when updateGame resumes we advance).
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
import { useGameStore } from '../../store';
import { DIFFICULTY_MODS } from '../../constants';
import {
  spawnEnemy, findSpawnPoint, isSpawnable, poofAllEnemies,
} from './enemies';

const COUNTDOWN_SECONDS = 5;
const CLEANUP_MAX = 15;

const centerV = new Vector3();
const spawnV = new Vector3();

let lastCountdownSec = 99;
let totalBudget = 0;
let spent = 0;
let bossWave = false;
let eliteWave = false;
let elitesPending = 0;
let eliteAt = 0;

export function resetDirector(): void {
  const d = world.director;
  d.wave = 1;
  d.phase = 'COUNTDOWN';
  d.phaseT = 0;
  d.waveTime = 0;
  d.waveDuration = 30;
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
    case 'COUNTDOWN': tickCountdown(dt); break;
    case 'FIGHT': tickFight(dt); break;
    case 'CLEANUP': tickCleanup(); break;
    case 'REWARD': advanceWave(); break;
    case 'BOSS': d.phase = 'FIGHT'; break; // legacy phase value, never produced here
  }
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

  bossWave = d.wave % 10 === 0;
  eliteWave = !bossWave && d.wave >= 5 && (d.wave - 5) % 3 === 0;
  totalBudget = waveBudget(d.wave) * mods.spawn * (bossWave ? 0.5 : 1);
  spent = 0;
  d.budget = totalBudget;
  elitesPending = eliteWave ? 1 + Math.floor(Math.random() * 3) + Math.floor((d.wave - 5) / 15) : 0;
  eliteAt = 6 + Math.random() * 6;
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

function tickFight(dt: number): void {
  const d = world.director;
  d.waveTime += dt;

  runSpawner(dt);

  if (elitesPending > 0 && d.waveTime >= eliteAt) spawnEliteSquad();

  let finished: boolean;
  if (bossWave) {
    finished = d.waveTime > 2 && bossDefeated();
  } else {
    const exhausted = totalBudget - spent < 1 && elitesPending === 0;
    finished = d.waveTime >= d.waveDuration || (exhausted && d.aliveCount === 0 && d.waveTime > 3);
  }
  if (finished) {
    d.phase = 'CLEANUP';
    d.phaseT = 0;
    d.budget = 0;
  }
}

function runSpawner(dt: number): void {
  const d = world.director;
  d.spawnT -= dt;
  if (d.spawnT > 0) return;

  const remaining = totalBudget - spent;
  if (remaining < 1) { d.spawnT = 0.5; return; }
  if (d.aliveCount >= d.maxAlive - 1) { d.spawnT = 0.4; return; }

  // pace the budget over the spawn window (boss waves keep trickling on)
  const frac = bossWave ? d.waveTime / d.waveDuration : Math.min(1, d.waveTime / (d.waveDuration * 0.85));
  let allowed = totalBudget * frac - spent;
  if (d.aliveCount < 5 && d.waveTime > 1) allowed = Math.max(allowed, Math.min(remaining, 4)); // never leave the player idle
  if (allowed < 1) { d.spawnT = 0.25; return; }

  const cost = spawnGroup(Math.min(remaining, Math.max(allowed, 3)));
  spent += cost;
  d.budget = Math.max(0, totalBudget - spent);
  d.spawnT = 0.7 + Math.min(1.6, cost * 0.25) * (0.6 + Math.random() * 0.8);
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
  return spawnEnemy(kind, spawnV, elite ? { elite: true } : undefined) !== null;
}

/** Spawns one group of at most `maxCost` points; returns the points spent. */
function spawnGroup(maxCost: number): number {
  const d = world.director;
  const room = d.maxAlive - d.aliveCount;
  const roll = Math.random();
  const ring = d.wave >= 4 && maxCost >= 10 && roll < 0.12;
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
    spawnEnemy(kind, spawnV, { elite: true });
  }
}

// ------------------------------------------------------------ CLEANUP / REWARD --
function tickCleanup(): void {
  const d = world.director;
  if (d.aliveCount > 0 && d.phaseT < CLEANUP_MAX) return;
  poofAllEnemies();
  const eps = world.enemyProjectiles;
  for (let i = 0; i < eps.length; i++) eps[i].active = false;
  d.phase = 'REWARD';
  d.phaseT = 0;
  events.emit('waveClear', { wave: d.wave });
  useGameStore.getState().openWaveReward(); // status -> LEVEL_UP halts updateGame
}

/** Runs once updateGame resumes after the player picked a reward card. */
function advanceWave(): void {
  const d = world.director;
  d.wave++;
  useGameStore.getState().setWave(d.wave);
  d.phase = 'COUNTDOWN';
  d.phaseT = 0;
  d.waveTime = 0;
  d.countdown = COUNTDOWN_SECONDS;
  d.budget = 0;
  d.killsThisWave = 0;
  d.maxAlive = maxAliveForWave(d.wave);
  d.eliteAnnounced = false;
  lastCountdownSec = 99;
}
