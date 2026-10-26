// Centred event-style summon window (Korean MMO look): banner list on the left, big banner art + rates +
// summon buttons on the right. Replaces the side panel for the SUMMON shop tab.
import { GRADE_DROP_ODDS } from '../../grade';
import React, { useMemo, useState } from 'react';
import { summonPool } from '../../summonPool';
import { shardItem } from '../../shards';
import { crystalItem } from '../../crystals';
import { ITEMS_POOL, PETS_POOL } from '../../constants';
import { isGear } from '../lib/game';
import { motion } from 'framer-motion';
import { Sparkles, X, Cog, Gem, Info } from '../components/GoldIcons';
import { TechGrid } from './shop/Tech';
import { ItemSlot } from '../components/ItemSlot';
import { GEM_OFFERS, buyGemOffer } from '../../gemShop';
import { useGameStore, makeItemById, questFree, SUMMON_WEIGHTS, SUMMON_CAPS, SUMMON_COST_1, SUMMON_COST_10, GEM_SUMMON_WEIGHTS, GEM_SUMMON_CAPS, SHARD_COST_1, SHARD_COST_10, PITY_LEGEND, PITY_MYTHIC, SUMMON_SUPPLIES } from '../../store';
import { Hexagon } from '../components/GoldIcons';
import { useUiStore } from '../uiStore';
import { GemGlyph } from '../components/SkillIcons';
import { RARITIES } from '../lib/game';
import { RARITY_LIGHT } from '../theme';
import { CloseX } from '../components/CloseX';

const BANNERS = [
  { id: 'GEM', name: 'Gem Altar', sub: 'Premium odds · gems', tone: '#e9b949',
    title: 'Golden Altar', blurb: 'Offer gems for gear and companions with far better odds of Epic, Legendary and Mythic.' },
  { id: 'SHARD', name: 'Crystal Altar', sub: 'Aether crystals', tone: '#a46bff',
    title: 'Aether Crystal Altar', blurb: 'Offer Aether Crystals - mined in the deep, won on adventures, dropped by bosses and given by the Gem Altar. Standard odds.' },
  { id: 'SHOP', name: 'Gem Shop', sub: 'Supplies · shards', tone: '#5ee0f5', title: 'Gem Shop', blurb: '' },
  { id: 'TECH', name: 'Tech House', sub: 'Permanent upgrades', tone: '#7dffb0', title: 'Tech House', blurb: '' },
] as const;
/** Painted anime banners per tab (public/art/ui/banner_<id>.webp); the left third is kept calm for the title. */
const bannerUrl = (id: string): string => `${((import.meta as any).env?.BASE_URL as string) || '/'}art/ui/banner_${id}.webp`;
const PREVIEW_ORDER = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'COMMON'] as const;
/** the supplies a pull can give (store SUMMON_SUPPLIES) */
const SUPPLY_ITEMS = SUMMON_SUPPLIES.map(([id]) => ITEMS_POOL.find((i) => i.id === id)).filter(Boolean) as typeof ITEMS_POOL;
const RATE_NAME: Record<string, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

