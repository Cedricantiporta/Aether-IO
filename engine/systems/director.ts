import { feedReward } from '../../rewardFeed';
import { RARITY_LABEL_COLOR } from '../../constants';
import { resetBossMech } from './bossMech';
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
import { ENEMY_DEFS, BOSS_NAMES, MINI_BOSSES, waveBudget, waveHpMult, isSwarm, type BossKind } from '../enemyDefs';
import { feat, MAX_FIXED } from '../roomFeatures';
import { useGameStore, makeItemById } from '../../store';
import { GameStatus } from '../../types';
import { runMods, runInfo } from '../runMods';
import {
  BIOMES, biomeOf, bossNameIn, depthWave, firstPlan, nextChoices, portalLabel, rarityForDepth, shardRarity, REST_INDEX, ROOMS_PER_BIOME, BOSS_INDEX, PREBOSS_INDEX, type BiomeDef,
} from '../roomDefs';
import { shape, insideShape } from '../roomShape';
import { isHarvestNode, HARVEST_NAME } from '../mapgen';
import { hitCrate } from './crates';
import { buildRoom, roomRadius, startPos, stationPos, portalSlot } from '../roomgen';
import { spawnPickup, petCollect, lootPickup } from './pickups';
import { clearMinions } from './minions';
import { LOOT_BY_ID, lootItem } from '../../loot';
import { SOUL_EMBER } from '../../crafting';
const SOUL_EMBER_CHANCE = 0.05;
import { startRoomEvent, roomEventCleared, resetRoomEvent, freeCaptive } from './roomEvents';
import { spawnEnemy, spawnMiniBoss, isSpawnable } from './enemies';
import { rollMerchantStock, clearMerchantStock } from './merchant';
import { resetTricks } from './tricks';
import { resetSpecials, setSlimeKing, initSpecial } from './bossSpecials';
import { resetBossFx } from './bossFx';
import { resetBosses2 } from './bosses2';
import type { Interactable } from './village';
import { spawnDarkHero, DARK_CLASSES } from './darkHero';
import { isArenaRoom, arenaRadius } from '../arenaRooms';
import { GATES, GATE_KEYS_NEEDED, GATEKEEPER_LINES, gateState, resetGates, gatePlan, isLastStep, hubPlan, gatePos, CASTLE_DOOR, KEEPER_POS, HUB_START } from '../gates';
import type { HeroClass } from '../../types';
import { maybeWanderer, talkWanderer, clearWanderer, resetWanderers, wander, WANDERERS, placeKeeper } from '../wanderers';
import { dialogueOpen, advanceDialogue, acceptOffer, openCustomDialogue } from './dialogue';
// Daily Trial (dailyChallenge.ts): a short seeded tower-style climb; these hooks only apply while daily.on
import { daily, dailyPlan, dailyBiome, dailyRoomSeed, dailyDepth, climbTitle, climbFloor, DAILY_FLOORS } from '../../dailyChallenge';
import { dailyFloorCleared, tickDaily } from './dailyRun';
// Endless Waves (endlessWaves.ts): one arena, wave after wave (towerFloor = the wave number); hooks only while waves.on
import { waves, wavePlan, waveBiome, waveDepth, waveIndex, waveElites, waveCrowd, waveExtraBosses, waveBossMinis, waveMinis, waveMiniElites, WAVE_BREAK, WAVES_ARENA_R } from '../../endlessWaves';

const FADE_SECONDS = 0.4;
const FIRST_BURST_AT = 0.9;
const BOSS_GRACE = 2.5;        // after the boss falls, before its rewards drop
const MINI_MAX_ALIVE = 10;     // champion / boss rooms: room-pack adds alive at once (boss summons are capped by the boss AI)
const REWARD_DELAY = 0.7;      // after the last kill, before the room reward appears
const VACUUM_AFTER = 1.4;      // loot left on the floor flies to the hero this long after the clear
const PORTAL_ARM = 0.9;        // seconds a portal must be open before walking in works
const MAX_UNITS = 140;   // (Endless Tower floors roll twice the pack)

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
/** Endless Waves stacking (owner): extra bosses beside the wave's boss, and how many mini-bosses a wave brings. */
let extraBosses: EnemyKind[] = [];
let miniCount = 1;
// stage monsters placed by the room layout (goblin archers on their towers, lake hydras): spawned with the first burst
const fixedKind: EnemyKind[] = new Array(MAX_FIXED * 2).fill('GOBLIN_ARCHER');
const fixedX = new Float32Array(MAX_FIXED * 2), fixedZ = new Float32Array(MAX_FIXED * 2);
let fixedN = 0;
let miniKind: EnemyKind = 'BOAR';
let miniName = '', miniTitle = '';
let miniIsBoss = false;
/** Champion rooms / dark hero duels (not the depth-10 pre-boss): hp factor (owner: -30%). */
const CHAMPION_HP = 0.7;
let prebossRoom = false;   // this MINIBOSS room is the depth-10 pre-boss (-25% hp)
let prebossKing = false;    // the Meadow's depth-10 Slime King      // the Lich: a full boss used as a mini-boss
let bossPending = false;
let duelPending = false;          // DUEL room: the dark hero still has to rise
let duelCls: HeroClass = 'KNIGHT';
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
/** Boss key of the current biome: found in a room after the champion (depth 10); opens a boss door early. */
export const bossKeyState = { has: false };
const BOSS_KEY_DROPS = false;
// final fight (after the Void boss) and endless tower state
let finalFight = false, endingDone = false;
/** Malakar is fought twice: stage 1 (slower, fewer adds); slain, he rises again as stage 2 (stronger, new attacks). */
let finalStage = 1;
/** A boss kind to spawn next in this room instead of the biome boss (currently unused - Ignar no longer has a second form); '' = the biome boss. */
let nextBossKind: EnemyKind | '' = '';
/** Elderroot guards Greenwood, Gorath the Marble Halls. */
function biomeBoss(b: number): EnemyKind { return biomeOf(b).boss; }
/** The finale after stage 2 falls: 1 his last words, 2 his essence collapses and bursts, 3 a portal of light opens,
 *  4 the epilogue clearing (the Keeper of the Font), then the ending slides. Render: render/Finale.tsx. */
export const finale = { step: 0, t: 0, x: 0, z: 0, blasts: 0 };
const MALAKAR_LAST_WORDS = [
  'Hah... so the village guard makes the Undying bleed. Again. You always do, eventually.',
  'Did Aldric tell you? That he sent me into the Font to save her, then ordered me to give her back to the water when the light ran thin?',
  'I would not. I held her light for ten years. I held it until it was the only thing left of me.',
  'Take her home. Tell her the stars are still where I showed her. And tell her father... no. Tell him nothing.',
];
let towerFloor = 0;
export const towerState = { floor: 0 };
/** Camp room layout (storage chest pile left of the fire, training post right), set on room entry. */
export const campPos = { storage: [0, 0] as [number, number], trainer: [0, 0] as [number, number], fire: [0, 0] as [number, number] };   // read by the HUD
const FINAL_BIOME = BIOMES.length - 1;
const towerBiome = (f: number): number => (waves.on ? waveBiome(f) : daily.on ? dailyBiome() : Math.floor((f - 1) / 5) % BIOMES.length);
function towerPlan(f: number): RoomPlan {
  if (daily.on) return dailyPlan(f);   // Daily Trial: the day's seeded floor sequence
  if (waves.on) return wavePlan(f);    // Endless Waves
  if (f % 10 === 0) return { type: 'BOSS', reward: 'NONE' };
  if (f % 5 === 0) return { type: Math.random() < 0.35 ? 'DUEL' : 'MINIBOSS', reward: 'ITEM' };   // some champion floors: a dark hero duel
  if (f % 3 === 0) return { type: 'ELITE', reward: f % 2 ? 'GEMS' : 'CARD' };
  return { type: 'COMBAT', reward: f % 2 ? 'CARD' : f % 4 === 0 ? 'SHARDS' : 'GOLD' };
}   // room index of this biome's crystal cavern door (-1: none this biome, 50%)

