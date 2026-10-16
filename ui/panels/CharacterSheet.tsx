import React, { useEffect, useRef, useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { User, Swords, Clock, Skull, Shield, Heart, Plus } from 'lucide-react';
import type { PlayerStats } from '../../types';
import { activeChar } from '../../characters';
import { HERO_META } from '../lib/heroes';
import { useGameStore, calculateTotalCP } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Panel, PanelHead, StatLine } from '../components/Frame';
import { HERO_ICON } from '../hud/TopBars';
import { HERO_COLOR, timeMMSS } from '../lib/game';
import { activeSets, SET_COLOR_DARK } from '../../itemSets';
import { ATTR_INFO, ATTR_KEYS, ATTR_RESET_GOLD, attrPointsTotal, attrSpent, ATTR_STATS, attrPreview, type AttrKey, type Attrs } from '../../attributes';
import { GOLD_SCALE } from '../../constants';
import { useUiStore } from '../uiStore';

export const CharacterSheet: React.FC = () => {
  const { hero, level, stats, close, shiftRight, equipment } = useGameStore(useShallow((s) => ({
    hero: s.hero, level: s.level, stats: s.stats, equipment: s.equipment, close: s.toggleCharacterSheet, shiftRight: s.isShopOpen,
  })));
  const Icon = HERO_ICON[hero];
  const [tab, setTab] = useState<'ATTR' | 'STATS'>('ATTR');
  const ad = useAttrDraft();
  const [alloc, setAlloc] = useState(false);
  const present = useIsPresent();   // hide the allocation window while the sheet slides out
  const free = useGameStore((s) => attrPointsTotal(s.classProg[s.hero]?.lv ?? 1) - attrSpent(s.attrs[s.hero]));
  const kills = useRef<HTMLSpanElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const dmg = useRef<HTMLSpanElement>(null);
  const hp = useRef<HTMLSpanElement>(null);
  const mp = useRef<HTMLSpanElement>(null);
  const cache = useRef<string[]>([]);
  const w = (i: number, el: HTMLElement | null, v: string) => { if (el && cache.current[i] !== v) { cache.current[i] = v; el.textContent = v; } };
  useRaf(() => {
    w(0, kills.current, world.run.kills.toLocaleString());
    w(1, time.current, timeMMSS(world.run.time));
    w(2, dmg.current, Math.round(world.run.damageDealt).toLocaleString());
    w(3, hp.current, `${Math.ceil(world.player.hp)} / ${Math.round(stats.maxHealth)}`);
    w(4, mp.current, `${Math.ceil(world.player.mana)} / ${Math.round(stats.maxMana)}`);
  });
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const rows: [string, React.ReactNode][] = [
    ['Damage', Math.floor(stats.damage)], ['Health', <span ref={hp} key="hp" />], ['Defense', stats.defense.toFixed(1)], ['Mana', <span ref={mp} key="mp" />],
    ['Move speed', stats.moveSpeed.toFixed(1)], ['HP regen', `${stats.regen.toFixed(1)}/s`], ['Mana regen', `${stats.manaRegen.toFixed(1)}/s`],
    ['Crit rate', pct(stats.critRate)], ['Crit damage', pct(stats.critDamage)], ['Attack speed', stats.fireRate.toFixed(2)],
    ['Cooldown red.', `-${pct(stats.cooldownReduction)}`], ['Skill damage', pct(stats.skillDamage)], ['Multishot', stats.multishot.toFixed(1)],
    ['Magnet range', stats.magnetRadius.toFixed(1)], ['Dodge', pct(stats.dodge)], ['Knockback', stats.knockback.toFixed(1)],
  ];
  const extra: [string, string][] = ([
    ['Life steal', stats.lifeSteal, pct], ['Thorns', stats.thorns, (v: number) => v.toFixed(0)], ['Gold find', stats.goldFind, pct], ['XP gain', stats.xpBonus, pct],
    ['Extra pierce', stats.pierceBonus, (v: number) => `+${v}`], ['Burn on hit', stats.onHitBurnChance, pct], ['Slow on hit', stats.onHitSlowChance, pct],
    ['Damage reduction', stats.dmgReduce, pct], ['Echo shot', stats.echoEvery, (v: number) => `every ${v}`], ['Extra dashes', stats.dashCharges, (v: number) => `+${v}`],
  ] as [string, number, (v: number) => string][]).filter(([, v]) => v > 0).map(([l, v, f]) => [l, f(v)]);
  const sets = activeSets(equipment);
  return (
    <motion.div initial={{ x: '105%' }} animate={{ x: 0 }} exit={{ x: '105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex side-panel char-side" style={{ right: shiftRight ? '32.5rem' : '.7rem', top: '.7rem', bottom: '.7rem', width: '24rem', zIndex: shiftRight ? 39 : 40 }}>
      <Panel className="flex flex-col w-full min-h-0">
        <PanelHead icon={<User size={22} />} title="Character" sub={`${hero} · Level ${level}`} onClose={close} />
        <div className="cs2-tabs">
          {(['ATTR', 'STATS'] as const).map((t) => <button key={t} className={`cs2-tab pe ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); if (t === 'STATS') setAlloc(false); }} data-testid={`char-tab-${t}`}>{t === 'ATTR' ? 'Attributes' : 'Stats'}{t === 'ATTR' && free > 0 && <i className="red-dot" />}</button>)}
        </div>
        {tab === 'ATTR' && <AttrTree d={ad} allocOpen={alloc} onAlloc={() => setAlloc((v) => !v)} onDetails={() => { setAlloc(false); setTab('STATS'); }} />}
        <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-3" style={tab === 'ATTR' ? { display: 'none' } : undefined}>
          <div className="flex items-center gap-3">
            <div className="rpg-medallion cs-avatar" style={{ width: '4.6rem', height: '4.6rem', ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={32} /></div>
            <div className="flex-1 cs-cp"><span>Combat power</span><b>{calculateTotalCP(stats).toLocaleString()}</b></div>
          </div>
          <div className="rpg-frame px-3 py-1 cs-stat-rows">
            {rows.map(([l, v]) => <StatLine key={l} label={l} value={v} />)}
            {extra.map(([l, v]) => <StatLine key={l} label={l} value={v} tone="pos" />)}
          </div>
          <div data-testid="set-bonuses">
            <div className="rpg-label mb-1.5">Set bonuses</div>
            {sets.length === 0 && <div className="rpg-frame px-3 py-2 text-[.72rem] text-[var(--text-dim)]">No set pieces equipped. Elites, bosses and chests drop set gear.</div>}
            {sets.map(({ def, count }) => (
              <div key={def.id} className="rpg-frame px-3 py-2 mb-1.5">
                <div className="flex justify-between"><span className="font-bold text-[.8rem]" style={{ color: SET_COLOR_DARK, fontFamily: 'var(--font-title)' }}>{def.name}</span><span className="rpg-num text-[.75rem]">{count}/6</span></div>
                {def.bonuses.map((b) => (
                  <div key={b.pieces} className="text-[.68rem] leading-snug" style={{ color: count >= b.pieces ? SET_COLOR_DARK : 'var(--text-dim)', opacity: count >= b.pieces ? 1 : 0.65 }}>({b.pieces}) {b.text}</div>
                ))}
              </div>
            ))}
          </div>
          <div>
            <div className="rpg-label mb-1.5">This run</div>
            <div className="grid grid-cols-3 gap-2">
              {([[<Skull size={13} key="k" />, 'Kills', kills], [<Clock size={13} key="t" />, 'Time', time], [<Swords size={13} key="d" />, 'Damage', dmg]] as const).map(([ic, l, r]) => (
                <div key={l} className="rpg-frame text-center py-2">
                  <div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1">{ic}{l}</div>
                  <span ref={r} className="rpg-num text-base text-[var(--gold-light)]">0</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      {tab === 'ATTR' && alloc && present && (
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="ax-pop pe">
          <Panel className="flex flex-col h-full min-h-0">
            <PanelHead icon={<Plus size={20} />} title="Allocate" onClose={() => setAlloc(false)} />
            <AttrAlloc d={ad} />
          </Panel>
        </motion.div>
      )}
    </motion.div>
  );
};

// ---------------------------------------------------------------- attributes --
// Reference: MMO "character info + stat allocation" pair. Left: class crest, name, level, three headline stats and a golden
// tree whose stems light up with invested points (unspent points sit in the root). Right: one row per attribute with
// - [staged] + steppers (hold to repeat), and a preview of the stats that change (green +x ▲). Staged points apply on Apply.
const NODE: Record<AttrKey, [number, number]> = { STR: [13, 64], INT: [31, 42], DEX: [50, 20], VIT: [69, 42], LUK: [87, 64] };
const TREE_ORDER: AttrKey[] = ['STR', 'INT', 'DEX', 'VIT', 'LUK'];
const ROOT: [number, number] = [50, 90];
const stem = (k: AttrKey) => { const [x, y] = NODE[k]; return x === 50 ? `M50,${ROOT[1]} L50,${y + 7}` : `M50,${ROOT[1] - 2} C50,${ROOT[1] - 14} ${x},${ROOT[1] - 4} ${x},${y + 7}`; };
const TWIGS = ['M50,60 C44,52 40,48 36,30', 'M50,60 C56,52 60,48 64,30', 'M50,48 C46,38 42,32 40,14', 'M50,48 C54,38 58,32 60,14', 'M31,50 C24,40 22,34 20,26', 'M69,50 C76,40 78,34 80,26'];
const STAT_ROW: Partial<Record<keyof PlayerStats, [string, (v: number) => string]>> = {
  damage: ['Damage', (v) => Math.floor(v).toLocaleString()], knockback: ['Knockback', (v) => v.toFixed(2)],
  fireRate: ['Attack speed', (v) => v.toFixed(2)], attackRange: ['Attack range', (v) => `+${v.toFixed(2)}`], critRate: ['Crit rate', (v) => `${(v * 100).toFixed(1)}%`], dodge: ['Dodge', (v) => `${(v * 100).toFixed(1)}%`],
  skillDamage: ['Skill damage', (v) => `${(v * 100).toFixed(1)}%`], maxMana: ['Max mana', (v) => Math.round(v).toString()], cooldownReduction: ['Cooldown red.', (v) => `${(v * 100).toFixed(1)}%`],
  maxHealth: ['Max HP', (v) => Math.round(v).toLocaleString()], defense: ['Defense', (v) => v.toFixed(1)], regen: ['HP regen', (v) => `${v.toFixed(2)}/s`],
  critDamage: ['Crit damage', (v) => `${(v * 100).toFixed(1)}%`], goldFind: ['Gold find', (v) => `${(v * 100).toFixed(1)}%`], xpBonus: ['XP gain', (v) => `${(v * 100).toFixed(1)}%`],
};
const fmtDelta = (k: keyof PlayerStats, d: number) => { const f = STAT_ROW[k]![1]; const t = f(Math.abs(d)); return t.endsWith('/s') ? t.slice(0, -2) : t; };

/** Press-and-hold repeat for the steppers (one step on press, then a fast repeat after a short delay). */
const useHold = () => {
  const t = useRef<number[]>([]);
  const stop = () => { t.current.forEach((h) => { clearTimeout(h); clearInterval(h); }); t.current = []; };
  useEffect(() => stop, []);
  return (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; stop(); fn(); t.current.push(window.setTimeout(() => t.current.push(window.setInterval(fn, 70)), 380)); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
  });
};

/** Staged attribute points, shared by the character panel (tree) and the allocation window opened beside it. */
const useAttrDraft = () => {
  const { hero, lv, saved, gold, stats, setAttrs, resetAttrs } = useGameStore(useShallow((s) => ({
    hero: s.hero, lv: s.classProg[s.hero]?.lv ?? 1, saved: s.attrs[s.hero], gold: s.gold, stats: s.stats, setAttrs: s.setAttrs, resetAttrs: s.resetAttrs,
  })));
  const [draft, setDraft] = useState<Attrs>(saved);
  const [sel, setSel] = useState<AttrKey>('STR');
  useEffect(() => setDraft(saved), [saved]);
  const total = attrPointsTotal(lv), left = total - attrSpent(draft);
  const dirty = ATTR_KEYS.some((k) => draft[k] !== saved[k]);
  const add = (k: AttrKey, n: number) => { setSel(k); setDraft((d) => ({ ...d, [k]: Math.max(saved[k], Math.min(d[k] + n, d[k] + (total - attrSpent(d)))) })); };
  const prev = attrPreview(stats, saved, draft);
  return { hero, lv, saved, gold, stats, draft, setDraft, sel, setSel, left, dirty, add, prev, apply: () => setAttrs(draft), resetAttrs };
};
type AttrDraft = ReturnType<typeof useAttrDraft>;

const AttrTree: React.FC<{ d: AttrDraft; onDetails: () => void; onAlloc: () => void; allocOpen: boolean }> = ({ d, onDetails, onAlloc, allocOpen }) => {
  const { hero, lv, saved, gold, draft, sel, setSel, left, prev, resetAttrs } = d;
  const Icon = HERO_ICON[hero];
  const cost = ATTR_RESET_GOLD * GOLD_SCALE;
  const name = activeChar()?.name ?? HERO_META[hero].title;
  return (
    <div className="ax flex-1 min-h-0 rpg-scroll" data-testid="attr-tree">
      <section className="ax-left">
        <div className="ax-crest" style={{ ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={30} /></div>
        <div className="ax-name">{name}</div>
        <div className="ax-lv">Lv. {lv}</div>
        <div className="ax-sum">
          <div><Swords size={14} /><span>Attack</span><b>{Math.floor(prev.damage).toLocaleString()}</b></div>
          <div><Shield size={14} /><span>Defense</span><b>{prev.defense.toFixed(0)}</b></div>
          <div><Heart size={14} /><span>Health</span><b>{Math.round(prev.maxHealth).toLocaleString()}</b></div>
        </div>
        <div className="ax-tree">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ax-svg" aria-hidden>
            <path d="M4,96 Q50,72 96,96" className="arc" />
            {TWIGS.map((p) => <path key={p} d={p} className="twig" />)}
            {TREE_ORDER.map((k) => <path key={k} d={stem(k)} className={`stem ${draft[k] > 0 ? 'lit' : ''} ${draft[k] !== saved[k] ? 'new' : ''}`} />)}
          </svg>
          {TREE_ORDER.map((k) => (
            <button key={k} className={`ax-node pe ${allocOpen && sel === k ? 'sel' : ''} ${draft[k] > 0 ? 'on' : ''} ${draft[k] !== saved[k] ? 'new' : ''}`}
              style={{ left: `${NODE[k][0]}%`, top: `${NODE[k][1]}%` }} onClick={() => { setSel(k); onAlloc(); }} data-testid={`attr-${k}`} title={`${ATTR_INFO[k].name}: ${ATTR_INFO[k].per}`}>
              <em>{k}</em><b>{draft[k]}</b>
            </button>
          ))}
          <div className={`ax-root ${left > 0 ? 'has' : ''}`} style={{ left: `${ROOT[0]}%`, top: `${ROOT[1]}%` }}><b>{left}</b></div>
        </div>
        <button className={`ax-held pe ${left > 0 ? 'has' : ''} ${allocOpen ? 'on' : ''}`} onClick={onAlloc} data-testid="attr-open">
          <span>Points</span><b>{left}</b><i>+</i>
        </button>
        <div className="ax-foot">
          <button className="ax-btn pe" disabled={attrSpent(saved) === 0} title={`Refund every point for ${cost.toLocaleString()} gold`}
            onClick={() => useUiStore.getState().askConfirm({ title: 'Reset attributes?', body: `Refund all ${attrSpent(saved)} points for ${cost.toLocaleString()} gold.`, confirmLabel: 'Reset', tone: 'danger', onConfirm: () => { resetAttrs(); } })}
            style={gold < cost ? { opacity: 0.6 } : undefined}>Reset</button>
          <button className="ax-btn pe" onClick={onDetails}>Details</button>
        </div>
      </section>
    </div>
  );
};

/** The allocation window (opens to the left of the character panel): - [staged] + per attribute (hold to repeat), stat preview, Apply. */
const AttrAlloc: React.FC<{ d: AttrDraft }> = ({ d }) => {
  const { saved, draft, setDraft, sel, setSel, left, dirty, add, prev, stats, apply } = d;
  const hold = useHold();
  const changed = ATTR_KEYS.filter((k) => draft[k] !== saved[k]);
  const keys = [...new Set((changed.length ? changed : [sel]).flatMap((k) => ATTR_STATS[k]))];
  return (
    <div className="ax-right flex-1 min-h-0 rpg-scroll" data-testid="attr-alloc">
      <div className="ax-banner">Available points <b className={left > 0 ? 'has' : ''} data-testid="attr-left">{left}</b></div>
      <div className="ax-rows">
        {ATTR_KEYS.map((k) => {
          const st = draft[k] - saved[k];
          return (
            <div key={k} className={`ax-row ${sel === k ? 'sel' : ''}`} onClick={() => setSel(k)} data-testid={`attr-row-${k}`}>
              <span className="ax-k" style={{ color: ATTR_INFO[k].color }}>{k}</span>
              <span className="ax-v">{saved[k]}</span>
              <button className="ax-step pe" disabled={st <= 0} {...hold(() => add(k, -1))} aria-label={`Remove a point from ${k}`}>−</button>
              <span className={`ax-staged ${st > 0 ? 'on' : ''}`}>{st}</span>
              <button className="ax-step pe" disabled={left <= 0} {...hold(() => add(k, 1))} data-testid={`attr-plus-${k}`} aria-label={`Add a point to ${k}`}>+</button>
            </div>
          );
        })}
      </div>
      <div className="ax-info">
        <div className="ax-ih"><b style={{ color: ATTR_INFO[sel].color }}>{ATTR_INFO[sel].name}</b><span>{ATTR_INFO[sel].desc}</span></div>
        <div className="ax-per">Per point: {ATTR_INFO[sel].per}</div>
      </div>
      <div className="ax-prev" data-testid="attr-preview">
        {keys.map((k) => { const row = STAT_ROW[k]; if (!row) return null; const dv = (prev[k] as number) - (stats[k] as number);
          return <div key={k}><span>{row[0]}</span><b>{row[1](prev[k] as number)}</b>{Math.abs(dv) > 1e-6 && !/^0(\.0+)?%?$/.test(fmtDelta(k, dv)) ? <i className={dv > 0 ? 'up' : 'dn'}>({dv > 0 ? '' : '-'}{fmtDelta(k, dv)} {dv > 0 ? '▲' : '▼'})</i> : <i />}</div>; })}
      </div>
      <div className="ax-apply">
        <button className="ax-btn pe" disabled={!dirty} onClick={() => setDraft(saved)}>Undo</button>
        <button className="ax-btn gold pe" disabled={!dirty} onClick={apply} data-testid="attr-apply">Apply</button>
      </div>
    </div>
  );
};
const ATTR_PER = '+2';
