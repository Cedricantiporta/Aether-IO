import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Hammer, BookOpen, Dices, Ghost, Coins, Gem, Star } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { ShopTab } from '../../storeTypes';
import { Panel, PanelHead } from '../components/Frame';
import { SuppliesTab } from './shop/Supplies';
import { PetsTab } from './shop/Pets';
import { SummonTab } from './shop/Summon';
import { BlacksmithTab } from './shop/Blacksmith';
import { SkillsTab } from './shop/Skills';

const TABS: { id: ShopTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'SUPPLIES', label: 'Supplies', icon: <ShoppingBag size={13} />, title: 'General Store' },
  { id: 'PETS', label: 'Pets', icon: <Ghost size={13} />, title: 'Menagerie' },
  { id: 'SUMMON', label: 'Summon', icon: <Dices size={13} />, title: 'Aether Altar' },
  { id: 'BLACKSMITH', label: 'Smith', icon: <Hammer size={13} />, title: 'Blacksmith' },
  { id: 'SKILLS', label: 'Skills', icon: <BookOpen size={13} />, title: 'Skill Tome' },
];

export const ShopPanel: React.FC = () => {
  const { tab, open, close, gold, gems, sp } = useGameStore(useShallow((s) => ({
    tab: s.activeShopTab, open: s.openSpecificShop, close: s.closeAllUI, gold: s.gold, gems: s.gems, sp: s.skillPoints,
  })));
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <motion.div initial={{ x: '105%' }} animate={{ x: 0 }} exit={{ x: '105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex flex-col" style={{ right: '.7rem', top: '.7rem', bottom: '.7rem', width: '31rem', zIndex: 41 }}>
      {/* hanging wooden sign tabs */}
      <div className="flex gap-1.5 justify-center relative" style={{ zIndex: 2, marginBottom: '-.35rem', paddingTop: '.2rem' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`rpg-tab pe ${tab === t.id ? 'is-active' : ''}`} onClick={() => open(t.id)}>
            <span className="flex items-center justify-center gap-1">{t.icon}{t.label}</span>
          </button>
        ))}
      </div>
      <Panel className="flex flex-col flex-1 min-h-0">
        <PanelHead title={cur.title} sub={cur.label} onClose={close}
          right={<div className="flex gap-1.5">
            <span className="rpg-badge"><Coins size={11} /> <span className="rpg-num text-white">{gold.toLocaleString()}</span></span>
            {tab === 'SUMMON' && <span className="rpg-badge"><Gem size={11} /> <span className="rpg-num text-white">{gems.toLocaleString()}</span></span>}
            {tab === 'SKILLS' && <span className="rpg-badge"><Star size={11} /> <span className="rpg-num text-white">{sp} SP</span></span>}
          </div>} />
        <div className="flex-1 min-h-0 rpg-scroll p-4">
          {tab === 'SUPPLIES' && <SuppliesTab />}
          {tab === 'PETS' && <PetsTab />}
          {tab === 'SUMMON' && <SummonTab />}
          {tab === 'BLACKSMITH' && <BlacksmithTab />}
          {tab === 'SKILLS' && <SkillsTab />}
        </div>
      </Panel>
    </motion.div>
  );
};
