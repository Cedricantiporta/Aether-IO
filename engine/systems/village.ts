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
  world.camera.trauma = Math.max(0, world.camera.trauma - dt * 1.5);
  world.time += dt;
  world.frame++;
}
