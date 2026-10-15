// ============================================================================
// Run structure data (pure, no side effects): biomes, room types, rewards, depth scaling, portal choices.
// A run = biomes of ROOMS_PER_BIOME rooms followed by a boss room. See docs/RUN_DESIGN.md.
// ============================================================================
import type { EnemyKind, ObstacleKind, CrateKind, RoomPlan, RoomType, RewardKind, RoomObjective, RoomTwist } from './types';
import type { BossKind } from './enemyDefs';
import type { Rarity } from '../types';
import { GATES, GATE_KEYS_NEEDED, gateState } from './gates';

export const ROOMS_PER_BIOME = 14;         // normal rooms before the boss room (room index ROOMS_PER_BIOME): 15 depths per biome
export const BOSS_INDEX = ROOMS_PER_BIOME;   // the biome boss: depth 15
export const PREBOSS_INDEX = 9;              // the pre-boss: depth 10 (Meadow: the Slime King; elsewhere a biome champion)
export const REST_INDEX = ROOMS_PER_BIOME - 1; // the room before the boss is always a fountain / merchant
/** Depth shown to the player (1-based, 15 per biome). */
export const shownDepth = (biome: number, index: number): number => biome * (BOSS_INDEX + 1) + index + 1;

/** Depth scaling: feeds waveHpMult / waveDmgMult / budget. Boss room of biome b = 10 * (b + 1). */
export function depthWave(biome: number, index: number): number {
  if (index >= BOSS_INDEX) return 10 * (biome + 1);
  return biome * 10 + 1 + Math.round(index * 0.65);   // (difficulty curve unchanged: 15 rooms span the same 10 waves)
}

/** Ground look family (render/Room.tsx picks the detail texture + colour pattern). */
export type GroundStyle = 'GRASS' | 'MARBLE' | 'SAND' | 'SNOW' | 'BASALT' | 'VOID';
export type BiomeHazard = 'PUDDLE' | 'GAS' | 'QUICKSAND' | null;
export type LiquidKind = 'WATER' | 'LAVA' | 'CHASM' | 'ICE';

/** A depth tier of a biome: depths 1-5, 6-10, 11-15 each get their own look (and light). */
export interface BiomeVariant {
  name: string;
  ground: [string, string]; patch: [string, string, string]; edge?: string; propTint?: string;
  border: ObstacleKind[]; interior: ObstacleKind[]; hazard: BiomeHazard;
  // optional light overrides (else the biome's)
  fog?: string; hemiSky?: string; hemiGround?: string; hemiI?: number; sun?: string; sunI?: number; skyTint?: [number, number, number];
  layouts?: [number, number, number, number, number];   // stage layout weights override
  lakeScale?: number;                                     // lake / pool size multiplier
}

export interface BiomeDef {
  name: string;
  style: GroundStyle;
  ground: [string, string];      // ground vertex-colour noise endpoints
  patch: [string, string, string]; // big colour zones: [lush, dry, dirt]
  stone: string;                 // path / slab stone
  edge: string;                  // floor beyond the walls
  fog: string;
  hemiSky: string; hemiGround: string; hemiI: number;
  sun: string; sunI: number;
  skyTint: [number, number, number]; // multiplies the sky dome
  propTint: string;              // multiplies prop colours
  border: ObstacleKind[];        // walls ring
  outer?: ObstacleKind[];        // decorative outer ring (defaults to border)
  interior: ObstacleKind[];      // scattered obstacles
  hazard: BiomeHazard;
  /** Liquid of river / lake stages: water, lava, a chasm (bottomless) or icy water. */
  river: LiquidKind;
  lake: LiquidKind;
  /** Stage layout weights [PLAIN, BIG, LONG, RIVER, LAKE] for fight rooms. */
  layouts: [number, number, number, number, number];
  /** Outline weights for fight rooms (interior biomes prefer halls). */
  shapes?: [string, number][];
  towers: boolean;               // goblin archer towers appear in fight rooms
  hydras: boolean;               // lake stages hide lurking hydras
  variants?: BiomeVariant[];
  lavaSea?: boolean;             // the floor beyond the walls drops into a lava sea (Ember Wastes)
  crates: CrateKind[];
  boss: BossKind;
  minis: string[];               // keys of enemyDefs.MINI_BOSSES
  lichCrypt: boolean;            // the Lich may appear as a mini-boss here
  roster: readonly (readonly [EnemyKind, number, number])[]; // kind, weight, first room index
}

