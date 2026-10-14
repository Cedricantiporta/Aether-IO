// Pet House > Fuse: pick 5 bag pets of one tier, roll for one pet of the next tier (store.fusePets / petFusion.ts).
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { FUSE_COUNT, FUSE_CHANCE, nextTier } from '../../../petFusion';
import { RARITY_COLOR } from '../../lib/game';
import type { Item } from '../../../types';

export const PetFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const fusePets = useGameStore((s) => s.fusePets);
  const [sel, setSel] = useState<string[]>([]);
  const [last, setLast] = useState<{ ok: boolean; item: Item } | null>(null);
  const pets = inventory.filter((i) => i.type === 'PET');
  const picked = sel.map((id) => pets.find((p) => p.id === id)).filter((p): p is Item => !!p);
  const tier = picked[0]?.rarity;
  const up = tier ? nextTier(tier) : null;
  const chance = tier ? FUSE_CHANCE[tier] ?? 0 : 0;
  const toggle = (p: Item) => {
    setLast(null);
    if (sel.includes(p.id)) { setSel(sel.filter((x) => x !== p.id)); return; }
    if (!(FUSE_CHANCE[p.rarity] ?? 0)) return;                       // mythic: cannot go higher
    if (tier && p.rarity !== tier) { setSel([p.id]); return; }        // another tier: start over with this one
    if (sel.length < FUSE_COUNT) setSel([...sel, p.id]);
  };
  const go = () => { const r = fusePets(sel); if (r) { setLast(r); setSel([]); } };
  return (
    <div className="flex flex-col gap-3" data-testid="pet-fuse">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Offer {FUSE_COUNT} pets of the same tier for a chance at one pet of the next tier. The higher the tier, the lower the
        chance; a failed fusion still leaves you one pet of the same tier. (Your equipped pet is never used.)
        <div className="flex flex-wrap gap-x-3 mt-1">
          {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const).map((r) => (
            <span key={r} style={{ color: RARITY_COLOR[r] }}>{r.charAt(0) + r.slice(1).toLowerCase()} → {Math.round((FUSE_CHANCE[r] ?? 0) * 100)}%</span>
          ))}
        </div>
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
          {tier && up ? <>Chance for a <b style={{ color: RARITY_COLOR[up] }}>{up.charAt(0) + up.slice(1).toLowerCase()}</b> pet: <b className="rpg-num">{Math.round(chance * 100)}%</b></>
            : <span className="rpg-label">Pick {FUSE_COUNT} pets of one tier from your bag below</span>}
        </div>
        <button className="rpg-btn bevel pe px-4 py-1.5" disabled={picked.length !== FUSE_COUNT} onClick={go} data-testid="fuse-go">Fuse</button>
      </div>
      {last && (
        <div className="rpg-frame p-2 flex items-center gap-3" data-testid="fuse-result">
          <div style={{ width: 'var(--cell)' }}><ItemSlot item={last.item} fluid size="100%" iconSize="78%" tooltip="none" /></div>
          <div className="text-[.85rem]" style={{ color: last.ok ? '#ffd24a' : '#c8c0b0' }}>{last.ok ? 'Success! ' : 'The fusion failed. '}<b style={{ color: RARITY_COLOR[last.item.rarity] }}>{last.item.name}</b> {last.ok ? 'joins you.' : 'remains.'}</div>
        </div>
      )}
      <div className="rpg-label">Pets in your bag</div>
      <div className="slot-grid">
        {pets.length ? pets.map((p) => (
          <ItemSlot key={p.id} item={p} fluid size="100%" iconSize="78%" tooltip="none" selected={sel.includes(p.id)}
            dim={(!!tier && p.rarity !== tier) || !(FUSE_CHANCE[p.rarity] ?? 0)} onClick={() => toggle(p)} />
        )) : <div className="rpg-label">No pets in your bag.</div>}
      </div>
    </div>
  );
};
