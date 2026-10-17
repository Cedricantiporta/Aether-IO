// (owner, Hades-style) After a run the hero wakes at home; if the story has reached the next dream's milestone (dreams.ts),
// the Font holds them a moment longer: a pale gold haze over the town and a short scene with Aelia (or one of the hero's
// own memories), then the bell and they wake. One dream per return, in order.
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useDialogue } from '../../engine/systems/dialogue';
import { openCustomDialogue } from '../../engine/systems/dialogue';
import { GameStatus } from '../../types';
import { DREAMS, nextDream, dreamsSeen, markDreamSeen, dreamLines } from '../../dreams';

const RUN = new Set<GameStatus>([GameStatus.PLAYING, GameStatus.PAUSED, GameStatus.LEVEL_UP, GameStatus.GAME_OVER]);

let show: ((force: boolean) => void) | null = null;
/** Debug: play the next dream now, milestone or not (null when all are seen). */
export function playNextDream(): string | null { const d = DREAMS[dreamsSeen()]; if (!d || !show) return null; show(true); return d.title; }

export const DreamOverlay: React.FC = () => {
  const [on, setOn] = useState(false);
  const open = useDialogue((s) => s.open);
  useEffect(() => {
    show = (force) => {
      const st = useGameStore.getState();
      if (st.status !== GameStatus.MENU || useDialogue.getState().open) return;
      const d = force ? DREAMS[dreamsSeen()] : nextDream(st.story.step, st.progress.endings);
      if (!d) return;
      markDreamSeen(Math.max(dreamsSeen(), DREAMS.indexOf(d) + 1));
      const memory = d.voice === 'MEMORY';
      openCustomDialogue(memory ? 'A Memory' : 'Aelia', `${memory ? 'Your past' : 'A dream at the Font'} · ${d.title}`, memory ? '#c8d8ff' : '#fff3c4',
        dreamLines(d, st.hero), { label: 'Wake up', accept: () => setOn(false) });
      setOn(true);
    };
    const off = useGameStore.subscribe((s, p) => {
      if (s.status === GameStatus.MENU && RUN.has(p.status)) setTimeout(() => show?.(false), 1800);   // (after the town has loaded)
    });
    return () => { off(); show = null; };
  }, []);
  useEffect(() => { if (on && !open) setOn(false); }, [on, open]);
  if (!on) return null;
  return <div className="dream-haze" aria-hidden />;
};
