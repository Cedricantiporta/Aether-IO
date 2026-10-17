// ============================================================================
// (owner, Hades-style) Dreams at the Font. Every time the hero comes home from a run, the Font holds them a moment
// longer than it should, and if the story has moved past the next dream's milestone they meet Aelia there, in a garden
// that is not quite the town - a few lines each time, until a bell tolls and they wake by the well. Twelve dreams in all,
// one per return, in order: what happened to the kingdom, the King, the loyalists, Aelia herself - and three of them are
// the hero's own memories, different for every class (who you were before the Font, the night of the Dimming, your grave).
// Pure data + gating; ui/screens/DreamOverlay.tsx plays them (per-character progress in localStorage).
// ============================================================================
import type { HeroClass } from './types';
import { storyIdx } from './story';
import { activeChar } from './characters';

export interface Dream {
  id: string;
  /** story step id the main quest must have reached (story.ts storyIdx) */
  after: string;
  /** adventures finished (progress.endings) needed as well (the dreams between the first clear and the true ending) */
  clears?: number;
  title: string;
  /** who speaks: Aelia, or the hero's own memory */
  voice: 'AELIA' | 'MEMORY';
  /** lines (the shared ones), or one set per class for the hero's memories */
  lines: string[] | Record<HeroClass, string[]>;
}

const BELL = 'Far away, a bell tolls. The garden thins like breath on glass.';

