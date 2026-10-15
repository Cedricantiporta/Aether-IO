// ============================================================================
// Village mode (status MENU after the title): the hero walks around the peaceful
// town. No enemies / director / attacks. E = interact with the nearest thing (shop, quest board, NPC to talk
// to, the town gate), hold E near a crystal / ore node outside the gate (they regrow 24 h after the last one is harvested). NPC behaviour lives
// in npcs.ts, dialogue in dialogue.ts, the layout in ../townData.ts.
// ============================================================================
import { interacted, wantsInteract, npcMarkers } from './npcQuestLogic';
import { animals } from './npcs';
import { ANIMALS, NESTS, HIDDEN_CAT, WHEEL_PIN } from '../townData';
import { STORY, gateOpen } from '../../story';
import { world, QUEST_POS, TRAINER_POS, MAX_CRATES } from '../world';
import { events } from '../events';
import { SHOP_POSITIONS, SHOP_TAB, RARITY_LABEL_COLOR } from '../../constants';
import { useGameStore } from '../../store';
import { updatePlayerVillage } from './player';
import { updateCrates, hitCrate } from './crates';
import { updatePickups, lootPickup, petCollect } from './pickups';
import { spawnTownMonsters, updateTownMonsters } from './townMonsters';
import { updateEnemies } from './enemies';
import { updatePetTown } from './pets';
import { CRATE_HP, HARVEST_NAME, addTempCollider, generateMap, installInterior } from '../mapgen';
import { CASTLE_COLLIDERS, CASTLE_DOOR, CASTLE_EXIT, CASTLE_SPAWN, CASTLE_STEPS } from '../castleData';
import { TAVERN_COLLIDERS, TAVERN_DOOR, TAVERN_EXIT, TAVERN_SPAWN, TAVERN_OUT } from '../tavernData';
import { CHURCH_COLLIDERS, CHURCH_DOOR, CHURCH_EXIT, CHURCH_SPAWN, CHURCH_OUT, CHURCH_SIDE_EXIT, CHURCH_SIDE_SPAWN, PEW_SEATS } from '../churchData';
import { CHAPEL_SIDE, TOWN_SEATS, type SeatSpec } from '../townData';
/** The chapel was entered / left by its side door (the graveyard), not the front. */
let viaSide = false;
const seatsHere = (): SeatSpec[] => (world.village.area === 'CHURCH' ? PEW_SEATS : world.village.area === 'TOWN' ? TOWN_SEATS : []);
/** Sit down on seat `i` of the current area (benches, pews): any move key / stick / walk order stands up again. */
function sitDown(i: number): void {
  const s = seatsHere()[i]; if (!s) return;
  const p = world.player, st = world.village.sit;
  st.on = true; st.x = s.x; st.z = s.z; st.yaw = s.yaw; st.y = s.y;
  p.pos.set(s.x, 0, s.z); p.vel.set(0, 0, 0); p.facing = s.yaw; world.village.go.on = false;
}
export function standUp(): void {
  const st = world.village.sit; if (!st.on) return;
  st.on = false;
  const p = world.player; p.pos.set(st.x + Math.sin(st.yaw) * 0.95, 0, st.z + Math.cos(st.yaw) * 0.95);
}
import { CAVE_DOOR, CAVE_EXIT, CAVE_MOUTH, CAVE_MOUTH_COLLIDERS, CAVE_OUT, CAMP_COLLIDERS } from '../caveData';
import { UNLOCK_LV } from '../../unlocks';
import { enterCave, leaveCave, switchCaveFloor, scanCave, interactCave, updateCave } from './cave';
import { npcInArea } from './npcs';
import { CAM_PITCH0 } from '../world';
import type { ShopTab } from '../../storeTypes';
import type { Quest } from '../../quests';
import { GATE, NPCS, TOWN_COLLIDERS, VILLAGE_NODES, WALL, TOWER, PORTAL } from '../townData';
import { npcs, bubbles, resetNpcs, updateNpcs, TALK_R } from './npcs';
import { findPath, routeLength } from './townPath';
import { mainNav, npcQuestNav, boardQuestNav, navSpot, navNpc, type NavTarget, type Spot, TALK_REACH } from './questNav';
import { GameStatus } from '../../types';
import type { NpcQuestDef } from '../../npcQuests';
import { openDialogue, advanceDialogue, acceptOffer, dialogueOpen, closeDialogue, useDialogue } from './dialogue';
import { BEACH, BEACH_COLLIDERS, FISH_SPOTS, FISH_SPOT_R, beachSide } from '../beachData';
import { fishingActive, startFishing, stopFishing, updateFishing } from './fishing';

const INTERACT_R = 7;
/** Harvest nodes regrow 24 real hours after the LAST one was harvested; state is saved so it survives reloads. */
export const HARVEST_REGROW_MS = 24 * 60 * 60 * 1000;
interface HarvestSave { broken: number[]; clearedAt: number }
/** One persistent group of harvest nodes (crate pool slots 0..n): the town outskirts (the crystal cave keeps its own
 *  floors / saves in cave.ts; the slots are reused because only one area is loaded at a time). */
interface HarvestSet { key: string; nodes: readonly { kind: 'CRYSTAL' | 'ORE' | 'GOLD_VEIN' | 'HERB'; x: number; z: number }[]; h: HarvestSave }
const TOWN_HARVEST: HarvestSet = { key: 'aether-survivor-harvest-v1', nodes: VILLAGE_NODES, h: { broken: [], clearedAt: 0 } };
function loadHarvest(key: string): HarvestSave {
  try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; if (r) { const h = JSON.parse(r); if (Array.isArray(h.broken)) return { broken: h.broken.filter((x: unknown) => typeof x === 'number'), clearedAt: Number(h.clearedAt) || 0 }; } } catch { /* ignore */ }
  return { broken: [], clearedAt: 0 };
}
function saveHarvest(s: HarvestSet): void { try { if (typeof localStorage !== 'undefined') localStorage.setItem(s.key, JSON.stringify(s.h)); } catch { /* ignore */ } }
/** The harvest group of the current area (the town's; the cave handles its own, the castle has none). */
const harvestSet = (): HarvestSet | null => (world.village.area === 'TOWN' ? TOWN_HARVEST : null);
/** ms until the nodes of the current area (the town's when in the castle) regrow (0 = available / nothing harvested out). */
export function harvestRegrowIn(): number { const h = (harvestSet() ?? TOWN_HARVEST).h; return h.clearedAt > 0 ? Math.max(0, h.clearedAt + HARVEST_REGROW_MS - Date.now()) : 0; }
const HARVEST_R = 3.6;

