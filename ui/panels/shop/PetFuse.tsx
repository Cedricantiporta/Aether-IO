// Pet House > Fuse: pick 5 bag pets of one tier, roll for one pet of the next tier (store.fusePets / petFusion.ts).
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { FUSE_COUNT, FUSE_CHANCE, nextTier } from '../../../petFusion';
import { RARITY_COLOR } from '../../lib/game';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import type { Item } from '../../../types';
import { FUSE_BATCH, FuseResults, batchOutcome, type FuseResult } from './ItemFuse';

export const PetFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const fusePets = useGameStore((s) => s.fusePets);
  const [sel, setSel] = useState<string[]>([]);
  const [last, setLast] = useState<FuseResult[]>([]);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);
  /** plays the fusion cinematic; `fn` performs the fusion at the burst moment (owner: animation + result in the middle) */
  /** plays the fusion cinematic; `fn` performs the fusion(s) at the burst moment (owner: animation + result in the middle) */
  const play = (preview: Item, fn: () => FuseResult[]): void => setCine({ preview, run: () => { const rs = fn(); setLast(rs); return batchOutcome(rs, preview); } });
  const pets = inventory.filter((i) => i.type === 'PET');
  const picked = sel.map((id) => pets.find((p) => p.id === id)).filter((p): p is Item => !!p);
  const tier = picked[0]?.rarity;
  const up = tier ? nextTier(tier) : null;
  void FUSE_CHANCE;   // (odds stay hidden from the player)
  const toggle = (p: Item) => {
    setLast([]);
    if (sel.includes(p.id)) { setSel(sel.filter((x) => x !== p.id)); return; }
    if (!(FUSE_CHANCE[p.rarity] ?? 0)) return;                       // mythic: cannot go higher
    if (tier && p.rarity !== tier) { setSel([p.id]); return; }        // another tier: start over with this one
    if (sel.length < FUSE_COUNT) setSel([...sel, p.id]);
  };
  const go = () => { if (picked.length !== FUSE_COUNT) return; const ids = sel; setSel([]); play(picked[0], () => { const r = fusePets(ids); return r ? [r] : []; }); };
  /** (owner) Fuse xN: up to FUSE_BATCH sets of the picked tier at once (the picked pets first, then the rest; grown pets above Lv 1 are kept) */
  const sets = (): string[][] => {
    if (!tier) return [];
    const pool = [...picked, ...pets.filter((p) => p.rarity === tier && p.level <= 1 && !sel.includes(p.id))].map((p) => p.id);
    const out: string[][] = [];
    for (let i = 0; i + FUSE_COUNT <= pool.length && out.length < FUSE_BATCH; i += FUSE_COUNT) out.push(pool.slice(i, i + FUSE_COUNT));
    return out;
  };
  const nSets = sets().length;
  const goMany = () => { const ss = sets(); if (ss.length < 2) return; setSel([]); play(picked[0], () => { const rs: FuseResult[] = []; for (const ids of ss) { const r = fusePets(ids); if (r) rs.push(r); } return rs; }); };
  /** (owner) Auto fuse: keeps fusing groups of FUSE_COUNT same-tier bag pets, lowest tier first (grown pets above Lv 1 are kept). */
  const ORDER: Item['rarity'][] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
  const autoGroups = (list: Item[]) => ORDER.filter((r) => (FUSE_CHANCE[r] ?? 0) > 0 && nextTier(r) && list.filter((p) => p.rarity === r && p.level <= 1).length >= FUSE_COUNT);
  const canAuto = autoGroups(pets).length > 0;
  const autoFuse = () => {
    setSel([]);
    const rs: FuseResult[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const now = useGameStore.getState().inventory.filter((i) => i.type === 'PET');
      const r = autoGroups(now)[0];
      if (!r) break;
      const ids = now.filter((p) => p.rarity === r && p.level <= 1).slice(0, FUSE_COUNT).map((p) => p.id);
      const res = fusePets(ids);
      if (!res) break;
      rs.push(res);
    }
    setLast(rs);
    const made = rs.length, won = rs.filter((r) => r.ok).length;
    if (made) useGameStore.getState().addNotification(`Auto fuse: ${made} fusion${made > 1 ? 's' : ''}, ${won} succeeded`, '#ffd24a', 'SYSTEM');
  };
  return (
    <div className="flex flex-col gap-3" data-testid="pet-fuse">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Offer {FUSE_COUNT} pets of the same tier for a chance at one pet of the next tier. The higher the tier, the lower the
        chance; a failed fusion still leaves you one pet of the same tier. (Your equipped pet is never used.)
      </div>
      <div className="flex items-center gap-2">
        <div className="slot-grid flex-1">
          {Array.from({ length: FUSE_COUNT }, (_, i) => (
            picked[i] ? <ItemSlot key={picked[i].id} item={picked[i]} fluid size="100%" iconSize="78%" tooltip="none" onClick={() => toggle(picked[i])} />
              : <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[.8rem]">
          {tier && up ? <>A chance at a <b style={{ color: RARITY_COLOR[up] }}>{up.charAt(0) + up.slice(1).toLowerCase()}</b> pet</>
            : <span className="rpg-label">Pick {FUSE_COUNT} pets of one tier from your bag below</span>}
        </div>
        <button className="rpg-btn bevel pe px-4 py-1.5" disabled={picked.length !== FUSE_COUNT} onClick={go} data-testid="fuse-go">Fuse</button>
        {nSets >= 2 && <button className="rpg-btn bevel pe px-3 py-1.5" onClick={goMany} data-testid="fuse-many" title={`Fuse ${nSets} sets of ${FUSE_COUNT} at once`}>Fuse x{nSets}</button>}
        <button className="rpg-btn bevel pe px-4 py-1.5" disabled={!canAuto} onClick={autoFuse} data-testid="fuse-auto" title="Fuse every group of 5 same-tier pets, lowest tier first (pets above Lv 1 are kept)">Auto fuse</button>
      </div>
      <FuseResults rs={last} testid="fuse-result" />
      <div className="rpg-label">Pets in your bag</div>
      <div className="slot-grid">
        {pets.length ? pets.map((p) => (
          <ItemSlot key={p.id} item={p} fluid size="100%" iconSize="78%" tooltip="none" selected={sel.includes(p.id)}
            dim={(!!tier && p.rarity !== tier) || !(FUSE_CHANCE[p.rarity] ?? 0)} onClick={() => toggle(p)} />
        )) : <div className="rpg-label">No pets in your bag.</div>}
      </div>
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Fusion Result" noLevel onDone={() => setCine(null)} />}
    </div>
  );
};
