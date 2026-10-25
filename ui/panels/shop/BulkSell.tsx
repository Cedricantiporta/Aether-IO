import React, { useState } from 'react';
import { useGameStore, bulkSellPick } from '../../../store';
import { Modal } from '../../components/Modal';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR } from '../../lib/game';
import type { Rarity } from '../../../types';
import type { BulkSellOpts } from '../../../storeTypes';

/** Bulk sell popup (every shop's footer): pick gear tiers, plus loot (non-craft) and/or craft materials; live preview. */
export const BulkSellPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const inventory = useGameStore((s) => s.inventory);
  const bulkSell = useGameStore((s) => s.bulkSell);
  const ask = useUiStore((s) => s.askConfirm);
  const [o, setO] = useState<BulkSellOpts>({ rarities: [], loot: true, craftMats: false });   // (owner) no gear tier preselected
  const [mode, setMode] = useState<'ITEMS' | 'MATERIALS'>('ITEMS');   // MATERIALS: sell ONLY crafting materials of the ticked rarities
  const [matR, setMatR] = useState<Rarity[]>([]);
  const matOpts: BulkSellOpts = { rarities: [], loot: false, craftMats: true, matRarities: matR };
  const matCount = (r: Rarity) => bulkSellPick(inventory, { rarities: [], loot: false, craftMats: true, matRarities: [r] }).count;
  const toggleMat = (r: Rarity) => setMatR((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const eff = mode === 'MATERIALS' ? matOpts : o;
  const pick = bulkSellPick(inventory, eff);
  const tierCount = (r: Rarity) => bulkSellPick(inventory, { rarities: [r], loot: false, craftMats: false }).count;
  const lootN = bulkSellPick(inventory, { rarities: [], loot: true, craftMats: false }).count, matN = bulkSellPick(inventory, { rarities: [], loot: false, craftMats: true }).count;
  const toggle = (r: Rarity) => setO((p) => ({ ...p, rarities: p.rarities.includes(r) ? p.rarities.filter((x) => x !== r) : [...p.rarities, r] }));
  const go = () => { bulkSell(eff); onClose(); };
  const risky = mode === 'MATERIALS' ? matR.some((r) => r !== 'COMMON' && r !== 'UNCOMMON') : o.rarities.some((r) => r === 'EPIC' || r === 'LEGENDARY' || r === 'MYTHIC') || o.craftMats;
  return (
    <Modal open portal ribbon title="Bulk sell" tone="gold" width="22rem" z={180} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="bulk-sell">
        <div className="flex gap-1.5">
          <button className={`bk-chip pe ${mode === 'ITEMS' ? 'on' : ''}`} onClick={() => setMode('ITEMS')} data-testid="bk-mode-items"><span>Gear and loot</span></button>
          <button className={`bk-chip pe ${mode === 'MATERIALS' ? 'on' : ''}`} onClick={() => setMode('MATERIALS')} data-testid="bk-mode-mats"><span>Materials</span></button>
        </div>
        {mode === 'MATERIALS' ? (<>
          <div className="bk-sec">Crafting materials by rarity</div>
          <div className="bk-tiers" data-testid="bk-mat-tiers">
            {RARITIES.map((r) => (
              <button key={r} className={`bk-chip pe ${matR.includes(r) ? 'on' : ''}`} style={{ ['--rc' as any]: RARITY_COLOR[r] }} onClick={() => toggleMat(r)} data-testid={`bk-mat-${r}`}>
                <span>{r === 'LEGENDARY' ? 'Legend' : r.charAt(0) + r.slice(1).toLowerCase()}</span><b>{matCount(r)}</b>
              </button>
            ))}
          </div>
        </>) : (<>
        <div className="bk-sec">Gear tiers</div>
        <div className="bk-tiers">
          {RARITIES.map((r) => (
            <button key={r} className={`bk-chip pe ${o.rarities.includes(r) ? 'on' : ''}`} style={{ ['--rc' as any]: RARITY_COLOR[r] }} onClick={() => toggle(r)} data-testid={`bk-${r}`}>
              <span>{r === 'LEGENDARY' ? 'Legend' : r.charAt(0) + r.slice(1).toLowerCase()}</span><b>{tierCount(r)}</b>
            </button>
          ))}
        </div>
        <div className="bk-sec flex items-center justify-between">Loot
          <button className="ax-btn pe" style={{ padding: '.1rem .6rem', fontSize: '.62rem' }} onClick={() => setO({ rarities: [], loot: true, craftMats: true })} data-testid="bk-loot-only">Loot only</button>
        </div>
        <label className="bk-row pe"><input type="checkbox" checked={o.loot} onChange={(e) => setO((p) => ({ ...p, loot: e.target.checked }))} data-testid="bk-loot" /> Monster loot and fish <b className="bk-n">{lootN}</b> <em>(not used in crafting)</em></label>
        <label className="bk-row pe"><input type="checkbox" checked={o.craftMats} onChange={(e) => setO((p) => ({ ...p, craftMats: e.target.checked }))} data-testid="bk-mats" /> Crafting materials and ingredients <b className="bk-n">{matN}</b></label>
        </>)}
        <div className="bk-sum">Selling <b>{pick.count}</b> item{pick.count === 1 ? '' : 's'} for <b className="g">{pick.gold.toLocaleString()} G</b><em>Equipped gear, potions, cores, shards and reforge tools are never sold.</em></div>
        <div className="flex gap-1.5 justify-end">
          <button className="ax-btn pe" onClick={onClose}>Cancel</button>
          <button className="ax-btn gold pe" disabled={!pick.count} data-testid="bk-go"
            onClick={() => (risky ? ask({ title: 'Are you sure?', body: `Sell ${pick.count} items for ${pick.gold.toLocaleString()} G? This cannot be undone.`, confirmLabel: 'Sell', tone: 'danger', onConfirm: go }) : go())}>Sell</button>
        </div>
      </div>
    </Modal>
  );
};
