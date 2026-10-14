// ============================================================================
// Run director (Hades-style rooms). A run is a chain of small rooms grouped into biomes; each biome ends in a boss.
//
//   enterRoom -> FIGHT (telegraphed spawn bursts, or a boss) -> CLEARED (reward + 1..3 exit portals, loot is vacuumed)
//             -> LEAVING (0.4 s fade out, rebuild, fade in) -> next room ...
//   boss room: boss dead -> BIOME_DONE (big reward, then ONE big portal to the next biome opens; no return-to-town).
//
// Clear condition is simply "every enemy dead" (no timer, no quota). Depth scaling reuses the old wave formulas:
// world.director.wave = depthWave(biome, room). Pure engine code; the render layer reads world.room.
// ============================================================================
import { debug } from '../debug';
import { Vector3 } from 'three';
import { world, ROOM_MAX_ALIVE } from '../world';
import { events } from '../events';
import type { EnemyKind, RoomPlan, RewardKind, RoomType } from '../types';
import { ENEMY_DEFS, BOSS_NAMES, MINI_BOSSES, waveBudget, waveHpMult, type BossKind } from '../enemyDefs';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { runMods, runInfo } from '../runMods';
import {
  BIOMES, biomeOf, depthWave, firstPlan, nextChoices, portalLabel, rarityForDepth, shardRarity, REST_INDEX, ROOMS_PER_BIOME, BOSS_INDEX, PREBOSS_INDEX, type BiomeDef,
} from '../roomDefs';
import { shape, insideShape } from '../roomShape';
import { isHarvestNode, HARVEST_NAME } from '../mapgen';
import { hitCrate } from './crates';
import { buildRoom, roomRadius, startPos, stationPos, portalSlot } from '../roomgen';
import { spawnPickup, petCollect } from './pickups';
import { spawnEnemy, spawnMiniBoss, isSpawnable } from './enemies';
import { rollMerchantStock, clearMerchantStock } from './merchant';
import { resetTricks } from './tricks';
import { resetSpecials } from './bossSpecials';
import { resetBossFx } from './bossFx';
import { resetBosses2 } from './bosses2';
import type { Interactable } from './village';

const FADE_SECONDS = 0.4;
const FIRST_BURST_AT = 0.9;
const BOSS_GRACE = 2.5;        // after the boss falls, before its rewards drop
const REWARD_DELAY = 0.7;      // after the last kill, before the room reward appears
const VACUUM_AFTER = 1.4;      // loot left on the floor flies to the hero this long after the clear
const PORTAL_ARM = 0.9;        // seconds a portal must be open before walking in works
const MAX_UNITS = 72;

// ------------------------------------------------------------ module state ---
let biome = 0;
let index = 0;
let depth = 1;
let plan: RoomPlan = firstPlan();
let roomT = 0;
let clearT = 0;
let phaseClock = 0;

// pre-rolled spawn list (kinds + elite flag + group starts); bursts are index ranges into it
const unitKind: EnemyKind[] = new Array(MAX_UNITS).fill('SLIME');
const unitElite: boolean[] = new Array(MAX_UNITS).fill(false);
const unitGroup: boolean[] = new Array(MAX_UNITS).fill(false);
let unitN = 0;
let nextUnit = 0;
let bursts = 0;
let curBurst = 0;
let burstT = 0;
const burstEnd = [0, 0, 0, 0];
const burstSize = [0, 0, 0, 0];
let anchorX = 0, anchorZ = 0, groupIdx = 0, inGroup = 0;
let miniPending = false;
let miniKind: EnemyKind = 'BOAR';
let miniName = '', miniTitle = '';
let miniIsBoss = false;
let prebossKing = false;    // the Meadow's depth-10 Slime King      // the Lich: a full boss used as a mini-boss
let bossPending = false;
let bossSpawned = false;
let bossDeadT = -1;

let rewardT = -1;            // countdown to granting `rewardKind`
let rewardKind: RewardKind = 'NONE';
let rewardBonus = 0;
let shrineBonus = false;
let vacuumT = 0;
let vacuumTick = 0;
let leaveBiome = 0;
let leaveIndex = 0;
let leavePlan: RoomPlan = firstPlan();
const choices: RoomPlan[] = [];
const slot: [number, number] = [0, 0];
const tmp = new Vector3();
const tmp2 = new Vector3();

const dd = () => world.director;
const rm = () => world.room;

/** Biome in which a merchant door was already offered (-1 = none this run). */
let merchantBiome = -1, fountainBiome = -1, shrineBiome = -1;
let crystalAt = -1;
// final fight (after the Void boss) and endless tower state
let finalFight = false, endingDone = false;
let towerFloor = 0;
export const towerState = { floor: 0 };
/** Camp room layout (storage chest pile left of the fire, training post right), set on room entry. */
export const campPos = { storage: [0, 0] as [number, number], trainer: [0, 0] as [number, number], fire: [0, 0] as [number, number] };   // read by the HUD
const FINAL_BIOME = BIOMES.length - 1;
const towerBiome = (f: number): number => Math.floor((f - 1) / 5) % BIOMES.length;
function towerPlan(f: number): RoomPlan {
  if (f % 10 === 0) return { type: 'BOSS', reward: 'NONE' };
  if (f % 5 === 0) return { type: 'MINIBOSS', reward: 'ITEM' };
  if (f % 3 === 0) return { type: 'ELITE', reward: f % 2 ? 'GEMS' : 'CARD' };
  return { type: 'COMBAT', reward: f % 2 ? 'CARD' : f % 4 === 0 ? 'SHARDS' : 'GOLD' };
}   // room index of this biome's crystal cavern door (-1: none this biome, 50%)

