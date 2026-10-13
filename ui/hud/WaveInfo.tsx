import React, { useRef } from 'react';
import { SkullGlyph } from '../components/SkillIcons';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Ribbon } from '../components/Frame';

const PHASE_LABEL: Record<string, string> = { COUNTDOWN: 'Preparing', FIGHT: 'Survive', CLEANUP: 'Finish them', BOSS: 'Boss fight', REWARD: 'Cleared' };

export const WavePlaque: React.FC = () => {
  const wave = useGameStore((s) => s.wave);
  const bar = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const st = useRef({ f: '', a: -1, p: '', c: '' });

  useRaf(() => {
    const d = world.director, s = st.current;
    const f = d.phase === 'FIGHT' || d.phase === 'COUNTDOWN' ? (d.phase === 'COUNTDOWN' ? 0 : Math.min(1, d.waveTime / Math.max(1, d.waveDuration))) : 1;
    const fs = f.toFixed(3);
    if (bar.current && fs !== s.f) {
      s.f = fs; bar.current.style.setProperty('--fill', fs);
      const cl = d.phase === 'CLEANUP' || d.phase === 'BOSS' ? '#e0554a' : '#e9b949';
      if (cl !== s.c) { s.c = cl; bar.current.style.setProperty('--bc', cl); }
    }
    if (sub.current && (d.aliveCount !== s.a || d.phase !== s.p)) {
      s.a = d.aliveCount; s.p = d.phase;
      sub.current.textContent = `${PHASE_LABEL[d.phase] ?? d.phase} \u2022 ${d.aliveCount} ENEMIES`;
    }
  });

  return (
    <div className="wplaque">
      <svg className="bg" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="wp-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2c22" /><stop offset=".5" stopColor="#1c1511" /><stop offset="1" stopColor="#0d0a08" /></linearGradient>
          <linearGradient id="wp-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5a16" /><stop offset=".3" stopColor="#fff0b0" /><stop offset=".5" stopColor="#c8962e" /><stop offset=".7" stopColor="#fff0b0" /><stop offset="1" stopColor="#8b5a16" /></linearGradient>
        </defs>
        <path d="M20 8 H380 L394 22 L388 40 L398 58 L380 96 H20 L2 58 L12 40 L6 22Z" fill="url(#wp-w)" stroke="#050304" strokeWidth="5" strokeLinejoin="round" />
        <path d="M20 8 H380 L394 22 L388 40 L398 58 L380 96 H20 L2 58 L12 40 L6 22Z" fill="none" stroke="url(#wp-g)" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M30 15 H370 L382 28 L378 82 L366 90 H34 L22 82 L18 28Z" fill="none" stroke="#c8962e" strokeOpacity=".35" strokeWidth="1" />
      </svg>
      <span className="crest"><SkullGlyph size={36} /></span>
      <div className="wtitle">WAVE {wave}</div>
      <div className="wbar" ref={bar}><div className="fill" /></div>
      <div ref={sub} className="wsub">{'Survive \u2022 0 ENEMIES'}</div>
    </div>
  );
};

/** Huge centred countdown number between waves — pure ref/DOM, no React state. */
export const Countdown: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const ribbon = useRef<HTMLSpanElement>(null);
  const st = useRef({ n: -1, show: false, wave: -1 });
  useRaf(() => {
    const d = world.director, s = st.current;
    const show = d.phase === 'COUNTDOWN' && d.countdown > 0;
    if (show !== s.show) { s.show = show; if (root.current) root.current.style.display = show ? 'flex' : 'none'; }
    if (!show) return;
    const n = Math.ceil(d.countdown);
    if (n !== s.n && num.current) {
      s.n = n; num.current.textContent = String(n);
      num.current.classList.remove('pop'); void num.current.offsetWidth; num.current.classList.add('pop');
    }
    if (d.wave !== s.wave && ribbon.current) { s.wave = d.wave; ribbon.current.textContent = `Wave ${d.wave} incoming`; }
  });
  return (
    <div ref={root} className="absolute inset-0 flex-col items-center justify-center pointer-events-none" style={{ display: 'none', justifyContent: 'flex-start', paddingTop: '15vh' }}>
      <div className="rpg-ribbon" data-tone="red" style={{ fontSize: '1.5rem' }}><span ref={ribbon}>Wave 1 incoming</span></div>
      <div ref={num} className="countdown-num">5</div>
    </div>
  );
};
export { Ribbon };
