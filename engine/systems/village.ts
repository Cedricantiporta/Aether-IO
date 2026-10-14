// ============================================================================
// Village mode (status MENU after the title): the hero walks around the peaceful
// town. No enemies / director / attacks. E = interact with the nearest thing (shop, quest board, NPC to talk
// to, the town gate), hold E near a crystal / ore node outside the gate (they regrow 24 h after the last one is harvested). NPC behaviour lives
// in npcs.ts, dialogue in dialogue.ts, the layout in ../townData.ts.
// ============================================================================
import { world, QUEST_POS, TRAINER_POS, MAX_CRATES } from '../world';
import { SHOP_POSITIONS, SHOP_TAB } from '../../constants';
import { useGameStore } from '../../store';
import { updatePlayerVillage } from './player';
import { updateCrates, hitCrate } from './crates';
import { updatePickups } from './pickups';
import { CRATE_HP, addTempCollider, generateMap, installInterior } from '../mapgen';
import { CASTLE_COLLIDERS, CASTLE_DOOR, CASTLE_EXIT, CASTLE_SPAWN, CASTLE_STEPS } from '../castleData';
import { CAM_PITCH0 } from '../world';
import type { ShopTab } from '../../storeTypes';
import { GATE, NPCS, TOWN_COLLIDERS, VILLAGE_NODES } from '../townData';
import { npcs, bubbles, resetNpcs, updateNpcs, TALK_R } from './npcs';
import { openDialogue, advanceDialogue, dialogueOpen, closeDialogue, useDialogue } from './dialogue';

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
  resetNpcs();
  closeDialogue();
}

/** One thing the hero can interact with right now (preallocated, nearest first). every pill uses E. */
export interface Interactable { active: boolean; key: 'E' | 'F'; verb: string; label: string; shop: ShopTab | ''; node: number; d2: number; act: Act; }
/** what an E pill does: open a shop panel, talk to NPC `node`, leave through the town gate (harvest = hold E, crate `node`) */
export type Act = 'shop' | 'npc' | 'gate' | 'harvest' | 'castle' | 'leave';
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
const SHOP_LABEL: Record<string, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet House', ARMORY: 'Armor Shop', FORTUNE: 'Fortune Teller', WAREHOUSE: 'Warehouse' };

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
    d = q(GATE.x, GATE.z - 1); if (d < GATE_R * GATE_R) push('E', 'Set out', 'Town Gate', '', -1, d, 'gate');
    d = q(CASTLE_DOOR.x, CASTLE_DOOR.z); if (d < CASTLE_DOOR.r * CASTLE_DOOR.r) push('E', 'Enter', 'Castle', '', -1, d, 'castle');
  }
  for (let i = 0; i < npcs.length; i++) { if ((NPCS[i].area === 'CASTLE') !== castle) continue; d = q(npcs[i].x, npcs[i].z); if (d < TALK_R * TALK_R) push('E', 'Talk', NPCS[i].name, '', i, d, 'npc'); }
  if (!castle)
  for (let i = 0; i < world.crates.length; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    d = q(c.pos.x, c.pos.z); if (d < HARVEST_R * HARVEST_R) push('E', 'Harvest', c.kind === 'ORE' ? 'Ore Vein' : c.kind === 'CRYSTAL' ? 'Crystal' : 'Node', '', i, d, 'harvest');
  }
  for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = i < nearbyN;
}

/** Same action as pressing E / F next to the thing (used by the touch interact pills). */
export function interact(it: Interactable): void {
  const st = useGameStore.getState(), v = world.village, p = world.player;
  if (it.act !== 'harvest') {
    if (st.isShopOpen || dialogueOpen() || v.pending) return;
    if (it.act === 'castle') v.pending = 'ENTER';
    else if (it.act === 'leave') v.pending = 'LEAVE';
    else if (it.act === 'npc') openDialogue(it.node);
    else if (it.act === 'gate') st.startGame();
    else if (it.shop) st.openSpecificShop(it.shop);
    return;
  }
  const c = world.crates[it.node];
  if (c && c.active && v.harvestCd <= 0) { hitCrate(c, 15); v.harvestCd = 0.3; p.anim.attackT = 1; p.facing = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); }
}

/** Click on a shop / board from afar: walk the hero to (x, z) and open `tab` on arrival (instantly when already close). */
export function walkAndOpen(x: number, z: number, tab: ShopTab, r = 1.6): void {
  const st = useGameStore.getState(), p = world.player, g = world.village.go;
  if (st.isShopOpen || dialogueOpen() || world.village.pending) return;
  if ((x - p.pos.x) ** 2 + (z - p.pos.z) ** 2 <= r * r) { g.on = false; st.openSpecificShop(tab); return; }
  g.on = true; g.x = x; g.z = z; g.r = r; g.t = 0; g.tab = tab;
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
  if (talking) {
    // frozen in conversation: face the speaker, E / Space advances, opening a panel ends it
    const st0 = useGameStore.getState();
    const n = npcs[useDialogueNpc()];
    if (st0.isShopOpen || st0.isInventoryOpen || st0.isCharacterSheetOpen || st0.isPauseMenuOpen || !n || (n.x - p.pos.x) ** 2 + (n.z - p.pos.z) ** 2 > 64) closeDialogue();
    else {
      p.vel.x = p.vel.z = 0; p.anim.moveBlend *= Math.max(0, 1 - dt * 10);
      if (n) p.facing = Math.atan2(n.x - p.pos.x, n.z - p.pos.z);
      if (inp.pressed.KeyE || inp.pressed.Space) advanceDialogue();
    }
  } else if (v.pending) { p.vel.x = p.vel.z = 0; } else updatePlayerVillage(dt);
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
  updateNpcs(dt);
  // click-to-walk arrival (gives up after 10 s, e.g. blocked by a wall)
  const g = v.go;
  if (g.on) {
    g.t += dt;
    if (talking || v.pending || g.t > 10) g.on = false;
    else if ((g.x - p.pos.x) ** 2 + (g.z - p.pos.z) ** 2 <= g.r * g.r) {
      g.on = false; p.vel.x = p.vel.z = 0;
      p.facing = Math.atan2(g.x - p.pos.x, g.z + 3 - p.pos.z) + Math.PI;   // face the shop (shops face +z)
      useGameStore.getState().openSpecificShop(g.tab as ShopTab);
    }
  }

  v.harvestCd = Math.max(0, v.harvestCd - dt);
  // E acts on the NEAREST pill: press = talk / open / set out; press or HOLD = harvest when that nearest thing is a node
  const top = nearby[0];
  if (!talking && top.active && !v.pending) {
    if (top.act === 'harvest') { if (inp.keys.KeyE || inp.pressed.KeyE) interact(top); }
    else if (inp.pressed.KeyE) interact(top);
  }
  scanNearby();
  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.frame++;
}
const useDialogueNpc = (): number => useDialogue.getState().npc;