export function resetDirector(): void {
  const d = world.director;
  d.wave = 1; d.phase = 'FIGHT'; d.phaseT = 0; d.maxAlive = ROOM_MAX_ALIVE; d.aliveCount = 0; d.bossId = -1;
  const r = world.room;
  r.active = false; r.fade = 1; r.fadeTarget = 0; r.enemiesLeft = 0; r.shrineOn = false;
  for (const p of r.portals) p.active = false;
  for (const m of r.markers) m.active = false;
  r.station.kind = 'NONE';
  world.boss.active = false;
  world.enemyGrid.clear();
  unitN = 0; nextUnit = 0; bursts = 0; curBurst = 0; miniPending = false; bossPending = false; bossSpawned = false; bossDeadT = -1;
  rewardT = -1; vacuumT = 0; shrineBonus = false;
  clearMerchantStock();
}

// ------------------------------------------------------------ run control ---
/** Begins a run: biome 0, room 0 (a skirmish), fading in from black. */
export function startRunRooms(): void {
  biome = 0; index = 0; merchantBiome = -1; fountainBiome = -1; shrineBiome = -1;
  finalFight = false; endingDone = false; towerFloor = 0; towerState.floor = 0; world.run.towerFloor = 0;
  world.room.fade = 1;
  if (runInfo.mode === 'TOWER') { towerFloor = 1; towerState.floor = 1; enterRoom(towerBiome(1), 0, towerPlan(1)); return; }
  enterRoom(0, 0, firstPlan());
}

/** Debug: jump straight to biome `b`, room `idx` of type `type` (boss rooms use debug.bossOverride if set). Run must be in progress. */
export function debugJump(b: number, idx: number, type: RoomType): void {
  merchantBiome = -1; fountainBiome = -1; shrineBiome = -1;
  world.room.fade = 1;
  enterRoom(b, idx, { type, reward: type === 'COMBAT' || type === 'ELITE' || type === 'MINIBOSS' ? 'CARD' : 'NONE', preboss: type === 'MINIBOSS' && idx === PREBOSS_INDEX });
}

/** After a boss: continue into the next biome (harder, same hero). */
export function descend(): void {
  const d = dd();
  if (d.phase !== 'BIOME_DONE') return;
  const p = world.player;
  const st = useGameStore.getState();
  p.hp = Math.min(st.stats.maxHealth, p.hp + st.stats.maxHealth * 0.3);
  if (biome === FINAL_BIOME && runInfo.mode === 'ADVENTURE') { finalFight = true; beginLeave({ type: 'BOSS', reward: 'NONE' }, biome, BOSS_INDEX); return; }   // the Undying Throne
  beginLeave(firstPlan(), biome + 1, 0);
}
/** The big portal's label after a boss. */
export const nextBiomeLabel = (): string => (biome === FINAL_BIOME && runInfo.mode === 'ADVENTURE' && !finalFight ? 'The Undying Throne' : `Next biome · ${biomeOf(biome + 1).name}`);

/** After a boss: bank the run (rank xp + room bonus gold are paid out) and show the summary. */
export function finishRunVictory(): void {
  const st = useGameStore.getState();
  st.closeAllUI();
  st.endRun({ ...world.run, wave: world.director.wave, victory: true });
}

// ------------------------------------------------------------ room loading ---
function clearTransient(): void {
  for (const e of world.enemies) e.active = false;
  for (const p of world.projectiles) p.active = false;
  for (const p of world.enemyProjectiles) p.active = false;
  for (const z of world.zones) z.active = false;
  for (const f of world.fx) f.active = false;
  for (const p of world.pickups) p.active = false;
  world.itemPickupsVersion++;
  for (const w of world.walls) w.active = false;
  world.boss.active = false;
  world.boss.staggered = false;
  world.boss.stagger = 0;
  world.enemyGrid.clear();
  resetTricks(); resetSpecials(); resetBossFx(); resetBosses2();
}

