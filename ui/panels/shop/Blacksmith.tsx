import React, { useEffect, useState } from 'react';
import { Anvil, Hammer, Recycle, RefreshCcw, PenTool, ArrowRight, Coins, Hexagon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { CRAFTING_COSTS, MATERIAL_COMBINE_COST, RECYCLE_YIELDS } from '../../../constants';
import type { Rarity, PlayerStats } from '../../../types';
import { Button } from '../../components/Button';
import { ItemSlot } from '../../components/ItemSlot';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR, RARITY_TEXT, STAT_LABEL, fmtItemStat, upgradeChance, upgradeCoreCost, upgradeGoldCost, upgradedStats, MAX_ITEM_LEVEL, isGear } from '../../lib/game';

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="rpg-frame flex flex-col items-center gap-3 py-8 px-4 text-center opacity-80">
    <div className="rpg-medallion" style={{ width: '4.4rem', height: '4.4rem', ['--mc' as any]: '#55505e' }}><Anvil size={30} /></div>
    <div className="rpg-label">{text}</div>
  </div>
);

export const Upgrade: React.FC = () => {
  const { inventory, gold, upgradeItem, actionResult } = useGameStore(useShallow((s) => ({ inventory: s.inventory, gold: s.gold, upgradeItem: s.upgradeItem, actionResult: s.actionResult })));
  const selected = useUiStore((s) => s.selectedItem);
  const setSelected = useUiStore((s) => s.setSelectedItem);
  const [forging, setForging] = useState(false);
  const item = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id) ?? null) : null;
  const cores = inventory.filter((i) => i.type === 'CORE').reduce((n, i) => n + (i.quantity || 1), 0);

  useEffect(() => {
    if (actionResult?.type === 'UPGRADE' && actionResult.success && actionResult.item) setSelected(actionResult.item);
  }, [actionResult, setSelected]);

  if (!item || !isGear(item)) return <Empty text="Select a piece of gear from your bag to upgrade" />;
  const maxed = item.level >= MAX_ITEM_LEVEL;
  const goldCost = upgradeGoldCost(item), coreCost = upgradeCoreCost(item);
  const chance = upgradeChance(item);
  const next = upgradedStats(item);
  const can = !maxed && gold >= goldCost && cores >= coreCost && !forging;
  const forge = () => {
    if (!can) return;
    setForging(true);
    setTimeout(() => { upgradeItem(item); setForging(false); }, 700);
  };
  const keys = Object.keys(item.stats) as (keyof PlayerStats)[];
  const res = actionResult?.type === 'UPGRADE' ? actionResult : null;

  return (
    <div className="flex flex-col gap-3 relative">
      <div className="rpg-frame gold p-4 flex flex-col items-center gap-2" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(255,120,30,.22), rgba(0,0,0,.5) 70%)' }}>
        <div className="flex items-center gap-3">
          <ItemSlot item={item} size="5rem" iconSize={38} tooltip="none" compare={false} />
          <div className="text-left">
            <div className="rpg-title text-lg leading-tight" data-rt={item.rarity}>{item.name}</div>
            <div className="rpg-num text-sm text-[var(--text-dim)]">+{item.level - 1} <ArrowRight size={12} className="inline text-[var(--good)]" /> <b className="text-[var(--good)]">+{item.level}</b></div>
          </div>
        </div>
        <div className="w-full rpg-parchment p-2.5">
          {keys.map((k) => (
            <div key={k} className="tt-row text-[.78rem]"><span className="muted">{STAT_LABEL[k]}</span>
              <span>{fmtItemStat(k, item.stats[k]!)} <ArrowRight size={10} className="inline" /> <b className="pos">{fmtItemStat(k, next[k]!)}</b></span></div>
          ))}
        </div>
        <div className="w-full">
          <div className="flex justify-between rpg-label !text-[.6rem] mb-1"><span>Success chance</span><span className="rpg-num !text-[.75rem]" style={{ color: chance >= 1 ? '#4ade80' : chance >= .6 ? '#e9b949' : '#f87171' }}>{Math.round(chance * 100)}%</span></div>
          <div className="rpg-bar thin" style={{ ['--fill' as any]: chance, ['--bc' as any]: chance >= 1 ? '#4ade80' : chance >= .6 ? '#e9b949' : '#f87171' }}><div className="fill" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <div className="rpg-frame text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><Coins size={10} /> Gold</div>
            <div className="rpg-num" style={{ color: gold >= goldCost ? '#ffe69a' : '#f87171' }}>{goldCost.toLocaleString()}</div></div>
          <div className="rpg-frame text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><Hexagon size={10} /> Cores</div>
            <div className="rpg-num" style={{ color: cores >= coreCost ? '#7cc4ff' : '#f87171' }}>{coreCost} <span className="text-[.65rem] opacity-70">/ {cores}</span></div></div>
        </div>
        <Button variant="danger" size="lg" className="w-full" disabled={!can} onClick={forge}>
          <Hammer size={20} className={forging ? 'hammer-anim' : ''} /> {maxed ? 'Max level' : forging ? 'Forging...' : 'Forge'}
        </Button>
        <AnimatePresence>
          {res && (
            <motion.div key={res.message + res.success} initial={{ scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center pointer-events-none" style={{ background: res.success ? 'radial-gradient(circle, rgba(255,230,150,.55), transparent 70%)' : 'radial-gradient(circle, rgba(200,30,30,.45), transparent 70%)' }}>
              <div className="rpg-ribbon" data-tone={res.success ? 'gold' : 'red'} style={{ fontSize: '1.2rem' }}>{res.message}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const RecycleTab: React.FC = () => {
  const { inventory, materials, recycleItem, massRecycle, combineMaterials } = useGameStore(useShallow((s) => ({
    inventory: s.inventory, materials: s.materials, recycleItem: s.recycleItem, massRecycle: s.massRecycle, combineMaterials: s.combineMaterials,
  })));
  const selected = useUiStore((s) => s.selectedItem);
  const setSelected = useUiStore((s) => s.setSelectedItem);
  const ask = useUiStore((s) => s.askConfirm);
  const item = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id) ?? null) : null;
  const cnt = (r: Rarity) => inventory.filter((i) => i.rarity === r && isGear(i)).length;
  const mass = (r: Rarity) => ask({ title: `Recycle all ${r.toLowerCase()}?`, body: `Every ${r.toLowerCase()} piece of gear in your bag (${cnt(r)}) will be destroyed for materials.`, confirmLabel: 'Recycle all', tone: 'danger', onConfirm: () => massRecycle(r) });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="rpg-label mb-1.5">Materials</div>
        <div className="grid grid-cols-5 gap-1.5">
          {RARITIES.map((r) => (
            <div key={r} className="rpg-frame text-center py-1.5" style={{ boxShadow: `inset 0 0 0 1px ${RARITY_COLOR[r]}88, inset 0 3px 8px rgba(0,0,0,.6)` }}>
              <div className="rpg-label !text-[.5rem]" style={{ color: RARITY_TEXT[r] }}>{r === 'LEGENDARY' ? 'LEGEND' : r}</div>
              <div className="rpg-num text-base">{materials[r]}</div>
            </div>
          ))}
        </div>
      </div>
      {item && isGear(item) ? (
        <div className="rpg-frame p-3 flex items-center gap-3">
          <ItemSlot item={item} size="3.8rem" iconSize={28} tooltip="sell" />
          <div className="flex-1 min-w-0"><div className="font-bold leading-tight" style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}</div></div>
          <Button variant="danger" onClick={() => { recycleItem(item); setSelected(null); }}><Recycle size={15} /> +{RECYCLE_YIELDS[item.rarity]} {item.rarity.slice(0, 3)}</Button>
        </div>
      ) : <Empty text="Select an item from your bag to recycle" />}
      <div>
        <div className="rpg-label mb-1.5">Mass recycle</div>
        <div className="grid grid-cols-5 gap-1.5">
          {RARITIES.map((r) => (
            <Button key={r} size="sm" disabled={cnt(r) === 0} onClick={() => mass(r)} style={{ padding: '.25rem .1rem', flexDirection: 'column', gap: 0, borderColor: RARITY_COLOR[r], lineHeight: 1.1 }}>
              <span style={{ color: RARITY_COLOR[r], fontSize: '.55rem' }}>{r === 'LEGENDARY' ? 'LEGEND' : r}</span><span className="rpg-num !text-[.7rem] text-white">{cnt(r)}</span>
            </Button>
          ))}
        </div>
      </div>
      <div>
        <div className="rpg-label mb-1.5">Material conversion</div>
        <div className="flex flex-col gap-1.5">
          {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]).map((r, i) => {
            const nx = (['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[])[i];
            const can = materials[r] >= MATERIAL_COMBINE_COST;
            return (
              <button key={r} disabled={!can} onClick={() => combineMaterials(r)} className="rpg-btn !justify-between !normal-case pe" style={{ padding: '.35rem .7rem' }}>
                <span className="text-[.72rem] font-bold">{MATERIAL_COMBINE_COST} <span style={{ color: RARITY_TEXT[r] }}>{r}</span> <ArrowRight size={10} className="inline" /> 1 <span style={{ color: RARITY_TEXT[nx] }}>{nx}</span></span>
                <RefreshCcw size={13} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CraftTab: React.FC = () => {
  const { materials, craftItem } = useGameStore(useShallow((s) => ({ materials: s.materials, craftItem: s.craftItem })));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rpg-label text-center">Craft random equipment from shards</div>
      {RARITIES.map((r) => {
        const cost = CRAFTING_COSTS[r], own = materials[r], can = own >= cost;
        return (
          <button key={r} disabled={!can} onClick={() => craftItem(r)} className="rpg-frame flex items-center gap-3 p-2.5 text-left pe transition-transform active:scale-[.98] disabled:opacity-55"
            style={{ boxShadow: `inset 0 0 0 2px ${RARITY_COLOR[r]}aa, inset 0 3px 10px rgba(0,0,0,.6)` }}>
            <div className="rpg-slot" data-rarity={r} style={{ ['--slot' as any]: '3.2rem' }}><span className="slot-icon"><PenTool size={22} color={RARITY_TEXT[r]} /></span></div>
            <div className="flex-1">
              <div className="rpg-title text-sm" style={{ color: RARITY_TEXT[r] }}>{r === 'LEGENDARY' ? 'Legend' : r.charAt(0) + r.slice(1).toLowerCase()} gear</div>
              <div className="text-[.68rem] text-[var(--text-dim)]">Random {r.toLowerCase()} equipment</div>
            </div>
            <div className="text-right"><div className="rpg-num" style={{ color: can ? '#fff' : '#f87171' }}>{cost} shards</div><div className="text-[.62rem] text-[var(--text-dim)]">Own {own}</div></div>
          </button>
        );
      })}
    </div>
  );
};

export const BlacksmithTab: React.FC = () => {
  const tab = useUiStore((s) => s.blacksmithTab);
  const setTab = useUiStore((s) => s.setBlacksmithTab);
  const clear = useGameStore((s) => s.clearActionResult);
  const actionResult = useGameStore((s) => s.actionResult);
  useEffect(() => {
    if (!actionResult) return;
    const t = setTimeout(clear, 2000);
    return () => clearTimeout(t);
  }, [actionResult, clear]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {(['UPGRADE', 'RECYCLE', 'CRAFT'] as const).map((t) => <button key={t} className={`rpg-subtab pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'UPGRADE' && <Upgrade />}
      {tab === 'RECYCLE' && <RecycleTab />}
      {tab === 'CRAFT' && <CraftTab />}
    </div>
  );
};
