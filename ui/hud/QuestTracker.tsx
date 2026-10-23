// Active quest tracker (Korean-MMO style): right side, under the menu icons. Main quest first (gold), then accepted
// NPC side quests, each with its objective, progress and (in town) the distance to where it continues.
// Click = auto-path to where the quest continues (trackAndGo); a tracked, not yet accepted side quest shows "Talk to <giver>".
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import React, { useRef } from 'react';
import { stepCount, STORY, type StoryStep } from '../../story';
import { useGameStore } from '../../store';
import { walkAfterArrive, walkToMain, walkToNpcObjective, walkToNpcQuest } from '../../engine/systems/village';
import { NPC_QUESTS, NPC_QUEST_BY_ID, npcQuestProgress, npcQuestReady, npcQuestStatus, npcQuestTurnIn, bagCount, type NpcQuestDef } from '../../npcQuests';
import { LOOT_BY_ID } from '../../loot';
import { mainNav, npcQuestNav, navNpc, navDist, type NavTarget } from '../../engine/systems/questNav';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { liveStep } from '../../questUnlocks';
import { NPCS } from '../../engine/townData';

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
/** Walk target of an offered (not yet accepted) side quest: its giver. */
const offerNav = (d: NpcQuestDef): NavTarget | null => { const i = NPCS.findIndex((n) => n.name === d.giver); return i >= 0 ? navNpc(i) : null; };
/** "Track" in the quest window / a click on a tracker row: auto-path to the quest (in a run, a town target offers the trip home first). */
export function trackAndGo(key: string): void {
  const inRun = useGameStore.getState().status === GameStatus.PLAYING;
  if (key === 'main') {
    if (inRun) { const t = mainNav(); if (t && !t.field) offerTeleport(walkToMain); return; }
    walkToMain(); return;
  }
  const d = NPC_QUEST_BY_ID[key.slice(5)]; if (!d) return;
  const st = useGameStore.getState(), s = npcQuestStatus(d, st.npcQuests, st.heroRank);
  if (s === 'AVAILABLE') { const go = () => walkToNpcQuest(d.giver); if (inRun) offerTeleport(go); else go(); return; }
  if (s !== 'ACTIVE') return;
  const go = () => walkToNpcObjective(d);
  if (inRun) { const t = npcQuestNav(d); if (t && !t.field) offerTeleport(go); return; }
  go();
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
  // (owner) click = auto-path there again; in a run, a step that waits in town offers a teleport home, else the quest log opens
  const click = () => {
    if (useGameStore.getState().status === GameStatus.PLAYING) { const t = mainNav(); if (!(t && !t.field && offerTeleport(walkToMain))) useUiStore.getState().openQuestLogOn('main'); return; }
    walkToMain();
  };
  const goods = main.deliver ? LOOT_BY_ID[main.deliver.id]?.name : '';
  return (
    <div className="qt-row main" data-k="main" data-s={main.deliver && have >= c ? 'done' : undefined} data-testid="main-quest-row" role="button" title="Click: auto-path" onClick={click}>
      <div className="qt-head"><i className="qt-mark">{main.deliver && have >= c ? '\u2713' : '!'}</i><span>Main Quest</span><span className="qt-dist" ref={dist} /></div>
      {/* (owner: no progress bars - the count sits on the title line, the list stays short) */}
      <div className="qt-title">{main.title}{c > 1 || main.deliver ? <b className="qt-n">{have} / {c}{goods ? ` ${goods}` : ''}</b> : null}</div>
      <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.85 }}>{main.deliver && have >= c ? `Bring them to ${main.npc}` : main.line}</b></div>
    </div>
  );
};

const SideRow: React.FC<{ d: NpcQuestDef }> = ({ d }) => {
  const nq = useGameStore((s) => s.npcQuests), inv = useGameStore((s) => s.inventory);
  const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv), c = d.objective.count;
  const dist = useDistance(() => npcQuestNav(d));
  const o = d.objective;
  return (
    <div data-k="npc" data-s={ready ? 'done' : undefined} className={`qt-row npc ${ready ? 'done' : ''}`} data-testid="npc-quest-row" role="button" title="Click: auto-path"
      onClick={() => {
        const go = () => walkToNpcObjective(d);
        if (useGameStore.getState().status === GameStatus.PLAYING) { if (!(ready && offerTeleport(go))) useUiStore.getState().openQuestLogOn('side:' + d.id); return; }
        go();
      }}>
      <div className="qt-head"><i className="qt-mark">{ready ? '\u2713' : '!'}</i><span>{ready ? `Return to ${npcQuestTurnIn(d)}` : d.giver}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{d.title}{o.type !== 'TALK' && o.type !== 'LISTEN' && <b className="qt-n">{n} / {c}</b>}</div>
      {o.type === 'TALK' || o.type === 'LISTEN'
        ? <div className="qt-line"><b>{ready ? 'Done' : d.summary}</b></div>
        : !ready && <div className="qt-line"><b style={{ fontWeight: 500, opacity: 0.75 }}>{d.summary}</b></div>}
    </div>
  );
};

/** A side quest the hero tracked but has not accepted yet: "Talk to <giver>" (click = auto-path there). */
const OfferRow: React.FC<{ d: NpcQuestDef }> = ({ d }) => {
  const dist = useDistance(() => offerNav(d));
  return (
    <div data-k="npc" className="qt-row npc" data-testid="npc-offer-row" role="button" title="Click: auto-path" onClick={() => trackAndGo('side:' + d.id)}>
      <div className="qt-head"><i className="qt-mark">!</i><span>{d.giver}</span><span className="qt-dist" ref={dist} /></div>
      <div className="qt-title">{d.title}</div>
      <div className="qt-line"><b>{`Talk to ${d.giver}`}</b></div>
    </div>
  );
};

export const QuestTracker: React.FC = () => {
  // NPC side quests (blue book icon): accepted, not yet handed in
  const nq = useGameStore((s) => s.npcQuests);
  const story = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, 1) === 'ACTIVE');
  const main = useGameStore((s) => liveStep(s));   // (a still-locked main step is hidden: questUnlocks.ts)
  const tk = useUiStore((s) => s.trackedQuest), heroRank = useGameStore((s) => s.heroRank);
  const offerDef = tk.startsWith('side:') ? NPC_QUEST_BY_ID[tk.slice(5)] : undefined;
  const offer = offerDef && npcQuestStatus(offerDef, nq, heroRank) === 'AVAILABLE' ? offerDef : undefined;   // (tracked from the quest window before accepting it)
  if (story.length === 0 && !main && !offer) return null;
  const inv = useGameStore.getState().inventory;
  const rest = [
    ...story.filter((d) => npcQuestReady(d, nq, inv)),
    ...story.filter((d) => !npcQuestReady(d, nq, inv)),
  ].slice(0, TRACK_MAX - (main ? 1 : 0) - (offer ? 1 : 0));
  return (
    <div className="qt pe" data-testid="quest-tracker">
      {/* (owner: no 'Received ...' lines under the tracker - the loot feed already shows rewards) */}
      {/* (owner) at most 3 quests on screen: the main quest, then the ones ready to hand in, then the rest */}
      {main && <MainRow main={main} />}
      {offer && <OfferRow d={offer} />}
      {rest.map((d) => <SideRow key={d.id} d={d} />)}
    </div>
  );
};
