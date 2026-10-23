// "Today's Daily Trial" offer shown once per game start (after the title / character select) in town: modifiers + rewards (DailyCard),
// Start / Later. Only when the trial is unlocked (Lv 15) and today's reward has not been claimed yet.
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { DailyCard } from './DailyCard';
import { UNLOCK_LV } from '../../unlocks';
import { dayKey } from '../../dailyChallenge';
import { activeChar } from '../../characters';
import { showcasePending } from '../../engine/showcase';
import { useDialogue } from '../../engine/systems/dialogue';
import { GameStatus } from '../../types';

let offered = false;   // once per page load (a game start)

export const DailyPopup: React.FC = () => {
  const [open, setOpen] = useState(false);
  const status = useGameStore((s) => s.status), titleDone = useUiStore((s) => s.titleDone), prologue = useUiStore((s) => s.prologueOpen), level = useGameStore((s) => s.level);
  useEffect(() => {
    if (offered || status !== GameStatus.MENU || !titleDone || prologue) return;
    const t = setTimeout(() => {
      const s = useGameStore.getState(), c = activeChar();
      if (offered || s.level < UNLOCK_LV.DAILY || s.progress.daily.claimed === dayKey() || (c && showcasePending(c.id)) || useDialogue.getState().open) return;
      offered = true; setOpen(true);
    }, 2200);
    return () => clearTimeout(t);
  }, [status, titleDone, prologue, level]);
  if (!open) return null;
  const start = () => { setOpen(false); useGameStore.getState().startDaily(); };
  return (
    <Modal open title="Today's Daily Trial" ribbon tone="gold" width="min(48rem, calc(100vw - 1.5rem))" z={170} onClose={() => setOpen(false)} onConfirm={start}>
      <div data-testid="daily-popup"><DailyCard /></div>
      <div className="flex gap-2 mt-3">
        <Button className="flex-1" variant="primary" size="lg" onClick={start} data-testid="daily-popup-start">Start</Button>
        <Button className="flex-1" size="lg" onClick={() => setOpen(false)} data-testid="daily-popup-later">Later</Button>
      </div>
    </Modal>
  );
};
