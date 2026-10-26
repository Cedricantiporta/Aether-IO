// New companion pets with unique abilities (ability logic lives in engine/systems/pets.ts).
import type { Item } from './types';

export const EXTRA_PETS: Item[] = [
  { id: 'pet_fox', name: 'Ember Fox', type: 'PET', rarity: 'UNCOMMON', price: 1100, level: 1,
    stats: { damage: 0.8, moveSpeed: 0.6 },
    description: 'Leaves a burning trail where it runs and ignites enemies it bites.', petSkill: 'FIRE_TRAIL', petValue: 14 },
  { id: 'pet_owl', name: 'Frost Owl', type: 'PET', rarity: 'UNCOMMON', price: 1100, level: 1,
    stats: { manaRegen: 1.0, cooldownReduction: 0.7 },
    description: 'Every 6s swoops at the strongest nearby enemy, chilling and slowing it.', petSkill: 'CHILL_SWOOP', petValue: 20, petCooldown: 6 },
  { id: 'pet_mimic', name: 'Mimic Chest', type: 'PET', rarity: 'EPIC', price: 3400, level: 1,
    stats: { damage: 0.8, maxHealth: 0.7, critDamage: 0.8 },
    description: 'Every 8s leaps at an enemy with a huge chomp that stuns it.', petSkill: 'CHOMP', petValue: 45, petCooldown: 8 },
  { id: 'pet_sprite', name: 'Storm Sprite', type: 'PET', rarity: 'RARE', price: 1800, level: 1,
    stats: { damage: 0.8, fireRate: 0.6, critRate: 0.6 },
    description: 'Every 4s zaps chain lightning through 3 enemies.', petSkill: 'CHAIN_ZAP', petValue: 30, petCooldown: 4 },
  { id: 'pet_turtle', name: 'Shield Turtle', type: 'PET', rarity: 'RARE', price: 1800, level: 1,
    stats: { defense: 1.0, maxHealth: 0.8, regen: 0.5 },
    description: 'Every 12s grants you a shield that absorbs damage.', petSkill: 'SHIELD', petValue: 60, petCooldown: 12 },
  { id: 'pet_shadowcat', name: 'Shadow Cat', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 11000, level: 1,
    stats: { damage: 0.8, critRate: 0.8, critDamage: 0.8, moveSpeed: 0.6 },
    description: 'Marks enemies and pounces on them. You deal +20% to marked targets.', petSkill: 'MARK', petValue: 30, petCooldown: 3 },
  { id: 'pet_crystal', name: 'Crystal Golemling', type: 'PET', rarity: 'LEGENDARY', summonOnly: true, price: 11500, level: 1,
    stats: { defense: 1.0, maxHealth: 0.9, knockback: 0.8, damage: 0.6 },
    description: 'Slams the ground every 7s, shattering the armor of enemies nearby.', petSkill: 'SLAM', petValue: 60, petCooldown: 7 },
  { id: 'pet_leviathan', name: 'Aether Leviathan', type: 'PET', rarity: 'MYTHIC', summonOnly: true, price: 28000, level: 1,
    stats: { damage: 1.0, maxHealth: 0.9, manaRegen: 0.8, cooldownReduction: 0.8, critRate: 0.8 },
    description: 'A sky serpent. Every 8s it sweeps a tidal beam across a line of enemies.', petSkill: 'TIDAL_BEAM', petValue: 90, petCooldown: 8 },
];
