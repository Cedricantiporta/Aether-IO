// Full-screen class selection (Korean MMO style): class list on the left, the 3D hero centred in the scene
// (CameraRig frames it while `charSelect` is on), emblem + role + profile bars + Confirm on the right.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import type { HeroClass } from '../../types';
import type { Difficulty } from '../../storeTypes';
import { HERO_META, HERO_ORDER } from '../lib/heroes';
import { HeroPreview } from '../components/HeroPreview';
import { characters, activeChar, charLevel, createChar, deleteChar, setActiveChar, enterWithReload, MAX_CHARS, TINTS, type CharEntry } from '../../characters';
import { HERO_ICON } from '../hud/TopBars';

const ROLE: Record<HeroClass, string> = { ARCHER: 'Ranged  |  Damage', WIZARD: 'Ranged  |  Magic', BARBARIAN: 'Melee  |  Defense', KNIGHT: 'Melee  |  Tank', NECROMANCER: 'Ranged  |  Summoner' };
const BLURB: Record<HeroClass, string> = {
  ARCHER: 'A swift marksman who looses arrows on the run and never stops moving.',
  WIZARD: 'A master of the arcane who bends fire, ice and gravity to clear the field.',
  BARBARIAN: 'An unbreakable warrior who wades into the horde and laughs at pain.',
  KNIGHT: 'A sworn guardian in plate who cuts wide arcs of steel and calls down holy light.',
  NECROMANCER: 'A grave-robbing scholar who raises skeletons, curses the ground and drains souls.',
};
const COMPLEXITY: Record<HeroClass, number> = { ARCHER: 2, WIZARD: 3, BARBARIAN: 1, KNIGHT: 2, NECROMANCER: 3 };
const PROFILE: Record<HeroClass, [string, number][]> = {
  ARCHER: [['Attack', 4], ['Defense', 1], ['Range', 5], ['Mobility', 5], ['Control', 2]],
  WIZARD: [['Attack', 5], ['Defense', 1], ['Range', 4], ['Mobility', 2], ['Control', 5]],
  BARBARIAN: [['Attack', 4], ['Defense', 5], ['Range', 1], ['Mobility', 3], ['Control', 3]],
  KNIGHT: [['Attack', 3], ['Defense', 5], ['Range', 2], ['Mobility', 3], ['Control', 4]],
  NECROMANCER: [['Attack', 4], ['Defense', 2], ['Range', 4], ['Mobility', 2], ['Control', 4]],
};

/** Gold ring emblem with the class glyph. */
export const ClassEmblem: React.FC<{ hero: HeroClass; size: string; lit?: boolean }> = ({ hero, size, lit }) => {
  const Icon = HERO_ICON[hero];
  return (
    <div className={`cs-emblem ${lit ? 'lit' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs><linearGradient id={`cse-${hero}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#c9a052" /><stop offset="1" stopColor="#7d5c26" /></linearGradient></defs>
        <circle cx="50" cy="50" r="46" fill="rgba(10,10,12,.55)" stroke={`url(#cse-${hero})`} strokeWidth="2.5" />
        <circle cx="50" cy="50" r="39" fill="none" stroke={`url(#cse-${hero})`} strokeWidth="1" strokeDasharray="2 3" />
        {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <path key={i} d={`M${50 + Math.cos(a) * 42} ${50 + Math.sin(a) * 42} L${50 + Math.cos(a) * 47} ${50 + Math.sin(a) * 47}`} stroke="#e9cf8a" strokeWidth={i % 3 ? 1 : 2.2} />; })}
      </svg>
      <Icon className="cs-emblem-ico" strokeWidth={1.6} />
    </div>
  );
};

/** Character select (MMO style): your saved characters on the left (name, class, level), Play / Create / Delete.
 *  Create: pick a class (left list), a name and an outfit tint, then Create (the new character's save loads at once).
 *  A character's class is fixed; there is no class switching in town any more. */
