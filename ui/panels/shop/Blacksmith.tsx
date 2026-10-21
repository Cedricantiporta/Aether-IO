import React, { useEffect, useState } from 'react';
import { useDrop } from '../../lib/dnd';
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
import { useCraftAlert } from '../../lib/alerts';
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

/** (owner) Drop zone: drag a piece of gear from the bag or straight from the equipped slots onto the upgrade / reforge slot. */
export const GearDrop: React.FC<{ onItem: (it: Item) => void; children: React.ReactNode }> = ({ onItem, children }) => {
  const { hot, props } = useDrop((d) => (d.from === 'BAG' || d.from === 'EQUIP') && isGear(d.item) && d.item.type !== 'PET', (d) => onItem(d.item));
  return <div className={hot ? 'drop-hot' : undefined} {...props}>{children}</div>;
};

export const Upgrade: React.FC = () => {
  const { inventory, equipment, gold, upgradeItem, actionResult } = useGameStore(useShallow((s) => ({ inventory: s.inventory, equipment: s.equipment, gold: s.gold, upgradeItem: s.upgradeItem, actionResult: s.actionResult })));
  const selected = useUiStore((s) => s.selectedItem);
  const setSelected = useUiStore((s) => s.setSelectedItem);
  const free = useGameStore((s) => questFree(s, 'forge'));   // tutorial "Temper the Steel": no gold, no cores, sure success
  const [forging, setForging] = useState(false);
  const worn = Object.values(equipment).filter((i): i is NonNullable<typeof i> => !!i);   // equipped gear can be upgraded too (drag it from the equipped slots)
  const item = selected ? (inventory.find((i) => i === selected) ?? inventory.find((i) => i.id === selected.id) ?? worn.find((i) => i.id === selected.id) ?? (forging ? selected : null)) : null;   // (a shattered item stays on screen until its cinematic ends)
  const coreTier = selected ? upgradeCoreTier(selected) : 0;   // tiered cores: the one this upgrade needs
  const cores = inventory.filter((i) => coreTierOf(i) === coreTier).reduce((n, i) => n + (i.quantity || 1), 0);

  useEffect(() => {
    if (actionResult?.type === 'UPGRADE' && actionResult.success && actionResult.item) setSelected(actionResult.item);
  }, [actionResult, setSelected]);

  if (!item || !isGear(item)) return <GearDrop onItem={setSelected}><ForgeEmpty free={free} /></GearDrop>;
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

  // (owner reference: enchant screen) "+8 -> +9" header, the item in an ornate diamond frame between the material
  // circle (cores, left) and the success-chance circle (right), stat rows old > new, big red Upgrade with the gold cost.
  return (
    <GearDrop onItem={setSelected}><div className="enc relative" data-testid="upgrade-view">
      <div className="enc-lv">
        <span className="rpg-num">+{item.level - 1}</span>
        <i className="enc-arrow" aria-hidden><b /><b /><b /></i>
        <span className="rpg-num nx">{maxed ? 'MAX' : `+${item.level}`}</span>
      </div>
      <div className="enc-stage">
        <svg className="enc-orn" viewBox="0 0 360 200" aria-hidden>
          <path d="M20 100 H118 M242 100 H340" />
          <path d="M180 18 L262 100 L180 182 L98 100 Z" className="o1" />
          <path d="M180 32 L248 100 L180 168 L112 100 Z" className="o2" />
          <path d="M180 4 V18 M180 182 V196 M88 100 l10 -6 v12 Z M272 100 l-10 -6 v12 Z" className="o3" />
        </svg>
        <div className={`enc-mat ${cores >= coreCost ? '' : 'short'}`} title={`${CORE_NAMES[coreTier]}s`}>
          <Hexagon size={30} />
          <span className="rpg-num">{cores}/{coreCost}</span>
        </div>
        <div className="enc-item" style={{ ['--rc' as any]: RARITY_COLOR[item.rarity] }}>
          <ItemSlot item={item} size="4.6rem" iconSize={40} tooltip="none" compare={false} />
        </div>
        <div className={`enc-mat chance ${chance < 0.5 ? 'low' : ''}`} data-testid="upgrade-chance" title="Success chance">
          <b className="rpg-num">{Math.round(chance * 100)}%</b>
          <span>chance</span>
        </div>
      </div>
      <div className="enc-name rpg-title" data-rt={item.rarity}>{item.name}</div>
      <div className="enc-sub">{CORE_NAMES[coreTier]} x{coreCost}</div>
      <div className="enc-stats">
        {keys.map((k) => (
          <div key={k} className="enc-row"><span>{STAT_LABEL[k]}</span>
            <span className="rpg-num">{fmtItemStat(k, item.stats[k]!)}</span><i aria-hidden>&gt;</i><b className="rpg-num">{fmtItemStat(k, next[k]!)}</b></div>
        ))}
      </div>
      {free && <FreeNote />}
      {brk > 0 && !maxed && <div className="enc-warn" data-testid="upgrade-break">Shatter risk: a failed upgrade destroys the item ({Math.round(brk * 100)}% on failure)</div>}
      <button className="enc-btn" disabled={!can} onClick={forge}>
        <span className="enc-btn-t"><Hammer size={18} className={forging ? 'hammer-anim' : ''} /> {maxed ? 'Max level' : forging ? 'Forging...' : 'Upgrade'}</span>
        {!maxed && <span className="enc-btn-c rpg-num" style={{ color: gold >= goldCost ? undefined : '#ffb4a8' }}><CoinGlyph size={14} /> {goldCost.toLocaleString()}</span>}
      </button>
      {forging && <ForgeCinematic item={item} run={runForge} onDone={() => setForging(false)} />}
    </div></GearDrop>
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
  /** (owner) fuse up to 10 at once: n fusions in one cinematic */
  const fuseShard = (r: Rarity, n = 1) => {
    const up = NEXT_R[r]!; const preview = shardItem(up, n);
    setCine({ preview, run: () => { for (let i = 0; i < n; i++) combineMaterials(r); return { success: true, item: preview, title: 'Fusion Success!', sub: `${n} ${rname(up)} Shard${n > 1 ? 's' : ''}` }; } });
  };
  const fuseCore = (t: number, n = 1) => {
    const preview = makeItemById(CORE_IDS[t + 1], n)[0];
    setCine({ preview, run: () => { let k = 0; for (let i = 0; i < n; i++) if (fuseCores(t)) k++; return { success: k > 0, item: preview, title: k ? 'Fusion Success!' : 'Cannot fuse', sub: `${k} ${CORE_NAMES[t + 1]}${k > 1 ? 's' : ''}` }; } });
  };
  const many = (have: number, cost: number) => Math.min(10, Math.floor(have / cost));
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
                {up && many(materials[r], cost) >= 2 && <button className="wh-btn pe" onClick={() => fuseShard(r, many(materials[r], cost))} title={`${many(materials[r], cost) * cost} ${rname(r)} -> ${many(materials[r], cost)} ${rname(up)}`}>x{many(materials[r], cost)}</button>}
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
              <div className="sq-btns">{t < 1 && <button className="wh-btn pe" disabled={coreHave(t) < CORE_FUSE} onClick={() => fuseCore(t)} data-testid={`core-fuse-${t}`}>Fuse {CORE_FUSE}</button>}{t < 1 && many(coreHave(t), CORE_FUSE) >= 2 && <button className="wh-btn pe" onClick={() => fuseCore(t, many(coreHave(t), CORE_FUSE))} data-testid={`core-fuse-many-${t}`}>x{many(coreHave(t), CORE_FUSE)}</button>}</div>
            </div>
          );
        })}
      </div>
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Fusion Result" noLevel onDone={() => setCine(null)} />}
    </div>
  );
};

export const BlacksmithTab: React.FC = () => {
  const tab = useUiStore((s) => s.blacksmithTab);
  const setTab = useUiStore((s) => s.setBlacksmithTab);
  const craftDot = useCraftAlert();
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
        {(['UPGRADE', 'CRAFT', 'FUSE', 'SHARDS', 'REFORGE'] as const).map((t) => <button key={t} className={`rpg-subtab bevel pe relative ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}{t === 'CRAFT' && craftDot && <i className="red-dot" data-testid="craft-tab-dot" />}</button>)}
      </div>
      {tab === 'UPGRADE' && <Upgrade />}
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
