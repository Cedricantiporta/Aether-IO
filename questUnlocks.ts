// ============================================================================
// (owner, Hades-style) Quests are unlocked by dying. A new hero knows ONE quest: "Trial of the Meadow" (defeat slimes).
// Every adventure death (and every ending) then rolls "did someone come knocking while you slept?": most of the time (~75%,
// the first death always, a miss is never repeated more than twice, and always when nothing is left to do) the next BEAT
// below opens: either a stretch of the main story chain, or a side quest (its giver gets a blue "!").
// The order is fixed (main story first, side quests mixed in). Pure data + helpers (no store import): the store keeps
// `unlocks: UnlockSave` (saved with the profile); `unlockMirror.n` is a copy of `unlocks.n` for modules that cannot read
// the store (npcQuests.npcQuestStatus), kept in sync by store.ts.
// ============================================================================
import { STORY, storyIdx, type StoryStep } from './story';

export interface Beat {
  id: string;
  /** opens the main chain up to and including this step id */
  story?: string;
  /** opens these side quests */
  side?: string[];
  /** who is waiting (dialogue name) and the short scene played after waking */
  who: string;
  title: string;
  lines: string[];
  /** a welcome gift (the King's potions: the old "go see the King" steps are gone) */
  gift?: { items: { id: string; qty: number }[] };
}

export const BEATS: readonly Beat[] = [
  { id: 'b_wolves', story: 'slimeking', who: 'Garrick', title: 'A Knock at the Door',
    lines: ['*knock knock* Rise and shine, recruit! You came out of the Font coughing light again. Very dramatic. I liked it.', 'The King heard you are cutting down slimes and sent a little something: three health potions and two mana potions. He said "do not tell her I was nice about it".', 'Also: wolves. Dire ones. They have been eyeing the road. Thin the pack, then find the Slime King at depth 10.'],
    gift: { items: [{ id: 'potion_hp', qty: 3 }, { id: 'potion_mana', qty: 2 }] } },
  { id: 'b_milk', side: ['hollis_milk'], who: 'Hollis', title: 'A Note Under the Door',
    lines: ['Someone slipped a note under your door while you slept. It smells faintly of hay.', '"Dear hero. The cows are being difficult and I am being tired. Please come to the barn. - Hollis"'] },
  { id: 'b_elderroot', story: 'report2', who: 'King Aldric', title: 'A Royal Page',
    lines: ['A very small royal page is sitting on your doorstep, holding a very large scroll.', '"His Majesty says: the old tree in the Greenwood has woken up angry. Elderroot. Please do not let him stay angry. Come and tell me when he is calm."', 'The page curtsies, trips over the scroll, and runs away.'] },
  { id: 'b_eggs', side: ['dalla_eggs'], who: 'Dalla', title: 'A Basket by the Bed',
    lines: ['There is a little basket by your bed with one egg in it and a note.', '"The hens are hiding their eggs again and I know exactly who is teaching them. Come help me find some. - Dalla"'] },
  { id: 'b_marble', story: 'grove', who: 'Wren', title: 'Ink on the Pillow',
    lines: ['Your pillow has ink on it. So does your nose. Wren the scholar has been in your room.', '"I took the liberty. I have found something about the old castle of the kings, and you MUST hear it. Come and find me. Bring snacks."'] },
  { id: 'b_cat', side: ['pip_cat'], who: 'Pip', title: 'A Very Small Visitor',
    lines: ['Someone is sitting on the foot of your bed. It is Pip, and she is trying very hard not to cry.', '"Biscuit is gone! My cat! He is orange and rude and I love him. Please, please help me look!"'] },
  { id: 'b_desert', story: 'mire', who: 'Lysa', title: 'Black Herbs',
    lines: ['A bundle of herbs lies on your table. They are black and soggy, and a note is pinned to them.', '"Do you see what the south is sending me?! Come by the shop. Bring your sword. - Lysa"'] },
  { id: 'b_graves', side: ['elowen_graves'], who: 'Sister Elowen', title: 'A Candle in the Window',
    lines: ['Somebody left a candle burning on your windowsill. It is the gentle church kind.', '"The graves are restless again, child. A few kind words and a good hard whack would settle them. Come by the church when you can. - Sister Elowen"'] },
  { id: 'b_frost', story: 'frost', who: 'Dorn', title: 'Frozen Pickaxe',
    lines: ['There is frost on the inside of your window, and a pickaxe frozen to your doorstep.', '"Hero! The mountain passes are shut and my beard is attached to a tool. Come and see me. Do bring warm socks. - Dorn"'] },
  { id: 'b_tankards', side: ['rodric_goblets'], who: 'Rodric the Tipsy', title: 'A Hiccup in the Night',
    lines: ['You wake up to a gentle hiccup outside the door, and a muffled "shhh, shhh, she is sleeping!"', '"Hic. Psst. Hero. I seem to have lost two silver goblets. Very important. Very shiny. Come to the tavern. - Rodric"'] },
  { id: 'b_ember', story: 'cinders', who: 'Captain Roan', title: 'Smoke on the Horizon',
    lines: ['A faint smell of smoke drifts through the window, and a stiff little note is tucked in the frame.', '"Guard. Report to the castle at once. I have bad news and I am bad at bad news. - Captain Roan"'] },
  { id: 'b_secret', side: ['pip_secret'], who: 'Pip', title: 'A Whisper at the Keyhole',
    lines: ['Someone is whispering through your keyhole. It is Pip again.', '"I know a secret about the hermit behind the north wall! But I am too small to tell him. Find me when you are done sleeping!"'] },
  { id: 'b_void', story: 'herald', who: 'Wren', title: 'Sealed Letters',
    lines: ['Your door has a scholar-shaped dent in it, and a letter under it with a broken seal.', '"I found something. In the oldest scroll, and in something worse. Meet me when you wake. Do not tell the King. - Wren"'] },
  { id: 'b_finale', story: 'lich', who: 'King Aldric', title: 'The King Waits',
    lines: ['A royal messenger bows so low outside your door that you can hear his back crack.', '"His Majesty asks for you. He says he has carried something alone for too long, and he would like to put it down."'] },
  { id: 'b_tower', story: 'tower', who: 'King Aldric', title: 'A Tower in the South',
    lines: ['The page is back. The scroll is smaller this time, which is encouraging.', '"His Majesty says: Malakar has fallen, the Font shines, and there is a tower in the southern forest that nobody has ever finished. Go and be the first."'] },
  { id: 'b_rocks', side: ['erin_boulder', 'erin_frost'], who: 'Erin', title: 'A Pebble on the Pillow',
    lines: ['There is a smooth grey pebble on your pillow, with a tiny note tied to it.', '"There is a rockfall by the Crystal Cave that I cannot get past. I think someone behind it is calling. - Erin"'] },
  { id: 'b_heir', story: 'queen', who: 'Wren', title: 'Blank Pages',
    lines: ['Your journal lies open on the table. Some of the pages are blank, and a sticky note says "THESE ARE NOT SUPPOSED TO BE BLANK."', '"Come to my study. We need to talk about what the Font has been taking from you. - Wren"'] },
];

