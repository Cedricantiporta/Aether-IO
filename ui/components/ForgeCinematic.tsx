// Full-screen reveal cinematic (Korean MMORPG style): smoke swirl around a glowing card -> gold ray burst ->
// result card with sparks. Used by the blacksmith upgrade; `run` resolves the outcome at the burst moment.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Item } from '../../types';
import { ItemSlot } from './ItemSlot';
import { RARITY_LIGHT } from '../theme';

export interface ForgeOutcome { success: boolean; item: Item; title: string; sub?: string }

type Phase = 'charge' | 'burst' | 'result';

export const ForgeCinematic: React.FC<{ item: Item; run: () => ForgeOutcome; onDone: () => void }> = ({ item, run, onDone }) => {
  const [phase, setPhase] = useState<Phase>('charge');
  const [out, setOut] = useState<ForgeOutcome | null>(null);
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => {
    const t1 = setTimeout(() => { setOut(runRef.current()); setPhase('burst'); }, 1400);
    const t2 = setTimeout(() => setPhase('result'), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const ok = out?.success !== false;
  const shown = out?.item ?? item;
  const rc = RARITY_LIGHT[shown.rarity] ?? '#f3dfa6';
  const close = () => { if (phase === 'result') onDone(); };
  return createPortal(
    <div className={`fc-root fc-${phase} ${ok ? 'fc-ok' : 'fc-fail'}`} onClick={close} data-testid="forge-cinematic" style={{ ['--rc' as any]: rc }}>
      <div className="fc-smoke" /><div className="fc-smoke b" />
      <div className="fc-rays" />
      <div className="fc-sparks">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ ['--a' as any]: `${(i * 137.5) % 360}deg`, ['--d' as any]: `${(i % 7) * 0.09}s`, ['--r' as any]: `${14 + (i * 7) % 22}rem` }} />)}</div>
      {phase === 'result' && <div className="fc-heading">{ok ? 'Enhancement Result' : 'Enhancement Result'}</div>}
      <div className="fc-card">
        <div className="fc-card-name">{shown.name}</div>
        <div className="fc-card-art"><ItemSlot item={shown} size="7.5rem" iconSize={64} tooltip="none" compare={false} /></div>
        <div className="fc-card-lv">+{Math.max(0, shown.level - 1)}</div>
        <div className="fc-card-flash" />
      </div>
      {phase === 'result' && out && (
        <div className="fc-result">
          <div className="fc-title">{out.title}</div>
          {out.sub && <div className="fc-sub">{out.sub}</div>}
          <div className="fc-tap">Tap to continue</div>
        </div>
      )}
    </div>,
    (document.querySelector('.hud-root') as HTMLElement) ?? document.body,
  );
};
