import React from 'react';
import { Lock, RotateCcw, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store';
import type { UpgradeType } from '../../../types';
import {
  BRANCHES, CAPSTONE_BRANCH_POINTS, TALENT_BY_ID, allocBlock, branchSpent, respecCost, talentPointsTotal, talentsOf, talentsSpent, type TalentNode,
} from '../../../talents';
import { Button } from '../../components/Button';
import { SkillIcon } from '../../components/ItemIcon';
import { UpgradeArt } from '../../components/UpgradeIcons';
import { SimpleTip } from '../../components/ItemTip';
import { tip } from '../../components/Tooltip';
import { HERO_COLOR } from '../../lib/game';

const COL_W = 130, ROW_H = 92, TOP = 46, BOX_H = TOP + ROW_H * 3 + 56;
const cx = (n: TalentNode) => 22 + 43 * n.x;
const cy = (n: TalentNode) => TOP + ROW_H * n.row;

const NodeIcon: React.FC<{ icon: string; size: number; dim?: boolean }> = ({ icon, size, dim }) =>
  icon.startsWith('u:')
    ? <span style={{ display: 'block', opacity: dim ? 0.45 : 1, filter: dim ? 'grayscale(.8)' : undefined }}><UpgradeArt upgrade={{ type: icon.slice(2) as UpgradeType }} size={size} /></span>
    : <SkillIcon id={icon} size={size} dim={dim} />;

export const TalentsView: React.FC = () => {
  const { hero, ranks, heroRank, gold, allocate, respec } = useGameStore(useShallow((s) => ({
    hero: s.hero, ranks: s.talents[s.hero], heroRank: s.heroRank, gold: s.gold, allocate: s.allocateTalent, respec: s.respecTalents,
  })));
  const total = talentPointsTotal(heroRank);
  const spent = talentsSpent(ranks);
  const free = Math.max(0, total - spent);
  const cost = respecCost(ranks);
  const nodes = talentsOf(hero);
  const color = HERO_COLOR[hero];

  return (
    <div className="flex flex-col gap-3" data-testid="talents-view">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="rpg-label">Talents · {hero}</div>
          <div style={{ fontSize: '.66rem', lineHeight: 1.3, color: 'var(--text-dim)' }}>Permanent. 1 point per class level, +1 every 5 levels. Deeper tiers cost more points.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rpg-badge !text-[.75rem]" data-testid="talent-points"><Sparkles size={12} /> {free} / {total} points</div>
          <Button size="sm" disabled={cost <= 0 || gold < cost} onClick={() => respec()} data-testid="talent-respec">
            <RotateCcw size={12} /> Respec{cost > 0 ? ` ${cost.toLocaleString()}g` : ''}
          </Button>
        </div>
      </div>

      <div className="flex rpg-frame py-2 overflow-x-auto" style={{ ['--hc' as any]: color }}>
        <div className="flex mx-auto" style={{ width: COL_W * 3, flexShrink: 0 }}>
          {BRANCHES[hero].map((br, b) => {
            const bn = nodes.filter((n) => n.branch === b);
            const bs = branchSpent(hero, b, ranks);
            return (
              <div key={b} className="relative" style={{ width: COL_W, height: BOX_H }}>
                <div className="absolute left-0 right-0 text-center" style={{ top: 0, padding: '0 4px' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, lineHeight: 1, color: br.color, fontFamily: 'var(--font-title)', textShadow: '0 1px 0 #000' }}>{br.name}</div>
                  <div style={{ fontSize: '.56rem', lineHeight: 1.1, marginTop: 3, color: 'var(--text-dim)' }}>{br.blurb}</div>
                  <div style={{ fontSize: '.56rem', color: bs > 0 ? br.color : 'var(--text-dim)' }}>{bs} pts</div>
                </div>
                <svg className="absolute inset-0 pointer-events-none" width={COL_W} height={BOX_H}>
                  {bn.flatMap((n) => n.req.map((rid) => {
                    const p = TALENT_BY_ID[rid];
                    const on = (ranks[n.id] || 0) > 0;
                    const open = (ranks[rid] || 0) > 0;
                    return <line key={n.id + rid} x1={cx(p)} y1={cy(p)} x2={cx(n)} y2={cy(n)} stroke={on ? br.color : open ? '#e9b949' : '#4a3d2a'} strokeWidth={on ? 3.2 : 2.2} strokeOpacity={on ? 1 : open ? 0.8 : 0.6} strokeDasharray={on ? undefined : '4 3'} />;
                  }))}
                </svg>
                {bn.map((n) => {
                  const r = ranks[n.id] || 0;
                  const block = allocBlock(n, ranks, free);
                  const can = block === null;
                  const locked = block === 'prereq' || block === 'branch';
                  const sz = n.capstone ? 52 : 42;
                  const lines: React.ReactNode[] = [
                    <span key="r" style={{ fontWeight: 700 }}>Rank {r} / {n.max}</span>,
                    <span key="d" className="pos">Per rank: {n.desc}</span>,
                    <span key="k" className={free >= n.cost || r >= n.max ? 'muted' : 'neg'}>Costs {n.cost} point{n.cost > 1 ? 's' : ''} per rank</span>,
                  ];
                  if (n.req.length) lines.push(<span key="q" className={n.req.every((q) => ranks[q] > 0) ? 'muted' : 'neg'}>Requires: {n.req.map((q) => TALENT_BY_ID[q].name).join(' + ')}</span>);
                  if (n.capstone) lines.push(<span key="c" className={bs >= CAPSTONE_BRANCH_POINTS ? 'muted' : 'neg'}>Requires {CAPSTONE_BRANCH_POINTS} points in {br.name} ({bs})</span>);
                  return (
                    <button
                      key={n.id} type="button" aria-disabled={!can} data-testid={`talent-${n.id}`} data-rank={r} data-state={r >= n.max ? 'max' : can ? 'open' : locked ? 'locked' : 'closed'}
                      onClick={() => { if (can) allocate(n.id); }}
                      {...tip(<SimpleTip title={n.name} sub={n.capstone ? `${br.name} capstone` : br.name} color={br.color} lines={lines} />)}
                      className="absolute flex items-center justify-center"
                      style={{
                        left: cx(n) - sz / 2, top: cy(n) - sz / 2, width: sz, height: sz, borderRadius: n.capstone ? 14 : '50%',
                        background: r > 0 ? `radial-gradient(circle at 35% 28%, ${br.color}55, #1a1208 75%)` : 'radial-gradient(circle at 35% 28%, #3a2c18, #120d07 75%)',
                        border: `2px solid ${r >= n.max ? '#ffe08a' : r > 0 ? br.color : can ? '#e9b949' : '#4a3d2a'}`,
                        boxShadow: r > 0 ? `0 0 10px ${br.color}99` : can ? '0 0 8px #e9b94988' : 'none',
                        cursor: can ? 'pointer' : 'default', transform: n.capstone ? 'rotate(0deg)' : undefined,
                      }}
                    >
                      <NodeIcon icon={n.icon} size={sz - 16} dim={r <= 0 && !can} />
                      {n.cost > 1 && r < n.max && <span className="absolute rpg-num" style={{ top: -7, right: -9, fontSize: '.52rem', padding: '0 3px', borderRadius: 5, background: '#0d0703', color: free >= n.cost ? '#e9b949' : '#8a7a5a', border: '1px solid #3a2c18' }} title="Points per rank">{n.cost}P</span>}
                      {locked && r <= 0 && <span className="absolute inset-0 flex items-center justify-center"><Lock size={12} color="#cbbd9a" /></span>}
                      <span className="absolute rpg-num" style={{ bottom: -9, left: '50%', transform: 'translateX(-50%)', fontSize: '.58rem', padding: '0 4px', borderRadius: 6, background: '#0d0703', color: r >= n.max ? '#ffe08a' : r > 0 ? br.color : '#9a8a6a', border: '1px solid #3a2c18' }}>{r}/{n.max}</span>
                    </button>
                  );
                })}
                {bn.map((n) => (
                  <div key={'l' + n.id} className="absolute text-center leading-[1.05] pointer-events-none" style={{ left: cx(n) - 25, width: 50, top: cy(n) + (n.capstone ? 38 : 31), fontSize: '.54rem', color: (ranks[n.id] || 0) > 0 ? '#f1d9a0' : '#8a7a5a' }}>{n.name}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: '.64rem', lineHeight: 1.3, color: 'var(--text-dim)' }}>Click a node to spend points: the first two tiers cost 1 point per rank, the third tier 2 and capstones 3. Capstones need {CAPSTONE_BRANCH_POINTS} points in their branch and both nodes above them. Talents apply in every run of this class.</div>
    </div>
  );
};
