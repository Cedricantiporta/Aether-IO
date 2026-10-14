// ============================================================================
// STORE CONTRACT — the Zustand store (store.ts) MUST implement `GameState`.
// The store holds META / RPG state that changes rarely (inventory, stats, UI
// panels). Anything that changes every frame (hp, mana, cooldowns, positions,
// timers, boss hp) lives in `engine/world.ts` instead — never in the store.
//
// UI components MUST subscribe with selectors: useGameStore(s => s.gold)
// (or useShallow for multiple fields). Never call useGameStore() bare.
// ============================================================================
import type { MetaState } from './goals';
import type {
  GameStatus, HeroClass, PlayerStats, Upgrade, Item, Rarity, SkillLevels,
  AbilityType, GameNotification, ActionResult, GameStatistics,
} from './types';
import type { Recipe } from './crafting';
import type { RunStats } from './engine/types';
import type { Quest, QuestType } from './quests';
import type { NpcQuestSave } from './npcQuests';
import type { TalentRanks } from './talents';
import type { EnemyKind } from './engine/types';
import type { CodexTab, Discovered } from './codexData';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'NIGHTMARE';
export interface RunProgress { endings: number; ascensionMax: number; ascension: number; towerBest: Record<HeroClass, number> }
export type BlessingKind = 'FORTUNE' | 'MIGHT' | 'AEGIS' | 'SWIFT' | 'VITALITY' | 'PRECISION';
export type ShopTab = 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH' | 'SUMMON' | 'QUESTS' | 'MERCHANT' | 'ARMORY' | 'WAREHOUSE'; // MERCHANT = the travelling merchant room
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
  autoAim: boolean;       // lock the nearest enemy; off = mouse aim (desktop) / right aim stick (touch)
  autoQuality: boolean;   // adaptive resolution / particle budget from measured frame time
  fpsLimit: 30 | 60 | 0;  // 0 = unlimited
  showFps: boolean;
  uiScale: 'SMALL' | 'NORMAL' | 'LARGE';
  cameraZoom: number;     // 0.8 (close) .. 1.3 (far)
  zoomUnlocked: boolean;  // off (default): camera locked at zoom 1.0 (wheel / pinch / slider do nothing)
  showEnemyBars: boolean;
  showMinimap: boolean;
  vibration: boolean;     // navigator.vibrate on being hit (touch devices)
  joystickSide: 'LEFT' | 'RIGHT';
  castMode: 'AIMED' | 'QUICK' | 'AUTO'; // skill casting: hold & release / instant at cursor / instant at auto-target (touch: tap = auto, drag = aim)
  batterySaver: boolean;  // FPS 30 + LOW quality
  aimAtCursor: boolean;   // desktop: skills/dash aim at the mouse (false = where the hero faces)
  autoSkills: boolean;    // auto-cast skills 1/2/3 + ult at the auto-target (dash stays manual)
}

export interface RunSummary extends RunStats {
  wave: number;           // depth reached (biome * 10 + room; a boss room of biome b is 10 * (b + 1))
  victory?: boolean;      // true when the run was banked after a boss ("Return to town")
  level: number;
  hero: HeroClass;
  difficulty: Difficulty;
  cp: number;
  waveGoldBonus: number;  // 100 gold per upgrade-card room, paid in full at run end (also on death)
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
  wave: number;                       // current depth wave, mirrored from the director on every room change (UI re-render ok)

  // ---- PERSISTENT PROFILE (localStorage 'aether-survivor-profile-v1'): gold, gems, inventory, equipment,
  // materials, maxInventorySlots, heroRank, rankXp, quests, gameStats, settings, welcomeGiftClaimed (+hero, difficulty).
  // Fresh profile = 0 gold/gems + one-time welcome gift. Runs keep everything looted, even on death.
  heroRank: number;                   // gear requirements use this (RANK_REQ); +1% gold find per rank (cap 50%)
  rankXp: number;                     // xp into the current rank; need rankXpNeeded(heroRank)
  quests: Quest[];                    // quest board: offers (refresh daily) + up to 3 accepted (only those progress)
  welcomeGiftClaimed: boolean;
  talents: Record<HeroClass, TalentRanks>;   // permanent talent ranks per class (node id -> rank)
  starterGiven: Record<HeroClass, boolean>;  // class starter weapon/armour already granted
  discovered: Discovered;                    // Codex discoveries (item/pet/loot names, skill keys, monster keys); persisted
  codexClaimed: string[];                    // Codex tabs whose 100% reward was claimed
  meta: MetaState;                           // daily / weekly goals, achievements, equipped title (goals.ts; written by goalsTracker.ts)

  // ---- currencies & in-run progression (level/xp/skillPoints/skillLevels/baseStats reset each run)
  gold: number;
  gems: number;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  skillPoints: number;
  accumulatedWaveGold: number;        // +100 per upgrade-card room, paid on run end

