
import type { Item, PlayerStats, HeroClass, Upgrade, Rarity } from "./types";
import type { Difficulty } from "./storeTypes";
import { GENERATED_ITEMS } from "./itemCatalog";
import { EXTRA_PETS } from "./petsCatalog";

/** Legacy diameter of the playable area. The simulation uses ARENA_RADIUS from engine/world.ts. */
export const ARENA_SIZE = 136;
export const PLAYER_RADIUS = 0.8;
export const CAMERA_HEIGHT = 45;
export const INVENTORY_LIMIT = 50;
export const POTION_STACK_LIMIT = 50;
export const POTION_COOLDOWN = 10; // seconds, shared by engine + HUD

/** Shard conversion: 5 of a rarity -> 1 of the next; 1 -> 3 of the rarity below. */
export const MATERIAL_COMBINE_COST = 5;
export const MATERIAL_DOWNGRADE_YIELD = 3;
/** Hard cap on projectiles per shot from every source (Multicast cards, gear, pets). */
export const MULTISHOT_CAP = 5;
/** Hero rank needed to equip / craft gear of a rarity. */
export const RANK_REQ: Record<Rarity, number> = {
  COMMON: 1, RARE: 3, EPIC: 8, LEGENDARY: 15, MYTHIC: 25,
};

/** Per-difficulty multipliers (read by the director / enemies / combat). */
export const DIFFICULTY_MODS: Record<Difficulty, { hp: number; dmg: number; spawn: number; loot: number; label: string; desc: string }> = {
    EASY:      { hp: 0.7, dmg: 0.6,  spawn: 0.8,  loot: 0.9,  label: 'Easy',      desc: 'Weaker, fewer enemies. A relaxed run.' },
    NORMAL:    { hp: 1,   dmg: 1,    spawn: 1,    loot: 1,    label: 'Normal',    desc: 'The intended experience.' },
    HARD:      { hp: 1.4, dmg: 1.35, spawn: 1.2,  loot: 1.25, label: 'Hard',      desc: 'Tougher, more numerous enemies. Better loot.' },
    NIGHTMARE: { hp: 2,   dmg: 1.8,  spawn: 1.45, loot: 1.6,  label: 'Nightmare', desc: 'Brutal. Only for the strongest builds.' },
};

export const SHOP_POSITIONS: { type: 'SUPPLIES' | 'BLACKSMITH' | 'PETS'; position: [number, number, number]; color: string }[] = [
    { type: 'SUPPLIES', position: [-27, 0, 2], color: '#3b82f6' },
    { type: 'BLACKSMITH', position: [27, 0, 2], color: '#ef4444' },
    { type: 'PETS', position: [24, 0, 22], color: '#10b981' }
];

export const COLORS = {
  background: '#87CEEB', 
  ground: '#4ade80',     
  groundDark: '#166534', 
  
  player: '#2563eb', 
  
  enemySlime: '#65a30d', 
  enemyOrc: '#c2410c', 
  enemyBoss: '#ef4444', 
  enemyShooter: '#22c55e', 
  enemyElite: '#a855f7', 
  enemySpeedy: '#facc15', // Yellow for speedy
  enemyEliteShooter: '#ec4899', // Pink for elite shooter
  enemySlowShooter: '#14b8a6', // Teal for slow shooter
  
  bulletPlayer: '#f59e0b', 
  bulletEnemy: '#22c55e', 
  
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
        stats: { moveSpeed: 14, fireRate: 1.75, maxHealth: 80, damage: 12.2, knockback: 0.3, critRate: 0.1 }, 
        weaponId: 'bow_1',
        description: 'Shoots on the move. High Speed & Attack Rate (grows with level). Low Health.'
    },
    WIZARD: {
        stats: { moveSpeed: 10, maxMana: 200, damage: 30.5, maxHealth: 50, manaRegen: 3.0, knockback: 0.5, skillDamage: 1.5 },
        weaponId: 'staff_1',
        description: 'High Mana Regen & Skill Damage (grow with level). Squishy.'
    },
    BARBARIAN: {
        stats: { maxHealth: 140, defense: 15, moveSpeed: 11, damage: 14.6, fireRate: 1.05, knockback: 1.5, regen: 2.0 },
        weaponId: 'axe_1',
        description: 'High Defense & HP Regen. Health & damage grow with level. Tank.'
    }
};

