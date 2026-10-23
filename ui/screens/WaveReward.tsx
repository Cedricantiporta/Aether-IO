import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Upgrade } from '../../types';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { Stars } from '../components/Stars';
import { RARITY_NAME } from '../theme';
import { device } from '../../engine/device';
import { canRarityUp, trendCounts, trendLeader, BUILD_NAME } from '../../engine/runCards';
import { ArcanaGlyph, tallArtKey, tallArtUrl, cardFrameUrl, cardBackdropUrl, RARITIES_ALL, preloadImages } from '../components/UpgradeIcons';

const Card: React.FC<{ opt: Upgrade; i: number; onPick: () => void }> = ({ opt, i, onPick }) => {
  const arcana = opt.rarity === 'LEGENDARY' || opt.rarity === 'MYTHIC' || opt.type === 'DEATH_DEFIANCE' || opt.type === 'SPECIAL';
  const art = tallArtKey(opt);
  const long = opt.name.length > 11;
  return (
    <motion.button className="rw-card tarot" data-rarity={opt.rarity} data-arcana={arcana ? '1' : '0'} onClick={onPick}
      initial={{ y: 40, opacity: 0, scale: .92 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: .1 + i * .08 }}
      whileHover={{ y: -6 }} whileTap={{ scale: .97 }}>
      <span className="tc">
        <span className="tc-win">
          {art
            ? <img className="tc-pic" src={tallArtUrl(art)} alt="" draggable={false} decoding="async" />
            : <>
                <img className="tc-pic bg" src={cardBackdropUrl(opt.rarity)} alt="" draggable={false} decoding="async" />
                <svg className="tc-glyph" viewBox="0 0 100 100" aria-hidden><ArcanaGlyph upgrade={opt} x={14} y={14} size={72} /></svg>
              </>}
        </span>
        <img className="tc-frame" src={cardFrameUrl(opt.rarity)} alt="" draggable={false} decoding="async" />
        {!device.touch && <span className="rw-num rpg-key">{i + 1}</span>}
        <span className={`tc-name${long ? ' long' : ''}`}>{opt.name}</span>
      </span>
      <div className="rw-body flex flex-col items-center gap-1 min-h-0 w-full">
        <Stars rarity={opt.rarity} />
        <span className="rw-rar" {...tip(<SimpleTip title={RARITY_NAME[opt.rarity]} sub={opt.special || opt.type === 'DEATH_DEFIANCE' ? 'Special ability \u00b7 lasts the whole run' : 'Reward rarity \u00b7 higher rarity = stronger bonus'} />)}>{RARITY_NAME[opt.rarity]}</span>
        <div className="rw-title"><span>{opt.name}</span></div>
        <div className="rw-desc">{opt.description}</div>
      </div>
    </motion.button>
  );
};

export const WaveReward: React.FC = () => {
  const { options, select, wave, refresh, polish, refreshes, charges, picks } = useGameStore(useShallow((s) => ({ options: s.upgradeOptions, select: s.selectUpgrade, wave: s.wave, refresh: s.refreshCards, polish: s.polishCard, refreshes: s.cardRefresh, charges: s.cardPolish, picks: s.runPicks })));
  const boss = wave % 10 === 0;
  const lead = useMemo(() => trendLeader(trendCounts(picks)), [picks]);

  useEffect(() => { preloadImages([...RARITIES_ALL.map(cardFrameUrl), ...options.map((o) => tallArtKey(o)).filter((k): k is string => !!k).map(tallArtUrl)]); }, [options]);
  useEffect(() => {   // 1-4 pick a card, Shift+1-4 raise that card's rarity, R refreshes all cards
    const h = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.repeat) { refresh(); return; }
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (!m || !options[+m[1] - 1]) return;
      if (e.shiftKey) polish(options[+m[1] - 1].id); else select(options[+m[1] - 1]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [options, select, refresh, polish]);

  // (owner) Refresh sits on the title line, its right edge lined up with the right edge of the last card
  const rootRef = useRef<HTMLDivElement>(null), refBtn = useRef<HTMLButtonElement>(null), cardsRef = useRef<HTMLDivElement>(null), titleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const root = rootRef.current, b = refBtn.current, cards = cardsRef.current, t = titleRef.current;
      const last = cards?.lastElementChild?.firstElementChild as HTMLElement | null;
      if (!root || !b || !last || !t) return;
      const R = root.getBoundingClientRect(), L = last.getBoundingClientRect(), T = t.getBoundingClientRect();
      // (owner) right edge of the last card, on the title row; with few cards that would cover the title, so it moves right of
      // the title, and when there is no room there either (narrow screens) it drops under the title row
      const bw = b.offsetWidth, titleR = T.right - R.left + 14;
      let x = L.right - R.left - bw, y = T.top - R.top + (T.height - b.offsetHeight) / 2;
      if (x < titleR) { x = titleR; if (x + bw > R.width - 8) { x = L.right - R.left - bw; y = T.bottom - R.top + 4; } }
      b.style.left = `${x}px`; b.style.top = `${y}px`; b.style.visibility = 'visible';
    };
    place();
    const ro = new ResizeObserver(place); if (cardsRef.current) ro.observe(cardsRef.current);
    window.addEventListener('resize', place); const id = window.setTimeout(place, 450);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); window.clearTimeout(id); };
  }, [options.length]);
  return (
    <motion.div ref={rootRef} className="absolute inset-0 pe rw-root" style={{ zIndex: 100 }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="rw-head">
        <div className="rw-title-row">{/* (owner) Refresh sits right of the title; the rarity Upgrade stays under each card */}
          <div ref={titleRef} className="t">{boss ? 'Boss defeated' : 'Room cleared'}</div>
          <button ref={refBtn} style={{ position: 'absolute', visibility: 'hidden' }} className="rw-pill rw-refresh" data-testid="rw-refresh" disabled={refreshes <= 0} onClick={() => refresh()}
            {...tip(<SimpleTip title="Refresh cards" sub="Rerolls every card offered. Refreshes reset each run; Tech House adds more." />)}>
            &#8635; Refresh ({refreshes}){!device.touch && <kbd>R</kbd>}
          </button>
        </div>
        <div className="s">Choose a reward · Depth {Math.max(1, wave)}</div>
        {lead && <div className="rw-trend" data-testid="rw-trend" data-cat={lead}>Build: {BUILD_NAME[lead]} <b>&uarr;</b></div>}
      </div>
      <div ref={cardsRef} className="rw-cards">
        {options.map((opt, i) => (
          <div className="rw-slot" key={opt.id + i}>
            <Card opt={opt} i={i} onPick={() => select(opt)} />
            {charges > 0 && (
              <button className="rw-pill rw-up" data-testid={`rw-up-${i}`} disabled={!canRarityUp(opt) || !!opt.polished} onClick={() => polish(opt.id)}
                {...tip(<SimpleTip title="Upgrade rarity" sub={opt.polished ? 'Already upgraded: a card can be upgraded only once.' : canRarityUp(opt) ? 'Raises this card by one rarity tier (stronger bonus). Uses 1 charge. Once per card.' : 'This card cannot go any higher.'} />)}>
                {opt.polished ? 'Upgraded' : canRarityUp(opt) ? <>&#11014; Upgrade rarity ({charges})</> : 'Top rarity'}{!device.touch && canRarityUp(opt) && !opt.polished && <kbd>&#8679;{i + 1}</kbd>}
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
