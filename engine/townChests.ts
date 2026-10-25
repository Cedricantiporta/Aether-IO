// ============================================================================
// Hidden treasure chests in the town hub (owner 2026-10-25): small toy chests tucked into out-of-the-way nooks of the hub
// (behind rocks and buildings, forest corners, the beach). E opens one (lid swings up), it pays a one-time reward and stays
// open. Opened ids are saved with the hero (store.chestsOpened). Pure data (no imports): townData adds the colliders,
// townFill keeps trees / decor off the spots, render/TownChests draws them, engine/systems/townChestLogic opens them.
// ============================================================================
import type { Rarity } from '../types';

export interface ChestReward {
  gold?: number;                       // final gold paid (already scaled: no GOLD_SCALE applied on top)
  gems?: number;
  crystals?: number;                   // Aether Crystals
  shards?: [Rarity, number];           // crafting shards (store.addMaterial)
  item?: { id: string; qty: number };  // a stackable shop item (potions)
}
export interface TownChest { id: string; x: number; z: number; yaw: number; where: string; reward: ChestReward }

/** Collider radius of a chest (a ~1.5 m toy chest). */
export const CHEST_R = 0.8;
/** The E prompt shows within this distance of a chest's centre. */
export const CHEST_REACH = 2.7;
/** Seconds the lid takes to swing open. */
export const CHEST_OPEN_S = 0.9;

export const TOWN_CHESTS: TownChest[] = [
  { id: 'nw_corner',  x: -43.0, z: -48.4, yaw: 0.5,  where: 'outside the north-west corner tower, by the lake', reward: { gold: 2500, gems: 12 } },
  { id: 'tower_lawn', x: 43.0,  z: 147.0, yaw: -2.4, where: 'the forest lawn north-east of the Endless Tower',    reward: { gold: 1500, crystals: 3 } },
  { id: 'pumpkin_w',  x: -40.8, z: 113.2, yaw: 0.9,  where: 'the dark forest corner west of the pumpkin field',   reward: { gold: 1800, gems: 8, item: { id: 'potion_hp_big', qty: 2 } } },
  { id: 'beach_n',    x: -51.0, z: -4.6,  yaw: 1.6,  where: 'the north end of the beach, by the headland rocks',  reward: { gold: 1200, shards: ['RARE', 3] } },
  { id: 'east_stair', x: 41.2,  z: -11.2, yaw: -1.6, where: 'behind the green house at the tavern-row side stairs', reward: { gold: 4000, gems: 5 } },
  { id: 'bridge_sw',  x: -8.9,  z: 78.6,  yaw: 0.3,  where: 'the nook at the south-west end of the great bridge', reward: { crystals: 2, gold: 1000, item: { id: 'potion_mana_big', qty: 2 } } },
  { id: 'grave_nw',   x: -39.8, z: -36.6, yaw: 2.6,  where: 'the north-west corner of the graveyard',             reward: { gold: 2000, gems: 10, shards: ['EPIC', 2] } },
  { id: 'farm_grove', x: 60.2,  z: 97.5,  yaw: -2.2, where: 'the grove corner east of the farm',                  reward: { gold: 3000, gems: 20 } },
];
