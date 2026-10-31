// ============================================================================
// STORE CONTRACT — the Zustand store (store.ts) MUST implement `GameState`.
// The store holds META / RPG state that changes rarely (inventory, stats, UI
// panels). Anything that changes every frame (hp, mana, cooldowns, positions,
// timers, boss hp) lives in `engine/world.ts` instead — never in the store.
//
// UI components MUST subscribe with selectors: useGameStore(s => s.gold)
// (or useShallow for multiple fields). Never call useGameStore() bare.
// ============================================================================
import type { DailySave, DailyResult } from './dailyChallenge';
import type { MetaState } from './goals';
import type {
  GameStatus, HeroClass, PlayerStats, Upgrade, Item, Rarity, SkillLevels,
  AbilityType, GameNotification, ActionResult, GameStatistics,
} from './types';
import type { Recipe } from './crafting';
import type { RunStats } from './engine/types';
import type { NpcQuestSave } from './npcQuests';
import type { TalentRanks } from './talents';
import type { EnemyKind } from './engine/types';
import type { CodexTab, Discovered } from './codexData';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'NIGHTMARE';
export interface RunProgress { endings: number; ascensionMax: number; ascension: number; towerBest: Record<HeroClass, number>; towerClaimed: Record<HeroClass, number[]>; daily: DailySave; wavesBest: Record<HeroClass, number>; wavesClaimed: Record<HeroClass, number[]>; /** crystal cave: lantern upgrade level (0..6) and the deepest floor ever reached */ caveLantern?: number; caveBest?: number; /** biomes whose boss was beaten at least once (index % BIOMES.length): they get a boss shortcut door in later runs */ biomesDone?: number[]; /** the 'a shortcut opens' notice was shown once */ shortcutSeen?: boolean; /** Ascension levels (0..10) whose one-time first-clear reward was already paid (ascension.ts ASC_REWARDS) */ ascClaimed?: number[]; /** Mining Pickaxe tier (toolTiers.ts PICKAXES, 0 Common .. 5 Mythic) */ pickTier?: number; /** Boss Trials (bossTrials.ts): the local day key (YYYY-MM-DD) each biome boss (key = biome index) was last fought; once per day unless a ticket is used */ trialDay?: Record<string, string> }
export type BlessingKind = 'FORTUNE' | 'MIGHT' | 'AEGIS' | 'SWIFT' | 'VITALITY' | 'PRECISION';
export type ShopTab = 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH' | 'SUMMON' | 'MERCHANT' | 'ARMORY' | 'WAREHOUSE' | 'TECH' | 'BREWER' | 'FISH' | 'MINE'; // FISH = the Fishmonger on the beach; MINE = Mining Supplies at the cave camp; MERCHANT = the travelling merchant room
export type EquipSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory' | 'pet' | 'tool';
export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Settings {
  masterVolume: number;   // 0..1
  sfxVolume: number;      // 0..1
  musicVolume: number;    // 0..1
  quality: GraphicsQuality;
  showDamageNumbers: boolean;
  screenShake: boolean;
  autoPotions: boolean;   // auto-drink at <= 70% hp/mana (owner; default: true)
  clickMove?: boolean;    // (owner) left-click the ground to walk there (town and runs); default off = WASD
  autoAim: boolean;       // lock the nearest enemy; off = mouse aim (desktop) / right aim stick (touch)
  autoQuality: boolean;   // adaptive resolution / particle budget from measured frame time
  fpsLimit: 30 | 60 | 0;  // 0 = unlimited
  showFps: boolean;
  uiScale: 'SMALL' | 'NORMAL' | 'LARGE';
  showEnemyBars: boolean;
  showMinimap: boolean;
  vibration: boolean;     // navigator.vibrate on being hit (touch devices)
  joystickSide: 'LEFT' | 'RIGHT';
  castMode: 'AIMED' | 'QUICK' | 'AUTO'; // skill casting: hold & release / instant at cursor / instant at auto-target (touch: tap = auto, drag = aim)
  batterySaver: boolean;  // FPS 30 + LOW quality
  cameraLead: boolean;    // desktop: the camera drifts toward the mouse cursor (off by default)
  freeCamera: boolean;    // off (default): fixed north-up "diorama" camera (Link's Awakening style); on: free orbit (yaw / pitch drag)
  tiltShift: boolean;
  autoNextSac: boolean;   // (unused since 2026-10-25: the PATH auto-walk was removed; kept so old saves load)
  autoChase: boolean;     // (owner 2026-10-25) AUTO battle walks to enemies anywhere in the room (default on; never during a boss fight); off: only fights what is in reach
  roomTips: boolean;      // (owner 2026-10-25) show the room twist explanations (Spike Traps: ..., Cursed: ...) — off by default     // tilt-shift blur at the top + bottom of the screen (diorama look; on by default)
  aimAtCursor: boolean;   // desktop: skills/dash aim at the mouse (false = where the hero faces)
  /** Hard mode (Settings): runs started while it is on use the HARD difficulty (tougher, more enemies, better loot). */
  hardMode?: boolean;
  autoSkills: boolean;    // auto-cast skills 1/2/3 + ult at the auto-target (dash stays manual)
  /** (owner) skills the AUTO bots leave alone ('s1' | 's2' | 's3' | 'ult'): the small AUTO pill above each skill slot */
  autoOff?: string[];
  /** (owner) the ultimate is NOT auto by default: its AUTO pill turns it on ('ult' listed here) */
  autoOn?: string[];
  autoLootGear: 'OFF' | 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';   // lowest gear rarity that flies in by itself (default UNCOMMON)
  autoLootMaterials: boolean;  // monster loot, shards, potions fly in at any rarity
  autoLootRange: 'NEAR' | 'FAR';  // NEAR: walk up to items; FAR: the full magnet radius pulls them
  autoLootOnClear: boolean;    // once a room is cleared every item on the floor flies to you
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
  /** (retired slot: the Mining Pickaxe is now a weapon, itemClass.PICKAXE_ID; old saves are migrated in store.ts) */
  tool: Item | null;
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
  welcomeGiftClaimed: boolean;
  talents: Record<HeroClass, TalentRanks>;   // permanent talent ranks per class (node id -> rank)
  starterGiven: Record<HeroClass, boolean>;  // class starter weapon/armour already granted
  discovered: Discovered;                    // Codex discoveries (item/pet/loot names, skill keys, monster keys); persisted
  codexClaimed: string[];                    // Codex tabs whose 100% reward was claimed
  petReg: string[];                          // Pet Collection: species the hero REGISTERED (button in the Collection window); only these count for milestones. Old saves start empty
  petClaimed: number[];                      // Pet Collection: milestone species counts already claimed (auto-claimed when the registered count reaches them; old saves migrated at startup)
  petSeen: string[];                         // Pet Collection: template ids of every pet species ever owned (petCollection.ts)
  chestsOpened: string[];                   // town treasure chests already opened by this hero (engine/townChests.ts ids; saved with the profile)
  meta: MetaState;                           // daily / weekly goals, achievements, equipped title (goals.ts; written by goalsTracker.ts)

  // ---- currencies & in-run progression (level/xp/skillPoints/skillLevels/baseStats reset each run)
  gold: number;
  gems: number;
  /** Aether Crystals: the Crystal Altar's summon currency (mined, adventure rewards, boss drops, Gem Altar bonus) */
  crystals: number;
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
  tech: import('./tech').TechLevels;                 // Tech House upgrade levels
  summonPity: import('./store').SummonPity;
  story: import('./story').StorySave;
  classProg: Record<HeroClass, import('./classLevels').ClassProg>;
  attrs: Record<HeroClass, import('./attributes').Attrs>;   // allocated STR / DEX / INT / VIT / LUK per class   // permanent per-class level / xp / skill points / skills                // main story chain step + progress          // draws so far per summon altar (pity counters)
  progress: RunProgress;                            // endings cleared, ascension unlocked / chosen, endless tower best floor per class
  warehouseGold: number;                            // gold kept in the warehouse (safe, saved with the profile)
  warehouse: Item[];                                // town storage (WAREHOUSE_LIMIT slots, saved with the profile)
  npcQuests: NpcQuestSave;                          // NPC story quests: state + boss kill counters (saved with the profile)
  dashMods: Partial<Record<HeroClass, import('./dashMods').DashMod>>;   // chosen Dash Charm per class
  questSeen: string[] | null;                       // quest ids already viewed in the quest window (red dots, questSeen.ts; null = seed on load)
  unlocks: import('./questUnlocks').UnlockSave;     // death-unlocked quest beats (questUnlocks.ts; saved with the profile)
  materials: Record<Rarity, number>;
  elixirsNext: import('./elixirs').ElixirId[];        // elixirs drunk in town: their buffs start with the next run (saved with the profile)
  elixirsRun: import('./elixirs').ElixirId[];         // elixir buffs active in the current run (gone when the run ends)
  equipment: Equipment;
  upgradeOptions: Upgrade[];          // room-clear reward cards (status LEVEL_UP)
  cardRefresh: number;                // Card Refresh uses left this run (1 free + Tech House tiers; reset on run start)
  cardPolish: number;                 // Card Polish (rarity up) charges left this run (Tech House tiers; reset on run start)
  runPicks: Upgrade[];                // every reward card picked this run, in order (reset on run start; feeds the Run Upgrades panel)

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
  setDashMod: (mod: import('./dashMods').DashMod | null) => void;   // Skill Trainer: pick / clear the hero's Dash Charm
  markQuestsSeen: (ids: string[]) => void;       // the quest window showed these quests: their red dots clear
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
  addCrystals: (n: number, at?: { x: number; z: number }) => void;
  /** Blacksmith > Shards: 5 cores of `tier` (0 / 1) -> 1 core of the next tier. */
  fuseCores: (tier: number) => boolean;
  discover: (tab: CodexTab, keys: string[]) => void;   // mark Codex entries discovered (idempotent)
  registerPet: (id?: string) => boolean;                // Pet Collection: register an owned species (undefined = every owned one); free, permanent
  claimCodexReward: (tab: CodexTab) => boolean;         // one-time gems when a tab is 100% discovered
  addExperience: (n: number) => void; // handles level-ups: +SP, +base stats, engine heal + levelUp event
  setWave: (wave: number) => void;
  openWaveReward: (bonus?: boolean) => void; // room reward: generates upgradeOptions (+a 4th card when `bonus`), accumulatedWaveGold += 100, status = LEVEL_UP
  addMaterial: (rarity: Rarity, n?: number) => void; // crafting shards
  applyBlessing: (kind: BlessingKind) => string;   // fountain blessing for the rest of the run (edits baseStats); returns its label
  /** Captain Rhea's ship deck (engine/runCards SHIP_DECKS): applies all its cards at once; false when it cannot be chosen now */
  chooseShipDeck: (deckId: string) => boolean;
  selectUpgrade: (u: Upgrade) => void;// applies card, status = PLAYING
  upgradeSkill: (k: keyof SkillLevels) => void; // spend SP (skills tab)
  endRun: (summary: Omit<RunSummary, 'hero' | 'difficulty' | 'cp' | 'waveGoldBonus' | 'level' | 'rankXpGained' | 'rankUps' | 'rank'>) => void; // GAME_OVER + stats
  getManaCost: (skill: keyof SkillLevels | 'dash') => number; // already includes wizard x1.3

  // items
  debugMaxSkills: () => void;                      // debug: all hero skills to max level (Settings > Debug)
  startMode: (mode: 'ADVENTURE' | 'TOWER', startBiome?: number, startFloor?: number) => void;
  /** Boss Trials (bossTrials.ts): fight biome `boss` (0..6) alone at Void strength. Free until the boss is WON that local day (a death / abandon keeps the try); a won boss needs a Boss Trial Ticket (consumed here). False = refused (locked / no ticket). */
  startBossTrial: (boss: number) => boolean;
  /** The trial boss fell: rolls + banks its Legendary / Mythic piece (bag, else warehouse) and returns it. */
  rollBossTrialLoot: (boss: number) => Item[];
  sailToIsles: () => boolean;         // the captain's 60 Aether Crystal ticket: an adventure run that opens in the Coral Isles   // start a run in this mode (sets engine runInfo, then startGame)
  setAscension: (lv: number) => void;
  completeEnding: () => void;                       // the Void Herald defeated: count the ending, unlock the next Ascension
  recordTowerFloor: (floor: number) => boolean;     // true when it is a new best for the hero
  claimTowerMilestone: (floor: number) => boolean;  // Endless Tower: claim the reward of a reached 10th floor (once per class)
  startDaily: () => void;                            // Daily Trial: start today's challenge (dailyChallenge.ts) with the current hero
  completeDaily: (r: DailyResult) => { rewarded: boolean; newBest: boolean };   // records the score; pays the day's reward once
  startWaves: () => void;                            // Endless Waves (endlessWaves.ts): survival run with the current hero
  startShowcase: () => void;                         // the one-off fully powered arena fight for a new character (engine/showcase.ts): a temporary overlay
  endShowcase: (won: boolean) => void;               // restores the real profile and returns to town
  recordWave: (wave: number) => boolean;             // a wave cleared: best per class (true = new best) + one-time milestone rewards
  refreshCards: () => boolean;                       // reroll the offered reward cards (costs 1 refresh)
  polishCard: (id: string) => boolean;               // raise one offered card's rarity by a tier (costs 1 charge)
  buyTech: (id: import('./tech').TechId) => boolean;
  setStory: (step: number, p?: number) => void;
  /** (owner, Hades-style) after an adventure death / ending: maybe opens the next quest beat (questUnlocks.ts); returns it, or null (a quiet night) */
  rollDeathUnlock: (force?: boolean) => import('./questUnlocks').Beat | null;
  /** (owner) on a hero level-up: ~70% chance to open the next not-yet-opened SIDE quest beat early (questUnlocks.ts `early`); returns it or null */
  rollLevelUnlock: () => import('./questUnlocks').Beat | null;
  debugSetLevel: (lv: number) => void;               // debug: set the current class level       // main story: move to `step` (progress `p`)   // Tech House: buy the next level of an upgrade
  moveGold: (n: number) => void;                   // warehouse gold: + deposit from the bag, - withdraw to the bag
  deleteItems: (ids: string[]) => void;              // bag: permanently destroy items (multi-select delete)
  reorderItems: (list: 'inventory' | 'warehouse', items: Item[]) => void;   // manual order (drag within the bag / warehouse, Sort)
  depositItem: (id: string) => boolean;            // bag -> warehouse (stacks), false if the warehouse is full
  withdrawItem: (id: string) => boolean;           // warehouse -> bag, false if the bag is full
  addItemToInventory: (item: Item) => boolean;      // stacks potions/cores/revives; false if full (marks it new, except monster loot)
  seeItem: (id: string) => void;                     // drops an item's "new" dot (hovered / tapped in the bag)
  canPickUp: (item: Item) => boolean;               // used by pickups magnet
  consumeItem: (pred: (i: Item) => boolean) => Item | null; // removes one from a stack, returns template
  equipItem: (item: Item) => void;
  unequipItem: (slot: EquipSlot) => void;
  autoEquip: () => void;
  buyItem: (item: Item, quantity?: number) => boolean;
  /** Pet fusion: 5 bag pets of one tier -> a chance at one pet of the next tier (else one of the same tier). */
  fusePets: (ids: string[]) => { ok: boolean; item: Item } | null;
  /** Potion fusion: 3 potions of `fromId` -> 1 of the next tier for gold (x `times`); returns how many fusions happened. */
  fusePotions: (fromId: string, times?: number) => number;
  /** Pet ascension: consume a same-name duplicate (bag only) for +1 star on the keeper (bag or equipped). */
  ascendPet: (keepId: string, sacId: string) => boolean;
  /** Gear ascension: consume a same-name, same-rarity duplicate (bag only) for +1 star (+6% base stats) on the keeper (bag or equipped). */
  ascendGear: (keepId: string, sacId: string) => boolean;
  /** Blacksmith fusion: 5 bag gear pieces of one tier -> a chance at one piece of the next tier (else one of the same tier). */
  fuseItems: (ids: string[]) => { ok: boolean; item: Item } | null;
  /** Blacksmith fusion: 5 shards of one tier -> a chance at one shard of the next tier (else one of the same tier). */
  reforgeItem: (id: string, mode: import('./reforge').ReforgeMode, line?: number) => Item | null;
  fuseShards: (r: Rarity) => { ok: boolean; item: Item } | null;
  setAttrs: (a: import('./attributes').Attrs) => boolean;   // allocate attribute points for the current class
  resetAttrs: () => boolean;                               // refund all points (costs gold)
  sellItem: (item: Item, amount?: number) => void;
  sellItems: (items: Item[]) => void;
  sellAllLoot: () => number;                        // sells every LOOT stack at full value; returns gold gained
  massSell: (rarity: Rarity) => void;
  /** Bulk sell from the bag: gear of the given rarities (equipped kept), plus loot (non-craft) and optionally craft materials. Returns gold gained. */
  bulkSell: (o: BulkSellOpts) => number;
  recycleItem: (item: Item) => void;
  massRecycle: (rarity: Rarity) => void;
  /** (owner) bag multi-select recycle: gear -> shards of its tier (+ cores); anything else is discarded. Returns items removed. */
  recycleItems: (ids: string[]) => number;
  combineMaterials: (from: Rarity) => void;
  downgradeMaterials: (from: Rarity) => void;
  craftItem: (recipe: Recipe) => { item: Item | null; outcome: import('./crafting').CraftOutcome } | null;   // null = cannot craft (nothing spent)
  brewElixir: (id: import('./elixirs').ElixirId, n?: number) => number;   // Elixir Brewer: spend monster parts + gold, add elixirs to the bag; returns how many were brewed
  drinkElixir: (item: Item) => boolean;            // bag: drink an elixir (town: queued for the next run; in a run: active at once)
  buyInventorySlots: () => boolean;
  upgradeItem: (item: Item) => { success: boolean; msg: string; newItem?: Item };
  rollItemDrop: (rarityOverride?: Rarity, ctx?: import('./biomeLoot').DropCtx) => Item | null; // engine asks store for a loot roll
  summon: (count: 1 | 10, altar?: 'GEM' | 'SHARD') => Item[]; // gacha: GEM altar (10 / 90 gems, better odds) or SHARD altar (10 / 90 Aether Crystals); pets+gear

  // talents (permanent, per class; 1 point per Hero Rank + 1 per 5 ranks)
  allocateTalent: (id: string) => boolean;
  respecTalents: () => boolean;      // costs gold (talents.respecCost)

  // notifications
  patchEquippedPet: (patch: Partial<Item>, spend?: { gold?: number; materials?: Partial<Record<Rarity, number>>; inventory?: Item[] }) => void; // pet growth (petActions.ts): merge fields into the equipped pet, optionally paying costs; recalculates stats
  addNotification: (message: string, color?: string, type?: GameNotification['type'], action?: GameNotification['action']) => void;
  removeNotification: (id: string) => void;
}

export interface BulkSellOpts { rarities: Rarity[]; loot: boolean; craftMats: boolean; /** when set, craft materials are filtered by these rarities */ matRarities?: Rarity[] }