export const BIOMES: readonly BiomeDef[] = [
  { // 0 Greenwood: the old Meadow / Old Grove / Mire looks as three room variants of one forest biome (Elderroot, the Slime King)
    name: 'Greenwood', style: 'GRASS', ground: ['#3f9c34', '#76c648'], patch: ['#5fb83e', '#b7c45a', '#8f7448'], stone: '#a39d90', edge: '#2a4a22', fog: '#cfe6f2',
    hemiSky: '#cfe8ff', hemiGround: '#6f8f45', hemiI: 1.25, sun: '#fff0d2', sunI: 3.1, skyTint: [1, 1, 1], propTint: '#ffffff',
    border: ['TREE', 'PINE', 'TREE', 'ROCK'], interior: ['ROCK', 'STUMP', 'LOG', 'TREE', 'ROCK'], hazard: null,
    river: 'WATER', lake: 'WATER', layouts: [40, 14, 10, 20, 16], towers: true, hydras: true,
    variants: [
      { name: 'Sunlit Meadow', ground: ['#43a236', '#7ccc4a'], patch: ['#62bc40', '#bcc85c', '#8f7448'], propTint: '#ffffff',
        border: ['TREE', 'PINE', 'TREE', 'ROCK'], interior: ['ROCK', 'STUMP', 'LOG', 'TREE', 'ROCK'], hazard: null, hemiI: 1.35, sunI: 3.3 },
      { name: 'Deep Grove', ground: ['#2b6a2f', '#4a8a3a'], patch: ['#3a8a3a', '#7d8a3e', '#5a4630'], edge: '#16301a', propTint: '#c8e0b8',
        border: ['PINE', 'TREE', 'PINE', 'TREE', 'PINE'], interior: ['STUMP', 'LOG', 'RUIN', 'ROCK', 'PINE'], hazard: null,
        fog: '#8faa98', hemiSky: '#b8d0c8', hemiGround: '#3a5a2a', hemiI: 1.0, sun: '#ffe2b0', sunI: 2.3, skyTint: [0.72, 0.82, 0.78] },
      { name: 'Darkwood', ground: ['#22402a', '#335430'], patch: ['#2e4a2a', '#4a5030', '#2e2418'], edge: '#0a140c', propTint: '#90a888',
        border: ['DEAD_TREE', 'PINE', 'DEAD_TREE', 'TREE', 'ROCK'], interior: ['STUMP', 'LOG', 'DEAD_TREE', 'ROCK', 'RUIN'], hazard: 'PUDDLE',
        fog: '#4e6254', hemiSky: '#a4bcc8', hemiGround: '#2e4026', hemiI: 1.05, sun: '#d8e2f2', sunI: 2.2, skyTint: [0.5, 0.6, 0.6] },   // dim, not black: glowing mushrooms light it (Room.tsx)
    ],
    crates: ['CRATE', 'BARREL', 'POT', 'POT', 'HAY'],
    boss: 'BOSS_TREANT', minis: ['TUSK', 'CAPTAIN'], lichCrypt: false,
    roster: [['SLIME', 10, 0], ['GOBLIN', 9, 0], ['BAT', 5, 1], ['BOAR', 4, 1], ['SKELETON_ARCHER', 4, 2], ['BANDIT', 3, 3], ['BOMBER', 3, 4], ['ZOMBIE', 2, 6], ['SPLITTER', 2, 7], ['DIREWOLF', 5, 2], ['SPORECAP', 4, 3]],
  },
  { // 1 Marble Halls: the ruined castle of the old kings, its halls cracked by Gorath's tread (Gorath the Mountain).
    // Inside the castle: flagstone floors with a worn red carpet, broken curtain walls with torches, banners and arched
    // windows, toppled pillars and rubble. No water stages here (user request).
    name: 'Marble Halls', style: 'MARBLE', ground: ['#7c766c', '#958f83'], patch: ['#8a8478', '#6a655c', '#4f5a3c'], stone: '#a39d90', edge: '#0c0a08', fog: '#241d17',
    hemiSky: '#ffd9a8', hemiGround: '#3a2e24', hemiI: 0.95, sun: '#ffcf96', sunI: 2.2, skyTint: [0.3, 0.25, 0.22], propTint: '#ffffff',
    border: ['CASTLEWALL'], outer: ['CASTLEWALL', 'COLUMN'], interior: ['COLUMN', 'STATUE', 'BRAZIER', 'RUIN', 'COLUMN', 'LOWWALL', 'BRAZIER'], hazard: null,
    river: 'WATER', lake: 'WATER', layouts: [46, 24, 30, 0, 0], towers: false, hydras: false,
    variants: [
      { name: 'Outer Ward', ground: ['#7c766c', '#958f83'], patch: ['#8a8478', '#6a655c', '#4f5a3c'],
        border: ['CASTLEWALL'], interior: ['COLUMN', 'STATUE', 'BRAZIER', 'RUIN', 'COLUMN', 'LOWWALL', 'BRAZIER'], hazard: null },
      { name: 'Broken Hall', ground: ['#736d62', '#8a8476'], patch: ['#7a7468', '#5e594f', '#4a5a36'], propTint: '#e8e4dc',
        border: ['CASTLEWALL'], interior: ['RUIN', 'COLUMN', 'LOWWALL', 'RUIN', 'STATUE', 'BRAZIER', 'BOULDER'], hazard: null,
        hemiI: 0.9, sunI: 2.0 },
      { name: 'Fallen Keep', ground: ['#5e5a4e', '#6e6a5a'], patch: ['#5a6040', '#504a40', '#3e5a2e'], propTint: '#d0d4c0',
        border: ['CASTLEWALL'], interior: ['RUIN', 'DEAD_TREE', 'LOWWALL', 'BOULDER', 'COLUMN', 'TREE', 'RUIN'], hazard: null,
        fog: '#2e3028', hemiSky: '#d8e0c8', hemiGround: '#2e3424', hemiI: 1.1, sun: '#e8f0d8', sunI: 2.6, skyTint: [0.45, 0.48, 0.42] },
    ],
    shapes: [['RECT', 30], ['HEX', 12], ['OCT', 16], ['CROSS', 18], ['ROUND', 8], ['SEMI', 8], ['ELLIPSE', 8]],
    crates: ['POT', 'POT', 'CRATE', 'GRAVE', 'BARREL'],
    boss: 'BOSS_GOLEM', minis: ['PHALANX', 'WARDEN'], lichCrypt: true,
    roster: [['SKELETON_ARCHER', 8, 0], ['SHIELDBEARER', 6, 0], ['CULTIST', 6, 0], ['GOBLIN', 5, 0], ['BAT', 4, 0], ['WRAITH', 5, 1], ['ZOMBIE', 4, 1], ['SPLITTER', 3, 2], ['BRUTE', 3, 3], ['HAUNTED_ARMOR', 6, 0], ['GARGOYLE', 5, 1]],
  },
  { // 2 Sunscorch Desert: dunes, cacti, sandstone, bleached bones, quicksand, canyon chasms; oases hide the hydra (The Mire Hydra)
    name: 'Sunscorch Desert', style: 'SAND', ground: ['#d9b46a', '#efd08a'], patch: ['#e8c47a', '#c99a55', '#b07a40'], stone: '#c8a070', edge: '#a8824a', fog: '#f0d6a4',
    hemiSky: '#ffe8c0', hemiGround: '#b08850', hemiI: 1.35, sun: '#fff0c8', sunI: 3.4, skyTint: [1.12, 1.0, 0.82], propTint: '#ffffff',
    border: ['SANDSTONE', 'CACTUS', 'ROCK', 'SANDSTONE', 'CACTUS'], interior: ['CACTUS', 'BONES', 'SANDSTONE', 'ROCK', 'CACTUS', 'BONES'], hazard: 'QUICKSAND',
    river: 'CHASM', lake: 'WATER', layouts: [34, 20, 12, 14, 20], towers: true, hydras: true,
    variants: [
      { name: 'Golden Dunes', ground: ['#d9b46a', '#efd08a'], patch: ['#e8c47a', '#c99a55', '#b07a40'],
        border: ['SANDSTONE', 'CACTUS', 'ROCK', 'SANDSTONE', 'CACTUS'], interior: ['CACTUS', 'BONES', 'SANDSTONE', 'ROCK', 'CACTUS', 'BONES'], hazard: 'QUICKSAND' },
      { name: 'Buried Ruins', ground: ['#d0a862', '#e6c47e'], patch: ['#dcb470', '#b88a4c', '#a07040'],
        border: ['SANDSTONE', 'RUIN', 'COLUMN', 'SANDSTONE', 'ROCK'], interior: ['RUIN', 'COLUMN', 'SANDSTONE', 'STATUE', 'CACTUS', 'RUIN'], hazard: 'QUICKSAND',
        hemiI: 1.25, sun: '#ffe4b0', sunI: 3.1 },
      { name: 'Bone Wastes', ground: ['#c08850', '#d8a466'], patch: ['#c89458', '#a87040', '#7a4a2a'], edge: '#7a5030', propTint: '#f0d8c0',
        border: ['SANDSTONE', 'DEAD_TREE', 'ROCK', 'BONES', 'SANDSTONE'], interior: ['BONES', 'DEAD_TREE', 'BONES', 'ROCK', 'SANDSTONE', 'RUIN'], hazard: 'QUICKSAND',
        fog: '#d89a6a', hemiSky: '#ffc890', hemiGround: '#8a5a30', hemiI: 1.15, sun: '#ffa868', sunI: 2.7, skyTint: [1.08, 0.78, 0.6] },
    ],
    crates: ['POT', 'POT', 'BARREL', 'CRATE', 'GRAVE'],
    boss: 'BOSS_HYDRA', minis: ['CAPTAIN', 'SHELLBACK'], lichCrypt: false,
    roster: [['SCARAB', 8, 0], ['BANDIT', 7, 0], ['SKELETON_ARCHER', 5, 0], ['BOMBER', 5, 0], ['ZOMBIE', 5, 1], ['ROCK_CRAB', 4, 1], ['SHIELDBEARER', 4, 2], ['BRUTE', 3, 3], ['SCORPION', 7, 0], ['MUMMY', 6, 1]],
  },
  { // 3 Frostpeak: snowfields, ice rocks, frozen rivers and lakes of black water
    name: 'Frostpeak', style: 'SNOW', ground: ['#cfe0ee', '#f2f8fd'], patch: ['#e8f2fb', '#b9c7d4', '#9aa6b2'], stone: '#a8b4c2', edge: '#aab9c8', fog: '#dbe9f5',
    hemiSky: '#e0f0ff', hemiGround: '#9ab0c8', hemiI: 1.4, sun: '#e8f4ff', sunI: 3.0, skyTint: [0.88, 0.97, 1.1], propTint: '#dff0ff',
    border: ['PINE', 'BOULDER', 'PINE', 'ICE_ROCK', 'CRYSTAL_SPIRE'], interior: ['ICE_ROCK', 'ROCK', 'CRYSTAL_SPIRE', 'BOULDER', 'PINE'], hazard: null,
    river: 'ICE', lake: 'ICE', layouts: [36, 16, 12, 18, 18], towers: false, hydras: true,
    variants: [
      { name: 'Snowfield', ground: ['#cfe0ee', '#f2f8fd'], patch: ['#e8f2fb', '#b9c7d4', '#9aa6b2'],
        border: ['PINE', 'BOULDER', 'PINE', 'ICE_ROCK', 'CRYSTAL_SPIRE'], interior: ['ICE_ROCK', 'ROCK', 'CRYSTAL_SPIRE', 'BOULDER', 'PINE'], hazard: null },
      { name: 'Frostbite Pass', ground: ['#b8d4ea', '#dcecf8'], patch: ['#cfe4f6', '#9ec0dc', '#8aa0b4'], propTint: '#cfe6ff',
        border: ['ICE_ROCK', 'PINE', 'ICE_ROCK', 'BOULDER', 'CRYSTAL_SPIRE'], interior: ['ICE_ROCK', 'ICE_ROCK', 'CRYSTAL_SPIRE', 'BOULDER', 'PINE'], hazard: null,
        fog: '#c4dcf0', hemiSky: '#d0e8ff', hemiI: 1.3, sun: '#d8ecff', sunI: 2.7, skyTint: [0.8, 0.92, 1.12] },
      { name: 'Glacier Heart', ground: ['#94c4e6', '#c4e2f8'], patch: ['#a8d4f2', '#7ab0d8', '#6a8ea8'], edge: '#5a86a8', propTint: '#b8dcff',
        border: ['ICE_ROCK', 'CRYSTAL_SPIRE', 'ICE_ROCK', 'CRYSTAL_SPIRE'], interior: ['CRYSTAL_SPIRE', 'ICE_ROCK', 'ICE_ROCK', 'CRYSTAL_SPIRE', 'BOULDER'], hazard: null,
        fog: '#9cc4e4', hemiSky: '#b8dcff', hemiGround: '#5a80a8', hemiI: 1.2, sun: '#c0dcff', sunI: 2.4, skyTint: [0.66, 0.84, 1.15] },
    ],
    crates: ['CRATE', 'BARREL', 'POT', 'POT'],
    boss: 'BOSS_WYRM', minis: ['SHELLBACK', 'BEHEMOTH'], lichCrypt: false,
    roster: [['GOBLIN', 6, 0], ['SKELETON_ARCHER', 7, 0], ['WRAITH', 6, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 4, 0], ['ROCK_CRAB', 5, 1], ['SHIELDBEARER', 3, 2], ['BRUTE', 4, 2], ['ZOMBIE', 3, 3], ['FROST_WISP', 7, 0], ['YETI', 4, 1]],
  },
  { // 4 Ember Wastes: islands of plain dark-brown rock in a sea of lava (the floor beyond the walls drops into it); lava
    // rivers sink into channels, lava pools lie flat and irregular and grow with depth
    name: 'Ember Wastes', style: 'BASALT', ground: ['#3c2a20', '#523b2a'], patch: ['#4a3426', '#634530', '#2a1d15'], stone: '#6e625c', edge: '#1e1210', fog: '#7a3c2c',
    hemiSky: '#ffd0b0', hemiGround: '#4a2e20', hemiI: 1.1, sun: '#ffd0a8', sunI: 2.8, skyTint: [1.1, 0.7, 0.55], propTint: '#c8a088',
    border: ['OBSIDIAN', 'BOULDER', 'ROCK', 'OBSIDIAN', 'ROCK'], interior: ['OBSIDIAN', 'ROCK', 'DEAD_TREE', 'BOULDER', 'ROCK'], hazard: null,
    river: 'LAVA', lake: 'LAVA', layouts: [34, 14, 10, 22, 20], towers: false, hydras: false, lavaSea: true,
    variants: [
      { name: 'Ashen Slopes', ground: ['#3e2c22', '#54402e'], patch: ['#4a3628', '#66483a', '#2c1f16'],
        border: ['BOULDER', 'ROCK', 'OBSIDIAN', 'ROCK'], interior: ['ROCK', 'BOULDER', 'DEAD_TREE', 'ROCK', 'OBSIDIAN'], hazard: null,
        layouts: [36, 16, 10, 18, 20], lakeScale: 1 },
      { name: 'Magma Fields', ground: ['#3a2820', '#4e3828'], patch: ['#463024', '#6a4430', '#281a12'],
        border: ['OBSIDIAN', 'BOULDER', 'ROCK', 'OBSIDIAN'], interior: ['OBSIDIAN', 'ROCK', 'BOULDER', 'DEAD_TREE', 'ROCK'], hazard: 'GAS',
        layouts: [22, 14, 8, 20, 36], lakeScale: 1.3, hemiI: 1.05, sunI: 2.8 },
      { name: 'Molten Core', ground: ['#34221a', '#463024'], patch: ['#40281e', '#5e3a26', '#22160e'], edge: '#140a08', propTint: '#b88068',
        border: ['OBSIDIAN', 'OBSIDIAN', 'BOULDER', 'ROCK'], interior: ['OBSIDIAN', 'OBSIDIAN', 'ROCK', 'BOULDER'], hazard: 'GAS',
        layouts: [12, 14, 6, 22, 46], lakeScale: 1.6, fog: '#6a2a1c', hemiSky: '#ffb090', hemiGround: '#40200f', hemiI: 1.0, sun: '#ffb080', sunI: 2.5, skyTint: [1.15, 0.6, 0.45] },
    ],
    crates: ['EXPLOSIVE_BARREL', 'BARREL', 'CRATE', 'POT'],
    boss: 'BOSS_WARLORD', minis: ['CAPTAIN', 'SHELLBACK'], lichCrypt: false,
    roster: [['BOMBER', 7, 0], ['BANDIT', 6, 0], ['CULTIST', 6, 0], ['SCARAB', 5, 0], ['GOBLIN', 5, 0], ['BAT', 3, 0], ['BRUTE', 5, 1], ['SPLITTER', 4, 1], ['ROCK_CRAB', 4, 2], ['HELLHOUND', 7, 0], ['CINDER_SHAMAN', 6, 1]],
  },
  { // 5 The Void: floating shards over the abyss (chasms and pits)
    name: 'The Void', style: 'VOID', ground: ['#3a2c5e', '#56448a'], patch: ['#4a3878', '#66489a', '#2a2048'], stone: '#6e6890', edge: '#1a1430', fog: '#3a2e66',
    hemiSky: '#ab98ec', hemiGround: '#40306e', hemiI: 1.6, sun: '#c4b4ff', sunI: 3.0, skyTint: [0.55, 0.45, 0.85], propTint: '#a090d0',
    border: ['CRYSTAL_SPIRE', 'BOULDER', 'CRYSTAL_SPIRE', 'RUIN'], interior: ['CRYSTAL_SPIRE', 'RUIN', 'STATUE', 'BOULDER', 'CRYSTAL_SPIRE'], hazard: null,
    river: 'CHASM', lake: 'CHASM', layouts: [30, 14, 10, 22, 24], towers: false, hydras: false,
    variants: [
      { name: 'Rift Edge', ground: ['#3e2e66', '#5c4492'], patch: ['#4c3a7e', '#6a46a0', '#2c2050'], propTint: '#b0a0e0',
        border: ['CRYSTAL_SPIRE', 'BOULDER', 'CRYSTAL_SPIRE', 'RUIN'], interior: ['CRYSTAL_SPIRE', 'RUIN', 'STATUE', 'BOULDER', 'CRYSTAL_SPIRE'], hazard: null,
        hemiI: 1.7, sunI: 3.1 },
      { name: 'Shattered Expanse', ground: ['#382a5a', '#52408a'], patch: ['#463674', '#62469a', '#261c44'], propTint: '#a090d0',
        border: ['CRYSTAL_SPIRE', 'RUIN', 'BOULDER', 'RUIN'], interior: ['RUIN', 'CRYSTAL_SPIRE', 'BOULDER', 'RUIN', 'STATUE'], hazard: null,
        layouts: [22, 14, 8, 26, 30], lakeScale: 1.25 },
      { name: 'The Abyss', ground: ['#30244e', '#4a3678'], patch: ['#3e2e68', '#5a3a8a', '#201838'], edge: '#120c24', propTint: '#9888d4',
        border: ['CRYSTAL_SPIRE', 'CRYSTAL_SPIRE', 'BOULDER'], interior: ['CRYSTAL_SPIRE', 'CRYSTAL_SPIRE', 'RUIN', 'BOULDER'], hazard: null,
        layouts: [18, 12, 8, 28, 34], lakeScale: 1.45, fog: '#2e2456', hemiSky: '#a08ae8', hemiGround: '#32265a', hemiI: 1.5, sun: '#b8a2ff', sunI: 2.9, skyTint: [0.5, 0.42, 0.78] },
    ],
    crates: ['CRATE', 'POT', 'POT', 'GRAVE'],
    boss: 'BOSS_VOID', minis: ['BEHEMOTH', 'WARDEN', 'PHALANX'], lichCrypt: true,
    roster: [['WRAITH', 8, 0], ['CULTIST', 7, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 5, 0], ['SHIELDBEARER', 4, 1], ['BRUTE', 4, 1], ['ZOMBIE', 4, 1], ['SPLITTER', 4, 2], ['BOMBER', 4, 2], ['VOID_STALKER', 7, 0], ['VOID_EYE', 6, 1]],
  },
];

