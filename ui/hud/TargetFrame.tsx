import { riruru } from '../../engine/systems/riruru';
import React, { useRef } from 'react';
import { questKill } from '../../engine/systems/npcQuestLogic';
import { ScrollText, X, Flame, Snowflake, Star, ShieldOff, Skull, ChevronsDown, Ghost } from '../components/GoldIcons';
import { world } from '../../engine/world';
import { ENEMY_DEFS } from '../../engine/enemyDefs';
import type { Enemy } from '../../engine/types';
import { clearTarget } from '../../engine/systems/target';
import { currentTarget } from '../../engine/systems/combat';
import { useRaf } from '../hooks/useRaf';
import { StatusIcon } from '../components/StatusIcon';
import { traitList } from '../../engine/enemyTraits';

const AFFIX_NAME: Record<string, string> = { HASTED: 'Hasted', VAMPIRIC: 'Vampiric', FROZEN: 'Frozen', VOLATILE: 'Volatile', SHIELDED: 'Shielded' };
const STATUSES: { id: string; icon: React.ReactNode; color: string; label: string; get: (e: Enemy) => number }[] = [
  { id: 'burn', icon: <Flame size={12} />, color: '#ff7a1a', label: 'Burning', get: (e) => e.burnT },
  { id: 'poison', icon: <Skull size={12} />, color: '#84cc16', label: 'Poisoned', get: (e) => e.poisonT },
  { id: 'freeze', icon: <Snowflake size={12} />, color: '#7ad0ff', label: 'Frozen', get: (e) => e.freezeT },
  { id: 'stun', icon: <Star size={12} />, color: '#ffd23a', label: 'Stunned', get: (e) => e.stunT },
  { id: 'armor', icon: <ShieldOff size={12} />, color: '#c084fc', label: 'Armor broken', get: (e) => e.armorBreakT },
  { id: 'slow', icon: <ChevronsDown size={12} />, color: '#60a5fa', label: 'Slowed', get: (e) => e.slowT },
  { id: 'fear', icon: <Ghost size={12} />, color: '#e0e0ff', label: 'Terrified', get: (e) => e.fearT },
];

/** Glass card for the click-locked enemy: name, hp bar + numbers, status icons. Bosses use the boss bar instead.
 *  Per-frame values go through refs (useRaf), React never re-renders. */
export const TargetFrame: React.FC<{ docked?: boolean }> = ({ docked }) => {
  const root = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const qic = useRef<HTMLSpanElement>(null);
  const qT = useRef(0);
  const sub = useRef<HTMLSpanElement>(null);
  const hp = useRef<HTMLDivElement>(null);
  const val = useRef<HTMLSpanElement>(null);
  const shield = useRef<HTMLSpanElement>(null);
  const traitsEl = useRef<HTMLDivElement>(null);
  const icons = useRef<(HTMLElement | null)[]>([]);
  const st = useRef({ shown: false, id: -1, hp: '', val: '', ic: '', sh: '' });

  useRaf(() => {
    const e = currentTarget(), s = st.current;
    const show = !!e && !e.boss && (docked ? true : !world.boss.active && world.targetAnchor.on);
    if (show && !docked && root.current) root.current.style.transform = `translate(${Math.round(world.targetAnchor.sx)}px, ${Math.round(world.targetAnchor.sy)}px) translate(-50%, -100%)`;
    if (show !== s.shown) { s.shown = show; if (root.current) root.current.style.display = show ? 'flex' : 'none'; }
    if (!show || !e) { s.id = -1; return; }
    if (++qT.current % 15 === 0 || s.id !== e.id) { if (qic.current) qic.current.style.display = questKill(e.kind, e.mini) ? 'inline-flex' : 'none'; }
    if (s.id !== e.id) {
      s.id = e.id; s.hp = ''; s.val = ''; s.ic = ''; s.sh = '';
      const def = ENEMY_DEFS[e.kind];
      const n = e.id === riruru.id ? 'Riruru' : def ? def.name : e.kind;
      if (name.current) {
        name.current.textContent = (e.elite ? 'Elite ' : e.mini ? 'Champion ' : '') + n;
        name.current.style.color = e.elite || e.mini ? '#e8d3a0' : '#ece4d4';   // (owner: calmer text colours)
      }
      if (traitsEl.current) {   // trait chips (glyph + name, tooltip = what it does): rebuilt only when the target changes
        const box = traitsEl.current; box.textContent = '';
        for (const tr of traitList(e.traits)) { const c = document.createElement('span'); c.className = 'tf-trait'; c.title = tr.desc; c.dataset.trait = tr.id; c.style.color = tr.color; c.textContent = `${tr.glyph} ${tr.name}`; box.appendChild(c); }
        box.style.display = e.traits ? 'flex' : 'none';
      }
      if (sub.current) sub.current.textContent = e.elite && e.affix !== 'NONE' ? (AFFIX_NAME[e.affix] ?? '') : '';
    }
    const f = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
    const fs = f.toFixed(3);
    if (hp.current && fs !== s.hp) { s.hp = fs; hp.current.style.width = `${f * 100}%`; }
    const v = `${Math.ceil(e.hp)} / ${Math.ceil(e.maxHp)}`;
    if (val.current && v !== s.val) { s.val = v; val.current.textContent = v; }
    let key = '';
    for (let i = 0; i < STATUSES.length; i++) key += STATUSES[i].get(e) > 0 ? '1' : '0';
    if (key !== s.ic) {
      s.ic = key;
      for (let i = 0; i < STATUSES.length; i++) { const el = icons.current[i]; if (el) el.dataset.on = key[i]; }
    }
    const sh = e.shield > 0 ? `+${Math.ceil(e.shield)}` : '';
    if (shield.current && sh !== s.sh) { s.sh = sh; shield.current.textContent = sh; }
  });

  return (
    <div ref={root} className={`pe target-frame ${docked ? 'docked' : 'bare'}`} data-testid="target-frame" style={{ display: 'none' }}>
      <div className="tf-top">
        <span ref={qic} className="tf-quest" style={{ display: 'none' }} title="Quest target"><ScrollText size={12} /></span>
        <span ref={name} className="tf-name" />
        <span ref={sub} className="tf-sub" />
        <button type="button" className="tf-x" aria-label="Clear target" data-testid="target-clear" onClick={clearTarget}><X size={14} /></button>
      </div>
      <div ref={traitsEl} className="tf-traits" data-testid="target-traits" style={{ display: 'none' }} />
      <div className="tf-bar"><div ref={hp} className="tf-hp" /></div>
      <div className="tf-bot">
        <span className="tf-icons">
          {STATUSES.map((d, i) => (
            <i key={d.id} ref={(el) => { icons.current[i] = el; }} data-on="0" className="tf-ic" title={d.label} style={{ color: d.color }}><StatusIcon type={d.id} size="100%" fallback={d.icon} /></i>
          ))}
        </span>
        <span ref={shield} className="tf-sh" />
        <span ref={val} className="tf-val" />
      </div>
    </div>
  );
};
