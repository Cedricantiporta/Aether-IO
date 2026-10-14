import React from 'react';
import { Medal } from 'lucide-react';
import { useGameStore, rankXpNeeded, goldFindMul } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

/** Persistent Hero Rank: medallion + xp bar. */
export const RankPlate: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { rank, xp } = useGameStore(useShallow((s) => ({ rank: s.heroRank, xp: s.rankXp })));
  const need = rankXpNeeded(rank);
  const gold = Math.round((goldFindMul(rank) - 1) * 100);
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="rank-plate"
      {...tip(<SimpleTip title={`Level ${rank}`} body={`Each class levels up on its own from the xp you earn in runs. Higher levels unlock skills, better gear and give +${gold}% gold find.`} />)}>
      <div className="rpg-medallion" style={{ ['--mc' as any]: '#c8962e', width: '3.2rem', height: '3.2rem' }}>
        <div className="flex flex-col items-center leading-none"><Medal size={14} /><span className="rpg-num text-base" data-testid="rank-num">{rank}</span></div>
      </div>
      <div className="flex-1 min-w-[8rem]">
        <div className="rpg-label !text-[.6rem] flex justify-between"><span>Level</span><span data-testid="rank-xp" className="rpg-num text-white">{xp.toLocaleString()} / {need.toLocaleString()}</span></div>
        <div className="rpg-bar thin" style={{ ['--bc' as any]: '#e9b949', ['--fill' as any]: Math.min(1, xp / need) }}><div className="fill" /></div>
      </div>
    </div>
  );
};
