
export enum GameStatus {
  MENU = 'MENU',
  HERO_SELECT = 'HERO_SELECT',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  LEVEL_UP = 'LEVEL_UP',
  GAME_OVER = 'GAME_OVER',
  INVENTORY = 'INVENTORY',
  SHOP = 'SHOP',
}

export type HeroClass = 'ARCHER' | 'WIZARD' | 'BARBARIAN';

export type UpgradeType = 
  'HEALTH' | 'SPEED' | 'DAMAGE' | 'FIRE_RATE' | 'MULTISHOT' | 'DASH_COOLDOWN' |
  'SKILL_ORBITAL' | 'SKILL_THUNDER' | 'SKILL_REGEN' | 'SKILL_MAGNET' |
  'SKILL_DASH' | 'SKILL_WEAPON' | 'SKILL_BARRIER' |
  'SKILL_PIERCING' | 'SKILL_BURNING' | 'SKILL_FREEZING' | 
  'SKILL_FREEZE_SPELL' | 'SKILL_GRAVITY' | 'SKILL_STAMP' | 'SKILL_RAGE' | 'SKILL_STORM' |
  'CRIT_RATE' | 'CRIT_DAMAGE' | 'DEFENSE' | 'MAX_MANA';

export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export interface Upgrade {
  id: string;
  type: UpgradeType;
  name: string;
  description: string;
  rarity: Rarity;
  value: number;
  classType?: HeroClass; // Restrict upgrade to class
}

export type ProjectileType = 'MAGIC' | 'ARROW' | 'AXE' | 'FIREBALL' | 'ICE' | 'FIRE_TRAIL' | 'BLACKHOLE' | 'BURNING_ARROW' | 'FREEZING_ARROW' | 'PIERCING_ARROW' | 'STORM';
export type AbilityType = 'METEOR' | 'ARROW_RAIN' | 'AXE_AURA' | 'FIREBALL' | 'AXE_SPIN' | 'NONE' | 'PIERCING_SHOT' | 'FREEZE_SPELL' | 'GRAVITY_SPELL' | 'MEGA_STAMP' | 'RAGE';
export type ItemType = 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'POTION' | 'CORE' | 'PET' | 'REVIVE';
export type StatusEffectType = 'SLOW' | 'BURN' | 'STUN' | 'FREEZE' | 'POISON';
export type PetSkillType = 'HEAL' | 'ATTACK_RANGED' | 'ATTACK_MELEE' | 'COLLECT' | 'REVIVE';

export interface PlayerStats {
  maxHealth: number;
  maxMana: number;
  regen: number; 
  manaRegen: number; 
  moveSpeed: number;
  damage: number;
  fireRate: number; 
  projectileSpeed: number;
  multishot: number;
  spread: number;
  dashCooldown: number;
  cooldownReduction: number; 
  magnetRadius: number;
  critRate: number; 
  critDamage: number; 
  defense: number; 
  skillDamage: number; 
  knockback: number; 
  dodge: number;
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  stats: Partial<PlayerStats>; 
  rarity: Rarity;
  price: number;
  level: number;
  projectileType?: ProjectileType;
  ability?: AbilityType;
  description?: string;
  stackSize?: number; 
  quantity?: number; 
  classType?: HeroClass; 
  
  // Consumable Specifics
  restoreAmount?: number;

  // Pet Specifics
  petSkill?: PetSkillType;
  petValue?: number; // Heal amount or Dmg
  petCooldown?: number; 
  
  setName?: string;
  setBonus?: string; 
  setBonusStats?: Partial<PlayerStats>;

  onHitEffect?: {
      type: StatusEffectType;
      duration: number;
      value?: number; 
      chance?: number; 
  };
}

export interface ActionResult {
    type: 'UPGRADE' | 'CRAFT';
    success: boolean;
    item?: Item;
    message: string;
}

export interface SkillLevels {
    orbital: number;
    thunder: number;
    regen: number;
    magnet: number;
    dash: number;
    weapon: number;
    barrier: number;
    storm: number;
    special: number; // E Skill (Class Specific)
    
    // Active Skills (Q)
    piercing: number;
    gravity: number;
    rage: number;
    
    // Passive Skills
    burning: number;
    freezing: number;
    freezeSpell: number; // Renamed to Blizzard (Passive)
    stamp: number; // Renamed to Mega Stamp (Passive)
}

export interface GameNotification {
    id: string;
    message: string;
    color: string;
    type: 'ITEM' | 'BOSS' | 'SYSTEM' | 'WARNING';
    action?: {
        label: string;
        onClick: () => void;
    };
}

export interface GameStatistics {
    totalRuns: number;
    highestWave: number;
    highestCP: number;
    bestRunClass: HeroClass | null;
    classRuns: Record<HeroClass, number>;
    classHighestWave: Record<HeroClass, number>;
}
