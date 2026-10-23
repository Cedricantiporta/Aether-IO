
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

export type ArmorGroup = 'HEAVY' | 'LIGHT' | 'ARCANE';   // wear is shared by group: HEAVY = Knight + Barbarian, LIGHT = Archer + Necromancer, ARCANE = Wizard
export type HeroClass = 'ARCHER' | 'WIZARD' | 'BARBARIAN' | 'KNIGHT' | 'NECROMANCER';

export type UpgradeType = 
  'HEALTH' | 'SPEED' | 'DAMAGE' | 'FIRE_RATE' | 'MULTISHOT' | 'DASH_COOLDOWN' | 'DASH_CHARM' | 'POTION_CD' | 'MANA_COST' | 'ULT_CHARGE' |
  'SKILL_ORBITAL' | 'SKILL_THUNDER' | 'SKILL_REGEN' | 'SKILL_MAGNET' |
  'SKILL_DASH' | 'SKILL_WEAPON' | 'SKILL_BARRIER' |
  'SKILL_PIERCING' | 'SKILL_BURNING' | 'SKILL_FREEZING' | 
  'SKILL_FREEZE_SPELL' | 'SKILL_GRAVITY' | 'SKILL_STAMP' | 'SKILL_RAGE' | 'SKILL_STORM' | 'SKILL_WARCRY' | 'SKILL_INSPIRE' | 'SKILL_PIERCE_SHOT' | 'SKILL_HOLY_WAVE' | 'SKILL_CONSECRATE' | 'SKILL_SMITE' | 'SKILL_RADIANT' | 'SKILL_GRAVECALL' | 'SKILL_SOULHARVEST' | 'SKILL_BONEARMOR' |
  'CRIT_RATE' | 'CRIT_DAMAGE' | 'DEFENSE' | 'MAX_MANA' |
  'ULT_FILL' | 'RESTORE' | 'AEGIS' |
  'COOLDOWN' | 'KNOCKBACK' | 'LIFESTEAL' | 'DMG_REDUCE' | 'MANA_REGEN' | 'DEATH_DEFIANCE' | 'SPECIAL';   // instant cards: fill the ultimate, restore HP + MP, a damage-absorbing shield

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

/** Run-card special abilities (engine/runCards.ts): one of each per run, never stack. */
export type SpecialId = 'AFFLICT' | 'SUNDER' | 'GUARDIAN' | 'SLAYER' | 'ALCHEMIST' | 'EXECUTE' | 'FIRST_STRIKE' | 'SECOND_WIND' | 'GOLD_RUSH' | 'LINGER';

export interface Upgrade {
  id: string;
  /** rolled rarity tier 0..4 (COMMON..MYTHIC) for run cards; `value` already scales with it */
  tier?: number;
  special?: SpecialId;
  type: UpgradeType;
  name: string;
  description: string;
  rarity: Rarity;
  value: number;
  classType?: HeroClass; // Restrict upgrade to class
}