/** Loads a harvest group into the crate pool (every other crate slot is switched off); harvested nodes stay gone. */
function placeNodes(set: HarvestSet): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  set.h = loadHarvest(set.key);
  if (set.h.clearedAt > 0 && Date.now() - set.h.clearedAt >= HARVEST_REGROW_MS) { set.h = { broken: [], clearedAt: 0 }; saveHarvest(set); }
  set.nodes.forEach((n, i) => {
    if (i >= MAX_CRATES) return;
    const c = world.crates[i];
    c.kind = n.kind; c.pos.set(n.x, 0, n.z); c.maxHp = c.hp = CRATE_HP[n.kind]; c.rot = i * 1.3;
    c.active = set.h.broken.indexOf(i) === -1; c.respawnT = 0;   // harvested nodes stay gone (no 90 s respawn)
  });
}

/** Replaces the island's run crates with the few village harvest nodes. */
export function placeVillageNodes(): void {
  placeNodes(TOWN_HARVEST);
  // houses / stalls / well / fences + posts / lamps / gate towers (mapgen rebuilt its collider grid just before this is called)
  for (const [x, z, r] of TOWN_COLLIDERS) addTempCollider(x, z, r, false);
  for (const [x, z, r] of CAVE_MOUTH_COLLIDERS) addTempCollider(x, z, r, false);   // the crystal cave entrance props
  for (const [x, z, r] of CAMP_COLLIDERS) addTempCollider(x, z, r, false);   // the mining camp in front of it (carts, heaps, shed ...)
  for (const [x, z, r] of BEACH_COLLIDERS) addTempCollider(x, z, r, false);   // the lakeside beach (headland rocks, palms, props)
  stopFishing();
  spawnTownMonsters();
  resetNpcs();
  closeDialogue();
  world.village.go.on = false;   // (a walk planned on the old map never carries over)
}

/** One thing the hero can interact with right now (preallocated, nearest first). every pill uses E. */
export interface Interactable { active: boolean; key: 'E' | 'F'; verb: string; label: string; shop: ShopTab | ''; node: number; d2: number; act: Act; /** label colour ('' = default), e.g. loot rarity */ color?: string }
// ---- farm actions (interaction quests). Cows can be milked every 20 s; each nest lays a fresh egg every 25 s.
const milkCd = new Float32Array(16), eggAt = new Float64Array(8);
export const eggReady = (k: number): boolean => world.time >= eggAt[k] || eggAt[k] - world.time > 25;   // (the clock restarts with each town visit)
/** Pip's cat sits in her hiding spot only while "Where Is Biscuit?" still needs her. */
export const catHidden = (): boolean => wantsInteract('cat');
/** Corin's lost wheel pin lies in the grass only while "A Pin in the Hay" still needs it. */
export const pinHidden = (): boolean => wantsInteract('pin');
/** Hold-E progress for farm chores (read by the interact prompt's ring). */
export const FARM_HOLD_S = 1.1;
export const farmHold = { node: -1, t: 0, lock: false };
function farmAct(node: number): void {
  const st = useGameStore.getState(), p = world.player;
  if (node >= 200 && node < 300) {
    const i = node - 200;
    if (world.time < milkCd[i] && milkCd[i] - world.time <= 20) { st.addNotification('This cow needs a rest. Try another!', '#f1e2b8', 'SYSTEM'); return; }
    milkCd[i] = world.time + 20; p.anim.castT = 1;
    p.facing = Math.atan2(animals[i].x - p.pos.x, animals[i].z - p.pos.z);
    interacted('milk'); st.addNotification('You fill a pail with fresh milk.', '#ffffff', 'SYSTEM');
  } else if (node >= 300 && node < 400) {
    const k = node - 300;
    if (!eggReady(k)) return;
    eggAt[k] = world.time + 25; p.anim.castT = 1;
    interacted('egg'); st.addNotification('You collect a warm egg.', '#ffe9b0', 'SYSTEM');
  } else if (node === 400) {
    p.anim.castT = 1;
    interacted('cat'); st.addNotification('You found Biscuit! Bring her back to Pip.', '#ffb070', 'SYSTEM');
  } else if (node === 401) {
    p.anim.castT = 1;
    interacted('pin'); st.addNotification('You found the wheel pin! Bring it back to Corin.', '#e0c890', 'SYSTEM');
  }
}

/** what an E pill does: open a shop panel, talk to NPC `node`, leave through the town gate (harvest = hold E, crate `node`) */
export type Act = 'shop' | 'npc' | 'gate' | 'harvest' | 'castle' | 'church' | 'tavern' | 'sit' | 'cave' | 'leave' | 'tower' | 'farm' | 'loot' | 'down' | 'up' | 'bench' | 'fish' | 'locked';
export const MAX_NEARBY = 3;
export const nearby: Interactable[] = Array.from({ length: MAX_NEARBY }, () => ({ active: false, key: 'E', verb: '', label: '', shop: '', node: -1, d2: 0, act: 'shop' as Act }));
let nearbyN = 0;
const push = (key: 'E' | 'F', verb: string, label: string, shop: ShopTab | '', node: number, d2: number, act: Act = 'shop', color = '') => {
  // insertion by distance into a fixed-size list
  let i = nearbyN < MAX_NEARBY ? nearbyN : MAX_NEARBY;
  if (i === MAX_NEARBY) { if (d2 >= nearby[MAX_NEARBY - 1].d2) return; i = MAX_NEARBY - 1; } else nearbyN++;
  while (i > 0 && nearby[i - 1].d2 > d2) { const a = nearby[i], b = nearby[i - 1]; a.key = b.key; a.verb = b.verb; a.label = b.label; a.shop = b.shop; a.node = b.node; a.d2 = b.d2; a.act = b.act; a.color = b.color; i--; }
  const t = nearby[i]; t.key = key; t.verb = verb; t.label = label; t.shop = shop; t.node = node; t.d2 = d2; t.act = act; t.color = color;
};
const GATE_R = 3.2;   // (only on top of the portal platform)
const SHOP_LABEL: Record<string, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet House', ARMORY: 'Armor Shop', FORTUNE: 'Fortune Teller', WAREHOUSE: 'Warehouse', TECH: 'Tech House', BREWER: 'Elixir Brewer', FISH: 'Fishmonger', MINE: 'Mining Supplies' };
/** Fishing + the Fishmonger need class level UNLOCK_LV.FISHING (unlocks.ts); below it their pills read "Unlocks at Lv N". */
export const fishingLocked = (): boolean => useGameStore.getState().level < UNLOCK_LV.FISHING;
const FISH_LOCK = `Unlocks at Lv ${UNLOCK_LV.FISHING}`, LOCK_COLOR = '#ff9a7a';

