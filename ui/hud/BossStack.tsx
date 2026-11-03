import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { layerCol } from './BossBar';

// MULTI-BOSS bars (owner 2026-11-03; data = world.bosses, engine/systems/bossList.ts). The big bar (BossBar.tsx) is the room's main boss (world.boss);
// every OTHER live boss gets a slim row stacked under it (name, stacked x-N HP layers, shield, invulnerable state), and while 2+ bosses live a
// small floating bar rides above every boss's head. All DOM refs written from the shared rAF (no setState); a dead boss's row fades out.
const ROWS = [0, 1, 2, 3];

const BossRow: React.FC<{ k: number }> = ({ k }) => {
  const root = useRef<HTMLDivElement>(null), name = useRef<HTMLSpanElement>(null), fill = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const val = useRef<HTMLSpanElement>(null), lay = useRef<HTMLSpanElement>(null), shRow = useRef<HTMLDivElement>(null), shFill = useRef<HTMLDivElement>(null), ward = useRef<HTMLSpanElement>(null);
  const st = useRef({ show: false, op: -1, name: '', w: '', val: -1, layer: -1, ward: false, sh: -1 });
  useRaf(() => {
    const Q = world.bosses[k], s = st.current;
    const hidden = Q.id < 0 || (!Q.active && Q.fade <= 0) || (Q.id === world.bossMain && world.boss.active);
    if (hidden !== !s.show) {
      s.show = !hidden;
      if (root.current) root.current.style.display = hidden ? 'none' : 'block';
      if (!hidden) { s.layer = -1; s.name = ''; s.val = -1; s.w = ''; s.op = -1; s.ward = false; s.sh = -1; }
    }
    if (hidden) return;
    const op = Q.active ? 1 : Math.max(0, Q.fade / 0.9);   // a dead boss's bar fades out
    if (op !== s.op) { s.op = op; if (root.current) root.current.style.opacity = op.toFixed(2); }
    if (name.current && Q.name !== s.name) { s.name = Q.name; name.current.textContent = Q.name; }
    const L = Math.max(1, Q.layers | 0), seg = Math.max(1, Q.maxHp) / L;
    const layer = L > 1 ? Math.max(1, Math.min(L, Math.ceil(Q.hp / seg - 1e-6))) : 1;
    const f = L > 1 ? Math.max(0, Math.min(1, (Q.hp - (layer - 1) * seg) / seg)) : Math.max(0, Math.min(1, Q.hp / Math.max(1, Q.maxHp)));
    if (layer !== s.layer) {
      s.layer = layer;
      if (fill.current) fill.current.style.background = L > 1 ? layerCol(layer - 1) : '';
      if (track.current) { if (L > 1 && layer > 1) track.current.style.setProperty('background', layerCol(layer - 2), 'important'); else track.current.style.removeProperty('background'); }
      if (lay.current) { lay.current.textContent = L > 1 ? `x${layer}` : ''; lay.current.style.color = layerCol(layer - 1); }
    }
    const ws = f.toFixed(4);
    if (fill.current && ws !== s.w) { s.w = ws; fill.current.style.width = `${f * 100}%`; }
    const v = Math.ceil(Q.hp);
    if (val.current && v !== s.val) { s.val = v; val.current.textContent = `${v.toLocaleString()} / ${Math.ceil(Q.maxHp).toLocaleString()}`; }
    if (Q.ward !== s.ward) { s.ward = Q.ward; if (ward.current) ward.current.style.display = Q.ward ? 'inline' : 'none'; if (track.current) track.current.style.opacity = Q.ward ? '0.55' : '1'; }
    const fsh = Q.shield > 0 && Q.shieldMax > 0 ? Math.min(1, Q.shield / Q.shieldMax) : 0, fk = Math.round(fsh * 100);
    if (fk !== s.sh) { s.sh = fk; if (shRow.current) shRow.current.style.visibility = fk > 0 ? 'visible' : 'hidden'; if (shFill.current) shFill.current.style.width = `${fk}%`; }
  });
  return (
    <div ref={root} className="bb-slim" data-testid="boss-bar-extra" data-slot={k} style={{ display: 'none', marginTop: '.4rem', transition: 'opacity .15s' }}>
      <div className="bb-name text-center leading-none"><span ref={name} className="bb-n" /><span ref={ward} className="bb-t" style={{ display: 'none', marginLeft: '.4rem', color: '#9ad0ff' }}>invulnerable</span></div>
      <div className="bb-bar">
        <div ref={shRow} className="bb-shield" style={{ visibility: 'hidden', height: '.22rem' }}><div ref={shFill} className="bb-shield-fill" style={{ width: '0%' }} /></div>
        <div ref={track} className="bb-track"><div ref={fill} className="bb-fill" style={{ width: '100%' }} /><div className="bb-val rpg-num"><span ref={lay} style={{ fontWeight: 800, marginRight: '.4rem' }} /><span ref={val} /></div></div>
        <svg className="bb-ic" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2C6.9 2 3 5.7 3 10.4c0 2.7 1.3 5 3.4 6.5V20c0 1.1.9 2 2 2h1.1v-2.4h1.4V22h2.2v-2.4h1.4V22h1.1c1.1 0 2-.9 2-2v-3.1c2.1-1.5 3.4-3.8 3.4-6.5C21 5.7 17.1 2 12 2zm-3.6 11.2a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm7.2 0a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2z" /></svg>
      </div>
    </div>
  );
};

