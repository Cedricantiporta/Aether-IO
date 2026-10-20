// Tech House: a centred popup (like Summon) with a grid of one-time upgrades bought with gems. Every level of an upgrade
// is its own card (I, II, III ...), unlocked in order; bought cards just read "Owned".
import React from 'react';
import { motion } from 'framer-motion';
import { Cog, X, Lock, Check } from '../../components/GoldIcons';
import { BagGlyph, ItemArtByKey } from '../../components/ItemArt';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { TECH, ROMAN, techLv, type TechId } from '../../../tech';
import { GemGlyph } from '../../components/SkillIcons';
import { tip } from '../../components/Tooltip';
import { SimpleTip } from '../../components/ItemTip';
import { useUiStore } from '../../uiStore';
import { CloseX } from '../../components/CloseX';

/** Painted item art for each upgrade (the same art the bag uses for real items). */
const ART: Record<TechId, React.ReactNode> = {
  bag: <BagGlyph size={44} />, warehouse: <ItemArtByKey k="chest" size={44} />, potion: <ItemArtByKey k="potion_hp_big" size={44} />,
  gold: <ItemArtByKey k="loot_coin_pouch" size={44} />, xp: <ItemArtByKey k="loot_dark_page" size={44} />, vitality: <ItemArtByKey k="loot_golem_heart" size={44} />,
  lantern: (
    <svg width={44} height={44} viewBox="0 0 48 48" aria-hidden>
      <path d="M18 8h12M24 4v4" stroke="#6b5a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="14" y="10" width="20" height="5" rx="2" fill="#4a3a26" />
      <rect x="15" y="15" width="18" height="21" rx="3" fill="#ffd56a" opacity=".9" />
      <ellipse cx="24" cy="26" rx="5" ry="7" fill="#fff4c8" />
      <path d="M15 15v21M33 15v21M24 15v21" stroke="#4a3a26" strokeWidth="2" />
      <rect x="13" y="36" width="22" height="5" rx="2" fill="#4a3a26" />
    </svg>
  ),
};
const TONE: Record<TechId, string> = { bag: '#e9b949', warehouse: '#c9a070', potion: '#ff6b7a', gold: '#ffd24a', xp: '#7fd8ff', vitality: '#7dffb0', lantern: '#ffc85a' };

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
                    <span className="tech-ic">{ART[d.id]}</span>
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
