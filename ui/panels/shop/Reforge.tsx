// Blacksmith > Reforge: rework the blue bonus lines of a piece of gear (reforge.ts / store.reforgeItem). Reforge Stone =
// reroll every line, or (Reroll on a line) just that one line; Tempering Oil = change the stat TYPE of every line but keep its
// quality (perfect stays perfect); Binding Seal = lock a line (Stone + Oil skip it, lock stays on the item); Augment Rune = fill
// an empty slot. Equipped gear can be reforged too.
import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { GearDrop } from './Blacksmith';
import { affixText, isUnique } from '../../../affixes';
import { REFORGE_ITEM, emptyAffixSlots, lockedCount, maxLocks, type ReforgeMode } from '../../../reforge';
import { Lock } from '../../components/GoldIcons';
import { gradeLabel } from '../../../grade';
import { isGear, RARITY_COLOR } from '../../lib/game';
import type { Item } from '../../../types';

const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'] as const;

export const ReforgeTab: React.FC = () => {
  const { inventory, equipment, reforgeItem } = useGameStore(useShallow((s) => ({ inventory: s.inventory, equipment: s.equipment, reforgeItem: s.reforgeItem })));
  const [selId, setSelId] = useState<string | null>(null);
  const equipped = SLOTS.map((sl) => equipment[sl] as Item | null).filter((i): i is Item => !!i);
  const gear = [...equipped, ...inventory.filter((i) => isGear(i) && i.type !== 'PET')];
  const sel = gear.find((g) => g.id === selId) ?? null;
  const have = (m: ReforgeMode) => inventory.reduce((n, i) => (i.name === REFORGE_ITEM[m].name ? n + (i.quantity || 1) : n), 0);
  const lines = sel?.affixes ?? [];
  const nLock = sel ? lockedCount(sel) : 0, cap = sel ? maxLocks(sel) : 0;
  const nFree = lines.filter((a) => !isUnique(a) && !a.locked).length;
  const go = (m: ReforgeMode, line = -1) => { if (sel) reforgeItem(sel.id, m, line); };
  return (
    <div className="flex flex-col gap-3" data-testid="reforge-tab">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Rework the <b style={{ color: '#1f5fbf' }}>blue bonus lines</b> of your gear. A <b style={{ color: '#e0b21a' }}>perfect</b> line (yellow) rolls at 125% of its tier.{' '}
        <b>Reforge Stone</b> rerolls lines, <b>Tempering Oil</b> swaps what each line is but keeps its quality, <b>Binding Seal</b> locks a line so neither touches it.
        Tools come from the Gem Shop, the travelling merchant and boss chests.
      </div>
      <div className="rpg-frame p-3 flex gap-3 items-start">
        <GearDrop onItem={(it) => setSelId(it.id)}><div style={{ width: '4.2rem', flex: 'none' }}>{sel ? <ItemSlot item={sel} fluid size="100%" iconSize="78%" tooltip="none" /> : <div className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>}</div></GearDrop>
        <div className="flex-1 min-w-0">
          {sel ? <>
            <div className="font-bold" style={{ color: RARITY_COLOR[sel.rarity] }}>{sel.name} <span className="text-[.68rem] opacity-80" data-testid="reforge-grade">({gradeLabel(sel)})</span></div>
            {cap > 0 && <div className="rpg-label mt-0.5" data-testid="lock-count">Seals: {nLock}/{cap}</div>}
            {lines.length ? lines.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[.78rem] mt-1">
                <span style={{ color: isUnique(a) ? '#e08a2a' : a.perfect ? '#ffd24a' : '#7fb0ff', fontWeight: 700 }}>{isUnique(a) ? '★ ' : a.perfect ? '✦ ' : '◆ '}{affixText(a)}</span>
                {!isUnique(a) && <span className="flex gap-1 items-center">
                  {a.locked
                    ? <button className="rpg-btn bevel pe px-2 py-0.5 text-[.68rem] flex items-center gap-1" onClick={() => go('UNSEAL', i)} data-testid={`unseal-${i}`} title="Take the seal off (free)"><Lock size={11} /> Sealed</button>
                    : <button className="rpg-btn bevel pe px-2 py-0.5 text-[.68rem]" disabled={have('SEAL') < 1 || nLock >= cap} onClick={() => go('SEAL', i)} data-testid={`seal-${i}`} title={cap < 1 ? 'Needs 2+ bonus lines' : nLock >= cap ? 'Keep at least one open line' : 'Lock this line (1 Binding Seal)'}>Seal</button>}
                  <button className="rpg-btn bevel pe px-2 py-0.5 text-[.68rem]" disabled={a.locked || have('LINE') < 1} onClick={() => go('LINE', i)} data-testid={`reroll-line-${i}`} title="Reroll only this line (1 Reforge Stone)">Reroll</button>
                </span>}
              </div>
            )) : null}
            {Array.from({ length: emptyAffixSlots(sel) }).map((_, i) => (   /* empty bonus slots (old saves' erased lines): an Augment Rune fills one */
              <div key={'e' + i} className="affix-empty flex items-center justify-between gap-2 text-[.78rem] mt-1" data-testid={`affix-empty-${i}`}>
                <span>◇ Empty bonus slot</span>
                <button className="rpg-btn bevel pe px-2 py-0.5 text-[.68rem]" disabled={have('ADD') < 1} onClick={() => go('ADD')} data-testid={`augment-${i}`}>Add line</button>
              </div>
            ))}
            {!lines.length && !emptyAffixSlots(sel) && <div className="rpg-label mt-1">No bonus lines.</div>}
          </> : <div className="rpg-label">Pick a piece of gear below</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rpg-btn bevel pe px-3 py-1.5" disabled={!sel || sel.rarity === 'COMMON' || !nFree || have('REROLL') < 1} onClick={() => go('REROLL')} data-testid="reforge-reroll">Reroll lines · {REFORGE_ITEM.REROLL.name} ({have('REROLL')})</button>
        <button className="rpg-btn bevel pe px-3 py-1.5" disabled={!sel || !nFree || have('TEMPER') < 1} onClick={() => go('TEMPER')} data-testid="reforge-temper">Change line types · {REFORGE_ITEM.TEMPER.name} ({have('TEMPER')})</button>
        <span className="rpg-label self-center">{REFORGE_ITEM.SEAL.name}: {have('SEAL')} · {REFORGE_ITEM.ADD.name}: {have('ADD')}</span>
      </div>
      <div className="rpg-label">Your gear</div>
      <div className="slot-grid">
        {gear.length ? gear.map((g) => (
          <ItemSlot key={g.id} item={g} fluid size="100%" iconSize="78%" tooltip="none" selected={g.id === selId} onClick={() => setSelId(g.id)} />
        )) : <div className="rpg-label">No gear.</div>}
      </div>
    </div>
  );
};
