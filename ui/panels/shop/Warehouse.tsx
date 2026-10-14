import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { WAREHOUSE_LIMIT } from '../../../constants';
import { ItemSlot } from '../../components/ItemSlot';
import { useDrop } from '../../lib/dnd';
import type { Item } from '../../../types';

const isLoot = (i: Item) => i.type === 'LOOT' || i.type === 'CORE';

/** Town warehouse: 100 permanent storage slots. The bag opens on the left: click or drag items across to store / take them. */
export const WarehouseTab: React.FC = () => {
  const { wh, inv, deposit, withdraw } = useGameStore(useShallow((s) => ({
    wh: s.warehouse, inv: s.inventory, deposit: s.depositItem, withdraw: s.withdrawItem,
  })));
  const [filter, setFilter] = useState('');
  const shown = filter ? wh.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())) : wh;
  const drop = useDrop((d) => d.from === 'BAG', (d) => deposit(d.item.id));
  return (
    <div className="flex flex-col gap-3" data-testid="warehouse-tab">
      <div className="text-[.78rem] leading-snug" style={{ color: 'var(--text-dim)' }}>Click or drag items between your bag and the warehouse. Stored items are safe and never take bag space.</div>
      <div className="flex items-center justify-between gap-2">
        <div className="rpg-label !text-[.72rem]">Storage <span className="rpg-num text-white ml-1">{wh.length}/{WAREHOUSE_LIMIT}</span></div>
        <div className="flex gap-2">
          <input className="wh-search pe" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="wh-btn pe" disabled={!inv.some(isLoot)} onClick={() => inv.filter(isLoot).forEach((i) => deposit(i.id))} data-testid="wh-deposit-loot">Store all loot</button>
        </div>
      </div>
      <div className={`wh-grid drop-zone ${drop.hot ? 'drop-hot' : ''}`} data-testid="wh-store" {...drop.props}>
        {shown.map((it, i) => <ItemSlot key={`${it.id}-${i}`} item={it} fluid size="100%" iconSize="78%" tooltip="none" compare={false} onClick={() => withdraw(it.id)} drag={{ from: 'WAREHOUSE', item: it }} />)}
        {Array.from({ length: filter ? 0 : Math.max(0, WAREHOUSE_LIMIT - wh.length) }).map((_, i) => <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }} />)}
      </div>
    </div>
  );
};
