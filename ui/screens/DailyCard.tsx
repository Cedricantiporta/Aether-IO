// Daily Trial card (Set Out window tab) + the run summary rows. Today's challenge comes from dailyChallenge.ts (seeded by
// the local date); the countdown to the reset is written to a ref from the shared rAF loop (no per-frame state).
import React, { useRef, useState } from 'react';
import { CalendarDays, Coins, Gem, Sparkles, Flame, Trophy } from 'lucide-react';
import { useGameStore } from '../../store';
import { useRaf } from '../hooks/useRaf';
import { DAILY_FLOORS, DAILY_MODS, daily, dailyBiomeName, dailyFor, dailyMult, dailyReward, dayKey, liveStreak, prevDay, secondsToReset } from '../../dailyChallenge';
import { HERO_META } from '../lib/heroes';
import { timeMMSS } from '../lib/game';
import './daily.css';

const hms = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${m < 10 ? '0' : ''}${m}:${x < 10 ? '0' : ''}${x}`; };

/** Today's key, re-checked once a second (a new day re-renders the card with the new challenge). */
export function useDailyDay(): string {
  const [day, setDay] = useState(dayKey);
  const acc = useRef(0);
  useRaf((dt) => { acc.current += dt; if (acc.current < 1) return; acc.current = 0; const k = dayKey(); if (k !== day) setDay(k); });
  return day;
}

export const DailyCard: React.FC = () => {
  const day = useDailyDay();
  const save = useGameStore((s) => s.progress.daily);
  const hero = useGameStore((s) => s.hero);
  const def = dailyFor(day);
  const reset = useRef<HTMLSpanElement>(null);
  const acc = useRef(1);
  useRaf((dt) => { acc.current += dt; if (acc.current < 1 || !reset.current) return; acc.current = 0; reset.current.textContent = hms(secondsToReset()); });
  const today = save.day === day;
  const claimed = save.claimed === day;
  const streak = liveStreak(save, day);
  // the reward that today's first clear pays (the streak continues if yesterday was completed)
  const nextStreak = claimed ? streak : save.lastDone === prevDay(day) ? save.streak + 1 : 1;
  const rw = dailyReward(nextStreak);
  return (
    <div className="dc" data-testid="daily-card">
      <div className="dc-head">
        <CalendarDays size={24} />
        <div>
          <b>Daily Trial</b>
          <small>{day} · {dailyBiomeName(def)} · {HERO_META[hero].title}</small>
        </div>
        <div className="dc-reset">New trial in<span ref={reset} data-testid="daily-reset">{hms(secondsToReset())}</span></div>
      </div>
      <div className="dc-label">Today's modifiers · score x{dailyMult(def).toFixed(2)}</div>
      <div className="dc-mods" data-testid="daily-mods">
        {def.mods.map((m) => (
          <div key={m} className="dc-mod" style={{ ['--c' as string]: DAILY_MODS[m].color }}><b>{DAILY_MODS[m].name}</b><span>{DAILY_MODS[m].desc}</span></div>
        ))}
      </div>
      <div className="dc-route">Clear <i>{DAILY_FLOORS} arena floors</i>, the last guarded by <i>{def.finale === 'DUEL' ? 'a dark champion (duel)' : 'a champion'}</i>. Score: floors, kills, speed and damage avoided.</div>
      <div className="dc-grid">
        <div className="dc-stat"><em>Today's best</em><b data-testid="daily-best">{today && save.best > 0 ? save.best.toLocaleString() : '-'}</b></div>
        <div className="dc-stat"><em>Streak</em><b data-testid="daily-streak">{streak} {streak === 1 ? 'day' : 'days'}</b></div>
        <div className="dc-stat"><em>Tries today</em><b>{today ? save.tries : 0}</b></div>
      </div>
      <div className="dc-reward" data-testid="daily-reward">
        {claimed ? <span className="done">Reward claimed today · retry for a better score</span> : <>
          <span><Coins size={13} color="#fbd34d" /> {rw.gold.toLocaleString()}</span>
          <span><Gem size={13} color="#5ee0f5" /> {rw.gems}</span>
          <span><Sparkles size={13} color="#60a5fa" /> {rw.shards} Rare shards</span>
          {rw.bonusShards > 0 && <span><Sparkles size={13} color="#c084fc" /> +{rw.bonusShards} Epic</span>}
        </>}
        <span className="streak"><Flame size={12} /> {nextStreak > 1 && !claimed ? `day ${nextStreak} streak bonus` : '+10% per streak day'}</span>
      </div>
      <div className="dc-note"><Trophy size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> Same trial for every player today. Normal difficulty, no Ascension. Rewards once per day.</div>
    </div>
  );
};

/** Run summary lines after a Daily Trial (GameOver screen). Reads the engine's last daily result once on mount. */
export const DailyResultRows: React.FC = () => {
  const r = daily.on ? daily.result : null;
  if (!daily.on) return null;
  if (!r) return <div className="dc-route" style={{ marginBottom: '.5rem', textAlign: 'center' }} data-testid="daily-result">Daily Trial failed. The trial can be retried until the day ends.</div>;
  const p = r.parts;
  return (
    <div className="dc" style={{ marginBottom: '.6rem' }} data-testid="daily-result">
      <div className="dc-reward" style={{ justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: '#ffe69a' }}>Daily Trial · Score {r.score.toLocaleString()}</span>
        {daily.newBest && <span className="done">New best!</span>}
      </div>
      <div className="dc-route" style={{ textAlign: 'center' }}>
        Floors {p.floors.toLocaleString()} + kills {p.kills.toLocaleString()} + time {p.time.toLocaleString()} ({timeMMSS(r.time)}) + no-hit {p.noHit.toLocaleString()} · x{p.mult.toFixed(2)}
      </div>
      <div className="dc-note">{daily.rewarded ? "Today's reward was paid: see the loot feed." : 'Reward already claimed today: score only.'}</div>
    </div>
  );
};