/** Depth tier look of a biome: depths 1-5 -> variant 0, 6-10 -> 1, 11-15 (incl. the boss) -> 2. */
export function variantOf(def: BiomeDef, index: number): BiomeVariant | null {
  if (!def.variants || def.variants.length === 0) return null;
  return def.variants[Math.min(def.variants.length - 1, Math.max(0, Math.floor(index / 5)))];
}

export const biomeOf = (biome: number): BiomeDef => BIOMES[biome % BIOMES.length];
/** Which loop of the six biomes this is (0 = first time through). Harder each loop through depth scaling. */
export const loopOf = (biome: number): number => Math.floor(biome / BIOMES.length);

export const TYPE_NAME: Record<RoomType, string> = {
  COMBAT: 'Skirmish', ELITE: 'Elite Hunt', MINIBOSS: 'Champion', FOUNTAIN: 'Fountain', MERCHANT: 'Merchant', TREASURE: 'Treasure', SHRINE: 'Shrine', CRYSTAL: 'Crystal Cavern', BOSS: 'Boss', CAMP: 'Camp',
  DUEL: 'Champion Duel', GATEKEEPER: 'The Gatekeeper',
};
export const REWARD_NAME: Record<RewardKind, string> = {
  CARD: 'Upgrade', GOLD: 'Gold', SHARDS: 'Shards', ITEM: 'Gear', HEAL: 'Vitality', GEMS: 'Gems', NONE: '',
};
/** Portal label: [title, subtitle, icon key, css colour]. Icons are mapped by ui/room (lucide). */
export function portalLabel(plan: RoomPlan, biome: number): { title: string; sub: string; icon: string; color: string } {
  if (plan.gate !== undefined) {   // the next room of a Gatekeeper trial
    const g = GATES[plan.gate];
    return { title: g.name, sub: `Trial room ${(plan.step ?? 0) + 1}/${g.steps.length}`, icon: plan.type === 'BOSS' ? 'boss' : 'shrine', color: g.color };
  }
  switch (plan.type) {
    case 'GATEKEEPER': return { title: 'The Gatekeeper', sub: `Gate Keys ${gateState.keys}/${GATE_KEYS_NEEDED}`, icon: 'shrine', color: '#c9a2ff' };
    case 'FOUNTAIN': return { title: 'Fountain', sub: '', icon: 'fountain', color: '#5fd6ff' };
    case 'MERCHANT': return { title: 'Merchant', sub: '', icon: 'merchant', color: '#f2c14e' };
    case 'CAMP': return { title: 'Camp', sub: '', icon: 'fountain', color: '#9bd26a' };
    case 'BOSS': return { title: 'Boss', sub: biomeOf(biome).name, icon: 'boss', color: '#ef6a5e' };
    case 'TREASURE': return { title: 'Treasure', sub: '', icon: 'chest', color: '#f2c14e' };
    case 'SHRINE': return { title: 'Shrine', sub: '', icon: 'shrine', color: '#c084fc' };
    case 'CRYSTAL': return { title: 'Crystal Cavern', sub: '', icon: 'gem', color: '#7fd8ff' };
    default: break;
  }
  const r = REWARD_ICON[plan.reward];
  const parts: string[] = [];
  if (plan.obj) parts.push(OBJ_NAME[plan.obj]);
  else if (plan.type === 'ELITE') parts.push('Elite');
  else if (plan.type === 'MINIBOSS') parts.push('Champion');
  else if (plan.type === 'DUEL') parts.push('Dark Champion duel');
  if (plan.twist) parts.push(TWIST_NAME[plan.twist]);
  return { title: REWARD_NAME[plan.reward], sub: parts.join(' · '), icon: r.icon, color: r.color };
}
const REWARD_ICON: Record<RewardKind, { icon: string; color: string }> = {
  CARD: { icon: 'card', color: '#6ab0ff' }, GOLD: { icon: 'coins', color: '#fbbf24' }, SHARDS: { icon: 'shard', color: '#c084fc' },
  ITEM: { icon: 'gear', color: '#fb923c' }, HEAL: { icon: 'heart', color: '#5fd68e' }, GEMS: { icon: 'gem', color: '#22d3ee' }, NONE: { icon: 'card', color: '#ffffff' },
};

