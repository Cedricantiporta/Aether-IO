// Endless Waves card (Set Out window tab) + its run summary line. Data: endlessWaves.ts; records: progress.wavesBest /
// wavesClaimed (per class).
import React from 'react';
import { Waves, Coins, Skull, Crown } from '../components/GoldIcons';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { HERO_META } from '../lib/heroes';
import { WAVE_MILESTONES, milestoneText, waveMilestone, waves } from '../../endlessWaves';
import './daily.css';

export const WavesCard: React.FC = () => {
  const { hero, best, claimed } = useGameStore(useShallow((s) => ({ hero: s.hero, best: s.progress.wavesBest[s.hero] ?? 0, claimed: s.progress.wavesClaimed[s.hero] })));
  return (
    <div className="dc" data-testid="waves-card">
      <div className="dc-head">
        <Waves size={24} />
        <div>
          <b>Endless Waves</b>
          <small>Survival arena · {HERO_META[hero].title}</small>
        </div>
        <div className="dc-reset">Best wave<span data-testid="waves-best">{best || '-'}</span></div>
      </div>
      <div className="dc-route">One big arena, no exits. Waves swarm in from all sides, each one bigger: monsters of <i>every biome</i> join over time, elites from wave 3, <i>a biome boss every 5th wave</i> and champions in between; from wave 20 several bosses, champions and elites come at once. No potions or Ankh, healing -40%; monsters drop gold and Aether Crystals. The run ends when you fall.</div>
      <div className="dc-label">First-time milestones · {HERO_META[hero].title}</div>
      <div className="dc-mods" data-testid="waves-milestones">
        {WAVE_MILESTONES.map((w) => {
          const m = waveMilestone(w)!, got = claimed?.includes(w);
          return (
            <div key={w} className="dc-mod" style={{ ['--c' as string]: got ? '#9be86a' : best >= w ? '#ffd24a' : '#8a7a5a' }}>
              <b>{w % 10 === 0 ? <Skull size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> : null} Wave {w}</b>
              <span><Coins size={11} style={{ display: 'inline', verticalAlign: '-1px' }} color="#fbbf24" /> {milestoneText(m)}</span>
              <span style={{ marginLeft: 'auto', color: got ? '#9be86a' : '#8f826a', fontSize: '.64rem' }}>{got ? 'Claimed' : 'Clear it once'}</span>
            </div>
          );
        })}
      </div>
      <div className="dc-note"><Crown size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> Best wave is kept per class. Potions and the Ankh work as usual.</div>
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