export function resetDirector(): void {
  resetRoomEvent(); bossKeyState.has = false; clearMinions(); resetGates(); resetWanderers();
  const d = world.director;
  d.wave = 1; d.phase = 'FIGHT'; d.phaseT = 0; d.maxAlive = ROOM_MAX_ALIVE; d.aliveCount = 0; d.bossId = -1;
  const r = world.room;
  r.active = false; r.fade = 1; r.fadeTarget = 0; r.enemiesLeft = 0; r.shrineOn = false;
  for (const p of r.portals) p.active = false;
  for (const m of r.markers) m.active = false;
  r.station.kind = 'NONE';
  world.boss.active = false;
  world.enemyGrid.clear();
  unitN = 0; nextUnit = 0; bursts = 0; curBurst = 0; miniPending = false; extraBosses = []; miniCount = 1; bossPending = false; bossSpawned = false; bossDeadT = -1; fixedN = 0;
  rewardT = -1; vacuumT = 0; shrineBonus = false;
  clearMerchantStock();
}

// ------------------------------------------------------------ run control ---
/** Begins a run: biome 0, room 0 (a skirmish), fading in from black. */
export function startRunRooms(): void {
  biome = 0; index = 0; merchantBiome = -1; fountainBiome = -1; shrineBiome = -1;
  finalFight = false; endingDone = false; towerFloor = 0; towerState.floor = 0; world.run.towerFloor = 0;
  resetGates();
  world.room.fade = 1;
  if (runInfo.mode === 'TOWER') { towerFloor = 1; towerState.floor = 1; enterRoom(towerBiome(1), waves.on ? waveIndex(1) : 0, towerPlan(1)); return; }
  const sb = runInfo.startBiome; runInfo.startBiome = 0;   // (the ship to the Coral Isles: opens at that biome's camp)
  if (sb > 0) { enterRoom(sb, 0, firstPlan()); return; }
  enterRoom(0, 0, firstPlan());
}

/** Debug: jump straight to biome `b`, room `idx` of type `type` (boss rooms use debug.bossOverride if set). Run must be in progress. */
export function debugJump(b: number, idx: number, type: RoomType): void {
  merchantBiome = -1; fountainBiome = -1; shrineBiome = -1;
  world.room.fade = 1;
  if (type === 'GATEKEEPER') { finalFight = false; endingDone = false; enterRoom(b, BOSS_INDEX, hubPlan()); return; }
  enterRoom(b, idx, { type, reward: type === 'COMBAT' || type === 'ELITE' || type === 'MINIBOSS' || type === 'DUEL' ? 'CARD' : 'NONE', preboss: type === 'MINIBOSS' && idx === PREBOSS_INDEX });
}
/** Debug / QA: walk into gate `g`'s trial (as if E was pressed at it), or straight into the throne room. */
export function debugGate(g: number): void {
  world.room.fade = 1;
  if (g < 0) { finalFight = true; endingDone = false; enterRoom(biome, BOSS_INDEX, { type: 'BOSS', reward: 'NONE' }); return; }
  gateState.on = true; enterRoom(biome, BOSS_INDEX, gatePlan(g, 0));
}

/** After a boss: continue into the next biome (harder, same hero). */
export function descend(): void {
  const d = dd();
  if (d.phase !== 'BIOME_DONE') return;
  const p = world.player;
  const st = useGameStore.getState();
  p.hp = Math.min(st.stats.maxHealth, p.hp + st.stats.maxHealth * 0.3);
  if (biome === FINAL_BIOME && runInfo.mode === 'ADVENTURE') {   // (the Herald beaten outside the gates, e.g. a debug jump): on to the Gatekeeper
    if (!gateState.done[4]) { gateState.done[4] = true; gateState.keys++; }
    beginLeave(hubPlan(), biome, BOSS_INDEX); return;
  }
  beginLeave(firstPlan(), biome + 1, 0);
}
/** The big portal's label after a boss. */
export const nextBiomeLabel = (): string => (biome === FINAL_BIOME && runInfo.mode === 'ADVENTURE' && !finalFight ? 'The Gatekeeper' : `Next biome · ${biomeOf(biome + 1).name}`);
/** Adventure, last biome: the Gatekeeper's gates replace the boss key / boss door. */
const gateBiome = (): boolean => runInfo.mode === 'ADVENTURE' && biome === FINAL_BIOME;

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
  resetTricks(); resetSpecials(); resetBossFx(); resetBosses2(); resetBossMech();
}

