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

/** Water-type monsters: shrug off water puddles and run faster in them (Coral Isles); stationary ones (lake hydra) can move there. */
const AQUATIC = new Set<EnemyKind>(['SLIME', 'SPLITTER', 'ROCK_CRAB', 'LAKE_HYDRA']);
export const isAquatic = (k: EnemyKind): boolean => AQUATIC.has(k);

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
    name: 'Skeleton Archer', hp: 35, speed: 2.2, radius: 0.6, scale: 1.3, contactDamage: 4, projectileDamage: 10,
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
    name: 'Brute', hp: 145, speed: 3.0, radius: 1.2, scale: 1.8, contactDamage: 18, projectileDamage: 0,
    xp: 30, gold: 10, cost: 8, minWave: 6, weight: 3, color: 0x92400e, knockResist: 1, armor: 30,
  },
  SPLITTER: {
    name: 'Splitter', hp: 120, speed: 2.6, radius: 1.1, scale: 1.7, contactDamage: 12, projectileDamage: 0,
    xp: 18, gold: 6, cost: 6, minWave: 7, weight: 3, color: 0x4d7c0f, knockResist: 1, armor: 20,
  },
  ZOMBIE: {
    name: 'Zombie', hp: 115, speed: 1.7, radius: 0.85, scale: 1.25, contactDamage: 11, projectileDamage: 0,
    xp: 14, gold: 4, cost: 4, minWave: 3, weight: 4, color: 0x5f7a4a, knockResist: 0.5, armor: 20,
  },
  WRAITH: {
    name: 'Wraith', hp: 55, speed: 3.6, radius: 0.6, scale: 1.1, contactDamage: 9, projectileDamage: 0,
    xp: 12, gold: 4, cost: 4, minWave: 5, weight: 3, color: 0x7dd3fc, knockResist: 0.2, armor: 15,
  },
  CRYSTAL_GOLEMITE: {
    name: 'Crystal Golemite', hp: 95, speed: 2.4, radius: 0.8, scale: 1.1, contactDamage: 10, projectileDamage: 9,
    xp: 12, gold: 5, cost: 4, minWave: 4, weight: 4, color: 0xe879f9, knockResist: 0.4, armor: 30,
  },
  BANDIT: {
    name: 'Bandit', hp: 62, speed: 4.4, radius: 0.6, scale: 1.05, contactDamage: 8, projectileDamage: 0,
    xp: 9, gold: 6, cost: 3.5, minWave: 4, weight: 4, color: 0xb45309, knockResist: 0, armor: 15,
  },
  BOAR: {
    name: 'Wild Boar', hp: 90, speed: 3.0, radius: 0.95, scale: 1.3, contactDamage: 13, projectileDamage: 0,
    xp: 12, gold: 3, cost: 4, minWave: 3, weight: 4, color: 0x78350f, knockResist: 0.4, armor: 25,
  },
  ROCK_CRAB: {
    name: 'Rock Crab', hp: 95, speed: 2.1, radius: 0.95, scale: 1.2, contactDamage: 12, projectileDamage: 0,
    xp: 16, gold: 5, cost: 5, minWave: 6, weight: 3, color: 0x94a3b8, knockResist: 1, armor: 30,   // (owner: crabs were tankier than bosses) hp 150->95, armor 60->30, shell 0.35->0.65
  },
  BOSS_GOLEM: {
    name: 'Gorath the Mountain', hp: 1800, speed: 1.68, radius: 7.1, scale: 9.5,   /* (owner 2026-10-24: 50% bigger, 40% slower; 2026-10-26: +12%, the guardians ~ the Dune Colossus's footprint) */ contactDamage: 25, projectileDamage: 18,
    xp: 7, gold: 300, cost: 0, minWave: 10, weight: 0, color: 0x78716c, knockResist: 1, armor: 80,
  },
  BOSS_LICH: {
    name: 'The Undying Lich', hp: 1430, speed: 3.4, radius: 1.6, scale: 3.0, contactDamage: 18, projectileDamage: 14,
    xp: 8, gold: 400, cost: 0, minWave: 20, weight: 0, color: 0x38bdf8, knockResist: 1, armor: 40,
  },
  BOSS_TREANT: {
    name: 'Elderroot the Ancient', hp: 1625, speed: 2.4, radius: 6.7, scale: 9.3,   /* (owner 2026-10-26: +12%, ~ the Dune Colossus's footprint) */ contactDamage: 22, projectileDamage: 16,
    xp: 9, gold: 0, cost: 0, minWave: 30, weight: 0, color: 0x4d7c0f, knockResist: 1, armor: 55,
  },
  BOSS_HYDRA: {
    name: 'The Mire Hydra', hp: 2000, speed: 2.2, radius: 7.3, scale: 8.6,   /* (owner 2026-10-26: +12%) */ contactDamage: 22, projectileDamage: 17,
    xp: 10, gold: 0, cost: 0, minWave: 40, weight: 0, color: 0x3f8f4a, knockResist: 1, armor: 50,
  },
  BOSS_WYRM: {
    name: 'Glacius the Frost Wyrm', hp: 2100, speed: 3.6, radius: 6.4, scale: 9.3,   /* (owner 2026-10-26: +12%) */ contactDamage: 24, projectileDamage: 18,
    xp: 11, gold: 0, cost: 0, minWave: 50, weight: 0, color: 0x7dd3fc, knockResist: 1, armor: 55,
  },
  BOSS_WARMACH: {
    name: 'The Dune Colossus', hp: 6500, speed: 1.2, radius: 5, scale: 10, contactDamage: 45, projectileDamage: 30,   // (owner: 2.5x the old size (was 5x, then 50% smaller), 2.5x hp, 1.5x damage, very slow-moving)
    xp: 14, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0x6e7a45, knockResist: 1, armor: 75,
  },
  BOSS_WARLORD: {
    name: 'Ignar the Infernal Warlord', hp: 3220,   // (owner: +40% for the Burning Form; was 2300)
    speed: 5.4, radius: 4.5, scale: 6.6, contactDamage: 28, projectileDamage: 19,   // (owner: way faster, ~15% smaller; was speed 3.4 / radius 2.4 / scale 3.6; 2026-10-26: x1.35, a guardian-sized warlord)
    xp: 12, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0xef4444, knockResist: 1, armor: 65,
  },
  BOSS_VOID: {
    name: 'The Void Herald', hp: 2600, speed: 3.0, radius: 4.2, scale: 6.6, contactDamage: 26, projectileDamage: 20,   // (owner 2026-10-26: x1.3; the winged final form is x1.15 on top = ~ the Dune Colossus)
    xp: 13, gold: 0, cost: 0, minWave: 70, weight: 0, color: 0xa855f7, knockResist: 1, armor: 50,
  },
  BOSS_SAPLING: {
    name: 'Sapling', hp: 90, speed: 1.9, radius: 0.8, scale: 1.0, contactDamage: 0, projectileDamage: 12,
    xp: 0, gold: 0, cost: 0, minWave: 30, weight: 0, color: 0x65a30d, knockResist: 0.3, armor: 10,
  },
  BOSS_HYDRA_HEAD: {
    name: 'Hydra Head', hp: 300, speed: 0, radius: 1.7, scale: 2.1, contactDamage: 0, projectileDamage: 14,
    xp: 0, gold: 0, cost: 0, minWave: 40, weight: 0, color: 0x3f8f4a, knockResist: 1, armor: 20,
  },
  BOSS_WYRMLING: {
    name: 'Wyrmling', hp: 150, speed: 5.5, radius: 0.85, scale: 1.0, contactDamage: 12, projectileDamage: 11,
    xp: 0, gold: 0, cost: 0, minWave: 50, weight: 0, color: 0x8fd0f0, knockResist: 0.3, armor: 10,
  },
  BOSS_IMP: {
    name: 'Fire Imp', hp: 70, speed: 5.4, radius: 0.55, scale: 0.9, contactDamage: 11, projectileDamage: 0,
    xp: 0, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0xff6a1a, knockResist: 0, armor: 5,
  },
  BOSS_DKNIGHT: {
    name: 'Dark Knight', hp: 150, speed: 4.6, radius: 0.9, scale: 1.45, contactDamage: 0, projectileDamage: 14,
    xp: 0, gold: 0, cost: 0, minWave: 60, weight: 0, color: 0x4a3a7a, knockResist: 0.5, armor: 25,
  },
  // ---- stage monsters (placed by the room layout, not rolled from the roster)
  GOBLIN_ARCHER: {
    name: 'Goblin Archer', hp: 60, speed: 0, radius: 1.35, scale: 1, contactDamage: 0, projectileDamage: 11,
    xp: 9, gold: 3, cost: 0, minWave: 1, weight: 0, color: 0x9a6a2a, knockResist: 1, armor: 10,
  },
  LAKE_HYDRA: {
    name: 'Lurking Hydra', hp: 190, speed: 0, radius: 1.7, scale: 0.85,   /* (owner 2026-10-24: bigger, more hp) */ contactDamage: 12, projectileDamage: 10,
    xp: 16, gold: 5, cost: 0, minWave: 1, weight: 0, color: 0x3f8f6a, knockResist: 1, armor: 20,
  },
  // ---- roster monsters
  SCARAB: {
    name: 'Sand Scarab', hp: 11, speed: 6.6, radius: 0.42, scale: 0.75, contactDamage: 4, projectileDamage: 0,
    xp: 2, gold: 1, cost: 0.6, minWave: 1, weight: 6, color: 0x2fa8a0, knockResist: 0, armor: 0,
  },
  SHIELDBEARER: {
    name: 'Shieldbearer', hp: 125, speed: 2.2, radius: 0.85, scale: 1.3, contactDamage: 6, projectileDamage: 0,
    xp: 18, gold: 5, cost: 5, minWave: 1, weight: 3, color: 0xb08a3a, knockResist: 1, armor: 40,
  },
  // ---- biome-unique monsters
  SPORECAP: {
    name: 'Sporecap', hp: 70, speed: 2.2, radius: 0.75, scale: 1.15, contactDamage: 8, projectileDamage: 10,
    xp: 9, gold: 3, cost: 3, minWave: 1, weight: 0, color: 0xd04a3a, knockResist: 0.2, armor: 10,
  },
  DIREWOLF: {
    name: 'Dire Wolf', hp: 58, speed: 5.2, radius: 0.75, scale: 1.2, contactDamage: 10, projectileDamage: 0,
    xp: 9, gold: 2, cost: 3, minWave: 1, weight: 0, color: 0x6b6f78, knockResist: 0.1, armor: 10,
  },
  HAUNTED_ARMOR: {
    name: 'Haunted Armor', hp: 135, speed: 2.0, radius: 0.9, scale: 1.35, contactDamage: 9, projectileDamage: 0,
    xp: 18, gold: 5, cost: 5, minWave: 1, weight: 0, color: 0x8a94a8, knockResist: 1, armor: 35,
  },
  GARGOYLE: {
    name: 'Gargoyle', hp: 95, speed: 5.0, radius: 0.8, scale: 1.2, contactDamage: 11, projectileDamage: 0,
    xp: 12, gold: 4, cost: 4, minWave: 1, weight: 0, color: 0x7a7468, knockResist: 0.4, armor: 30,
  },
  SCORPION: {
    name: 'Giant Scorpion', hp: 110, speed: 3.4, radius: 0.9, scale: 1.3, contactDamage: 8, projectileDamage: 13,
    xp: 13, gold: 3, cost: 4, minWave: 1, weight: 0, color: 0xb8742a, knockResist: 0.4, armor: 25,
  },
  MUMMY: {
    name: 'Mummy', hp: 110, speed: 1.8, radius: 0.8, scale: 1.2, contactDamage: 10, projectileDamage: 9,
    xp: 14, gold: 4, cost: 4, minWave: 1, weight: 0, color: 0xd8c8a0, knockResist: 0.4, armor: 20,
  },
  YETI: {
    name: 'Yeti', hp: 170, speed: 2.8, radius: 1.2, scale: 1.7, contactDamage: 17, projectileDamage: 0,
    xp: 30, gold: 8, cost: 7, minWave: 1, weight: 0, color: 0xe8f0f8, knockResist: 1, armor: 25,
  },
  FROST_WISP: {
    name: 'Frost Wisp', hp: 48, speed: 3.2, radius: 0.6, scale: 1.0, contactDamage: 4, projectileDamage: 10,
    xp: 10, gold: 3, cost: 3.5, minWave: 1, weight: 0, color: 0x8ae0ff, knockResist: 0, armor: 5,
  },
  HELLHOUND: {
    name: 'Hellhound', hp: 70, speed: 6.0, radius: 0.75, scale: 1.2, contactDamage: 11, projectileDamage: 6,
    xp: 11, gold: 3, cost: 3.5, minWave: 1, weight: 0, color: 0xff5a1a, knockResist: 0.1, armor: 15,
  },
  CINDER_SHAMAN: {
    name: 'Cinder Shaman', hp: 60, speed: 2.2, radius: 0.65, scale: 1.1, contactDamage: 5, projectileDamage: 15,
    xp: 12, gold: 5, cost: 4, minWave: 1, weight: 0, color: 0xc0381a, knockResist: 0, armor: 10,
  },
  VOID_STALKER: {
    name: 'Void Stalker', hp: 85, speed: 3.8, radius: 0.65, scale: 1.15, contactDamage: 9, projectileDamage: 16,
    xp: 14, gold: 4, cost: 4.5, minWave: 1, weight: 0, color: 0x8a4aff, knockResist: 0.2, armor: 20,
  },
  VOID_EYE: {
    name: 'Void Eye', hp: 75, speed: 2.4, radius: 0.8, scale: 1.1, contactDamage: 5, projectileDamage: 9,
    xp: 13, gold: 4, cost: 4, minWave: 1, weight: 0, color: 0xc070ff, knockResist: 0.3, armor: 15,
  },
  BOSS_CRYSTAL: {
    name: 'Ward Crystal', hp: 100, speed: 0, radius: 1.1, scale: 1.3, contactDamage: 0, projectileDamage: 0,
    xp: 0, gold: 0, cost: 0, minWave: 1, weight: 0, color: 0x8ab8ff, knockResist: 1, armor: 0,
  },
  HUMAN_BOSS: {   // humanoid mini boss (systems/humanBosses.ts sets the real hp: ~1.25x a guardian of the depth)
    name: 'Humanoid Champion', hp: 170, speed: 4.2, radius: 0.75, scale: 1.15, contactDamage: 12, projectileDamage: 12,
    xp: 14, gold: 0, cost: 0, minWave: 3, weight: 0, color: 0xb0b8c8, knockResist: 0.7, armor: 25,
  },
  DARK_HERO: {   // champion duel (systems/darkHero.ts sets the real hp: ~5x an elite of the depth)
    name: 'Dark Champion', hp: 130, speed: 4.6, radius: 0.75, scale: 1.2, contactDamage: 15, projectileDamage: 13,
    xp: 14, gold: 0, cost: 0, minWave: 3, weight: 0, color: 0x8b3dff, knockResist: 0.7, armor: 30,
  },
  // raised by the Dark Necromancer (systems/darkHero.ts): hostile copies of the necromancer's minions, never rolled in rosters
  SKELETON_WARRIOR: {
    name: 'Skeleton Warrior', hp: 50, speed: 3.4, radius: 0.6, scale: 1.3, contactDamage: 9, projectileDamage: 0,
    xp: 0, gold: 0, cost: 0, minWave: 99, weight: 0, color: 0xd8d0b8, knockResist: 0.2, armor: 15,
  },
  SKELETON_MAGE: {
    name: 'Skeleton Mage', hp: 38, speed: 2.2, radius: 0.6, scale: 1.3, contactDamage: 4, projectileDamage: 11,
    xp: 0, gold: 0, cost: 0, minWave: 99, weight: 0, color: 0xb08aff, knockResist: 0, armor: 5,
  },
  BONE_GOLEM: {
    name: 'Bone Golem', hp: 260, speed: 2.8, radius: 1.3, scale: 1.9, contactDamage: 16, projectileDamage: 0,
    xp: 0, gold: 0, cost: 0, minWave: 99, weight: 0, color: 0x9a6bd8, knockResist: 1, armor: 40,
  },
};

