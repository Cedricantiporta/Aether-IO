// Showcase fight UI (engine/showcase.ts): the launcher that starts it for a brand-new character, the intro / outro lines and the
// Skip button. Per-frame values are read into DOM refs (no per-frame setState).
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { activeChar } from '../../characters';
import { showcase, showcasePending, skipShowcase, INTRO_SEC } from '../../engine/showcase';
import { GameStatus } from '../../types';
import { useRaf } from '../hooks/useRaf';
import { useDialogue } from '../../engine/systems/dialogue';

/** Starts the showcase once the new character stands in the town (after the prologue / title). */
export const ShowcaseLauncher: React.FC = () => {
  const status = useGameStore((s) => s.status), prologue = useUiStore((s) => s.prologueOpen), titleDone = useUiStore((s) => s.titleDone);
  useEffect(() => {
    if (status !== GameStatus.MENU || !titleDone || prologue) return;
    const c = activeChar(); if (!c || !showcasePending(c.id)) return;
    const t = setTimeout(() => { if (!useDialogue.getState().open) useGameStore.getState().startShowcase(); }, 1400);
    return () => clearTimeout(t);
  }, [status, titleDone, prologue]);
  return null;
};

export const ShowcaseOverlay: React.FC = () => {
  const [on, setOn] = useState(showcase.on);
  const intro = useRef<HTMLDivElement>(null), outro = useRef<HTMLDivElement>(null), last = useRef('');
  useRaf(() => {
    if (showcase.on !== on) setOn(showcase.on);
    const k = `${showcase.t < INTRO_SEC && !showcase.victory ? 1 : 0}${showcase.victory ? 1 : 0}`;
    if (k === last.current) return; last.current = k;
    if (intro.current) intro.current.style.opacity = k[0];
    if (outro.current) outro.current.style.opacity = k[1];
  });
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); skipShowcase(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [on]);
  if (!on) return null;
  return (
    <div className="sc-root" data-testid="showcase">
      <div ref={intro} className="sc-line" data-testid="showcase-intro"><b>A glimpse of what you will become…</b><span>Your power is borrowed for this one fight.</span></div>
      <div ref={outro} className="sc-line sc-out" data-testid="showcase-outro" style={{ opacity: 0 }}><b>This is only the beginning.</b><span>Your real journey starts now.</span></div>
      <button className="sc-skip pe" data-testid="showcase-skip" onClick={skipShowcase}>Skip</button>
    </div>
  );
};
