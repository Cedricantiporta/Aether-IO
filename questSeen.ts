// "New quest" red dots: which quests the hero can see right now, as stable ids, and the saved list of ids already viewed.
// 'main:<step id>' = the live main step, 'side:<quest id>' = a side quest an NPC offers (available, not accepted yet).
// The store keeps `questSeen` (saved with the profile; null = not seeded yet, filled with everything available on first load).
import { liveStep } from './questUnlocks';
import { NPC_QUESTS, npcQuestStatus, type NpcQuestSave } from './npcQuests';
import type { StoryStep } from './story';

type QS = { story: { step: number }; unlocks: { n: number }; npcQuests: NpcQuestSave; heroRank: number; questSeen: string[] | null };
export const mainQuestId = (step: StoryStep | undefined): string => (step ? 'main:' + step.id : '');
export const sideQuestId = (id: string): string => 'side:' + id;
/** Side quests an NPC offers right now (level-locked ones are not offered yet). */
export const offeredSideIds = (s: Pick<QS, 'npcQuests' | 'heroRank'>): string[] => NPC_QUESTS.filter((d) => npcQuestStatus(d, s.npcQuests, s.heroRank) === 'AVAILABLE').map((d) => sideQuestId(d.id));
/** Everything currently visible (the seed for old saves / first load). */
export const availableQuestIds = (s: QS): string[] => [mainQuestId(liveStep(s)), ...offeredSideIds(s)].filter(Boolean);
/** Unseen quest ids: `main` (the live main step) and `side` (offered side quests). */
export function unseenQuests(s: QS): { main: string[]; side: string[] } {
  const seen = s.questSeen;
  if (!seen) return { main: [], side: [] };
  const m = mainQuestId(liveStep(s));
  return { main: m && !seen.includes(m) ? [m] : [], side: offeredSideIds(s).filter((id) => !seen.includes(id)) };
}
