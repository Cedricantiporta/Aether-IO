// Main story quests: one sequential chain, always shown first (gold) in the quest tracker. Step 0 starts on a new profile
// outside the town gate; the gate stays sealed for runs until the King gives the first task (step 2).
// Pure data + helpers (no React); progress lives in the profile (`story` in store.ts).

/** Where a field / shop step is done (the guide arrow, the gate beacon and auto-walk aim here). */
export type StoryAt = 'SUPPLIES' | 'PETS' | 'FORTUNE' | 'BLACKSMITH' | 'WAREHOUSE' | 'BOARD' | 'BAG' | 'ARMORY' | 'TRAINER' | 'BREWER' | 'TOWER';

/** Run objectives counted from engine events (storyLogic): free caged captives (RESCUE rooms), slay champions (champion
 *  rooms / dark hero duels, not the depth-10 pre-boss), or the biome's depth-10 pre-boss. `biome` = 0-based biome index;
 *  RESCUE / CHAMPION also count in deeper biomes, PREBOSS only in that biome. */
export type StoryGoalKind = 'RESCUE' | 'CHAMPION' | 'PREBOSS';

export interface StoryStep {
  id: string;
  title: string;
  /** tracker line */
  line: string;
  /** who the step talks to (NPC name), or '' for a field / shop objective */
  npc: string;
  /** field objective: kill `count` enemies of `kind` in runs */
  kill?: { kind: string; count: number };
  /** field objective: rescue captives / slay champions / the depth-10 pre-boss (see StoryGoalKind) */
  goal?: { kind: StoryGoalKind; count: number; biome: number };
  /** town objective: a shop / town action (engine `hub` event kind): buy_potion, buy_pet, summon, equip, accept,
   *  buy_armor (Armory gear), upgrade (Blacksmith), learn (Skill Trainer), store (Warehouse deposit), brew_elixir (Elixir
   *  Brewer: emit hub 'brew_elixir'), tower_floor (count = the Endless Tower floor to clear; progress = best floor cleared) */
  act?: { kind: string; count: number };
  /** talk-to step that needs loot: talking with `count` of loot `id` in the bag hands them over (else `wait` is said) */
  deliver?: { id: string; count: number };
  wait?: string[];
  ending?: boolean;
  /** where the objective is done (shops / board / bag); default: the step NPC, else the town gate */
  at?: StoryAt;
  /** dialogue said when the step's NPC is spoken to (then the chain advances) */
  talk?: string[];
  /** paid when the step is completed (gold in base units x GOLD_SCALE, like NPC quests) */
  reward: { gold?: number; gems?: number; items?: { id: string; qty?: number }[] };
}

/** The target count of a step's objective (0 = a talk step). */
export const stepCount = (s: StoryStep): number => s.kill?.count ?? s.goal?.count ?? s.act?.count ?? s.deliver?.count ?? 0;

