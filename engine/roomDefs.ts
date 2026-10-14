// ============================================================================
// Run structure data (pure, no side effects): biomes, room types, rewards, depth scaling, portal choices.
// A run = biomes of ROOMS_PER_BIOME rooms followed by a boss room. See docs/RUN_DESIGN.md.
// ============================================================================
import type { EnemyKind, ObstacleKind, CrateKind, RoomPlan, RoomType, RewardKind } from './types';
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

export interface BiomeDef {
  name: string;
  ground: [string, string];      // ground vertex-colour noise endpoints
  edge: string;                  // floor beyond the walls
  fog: string;
  hemiSky: string; hemiGround: string; hemiI: number;
  sun: string; sunI: number;
  skyTint: [number, number, number]; // multiplies the sky dome
  propTint: string;              // multiplies prop colours
  border: ObstacleKind[];        // walls ring
  interior: ObstacleKind[];      // scattered obstacles
  hazard: 'PUDDLE' | 'GAS' | null;
  crates: CrateKind[];
  boss: BossKind;
  minis: string[];               // keys of enemyDefs.MINI_BOSSES
  lichCrypt: boolean;            // the Lich may appear as a mini-boss here
  roster: readonly (readonly [EnemyKind, number, number])[]; // kind, weight, first room index
}