export const DREAMS: readonly Dream[] = [
  { id: 'd1', after: 'slimes', title: 'A Garden That Is Not Here', voice: 'AELIA', lines: [
    'Oh. You can see me? Nobody sees me. You are standing in the Font, you know. Well. Most of you is.',
    'This is my garden. It was, once. The roses were real. Now they only remember being roses.',
    'I am not allowed to tell you my name yet. That is not my rule. Come back. I am always here when the Font is loud.',
    BELL,
  ] },
  { id: 'd2', after: 'golem', title: 'The Singing Tree', voice: 'AELIA', lines: [
    'You went into the Greenwood. I can smell the moss on you.',
    'There is an old tree there that used to sing to me when I could not sleep. Elderroot, the gardeners called him. He was gentle.',
    'If he fought you, it is because something is wearing him. Like a coat. Be kind to what is left underneath.',
    'You:: Who are you?',
    'Someone who is very glad you keep coming back. ...There is the bell. It is always the bell.',
  ] },
  { id: 'm1', after: 'wren', title: 'Before the Font', voice: 'MEMORY', lines: {
    KNIGHT: [
      'A courtyard of white stone. Rain. You are seventeen, and your armour does not fit.',
      'Ser Aldric of the Oathsworn taps your shield with his sword. "A shield is not for you, squire. It is for whoever stands behind you."',
      'They post you at a door in the high tower. Behind it, someone is practising the lute very badly, and laughing at herself.',
      'The memory folds shut like a letter.',
    ],
    ARCHER: [
      'Pine needles, cold dew, a bow taller than you. The King\'s huntsman teaches you to breathe out before you loose.',
      '"Count your arrows, count the gates, count the guards," he says. "A huntsman who cannot count comes home empty."',
      'You count everything. Every night, from the forest wall, you count the castle\'s lit windows. One in the high tower always burns longest.',
      'The memory folds shut like a letter.',
    ],
    WIZARD: [
      'A study that smells of ink and burnt sugar. A tall man with tired eyes corrects your spell with one finger.',
      '"Light is not a weapon, apprentice. It is a promise you make to the dark that you will leave again." His name is Malakar. He is your teacher.',
      'His other pupil is a girl who asks too many questions. He answers every single one, and never once looks tired with her.',
      'The memory folds shut like a letter.',
    ],
    BARBARIAN: [
      'Snow, a long road south, a purse of silver that is not yet yours. You were hired to stand at a royal wedding and look frightening.',
      'The bride never comes down the stairs. The groom, a prince from the eastern march, smiles too much. You do not like his smile.',
      'You get paid anyway. You keep the coin. You never spend it. You do not remember why.',
      'The memory folds shut like a letter.',
    ],
    NECROMANCER: [
      'A graveyard at night, and a gravedigger with a lantern who found you in a basket between two stones. Mortimer.',
      '"The dead are just people who stopped hurrying," he tells you, and teaches you their names, all of them.',
      'Sometimes a girl from the castle sneaks down to bring the old man bread. She calls you "little crow" and you hate it and love it.',
      'The memory folds shut like a letter.',
    ],
  } },
  { id: 'd3', after: 'grove', title: 'The Stone Man', voice: 'AELIA', lines: [
    'You fought the stone giant in the Marble Halls. Gorath.',
    'Did he hesitate? Just once, before the last blow? He used to do that when I beat him at chess. He let me win, and pretended he did not.',
    'Do not hate him. Please. Whatever he is now, he was the best of us, once.',
    BELL,
  ] },
  { id: 'd4', after: 'lysa2', title: 'Those Who Stayed', voice: 'AELIA', lines: [
    'Everyone who swore to protect my father stayed with him that night. Every knight, every captain. Even his old dragon.',
    'Loyalty is a beautiful thing, until something cruel learns to hold it like a leash.',
    'The beasts in the wilds are not strangers. Look at their armour, next time. Look at the crests.',
    BELL,
  ] },
  { id: 'm2', after: 'dorn2', title: 'The Night of the Dimming', voice: 'MEMORY', lines: {
    KNIGHT: [
      'Your door. Your post. The lute stops. The torches gutter, all of them at once, as if the castle took a breath.',
      'Something comes up the stairs that wears your captain\'s face. You raise the shield. "It is for whoever stands behind you."',
      'You hold the door for nine heartbeats. You count them. On the tenth, the floor is cold, and you are very tired.',
      'You woke in the Font, coughing light, ten years later. The door was gone. So was she.',
    ],
    ARCHER: [
      'From the forest wall you count the windows. Twelve. Eleven. Six. They go out from the bottom up, like water rising.',
      'Someone opens the postern gate from inside. A man in a prince\'s cloak, with a lamp that burns black. You draw. You count your breath.',
      'You miss. You never miss. Something old pulls the arrow aside, and then pulls you down with it.',
      'You woke in the Font, coughing light. You remember the cloak. You do not remember the face.',
    ],
    WIZARD: [
      'Malakar shakes you awake. "Up. Now. Bring the jar from the shelf, the empty one." His hands are shaking. They never shake.',
      'The castle is screaming without sound. In the high tower a girl is dying, and her light is lifting off her like steam.',
      'He catches it in the jar. He looks at you once, and says "Forgive me," and runs into the dark with it. You try to follow.',
      'The dark follows you instead. You woke in the Font, coughing light, with his last words still in your ears.',
    ],
    BARBARIAN: [
      'The wedding feast goes cold. The groom leaves the hall and comes back with mud on his boots and something black in a lamp.',
      'Every guard in the hall stands up at once, and none of them are guards anymore. The tables burn. The bride is nowhere.',
      'You fight. You are very good at it. It does not matter. Something under the floor is better.',
      'You woke in the Font, coughing light. The silver was still in your pocket. It is the only thing you came back with.',
    ],
    NECROMANCER: [
      'Mortimer wakes you at midnight. "Listen." The graves are humming. All of them. The dead are afraid, and the dead are never afraid.',
      'Up at the castle, the lights go out. Down in the yard, every grave you know by name cracks open, and nothing climbs out. They are hiding.',
      'You run up the hill to find the girl who brought the bread. You are halfway there when the hill swallows you.',
      'You woke in the Font, coughing light. Mortimer was waiting by the well, ten years older, with a shovel and a very strange look.',
    ],
  } },
  { id: 'd5', after: 'frost', title: 'Mother\'s Dragon', voice: 'AELIA', lines: [
    'Glacius. You found her.',
    'She belonged to my mother. When I was small she let me sleep against her side in winter. She was never cold to me.',
    'She guards that pass the way she guarded my nursery door. Still waiting for someone who is not coming back.',
    BELL,
  ] },
  { id: 'd6', after: 'roan', title: 'The Captain', voice: 'AELIA', lines: [
    'The warlord in the Ember Wastes. Ignar.',
    'He taught half the castle guard to hold a sword, and the other half to put it down and listen first. He taught you, I think.',
    'Roan still sets a place for him at the barracks table. Do not tell him what Ignar became. Tell him he fought well.',
    BELL,
  ] },
  { id: 'd7', after: 'wren2', title: 'The Thief Who Was Not', voice: 'AELIA', lines: [
    'They call Malakar a thief. A traitor. A monster in the dark.',
    'He was my tutor. He caught something of mine as it fell and ran with it, so the thing under the Font could not have it.',
    'He is not keeping it from you. He is keeping it from someone else. Remember that, when you stand in front of him.',
    BELL,
  ] },
  { id: 'd8', after: 'report3', title: 'Confessions', voice: 'AELIA', lines: [
    'The King confessed to you. How sad he looked. How sorry.',
    'He told you a true thing, and wrapped it around a lie so you would swallow both.',
    'I cannot say more. The garden will not let me. Go to the Void. Come back. Come back.',
    BELL,
  ] },
  { id: 'd9', after: 'tower_king', title: 'Nine Goodbyes', voice: 'AELIA', lines: [
    'You found me in the forest, after Malakar. And then the Font took you home, and took me out of your head on the way. Again.',
    'I have said goodbye to you nine times. You were very polite every single time. It is maddening.',
    'Next time, hold on to something. Anything. A word. A song. Wren has an idea, I think. She always has an idea.',
    BELL,
  ] },
  { id: 'c2', after: 'tower_king', clears: 2, title: 'Something Under the Well', voice: 'AELIA', lines: [
    'Have you ever listened to the Font at night? Really listened? Under the water there is a second sound. Lower.',
    'The light in the Font is ours. The thing under it is older than the light. It does not want anything. It only says yes.',
    'Some people should never be told yes. ...Do not drink from the well tonight. Humour me.',
    BELL,
  ] },
  { id: 'c3', after: 'tower_king', clears: 3, title: 'The Words of the Oath', voice: 'AELIA', lines: [
    'Say the guard\'s oath for me. The one they taught you at the Font.',
    'You:: "What I see, the Font keeps. What I lose, the Font forgives."',
    '...That is not how it goes. That is not how it went. The old oath ended "what I swear, I remember." Someone changed one line.',
    BELL,
  ] },
  { id: 'c5', after: 'tower_king', clears: 5, title: 'A Chess Game', voice: 'AELIA', lines: [
    'I keep thinking about chess. My father taught me. He always protected the queen too much and lost his king.',
    'The man in the castle plays very differently. He sacrifices everything, every piece, every guard, and never once looks sorry.',
    'Have you noticed he never says my name? Not once. Fathers say their daughter\'s name. Ask Wren how many times he has said it.',
    BELL,
  ] },
  { id: 'c7', after: 'tower_king', clears: 7, title: 'The Patient Man', voice: 'AELIA', lines: [
    'Every time you strike Malakar down, he goes back into the dark and sits beside the thing under the Font.',
    'He lets it gnaw on him so it will not gnaw on us. Ten years of that. He was always so patient with me.',
    'When this is over, someone should bring him something sweet. He likes burnt sugar. Do not tell him I told you.',
    BELL,
  ] },
  { id: 'c9', after: 'tower_king', clears: 9, title: 'Almost', voice: 'AELIA', lines: [
    'You are holding on longer every time. Last time you said my name, just before the bell. Did you know?',
    'One more. I can feel it. The Font is tired of taking things from you, and you are very, very stubborn.',
    'Finish it once more, and when the shard breaks... do not let go. Whatever it costs. Promise me.',
    'You:: I promise.',
    'Then I will see you in the forest. For the last time, the good kind of last time.',
  ] },
  { id: 'm3', after: 'wren4', title: 'Your Grave', voice: 'MEMORY', lines: {
    KNIGHT: [
      'Behind the chapel, in the row where the Oathsworn lie, there is a small stone with your name on it. Squire. Fell at his post.',
      'Mortimer keeps it clean. He has buried what the Font left of you eleven times, he says. Each time, the same name.',
      'You stand there a long while. Then you go back to the door. It is your post. Someone is still behind it.',
    ],
    ARCHER: [
      'Behind the chapel there is a stone with a carved bow and your name. Huntsman\'s boy. Lost on the forest wall.',
      'Mortimer has buried what the Font left of you eleven times. "Always count your arrows," he says. "You taught me that."',
      'You count them. All there. You go back to the forest. This time you know whose face was under the cloak.',
    ],
    WIZARD: [
      'Behind the chapel there is a stone with an inkwell carved on it and your name. Apprentice. Taken by the Void.',
      'Mortimer has buried what the Font left of you eleven times. On the last one, someone left a single burnt-sugar sweet.',
      'Your teacher has been keeping a promise to the dark for ten years. You go back to help him leave it.',
    ],
    BARBARIAN: [
      'Behind the chapel, among strangers, there is a plain stone: "A sellsword from the north. Paid in full."',
      'Mortimer has buried what the Font left of you eleven times. He kept the silver from the first one. He gives it back.',
      'You were paid to guard a wedding that never happened. You decide the job is not finished.',
    ],
    NECROMANCER: [
      'You know this grave. You dug the one next to it, as a child. "Little Crow," the stone says. Mortimer carved it badly.',
      'He has buried what the Font left of you eleven times, and wept every time, and told no one. He is very bad at hiding things.',
      'The dead of Aether are not afraid tonight. They are waiting. So are you. You know where she is now.',
    ],
  } },
];

