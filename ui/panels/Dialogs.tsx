import React, { useEffect, useState } from 'react';
import { AlertTriangle, Hexagon } from '../components/GoldIcons';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { motion } from 'framer-motion';
import { POTION_STACK_LIMIT } from '../../constants';
import { useGameStore, shopPrice, potionKind, potionCount, potionCapMsg, POTION_CAP, SUMMON_COST_1, SUMMON_COST_10, SHARD_COST_1, SHARD_COST_10 } from '../../store';
import { useUiStore } from '../uiStore';
import { Modal, ConfirmDialog, QtyStepper } from '../components/Modal';
import { Button } from '../components/Button';
import { ItemSlot } from '../components/ItemSlot';
import { RARITY_TEXT, isHighValue, sellPrice, RARITY_RANK, RARITY_COLOR, isGear } from '../lib/game';
import type { Item } from '../../types';

export const SellDialog: React.FC = () => {
  const item = useUiStore((s) => s.sellItem);
  const set = useUiStore((s) => s.setSellItem);
  const sellItem = useGameStore((s) => s.sellItem);
  const [amount, setAmount] = useState(1);
  useEffect(() => setAmount(1), [item]);
  const have = item?.quantity || 1;
  const confirm = () => { if (item) { sellItem(item, amount); set(null); } };
  return (
    <Modal open={!!item} onClose={() => set(null)} title="Sell item" ribbon tone="red" width="25rem" z={220} onConfirm={confirm}>
      {item && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <ItemSlot item={item} size="5rem" iconSize={38} tooltip="none" compare={false} />
          <div className="rpg-title text-lg text-center" style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}{item.level > 1 && isGear(item) && <span className="text-[var(--gold)]"> +{item.level - 1}</span>}</div>
          {isHighValue(item) && <div className="rpg-badge bad"><AlertTriangle size={12} /> High value item</div>}
          {have > 1 && <QtyStepper value={amount} max={have} onChange={setAmount} />}
          <div className="rpg-frame gold w-full text-center py-2">
            <div className="rpg-label !text-[.6rem]">Total value</div>
            <div className="rpg-num text-3xl text-[var(--gold-light)] flex items-center justify-center gap-2"><CoinGlyph size={26} />{(sellPrice(item) * amount).toLocaleString()}</div>
          </div>
          <div className="flex gap-3 w-full">
            <Button className="flex-1" onClick={() => set(null)}>Cancel</Button>
            <Button className="flex-1" variant="danger" onClick={confirm}>Sell</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export const BuyDialog: React.FC = () => {
  const item = useUiStore((s) => s.buyItem);
  const opts = useUiStore((s) => s.buyOpts);
  const set = useUiStore((s) => s.setBuyItem);
  const buyItem = useGameStore((s) => s.buyItem);
  const gold = useGameStore((s) => (opts?.gems ? s.gems : s.gold));   // balance in the offer's currency
  const [amount, setAmount] = useState(1);
  const Coin = opts?.gems ? GemGlyph : CoinGlyph;
  // every purchase (shops, pets, the wandering merchant) goes through this dialog with a quantity, even when only 1 fits
  const unit = item ? opts?.price ?? shopPrice(item) : 0;
  const afford = unit > 0 ? Math.max(0, Math.floor(gold / unit)) : 99;
  const stackable = item ? item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE' : false;
  const limit = opts?.max ?? (stackable ? POTION_STACK_LIMIT : 1);
  const pk = potionKind(item);
  const carried = useGameStore((s) => (pk ? potionCount(s.inventory, pk) : 0));
  const room = pk ? Math.max(1, POTION_CAP - carried) : limit;   // (owner) carry cap: 50 health / 50 mana potions
  const cap = Math.max(1, Math.min(limit, afford, room));
  useEffect(() => setAmount(1), [item]);
  const a = Math.min(amount, cap);
  const total = unit * a;
  const confirm = () => {
    if (!item || gold < total) return;
    if (opts?.onBuy) { opts.onBuy(a); set(null); return; }
    buyItem(item, a); set(null);   // (owner: the dialog always closes after Buy)
  };
  return (
    <Modal open={!!item} onClose={() => set(null)} title="How many?" ribbon tone="gold" width="26rem" z={220} onConfirm={confirm}>
      {item && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="flex items-center gap-3">
            <ItemSlot item={item} size="4.6rem" iconSize={34} tooltip="buy" compare={false} />
            <div>
              <div className="rpg-title text-lg" style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}</div>
              <div className="text-xs text-[var(--text-dim)] max-w-[12rem]">{item.description}</div>
              <div className="rpg-num text-sm text-[var(--gold-light)] mt-1">{unit === 0 ? 'Free' : `${unit.toLocaleString()} ${opts?.gems ? 'gems' : 'G'} each`}</div>
            </div>
          </div>
          <QtyStepper value={a} max={cap} onChange={setAmount} />
          {pk && <div className="text-xs" style={{ color: carried >= POTION_CAP ? '#f87171' : 'var(--text-dim)' }}>Carrying {carried}/{POTION_CAP}{carried >= POTION_CAP ? ` - ${potionCapMsg(pk)}` : ''}</div>}
          <div className="rpg-frame gold w-full text-center py-2">
            <div className="rpg-label !text-[.6rem]">Total cost</div>
            <div className="rpg-num text-3xl flex items-center justify-center gap-2" style={{ color: gold >= total ? '#ffe69a' : '#f87171' }}><Coin size={26} />{total.toLocaleString()}</div>
          </div>
          <div className="flex gap-3 w-full">
            <Button className="flex-1" onClick={() => set(null)}>Close</Button>
            <Button className="flex-1" variant="primary" disabled={gold < total} onClick={confirm}>Buy</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export const GlobalConfirm: React.FC = () => {
  const c = useUiStore((s) => s.confirm);
  const ask = useUiStore((s) => s.askConfirm);
  const [last, setLast] = useState(c);
  useEffect(() => { if (c) setLast(c); }, [c]);
  return (
    <ConfirmDialog open={!!c} title={last?.title ?? ''} body={last?.body ?? ''} confirmLabel={last?.confirmLabel} tone={last?.tone}
      onCancel={() => ask(null)} onConfirm={() => { const cb = c?.onConfirm; ask(null); cb?.(); }} />
  );
};

/** Fast gacha reveal: whole sequence stays well under 2.5 s. */
/** Summon results as tarot cards. First a short ritual (a spinning sigil and a light pillar tinted by the best rarity,
 *  cards flying out face down). Nothing turns on its own (owner): click a card to turn it, or Reveal All once every
 *  card back has landed.
 *  Epic+ cards glow; Legendary / Mythic get an aura and rays. Stays until the player draws again or leaves. */
const ROMAN_N = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const SummonReveal: React.FC = () => {
  const results = useUiStore((s) => s.summonResults);
  const altar = useUiStore((s) => s.summonAltar);
  const set = useUiStore((s) => s.setSummonResults);
  const summon = useGameStore((s) => s.summon);
  const gems = useGameStore((s) => s.gems);
  const shards = useGameStore((s) => s.crystals ?? 0);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'ritual' | 'cards'>('ritual');
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [dealt, setDealt] = useState(false);   // every card back has landed: the Reveal All button appears
  useEffect(() => {
    if (!results) return;
    setPhase('ritual'); setFlipped(results.map(() => false)); setDealt(false);
    const t1 = setTimeout(() => setPhase('cards'), 1500);
    const t2 = setTimeout(() => setDealt(true), 1500 + results.length * 60 + 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [results, round]);
  const revealAll = () => setFlipped((f) => f.map(() => true));
  if (!results) return null;
  const gem = altar === 'GEM';
  const c1 = gem ? SUMMON_COST_1 : SHARD_COST_1, c10 = gem ? SUMMON_COST_10 : SHARD_COST_10, have = gem ? gems : shards;
  const Cur = () => (gem ? <GemGlyph size={15} /> : <Hexagon size={14} color="#c9a8ff" />);
  const again = (n: 1 | 10) => { const r = summon(n, altar); if (r && r.length) { setRound((x) => x + 1); set(r, altar); } };
  const best = results.reduce<Item>((b, i) => (RARITY_RANK[i.rarity] > RARITY_RANK[b.rarity] ? i : b), results[0]);
  const many = results.length > 1;
  const allOpen = flipped.length > 0 && flipped.every(Boolean);
  // ritual colour follows the best pull: red Mythic, gold Legendary, purple Epic, otherwise a calm blue
  const tint = best.rarity === 'MYTHIC' ? '#ff4a3a' : best.rarity === 'LEGENDARY' ? '#ffc93a' : best.rarity === 'EPIC' ? '#b06aff' : '#4a9aff';
  return (
    <motion.div className="absolute inset-0 grid place-items-center pe sm-root" style={{ zIndex: 260, ['--tint' as any]: tint }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="summon-reveal">
      {phase === 'ritual' && (
        <div key={`r${round}`} className="sm-ritual" aria-hidden>
          <div className="sm-pillar" />
          <svg className="sm-sigil" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" /><circle cx="100" cy="100" r="74" /><polygon points="100,12 176,144 24,144" /><polygon points="100,188 24,56 176,56" />
            {Array.from({ length: 12 }, (_, i) => <text key={i} x="100" y="20" transform={`rotate(${i * 30} 100 100)`}>✦</text>)}</svg>
          <div className="sm-flash" />
        </div>
      )}
      {phase === 'cards' && (
        <div className="flex flex-col items-center gap-5">
          <div className="k-title" style={{ fontSize: '1.8rem' }}><i /><span>Summoned</span><i /></div>
          <div key={round} className={`sm-cards ${many ? 'many' : ''}`}>
            {results.map((it, i) => {
              const rk = RARITY_RANK[it.rarity], open = !!flipped[i];
              return (
                <motion.button key={i} className={`sm-card pe ${open ? 'open' : ''} sm-${it.rarity.toLowerCase()}`} style={{ ['--rc' as any]: RARITY_COLOR[it.rarity] }}
                  initial={{ y: 120, scale: 0.3, opacity: 0, rotate: (i - results.length / 2) * 4 }} animate={{ y: 0, scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22, delay: i * 0.06 }}
                  onClick={() => setFlipped((f) => { const n = f.slice(); n[i] = true; return n; })} data-testid="summon-card">
                  <span className="sm-inner">
                    <span className="sm-back"><i className="sm-back-sigil">✦</i><b>{ROMAN_N[i] ?? i + 1}</b></span>
                    <span className="sm-face">
                      {rk >= 3 && <span className="sm-aura" />}
                      {rk >= 5 && <span className="sm-rays" />}
                      <span className="sm-roman">{ROMAN_N[i] ?? i + 1}</span>
                      <span className="sm-window"><ItemSlot item={it} size={many ? '3.6rem' : '5.6rem'} iconSize="82%" tooltip="buy" compare={false} /></span>
                      <span className="sm-name" style={{ color: RARITY_TEXT[it.rarity] }}>{it.name}</span>
                      <span className="stars sm" style={{ ['--n' as any]: rk, ['--rc' as any]: RARITY_COLOR[it.rarity] }} />
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-1" style={{ minHeight: '2.6rem' }}>
            {!allOpen && dealt && <button className="rpg-btn rpg-btn-primary" onClick={revealAll} data-testid="reveal-all">Reveal All</button>}
            {allOpen && <>   {/* (draw again / leave only once every card is turned) */}
              <button className="rpg-btn" disabled={have < c1} onClick={() => again(1)} data-testid="reveal-draw-1">Draw x1 <span className="flex items-center gap-1 rpg-num ml-1"><Cur />{c1}</span></button>
              <button className="rpg-btn rpg-btn-primary" disabled={have < c10} onClick={() => again(10)} data-testid="reveal-draw-10">Draw x10 <span className="flex items-center gap-1 rpg-num ml-1"><Cur />{c10}</span></button>
              <button className="rpg-btn" onClick={() => set(null)} data-testid="reveal-leave">Leave</button>
            </>}
          </div>
        </div>
      )}
    </motion.div>
  );
};
