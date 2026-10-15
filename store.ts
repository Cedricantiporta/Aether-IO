// ============================================================================
// Zustand store — META / RPG state only (inventory, stats, panels, progression).
// Anything that changes every frame lives in engine/world.ts. See storeTypes.ts.
// ============================================================================
import { GOLD_SCALE } from './constants';
import { abilityMana, activeDefs, dashKey, ACTIVE_ORDER } from './abilityDefs';
import { debug } from './engine/debug';
import { ASCENSION_MAX } from './ascension';
import { weaponPerk, lifeStealOf } from './weaponPerks';
import { activeChar, activeProfileKey } from './characters';
import { STORY, STORY_V, sanitizeStory, type StorySave } from './story';
import { FUSE_COUNT, FUSE_CHANCE, nextTier, randomPetOf } from './petFusion';
import { xpNeed, growBase, unlockLevel, skillCost, freshClass, sanitizeClassProg, MAX_LEVEL, type ClassProg, autoLearnActives } from './classLevels';
let runStartLevel = 1;
import { TECH, ROMAN, techLv, sanitizeTech, type TechId, type TechLevels } from './tech';
import { runInfo, type RunMode } from './engine/runMods';
import { create } from 'zustand';
import {
  GameStatus, PlayerStats, Upgrade, Item, SkillLevels, Rarity, HeroClass, ItemType,
  AbilityType, GameStatistics, UpgradeType, GameNotification,
} from './types';
import {
  ITEMS_POOL, HERO_STATS, PETS_POOL, COLORS, SKILLS_INFO, INVENTORY_LIMIT, WAREHOUSE_LIMIT, UPGRADES_POOL, POTION_STACK_LIMIT,
  MATERIAL_COMBINE_COST, MATERIAL_DOWNGRADE_YIELD, MULTISHOT_CAP, RANK_REQ,
} from './constants';
import { rollAffixes, affixFx, affixCP } from './affixes';
import { accumulateSets } from './itemSets';
import { newAcc, accumulate, applyAcc } from './statFx';
import { accumulateTalents, allocBlock, emptyTalents, respecCost, sanitizeTalents, talentPointsTotal, talentsSpent, TALENT_BY_ID, type TalentRanks } from './talents';
import { STARTER_GEAR } from './itemCatalog';
import { SET_BY_NAME } from './itemSets';
import { applyPlus, canCraft, consumeLoot, craft, recycleYield, recycleYieldAll, type Recipe, CRAFT_SUCCESS } from './crafting';
import { deviceDefaults } from './engine/device';
import { feedReward } from './rewardFeed';
import { applyAttrs, sanitizeAttrs, attrPointsTotal, attrSpent, ATTR_RESET_GOLD, type Attrs } from './attributes';
import { shardCounts, syncShardStacks, SHARD_RARITIES, shardItem } from './shards';
import { summonPool } from './summonPool';
import type { Difficulty, Equipment, EquipSlot, GameState, RunProgress, Settings, ShopTab } from './storeTypes';
import { startRun, enterVillage } from './engine/game';
import { LOOT_STACK_LIMIT } from './loot';
import { petPower } from './petGrowth';
import { emptyNpcQuests, sanitizeNpcQuests, type NpcQuestSave } from './npcQuests';
import { fillQuests, questDone, questCounts, questNeedsKing, QUEST_MAX_ACTIVE, type Quest, type QuestType } from './quests';
import type { EnemyKind } from './engine/types';
import { world } from './engine/world';
import { events } from './engine/events';
import { freshMeta, sanitizeMeta, type MetaState } from './goals';
import { CODEX_KEYS, CODEX_REWARD_GEMS, emptyDiscovered, monsterKeyByName, type CodexTab, type Discovered } from './codexData';

// ------------------------------------------------------------------ consts --
const LEGACY_KEY = 'aether-survivor-v2';           // gameStats + settings only (pre-profile builds)
const PROFILE_KEY = activeProfileKey();   // the active character's save (characters.ts; the first one keeps 'aether-survivor-profile-v1')
const PROFILE_VERSION = 1;
const MAX_SKILL_LEVEL = 5;
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const MAX_ITEM_NOTIFICATIONS = 6;
const MAX_NOTIFICATIONS = 12;

const INITIAL_STATS: PlayerStats = {
  maxHealth: 100, maxMana: 100, regen: 0.5, manaRegen: 0.5, moveSpeed: 10, damage: 18,
  fireRate: 1.4, projectileSpeed: 20, multishot: 1, spread: 0.2, dashCooldown: 4.0,
  cooldownReduction: 0, magnetRadius: 5.0, critRate: 0.05, critDamage: 1.5, defense: 0,
  skillDamage: 1.0, knockback: 0.5, dodge: 0,
  lifeSteal: 0, minionDmg: 0, minionLife: 0, minionCount: 0, minionHaste: 0, thorns: 0, goldFind: 0, xpBonus: 0, pierceBonus: 0, onHitBurnChance: 0, onHitSlowChance: 0,
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
  masterVolume: 0.7, sfxVolume: 0.8, musicVolume: 0.5, quality: _dd.quality,
  showDamageNumbers: true, screenShake: true, autoPotions: true,
  autoAim: _dd.autoAim, autoQuality: true, fpsLimit: _dd.fpsLimit, showFps: false, uiScale: _dd.uiScale, cameraZoom: 1, zoomUnlocked: false,
  showEnemyBars: true, showMinimap: true, vibration: true, joystickSide: 'LEFT', batterySaver: false, castMode: 'AIMED', autoSkills: false, aimAtCursor: false, cameraLead: false, autoLootGear: 'RARE', autoLootMaterials: false, autoLootRange: 'NEAR', autoLootOnClear: false,
};

const EMPTY_EQUIPMENT: Equipment = { weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null, pet: null };
const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory', 'pet'];
const emptyMaterials = (): Record<Rarity, number> => ({ COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 });

