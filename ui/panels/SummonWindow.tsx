// Centred event-style summon window (Korean MMO look): banner list on the left, big banner art + rates +
// summon buttons on the right. Replaces the side panel for the SUMMON shop tab.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useGameStore, SUMMON_WEIGHTS, SUMMON_CAPS, SUMMON_COST_1, SUMMON_COST_10, GEM_SUMMON_WEIGHTS, GEM_SUMMON_CAPS, SHARD_COST_1, SHARD_COST_10 } from '../../store';
import { Hexagon } from 'lucide-react';
import { useUiStore } from '../uiStore';
import { GemGlyph } from '../components/SkillIcons';
import { RARITIES } from '../lib/game';
import { RARITY_LIGHT } from '../theme';

const BANNERS = [
  { id: 'GEM', name: 'Gem Altar', sub: 'Premium odds · gems', tone: '#e9b949',
    title: 'Golden Altar', blurb: 'Offer gems for gear and companions with far better odds of Epic, Legendary and Mythic.' },
  { id: 'SHARD', name: 'Shard Altar', sub: 'Common shards', tone: '#a46bff',
    title: 'Aether Shard Altar', blurb: 'Feed the altar Common shards from crystals, ore and recycled gear. Standard odds.' },
] as const;
const RATE_NAME: Record<string, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

export const SummonWindow: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const shards = useGameStore((s) => s.materials.COMMON);
  const summon = useGameStore((s) => s.summon);
  const close = useGameStore((s) => s.closeAllUI);
  const setResults = useUiStore((s) => s.setSummonResults);
  const [tab, setTab] = useState<(typeof BANNERS)[number]['id']>('GEM');
  const gem = tab === 'GEM';
  const B = BANNERS.find((b) => b.id === tab)!;
  const W = gem ? GEM_SUMMON_WEIGHTS : SUMMON_WEIGHTS, CAPS = gem ? GEM_SUMMON_CAPS : SUMMON_CAPS;
  const c1 = gem ? SUMMON_COST_1 : SHARD_COST_1, c10 = gem ? SUMMON_COST_10 : SHARD_COST_10, have = gem ? gems : shards;
  const Cur = ({ size }: { size: number }) => (gem ? <GemGlyph size={size} /> : <Hexagon size={size} color="#c9a8ff" />);
  const go = (n: 1 | 10) => { const r = summon(n, tab); if (r && r.length) setResults(r); };
  return (
    <div className="absolute inset-0 grid place-items-center pe sw-backdrop" style={{ zIndex: 45 }} onClick={close} data-testid="summon-window">
      <motion.div className={`sw-win ${gem ? 'gold' : 'purple'}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="sw-side">
          <div className="sw-side-head"><Sparkles size={18} /> Summon</div>
          {BANNERS.map((b) => (
            <button key={b.id} className={`sw-tab ${tab === b.id ? 'on' : ''}`} onClick={() => setTab(b.id)} style={{ ['--tc' as any]: b.tone }} data-testid={`altar-${b.id}`}>
              <b>{b.name}</b><small>{b.sub}</small>
            </button>
          ))}
          <div className="sw-wallet">
            <span><GemGlyph size={14} /> {gems.toLocaleString()} gems</span>
            <span><Hexagon size={13} color="#c9a8ff" /> {shards.toLocaleString()} common shards</span>
          </div>
        </div>
        <div className="sw-main">
          <button className="sw-x" onClick={close} aria-label="Close"><X size={20} /></button>
          <div className="sw-banner">
            <div className="sw-swirl" />
            <div className="sw-orb"><Sparkles size={56} /></div>
            <div className="sw-title">{B.title}</div>
            <div className="sw-subt">{B.blurb}</div>
            <div className="sw-gems"><Cur size={18} /> {have.toLocaleString()}</div>
          </div>
          <div className="sw-rates">
            {RARITIES.map((r) => (
              <div key={r} className="sw-rate" style={{ ['--rc' as any]: RARITY_LIGHT[r] }}>
                <span className="rpg-gem" data-rarity={r} />
                <span className="n">{RATE_NAME[r]}</span>
                <span className="v">{W[r]}%</span>
                {CAPS[r] ? <span className="c">max {CAPS[r]} per 10x</span> : <span className="c" />}
              </div>
            ))}
          </div>
          <div className="sw-foot">
            <span className="sw-note">{gem ? `10x saves ${c1 * 10 - c10} gems` : `10x saves ${c1 * 10 - c10} shards · get shards from crystals, ore and recycling`}</span>
            <button className="sw-btn" disabled={have < c1} onClick={() => go(1)} data-testid="summon-1">
              Summon x1 <span><Cur size={14} />{c1}</span>
            </button>
            <button className="sw-btn gold" disabled={have < c10} onClick={() => go(10)} data-testid="summon-10">
              Summon x10 <span><Cur size={14} />{c10}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
