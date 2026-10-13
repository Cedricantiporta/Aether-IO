// Touch controls: floating virtual joystick (move), optional aim stick (auto-aim off) and big ability buttons.
// Everything is pointer-event based (multi-touch safe) and writes straight into world.input like the keyboard does.
import React, { useEffect, useRef } from 'react';
import { world } from '../../engine/world';
import { abilityState } from '../../engine/systems/abilities';
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
      <div ref={base} className="tc-base" style={{ width: sz, height: sz, borderColor: tone === '#ffffff' ? undefined : tone }}>
        <div ref={knob} className="tc-knob" style={{ width: `calc(${R_BASE * 0.85}px * var(--ui-scale))`, height: `calc(${R_BASE * 0.85}px * var(--ui-scale))`, background: tone === '#ffffff' ? undefined : tone }} />
      </div>
    </div>
  );
};

interface BtnProps {
  inert?: boolean; code: string; label: string; size: number; icon?: React.ReactNode; accent?: string; ult?: boolean; getCd?: () => { t: number; max: number }; qty?: (s: ReturnType<typeof useGameStore.getState>) => number; mana?: () => number; testId?: string;
}
/** Round action button (size in units of --u). Edge-triggers `pressed[code]` and holds `keys[code]` while the finger is down. */
const TBtn: React.FC<BtnProps> = ({ inert, code, label, size, icon, accent = '#ffffff', ult, getCd, qty, mana, testId }) => {
  const root = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const id = useRef(-1);
  const prev = useRef({ cd: '', tx: '', dim: false, ready: false, ult: '' });
  useRaf(() => {
    const p = prev.current;
    let frac = 0, t = 0;
    if (ult) {
      const pl = world.player; const ucd = abilityState.ultCd; const ready = pl.ult >= 99.99 && pl.ultT <= 0 && ucd <= 0;
      const tx = ready ? '' : pl.ultT > 0 ? '...' : ucd > 0 ? `${Math.ceil(ucd)}s` : `${Math.floor(pl.ult)}%`;
      if (tx !== p.tx) { p.tx = tx; if (txt.current) txt.current.textContent = tx; }
      if (ready !== p.ready) { p.ready = ready; root.current?.classList.toggle('tc-ready', ready); }
      const u = (pl.ult / 100).toFixed(2);
      if (u !== p.ult) { p.ult = u; shade.current?.style.setProperty('--ult', u); }
      return;
    }
    if (getCd) { const c = getCd(); t = c.t; frac = c.max > 0 ? Math.min(1, Math.max(0, t / c.max)) : 0; }
    const v = t > 0.04 ? frac.toFixed(3) : '0';
    if (v !== p.cd) { p.cd = v; sweep.current?.style.setProperty('--cd', v); sweep.current?.style.setProperty('--cdv', v === '0' ? '0' : '1'); }
    const tx = t > 0.04 ? (t >= 10 ? String(Math.ceil(t)) : t.toFixed(1)) : '';
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
    <div ref={root} className="rbtn pe" data-testid={testId || `tc-${code}`} role="button" aria-label={label}
      style={{ ['--s' as any]: `100%`, ['--rc' as any]: accent, width: '100%', height: '100%' }}
      onPointerDown={press} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <div className="rb-in">
        {icon && <span className="slot-icon">{icon}</span>}
        {ult && <div ref={shade} className="absolute inset-0" style={{ background: 'conic-gradient(rgba(10,12,20,0) calc(var(--ult,0)*360deg), rgba(10,12,20,.6) 0)' }} />}
        <div ref={sweep} className="cd-sweep" />
        <span ref={txt} className="rb-txt" style={{ bottom: 'auto', top: '50%', transform: 'translateY(-50%)', fontSize: size > 1.2 ? 13 : 14 }} />
      </div>
      {qty && <Qty sel={qty} />}
    </div>
  );
};

/** Potion count badge: store selector (re-renders only when the count changes). */
const Qty: React.FC<{ sel: (s: ReturnType<typeof useGameStore.getState>) => number }> = ({ sel }) => {
  const n = useGameStore(sel);
  return <span className="rb-qty" style={n <= 0 ? { color: '#ff8a80' } : undefined}>{n}</span>;
};

const DRAG_PX = 92;   // css px (scaled) for a full-length drag

type At = { cx: number; cy: number; size: number };
/** Absolute slot inside the cluster: centre at (cx, cy) units from the cluster's bottom/outer corner. */
const slotStyle = ({ cx, cy, size }: At, left: boolean, minPx = 44): React.CSSProperties => {
  const sz = `max(${minPx}px, calc(var(--u) * ${size}))`;
  return { [left ? 'left' : 'right']: `calc(var(--u) * ${cx})`, bottom: `calc(var(--u) * ${cy})`, width: sz, height: sz } as React.CSSProperties;
};

/** Skill button with Wild-Rift style drag-aiming: drag = aim, release = cast, drag back to the centre / into the top zone = cancel, tap = auto-target. */
const SkillBtn: React.FC<Omit<BtnProps, 'code' | 'size'> & { skill: string; at: At; left: boolean; aimable?: boolean; onDrag?: (on: boolean, cancel: boolean) => void }> = ({ skill, at, left, aimable = true, onDrag, ...p }) => {
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
    ref.current?.firstElementChild?.classList.add('tc-down');
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
    ref.current?.firstElementChild?.classList.remove('tc-down');
    onDrag?.(false, false);
    // keep `active` for ~2 frames so an instant tap is still seen by the sim
    setTimeout(() => { if (st.current.token === tok && st.current.id === -1) T.active = false; }, 40);
  };
  return (
    <div ref={ref} style={{ ...slotStyle(at, left), touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <TBtn {...p} size={at.size} code={'__none__' + skill} testId={p.testId || 'tc-' + skill} inert />
    </div>
  );
};

type GS = ReturnType<typeof useGameStore.getState>;
const hpQty = (s: GS) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Health') ? n + (i.quantity || 1) : n), 0);
const mpQty = (s: GS) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Mana') ? n + (i.quantity || 1) : n), 0);

// Cluster geometry (units of --u from the corner): ult is the hub, skills fan out on an arc, dash sits beside the hub, potions beyond.
const G = {
  ult: { cx: 1.6, cy: 1.0, size: 1.35 }, dash: { cx: 3.15, cy: 1.0, size: 1.1 },
  s1: { cx: 2.66, cy: 2.06, size: 1.0 }, s2: { cx: 1.6, cy: 2.5, size: 1.0 }, s3: { cx: 0.48, cy: 2.34, size: 1.0 },
  hp: { cx: 4.2, cy: 1.0, size: 0.9 }, mp: { cx: 3.8, cy: 1.9, size: 0.9 },
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

  // joystick on the LEFT => skill cluster on the right (and vice versa)
  const left = side === 'RIGHT';
  const defs = activeDefs(hero);
  const order = ACTIVE_ORDER[hero];
  const dDef = dashDef(hero);
  const icon = (i: number) => <PaintedIcon id={defs[i].icon} />;
  const p = world.player;
  const sk = (i: number) => ({ getCd: () => ({ t: p.cd[order[i]], max: p.cdMax[order[i]] }), mana: () => useGameStore.getState().getManaCost(order[i]) });
  const joyZone: React.CSSProperties = { position: 'absolute', top: '22%', bottom: 0, [side === 'LEFT' ? 'left' : 'right']: 0, width: '46%', zIndex: 5 } as any;
  const aimZone: React.CSSProperties = { position: 'absolute', top: '16%', bottom: '38%', [side === 'LEFT' ? 'right' : 'left']: 0, width: '36%', zIndex: 5 } as any;
  const potion = (k: 'hp' | 'mp') => (
    <div style={slotStyle(G[k], left)}>
      <TBtn code={k === 'hp' ? 'KeyZ' : 'KeyX'} label={k === 'hp' ? 'Health potion' : 'Mana potion'} size={G[k].size} accent={k === 'hp' ? '#ef5f55' : '#4f8df5'} icon={<PaintedIcon id={k === 'hp' ? 'HP' : 'MP'} />}
        getCd={() => ({ t: k === 'hp' ? p.hpPotCd : p.mpPotCd, max: POTION_COOLDOWN })} qty={k === 'hp' ? hpQty : mpQty} />
    </div>
  );

  return (
    <div className="tc-root">
      <Stick testId="joystick" label="Move" tone="#ffffff" style={joyZone}
        onMove={(x, y, a) => { const j = world.input.joy; j.active = a; j.x = a ? x : 0; j.z = a ? y : 0; }} />
      {!autoAim && !village && (
        <Stick testId="aimstick" label="Aim" tone="#ff9a7a" style={aimZone}
          onMove={(x, y, a) => { const j = world.input.aimStick; j.active = a; j.x = a ? x : 0; j.z = a ? y : 0; }} />
      )}
      {drag.on && (
        <div aria-hidden className="cap-pill" style={{ position: 'absolute', left: '50%', top: 'calc(var(--sat) + 18%)', transform: 'translateX(-50%)', zIndex: 8, pointerEvents: 'none',
          ...(drag.cancel ? { background: 'rgba(217,83,74,.9)', borderColor: 'transparent' } : null) }}>
          {drag.cancel ? 'Release to cancel' : 'Drag up here to cancel'}
        </div>
      )}
      {!village && <ComboMeter touch />}
      {/* skills are always available, also in the village; interacting is done through the floating prompts */}
      <div className={`tc-cluster ${left ? 'left' : ''}`}>
        <SkillBtn skill="ult" label="Ultimate" at={G.ult} left={left} ult accent="#f2a93b" icon={<PaintedIcon id={ULTS[hero].icon} />} onDrag={setDrag} />
        <SkillBtn skill="s1" label="Skill 1" at={G.s1} left={left} icon={icon(0)} {...sk(0)} onDrag={setDrag} />
        <SkillBtn skill="s2" label="Skill 2" at={G.s2} left={left} icon={icon(1)} {...sk(1)} onDrag={setDrag} />
        <SkillBtn skill="s3" label="Skill 3" at={G.s3} left={left} icon={icon(2)} {...sk(2)} onDrag={setDrag} />
        <SkillBtn skill="dash" label="Dash" at={G.dash} left={left} accent="#7ad0ff" icon={<PaintedIcon id={dDef.icon} />} getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} testId="tc-dash" aimable={hero !== 'BARBARIAN'} onDrag={setDrag} />
        {potion('hp')}
        {potion('mp')}
      </div>
    </div>
  );
};
