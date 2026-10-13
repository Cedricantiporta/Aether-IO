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
import type { RunStats } from './engine/types';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'NIGHTMARE';
export type ShopTab = 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH' | 'SUMMON';
export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'pet';
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
  waveGoldBonus: number;  // 100 gold per cleared wave, paid at run end
}

export interface Equipment {
  weapon: Item | null;
  armor: Item | null;
  accessory: Item | null;
  pet: Item | null;
}

export interface GameState {
  // ---- flow
  status: GameStatus;
  hero: HeroClass;
  difficulty: Difficulty;
  wave: number;                       // mirrored from director on wave change (UI re-render ok)

  // ---- currencies & progression (designer spec: start 10000 gold / 10000 gems)
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
  startGame: () => void;              // resets run state + calls engine startRun()
  resetGame: () => void;              // back to MENU (engine clearWorld)
  togglePause: () => void;            // Esc: PLAYING <-> PAUSED(+pause menu); closes panels first if any open
  toggleInventory: () => void;
  toggleCharacterSheet: () => void;
  openSpecificShop: (tab: ShopTab) => void;
  closeAllUI: () => void;             // closes panels, resumes PLAYING if paused by a panel
  clearActionResult: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // progression (called by engine)
  addGold: (n: number) => void;
  addGems: (n: number) => void;
  addExperience: (n: number) => void; // handles level-ups: +SP, +base stats, engine heal + levelUp event
  setWave: (wave: number) => void;
  openWaveReward: () => void;         // generates upgradeOptions, accumulatedWaveGold += 100, status = LEVEL_UP
  selectUpgrade: (u: Upgrade) => void;// applies card, status = PLAYING
  upgradeSkill: (k: keyof SkillLevels) => void; // spend SP (skills tab)
  endRun: (summary: Omit<RunSummary, 'hero' | 'difficulty' | 'cp' | 'waveGoldBonus' | 'level'>) => void; // GAME_OVER + stats
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
  massSell: (rarity: Rarity) => void;
  recycleItem: (item: Item) => void;
  massRecycle: (rarity: Rarity) => void;
  combineMaterials: (from: Rarity) => void;
  craftItem: (rarity: Rarity) => boolean;
  buyInventorySlots: () => boolean;
  upgradeItem: (item: Item) => { success: boolean; msg: string; newItem?: Item };
  rollItemDrop: (rarityOverride?: Rarity) => Item | null; // engine asks store for a loot roll
  summon: (count: 1 | 10) => Item[]; // gacha with gems (100 each, 900 for 10x); pets+gear; returns results for reveal UI

  // notifications
  addNotification: (message: string, color?: string, type?: GameNotification['type'], action?: GameNotification['action']) => void;
  removeNotification: (id: string) => void;
}
