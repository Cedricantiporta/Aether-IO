// Blacksmith > Fuse: pick 5 bag gear pieces of one tier for a chance at one of the next tier; a failed fusion leaves one
// of the same tier (store.fuseItems, odds in petFusion.ts). Shard fusion has its own tab (Blacksmith > Shards).
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { useUiStore } from '../../uiStore';
import { ItemSlot } from '../../components/ItemSlot';
import { FUSE_COUNT, FUSE_CHANCE, nextItemTier as nextTier } from '../../../petFusion';
import { RARITY_COLOR, isGear } from '../../lib/game';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import type { Item, Rarity } from '../../../types';

const cap = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

export const ItemFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const fuseItems = useGameStore((s) => s.fuseItems);
  const [sel, setSel] = useState<string[]>([]);
  const [last, setLast] = useState<{ ok: boolean; item: Item } | null>(null);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);
  /** plays the fusion cinematic; `fn` performs the fusion at the burst moment (owner: animation + result in the middle) */
  const play = (preview: Item, fn: () => { ok: boolean; item: Item } | null): void => setCine({ preview, run: () => {
    const r = fn(); if (r) setLast(r);
    return r ? { success: r.ok, item: r.item, title: r.ok ? 'Fusion Success!' : 'Fusion Failed', sub: r.ok ? `${r.item.name} - ${r.item.rarity.charAt(0) + r.item.rarity.slice(1).toLowerCase()}` : `${r.item.name} remains` } : { success: false, item: preview, title: 'Cannot fuse these', sub: 'Pick 5 pieces of the same tier and type. Nothing was used.' };
  } });
  const gear = inventory.filter((i) => isGear(i) && i.type !== 'PET');   // (pets fuse at the Pet Stable; a pet here made the fusion silently refuse)
  const picked = sel.map((id) => gear.find((p) => p.id === id)).filter((p): p is Item => !!p);
  const tier = picked[0]?.rarity, kind = picked[0]?.type;
  const up = tier ? nextTier(tier) : null;
  const toggle = (p: Item) => {
    setLast(null);
    if (sel.includes(p.id)) { setSel(sel.filter((x) => x !== p.id)); return; }
    if (!(FUSE_CHANCE[p.rarity] ?? 0)) return;
    if (tier && (p.rarity !== tier || p.type !== kind)) { setSel([p.id]); return; }   // five of one tier AND one type
    if (sel.length < FUSE_COUNT) setSel([...sel, p.id]);
  };
  const ask = useUiStore((s) => s.askConfirm);
  /** every full set of 5 (same tier + same type) in the bag, lowest tier first */
  const groups = (): string[][] => {
    const by = new Map<string, Item[]>();
    for (const g of gear) { if (!(FUSE_CHANCE[g.rarity] ?? 0)) continue; const k = `${g.rarity}|${g.type}`; (by.get(k) ?? by.set(k, []).get(k)!).push(g); }
    const order = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    const out: string[][] = [];
    [...by.entries()].sort((a, b) => order.indexOf(a[0].split('|')[0]) - order.indexOf(b[0].split('|')[0])).forEach(([, list]) => {
      for (let i = 0; i + FUSE_COUNT <= list.length; i += FUSE_COUNT) out.push(list.slice(i, i + FUSE_COUNT).map((x) => x.id));
    });
    return out;
  };
  const auto = () => {
    const gs = groups();
    if (!gs.length) return;
    ask({ title: `Auto fuse ${gs.length} set${gs.length > 1 ? 's' : ''}?`, body: `Every full set of ${FUSE_COUNT} same-tier, same-type gear in your bag (${gs.length * FUSE_COUNT} pieces) will be fused. Equipped gear is never used.`, confirmLabel: 'Auto fuse', tone: 'danger', onConfirm: () => {
      setSel([]);
      let won = 0, n = 0; let best: { ok: boolean; item: Item } | null = null;
      for (const ids of gs) { const r = fuseItems(ids); if (!r) continue; n++; if (r.ok) { won++; best = r; } else if (!best) best = r; }
      if (best) setLast(best);
      useGameStore.getState().addNotification(`Auto fuse: ${n} fusion${n === 1 ? '' : 's'}, ${won} upgraded`, won ? '#ffd24a' : '#c8c0b0', 'SYSTEM');
    } });
  };
  const go = () => { if (picked.length !== FUSE_COUNT) return; const ids = sel; setSel([]); play(picked[0], () => fuseItems(ids)); };
  return (
    <div className="flex flex-col gap-3" data-testid="item-fuse">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Fuse {FUSE_COUNT} pieces of gear of the same tier and the same type (5 weapons, 5 boots...) for a chance at one of the next tier. A failed
        fusion still leaves you one of the same tier. Equipped gear is never used.
      </div>
      <div className="slot-grid">
        {Array.from({ length: FUSE_COUNT }, (_, i) => (
          picked[i] ? <ItemSlot key={picked[i].id} item={picked[i]} fluid size="100%" iconSize="78%" tooltip="none" onClick={() => toggle(picked[i])} />
            : <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[.8rem]">
          {tier && up ? <>A chance at a <b style={{ color: RARITY_COLOR[up] }}>{cap(up)}</b> {kind?.toLowerCase()}</>
            : <span className="rpg-label">Pick {FUSE_COUNT} pieces of one tier and one type from your bag below</span>}
        </div>
        <div className="flex gap-2">
          <button className="rpg-btn bevel pe px-3 py-1.5" disabled={!groups().length} onClick={auto} data-testid="ifuse-auto">Auto Fuse</button>
          <button className="rpg-btn bevel pe px-4 py-1.5" disabled={picked.length !== FUSE_COUNT} onClick={go} data-testid="ifuse-go">Fuse</button>
        </div>
      </div>
      {last && (
        <div className="rpg-frame p-2 flex items-center gap-3" data-testid="ifuse-result">
          <div style={{ width: 'var(--cell)' }}><ItemSlot item={last.item} fluid size="100%" iconSize="78%" tooltip="none" /></div>
          <div className="text-[.85rem]" style={{ color: last.ok ? '#ffd24a' : '#c8c0b0' }}>{last.ok ? 'Success! ' : 'The fusion failed. '}<b style={{ color: RARITY_COLOR[last.item.rarity] }}>{last.item.name}</b></div>
        </div>
      )}
      <div className="rpg-label">Gear in your bag</div>
      <div className="slot-grid">
        {gear.length ? gear.map((p) => (
          <ItemSlot key={p.id} item={p} fluid size="100%" iconSize="78%" tooltip="none" selected={sel.includes(p.id)}
            dim={(!!tier && (p.rarity !== tier || p.type !== kind)) || !(FUSE_CHANCE[p.rarity] ?? 0)} onClick={() => toggle(p)} />
        )) : <div className="rpg-label">No gear in your bag.</div>}
      </div>
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Fusion Result" noLevel onDone={() => setCine(null)} />}
    </div>
  );
};
