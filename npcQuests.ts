// ============================================================================
// NPC story quests: hand-written quests given by town NPCs (separate from the daily Quest Board in quests.ts).
// Pure data + helpers (no store import): the store keeps `npcQuests: NpcQuestSave` (persistent, saved in the profile),
// the logic (accept / progress / turn-in) lives in engine/systems/npcQuestLogic.ts, dialogue in systems/dialogue.ts.
// Chains: a quest with `after: '<id>'` only becomes available once that quest was turned in. `cond` hides a quest until a
// condition is met (a boss defeated at least once, hero rank).
// Reward gold is written in BASE units; it is multiplied by GOLD_SCALE when paid out.
// ============================================================================
import type { Item, Rarity } from './types';
import type { RoomType } from './engine/types';
import { LOOT_BY_ID } from './loot';

export type NpcObjectiveType =
  | 'KILL_KIND' | 'KILL_TOTAL' | 'KILL_ELITE' | 'KILL_BOSS'   // kill counts (KILL_BOSS target: a boss kind)
  | 'REACH_BIOME'                                              // count = biome number (1 Meadow, 2 Old Grove, 3 Mire ...)
  | 'COLLECT_LOOT'                                             // pick up loot items (target: loot ids, optional room type)
  | 'DELIVER'                                                  // bring loot items to the NPC; they are removed on turn-in
  | 'TALK'                                                     // speak to another NPC (target: its name)
  | 'INTERACT'                                                 // a farm / town action (target: 'milk' | 'egg' | 'cat')
  | 'ACTION';                                                  // a shop / town action (target: 'buy_potion' | 'store' | 'learn' | 'upgrade' | 'summon')

export interface NpcObjective {
  type: NpcObjectiveType;
  /** EnemyKind (KILL_KIND / KILL_BOSS), loot id(s) (COLLECT_LOOT / DELIVER), NPC name (TALK) */
  target?: string | string[];
  count: number;
  /** COLLECT_LOOT: only items picked up in this kind of room count */
  room?: RoomType;
}

export interface NpcReward {
  gold?: number;                       // base units (x GOLD_SCALE at payout)
  gems?: number;
  shards?: [Rarity, number];           // crafting shards
  items?: { id: string; qty?: number }[];   // ITEMS_POOL / PETS_POOL ids
}

export interface NpcQuestDef {
  id: string;
  giver: string;                       // NPC name (townData NPCS)
  title: string;
  /** short summary line for the tracker / log */
  summary: string;
  intro: string[];                     // offered with Accept / Later on the last line
  progress: string;                    // while the objective is unfinished
  done: string[];                      // turn-in dialogue (rewards are paid on the last line)
  objective: NpcObjective;
  reward: NpcReward;
  /** chain: the quest id that must be turned in first */
  after?: string;
  /** hidden quest: not offered (no marker) until this holds */
  cond?: { boss?: string; rank?: number };
  /** the turn-in NPC when it is not the giver */
  turnIn?: string;
}