/** Prompt priority when several NPCs / counters overlap: an NPC with something for you (main quest, new or finished side
 *  quest) and one the hero is facing come first (scales the squared distance used for sorting). */
function talkBias(i: number): number {
  const p = world.player, n = npcs[i], mk = npcMarkers()[i];
  let k = STORY[useGameStore.getState().story.step]?.npc === NPCS[i].name || mk === 1 || mk === 3 ? 0.45 : 1;
  const dx = n.x - p.pos.x, dz = n.z - p.pos.z, l = Math.hypot(dx, dz);
  if (l > 1e-3 && (Math.sin(p.facing) * dx + Math.cos(p.facing) * dz) / l > 0.5) k *= 0.8;
  return k;
}
function scanNearby(): void {
  const p = world.player;
  nearbyN = 0;
  if (dialogueOpen() || fishingActive()) { for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = false; return; }
  const q = (x: number, z: number) => (x - p.pos.x) ** 2 + (z - p.pos.z) ** 2;
  let d: number;
  const area = world.village.area, castle = area === 'CASTLE';
  if (castle) {
    d = q(CASTLE_EXIT.x, CASTLE_EXIT.z); if (d < CASTLE_EXIT.r * CASTLE_EXIT.r) push('E', 'Leave', 'Castle', '', -1, d, 'leave');
  } else if (area === 'CHURCH') {
    d = q(CHURCH_EXIT.x, CHURCH_EXIT.z); if (d < CHURCH_EXIT.r * CHURCH_EXIT.r) push('E', 'Leave', 'Chapel', '', -1, d, 'leave');
    d = q(CHURCH_SIDE_EXIT.x, CHURCH_SIDE_EXIT.z); if (d < CHURCH_SIDE_EXIT.r * CHURCH_SIDE_EXIT.r) push('E', 'Out to', 'Graveyard', '', 1, d, 'leave');
  } else if (area === 'TAVERN') {
    d = q(TAVERN_EXIT.x, TAVERN_EXIT.z); if (d < TAVERN_EXIT.r * TAVERN_EXIT.r) push('E', 'Leave', 'Golden Tankard', '', -1, d, 'leave');
  } else if (area === 'CAVE') {
    scanCave(push, p.pos.x, p.pos.z);   // exit / stairs / lucky ladder / Grit's bench / veins (cave.ts)
  } else {
    d = q(QUEST_POS[0], QUEST_POS[2]); if (d < 36) push('E', 'Read', 'Quest Board', 'QUESTS', -1, d);
    d = q(TRAINER_POS[0], TRAINER_POS[2]); if (d < 36) push('E', 'Talk', 'Skill Trainer', 'SKILLS', -1, d);
    const beach = beachSide(p.pos.x, p.pos.z);   // the Fishmonger + fishing spots only from outside the wall (never through it)
    const fishLock = fishingLocked();
    for (const s of SHOP_POSITIONS) {
      if (s.type === 'FISH' && !beach) continue;
      d = q(s.position[0], s.position[2]); if (d >= INTERACT_R * INTERACT_R) continue;
      if (s.type === 'FISH' && fishLock) push('E', 'Locked', `Fishmonger · ${FISH_LOCK}`, '', -1, d, 'locked', LOCK_COLOR);
      else push('E', 'Talk', SHOP_LABEL[s.type] ?? s.type, SHOP_TAB[s.type], -1, d);
    }
    d = q(PORTAL.front.x, PORTAL.front.z); if (d < GATE_R * GATE_R) push('E', gateOpen(useGameStore.getState().story) ? 'Set out' : 'Sealed', 'Adventure Portal', '', -1, d, 'gate');
    d = q(TOWER.door.x, TOWER.door.z); if (d < 16) push('E', 'Enter', 'Endless Tower', '', -1, d, 'tower');
    d = q(CASTLE_DOOR.x, CASTLE_DOOR.z); if (d < CASTLE_DOOR.r * CASTLE_DOOR.r) push('E', 'Enter', 'Castle', '', -1, d, 'castle');
    d = q(CHURCH_DOOR.x, CHURCH_DOOR.z); if (d < CHURCH_DOOR.r * CHURCH_DOOR.r) push('E', 'Enter', 'Chapel', '', -1, d, 'church');
    d = q(TAVERN_DOOR.x, TAVERN_DOOR.z); if (d < TAVERN_DOOR.r * TAVERN_DOOR.r) push('E', 'Enter', 'Golden Tankard', '', -1, d, 'tavern');
    d = q(CHAPEL_SIDE.x, CHAPEL_SIDE.z); if (d < CHAPEL_SIDE.r * CHAPEL_SIDE.r) push('E', 'Enter', 'Chapel (side door)', '', 1, d, 'church');
    d = q(CAVE_DOOR.x, CAVE_DOOR.z); if (d < CAVE_DOOR.r * CAVE_DOOR.r) push('E', 'Enter', 'Crystal Cave', '', -1, d, 'cave');
    // farm: milk a cow, take an egg from a nest; Pip's cat while her quest is on
    // (only while a quest asks for it)
    if (wantsInteract('milk')) for (let i = 0; i < animals.length; i++) { if (ANIMALS[i].kind !== 'COW') continue; d = q(animals[i].x, animals[i].z); if (d < 7) push('E', 'Hold: Milk', 'Cow', '', 200 + i, d, 'farm'); }
    if (wantsInteract('egg')) for (let k = 0; k < NESTS.length; k++) { if (!eggReady(k)) continue; d = q(NESTS[k][0], NESTS[k][1]); if (d < 4) push('E', 'Hold: Collect', 'Egg', '', 300 + k, d, 'farm'); }
    if (catHidden()) { d = q(HIDDEN_CAT.x, HIDDEN_CAT.z); if (d < 9) push('E', 'Hold: Coax', 'Biscuit the cat', '', 400, d, 'farm'); }
    if (beach) for (let i = 0; i < FISH_SPOTS.length; i++) { d = q(FISH_SPOTS[i].x, FISH_SPOTS[i].z); if (d < FISH_SPOT_R * FISH_SPOT_R) { if (fishLock) push('E', 'Locked', `Fishing · ${FISH_LOCK}`, '', i, d - 1, 'locked', LOCK_COLOR); else push('E', 'Fish', FISH_SPOTS[i].label, '', i, d - 1, 'fish'); } }   // lakeside fishing
    if (pinHidden()) { d = q(WHEEL_PIN.x, WHEEL_PIN.z); if (d < 7) push('E', 'Hold: Pick up', 'Wheel pin', '', 401, d, 'farm'); }
  }
  if (world.village.sit.on) {   // seated: the only action is standing up
    nearbyN = 0; push('E', 'Stand', 'up', '', -1, 0, 'sit');
    for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = i < nearbyN;
    return;
  }
  { const seats = seatsHere(); for (let i = 0; i < seats.length; i++) { d = q(seats[i].x, seats[i].z); if (d < 1.7 * 1.7) push('E', 'Sit', area === 'CHURCH' ? 'Pew' : 'Bench', '', i, d + 0.6, 'sit'); } }
  for (let i = 0; i < npcs.length; i++) { if (!npcInArea(i)) continue; d = q(npcs[i].x, npcs[i].z); if (d < TALK_R * TALK_R) push('E', 'Talk', NPCS[i].name, '', i, d * talkBias(i), 'npc'); }
  if (area === 'TOWN')   // (town harvest nodes; the cave's come from scanCave)
  for (let i = 0; i < world.crates.length; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    d = q(c.pos.x, c.pos.z); if (d < HARVEST_R * HARVEST_R) push('E', 'Harvest', HARVEST_NAME[c.kind] ?? 'Node', '', i, d, 'harvest');
  }
  // items on the ground are looted by hand (E / tap)
  for (let i = 0; i < world.pickups.length; i++) {
    const o = world.pickups[i]; if (!o.active || o.kind !== 'ITEM' || !o.item || o.magnet || o.t < 0.35) continue;
    d = q(o.pos.x, o.pos.z); if (d < 2.4 * 2.4) push('E', 'Loot', o.item.name, '', i, d - 0.5, 'loot', RARITY_LABEL_COLOR[o.item.rarity] ?? '');
  }
  for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = i < nearbyN;
}

