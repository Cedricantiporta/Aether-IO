import React from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { useMerchant, buyMerchant } from '../../../engine/systems/merchant';
import { useUiStore } from '../../uiStore';

/** Travelling merchant (run room): potions + three random pieces at a markup, one on sale. Stock lives in engine/systems/merchant. */
export const MerchantTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const items = useMerchant((s) => s.items);
  const setBuy = useUiStore((s) => s.setBuyItem);
  return (
    <div className="flex flex-col gap-4" data-testid="merchant-tab">
      <div className="rpg-label">A wandering trader sets up shop. Prices include a travelling markup; one item is on sale. The stock is gone when you leave the room.</div>
      <div className="rpg-frame p-4 flex flex-wrap gap-x-4 gap-y-9">
        {items.map((e, i) => (
          <ItemSlot key={e.item.id} item={e.left > 0 ? e.item : null} size="3.8rem" iconSize={28} price={e.left > 0 ? e.price : undefined}
            sale={e.sale && e.left > 0 ? 1 - e.price / e.oldPrice : undefined} oldPrice={e.sale ? e.oldPrice : undefined}
            qty={e.left > 1 ? e.left : undefined} cantAfford={gold < e.price} tooltip="buy" compare onClick={e.left > 0 ? () => setBuy(e.item, { price: e.price, max: e.left, onBuy: (n) => { for (let k = 0; k < n && buyMerchant(i); k++); } }) : undefined}
            emptyLabel={e.left <= 0 ? 'Sold' : undefined} />
        ))}
        {items.length === 0 && <div className="rpg-label">The merchant has nothing left.</div>}
      </div>
    </div>
  );
};
