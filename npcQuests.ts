// ============================================================================
// NPC story quests: hand-written quests given by town NPCs: a small set of 7 side quests (the daily Quest Board was cut).
// Pure data + helpers (no store import): the store keeps `npcQuests: NpcQuestSave` (persistent, saved in the profile),
// the logic (accept / progress / turn-in) lives in engine/systems/npcQuestLogic.ts, dialogue in systems/dialogue.ts.
// Chains: a quest with `after: '<id>'` only becomes available once that quest was turned in. `cond` hides a quest until a
// condition is met (a boss defeated at least once). `minLevel` gates it on the class level (store `level` / `heroRank`):
// the level at which the hero can reach the quest's biome (biome 1 ~ Lv 1-10, Marble Halls 10-20, Sunscorch 20-28,
// Frostpeak 28-36, Ember Wastes 36-44, the Void 44-50). Level-locked quests are listed (with their level) in the quest
// window's Side tab once nothing else blocks them.
// Reward gold is written in BASE units; it is multiplied by GOLD_SCALE when paid out.
// ============================================================================
import type { Item, Rarity } from './types';
import type { RoomType } from './engine/types';
import { LOOT_BY_ID } from './loot';
import { gateFlags, type GateId } from './engine/townGates';
import { sideUnlocked, unlockMirror } from './questUnlocks';

export type NpcObjectiveType =
  | 'KILL_KIND' | 'KILL_TOTAL' | 'KILL_ELITE' | 'KILL_BOSS'   // kill counts (KILL_BOSS target: a boss kind)
  | 'REACH_BIOME'                                              // count = biome number (1 Greenwood, 2 Marble Halls, 3 Sunscorch ...)
  | 'COLLECT_LOOT'                                             // pick up loot items (target: loot ids, optional room type)
  | 'DELIVER'                                                  // bring loot items to the NPC; they are removed on turn-in
  | 'TALK'                                                     // speak to another NPC (target: its name)
  | 'INTERACT'                                                 // a farm / town action (target: 'milk' | 'egg' | 'cat' | 'pin')
  | 'LISTEN'                                                   // just sit through the giver's (very long) story: done once accepted
  | 'ACTION';                                                  // a shop / town action (target: 'buy_potion' | 'store' | 'learn' | 'upgrade' | 'summon'
                                                               //   | 'catch_fish' | 'sell_fish' | 'cave_vein' | 'cave_deep' | 'buy_flask', see engine/events hub)

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
  flasks?: number;                     // spare lantern-oil flasks for the Crystal Cave (engine/systems/caveKit.ts)
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
  /** hidden quest: not offered (no marker) until this holds (`rank` = legacy alias of minLevel) */
  cond?: { boss?: string; rank?: number };
  /** class level needed before the quest is offered (shown as "Lv N" while locked) */
  minLevel?: number;
  /** the quest needs a place behind this story gate (engine/townGates.ts): hidden until it is open */
  gate?: GateId;
  /** the turn-in NPC when it is not the giver */
  turnIn?: string;
  /** TALK objectives: what the target NPC says when you pass the message on (shown first in their dialogue) */
  heard?: string | string[];
}