/** Same action as pressing E / F next to the thing (used by the touch interact pills). */
export function interact(it: Interactable): void {
  const st = useGameStore.getState(), v = world.village, p = world.player;
  if (it.act === 'locked') { st.addNotification(`${it.label.split(' · ')[0]} unlocks at Lv ${UNLOCK_LV.FISHING}. Level up out there first!`, LOCK_COLOR, 'WARNING'); return; }
  if (it.act === 'fish') { if (!st.isShopOpen && !dialogueOpen() && !v.pending && beachSide(p.pos.x, p.pos.z) && !fishingLocked()) startFishing(it.node); return; }
  if (it.act !== 'harvest' && it.act !== 'farm' && it.act !== 'loot') {
    if (st.isShopOpen || dialogueOpen() || v.pending) return;
    if (it.act === 'sit') { if (v.sit.on) standUp(); else sitDown(it.node); return; }
    if (it.act === 'castle') v.pending = 'ENTER';
    else if (it.act === 'church') { viaSide = it.node === 1; v.pending = 'CHURCH'; }
    else if (it.act === 'tavern') v.pending = 'TAVERN';
    else if (it.act === 'cave') v.pending = 'CAVE';
    else if (it.act === 'leave') { viaSide = v.area === 'CHURCH' && it.node === 1; v.pending = 'LEAVE'; }
    else if (it.act === 'down' || it.act === 'up' || it.act === 'bench') interactCave(it.act, it.node);
    else if (it.act === 'npc') openDialogue(it.node);
    else if (it.act === 'gate') {   // adventure; sealed until the King's first task (main story)
      if (!gateOpen(st.story)) st.addNotification('The gate is sealed. Follow your main quest first.', '#f1d58e', 'WARNING');
      else st.startMode('ADVENTURE');   // (owner: no window, E at the portal sets out at once; Ascension is picked at the tower)
    }
    else if (it.act === 'tower') events.emit('openSetOut', { mode: 'TOWER' });      // the Endless Tower building
    else if (it.shop) st.openSpecificShop(it.shop);
    return;
  }
  if (it.act === 'farm') { farmAct(it.node); return; }
  if (it.act === 'loot') { lootPickup(it.node); return; }
  const c = world.crates[it.node];
  if (c && c.active && v.harvestCd <= 0) { hitCrate(c, 15, true); v.harvestCd = 0.3; v.miningT = 0.45; p.anim.attackT = 1; p.facing = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); }
}

