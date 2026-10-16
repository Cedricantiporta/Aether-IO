import { betterGearIds } from '../lib/alerts';
import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, LayoutGrid, Sword, Shield, Gem, FlaskConical, Hexagon, PawPrint, Ellipsis, Swords, Heart, Wind } from '../components/GoldIcons';
import { useGameStore, calculateTotalCP, calculateItemCP, RANK_REQ, RARITY_COLOR } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { Panel, PanelHead, CurrencyPill } from '../components/Frame';
import { BagGlyph } from '../components/ItemArt';
import { ItemSlot } from '../components/ItemSlot';
import { HERO_ICON } from '../hud/TopBars';
import { useUiStore } from '../uiStore';
import { SORTS, isGear, sortedItems, sellPrice } from '../lib/game';
import { useDrop, reorder } from '../lib/dnd';
import { DropCell } from '../components/DropCell';
import { CoinGlyph } from '../components/SkillIcons';
import { device } from '../../engine/device';

const TYPE_RANK: Record<string, number> = { WEAPON: 9, HELMET: 8, ARMOR: 7, GLOVES: 6, BOOTS: 5, ACCESSORY: 4, PET: 3, POTION: 2, CORE: 1, REVIVE: 0, LOOT: 0 };

/** Paper-doll slot: click to unequip, drag out to the bag, drop a matching bag item on it to equip. */
const RANK: Record<string, number> = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 };

const DollSlot: React.FC<{ slot: EquipSlot; label: string; item: Item | null; onClick: () => void }> = ({ slot, label, item, onClick }) => {
  const equip = useGameStore((s) => s.equipItem);
  const { hot, props } = useDrop((d) => d.from === 'BAG' && d.item.type.toLowerCase() === slot, (d) => equip(d.item));
  return (
    <div className={`flex flex-col items-center gap-1 drop-zone ${hot ? 'drop-hot' : ''}`} {...props}>
      <ItemSlot item={item} size="var(--cell)" iconSize="78%" fluid={false} onClick={item ? onClick : undefined} emptyLabel={label} tooltip="sell" compare={false} className={item ? '' : 'hoverable'}
        drag={item ? { from: 'EQUIP', item, slot } : null} />
      <span className="rpg-label !text-[.5rem]">{label}</span>
    </div>
  );
};

type Cat = 'ALL' | 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'CONSUMABLE' | 'MATERIAL' | 'PET' | 'ETC';
// four top tabs (MMO style): everything / weapons and armour / accessories and pets / consumables, materials, goods
const CATS: { id: Cat; label: string; icon: React.ReactNode }[] = [
  { id: 'ALL', label: 'All', icon: <LayoutGrid size={15} /> }, { id: 'WEAPON', label: 'Equipment', icon: <Sword size={15} /> },
  { id: 'ACCESSORY', label: 'Accessories', icon: <Gem size={15} /> }, { id: 'ETC', label: 'Other', icon: <Ellipsis size={15} /> },
];
const catOf = (it: Item): Cat => it.type === 'WEAPON' || it.type === 'ARMOR' || it.type === 'HELMET' || it.type === 'GLOVES' || it.type === 'BOOTS' ? 'WEAPON'
  : it.type === 'ACCESSORY' || it.type === 'PET' ? 'ACCESSORY' : 'ETC';

