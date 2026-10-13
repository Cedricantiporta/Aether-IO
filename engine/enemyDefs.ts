// ============================================================================
// Enemy archetype table + wave scaling formulas (pure data, no side effects).
// Base numbers are for wave 1 / NORMAL difficulty; spawnEnemy() applies the
// scaling helpers below.
// ============================================================================
import type { EnemyKind } from './types';

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;            // units / second
  radius: number;           // collision radius (already includes visual scale)
  scale: number;            // visual scale multiplier for the render layer
  contactDamage: number;    // melee hit (0 = none)
  projectileDamage: number; // projectile / explosion damage (0 = none)
  xp: number;
  gold: number;
  cost: number;             // spawn budget points
  minWave: number;
  weight: number;           // relative pick weight among eligible kinds
  color: number;            // hex, render tint / minimap
  knockResist: number;      // 0 = full knockback, 1 = immune
  armor: number;            // damage taken x 100/(100+armor); elites/bosses scale it up in spawnEnemy
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  SLIME: {
    name: 'Slime', hp: 15, speed: 3.2, radius: 0.7, scale: 1, contactDamage: 7, projectileDamage: 0,
    xp: 4, gold: 1, cost: 1, minWave: 1, weight: 10, color: 0x65a30d, knockResist: 0, armor: 0,
  },
  GOBLIN: {
    name: 'Goblin', hp: 40, speed: 4.0, radius: 0.6, scale: 1, contactDamage: 9, projectileDamage: 0,
    xp: 5, gold: 2, cost: 1.5, minWave: 1, weight: 10, color: 0xc2410c, knockResist: 0, armor: 5,
  },
  BAT: {
    name: 'Cave Bat', hp: 20, speed: 8.0, radius: 0.45, scale: 0.8, contactDamage: 5, projectileDamage: 0,
    xp: 3, gold: 1, cost: 1, minWave: 2, weight: 6, color: 0x7c3aed, knockResist: 0, armor: 0,
  },
  SKELETON_ARCHER: {
    name: 'Skeleton Archer', hp: 35, speed: 2.2, radius: 0.6, scale: 1, contactDamage: 4, projectileDamage: 10,
    xp: 8, gold: 3, cost: 3, minWave: 3, weight: 7, color: 0xe5e7eb, knockResist: 0, armor: 5,
  },
  CULTIST: {
    name: 'Cultist', hp: 45, speed: 2.0, radius: 0.65, scale: 1.05, contactDamage: 4, projectileDamage: 12,
    xp: 10, gold: 4, cost: 4, minWave: 3, weight: 5, color: 0x7e22ce, knockResist: 0, armor: 5,
  },
  BOMBER: {
    name: 'Bomber Beetle', hp: 30, speed: 5.0, radius: 1.2, scale: 2, contactDamage: 0, projectileDamage: 28,
    xp: 8, gold: 3, cost: 3, minWave: 3, weight: 6, color: 0xf97316, knockResist: 0, armor: 10,
  },
  BRUTE: {
    name: 'Brute', hp: 220, speed: 3.0, radius: 1.2, scale: 1.8, contactDamage: 18, projectileDamage: 0,
    xp: 30, gold: 10, cost: 8, minWave: 6, weight: 3, color: 0x92400e, knockResist: 0.6, armor: 40,
  },
  SPLITTER: {
    name: 'Splitter', hp: 120, speed: 2.6, radius: 1.1, scale: 1.7, contactDamage: 12, projectileDamage: 0,
    xp: 18, gold: 6, cost: 6, minWave: 7, weight: 3, color: 0x4d7c0f, knockResist: 0.3, armor: 20,
  },
  ZOMBIE: {
    name: 'Zombie', hp: 170, speed: 1.7, radius: 0.85, scale: 1.25, contactDamage: 11, projectileDamage: 0,
    xp: 14, gold: 4, cost: 4, minWave: 3, weight: 4, color: 0x5f7a4a, knockResist: 0.5, armor: 25,
  },
  WRAITH: {
    name: 'Wraith', hp: 55, speed: 3.6, radius: 0.6, scale: 1.1, contactDamage: 9, projectileDamage: 0,
    xp: 12, gold: 4, cost: 4, minWave: 5, weight: 3, color: 0x7dd3fc, knockResist: 0.2, armor: 15,
  },
  CRYSTAL_GOLEMITE: {
    name: 'Crystal Golemite', hp: 95, speed: 2.4, radius: 0.8, scale: 1.1, contactDamage: 10, projectileDamage: 9,
    xp: 12, gold: 5, cost: 4, minWave: 4, weight: 4, color: 0xe879f9, knockResist: 0.4, armor: 45,
  },
  BANDIT: {
    name: 'Bandit', hp: 62, speed: 4.4, radius: 0.6, scale: 1.05, contactDamage: 8, projectileDamage: 0,
    xp: 9, gold: 6, cost: 3.5, minWave: 4, weight: 4, color: 0xb45309, knockResist: 0, armor: 15,
  },
  BOAR: {
    name: 'Wild Boar', hp: 115, speed: 3.0, radius: 0.95, scale: 1.3, contactDamage: 13, projectileDamage: 0,
    xp: 12, gold: 3, cost: 4, minWave: 3, weight: 4, color: 0x78350f, knockResist: 0.4, armor: 25,
  },
  ROCK_CRAB: {
    name: 'Rock Crab', hp: 150, speed: 2.1, radius: 0.95, scale: 1.2, contactDamage: 12, projectileDamage: 0,
    xp: 16, gold: 5, cost: 5, minWave: 6, weight: 3, color: 0x94a3b8, knockResist: 0.6, armor: 60,
  },
  BOSS_GOLEM: {
    name: 'Gorath the Mountain', hp: 1625, speed: 2.8, radius: 2.6, scale: 4, contactDamage: 25, projectileDamage: 18,
    xp: 7, gold: 300, cost: 0, minWave: 10, weight: 0, color: 0x78716c, knockResist: 1, armor: 80,
  },
  BOSS_LICH: {
    name: 'Malakar the Undying', hp: 1430, speed: 3.4, radius: 1.4, scale: 2.6, contactDamage: 18, projectileDamage: 14,
    xp: 8, gold: 400, cost: 0, minWave: 20, weight: 0, color: 0x38bdf8, knockResist: 1, armor: 40,
  },
  BOSS_TREANT: {
    name: 'Elderroot the Ancient', hp: 1800, speed: 2.4, radius: 2.3, scale: 3.4, contactDamage: 22, projectileDamage: 16,
    xp: 9, gold: 0, cost: 0, minWave: 30, weight: 0, color: 0x4d7c0f, knockResist: 1, armor: 55,
  },
  BOSS_HYDRA: {
    name: 'The Mire Hydra', hp: 2000, speed: 2.2, radius: 2.7, scale: 3.2, contactDamage: 22, projectileDamage: 17,
    xp: 10, gold: 0, cost: 0, minWave: 40, weight: 0, color: 0x3f8f4a, knockResist: 1, armor: 50,
  },
  BOSS_WYRM: {
    name: 'Glacius the Frost Wyrm', hp: 2100, speed: 3.6, radius: 2.2, scale: 3.4, contactDamage: 24, projectileDamage: 18,
    xp: 11, gold: 0, cost: 0, minWave: 50, weight: 0, color: 0x7dd3fc, knockResist: 1, armor: 55,
  },
  BOSS_WARLORD: {
    name: 'Ignar the Infernal Warlord', hp: 2300, speed: 3.4, radius: 2.0, scale: 3.1, contactDamage: 28, projectileDamage: 19,
    xp: 12, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0xef4444, knockResist: 1, armor: 65,
  },
  BOSS_VOID: {
    name: 'The Void Herald', hp: 2600, speed: 3.0, radius: 1.8, scale: 3.0, contactDamage: 26, projectileDamage: 20,
    xp: 13, gold: 0, cost: 0, minWave: 70, weight: 0, color: 0xa855f7, knockResist: 1, armor: 50,
  },
  BOSS_SAPLING: {
    name: 'Sapling', hp: 90, speed: 1.9, radius: 0.8, scale: 1.0, contactDamage: 0, projectileDamage: 12,
    xp: 0, gold: 0, cost: 0, minWave: 30, weight: 0, color: 0x65a30d, knockResist: 0.3, armor: 10,
  },
  BOSS_HYDRA_HEAD: {
    name: 'Hydra Head', hp: 300, speed: 0, radius: 1.25, scale: 1.5, contactDamage: 0, projectileDamage: 14,
    xp: 0, gold: 0, cost: 0, minWave: 40, weight: 0, color: 0x3f8f4a, knockResist: 1, armor: 20,
  },
  BOSS_IMP: {
    name: 'Fire Imp', hp: 70, speed: 5.4, radius: 0.55, scale: 0.9, contactDamage: 11, projectileDamage: 0,
    xp: 0, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0xff6a1a, knockResist: 0, armor: 5,
  },
};

