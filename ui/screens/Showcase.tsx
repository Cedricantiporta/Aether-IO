// Showcase fight UI (engine/showcase.ts): the launcher that starts it for a brand-new character, the intro / outro lines and the
// Skip button. Per-frame values are read into DOM refs (no per-frame setState).
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { activeChar } from '../../characters';
import { showcase, showcasePending, skipShowcase } from '../../engine/showcase';
import { world } from '../../engine/world';
import { device } from '../../engine/device';
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

/** (owner) The showcase shows no story text, only short "try this" instructions, one at a time:
 *  skills -> ultimate (until it is used) -> potions. */
const tip = (touch: boolean, step: number): string => [
  touch ? 'Tap your skill buttons to use your skills' : 'Use your skills: press 1, 2 and 3',
  touch ? 'Tap the Ultimate button to unleash it' : 'Press R to unleash your Ultimate',
  touch ? 'Tap a potion to heal (red) or restore mana (blue)' : 'Press Z for a health potion, X for a mana potion',
][step] ?? '';

export const ShowcaseOverlay: React.FC = () => {
  const [on, setOn] = useState(showcase.on);
  const line = useRef<HTMLDivElement>(null), last = useRef('');
  const st = useRef({ step: 0, t0: 0 });
  useRaf(() => {
    if (showcase.on !== on) setOn(showcase.on);
    if (!showcase.on) { st.current.step = 0; st.current.t0 = 0; return; }
    const s = st.current, t = showcase.t, p = world.player;
    if (s.step === 0 && t > 6) { s.step = 1; s.t0 = t; }
    else if (s.step === 1 && (p.ultT > 0 || t - s.t0 > 14)) { s.step = 2; s.t0 = t; }
    else if (s.step === 2 && t - s.t0 > 7) { s.step = 3; }
    const txt = showcase.victory || t < 0.8 ? '' : tip(device.touch, s.step);
    if (txt === last.current) return; last.current = txt;
    if (line.current) { line.current.style.opacity = txt ? '1' : '0'; if (txt) line.current.textContent = txt; }
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
      <div ref={line} className="sc-tip" data-testid="showcase-tip" style={{ opacity: 0 }} />
      <button className="sc-skip pe" data-testid="showcase-skip" onClick={skipShowcase}>Skip</button>
    </div>
  );
};