// ----------------------------------------------------------------- planning --
const pick = <T,>(opts: readonly (readonly [T, number])[]): T => {
  let r = Math.random() * opts.reduce((n, o) => n + o[1], 0);
  for (const [v, w] of opts) { r -= w; if (r <= 0) return v; }
  return opts[0][0];
};

function rollReward(type: RoomType): RewardKind {
  switch (type) {
    case 'ELITE': return pick<RewardKind>([['CARD', 45], ['ITEM', 35], ['GEMS', 10], ['SHARDS', 10]]);
    case 'MINIBOSS': case 'DUEL': return pick<RewardKind>([['ITEM', 45], ['CARD', 45], ['GEMS', 10]]);
    case 'COMBAT': return pick<RewardKind>([['CARD', 40], ['GOLD', 18], ['SHARDS', 14], ['ITEM', 14], ['HEAL', 8], ['GEMS', 6]]);
    default: return 'NONE'; // fountain / merchant / treasure / shrine / boss carry their own content
  }
}

/** Share of champion doors that become a dark hero duel (a solo fight in a ring arena). */
export const DUEL_CHANCE = 0.35;
/** Set by the main story (storyLogic) while its current step wants captives freed / champions slain: rescue
 *  objectives and champion doors then show up more often, so the errand does not depend on luck. */
