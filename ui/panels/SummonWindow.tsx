// Centred event-style summon window (Korean MMO look): banner list on the left, big banner art + rates +
// summon buttons on the right. Replaces the side panel for the SUMMON shop tab.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useGameStore, SUMMON_WEIGHTS, SUMMON_CAPS, SUMMON_COST_1, SUMMON_COST_10 } from '../../store';
import { useUiStore } from '../uiStore';
import { GemGlyph } from '../components/SkillIcons';
import { RARITIES } from '../lib/game';
import { RARITY_LIGHT } from '../theme';

const BANNERS = [
  { id: 'altar', name: 'Aether Altar', sub: 'Gear & companions', tone: '#a46bff' },
  { id: 'rates', name: 'Drop Rates', sub: 'Odds per summon', tone: '#d9b56a' },
] as const;
const RATE_NAME: Record<string, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

export const SummonWindow: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const summon = useGameStore((s) => s.summon);
  const close = useGameStore((s) => s.closeAllUI);
  const setResults = useUiStore((s) => s.setSummonResults);
  const [tab, setTab] = useState<(typeof BANNERS)[number]['id']>('altar');
  const go = (n: 1 | 10) => { const r = summon(n); if (r && r.length) setResults(r); };
  return (
    <div className="absolute inset-0 grid place-items-center pe sw-backdrop" style={{ zIndex: 45 }} onClick={close} data-testid="summon-window">
      <motion.div className="sw-win" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="sw-side">
          <div className="sw-side-head"><Sparkles size={18} /> Summon</div>
          {BANNERS.map((b) => (
            <button key={b.id} className={`sw-tab ${tab === b.id ? 'on' : ''}`} onClick={() => setTab(b.id)} style={{ ['--tc' as any]: b.tone }}>
              <b>{b.name}</b><small>{b.sub}</small>
            </button>
          ))}
        </div>
        <div className="sw-main">
          <button className="sw-x" onClick={close} aria-label="Close"><X size={20} /></button>
          <div className="sw-banner">
            <div className="sw-swirl" />
            <div className="sw-orb"><Sparkles size={56} /></div>
            <div className="sw-title">{tab === 'altar' ? 'Aether Altar' : 'Drop Rates'}</div>
            <div className="sw-subt">{tab === 'altar' ? 'Offer gems and receive gear and companions of any rarity.' : 'Each summon rolls one item. Caps apply per 10x summon.'}</div>
            <div className="sw-gems"><GemGlyph size={18} /> {gems.toLocaleString()}</div>
          </div>
          <div className="sw-rates">
            {RARITIES.map((r) => (
              <div key={r} className="sw-rate" style={{ ['--rc' as any]: RARITY_LIGHT[r] }}>
                <span className="rpg-gem" data-rarity={r} />
                <span className="n">{RATE_NAME[r]}</span>
                <span className="v">{SUMMON_WEIGHTS[r]}%</span>
                {SUMMON_CAPS[r] ? <span className="c">max {SUMMON_CAPS[r]}</span> : <span className="c" />}
              </div>
            ))}
          </div>
          <div className="sw-foot">
            <span className="sw-note">10x saves {SUMMON_COST_1 * 10 - SUMMON_COST_10} gems</span>
            <button className="sw-btn" disabled={gems < SUMMON_COST_1} onClick={() => go(1)} data-testid="summon-1">
              Summon x1 <span><GemGlyph size={14} />{SUMMON_COST_1}</span>
            </button>
            <button className="sw-btn gold" disabled={gems < SUMMON_COST_10} onClick={() => go(10)} data-testid="summon-10">
              Summon x10 <span><GemGlyph size={14} />{SUMMON_COST_10}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
