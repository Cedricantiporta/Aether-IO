// Codex catalogue + discovery keys (pure data; shared by store.ts and ui/screens/Codex.tsx).
import { ITEMS_POOL, PETS_POOL, SKILLS_INFO } from './constants';
import { LOOT } from './loot';
import { ENEMY_DEFS, MINI_BOSSES, REGION_AFFINITY, BOSS_NAMES, BOSS_ROTATION } from './engine/enemyDefs';
import type { EnemyKind } from './engine/types';

export type CodexTab = 'items' | 'pets' | 'skills' | 'loot' | 'monsters';
export interface Discovered { items: string[]; pets: string[]; skills: string[]; loot: string[]; monsters: string[] }
export const emptyDiscovered = (): Discovered => ({ items: [], pets: [], skills: [], loot: [], monsters: [] });
export const CODEX_REWARD_GEMS = 50;

export interface MonsterEntry { key: string; name: string; title: string; kind: EnemyKind; tier: 'MONSTER' | 'ELITE' | 'MINI-BOSS' | 'BOSS'; region: string; trick: string; color: number }

const TRICKS: Partial<Record<EnemyKind, string>> = {
  SLIME: 'Spits a goo puddle that slows you.', GOBLIN: 'Lobs a firebomb that leaves burning ground.', BAT: 'Screeches, disorienting everything nearby.',
  SKELETON_ARCHER: 'Fires a pinning arrow that roots you.', CULTIST: 'Casts a curse that silences your skills.', BOMBER: 'Fuses and explodes after a short ring telegraph.',
  BRUTE: 'Ground stomp, then a telegraphed charge.', SPLITTER: 'Splits into three slimes when it dies.', ZOMBIE: 'Throws a plague patch and grabs to slow you.',
  WRAITH: 'Phases through obstacles and terrifies with a fear pulse.', CRYSTAL_GOLEMITE: 'Raises crystal walls; shatters into shards on death.',
  BANDIT: 'Scatters caltrops, drops smoke and dash-slashes.', BOAR: 'Charges in a straight line with heavy knockback.', ROCK_CRAB: 'Armoured front; pinches at close range and sidesteps.',
  BOSS_GOLEM: 'Telegraphed ground slams, rock rings and a crushing charge.', BOSS_LICH: 'Bullet-hell spirals, teleports and summons minions.',
  BOSS_TREANT: 'Root lanes that pin you, a sapling brood that heals him, thorn rings to jump, and bark armor until staggered. Wave 30.',
  BOSS_HYDRA: 'Three severable heads shield the body. Acid spit, tail sweep cone and a submerge ambush. Wave 40.',
  BOSS_WYRM: 'Frost breath that chills to a freeze, ice spike lanes, a dive bomb and a blizzard phase. Wave 50.',
  BOSS_WARLORD: 'Flame wheel, fire pillar salvos, fire imps and a hellcleave; enrages below 30% hp. Wave 60.',
  BOSS_VOID: 'Shooting portals, a gravity pull-then-push, echoes of fallen bosses and a shrinking arena. Wave 70.',
};
const REGION_LABEL = (r: string) => r.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
const regionOf = (k: EnemyKind): string => {
  const a = REGION_AFFINITY[k];
  if (!a) return 'Anywhere';
  return Object.entries(a).filter(([, v]) => v >= 3).map(([r]) => REGION_LABEL(r)).join(', ') || 'Anywhere';
};

export const CODEX_MONSTERS: MonsterEntry[] = [
  ...(Object.keys(ENEMY_DEFS) as EnemyKind[]).filter((k) => !k.startsWith('BOSS_')).map((k): MonsterEntry => ({
    key: k, name: ENEMY_DEFS[k].name, title: '', kind: k, tier: 'MONSTER', region: regionOf(k), trick: TRICKS[k] ?? '', color: ENEMY_DEFS[k].color,
  })),
  { key: 'ELITE', name: 'Elite', title: 'Affixed champion', kind: 'BRUTE', tier: 'ELITE', region: 'Wave 5+, every 3 waves', trick: 'Any monster with an affix: hasted, vampiric, frozen, volatile or shielded.', color: 0xfbbf24 },
  ...Object.entries(MINI_BOSSES).map(([id, m]): MonsterEntry => ({
    key: 'MINI_' + id, name: m.name, title: m.title, kind: m.kind, tier: 'MINI-BOSS', region: m.regions.map(REGION_LABEL).join(', '), trick: 'Scripted attack timeline; stagger-resistant. Appears on waves 5, 15, 25...', color: ENEMY_DEFS[m.kind].color,
  })),
  ...BOSS_ROTATION.map((k, i): MonsterEntry => ({
    key: k, name: BOSS_NAMES[k].name, title: BOSS_NAMES[k].title, kind: k, tier: 'BOSS', region: i < 2 ? 'Every 10th wave' : `Wave ${(i + 1) * 10}`, trick: TRICKS[k] ?? '', color: ENEMY_DEFS[k].color,
  })),
];

/** Item/pet/loot discovery key: the template name (instances have unique ids, names are stable). */
export const itemKey = (i: { name: string }): string => i.name;

export const CODEX_KEYS: Record<CodexTab, string[]> = {
  items: [...new Set(ITEMS_POOL.map((i) => i.name))],
  pets: [...new Set(PETS_POOL.map((i) => i.name))],
  skills: Object.keys(SKILLS_INFO),
  loot: LOOT.map((l) => l.name),
  monsters: CODEX_MONSTERS.map((m) => m.key),
};

/** Monster key for a bossSpawn event name (boss or mini-boss). */
export const monsterKeyByName = (name: string): string | null => CODEX_MONSTERS.find((m) => (m.tier === 'MINI-BOSS' || m.tier === 'BOSS') && m.name === name)?.key ?? null;
