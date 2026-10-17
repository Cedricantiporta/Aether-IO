// (owner, Hades-style) After a run the hero wakes at home; if the story has reached the next dream's milestone (dreams.ts),
// the Font holds them a moment longer: a pale gold haze over the town and a short scene with Aelia (or one of the hero's
// own memories), then the bell and they wake. One dream per return, in order. Aelia's dreams are walked instead: a dream
// run (runInfo.dream) into a quiet Greenwood clearing with her at the end of the path (director plan.dream).
import React, { useEffect, useRef, useState } from 'react';
import { dreamFx, wake } from '../../engine/dreamFx';
import { useRaf } from '../hooks/useRaf';
import { useGameStore } from '../../store';
import { useDialogue } from '../../engine/systems/dialogue';
import { openCustomDialogue } from '../../engine/systems/dialogue';
import { GameStatus } from '../../types';
import { DREAMS, nextDream, dreamsSeen, markDreamSeen, dreamLines } from '../../dreams';
import { dreamView, dreamHooks } from '../../dreams';
import { runInfo } from '../../engine/runMods';

const RUN = new Set<GameStatus>([GameStatus.PLAYING, GameStatus.PAUSED, GameStatus.LEVEL_UP, GameStatus.GAME_OVER]);

let show: ((force: boolean) => boolean) | null = null;
/** Debug: play the next dream now, milestone or not (null when all are seen). */
export function playNextDream(): string | null { const d = DREAMS[dreamsSeen()]; if (!d || !show) return null; return show(true) ? d.title : null; }

export const DreamOverlay: React.FC = () => {
  const [on, setOn] = useState(false);
  const open = useDialogue((s) => s.open);
  useEffect(() => {
    show = (force) => {
      const st = useGameStore.getState();
      if (st.status !== GameStatus.MENU || useDialogue.getState().open) return false;
      const d = force ? DREAMS[dreamsSeen()] : nextDream(st.story.step, st.progress.endings);
      if (!d) return false;
      if (d.voice === 'AELIA') {   // (owner) her dreams are walked: a quiet Greenwood clearing, Aelia at the end of the path
        dreamView.pending = d;
        st.addNotification('The Font holds you a moment longer... you drift into a dream.', '#fff3c4', 'SYSTEM');
        runInfo.dream = true; st.startMode('ADVENTURE');
        return true;
      }
      markDreamSeen(Math.max(dreamsSeen(), DREAMS.indexOf(d) + 1));
      const memory = d.voice === 'MEMORY';
      openCustomDialogue(memory ? 'A Memory' : 'Aelia', `${memory ? 'Your past' : 'A dream at the Font'} · ${d.title}`, memory ? '#c8d8ff' : '#fff3c4',
        dreamLines(d, st.hero), { label: 'Wake up', accept: () => wake(() => setOn(false)) });
      setOn(true);
      return true;
    };
    dreamHooks.sleep = () => show?.(false) ?? false;
    const off = useGameStore.subscribe((s, p) => {
      if (s.status === GameStatus.MENU && RUN.has(p.status)) setTimeout(() => show?.(false), 1800);   // (after the town has loaded)
    });
    return () => { off(); show = null; dreamHooks.sleep = null; };
  }, []);
  useEffect(() => { if (on && !open) setOn(false); }, [on, open]);
  if (!on) return null;
  return <div className="dream-haze" aria-hidden />;
};

/** Dream room atmosphere (soft vignette + low contrast / saturation, opacity = dreamFx.haze) and the wake-up veil
 *  (soft gold, opacity = dreamFx.veil, swallows input while fading). Both are written to DOM refs from the rAF hook. */
export const DreamVeil: React.FC = () => {
  const haze = useRef<HTMLDivElement>(null), veil = useRef<HTMLDivElement>(null);
  const lh = useRef(-1), lv = useRef(-1);
  useRaf(() => {
    const h = Math.round(dreamFx.haze * 100) / 100, v = Math.round(dreamFx.veil * 100) / 100;
    if (h !== lh.current && haze.current) { lh.current = h; haze.current.style.opacity = String(h); haze.current.style.visibility = h > 0 ? 'visible' : 'hidden'; }
    if (v !== lv.current && veil.current) { lv.current = v; veil.current.style.opacity = String(v); veil.current.style.visibility = v > 0 ? 'visible' : 'hidden'; }
    if (veil.current) veil.current.style.pointerEvents = dreamFx.busy ? 'auto' : 'none';
  });
  return <><div ref={haze} className="dream-mist" aria-hidden /><div ref={veil} className="dream-veil" aria-hidden /></>;
};
