// Main story quests: one sequential chain, always shown first (gold) in the quest tracker. Step 0 starts on a new profile
// outside the town gate; the gate stays sealed for runs until the King gives the first task (step 2).
// Pure data + helpers (no React); progress lives in the profile (`story` in store.ts).

/** Where a field / shop step is done (the guide arrow, the gate beacon and auto-walk aim here). */
export type StoryAt = 'SUPPLIES' | 'PETS' | 'FORTUNE' | 'BLACKSMITH' | 'WAREHOUSE' | 'BOARD' | 'BAG';

export interface StoryStep {
  id: string;
  title: string;
  /** tracker line */
  line: string;
  /** who the step talks to (NPC name), or '' for a field / shop objective */
  npc: string;
  /** field objective: kill `count` enemies of `kind` in runs */
  kill?: { kind: string; count: number };
  /** town objective: a shop / town action (engine `hub` event kind), e.g. buy_potion, buy_pet, summon, equip, accept */
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
export const stepCount = (s: StoryStep): number => s.kill?.count ?? s.act?.count ?? s.deliver?.count ?? 0;

// The questline (see docs/RUN_DESIGN.md "Main questline"): townsfolk hand out each task, Genshin / MMO style.
// Prologue (town tutorials): Garrick -> Mira's shop tour (potion, first pet, summon, gear) -> Hodge's bounty board -> the King.
// Act I (Meadow): slimes -> Lysa wants Slime Gel -> King -> Golem -> Dorn wants ore -> King tells of Malakar.
// Act II+: one townsperson per guardian (Wren, Lysa, Dorn, Captain Roan, Wren), the King's last audience, Malakar.
export const STORY: StoryStep[] = [
  // ---------------------------------------------------------------- prologue: the town
  { id: 'guard', title: 'A New Guard', line: 'Report to Garrick at the Town Gate', npc: 'Garrick', reward: { gold: 100 },
    talk: ['So you are the new recruit. The Font brought you back to us, eh?', 'The gate stays shut for new blood until the King himself gives the word.', 'You look half-dressed for the wilds, though. Mira by the fountain will get you sorted first.'] },
  { id: 'mira', title: 'The Town Guide', line: 'Talk to Mira by the fountain', npc: 'Mira', reward: { gold: 100 },
    talk: ['A new guard! Welcome to Aether. I show every newcomer around.', 'First lesson: never leave town without potions. The Potion Shop is just west of the square.', 'Walk up to the counter, press E, and buy one Health Potion. I will wait!'] },
  { id: 'potion', title: 'Stock Up', line: 'Buy a potion at the Potion Shop', npc: '', at: 'SUPPLIES', act: { kind: 'buy_potion', count: 1 }, reward: { gold: 60, items: [{ id: 'potion_hp', qty: 2 }] } },
  { id: 'mira2', title: 'A Friend for the Road', line: 'Tell Mira you bought a potion', npc: 'Mira', reward: { gold: 120 },
    talk: ['Good! Z drinks a health potion, X a mana potion. Two more on the house, from me.', 'Next: nobody walks the wilds alone. The Pet House keeps companions that fight beside you.', 'The keeper gives every new guard a Green Blob for free. Go adopt yours; it will follow you everywhere.'] },
  { id: 'pet', title: 'Your First Pet', line: 'Adopt a pet at the Pet House', npc: '', at: 'PETS', act: { kind: 'buy_pet', count: 1 }, reward: { gold: 60, gems: 10 } },
  { id: 'mira3', title: 'Read the Stars', line: 'Show Mira your new pet', npc: 'Mira', reward: { gems: 10 },
    talk: ['Aww, look at it! It already likes you.', 'Last stop: Madame Zora\'s Fortune tent, at the west end of the street. She summons gear from the stars for gems.', 'Here are some gems. Try one summon; you never know what falls out.'] },
  { id: 'summon', title: 'A Gift from the Stars', line: 'Summon once at the Fortune tent', npc: '', at: 'FORTUNE', act: { kind: 'summon', count: 1 }, reward: { gold: 60, items: [{ id: 'helm_1', qty: 1 }] } },
  { id: 'equip', title: 'Suit Up', line: 'Equip gear from your bag (I) - try the Leather Cap', npc: '', at: 'BAG', act: { kind: 'equip', count: 1 }, reward: { gold: 60 } },
  { id: 'mira4', title: 'Ready for Work', line: 'Talk to Mira again', npc: 'Mira', reward: { gold: 100 },
    talk: ['Now you look like a guard of Aether!', 'Coin comes from bounties. Hodge keeps the Quest Board by the castle steps.', 'Take one bounty: they are optional, but they pay well.'] },
  { id: 'hodge', title: 'The Bounty Clerk', line: 'Talk to Hodge at the Quest Board', npc: 'Hodge', reward: { gold: 80 },
    talk: ['Bounties, bounties! Kill this, fetch that, gold for all of it.', 'Pick any one off the board and it is yours. Come back when it is done and I pay out.'] },
  { id: 'board', title: 'Odd Jobs', line: 'Accept a bounty from the Quest Board', npc: '', at: 'BOARD', act: { kind: 'accept', count: 1 }, reward: { gold: 80 } },
  { id: 'king', title: 'Audience with the King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 300, items: [{ id: 'potion_hp', qty: 3 }] },
    talk: ['Rise, guard. You have the Font\'s light about you; few do any more.', 'Something is twisting the wilds beyond our walls. The old guardians of each land have turned on us.', 'First prove yourself: the slimes in the Meadow grow bold. Cut down ten of them.', 'The Adventure Portal in the forest past the town gate is open to you now. Go with the Font.'] },
  // ---------------------------------------------------------------- act I: the Meadow
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes beyond the gate', npc: '', kill: { kind: 'SLIME', count: 10 }, reward: { gold: 500, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'lysa', title: 'Sticky Business', line: 'Bring 3 Slime Gel to Lysa the Herbalist', npc: 'Lysa', deliver: { id: 'slime_gel', count: 3 }, reward: { gold: 400, items: [{ id: 'potion_hp', qty: 3 }] },
    wait: ['Back from the Meadow? Then you have seen the slimes.', 'Their gel is the base of every healing salve I brew. Bring me three Slime Gel and I will make it worth your while.'],
    talk: ['Three good globs of gel! Fresh, too.', 'Here, my best salves. The King asked after you, by the way. Do not keep him waiting.'] },
  { id: 'report', title: 'The King Awaits', line: 'Report back to King Aldric', npc: 'King Aldric', reward: { gold: 600, gems: 10 },
    talk: ['Ten slimes, and the herbalist is singing your praises. Good.', 'Now a real task. The slimes answer to a king of their own: a great ooze deep in the Meadow, ten rooms in.', 'Pop the Slime King and the Meadow will breathe again.'] },
  { id: 'slimeking', title: 'The Slime King', line: 'Defeat the Slime King (Meadow, depth 10)', npc: '', kill: { kind: 'SLIME_KING', count: 1 }, reward: { gold: 800, gems: 15 } },
  { id: 'garrick2', title: 'Rumbling Stones', line: 'Tell Garrick about the Slime King', npc: 'Garrick', reward: { gold: 400, items: [{ id: 'upgrade_core', qty: 1 }] },
    talk: ['The Slime King, popped! Ha! The lads at the gate owe me a drink.', 'But listen: since it fell, the ground past it shakes. Elderroot, the old warden of the Grove, has woken angry.', 'He waits at the end of the Greenwood. Past the Slime King, look for the Boss Key: it opens his door early. Bring him down.'] },
  { id: 'golem', title: 'Warden of the Old Grove', line: 'Defeat Elderroot the Ancient (Greenwood boss: find the Boss Key past depth 10, or reach depth 15)', npc: '', kill: { kind: 'BOSS_TREANT', count: 1 }, reward: { gold: 1200, gems: 20 } },
  { id: 'dorn', title: 'Heart of Stone', line: 'Bring 2 Ore Nuggets to Dorn the Miner', npc: 'Dorn', deliver: { id: 'ore_nugget', count: 2 }, reward: { gold: 700, items: [{ id: 'upgrade_core', qty: 2 }] },
    wait: ['Elderroot sleeps? Then his roots no longer choke the ore veins!', 'There are ore veins just outside the town walls, east and behind the castle, and more out in the wilds. Hold E by a vein to mine it. Bring me two nuggets.'],
    talk: ['Look at that grain. Violet streaks... the old tree drank poison through these veins, sure as anything.', 'Take these cores for your gear. And tell the King what I saw in this ore.'] },
  { id: 'report2', title: 'Stone and Shadow', line: 'Tell King Aldric of Elderroot\'s fall', npc: 'King Aldric', reward: { gold: 800, gems: 10 },
    talk: ['Violet in the stone... then the stories are true.', 'Malakar, the archmage who stole from the Font, lives on in the Void. His stolen light poisons every guardian it touches.', 'Wren the scholar has studied him longer than anyone. Hear her out before you go deeper.'] },
  // ---------------------------------------------------------------- act II: the guardians
  { id: 'wren', title: 'The Scholar\'s Warning', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 300 },
    talk: ['Malakar\'s light spreads like roots. After the Grove it reached the Marble Halls, the old castle of the kings.', 'Gorath the Mountain, the stone guardian of the Halls, walks its corridors now, crushing all he meets. Free the Halls and the rest will follow.'] },
  { id: 'grove', title: 'The Mountain Stirs', line: 'Defeat Gorath the Mountain (Marble Halls)', npc: '', kill: { kind: 'BOSS_GOLEM', count: 1 }, reward: { gold: 1600, gems: 25 } },
  { id: 'lysa2', title: 'Poisoned Water', line: 'Talk to Lysa about the Mire', npc: 'Lysa', reward: { gold: 400 },
    talk: ['My herbs from the Mire come back black and rotten.', 'Something with many heads has made the swamp its nest. Please: the Hydra must fall, or the whole valley sickens.'] },
  { id: 'mire', title: 'Terror of the Mire', line: 'Defeat the Mire Hydra', npc: '', kill: { kind: 'BOSS_HYDRA', count: 1 }, reward: { gold: 2000, gems: 30 } },
  { id: 'dorn2', title: 'Frozen Passes', line: 'Talk to Dorn about the mountain passes', npc: 'Dorn', reward: { gold: 500 },
    talk: ['The northern passes froze solid overnight, in summer!', 'Miners saw wings over the ice. A wyrm. Glacius, the old songs call it. Clear the way and we can dig again.'] },
  { id: 'frost', title: 'The Frozen Wing', line: 'Defeat Glacius the Frost Wyrm', npc: '', kill: { kind: 'BOSS_WYRM', count: 1 }, reward: { gold: 2400, gems: 35 } },
  { id: 'roan', title: 'Smoke on the Horizon', line: 'Talk to Captain Roan in the castle', npc: 'Captain Roan', reward: { gold: 600 },
    talk: ['Guard. Our scouts in the east do not come back.', 'Ignar, the Infernal Warlord, has raised an army of cinders. You have done what my whole company could not. Do it once more.'] },
  { id: 'cinders', title: 'Lord of Cinders', line: 'Defeat Ignar the Infernal Warlord', npc: '', kill: { kind: 'BOSS_WARLORD', count: 1 }, reward: { gold: 2800, gems: 40 } },
  { id: 'wren2', title: 'The Edge of the Void', line: 'Talk to Wren the Scholar', npc: 'Wren', reward: { gold: 700 },
    talk: ['I found it, in the oldest scroll: at the end of the Void a Gatekeeper guards five gates, and behind them stands Malakar\'s Dark Castle.', 'Each gate holds a shard of the castle key. The last gate holds the Herald, Malakar\'s first servant. Beat them all and the road to his throne lies open.'] },
  { id: 'herald', title: 'The Herald of the Abyss', line: 'Defeat the Void Herald (the Gate of the Herald, at the Gatekeeper)', npc: '', kill: { kind: 'BOSS_VOID', count: 1 }, reward: { gold: 3200, gems: 50 } },
  { id: 'report3', title: 'The Last Audience', line: 'Report to King Aldric before the end', npc: 'King Aldric', reward: { gold: 1500, items: [{ id: 'upgrade_core', qty: 3 }] },
    talk: ['Every guardian is free. Only the Void remains, and the throne Malakar made for himself there.', 'Take all the light the Font can give you. End him, and bring the stolen light home.'] },
  { id: 'lich', title: 'The Undying', line: 'Clear the 5 Gates of the Void, open the Dark Castle and defeat Malakar', npc: '', ending: true, reward: { gold: 5000, gems: 100 } },
];

