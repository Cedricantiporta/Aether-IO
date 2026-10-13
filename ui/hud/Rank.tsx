import React from 'react';
import { useGameStore, rankXpNeeded, goldFindMul } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

/** Persistent Hero Rank: round badge + slim xp bar. Colours follow the surface it sits on. */
export const RankPlate: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { rank, xp } = useGameStore(useShallow((s) => ({ rank: s.heroRank, xp: s.rankXp })));
  const need = rankXpNeeded(rank);
  const gold = Math.round((goldFindMul(rank) - 1) * 100);
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="rank-plate"
      {...tip(<SimpleTip title={`Hero Rank ${rank}`} body={`Earn rank xp from every run (even if you fall). Higher ranks unlock better gear and give +${gold}% gold find.`} />)}>
      <div className="rpg-medallion" style={{ ['--mc' as any]: 'var(--ac)', color: 'var(--ac-ink)', width: '2.6rem', height: '2.6rem' }}>
        <span className="rpg-num text-base" data-testid="rank-num">{rank}</span>
      </div>
      <div className="flex-1 min-w-[7rem]">
        <div className="rpg-label flex justify-between"><span>Hero rank</span><span data-testid="rank-xp" className="rpg-num">{xp.toLocaleString()} / {need.toLocaleString()}</span></div>
        <div className="rpg-bar thin mt-1" style={{ ['--bc' as any]: 'var(--ac)', ['--fill' as any]: Math.min(1, xp / need) }}><div className="fill" /></div>
      </div>
    </div>
  );
};
