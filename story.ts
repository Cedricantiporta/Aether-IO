// Main story quests: one sequential chain, always shown first (gold) in the quest tracker. Step 0 starts on a new profile
// outside the town gate; the gate stays sealed for runs until the King gives the first task (step 2).
// Pure data + helpers (no React); progress lives in the profile (`story` in store.ts).

/** Where a field / shop step is done (the guide arrow, the gate beacon and auto-walk aim here). */
export type StoryAt = 'SUPPLIES' | 'PETS' | 'FORTUNE' | 'BLACKSMITH' | 'WAREHOUSE' | 'BAG' | 'ARMORY' | 'TRAINER' | 'BREWER' | 'TOWER';

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

// The questline (see docs/RUN_DESIGN.md "Main questline"): fast-paced (v7: no town tutorial any more): Garrick -> the King -> per
// biome one errand briefing, one hunt, the depth-10 champion and the guardian.
export const STORY: StoryStep[] = [
  // ---------------------------------------------------------------- prologue: the town
  { id: 'guard', title: 'The Font Remembers', line: 'Report to Garrick at the gate', npc: 'Garrick', reward: { gold: 50 },
    talk: ['Easy, easy. You came up out of the well coughing light. Happens to every new recruit. Well. Happens to you, anyway.', 'You:: Is coughing up light normal?', 'No. But neither is anything else around here. You get used to it.', 'Welcome to Aether. Ten years since the Dimming, and the wilds still get worse every night. The gate stays shut until the King gives the word.', 'The King wants to see you. Straight up the avenue to the castle. Go on, before the Font changes its mind.'] },
  { id: 'king', title: 'The Grieving King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 300, items: [{ id: 'potion_hp', qty: 3 }, { id: 'potion_mana', qty: 2 }] },
    talk: ['So the Font sent me another one. Rise, guard. You have its light about you; few do any more.', 'You:: Your Majesty.', 'Ten years ago, on the night of the Dimming, my archmage Malakar went down into the Font and came back with a shard of its light. That same night my daughter, Princess Aelia, vanished.', 'You:: I am sorry, Majesty.', 'Since then the wilds have twisted, and the old guardians of each land have turned on us. Bring back the light, guard. Bring back... whatever you can.', 'Start small: the slimes of the Greenwood grow bold. Cut down ten. The Adventure Portal past the gate is open to you now. Go with the Font.'] },
  // ---------------------------------------------------------------- chapter 1: the Greenwood
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes in the Greenwood', npc: '', kill: { kind: 'SLIME', count: 10 }, reward: { gold: 250, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'wolves', title: 'Thin the Pack', line: 'Defeat Dire Wolves in the Greenwood', npc: '', kill: { kind: 'DIREWOLF', count: 6 }, reward: { gold: 300, gems: 5 } },
  { id: 'slimeking', title: 'The Slime King', line: 'Defeat the Slime King (Greenwood, depth 10)', npc: '', kill: { kind: 'SLIME_KING', count: 1 }, reward: { gold: 400, gems: 15 } },
  { id: 'golem', title: 'Warden of the Old Grove', line: 'Defeat Elderroot the Ancient (Greenwood boss: find the Boss Key past depth 10, or reach depth 15)', npc: '', kill: { kind: 'BOSS_TREANT', count: 1 }, reward: { gold: 600, gems: 20 } },
  { id: 'report2', title: 'A Lullaby in the Stone', line: 'Tell King Aldric of Elderroot\'s fall', npc: 'King Aldric', reward: { gold: 400, gems: 10 },
    talk: ['A lullaby? In the stone?', 'You:: I heard it myself, in the ore. It hums.', '...It is the song her mother sang to her. Aelia\'s song. Malakar used to hum it in the tower while he worked.', 'Then wherever his stolen light seeps, it carries her with it. Wren the scholar has studied him longer than anyone. Go to her. Go now.'] },
  // ---------------------------------------------------------------- chapter 2: the Marble Halls
  { id: 'wren', title: 'The Scholar\'s Warning', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 150 },
    talk: ['The King told you about the song? He never tells anyone anything. You must have frightened him.', 'You:: I only told him about a rock.', 'Malakar\'s light spreads like roots. After the Grove it reached the Marble Halls, the old castle of the kings, where the princess grew up. Gorath the Mountain walks its corridors now, crushing all he meets.', 'The empty armours of her old royal guard have risen to serve him. They still salute, you know, right before they swing. Break eight of them and his hold on the Halls will slip.'] },
  { id: 'halls_armor', title: 'Empty Oaths', line: 'Defeat Haunted Armors in the Marble Halls (biome 2)', npc: '', kill: { kind: 'HAUNTED_ARMOR', count: 8 }, reward: { gold: 450, gems: 10 } },
  { id: 'halls_warden', title: 'Keeper of the Broken Hall', line: 'Defeat the Marble Halls champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 1 }, reward: { gold: 500, gems: 15 } },
  { id: 'grove', title: 'The Mountain Stirs', line: 'Defeat Gorath the Mountain (Marble Halls boss)', npc: '', kill: { kind: 'BOSS_GOLEM', count: 1 }, reward: { gold: 800, gems: 25 } },
  // ---------------------------------------------------------------- chapter 3: the Sunscorch Desert
  { id: 'lysa2', title: 'Poisoned Water', line: 'Talk to Lysa about the desert', npc: 'Lysa', reward: { gold: 200 },
    talk: ['My herbs from the south come back black and rotten. And Hodge sent me a poem. It rhymed "Lysa" with "geyser". I need a holiday.', 'You:: To be fair, it almost rhymes.', 'Do NOT tell him that.', 'Something huge woke under the Sunscorch Desert: an engine of the old kings, the size of a keep, walking on six legs. The old kings built it to dig for the Font\'s light. It is digging again.', 'Its scorpions guard the dunes and their acid poisons the wells. Kill twelve and the caravans can bring water again.'] },
  { id: 'scorpions', title: 'Stingers in the Sand', line: 'Defeat Giant Scorpions in the Sunscorch Desert (biome 3)', npc: '', kill: { kind: 'SCORPION', count: 12 }, reward: { gold: 550, gems: 10 } },
  { id: 'desert_warden', title: 'Guardian of the Dunes', line: 'Defeat the Sunscorch Desert champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 2 }, reward: { gold: 600, gems: 15 } },
  { id: 'mire', title: 'The Sleeping Engine', line: 'Defeat the Dune Colossus (Sunscorch Desert boss)', npc: '', kill: { kind: 'BOSS_WARMACH', count: 1 }, reward: { gold: 1000, gems: 30 } },
  // ---------------------------------------------------------------- chapter 4: Frostpeak
  { id: 'dorn2', title: 'Frozen Passes', line: 'Talk to Dorn about the mountain passes', npc: 'Dorn', reward: { gold: 250 },
    talk: ['The northern passes froze solid overnight. In summer! My beard froze to my pickaxe. We are married now.', 'You:: Congratulations to you both.', 'Miners saw wings over the ice. Glacius, the old songs call her. She held the pass shut against the Void for an age. Now she holds it shut against us.', 'First the yetis: they smashed our camp to kindling and ate the cheese. ALL the cheese. Ten of them, and my lads can at least get the tools back.'] },
  { id: 'yetis', title: 'Snow Brutes', line: 'Defeat Yetis in Frostpeak (biome 5)', npc: '', kill: { kind: 'YETI', count: 10 }, reward: { gold: 650, gems: 10 } },
  { id: 'frost_warden', title: 'Keeper of the Pass', line: 'Defeat the Frostpeak champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 4 }, reward: { gold: 700, gems: 15 } },
  { id: 'frost', title: 'The Frozen Wing', line: 'Defeat Glacius the Frost Wyrm (Frostpeak boss)', npc: '', kill: { kind: 'BOSS_WYRM', count: 1 }, reward: { gold: 1200, gems: 35 } },
  // ---------------------------------------------------------------- chapter 5: the Ember Wastes
  { id: 'roan', title: 'Smoke on the Horizon', line: 'Talk to Captain Roan in the castle', npc: 'Captain Roan', reward: { gold: 300 },
    talk: ['Guard. Sit. No, stand. I have bad news and I am bad at bad news.', 'You:: I will... lean?', 'Ignar, the Infernal Warlord, has raised an army of cinders in the east. His hellhounds run down anyone who leaves the road.', 'Ignar was a guardian. My captain, before me. He swore the oath at the same well as you, and walked into the Wastes after Malakar. The Font never brought him home. Kill twelve hounds. Then we will know where my scouts went.'] },
  { id: 'hounds', title: 'Hounds of Cinder', line: 'Defeat Hellhounds in the Ember Wastes (biome 6)', npc: '', kill: { kind: 'HELLHOUND', count: 12 }, reward: { gold: 800, gems: 15 } },
  { id: 'ember_warden', title: 'Keeper of the Ashen Gate', line: 'Defeat the Ember Wastes champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 5 }, reward: { gold: 800, gems: 20 } },
  { id: 'cinders', title: 'Lord of Cinders', line: 'Defeat Ignar the Infernal Warlord (Ember Wastes boss)', npc: '', kill: { kind: 'BOSS_WARLORD', count: 1 }, reward: { gold: 1400, gems: 40 } },
  // ---------------------------------------------------------------- chapter 6: the Void
  { id: 'wren2', title: 'The Edge of the Void', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 350 },
    talk: ['I found it, in the oldest scroll, and in something worse: the King\'s own sealed letters.', 'You:: Sealed letters? How did you get those?', 'I am a scholar. We read things. Sometimes the things are locked.', 'At the end of the Void a Gatekeeper guards five gates, and behind them stands Malakar\'s Dark Castle. Each gate holds a shard of the castle key; the last holds the Herald.', 'And the letters... the King ordered Malakar into the Font that night. Malakar did not steal the light. He was sent for it. Blind the Void Stalkers first, twelve of them. We will talk about the rest when you are not about to die.'] },
  { id: 'stalkers', title: 'Blind the Watchers', line: 'Defeat Void Stalkers in the Void (biome 7)', npc: '', kill: { kind: 'VOID_STALKER', count: 12 }, reward: { gold: 1000, gems: 20 } },
  { id: 'void_warden', title: 'Keeper of the Rift', line: 'Defeat the Void champion at depth 10', npc: '', goal: { kind: 'PREBOSS', count: 1, biome: 6 }, reward: { gold: 1000, gems: 25 } },
  { id: 'herald', title: 'The Herald of the Abyss', line: 'Defeat the Void Herald (the Gate of the Herald, at the Gatekeeper)', npc: '', kill: { kind: 'BOSS_VOID', count: 1 }, reward: { gold: 1600, gems: 50 } },
  // ---------------------------------------------------------------- finale
  { id: 'report3', title: 'The King\'s Confession', line: 'Report to King Aldric before the end', npc: 'King Aldric', reward: { gold: 750, items: [{ id: 'upgrade_core', qty: 3 }] },
    talk: ['Wren showed you the letters. Good. I have carried this alone long enough.', 'You:: Go on.', 'Aelia had the grey plague. I told Malakar to take light from the Font and save her, whatever it cost. It was killing the Font, so I ordered him to bring the shard back. He refused. He ran, with my daughter\'s light in his hands.', 'He was not a thief. He was a better father to her than I was that night. But he has held her too long, and it has made him a monster.', 'End him, guard. And the shard... bring the shard to me. Only to me. Not to Wren, not to the Font. To me.'] },
  { id: 'lich', title: 'The Undying', line: 'Clear the 5 Gates of the Void, open the Dark Castle and defeat Malakar', npc: '', ending: true, reward: { gold: 2500, gems: 100 } },
  // ---------------------------------------------------------------- after the end: the Endless Tower
  { id: 'tower_king', title: 'A Light That Endures', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 750, gems: 20 },
    talk: ['Malakar has fallen. The Font shines. And my daughter... the shard broke, they tell me, and the Void took her light back into the dark. Again.', 'You:: I am sorry, Majesty.', 'No matter. We are patient, you and I. And you will not remember the pain of it. The Font is kind that way.', 'The scholars whisper of the Endless Tower in the dark south-west forest, floor upon floor of the Void\'s leftovers. Climb it. Grow strong. Strong enough to bring that shard to me next time, unbroken.'] },
  { id: 'tower', title: 'The Endless Tower', line: 'Clear floor 10 of the Endless Tower (deep in the southern forest, at the end of the road)', npc: '', at: 'TOWER', act: { kind: 'tower_floor', count: 10 }, reward: { gold: 3000, gems: 120, items: [{ id: 'upgrade_core', qty: 3 }] } },
  // ---------------------------------------------------------------- the true heir: what the Font made you forget
  { id: 'wren3', title: 'Holes in the Memory', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 1000, gems: 25 },
    talk: ['Sit down. Look at this: your own journal, the night you came back from the Dark Castle. The page is blank. So is the one after the time before.', 'You:: I do not remember writing it.', 'You come home from Malakar\'s throne humming a lullaby and smiling like someone told you a secret. By breakfast, it is gone. Every time.', 'The Font did not always take memories. The old oath only kept you alive. The words were changed ten years ago, on the night of the Dimming. By the King.', 'Take this charm: ink of the old oath, pressed into wax. Hold it when the shard breaks. Finish the adventure again, and again, as many times as it takes. One of those times... remember what she tells you.'] },
  { id: 'remember', title: 'Hold On', line: 'Finish the adventure 10 times in all, see every dream at the Font, and remember what Aelia tells you', npc: '', ending: true, reward: { gold: 2500, gems: 80 } },
  { id: 'wren4', title: 'The Regent\'s Crown', line: 'Tell Wren what you remember', npc: 'Wren', reward: { gold: 1200, gems: 30 },
    talk: ['You remember? Then say it. Slowly. I am writing all of it down. In ink. On stone, if I have to.', 'You:: Aldric is not her father. He was a prince of the eastern march. He wanted to marry Princess Aelia. She said no. Her father, King Edric, said no.', 'And a prince who is told no goes looking for someone who says yes. Under the Font there is something older than the light: the Hollow. It said yes.', 'On the night of the Dimming the Hollow took King Edric and every protector sworn to him, and twisted them into the beasts of the wilds. Gorath was never a stone giant. Gorath was the King.', 'Aelia died that night. Mostly. Malakar, her tutor, caught her last light in a shard as it left her, and ran into the Void before the Hollow could swallow it.', 'Aldric married no one. He simply took the crown, called himself her grieving father, and changed the Font\'s oath so his guards would forget. He cannot leash the Hollow. He needs the shard to bargain with it. Go to the castle. Ask him to his face.'] },
  { id: 'usurper', title: 'The False King', line: 'Confront King Aldric in the castle', npc: 'King Aldric', reward: { gold: 1500, gems: 40 },
    talk: ['...Wren. Always Wren. I should have let the Font take her memories too.', 'I asked for her hand, guard. Politely. Twice. She laughed, and Edric showed me the door. A prince of the eastern march, shown the DOOR.', 'The Hollow was kinder. It asked one thing: everything Edric loved. So it took his knights, his dragon, his old tree, his captain... and him. You have met them all. You have killed most of them.', 'She was meant to be mine when it was done. Instead she died, and that thief Malakar ran off with what was left. I sent you after it. Not to save her. To trade her. The Hollow does not stay fed for long.', 'You:: It is in you. Your shadow is moving on its own.', '...Yes. It has been, for a while. I never trusted the dark, you know. I only wanted it to kneel. Go. Find her. Before it finishes with me.'] },
  { id: 'queen', title: 'Long Live the Queen', line: 'Speak with Queen Aelia in the castle', npc: 'Queen Aelia', reward: { gold: 3000, gems: 150, items: [{ id: 'upgrade_core', qty: 5 }] },
    talk: ['You found me. Properly, this time, and you remembered. Do you know how many times we have said goodbye in that forest? I stopped counting at nine.', 'You:: Ten. I counted for both of us.', 'Aldric is gone. The Hollow finished him the way it finished my father, only it did not bother to make him into anything. Mortimer buried his crown. He insisted on being paid first.', 'You:: Seven years of back pay, I expect.', 'My father rests now. Gorath is only a hill again, and some mornings I go and sit on it, the way I did when I was small.', 'Malakar is not dead. He never was. Every time you struck him down, he went back into the Void and sat down beside the Hollow, so it would gnaw on him instead of on us. The echoes in the Ascension are the Hollow wearing his face.', 'So. I am queen now, apparently. First decree: the Font keeps its old oath, and no guard of Aether forgets again. Second: someone take Hodge\'s quill away.'] },
];

