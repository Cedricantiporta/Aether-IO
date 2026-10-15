// The story of Aether Survivor: the prologue (shown once), the Story book chapters (unlocked by progress) and the
// lines the Font speaks when a guardian falls. Kept in one place so NPC dialogue and screens stay consistent.

/** Shown the first time the hero arrives in the village (replayable from the Story book). */
export const PROLOGUE: string[] = [
  'Beneath the village well lies the Aether Font, the last spring of living light in the Kingdom of Aether.',
  'For three hundred years its guardians kept it, bound by an old oath: while the Font burns, its sworn guard cannot truly die.',
  'Then Malakar, the King\'s own archmage, stole a shard of the Font\'s light to make himself undying, and fled into the Void.',
  'Where the stolen light seeped out, the wilds twisted. Paths rearrange themselves overnight. Beasts grow cruel. The old guardians of each land turned into monsters.',
  'You are the village guard, newly sworn at the Font.',
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
    'It cannot save what you carry in your hands for long, so guardians learned to fill their bags quickly and bank their gold at home.',
    'That is why you come back. That is why you can go out again, and again, until the job is done.',
  ] },
  { id: 'malakar', title: 'II. The Archmage', unlock: { kind: 'start' }, text: [
    'Malakar was the finest mind the court ever had. He healed a plague, taught the castle to light itself, and grew afraid of nothing except growing old.',
    'One winter night he went down into the Font with a crystal vial. He came back up carrying a shard of the light, and something in his eyes had gone out.',
    'He fled past the Mire, past Frostpeak and the Ember Wastes, into the Void beyond the edge of the map. They call him the Undying now. They do not say his name in the market.',
  ] },
  { id: 'elderroot', title: 'III. Elderroot', unlock: { kind: 'boss', boss: 'BOSS_TREANT', hint: 'Defeat the guardian of the Greenwood.' }, text: [
    'The oldest tree in the Grove once sheltered the first guardians while they dug the well.',
    'His roots drank the poisoned light that ran downhill from the Void. You did not kill Elderroot. You let him sleep again.',
  ] },
  { id: 'gorath', title: 'IV. Gorath of the Halls', unlock: { kind: 'boss', boss: 'BOSS_GOLEM', hint: 'Defeat the guardian of the Marble Halls.' }, text: [
    'Gorath was a hill the shepherds leaned on, a stone giant who kept the old kings\' gates for a hundred years.',
    'The stolen light woke him wrong. When he fell, the stones stopped grinding, and for a moment the Halls sounded the way the old songs say it should.',
  ] },
  { id: 'hydra', title: 'V. The Mire Hydra', unlock: { kind: 'boss', boss: 'BOSS_HYDRA', hint: 'Defeat the guardian of the Mire.' }, text: [
    'The Mire was a lake of lilies, and the Hydra its shy keeper, with one head that slept and two that sang.',
    'Old Wend says he heard the singing from his fire every night before the light went bad. He has not heard it since.',
  ] },
  { id: 'wyrm', title: 'VI. The Frost Wyrm', unlock: { kind: 'boss', boss: 'BOSS_WYRM', hint: 'Defeat the guardian of Frostpeak.' }, text: [
    'Glacius kept the mountain pass shut against the Void for an age, wrapped around the peak like a scarf of ice.',
    'Malakar did not fight her. He simply whispered to her for a very long time. When you broke the frost, the pass beyond lay open.',
  ] },
  { id: 'warlord', title: 'VII. The Ember Warlord', unlock: { kind: 'boss', boss: 'BOSS_WARLORD', hint: 'Defeat the guardian of the Ember Wastes.' }, text: [
    'He was a guardian once, like you. He swore the oath at the same well.',
    'He followed Malakar into the Wastes to bring him back and was never pulled home. The Font does not reach that far. Remember that.',
  ] },
  { id: 'herald', title: 'VIII. The Void Herald', unlock: { kind: 'boss', boss: 'BOSS_VOID', hint: 'Defeat the guardian of the Void.' }, text: [
    'Not a guardian at all: a thing Malakar made out of the stolen light itself, to stand at the door of his throne.',
    'When it came apart, the Font flickered back home, bright enough that the whole village woke. Somewhere ahead, a throne room waited.',
  ] },
  { id: 'throne', title: 'IX. The Undying Throne', unlock: { kind: 'ending' }, text: [
    'Malakar fell, and the shard he stole rolled across the throne room floor and went home on its own, the way light does.',
    'The Font is whole again. The paths will settle, slowly. The guardians of the lands will sleep.',
    'But the Void remembers him. In its deepest places, echoes of the Undying still gather. The Ascension is the long walk down to put each one out.',
  ] },
  { id: 'tower', title: 'X. The Endless Tower', unlock: { kind: 'ending' }, text: [
    'The first guardians built a tower outside the gate to train in. It had nine floors when they finished it.',
    'Nobody has counted them since the Font was made whole. Every guardian who climbs it swears it is taller than the day before.',
  ] },
  { id: 'echoes', title: 'XI. Echoes', unlock: { kind: 'ascension' }, text: [
    'Every echo of Malakar you put out is a little quieter than the last, and a little angrier.',
    'King Aldric has stopped asking when it will end. He only asks that you come home.',
  ] },
];

/** Shown on the death screen (the Font pulls the hero home). */
export const FALL_LINES: string[] = [
  'The Font gathers what is left of you and carries you home.',
  'Light takes you, and the plaza stones are cold under your cheek.',
  'Somewhere far away, the oath tugs. You wake beside the well.',
  'The wilds keep your footprints. The Font keeps you.',
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
