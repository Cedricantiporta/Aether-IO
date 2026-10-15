// Blacksmith > Fuse: pick 5 bag gear pieces of one tier (or offer 5 shards of one tier) for a chance at one of the next
// tier; a failed fusion leaves one of the same tier (store.fuseItems / fuseShards, odds in petFusion.ts).
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { FUSE_COUNT, FUSE_CHANCE, nextTier } from '../../../petFusion';
import { RARITY_COLOR, isGear } from '../../lib/game';
import type { Item, Rarity } from '../../../types';

const cap = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

export const ItemFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const materials = useGameStore((s) => s.materials);
  const fuseItems = useGameStore((s) => s.fuseItems);
  const fuseShards = useGameStore((s) => s.fuseShards);
  const [sel, setSel] = useState<string[]>([]);
  const [last, setLast] = useState<{ ok: boolean; item: Item } | null>(null);
  const gear = inventory.filter(isGear);
  const picked = sel.map((id) => gear.find((p) => p.id === id)).filter((p): p is Item => !!p);
  const tier = picked[0]?.rarity;
  const up = tier ? nextTier(tier) : null;
  const toggle = (p: Item) => {
    setLast(null);
    if (sel.includes(p.id)) { setSel(sel.filter((x) => x !== p.id)); return; }
    if (!(FUSE_CHANCE[p.rarity] ?? 0)) return;
    if (tier && p.rarity !== tier) { setSel([p.id]); return; }
    if (sel.length < FUSE_COUNT) setSel([...sel, p.id]);
  };
  const go = () => { const r = fuseItems(sel); if (r) { setLast(r); setSel([]); } };
  return (
    <div className="flex flex-col gap-3" data-testid="item-fuse">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Fuse {FUSE_COUNT} pieces of gear (or {FUSE_COUNT} shards) of the same tier for a chance at one of the next tier. A failed
        fusion still leaves you one of the same tier. Equipped gear is never used.
        <div className="flex flex-wrap gap-x-3 mt-1">
          {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const).map((r) => <span key={r} style={{ color: RARITY_COLOR[r] }}>{cap(r)} → {Math.round((FUSE_CHANCE[r] ?? 0) * 100)}%</span>)}
        </div>
      </div>
      <div className="slot-grid">
        {Array.from({ length: FUSE_COUNT }, (_, i) => (
          picked[i] ? <ItemSlot key={picked[i].id} item={picked[i]} fluid size="100%" iconSize="78%" tooltip="none" onClick={() => toggle(picked[i])} />
            : <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[.8rem]">
          {tier && up ? <>Chance for <b style={{ color: RARITY_COLOR[up] }}>{cap(up)}</b> gear: <b className="rpg-num">{Math.round((FUSE_CHANCE[tier] ?? 0) * 100)}%</b></>
            : <span className="rpg-label">Pick {FUSE_COUNT} pieces of one tier from your bag below</span>}
        </div>
        <button className="rpg-btn bevel pe px-4 py-1.5" disabled={picked.length !== FUSE_COUNT} onClick={go} data-testid="ifuse-go">Fuse</button>
      </div>
      {last && (
        <div className="rpg-frame p-2 flex items-center gap-3" data-testid="ifuse-result">
          <div style={{ width: 'var(--cell)' }}><ItemSlot item={last.item} fluid size="100%" iconSize="78%" tooltip="none" /></div>
          <div className="text-[.85rem]" style={{ color: last.ok ? '#ffd24a' : '#c8c0b0' }}>{last.ok ? 'Success! ' : 'The fusion failed. '}<b style={{ color: RARITY_COLOR[last.item.rarity] }}>{last.item.name}</b></div>
        </div>
      )}
      <div className="rpg-label">Shards</div>
      <div className="flex flex-wrap gap-2">
        {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]).map((r) => (
          <button key={r} className="rpg-btn bevel pe px-2 py-1 text-[.75rem]" disabled={(materials[r] ?? 0) < FUSE_COUNT} data-testid={`sfuse-${r}`}
            onClick={() => { const res = fuseShards(r); if (res) setLast(res); }}>
            <span style={{ color: RARITY_COLOR[r] }}>{FUSE_COUNT} {cap(r)}</span> → <span style={{ color: RARITY_COLOR[nextTier(r)!] }}>{cap(nextTier(r)!)}</span> <span className="opacity-70">({materials[r] ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="rpg-label">Gear in your bag</div>
      <div className="slot-grid">
        {gear.length ? gear.map((p) => (
          <ItemSlot key={p.id} item={p} fluid size="100%" iconSize="78%" tooltip="none" selected={sel.includes(p.id)}
            dim={(!!tier && p.rarity !== tier) || !(FUSE_CHANCE[p.rarity] ?? 0)} onClick={() => toggle(p)} />
        )) : <div className="rpg-label">No gear in your bag.</div>}
      </div>
    </div>
  );
};
