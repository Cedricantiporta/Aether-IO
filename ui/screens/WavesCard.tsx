// Endless Waves card (Set Out window tab) + its run summary line. Data: endlessWaves.ts; records: progress.wavesBest /
// wavesClaimed (per class).
import React from 'react';
import { Waves, Coins, Skull, Crown, Check, Lock } from '../components/GoldIcons';
import { HubBanner } from './TowerHub';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { HERO_META } from '../lib/heroes';
import { WAVE_MILESTONES, milestoneText, waveMilestone, waves } from '../../endlessWaves';
import './daily.css';

export const WavesCard: React.FC = () => {
  const { hero, best, claimed } = useGameStore(useShallow((s) => ({ hero: s.hero, best: s.progress.wavesBest[s.hero] ?? 0, claimed: s.progress.wavesClaimed[s.hero] })));
  const next = WAVE_MILESTONES.find((w) => best < w);
  return (
    <div className="th-waves" data-testid="waves-card">
      <HubBanner tone="waves" icon={<Waves size={30} />} title="Endless Waves" sub={`Survival arena · ${HERO_META[hero].title}`}
        stat={<div className="th-bigstat"><small>Best wave</small><b data-testid="waves-best">{best || '-'}</b></div>} />
      <div className="th-chips">
        <span className="th-chip"><Skull size={12} /> Boss every 5th wave</span>
        <span className="th-chip"><Crown size={12} /> Elites from wave 3</span>
        <span className="th-chip"><Waves size={12} /> Every biome joins in</span>
      </div>
      <div className="th-note waves">
        <span className="th-note-ic"><Coins size={22} color="#ffd24a" /></span>
        <div><b>What you get: gold only</b><span>Monsters drop gold. No gear, no gems, no crystals. No potions or Ankh, healing -40%; the run ends when you fall.</span></div>
      </div>
      <div className="th-sec">First-time prizes <small>{next ? `next: wave ${next}` : 'all earned'} · best is kept per class</small></div>
      <div className="th-track" data-testid="waves-milestones">
        {WAVE_MILESTONES.map((w) => {
          const m = waveMilestone(w)!, got = claimed?.includes(w), reached = best >= w;
          return (
            <div key={w} className={`th-ms ${got ? 'done' : reached ? 'claim' : 'locked'}`}>
              <div className="th-ms-floor">Wave {w}</div>
              <span className="th-ms-ic">{got ? <Check size={20} /> : reached ? <Coins size={22} color="#ffd24a" /> : <Lock size={18} />}</span>
              <div className="th-ms-name">{milestoneText(m)}</div>
              <i className={`th-ms-tag${got ? ' ok' : ''}`}>{got ? 'Claimed' : reached ? 'Clear it once' : `${w - best} waves away`}</i>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** GameOver line after an Endless Waves run (waves is still armed until the hero is back in town). */
export const WavesResultRows: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const best = useGameStore((s) => s.progress.wavesBest[s.hero] ?? 0);
  if (!waves.on) return null;
  return (
    <div className="dc" style={{ marginBottom: '.6rem' }} data-testid="waves-result">
      <div className="dc-reward" style={{ justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: '#ffe69a' }}>Endless Waves · {waves.lastWave} wave{waves.lastWave === 1 ? '' : 's'} cleared</span>
        {waves.lastBest > 0 && waves.lastBest === waves.lastWave && <span className="done">New best!</span>}
      </div>
      <div className="dc-note">Best wave ({HERO_META[hero].title}): {best}</div>
    </div>
  );
};
