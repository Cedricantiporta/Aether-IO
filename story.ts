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
  /** paid when the step is completed (gold in base units x GOLD_SCALE, like NPC quests) */
  reward: { gold?: number; gems?: number; items?: { id: string; qty?: number }[] };
}

export const STORY: StoryStep[] = [
  { id: 'guard', title: 'A New Guard', line: 'Report to Garrick at the Town Gate', npc: 'Garrick', reward: { gold: 200 },
    talk: ['So you are the new recruit. The Font brought you back to us, eh?', 'The gate stays shut for new blood until the King himself gives the word.', 'Go on, the castle is straight up the avenue. Kneel, and mind the guards.'] },
  { id: 'king', title: 'Audience with the King', line: 'Speak with King Aldric in the castle', npc: 'King Aldric', reward: { gold: 300, items: [{ id: 'potion_hp', qty: 3 }] },
    talk: ['Rise, guard. You have the Font\'s light about you; few do any more.', 'Something is twisting the wilds beyond our walls. The old guardians of each land have turned on us.', 'First prove yourself: the slimes in the Meadow grow bold. Cut down ten of them.', 'Garrick will open the gate for you. Go with the Font.'] },
  { id: 'slimes', title: 'Trial of the Meadow', line: 'Defeat Slimes beyond the gate', npc: '', kill: { kind: 'SLIME', count: 10 }, reward: { gold: 500, items: [{ id: 'upgrade_core', qty: 1 }] } },
  { id: 'report', title: 'The King Awaits', line: 'Report back to King Aldric', npc: 'King Aldric', reward: { gold: 600, gems: 10 },
    talk: ['Ten slimes, and not a scratch you could not shrug off. Good.', 'Now a real task. Gorath, the stone guardian of the Meadow, has woken angry. He waits at the end of the Meadow, past the Slime King.', 'Bring him down.'] },
  { id: 'golem', title: 'The Mountain Stirs', line: 'Defeat Gorath the Mountain (Meadow, depth 15)', npc: '', kill: { kind: 'BOSS_GOLEM', count: 1 }, reward: { gold: 1200, gems: 20 } },
  { id: 'report2', title: 'Stone and Shadow', line: 'Tell King Aldric of Gorath\'s fall', npc: 'King Aldric', reward: { gold: 800, items: [{ id: 'upgrade_core', qty: 2 }] },
    talk: ['Gorath fallen... and you say his eyes burned violet? Then the stories are true.', 'Malakar, the archmage who stole from the Font, lives on in the Void. His stolen light poisons every guardian it touches.', 'You cannot reach him yet. Go deeper: free the Old Grove, then the lands beyond. One guardian at a time.'] },
  { id: 'grove', title: 'Warden of the Old Grove', line: 'Defeat Elderroot the Ancient (Old Grove)', npc: '', kill: { kind: 'BOSS_TREANT', count: 1 }, reward: { gold: 1600, gems: 25 } },
  { id: 'mire', title: 'Terror of the Mire', line: 'Defeat the Mire Hydra', npc: '', kill: { kind: 'BOSS_HYDRA', count: 1 }, reward: { gold: 2000, gems: 30 } },
  { id: 'frost', title: 'The Frozen Wing', line: 'Defeat Glacius the Frost Wyrm', npc: '', kill: { kind: 'BOSS_WYRM', count: 1 }, reward: { gold: 2400, gems: 35 } },
  { id: 'cinders', title: 'Lord of Cinders', line: 'Defeat Ignar the Infernal Warlord', npc: '', kill: { kind: 'BOSS_WARLORD', count: 1 }, reward: { gold: 2800, gems: 40 } },
  { id: 'herald', title: 'The Herald of the Abyss', line: 'Defeat the Void Herald', npc: '', kill: { kind: 'BOSS_VOID', count: 1 }, reward: { gold: 3200, gems: 50 } },
  { id: 'report3', title: 'The Last Audience', line: 'Report to King Aldric before the end', npc: 'King Aldric', reward: { gold: 1500, items: [{ id: 'upgrade_core', qty: 3 }] },
    talk: ['Every guardian is free. Only the Void remains, and the throne Malakar made for himself there.', 'Take all the light the Font can give you. End him, and bring the stolen light home.'] },
  { id: 'lich', title: 'The Undying', line: 'Defeat Malakar at the end of the Void', npc: '', ending: true, reward: { gold: 5000, gems: 100 } },
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
  return { step: endings > 0 ? STORY.length : 4, p: 0 };   // old saves: straight to the first guardian step
}
export const storyStep = (s: StorySave): StoryStep | null => STORY[s.step] ?? null;
/** The gate lets you set out once the King has spoken (step 2+). */
export const gateOpen = (s: StorySave): boolean => s.step >= 2;
