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
  const [o, setO] = useState<BulkSellOpts>({ rarities: ['COMMON'], loot: true, craftMats: false });
  const pick = bulkSellPick(inventory, o);
  const tierCount = (r: Rarity) => bulkSellPick(inventory, { rarities: [r], loot: false, craftMats: false }).count;
  const toggle = (r: Rarity) => setO((p) => ({ ...p, rarities: p.rarities.includes(r) ? p.rarities.filter((x) => x !== r) : [...p.rarities, r] }));
  const go = () => { bulkSell(o); onClose(); };
  const risky = o.rarities.some((r) => r === 'EPIC' || r === 'LEGENDARY' || r === 'MYTHIC') || o.craftMats;
  return (
    <Modal open portal ribbon title="Bulk sell" tone="gold" width="22rem" z={180} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="bulk-sell">
        <div className="bk-sec">Gear tiers</div>
        <div className="bk-tiers">
          {RARITIES.map((r) => (
            <button key={r} className={`bk-chip pe ${o.rarities.includes(r) ? 'on' : ''}`} style={{ ['--rc' as any]: RARITY_COLOR[r] }} onClick={() => toggle(r)} data-testid={`bk-${r}`}>
              <span>{r === 'LEGENDARY' ? 'Legend' : r.charAt(0) + r.slice(1).toLowerCase()}</span><b>{tierCount(r)}</b>
            </button>
          ))}
        </div>
        <div className="bk-sec">Loot</div>
        <label className="bk-row pe"><input type="checkbox" checked={o.loot} onChange={(e) => setO((p) => ({ ...p, loot: e.target.checked }))} data-testid="bk-loot" /> Monster loot and fish <em>(not used in crafting)</em></label>
        <label className="bk-row pe"><input type="checkbox" checked={o.craftMats} onChange={(e) => setO((p) => ({ ...p, craftMats: e.target.checked }))} data-testid="bk-mats" /> Include crafting materials</label>
        <div className="bk-sum">Selling <b>{pick.count}</b> item{pick.count === 1 ? '' : 's'} for <b className="g">{pick.gold.toLocaleString()} G</b><em>Equipped gear, cores, shards and reforge tools are never sold.</em></div>
        <div className="flex gap-1.5 justify-end">
          <button className="ax-btn pe" onClick={onClose}>Cancel</button>
          <button className="ax-btn gold pe" disabled={!pick.count} data-testid="bk-go"
            onClick={() => (risky ? ask({ title: 'Are you sure?', body: `Sell ${pick.count} items for ${pick.gold.toLocaleString()} G? This cannot be undone.`, confirmLabel: 'Sell', tone: 'danger', onConfirm: go }) : go())}>Sell</button>
        </div>
      </div>
    </Modal>
  );
};