export const NPC_QUESTS: NpcQuestDef[] = [
  // ---- the farm outside the gate (interaction quests): milk, eggs
  {
    id: 'hollis_milk', giver: 'Hollis', title: 'Milk Run', summary: 'Milk the cows by the barn 3 times',
    intro: ['Ho there, guard! My back is all knots today and the girls need milking.', 'You:: I have never milked anything in my life.', 'Easy. Pull, do not yank. The girls are patient. Mostly.', 'Pop round by the barn and milk them for me, would you? Three pails will do.'],
    progress: 'The cows are right by the barn. Press E next to one. Gently now!',
    done: ['Three full pails! You have a farmer\'s hands under all that armour.', 'You:: Please do not tell the other guards.', 'Here, a little something, and a bottle for the road.'],
    objective: { type: 'INTERACT', target: 'milk', count: 3 },
    reward: { gold: 300, items: [{ id: 'potion_hp', qty: 1 }] },
  },
  {
    id: 'dalla_eggs', giver: 'Dalla', title: 'Egg Hunt', summary: 'Collect 5 eggs from the coop nests',
    intro: ['Oh good, a pair of free hands! The hens have been laying all over the place.', 'You:: All over the place? Even the roof?', 'Even the roof. Once in my bonnet. While I was wearing it.', 'Gather five eggs from the nests in front of the coop. Mind the beaks.'],
    progress: 'The nests are in front of the coop. A hen lays a fresh one every little while.',
    done: ['Five lovely eggs, not a crack among them!', 'You:: One hen bit me. Twice.', 'Do not tell the hens I counted. They get competitive. Take these, I baked too much again.'],
    objective: { type: 'INTERACT', target: 'egg', count: 5 },
    reward: { gold: 250, items: [{ id: 'potion_mana', qty: 1 }] },
  },
  // ---- the town: a lost cat
  {
    id: 'pip_cat', giver: 'Pip', title: 'Where Is Biscuit?', summary: 'Find Pip\'s cat somewhere in town',
    intro: ['Hero! Biscuit ran away again! She is orange and grumpy and she HIDES.', 'You:: Orange, grumpy, hides. A fearsome foe.', 'She likes quiet corners behind the houses. Please find her!'],
    progress: 'Biscuit loves quiet corners far from the plaza... the other side of town from me, maybe?',
    done: ['BISCUIT! You found her! Bad kitty. Good hero!', 'She says thank you. Well, she hissed. That is cat for thank you.', 'You:: She also bit me. What is that cat for?', 'Cat for "I love you". Probably.', 'Here, this is my whole savings. Do not tell Mum.'],
    objective: { type: 'INTERACT', target: 'cat', count: 1 },
    reward: { gold: 200, gems: 10 },
  },
  // ---- the hermit north of the wall: a secret for Old Wend (his sunstone gift is tied to this quest, townData)
  {
    id: 'pip_secret', minLevel: 3, gate: 'hermit', giver: 'Pip', title: 'A Secret for the Hermit', summary: 'Talk to Old Wend behind the north wall',
    intro: ['Psst! Hero! I found a shiny pebble and I think the old hermit north of town would love it.', 'You:: Why would a hermit love a pebble?', 'Because it is SHINY. Everybody loves shiny.', 'But I am not allowed past the wall. Could you ask Old Wend what it is? Then come and tell me!'],
    progress: 'Did you see Old Wend yet? He lives behind the north wall of town.',
    heard: ['A shiny pebble, warm to the touch? That is a sunstone, child.', 'You:: A sunstone? Is it dangerous?', 'Only to socks. Tell little Pip to keep it out of the rain: it sulks when it gets wet.'],
    done: ['He says it is a sunstone?! I KNEW it! I am going to keep it in my sock drawer. With the other socks.', 'You:: Is that where all your treasures live?', 'And my frog. His name is Sir Frog.', 'Here, you can have some of my sweets money. Not all of it. Some of it.'],
    objective: { type: 'TALK', target: 'Old Wend', count: 1 },
    reward: { gold: 450, gems: 5 },
  },
  // ---- the chapel: a roguelite errand (zombies roam the Greenwood and the halls)
  {
    id: 'elowen_graves', minLevel: 3, giver: 'Sister Elowen', title: 'Restless Graves', summary: 'Put 12 zombies to rest',
    intro: ['Child, the dead are not sleeping as they should. The graveyard behind the chapel groans at night.', 'You:: Groaning graves. Lovely.', 'Out in the wilds, the restless walk as zombies. Put twelve of them to rest, and the Flame will be grateful.', '...And so will I. The groaning keeps me up.'],
    progress: 'Twelve of the restless, child. Zombies roam the Greenwood and the halls beyond it.',
    done: ['The graves are quiet again. Thank you.', 'You:: They went quietly. Mostly.', 'The Flame does not pay in gold, but the collection box does. Take this.'],
    objective: { type: 'KILL_KIND', target: 'ZOMBIE', count: 12 },
    reward: { gold: 600, items: [{ id: 'potion_hp_big', qty: 2 }] },
  },
  // ---- the tavern: goblets come out of run crates and barrels
  {
    id: 'rodric_goblets', minLevel: 8, giver: 'Rodric the Tipsy', title: 'The Lost Tankards', summary: 'Find 2 Silver Goblets for Rodric',
    intro: ['Psst. Hero. I may have... wagered Marta\'s silver goblets. On a duel. With a goblin.', 'You:: Another goblin? Rodric...', 'I lost. To the goblin. Find me two Silver Goblets out there before she counts them, and I will make it worth your while.'],
    progress: 'Two Silver Goblets. Quietly. She is counting the mugs again.',
    done: ['Shh! Put them on the shelf. Behind the cider. Perfect.', 'You:: This is the last time I hide your goblets.', 'You saved my life. Or at least my tab. Take this.'],
    objective: { type: 'DELIVER', target: 'silver_goblet', count: 2 },
    reward: { gold: 1250, gems: 15, items: [{ id: 'reforge_stone', qty: 1 }] },
  },
  // ---- (owner) Lv 30: Erin and the rockfall. Done -> the rocks shatter (townData rockfallCleared) and the old miners' road
  //      over the green is a shortcut to the mines.
  {
    id: 'erin_boulder', minLevel: 30, gate: 'cave', giver: 'Erin', title: 'Beyond the Rocks', summary: 'Ask Grit in the Crystal Cave how to break the rockfall',
    intro: [
      'You! You look strong. Stronger than me. For now.',
      'You:: I like the confidence.',
      'This rockfall came down the night the kingdom fell. The whole hill shook, the south-east tower cracked, and half the hillside slid onto the miners\' road.',
      'Nobody has cleared it since. "Too big," they say. "Go round," they say. I am done going round!',
      'You:: Have you tried... going round?',
      'For TEN YEARS! That is the problem!',
      'Old Grit has been digging under that hill for forty years. If anyone knows how to break it, he does. Ask him for me?',
    ],
    progress: 'Grit works the first floor of the Crystal Cave, in the east bay.',
    done: ['Frost? Wyrm frost?! Of course. Cold splits stone. I have been pushing the wrong way this whole time!'],
    objective: { type: 'TALK', target: 'Grit', count: 1 },
    heard: [
      'Erin sent you? Ha! That boy has been shoving those rocks since he could walk.',
      'You:: Does he headbutt them? He has the forehead for it.',
      'Can\'t dig that rockfall, can\'t burn it. That\'s heart-stone from deep under the hill, harder than my pick.',
      'But stone has one weakness: cold. Water creeps into the cracks, freezes, and splits the rock wide open. Takes a hundred winters... unless the cold is strong enough.',
      'Wyrm frost. The scales of the frost wyrms up in Frostpeak never thaw. Pack three of them into the cracks, give it one good hit, and the whole heap comes apart.',
      'Tell the boy. And tell him to stop headbutting it, he\'s scaring my mules.',
    ],
    reward: { gold: 1500 },
    turnIn: 'Erin',
  },
  {
    id: 'erin_frost', minLevel: 30, after: 'erin_boulder', giver: 'Erin', title: 'Frost That Splits Stone', summary: 'Bring Erin 3 Wyrm Frostscales',
    intro: [
      'Frost wyrm scales? Packed into the cracks? That is... actually brilliant. I hate that I did not think of it.',
      'You:: I will not tell anyone it was Grit\'s idea.',
      'Frostpeak is far beyond anything I can reach. But you can. Bring me three Frostscales, and we break it. Together.',
    ],
    progress: 'Wyrm Frostscales drop from Glacius, the frost wyrm of Frostpeak.',
    done: [
      'Three Frostscales. I can feel the cold from here.',
      'Into the cracks, one, two, three... now hit it! Everything you have!',
      'You:: HAAAH!',
      '...',
      'IT BROKE! The big one in the middle, it\'s rubble! There is a gap right through!',
      'I always said I would move that boulder. I just needed a hero and a dragon. Same thing, basically.',
      'You:: It is not the same thing.',
      'The way to the mines runs through that gap now, straight from the green. Go on, you first. You earned it.',
    ],
    objective: { type: 'DELIVER', target: 'frost_scale', count: 3 },
    reward: { gold: 4000, gems: 60, shards: ['EPIC', 3] },
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

/** Side quests open only once the main-story town tutorial is through (the hero has met the King). Kept in sync with the store by engine/systems/npcQuestLogic.ts (owner: quest availability / order). */
export const questGate = { open: true };
export function npcQuestStatus(def: NpcQuestDef, save: NpcQuestSave, rank: number): NpcQuestStatus {
  const e = save.q[def.id];
  if (e) return e.s === 2 ? 'DONE' : 'ACTIVE';
  if (!questGate.open) return 'LOCKED';
  if (!sideUnlocked(def.id, unlockMirror.n)) return 'LOCKED';   // (owner, Hades-style) opened by dying: questUnlocks.ts
  if (def.gate && !gateFlags[def.gate]) return 'LOCKED';
  if (def.after && save.q[def.after]?.s !== 2) return 'LOCKED';
  if (def.cond?.boss && !(save.bossKills[def.cond.boss] > 0)) return 'LOCKED';
  if (rank < npcQuestMinLevel(def)) return 'LOCKED';
  return 'AVAILABLE';
}
/** Class level a quest needs before it is offered (0 = none). */
export const npcQuestMinLevel = (def: NpcQuestDef): number => Math.max(def.minLevel ?? 0, def.cond?.rank ?? 0);
/** Locked ONLY by the class level (its chain and boss condition are met): listed with "Lv N" in the quest window. */
export function npcQuestLevelLocked(def: NpcQuestDef, save: NpcQuestSave, rank: number): boolean {
  return questGate.open && sideUnlocked(def.id, unlockMirror.n) && !save.q[def.id] && rank < npcQuestMinLevel(def) && (!def.gate || gateFlags[def.gate])
    && (!def.after || save.q[def.after]?.s === 2) && (!def.cond?.boss || save.bossKills[def.cond.boss] > 0);
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
  if (o.type === 'LISTEN') return save.q[def.id]?.s === 1 ? o.count : 0;   // you listened: talk to them again for the reward
  return Math.min(o.count, save.q[def.id]?.p ?? 0);
}
export const npcQuestReady = (def: NpcQuestDef, save: NpcQuestSave, inv: readonly Item[]): boolean =>
  save.q[def.id]?.s === 1 && npcQuestProgress(def, save, inv) >= def.objective.count;

/** NPC that takes the quest back. */
export const npcQuestTurnIn = (def: NpcQuestDef): string => def.turnIn ?? def.giver;

/** Marker above an NPC: 0 none, 1 new quest, 2 in progress, 3 ready to turn in (priority 3 > 1 > 2). */
export function npcMarker(name: string, save: NpcQuestSave, inv: readonly Item[], rank: number): 0 | 1 | 2 | 3 {
  let m: 0 | 1 | 2 | 3 = 0;
  for (const d of NPC_QUESTS) {
    const st = npcQuestStatus(d, save, rank);
    // the NPC a TALK quest sends you to has something for you too (the message to pass on): blue "?" like a turn-in
    if (st === 'ACTIVE' && d.objective.type === 'TALK' && d.objective.target === name && (save.q[d.id]?.p ?? 0) < d.objective.count) return 3;
    if (st === 'ACTIVE' && npcQuestTurnIn(d) === name) { if (npcQuestReady(d, save, inv)) return 3; if (m === 0) m = 2; }
    else if (st === 'AVAILABLE' && d.giver === name) m = 1;   // a new quest outranks a grey "in progress" mark
  }
  return m;
}