function enterRoom(b: number, idx: number, p: RoomPlan): void {
  clearWanderer();
  if (idx === 0) bossKeyState.has = false;
  if (idx === 0 && runInfo.mode === 'ADVENTURE') crystalAt = Math.random() < 0.5 ? 1 + Math.floor(Math.random() * (REST_INDEX - 1)) : -1;   // 50%: one crystal cavern this biome
  // every biome after the first opens with a quiet camp: storage (the town warehouse) + a training post (skills)
  if (runInfo.mode === 'ADVENTURE' && idx === 0 && b > 0 && !finalFight && p.type !== 'BOSS' && !p.epilogue) p = { type: 'CAMP', reward: 'NONE' };
  biome = b; index = idx; plan = p;
  if (finalFight && p.type === 'BOSS') { finalStage = 1; finale.step = 0; }
  nextBossKind = '';
  if (!finalFight) world.boss.final = false;
  depth = runInfo.mode === 'TOWER' ? (daily.on ? dailyDepth(towerFloor) : waves.on ? waveDepth(towerFloor) : 2 + Math.round(towerFloor * 1.5)) : depthWave(b, idx) + (p.type === 'MINIBOSS' || p.type === 'ELITE' || p.type === 'DUEL' ? 1 : 0);
  const d = world.director, r = world.room;
  const st = useGameStore.getState();
  clearTransient();

  const seed = daily.on ? dailyRoomSeed(towerFloor) : (Math.random() * 4294967296) >>> 0;   // daily: same layouts for everyone
  const R = waves.on ? WAVES_ARENA_R : runInfo.mode !== 'TOWER' && isArenaRoom(p.type) ? arenaRadius(p.type) : roomRadius(p.type, seed, b, idx);   // (Endless Waves: one boss-size arena)
  buildRoom(b, p.type, R, seed, idx);
  world.room.radius = R;
  startRoomEvent(p);   // objective / twist (roomEvents.ts)

  r.active = true; r.version++; r.seed = seed; r.biome = b; r.index = idx; r.plan = p; r.radius = R;
  r.fadeTarget = 0; r.shrineOn = false;
  for (const po of r.portals) po.active = false;
  for (const m of r.markers) m.active = false;
  const [cx, cz] = stationPos(R);
  campPos.storage[0] = cx - 6; campPos.storage[1] = cz; campPos.trainer[0] = cx + 6; campPos.trainer[1] = cz; campPos.fire[0] = cx; campPos.fire[1] = cz + 1;
  const kind = p.type === 'FOUNTAIN' ? 'FOUNTAIN' : p.type === 'MERCHANT' ? 'MERCHANT' : p.type === 'TREASURE' ? 'CHEST' : p.type === 'SHRINE' ? 'ALTAR' : 'NONE';
  r.station.kind = kind; r.station.x = cx; r.station.z = cz; r.station.used = false; r.station.ready = kind === 'FOUNTAIN' || kind === 'MERCHANT' || kind === 'ALTAR';
  {   // (owner) a Treasure stage sometimes holds more chests: 15% two, 5% three, set either side of the main one
    const roll = Math.random(), extra = kind === 'CHEST' ? (roll < 0.05 ? 2 : roll < 0.2 ? 1 : 0) : 0;
    for (let i = 0; i < r.chests.length; i++) {
      const c = r.chests[i]; c.used = false; c.on = i < extra;
      if (!c.on) continue;
      const side = i === 0 ? 1 : -1, tx = cx + side * 5, tz = cz + 1.5;
      if (isSpawnable(tx, tz)) { c.x = tx; c.z = tz; } else { c.x = cx; c.z = cz + side * 5; }
    }
  }

  const pl = world.player;
  const [sx, sz] = startPos(R);
  pl.pos.set(sx, 0, sz); pl.vel.set(0, 0, 0); pl.dashT = 0; pl.facing = Math.PI;
  if (p.type === 'GATEKEEPER') enterHub(); else if (p.gate !== undefined) { gateState.on = true; gateState.cur = p.gate; }
  world.pet.pos.set(pl.pos.x + 1.2, 1, pl.pos.z + 1.2);
  {   // summons (necromancer skeletons / golem) arrive in a ring beside the hero instead of walking in from where the last room left them
    const M = world.minions; let n = 0, tot = 0;
    for (let i = 0; i < M.length; i++) if (M[i].active) tot++;
    for (let i = 0; i < M.length; i++) {
      const m = M[i]; if (!m.active) continue;
      const a = Math.PI + ((n + 0.5) / Math.max(1, tot) - 0.5) * Math.PI * 1.4, rr = 2.2 + (n % 2) * 0.9;   // a fan behind the hero
      m.x = pl.pos.x + Math.sin(a) * rr; m.z = pl.pos.z + Math.cos(a) * rr; n++;
    }
  }

  d.wave = depth; d.phase = 'FIGHT'; d.phaseT = 0; d.aliveCount = 0; d.bossId = -1; d.maxAlive = ROOM_MAX_ALIVE;
  roomT = 0; clearT = 0; rewardT = -1; vacuumT = 0; vacuumTick = 0; shrineBonus = false;
  unitN = 0; nextUnit = 0; bursts = 0; curBurst = 0; burstT = 0; miniPending = false; extraBosses = []; miniCount = 1; bossPending = false; bossSpawned = false; bossDeadT = -1; duelPending = false;
  groupIdx = 0; inGroup = 0; fixedN = 0;

  rollRoomSpawns(p.type);
  if (p.type === 'COMBAT' || p.type === 'ELITE' || p.type === 'TREASURE') {
    for (let i = 0; i < feat.nTowers; i++) { fixedKind[fixedN] = 'GOBLIN_ARCHER'; fixedX[fixedN] = feat.tx[i]; fixedZ[fixedN] = feat.tz[i]; fixedN++; }
    for (let i = 0; i < feat.nHydras; i++) { fixedKind[fixedN] = 'LAKE_HYDRA'; fixedX[fixedN] = feat.hx[i]; fixedZ[fixedN] = feat.hz[i]; fixedN++; }
  }
  if (kind === 'MERCHANT') rollMerchantStock(depth);
  else clearMerchantStock();
  r.enemiesLeft = unitN + fixedN + (miniPending ? 1 : 0) + (bossPending ? 1 : 0) + (duelPending ? 1 : 0);

  st.setWave(depth);
  const boss = p.type === 'BOSS';
  events.emit('waveStart', { wave: depth, boss, elite: p.type === 'ELITE' });
  const gname = p.type === 'GATEKEEPER' ? 'The Gatekeeper' : p.gate !== undefined ? GATES[p.gate].name : '';
  events.emit('roomEnter', { biome: b, index: idx, type: p.type, boss, name: p.epilogue ? 'A Quiet Clearing' : finalFight ? 'The Undying Throne' : runInfo.mode === 'TOWER' ? `${climbTitle()} · ${climbFloor(towerFloor)}` : gname || biomeOf(b).name });
  if (p.type === 'DUEL') st.addNotification(`A dark champion steps into the ring: ${duelCls.charAt(0) + duelCls.slice(1).toLowerCase()} against you, alone.`, '#c9a2ff', 'BOSS');
  if (p.gate !== undefined && (p.step ?? 0) === 0) st.addNotification(`${GATES[p.gate].name}: ${GATES[p.gate].sub}.`, GATES[p.gate].color, 'BOSS');
  if (p.type === 'ELITE') st.addNotification('Elite champions guard this room!', '#a855f7', 'BOSS');
  if (p.type === 'CRYSTAL') st.addNotification('A quiet crystal cavern: harvest what you can, then pick an exit.', '#7fd8ff', 'SYSTEM');
}

// ------------------------------------------------------------ the gates -----
const gp: [number, number] = [0, 0];
/** Arriving in the Gatekeeper's courtyard: first visit = his greeting, back from a trial = in front of that gate + his flame mends you. */
function enterHub(): void {
  const pl = world.player, st = useGameStore.getState();
  const back = gateState.cur;
  gateState.on = true; gateState.cur = -1;
  if (back >= 0) {
    const yaw = gatePos(back, gp);
    pl.pos.set(gp[0] * 0.78, 0, gp[1] * 0.78); pl.facing = yaw;
    const hp = st.stats.maxHealth * 0.35, mp = st.stats.maxMana * 0.35, before = pl.hp;
    pl.hp = Math.min(st.stats.maxHealth, pl.hp + hp); pl.mana = Math.min(st.stats.maxMana, pl.mana + mp);
    if (pl.hp > before) events.emit('heal', { pos: pl.pos, amount: pl.hp - before });
  } else { pl.pos.set(HUB_START[0], 0, HUB_START[1]); pl.facing = Math.PI; }
  gateState.visits++;
  const left = GATE_KEYS_NEEDED - gateState.keys;
  if (gateState.visits === 1) {
    st.addNotification(`The Gatekeeper: "${GATEKEEPER_LINES[0]}"`, '#c9a2ff', 'BOSS');
    st.addNotification(`The Gatekeeper: "${GATEKEEPER_LINES[1]}"`, '#c9a2ff', 'SYSTEM');
  } else if (left > 0) st.addNotification(`The Gatekeeper: "${left} gate${left > 1 ? 's' : ''} remain. My flame mends you."`, '#c9a2ff', 'SYSTEM');
  else st.addNotification('The Gatekeeper: "All five keys. The Dark Castle opens for you. End him."', '#ffd24a', 'BOSS');
}

