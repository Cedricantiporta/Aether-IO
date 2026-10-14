// Tech House: a centred popup (like Summon) with a grid of one-time upgrades bought with gems. Every level of an upgrade
// is its own card (I, II, III ...), unlocked in order; bought cards just read "Owned".
import React from 'react';
import { motion } from 'framer-motion';
import { Backpack, Warehouse, FlaskConical, Coins, BookOpen, HeartPulse, Cog, X, Lock, Check } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { TECH, ROMAN, techLv, type TechId } from '../../../tech';
import { GemGlyph } from '../../components/SkillIcons';
import { tip } from '../../components/Tooltip';
import { SimpleTip } from '../../components/ItemTip';
import { useUiStore } from '../../uiStore';

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

/** The upgrades as square slots (same grid as the bag and shops): one slot per upgrade showing its next level; click to
 *  buy (confirm), hover for the details. Maxed upgrades read MAX. */
export const TechGrid: React.FC = () => {
  const { tech, gems, buy } = useGameStore(useShallow((s) => ({ tech: s.tech, gems: s.gems, buy: s.buyTech })));
  return (
    <div className="slot-grid priced" data-testid="tech-tab">
      {TECH.map((d) => {
        const lv = techLv(tech, d.id), max = lv >= d.max, cost = max ? 0 : d.cost(lv), can = !max && gems >= cost;
        const name = `${d.name} ${ROMAN[Math.min(lv, d.max - 1)]}`;
        return (
          <button key={d.id} className={`tech-slot pe ${max ? 'max' : can ? 'can' : 'cant'}`} style={{ ['--tc' as any]: TONE[d.id] }} data-testid={`tech-${d.id}-${lv + 1}`}
            {...tip(<SimpleTip title={max ? `${d.name} (max)` : name} body={`${d.per}. Level ${lv} / ${d.max}.`} />)}
            onClick={() => { if (!max) useUiStore.getState().askConfirm({ title: `Buy ${name}?`, body: `${d.per} for ${cost.toLocaleString()} gems.`, confirmLabel: 'Buy', onConfirm: () => { buy(d.id); } }); }}>
            <span className="tech-ic">{ICON[d.id]}</span>
            <b className="tech-lv">{max ? 'MAX' : ROMAN[lv]}</b>
            <span className="tech-pips">{Array.from({ length: d.max }, (_, i) => <i key={i} className={i < lv ? 'on' : ''} />)}</span>
            {!max && <span className={`slot-price gem ${can ? '' : 'cant'}`} data-testid={`tech-buy-${d.id}`}>{cost.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
};
