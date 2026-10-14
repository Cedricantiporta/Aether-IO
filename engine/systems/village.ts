// ============================================================================
// Village mode (status MENU after the title): the hero walks around the peaceful
// town. No enemies / director / attacks. E = interact with the nearest thing (shop, quest board, NPC to talk
// to, the town gate), hold E near a crystal / ore node outside the gate (they regrow 24 h after the last one is harvested). NPC behaviour lives
// in npcs.ts, dialogue in dialogue.ts, the layout in ../townData.ts.
// ============================================================================
import { interacted, wantsInteract } from './npcQuestLogic';
import { animals } from './npcs';
import { ANIMALS, NESTS, HIDDEN_CAT } from '../townData';
import { storyTarget } from './storyLogic';
import { STORY, gateOpen } from '../../story';
import { world, QUEST_POS, TRAINER_POS, MAX_CRATES } from '../world';
import { events } from '../events';
import { SHOP_POSITIONS, SHOP_TAB } from '../../constants';
import { useGameStore } from '../../store';
import { updatePlayerVillage } from './player';
import { updateCrates, hitCrate } from './crates';
import { updatePickups } from './pickups';
import { spawnTownMonsters, updateTownMonsters } from './townMonsters';
import { updateEnemies } from './enemies';
import { updatePetTown } from './pets';
import { CRATE_HP, HARVEST_NAME, addTempCollider, generateMap, installInterior } from '../mapgen';
import { CASTLE_COLLIDERS, CASTLE_DOOR, CASTLE_EXIT, CASTLE_SPAWN, CASTLE_STEPS } from '../castleData';
import { CAM_PITCH0 } from '../world';
import type { ShopTab } from '../../storeTypes';
import { questDone, questNeedsKing, type Quest } from '../../quests';
import { GATE, NPCS, TOWN_COLLIDERS, VILLAGE_NODES, WALL, TOWER } from '../townData';
import { npcs, bubbles, resetNpcs, updateNpcs, TALK_R } from './npcs';
import { openDialogue, advanceDialogue, acceptOffer, dialogueOpen, closeDialogue, useDialogue } from './dialogue';

const INTERACT_R = 7;
/** Harvest nodes regrow 24 real hours after the LAST one was harvested; state is saved so it survives reloads. */
export const HARVEST_REGROW_MS = 24 * 60 * 60 * 1000;
const HARVEST_KEY = 'aether-survivor-harvest-v1';
interface HarvestSave { broken: number[]; clearedAt: number }
function loadHarvest(): HarvestSave {
  try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(HARVEST_KEY) : null; if (r) { const h = JSON.parse(r); if (Array.isArray(h.broken)) return { broken: h.broken.filter((x: unknown) => typeof x === 'number'), clearedAt: Number(h.clearedAt) || 0 }; } } catch { /* ignore */ }
  return { broken: [], clearedAt: 0 };
}
function saveHarvest(h: HarvestSave): void { try { if (typeof localStorage !== 'undefined') localStorage.setItem(HARVEST_KEY, JSON.stringify(h)); } catch { /* ignore */ } }
let harvest: HarvestSave = { broken: [], clearedAt: 0 };
/** ms until the nodes regrow (0 = available / nothing harvested out). */
export function harvestRegrowIn(): number { return harvest.clearedAt > 0 ? Math.max(0, harvest.clearedAt + HARVEST_REGROW_MS - Date.now()) : 0; }
const HARVEST_R = 3.6;
/** Resource nodes on the outskirts of the village (crate pool slots 0..n are reused as village nodes; positions in townData). */
const NODES = VILLAGE_NODES;

