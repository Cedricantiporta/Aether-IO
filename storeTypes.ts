// ============================================================================
// STORE CONTRACT — the Zustand store (store.ts) MUST implement `GameState`.
// The store holds META / RPG state that changes rarely (inventory, stats, UI
// panels). Anything that changes every frame (hp, mana, cooldowns, positions,
// timers, boss hp) lives in `engine/world.ts` instead — never in the store.
//
// UI components MUST subscribe with selectors: useGameStore(s => s.gold)
// (or useShallow for multiple fields). Never call useGameStore() bare.
// ============================================================================
import type {
  GameStatus, HeroClass, PlayerStats, Upgrade, Item, Rarity, SkillLevels,
  AbilityType, GameNotification, ActionResult, GameStatistics,
} from './types';
import type { Recipe } from './crafting';
import type { RunStats } from './engine/types';
import type { Quest, QuestType } from './quests';
import type { TalentRanks } from './talents';
import type { EnemyKind } from './engine/types';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'NIGHTMARE';
export type ShopTab = 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH' | 'SUMMON' | 'QUESTS';
export type EquipSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory' | 'pet';
export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Settings {
  masterVolume: number;   // 0..1
  sfxVolume: number;      // 0..1
  musicVolume: number;    // 0..1
  quality: GraphicsQuality;
  showDamageNumbers: boolean;
  screenShake: boolean;
  autoPotions: boolean;   // auto-drink at <30% hp/mana (designer default: true)
}

export interface RunSummary extends RunStats {
  wave: number;
  level: number;
  hero: HeroClass;
  difficulty: Difficulty;
  cp: number;
  waveGoldBonus: number;  // 100 gold per cleared wave, paid in full at run end (also on death)
  rankXpGained: number;   // heroRank xp earned this run (xpEarned * 0.5)
  rankUps: number;        // ranks gained at run end
  rank: number;           // heroRank after the run
}

export interface Equipment {
  weapon: Item | null;
  helmet: Item | null;
  armor: Item | null;
  gloves: Item | null;
  boots: Item | null;
  accessory: Item | null;
  pet: Item | null;
}

export interface GameState {
  // ---- flow
  status: GameStatus;
  hero: HeroClass;
  difficulty: Difficulty;
  wave: number;                       // mirrored from director on wave change (UI re-render ok)

  // ---- PERSISTENT PROFILE (localStorage 'aether-survivor-profile-v1'): gold, gems, inventory, equipment,
  // materials, maxInventorySlots, heroRank, rankXp, quests, gameStats, settings, welcomeGiftClaimed (+hero, difficulty).
  // Fresh profile = 0 gold/gems + one-time welcome gift. Runs keep everything looted, even on death.
  heroRank: number;                   // gear requirements use this (RANK_REQ); +1% gold find per rank (cap 50%)
  rankXp: number;                     // xp into the current rank; need rankXpNeeded(heroRank)
  quests: Quest[];                    // 3 active villager quests
  welcomeGiftClaimed: boolean;
  talents: Record<HeroClass, TalentRanks>;   // permanent talent ranks per class (node id -> rank)
  starterGiven: Record<HeroClass, boolean>;  // class starter weapon/armour already granted

  // ---- currencies & in-run progression (level/xp/skillPoints/skillLevels/baseStats reset each run)
  gold: number;
  gems: number;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  skillPoints: number;
  accumulatedWaveGold: number;        // +100 per cleared wave, paid on run end

  // ---- character
  baseStats: PlayerStats;             // hero base + level-ups + wave cards
  stats: PlayerStats;                 // baseStats + equipment (NO temporary buffs; engine applies rage/sprint)
  skillLevels: SkillLevels;
  activeAbilityQ: AbilityType | null; // class Q ability (PIERCING_SHOT / GRAVITY_SPELL / RAGE)

  // ---- items
  inventory: Item[];
  maxInventorySlots: number;
  materials: Record<Rarity, number>;
  equipment: Equipment;
  upgradeOptions: Upgrade[];          // wave-clear reward cards (status LEVEL_UP)

  // ---- UI panels
  isInventoryOpen: boolean;
  isShopOpen: boolean;
  isCharacterSheetOpen: boolean;
  isPauseMenuOpen: boolean;
  activeShopTab: ShopTab;
  shopSales: Record<string, number>; // item id -> discount fraction (not persisted)
  notifications: GameNotification[];
  actionResult: ActionResult | null;