  // ---- character
  baseStats: PlayerStats;             // hero base + level-ups + wave cards
  stats: PlayerStats;                 // baseStats + equipment (NO temporary buffs; engine applies rage/sprint)
  skillLevels: SkillLevels;
  activeAbilityQ: AbilityType | null; // class Q ability (PIERCING_SHOT / GRAVITY_SPELL / RAGE)

  // ---- items
  inventory: Item[];
  maxInventorySlots: number;
  progress: RunProgress;                            // endings cleared, ascension unlocked / chosen, endless tower best floor per class
  warehouseGold: number;                            // gold kept in the warehouse (safe, saved with the profile)
  warehouse: Item[];                                // town storage (WAREHOUSE_LIMIT slots, saved with the profile)
  npcQuests: NpcQuestSave;                          // NPC story quests: state + boss kill counters (saved with the profile)
  materials: Record<Rarity, number>;
  equipment: Equipment;
  upgradeOptions: Upgrade[];          // room-clear reward cards (status LEVEL_UP)

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
  startGame: () => void;              // starts a run: leaves the town for the first room (profile is NOT touched; in-run state resets)
  resetGame: () => void;              // back to the town (status MENU, engine enterVillage); profile kept
  abandonRun: () => void;             // finalize run rewards (rank xp + gold bonus) then back to the town
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
  discover: (tab: CodexTab, keys: string[]) => void;   // mark Codex entries discovered (idempotent)
  claimCodexReward: (tab: CodexTab) => boolean;         // one-time gems when a tab is 100% discovered
  addExperience: (n: number) => void; // handles level-ups: +SP, +base stats, engine heal + levelUp event
  setWave: (wave: number) => void;
  openWaveReward: (bonus?: boolean) => void; // room reward: generates upgradeOptions (+a 4th card when `bonus`), accumulatedWaveGold += 100, status = LEVEL_UP
  addMaterial: (rarity: Rarity, n?: number) => void; // crafting shards
  addQuestProgress: (type: QuestType, amount?: number, kind?: EnemyKind, lootName?: string) => void;
  reportToKing: () => { audience: number; reports: number }; // talking to the King: finishes AUDIENCE quests, marks finished KING_BOUNTY quests as reported
  applyBlessing: (kind: BlessingKind) => string;   // fountain blessing for the rest of the run (edits baseStats); returns its label
  claimQuest: (id: string) => boolean; // grants reward, draws a replacement offer
  acceptQuest: (id: string) => boolean; // takes an offer (max 3 active)
  abandonQuest: (id: string) => void;   // drops an accepted quest (frees a slot; progress lost)
  refreshQuestBoard: () => void;        // daily refresh of unaccepted offers
  selectUpgrade: (u: Upgrade) => void;// applies card, status = PLAYING
  upgradeSkill: (k: keyof SkillLevels) => void; // spend SP (skills tab)
  endRun: (summary: Omit<RunSummary, 'hero' | 'difficulty' | 'cp' | 'waveGoldBonus' | 'level' | 'rankXpGained' | 'rankUps' | 'rank'>) => void; // GAME_OVER + stats
  getManaCost: (skill: keyof SkillLevels | 'dash') => number; // already includes wizard x1.3

  // items
  debugMaxSkills: () => void;                      // debug: all hero skills to max level (Settings > Debug)
  startMode: (mode: 'ADVENTURE' | 'TOWER') => void;   // start a run in this mode (sets engine runInfo, then startGame)
  setAscension: (lv: number) => void;
  completeEnding: () => void;                       // Malakar defeated: count the ending, unlock the next Ascension
  recordTowerFloor: (floor: number) => boolean;     // true when it is a new best for the hero
  moveGold: (n: number) => void;                   // warehouse gold: + deposit from the bag, - withdraw to the bag
  deleteItems: (ids: string[]) => void;              // bag: permanently destroy items (multi-select delete)
  reorderItems: (list: 'inventory' | 'warehouse', items: Item[]) => void;   // manual order (drag within the bag / warehouse, Sort)
  depositItem: (id: string) => boolean;            // bag -> warehouse (stacks), false if the warehouse is full
  withdrawItem: (id: string) => boolean;           // warehouse -> bag, false if the bag is full
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
  summon: (count: 1 | 10, altar?: 'GEM' | 'SHARD') => Item[]; // gacha: GEM altar (10 / 90 gems, better odds) or SHARD altar (100 / 900 Common shards); pets+gear

  // talents (permanent, per class; 1 point per Hero Rank + 1 per 5 ranks)
  allocateTalent: (id: string) => boolean;
  respecTalents: () => boolean;      // costs gold (talents.respecCost)

  // notifications
  patchEquippedPet: (patch: Partial<Item>, spend?: { gold?: number; materials?: Partial<Record<Rarity, number>>; inventory?: Item[] }) => void; // pet growth (petActions.ts): merge fields into the equipped pet, optionally paying costs; recalculates stats
  addNotification: (message: string, color?: string, type?: GameNotification['type'], action?: GameNotification['action']) => void;
  removeNotification: (id: string) => void;
}
