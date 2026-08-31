
import { Item, PlayerStats, HeroClass, Upgrade, Rarity } from "./types";

export const ARENA_SIZE = 120; // Reduced from 300 for smaller, tighter map
export const MAX_BULLETS = 1000;
export const MAX_ENEMY_BULLETS = 500;
export const PLAYER_RADIUS = 0.8;
export const CAMERA_HEIGHT = 45;
export const INVENTORY_LIMIT = 50;
export const POTION_STACK_LIMIT = 50;

export const RARITY_LEVEL_REQ: Record<Rarity, number> = {
    'COMMON': 1,
    'RARE': 7,
    'EPIC': 14,
    'LEGENDARY': 21,
    'MYTHIC': 28
};

export const RECYCLE_YIELDS: Record<Rarity, number> = {
    'COMMON': 1,
    'RARE': 1,
    'EPIC': 1,
    'LEGENDARY': 1,
    'MYTHIC': 1
};

export const CRAFTING_COSTS: Record<Rarity, number> = {
    'COMMON': 3,
    'RARE': 3,
    'EPIC': 3,
    'LEGENDARY': 3,
    'MYTHIC': 3
};

export const MATERIAL_COMBINE_COST = 5; // 5 Common -> 1 Rare

export const SHOP_POSITIONS = [
    { type: 'SUPPLIES', position: [-24, 0, -18], color: '#3b82f6' },
    { type: 'BLACKSMITH', position: [-8, 0, -22], color: '#ef4444' },
    { type: 'PETS', position: [8, 0, -22], color: '#10b981' }
];

export const COLORS = {
  background: '#87CEEB', 
  ground: '#4a7a20',
  groundDark: '#3a5e18',
  
  player: '#2563eb', 
  
  enemySlime: '#65a30d', 
  enemyOrc: '#c2410c', 
  enemyBoss: '#ef4444', 
  enemyShooter: '#22c55e', 
  enemyElite: '#a855f7', 
  enemySpeedy: '#facc15', // Yellow for speedy
  enemyEliteShooter: '#ec4899', // Pink for elite shooter
  enemySlowShooter: '#14b8a6', // Teal for slow shooter
  
  bulletPlayer: '#22c55e', 
  bulletEnemy: '#facc15', 
  
  uiPrimary: '#f8fafc',
  uiPanel: '#1e293b', 
  uiAccent: '#fbbf24', 
  
  dropItem: '#ffffff', 
  dropHealth: '#ef4444',
  dropXp: '#3b82f6', 
  dropGem: '#10b981', 
  
  wood: '#78350f',
  tree: '#15803d', 
  rock: '#78716c',
  water: '#3b82f6',
  
  rarityCommon: '#ffffff',
  rarityRare: '#3b82f6',     
  rarityEpic: '#a855f7',     
  rarityLegendary: '#eab308', 
  rarityMythic: '#ef4444'    
};

export const HERO_STATS: Record<HeroClass, { stats: Partial<PlayerStats>, weaponId: string, description: string }> = {
    ARCHER: {
        stats: { moveSpeed: 14, fireRate: 2.5, maxHealth: 80, damage: 10, knockback: 0.3, critRate: 0.1 }, 
        weaponId: 'bow_1',
        description: 'High Speed & Attack Rate. Low Health.'
    },
    WIZARD: {
        stats: { moveSpeed: 10, maxMana: 200, damage: 25, maxHealth: 70, manaRegen: 3.0, knockback: 0.5, skillDamage: 1.5 },
        weaponId: 'staff_1',
        description: 'High Mana Regen & Skill Damage. Squishy.'
    },
    BARBARIAN: {
        stats: { maxHealth: 200, defense: 15, moveSpeed: 11, damage: 12, fireRate: 1.5, knockback: 1.5, regen: 2.0 },
        weaponId: 'axe_1',
        description: 'High Defense & HP Regen. Tank.'
    }
};

