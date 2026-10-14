import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Hammer, BookOpen, Dices, Ghost, Star, ScrollText, Store, Shield, Warehouse } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { ShopTab } from '../../storeTypes';
import { Panel, PanelHead, CurrencyPill } from '../components/Frame';
import { AnvilGlyph } from '../components/ItemArt';
import { GemGlyph } from '../components/SkillIcons';
import { SuppliesTab } from './shop/Supplies';
import { MerchantTab } from './shop/Merchant';
import { PetsTab } from './shop/Pets';
import { SummonTab } from './shop/Summon';
import { BlacksmithTab } from './shop/Blacksmith';
import { SkillsTab } from './shop/Skills';
import { QuestsTab } from './shop/Quests';
import { ArmoryTab } from './shop/Armory';
import { WarehouseTab } from './shop/Warehouse';

const TABS: { id: ShopTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'SUPPLIES', label: 'Supplies', icon: <ShoppingBag size={24} />, title: 'Potion Shop' },
  { id: 'PETS', label: 'Pets', icon: <Ghost size={24} />, title: 'Pet House' },
  { id: 'SUMMON', label: 'Summon', icon: <Dices size={24} />, title: 'Summoning Shrine' },
  { id: 'BLACKSMITH', label: 'Smith', icon: <Hammer size={24} />, title: 'Blacksmith' },
  { id: 'ARMORY', label: 'Armor', icon: <Shield size={24} />, title: 'Armor Shop' },
  { id: 'QUESTS', label: 'Quests', icon: <ScrollText size={24} />, title: 'Quest Board' },
  { id: 'SKILLS', label: 'Skills', icon: <BookOpen size={24} />, title: 'Skill Trainer' },
  { id: 'WAREHOUSE', label: 'Storage', icon: <Warehouse size={24} />, title: 'Warehouse' },
  { id: 'MERCHANT', label: 'Merchant', icon: <Store size={24} />, title: 'Travelling Merchant' },
];

export const ShopPanel: React.FC = () => {
  const { tab, close, gold, gems, sp } = useGameStore(useShallow((s) => ({
    tab: s.activeShopTab, close: s.closeAllUI, gold: s.gold, gems: s.gems, sp: s.skillPoints,
  })));
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <motion.div initial={{ x: '105%' }} animate={{ x: 0 }} exit={{ x: '105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex flex-col side-panel" style={{ right: '.7rem', top: '.7rem', bottom: '.7rem', width: '31rem', zIndex: 41 }}>
      <Panel className="flex flex-col flex-1 min-h-0">
        <PanelHead title={cur.title} icon={tab === 'BLACKSMITH' ? <AnvilGlyph size={36} /> : cur.icon} onClose={close}
          right={<div className="flex gap-1.5">
            <CurrencyPill value={gold.toLocaleString()} />
            {tab === 'SUMMON' && <CurrencyPill icon={<GemGlyph size={20} />} value={gems.toLocaleString()} />}
            {tab === 'SKILLS' && <CurrencyPill icon={<Star size={16} className="text-[var(--gold-light)]" />} value={`${sp} SP`} />}
          </div>} />
        <div className="flex-1 min-h-0 rpg-scroll p-4">
          {tab === 'SUPPLIES' && <SuppliesTab />}
          {tab === 'PETS' && <PetsTab />}
          {tab === 'SUMMON' && <SummonTab />}
          {tab === 'BLACKSMITH' && <BlacksmithTab />}
          {tab === 'SKILLS' && <SkillsTab />}
          {tab === 'QUESTS' && <QuestsTab />}
          {tab === 'MERCHANT' && <MerchantTab />}
          {tab === 'ARMORY' && <ArmoryTab />}
          {tab === 'WAREHOUSE' && <WarehouseTab />}
        </div>
      </Panel>
    </motion.div>
  );
};