/** Story chapters for the quest window (each starts at a step id and runs to the next chapter). */
export const CHAPTERS: { id: string; title: string; from: string; blurb: string }[] = [
  { id: 'pro', title: 'Prologue · The New Guard', from: 'guard', blurb: 'The Font brought you back. Aether needs guards again, and its people are glad to show a newcomer around before the King gives the word.' },
  { id: 'act1', title: 'Chapter 1 · Trial of the Meadow', from: 'slimes', blurb: 'Beyond the gate the Meadow stirs: slimes grow bold, their king grows fat, and Elderroot, the warden of the Grove, has woken angry.' },
  { id: 'act2', title: 'Chapter 2 · The Fallen Guardians', from: 'wren', blurb: 'Malakar\'s stolen light poisons every guardian it touches. One land at a time, the townsfolk send you to set them free.' },
  { id: 'fin', title: 'Finale · The Undying', from: 'report3', blurb: 'Every guardian is free. Only the Void remains, and the throne Malakar made for himself there.' },
];

const IDX: Record<string, number> = Object.fromEntries(STORY.map((s, i) => [s.id, i]));
/** Index of a step id (STORY.length if unknown). */
export const storyIdx = (id: string): number => IDX[id] ?? STORY.length;
/** Step ids of the first story version (saves without `v`): mapped by id onto this chain. */
/** Index of 'golem' in story v2 (before the two Slime King steps were added). */
const V2_GOLEM = 15;
const V1 = ['guard', 'king', 'slimes', 'report', 'golem', 'report2', 'grove', 'mire', 'frost', 'cinders', 'herald', 'report3', 'lich'];