export type BossKind =
  | 'BOSS_GOLEM' | 'BOSS_LICH' | 'BOSS_TREANT' | 'BOSS_HYDRA' | 'BOSS_WYRM' | 'BOSS_WARLORD' | 'BOSS_VOID';

/** Boss rotation: wave 10 * (i + 1). After the last one the cycle restarts (hp/dmg keep scaling with the wave number). */
export const BOSS_ROTATION: readonly BossKind[] = ['BOSS_GOLEM', 'BOSS_LICH', 'BOSS_TREANT', 'BOSS_HYDRA', 'BOSS_WYRM', 'BOSS_WARLORD', 'BOSS_VOID'];
export function bossForWave(wave: number): BossKind {
  const i = Math.max(0, Math.round(wave / 10) - 1);
  return BOSS_ROTATION[i % BOSS_ROTATION.length];
}
/** Summons / body parts of the new bosses: no xp, loot or gold; vanish when their boss dies. */
export function isBossAdd(k: EnemyKind): boolean { return k === 'BOSS_SAPLING' || k === 'BOSS_HYDRA_HEAD' || k === 'BOSS_IMP'; }

export const BOSS_NAMES: Record<BossKind, { name: string; title: string }> = {
  BOSS_GOLEM: { name: 'Gorath the Mountain', title: 'Ancient Golem' },
  BOSS_LICH: { name: 'Malakar the Undying', title: 'Lich King' },
  BOSS_TREANT: { name: 'Elderroot the Ancient', title: 'Ancient Treant' },
  BOSS_HYDRA: { name: 'The Mire Hydra', title: 'Marsh Terror' },
  BOSS_WYRM: { name: 'Glacius the Frost Wyrm', title: 'Winter Dragon' },
  BOSS_WARLORD: { name: 'Ignar the Infernal Warlord', title: 'Lord of Cinders' },
  BOSS_VOID: { name: 'The Void Herald', title: 'Harbinger of the Abyss' },
};

