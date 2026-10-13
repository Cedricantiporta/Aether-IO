// Touch controls: floating virtual joystick (move), optional aim stick (auto-aim off) and big ability buttons.
// Everything is pointer-event based (multi-touch safe) and writes straight into world.input like the keyboard does.
import React, { useEffect, useRef } from 'react';
import { world } from '../../engine/world';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import { useRaf } from '../hooks/useRaf';
import { activeDefs, dashDef, ACTIVE_ORDER, ULTS } from '../../abilityDefs';
import { ComboMeter } from './ComboMeter';
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
  inert?: boolean; code: string; label: string; size: number; icon?: React.ReactNode; hold?: boolean; accent?: string; ult?: boolean; getCd?: () => { t: number; max: number }; qty?: () => number; mana?: () => number; testId?: string;
}
/** Big round action button. Edge-triggers `pressed[code]` and holds `keys[code]` while the finger is down. */
const TBtn: React.FC<BtnProps> = ({ inert, code, label, size, icon, accent = '#e9b949', ult, getCd, qty, mana, testId }) => {
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
    if (inert) return;
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

const DRAG_PX = 92;   // css px (scaled) for a full-length drag

/** Skill button with Wild-Rift style drag-aiming: drag = aim, release = cast, drag back to the centre / into the top zone = cancel, tap = auto-target. */
const SkillBtn: React.FC<Omit<BtnProps, 'code'> & { skill: string; aimable?: boolean; onDrag?: (on: boolean, cancel: boolean) => void }> = ({ skill, aimable = true, onDrag, ...p }) => {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ id: -1, cx: 0, cy: 0, t: 0, token: 0 });
  const scale = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  const T = world.input.touchAim;
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const s = st.current;
    if (s.id !== -1) return;
    s.id = e.pointerId; s.token++; s.t = performance.now();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    s.cx = r.left + r.width / 2; s.cy = r.top + r.height / 2;
    T.active = true; T.id = skill; T.dx = 0; T.dz = 0; T.mag = 0; T.cancel = false;
    ref.current?.classList.add('tc-down');
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    if (e.pointerId !== s.id || !aimable) return;
    const sc = scale();
    const dx = e.clientX - s.cx, dy = e.clientY - s.cy;
    const l = Math.hypot(dx, dy);
    T.mag = Math.min(1, l / (DRAG_PX * sc));
    if (l > 1) { T.dx = dx / l; T.dz = dy / l; }
    T.cancel = e.clientY < s.cy - 175 * sc;
    onDrag?.(l > 14 * sc, T.cancel);
  };
  const up = (e: React.PointerEvent) => {
    const s = st.current;
    if (e.pointerId !== s.id) return;
    s.id = -1;
    const tok = s.token;
    ref.current?.classList.remove('tc-down');
    onDrag?.(false, false);
    // keep `active` for ~2 frames so an instant tap is still seen by the sim
    setTimeout(() => { if (st.current.token === tok && st.current.id === -1) T.active = false; }, 40);
  };
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} style={{ touchAction: 'none' }}>
        <TBtn {...p} code={'__none__' + skill} testId={p.testId || 'tc-' + skill} inert />
      </div>
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
  const [drag, setDragS] = React.useState<{ on: boolean; cancel: boolean }>({ on: false, cancel: false });
  const setDrag = (on: boolean, cancel: boolean) => setDragS((d) => (d.on === on && d.cancel === cancel ? d : { on, cancel }));
  if (!active) return null;

  const left = side === 'LEFT';
  const defs = activeDefs(hero);
  const order = ACTIVE_ORDER[hero];
  const dDef = dashDef(hero);
  const icon = (i: number) => <PaintedIcon id={defs[i].icon} />;
  const sk = (i: number) => ({ getCd: () => ({ t: p.cd[order[i]], max: p.cdMax[order[i]] }), mana: () => useGameStore.getState().getManaCost(order[i]) });
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
      {drag.on && (
        <div aria-hidden style={{ position: 'absolute', left: '50%', top: '7%', transform: 'translateX(-50%)', padding: '.5rem 2.2rem', borderRadius: 999, zIndex: 8, pointerEvents: 'none', fontWeight: 800, letterSpacing: '.18em',
          background: drag.cancel ? 'rgba(220,40,40,.85)' : 'rgba(0,0,0,.45)', color: '#fff', border: `2px solid ${drag.cancel ? '#ff9a8a' : 'rgba(255,255,255,.35)'}` }}>
          {drag.cancel ? 'RELEASE TO CANCEL' : 'DRAG HERE TO CANCEL'}
        </div>
      )}
      {!village && <ComboMeter touch />}
      <div style={cluster}>
        {village ? (
          <div className="flex gap-3 items-end">
            <TBtn code="KeyF" label="Harvest" size={64} accent="#7ae0a0" icon={<PaintedIcon id="magnet" />} />
            <TBtn code="KeyE" label="Interact" size={78} accent="#ffd24a" testId="tc-interact" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 1 }}>
              <TBtn code="KeyZ" label="HP" size={44} accent="#d6252b" icon={<PaintedIcon id="HP" />} getCd={() => ({ t: p.hpPotCd, max: POTION_COOLDOWN })}
                qty={() => useGameStore.getState().inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Health') ? n + (i.quantity || 1) : n), 0)} />
              <TBtn code="KeyX" label="MP" size={44} accent="#2f6fe0" icon={<PaintedIcon id="MP" />} getCd={() => ({ t: p.mpPotCd, max: POTION_COOLDOWN })}
                qty={() => useGameStore.getState().inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Mana') ? n + (i.quantity || 1) : n), 0)} />
            </div>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 2 }}>
              <SkillBtn skill="s3" label="3" size={54} icon={icon(2)} {...sk(2)} onDrag={setDrag} />
              <SkillBtn skill="s2" label="2" size={54} icon={icon(1)} {...sk(1)} onDrag={setDrag} />
              <SkillBtn skill="ult" label="ULT" size={64} ult accent="#ffd24a" icon={<PaintedIcon id={ULTS[hero].icon} />} onDrag={setDrag} />
            </div>
            <div className="flex gap-2 justify-end items-end" style={{ gridRow: 3 }}>
              <SkillBtn skill="s1" label="1" size={54} icon={icon(0)} {...sk(0)} onDrag={setDrag} />
              <SkillBtn skill="dash" label="DASH" size={72} accent="#7ad0ff" icon={<PaintedIcon id={dDef.icon} />} getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} testId="tc-dash" aimable={hero !== 'BARBARIAN'} onDrag={setDrag} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