/** Replaces the island's run crates with the few village harvest nodes. */
export function placeVillageNodes(): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  harvest = loadHarvest();
  if (harvest.clearedAt > 0 && Date.now() - harvest.clearedAt >= HARVEST_REGROW_MS) { harvest = { broken: [], clearedAt: 0 }; saveHarvest(harvest); }
  NODES.forEach((n, i) => {
    if (i >= MAX_CRATES) return;
    const c = world.crates[i];
    c.kind = n.kind; c.pos.set(n.x, 0, n.z); c.maxHp = c.hp = CRATE_HP[n.kind]; c.rot = i * 1.3;
    c.active = harvest.broken.indexOf(i) === -1; c.respawnT = 0;   // harvested nodes stay gone (no 90 s respawn)
  });
  // houses / stalls / well / fences + posts / lamps / gate towers (mapgen rebuilt its collider grid just before this is called)
  for (const [x, z, r] of TOWN_COLLIDERS) addTempCollider(x, z, r, false);
  spawnTownMonsters();
  resetNpcs();
  closeDialogue();
}

/** One thing the hero can interact with right now (preallocated, nearest first). every pill uses E. */
export interface Interactable { active: boolean; key: 'E' | 'F'; verb: string; label: string; shop: ShopTab | ''; node: number; d2: number; act: Act; }
// ---- farm actions (interaction quests). Cows can be milked every 20 s; each nest lays a fresh egg every 25 s.
const milkCd = new Float32Array(16), eggAt = new Float64Array(8);
export const eggReady = (k: number): boolean => world.time >= eggAt[k] || eggAt[k] - world.time > 25;   // (the clock restarts with each town visit)
/** Pip's cat sits in her hiding spot only while "Where Is Biscuit?" still needs her. */
export const catHidden = (): boolean => wantsInteract('cat');
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
  }
}

/** what an E pill does: open a shop panel, talk to NPC `node`, leave through the town gate (harvest = hold E, crate `node`) */
export type Act = 'shop' | 'npc' | 'gate' | 'harvest' | 'castle' | 'leave' | 'tower' | 'farm';
export const MAX_NEARBY = 3;
export const nearby: Interactable[] = Array.from({ length: MAX_NEARBY }, () => ({ active: false, key: 'E', verb: '', label: '', shop: '', node: -1, d2: 0, act: 'shop' as Act }));
let nearbyN = 0;
const push = (key: 'E' | 'F', verb: string, label: string, shop: ShopTab | '', node: number, d2: number, act: Act = 'shop') => {
  // insertion by distance into a fixed-size list
  let i = nearbyN < MAX_NEARBY ? nearbyN : MAX_NEARBY;
  if (i === MAX_NEARBY) { if (d2 >= nearby[MAX_NEARBY - 1].d2) return; i = MAX_NEARBY - 1; } else nearbyN++;
  while (i > 0 && nearby[i - 1].d2 > d2) { const a = nearby[i], b = nearby[i - 1]; a.key = b.key; a.verb = b.verb; a.label = b.label; a.shop = b.shop; a.node = b.node; a.d2 = b.d2; a.act = b.act; i--; }
  const t = nearby[i]; t.key = key; t.verb = verb; t.label = label; t.shop = shop; t.node = node; t.d2 = d2; t.act = act;
};
const GATE_R = 5.5;
const SHOP_LABEL: Record<string, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet House', ARMORY: 'Armor Shop', FORTUNE: 'Fortune Teller', WAREHOUSE: 'Warehouse', TECH: 'Tech House' };

