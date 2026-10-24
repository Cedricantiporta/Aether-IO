import { CAM_PITCH0 } from './world';
import { resetBossMech } from './systems/bossMech';
import { PLAZA, TOWER, PORTAL, PLAZA_ARRIVAL } from './townData';
import { runInfo } from './runMods';
import { saveSpot, loadSpot } from './lastSpot';
import { CAVE_OUT, CAVE_MOUTH } from './caveData';
import { dreamFx, blockInput } from './dreamFx';
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
import { updateDirector, resetDirector, startRunRooms } from './systems/director';
import { updateVillage, placeVillageNodes, restoreInterior, bedWake, wakeInBed } from './systems/village';
import { useUiStore } from '../ui/uiStore';
import { device } from './device';
import { updateEnemies, updateEnemyProjectiles } from './systems/enemies';
import { updateRoomEvents } from './systems/roomEvents';
import { updateBiomeHazards } from './systems/biomeHazards';
import { updateMinions } from './systems/minions';
import { updateCombatFx, resetCombat } from './systems/combat';
import { resetTricks } from './systems/tricks';
import { updateCombo, resetCombo } from './systems/combo';
import { resetSpecials } from './systems/bossSpecials';
import { updateBossFx, resetBossFx } from './systems/bossFx';
import { resetBosses2 } from './systems/bosses2';
import { tickUltWindup } from './systems/abilities';
import { showcase, tickShowcase } from './showcase';

const MAX_DT = 0.05;

// ---------------------------------------------------------------- game feel --
/** Shared juice state. Engine writes, render/UI read. Decays in REAL time. */
export const feel = { timeScale: 1, fov: 0, gold: 0, hurt: 0 };
let stopT = 0, slowT = 0, slowScale = 0.4, lastStopAt = -10;
const nowS = (): number => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
function motionOk(): boolean {
  if (useGameStore.getState().settings?.screenShake === false) return false;
  try { return !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return true; }
}
/** Brief time-scale dip. Rate limited (0.25 s) unless force. */
export function hitStop(dur = 0.055, scale = 0.05, force = false): void {
  if (!motionOk()) return;
  const n = nowS();
  if (!force && n - lastStopAt < 0.25) return;
  lastStopAt = n; stopT = Math.max(stopT, dur); slowScale = scale;
}
export function slowMo(dur = 0.3, scale = 0.35): void {
  if (!motionOk()) return;
  slowT = Math.max(slowT, dur); slowScale = scale;
}
export function goldFlash(a = 1): void { if (motionOk()) feel.gold = Math.max(feel.gold, a); }
export function fovKick(a: number): void { if (motionOk()) feel.fov = Math.max(feel.fov, Math.min(1, a)); }
function tickFeel(raw: number): void {
  const r = Math.min(raw, 0.1);
  if (stopT > 0) { stopT -= r; feel.timeScale = 0.05; }
  else if (slowT > 0) { slowT -= r; feel.timeScale = slowScale; }
  else feel.timeScale = 1;
  feel.fov = Math.max(0, feel.fov - r * 3.2);
  feel.gold = Math.max(0, feel.gold - r * 1.6);
  feel.hurt = Math.max(0, feel.hurt - r * 2.6);
}
let lastVib = 0;
events.on('damage', (e) => {
  if (!world.player.alive) return;
  if (e.toPlayer) {
    if (device.touch && useGameStore.getState().settings?.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
      const n = nowS();
      if (n - lastVib > 0.25) { lastVib = n; try { navigator.vibrate(e.amount >= useGameStore.getState().stats.maxHealth * 0.12 ? 45 : 14); } catch { /* ignore */ } }
    }
    const mx = Math.max(1, useGameStore.getState().stats.maxHealth);
    if (e.amount >= mx * 0.12) { hitStop(0.07, 0.05); feel.hurt = 1; fovKick(0.35); }
    else if (e.amount >= mx * 0.04) feel.hurt = Math.max(feel.hurt, 0.5);
  } else if (e.crit && (world.boss.active || e.amount >= 60)) hitStop(0.04, 0.06);
});
events.on('enemyDeath', (e) => { if (e.boss) hitStop(0.14, 0.04, true); else if (e.elite && !e.poof) hitStop(0.06, 0.05); });
events.on('explosion', (e) => { if (e.radius >= 4) fovKick(Math.min(0.8, e.radius * 0.1)); });
events.on('shockwave', (e) => { if (e.radius >= 4) fovKick(Math.min(0.9, e.radius * 0.1)); });
events.on('bossPhase', () => { fovKick(0.9); hitStop(0.1, 0.05, true); });
events.on('levelUp', () => { goldFlash(0.8); slowMo(0.3, 0.35); });
events.on('waveClear', () => { goldFlash(0.6); slowMo(0.3, 0.4); });
let lastRank = -1, rankSub = false;
function watchRank(): void { // lazy: store.ts and game.ts import each other
  if (rankSub) return;
  rankSub = true;
  useGameStore.subscribe((s) => {
    const r = (s as any).heroRank as number | undefined;
    if (typeof r !== 'number') return;
    if (lastRank >= 0 && r > lastRank) { goldFlash(1); slowMo(0.3, 0.35); }
    lastRank = r;
  });
}

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
/** A run started since the last time the town was entered (the next enterVillage puts the hero back at the portal, not in the plaza). */
let cameFromRun = false;
let spotPending = true;   // (a browser refresh: the last spot is restored once, when the player leaves the title / character select)
/** Back where the hero was before the refresh (lastSpot.ts): town spot / inside an interior; a run -> in front of the adventure portal,
 *  a tower mode -> outside the tower, the mines -> outside the cave mouth. */
