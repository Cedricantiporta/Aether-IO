// Codex catalogue + discovery keys (pure data; shared by store.ts and ui/screens/Codex.tsx).
import { ITEMS_POOL, PETS_POOL, SKILLS_INFO } from './constants';
import { LOOT } from './loot';
import { ENEMY_DEFS, MINI_BOSSES, BOSS_NAMES, BOSS_ROTATION } from './engine/enemyDefs';
import { BIOMES } from './engine/roomDefs';
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
  GOBLIN_ARCHER: 'Shoots volleys from a wooden archer tower. Climb up close or shoot it down.',
  LAKE_HYDRA: 'Peeks out of lakes and oases to spit venom and bite anyone on the shore; dives to hide.',
  SCARAB: 'Skitters in fast swarms. Weak alone, deadly in numbers.',
  SHIELDBEARER: 'Heavy armour and a tower shield: while braced, hits from the front deal 0. Strike from behind or after its shield bash.',
  SPORECAP: 'Waddles close, puffs up and bursts into a lingering poison spore cloud.',
  DIREWOLF: 'Hunts in packs: circles you while its pounce recharges, then leaps in a straight line.',
  HAUNTED_ARMOR: 'Empty plate armour. Raises its greatsword for a heavy cleave in front of it; step aside.',
  GARGOYLE: 'Sits perched like a statue until you come close or strike it, then takes wing and dive-bombs.',
  SCORPION: 'Cocks its tail and stings the ground in front of it, leaving an acid splash.',
  MUMMY: 'Shambles forward and hurls binding wraps that root you in place.',
  YETI: 'Charges across the room and finishes with a ground pound that packs the snow and slows you.',
  FROST_WISP: 'Keeps its distance and fires slowing ice shards; a frost nova if you get too close.',
  HELLHOUND: 'Blazing fast. Leaves burning paw prints behind and pounces like a wolf.',
  CINDER_SHAMAN: 'Calls fire down on where you stand, and where you are running to.',
  VOID_STALKER: 'Blinks behind you, then strikes the spot you are standing on. Keep moving.',
  VOID_EYE: 'Floats out of reach and fires rings of void orbs in every direction.',
  BANDIT: 'Scatters caltrops, drops smoke and dash-slashes.', BOAR: 'Charges in a straight line with heavy knockback.', ROCK_CRAB: 'Armoured front; pinches at close range and sidesteps.',
  BOSS_GOLEM: 'Telegraphed ground slams, rock rings and a crushing charge.', BOSS_LICH: 'Bullet-hell spirals, teleports and summons minions.',
  BOSS_TREANT: 'Root lanes that pin you, a sapling brood that heals him, thorn rings to jump, and bark armor until staggered.',
  BOSS_HYDRA: 'Three severable heads shield the body. Acid spit, tail sweep cone and a submerge ambush.',
  BOSS_WYRM: 'Frost breath that chills to a freeze, ice spike lanes, a dive bomb and a blizzard phase.',
  BOSS_WARLORD: 'Flame wheel, fire pillar salvos, fire imps and a hellcleave; enrages below 30% hp.',
  BOSS_VOID: 'Shooting portals, a gravity pull-then-push, echoes of fallen bosses and a shrinking arena.',
};
/** Biomes whose roster contains the kind. */
const regionOf = (k: EnemyKind): string => {
  const names = BIOMES.filter((b) => b.roster.some((r) => r[0] === k)).map((b) => b.name);
  return names.length === 0 ? 'Elsewhere' : names.length === BIOMES.length ? 'Everywhere' : names.join(', ');
};
const bossBiome = (k: EnemyKind): string => {
  const b = BIOMES.find((x) => x.boss === k);
  return b ? `${b.name} boss` : 'Crypt mini-boss';
};
const miniBiomes = (id: string): string => BIOMES.filter((b) => b.minis.includes(id)).map((b) => b.name).join(', ') || 'Anywhere';

export const CODEX_MONSTERS: MonsterEntry[] = [
  ...(Object.keys(ENEMY_DEFS) as EnemyKind[]).filter((k) => !k.startsWith('BOSS_')).map((k): MonsterEntry => ({
    key: k, name: ENEMY_DEFS[k].name, title: '', kind: k, tier: 'MONSTER', region: regionOf(k), trick: TRICKS[k] ?? '', color: ENEMY_DEFS[k].color,
  })),
  { key: 'ELITE', name: 'Elite', title: 'Affixed champion', kind: 'BRUTE', tier: 'ELITE', region: 'Elite rooms', trick: 'Any monster with an affix: hasted, vampiric, frozen, volatile or shielded.', color: 0xfbbf24 },
  ...Object.entries(MINI_BOSSES).map(([id, m]): MonsterEntry => ({
    key: 'MINI_' + id, name: m.name, title: m.title, kind: m.kind, tier: 'MINI-BOSS', region: miniBiomes(id), trick: 'Scripted attack timeline; stagger-resistant. Guards champion rooms.', color: ENEMY_DEFS[m.kind].color,
  })),
  ...BOSS_ROTATION.map((k): MonsterEntry => ({
    key: k, name: BOSS_NAMES[k].name, title: BOSS_NAMES[k].title, kind: k, tier: 'BOSS', region: bossBiome(k), trick: TRICKS[k] ?? '', color: ENEMY_DEFS[k].color,
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