// ---- click-to-walk along the streets. The town's streets form a "+" through the plaza: the south street (z 10),
// the north street (z -6) and the avenue / castle path (x 0). A route = nearest street point -> along it to the x 0 axis
// -> along the axis to the target's street -> along that street -> the target (short hops are walked straight).
const STREETS: { h: boolean; c: number; a: number; b: number }[] = [
  { h: true, c: 10, a: -38, b: 38 }, { h: true, c: -6, a: -18, b: 18 }, { h: false, c: 0, a: -22, b: 40 },
];
function nearestStreet(x: number, z: number): { s: number; x: number; z: number; d: number } {
  let best = { s: 0, x, z, d: 1e9 };
  STREETS.forEach((st, i) => {
    const px = st.h ? Math.max(st.a, Math.min(st.b, x)) : st.c, pz = st.h ? st.c : Math.max(st.a, Math.min(st.b, z));
    const d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { s: i, x: px, z: pz, d };
  });
  return best;
}
function buildRoute(fx: number, fz: number, tx: number, tz: number, out: Float32Array): number {
  let n = 0;
  const push = (x: number, z: number) => { if (n > 0 && Math.hypot(out[n * 2 - 2] - x, out[n * 2 - 1] - z) < 0.8) return; out[n * 2] = x; out[n * 2 + 1] = z; n++; };
  // the hermit lives outside the north wall: out through the gate, round the east side, along the back of the wall
  const outN = (z: number, x: number) => z < WALL.z0 - 1.5 || x > WALL.x1 + 1.5;
  const outS = (z: number, x: number) => z > WALL.z1 + 1.2 && !outN(z, x);   // the forecourt south of the gate
  // the lakeside beach west of the wall: only reachable round the south-west corner tower (engine/beachData.ts). Fixed
  // lane (probed clear of the brewer's hut, flower boxes, carts and the beach props): forecourt (-4, 52) -> along the
  // meadow (-36, 53) (the dirt path to the beach) -> past the corner tower (-49, 47) -> boardwalk corner (-57.5, 43.5) -> the beach spine x -59.5 (west
  // of the fish stall and the crates / barrels) at the target's z -> straight across to the target (the pier runs along z).
  const onBeach = (z: number, x: number) => x < WALL.x0 - 1.5 && z > WALL.z0;
  if (world.village.area === 'TOWN' && onBeach(tz, tx) !== onBeach(fz, fx)) {
    const SPINE = -59.5, spineZ = (z: number) => Math.max(BEACH.z0 + 6, Math.min(43.5, z));
    if (onBeach(tz, tx)) {
      if (!outS(fz, fx)) n = buildRoute(fx, fz, -4, 52, out);   // (out through the gate first)
      else if (fx > -20) push(-4, 52);
      push(-36, 53); push(WALL.x0 - 4, WALL.z1 + 9);
      if (tz < 44) { push(-57.5, 43.5); push(SPINE, spineZ(tz)); }
      push(tx, tz);
      return n;
    }
    if (fz < 44) { push(SPINE, spineZ(fz)); push(-57.5, 43.5); }
    push(WALL.x0 - 4, WALL.z1 + 9); push(-36, 53);
    if (tx > -20 || !outS(tz, tx)) push(-4, 52);
    const k = buildRoute(out[n * 2 - 2], out[n * 2 - 1], tx, tz, out.subarray(n * 2));
    return n + k;
  }
  if (world.village.area === 'TOWN' && outN(tz, tx) && !outN(fz, fx)) {
    if (!outS(fz, fx)) n = buildRoute(fx, fz, 0, WALL.z1 - 4, out);   // to the inside of the gate
    push(0, WALL.z1 + 6); push(WALL.x1 + 5.5, WALL.z1 + 6); push(WALL.x1 + 4.5, WALL.z0 - 6); push(tx, tz);   // (the narrow back trail)
    return n;
  }
  // back from the ring outside the north / east wall: along the outside of the wall to the forecourt, then on from there
  if (world.village.area === 'TOWN' && outN(fz, fx) && !outN(tz, tx)) {
    if (fz < WALL.z0 - 1.5) push(WALL.x1 + 4.5, WALL.z0 - 6);   // north side: to the north-east corner first
    push(WALL.x1 + 5.5, WALL.z1 + 6); push(GATE.x + 6, WALL.z1 + 6);
    const k = buildRoute(GATE.x + 6, WALL.z1 + 6, tx, tz, out.subarray(n * 2));
    return n + k;
  }
  // through the gate: forecourt -> town, or town -> forecourt (never straight into the wall)
  if (world.village.area === 'TOWN' && outS(fz, fx) !== outS(tz, tx) && !outN(fz, fx) && !outN(tz, tx)) {
    if (outS(fz, fx)) {
      push(GATE.x, WALL.z1 + 5); push(GATE.x, WALL.z1 - 4);
      const k = buildRoute(GATE.x, WALL.z1 - 4, tx, tz, out.subarray(n * 2));
      return n + k;
    }
    n = buildRoute(fx, fz, GATE.x, WALL.z1 - 4, out);
    push(GATE.x, WALL.z1 + 5); push(tx, tz);
    return n;
  }
  if (Math.hypot(tx - fx, tz - fz) > 9 && world.village.area === 'TOWN') {
    const a = nearestStreet(fx, fz), b = nearestStreet(tx, tz);
    if (a.d < 14 && b.d < 14) {
      push(a.x, a.z);
      if (a.s !== b.s) {
        const A = STREETS[a.s], B = STREETS[b.s];
        if (A.h) push(0, A.c);              // along this street to the x 0 axis
        if (B.h) push(0, B.c);              // along the axis to the target street
      }
      push(b.x, b.z);
    }
  }
  push(tx, tz);
  return n;
}
/** Click on a shop / board / quest from afar: walk the hero there on the shortest walkable route (townPath A*; the old
 *  street route is the fallback), then do `act` on arrival (open `tab` / enter the castle or cave / talk to NPC `npc` /
 *  nothing). `r` = arrive within this distance of (x, z). An NPC target is followed while it patrols and the walk stops
 *  at talking distance. Instant when already close. Only in town (a tracker click during a run never queues a walk). */