export interface StorySave { step: number; p: number; v?: number }
/** New profiles start the chain; old saves (no story field) skip straight to the Lich (or past it). */
export function sanitizeStory(raw: unknown, endings: number, isNew: boolean): StorySave {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    let step = Math.max(0, Math.floor(Number(r.step) || 0)), p = Math.max(0, Math.floor(Number(r.p) || 0));
    if (r.v !== 2 && r.v !== 3) { const id = V1[step]; step = id ? storyIdx(id) : STORY.length; if (id === 'guard') step = 0; }   // v1 save: same step by id
    else if (r.v === 2 && step >= V2_GOLEM) { step = step === V2_GOLEM ? storyIdx('slimeking') : step + 2; if (step === storyIdx('slimeking')) p = 0; }   // v2: the Slime King steps were added before the Golem
    return { step: Math.min(STORY.length, step), p, v: 3 };
  }
  if (isNew) return { step: 0, p: 0, v: 3 };
  return { step: endings > 0 ? STORY.length : storyIdx('slimeking'), p: 0, v: 3 };   // pre-story saves: straight to the first guardian
}
export const storyStep = (s: StorySave): StoryStep | null => STORY[s.step] ?? null;
/** The gate lets you set out once the King has spoken. */
export const gateOpen = (s: StorySave): boolean => s.step > storyIdx('king');
