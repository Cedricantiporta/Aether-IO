// ============================================================================
// Run structure data (pure, no side effects): biomes, room types, rewards, depth scaling, portal choices.
// A run = biomes of ROOMS_PER_BIOME rooms followed by a boss room. See docs/RUN_DESIGN.md.
// ============================================================================
import type { EnemyKind, ObstacleKind, CrateKind, RoomPlan, RoomType, RewardKind, RoomObjective, RoomTwist } from './types';
import type { BossKind } from './enemyDefs';
import type { Rarity } from '../types';

export const ROOMS_PER_BIOME = 14;         // normal rooms before the boss room (room index ROOMS_PER_BIOME): 15 depths per biome
export const BOSS_INDEX = ROOMS_PER_BIOME;   // the biome boss: depth 15
export const PREBOSS_INDEX = 9;              // the pre-boss: depth 10 (Meadow: the Slime King; elsewhere a biome champion)
export const REST_INDEX = ROOMS_PER_BIOME - 1; // the room before the boss is always a fountain / merchant
/** Depth shown to the player (1-based, 15 per biome). */
export const shownDepth = (biome: number, index: number): number => biome * (BOSS_INDEX + 1) + index + 1;

/** Depth scaling: feeds waveHpMult / waveDmgMult / budget. Boss room of biome b = 10 * (b + 1). */
export function depthWave(biome: number, index: number): number {
  if (index >= BOSS_INDEX) return 10 * (biome + 1);
  return biome * 10 + 1 + Math.round(index * 0.65);   // (difficulty curve unchanged: 15 rooms span the same 10 waves)
}

/** Ground look family (render/Room.tsx picks the detail texture + colour pattern). */
export type GroundStyle = 'GRASS' | 'MARBLE' | 'SAND' | 'SNOW' | 'BASALT' | 'VOID';
export type BiomeHazard = 'PUDDLE' | 'GAS' | 'QUICKSAND' | null;
export type LiquidKind = 'WATER' | 'LAVA' | 'CHASM' | 'ICE';

/** A sub-look of a biome (Greenwood: meadow / deep grove / mire). Rolled per room from the room seed. */
export interface BiomeVariant {
  name: string;
  ground: [string, string]; patch: [string, string, string]; edge?: string; propTint?: string;
  border: ObstacleKind[]; interior: ObstacleKind[]; hazard: BiomeHazard;
}

export interface BiomeDef {
  name: string;
  style: GroundStyle;
  ground: [string, string];      // ground vertex-colour noise endpoints
  patch: [string, string, string]; // big colour zones: [lush, dry, dirt]
  stone: string;                 // path / slab stone
  edge: string;                  // floor beyond the walls
  fog: string;
  hemiSky: string; hemiGround: string; hemiI: number;
  sun: string; sunI: number;
  skyTint: [number, number, number]; // multiplies the sky dome
  propTint: string;              // multiplies prop colours
  border: ObstacleKind[];        // walls ring
  outer?: ObstacleKind[];        // decorative outer ring (defaults to border)
  interior: ObstacleKind[];      // scattered obstacles
  hazard: BiomeHazard;
  /** Liquid of river / lake stages: water, lava, a chasm (bottomless) or icy water. */
  river: LiquidKind;
  lake: LiquidKind;
  /** Stage layout weights [PLAIN, BIG, LONG, RIVER, LAKE] for fight rooms. */
  layouts: [number, number, number, number, number];
  /** Outline weights for fight rooms (interior biomes prefer halls). */
  shapes?: [string, number][];
  towers: boolean;               // goblin archer towers appear in fight rooms
  hydras: boolean;               // lake stages hide lurking hydras
  variants?: BiomeVariant[];
  crates: CrateKind[];
  boss: BossKind;
  minis: string[];               // keys of enemyDefs.MINI_BOSSES
  lichCrypt: boolean;            // the Lich may appear as a mini-boss here
  roster: readonly (readonly [EnemyKind, number, number])[]; // kind, weight, first room index
}