/** Stage monsters that never move (archer on a tower, hydra in a lake): no separation, push-out, leash or knockback. */
/** (owner 2026-10-25) Monsters a room does not need dead to be cleared (tower archers, lake hydras, gargoyles): they leave when it is. */
export const OPTIONAL_KINDS: readonly EnemyKind[] = ['GOBLIN_ARCHER', 'LAKE_HYDRA', 'GARGOYLE'];
export const optionalForClear = (k: EnemyKind): boolean => k === 'GOBLIN_ARCHER' || k === 'LAKE_HYDRA' || k === 'GARGOYLE';
export function isStationary(k: EnemyKind): boolean { return k === 'GOBLIN_ARCHER' || k === 'LAKE_HYDRA' || k === 'BOSS_CRYSTAL'; }
/** (owner) Giant ROOTED bosses: they never walk. Elderroot stands rooted in the arena, Glacius rises out of the far rim (head / neck / claws), the
 *  Hydra's body lies beyond the rim with its heads reaching in. They fight with arena-wide telegraphed patterns (systems/bosses2.ts). */
/** Camera pull-back factor of a giant guardian's fight (render/CameraRig.tsx): 1 for everything else. Grows with the body radius
 *  (Dune Colossus r5 = 1.6x; Gorath / Elderroot / Hydra / Glacius ~1.8-1.9x; Ignar / Void Herald ~1.5x). Humans, the Lich, the Slime King and mini-bosses stay 1. */