export function isBossKind(k: EnemyKind): k is BossKind {
  return k === 'BOSS_GOLEM' || k === 'BOSS_LICH' || k === 'BOSS_TREANT' || k === 'BOSS_HYDRA' || k === 'BOSS_WYRM' || k === 'BOSS_WARLORD' || k === 'BOSS_VOID';
}

/** Kinds the director may pick for ordinary spawns. */
export const SPAWNABLE_KINDS: readonly EnemyKind[] = [
  'SLIME', 'GOBLIN', 'BAT', 'SKELETON_ARCHER', 'CULTIST', 'BOMBER', 'BRUTE', 'SPLITTER',
  'ZOMBIE', 'WRAITH', 'CRYSTAL_GOLEMITE', 'BANDIT', 'BOAR', 'ROCK_CRAB',
];

/**
 * Regional affinity: spawn-weight multiplier per RegionKind (string key) for the regional kinds.
 * Unlisted region = 0.3 (still appears, rarely). Generic kinds have no entry (always x1).
 */
export const REGION_AFFINITY: Partial<Record<EnemyKind, Record<string, number>>> = {
  ZOMBIE: { GRAVEYARD: 9, RUINS: 2 },
  WRAITH: { GRAVEYARD: 7, RUINS: 5 },
  CRYSTAL_GOLEMITE: { CRYSTAL_GROVE: 10, QUARRY: 2 },
  BANDIT: { CAMP: 10, FARM: 1.5, RUINS: 1.5 },
  BOAR: { FARM: 7, GROVE: 7 },
  ROCK_CRAB: { QUARRY: 10, POND: 8 },
};
export const REGION_AFFINITY_OFF = 0.3;