export const BIOMES: readonly BiomeDef[] = [
  { // 0 Greenwood: the old Meadow / Old Grove / Mire looks as three room variants of one forest biome (Gorath, the Slime King)
    name: 'Greenwood', style: 'GRASS', ground: ['#3f9c34', '#76c648'], patch: ['#5fb83e', '#b7c45a', '#8f7448'], stone: '#a39d90', edge: '#2a4a22', fog: '#cfe6f2',
    hemiSky: '#cfe8ff', hemiGround: '#6f8f45', hemiI: 1.25, sun: '#fff0d2', sunI: 3.1, skyTint: [1, 1, 1], propTint: '#ffffff',
    border: ['TREE', 'PINE', 'TREE', 'ROCK'], interior: ['ROCK', 'STUMP', 'LOG', 'TREE', 'ROCK'], hazard: null,
    river: 'WATER', lake: 'WATER', layouts: [40, 14, 10, 20, 16], towers: true, hydras: true,
    variants: [
      { name: 'Meadow', ground: ['#3f9c34', '#76c648'], patch: ['#5fb83e', '#b7c45a', '#8f7448'], propTint: '#ffffff',
        border: ['TREE', 'PINE', 'TREE', 'ROCK'], interior: ['ROCK', 'STUMP', 'LOG', 'TREE', 'ROCK'], hazard: null },
      { name: 'Deep Grove', ground: ['#2b6a2f', '#4a8a3a'], patch: ['#3a8a3a', '#7d8a3e', '#5a4630'], edge: '#16301a', propTint: '#cfe8c0',
        border: ['PINE', 'TREE', 'PINE', 'TREE', 'PINE'], interior: ['STUMP', 'LOG', 'RUIN', 'ROCK', 'PINE'], hazard: null },
      { name: 'Mire', ground: ['#4a5a2e', '#6b7a3a'], patch: ['#5c6e34', '#7e7a44', '#4a3e26'], edge: '#232a14', propTint: '#b8c890',
        border: ['DEAD_TREE', 'TREE', 'STUMP', 'DEAD_TREE', 'ROCK'], interior: ['STUMP', 'LOG', 'DEAD_TREE', 'ROCK', 'LOG'], hazard: 'PUDDLE' },
    ],
    crates: ['CRATE', 'BARREL', 'POT', 'POT', 'HAY'],
    boss: 'BOSS_GOLEM', minis: ['TUSK', 'CAPTAIN'], lichCrypt: false,
    roster: [['SLIME', 10, 0], ['GOBLIN', 9, 0], ['BAT', 5, 1], ['BOAR', 4, 1], ['SKELETON_ARCHER', 4, 2], ['BANDIT', 3, 3], ['BOMBER', 3, 4], ['ZOMBIE', 2, 6], ['SPLITTER', 2, 7], ['DIREWOLF', 5, 2], ['SPORECAP', 4, 3]],
  },
  { // 1 Marble Halls: the ruined castle of the old kings, its halls cracked by Elderroot's roots (Elderroot the Ancient).
    // Inside the castle: flagstone floors with a worn red carpet, broken curtain walls with torches, banners and arched
    // windows, toppled pillars and rubble. No water stages here (user request).
    name: 'Marble Halls', style: 'MARBLE', ground: ['#7c766c', '#958f83'], patch: ['#8a8478', '#6a655c', '#4f5a3c'], stone: '#a39d90', edge: '#0c0a08', fog: '#241d17',
    hemiSky: '#ffd9a8', hemiGround: '#3a2e24', hemiI: 0.95, sun: '#ffcf96', sunI: 2.2, skyTint: [0.3, 0.25, 0.22], propTint: '#ffffff',
    border: ['CASTLEWALL'], outer: ['CASTLEWALL', 'COLUMN'], interior: ['COLUMN', 'STATUE', 'BRAZIER', 'RUIN', 'COLUMN', 'LOWWALL', 'BRAZIER'], hazard: null,
    river: 'WATER', lake: 'WATER', layouts: [46, 24, 30, 0, 0], towers: false, hydras: false,
    shapes: [['RECT', 30], ['HEX', 12], ['OCT', 16], ['CROSS', 18], ['ROUND', 8], ['SEMI', 8], ['ELLIPSE', 8]],
    crates: ['POT', 'POT', 'CRATE', 'GRAVE', 'BARREL'],
    boss: 'BOSS_TREANT', minis: ['PHALANX', 'WARDEN'], lichCrypt: true,
    roster: [['SKELETON_ARCHER', 8, 0], ['SHIELDBEARER', 6, 0], ['CULTIST', 6, 0], ['GOBLIN', 5, 0], ['BAT', 4, 0], ['WRAITH', 5, 1], ['ZOMBIE', 4, 1], ['SPLITTER', 3, 2], ['BRUTE', 3, 3], ['HAUNTED_ARMOR', 6, 0], ['GARGOYLE', 5, 1]],
  },
  { // 2 Sunscorch Desert: dunes, cacti, sandstone, bleached bones, quicksand, canyon chasms; oases hide the hydra (The Mire Hydra)
    name: 'Sunscorch Desert', style: 'SAND', ground: ['#d9b46a', '#efd08a'], patch: ['#e8c47a', '#c99a55', '#b07a40'], stone: '#c8a070', edge: '#a8824a', fog: '#f0d6a4',
    hemiSky: '#ffe8c0', hemiGround: '#b08850', hemiI: 1.35, sun: '#fff0c8', sunI: 3.4, skyTint: [1.12, 1.0, 0.82], propTint: '#ffffff',
    border: ['SANDSTONE', 'CACTUS', 'ROCK', 'SANDSTONE', 'CACTUS'], interior: ['CACTUS', 'BONES', 'SANDSTONE', 'ROCK', 'CACTUS', 'BONES'], hazard: 'QUICKSAND',
    river: 'CHASM', lake: 'WATER', layouts: [34, 20, 12, 14, 20], towers: true, hydras: true,
    crates: ['POT', 'POT', 'BARREL', 'CRATE', 'GRAVE'],
    boss: 'BOSS_HYDRA', minis: ['CAPTAIN', 'SHELLBACK'], lichCrypt: false,
    roster: [['SCARAB', 8, 0], ['BANDIT', 7, 0], ['SKELETON_ARCHER', 5, 0], ['BOMBER', 5, 0], ['ZOMBIE', 5, 1], ['ROCK_CRAB', 4, 1], ['SHIELDBEARER', 4, 2], ['BRUTE', 3, 3], ['SCORPION', 7, 0], ['MUMMY', 6, 1]],
  },
  { // 3 Frostpeak: snowfields, ice rocks, frozen rivers and lakes of black water
    name: 'Frostpeak', style: 'SNOW', ground: ['#cfe0ee', '#f2f8fd'], patch: ['#e8f2fb', '#b9c7d4', '#9aa6b2'], stone: '#a8b4c2', edge: '#aab9c8', fog: '#dbe9f5',
    hemiSky: '#e0f0ff', hemiGround: '#9ab0c8', hemiI: 1.4, sun: '#e8f4ff', sunI: 3.0, skyTint: [0.88, 0.97, 1.1], propTint: '#dff0ff',
    border: ['PINE', 'BOULDER', 'PINE', 'ICE_ROCK', 'CRYSTAL_SPIRE'], interior: ['ICE_ROCK', 'ROCK', 'CRYSTAL_SPIRE', 'BOULDER', 'PINE'], hazard: null,
    river: 'ICE', lake: 'ICE', layouts: [36, 16, 12, 18, 18], towers: false, hydras: true,
    crates: ['CRATE', 'BARREL', 'POT', 'POT'],
    boss: 'BOSS_WYRM', minis: ['SHELLBACK', 'BEHEMOTH'], lichCrypt: false,
    roster: [['GOBLIN', 6, 0], ['SKELETON_ARCHER', 7, 0], ['WRAITH', 6, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 4, 0], ['ROCK_CRAB', 5, 1], ['SHIELDBEARER', 3, 2], ['BRUTE', 4, 2], ['ZOMBIE', 3, 3], ['FROST_WISP', 7, 0], ['YETI', 4, 1]],
  },
  { // 4 Ember Wastes: basalt, obsidian, lava rivers and lava lakes crossed by stone bridges
    name: 'Ember Wastes', style: 'BASALT', ground: ['#3a2622', '#5a3226'], patch: ['#5a3222', '#8a4a26', '#2a1a14'], stone: '#6e625c', edge: '#1e1210', fog: '#7a3c2c',
    hemiSky: '#ffb090', hemiGround: '#5a2a1a', hemiI: 1.1, sun: '#ff9a60', sunI: 3.0, skyTint: [1.1, 0.7, 0.55], propTint: '#d09070',
    border: ['OBSIDIAN', 'BOULDER', 'DEAD_TREE', 'OBSIDIAN', 'ROCK'], interior: ['OBSIDIAN', 'ROCK', 'DEAD_TREE', 'RUIN', 'BOULDER'], hazard: 'GAS',
    river: 'LAVA', lake: 'LAVA', layouts: [28, 14, 10, 28, 20], towers: false, hydras: false,
    crates: ['EXPLOSIVE_BARREL', 'BARREL', 'CRATE', 'POT'],
    boss: 'BOSS_WARLORD', minis: ['CAPTAIN', 'SHELLBACK'], lichCrypt: false,
    roster: [['BOMBER', 7, 0], ['BANDIT', 6, 0], ['CULTIST', 6, 0], ['SCARAB', 5, 0], ['GOBLIN', 5, 0], ['BAT', 3, 0], ['BRUTE', 5, 1], ['SPLITTER', 4, 1], ['ROCK_CRAB', 4, 2], ['HELLHOUND', 7, 0], ['CINDER_SHAMAN', 6, 1]],
  },
  { // 5 The Void: floating shards over the abyss (chasms and pits)
    name: 'The Void', style: 'VOID', ground: ['#241a3e', '#3f2a6a'], patch: ['#33245a', '#4e2c7a', '#16102a'], stone: '#5e5878', edge: '#0e0a1c', fog: '#1c1433',
    hemiSky: '#8a70d0', hemiGround: '#241a40', hemiI: 1.0, sun: '#a890ff', sunI: 2.2, skyTint: [0.55, 0.45, 0.85], propTint: '#a090d0',
    border: ['CRYSTAL_SPIRE', 'BOULDER', 'CRYSTAL_SPIRE', 'RUIN'], interior: ['CRYSTAL_SPIRE', 'RUIN', 'STATUE', 'BOULDER', 'CRYSTAL_SPIRE'], hazard: null,
    river: 'CHASM', lake: 'CHASM', layouts: [30, 14, 10, 22, 24], towers: false, hydras: false,
    crates: ['CRATE', 'POT', 'POT', 'GRAVE'],
    boss: 'BOSS_VOID', minis: ['BEHEMOTH', 'WARDEN', 'PHALANX'], lichCrypt: true,
    roster: [['WRAITH', 8, 0], ['CULTIST', 7, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 5, 0], ['SHIELDBEARER', 4, 1], ['BRUTE', 4, 1], ['ZOMBIE', 4, 1], ['SPLITTER', 4, 2], ['BOMBER', 4, 2], ['VOID_STALKER', 7, 0], ['VOID_EYE', 6, 1]],
  },
];

