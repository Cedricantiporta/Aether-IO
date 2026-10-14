import React, { useEffect, useState } from 'react';
import { ChevronsDown, Hammer, Recycle, RefreshCcw, ArrowRight, Hexagon } from 'lucide-react';
import { CoinGlyph } from '../../components/SkillIcons';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { MATERIAL_COMBINE_COST, MATERIAL_DOWNGRADE_YIELD } from '../../../constants';
import { CRAFT_SLOTS, CRAFT_RARITIES, SLOT_LABEL, getRecipe, canCraft, recipeTemplates, statRange, lootOwned, recycleYield, recycleYieldAll, CRAFT_PLUS1_CHANCE, CRAFT_PLUS2_CHANCE, type CraftSlot } from '../../../crafting';
import { LOOT_BY_ID } from '../../../loot';
import { Lock } from 'lucide-react';
import type { Rarity, PlayerStats, Item } from '../../../types';
import { Button } from '../../components/Button';
import { ItemSlot } from '../../components/ItemSlot';
import { AnvilGlyph } from '../../components/ItemArt';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import { Workshop } from './Workshop';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR, RARITY_TEXT, STAT_LABEL, fmtItemStat, upgradeChance, upgradeCoreCost, upgradeGoldCost, upgradedStats, MAX_ITEM_LEVEL, isGear } from '../../lib/game';

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="rpg-frame flex flex-col items-center gap-3 py-8 px-4 text-center opacity-80">
    <div className="forge-orb sm"><AnvilGlyph size={34} glow /></div>
    <div className="rpg-label">{text}</div>
  </div>
);


const Chain: React.FC<{ d: string }> = ({ d }) => (<g><path d={d} stroke="#050304" strokeWidth="6" strokeDasharray="7 4" fill="none" strokeLinecap="round" /><path d={d} stroke="#7a6a58" strokeWidth="3.4" strokeDasharray="7 4" fill="none" strokeLinecap="round" /></g>);
const HammerOrn: React.FC<{ r: number; x: number }> = ({ r, x }) => (
  <g transform={`translate(${x} 46) rotate(${r})`} opacity=".85">
    <rect x="-3" y="-4" width="6" height="64" rx="2" fill="#4a3426" stroke="#050304" strokeWidth="1.5" />
    <rect x="-17" y="-18" width="34" height="18" rx="3" fill="#6a6f7c" stroke="#050304" strokeWidth="1.5" /><path d="M-14 -14 H14" stroke="#aab" strokeOpacity=".5" />
  </g>
);
const ForgeEmpty: React.FC = () => (
  <div className="forge-empty">
    <div className="forge-stage">
      <svg viewBox="0 0 380 190" aria-hidden className="forge-orn">
        <Chain d="M40 6 C60 40 90 70 130 100" /><Chain d="M340 6 C320 40 290 70 250 100" /><Chain d="M10 60 C40 80 70 100 110 120" /><Chain d="M370 60 C340 80 310 100 270 120" />
        <HammerOrn r={-52} x={52} /><HammerOrn r={52} x={328} />
      </svg>
      <div className="forge-ring"><div className="forge-orb"><AnvilGlyph size={64} glow /></div></div>
    </div>
    <div className="forge-text">Select a piece of gear<br />from your bag to upgrade</div>
    <ChevronsDown size={22} className="forge-chev" />
    <div className="forge-slot">+</div>
    <button className="forge-btn" disabled>Upgrade</button>
    <div className="forge-hint">Improve the stats of your equipment.</div>
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

  if (!item || !isGear(item)) return <ForgeEmpty />;
  const maxed = item.level >= MAX_ITEM_LEVEL;
  const goldCost = upgradeGoldCost(item), coreCost = upgradeCoreCost(item);
  const chance = upgradeChance(item);
  const next = upgradedStats(item);
  const can = !maxed && gold >= goldCost && cores >= coreCost && !forging;
  const forge = () => {
    if (!can) return;
    setForging(true);
  };
  const runForge = (): ForgeOutcome => {
    const r = upgradeItem(item);
    const it = r.newItem ?? item;
    return r.success
      ? { success: true, item: it, title: 'Great Success!', sub: `${it.name} reached +${it.level - 1}` }
      : { success: false, item: it, title: 'Enhancement Failed', sub: r.msg };
  };
  const keys = Object.keys(item.stats) as (keyof PlayerStats)[];

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
          <div className="rpg-frame text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><CoinGlyph size={12} /> Gold</div>
            <div className="rpg-num" style={{ color: gold >= goldCost ? '#ffe69a' : '#f87171' }}>{goldCost.toLocaleString()}</div></div>
          <div className="rpg-frame text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><Hexagon size={10} /> Cores</div>
            <div className="rpg-num" style={{ color: cores >= coreCost ? '#7cc4ff' : '#f87171' }}>{coreCost} <span className="text-[.65rem] opacity-70">/ {cores}</span></div></div>
        </div>
        <button className="forge-btn on" disabled={!can} onClick={forge}>
          <Hammer size={20} className={forging ? 'hammer-anim' : ''} /> {maxed ? 'Max level' : forging ? 'Forging...' : 'Upgrade'}
        </button>
        <div className="forge-hint">Improve the stats of your equipment.</div>
        {forging && <ForgeCinematic item={item} run={runForge} onDone={() => setForging(false)} />}
      </div>
    </div>
  );
};

