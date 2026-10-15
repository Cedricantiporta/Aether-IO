// Active quest tracker (Korean-MMO style): right side, under the menu icons. Main quest first (gold), then accepted
// bounties and NPC side quests, each with its objective, progress and (in town) the distance to where it continues.
// Click = auto-path there; in a run, a quest that continues in town offers a teleport home.
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import React, { useRef } from 'react';
import { ScrollText, BookOpen, Crown } from 'lucide-react';
import { stepCount, STORY, type StoryStep } from '../../story';
import { useGameStore } from '../../store';
import { activeQuests, questDone, questNeedsKing, questTitle, type Quest } from '../../quests';
import { walkToQuest, walkToNpcObjective, walkToMain, walkAfterArrive } from '../../engine/systems/village';
import { NPC_QUESTS, npcQuestProgress, npcQuestReady, npcQuestStatus, npcQuestTurnIn, bagCount, type NpcQuestDef } from '../../npcQuests';
import { LOOT_BY_ID } from '../../loot';
import { mainNav, npcQuestNav, boardQuestNav, navDist, type NavTarget } from '../../engine/systems/questNav';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

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
/** True when the main step can be done in town right now (a delivery only once the goods are in the bag). */
function mainInTown(step: StoryStep, have: number): boolean {
  if (step.deliver) return have >= step.deliver.count;
  return !!(step.npc || step.at);
}
const fieldNote = (): void => useGameStore.getState().addNotification('This objective is out in the wilds: keep exploring this run.', '#f1e2b8', 'SYSTEM');

/** Distance readout of one tracker row ("42 m", "castle", "here"), written by the shared rAF loop (no React renders). */
function useDistance(get: () => NavTarget | null) {
  const ref = useRef<HTMLSpanElement>(null), acc = useRef(1), last = useRef('');
  useRaf((dt) => {
    acc.current += dt;
    if (acc.current < 0.3 || !ref.current) return;
    acc.current = 0;
    let txt = '';
    if (useGameStore.getState().status === GameStatus.MENU) {
      const t = get();
      if (t) {
        const d = navDist(t);
        txt = t.hop ? (world.village.area === 'CASTLE' ? 'leave castle' : world.village.area === 'CHURCH' ? 'leave chapel' : world.village.area === 'CAVE' ? 'leave cave' : t.act === 'cave' ? 'in the cave' : 'in the castle') : t.field ? (d < 12 ? 'portal' : `portal ${Math.round(d)} m`) : d <= t.reach + 1 ? 'here' : `${Math.round(d)} m`;
      }
    }
    if (txt !== last.current) { last.current = txt; ref.current.textContent = txt; }
  });
  return ref;
}

const MainRow: React.FC<{ main: StoryStep }> = ({ main }) => {
  const ms = useGameStore((s) => s.story), inv = useGameStore((s) => s.inventory);
  const dist = useDistance(mainNav);
  const c = stepCount(main), have = main.deliver ? Math.min(c, bagCount(inv, main.deliver.id)) : Math.min(ms.p, c);
  const click = () => {
    if (useGameStore.getState().status === GameStatus.PLAYING) { if (mainInTown(main, have)) offerTeleport(walkToMain); else fieldNote(); return; }
    walkToMain();
  };
  const goods = main.deliver ? LOOT_BY_ID[main.deliver.id]?.name : '';
  return (
    <div className="qt-row main" data-testid="main-quest-row" role="button" title="Click: auto-path" onClick={click}>
      <div className="qt-head"><Crown size={13} /><span>Main Quest</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{main.title}</div>
      {c > 1 || main.deliver
        ? <div className="qt-line"><span className="qt-bar"><i style={{ width: `${Math.min(1, have / Math.max(1, c)) * 100}%` }} /></span><b>{have} / {c}{goods ? ` ${goods}` : ''}</b></div>
        : null}
      <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.85 }}>{main.deliver && have >= c ? `Bring them to ${main.npc}` : main.line}</b></div>
    </div>
  );
};

const BoardRow: React.FC<{ q: Quest }> = ({ q }) => {
  const done = questDone(q), king = questNeedsKing(q), f = Math.min(1, q.progress / Math.max(1, q.target));
  const dist = useDistance(() => boardQuestNav(q));
  return (
    <div className={`qt-row board ${done ? 'done' : ''} ${king ? 'king' : ''}`} role="button" title="Click: auto-path" onClick={() => { if (!((done || king) && offerTeleport(() => walkToQuest(q)))) walkToQuest(q); }}>
      <div className="qt-head"><ScrollText size={13} /><span>{done ? 'Ready to claim' : king ? (q.type === 'AUDIENCE' ? 'Talk to the King' : 'Report to the King') : 'Quest'}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{questTitle(q)}</div>
      {q.type === 'AUDIENCE'
        ? <div className="qt-line"><b>{done ? 'Done' : 'Castle keep, north of the plaza'}</b></div>
        : <div className="qt-line"><span className="qt-bar"><i style={{ width: `${(done ? 1 : f) * 100}%` }} /></span><b>{Math.min(q.progress, q.target)} / {q.target}</b></div>}
    </div>
  );
};

const SideRow: React.FC<{ d: NpcQuestDef }> = ({ d }) => {
  const nq = useGameStore((s) => s.npcQuests), inv = useGameStore((s) => s.inventory);
  const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv), c = d.objective.count;
  const dist = useDistance(() => npcQuestNav(d));
  const o = d.objective, town = ready || o.type === 'TALK' || o.type === 'INTERACT' || o.type === 'ACTION';
  return (
    <div className={`qt-row npc ${ready ? 'done' : ''}`} data-testid="npc-quest-row" role="button" title="Click: auto-path"
      onClick={() => {
        const go = () => walkToNpcObjective(d);
        if (useGameStore.getState().status === GameStatus.PLAYING) { if (town) offerTeleport(go); else fieldNote(); return; }
        go();
      }}>
      <div className="qt-head"><BookOpen size={13} /><span>{ready ? `Return to ${npcQuestTurnIn(d)}` : d.giver}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{d.title}</div>
      {o.type === 'TALK'
        ? <div className="qt-line"><b>{ready ? 'Done' : d.summary}</b></div>
        : <>
          <div className="qt-line"><span className="qt-bar"><i style={{ width: `${(ready ? 1 : n / Math.max(1, c)) * 100}%` }} /></span><b>{n} / {c}</b></div>
          {!ready && <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.75 }}>{d.summary}</b></div>}
        </>}
    </div>
  );
};

export const QuestTracker: React.FC = () => {
  const quests = useGameStore((s) => s.quests);
  const act = activeQuests(quests);
  // NPC story quests (blue book icon): accepted, not yet handed in
  const nq = useGameStore((s) => s.npcQuests);
  const story = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, 1) === 'ACTIVE');
  const main = useGameStore((s) => STORY[s.story.step]);
  if (act.length === 0 && story.length === 0 && !main) return null;
  return (
    <div className="qt pe" data-testid="quest-tracker">
      {/* (owner: no 'Received ...' lines under the tracker - the loot feed already shows rewards) */}
      {main && <MainRow main={main} />}
      {act.map((q) => <BoardRow key={q.id} q={q} />)}
      {story.map((d) => <SideRow key={d.id} d={d} />)}
    </div>
  );
};
