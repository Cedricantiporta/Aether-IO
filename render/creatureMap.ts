// Creature kit v1 wiring table (docs/CREATURE_PLAN.md): which kit piece draws which game kind / pet, and how it moves.
// Pure data (no three imports). Bosses (BOSS_*) are NOT here (render/bossKit.tsx); boss adds are.
import type { EnemyKind } from '../engine/types';

/** Motion archetype: picks the whole-body bob / lean and the joint swing rules (render/creatureKit.tsx `jointPose`). */
export type Arch = 'biped' | 'quad' | 'blob' | 'fly' | 'float' | 'crawl' | 'still';
export interface CreatureCfg {
  piece: string; arch: Arch;
  /** gait phase speed (rad/s at full move); default 9 */ gait?: number;
  /** model-space lift added to the whole body (flyers that the kit authored on the ground, archers on their tower) */ lift?: number;
  /** wing flap rate / amplitude (fly) */ flap?: number; amp?: number;
  /** raises both arms on WINDUP / ATTACK like a caster */ caster?: boolean;
  /** extra idle hover amplitude */ hover?: number;
}

export const MONSTER_KIT: Partial<Record<EnemyKind, CreatureCfg>> = {
  SLIME: { piece: 'slime', arch: 'blob' },
  SPLITTER: { piece: 'splitter', arch: 'blob' },
  GOBLIN: { piece: 'goblin', arch: 'biped', gait: 10 },
  GOBLIN_ARCHER: { piece: 'goblin_archer', arch: 'still', lift: 3.15, caster: true },
  BAT: { piece: 'bat', arch: 'fly', flap: 22, amp: 0.8, lift: 1.5 },
  SKELETON_ARCHER: { piece: 'skeleton_archer', arch: 'biped', caster: true },
  SKELETON_WARRIOR: { piece: 'skeleton_warrior', arch: 'biped', gait: 10 },
  SKELETON_MAGE: { piece: 'skeleton_mage', arch: 'biped', caster: true },
  CULTIST: { piece: 'cultist', arch: 'biped', caster: true, gait: 7 },
  BOMBER: { piece: 'bomber', arch: 'biped', gait: 14 },
  BRUTE: { piece: 'brute', arch: 'biped', gait: 6 },
  ZOMBIE: { piece: 'zombie', arch: 'biped', gait: 5 },
  WRAITH: { piece: 'wraith', arch: 'float', caster: true, lift: 0.35 },
  CRYSTAL_GOLEMITE: { piece: 'crystal_golemite', arch: 'biped', gait: 6 },
  BANDIT: { piece: 'bandit', arch: 'biped', gait: 11 },
  BOAR: { piece: 'boar', arch: 'quad', gait: 9 },
  ROCK_CRAB: { piece: 'rock_crab', arch: 'crawl', gait: 8 },
  LAKE_HYDRA: { piece: 'lake_hydra', arch: 'still', lift: -1.0 },
  SCARAB: { piece: 'scarab', arch: 'crawl', gait: 16 },
  SHIELDBEARER: { piece: 'shieldbearer', arch: 'biped', gait: 6 },
  SPORECAP: { piece: 'sporecap', arch: 'biped', gait: 7 },
  DIREWOLF: { piece: 'direwolf', arch: 'quad', gait: 12 },
  HELLHOUND: { piece: 'hellhound', arch: 'quad', gait: 13 },
  HAUNTED_ARMOR: { piece: 'haunted_armor', arch: 'biped', gait: 6 },
  GARGOYLE: { piece: 'gargoyle', arch: 'fly', flap: 9, amp: 0.55, lift: 0.4 },
  SCORPION: { piece: 'scorpion', arch: 'crawl', gait: 10 },
  MUMMY: { piece: 'mummy', arch: 'biped', gait: 5 },
  YETI: { piece: 'yeti', arch: 'biped', gait: 6 },
  FROST_WISP: { piece: 'frost_wisp', arch: 'float', lift: 1.2 },
  CINDER_SHAMAN: { piece: 'cinder_shaman', arch: 'biped', caster: true, gait: 6 },
  VOID_STALKER: { piece: 'void_stalker', arch: 'biped', gait: 10 },
  VOID_EYE: { piece: 'void_eye', arch: 'float', lift: 1.4 },
  BONE_GOLEM: { piece: 'bone_golem', arch: 'biped', gait: 5 },
  // boss adds (the bosses themselves are drawn by render/bossKit.tsx rigs)
  BOSS_SAPLING: { piece: 'boss_sapling', arch: 'biped', gait: 9 },
  BOSS_WYRMLING: { piece: 'boss_wyrmling', arch: 'fly', flap: 16, amp: 0.7, lift: 0.7 },
  BOSS_IMP: { piece: 'boss_imp', arch: 'fly', flap: 20, amp: 0.8, lift: 0.7 },
  BOSS_DKNIGHT: { piece: 'skeleton_warrior', arch: 'biped', gait: 11 },
  BOSS_CRYSTAL: { piece: 'boss_crystal', arch: 'still' },
  BOSS_HYDRA_HEAD: { piece: 'boss_hydra_head', arch: 'still', lift: -6.5 },
};

/** Pets (PETS_POOL ids): kit piece, motion, body scale and hover height (the old PetDef values are overridden). */
export interface PetKitCfg { piece: string; arch: Arch; scale: number; hover: number; flap?: number; amp?: number }
export const PET_KIT: Record<string, PetKitCfg> = {
  pet_blob: { piece: 'pet_blob', arch: 'blob', scale: 1.25, hover: 0 },
  pet_bat: { piece: 'pet_bat', arch: 'fly', scale: 0.9, hover: 1.6, flap: 20, amp: 0.8 },
  pet_fairy: { piece: 'pet_fairy', arch: 'fly', scale: 1.2, hover: 1.7, flap: 30, amp: 0.7 },
  pet_wolf: { piece: 'pet_wolf', arch: 'quad', scale: 1.1, hover: 0 },
  pet_dragon: { piece: 'pet_dragon', arch: 'fly', scale: 0.8, hover: 0.9, flap: 11, amp: 0.6 },
  pet_rock: { piece: 'pet_rock', arch: 'blob', scale: 1.5, hover: 0 },
  pet_golem: { piece: 'pet_golem', arch: 'biped', scale: 1.1, hover: 0 },
  pet_phoenix: { piece: 'pet_phoenix', arch: 'fly', scale: 0.85, hover: 1.4, flap: 10, amp: 0.65 },
  pet_fox: { piece: 'pet_fox', arch: 'quad', scale: 1.1, hover: 0 },
  pet_owl: { piece: 'pet_owl', arch: 'fly', scale: 1.0, hover: 1.5, flap: 12, amp: 0.6 },
  pet_mimic: { piece: 'pet_mimic', arch: 'blob', scale: 1.2, hover: 0 },
  pet_sprite: { piece: 'pet_sprite', arch: 'float', scale: 1.2, hover: 1.7 },
  pet_turtle: { piece: 'pet_turtle', arch: 'quad', scale: 1.2, hover: 0 },
  pet_shadowcat: { piece: 'pet_shadowcat', arch: 'quad', scale: 1.15, hover: 0 },
  pet_crystal: { piece: 'pet_crystal', arch: 'biped', scale: 1.1, hover: 0 },
  pet_leviathan: { piece: 'pet_leviathan', arch: 'float', scale: 0.75, hover: 1.5 },
  pet_demigod: { piece: 'pet_demigod', arch: 'float', scale: 1.1, hover: 1.5 },
};
