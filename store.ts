// ============================================================================
// Zustand store — META / RPG state only (inventory, stats, panels, progression).
// Anything that changes every frame lives in engine/world.ts. See storeTypes.ts.
// ============================================================================
import { create } from 'zustand';
import {
  GameStatus, PlayerStats, Upgrade, Item, SkillLevels, Rarity, HeroClass, ItemType,
  AbilityType, GameStatistics, UpgradeType, GameNotification,
} from './types';
import {
  ITEMS_POOL, HERO_STATS, PETS_POOL, COLORS, INVENTORY_LIMIT, UPGRADES_POOL, POTION_STACK_LIMIT,
  RECYCLE_YIELDS, CRAFTING_COSTS, MATERIAL_COMBINE_COST,
} from './constants';
import type { Difficulty, Equipment, EquipSlot, GameState, Settings, ShopTab } from './storeTypes';
import { startRun, stopRun } from './engine/game';
import { world } from './engine/world';
import { events } from './engine/events';

// ------------------------------------------------------------------ consts --
const STORAGE_KEY = 'aether-survivor-v2';
const MAX_SKILL_LEVEL = 5;
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const MAX_ITEM_NOTIFICATIONS = 6;
const MAX_NOTIFICATIONS = 12;

const INITIAL_STATS: PlayerStats = {
  maxHealth: 100, maxMana: 100, regen: 0.5, manaRegen: 0.5, moveSpeed: 10, damage: 15,
  fireRate: 2.0, projectileSpeed: 20, multishot: 1, spread: 0.2, dashCooldown: 4.0,
  cooldownReduction: 0, magnetRadius: 5.0, critRate: 0.05, critDamage: 1.5, defense: 0,
  skillDamage: 1.0, knockback: 0.5, dodge: 0,
};

const INITIAL_SKILLS: SkillLevels = {
  orbital: 0, thunder: 0, regen: 0, magnet: 1, dash: 1, weapon: 1, barrier: 1, storm: 0, special: 0,
  piercing: 0, burning: 0, freezing: 0, freezeSpell: 0, gravity: 0, stamp: 0, rage: 0,
};

const INITIAL_GAME_STATS: GameStatistics = {
  totalRuns: 0, highestWave: 0, highestCP: 0, bestRunClass: null,
  classRuns: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0 },
  classHighestWave: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0 },
};

const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7, sfxVolume: 0.8, musicVolume: 0.5, quality: 'HIGH',
  showDamageNumbers: true, screenShake: true, autoPotions: true,
};

const EMPTY_EQUIPMENT: Equipment = { weapon: null, armor: null, accessory: null, pet: null };
const emptyMaterials = (): Record<Rarity, number> => ({ COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 });

export const RARITY_LEVEL_REQ: Record<Rarity, number> = {
  COMMON: 1, RARE: 10, EPIC: 20, LEGENDARY: 30, MYTHIC: 40,
};

export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: COLORS.rarityCommon, RARE: COLORS.rarityRare, EPIC: COLORS.rarityEpic,
  LEGENDARY: COLORS.rarityLegendary, MYTHIC: COLORS.rarityMythic,
};

const SUMMON_WEIGHTS: Record<Rarity, number> = { COMMON: 60, RARE: 28, EPIC: 9, LEGENDARY: 2.5, MYTHIC: 0.5 };

const WEAPON_Q: Record<HeroClass, AbilityType> = {
  ARCHER: 'PIERCING_SHOT', WIZARD: 'GRAVITY_SPELL', BARBARIAN: 'RAGE',
};

const UPGRADE_SKILL_KEY: Partial<Record<UpgradeType, keyof SkillLevels>> = {
  SKILL_ORBITAL: 'orbital', SKILL_THUNDER: 'thunder', SKILL_REGEN: 'regen', SKILL_MAGNET: 'magnet',
  SKILL_DASH: 'dash', SKILL_WEAPON: 'weapon', SKILL_BARRIER: 'barrier', SKILL_STORM: 'storm',
  SKILL_PIERCING: 'piercing', SKILL_BURNING: 'burning', SKILL_FREEZING: 'freezing',
  SKILL_GRAVITY: 'gravity', SKILL_FREEZE_SPELL: 'freezeSpell', SKILL_RAGE: 'rage', SKILL_STAMP: 'stamp',
};