// Skill Info for Shop
// type: 'ACTIVE' (Q) or 'PASSIVE' (Always on / Periodic)
export const SKILLS_INFO = {
    // Universal Passives
    regen: { name: 'Regeneration', description: 'Recover HP over time.', type: 'PASSIVE' },
    magnet: { name: 'Looter', description: 'Increases pickup range.', type: 'PASSIVE' },
    dash: { name: 'Class Dash', description: 'Your Space dash (Shadow Roll / Blink Nova / Shoulder Charge). Costs no mana. Reduces dash cooldown; level 5 grants +1 Dash Charge.', type: 'PASSIVE' },
    weapon: { name: 'Ultimate Mastery', description: 'Ultimate charge fills faster (+10% per level).', type: 'PASSIVE' },
    barrier: { name: 'Energy Shield', description: 'Saves you when a hit would drop you below 20% HP: brief invulnerability and a stunning shockwave.', type: 'PASSIVE' },
    
    // Archer Only
    burning: { name: 'Burning Arrow', description: 'On-attack: every Nth attack (12 at Lv1, -1 per level) fires a piercing fire arrow that burns. Alternates with Freezing Arrow.', classType: 'ARCHER', type: 'PASSIVE' },
    freezing: { name: 'Freezing Arrow', description: 'On-attack: every Nth attack (12 at Lv1, -1 per level) fires an ice arrow that heavily slows enemies. Alternates with Burning Arrow.', classType: 'ARCHER', type: 'PASSIVE' },
    
    // Wizard Only
    thunder: { name: 'Thundercaller', description: 'On-attack: every Nth magic bolt (12 at Lv1, -1 per level) also releases chain lightning (1 jump + 1 per level, moderate damage).', classType: 'WIZARD', type: 'PASSIVE' },
    freezeSpell: { name: 'Blizzard', description: 'Passive: A blizzard bursts around you, heavily slowing enemies in a medium area (radius 16).', classType: 'WIZARD', type: 'PASSIVE' },
    storm: { name: 'Storm', description: 'Passive: Summons a tornado in front of you that drifts toward enemies, pulling them in and dealing continuous damage for 3.5s.', classType: 'WIZARD', type: 'PASSIVE' },
    
    // Barbarian Only
    orbital: { name: 'Orbital Blades', description: 'Passive: 1 + level blades orbit and damage enemies, then launch outward.', classType: 'BARBARIAN', type: 'PASSIVE' },
    stamp: { name: 'Axe Storm', description: 'On-attack: every Nth axe throw (12 at Lv1, -1 per level) hurls 3 giant spinning axes in a fan. Each ricochets once off the first enemy or obstacle it hits, hits hard and breaks armor.', classType: 'BARBARIAN', type: 'PASSIVE' },
};