export const NPC_QUESTS: NpcQuestDef[] = [
  // ---- Old Wend (hermit): chain of three, ends with a pet
  {
    id: 'wend_crystals', giver: 'Old Wend', title: 'A Glimmer in the Dark', summary: 'Gather 10 gems from a Crystal Cavern',
    intro: ['Hm? A hero out here? Good, my knees are no longer fit for caves.', 'Some doors in the wilds lead to a Crystal Cavern: no monsters, only glowing veins. Mine them and bring me back ten gemstones or crystals.'],
    progress: 'Ten shards of light from a Crystal Cavern, remember. The cave doors show up now and then between the fights.',
    done: ['Ahh, look at them sing! You have a good eye, hero.', 'Take this for the trouble.'],
    objective: { type: 'COLLECT_LOOT', target: ['raw_gem', 'echo_crystal', 'ore_nugget'], count: 10, room: 'CRYSTAL' },
    reward: { gold: 1500, shards: ['COMMON', 10] },
  },
  {
    id: 'wend_gems', giver: 'Old Wend', title: 'The Gemcutter\'s Favour', summary: 'Deliver 5 Raw Gemstones to Old Wend', after: 'wend_crystals',
    intro: ['I can cut stones, you know. Brings out their voice. Bring me five Raw Gemstones from your travels and I will cut them for you.'],
    progress: 'Five Raw Gemstones. Crystal veins and ore veins both give them.',
    done: ['Steady hands... there. Five fine stones, and one more thing: this core was left in my hut. Use it well.'],
    objective: { type: 'DELIVER', target: 'raw_gem', count: 5 },
    reward: { gems: 25, items: [{ id: 'upgrade_core', qty: 2 }] },
  },
  {
    id: 'wend_warden', giver: 'Old Wend', title: 'Warden of the Old Grove', summary: 'Defeat Elderroot the Ancient', after: 'wend_gems',
    intro: ['Now listen. The Old Grove has a warden, Elderroot, and he has forgotten why he guards it. He walks, he crushes, he does not listen.', 'Put him to rest, hero, and the grove will speak well of you. A friend of mine will follow you home.'],
    progress: 'Elderroot still lumbers through the Old Grove. Strike at his roots and keep moving.',
    done: ['The grove is quiet at last. I felt it from here.', 'A wolf of the wild has taken a liking to you. Treat him kindly.'],
    objective: { type: 'KILL_BOSS', target: 'BOSS_TREANT', count: 1 },
    reward: { gold: 6000, items: [{ id: 'pet_wolf' }] },
  },
  // ---- Brenna (farmer): chain of three, ends with a hood
  {
    id: 'brenna_slimes', giver: 'Brenna', title: 'Pests in the Wheat', summary: 'Defeat 30 Slimes',
    intro: ['Oh, thank the stars. Hero, the slimes keep crawling into my wheat field and I cannot swing a hoe at that many.', 'Could you defeat thirty of them out there?'],
    progress: 'Still green blobs everywhere, thirty of them. I count on you.',
    done: ['My wheat is saved! Bless you.', 'Here, this is all the spare coin I have.'],
    objective: { type: 'KILL_KIND', target: 'SLIME', count: 30 },
    reward: { gold: 800 },
  },
  {
    id: 'brenna_gel', giver: 'Brenna', title: 'Good for the Soil', summary: 'Deliver 10 Slime Gel to Brenna', after: 'brenna_slimes',
    intro: ['You know what is funny? Slime Gel makes wonderful fertiliser. Bring me ten and I will brew a batch for the whole village.'],
    progress: 'Ten Slime Gel, please. Slimes drop it now and then.',
    done: ['Smells awful, grows wonderfully! Take these potions, you have earned them.'],
    objective: { type: 'DELIVER', target: 'slime_gel', count: 10 },
    reward: { gold: 1200, items: [{ id: 'potion_hp_big', qty: 3 }] },
  },
  {
    id: 'brenna_goblins', giver: 'Brenna', title: 'Thieves in the Night', summary: 'Defeat 25 Goblins', after: 'brenna_gel',
    intro: ['Now the goblins are stealing my carrots! I cannot afford it.', 'Drive off twenty-five of them and I will give you my father\'s old hood. It has been in a chest for years.'],
    progress: 'Twenty-five goblins, hero. They are quick, so mind yourself.',
    done: ['No more midnight thieves! A promise is a promise: my father\'s hood. It suits a hero better than a farmer.'],
    objective: { type: 'KILL_KIND', target: 'GOBLIN', count: 25 },
    reward: { gold: 2000, items: [{ id: 'helm_3' }] },
  },
  // ---- singles
  {
    id: 'garrick_road', giver: 'Garrick', title: 'Mind the Road', summary: 'Reach the Mire (biome 3)',
    intro: ['Traders say the road past the Old Grove sinks into the Mire. Nobody I send comes back with a clear report.', 'Make it to the Mire, hero, and tell me what you see.'],
    progress: 'The Mire is past the Old Grove: three biomes deep. Keep going!',
    done: ['So the Mire is real, and you came back. I am impressed.', 'The watch pays for good scouting.'],
    objective: { type: 'REACH_BIOME', count: 3 },
    reward: { gold: 3000, gems: 20 },
  },
  {
    id: 'dorn_ore', giver: 'Dorn', title: 'Ore for the Forge', summary: 'Deliver 15 Ore Nuggets to Dorn',
    intro: ['My veins outside the gate are dry and the smith keeps knocking. Bring me fifteen Ore Nuggets from the wilds and I will make it worth your while.'],
    progress: 'Fifteen Ore Nuggets. Look for ore veins in the caverns.',
    done: ['Heavy and honest! This will keep the forge hot a month.', 'My share: cores for your gear, and a fistful of gold.'],
    objective: { type: 'DELIVER', target: 'ore_nugget', count: 15 },
    reward: { gold: 2500, items: [{ id: 'upgrade_core', qty: 3 }] },
  },
  {
    id: 'pip_secret', giver: 'Pip', title: 'A Secret for the Hermit', summary: 'Talk to Old Wend behind the north wall',
    intro: ['Psst! Hero! I found a shiny pebble and I think the old hermit north of town would love it.', 'But I am not allowed past the wall. Could you ask Old Wend what it is? Then come and tell me!'],
    progress: 'Did you see Old Wend yet? He lives behind the north wall of town.',
    done: ['He says it is a sunstone?! I knew it! Here, you can have some of my sweets money.'],
    objective: { type: 'TALK', target: 'Old Wend', count: 1 },
    reward: { gold: 500 },
  },
  // ---- Mira's later lessons (side quests once you reach Lv 2; the shop / pet / summon basics are in the main questline)
  {
    id: 'mira_storage', giver: 'Mira', title: 'Safe Keeping', summary: 'Store an item in the Warehouse', cond: { rank: 2 },
    intro: ['Your bag fills up fast out there. The Warehouse on the south street keeps a hundred things safe.', 'Put one item in it, so you know how it works.'],
    progress: 'Open the Warehouse and drag (or click) an item from your bag into it.',
    done: ['There you go. Camps beyond the first biome keep a storage chest that reaches the same warehouse, too.'],
    objective: { type: 'ACTION', target: 'store', count: 1 },
    reward: { gold: 400 },
  },
  {
    id: 'mira_training', giver: 'Mira', title: 'Train Hard', summary: 'Learn or upgrade a skill at the Skill Trainer', after: 'mira_storage',
    intro: ['Skill points come with every level. The trainer by the north street turns them into real skills.', 'Spend a point at the Skill Trainer. The camps out in the wilds have a training post as well.'],
    progress: 'Talk to the Skill Trainer on the north street and spend a skill point.',
    done: ['Feel that? New skills unlock as your level climbs: skill 2 at level 5, skill 3 at level 10.'],
    objective: { type: 'ACTION', target: 'learn', count: 1 },
    reward: { gold: 500, gems: 5 },
  },
  {
    id: 'mira_forge', giver: 'Mira', title: 'Sharpen Up', summary: 'Upgrade a piece of gear at the Blacksmith', after: 'mira_training',
    intro: ['Last lesson: gear. The Blacksmith at the east end of the south street can make it stronger.', 'Upgrade any piece once. It costs gold and an Upgrade Core.'],
    progress: 'Bring gold and an Upgrade Core to the Blacksmith and upgrade one item.',
    done: ['Now you are ready. Go make the King proud.'],
    objective: { type: 'ACTION', target: 'upgrade', count: 1 },
    reward: { gold: 800, items: [{ id: 'upgrade_core', qty: 2 }] },
  },
  // ---- the farm outside the gate (interaction quests)
  {
    id: 'hollis_milk', giver: 'Hollis', title: 'Milk Run', summary: 'Milk the cows by the barn 3 times',
    intro: ['Ho there, guard! My back is all knots today and the girls need milking.', 'Pop round by the barn and milk them for me, would you? Three pails will do.'],
    progress: 'The cows are right by the barn. Press E next to one. Gently now!',
    done: ['Three full pails! You have a farmer\'s hands under all that armour.', 'Here, a little something, and a bottle for the road.'],
    objective: { type: 'INTERACT', target: 'milk', count: 3 },
    reward: { gold: 600, items: [{ id: 'potion_hp', qty: 2 }] },
  },
  {
    id: 'hollis_fox', giver: 'Hollis', title: 'Foxes in the Henhouse', summary: 'Defeat 20 Goblins', after: 'hollis_milk', cond: { rank: 3 },
    intro: ['Something has been raiding the coop at night. Little green thieves with sticky fingers.', 'Goblins, the lot of them. Thin them out for me: twenty ought to teach them.'],
    progress: 'Goblins skulk in the Meadow and beyond. Twenty, if you please.',
    done: ['Not a feather lost last night! You have my thanks, and the farm\'s.'],
    objective: { type: 'KILL_KIND', target: 'GOBLIN', count: 20 },
    reward: { gold: 1800, gems: 15 },
  },
  {
    id: 'dalla_eggs', giver: 'Dalla', title: 'Egg Hunt', summary: 'Collect 5 eggs from the coop nests',
    intro: ['Oh good, a pair of free hands! The hens have been laying all over the place.', 'Gather five eggs from the nests in front of the coop. Mind the beaks.'],
    progress: 'The nests are in front of the coop. A hen lays a fresh one every little while.',
    done: ['Five lovely eggs, not a crack among them!', 'Take these, I baked too much again.'],
    objective: { type: 'INTERACT', target: 'egg', count: 5 },
    reward: { gold: 500, items: [{ id: 'potion_mana', qty: 2 }] },
  },
  {
    id: 'pip_cat', giver: 'Pip', title: 'Where Is Biscuit?', summary: 'Find Pip\'s cat somewhere in town',
    intro: ['Hero! Biscuit ran away again! She is orange and grumpy and she HIDES.', 'She likes quiet corners behind the houses. Please find her!'],
    progress: 'Biscuit loves quiet corners far from the plaza... the other side of town from me, maybe?',
    done: ['BISCUIT! You found her! Bad kitty. Good hero!', 'Here, this is my whole savings. Do not tell Mum.'],
    objective: { type: 'INTERACT', target: 'cat', count: 1 },
    reward: { gold: 400, gems: 10 },
  },
  // ---- hidden: appears only after Elderroot (biome 1 boss) fell at least once
  {
    id: 'wren_champions', giver: 'Wren', title: 'Echoes of the Fallen', summary: 'Defeat 5 elite champions', cond: { boss: 'BOSS_TREANT' },
    intro: ['You... you felled the Mountain? Then my studies were right: the champions of the wilds carry a piece of its stone.', 'Defeat five elite champions and I will let you read my notes. Rewards included, of course.'],
    progress: 'Elite champions only, hero: the ones with the gold crests. Five of them.',
    done: ['Fascinating! The stone fragments hum just as predicted.', 'Your notes, your reward. Knowledge is its own treasure, but gems are nicer.'],
    objective: { type: 'KILL_ELITE', count: 5 },
    reward: { gems: 50, shards: ['RARE', 20] },
  },
  // ---- the King
  {
    id: 'king_frost', giver: 'King Aldric', title: 'The Frozen Frontier', summary: 'Reach Frostpeak (biome 4)',
    intro: ['Hero. Word reaches my court that the Frostpeak is stirring: a winter dragon, they say.', 'Go to the Frostpeak and see it with your own eyes. The crown will reward you.'],
    progress: 'The Frostpeak lies beyond the Mire, hero. Go, and return when you have seen it.',
    done: ['The Frostpeak is real, and so is the danger. Aether owes you.', 'Take the crown\'s thanks.'],
    objective: { type: 'REACH_BIOME', count: 4 },
    reward: { gold: 10000, gems: 50 },
  },
];

