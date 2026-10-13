import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, LayoutGrid, Sword, Shield, Gem, FlaskConical, Hexagon, PawPrint, Ellipsis, Swords, Heart, Wind } from 'lucide-react';
import { useGameStore, calculateTotalCP, calculateItemCP, RANK_REQ, RARITY_COLOR } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { Panel, PanelHead, CurrencyPill } from '../components/Frame';
import { BagGlyph } from '../components/ItemArt';
import { ItemSlot } from '../components/ItemSlot';
import { HERO_ICON } from '../hud/TopBars';
import { useUiStore } from '../uiStore';
import { RARITY_RANK, SORTS, isGear, type SortMode } from '../lib/game';

const TYPE_RANK: Record<string, number> = { WEAPON: 9, HELMET: 8, ARMOR: 7, GLOVES: 6, BOOTS: 5, ACCESSORY: 4, PET: 3, POTION: 2, CORE: 1, REVIVE: 0, LOOT: 0 };

const DollSlot: React.FC<{ slot: EquipSlot; label: string; item: Item | null; onClick: () => void }> = ({ slot, label, item, onClick }) => (
  <div className="flex flex-col items-center gap-1">
    <ItemSlot item={item} size="3.5rem" iconSize="82%" fluid={false} onClick={item ? onClick : undefined} emptyLabel={label} tooltip="sell" compare={false} className={item ? '' : 'hoverable'} />
    <span className="rpg-label !text-[.5rem]">{label}</span>
  </div>
);

type Cat = 'ALL' | 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'CONSUMABLE' | 'MATERIAL' | 'PET' | 'ETC';
const CATS: { id: Cat; label: string; icon: React.ReactNode }[] = [
  { id: 'ALL', label: 'All', icon: <LayoutGrid size={18} /> }, { id: 'WEAPON', label: 'Weapon', icon: <Sword size={18} /> },
  { id: 'ARMOR', label: 'Armor', icon: <Shield size={18} /> }, { id: 'ACCESSORY', label: 'Accessory', icon: <Gem size={18} /> },
  { id: 'CONSUMABLE', label: 'Consumable', icon: <FlaskConical size={18} /> }, { id: 'MATERIAL', label: 'Material', icon: <Hexagon size={18} /> },
  { id: 'PET', label: 'Pet', icon: <PawPrint size={18} /> }, { id: 'ETC', label: 'Etc', icon: <Ellipsis size={18} /> },
];
const catOf = (it: Item): Cat => it.type === 'WEAPON' ? 'WEAPON' : it.type === 'ARMOR' || it.type === 'HELMET' || it.type === 'GLOVES' || it.type === 'BOOTS' ? 'ARMOR' : it.type === 'ACCESSORY' ? 'ACCESSORY'
  : it.type === 'POTION' || it.type === 'REVIVE' ? 'CONSUMABLE' : it.type === 'CORE' ? 'MATERIAL' : it.type === 'PET' ? 'PET' : 'ETC';