export const storyBias = { rescue: false, champion: false };
const plan = (type: RoomType, next = 0): RoomPlan => {
  if (type === 'MINIBOSS' && Math.random() < DUEL_CHANCE) type = 'DUEL';
  const p: RoomPlan = { type, reward: rollReward(type) };
  // from the 3rd room on: some fights carry an objective and / or a twist (shown on the portal)
  if (next >= 2 && (type === 'COMBAT' || type === 'ELITE')) {
    if (type === 'COMBAT' && Math.random() < (storyBias.rescue ? 0.55 : 0.35)) p.obj = pick<RoomObjective>([['DEFEND', 30], ['RESCUE', storyBias.rescue ? 110 : 25], ['GOBLIN', 25], ['HUNT', 20]]);
    if (Math.random() < 0.3) p.twist = pick<RoomTwist>([['TRAPS', 35], ['DARK', 25], ['CURSED', 20], ['GOLDEN', 20]]);
  }
  return p;
};
export const OBJ_NAME: Record<RoomObjective, string> = { DEFEND: 'Defend the Totem', RESCUE: 'Rescue the Captive', GOBLIN: 'Treasure Goblin', HUNT: 'Bounty Hunt' };
export const TWIST_NAME: Record<RoomTwist, string> = { DARK: 'Darkness', CURSED: 'Cursed Ground', TRAPS: 'Spike Traps', GOLDEN: 'Golden Hour' };
export const TWIST_DESC: Record<RoomTwist, string> = {
  DARK: 'The light is failing: you only see what is close.', CURSED: 'Healing is weak here, but the clear pays gems.',
  TRAPS: 'Spikes burst from the floor: watch for the red glow.', GOLDEN: 'Monsters drop extra gold.',
};