export function bossCamZoom(k: EnemyKind): number {
  switch (k) {
    case 'BOSS_GOLEM': case 'BOSS_TREANT': case 'BOSS_HYDRA': case 'BOSS_WYRM': case 'BOSS_WARMACH': case 'BOSS_WARLORD': case 'BOSS_VOID':
      return Math.min(1.9, 1 + 0.12 * ENEMY_DEFS[k].radius);
    default: return 1;
  }
}
export function isRootedBoss(k: EnemyKind): boolean { return k === 'BOSS_TREANT' || k === 'BOSS_HYDRA' || k === 'BOSS_WYRM'; }
/** Home spot (x, z) of a rooted boss in a room of radius R: Elderroot a little behind the centre, Glacius's head just inside the far rim, the Hydra's
 *  body beyond it. `slot` offsets extra bosses (Endless Waves) sideways. The hero arrives on the +z side. */
export function rootedHome(k: EnemyKind, R: number, slot: number, out: { x: number; z: number }): void {
  const side = slot === 0 ? 0 : (slot & 1 ? 1 : -1) * (12 + 11 * ((slot - 1) >> 1));
  if (k === 'BOSS_TREANT') { out.x = side; out.z = -R * 0.16; }
  else if (k === 'BOSS_WYRM') { out.x = side * 1.3; out.z = -(R - 3.4) + Math.abs(side) * 0.08; }
  else { out.x = side * 1.2; out.z = -(R + 4.2); }
}
/** Swarm kinds: rolled in big packs. */
export function isSwarm(k: EnemyKind): boolean { return k === 'BAT' || k === 'SCARAB'; }

