import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Backpack, ArrowDownUp, Wand2, Swords, Heart, Shield, Wind } from 'lucide-react';
import { useGameStore, calculateTotalCP, calculateItemCP, RARITY_LEVEL_REQ } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { Panel, PanelHead } from '../components/Frame';
import { Button } from '../components/Button';
import { ItemSlot } from '../components/ItemSlot';
import { HERO_ICON } from '../hud/TopBars';
import { useUiStore } from '../uiStore';
import { HERO_COLOR, RARITY_RANK, SORTS, isGear, type SortMode } from '../lib/game';

const TYPE_RANK: Record<string, number> = { WEAPON: 6, ARMOR: 5, ACCESSORY: 4, PET: 3, POTION: 2, CORE: 1, REVIVE: 0 };

const DollSlot: React.FC<{ slot: EquipSlot; label: string; item: Item | null; onClick: () => void }> = ({ slot, label, item, onClick }) => (
  <div className="flex flex-col items-center gap-1">
    <ItemSlot item={item} size="4.2rem" iconSize={32} onClick={item ? onClick : undefined} emptyLabel={label} tooltip="sell" compare={false} className={item ? '' : 'hoverable'} />
    <span className="rpg-label !text-[.55rem]">{label}</span>
  </div>
);

export const InventoryPanel: React.FC = () => {
  const { inventory, max, equipment, level, hero, stats } = useGameStore(useShallow((s) => ({
    inventory: s.inventory, max: s.maxInventorySlots, equipment: s.equipment, level: s.level, hero: s.hero, stats: s.stats,
  })));
  const { equipItem, unequipItem, autoEquip, toggleInventory, closeAllUI, invOpen } = useGameStore(useShallow((s) => ({
    equipItem: s.equipItem, unequipItem: s.unequipItem, autoEquip: s.autoEquip, toggleInventory: s.toggleInventory, closeAllUI: s.closeAllUI, invOpen: s.isInventoryOpen,
  })));
  const shopTab = useGameStore((s) => (s.isShopOpen ? s.activeShopTab : null));
  const { selected, setSelected, setSell } = useUiStore(useShallow((s) => ({ selected: s.selectedItem, setSelected: s.setSelectedItem, setSell: s.setSellItem })));
  const [sort, setSort] = useState<SortMode>('RARITY');
  const HeroIcon = HERO_ICON[hero];

  const sorted = useMemo(() => [...inventory].sort((a, b) => {
    if (sort === 'POWER') return calculateItemCP(b) - calculateItemCP(a);
    if (sort === 'TYPE') return (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
  }), [inventory, sort]);

  const selectedLive = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id)) : null;

  const lockedFor = (it: Item) => isGear(it) && (RARITY_LEVEL_REQ[it.rarity] > level || (!!it.classType && it.classType !== hero));
  const click = (it: Item) => {
    if (shopTab === 'BLACKSMITH') { setSelected(it); return; }
    if (shopTab === 'SUPPLIES' || shopTab === 'PETS') { setSell(it); return; }
    if (isGear(it) && !lockedFor(it)) equipItem(it);
  };
  const empty = Math.max(0, max - inventory.length);
  const chips: [React.ReactNode, string, string][] = [
    [<Heart size={12} key="h" />, 'HP', String(Math.round(stats.maxHealth))], [<Swords size={12} key="d" />, 'DMG', String(Math.round(stats.damage))],
    [<Shield size={12} key="s" />, 'DEF', stats.defense.toFixed(0)], [<Wind size={12} key="w" />, 'SPD', stats.moveSpeed.toFixed(1)],
  ];

  return (
    <motion.div initial={{ x: '-105%' }} animate={{ x: 0 }} exit={{ x: '-105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex" style={{ left: '.7rem', top: '.7rem', bottom: '.7rem', width: '27.5rem', zIndex: 40 }}>
      <Panel className="flex flex-col w-full min-h-0">
        <PanelHead icon={<Backpack size={22} />} title="Bag" sub={shopTab === 'SUPPLIES' || shopTab === 'PETS' ? 'Click an item to sell' : shopTab === 'BLACKSMITH' ? 'Click an item to select' : 'Click an item to equip'} onClose={invOpen ? toggleInventory : closeAllUI}
          right={<span className="rpg-badge">CP <span className="rpg-num text-white">{calculateTotalCP(stats).toLocaleString()}</span></span>} />
        <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-4">
          {/* paper doll */}
          <div className="rpg-frame gold p-3" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(233,185,73,.12), rgba(0,0,0,.45) 70%)' }}>
            <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr', gap: '.4rem' }}>
              <div className="flex flex-col gap-3 items-center">
                <DollSlot slot="weapon" label="Weapon" item={equipment.weapon} onClick={() => unequipItem('weapon')} />
                <DollSlot slot="accessory" label="Accessory" item={equipment.accessory} onClick={() => unequipItem('accessory')} />
              </div>
              <div className="flex flex-col items-center gap-2 px-2">
                <div className="rpg-medallion" style={{ width: '6.4rem', height: '6.4rem', ['--mc' as any]: HERO_COLOR[hero] }}>
                  <HeroIcon size={52} style={{ opacity: .9 }} />
                  <span className="rpg-badge absolute -bottom-2 left-1/2 -translate-x-1/2">Lv {level}</span>
                </div>
                <div className="rpg-title text-sm mt-1">{hero}</div>
              </div>
              <div className="flex flex-col gap-3 items-center">
                <DollSlot slot="armor" label="Armor" item={equipment.armor} onClick={() => unequipItem('armor')} />
                <DollSlot slot="pet" label="Pet" item={equipment.pet} onClick={() => unequipItem('pet')} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              {chips.map(([ic, l, v]) => (
                <div key={l} className="rpg-frame text-center py-1"><div className="rpg-label !text-[.5rem] flex items-center justify-center gap-1">{ic}{l}</div><div className="rpg-num text-sm text-[var(--gold-light)]">{v}</div></div>
              ))}
            </div>
          </div>

          {/* storage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="rpg-label">Storage <span className="rpg-num text-white">{inventory.length}/{max}</span></span>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}><ArrowDownUp size={12} /> {sort}</Button>
                <Button size="sm" variant="primary" onClick={autoEquip}><Wand2 size={12} /> Auto equip</Button>
              </div>
            </div>
            <div className="rpg-frame p-2.5 grid gap-[.55rem]" style={{ gridTemplateColumns: 'repeat(5, 1fr)', justifyItems: 'center' }}>
              {sorted.map((it, i) => (
                <ItemSlot key={`${it.id}-${i}`} item={it} size="3.7rem" iconSize={26} locked={lockedFor(it)} selected={!!selectedLive && selectedLive === it && shopTab === 'BLACKSMITH'}
                  onClick={() => click(it)} tooltip="sell" />
              ))}
              {Array.from({ length: empty }).map((_, i) => <div key={`e${i}`} className="rpg-slot is-empty" style={{ ['--slot' as any]: '3.7rem' }} />)}
            </div>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
};
