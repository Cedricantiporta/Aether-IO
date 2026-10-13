// ============================================================================
// Village mode (status MENU after the title): the hero walks around the peaceful
// town. No enemies / director / attacks. E = interact with a nearby shop or the
// quest board, F = harvest a nearby crystal / ore node (modest, 90 s respawn).
// ============================================================================
import { world, QUEST_POS, SHRINE_POS, TRAINER_POS, MAX_CRATES } from '../world';
import { SHOP_POSITIONS } from '../../constants';
import { useGameStore } from '../../store';
import { updatePlayerVillage } from './player';
import { updateCrates, hitCrate } from './crates';
import { updatePickups } from './pickups';
import { CRATE_HP } from '../mapgen';
import type { ShopTab } from '../../storeTypes';

const INTERACT_R = 7;
const HARVEST_R = 3.6;
/** Resource nodes close to the town (crate pool slots 0..n are reused as village nodes). */
const NODES: { kind: 'CRYSTAL' | 'ORE'; x: number; z: number }[] = [
  { kind: 'CRYSTAL', x: 15, z: -4 }, { kind: 'ORE', x: -15, z: -3 }, { kind: 'CRYSTAL', x: 22, z: 6 }, { kind: 'ORE', x: -21, z: 7 },
];

/** Replaces the island's run crates with the few village harvest nodes. */
export function placeVillageNodes(): void {
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  NODES.forEach((n, i) => {
    if (i >= MAX_CRATES) return;
    const c = world.crates[i];
    c.kind = n.kind; c.pos.set(n.x, 0, n.z); c.maxHp = c.hp = CRATE_HP[n.kind]; c.rot = i * 1.3; c.active = true;
  });
}

/** One thing the hero can interact with right now (preallocated, nearest first). `key` = E (talk/open) or F (harvest). */
export interface Interactable { active: boolean; key: 'E' | 'F'; verb: string; label: string; shop: ShopTab | ''; node: number; d2: number; }
export const MAX_NEARBY = 3;
export const nearby: Interactable[] = Array.from({ length: MAX_NEARBY }, () => ({ active: false, key: 'E', verb: '', label: '', shop: '', node: -1, d2: 0 }));
let nearbyN = 0;
const push = (key: 'E' | 'F', verb: string, label: string, shop: ShopTab | '', node: number, d2: number) => {
  // insertion by distance into a fixed-size list
  let i = nearbyN < MAX_NEARBY ? nearbyN : MAX_NEARBY;
  if (i === MAX_NEARBY) { if (d2 >= nearby[MAX_NEARBY - 1].d2) return; i = MAX_NEARBY - 1; } else nearbyN++;
  while (i > 0 && nearby[i - 1].d2 > d2) { const a = nearby[i], b = nearby[i - 1]; a.key = b.key; a.verb = b.verb; a.label = b.label; a.shop = b.shop; a.node = b.node; a.d2 = b.d2; i--; }
  const t = nearby[i]; t.key = key; t.verb = verb; t.label = label; t.shop = shop; t.node = node; t.d2 = d2;
};
const SHOP_LABEL: Record<string, string> = { SUPPLIES: 'Potion Shop', BLACKSMITH: 'Blacksmith', PETS: 'Pet House' };

function scanNearby(): void {
  const p = world.player;
  nearbyN = 0;
  const q = (x: number, z: number) => (x - p.pos.x) ** 2 + (z - p.pos.z) ** 2;
  let d = q(QUEST_POS[0], QUEST_POS[2]); if (d < 36) push('E', 'Read', 'Quest Board', 'QUESTS', -1, d);
  d = q(SHRINE_POS[0], SHRINE_POS[2]); if (d < 36) push('E', 'Pray', 'Aether Altar', 'SUMMON', -1, d);
  d = q(TRAINER_POS[0], TRAINER_POS[2]); if (d < 36) push('E', 'Talk', 'Skill Trainer', 'SKILLS', -1, d);
  for (const s of SHOP_POSITIONS) { d = q(s.position[0], s.position[2]); if (d < INTERACT_R * INTERACT_R) push('E', 'Talk', SHOP_LABEL[s.type] ?? s.type, s.type, -1, d); }
  for (let i = 0; i < world.crates.length; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    d = q(c.pos.x, c.pos.z); if (d < HARVEST_R * HARVEST_R) push('F', 'Harvest', c.kind === 'ORE' ? 'Ore Vein' : c.kind === 'CRYSTAL' ? 'Crystal' : 'Node', '', i, d);
  }
  for (let i = 0; i < MAX_NEARBY; i++) nearby[i].active = i < nearbyN;
}

/** Same action as pressing E / F next to the thing (used by the touch interact pills). */
export function interact(it: Interactable): void {
  const st = useGameStore.getState(), v = world.village, p = world.player;
  if (it.key === 'E') { if (!st.isShopOpen && it.shop) st.openSpecificShop(it.shop); return; }
  const c = world.crates[it.node];
  if (c && c.active && v.harvestCd <= 0) { hitCrate(c, 15); v.harvestCd = 0.3; p.anim.attackT = 1; p.facing = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z); }
}

export function updateVillage(dt: number): void {
  updatePlayerVillage(dt);
  updateCrates(dt);
  updatePickups(dt);
  const p = world.player, inp = world.input, v = world.village;

  v.harvestCd = Math.max(0, v.harvestCd - dt);
  if (inp.keys.KeyF && v.harvestCd <= 0) {
    let best = null as (typeof world.crates)[number] | null, bd = HARVEST_R * HARVEST_R;
    for (const c of world.crates) {
      if (!c.active) continue;
      const d2 = (c.pos.x - p.pos.x) ** 2 + (c.pos.z - p.pos.z) ** 2;
      if (d2 < bd) { bd = d2; best = c; }
    }
    if (best) { hitCrate(best, 15); v.harvestCd = 0.3; p.anim.attackT = 1; p.facing = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z); }
  }

  if (inp.pressed.KeyE) {
    const st = useGameStore.getState();
    if (st.isShopOpen) return;
    if ((QUEST_POS[0] - p.pos.x) ** 2 + (QUEST_POS[2] - p.pos.z) ** 2 < 36) { st.openSpecificShop('QUESTS'); return; }
    if ((SHRINE_POS[0] - p.pos.x) ** 2 + (SHRINE_POS[2] - p.pos.z) ** 2 < 36) { st.openSpecificShop('SUMMON'); return; }
    if ((TRAINER_POS[0] - p.pos.x) ** 2 + (TRAINER_POS[2] - p.pos.z) ** 2 < 36) { st.openSpecificShop('SKILLS'); return; }
    for (const s of SHOP_POSITIONS) {
      if ((s.position[0] - p.pos.x) ** 2 + (s.position[2] - p.pos.z) ** 2 < INTERACT_R * INTERACT_R) { st.openSpecificShop(s.type); return; }
    }
  }
  scanNearby();
  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.frame++;
}