/** The chain is open up to `slimes` for everyone; every story beat opens it up to its `story` step. */
const BASE_CAP = storyIdx('slimes');
const STORY_CAPS: number[] = (() => { let c = BASE_CAP; return BEATS.map((b) => (c = b.story ? Math.max(c, storyIdx(b.story)) : c)); })();
/** Highest main-story step index open after `n` beats (beats in `wait` = the hero has not spoken to their NPC yet: not open). */
export const storyCap = (n: number, wait?: readonly string[]): number => {
  if (!wait || !wait.length) return n <= 0 ? BASE_CAP : STORY_CAPS[Math.min(n, BEATS.length) - 1];
  let c = BASE_CAP;
  for (let i = 0; i < Math.min(n, BEATS.length); i++) { const b = BEATS[i]; if (b.story && !wait.includes(b.id)) c = Math.max(c, storyIdx(b.story)); }
  return c;
};
/** True when main step `step` has not been unlocked yet (it is hidden: no talk, no kills counted, no tracker row). */
export const storyHeld = (step: number, n: number, wait?: readonly string[]): boolean => step > storyCap(n, wait);
/** The main step the hero is on, or undefined when it is finished or still locked. */
export const liveStep = (s: { story: { step: number }; unlocks: { n: number; wait?: string[] } }): StoryStep | undefined => (storyHeld(s.story.step, s.unlocks.n, s.unlocks.wait) ? undefined : STORY[s.story.step]);
/** (owner 2026-10-25) Beats opened but not met yet: their quests only start once the hero talks to `who` (the tracker shows
 *  "Talk to <who>"; a tap walks there). Main-story beats first. */
