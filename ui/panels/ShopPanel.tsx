import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Hammer, BookOpen, Dices, Ghost, Star, ScrollText, Store, Shield, Warehouse, Cog, FlaskConical, Fish, Pickaxe } from 'lucide-react';
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
import { BrewerTab } from './shop/Brewer';
import { FishShopTab } from './shop/FishShop';
import { MineShopTab } from './shop/MineShop';
import { useDrop } from '../lib/dnd';
import { useUiStore } from '../uiStore';
import { BulkSellPopup } from './shop/BulkSell';

const SELL_TABS: ShopTab[] = ['SUPPLIES', 'PETS', 'ARMORY', 'MERCHANT', 'BREWER', 'FISH', 'MINE'];

const TABS: { id: ShopTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'SUPPLIES', label: 'Supplies', icon: <ShoppingBag size={24} />, title: 'Potion Shop' },
  { id: 'PETS', label: 'Pets', icon: <Ghost size={24} />, title: 'Pet House' },
  { id: 'SUMMON', label: 'Summon', icon: <Dices size={24} />, title: 'Summoning Shrine' },
  { id: 'BLACKSMITH', label: 'Smith', icon: <Hammer size={24} />, title: 'Blacksmith' },
  { id: 'ARMORY', label: 'Armor', icon: <Shield size={24} />, title: 'Armor Shop' },
  { id: 'QUESTS', label: 'Quests', icon: <ScrollText size={24} />, title: 'Quest Board' },
  { id: 'SKILLS', label: 'Skills', icon: <BookOpen size={24} />, title: 'Skill Trainer' },
  { id: 'WAREHOUSE', label: 'Storage', icon: <Warehouse size={24} />, title: 'Warehouse' },
  { id: 'TECH', label: 'Tech', icon: <Cog size={24} />, title: 'Tech House' },
  { id: 'BREWER', label: 'Brewer', icon: <FlaskConical size={24} />, title: 'Elixir Brewer' },
  { id: 'FISH', label: 'Fish', icon: <Fish size={24} />, title: 'Fishmonger' },
  { id: 'MINE', label: 'Mining', icon: <Pickaxe size={24} />, title: 'Mining Supplies' },
  { id: 'MERCHANT', label: 'Merchant', icon: <Store size={24} />, title: 'Travelling Merchant' },
];

export const ShopPanel: React.FC = () => {
  const { tab, close, gems, sp } = useGameStore(useShallow((s) => ({
    tab: s.activeShopTab, close: s.closeAllUI, gems: s.gems, sp: s.skillPoints,
  })));
  const [bulk, setBulk] = React.useState(false);
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  // drop a bag item on a shop: sell it (or pick it for upgrading at the blacksmith); the warehouse grid handles its own drops
  const ui = useUiStore.getState();
  const sellDrop = useDrop((d) => d.from === 'BAG' && ['SUPPLIES', 'PETS', 'ARMORY', 'MERCHANT', 'BLACKSMITH', 'FISH'].includes(tab),
    (d) => { if (tab === 'BLACKSMITH') ui.setSelectedItem(d.item); else ui.setSellItem(d.item); });
  if (tab === 'QUESTS') return <QuestsTab onClose={close} />;   // (owner) the Bounty Board is a centred popup, not a side panel
  return (
    <motion.div initial={{ x: '105%' }} animate={{ x: 0 }} exit={{ x: '105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex flex-col side-panel shop-side" style={{ right: '.7rem', top: '.7rem', bottom: '.7rem', width: '31rem', zIndex: 41 }}>
      <Panel className={`flex flex-col flex-1 min-h-0 drop-zone ${sellDrop.hot ? 'drop-hot' : ''}`} {...sellDrop.props}>
        <PanelHead title={cur.title} icon={tab === 'BLACKSMITH' ? <AnvilGlyph size={36} /> : cur.icon} onClose={close}
          right={<div className="flex gap-1.5">
            {tab === 'SUMMON' && <CurrencyPill icon={<GemGlyph size={20} />} value={gems.toLocaleString()} />}
            {tab === 'SKILLS' && <CurrencyPill icon={<Star size={16} className="text-[var(--gold-light)]" />} value={`${sp} SP`} />}
          </div>} />
        <div className="flex-1 min-h-0 rpg-scroll p-4">
          {tab === 'SUPPLIES' && <SuppliesTab />}
          {tab === 'PETS' && <PetsTab />}
          {tab === 'SUMMON' && <SummonTab />}
          {tab === 'BLACKSMITH' && <BlacksmithTab />}
          {tab === 'SKILLS' && <SkillsTab />}
          {tab === 'MERCHANT' && <MerchantTab />}
          {tab === 'ARMORY' && <ArmoryTab />}
          {tab === 'WAREHOUSE' && <WarehouseTab />}
          {tab === 'BREWER' && <BrewerTab />}
          {tab === 'FISH' && <FishShopTab />}
          {tab === 'MINE' && <MineShopTab />}
        </div>
        {SELL_TABS.includes(tab) && (
          <div className="shop-foot">
            <button className="rpg-btn rpg-btn-sm pe" onClick={() => setBulk(true)} data-testid="shop-bulk-sell">Bulk sell</button>
          </div>
        )}
      </Panel>
      {bulk && <BulkSellPopup onClose={() => setBulk(false)} />}
    </motion.div>
  );
};
