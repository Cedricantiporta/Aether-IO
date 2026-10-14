// Active quest tracker (Korean-MMO style): right side, under the menu icons. Shows accepted quests with progress;
// finished ones glow "Ready to claim" (claim at the Quest Board).
import React from 'react';
import { ScrollText } from 'lucide-react';
import { useGameStore } from '../../store';
import { activeQuests, questDone, questNeedsKing, questTitle } from '../../quests';

export const QuestTracker: React.FC = () => {
  const quests = useGameStore((s) => s.quests);
  const act = activeQuests(quests);
  if (act.length === 0) return null;
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
    </div>
  );
};