/** The per-room sub-look of a biome (Greenwood: meadow / grove / mire), rolled from the room seed. */
export function variantOf(def: BiomeDef, seed: number): BiomeVariant | null {
  if (!def.variants || def.variants.length === 0) return null;
  return def.variants[((seed >>> 7) % 977) % def.variants.length];
}

export const biomeOf = (biome: number): BiomeDef => BIOMES[biome % BIOMES.length];
/** Which loop of the six biomes this is (0 = first time through). Harder each loop through depth scaling. */
export const loopOf = (biome: number): number => Math.floor(biome / BIOMES.length);

export const TYPE_NAME: Record<RoomType, string> = {
  COMBAT: 'Skirmish', ELITE: 'Elite Hunt', MINIBOSS: 'Champion', FOUNTAIN: 'Fountain', MERCHANT: 'Merchant', TREASURE: 'Treasure', SHRINE: 'Shrine', CRYSTAL: 'Crystal Cavern', BOSS: 'Boss', CAMP: 'Camp',
};
export const REWARD_NAME: Record<RewardKind, string> = {
  CARD: 'Upgrade', GOLD: 'Gold', SHARDS: 'Shards', ITEM: 'Gear', HEAL: 'Vitality', GEMS: 'Gems', NONE: '',
};
/** Portal label: [title, subtitle, icon key, css colour]. Icons are mapped by ui/room (lucide). */
export function portalLabel(plan: RoomPlan, biome: number): { title: string; sub: string; icon: string; color: string } {
  // door labels show just what the room is / gives; the sub line only carries a room objective or twist when there is one
  switch (plan.type) {
    case 'FOUNTAIN': return { title: 'Fountain', sub: '', icon: 'fountain', color: '#5fd6ff' };
    case 'MERCHANT': return { title: 'Merchant', sub: '', icon: 'merchant', color: '#f2c14e' };
    case 'CAMP': return { title: 'Camp', sub: '', icon: 'fountain', color: '#9bd26a' };
    case 'BOSS': return { title: 'Boss', sub: biomeOf(biome).name, icon: 'boss', color: '#ef6a5e' };
    case 'TREASURE': return { title: 'Treasure', sub: '', icon: 'chest', color: '#f2c14e' };
    case 'SHRINE': return { title: 'Shrine', sub: '', icon: 'shrine', color: '#c084fc' };
    case 'CRYSTAL': return { title: 'Crystal Cavern', sub: '', icon: 'gem', color: '#7fd8ff' };
    default: break;
  }
  const r = REWARD_ICON[plan.reward];
  const parts: string[] = [];
  if (plan.obj) parts.push(OBJ_NAME[plan.obj]);
  else if (plan.type === 'ELITE') parts.push('Elite');
  else if (plan.type === 'MINIBOSS') parts.push('Champion');
  if (plan.twist) parts.push(TWIST_NAME[plan.twist]);
  return { title: REWARD_NAME[plan.reward], sub: parts.join(' · '), icon: r.icon, color: r.color };
}
const REWARD_ICON: Record<RewardKind, { icon: string; color: string }> = {
  CARD: { icon: 'card', color: '#6ab0ff' }, GOLD: { icon: 'coins', color: '#fbbf24' }, SHARDS: { icon: 'shard', color: '#c084fc' },
  ITEM: { icon: 'gear', color: '#fb923c' }, HEAL: { icon: 'heart', color: '#5fd68e' }, GEMS: { icon: 'gem', color: '#22d3ee' }, NONE: { icon: 'card', color: '#ffffff' },
};