/** Pentagon radar of the class profile (Attack / Defense / Range / Mobility / Control, 0..5). */
const Radar: React.FC<{ stats: [string, number][] }> = ({ stats }) => {
  const n = stats.length, R = 46, cx = 90, cy = 80;
  const pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ring = (k: number) => stats.map((_, i) => pt(i, R * k).join(',')).join(' ');
  return (
    <svg className="cs-radar" viewBox="0 0 180 160" aria-hidden>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={ring(k)} fill="none" stroke="rgba(201,160,82,.28)" strokeWidth=".7" />)}
      {stats.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(201,160,82,.22)" strokeWidth=".6" />; })}
      <polygon points={stats.map(([, v], i) => pt(i, R * (v / 5)).join(',')).join(' ')} fill="rgba(241,213,142,.28)" stroke="#f1d58e" strokeWidth="1.2" />
      {stats.map(([l, v], i) => { const [x, y] = pt(i, R + 15); return (
        <g key={l}><text x={x} y={y - 2} textAnchor="middle" className="cs-radar-v">{v * 20}</text><text x={x} y={y + 7} textAnchor="middle" className="cs-radar-l">{l.toUpperCase()}</text></g>
      ); })}
    </svg>
  );
};

/** Name entry popup (owner reference: ornate dark panel, framed input, rules, grey Cancel / red Confirm). */
const NAME_RE = /^[A-Za-z0-9]{2,12}$/;
const NamePopup: React.FC<{ onCancel: () => void; onConfirm: (name: string) => void }> = ({ onCancel, onConfirm }) => {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const ok = () => {
    const t = v.trim();
    if (!NAME_RE.test(t)) { setErr(t.length < 2 || t.length > 12 ? 'Names need 2 to 12 characters.' : 'Only letters and numbers, no spaces or symbols.'); return; }
    onConfirm(t);
  };
  return (
    <motion.div className="np-back pe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div className="np-panel" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create name">
        <i className="np-corner tl" /><i className="np-corner tr" /><i className="np-corner bl" /><i className="np-corner br" />
        <div className="np-head">
          <span>Name Your Hero</span>
          <button className="np-x" onClick={onCancel} aria-label="Close"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8M16 8l-8 8" /></svg></button>
        </div>
        <div className="np-orn"><svg viewBox="0 0 120 40" aria-hidden><g className="np-rays">{Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.15 + 0.7 * i / 10); return <line key={i} x1={60} y1={4} x2={60 + Math.cos(a) * 46} y2={4 + Math.sin(a) * 34} />; })}</g><path d="M50 4 L60 16 L70 4" /><path d="M54 4 L60 11 L66 4" /><rect x="57" y="-3" width="6" height="6" transform="rotate(45 60 0)" /></svg></div>
        <div className="np-field">
          <input autoFocus className="np-input" placeholder="Enter a name" maxLength={12} value={v} data-testid="cs-name-input"
            onChange={(e) => { setV(e.target.value); setErr(''); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') onCancel(); }} />
        </div>
        <div className={`np-rules ${err ? 'err' : ''}`}>{err || <>Names can use letters and numbers, 2 to 12 characters.<br />Spaces and special characters are not allowed.</>}</div>
        <div className="np-foot">
          <button className="np-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="np-btn confirm" onClick={ok} data-testid="cs-name-confirm">Confirm</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const CharacterSelect: React.FC = () => {
  const setCharSelect = useUiStore((s) => s.setCharSelect);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [chars, setChars] = useState<CharEntry[]>(() => characters());
  const active = activeChar();
  const [sel, setSel] = useState<string>(active?.id ?? chars[0]?.id ?? '');
  const [mode, setMode] = useState<'list' | 'create'>(chars.length ? 'list' : 'create');
  const [cHero, setCHero] = useState<HeroClass>('ARCHER');
  const [naming, setNaming] = useState(false);
  const [cTint, setCTint] = useState(TINTS[0].id);
  const picked = chars.find((c) => c.id === sel) ?? null;
  const hero: HeroClass = mode === 'create' ? cHero : picked?.hero ?? 'ARCHER';
  const play = () => {
    if (!picked) return;
    if (picked.id === active?.id) { setCharSelect(false); return; }   // already loaded
    setActiveChar(picked.id); enterWithReload();
  };
  const create = (name: string) => {
    const c = createChar(name, cHero, cTint);
    if (c) enterWithReload();
  };
  const del = () => {
    if (!picked) return;
    askConfirm({ title: `Delete ${picked.name}?`, body: 'This character and everything they own will be gone for good.', confirmLabel: 'Delete', onConfirm: () => {
      const wasActive = picked.id === active?.id;
      deleteChar(picked.id);
      const left = characters();
      setChars(left); setSel(left[0]?.id ?? '');
      if (!left.length) setMode('create');
      else if (wasActive) { setActiveChar(left[0].id); enterWithReload(); }
    } });
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (naming) return;
      if (e.key === 'Enter') { if (mode === 'list') play(); else setNaming(true); }
      const list = mode === 'list' ? chars.map((c) => c.id) : HERO_ORDER;
      const cur = mode === 'list' ? sel : cHero;
      const i = list.indexOf(cur as never);
      const nx = e.key === 'ArrowDown' || e.key === 's' ? 1 : e.key === 'ArrowUp' || e.key === 'w' ? -1 : 0;
      if (nx && list.length) { const v = list[(i + nx + list.length) % list.length]; if (mode === 'list') setSel(v as string); else setCHero(v as HeroClass); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const meta = HERO_META[hero];
  return (
    <div className="absolute inset-0 pe cs-root" style={{ zIndex: 55 }} data-testid="char-select">
      <div className="cs-vig" />
      <HeroPreview hero={hero} tint={mode === 'create' ? cTint : picked?.tint ?? '#ffffff'} />
      <div className="cs-head">{mode === 'list' ? 'Choose your character' : 'Create a character'}</div>

      {mode === 'list' ? (
        <div className="cs-list" data-testid="cs-chars">
          {chars.map((c, i) => (
            <motion.button key={c.id} className={`cs-item cs-char ${sel === c.id ? 'on' : ''}`} onClick={() => setSel(c.id)} onDoubleClick={play} data-testid={`cs-char-${i}`}
              initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <ClassEmblem hero={c.hero} size="4.2rem" lit={sel === c.id} />
              <span className="cs-charname"><b style={{ color: c.tint === '#ffffff' ? undefined : c.tint }}>{c.name}</b><em>Lv {charLevel(c)} {HERO_META[c.hero].title}{c.id === active?.id ? ' · last played' : ''}</em></span>
            </motion.button>
          ))}
          {chars.length < MAX_CHARS && <button className="cs-item cs-new" onClick={() => setMode('create')} data-testid="cs-new"><span className="cs-plus">+</span><span>New character</span></button>}
        </div>
      ) : (
        <div className="cs-dias">
          {HERO_ORDER.map((h, i) => {
            const Icon = HERO_ICON[h];
            return (
              <motion.button key={h} className={`cs-dia ${cHero === h ? 'on' : ''}`} onClick={() => setCHero(h)} data-testid={`cs-${h}`} title={HERO_META[h].title}
                style={{ marginLeft: i % 2 ? '4.6rem' : 0 }} initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.07 }}>
                <span className="cs-dia-frame" /><Icon className="cs-dia-ico" strokeWidth={1.5} />
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={mode + hero + (picked?.id ?? '')} className="cs-info" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
          <div className="cs-name">{mode === 'list' && picked ? picked.name : meta.title}</div>
          <div className="cs-tag">{mode === 'list' && picked ? `${meta.title} · Lv ${charLevel(picked)}` : `The ${meta.tagline}`}</div>
          <div className="cs-orn" />
          <div className="cs-tags">{meta.tags.map((t, k) => <span key={t} data-k={k}>{t}</span>)}</div>
          <div className="cs-blurb">{BLURB[hero]}</div>
          <div className="cs-sep" />
          <Radar stats={PROFILE[hero]} />
          {mode === 'create' && (<>
            <div className="cs-row"><span>Complexity</span><span className="cs-stars">{[1, 2, 3].map((n) => <i key={n} className={n <= COMPLEXITY[hero] ? 'on' : ''} />)}</span></div>
            <div className="cs-weapon">Weapon: <b>{meta.weapon}</b></div>
            <button className="cs-confirm" onClick={() => setNaming(true)} data-testid="cs-create">Create</button>
            {chars.length > 0 && <button className="cs-sub" onClick={() => setMode('list')}>Back to characters</button>}
          </>)}
          {mode === 'list' && (<>
            <div className="cs-sep" />
            <div className="cs-weapon">Weapon: <b>{meta.weapon}</b></div>
            <button className="cs-confirm" onClick={play} disabled={!picked} data-testid="cs-confirm">Play</button>
            {picked && <button className="cs-sub danger" onClick={del} data-testid="cs-delete">Delete character</button>}
          </>)}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>{naming && <NamePopup onCancel={() => setNaming(false)} onConfirm={create} />}</AnimatePresence>
    </div>
  );
};
