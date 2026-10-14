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
  const [amt, setAmt] = useState('');
  const n = Math.max(0, Math.floor(Number(amt.replace(/[^0-9]/g, '')) || 0));
  const [filter, setFilter] = useState('');
  const shown = filter ? wh.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())) : wh;
  const drop = useDrop((d) => d.from === 'BAG', (d) => deposit(d.item.id));
  return (
    <div className="flex flex-col gap-3" data-testid="warehouse-tab">
      <div className="text-[.78rem] leading-snug" style={{ color: 'var(--text-dim)' }}>Click or drag items between your bag and the warehouse. Stored items are safe and never take bag space.</div>
      <div className="wh-gold" data-testid="wh-gold">
        <span className="flex items-center gap-1.5"><CoinGlyph size={20} /><span className="rpg-label !text-[.66rem]">Stored gold</span><span className="rpg-num text-white text-base">{whGold.toLocaleString()}</span></span>
        <div className="flex items-center gap-1.5">
          <input className="wh-search pe !w-[6.5rem]" inputMode="numeric" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} data-testid="wh-gold-amt" />
          <button className="wh-btn pe" disabled={!(n > 0 && gold > 0)} onClick={() => { moveGold(n); setAmt(''); }} data-testid="wh-gold-in">Deposit</button>
          <button className="wh-btn pe" disabled={!(n > 0 && whGold > 0)} onClick={() => { moveGold(-n); setAmt(''); }} data-testid="wh-gold-out">Withdraw</button>
        </div>
        <div className="flex gap-1.5 w-full justify-end">
          <button className="wh-btn pe" disabled={!gold} onClick={() => moveGold(gold)}>Deposit all</button>
          <button className="wh-btn pe" disabled={!whGold} onClick={() => moveGold(-whGold)}>Withdraw all</button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="rpg-label !text-[.72rem]" title="Shared by all your characters">Shared storage <span className="rpg-num text-white ml-1">{wh.length}/{cap}</span></div>
        <div className="flex gap-2">
          <input className="wh-search pe" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="wh-btn pe" disabled={wh.length < 2} onClick={() => { const n = (sortIdx + 1) % SORTS.length; setSortIdx(n); reorderItems('warehouse', sortedItems(wh, SORTS[n], calculateItemCP)); }}
            title={`Sort by ${SORTS[(sortIdx + 1) % SORTS.length].toLowerCase()}`}>Sort</button>
          <button className="wh-btn pe" disabled={!inv.some(isLoot)} onClick={() => inv.filter(isLoot).forEach((i) => deposit(i.id))} data-testid="wh-deposit-loot">Store all loot</button>
        </div>
      </div>
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
    </div>
  );
};
