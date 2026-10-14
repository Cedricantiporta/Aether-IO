// Main story chain runtime: talking to the step's NPC advances it (dialogue.ts), kills of the step's enemy kind count
// during runs, the ending finishes the Lich step. Also answers "where does the main quest continue?" for the guide
// arrow, the gate beacon and the tracker click (storyTarget).
import { events } from '../events';
import { useGameStore } from '../../store';
import { STORY } from '../../story';
import { NPCS, GATE } from '../townData';
import { CASTLE_DOOR } from '../castleData';

/** Lines for the NPC if it is the current step's NPC; advances the chain (the dialogue shows them). */
export function storyTalk(npcName: string): string[] | null {
  const st = useGameStore.getState(), s = st.story, step = STORY[s.step];
  if (!step || step.npc !== npcName || !step.talk) return null;
  st.setStory(s.step + 1, 0);
  return [`Main quest: ${step.title}`, ...step.talk];
}

events.on('enemyDeath', (e) => {
  const st = useGameStore.getState(), s = st.story, step = STORY[s.step];
  if (!step?.kill || e.kind !== step.kill.kind) return;
  const p = s.p + 1;
  if (p >= step.kill.count) st.setStory(s.step + 1, 0); else st.setStory(s.step, p);
});
events.on('gameEnding', () => {
  const st = useGameStore.getState(), s = st.story;
  if (STORY[s.step]?.ending) st.setStory(s.step + 1, 0);
});

export interface StoryTarget { x: number; z: number; area: 'TOWN' | 'CASTLE'; npc: number }
const T: StoryTarget = { x: 0, z: 0, area: 'TOWN', npc: -1 };
/** Where the main quest continues right now (null when the chain is finished). Field steps point at the town gate. */
export function storyTarget(): StoryTarget | null {
  const s = useGameStore.getState().story, step = STORY[s.step];
  if (!step) return null;
  if (step.npc) {
    const i = NPCS.findIndex((n) => n.name === step.npc);
    if (i >= 0) { const n = NPCS[i]; T.x = n.home[0]; T.z = n.home[1]; T.area = n.area === 'CASTLE' ? 'CASTLE' : 'TOWN'; T.npc = i; return T; }
  }
  T.x = GATE.x; T.z = GATE.z - 1; T.area = 'TOWN'; T.npc = -1;
  return T;
}
/** The point to aim at from the current area (an NPC inside the castle is reached through the castle door). */
export function storyAim(area: 'TOWN' | 'CASTLE'): { x: number; z: number } | null {
  const t = storyTarget();
  if (!t) return null;
  if (t.area === area) return t;
  return area === 'TOWN' ? { x: CASTLE_DOOR.x, z: CASTLE_DOOR.z } : null;   // (castle -> town: the exit, handled by callers)
}
