// ============================================================================
// Town chatter that reacts to the hero's progress: after each guardian falls the townsfolk have news (one line said
// once per milestone the next time you talk to them, remembered in localStorage) and new speech bubbles; NPCs with
// something for you (main quest, a new side quest, a quest ready to hand in) call out now and then.
// Pure data + small helpers (no React).
// ============================================================================
import { useGameStore } from '../store';
import { STORY, storyIdx } from '../story';

/** Story milestones, newest last: reached once the chain moved PAST the step `after`. */
const MILESTONES = ['king', 'slimeking', 'golem', 'grove', 'mire', 'frost', 'cinders', 'herald', 'lich'] as const;
type Milestone = typeof MILESTONES[number];

/** Bubbles anyone in town may say after a milestone (the newest reached milestone is used). */
const GENERIC: Record<Milestone, string[]> = {
  king: ['The King opened the gate for you!', 'A new guard of Aether!', 'Off to the Greenwood?'],
  slimeking: ['The Slime King, popped!', 'No more ooze on the road!', 'Hero of the Meadow!'],
  golem: ['The Grove is quiet again.', 'Elderroot sleeps at last!', 'They say you felled a walking tree!'],
  grove: ['Gorath the Mountain, fallen!', 'The Marble Halls are free!', 'Stone does not stay down... except for you.'],
  mire: ['The wells run clean again!', 'Three heads, and you took them all!', 'The caravans are moving!'],
  frost: ['The passes are thawing!', 'A dragon, slain! A dragon!', 'Summer is back, thanks to you.'],
  cinders: ['The smoke is gone from the east.', 'Ignar is ash!', 'The scouts came home!'],
  herald: ['The Void\'s champions fall!', 'Only the Herald remains...', 'Aether believes in you.'],
  lich: ['The Font shines again!', 'The Herald is gone!', 'Hero of Aether!', 'Long live the guardian!'],
};

/** One-off news an NPC tells the next time you talk after a milestone (falls back to nothing: the normal talk). */
const NEWS: Record<string, Partial<Record<Milestone, string>>> = {
  Garrick: { king: 'Gate\'s open for you now, recruit. Try to come back in one piece.', slimeking: 'The lads at the gate still talk about that Slime King. Drinks are on me. Well, on Hodge.', golem: 'Elderroot, down! I felt the ground stop shaking from right here.', grove: 'Gorath fell? I would have paid to see that.', lich: 'Malakar, gone. I can finally sleep on watch. Do not tell the Captain.' },
  Mira: { king: 'You have the King\'s blessing! I knew my tour would pay off.', golem: 'You beat Elderroot! I tell every newcomer about you now. It is in the tour.', mire: 'The Hydra! You are in my tour twice now.', lich: 'You did it. You really did it. I will need a much longer tour.' },
  'Elder Tobin': { golem: 'The Grove is quiet. In all my years I never heard it so quiet.', frost: 'Glacius... my grandfather lost his fingers to that wind. Thank you.', lich: 'The Font burns bright again. I can die a happy man. Not today, though.' },
  Maeve: { slimeking: 'Did you hear? Somebody popped the Slime King! Oh. It was you. Of course it was.', golem: 'They say Elderroot fell with a sound like thunder. I said it first.', mire: 'The caravans are back, and they all ask about you. I may have exaggerated. A little.', cinders: 'Ignar! Everyone is talking about it. Mostly me.' },
  Fenn: { slimeking: 'I am writing a ballad about the Slime King. It rhymes "goo" with "you"!', golem: 'Elderroot! Finally a villain with some gravitas for my songs.', mire: 'My Hydra ballad has an ending now! It is not "Run" any more.', lich: 'The last verse writes itself: "and the light came home". Not bad, eh?' },
  Brenna: { slimeking: 'Not one slime in the wheat this week. Bless you!', golem: 'The crops stopped glowing at night. That was you, wasn\'t it?' },
  Dorn: { golem: 'The veins run clean since Elderroot fell. Good ore again!', frost: 'The passes are open! My lads are digging already.' },
  Lysa: { mire: 'Clean water, fresh herbs! My salves have never been better.', golem: 'The Grove herbs are green again, not violet. You did that.' },
  Hodge: { slimeking: 'Slime reports are drying up. Not complaining! Well. A little.', grove: 'Every hero in the ledger wants to be you. I tell them to queue.' },
  Wren: { golem: 'Elderroot\'s heartwood was violet. Malakar\'s light, as I feared.', herald: 'The champions of the Void, silenced. Only the Dark Castle and the Herald remain. Be ready.' },
  Pip: { slimeking: 'You beat a SLIME KING? Was it squishy? Was it gross? Tell me everything!', golem: 'When I grow up I will fight a tree too. A small one.' },
  Tilda: { king: 'A guard with the King\'s seal! Prices just went up. Joking! Mostly.', mire: 'The coast road is open again. Spices for everyone!', lich: 'I am selling "I survived the Void Herald" scarves. Want one? Hero discount.' },
  Corin: { king: 'The King\'s own seal, eh? Still will not get my cart through that gate. I asked.', golem: 'Roads are quieter since that big tree fell. My wheel thanks you.', frost: 'Ice gone from the north road. Hauling is a joy again. Almost.' },
  Nell: { king: 'Your first trip through the portal! I will wave. Wave back!', slimeking: 'A king made of slime. I drew him in my book. He looks like a pudding with opinions.', golem: 'I wrote a whole page about Elderroot. Mostly about you, actually.', lich: 'My little book is full. The last page is about you.' },
  Sera: { mire: 'Trade is booming since the Hydra fell! Well, my trade. Fresh air is free.' },
  Hollis: { slimeking: 'The girls give more milk since the slimes quieted down. Cows notice these things.' },
  Dalla: { golem: 'Nothing prowls the fields at night any more. The hens are calm again.' },
};