export function walkTo(x: number, z: number, act: 'shop' | 'castle' | 'church' | 'tavern' | 'cave' | 'leave' | 'npc' | 'tower' | 'down' | 'none', tab: ShopTab | '' = '', r = 1.6, npc = -1): void {
  const st = useGameStore.getState(), p = world.player, g = world.village.go;
  if (st.status !== GameStatus.MENU) return;
  if (st.isShopOpen || dialogueOpen() || world.village.pending) return;
  if (act === 'npc' && npc >= 0 && npcs[npc]) { x = npcs[npc].x; z = npcs[npc].z; r = TALK_REACH; }
  g.act = act; g.tab = tab; g.npc = npc; g.r = 0.9;
  goT.x = x; goT.z = z; goT.reach = r; goT.repaths = 0; goT.track = 0.4;
  goT.resume = hopNext; hopNext = null;   // (a quest walk through a door carries on in the next area)
  if ((x - p.pos.x) ** 2 + (z - p.pos.z) ** 2 <= r * r) { g.on = false; arrive(); return; }
  g.on = planRoute();
}
/** Walk state beside world.village.go: the real target + reach, stuck detection, re-path budget, NPC follow timer. */
const goT = { x: 0, z: 0, reach: 1.6, best: 1e9, stuck: 0, repaths: 0, track: 0, resume: null as (() => void) | null, hops: 0 };
/** Set by navWalk just before walkTo: what to walk to next when this walk ends at a door / exit (castle, cave). */
let hopNext: (() => void) | null = null;
function planRoute(): boolean {
  const p = world.player, g = world.village.go;
  let n = findPath(p.pos.x, p.pos.z, goT.x, goT.z, goT.reach, g.wp);
  if (n <= 0) n = buildRoute(p.pos.x, p.pos.z, goT.x, goT.z, g.wp);   // no grid route: the old street route
  g.n = n; g.i = 0; g.x = g.wp[0]; g.z = g.wp[1];
  g.t = 0; g.tmax = 8 + routeLength(p.pos.x, p.pos.z, g.wp, n) / 2.5;
  goT.best = 1e9; goT.stuck = 0;
  return n > 0;
}
/** Per-frame walk update (arrival, next waypoint, following a walking NPC, re-path when blocked). */
function tickWalk(dt: number, talking: boolean): void {
  const g = world.village.go, p = world.player;
  if (!g.on) return;
  g.t += dt;
  if (talking || world.village.pending || g.t > g.tmax) { g.on = false; return; }
  if (g.act === 'npc' && g.npc >= 0 && (goT.track -= dt) <= 0) {   // a patrolling NPC: re-aim when it moved off
    goT.track = 0.4;
    const n = npcs[g.npc];
    if ((n.x - goT.x) ** 2 + (n.z - goT.z) ** 2 > 2.25) { goT.x = n.x; goT.z = n.z; if (!planRoute()) { g.on = false; return; } }
  }
  if ((goT.x - p.pos.x) ** 2 + (goT.z - p.pos.z) ** 2 <= goT.reach * goT.reach) { g.on = false; p.vel.x = p.vel.z = 0; arrive(); return; }
  const last = g.i >= g.n - 1, rr = last ? g.r : 0.8, dw = Math.hypot(g.x - p.pos.x, g.z - p.pos.z);
  if (dw <= rr) {
    if (!last) { g.i++; g.x = g.wp[g.i * 2]; g.z = g.wp[g.i * 2 + 1]; goT.best = 1e9; goT.stuck = 0; }
    else { g.on = false; p.vel.x = p.vel.z = 0; arrive(); }
    return;
  }
  // blocked (pushed against a prop / an NPC in the way): re-plan from here, give up after a few tries
  if (dw < goT.best - 0.15) { goT.best = dw; goT.stuck = 0; }
  else if ((goT.stuck += dt) > 0.8) {
    if (goT.repaths++ < 3 && planRoute()) return;
    g.on = false;
    useGameStore.getState().addNotification('Can\'t find a way there from here.', '#f1e2b8', 'SYSTEM');
  }
}
/** Walks to a quest target; when it is only a door / exit on the way (`hop`), `again` re-runs the quest walk once the
 *  next area has faded in, so one tracker click leads all the way (e.g. cave -> town -> castle hall -> the King). */
function navWalk(t: NavTarget, again?: () => void, chained = false): void {
  if (world.village.area === 'CAVE' && world.village.cave.floor > 1) return;   // deep cave floors: no quest shortcut out of a trip
  if (!chained) goT.hops = 0;
  hopNext = t.hop && again && goT.hops < 3 ? () => { goT.hops++; again(); } : null;
  walkTo(t.x, t.z, t.act, t.tab, t.reach, t.npc);
  hopNext = null;
}
/** Quest tracker click (Quest Board bounty): claim at the board, the King, the potion shop (sell loot), else the portal. */
export function walkToQuest(q: Quest): void { navWalk(boardQuestNav(q), () => walkToQuestHop(q), false); }
function walkToQuestHop(q: Quest): void { navWalk(boardQuestNav(q), () => walkToQuestHop(q), true); }
/** Main story row click: the step's NPC (through the castle door / exit when it is in the other area), the step's shop,
 *  else the Adventure Portal. The equip step opens the bag. */
export function walkToMain(): void {
  const st0 = useGameStore.getState();
  if (STORY[st0.story.step]?.at === 'BAG') { if (!st0.isInventoryOpen) st0.toggleInventory(); return; }   // equip step: open the bag
  const t = mainNav();
  if (t) navWalk(t, walkToMainHop);
}
function walkToMainHop(): void { const t = mainNav(); if (t) navWalk(t, walkToMainHop, true); }
/** NPC side quest click: the NPC who takes it in when ready, the TALK target, the farm chore, the shop of a shop action,
 *  else the Adventure Portal. Takes the quest (or, legacy form, its objective + the NPC to walk to). */