export const BIOMES: readonly BiomeDef[] = [
  { // 0 Meadow
    name: 'Meadow', ground: ['#3f9c34', '#76c648'], edge: '#2a4a22', fog: '#cfe6f2',
    hemiSky: '#cfe8ff', hemiGround: '#6f8f45', hemiI: 1.25, sun: '#fff0d2', sunI: 3.1, skyTint: [1, 1, 1], propTint: '#ffffff',
    border: ['TREE', 'PINE', 'TREE', 'ROCK'], interior: ['ROCK', 'STUMP', 'LOG', 'TREE', 'ROCK'], hazard: null,
    crates: ['CRATE', 'BARREL', 'POT', 'POT', 'HAY'],
    boss: 'BOSS_GOLEM', minis: ['TUSK', 'CAPTAIN'], lichCrypt: false,
    roster: [['SLIME', 10, 0], ['GOBLIN', 9, 0], ['BAT', 5, 1], ['BOAR', 4, 1], ['SKELETON_ARCHER', 4, 2], ['BANDIT', 3, 3], ['BOMBER', 3, 4]],
  },
  { // 1 Old Grove
    name: 'Old Grove', ground: ['#2b6a2f', '#4a8a3a'], edge: '#16301a', fog: '#a9c9a2',
    hemiSky: '#b8d8b0', hemiGround: '#4b6b35', hemiI: 1.15, sun: '#e8f0c8', sunI: 2.7, skyTint: [0.8, 0.95, 0.8], propTint: '#cfe8c0',
    border: ['PINE', 'TREE', 'PINE', 'TREE', 'PINE'], interior: ['STUMP', 'LOG', 'RUIN', 'ROCK', 'STUMP'], hazard: null,
    crates: ['CRATE', 'BARREL', 'POT', 'POT', 'GRAVE'],
    boss: 'BOSS_TREANT', minis: ['TUSK', 'CAPTAIN'], lichCrypt: true,
    roster: [['GOBLIN', 8, 0], ['BOAR', 6, 0], ['BAT', 5, 0], ['BANDIT', 6, 1], ['CULTIST', 5, 1], ['SPLITTER', 4, 2], ['SKELETON_ARCHER', 4, 2], ['BRUTE', 3, 3], ['WRAITH', 3, 4]],
  },
  { // 2 Mire
    name: 'Mire', ground: ['#4a5a2e', '#6b7a3a'], edge: '#232a14', fog: '#9aa87a',
    hemiSky: '#c8d4a0', hemiGround: '#4a4a28', hemiI: 1.05, sun: '#d8e0a0', sunI: 2.5, skyTint: [0.85, 0.9, 0.7], propTint: '#b8c890',
    border: ['TREE', 'STUMP', 'TREE', 'ROCK'], interior: ['STUMP', 'LOG', 'ROCK', 'STUMP', 'LOG'], hazard: 'PUDDLE',
    crates: ['BARREL', 'POT', 'POT', 'GRAVE', 'CRATE'],
    boss: 'BOSS_HYDRA', minis: ['WARDEN'], lichCrypt: false,
    roster: [['SLIME', 8, 0], ['ZOMBIE', 8, 0], ['SPLITTER', 6, 0], ['BAT', 4, 0], ['CULTIST', 4, 1], ['BOMBER', 4, 1], ['WRAITH', 4, 2], ['BRUTE', 3, 3]],
  },
  { // 3 Frostpeak
    name: 'Frostpeak', ground: ['#cfe0ee', '#f2f8fd'], edge: '#aab9c8', fog: '#dbe9f5',
    hemiSky: '#e0f0ff', hemiGround: '#9ab0c8', hemiI: 1.4, sun: '#e8f4ff', sunI: 3.0, skyTint: [0.88, 0.97, 1.1], propTint: '#dff0ff',
    border: ['PINE', 'BOULDER', 'PINE', 'BOULDER', 'CRYSTAL_SPIRE'], interior: ['BOULDER', 'ROCK', 'CRYSTAL_SPIRE', 'ROCK', 'PINE'], hazard: null,
    crates: ['CRATE', 'BARREL', 'POT', 'POT'],
    boss: 'BOSS_WYRM', minis: ['SHELLBACK', 'BEHEMOTH'], lichCrypt: false,
    roster: [['GOBLIN', 6, 0], ['SKELETON_ARCHER', 7, 0], ['WRAITH', 6, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 4, 0], ['ROCK_CRAB', 5, 1], ['BRUTE', 4, 2], ['ZOMBIE', 3, 3]],
  },
  { // 4 Ember Wastes
    name: 'Ember Wastes', ground: ['#4a2a22', '#7a3a22'], edge: '#1e1210', fog: '#7a3c2c',
    hemiSky: '#ffb090', hemiGround: '#5a2a1a', hemiI: 1.1, sun: '#ff9a60', sunI: 3.0, skyTint: [1.1, 0.7, 0.55], propTint: '#d09070',
    border: ['BOULDER', 'ROCK', 'BOULDER', 'STUMP'], interior: ['BOULDER', 'ROCK', 'STUMP', 'RUIN', 'ROCK'], hazard: 'GAS',
    crates: ['EXPLOSIVE_BARREL', 'BARREL', 'CRATE', 'POT'],
    boss: 'BOSS_WARLORD', minis: ['CAPTAIN', 'SHELLBACK'], lichCrypt: false,
    roster: [['BOMBER', 7, 0], ['BANDIT', 6, 0], ['CULTIST', 6, 0], ['GOBLIN', 5, 0], ['BAT', 4, 0], ['BRUTE', 5, 1], ['SPLITTER', 4, 1], ['ROCK_CRAB', 4, 2]],
  },
  { // 5 The Void
    name: 'The Void', ground: ['#241a3e', '#3f2a6a'], edge: '#0e0a1c', fog: '#1c1433',
    hemiSky: '#8a70d0', hemiGround: '#241a40', hemiI: 1.0, sun: '#a890ff', sunI: 2.2, skyTint: [0.55, 0.45, 0.85], propTint: '#a090d0',
    border: ['CRYSTAL_SPIRE', 'BOULDER', 'CRYSTAL_SPIRE', 'RUIN'], interior: ['CRYSTAL_SPIRE', 'RUIN', 'STATUE', 'BOULDER', 'CRYSTAL_SPIRE'], hazard: null,
    crates: ['CRATE', 'POT', 'POT', 'GRAVE'],
    boss: 'BOSS_VOID', minis: ['BEHEMOTH', 'WARDEN'], lichCrypt: true,
    roster: [['WRAITH', 8, 0], ['CULTIST', 7, 0], ['CRYSTAL_GOLEMITE', 6, 0], ['BAT', 5, 0], ['BRUTE', 4, 1], ['ZOMBIE', 4, 1], ['SPLITTER', 4, 2], ['BOMBER', 4, 2]],
  },
];