// Skill Info for Shop
// type: 'ACTIVE' (Q) or 'PASSIVE' (Always on / Periodic)
export const SKILLS_INFO = {
    // Universal Passives
    regen: { name: 'Regeneration', description: 'Recover HP over time.', type: 'PASSIVE' },
    magnet: { name: 'Looter', description: 'Increases pickup range.', type: 'PASSIVE' },
    dash: { name: 'Dash Mastery', description: 'Reduces dash cooldown. Level 5 grants +1 Dash Charge.', type: 'PASSIVE' },
    weapon: { name: 'Weapon Mastery', description: 'Improves weapon ability cooldown.', type: 'PASSIVE' },
    barrier: { name: 'Energy Shield', description: 'Grants temporary invulnerability and knockback when hit.', type: 'PASSIVE' },
    
    // Class Special (E)
    special: { name: 'Class Special (E)', description: 'Unlocks your unique Class Ability. Costs 5 SP.', type: 'ACTIVE' },

    // Archer Only
    piercing: { name: 'Piercing Arrow', description: 'Active (Q): Giant piercing arrow.', classType: 'ARCHER', type: 'ACTIVE' },
    poison: { name: 'Poison Arrow', description: 'Passive: Periodically fires explosive poison arrows.', classType: 'ARCHER', type: 'PASSIVE' },
    freezing: { name: 'Freezing Arrow', description: 'Passive: Periodically fires explosive ice arrows.', classType: 'ARCHER', type: 'PASSIVE' },
    
    // Wizard Only
    thunder: { name: 'Thundercaller', description: 'Passive: Strikes random enemies with lightning.', classType: 'WIZARD', type: 'PASSIVE' },
    gravity: { name: 'Gravity Well', description: 'Active (Q): Summon a black hole.', classType: 'WIZARD', type: 'ACTIVE' },
    freezeSpell: { name: 'Blizzard', description: 'Passive: Freezes enemies in large area.', classType: 'WIZARD', type: 'PASSIVE' },
    storm: { name: 'Storm', description: 'Passive: Summons a bouncing typhoon.', classType: 'WIZARD', type: 'PASSIVE' },
    
    // Barbarian Only
    orbital: { name: 'Orbital Blades', description: 'Passive: Blades orbit and damage enemies.', classType: 'BARBARIAN', type: 'PASSIVE' },
    rage: { name: 'Rage', description: 'Active (Q): Double Attack Speed for 4s.', classType: 'BARBARIAN', type: 'ACTIVE' },
    stamp: { name: 'Mega Stamp', description: 'Passive: Periodically creates a stunning shockwave.', classType: 'BARBARIAN', type: 'PASSIVE' },
};