export const InventoryPanel: React.FC = () => {
  const { inventory, max, equipment, level, rank, materials, hero, stats } = useGameStore(useShallow((s) => ({
    inventory: s.inventory, max: s.maxInventorySlots, equipment: s.equipment, level: s.level, rank: s.heroRank, materials: s.materials, hero: s.hero, stats: s.stats,
  })));
  const { equipItem, unequipItem, autoEquip, toggleInventory, closeAllUI, invOpen } = useGameStore(useShallow((s) => ({
    equipItem: s.equipItem, unequipItem: s.unequipItem, autoEquip: s.autoEquip, toggleInventory: s.toggleInventory, closeAllUI: s.closeAllUI, invOpen: s.isInventoryOpen,
  })));
  const shopTab = useGameStore((s) => (s.isShopOpen ? s.activeShopTab : null));
  const { selected, setSelected, setSell } = useUiStore(useShallow((s) => ({ selected: s.selectedItem, setSelected: s.setSelectedItem, setSell: s.setSellItem })));
  const [sort, setSort] = useState<SortMode>('RARITY');
  const [cat, setCat] = useState<Cat>('ALL');
  const [equipOpen, setEquipOpen] = useState(true);
  const HeroIcon = HERO_ICON[hero];

  const sorted = useMemo(() => [...inventory].sort((a, b) => {
    if (sort === 'POWER') return calculateItemCP(b) - calculateItemCP(a);
    if (sort === 'TYPE') return (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
  }), [inventory, sort]);

  const selectedLive = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id)) : null;

  const lockedFor = (it: Item) => isGear(it) && (RANK_REQ[it.rarity] > rank || (!!it.classType && it.classType !== hero));
  const click = (it: Item) => {
    if (shopTab === 'BLACKSMITH') { setSelected(it); return; }
    if (shopTab === 'SUPPLIES' || shopTab === 'PETS') { setSell(it); return; }
    if (isGear(it) && !lockedFor(it)) equipItem(it);
  };
  const shown = useMemo(() => (cat === 'ALL' ? sorted : sorted.filter((i) => catOf(i) === cat)), [sorted, cat]);
  const empty = cat === 'ALL' ? Math.max(0, max - inventory.length) : Math.max(0, Math.max(12, Math.ceil(shown.length / 4) * 4 + 4) - shown.length);
  const chips: [React.ReactNode, string, string][] = [
    [<Heart size={12} key="h" />, 'HP', String(Math.round(stats.maxHealth))], [<Swords size={12} key="d" />, 'DMG', String(Math.round(stats.damage))],
    [<Shield size={12} key="s" />, 'DEF', stats.defense.toFixed(0)], [<Wind size={12} key="w" />, 'SPD', stats.moveSpeed.toFixed(1)],
  ];

  return (
    <motion.div initial={{ x: '-105%' }} animate={{ x: 0 }} exit={{ x: '-105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex" style={{ left: '.7rem', top: '.7rem', bottom: '.7rem', width: '30rem', zIndex: 40 }}>
      <Panel className="flex flex-col w-full min-h-0">
        <PanelHead icon={<BagGlyph size={34} />} title="Bag" onClose={invOpen ? toggleInventory : closeAllUI}
          right={<CurrencyPill label="CP" value={calculateTotalCP(stats).toLocaleString()} />} />
        {/* equipped (collapsible paper doll) */}
        <div className="bag-equip">
          <button className="bag-equip-head" onClick={() => setEquipOpen((v) => !v)} aria-expanded={equipOpen}>
            <span className="flex items-center gap-1.5"><HeroIcon size={14} /> Equipped <span className="rpg-num text-white">Lv {level} · Rank {rank}</span></span>
            <span className="flex items-center gap-2.5 rpg-num">
              {chips.map(([ic, l, v]) => <span key={l} className="flex items-center gap-1 text-[var(--gold-light)]" title={l}>{ic}{v}</span>)}
              <ChevronDown size={16} style={{ transform: equipOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </span>
          </button>
          {equipOpen && (
            <div className="bag-equip-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 4.2rem)', justifyContent: 'center', gap: '.25rem .9rem' }} data-testid="paper-doll">
              <span />
              <DollSlot slot="helmet" label="Helmet" item={equipment.helmet} onClick={() => unequipItem('helmet')} />
              <span />
              <DollSlot slot="weapon" label="Weapon" item={equipment.weapon} onClick={() => unequipItem('weapon')} />
              <DollSlot slot="armor" label="Armor" item={equipment.armor} onClick={() => unequipItem('armor')} />
              <DollSlot slot="gloves" label="Gloves" item={equipment.gloves} onClick={() => unequipItem('gloves')} />
              <DollSlot slot="accessory" label="Accessory" item={equipment.accessory} onClick={() => unequipItem('accessory')} />
              <DollSlot slot="boots" label="Boots" item={equipment.boots} onClick={() => unequipItem('boots')} />
              <DollSlot slot="pet" label="Pet" item={equipment.pet} onClick={() => unequipItem('pet')} />
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex">
          <nav className="bag-cats rpg-scroll">
            {CATS.map((c) => (
              <button key={c.id} className={`bag-cat ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)}>{c.icon}<span>{c.label}</span></button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 min-h-0 rpg-scroll p-2.5">
            {cat === 'MATERIAL' && (
              <div className="flex flex-wrap gap-1.5 mb-2.5" aria-label="Crafting shards">
                {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const).map((r) => (
                  <div key={r} className="rpg-frame px-2 py-1 text-center" style={{ minWidth: '3.6rem' }}>
                    <div className="rpg-num text-base" style={{ color: RARITY_COLOR[r] }}>{materials[r]}</div>
                    <div className="rpg-label !text-[.5rem]">{r.charAt(0) + r.slice(1).toLowerCase()} shard</div>
                  </div>
                ))}
              </div>
            )}
            <div className="bag-grid">
              {shown.map((it, i) => (
                <ItemSlot key={`${it.id}-${i}`} item={it} fluid size="100%" iconSize="78%" locked={lockedFor(it)} selected={!!selectedLive && selectedLive === it && shopTab === 'BLACKSMITH'}
                  onClick={() => click(it)} tooltip="sell" />
              ))}
              {Array.from({ length: empty }).map((_, i) => <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>)}
            </div>
          </div>
        </div>
        <div className="bag-foot">
          <span className="flex items-center gap-2 rpg-label !text-[.7rem]"><BagGlyph size={22} /> Storage <span className="rpg-num text-white">{inventory.length}/{max}</span></span>
          <div className="flex gap-1.5">
            <button className="rpg-btn rpg-btn-sm" onClick={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])} title={`Sorted by ${sort.toLowerCase()}`}>Sort</button>
            <button className="rpg-btn rpg-btn-primary rpg-btn-sm" onClick={autoEquip}>Auto equip</button>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
};