function scanNearby(): void {
  const p = world.player;
  nearbyN = 0;
  if (dialogueOpen()) { for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = false; return; }
  const q = (x: number, z: number) => (x - p.pos.x) ** 2 + (z - p.pos.z) ** 2;
  let d: number;
  const castle = world.village.area === 'CASTLE';
  if (castle) {
    d = q(CASTLE_EXIT.x, CASTLE_EXIT.z); if (d < CASTLE_EXIT.r * CASTLE_EXIT.r) push('E', 'Leave', 'Castle', '', -1, d, 'leave');
  } else {
    d = q(QUEST_POS[0], QUEST_POS[2]); if (d < 36) push('E', 'Read', 'Quest Board', 'QUESTS', -1, d);
    d = q(TRAINER_POS[0], TRAINER_POS[2]); if (d < 36) push('E', 'Talk', 'Skill Trainer', 'SKILLS', -1, d);
    for (const s of SHOP_POSITIONS) { d = q(s.position[0], s.position[2]); if (d < INTERACT_R * INTERACT_R) push('E', 'Talk', SHOP_LABEL[s.type] ?? s.type, SHOP_TAB[s.type], -1, d); }
    d = q(GATE.x, GATE.z - 1); if (d < GATE_R * GATE_R) push('E', gateOpen(useGameStore.getState().story) ? 'Set out' : 'Sealed', 'Town Gate', '', -1, d, 'gate');
    d = q(TOWER.door.x, TOWER.door.z); if (d < 16) push('E', 'Enter', 'Endless Tower', '', -1, d, 'tower');
    d = q(CASTLE_DOOR.x, CASTLE_DOOR.z); if (d < CASTLE_DOOR.r * CASTLE_DOOR.r) push('E', 'Enter', 'Castle', '', -1, d, 'castle');
    // farm: milk a cow, take an egg from a nest; Pip's cat while her quest is on
    // (only while a quest asks for it)
    if (wantsInteract('milk')) for (let i = 0; i < animals.length; i++) { if (ANIMALS[i].kind !== 'COW') continue; d = q(animals[i].x, animals[i].z); if (d < 7) push('E', 'Hold: Milk', 'Cow', '', 200 + i, d, 'farm'); }
    if (wantsInteract('egg')) for (let k = 0; k < NESTS.length; k++) { if (!eggReady(k)) continue; d = q(NESTS[k][0], NESTS[k][1]); if (d < 4) push('E', 'Hold: Collect', 'Egg', '', 300 + k, d, 'farm'); }
    if (catHidden()) { d = q(HIDDEN_CAT.x, HIDDEN_CAT.z); if (d < 9) push('E', 'Hold: Coax', 'Biscuit the cat', '', 400, d, 'farm'); }
  }
  for (let i = 0; i < npcs.length; i++) { if ((NPCS[i].area === 'CASTLE') !== castle) continue; d = q(npcs[i].x, npcs[i].z); if (d < TALK_R * TALK_R) push('E', 'Talk', NPCS[i].name, '', i, d, 'npc'); }
  if (!castle)
  for (let i = 0; i < world.crates.length; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    d = q(c.pos.x, c.pos.z); if (d < HARVEST_R * HARVEST_R) push('E', 'Harvest', HARVEST_NAME[c.kind] ?? 'Node', '', i, d, 'harvest');
  }
  for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = i < nearbyN;
}