function applyLastSpot(): void {
  const s = loadSpot(), p = world.player;
  if (!s) return;
  if (s.area === 'RUN') { p.pos.set(PORTAL.out.x, 0, PORTAL.out.z); p.facing = 0; }   // a little down the forest road from the portal (north of it), looking at it (south)
  else if (s.area === 'TOWER') { p.pos.set(TOWER.out.x, 0, TOWER.out.z); p.facing = 0; }   // (the door faces north onto its path: step out, look back at it)
  else if (s.area === 'CAVE') { p.pos.set(CAVE_OUT.x, 0, CAVE_OUT.z); p.facing = CAVE_MOUTH.rot; }
  else if (s.area === 'TOWN') { p.pos.set(s.x, 0, s.z); p.facing = s.f; }
  else { restoreInterior(s.area as 'CASTLE' | 'CHURCH' | 'TAVERN' | 'HOME', s.x, s.z, s.f); return; }
  world.village.spawnFx = 1;
}

function resetSystems(): void {
  initPlayer();
  resetAbilities();
  resetSkills();
  resetPets();
  resetPickups();
  resetDirector();
  resetCombat();
  resetTricks();
  resetCombo();
  resetSpecials();
  resetBossFx();
  resetBosses2(); resetBossMech();
  clearPressed();
}

/** Peaceful town: shops always open, island scenery + a few harvest nodes, hero standing in the square. */
export function enterVillage(): void {
  world.village.area = 'TOWN'; world.village.pending = ''; world.village.fade = 0; world.village.areaVer++;   // always back in the town (never inside the castle)
  clearWorld();
  world.enemyGrid.clear();
  generateMap();
  placeVillageNodes();
  resetSystems();
  // the first arrival of a session (new game / boot) is in the middle of the town plaza, under the arrival light ray, facing the castle road;
  // coming back from an Adventure run (owner 2026-10-24: the portal stands in the forest clearing now) is on the road in front of the portal, looking at it
  if (cameFromRun) { world.player.pos.set(PORTAL.out.x, 0, PORTAL.out.z); world.player.facing = 0; }
  else { world.player.pos.set(PLAZA_ARRIVAL.x, 0, PLAZA_ARRIVAL.z); world.player.facing = Math.PI; }   // (face north)
  cameFromRun = false;
  world.camera.yaw = 0;                          // camera behind the hero
  if (runInfo.back === 'TOWER') {                // back from the Endless Tower / Daily Trial / Endless Waves: outside the tower door
    world.player.pos.set(TOWER.out.x, 0, TOWER.out.z); world.player.facing = 0;   // (the tower's door faces north onto its path: step out, look back at it)
  }
  runInfo.back = '';
  world.camera.dist = 1; world.camera.pitch = CAM_PITCH0;   // default zoom 1.0
  world.village.spawnFx = 1;                     // arrival light pillar on the hero
  useGameStore.getState().rollShopSales();
  villageReady = true;
  if (bedWake.on) { bedWake.on = false; wakeInBed(); }   // (owner) woken from a walked dream: in bed at home
  events.emit('runEnd', {});
}

