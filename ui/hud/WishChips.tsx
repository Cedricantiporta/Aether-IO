// Small buff chips for today's Wishing Fountain luck (owner 2026-10-31): one pill per activity still waiting to be used
import '../screens/wish.css';
// ("Run", "Fishing", "Mining", "Crafting"), with a tooltip. Selector-only (the save changes rarely); the day check re-runs once a minute.
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { dayKey } from '../../dailyChallenge';
import { WISH_BY_ID, WISH_TARGET, fxLines, liveTargets, type WishId } from '../../wishing';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

export const WishChips: React.FC = () => {
  const wish = useGameStore((s) => s.progress.wish);
  const inTown = useGameStore((s) => s.status === GameStatus.MENU);
  const [day, setDay] = useState(dayKey);
  useEffect(() => { const t = setInterval(() => setDay(dayKey()), 60000); return () => clearInterval(t); }, []);
  const live = liveTargets(wish, day);
  if (!live.length || !wish) return null;
  const def = WISH_BY_ID[wish.id as WishId];
  return (
    <div className="wish-chips" data-testid="wish-chips">
      {live.map((t) => {
        if (!inTown && t !== 'RUN') return null;   // in a run only the run buff matters (it was consumed at the start, so this is rarely shown)
        const n = t === 'FISH' ? ` x${wish.fishLeft}` : t === 'CRAFT' ? ` x${wish.craftLeft}` : '';
        return (
          <span key={t} className="wish-chip" data-testid={`wish-chip-${t}`} style={{ ['--wc' as string]: def.color }}
            {...tip(<SimpleTip title={def.name} sub={`Wish luck · ${WISH_TARGET[t].label}`} color={def.color} body={`${fxLines(t, def.fx[t]!).join(', ')}. Lasts ${WISH_TARGET[t].when}. Ends at tomorrow's reset.`} />)}>
            <i />{def.name.split(' ')[0]} · {WISH_TARGET[t].label}{n}
          </span>
        );
      })}
    </div>
  );
};
