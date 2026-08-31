
import { create } from 'zustand';
import { GameStatus, PlayerStats, Upgrade, Item, DropData, SkillLevels, Rarity, HeroClass, PassiveSkillState, Obstacle, CrateData, ItemType, GameNotification, BossData, AbilityType, GameStatistics, UpgradeType, ActionResult } from './types';
import { ITEMS_POOL, HERO_STATS, PETS_POOL, ARENA_SIZE, COLORS, INVENTORY_LIMIT, UPGRADES_POOL, POTION_STACK_LIMIT, SKILLS_INFO, RECYCLE_YIELDS, CRAFTING_COSTS, MATERIAL_COMBINE_COST, RARITY_LEVEL_REQ } from './constants';
import { Vector3 } from 'three';

interface GameState {
  status: GameStatus;
  hero: HeroClass;
  score: number;
  accumulatedWaveGold: number;
  gems: number; 
  level: number;
  experience: number;
  experienceToNextLevel: number;
  skillPoints: number;
  health: number;
  mana: number;
  playerPosition: Vector3;
  stats: PlayerStats;
  baseStats: PlayerStats;
  
  wave: number;
  waveTimer: number;
  recentRuns: number[];
  
  gameStats: GameStatistics;

  skillLevels: SkillLevels;
  passiveSkillState: PassiveSkillState;
  
  activeAbilityQ: AbilityType | null; 
  activeAbilityR: AbilityType | null;

  inventory: Item[];
  maxInventorySlots: number;
  materials: Record<Rarity, number>;

  equipment: {
    weapon: Item | null;
    armor: Item | null;
    accessory: Item | null;
    pet: Item | null;
  };
  
  gachaResults: Item[];
  upgradeOptions: Upgrade[];

  drops: DropData[];
  obstacles: Obstacle[];
  crates: CrateData[];
  minimapEnemies: { x: number, z: number, type: number }[];
  
  skills: {
    dash: number;
    q: number;
    r: number;
    e: number;
  };
  skillMaxCooldowns: {
    dash: number;
    q: number;
    r: number;
    e: number;
  };
  dashCharges: number;
  maxDashCharges: number;
  
  shieldCharges: number;
  maxShieldCharges: number;

  earthwall: { active: boolean, position: Vector3, timer: number, radius: number };
  warVitalityTimer: number;
  sprintTimer: number;

  rageMode: boolean;
  rageTimer: number;

  hpPotionCooldown: number;
  mpPotionCooldown: number;
  barrierCooldown: number;
  isInvincible: boolean;
  invincibilityTimer: number;
  levelUpVisualTimer: number;
  reviveAnimTimer: number;
  revivingCountdown: number;
  piercingShotBoostTimer: number;

  petReviveCooldown: number;

  bossData: BossData;

  isInventoryOpen: boolean;
  isShopOpen: boolean;
  isCharacterSheetOpen: boolean;
  isCodexOpen: boolean;
  activeShopTab: 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH';
  notifications: GameNotification[];
  actionResult: ActionResult | null;
  
  lastInventoryFullNotification: number;

  setStatus: (status: GameStatus) => void;
  toggleInventory: () => void;
  toggleCharacterSheet: () => void;
  toggleCodex: () => void;
  openSpecificShop: (tab: 'SUPPLIES' | 'PETS' | 'SKILLS' | 'BLACKSMITH') => void;
  closeAllUI: () => void;
  clearActionResult: () => void;

  selectHero: (hero: HeroClass) => void;
  startGame: () => void;
  addScore: (amount: number) => void;
  addGems: (amount: number) => void;
  addExperience: (amount: number) => void;
  takeDamage: (amount: number) => void;
  breakCrate: (id: number) => void;
  damageCrate: (id: number, amount: number) => void;
  useMana: (amount: number) => boolean;
  getManaCost: (skill: keyof SkillLevels | 'r' | 'q' | 'e') => number; 
  heal: (amount: number) => void;
  restoreMana: (amount: number) => void;
  setPlayerPosition: (pos: Vector3) => void;
  triggerInvincibility: (duration: number) => void;
  setInvincible: (invincible: boolean) => void;
  applyUpgrade: (upgrade: Upgrade) => void;
  selectUpgrade: (upgrade: Upgrade) => void;
  upgradeSkill: (skill: keyof SkillLevels) => void;
  equipItem: (item: Item) => void;
  unequipItem: (slot: 'weapon' | 'armor' | 'accessory' | 'pet') => void;
  autoEquip: () => void;
  buyItem: (item: Item, quantity?: number) => boolean;
  sellItem: (item: Item, amount?: number) => void;
  sellItems: (items: Item[]) => void;
  massSell: (rarity: Rarity) => void;
  recycleItem: (item: Item) => void;
  massRecycle: (rarity: Rarity) => void;
  combineMaterials: (fromRarity: Rarity) => void;
  craftItem: (rarity: Rarity) => boolean;
  buyInventorySlots: () => boolean;
  clearGachaResults: () => void;
  upgradeItem: (item: Item) => { success: boolean, msg: string, newItem?: Item };
  resetGame: () => void;
  
  spawnDrop: (position: Vector3, type: 'ITEM' | 'XP' | 'GOLD' | 'GEM' | 'HEALTH' | 'MAGNET', value: number, rarityOverride?: Rarity, orbMultiplier?: 5 | 10) => void;
  collectDrop: (id: number) => void;
  triggerSkillCooldown: (skill: 'dash' | 'q' | 'r' | 'e') => void;
  activateRage: () => void;
  updatePassiveCooldowns: (state: Partial<PassiveSkillState>) => void;
  tickCooldowns: (delta: number) => void;
  updateMinimapEnemies: (enemies: { x: number, z: number, type: number }[]) => void;
  
  activateEarthwall: (pos: Vector3) => void;
  activateWarVitality: () => void;
  activateSprint: () => void;

  advanceWave: () => void;
  setBossData: (data: Partial<BossData>) => void;
  
  addNotification: (message: string, color?: string, type?: 'ITEM' | 'BOSS' | 'SYSTEM' | 'WARNING', action?: { label: string, onClick: () => void }, persistent?: boolean) => void;
  removeNotification: (id: string) => void;
  handleInventoryFull: () => void;
}

const INITIAL_STATS: PlayerStats = {
  maxHealth: 100,
  maxMana: 100,
  regen: 0.5,
  manaRegen: 0.5,
  moveSpeed: 10,
  damage: 15,
  fireRate: 2.0,
  projectileSpeed: 20,
  multishot: 1,
  spread: 0.2,
  dashCooldown: 4.0,
  cooldownReduction: 0,
  magnetRadius: 5.0,
  critRate: 0.05,
  critDamage: 1.5,
  defense: 0,
  skillDamage: 1.0,
  knockback: 0.5,
  dodge: 0,
  attackRange: 25.0,
};

const INITIAL_GAME_STATS: GameStatistics = {
    totalRuns: 0,
    highestWave: 0,
    highestCP: 0,
    bestRunClass: null,
    classRuns: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0 },
    classHighestWave: { ARCHER: 0, WIZARD: 0, BARBARIAN: 0 }
};

const INITIAL_PLAYER_POS = () => new Vector3(0, 0, 0);
const INITIAL_EARTHWALL_POS = () => new Vector3();

