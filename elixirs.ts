// ============================================================================
// Elixirs: brewed at the Elixir Brewer's hut outside the town gate from monster parts (loot.ts) + gold.
// An elixir is a stackable bag item (type 'ELIXIR'). Drinking one grants its buff for ONE run:
//   * drunk in town  -> queued, it takes effect when the next run starts and fades when that run ends
//   * drunk in a run -> takes effect at once, for the rest of that run
// One of each kind can be active at a time (they do not stack with themselves, different kinds stack).
// Pure data + helpers (no store / React imports).
// ============================================================================
import type { Item, PlayerStats, Rarity } from './types';
import { GOLD_SCALE } from './constants';
import type { LootNeed } from './crafting';

export type ElixirId = 'might' | 'iron' | 'swift' | 'fortune' | 'vigor' | 'fireward' | 'steadfast' | 'poisonward';
export const ELIXIR_IDS: ElixirId[] = ['might', 'iron', 'swift', 'vigor', 'fortune', 'fireward', 'steadfast', 'poisonward'];

export interface ElixirDef {
  id: ElixirId; name: string; rarity: Rarity;
  /** short effect text (HUD / panel) */
  effect: string;
  /** liquid colour of the flask (icons, HUD) */
  color: string;
  gold: number;
  parts: LootNeed[];
}

// Balance (owner 2026-10-26): every buff applies to the FINAL stats (gear + talents + cards included, see store.calculateStats), so it stays
// worth its price late game. Core elixirs ~ a Rare run card (+12-15% of one pillar: damage / attack speed / effective HP); the
// resistance elixirs are situational and cheaper (+25% of one resistance, the hard cap is 60%); Fortune is the Epic economy one.
export const ELIXIRS: Record<ElixirId, ElixirDef> = {
  might:   { id: 'might',   name: 'Elixir of Might',     rarity: 'RARE', effect: '+12% damage',       color: '#ff7a2a', gold: 250 * GOLD_SCALE, parts: [{ id: 'goblin_ear', count: 6 }, { id: 'ogre_tusk', count: 4 }, { id: 'brute_knuckle', count: 1 }] },
  iron:    { id: 'iron',    name: 'Elixir of Iron',      rarity: 'RARE', effect: '+30% defense',      color: '#9eacc2', gold: 250 * GOLD_SCALE, parts: [{ id: 'beetle_shell', count: 6 }, { id: 'old_bone', count: 6 }, { id: 'brute_knuckle', count: 1 }] },
  swift:   { id: 'swift',   name: 'Elixir of Swiftness', rarity: 'RARE', effect: '+12% attack speed', color: '#5fd35a', gold: 250 * GOLD_SCALE, parts: [{ id: 'bat_wing', count: 6 }, { id: 'slime_gel', count: 6 }, { id: 'echo_crystal', count: 1 }] },
  vigor:   { id: 'vigor',   name: 'Elixir of Vigor',     rarity: 'RARE', effect: '+15% max HP',       color: '#ff4a5e', gold: 250 * GOLD_SCALE, parts: [{ id: 'slime_gel', count: 6 }, { id: 'ogre_tusk', count: 3 }, { id: 'shimmer_core', count: 1 }] },
  fortune: { id: 'fortune', name: 'Elixir of Fortune',   rarity: 'EPIC', effect: '+30% gold find, +10% XP', color: '#ffc94a', gold: 350 * GOLD_SCALE, parts: [{ id: 'goblin_ear', count: 5 }, { id: 'cultist_rune', count: 5 }, { id: 'dark_page', count: 1 }] },
  fireward:   { id: 'fireward',   name: 'Elixir of Fire Ward',   rarity: 'RARE', effect: '+25% fire resistance',   color: '#ff6a2e', gold: 200 * GOLD_SCALE, parts: [{ id: 'beetle_shell', count: 5 }, { id: 'ogre_tusk', count: 3 }, { id: 'volatile_gland', count: 1 }] },
  steadfast:  { id: 'steadfast',  name: 'Elixir of Steadfast',   rarity: 'RARE', effect: '+25% CC resistance',     color: '#c9a2ff', gold: 200 * GOLD_SCALE, parts: [{ id: 'goblin_ear', count: 4 }, { id: 'bat_wing', count: 4 }, { id: 'brute_knuckle', count: 1 }] },
  poisonward: { id: 'poisonward', name: 'Elixir of Poison Ward', rarity: 'RARE', effect: '+25% poison resistance', color: '#9be83a', gold: 200 * GOLD_SCALE, parts: [{ id: 'slime_gel', count: 5 }, { id: 'old_bone', count: 5 }, { id: 'shimmer_core', count: 1 }] },
};

export const ELIXIR_BY_NAME: Record<string, ElixirDef> = Object.fromEntries(ELIXIR_IDS.map((k) => [ELIXIRS[k].name, ELIXIRS[k]]));
export const elixirOf = (item: Item | null | undefined): ElixirDef | null => (item && item.type === 'ELIXIR' ? ELIXIR_BY_NAME[item.name] ?? null : null);
export const isElixirId = (v: unknown): v is ElixirId => typeof v === 'string' && (ELIXIR_IDS as string[]).includes(v);

/** Bag item for an elixir (stacks by name like potions). */
export function elixirItem(id: ElixirId, quantity = 1): Item {
  const d = ELIXIRS[id];
  return {
    id: `elixir_${id}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: d.name, type: 'ELIXIR', stats: {}, rarity: d.rarity, price: Math.round(d.gold * 0.25), level: 1, quantity,
    description: `${d.effect} for one run. Drink it in town to take it into your next adventure (or mid-run for the rest of that run).`,
  };
}

// The elixirs active in the current run (store keeps this in sync with elixirsRun before every stats recalculation).
let ACTIVE: ElixirId[] = [];
export const setActiveElixirs = (ids: readonly ElixirId[]): void => { ACTIVE = ids.slice(); };

/** The active elixir buffs applied to the FINAL stats (in place; called by store.calculateStats before the stat caps). */
export function applyActiveElixirs(f: PlayerStats): void {
  for (const id of ACTIVE) {
    switch (id) {
      case 'might': f.damage *= 1.12; break;
      case 'iron': f.defense = (f.defense || 0) + Math.max(12, (f.defense || 0) * 0.3); break;
      case 'swift': f.fireRate *= 1.12; break;
      case 'vigor': f.maxHealth *= 1.15; break;
      case 'fortune': f.goldFind = (f.goldFind || 0) + 0.3; f.xpBonus = (f.xpBonus || 0) + 0.1; break;
      case 'fireward': f.resBurn = (f.resBurn || 0) + 0.25; break;
      case 'steadfast': f.resCC = (f.resCC || 0) + 0.25; break;
      case 'poisonward': f.resPoison = (f.resPoison || 0) + 0.25; break;
    }
  }
}

/** Readable list of the elixirs a monster part goes into (loot tooltips). */
export function elixirUses(lootId: string): string {
  const names = ELIXIR_IDS.filter((k) => ELIXIRS[k].parts.some((p) => p.id === lootId)).map((k) => ELIXIRS[k].name.replace('Elixir of ', ''));
  return names.length ? `Brewing (Elixir Brewer): ${names.join(', ')}` : '';
}