/** Hero rank needed to equip gear of a rarity. */
export { RANK_REQ };
/** Hero rank xp needed to go from rank r to r+1. */
export const rankXpNeeded = (r: number): number => Math.round(400 * Math.pow(Math.max(1, r), 1.35));
/** Passive perk: +1% gold find per rank, capped at +50%. */
export const goldFindMul = (rank: number): number => 1 + Math.min(0.5, 0.01 * rank);
/** Items each shop can put on sale (potion shop provisions, buyable pets). */
export const SUPPLY_STOCK = ITEMS_POOL.filter((i) => i.type === 'POTION' || i.type === 'CORE' || i.type === 'REVIVE');
export const SHOP_STOCK_IDS: string[][] = [SUPPLY_STOCK.map((i) => i.id), PETS_POOL.filter((p) => !p.summonOnly).map((p) => p.id)];
const pickWeighted = <T,>(opts: [T, number][]): T => {
  let r = Math.random() * opts.reduce((n, o) => n + o[1], 0);
  for (const [v, w] of opts) { r -= w; if (r <= 0) return v; }
  return opts[0][0];
};
/** Per shop: 1 item on sale most often, sometimes 2-5, each with its own 10-30% off (weighted low). */
export function rollSales(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ids of SHOP_STOCK_IDS) {
    if (!ids.length) continue;
    const n = Math.min(ids.length, pickWeighted<number>([[1, 55], [2, 25], [3, 13], [4, 4], [5, 3]]));
    const pool = [...ids];
    for (let i = 0; i < n; i++) out[pool.splice(Math.floor(Math.random() * pool.length), 1)[0]] = pickWeighted<number>([[0.1, 40], [0.15, 25], [0.2, 18], [0.25, 10], [0.3, 7]]);
  }
  return out;
}
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
export type QuestFreebie = 'potion' | 'summon' | 'armor' | 'forge' | 'train';
export const questFree = (s: { story: StorySave }, what: QuestFreebie): boolean => STORY[s.story.step]?.id === what;
/** Armor pieces (the "Suit of Steel" step): body armor, helmets, gloves, boots. */
export const isArmorPiece = (i: { type: string }): boolean => i.type === 'ARMOR' || i.type === 'HELMET' || i.type === 'GLOVES' || i.type === 'BOOTS';
export const freeBuy = (s: { story: StorySave; equipment: Equipment; inventory: Item[]; warehouse: Item[] }, item: { id: string; type: string }): boolean =>
  firstPetFree(s, item.id) || (item.id === 'potion_hp' && questFree(s, 'potion')) || (isArmorPiece(item) && questFree(s, 'armor'));
export const shopPrice = (item: { id: string; price: number }): number => Math.max(1, Math.round(item.price * (1 - saleOf(item))));

export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: COLORS.rarityCommon, RARE: COLORS.rarityRare, EPIC: COLORS.rarityEpic,
  LEGENDARY: COLORS.rarityLegendary, MYTHIC: COLORS.rarityMythic,
};