/** Mini-boss definitions (waves 5, 15, 25...), picked by the region nearest the player. */
export const MINI_BOSSES: Record<string, { kind: EnemyKind; name: string; title: string; regions: string[] }> = {
  WARDEN: { kind: 'ZOMBIE', name: 'Grave Warden', title: 'Zombie Lord', regions: ['GRAVEYARD', 'RUINS'] },
  CAPTAIN: { kind: 'BANDIT', name: 'Bandit Captain', title: 'Camp Chief', regions: ['CAMP'] },
  BEHEMOTH: { kind: 'CRYSTAL_GOLEMITE', name: 'Crystal Behemoth', title: 'Shard Colossus', regions: ['CRYSTAL_GROVE'] },
  TUSK: { kind: 'BOAR', name: 'Old Tusk', title: 'Terror of the Fields', regions: ['FARM', 'GROVE'] },
  SHELLBACK: { kind: 'ROCK_CRAB', name: 'Shellback', title: 'Quarry Titan', regions: ['QUARRY', 'POND'] },
};

/** Weak kinds used for RING encirclements. */
export const WEAK_KINDS: readonly EnemyKind[] = ['SLIME', 'GOBLIN', 'BAT'];

// ------------------------------------------------------------ wave scaling --
export const SPAWN_TIME = 0.6;        // seconds ordinary enemies take to rise
export const BOSS_SPAWN_TIME = 1.6;   // bosses rise slower

export function waveHpMult(wave: number): number {
  const w = wave - 1;
  return 1 + 0.16 * w + 0.01 * w * w;
}
export function waveDmgMult(wave: number): number {
  return 1 + 0.07 * (wave - 1);
}
export function waveSpeedMult(wave: number): number {
  return Math.min(1.5, 1 + 0.0075 * (wave - 1));
}
/** Total spawn budget points for a wave (before difficulty multiplier). */
export function waveBudget(wave: number): number {
  const base = 18 + wave * 6 + Math.pow(wave, 1.35) * 2;
  return wave <= 5 ? base * (0.7 + 0.06 * (wave - 1)) : base; // gentler onboarding: waves 1-5 at 70%..94%
}
export function maxAliveForWave(wave: number): number {
  return 50 + 20 * Math.floor((wave - 1) / 10);
}

/** Kinds that carry coins (humanoids + Lich). Others drop loot items only. [chance per kill, coin value]. */
export const GOLD_DROPPERS: Partial<Record<EnemyKind, readonly [number, number]>> = {
  GOBLIN: [0.30, 10], BANDIT: [0.35, 10], CULTIST: [0.40, 10], SKELETON_ARCHER: [0.35, 10], BRUTE: [0.60, 12], ZOMBIE: [0.45, 10],
};
/** Armor of a spawned enemy: wave growth, elites tougher, bosses toughest. */
export function armorFor(kind: EnemyKind, wave: number, elite: boolean): number {
  const base = ENEMY_DEFS[kind].armor * (1 + 0.02 * (wave - 1));
  return Math.round(elite ? base * 1.6 + 15 : base);
}
