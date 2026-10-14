import React, { useMemo } from 'react';
import { useGameStore, shopPrice } from '../../../store';
import { ITEMS_POOL } from '../../../constants';
import { ItemSlot } from '../../components/ItemSlot';
import { useUiStore } from '../../uiStore';
import { isGear } from '../../lib/game';
import type { Item } from '../../../types';

const SLOT_ORDER = ['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY'];
const SLOT_NAME: Record<string, string> = { WEAPON: 'Weapons', HELMET: 'Helmets', ARMOR: 'Armor', GLOVES: 'Gloves', BOOTS: 'Boots', ACCESSORY: 'Accessories' };

/** Armor shop: basic (Common / Rare) gear for the current class at fixed prices. */
export const ArmoryTab: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const gold = useGameStore((s) => s.gold);
  const setBuy = useUiStore((s) => s.setBuyItem);
  const groups = useMemo(() => {
    const stock = ITEMS_POOL.filter((i) => isGear(i) && (i.rarity === 'COMMON' || i.rarity === 'RARE') && (!i.classType || i.classType === hero));
    const by: Record<string, Item[]> = {};
    for (const it of stock) (by[it.type] ||= []).push(it);
    return SLOT_ORDER.filter((k) => by[k]?.length).map((k) => ({ k, items: by[k].sort((a, b) => (a.rarity === b.rarity ? a.price - b.price : a.rarity === 'COMMON' ? -1 : 1)) }));
  }, [hero]);
  return (
    <div className="flex flex-col gap-4" data-testid="armory-tab">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">Sturdy everyday gear for your class. Nothing fancy: rarer pieces drop in runs, come from the Blacksmith or the Fortune Teller.</div>
      {groups.map(({ k, items }) => (
        <div key={k}>
          <div className="rpg-label mb-2">{SLOT_NAME[k] ?? k}</div>
          <div className="rpg-frame p-4 flex flex-wrap gap-x-4 gap-y-8">
            {items.map((it) => <ItemSlot key={it.id} item={it} size="3.8rem" iconSize={28} price={shopPrice(it)} cantAfford={gold < shopPrice(it)} tooltip="buy" compare onClick={() => setBuy(it)} />)}
          </div>
        </div>
      ))}
    </div>
  );
};