// Summon odds (%): epic is very rare, legendary ultra rare, mythic hyper rare.
/** Shard altar (purple): the classic odds. */
export const SUMMON_WEIGHTS: Record<Rarity, number> = { COMMON: 72, RARE: 24.45, EPIC: 3, LEGENDARY: 0.5, MYTHIC: 0.05 };
/** Gem altar (gold): premium odds. */
export const GEM_SUMMON_WEIGHTS: Record<Rarity, number> = { COMMON: 45, RARE: 40, EPIC: 12, LEGENDARY: 2.7, MYTHIC: 0.3 };
export const GEM_SUMMON_CAPS: Partial<Record<Rarity, number>> = { EPIC: 3, LEGENDARY: 1, MYTHIC: 1 };
/** Shard summons are paid with Common shards. */
export const SHARD_COST_1 = 100;
export const SHARD_COST_10 = 900;
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
const uid = (prefix = 'id'): string => `${prefix}_${Date.now().toString(36)}_${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const isStackable = (item: Item): boolean => item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE' || item.type === 'LOOT' || item.type === 'SHARD';
const stackLimit = (item: Item): number => (item.type === 'SHARD' ? 1e9 : item.type === 'LOOT' ? LOOT_STACK_LIMIT : POTION_STACK_LIMIT);
const isGear = (item: Item): boolean => item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY' || item.type === 'HELMET' || item.type === 'GLOVES' || item.type === 'BOOTS';

/** Combat power of one item (UI comparison / auto-equip). */
export const calculateItemCP = (item: Item): number => {
  if (item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE') return 0;
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
  const mult: Record<Rarity, number> = { COMMON: 1, RARE: 1.2, EPIC: 1.5, LEGENDARY: 2.0, MYTHIC: 3.0 };
  cp += affixCP(item);
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

/** baseStats + equipment (+ affixes, set bonuses, talents). Temporary buffs (rage / sprint) are applied by the engine. */
const calculateStats = (base: PlayerStats, equipment: Equipment, hero: HeroClass, talents: Record<HeroClass, TalentRanks>, attrs?: Attrs): PlayerStats => {
  const final: PlayerStats = { ...base };
  const acc = newAcc();

  (Object.values(equipment) as (Item | null)[]).forEach((item) => {
    if (!item || !item.stats) return;
    (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
      let v = item.stats[k];
      if (v === undefined || v === null) return;
      if (item.type === 'WEAPON' && k === 'damage') v *= 0.5;
      if (item.type === 'ARMOR' && k === 'defense') v *= 0.5;
      if (item.type === 'PET') v *= petPower(item);
      if (k === 'cooldownReduction') final[k] = Math.min(0.75, final[k] + v);
      else final[k] += v;
    });
    if (item.affixes) for (const a of item.affixes) accumulate(acc, affixFx(a));
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

const generateUpgradeOptions = (hero: HeroClass, skillLevels: SkillLevels, stats: PlayerStats, count = 3): Upgrade[] => {
  const pool = UPGRADES_POOL.filter((u) => {
    if (u.classType && u.classType !== hero) return false;
    const key = skillKeyFor(u.type, hero);
    if (key && (skillLevels[key] >= MAX_SKILL_LEVEL || skillLevels[key] <= 0)) return false;   // cards only boost learned skills
    if (u.type === 'MULTISHOT' && Math.floor(stats.multishot + 1e-6) >= MULTISHOT_CAP) return false;
    return true;
  });
  const options: Upgrade[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const base = pool.splice(idx, 1)[0];
    const opt: Upgrade = { ...base, id: uid('card') };
    const key = skillKeyFor(base.type, hero);
    if (key) {
      const lvl = skillLevels[key];
      if (lvl === 0) opt.name = `UNLOCK: ${opt.name}`;
      opt.description = getSkillCardDetails(key, lvl, stats, hero);
    }
    if (base.type === 'MULTISHOT') {
      const cur = Math.floor(stats.multishot + 1e-6);
      opt.description = `Projectiles: ${cur} → ${Math.min(MULTISHOT_CAP, cur + 1)} (max ${MULTISHOT_CAP})`;
    }
    options.push(opt);
  }
  return options;
};

/** Adds Upgrade Cores to the bag (stacks onto an existing core stack). */
const addCores = (inv: Item[], n: number): Item[] => {
  if (n <= 0) return inv;
  const idx = inv.findIndex((i) => i.type === 'CORE');
  if (idx >= 0) { const out = inv.slice(); out[idx] = { ...out[idx], quantity: (out[idx].quantity || 1) + n }; return out; }
  const tpl = ITEMS_POOL.find((i) => i.type === 'CORE')!;
  return [...inv, { ...tpl, id: uid('it'), stats: {}, quantity: n }];
};

export const instantiate = (template: Item): Item => rollAffixes({
  ...template,
  level: isGear(template) || template.type === 'PET' ? template.level : 1,
  id: uid('it'),
  stats: { ...template.stats },
  onHitEffect: template.onHitEffect ? { ...template.onHitEffect } : undefined,
  affixes: undefined,
  quantity: 1,
});

const mutableStatKeys = (stats: Partial<PlayerStats>): (keyof PlayerStats)[] => Object.keys(stats) as (keyof PlayerStats)[];

// -------------------------------------------------------------- persistence --
interface Profile {
  v: number;
  gold: number; gems: number;
  inventory: Item[]; equipment: Equipment; materials: Record<Rarity, number>; maxInventorySlots: number;
  warehouse?: Item[]; warehouseGold?: number;
  progress?: RunProgress;   // ending / ascension / endless tower records
  tech?: TechLevels;        // Tech House upgrades
  story?: StorySave;        // main story chain (story.ts)
  classProg?: Record<HeroClass, ClassProg>;   // permanent per-class level / xp / skill points / learned skills
  summonPity?: SummonPity;  // draws so far per altar (guaranteed Legendary every 60, Legendary/Mythic every 240)
  npcQuests?: NpcQuestSave;   // NPC story quests (npcQuests.ts)
  heroRank: number; rankXp: number; quests: Quest[];
  gameStats: GameStatistics; settings: Settings;
  welcomeGiftClaimed: boolean;
  hero: HeroClass; difficulty: Difficulty;
  talents: Record<HeroClass, TalentRanks>;
  attrs?: Record<HeroClass, Attrs>;   // allocated attribute points per class (attributes.ts)
  starterGiven: Record<HeroClass, boolean>;
  discovered?: Discovered; codexClaimed?: string[];
  gems1k?: boolean;   // one-time top-up of older saves to the 1000-gem start
  zoom1?: boolean;    // one-time reset of the saved camera zoom to the 1.0 default
  gold10?: boolean;   // one-time x10 economy migration (gold + stored item prices)
  meta?: MetaState;   // daily / weekly goals, achievements, equipped title (goals.ts)
}

export const makeItemById = (id: string, quantity: number): Item[] => {
  const tpl = ITEMS_POOL.find((i) => i.id === id);
  return tpl ? [{ ...tpl, level: isGear(tpl) || tpl.type === 'PET' ? tpl.level : 1, stats: { ...tpl.stats }, id: uid('gift'), quantity }] : [];
};

/** One-time welcome gift for a brand new profile. */
const WELCOME_GIFT = { gold: 10000, gems: 1000 };
const welcomeItems = (): Item[] => [...makeItemById('potion_hp', 5), ...makeItemById('potion_mana', 5), ...makeItemById('revive_ankh', 1), ...makeItemById('upgrade_core', 5)];

const baseGameStats = (): GameStatistics => ({
  ...INITIAL_GAME_STATS, classRuns: { ...INITIAL_GAME_STATS.classRuns }, classHighestWave: { ...INITIAL_GAME_STATS.classHighestWave },
});

/** Full COMMON starter set (weapon + helmet/armor/gloves/boots/accessory) for a class. */
const starterPiece = (id: string): Item | null => {
  const tpl = ITEMS_POOL.find((i) => i.id === id);
  return tpl ? { ...instantiate(tpl), id: uid('start') } : null;
};
const starterEquipment = (hero: HeroClass): Equipment => {
  const g = STARTER_GEAR[hero];
  return {
    ...EMPTY_EQUIPMENT,
    weapon: starterPiece(HERO_STATS[hero].weaponId),
    helmet: starterPiece(g.helmet), armor: starterPiece(g.armor), gloves: starterPiece(g.gloves), boots: starterPiece(g.boots), accessory: starterPiece(g.accessory),
  };
};
const isStarterId = (id: string | undefined): boolean => !!id && id.startsWith('start_');

/** A brand-new profile with the welcome gift applied (welcomeGiftClaimed = true). */
const freshProfile = (settings?: Settings, gameStats?: GameStatistics): Profile => ({
  v: PROFILE_VERSION,
  gold: WELCOME_GIFT.gold, gems: WELCOME_GIFT.gems,
  inventory: welcomeItems(), equipment: starterEquipment('ARCHER'), materials: emptyMaterials(), maxInventorySlots: INVENTORY_LIMIT,
  heroRank: 1, rankXp: 0, quests: fillQuests(1, []), npcQuests: emptyNpcQuests(), classProg: sanitizeClassProg(undefined, INITIAL_SKILLS, 1),
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
              gold: num(p.gold, 0) * (p.gold10 ? 1 : GOLD_SCALE), gems: p.gems1k ? num(p.gems, 0) : Math.max(num(p.gems, 0), WELCOME_GIFT.gems),
              inventory: Array.isArray(p.inventory) ? p.inventory.map((i) => (!isGear(i) && i.type !== 'PET' && i.level !== 1 ? { ...i, level: 1 } : i)).map((i) => (p.gold10 ? i : { ...i, price: Math.round((i.price || 0) * GOLD_SCALE) })) : [],
              equipment: p.gold10 ? { ...EMPTY_EQUIPMENT, ...(p.equipment ?? {}) } : Object.fromEntries(Object.entries({ ...EMPTY_EQUIPMENT, ...(p.equipment ?? {}) }).map(([k, v]) => [k, v ? { ...(v as Item), price: Math.round(((v as Item).price || 0) * GOLD_SCALE) } : v])) as unknown as Equipment,
              materials: { ...emptyMaterials(), ...(p.materials ?? {}) },
              maxInventorySlots: Math.max(INVENTORY_LIMIT, num(p.maxInventorySlots, INVENTORY_LIMIT)),
              warehouse: Array.isArray(p.warehouse) ? p.warehouse.slice(0, WAREHOUSE_LIMIT + 25 * techLv(sanitizeTech(p.tech), 'warehouse')) : [], warehouseGold: Math.max(0, num(p.warehouseGold, 0)), progress: sanitizeProgress(p.progress), tech: sanitizeTech(p.tech), summonPity: sanitizePity(p.summonPity), story: sanitizeStory(p.story, sanitizeProgress(p.progress).endings, false), classProg: sanitizeClassProg(p.classProg, INITIAL_SKILLS, num(p.heroRank, 1)),
              npcQuests: sanitizeNpcQuests(p.npcQuests),
              heroRank: Math.max(1, Math.floor(num(p.heroRank, 1))), rankXp: num(p.rankXp, 0),
              quests: fillQuests(Math.max(1, num(p.heroRank, 1)), Array.isArray(p.quests) ? p.quests : []),
              gameStats: mergeStats(p.gameStats), settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), ...(p.zoom1 ? {} : { cameraZoom: 1 }) },
              welcomeGiftClaimed: p.welcomeGiftClaimed !== false,
              hero: p.hero === 'WIZARD' || p.hero === 'BARBARIAN' || p.hero === 'KNIGHT' || p.hero === 'NECROMANCER' ? p.hero : f.hero,
              difficulty: p.settings?.hardMode ? 'HARD' : 'NORMAL',   // (Hard mode is a Settings toggle)
              attrs: sanitizeAttrs(p.attrs),
              talents: sanitizeTalents(p.talents),
              starterGiven: { ...f.starterGiven, ...(p.starterGiven ?? {}), [p.hero === 'WIZARD' || p.hero === 'BARBARIAN' || p.hero === 'KNIGHT' || p.hero === 'NECROMANCER' ? p.hero : 'ARCHER']: true },
              discovered: sanitizeDiscovered(p.discovered),
              codexClaimed: Array.isArray(p.codexClaimed) ? p.codexClaimed.filter((x) => typeof x === 'string') : [],
              meta: sanitizeMeta(p.meta),
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
const sanitizeProgress = (p: Partial<RunProgress> | undefined): RunProgress => ({
  endings: Math.max(0, num(p?.endings, 0)),
  ascensionMax: Math.max(0, Math.min(ASCENSION_MAX, num(p?.ascensionMax, 0))),
  ascension: Math.max(0, Math.min(ASCENSION_MAX, num(p?.ascension, 0))),
  towerBest: { ARCHER: num(p?.towerBest?.ARCHER, 0), WIZARD: num(p?.towerBest?.WIZARD, 0), BARBARIAN: num(p?.towerBest?.BARBARIAN, 0), KNIGHT: num(p?.towerBest?.KNIGHT, 0), NECROMANCER: num(p?.towerBest?.NECROMANCER, 0) },
});

const writeProfile = (s: GameState): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    const p: Profile = {
      v: PROFILE_VERSION, gold: s.gold, gems: s.gems, inventory: s.inventory, equipment: s.equipment, materials: s.materials,
      maxInventorySlots: s.maxInventorySlots, warehouse: s.warehouse, warehouseGold: s.warehouseGold, progress: s.progress, tech: s.tech, summonPity: s.summonPity, story: s.story, classProg: s.classProg, npcQuests: s.npcQuests, heroRank: s.heroRank, rankXp: s.rankXp, quests: s.quests,
      gameStats: s.gameStats, settings: s.settings, welcomeGiftClaimed: s.welcomeGiftClaimed, hero: s.hero, difficulty: s.difficulty,
      talents: s.talents, attrs: s.attrs, starterGiven: s.starterGiven, discovered: s.discovered, codexClaimed: s.codexClaimed, meta: s.meta, gems1k: true, zoom1: true, gold10: true,
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
        inv[i] = { ...s, quantity: q + add };
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
    item.type === 'WEAPON' && item.classType ? WEAPON_Q[item.classType] : null;

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
    if (equipment.weapon && equipment.weapon.classType && equipment.weapon.classType !== hero) {
      inventory.push(equipment.weapon);
      equipment.weapon = null;
    }
    if (!equipment.weapon) {
      // prefer the best class weapon already in the bag; only mint a starter when there is none
      const own = inventory.filter((i) => i.type === 'WEAPON' && i.classType === hero && profileRank() >= RANK_REQ[i.rarity])
        .sort((a, b) => calculateItemCP(b) - calculateItemCP(a))[0];
      if (own) { inventory.splice(inventory.indexOf(own), 1); equipment.weapon = own; }
      else {
        const tpl = ITEMS_POOL.find((i) => i.id === heroInfo.weaponId);
        if (tpl) equipment.weapon = { ...instantiate(tpl), id: uid('start_wep') };
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
    inventory: startLoadout.inventory,
    equipment: startLoadout.equipment,
    materials: profile.materials,
    maxInventorySlots: profile.maxInventorySlots,
    warehouse: profile.warehouse ?? [],
    warehouseGold: profile.warehouseGold ?? 0,
    progress: profile.progress ?? sanitizeProgress(undefined),
    tech: profile.tech ?? {},
    summonPity: profile.summonPity ?? { GEM: 0, SHARD: 0 },
    story: profile.story ?? { step: 0, p: 0, v: STORY_V },   // a brand-new profile starts the main story
    classProg: profile.classProg ?? sanitizeClassProg(undefined, INITIAL_SKILLS, 1),
    npcQuests: profile.npcQuests ?? emptyNpcQuests(),
    heroRank: profile.heroRank,
    rankXp: profile.rankXp,
    quests: profile.quests,
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
      const s = get(), cp = s.classProg[s.hero];
      const sp = Math.max(0, cp.sp + (lv - cp.lv));
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
        for (const slot of ['helmet', 'armor', 'gloves', 'boots', 'accessory'] as const) {
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
      const l = loadoutFor(state.hero, state.inventory, state.equipment);
      set({
        ...runState(state.hero, l.baseStats, l.stats),
        status: GameStatus.PLAYING,
        inventory: l.inventory,
        equipment: l.equipment,
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
        notifications: [],
        actionResult: null,
        maxInventorySlots: Math.max(state.maxInventorySlots, INVENTORY_LIMIT),
      });
      runStartLevel = get().level;
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

    abandonRun: () => {
      get().endRun({ ...world.run, wave: world.director.wave });
      get().resetGame();
    },

    resetProfile: () => {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
      const f = freshProfile(get().settings);
      set({
        gold: f.gold, gems: f.gems, inventory: f.inventory, equipment: f.equipment, materials: f.materials,
        maxInventorySlots: f.maxInventorySlots, warehouse: get().warehouse, warehouseGold: get().warehouseGold, progress: sanitizeProgress(undefined),   /* (the warehouse is shared by all characters: kept) */ tech: {}, summonPity: { GEM: 0, SHARD: 0 }, story: { step: 0, p: 0, v: STORY_V }, classProg: sanitizeClassProg(undefined, INITIAL_SKILLS, 1), npcQuests: emptyNpcQuests(), heroRank: 1, rankXp: 0, quests: f.quests, gameStats: f.gameStats,
        welcomeGiftClaimed: true, hero: 'ARCHER', difficulty: 'NORMAL', lastRun: null,
        talents: emptyTalents(), attrs: sanitizeAttrs(undefined), starterGiven: f.starterGiven, discovered: emptyDiscovered(), codexClaimed: [], meta: freshMeta(),
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
      let { experience, experienceToNextLevel, level } = get();
      const gain = amount * (1 + get().stats.xpBonus);
      experience += gain;
      const startLevel = level;
      let base = get().baseStats;
      let sp = get().skillPoints;

      while (experience >= experienceToNextLevel) {
        experience -= experienceToNextLevel;
        if (level >= MAX_LEVEL) { experience = 0; break; }
        level += 1;
        experienceToNextLevel = xpNeed(level);
        sp += 1;
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
        upgradeOptions: generateUpgradeOptions(s.hero, s.skillLevels, s.stats, extraCard ? 4 : 3),
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
          case 'HEALTH': base.maxHealth += upgrade.value; world.player.hp += upgrade.value; break;
          case 'MAX_MANA': base.maxMana += upgrade.value; world.player.mana += upgrade.value; break;
          case 'DAMAGE': base.damage += base.damage * upgrade.value; break;
          case 'SPEED': base.moveSpeed += base.moveSpeed * upgrade.value; break;
          case 'FIRE_RATE': base.fireRate += base.fireRate * upgrade.value; break;
          case 'DEFENSE': base.defense += upgrade.value; break;
          case 'CRIT_RATE': base.critRate += upgrade.value; break;
          case 'CRIT_DAMAGE': base.critDamage += upgrade.value; break;
          case 'MULTISHOT': base.multishot += upgrade.value; break;
          case 'ULT_FILL': world.player.ult = Math.max(world.player.ult, Math.min(100, upgrade.value)); break;
          case 'RESTORE': world.player.hp = state.stats.maxHealth; world.player.mana = state.stats.maxMana; events.emit('heal', { pos: world.player.pos, amount: state.stats.maxHealth }); break;
          case 'AEGIS': { const sh = state.stats.maxHealth * upgrade.value; world.player.aegis = Math.max(world.player.aegis, sh); world.player.aegisMax = Math.max(world.player.aegisMax, world.player.aegis); break; }
          case 'DASH_COOLDOWN': base.dodge = (base.dodge || 0) + 0.04; break;   // (dashes are a flat 4 s now: Shadow Step gives dodge)
          default: break;
        }
      }
      set({
        baseStats: base,
        skillLevels: levels,
        stats: calc(base, state.equipment),
        upgradeOptions: [],
        status: GameStatus.PLAYING,
      });
    },

    upgradeSkill: (skill) => {
      const s = get();
      const lvl = s.skillLevels[skill];
      if (lvl >= MAX_SKILL_LEVEL) return;
      const cost = questFree(s, 'train') ? 0   // tutorial "Lessons of the Blade": the trainer's first lesson is free
        : skillCost(skill, lvl, skill === 'dash' || (skill === 'e' && s.hero !== 'BARBARIAN'));
      const need = unlockLevel(s.hero, skill);
      if (s.level < need) { notify(`Unlocks at Lv ${need}`, 'red', 'WARNING'); return; }
      if (s.skillPoints < cost) return;
      const cp = s.classProg[s.hero];
      const perm = { ...cp.skills, [skill]: Math.min(MAX_SKILL_LEVEL, (cp.skills[skill] ?? 0) + 1) };   // learned for good
      set({ skillLevels: { ...s.skillLevels, [skill]: lvl + 1 }, skillPoints: s.skillPoints - cost,
        classProg: { ...s.classProg, [s.hero]: { ...cp, skills: perm, sp: s.skillPoints - cost } } });
      events.emit('hub', { kind: 'learn', n: 1 });
    },

    endRun: (summary) => {
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

    addQuestProgress: (type, amount = 1, kind, lootName) => {
      const s = get();
      let changed = false;
      const quests = s.quests.map((q) => {
        if (!q.accepted || questCounts(q) !== type || q.progress >= q.target) return q;
        if (type === 'KILL_KIND' && q.kind !== kind) return q;
        if (type === 'COLLECT_LOOT' && q.lootName !== lootName) return q;
        changed = true;
        // REACH_WAVE tracks the best wave reached; everything else accumulates
        const progress = type === 'REACH_WAVE' ? Math.max(q.progress, amount) : q.progress + amount;
        return { ...q, progress: Math.min(q.target, progress) };
      });
      if (!changed) return;
      set({ quests });
      for (let i = 0; i < quests.length; i++) {
        if (quests[i] === s.quests[i] || quests[i].progress < quests[i].target) continue;
        if (questNeedsKing(quests[i])) notify('Objective complete! Report to the King in the castle.', COLORS.uiAccent, 'SYSTEM');
        else notify('Quest complete! Visit the quest board.', COLORS.uiAccent, 'SYSTEM');
      }
    },

    reportToKing: () => {
      const s = get();
      let audience = 0, reports = 0;
      const quests = s.quests.map((q) => {
        if (!questNeedsKing(q)) return q;
        if (q.type === 'AUDIENCE') { audience++; return { ...q, progress: q.target, reported: true }; }
        reports++; return { ...q, reported: true };
      });
      if (audience + reports === 0) return { audience: 0, reports: 0 };
      set({ quests });
      notify('The King has acknowledged your deeds. Claim your reward at the Quest Board!', COLORS.uiAccent, 'SYSTEM');
      return { audience, reports };
    },

    claimQuest: (id) => {
      const s = get();
      const q = s.quests.find((x) => x.id === id);
      if (!q || !questDone(q)) return false;
      const rw = q.reward;
      // build the item rewards first so a full bag blocks the claim instead of eating them
      const gifts: Item[] = [];
      if (rw.cores) gifts.push(...makeItemById('upgrade_core', rw.cores));
      if (rw.potions) gifts.push(...makeItemById('potion_hp', rw.potions), ...makeItemById('potion_mana', rw.potions));
      if (rw.item) { const it = get().rollItemDrop(rw.item); if (it) gifts.push(it); }
      let inv: Item[] | null = s.inventory;
      for (const g of gifts) { inv = inv ? insertItem(inv, s.maxInventorySlots, g) : null; }
      if (!inv) { notify('Bag is full! Make room to claim.', 'red', 'WARNING'); return false; }
      set({
        gold: s.gold + (rw.gold ?? 0),
        gems: s.gems + (rw.gems ?? 0),
        inventory: inv,
        quests: fillQuests(s.heroRank, s.quests.filter((x) => x.id !== id)),
      });
      notify('Quest reward claimed!', COLORS.uiAccent, 'SYSTEM');
      feedReward({ gold: rw.gold, gems: rw.gems, items: gifts });
      events.emit('hub', { kind: 'quest', n: 1 });
      return true;
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

    acceptQuest: (id) => {
      const s = get();
      const q = s.quests.find((x) => x.id === id);
      if (!q || q.accepted) return false;
      if (s.quests.filter((x) => x.accepted).length >= QUEST_MAX_ACTIVE) { notify(`You can only take ${QUEST_MAX_ACTIVE} quests at a time.`, 'red', 'WARNING'); return false; }
      set({ quests: fillQuests(s.heroRank, s.quests.map((x) => (x.id === id ? { ...x, accepted: true, progress: 0 } : x))) });
      notify('Quest accepted!', COLORS.uiAccent, 'SYSTEM');
      events.emit('hub', { kind: 'accept', n: 1 });
      return true;
    },

    abandonQuest: (id) => {
      const s = get();
      if (!s.quests.some((x) => x.id === id && x.accepted)) return;
      set({ quests: fillQuests(s.heroRank, s.quests.filter((x) => x.id !== id)) });
    },

    refreshQuestBoard: () => {
      const s = get();
      const q = fillQuests(s.heroRank, s.quests);
      if (q !== s.quests) set({ quests: q });
    },

    getManaCost: (skill) => {
      const s = get();
      if (skill === 'e' && s.hero !== 'BARBARIAN') return 0; // class dash is free (charges)
      const cost = skill === 'q' || skill === 'e' || skill === 's3' || skill === 's4' ? abilityMana(s.hero, skill, s.skillLevels[skill]) : skill === 'freezeSpell' ? Math.ceil((15 + s.skillLevels.freezeSpell * 2) * 0.5) : 0;   // passives cost half mana
      const total = s.hero === 'WIZARD' && cost > 0 ? Math.ceil(cost * 1.3) : cost;
      return s.stats.manaCostCut > 0 ? Math.ceil(total * (1 - Math.min(0.8, s.stats.manaCostCut))) : total;
    },

    // ----------------------------------------------------------- items --
    // ---- run modes: adventure (+ Ascension) / endless tower
    startMode: (mode: RunMode) => {
      runInfo.mode = mode;
      set({ difficulty: get().settings.hardMode ? 'HARD' : 'NORMAL' });   // Hard mode applies from the next run on
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
        const gotItems: Item[] = [];
        for (const it of r.items ?? []) for (const item of makeItemById(it.id, it.qty ?? 1)) {
          gotItems.push(item);
          if (!get().addItemToInventory(item)) { set({ warehouse: [...get().warehouse, item] }); }
        }
        notify(`Main quest complete: ${STORY[k].title}`, '#f1d58e', 'SYSTEM');
        feedReward({ gold: (r.gold ?? 0) * GOLD_SCALE, gems: r.gems, items: gotItems });   // the rewards in the loot feed
      }
      if (step !== s.story.step) {
        if (next) notify(`Main quest: ${next.title}`, '#f1d58e', 'SYSTEM');
        else notify('Main story complete!', '#f1d58e', 'SYSTEM');
      }
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
      set({ gems: s.gems - cost, tech, ...(id === 'bag' ? { maxInventorySlots: Math.max(s.maxInventorySlots, INVENTORY_LIMIT + 10 * (lv + 1)) } : {}) });
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
      const inv = insertItem(s.inventory, s.maxInventorySlots, item);
      if (!inv) return false;
      set({ inventory: inv });
      return true;
    },

    canPickUp: (item) => {
      const s = get();
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
      const req = RANK_REQ[item.rarity];
      if (s.heroRank < req) { notify(`Requires Lv ${req}!`, 'red', 'WARNING'); return; }
      if (item.type === 'WEAPON' && item.classType && item.classType !== s.hero) {
        notify(`Only for ${item.classType}!`, 'red', 'WARNING');
        return;
      }
      if (!isGear(item) && item.type !== 'PET') return;

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
          i.type === type && s.heroRank >= RANK_REQ[i.rarity] && (!i.classType || i.classType === s.hero));
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
      const r = items[0].rarity, up = nextTier(r), chance = FUSE_CHANCE[r] ?? 0;
      if (!up || chance <= 0 || items.some((i) => i.rarity !== r)) return null;
      const ok = Math.random() < chance;
      const pool = summonPool('GEM', s.hero).filter((i) => isGear(i) && i.rarity === (ok ? up : r));
      if (!pool.length) return null;
      const item = instantiate(pool[Math.floor(Math.random() * pool.length)]);
      set({ inventory: [...s.inventory.filter((i) => !ids.includes(i.id)), item] });   // (5 slots freed, 1 used)
      notify(ok ? `Fusion succeeded: ${item.name}!` : `Fusion failed... ${item.name} remains.`, ok ? '#ffd24a' : '#c8c0b0', 'SYSTEM');
      return { ok, item };
    },
    fuseShards: (r) => {
      const s = get();
      const up = nextTier(r), chance = FUSE_CHANCE[r] ?? 0;
      if (!up || chance <= 0 || (s.materials[r] ?? 0) < FUSE_COUNT) return null;
      const ok = Math.random() < chance;
      const got: Rarity = ok ? up : r;
      const materials = { ...s.materials, [r]: s.materials[r] - FUSE_COUNT };
      materials[got] = (materials[got] ?? 0) + 1;
      set({ materials, inventory: syncShardStacks(s.inventory, materials) });
      notify(ok ? `Fusion succeeded: 1 ${up.charAt(0) + up.slice(1).toLowerCase()} shard!` : 'Fusion failed... 1 shard remains.', ok ? '#ffd24a' : '#c8c0b0', 'SYSTEM');
      return { ok, item: shardItem(got, 1) };
    },
    buyItem: (item, quantity = 1) => {
      const s = get();
      const total = freeBuy(s, item) && quantity === 1 ? 0 : shopPrice(item) * quantity;
      if (s.gold < total) { notify('Not enough Gold!', 'red', 'WARNING'); return false; }
      const toAdd: Item = { ...item, stats: { ...item.stats }, id: uid('buy'), quantity };
      if (!isStackable(item) && quantity > 1) {
        // Non-stackables occupy one slot each.
        let inv: Item[] | null = s.inventory;
        for (let i = 0; i < quantity && inv; i++) inv = insertItem(inv, s.maxInventorySlots, { ...toAdd, id: uid('buy'), quantity: 1 });
        if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
        set({ gold: s.gold - total, inventory: inv });
      } else {
        const inv = insertItem(s.inventory, s.maxInventorySlots, toAdd);
        if (!inv) { notify('Inventory Full!', 'red', 'WARNING'); return false; }
        set({ gold: s.gold - total, inventory: inv });
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
      const qty = cur.quantity || 1;
      const sellQty = Math.min(qty, amount);
      const value = (cur.type === 'LOOT' || cur.type === 'SHARD' ? cur.price : Math.floor(cur.price * 0.3)) * sellQty;
      if (sellQty >= qty) inv.splice(idx, 1);
      else inv[idx] = { ...cur, quantity: qty - sellQty };
      set({ gold: s.gold + value, inventory: inv });
      if (cur.type === 'LOOT') get().addQuestProgress('SELL_LOOT', sellQty);
      notify(`Sold ${sellQty}x ${cur.name} for ${value}G`, 'yellow', 'SYSTEM');
    },

    sellAllLoot: () => {
      const s = get();
      const loot = s.inventory.filter((i) => i.type === 'LOOT');
      if (loot.length === 0) { notify('No loot to sell.', 'white', 'SYSTEM'); return 0; }
      let total = 0, count = 0;
      loot.forEach((i) => { const q = i.quantity || 1; total += i.price * q; count += q; });
      set({ gold: s.gold + total, inventory: s.inventory.filter((i) => i.type !== 'LOOT') });
      get().addQuestProgress('SELL_LOOT', count);
      notify(`Sold ${count} loot items for ${total}G`, 'yellow', 'SYSTEM');
      return total;
    },

    sellItems: (items) => {
      const s = get();
      const ids = new Set(items.map((i) => i.id));
      let total = 0;
      items.forEach((i) => { total += Math.floor(i.price * 0.3); });
      set({ gold: s.gold + total, inventory: s.inventory.filter((i) => !ids.has(i.id)) });
      notify(`Sold ${items.length} items for ${total}G`, 'yellow', 'SYSTEM');
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
        materials: { ...s.materials, [item.rarity]: s.materials[item.rarity] + y.shards },
      });
      notify(`Recycled for ${y.shards} ${item.rarity} Shard(s)${y.cores ? ` + ${y.cores} Core(s)` : ''}`, COLORS.uiAccent, 'SYSTEM');
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

    combineMaterials: (from) => {
      const s = get();
      const idx = RARITIES.indexOf(from);
      if (idx === -1 || idx === RARITIES.length - 1) return;
      const to = RARITIES[idx + 1];
      if (s.materials[from] < MATERIAL_COMBINE_COST) {
        notify(`Need ${MATERIAL_COMBINE_COST} ${from} Shards`, 'red', 'WARNING');
        return;
      }
      set({ materials: { ...s.materials, [from]: s.materials[from] - MATERIAL_COMBINE_COST, [to]: s.materials[to] + 1 } });
      notify(`Crafted 1 ${to} Shard`, COLORS.uiAccent, 'SYSTEM');
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

    buyInventorySlots: () => {
      const s = get();
      const cost = s.maxInventorySlots * 1000;
      if (s.gold < cost) return false;
      set({ gold: s.gold - cost, maxInventorySlots: s.maxInventorySlots + 5 });
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
      const coreIndex = s.inventory.findIndex((i) => i.type === 'CORE');
      const core = coreIndex >= 0 ? s.inventory[coreIndex] : null;
      const requiredCores = free ? 0 : Math.ceil(item.level / 2);
      const goldCost = free ? 0 : Math.floor(item.price * item.level * 0.5);
      if (s.gold < goldCost) return fail('Not enough Gold!');
      if (requiredCores > 0 && (!core || (core.quantity || 1) < requiredCores)) return fail(`Need ${requiredCores} Cores`);

      const chance = free ? 100 : item.level >= 3 ? Math.max(10, 100 - (item.level - 2) * 10) : 100;
      const success = Math.random() * 100 < chance;

      const inv = s.inventory.slice();
      if (core && requiredCores > 0) {
        const coreQty = core.quantity || 1;
        if (coreQty > requiredCores) inv[coreIndex] = { ...core, quantity: coreQty - requiredCores };
        else inv.splice(coreIndex, 1);
      }

      if (!success) {
        set({ gold: s.gold - goldCost, inventory: inv, actionResult: { type: 'UPGRADE', success: false, message: 'Upgrade Failed...' } });
        return { success: false, msg: 'Upgrade Failed...', newItem: item };
      }

      const upgraded = (i: Item): Item => {
        const stats: Partial<PlayerStats> = { ...i.stats };
        const lvl = Math.max(1, i.level);
        for (const k of mutableStatKeys(stats)) {
          const v = stats[k];
          if (v === undefined) continue;
          stats[k] = parseFloat(((v / lvl) * (lvl + 1)).toFixed(2));
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
      const notPet = ITEMS_POOL.filter((i) => i.type !== 'PET');
      const usable = (i: Item) => !i.classType || i.classType === hero;
      let pool: Item[];
      // Set pieces: elites / bosses / chests (rarity override) and a small chance on plain drops.
      const setRarity: Rarity | null = rarityOverride ?? (Math.random() < 0.05 ? 'RARE' : null);
      const setChance: Record<Rarity, number> = { COMMON: 0, RARE: 0.2, EPIC: 0.28, LEGENDARY: 0.35, MYTHIC: 0.5 };
      if (setRarity && Math.random() < setChance[setRarity] * (rarityOverride ? 1 : 0.5)) {
        const sets = notPet.filter((i) => i.setName && i.rarity === setRarity && usable(i)
          && (SET_BY_NAME[i.setName!]?.hero ? SET_BY_NAME[i.setName!].hero === hero : true));
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
        if (r > 0.90) pool = notPet.filter((i) => i.type === 'POTION');
        else if (r > 0.82) pool = notPet.filter((i) => i.type === 'CORE'); // cores are rare (8% of item drops)
        else pool = notPet.filter((i) => isGear(i) && !i.setName && usable(i) && (i.rarity === 'COMMON' || i.rarity === 'RARE'));
      }
      if (pool.length === 0) return null;

      // Class weapons are somewhat more likely than other gear.
      const weighted: Item[] = [];
      for (const p of pool) {
        weighted.push(p, p);
        if (p.type === 'WEAPON' && p.classType === hero) weighted.push(p);
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
      if (allocBlock(node, ranks, free)) return false;
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
      const SUMMON_SHARD_SHARE = 0.5;   // shards vs equipment: 50 / 50
      const s = get();
      const space = s.maxInventorySlots - s.inventory.length;
      const n = Math.min(count, space);
      if (n <= 0) { notify('Inventory Full!', 'red', 'WARNING'); return []; }
      const gem = altar === 'GEM';
      const cost = gem && n === 1 && questFree(s, 'summon') ? 0   // the tutorial's first summon is on the house
        : gem ? (n === 10 ? SUMMON_COST_10 : n * SUMMON_COST_1) : (n === 10 ? SHARD_COST_10 : n * SHARD_COST_1);
      if (gem && s.gems < cost) { notify('Not enough Gems!', 'red', 'WARNING'); return []; }
      if (!gem && s.materials.COMMON < cost) { notify('Not enough Common Shards!', 'red', 'WARNING'); return []; }
      const W = gem ? GEM_SUMMON_WEIGHTS : SUMMON_WEIGHTS, CAPS = gem ? GEM_SUMMON_CAPS : SUMMON_CAPS;

      const all = summonPool(altar, s.hero);   // the Shard Altar offers fewer top-tier pieces (summonPool.ts)
      const results: Item[] = [], gearOut: Item[] = [];
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
        // half the pulls are a single shard of the rolled tier (Rare at least), half are gear (Epic at least); pity pulls are gear
        const pity = drawn % PITY_LEGEND === 0 || drawn % PITY_MYTHIC === 0;
        if (!pity && Math.random() < SUMMON_SHARD_SHARE) {
          const sr: Rarity = rarity === 'COMMON' ? 'RARE' : rarity;
          shardGain[sr] = (shardGain[sr] ?? 0) + 1;
          results.push(shardItem(sr, 1));
          continue;
        }
        if (rarity === 'COMMON' || rarity === 'RARE') rarity = 'EPIC';
        let pool = all.filter((i) => i.rarity === rarity);
        if (pool.length === 0) pool = all;
        const it = instantiate(pool[Math.floor(Math.random() * pool.length)]);
        results.push(it); gearOut.push(it);
      }
      const summonPity = { ...s.summonPity, [altar]: drawn };
      const materials = { ...s.materials };
      for (const r of Object.keys(shardGain) as Rarity[]) materials[r] = (materials[r] ?? 0) + shardGain[r]!;
      if (!gem) materials.COMMON -= cost;
      if (gem) set({ gems: s.gems - cost, inventory: [...s.inventory, ...gearOut], summonPity, materials });
      else set({ materials, inventory: [...s.inventory, ...gearOut], summonPity });
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

// ---- profile persistence: debounced write on any persisted field change, flushed when the page hides.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const flushProfile = (): void => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  writeProfile(useGameStore.getState());
};
useGameStore.subscribe((s, prev) => {
  if (s.gold === prev.gold && s.gems === prev.gems && s.inventory === prev.inventory && s.equipment === prev.equipment
    && s.materials === prev.materials && s.maxInventorySlots === prev.maxInventorySlots && s.warehouse === prev.warehouse && s.warehouseGold === prev.warehouseGold && s.progress === prev.progress && s.tech === prev.tech && s.summonPity === prev.summonPity && s.story === prev.story && s.classProg === prev.classProg && s.npcQuests === prev.npcQuests && s.heroRank === prev.heroRank
    && s.rankXp === prev.rankXp && s.quests === prev.quests && s.gameStats === prev.gameStats && s.settings === prev.settings
    && s.hero === prev.hero && s.difficulty === prev.difficulty && s.talents === prev.talents && s.attrs === prev.attrs && s.starterGiven === prev.starterGiven && s.discovered === prev.discovered && s.codexClaimed === prev.codexClaimed && s.meta === prev.meta && s.welcomeGiftClaimed === prev.welcomeGiftClaimed) return;
  if (!saveTimer) saveTimer = setTimeout(flushProfile, 400);
});
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushProfile);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushProfile(); });
}
if (loaded.gift) {
  flushProfile(); // fresh profile (gift included) is written immediately: a reload can never grant it twice
  useGameStore.getState().addNotification('Welcome gift: 10,000 gold, 1,000 gems, potions, an Ankh and 5 Upgrade Cores!', COLORS.uiAccent, 'SYSTEM');
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

// ---- quest tracking from engine events (runs and village harvesting)
{
  const q = (type: QuestType, n = 1, kind?: EnemyKind) => useGameStore.getState().addQuestProgress(type, n, kind);
  events.on('enemyDeath', (e) => {
    if (e.poof) return; // wave-end despawn, not a kill
    q('KILL_TOTAL'); q('KILL_KIND', 1, e.kind);
    if (e.boss) q('KILL_BOSS');
  });
  events.on('crateBreak', () => q('BREAK_CRATES'));
  events.on('waveStart', (e) => q('REACH_WAVE', e.wave));
  events.on('waveClear', (e) => { if (e.fast) q('FAST_CLEARS'); });
  events.on('dash', () => q('DASH'));
  // blink dashes (Wizard Blink, Necromancer Soul Step) count as dashes too (pet blinks do not)
  events.on('blink', () => { const h = useGameStore.getState().hero; if ((h === 'WIZARD' || h === 'NECROMANCER') && useGameStore.getState().status === GameStatus.PLAYING) q('DASH'); });
  events.on('pickup', (e) => {
    if (e.kind === 'GOLD') q('COLLECT_GOLD', e.value * GOLD_SCALE);
    else if (e.kind === 'SHARD') q('GATHER_SHARDS');
    else if (e.kind === 'ITEM' && e.name) useGameStore.getState().addQuestProgress('COLLECT_LOOT', 1, undefined, e.name);
  });
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

// ---- active skills auto-learn when the class reaches their unlock level (classLevels.autoLearnActives)
const autoLearn = (): void => {
  const st = useGameStore.getState(), cp = st.classProg[st.hero];
  if (!cp) return;
  const perm = autoLearnActives(st.hero, cp.lv, cp.skills);
  const run = autoLearnActives(st.hero, cp.lv, st.skillLevels);
  if (!perm && !run) return;
  const learned = ACTIVE_ORDER[st.hero].filter((k) => (perm ?? cp.skills)[k] > 0 && !(cp.skills[k] > 0));
  useGameStore.setState({ classProg: perm ? { ...st.classProg, [st.hero]: { ...cp, skills: perm } } : st.classProg, ...(run ? { skillLevels: run } : {}) });
  for (const k of learned) st.addNotification(`New skill learned: ${activeDefs(st.hero).find((a) => a.slot === k)?.name ?? k}`, '#f1d58e', 'SYSTEM');
};
autoLearn();
useGameStore.subscribe((s, p) => { if (s.hero !== p.hero || s.classProg !== p.classProg || s.skillLevels !== p.skillLevels) autoLearn(); });