export type BossKind =
  | 'BOSS_GOLEM' | 'BOSS_LICH' | 'BOSS_TREANT' | 'BOSS_HYDRA' | 'BOSS_WYRM' | 'BOSS_WARLORD' | 'BOSS_WARMACH' | 'BOSS_VOID';

/** Bosses in biome order (the Lich is a mini-boss room option, so it is not part of the order). Used by the Codex. */
export const BOSS_ROTATION: readonly BossKind[] = ['BOSS_GOLEM', 'BOSS_TREANT', 'BOSS_HYDRA', 'BOSS_WYRM', 'BOSS_WARLORD', 'BOSS_VOID', 'BOSS_LICH'];
/** Summons / body parts of the new bosses: no xp, loot or gold; vanish when their boss dies. */
export function isBossAdd(k: EnemyKind): boolean { return k === 'BOSS_SAPLING' || k === 'BOSS_WYRMLING' || k === 'BOSS_HYDRA_HEAD' || k === 'BOSS_IMP' || k === 'BOSS_DKNIGHT' || k === 'BOSS_CRYSTAL'; }

export const BOSS_NAMES: Record<BossKind, { name: string; title: string }> = {
  BOSS_GOLEM: { name: 'Gorath the Mountain', title: 'Ancient Golem' },
  BOSS_LICH: { name: 'The Undying Lich', title: 'Lich King' },
  BOSS_TREANT: { name: 'Elderroot the Ancient', title: 'Ancient Treant' },
  BOSS_HYDRA: { name: 'The Tide Hydra', title: 'Terror of the Reef' },
  BOSS_WYRM: { name: 'Glacius the Frost Wyrm', title: 'Winter Dragon' },
  BOSS_WARLORD: { name: 'Ignar the Infernal Warlord', title: 'Lord of Cinders' },
  BOSS_WARMACH: { name: 'The Dune Colossus', title: 'Engine of the Old Kings' },
  BOSS_VOID: { name: 'The Void Herald', title: 'Harbinger of the Abyss' },
};

