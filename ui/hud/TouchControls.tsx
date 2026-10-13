// Touch controls: floating virtual joystick (move), optional aim stick (auto-aim off) and big ability buttons.
// Everything is pointer-event based (multi-touch safe) and writes straight into world.input like the keyboard does.
import React, { useEffect, useRef } from 'react';
import { world } from '../../engine/world';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import { useRaf } from '../hooks/useRaf';
import { ABILITIES, ULTS } from '../../abilityDefs';
import { PaintedIcon } from '../components/SkillIcons';
import { POTION_COOLDOWN } from '../../constants';

const R_BASE = 56;   // joystick radius in css px (scaled by --ui-scale via the zone's size)

/** Floating stick: appears where the finger lands. `onMove` receives a vector in -1..1 (screen right = +x, screen down = +y). */
const Stick: React.FC<{ style: React.CSSProperties; onMove: (x: number, y: number, active: boolean) => void; label: string; testId: string; tone: string }> = ({ style, onMove, label, testId, tone }) => {
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const st = useRef({ id: -1, ox: 0, oy: 0 });
  const scale = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

  const upd = (e: React.PointerEvent) => {
    const s = st.current, R = R_BASE * scale();
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, dy / R, true);
  };
  const down = (e: React.PointerEvent) => {
    const s = st.current;
    if (s.id !== -1) return;
    s.id = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = zone.current!.getBoundingClientRect();
    s.ox = e.clientX; s.oy = e.clientY;
    const b = base.current!;
    b.style.left = `${e.clientX - rect.left}px`; b.style.top = `${e.clientY - rect.top}px`; b.style.opacity = '1';
    upd(e);
  };
  const move = (e: React.PointerEvent) => { if (e.pointerId === st.current.id) upd(e); };
  const up = (e: React.PointerEvent) => {
    if (e.pointerId !== st.current.id) return;
    st.current.id = -1;
    if (base.current) base.current.style.opacity = '0.28';
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
    onMove(0, 0, false);
  };
  useEffect(() => () => onMove(0, 0, false), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const sz = `calc(${R_BASE * 2}px * var(--ui-scale))`;
  return (
    <div ref={zone} className="pe tc-zone" data-testid={testId} aria-label={label} style={style}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <div ref={base} className="tc-base" style={{ width: sz, height: sz, borderColor: tone }}>
        <div ref={knob} className="tc-knob" style={{ width: `calc(${R_BASE * 0.85}px * var(--ui-scale))`, height: `calc(${R_BASE * 0.85}px * var(--ui-scale))`, background: `radial-gradient(circle at 35% 30%, #fff3c4, ${tone} 70%)` }} />
      </div>
    </div>
  );
};

interface BtnProps {
  code: string; label: string; size: number; icon?: React.ReactNode; hold?: boolean; accent?: string; ult?: boolean; getCd?: () => { t: number; max: number }; qty?: () => number; mana?: () => number; testId?: string;
}
/** Big round action button. Edge-triggers `pressed[code]` and holds `keys[code]` while the finger is down. */
const TBtn: React.FC<BtnProps> = ({ code, label, size, icon, accent = '#e9b949', ult, getCd, qty, mana, testId }) => {
  const root = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const id = useRef(-1);
  const prev = useRef({ cd: '', tx: '', dim: false, ready: false });
  useRaf(() => {
    const p = prev.current;
    let frac = 0, t = 0;
    if (ult) { frac = 0; t = 0; const pl = world.player; const ready = pl.ult >= 99.99 && pl.ultT <= 0; const tx = ready ? 'R' : pl.ultT > 0 ? '...' : `${Math.floor(pl.ult)}%`; if (tx !== p.tx) { p.tx = tx; if (txt.current) txt.current.textContent = tx; } if (ready !== p.ready) { p.ready = ready; root.current?.classList.toggle('tc-ready', ready); } return; }
    if (getCd) { const c = getCd(); t = c.t; frac = c.max > 0 ? Math.min(1, Math.max(0, t / c.max)) : 0; }
    const v = t > 0.04 ? frac.toFixed(3) : '0';
    if (v !== p.cd) { p.cd = v; sweep.current?.style.setProperty('--cd', v); sweep.current?.style.setProperty('--cdv', v === '0' ? '0' : '1'); }
    const tx = t > 0.04 ? (t >= 10 ? String(Math.ceil(t)) : t.toFixed(1)) : qty ? String(qty()) : '';
    if (tx !== p.tx) { p.tx = tx; if (txt.current) txt.current.textContent = tx; }
    const dim = mana ? world.player.mana < mana() : false;
    if (dim !== p.dim) { p.dim = dim; root.current?.classList.toggle('tc-dim', dim); }
  });
  const press = (e: React.PointerEvent) => {
    e.preventDefault();
    if (id.current !== -1) return;
    id.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    world.input.pressed[code] = true; world.input.keys[code] = true;
    root.current?.classList.add('tc-down');
  };
  const release = (e: React.PointerEvent) => {
    if (e.pointerId !== id.current) return;
    id.current = -1; world.input.keys[code] = false; root.current?.classList.remove('tc-down');
  };
  return (
    <div ref={root} className="pe tc-btn" data-testid={testId || `tc-${code}`} role="button" aria-label={label}
      style={{ width: size, height: size, ['--rc' as any]: accent, fontSize: ult ? undefined : undefined }}
      onPointerDown={press} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      {icon && <span className="tc-icon">{icon}</span>}
      <div ref={sweep} className="cd-sweep" />
      <span ref={txt} className="tc-txt" />
      <span className="tc-key">{label}</span>
    </div>
  );
};

