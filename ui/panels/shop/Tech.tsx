// Tech House: a centred popup (like Summon) with a grid of one-time upgrades bought with gems. Every level of an upgrade
// is its own card (I, II, III ...), unlocked in order; bought cards just read "Owned".
import React from 'react';
import { motion } from 'framer-motion';
import { Backpack, Warehouse, FlaskConical, Coins, BookOpen, HeartPulse, Cog, X, Lock, Check } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { TECH, ROMAN, techLv, type TechId } from '../../../tech';
import { GemGlyph } from '../../components/SkillIcons';

const ICON: Record<TechId, React.ReactNode> = {
  bag: <Backpack size={30} />, warehouse: <Warehouse size={30} />, potion: <FlaskConical size={30} />,
  gold: <Coins size={30} />, xp: <BookOpen size={30} />, vitality: <HeartPulse size={30} />,
};
const TONE: Record<TechId, string> = { bag: '#e9b949', warehouse: '#c9a070', potion: '#ff6b7a', gold: '#ffd24a', xp: '#7fd8ff', vitality: '#7dffb0' };

export const TechWindow: React.FC = () => {
  const { gems, close } = useGameStore(useShallow((s) => ({ gems: s.gems, close: s.closeAllUI })));
  return (
    <div className="absolute inset-0 grid place-items-center pe sw-backdrop" style={{ zIndex: 45 }} onClick={close} data-testid="tech-window">
      <motion.div className="tw-win" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="tw-head">
          <span className="tw-title"><Cog size={20} /> Tech House</span>
          <span className="tw-sub">Permanent upgrades for every hero and every run</span>
          <span className="tw-wallet"><GemGlyph size={18} /> {gems.toLocaleString()}</span>
          <button className="sw-x" onClick={close} aria-label="Close"><X size={20} /></button>
        </div>
        <TechGrid />
      </motion.div>
    </div>
  );
};

/** The upgrade cards (shared by the Tech window and the Summon window's Tech House tab). */
export const TechGrid: React.FC = () => {
  const { tech, gems, buy } = useGameStore(useShallow((s) => ({ tech: s.tech, gems: s.gems, buy: s.buyTech })));
  return (
    <div className="tw-grid rpg-scroll" data-testid="tech-tab">
      {TECH.flatMap((d) => {
        const lv = techLv(tech, d.id);
        return Array.from({ length: d.max }, (_, i) => {
          const owned = i < lv, next = i === lv, cost = d.cost(i), can = next && gems >= cost;
          return (
            <div key={`${d.id}${i}`} className={`tw-card ${owned ? 'owned' : next ? 'next' : 'locked'}`} style={{ ['--tc' as any]: TONE[d.id] }} data-testid={`tech-${d.id}-${i + 1}`}>
              <span className="tw-ic">{ICON[d.id]}<b>{ROMAN[i]}</b></span>
              <div className="tw-name">{d.name} {ROMAN[i]}</div>
              <div className="tw-per">{d.per}</div>
              {owned ? <div className="tw-owned"><Check size={14} /> Owned</div>
                : next ? <button className={`rpg-btn rpg-btn-sm ${can ? 'rpg-btn-primary' : ''} tw-buy`} disabled={!can} onClick={() => buy(d.id)} data-testid={`tech-buy-${d.id}`}><GemGlyph size={14} /> {cost.toLocaleString()}</button>
                  : <div className="tw-lock"><Lock size={12} /> Needs {ROMAN[i - 1]}</div>}
            </div>
          );
        });
      })}
    </div>
  );
};