export function isBossKind(k: EnemyKind): k is BossKind {
  return k === 'BOSS_GOLEM' || k === 'BOSS_LICH' || k === 'BOSS_TREANT' || k === 'BOSS_HYDRA' || k === 'BOSS_WYRM' || k === 'BOSS_WARLORD' || k === 'BOSS_WARMACH' || k === 'BOSS_VOID';
}

/** Mini-boss definitions for mini-boss rooms (biome rosters in roomDefs list which ones appear where). */
export const MINI_BOSSES: Record<string, { kind: EnemyKind; name: string; title: string }> = {
  WARDEN: { kind: 'ZOMBIE', name: 'Grave Warden', title: 'Zombie Lord' },
  CAPTAIN: { kind: 'BANDIT', name: 'Bandit Captain', title: 'Camp Chief' },
  BEHEMOTH: { kind: 'CRYSTAL_GOLEMITE', name: 'Crystal Behemoth', title: 'Shard Colossus' },
  TUSK: { kind: 'BOAR', name: 'Old Tusk', title: 'Terror of the Fields' },
  SHELLBACK: { kind: 'ROCK_CRAB', name: 'Shellback', title: 'Quarry Titan' },
  PHALANX: { kind: 'SHIELDBEARER', name: 'Phalanx Captain', title: 'Bronze Wall' },
};

