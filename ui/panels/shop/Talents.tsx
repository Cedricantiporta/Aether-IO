import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, Lock, RotateCcw, Sparkles, X } from '../../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store';
import type { UpgradeType } from '../../../types';
import {
  BRANCHES, TALENT_BY_ID, allocBlock, branchSpent, childrenOf, reqMet, respecCost, talentPointsTotal, talentsOf, talentsSpent, type TalentNode,
} from '../../../talents';
import { Button } from '../../components/Button';
import { SkillIcon } from '../../components/ItemIcon';
import { PAINTED_ART } from '../../components/SkillIcons';
import { CARD_ART } from '../../components/UpgradeIcons';
import { UpgradeArt } from '../../components/UpgradeIcons';
import { HERO_ICON } from '../../hud/TopBars';
import { HERO_COLOR } from '../../lib/game';

// Radial talent tree (owner reference): class emblem in the centre, four branches (up / right / down / left) fanning out
// over five rings. Square nodes = root / special / capstone, round nodes = plain stat talents. A node opens once its
// parent(s) are learned (MAXED for special talents / the capstone) and the hero has the ring's level. Fixed close zoom, drag to pan; click a node for details.
const ZOOM = 1.1;   // (owner reference: zoomed in on the emblem)
const RING_R = [118, 200, 290, 372, 448];
const AXIS = [-90, 0, 90, 180];
const SIZE = 2 * (RING_R[4] + 70);
const C = SIZE / 2;
const pos = (n: TalentNode): [number, number] => {
  const a = ((AXIS[n.branch] + n.x) * Math.PI) / 180, r = RING_R[n.row];
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const square = (n: TalentNode) => n.row === 0 || n.capstone || !!n.special;

/** Painted raster art fills the whole node (circle or square); SVG glyphs stay inset. */
const painted = (icon: string): boolean => (icon.startsWith('u:') ? CARD_ART.has(icon.slice(2)) : PAINTED_ART.has(icon));
const NodeArt: React.FC<{ icon: string; size: number; dim?: boolean }> = ({ icon, size, dim }) =>
  painted(icon) ? <span className={`tt-art${dim ? ' dim' : ''}`}><NodeIcon icon={icon} size={size} /></span> : <NodeIcon icon={icon} size={Math.round(size * 0.62)} dim={dim} />;
const NodeIcon: React.FC<{ icon: string; size: number; dim?: boolean }> = ({ icon, size, dim }) =>
  icon.startsWith('u:')
    ? <span style={{ display: 'block', opacity: dim ? 0.4 : 1, filter: dim ? 'grayscale(.9)' : undefined }}><UpgradeArt upgrade={{ type: icon.slice(2) as UpgradeType }} size={size} /></span>
    : <SkillIcon id={icon} size={size} dim={dim} />;

/** Drag-to-pan in both axes; a drag never counts as a node click. */
function useDragPan() {
  const d = useRef({ on: false, x: 0, y: 0, l: 0, t: 0, moved: false });
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { if (e.button !== 0) return; d.current = { on: true, x: e.clientX, y: e.clientY, l: e.currentTarget.scrollLeft, t: e.currentTarget.scrollTop, moved: false }; },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const s = d.current; if (!s.on) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) > 5) { s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
      if (s.moved) { e.currentTarget.scrollLeft = s.l - dx; e.currentTarget.scrollTop = s.t - dy; }
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => { d.current.on = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); },
    onPointerCancel: () => { d.current.on = false; },
    onClickCapture: (e: React.MouseEvent) => { if (d.current.moved) { e.stopPropagation(); e.preventDefault(); d.current.moved = false; } },
  };
}

const useTalentState = () => useGameStore(useShallow((s) => ({
  hero: s.hero, ranks: s.talents[s.hero], lv: s.heroRank, gold: s.gold, allocate: s.allocateTalent, respec: s.respecTalents,
})));

