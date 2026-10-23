// Tech House: a centred popup (like Summon) with a grid of one-time upgrades bought with gems. Every level of an upgrade
// is its own card (I, II, III ...), unlocked in order; bought cards just read "Owned".
import React from 'react';
import { motion } from 'framer-motion';
import { Cog, X, Lock, Check } from '../../components/GoldIcons';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { TECH, ROMAN, techLv, type TechId } from '../../../tech';
import { GemGlyph } from '../../components/SkillIcons';
import { tip } from '../../components/Tooltip';
import { SimpleTip } from '../../components/ItemTip';
import { useUiStore } from '../../uiStore';
import { CloseX } from '../../components/CloseX';

/** (owner) painted Tech House icons, one per upgrade (public/art/tech/<id>.webp). */
const TECH_ART = (((import.meta as any).env?.BASE_URL as string) || '/') + 'art/tech/';
const TechArt: React.FC<{ id: TechId }> = ({ id }) => (
  <img src={`${TECH_ART}${id}.webp`} alt="" draggable={false} decoding="async" style={{ display: 'block', width: 48, height: 48, objectFit: 'contain', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.5))' }} />
);
const TONE: Record<TechId, string> = { bag: '#e9b949', warehouse: '#c9a070', potion: '#ff6b7a', gold: '#ffd24a', xp: '#7fd8ff', vitality: '#7dffb0', lantern: '#ffc85a', refresh: '#8fd3ff', polish: '#c79bff', lucky: '#ffb347' };

export const TechWindow: React.FC = () => {
  const { gems, close } = useGameStore(useShallow((s) => ({ gems: s.gems, close: s.closeAllUI })));
  return (
    <div className="absolute inset-0 grid place-items-center pe sw-backdrop" style={{ zIndex: 45 }} onClick={close} data-testid="tech-window">
      <motion.div className="tw-win" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="tw-head">
          <span className="tw-title"><Cog size={20} /> Tech House</span>
          <span className="tw-sub">Permanent upgrades for every hero and every run</span>
          <span className="tw-wallet"><GemGlyph size={18} /> {gems.toLocaleString()}</span>
          <CloseX onClick={close} />
        </div>
        <TechGrid />
      </motion.div>
    </div>
  );
};

/** Every tier of every upgrade is its own listing (Bigger Bag I ... V), bought in order: owned tiers read BOUGHT, the
 *  next one is for sale, later ones say which tier to buy first. Painted item art instead of line icons. */
export const TechGrid: React.FC = () => {
  const { tech, gems, buy } = useGameStore(useShallow((s) => ({ tech: s.tech, gems: s.gems, buy: s.buyTech })));
  return (
    <div className="tech-list" data-testid="tech-tab">
      {TECH.map((d) => {
        const lv = techLv(tech, d.id);
        return (
          <div key={d.id} className="tech-row">
            <div className="tech-row-h" style={{ color: TONE[d.id] }}>{d.name} <em>{d.per} per tier · {lv}/{d.max}</em></div>
            <div className="slot-grid priced">
              {Array.from({ length: d.max }, (_, t) => {
                const owned = t < lv, next = t === lv, cost = d.cost(t), can = next && gems >= cost;
                const name = `${d.name} ${ROMAN[t]}`;
                const click = () => {
                  if (owned) return;
                  if (!next) { useGameStore.getState().addNotification(`Buy ${d.name} ${ROMAN[lv]} first.`, '#ffb4a8', 'WARNING'); return; }
                  useUiStore.getState().askConfirm({ title: `Buy ${name}?`, body: `${d.per} for ${cost.toLocaleString()} gems.`, confirmLabel: 'Buy', onConfirm: () => { buy(d.id); } });
                };
                return (
                  <button key={t} className={`tech-slot pe ${owned ? 'owned' : next ? (can ? 'can' : 'cant') : 'later'}`} style={{ ['--tc' as any]: TONE[d.id] }} data-testid={`tech-${d.id}-${t + 1}`}
                    {...tip(<SimpleTip title={name} body={owned ? `${d.per}. Bought.` : next ? `${d.per}. ${cost.toLocaleString()} gems.` : `${d.per}. Buy ${d.name} ${ROMAN[lv]} first.`} />)} onClick={click}>
                    <span className="tech-ic"><TechArt id={d.id} /></span>
                    <b className="tech-lv">{ROMAN[t]}</b>
                    {owned && <span className="tech-owned"><Check size={14} /> Bought</span>}
                    {!owned && !next && <span className="tech-lock"><Lock size={14} /></span>}
                    {!owned && <span className={`slot-price gem ${can ? '' : 'cant'}`} data-testid={next ? `tech-buy-${d.id}` : undefined}>{cost.toLocaleString()}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
