import React from 'react';
import { ShoppingBag, Hammer, BookOpen, Dices, Ghost, Star, ScrollText, Backpack, Store } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { ShopTab } from '../../storeTypes';
import { PanelHead, CurrencyPill } from '../components/Frame';
import { Sheet } from '../components/Sheet';
import { GemGlyph } from '../components/SkillIcons';
import { SuppliesTab } from './shop/Supplies';
import { MerchantTab } from './shop/Merchant';
import { PetsTab } from './shop/Pets';
import { SummonTab } from './shop/Summon';
import { BlacksmithTab } from './shop/Blacksmith';
import { SkillsTab } from './shop/Skills';
import { QuestsTab } from './shop/Quests';
import { useSmall } from '../hooks/useMedia';
import { useUiStore } from '../uiStore';

const TABS: { id: ShopTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'SUPPLIES', label: 'Supplies', icon: <ShoppingBag size={22} />, title: 'Potion Shop' },
  { id: 'PETS', label: 'Pets', icon: <Ghost size={22} />, title: 'Pet House' },
  { id: 'SUMMON', label: 'Summon', icon: <Dices size={22} />, title: 'Summoning Shrine' },
  { id: 'BLACKSMITH', label: 'Smith', icon: <Hammer size={22} />, title: 'Blacksmith' },
  { id: 'QUESTS', label: 'Quests', icon: <ScrollText size={22} />, title: 'Quest Board' },
  { id: 'SKILLS', label: 'Skills', icon: <BookOpen size={22} />, title: 'Skill Trainer' },
  { id: 'MERCHANT', label: 'Merchant', icon: <Store size={22} />, title: 'Travelling Merchant' },
];

export const ShopPanel: React.FC = () => {
  const { tab, close, gold, gems, sp } = useGameStore(useShallow((s) => ({
    tab: s.activeShopTab, close: s.closeAllUI, gold: s.gold, gems: s.gems, sp: s.skillPoints,
  })));
  const small = useSmall();
  const setBagView = useUiStore((s) => s.setBagView);
  const usesBag = tab === 'SUPPLIES' || tab === 'PETS' || tab === 'BLACKSMITH';
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <Sheet side="r" width="31rem" z={41} testId="shop-panel">
      <PanelHead title={cur.title} icon={cur.icon} onClose={close}
        right={<div className="flex gap-1.5 items-center">
          {small && usesBag && <button className="rpg-btn rpg-btn-sm" onClick={() => setBagView(true)} data-testid="open-bag-view"><Backpack size={16} /> Bag</button>}
          <CurrencyPill value={gold.toLocaleString()} />
          {tab === 'SUMMON' && <CurrencyPill icon={<GemGlyph size={20} />} value={gems.toLocaleString()} />}
          {tab === 'SKILLS' && <CurrencyPill icon={<Star size={16} className="text-[var(--hi)]" />} value={`${sp} SP`} />}
        </div>} />
      <div className="flex-1 min-h-0 rpg-scroll p-4">
        {tab === 'SUPPLIES' && <SuppliesTab />}
        {tab === 'PETS' && <PetsTab />}
        {tab === 'SUMMON' && <SummonTab />}
        {tab === 'BLACKSMITH' && <BlacksmithTab />}
        {tab === 'SKILLS' && <SkillsTab />}
        {tab === 'QUESTS' && <QuestsTab />}
        {tab === 'MERCHANT' && <MerchantTab />}
      </div>
    </Sheet>
  );
};