function enterRoom(b: number, idx: number, p: RoomPlan): void {
  if (idx === 0 && runInfo.mode === 'ADVENTURE') crystalAt = Math.random() < 0.5 ? 1 + Math.floor(Math.random() * (REST_INDEX - 1)) : -1;   // 50%: one crystal cavern this biome
  // every biome after the first opens with a quiet camp: storage (the town warehouse) + a training post (skills)
  if (runInfo.mode === 'ADVENTURE' && idx === 0 && b > 0 && !finalFight && p.type !== 'BOSS') p = { type: 'CAMP', reward: 'NONE' };
  biome = b; index = idx; plan = p;
  depth = runInfo.mode === 'TOWER' ? 2 + Math.round(towerFloor * 1.5) : depthWave(b, idx) + (p.type === 'MINIBOSS' || p.type === 'ELITE' ? 1 : 0);
  const d = world.director, r = world.room;
  const st = useGameStore.getState();
  clearTransient();

  const seed = (Math.random() * 4294967296) >>> 0;
  const R = roomRadius(p.type, seed);
  buildRoom(b, p.type, R, seed);

  r.active = true; r.version++; r.seed = seed; r.biome = b; r.index = idx; r.plan = p; r.radius = R;
  r.fadeTarget = 0; r.shrineOn = false;
  for (const po of r.portals) po.active = false;
  for (const m of r.markers) m.active = false;
  const [cx, cz] = stationPos(R);
  campPos.storage[0] = cx - 6; campPos.storage[1] = cz; campPos.trainer[0] = cx + 6; campPos.trainer[1] = cz; campPos.fire[0] = cx; campPos.fire[1] = cz + 1;
  const kind = p.type === 'FOUNTAIN' ? 'FOUNTAIN' : p.type === 'MERCHANT' ? 'MERCHANT' : p.type === 'TREASURE' ? 'CHEST' : p.type === 'SHRINE' ? 'ALTAR' : 'NONE';
  r.station.kind = kind; r.station.x = cx; r.station.z = cz; r.station.used = false; r.station.ready = kind === 'FOUNTAIN' || kind === 'MERCHANT' || kind === 'ALTAR';

  const pl = world.player;
  const [sx, sz] = startPos(R);
  pl.pos.set(sx, 0, sz); pl.vel.set(0, 0, 0); pl.dashT = 0; pl.facing = Math.PI;
  world.pet.pos.set(sx + 1.2, 1, sz + 1.2);

  d.wave = depth; d.phase = 'FIGHT'; d.phaseT = 0; d.aliveCount = 0; d.bossId = -1; d.maxAlive = ROOM_MAX_ALIVE;
  roomT = 0; clearT = 0; rewardT = -1; vacuumT = 0; vacuumTick = 0; shrineBonus = false;
  unitN = 0; nextUnit = 0; bursts = 0; curBurst = 0; burstT = 0; miniPending = false; bossPending = false; bossSpawned = false; bossDeadT = -1;
  groupIdx = 0; inGroup = 0;

  rollRoomSpawns(p.type);
  if (kind === 'MERCHANT') rollMerchantStock(depth);
  else clearMerchantStock();
  r.enemiesLeft = unitN + (miniPending ? 1 : 0) + (bossPending ? 1 : 0);

  st.setWave(depth);
  const boss = p.type === 'BOSS';
  events.emit('waveStart', { wave: depth, boss, elite: p.type === 'ELITE' });
  events.emit('roomEnter', { biome: b, index: idx, type: p.type, boss, name: finalFight ? 'The Undying Throne' : runInfo.mode === 'TOWER' ? `Endless Tower · Floor ${towerFloor}` : biomeOf(b).name });
  if (p.type === 'ELITE') st.addNotification('Elite champions guard this room!', '#a855f7', 'BOSS');
  if (p.type === 'CRYSTAL') st.addNotification('A quiet crystal cavern: harvest what you can, then pick an exit.', '#7fd8ff', 'SYSTEM');
}

function beginLeave(p: RoomPlan, nb: number, ni: number): void {
  const d = dd();
  if (d.phase === 'LEAVING') return;
  leavePlan = p; leaveBiome = nb; leaveIndex = ni;
  d.phase = 'LEAVING'; d.phaseT = 0;
  world.room.fadeTarget = 1;
  const st = useGameStore.getState();
  if (st.isShopOpen || st.isInventoryOpen || st.isCharacterSheetOpen) st.closeAllUI();
  for (const po of world.room.portals) po.active = false;
}

function finishLeave(): void {
  // anything still on the floor goes into the bag (full bag: left behind)
  const pk = world.pickups;
  for (let i = 0; i < pk.length; i++) if (pk[i].active) petCollect(pk[i]);
  enterRoom(leaveBiome, leaveIndex, leavePlan);
}