/** Weak kinds (the monster-trick system lets them cast at most once per life). */
export const WEAK_KINDS: readonly EnemyKind[] = ['SLIME', 'GOBLIN', 'BAT'];

// ------------------------------------------------------------ wave scaling --
export const SPAWN_TIME = 0.35;        // seconds ordinary enemies take to rise
export const BOSS_SPAWN_TIME = 1.6;   // bosses rise slower

export function waveHpMult(wave: number): number {
  // (owner 2026-10-25 rebalance) flatter at the top: each biome start is ~1.5-2x the one before (was ~2-2.5x from biome 3 on)
  const w = wave - 1;
  return 1 + 0.22 * w + 0.005 * w * w;
}
export function waveDmgMult(wave: number): number {
  // quadratic like HP (was linear 1 + 0.07w: depth 60 hit only 5x while the hero's HP / defense kept growing, so late
  // biomes felt easier). Depth 10 ~1.9x, 30 ~5.1x, 60 ~17.8x.
  const w = Math.max(0, wave - 1), m = 1 + 0.07 * w + 0.0035 * w * w;
  // gentler onboarding (balance pass, like waveBudget): waves 1-5 hit for 75%..95%. Fresh Lv 1 heroes used to die in the
  // 3rd-6th room (a Wizard has 30 HP: three goblin arrows).
  return wave <= 5 ? m * (0.75 + 0.05 * (Math.max(1, wave) - 1)) : m;
}
export function waveSpeedMult(wave: number): number {
  return Math.min(1.5, 1 + 0.0075 * (wave - 1));
}
/** Total spawn budget points for a wave (before difficulty multiplier). */
export function waveBudget(wave: number): number {
  const base = 18 + wave * 6 + Math.pow(wave, 1.35) * 2;
  return wave <= 5 ? base * (0.7 + 0.06 * (wave - 1)) : base; // gentler onboarding: waves 1-5 at 70%..94%
}
/** Kinds that carry coins (humanoids + Lich). Others drop loot items only. [chance per kill, coin value]. */
export const GOLD_DROPPERS: Partial<Record<EnemyKind, readonly [number, number]>> = {
  GOBLIN: [0.30, 10], GOBLIN_ARCHER: [0.4, 10], SHIELDBEARER: [0.4, 10], BANDIT: [0.35, 10], MUMMY: [0.35, 10], CINDER_SHAMAN: [0.4, 10], HAUNTED_ARMOR: [0.4, 12], CULTIST: [0.40, 10], SKELETON_ARCHER: [0.35, 10], SKELETON_WARRIOR: [0.35, 10], SKELETON_MAGE: [0.35, 10], BRUTE: [0.60, 12], ZOMBIE: [0.45, 10],
};
/** Armor of a spawned enemy: wave growth, elites tougher, bosses toughest. */
/** (owner) enemies hit harder but are softer: damage x1.25 (enemies.spawnEnemy), armour x0.6. */
export const ENEMY_DMG_MUL = 1.25, ENEMY_ARMOR_MUL = 0.6;
/** (owner) boss skills (strike zones, waves, breath, specials, phase-2 moves) hit 50% harder. */
export const BOSS_SKILL_MUL = 1.5;
export function armorFor(kind: EnemyKind, wave: number, elite: boolean): number {
  const base = ENEMY_DEFS[kind].armor * (1 + 0.02 * (wave - 1));
  return Math.round((elite ? base * 1.6 + 15 : base) * ENEMY_ARMOR_MUL);
}
