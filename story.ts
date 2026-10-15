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
  { id: 'guard', title: 'A New Guard', line: 'Report to Garrick at the gate', npc: 'Garrick', reward: { gold: 100 },
    talk: ['So you are the new recruit. The Font brought you back to us, eh?', 'The gate stays shut for new blood until the King himself gives the word.', 'You look half-dressed for the wilds, though. Mira by the fountain will get you sorted first.'] },
  { id: 'mira', title: 'The Town Guide', line: 'Talk to Mira by the fountain', npc: 'Mira', reward: { gold: 100 },
    talk: ['A new guard! Welcome to Aether. I show every newcomer around.', 'First lesson: never leave town without potions. The Potion Shop is just south-west of the square, on the street.', 'Walk up to the counter, press E, and buy one Health Potion. I will wait!'] },
  { id: 'potion', title: 'Stock Up', line: 'Buy a potion at the Potion Shop', npc: '', at: 'SUPPLIES', act: { kind: 'buy_potion', count: 1 }, reward: { gold: 60, items: [{ id: 'potion_hp', qty: 2 }] } },
  { id: 'mira2', title: 'A Friend for the Road', line: 'Tell Mira you bought a potion', npc: 'Mira', reward: { gold: 120 },
    talk: ['Good! Z drinks a health potion, X a mana potion. Two more on the house, from me.', 'Next: nobody walks the wilds alone. The Pet House keeps companions that fight beside you.', 'The keeper gives every new guard a Green Blob for free. Go adopt yours; it will follow you everywhere.'] },
  { id: 'pet', title: 'Your First Pet', line: 'Adopt a pet at the Pet House', npc: '', at: 'PETS', act: { kind: 'buy_pet', count: 1 }, reward: { gold: 60, gems: 10 } },
  { id: 'mira3', title: 'Read the Stars', line: 'Show Mira your new pet', npc: 'Mira', reward: { gems: 10 },
    talk: ['Aww, look at it! It already likes you.', 'Last stop: Madame Zora\'s Fortune tent, right beside the square on the west side. She summons gear from the stars for gems.', 'Here are some gems. Try one summon; you never know what falls out.'] },
  { id: 'summon', title: 'A Gift from the Stars', line: 'Summon once at the Fortune tent', npc: '', at: 'FORTUNE', act: { kind: 'summon', count: 1 }, reward: { gold: 60, items: [{ id: 'helm_1', qty: 1 }] } },
  { id: 'equip', title: 'Suit Up', line: 'Equip gear from your bag (I) - try the Leather Cap', npc: '', at: 'BAG', act: { kind: 'equip', count: 1 }, reward: { gold: 60 } },
  { id: 'mira4', title: 'Ready for Work', line: 'Talk to Mira again', npc: 'Mira', reward: { gold: 100 },
    talk: ['Now you look like a guard of Aether!', 'Coin comes from bounties. Hodge keeps the Quest Board by the castle steps.', 'Take one bounty: they are optional, but they pay well.'] },
  { id: 'hodge', title: 'The Bounty Clerk', line: 'Talk to Hodge at the Quest Board', npc: 'Hodge', reward: { gold: 80 },
    talk: ['Bounties, bounties! Kill this, fetch that, gold for all of it.', 'Pick any one off the board and it is yours. Come back when it is done and I pay out.'] },
  { id: 'board', title: 'Odd Jobs', line: 'Accept a bounty from the Quest Board', npc: '', at: 'BOARD', act: { kind: 'accept', count: 1 }, reward: { gold: 80 } },
  { id: 'king', title: 'Audience with the King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 300, items: [{ id: 'potion_hp', qty: 3 }] },
    talk: ['Rise, guard. You have the Font\'s light about you; few do any more.', 'Something is twisting the wilds beyond our walls. The old guardians of each land have turned on us.', 'First prove yourself: the slimes in the Greenwood grow bold. Cut down ten of them.', 'The Adventure Portal in the forest past the town gate is open to you now. Go with the Font.'] },
  // ---------------------------------------------------------------- chapter 1: the Greenwood
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes in the Greenwood', npc: '', kill: { kind: 'SLIME', count: 10 }, reward: { gold: 500, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'lysa', title: 'Sticky Business', line: 'Bring 3 Slime Gel to Lysa the Herbalist', npc: 'Lysa', deliver: { id: 'slime_gel', count: 3 }, reward: { gold: 400, items: [{ id: 'potion_hp', qty: 3 }] },
    wait: ['Back from the Meadow? Then you have seen the slimes.', 'Their gel is the base of every healing salve I brew. Bring me three Slime Gel and I will make it worth your while.'],
    talk: ['Three good globs of gel! Fresh, too.', 'Here, my best salves. You will want them: Garrick came by asking for you. Something about wolves on the road.'] },
  { id: 'garrick_wolves', title: 'Wolves at the Door', line: 'Talk to Garrick at the gate', npc: 'Garrick', reward: { gold: 200 },
    talk: ['There you are. A trader came in at dawn with his cart torn to splinters.', 'Dire wolves, down from the Deep Grove. They circle, then pounce in a straight line: step aside and strike back.', 'Thin the pack. Eight of them should teach the rest some manners.'] },
  { id: 'wolves', title: 'Thin the Pack', line: 'Defeat Dire Wolves in the Greenwood', npc: '', kill: { kind: 'DIREWOLF', count: 8 }, reward: { gold: 600, gems: 5 } },
  { id: 'mira5', title: 'Proper Armor', line: 'Talk to Mira by the fountain', npc: 'Mira', reward: { gold: 100 },
    talk: ['Wolf bites, right through the leather! You need real armor before you go deeper.', 'The Armory beside the plaza sells sturdy pieces. The armorer owes me a favour: your first piece is on the house.', 'Pick whatever you like. Then we will make it stronger.'] },
  { id: 'armor', title: 'Suit of Steel', line: 'Buy a piece of armor at the Armory (the first one is free)', npc: '', at: 'ARMORY', act: { kind: 'buy_armor', count: 1 }, reward: { gold: 100 } },
  { id: 'forge', title: 'Temper the Steel', line: 'Upgrade a piece of gear from your bag at the Blacksmith (free this time)', npc: '', at: 'BLACKSMITH', act: { kind: 'upgrade', count: 1 }, reward: { gold: 150, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'mira6', title: 'Sharper Skills', line: 'Talk to Mira again', npc: 'Mira', reward: { gold: 120 },
    talk: ['Hear that ring? Good steel. The Blacksmith upgrades with gold and Upgrade Cores; this one was a gift.', 'Now your head. The Skill Trainer, by the castle steps on the west side, turns skill points into real skills. Your first lesson is free.', 'And your bag will fill up fast. Put something in the Warehouse east of the square, beside the Blacksmith, so you know it is safe there.'] },
  { id: 'train', title: 'Lessons of the Blade', line: 'Learn or upgrade a skill at the Skill Trainer (free this time)', npc: '', at: 'TRAINER', act: { kind: 'learn', count: 1 }, reward: { gold: 150 } },
  { id: 'stash', title: 'Safe Keeping', line: 'Store an item in the Warehouse', npc: '', at: 'WAREHOUSE', act: { kind: 'store', count: 1 }, reward: { gold: 150, gems: 5 } },
  { id: 'lysa_brew', title: 'Monster Remedies', line: 'Talk to Lysa the Herbalist', npc: 'Lysa', reward: { gold: 120 },
    talk: ['Mira says you have seen the whole town now. Not quite!', 'Down the road past the gate, off to the west in the meadow, an old friend of mine keeps the Elixir Brewer\'s hut. Far from town, on account of the smell. He boils monster parts into elixirs: fangs, gel, scales, whatever you drag home.', 'Bring him some spoils from your hunts and brew one elixir. A good elixir has saved more guards than any sword.'] },
  { id: 'elixir', title: 'A Bitter Brew', line: 'Brew an elixir at the Elixir Brewer (outside the gate, west of the road; needs monster parts)', npc: '', at: 'BREWER', act: { kind: 'brew_elixir', count: 1 }, reward: { gold: 200, gems: 5 } },
  { id: 'report', title: 'The King Awaits', line: 'Report back to King Aldric', npc: 'King Aldric', reward: { gold: 600, gems: 10 },
    talk: ['Slimes cut down, the wolves thinned, and Mira tells me you are properly kitted out. Good.', 'Now a real task. The slimes answer to a king of their own: a great ooze deep in the Greenwood, ten rooms in.', 'Pop the Slime King and the Meadow will breathe again.'] },
  { id: 'slimeking', title: 'The Slime King', line: 'Defeat the Slime King (Greenwood, depth 10)', npc: '', kill: { kind: 'SLIME_KING', count: 1 }, reward: { gold: 800, gems: 15 } },
  { id: 'garrick2', title: 'Rumbling Stones', line: 'Tell Garrick about the Slime King', npc: 'Garrick', reward: { gold: 400, items: [{ id: 'upgrade_core', qty: 1 }] },
    talk: ['The Slime King, popped! Ha! The lads at the gate owe me a drink.', 'But listen: since it fell, the ground past it shakes. Elderroot, the old warden of the Grove, has woken angry.', 'He waits at the end of the Greenwood. Past the Slime King, look for the Boss Key: it opens his door early. Bring him down.'] },
  { id: 'golem', title: 'Warden of the Old Grove', line: 'Defeat Elderroot the Ancient (Greenwood boss: find the Boss Key past depth 10, or reach depth 15)', npc: '', kill: { kind: 'BOSS_TREANT', count: 1 }, reward: { gold: 1200, gems: 20 } },
  { id: 'dorn', title: 'Heart of Stone', line: 'Bring 2 Ore Nuggets to Dorn the Miner', npc: 'Dorn', deliver: { id: 'ore_nugget', count: 2 }, reward: { gold: 700, items: [{ id: 'upgrade_core', qty: 2 }] },
    wait: ['Elderroot sleeps? Then his roots no longer choke the ore veins!', 'There are ore veins just outside the town walls, east and behind the castle, and more out in the wilds. Hold E by a vein to mine it. Bring me two nuggets.'],
    talk: ['Look at that grain. Violet streaks... the old tree drank poison through these veins, sure as anything.', 'Take these cores for your gear. And tell the King what I saw in this ore.'] },
  { id: 'report2', title: 'Stone and Shadow', line: 'Tell King Aldric of Elderroot\'s fall', npc: 'King Aldric', reward: { gold: 800, gems: 10 },
    talk: ['Violet in the stone... then the stories are true.', 'Malakar, the archmage who stole from the Font, lives on in the Void. His stolen light poisons every guardian it touches.', 'Wren the scholar has studied him longer than anyone. Hear her out before you go deeper.'] },
  // ---------------------------------------------------------------- chapter 2: the Marble Halls
  { id: 'wren', title: 'The Scholar\'s Warning', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 300 },
    talk: ['Malakar\'s light spreads like roots. After the Grove it reached the Marble Halls, the old castle of the kings.', 'Gorath the Mountain, the stone guardian of the Halls, walks its corridors now, crushing all he meets.', 'But do not run straight at him. The empty armours of the old royal guard have risen to serve him: break ten of them and his hold on the Halls will slip.'] },
  { id: 'halls_armor', title: 'Empty Oaths', line: 'Defeat Haunted Armors in the Marble Halls (biome 2)', npc: '', kill: { kind: 'HAUNTED_ARMOR', count: 10 }, reward: { gold: 900, gems: 10 } },
  { id: 'aldo', title: 'The Lost Patrol', line: 'Talk to Sir Aldo at the castle steps', npc: 'Sir Aldo', reward: { gold: 300 },
    talk: ['You came back from the Halls? Then you may be our only hope.', 'A patrol of ours went in a week ago. The hunters say the monsters keep them caged, alive, for whatever Gorath wants with them.', 'If you see a cage, defend it, clear the room, then set them free. Two of them, at least. Please.'] },
  { id: 'halls_rescue', title: 'Break the Cages', line: 'Free 2 captives (Rescue the Captive rooms, Marble Halls or deeper)', npc: '', goal: { kind: 'RESCUE', count: 2, biome: 1 }, reward: { gold: 1000, gems: 10 } },
  { id: 'bram', title: 'Champions of Stone', line: 'Tell Sir Bram about the patrol', npc: 'Sir Bram', reward: { gold: 300 },
    talk: ['Aldo will not stop smiling. Thank you, guard.', 'The freed men say champions roam the Halls: the Phalanx Captain, the Grave Warden, and dark copies of heroes like you.', 'Slay one in a champion room (or a dark hero duel). Then the warden at depth ten, and Gorath has no one left to hide behind.'] },
  { id: 'halls_champion', title: 'Champion\'s Challenge', line: 'Slay a champion (champion room or dark hero duel, Marble Halls or deeper)', npc: '', goal: { kind: 'CHAMPION', count: 1, biome: 1 }, reward: { gold: 900, gems: 10 } },
  { id: 'halls_warden', title: 'Keeper of the Broken Hall', line: 'Defeat the Marble Halls champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 1 }, reward: { gold: 1000, gems: 15 } },
  { id: 'grove', title: 'The Mountain Stirs', line: 'Defeat Gorath the Mountain (Marble Halls boss)', npc: '', kill: { kind: 'BOSS_GOLEM', count: 1 }, reward: { gold: 1600, gems: 25 } },
  // ---------------------------------------------------------------- chapter 3: the Sunscorch Desert
  { id: 'lysa2', title: 'Poisoned Water', line: 'Talk to Lysa about the desert', npc: 'Lysa', reward: { gold: 400 },
    talk: ['My herbs from the south come back black and rotten.', 'Something huge woke under the Sunscorch Desert: an engine of the old kings, the size of a keep, walking on six legs. It churns the wells to sludge. It must fall, or the whole valley sickens.', 'Its scorpions guard the dunes and their acid poisons the wells. Kill twelve and the caravans can bring water again.'] },
  { id: 'scorpions', title: 'Stingers in the Sand', line: 'Defeat Giant Scorpions in the Sunscorch Desert (biome 3)', npc: '', kill: { kind: 'SCORPION', count: 12 }, reward: { gold: 1100, gems: 10 } },
  { id: 'maeve', title: 'Lost Caravans', line: 'Talk to Maeve on the south street', npc: 'Maeve', reward: { gold: 400 },
    talk: ['Have you heard? Of course you have not, you were busy with scorpions.', 'Two caravans never made it home. The mummies drag travellers off and cage them in the ruins!', 'Free them, guard. Two at least. Then the whole street will know your name. Well, it already does. I made sure.'] },
  { id: 'desert_rescue', title: 'Bound in Linen', line: 'Free 2 captives (Rescue the Captive rooms, Sunscorch Desert or deeper)', npc: '', goal: { kind: 'RESCUE', count: 2, biome: 2 }, reward: { gold: 1200, gems: 10 } },
  { id: 'desert_warden', title: 'Guardian of the Dunes', line: 'Defeat the Sunscorch Desert champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 2 }, reward: { gold: 1200, gems: 15 } },
  { id: 'mire', title: 'The Sleeping Engine', line: 'Defeat the Dune Colossus (Sunscorch Desert boss)', npc: '', kill: { kind: 'BOSS_WARMACH', count: 1 }, reward: { gold: 2000, gems: 30 } },
  // ---------------------------------------------------------------- chapter 4: Frostpeak
  { id: 'dorn2', title: 'Frozen Passes', line: 'Talk to Dorn about the mountain passes', npc: 'Dorn', reward: { gold: 500 },
    talk: ['The northern passes froze solid overnight, in summer!', 'Miners saw wings over the ice. A wyrm. Glacius, the old songs call it. Clear the way and we can dig again.', 'First the yetis: they smashed our camp to kindling. Ten of them, and my lads can at least get the tools back.'] },
  { id: 'yetis', title: 'Snow Brutes', line: 'Defeat Yetis in Frostpeak (biome 5)', npc: '', kill: { kind: 'YETI', count: 10 }, reward: { gold: 1300, gems: 10 } },
  { id: 'tamsin', title: 'Frozen Champions', line: 'Talk to Guard Tamsin in the castle', npc: 'Guard Tamsin', reward: { gold: 500 },
    talk: ['Dorn\'s miners are back, thanks to you. The Captain wants the pass held, though.', 'Glacius has gathered champions on the ice: the Shellback, the Crystal Behemoth, and worse.', 'Slay two of them. Then the champion at depth ten, and the wyrm will be alone.'] },
  { id: 'frost_champions', title: 'Ice and Iron', line: 'Slay 2 champions (champion rooms or dark hero duels, Frostpeak or deeper)', npc: '', goal: { kind: 'CHAMPION', count: 2, biome: 4 }, reward: { gold: 1400, gems: 15 } },
  { id: 'frost_warden', title: 'Keeper of the Pass', line: 'Defeat the Frostpeak champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 4 }, reward: { gold: 1400, gems: 15 } },
  { id: 'frost', title: 'The Frozen Wing', line: 'Defeat Glacius the Frost Wyrm (Frostpeak boss)', npc: '', kill: { kind: 'BOSS_WYRM', count: 1 }, reward: { gold: 2400, gems: 35 } },
  // ---------------------------------------------------------------- chapter 5: the Ember Wastes
  { id: 'roan', title: 'Smoke on the Horizon', line: 'Talk to Captain Roan in the castle', npc: 'Captain Roan', reward: { gold: 600 },
    talk: ['Guard. Our scouts in the east do not come back.', 'Ignar, the Infernal Warlord, has raised an army of cinders. His hellhounds run down anyone who leaves the road.', 'Kill twelve hounds. Then we will know where my scouts went.'] },
  { id: 'hounds', title: 'Hounds of Cinder', line: 'Defeat Hellhounds in the Ember Wastes (biome 6)', npc: '', kill: { kind: 'HELLHOUND', count: 12 }, reward: { gold: 1600, gems: 15 } },
  { id: 'roan2', title: 'The Missing Scouts', line: 'Report to Captain Roan', npc: 'Captain Roan', reward: { gold: 600 },
    talk: ['Paw prints leading to the Molten Core... and cages. They are alive.', 'The cinder shamans keep them for their fires. Free three of my scouts, guard. I will owe you more than gold.'] },
  { id: 'ember_rescue', title: 'Out of the Fire', line: 'Free 3 captives (Rescue the Captive rooms, Ember Wastes or deeper)', npc: '', goal: { kind: 'RESCUE', count: 3, biome: 5 }, reward: { gold: 1800, gems: 15 } },
  { id: 'ember_warden', title: 'Keeper of the Ashen Gate', line: 'Defeat the Ember Wastes champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 5 }, reward: { gold: 1600, gems: 20 } },
  { id: 'cinders', title: 'Lord of Cinders', line: 'Defeat Ignar the Infernal Warlord (Ember Wastes boss)', npc: '', kill: { kind: 'BOSS_WARLORD', count: 1 }, reward: { gold: 2800, gems: 40 } },
  // ---------------------------------------------------------------- chapter 6: the Void
  { id: 'wren2', title: 'The Edge of the Void', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 700 },
    talk: ['I found it, in the oldest scroll: at the end of the Void a Gatekeeper guards five gates, and behind them stands Malakar\'s Dark Castle.', 'Each gate holds a shard of the castle key. The last gate holds the Herald, Malakar\'s first servant.', 'The Void Stalkers are his eyes at the rift\'s edge. Blind him: twelve of them, before you go near the gates.'] },
  { id: 'stalkers', title: 'Blind the Watchers', line: 'Defeat Void Stalkers in the Void (biome 7)', npc: '', kill: { kind: 'VOID_STALKER', count: 12 }, reward: { gold: 2000, gems: 20 } },
  { id: 'tobin', title: 'Your Own Shadow', line: 'Talk to Elder Tobin by the plaza', npc: 'Elder Tobin', reward: { gold: 700 },
    talk: ['Wren tells me you walk into the Void now. I am old; I remember the last guard who tried.', 'The Void shows you yourself: dark heroes with your own skills, champions that never tire.', 'Beat one of them, and you will know you can beat the rest. Then the keeper at depth ten.'] },
  { id: 'void_champion', title: 'Face the Dark', line: 'Slay a champion (champion room or dark hero duel, in the Void)', npc: '', goal: { kind: 'CHAMPION', count: 1, biome: 6 }, reward: { gold: 2000, gems: 20 } },
  { id: 'void_warden', title: 'Keeper of the Rift', line: 'Defeat the Void champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 6 }, reward: { gold: 2000, gems: 25 } },
  { id: 'herald', title: 'The Herald of the Abyss', line: 'Defeat the Void Herald (the Gate of the Herald, at the Gatekeeper)', npc: '', kill: { kind: 'BOSS_VOID', count: 1 }, reward: { gold: 3200, gems: 50 } },
  // ---------------------------------------------------------------- finale
  { id: 'report3', title: 'The Last Audience', line: 'Report to King Aldric before the end', npc: 'King Aldric', reward: { gold: 1500, items: [{ id: 'upgrade_core', qty: 3 }] },
    talk: ['Every guardian is free. Only the Void remains, and the throne Malakar made for himself there.', 'Take all the light the Font can give you. End him, and bring the stolen light home.'] },
  { id: 'lich', title: 'The Undying', line: 'Clear the 5 Gates of the Void, open the Dark Castle and defeat Malakar', npc: '', ending: true, reward: { gold: 5000, gems: 100 } },
  // ---------------------------------------------------------------- after the end: the Endless Tower
  { id: 'tower_king', title: 'A Light That Endures', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 1500, gems: 20 },
    talk: ['The Font shines again, and the whole of Aether sings your name.', 'Yet the old scholars whisper of the Endless Tower, deep in the dark south-west forest. Floor upon floor of the Void\'s leftovers, climbing forever.', 'No guard of mine has passed its tenth floor. Show them it can be done.'] },
  { id: 'tower', title: 'The Endless Tower', line: 'Clear floor 10 of the Endless Tower (south-west forest, past the gate)', npc: '', at: 'TOWER', act: { kind: 'tower_floor', count: 10 }, reward: { gold: 6000, gems: 120, items: [{ id: 'upgrade_core', qty: 3 }] } },
];

/** Story chapters for the quest window (each starts at a step id and runs to the next chapter). */
export const CHAPTERS: { id: string; title: string; from: string; blurb: string }[] = [
  { id: 'pro', title: 'Prologue · The New Guard', from: 'guard', blurb: 'The Font brought you back. Aether needs guards again, and its people are glad to show a newcomer around before the King gives the word.' },
  { id: 'act1', title: 'Chapter 1 · The Greenwood', from: 'slimes', blurb: 'Beyond the gate the Greenwood stirs: slimes grow bold, wolves hunt the road, their king grows fat, and Elderroot, the warden of the Grove, has woken angry.' },
  { id: 'act2', title: 'Chapter 2 · The Marble Halls', from: 'wren', blurb: 'Malakar\'s light reached the old castle of the kings. Empty armours walk its halls, a patrol sits in its cages, and Gorath the Mountain crushes all he meets.' },
  { id: 'act3', title: 'Chapter 3 · The Sunscorch Desert', from: 'lysa2', blurb: 'The wells of the south run poisoned. Scorpions guard the dunes, caravans vanish into the ruins, and an engine of the old kings walks the dunes again.' },
  { id: 'act4', title: 'Chapter 4 · Frostpeak', from: 'dorn2', blurb: 'Summer froze overnight. Yetis wreck the miners\' camps, champions hold the ice, and Glacius circles the passes.' },
  { id: 'act5', title: 'Chapter 5 · The Ember Wastes', from: 'roan', blurb: 'Smoke in the east. Ignar\'s hounds run down the scouts and his shamans keep the living in cages for their fires.' },
  { id: 'act6', title: 'Chapter 6 · The Void', from: 'wren2', blurb: 'At the rift\'s edge Malakar\'s watchers wait, your own shadow walks the dark, and the Herald guards the last gate.' },
  { id: 'fin', title: 'Finale · The Undying', from: 'report3', blurb: 'Every guardian is free. Only the Void remains, and the throne Malakar made for himself there.' },
  { id: 'post', title: 'Epilogue · The Endless Tower', from: 'tower_king', blurb: 'Malakar is gone, but the Void left something behind: a tower that climbs forever, deep in the south-west forest.' },
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