export const NPC_QUEST_BY_ID: Record<string, NpcQuestDef> = Object.fromEntries(NPC_QUESTS.map((q) => [q.id, q]));

// ------------------------------------------------------------------ save ---
/** s: 1 = accepted, 2 = turned in. p = progress (kill / pickup / reach counts; DELIVER reads the bag instead). */
export interface NpcQuestEntry { s: 1 | 2; p: number }
export interface NpcQuestSave {
  q: Record<string, NpcQuestEntry>;
  /** how many times each boss kind was defeated (hidden quest conditions) */
  bossKills: Record<string, number>;
}
export const emptyNpcQuests = (): NpcQuestSave => ({ q: {}, bossKills: {} });

export function sanitizeNpcQuests(raw: unknown): NpcQuestSave {
  const out = emptyNpcQuests();
  const r = raw as Partial<NpcQuestSave> | null | undefined;
  if (!r || typeof r !== 'object') return out;
  if (r.q && typeof r.q === 'object') {
    for (const [id, e] of Object.entries(r.q)) {
      if (!NPC_QUEST_BY_ID[id] || !e || (e.s !== 1 && e.s !== 2)) continue;
      out.q[id] = { s: e.s, p: Math.max(0, Number(e.p) || 0) };
    }
  }
  if (r.bossKills && typeof r.bossKills === 'object') {
    for (const [k, n] of Object.entries(r.bossKills)) if (Number(n) > 0) out.bossKills[k] = Math.floor(Number(n));
  }
  return out;
}