export const SummonWindow: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const shards = useGameStore((s) => s.crystals ?? 0);   // (Aether Crystals; the name stays for the altar's id)
  const summon = useGameStore((s) => s.summon);
  const pity = useGameStore((s) => s.summonPity);
  const close = useGameStore((s) => s.closeAllUI);
  const setResults = useUiStore((s) => s.setSummonResults);
  const [ratesOpen, setRatesOpen] = useState(false), [rewardsOpen, setRewardsOpen] = useState(false);
  const hero = useGameStore((s) => s.hero);
  const [tab, setTab] = useState<(typeof BANNERS)[number]['id']>(() => (useGameStore.getState().activeShopTab === 'TECH' ? 'TECH' : 'GEM'));
  const gem = tab === 'GEM';
  const pool = useMemo(() => summonPool(tab === 'SHARD' ? 'SHARD' : 'GEM', hero), [hero, tab]);
  const altar = tab === 'GEM' || tab === 'SHARD';
  const drawn = altar ? pity?.[tab] ?? 0 : 0;
  const B = BANNERS.find((b) => b.id === tab)!;
  const W = gem ? GEM_SUMMON_WEIGHTS : SUMMON_WEIGHTS, CAPS = gem ? GEM_SUMMON_CAPS : SUMMON_CAPS;
  const free1 = useGameStore((s) => questFree(s, 'summon')) && gem;   // tutorial "A Gift from the Stars": the first summon is free
  const c1 = free1 ? 0 : gem ? SUMMON_COST_1 : SHARD_COST_1, c10 = gem ? SUMMON_COST_10 : SHARD_COST_10, have = gem ? gems : shards;
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
            <span><Hexagon size={13} color="#c9a8ff" /> {shards.toLocaleString()} Aether Crystals</span>
          </div>
        </div>
        <div className="sw-main">
          <CloseX onClick={close} />
          {tab === 'SHOP' && <><div className="sw-art-strip" style={{ backgroundImage: `url(${bannerUrl('SHOP')})` }}><b>Gem Shop</b><em>Supplies, cores and shards for gems</em></div><GemShopTab /></>}
          {tab === 'TECH' && <div className="sw-tech"><div className="sw-art-strip" style={{ backgroundImage: `url(${bannerUrl('TECH')})` }}><b><Cog size={18} /> Tech House</b><em>Permanent upgrades for every hero and every run</em></div><TechGrid /></div>}
          {altar && (<>
          <div className="sw-banner art" style={{ backgroundImage: `url(${bannerUrl(tab)})` }}>
            <div className="sw-title">{B.title}</div>
            <div className="sw-subt">{B.blurb}</div>
            <div className="sw-gems"><Cur size={18} /> {have.toLocaleString()}</div>
          </div>
          {rewardsOpen && (
            <div className="sw-pop" onClick={() => setRewardsOpen(false)} data-testid="summon-rewards">
              <div className="sw-pop-box sw-pop-wide" onClick={(e) => e.stopPropagation()}>
                <div className="sw-pop-h">Possible rewards · {hero.charAt(0) + hero.slice(1).toLowerCase()}<CloseX onClick={() => setRewardsOpen(false)} /></div>
                <div className="text-[.78rem] muted" style={{ margin: '-.3rem 0 .2rem' }}>Every gear piece rolls its grade when you get it: Low {Math.round(GRADE_DROP_ODDS.low * 100)}% · Mid {Math.round((1 - GRADE_DROP_ODDS.low - GRADE_DROP_ODDS.high) * 100)}% · High {Math.round(GRADE_DROP_ODDS.high * 100)}%.</div>
                <div className="sw-preview rpg-scroll" data-testid="summon-preview">
                  {gem && (   /* (owner) the Gem Altar gives Aether Crystals (1-5) or 3-6 potions instead of shards */
                    <div className="sw-tier" style={{ ['--rc' as any]: '#b98cff' }}>
                      <div className="sw-tier-h">Aether Crystals 1-5 · Potions 3-6<i>3</i></div>
                      <div className="sw-tier-row">{[crystalItem(5), ...makeItemById('potion_hp_big', 6), ...makeItemById('potion_mana_big', 6), ...makeItemById('potion_hp_grand', 6), ...makeItemById('potion_mana_grand', 6)].map((it) => <ItemSlot key={it.id} item={it} size="3.2rem" iconSize="76%" tooltip="buy" compare={false} />)}</div>
                    </div>
                  )}
                  {PREVIEW_ORDER.filter((r) => r !== 'COMMON').map((r) => {
                    // a pull: a supply, else (Gem Altar) crystals / potions or (Crystal Altar) one shard of the rolled tier, else gear (store.summon)
                    const list = gem ? pool.filter((i) => i.rarity === r) : [shardItem(r, 1), ...pool.filter((i) => i.rarity === r)];
                    return (
                      <div key={r} className="sw-tier" style={{ ['--rc' as any]: RARITY_LIGHT[r] }}>
                        <div className="sw-tier-h"><span className="rpg-gem" data-rarity={r} />{RATE_NAME[r]} · {gem ? 'gear' : 'shard or gear'}<i>{list.length}</i></div>
                        <div className="sw-tier-row">{list.map((it) => <ItemSlot key={it.id} item={it} size="3.2rem" iconSize="76%" tooltip="buy" compare={false} />)}</div>
                      </div>
                    );
                  })}
                  <div className="sw-tier" style={{ ['--rc' as any]: '#e8d6a6' }}>
                    <div className="sw-tier-h"><span className="rpg-gem" data-rarity="EPIC" />Supplies · cores and Gem Shop goods<i>{SUPPLY_ITEMS.length}</i></div>
                    <div className="sw-tier-row">{SUPPLY_ITEMS.map((it) => <ItemSlot key={it.id} item={it} size="3.2rem" iconSize="76%" tooltip="buy" compare={false} />)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {ratesOpen && (
            <div className="sw-pop" onClick={() => setRatesOpen(false)} data-testid="summon-rates">
              <div className="sw-pop-box" onClick={(e) => e.stopPropagation()}>
                <div className="sw-pop-h">Summon rates · {B.name}<CloseX onClick={() => setRatesOpen(false)} /></div>
          <div className="sw-rates">
            {RARITIES.map((r) => (
              <div key={r} className="sw-rate" style={{ ['--rc' as any]: RARITY_LIGHT[r] }}>
                <span className="rpg-gem" data-rarity={r} />
                <span className="n">{RATE_NAME[r]}{r === 'COMMON' ? ' (counts as Rare)' : ''}</span>
                <span className="v">{W[r]}%</span>
                {CAPS[r] ? <span className="c">max {CAPS[r]} per 10x</span> : <span className="c" />}
              </div>
            ))}
          </div>
          <div className="sw-note" style={{ display: 'block', margin: '.4rem 0' }}>Every pull: 25% a supply (Upgrade Core I / II, potions, reforging items, Ankh). Otherwise 40% one shard of the rolled tier and 60% a piece of gear (Rare at least). Pity pulls are always gear.</div>
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
              </div>
            </div>
          )}
          <div className="sw-foot">
            <button className="sw-rates-btn pe" onClick={() => setRatesOpen(true)} data-testid="summon-rates-btn"><Info size={14} /> Rates</button>
            <button className="sw-rates-btn pe" onClick={() => setRewardsOpen(true)} data-testid="summon-rewards-btn"><Sparkles size={14} /> View possible rewards</button>
            <span className="sw-note">{gem ? `10x saves ${SUMMON_COST_1 * 10 - c10} gems` : `10x saves ${c1 * 10 - c10} crystals · mine them, win them on adventures and from bosses`}</span>
            <button className="sw-btn" disabled={have < c1} onClick={() => go(1)} data-testid="summon-1">
              Summon x1 <span>{free1 ? 'FREE' : <><Cur size={14} />{c1}</>}</span>
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
  ];
  return (
    <div className="sw-shop rpg-scroll" data-testid="gem-shop">
      <div className="sw-pane-h"><Gem size={18} /> Gem Shop <em>Spend gems on supplies and shard bundles</em></div>
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
