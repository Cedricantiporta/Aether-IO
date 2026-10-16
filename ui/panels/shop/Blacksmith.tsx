import React, { useEffect, useState } from 'react';
import { ChevronsDown, Hammer, Recycle, RefreshCcw, ArrowRight, Hexagon } from '../../components/GoldIcons';
import { CoinGlyph } from '../../components/SkillIcons';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, questFree, makeItemById } from '../../../store';
import { shardItem } from '../../../shards';
import { useShallow } from 'zustand/react/shallow';
import { SHARD_FUSE_COST, MATERIAL_DOWNGRADE_YIELD } from '../../../constants';
import { coreTierOf, CORE_NAMES, CORE_FUSE, CORE_IDS, CRAFT_SLOTS, CRAFT_RARITIES, SLOT_LABEL, getRecipe, canCraft, recipeTemplates, statRange, lootOwned, recycleYield, recycleYieldAll, CRAFT_PLUS1_CHANCE, CRAFT_PLUS2_CHANCE, type CraftSlot } from '../../../crafting';
import { LOOT_BY_ID } from '../../../loot';
import { Lock } from '../../components/GoldIcons';
import type { Rarity, PlayerStats, Item } from '../../../types';
import { Button } from '../../components/Button';
import { ItemSlot } from '../../components/ItemSlot';
import { AnvilGlyph } from '../../components/ItemArt';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import { Workshop } from './Workshop';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR, RARITY_TEXT, STAT_LABEL, fmtItemStat, upgradeChance, upgradeCoreCost, upgradeGoldCost, upgradeBreakChance, upgradeCoreTier, upgradedStats, MAX_ITEM_LEVEL, isGear } from '../../lib/game';
import { ItemFuse } from './ItemFuse';
import { ReforgeTab } from './Reforge';

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="bs-card flex flex-col items-center gap-3 py-8 px-4 text-center opacity-80">
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
const FreeNote: React.FC = () => <div className="rpg-frame gold w-full p-2 text-[.78rem] text-center" data-testid="forge-free">The smith owes Mira a favour: this upgrade is <b className="text-[var(--good)]">FREE</b> (no gold, no cores, sure success).</div>;
const ForgeEmpty: React.FC<{ free?: boolean }> = ({ free }) => (
  <div className="forge-empty">
    {free && <FreeNote />}
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
  const free = useGameStore((s) => questFree(s, 'forge'));   // tutorial "Temper the Steel": no gold, no cores, sure success
  const [forging, setForging] = useState(false);
  const item = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id) ?? (forging ? selected : null)) : null;   // (a shattered item stays on screen until its cinematic ends)
  const coreTier = selected ? upgradeCoreTier(selected) : 0;   // tiered cores: the one this upgrade needs
  const cores = inventory.filter((i) => coreTierOf(i) === coreTier).reduce((n, i) => n + (i.quantity || 1), 0);

  useEffect(() => {
    if (actionResult?.type === 'UPGRADE' && actionResult.success && actionResult.item) setSelected(actionResult.item);
  }, [actionResult, setSelected]);

  if (!item || !isGear(item)) return <ForgeEmpty free={free} />;
  const maxed = item.level >= MAX_ITEM_LEVEL;
  const goldCost = free ? 0 : upgradeGoldCost(item), coreCost = free ? 0 : upgradeCoreCost(item);
  const chance = free ? 1 : upgradeChance(item), brk = free ? 0 : upgradeBreakChance(item);
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
      : { success: false, item: it, title: r.msg.endsWith('shattered!') ? 'Shattered!' : 'Enhancement Failed', sub: r.msg };
  };
  const keys = Object.keys(item.stats) as (keyof PlayerStats)[];

  return (
    <div className="flex flex-col gap-3 relative">
      <div className="bs-card p-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <ItemSlot item={item} size="5rem" iconSize={38} tooltip="none" compare={false} />
          <div className="text-left">
            <div className="rpg-title text-lg leading-tight" data-rt={item.rarity}>{item.name}</div>
            <div className="rpg-num text-sm text-[var(--text-dim)]">+{item.level - 1} <ArrowRight size={12} className="inline text-[var(--good)]" /> <b className="text-[var(--good)]">+{item.level}</b></div>
          </div>
        </div>
        <div className="w-full bs-cell p-2.5">
          {keys.map((k) => (
            <div key={k} className="tt-row text-[.78rem]"><span className="muted">{STAT_LABEL[k]}</span>
              <span>{fmtItemStat(k, item.stats[k]!)} <ArrowRight size={10} className="inline" /> <b className="pos">{fmtItemStat(k, next[k]!)}</b></span></div>
          ))}
        </div>
        {free && <FreeNote />}
        <div className="w-full flex justify-between text-[.74rem]" style={{ color: '#b9b2a2' }} data-testid="upgrade-chance"><span>Success chance</span><span className="rpg-num" style={{ color: '#e8e2d4' }}>{Math.round(chance * 100)}%</span></div>
        {brk > 0 && !maxed && <div className="w-full text-center text-[.72rem] font-bold" style={{ color: '#f87171' }} data-testid="upgrade-break">Shatter risk: a failed upgrade destroys the item ({Math.round(brk * 100)}% on failure)</div>}
        <div className="grid grid-cols-2 gap-2 w-full">
          <div className="bs-cell text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><CoinGlyph size={12} /> Gold</div>
            <div className="rpg-num" style={{ color: gold >= goldCost ? '#f1ece0' : '#e08a84' }}>{goldCost.toLocaleString()}</div></div>
          <div className="bs-cell text-center py-1.5"><div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1"><Hexagon size={10} /> {CORE_NAMES[coreTier]}s</div>
            <div className="rpg-num" style={{ color: cores >= coreCost ? '#f1ece0' : '#e08a84' }}>{coreCost} <span className="text-[.65rem] opacity-70">/ {cores}</span></div></div>
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


/** Blacksmith > Shards (owner: square tiles + fusion animation): one tile per shard tier (art, count, fuse up / break
 *  down) and one per core tier (fuse 5 -> 1). Fusing plays the forge cinematic with the new shard / core. */
const NEXT_R: Partial<Record<Rarity, Rarity>> = { COMMON: 'RARE', RARE: 'EPIC', EPIC: 'LEGENDARY', LEGENDARY: 'MYTHIC' };
const PREV_R: Partial<Record<Rarity, Rarity>> = { RARE: 'COMMON', EPIC: 'RARE', LEGENDARY: 'EPIC', MYTHIC: 'LEGENDARY' };
const rname = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();
export const ShardTab: React.FC = () => {
  const { materials, combineMaterials, downgradeMaterials, inventory, fuseCores } = useGameStore(useShallow((s) => ({ materials: s.materials, combineMaterials: s.combineMaterials, downgradeMaterials: s.downgradeMaterials, inventory: s.inventory, fuseCores: s.fuseCores })));
  const coreHave = (t: number) => inventory.filter((i) => coreTierOf(i) === t).reduce((n, i) => n + (i.quantity || 1), 0);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);
  const fuseShard = (r: Rarity) => {
    const up = NEXT_R[r]!; const preview = shardItem(up, 1);
    setCine({ preview, run: () => { combineMaterials(r); return { success: true, item: preview, title: 'Fusion Success!', sub: `1 ${rname(up)} Shard` }; } });
  };
  const fuseCore = (t: number) => {
    const preview = makeItemById(CORE_IDS[t + 1], 1)[0];
    setCine({ preview, run: () => { const ok = fuseCores(t); return { success: ok, item: preview, title: ok ? 'Fusion Success!' : 'Cannot fuse', sub: `1 ${CORE_NAMES[t + 1]}` }; } });
  };
  return (
    <div className="flex flex-col gap-3" data-testid="shard-tab">
      <div className="rpg-label">Shards · fuse up (always succeeds) or break down</div>
      <div className="sq-grid">
        {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[]).map((r) => {
          const up = NEXT_R[r], down = PREV_R[r], cost = SHARD_FUSE_COST[r as keyof typeof SHARD_FUSE_COST];
          return (
            <div key={r} className="sq-tile" style={{ ['--rc' as any]: RARITY_COLOR[r] }} data-testid={`shard-tile-${r}`}>
              <div className="sq-art"><ItemSlot item={shardItem(r, 1)} fluid size="100%" iconSize="72%" tooltip="none" /></div>
              <div className="sq-name" style={{ color: RARITY_TEXT[r] }}>{rname(r)}</div>
              <div className="sq-count rpg-num">{materials[r]}</div>
              <div className="sq-btns">
                {up && <button className="wh-btn pe" disabled={materials[r] < cost} onClick={() => fuseShard(r)} title={`${cost} ${rname(r)} -> 1 ${rname(up)}`}>Fuse {cost}</button>}
                {down && <button className="wh-btn pe" disabled={materials[r] < 1} onClick={() => downgradeMaterials(r)} title={`1 ${rname(r)} -> ${MATERIAL_DOWNGRADE_YIELD} ${rname(down)}`}>Break</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rpg-label">Upgrade cores · Upgrade Core: Common / Rare gear · Refined Core: Epic and above</div>
      <div className="sq-grid">
        {[0, 1].map((t) => {
          const it = makeItemById(CORE_IDS[t], 1)[0];
          return (
            <div key={t} className="sq-tile" style={{ ['--rc' as any]: RARITY_COLOR[it.rarity] }} data-testid={`core-tile-${t}`}>
              <div className="sq-art"><ItemSlot item={it} fluid size="100%" iconSize="72%" tooltip="none" /></div>
              <div className="sq-name" style={{ color: RARITY_TEXT[it.rarity] }}>{CORE_NAMES[t]}</div>
              <div className="sq-count rpg-num">{coreHave(t)}</div>
              <div className="sq-btns">{t < 1 && <button className="wh-btn pe" disabled={coreHave(t) < CORE_FUSE} onClick={() => fuseCore(t)} data-testid={`core-fuse-${t}`}>Fuse {CORE_FUSE}</button>}</div>
            </div>
          );
        })}
      </div>
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Fusion Result" noLevel onDone={() => setCine(null)} />}
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
      {item && isGear(item) ? (
        <div className="bs-card p-3 flex items-center gap-3">
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
            <Button key={r} size="sm" disabled={cnt(r) === 0} onClick={() => mass(r)} className="bs-mass" style={{ padding: '.3rem .1rem', flexDirection: 'column', gap: 0, lineHeight: 1.1 }}>
              <span style={{ color: RARITY_TEXT[r], fontSize: '.55rem' }}>{r === 'LEGENDARY' ? 'LEGEND' : r}</span><span className="rpg-num !text-[.7rem] text-white">{cnt(r)}</span>
            </Button>
          ))}
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
        {(['UPGRADE', 'RECYCLE', 'CRAFT', 'FUSE', 'SHARDS', 'REFORGE'] as const).map((t) => <button key={t} className={`rpg-subtab bevel pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'UPGRADE' && <Upgrade />}
      {tab === 'RECYCLE' && <RecycleTab />}
      {tab === 'FUSE' && <ItemFuse />}
      {tab === 'SHARDS' && <ShardTab />}
      {tab === 'REFORGE' && <ReforgeTab />}
      {tab === 'CRAFT' && (<>
        <div className="rpg-frame p-3 text-[.78rem] text-center">The Workshop is open. Pick a recipe on the left, check the materials and forge.</div>
        <Workshop onClose={() => setTab('UPGRADE')} />
      </>)}
    </div>
  );
};
