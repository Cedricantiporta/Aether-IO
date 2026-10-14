import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { WAREHOUSE_LIMIT } from '../../../constants';
import { ItemSlot } from '../../components/ItemSlot';
import type { Item } from '../../../types';

const isLoot = (i: Item) => i.type === 'LOOT' || i.type === 'CORE';

/** Town warehouse: 100 permanent storage slots. Click an item to move it between the warehouse and the bag. */
export const WarehouseTab: React.FC = () => {
  const { wh, inv, max, deposit, withdraw } = useGameStore(useShallow((s) => ({
    wh: s.warehouse, inv: s.inventory, max: s.maxInventorySlots, deposit: s.depositItem, withdraw: s.withdrawItem,
  })));
  const [filter, setFilter] = useState('');
  const shown = filter ? wh.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())) : wh;
  const grid = (items: Item[], slots: number, onPick: (i: Item) => void, id: string) => (
    <div className="wh-grid" data-testid={id}>
      {items.map((it, i) => <ItemSlot key={`${it.id}-${i}`} item={it} fluid size="100%" iconSize="78%" tooltip="none" compare={false} onClick={() => onPick(it)} />)}
      {Array.from({ length: Math.max(0, slots - items.length) }).map((_, i) => <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }} />)}
    </div>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="warehouse-tab">
      <div className="text-[.78rem] leading-snug" style={{ color: 'var(--text-dim)' }}>Items stored here are safe and never count against your bag. Click an item to move it.</div>
      <div className="flex items-center justify-between gap-2">
        <div className="rpg-label !text-[.72rem]">Warehouse <span className="rpg-num text-white ml-1">{wh.length}/{WAREHOUSE_LIMIT}</span></div>
        <input className="wh-search pe" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {grid(shown, filter ? 0 : WAREHOUSE_LIMIT, (it) => withdraw(it.id), 'wh-store')}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="rpg-label !text-[.72rem]">Your bag <span className="rpg-num text-white ml-1">{inv.length}/{max}</span></div>
        <button className="wh-btn pe" onClick={() => inv.filter(isLoot).forEach((i) => deposit(i.id))} data-testid="wh-deposit-loot">Store all loot</button>
      </div>
      {grid(inv, max, (it) => deposit(it.id), 'wh-bag')}
    </div>
  );
};