// REDUCED VALUES BY ~50%
export const UPGRADES_POOL: Upgrade[] = [
  { id: 'u_hp', type: 'HEALTH', name: 'Vitality Rune', description: 'Max HP Up', rarity: 'COMMON', value: 8 }, 
  { id: 'u_mana', type: 'MAX_MANA', name: 'Mana Crystal', description: 'Max Mana Up', rarity: 'COMMON', value: 10 },
  { id: 'u_def', type: 'DEFENSE', name: 'Iron Skin', description: 'Defense Up', rarity: 'COMMON', value: 3 },
  { id: 'u_spd', type: 'SPEED', name: 'Wind Step', description: 'Move Speed Up', rarity: 'COMMON', value: 0.05 },
  { id: 'u_dmg', type: 'DAMAGE', name: 'Sharpness', description: 'Damage Up', rarity: 'RARE', value: 0.13 },
  { id: 'u_fr', type: 'FIRE_RATE', name: 'Haste', description: 'Atk Speed Up', rarity: 'RARE', value: 0.1 },
  { id: 'u_multi', type: 'MULTISHOT', name: 'Multicast', description: 'Projectiles Up', rarity: 'LEGENDARY', value: 0.5 }, // Accumulates to 1 every 2 upgrades
  { id: 'u_dashcd', type: 'DASH_COOLDOWN', name: 'Shadow Step', description: 'Dash CD Down', rarity: 'RARE', value: 1 }, 
  { id: 'u_critr', type: 'CRIT_RATE', name: 'Precision', description: 'Crit Rate Up', rarity: 'RARE', value: 0.05 },
  { id: 'u_critd', type: 'CRIT_DAMAGE', name: 'Lethality', description: 'Crit Dmg Up', rarity: 'RARE', value: 0.25 },
  
  { id: 'u_mag', type: 'SKILL_MAGNET', name: 'Looter', description: 'Magnet Range Level Up', rarity: 'COMMON', value: 1 },
  { id: 'u_dash', type: 'SKILL_DASH', name: 'Agility Training', description: 'Dash Level Up', rarity: 'RARE', value: 1 }, 
  { id: 'u_wep', type: 'SKILL_WEAPON', name: 'Ability Mastery', description: 'Ability Level Up', rarity: 'EPIC', value: 1 },
  { id: 'u_bar', type: 'SKILL_BARRIER', name: 'Energy Shield', description: 'Shield Level Up', rarity: 'EPIC', value: 1 },

  // Class Specific
  { id: 'u_storm', type: 'SKILL_STORM', name: 'Storm', description: 'Storm Level Up', rarity: 'EPIC', value: 1, classType: 'WIZARD' },
  { id: 'u_orb', type: 'SKILL_ORBITAL', name: 'Orbitals', description: 'Level Up: +1 Blade', rarity: 'RARE', value: 1, classType: 'BARBARIAN' },
  { id: 'u_thun', type: 'SKILL_THUNDER', name: 'Thundercaller', description: 'Level Up: +1 Target', rarity: 'RARE', value: 1, classType: 'WIZARD' },

  { id: 'u_pierce', type: 'SKILL_PIERCING', name: 'Piercing Arrow', description: 'Active (Q) Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  { id: 'u_burn', type: 'SKILL_POISON', name: 'Poison Arrow', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  { id: 'u_freeze', type: 'SKILL_FREEZING', name: 'Freezing Arrow', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  
  { id: 'u_grav', type: 'SKILL_GRAVITY', name: 'Gravity Spell', description: 'Active (Q) Level Up', rarity: 'LEGENDARY', value: 1, classType: 'WIZARD' },
  { id: 'u_blizz', type: 'SKILL_FREEZE_SPELL', name: 'Blizzard', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'WIZARD' },
  
  { id: 'u_rage', type: 'SKILL_RAGE', name: 'Rage', description: 'Active (Q) Level Up', rarity: 'RARE', value: 1, classType: 'BARBARIAN' },
  { id: 'u_stamp', type: 'SKILL_STAMP', name: 'Mega Stamp', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'BARBARIAN' },
];

// PETS POOL: Stats follow 1 (Common) -> 2 (Rare) -> 3 (Epic) -> 4 (Legend) -> 5 (Mythic)
export const PETS_POOL: Item[] = [
    { 
        id: 'pet_blob', name: 'Green Blob', type: 'PET', rarity: 'COMMON', price: 500, level: 1, 
        stats: { maxHealth: 20 }, // 1 Stat
        description: 'Heals 10 HP every 5s.', petSkill: 'HEAL', petValue: 10, petCooldown: 5 
    },
    { 
        id: 'pet_bat', name: 'Vampire Bat', type: 'PET', rarity: 'COMMON', price: 500, level: 1, 
        stats: { damage: 5 }, // 1 Stat
        description: 'Collects distant items.', petSkill: 'COLLECT' 
    },
    { 
        id: 'pet_fairy', name: 'Light Fairy', type: 'PET', rarity: 'RARE', price: 1500, level: 1, 
        stats: { manaRegen: 0.5, regen: 0.5 }, // 2 Stats
        description: 'Heals 20 HP every 8s.', petSkill: 'HEAL', petValue: 20, petCooldown: 8 
    },
    { 
        id: 'pet_wolf', name: 'Spirit Wolf', type: 'PET', rarity: 'EPIC', price: 3000, level: 1, 
        stats: { critRate: 0.1, moveSpeed: 0.1, damage: 15 }, // 3 Stats
        description: 'Attacks nearby enemies.', petSkill: 'ATTACK_MELEE', petValue: 20 
    },
    { 
        id: 'pet_dragon', name: 'Gold Dragon', type: 'PET', rarity: 'LEGENDARY', price: 10000, level: 1, 
        stats: { damage: 50, multishot: 1, critDamage: 0.5, fireRate: 0.2 }, // 4 Stats
        description: 'Shoots fireballs.', petSkill: 'ATTACK_RANGED', petValue: 40 
    },
    { 
        id: 'pet_rock', name: 'Pet Rock', type: 'PET', rarity: 'COMMON', price: 500, level: 1, 
        stats: { defense: 10 }, // 1 Stat
        description: 'It does nothing, but it is hard.', petSkill: undefined 
    },
    { 
        id: 'pet_golem', name: 'Iron Golem', type: 'PET', rarity: 'EPIC', price: 3500, level: 1, 
        stats: { maxHealth: 100, defense: 20, knockback: 1.0 }, // 3 Stats
        description: 'Attacks enemies slowly.', petSkill: 'ATTACK_MELEE', petValue: 50 
    },
    { 
        id: 'pet_phoenix', name: 'Phoenix', type: 'PET', rarity: 'LEGENDARY', price: 12000, level: 1, 
        stats: { regen: 2.5, maxHealth: 100, fireRate: 0.1, damage: 20 }, // 4 Stats
        description: 'Revives you on death (300s CD).', petSkill: 'REVIVE', petCooldown: 300 
    },
    { 
        id: 'pet_demigod', name: 'Celestial Wisp', type: 'PET', rarity: 'MYTHIC', price: 25000, level: 1, 
        stats: { damage: 100, maxHealth: 300, moveSpeed: 0.5, cooldownReduction: 0.2, critRate: 0.2 }, // 5 Stats
        description: 'A fragment of a star.', petSkill: 'ATTACK_RANGED', petValue: 100 
    },
];

// ITEMS POOL: Stats follow 1 (Common) -> 2 (Rare) -> 3 (Epic) -> 4 (Legend) -> 5 (Mythic)
export const ITEMS_POOL: Item[] = [
  // --- CONSUMABLES ---
  { id: 'potion_hp', name: 'Health Potions (x10)', type: 'POTION', stats: {}, restoreAmount: 100, rarity: 'COMMON', price: 500, level: 1, description: 'Restores 100 HP. (Bundle of 10)' },
  { id: 'potion_mana', name: 'Mana Potions (x10)', type: 'POTION', stats: {}, restoreAmount: 100, rarity: 'COMMON', price: 500, level: 1, description: 'Restores 100 Mana. (Bundle of 10)' },
  
  { id: 'upgrade_core', name: 'Upgrade Core', type: 'CORE', stats: {}, rarity: 'RARE', price: 500, level: 1, description: 'Used for upgrades.' },
  { id: 'revive_ankh', name: 'Ankh of Life', type: 'REVIVE', stats: {}, rarity: 'EPIC', price: 2000, level: 1, description: 'Auto-revive on death.' },

  // --- WEAPONS (1 Stat Common, 2 Rare, 3 Epic, 4 Leg, 5 Mythic) ---
  { id: 'staff_1', name: 'Novice Staff', classType: 'WIZARD', type: 'WEAPON', rarity: 'COMMON', price: 100, level: 1, projectileType: 'MAGIC', ability: 'FIREBALL', 
    stats: { damage: 15 }, description: 'Basic magic.' },
  { id: 'bow_1', name: 'Shortbow', classType: 'ARCHER', type: 'WEAPON', rarity: 'COMMON', price: 100, level: 1, projectileType: 'ARROW', ability: 'ARROW_RAIN', 
    stats: { damage: 8 }, description: 'Basic bow.' },
  { id: 'axe_1', name: 'Hand Axe', classType: 'BARBARIAN', type: 'WEAPON', rarity: 'COMMON', price: 100, level: 1, projectileType: 'AXE', ability: 'AXE_SPIN', 
    stats: { damage: 18 }, description: 'Basic axe.' },
  
  // RARE (2 Stats)
  { id: 'staff_rare', name: 'Adept Staff', classType: 'WIZARD', type: 'WEAPON', rarity: 'RARE', price: 600, level: 1, projectileType: 'MAGIC', ability: 'FIREBALL', 
    stats: { damage: 25, manaRegen: 1.0 }, description: 'Balanced magic.' },
  { id: 'bow_2', name: 'Elven Bow', classType: 'ARCHER', type: 'WEAPON', rarity: 'RARE', price: 600, level: 1, projectileType: 'ARROW', ability: 'ARROW_RAIN', 
    stats: { damage: 15, fireRate: 0.2 }, onHitEffect: { type: 'POISON', duration: 4, value: 3, chance: 1.0 }, description: 'Poison arrows.' },
  { id: 'axe_2', name: 'Viking Axe', classType: 'BARBARIAN', type: 'WEAPON', rarity: 'RARE', price: 600, level: 1, projectileType: 'AXE', ability: 'AXE_SPIN', 
    stats: { damage: 35, knockback: 1.0 }, onHitEffect: { type: 'STUN', duration: 1.0, chance: 0.25 }, description: 'Stunning blows.' },

  // EPIC (3 Stats)
  { id: 'staff_3', name: 'Inferno Rod', classType: 'WIZARD', type: 'WEAPON', rarity: 'EPIC', price: 1500, level: 1, projectileType: 'MAGIC', ability: 'FIREBALL', 
    stats: { damage: 60, critRate: 0.1, skillDamage: 0.2 }, description: 'High Crit Magic.' },
  { id: 'bow_epic', name: 'Composite Bow', classType: 'ARCHER', type: 'WEAPON', rarity: 'EPIC', price: 1500, level: 1, projectileType: 'ARROW', ability: 'ARROW_RAIN', 
    stats: { damage: 30, fireRate: 0.5, critDamage: 0.5 }, description: 'Fast and deadly.' },
  { id: 'axe_epic', name: 'Double Axe', classType: 'BARBARIAN', type: 'WEAPON', rarity: 'EPIC', price: 1500, level: 1, projectileType: 'AXE', ability: 'AXE_SPIN', 
    stats: { damage: 70, defense: 10, maxHealth: 25 }, description: 'Tanky weapon.' }, // HP Halved

  // LEGENDARY (4 Stats)
  { id: 'bow_legend', name: 'Windforce', classType: 'ARCHER', type: 'WEAPON', rarity: 'LEGENDARY', price: 3000, level: 1, projectileType: 'ARROW', ability: 'ARROW_RAIN', 
    stats: { damage: 50, fireRate: 1.0, critRate: 0.2, knockback: 2.0 }, onHitEffect: { type: 'SLOW', duration: 3, value: 0.7, chance: 1.0 }, description: 'Knockback king.' },
  { id: 'staff_legend', name: 'Archon Staff', classType: 'WIZARD', type: 'WEAPON', rarity: 'LEGENDARY', price: 3000, level: 1, projectileType: 'MAGIC', ability: 'FIREBALL', 
    stats: { damage: 120, manaRegen: 3.0, skillDamage: 0.5, cooldownReduction: 0.1 }, description: 'Spell spam.' },
  { id: 'axe_legend', name: 'World Breaker', classType: 'BARBARIAN', type: 'WEAPON', rarity: 'LEGENDARY', price: 3000, level: 1, projectileType: 'AXE', ability: 'AXE_SPIN', 
    stats: { damage: 150, defense: 30, maxHealth: 50, regen: 2.0 }, description: 'Unstoppable.' }, // HP Halved

  // MYTHIC (5 Stats)
  { id: 'staff_god', name: 'Staff of Aether', classType: 'WIZARD', type: 'WEAPON', rarity: 'MYTHIC', price: 5000, level: 1, projectileType: 'MAGIC', ability: 'FIREBALL', 
    stats: { damage: 200, critRate: 0.3, critDamage: 1.0, skillDamage: 1.0, cooldownReduction: 0.2 }, description: 'Godly Power' },
  { id: 'bow_god', name: 'Apollo Bow', classType: 'ARCHER', type: 'WEAPON', rarity: 'MYTHIC', price: 5000, level: 1, projectileType: 'ARROW', ability: 'ARROW_RAIN', 
    stats: { damage: 100, fireRate: 2.0, critRate: 0.4, critDamage: 1.0, moveSpeed: 0.5 }, description: 'Rain of Destruction' },
  { id: 'axe_god', name: 'Titan Killer', classType: 'BARBARIAN', type: 'WEAPON', rarity: 'MYTHIC', price: 5000, level: 1, projectileType: 'AXE', ability: 'AXE_SPIN', 
    stats: { damage: 300, maxHealth: 250, defense: 60, regen: 5.0, knockback: 3.0 }, description: 'Slays immortals.' }, // HP Halved

  // --- ARMORS (1 Stat Common, 2 Rare, 3 Epic, 4 Leg, 5 Mythic) ---
  { id: 'armor_1', name: 'Leather Vest', type: 'ARMOR', rarity: 'COMMON', price: 100, level: 1, 
    stats: { maxHealth: 15 } }, // HP Halved
  { id: 'armor_2', name: 'Chainmail', type: 'ARMOR', rarity: 'COMMON', price: 150, level: 1, 
    stats: { defense: 5 } },
  
  { id: 'armor_elven', name: 'Elven Tunic', type: 'ARMOR', rarity: 'RARE', price: 600, level: 1, 
    stats: { maxHealth: 25, moveSpeed: 0.1 } }, // HP Halved
  { id: 'armor_3', name: 'Plate Armor', type: 'ARMOR', rarity: 'RARE', price: 600, level: 1, 
    stats: { defense: 15, maxHealth: 25 } }, // HP Halved

  { id: 'armor_obsidian', name: 'Obsidian Plate', type: 'ARMOR', rarity: 'EPIC', price: 1500, level: 1, 
    stats: { defense: 25, maxHealth: 50, critRate: 0.05 } }, // HP Halved
  
  { id: 'armor_4', name: 'Dragon Scale', type: 'ARMOR', rarity: 'LEGENDARY', price: 2000, level: 1, 
    stats: { defense: 40, maxHealth: 100, regen: 1.0, critDamage: 0.2 } }, // HP Halved
  
  { id: 'armor_5', name: 'Void Plate', type: 'ARMOR', rarity: 'MYTHIC', price: 5000, level: 1, 
    stats: { defense: 80, maxHealth: 250, regen: 3.0, cooldownReduction: 0.1, damage: 20 } }, // HP Halved

  // --- ACCESSORIES (1 Stat Common, 2 Rare, 3 Epic, 4 Leg, 5 Mythic) ---
  { id: 'ring_1', name: 'Ring of Vitality', type: 'ACCESSORY', rarity: 'COMMON', price: 250, level: 1, 
    stats: { maxHealth: 25 } }, // HP Halved
  
  { id: 'boots_1', name: 'Hermes Boots', type: 'ACCESSORY', rarity: 'RARE', price: 600, level: 1, 
    stats: { moveSpeed: 0.1, dodge: 0.05 } }, // dodge treated as defense visual or mechanic later, purely stat for now
  { id: 'amulet_mana', name: 'Mana Amulet', type: 'ACCESSORY', rarity: 'RARE', price: 800, level: 1, 
    stats: { manaRegen: 1.0, maxMana: 50 } },

  { id: 'ring_wiz', name: 'Wizard Ring', type: 'ACCESSORY', rarity: 'EPIC', price: 1200, level: 1, 
    stats: { skillDamage: 0.3, manaRegen: 1.5, maxMana: 100 } },
  { id: 'focus_crystal', name: 'Focus Crystal', type: 'ACCESSORY', rarity: 'EPIC', price: 1200, level: 1, 
    stats: { cooldownReduction: 0.15, skillDamage: 0.2, critRate: 0.05 } },

  { id: 'ring_crit', name: 'Skull Ring', type: 'ACCESSORY', rarity: 'LEGENDARY', price: 1500, level: 1, 
    stats: { critRate: 0.15, critDamage: 1.0, damage: 30, defense: -10 } },
  
  { id: 'ring_myth', name: 'Omni Ring', type: 'ACCESSORY', rarity: 'MYTHIC', price: 5000, level: 1, 
    stats: { damage: 50, moveSpeed: 0.2, cooldownReduction: 0.2, skillDamage: 0.5, defense: 30 } },
];