/** Skill Trainer "Talents" tab: points + branch progress, and the button that opens the full-screen tree. */
export const TalentsView: React.FC = () => {
  const { hero, ranks, lv, gold, respec } = useTalentState();
  const [open, setOpen] = useState(true);
  const total = talentPointsTotal(lv), free = Math.max(0, total - talentsSpent(ranks)), cost = respecCost(ranks);
  return (
    <div className="flex flex-col gap-3" data-testid="talents-view">
      <div className="tt-sum">
        <div className="tt-pts"><Sparkles size={14} /> <b data-testid="talent-points">{free}</b> / {total} points</div>
        {BRANCHES[hero].map((br, b) => <div key={b} className="tt-br"><span style={{ color: br.color }}>{br.name}</span><b>{branchSpent(hero, b, ranks)}</b></div>)}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" variant="primary" onClick={() => setOpen(true)} data-testid="talent-open">Open talent tree</Button>
        <Button disabled={cost <= 0 || gold < cost} onClick={() => respec()} data-testid="talent-respec"><RotateCcw size={12} /> Respec{cost > 0 ? ` ${cost.toLocaleString()}g` : ''}</Button>
      </div>
      {open && <TalentTree onClose={() => setOpen(false)} />}
    </div>
  );
};

const TalentTree: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { hero, ranks, lv, gold, allocate, respec } = useTalentState();
  const nodes = talentsOf(hero);
  const total = talentPointsTotal(lv), free = Math.max(0, total - talentsSpent(ranks)), cost = respecCost(ranks);
  const [selId, setSel] = useState(nodes[0]?.id);
  const zoom = ZOOM;
  const sel = TALENT_BY_ID[selId] ?? nodes[0];
  const view = useRef<HTMLDivElement>(null);
  const pan = useDragPan();
  const Icon = HERO_ICON[hero];
  // centre the emblem on open (owner: fixed close zoom, drag to pan - no zoom controls)
  useLayoutEffect(() => { const el = view.current; if (el) { el.scrollLeft = C * zoom - el.clientWidth / 2; el.scrollTop = C * zoom - el.clientHeight / 2; } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const block = sel ? allocBlock(sel, ranks, free, lv) : 'max';
  const br = sel ? BRANCHES[hero][sel.branch] : null;
  const r = sel ? ranks[sel.id] || 0 : 0;
  const why: Record<string, string> = { max: 'Maxed', prereq: sel?.reqMax ? 'Max the required talents first' : 'Learn the required talents first', level: `Needs class level ${sel?.lvReq}`, points: `Needs ${sel?.cost} free point${(sel?.cost ?? 1) > 1 ? 's' : ''}` };

  return createPortal(
    <div className="ws-backdrop pe" onClick={onClose} data-testid="talent-tree">
      <motion.div className="ws-win tt-win" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="ws-head"><Sparkles size={20} /> Talents <em>{hero.toLowerCase()} · class level {lv}</em>
          <span className="tt-head-pts"><b>{free}</b> / {total} points</span>
          <button className="sw-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="tt-body">
          <div className="tt-view" ref={view} {...pan}>
            <div style={{ width: SIZE * zoom, height: SIZE * zoom, position: 'relative' }}>
              <div className="tt-canvas" style={{ width: SIZE, height: SIZE, transform: `scale(${zoom})`, ['--hc' as any]: HERO_COLOR[hero] }}>
                <svg className="tt-svg" width={SIZE} height={SIZE}>
                  {RING_R.map((rr, i) => <circle key={i} cx={C} cy={C} r={rr} className={`ring r${i}`} />)}
                  <circle cx={C} cy={C} r={RING_R[0]} className={`inner ${nodes.some((n) => n.row === 0 && ranks[n.id] > 0) ? 'lit' : ''}`} />
                  {nodes.flatMap((n) => n.req.map((q) => {
                    const p = TALENT_BY_ID[q], [x1, y1] = pos(p), [x2, y2] = pos(n);
                    const st = (ranks[n.id] || 0) > 0 ? 'lit' : reqMet(n, q, ranks) ? 'open' : '';
                    return <line key={n.id + q} x1={x1} y1={y1} x2={x2} y2={y2} className={`lk ${st}`} />;
                  }))}
                  {nodes.filter((n) => n.row === 0).map((n) => { const [x, y] = pos(n); return <line key={'c' + n.id} x1={C} y1={C} x2={x} y2={y} className={`lk ${(ranks[n.id] || 0) > 0 ? 'lit' : 'open'}`} />; })}
                </svg>
                <div className="tt-core" style={{ left: C, top: C }}><Icon size={54} /></div>
                {nodes.map((n) => {
                  const [x, y] = pos(n), rk = ranks[n.id] || 0, bl = allocBlock(n, ranks, free, lv);
                  const st = rk >= n.max ? 'max' : rk > 0 ? 'part' : bl === null ? 'open' : bl === 'points' ? 'poor' : 'locked';
                  const sz = n.capstone ? 74 : square(n) ? 62 : 46;
                  return (
                    <button key={n.id} type="button" className={`tt-node ${square(n) ? 'sq' : 'rd'} ${st} ${sel?.id === n.id ? 'sel' : ''}`} style={{ left: x, top: y, width: sz, height: sz, ['--bc' as any]: BRANCHES[hero][n.branch].color }}
                      onClick={() => setSel(n.id)} onDoubleClick={() => { if (allocBlock(n, ranks, free, lv) === null) allocate(n.id); }}
                      data-testid={`talent-${n.id}`} data-rank={rk} data-state={st} aria-label={n.name}>
                      <NodeArt icon={n.icon} size={sz} dim={st === 'locked'} />
                      {st === 'locked' && <span className="tt-lock"><Lock size={square(n) ? 16 : 13} /></span>}
                      <span className="tt-rk">{rk}/{n.max}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {sel && br && (
            <aside className="tt-side" data-testid="talent-detail">
              <div className="tt-dh">
                <div className={`tt-dicon ${square(sel) ? 'sq' : 'rd'}`} style={{ ['--bc' as any]: br.color }}><NodeArt icon={sel.icon} size={64} /></div>
                <div>
                  <div className="tt-dname">{sel.name}</div>
                  <div className="tt-dsub" style={{ color: br.color }}>{br.name}{sel.capstone ? ' · capstone' : sel.special ? ' · special' : ''}</div>
                </div>
              </div>
              <div className="tt-drank">Rank <b>{r}</b> / {sel.max}</div>
              <div className="tt-ddesc">{sel.desc}<em> per rank</em></div>
              <div className="tt-sec">Requirements</div>
              <ul className="tt-req">
                <li className={lv >= sel.lvReq ? 'ok' : ''}>{lv >= sel.lvReq ? <Check size={13} /> : <Lock size={12} />} Class level {sel.lvReq}</li>
                {sel.req.map((q) => { const p = TALENT_BY_ID[q], ok = reqMet(sel, q, ranks); return <li key={q} className={ok ? 'ok' : ''}>{ok ? <Check size={13} /> : <Lock size={12} />} {sel.reqMax ? 'Max' : 'Learn'} {p.name} ({ranks[q] || 0}/{sel.reqMax ? p.max : 1})</li>; })}
                {!sel.req.length && <li className="ok"><Check size={13} /> Branch root</li>}
              </ul>
              {childrenOf(sel).length > 0 && (<>
                <div className="tt-sec">Opens up</div>
                <div className="tt-unl">{childrenOf(sel).map((c) => <button key={c.id} onClick={() => setSel(c.id)}>{c.name}</button>)}</div>
              </>)}
              <div className="tt-cost">{sel.cost} point{sel.cost > 1 ? 's' : ''} per rank</div>
              <button className="ax-btn gold tt-learn" disabled={block !== null} onClick={() => allocate(sel.id)} data-testid="talent-learn">{block === null ? `Learn · ${sel.cost} pt${sel.cost > 1 ? 's' : ''}` : why[block]}</button>
              <button className="ax-btn tt-respec" disabled={cost <= 0 || gold < cost} onClick={() => respec()}><RotateCcw size={13} /> Respec{cost > 0 ? ` · ${cost.toLocaleString()} g` : ''}</button>
            </aside>
          )}
        </div>
      </motion.div>
    </div>,
    (document.querySelector('.hud-root') as HTMLElement) ?? document.body,
  );
};
