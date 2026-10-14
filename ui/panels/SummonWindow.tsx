// Centred event-style summon window (Korean MMO look): banner list on the left, big banner art + rates +
// summon buttons on the right. Replaces the side panel for the SUMMON shop tab.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X, Cog, Gem } from 'lucide-react';
import { TechGrid } from './shop/Tech';
import { ItemSlot } from '../components/ItemSlot';
import { GEM_OFFERS, buyGemOffer } from '../../gemShop';
import { useGameStore, SUMMON_WEIGHTS, SUMMON_CAPS, SUMMON_COST_1, SUMMON_COST_10, GEM_SUMMON_WEIGHTS, GEM_SUMMON_CAPS, SHARD_COST_1, SHARD_COST_10, PITY_LEGEND, PITY_MYTHIC } from '../../store';
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
  { id: 'SHOP', name: 'Gem Shop', sub: 'Supplies · shards · companions', tone: '#5ee0f5', title: 'Gem Shop', blurb: '' },
  { id: 'TECH', name: 'Tech House', sub: 'Permanent upgrades', tone: '#7dffb0', title: 'Tech House', blurb: '' },
] as const;
const RATE_NAME: Record<string, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

export const SummonWindow: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const shards = useGameStore((s) => s.materials.COMMON);
  const summon = useGameStore((s) => s.summon);
  const pity = useGameStore((s) => s.summonPity);
  const close = useGameStore((s) => s.closeAllUI);
  const setResults = useUiStore((s) => s.setSummonResults);
  const [tab, setTab] = useState<(typeof BANNERS)[number]['id']>(() => (useGameStore.getState().activeShopTab === 'TECH' ? 'TECH' : 'GEM'));
  const gem = tab === 'GEM';
  const altar = tab === 'GEM' || tab === 'SHARD';
  const drawn = altar ? pity?.[tab] ?? 0 : 0;
  const B = BANNERS.find((b) => b.id === tab)!;
  const W = gem ? GEM_SUMMON_WEIGHTS : SUMMON_WEIGHTS, CAPS = gem ? GEM_SUMMON_CAPS : SUMMON_CAPS;
  const c1 = gem ? SUMMON_COST_1 : SHARD_COST_1, c10 = gem ? SUMMON_COST_10 : SHARD_COST_10, have = gem ? gems : shards;
  const Cur = ({ size }: { size: number }) => (gem ? <GemGlyph size={size} /> : <Hexagon size={size} color="#c9a8ff" />);
  const go = (n: 1 | 10) => { if (!altar) return; const r = summon(n, tab); if (r && r.length) setResults(r, tab); };
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
          {tab === 'SHOP' && <GemShopTab />}
          {tab === 'TECH' && <div className="sw-tech"><div className="sw-pane-h"><Cog size={18} /> Tech House <em>Permanent upgrades for every hero and every run</em></div><TechGrid /></div>}
          {altar && (<>
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
          <div className="sw-pity" data-testid="summon-pity">
            <div className="sw-pity-row" style={{ ['--pc' as any]: RARITY_LIGHT.LEGENDARY }}>
              <span className="n">Guaranteed <b>Legendary</b> in <b className="rpg-num">{PITY_LEGEND - (drawn % PITY_LEGEND)}</b> draws</span>
              <span className="bar"><i style={{ width: `${((drawn % PITY_LEGEND) / PITY_LEGEND) * 100}%` }} /></span>
            </div>
            <div className="sw-pity-row" style={{ ['--pc' as any]: RARITY_LIGHT.MYTHIC }}>
              <span className="n">Every {PITY_MYTHIC}: <b>80% Legendary · 20% Mythic</b> in <b className="rpg-num">{PITY_MYTHIC - (drawn % PITY_MYTHIC)}</b></span>
              <span className="bar"><i style={{ width: `${((drawn % PITY_MYTHIC) / PITY_MYTHIC) * 100}%` }} /></span>
            </div>
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
          </>)}
        </div>
      </motion.div>
    </div>
  );
};

/** Gem Shop tab: offers in the shared square slot grid; clicking one opens the quantity window (gem prices). */
const GemShopTab: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const setBuy = useUiStore((s) => s.setBuyItem);
  const groups: [string, typeof GEM_OFFERS][] = [
    ['Supplies', GEM_OFFERS.filter((o) => o.item.type !== 'PET' && !o.shards)],
    ['Shard bundles', GEM_OFFERS.filter((o) => o.shards)],
    ['Companions', GEM_OFFERS.filter((o) => o.item.type === 'PET')],
  ];
  return (
    <div className="sw-shop rpg-scroll" data-testid="gem-shop">
      <div className="sw-pane-h"><Gem size={18} /> Gem Shop <em>Spend gems on supplies, shard bundles and companions you can otherwise only summon</em></div>
      {groups.map(([title, list]) => (
        <div key={title} className="mb-3">
          <div className="rpg-label mb-2">{title}</div>
          <div className="slot-grid priced">
            {list.map((o) => (
              <ItemSlot key={o.key} item={o.item} fluid size="100%" iconSize="78%" tooltip="buy" compare={false} price={o.gems} gemPrice cantAfford={gems < o.gems}
                qty={o.shards ? o.shards[1] : undefined}
                onClick={() => setBuy(o.item, { price: o.gems, max: o.max, gems: true, onBuy: (n) => { buyGemOffer(o, n); } })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
