// ============================================================================
// Zustand store — META / RPG state only (inventory, stats, panels, progression).
// Anything that changes every frame lives in engine/world.ts. See storeTypes.ts.
// ============================================================================
import { GOLD_SCALE } from './constants';
import { abilityMana, activeDefs, dashKey, ACTIVE_ORDER } from './abilityDefs';
import { debug } from './engine/debug';
import { runCards, rollRunCards, takeRunCard, rarityUpCard, canRarityUp, trendCounts } from './engine/runCards';
import { ASCENSION_MAX } from './ascension';
import { weaponPerk, lifeStealOf } from './weaponPerks';
import { activeChar, activeProfileKey } from './characters';
import { STORY, STORY_V, sanitizeStory, storyIdx, type StorySave } from './story';
import { rollMilestone, TOWER_STEP } from './towerRewards';
import { FUSE_COUNT, FUSE_CHANCE, nextTier, nextItemTier, randomPetOf } from './petFusion';
import { questXp, xpNeed, growBase, unlockLevel, skillCost, freshClass, sanitizeClassProg, MAX_LEVEL, SP_PER_LEVEL, DASH_UNLOCK_LV, type ClassProg, autoLearnActives } from './classLevels';
let runStartLevel = 1;
import { TECH, ROMAN, FREE_REFRESHES, techLv, sanitizeTech, type TechId, type TechLevels } from './tech';
import { runInfo, hardMul, phaseOfTime, type RunMode } from './engine/runMods';
import { armDaily, disarmDaily, dailyFor, dailyReward, dayKey, prevDay, sanitizeDaily } from './dailyChallenge';
import { armWaves, disarmWaves, waveMilestone, WAVE_MILESTONES } from './endlessWaves';
import { create } from 'zustand';
import {
  GameStatus, PlayerStats, Upgrade, Item, SkillLevels, Rarity, HeroClass, ItemType,
  AbilityType, GameStatistics, UpgradeType, GameNotification,
} from './types';
import {
  ITEMS_POOL, HERO_STATS, PETS_POOL, COLORS, capRarity, buyMul, sellUnit, SKILLS_INFO, INVENTORY_LIMIT, WAREHOUSE_LIMIT, UPGRADES_POOL, POTION_STACK_LIMIT,
  MATERIAL_COMBINE_COST, MATERIAL_DOWNGRADE_YIELD, SHARD_FUSE_COST, MULTISHOT_CAP, RANK_REQ,
} from './constants';
import { rollAffixes, affixFx, affixCP } from './affixes';
import { rollGrade, migrateGear, GRADE_HIGH_CHANCE } from './grade';
import { charmFx, charmOf } from './accessoryCharms';
import { accumulateSets } from './itemSets';
import { newAcc, accumulate, applyAcc } from './statFx';
import { accumulateTalents, allocBlock, emptyTalents, respecCost, sanitizeTalents, talentPointsTotal, talentsSpent, TALENT_BY_ID, type TalentRanks } from './talents';
import { STARTER_GEAR, classWearId } from './itemCatalog';
import { SET_BY_NAME } from './itemSets';
import { applyPlus, plusMul, upgradeChanceAt, upgradeCoresAt, upgradeGoldFor, upgradeBreakAt, upgradeCoreTierFor, coreTierOf, CORE_IDS, CORE_NAMES, CORE_FUSE, canCraft, consumeLoot, craft, recycleYield, recycleYieldAll, type Recipe, CRAFT_SUCCESS } from './crafting';
import { deviceDefaults } from './engine/device';
import { feedReward } from './rewardFeed';
import { reforge, REFORGE_ITEM, type ReforgeMode } from './reforge';
/** The captain's ticket: sail from the pier straight to the Coral Isles (biome 3, its first room). */
export const SHIP_TICKET_GEMS = 60;
const REFORGE_NAMES = new Set(Object.values(REFORGE_ITEM).map((r) => r.name));
/** What a bulk sell would take from the bag (gear at 30%, loot stacks at full value). Shared by the store and the popup preview. */
export function bulkSellPick(inv: Item[], o: BulkSellOpts): { items: Item[]; gold: number; count: number; loot: number; fish: number } {
  const items: Item[] = []; let gold = 0, count = 0, loot = 0, fish = 0;
  for (const i of inv) {
    if (isGear(i)) { if (o.rarities.includes(i.rarity)) { items.push(i); gold += sellUnit(i); count++; } continue; }
    if (i.type !== 'LOOT' || REFORGE_NAMES.has(i.name)) continue;
    const mat = CRAFT_MAT_NAMES.has(i.name);
    if (mat ? !o.craftMats : !o.loot) continue;
    const q = i.quantity || 1; items.push(i); gold += sellUnit(i) * q; count += q; loot += q; if (isFishName(i.name)) fish += q;
  }
  return { items, gold, count, loot, fish };
}
import { applyAttrs, sanitizeAttrs, attrPointsTotal, attrSpent, ATTR_RESET_GOLD, type Attrs } from './attributes';
import { shardCounts, syncShardStacks, SHARD_RARITIES, shardItem, shardTier } from './shards';
import { summonPool } from './summonPool';
import { itemClass, canUseClass, classOnlyMsg, classFilter, OTHER_CLASS_SHARE } from './itemClass';
import { crystalCount, syncCrystalStack } from './crystals';
import type { Difficulty, Equipment, EquipSlot, GameState, RunProgress, Settings, ShopTab, BulkSellOpts } from './storeTypes';
import { startRun, enterVillage } from './engine/game';
import { LOOT_STACK_LIMIT, LOOT_BY_ID, isFishName } from './loot';
import { ELIXIRS, applyElixir, elixirItem, elixirOf, isElixirId, type ElixirId } from './elixirs';
import { lootOwned, CRAFT_MAT_NAMES } from './crafting';
import { petPower, petStatMul, PET_PCT_STATS } from './petGrowth';
import { emptyNpcQuests, sanitizeNpcQuests, npcQuestStatus, NPC_QUESTS, type NpcQuestSave } from './npcQuests';
import { availableQuestIds } from './questSeen';
import { isDashMod, type DashMod } from './dashMods';
const sanitizeDashMods = (x: any): Partial<Record<HeroClass, DashMod>> => { const o: Partial<Record<HeroClass, DashMod>> = {}; if (x && typeof x === 'object') for (const k of Object.keys(x)) if (isDashMod(x[k])) o[k as HeroClass] = x[k]; return o; };
import { BEATS, UNLOCK_CHANCE, LEVEL_UNLOCK_CHANCE, nextBeatIndex, nextSideBeatIndex, emptyUnlocks, sanitizeUnlocks, storyHeld, unlockMirror, type Beat, type UnlockSave } from './questUnlocks';
import type { EnemyKind } from './engine/types';
import { world } from './engine/world';
import { events } from './engine/events';
import { showcase, showcaseHooks, resetShowcase, consumeShowcase } from './engine/showcase';
import { buildShowcaseOverlay } from './showcaseLoadout';
import { freshMeta, sanitizeMeta, type MetaState } from './goals';
import { CODEX_KEYS, CODEX_REWARD_GEMS, emptyDiscovered, monsterKeyByName, type CodexTab, type Discovered } from './codexData';

// ------------------------------------------------------------------ consts --
const LEGACY_KEY = 'aether-survivor-v2';           // gameStats + settings only (pre-profile builds)
const PROFILE_KEY = activeProfileKey();   // the active character's save (characters.ts; the first one keeps 'aether-survivor-profile-v1')
const PROFILE_VERSION = 1;
const MAX_SKILL_LEVEL = 5;
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];   // shard / summon ladder (no Uncommon tier)
const MAX_ITEM_NOTIFICATIONS = 6;
const MAX_NOTIFICATIONS = 12;

const INITIAL_STATS: PlayerStats = {
  maxHealth: 100, maxMana: 100, regen: 0.25, manaRegen: 0.5,   /* (owner: base HP regen -50%, was 0.5) */ moveSpeed: 10, damage: 18,
  fireRate: 1.4, projectileSpeed: 20, multishot: 1, spread: 0.2, dashCooldown: 4.0,
  cooldownReduction: 0, magnetRadius: 5.0, critRate: 0.05, critDamage: 1.5, defense: 0,
  skillDamage: 1.0, knockback: 0.5, dodge: 0,
  lifeSteal: 0, minionDmg: 0, minionLife: 0, minionCount: 0, minionHaste: 0, thorns: 0, goldFind: 0, xpBonus: 0, pierceBonus: 0, attackRange: 0, onHitBurnChance: 0, onHitSlowChance: 0,
  echoEvery: 0, hawkBonus: 0, galeWidth: 0, orbBonus: 0, procHaste: 0, thunderChain: 0, stormBonus: 0, avatarBonus: 0, stormTwin: 0, blizzardRadius: 0, blizzFreeze: 0,
  stompRadius: 0, stompStun: 0, stompPower: 0, dashCharges: 0, lowHpHaste: 0, rageBonus: 0, dmgReduce: 0, manaCostCut: 0, berserk: 0,
  stunBonus: 0, burnStacks: 0, backstab: 0, axeCount: 0, axeBounce: 0, axeSize: 0,
};

const INITIAL_SKILLS: SkillLevels = {
  orbital: 0, thunder: 0, regen: 0, magnet: 1, dash: 1, weapon: 1, barrier: 1, storm: 0, warcry: 0, inspire: 0, pierceShot: 0, consecrate: 0, smite: 0, radiant: 0, graveCall: 0, soulHarvest: 0, boneArmor: 0,
  q: 1, e: 1, s3: 1, s4: 1, ult: 1, burning: 0, freezing: 0, freezeSpell: 0, stamp: 0,
};

const INITIAL_GAME_STATS: GameStatistics = {
  totalRuns: 0, highestWave: 0, highestCP: 0, bestRunClass: null,
  classRuns: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0, KNIGHT: 0, NECROMANCER: 0 },
  classHighestWave: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0, KNIGHT: 0, NECROMANCER: 0 },
};

const _dd = deviceDefaults();
const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7, sfxVolume: 0.8, musicVolume: 0.4, quality: _dd.quality,
  showDamageNumbers: true, screenShake: true, autoPotions: true, clickMove: true,
  autoAim: _dd.autoAim, autoQuality: true, fpsLimit: _dd.fpsLimit, showFps: false, uiScale: _dd.uiScale,
  showEnemyBars: true, showMinimap: true, vibration: true, joystickSide: 'LEFT', batterySaver: false, castMode: 'AIMED', autoSkills: false, aimAtCursor: false, cameraLead: false, freeCamera: false, tiltShift: true, autoLootGear: 'UNCOMMON', autoLootMaterials: true, autoLootRange: 'NEAR', autoLootOnClear: false,
};

const EMPTY_EQUIPMENT: Equipment = { weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null, pet: null, tool: null };
const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory', 'pet', 'tool'];
const emptyMaterials = (): Record<Rarity, number> => ({ COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 });

/** Hero rank needed to equip gear of a rarity. */

/** (owner) gems per missing brewing ingredient, by the ingredient's rarity. */
const BREW_GEM: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 5 };
/** Gems to replace the ingredients missing for `n` brews of elixir `id` (0 when the bag covers them). */
export function brewGemCost(inv: Item[], id: ElixirId, n: number): number {
  let g = 0;
  for (const p of ELIXIRS[id].parts) g += Math.max(0, p.count * n - lootOwned(inv, p.id)) * (BREW_GEM[LOOT_BY_ID[p.id]?.rarity ?? 'COMMON'] ?? 1);
  return g;
}
export { RANK_REQ };
/** Hero rank xp needed to go from rank r to r+1. */
export const rankXpNeeded = (r: number): number => Math.round(400 * Math.pow(Math.max(1, r), 1.35));
/** Passive perk: +1% gold find per rank, capped at +50%. */
export const goldFindMul = (rank: number): number => 1 + Math.min(0.5, 0.01 * rank);
/** Items each shop can put on sale (potion shop provisions, buyable pets). */
export const SUPPLY_STOCK = ITEMS_POOL.filter((i) => i.type === 'POTION' || i.id === 'upgrade_core' || i.type === 'REVIVE');
export const SHOP_STOCK_IDS: string[][] = [SUPPLY_STOCK.map((i) => i.id), PETS_POOL.filter((p) => !p.summonOnly).map((p) => p.id)];
/** (owner: no more random 'X% off' shop sales) kept as a no-op so old callers still work. */
export function rollSales(): Record<string, number> { return {}; }
/** Current sale fraction for a shop item (0 when not on sale). */
export const saleOf = (item: { id: string }): number => useGameStore.getState().shopSales[item.id] ?? 0;
/** Shop price after the item's random sale. */
/** The Pet House gives a new guard their first pet: the Green Blob is free while you own no pet at all. */
export const firstPetFree = (s: { equipment: Equipment; inventory: Item[]; warehouse: Item[] }, id: string): boolean =>
  id === 'pet_blob' && !s.equipment.pet && !s.inventory.some((i) => i.type === 'PET') && !s.warehouse.some((i) => i.type === 'PET');
/** Tutorial freebies like the first pet: each is free only while its main story step is active (the step ends with the
 *  action, so it is a one-time gift): "Stock Up" one Health Potion, "A Gift from the Stars" one gem summon, "Suit of
 *  Steel" one armor piece at the Armory, "Temper the Steel" one Blacksmith upgrade (no gold, no cores, sure success),
 *  "Lessons of the Blade" one skill level at the Skill Trainer (no skill points). */
export type QuestFreebie = 'potion' | 'summon' | 'armor' | 'forge' | 'train' | 'elixir';
export const questFree = (s: { story: StorySave }, what: QuestFreebie): boolean => STORY[s.story.step]?.id === what;
/** Armor pieces (the "Suit of Steel" step): body armor, helmets, gloves, boots. */
export const isArmorPiece = (i: { type: string }): boolean => i.type === 'ARMOR' || i.type === 'HELMET' || i.type === 'GLOVES' || i.type === 'BOOTS';
/** (owner) the "Suit of Steel" freebie: only the Common helmet of the hero's own class (the hero starts bareheaded). */
export const freeHelmetId = (hero: HeroClass): string => classWearId(hero, 'HELMET', 0);
export const freeBuy = (s: { story: StorySave; equipment: Equipment; inventory: Item[]; warehouse: Item[]; hero: HeroClass }, item: { id: string; type: string }): boolean =>
  firstPetFree(s, item.id) || (item.id === 'potion_hp' && questFree(s, 'potion')) || (item.id === freeHelmetId(s.hero) && questFree(s, 'armor'));
/** Skill mana cost multiplier per class (balance pass 2, owner: "Barbarian -60% is too much"). Tuned with the headless sim
 *  so every class spends its pool in long fights without being starved; regen stays at the owner's 1.0-1.5/s.
 *  Was: Wizard x1.3, Barbarian x0.4, others x1. */
export const CLASS_MANA_MUL: Partial<Record<HeroClass, number>> = { WIZARD: 1.0, BARBARIAN: 0.7, KNIGHT: 0.85, ARCHER: 0.75 };
export const shopPrice = (item: { id: string; price: number; type?: string }): number => Math.max(1, Math.round(item.price * buyMul(item.type) * (1 - saleOf(item))));

export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: COLORS.rarityCommon, UNCOMMON: COLORS.rarityUncommon, RARE: COLORS.rarityRare, EPIC: COLORS.rarityEpic,
  LEGENDARY: COLORS.rarityLegendary, MYTHIC: COLORS.rarityMythic,
};

// Summon odds (%): epic is very rare, legendary ultra rare, mythic hyper rare.
/** Shard altar (purple): the classic odds. */
/** (owner) summons can also give supplies: upgrade cores (tier I / II) and everything the Gem Shop sells (not shards / pets). */
export const SUMMON_SUPPLY_SHARE = 0.25;
export const SUMMON_SUPPLIES: [string, number][] = [
  ['upgrade_core', 30], ['upgrade_core_2', 6], ['revive_ankh', 4], ['reforge_stone', 8], ['temper_oil', 10], ['binding_seal', 5], ['augment_rune', 6], ['potion_hp_big', 13], ['potion_mana_big', 13],
];
const SUMMON_SUPPLY_TOTAL = SUMMON_SUPPLIES.reduce((n, [, w]) => n + w, 0);
export const SUMMON_WEIGHTS: Record<Rarity, number> = { COMMON: 72, UNCOMMON: 0, RARE: 24.75, EPIC: 3, LEGENDARY: 0.23, MYTHIC: 0.02 };   // (owner: gold / mythic rarer)
/** Gem altar (gold): premium odds. */
export const GEM_SUMMON_WEIGHTS: Record<Rarity, number> = { COMMON: 45, UNCOMMON: 0, RARE: 41.4, EPIC: 12, LEGENDARY: 1.45, MYTHIC: 0.15 };   // (owner: gold / mythic rarer)
export const GEM_SUMMON_CAPS: Partial<Record<Rarity, number>> = { EPIC: 3, LEGENDARY: 1, MYTHIC: 1 };
/** Crystal Altar (was the Shard Altar: owner - summoning with Common shards made no sense): Aether Crystals per pull. */
export const SHARD_COST_1 = 10;
export const SHARD_COST_10 = 90;
/** Max copies of a rarity a single summon (1x or 10x) can yield; extra rolls are downgraded to RARE. */
/** Gem cost of a single summon and of a 10x summon. */
/** Summon pity: every PITY_LEGEND-th draw on an altar is a Legendary; every PITY_MYTHIC-th is 80% Legendary / 20% Mythic. */
export const PITY_LEGEND = 60, PITY_MYTHIC = 240;
export type SummonPity = { GEM: number; SHARD: number };
const sanitizePity = (raw: unknown): SummonPity => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const v = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : 0);
  return { GEM: v(r.GEM), SHARD: v(r.SHARD) };
};
export const SUMMON_COST_1 = 10;
export const SUMMON_COST_10 = 90;
export const SUMMON_CAPS: Partial<Record<Rarity, number>> = { EPIC: 2, LEGENDARY: 1, MYTHIC: 1 };

const WEAPON_Q: Record<HeroClass, AbilityType> = {
  ARCHER: 'PIERCING_SHOT', WIZARD: 'GRAVITY_SPELL', BARBARIAN: 'RAGE', KNIGHT: 'RAGE', NECROMANCER: 'NONE',
};