/** Slim rows of the extra bosses, docked under the main bar. */
export const BossStack: React.FC = () => {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef({ on: false, top: -1 });
  useRaf(() => {
    let n = 0;
    for (let k = 0; k < world.bosses.length; k++) { const Q = world.bosses[k]; if (Q.id >= 0 && (Q.active || Q.fade > 0) && !(Q.id === world.bossMain && world.boss.active)) n++; }
    const on = n > 0, s = st.current;
    if (on !== s.on) { s.on = on; if (box.current) box.current.style.display = on ? 'block' : 'none'; }
    if (!on || !box.current) return;
    const m = document.getElementById('boss-bar-main'), r = m && world.boss.active ? m.getBoundingClientRect() : null;
    const top = r && r.height > 0 ? r.bottom + 2 : 56;
    if (Math.abs(top - s.top) > 0.5) { s.top = top; box.current.style.top = `${top.toFixed(1)}px`; }
  });
  return <div ref={box} data-testid="boss-stack" style={{ display: 'none', position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 'min(20rem, 62vw)', zIndex: 4, pointerEvents: 'none' }}>{ROWS.map((k) => <BossRow key={k} k={k} />)}</div>;
};

/** Small floating bar over each boss's head while 2+ bosses live (the stack tells which is which; this one tells where). */
const BossFloat: React.FC<{ k: number }> = ({ k }) => {
  const root = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null);
  const st = useRef({ show: false, w: '', col: '' });
  useRaf(() => {
    const Q = world.bosses[k], s = st.current;
    const on = world.bossLive >= 2 && Q.active && Q.onScreen;
    if (on !== s.show) { s.show = on; if (root.current) root.current.style.display = on ? 'block' : 'none'; }
    if (!on || !root.current || !fill.current) return;
    root.current.style.transform = `translate(${(Q.sx - 56).toFixed(1)}px, ${(Q.sy - 14).toFixed(1)}px)`;
    const L = Math.max(1, Q.layers | 0), seg = Math.max(1, Q.maxHp) / L, layer = Math.max(1, Math.min(L, Math.ceil(Q.hp / seg - 1e-6)));
    const f = Math.max(0, Math.min(1, (Q.hp - (layer - 1) * seg) / seg)).toFixed(3);
    if (f !== s.w) { s.w = f; fill.current.style.width = `${Number(f) * 100}%`; }
    const c = layerCol(layer - 1); if (c !== s.col) { s.col = c; fill.current.style.background = c; }
  });
  return <div ref={root} data-testid="boss-float" style={{ display: 'none', position: 'absolute', left: 0, top: 0, width: '7rem', height: '.5rem', background: 'rgba(0,0,0,.6)', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(0,0,0,.8)', zIndex: 3, pointerEvents: 'none', willChange: 'transform' }}><div ref={fill} style={{ height: '100%', width: '100%' }} /></div>;
};
export const BossFloaters: React.FC = () => <>{ROWS.map((k) => <BossFloat key={k} k={k} />)}</>;