export type ProjectileType = 'MAGIC' | 'ARROW' | 'AXE' | 'SWORD' | 'FIREBALL' | 'ICE' | 'FIRE_TRAIL' | 'BLACKHOLE' | 'BURNING_ARROW' | 'FREEZING_ARROW' | 'PIERCING_ARROW' | 'STORM' | 'SOUL';   // SOUL: necromancer single-target soul bolt
export type AbilityType = 'METEOR' | 'ARROW_RAIN' | 'AXE_AURA' | 'FIREBALL' | 'AXE_SPIN' | 'NONE' | 'PIERCING_SHOT' | 'FREEZE_SPELL' | 'GRAVITY_SPELL' | 'MEGA_STAMP' | 'RAGE';
export type ItemType = 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'HELMET' | 'GLOVES' | 'BOOTS' | 'POTION' | 'CORE' | 'PET' | 'REVIVE' | 'LOOT' | 'SHARD' | 'ELIXIR' | 'CRYSTAL' | 'TOOL';
export type StatusEffectType = 'SLOW' | 'BURN' | 'STUN' | 'FREEZE' | 'POISON' | 'ARMOR_BREAK' | 'CHILL';
export type PetSkillType = 'HEAL' | 'ATTACK_RANGED' | 'ATTACK_MELEE' | 'COLLECT' | 'REVIVE' | 'FIRE_TRAIL' | 'CHILL_SWOOP' | 'LOOT_BURP' | 'LEECH' | 'CHOMP' | 'CHAIN_ZAP' | 'SHIELD' | 'MARK' | 'SLAM' | 'TIDAL_BEAM';

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
  // ---- affix / set / talent driven (all default 0)
  lifeSteal: number;        // fraction of damage dealt returned as HP
  minionDmg: number; minionLife: number; minionCount: number; minionHaste: number;   // Necromancer minions (talents)
  thorns: number;           // flat damage to nearby enemies when you are hit
  goldFind: number;         // +fraction gold from pickups
  xpBonus: number;          // +fraction xp gained
  stunBonus: number;        // +seconds on stuns/freezes you inflict
  burnStacks: number;       // +max burn stacks on enemies (base 3)
  backstab: number;         // +fraction extra backstab damage (base +30%)
  axeCount: number;         // Axe Storm: extra axes
  axeBounce: number;        // Axe Storm: extra ricochets
  axeSize: number;          // Axe Storm: +fraction axe size
  pierceBonus: number;      // extra pierce on basic projectiles
  attackRange: number;      // + units of basic attack / auto-target reach (archer: DEX, talents, bows, Eagle Eye lines)
  onHitBurnChance: number;  // chance on hit to ignite
  onHitSlowChance: number;  // chance on hit to slow
  echoEvery: number;        // every Nth attack fires twice (0 = off)
  hawkBonus: number;        // +seconds Storm of Arrows (archer ultimate)
  galeWidth: number;        // +fraction Gale Arrow width
  orbBonus: number;         // +Storm Orbs
  procHaste: number;        // on-attack procs need N fewer attacks
  thunderChain: number;     // +chain lightning targets
  stormBonus: number;       // +seconds typhoon lifetime
  avatarBonus: number;      // +seconds Divine Avatar (knight ultimate)
  stormTwin: number;        // 1 = typhoon spawns a second one
  blizzardRadius: number;   // +blizzard radius
  blizzFreeze: number;      // +seconds blizzard freeze
  stompRadius: number;      // +mega stomp radius
  stompStun: number;        // +seconds stomp stun
  stompPower: number;       // +fraction stomp damage
  dashCharges: number;      // +dash charges
  lowHpHaste: number;       // +fraction attack speed below 50% HP
  rageBonus: number;        // +seconds Rage
  dmgReduce: number;        // fraction of damage taken negated
  manaCostCut: number;      // fraction mana cost reduction
  berserk: number;          // +fraction damage below 35% HP
}

export interface ItemAffix { key: string; value: number; /** a perfect roll (125% of the tier value): shown in yellow */ perfect?: boolean; /** sealed by a Binding Seal: Reforge Stone / Tempering Oil skip this line */ locked?: boolean }
/** gear grade inside its rarity tier (grade.ts): HIGH = +35% base stats */
export type ItemGrade = 'LOW' | 'HIGH';

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
  classType?: HeroClass;   // weapons: the one class that wields it
  armorGroup?: ArmorGroup; // helmet / armor / gloves / boots: who can wear it (undefined = anyone)
  /** Newly looted / rewarded (not monster loot): a dot in the bag until the player looks at it. */
  isNew?: boolean;
  
  // Consumable Specifics
  restoreAmount?: number;

  // Pet Specifics
  petSkill?: PetSkillType;
  petValue?: number; // Heal amount or Dmg
  petCooldown?: number; 
  summonOnly?: boolean;
  /** old catalog piece: still valid in saves / by id, but no longer sold, dropped, summoned or crafted */
  retired?: boolean; // not sold in the Pets shop; Summon altar only
  petLv?: number;    // pet growth (see petGrowth.ts): level 1-20, xp into the level, evolution stage 1-3 (all default to 1 / 0 / 1)
  petXp?: number;
  petStage?: number;
  
  grade?: ItemGrade;       // gear only: LOW (default / old saves) or HIGH (grade.ts)
  affixes?: ItemAffix[];   // rolled bonus lines (gear only)
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
    // Active kit (hero specific meaning): Q, E, 3, 4 and the ultimate (R)
    q: number;
    e: number;
    s3: number;
    s4: number;
    ult: number;
    
    // Passive Skills
    burning: number;
    freezing: number;
    freezeSpell: number; // Renamed to Blizzard (Passive)
    stamp: number; // Renamed to Mega Stamp (Passive)
    warcry: number;  // Barbarian passive: periodic roar, +damage / +defense
    pierceShot: number; // Archer passive: a chance for a basic arrow to pierce on to the enemy behind (blue)
    inspire: number; // Archer passive: periodic rally, +attack speed / +damage
    consecrate: number; // Knight passive: holy aura damaging nearby enemies and healing a little
    smite: number;      // Knight passive: every N sword swings, holy light strikes the target area (damage + stun)
    radiant: number;
    graveCall: number;   // Necromancer passive: every Nth bolt raises a skeleton
    soulHarvest: number; // Necromancer passive: kills heal / restore mana
    boneArmor: number;   // Necromancer passive: damage reduction per minion    // Knight passive: periodic ring of holy crescents bursting outward
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
