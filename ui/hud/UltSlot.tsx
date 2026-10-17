import { forceAutoCast } from '../../engine/systems/aim';
import { useInputMode, keyHint } from '../lib/inputMode';
import { PadBtn } from '../components/PadBtn';
import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { abilityState } from '../../engine/systems/abilities';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import { tip } from '../components/Tooltip';
import { OrnateRing } from '../components/Ornate';

interface Props { icon: React.ReactNode; tooltip: React.ReactNode; color: string; locked?: number }

/** Ornate ultimate slot: radial charge fill that glows and pulses when ready (key R). */
export const UltSlot: React.FC<Props> = ({ icon, tooltip, color, locked = 0 }) => {
  const pad = useInputMode((m) => m.pad);
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const last = useRef({ v: -1, ready: false, active: false });
  useRaf(() => {
    if (locked) return;   // (static 'Lv N' label below)
    const p = world.player;
    const v = Math.floor(p.ult);
    const cd = abilityState.ultCd;
    const ready = p.ult >= 99.99 && p.ultT <= 0 && cd <= 0;
    const active = p.ultT > 0;
    const l = last.current;
    if (v !== l.v && fill.current && txt.current) {
      l.v = v;
      fill.current.style.setProperty('--ult', String(p.ult / 100));
      txt.current.textContent = ready ? keyHint('R') : `${v}%`;
    }
    if (ready !== l.ready || active !== l.active) {
      l.ready = ready; l.active = active;
      root.current?.setAttribute('data-ready', ready ? '1' : '0');
      root.current?.setAttribute('data-active', active ? '1' : '0');
      if (txt.current) txt.current.textContent = ready ? keyHint('R') : active ? '...' : cd > 0 ? `${Math.ceil(cd)}s` : `${Math.floor(p.ult)}%`;
    }
  });
  const shake = () => {
    const el = root.current; if (!el) return;
    el.classList.remove('slot-shake'); void el.offsetWidth; el.classList.add('slot-shake');
  };
  useGameEvent('onCooldown', (p) => { if (p.slot === 'r') shake(); });
  return (
    <div className="relative pe ult-slot" {...tip(tooltip)} style={{ ['--uc' as any]: color, width: '7.8rem', height: '7.8rem', flex: 'none', margin: '0 .3rem', cursor: 'pointer' }}
      onClick={() => { forceAutoCast.on = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true })); setTimeout(() => { forceAutoCast.on = false; }, 120); }, 60); }}>
      <style>{`
        .ult-slot .ult-core{position:absolute;inset:5%;border-radius:50%;overflow:hidden;background:#07050a;box-shadow:inset 0 0 12px #000}
        .ult-slot .ult-core .ico{position:absolute;inset:0;filter:grayscale(.55) brightness(.75);transition:filter .3s,transform .3s}
        .ult-slot [data-active="1"] .ult-core .ico{filter:none}
        .ult-slot [data-locked="1"] .ult-core .ico{filter:grayscale(1) brightness(.4)}
        .ult-slot [data-ready="1"] .ult-core .ico{filter:brightness(1.35) saturate(1.35) drop-shadow(0 0 6px rgba(255,226,140,.95));transform:scale(1.12);animation:ultIco 1.1s ease-in-out infinite}
        @keyframes ultIco{0%,100%{transform:scale(1.08)}50%{transform:scale(1.16)}}
        .ult-slot [data-ready="1"]{filter:drop-shadow(0 0 14px rgba(255,200,70,.85))}
        /* Genshin-style energy fill: gold liquid rising from the bottom with a rolling wave + drifting sparkles */
        .ult-slot .ult-fill{position:absolute;left:0;right:0;bottom:0;height:calc(var(--ult,0)*100%);pointer-events:none;mix-blend-mode:screen;transition:height .25s ease-out;
          background:linear-gradient(0deg,rgba(214,150,30,.85),rgba(255,214,110,.55) 70%,rgba(255,240,190,.75));}
        .ult-slot .ult-fill::before{content:'';position:absolute;left:-50%;right:-50%;top:-7px;height:14px;border-radius:45%;
          background:radial-gradient(ellipse at 50% 100%,rgba(255,246,210,.95),rgba(255,214,110,.4) 60%,transparent 70%);animation:ultWave 1.6s linear infinite}
        .ult-slot .ult-fill::after{content:'';position:absolute;inset:0;opacity:.75;
          background-image:radial-gradient(1.5px 1.5px at 20% 80%,#fff8,transparent),radial-gradient(1.5px 1.5px at 60% 60%,#fff9,transparent),radial-gradient(1px 1px at 40% 30%,#fffa,transparent),radial-gradient(1.5px 1.5px at 80% 45%,#fff7,transparent);
          background-size:100% 100%;animation:ultSpark 2.2s linear infinite}
        @keyframes ultWave{from{transform:translateX(-25%)}to{transform:translateX(25%)}}
        @keyframes ultSpark{from{background-position:0 0,0 0,0 0,0 0}to{background-position:0 -40px,0 -60px,0 -30px,0 -50px}}
        .ult-slot .ult-glow{position:absolute;inset:2%;border-radius:50%;pointer-events:none;opacity:0;box-shadow:0 0 36px 16px rgba(255,196,64,1),0 0 80px 28px rgba(255,170,40,.55),inset 0 0 26px rgba(255,226,140,1)}
        .ult-slot .ult-rays{position:absolute;inset:-14%;border-radius:50%;pointer-events:none;opacity:0;
          background:repeating-conic-gradient(from 0deg,rgba(255,220,130,.0) 0deg 10deg,rgba(255,226,140,.9) 13deg,rgba(255,220,130,0) 16deg 30deg);
          -webkit-mask:radial-gradient(circle,transparent 46%,#000 52%,transparent 70%);mask:radial-gradient(circle,transparent 46%,#000 52%,transparent 70%);animation:ultSpin 6s linear infinite}
        .ult-slot [data-ready="1"] .ult-glow{opacity:1;animation:ultPulse 1.1s ease-in-out infinite}
        .ult-slot [data-ready="1"] .ult-rays{opacity:1}
        .ult-slot [data-ready="1"] .ult-fill{background:linear-gradient(0deg,rgba(255,190,60,.35),rgba(255,236,170,.2));}   /* (full: let the bright icon show through) */
        .ult-slot [data-active="1"] .ult-glow{opacity:1;animation:ultPulse .35s ease-in-out infinite}
        .ult-slot .ult-txt{position:absolute;left:0;right:0;bottom:12%;text-align:center;font-weight:800;font-size:.8rem;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000;z-index:4;pointer-events:none}
        .ult-slot [data-ready="1"] .ult-txt{color:#fff3c0;font-size:1.05rem;bottom:34%;text-shadow:0 0 8px #c88a10,0 1px 3px #000}
        @keyframes ultPulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.08);opacity:1}}
        @keyframes ultSpin{to{transform:rotate(360deg)}}
        /* thin golden metallic rim (owner: thinner, more golden; bigger icon) */
        .ult-slot .ult-rim{position:absolute;inset:0;border-radius:50%;pointer-events:none;padding:3px;
          background:conic-gradient(from 210deg,#7a5a1e,#f6e2a0,#b8862e,#fff2c4,#8d6a26,#f1d58e,#7a5a1e);
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);
          filter:drop-shadow(0 0 2px rgba(0,0,0,.9)) drop-shadow(0 0 5px rgba(240,196,90,.35))}
      `}</style>
      <div ref={root} data-ready="0" data-active="0" data-locked={locked ? '1' : '0'} style={{ position: 'absolute', inset: 0 }}>
        <div className="ult-rays" />
        <div className="ult-glow" />
        <div className="ult-core"><div className="ico">{icon}</div><div ref={fill} className="ult-fill" /></div>
        <div className="ult-rim" />
        <span ref={txt} className="ult-txt">{locked ? `Lv ${locked}` : '0%'}</span>
      </div>
      {pad ? <PadBtn b="RT" className="pad-badge" /> : <span className="rpg-key">R</span>}
    </div>
  );
};
