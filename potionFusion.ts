// Potion fusion (Blacksmith > Fuse > Potions): 3 of a tier -> 1 of the next, small gold cost, always succeeds.
// Health: Health -> Big -> Grand. Mana: Mana -> Big -> Grand. Store action: fusePotions (store.ts).
import { GOLD_SCALE } from './constants';

export const POTION_FUSE_COUNT = 3;
export const POTION_FUSE_GOLD = [100 * GOLD_SCALE, 300 * GOLD_SCALE];   // cost per fusion into Big / into Grand
export interface PotionStep { fromName: string; toId: string; gold: number }
/** keyed by the id of the potion being fused */
export const POTION_LADDER: Record<string, PotionStep> = {
  potion_hp: { fromName: 'Health Potion', toId: 'potion_hp_big', gold: POTION_FUSE_GOLD[0] },
  potion_hp_big: { fromName: 'Big Health Potion', toId: 'potion_hp_grand', gold: POTION_FUSE_GOLD[1] },
  potion_mana: { fromName: 'Mana Potion', toId: 'potion_mana_big', gold: POTION_FUSE_GOLD[0] },
  potion_mana_big: { fromName: 'Big Mana Potion', toId: 'potion_mana_grand', gold: POTION_FUSE_GOLD[1] },
};
