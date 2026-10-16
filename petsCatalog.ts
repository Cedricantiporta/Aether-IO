// New companion pets with unique abilities (ability logic lives in engine/systems/pets.ts).
import type { Item } from './types';

export const EXTRA_PETS: Item[] = [
  { id: 'pet_fox', name: 'Ember Fox', type: 'PET', rarity: 'UNCOMMON', price: 1100, level: 1,
    stats: { damage: 8, moveSpeed: 0.1 },
    description: 'Leaves a burning trail where it runs and ignites enemies it bites.', petSkill: 'FIRE_TRAIL', petValue: 14 },
  { id: 'pet_owl', name: 'Frost Owl', type: 'PET', rarity: 'UNCOMMON', price: 1100, level: 1,
    stats: { manaRegen: 0.6, cooldownReduction: 0.05 },
    description: 'Every 6s swoops at the strongest nearby enemy, chilling and slowing it.', petSkill: 'CHILL_SWOOP', petValue: 20, petCooldown: 6 },
  { id: 'pet_mimic', name: 'Mimic Chest', type: 'PET', rarity: 'EPIC', price: 3400, level: 1,
    stats: { goldFind: 0.1, maxHealth: 40, damage: 10 },
    description: 'Bites enemies and sometimes burps up gold during waves.', petSkill: 'LOOT_BURP', petValue: 18, petCooldown: 9 },
  { id: 'pet_sprite', name: 'Storm Sprite', type: 'PET', rarity: 'RARE', price: 1800, level: 1,
    stats: { damage: 14, fireRate: 0.1, critRate: 0.05 },
    description: 'Every 4s zaps chain lightning through 3 enemies.', petSkill: 'CHAIN_ZAP', petValue: 30, petCooldown: 4 },
  { id: 'pet_turtle', name: 'Shield Turtle', type: 'PET', rarity: 'RARE', price: 1800, level: 1,
    stats: { defense: 18, maxHealth: 80, regen: 1 },
    description: 'Every 12s grants you a shield that absorbs damage.', petSkill: 'SHIELD', petValue: 60, petCooldown: 12 },
  { id: 'pet_shadowcat', name: 'Shadow Cat', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 11000, level: 1,
    stats: { critRate: 0.1, critDamage: 0.3, moveSpeed: 0.15, damage: 25 },
    description: 'Marks enemies and pounces on them. You deal +20% to marked targets.', petSkill: 'MARK', petValue: 30, petCooldown: 3 },
  { id: 'pet_crystal', name: 'Crystal Golemling', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 11500, level: 1,
    stats: { defense: 25, maxHealth: 150, knockback: 0.5, damage: 20 },
    description: 'Slams the ground every 7s, shattering the armor of enemies nearby.', petSkill: 'SLAM', petValue: 60, petCooldown: 7 },
  { id: 'pet_leviathan', name: 'Aether Leviathan', type: 'PET', rarity: 'MYTHIC', summonOnly: true, price: 28000, level: 1,
    stats: { damage: 90, maxHealth: 250, manaRegen: 1, cooldownReduction: 0.15, critRate: 0.15 },
    description: 'A sky serpent. Every 8s it sweeps a tidal beam across a line of enemies.', petSkill: 'TIDAL_BEAM', petValue: 90, petCooldown: 8 },
];