// ----------------------------------------------------------------- planning --
const pick = <T,>(opts: readonly (readonly [T, number])[]): T => {
  let r = Math.random() * opts.reduce((n, o) => n + o[1], 0);
  for (const [v, w] of opts) { r -= w; if (r <= 0) return v; }
  return opts[0][0];
};

function rollReward(type: RoomType): RewardKind {
  switch (type) {
    case 'ELITE': return pick<RewardKind>([['CARD', 45], ['ITEM', 35], ['GEMS', 10], ['SHARDS', 10]]);
    case 'MINIBOSS': return pick<RewardKind>([['ITEM', 45], ['CARD', 45], ['GEMS', 10]]);
    case 'COMBAT': return pick<RewardKind>([['CARD', 40], ['GOLD', 18], ['SHARDS', 14], ['ITEM', 14], ['HEAL', 8], ['GEMS', 6]]);
    default: return 'NONE'; // fountain / merchant / treasure / shrine / boss carry their own content
  }
}

const plan = (type: RoomType, next = 0): RoomPlan => {
  const p: RoomPlan = { type, reward: rollReward(type) };
  // from the 3rd room on: some fights carry an objective and / or a twist (shown on the portal)
  if (next >= 2 && (type === 'COMBAT' || type === 'ELITE')) {
    if (type === 'COMBAT' && Math.random() < 0.35) p.obj = pick<RoomObjective>([['DEFEND', 30], ['RESCUE', 25], ['GOBLIN', 25], ['HUNT', 20]]);
    if (Math.random() < 0.3) p.twist = pick<RoomTwist>([['TRAPS', 35], ['DARK', 25], ['CURSED', 20], ['GOLDEN', 20]]);
  }
  return p;
};
export const OBJ_NAME: Record<RoomObjective, string> = { DEFEND: 'Defend the Totem', RESCUE: 'Rescue the Captive', GOBLIN: 'Treasure Goblin', HUNT: 'Bounty Hunt' };
export const TWIST_NAME: Record<RoomTwist, string> = { DARK: 'Darkness', CURSED: 'Cursed Ground', TRAPS: 'Spike Traps', GOLDEN: 'Golden Hour' };
export const TWIST_DESC: Record<RoomTwist, string> = {
  DARK: 'The light is failing: you only see what is close.', CURSED: 'Healing is weak here, but the clear pays gems.',
  TRAPS: 'Spikes burst from the floor: watch for the red glow.', GOLDEN: 'Monsters drop extra gold.',
};

