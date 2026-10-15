import { GOLD_SCALE } from './constants';
// ============================================================================
// Sellable trade-goods loot (ItemType 'LOOT'): stackable to 99, no stats, rarity
// COMMON..MYTHIC. Every source (enemy kind, elites, bosses, destructibles) has a
// small table spanning rarities; drops go through rollLoot().
// Pure data + helpers (no store import) so engine, UI and quests can share it.
// ============================================================================
import type { Item, Rarity } from './types';

export const LOOT_STACK_LIMIT = 99;
export type LootGlyph =
  | 'gel' | 'ear' | 'wing' | 'bone' | 'rune' | 'shell' | 'tusk' | 'heart' | 'shard' | 'trophy' | 'goblet' | 'pouch' | 'relic'
  | 'skull' | 'crown' | 'fang' | 'totem' | 'banner' | 'eye' | 'page' | 'medal' | 'gland' | 'orb' | 'crystal' | 'nugget' | 'locket' | 'seal';

export interface LootDef {
  id: string; name: string; rarity: Rarity; glyph: LootGlyph;
  colors: [string, string];     // painted icon palette (main, accent)
  price: number; desc: string;
}

/** Base sell value by rarity (items scale slightly around it). */
const BASE: Record<Rarity, number> = { COMMON: 5, RARE: 25, EPIC: 120, LEGENDARY: 600, MYTHIC: 3000 };
const d = (id: string, name: string, rarity: Rarity, glyph: LootGlyph, colors: [string, string], desc: string, mult = 1): LootDef =>
  ({ id, name, rarity, glyph, colors, desc, price: Math.round(BASE[rarity] * mult) * GOLD_SCALE });

