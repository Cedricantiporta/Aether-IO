import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Swords, Clock, Skull } from 'lucide-react';
import { useGameStore, calculateTotalCP } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Panel, PanelHead, StatLine } from '../components/Frame';
import { HERO_ICON } from '../hud/TopBars';
import { HERO_COLOR, timeMMSS } from '../lib/game';
import { activeSets, SET_COLOR_DARK } from '../../itemSets';
import { ATTR_INFO, ATTR_KEYS, ATTR_RESET_GOLD, attrPointsTotal, attrSpent, type AttrKey, type Attrs } from '../../attributes';
import { GOLD_SCALE } from '../../constants';
import { useUiStore } from '../uiStore';

export const CharacterSheet: React.FC = () => {
  const { hero, level, stats, close, shiftRight, equipment } = useGameStore(useShallow((s) => ({
    hero: s.hero, level: s.level, stats: s.stats, equipment: s.equipment, close: s.toggleCharacterSheet, shiftRight: s.isShopOpen,
  })));
  const Icon = HERO_ICON[hero];
  const [tab, setTab] = useState<'ATTR' | 'STATS'>('ATTR');
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
      className="absolute pe flex side-panel" style={{ right: shiftRight ? '32.5rem' : '.7rem', top: '.7rem', bottom: '.7rem', width: '24rem', zIndex: shiftRight ? 39 : 40 }}>
      <Panel className="flex flex-col w-full min-h-0">
        <PanelHead icon={<User size={22} />} title="Character" sub={`${hero} · Level ${level}`} onClose={close} />
        <div className="cs2-tabs">
          {(['ATTR', 'STATS'] as const).map((t) => <button key={t} className={`cs2-tab pe ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)} data-testid={`char-tab-${t}`}>{t === 'ATTR' ? 'Attributes' : 'Stats'}{t === 'ATTR' && free > 0 && <i className="red-dot" />}</button>)}
        </div>
        {tab === 'ATTR' && <AttrTree />}
        <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-3" style={tab === 'ATTR' ? { display: 'none' } : undefined}>
          <div className="flex items-center gap-3">
            <div className="rpg-medallion" style={{ width: '4.6rem', height: '4.6rem', ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={32} /></div>
            <div className="flex-1 rpg-parchment px-3 py-2 text-center">
              <div className="rpg-label !text-[.6rem]" style={{ color: 'var(--ink-soft)' }}>Combat power</div>
              <div className="rpg-num text-3xl" style={{ color: '#8a4a00', textShadow: '0 1px 0 rgba(255,255,255,.5)' }}>{calculateTotalCP(stats).toLocaleString()}</div>
            </div>
          </div>
          <div className="rpg-frame px-3 py-1">
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
    </motion.div>
  );
};

// ---------------------------------------------------------------- attributes --
// Hex-node tree (reference: MMO attribute screen): the class emblem in the centre, five attribute nodes around it joined
// by lines that light up with invested points. Points are staged locally, then applied (or reset for gold).
const NODE_POS: Record<AttrKey, [number, number]> = { STR: [50, 9], DEX: [89, 37], INT: [74, 84], VIT: [26, 84], LUK: [11, 37] };

const AttrTree: React.FC = () => {
  const { hero, lv, saved, gold, setAttrs, resetAttrs } = useGameStore(useShallow((s) => ({
    hero: s.hero, lv: s.classProg[s.hero]?.lv ?? 1, saved: s.attrs[s.hero], gold: s.gold, setAttrs: s.setAttrs, resetAttrs: s.resetAttrs,
  })));
  const [draft, setDraft] = useState<Attrs>(saved);
  const [sel, setSel] = useState<AttrKey>('STR');
  useEffect(() => setDraft(saved), [saved]);
  const total = attrPointsTotal(lv), used = attrSpent(draft), left = total - used;
  const dirty = ATTR_KEYS.some((k) => draft[k] !== saved[k]);
  const add = (k: AttrKey, n: number) => setDraft((d) => ({ ...d, [k]: Math.max(saved[k], Math.min(d[k] + n, d[k] + (total - attrSpent(d)))) }));
  const Icon = HERO_ICON[hero];
  const info = ATTR_INFO[sel], cost = ATTR_RESET_GOLD * GOLD_SCALE;
  return (
    <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-3" data-testid="attr-tree">
      <div className="at-points"><span>Points available</span><b className={left > 0 ? 'has' : ''}>{left}</b><em>{ATTR_PER} per level</em></div>
      <div className="at-tree">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="at-lines" aria-hidden>
          {ATTR_KEYS.map((k) => <line key={k} x1="50" y1="50" x2={NODE_POS[k][0]} y2={NODE_POS[k][1]} className={draft[k] > 0 ? 'lit' : ''} style={{ ['--c' as any]: ATTR_INFO[k].color }} />)}
          {ATTR_KEYS.map((k, i) => { const n = ATTR_KEYS[(i + 1) % 5]; return <line key={k + n} x1={NODE_POS[k][0]} y1={NODE_POS[k][1]} x2={NODE_POS[n][0]} y2={NODE_POS[n][1]} className="ring" />; })}
        </svg>
        <div className="at-core" style={{ ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={30} /></div>
        {ATTR_KEYS.map((k) => (
          <button key={k} className={`at-node pe ${sel === k ? 'sel' : ''} ${draft[k] > 0 ? 'on' : ''}`} style={{ left: `${NODE_POS[k][0]}%`, top: `${NODE_POS[k][1]}%`, ['--c' as any]: ATTR_INFO[k].color }}
            onClick={() => setSel(k)} data-testid={`attr-${k}`}>
            <span className="hx"><b>{draft[k]}</b></span><em>{k}</em>
          </button>
        ))}
      </div>
      <div className="at-detail" style={{ ['--c' as any]: info.color }}>
        <div className="at-dh"><b>{info.name}</b><span>{draft[sel]}{draft[sel] !== saved[sel] && <i> (+{draft[sel] - saved[sel]})</i>}</span></div>
        <div className="at-desc">{info.desc}</div>
        <div className="at-per">Per point: {info.per}</div>
        <div className="at-btns">
          <button className="rpg-btn rpg-btn-sm pe" disabled={draft[sel] <= saved[sel]} onClick={() => add(sel, -1)}>-</button>
          <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" disabled={left <= 0} onClick={() => add(sel, 1)} data-testid="attr-plus">+1</button>
          <button className="rpg-btn rpg-btn-sm pe" disabled={left <= 0} onClick={() => add(sel, 5)}>+5</button>
          <button className="rpg-btn rpg-btn-sm pe" disabled={left <= 0} onClick={() => add(sel, left)}>Max</button>
        </div>
      </div>
      <div className="at-foot">
        <button className="rpg-btn rpg-btn-sm pe" disabled={!dirty} onClick={() => setDraft(saved)}>Undo</button>
        <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe flex-1" disabled={!dirty} onClick={() => setAttrs(draft)} data-testid="attr-apply">Apply</button>
        <button className="rpg-btn rpg-btn-sm pe" disabled={attrSpent(saved) === 0} title={`Refund every point for ${cost.toLocaleString()} gold`}
          onClick={() => useUiStore.getState().askConfirm({ title: 'Reset attributes?', body: `Refund all ${attrSpent(saved)} points for ${cost.toLocaleString()} gold.`, confirmLabel: 'Reset', tone: 'danger', onConfirm: () => { resetAttrs(); } })}
          style={gold < cost ? { opacity: 0.6 } : undefined}>Reset</button>
      </div>
    </div>
  );
};
const ATTR_PER = '+2';