export function walkToNpcObjective(o: { type: string; target?: string | string[] } | NpcQuestDef, npc?: string | null): void {
  if ('objective' in o) { const again = (): void => navWalk(npcQuestNav(o), again, true); navWalk(npcQuestNav(o), again); return; }
  if (npc) { walkToNpcQuest(npc); return; }
  navWalk(npcQuestNav({ id: '', giver: '', title: '', summary: '', intro: [], progress: '', done: [], objective: { type: o.type as NpcQuestDef['objective']['type'], target: o.target, count: 1 }, reward: {} }));
}
// After a teleport home from a run: the quest's auto-path starts by itself once the town is in.
let afterArrive: (() => void) | null = null, afterT = 0;
export function walkAfterArrive(fn: () => void): void { afterArrive = fn; afterT = 0.8; }
/** Walk to talk with NPC `name` (through the castle door / exit when needed); unknown name: the Adventure Portal. */
export function walkToNpcQuest(name: string | null): void {
  const i = name ? NPCS.findIndex((n) => n.name === name) : -1;
  if (i >= 0) { const again = (): void => navWalk(navNpc(i), again, true); navWalk(navNpc(i), again); return; }
  if (world.village.area === 'CASTLE') walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2);
  else if (world.village.area === 'CHURCH') walkTo(CHURCH_EXIT.x, CHURCH_EXIT.z, 'leave', '', 2);
  else if (world.village.area === 'TAVERN') walkTo(TAVERN_EXIT.x, TAVERN_EXIT.z, 'leave', '', 2);
  else if (world.village.area === 'CAVE') walkTo(CAVE_EXIT.x, CAVE_EXIT.z, 'leave', '', 2);
  else walkTo(PORTAL.front.x, PORTAL.front.z, 'none', '', 2.2);
}
/** Walk to a shop counter / the quest board / the trainer / the tower door and open it on arrival. */
export function walkToSpot(at: Spot): void { const t = navSpot(at); if (t) navWalk(t); }
export const walkAndOpen = (x: number, z: number, tab: ShopTab, r = 1.6): void => walkTo(x, z, 'shop', tab, r);
function arrive(): void {
  const g = world.village.go, st = useGameStore.getState();
  if (goT.resume && (g.act === 'castle' || g.act === 'church' || g.act === 'tavern' || g.act === 'cave' || g.act === 'leave')) walkAfterArrive(goT.resume);
  goT.resume = null;
  if (g.act === 'shop' && g.tab) {
    if (g.tab === 'FISH' && fishingLocked()) st.addNotification(`The Fishmonger trades with anglers from Lv ${UNLOCK_LV.FISHING}.`, LOCK_COLOR, 'WARNING');
    else if (g.tab !== 'FISH' || beachSide(world.player.pos.x, world.player.pos.z)) st.openSpecificShop(g.tab as ShopTab);   // (the Fishmonger: never through the wall)
  }
  else if (g.act === 'down') interactCave('down', 0);   // (quest walk to the cave stairs: go down when allowed)
  else if (g.act === 'castle') world.village.pending = 'ENTER';
  else if (g.act === 'church') world.village.pending = 'CHURCH';
  else if (g.act === 'tavern') world.village.pending = 'TAVERN';
  else if (g.act === 'cave') world.village.pending = 'CAVE';
  else if (g.act === 'leave') world.village.pending = 'LEAVE';
  else if (g.act === 'tower') events.emit('openSetOut', { mode: 'TOWER' });
  else if (g.act === 'npc' && g.npc >= 0) openDialogue(g.npc);
}

const FADE_S = 0.2;   // fade out + fade in = ~0.4 s
/** Swaps the village between the town, the castle throne hall and the crystal cave (called at full black). */
function switchArea(to: 'TOWN' | 'CASTLE' | 'CAVE' | 'CHURCH' | 'TAVERN'): void {
  const p = world.player, v = world.village, C = world.camera, from = v.area;
  closeDialogue();
  // cave trips: whatever lies on the ground is scooped up on the way (it would otherwise float in the other map)
  // (leaving the cave: unlooted drops there are lost; going in: town drops are scooped up)
  if (from === 'CAVE') { for (const o of world.pickups) o.active = false; world.itemPickupsVersion++; }
  else if (to === 'CAVE') for (const o of world.pickups) if (o.active) petCollect(o);
  if (from === 'CAVE' && to !== 'CAVE') leaveCave();
  for (const b of bubbles) b.active = false;
  p.vel.set(0, 0, 0); p.dashT = 0; p.anim.moveBlend = 0; world.village.sit.on = false;
  if (to === 'CASTLE') {
    v.area = 'CASTLE';
    for (const c of world.crates) { c.active = false; }
    installInterior(CASTLE_COLLIDERS);
    resetNpcs();
    p.pos.set(CASTLE_SPAWN.x, 0, CASTLE_SPAWN.z); p.facing = Math.PI;
    C.yaw = 0; C.dist = 0.8; C.pitch = CAM_PITCH0;
  } else if (to === 'CHURCH') {
    v.area = 'CHURCH';
    for (const c of world.crates) { c.active = false; }
    installInterior(CHURCH_COLLIDERS);
    resetNpcs();
    if (viaSide) { p.pos.set(CHURCH_SIDE_SPAWN.x, 0, CHURCH_SIDE_SPAWN.z); p.facing = Math.PI / 2; }
    else { p.pos.set(CHURCH_SPAWN.x, 0, CHURCH_SPAWN.z); p.facing = Math.PI; }
    C.yaw = 0; C.dist = 0.8; C.pitch = CAM_PITCH0;
  } else if (to === 'TAVERN') {
    v.area = 'TAVERN';
    for (const c of world.crates) { c.active = false; }
    installInterior(TAVERN_COLLIDERS);
    resetNpcs();
    p.pos.set(TAVERN_SPAWN.x, 0, TAVERN_SPAWN.z); p.facing = Math.PI;
    C.yaw = 0; C.dist = 0.8; C.pitch = CAM_PITCH0;
  } else if (to === 'CAVE') {
    enterCave();   // Floor 1 (cave.ts: veins, colliders, NPCs, spawn, camera)
  } else {
    v.area = 'TOWN';
    generateMap(); placeVillageNodes();   // the normal town setup path (rebuilds town colliders, harvest nodes, NPCs)
    if (from === 'CAVE') {   // just outside the cave mouth, facing out over the bay
      p.pos.set(CAVE_OUT.x, 0, CAVE_OUT.z); p.facing = CAVE_MOUTH.rot;
      C.yaw = 0; C.dist = 1; C.pitch = CAM_PITCH0;
    } else if (from === 'CHURCH' && viaSide) {   // out of the side door, into the graveyard
      p.pos.set(CHAPEL_SIDE.x - 0.6, 0, CHAPEL_SIDE.z); p.facing = -Math.PI / 2;
      C.yaw = 0; C.dist = 1; C.pitch = CAM_PITCH0;
    } else if (from === 'TAVERN') {   // in front of the Golden Tankard, facing the town
      p.pos.set(TAVERN_OUT.x, 0, TAVERN_OUT.z); p.facing = 0;
      C.yaw = 0; C.dist = 1; C.pitch = CAM_PITCH0;
    } else if (from === 'CHURCH') {   // on the chapel steps, facing the town
      p.pos.set(CHURCH_OUT.x, 0, CHURCH_OUT.z); p.facing = 0;
      C.yaw = 0; C.dist = 1; C.pitch = CAM_PITCH0;
    } else {
      p.pos.set(CASTLE_STEPS.x, 0, CASTLE_STEPS.z); p.facing = 0;
      C.yaw = Math.PI; C.dist = 1; C.pitch = CAM_PITCH0;   // camera north of the hero, looking at the town
    }
  }
  v.areaVer++;
  world.enemyGrid.clear();
}