export const LOOT: LootDef[] = [
  d('slime_gel', 'Slime Gel', 'COMMON', 'gel', ['#7ddc4a', '#d8ffb0'], 'Sticky green goo. Alchemists pay for it.'),
  d('shimmer_core', 'Shimmering Core', 'RARE', 'orb', ['#5be8c0', '#e0fff6'], 'A glowing nucleus from a hardy slime.'),
  d('jelly_heart', 'Pulsing Jelly Heart', 'EPIC', 'gel', ['#ff6ac8', '#ffd0f0'], 'Still beating. Gross, and valuable.'),
  d('goblin_ear', 'Goblin Ear', 'COMMON', 'ear', ['#8cc24a', '#c8e89a'], 'Proof of a kill. The guard captain pays a bounty.'),
  d('goblin_fang', 'Goblin Fang Necklace', 'RARE', 'fang', ['#f0e6c8', '#8a5a30'], 'A trophy of teeth strung on twine.', 1.1),
  d('goblin_totem', "Goblin Chief's Totem", 'EPIC', 'totem', ['#c0843c', '#6fd45a'], 'Carved by a chieftain. Collectors love it.'),
  d('bat_wing', 'Bat Wing', 'COMMON', 'wing', ['#8a5cc8', '#d8b8ff'], 'Leathery and light.'),
  d('echo_crystal', 'Echo Crystal', 'RARE', 'crystal', ['#7ec8ff', '#e6f6ff'], 'Hums when you whisper near it.'),
  d('old_bone', 'Old Bone', 'COMMON', 'bone', ['#e8e0cc', '#a89c80'], 'Brittle, but the glue-maker buys it.'),
  d('cursed_skull', 'Cursed Skull', 'RARE', 'skull', ['#d8d4c4', '#9be86a'], 'Whispers in the night.', 1.1),
  d('bone_crown', 'Bone Crown', 'EPIC', 'crown', ['#efe8d4', '#b04aff'], 'A king of the dead once wore this.'),
  d('cultist_rune', 'Cultist Rune', 'COMMON', 'rune', ['#7a6a9a', '#d08aff'], 'A carved stone, warm to the touch.'),
  d('dark_page', 'Dark Tome Page', 'RARE', 'page', ['#d8c8a0', '#a040d0'], 'Scrawled with forbidden verses.'),
  d('forbidden_sigil', 'Forbidden Sigil', 'EPIC', 'rune', ['#3a1e5a', '#ff4a8a'], 'Burns with a hungry glow.', 1.1),
  d('beetle_shell', 'Beetle Shell', 'COMMON', 'shell', ['#f09a3a', '#ffd89a'], 'Hard as iron plate, light as paper.'),
  d('volatile_gland', 'Volatile Gland', 'RARE', 'gland', ['#ff7a1a', '#ffe060'], 'Handle with extreme care.'),
  d('ogre_tusk', 'Ogre Tusk', 'COMMON', 'tusk', ['#f4ecd0', '#b8a070'], 'Carvers prize the ivory.', 1.2),
  d('brute_knuckle', 'Iron Knuckle', 'RARE', 'nugget', ['#8a8f9a', '#d0d6e0'], 'Dented from many brawls.'),
  d('war_banner', 'Ogre War Banner', 'EPIC', 'banner', ['#c03a2e', '#f0d060'], 'A tattered banner of a brute clan.'),
  d('elite_trophy', 'Elite Trophy', 'RARE', 'trophy', ['#e9b949', '#fff0b0'], 'Taken from a champion.', 1.4),
  d('champion_medal', "Champion's Medal", 'EPIC', 'medal', ['#d94a3a', '#ffe08a'], 'A medal of honor, ill-gotten.', 1.2),
  d('golem_heart', 'Golem Heartstone', 'LEGENDARY', 'heart', ['#ff6a2a', '#ffd070'], 'The molten core of Gorath.'),
  d('mountain_crown', 'Crown of the Mountain', 'MYTHIC', 'crown', ['#ffb347', '#fff0b0'], 'Worn by the mountain itself.'),
  d('phylactery', 'Lich Phylactery Shard', 'LEGENDARY', 'shard', ['#9a4aff', '#d8b0ff'], 'A fragment of a soul vessel.'),
  d('lich_eye', "Lich's Eye", 'MYTHIC', 'eye', ['#5aff9a', '#e0fff0'], 'It watches. It remembers.'),
  // wave 30-70 boss trophies (one unique LEGENDARY trade good + a tradeable EPIC each)
  d('elderroot_heartwood', 'Elderroot Heartwood', 'LEGENDARY', 'heart', ['#6a9a2a', '#d8ff8a'], 'Still sprouting. The forest remembers him.', 1.3),
  d('ancient_acorn', 'Ancient Acorn', 'EPIC', 'nugget', ['#8a5a24', '#c8e870'], 'Older than the village. Do not plant it.'),
  d('hydra_fang', 'Hydra Fang', 'LEGENDARY', 'fang', ['#e8f0c8', '#3f9a3a'], 'Dripping with swamp venom.', 1.3),
  d('marsh_scale', 'Marsh Scale', 'EPIC', 'shell', ['#3f8f4a', '#b6f06a'], 'Shrugs off blades and rot alike.'),
  d('glacius_heart', 'Heart of Glacius', 'LEGENDARY', 'orb', ['#7dd3fc', '#f0fbff'], 'A frozen heartbeat, once a minute.', 1.3),
  d('frost_scale', 'Wyrm Frostscale', 'EPIC', 'shard', ['#9be0ff', '#e8f8ff'], 'Cold enough to ache through gloves.'),
  d('ignar_brand', "Ignar's Brand", 'LEGENDARY', 'banner', ['#e8451a', '#ffd070'], 'A glowing warlord sigil. Handle with tongs.', 1.3),
  d('cinder_core', 'Cinder Core', 'EPIC', 'gland', ['#ff5a1a', '#ffe060'], 'The heart of a fire imp, still warm.'),
  d('void_shard', 'Herald Void Shard', 'LEGENDARY', 'crystal', ['#a855f7', '#f0d8ff'], 'Looking at it feels like falling.', 1.3),
  d('echo_of_ruin', 'Echo of Ruin', 'EPIC', 'eye', ['#7a3ab0', '#e0c0ff'], 'Replays the last thing it saw.'),
  d('coin_pouch', 'Old Coin Pouch', 'COMMON', 'pouch', ['#9a6a38', '#ffd23a'], 'A few tarnished coins inside.'),
  d('silver_goblet', 'Silver Goblet', 'RARE', 'goblet', ['#dfe6f2', '#8a96ab'], 'Fit for a noble table.', 1.3),
  d('ancient_relic', 'Ancient Relic', 'EPIC', 'relic', ['#c8a050', '#6ae0c0'], 'Older than the village itself.', 1.2),
  d('royal_seal', 'Royal Seal', 'LEGENDARY', 'seal', ['#c83a3a', '#ffd070'], 'Stamps decrees of a lost kingdom.', 1.2),
  d('grave_locket', 'Grave Locket', 'RARE', 'locket', ['#e9c860', '#c8f0ff'], 'A faded portrait inside.'),
  d('ore_nugget', 'Ore Nugget', 'COMMON', 'nugget', ['#b87a3a', '#ffcf80'], 'Raw metal-bearing rock.'),
  d('raw_gem', 'Raw Gemstone', 'RARE', 'crystal', ['#ff6ac8', '#ffe0f4'], 'Uncut, but promising.', 1.2),
];

export const LOOT_BY_ID: Record<string, LootDef> = Object.fromEntries(LOOT.map((l) => [l.id, l]));
export const LOOT_BY_NAME: Record<string, LootDef> = Object.fromEntries(LOOT.map((l) => [l.name, l]));