/**
 * The 1..3 rooms the exits of room `index` lead to (never repeated types). Room 0 of a biome is always a skirmish,
 * the room before the boss is a fountain and/or merchant, and the last normal room leads to the boss.
 */
export function nextChoices(biome: number, index: number, out: RoomPlan[], merchantOk = true, fountainOk = true, shrineOk = true, crystal = false, bossKey = false): number {
  out.length = 0;
  const next = index + 1;
  if (next >= BOSS_INDEX) { out.push({ type: 'BOSS', reward: 'NONE' }); return 1; }
  if (next === PREBOSS_INDEX) { out.push({ type: 'MINIBOSS', reward: 'ITEM', preboss: true }); return 1; }
  // the boss key was found: a boss door opens beside the usual ones (fight early, or keep exploring)
  if (bossKey && next > PREBOSS_INDEX) { const n = nextChoices(biome, index, out, merchantOk, fountainOk, shrineOk, crystal, false); if (n >= 3) out.pop(); out.unshift({ type: 'BOSS', reward: 'NONE' }); return out.length; }
  if (next === REST_INDEX) {
    if (fountainOk) out.push({ type: 'FOUNTAIN', reward: 'NONE' });
    if (merchantOk && (!fountainOk || Math.random() < 0.55)) out.push({ type: 'MERCHANT', reward: 'NONE' });
    if (out.length === 0) out.push(plan('COMBAT', next));
    return out.length;
  }
  const n = pick<number>([[1, 15], [2, 50], [3, 35]]);
  const used = new Set<RoomType>();
  for (let i = 0; i < n; i++) {
    const t = pick<RoomType>([
      ['COMBAT', i === 0 ? 100 : 50], ['ELITE', next >= 2 ? 16 : 0], ['MINIBOSS', next >= 3 ? 9 : 0], ['TREASURE', 9], ['SHRINE', next >= 2 && shrineOk ? 9 : 0],
      ['FOUNTAIN', next >= 2 && fountainOk ? 8 : 0], ['MERCHANT', next >= 2 && merchantOk ? 8 : 0],
    ]);
    // reward kinds may repeat between two combat doors, but special rooms only once per set
    if (t !== 'COMBAT' && used.has(t)) { out.push(plan('COMBAT', next)); continue; }
    if (t === 'MERCHANT') merchantOk = false;   // at most one merchant / fountain door per set (and per biome, see director)
    if (t === 'FOUNTAIN') fountainOk = false;
    if (t === 'SHRINE') shrineOk = false;   // one optional challenge per set (and per biome, see director)
    used.add(t);
    out.push(plan(t, next));
  }
  // this biome's crystal cavern (50% of biomes, director picks the room): an extra door, or replaces the last one
  if (crystal) { if (out.length >= 3) out.pop(); out.push({ type: 'CRYSTAL', reward: 'NONE' }); }
  return out.length;
}

