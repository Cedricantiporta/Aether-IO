import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Home } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../components/Button';
import { timeMMSS } from '../lib/game';

const Tile: React.FC<{ label: string; value: React.ReactNode; record?: boolean; delay: number }> = ({ label, value, record, delay }) => (
  <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay, type: 'spring', stiffness: 300, damping: 26 }} className="go-tile relative">
    <div className="v">{value}</div>
    <div className="l">{label}</div>
    {record && <span className="rpg-badge record absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap">New record</span>}
  </motion.div>
);

export const GameOver: React.FC = () => {
  const { run, stats, startGame, resetGame, hero } = useGameStore(useShallow((s) => ({ run: s.lastRun, stats: s.gameStats, startGame: s.startGame, resetGame: s.resetGame, hero: s.hero })));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') startGame(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [startGame]);

  const waveRecord = !!run && stats.totalRuns > 1 && run.wave >= stats.highestWave && run.wave > 1;
  const cpRecord = !!run && stats.totalRuns > 1 && run.cp >= stats.highestCP && run.cp > 0;
  const gold = run ? run.goldEarned + run.waveGoldBonus : 0;

  return (
    <motion.div className="absolute inset-0 pe go-root" style={{ zIndex: 120 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .5 }}>
      <motion.div className="go-card paper" initial={{ y: 30, scale: .96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 24, delay: .1 }}>
        <div className="px-4 pt-4 pb-2 text-center flex-none">
          <div className="text-2xl font-extrabold leading-tight">You have fallen</div>
          {run && <div className="text-sm font-semibold text-[var(--fg-2)] mt-0.5">Wave {run.wave} · Level {run.level} · {hero.charAt(0) + hero.slice(1).toLowerCase()}</div>}
        </div>
        <div className="px-4 py-2 rpg-scroll flex-1 min-h-0">
          {run && (
            <div className="go-grid pt-2">
              <Tile delay={.2} label="Highest wave" value={run.wave} record={waveRecord} />
              <Tile delay={.25} label="Enemies slain" value={run.kills.toLocaleString()} />
              <Tile delay={.3} label="Time survived" value={timeMMSS(run.time)} />
              <Tile delay={.35} label="Damage dealt" value={Math.round(run.damageDealt).toLocaleString()} />
              <Tile delay={.4} label="Combat power" value={run.cp.toLocaleString()} record={cpRecord} />
              <Tile delay={.45} label={`Gold (+${run.waveGoldBonus} bonus)`} value={`+${gold.toLocaleString()}`} />
              <Tile delay={.5} label="Elites / bosses" value={`${run.eliteKills} / ${run.bossKills}`} />
              <Tile delay={.55} label={run.rankUps > 0 ? `Rank xp (rank up! now ${run.rank})` : 'Hero rank xp'} value={`+${run.rankXpGained.toLocaleString()}`} />
              <Tile delay={.6} label="Runs completed" value={stats.totalRuns} />
            </div>
          )}
        </div>
        <div className="flex gap-3 p-4 flex-none flex-wrap">
          <Button className="flex-1" variant="primary" size="lg" onClick={resetGame} pulse data-testid="to-village"><Home size={18} /> Village</Button>
          <Button className="flex-1" size="lg" onClick={startGame}><RotateCcw size={18} /> Defend again</Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
