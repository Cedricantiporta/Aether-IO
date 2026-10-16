import { sellUnit } from '../../../constants';
import React from 'react';
import { useGameStore, shopPrice, SUPPLY_STOCK, questFree } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { Button } from '../../components/Button';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR, isGear } from '../../lib/game';
import type { Rarity } from '../../../types';

const STOCK = SUPPLY_STOCK;

export const SuppliesTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const freeHp = useGameStore((s) => questFree(s, 'potion'));   // tutorial "Stock Up": one Health Potion on the house
  const sales = useGameStore((s) => s.shopSales);
  const inventory = useGameStore((s) => s.inventory);
  const massSell = useGameStore((s) => s.massSell);
  const sellAllLoot = useGameStore((s) => s.sellAllLoot);
  const lootStacks = inventory.filter((i) => i.type === 'LOOT' && !['Reforge Stone', 'Tempering Oil', 'Erasure Scroll'].includes(i.name));
  const lootCount = lootStacks.reduce((n, i) => n + (i.quantity || 1), 0);
  const lootValue = lootStacks.reduce((n, i) => n + sellUnit(i) * (i.quantity || 1), 0);
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
        <ShopGrid>
          {STOCK.map((it) => { const free = freeHp && it.id === 'potion_hp'; return <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={free ? 0 : shopPrice(it)} sale={free ? undefined : sales[it.id]} oldPrice={it.price} cantAfford={!free && gold < shopPrice(it)} tooltip="buy" compare={false} onClick={() => (free ? setBuy(it, { price: 0, max: 1 }) : setBuy(it))} />; })}
        </ShopGrid>
      </div>
    </div>
  );
};