const UPGRADE_SKILL_KEY: Partial<Record<UpgradeType, keyof SkillLevels>> = {
  SKILL_ORBITAL: 'orbital', SKILL_THUNDER: 'thunder', SKILL_REGEN: 'regen', SKILL_MAGNET: 'magnet',
  SKILL_DASH: 'dash', SKILL_WEAPON: 'weapon', SKILL_BARRIER: 'barrier', SKILL_STORM: 'storm',
  SKILL_PIERCING: 'q', SKILL_BURNING: 'burning', SKILL_FREEZING: 'freezing',
  SKILL_GRAVITY: 'q', SKILL_FREEZE_SPELL: 'freezeSpell', SKILL_RAGE: 'q', SKILL_STAMP: 'stamp', SKILL_WARCRY: 'warcry', SKILL_INSPIRE: 'inspire', SKILL_PIERCE_SHOT: 'pierceShot', SKILL_HOLY_WAVE: 'q', SKILL_CONSECRATE: 'consecrate', SKILL_SMITE: 'smite', SKILL_RADIANT: 'radiant', SKILL_GRAVECALL: 'graveCall', SKILL_SOULHARVEST: 'soulHarvest', SKILL_BONEARMOR: 'boneArmor',
};

// ------------------------------------------------------------------ helpers --
let uidCounter = 0;
/** The real profile while the showcase fight overlay is on (restored by endShowcase). */
let showcaseSnap: GameState | null = null;
const uid = (prefix = 'id'): string => `${prefix}_${Date.now().toString(36)}_${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const isStackable = (item: Item): boolean => item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE' || item.type === 'LOOT' || item.type === 'SHARD' || item.type === 'ELIXIR' || item.type === 'CRYSTAL';
const stackLimit = (item: Item): number => (item.type === 'SHARD' || item.type === 'CRYSTAL' ? 1e9 : item.type === 'LOOT' ? LOOT_STACK_LIMIT : POTION_STACK_LIMIT);
/** (owner) carry cap: at most POTION_CAP health potions (small + big together) and POTION_CAP mana potions. */
export const POTION_CAP = 50;
export const potionKind = (item: Item | null | undefined): 'hp' | 'mp' | null => (!item || item.type !== 'POTION' ? null : /health/i.test(item.name) ? 'hp' : /mana/i.test(item.name) ? 'mp' : null);
export const potionCount = (inv: Item[], kind: 'hp' | 'mp'): number => { let n = 0; for (const i of inv) if (potionKind(i) === kind) n += i.quantity || 1; return n; };
export const potionCapMsg = (kind: 'hp' | 'mp'): string => `You can carry at most ${POTION_CAP} ${kind === 'hp' ? 'health' : 'mana'} potions.`;
const isGear = (item: Item): boolean => item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY' || item.type === 'HELMET' || item.type === 'GLOVES' || item.type === 'BOOTS';

/** Combat power of one item (UI comparison / auto-equip). */
export const calculateItemCP = (item: Item): number => {
  if (item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE' || item.type === 'ELIXIR') return 0;
  if (!item.stats) return 0;
  const s = item.stats;
  let cp = 0;
  const petMul = petPower(item); // pet growth (level + evolution) scales its stats
  if (s.damage) cp += s.damage * 10;
  if (s.maxHealth) cp += s.maxHealth;
  if (s.defense) cp += s.defense * 8;
  if (s.moveSpeed) cp += s.moveSpeed * 500;
  if (s.fireRate) cp += s.fireRate * 100;
  if (s.regen) cp += s.regen * 50;
  if (s.manaRegen) cp += s.manaRegen * 50;
  if (s.critRate) cp += s.critRate * 500;
  if (s.critDamage) cp += s.critDamage * 100;
  if (s.cooldownReduction) cp += s.cooldownReduction * 500;
  if (s.skillDamage) cp += s.skillDamage * 100;
  if (s.multishot) cp += s.multishot * 200;
  if (s.dodge) cp += s.dodge * 500;
  const mult: Record<Rarity, number> = { COMMON: 1, UNCOMMON: 1.1, RARE: 1.2, EPIC: 1.5, LEGENDARY: 2.0, MYTHIC: 3.0 };
  cp += affixCP(item);
  if (charmOf(item)) cp += 350;   // the accessory's special effect
  return Math.floor(cp * petMul * mult[item.rarity]);
};

/** Combat power of the whole character. */
export const calculateTotalCP = (stats: PlayerStats): number => {
  let cp = 0;
  cp += stats.damage * 10;
  cp += stats.maxHealth;
  cp += stats.defense * 8;
  cp += stats.moveSpeed * 50;
  cp += stats.fireRate * 50;
  cp += stats.regen * 50;
  cp += stats.manaRegen * 50;
  cp += stats.critRate * 500;
  cp += stats.critDamage * 100;
  cp += stats.cooldownReduction * 500;
  cp += stats.skillDamage * 100;
  cp += stats.multishot * 200;
  cp += stats.dodge * 500;
  cp += stats.lifeSteal * 3000 + stats.thorns * 8 + stats.goldFind * 200 + stats.xpBonus * 200 + stats.pierceBonus * 150;
  cp += stats.onHitBurnChance * 300 + stats.onHitSlowChance * 300 + stats.dmgReduce * 1500 + stats.dashCharges * 300;
  return Math.floor(cp);
};

/** (owner balance) hard caps on the percentage stats, applied last (gear + pet + talents + attributes + sets together). */
/** (owner) hero HP and every source of bonus HP x2 (heals / regen stay as they are); incoming damage is x2 too
 *  (engine/systems/combat.ts damagePlayer: monsters, bosses, traps, lava, spikes). */
export const HP_INFLATE = 1.6, DMG_INFLATE = 2;   // (owner) hero HP x2 then -20% (every HP source: base, items, upgrades, cards)
/** last time each WARNING toast text was shown (addNotification de-dupes repeats within 3 s) */
const warnAt = new Map<string, number>();
export const STAT_CAPS = { critRate: 0.5, cooldownReduction: 0.4, dodge: 0.35, lifeSteal: 0.15 } as const;

/** baseStats + equipment (+ affixes, set bonuses, talents). Temporary buffs (rage / sprint) are applied by the engine. */
const calculateStats = (base: PlayerStats, equipment: Equipment, hero: HeroClass, talents: Record<HeroClass, TalentRanks>, attrs?: Attrs): PlayerStats => {
  const final: PlayerStats = { ...base };
  if (!final.attackRange) final.attackRange = 0;   // (stat added later: older saved base stats lack it)
  const acc = newAcc();

  (Object.values(equipment) as (Item | null)[]).forEach((item) => {
    if (!item || !item.stats) return;
    (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
      let v = item.stats[k];
      if (v === undefined || v === null) return;
      if (item.type === 'WEAPON' && k === 'damage') v *= 0.5;
      if (item.type === 'ARMOR' && k === 'defense') v *= 0.5;
      if (item.type === 'PET') v *= petStatMul(item, k);
      final[k] += v;
    });
    if (item.affixes) for (const a of item.affixes) accumulate(acc, affixFx(a));
    accumulate(acc, charmFx(item));   // Epic+ accessories: their special effect (accessoryCharms.ts)
  });
  accumulateSets(acc, equipment);
  accumulateTalents(acc, hero, talents[hero]);
  applyAcc(final, acc);

  if (equipment.weapon && equipment.weapon.projectileType === 'MAGIC') final.fireRate *= 0.5;
  const wp = weaponPerk(equipment.weapon);   // axe perk: Bloodthirst = life steal
  if (wp?.k === 'LIFESTEAL') final.lifeSteal += lifeStealOf(wp.lv);
  if (final.multishot > MULTISHOT_CAP) final.multishot = MULTISHOT_CAP;
  applyAttrs(final, attrs);   // STR / DEX / INT / VIT / LUK (attributes.ts)
  if (hero === 'WIZARD') { final.maxHealth = Math.round(final.maxHealth * 0.75); final.moveSpeed *= 0.85; final.damage *= 0.85; }   // (damage feeds basic attacks and skills)   // fragile, slow caster (user tuning)
  for (const k of Object.keys(STAT_CAPS) as (keyof typeof STAT_CAPS)[]) if (final[k] > STAT_CAPS[k]) final[k] = STAT_CAPS[k];   // (owner) hard caps
  final.maxHealth = Math.round(final.maxHealth * HP_INFLATE);   // (owner) every HP source doubled
  return final;
};

/** Stats incl. temporary buffs from the engine (rage / sprint). Allocates; do not call per frame. */
export const getEffectiveStats = (): PlayerStats => {
  const s = useGameStore.getState().stats;
  const p = world.player;
  const out = { ...s };
  if (p.rageT > 0) out.fireRate *= 2;
  if (p.cryT > 0) out.damage *= 1.3;
  if (p.titanT > 0) { out.damage *= 1.5; out.knockback += 1; }
  return out;
};

/** Class proc skills start unlocked at level 1 each run. */
const PROC_START: Record<HeroClass, Partial<SkillLevels>> = {
  ARCHER: { burning: 1, freezing: 1 }, WIZARD: { thunder: 1 }, BARBARIAN: { stamp: 1 }, KNIGHT: { consecrate: 1 }, NECROMANCER: { graveCall: 1 },
};

/** Skill-level key an upgrade card raises (the class dash card follows the hero: Shadow Roll / Blink Nova use `e`). */
const skillKeyFor = (type: UpgradeType, hero: HeroClass): keyof SkillLevels | undefined => (type === 'SKILL_DASH' && hero !== 'BARBARIAN' ? 'e' : UPGRADE_SKILL_KEY[type]);

const getSkillCardDetails = (key: keyof SkillLevels, level: number, stats: PlayerStats, hero: HeroClass = 'ARCHER'): string => {
  const f = (n: number) => Number(n.toFixed(1));
  const dmg = stats.damage;
  const nextLvl = level + 1;

  if (key === 'orbital') {
    const count = 1 + level, nextCount = 1 + nextLvl;
    const d = f(dmg * 0.9 * (1 + level * 0.1));
    const nextD = f(dmg * 0.9 * (1 + nextLvl * 0.1));
    if (level === 0) return `Unlock: Summons 2 blades dealing ${f(dmg * 0.9)} dmg/hit.`;
    return `Blades: ${count} -> ${nextCount}. Dmg: ${d} -> ${nextD}.`;
  }
  if (key === 'thunder' || key === 'burning' || key === 'freezing' || key === 'stamp') {
    const n = (l: number) => Math.max(6, 13 - l);
    const every = level === 0 ? `Unlock: every ${n(1)}th attack` : `Every ${n(level)}th attack -> every ${n(nextLvl)}th`;
    if (key === 'thunder') return `${every}: chain lightning hits ${1 + (level || 1)}${level ? ` -> ${1 + nextLvl}` : ''} enemies. Dmg: ${f(dmg * 0.585 * stats.skillDamage * (1 + 0.15 * Math.max(0, level - 1)))}${level ? ` -> ${f(dmg * 0.585 * stats.skillDamage * (1 + 0.15 * level))}` : ''}.`;
    if (key === 'stamp') return `${every}: Axe Storm: 3 giant ricocheting axes, breaks armor. Dmg: ${f(dmg * 2.2 * stats.skillDamage * (1 + 0.15 * Math.max(0, (level || 1) - 1)))}${level ? ` -> ${f(dmg * 2.2 * stats.skillDamage * (1 + 0.15 * level))}` : ''} each.`;
    if (key === 'burning') return `${every}: fire arrow (pierce 3, burn, small blast). Stronger per level.`;
    return `${every}: ice arrow (strong slow, small blast). Slow lasts ${f(3 + 0.3 * (level || 1))}s${level ? ` -> ${f(3 + 0.3 * nextLvl)}s` : ''}.`;
  }
  if (key === 'barrier') {
    const dur = f(1.0 + level * 0.2), ndur = f(1.0 + nextLvl * 0.2);
    const cd = f(Math.max(20, 48 - level * 4)), ncd = f(Math.max(20, 48 - nextLvl * 4));
    const charges = level >= 5 ? 2 : 1, ncharges = nextLvl >= 5 ? 2 : 1;
    if (level === 0) return 'Unlock: When a hit would drop you below 20% HP, grants invulnerability (1.2s) and a stunning shockwave (1 charge, 48s recharge).';
    if (ncharges > charges) return `LEVEL ${nextLvl} UNLOCK: MAX CHARGES +1 (Total 2)!`;
    return `Invuln: ${dur}s -> ${ndur}s. CD: ${cd}s -> ${ncd}s.`;
  }
  if (key === 'dash' || (key === 'e' && hero !== 'BARBARIAN')) {
    if (level === 0) return 'Unlock: your dash deals damage.';
    return 'Dash damage increased.';
  }
  if (level === 0) return 'Unlocks this skill.';
  return 'Improves skill stats & mana cost.';
};

/** Rolls the run reward cards (rarity tiers, specials, Death Defiance: engine/runCards.ts). Skill cards are no longer offered (Skill Trainer). */
const generateUpgradeOptions = (_hero: HeroClass, skillLevels: SkillLevels, _stats: PlayerStats, count = 2, picks?: Upgrade[]): Upgrade[] => {
  const st = useGameStore.getState(), rp = picks ?? st.runPicks;
  // Lucky Start (Tech House): the very first card choice of an adventure run (first biome) always holds an Epic card
  const epic = techLv(st.tech, 'lucky') > 0 && rp.length === 0 && runInfo.mode === 'ADVENTURE' && world.room.biome === 0;
  return rollRunCards(count, (skillLevels.ult ?? 0) > 0, String(world.room.biome), { trend: trendCounts(rp), epic }).map((c) => withCardText({ ...c, id: uid('card') }));
};
/** The store rewrites the Max HP number with HP_INFLATE (the catalogue lists the base value). */
const withCardText = (opt: Upgrade): Upgrade => { if (opt.type === 'HEALTH') opt.description = `+${Math.round(opt.value * HP_INFLATE)} Max HP`; return opt; };

/** Adds Upgrade Cores to the bag (stacks onto an existing core stack). */
const addCores = (inv: Item[], n: number): Item[] => {
  if (n <= 0) return inv;
  const idx = inv.findIndex((i) => coreTierOf(i) === 0);
  if (idx >= 0) { const out = inv.slice(); out[idx] = { ...out[idx], quantity: (out[idx].quantity || 1) + n }; return out; }
  const tpl = ITEMS_POOL.find((i) => i.id === 'upgrade_core')!;
  return [...inv, { ...tpl, id: uid('it'), stats: {}, quantity: n }];
};

export const instantiate = (template: Item, grade?: import('./types').ItemGrade): Item => rollGrade(rollAffixes({
  ...template,
  level: isGear(template) || template.type === 'PET' ? template.level : 1,
  id: uid('it'),
  stats: { ...template.stats },
  onHitEffect: template.onHitEffect ? { ...template.onHitEffect } : undefined,
  affixes: undefined,
  grade: undefined,
  quantity: 1,
}), Math.random, GRADE_HIGH_CHANCE, grade);   // gear rolls LOW / HIGH grade (grade.ts)

const mutableStatKeys = (stats: Partial<PlayerStats>): (keyof PlayerStats)[] => Object.keys(stats) as (keyof PlayerStats)[];
/** One +level on a gear item, the same step as a blacksmith upgrade (+25% of the base per level; % stats a third as fast). */
export const plusOne = (i: Item): Item => {
  const stats: Partial<PlayerStats> = { ...i.stats };
  const lvl = Math.max(1, i.level), f = plusMul(lvl + 1) / plusMul(lvl);
  for (const k of mutableStatKeys(stats)) {
    const v = stats[k];
    if (v === undefined) continue;
    stats[k] = parseFloat((v * (PET_PCT_STATS.has(k) ? 1 + (f - 1) / 3 : f)).toFixed(PET_PCT_STATS.has(k) ? 4 : 2));
  }
  return { ...i, level: i.level + 1, stats };
};
/** (owner) Gear from elites / mini bosses / bosses can drop already upgraded, up to +4 (each step rarer). tier: 0 elite, 1 mini / champion, 2 boss. */
export function rollDropPlus(i: Item | null, tier: 0 | 1 | 2): Item | null {
  if (!i || !isGear(i)) return i;
  const p = [[0.18, 0.06, 0.015, 0.003], [0.3, 0.12, 0.04, 0.01], [0.42, 0.2, 0.07, 0.02]][tier];   // chance of at least +1, +2, +3, +4
  const r = Math.random();
  let n = 0;
  for (let k = 0; k < 4; k++) if (r < p[k]) n = k + 1;
  let out = i;
  for (let k = 0; k < n; k++) out = plusOne(out);
  return out;
}

// -------------------------------------------------------------- persistence --
/** Old saves: gear without a grade is rescaled to the new tier ladder once and stamped LOW (grade.ts migrateGear). */
const migrateEquipment = (e: Equipment): Equipment => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, migrateGear(v as Item | null)])) as unknown as Equipment;
interface Profile {
  v: number;
  gold: number; gems: number; crystals?: number;
  inventory: Item[]; equipment: Equipment; materials: Record<Rarity, number>; maxInventorySlots: number;
  warehouse?: Item[]; warehouseGold?: number;
  progress?: RunProgress;   // ending / ascension / endless tower records
  tech?: TechLevels;        // Tech House upgrades
  story?: StorySave;        // main story chain (story.ts)
  classProg?: Record<HeroClass, ClassProg>;   // permanent per-class level / xp / skill points / learned skills
  summonPity?: SummonPity;  // draws so far per altar (guaranteed Legendary every 60, Legendary/Mythic every 240)
  npcQuests?: NpcQuestSave;   // NPC story quests (npcQuests.ts)
  unlocks?: UnlockSave;       // death-unlocked quest beats (questUnlocks.ts)
  dashMods?: Record<string, string>;   // chosen Dash Charm per class (dashMods.ts)
  questSeen?: string[];       // quest ids the hero has already viewed (red dots, questSeen.ts)
  heroRank: number; rankXp: number;
  gameStats: GameStatistics; settings: Settings;
  welcomeGiftClaimed: boolean;
  hero: HeroClass; difficulty: Difficulty;
  talents: Record<HeroClass, TalentRanks>;
  attrs?: Record<HeroClass, Attrs>;   // allocated attribute points per class (attributes.ts)
  starterGiven: Record<HeroClass, boolean>;
  discovered?: Discovered; codexClaimed?: string[];
  gems1k?: boolean;   // one-time top-up of older saves to the 1000-gem start
  zoom1?: boolean;    // one-time reset of the saved camera zoom to the 1.0 default
  al1?: boolean;      // one-time: auto loot defaults (Uncommon+ gear, every material)
  sp2?: boolean;      // one-time: 2 skill points per level - older saves get the extra point for every level already gained
  mus1?: boolean;     // one-time: background music 20% quieter (owner)
  zoom2?: boolean;    // one-time: zoom unlocked by default (base 1.0)
  gold10?: boolean;   // one-time x10 economy migration (gold + stored item prices)
  meta?: MetaState;   // daily / weekly goals, achievements, equipped title (goals.ts)
  elixirs?: string[]; // elixirs drunk in town, waiting for the next run (elixirs.ts)
}

export const makeItemById = (id: string, quantity: number): Item[] => {
  const tpl = ITEMS_POOL.find((i) => i.id === id);
  return tpl ? [{ ...tpl, level: isGear(tpl) || tpl.type === 'PET' ? tpl.level : 1, stats: { ...tpl.stats }, id: uid('gift'), quantity }] : [];
};

/** One-time welcome gift for a brand new profile. */
const WELCOME_GIFT = { gold: 5000, gems: 500 };   // (owner: start with 5k gold, 500 gems)
/** Saved pets take their template's current tier (owner: pets spread over the six tiers). */
/** Saved pets follow their template's current tier and skill (owner: e.g. the Green Blob became a fighter, the Fairy heals less). */
const petRetier = (i: Item): Item => { if (i && i.type === 'POTION') { const t = ITEMS_POOL.find((q) => q.name === i.name); return t ? { ...i, description: t.description } : i; }   // (potion texts follow the catalog)
  if (!i || i.type !== 'PET') return i; const t = PETS_POOL.find((q) => q.name === i.name); return t ? { ...i, rarity: t.rarity, petSkill: t.petSkill, petValue: t.petValue, petCooldown: t.petCooldown, description: t.description } : i; };
const welcomeItems = (): Item[] => [...makeItemById('potion_hp', 3), ...makeItemById('potion_mana', 3), ...makeItemById('revive_ankh', 1), ...makeItemById('upgrade_core', 5)];


/** One-time (owner): skill points went from 1 to 2 per level - each class gets +1 SP for every level it already has. */
const spMigrate = (cp: Record<HeroClass, ClassProg>, done: boolean): Record<HeroClass, ClassProg> => {
  if (done) return cp;
  const out = { ...cp };
  for (const h of Object.keys(out) as HeroClass[]) out[h] = { ...out[h], sp: out[h].sp + (SP_PER_LEVEL - 1) * Math.max(0, out[h].lv - 1) };
  return out;
};

const baseGameStats = (): GameStatistics => ({
  ...INITIAL_GAME_STATS, classRuns: { ...INITIAL_GAME_STATS.classRuns }, classHighestWave: { ...INITIAL_GAME_STATS.classHighestWave },
});

/** Full COMMON starter set (weapon + helmet/armor/gloves/boots/accessory) for a class. */
const starterPiece = (id: string): Item | null => {
  const tpl = ITEMS_POOL.find((i) => i.id === id);
  return tpl ? { ...instantiate(tpl, 'LOW'), id: uid('start') } : null;
};
const starterEquipment = (hero: HeroClass): Equipment => {
  const g = STARTER_GEAR[hero];
  return {
    ...EMPTY_EQUIPMENT,
    weapon: starterPiece(HERO_STATS[hero].weaponId),
    // (owner: no helmet at the start; the Armory gives the first one)
    helmet: null, armor: starterPiece(g.armor), gloves: starterPiece(g.gloves), boots: starterPiece(g.boots), accessory: starterPiece(g.accessory),
  };
};
const isStarterId = (id: string | undefined): boolean => !!id && id.startsWith('start_');

/** A brand-new profile with the welcome gift applied (welcomeGiftClaimed = true). */
const freshProfile = (settings?: Settings, gameStats?: GameStatistics): Profile => ({
  v: PROFILE_VERSION,
  gold: WELCOME_GIFT.gold, gems: WELCOME_GIFT.gems, crystals: 20,
  inventory: welcomeItems(), equipment: starterEquipment('ARCHER'), materials: emptyMaterials(), maxInventorySlots: INVENTORY_LIMIT,
  heroRank: 1, rankXp: 0, npcQuests: emptyNpcQuests(), unlocks: emptyUnlocks(), questSeen: null, classProg: sanitizeClassProg(undefined, INITIAL_SKILLS, 1),
  gameStats: gameStats ?? baseGameStats(), settings: settings ?? { ...DEFAULT_SETTINGS },
  welcomeGiftClaimed: true, hero: 'ARCHER', difficulty: 'NORMAL',
  talents: emptyTalents(), attrs: sanitizeAttrs(undefined), starterGiven: { ARCHER: true, WIZARD: false, BARBARIAN: false, KNIGHT: false, NECROMANCER: false },
  discovered: emptyDiscovered(), codexClaimed: [],
  meta: freshMeta(),
});

const sanitizeDiscovered = (d: unknown): Discovered => {
  const out = emptyDiscovered();
  if (d && typeof d === 'object') for (const k of Object.keys(out) as (keyof Discovered)[]) { const a = (d as any)[k]; if (Array.isArray(a)) out[k] = a.filter((x) => typeof x === 'string'); }
  return out;
};

const num = (v: unknown, d: number, min = 0): number => (typeof v === 'number' && isFinite(v) ? Math.max(min, v) : d);

const mergeStats = (gs?: Partial<GameStatistics>): GameStatistics => {
  const f = baseGameStats();
  return gs ? { ...f, ...gs, classRuns: { ...f.classRuns, ...gs.classRuns }, classHighestWave: { ...f.classHighestWave, ...gs.classHighestWave } } : f;
};

/** Returns { profile, gift } where gift is true when a fresh profile was just created. */
const loadProfile = (): { profile: Profile; gift: boolean } => {
  let legacy: { settings?: Settings; gameStats?: GameStatistics } = {};
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Profile>;
        if (p && typeof p === 'object' && p.v === PROFILE_VERSION) {
          const f = freshProfile();
          return {
            gift: false,
            profile: {
              v: PROFILE_VERSION,
              gold: num(p.gold, 0) * (p.gold10 ? 1 : GOLD_SCALE), gems: p.gems1k ? num(p.gems, 0) : Math.max(num(p.gems, 0), WELCOME_GIFT.gems), crystals: num(p.crystals, 20),
              inventory: Array.isArray(p.inventory) ? p.inventory.map(petRetier).map(migrateGear).map((i) => (!isGear(i) && i.type !== 'PET' && i.level !== 1 ? { ...i, level: 1 } : i)).map((i) => (p.gold10 ? i : { ...i, price: Math.round((i.price || 0) * GOLD_SCALE) })) : [],
              equipment: migrateEquipment(p.gold10 ? { ...EMPTY_EQUIPMENT, ...(p.equipment ?? {}), pet: p.equipment?.pet ? petRetier(p.equipment.pet) : null } : Object.fromEntries(Object.entries({ ...EMPTY_EQUIPMENT, ...(p.equipment ?? {}) }).map(([k, v]) => [k, v ? { ...(v as Item), price: Math.round(((v as Item).price || 0) * GOLD_SCALE) } : v])) as unknown as Equipment),
              materials: { ...emptyMaterials(), ...(p.materials ?? {}) },   // (pet tiers re-synced below: petRetier)
              maxInventorySlots: Math.max(INVENTORY_LIMIT, num(p.maxInventorySlots, INVENTORY_LIMIT)),
              warehouse: Array.isArray(p.warehouse) ? p.warehouse.slice(0, WAREHOUSE_LIMIT + 25 * techLv(sanitizeTech(p.tech), 'warehouse')) : [], warehouseGold: Math.max(0, num(p.warehouseGold, 0)), progress: sanitizeProgress(p.progress), tech: sanitizeTech(p.tech, num(p.progress?.caveLantern, 0)), summonPity: sanitizePity(p.summonPity), story: sanitizeStory(p.story, sanitizeProgress(p.progress).endings, false), classProg: spMigrate(sanitizeClassProg(p.classProg, INITIAL_SKILLS, num(p.heroRank, 1)), !!p.sp2),
              npcQuests: sanitizeNpcQuests(p.npcQuests),
              unlocks: sanitizeUnlocks(p.unlocks, sanitizeStory(p.story, sanitizeProgress(p.progress).endings, false).step, (id) => !!sanitizeNpcQuests(p.npcQuests).q[id]),   // (old saves: everything already reached stays open)
              dashMods: sanitizeDashMods(p.dashMods),
              questSeen: Array.isArray(p.questSeen) ? p.questSeen.filter((x: unknown) => typeof x === 'string').slice(-400) : undefined,
              heroRank: Math.max(1, Math.floor(num(p.heroRank, 1))), rankXp: num(p.rankXp, 0),
              gameStats: mergeStats(p.gameStats), settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), ...(p.mus1 ? {} : { musicVolume: Math.round((p.settings?.musicVolume ?? 0.5) * 80) / 100 }), ...(p.al1 ? {} : { autoLootGear: 'UNCOMMON' as const, autoLootMaterials: true, clickMove: true }) },
              welcomeGiftClaimed: p.welcomeGiftClaimed !== false,
              hero: p.hero === 'WIZARD' || p.hero === 'BARBARIAN' || p.hero === 'KNIGHT' || p.hero === 'NECROMANCER' ? p.hero : f.hero,
              difficulty: p.settings?.hardMode && sanitizeProgress(p.progress).endings > 0 ? 'HARD' : 'NORMAL',   // (Hard mode: Settings toggle, locked until the first ending)
              attrs: sanitizeAttrs(p.attrs),
              talents: sanitizeTalents(p.talents),
              starterGiven: { ...f.starterGiven, ...(p.starterGiven ?? {}), [p.hero === 'WIZARD' || p.hero === 'BARBARIAN' || p.hero === 'KNIGHT' || p.hero === 'NECROMANCER' ? p.hero : 'ARCHER']: true },
              discovered: sanitizeDiscovered(p.discovered),
              codexClaimed: Array.isArray(p.codexClaimed) ? p.codexClaimed.filter((x) => typeof x === 'string') : [],
              meta: sanitizeMeta(p.meta),
              elixirs: Array.isArray(p.elixirs) ? p.elixirs.filter(isElixirId) : [],
            },
          };
        }
      }
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        const o = JSON.parse(old) as { settings?: Settings; gameStats?: GameStatistics };
        legacy = { settings: { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) }, gameStats: mergeStats(o.gameStats) };
      }
    }
  } catch { /* corrupt or unavailable storage -> fresh profile */ }
  return { profile: freshProfile(legacy.settings, legacy.gameStats), gift: true };
};

const DIFFICULTIES: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];

// ---- ending / ascension / endless tower records
const ALL_HEROES: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
const sanitizeProgress = (p: Partial<RunProgress> | undefined): RunProgress => ({
  endings: Math.max(0, num(p?.endings, 0)),
  ascensionMax: Math.max(0, Math.min(ASCENSION_MAX, num(p?.ascensionMax, 0))),
  ascension: Math.max(0, Math.min(ASCENSION_MAX, num(p?.ascension, 0))),
  towerBest: { ARCHER: num(p?.towerBest?.ARCHER, 0), WIZARD: num(p?.towerBest?.WIZARD, 0), BARBARIAN: num(p?.towerBest?.BARBARIAN, 0), KNIGHT: num(p?.towerBest?.KNIGHT, 0), NECROMANCER: num(p?.towerBest?.NECROMANCER, 0) },
  daily: sanitizeDaily(p?.daily),   // Daily Trial: today's best, streak, reward claimed
  wavesBest: Object.fromEntries(ALL_HEROES.map((h) => [h, Math.max(0, num(p?.wavesBest?.[h], 0))])) as Record<HeroClass, number>,   // Endless Waves best wave per class
  wavesClaimed: Object.fromEntries(ALL_HEROES.map((h) => [h, Array.isArray(p?.wavesClaimed?.[h]) ? (p!.wavesClaimed![h] as unknown[]).map(Number).filter((n) => (WAVE_MILESTONES as readonly number[]).includes(n)) : []])) as Record<HeroClass, number[]>,
  towerClaimed: Object.fromEntries((['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'] as HeroClass[]).map((h) => [h, Array.isArray(p?.towerClaimed?.[h]) ? (p!.towerClaimed![h] as unknown[]).map(Number).filter((n) => n > 0 && n % 10 === 0) : []])) as Record<HeroClass, number[]>,
  caveLantern: Math.max(0, Math.min(6, Math.floor(num(p?.caveLantern, 0)))), caveBest: Math.max(1, Math.min(30, Math.floor(num(p?.caveBest, 1)))),
  biomesDone: Array.isArray(p?.biomesDone) ? [...new Set((p!.biomesDone as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 64))] : [], shortcutSeen: !!p?.shortcutSeen,
});

const stampOne = <T extends Item | null | undefined>(i: T): T => (i && !i.grade && ['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY'].includes(i.type) ? { ...i, grade: 'LOW' } : i);
const stampGrades = (s: GameState): GameState => ({ ...s, inventory: s.inventory.some((i) => stampOne(i) !== i) ? s.inventory.map(stampOne) : s.inventory,
  warehouse: s.warehouse.some((i) => stampOne(i) !== i) ? s.warehouse.map(stampOne) : s.warehouse,
  equipment: Object.values(s.equipment).some((i) => stampOne(i as Item | null) !== i) ? Object.fromEntries(Object.entries(s.equipment).map(([k, v]) => [k, stampOne(v as Item | null)])) as unknown as Equipment : s.equipment });
const writeProfile = (s: GameState): void => {
  if (showcase.on) return;   // (the showcase overlay is never saved)
  try {
    if (typeof localStorage === 'undefined') return;
    s = stampGrades(s);   // (gear made at runtime always carries a grade, so the load migration never rescales it)
    const p: Profile = {
      v: PROFILE_VERSION, gold: s.gold, gems: s.gems, crystals: s.crystals, inventory: s.inventory, equipment: s.equipment, materials: s.materials,
      maxInventorySlots: s.maxInventorySlots, warehouse: s.warehouse, warehouseGold: s.warehouseGold, progress: s.progress, tech: s.tech, summonPity: s.summonPity, story: s.story, classProg: s.classProg, npcQuests: s.npcQuests, unlocks: s.unlocks, dashMods: s.dashMods, questSeen: s.questSeen ?? undefined, heroRank: s.heroRank, rankXp: s.rankXp,
      gameStats: s.gameStats, settings: s.settings, welcomeGiftClaimed: s.welcomeGiftClaimed, hero: s.hero, difficulty: s.difficulty,
      talents: s.talents, attrs: s.attrs, starterGiven: s.starterGiven, discovered: s.discovered, codexClaimed: s.codexClaimed, meta: s.meta, elixirs: s.elixirsNext, gems1k: true, zoom1: true, zoom2: true, mus1: true, sp2: true, al1: true, gold10: true,
    };
    p.warehouse = []; p.warehouseGold = 0;   // (lives in the shared warehouse)
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    writeSharedWh(s.warehouse, s.warehouseGold);
  } catch {
    /* storage unavailable (private mode, quota) — ignore */
  }
};

const loaded = loadProfile();
const profile = loaded.profile;

// ---- shared warehouse: one storage for all characters (its own key). Each character's old per-profile warehouse is
// merged in once (the profile keys already merged are remembered), then profiles store an empty warehouse.
const SHARED_WH_KEY = 'aether-survivor-shared-warehouse-v1';
interface SharedWh { items: Item[]; gold: number; merged: string[] }
const sharedWh: SharedWh = (() => {
  let w: SharedWh = { items: [], gold: 0, merged: [] };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SHARED_WH_KEY) : null;
    const p = raw ? JSON.parse(raw) as Partial<SharedWh> : null;
    if (p && typeof p === 'object') w = { items: Array.isArray(p.items) ? p.items : [], gold: num(p.gold, 0), merged: Array.isArray(p.merged) ? p.merged : [] };
  } catch { /* corrupt / unavailable: start empty */ }
  if (!w.merged.includes(PROFILE_KEY)) {
    w = { items: [...w.items, ...(profile.warehouse ?? [])], gold: w.gold + (profile.warehouseGold ?? 0), merged: [...w.merged, PROFILE_KEY] };
  }
  w = { ...w, items: w.items.map(migrateGear) };
  return w;
})();
profile.warehouse = sharedWh.items; profile.warehouseGold = sharedWh.gold;
const writeSharedWh = (items: Item[], gold: number): void => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SHARED_WH_KEY, JSON.stringify({ items, gold, merged: sharedWh.merged })); } catch { /* ignore */ }
};
writeSharedWh(sharedWh.items, sharedWh.gold);

// -------------------------------------------------------------------- store --
export const useGameStore = create<GameState>()((set, get) => {
  /** Stack-aware insert. Returns the new inventory or null when it does not fit. */
  /** Newly acquired gear / consumables / pets get the bag's "new" dot; monster loot (goblin ears, pelts...) never does. */
  const markNew = (item: Item): Item => (item.type === 'LOOT' || item.isNew ? item : { ...item, isNew: true });
  const insertItem = (inventory: Item[], maxSlots: number, item: Item): Item[] | null => {
    const inv = inventory.slice();
    if (isStackable(item)) {
      let remaining = item.quantity || 1;
      for (let i = 0; i < inv.length && remaining > 0; i++) {
        const s = inv[i];
        if (s.name !== item.name || s.type !== item.type) continue;
        const q = s.quantity || 1;
        if (q >= stackLimit(item)) continue;
        const add = Math.min(remaining, stackLimit(item) - q);
        inv[i] = { ...s, quantity: q + add, ...(item.isNew ? { isNew: true } : {}) };   // a new item merged into a stack marks the stack
        remaining -= add;
      }
      while (remaining > 0) {
        if (inv.length >= maxSlots) return null;
        const q = Math.min(remaining, stackLimit(item));
        inv.push({ ...item, id: inv.some((x) => x.id === item.id) ? uid('it') : item.id, quantity: q });
        remaining -= q;
      }
      return inv;
    }
    if (inv.length >= maxSlots) return null;
    inv.push({ ...item, quantity: 1 });
    return inv;
  };

  const classOf = (item: Item): AbilityType | null =>
    item.type === 'WEAPON' && itemClass(item) ? WEAPON_Q[itemClass(item)!] : null;

  const notify = (msg: string, color = 'white', type: GameNotification['type'] = 'SYSTEM', action?: GameNotification['action']) =>
    get().addNotification(msg, color, type, action);

  /** Which panel flags are open. */
  const anyPanelOpen = (s: GameState) => s.isInventoryOpen || s.isShopOpen || s.isCharacterSheetOpen;

  /** Panels (inventory/shops/character/codex) never pause the simulation; only the explicit pause menu does. */
  const syncPause = (_panelsOpen: boolean): Partial<GameState> => ({});

  const canOpenPanels = () => {
    const st = get().status;
    return st !== GameStatus.LEVEL_UP && st !== GameStatus.GAME_OVER;
  };

  const calc = (base: PlayerStats, equipment: Equipment): PlayerStats => calculateStats(base, equipment, get().hero, get().talents, get().attrs?.[get().hero]);

  /** Hero starting stats + class-locked loadout swap (foreign weapon -> bag, starter weapon / pet if missing). */
  const loadoutFor = (hero: HeroClass, inv: Item[], eq: Equipment, talents?: Record<HeroClass, TalentRanks>) => {
    const heroInfo = HERO_STATS[hero];
    let baseStats: PlayerStats = { ...INITIAL_STATS, ...heroInfo.stats };
    for (let i = 1; i < progOf(hero).lv; i++) baseStats = growBase(baseStats, hero);   // permanent class level growth
    const tech = (() => { try { return get()?.tech ?? profile.tech; } catch { return profile.tech; } })();   // Tech House upgrades
    baseStats.goldFind += 0.04 * techLv(tech, 'gold'); baseStats.xpBonus += 0.04 * techLv(tech, 'xp');
    baseStats.maxHealth = Math.round(baseStats.maxHealth * (1 + 0.03 * techLv(tech, 'vitality')));
    const inventory = inv.slice();
    const equipment: Equipment = { ...eq };
    for (const sl of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as const) {   // other-class gear goes back to the bag
      const w = equipment[sl];
      if (w && !canUseClass(w, hero)) { inventory.push(w); equipment[sl] = null; }
    }
    if (!equipment.weapon) {
      // prefer the best class weapon already in the bag; only mint a starter when there is none
      const own = inventory.filter((i) => i.type === 'WEAPON' && i.classType === hero && profileRank() >= RANK_REQ[i.rarity])
        .sort((a, b) => calculateItemCP(b) - calculateItemCP(a))[0];
      if (own) { inventory.splice(inventory.indexOf(own), 1); equipment.weapon = own; }
      else {
        const tpl = ITEMS_POOL.find((i) => i.id === heroInfo.weaponId);
        if (tpl) equipment.weapon = { ...instantiate(tpl, 'LOW'), id: uid('start_wep') };
      }
    }
    return { baseStats, inventory, equipment, stats: calculateStats(baseStats, equipment, hero, talents ?? get().talents, attrsOf(hero)) };
  };

  /** In-run state: everything here resets each run. The profile (gold, items, rank, ...) is never touched. */
  /** The permanent progress of `hero` (level, xp, skill points, learned skills). */
  const progOf = (hero: HeroClass): ClassProg => {
    const cp = (() => { try { return get()?.classProg ?? profile.classProg; } catch { return profile.classProg; } })();
    return cp?.[hero] ?? freshClass(hero, INITIAL_SKILLS);
  };
  /** Per-run state. Level, xp, skill points and learned skills come from the class's permanent progress. */
  const runState = (hero: HeroClass, base: PlayerStats, stats: PlayerStats) => ({
    wave: 1,
    level: progOf(hero).lv,
    heroRank: progOf(hero).lv,   // (legacy name: gear / quests / talents read it; always = the class level)
    experience: progOf(hero).xp,
    experienceToNextLevel: xpNeed(progOf(hero).lv),
    skillPoints: progOf(hero).sp,
    accumulatedWaveGold: 0,
    baseStats: base,
    stats,
    skillLevels: { ...progOf(hero).skills },   // a run copy: room cards boost it for this run only
    activeAbilityQ: WEAPON_Q[hero] as AbilityType | null,
    upgradeOptions: [] as Upgrade[],
    runPicks: [] as Upgrade[],
    cardRefresh: FREE_REFRESHES, cardPolish: 0,
    isInventoryOpen: false,
    isShopOpen: false,
    isCharacterSheetOpen: false,
    isPauseMenuOpen: false,
    notifications: [] as GameNotification[],
    actionResult: null,
  });

  const attrsOf = (h: HeroClass): Attrs | undefined => { try { return (get()?.attrs ?? profile.attrs)?.[h]; } catch { return profile.attrs?.[h]; } };
  const profileRank = () => { try { return get()?.heroRank ?? profile.heroRank; } catch { return profile.heroRank; } };
  const startLoadout = loadoutFor(profile.hero, profile.inventory, profile.equipment, profile.talents);

  return {
    ...runState(profile.hero, startLoadout.baseStats, startLoadout.stats),
    status: GameStatus.MENU,
    hero: profile.hero,
    difficulty: profile.difficulty,
    activeShopTab: 'SUPPLIES',
    shopSales: rollSales(),
    gold: profile.gold,
    gems: profile.gems,
    crystals: profile.crystals ?? 20,
    inventory: startLoadout.inventory,
    equipment: startLoadout.equipment,
    materials: profile.materials,
    elixirsNext: (profile.elixirs ?? []).filter(isElixirId),
    elixirsRun: [] as ElixirId[],
    maxInventorySlots: profile.maxInventorySlots,
    warehouse: profile.warehouse ?? [],
    warehouseGold: profile.warehouseGold ?? 0,
    progress: profile.progress ?? sanitizeProgress(undefined),
    tech: profile.tech ?? {},
    summonPity: profile.summonPity ?? { GEM: 0, SHARD: 0 },
    story: profile.story ?? { step: storyIdx('slimes'), p: 0, v: STORY_V },   // a brand-new profile starts at the one open quest: defeat slimes (questUnlocks.ts)
    classProg: profile.classProg ?? sanitizeClassProg(undefined, INITIAL_SKILLS, 1),
    npcQuests: profile.npcQuests ?? emptyNpcQuests(),
    unlocks: profile.unlocks ?? emptyUnlocks(),
    questSeen: profile.questSeen ?? null,
    dashMods: sanitizeDashMods(profile.dashMods),
    setDashMod: (mod) => { const s = get(); const dm = { ...s.dashMods }; if (mod) dm[s.hero] = mod; else delete dm[s.hero]; set({ dashMods: dm }); },
    heroRank: profile.heroRank,
    rankXp: profile.rankXp,
    welcomeGiftClaimed: profile.welcomeGiftClaimed,
    talents: profile.talents,
    attrs: profile.attrs ?? sanitizeAttrs(undefined),
    starterGiven: profile.starterGiven,
    discovered: profile.discovered ?? emptyDiscovered(),
    codexClaimed: profile.codexClaimed ?? [],
    meta: profile.meta ?? freshMeta(),
    gameStats: profile.gameStats,
    settings: profile.settings,
    lastRun: null,

    // ------------------------------------------------------------ flow --
    setStatus: (status) => set({ status }),
    debugSetLevel: (lv) => {
      lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(lv)));   // (owner) never past the real max level
      const s = get(), cp = s.classProg[s.hero];
      const sp = Math.max(0, cp.sp + SP_PER_LEVEL * (lv - cp.lv));
      set({ classProg: { ...s.classProg, [s.hero]: { ...cp, lv, xp: 0, sp } } });
      if (s.status === GameStatus.MENU) get().selectHero(s.hero);   // rebuild stats / skills from the new level
      else set({ level: lv, heroRank: lv, experience: 0, experienceToNextLevel: xpNeed(lv), skillPoints: sp });
    },
    selectHero: (hero) => {
      const s = get();
      if (s.status !== GameStatus.MENU) { set({ hero }); return; }
      // village: switching class swaps the starter loadout immediately
      let inv = s.inventory, eq = s.equipment;
      let starterGiven = s.starterGiven;
      if (!starterGiven[hero]) {
        // first time on this class: its starter weapon, and the starter armour set if the old one is still untouched
        starterGiven = { ...starterGiven, [hero]: true };
        const g = STARTER_GEAR[hero];
        eq = { ...eq };
        const bag = inv.slice();
        const has = bag.some((i) => i.type === 'WEAPON' && i.classType === hero);
        if (!has) { const w = starterPiece(HERO_STATS[hero].weaponId); if (w && !(eq.weapon && eq.weapon.classType === hero)) bag.push(w); }
        for (const slot of ['armor', 'gloves', 'boots', 'accessory'] as const) {   // (no starter helmet)
          const cur = eq[slot];
          if (!cur || isStarterId(cur.id)) { const n = starterPiece(g[slot]); if (n) eq[slot] = n; }
        }
        inv = bag;
      }
      const l = loadoutFor(hero, inv, eq, s.talents);
      set({ hero, starterGiven, ...runState(hero, l.baseStats, l.stats), inventory: l.inventory, equipment: l.equipment });
    },
    setDifficulty: (difficulty: Difficulty) => set({ difficulty }),

    startGame: () => {
      const state = get();
      // the run's time of day: a snapshot of the town clock (the endless tower, waves and daily keep day)
      world.runTime = world.townTime; world.runPhase = runInfo.mode === 'TOWER' ? 0 : phaseOfTime(world.townTime);
      const l = loadoutFor(state.hero, state.inventory, state.equipment);
      // elixirs drunk in town start working now (for this run only)
      const elixirs = state.elixirsNext.slice();
      for (const id of elixirs) applyElixir(l.baseStats, id);
      if (elixirs.length) l.stats = calc(l.baseStats, l.equipment);
      set({
        ...runState(state.hero, l.baseStats, l.stats),
        elixirsRun: elixirs, elixirsNext: [],
        status: GameStatus.PLAYING,
        inventory: l.inventory,
        equipment: l.equipment,
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
        runPicks: [],
        cardRefresh: FREE_REFRESHES + techLv(state.tech, 'refresh'), cardPolish: techLv(state.tech, 'polish'),   // (per run: Card Refresh / Card Polish, Tech House)
        notifications: [],
        actionResult: null,
        maxInventorySlots: Math.max(state.maxInventorySlots, INVENTORY_LIMIT),
      });
      runStartLevel = get().level;
      runInfo.hard = get().difficulty === 'HARD';
      if (debug.maxSkills) get().debugMaxSkills();
      startRun();
    },

    /** Debug: every skill of the current hero (actives, dash, ultimate, class passives) at max level. */
    debugMaxSkills: () => {
      const s = get();
      const lv: SkillLevels = { ...s.skillLevels };
      const keys: string[] = [...activeDefs(s.hero).map((a) => a.slot), dashKey(s.hero), 'ult'];
      for (const [k, i] of Object.entries(SKILLS_INFO) as [string, { type?: string; classType?: string }][]) if (i.type === 'PASSIVE' && k !== 'dash' && (!i.classType || i.classType === s.hero)) keys.push(k);
      for (const k of keys) if (k in lv) (lv as unknown as Record<string, number>)[k] = MAX_SKILL_LEVEL;
      set({ skillLevels: lv });
    },

    resetGame: () => {
      enterVillage();
      const s = get();
      const l = loadoutFor(s.hero, s.inventory, s.equipment);
      set({
        ...runState(s.hero, l.baseStats, l.stats),
        elixirsRun: [],   // run elixir buffs end with the run
        status: GameStatus.MENU,
        inventory: l.inventory,
        equipment: l.equipment,
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
        notifications: [],
        actionResult: null,
      });
    },

    markQuestsSeen: (ids) => { const cur = get().questSeen ?? []; const add = ids.filter((id) => id && !cur.includes(id)); if (add.length) set({ questSeen: [...cur, ...add].slice(-400) }); },

    abandonRun: () => {
      get().endRun({ ...world.run, wave: world.director.wave });
      get().resetGame();
    },

    resetProfile: () => {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
      const f = freshProfile(get().settings);
      set({
        gold: f.gold, gems: f.gems, crystals: f.crystals ?? 0, inventory: f.inventory, equipment: f.equipment, materials: f.materials,
        maxInventorySlots: f.maxInventorySlots, warehouse: get().warehouse, warehouseGold: get().warehouseGold, progress: sanitizeProgress(undefined),   /* (the warehouse is shared by all characters: kept) */ tech: {}, summonPity: { GEM: 0, SHARD: 0 }, story: { step: storyIdx('slimes'), p: 0, v: STORY_V }, classProg: sanitizeClassProg(undefined, INITIAL_SKILLS, 1), npcQuests: emptyNpcQuests(), unlocks: emptyUnlocks(), questSeen: null, dashMods: {}, heroRank: 1, rankXp: 0, gameStats: f.gameStats,
        welcomeGiftClaimed: true, hero: 'ARCHER', difficulty: 'NORMAL', lastRun: null,
        talents: emptyTalents(), attrs: sanitizeAttrs(undefined), starterGiven: f.starterGiven, discovered: emptyDiscovered(), codexClaimed: [], meta: freshMeta(), elixirsNext: [], elixirsRun: [],
      });
      syncDiscoveries();
      get().resetGame();
      notify('Profile reset. A fresh welcome gift awaits!', COLORS.uiAccent, 'SYSTEM');
    },

    togglePause: () => {
      const s = get();
      if (anyPanelOpen(s)) { get().closeAllUI(); return; }
      if (s.status === GameStatus.PLAYING) set({ status: GameStatus.PAUSED, isPauseMenuOpen: true });
      else if (s.status === GameStatus.PAUSED) set({ status: GameStatus.PLAYING, isPauseMenuOpen: false });
    },

    toggleInventory: () => {
      const s = get();
      if (!s.isInventoryOpen && !canOpenPanels()) return;
      const open = !s.isInventoryOpen;
      set({ isInventoryOpen: open, isShopOpen: false, isCharacterSheetOpen: false });
      set(syncPause(open));
    },

    toggleCharacterSheet: () => {
      const s = get();
      if (!s.isCharacterSheetOpen && !canOpenPanels()) return;
      const open = !s.isCharacterSheetOpen;
      set({ isCharacterSheetOpen: open, isInventoryOpen: false, isShopOpen: false });
      set(syncPause(open));
    },

    rollShopSales: () => set({ shopSales: rollSales() }),

    openSpecificShop: (tab: ShopTab) => {
      if (!canOpenPanels()) return;
      set({ isShopOpen: true, isInventoryOpen: false, isCharacterSheetOpen: false, activeShopTab: tab });
      set(syncPause(true));
    },

    closeAllUI: () => {
      set({ isInventoryOpen: false, isShopOpen: false, isCharacterSheetOpen: false });
      set(syncPause(false));
    },

    clearActionResult: () => set({ actionResult: null }),

    updateSettings: (patch) => {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
    },

    // ----------------------------------------------------- progression --
    addGold: (n) => set((s) => ({ gold: s.gold + n })),
    addGems: (n) => set((s) => ({ gems: s.gems + n })),
    addCrystals: (n, at) => {
      if (n <= 0) return;
      set((s) => ({ crystals: (s.crystals ?? 0) + n }));
      if (at) events.emit('floatText', { pos: world.player.pos.clone().set(at.x, 0, at.z), text: `+${n} Aether Crystal${n > 1 ? 's' : ''}`, color: 0xb98cff, scale: 0.95, dy: 2.4 });
      feedReward({ crystals: n });
    },

    fuseCores: (tier) => {   // 5 cores of a tier -> 1 of the next (Blacksmith > Shards)
      const s = get(); if (tier !== 0) return false;
      const idx = s.inventory.findIndex((i) => coreTierOf(i) === tier);
      const have = idx >= 0 ? s.inventory[idx].quantity || 1 : 0;
      if (have < CORE_FUSE) { notify(`Need ${CORE_FUSE} ${CORE_NAMES[tier]}s`, 'red', 'WARNING'); return false; }
      let inv = s.inventory.slice();
      if (have > CORE_FUSE) inv[idx] = { ...inv[idx], quantity: have - CORE_FUSE }; else inv.splice(idx, 1);
      const up = makeItemById(CORE_IDS[tier + 1], 1)[0];
      const next = insertItem(inv, s.maxInventorySlots, up);
      if (!next) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
      set({ inventory: next });
      notify(`Fused a ${CORE_NAMES[tier + 1]}!`, '#ffd24a', 'ITEM');
      return true;
    },

    discover: (tab, keys) => {
      const cur = get().discovered;
      const have = new Set(cur[tab]);
      const add = keys.filter((k) => !have.has(k));
      if (add.length) set({ discovered: { ...cur, [tab]: [...cur[tab], ...new Set(add)] } });
    },
    claimCodexReward: (tab) => {
      const s = get();
      if (s.codexClaimed.includes(tab)) return false;
      const have = new Set(s.discovered[tab]);
      if (!CODEX_KEYS[tab].every((k) => have.has(k))) return false;
      set({ codexClaimed: [...s.codexClaimed, tab], gems: s.gems + CODEX_REWARD_GEMS });
      feedReward({ gems: CODEX_REWARD_GEMS });
      notify(`Codex complete! +${CODEX_REWARD_GEMS} gems`, COLORS.uiAccent, 'SYSTEM');
      return true;
    },

    addExperience: (amount) => {
      if (runInfo.mode === 'TOWER' && get().status !== GameStatus.MENU) return;   // no EXP in the Endless Tower / Daily Trial / Endless Waves (owner)
      let { experience, experienceToNextLevel, level } = get();
      const gain = amount * (1 + get().stats.xpBonus) * hardMul(get().status === GameStatus.MENU);   // (Hard run: +50% XP)
      experience += gain;
      const startLevel = level;
      let base = get().baseStats;
      let sp = get().skillPoints;

      while (experience >= experienceToNextLevel) {
        experience -= experienceToNextLevel;
        if (level >= MAX_LEVEL) { experience = 0; break; }
        level += 1;
        experienceToNextLevel = xpNeed(level);
        sp += SP_PER_LEVEL;
        base = growBase(base, get().hero);   // class scaling per level (shown on the character sheet)
      }

      if (level === startLevel) {
        set({ experience });
        return;
      }

      const stats = calc(base, get().equipment);
      const hero = get().hero, cp = get().classProg;
      set({ experience, experienceToNextLevel, level, heroRank: level, skillPoints: sp, baseStats: base, stats,
        classProg: { ...cp, [hero]: { ...cp[hero], lv: level, xp: experience, sp } } });
      // (no banner: the golden LevelUpBurst ring shows the level-up)
      // Engine: full heal + fx.
      world.player.hp = stats.maxHealth;
      world.player.mana = stats.maxMana;
      world.player.levelUpFx = 1;
      events.emit('levelUp', { pos: world.player.pos, level });
    },

    setWave: (wave) => set({ wave }),

    openWaveReward: (bonus = false) => {
      const s = get();
      const extraCard = bonus;
      if (extraCard) notify('Bonus reward card!', COLORS.uiAccent, 'SYSTEM');
      set({
        upgradeOptions: generateUpgradeOptions(s.hero, s.skillLevels, s.stats, Math.min(3, (Math.random() < 0.12 ? 3 : 2) + (extraCard ? 1 : 0))   /* (owner) 2 cards, rarely 3 */),
        accumulatedWaveGold: s.accumulatedWaveGold + 1000,
        status: GameStatus.LEVEL_UP,
      });
    },

    selectUpgrade: (upgrade) => {
      const state = get();
      const base: PlayerStats = { ...state.baseStats };
      const levels: SkillLevels = { ...state.skillLevels };
      const key = skillKeyFor(upgrade.type, state.hero);

      if (key) {
        levels[key] = Math.min(MAX_SKILL_LEVEL, levels[key] + 1);
      } else {
        switch (upgrade.type) {
          case 'HEALTH': base.maxHealth += upgrade.value; world.player.hp += upgrade.value * HP_INFLATE; break;
          case 'MAX_MANA': base.maxMana += upgrade.value; world.player.mana += upgrade.value; break;
          case 'DAMAGE': base.damage += base.damage * upgrade.value; break;
          case 'SPEED': base.moveSpeed += base.moveSpeed * upgrade.value; break;
          case 'FIRE_RATE': base.fireRate += base.fireRate * upgrade.value; break;
          case 'DEFENSE': base.defense += upgrade.value; break;
          case 'CRIT_RATE': base.critRate += upgrade.value; break;
          case 'CRIT_DAMAGE': base.critDamage += upgrade.value; break;
          case 'MULTISHOT': base.multishot += upgrade.value; break;
          case 'ULT_FILL': world.player.ult = Math.max(world.player.ult, Math.min(100, upgrade.value)); break;
          case 'RESTORE': { const hp = state.stats.maxHealth * 0.3; world.player.hp = Math.min(state.stats.maxHealth, world.player.hp + hp); world.player.mana = Math.min(state.stats.maxMana, world.player.mana + state.stats.maxMana * 0.3); events.emit('heal', { pos: world.player.pos, amount: hp }); break; }   // Second Breath: 30% HP and mana
          case 'AEGIS': { const sh = upgrade.value;   // a flat 80 HP shield (owner)
 world.player.aegis = Math.max(world.player.aegis, sh); world.player.aegisMax = Math.max(world.player.aegisMax, world.player.aegis); break; }
          case 'COOLDOWN': base.cooldownReduction += upgrade.value; break;
          case 'KNOCKBACK': base.knockback += base.knockback * upgrade.value; break;
          case 'LIFESTEAL': base.lifeSteal += upgrade.value; break;
          case 'DMG_REDUCE': base.dmgReduce += upgrade.value; break;
          case 'MANA_REGEN': base.manaRegen += upgrade.value; break;
          case 'SPECIAL': if (upgrade.special === 'GOLD_RUSH' && !runCards.taken.GOLD_RUSH) base.goldFind += upgrade.value; break;
          // DASH_COOLDOWN (-10% dash cooldown) and DEATH_DEFIANCE are engine-side (runCards)
          default: break;
        }
      }
      takeRunCard(upgrade);
      const more = runCards.extraPicks > 0;   // Guardian's Spoils: another selection right behind this one
      if (more) runCards.extraPicks--;
      set({
        baseStats: base,
        skillLevels: levels,
        stats: calc(base, state.equipment),
        runPicks: [...state.runPicks, upgrade],
        upgradeOptions: more ? generateUpgradeOptions(state.hero, levels, state.stats, 2 + (runCards.guardian > 1 ? 1 : 0), [...state.runPicks, upgrade]) : [],
        status: more ? GameStatus.LEVEL_UP : GameStatus.PLAYING,
      });
    },

    refreshCards: () => {   // Card Refresh: reroll every offered card (uses one of this run's refreshes)
      const s = get();
      if (s.status !== GameStatus.LEVEL_UP || s.cardRefresh <= 0 || s.upgradeOptions.length === 0) return false;
      set({ cardRefresh: s.cardRefresh - 1, upgradeOptions: generateUpgradeOptions(s.hero, s.skillLevels, s.stats, s.upgradeOptions.length) });
      return true;
    },
    polishCard: (id) => {   // Card Polish: raise ONE offered card by a rarity tier (its numbers follow the new rarity)
      const s = get(), i = s.upgradeOptions.findIndex((o) => o.id === id), c = s.upgradeOptions[i];
      if (s.status !== GameStatus.LEVEL_UP || s.cardPolish <= 0 || !c || !canRarityUp(c)) return false;
      const n = rarityUpCard(c); if (!n) return false;
      const options = s.upgradeOptions.slice(); options[i] = withCardText({ ...n, id: uid('card') });
      set({ cardPolish: s.cardPolish - 1, upgradeOptions: options });
      return true;
    },
    upgradeSkill: (skill) => {
      const s = get();
      const lvl = s.skillLevels[skill];
      if (lvl >= MAX_SKILL_LEVEL) return;
      const cost = questFree(s, 'train') ? 0   // tutorial "Lessons of the Blade": the trainer's first lesson is free
        : skillCost(skill, lvl, skill === 'dash' || (skill === 'e' && s.hero !== 'BARBARIAN'));
      const need = skill === dashKey(s.hero) ? DASH_UNLOCK_LV : unlockLevel(s.hero, skill);   // (the dash starts at Lv 1 but trains from DASH_UNLOCK_LV)
      if (s.level < need) { notify(`Unlocks at Lv ${need}`, 'red', 'WARNING'); return; }
      if (s.skillPoints < cost) return;
      const cp = s.classProg[s.hero];
      const perm = { ...cp.skills, [skill]: Math.min(MAX_SKILL_LEVEL, (cp.skills[skill] ?? 0) + 1) };   // learned for good
      set({ skillLevels: { ...s.skillLevels, [skill]: lvl + 1 }, skillPoints: s.skillPoints - cost,
        classProg: { ...s.classProg, [s.hero]: { ...cp, skills: perm, sp: s.skillPoints - cost } } });
      events.emit('hub', { kind: 'learn', n: 1 });
    },

    endRun: (summary) => {
      if (showcase.on) { get().endShowcase(false); return; }   // (dying in the showcase: back to town with the real state, nothing banked)
      const s = get();
      const cp = calculateTotalCP(s.stats);
      const gs = s.gameStats;
      const wave = summary.wave;
      const gameStats: GameStatistics = {
        totalRuns: gs.totalRuns + 1,
        highestWave: Math.max(gs.highestWave, wave),
        highestCP: Math.max(gs.highestCP, cp),
        bestRunClass: wave > gs.highestWave ? s.hero : gs.bestRunClass,
        classRuns: { ...gs.classRuns, [s.hero]: gs.classRuns[s.hero] + 1 },
        classHighestWave: { ...gs.classHighestWave, [s.hero]: Math.max(gs.classHighestWave[s.hero], wave) },
      };
      // class level: run xp already went straight into the permanent level; bank the leftover xp
      const rankXpGained = Math.round(summary.xpEarned || 0);
      const rank = s.level, rankUps = Math.max(0, s.level - runStartLevel), rankXp = s.rankXp;
      const classProg = { ...s.classProg, [s.hero]: { ...s.classProg[s.hero], lv: s.level, xp: s.experience } };
      set({
        status: GameStatus.GAME_OVER,
        gold: s.gold + s.accumulatedWaveGold,
        heroRank: rank,
        rankXp,
        classProg,
        gameStats,
        lastRun: {
          ...summary, hero: s.hero, difficulty: s.difficulty, cp, level: s.level,
          waveGoldBonus: s.accumulatedWaveGold, rankXpGained, rankUps, rank,
        },
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
      });

    },

    addMaterial: (rarity, n = 1) => {
      const s = get();
      set({ materials: { ...s.materials, [rarity]: s.materials[rarity] + n } });
    },

    applyBlessing: (kind) => {
      const s = get();
      const b = { ...s.baseStats };
      let label = '';
      switch (kind) {
        case 'FORTUNE': b.goldFind = (b.goldFind || 0) + 0.25; b.xpBonus = (b.xpBonus || 0) + 0.15; label = 'Blessing of Fortune: +25% gold, +15% XP'; break;
        case 'MIGHT': b.damage = b.damage * 1.15; label = 'Blessing of Might: +15% damage'; break;
        case 'AEGIS': b.defense = (b.defense || 0) + 6; label = 'Blessing of the Aegis: +6 defense and a shield'; break;
        case 'SWIFT': b.moveSpeed = b.moveSpeed * 1.12; label = 'Blessing of Swiftness: +12% move speed'; break;
        case 'VITALITY': b.maxHealth = Math.round(b.maxHealth * 1.2); label = 'Blessing of Vitality: +20% max HP'; break;
        case 'PRECISION': b.critRate = (b.critRate || 0) + 0.1; label = 'Blessing of Precision: +10% crit chance'; break;
      }
      set({ baseStats: b, stats: calc(b, s.equipment) });
      notify(label + ' (this run)', '#ffd36a', 'SYSTEM');
      return label;
    },

    getManaCost: (skill) => {
      const s = get();
      if (skill === 'e' && s.hero !== 'BARBARIAN') return 0; // class dash is free (charges)
      const cost = skill === 'q' || skill === 'e' || skill === 's3' || skill === 's4' ? abilityMana(s.hero, skill, s.skillLevels[skill]) : skill === 'freezeSpell' ? Math.ceil((15 + s.skillLevels.freezeSpell * 2) * 0.5) : 0;   // passives cost half mana
      const total = cost > 0 ? Math.ceil(cost * (CLASS_MANA_MUL[s.hero] ?? 1) * (skill === 'freezeSpell' ? 0.65 : 0.75)) : 0;   // per-class mana cost multiplier (balance pass 2); (owner) skills -25%, passives -35%
      return s.stats.manaCostCut > 0 ? Math.ceil(total * (1 - Math.min(0.8, s.stats.manaCostCut))) : total;
    },

    // ----------------------------------------------------------- items --
    // ---- run modes: adventure (+ Ascension) / endless tower
    sailToIsles: () => {
      const s = get();
      if (s.gems < SHIP_TICKET_GEMS) { notify(`A ticket costs ${SHIP_TICKET_GEMS} gems.`, '#ff8a80', 'SYSTEM'); return false; }
      set({ gems: s.gems - SHIP_TICKET_GEMS }); events.emit('purchase', {}); 
      get().startMode('ADVENTURE', 3);
      return true;
    },
    startMode: (mode: RunMode, startBiome = 0) => {
      disarmDaily(); disarmWaves();
      runInfo.mode = mode; runInfo.back = mode === 'TOWER' ? 'TOWER' : ''; runInfo.startBiome = mode === 'ADVENTURE' ? startBiome : 0;
      set({ difficulty: get().settings.hardMode && get().progress.endings > 0 ? 'HARD' : 'NORMAL' });   // Hard mode applies from the next run on
      runInfo.ascension = mode === 'ADVENTURE' ? Math.min(get().progress.ascension, get().progress.ascensionMax) : 0;
      get().startGame();
    },
    setAscension: (lv) => {
      const p = get().progress;
      set({ progress: { ...p, ascension: Math.max(0, Math.min(p.ascensionMax, lv)) } });
    },
    completeEnding: () => {   // Malakar defeated: the ending; unlocks the next Ascension level
      const p = get().progress, cleared = runInfo.mode === 'ADVENTURE' ? runInfo.ascension : 0;
      const ascensionMax = Math.min(ASCENSION_MAX, Math.max(p.ascensionMax, cleared + 1));
      set({ progress: { ...p, endings: p.endings + 1, ascensionMax } });
      if (ascensionMax > p.ascensionMax) notify(`Ascension ${ascensionMax} unlocked!`, '#ffd36a', 'BOSS');
    },
    claimTowerMilestone: (floor) => {
      const s = get(), p = s.progress, have = p.towerClaimed[s.hero] ?? [];
      if (floor % TOWER_STEP !== 0 || floor > (p.towerBest[s.hero] ?? 0) || have.includes(floor)) return false;
      const { items, gems } = rollMilestone(floor, s.hero, makeItemById, instantiate);
      set({ progress: { ...p, towerClaimed: { ...p.towerClaimed, [s.hero]: [...have, floor] } }, gems: s.gems + gems });
      for (const it of items) if (!get().addItemToInventory(it)) set({ warehouse: [...get().warehouse, it] });   // bag full: to the warehouse
      notify(`Floor ${floor} reward claimed!`, '#ffd24a', 'SYSTEM');
      feedReward({ items, gems });
      return true;
    },
    // ---- Daily Trial (dailyChallenge.ts): a seeded tower-style run; rewards once per day, retries chase the best score
    startDaily: () => {
      const today = dayKey(), p = get().progress, d = p.daily;
      disarmWaves(); armDaily(dailyFor(today));
      runInfo.mode = 'TOWER'; runInfo.ascension = 0; runInfo.back = 'TOWER';
      set({ difficulty: 'NORMAL', progress: { ...p, daily: d.day === today ? { ...d, tries: d.tries + 1 } : { ...d, day: today, best: 0, tries: 1 } } });   // same rules for everyone
      get().startGame();
    },
    completeDaily: (r) => {
      const s = get(), p = s.progress, d = p.daily, day = r.day;
      const prevBest = d.day === day ? d.best : 0;
      const first = d.claimed !== day;
      const streak = first ? (d.lastDone === prevDay(day) ? d.streak + 1 : d.lastDone === day ? d.streak : 1) : d.streak;
      const daily = { ...d, day, best: Math.max(prevBest, r.score), tries: d.day === day ? d.tries : 1, claimed: day, lastDone: first ? day : d.lastDone, streak, bestEver: Math.max(d.bestEver, r.score) };
      set({ progress: { ...p, daily } });
      if (first) {
        const rw = dailyReward(streak), now = get();
        set({ gold: now.gold + rw.gold, gems: now.gems + rw.gems, materials: { ...now.materials, [rw.shardRarity]: now.materials[rw.shardRarity] + rw.shards, ...(rw.bonusShards ? { [rw.bonusRarity]: now.materials[rw.bonusRarity] + rw.bonusShards } : {}) } });
        notify(`Daily Trial reward${streak > 1 ? ` · ${streak}-day streak` : ''}!`, '#ffd24a', 'SYSTEM');
        feedReward({ gold: rw.gold, gems: rw.gems, shards: rw.shards, shardRarity: rw.shardRarity });
        if (rw.bonusShards) feedReward({ shards: rw.bonusShards, shardRarity: rw.bonusRarity });
      }
      return { rewarded: first, newBest: r.score > prevBest };
    },
    // ---- Endless Waves (endlessWaves.ts): one arena, wave after wave until death
    startWaves: () => {
      disarmDaily(); armWaves();
      runInfo.mode = 'TOWER'; runInfo.ascension = 0; runInfo.back = 'TOWER';
      set({ difficulty: get().settings.hardMode && get().progress.endings > 0 ? 'HARD' : 'NORMAL' });
      get().startGame();
    },
    // ---- Showcase fight (engine/showcase.ts): a fully powered one-off battle; the real profile is snapshotted and restored whole
    startShowcase: () => {
      if (showcase.on) return;
      const s = get(), hero = s.hero;
      showcaseSnap = s;   // (state objects are immutable: this shallow reference IS the snapshot)
      const ov = buildShowcaseOverlay(hero, s.classProg[hero] ?? freshClass(hero, INITIAL_SKILLS), instantiate, plusOne, uid);
      showcase.on = true; resetShowcase();
      const char = activeChar(); if (char) consumeShowcase(char.id);   // (once per character, even if the page is refreshed mid-fight)
      disarmDaily(); disarmWaves();
      runInfo.mode = 'TOWER'; runInfo.ascension = 0; runInfo.back = ''; runInfo.startBiome = 0; runInfo.dream = false;
      set({
        difficulty: 'NORMAL',
        classProg: { ...s.classProg, [hero]: ov.classProg }, talents: { ...s.talents, [hero]: ov.talents }, attrs: { ...s.attrs, [hero]: ov.attrs },
        equipment: ov.equipment, elixirsNext: [], isShopOpen: false, isInventoryOpen: false, isCharacterSheetOpen: false,
      });
      get().startGame();
      world.player.ult = 100; world.player.mana = get().stats.maxMana; world.player.hp = get().stats.maxHealth;   // full ultimate + resources from the first second
    },
    endShowcase: (won) => {
      if (!showcase.on) return;
      const snap = showcaseSnap; showcase.on = false; showcaseSnap = null;
      runInfo.mode = 'ADVENTURE'; runInfo.back = '';
      if (snap) {   // everything but the screen flow comes back exactly as it was (profile, bag, gear, skills, stats, currencies, codex ...)
        const keep: Record<string, unknown> = {};
        for (const k of Object.keys(snap) as (keyof GameState)[]) {
          if (typeof snap[k] === 'function' || k === 'status' || k === 'notifications' || k === 'lastRun' || k === 'actionResult' || k === 'upgradeOptions' || k === 'runPicks') continue;
          keep[k] = snap[k];
        }
        set(keep as Partial<GameState>);
      }
      get().resetGame();
      void won;   // (owner) no text after the showcase, only its instructions
    },
    recordWave: (wave) => {
      const s = get(), p = s.progress, best = p.wavesBest[s.hero] ?? 0, have = p.wavesClaimed[s.hero] ?? [];
      const m = waveMilestone(wave), grant = !!m && !have.includes(wave);
      const progress: RunProgress = { ...p,
        ...(wave > best ? { wavesBest: { ...p.wavesBest, [s.hero]: wave } } : {}),
        ...(grant ? { wavesClaimed: { ...p.wavesClaimed, [s.hero]: [...have, wave] } } : {}) };
      set({ progress });
      if (grant && m) {
        const now = get();
        set({ gems: now.gems + m.gems, materials: { ...now.materials, [m.rarity]: now.materials[m.rarity] + m.shards } });
        notify(`Endless Waves: wave ${wave} milestone reward!`, '#ffd24a', 'BOSS');
        feedReward({ gems: m.gems, shards: m.shards, shardRarity: m.rarity });
      }
      return wave > best;
    },
    recordTowerFloor: (floor) => {
      const s = get(), p = s.progress;
      if (floor <= (p.towerBest[s.hero] ?? 0)) return false;
      set({ progress: { ...p, towerBest: { ...p.towerBest, [s.hero]: floor } } });
      return true;
    },
    setStory: (step, p = 0) => {
      const s = get();
      if (step === s.story.step && p === s.story.p) return;
      const next = STORY[step];
      set({ story: { step, p, v: STORY_V } });
      // finishing a step pays its reward (main quests always pay: gold, gems, items)
      if (step > s.story.step) for (let k = s.story.step; k < step; k++) {
        const r = STORY[k]?.reward; if (!r) continue;
        const now = get();
        set({ gold: now.gold + (r.gold ?? 0) * GOLD_SCALE, gems: now.gems + (r.gems ?? 0) });
        const qxp = questXp('STORY', now.level); get().addExperience(qxp);   // (owner) every quest pays EXP
        const gotItems: Item[] = [];
        for (const it of r.items ?? []) for (const item of makeItemById(it.id, it.qty ?? 1)) {
          gotItems.push(item);
          if (!get().addItemToInventory(item)) { set({ warehouse: [...get().warehouse, item] }); }
        }
        notify(`Main quest complete: ${STORY[k].title}`, '#f1d58e', 'SYSTEM');
        feedReward({ gold: (r.gold ?? 0) * GOLD_SCALE, gems: r.gems, items: gotItems, xp: qxp }, true);   // the rewards in the loot feed + under the tracker
      }
      if (step !== s.story.step) {
        if (next && storyHeld(step, s.unlocks.n)) { /* the next stretch is still locked: it opens after a later death */ }
        else if (next) notify(`Main quest: ${next.title}`, '#f1d58e', 'SYSTEM');
        else notify('Main story complete!', '#f1d58e', 'SYSTEM');
      }
    },
    rollDeathUnlock: (force = false) => {
      const s = get(), u = s.unlocks;
      if (u.n >= BEATS.length) return null;
      // nothing left to do (the main chain is locked and no side quest is on offer or running): always opens something
      const idle = storyHeld(s.story.step, u.n) && !NPC_QUESTS.some((d) => { const q = npcQuestStatus(d, s.npcQuests, s.heroRank); return q === 'AVAILABLE' || q === 'ACTIVE'; });
      if (!(force || u.n === 0 || u.miss >= 2 || idle || Math.random() < UNLOCK_CHANCE)) { set({ unlocks: { n: u.n, miss: u.miss + 1 } }); return null; }
      const bi = nextBeatIndex(u), beat: Beat = BEATS[bi];   // (beats a level-up already opened are skipped)
      if (!beat) return null;
      const unlocks: UnlockSave = { n: bi + 1, miss: 0 };
      const early = (u.early ?? []).filter((id) => BEATS.findIndex((b) => b.id === id) > bi);
      if (early.length) unlocks.early = early;
      unlockMirror.n = unlocks.n; unlockMirror.early = early;
      set({ unlocks });
      for (const g of beat.gift?.items ?? []) for (const it of makeItemById(g.id, g.qty)) if (!get().addItemToInventory(it)) set({ warehouse: [...get().warehouse, it] });
      return beat;
    },
    rollLevelUnlock: () => {
      const u = get().unlocks, i = nextSideBeatIndex(u);
      if (i < 0 || Math.random() >= LEVEL_UNLOCK_CHANCE) return null;
      const early = [...(u.early ?? []), BEATS[i].id];
      unlockMirror.early = early;
      set({ unlocks: { ...u, early } });
      return BEATS[i];
    },
    setAttrs: (a) => {
      const s = get(), lv = s.classProg[s.hero]?.lv ?? 1;
      if (attrSpent(a) > attrPointsTotal(lv)) return false;
      const attrs = { ...s.attrs, [s.hero]: { ...a } };
      set({ attrs, stats: calculateStats(s.baseStats, s.equipment, s.hero, s.talents, attrs[s.hero]) });
      return true;
    },
    resetAttrs: () => {
      const s = get(), cost = ATTR_RESET_GOLD * GOLD_SCALE;
      if (attrSpent(s.attrs[s.hero]) === 0) return false;
      if (s.gold < cost) { notify('Not enough Gold!', 'red', 'WARNING'); return false; }
      const attrs = { ...s.attrs, [s.hero]: { STR: 0, DEX: 0, INT: 0, VIT: 0, LUK: 0 } };
      set({ gold: s.gold - cost, attrs, stats: calculateStats(s.baseStats, s.equipment, s.hero, s.talents, attrs[s.hero]) });
      notify('Attributes reset', '#f1d58e', 'SYSTEM');
      return true;
    },
    buyTech: (id: TechId) => {
      const s = get(), d = TECH.find((t) => t.id === id)!, lv = techLv(s.tech, id);
      if (lv >= d.max) return false;
      const cost = d.cost(lv);
      if (s.gems < cost) { notify('Not enough gems!', 'red', 'WARNING'); return false; }
      const tech = { ...s.tech, [id]: lv + 1 };
      set({ gems: s.gems - cost, tech, ...(id === 'bag' ? { maxInventorySlots: Math.max(s.maxInventorySlots, INVENTORY_LIMIT + 10 * (lv + 1)) } : {}),
        ...(id === 'lantern' ? { progress: { ...s.progress, caveLantern: Math.max(s.progress.caveLantern ?? 0, lv + 1) } } : {}) });
      events.emit('purchase', {}); 
      notify(`${d.name} ${ROMAN[lv]} unlocked!`, '#7dd3fc', 'SYSTEM');
      return true;
    },
    moveGold: (n) => {   // + deposit into the warehouse, - withdraw into the bag
      const s = get();
      const amt = n > 0 ? Math.min(Math.floor(n), s.gold) : -Math.min(Math.floor(-n), s.warehouseGold);
      if (!amt) return;
      set({ gold: s.gold - amt, warehouseGold: s.warehouseGold + amt });
    },
    deleteItems: (ids) => {
      const s = get(), del = new Set(ids);
      const inv = s.inventory.filter((i) => !del.has(i.id));
      if (inv.length !== s.inventory.length) set({ inventory: inv });
    },
    reorderItems: (list, items) => {
      const cur = get()[list];
      if (items.length !== cur.length) return;
      const ids = new Set(cur.map((i) => i.id));
      if (!items.every((i) => ids.has(i.id))) return;   // only a permutation of the same items
      set({ [list]: items } as Pick<GameState, typeof list>);
    },
    depositItem: (id) => {
      const s = get();
      const idx = s.inventory.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      const wh = insertItem(s.warehouse, WAREHOUSE_LIMIT + 25 * techLv(s.tech, 'warehouse'), s.inventory[idx]);
      if (!wh) { notify('Warehouse is full!', 'red', 'WARNING'); return false; }
      const inv = s.inventory.slice(); inv.splice(idx, 1);
      set({ inventory: inv, warehouse: wh });
      events.emit('hub', { kind: 'store', n: 1 });
      return true;
    },
    withdrawItem: (id) => {
      const s = get();
      const idx = s.warehouse.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      const inv = insertItem(s.inventory, s.maxInventorySlots, s.warehouse[idx]);
      if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
      const wh = s.warehouse.slice(); wh.splice(idx, 1);
      set({ inventory: inv, warehouse: wh });
      return true;
    },
    addItemToInventory: (item) => {
      const s = get();
      const pk = potionKind(item);
      if (pk) {   // potion carry cap: add only what fits; nothing fits -> refused (pickups stay on the ground)
        const room = POTION_CAP - potionCount(s.inventory, pk);
        if (room <= 0) return false;
        if ((item.quantity || 1) > room) item = { ...item, quantity: room };
      }
      const inv = insertItem(s.inventory, s.maxInventorySlots, markNew(item));   // looted / rewarded: "new" dot (monster loot excluded)
      if (!inv) return false;
      set({ inventory: inv });
      return true;
    },

    seeItem: (id) => {   // the player looked at a new item: drop its dot
      const s = get();
      if (!s.inventory.some((i) => i.id === id && i.isNew)) return;
      set({ inventory: s.inventory.map((i) => (i.id === id && i.isNew ? { ...i, isNew: false } : i)) });
    },

    canPickUp: (item) => {
      const s = get();
      const pk = potionKind(item);
      if (pk && potionCount(s.inventory, pk) >= POTION_CAP) return false;
      if (s.inventory.length < s.maxInventorySlots) return true;
      if (!isStackable(item)) return false;
      return s.inventory.some((i) => i.name === item.name && i.type === item.type && (i.quantity || 1) < stackLimit(item));
    },

    consumeItem: (pred) => {
      const s = get();
      const idx = s.inventory.findIndex(pred);
      if (idx === -1) return null;
      const item = s.inventory[idx];
      const inv = s.inventory.slice();
      const q = item.quantity || 1;
      if (q > 1) inv[idx] = { ...item, quantity: q - 1 };
      else inv.splice(idx, 1);
      set({ inventory: inv });
      return item;
    },

    equipItem: (item) => {
      const s = get();
      const req = item.type === 'PET' ? 0 : RANK_REQ[item.rarity];   // (owner) pets have no level requirement
      if (s.heroRank < req) { notify(`Requires Lv ${req}!`, 'red', 'WARNING'); return; }
      if (!canUseClass(item, s.hero)) {   // (owner) weapons and wear are class exclusive
        notify(classOnlyMsg(item), 'red', 'WARNING');
        return;
      }
      if (!isGear(item) && item.type !== 'PET' && item.type !== 'TOOL') return;

      const slot = item.type.toLowerCase() as EquipSlot;
      const current = s.equipment[slot];
      const inv = s.inventory.slice();
      const idx = inv.findIndex((i) => i.id === item.id);
      if (idx > -1) inv.splice(idx, 1);
      if (current) inv.push(current);

      const equipment: Equipment = { ...s.equipment, [slot]: { ...item, quantity: 1 } };
      const q = classOf(item);
      set({
        inventory: inv,
        equipment,
        stats: calc(s.baseStats, equipment),
        activeAbilityQ: q ?? s.activeAbilityQ,
      });
      notify(`Equipped ${item.name}`, COLORS.rarityCommon, 'SYSTEM');
      events.emit('hub', { kind: item.type === 'PET' ? 'equip_pet' : 'equip', n: 1 });
    },

    unequipItem: (slot) => {
      const s = get();
      const current = s.equipment[slot];
      if (!current) return;
      if (s.inventory.length >= s.maxInventorySlots) { notify('Inventory Full!', 'red', 'WARNING'); return; }
      const equipment: Equipment = { ...s.equipment, [slot]: null };
      set({
        inventory: [...s.inventory, current],
        equipment,
        stats: calc(s.baseStats, equipment),
        activeAbilityQ: slot === 'weapon' ? null : s.activeAbilityQ,
      });
    },

    autoEquip: () => {
      const s = get();
      const inventory = s.inventory.slice();
      const equipment: Equipment = { ...s.equipment };
      let changed = false;

      const tryEquip = (slot: EquipSlot, type: ItemType) => {
        const candidates = inventory.filter((i) =>
          i.type === type && (type === 'PET' || s.heroRank >= RANK_REQ[i.rarity]) && canUseClass(i, s.hero));
        if (candidates.length === 0) return;
        let best = candidates[0];
        let bestCP = calculateItemCP(best);
        for (const c of candidates) {
          const cp = calculateItemCP(c);
          if (cp > bestCP) { bestCP = cp; best = c; }
        }
        const cur = equipment[slot];
        const curCP = cur ? calculateItemCP(cur) : -1;
        if (bestCP > curCP) {
          if (cur) inventory.push(cur);
          equipment[slot] = best;
          const idx = inventory.indexOf(best);
          if (idx > -1) inventory.splice(idx, 1);
          changed = true;
        }
      };
      tryEquip('weapon', 'WEAPON');
      tryEquip('helmet', 'HELMET');
      tryEquip('armor', 'ARMOR');
      tryEquip('gloves', 'GLOVES');
      tryEquip('boots', 'BOOTS');
      tryEquip('accessory', 'ACCESSORY');
      tryEquip('pet', 'PET');

      if (changed) {
        const q = equipment.weapon ? classOf(equipment.weapon) : null;
        set({ inventory, equipment, stats: calc(s.baseStats, equipment), activeAbilityQ: q ?? s.activeAbilityQ });
        notify('Auto Equipped Best Items', COLORS.uiAccent, 'SYSTEM');
      } else {
        notify('No better items found', 'white', 'SYSTEM');
      }
    },

    fusePets: (ids) => {
      const s = get();
      const pets = ids.map((id) => s.inventory.find((i) => i.id === id)).filter((i): i is Item => !!i && i.type === 'PET');
      if (pets.length !== FUSE_COUNT || new Set(pets.map((p) => p.id)).size !== FUSE_COUNT) return null;
      const r = pets[0].rarity, up = nextTier(r), chance = FUSE_CHANCE[r] ?? 0;
      if (!up || chance <= 0 || pets.some((p) => p.rarity !== r)) return null;
      const ok = Math.random() < chance;
      const tpl = randomPetOf(ok ? up : r);
      if (!tpl) return null;
      const item: Item = { ...tpl, stats: { ...tpl.stats }, id: uid('fuse'), quantity: 1, level: tpl.level };
      const inv = s.inventory.filter((i) => !ids.includes(i.id));
      inv.push(item);   // (5 slots freed, 1 used: always fits)
      set({ inventory: inv });
      notify(ok ? `Fusion succeeded: ${item.name}!` : `Fusion failed... ${item.name} remains.`, ok ? '#ffd24a' : '#c8c0b0', 'SYSTEM');
      return { ok, item };
    },
    fuseItems: (ids) => {
      const s = get();
      const items = ids.map((id) => s.inventory.find((i) => i.id === id)).filter((i): i is Item => !!i && isGear(i));
      if (items.length !== FUSE_COUNT || new Set(items.map((i) => i.id)).size !== FUSE_COUNT) return null;
      const r = items[0].rarity, up = nextItemTier(r), chance = FUSE_CHANCE[r] ?? 0;
      // (owner: five of the SAME type - 5 weapons, 5 boots... - and the result is that type too)
      if (!up || chance <= 0 || items.some((i) => i.rarity !== r || i.type !== items[0].type)) return null;
      const ok = Math.random() < chance;
      const pool = summonPool('GEM', s.hero).filter((i) => isGear(i) && i.type === items[0].type && i.rarity === (ok ? up : r));
      if (!pool.length) return null;
      const item = instantiate(pool[Math.floor(Math.random() * pool.length)]);
      set({ inventory: [...s.inventory.filter((i) => !ids.includes(i.id)), markNew(item)] });   // (5 slots freed, 1 used)
      notify(ok ? `Fusion succeeded: ${item.name}!` : `Fusion failed... ${item.name} remains.`, ok ? '#ffd24a' : '#c8c0b0', 'SYSTEM');
      return { ok, item };
    },
    reforgeItem: (id, mode, line = -1) => {   // Blacksmith > Reforge: spend 1 tool, rework the item's bonus lines (reforge.ts)
      const s = get(), tool = mode === 'UNSEAL' ? null : REFORGE_ITEM[mode];
      const slot = SLOTS.find((sl) => s.equipment[sl]?.id === id);
      const item = slot ? s.equipment[slot] : s.inventory.find((i) => i.id === id);
      if (!item) return null;
      if (tool && !s.inventory.some((i) => i.name === tool.name)) { notify(`Need a ${tool.name}`, 'red', 'WARNING'); return null; }
      const out = reforge(item, mode, line);
      if (!out) return null;
      if (tool && !get().consumeItem((i) => i.name === tool.name)) return null;
      const now = get();
      if (slot) { const equipment = { ...now.equipment, [slot]: out } as Equipment; set({ equipment, stats: calc(now.baseStats, equipment) }); }
      else set({ inventory: now.inventory.map((i) => (i.id === id ? out : i)) });
      return out;
    },
    fuseShards: (r) => {   // (same rule as combineMaterials: SHARD_FUSE_COST of a tier -> 1 of the next, guaranteed)
      const s = get(), up = nextTier(r), cost = SHARD_FUSE_COST[r as keyof typeof SHARD_FUSE_COST];
      if (!up || !cost || (s.materials[r] ?? 0) < cost) return null;
      const materials = { ...s.materials, [r]: s.materials[r] - cost };
      materials[up] = (materials[up] ?? 0) + 1;
      set({ materials, inventory: syncShardStacks(s.inventory, materials) });
      notify(`Fused 1 ${up.charAt(0) + up.slice(1).toLowerCase()} shard!`, '#ffd24a', 'SYSTEM');
      return { ok: true, item: shardItem(up, 1) };
    },
    buyItem: (item, quantity = 1) => {
      const s = get();
      const total = freeBuy(s, item) && quantity === 1 ? 0 : shopPrice(item) * quantity;
      const pk = potionKind(item);
      if (pk && potionCount(s.inventory, pk) + quantity > POTION_CAP) { notify(potionCapMsg(pk), 'red', 'WARNING'); return false; }
      if (s.gold < total) { notify('Not enough Gold!', 'red', 'WARNING'); return false; }
      const toAdd: Item = { ...item, stats: { ...item.stats }, id: uid('buy'), quantity };
      if (!isStackable(item) && quantity > 1) {
        // Non-stackables occupy one slot each.
        let inv: Item[] | null = s.inventory;
        for (let i = 0; i < quantity && inv; i++) inv = insertItem(inv, s.maxInventorySlots, { ...toAdd, id: uid('buy'), quantity: 1 });
        if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
        set({ gold: s.gold - total, inventory: inv }); events.emit('purchase', {}); 
      } else {
        const inv = insertItem(s.inventory, s.maxInventorySlots, toAdd);
        if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
        set({ gold: s.gold - total, inventory: inv }); events.emit('purchase', {}); 
      }
      notify(`Bought ${item.name}`, 'white', 'SYSTEM');
      events.emit('hub', { kind: 'buy', n: quantity });
      if (item.type === 'POTION') events.emit('hub', { kind: 'buy_potion', n: quantity });
      if (isArmorPiece(item)) events.emit('hub', { kind: 'buy_armor', n: quantity });
      if (item.type === 'PET') {
        events.emit('hub', { kind: 'buy_pet', n: quantity });
        const first = !get().equipment.pet && get().inventory.find((i) => i.type === 'PET' && i.name === item.name);
        if (first) get().equipItem(first);   // the first pet goes straight to your side
      }
      return true;
    },

    sellItem: (item, amount = 1) => {
      const s = get();
      const idx = s.inventory.findIndex((i) => i.id === item.id);
      if (idx === -1) return;
      const inv = s.inventory.slice();
      const cur = inv[idx];
      if (cur.type === 'CRYSTAL') { notify('Aether Crystals cannot be sold.', 'red', 'WARNING'); return; }
      const qty = cur.quantity || 1;
      const sellQty = Math.min(qty, amount);
      const value = sellUnit(cur) * sellQty;
      if (sellQty >= qty) inv.splice(idx, 1);
      else inv[idx] = { ...cur, quantity: qty - sellQty };
      set({ gold: s.gold + value, inventory: inv });
      if (cur.type === 'LOOT' && isFishName(cur.name)) events.emit('hub', { kind: 'sell_fish', n: sellQty });   // (the fishing tutorial)
      notify(`Sold ${sellQty}x ${cur.name} for ${value}G`, 'yellow', 'SYSTEM');
    },

    sellAllLoot: () => {
      const s = get();
      const isSellLoot = (i: Item) => i.type === 'LOOT' && !REFORGE_NAMES.has(i.name);   // (reforge tools are not trade goods)
      const loot = s.inventory.filter(isSellLoot);
      if (loot.length === 0) { notify('No loot to sell.', 'white', 'SYSTEM'); return 0; }
      let total = 0, count = 0;
      let fish = 0;
      loot.forEach((i) => { const q = i.quantity || 1; total += sellUnit(i) * q; count += q; if (isFishName(i.name)) fish += q; });
      set({ gold: s.gold + total, inventory: s.inventory.filter((i) => !isSellLoot(i)) });
      if (fish) events.emit('hub', { kind: 'sell_fish', n: fish });
      notify(`Sold ${count} loot items for ${total}G`, 'yellow', 'SYSTEM');
      return total;
    },

    sellItems: (items) => {
      const s = get();
      items = items.filter((i) => i.type !== 'CRYSTAL');
      const ids = new Set(items.map((i) => i.id));
      let total = 0;
      items.forEach((i) => { total += sellUnit(i); });
      set({ gold: s.gold + total, inventory: s.inventory.filter((i) => !ids.has(i.id)) });
      notify(`Sold ${items.length} items for ${total}G`, 'yellow', 'SYSTEM');
    },

    bulkSell: (o) => {
      const s = get();
      const pick = bulkSellPick(s.inventory, o);
      if (!pick.items.length) { notify('Nothing to sell.', 'white', 'SYSTEM'); return 0; }
      const ids = new Set(pick.items.map((i) => i.id));
      set({ gold: s.gold + pick.gold, inventory: s.inventory.filter((i) => !ids.has(i.id)) });
      if (pick.fish) events.emit('hub', { kind: 'sell_fish', n: pick.fish });
      notify(`Sold ${pick.count} items for ${pick.gold.toLocaleString()}G`, 'yellow', 'SYSTEM');
      return pick.gold;
    },

    massSell: (rarity) => {
      const toSell = get().inventory.filter((i) => i.rarity === rarity && isGear(i));
      if (toSell.length > 0) get().sellItems(toSell);
      else notify(`No ${rarity} items to sell.`, 'white', 'SYSTEM');
    },

    recycleItem: (item) => {
      const s = get();
      const y = recycleYield(item);
      set({
        inventory: addCores(s.inventory.filter((i) => i.id !== item.id), y.cores),
        materials: { ...s.materials, [shardTier(item.rarity)]: s.materials[shardTier(item.rarity)] + y.shards },
      });
      notify(`Recycled for ${y.shards} ${shardTier(item.rarity)} Shard(s)${y.cores ? ` + ${y.cores} Core(s)` : ''}`, COLORS.uiAccent, 'SYSTEM');
    },

    massRecycle: (rarity) => {
      const s = get();
      const list = s.inventory.filter((i) => i.rarity === rarity && isGear(i));
      if (list.length === 0) { notify(`No ${rarity} items to recycle`, 'white', 'SYSTEM'); return; }
      const y = recycleYieldAll(list);
      const ids = new Set(list.map((i) => i.id));
      set({
        inventory: addCores(s.inventory.filter((i) => !ids.has(i.id)), y.cores),
        materials: { ...s.materials, [rarity]: s.materials[rarity] + y.shards },
      });
      notify(`Recycled ${list.length} items for ${y.shards} ${rarity} Shards${y.cores ? ` + ${y.cores} Cores` : ''}`, COLORS.uiAccent, 'SYSTEM');
    },

    recycleItems: (ids) => {
      const s = get(), pick = new Set(ids);
      const list = s.inventory.filter((i) => pick.has(i.id));
      if (!list.length) return 0;
      const mats = { ...s.materials }; let cores = 0, shards = 0;
      for (const it of list) if (isGear(it)) { const y = recycleYield(it); mats[shardTier(it.rarity)] += y.shards; shards += y.shards; cores += y.cores; }
      set({ inventory: addCores(s.inventory.filter((i) => !pick.has(i.id)), cores), materials: mats });
      notify(`Recycled ${list.length} item${list.length > 1 ? 's' : ''}: +${shards} shard${shards === 1 ? '' : 's'}${cores ? ` + ${cores} core${cores > 1 ? 's' : ''}` : ''}`, COLORS.uiAccent, 'SYSTEM');
      return list.length;
    },

    combineMaterials: (from) => {   // shard fusion: SHARD_FUSE_COST shards -> 1 of the next tier (always succeeds)
      const s = get();
      const idx = RARITIES.indexOf(from);
      if (idx === -1 || idx === RARITIES.length - 1) return;
      const to = RARITIES[idx + 1], cost = SHARD_FUSE_COST[from as keyof typeof SHARD_FUSE_COST];
      if (s.materials[from] < cost) {
        notify(`Need ${cost} ${from} Shards`, 'red', 'WARNING');
        return;
      }
      set({ materials: { ...s.materials, [from]: s.materials[from] - cost, [to]: s.materials[to] + 1 } });
      notify(`Fused 1 ${to} Shard`, COLORS.uiAccent, 'SYSTEM');
    },

    downgradeMaterials: (from) => {
      const s = get();
      const idx = RARITIES.indexOf(from);
      if (idx <= 0) return;
      const to = RARITIES[idx - 1];
      if (s.materials[from] < 1) { notify(`Need 1 ${from} Shard`, 'red', 'WARNING'); return; }
      set({ materials: { ...s.materials, [from]: s.materials[from] - 1, [to]: s.materials[to] + MATERIAL_DOWNGRADE_YIELD } });
      notify(`Broke 1 ${from} Shard into ${MATERIAL_DOWNGRADE_YIELD} ${to}`, COLORS.uiAccent, 'SYSTEM');
    },

    craftItem: (recipe: Recipe) => {
      const s = get();
      const missing = canCraft({ ...s, maxInventorySlots: s.maxInventorySlots }, recipe);
      if (missing.length > 0) { notify(missing[0].kind === 'space' ? 'Inventory Full!' : `Missing: ${missing[0].label}`, 'red', 'WARNING'); return null; }
      const paid = { gold: s.gold - recipe.gold, materials: { ...s.materials, [recipe.rarity]: s.materials[recipe.rarity] - recipe.shards } };
      if (Math.random() >= CRAFT_SUCCESS[recipe.rarity]) {   // failed: gold + shards are lost, the monster loot is kept
        set(paid);
        events.emit('hub', { kind: 'craft_fail', n: 1 });
        return { item: null, outcome: 'FAIL' as const };
      }
      const item = craft(recipe);
      set({ ...paid, inventory: [...consumeLoot(s.inventory, recipe), item] });
      notify(`Crafted ${item.name}${item.level > 1 ? ` +${item.level - 1}` : ''}!`, RARITY_COLOR[item.rarity], 'ITEM');
      events.emit('hub', { kind: 'craft', n: 1 });
      return { item, outcome: item.level > 1 ? 'GREAT' as const : 'SUCCESS' as const };
    },

    brewElixir: (id, n = 1) => {
      const d = ELIXIRS[id];
      let done = 0;
      if (id === 'might' && questFree(get(), 'elixir')) {   // (owner) tutorial "A Bitter Brew": one Elixir of Might on the house, no ingredients
        const s = get(), inv = insertItem(s.inventory, s.maxInventorySlots, elixirItem(id));
        if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return 0; }
        set({ inventory: inv });
        notify(`Brewed ${d.name}! (on the house)`, d.color, 'ITEM'); events.emit('hub', { kind: 'brew', n: 1 }); events.emit('hub', { kind: 'brew_elixir', n: 1 });
        return 1;
      }
      for (let k = 0; k < n; k++) {
        const s = get();
        if (s.gold < d.gold) { if (!done) notify('Not enough gold.', 'red', 'WARNING'); break; }
        // (owner) missing ingredients can be paid with gems (1-5 per missing piece, by its rarity)
        const gemCost = brewGemCost(s.inventory, id, 1);
        if (gemCost > s.gems) { if (!done) notify(`Missing ingredients: ${gemCost} gems needed to replace them.`, 'red', 'WARNING'); break; }
        const have = d.parts.map((p) => ({ id: p.id, count: Math.min(p.count, lootOwned(s.inventory, p.id)) })).filter((p) => p.count > 0);
        const inv = insertItem(consumeLoot(s.inventory, { loot: have }), s.maxInventorySlots, elixirItem(id));
        if (!inv) { if (!done) notify('Inventory Full!', 'red', 'WARNING'); break; }
        set({ gold: s.gold - d.gold, gems: s.gems - gemCost, inventory: inv });
        done++;
      }
      if (done) { notify(`Brewed ${done > 1 ? `${done}x ` : ''}${d.name}!`, d.color, 'ITEM'); events.emit('hub', { kind: 'brew', n: done }); events.emit('hub', { kind: 'brew_elixir', n: done }); }   // (brew_elixir: the main-quest step)
      return done;
    },

    drinkElixir: (item) => {
      const d = elixirOf(item), s = get();
      if (!d) return false;
      const inRun = s.status !== GameStatus.MENU && s.status !== GameStatus.HERO_SELECT && s.status !== GameStatus.GAME_OVER;
      if ((inRun ? s.elixirsRun : s.elixirsNext).includes(d.id)) { notify(`${d.name} is already ${inRun ? 'active' : 'waiting for your next run'}.`, '#f1d58e', 'WARNING'); return false; }
      if (!get().consumeItem((i) => i.type === 'ELIXIR' && i.name === d.name)) return false;
      if (inRun) {
        const b = { ...get().baseStats };
        applyElixir(b, d.id);
        set({ baseStats: b, stats: calc(b, get().equipment), elixirsRun: [...get().elixirsRun, d.id] });
        notify(`${d.name}: ${d.effect} for the rest of this run`, d.color, 'SYSTEM');
      } else {
        set({ elixirsNext: [...get().elixirsNext, d.id] });
        notify(`${d.name}: ${d.effect} during your next run`, d.color, 'SYSTEM');
      }
      return true;
    },

    buyInventorySlots: () => {
      const s = get();
      const cost = s.maxInventorySlots * 1000;
      if (s.gold < cost) return false;
      set({ gold: s.gold - cost, maxInventorySlots: s.maxInventorySlots + 5 }); events.emit('purchase', {}); 
      return true;
    },

    upgradeItem: (item) => {
      const s = get();
      const fail = (msg: string) => {
        set({ actionResult: { type: 'UPGRADE', success: false, message: msg } });
        return { success: false, msg, newItem: item };
      };
      if (item.level >= 10) return fail('Max Level Reached!');

      const free = questFree(s, 'forge');   // tutorial "Temper the Steel": the smith's first upgrade is on the house
      const tier = upgradeCoreTierFor(item.rarity);   // tiered cores: Common..Epic gear -> Upgrade Cores, Legendary+ -> Refined Cores
      const coreIndex = s.inventory.findIndex((i) => coreTierOf(i) === tier);
      const core = coreIndex >= 0 ? s.inventory[coreIndex] : null;
      const requiredCores = free ? 0 : upgradeCoresAt(item.level);
      const goldCost = free ? 0 : upgradeGoldFor(item.price, item.level);
      if (s.gold < goldCost) return fail('Not enough Gold!');
      if (requiredCores > 0 && (!core || (core.quantity || 1) < requiredCores)) return fail(`Need ${requiredCores} ${CORE_NAMES[tier]}s`);

      const chance = free ? 100 : upgradeChanceAt(item.level) * 100;
      const success = Math.random() * 100 < chance;

      const inv = s.inventory.slice();
      if (core && requiredCores > 0) {
        const coreQty = core.quantity || 1;
        if (coreQty > requiredCores) inv[coreIndex] = { ...core, quantity: coreQty - requiredCores };
        else inv.splice(coreIndex, 1);
      }

      if (!success && !free && Math.random() < upgradeBreakAt(item.level)) {   // past +7 a failure can shatter the item
        const equipment = { ...s.equipment } as Equipment;
        for (const sl of SLOTS) if (equipment[sl]?.id === item.id) equipment[sl] = null;
        const msg = `${item.name} shattered!`;
        set({ gold: s.gold - goldCost, inventory: inv.filter((i) => i.id !== item.id), equipment, stats: calc(s.baseStats, equipment), actionResult: { type: 'UPGRADE', success: false, message: msg } });
        return { success: false, msg, newItem: item };
      }
      if (!success) {
        set({ gold: s.gold - goldCost, inventory: inv, actionResult: { type: 'UPGRADE', success: false, message: 'Upgrade Failed...' } });
        return { success: false, msg: 'Upgrade Failed...', newItem: item };
      }

      const upgraded = (i: Item): Item => {
        const stats: Partial<PlayerStats> = { ...i.stats };
        const lvl = Math.max(1, i.level), f = plusMul(lvl + 1) / plusMul(lvl);   // +25% of the base per level
        for (const k of mutableStatKeys(stats)) {
          const v = stats[k];
          if (v === undefined) continue;
          stats[k] = parseFloat((v * (PET_PCT_STATS.has(k) ? 1 + (f - 1) / 3 : f)).toFixed(PET_PCT_STATS.has(k) ? 4 : 2));   // (owner) % stats (crit, cooldown ...) grow a third as fast
        }
        return { ...i, level: i.level + 1, stats };
      };
      const result = upgraded(item);
      const sameId = (i: Item | null) => (i && i.id === item.id ? result : i);
      const equipment = { ...EMPTY_EQUIPMENT } as Equipment;
      for (const sl of SLOTS) equipment[sl] = sameId(s.equipment[sl]);
      set({
        gold: s.gold - goldCost,
        inventory: inv.map((i) => (i.id === item.id ? result : i)),
        equipment,
        stats: calc(s.baseStats, equipment),
        actionResult: { type: 'UPGRADE', success: true, message: 'Upgrade Successful!', item: result },
      });
      events.emit('hub', { kind: 'upgrade', n: 1 });
      return { success: true, msg: 'Upgrade Successful!', newItem: result };
    },

    rollItemDrop: (rarityOverride) => {
      const hero = get().hero;
      const notPet = ITEMS_POOL.filter((i) => i.type !== 'PET' && !i.retired);
      // (owner) 85% gear for the active class, 15% other classes' gear (shared warehouse / alts); universal pieces always fit
      const other = Math.random() < OTHER_CLASS_SHARE;
      const usable = classFilter(hero, other);
      let pool: Item[];
      // Set pieces: elites / bosses / chests (rarity override) and a small chance on plain drops.
      const lvNow = get().level, dropLv = lvNow + 8;   // (owner) drops may be one tier above what the hero can equip yet (Uncommon from Lv 1)
      if (rarityOverride) rarityOverride = capRarity(rarityOverride, dropLv);   // (owner: tiers unlock at Lv 8 / 16 / 24 / 32 / 40)
      if (rarityOverride === 'COMMON') rarityOverride = 'UNCOMMON';   // (owner) treasures / rewards / bosses (every override roll) are never Common
      const setRarity: Rarity | null = rarityOverride ?? (Math.random() < 0.05 ? capRarity('RARE', dropLv) : null);
      const setChance: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 0.2, EPIC: 0.28, LEGENDARY: 0.35, MYTHIC: 0.5 };
      if (setRarity && Math.random() < setChance[setRarity] * (rarityOverride ? 1 : 0.5)) {
        const sets = notPet.filter((i) => i.setName && i.rarity === setRarity && usable(i)
          );
        if (sets.length) {
          const it = instantiate(sets[Math.floor(Math.random() * sets.length)]);
          const roll = Math.random();
          applyPlus(it, roll > 0.95 ? 3 : roll > 0.85 ? 2 : roll > 0.60 ? 1 : 0);
          return it;
        }
      }
      if (rarityOverride) {
        pool = notPet.filter((i) => i.rarity === rarityOverride && isGear(i) && !i.setName && usable(i));
        if (pool.length === 0) pool = notPet.filter((i) => isGear(i) && !i.setName && usable(i));
      } else {
        const r = Math.random();
        if (r > 0.95) pool = notPet.filter((i) => i.type === 'POTION');   // (owner: fewer potion drops, 5%)
        else if (r > 0.87) pool = notPet.filter((i) => i.id === 'upgrade_core'); // cores are rare (8% of item drops; tier I only)
        else {   // plain gear: Common / Uncommon / Rare, capped by level (owner: far fewer Common pieces - 70% of the Common rolls drop nothing)
          const tr = Math.random();
          const tier: Rarity = capRarity(tr < 0.4 ? 'COMMON' : tr < 0.75 ? 'UNCOMMON' : 'RARE', dropLv);
          if (tier === 'COMMON' && Math.random() < 0.7) return null;
          pool = notPet.filter((i) => isGear(i) && !i.setName && usable(i) && i.rarity === tier);
        }
      }
      if (pool.length === 0) return null;

      // Class weapons are somewhat more likely than other gear.
      const weighted: Item[] = [];
      for (const p of pool) {
        weighted.push(p, p);
        if (p.type === 'WEAPON' && canUseClass(p, hero)) weighted.push(p);
      }
      const item = instantiate(weighted[Math.floor(Math.random() * weighted.length)]);
      if (isGear(item)) {
        const roll = Math.random();
        applyPlus(item, roll > 0.95 ? 3 : roll > 0.85 ? 2 : roll > 0.60 ? 1 : 0);
      }
      return item;
    },

    // ----------------------------------------------------------- talents --
    allocateTalent: (id) => {
      const s = get();
      const node = TALENT_BY_ID[id];
      if (!node || node.hero !== s.hero) return false;
      const ranks = s.talents[s.hero];
      const free = talentPointsTotal(s.heroRank) - talentsSpent(ranks);
      if (allocBlock(node, ranks, free, s.heroRank)) return false;
      const talents = { ...s.talents, [s.hero]: { ...ranks, [id]: (ranks[id] || 0) + 1 } };
      set({ talents });
      set({ stats: calculateStats(s.baseStats, s.equipment, s.hero, talents, s.attrs?.[s.hero]) });
      return true;
    },
    respecTalents: () => {
      const s = get();
      const ranks = s.talents[s.hero];
      const cost = respecCost(ranks);
      if (cost <= 0) return false;
      if (s.gold < cost) { notify('Not enough Gold to respec!', 'red', 'WARNING'); return false; }
      const talents = { ...s.talents, [s.hero]: {} };
      set({ talents, gold: s.gold - cost });
      set({ stats: calculateStats(s.baseStats, s.equipment, s.hero, talents, s.attrs?.[s.hero]) });
      notify(`Talents reset (-${cost} gold)`, COLORS.uiAccent, 'SYSTEM');
      return true;
    },

    summon: (count, altar = 'GEM') => {
      const SUMMON_SHARD_SHARE = 0.84;   // (owner: gear is rare on summons) of the non-supply pulls: shards 84 / equipment 16 (~12% of all pulls; pity pulls are still gear)
      const s = get();
      const space = s.maxInventorySlots - s.inventory.length;
      const n = Math.min(count, space);
      if (n <= 0) { notify('Inventory Full!', 'red', 'WARNING'); return []; }
      const gem = altar === 'GEM';
      const cost = gem && n === 1 && questFree(s, 'summon') ? 0   // the tutorial's first summon is on the house
        : gem ? (n === 10 ? SUMMON_COST_10 : n * SUMMON_COST_1) : (n === 10 ? SHARD_COST_10 : n * SHARD_COST_1);
      if (gem && s.gems < cost) { notify('Not enough Gems!', 'red', 'WARNING'); return []; }
      if (!gem && (s.crystals ?? 0) < cost) { notify('Not enough Aether Crystals!', 'red', 'WARNING'); return []; }
      const W = gem ? GEM_SUMMON_WEIGHTS : SUMMON_WEIGHTS, CAPS = gem ? GEM_SUMMON_CAPS : SUMMON_CAPS;

      const all = summonPool(altar, s.hero);   // the Shard Altar offers fewer top-tier pieces (summonPool.ts)
      const results: Item[] = [], gearOut: Item[] = [], supplies: Item[] = [];
      const shardGain: Partial<Record<Rarity, number>> = {};
      let drawn = s.summonPity[altar] ?? 0;
      for (let k = 0; k < n; k++) {
        drawn++;
        let roll = Math.random() * 100;
        let rarity: Rarity = 'COMMON';
        for (const r of RARITIES) {
          roll -= W[r];
          if (roll <= 0) { rarity = r; break; }
        }
        const cap = CAPS[rarity];
        if (cap !== undefined && results.filter((i) => i.rarity === rarity).length >= cap) rarity = 'RARE';
        // pity: the 60th draw is a Legendary; the 240th is 80% Legendary / 20% Mythic
        if (drawn % PITY_MYTHIC === 0) rarity = Math.random() < 0.2 ? 'MYTHIC' : 'LEGENDARY';
        else if (drawn % PITY_LEGEND === 0) rarity = 'LEGENDARY';
        // half the pulls are shards of the rolled tier (Rare at least; several of the lower tiers), half are gear (Epic at least); pity pulls are gear
        const pity = drawn % PITY_LEGEND === 0 || drawn % PITY_MYTHIC === 0;
        const tutorial = cost === 0;   // the tutorial's free pull is the class Common weapon (the next step equips it; Lv 1)
        if (tutorial) { const w = makeItemById(`w_${s.hero.toLowerCase()}_0a`, 1)[0]; if (w) { results.push(w); gearOut.push(w); continue; } }
        if (!pity && !tutorial && Math.random() < SUMMON_SUPPLY_SHARE) {   // (owner) upgrade cores (tier I / II) and the gem-shop supplies
          let w = Math.random() * SUMMON_SUPPLY_TOTAL, id = SUMMON_SUPPLIES[0][0];
          for (const [sid, sw] of SUMMON_SUPPLIES) { w -= sw; if (w <= 0) { id = sid; break; } }
          const sup = makeItemById(id, 1)[0];
          if (sup) { results.push(sup); supplies.push(sup); continue; }
        }
        if (!pity && !tutorial && Math.random() < SUMMON_SHARD_SHARE) {
          const sr: Rarity = rarity === 'COMMON' ? 'RARE' : rarity;
          const q = 1;   // (owner: a shard pull is always a single shard)
          shardGain[sr] = (shardGain[sr] ?? 0) + q;
          results.push(shardItem(sr, q));
          continue;
        }
        if (rarity === 'COMMON') rarity = 'RARE';   // (owner: blue gear can come from summons again)
        let pool = all.filter((i) => i.rarity === rarity);
        if (pool.length === 0) pool = all;
        {   // (owner) the special summon-only pets come up more often than gear (60% of these pulls when the tier has one)
          const special = pool.filter((i) => i.type === 'PET' && (i as { summonOnly?: boolean }).summonOnly);
          const gearOnly = pool.filter((i) => i.type !== 'PET');
          if (special.length && Math.random() < 0.6) pool = special; else if (gearOnly.length) pool = gearOnly;
        }
        if (Math.random() < OTHER_CLASS_SHARE) {   // (owner) ~15% of gear pulls are another class's piece (shared warehouse / alts)
          const alt = ITEMS_POOL.filter((i) => isGear(i) && !i.retired && i.rarity === rarity && !canUseClass(i, s.hero) && !(altar === 'SHARD' && (rarity === 'LEGENDARY' || rarity === 'MYTHIC')));
          if (alt.length) pool = alt;
        }
        const it = instantiate(pool[Math.floor(Math.random() * pool.length)]);
        results.push(it); gearOut.push(it);
      }
      const summonPity = { ...s.summonPity, [altar]: drawn };
      const materials = { ...s.materials };
      for (const r of Object.keys(shardGain) as Rarity[]) materials[r] = (materials[r] ?? 0) + shardGain[r]!;
      // the Gem Altar also hands out an Aether Crystal per pull (owner: crystals come from gem summons too)
      events.emit('summonCast', {});
      if (gem) { set({ gems: s.gems - cost, inventory: [...s.inventory, ...gearOut.map(markNew)], summonPity, materials, crystals: (s.crystals ?? 0) + n }); feedReward({ crystals: n }); }
      else set({ materials, inventory: [...s.inventory, ...gearOut.map(markNew)], summonPity, crystals: (s.crystals ?? 0) - cost });
      for (const it of supplies) get().addItemToInventory(it);   // (stack onto existing potions / cores)
      events.emit('hub', { kind: 'summon', n: results.length });
      return results;
    },

    // --------------------------------------------------- notifications --
    // ---- pet growth (see petActions.ts)
    patchEquippedPet: (patch, spend) => {
      const s = get();
      if (!s.equipment.pet) return;
      const equipment = { ...s.equipment, pet: { ...s.equipment.pet, ...patch } };
      const materials = { ...s.materials };
      if (spend?.materials) for (const k of Object.keys(spend.materials) as Rarity[]) materials[k] = Math.max(0, materials[k] - (spend.materials[k] ?? 0));
      set({ equipment, stats: calc(s.baseStats, equipment), gold: s.gold - (spend?.gold ?? 0), materials, ...(spend?.inventory ? { inventory: spend.inventory } : {}) });
    },
    addNotification: (message, color = 'white', type = 'ITEM', action) => {
      // (owner) the same warning fired many times in a row (e.g. "Bag is full!" while vacuuming drops) shows once per 3 s
      if (type === 'WARNING') { const now = performance.now(), last = warnAt.get(message) ?? -1e9; if (now - last < 3000) return; warnAt.set(message, now); }
      set((s) => {
        let list = [...s.notifications, { id: uid('n'), message, color, type, action }];
        let itemCount = list.reduce((n, x) => n + (x.type === 'ITEM' ? 1 : 0), 0);
        while (itemCount > MAX_ITEM_NOTIFICATIONS) {
          const i = list.findIndex((x) => x.type === 'ITEM');
          list.splice(i, 1);
          itemCount--;
        }
        if (list.length > MAX_NOTIFICATIONS) list = list.slice(list.length - MAX_NOTIFICATIONS);
        return { notifications: list };
      });
    },

    removeNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  };
});

showcaseHooks.end = (won) => useGameStore.getState().endShowcase(won);

// ---- profile persistence: debounced write on any persisted field change, flushed when the page hides.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const flushProfile = (): void => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  writeProfile(useGameStore.getState());
};
unlockMirror.n = useGameStore.getState().unlocks.n; unlockMirror.early = useGameStore.getState().unlocks.early ?? [];   // (npcQuestStatus reads the unlock count without the store)
useGameStore.subscribe((s) => { unlockMirror.n = s.unlocks.n; unlockMirror.early = s.unlocks.early ?? []; });
// "new quest" dots: first load (or a fresh / reset profile) marks everything already available as seen
const seedQuestSeen = (): void => { const s = useGameStore.getState(); if (s.questSeen === null) useGameStore.setState({ questSeen: availableQuestIds(s) }); };
seedQuestSeen();
useGameStore.subscribe((s, prev) => { if (s.questSeen === null && prev.questSeen !== null) seedQuestSeen(); });
useGameStore.subscribe((s, prev) => {
  if (s.gold === prev.gold && s.gems === prev.gems && s.inventory === prev.inventory && s.equipment === prev.equipment
    && s.materials === prev.materials && s.maxInventorySlots === prev.maxInventorySlots && s.warehouse === prev.warehouse && s.warehouseGold === prev.warehouseGold && s.progress === prev.progress && s.tech === prev.tech && s.summonPity === prev.summonPity && s.story === prev.story && s.classProg === prev.classProg && s.npcQuests === prev.npcQuests && s.unlocks === prev.unlocks && s.questSeen === prev.questSeen && s.dashMods === prev.dashMods && s.heroRank === prev.heroRank
    && s.rankXp === prev.rankXp && s.gameStats === prev.gameStats && s.settings === prev.settings
    && s.hero === prev.hero && s.difficulty === prev.difficulty && s.talents === prev.talents && s.attrs === prev.attrs && s.starterGiven === prev.starterGiven && s.discovered === prev.discovered && s.codexClaimed === prev.codexClaimed && s.meta === prev.meta && s.welcomeGiftClaimed === prev.welcomeGiftClaimed && s.elixirsNext === prev.elixirsNext) return;
  if (!saveTimer) saveTimer = setTimeout(flushProfile, 400);
});
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushProfile);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushProfile(); });
}
if (loaded.gift) {
  flushProfile(); // fresh profile (gift included) is written immediately: a reload can never grant it twice
  useGameStore.getState().addNotification('Welcome gift: 5,000 gold, 500 gems, potions, an Ankh and 5 Upgrade Cores!', COLORS.uiAccent, 'SYSTEM');
}

// ---- codex discovery: sync from inventory / equipment / skills on every change, plus engine events for monsters.
const KEYSETS = { items: new Set(CODEX_KEYS.items), pets: new Set(CODEX_KEYS.pets), loot: new Set(CODEX_KEYS.loot), skills: new Set(CODEX_KEYS.skills) };
function syncDiscoveries(): void {
  const s = useGameStore.getState();
  const found: Record<'items' | 'pets' | 'loot', string[]> = { items: [], pets: [], loot: [] };
  const see = (it: { name: string } | null | undefined) => {
    if (!it) return;
    (['items', 'pets', 'loot'] as const).forEach((t) => { if (KEYSETS[t].has(it.name)) found[t].push(it.name); });
  };
  s.inventory.forEach(see);
  (Object.values(s.equipment) as (Item | null)[]).forEach(see);
  (['items', 'pets', 'loot'] as const).forEach((t) => { if (found[t].length) s.discover(t, found[t]); });
  const sk = (Object.keys(s.skillLevels) as (keyof typeof s.skillLevels)[]).filter((k) => s.skillLevels[k] > 0 && KEYSETS.skills.has(k as string)).map(String);
  if (sk.length) s.discover('skills', sk);
}
{
  useGameStore.subscribe((s, prev) => { if (s.inventory !== prev.inventory || s.equipment !== prev.equipment || s.skillLevels !== prev.skillLevels) syncDiscoveries(); });
  syncDiscoveries(); // seeds existing saved profiles
  const mon = (k: string) => useGameStore.getState().discover('monsters', [k]);
  events.on('spawn', (e) => { mon(e.kind); if (e.elite) mon('ELITE'); });
  events.on('enemyHit', (e) => mon(e.kind));
  events.on('enemyDeath', (e) => { if (!e.poof) { mon(e.kind); if (e.elite) mon('ELITE'); } });
  events.on('bossSpawn', (e) => { const k = monsterKeyByName(e.name); if (k) mon(k); });
}

// The active character's class is fixed (characters.ts): a brand-new character starts on its chosen class.
{
  const ac = activeChar();
  if (ac && useGameStore.getState().hero !== ac.hero) useGameStore.getState().selectHero(ac.hero);
}

// ---- shards are bag items: keep the materials counts and the shard stacks in sync (shards.ts)
{
  const st = useGameStore.getState(), inv = syncShardStacks(st.inventory, st.materials);
  if (inv !== st.inventory) useGameStore.setState({ inventory: inv });   // old saves: counts -> stacks
}
useGameStore.subscribe((s, p) => {
  if (s.materials !== p.materials) {          // gained / spent shards -> stacks
    const inv = syncShardStacks(s.inventory, s.materials);
    if (inv !== s.inventory) useGameStore.setState({ inventory: inv });
  } else if (s.inventory !== p.inventory) {   // a stack was sold / deleted / stored / retrieved -> counts
    const c = shardCounts(s.inventory);
    if (SHARD_RARITIES.some((r) => c[r] !== s.materials[r])) useGameStore.setState({ materials: c });
  }
});

// ---- Aether Crystals are a bag item too: the `crystals` count and the crystal stack stay in sync (crystals.ts)
{
  const st = useGameStore.getState(), inv = syncCrystalStack(st.inventory, st.crystals ?? 0);
  if (inv !== st.inventory) useGameStore.setState({ inventory: inv });   // old saves: count -> stack
}
useGameStore.subscribe((s, p) => {
  if (s.crystals !== p.crystals) {            // gained / spent -> stack
    const inv = syncCrystalStack(s.inventory, s.crystals ?? 0);
    if (inv !== s.inventory) useGameStore.setState({ inventory: inv });
  } else if (s.inventory !== p.inventory) {   // the stack was deleted / stored / retrieved -> count
    const c = crystalCount(s.inventory);
    if (c !== (s.crystals ?? 0)) useGameStore.setState({ crystals: c });
  }
});

// ---- active skills auto-learn when the class reaches their unlock level (classLevels.autoLearnActives)
const autoLearn = (): void => {
  const st = useGameStore.getState(), cp = st.classProg[st.hero];
  if (!cp) return;
  const perm = autoLearnActives(st.hero, cp.lv, cp.skills);
  const run = autoLearnActives(st.hero, cp.lv, st.skillLevels);
  if (!perm && !run) return;
  const learned = [...ACTIVE_ORDER[st.hero], 'ult' as const].filter((k) => (perm ?? cp.skills)[k] > 0 && !(cp.skills[k] > 0));
  useGameStore.setState({ classProg: perm ? { ...st.classProg, [st.hero]: { ...cp, skills: perm } } : st.classProg, ...(run ? { skillLevels: run } : {}) });
  for (const k of learned) st.addNotification(k === 'ult' ? 'Ultimate unlocked! It is fully charged' : `New skill learned: ${activeDefs(st.hero).find((a) => a.slot === k)?.name ?? k}`, '#f1d58e', 'SYSTEM');
};
autoLearn();
useGameStore.subscribe((s, p) => { if (s.hero !== p.hero || s.classProg !== p.classProg || s.skillLevels !== p.skillLevels) autoLearn(); });
