import { forceAutoCast } from '../../engine/systems/aim';
import { useInputMode, PAD_LABEL } from '../lib/inputMode';
import { PadBtn } from '../components/PadBtn';
import React, { useEffect, useRef } from 'react';
import { LockGlyph } from '../components/SkillIcons';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import { tip } from '../components/Tooltip';

export interface CdInfo { t: number; max: number; hits?: boolean; }
export interface PipInfo { cur: number; max: number; }

interface Props {
  id: string;                       // 'q' | 'r' | 'e' | 'dash' | 'hp' | 'mp' | skill key
  keyLabel?: string;                // keybind badge text
  keyCode?: string;                 // KeyboardEvent.code, used to attribute noMana shake
  icon: React.ReactNode;
  size?: string;
  active?: boolean;                 // false => dimmed/locked
  lockLabel?: string;               // overlay text when locked (e.g. '5 SP')
  /** true while the skill can't be used right now (e.g. Bone Ward with no summons): greyed out */
  blocked?: () => boolean;
  level?: number;
  qty?: number;
  manaCost?: number;
  getCd?: () => CdInfo;
  getPips?: () => PipInfo;          // charge pips (dash / shield)
  tooltip: React.ReactNode;
  accent?: string;                  // tint colour (css) for the slot's soft glow
  round?: boolean;                  // small round bubble (potions)
}

const fmtCd = (t: number) => (t >= 10 ? String(Math.ceil(t)) : t.toFixed(1));

/** Framed action-bar slot. All per-frame state (sweep, text, pips, mana-lack) is written via refs. */
/** (owner) clicking a slot presses its key: a tap that casts at the auto-target. */
function pressKey(code: string): void {
  forceAutoCast.on = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); setTimeout(() => { forceAutoCast.on = false; }, 120); }, 60);
}

export const ActionSlot: React.FC<Props> = ({ id, keyLabel, keyCode, icon, size = '3.4rem', active = true, lockLabel, level, qty, manaCost = 0, getCd, getPips, tooltip, accent, blocked, round }) => {
  const pad = useInputMode((m) => m.pad);
  const root = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const lack = useRef<HTMLDivElement>(null);
  const ready = useRef<HTMLDivElement>(null);
  const pips = useRef<(HTMLElement | null)[]>([]);
  const st = useRef({ cd: '', text: '', lack: false, blk: false, prevT: 0, peak: 0, pips: '', lastPress: -1 });

  useRaf(() => {
    const s = st.current;
    let frac = 0, show = false, t = 0, hits = false;
    let pipInfo: PipInfo | undefined;
    if (getPips) pipInfo = getPips();
    if (getCd) {
      const c = getCd();
      t = c.t;
      if (c.max > 0) s.peak = c.max;
      else if (t > s.prevT + 0.01) s.peak = t;
      const mx = c.max > 0 ? c.max : s.peak;
      frac = mx > 0 ? Math.min(1, Math.max(0, t / mx)) : 0;
      show = t > 0.04 && (!pipInfo || pipInfo.cur < pipInfo.max);
      hits = !!c.hits;
      if (s.prevT > 0.04 && t <= 0.04 && ready.current) {
        ready.current.classList.remove('flash'); void ready.current.offsetWidth; ready.current.classList.add('flash');
      }
      s.prevT = t;
    }
    if (sweep.current) {
      const v = show ? frac.toFixed(3) : '0';
      if (v !== s.cd) { s.cd = v; sweep.current.style.setProperty('--cd', v); sweep.current.style.setProperty('--cdv', show ? '1' : '0'); }
    }
    if (txt.current) {
      const tx = show && !pipInfo ? (hits ? String(Math.ceil(t)) : fmtCd(t)) : '';
      if (tx !== s.text) { s.text = tx; txt.current.textContent = tx; }
    }
    if (blocked && root.current) { const b = active && blocked(); if (b !== s.blk) { s.blk = b; root.current.classList.toggle('is-blocked', b); } }
    if (lack.current) {
      const l = active && manaCost > 0 && world.player.mana < manaCost;
      if (l !== s.lack) { s.lack = l; lack.current.classList.toggle('on', l); }
    }
    if (pipInfo) {
      const key = `${pipInfo.cur}/${pipInfo.max}`;
      if (key !== s.pips) {
        s.pips = key;
        for (let i = 0; i < 4; i++) {
          const el = pips.current[i];
          if (el) el.dataset.s = i >= pipInfo.max ? 'off' : i < pipInfo.cur ? 'full' : 'empty';
        }
      }
    }
  });

  const shake = () => {
    const el = root.current; if (!el) return;
    el.classList.remove('slot-shake'); void el.offsetWidth; el.classList.add('slot-shake');
  };
  useGameEvent('onCooldown', (p) => { if (p.slot && p.slot.toLowerCase() === id.toLowerCase()) shake(); });
  useGameEvent('noMana', () => { if (manaCost > 0 && performance.now() - st.current.lastPress < 300) shake(); });
  useEffect(() => {
    if (!keyCode) return;
    const h = (e: KeyboardEvent) => { if (e.code === keyCode) st.current.lastPress = performance.now(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [keyCode]);

  return (
    <div className="relative pe act-wrap" {...tip(tooltip)} style={keyCode && active ? { cursor: 'pointer' } : undefined}
      onClick={keyCode && active ? () => pressKey(keyCode) : undefined}>
      <div ref={root} className={`hud-slot ${active ? '' : 'is-dim'}${round ? ' is-round' : ''}`} style={{ ['--slot' as any]: size, ...(accent && active ? { ['--rc' as any]: accent } : {}) }}>
        <span className="slot-icon">{icon}</span>
        <div ref={sweep} className="cd-sweep"><span ref={txt} className="cd-text" /></div>
        <div ref={lack} className="mana-lack" />
        <div ref={ready} className="cd-ready" />
        {!active && (
          <span className="slot-lock" style={{ zIndex: 5 }}>
            <span className="flex flex-col items-center gap-[1px]"><LockGlyph size={22} />{lockLabel && <span className="lock-lbl">{lockLabel}</span>}</span>
          </span>
        )}
        {active && level !== undefined && level > 0 && <span className="slot-plus">{level}</span>}
        {qty !== undefined && <span className="slot-qty" style={qty <= 0 ? { color: '#ff8a80' } : undefined}>{qty}</span>}
        {getPips && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-[3px]" style={{ top: '.2rem', zIndex: 6 }}>
            {[0, 1, 2, 3].map((i) => <i key={i} className="pip" data-s="off" ref={(el) => { pips.current[i] = el; }} />)}
          </div>
        )}
      </div>
      {keyLabel && (pad && keyCode && PAD_LABEL[keyCode] ? <PadBtn b={PAD_LABEL[keyCode]} className="pad-badge" /> : <span className="rpg-key">{keyLabel}</span>)}
    </div>
  );
};
