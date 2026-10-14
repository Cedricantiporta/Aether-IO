// The ending: shown a moment after Malakar falls in the Undying Throne. Story lines fade in one by one, then the
// credits and the Ascension unlock; Continue banks the run (victory summary) and returns to town afterwards.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store';
import { useGameEvent } from '../hooks/useEvent';
import { finishRunVictory } from '../../engine/systems/director';
import { runInfo } from '../../engine/runMods';
import { ASCENSION_MAX } from '../../ascension';

const STORY = [
  'Malakar, the Undying, falls at last.',
  'The Void shudders, and the stolen light pours back into the world.',
  'In the Meadow, the first flowers open. In the Old Grove, Elderroot stirs in his sleep.',
  'The village bells ring through the night. Somewhere, a hermit laughs.',
  'You were only the village guard.',
  'Now you are its legend.',
];
const CREDITS: [string, string][] = [
  ['A game by', 'The Aether Survivor team'], ['3D characters', 'KayKit (CC0)'], ['Trees', 'Kenney (CC0)'], ['Built with', 'three.js · React · Zustand'],
];

export const EndingScreen: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useGameEvent('gameEnding', () => { setTimeout(() => { setStep(0); setOpen(true); }, 2600); });
  const total = STORY.length + 2;   // story lines, credits, final card
  useEffect(() => {
    if (!open || step >= total - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), step < STORY.length ? 2600 : 5200);
    return () => clearTimeout(t);
  }, [open, step, total]);
  if (!open) return null;
  const next = Math.min(ASCENSION_MAX, runInfo.ascension + 1);
  const done = () => { setOpen(false); useGameStore.getState().completeEnding(); finishRunVictory(); };
  return (
    <motion.div className="ending-root pe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.6 }} data-testid="ending">
      <div className="ending-glow" />
      {step < STORY.length && (
        <div className="ending-story">
          {STORY.slice(0, step + 1).map((l, i) => (
            <motion.p key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: i === step ? 1 : 0.55, y: 0 }} transition={{ duration: 1.2 }}>{l}</motion.p>
          ))}
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
          <div className="ending-sub">{runInfo.ascension > 0 ? `Ascension ${runInfo.ascension} cleared.` : 'The Void is sealed.'} {next > runInfo.ascension ? `Ascension ${next} awaits at the town gate.` : 'You stand at the peak of Ascension.'}</div>
          <button className="rpg-btn rpg-btn-primary ending-go" onClick={done} data-testid="ending-continue">Continue</button>
        </motion.div>
      )}
      {step < total - 1 && <button className="ending-skip" onClick={() => setStep(total - 1)}>Skip</button>}
    </motion.div>
  );
};
