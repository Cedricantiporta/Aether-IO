import React, { useRef } from 'react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Button } from '../components/Button';
import { skipCutscene, skipRespite } from '../../engine/systems/director';

const PHASE_LABEL: Record<string, string> = { SIEGE: 'Under attack!', COUNTDOWN: 'Preparing...', FIGHT: 'Enemies', CLEANUP: 'Boss defeated', BOSS: 'Boss fight', REWARD: 'Cleared', RESPITE: 'Respite' };
const mmss = (s: number) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export const WavePlaque: React.FC = () => {
  const wave = useGameStore((s) => s.wave);
  const bar = useRef<HTMLDivElement>(null);
  const lab = useRef<HTMLDivElement>(null);
  const cnt = useRef<HTMLSpanElement>(null);
  const st = useRef({ f: '', a: -1, p: '', c: '' });

  useRaf(() => {
    const d = world.director, s = st.current;
    const f = d.phase === 'FIGHT' || d.phase === 'COUNTDOWN' ? (d.phase === 'COUNTDOWN' ? 1 - Math.min(1, Math.max(0, d.countdown) / 5) : 1 - Math.min(1, d.waveTime / Math.max(1, d.waveDuration))) : d.phase === 'RESPITE' ? Math.max(0, d.respiteT) / 20 : 1;
    const fs = f.toFixed(3);
    if (bar.current && fs !== s.f) {
      s.f = fs; bar.current.style.setProperty('--fill', fs);
      const cl = d.phase === 'CLEANUP' || d.phase === 'BOSS' ? '#ef6a5e' : d.phase === 'RESPITE' ? '#5fd68e' : '#f2a93b';
      if (cl !== s.c) { s.c = cl; bar.current.style.setProperty('--bc', cl); }
    }
    const boss = d.wave % 10 === 0;
    const left = Math.max(0, d.quotaTotal - d.quotaSpawned) + d.aliveCount;
    const fight = d.phase === 'FIGHT';
    const key = `${d.phase}|${left}|${d.quotaTotal}|${fight ? Math.ceil(d.waveDuration - d.waveTime) : d.phase === 'RESPITE' ? Math.ceil(d.respiteT) : 0}`;
    if (key !== s.p) {
      s.p = key;
      if (lab.current) lab.current.textContent = fight ? (boss ? 'Boss fight' : `${left} enemies left`) : (PHASE_LABEL[d.phase] ?? d.phase);
      if (cnt.current) cnt.current.textContent = fight && !boss ? mmss(d.waveDuration - d.waveTime) : d.phase === 'RESPITE' ? mmss(d.respiteT) : '';
    }
  });

  return (
    <div className="wave-pill glass pe">
      <div className="wt"><span>Wave {wave}</span><span className="tm" ref={cnt} /></div>
      <div className="wbar" ref={bar}><div className="fill" /></div>
      <div className="wsub" ref={lab}>Preparing...</div>
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
    <div ref={root} className="absolute inset-0 flex-col items-center justify-center pointer-events-none gap-2" style={{ display: 'none', justifyContent: 'flex-start', paddingTop: 'calc(var(--sat) + max(88px, 26vh))' }}>
      <div className="cap-pill"><span ref={ribbon}>Wave 1 incoming</span></div>
      <div ref={num} className="countdown-num">5</div>
    </div>
  );
};


/** "Skip" for the siege cutscene (also Enter). Pure ref/DOM visibility. */
export const SiegeSkip: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const on = useRef(false);
  useRaf(() => {
    const show = world.director.phase === 'SIEGE';
    if (show !== on.current) { on.current = show; if (root.current) root.current.style.display = show ? 'flex' : 'none'; }
  });
  return (
    <div ref={root} className="absolute left-0 right-0 justify-center pe" style={{ display: 'none', bottom: 'calc(var(--sab) + 28vh)', zIndex: 55 }}>
      <Button size="sm" onClick={skipCutscene} data-testid="skip-siege">Skip</Button>
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
    <div ref={root} className="absolute left-0 right-0 flex-col items-center gap-2 pointer-events-none" style={{ display: 'none', bottom: 'calc(var(--sab) + 30vh)', zIndex: 45 }} data-testid="respite">
      <div className="cap-pill">Respite · shops open · <span ref={tm}>20s</span></div>
      <div className="pe"><Button variant="primary" size="sm" onClick={skipRespite} data-testid="continue">Continue to next wave</Button></div>
    </div>
  );
};