export const TouchControls: React.FC = () => {
  const status = useGameStore((s) => s.status);
  const hero = useGameStore((s) => s.hero);
  const side = useGameStore((s) => s.settings.joystickSide);
  const autoAim = useGameStore((s) => s.settings.autoAim);
  const open = useGameStore((s) => s.isInventoryOpen || s.isShopOpen || s.isCharacterSheetOpen || s.isPauseMenuOpen);
  const ui = useUiStore((s) => s.settingsOpen || s.codexOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults || s.recordsOpen || !s.titleDone);
  const village = status === GameStatus.MENU;
  const active = (status === GameStatus.PLAYING || village) && !open && !ui;
  useEffect(() => { if (!active) { const i = world.input; i.joy.active = false; i.joy.x = i.joy.z = 0; i.aimStick.active = false; for (const k in i.keys) i.keys[k] = false; } }, [active]);
  if (!active) return null;

  const left = side === 'LEFT';
  const defs = ABILITIES[hero];
  const icon = (slot: string) => <PaintedIcon id={defs.find((a) => a.slot === slot)!.icon} />;
  const p = world.player;
  const S = 58, B = 68;
  const inset = 'calc(env(safe-area-inset-left, 0px) + 1.2vw)';
  const insetR = 'calc(env(safe-area-inset-right, 0px) + 1.2vw)';
  const cluster: React.CSSProperties = { position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5vh)', [left ? 'right' : 'left']: left ? insetR : inset, display: 'grid', gap: 8, zIndex: 6, direction: 'ltr' } as any;
  const joyZone: React.CSSProperties = { position: 'absolute', top: '22%', bottom: 0, [left ? 'left' : 'right']: 0, width: '46%', zIndex: 5 } as any;
  const aimZone: React.CSSProperties = { position: 'absolute', top: '16%', bottom: '38%', [left ? 'right' : 'left']: 0, width: '36%', zIndex: 5 } as any;
  void S; void B;

  return (
    <div className="tc-root">
      <Stick testId="joystick" label="Move" tone="#f0dca8" style={joyZone}
        onMove={(x, y, a) => { const j = world.input.joy; j.active = a; j.x = a ? x : 0; j.z = a ? y : 0; }} />
      {!autoAim && !village && (
        <Stick testId="aimstick" label="Aim" tone="#ff9a7a" style={aimZone}
          onMove={(x, y, a) => { const j = world.input.aimStick; j.active = a; j.x = a ? x : 0; j.z = a ? y : 0; }} />
      )}
      <div style={cluster}>
        {village ? (
          <div className="flex gap-3 items-end">
            <TBtn code="KeyF" label="Harvest" size={64} accent="#7ae0a0" icon={<PaintedIcon id="magnet" />} />
            <TBtn code="KeyE" label="Interact" size={78} accent="#ffd24a" testId="tc-interact" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 1 }}>
              <TBtn code="Digit1" label="HP" size={44} accent="#d6252b" icon={<PaintedIcon id="HP" />} getCd={() => ({ t: p.hpPotCd, max: POTION_COOLDOWN })}
                qty={() => useGameStore.getState().inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Health') ? n + (i.quantity || 1) : n), 0)} />
              <TBtn code="Digit2" label="MP" size={44} accent="#2f6fe0" icon={<PaintedIcon id="MP" />} getCd={() => ({ t: p.mpPotCd, max: POTION_COOLDOWN })}
                qty={() => useGameStore.getState().inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Mana') ? n + (i.quantity || 1) : n), 0)} />
            </div>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 2 }}>
              <TBtn code="Digit4" label="4" size={54} icon={icon('s4')} getCd={() => ({ t: p.cd.s4, max: p.cdMax.s4 })} mana={() => useGameStore.getState().getManaCost('s4')} />
              <TBtn code="Digit3" label="3" size={54} icon={icon('s3')} getCd={() => ({ t: p.cd.s3, max: p.cdMax.s3 })} mana={() => useGameStore.getState().getManaCost('s3')} />
              <TBtn code="KeyR" label="ULT" size={64} ult accent="#ffd24a" icon={<PaintedIcon id={ULTS[hero].icon} />} />
            </div>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 3 }}>
              <TBtn code="KeyE" label="E" size={54} icon={icon('e')} getCd={() => ({ t: p.cd.e, max: p.cdMax.e })} mana={() => useGameStore.getState().getManaCost('e')} />
              <TBtn code="KeyQ" label="Q" size={54} icon={icon('q')} getCd={() => ({ t: p.cd.q, max: p.cdMax.q })} mana={() => useGameStore.getState().getManaCost('q')} />
              <TBtn code="Space" label="DASH" size={72} accent="#7ad0ff" icon={<PaintedIcon id="DASH" />} getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} testId="tc-dash" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