export const RecycleTab: React.FC = () => {
  const { inventory, materials, recycleItem, massRecycle, combineMaterials, downgradeMaterials } = useGameStore(useShallow((s) => ({
    inventory: s.inventory, materials: s.materials, recycleItem: s.recycleItem, massRecycle: s.massRecycle, combineMaterials: s.combineMaterials, downgradeMaterials: s.downgradeMaterials,
  })));
  const selected = useUiStore((s) => s.selectedItem);
  const setSelected = useUiStore((s) => s.setSelectedItem);
  const ask = useUiStore((s) => s.askConfirm);
  const item = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id) ?? null) : null;
  const cnt = (r: Rarity) => inventory.filter((i) => i.rarity === r && isGear(i)).length;
  const yieldTxt = (y: { shards: number; cores: number }, r: Rarity) => `${y.shards} ${r.toLowerCase()} shard(s)${y.cores ? ` + ${y.cores} core(s)` : ''}`;
  const mass = (r: Rarity) => ask({ title: `Recycle all ${r.toLowerCase()}?`, body: `Every ${r.toLowerCase()} piece of gear in your bag (${cnt(r)}) will be destroyed. You receive ${yieldTxt(recycleYieldAll(inventory.filter((i) => i.rarity === r && isGear(i))), r)}.`, confirmLabel: 'Recycle all', tone: 'danger', onConfirm: () => massRecycle(r) });

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
          <div className="text-right">
            <Button variant="danger" onClick={() => ask({ title: `Recycle ${item.name}?`, body: `You receive ${yieldTxt(recycleYield(item), item.rarity)}.`, confirmLabel: 'Recycle', tone: 'danger', onConfirm: () => { recycleItem(item); setSelected(null); } })}><Recycle size={15} /> +{recycleYield(item).shards} {item.rarity.slice(0, 3)}{recycleYield(item).cores > 0 && <> +{recycleYield(item).cores} <Hexagon size={11} /></>}</Button>
            <div className="text-[.6rem] text-[var(--text-dim)] mt-0.5" data-testid="recycle-yield">{yieldTxt(recycleYield(item), item.rarity)}</div>
          </div>
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
        <div className="rpg-label mb-1.5">Shard conversion: combine up</div>
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
      <div>
        <div className="rpg-label mb-1.5">Shard conversion: break down</div>
        <div className="flex flex-col gap-1.5">
          {(['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[]).map((r, i) => {
            const lo = (['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[])[i];
            return (
              <button key={r} disabled={materials[r] < 1} onClick={() => downgradeMaterials(r)} className="rpg-btn !justify-between !normal-case pe" style={{ padding: '.35rem .7rem' }}>
                <span className="text-[.72rem] font-bold">1 <span style={{ color: RARITY_TEXT[r] }}>{r}</span> <ArrowRight size={10} className="inline" /> {MATERIAL_DOWNGRADE_YIELD} <span style={{ color: RARITY_TEXT[lo] }}>{lo}</span></span>
                <RefreshCcw size={13} />
              </button>
            );
          })}
        </div>
      </div>
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
      <div className="grid grid-cols-3 gap-2">
        {(['UPGRADE', 'RECYCLE', 'CRAFT'] as const).map((t) => <button key={t} className={`rpg-subtab bevel pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'UPGRADE' && <Upgrade />}
      {tab === 'RECYCLE' && <RecycleTab />}
      {tab === 'CRAFT' && (<>
        <div className="rpg-frame p-3 text-[.78rem] text-center">The Workshop is open. Pick a recipe on the left, check the materials and forge.</div>
        <Workshop onClose={() => setTab('UPGRADE')} />
      </>)}
    </div>
  );
};