// ------------------------------------------------------------------ helpers --
let uidCounter = 0;
const uid = (prefix = 'id'): string => `${prefix}_${Date.now().toString(36)}_${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const isStackable = (item: Item): boolean => item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE';
const isGear = (item: Item): boolean => item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY';

/** Combat power of one item (UI comparison / auto-equip). */
export const calculateItemCP = (item: Item): number => {
  if (item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE') return 0;
  if (!item.stats) return 0;
  const s = item.stats;
  let cp = 0;
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
  return Math.floor(cp * mult[item.rarity]);
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
  return Math.floor(cp);
};

const MULTIPLICATIVE_SET_STATS: ReadonlySet<keyof PlayerStats> = new Set<keyof PlayerStats>(['damage', 'moveSpeed', 'fireRate']);

/** baseStats + equipment (+ set bonuses). Temporary buffs (rage / sprint) are applied by the engine. */
const calculateStats = (base: PlayerStats, equipment: Equipment): PlayerStats => {
  const final: PlayerStats = { ...base };
  const sets: Record<string, number> = {};

  (Object.values(equipment) as (Item | null)[]).forEach((item) => {
    if (!item || !item.stats) return;
    (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
      let v = item.stats[k];
      if (v === undefined || v === null) return;
      if (item.type === 'WEAPON' && k === 'damage') v *= 0.5;
      if (item.type === 'ARMOR' && k === 'defense') v *= 0.5;
      if (k === 'cooldownReduction') final[k] = Math.min(0.75, final[k] + v);
      else final[k] += v;
    });
    if (item.setName) sets[item.setName] = (sets[item.setName] || 0) + 1;
  });

  Object.keys(sets).forEach((setName) => {
    if (sets[setName] < 3) return;
    const setItem = (Object.values(equipment) as (Item | null)[]).find((i) => i?.setName === setName);
    const bonus = setItem?.setBonusStats;
    if (!bonus) return;
    (Object.keys(bonus) as (keyof PlayerStats)[]).forEach((stat) => {
      const val = bonus[stat];
      if (val === undefined || val === null) return;
      if (MULTIPLICATIVE_SET_STATS.has(stat)) final[stat] *= 1 + val;
      else final[stat] += val;
    });
  });

  if (equipment.weapon && equipment.weapon.projectileType === 'MAGIC') final.fireRate *= 0.5;
  if (final.multishot > 7) final.multishot = 7;
  return final;
};

/** Stats incl. temporary buffs from the engine (rage / sprint). Allocates; do not call per frame. */
export const getEffectiveStats = (): PlayerStats => {
  const s = useGameStore.getState().stats;
  const p = world.player;
  const out = { ...s };
  if (p.rageT > 0) out.fireRate *= 2;
  if (p.hawkT > 0) { out.fireRate *= 1.6; out.damage *= 1.4; }
  if (p.sprintT > 0) out.moveSpeed *= 2;
  return out;
};

/** Class proc skills start unlocked at level 1 each run. */
const PROC_START: Record<HeroClass, Partial<SkillLevels>> = {
  ARCHER: { burning: 1, freezing: 1 }, WIZARD: { thunder: 1 }, BARBARIAN: { stamp: 1 },
};

const getSkillCardDetails = (key: keyof SkillLevels, level: number, stats: PlayerStats): string => {
  const f = (n: number) => Number(n.toFixed(1));
  const dmg = stats.damage;
  const nextLvl = level + 1;

  if (key === 'orbital') {
    const count = 2 + level, nextCount = 2 + nextLvl;
    const d = f(dmg * 1.5 * (1 + level * 0.1));
    const nextD = f(dmg * 1.5 * (1 + nextLvl * 0.1));
    if (level === 0) return `Unlock: Summons 2 blades dealing ${f(dmg * 1.5)} dmg/hit.`;
    return `Blades: ${count} -> ${nextCount}. Dmg: ${d} -> ${nextD}.`;
  }
  if (key === 'thunder' || key === 'burning' || key === 'freezing' || key === 'stamp') {
    const n = (l: number) => Math.max(2, 11 - l);
    const every = level === 0 ? `Unlock: every ${n(1)}th attack` : `Every ${n(level)}th attack -> every ${n(nextLvl)}th`;
    if (key === 'thunder') return `${every}: chain lightning hits ${2 + (level || 1)}${level ? ` -> ${2 + nextLvl}` : ''} enemies. Dmg: ${f(dmg * 0.9 * stats.skillDamage * (1 + 0.15 * Math.max(0, level - 1)))}${level ? ` -> ${f(dmg * 0.9 * stats.skillDamage * (1 + 0.15 * level))}` : ''}.`;
    if (key === 'stamp') return `${every}: Mega Stomp shockwave. Radius ${12 + (level || 1)}${level ? ` -> ${12 + nextLvl}` : ''}.`;
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
  if (key === 'dash') {
    const charges = level >= 5 ? 2 : 1, ncharges = nextLvl >= 5 ? 2 : 1;
    if (level === 0) return 'Unlock: Reduces Dash cooldown.';
    if (ncharges > charges) return `LEVEL ${nextLvl} UNLOCK: MAX CHARGES +1 (Total 2)!`;
    return 'Cooldown further reduced.';
  }
  if (level === 0) return 'Unlocks this skill.';
  return 'Improves skill stats & mana cost.';
};

const generateUpgradeOptions = (hero: HeroClass, skillLevels: SkillLevels, stats: PlayerStats): Upgrade[] => {
  const pool = UPGRADES_POOL.filter((u) => {
    if (u.classType && u.classType !== hero) return false;
    const key = UPGRADE_SKILL_KEY[u.type];
    if (key && skillLevels[key] >= MAX_SKILL_LEVEL) return false;
    return true;
  });
  const options: Upgrade[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const base = pool.splice(idx, 1)[0];
    const opt: Upgrade = { ...base, id: uid('card') };
    const key = UPGRADE_SKILL_KEY[base.type];
    if (key) {
      const lvl = skillLevels[key];
      if (lvl === 0) opt.name = `UNLOCK: ${opt.name}`;
      opt.description = getSkillCardDetails(key, lvl, stats);
    }
    options.push(opt);
  }
  return options;
};

/** Gear scaling for "+N" items (also used by drops). */
const applyPlus = (item: Item, plus: number): void => {
  if (plus <= 0) return;
  item.level += plus;
  (Object.keys(item.stats) as (keyof PlayerStats)[]).forEach((k) => {
    const v = item.stats[k];
    if (v === undefined) return;
    item.stats[k] = parseFloat((v * item.level).toFixed(2));
  });
};

const instantiate = (template: Item): Item => ({
  ...template,
  id: uid('it'),
  stats: { ...template.stats },
  onHitEffect: template.onHitEffect ? { ...template.onHitEffect } : undefined,
  quantity: 1,
});

const mutableStatKeys = (stats: Partial<PlayerStats>): (keyof PlayerStats)[] => Object.keys(stats) as (keyof PlayerStats)[];

// -------------------------------------------------------------- persistence --
interface Persisted { gameStats: GameStatistics; settings: Settings }

const loadPersisted = (): Persisted => {
  const fallback: Persisted = {
    gameStats: { ...INITIAL_GAME_STATS, classRuns: { ...INITIAL_GAME_STATS.classRuns }, classHighestWave: { ...INITIAL_GAME_STATS.classHighestWave } },
    settings: { ...DEFAULT_SETTINGS },
  };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const gs = parsed.gameStats;
    return {
      gameStats: gs ? {
        ...fallback.gameStats, ...gs,
        classRuns: { ...fallback.gameStats.classRuns, ...gs.classRuns },
        classHighestWave: { ...fallback.gameStats.classHighestWave, ...gs.classHighestWave },
      } : fallback.gameStats,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return fallback;
  }
};

const savePersisted = (p: Persisted): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode, quota) — ignore */
  }
};

const persisted = loadPersisted();

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
        if (q >= POTION_STACK_LIMIT) continue;
        const add = Math.min(remaining, POTION_STACK_LIMIT - q);
        inv[i] = { ...s, quantity: q + add };
        remaining -= add;
      }
      while (remaining > 0) {
        if (inv.length >= maxSlots) return null;
        const q = Math.min(remaining, POTION_STACK_LIMIT);
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

  /** After panels change: pause if a panel is open during play, resume if all closed and nothing else pauses. */
  const syncPause = (panelsOpen: boolean): Partial<GameState> => {
    const s = get();
    if (panelsOpen && s.status === GameStatus.PLAYING) return { status: GameStatus.PAUSED };
    if (!panelsOpen && s.status === GameStatus.PAUSED && !s.isPauseMenuOpen) return { status: GameStatus.PLAYING };
    return {};
  };

  const canOpenPanels = () => {
    const st = get().status;
    return st !== GameStatus.LEVEL_UP && st !== GameStatus.GAME_OVER;
  };

  const initialState = () => ({
    status: GameStatus.MENU,
    wave: 1,
    gold: 10000,
    gems: 10000,
    level: 1,
    experience: 0,
    experienceToNextLevel: 250,
    skillPoints: 30,
    accumulatedWaveGold: 0,
    baseStats: { ...INITIAL_STATS },
    stats: { ...INITIAL_STATS },
    skillLevels: { ...INITIAL_SKILLS },
    activeAbilityQ: null as AbilityType | null,
    inventory: [] as Item[],
    maxInventorySlots: INVENTORY_LIMIT,
    materials: emptyMaterials(),
    equipment: { ...EMPTY_EQUIPMENT },
    upgradeOptions: [] as Upgrade[],
    isInventoryOpen: false,
    isShopOpen: false,
    isCharacterSheetOpen: false,
    isPauseMenuOpen: false,
    notifications: [] as GameNotification[],
    actionResult: null,
  });

  return {
    ...initialState(),
    hero: 'ARCHER',
    difficulty: 'NORMAL',
    activeShopTab: 'SUPPLIES',
    gameStats: persisted.gameStats,
    settings: persisted.settings,
    lastRun: null,

    // ------------------------------------------------------------ flow --
    setStatus: (status) => set({ status }),
    selectHero: (hero) => set({ hero }),
    setDifficulty: (difficulty: Difficulty) => set({ difficulty }),

    startGame: () => {
      const state = get();
      const heroInfo = HERO_STATS[state.hero];
      const startStats: PlayerStats = { ...INITIAL_STATS, ...heroInfo.stats };

      let inventory = state.inventory.slice();
      const equipment: Equipment = { ...state.equipment };
      let materials = state.materials;

      // Class-locked weapon: swap a foreign weapon for the class starter.
      if (equipment.weapon && equipment.weapon.classType && equipment.weapon.classType !== state.hero) {
        inventory.push(equipment.weapon);
        equipment.weapon = null;
      }
      if (!equipment.pet) {
        const tpl = PETS_POOL.find((i) => i.id === 'pet_blob');
        if (tpl) equipment.pet = { ...instantiate(tpl), id: uid('start_pet') };
      }
      if (!equipment.weapon) {
        const tpl = ITEMS_POOL.find((i) => i.id === heroInfo.weaponId);
        if (tpl) equipment.weapon = { ...instantiate(tpl), id: uid('start_wep') };
      }

      // Fresh profile: starter supplies.
      if (inventory.length === 0) {
        const mk = (id: string, quantity: number): Item[] => {
          const tpl = ITEMS_POOL.find((i) => i.id === id);
          return tpl ? [{ ...tpl, stats: { ...tpl.stats }, id: uid('start'), quantity }] : [];
        };
        inventory = [...mk('potion_hp', 10), ...mk('potion_mana', 10), ...mk('revive_ankh', 1), ...mk('upgrade_core', 30)];
        materials = { COMMON: 50, RARE: 20, EPIC: 5, LEGENDARY: 0, MYTHIC: 0 };
      }

      set({
        status: GameStatus.PLAYING,
        level: 1,
        experience: 0,
        experienceToNextLevel: 250,
        skillPoints: 30,
        baseStats: startStats,
        stats: calculateStats(startStats, equipment),
        skillLevels: { ...INITIAL_SKILLS, ...PROC_START[state.hero] },
        activeAbilityQ: WEAPON_Q[state.hero],
        inventory,
        equipment,
        materials,
        upgradeOptions: [],
        wave: 1,
        accumulatedWaveGold: 0,
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
        notifications: [],
        actionResult: null,
        maxInventorySlots: Math.max(state.maxInventorySlots, INVENTORY_LIMIT),
      });
      startRun();
    },

    resetGame: () => {
      stopRun();
      set({ ...initialState(), status: GameStatus.MENU });
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

    addExperience: (amount) => {
      let { experience, experienceToNextLevel, level } = get();
      const gain = (level >= 10 ? amount * 2 : amount) * 2;
      experience += gain;
      const startLevel = level;
      let base = get().baseStats;
      let sp = get().skillPoints;

      while (experience >= experienceToNextLevel) {
        experience -= experienceToNextLevel;
        experienceToNextLevel = Math.floor(experienceToNextLevel * (level < 10 ? 1.35 : 1.10));
        level += 1;
        sp += 1;
        base = {
          ...base,
          maxHealth: base.maxHealth + 5,
          maxMana: base.maxMana + 5,
          damage: base.damage + 1,
          defense: base.defense + 0.5,
        };
        // Class scaling per hero level (shown on the character sheet).
        const hero = get().hero;
        if (hero === 'ARCHER') base.fireRate *= 1.03;
        else if (hero === 'WIZARD') { base.skillDamage *= 1.03; base.manaRegen *= 1.02; }
        else if (hero === 'BARBARIAN') { base.maxHealth *= 1.03; base.damage *= 1.015; }
      }

      if (level === startLevel) {
        set({ experience });
        return;
      }

      const stats = calculateStats(base, get().equipment);
      set({ experience, experienceToNextLevel, level, skillPoints: sp, baseStats: base, stats });
      // Engine: full heal + fx.
      world.player.hp = stats.maxHealth;
      world.player.mana = stats.maxMana;
      world.player.levelUpFx = 1;
      events.emit('levelUp', { pos: world.player.pos, level });
    },

    setWave: (wave) => set({ wave }),

    openWaveReward: () => {
      const s = get();
      set({
        upgradeOptions: generateUpgradeOptions(s.hero, s.skillLevels, s.stats),
        accumulatedWaveGold: s.accumulatedWaveGold + 100,
        status: GameStatus.LEVEL_UP,
      });
    },

    selectUpgrade: (upgrade) => {
      const state = get();
      const base: PlayerStats = { ...state.baseStats };
      const levels: SkillLevels = { ...state.skillLevels };
      const key = UPGRADE_SKILL_KEY[upgrade.type];

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
          case 'DASH_COOLDOWN': base.dashCooldown = Math.max(0.5, base.dashCooldown - 0.5); break;
          default: break;
        }
      }
      set({
        baseStats: base,
        skillLevels: levels,
        stats: calculateStats(base, state.equipment),
        upgradeOptions: [],
        status: GameStatus.PLAYING,
      });
    },

    upgradeSkill: (skill) => {
      const s = get();
      const lvl = s.skillLevels[skill];
      if (lvl >= MAX_SKILL_LEVEL) return;
      let cost = lvl + 1;
      if (skill === 'special') cost = 5;
      if (skill === 'dash' || skill === 'barrier') cost = lvl + 2;
      if (s.skillPoints < cost) return;
      set({ skillLevels: { ...s.skillLevels, [skill]: lvl + 1 }, skillPoints: s.skillPoints - cost });
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
      set({
        status: GameStatus.GAME_OVER,
        gold: s.gold + s.accumulatedWaveGold,
        gameStats,
        lastRun: {
          ...summary, hero: s.hero, difficulty: s.difficulty, cp, level: s.level,
          waveGoldBonus: s.accumulatedWaveGold,
        },
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isPauseMenuOpen: false,
      });
    },

    getManaCost: (skill) => {
      const s = get();
      const lv = s.skillLevels;
      let cost = 0;
      switch (skill) {
        case 'r': cost = 60; break;
        case 'q': {
          let level = 0;
          if (s.activeAbilityQ === 'PIERCING_SHOT') level = lv.piercing;
          else if (s.activeAbilityQ === 'GRAVITY_SPELL') level = lv.gravity;
          else if (s.activeAbilityQ === 'RAGE') level = lv.rage;
          cost = s.activeAbilityQ === 'PIERCING_SHOT' ? 15 + level * 3 : 30 + level * 5;
          break;
        }
        case 'e': cost = 20 + lv.special * 5; break;
        case 'dash': cost = 0; break;
        case 'freezeSpell': cost = 15 + lv.freezeSpell * 2; break;
        default: cost = 0;
      }
      return s.hero === 'WIZARD' && cost > 0 ? Math.ceil(cost * 1.3) : cost;
    },

    // ----------------------------------------------------------- items --
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
      return s.inventory.some((i) => i.name === item.name && i.type === item.type && (i.quantity || 1) < POTION_STACK_LIMIT);
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
      const req = RARITY_LEVEL_REQ[item.rarity];
      if (s.level < req) { notify(`Requires Level ${req}!`, 'red', 'WARNING'); return; }
      if (item.type === 'WEAPON' && item.classType && item.classType !== s.hero) {
        notify(`Only for ${item.classType}!`, 'red', 'WARNING');
        return;
      }
      if (item.type !== 'WEAPON' && item.type !== 'ARMOR' && item.type !== 'ACCESSORY' && item.type !== 'PET') return;

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
        stats: calculateStats(s.baseStats, equipment),
        activeAbilityQ: q ?? s.activeAbilityQ,
      });
      notify(`Equipped ${item.name}`, COLORS.rarityCommon, 'SYSTEM');
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
        stats: calculateStats(s.baseStats, equipment),
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
          i.type === type && s.level >= RARITY_LEVEL_REQ[i.rarity] && (!i.classType || i.classType === s.hero));
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
      tryEquip('armor', 'ARMOR');
      tryEquip('accessory', 'ACCESSORY');
      tryEquip('pet', 'PET');

      if (changed) {
        const q = equipment.weapon ? classOf(equipment.weapon) : null;
        set({ inventory, equipment, stats: calculateStats(s.baseStats, equipment), activeAbilityQ: q ?? s.activeAbilityQ });
        notify('Auto Equipped Best Items', COLORS.uiAccent, 'SYSTEM');
      } else {
        notify('No better items found', 'white', 'SYSTEM');
      }
    },

    buyItem: (item, quantity = 1) => {
      const s = get();
      const total = item.price * quantity;
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
      const value = Math.floor(cur.price * 0.3) * sellQty;
      if (sellQty >= qty) inv.splice(idx, 1);
      else inv[idx] = { ...cur, quantity: qty - sellQty };
      set({ gold: s.gold + value, inventory: inv });
      notify(`Sold ${sellQty}x ${cur.name} for ${value}G`, 'yellow', 'SYSTEM');
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
      const yieldAmt = RECYCLE_YIELDS[item.rarity];
      set({
        inventory: s.inventory.filter((i) => i.id !== item.id),
        materials: { ...s.materials, [item.rarity]: s.materials[item.rarity] + yieldAmt },
      });
      notify(`Recycled for ${yieldAmt} ${item.rarity} Shard(s)`, COLORS.uiAccent, 'SYSTEM');
    },

    massRecycle: (rarity) => {
      const s = get();
      const list = s.inventory.filter((i) => i.rarity === rarity && isGear(i));
      if (list.length === 0) { notify(`No ${rarity} items to recycle`, 'white', 'SYSTEM'); return; }
      let total = 0;
      list.forEach((i) => { total += RECYCLE_YIELDS[i.rarity]; });
      const ids = new Set(list.map((i) => i.id));
      set({
        inventory: s.inventory.filter((i) => !ids.has(i.id)),
        materials: { ...s.materials, [rarity]: s.materials[rarity] + total },
      });
      notify(`Recycled ${list.length} items for ${total} ${rarity} Shards`, COLORS.uiAccent, 'SYSTEM');
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

    craftItem: (rarity) => {
      const s = get();
      const cost = CRAFTING_COSTS[rarity];
      if (s.materials[rarity] < cost) { notify(`Need ${cost} ${rarity} Shards`, 'red', 'WARNING'); return false; }
      if (s.inventory.length >= s.maxInventorySlots) { notify('Inventory Full!', 'red', 'WARNING'); return false; }

      let pool = ITEMS_POOL.filter((i) => isGear(i) && i.rarity === rarity && (!i.classType || i.classType === s.hero));
      if (pool.length === 0) pool = ITEMS_POOL.filter(isGear);
      const item = instantiate(pool[Math.floor(Math.random() * pool.length)]);
      if (Math.random() > 0.8) applyPlus(item, 1);

      set({
        materials: { ...s.materials, [rarity]: s.materials[rarity] - cost },
        inventory: [...s.inventory, item],
      });
      notify(`Crafted ${item.name}!`, RARITY_COLOR[item.rarity], 'ITEM');
      return true;
    },

    buyInventorySlots: () => {
      const s = get();
      const cost = s.maxInventorySlots * 100;
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

      const coreIndex = s.inventory.findIndex((i) => i.type === 'CORE');
      const core = coreIndex >= 0 ? s.inventory[coreIndex] : null;
      const requiredCores = Math.ceil(item.level / 2);
      const goldCost = Math.floor(item.price * item.level * 0.5);
      if (s.gold < goldCost) return fail('Not enough Gold!');
      if (!core || (core.quantity || 1) < requiredCores) return fail(`Need ${requiredCores} Cores`);

      const chance = item.level >= 3 ? Math.max(10, 100 - (item.level - 2) * 10) : 100;
      const success = Math.random() * 100 < chance;

      const inv = s.inventory.slice();
      const coreQty = core.quantity || 1;
      if (coreQty > requiredCores) inv[coreIndex] = { ...core, quantity: coreQty - requiredCores };
      else inv.splice(coreIndex, 1);

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
      const equipment: Equipment = {
        weapon: sameId(s.equipment.weapon), armor: sameId(s.equipment.armor),
        accessory: sameId(s.equipment.accessory), pet: sameId(s.equipment.pet),
      };
      set({
        gold: s.gold - goldCost,
        inventory: inv.map((i) => (i.id === item.id ? result : i)),
        equipment,
        stats: calculateStats(s.baseStats, equipment),
        actionResult: { type: 'UPGRADE', success: true, message: 'Upgrade Successful!', item: result },
      });
      return { success: true, msg: 'Upgrade Successful!', newItem: result };
    },

    rollItemDrop: (rarityOverride) => {
      const hero = get().hero;
      const notPet = ITEMS_POOL.filter((i) => i.type !== 'PET');
      let pool: Item[];
      if (rarityOverride) {
        pool = notPet.filter((i) => i.rarity === rarityOverride && isGear(i) && (!i.classType || i.classType === hero));
        if (pool.length === 0) pool = notPet.filter(isGear);
      } else {
        const r = Math.random();
        if (r > 0.90) pool = notPet.filter((i) => i.type === 'POTION');
        else if (r > 0.82) pool = notPet.filter((i) => i.type === 'CORE'); // cores are rare (8% of item drops)
        else pool = notPet.filter((i) => isGear(i) && (i.rarity === 'COMMON' || i.rarity === 'RARE'));
      }
      if (pool.length === 0) return null;

      // Class weapons are twice as likely as other gear.
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

    summon: (count) => {
      const s = get();
      const space = s.maxInventorySlots - s.inventory.length;
      const n = Math.min(count, space);
      if (n <= 0) { notify('Inventory Full!', 'red', 'WARNING'); return []; }
      const cost = n === 10 ? 900 : n * 100;
      if (s.gems < cost) { notify('Not enough Gems!', 'red', 'WARNING'); return []; }

      const gear = ITEMS_POOL.filter((i) => isGear(i) && (!i.classType || i.classType === s.hero));
      const all = [...PETS_POOL, ...gear];
      const results: Item[] = [];
      for (let k = 0; k < n; k++) {
        let roll = Math.random() * 100;
        let rarity: Rarity = 'COMMON';
        for (const r of RARITIES) {
          roll -= SUMMON_WEIGHTS[r];
          if (roll <= 0) { rarity = r; break; }
        }
        let pool = all.filter((i) => i.rarity === rarity);
        if (pool.length === 0) pool = all;
        results.push(instantiate(pool[Math.floor(Math.random() * pool.length)]));
      }
      set({ gems: s.gems - cost, inventory: [...s.inventory, ...results] });
      return results;
    },

    // --------------------------------------------------- notifications --
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

// Persist gameStats + settings only.
useGameStore.subscribe((s, prev) => {
  if (s.gameStats !== prev.gameStats || s.settings !== prev.settings) {
    savePersisted({ gameStats: s.gameStats, settings: s.settings });
  }
});
