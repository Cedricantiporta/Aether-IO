import React, { useEffect, useState } from 'react';
import { AlertTriangle, Hexagon } from 'lucide-react';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { motion } from 'framer-motion';
import { POTION_STACK_LIMIT } from '../../constants';
import { useGameStore, shopPrice, SUMMON_COST_1, SUMMON_COST_10, SHARD_COST_1, SHARD_COST_10 } from '../../store';
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
  const set = useUiStore((s) => s.setBuyItem);
  const buyItem = useGameStore((s) => s.buyItem);
  const gold = useGameStore((s) => s.gold);
  const [amount, setAmount] = useState(1);
  const afford = item ? Math.max(0, Math.floor(gold / shopPrice(item))) : 0;
  const stackable = item ? item.type === 'POTION' || item.type === 'CORE' || item.type === 'REVIVE' : false;
  const cap = Math.max(1, Math.min(stackable ? POTION_STACK_LIMIT : 1, afford));
  useEffect(() => setAmount(1), [item]);
  const a = Math.min(amount, cap);
  const total = item ? shopPrice(item) * a : 0;
  const confirm = () => { if (item && gold >= total) { buyItem(item, a); if (!(item.type === 'POTION' || item.type === 'CORE')) set(null); } };
  return (
    <Modal open={!!item} onClose={() => set(null)} title="How many?" ribbon tone="gold" width="26rem" z={220} onConfirm={confirm}>
      {item && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="flex items-center gap-3">
            <ItemSlot item={item} size="4.6rem" iconSize={34} tooltip="buy" compare={false} />
            <div>
              <div className="rpg-title text-lg" style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}</div>
              <div className="text-xs text-[var(--text-dim)] max-w-[12rem]">{item.description}</div>
              <div className="rpg-num text-sm text-[var(--gold-light)] mt-1">{shopPrice(item).toLocaleString()} G each</div>
            </div>
          </div>
          {stackable && <QtyStepper value={a} max={cap} onChange={setAmount} />}
          <div className="rpg-frame gold w-full text-center py-2">
            <div className="rpg-label !text-[.6rem]">Total cost</div>
            <div className="rpg-num text-3xl flex items-center justify-center gap-2" style={{ color: gold >= total ? '#ffe69a' : '#f87171' }}><CoinGlyph size={26} />{total.toLocaleString()}</div>
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
/** Summon results. Common / Rare just appear; Epic gets a medium purple glow, Legendary a big gold one, Mythic a huge red
 *  aura radiating from its border. It stays until the player draws again (x1 / x10 on the same altar) or leaves. */
export const SummonReveal: React.FC = () => {
  const results = useUiStore((s) => s.summonResults);
  const altar = useUiStore((s) => s.summonAltar);
  const set = useUiStore((s) => s.setSummonResults);
  const summon = useGameStore((s) => s.summon);
  const gems = useGameStore((s) => s.gems);
  const shards = useGameStore((s) => s.materials.COMMON);
  const [round, setRound] = useState(0);
  if (!results) return null;
  const gem = altar === 'GEM';
  const c1 = gem ? SUMMON_COST_1 : SHARD_COST_1, c10 = gem ? SUMMON_COST_10 : SHARD_COST_10, have = gem ? gems : shards;
  const Cur = () => (gem ? <GemGlyph size={15} /> : <Hexagon size={14} color="#c9a8ff" />);
  const again = (n: 1 | 10) => { const r = summon(n, altar); if (r && r.length) { setRound((x) => x + 1); set(r, altar); } };
  const best = results.reduce<Item>((b, i) => (RARITY_RANK[i.rarity] > RARITY_RANK[b.rarity] ? i : b), results[0]);
  const many = results.length > 1;
  const step = many ? 0.1 : 0;
  const bestRank = RARITY_RANK[best.rarity];
  return (
    <motion.div className="absolute inset-0 grid place-items-center pe" style={{ zIndex: 260, background: 'radial-gradient(circle, rgba(20,8,30,.7), rgba(3,1,6,.93))' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="summon-reveal">
      {bestRank >= 3 && <motion.div key={`f${round}`} className="absolute inset-0 pointer-events-none" initial={{ opacity: .9 }} animate={{ opacity: 0 }} transition={{ duration: .7 }} style={{ background: `radial-gradient(circle, ${RARITY_COLOR[best.rarity]}, transparent 65%)` }} />}
      <div className="flex flex-col items-center gap-6">
        <div className="k-title" style={{ fontSize: '2rem' }}><i /><span>Summoned</span><i /></div>
        <div key={round} className="flex flex-wrap justify-center gap-6" style={{ maxWidth: many ? '48rem' : undefined, perspective: '1000px' }}>
          {results.map((it, i) => {
            const rk = RARITY_RANK[it.rarity], fancy = rk >= 3;
            return (
              <motion.div key={i} className={`relative flex flex-col items-center gap-2 sr-card sr-${it.rarity.toLowerCase()}`}
                initial={fancy ? { rotateY: 90, scale: .4, opacity: 0 } : { opacity: 0 }} animate={fancy ? { rotateY: 0, scale: 1, opacity: 1 } : { opacity: 1 }}
                transition={fancy ? { type: 'spring', stiffness: 320, damping: 20, delay: .15 + i * step } : { duration: .2, delay: .1 + i * step }}>
                {fancy && <span className="sr-aura" />}
                {rk >= 5 && <><span className="sr-ray" /><span className="sr-ray r2" /></>}
                <ItemSlot item={it} size={many ? '4.6rem' : '7rem'} iconSize={many ? 34 : 54} tooltip="buy" compare={false} />
                <div className="text-center font-bold text-[.72rem] leading-tight max-w-[6rem] text-outline" style={{ color: RARITY_TEXT[it.rarity] }}>{it.name}</div>
              </motion.div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button className="rpg-btn" disabled={have < c1} onClick={() => again(1)} data-testid="reveal-draw-1">Draw x1 <span className="flex items-center gap-1 rpg-num ml-1"><Cur />{c1}</span></button>
          <button className="rpg-btn rpg-btn-primary" disabled={have < c10} onClick={() => again(10)} data-testid="reveal-draw-10">Draw x10 <span className="flex items-center gap-1 rpg-num ml-1"><Cur />{c10}</span></button>
          <button className="rpg-btn" onClick={() => set(null)} data-testid="reveal-leave">Leave</button>
        </div>
      </div>
    </motion.div>
  );
};
