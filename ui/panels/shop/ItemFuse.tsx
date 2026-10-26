// Blacksmith > Fuse: pick 5 bag gear pieces of one tier for a chance at one of the next tier; a failed fusion leaves one
// of the same tier (store.fuseItems, odds in petFusion.ts). Shard fusion has its own tab (Blacksmith > Shards).
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { useUiStore } from '../../uiStore';
import { ItemSlot } from '../../components/ItemSlot';
import { FUSE_COUNT, FUSE_CHANCE, nextItemTier as nextTier } from '../../../petFusion';
import { RARITY_COLOR, isGear } from '../../lib/game';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import { PotionFuse } from './PotionFuse';
import { GearAscend } from './GearAscend';
import type { Item, Rarity } from '../../../types';

const cap = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();
/** (owner) the most fusions one press does (Fuse xN, auto fuse) and the most results shown. */
export const FUSE_BATCH = 10;
export type FuseResult = { ok: boolean; item: Item };
/** The outcome of a batch: the best result for the cinematic, plus "k of n succeeded". */
export const batchOutcome = (rs: FuseResult[], preview: Item): ForgeOutcome => {
  if (!rs.length) return { success: false, item: preview, title: 'Cannot fuse these', sub: 'Nothing was used.' };
  const won = rs.filter((r) => r.ok), best = won[won.length - 1] ?? rs[0];
  return { success: won.length > 0, item: best.item, title: won.length ? 'Fusion Success!' : 'Fusion Failed', sub: rs.length === 1 ? (best.ok ? `${best.item.name} - ${cap(best.item.rarity)}` : `${best.item.name} remains`) : `${won.length} of ${rs.length} fusions succeeded` };
};
/** Up to FUSE_BATCH result slots (gold ring = upgraded). */
export const FuseResults: React.FC<{ rs: FuseResult[]; testid: string }> = ({ rs, testid }) => {
  if (!rs.length) return null;
  const won = rs.filter((r) => r.ok).length;
  return (
    <div className="rpg-frame p-2 flex flex-col gap-2" data-testid={testid}>
      <div className="text-[.85rem]" style={{ color: won ? '#ffd24a' : '#c8c0b0' }}>{rs.length === 1 ? (won ? 'Success! ' : 'The fusion failed. ') : `${won} of ${rs.length} fusions succeeded`}{rs.length === 1 && <b style={{ color: RARITY_COLOR[rs[0].item.rarity] }}>{rs[0].item.name}</b>}</div>
      <div className="slot-grid">
        {rs.slice(0, FUSE_BATCH).map((r, i) => (
          <div key={i} style={{ opacity: r.ok ? 1 : 0.6, outline: r.ok ? '2px solid #ffd24a' : 'none', borderRadius: 6 }}><ItemSlot item={r.item} fluid size="100%" iconSize="78%" tooltip="none" /></div>
        ))}
      </div>
      {rs.length > FUSE_BATCH && <div className="rpg-label">+{rs.length - FUSE_BATCH} more</div>}
    </div>
  );
};

export const ItemFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const fuseItems = useGameStore((s) => s.fuseItems);
  const [sel, setSel] = useState<string[]>([]);
  const [last, setLast] = useState<FuseResult[]>([]);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);
  /** plays the fusion cinematic; `fn` performs the fusion at the burst moment (owner: animation + result in the middle) */
  /** plays the fusion cinematic; `fn` performs the fusion(s) at the burst moment (owner: animation + result in the middle) */
  const play = (preview: Item, fn: () => FuseResult[]): void => setCine({ preview, run: () => { const rs = fn(); setLast(rs); return batchOutcome(rs, preview); } });
  const gear = inventory.filter((i) => isGear(i) && i.type !== 'PET');   // (pets fuse at the Pet Stable; a pet here made the fusion silently refuse)
  const picked = sel.map((id) => gear.find((p) => p.id === id)).filter((p): p is Item => !!p);
  const tier = picked[0]?.rarity, kind = picked[0]?.type;
  const up = tier ? nextTier(tier) : null;
  const toggle = (p: Item) => {
    setLast([]);
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
  /** (owner 2026-10-24) Auto: only fills the 5 slots with the first full set (lowest tier first); the player presses Fuse */
  const auto = () => { const gs = groups(); if (!gs.length) return; setLast([]); setSel(gs[0]); };
  const go = () => { if (picked.length !== FUSE_COUNT) return; const ids = sel; setSel([]); play(picked[0], () => { const r = fuseItems(ids); return r ? [r] : []; }); };
  /** (owner) Fuse xN: up to FUSE_BATCH sets of the picked tier + type at once (the picked pieces first, then the rest of the bag) */
  const sets = (): string[][] => {
    if (!tier) return [];
    const pool = [...picked, ...gear.filter((g) => g.rarity === tier && g.type === kind && !sel.includes(g.id))].map((g) => g.id);
    const out: string[][] = [];
    for (let i = 0; i + FUSE_COUNT <= pool.length && out.length < FUSE_BATCH; i += FUSE_COUNT) out.push(pool.slice(i, i + FUSE_COUNT));
    return out;
  };
  const nSets = sets().length;
  const goMany = () => { const ss = sets(); if (ss.length < 2) return; setSel([]); play(picked[0], () => { const rs: FuseResult[] = []; for (const ids of ss) { const r = fuseItems(ids); if (r) rs.push(r); } return rs; }); };
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
          <button className="rpg-btn bevel pe px-3 py-1.5" disabled={!groups().length} onClick={auto} data-testid="ifuse-auto">Auto Fill</button>
          <button className="rpg-btn bevel pe px-4 py-1.5" disabled={picked.length !== FUSE_COUNT} onClick={go} data-testid="ifuse-go">Fuse</button>
          {nSets >= 2 && <button className="rpg-btn bevel pe px-3 py-1.5" onClick={goMany} data-testid="ifuse-many" title={`Fuse ${nSets} sets of ${FUSE_COUNT} at once`}>Fuse x{nSets}</button>}
        </div>
      </div>
      <FuseResults rs={last} testid="ifuse-result" />
      <div className="rpg-label">Gear in your bag</div>
      <div className="slot-grid">
        {gear.length ? gear.map((p) => (
          <ItemSlot key={p.id} item={p} fluid size="100%" iconSize="78%" tooltip="none" selected={sel.includes(p.id)}
            dim={(!!tier && (p.rarity !== tier || p.type !== kind)) || !(FUSE_CHANCE[p.rarity] ?? 0)} onClick={() => toggle(p)} />
        )) : <div className="rpg-label">No gear in your bag.</div>}
      </div>
      <GearAscend />
      <PotionFuse />
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Fusion Result" noLevel onDone={() => setCine(null)} />}
    </div>
  );
};
