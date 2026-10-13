import React, { useMemo, useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';
import { useGameStore, calculateTotalCP, calculateItemCP, RANK_REQ } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { PanelHead, CurrencyPill } from '../components/Frame';
import { Sheet } from '../components/Sheet';
import { BagGlyph } from '../components/ItemArt';
import { ItemSlot } from '../components/ItemSlot';
import { ItemTip } from '../components/ItemTip';
import { Button } from '../components/Button';
import { HERO_ICON } from '../hud/TopBars';
import { useUiStore } from '../uiStore';
import { useSmall, useMedia } from '../hooks/useMedia';
import { device } from '../../engine/device';
import { RARITY_RANK, RARITY_COLOR, SORTS, isGear, type SortMode } from '../lib/game';

const TYPE_RANK: Record<string, number> = { WEAPON: 9, HELMET: 8, ARMOR: 7, GLOVES: 6, BOOTS: 5, ACCESSORY: 4, PET: 3, POTION: 2, CORE: 1, REVIVE: 0, LOOT: 0 };

const DOLL: { slot: EquipSlot; label: string }[] = [
  { slot: 'weapon', label: 'Weapon' }, { slot: 'helmet', label: 'Helmet' }, { slot: 'armor', label: 'Armor' }, { slot: 'gloves', label: 'Gloves' },
  { slot: 'boots', label: 'Boots' }, { slot: 'accessory', label: 'Trinket' }, { slot: 'pet', label: 'Pet' },
];

type Cat = 'ALL' | 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'CONSUMABLE' | 'MATERIAL' | 'PET' | 'ETC';
const CATS: { id: Cat; label: string }[] = [
  { id: 'ALL', label: 'All' }, { id: 'WEAPON', label: 'Weapon' }, { id: 'ARMOR', label: 'Armor' }, { id: 'ACCESSORY', label: 'Accessory' },
  { id: 'CONSUMABLE', label: 'Consumable' }, { id: 'MATERIAL', label: 'Material' }, { id: 'PET', label: 'Pet' }, { id: 'ETC', label: 'Etc' },
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
  const { selected, setSelected, setSell, setBagView } = useUiStore(useShallow((s) => ({ selected: s.selectedItem, setSelected: s.setSelectedItem, setSell: s.setSellItem, setBagView: s.setBagView })));
  const small = useSmall();
  const shortScreen = useMedia('(max-height: 500px)');
  const [sort, setSort] = useState<SortMode>('RARITY');
  const [cat, setCat] = useState<Cat>('ALL');
  const [equipOpen, setEquipOpen] = useState(!shortScreen);
  const [detail, setDetail] = useState<{ item: Item; equipped: boolean } | null>(null);
  const HeroIcon = HERO_ICON[hero];
  const tapMode = device.touch || small;     // touch: tap an item to see its details first, then act with buttons

  const sorted = useMemo(() => [...inventory].sort((a, b) => {
    if (sort === 'POWER') return calculateItemCP(b) - calculateItemCP(a);
    if (sort === 'TYPE') return (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
  }), [inventory, sort]);

  const selectedLive = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id)) : null;
  const lockedFor = (it: Item) => isGear(it) && (RANK_REQ[it.rarity] > rank || (!!it.classType && it.classType !== hero));
  const click = (it: Item) => {
    if (shopTab === 'BLACKSMITH') { setSelected(it); if (small) setBagView(false); return; }
    if (shopTab === 'SUPPLIES' || shopTab === 'PETS') { setSell(it); return; }
    if (tapMode) { setDetail({ item: it, equipped: false }); return; }
    if (isGear(it) && !lockedFor(it)) equipItem(it);
  };
  const shown = useMemo(() => (cat === 'ALL' ? sorted : sorted.filter((i) => catOf(i) === cat)), [sorted, cat]);
  const empty = cat === 'ALL' ? Math.max(0, max - inventory.length) : Math.max(0, Math.max(12, Math.ceil(shown.length / 4) * 4 + 4) - shown.length);
  const detailLive = detail && (detail.equipped ? detail.item : (inventory.includes(detail.item) ? detail.item : null));

  return (
    <Sheet side="l" width="30rem" z={40} testId="bag-panel">
      <PanelHead icon={<BagGlyph size={30} />} title="Bag" onClose={invOpen ? toggleInventory : closeAllUI}
        right={<div className="flex items-center gap-2">
          {small && shopTab && <button className="rpg-btn rpg-btn-sm" onClick={() => setBagView(false)}><Store size={16} /> Shop</button>}
          <CurrencyPill label="CP" icon={<span />} value={calculateTotalCP(stats).toLocaleString()} />
        </div>} />
      {/* equipped (collapsible) */}
      <div className="bag-equip">
        <button className="bag-equip-head" onClick={() => setEquipOpen((v) => !v)} aria-expanded={equipOpen}>
          <span className="flex items-center gap-2"><HeroIcon size={16} /> Equipped <span className="rpg-num text-[var(--fg-2)]">Lv {level} · Rank {rank}</span></span>
          <ChevronDown size={18} style={{ transform: equipOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </button>
        {equipOpen && (
          <div className="bag-equip-row" data-testid="paper-doll">
            {DOLL.map(({ slot, label }) => {
              const item = equipment[slot];
              return (
                <div key={slot} className="doll">
                  <ItemSlot item={item} size="56px" iconSize="82%" fluid={false} onClick={item ? () => (tapMode ? setDetail({ item, equipped: true }) : unequipItem(slot)) : undefined}
                    emptyLabel={label} tooltip="sell" compare={false} noTip={tapMode} className={item ? '' : 'hoverable'} />
                  <span className="lbl">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="tabs" role="tablist">
        {CATS.map((c) => <button key={c.id} role="tab" aria-selected={cat === c.id} className={`rpg-subtab ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      <div className="flex-1 min-h-0 rpg-scroll p-3">
        {cat === 'MATERIAL' && (
          <div className="grid grid-cols-5 gap-1.5 mb-3" aria-label="Crafting shards">
            {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const).map((r) => (
              <div key={r} className="go-tile">
                <div className="v" style={{ color: RARITY_COLOR[r] }}>{materials[r]}</div>
                <div className="l">{r === 'LEGENDARY' ? 'Legend' : r.charAt(0) + r.slice(1).toLowerCase()}</div>
              </div>
            ))}
          </div>
        )}
        <div className="bag-grid">
          {shown.map((it, i) => (
            <ItemSlot key={`${it.id}-${i}`} item={it} fluid size="100%" iconSize="78%" locked={lockedFor(it)} selected={(!!selectedLive && selectedLive === it && shopTab === 'BLACKSMITH') || (!!detailLive && detailLive === it)}
              onClick={() => click(it)} tooltip="sell" noTip={tapMode} />
          ))}
          {Array.from({ length: empty }).map((_, i) => <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }} />)}
        </div>
      </div>
      <div className="bag-foot">
        <span className="flex items-center gap-2 rpg-label"><BagGlyph size={20} /> <span className="rpg-num text-[var(--fg)]">{inventory.length}/{max}</span></span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])} title={`Sorted by ${sort.toLowerCase()}`}>Sort: {sort.charAt(0) + sort.slice(1).toLowerCase()}</Button>
          <Button size="sm" variant="primary" onClick={autoEquip}>Auto equip</Button>
        </div>
      </div>

      {detail && detailLive && (
        <div className="detail-card" data-testid="item-detail">
          <div className="rpg-scroll p-3 flex-1 min-h-0"><ItemTip item={detailLive} compare={!detail.equipped} price="sell" /></div>
          <div className="flex gap-2 p-3 pt-0 flex-wrap">
            {detail.equipped
              ? <Button variant="primary" className="flex-1" onClick={() => { const slot = (detail.item.type.toLowerCase()) as EquipSlot; unequipItem(slot); setDetail(null); }}>Unequip</Button>
              : isGear(detailLive) && <Button variant="primary" className="flex-1" disabled={lockedFor(detailLive)} onClick={() => { equipItem(detailLive); setDetail(null); }}>{lockedFor(detailLive) ? 'Locked' : 'Equip'}</Button>}
            {!detail.equipped && <Button className="flex-1" onClick={() => { setSell(detailLive); setDetail(null); }}>Sell</Button>}
            <Button className="flex-1" onClick={() => setDetail(null)}>Close</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
};