/** A run: leaves the town and loads room 1 of the first biome (the town map is rebuilt by enterVillage when it ends). */
export function startRun(): void {
  cameFromRun = true;
  clearWorld();
  world.enemyGrid.clear();
  resetSystems();
  events.emit('runStart', {});
  if (!showcase.on) saveSpot(runInfo.mode === 'ADVENTURE' ? 'RUN' : 'TOWER');   // a refresh mid-run comes back outside the portal / tower
  spotPending = false;
  world.camera.yaw = 0; world.camera.dist = 1; world.camera.pitch = CAM_PITCH0;
  startRunRooms();
}

/** Real seconds per full town day. */
const TOWN_DAY_SEC = 480;
let prevStatus: GameStatus | null = null;
export function updateGame(rawDt: number): void {
  if (dreamFx.busy) blockInput();   // (the wake-up fade: no input)
  watchRank();
  tickFeel(rawDt);
  const status = useGameStore.getState().status;
  // coming home from a run (anything but the hero-select screen) moves the town clock on by 0.15..0.35 of a day
  if (status === GameStatus.MENU && prevStatus !== null && prevStatus !== GameStatus.MENU && prevStatus !== GameStatus.HERO_SELECT) world.townTime = (world.townTime + 0.15 + Math.random() * 0.2) % 1;
  prevStatus = status;
  if (status === GameStatus.MENU) {
    if (!villageReady) enterVillage();
    if (spotPending && useUiStore.getState().titleDone && world.village.area === 'TOWN' && !world.village.pending) { spotPending = false; applyLastSpot(); }
    const vdt = Math.min(rawDt, MAX_DT);
    if (vdt > 0 && useUiStore.getState().titleDone) {
      world.townTime = (world.townTime + vdt / TOWN_DAY_SEC) % 1;
      updateVillage(vdt);
      // skill / dash effects cast in town (harmless: no enemies)
      updateProjectiles(vdt); updateSkills(vdt); updateZones(vdt); updateCombatFx(vdt);
    }
    clearPressed();
    return;
  }
  if (status !== GameStatus.PLAYING) {
    clearPressed();
    return;
  }
  // Ultimate wind-up: the simulation is frozen (render keeps running) until the effect releases.
  if (tickUltWindup(Math.min(rawDt, 0.1))) { clearPressed(); return; }
  const dt = Math.min(rawDt, MAX_DT) * feel.timeScale;
  if (!(dt > 0)) return;

  updatePlayer(dt);
  rebuildEnemyGrid();
  updateDirector(dt);
  updateEnemies(dt);
  updateRoomEvents(dt);
  updateBiomeHazards(dt);
  updateMinions(dt);
  updateEnemyProjectiles(dt);
  updateProjectiles(dt);
  updateSkills(dt);
  updateZones(dt);
  updateBossFx(dt);
  updatePets(dt);
  updatePickups(dt);
  updateCrates(dt);
  updateCombatFx(dt);
  updateCombo(dt);
  tickShowcase(dt);

  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.run.time += dt;
  world.frame++;
  clearPressed();
}
