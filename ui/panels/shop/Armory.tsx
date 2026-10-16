import React, { useMemo, useState } from 'react';
import { useGameStore, shopPrice, questFree, isArmorPiece } from '../../../store';
import { ITEMS_POOL } from '../../../constants';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { useUiStore } from '../../uiStore';
import { isGear } from '../../lib/game';
import type { Item } from '../../../types';

const SLOT_ORDER = ['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY'];
const SLOT_NAME: Record<string, string> = { ALL: 'All', WEAPON: 'Weapon', HELMET: 'Helmet', ARMOR: 'Armor', GLOVES: 'Gloves', BOOTS: 'Boots', ACCESSORY: 'Trinket' };

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
  const [cat, setCat] = useState('ALL');
  const tabs = ['ALL', ...groups.map((g) => g.k)];
  const shown = groups.filter((g) => cat === 'ALL' || g.k === cat).flatMap((g) => g.items);
  return (
    <div className="flex flex-col" data-testid="armory-tab">
      {freeArmor && <div className="rpg-frame gold p-2.5 mb-3 text-[.8rem] leading-snug text-center" data-testid="armory-free">Mira's favour: your first piece of armor (helmet, armor, gloves or boots) is <b className="text-[var(--good)]">FREE</b>.</div>}
      <nav className="bag-tabs shop-tabs" style={{ ['--n' as any]: tabs.length }}>
        {tabs.map((k) => <button key={k} className={`bag-tab ${cat === k ? 'is-active' : ''}`} onClick={() => setCat(k)} data-testid={`armory-cat-${k}`}>{SLOT_NAME[k] ?? k}</button>)}
      </nav>
      <ShopGrid minRows={4}>
        {shown.map((it) => { const free = freeArmor && isArmorPiece(it); return <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={free ? 0 : shopPrice(it)} cantAfford={!free && gold < shopPrice(it)} tooltip="buy" compare onClick={() => (free ? setBuy(it, { price: 0, max: 1 }) : setBuy(it))} />; })}
      </ShopGrid>
    </div>
  );
};
