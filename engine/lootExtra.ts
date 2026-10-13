// Loot tables for the regional enemy kinds + mini-bosses. Merged into loot.ts's mutable
// LOOT_TABLES / LOOT_CHANCE at import time (imported by systems/enemies.ts), reusing existing item ids,
// so loot.ts needs no edit. The lead may fold these into loot.ts and delete this file.
import { LOOT_TABLES, LOOT_CHANCE } from '../loot';

export const LOOT_TABLES_EXTRA: Record<string, string[]> = {
  ZOMBIE: ['old_bone', 'grave_locket', 'cursed_skull'],
  WRAITH: ['cursed_skull', 'forbidden_sigil', 'echo_crystal'],
  CRYSTAL_GOLEMITE: ['raw_gem', 'echo_crystal', 'shimmer_core'],
  BANDIT: ['coin_pouch', 'silver_goblet', 'goblin_totem'],
  BOAR: ['ogre_tusk', 'goblin_fang'],
  ROCK_CRAB: ['ore_nugget', 'beetle_shell', 'raw_gem'],
  MINI: ['elite_trophy', 'champion_medal', 'ancient_relic', 'royal_seal'],
};
export const LOOT_CHANCE_EXTRA: Record<string, number> = { MINI: 1 };

for (const k of Object.keys(LOOT_TABLES_EXTRA)) {
  const ids = LOOT_TABLES_EXTRA[k];
  if (!LOOT_TABLES[k]) LOOT_TABLES[k] = ids;
}
for (const k of Object.keys(LOOT_CHANCE_EXTRA)) LOOT_CHANCE[k] = LOOT_CHANCE_EXTRA[k];
