// ============================================================================
// NPC story quests: hand-written quests given by town NPCs (separate from the daily Quest Board in quests.ts).
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

export type NpcObjectiveType =
  | 'KILL_KIND' | 'KILL_TOTAL' | 'KILL_ELITE' | 'KILL_BOSS'   // kill counts (KILL_BOSS target: a boss kind)
  | 'REACH_BIOME'                                              // count = biome number (1 Greenwood, 2 Marble Halls, 3 Sunscorch ...)
  | 'COLLECT_LOOT'                                             // pick up loot items (target: loot ids, optional room type)
  | 'DELIVER'                                                  // bring loot items to the NPC; they are removed on turn-in
  | 'TALK'                                                     // speak to another NPC (target: its name)
  | 'INTERACT'                                                 // a farm / town action (target: 'milk' | 'egg' | 'cat' | 'pin')
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
  /** the turn-in NPC when it is not the giver */
  turnIn?: string;
  /** TALK objectives: what the target NPC says when you pass the message on (shown first in their dialogue) */
  heard?: string;
}

export const NPC_QUESTS: NpcQuestDef[] = [
  // ---- the chapel: Sister Elowen (two in a chain)
  {
    id: 'elowen_graves', minLevel: 3, giver: 'Sister Elowen', title: 'Restless Graves', summary: 'Put 12 zombies to rest',
    intro: ['Child, the dead are not sleeping as they should. The graveyard behind the chapel groans at night.', 'Out in the wilds, the restless walk as zombies. Put twelve of them to rest, and the Flame will be grateful.', '...And so will I. The groaning keeps me up.'],
    progress: 'Twelve of the restless, child. Zombies roam the Greenwood and the halls beyond it.',
    done: ['The graves are quiet again. Thank you.', 'The Flame does not pay in gold, but the collection box does. Take this.'],
    objective: { type: 'KILL_KIND', target: 'ZOMBIE', count: 12 },
    reward: { gold: 1200, items: [{ id: 'potion_hp_big', qty: 2 }] },
  },
  {
    id: 'elowen_locket', after: 'elowen_graves', giver: 'Sister Elowen', title: 'A Locket for the Lost', summary: 'Bring Sister Elowen a Grave Locket',
    intro: ['One grave out there has no name, only a carving of a locket.', 'If you ever find a Grave Locket on your travels, bring it to me. We will give that soul a name at last.'],
    progress: 'A Grave Locket. The dead carry them; so do old tombs.',
    done: ['There is a name inside... "Aldwin". Rest well, Aldwin.', 'You have done a kind thing. Kindness should be paid, at least a little.'],
    objective: { type: 'DELIVER', target: 'grave_locket', count: 1 },
    reward: { gold: 2000, gems: 20, items: [{ id: 'reforge_stone', qty: 1 }] },
  },
  // ---- the Golden Tankard: Marta the barkeep and Rodric the regular
  {
    id: 'marta_fish', minLevel: 6, giver: 'Marta Goldtap', title: 'Fish Stew Friday', summary: 'Bring Marta 5 Lake Perch',
    intro: ['It is Fish Stew Friday, and I have no fish. It is also Tuesday, but the regulars do not check.', 'Bring me five Lake Perch from the lake past the west wall and dinner is on the house. Forever. ...For a week.'],
    progress: 'Five Lake Perch, love. The Fishmonger on the beach lends rods.',
    done: ['Perfect! Smells like the lake. In a good way, mostly.', 'Here, your cut of the stew money.'],
    objective: { type: 'DELIVER', target: 'fish_perch', count: 5 },
    reward: { gold: 1500, items: [{ id: 'temper_oil', qty: 1 }] },
  },
  {
    id: 'rodric_goblets', minLevel: 8, giver: 'Rodric the Tipsy', title: 'The Lost Tankards', summary: 'Find 2 Silver Goblets for Rodric',
    intro: ['Psst. Hero. I may have... wagered Marta\'s silver goblets. On a duel. With a goblin.', 'I lost. To the goblin. Find me two Silver Goblets out there before she counts them, and I will make it worth your while.'],
    progress: 'Two Silver Goblets. Quietly. She is counting the mugs again.',
    done: ['Shh! Put them on the shelf. Behind the cider. Perfect.', 'You saved my life. Or at least my tab. Take this.'],
    objective: { type: 'DELIVER', target: 'silver_goblet', count: 2 },
    reward: { gold: 2500, gems: 15, items: [{ id: 'erase_scroll', qty: 1 }] },
  },
  // ---- Old Wend (hermit): chain of three, ends with a pet
  {
    id: 'wend_crystals', minLevel: 4, after: 'pip_secret', giver: 'Old Wend', title: 'A Glimmer in the Dark', summary: 'Gather 10 gems in a crystal cave',
    intro: ['Hm? A hero out here? Good, my knees are no longer fit for caves.', 'There is a crystal cave in the forest bay east of the town walls, and now and then a door in the wilds opens on a Crystal Cavern too. No monsters, only glowing veins.', 'Mine them and gather ten gemstones, crystals or ore nuggets. Hold on to them, I only want to hear them sing.'],
    progress: 'Ten shards of light, remember. Follow the ring path east of the walls to the cave in the forest bay, or find a Crystal Cavern door in the wilds.',
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
    id: 'wend_warden', minLevel: 8, giver: 'Old Wend', title: 'Old Bark, Old Grudges', summary: 'Defeat Elderroot the Ancient', after: 'wend_gems',
    intro: ['Now listen. The Old Grove has a warden, Elderroot, and he has forgotten why he guards it. He walks, he crushes, he does not listen.', 'Put him to rest, hero, and the grove will speak well of you. A friend of mine will follow you home.'],
    progress: 'Elderroot still lumbers through the Old Grove. Strike at his roots and keep moving.',
    done: ['The grove is quiet at last. I felt it from here.', 'A wolf of the wild has taken a liking to you. Treat him kindly.'],
    objective: { type: 'KILL_BOSS', target: 'BOSS_TREANT', count: 1 },
    reward: { gold: 6000, items: [{ id: 'pet_wolf' }] },
  },
  // ---- Brenna (farmer): chain of three, ends with a hood
  {
    id: 'brenna_slimes', giver: 'Brenna', title: 'Pests in the Wheat', summary: 'Defeat 30 Slimes',
    intro: ['Oh, thank the stars. Hero, the slimes keep crawling into my wheat field and I cannot swing a hoe at that many.', 'They are not dangerous, just rude. One sat on my lunch. ON it. Could you defeat thirty of them out there?'],
    progress: 'Still green blobs everywhere, thirty of them. I count on you.',
    done: ['My wheat is saved! Bless you.', 'Here, this is all the spare coin I have. I was saving it for a new lunch.'],
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
    id: 'brenna_goblins', minLevel: 3, giver: 'Brenna', title: 'Thieves in the Night', summary: 'Defeat 25 Goblins', after: 'brenna_gel',
    intro: ['Now the goblins are stealing my carrots! I cannot afford it.', 'Drive off twenty-five of them and I will give you my father\'s old hood. It has been in a chest for years.'],
    progress: 'Twenty-five goblins, hero. They are quick, so mind yourself.',
    done: ['No more midnight thieves! A promise is a promise: my father\'s hood. It suits a hero better than a farmer.'],
    objective: { type: 'KILL_KIND', target: 'GOBLIN', count: 25 },
    reward: { gold: 2000, items: [{ id: 'helm_3' }] },
  },
  // ---- singles
  {
    id: 'garrick_road', minLevel: 20, giver: 'Garrick', title: 'Mind the Road', summary: 'Reach the Sunscorch Desert (biome 3)',
    intro: ['Traders say the road past the Marble Halls turns to sand: the Sunscorch Desert, where something old and enormous is said to be walking again. Nobody I send comes back with a clear report.', 'Make it to the Sunscorch, hero, and tell me what you see.'],
    progress: 'The Sunscorch Desert is past the Marble Halls: three realms deep. Keep going!',
    done: ['So the desert is real, and you came back. I am impressed. I lost a bet with the cook.', 'The watch pays for good scouting. Shake the sand out of your boots before you walk on my gate.'],
    objective: { type: 'REACH_BIOME', count: 3 },
    reward: { gold: 3000, gems: 20 },
  },
  // ---- mining tutorial (class level UNLOCK_LV.CAVE = 5): Dorn sends you to the mining camp + the Crystal Cave, Grit takes over
  {
    id: 'dorn_mine', minLevel: 5, giver: 'Dorn', turnIn: 'Grit', title: 'Down the Mine', summary: 'Mine 3 veins in the Crystal Cave, then see Grit',
    intro: ['You have grown strong enough for real mining, friend. Not those pebbles round the walls: the Crystal Cave.', 'Take the dirt path from the chicken coop by the farm, north-east up to the mining camp. The mine mouth is behind the carts.', 'Go in, hold E on three veins on the first floor, and say hello to old Grit for me. He will show you the rest.'],
    progress: 'Three veins inside the Crystal Cave. The path starts beside the chicken coop and climbs to the mining camp. Hold E on a vein.',
    done: ['Dorn sent you, eh? Three veins already, and you still have all your fingers. Good start.', 'Take these flasks of lantern oil. Carry them deep, and they pour themselves into the lantern when it gutters.'],
    objective: { type: 'ACTION', target: 'cave_vein', count: 3 },
    reward: { gold: 500, flasks: 2 },
  },
  {
    id: 'grit_deeper', minLevel: 5, giver: 'Grit', after: 'dorn_mine', title: 'Deeper Still', summary: 'Clear every vein on Floor 1 and go down to Floor 2',
    intro: ['Now the real lesson. The stairs at the back stay blocked until every vein on a floor is mined.', 'Clear this floor, then take the stairs down. Below here there is no daylight: your lantern burns oil the whole trip.', 'Get to Floor 2, then climb back out the way you came and tell me what you saw.'],
    progress: 'Mine every vein on Floor 1, then take the stairs at the back down to Floor 2. Climb back out by the stairs you arrived on.',
    done: ['Floor 2 and back in one piece! The deep likes you, I think.', 'Here is your share, and one more flask. The Mining Supplies stall outside sells more.'],
    objective: { type: 'ACTION', target: 'cave_deep', count: 1 },
    reward: { gold: 1200, gems: 10, shards: ['RARE', 5], flasks: 1 },
  },
  {
    id: 'dorn_ore', minLevel: 6, giver: 'Dorn', title: 'Ore for the Forge', summary: 'Deliver 15 Ore Nuggets to Dorn',
    intro: ['My veins outside the walls are dry and the smith keeps knocking. Bring me fifteen Ore Nuggets from the wilds and I will make it worth your while.'],
    progress: 'Fifteen Ore Nuggets. Look for ore veins in the caverns. Shiny brown rocks. No, not that one, that is a potato.',
    done: ['Heavy and honest! This will keep the forge hot a month.', 'My share: cores for your gear, and a fistful of gold.'],
    objective: { type: 'DELIVER', target: 'ore_nugget', count: 15 },
    reward: { gold: 2500, items: [{ id: 'upgrade_core', qty: 3 }] },
  },
  {
    id: 'pip_secret', giver: 'Pip', title: 'A Secret for the Hermit', summary: 'Talk to Old Wend behind the north wall',
    intro: ['Psst! Hero! I found a shiny pebble and I think the old hermit north of town would love it.', 'But I am not allowed past the wall. Could you ask Old Wend what it is? Then come and tell me!'],
    progress: 'Did you see Old Wend yet? He lives behind the north wall of town.',
    heard: 'A shiny pebble, warm to the touch? That is a sunstone, child. Tell little Pip to keep it out of the rain: it sulks when it gets wet.',
    done: ['He says it is a sunstone?! I KNEW it! I am going to keep it in my sock drawer. With the other socks.', 'Here, you can have some of my sweets money. Not all of it. Some of it.'],
    objective: { type: 'TALK', target: 'Old Wend', count: 1 },
    reward: { gold: 500 },
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
    id: 'hollis_fox', giver: 'Hollis', title: 'Foxes in the Henhouse', summary: 'Defeat 20 Goblins', after: 'hollis_milk', minLevel: 3,
    intro: ['Something has been raiding the coop at night. Foxes, I reckoned. Then one of the foxes waved at me.', 'Goblins, the lot of them. I am not great with animals, for a farmer. Thin them out: twenty ought to teach them.'],
    progress: 'Goblins skulk in the Meadow and beyond. Twenty, if you please.',
    done: ['Not a feather lost last night! You have my thanks, and the farm\'s.'],
    objective: { type: 'KILL_KIND', target: 'GOBLIN', count: 20 },
    reward: { gold: 1800, gems: 15 },
  },
  {
    id: 'dalla_eggs', giver: 'Dalla', title: 'Egg Hunt', summary: 'Collect 5 eggs from the coop nests',
    intro: ['Oh good, a pair of free hands! The hens have been laying all over the place.', 'Gather five eggs from the nests in front of the coop. Mind the beaks.'],
    progress: 'The nests are in front of the coop. A hen lays a fresh one every little while.',
    done: ['Five lovely eggs, not a crack among them!', 'Do not tell the hens I counted. They get competitive. Take these, I baked too much again.'],
    objective: { type: 'INTERACT', target: 'egg', count: 5 },
    reward: { gold: 500, items: [{ id: 'potion_mana', qty: 2 }] },
  },
  {
    id: 'pip_cat', giver: 'Pip', title: 'Where Is Biscuit?', summary: 'Find Pip\'s cat somewhere in town',
    intro: ['Hero! Biscuit ran away again! She is orange and grumpy and she HIDES.', 'She likes quiet corners behind the houses. Please find her!'],
    progress: 'Biscuit loves quiet corners far from the plaza... the other side of town from me, maybe?',
    done: ['BISCUIT! You found her! Bad kitty. Good hero!', 'She says thank you. Well, she hissed. That is cat for thank you.', 'Here, this is my whole savings. Do not tell Mum.'],
    objective: { type: 'INTERACT', target: 'cat', count: 1 },
    reward: { gold: 400, gems: 10 },
  },
  // ---- hidden: appears only after Elderroot (biome 1 boss) fell at least once
  {
    id: 'wren_champions', minLevel: 10, giver: 'Wren', title: 'Echoes of the Fallen', summary: 'Defeat 5 elite champions', cond: { boss: 'BOSS_TREANT' },
    intro: ['You... you felled Elderroot? Then my studies were right: the champions of the wilds carry a piece of his poisoned heartwood.', 'Defeat five elite champions and I will let you read my notes. Rewards included, of course.'],
    progress: 'Elite champions only, hero: the ones with the gold crests. Five of them.',
    done: ['Fascinating! The heartwood splinters hum just as predicted.', 'Your notes, your reward. Knowledge is its own treasure, but gems are nicer.'],
    objective: { type: 'KILL_ELITE', count: 5 },
    reward: { gems: 50, shards: ['RARE', 20] },
  },
  // ---- the King
  {
    id: 'king_frost', minLevel: 28, giver: 'King Aldric', title: 'The Frozen Frontier', summary: 'Reach Frostpeak (biome 5)',
    intro: ['Hero. Word reaches my court that the Frostpeak is stirring: a winter dragon, they say.', 'Go to the Frostpeak and see it with your own eyes. The crown will reward you.'],
    progress: 'The Frostpeak lies beyond the Sunscorch Desert, hero. Go, and return when you have seen it.',
    done: ['The Frostpeak is real, and so is the danger. Aether owes you.', 'Take the crown\'s thanks.'],
    objective: { type: 'REACH_BIOME', count: 5 },
    reward: { gold: 10000, gems: 50 },
  },
  // ---- level-gated: the deeper biomes (offered once the class level can reach them)
  {
    id: 'aldo_gargoyles', minLevel: 12, giver: 'Sir Bram', title: 'Stone Wings', summary: 'Defeat 15 Gargoyles (Marble Halls)',
    intro: ['The old castle had gargoyles on every tower. Stone, harmless, pretty.', 'Now they wake when you walk past and dive at your head. Smash fifteen of them in the Marble Halls, would you?'],
    progress: 'Gargoyles sit still like statues until you come close. Strike first.',
    done: ['Fifteen! The masons will have work for a year. Take this from the guard\'s purse.'],
    objective: { type: 'KILL_KIND', target: 'GARGOYLE', count: 15 },
    reward: { gold: 3500, gems: 20 },
  },
  {
    id: 'bram_gorath', minLevel: 16, giver: 'Sir Bram', title: 'The Mountain Falls Again', summary: 'Defeat Gorath the Mountain', after: 'aldo_gargoyles',
    intro: ['Gorath keeps rising, they say. Stone does not stay down.', 'Beat him once more and bring me a story worth telling at the gate. I will pay for it.'],
    progress: 'Gorath waits at the end of the Marble Halls. Watch for the crystals that shield him.',
    done: ['Felled again! Aldo owes me ten gold, I said you would. Here, your share and then some.'],
    objective: { type: 'KILL_BOSS', target: 'BOSS_GOLEM', count: 1 },
    reward: { gold: 6000, shards: ['RARE', 15] },
  },
  {
    id: 'lysa_mummies', minLevel: 22, giver: 'Lysa', title: 'Bandages and Balms', summary: 'Defeat 20 Mummies (Sunscorch Desert)',
    intro: ['The mummies of the Sunscorch are wrapped in linen soaked with old resins. Strange stuff, and strong.', 'Defeat twenty of them and I can brew the strongest salves you have ever tasted. Well, smelled.'],
    progress: 'Mummies throw their wraps to root you. Keep moving and strike from the side.',
    done: ['Oh, the smell! Perfect. Your salves, as promised.'],
    objective: { type: 'KILL_KIND', target: 'MUMMY', count: 20 },
    reward: { gold: 5000, items: [{ id: 'potion_hp_big', qty: 5 }] },
  },
  {
    id: 'maeve_scorpions', minLevel: 24, giver: 'Maeve', title: 'Sting Operation', summary: 'Defeat 25 Giant Scorpions (Sunscorch Desert)',
    intro: ['A cousin of a friend of my neighbour was stung by a giant scorpion. Swelled up like a melon!', 'Teach those pincered pests a lesson: twenty-five of them. And tell me everything after.'],
    progress: 'Twenty-five giant scorpions. Mind the tail, and the acid it leaves behind.',
    done: ['Twenty-five! Wait until the street hears. Here, the whole street chipped in.'],
    objective: { type: 'KILL_KIND', target: 'SCORPION', count: 25 },
    reward: { gold: 6000, gems: 30 },
  },
  {
    id: 'dorn_yetis', minLevel: 30, giver: 'Dorn', title: 'Ore under the Ice', summary: 'Defeat 15 Yetis (Frostpeak)',
    intro: ['There is iron under the Frostpeak glaciers, the best I have ever seen. And yetis sitting right on top of it.', 'Clear fifteen of the brutes away and my lads will share the first haul with you.'],
    progress: 'Fifteen yetis. They charge, then slam: dodge sideways.',
    done: ['The first cart came down this morning. Your share, as promised: cores, and gold.'],
    objective: { type: 'KILL_KIND', target: 'YETI', count: 15 },
    reward: { gold: 7000, items: [{ id: 'upgrade_core', qty: 4 }] },
  },
  {
    id: 'tamsin_wisps', minLevel: 33, giver: 'Guard Tamsin', title: 'Lights in the Snow', summary: 'Defeat 20 Frost Wisps (Frostpeak)',
    intro: ['Travellers follow lights in the snow and freeze where they stand. Frost wisps.', 'Put out twenty of them, and the passes will be safe to cross by night.'],
    progress: 'Frost wisps keep their distance and burst when you get close. Close in fast.',
    done: ['Not a single frozen traveller this week. The castle thanks you.'],
    objective: { type: 'KILL_KIND', target: 'FROST_WISP', count: 20 },
    reward: { gold: 8000, gems: 35 },
  },
  {
    id: 'roan_hounds', minLevel: 38, giver: 'Captain Roan', title: 'The Pack Leader', summary: 'Defeat 25 Hellhounds (Ember Wastes)',
    intro: ['The hellhounds hunt in packs, and the packs are getting bigger.', 'Twenty-five of them, guard. Break the packs before they reach the eastern farms.'],
    progress: 'Hellhounds leave burning prints behind them. Do not chase them through the fire.',
    done: ['The farms in the east sleep again. Take this, and my respect.'],
    objective: { type: 'KILL_KIND', target: 'HELLHOUND', count: 25 },
    reward: { gold: 10000, shards: ['EPIC', 10] },
  },
  {
    id: 'fenn_shamans', minLevel: 40, giver: 'Fenn', title: 'A Song of Cinders', summary: 'Defeat 15 Cinder Shamans (Ember Wastes)',
    intro: ['I am writing a ballad about the Ember Wastes, but it lacks a hero. And a villain. And an ending.', 'The cinder shamans call fire from the sky. Defeat fifteen and I will have all three!'],
    progress: 'The shamans aim where you stand and where you run. Change direction often!',
    done: ['"And the shamans fell, fifteen in a row..." Perfect! Here, the first coins this song ever earned.'],
    objective: { type: 'KILL_KIND', target: 'CINDER_SHAMAN', count: 15 },
    reward: { gold: 11000, gems: 40 },
  },
  {
    id: 'wren_void', minLevel: 45, giver: 'Wren', title: 'Eyes of the Abyss', summary: 'Defeat 15 Void Eyes (the Void)',
    intro: ['The Void Eyes see everything that moves at the rift\'s edge. I want to know what they see.', 'Defeat fifteen of them. Whatever is left of them may tell me where Malakar looks.'],
    progress: 'Void Eyes float out of reach and fire rings of orbs. Weave between the rings.',
    done: ['They were watching the Font. All this time, watching our Font. Thank you; take this, you will need it.'],
    objective: { type: 'KILL_KIND', target: 'VOID_EYE', count: 15 },
    reward: { gold: 13000, gems: 50 },
  },
  {
    id: 'tobin_herald', minLevel: 48, giver: 'Elder Tobin', title: 'Silence the Herald', summary: 'Defeat the Void Herald', after: 'wren_void',
    intro: ['In my youth the Herald came to Aether with a message: kneel. We did not.', 'Silence him for good, guard. An old man would like to see that before the end.'],
    progress: 'The Herald guards the last of the five gates, at the Gatekeeper.',
    done: ['So he is silent. I never thought I would live to hear that. Take my old ring money; it was waiting for this.'],
    objective: { type: 'KILL_BOSS', target: 'BOSS_VOID', count: 1 },
    reward: { gold: 15000, gems: 60, shards: ['LEGENDARY', 3] },
  },
  // ---- the meadow in front of the walls (Tilda, Corin, Nell)
  {
    id: 'tilda_wings', minLevel: 2, giver: 'Tilda', title: 'Wings for the Spice Rack', summary: 'Deliver 4 Bat Wings to Tilda',
    intro: ['Psst. You go out there, yes? Past the portal, where the bats are?', 'Ground bat wing is worth its weight in pepper on the coast. Bring me four and I pay better than the Potion Shop. Promise. Mostly.'],
    progress: 'Four Bat Wings, dear. Bats flutter about the Greenwood from the second room on.',
    done: ['Lovely, crispy, slightly horrible. Perfect!', 'Here, a fair price. Fairer than fair, because I like you. Do not tell the other customers.'],
    objective: { type: 'DELIVER', target: 'bat_wing', count: 4 },
    reward: { gold: 900, gems: 10 },
  },
  {
    id: 'corin_pin', giver: 'Corin', title: 'A Pin in the Hay', summary: 'Find Corin\'s wheel pin by the haystack',
    intro: ['You there! Sharp eyes? Mine are not, any more.', 'My wheel pin jumped out while I unloaded hay by the wheat field. Little iron thing, shiny. Without it the wheel walks off on its own.', 'Have a look in the grass by the haystack, would you?'],
    progress: 'By the haystack, next to the wheat field east of the road. A little shiny iron pin.',
    done: ['That is the one! Back in you go, you little runaway.', 'Not much coin in hauling, but take this. And a potion: the road is long.'],
    objective: { type: 'INTERACT', target: 'pin', count: 1 },
    reward: { gold: 500, items: [{ id: 'potion_hp', qty: 1 }] },
  },
  {
    id: 'corin_hay', giver: 'Corin', title: 'Hay for Hollis', summary: 'Tell Hollis at the barn that his hay is coming', after: 'corin_pin',
    intro: ['Wheel is fixed, but my back is not. Tell Hollis at the barn his hay is on its way, will you?', 'And remind him I take payment in milk. Apparently.'],
    progress: 'Hollis works by the red barn in the farm clearing, east of the wheat field.',
    heard: 'Hay from Corin, finally? About time! Tell him the milk is waiting. As always.',
    done: ['Hollis said "about time"? Ha! That is Hollis for "thank you".', 'Here, your share of the milk money. Which is no money. Have some gold instead.'],
    objective: { type: 'TALK', target: 'Hollis', count: 1 },
    reward: { gold: 400, gems: 5 },
  },
  // ---- fishing tutorial (class level UNLOCK_LV.FISHING = 3): Nell sends you to Marlo at the beach, who teaches the rest
  {
    id: 'nell_beach', minLevel: 3, giver: 'Nell', turnIn: 'Marlo', title: 'Gone Fishing', summary: 'Find Marlo the angler at the lakeside beach',
    intro: ['You look like someone who could use a quiet afternoon. Have you been to the lake beach yet?', 'Follow the new dirt path west from the road, past the hay cart, round the corner tower and down to the boardwalk.', 'Marlo the angler fishes there every day. Tell him Nell sent you. He has been dying to teach somebody.'],
    progress: 'Marlo is on the lakeside beach, west of the town wall. Take the dirt path west from the road, past the hay cart.',
    heard: 'Nell sent you? Ha! Then you want to learn to fish. Pull up a plank, friend.',
    done: ['Welcome to the finest beach on the lake. Here, a little coin for the walk.'],
    objective: { type: 'TALK', target: 'Marlo', count: 1 },
    reward: { gold: 200 },
  },
  {
    id: 'marlo_catch', minLevel: 3, giver: 'Marlo', after: 'nell_beach', title: 'First Catch', summary: 'Catch 3 fish at the lakeside',
    intro: ['Fishing is simple. Walk up to the water at the shoreline or the end of the pier and press E to cast.', 'Wait for the bobber to dip and the "!" to show, then press E to hook it. Then tap E each time the marker is in the green.', 'Bring in three fish. Boots count. I am not proud of it, but they count.'],
    progress: 'Three fish. Stand by the water (the shoreline or the pier end), press E to cast, E again when it bites.',
    done: ['Three! You have the knack. Keep them, though: the Fishmonger pays good coin.', 'And take these. Fishing makes a body hungry.'],
    objective: { type: 'ACTION', target: 'catch_fish', count: 3 },
    reward: { gold: 400, items: [{ id: 'potion_hp', qty: 2 }] },
  },
  {
    id: 'marlo_sell', minLevel: 3, giver: 'Marlo', after: 'marlo_catch', title: 'Fresh off the Pier', summary: 'Sell a fish to the Fishmonger',
    intro: ['Last lesson: a fish in the bag is worth nothing until somebody pays for it.', 'The Fishmonger\'s stall is right here on the beach. Sell her at least one fish, and see what a good catch is worth.', 'She sells better rods too, once your purse allows.'],
    progress: 'Sell a fish at the Fishmonger\'s stall, mid-beach.',
    done: ['Coin in hand! Now you are an angler. Come back any time, the lake never runs out.', 'A little something from my tackle money.'],
    objective: { type: 'ACTION', target: 'sell_fish', count: 1 },
    reward: { gold: 600, gems: 10 },
  },
  {
    id: 'nell_wolves', minLevel: 3, giver: 'Nell', title: 'Howls on the Road', summary: 'Defeat 10 Dire Wolves (Greenwood)',
    intro: ['Every night the howling comes closer to the road. Last night a wolf sat right there and stared at my lantern.', 'You go out through the portal anyway. Could you thin the dire wolves a little? Ten of them, and I can walk my road in peace.'],
    progress: 'Dire wolves prowl the Greenwood from the third room on. They circle, then lunge in a straight line.',
    done: ['Not a single howl last night. I nearly slept on the road!', 'Here: my savings, and a page of my book with your name on it.'],
    objective: { type: 'KILL_KIND', target: 'DIREWOLF', count: 10 },
    reward: { gold: 900, gems: 10 },
  },
  {
    id: 'nell_halls', minLevel: 10, giver: 'Nell', title: 'A Page for the Marble Halls', summary: 'Reach the Marble Halls (biome 2)', after: 'nell_wolves',
    intro: ['My little book has a page for the Marble Halls, but it is empty. I have never seen a marble hall. Have you?', 'Go and see them for me, then come back and tell me everything. Especially the ceilings.'],
    progress: 'The Marble Halls lie past Elderroot, beyond the Greenwood.',
    done: ['Columns as tall as trees? Armour that walks by itself? I am writing it all down!', 'For the story. Worth every coin.'],
    objective: { type: 'REACH_BIOME', count: 2 },
    reward: { gold: 1500, gems: 15 },
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

/** Side quests open only once the main-story town tutorial is through (the hero has met the Quest Board clerk and taken
 *  a bounty). Kept in sync with the store by engine/systems/npcQuestLogic.ts (owner: quest availability / order). */
export const questGate = { open: true };
export function npcQuestStatus(def: NpcQuestDef, save: NpcQuestSave, rank: number): NpcQuestStatus {
  const e = save.q[def.id];
  if (e) return e.s === 2 ? 'DONE' : 'ACTIVE';
  if (!questGate.open) return 'LOCKED';
  if (def.after && save.q[def.after]?.s !== 2) return 'LOCKED';
  if (def.cond?.boss && !(save.bossKills[def.cond.boss] > 0)) return 'LOCKED';
  if (rank < npcQuestMinLevel(def)) return 'LOCKED';
  return 'AVAILABLE';
}
/** Class level a quest needs before it is offered (0 = none). */
export const npcQuestMinLevel = (def: NpcQuestDef): number => Math.max(def.minLevel ?? 0, def.cond?.rank ?? 0);
/** Locked ONLY by the class level (its chain and boss condition are met): listed with "Lv N" in the quest window. */
export function npcQuestLevelLocked(def: NpcQuestDef, save: NpcQuestSave, rank: number): boolean {
  return questGate.open && !save.q[def.id] && rank < npcQuestMinLevel(def)
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
