// Boss Trials window (owner 2026-10-26, restyled 2026-10-31): E at the purple portal on the south-west headland (after the first game clear). Seven rows, one per biome boss.
// Tap a row to open its drops: the odds and the list of every Legendary / Mythic piece of that boss's slot this hero class can get (ItemArt icons), with the Fight button inside.
// Rules / odds live in bossTrials.ts; the fight is store.startBossTrial. Own markup (header row with the X inside, footer fixed, list scrolls); styles in trials.css (soft fills, no outlines).
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore, RARITY_COLOR } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { useGameEvent } from '../hooks/useEvent';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { BOSS_PORTAL } from '../../engine/townData';
import { biomeOf, bossNameIn, BIOMES } from '../../engine/roomDefs';
import { useCoop } from '../../net/coopStore';
import { coopInviteTrial } from '../../net/coop';
import { ItemArt } from '../components/ItemArt';
import { TRIAL_BOSSES, TICKET_NAME, fought, untilReset, trialDayKey, trialPool, TRIAL_MYTHIC, TRIAL_BONUS_ITEM, TRIAL_GRADES } from '../../bossTrials';
import './trials.css';

/** Small painted boss badge: the first letter of the boss on a soft tile (no emoji). */
const BOSS_TINT = ['#7fd06a', '#c9b48a', '#f0cf7a', '#6fc3e8', '#a8dcf2', '#ff9a5c', '#b78cff'];

