// Boss Trials window (owner 2026-10-26): E at the purple portal on the south-west headland (after the first game clear). Seven rows, one per biome boss:
// its name + icon, the slot it drops, and a state: Available (Fight), Done today (reset countdown) or Use ticket (a Boss Trial Ticket pays a rematch).
// Rules / odds live in bossTrials.ts; the fight is store.startBossTrial.
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useGameEvent } from '../hooks/useEvent';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { BOSS_PORTAL } from '../../engine/townData';
import { biomeOf, bossNameIn, BIOMES } from '../../engine/roomDefs';
import { TRIAL_BOSSES, TICKET_NAME, fought, untilReset, trialDayKey, TRIAL_MYTHIC } from '../../bossTrials';

/** A cute emoji per biome boss (Elderroot, Gorath, Dune Colossus, Tide Hydra, Glacius, Ignar, Void Herald). */
const BOSS_ICON = ['\u{1F333}', '\u{1F5FF}', '\u{1F3DC}️', '\u{1F419}', '\u{1F409}', '\u{1F525}', '\u{1F30C}'];

export const BossTrialsWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  useGameEvent('openBossTrials', () => setOpen(true));
  // walking away from the portal closes it
  useRaf(() => {
    if (!open) return;
    const p = world.player.pos, at = BOSS_PORTAL.front;
    if ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 > 7.5 * 7.5) setOpen(false);
  });
  // the "resets in" text refreshes once a minute (not per frame)
  useEffect(() => { if (!open) return; const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, [open]);
  const { trialDay, endings, tickets, startBossTrial } = useGameStore(useShallow((s) => ({
    trialDay: s.progress.trialDay, endings: s.progress.endings, startBossTrial: s.startBossTrial,
    tickets: s.inventory.reduce((n, i) => (i.type === 'LOOT' && i.name === TICKET_NAME ? n + (i.quantity || 1) : n), 0),
  })));
  if (!open) return null;
  const today = trialDayKey(), reset = untilReset();
  return (
    <Modal open={open} title="Boss Trials" ribbon tone="purple" width="min(34rem, calc(100vw - 1.5rem))" z={160} onClose={() => setOpen(false)}>
      <div className="bt-root" data-testid="boss-trials">
        <div className="bt-intro">
          Face a guardian alone, at <b>Void strength</b> and a little angrier. Each win drops one <b>Legendary</b> ({Math.round((1 - TRIAL_MYTHIC) * 100)}%) or <b>Mythic</b> ({Math.round(TRIAL_MYTHIC * 100)}%) piece, sometimes upgraded to +5, with a better chance of Perfect bonus lines.
        </div>
        <div className="bt-tickets" data-testid="bt-tickets">Boss Trial Tickets: <b>{tickets}</b> <span>(300 gems at the Gem Shop)</span></div>
        <div className="bt-list">
          {TRIAL_BOSSES.map((t, i) => {
            const def = biomeOf(t.biome), nm = bossNameIn(def.boss, t.biome), done = fought(trialDay, i, today);
            const canTicket = done && tickets > 0;
            return (
              <div key={i} className={`bt-row ${done ? 'done' : ''}`} data-testid={`bt-row-${i}`}>
                <div className="bt-ico">{BOSS_ICON[i] ?? '\u{1F47E}'}</div>
                <div className="bt-main">
                  <b>{nm.name}</b>
                  <span>{nm.title} · {BIOMES[t.biome].name}</span>
                  <em>Drops: <i>{t.icon} {t.slotLabel}</i></em>
                </div>
                <div className="bt-act">
                  {!done && <Button variant="primary" size="sm" data-testid={`bt-fight-${i}`} onClick={() => { if (startBossTrial(i)) setOpen(false); }}>Fight</Button>}
                  {done && !canTicket && <small className="bt-wait" data-testid={`bt-done-${i}`}>Done today<br />resets in {reset}</small>}
                  {canTicket && <Button variant="blue" size="sm" data-testid={`bt-ticket-${i}`} onClick={() => { if (startBossTrial(i)) setOpen(false); }}>Use ticket</Button>}
                </div>
              </div>
            );
          })}
        </div>
        {endings <= 0 && <div className="bt-intro">The portal is asleep.</div>}
      </div>
    </Modal>
  );
};
