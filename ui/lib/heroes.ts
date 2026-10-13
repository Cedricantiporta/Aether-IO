import type { HeroClass } from '../../types';
import { HERO_STATS, ITEMS_POOL } from '../../constants';

export interface HeroMeta {
  title: string;
  tagline: string;
  tags: string[];
  weapon: string;
  abilities: { key: 'R' | 'Q' | 'E'; name: string; desc: string }[];
}

export const HERO_META: Record<HeroClass, HeroMeta> = {
  ARCHER: {
    title: 'Archer', tagline: 'Swift Marksman', tags: ['Ranged', 'Shoots on the move', 'Fragile'],
    weapon: ITEMS_POOL.find((i) => i.id === HERO_STATS.ARCHER.weaponId)?.name ?? 'Shortbow',
    abilities: [
      { key: 'R', name: "Hawk's Focus", desc: '10s of +60% attack speed and +40% damage; glowing arrows.' },
      { key: 'Q', name: 'Piercing Arrow', desc: 'Giant arrow that pierces everything.' },
      { key: 'E', name: 'Wind Sprint', desc: '2x speed & invincible for 4s.' },
    ],
  },
  WIZARD: {
    title: 'Wizard', tagline: 'Arcane Spellcaster', tags: ['Caster', 'Mana', 'Squishy'],
    weapon: ITEMS_POOL.find((i) => i.id === HERO_STATS.WIZARD.weaponId)?.name ?? 'Novice Staff',
    abilities: [
      { key: 'R', name: 'Giant Fireball', desc: 'Slow, devastating fireball.' },
      { key: 'Q', name: 'Gravity Well', desc: 'Summons a black hole.' },
      { key: 'E', name: 'Earthwall', desc: 'Defensive barrier for 4s.' },
    ],
  },
  BARBARIAN: {
    title: 'Barbarian', tagline: 'Unbreakable Warrior', tags: ['Melee', 'Tank', 'Regen'],
    weapon: ITEMS_POOL.find((i) => i.id === HERO_STATS.BARBARIAN.weaponId)?.name ?? 'Hand Axe',
    abilities: [
      { key: 'R', name: 'Axe Spin', desc: 'Spinning blade barrier.' },
      { key: 'Q', name: 'Rage', desc: 'Double attack speed for 4s.' },
      { key: 'E', name: 'War Vitality', desc: 'Regenerate 10 HP/s for 6s.' },
    ],
  },
};

export const HERO_ORDER: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN'];

/** Normalised (0..1) hero stats for menu bars. */
export function heroBars(h: HeroClass) {
  const s = HERO_STATS[h].stats;
  return [
    { label: 'HP', v: (s.maxHealth ?? 100) / 200, color: '#d6252b', raw: s.maxHealth ?? 100 },
    { label: 'DMG', v: (s.damage ?? 15) / 30, color: '#e9892f', raw: s.damage ?? 15 },
    { label: 'SPD', v: (s.moveSpeed ?? 10) / 16, color: '#4ade80', raw: s.moveSpeed ?? 10 },
    { label: 'MANA', v: (s.maxMana ?? 100) / 200, color: '#3b82f6', raw: s.maxMana ?? 100 },
  ];
}
