// ============================================================================
// Village mode (status MENU after the title): the hero walks around the peaceful
// town. No enemies / director / attacks. E = interact with the nearest thing (shop, quest board, NPC to talk
// to, the town gate), hold E near a crystal / ore node (modest, 90 s respawn). NPC behaviour lives
// in npcs.ts, dialogue in dialogue.ts, the layout in ../townData.ts.
// ============================================================================
import { world, QUEST_POS, SHRINE_POS, TRAINER_POS, MAX_CRATES } from '../world';
import { SHOP_POSITIONS } from '../../constants';
import { useGameStore } from '../../store';
import { updatePlayerVillage } from './player';
import { updateCrates, hitCrate } from './crates';
import { updatePickups } from './pickups';
import { CRATE_HP, addTempCollider } from '../mapgen';
import type { ShopTab } from '../../storeTypes';
import { GATE, NPCS, TOWN_COLLIDERS, VILLAGE_NODES } from '../townData';
import { npcs, resetNpcs, updateNpcs, TALK_R } from './npcs';
import { openDialogue, advanceDialogue, dialogueOpen, closeDialogue, useDialogue } from './dialogue';

const INTERACT_R = 7;
const HARVEST_R = 3.6;
/** Resource nodes on the outskirts of the village (crate pool slots 0..n are reused as village nodes; positions in townData). */
const NODES = VILLAGE_NODES;

/** Replaces the island's run crates with the few village harvest nodes. */
export function placeVillageNodes(): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  NODES.forEach((n, i) => {
    if (i >= MAX_CRATES) return;
    const c = world.crates[i];
    c.kind = n.kind; c.pos.set(n.x, 0, n.z); c.maxHp = c.hp = CRATE_HP[n.kind]; c.rot = i * 1.3; c.active = true;
  });
  // houses / stalls / well / fences + posts / lamps / gate towers (mapgen rebuilt its collider grid just before this is called)
  for (const [x, z, r] of TOWN_COLLIDERS) addTempCollider(x, z, r, false);
  resetNpcs();
  closeDialogue();
}

/** One thing the hero can interact with right now (preallocated, nearest first). every pill uses E. */
export interface Interactable { active: boolean; key: 'E' | 'F'; verb: string; label: string; shop: ShopTab | ''; node: number; d2: number; act: Act; }
/** what an E pill does: open a shop panel, talk to NPC `node`, leave through the town gate (harvest = hold E, crate `node`) */
export type Act = 'shop' | 'npc' | 'gate' | 'harvest';
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
const SHOP_LABEL: Record<string, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet House' };

function scanNearby(): void {
  const p = world.player;
  nearbyN = 0;
  if (dialogueOpen()) { for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = false; return; }
  const q = (x: number, z: number) => (x - p.pos.x) ** 2 + (z - p.pos.z) ** 2;
  let d = q(QUEST_POS[0], QUEST_POS[2]); if (d < 36) push('E', 'Read', 'Quest Board', 'QUESTS', -1, d);
  d = q(SHRINE_POS[0], SHRINE_POS[2]); if (d < 36) push('E', 'Pray', 'Aether Altar', 'SUMMON', -1, d);
  d = q(TRAINER_POS[0], TRAINER_POS[2]); if (d < 36) push('E', 'Talk', 'Skill Trainer', 'SKILLS', -1, d);
  for (const s of SHOP_POSITIONS) { d = q(s.position[0], s.position[2]); if (d < INTERACT_R * INTERACT_R) push('E', 'Talk', SHOP_LABEL[s.type] ?? s.type, s.type, -1, d); }
  d = q(GATE.x, GATE.z - 1); if (d < GATE_R * GATE_R) push('E', 'Set out', 'Town Gate', '', -1, d, 'gate');
  for (let i = 0; i < npcs.length; i++) { d = q(npcs[i].x, npcs[i].z); if (d < TALK_R * TALK_R) push('E', 'Talk', NPCS[i].name, '', i, d, 'npc'); }
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
    if (st.isShopOpen || dialogueOpen()) return;
    if (it.act === 'npc') openDialogue(it.node);
    else if (it.act === 'gate') st.startGame();
    else if (it.shop) st.openSpecificShop(it.shop);
    return;
  }
  const c = world.crates[it.node];
  if (c && c.active && v.harvestCd <= 0) { hitCrate(c, 15); v.harvestCd = 0.3; p.anim.attackT = 1; p.facing = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); }
}

export function updateVillage(dt: number): void {
  const p = world.player, inp = world.input, v = world.village;
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
  } else updatePlayerVillage(dt);
  updateCrates(dt);
  updatePickups(dt);
  updateNpcs(dt);

  v.harvestCd = Math.max(0, v.harvestCd - dt);
  // E acts on the NEAREST pill: press = talk / open / set out; press or HOLD = harvest when that nearest thing is a node
  const top = nearby[0];
  if (!talking && top.active) {
    if (top.act === 'harvest') { if (inp.keys.KeyE || inp.pressed.KeyE) interact(top); }
    else if (inp.pressed.KeyE) interact(top);
  }
  scanNearby();
  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.frame++;
}
const useDialogueNpc = (): number => useDialogue.getState().npc;
