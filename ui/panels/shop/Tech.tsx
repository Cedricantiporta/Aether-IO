import React from 'react';
import { Backpack, Warehouse, FlaskConical, Coins, BookOpen, HeartPulse } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { TECH, techLv, type TechId } from '../../../tech';
import { CoinGlyph } from '../../components/SkillIcons';

const ICON: Record<TechId, React.ReactNode> = {
  bag: <Backpack size={22} />, warehouse: <Warehouse size={22} />, potion: <FlaskConical size={22} />,
  gold: <Coins size={22} />, xp: <BookOpen size={22} />, vitality: <HeartPulse size={22} />,
};

/** Tech House: permanent upgrades for gold (applied to every hero and every run). */
export const TechTab: React.FC = () => {
  const { tech, gold, buy } = useGameStore(useShallow((s) => ({ tech: s.tech, gold: s.gold, buy: s.buyTech })));
  return (
    <div className="flex flex-col gap-2.5" data-testid="tech-tab">
      <div className="text-[.78rem] leading-snug" style={{ color: 'var(--text-dim)' }}>The tinkerer's permanent improvements. They apply to every hero and every run.</div>
      {TECH.map((d) => {
        const lv = techLv(tech, d.id), max = lv >= d.max, cost = max ? 0 : d.cost(lv), can = !max && gold >= cost;
        return (
          <div key={d.id} className="tech-row" data-testid={`tech-${d.id}`}>
            <span className="tech-ic">{ICON[d.id]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><b className="tech-name">{d.name}</b><span className="tech-lv">Lv {lv}/{d.max}</span></div>
              <div className="tech-per">{d.per} per level</div>
              <div className="tech-pips">{Array.from({ length: d.max }, (_, i) => <i key={i} className={i < lv ? 'on' : ''} />)}</div>
            </div>
            <button className={`rpg-btn rpg-btn-sm ${can ? 'rpg-btn-primary' : ''} tech-buy`} disabled={!can} onClick={() => buy(d.id)}>
              {max ? 'Max' : <><span>Upgrade</span><span className="flex items-center gap-1 rpg-num"><CoinGlyph size={13} />{cost.toLocaleString()}</span></>}
            </button>
          </div>
        );
      })}
    </div>
  );
};