// REDUCED VALUES BY ~50%
export const UPGRADES_POOL: Upgrade[] = [
  { id: 'u_hp', type: 'HEALTH', name: 'Vitality Rune', description: 'Max HP Up', rarity: 'COMMON', value: 8 }, 
  { id: 'u_mana', type: 'MAX_MANA', name: 'Mana Crystal', description: 'Max Mana Up', rarity: 'COMMON', value: 10 },
  { id: 'u_def', type: 'DEFENSE', name: 'Iron Skin', description: 'Defense Up', rarity: 'COMMON', value: 3 },
  { id: 'u_spd', type: 'SPEED', name: 'Wind Step', description: 'Move Speed Up', rarity: 'COMMON', value: 0.05 },
  { id: 'u_dmg', type: 'DAMAGE', name: 'Sharpness', description: 'Damage Up', rarity: 'RARE', value: 0.13 },
  { id: 'u_fr', type: 'FIRE_RATE', name: 'Haste', description: 'Atk Speed Up', rarity: 'RARE', value: 0.1 },
  { id: 'u_multi', type: 'MULTISHOT', name: 'Multicast', description: 'Projectiles Up', rarity: 'LEGENDARY', value: 1 }, // +1 projectile per card, capped by MULTISHOT_CAP
  { id: 'u_dashcd', type: 'DASH_COOLDOWN', name: 'Shadow Step', description: 'Dash CD Down', rarity: 'RARE', value: 1 }, 
  { id: 'u_critr', type: 'CRIT_RATE', name: 'Precision', description: 'Crit Rate Up', rarity: 'RARE', value: 0.05 },
  { id: 'u_critd', type: 'CRIT_DAMAGE', name: 'Lethality', description: 'Crit Dmg Up', rarity: 'RARE', value: 0.25 },
  
  { id: 'u_mag', type: 'SKILL_MAGNET', name: 'Looter', description: 'Magnet Range Level Up', rarity: 'COMMON', value: 1 },
  { id: 'u_dash', type: 'SKILL_DASH', name: 'Agility Training', description: 'Class Dash Level Up', rarity: 'RARE', value: 1 }, 
  { id: 'u_wep', type: 'SKILL_WEAPON', name: 'Ability Mastery', description: 'Ability Level Up', rarity: 'EPIC', value: 1 },
  { id: 'u_bar', type: 'SKILL_BARRIER', name: 'Energy Shield', description: 'Shield Level Up', rarity: 'EPIC', value: 1 },

  // Class Specific
  { id: 'u_storm', type: 'SKILL_STORM', name: 'Storm', description: 'Storm Level Up', rarity: 'EPIC', value: 1, classType: 'WIZARD' },
  { id: 'u_orb', type: 'SKILL_ORBITAL', name: 'Orbitals', description: 'Level Up: +1 Blade', rarity: 'RARE', value: 1, classType: 'BARBARIAN' },
  { id: 'u_thun', type: 'SKILL_THUNDER', name: 'Thundercaller', description: 'Level Up: +1 Target', rarity: 'RARE', value: 1, classType: 'WIZARD' },

  { id: 'u_pierce', type: 'SKILL_PIERCING', name: 'Gale Arrow', description: 'Active (1) Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  { id: 'u_burn', type: 'SKILL_BURNING', name: 'Burning Arrow', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  { id: 'u_freeze', type: 'SKILL_FREEZING', name: 'Freezing Arrow', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'ARCHER' },
  
  { id: 'u_grav', type: 'SKILL_GRAVITY', name: 'Singularity', description: 'Active (1) Level Up', rarity: 'LEGENDARY', value: 1, classType: 'WIZARD' },
  { id: 'u_blizz', type: 'SKILL_FREEZE_SPELL', name: 'Blizzard', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'WIZARD' },
  
  { id: 'u_rage', type: 'SKILL_RAGE', name: 'Cross Slash', description: 'Active (1) Level Up', rarity: 'RARE', value: 1, classType: 'BARBARIAN' },
  { id: 'u_stamp', type: 'SKILL_STAMP', name: 'Axe Storm', description: 'Passive Level Up', rarity: 'EPIC', value: 1, classType: 'BARBARIAN' },
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
        id: 'pet_dragon', name: 'Gold Dragon', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 10000, level: 1, 
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
        id: 'pet_phoenix', name: 'Phoenix', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 12000, level: 1, 
        stats: { regen: 2.5, maxHealth: 100, fireRate: 0.1, damage: 20 }, // 4 Stats
        description: 'Revives you on death (300s CD).', petSkill: 'REVIVE', petCooldown: 300 
    },
    { 
        id: 'pet_demigod', name: 'Celestial Wisp', type: 'PET', rarity: 'MYTHIC', summonOnly: true, price: 25000, level: 1, 
        stats: { damage: 100, maxHealth: 300, moveSpeed: 0.5, cooldownReduction: 0.2, critRate: 0.2 }, // 5 Stats
        description: 'A fragment of a star.', petSkill: 'ATTACK_RANGED', petValue: 100 
    },
    ...EXTRA_PETS,
];

