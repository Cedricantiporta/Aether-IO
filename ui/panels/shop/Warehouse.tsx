import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { WAREHOUSE_LIMIT } from '../../../constants';
import { techLv } from '../../../tech';
import { ItemSlot } from '../../components/ItemSlot';
import { useDrop, reorder } from '../../lib/dnd';
import { DropCell } from '../../components/DropCell';
import { SORTS, sortedItems } from '../../lib/game';
import { calculateItemCP } from '../../../store';
import { CoinGlyph } from '../../components/SkillIcons';
import { Modal } from '../../components/Modal';
import type { Item } from '../../../types';

const isLoot = (i: Item) => i.type === 'LOOT' || i.type === 'CORE';

/** Town warehouse: 100 permanent storage slots. The bag opens on the left: click or drag items across to store / take them. */
export const WarehouseTab: React.FC = () => {
  const { wh, inv, deposit, withdraw, reorderItems } = useGameStore(useShallow((s) => ({
    wh: s.warehouse, inv: s.inventory, deposit: s.depositItem, withdraw: s.withdrawItem, reorderItems: s.reorderItems,
  })));
  const [sortIdx, setSortIdx] = useState(-1);
  const cap = WAREHOUSE_LIMIT + 25 * techLv(useGameStore((s) => s.tech), 'warehouse');
  const { gold, whGold, moveGold } = useGameStore(useShallow((s) => ({ gold: s.gold, whGold: s.warehouseGold, moveGold: s.moveGold })));
  const [gm, setGm] = useState<null | 'IN' | 'OUT'>(null);   // gold popup: deposit / withdraw
  const [filter, setFilter] = useState('');
  const shown = filter ? wh.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())) : wh;
  const drop = useDrop((d) => d.from === 'BAG', (d) => deposit(d.item.id));
  return (
    <div className="flex flex-col gap-3" data-testid="warehouse-tab">
      <div className="text-[.72rem] leading-snug" style={{ color: 'var(--text-dim)' }}>Click or drag items between your bag and the warehouse.</div>
      <div className={`wh-grid slot-grid drop-zone ${drop.hot ? 'drop-hot' : ''}`} data-testid="wh-store" {...drop.props}>
        {shown.map((it, i) => (
          <DropCell key={`${it.id}-${i}`} accept={(d) => d.from === 'WAREHOUSE' && d.item.id !== it.id} onDrop={(d) => reorderItems('warehouse', reorder(wh, d.item.id, it.id))}>
            <ItemSlot item={it} fluid size="100%" iconSize="78%" tooltip="none" compare={false} onClick={() => withdraw(it.id)} drag={{ from: 'WAREHOUSE', item: it }} />
          </DropCell>
        ))}
        {Array.from({ length: filter ? 0 : Math.max(0, cap - wh.length) }).map((_, i) => (
          <DropCell key={`e${i}`} accept={(d) => d.from === 'WAREHOUSE'} onDrop={(d) => reorderItems('warehouse', reorder(wh, d.item.id, null))}>
            <div className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }} />
          </DropCell>
        ))}
      </div>
      {/* bottom bar (owner: compact controls at the bottom): storage tools, then stored gold + deposit / withdraw (popup with Max) */}
      <div className="wh-bottom">
        <div className="flex items-center justify-between gap-1.5">
          <div className="rpg-label !text-[.72rem]" title="Shared by all your characters">Shared storage <span className="rpg-num text-white ml-1">{wh.length}/{cap}</span></div>
          <div className="flex gap-1.5">
            <input className="wh-search pe" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="wh-btn pe" disabled={wh.length < 2} onClick={() => { const n = (sortIdx + 1) % SORTS.length; setSortIdx(n); reorderItems('warehouse', sortedItems(wh, SORTS[n], calculateItemCP)); }}
                title={`Sort by ${SORTS[(sortIdx + 1) % SORTS.length].toLowerCase()}`}>Sort</button>
            <button className="wh-btn pe" disabled={!inv.some(isLoot)} onClick={() => inv.filter(isLoot).forEach((i) => deposit(i.id))} data-testid="wh-deposit-loot">Store all loot</button>
          </div>
        </div>
      <div className="wh-goldbar" data-testid="wh-gold">
        <span className="flex items-center gap-1.5"><CoinGlyph size={18} /><span className="rpg-label !text-[.62rem]">Stored</span><span className="rpg-num text-white text-[.95rem]">{whGold.toLocaleString()}</span></span>
        <span className="flex gap-1.5">
          <button className="wh-btn pe" disabled={!gold} onClick={() => setGm('IN')} data-testid="wh-gold-in">Deposit</button>
          <button className="wh-btn pe" disabled={!whGold} onClick={() => setGm('OUT')} data-testid="wh-gold-out">Withdraw</button>
        </span>
      </div>
      </div>
      {gm && <GoldPopup mode={gm} max={gm === 'IN' ? gold : whGold} onDone={(v) => { if (v > 0) moveGold(gm === 'IN' ? v : -v); setGm(null); }} />}
    </div>
  );
};

/** Amount popup for the warehouse gold: type an amount or press Max. */
const GoldPopup: React.FC<{ mode: 'IN' | 'OUT'; max: number; onDone: (v: number) => void }> = ({ mode, max, onDone }) => {
  const [amt, setAmt] = useState('');
  const n = Math.min(max, Math.max(0, Math.floor(Number(amt.replace(/[^0-9]/g, '')) || 0)));
  return (
    <Modal open portal ribbon title={mode === 'IN' ? 'Deposit gold' : 'Withdraw gold'} tone="gold" width="19rem" z={180} onClose={() => onDone(0)} onConfirm={() => onDone(n)}>
      <div className="flex flex-col gap-2.5" data-testid="wh-gold-popup">
        <div className="text-[.75rem]" style={{ color: 'var(--text-dim)' }}>{mode === 'IN' ? 'In your bag' : 'In the warehouse'}: <b className="rpg-num text-white">{max.toLocaleString()}</b></div>
        <div className="flex gap-1.5">
          <input autoFocus className="wh-search pe flex-1" inputMode="numeric" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onDone(n); }} data-testid="wh-gold-amt" />
          <button className="wh-btn pe" onClick={() => setAmt(String(max))} data-testid="wh-gold-max">Max</button>
        </div>
        <div className="flex gap-1.5 justify-end">
          <button className="wh-btn pe" onClick={() => onDone(0)}>Cancel</button>
          <button className="wh-btn pe" style={{ borderColor: 'var(--gold-dark)', color: 'var(--gold-light)' }} disabled={n <= 0} onClick={() => onDone(n)} data-testid="wh-gold-ok">{mode === 'IN' ? 'Deposit' : 'Withdraw'}</button>
        </div>
      </div>
    </Modal>
  );
};