/** Story chapters for the quest window (each starts at a step id and runs to the next chapter). */
export const CHAPTERS: { id: string; title: string; from: string; blurb: string }[] = [
  { id: 'pro', title: 'Prologue · Out of the Well', from: 'guard', blurb: 'You woke in the Font, coughing light. Ten years after the Dimming, Aether is a frightened little town with a grieving King and a gate that is about to open.' },
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
/** Save version of the chain (v4: biome chapters; v6: Quest Board steps cut; v7: the town tutorial + filler steps cut, fast-paced chain). */
export const STORY_V = 7;
/** Old chain versions are stored as id lists by index; a step id that no longer exists continues at the next surviving one. */
const V6 = ['guard', 'king', 'slimes', 'lysa', 'garrick_wolves', 'wolves', 'report', 'slimeking', 'garrick2', 'golem', 'dorn', 'report2', 'wren', 'halls_armor', 'aldo', 'halls_rescue', 'bram', 'halls_champion', 'halls_warden', 'grove', 'lysa2', 'scorpions', 'maeve', 'desert_rescue', 'desert_warden', 'mire', 'dorn2', 'yetis', 'tamsin', 'frost_champions', 'frost_warden', 'frost', 'roan', 'hounds', 'roan2', 'ember_rescue', 'ember_warden', 'cinders', 'wren2', 'stalkers', 'tobin', 'void_champion', 'void_warden', 'herald', 'report3', 'lich', 'tower_king', 'tower', 'wren3', 'remember', 'wren4', 'usurper', 'queen'];
/** v6 plus the tutorial block (v5 / v6 differ only by the Quest Board steps 'hodge' / 'board'). */
const TUT = ['mira', 'potion', 'mira2', 'pet', 'mira3', 'summon', 'equip', 'mira4', 'armor', 'forge', 'mira6', 'train', 'stash', 'lysa_brew', 'elixir'];
const V5 = ['guard', ...TUT, 'hodge', 'board', ...V6.slice(1)];
/** Step ids of story v4, by index (owner v5: the town tutorial moved right after the first one; 'mira5' merged into 'mira4'). */
const V4 = ['guard', 'mira', 'potion', 'mira2', 'pet', 'mira3', 'summon', 'equip', 'mira4', 'hodge', 'board', 'king', 'slimes', 'lysa', 'garrick_wolves', 'wolves', 'mira5', 'armor', 'forge', 'mira6', 'train', 'stash', 'lysa_brew', 'elixir', 'report', 'slimeking', 'garrick2', 'golem', 'dorn', 'report2', 'wren', 'halls_armor', 'aldo', 'halls_rescue', 'bram', 'halls_champion', 'halls_warden', 'grove', 'lysa2', 'scorpions', 'maeve', 'desert_rescue', 'desert_warden', 'mire', 'dorn2', 'yetis', 'tamsin', 'frost_champions', 'frost_warden', 'frost', 'roan', 'hounds', 'roan2', 'ember_rescue', 'ember_warden', 'cinders', 'wren2', 'stalkers', 'tobin', 'void_champion', 'void_warden', 'herald', 'report3', 'lich'];
/** Step ids of story v3, by index. */
const V3 = ['guard', 'mira', 'potion', 'mira2', 'pet', 'mira3', 'summon', 'equip', 'mira4', 'hodge', 'board', 'king', 'slimes', 'lysa', 'report',
  'slimeking', 'garrick2', 'golem', 'dorn', 'report2', 'wren', 'grove', 'lysa2', 'mire', 'dorn2', 'frost', 'roan', 'cinders', 'wren2', 'herald', 'report3', 'lich'];
/** Step ids of the first story version (saves without `v`). */
const V1 = ['guard', 'king', 'slimes', 'report', 'golem', 'report2', 'grove', 'mire', 'frost', 'cinders', 'herald', 'report3', 'lich'];
/** Index of 'golem' in story v2 (before the two Slime King steps were added). */
const V2_GOLEM = 15;

export interface StorySave { step: number; p: number; v?: number }
/** First post-game step (old saves that had finished the chain land here). */
const POST = IDX.tower_king;
/** New profiles start the chain; old saves (no story field) skip straight to the Slime King (or past the end).
 *  Older chain versions land on the same step id (v2 / v3 indices are mapped through their id lists). */
export function sanitizeStory(raw: unknown, endings: number, isNew: boolean): StorySave {
  /** Old list index -> this chain: the first surviving step at or after it (a finished chain: the post-game Tower quest). */
  const fromList = (list: string[], step: number, p: number): StorySave => {
    for (let j = step; j < list.length; j++) if (list[j] in IDX) return { step: IDX[list[j]], p: j === step ? p : 0, v: STORY_V };
    return { step: POST, p: 0, v: STORY_V };
  };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    let step = Math.max(0, Math.floor(Number(r.step) || 0)), p = Math.max(0, Math.floor(Number(r.p) || 0));
    if (r.v === STORY_V) return { step: Math.min(STORY.length, step), p, v: STORY_V };
    if (r.v === 6) return step >= V6.length ? { step: STORY.length, p, v: STORY_V } : fromList(V6, step, p);
    if (r.v === 5) return fromList(V5, step, p);
    if (r.v === 4) return fromList(V4.map((id) => (id === 'mira5' ? 'armor' : id)), step, p);
    if (r.v !== 2 && r.v !== 3) return fromList(V1, step, p);   // v1 save: same step by id
    if (r.v === 2 && step >= V2_GOLEM) { step = step === V2_GOLEM ? 15 : step + 2; if (step === 15) p = 0; }   // v2 -> v3: the Slime King steps were added before the Golem
    return fromList(V3, step, p);
  }
  if (isNew) return { step: IDX.king, p: 0, v: STORY_V };   // (owner 2026-10-25) a new hero first speaks with the King, who sends him after the slimes
  return { step: endings > 0 ? POST : storyIdx('slimeking'), p: 0, v: STORY_V };   // pre-story saves: straight to the first guardian
}
export const storyStep = (s: StorySave): StoryStep | null => STORY[s.step] ?? null;
/** The gate lets you set out once the King has spoken. */
export const gateOpen = (s: StorySave): boolean => s.step > storyIdx('king');
