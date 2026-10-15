import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Skull, Home, Swords, Clock, Coins, Crown, Zap, Flame, ArrowUpCircle, Trophy, Medal } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Panel, Ribbon } from '../components/Frame';
import { Button } from '../components/Button';
import { timeMMSS } from '../lib/game';
import { FALL_LINES } from '../../lore';
import { DailyResultRows } from './DailyCard';
import { WavesResultRows } from './WavesCard';

const Row: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; record?: boolean; delay: number }> = ({ icon, label, value, record, delay }) => (
  <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
    className="flex items-center gap-3 py-[.4rem] border-b border-black/40 last:border-0">
    <span className="text-[var(--gold)]">{icon}</span>
    <span className="rpg-label flex-1">{label}</span>
    {record && <span className="rpg-badge record !text-[.55rem]">New record</span>}
    <span className="rpg-num text-lg text-[var(--gold-light)]">{value}</span>
  </motion.div>
);

export const GameOver: React.FC = () => {
  const { run, stats, resetGame, hero } = useGameStore(useShallow((s) => ({ run: s.lastRun, stats: s.gameStats, resetGame: s.resetGame, hero: s.hero })));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') resetGame(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [resetGame]);

  const waveRecord = !!run && stats.totalRuns > 1 && run.wave >= stats.highestWave && run.wave > 1;
  const cpRecord = !!run && stats.totalRuns > 1 && run.cp >= stats.highestCP && run.cp > 0;
  const gold = run ? run.goldEarned + run.waveGoldBonus : 0;

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center pe go-root" style={{ zIndex: 120, background: 'radial-gradient(ellipse at center, rgba(70,5,5,.55), rgba(5,0,0,.92))' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8 }}>
      <div className="flex flex-col items-center go-wrap" style={{ width: '31rem', maxWidth: '94vw' }}>
        <motion.div initial={{ scale: 2.4, opacity: 0, y: -20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 130, damping: 14, delay: .2 }} className="text-center z-10 mb-1 go-head">
          <Skull size={56} color="#ff6b5e" style={{ margin: '0 auto', filter: 'drop-shadow(0 0 18px #f00)' }} />
          <div className="rpg-logo" style={{ fontSize: '2.3rem', whiteSpace: 'nowrap', backgroundImage: 'linear-gradient(105deg, transparent 42%, rgba(255,255,255,.7) 50%, transparent 58%), linear-gradient(180deg,#ffd0c8,#e0554a 48%,#5e0f12 52%,#c93b3b)' }}>{run?.victory ? 'Spoils banked' : 'You have fallen'}</div>
          {!run?.victory && <div className="go-fall">{FALL_LINES[(run?.kills ?? 0) % FALL_LINES.length]}</div>}
        </motion.div>
        <Panel className="w-full p-5 pt-8">
          {run && (
            <>
              <div className="flex justify-center mb-3 -mt-1">
                <Ribbon tone="red" className="!text-[1rem]">Depth {run.wave} · Level {run.level}</Ribbon>
              </div>
              <DailyResultRows />
              <WavesResultRows />
              <div className="rpg-frame px-3 py-1 go-rows">
                {run.towerFloor ? <Row delay={.46} icon={<Crown size={16} />} label="Tower floor cleared" value={run.towerFloor} /> : null}
                <Row delay={.5} icon={<Crown size={16} />} label="Depth reached" value={run.wave} record={waveRecord} />
                <Row delay={.58} icon={<Swords size={16} />} label="Enemies slain" value={run.kills.toLocaleString()} />
                <Row delay={.66} icon={<Flame size={16} />} label="Elites / bosses" value={`${run.eliteKills} / ${run.bossKills}`} />
                <Row delay={.74} icon={<Zap size={16} />} label="Damage dealt" value={Math.round(run.damageDealt).toLocaleString()} />
                <Row delay={.82} icon={<Clock size={16} />} label="Time survived" value={timeMMSS(run.time)} />
                <Row delay={.9} icon={<Trophy size={16} />} label="Combat power" value={run.cp.toLocaleString()} record={cpRecord} />
                <Row delay={.98} icon={<Coins size={16} />} label={`Gold earned (+${run.waveGoldBonus} wave bonus)`} value={`+${gold.toLocaleString()}`} />
                <Row delay={1.02} icon={<Medal size={16} />} label={run.rankUps > 0 ? `XP earned (LEVEL UP! now Lv ${run.rank})` : 'XP earned'} value={`+${run.rankXpGained.toLocaleString()}`} />
                <Row delay={1.06} icon={<ArrowUpCircle size={16} />} label="Runs completed" value={stats.totalRuns} />
              </div>
            </>
          )}
          <div className="flex gap-3 mt-5">
            <Button className="flex-1 whitespace-nowrap !px-3" variant="primary" size="lg" onClick={resetGame} pulse data-testid="to-village"><Home size={18} /> Return to town</Button>
          </div>
          <div className="text-center rpg-label mt-3 !text-[.6rem]">Playing as {hero}<span className="kbd-hint"> · press Enter to return to town</span></div>
        </Panel>
      </div>
    </motion.div>
  );
};