  // ---- persistence (localStorage: gameStats + settings only)
  gameStats: GameStatistics;
  settings: Settings;
  lastRun: RunSummary | null;

  // ================================================================ actions
  // flow
  setStatus: (s: GameStatus) => void;
  selectHero: (h: HeroClass) => void;
  setDifficulty: (d: Difficulty) => void;
  startGame: () => void;              // starts the siege run (profile is NOT touched; in-run state resets)
  resetGame: () => void;              // back to the peaceful village (status MENU, engine enterVillage); profile kept
  abandonRun: () => void;             // finalize run rewards (rank xp + wave gold) then back to the village
  resetProfile: () => void;           // wipe the saved profile (fresh profile + welcome gift)
  togglePause: () => void;            // Esc: PLAYING <-> PAUSED(+pause menu); closes panels first if any open
  toggleInventory: () => void;
  toggleCharacterSheet: () => void;
  openSpecificShop: (tab: ShopTab) => void;
  rollShopSales: () => void;
  closeAllUI: () => void;             // closes panels, resumes PLAYING if paused by a panel
  clearActionResult: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // progression (called by engine)
  addGold: (n: number) => void;
  addGems: (n: number) => void;
  addExperience: (n: number) => void; // handles level-ups: +SP, +base stats, engine heal + levelUp event
  setWave: (wave: number) => void;
  openWaveReward: (fast?: boolean) => void; // generates upgradeOptions (+maybe 4th card on a fast clear), accumulatedWaveGold += 100, status = LEVEL_UP
  addMaterial: (rarity: Rarity, n?: number) => void; // crafting shards
  addQuestProgress: (type: QuestType, amount?: number, kind?: EnemyKind, lootName?: string) => void;
  claimQuest: (id: string) => boolean; // grants reward, draws a replacement quest
  selectUpgrade: (u: Upgrade) => void;// applies card, status = PLAYING
  upgradeSkill: (k: keyof SkillLevels) => void; // spend SP (skills tab)
  endRun: (summary: Omit<RunSummary, 'hero' | 'difficulty' | 'cp' | 'waveGoldBonus' | 'level' | 'rankXpGained' | 'rankUps' | 'rank'>) => void; // GAME_OVER + stats
  getManaCost: (skill: keyof SkillLevels | 'q' | 'r' | 'e' | 'dash') => number; // already includes wizard x1.3

  // items
  addItemToInventory: (item: Item) => boolean;      // stacks potions/cores/revives; false if full
  canPickUp: (item: Item) => boolean;               // used by pickups magnet
  consumeItem: (pred: (i: Item) => boolean) => Item | null; // removes one from a stack, returns template
  equipItem: (item: Item) => void;
  unequipItem: (slot: EquipSlot) => void;
  autoEquip: () => void;
  buyItem: (item: Item, quantity?: number) => boolean;
  sellItem: (item: Item, amount?: number) => void;
  sellItems: (items: Item[]) => void;
  sellAllLoot: () => number;                        // sells every LOOT stack at full value; returns gold gained
  massSell: (rarity: Rarity) => void;
  recycleItem: (item: Item) => void;
  massRecycle: (rarity: Rarity) => void;
  combineMaterials: (from: Rarity) => void;
  downgradeMaterials: (from: Rarity) => void;
  craftItem: (recipe: Recipe) => Item | null;
  buyInventorySlots: () => boolean;
  upgradeItem: (item: Item) => { success: boolean; msg: string; newItem?: Item };
  rollItemDrop: (rarityOverride?: Rarity) => Item | null; // engine asks store for a loot roll
  summon: (count: 1 | 10) => Item[]; // gacha with gems (100 each, 900 for 10x); pets+gear; returns results for reveal UI

  // talents (permanent, per class; 1 point per Hero Rank + 1 per 5 ranks)
  allocateTalent: (id: string) => boolean;
  respecTalents: () => boolean;      // costs gold (talents.respecCost)

  // notifications
  addNotification: (message: string, color?: string, type?: GameNotification['type'], action?: GameNotification['action']) => void;
  removeNotification: (id: string) => void;
}
