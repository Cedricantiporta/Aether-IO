import React, { useRef } from 'react';
import { SkullGlyph } from '../components/SkillIcons';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Ribbon } from '../components/Frame';
import { HourglassGlyph } from '../components/ItemArt';
import { Button } from '../components/Button';
import { skipCutscene, skipRespite } from '../../engine/systems/director';

const PHASE_LABEL: Record<string, string> = { SIEGE: 'Under attack!', COUNTDOWN: 'Preparing...', FIGHT: 'Enemies', CLEANUP: 'Boss defeated', BOSS: 'Boss fight', REWARD: 'Cleared', RESPITE: 'Respite' };
const mmss = (s: number) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export const WavePlaque: React.FC = () => {
  const wave = useGameStore((s) => s.wave);
  const bar = useRef<HTMLDivElement>(null);
  const lab = useRef<HTMLSpanElement>(null);
  const cnt = useRef<HTMLSpanElement>(null);
  const st = useRef({ f: '', a: -1, p: '', c: '' });

  useRaf(() => {
    const d = world.director, s = st.current;
    const f = d.phase === 'FIGHT' || d.phase === 'COUNTDOWN' ? (d.phase === 'COUNTDOWN' ? 1 - Math.min(1, Math.max(0, d.countdown) / 5) : 1 - Math.min(1, d.waveTime / Math.max(1, d.waveDuration))) : d.phase === 'RESPITE' ? Math.max(0, d.respiteT) / 20 : 1;
    const fs = f.toFixed(3);
    if (bar.current && fs !== s.f) {
      s.f = fs; bar.current.style.setProperty('--fill', fs);
      const cl = d.phase === 'CLEANUP' || d.phase === 'BOSS' ? '#e0554a' : d.phase === 'RESPITE' ? '#4ade80' : '#e9b949';
      if (cl !== s.c) { s.c = cl; bar.current.style.setProperty('--bc', cl); }
    }
    const boss = d.wave % 10 === 0;
    const left = Math.max(0, d.quotaTotal - d.quotaSpawned) + d.aliveCount;
    const fight = d.phase === 'FIGHT';
    const key = `${d.phase}|${left}|${d.quotaTotal}|${fight ? Math.ceil(d.waveDuration - d.waveTime) : d.phase === 'RESPITE' ? Math.ceil(d.respiteT) : 0}`;
    if (key !== s.p) {
      s.p = key;
      if (lab.current) lab.current.textContent = fight ? (boss ? 'BOSS FIGHT' : `ENEMIES LEFT ${left}/${Math.max(left, d.quotaTotal)}`) : (PHASE_LABEL[d.phase] ?? d.phase);
      if (cnt.current) cnt.current.textContent = fight && !boss ? mmss(d.waveDuration - d.waveTime) : d.phase === 'RESPITE' ? mmss(d.respiteT) : '';
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
      <div className="wsub"><span ref={lab}>Preparing...</span><span><HourglassGlyph size={14} /> <span ref={cnt}>{'\u00d70'}</span></span></div>
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
      <div className="rpg-ribbon cd-ribbon" data-tone="red" style={{ fontSize: '1.55rem' }}><span ref={ribbon}>Wave 1 incoming</span></div>
      <div ref={num} className="countdown-num cd-gold">5</div>
    </div>
  );
};
export { Ribbon };

/** "Skip" for the siege cutscene (also Enter). Pure ref/DOM visibility. */
export const SiegeSkip: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const on = useRef(false);
  useRaf(() => {
    const show = world.director.phase === 'SIEGE';
    if (show !== on.current) { on.current = show; if (root.current) root.current.style.display = show ? 'flex' : 'none'; }
  });
  return (
    <div ref={root} className="absolute left-0 right-0 justify-center pe" style={{ display: 'none', bottom: '9rem', zIndex: 55 }}>
      <Button size="sm" onClick={skipCutscene} data-testid="skip-siege">Skip (Enter)</Button>
    </div>
  );
};

/** Respite between waves: shops are open for 20 s. Timer + Continue button. */
export const RespiteBar: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const tm = useRef<HTMLSpanElement>(null);
  const st = useRef({ show: false, t: -1 });
  useRaf(() => {
    const d = world.director, s = st.current;
    const show = d.phase === 'RESPITE';
    if (show !== s.show) { s.show = show; if (root.current) root.current.style.display = show ? 'flex' : 'none'; }
    if (!show) return;
    const t = Math.ceil(d.respiteT);
    if (t !== s.t && tm.current) { s.t = t; tm.current.textContent = `${t}s`; }
  });
  return (
    <div ref={root} className="absolute left-0 right-0 flex-col items-center gap-2 pointer-events-none" style={{ display: 'none', top: '8.5rem', zIndex: 45 }} data-testid="respite">
      <div className="rpg-ribbon" data-tone="green" style={{ fontSize: '1.3rem' }}>Respite · shops are open · <span ref={tm}>20s</span></div>
      <div className="pe"><Button variant="primary" size="sm" onClick={skipRespite} data-testid="continue">Continue to next wave</Button></div>
    </div>
  );
};
