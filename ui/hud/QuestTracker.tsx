// Active quest tracker (Korean-MMO style): right side, under the menu icons. Main quest first (gold), then accepted
// bounties and NPC side quests, each with its objective, progress and (in town) the distance to where it continues.
// Click = open the quest log on that quest (indicators only: no auto-pathing; owner).
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import React, { useRef } from 'react';
import { stepCount, STORY, type StoryStep } from '../../story';
import { useGameStore } from '../../store';
import { activeQuests, questDone, questNeedsKing, questTitle, type Quest } from '../../quests';
import { walkAfterArrive } from '../../engine/systems/village';
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
/** Rows the tracker shows at once (owner: 3, the main quest included). */
const TRACK_MAX = 3;

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
        txt = t.hop ? (world.village.area === 'CASTLE' ? 'leave castle' : world.village.area === 'CHURCH' ? 'leave chapel' : world.village.area === 'TAVERN' ? 'leave tavern' : world.village.area === 'HOME' ? 'leave house' : world.village.area === 'CAVE' ? 'leave cave' : t.act === 'cave' ? 'in the cave' : 'in the castle') : t.field ? (d < 12 ? 'portal' : `portal ${Math.round(d)} m`) : d <= t.reach + 1 ? 'here' : `${Math.round(d)} m`;
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
  const click = () => useUiStore.getState().openQuestLogOn('main');
  const goods = main.deliver ? LOOT_BY_ID[main.deliver.id]?.name : '';
  return (
    <div className="qt-row main" data-k="main" data-s={main.deliver && have >= c ? 'done' : undefined} data-testid="main-quest-row" role="button" title="Click: open the quest log" onClick={click}>
      <div className="qt-head"><i className="qt-mark">{main.deliver && have >= c ? '\u2713' : '!'}</i><span>Main Quest</span><span className="qt-dist" ref={dist} /></div>
      {/* (owner: no progress bars - the count sits on the title line, the list stays short) */}
      <div className="qt-title">{main.title}{c > 1 || main.deliver ? <b className="qt-n">{have} / {c}{goods ? ` ${goods}` : ''}</b> : null}</div>
      <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.85 }}>{main.deliver && have >= c ? `Bring them to ${main.npc}` : main.line}</b></div>
    </div>
  );
};

const BoardRow: React.FC<{ q: Quest }> = ({ q }) => {
  const done = questDone(q), king = questNeedsKing(q);
  const dist = useDistance(() => boardQuestNav(q));
  return (
    <div data-k="board" data-s={done ? 'done' : undefined} className={`qt-row board ${done ? 'done' : ''} ${king ? 'king' : ''}`} role="button" title="Click: open the quest log" onClick={() => useUiStore.getState().openQuestLogOn('board:' + q.id)}>
      <div className="qt-head"><i className="qt-mark">{done ? '\u2713' : '!'}</i><span>{done ? 'Ready to claim' : king ? (q.type === 'AUDIENCE' ? 'Talk to the King' : 'Report to the King') : 'Quest'}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{questTitle(q)}{q.type !== 'AUDIENCE' && <b className="qt-n">{Math.min(q.progress, q.target)} / {q.target}</b>}</div>
      {q.type === 'AUDIENCE' && <div className="qt-line"><b>{done ? 'Done' : 'Castle keep, north of the plaza'}</b></div>}
    </div>
  );
};

const SideRow: React.FC<{ d: NpcQuestDef }> = ({ d }) => {
  const nq = useGameStore((s) => s.npcQuests), inv = useGameStore((s) => s.inventory);
  const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv), c = d.objective.count;
  const dist = useDistance(() => npcQuestNav(d));
  const o = d.objective;
  return (
    <div data-k="npc" data-s={ready ? 'done' : undefined} className={`qt-row npc ${ready ? 'done' : ''}`} data-testid="npc-quest-row" role="button" title="Click: open the quest log"
      onClick={() => useUiStore.getState().openQuestLogOn('side:' + d.id)}>
      <div className="qt-head"><i className="qt-mark">{ready ? '\u2713' : '!'}</i><span>{ready ? `Return to ${npcQuestTurnIn(d)}` : d.giver}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{d.title}{o.type !== 'TALK' && o.type !== 'LISTEN' && <b className="qt-n">{n} / {c}</b>}</div>
      {o.type === 'TALK' || o.type === 'LISTEN'
        ? <div className="qt-line"><b>{ready ? 'Done' : d.summary}</b></div>
        : !ready && <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.75 }}>{d.summary}</b></div>}
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
  const inv = useGameStore.getState().inventory;
  const rest = [
    ...act.filter(questDone).map((q) => ({ q, d: null as NpcQuestDef | null })),
    ...story.filter((d) => npcQuestReady(d, nq, inv)).map((d) => ({ q: null as Quest | null, d })),
    ...act.filter((q) => !questDone(q)).map((q) => ({ q, d: null as NpcQuestDef | null })),
    ...story.filter((d) => !npcQuestReady(d, nq, inv)).map((d) => ({ q: null as Quest | null, d })),
  ].slice(0, TRACK_MAX - (main ? 1 : 0));
  return (
    <div className="qt pe" data-testid="quest-tracker">
      {/* (owner: no 'Received ...' lines under the tracker - the loot feed already shows rewards) */}
      {/* (owner) at most 3 quests on screen: the main quest, then the ones ready to hand in, then the rest */}
      {main && <MainRow main={main} />}
      {rest.map((r) => r.q ? <BoardRow key={r.q.id} q={r.q} /> : <SideRow key={r.d!.id} d={r.d!} />)}
    </div>
  );
};