/** Index of the newest milestone reached (-1 none). */
function reached(): number {
  const step = useGameStore.getState().story.step;
  let r = -1;
  for (let k = 0; k < MILESTONES.length; k++) if (step > storyIdx(MILESTONES[k]) && storyIdx(MILESTONES[k]) < STORY.length) r = k;
  return r;
}

const NEWS_KEY = 'aether-survivor-npcnews-v1';
let heard: Record<string, number> | null = null;
function loadHeard(): Record<string, number> {
  if (heard) return heard;
  try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(NEWS_KEY) : null; heard = r ? JSON.parse(r) : {}; } catch { heard = {}; }
  return heard!;
}
/** The news line `name` has not told you yet (the newest milestone with a line for them), marked as said. */
export function takeNews(name: string): string | null {
  const r = reached();
  if (r < 0) return null;
  const h = loadHeard(), seen = h[name] ?? -1, lines = NEWS[name];
  if (!lines || seen >= r) return null;
  let line: string | null = null;
  for (let k = r; k > seen && !line; k--) line = lines[MILESTONES[k]] ?? null;
  h[name] = r;
  try { localStorage.setItem(NEWS_KEY, JSON.stringify(h)); } catch { /* ignore */ }
  return line;
}

/** A progress bubble (newest milestone's generic pool), or null before the first milestone. */
export function progressBubble(): string | null {
  const r = reached();
  if (r < 0) return null;
  const pool = GENERIC[MILESTONES[r]];
  return pool[(Math.random() * pool.length) | 0];
}

const CALL_MAIN = ['Hero! A word?', 'Over here, guard!', 'Got a moment?', 'There you are!'];
const CALL_NEW = ['Could use a hand...', 'Psst! Hero!', 'Have you a moment?'];
const CALL_READY = ['Did you bring it?', 'Back already?', 'Come, come! Tell me!'];
/** A line calling the hero over: `kind` 4 = main quest NPC, 1 = new side quest, 3 = side quest ready to hand in. */
export function callBubble(kind: number): string | null {
  const pool = kind === 4 ? CALL_MAIN : kind === 3 ? CALL_READY : kind === 1 ? CALL_NEW : null;
  return pool ? pool[(Math.random() * pool.length) | 0] : null;
}
