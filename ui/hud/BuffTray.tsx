import React, { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { SKILLS_INFO } from '../../constants';
import { world } from '../../engine/world';
import { passiveCooldowns } from '../../engine/systems/skills';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { PaintedIcon } from '../components/SkillIcons';
import type { SkillLevels } from '../../types';

/** Timed passives whose charge slows while moving (skills.ts chargeMul). */
const STILL_CHARGE = new Set(['freezeSpell', 'orbital', 'warcry', 'inspire', 'radiant']);
const PASSIVE_KEYS = ['burning', 'freezing', 'freezeSpell', 'storm', 'thunder', 'stamp', 'orbital', 'warcry', 'inspire', 'consecrate', 'smite', 'radiant', 'graveCall', 'soulHarvest', 'boneArmor'] as const;

/** One tiny round buff bubble: painted icon + soft dark radial sweep while charging (`--cd`), optional small count. Written via refs. */
const Buff: React.FC<{ id: string; tooltip: React.ReactNode; get: () => { f: number; n: string } }> = ({ id, tooltip, get }) => {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const st = useRef({ f: '', n: '' });
  useRaf(() => {
    const { f, n } = get(), s = st.current;
    const fs = f.toFixed(2);
    if (fs !== s.f && root.current) { s.f = fs; root.current.style.setProperty('--cd', fs); }
    if (n !== s.n && num.current) { s.n = n; num.current.textContent = n; }
  });
  return (
    <div ref={root} className="buff-dot pe" {...tip(tooltip)}>
      <span className="buff-ic"><PaintedIcon id={id} /></span>
      <span className="buff-sweep" />
      <span ref={num} className="buff-n" />
    </div>
  );
};

/**
 * Passives are no longer action-bar slots (they cannot be pressed; see the hero sheet / skill trainer). Only the ones with a
 * timer players want to read (proc intervals, the shield's charges) show as tiny bubbles under the HP / MP bars.
 */
export const BuffTray: React.FC = () => {
  const { hero, skillLevels } = useGameStore(useShallow((s) => ({ hero: s.hero, skillLevels: s.skillLevels })));
  const keys = (PASSIVE_KEYS as readonly string[]).filter((k) => {
    const info = (SKILLS_INFO as any)[k];
    return info && info.classType === hero && info.type === 'PASSIVE' && skillLevels[k as keyof SkillLevels] > 0;
  });
  const barrier = skillLevels.barrier > 0;
  if (!keys.length && !barrier) return null;
  const p = world.player;
  return (
    <div className="buff-tray" data-testid="buff-tray">
      {keys.map((k) => {
        const info = (SKILLS_INFO as any)[k];
        const lvl = skillLevels[k as keyof SkillLevels];
        const pc = passiveCooldowns[k];
        return (
          <Buff key={k} id={k}
            get={() => { const c = passiveCooldowns[k]; return { f: c && c.max > 0 ? Math.min(1, Math.max(0, c.t / c.max)) : 0, n: '' }; }}
            tooltip={<SimpleTip title={info.name} sub={`Passive · Lv ${lvl}`} body={info.description}
              lines={pc && pc.max > 0 ? [pc.kind === 'hits' ? <><span className="muted">Procs every</span><span>{pc.max} attacks</span></> : <><span className="muted">Interval</span><span>{pc.max.toFixed(1)}s</span></>, ...(pc.kind === 'time' && STILL_CHARGE.has(k) ? [<><span className="muted">Note</span><span>Charges faster while standing still</span></>] : [])] : undefined} />} />
        );
      })}
      {barrier && (
        <Buff id="barrier"
          get={() => ({ f: p.shieldCharges < p.maxShieldCharges && p.shieldCdMax > 0 ? Math.min(1, Math.max(0, p.shieldCd / p.shieldCdMax)) : 0, n: p.maxShieldCharges > 1 ? String(p.shieldCharges) : '' })}
          tooltip={<SimpleTip title="Energy Shield" sub={`Passive · Lv ${skillLevels.barrier}`} body={SKILLS_INFO.barrier.description} lines={[<><span className="muted">Recharge</span><span>{p.shieldCdMax.toFixed(0)}s</span></>]} />} />
      )}
    </div>
  );
};