// ------------------------------------------------------------ spawn plan ----
function rosterPick(def: BiomeDef, maxCost: number, minCost: number): EnemyKind {
  const loop = biome >= BIOMES.length;
  let total = 0;
  for (const [k, w, from] of def.roster) {
    const c = ENEMY_DEFS[k].cost;
    if ((loop || from <= index) && c <= maxCost && c >= minCost) total += w;
  }
  if (total <= 0) return def.roster[0][0];
  let r = Math.random() * total;
  for (const [k, w, from] of def.roster) {
    const c = ENEMY_DEFS[k].cost;
    if (!((loop || from <= index) && c <= maxCost && c >= minCost)) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return def.roster[0][0];
}

function pushGroup(kind: EnemyKind, n: number, elite: boolean): void {
  for (let i = 0; i < n && unitN < MAX_UNITS; i++) {
    unitKind[unitN] = kind; unitElite[unitN] = elite; unitGroup[unitN] = i === 0; unitN++;
  }
}

/** Rolls the room's pack list (budget from the depth formula, capped) and splits it into bursts. */
function rollPack(mult: number, elites: number, nBursts: number): void {
  const def = biomeOf(biome);
  const mods = runMods(useGameStore.getState().difficulty);
  elites += elites > 0 ? mods.elites : 0;   // Ascension 9: one more elite in elite rooms
  let points = Math.min(waveBudget(depth) * mult, 140) * mods.spawn;
  let guard = 0;
  while (points > 0.9 && unitN < MAX_UNITS - elites - 2 && guard++ < 60) {
    const kind = rosterPick(def, Math.min(points, 12), 0);
    const cost = ENEMY_DEFS[kind].cost;
    let n = kind === 'BAT' ? 4 + Math.floor(Math.random() * 3) : Math.random() < 0.65 ? Math.max(1, Math.round((3 + Math.random() * 3) / Math.sqrt(cost))) : 1;
    n = Math.max(1, Math.min(n, Math.floor(points / cost) || 1));
    pushGroup(kind, n, false);
    points -= n * cost;
  }
  const normal = unitN;
  for (let i = 0; i < elites; i++) pushGroup(rosterPick(def, 99, 1.5), 1, true);
  // bursts: split the normal units in equal parts; elites join the last burst
  bursts = Math.max(1, Math.min(nBursts, 4));
  let prev = 0;
  for (let b = 0; b < bursts; b++) {
    const end = b === bursts - 1 ? unitN : Math.min(normal, Math.round(((b + 1) * normal) / bursts));
    // never split a group across bursts
    let e = end;
    if (b < bursts - 1) while (e < normal && !unitGroup[e]) e++;
    burstEnd[b] = Math.max(prev, Math.min(e, unitN));
    burstSize[b] = burstEnd[b] - prev;
    prev = burstEnd[b];
  }
}

function rollRoomSpawns(type: RoomType): void {
  const def = biomeOf(biome);
  const eliteN = (base: number, per: number) => Math.min(5, base + Math.floor(depth / per));
  switch (type) {
    case 'COMBAT': rollPack(0.62, 0, depth < 3 ? 2 : 3); break;
    case 'ELITE': rollPack(0.3, eliteN(2, 14), 2); break;
    case 'TREASURE': rollPack(0.4, 0, 2); break;
    case 'MINIBOSS': {
      rollPack(0.3, 0, 2);
      miniPending = true;
      prebossKing = false;
      if (plan.preboss && runInfo.mode === 'ADVENTURE' && biome % BIOMES.length === 0) {
        // depth 10 of the Meadow: the Slime King (a giant splitter with half the Golem's hp, full boss bar)
        miniIsBoss = false; prebossKing = true; miniKind = 'SPLITTER'; miniName = 'The Slime King'; miniTitle = 'Lord of the Meadow Ooze';
      } else if (def.lichCrypt && depth >= 14 && Math.random() < 0.35) {
        miniIsBoss = true; miniKind = 'BOSS_LICH'; miniName = BOSS_NAMES.BOSS_LICH.name; miniTitle = BOSS_NAMES.BOSS_LICH.title;
      } else {
        const m = MINI_BOSSES[def.minis[Math.floor(Math.random() * def.minis.length)]];
        miniIsBoss = false; miniKind = m.kind; miniName = m.name; miniTitle = m.title;
      }
      break;
    }
    case 'BOSS': bossPending = true; break;
    default: break; // fountain / merchant / shrine (until the challenge is accepted): nothing to fight
  }
}

/** Shrine challenge: a harder pack than a skirmish of the same depth. */
function startShrineChallenge(): void {
  const r = rm(), d = dd();
  r.shrineOn = true; r.station.used = true;
  for (const po of r.portals) po.active = false;
  unitN = 0; nextUnit = 0; curBurst = 0; burstT = 0; groupIdx = 0; inGroup = 0;
  rollPack(1.0, Math.min(5, 2 + Math.floor(depth / 12)), 3);
  d.phase = 'FIGHT'; d.phaseT = 0; roomT = 0; clearT = 0;
  shrineBonus = true;
  useGameStore.getState().addNotification('The shrine awakens!', '#c084fc', 'BOSS');
  events.emit('shake', { amount: 0.4 });
}

// ------------------------------------------------------------ spawning ------
function freeMarker(): number {
  const m = world.room.markers;
  for (let i = 0; i < m.length; i++) if (!m[i].active) return i;
  return -1;
}

function placeMarker(kind: EnemyKind, x: number, z: number, elite: boolean, dur: number, tag: number): boolean {
  const i = freeMarker();
  if (i < 0) return false;
  const m = world.room.markers[i];
  m.active = true; m.x = x; m.z = z; m.t = 0; m.dur = dur; m.kind = kind; m.elite = elite; m.tag = tag;
  return true;
}

function pickAnchor(minPlayerDist: number): boolean {
  const pp = world.player.pos;
  for (let t = 0; t < 40; t++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (shape.maxR - 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!insideShape(x, z, 4)) continue;
    if ((x - pp.x) ** 2 + (z - pp.z) ** 2 < minPlayerDist * minPlayerDist) continue;
    if (!isSpawnable(x, z)) continue;
    anchorX = x; anchorZ = z;
    return true;
  }
  return false;
}

function activeMarkers(): number {
  let n = 0;
  const m = world.room.markers;
  for (let i = 0; i < m.length; i++) if (m[i].active) n++;
  return n;
}

function materialise(kind: EnemyKind, x: number, z: number, elite: boolean, tag: number): void {
  tmp.set(x, 0, z);
  if (tag === 2) { spawnBossAt(kind, x, z); return; }
  if (tag === 1) {
    const e = spawnMiniBoss(kind, tmp, miniName, miniTitle);
    if (e && prebossKing) {   // the Slime King: half a Golem's hp at this depth, huge and slow, bursts into slimes when it pops
      // half of the Golem as it spawns in its own boss room (depth 15 = wave 10*(biome+1), boss hp rule of spawnEnemy)
      const m = runMods(useGameStore.getState().difficulty);
      e.maxHp = Math.round(ENEMY_DEFS.BOSS_GOLEM.hp * waveHpMult(10 * (biome + 1)) * m.hp * 0.25 * m.bossHp * 0.5); e.hp = e.maxHp;   // half of the (halved) Golem
      e.scale *= 1.6; e.radius *= 1.5; e.contactDamage *= 1.5; e.speed *= 0.85; e.elite = false;
      world.boss.hp = e.hp; world.boss.maxHp = e.maxHp;
    }
    if (e) {
      events.emit('bossSpawn', { name: miniName, title: miniTitle });
      events.emit('shake', { amount: 0.3 });
    }
    return;
  }
  spawnEnemy(kind, tmp, elite ? { elite: true } : undefined);
}

function spawnBossAt(kind: EnemyKind, x: number, z: number): void {
  const d = dd();
  const e = spawnEnemy(kind, tmp.set(x, 0, z));
  if (!e) return;
  const names = finalFight ? { name: 'Malakar the Undying', title: 'Lord of the Void' } : BOSS_NAMES[kind as BossKind];
  if (finalFight) { e.maxHp = Math.round(e.maxHp * 3.2); e.hp = e.maxHp; e.radius *= 1.25; e.scale *= 1.35; e.contactDamage *= 1.3; e.projectileDamage *= 1.3; }   // the true villain
  d.bossId = e.id;
  const hud = world.boss;
  hud.active = true; hud.name = names.name; hud.title = names.title;
  hud.hp = e.hp; hud.maxHp = e.maxHp; hud.phase = 0;
  events.emit('bossSpawn', { name: names.name, title: names.title });
  events.emit('shake', { amount: 0.5 });
  useGameStore.getState().addNotification(`${names.name}, the ${names.title}, approaches!`, '#ef4444', 'BOSS');
}

function tickSpawns(dt: number): void {
  const R = world.room, d = dd();
  // telegraphs expire into enemies
  for (let i = 0; i < R.markers.length; i++) {
    const m = R.markers[i];
    if (!m.active) continue;
    m.t += dt;
    if (m.t >= m.dur) { m.active = false; materialise(m.kind, m.x, m.z, m.elite, m.tag); }
  }
  if (roomT < FIRST_BURST_AT) return;

  if (bossPending && roomT >= 1.2) {
    bossPending = false;
    const kind = finalFight ? 'BOSS_LICH' : debug.bossOverride || biomeOf(biome).boss;
    placeMarker(kind, 0, -R.radius * 0.35, false, 1.8, 2);
    bossSpawned = true;
  }
  if (miniPending && roomT >= 1.0) {
    {   // spawns in the open arena kept clear by roomgen (stationPos of a MINIBOSS room, radius 12)
      miniPending = false;
      const [mx, mz] = stationPos(R.radius);
      placeMarker(miniKind, mx, mz, false, 1.5, miniIsBoss ? 2 : 1);
      if (miniIsBoss) bossSpawned = true;
    }
  }
  if (unitN === 0) return;

  const pending = activeMarkers();
  if (nextUnit < burstEnd[curBurst]) {
    let cap = ROOM_MAX_ALIVE - d.aliveCount - pending;
    while (cap > 0 && nextUnit < burstEnd[curBurst]) {
      if (unitGroup[nextUnit] || groupIdx === 0) {
        if (!pickAnchor(10)) break;
        inGroup = 0; groupIdx++;
      }
      const dur = 0.95 + Math.min(0.7, (groupIdx % 6) * 0.12);
      let x = anchorX, z = anchorZ;
      if (inGroup > 0) {
        const a = inGroup * 2.4 + groupIdx, rr = 0.9 * Math.sqrt(inGroup);
        const tx = anchorX + Math.sin(a) * rr, tz = anchorZ + Math.cos(a) * rr;
        if (isSpawnable(tx, tz)) { x = tx; z = tz; }
      }
      if (!placeMarker(unitKind[nextUnit], x, z, unitElite[nextUnit], dur, 0)) break;
      inGroup++; nextUnit++; cap--;
    }
  } else if (curBurst + 1 < bursts) {
    burstT += dt;
    const low = Math.max(2, Math.floor(burstSize[curBurst] * 0.3));
    if (d.aliveCount + pending <= low || burstT > 18) { curBurst++; burstT = 0; }
  }
}

// ------------------------------------------------------------ rewards -------
const at = (x: number, z: number): Vector3 => tmp2.set(x, 0, z);

function grantReward(kind: RewardKind, bonus: number): void {
  const st = useGameStore.getState();
  const R = world.room.radius;
  const cz = -R * 0.08;
  switch (kind) {
    case 'CARD': st.openWaveReward(Math.random() < (plan.type === 'COMBAT' ? 0.12 : 0.4)); break;
    case 'GOLD': {
      const total = Math.round((70 + depth * 20) * (plan.type === 'COMBAT' ? 1 : 1.4));
      for (let i = 0; i < 6; i++) spawnPickup('GOLD', at(0, cz), Math.round(total / 6));
      break;
    }
    case 'SHARDS': {
      const n = 4 + Math.floor(depth / 6);
      for (let i = 0; i < n; i++) spawnPickup('SHARD', at(0, cz), shardRarity(depth));
      break;
    }
    case 'ITEM': {
      const it = st.rollItemDrop(rarityForDepth(depth, bonus, world.run.bossKills));
      if (it) spawnPickup('ITEM', at(0, cz), 0, it);
      break;
    }
    case 'HEAL': {
      const v = Math.round(st.stats.maxHealth * 0.2);
      for (let i = 0; i < 3; i++) spawnPickup('HEALTH', at(0, cz), v);
      break;
    }
    case 'GEMS': {
      const n = 3 + Math.floor(depth / 5);
      for (let i = 0; i < 3; i++) spawnPickup('GEM', at(0, cz), Math.ceil(n / 3));
      break;
    }
    default: break;
  }
}

function bossRewards(): void {
  const st = useGameStore.getState();
  const R = world.room.radius;
  const items = 2;
  for (let i = 0; i < items; i++) {
    const it = st.rollItemDrop(rarityForDepth(depth, 0.35 + i * 0.1, world.run.bossKills - 1));
    if (it) spawnPickup('ITEM', at((i - 0.5) * 2, 0), 0, it);
  }
  for (let i = 0; i < 4; i++) spawnPickup('GEM', at(0, -R * 0.1), 4 + biome * 2);
  for (let i = 0; i < 8; i++) spawnPickup('SHARD', at(0, -R * 0.1), shardRarity(depth + 12));
  for (let i = 0; i < 8; i++) spawnPickup('GOLD', at(0, -R * 0.1), Math.round(40 + depth * 12));
  st.openWaveReward(true);
}

// ------------------------------------------------------------ clearing ------
function openPortals(): void {
  const r = world.room;
  if (runInfo.mode === 'TOWER') {   // one way up
    const po = r.portals[0];
    for (const q of r.portals) q.active = false;
    portalSlot(0, 1, r.radius, slot);
    choices.length = 0; choices.push(towerPlan(towerFloor + 1));
    po.active = true; po.x = slot[0]; po.z = slot[1]; po.t = 0; po.plan = choices[0]; po.big = false;
    events.emit('portalsOpen', {});
    return;
  }
  const n = nextChoices(biome, index, choices, merchantBiome !== biome, fountainBiome !== biome, shrineBiome !== biome, index + 1 === crystalAt);
  if (choices.some((c) => c.type === 'SHRINE')) shrineBiome = biome;       // the optional challenge: once per biome
  if (choices.some((c) => c.type === 'MERCHANT')) merchantBiome = biome;   // the travelling merchant shows up once per biome
  if (choices.some((c) => c.type === 'FOUNTAIN')) fountainBiome = biome;   // ...and so does a fountain
  for (let i = 0; i < r.portals.length; i++) {
    const po = r.portals[i];
    if (i >= n) { po.active = false; continue; }
    portalSlot(i, n, r.radius, slot);
    po.active = true; po.x = slot[0]; po.z = slot[1]; po.t = 0; po.plan = choices[i]; po.big = false;
  }
  events.emit('portalsOpen', {});
}

function showPortals(): void {
  // shrine: reopen the same doors after the challenge
  const r = world.room;
  for (let i = 0; i < r.portals.length; i++) if (i < choices.length) { const po = r.portals[i]; po.active = true; po.t = 0; }
}

function onCleared(): void {
  const d = dd(), st = useGameStore.getState();
  world.boss.active = false;
  d.phase = 'CLEARED'; d.phaseT = 0;
  phaseClock = 0;
  vacuumT = VACUUM_AFTER; vacuumTick = 0;
  events.emit('waveClear', { wave: depth, fast: roomT < 40 });
  if (runInfo.mode === 'TOWER') towerCleared();
  const t = plan.type;
  if (t === 'TREASURE') world.room.station.ready = true;
  // reward for this room
  if (world.room.shrineOn) { rewardKind = 'CARD'; rewardBonus = 0.3; } else { rewardKind = plan.reward; rewardBonus = t === 'ELITE' ? 0.1 : t === 'MINIBOSS' ? 0.15 : 0; }
  rewardT = rewardKind === 'NONE' ? -1 : REWARD_DELAY;
  if (world.room.shrineOn) {
    // challenge bonus on top of the card
    const it = st.rollItemDrop(rarityForDepth(depth, 0.3, world.run.bossKills));
    if (it) spawnPickup('ITEM', at(0, -world.room.radius * 0.08), 0, it);
    for (let i = 0; i < 3; i++) spawnPickup('GEM', at(0, -world.room.radius * 0.08), 2 + Math.floor(depth / 6));
    shrineBonus = false;
    showPortals();
  } else openPortals();
}

function bossDefeated(): boolean {
  const d = dd();
  if (d.bossId < 0) return !bossPending && bossSpawned; // spawn failed
  const b = world.enemies[d.bossId];
  return !b.active || b.state === 'DYING' || !b.boss;
}

function tickFight(dt: number): void {
  const d = dd(), r = world.room;
  roomT += dt;
  tickSpawns(dt);
  const markers = activeMarkers();
  r.enemiesLeft = d.aliveCount + markers + (unitN - nextUnit) + (miniPending ? 1 : 0) + (bossPending ? 1 : 0);

  if (plan.type === 'BOSS') {
    if (bossSpawned && bossDefeated()) {
      bossDeadT = bossDeadT < 0 ? 0 : bossDeadT + dt;
      if (bossDeadT >= BOSS_GRACE) onBossCleared();
    }
    return;
  }
  const idle = nextUnit >= unitN && !miniPending && markers === 0 && d.aliveCount === 0;
  if (r.shrineOn) { if (roomT > 1.2 && idle && unitN > 0) onCleared(); return; }
  if (roomT > (unitN === 0 && !miniPending ? 0.6 : 1.2) && idle) onCleared();
}

function towerCleared(): void {
  const st = useGameStore.getState();
  world.run.towerFloor = towerFloor;
  const best = st.recordTowerFloor(towerFloor);
  events.emit('towerFloor', { floor: towerFloor, best });
  if (towerFloor % 5 === 0) for (let i = 0; i < 3; i++) spawnPickup('GEM', at(0, 0), 2 + Math.floor(towerFloor / 5));   // milestone gems
}

function onBossCleared(): void {
  const d = dd();
  world.boss.active = false;
  if (runInfo.mode === 'TOWER') {   // a tower boss floor: rewards, then the way up
    for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
    bossRewards(); onCleared(); return;
  }
  if (finalFight) {   // Malakar falls: the ending
    d.phase = 'BIOME_DONE'; d.phaseT = 0; endingDone = true;
    for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
    vacuumT = VACUUM_AFTER; vacuumTick = 0;
    world.run.bossKills = Math.max(world.run.bossKills, 1);
    events.emit('gameEnding', {});
    return;
  }
  d.phase = 'BIOME_DONE'; d.phaseT = 0;
  // adds vanish with their master
  for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
  const st = useGameStore.getState();
  vacuumT = VACUUM_AFTER; vacuumTick = 0;
  events.emit('waveClear', { wave: depth, fast: false });
  events.emit('biomeClear', { biome });
  st.addNotification(`${biomeOf(biome).name} conquered!`, '#fbbf24', 'BOSS');
  bossRewards();
}

// ------------------------------------------------------------ interaction ---
export const MAX_ROOM_NEARBY = 3;
/** Room interactables, same shape as the town's `nearby` list so the shared interact pills can draw them. node: 0..2 = portal, 10 = station. */
export const roomNearby: Interactable[] = Array.from({ length: MAX_ROOM_NEARBY }, () => ({ active: false, key: 'E', verb: '', label: '', shop: '', node: -1, d2: 0, act: 'shop' as const }));
let nearbyN = 0, harvestCd = 0;
function pushNearby(verb: string, label: string, node: number, d2: number): void {
  let i = nearbyN < MAX_ROOM_NEARBY ? nearbyN : MAX_ROOM_NEARBY;
  if (i === MAX_ROOM_NEARBY) { if (d2 >= roomNearby[MAX_ROOM_NEARBY - 1].d2) return; i = MAX_ROOM_NEARBY - 1; } else nearbyN++;
  while (i > 0 && roomNearby[i - 1].d2 > d2) { const a = roomNearby[i], b = roomNearby[i - 1]; a.verb = b.verb; a.label = b.label; a.node = b.node; a.d2 = b.d2; i--; }
  const t = roomNearby[i]; t.key = 'E'; t.verb = verb; t.label = label; t.node = node; t.d2 = d2;
}
function scanNearby(): void {
  nearbyN = 0;
  const d = dd(), r = world.room, p = world.player.pos;
  // no harvesting / interacting while monsters are still alive in the room (combat)
  let fighting = false;
  for (let i = 0; i < world.enemies.length && !fighting; i++) { const e = world.enemies[i]; if (e.active && e.state !== 'DYING') fighting = true; }
  if (r.fade < 0.6 && d.phase !== 'LEAVING' && !fighting) {
    const q = (x: number, z: number) => (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d.phase === 'CLEARED') {
      for (let i = 0; i < r.portals.length; i++) {
        const po = r.portals[i];
        if (!po.active || po.t < 0.5) continue;
        const dist = q(po.x, po.z);
        if (dist < 36) { const l = portalLabel(po.plan, biome); pushNearby('Enter', `${l.title} · ${l.sub}`, i, dist); }
      }
    }
    if (d.phase === 'BIOME_DONE') {   // the big portal to the next biome
      const po = r.portals[0];
      if (po.active && po.big && po.t >= PORTAL_ARM) { const dist = q(po.x, po.z); if (dist < 49) pushNearby('Enter', nextBiomeLabel(), 20, dist); }
    }
    // harvest nodes: hold E next to one
    const cr = world.crates;
    for (let i = 0; i < cr.length; i++) {
      const c = cr[i];
      if (!c.active || !isHarvestNode(c.kind)) continue;
      const dist = q(c.pos.x, c.pos.z);
      if (dist < 9) pushNearby('Harvest', HARVEST_NAME[c.kind] ?? 'Node', 100 + i, dist);
    }
    if (r.plan.type === 'CAMP') {
      const ds = q(campPos.storage[0], campPos.storage[1]); if (ds < 12) pushNearby('Open', 'Camp Storage', 30, ds);
      const dt2 = q(campPos.trainer[0], campPos.trainer[1]); if (dt2 < 12) pushNearby('Train', 'Training Post', 31, dt2);
    }
    const s = r.station;
    if (s.kind !== 'NONE' && !(s.used && s.kind !== 'MERCHANT')) {
      const dist = q(s.x, s.z);
      if (dist < 20) {
        if (s.kind === 'FOUNTAIN') pushNearby('Drink', 'Healing Fountain', 10, dist);
        else if (s.kind === 'MERCHANT') pushNearby('Trade', 'Travelling Merchant', 10, dist);
        else if (s.kind === 'CHEST' && s.ready) pushNearby('Open', 'Treasure Chest', 10, dist);
        else if (s.kind === 'ALTAR' && d.phase === 'CLEARED') pushNearby('Begin', 'Challenge Shrine', 10, dist);
      }
    }
  }
  for (let i = 0; i < MAX_ROOM_NEARBY; i++) roomNearby[i].active = i < nearbyN;
}

/** Same action as pressing E next to the thing (also used by the touch interact pills). */
export function interactRoom(it: Interactable): void {
  const d = dd(), r = world.room, st = useGameStore.getState();
  if (st.status !== GameStatus.PLAYING) return;
  if (it.node >= 0 && it.node < 3) {
    const po = r.portals[it.node];
    if (po.active && d.phase === 'CLEARED' && po.t >= PORTAL_ARM && r.fade < 0.3 && world.player.alive) {
      if (runInfo.mode === 'TOWER') { towerFloor++; towerState.floor = towerFloor; beginLeave(po.plan, towerBiome(towerFloor), (towerFloor - 1) % ROOMS_PER_BIOME); }
      else beginLeave(po.plan, biome, index + 1);
    }
    return;
  }
  if (it.node === 30) { st.openSpecificShop('WAREHOUSE'); return; }   // camp storage = the town warehouse
  if (it.node === 31) { st.openSpecificShop('SKILLS'); return; }      // camp training post
  if (it.node >= 100) {   // harvest stroke (held E repeats it every 0.3 s)
    const c = world.crates[it.node - 100];
    if (c && c.active && harvestCd <= 0 && world.player.alive) {
      harvestCd = 0.3; hitCrate(c, 15, true);
      world.player.anim.attackT = 1; world.player.facing = Math.atan2(c.pos.x - world.player.pos.x, c.pos.z - world.player.pos.z);
    }
    return;
  }
  if (it.node === 20) {
    const po = r.portals[0];
    if (po.active && po.big && d.phase === 'BIOME_DONE') { po.active = false; po.big = false; descend(); }
    return;
  }
  const s = r.station;
  if (it.node !== 10) return;
  const p = world.player;
  if (s.kind === 'FOUNTAIN' && !s.used) {
    s.used = true;
    const hp = st.stats.maxHealth * 0.4, mp = st.stats.maxMana * 0.4;
    const before = p.hp;
    p.hp = Math.min(st.stats.maxHealth, p.hp + hp);
    p.mana = Math.min(st.stats.maxMana, p.mana + mp);
    events.emit('heal', { pos: p.pos, amount: p.hp - before });
    st.addNotification('The fountain restores 40% HP and MP.', '#5fd6ff', 'SYSTEM');
    // ...and grants a random blessing for the rest of the run
    const kinds = ['FORTUNE', 'MIGHT', 'AEGIS', 'SWIFT', 'VITALITY', 'PRECISION'] as const;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const label = st.applyBlessing(kind);
    if (kind === 'AEGIS') p.shieldCharges += 1;
    if (kind === 'VITALITY') p.hp = Math.min(useGameStore.getState().stats.maxHealth, p.hp + st.stats.maxHealth * 0.2);
    events.emit('floatText', { pos: p.pos, text: label.split(':')[0], color: 0xffd36a, scale: 1.1, dy: 1.6 });
    events.emit('shockwave', { pos: p.pos.clone(), radius: 5, color: 0xffd36a });
  } else if (s.kind === 'MERCHANT') {
    if (!st.isShopOpen) st.openSpecificShop('MERCHANT');
  } else if (s.kind === 'CHEST' && s.ready && !s.used) {
    s.used = true;
    const it2 = st.rollItemDrop(rarityForDepth(depth, 0.2, world.run.bossKills));
    if (it2) spawnPickup('ITEM', at(s.x, s.z), 0, it2);
    for (let i = 0; i < 4; i++) spawnPickup('GOLD', at(s.x, s.z), Math.round(30 + depth * 8));
    for (let i = 0; i < 3; i++) spawnPickup('SHARD', at(s.x, s.z), shardRarity(depth));
    events.emit('shake', { amount: 0.25 });
    vacuumT = 1.2; // pick it all up soon
  } else if (s.kind === 'ALTAR' && !s.used && d.phase === 'CLEARED') {
    startShrineChallenge();
  }
}

// ------------------------------------------------------------ frame ---------
export function updateDirector(dt: number): void {
  const d = dd(), r = world.room, st = useGameStore.getState();
  if (!r.active) return;
  d.phaseT += dt;
  r.fade += Math.sign(r.fadeTarget - r.fade) * Math.min(Math.abs(r.fadeTarget - r.fade), dt / FADE_SECONDS);

  if (rewardT >= 0) { rewardT -= dt; if (rewardT < 0) grantReward(rewardKind, rewardBonus); }

  switch (d.phase) {
    case 'FIGHT': tickFight(dt); break;
    case 'LEAVING': if (r.fade >= 0.999) finishLeave(); break;
    default: break;
  }
  if (d.phase === 'CLEARED' || d.phase === 'BIOME_DONE') {
    phaseClock += dt;
    if (vacuumT > 0) { vacuumT -= dt; vacuumTick = 0; }
    else { vacuumTick -= dt; if (vacuumTick <= 0) { vacuumTick = 0.3; vacuumLoot(); } }
  }
  // after a boss: one big portal to the next biome opens (no return-to-town choice); walking in descends
  if (d.phase === 'BIOME_DONE' && st.status === GameStatus.PLAYING) {
    const pl = world.player, po = r.portals[0];
    if (!po.active && d.phaseT > 1.2 && !endingDone) {
      for (const q of r.portals) q.active = false;
      po.active = true; po.big = true; po.t = 0; po.x = 0; po.z = -r.radius * 0.45; po.plan = { type: 'COMBAT', reward: 'NONE' };
      events.emit('portalsOpen', {});
    } else if (po.active && po.big) {
      po.t += dt;
      void pl;   // entered with E (scanNearby / interactRoom), never by touching
    }
  }
  if (d.phase === 'CLEARED') {
    for (let i = 0; i < r.portals.length; i++) { const po = r.portals[i]; if (po.active) po.t += dt; }   // portals are entered with E
  }

  scanNearby();
  harvestCd = Math.max(0, harvestCd - dt);
  if (world.input.keys.KeyE && !world.input.pressed.KeyE && roomNearby[0].active && roomNearby[0].node >= 100 && !st.isShopOpen) interactRoom(roomNearby[0]);
  if (world.input.pressed.KeyE && roomNearby[0].active && !st.isShopOpen && !st.isInventoryOpen && !st.isCharacterSheetOpen) interactRoom(roomNearby[0]);
}

function vacuumLoot(): void {
  const pk = world.pickups;
  for (let i = 0; i < pk.length; i++) if (pk[i].active) pk[i].magnet = true;
}