/**
 * The 1..3 rooms the exits of room `index` lead to (never repeated types). Room 0 of a biome is always a skirmish,
 * the room before the boss is a fountain and/or merchant, and the last normal room leads to the boss.
 */
export function nextChoices(biome: number, index: number, out: RoomPlan[], merchantOk = true, fountainOk = true, shrineOk = true, crystal = false, bossKey = false): number {
  out.length = 0;
  const next = index + 1;
  if (next >= BOSS_INDEX) { out.push({ type: 'BOSS', reward: 'NONE' }); return 1; }
  if (next === PREBOSS_INDEX) { out.push({ type: 'MINIBOSS', reward: 'ITEM', preboss: true }); return 1; }
  // the boss key was found: a boss door opens beside the usual ones (fight early, or keep exploring)
  if (bossKey && next > PREBOSS_INDEX) { const n = nextChoices(biome, index, out, merchantOk, fountainOk, shrineOk, crystal, false); if (n >= 3) out.pop(); out.unshift({ type: 'BOSS', reward: 'NONE' }); return out.length; }
  if (next === REST_INDEX) {
    if (fountainOk) out.push({ type: 'FOUNTAIN', reward: 'NONE' });
    if (merchantOk && (!fountainOk || Math.random() < 0.55)) out.push({ type: 'MERCHANT', reward: 'NONE' });
    if (out.length === 0) out.push(plan('COMBAT', next));
    return out.length;
  }
  const n = pick<number>([[1, 15], [2, 50], [3, 35]]);
  const used = new Set<RoomType>();
  for (let i = 0; i < n; i++) {
    const t = pick<RoomType>([
      ['COMBAT', i === 0 ? 100 : 50], ['ELITE', next >= 2 ? 16 : 0], ['MINIBOSS', next >= 3 ? (storyBias.champion ? 28 : 9) : 0], ['TREASURE', 9], ['SHRINE', next >= 2 && shrineOk ? 9 : 0],
      ['FOUNTAIN', next >= 2 && fountainOk ? 8 : 0], ['MERCHANT', next >= 2 && merchantOk ? 8 : 0],
    ]);
    // reward kinds may repeat between two combat doors, but special rooms only once per set
    if (t !== 'COMBAT' && used.has(t)) { out.push(plan('COMBAT', next)); continue; }
    if (t === 'MERCHANT') merchantOk = false;   // at most one merchant / fountain door per set (and per biome, see director)
    if (t === 'FOUNTAIN') fountainOk = false;
    if (t === 'SHRINE') shrineOk = false;   // one optional challenge per set (and per biome, see director)
    used.add(t);
    out.push(plan(t, next));
  }
  // this biome's crystal cavern (50% of biomes, director picks the room): an extra door, or replaces the last one
  if (crystal) { if (out.length >= 3) out.pop(); out.push({ type: 'CRYSTAL', reward: 'NONE' }); }
  return out.length;
}

