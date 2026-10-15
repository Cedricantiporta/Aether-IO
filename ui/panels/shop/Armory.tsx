import React, { useMemo } from 'react';
import { useGameStore, shopPrice, questFree, isArmorPiece } from '../../../store';
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
  const freeArmor = useGameStore((s) => questFree(s, 'armor'));   // tutorial "Suit of Steel": one armor piece on the house
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
      {freeArmor && <div className="rpg-frame gold p-2.5 text-[.8rem] leading-snug text-center" data-testid="armory-free">Mira's favour: your first piece of armor (helmet, armor, gloves or boots) is <b className="text-[var(--good)]">FREE</b>.</div>}
      {groups.map(({ k, items }) => (
        <div key={k}>
          <div className="rpg-label mb-2">{SLOT_NAME[k] ?? k}</div>
          <div className="slot-grid priced">
            {items.map((it) => { const free = freeArmor && isArmorPiece(it); return <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={free ? 0 : shopPrice(it)} cantAfford={!free && gold < shopPrice(it)} tooltip="buy" compare onClick={() => (free ? setBuy(it, { price: 0, max: 1 }) : setBuy(it))} />; })}
          </div>
        </div>
      ))}
    </div>
  );
};