// --------------------------------------------------------------- queries ---
export type NpcQuestStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'DONE';

export function npcQuestStatus(def: NpcQuestDef, save: NpcQuestSave, rank: number): NpcQuestStatus {
  const e = save.q[def.id];
  if (e) return e.s === 2 ? 'DONE' : 'ACTIVE';
  if (def.after && save.q[def.after]?.s !== 2) return 'LOCKED';
  if (def.cond?.boss && !(save.bossKills[def.cond.boss] > 0)) return 'LOCKED';
  if (def.cond?.rank && rank < def.cond.rank) return 'LOCKED';
  return 'AVAILABLE';
}

const lootName = (id: string): string => LOOT_BY_ID[id]?.name ?? id;
const idsOf = (t: NpcObjective['target']): string[] => (Array.isArray(t) ? t : t ? [t] : []);

/** Bag count of the DELIVER item. */
export function bagCount(inv: readonly Item[], id: string): number {
  const name = lootName(id);
  let n = 0;
  for (const i of inv) if (i.type === 'LOOT' && i.name === name) n += i.quantity || 1;
  return n;
}

/** Current progress (capped at the target). */
export function npcQuestProgress(def: NpcQuestDef, save: NpcQuestSave, inv: readonly Item[]): number {
  const o = def.objective;
  if (o.type === 'DELIVER') return Math.min(o.count, bagCount(inv, idsOf(o.target)[0]));
  return Math.min(o.count, save.q[def.id]?.p ?? 0);
}
export const npcQuestReady = (def: NpcQuestDef, save: NpcQuestSave, inv: readonly Item[]): boolean =>
  save.q[def.id]?.s === 1 && npcQuestProgress(def, save, inv) >= def.objective.count;

/** NPC that takes the quest back. */
export const npcQuestTurnIn = (def: NpcQuestDef): string => def.turnIn ?? def.giver;

/** Marker above an NPC: 0 none, 1 new quest, 2 in progress, 3 ready to turn in. */
export function npcMarker(name: string, save: NpcQuestSave, inv: readonly Item[], rank: number): 0 | 1 | 2 | 3 {
  let m: 0 | 1 | 2 | 3 = 0;
  for (const d of NPC_QUESTS) {
    const st = npcQuestStatus(d, save, rank);
    if (st === 'ACTIVE' && npcQuestTurnIn(d) === name) { if (npcQuestReady(d, save, inv)) return 3; m = 2; }
    else if (st === 'AVAILABLE' && d.giver === name && m < 2) m = 1;
  }
  return m;
}