// ITEMS POOL: Stats follow 1 (Common) -> 2 (Rare) -> 3 (Epic) -> 4 (Legend) -> 5 (Mythic)
export const ITEMS_POOL: Item[] = [
  // --- CONSUMABLES ---
  { id: 'potion_hp', name: 'Health Potion', type: 'POTION', stats: {}, restoreAmount: 50, rarity: 'COMMON', price: 150, level: 1, description: 'Restores 50 HP.' },
  { id: 'potion_mana', name: 'Mana Potion', type: 'POTION', stats: {}, restoreAmount: 50, rarity: 'COMMON', price: 150, level: 1, description: 'Restores 50 Mana.' },
  // BIG POTIONS
  { id: 'potion_hp_big', name: 'Big Health Potion', type: 'POTION', stats: {}, restoreAmount: 75, rarity: 'RARE', price: 450, level: 1, description: 'Restores 75 HP.' },
  { id: 'potion_mana_big', name: 'Big Mana Potion', type: 'POTION', stats: {}, restoreAmount: 75, rarity: 'RARE', price: 450, level: 1, description: 'Restores 75 Mana.' },
  
  { id: 'upgrade_core', name: 'Upgrade Core', type: 'CORE', stats: {}, rarity: 'EPIC', price: 1000, level: 1, description: 'A rare arcane core used by the Blacksmith to upgrade gear.' },
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

  // --- HELMETS (1 Common .. 5 Mythic): health / defense / crit damage ---
  { id: 'helm_1', name: 'Leather Cap', type: 'HELMET', rarity: 'COMMON', price: 120, level: 1, stats: { maxHealth: 12 } },
  { id: 'helm_2', name: 'Iron Helm', type: 'HELMET', rarity: 'RARE', price: 550, level: 1, stats: { defense: 4, maxHealth: 15 } },
  { id: 'helm_3', name: "Ranger's Hood", type: 'HELMET', rarity: 'EPIC', price: 1300, level: 1, stats: { critDamage: 0.15, maxHealth: 30, critRate: 0.03 } },
  { id: 'helm_4', name: 'Dragonhorn Helm', type: 'HELMET', rarity: 'LEGENDARY', price: 2200, level: 1, stats: { defense: 10, maxHealth: 50, critDamage: 0.2 } },
  { id: 'helm_5', name: 'Crown of Aether', type: 'HELMET', rarity: 'MYTHIC', price: 4500, level: 1, stats: { defense: 16, maxHealth: 100, critDamage: 0.35, skillDamage: 0.15 } },

  // --- GLOVES: attack speed / crit rate / damage ---
  { id: 'gloves_1', name: 'Work Gloves', type: 'GLOVES', rarity: 'COMMON', price: 120, level: 1, stats: { fireRate: 0.1 } },
  { id: 'gloves_2', name: "Archer's Bracers", type: 'GLOVES', rarity: 'RARE', price: 560, level: 1, stats: { fireRate: 0.2, critRate: 0.02 } },
  { id: 'gloves_3', name: "Wizard's Mitts", type: 'GLOVES', rarity: 'EPIC', price: 1300, level: 1, stats: { skillDamage: 0.15, critRate: 0.04, fireRate: 0.15 } },
  { id: 'gloves_4', name: 'Berserker Gauntlets', type: 'GLOVES', rarity: 'LEGENDARY', price: 2200, level: 1, stats: { damage: 4, critRate: 0.06, fireRate: 0.3 } },
  { id: 'gloves_5', name: 'Titan Fists', type: 'GLOVES', rarity: 'MYTHIC', price: 4500, level: 1, stats: { damage: 8, critRate: 0.1, fireRate: 0.5, critDamage: 0.2 } },

  // --- BOOTS (Hermes Boots is the Rare tier): move speed / dodge / dash cooldown ---
  { id: 'boots_0', name: 'Traveler Boots', type: 'BOOTS', rarity: 'COMMON', price: 120, level: 1, stats: { moveSpeed: 0.15 } },
  { id: 'boots_3', name: 'Windrunner Boots', type: 'BOOTS', rarity: 'EPIC', price: 1300, level: 1, stats: { moveSpeed: 0.5, dodge: 0.05, dashCooldown: -0.3 } },
  { id: 'boots_4', name: 'Shadowstep Greaves', type: 'BOOTS', rarity: 'LEGENDARY', price: 2200, level: 1, stats: { moveSpeed: 0.7, dodge: 0.08, dashCooldown: -0.5 } },
  { id: 'boots_5', name: 'Aether Striders', type: 'BOOTS', rarity: 'MYTHIC', price: 4500, level: 1, stats: { moveSpeed: 1.0, dodge: 0.12, dashCooldown: -0.8 } },

  // --- ACCESSORIES (1 Stat Common, 2 Rare, 3 Epic, 4 Leg, 5 Mythic) ---
  { id: 'ring_1', name: 'Ring of Vitality', type: 'ACCESSORY', rarity: 'COMMON', price: 250, level: 1, 
    stats: { maxHealth: 25 } }, // HP Halved
  
  { id: 'boots_1', name: 'Hermes Boots', type: 'BOOTS', rarity: 'RARE', price: 600, level: 1, 
    stats: { moveSpeed: 0.3, dodge: 0.03 } },
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

// Generated variety (class weapon alternatives, armour flavours, class starter gear, item-set pieces).
ITEMS_POOL.push(...GENERATED_ITEMS);