export const dreamLines = (d: Dream, hero: HeroClass): string[] => (Array.isArray(d.lines) ? d.lines : d.lines[hero] ?? d.lines.KNIGHT);

// ---- progress (per character, localStorage: the profile format stays as it is)
const key = (): string => `aether.dreams.${activeChar()?.id ?? 'default'}`;
export function dreamsSeen(): number { try { return Math.max(0, Math.min(DREAMS.length, Number(localStorage.getItem(key())) || 0)); } catch { return 0; } }
export function markDreamSeen(n: number): void { try { localStorage.setItem(key(), String(n)); } catch { /* ignore */ } }
/** The next dream if its milestone is reached (story step `step`, `endings` adventures finished), else null. */
export function nextDream(step: number, endings: number): Dream | null {
  const d = DREAMS[dreamsSeen()];
  return d && step >= storyIdx(d.after) && endings >= (d.clears ?? 0) ? d : null;
}

/** (owner, Hades-like) the true ending: Aelia takes the throne only after TRUE_END_CLEARS adventures and every dream
 *  before it. Until then the 'remember' step keeps slipping away at the end of each run. */
export const TRUE_END_CLEARS = 10;
const BEFORE_TRUE = DREAMS.findIndex((d) => d.id === 'm3');
/** At an ending: is this the run where the hero remembers? (`endings` = adventures finished before this one) */
export const trueEndingReady = (endings: number): boolean => endings + 1 >= TRUE_END_CLEARS && dreamsSeen() >= BEFORE_TRUE;
export const trueEndingNeed = (endings: number): string => {
  const c = Math.min(TRUE_END_CLEARS, endings + 1), d = Math.min(BEFORE_TRUE, dreamsSeen());
  return `adventures finished ${c}/${TRUE_END_CLEARS} · dreams ${d}/${BEFORE_TRUE}`;
};

/** The Aelia dream being walked right now (a dream run: director plan.dream; wanderers.talkWanderer plays its lines). */
export const dreamView = { pending: null as Dream | null };
