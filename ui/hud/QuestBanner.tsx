import React, { useEffect } from 'react';
import { create } from 'zustand';
import { GameStatus } from '../../types';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { walkToMain, walkToNpcObjective } from '../../engine/systems/village';
import { NPC_QUESTS } from '../../npcQuests';
import { offerTeleport } from './QuestTracker';

/** Quest popup (Zelda style): a wide soft band with a small italic type line, a big title and two hint pills.
 *  Fades in, holds ~3 s, fades out (pure CSS animation; the store only changes when a banner starts / ends). */
interface QB { id: number; type: string; title: string; track: (() => void) | null }
interface QBState { cur: QB | null; show: (b: Omit<QB, 'id'>) => void; clear: (id: number) => void }
let qid = 0;
export const useQuestBanner = create<QBState>((set) => ({
  cur: null,
  show: (b) => set({ cur: { ...b, id: ++qid } }),
  clear: (id) => set((s) => (s.cur?.id === id ? { cur: null } : s)),
}));

/** Shows the banner for a side quest (by title) or the main quest. */
export function questBanner(kind: 'side' | 'main', title: string, state: 'offered' | 'accepted'): void {
  const def = kind === 'side' ? NPC_QUESTS.find((d) => d.title === title) : null;
  const track = kind === 'main' ? () => walkToMain() : def ? () => walkToNpcObjective(def) : null;
  const base = kind === 'main' ? 'Main Quest' : 'Side Quest';
  useQuestBanner.getState().show({ type: state === 'offered' ? `New ${base}` : `${base} accepted`, title, track });
}

const HOLD_MS = 3900;   // 0.4 s in + 3.0 s hold + 0.5 s out

export const QuestBanner: React.FC = () => {
  const cur = useQuestBanner((s) => s.cur);
  const clear = useQuestBanner((s) => s.clear);
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => clear(cur.id), HOLD_MS);
    return () => clearTimeout(t);
  }, [cur, clear]);
  if (!cur) return null;
  const go = () => {
    if (!cur.track) return;
    if (useGameStore.getState().status === GameStatus.PLAYING) { offerTeleport(cur.track); return; }
    cur.track();
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div className="qb-root" key={cur.id} data-testid="quest-banner">
      <div className="qb-band">
        <em className="qb-type">{cur.type}</em>
        <b className="qb-title">{cur.title}</b>
        <div className="qb-hints">
          <button className="qb-hint pe" onPointerDown={stop} onClick={go} disabled={!cur.track}><i className="qb-dot" />Destination</button>
          <button className="qb-hint pe" onPointerDown={stop} onClick={() => useUiStore.getState().openQuestLog(true)}><i className="qb-minus" />Open Log</button>
        </div>
      </div>
    </div>
  );
};