export const firstPlan = (): RoomPlan => ({ type: 'COMBAT', reward: 'CARD' });

// ------------------------------------------------------------------ rewards --
const LEVELS: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/**
 * Gear rarity for a reward at `depth`. `bonus` lifts the odds (elites 0.1, chests 0.2, bosses 0.35+).
 * `bosses` = bosses already beaten this run (not counting the one whose reward this is):
 *  - MYTHIC never drops before a boss has been beaten (so never from the first boss), and stays very rare after (<= 1.5%).
 *  - LEGENDARY is a trickle in the first biome and only opens up after the first boss (+3% per boss beaten).
 */
export function rarityForDepth(depth: number, bonus = 0, bosses = 0): Rarity {
  const r = Math.random();
  const boost = 1 + bonus * 1.5;
  const mythic = bosses >= 1 ? Math.min(0.015, 0.002 * bosses * boost) : 0;
  const legendary = Math.min(0.3, (bosses >= 1 ? 0.03 + 0.03 * bosses : Math.min(0.015, Math.max(0, depth - 6) * 0.002)) * boost);
  const epic = Math.min(0.5, (0.04 + depth * 0.011) * boost);
  const rare = Math.min(0.75, 0.3 + depth * 0.012 + bonus);
  if (r < mythic) return LEVELS[4];
  if (r < mythic + legendary) return LEVELS[3];
  if (r < mythic + legendary + epic) return LEVELS[2];
  if (r < mythic + legendary + epic + rare) return LEVELS[1];
  return LEVELS[0];
}
/** Index into SHARD pickups' rarity (0 common .. 4 mythic). */
export function shardRarity(depth: number): number {
  const r = Math.random();
  return r < Math.min(0.1, depth * 0.002) ? 3 : r < Math.min(0.3, 0.02 + depth * 0.006) ? 2 : r < 0.45 ? 1 : 0;
}