/** Same action as pressing E / F next to the thing (used by the touch interact pills). */
export function interact(it: Interactable): void {
  const st = useGameStore.getState(), v = world.village, p = world.player;
  if (it.act !== 'harvest' && it.act !== 'farm') {
    if (st.isShopOpen || dialogueOpen() || v.pending) return;
    if (it.act === 'castle') v.pending = 'ENTER';
    else if (it.act === 'leave') v.pending = 'LEAVE';
    else if (it.act === 'npc') openDialogue(it.node);
    else if (it.act === 'gate') {   // adventure (+ Ascension); sealed until the King's first task (main story)
      if (!gateOpen(st.story)) st.addNotification('The gate is sealed. Follow your main quest first.', '#f1d58e', 'WARNING');
      else events.emit('openSetOut', { mode: 'ADVENTURE' });
    }
    else if (it.act === 'tower') events.emit('openSetOut', { mode: 'TOWER' });      // the Endless Tower building
    else if (it.shop) st.openSpecificShop(it.shop);
    return;
  }
  if (it.act === 'farm') { farmAct(it.node); return; }
  const c = world.crates[it.node];
  if (c && c.active && v.harvestCd <= 0) { hitCrate(c, 15, true); v.harvestCd = 0.3; p.anim.attackT = 1; p.facing = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); }
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
  if (world.village.area === 'TOWN' && outN(tz, tx) && !outN(fz, fx)) {
    if (!outS(fz, fx)) n = buildRoute(fx, fz, 0, WALL.z1 - 4, out);   // to the inside of the gate
    push(0, WALL.z1 + 6); push(WALL.x1 + 8, WALL.z1 + 6); push(WALL.x1 + 8, WALL.z0 - 9); push(tx, tz);
    return n;
  }
  // back from the ring outside the north / east wall: along the outside of the wall to the forecourt, then on from there
  if (world.village.area === 'TOWN' && outN(fz, fx) && !outN(tz, tx)) {
    if (fz < WALL.z0 - 1.5) push(WALL.x1 + 8, WALL.z0 - 9);   // north side: to the north-east corner first
    push(WALL.x1 + 8, WALL.z1 + 6); push(GATE.x + 6, WALL.z1 + 6);
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
/** Click on a shop / board / quest from afar: walk the hero there along the streets, then do `act` on arrival
 *  (open `tab` / enter the castle / talk to NPC `npc` / nothing). Instant when already close. */
export function walkTo(x: number, z: number, act: 'shop' | 'castle' | 'leave' | 'npc' | 'tower' | 'none', tab: ShopTab | '' = '', r = 1.6, npc = -1): void {
  const st = useGameStore.getState(), p = world.player, g = world.village.go;
  if (st.isShopOpen || dialogueOpen() || world.village.pending) return;
  g.act = act; g.tab = tab; g.npc = npc; g.r = r;
  if ((x - p.pos.x) ** 2 + (z - p.pos.z) ** 2 <= r * r) { g.on = false; arrive(); return; }
  g.n = buildRoute(p.pos.x, p.pos.z, x, z, g.wp); g.i = 0; g.x = g.wp[0]; g.z = g.wp[1];
  let len = 0; for (let k = 0, px = p.pos.x, pz = p.pos.z; k < g.n; k++) { len += Math.hypot(g.wp[k * 2] - px, g.wp[k * 2 + 1] - pz); px = g.wp[k * 2]; pz = g.wp[k * 2 + 1]; }
  g.on = true; g.t = 0; g.tmax = 6 + len / 3;
}
/** Quest tracker click: walk to wherever the quest continues (claim at the board, the King, the potion shop, else the gate). */
export function walkToQuest(q: Quest): void {
  const st = useGameStore.getState(), castle = world.village.area === 'CASTLE';
  const king = NPCS.findIndex((n) => n.king);
  if (questDone(q)) { if (castle) walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2); else walkTo(QUEST_POS[0], QUEST_POS[2] + 2.6, 'shop', 'QUESTS', 1.8); return; }
  if (questNeedsKing(q)) {
    if (castle && king >= 0) { const h = NPCS[king].home; walkTo(h[0], h[1] + 2.2, 'npc', '', 1.6, king); }
    else walkTo(CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 'castle', '', 2.4);
    return;
  }
  if (q.type === 'SELL_LOOT' && st.inventory.some((i) => i.type === 'LOOT') && !castle) { const s = SHOP_POSITIONS.find((x) => x.type === 'SUPPLIES')!; walkTo(s.position[0] + 1.2, s.position[2] + 5.2, 'shop', 'SUPPLIES'); return; }
  if (castle) walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2);
  else walkTo(GATE.x, GATE.z - 3, 'none', '', 2.2);   // kill / gold / clear quests: out through the town gate
}
/** Main story row click: the step's NPC (through the castle door / exit when it is in the other area), else the gate. */
export function walkToMain(): void {
  const t = storyTarget(), castle = world.village.area === 'CASTLE';
  if (!t) return;
  if (t.npc >= 0) {
    const inCastle = t.area === 'CASTLE';
    if (inCastle === castle) { walkTo(npcs[t.npc].x, npcs[t.npc].z + 1.8, 'npc', '', 2.4, t.npc); return; }
    if (inCastle) { walkTo(CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 'castle', '', 2.4); return; }
    walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2); return;
  }
  if (castle) { walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2); return; }
  const at = STORY[useGameStore.getState().story.step]?.at;
  if (at && at !== 'BAG') { walkToSpot(at); return; }
  walkTo(GATE.x, GATE.z - 1, 'none', '', 2.2);
}
type Spot = 'SUPPLIES' | 'PETS' | 'FORTUNE' | 'BLACKSMITH' | 'WAREHOUSE' | 'BOARD' | 'TRAINER';
/** Walk to a shop counter / the quest board / the skill trainer and open it on arrival. */
function walkToSpot(at: Spot): void {
  if (at === 'BOARD') { walkTo(QUEST_POS[0], QUEST_POS[2] + 2.6, 'shop', 'QUESTS', 1.8); return; }
  if (at === 'TRAINER') { walkTo(TRAINER_POS[0], TRAINER_POS[2] + 2.6, 'shop', 'SKILLS', 1.8); return; }
  const s = SHOP_POSITIONS.find((x) => x.type === at);
  if (s) walkTo(s.position[0], s.position[2] + 3.2, 'shop', SHOP_TAB[s.type], 1.8);
}
const ACTION_SPOT: Record<string, Spot> = { buy_potion: 'SUPPLIES', buy: 'SUPPLIES', buy_pet: 'PETS', summon: 'FORTUNE', upgrade: 'BLACKSMITH', craft: 'BLACKSMITH', store: 'WAREHOUSE', learn: 'TRAINER', accept: 'BOARD', quest: 'BOARD' };
/** NPC quest row click: hand-in / talk target NPC, else where the objective is done (the cows, the nests, the hiding
 *  cat, the shop for a shop action), else out through the gate. */
