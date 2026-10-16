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
  const btn = (enabled: boolean): React.CSSProperties => ({ padding: '.45rem .7rem', borderRadius: '.3rem', border: '1px solid rgba(201,150,46,.7)', background: enabled ? 'linear-gradient(#3a2f1c,#221a10)' : 'rgba(40,40,40,.6)', color: enabled ? '#ffe7a8' : '#888', fontWeight: 600, fontSize: '.8rem', cursor: enabled ? 'pointer' : 'default', flex: 1 });
  return (
    <div className="absolute inset-0 flex items-center justify-center pe" style={{ zIndex: 60, background: 'rgba(0,0,0,.35)' }} onClick={() => useLanternPanel.setState({ open: false })} data-testid="lantern-panel">
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(25rem, 92vw)', background: 'rgba(10,12,16,.92)', border: '1px solid rgba(201,150,46,.6)', borderRadius: '.5rem', padding: '1rem', color: '#e8e2d4', boxShadow: '0 10px 40px rgba(0,0,0,.7)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '.5rem' }}>
          <div style={{ font: '600 1.1rem Georgia, serif', color: '#f2d58a' }}>Grit's Lantern Bench</div>
          <button style={{ color: '#ccc', fontSize: '1.1rem' }} onClick={() => useLanternPanel.setState({ open: false })}>✕</button>
        </div>
        <div style={{ fontSize: '.78rem', color: '#b8b2a4', marginBottom: '.7rem' }}>"Oil burns the whole trip, floor after floor. Run dry and the dark keeps your loot." Personal best: <b style={{ color: '#9fe6ff' }}>Floor {caveBest()}</b></div>
        <div style={{ fontSize: '.85rem', marginBottom: '.35rem' }}>Lantern <b>Lv {L + 1}</b> · capacity <b>{fmt(cap)}</b> · oil now <b>{fmt(oil)}</b></div>
        <div style={{ height: '.55rem', background: 'rgba(255,255,255,.08)', borderRadius: '.2rem', overflow: 'hidden', marginBottom: '.8rem' }}><div style={{ height: '100%', width: `${Math.min(100, (oil / cap) * 100)}%`, background: 'linear-gradient(90deg,#c98a2a,#ffe08a)' }} /></div>
        <div className="flex gap-2" style={{ marginBottom: '.9rem' }}>
          <button style={btn(!full && (free || gold >= price))} onClick={() => refillLantern()} data-testid="lantern-refill">{full ? 'Lantern is full' : free ? 'Refill (free today)' : `Refill · ${price.toLocaleString()} gold`}</button>
        </div>
        <div style={{ font: '600 .9rem Georgia, serif', color: '#f2d58a', marginBottom: '.35rem' }}>Bigger lantern</div>
        <div style={{ fontSize: '.8rem' }}>Lv {L + 1}: capacity {fmt(cap)}.{next ? <> Bigger lanterns (100 gems a tier) are sold at the <b style={{ color: '#ffe08a' }}>Tech House</b>.</> : ' The biggest lantern there is.'}</div>
      </div>
    </div>
  );
};