export const biomeOf = (biome: number): BiomeDef => BIOMES[biome % BIOMES.length];
/** Which loop of the six biomes this is (0 = first time through). Harder each loop through depth scaling. */
export const loopOf = (biome: number): number => Math.floor(biome / BIOMES.length);

export const TYPE_NAME: Record<RoomType, string> = {
  COMBAT: 'Skirmish', ELITE: 'Elite Hunt', MINIBOSS: 'Champion', FOUNTAIN: 'Fountain', MERCHANT: 'Merchant', TREASURE: 'Treasure', SHRINE: 'Shrine', CRYSTAL: 'Crystal Cavern', BOSS: 'Boss',
};
export const REWARD_NAME: Record<RewardKind, string> = {
  CARD: 'Upgrade', GOLD: 'Gold', SHARDS: 'Shards', ITEM: 'Gear', HEAL: 'Vitality', GEMS: 'Gems', NONE: '',
};
/** Portal label: [title, subtitle, icon key, css colour]. Icons are mapped by ui/room (lucide). */
export function portalLabel(plan: RoomPlan, biome: number): { title: string; sub: string; icon: string; color: string } {
  switch (plan.type) {
    case 'FOUNTAIN': return { title: 'Fountain', sub: 'Heal 40% + a blessing', icon: 'fountain', color: '#5fd6ff' };
    case 'MERCHANT': return { title: 'Merchant', sub: 'Travelling shop', icon: 'merchant', color: '#f2c14e' };
    case 'BOSS': return { title: 'Boss', sub: biomeOf(biome).name, icon: 'boss', color: '#ef6a5e' };
    case 'TREASURE': return { title: 'Treasure', sub: 'Guarded chest', icon: 'chest', color: '#f2c14e' };
    case 'SHRINE': return { title: 'Shrine', sub: 'Optional challenge', icon: 'shrine', color: '#c084fc' };
    case 'CRYSTAL': return { title: 'Crystal Cavern', sub: 'Harvest only, no enemies', icon: 'gem', color: '#7fd8ff' };
    default: break;
  }
  const r = REWARD_ICON[plan.reward];
  const sub = plan.type === 'ELITE' ? 'Elite hunt' : plan.type === 'MINIBOSS' ? 'Champion' : TYPE_NAME.COMBAT;
  return { title: REWARD_NAME[plan.reward], sub, icon: r.icon, color: r.color };
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

const plan = (type: RoomType): RoomPlan => ({ type, reward: rollReward(type) });

/**
 * The 1..3 rooms the exits of room `index` lead to (never repeated types). Room 0 of a biome is always a skirmish,
 * the room before the boss is a fountain and/or merchant, and the last normal room leads to the boss.
 */
export function nextChoices(biome: number, index: number, out: RoomPlan[], merchantOk = true, fountainOk = true, shrineOk = true, crystal = false): number {
  out.length = 0;
  const next = index + 1;
  if (next >= BOSS_INDEX) { out.push({ type: 'BOSS', reward: 'NONE' }); return 1; }
  if (next === PREBOSS_INDEX) { out.push({ type: 'MINIBOSS', reward: 'ITEM', preboss: true }); return 1; }
  if (next === REST_INDEX) {
    if (fountainOk) out.push({ type: 'FOUNTAIN', reward: 'NONE' });
    if (merchantOk && (!fountainOk || Math.random() < 0.55)) out.push({ type: 'MERCHANT', reward: 'NONE' });
    if (out.length === 0) out.push(plan('COMBAT'));
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
    if (t !== 'COMBAT' && used.has(t)) { out.push(plan('COMBAT')); continue; }
    if (t === 'MERCHANT') merchantOk = false;   // at most one merchant / fountain door per set (and per biome, see director)
    if (t === 'FOUNTAIN') fountainOk = false;
    if (t === 'SHRINE') shrineOk = false;   // one optional challenge per set (and per biome, see director)
    used.add(t);
    out.push(plan(t));
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