// The questline (see docs/RUN_DESIGN.md "Main questline"): townsfolk hand out each task, Genshin / MMO style.
// Prologue (town tutorials): Garrick -> Mira's shop tour (potion, first pet, summon, gear) -> Hodge's bounty board -> the King.
// Every biome chapter: a townsperson's errand (slay N of the biome's monsters, free captives, slay champions), then the
// biome's depth-10 pre-boss, then its guardian. Chapter 1 also holds the second town tour (Armory, Blacksmith, Skill
// Trainer, Warehouse; the first armor piece, upgrade and skill lesson are free while their step is active).
export const STORY: StoryStep[] = [
  // ---------------------------------------------------------------- prologue: the town
  { id: 'guard', title: 'The Font Remembers', line: 'Report to Garrick at the gate', npc: 'Garrick', reward: { gold: 50 },
    talk: ['Easy, easy. You came up out of the well coughing light. Happens to every new recruit. Well. Happens to you, anyway.', 'Welcome to Aether. Ten years since the Dimming, and the wilds still get worse every night. The gate stays shut until the King gives the word.', 'And you cannot meet a king in your nightshirt. Mira by the fountain sorts out new blood. Brace yourself: she is very... cheerful.'] },
  { id: 'mira', title: 'The Town Guide', line: 'Talk to Mira by the fountain', npc: 'Mira', reward: { gold: 50 },
    talk: ['A NEW GUARD! Oh, I have a list! I have had a list ready for ten years!', 'Rule one: the wilds eat people who skip potions. The Potion Shop is just south-west of the square, on the street.', 'Walk up to the counter, press E, and buy one Health Potion. I will wait! I am very good at waiting. Ask anyone.'] },
  { id: 'potion', title: 'Stock Up', line: 'Buy a potion at the Potion Shop', npc: '', at: 'SUPPLIES', act: { kind: 'buy_potion', count: 1 }, reward: { gold: 50, items: [{ id: 'potion_hp', qty: 1 }] } },
  { id: 'mira2', title: 'A Friend for the Road', line: 'Tell Mira you bought a potion', npc: 'Mira', reward: { gold: 50 },
    talk: ['Good! Z drinks a health potion, X a mana potion. Here, one more on the house. Do not tell Rosalind; she counts them.', 'Rule two: nobody walks the wilds alone. The last guard who tried came back as a very sad pillar of light.', 'The Pet House keeper gives every new guard a Green Blob for free. Go adopt yours. It will love you. It loves everyone. It once loved a boot.'] },
  { id: 'pet', title: 'Your First Pet', line: 'Adopt a pet at the Pet House', npc: '', at: 'PETS', act: { kind: 'buy_pet', count: 1 }, reward: { gold: 50, gems: 10 } },
  { id: 'mira3', title: 'Read the Stars', line: 'Show Mira your new pet', npc: 'Mira', reward: { gems: 10 },
    talk: ['Aww, it already likes you! Or it is trying to eat your sleeve. Same thing, with blobs.', 'Last stop: Madame Zora\'s Fortune tent, beside the square on the west side. She pulls gear out of the stars for gems.', 'She also told me I would marry a duke. I married Hodge\'s cousin. Here are some gems; try one summon anyway.'] },
  { id: 'summon', title: 'A Gift from the Stars', line: 'Summon once at the Fortune tent', npc: '', at: 'FORTUNE', act: { kind: 'summon', count: 1 }, reward: { gold: 50, items: [{ id: 'potion_mana', qty: 1 }] } },
  { id: 'equip', title: 'Suit Up', line: 'Equip the gear you summoned from your bag (I)', npc: '', at: 'BAG', act: { kind: 'equip', count: 1 }, reward: { gold: 50 } },
  { id: 'mira4', title: 'Ready for Work', line: 'Talk to Mira again', npc: 'Mira', reward: { gold: 50 },
    talk: ['Look at you! Almost a real guard. From a distance. In bad light.', 'Coin comes from bounties. Hodge keeps the Quest Board by the castle steps. He will talk your ear off about Lysa. Just nod.', 'Take one bounty, then go and see the King. And... be gentle with him. He has not been well since the princess.'] },
  { id: 'hodge', title: 'The Bounty Clerk', line: 'Talk to Hodge at the Quest Board', npc: 'Hodge', reward: { gold: 50 },
    talk: ['Bounties! Bounties! Kill this, fetch that, gold for all of it! Has Lysa said anything about me? No? Not important. Bounties!', 'Pick any one off the board and it is yours. Come back when it is done and I pay out. And if you pass the herb shop, mention I am very brave.'] },
  { id: 'board', title: 'Odd Jobs', line: 'Accept a bounty from the Quest Board', npc: '', at: 'BOARD', act: { kind: 'accept', count: 1 }, reward: { gold: 50 } },
  { id: 'king', title: 'The Grieving King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 300, items: [{ id: 'potion_hp', qty: 1 }] },
    talk: ['So the Font sent me another one. Rise, guard. You have its light about you; few do any more.', 'Ten years ago, on the night of the Dimming, my archmage Malakar went down into the Font and came back with a shard of its light. That same night my daughter, Princess Aelia, vanished.', 'Since then the wilds have twisted, and the old guardians of each land have turned on us. Bring back the light, guard. Bring back... whatever you can.', 'Start small: the slimes of the Greenwood grow bold. Cut down ten. The Adventure Portal past the gate is open to you now. Go with the Font.'] },
  // ---------------------------------------------------------------- chapter 1: the Greenwood
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes in the Greenwood', npc: '', kill: { kind: 'SLIME', count: 10 }, reward: { gold: 250, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'lysa', title: 'Sticky Business', line: 'Bring 3 Slime Gel to Lysa the Herbalist', npc: 'Lysa', deliver: { id: 'slime_gel', count: 3 }, reward: { gold: 200, items: [{ id: 'potion_hp', qty: 1 }] },
    wait: ['Back from the Meadow? Then you have met the slimes. Did they hum? They hum now. They never used to hum.', 'Their gel is the base of every salve I brew. Bring me three Slime Gel. And if Hodge sent you with a message, the answer is still "buy something first".'],
    talk: ['Three good globs, still warm. Ugh. Perfect.', 'Look closely: there is a violet thread in the gel. Something is feeding these things. Here, my best salves. Garrick was shouting for you at the gate: wolves.'] },
  { id: 'garrick_wolves', title: 'Wolves at the Door', line: 'Talk to Garrick at the gate', npc: 'Garrick', reward: { gold: 100 },
    talk: ['There you are. A trader came in at dawn with his cart in splinters and his trousers in worse shape.', 'Dire wolves, down from the Deep Grove. They circle, then pounce in a straight line: step aside and strike back. That is the whole secret. Took me three bites to learn it.', 'Their eyes glow violet now. Wolves should not glow. Thin the pack: eight of them.'] },
  { id: 'wolves', title: 'Thin the Pack', line: 'Defeat Dire Wolves in the Greenwood', npc: '', kill: { kind: 'DIREWOLF', count: 8 }, reward: { gold: 300, gems: 5 } },
  { id: 'mira5', title: 'Proper Armor', line: 'Talk to Mira by the fountain', npc: 'Mira', reward: { gold: 50 },
    talk: ['Wolf bites, right through the leather! I told you! Well, I meant to tell you. It was rule nine.', 'And you are still bareheaded! The Armory beside the plaza sells sturdy pieces. Brakk owes me a favour (do not ask about the goat), so a helmet for your class is on the house.', 'Put it on. Then we will make something stronger.'] },
  { id: 'armor', title: 'Suit of Steel', line: 'Get your free helmet at the Armory (the Common helmet of your class)', npc: '', at: 'ARMORY', act: { kind: 'buy_armor', count: 1 }, reward: { gold: 50 } },
  { id: 'forge', title: 'Temper the Steel', line: 'Upgrade a piece of gear from your bag at the Blacksmith (free this time)', npc: '', at: 'BLACKSMITH', act: { kind: 'upgrade', count: 1 }, reward: { gold: 100, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'mira6', title: 'Sharper Skills', line: 'Talk to Mira again', npc: 'Mira', reward: { gold: 50 },
    talk: ['Hear that ring? Good steel. The Blacksmith upgrades with gold and Upgrade Cores; this one was a gift.', 'Now your head. The Skill Trainer, by the castle steps on the west side, turns skill points into real skills. Your first lesson is free. Duck when he swings.', 'And your bag will fill up fast. Put something in the Warehouse east of the square, beside the Blacksmith. Things you leave in the wilds do not come back with you. Neither do some guards.'] },
  { id: 'train', title: 'Lessons of the Blade', line: 'Learn or upgrade a skill at the Skill Trainer (free this time)', npc: '', at: 'TRAINER', act: { kind: 'learn', count: 1 }, reward: { gold: 100 } },
  { id: 'stash', title: 'Safe Keeping', line: 'Store an item in the Warehouse', npc: '', at: 'WAREHOUSE', act: { kind: 'store', count: 1 }, reward: { gold: 100, gems: 5 } },
  { id: 'lysa_brew', title: 'Monster Remedies', line: 'Talk to Lysa the Herbalist', npc: 'Lysa', reward: { gold: 50 },
    talk: ['Mira says you have seen the whole town now. Not quite!', 'Down the road past the gate, off to the west in the meadow, an old friend of mine keeps the Elixir Brewer\'s hut. Far from town, on account of the smell. And the explosions. Mostly the smell.', 'He boils monster parts into elixirs: fangs, gel, scales, whatever you drag home. Brew one. A good elixir has saved more guards than any sword.'] },
  { id: 'elixir', title: 'A Bitter Brew', line: 'Brew an Elixir of Might at the Elixir Brewer (outside the gate, west of the road; the first one is free)', npc: '', at: 'BREWER', act: { kind: 'brew_elixir', count: 1 }, reward: { gold: 100, gems: 5 } },
  { id: 'report', title: 'The King Awaits', line: 'Report back to King Aldric', npc: 'King Aldric', reward: { gold: 300, gems: 10 },
    talk: ['Slimes cut, wolves thinned, and Mira says you are properly kitted out. She also says you are "a sweetheart". I do not know what you did.', 'Lysa found violet in the gel. Malakar\'s colour. The slimes answer to a king of their own now: a great ooze deep in the Greenwood, ten rooms in.', 'Pop the Slime King. A kingdom with two kings is one too many. Ha. That was a joke. I used to make those.'] },
  { id: 'slimeking', title: 'The Slime King', line: 'Defeat the Slime King (Greenwood, depth 10)', npc: '', kill: { kind: 'SLIME_KING', count: 1 }, reward: { gold: 400, gems: 15 } },
  { id: 'garrick2', title: 'Rumbling Roots', line: 'Tell Garrick about the Slime King', npc: 'Garrick', reward: { gold: 200, items: [{ id: 'upgrade_core', qty: 1 }] },
    talk: ['The Slime King, popped! Ha! Hodge bet me a week of gate duty you would not come back. I am going to sleep SO much.', 'But listen: since it burst, the ground past it shakes. Elderroot, the oldest tree in the Grove, has woken angry. He sheltered the first guardians once. Now his roots strangle anything that walks.', 'He waits at the end of the Greenwood. Past the Slime King, look for the Boss Key: it opens his door early. Put him back to sleep.'] },
  { id: 'golem', title: 'Warden of the Old Grove', line: 'Defeat Elderroot the Ancient (Greenwood boss: find the Boss Key past depth 10, or reach depth 15)', npc: '', kill: { kind: 'BOSS_TREANT', count: 1 }, reward: { gold: 600, gems: 20 } },
  { id: 'dorn', title: 'Heart of Stone', line: 'Bring 2 Ore Nuggets to Dorn the Miner', npc: 'Dorn', deliver: { id: 'ore_nugget', count: 2 }, reward: { gold: 350, items: [{ id: 'upgrade_core', qty: 2 }] },
    wait: ['Elderroot sleeps? Then his roots no longer choke the ore veins! My pickaxe has been crying. I have been crying. We cry together.', 'There are ore veins just outside the town walls, east and behind the castle, and more out in the wilds. Hold E by a vein to mine it. Bring me two nuggets.'],
    talk: ['Look at that grain. Violet streaks, and... wait. Hold it to the light. Do you hear that? Like someone humming a lullaby.', 'Take these cores for your gear, and take that sound to the King. I am not sleeping in the mine tonight.'] },
  { id: 'report2', title: 'A Lullaby in the Stone', line: 'Tell King Aldric of Elderroot\'s fall', npc: 'King Aldric', reward: { gold: 400, gems: 10 },
    talk: ['A lullaby? In the stone?', '...It is the song her mother sang to her. Aelia\'s song. Malakar used to hum it in the tower while he worked.', 'Then wherever his stolen light seeps, it carries her with it. Wren the scholar has studied him longer than anyone. Go to her. Go now.'] },
  // ---------------------------------------------------------------- chapter 2: the Marble Halls
  { id: 'wren', title: 'The Scholar\'s Warning', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 150 },
    talk: ['The King told you about the song? He never tells anyone anything. You must have frightened him.', 'Malakar\'s light spreads like roots. After the Grove it reached the Marble Halls, the old castle of the kings, where the princess grew up. Gorath the Mountain walks its corridors now, crushing all he meets.', 'The empty armours of her old royal guard have risen to serve him. They still salute, you know, right before they swing. Break ten of them and his hold on the Halls will slip.'] },
  { id: 'halls_armor', title: 'Empty Oaths', line: 'Defeat Haunted Armors in the Marble Halls (biome 2)', npc: '', kill: { kind: 'HAUNTED_ARMOR', count: 10 }, reward: { gold: 450, gems: 10 } },
  { id: 'aldo', title: 'The Lost Patrol', line: 'Talk to Sir Aldo at the castle steps', npc: 'Sir Aldo', reward: { gold: 150 },
    talk: ['You came back from the Halls? Then you are braver than me, and I own a much shinier helmet.', 'A patrol of ours went in a week ago. Hunters say the monsters keep them caged, alive. Gorath is not killing anyone. He is collecting them. Like he is waiting for someone to come home.', 'If you see a cage, defend it, clear the room, then set them free. Two of them, at least. Please. One of them owes me money.'] },
  { id: 'halls_rescue', title: 'Break the Cages', line: 'Free 2 captives (Rescue the Captive rooms, Marble Halls or deeper)', npc: '', goal: { kind: 'RESCUE', count: 2, biome: 1 }, reward: { gold: 500, gems: 10 } },
  { id: 'bram', title: 'Champions of Stone', line: 'Tell Sir Bram about the patrol', npc: 'Sir Bram', reward: { gold: 150 },
    talk: ['Aldo will not stop smiling, and he got his money back. Thank you, guard.', 'The freed men swear the portraits in the Halls have the princess\'s face scratched out. Every one. And champions roam the corridors: the Phalanx Captain, the Grave Warden, and dark copies of heroes like you.', 'Slay one in a champion room (or a dark hero duel). Then the warden at depth ten, and Gorath has no one left to hide behind.'] },
  { id: 'halls_champion', title: 'Champion\'s Challenge', line: 'Slay a champion (champion room or dark hero duel, Marble Halls or deeper)', npc: '', goal: { kind: 'CHAMPION', count: 1, biome: 1 }, reward: { gold: 450, gems: 10 } },
  { id: 'halls_warden', title: 'Keeper of the Broken Hall', line: 'Defeat the Marble Halls champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 1 }, reward: { gold: 500, gems: 15 } },
  { id: 'grove', title: 'The Mountain Stirs', line: 'Defeat Gorath the Mountain (Marble Halls boss)', npc: '', kill: { kind: 'BOSS_GOLEM', count: 1 }, reward: { gold: 800, gems: 25 } },
  // ---------------------------------------------------------------- chapter 3: the Sunscorch Desert
  { id: 'lysa2', title: 'Poisoned Water', line: 'Talk to Lysa about the desert', npc: 'Lysa', reward: { gold: 200 },
    talk: ['My herbs from the south come back black and rotten. And Hodge sent me a poem. It rhymed "Lysa" with "geyser". I need a holiday.', 'Something huge woke under the Sunscorch Desert: an engine of the old kings, the size of a keep, walking on six legs. The old kings built it to dig for the Font\'s light. It is digging again.', 'Its scorpions guard the dunes and their acid poisons the wells. Kill twelve and the caravans can bring water again.'] },
  { id: 'scorpions', title: 'Stingers in the Sand', line: 'Defeat Giant Scorpions in the Sunscorch Desert (biome 3)', npc: '', kill: { kind: 'SCORPION', count: 12 }, reward: { gold: 550, gems: 10 } },
  { id: 'maeve', title: 'Lost Caravans', line: 'Talk to Maeve on the south street', npc: 'Maeve', reward: { gold: 200 },
    talk: ['Have you heard? Of course you have not, you were busy stabbing scorpions. I have been busy too. Listening. Professionally.', 'Two caravans never made it home. The mummies drag travellers into the ruins. And here is the juicy part: the King sent soldiers into that desert ten years ago, the week after the Dimming, and only half came back. Nobody says why.', 'Free the caravaners, guard. Two at least. Then come and tell me everything. I will tell everyone else. It is a service.'] },
  { id: 'desert_rescue', title: 'Bound in Linen', line: 'Free 2 captives (Rescue the Captive rooms, Sunscorch Desert or deeper)', npc: '', goal: { kind: 'RESCUE', count: 2, biome: 2 }, reward: { gold: 600, gems: 10 } },
  { id: 'desert_warden', title: 'Guardian of the Dunes', line: 'Defeat the Sunscorch Desert champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 2 }, reward: { gold: 600, gems: 15 } },
  { id: 'mire', title: 'The Sleeping Engine', line: 'Defeat the Dune Colossus (Sunscorch Desert boss)', npc: '', kill: { kind: 'BOSS_WARMACH', count: 1 }, reward: { gold: 1000, gems: 30 } },
  // ---------------------------------------------------------------- chapter 4: Frostpeak
  { id: 'dorn2', title: 'Frozen Passes', line: 'Talk to Dorn about the mountain passes', npc: 'Dorn', reward: { gold: 250 },
    talk: ['The northern passes froze solid overnight. In summer! My beard froze to my pickaxe. We are married now.', 'Miners saw wings over the ice. Glacius, the old songs call her. She held the pass shut against the Void for an age. Now she holds it shut against us.', 'First the yetis: they smashed our camp to kindling and ate the cheese. ALL the cheese. Ten of them, and my lads can at least get the tools back.'] },
  { id: 'yetis', title: 'Snow Brutes', line: 'Defeat Yetis in Frostpeak (biome 5)', npc: '', kill: { kind: 'YETI', count: 10 }, reward: { gold: 650, gems: 10 } },
  { id: 'tamsin', title: 'Frozen Champions', line: 'Talk to Guard Tamsin in the castle', npc: 'Guard Tamsin', reward: { gold: 250 },
    talk: ['Dorn\'s miners are back, thanks to you. They are writing a song about the cheese. Please stop them.', 'Glacius has gathered champions on the ice: the Shellback, the Crystal Behemoth, and worse. The scouts say she does not fight like a beast. She fights like she is guarding a door.', 'Slay two of them. Then the champion at depth ten, and the wyrm will be alone.'] },
  { id: 'frost_champions', title: 'Ice and Iron', line: 'Slay 2 champions (champion rooms or dark hero duels, Frostpeak or deeper)', npc: '', goal: { kind: 'CHAMPION', count: 2, biome: 4 }, reward: { gold: 700, gems: 15 } },
  { id: 'frost_warden', title: 'Keeper of the Pass', line: 'Defeat the Frostpeak champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 4 }, reward: { gold: 700, gems: 15 } },
  { id: 'frost', title: 'The Frozen Wing', line: 'Defeat Glacius the Frost Wyrm (Frostpeak boss)', npc: '', kill: { kind: 'BOSS_WYRM', count: 1 }, reward: { gold: 1200, gems: 35 } },
  // ---------------------------------------------------------------- chapter 5: the Ember Wastes
  { id: 'roan', title: 'Smoke on the Horizon', line: 'Talk to Captain Roan in the castle', npc: 'Captain Roan', reward: { gold: 300 },
    talk: ['Guard. Sit. No, stand. I have bad news and I am bad at bad news.', 'Ignar, the Infernal Warlord, has raised an army of cinders in the east. His hellhounds run down anyone who leaves the road.', 'Ignar was a guardian. My captain, before me. He swore the oath at the same well as you, and walked into the Wastes after Malakar. The Font never brought him home. Kill twelve hounds. Then we will know where my scouts went.'] },
  { id: 'hounds', title: 'Hounds of Cinder', line: 'Defeat Hellhounds in the Ember Wastes (biome 6)', npc: '', kill: { kind: 'HELLHOUND', count: 12 }, reward: { gold: 800, gems: 15 } },
  { id: 'roan2', title: 'The Missing Scouts', line: 'Report to Captain Roan', npc: 'Captain Roan', reward: { gold: 300 },
    talk: ['Paw prints to the Molten Core... and cages. They are alive. Ignar keeps them alive.', 'He was never one to waste a guard. Maybe there is something of him left in there. Free three of my scouts, and if he speaks to you... tell me what he says.'] },
  { id: 'ember_rescue', title: 'Out of the Fire', line: 'Free 3 captives (Rescue the Captive rooms, Ember Wastes or deeper)', npc: '', goal: { kind: 'RESCUE', count: 3, biome: 5 }, reward: { gold: 900, gems: 15 } },
  { id: 'ember_warden', title: 'Keeper of the Ashen Gate', line: 'Defeat the Ember Wastes champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 5 }, reward: { gold: 800, gems: 20 } },
  { id: 'cinders', title: 'Lord of Cinders', line: 'Defeat Ignar the Infernal Warlord (Ember Wastes boss)', npc: '', kill: { kind: 'BOSS_WARLORD', count: 1 }, reward: { gold: 1400, gems: 40 } },
  // ---------------------------------------------------------------- chapter 6: the Void
  { id: 'wren2', title: 'The Edge of the Void', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 350 },
    talk: ['I found it, in the oldest scroll, and in something worse: the King\'s own sealed letters.', 'At the end of the Void a Gatekeeper guards five gates, and behind them stands Malakar\'s Dark Castle. Each gate holds a shard of the castle key; the last holds the Herald.', 'And the letters... the King ordered Malakar into the Font that night. Malakar did not steal the light. He was sent for it. Blind the Void Stalkers first, twelve of them. We will talk about the rest when you are not about to die.'] },
  { id: 'stalkers', title: 'Blind the Watchers', line: 'Defeat Void Stalkers in the Void (biome 7)', npc: '', kill: { kind: 'VOID_STALKER', count: 12 }, reward: { gold: 1000, gems: 20 } },
  { id: 'tobin', title: 'Your Own Shadow', line: 'Talk to Elder Tobin by the plaza', npc: 'Elder Tobin', reward: { gold: 350 },
    talk: ['Wren tells me you walk into the Void now. I am old; I remember the last guard who tried. I remember the one before that, too. They all had your face.', 'Every time the Font pulls you home, it leaves a little of you behind out there. In the Void, those leftovers stand up. Dark heroes with your own skills. Champions that never tire.', 'Beat one of them, and you will know you can beat the rest. Then the keeper at depth ten. And try not to look them in the eye.'] },
  { id: 'void_champion', title: 'Face the Dark', line: 'Slay a champion (champion room or dark hero duel, in the Void)', npc: '', goal: { kind: 'CHAMPION', count: 1, biome: 6 }, reward: { gold: 1000, gems: 20 } },
  { id: 'void_warden', title: 'Keeper of the Rift', line: 'Defeat the Void champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 6 }, reward: { gold: 1000, gems: 25 } },
  { id: 'herald', title: 'The Herald of the Abyss', line: 'Defeat the Void Herald (the Gate of the Herald, at the Gatekeeper)', npc: '', kill: { kind: 'BOSS_VOID', count: 1 }, reward: { gold: 1600, gems: 50 } },
  // ---------------------------------------------------------------- finale
  { id: 'report3', title: 'The King\'s Confession', line: 'Report to King Aldric before the end', npc: 'King Aldric', reward: { gold: 750, items: [{ id: 'upgrade_core', qty: 3 }] },
    talk: ['Wren showed you the letters. Good. I have carried this alone long enough.', 'Aelia had the grey plague. I told Malakar to take light from the Font and save her, whatever it cost. It was killing the Font, so I ordered him to bring the shard back. He refused. He ran, with my daughter\'s light in his hands.', 'He was not a thief. He was a better father to her than I was that night. But he has held her too long, and it has made him a monster.', 'End him, guard. And the shard... bring the shard to me. Only to me. Not to Wren, not to the Font. To me.'] },
  { id: 'lich', title: 'The Undying', line: 'Clear the 5 Gates of the Void, open the Dark Castle and defeat Malakar', npc: '', ending: true, reward: { gold: 2500, gems: 100 } },
  // ---------------------------------------------------------------- after the end: the Endless Tower
  { id: 'tower_king', title: 'A Light That Endures', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 750, gems: 20 },
    talk: ['Malakar has fallen. The Font shines. And my daughter... the shard broke, they tell me, and the Void took her light back into the dark. Again.', 'No matter. We are patient, you and I. And you will not remember the pain of it. The Font is kind that way.', 'The scholars whisper of the Endless Tower in the dark south-west forest, floor upon floor of the Void\'s leftovers. Climb it. Grow strong. Strong enough to bring that shard to me next time, unbroken.'] },
  { id: 'tower', title: 'The Endless Tower', line: 'Clear floor 10 of the Endless Tower (south-west forest, past the gate)', npc: '', at: 'TOWER', act: { kind: 'tower_floor', count: 10 }, reward: { gold: 3000, gems: 120, items: [{ id: 'upgrade_core', qty: 3 }] } },
  // ---------------------------------------------------------------- the true heir: what the Font made you forget
  { id: 'wren3', title: 'Holes in the Memory', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 1000, gems: 25 },
    talk: ['Sit down. Look at this: your own journal, the night you came back from the Dark Castle. The page is blank. So is the one after the time before.', 'You come home from Malakar\'s throne humming a lullaby and smiling like someone told you a secret. By breakfast, it is gone. Every time.', 'The Font did not always take memories. The old oath only kept you alive. The words were changed ten years ago, on the night of the Dimming. By the King.', 'Take this charm: ink of the old oath, pressed into wax. Hold it when the shard breaks. Finish the adventure again, and this time... remember what she tells you.'] },
  { id: 'remember', title: 'Hold On', line: 'Defeat Malakar again (finish the adventure) and remember what Aelia tells you', npc: '', ending: true, reward: { gold: 2500, gems: 80 } },
  { id: 'wren4', title: 'The Regent\'s Crown', line: 'Tell Wren what you remember', npc: 'Wren', reward: { gold: 1200, gems: 30 },
    talk: ['You remember? Then say it. Slowly. I am writing all of it down. In ink. On stone, if I have to.', 'You:: Aldric is not her father. He was a prince of the eastern march. He wanted to marry Princess Aelia. She said no. Her father, King Edric, said no.', 'And a prince who is told no goes looking for someone who says yes. Under the Font there is something older than the light: the Hollow. It said yes.', 'On the night of the Dimming the Hollow took King Edric and every protector sworn to him, and twisted them into the beasts of the wilds. Gorath was never a stone giant. Gorath was the King.', 'Aelia died that night. Mostly. Malakar, her tutor, caught her last light in a shard as it left her, and ran into the Void before the Hollow could swallow it.', 'Aldric married no one. He simply took the crown, called himself her grieving father, and changed the Font\'s oath so his guards would forget. He cannot leash the Hollow. He needs the shard to bargain with it. Go to the castle. Ask him to his face.'] },
  { id: 'usurper', title: 'The False King', line: 'Confront King Aldric in the castle', npc: 'King Aldric', reward: { gold: 1500, gems: 40 },
    talk: ['...Wren. Always Wren. I should have let the Font take her memories too.', 'I asked for her hand, guard. Politely. Twice. She laughed, and Edric showed me the door. A prince of the eastern march, shown the DOOR.', 'The Hollow was kinder. It asked one thing: everything Edric loved. So it took his knights, his dragon, his old tree, his captain... and him. You have met them all. You have killed most of them.', 'She was meant to be mine when it was done. Instead she died, and that thief Malakar ran off with what was left. I sent you after it. Not to save her. To trade her. The Hollow does not stay fed for long.', 'You:: It is in you. Your shadow is moving on its own.', '...Yes. It has been, for a while. I never trusted the dark, you know. I only wanted it to kneel. Go. Find her. Before it finishes with me.'] },
  { id: 'queen', title: 'Long Live the Queen', line: 'Speak with Queen Aelia in the castle', npc: 'Queen Aelia', reward: { gold: 3000, gems: 150, items: [{ id: 'upgrade_core', qty: 5 }] },
    talk: ['You found me. Properly, this time, and you remembered. Do you know how many times we have said goodbye in that forest? I stopped counting at nine.', 'Aldric is gone. The Hollow finished him the way it finished my father, only it did not bother to make him into anything. Mortimer buried his crown. He insisted on being paid first.', 'My father rests now. Gorath is only a hill again, and some mornings I go and sit on it, the way I did when I was small.', 'Malakar is not dead. He never was. Every time you struck him down, he went back into the Void and sat down beside the Hollow, so it would gnaw on him instead of on us. The echoes in the Ascension are the Hollow wearing his face.', 'So. I am queen now, apparently. First decree: the Font keeps its old oath, and no guard of Aether forgets again. Second: someone take Hodge\'s quill away.'] },
];

/** Story chapters for the quest window (each starts at a step id and runs to the next chapter). */
export const CHAPTERS: { id: string; title: string; from: string; blurb: string }[] = [
  { id: 'pro', title: 'Prologue · Out of the Well', from: 'guard', blurb: 'You woke in the Font, coughing light. Ten years after the Dimming, Aether is a frightened little town with a grieving King and a very cheerful tour guide.' },
  { id: 'act1', title: 'Chapter 1 · The Greenwood', from: 'slimes', blurb: 'Beyond the gate the Greenwood hums with violet light: slimes grow bold, wolves hunt the road, their king grows fat, and Elderroot has woken angry. In the stone, someone is singing a lullaby.' },
  { id: 'act2', title: 'Chapter 2 · The Marble Halls', from: 'wren', blurb: 'The princess grew up in the old castle of the kings. Now her guard walks it empty, her portraits have no faces, and Gorath collects the living in cages.' },
  { id: 'act3', title: 'Chapter 3 · The Sunscorch Desert', from: 'lysa2', blurb: 'The wells run poisoned, caravans vanish, an engine of the old kings digs for light again, and Maeve has heard a rumour about the King.' },
  { id: 'act4', title: 'Chapter 4 · Frostpeak', from: 'dorn2', blurb: 'Summer froze overnight. Yetis ate the cheese. Glacius guards the pass, not like a beast but like someone guarding a door.' },
  { id: 'act5', title: 'Chapter 5 · The Ember Wastes', from: 'roan', blurb: 'Ignar the Warlord was a guardian once, the captain before Roan. The Font never brought him home.' },
  { id: 'act6', title: 'Chapter 6 · The Void', from: 'wren2', blurb: 'The King\'s letters say Malakar was sent, not a thief. And in the Void, everything the Font left behind of you stands up to fight.' },
  { id: 'fin', title: 'Finale · The Undying', from: 'report3', blurb: 'The King has confessed. Behind five gates, Malakar holds the last of the Font\'s light, and the last of the princess.' },
  { id: 'post', title: 'Epilogue · The Endless Tower', from: 'tower_king', blurb: 'Malakar fell, the shard broke, and the princess slipped back into the dark. The King wants you stronger. He did not say why.' },
  { id: 'heir', title: 'Epilogue · The True Heir', from: 'wren3', blurb: 'Your journal has blank pages. The Font has been taking your memories, on the King\'s orders. Hold on to what she tells you, and learn what the King did to the last one.' },
];

const IDX: Record<string, number> = Object.fromEntries(STORY.map((s, i) => [s.id, i]));
/** Index of a step id (STORY.length if unknown). */
export const storyIdx = (id: string): number => IDX[id] ?? STORY.length;
/** Save version of the chain (v4: biome chapters with errands + the second town tour). */
export const STORY_V = 4;
/** Step ids of the first story version (saves without `v`): mapped by id onto this chain. */
const V1 = ['guard', 'king', 'slimes', 'report', 'golem', 'report2', 'grove', 'mire', 'frost', 'cinders', 'herald', 'report3', 'lich'];
/** Index of 'golem' in story v2 (before the two Slime King steps were added). */
const V2_GOLEM = 15;
/** Step ids of story v3, by index (every one of them still exists in this chain). */
const V3 = ['guard', 'mira', 'potion', 'mira2', 'pet', 'mira3', 'summon', 'equip', 'mira4', 'hodge', 'board', 'king', 'slimes', 'lysa', 'report',
  'slimeking', 'garrick2', 'golem', 'dorn', 'report2', 'wren', 'grove', 'lysa2', 'mire', 'dorn2', 'frost', 'roan', 'cinders', 'wren2', 'herald', 'report3', 'lich'];

export interface StorySave { step: number; p: number; v?: number }
/** First post-game step (old saves that had finished the chain land here). */
const POST = IDX.tower_king;
/** New profiles start the chain; old saves (no story field) skip straight to the Slime King (or past the end).
 *  Older chain versions land on the same step id (v2 / v3 indices are mapped through their id lists). */
export function sanitizeStory(raw: unknown, endings: number, isNew: boolean): StorySave {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    let step = Math.max(0, Math.floor(Number(r.step) || 0)), p = Math.max(0, Math.floor(Number(r.p) || 0));
    if (r.v === STORY_V) return { step: Math.min(STORY.length, step), p, v: STORY_V };
    if (r.v !== 2 && r.v !== 3) {   // v1 save: same step by id (a finished chain: the post-game Tower quest)
      const id = V1[step]; step = id ? storyIdx(id) : POST; if (id === 'guard') step = 0;
      return { step: Math.min(STORY.length, step), p: id ? p : 0, v: STORY_V };
    }
    if (r.v === 2 && step >= V2_GOLEM) { step = step === V2_GOLEM ? 15 : step + 2; if (step === 15) p = 0; }   // v2 -> v3: the Slime King steps were added before the Golem
    const id = V3[step];   // v3 index -> id -> this chain (a finished chain: the post-game Tower quest)
    return { step: id ? storyIdx(id) : POST, p: id ? p : 0, v: STORY_V };
  }
  if (isNew) return { step: 0, p: 0, v: STORY_V };
  return { step: endings > 0 ? POST : storyIdx('slimeking'), p: 0, v: STORY_V };   // pre-story saves: straight to the first guardian
}
export const storyStep = (s: StorySave): StoryStep | null => STORY[s.step] ?? null;
/** The gate lets you set out once the King has spoken. */
export const gateOpen = (s: StorySave): boolean => s.step > storyIdx('king');