/** Source key -> loot ids. Keys: EnemyKind, 'ELITE', boss kinds, CrateKind. */
export const LOOT_TABLES: Record<string, string[]> = {
  SLIME: ['slime_gel', 'shimmer_core'],
  SPLITTER: ['slime_gel', 'shimmer_core', 'jelly_heart'],
  GOBLIN: ['goblin_ear', 'goblin_fang', 'goblin_totem'],
  BAT: ['bat_wing', 'echo_crystal'],
  SKELETON_ARCHER: ['old_bone', 'cursed_skull', 'bone_crown'],
  CULTIST: ['cultist_rune', 'dark_page', 'forbidden_sigil'],
  BOMBER: ['beetle_shell', 'volatile_gland'],
  BRUTE: ['ogre_tusk', 'brute_knuckle', 'war_banner'],
  ELITE: ['elite_trophy', 'champion_medal'],
  BOSS_GOLEM: ['golem_heart', 'mountain_crown'],
  BOSS_LICH: ['phylactery', 'lich_eye'],
  BOSS_TREANT: ['ancient_acorn', 'elderroot_heartwood'],
  BOSS_HYDRA: ['marsh_scale', 'hydra_fang'],
  BOSS_WYRM: ['frost_scale', 'glacius_heart'],
  BOSS_WARLORD: ['cinder_core', 'ignar_brand'],
  BOSS_WARMACH: ['cinder_core', 'ignar_brand'],
  BOSS_VOID: ['echo_of_ruin', 'void_shard'],
  CRATE: ['coin_pouch', 'silver_goblet'],
  BARREL: ['coin_pouch', 'silver_goblet'],
  POT: ['coin_pouch'],
  CHEST: ['silver_goblet', 'ancient_relic', 'royal_seal'],
  CART: ['coin_pouch', 'silver_goblet', 'ancient_relic', 'royal_seal'],
  GRAVE: ['old_bone', 'grave_locket', 'ancient_relic'],
  CRYSTAL: ['raw_gem', 'echo_crystal'],
  ORE: ['ore_nugget', 'raw_gem'],
};

/** Chance that a kill / break rolls any loot at all (bosses and elites always do). */
export const LOOT_CHANCE: Record<string, number> = {
  CRATE: 0.2, BARREL: 0.2, POT: 0.1, CHEST: 1, CART: 1, GRAVE: 0.4, CRYSTAL: 0.35, ORE: 0.5, ELITE: 1, BOSS_GOLEM: 1, BOSS_LICH: 1, BOSS_TREANT: 1, BOSS_HYDRA: 1, BOSS_WYRM: 1, BOSS_WARLORD: 1, BOSS_WARMACH: 1, BOSS_VOID: 1,
};
export const DEFAULT_LOOT_CHANCE = 0.07;   // was 0.1

const RARITY_ORDER: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const RARITY_W: Record<Rarity, number> = { COMMON: 70, RARE: 22, EPIC: 6, LEGENDARY: 0.85, MYTHIC: 0.04 };   // mythic goods: very rare

/** Picks a loot id from a source table; `luck` (>=1) shifts odds toward higher rarities (wave, difficulty, elites). */
export function rollLoot(source: string, luck = 1, mythic = true): string | null {
  const all = LOOT_TABLES[source];
  const table = mythic || !all ? all : all.filter((id) => LOOT_BY_ID[id].rarity !== 'MYTHIC');
  if (!table || table.length === 0) return null;
  let total = 0;
  const w: number[] = [];
  for (let i = 0; i < table.length; i++) {
    const def = LOOT_BY_ID[table[i]];
    const ri = RARITY_ORDER.indexOf(def.rarity);
    // spread a rarity's weight over the items of that rarity in this table
    const same = table.filter((id) => LOOT_BY_ID[id].rarity === def.rarity).length;
    const x = (RARITY_W[def.rarity] * Math.pow(Math.max(1, luck), ri)) / same;
    w.push(x); total += x;
  }
  let r = Math.random() * total;
  for (let i = 0; i < table.length; i++) { r -= w[i]; if (r <= 0) return table[i]; }
  return table[0];
}

/** Item instance for the bag (stackable by name). */
export function lootItem(def: LootDef, quantity = 1): Item {
  return {
    id: `loot_${def.id}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: def.name, type: 'LOOT', stats: {}, rarity: def.rarity, price: def.price, level: 1, quantity, description: def.desc,
  };
}

/** Readable source list for the Codex. */
export function lootSources(id: string): string[] {
  return Object.keys(LOOT_TABLES).filter((k) => LOOT_TABLES[k].includes(id));
}