/** A trial room is clear: the next trial room, or (last room) the gate's key + the way back to the Gatekeeper. */
function trialCleared(): void {
  const r = world.room, st = useGameStore.getState();
  const g = plan.gate!;
  choices.length = 0;
  if (isLastStep(plan)) {
    if (!gateState.done[g]) {
      gateState.done[g] = true; gateState.keys++;
      st.addNotification(`Gate Key ${gateState.keys}/${GATE_KEYS_NEEDED}: ${GATES[g].name} is cleared!`, '#ffd24a', 'SYSTEM');
      events.emit('floatText', { pos: world.player.pos, text: `GATE KEY ${gateState.keys}/${GATE_KEYS_NEEDED}`, color: 0xffd24a, scale: 1.25, dy: 2.8 });
      events.emit('shockwave', { pos: world.player.pos.clone(), radius: 6, color: 0xffd24a });
      for (let i = 0; i < 2; i++) spawnPickup('GEM', at(0, -r.radius * 0.1), 3 + Math.floor(depth / 10));
    }
    choices.push(hubPlan());
  } else choices.push(gatePlan(g, (plan.step ?? 0) + 1));
  const po = r.portals[0];
  for (const q of r.portals) q.active = false;
  portalSlot(0, 1, r.radius, slot);
  po.active = true; po.x = slot[0]; po.z = slot[1]; po.t = 0; po.plan = choices[0]; po.big = false;
  events.emit('portalsOpen', {});
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
  const roomy = feat.layout === 'BIG' ? 1.3 : feat.layout === 'LAKE' || feat.layout === 'RIVER' ? 1.1 : 1;   // big stages hold more monsters
  const tower = runInfo.mode === 'TOWER' ? (daily.on ? 1.5 : waves.on ? waveCrowd(towerFloor) : 2) : 1;   // Endless Tower: twice the monsters per floor (Daily Trial: x1.5)
  let points = Math.min(waveBudget(depth) * mult * roomy * tower, 160 * tower) * mods.spawn;
  let guard = 0;
  while (points > 0.9 && unitN < MAX_UNITS - elites - 2 && guard++ < 60 * tower) {
    const kind = rosterPick(def, Math.min(points, 12), 0);
    const cost = ENEMY_DEFS[kind].cost;
    let n = kind === 'SCARAB' ? 7 + Math.floor(Math.random() * 5) : isSwarm(kind) ? 4 + Math.floor(Math.random() * 3) : Math.random() < 0.65 ? Math.max(1, Math.round((3 + Math.random() * 3) / Math.sqrt(cost))) : 1;
    if (plan.type === 'MINIBOSS' || plan.type === 'BOSS') n = Math.min(n, 4);   // escorts: no 7-11 scarab swarms beside a champion
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
    case 'COMBAT': rollPack(0.62, waves.on ? waveElites(towerFloor) : 0, depth < 3 ? 2 : 3); break;
    case 'ELITE': rollPack(0.3, eliteN(2, 14), 2); break;
    case 'TREASURE': rollPack(0.4, 0, 2); break;
    case 'MINIBOSS': {
      // the champion's escort: a smaller pack (was 0.3 of a skirmish) and at most MINI_MAX_ALIVE at once, so the
      // fight stays about the champion (balance pass: the desert pre-boss had up to 36 adds alive beside it)
      rollPack(0.22, waves.on ? waveMiniElites(towerFloor) : 0, 2); dd().maxAlive = MINI_MAX_ALIVE;
      miniPending = true; miniCount = waves.on ? waveMinis(towerFloor) : 1;
      prebossKing = false; prebossRoom = !!plan.preboss;
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
    case 'BOSS': {
      bossPending = true; dd().maxAlive = MINI_MAX_ALIVE;
      if (waves.on) {   // Endless Waves: deeper waves stack bosses, mini-bosses and elites together (owner)
        const main = biomeBoss(biome);
        const pool = [...new Set(BIOMES.map((x) => x.boss))].filter((k) => k !== main && k !== 'BOSS_LICH');
        const n = waveExtraBosses(towerFloor);
        for (let i = 0; i < n && pool.length; i++) extraBosses.push(pool.splice((towerFloor * 3 + i * 5) % pool.length, 1)[0]);
        const m = waveBossMinis(towerFloor);
        if (m > 0) {
          const def = biomeOf(biome), mm = MINI_BOSSES[def.minis[towerFloor % def.minis.length]];
          miniPending = true; miniCount = m; miniIsBoss = false; miniKind = mm.kind; miniName = mm.name; miniTitle = mm.title; prebossKing = false; prebossRoom = false;
        }
        if (towerFloor >= 10) rollPack(0.35, waveMiniElites(towerFloor), 2);
      }
      break;
    }
    case 'DUEL': {   // a dark hero alone: the Gate of Shadows is always your own class, other duels half the time
      const own = useGameStore.getState().hero as HeroClass;
      duelCls = plan.gate !== undefined || Math.random() < 0.5 ? own : DARK_CLASSES[Math.floor(Math.random() * DARK_CLASSES.length)];
      duelPending = true;
      break;
    }
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
  if (tag === 3) { const e = spawnDarkHero(duelCls, x, z); if (e && !waves.on) { e.maxHp = Math.round(e.maxHp * CHAMPION_HP); e.hp = e.maxHp; } return; }   // dark hero duels are champions too
  if (tag === 4) { spawnEnemy(kind, tmp); events.emit('shake', { amount: 0.4 }); return; }   // an extra Endless Waves boss
  if (tag === 1) {
    const e = spawnMiniBoss(kind, tmp, miniName, miniTitle);
    if (e && prebossKing) {   // the Slime King: half a Golem's hp at this depth, huge and slow, bursts into slimes when it pops
      // half of the Golem as it spawns in its own boss room (depth 15 = wave 10*(biome+1), boss hp rule of spawnEnemy)
      const m = runMods(useGameStore.getState().difficulty);
      e.maxHp = Math.round(ENEMY_DEFS.BOSS_TREANT.hp * waveHpMult(10 * (biome + 1)) * m.hp * 0.25 * m.bossHp * 0.5 * 1.5 * 1.5); e.hp = e.maxHp;   // half of the (halved) Elderroot, then +50% twice (owner)
      e.scale *= 1.6; e.radius *= 1.5; e.contactDamage *= 1.5; e.speed *= 0.85; e.elite = false;
      world.boss.hp = e.hp; world.boss.maxHp = e.maxHp;
      setSlimeKing(e.id); initSpecial(e);   // (owner: Belly Flop / Acid Flood / Acid Rain)
    }
    if (e && prebossRoom) { e.maxHp = Math.round(e.maxHp * 0.75); e.hp = e.maxHp; world.boss.hp = e.hp; world.boss.maxHp = e.maxHp; }   // depth-10 pre-boss: -25% hp
    else if (e && !waves.on && !miniIsBoss) { e.maxHp = Math.round(e.maxHp * CHAMPION_HP); e.hp = e.maxHp; world.boss.hp = e.hp; world.boss.maxHp = e.maxHp; }   // champion rooms (owner: -30%)
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
  const names = finalFight ? { name: 'Malakar the Undying', title: 'Lord of the Void' } : bossNameIn(kind as BossKind, biome);
  if (kind === 'BOSS_TREANT' && runInfo.mode === 'ADVENTURE' && !finalFight) { e.maxHp = Math.round(e.maxHp * 0.85); e.hp = e.maxHp; }   // the first guardian (Elderroot): -15% hp (balance pass 2: squishy ranged classes won ~15% at Lv 8-10)
  if (finalFight) { e.maxHp = Math.round(e.maxHp * 3.2); e.hp = e.maxHp; e.radius *= 1.25; e.scale *= 1.35; e.contactDamage *= 1.3; e.projectileDamage *= 1.3; }   // the true villain
  d.bossId = e.id;
  const hud = world.boss;
  hud.active = true; hud.name = names.name; hud.title = names.title;
  hud.hp = e.hp; hud.maxHp = e.maxHp; hud.phase = 0;
  hud.final = finalFight && kind === 'BOSS_LICH'; hud.stage = hud.final ? finalStage : 1; hud.shieldCd = 14;   // Malakar: two fights, periodic shield (bosses.ts)
  if (hud.final && finalStage === 2) {   // risen again: bigger, tougher, angrier
    e.maxHp = Math.round(e.maxHp * 1.25); e.hp = e.maxHp; e.scale *= 1.15; e.radius *= 1.1; e.projectileDamage *= 1.2; e.contactDamage *= 1.2;
    hud.hp = e.hp; hud.maxHp = e.maxHp; hud.title = 'Unbound';
  }
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
  if (fixedN > 0) {   // archers climb their towers, hydras surface (telegraphed like everything else)
    for (let i = 0; i < fixedN; i++) placeMarker(fixedKind[i], fixedX[i], fixedZ[i], false, 1.1, 0);
    fixedN = 0;
  }

  if (bossPending && roomT >= 1.2) {
    bossPending = false;
    const kind = finalFight ? 'BOSS_LICH' : nextBossKind || debug.bossOverride || biomeBoss(biome);
    placeMarker(kind, 0, -R.radius * 0.35, false, 1.8, 2);
    for (let i = 0; i < extraBosses.length; i++) {   // Endless Waves: more bosses around the arena (no boss bar of their own until the first falls)
      const a = Math.PI * (0.5 + (i + 1) / (extraBosses.length + 1));
      placeMarker(extraBosses[i], Math.cos(a) * R.radius * 0.45, -Math.sin(a) * R.radius * 0.45, false, 1.8, 4);
    }
    bossSpawned = true;
  }
  if (duelPending && roomT >= 1.0) {   // the dark hero rises in the middle of the ring
    duelPending = false;
    const [mx, mz] = stationPos(R.radius);
    placeMarker('DARK_HERO', mx, mz - 2, false, 1.6, 3);
  }
  if (miniPending && roomT >= 1.0) {
    {   // spawns in the open arena kept clear by roomgen (stationPos of a MINIBOSS room, radius 12)
      miniPending = false;
      const [mx, mz] = stationPos(R.radius);
      placeMarker(miniKind, mx, mz, false, 1.5, miniIsBoss ? 2 : 1);
      for (let i = 1; i < miniCount; i++) {   // Endless Waves: several mini-bosses at once
        const a = (i / miniCount) * Math.PI * 2, rr = Math.min(9, R.radius * 0.4);
        const x = mx + Math.cos(a) * rr, z = mz + Math.sin(a) * rr;
        placeMarker(miniKind, isSpawnable(x, z) ? x : mx, isSpawnable(x, z) ? z : mz, false, 1.5, 1);
      }
      if (miniIsBoss) bossSpawned = true;
    }
  }
  if (unitN === 0) return;

  const pending = activeMarkers();
  if (nextUnit < burstEnd[curBurst]) {
    let cap = d.maxAlive - d.aliveCount - pending;   // (champion / boss rooms hold fewer adds at once: MINI_MAX_ALIVE)
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
  const sx = world.room.station.x, cz = world.room.station.z;   // the station spot: always kept clear (never in a lake / river)
  switch (kind) {
    case 'CARD': st.openWaveReward(Math.random() < (plan.type === 'COMBAT' ? 0.12 : 0.4)); break;
    case 'GOLD': {
      const total = Math.round((70 + depth * 20) * (plan.type === 'COMBAT' ? 1 : 1.4));
      for (let i = 0; i < 6; i++) spawnPickup('GOLD', at(sx, cz), Math.round(total / 6));
      break;
    }
    case 'SHARDS': {   // (owner) the crystal altar: Aether Crystals first, sometimes a shard on top
      st.addCrystals(2 + Math.floor(depth / 8) + biome, { x: sx, z: cz });
      if (Math.random() < 0.3) spawnPickup('SHARD', at(sx, cz), shardRarity(depth + 6));
      break;
    }
    case 'ITEM': {   // (owner) gear only; deeper biomes push the odds toward purple and up
      const it = st.rollItemDrop(rarityForDepth(depth, bonus + 0.12 + 0.12 * biome, world.run.bossKills));
      if (it) spawnPickup('ITEM', at(sx, cz), 0, it);
      break;
    }
    case 'HEAL': {
      const v = Math.round(st.stats.maxHealth * 0.2);
      for (let i = 0; i < 3; i++) spawnPickup('HEALTH', at(sx, cz), v);
      break;
    }
    case 'GEMS': {
      const n = 3 + Math.floor(depth / 5);
      for (let i = 0; i < 3; i++) spawnPickup('GEM', at(sx, cz), Math.ceil(n / 3));
      break;
    }
    default: break;
  }
}

/** (owner) Treasure chest: 1-2 different picks from a wide pool - a gold hoard, gems, a valuable trinket, a shard,
 *  potions, a reforge item, an Upgrade Core (Tier II deeper in), Aether Crystals, or now and then a piece of gear. */
const CHEST_POOL: readonly (readonly [string, number])[] = [['gold', 22], ['gems', 14], ['trinket', 14], ['shard', 12], ['potions', 12], ['reforge', 9], ['core', 9], ['crystals', 8]];
function chestLoot(x: number, z: number): void {
  const st = useGameStore.getState();
  const n = Math.random() < 0.4 ? 2 : 1, used = new Set<string>();
  const give = (it: import('../../types').Item | undefined) => { if (it) spawnPickup('ITEM', at(x, z), 0, it); };
  for (let k = 0; k < n; k++) {
    let tot = 0; for (const [id, w] of CHEST_POOL) if (!used.has(id)) tot += w;
    let r = Math.random() * tot, pick = 'gold';
    for (const [id, w] of CHEST_POOL) { if (used.has(id)) continue; r -= w; if (r <= 0) { pick = id; break; } }
    used.add(pick);
    switch (pick) {
      case 'gold': for (let i = 0; i < 6; i++) spawnPickup('GOLD', at(x, z), Math.round(50 + depth * 14)); break;
      case 'gems': for (let i = 0; i < 3; i++) spawnPickup('GEM', at(x, z), 2 + Math.floor(depth / 6)); break;
      case 'trinket': {   // a valuable sell-only trinket (Rare+, Epic+ deeper)
        const min = depth >= 30 ? 'EPIC' : 'RARE', order = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
        const pool = Object.values(LOOT_BY_ID).filter((l) => order.indexOf(l.rarity) >= order.indexOf(min) && order.indexOf(l.rarity) <= order.indexOf(min) + 1);
        if (pool.length) give(lootItem(pool[Math.floor(Math.random() * pool.length)], 1));
        break;
      }
      case 'shard': spawnPickup('SHARD', at(x, z), shardRarity(depth + 4)); break;
      case 'potions': give(makeItemById(Math.random() < 0.5 ? (depth >= 25 ? 'potion_hp_big' : 'potion_hp') : (depth >= 25 ? 'potion_mana_big' : 'potion_mana'), 2)[0]); break;
      case 'reforge': give(makeItemById(['reforge_stone', 'temper_oil', 'augment_rune', 'erase_scroll'][Math.floor(Math.random() * 4)], 1)[0]); break;
      case 'core': give(makeItemById(biome >= 3 && Math.random() < 0.35 ? 'upgrade_core_2' : 'upgrade_core', 1)[0]); break;
      case 'crystals': st.addCrystals(2 + Math.floor(depth / 10), { x, z }); break;
    }
  }
  if (Math.random() < 0.15) give(st.rollItemDrop(rarityForDepth(depth, 0.2, world.run.bossKills)) ?? undefined);   // now and then a piece of gear
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
  spawnPickup('SHARD', at(0, -R * 0.1), shardRarity(depth + 12));   // one shard (owner)
  st.addCrystals(4 + biome * 2, { x: world.player.pos.x, z: world.player.pos.z });   // boss drop: Aether Crystals (the Crystal Altar's currency)
  if (Math.random() < 0.5) { const tool = makeItemById(['reforge_stone', 'temper_oil', 'erase_scroll', 'augment_rune'][Math.floor(Math.random() * 4)], 1)[0]; if (tool) spawnPickup('ITEM', at(0, -R * 0.1), 0, tool); }   // a reforging tool
  for (let i = 0; i < 8; i++) spawnPickup('GOLD', at(0, -R * 0.1), Math.round(40 + depth * 12));
  st.openWaveReward(true);
}

// ------------------------------------------------------------ clearing ------
function openPortals(): void {
  const r = world.room;
  if (runInfo.mode === 'TOWER') {   // one way up
    const po = r.portals[0];
    for (const q of r.portals) q.active = false;
    if (waves.on || (daily.on && towerFloor >= DAILY_FLOORS)) return;   // Endless Waves: no exits (the next wave comes to you)   // the Daily Trial's last floor: no way up (dailyRun ends the run)
    portalSlot(0, 1, r.radius, slot);
    choices.length = 0; choices.push(towerPlan(towerFloor + 1));
    po.active = true; po.x = slot[0]; po.z = slot[1]; po.t = 0; po.plan = choices[0]; po.big = false;
    events.emit('portalsOpen', {});
    return;
  }
  const n = nextChoices(biome, index, choices, merchantBiome !== biome, fountainBiome !== biome, shrineBiome !== biome, index + 1 === crystalAt, bossKeyState.has && !finalFight);
  if (gateBiome()) for (let i = 0; i < n; i++) if (choices[i].type === 'BOSS') choices[i] = hubPlan();   // the Void ends at the Gatekeeper
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

/** Malakar's finale (after his last words): his essence collapses and bursts, then a portal of light opens. */
function tickFinale(dt: number): void {
  finale.t += dt;
  if (finale.step === 1 && !dialogueOpen() && finale.t > 1) { finale.step = 2; finale.t = 0; }   // (closed without the button)
  if (finale.step === 2) {
    // three bursts at 1.6 / 2.1 / 2.6 s, the last one the biggest
    const due = finale.t >= 2.6 ? 3 : finale.t >= 2.1 ? 2 : finale.t >= 1.6 ? 1 : 0;
    while (finale.blasts < due) {
      finale.blasts++;
      const big = finale.blasts === 3;
      events.emit('explosion', { pos: at(finale.x, finale.z).clone(), radius: big ? 9 : 4, color: big ? 0xe9d5ff : 0x7c3aed });
      events.emit('shockwave', { pos: at(finale.x, finale.z).clone(), radius: big ? 34 : 12, color: big ? 0xffffff : 0xa855f7 });
      events.emit('shake', { amount: big ? 1 : 0.4 });
    }
    if (finale.t >= 3.6) {
      finale.step = 3; finale.t = 0;
      const r = world.room, po = r.portals[0];
      for (const q2 of r.portals) q2.active = false;
      po.active = true; po.big = true; po.t = 0; po.x = finale.x; po.z = finale.z; po.plan = { type: 'CAMP', reward: 'NONE', epilogue: true };
      events.emit('portalsOpen', {});
      useGameStore.getState().addNotification('Where Malakar stood, a door of pure light opens.', '#fff3c4', 'SYSTEM');
    }
  }
}

function onCleared(): void {
  const d = dd(), st = useGameStore.getState();
  world.boss.active = false;
  if (plan.epilogue) {   // the quiet clearing: no portals or rewards, only the Keeper of the Font waiting
    d.phase = 'CLEARED'; d.phaseT = 0;
    const [cx, cz] = stationPos(world.room.radius);
    placeKeeper(cx, cz);
    st.addNotification('Birdsong. Warm light. Someone is waiting for you in the clearing.', '#fff3c4', 'SYSTEM');
    return;
  }
  d.phase = 'CLEARED'; d.phaseT = 0;
  phaseClock = 0;
  vacuumT = VACUUM_AFTER; vacuumTick = 0;
  roomEventCleared();
  if (plan.type === 'GATEKEEPER') return;   // the courtyard: nothing to clear, the gates are entered with E
  // the boss key: rooms from the champion on may hold it (more often the deeper you go; chests are the best bet)
  // (owner: disabled - the biome boss is always at depth 15, the merchant always at depth 14)
  if (BOSS_KEY_DROPS && runInfo.mode === 'ADVENTURE' && !bossKeyState.has && !finalFight && !gateBiome() && index >= PREBOSS_INDEX && index < REST_INDEX && plan.type !== 'BOSS') {
    const ch = 0.5 * (plan.type === 'TREASURE' ? 0.6 : plan.type === 'MINIBOSS' ? 0.25 : plan.type === 'DUEL' ? 0.35 : 0.2 + 0.08 * (index - PREBOSS_INDEX));   // halved: a boss before depth 15 is rarer
    if (Math.random() < ch) {
      bossKeyState.has = true;
      st.addNotification('You found the Boss Key! A boss door will open.', '#ffd24a', 'SYSTEM');
      events.emit('floatText', { pos: world.player.pos, text: 'BOSS KEY!', color: 0xffd24a, scale: 1.2, dy: 2.6 });
    }
  }
  events.emit('waveClear', { wave: depth, fast: roomT < 40 });
  maybeWanderer(biome, index, plan.type, gateBiome() || finalFight || plan.gate !== undefined);   // a wanderer may be resting here
  if (runInfo.mode === 'TOWER') towerCleared();
  const t = plan.type;
  if (t === 'TREASURE') world.room.station.ready = true;
  // reward for this room
  if (world.room.shrineOn) { rewardKind = 'CARD'; rewardBonus = 0.3; } else { rewardKind = plan.reward; rewardBonus = t === 'ELITE' ? 0.1 : t === 'MINIBOSS' ? 0.15 : t === 'DUEL' ? 0.25 : 0; }
  rewardT = rewardKind === 'NONE' ? -1 : REWARD_DELAY;
  if (world.room.shrineOn) {
    // challenge bonus on top of the card
    const it = st.rollItemDrop(rarityForDepth(depth, 0.3, world.run.bossKills));
    if (it) spawnPickup('ITEM', at(world.room.station.x, world.room.station.z), 0, it);
    for (let i = 0; i < 3; i++) spawnPickup('GEM', at(world.room.station.x, world.room.station.z), 2 + Math.floor(depth / 6));
    shrineBonus = false;
    showPortals();
  } else if (plan.gate !== undefined) trialCleared();
  else openPortals();
}

/** Endless Waves: when the boss with the bar falls while another boss / mini-boss of the wave lives, the bar moves to it. */
function handOffBoss(): boolean {
  for (const e of world.enemies) {
    if (!e.active || e.state === 'DYING' || !(e.boss || e.mini)) continue;
    const d = dd(), hud = world.boss;
    d.bossId = e.id;
    const nm = e.mini ? { name: miniName, title: miniTitle } : bossNameIn(e.kind as BossKind, biome);
    hud.active = true; hud.name = nm.name; hud.title = nm.title; hud.hp = e.hp; hud.maxHp = e.maxHp; hud.phase = 0;
    return true;
  }
  return false;
}
function bossDefeated(): boolean {
  const d = dd();
  if (d.bossId < 0) return !bossPending && bossSpawned; // spawn failed
  const b = world.enemies[d.bossId];
  return !b.active || b.state === 'DYING' || !(b.boss || b.mini);
}

function tickFight(dt: number): void {
  const d = dd(), r = world.room;
  roomT += dt;
  tickSpawns(dt);
  const markers = activeMarkers();
  r.enemiesLeft = d.aliveCount + markers + (unitN - nextUnit) + fixedN + (miniPending ? 1 : 0) + (bossPending ? 1 : 0) + (duelPending ? 1 : 0);

  if (plan.type === 'BOSS') {
    if (waves.on && bossSpawned && bossDefeated() && handOffBoss()) return;   // another boss of the wave still stands
    if (bossSpawned && bossDefeated() && !(waves.on && (miniPending || markers > 0))) {
      bossDeadT = bossDeadT < 0 ? 0 : bossDeadT + dt;
      if (bossDeadT >= BOSS_GRACE) onBossCleared();
    }
    return;
  }
  const idle = nextUnit >= unitN && fixedN === 0 && !miniPending && !duelPending && markers === 0 && d.aliveCount === 0;
  if (r.shrineOn) { if (roomT > 1.2 && idle && unitN > 0) onCleared(); return; }
  if (roomT > (unitN === 0 && !miniPending && fixedN === 0 && plan.type !== 'DUEL' ? 0.6 : 1.2) && idle) onCleared();
}

function towerCleared(): void {
  if (daily.on) { dailyFloorCleared(towerFloor); return; }   // daily: no tower records / milestones
  if (waves.on) { wavesCleared(); return; }
  const st = useGameStore.getState();
  world.run.towerFloor = towerFloor;
  const best = st.recordTowerFloor(towerFloor);
  events.emit('towerFloor', { floor: towerFloor, best });
  if (towerFloor % 5 === 0) for (let i = 0; i < 3; i++) spawnPickup('GEM', at(0, 0), 2 + Math.floor(towerFloor / 5));   // milestone gems
  if (towerFloor % 10 === 0 && best) st.addNotification(`Floor ${towerFloor} milestone reached! Claim its reward at the Endless Tower.`, '#ffd24a', 'BOSS');
}


// ------------------------------------------------------------ endless waves --
/** A wave is down: best wave + milestone (store), then a short breather before the next one. */
function wavesCleared(): void {
  const st = useGameStore.getState();
  const best = st.recordWave(towerFloor);
  waves.lastWave = towerFloor; if (best) waves.lastBest = towerFloor;
  waves.breakT = WAVE_BREAK;
  events.emit('floatText', { pos: world.player.pos, text: `WAVE ${towerFloor} CLEARED`, color: 0xffd24a, scale: 1.1, dy: 2.8 });
}
/** The next wave in the same arena (no rebuild: loot on the floor and the hero stay where they are). */
/** QA: jump an Endless Waves run to wave n (headless tests). */
export function debugJumpWave(n: number): void { if (!waves.on) return; for (const e of world.enemies) if (e.active) { e.active = false; } world.director.aliveCount = 0; towerFloor = n - 1; nextWave(); }
function nextWave(): void {
  waves.breakT = -1;
  towerFloor++; towerState.floor = towerFloor;
  const w = towerFloor, d = dd(), r = world.room, st = useGameStore.getState();
  biome = waveBiome(w); index = waveIndex(w); plan = wavePlan(w); depth = waveDepth(w);
  r.plan = plan;
  world.boss.active = false; nextBossKind = '';
  d.wave = depth; d.phase = 'FIGHT'; d.phaseT = 0; d.bossId = -1; d.maxAlive = ROOM_MAX_ALIVE;
  roomT = 0; clearT = 0; rewardT = -1; vacuumT = 0; vacuumTick = 0; shrineBonus = false;
  unitN = 0; nextUnit = 0; bursts = 0; curBurst = 0; burstT = 0; miniPending = false; extraBosses = []; miniCount = 1; bossPending = false; bossSpawned = false; bossDeadT = -1; duelPending = false;
  groupIdx = 0; inGroup = 0; fixedN = 0;
  for (const po of r.portals) po.active = false;
  rollRoomSpawns(plan.type);
  r.enemiesLeft = unitN + (miniPending ? 1 : 0) + (bossPending ? 1 : 0);
  st.setWave(depth);
  const boss = plan.type === 'BOSS';
  events.emit('waveStart', { wave: depth, boss, elite: plan.type === 'ELITE' });
  events.emit('roomEnter', { biome: r.biome, index: r.index, type: plan.type, boss, name: `${climbTitle()} · ${climbFloor(w)}` });
}

function onBossCleared(): void {
  const d = dd();
  world.boss.active = false;
  if (runInfo.mode === 'TOWER') {   // a tower boss floor: rewards, then the way up
    for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
    bossRewards(); onCleared(); return;
  }
  if (plan.gate !== undefined) {   // the Gate of the Herald: rewards, then the way back to the Gatekeeper
    for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
    events.emit('biomeClear', { biome });
    useGameStore.getState().addNotification('The Void Herald falls!', '#fbbf24', 'BOSS');
    bossRewards(); onCleared(); return;
  }
  if (finalFight) {
    const body = d.bossId >= 0 ? world.enemies[d.bossId] : null;
    const bx = body ? body.pos.x : 0, bz = body ? body.pos.z : 0;
    for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;
    if (finalStage === 1) {   // he rises again: the second fight
      finalStage = 2;
      bossSpawned = false; bossDeadT = -1; bossPending = true; roomT = -2.6;   // (the new marker appears ~4 s later)
      useGameStore.getState().addNotification('"You think death binds me? I AM the Void!" Malakar rises again!', '#c084fc', 'BOSS');
      events.emit('floatText', { pos: at(bx, bz).clone(), text: 'MALAKAR RISES AGAIN', color: 0xc084fc, scale: 1.4, dy: 3 });
      events.emit('shockwave', { pos: at(bx, bz).clone(), radius: 18, color: 0x7c3aed });
      events.emit('shake', { amount: 0.8 });
      return;
    }
    // Malakar falls for good: his last words, then the finale (tickFinale). Very rarely he leaves his Soul Ember (Mythic weapons)
    if (Math.random() < SOUL_EMBER_CHANCE) {
      spawnPickup('ITEM', at(bx, bz).clone(), 0, lootItem(LOOT_BY_ID[SOUL_EMBER]));
      useGameStore.getState().addNotification("Malakar's Soul Ember! (Mythic weapon material)", '#c084fc', 'ITEM');
    }
    d.phase = 'BIOME_DONE'; d.phaseT = 0; endingDone = true;
    vacuumT = VACUUM_AFTER; vacuumTick = 0;
    world.run.bossKills = Math.max(world.run.bossKills, 1);
    finale.step = 1; finale.t = 0; finale.x = bx; finale.z = bz; finale.blasts = 0;
    openCustomDialogue('Malakar the Undying', 'his last words', '#c084fc', MALAKAR_LAST_WORDS, { label: 'Let him fade', accept: () => { if (finale.step === 1) { finale.step = 2; finale.t = 0; } } });
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
function pushNearby(verb: string, label: string, node: number, d2: number, color = ''): void {
  let i = nearbyN < MAX_ROOM_NEARBY ? nearbyN : MAX_ROOM_NEARBY;
  if (i === MAX_ROOM_NEARBY) { if (d2 >= roomNearby[MAX_ROOM_NEARBY - 1].d2) return; i = MAX_ROOM_NEARBY - 1; } else nearbyN++;
  while (i > 0 && roomNearby[i - 1].d2 > d2) { const a = roomNearby[i], b = roomNearby[i - 1]; a.verb = b.verb; a.label = b.label; a.node = b.node; a.d2 = b.d2; a.color = b.color; i--; }
  const t = roomNearby[i]; t.key = 'E'; t.verb = verb; t.label = label; t.node = node; t.d2 = d2; t.color = color;
}
function scanNearby(): void {
  nearbyN = 0;
  const d = dd(), r = world.room, p = world.player.pos;
  // no interacting while monsters are still alive in the room (combat); harvesting works mid-fight (owner)
  let fighting = false;
  for (let i = 0; i < world.enemies.length && !fighting; i++) { const e = world.enemies[i]; if (e.active && e.state !== 'DYING') fighting = true; }
  if (r.fade < 0.6 && d.phase !== 'LEAVING' && !fighting) {
    const q = (x: number, z: number) => (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d.phase === 'CLEARED') {
      for (let i = 0; i < r.portals.length; i++) {
        const po = r.portals[i];
        if (!po.active || po.t < 0.5) continue;
        const dist = q(po.x, po.z);
        if (dist < 36) { const l = portalLabel(po.plan, biome); pushNearby('Enter', l.sub ? `${l.title} · ${l.sub}` : l.title, i, dist); }
      }
    }
    if (d.phase === 'BIOME_DONE') {   // the big portal to the next biome
      const po = r.portals[0];
      if (po.active && po.big && po.t >= PORTAL_ARM) { const dist = q(po.x, po.z); if (dist < 49) pushNearby('Enter', finale.step === 3 ? 'The light beyond' : nextBiomeLabel(), 20, dist); }
    }
    if (r.plan.type === 'GATEKEEPER' && d.phase === 'CLEARED') {
      for (let i = 0; i < GATES.length; i++) {
        gatePos(i, gp);
        const dg = q(gp[0], gp[1]);
        if (dg < 30) pushNearby(gateState.done[i] ? 'Cleared' : 'Enter', GATES[i].name + (gateState.done[i] ? ' · key taken' : ` · ${GATES[i].sub}`), 50 + i, dg);
      }
      const dc = q(CASTLE_DOOR[0], CASTLE_DOOR[1]);
      if (dc < 42) pushNearby(gateState.keys >= GATE_KEYS_NEEDED ? 'Enter' : 'Sealed', gateState.keys >= GATE_KEYS_NEEDED ? 'The Dark Castle' : `Dark Castle · Gate Keys ${gateState.keys}/${GATE_KEYS_NEEDED}`, 55, dc);
      const dk = q(KEEPER_POS[0], KEEPER_POS[1]);
      if (dk < 30) pushNearby('Talk', 'The Gatekeeper', 56, dk);
    }
    if (wander.on) { const dw = q(wander.x, wander.z); if (dw < 16) pushNearby('Talk', WANDERERS[wander.def].name, 60, dw); }
    if (r.station.kind === 'CHEST' && r.station.ready) for (let i = 0; i < r.chests.length; i++) { const c = r.chests[i]; if (c.on && !c.used) { const dc = q(c.x, c.z); if (dc < 20) pushNearby('Open', 'Treasure Chest', 12 + i, dc); } }
    if (world.roomEvt.obj === 'RESCUE' && world.roomEvt.state === 4) { const dq = q(world.roomEvt.x, world.roomEvt.z); if (dq < 16) pushNearby('Free', 'Captive', 40, dq); }
    if (r.plan.type === 'CAMP' && !r.plan.epilogue) {
      const ds = q(campPos.storage[0], campPos.storage[1]); if (ds < 12) pushNearby('Open', 'Camp Storage', 30, ds);
      const dt2 = q(campPos.trainer[0], campPos.trainer[1]); if (dt2 < 12) pushNearby('Train', 'Training Post', 31, dt2);
    }
    const s = r.station;
    if (s.kind !== 'NONE' && !(s.used && s.kind !== 'MERCHANT')) {
      const dist = q(s.x, s.z);
      if (dist < (s.kind === 'ALTAR' ? 45 : 20)) {   // (the big shrine: a wider reach)
        if (s.kind === 'FOUNTAIN') pushNearby('Drink', 'Healing Fountain', 10, dist);
        else if (s.kind === 'MERCHANT') pushNearby('Trade', 'Travelling Merchant', 10, dist);
        else if (s.kind === 'CHEST' && s.ready) pushNearby('Open', 'Treasure Chest', 10, dist);
        else if (s.kind === 'ALTAR' && d.phase === 'CLEARED') pushNearby('Begin', 'Challenge Shrine', 10, dist);
      }
    }
  }
  // loot on the ground (items are picked up by hand: E / tap) and harvest nodes (hold E), also mid-fight
  if (r.fade < 0.6 && d.phase !== 'LEAVING') {
    const cr = world.crates;
    for (let i = 0; i < cr.length; i++) {
      const c = cr[i];
      if (!c.active || !isHarvestNode(c.kind)) continue;
      const dist = (c.pos.x - p.x) ** 2 + (c.pos.z - p.z) ** 2;
      if (dist < 9) pushNearby('Harvest', HARVEST_NAME[c.kind] ?? 'Node', 100 + i, dist);
    }
    const pk = world.pickups;
    for (let i = 0; i < pk.length; i++) {
      const o = pk[i]; if (!o.active || o.kind !== 'ITEM' || !o.item || o.magnet || o.t < 0.35) continue;
      const dd2 = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
      if (dd2 < LOOT_R * LOOT_R) pushNearby('Loot', o.item.name, 1000 + i, dd2 - 0.5, RARITY_LABEL_COLOR[o.item.rarity] ?? '');   // slightly ahead of other pills at the same distance
    }
  }
  for (let i = 0; i < MAX_ROOM_NEARBY; i++) roomNearby[i].active = i < nearbyN;
}
const LOOT_R = 2.4;   // the E-loot prompt shows from the same distance auto loot grabs items (pickups ITEM_GRAB_R2)

/** Same action as pressing E next to the thing (also used by the touch interact pills). */
export function interactRoom(it: Interactable): void {
  const d = dd(), r = world.room, st = useGameStore.getState();
  if (st.status !== GameStatus.PLAYING) return;
  if (it.node >= 0 && it.node < 3) {
    const po = r.portals[it.node];
    if (po.active && d.phase === 'CLEARED' && po.t >= PORTAL_ARM && r.fade < 0.3 && world.player.alive) {
      if (runInfo.mode === 'TOWER') { towerFloor++; towerState.floor = towerFloor; beginLeave(po.plan, towerBiome(towerFloor), (towerFloor - 1) % ROOMS_PER_BIOME); }
      else if (po.plan.gate !== undefined || po.plan.type === 'GATEKEEPER') beginLeave(po.plan, biome, BOSS_INDEX);   // trials and the courtyard keep the boss depth
      else beginLeave(po.plan, biome, index + 1);
    }
    return;
  }
  if (it.node === 12 || it.node === 13) {   // an extra treasure chest
    const c = r.chests[it.node - 12];
    if (c && c.on && !c.used && r.station.ready && world.player.alive) { c.used = true; chestLoot(c.x, c.z); events.emit('shake', { amount: 0.25 }); vacuumT = 1.2; }
    return;
  }
  if (it.node === 40) { freeCaptive(); return; }   // rescue objective
  if (it.node === 60) { talkWanderer(); return; }   // a wanderer resting in the room
  if (it.node >= 50 && it.node <= 56) { interactHub(it.node); return; }   // the Gatekeeper's courtyard
  if (it.node === 30) { st.openSpecificShop('WAREHOUSE'); return; }   // camp storage = the town warehouse
  if (it.node === 31) { st.openSpecificShop('SKILLS'); return; }      // camp training post
  if (it.node >= 1000) { lootPickup(it.node - 1000); return; }   // loot an item on the ground
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
    if (po.active && po.big && d.phase === 'BIOME_DONE') {
      po.active = false; po.big = false;
      if (finale.step === 3) { finale.step = 4; finalFight = false; beginLeave({ type: 'CAMP', reward: 'NONE', epilogue: true }, 0, 1); }
      else descend();
    }
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
    chestLoot(s.x, s.z);   // (owner) a surprise: 1-2 picks from a wide pool
    events.emit('shake', { amount: 0.25 });
    vacuumT = 1.2; // pick it all up soon
  } else if (s.kind === 'ALTAR' && !s.used && d.phase === 'CLEARED') {
    startShrineChallenge();
  }
}

let keeperLine = 0;
function interactHub(node: number): void {
  const d = dd(), st = useGameStore.getState();
  if (d.phase !== 'CLEARED' || world.room.plan.type !== 'GATEKEEPER' || !world.player.alive) return;
  if (node <= 54) {
    const g = node - 50;
    if (gateState.done[g]) { st.addNotification(`${GATES[g].name} is already cleared.`, '#9aa0b4', 'SYSTEM'); return; }
    beginLeave(gatePlan(g, 0), biome, BOSS_INDEX);
  } else if (node === 55) {
    if (gateState.keys >= GATE_KEYS_NEEDED) { finalFight = true; beginLeave({ type: 'BOSS', reward: 'NONE' }, biome, BOSS_INDEX); }   // the Undying Throne
    else {
      st.addNotification(`The castle door is sealed: ${GATE_KEYS_NEEDED - gateState.keys} more Gate Key${GATE_KEYS_NEEDED - gateState.keys > 1 ? 's' : ''} needed.`, '#c9a2ff', 'SYSTEM');
      events.emit('floatText', { pos: world.player.pos, text: `SEALED ${gateState.keys}/${GATE_KEYS_NEEDED}`, color: 0xc9a2ff, scale: 1, dy: 2.4 });
    }
  } else {
    const line = gateState.keys >= GATE_KEYS_NEEDED ? 'The keys are whole. Go, guardian: the castle is open.' : GATEKEEPER_LINES[keeperLine++ % GATEKEEPER_LINES.length];
    st.addNotification(`The Gatekeeper: "${line}"`, '#c9a2ff', 'SYSTEM');
  }
}

// ------------------------------------------------------------ frame ---------
export function updateDirector(dt: number): void {
  const d = dd(), r = world.room, st = useGameStore.getState();
  if (!r.active) return;
  d.phaseT += dt;
  r.fade += Math.sign(r.fadeTarget - r.fade) * Math.min(Math.abs(r.fadeTarget - r.fade), dt / FADE_SECONDS);

  if (rewardT >= 0) { rewardT -= dt; if (rewardT < 0) grantReward(rewardKind, rewardBonus); }
  tickDaily(dt);
  if (waves.on && waves.breakT >= 0 && d.phase === 'CLEARED' && st.status === GameStatus.PLAYING) { waves.breakT -= dt; if (waves.breakT < 0) nextWave(); }

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
  if (d.phase === 'BIOME_DONE' && finale.step > 0 && finale.step < 4) tickFinale(dt);
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

  // a conversation (wanderer) takes E / F: next line / accept the offer
  if (dialogueOpen()) {
    if (world.input.pressed.KeyE) advanceDialogue();
    if (world.input.pressed.KeyF) acceptOffer();
    return;
  }
  scanNearby();
  harvestCd = Math.max(0, harvestCd - dt);
  if (world.input.keys.KeyE && !world.input.pressed.KeyE && roomNearby[0].active && roomNearby[0].node >= 100 && !st.isShopOpen) interactRoom(roomNearby[0]);
  if (world.input.pressed.KeyE && roomNearby[0].active && !st.isShopOpen && !st.isInventoryOpen && !st.isCharacterSheetOpen) interactRoom(roomNearby[0]);
}

function vacuumLoot(): void {
  const pk = world.pickups;
  for (let i = 0; i < pk.length; i++) if (pk[i].active && pk[i].kind !== 'ITEM') pk[i].magnet = true;   // currency / xp only: items are walked to (Rare+) or looted with E
}
