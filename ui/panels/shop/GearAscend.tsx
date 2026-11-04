// Blacksmith > Ascend: put one gear piece in the keeper slot (click it below or drag it in), then pick up to 5 same-name,
// same-rarity duplicates from the bag to sacrifice: every sacrifice gives the keeper +1 gold star (+6% base stats, up to 5;
// store.ascendGear). The worn piece can be the keeper, never a sacrifice. Every list is ordered by CP, highest first.
import React, { useState } from 'react';
import { useGameStore, calculateItemCP } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { isGear } from '../../lib/game';
import { useDrop } from '../../lib/dnd';
import { gearStars, GEAR_MAX_STARS, GEAR_STAR_BONUS } from '../../../gearStars';
import type { Item } from '../../../types';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';

const MAX_SACRIFICE = 5;
const byCp = (a: Item, b: Item) => calculateItemCP(b) - calculateItemCP(a);

export const GearAscend: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const equipment = useGameStore((s) => s.equipment);
  const ascendGear = useGameStore((s) => s.ascendGear);
  const [keepId, setKeep] = useState('');
  const [sacIds, setSacIds] = useState<string[]>([]);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);   // the shared crafting cinematic
  const bag = inventory.filter((i) => isGear(i) && i.type !== 'PET');   // (pets ascend at the Pet House)
  const worn = (Object.values(equipment) as (Item | null)[]).filter((i): i is Item => !!i && isGear(i) && i.type !== 'PET');
  const wornIds = new Set(worn.map((i) => i.id));
  const same = (a: Item, b: Item) => a.name === b.name && a.rarity === b.rarity;
  const keepers = [...worn, ...bag].filter((k) => gearStars(k) < GEAR_MAX_STARS && bag.some((d) => d.id !== k.id && same(d, k))).sort(byCp);
  const keep = keepers.find((k) => k.id === keepId) ?? null;
  const dupes = keep ? bag.filter((d) => d.id !== keep.id && same(d, keep)).sort(byCp) : [];
  const room = keep ? Math.min(MAX_SACRIFICE, GEAR_MAX_STARS - gearStars(keep)) : 0;   // sacrifices that still add a star
  const picked = sacIds.filter((id) => dupes.some((d) => d.id === id));
  const { hot, props } = useDrop((d) => (d.from === 'BAG' || d.from === 'EQUIP') && isGear(d.item) && d.item.type !== 'PET' && keepers.some((k) => k.id === d.item.id), (d) => { setKeep(d.item.id); setSacIds([]); });
  const toggle = (id: string) => setSacIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < room ? [...cur, id] : cur));
  const go = () => {
    if (!keep || !picked.length) return;
    const kid = keep.id, ids = picked.slice(), k = keep;
    setKeep(''); setSacIds([]);
    setCine({ preview: k, run: () => {
      let n = 0;
      for (const sid of ids) if (ascendGear(kid, sid)) n++;
      return { success: n > 0, item: k, title: n ? 'Ascended!' : 'Ascension Failed', sub: n ? `${k.name} gained ${n} gold star${n > 1 ? 's' : ''}` : undefined };
    } });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="gear-ascend">
      <div className="rpg-label">Ascend</div>
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">Own copies of the same gear piece (same name and tier)? Put the piece to keep in the slot, then tick up to {MAX_SACRIFICE} duplicates from your bag to sacrifice: each one gives the keeper a gold star (+{Math.round(GEAR_STAR_BONUS * 100)}% base stats, up to {GEAR_MAX_STARS}). Upgrades, grade and bonus lines are kept; bonus lines are not boosted.</div>
      <div className={`flex flex-col items-center gap-1 ${hot ? 'drop-hot' : ''}`} {...props} data-testid="ascend-slot">
        <div className="rpg-label">Piece to keep</div>
        <div style={{ width: '4.6rem', height: '4.6rem' }} className="rounded-2xl border-2 border-dashed border-[var(--good)] flex items-center justify-center">
          {keep ? <ItemSlot item={keep} size="4.2rem" iconSize={40} tooltip="none" compare={false} onClick={() => { setKeep(''); setSacIds([]); }} /> : <span className="text-[1.6rem] opacity-60">+</span>}
        </div>
        {keep && <div className="text-[.72rem] muted">{keep.name} · {gearStars(keep)}/{GEAR_MAX_STARS} stars · tap to remove</div>}
      </div>
      {!keep && (keepers.length ? (<>
        <div className="text-[.75rem] muted">Tap a piece (worn gear included, highest CP first)</div>
        <div className="slot-grid" data-testid="ascend-keepers">{keepers.map((k) => (
          <ItemSlot key={k.id} item={k} fluid size="100%" iconSize="78%" tooltip="none" onClick={() => { setKeep(k.id); setSacIds([]); }}>
            {wornIds.has(k.id) && <i className="absolute top-0 left-0 px-1 rounded-br text-[.55rem] font-bold bg-[var(--good)] text-black" aria-label="Equipped">E</i>}
          </ItemSlot>
        ))}</div>
      </>) : <div className="rpg-label">No duplicates to ascend (a piece below 5 stars plus a same-name, same-tier copy in your bag).</div>)}
      {keep && (<>
        <div className="text-[.75rem] muted">Duplicates to sacrifice (consumed) · {picked.length}/{room} chosen · highest CP first</div>
        <div className="slot-grid" data-testid="ascend-sacrifices">{dupes.map((d) => (
          <ItemSlot key={d.id} item={d} fluid size="100%" iconSize="78%" tooltip="none" selected={picked.includes(d.id)} onClick={() => toggle(d.id)} />
        ))}</div>
        <button className="rpg-btn bevel pe px-4 py-2 self-center" disabled={!picked.length} data-testid="gear-ascend-go" onClick={go}>Ascend {keep.name} ★{picked.length > 1 ? ` x${picked.length}` : ''}</button>
      </>)}
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Ascension Result" noLevel onDone={() => setCine(null)} />}
    </div>
  );
};