export const InventoryPanel: React.FC = () => {
  const { inventory, max, equipment, level, rank, materials, hero, stats } = useGameStore(useShallow((s) => ({
    inventory: s.inventory, max: s.maxInventorySlots, equipment: s.equipment, level: s.level, rank: s.heroRank, materials: s.materials, hero: s.hero, stats: s.stats,
  })));
  const { equipItem, unequipItem, autoEquip, toggleInventory, closeAllUI, invOpen } = useGameStore(useShallow((s) => ({
    equipItem: s.equipItem, unequipItem: s.unequipItem, autoEquip: s.autoEquip, toggleInventory: s.toggleInventory, closeAllUI: s.closeAllUI, invOpen: s.isInventoryOpen,
  })));
  const shopTab = useGameStore((s) => (s.isShopOpen ? s.activeShopTab : null));
  const { selected, setSelected, setSell } = useUiStore(useShallow((s) => ({ selected: s.selectedItem, setSelected: s.setSelectedItem, setSell: s.setSellItem })));
  const gold = useGameStore((s) => s.gold);
  const deleteItems = useGameStore((s) => s.deleteItems);
  const drinkElixir = useGameStore((s) => s.drinkElixir);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [delMode, setDelMode] = useState(false);
  // bulk sell (any shop but the warehouse): pick items, then sell them together; Epic+ gear asks first
  const [sellMode, setSellMode] = useState(false);
  const { sellItem, sellItems, sellAllLoot } = useGameStore(useShallow((s) => ({ sellItem: s.sellItem, sellItems: s.sellItems, sellAllLoot: s.sellAllLoot })));
  const canSell = !!shopTab && shopTab !== 'WAREHOUSE';
  const [delSel, setDelSel] = useState<string[]>([]);
  const toggleDel = (id: string) => setDelSel((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const exitDel = () => { setDelMode(false); setSellMode(false); setDelSel([]); };
  const sellValue = (it: Item) => sellPrice(it) * (it.quantity || 1);
  const bulkSell = () => {
    const picked = inventory.filter((i) => delSel.includes(i.id));
    if (!picked.length) return;
    const go = () => {
      const stacks = picked.filter((i) => (i.quantity || 1) > 1 || i.type === 'LOOT' || i.type === 'SHARD');
      const rest = picked.filter((i) => !stacks.includes(i));
      for (const st of stacks) sellItem(st, st.quantity || 1);
      if (rest.length) sellItems(rest);
      exitDel();
    };
    const precious = picked.filter((i) => i.type !== 'LOOT' && i.type !== 'SHARD' && RANK[i.rarity] >= 2);
    if (precious.length) askConfirm({ title: `Sell ${picked.length} item${picked.length > 1 ? 's' : ''}?`, body: `${precious.length} of them ${precious.length > 1 ? 'are' : 'is'} Epic or better (${precious.slice(0, 3).map((i) => i.name).join(', ')}${precious.length > 3 ? '...' : ''}). Sell anyway?`, confirmLabel: 'Sell', tone: 'danger', onConfirm: go });
    else go();
  };
  const [sortIdx, setSortIdx] = useState(-1);   // last Sort applied (the bag keeps its manual order otherwise)
  const reorderItems = useGameStore((s) => s.reorderItems);
  const [cat, setCat] = useState<Cat>('ALL');
  // phones: beside a shop the bag gets half the screen, so there the paper doll is folded by default (more room for the grid)
  const [equipWide, setEquipWide] = useState(true);
  const [equipSplit, setEquipSplit] = useState(false);
  const split = !!shopTab && document.documentElement.classList.contains('compact');
  const equipOpen = split ? equipSplit : equipWide;
  const setEquipOpen = split ? setEquipSplit : setEquipWide;
  const armed = useRef<string | null>(null);   // touch: the first tap shows the item's tooltip, a second tap equips / drinks
  const HeroIcon = HERO_ICON[hero];

  const sorted = inventory;   // manual order: drag items onto each other to swap them, Sort orders the bag once

  const selectedLive = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id)) : null;

  const lockedFor = (it: Item) => isGear(it) && (RANK_REQ[it.rarity] > rank || (!!it.classType && it.classType !== hero));
  const { deposit, withdraw } = useGameStore(useShallow((s) => ({ deposit: s.depositItem, withdraw: s.withdrawItem })));
  // the bag accepts equipped items (unequip) and warehouse items (withdraw)
  const bagDrop = useDrop((d) => d.from === 'EQUIP' || d.from === 'WAREHOUSE', (d) => { if (d.from === 'EQUIP' && d.slot) unequipItem(d.slot); else withdraw(d.item.id); });
  const click = (it: Item) => {
    if (delMode || sellMode) { toggleDel(it.id); return; }
    if (shopTab === 'WAREHOUSE') { deposit(it.id); return; }
    if (shopTab === 'BLACKSMITH') { setSelected(it); return; }
    if (shopTab === 'SUPPLIES' || shopTab === 'PETS') { setSell(it); return; }
    if (device.touch && armed.current !== it.id) { armed.current = it.id; return; }
    armed.current = null;
    if (it.type === 'ELIXIR') { drinkElixir(it); return; }   // drink: buff for the next run (or the rest of this one)
    if (isGear(it) && !lockedFor(it)) equipItem(it);
  };
  const shown = useMemo(() => (cat === 'ALL' ? sorted : sorted.filter((i) => catOf(i) === cat)), [sorted, cat]);
  // better gear than what is worn: red dot on the item and on its category tab (and ALL)
  const seeItem = useGameStore((s) => s.seeItem);
  const better = useMemo(() => betterGearIds(inventory, equipment, hero, rank), [inventory, equipment, hero, rank]);
  const betterCats = useMemo(() => { const c = new Set<string>(); for (const i of inventory) if (better.has(i.id)) { c.add(catOf(i)); c.add('ALL'); } return c; }, [inventory, better]);
  const empty = cat === 'ALL' ? Math.max(0, max - inventory.length) : Math.max(0, Math.max(12, Math.ceil(shown.length / 4) * 4 + 4) - shown.length);
  const chips: [React.ReactNode, string, string][] = [
    [<Heart size={12} key="h" />, 'HP', String(Math.round(stats.maxHealth))], [<Swords size={12} key="d" />, 'DMG', String(Math.round(stats.damage))],
    [<Shield size={12} key="s" />, 'DEF', stats.defense.toFixed(0)], [<Wind size={12} key="w" />, 'SPD', stats.moveSpeed.toFixed(1)],
  ];

  return (
    <motion.div initial={{ x: '-105%' }} animate={{ x: 0 }} exit={{ x: '-105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex side-panel bag-side" style={{ left: '.7rem', top: '.7rem', bottom: '.7rem', width: '30rem', zIndex: 40 }}>
      <Panel className={`flex flex-col w-full min-h-0 drop-zone ${bagDrop.hot ? 'drop-hot' : ''}`} {...bagDrop.props}>
        <PanelHead icon={<BagGlyph size={34} />} title="Bag" onClose={invOpen ? toggleInventory : closeAllUI}
          right={<CurrencyPill icon={null} label="CP" value={calculateTotalCP(stats).toLocaleString()} />} />
        {/* equipped (collapsible paper doll) */}
        <div className="bag-equip">
          <button className="bag-equip-head" onClick={() => setEquipOpen((v) => !v)} aria-expanded={equipOpen}>
            <span className="flex items-center gap-1.5"><HeroIcon size={14} /> Equipped <span className="rpg-num text-white">Lv {level}</span></span>
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
        <div className="flex-1 min-h-0 flex flex-col">
          <nav className="bag-tabs">
            {CATS.map((c) => (
              <button key={c.id} className={`bag-tab relative ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)}>{c.icon}<span>{c.label}</span>{betterCats.has(c.id) && <i className="red-dot" data-testid="cat-dot" />}</button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 min-h-0 rpg-scroll p-2.5">
            <div className="bag-grid slot-grid">
              {shown.map((it, i) => (
                <DropCell key={`${it.id}-${i}`} accept={(d) => d.from === 'BAG' && d.item.id !== it.id} onDrop={(d) => reorderItems('inventory', reorder(inventory, d.item.id, it.id))}>
                  <ItemSlot item={it} fluid size="100%" iconSize="78%" locked={lockedFor(it)} onSeen={it.isNew ? () => seeItem(it.id) : undefined} selected={!!selectedLive && selectedLive === it && shopTab === 'BLACKSMITH'}
                    onClick={() => click(it)} tooltip="sell" drag={delMode || sellMode ? null : { from: 'BAG', item: it }} className={(delMode || sellMode) && delSel.includes(it.id) ? (sellMode ? 'is-sell' : 'is-del') : delMode || sellMode ? 'del-pick' : ''}>
                    {better.has(it.id) ? <i className="red-dot" data-testid="item-dot" /> : it.isNew ? <i className="new-dot" data-testid="new-dot" /> : null}
                  </ItemSlot>
                </DropCell>
              ))}
              {Array.from({ length: empty }).map((_, i) => (
                <DropCell key={`e${i}`} accept={(d) => d.from === 'BAG'} onDrop={(d) => reorderItems('inventory', reorder(inventory, d.item.id, null))}>
                  <div className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>
                </DropCell>
              ))}
            </div>
          </div>
        </div>
        <div className="bag-foot">
          <div className="bag-foot-btns">
            {sellMode ? (<>
              <button className="rpg-btn rpg-btn-sm" onClick={exitDel}>Cancel</button>
              <button className="rpg-btn rpg-btn-primary rpg-btn-sm" disabled={!delSel.length} data-testid="bag-sell-go" onClick={bulkSell}>
                Sell ({delSel.length}) · {inventory.filter((i) => delSel.includes(i.id)).reduce((n, i) => n + sellValue(i), 0).toLocaleString()}g</button>
            </>) : delMode ? (<>
              <button className="rpg-btn rpg-btn-sm" onClick={exitDel}>Cancel</button>
              <button className="rpg-btn rpg-btn-sm bag-del-go" disabled={!delSel.length} data-testid="bag-del-go"
                onClick={() => askConfirm({ title: `Delete ${delSel.length} item${delSel.length > 1 ? 's' : ''}?`, body: 'They are destroyed for good (no gold back). Sell them at a shop instead if you want gold.', confirmLabel: 'Delete', tone: 'danger', onConfirm: () => { deleteItems(delSel); exitDel(); } })}>Delete ({delSel.length})</button>
            </>) : (<>
              {canSell && <button className="rpg-btn rpg-btn-sm" onClick={() => sellAllLoot()} title="Sell every monster loot stack" data-testid="bag-sell-loot">Sell loot</button>}
              {canSell && <button className="rpg-btn rpg-btn-sm" onClick={() => setSellMode(true)} title="Select items to sell together" data-testid="bag-bulk-sell">Bulk sell</button>}
              <button className="rpg-btn rpg-btn-sm" onClick={() => setDelMode(true)} title="Select items to delete" data-testid="bag-del">Delete</button>
              <button className="rpg-btn rpg-btn-sm" onClick={() => { const n = (sortIdx + 1) % SORTS.length; setSortIdx(n); reorderItems('inventory', sortedItems(inventory, SORTS[n], calculateItemCP)); }}
                title={`Sort by ${SORTS[(sortIdx + 1) % SORTS.length].toLowerCase()}`}>Sort</button>
              <button className="rpg-btn rpg-btn-primary rpg-btn-sm" onClick={autoEquip}>Auto equip</button>
            </>)}
          </div>
          <div className="bag-foot-info">
            <span className="flex items-center gap-1.5 rpg-label !text-[.66rem]"><BagGlyph size={16} /> <span className="rpg-num text-white">{inventory.length}/{max}</span></span>
            <span className="bag-gold" data-testid="bag-gold"><CoinGlyph size={14} /><span className="rpg-num">{gold.toLocaleString()}</span></span>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
};
