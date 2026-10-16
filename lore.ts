// The story of Aether Survivor: the prologue (shown once), the Story book chapters (unlocked by progress) and the
// lines the Font speaks when a guardian falls. Kept in one place so NPC dialogue and screens stay consistent.

/** Shown the first time the hero arrives in the village (replayable from the Story book). */
export const PROLOGUE: string[] = [
  'Beneath the village well lies the Aether Font, the last spring of living light in the Kingdom of Aether.',
  'Ten years ago, on the night they now call the Dimming, the archmage Malakar went down into the Font and came back up with a shard of its light. That same night Princess Aelia vanished from her bed.',
  'Malakar fled into the Void. Where his stolen light seeped out, the wilds twisted. Beasts grew cruel. The old guardians of each land turned into monsters.',
  'The Font answers by raising guards from its water: sworn to the light, and unable to truly die while it burns.',
  'You are the newest. You remember nothing before the well. Everyone in town is very polite about that.',
  'When you fall out there, the Font will pull you home in a pillar of light. Bring back what you can. Then go again.',
];

export interface LoreChapter {
  id: string;
  title: string;
  /** progress needed to read it (see loreUnlocked) */
  unlock: { kind: 'start' } | { kind: 'boss'; boss: string; hint: string } | { kind: 'ending' } | { kind: 'ascension' };
  text: string[];
}

export const CHAPTERS: LoreChapter[] = [
  { id: 'oath', title: 'I. The Oath of the Font', unlock: { kind: 'start' }, text: [
    'Every guardian swears the same words at the well: "My life to the light, and the light to my life."',
    'The Font keeps its half of the bargain. A guardian who falls far from home is gathered up as light and set down again on the plaza stones, whole, if a little dizzy.',
    'It does not bring back everything. Each return leaves a little of you out there in the dark. The old guards stopped counting their deaths. They say it helps.',
    'That is why you come back. That is why you can go out again, and again, until the job is done.',
  ] },
  { id: 'malakar', title: 'II. The Archmage', unlock: { kind: 'start' }, text: [
    'Malakar was the finest mind the court ever had. He healed the first plague, taught the castle to light itself, and taught a small princess to read the stars from the tower roof.',
    'One winter night he went down into the Font with a crystal vial. He came back up carrying a shard of the light, and something in his eyes had gone out.',
    'They call him the Undying now, and the Thief. They do not say his name in the market. The King says it often, and always a little too quickly.',
  ] },
  { id: 'elderroot', title: 'III. Elderroot', unlock: { kind: 'boss', boss: 'BOSS_TREANT', hint: 'Defeat the guardian of the Greenwood.' }, text: [
    'The oldest tree in the Grove once sheltered the first guardians while they dug the well.',
    'His roots drank the violet light that ran downhill from the Void, and with it a lullaby he did not know. You did not kill Elderroot. You let him sleep again.',
  ] },
  { id: 'gorath', title: 'IV. Gorath of the Halls', unlock: { kind: 'boss', boss: 'BOSS_GOLEM', hint: 'Defeat the guardian of the Marble Halls.' }, text: [
    'Gorath was a hill the shepherds leaned on, a stone giant who kept the old kings\' gates and let a little princess climb him every summer. So the songs say.',
    'The songs are wrong. He caged the living instead of crushing them, and he wore no crown, but he stood every night at the door of the princess\'s empty room.',
  ] },
  { id: 'hydra', title: 'V. The Tide Hydra', unlock: { kind: 'boss', boss: 'BOSS_HYDRA', hint: 'Defeat the guardian of the Coral Isles.' }, text: [
    'The reef was a garden of coral and lilies, and the Hydra its shy keeper, with one head that slept and two that sang.',
    'Old Wend says he heard the singing from his fire every night before the light went bad. He swears the third head learned the princess\'s lullaby. He has not heard it since.',
  ] },
  { id: 'wyrm', title: 'VI. The Frost Wyrm', unlock: { kind: 'boss', boss: 'BOSS_WYRM', hint: 'Defeat the guardian of Frostpeak.' }, text: [
    'Glacius kept the mountain pass shut against the Void for an age, wrapped around the peak like a scarf of ice.',
    'Malakar did not fight her. He told her what he carried, and asked her to keep everyone away. She agreed. When you broke the frost, the pass beyond lay open.',
  ] },
  { id: 'warlord', title: 'VII. The Ember Warlord', unlock: { kind: 'boss', boss: 'BOSS_WARLORD', hint: 'Defeat the guardian of the Ember Wastes.' }, text: [
    'Ignar was captain of King Edric\'s guard before Roan, and swore the oath at the same well. On the night of the Dimming, the Hollow took him with his King.',
    'The court says he followed Malakar into the Wastes and was never pulled home. The court says a great many things.',
    'At the end he kept his prisoners alive. Roan likes to think that was the captain, still in there, giving orders.',
  ] },
  { id: 'herald', title: 'VIII. The Void Herald', unlock: { kind: 'boss', boss: 'BOSS_VOID', hint: 'Defeat the guardian of the Void.' }, text: [
    'Not a guardian at all: a thing Malakar made out of ten years of grief, to stand at the door of his throne.',
    'When it came apart, the Font flickered back home, bright enough that the whole village woke. Somewhere ahead, a throne room waited, and in it, a jar of light.',
  ] },
  { id: 'throne', title: 'IX. The Undying Throne', unlock: { kind: 'ending' }, text: [
    'Malakar fell, and the shard he held for ten years rolled across the throne room floor and broke open.',
    'What came out of it was a girl, who spoke to you as if she had done this many times before. Then the Font pulled you home, and by morning she was a dream.',
    'Malakar is never quite gone. Neither is she. Something beneath the Font makes sure of both.',
  ] },
  { id: 'tower', title: 'X. The Endless Tower', unlock: { kind: 'ending' }, text: [
    'The first guardians built a tower outside the gate to train in. It had nine floors when they finished it.',
    'Nobody has counted them since the Font was made whole. Every guardian who climbs it swears it is taller than the day before. Tobin says it is built from everything the Font ever left behind.',
  ] },
  { id: 'echoes', title: 'XI. Echoes', unlock: { kind: 'ascension' }, text: [
    'Every echo of Malakar you put out is a little quieter than the last, and a little sadder.',
    'They are not him. They are the Hollow beneath the Font wearing his face, and he sits down there in the dark beside it, so it gnaws on him instead of on Aether.',
  ] },
];

/** Shown on the death screen (the Font pulls the hero home). */
export const FALL_LINES: string[] = [
  'The Font gathers what is left of you and carries you home. Not all of it. Never all of it.',
  'Light takes you, and the plaza stones are cold under your cheek. Mira is already waving.',
  'Somewhere far away, the oath tugs. You wake beside the well, humming a song you do not know.',
  'The wilds keep your footprints. The Font keeps you.',
  'Garrick, without looking up: "Welcome back. Again."',
];

export interface LoreProgress { bossKills: Record<string, number>; endings: number; ascensionMax: number }
export function loreUnlocked(c: LoreChapter, p: LoreProgress): boolean {
  const u = c.unlock;
  if (u.kind === 'start') return true;
  if (u.kind === 'boss') return (p.bossKills[u.boss] ?? 0) > 0 || p.endings > 0;
  if (u.kind === 'ending') return p.endings > 0;
  return p.ascensionMax >= 2;
}
export const loreHint = (c: LoreChapter): string => (c.unlock.kind === 'boss' ? c.unlock.hint : c.unlock.kind === 'ending' ? 'Finish the adventure.' : c.unlock.kind === 'ascension' ? 'Clear Ascension 1.' : '');
