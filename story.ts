// Main story quests: one sequential chain, always shown first (gold) in the quest tracker. Step 0 starts on a new profile
// outside the town gate; the gate stays sealed for runs until the King gives the first task (step 2).
// Pure data + helpers (no React); progress lives in the profile (`story` in store.ts).

export interface StoryStep {
  id: string;
  title: string;
  /** tracker line */
  line: string;
  /** who the step talks to (NPC name), or '' for a field objective */
  npc: string;
  /** field objective: kill `count` enemies of `kind` in runs, or finish the adventure ('ENDING') */
  kill?: { kind: string; count: number };
  ending?: boolean;
  /** dialogue said when the step's NPC is spoken to (then the chain advances) */
  talk?: string[];
}

export const STORY: StoryStep[] = [
  { id: 'guard', title: 'A New Guard', line: 'Report to Garrick at the Town Gate', npc: 'Garrick',
    talk: ['So you are the new recruit. The Font brought you back to us, eh?', 'The gate stays shut for new blood until the King himself gives the word.', 'Go on, the castle is straight up the avenue. Kneel, and mind the guards.'] },
  { id: 'king', title: 'Audience with the King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric',
    talk: ['Rise, guard. You have the Font\'s light about you; few do any more.', 'Malakar, the Undying Lich, is twisting the wilds beyond our walls. One day you will face him.', 'Not today. First prove yourself: the slimes in the Meadow grow bold. Cut down ten of them.', 'Garrick will open the gate for you. Go with the Font.'] },
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes beyond the gate', npc: '', kill: { kind: 'SLIME', count: 10 } },
  { id: 'report', title: 'The King Awaits', line: 'Report back to King Aldric', npc: 'King Aldric',
    talk: ['Ten slimes, and not a scratch you could not shrug off. Good.', 'Now the true task: find the Lich at the end of the Void and end him.', 'Every biome has a guardian he has corrupted. Break them, one by one.'] },
  { id: 'lich', title: 'The Undying', line: 'Defeat Malakar at the end of the Void', npc: '', ending: true },
];

export interface StorySave { step: number; p: number }
/** New profiles start the chain; old saves (no story field) skip straight to the Lich (or past it). */
export function sanitizeStory(raw: unknown, endings: number, isNew: boolean): StorySave {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const step = Math.max(0, Math.min(STORY.length, Math.floor(Number(r.step) || 0)));
    return { step, p: Math.max(0, Math.floor(Number(r.p) || 0)) };
  }
  if (isNew) return { step: 0, p: 0 };
  return { step: endings > 0 ? STORY.length : 4, p: 0 };
}
export const storyStep = (s: StorySave): StoryStep | null => STORY[s.step] ?? null;
/** The gate lets you set out once the King has spoken (step 2+). */
export const gateOpen = (s: StorySave): boolean => s.step >= 2;
