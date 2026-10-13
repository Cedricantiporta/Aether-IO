// ============================================================================
// Engine entry points: startRun / stopRun / updateGame(dt).
// No React in here. Called from the store (start/stop) and render/Scene (update).
// ============================================================================
import { world, clearWorld } from './world';
import { events } from './events';
import { generateMap } from './mapgen';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { initPlayer, updatePlayer } from './systems/player';
import { updateProjectiles } from './systems/projectiles';
import { updateSkills, resetSkills } from './systems/skills';
import { updateZones } from './systems/zones';
import { updatePets, resetPets } from './systems/pets';
import { updatePickups, resetPickups } from './systems/pickups';
import { updateCrates } from './systems/crates';
import { resetAbilities } from './systems/abilities';
import { updateDirector, resetDirector } from './systems/director';
import { updateVillage, placeVillageNodes } from './systems/village';
import { useUiStore } from '../ui/uiStore';
import { updateEnemies, updateEnemyProjectiles } from './systems/enemies';

const MAX_DT = 0.05;

// Screen shake: events add trauma (render reads + squares world.camera.trauma).
events.on('shake', ({ amount }) => {
  if (!useGameStore.getState().settings.screenShake) return;
  world.camera.trauma = Math.min(1, world.camera.trauma + amount);
});

function clearPressed(): void {
  const pr = world.input.pressed;
  for (const k in pr) pr[k] = false;
}

function rebuildEnemyGrid(): void {
  const grid = world.enemyGrid;
  grid.clear();
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.active && e.state !== 'DYING') grid.insert(e.id, e.pos.x, e.pos.z);
  }
}

let villageReady = false;

function resetSystems(): void {
  initPlayer();
  resetAbilities();
  resetSkills();
  resetPets();
  resetPickups();
  resetDirector();
  clearPressed();
}

/** Peaceful village: shops open, island scenery + a few harvest nodes, hero standing in the square. */
export function enterVillage(): void {
  clearWorld();
  world.enemyGrid.clear();
  generateMap();
  placeVillageNodes();
  resetSystems();
  world.player.pos.set(0, 0, 2);
  world.village.shopsClosed = false;
  useGameStore.getState().rollShopSales();
  villageReady = true;
  events.emit('runEnd', {});
}

/** The siege run: shops close, cutscene (SIEGE phase) then wave 1. */
export function startRun(): void {
  clearWorld();
  world.enemyGrid.clear();
  generateMap();
  resetSystems();
  const d = world.director;
  d.phase = 'SIEGE';
  d.phaseT = 0;
  world.village.shopsClosed = true;
  events.emit('runStart', {});
  events.emit('siegeStart', {});
}

export function updateGame(rawDt: number): void {
  const status = useGameStore.getState().status;
  if (status === GameStatus.MENU) {
    if (!villageReady) enterVillage();
    const vdt = Math.min(rawDt, MAX_DT);
    if (vdt > 0 && useUiStore.getState().titleDone) updateVillage(vdt);
    clearPressed();
    return;
  }
  if (status !== GameStatus.PLAYING) {
    clearPressed();
    return;
  }
  const dt = Math.min(rawDt, MAX_DT);
  if (!(dt > 0)) return;

  updatePlayer(dt);
  rebuildEnemyGrid();
  updateDirector(dt);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateProjectiles(dt);
  updateSkills(dt);
  updateZones(dt);
  updatePets(dt);
  updatePickups(dt);
  updateCrates(dt);

  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.run.time += dt;
  world.frame++;
  clearPressed();
}