export const BossTrialsWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
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
  const { trialDay, endings, tickets, startBossTrial, hero } = useGameStore(useShallow((s) => ({
    trialDay: s.progress.trialDay, endings: s.progress.endings, startBossTrial: s.startBossTrial, hero: s.hero,
    tickets: s.inventory.reduce((n, i) => (i.type === 'LOOT' && i.name === TICKET_NAME ? n + (i.quantity || 1) : n), 0),
  })));
  const withFriend = useCoop((s) => s.state === 'connected' && s.role === 'host');
  const friend = useCoop((s) => s.partner?.n ?? '');
  const guestOn = useCoop((s) => s.state === 'connected' && s.role === 'guest');
  const today = trialDayKey();
  // the first boss still open today is expanded when the window opens
  useEffect(() => { if (open) { const k = TRIAL_BOSSES.findIndex((_, i) => !fought(trialDay, i, today)); setSel(k < 0 ? 0 : k); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const drops = useMemo(() => TRIAL_BOSSES.map((t) => ([...trialPool(t.slot, 'MYTHIC', hero).map((it) => ({ it, r: 'MYTHIC' as const })), ...trialPool(t.slot, 'LEGENDARY', hero).map((it) => ({ it, r: 'LEGENDARY' as const }))])), [hero]);
  if (!open) return null;
  const go = (i: number): void => { if (withFriend) { if (coopInviteTrial(i)) setOpen(false); } else if (startBossTrial(i)) setOpen(false); };
  const reset = untilReset();
  const legend = Math.round((1 - TRIAL_MYTHIC) * 100), mythic = Math.round(TRIAL_MYTHIC * 100), pc = (n: number): string => `${Math.round(n * 100)}%`;
  return (
    <div className="bt-shade pe" style={{ zIndex: 160 }} onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="bt-card" data-testid="boss-trials" role="dialog" aria-label="Boss Trials">
        <div className="bt-head">
          <h2>Boss Trials</h2>
          <button type="button" className="bt-x" aria-label="Close" data-testid="bt-close" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="bt-body rpg-scroll">
          <div className="bt-intro">
            <p>Face a guardian alone, at <b>Void strength</b> and a little angrier.</p>
            <p>Each win drops <b>one piece</b> of the boss's slot, <b>Legendary</b> or with a small <b className="mythic">chance of Mythic</b> (very rare: High Mythic), often upgraded, and a <b>{Math.round(TRIAL_BONUS_ITEM * 100)}% chance of a second piece</b>.</p>
            <p>The loot falls on the arena floor: pick it up before you leave. Dying or leaving does not use your daily try.</p>
          </div>
          <div className="bt-list">
            {TRIAL_BOSSES.map((t, i) => {
              const def = biomeOf(t.biome), nm = bossNameIn(def.boss, t.biome), done = fought(trialDay, i, today);
              const canTicket = done && tickets > 0, isOpen = sel === i;
              return (
                <div key={i} className={`bt-row ${done ? 'done' : ''} ${isOpen ? 'open' : ''}`} data-testid={`bt-row-${i}`}>
                  <button type="button" className="bt-top" aria-expanded={isOpen} data-testid={`bt-toggle-${i}`} onClick={() => setSel(isOpen ? -1 : i)}>
                    <div className="bt-ico" style={{ color: BOSS_TINT[i] ?? '#fff', fontWeight: 900, fontSize: '1.2rem' }}>{nm.name.charAt(0)}</div>
                    <div className="bt-main">
                      <b>{nm.name}</b>
                      <span>{nm.title} - {BIOMES[t.biome].name}</span>
                      <em>Drops: {t.slotLabel}</em>
                    </div>
                    {done && <small className="bt-state" data-testid={`bt-done-${i}`}>Won today<br />resets in {reset}</small>}
                    <i className="bt-chev" />
                  </button>
                  {isOpen && (
                    <div className="bt-drops">
                      <div className="bt-odds" data-testid={`bt-odds-${i}`}>
                        <table>
                          <thead><tr><th /><th>Chance</th><th>Low</th><th>Mid</th><th>High</th></tr></thead>
                          <tbody>
                            <tr><td>Legendary</td><td>{legend}%</td>{TRIAL_GRADES.LEGENDARY.map((g, k) => <td key={k}>{pc(g)}</td>)}</tr>
                            <tr className="mythic"><td>Mythic</td><td>{mythic}%</td>{TRIAL_GRADES.MYTHIC.map((g, k) => <td key={k}>{pc(g)}</td>)}</tr>
                          </tbody>
                        </table>
                        <p>Mythic is not guaranteed: it is a <b>chance</b>, and <b>High Mythic</b> is the rarest drop of all ({(TRIAL_MYTHIC * TRIAL_GRADES.MYTHIC[2] * 100).toFixed(1)}% per piece). Second piece: <b>{Math.round(TRIAL_BONUS_ITEM * 100)}%</b>. {t.slot === 'pet' ? 'Pets have no grades.' : 'Low / Mid / High changes the stats of the piece.'}</p>
                      </div>
                      <div className="bt-btns">
                        {!done && <button type="button" className="bt-btn go" disabled={guestOn || endings <= 0} data-testid={`bt-fight-${i}`} onClick={() => go(i)}>{withFriend ? `Fight with ${friend}` : 'Fight'}</button>}
                        {done && !canTicket && <div className="bt-empty">Won today. Resets in {reset}, or use a Boss Trial Ticket.</div>}
                        {canTicket && <button type="button" className="bt-btn blue" disabled={guestOn} data-testid={`bt-ticket-${i}`} onClick={() => go(i)}>Use ticket</button>}
                      </div>
                      <div className="bt-items rpg-scroll" data-testid={`bt-drops-${i}`}>
                        {drops[i].length === 0 && <div className="bt-empty">No pieces for your class in this slot.</div>}
                        {drops[i].map(({ it, r }) => (
                          <div className="bt-it" key={it.id + r}>
                            <div className="art"><ItemArt item={it} size={30} /></div>
                            <div className="nm" style={{ color: RARITY_COLOR[r] }}>{it.name}</div>
                            <span className={`bt-tag ${r}`}>{r === 'MYTHIC' ? 'Mythic' : 'Legendary'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {withFriend && <div className="bt-note" data-testid="bt-coop-note">Co-op: <b>{friend}</b> fights beside you. The boss gets +75% HP, and each of you needs this boss's daily try (or a ticket) and gets his <b>own</b> loot.</div>}
          {guestOn && <div className="bt-note">Your friend hosts this co-op: only they can start a trial for both of you.</div>}
          {endings <= 0 && <div className="bt-note">The portal is asleep.</div>}
        </div>
        <div className="bt-foot" data-testid="bt-tickets">
          <div>Boss Trial Tickets: <b>{tickets}</b></div>
          <span>Rematch after a win today: 300 gems at the Gem Shop</span>
        </div>
      </div>
    </div>
  );
};