export function walkToNpcObjective(o: { type: string; target?: string | string[] }, npc: string | null): void {
  if (npc) { walkToNpcQuest(npc); return; }
  if (world.village.area === 'CASTLE') { walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2); return; }
  const p = world.player, t = String(o.target ?? '');
  if (o.type === 'INTERACT') {
    if (t === 'milk') {   // the nearest cow
      let bi = -1, bd = 1e9;
      for (let i = 0; i < animals.length; i++) { if (ANIMALS[i].kind !== 'COW') continue; const d = (animals[i].x - p.pos.x) ** 2 + (animals[i].z - p.pos.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) { walkTo(animals[bi].x, animals[bi].z, 'none', '', 2.2); return; }
    }
    if (t === 'egg') { walkTo(NESTS[1][0], NESTS[1][1] + 1.2, 'none', '', 1.4); return; }
    if (t === 'cat') { walkTo(HIDDEN_CAT.x, HIDDEN_CAT.z, 'none', '', 2.4); return; }
  }
  if (o.type === 'ACTION' && ACTION_SPOT[t]) { walkToSpot(ACTION_SPOT[t]); return; }
  walkTo(GATE.x, GATE.z - 3, 'none', '', 2.2);
}
// After a teleport home from a run: the quest's auto-path starts by itself once the town is in.
let afterArrive: (() => void) | null = null, afterT = 0;
export function walkAfterArrive(fn: () => void): void { afterArrive = fn; afterT = 0.8; }
/** NPC story quest row click: ready -> the NPC who takes it in; talk objective -> that NPC; otherwise out through the gate. */
export function walkToNpcQuest(name: string | null): void {
  const castle = world.village.area === 'CASTLE';
  if (name) {
    const i = NPCS.findIndex((n) => n.name === name);
    if (i >= 0) {
      const inCastle = NPCS[i].area === 'CASTLE';
      if (inCastle === castle) { walkTo(npcs[i].x, npcs[i].z + 1.8, 'npc', '', 2.4, i); return; }
      if (inCastle) { walkTo(CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 'castle', '', 2.4); return; }
      walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2); return;
    }
  }
  if (castle) walkTo(CASTLE_EXIT.x, CASTLE_EXIT.z, 'leave', '', 2);
  else walkTo(GATE.x, GATE.z - 3, 'none', '', 2.2);
}
export const walkAndOpen = (x: number, z: number, tab: ShopTab, r = 1.6): void => walkTo(x, z, 'shop', tab, r);
function arrive(): void {
  const g = world.village.go, st = useGameStore.getState();
  if (g.act === 'shop' && g.tab) st.openSpecificShop(g.tab as ShopTab);
  else if (g.act === 'castle') world.village.pending = 'ENTER';
  else if (g.act === 'leave') world.village.pending = 'LEAVE';
  else if (g.act === 'tower') events.emit('openSetOut', { mode: 'TOWER' });
  else if (g.act === 'npc' && g.npc >= 0) openDialogue(g.npc);
}

