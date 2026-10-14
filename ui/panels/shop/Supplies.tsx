import React from 'react';
import { useGameStore, shopPrice, SUPPLY_STOCK } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { Button } from '../../components/Button';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR, isGear } from '../../lib/game';
import type { Rarity } from '../../../types';

const STOCK = SUPPLY_STOCK;

export const SuppliesTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const sales = useGameStore((s) => s.shopSales);
  const inventory = useGameStore((s) => s.inventory);
  const massSell = useGameStore((s) => s.massSell);
  const sellAllLoot = useGameStore((s) => s.sellAllLoot);
  const lootStacks = inventory.filter((i) => i.type === 'LOOT');
  const lootCount = lootStacks.reduce((n, i) => n + (i.quantity || 1), 0);
  const lootValue = lootStacks.reduce((n, i) => n + i.price * (i.quantity || 1), 0);
  const setBuy = useUiStore((s) => s.setBuyItem);
  const ask = useUiStore((s) => s.askConfirm);
  const count = (r: Rarity) => inventory.filter((i) => i.rarity === r && isGear(i)).length;

  const quickSell = (r: Rarity) => {
    const go = () => massSell(r);
    if (r === 'EPIC' || r === 'LEGENDARY' || r === 'MYTHIC') {
      ask({ title: 'Are you sure?', body: `Sell ALL ${r.toLowerCase()} gear in your bag? Equipped items are kept. This cannot be undone.`, confirmLabel: 'Sell all', tone: 'danger', onConfirm: go });
    } else go();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="rpg-label mb-2">Provisions</div>
        <div className="slot-grid priced">
          {STOCK.map((it) => <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={shopPrice(it)} sale={sales[it.id]} oldPrice={it.price} cantAfford={gold < shopPrice(it)} tooltip="buy" compare={false} onClick={() => setBuy(it)} />)}
        </div>
      </div>
      <div>
        <div className="rpg-label mb-2">Monster spoils</div>
        <Button className="w-full" variant="green" disabled={lootCount === 0} onClick={sellAllLoot} data-testid="sell-all-loot">
          Sell all loot · {lootCount} items · {lootValue.toLocaleString()} G
        </Button>
      </div>
      <div>
        <div className="rpg-label mb-2">Quick sell (from bag)</div>
        <div className="grid grid-cols-5 gap-1.5">
          {RARITIES.map((r) => (
            <Button key={r} size="sm" disabled={count(r) === 0} onClick={() => quickSell(r)} style={{ borderColor: RARITY_COLOR[r], padding: '.25rem .1rem', flexDirection: 'column', gap: 0, lineHeight: 1.1 }}>
              <span style={{ color: RARITY_COLOR[r], fontSize: '.58rem' }}>{r === 'LEGENDARY' ? 'LEGEND' : r}</span>
              <span className="rpg-num !text-[.7rem] text-white">{count(r)}</span>
            </Button>
          ))}
        </div>
        <div className="rpg-label !text-[.55rem] mt-1.5 opacity-70">Items above rare ask for confirmation. Click any bag item to sell a specific one.</div>
      </div>
    </div>
  );
};
