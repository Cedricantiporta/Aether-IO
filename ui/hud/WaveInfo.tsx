import React, { useRef } from 'react';
import { Skull, Swords } from 'lucide-react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Ribbon } from '../components/Frame';

const PHASE_LABEL: Record<string, string> = { COUNTDOWN: 'Preparing', FIGHT: 'Survive', CLEANUP: 'Finish them', BOSS: 'Boss fight', REWARD: 'Cleared' };

export const WavePlaque: React.FC = () => {
  const wave = useGameStore((s) => s.wave);
  const bar = useRef<HTMLDivElement>(null);
  const alive = useRef<HTMLSpanElement>(null);
  const phase = useRef<HTMLDivElement>(null);
  const st = useRef({ f: '', a: -1, p: '', c: '' });
  const isBossWave = wave > 0 && wave % 10 === 0;

  useRaf(() => {
    const d = world.director, s = st.current;
    const f = d.phase === 'FIGHT' || d.phase === 'COUNTDOWN' ? (d.phase === 'COUNTDOWN' ? 0 : Math.min(1, d.waveTime / Math.max(1, d.waveDuration))) : 1;
    const fs = f.toFixed(3);
    if (bar.current && fs !== s.f) {
      s.f = fs; bar.current.style.setProperty('--fill', fs);
      const cl = d.phase === 'CLEANUP' || d.phase === 'BOSS' ? '#e0554a' : '#e9b949';
      if (cl !== s.c) { s.c = cl; bar.current.style.setProperty('--bc', cl); }
    }
    if (alive.current && d.aliveCount !== s.a) { s.a = d.aliveCount; alive.current.textContent = String(d.aliveCount); }
    if (phase.current && d.phase !== s.p) { s.p = d.phase; phase.current.textContent = PHASE_LABEL[d.phase] ?? d.phase; }
  });

  return (
    <div className="flex flex-col items-center">
      <div className="rpg-panel slim wave-plaque flex flex-col items-center" style={{ minWidth: '13rem' }}>
        <div className="rpg-title text-[1.7rem] leading-none flex items-center gap-2">
          {isBossWave && <Skull size={20} color="#ff6b5e" />}Wave {wave}{isBossWave && <Skull size={20} color="#ff6b5e" />}
        </div>
        <div className="rpg-bar thin segmented w-full mt-2" ref={bar}><div className="fill" /></div>
        <div className="flex items-center justify-between w-full mt-[.35rem]">
          <div ref={phase} className="rpg-label !text-[.6rem]">Preparing</div>
          <div className="flex items-center gap-1 rpg-num text-[.72rem] text-[#ffb3aa]"><Swords size={11} /><span ref={alive}>0</span></div>
        </div>
      </div>
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
    <div ref={root} className="absolute inset-0 flex-col items-center justify-center pointer-events-none" style={{ display: 'none', paddingBottom: '8rem' }}>
      <div className="rpg-ribbon" data-tone="red" style={{ fontSize: '1.5rem' }}><span ref={ribbon}>Wave 1 incoming</span></div>
      <div ref={num} className="countdown-num">5</div>
    </div>
  );
};
export { Ribbon };
