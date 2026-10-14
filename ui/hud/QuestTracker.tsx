// Active quest tracker (Korean-MMO style): right side, under the menu icons. Shows accepted quests with progress;
// finished ones glow "Ready to claim" (claim at the Quest Board).
import React from 'react';
import { ScrollText, BookOpen } from 'lucide-react';
import { useGameStore } from '../../store';
import { activeQuests, questDone, questNeedsKing, questTitle } from '../../quests';
import { NPC_QUESTS, npcQuestProgress, npcQuestReady, npcQuestStatus, npcQuestTurnIn } from '../../npcQuests';

export const QuestTracker: React.FC = () => {
  const quests = useGameStore((s) => s.quests);
  const act = activeQuests(quests);
  // NPC story quests (blue book icon): accepted, not yet handed in
  const nq = useGameStore((s) => s.npcQuests), inv = useGameStore((s) => s.inventory);
  const story = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, 1) === 'ACTIVE');
  if (act.length === 0 && story.length === 0) return null;
  return (
    <div className="qt pe" data-testid="quest-tracker">
      {act.map((q) => {
        const done = questDone(q), king = questNeedsKing(q), f = Math.min(1, q.progress / Math.max(1, q.target));
        return (
          <div key={q.id} className={`qt-row ${done ? 'done' : ''} ${king ? 'king' : ''}`}>
            <div className="qt-head"><ScrollText size={13} /><span>{done ? 'Ready to claim' : king ? (q.type === 'AUDIENCE' ? 'Talk to the King' : 'Report to the King') : 'Quest'}</span></div>
            <div className="qt-title">{questTitle(q)}</div>
            {q.type === 'AUDIENCE'
              ? <div className="qt-line"><b>{done ? 'Done' : 'Castle keep, north of the plaza'}</b></div>
              : <div className="qt-line"><span className="qt-bar"><i style={{ width: `${(done ? 1 : f) * 100}%` }} /></span><b>{Math.min(q.progress, q.target)} / {q.target}</b></div>}
          </div>
        );
      })}
      {story.map((d) => {
        const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv), c = d.objective.count;
        return (
          <div key={d.id} className={`qt-row npc ${ready ? 'done' : ''}`} data-testid="npc-quest-row">
            <div className="qt-head"><BookOpen size={13} /><span>{ready ? `Return to ${npcQuestTurnIn(d)}` : d.giver}</span></div>
            <div className="qt-title">{d.title}</div>
            {d.objective.type === 'TALK'
              ? <div className="qt-line"><b>{ready ? 'Done' : d.summary}</b></div>
              : <>
                <div className="qt-line"><span className="qt-bar"><i style={{ width: `${(ready ? 1 : n / Math.max(1, c)) * 100}%` }} /></span><b>{n} / {c}</b></div>
                {!ready && <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.75 }}>{d.summary}</b></div>}
              </>}
          </div>
        );
      })}
    </div>
  );
};
