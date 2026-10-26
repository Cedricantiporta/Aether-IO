// Blacksmith > Fuse > Ascend: keep one gear piece, sacrifice a same-name, same-rarity duplicate from the bag for +1 gold star
// (+6% base stats, up to 5; store.ascendGear). The worn piece can be the keeper, never the sacrifice.
import React, { useState } from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { isGear } from '../../lib/game';
import { gearStars, GEAR_MAX_STARS, GEAR_STAR_BONUS } from '../../../gearStars';
import type { Item } from '../../../types';

export const GearAscend: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const equipment = useGameStore((s) => s.equipment);
  const ascendGear = useGameStore((s) => s.ascendGear);
  const [keepId, setKeep] = useState(''), [sacId, setSac] = useState('');
  const bag = inventory.filter((i) => isGear(i) && i.type !== 'PET');   // (pets ascend at the Pet House)
  const worn = (Object.values(equipment) as (Item | null)[]).filter((i): i is Item => !!i && isGear(i) && i.type !== 'PET');
  const same = (a: Item, b: Item) => a.name === b.name && a.rarity === b.rarity;
  const keepers = [...worn, ...bag].filter((k) => gearStars(k) < GEAR_MAX_STARS && bag.some((d) => d.id !== k.id && same(d, k)));
  const keep = keepers.find((k) => k.id === keepId) ?? null;
  const dupes = keep ? bag.filter((d) => d.id !== keep.id && same(d, keep)) : [];
  return (
    <div className="flex flex-col gap-2" data-testid="gear-ascend">
      <div className="rpg-label">Ascend</div>
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">Own two of the same gear piece (same name and tier)? Pick the one to keep, then a duplicate from your bag to sacrifice: the keeper gains a gold star (+{Math.round(GEAR_STAR_BONUS * 100)}% base stats, up to {GEAR_MAX_STARS}). Upgrades, grade and bonus lines are kept; bonus lines are not boosted.</div>
      {keepers.length ? (<>
        <div className="text-[.75rem] muted">1. Piece to keep (worn gear included)</div>
        <div className="slot-grid">{keepers.map((k) => <ItemSlot key={k.id} item={k} fluid size="100%" iconSize="78%" tooltip="none" selected={k.id === keepId} onClick={() => { setKeep(k.id); setSac(''); }} />)}</div>
        {keep && (<>
          <div className="text-[.75rem] muted">2. Duplicate to sacrifice (it is consumed)</div>
          <div className="slot-grid">{dupes.map((d) => <ItemSlot key={d.id} item={d} fluid size="100%" iconSize="78%" tooltip="none" selected={d.id === sacId} onClick={() => setSac(d.id)} />)}</div>
          <button className="rpg-btn bevel pe px-4 py-2 self-center" disabled={!sacId} data-testid="gear-ascend-go" onClick={() => { ascendGear(keep.id, sacId); setKeep(''); setSac(''); }}>Ascend {keep.name} ★</button>
        </>)}
      </>) : <div className="rpg-label">No duplicates to ascend (a piece below 5 stars plus a same-name, same-tier copy in your bag).</div>}
    </div>
  );
};