export const pendingBeats = (u: { wait?: string[] }): Beat[] => {
  const out: Beat[] = [];
  for (const b of BEATS) if (u.wait?.includes(b.id)) out.push(b);
  return out.sort((a, b) => (a.story ? 0 : 1) - (b.story ? 0 : 1));
};

const SIDE_FIRST: Record<string, number> = (() => { const m: Record<string, number> = {}; BEATS.forEach((b, i) => { for (const id of b.side ?? []) m[id] = i; }); return m; })();
/** Side quest `id` was unlocked by beat number < n, or its side beat was opened early by a level-up (`early` = beat ids;
 *  ids no beat mentions are always open). */
export const sideUnlocked = (id: string, n: number, early?: readonly string[], wait?: readonly string[]): boolean => !(id in SIDE_FIRST) || ((SIDE_FIRST[id] < n || (!!early && early.length > 0 && early.includes(BEATS[SIDE_FIRST[id]].id))) && !(wait && wait.includes(BEATS[SIDE_FIRST[id]].id)));

export interface UnlockSave {
  /** beats opened so far (BEATS[0..n-1]) */
  n: number;
  /** deaths in a row that opened nothing (the third always does) */
  miss: number;
  /** (owner) side-quest beats (ids) opened EARLY by a hero level-up, ahead of `n`; main-story order still follows `n` only.
   *  A death roll skips beats listed here (nextBeatIndex) and drops the ones `n` has passed. */
  early?: string[];
  /** (owner) beat ids opened but whose NPC (`who`) the hero has not spoken to yet: their quests wait for that talk */
  wait?: string[];
}
export const emptyUnlocks = (): UnlockSave => ({ n: 0, miss: 0 });
/** Mirror of `unlocks.n` / `unlocks.early` for modules without store access (npcQuests.npcQuestStatus); written by store.ts. */
export const unlockMirror: { n: number; early: readonly string[]; wait: readonly string[] } = { n: 0, early: [], wait: [] };

/** Index of the next beat a DEATH opens: the first at or after `n` that a level-up has not already opened. */
export function nextBeatIndex(u: UnlockSave): number {
  let i = u.n;
  while (i < BEATS.length && u.early?.includes(BEATS[i].id)) i++;
  return i;
}
/** Index of the next not-yet-opened SIDE beat (skips main-story beats), or -1 when none is left: what a level-up opens. */
export function nextSideBeatIndex(u: UnlockSave): number {
  for (let i = u.n; i < BEATS.length; i++) if (BEATS[i].side && !u.early?.includes(BEATS[i].id)) return i;
  return -1;
}
/** (owner) Chance a hero level-up opens the next side quest early. */
export const LEVEL_UNLOCK_CHANCE = 0.7;

/** Old saves (no `unlocks` field): keep everything the hero already reached, i.e. open every beat up to the last one whose
 *  target is already on the way (main step reached / side quest accepted or done). */
export function sanitizeUnlocks(raw: unknown, step: number, sideSeen: (id: string) => boolean): UnlockSave {
  const r = raw as Partial<UnlockSave> | null | undefined;
  if (r && typeof r === 'object' && Number.isFinite(Number(r.n))) {
    const n = Math.max(0, Math.min(BEATS.length, Math.floor(Number(r.n))));
    const early = Array.isArray(r.early) ? r.early.filter((id): id is string => typeof id === 'string' && BEATS.findIndex((b) => b.id === id) >= n && !!BEATS.find((b) => b.id === id)?.side) : [];
    const wait = Array.isArray(r.wait) ? r.wait.filter((id): id is string => typeof id === 'string' && BEATS.some((b) => b.id === id)) : [];
    return { n, miss: Math.max(0, Math.min(2, Math.floor(Number(r.miss) || 0))), ...(early.length ? { early } : {}), ...(wait.length ? { wait } : {}) };
  }
  let n = 0, prev = BASE_CAP;
  BEATS.forEach((b, i) => {
    if (b.story) { if (step > prev) n = i + 1; prev = Math.max(prev, storyIdx(b.story)); }   // the chain already moved into this stretch
    else if ((b.side ?? []).some(sideSeen)) n = i + 1;
  });
  return { n, miss: 0 };
}

/** Chance a death opens the next beat (besides the guaranteed cases). */
export const UNLOCK_CHANCE = 0.75;