export const firstPlan = (): RoomPlan => ({ type: 'COMBAT', reward: 'CARD' });

// ------------------------------------------------------------------ rewards --
const LEVELS: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/**
 * Gear rarity for a reward at `depth`. `bonus` lifts the odds (elites 0.1, chests 0.2, bosses 0.35+).
 * `bosses` = bosses already beaten this run (not counting the one whose reward this is):
 *  - MYTHIC never drops before a boss has been beaten (so never from the first boss), and stays very rare after (<= 1.5%).
 *  - LEGENDARY is a trickle in the first biome and only opens up after the first boss (+3% per boss beaten).
 */
export function rarityForDepth(depth: number, bonus = 0, bosses = 0): Rarity {
  const r = Math.random();
  const boost = 1 + bonus * 1.5;
  const mythic = bosses >= 1 ? Math.min(0.015, 0.002 * bosses * boost) : 0;
  const legendary = Math.min(0.3, (bosses >= 1 ? 0.03 + 0.03 * bosses : Math.min(0.015, Math.max(0, depth - 6) * 0.002)) * boost);
  const epic = Math.min(0.5, (0.04 + depth * 0.011) * boost);
  const rare = Math.min(0.75, 0.3 + depth * 0.012 + bonus);
  if (r < mythic) return LEVELS[4];
  if (r < mythic + legendary) return LEVELS[3];
  if (r < mythic + legendary + epic) return LEVELS[2];
  if (r < mythic + legendary + epic + rare) return LEVELS[1];
  return LEVELS[0];
}
/** Index into SHARD pickups' rarity (0 common .. 4 mythic). */
export function shardRarity(depth: number): number {
  const r = Math.random();
  return r < Math.min(0.1, depth * 0.002) ? 3 : r < Math.min(0.3, 0.02 + depth * 0.006) ? 2 : r < 0.45 ? 1 : 0;
}