const FADE_S = 0.2;   // fade out + fade in = ~0.4 s
/** Swaps the village between the town and the castle throne hall (called at full black). */
function switchArea(to: 'TOWN' | 'CASTLE'): void {
  const p = world.player, v = world.village, C = world.camera;
  closeDialogue();
  for (const b of bubbles) b.active = false;
  p.vel.set(0, 0, 0); p.dashT = 0; p.anim.moveBlend = 0;
  if (to === 'CASTLE') {
    v.area = 'CASTLE';
    for (const c of world.crates) { c.active = false; }
    installInterior(CASTLE_COLLIDERS);
    resetNpcs();
    p.pos.set(CASTLE_SPAWN.x, 0, CASTLE_SPAWN.z); p.facing = Math.PI;
    C.yaw = 0; C.dist = 0.8; C.pitch = CAM_PITCH0;
  } else {
    v.area = 'TOWN';
    generateMap(); placeVillageNodes();   // the normal town setup path (rebuilds town colliders, harvest nodes, NPCs)
    p.pos.set(CASTLE_STEPS.x, 0, CASTLE_STEPS.z); p.facing = 0;
    C.yaw = Math.PI; C.dist = 1; C.pitch = CAM_PITCH0;   // camera north of the hero, looking at the town
  }
  v.areaVer++;
  world.enemyGrid.clear();
}

export function updateVillage(dt: number): void {
  const p = world.player, inp = world.input, v = world.village;
  // area-switch fade: black out, swap the map, fade back in (~0.4 s total)
  if (v.pending) {
    v.fade = Math.min(1, v.fade + dt / FADE_S);
    if (v.fade >= 1) { switchArea(v.pending === 'ENTER' ? 'CASTLE' : 'TOWN'); v.pending = ''; }
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
  } else if (v.pending) { p.vel.x = p.vel.z = 0; } else updatePlayerVillage(dt);
  updatePetTown(dt);
  updateCrates(dt);
  // persistent harvest: a node that just broke is recorded; when every node is gone the 24 h regrow clock starts
  let changed = false;
  const inTown = v.area === 'TOWN';   // (the castle hides the harvest nodes: never record them as harvested)
  for (let i = 0; i < NODES.length && i < MAX_CRATES && inTown; i++) {
    const c = world.crates[i];
    if (!c.active) { c.respawnT = 0; if (harvest.broken.indexOf(i) === -1) { harvest.broken.push(i); changed = true; } }
  }
  if (changed) {
    if (harvest.broken.length >= Math.min(NODES.length, MAX_CRATES) && harvest.clearedAt === 0) harvest.clearedAt = Date.now();
    saveHarvest(harvest);
  }
  if (inTown && harvest.clearedAt > 0 && Date.now() - harvest.clearedAt >= HARVEST_REGROW_MS) {   // regrow while standing in town
    harvest = { broken: [], clearedAt: 0 }; saveHarvest(harvest);
    NODES.forEach((n, i) => { if (i < MAX_CRATES) { const c = world.crates[i]; c.hp = c.maxHp = CRATE_HP[n.kind]; c.active = true; } });
  }
  updatePickups(dt);
  if (updateTownMonsters(dt)) updateEnemies(dt);   // hermit-path monsters (stationary, harmless)
  updateNpcs(dt);
  // click-to-walk arrival (gives up after 10 s, e.g. blocked by a wall)
  const g = v.go;
  if (g.on) {
    g.t += dt;
    const last = g.i >= g.n - 1, rr = last ? g.r : 1.1;
    if (talking || v.pending || g.t > g.tmax) g.on = false;
    else if ((g.x - p.pos.x) ** 2 + (g.z - p.pos.z) ** 2 <= rr * rr) {
      if (!last) { g.i++; g.x = g.wp[g.i * 2]; g.z = g.wp[g.i * 2 + 1]; }
      else { g.on = false; p.vel.x = p.vel.z = 0; arrive(); }
    }
  }

  v.harvestCd = Math.max(0, v.harvestCd - dt);
  // E acts on the NEAREST pill: press = talk / open / set out; press or HOLD = harvest when that nearest thing is a node
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
