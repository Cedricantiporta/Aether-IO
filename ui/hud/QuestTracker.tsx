// Active quest tracker (Korean-MMO style): right side, under the menu icons. Shows accepted quests with progress;
// finished ones glow "Ready to claim" (claim at the Quest Board).
import { useQuestToast } from '../../rewardFeed';
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import React from 'react';
import { ScrollText, BookOpen, Crown } from 'lucide-react';
import { stepCount, STORY } from '../../story';
import { useGameStore } from '../../store';
import { activeQuests, questDone, questNeedsKing, questTitle } from '../../quests';
import { walkToQuest, walkToNpcObjective, walkToMain, walkAfterArrive } from '../../engine/systems/village';
import { NPC_QUESTS, npcQuestProgress, npcQuestReady, npcQuestStatus, npcQuestTurnIn } from '../../npcQuests';

/** In a run, a quest that is ready to hand in (or a main-quest step that waits on someone in town) offers a trip home. */
export function offerTeleport(then?: () => void): boolean {
  const st = useGameStore.getState();
  if (st.status !== GameStatus.PLAYING) return false;
  useUiStore.getState().askConfirm({
    title: 'Teleport to town?', body: 'This quest continues in town. Head back now? The run ends here: your loot and xp are kept.',
    confirmLabel: 'Teleport', onConfirm: () => { if (then) walkAfterArrive(then); st.abandonRun(); },
  });
  return true;
}

export const QuestTracker: React.FC = () => {
  const quests = useGameStore((s) => s.quests);
  const act = activeQuests(quests);
  // NPC story quests (blue book icon): accepted, not yet handed in
  const nq = useGameStore((s) => s.npcQuests), inv = useGameStore((s) => s.inventory);
  const story = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, 1) === 'ACTIVE');
  const ms = useGameStore((s) => s.story), main = STORY[ms.step];
  const toast = useQuestToast((s) => s.lines);
  if (act.length === 0 && story.length === 0 && !main && toast.length === 0) return null;
  return (
    <div className="qt pe" data-testid="quest-tracker">
      {toast.length > 0 && (
        <div className="qt-toast" data-testid="quest-toast">
          {toast.map((l) => <div key={l.id} className="qt-toast-line" style={{ color: l.color }}>{l.text}</div>)}
        </div>
      )}
      {main && (
        <div className="qt-row main" data-testid="main-quest-row" role="button" title="Click: auto-path" onClick={() => { if (!((main.npc || main.at) && offerTeleport(walkToMain))) walkToMain(); }}>
          <div className="qt-head"><Crown size={13} /><span>Main Quest</span></div>
          <div className="qt-title">{main.title}</div>
          {stepCount(main) > 1
            ? <div className="qt-line"><span className="qt-bar"><i style={{ width: `${Math.min(1, ms.p / stepCount(main)) * 100}%` }} /></span><b>{Math.min(ms.p, stepCount(main))} / {stepCount(main)}</b></div>
            : null}
          <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.85 }}>{main.line}</b></div>
        </div>
      )}
      {act.map((q) => {
        const done = questDone(q), king = questNeedsKing(q), f = Math.min(1, q.progress / Math.max(1, q.target));
        return (
          <div key={q.id} className={`qt-row board ${done ? 'done' : ''} ${king ? 'king' : ''}`} role="button" title="Click: auto-path" onClick={() => { if (!((done || king) && offerTeleport())) walkToQuest(q); }}>
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
          <div key={d.id} className={`qt-row npc ${ready ? 'done' : ''}`} data-testid="npc-quest-row" role="button" title="Click: auto-path"
            onClick={() => {
              const o = d.objective, npc = ready ? npcQuestTurnIn(d) : o.type === 'TALK' ? String(o.target) : null;
              const go = () => walkToNpcObjective(o, npc);
              if (!((npc || o.type === 'INTERACT' || o.type === 'ACTION') && offerTeleport(go))) go();
            }}>
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