export function updateVillage(dt: number): void {
  const p = world.player, inp = world.input, v = world.village;
  // area-switch fade: black out, swap the map, fade back in (~0.4 s total)
  if (v.pending) {
    v.fade = Math.min(1, v.fade + dt / FADE_S);
    if (v.fade >= 1) {
      if (v.pending === 'DOWN' || v.pending === 'UP') switchCaveFloor(v.pending);   // cave floors (cave.ts)
      else switchArea(v.pending === 'ENTER' ? 'CASTLE' : v.pending === 'CHURCH' ? 'CHURCH' : v.pending === 'TAVERN' ? 'TAVERN' : v.pending === 'CAVE' ? 'CAVE' : 'TOWN');
      v.pending = '';
    }
  } else if (v.fade > 0) v.fade = Math.max(0, v.fade - dt / FADE_S);
  const talking = dialogueOpen();
  if (afterArrive && !v.pending && v.fade <= 0 && !talking && (afterT -= dt) <= 0) { const f = afterArrive; afterArrive = null; f(); }
  if (talking) {
    // frozen in conversation: face the speaker, E / Space advances, opening a panel ends it
    const st0 = useGameStore.getState();
    const n = npcs[useDialogueNpc()];
    if (st0.isShopOpen || st0.isInventoryOpen || st0.isCharacterSheetOpen || st0.isPauseMenuOpen || !n || (n.x - p.pos.x) ** 2 + (n.z - p.pos.z) ** 2 > 64) closeDialogue();
    else {
      p.vel.x = p.vel.z = 0; p.anim.moveBlend *= Math.max(0, 1 - dt * 10);
      if (n) p.facing = Math.atan2(n.x - p.pos.x, n.z - p.pos.z);
      if (inp.pressed.KeyF) acceptOffer();   // F accepts an NPC quest offer (last line)
      if (inp.pressed.KeyE || inp.pressed.Space) advanceDialogue();
    }
  } else if (v.pending) { p.vel.x = p.vel.z = 0; }
  else if (v.sit.on) {   // seated on a bench / pew: any move input (keys, stick, a walk order) stands up
    const k = inp.keys;
    if (k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || inp.joy.active || v.go.on || inp.pressed.Space) standUp();
    else { p.vel.x = p.vel.z = 0; p.pos.set(v.sit.x, 0, v.sit.z); p.facing = v.sit.yaw; p.anim.moveBlend *= Math.max(0, 1 - dt * 10); }
  } else updatePlayerVillage(dt);
  updatePetTown(dt);
  updateCrates(dt);
  // persistent harvest (town nodes / cave nodes, each with its own save): a node that just broke is recorded; when every
  // node of the group is gone its 24 h regrow clock starts (the castle loads no nodes: never record anything there)
  const hs = harvestSet();
  if (hs) {
    let changed = false;
    const n = Math.min(hs.nodes.length, MAX_CRATES);
    for (let i = 0; i < n; i++) {
      const c = world.crates[i];
      if (!c.active) { c.respawnT = 0; if (hs.h.broken.indexOf(i) === -1) { hs.h.broken.push(i); changed = true; } }
    }
    if (changed) {
      if (hs.h.broken.length >= n && hs.h.clearedAt === 0) hs.h.clearedAt = Date.now();
      saveHarvest(hs);
    }
    if (hs.h.clearedAt > 0 && Date.now() - hs.h.clearedAt >= HARVEST_REGROW_MS) {   // regrow while standing in the area
      hs.h = { broken: [], clearedAt: 0 }; saveHarvest(hs);
      for (let i = 0; i < n; i++) { const c = world.crates[i]; c.hp = c.maxHp = CRATE_HP[hs.nodes[i].kind]; c.active = true; }
    }
  }
  updatePickups(dt);
  const caveFight = updateCave(dt);   // cave floors: veins, lantern oil, hazards, monsters (cave.ts)
  if (updateTownMonsters(dt) || caveFight) updateEnemies(dt);   // hermit-path monsters (stationary, harmless) / cave monsters
  updateNpcs(dt);
  tickWalk(dt, talking);   // click-to-walk / quest auto-path

  v.harvestCd = Math.max(0, v.harvestCd - dt); v.miningT = Math.max(0, v.miningT - dt);
  // E acts on the NEAREST pill: press = talk / open / set out; press or HOLD = harvest when that nearest thing is a node
  updateFishing(dt);   // lakeside fishing (E drives the cast / hook / reel; moving reels in)
  const top = nearby[0];
  if (!talking && top.active && !v.pending) {
    if (top.act === 'harvest') { if (inp.keys.KeyE || inp.pressed.KeyE) interact(top); }
    else if (top.act === 'farm') {   // farm chores are held: the key's ring fills, then the chore is done (release to go again)
      const held = !!(inp.keys.KeyE || inp.pressed.KeyE);
      if (!held) { farmHold.t = 0; farmHold.lock = false; }
      else if (!farmHold.lock) {
        if (farmHold.node !== top.node) { farmHold.node = top.node; farmHold.t = 0; }
        farmHold.t += dt; p.anim.castT = Math.max(p.anim.castT, 0.6);
        if (farmHold.t >= FARM_HOLD_S) { farmAct(top.node); farmHold.t = 0; farmHold.lock = true; }
      }
    }
    else if (inp.pressed.KeyE) interact(top);
  } else farmHold.t = 0;
  scanNearby();
  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.frame++;
}
const useDialogueNpc = (): number => useDialogue.getState().npc;