export const calculateItemCP = (item: Item): number => {
    if (item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE') return 0;
    if (!item.stats) return 0;
    
    let cp = 0;
    const s = item.stats;
    
    if (s.damage) cp += s.damage * 10;
    if (s.maxHealth) cp += s.maxHealth * 1;
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
    
    const rarityMult = {
        'COMMON': 1,
        'RARE': 1.2,
        'EPIC': 1.5,
        'LEGENDARY': 2.0,
        'MYTHIC': 3.0
    };
    
    return Math.floor(cp * rarityMult[item.rarity]);
};

export const calculateTotalCP = (stats: PlayerStats): number => {
    let cp = 0;
    cp += stats.damage * 10;
    cp += stats.maxHealth * 1;
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

const calculateStats = (base: PlayerStats, equipment: GameState['equipment'], rageMode: boolean = false, sprintActive: boolean = false) => {
  const final = { ...base };
  const sets: Record<string, number> = {};

  if (!equipment) return final;

  if (!equipment) return final;

  Object.values(equipment).forEach(item => {
    if (item && item.stats) {
        Object.entries(item.stats).forEach(([key, val]) => {
            const k = key as keyof PlayerStats;
            if (val === undefined || val === null) return;
            let v = val as number;
            
            if (item.type === 'WEAPON' && k === 'damage') v *= 0.5;
            if (item.type === 'ARMOR' && k === 'defense') v *= 0.5;

            if (k === 'moveSpeed' || k === 'fireRate') {
                 // @ts-ignore
                 final[k] += v;
            } else if (k === 'cooldownReduction') {
                 final[k] = Math.min(0.75, final[k] + v);
            } else {
                 // @ts-ignore
                 final[k] += v;
            }
        });
        if (item.setName) {
            sets[item.setName] = (sets[item.setName] || 0) + 1;
        }
    }
  });

  Object.entries(sets).forEach(([setName, count]) => {
      if (count >= 3 && equipment) {
          const setItem = Object.values(equipment).find(i => i?.setName === setName);
          if (setItem && setItem.setBonusStats) {
              Object.entries(setItem.setBonusStats).forEach(([stat, val]) => {
                  if (val === undefined || val === null) return;
                  if (stat === 'damage' || stat === 'moveSpeed' || stat === 'fireRate') {
                      // @ts-ignore
                      final[stat] *= (1 + val);
                  } else {
                      // @ts-ignore
                      final[stat] += val;
                  }
              });
          }
      }
  });

  if (equipment.weapon && equipment.weapon.projectileType === 'MAGIC') {
      final.fireRate *= 0.5;
  }

  // Reduce attack range for ranged characters based on projectile type
  if (equipment.weapon) {
      if (equipment.weapon.projectileType === 'ARROW') {
          final.attackRange *= 0.88; // Archer: ~22 units
      } else if (equipment.weapon.projectileType === 'MAGIC') {
          final.attackRange *= 0.572; // Wizard: ~14.3 units
      } else if (equipment.weapon.projectileType === 'AXE') {
          final.attackRange -= 4.0; // Barbarian: melee range minus orbital blade radius (4.0)
      }
  }

  if (rageMode) {
      final.fireRate *= 2.0;
  }

  if (sprintActive) {
      final.moveSpeed *= 2.0;
  }

  if (final.multishot > 7) final.multishot = 7;

  return final;
};

// ... generateObstacles, generateCrates ...
const generateObstacles = (): Obstacle[] => {
    const obs: Obstacle[] = [];
    const coreRadius = ARENA_SIZE / 2;
    for(let i=0; i<60; i++) {
        const x = (Math.random() - 0.5) * ARENA_SIZE * 1.5; 
        const z = (Math.random() - 0.5) * ARENA_SIZE * 1.5;
        const c1 = x*x + z*z < (coreRadius * 0.8)**2;
        const c2 = (x-40)*(x-40) + (z+30)*(z+30) < (coreRadius * 0.6)**2;
        const c3 = (x+30)*(x+30) + (z-40)*(z-40) < (coreRadius * 0.6)**2;
        
        if ((c1 || c2 || c3) && Math.sqrt(x*x + z*z) > 20) {
             obs.push({
                id: Math.random(),
                position: new Vector3(x, 0, z),
                radius: 1.0, 
                type: 'TREE',
                scale: 1 + Math.random() * 2
            });
        }
    }
    
    return obs;
};

const generateCrates = (): CrateData[] => {
    const crates: CrateData[] = [];
    const minDist = 18; // minimum distance between crates
    let attempts = 0;
    while (crates.length < 25 && attempts < 500) {
        attempts++;
        // Use polar coords to spread across the full arena, excluding center
        const angle = Math.random() * Math.PI * 2;
        const r = 22 + Math.random() * (ARENA_SIZE * 0.42 - 22); // 22..~42 units from center
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const pos = new Vector3(x, 1, z);
        // Ensure no two crates are too close together
        if (crates.every(c => c.position.distanceTo(pos) >= minDist)) {
            crates.push({ id: crates.length, active: true, position: pos, rotation: Math.random() * Math.PI, hp: 30, maxHp: 30 });
        }
    }
    return crates;
};

const getSkillCardDetails = (key: string, level: number, stats: PlayerStats) => {
    const f = (n: number) => Number(n.toFixed(1));
    const dmg = stats.damage;
    const nextLvl = level + 1;

    if (key === 'orbital') {
        const count = 2 + level; 
        const nextCount = 2 + nextLvl;
        const d = f(dmg * 1.5 * (1 + level * 0.1));
        const nextD = f(dmg * 1.5 * (1 + nextLvl * 0.1));
        if (level === 0) return `Unlock: Summons 2 blades dealing ${f(dmg*1.5)} dmg/hit.`;
        return `Blades: ${count} -> ${nextCount}. Dmg: ${d} -> ${nextD}.`;
    }
    if (key === 'thunder') {
        const t = level;
        const nt = nextLvl;
        const d = f(dmg * 0.75 * (1 + level * 0.1));
        const nd = f(dmg * 0.75 * (1 + nextLvl * 0.1));
        if (level === 0) return `Unlock: Strikes 1 enemy for ${f(dmg*0.75)} dmg every 7s.`;
        return `Targets: ${t} -> ${nt}. Dmg: ${d} -> ${nd}.`;
    }
    if (key === 'barrier') {
        const dur = f(1.0 + level * 0.2);
        const ndur = f(1.0 + nextLvl * 0.2);
        const cd = f(Math.max(20, 48 - (level * 4)));
        const ncd = f(Math.max(20, 48 - (nextLvl * 4)));
        const charges = level >= 5 ? 2 : 1;
        const ncharges = nextLvl >= 5 ? 2 : 1;
        
        if (level === 0) return `Unlock: Grants invulnerability shield (1.2s, 1 Charge, 48s CD).`;
        if (ncharges > charges) return `LEVEL ${nextLvl} UNLOCK: MAX CHARGES +1 (Total 2)!`;
        return `Invuln: ${dur}s -> ${ndur}s. CD: ${cd}s -> ${ncd}s.`;
    }
    if (key === 'dash') {
        const charges = level >= 5 ? 2 : 1;
        const ncharges = nextLvl >= 5 ? 2 : 1;
        if (level === 0) return `Unlock: Reduces Dash cooldown.`;
        if (ncharges > charges) return `LEVEL ${nextLvl} UNLOCK: MAX CHARGES +1 (Total 2)!`;
        return `Cooldown further reduced.`;
    }
    if (level === 0) return "Unlocks this skill.";
    return "Improves skill stats & mana cost.";
};

const generateUpgradeOptions = (heroClass: HeroClass, skillLevels: SkillLevels): Upgrade[] => {
    const options: Upgrade[] = [];
    const pool = UPGRADES_POOL.filter(u => {
        if (u.classType && u.classType !== heroClass) return false;
        
        if (u.type.startsWith('SKILL_')) {
            let skillKey: keyof SkillLevels | null = null;
            if (u.type === 'SKILL_ORBITAL') skillKey = 'orbital';
            else if (u.type === 'SKILL_THUNDER') skillKey = 'thunder';
            else if (u.type === 'SKILL_REGEN') skillKey = 'regen';
            else if (u.type === 'SKILL_MAGNET') skillKey = 'magnet';
            else if (u.type === 'SKILL_DASH') skillKey = 'dash';
            else if (u.type === 'SKILL_WEAPON') skillKey = 'weapon';
            else if (u.type === 'SKILL_BARRIER') skillKey = 'barrier';
            else if (u.type === 'SKILL_STORM') skillKey = 'storm';
            else if (u.type === 'SKILL_PIERCING') skillKey = 'piercing';
            else if (u.type === 'SKILL_POISON') skillKey = 'poison';
            else if (u.type === 'SKILL_FREEZING') skillKey = 'freezing';
            else if (u.type === 'SKILL_GRAVITY') skillKey = 'gravity';
            else if (u.type === 'SKILL_FREEZE_SPELL') skillKey = 'freezeSpell';
            else if (u.type === 'SKILL_RAGE') skillKey = 'rage';
            else if (u.type === 'SKILL_STAMP') skillKey = 'stamp';
            
            if (skillKey && skillLevels[skillKey] >= 5) return false;
        }
        return true;
    });
    
    for (let i = 0; i < 3; i++) {
        if (pool.length === 0) break;
        const index = Math.floor(Math.random() * pool.length);
        options.push({ ...pool[index], id: Math.random().toString() });
    }
    return options;
};

export const useGameStore = create<GameState>((set, get) => ({
  status: GameStatus.MENU,
  hero: 'ARCHER',
  score: 0,
  accumulatedWaveGold: 0,
  gems: 0,
  level: 1,
  experience: 0,
  experienceToNextLevel: 250,
  skillPoints: 0,
  health: 100,
  mana: 100,
  playerPosition: INITIAL_PLAYER_POS(),
  stats: { ...INITIAL_STATS },
  baseStats: { ...INITIAL_STATS },
  
  wave: 1,
  waveTimer: 0,
  recentRuns: [],
  
  gameStats: INITIAL_GAME_STATS,

  skillLevels: { 
      orbital: 0, thunder: 0, regen: 0, magnet: 1, dash: 1, weapon: 1, barrier: 1, storm: 0, special: 0,
      piercing: 0, poison: 0, freezing: 0, freezeSpell: 0, gravity: 0, stamp: 0, rage: 0
  },
  passiveSkillState: {
      orbitalCooldown: 0, orbitalMaxCooldown: 0.5,
      thunderCooldown: 0, thunderMaxCooldown: 0.5,
      poisonCooldown: 0, poisonMaxCooldown: 4,
      freezingCooldown: 0, freezingMaxCooldown: 3.5,
      blizzardCooldown: 0, blizzardMaxCooldown: 5,
      stampCooldown: 0, stampMaxCooldown: 5,
      stormCooldown: 0, stormMaxCooldown: 7.5
  },
  activeAbilityQ: null,
  activeAbilityR: null,

  inventory: [],
  maxInventorySlots: INVENTORY_LIMIT,
  materials: { 'COMMON': 0, 'RARE': 0, 'EPIC': 0, 'LEGENDARY': 0, 'MYTHIC': 0 },

  equipment: { weapon: null, armor: null, accessory: null, pet: null },
  gachaResults: [],
  upgradeOptions: [],
  drops: [],
  obstacles: [],
  crates: [],
  minimapEnemies: [],
  
  skills: { dash: 0, q: 0, r: 0, e: 0 },
  skillMaxCooldowns: { dash: 2.0, q: 3.5, r: 7.5, e: 10.0 },
  dashCharges: 1,
  maxDashCharges: 1,
  
  shieldCharges: 1,
  maxShieldCharges: 1,
  
  earthwall: { active: false, position: INITIAL_EARTHWALL_POS(), timer: 0, radius: 12.0 }, 
  warVitalityTimer: 0,
  sprintTimer: 0,

  rageMode: false,
  rageTimer: 0,

  hpPotionCooldown: 0,
  mpPotionCooldown: 0,
  barrierCooldown: 0,
  isInvincible: false,
  invincibilityTimer: 0,
  levelUpVisualTimer: 0,
  reviveAnimTimer: 0,
  revivingCountdown: 0,
  piercingShotBoostTimer: 0,

  petReviveCooldown: 0,

  bossData: { active: false, name: '', hp: 0, maxHp: 0 },
  
  isInventoryOpen: false,
  isShopOpen: false,
  isCharacterSheetOpen: false,
  isCodexOpen: false,
  activeShopTab: 'SUPPLIES',
  notifications: [],
  actionResult: null,
  lastInventoryFullNotification: 0,

  setStatus: (status) => set({ status }),

  toggleInventory: () => {
      const { isInventoryOpen } = get();
      const newState = !isInventoryOpen;
      set({ 
          isInventoryOpen: newState, 
          isCharacterSheetOpen: false,
          isCodexOpen: false,
          status: get().status === GameStatus.PLAYING ? GameStatus.PAUSED : get().status
      });
      if (!newState && get().status === GameStatus.PAUSED && !get().isShopOpen) {
          set({ status: GameStatus.PLAYING });
      }
  },

  toggleCharacterSheet: () => {
      const { isCharacterSheetOpen } = get();
      const newState = !isCharacterSheetOpen;
      set({ 
          isCharacterSheetOpen: newState, 
          isShopOpen: false, 
          isInventoryOpen: false, 
          isCodexOpen: false,
          status: newState ? GameStatus.PAUSED : GameStatus.PLAYING 
      });
  },

  toggleCodex: () => {
      const { isCodexOpen } = get();
      const newState = !isCodexOpen;
      set({ 
          isCodexOpen: newState,
          isCharacterSheetOpen: false, 
          isShopOpen: false, 
          isInventoryOpen: false, 
          status: newState ? GameStatus.PAUSED : GameStatus.MENU 
      });
  },

  openSpecificShop: (tab) => {
      set({ 
          isShopOpen: true, 
          isInventoryOpen: true, 
          isCharacterSheetOpen: false,
          isCodexOpen: false,
          activeShopTab: tab, 
          status: GameStatus.PAUSED 
      });
  },
  
  closeAllUI: () => set({ isInventoryOpen: false, isShopOpen: false, isCharacterSheetOpen: false, isCodexOpen: false, status: GameStatus.PLAYING }),
  clearActionResult: () => set({ actionResult: null }),

  selectHero: (hero) => set({ hero }),

  startGame: () => {
      const state = get();
      const heroStats = HERO_STATS[state.hero];
      const startStats = { ...INITIAL_STATS, ...heroStats.stats };
      
      let finalInventory = [...state.inventory];
      let finalEquipment = { ...state.equipment };
      
      if (finalEquipment.weapon && finalEquipment.weapon.classType && finalEquipment.weapon.classType !== state.hero) {
          finalInventory.push(finalEquipment.weapon);
          finalEquipment.weapon = null;
      }
      
      if (!finalEquipment.weapon) {
          const startWeaponTemplate = ITEMS_POOL.find(i => i.id === heroStats.weaponId)!;
          const startWeapon = { ...startWeaponTemplate, id: `start_wep_${Math.random().toString(36).substring(7)}`, quantity: 1 };
          finalEquipment.weapon = startWeapon;
      }
      
      if (finalInventory.length === 0) {
          finalInventory = [
            { ...ITEMS_POOL.find(i => i.id === 'potion_hp')!, id: `start_hp_${Math.random()}`, quantity: 10 },
            { ...ITEMS_POOL.find(i => i.id === 'potion_mana')!, id: `start_mana_${Math.random()}`, quantity: 10 },
            { ...ITEMS_POOL.find(i => i.id === 'revive_ankh')!, id: `start_revive_${Math.random()}`, quantity: 1 },
            { ...ITEMS_POOL.find(i => i.id === 'upgrade_core')!, id: `start_cores_${Math.random()}`, quantity: 5 }
          ];
      }

      set({
        status: GameStatus.PLAYING,
        level: 1,
        experience: 0,
        experienceToNextLevel: 250,
        skillPoints: 0, 
        health: startStats.maxHealth, 
        mana: startStats.maxMana,
        baseStats: startStats,
        stats: calculateStats(startStats, finalEquipment),
        skillLevels: { 
            orbital: 0, thunder: 0, regen: 0, magnet: 1, dash: 1, weapon: 1, barrier: 1, storm: 0, special: 0,
            piercing: 0, poison: 0, freezing: 0, freezeSpell: 0, gravity: 0, stamp: 0, rage: 0
        },
        activeAbilityQ: null,
        activeAbilityR: null,
        playerPosition: new Vector3(0, 0, 0),
        inventory: finalInventory,
        equipment: finalEquipment,
        drops: [],
        skills: { dash: 0, q: 0, r: 0, e: 0 },
        skillMaxCooldowns: { dash: 2.0, q: 3.5, r: 7.5, e: 10.0 },
        dashCharges: 1,
        maxDashCharges: 1,
        shieldCharges: 1,
        maxShieldCharges: 1,
        obstacles: generateObstacles(),
        crates: generateCrates(),
        wave: 1,
        waveTimer: 0,
        accumulatedWaveGold: 0,
        isInventoryOpen: false,
        isShopOpen: false,
        isCharacterSheetOpen: false,
        isCodexOpen: false,
        hpPotionCooldown: 0,
        mpPotionCooldown: 0,
        barrierCooldown: 0,
        isInvincible: false,
        invincibilityTimer: 0,
        levelUpVisualTimer: 0,
        reviveAnimTimer: 0,
        revivingCountdown: 0,
        piercingShotBoostTimer: 0,
        bossData: { active: false, name: '', hp: 0, maxHp: 0 },
        notifications: [],
        rageMode: false,
        rageTimer: 0,
        earthwall: { active: false, position: new Vector3(), timer: 0, radius: 10.0 },
        warVitalityTimer: 0,
        sprintTimer: 0,
        lastInventoryFullNotification: 0,
        maxInventorySlots: INVENTORY_LIMIT,
        materials: { 'COMMON': 50, 'RARE': 20, 'EPIC': 5, 'LEGENDARY': 0, 'MYTHIC': 0 },
        petReviveCooldown: 0,
      });
  },

  addScore: (amount) => set((state) => ({ score: state.score + amount })),
  addGems: (amount) => set((state) => ({ gems: state.gems + amount })),

  addExperience: (amount) => {
    const { experience, experienceToNextLevel, level, hero, skillLevels, addNotification } = get();
    const finalAmount = (level >= 10 ? amount * 2 : amount) * 2;
    let newExp = experience + finalAmount;

    if (newExp >= experienceToNextLevel) {
      const multiplier = level < 10 ? 1.35 : 1.10;
      const nextReq = Math.floor(experienceToNextLevel * multiplier);
      const currentBase = get().baseStats;
      const newBase = {
          ...currentBase,
          maxHealth: currentBase.maxHealth + 5,
          maxMana: currentBase.maxMana + 5,
          damage: currentBase.damage + 1.2,
          defense: currentBase.defense + 0.5
      };

      const newLevel = level + 1;
      let newSkillLevels = { ...skillLevels };
      let unlockedSkill = '';

      // Auto-unlock skills every 5 levels (QER and passives)
      if (newLevel % 5 === 0) {
        const skillUnlockMap: Record<HeroClass, Record<number, keyof SkillLevels>> = {
          ARCHER: { 5: 'piercing', 10: 'poison', 15: 'freezing', 20: 'special' },
          WIZARD: { 5: 'gravity', 10: 'thunder', 15: 'freezeSpell', 20: 'special' },
          BARBARIAN: { 5: 'rage', 10: 'orbital', 15: 'stamp', 20: 'special' }
        };
        const skillToUnlock = skillUnlockMap[hero][newLevel];
        if (skillToUnlock && newSkillLevels[skillToUnlock] === 0) {
          newSkillLevels[skillToUnlock] = 1;
          unlockedSkill = skillToUnlock;
          const skillNames: Record<keyof SkillLevels, string> = {
              orbital: 'Orbital Blades', thunder: 'Thundercaller', regen: 'Regeneration', magnet: 'Looter', dash: 'Dash Mastery', weapon: 'Weapon Mastery', barrier: 'Energy Shield', storm: 'Storm', special: 'Class Special', piercing: 'Piercing Arrow', gravity: 'Gravity Well', rage: 'Rage', poison: 'Poison Arrow', freezing: 'Freezing Arrow', freezeSpell: 'Blizzard', stamp: 'Mega Stamp'
          };
          const displayName = skillNames[skillToUnlock] || skillToUnlock.toUpperCase();
          addNotification(`${displayName} Unlocked!`, '#60a5fa', 'SYSTEM', {
              label: 'OPEN',
              onClick: () => { get().openSpecificShop('SKILLS'); }
          });
        }
      }

      set({
        experience: newExp - experienceToNextLevel,
        experienceToNextLevel: nextReq,
        level: newLevel,
        skillPoints: get().skillPoints + 1,
        baseStats: newBase,
        stats: calculateStats(newBase, get().equipment, get().rageMode, get().sprintTimer > 0),
        health: get().health,
        mana: get().mana,
        levelUpVisualTimer: 1.0,
        skillLevels: newSkillLevels
      });
    } else {
      set({ experience: newExp });
    }
  },

  takeDamage: (amount) => {
    const state = get();
    if (state.status !== GameStatus.PLAYING || state.isInvincible || state.health <= 0) return;
    
    if (state.stats.dodge > 0 && Math.random() < state.stats.dodge) return;

    if (state.skillLevels.barrier > 0 && state.shieldCharges > 0) {
         const nextCharges = state.shieldCharges - 1;
         let nextTimer = state.barrierCooldown;
         
         if (state.shieldCharges === state.maxShieldCharges) {
             const barrierLevel = state.skillLevels.barrier;
             nextTimer = Math.max(20, 48 - (barrierLevel * 4));
         }

         const barrierLevel = state.skillLevels.barrier;
         const duration = 1.0 + (barrierLevel * 0.2); 
         get().triggerInvincibility(duration);
         const knockbackRadius = 10 + (barrierLevel * 2);
         const knockbackForce = 5 + (barrierLevel);
         window.dispatchEvent(new CustomEvent('barrier-trigger', {
             detail: { position: state.playerPosition, radius: knockbackRadius, force: knockbackForce }
         }));
         set({ shieldCharges: nextCharges, barrierCooldown: nextTimer });
         return; 
    }
    
    const reductionMultiplier = 100 / (100 + state.stats.defense);
    const actualDamage = Math.max(1, amount * reductionMultiplier);
    const newHealth = Math.max(0, state.health - actualDamage);
    
    window.dispatchEvent(new CustomEvent('damage', { 
        detail: { position: state.playerPosition, damage: actualDamage, isCrit: false, isPlayer: true } 
    }));

    if (newHealth <= 0) {
      // Don't re-trigger revive if already counting down
      if (state.revivingCountdown > 0) return;

      if (state.equipment.pet && state.equipment.pet.petSkill === 'REVIVE' && state.petReviveCooldown <= 0) {
          set({
              health: 0,
              revivingCountdown: 5.0,
              petReviveCooldown: state.equipment.pet.petCooldown || 300,
          });
          return;
      }

      const reviveIndex = state.inventory.findIndex(i => i.type === 'REVIVE');
      if (reviveIndex !== -1) {
          const reviveItem = state.inventory[reviveIndex];
          const newInv = [...state.inventory];
          if ((reviveItem.quantity || 1) > 1) {
              newInv[reviveIndex].quantity = (reviveItem.quantity || 1) - 1;
          } else {
              newInv.splice(reviveIndex, 1);
          }
          set({
              health: 0,
              inventory: newInv,
              revivingCountdown: 5.0,
          });
          return;
      }

      const newStats = { ...state.gameStats };
      newStats.totalRuns++;
      newStats.classRuns[state.hero]++;
      
      const currentTotalCP = calculateTotalCP(state.stats);
      if (currentTotalCP > newStats.highestCP) newStats.highestCP = currentTotalCP;
      
      if (state.wave > newStats.classHighestWave[state.hero]) {
          newStats.classHighestWave[state.hero] = state.wave;
      }
      
      if (state.wave > newStats.highestWave) {
          newStats.highestWave = state.wave;
          newStats.bestRunClass = state.hero;
      }

      set({ 
          health: 0, 
          status: GameStatus.GAME_OVER,
          recentRuns: [state.wave, ...state.recentRuns.slice(0, 4)],
          score: state.score + state.accumulatedWaveGold,
          gameStats: newStats
      });
    } else {
      set({ health: newHealth });
    }
  },

  breakCrate: (id) => {
    const { crates, spawnDrop } = get();
    const index = crates.findIndex(c => c.id === id);
    if (index === -1) return;
    const crate = crates[index];
    if (!crate.active) return;
    
    const newCrates = [...crates];
    newCrates[index] = { ...crate, active: false };
    set({ crates: newCrates });
    
    spawnDrop(crate.position, 'XP', 20 + (get().wave - 1) * 5);
    const r = Math.random();
    if (r > 0.85) {
        spawnDrop(crate.position.clone().add(new Vector3(1,0,0)), 'ITEM', 0);
    } else if (r > 0.5) {
        spawnDrop(crate.position.clone().add(new Vector3(0.5,0,0.5)), 'GOLD', 10);
    }
  },

  damageCrate: (id, amount) => {
      set((state) => {
          const crateIndex = state.crates.findIndex(c => c.id === id);
          if (crateIndex === -1) return { crates: state.crates };
          const newCrates = [...state.crates];
          const crate = { ...newCrates[crateIndex] };
          if (!crate.active) return { crates: state.crates };
          
          crate.hp -= amount;
          newCrates[crateIndex] = crate;
          return { crates: newCrates };
      });
      const state = get();
      const crate = state.crates.find(c => c.id === id);
      if (crate && crate.active && crate.hp <= 0) {
          get().breakCrate(id);
      }
  },

  getManaCost: (skill) => {
      const state = get();
      let base = 0;
      let level = 0;

      if (skill === 'r') {
          return Math.ceil(60 * 0.75);
      }

      if (skill === 'q') {
          base = 30;
          if (state.activeAbilityQ === 'PIERCING_SHOT') level = state.skillLevels.piercing;
          if (state.activeAbilityQ === 'GRAVITY_SPELL') level = state.skillLevels.gravity;
          if (state.activeAbilityQ === 'RAGE') level = state.skillLevels.rage;
          return Math.ceil((base + (level * 5)) * 0.75);
      }

      if (skill === 'e') {
          base = 20;
          level = state.skillLevels.special;
          return Math.ceil((base + (level * 5)) * 0.75);
      }

      if (skill === 'dash') {
          base = 5;
          level = state.skillLevels.dash;
          return Math.ceil((base + (level * 2)) * 0.5);
      }

      level = state.skillLevels[skill as keyof SkillLevels] || 0;
      if (skill === 'thunder') return Math.ceil((5 + level) * 0.75);
      if (skill === 'poison' || skill === 'freezing') return Math.ceil((5 + level) * 0.75);
      if (skill === 'freezeSpell') return Math.ceil((15 + (level * 2)) * 0.75);
      if (skill === 'stamp') return Math.ceil((15 + (level * 2)) * 0.75);

      return 0;
  },

  useMana: (amount) => {
      const { mana, hero } = get();
      const actualCost = hero === 'WIZARD' ? Math.ceil(amount * 1.3) : amount;
      if (mana >= actualCost) {
          set({ mana: mana - actualCost });
          return true;
      }
      return false;
  },

  heal: (amount) => set((state) => ({ 
    health: Math.min(state.health + amount, state.stats.maxHealth) 
  })),

  restoreMana: (amount) => set((state) => ({ 
    mana: Math.min(state.mana + amount, state.stats.maxMana) 
  })),

  setPlayerPosition: (pos) => set({ playerPosition: pos }),
  setInvincible: (invincible) => set({ isInvincible: invincible }),
  
  triggerInvincibility: (duration) => set((state) => ({ 
      invincibilityTimer: Math.max(state.invincibilityTimer, duration),
      isInvincible: true 
  })),

  spawnDrop: (position, type, value, rarityOverride, orbMultiplier) => set((state) => {
      if (state.drops.length > 99) return { drops: state.drops };

      const maxDist = (ARENA_SIZE / 2) - 2;
      const dist = position.length();
      if (dist > maxDist) {
          position.normalize().multiplyScalar(maxDist);
          position.y = 0;
      }

      let item = null;
      if (type === 'ITEM') {
          let pool = ITEMS_POOL.filter(i => i.type !== 'PET');
          if (rarityOverride) {
              pool = pool.filter(i => i.rarity === rarityOverride && i.type !== 'POTION' && i.type !== 'CORE');
              if (pool.length === 0) pool = ITEMS_POOL.filter(i => i.type !== 'POTION' && i.type !== 'CORE' && i.type !== 'PET');
          } else {
               const r = Math.random();
               if (r > 0.90) { pool = pool.filter(i => i.type === 'POTION'); }
               else if (r > 0.60) { pool = pool.filter(i => i.type === 'CORE'); }
               else { pool = pool.filter(i => (i.rarity === 'COMMON' || i.rarity === 'RARE') && i.type !== 'POTION' && i.type !== 'CORE'); }
          }

          if (pool.length > 0) {
              const hero = get().hero;
              const weightedPool: Item[] = [];
              pool.forEach(p => {
                  weightedPool.push(p); weightedPool.push(p);
                  if (p.type === 'WEAPON' && p.classType === hero) { weightedPool.push(p); }
              });
              const template = weightedPool[Math.floor(Math.random() * weightedPool.length)];
              item = { ...template, id: Math.random().toString(), stats: { ...template.stats }, onHitEffect: template.onHitEffect };
              item.quantity = 1;
              if (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY') {
                   const plusChance = Math.random();
                   let plus = 0;
                   if (plusChance > 0.95) plus = 3; else if (plusChance > 0.85) plus = 2; else if (plusChance > 0.60) plus = 1;
                   if (plus > 0) {
                       item.level += plus;
                       Object.keys(item.stats).forEach((k) => {
                           const key = k as keyof PlayerStats;
                           const v = item.stats[key]!;
                           const newVal = v * item.level;
                           item.stats[key] = parseFloat(newVal.toFixed(2));
                       });
                   }
              }
          }
      }
      const finalOrbMultiplier = orbMultiplier || ((type === 'GOLD' || type === 'XP') && Math.random() < 0.5 ? 10 : 5);
      return { drops: [...state.drops, { id: Math.random(), position: position.clone(), type, value, item, active: true, rotation: Math.random() * Math.PI, orbMultiplier: finalOrbMultiplier }] };
  }),

  handleInventoryFull: () => {
      const now = Date.now();
      const last = get().lastInventoryFullNotification;
      if (now - last > 10000) { 
          get().addNotification("INVENTORY FULL", "red", "WARNING");
          set({ lastInventoryFullNotification: now });
      }
  },

  collectDrop: (id) => set((state) => {
      const drop = state.drops.find(d => d.id === id);
      if (!drop) return { drops: state.drops };
      
      const newDrops = state.drops.filter(d => d.id !== id);
      const { addExperience, addScore, addGems, addNotification, equipment, level, equipItem } = get();

      if (drop.type === 'ITEM' && drop.item) {
          const item = drop.item;
          const isStackable = item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE';
          const displayName = item.type === 'POTION' ? item.name.replace(' (x10)', '') : item.name;
          
          if (isStackable) {
              const existingStack = state.inventory.find(i => {
                  const matches = item.type === 'POTION'
                      ? i.type === 'POTION' && i.restoreAmount === item.restoreAmount
                      : i.name === item.name;
                  return matches && (i.quantity || 1) < POTION_STACK_LIMIT;
              });
              if (existingStack) {
                  existingStack.quantity = (existingStack.quantity || 1) + 1;
                  addNotification(`Looted ${displayName} (x1)`, COLORS.rarityCommon, 'ITEM');
                  return { drops: newDrops, inventory: [...state.inventory] };
              }
          }
          
          if (state.inventory.length >= state.maxInventorySlots) {
              get().handleInventoryFull();
              return { drops: state.drops };
          }

          const rarityColors: Record<string, string> = { 'COMMON': COLORS.rarityCommon, 'RARE': COLORS.rarityRare, 'EPIC': COLORS.rarityEpic, 'LEGENDARY': COLORS.rarityLegendary, 'MYTHIC': COLORS.rarityMythic };
          let action = undefined;
          if (item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY') {
              const slot = item.type.toLowerCase() as keyof typeof equipment;
              const currentEquip = equipment[slot];
              const newCP = calculateItemCP(item);
              const oldCP = currentEquip ? calculateItemCP(currentEquip) : 0;
              const reqLevel = RARITY_LEVEL_REQ[item.rarity];
              const classMatch = !item.classType || item.classType === state.hero;
              if (newCP > oldCP && level >= reqLevel && classMatch) { action = { label: 'EQUIP', onClick: () => get().equipItem(item) }; }
          }
          
          addNotification(`Looted ${item.name} ${item.level > 1 ? `+${item.level-1}` : ''}`, rarityColors[item.rarity], 'ITEM', action);
          return { drops: newDrops, inventory: [...state.inventory, { ...item, quantity: 1 }] };
      }
      
      if (drop.type === 'XP') {
          addExperience(drop.value);
          window.dispatchEvent(new CustomEvent('loot-text', {
              detail: { position: state.playerPosition.clone().add(new Vector3(0, 3.5, 0)), text: `+${drop.value} XP`, color: '#a3e635' }
          }));
      }
      else if (drop.type === 'GOLD') {
          addScore(drop.value);
          window.dispatchEvent(new CustomEvent('loot-text', {
              detail: { position: state.playerPosition.clone().add(new Vector3(0, 3.5, 0)), text: `+${drop.value} G`, color: '#fbbf24' }
          }));
      }
      else if (drop.type === 'GEM') { addGems(drop.value); }
      else if (drop.type === 'HEALTH') {
          const healAmt = Math.floor(state.stats.maxHealth * 0.1);
          return { drops: newDrops, health: Math.min(state.stats.maxHealth, state.health + healAmt) };
      }
      else if (drop.type === 'MAGNET') {
          // Pull all other drops directly to the player position so they get picked up
          newDrops.forEach(d => { if (d.type !== 'ITEM') d.position.copy(state.playerPosition); });
          window.dispatchEvent(new CustomEvent('loot-text', {
              detail: { position: state.playerPosition.clone().add(new Vector3(0, 3.5, 0)), text: '⚡ MAGNET!', color: '#c084fc' }
          }));
          return { drops: newDrops };
      }

      return { drops: newDrops };
  }),

  triggerSkillCooldown: (skill) => set((state) => {
      if (skill === 'dash') {
          if (state.dashCharges > 0) {
              const newCharges = state.dashCharges - 1;
              const newTimer = state.skills.dash > 0 ? state.skills.dash : state.skillMaxCooldowns.dash * (1 - state.stats.cooldownReduction);
              return { dashCharges: newCharges, skills: { ...state.skills, dash: newTimer } };
          }
          return {};
      }
      const cooldown = state.skillMaxCooldowns[skill] * (1 - state.stats.cooldownReduction);
      return { skills: { ...state.skills, [skill]: cooldown } };
  }),

  activateRage: () => set((state) => {
      const newStats = calculateStats(state.baseStats, state.equipment, true, state.sprintTimer > 0);
      return { rageMode: true, rageTimer: 4.0, stats: newStats };
  }),

  activateEarthwall: (pos) => set((state) => ({ 
      earthwall: { active: true, position: pos, timer: 4.0, radius: 12.0 } 
  })),

  updateMinimapEnemies: (enemies) => set({ minimapEnemies: enemies }),

  activateWarVitality: () => set((state) => ({ warVitalityTimer: 6.0 })),

  activateSprint: () => {
      const state = get();
      const newStats = calculateStats(state.baseStats, state.equipment, state.rageMode, true);
      set({ sprintTimer: 4.0, stats: newStats, invincibilityTimer: Math.max(state.invincibilityTimer, 4.0), isInvincible: true });
  },

  updatePassiveCooldowns: (partial) => set((state) => ({ passiveSkillState: { ...state.passiveSkillState, ...partial } })),

  advanceWave: () => {
      const state = get();
      const options = generateUpgradeOptions(state.hero, state.skillLevels);
      
      options.forEach(opt => {
          if (opt.type.startsWith('SKILL_')) {
              let skillKey: keyof SkillLevels | null = null;
              if (opt.type === 'SKILL_ORBITAL') skillKey = 'orbital';
              else if (opt.type === 'SKILL_THUNDER') skillKey = 'thunder';
              else if (opt.type === 'SKILL_REGEN') skillKey = 'regen';
              else if (opt.type === 'SKILL_MAGNET') skillKey = 'magnet';
              else if (opt.type === 'SKILL_DASH') skillKey = 'dash';
              else if (opt.type === 'SKILL_WEAPON') skillKey = 'weapon';
              else if (opt.type === 'SKILL_BARRIER') skillKey = 'barrier';
              else if (opt.type === 'SKILL_STORM') skillKey = 'storm';
              else if (opt.type === 'SKILL_PIERCING') skillKey = 'piercing';
              else if (opt.type === 'SKILL_POISON') skillKey = 'poison';
              else if (opt.type === 'SKILL_FREEZING') skillKey = 'freezing';
              else if (opt.type === 'SKILL_GRAVITY') skillKey = 'gravity';
              else if (opt.type === 'SKILL_FREEZE_SPELL') skillKey = 'freezeSpell';
              else if (opt.type === 'SKILL_RAGE') skillKey = 'rage';
              else if (opt.type === 'SKILL_STAMP') skillKey = 'stamp';

              if (skillKey) {
                  const currentLevel = state.skillLevels[skillKey];
                  if (currentLevel === 0) {
                      opt.name = `UNLOCK: ${opt.name}`;
                  }
                  opt.description = getSkillCardDetails(skillKey, currentLevel, state.stats);
              }
          }
      });

      set((state) => ({ 
          wave: state.wave + 1, 
          waveTimer: 0,
          accumulatedWaveGold: state.accumulatedWaveGold + 100,
          status: GameStatus.LEVEL_UP,
          upgradeOptions: options
      }));
  },
  
  setBossData: (data) => set(state => ({ bossData: { ...state.bossData, ...data } })),

  tickCooldowns: (delta) => {
      const state = get();
      
      let newDashTimer = Math.max(0, state.skills.dash - delta);
      let newDashCharges = state.dashCharges;
      if (newDashCharges < state.maxDashCharges) {
          if (newDashTimer <= 0) {
              newDashCharges += 1;
              if (newDashCharges < state.maxDashCharges) {
                  newDashTimer = state.skillMaxCooldowns.dash * (1 - state.stats.cooldownReduction);
              }
          }
      }

      let newShieldTimer = Math.max(0, state.barrierCooldown - delta);
      let newShieldCharges = state.shieldCharges;
      if (newShieldCharges < state.maxShieldCharges) {
          if (newShieldTimer <= 0) {
              newShieldCharges++;
              if (newShieldCharges < state.maxShieldCharges) {
                  const barrierLevel = state.skillLevels.barrier;
                  newShieldTimer = Math.max(20, 48 - (barrierLevel * 4));
              }
          }
      }

      const newSkills = {
          dash: newDashTimer,
          q: Math.max(0, state.skills.q - delta),
          r: Math.max(0, state.skills.r - delta),
          e: Math.max(0, state.skills.e - delta),
      };
      
      let rageTimer = state.rageTimer;
      let rageMode = state.rageMode;
      let sprintTimer = state.sprintTimer;
      let stats = state.stats;
      
      let earthwall = { ...state.earthwall };
      if (earthwall.active) {
          earthwall.timer -= delta;
          if (earthwall.timer <= 0) earthwall.active = false;
      }

      let warVitalityTimer = state.warVitalityTimer;
      if (warVitalityTimer > 0) {
          warVitalityTimer -= delta;
          const healAmt = 10 * delta;
          if (state.health < state.stats.maxHealth) {
              get().heal(healAmt);
          }
      }

      if (sprintTimer > 0) {
          sprintTimer -= delta;
      }

      let recalc = false;
      if (rageMode) {
          rageTimer -= delta;
          if (rageTimer <= 0) {
              rageMode = false;
              rageTimer = 0;
              recalc = true;
          }
      }
      if (state.sprintTimer > 0 && sprintTimer <= 0) recalc = true;

      if (recalc) {
          stats = calculateStats(state.baseStats, state.equipment, rageMode, sprintTimer > 0);
      }
      
      const newBarrierCooldown = newShieldTimer;
      const newLevelUpTimer = Math.max(0, state.levelUpVisualTimer - delta);
      const newReviveAnimTimer = Math.max(0, state.reviveAnimTimer - delta);
      const newPetReviveCooldown = Math.max(0, state.petReviveCooldown - delta);

      // Revive countdown: tick down and execute revival when it hits zero
      let newRevivingCountdown = state.revivingCountdown;
      if (newRevivingCountdown > 0) {
          newRevivingCountdown = Math.max(0, newRevivingCountdown - delta);
          if (newRevivingCountdown <= 0) {
              // Execute revival: restore health, grant invincibility + shield
              const reviveHealth = state.stats.maxHealth * 0.5;
              get().triggerInvincibility(5.0);
              // Restore one shield charge for the barrier activation
              const newCharges = Math.min(state.maxShieldCharges, state.shieldCharges + 1);
              window.dispatchEvent(new CustomEvent('revive', { detail: { position: state.playerPosition } }));
              set({
                  health: reviveHealth,
                  reviveAnimTimer: 2.0,
                  revivingCountdown: 0,
                  shieldCharges: newCharges,
              });
              get().addNotification("REVIVED!", '#fbbf24', 'SYSTEM');
              return;
          }
      }
      
      let newInvincibilityTimer = state.invincibilityTimer;
      let newIsInvincible = state.isInvincible;
      if (state.invincibilityTimer > 0) {
          newInvincibilityTimer -= delta;
          if (newInvincibilityTimer <= 0) {
              newInvincibilityTimer = 0;
              newIsInvincible = false;
          } else {
              newIsInvincible = true;
          }
      }
      
      const regenAmount = (state.stats.regen + (state.skillLevels.regen * 0.5)) * delta;
      const manaRegenAmount = state.stats.manaRegen * delta;
      const newHealth = Math.min(state.stats.maxHealth, state.health + regenAmount);
      const newMana = Math.min(state.stats.maxMana, state.mana + manaRegenAmount);
      
      let newHpCD = Math.max(0, state.hpPotionCooldown - delta);
      let newMpCD = Math.max(0, state.mpPotionCooldown - delta);
      let newHealthAfterPot = newHealth;
      let newManaAfterPot = newMana;
      let inventory = state.inventory;

      const hpThreshold = state.stats.maxHealth * 0.7;
      const manaThreshold = state.stats.maxMana * 0.7;

      if (newHpCD <= 0 && newHealthAfterPot < hpThreshold) {
          const hpPotIndex = inventory.findIndex(i => i.type === 'POTION' && i.name.includes('Health'));
          if (hpPotIndex !== -1) {
              const pot = inventory[hpPotIndex];
              newHealthAfterPot = Math.min(state.stats.maxHealth, newHealthAfterPot + (pot.restoreAmount || 50));
              newHpCD = 10;
              inventory = [...inventory];
              if ((pot.quantity || 1) > 1) { inventory[hpPotIndex] = { ...pot, quantity: (pot.quantity || 1) - 1 }; }
              else { inventory.splice(hpPotIndex, 1); }
          }
      }

      if (newMpCD <= 0 && newManaAfterPot < manaThreshold) {
           const manaPotIndex = inventory.findIndex(i => i.type === 'POTION' && i.name.includes('Mana'));
           if (manaPotIndex !== -1) {
              const pot = inventory[manaPotIndex];
              newManaAfterPot = Math.min(state.stats.maxMana, newManaAfterPot + (pot.restoreAmount || 50));
              newMpCD = 10;
              inventory = [...inventory];
              if ((pot.quantity || 1) > 1) { inventory[manaPotIndex] = { ...pot, quantity: (pot.quantity || 1) - 1 }; }
              else { inventory.splice(manaPotIndex, 1); }
           }
      }

      let newPiercingShotBoost = Math.max(0, state.piercingShotBoostTimer - delta);

      set({
          skills: newSkills,
          dashCharges: newDashCharges,
          shieldCharges: newShieldCharges,
          health: newHealthAfterPot,
          mana: newManaAfterPot,
          stats: stats,
          rageMode: rageMode,
          rageTimer: rageTimer,
          sprintTimer: Math.max(0, sprintTimer),
          earthwall: earthwall,
          warVitalityTimer: Math.max(0, warVitalityTimer),
          hpPotionCooldown: newHpCD,
          mpPotionCooldown: newMpCD,
          barrierCooldown: newBarrierCooldown,
          inventory: inventory,
          waveTimer: state.waveTimer + delta,
          invincibilityTimer: newInvincibilityTimer,
          isInvincible: newIsInvincible,
          levelUpVisualTimer: newLevelUpTimer,
          reviveAnimTimer: newReviveAnimTimer,
          revivingCountdown: newRevivingCountdown,
          piercingShotBoostTimer: newPiercingShotBoost,
          petReviveCooldown: newPetReviveCooldown,
      });
  },

  upgradeItem: (item) => {
      const state = get();
      if (item.level >= 10) {
          set({ actionResult: { type: 'UPGRADE', success: false, message: "Max Level Reached!" } });
          return { success: false, msg: "Max Level", newItem: item };
      }

      const core = state.inventory.find(i => i.type === 'CORE');
      const coreIndex = state.inventory.findIndex(i => i.type === 'CORE');
      const requiredCores = Math.ceil(item.level / 2);
      const goldCost = Math.floor(item.price * item.level * 0.5);
      
      if (state.score < goldCost) {
          set({ actionResult: { type: 'UPGRADE', success: false, message: "Not enough Gold!" } });
          return { success: false, msg: "Not enough Gold", newItem: item };
      }
      if (!core || (core.quantity || 1) < requiredCores) {
          set({ actionResult: { type: 'UPGRADE', success: false, message: `Need ${requiredCores} Cores` } });
          return { success: false, msg: `Need ${requiredCores} Cores`, newItem: item };
      }
      
      let chance = 100;
      if (item.level >= 3) {
          chance = Math.max(10, 100 - ((item.level - 2) * 10));
      }
      
      const roll = Math.random() * 100;
      const success = roll < chance;
      
      const newInventory = [...state.inventory];
      const coreItem = newInventory[coreIndex];
      if ((coreItem.quantity || 1) > requiredCores) { coreItem.quantity = (coreItem.quantity || 1) - requiredCores; } else { newInventory.splice(coreIndex, 1); }
      set({ score: state.score - goldCost, inventory: newInventory });
      
      if (success) {
           let upgradedItem: Item = { ...item };
           const upgradeLogic = (i: Item) => {
              if (item === item && i.stats) {
                  const updatedStats = { ...i.stats };
                  Object.keys(updatedStats).forEach(k => {
                      const key = k as keyof PlayerStats; 
                      const val = updatedStats[key]!;
                      const lvl = Math.max(1, i.level);
                      const base = val / lvl;
                      const next = base * (lvl + 1);
                      updatedStats[key] = parseFloat(next.toFixed(2));
                  });
                  upgradedItem = { ...i, level: i.level + 1, stats: updatedStats };
                  return upgradedItem;
              }
              return i;
          };
          const updatedInventory = get().inventory.map(upgradeLogic);
          const updatedEquipment = {
              weapon: state.equipment.weapon ? upgradeLogic(state.equipment.weapon) : null,
              armor: state.equipment.armor ? upgradeLogic(state.equipment.armor) : null,
              accessory: state.equipment.accessory ? upgradeLogic(state.equipment.accessory) : null,
              pet: state.equipment.pet ? upgradeLogic(state.equipment.pet) : null,
          };
          const newStats = calculateStats(state.baseStats, updatedEquipment, state.rageMode, state.sprintTimer > 0);
          set({ inventory: updatedInventory, equipment: updatedEquipment, stats: newStats, actionResult: { type: 'UPGRADE', success: true, message: "Upgrade Successful!", item: upgradedItem } });
          return { success: true, msg: "Upgrade Successful!", newItem: upgradedItem };
      } else { 
          set({ actionResult: { type: 'UPGRADE', success: false, message: "Upgrade Failed..." } });
          return { success: false, msg: "Upgrade Failed...", newItem: item }; 
      }
  },

  resetGame: () => {
    const state = get();
    const persistedInventory = state.inventory.filter(i => i.type === 'POTION' || i.type === 'CORE' || i.type === 'REVIVE');
    const initialState = {
      status: GameStatus.MENU,
      score: state.score,
      gems: 0,
      level: 1,
      experience: 0,
      experienceToNextLevel: 250,
      skillPoints: 0,
      health: 100,
      mana: 100,
      playerPosition: new Vector3(0, 0, 0),
      stats: { ...INITIAL_STATS },
      baseStats: { ...INITIAL_STATS },
      wave: 1,
      waveTimer: 0,
      skillLevels: {
          orbital: 0, thunder: 0, regen: 0, magnet: 1, dash: 1, weapon: 1, barrier: 1, storm: 0, special: 0,
          piercing: 0, poison: 0, freezing: 0, freezeSpell: 0, gravity: 0, stamp: 0, rage: 0
      },
      passiveSkillState: {
          orbitalCooldown: 0, orbitalMaxCooldown: 0.5,
          thunderCooldown: 0, thunderMaxCooldown: 0.5,
          poisonCooldown: 0, poisonMaxCooldown: 4,
          freezingCooldown: 0, freezingMaxCooldown: 3.5,
          blizzardCooldown: 0, blizzardMaxCooldown: 5,
          stampCooldown: 0, stampMaxCooldown: 5,
          stormCooldown: 0, stormMaxCooldown: 7.5
      },
      activeAbilityQ: null,
      activeAbilityR: null,
      inventory: persistedInventory,
      maxInventorySlots: INVENTORY_LIMIT,
      equipment: { weapon: null, armor: null, accessory: null, pet: null },
      gachaResults: [],
      upgradeOptions: [],
      drops: [],
      bossData: { active: false, name: '', hp: 0, maxHp: 0 },
      notifications: [],
      minimapEnemies: [],
    };
    set(initialState);
  },
  addNotification: (message, color = 'white', type = 'ITEM', action, persistent = false) => set(state => ({ notifications: [...state.notifications, { id: Math.random().toString(), message, color, type, action, persistent }] })),
  removeNotification: (id) => set(state => ({ notifications: state.notifications.filter(n => n.id !== id) })),
  
  upgradeSkill: (skill) => {
    const state = get();
    const currentLevel = state.skillLevels[skill];
    if (currentLevel >= 5) return;
    
    let cost = currentLevel + 1;
    if (skill === 'special') cost = 5;
    if (skill === 'dash' || skill === 'barrier') cost = currentLevel + 2;
    
    if (state.skillPoints >= cost) {
      const newLevels = { ...state.skillLevels, [skill]: currentLevel + 1 };
      
      // Update max cooldowns or passive state based on new level
      const newPassiveState = { ...state.passiveSkillState };
      const newMaxCooldowns = { ...state.skillMaxCooldowns };
      
      set({
        skillLevels: newLevels,
        skillPoints: state.skillPoints - cost,
        passiveSkillState: newPassiveState,
        skillMaxCooldowns: newMaxCooldowns
      });
    }
  },
  
  applyUpgrade: (upgrade) => {
    const state = get();
    const newStats = { ...state.baseStats };
    let newLevels = { ...state.skillLevels };
    let newPassiveState = { ...state.passiveSkillState };
    
    if (upgrade.type.startsWith('SKILL_')) {
        let skillKey: keyof SkillLevels | null = null;
        if (upgrade.type === 'SKILL_ORBITAL') skillKey = 'orbital';
        else if (upgrade.type === 'SKILL_THUNDER') skillKey = 'thunder';
        else if (upgrade.type === 'SKILL_REGEN') skillKey = 'regen';
        else if (upgrade.type === 'SKILL_MAGNET') skillKey = 'magnet';
        else if (upgrade.type === 'SKILL_DASH') skillKey = 'dash';
        else if (upgrade.type === 'SKILL_WEAPON') skillKey = 'weapon';
        else if (upgrade.type === 'SKILL_BARRIER') skillKey = 'barrier';
        else if (upgrade.type === 'SKILL_STORM') skillKey = 'storm';
        else if (upgrade.type === 'SKILL_PIERCING') skillKey = 'piercing';
        else if (upgrade.type === 'SKILL_POISON') skillKey = 'poison';
        else if (upgrade.type === 'SKILL_FREEZING') skillKey = 'freezing';
        else if (upgrade.type === 'SKILL_GRAVITY') skillKey = 'gravity';
        else if (upgrade.type === 'SKILL_FREEZE_SPELL') skillKey = 'freezeSpell';
        else if (upgrade.type === 'SKILL_RAGE') skillKey = 'rage';
        else if (upgrade.type === 'SKILL_STAMP') skillKey = 'stamp';
        
        if (skillKey) {
            newLevels[skillKey] += 1;
        }
    } else {
        switch(upgrade.type) {
            case 'HEALTH': newStats.maxHealth += upgrade.value; break;
            case 'MAX_MANA': newStats.maxMana += upgrade.value; break;
            case 'DAMAGE': newStats.damage += newStats.damage * upgrade.value; break;
            case 'SPEED': newStats.moveSpeed += newStats.moveSpeed * upgrade.value; break;
            case 'FIRE_RATE': newStats.fireRate += newStats.fireRate * upgrade.value; break;
            case 'DEFENSE': newStats.defense += upgrade.value; break;
            case 'CRIT_RATE': newStats.critRate += upgrade.value; break;
            case 'CRIT_DAMAGE': newStats.critDamage += upgrade.value; break;
            case 'MULTISHOT': newStats.multishot += upgrade.value; break;
            case 'DASH_COOLDOWN': 
                 newStats.dashCooldown = Math.max(0.5, newStats.dashCooldown - 0.5); 
                 break;
        }
    }
    
    set({
        baseStats: newStats,
        skillLevels: newLevels,
        passiveSkillState: newPassiveState,
        stats: calculateStats(newStats, state.equipment, state.rageMode, state.sprintTimer > 0)
    });
  },

  selectUpgrade: (upgrade) => {
      get().applyUpgrade(upgrade);
      set({ status: GameStatus.PLAYING });
  },

  equipItem: (item) => {
    const state = get();
    const reqLevel = RARITY_LEVEL_REQ[item.rarity];
    if (state.level < reqLevel) {
        get().addNotification(`Requires Level ${reqLevel}!`, 'red', 'WARNING');
        return;
    }
    
    if (item.type === 'WEAPON' && item.classType && item.classType !== state.hero) {
        get().addNotification(`Only for ${item.classType}!`, 'red', 'WARNING');
        return;
    }

    const slot = item.type.toLowerCase() as keyof typeof state.equipment;
    const currentEquip = state.equipment[slot];
    
    const inventory = [...state.inventory];
    const itemIndex = inventory.findIndex(i => i.id === item.id);
    if (itemIndex > -1) {
        if ((inventory[itemIndex].quantity || 1) > 1) {
             inventory[itemIndex].quantity = (inventory[itemIndex].quantity || 1) - 1;
        } else {
             inventory.splice(itemIndex, 1);
        }
    }
    
    if (currentEquip) {
        inventory.push(currentEquip);
    }
    
    const newEquipment = { ...state.equipment, [slot]: { ...item, quantity: 1 } };
    
    let newActiveQ = state.activeAbilityQ;
    if (item.type === 'WEAPON') {
         if (item.classType === 'ARCHER') newActiveQ = 'PIERCING_SHOT';
         if (item.classType === 'WIZARD') newActiveQ = 'GRAVITY_SPELL';
         if (item.classType === 'BARBARIAN') newActiveQ = 'RAGE';
    }

    const newStats = calculateStats(state.baseStats, newEquipment, state.rageMode, state.sprintTimer > 0);
    
    set({
        inventory,
        equipment: newEquipment,
        stats: newStats,
        activeAbilityQ: newActiveQ
    });
    
    get().addNotification(`Equipped ${item.name}`, COLORS.rarityCommon, 'SYSTEM');
  },

  unequipItem: (slot) => {
      const state = get();
      const currentEquip = state.equipment[slot];
      if (!currentEquip) return;
      
      if (state.inventory.length >= state.maxInventorySlots) {
          get().addNotification("Inventory Full!", 'red', 'WARNING');
          return;
      }
      
      const newEquipment = { ...state.equipment, [slot]: null };
      const inventory = [...state.inventory, currentEquip];
      
      const newStats = calculateStats(state.baseStats, newEquipment, state.rageMode, state.sprintTimer > 0);
      
      set({
          inventory,
          equipment: newEquipment,
          stats: newStats,
          activeAbilityQ: slot === 'weapon' ? null : state.activeAbilityQ
      });
  },

  autoEquip: () => {
      const state = get();
      const inventory = [...state.inventory];
      const equipment = { ...state.equipment };
      let changed = false;
      
      const tryEquip = (slot: keyof typeof equipment, type: ItemType) => {
          const candidates = inventory.filter(i => 
              i.type === type && 
              state.level >= RARITY_LEVEL_REQ[i.rarity] &&
              (!i.classType || i.classType === state.hero)
          );
          
          if (candidates.length === 0) return;
          
          let bestItem = candidates[0];
          let bestCP = calculateItemCP(bestItem);
          
          candidates.forEach(i => {
              const cp = calculateItemCP(i);
              if (cp > bestCP) {
                  bestCP = cp;
                  bestItem = i;
              }
          });
          
          const currentCP = equipment[slot] ? calculateItemCP(equipment[slot]!) : -1;
          
          if (bestCP > currentCP) {
              if (equipment[slot]) {
                  inventory.push(equipment[slot]!);
              }
              equipment[slot] = bestItem;
              
              const idx = inventory.indexOf(bestItem);
              if (idx > -1) inventory.splice(idx, 1);
              
              changed = true;
          }
      };
      
      tryEquip('weapon', 'WEAPON');
      tryEquip('armor', 'ARMOR');
      tryEquip('accessory', 'ACCESSORY');
      tryEquip('pet', 'PET');
      
      if (changed) {
          let newActiveQ = state.activeAbilityQ;
          if (equipment.weapon) {
             if (equipment.weapon.classType === 'ARCHER') newActiveQ = 'PIERCING_SHOT';
             if (equipment.weapon.classType === 'WIZARD') newActiveQ = 'GRAVITY_SPELL';
             if (equipment.weapon.classType === 'BARBARIAN') newActiveQ = 'RAGE';
          }
          
          const newStats = calculateStats(state.baseStats, equipment, state.rageMode, state.sprintTimer > 0);
          set({
              inventory,
              equipment,
              stats: newStats,
              activeAbilityQ: newActiveQ
          });
          get().addNotification("Auto Equipped Best Items", COLORS.uiAccent, 'SYSTEM');
      }
  },

  buyItem: (item, quantity = 1) => {
      const state = get();
      const purchaseQuantity = item.type === 'POTION' ? 10 : quantity;
      const totalCost = item.price * quantity;
      
      if (state.score >= totalCost) {
          const isStackable = item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE';
          const existingStack = state.inventory.find(i => i.name === item.name);
          
          if (!isStackable && state.inventory.length >= state.maxInventorySlots) {
              get().addNotification("Inventory Full!", 'red', 'WARNING');
              return false;
          }
          
          if (isStackable && existingStack) {
               const newInventory = state.inventory.map(i => i.name === item.name ? { ...i, quantity: (i.quantity || 1) + purchaseQuantity } : i);
               set({ score: state.score - totalCost, inventory: newInventory });
          } else {
               if (state.inventory.length >= state.maxInventorySlots) {
                   get().addNotification("Inventory Full!", 'red', 'WARNING');
                   return false;
               }
               const newItem = { ...item, id: Math.random().toString(), quantity: purchaseQuantity };
               set({ score: state.score - totalCost, inventory: [...state.inventory, newItem] });
          }
          
          get().addNotification(`Bought ${item.name}`, 'white', 'SYSTEM');
          return true;
      } else {
          get().addNotification("Not enough Gold!", 'red', 'WARNING');
          return false;
      }
  },

  sellItem: (item, amount = 1) => set((state) => {
      const invItemIndex = state.inventory.findIndex(i => i.id === item.id);
      if (invItemIndex === -1) return {};

      const invItem = state.inventory[invItemIndex];
      const currentQty = invItem.quantity || 1;
      const sellQty = Math.min(currentQty, amount);
      const unitPrice = Math.floor(invItem.price * 0.3);
      const totalValue = unitPrice * sellQty;

      const newInv = [...state.inventory];
      if (sellQty >= currentQty) {
          newInv.splice(invItemIndex, 1);
      } else {
          newInv[invItemIndex] = { ...invItem, quantity: currentQty - sellQty };
      }

      get().addNotification(`Sold ${sellQty}x ${invItem.name} for ${totalValue}G`, 'yellow', 'SYSTEM');
      return { score: state.score + totalValue, inventory: newInv };
  }),
  
  sellItems: (items) => {
      const state = get();
      let totalValue = 0;
      const idsToRemove = new Set(items.map(i => i.id));
      items.forEach(i => totalValue += Math.floor(i.price * 0.3));
      
      const newInventory = state.inventory.filter(i => !idsToRemove.has(i.id));
      set({ score: state.score + totalValue, inventory: newInventory });
      get().addNotification(`Sold ${items.length} items for ${totalValue}G`, 'yellow', 'SYSTEM');
  },

  massSell: (rarity) => {
      const state = get();
      const toSell = state.inventory.filter(i => i.rarity === rarity && i.type !== 'POTION' && i.type !== 'CORE' && i.type !== 'REVIVE');
      if (toSell.length > 0) {
          get().sellItems(toSell);
      } else {
          get().addNotification(`No ${rarity} items to sell.`, 'white', 'SYSTEM');
      }
  },

  recycleItem: (item) => {
      const state = get();
      const yieldAmt = RECYCLE_YIELDS[item.rarity];
      const newMaterials = { ...state.materials, [item.rarity]: state.materials[item.rarity] + yieldAmt };
      
      const newInventory = state.inventory.filter(i => i.id !== item.id);
      
      set({ inventory: newInventory, materials: newMaterials });
      get().addNotification(`Recycled for ${yieldAmt} ${item.rarity} Shard(s)`, COLORS.uiAccent, 'SYSTEM');
  },
  
  massRecycle: (rarity) => {
      const state = get();
      const itemsToRecycle = state.inventory.filter(i => i.rarity === rarity && i.type !== 'POTION' && i.type !== 'CORE' && i.type !== 'REVIVE');
      
      if (itemsToRecycle.length === 0) {
          get().addNotification(`No ${rarity} items to recycle`, 'white', 'SYSTEM');
          return;
      }
      
      let totalYield = 0;
      itemsToRecycle.forEach(i => totalYield += RECYCLE_YIELDS[i.rarity]);
      
      const newMaterials = { ...state.materials, [rarity]: state.materials[rarity] + totalYield };
      const idsToRemove = new Set(itemsToRecycle.map(i => i.id));
      const newInventory = state.inventory.filter(i => !idsToRemove.has(i.id));
      
      set({ inventory: newInventory, materials: newMaterials });
      get().addNotification(`Recycled ${itemsToRecycle.length} items for ${totalYield} ${rarity} Shards`, COLORS.uiAccent, 'SYSTEM');
  },
  
  combineMaterials: (fromRarity) => {
      const state = get();
      const order: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
      const idx = order.indexOf(fromRarity);
      if (idx === -1 || idx === order.length - 1) return;
      
      const toRarity = order[idx + 1];
      const cost = MATERIAL_COMBINE_COST;
      
      if (state.materials[fromRarity] >= cost) {
          const newMaterials = { ...state.materials };
          newMaterials[fromRarity] -= cost;
          newMaterials[toRarity] += 1;
          set({ materials: newMaterials });
          get().addNotification(`Crafted 1 ${toRarity} Shard`, COLORS.uiAccent, 'SYSTEM');
      } else {
          get().addNotification(`Need ${cost} ${fromRarity} Shards`, 'red', 'WARNING');
      }
  },
  
  craftItem: (rarity) => {
      const state = get();
      const cost = CRAFTING_COSTS[rarity];
      
      if (state.materials[rarity] >= cost) {
          if (state.inventory.length >= state.maxInventorySlots) {
              get().addNotification("Inventory Full!", 'red', 'WARNING');
              return false;
          }
          
          // Deduct materials
          const newMaterials = { ...state.materials, [rarity]: state.materials[rarity] - cost };
          
          // Generate Item
          let pool = ITEMS_POOL.filter(i => i.type !== 'POTION' && i.type !== 'CORE' && i.type !== 'REVIVE' && i.rarity === rarity);
          // If strict pool empty, broaden search or fallback? (Ideally pool has all rarities)
          if (pool.length === 0) pool = ITEMS_POOL; 
          
          const template = pool[Math.floor(Math.random() * pool.length)];
          const newItem = { ...template, id: Math.random().toString(), stats: { ...template.stats }, onHitEffect: template.onHitEffect, quantity: 1 };
          
          // Random +Level for crafted items?
          if (Math.random() > 0.8) {
              newItem.level += 1;
              // Recalc stats for level up would go here, simplified:
              Object.keys(newItem.stats).forEach(k => {
                  // @ts-ignore
                  newItem.stats[k] = parseFloat((newItem.stats[k] * 2).toFixed(2)); // Rough scaling
              });
          }

          set({ materials: newMaterials, inventory: [...state.inventory, newItem] });
          get().addNotification(`Crafted ${newItem.name}!`, COLORS.rarityRare, 'ITEM');
          return true;
      } else {
          get().addNotification(`Need ${cost} ${rarity} Shards`, 'red', 'WARNING');
          return false;
      }
  },
  
  buyInventorySlots: () => {
      const state = get();
      const cost = state.maxInventorySlots * 100;
      if (state.score >= cost) {
          set({ score: state.score - cost, maxInventorySlots: state.maxInventorySlots + 5 });
          return true;
      }
      return false;
  },
  
  clearGachaResults: () => set({ gachaResults: [] }),

}));
