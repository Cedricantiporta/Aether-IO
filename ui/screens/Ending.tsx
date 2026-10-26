// The ending: shown a moment after Malakar falls in the Undying Throne. Story slides advance on their own (one per screen), then the
// credits and the Ascension unlock; Continue banks the run (victory summary) and returns to town afterwards.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store';
import { useGameEvent } from '../hooks/useEvent';
import { finishRunVictory } from '../../engine/systems/director';
import { runInfo } from '../../engine/runMods';
import { ASCENSION_MAX, ascRewardText } from '../../ascension';
import { GameStatus } from '../../types';
import { storyIdx } from '../../story';

const STORY_BASE = [
  'Malakar, the Undying, falls.',
  'The jar of light breaks, and a girl steps out of it, and speaks to you as if she has done this many times before.',
  'In the Meadow, the first flowers open. In the Old Grove, Elderroot stirs in his sleep; in the Halls, Gorath is only a hill again.',
  'The village bells ring through the night. Hodge finally asks Lysa. She says "buy something first".',
  'DREAM',
  'You were only the guard who came out of the well.',
  'Now you are its legend.',
];
/** The line after the bells: the Font takes the memory, unless this was the run you held on to it (story past 'remember'). */
const storySlides = (): string[] => {
  const kept = useGameStore.getState().story.step > storyIdx('remember');
  return STORY_BASE.map((l) => (l !== 'DREAM' ? l : kept ? 'This time, when you wake beside the well, you still remember her voice.' : 'You wake beside the well with the taste of light in your mouth. Already the dream is fading. A song. A name. Gone.'));
};
let STORY = storySlides();
const CREDITS: [string, string][] = [
  ['A game by', 'The Aether Survivor team'], ['3D characters', 'KayKit (CC0)'], ['Trees', 'Kenney (CC0)'], ['Nature models', 'Quaternius (CC0)'], ['Built with', 'three.js · React · Zustand'],
];

/** How long one story slide stays up (longer passages stay longer). */
export const slideMs = (line: string): number => 1800 + line.length * 28;

export const EndingScreen: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [towerNote, setTowerNote] = useState(false);
  const inTown = useGameStore((s) => s.status === GameStatus.MENU);
  useGameEvent('gameEnding', () => { setTimeout(() => { STORY = storySlides(); setStep(0); setOpen(true); }, 2600); });
  const total = STORY.length + 2;   // story slides, credits, final card
  useEffect(() => {
    if (!open || step >= total - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), step < STORY.length ? slideMs(STORY[step]) : 6000);
    return () => clearTimeout(t);
  }, [open, step, total]);
  if (!open) {
    // first ending: once back in town, announce that the Endless Tower has opened
    if (towerNote && inTown) return (
      <div className="absolute inset-0 pe flex items-center justify-center" style={{ zIndex: 220, background: 'rgba(5,3,2,.6)' }} data-testid="tower-unlocked">
        <motion.div className="tower-note" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <div className="ending-title" style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)' }}>The Endless Tower is open</div>
          <p>With Malakar gone, the old tower outside the village gate has woken. Climb it floor by floor, as high as you dare.</p>
          <p data-testid="hard-unlocked"><b>Hard mode unlocked.</b> Turn it on in Settings: tougher monsters, but +50% gold and XP and better item and card odds.</p>
          <button className="rpg-btn rpg-btn-primary ending-go" onClick={() => setTowerNote(false)} data-testid="tower-unlocked-ok">Onward</button>
        </motion.div>
      </div>
    );
    return null;
  }
  const next = Math.min(ASCENSION_MAX, runInfo.ascension + 1);
  const payNow = !(useGameStore.getState().progress.ascClaimed ?? []).includes(runInfo.ascension);   // (owner 2026-10-26) the first clear of every Ascension level pays a one-time reward
  const done = () => {
    const first = useGameStore.getState().progress.endings === 0;
    setOpen(false); useGameStore.getState().completeEnding(); finishRunVictory();
    if (first) setTowerNote(true);
  };
  return (
    <motion.div className="ending-root pe" style={{ background: 'radial-gradient(ellipse at center, rgba(22,16,10,.95), rgba(4,3,2,.99))' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.6 }} data-testid="ending">
      <div className="ending-glow" />
      {step < STORY.length && (
        <div className="ending-story prologue-slide">
          <AnimatePresence mode="wait">
            <motion.p key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.9 }}>{STORY[step]}</motion.p>
          </AnimatePresence>
        </div>
      )}
      <AnimatePresence>
        {step === STORY.length && (
          <motion.div key="credits" className="ending-credits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
            <div className="rpg-logo" style={{ fontSize: 'clamp(2rem, 4.6vw, 3.6rem)' }}>Aether Survivor</div>
            {CREDITS.map(([a, b]) => <div key={a} className="ending-credit"><span>{a}</span><b>{b}</b></div>)}
            <div className="ending-credit"><span>And</span><b>you, for playing</b></div>
          </motion.div>
        )}
      </AnimatePresence>
      {step >= STORY.length + 1 && (
        <motion.div className="ending-final" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }}>
          <div className="ending-title">The End</div>
          <div className="ending-sub">{runInfo.ascension > 0 ? `Ascension ${runInfo.ascension} cleared.` : 'The Void is sealed.'} {next > runInfo.ascension ? `Ascension ${next} awaits at the Endless Tower, and its first clear pays ${ascRewardText(next)}.` : 'You stand at the peak of Ascension.'}</div>
          {payNow && <div className="ending-sub" data-testid="ending-reward">First-clear reward, yours on Continue: {ascRewardText(runInfo.ascension)}.</div>}
          <button className="rpg-btn rpg-btn-primary ending-go" onClick={done} data-testid="ending-continue">Continue</button>
        </motion.div>
      )}
      {step < total - 1 && <button className="rpg-btn story-skip" onClick={() => setStep(total - 1)} data-testid="ending-skip">Skip ›</button>}
    </motion.div>
  );
};
