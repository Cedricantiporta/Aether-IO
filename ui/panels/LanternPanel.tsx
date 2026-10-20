import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { LANTERN_COST, LANTERN_MAX_LV, REFILL_PRICE } from '../../engine/caveData';
import { useLanternPanel, lanternLevel, oilMaxFor, refillLantern, upgradeLantern, freeRefillToday, caveBest } from '../../engine/systems/cave';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/** Grit's lantern bench (crystal cave, Floor 1): refill the lantern (free once a day, then gold) and buy bigger lanterns
 *  (capacity tiers paid with gems OR shards). Opened by E at the bench; closes when you walk away. */
export const LanternPanel: React.FC = () => {
  const open = useLanternPanel((s) => s.open);
  const { gold, gems, materials, lv, best } = useGameStore(useShallow((s) => ({ gold: s.gold, gems: s.gems, materials: s.materials, lv: s.progress.caveLantern ?? 0, best: s.progress.caveBest ?? 1 })));
  const [, tick] = useState(0);
  useEffect(() => { if (!open) return; const id = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(id); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') useLanternPanel.setState({ open: false }); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  void lv; void best;
  const L = lanternLevel(), cap = oilMaxFor(L), next = L < LANTERN_MAX_LV ? oilMaxFor(L + 1) : 0, cost = L < LANTERN_MAX_LV ? LANTERN_COST[L] : null;
  const oil = world.village.cave.oil, free = freeRefillToday(), price = REFILL_PRICE(L), full = oil >= cap - 0.5;
  const btn = (enabled: boolean): React.CSSProperties => ({ padding: '.45rem .7rem', borderRadius: 999, border: 0, background: enabled ? '#fff6e0' : 'rgba(255,255,255,.1)', color: enabled ? '#2b2a2e' : '#9a968c', fontWeight: 700, fontSize: '.8rem', cursor: enabled ? 'pointer' : 'default', flex: 1 });
  return (
    <div className="absolute inset-0 flex items-center justify-center pe" style={{ zIndex: 60, background: 'rgba(0,0,0,.35)' }} onClick={() => useLanternPanel.setState({ open: false })} data-testid="lantern-panel">
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(25rem, 92vw)', background: 'rgba(32,32,38,.92)', border: 0, borderRadius: 22, padding: '1.2rem', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,.42)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '.5rem' }}>
          <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>Grit's Lantern Bench</div>
          <button style={{ color: '#ccc', fontSize: '1.1rem' }} onClick={() => useLanternPanel.setState({ open: false })}>✕</button>
        </div>
        <div style={{ fontSize: '.78rem', color: '#b8b2a4', marginBottom: '.7rem' }}>"Oil burns the whole trip, floor after floor. Run dry and the dark keeps your loot." Personal best: <b style={{ color: '#9fe6ff' }}>Floor {caveBest()}</b></div>
        <div style={{ fontSize: '.85rem', marginBottom: '.35rem' }}>Lantern <b>Lv {L + 1}</b> · capacity <b>{fmt(cap)}</b> · oil now <b>{fmt(oil)}</b></div>
        <div style={{ height: '.55rem', background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden', marginBottom: '.8rem' }}><div style={{ height: '100%', width: `${Math.min(100, (oil / cap) * 100)}%`, background: '#fff6e0', borderRadius: 999 }} /></div>
        <div className="flex gap-2" style={{ marginBottom: '.9rem' }}>
          <button style={btn(!full && (free || gold >= price))} onClick={() => refillLantern()} data-testid="lantern-refill">{full ? 'Lantern is full' : free ? 'Refill (free today)' : `Refill · ${price.toLocaleString()} gold`}</button>
        </div>
        <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '.9rem', color: '#fff', marginBottom: '.35rem' }}>Bigger lantern</div>
        <div style={{ fontSize: '.8rem' }}>Lv {L + 1}: capacity {fmt(cap)}.{next ? <> Bigger lanterns (100 gems a tier) are sold at the <b style={{ color: '#ffe08a' }}>Tech House</b>.</> : ' The biggest lantern there is.'}</div>
      </div>
    </div>
  );
};
