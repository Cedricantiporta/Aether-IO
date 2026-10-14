import React from 'react';
import { Star } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { SKILLS_INFO } from '../../../constants';
import type { SkillLevels } from '../../../types';
import { Button } from '../../components/Button';
import { SkillIcon } from '../../components/ItemIcon';
import { HERO_COLOR } from '../../lib/game';
import { TalentsView } from './Talents';
import { activeDefs, dashDef, dashKey, isDashKey, ULTS } from '../../../abilityDefs';
import { PaintedIcon } from '../../components/SkillIcons';

const HINT: Record<string, string> = {
  regen: 'More HP regenerated each second.', magnet: 'Larger pickup range.', dash: 'Shorter dash cooldown. Level 5 grants +1 dash charge.',
  weapon: 'Ultimate charge fills 10% faster per level.', barrier: 'Triggers below 20% HP. Longer invulnerability, more charges, faster recharge.',
  burning: 'Fire arrow every Nth attack: N drops by 1 per level.', freezing: 'Ice arrow every Nth attack: N drops by 1, slow lasts longer.',
  thunder: 'Chain lightning every Nth bolt: N drops by 1, one more target.', freezeSpell: 'Stronger slow, longer duration (radius 16, slow instead of freeze).', storm: 'One more bolt in the volley, more damage.',
  orbital: 'One more orbiting blade (1 + level).', stamp: 'Axe Storm every Nth throw: N drops by 1, harder-hitting axes.',
};
const costOf = (hero: any, key: string, lvl: number) => (isDashKey(hero, key) || key === 'barrier' || key === 'ult' ? lvl + 2 : lvl + 1);

const RunSkills: React.FC = () => {
  const { hero, levels, sp, upgrade } = useGameStore(useShallow((s) => ({ hero: s.hero, levels: s.skillLevels, sp: s.skillPoints, upgrade: s.upgradeSkill })));
  const passives = Object.entries(SKILLS_INFO).filter(([k, i]: [string, any]) => i.type === 'PASSIVE' && k !== 'dash' && (!i.classType || i.classType === hero));
  const rows: { key: string; name: string; desc: string; icon: React.ReactNode; tag?: string; now?: (l: number) => string; color?: string }[] = [
    ...activeDefs(hero).map((a, i) => ({ key: a.slot, name: a.name, desc: a.desc, icon: <PaintedIcon id={a.icon} />, tag: String(i + 1), now: a.per })),
    { key: dashKey(hero), name: `Dash: ${dashDef(hero).name}`, desc: dashDef(hero).desc, icon: <PaintedIcon id={dashDef(hero).icon} />, tag: 'SPACE', now: dashDef(hero).per, color: '#7ad0ff' },
    { key: 'ult', name: ULTS[hero].name, desc: ULTS[hero].desc, icon: <PaintedIcon id={ULTS[hero].icon} />, tag: 'R', now: ULTS[hero].per, color: '#ff9a3a' },
    ...passives.map(([k, i]: [string, any]) => ({ key: k, name: i.name, desc: i.description, icon: <SkillIcon id={k} size={26} dim={(levels[k as keyof SkillLevels] ?? 0) <= 0} /> })),
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="rpg-label">Skills · {hero}</div>
        <div className="rpg-badge !text-[.75rem]"><Star size={12} /> {sp} skill points</div>
      </div>
      {rows.map((r) => {
        const lvl = levels[r.key as keyof SkillLevels] ?? 0;
        const max = lvl >= 5;
        const cost = costOf(hero, r.key, lvl);
        const can = !max && sp >= cost;
        const info: any = (SKILLS_INFO as any)[r.key];
        return (
          <div key={r.key} className="rpg-frame flex items-center gap-3 p-2.5" data-testid={`skill-${r.key}`}>
            <div className="rpg-slot hoverable relative" style={{ ['--slot' as any]: '3.4rem', ['--rc' as any]: r.color ?? (info?.classType ? HERO_COLOR[info.classType as keyof typeof HERO_COLOR] : '#e9b949') }}>
              <span className="slot-icon">{r.icon}</span>
              {r.tag && <span className="rpg-key">{r.tag}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold leading-tight text-[var(--gold-light)]" style={{ fontFamily: 'var(--font-title)' }}>{r.name}</span>
                <div className="flex gap-[3px]">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="pip" data-s={i < lvl ? 'full' : 'empty'} style={i < lvl ? { background: 'radial-gradient(circle at 35% 30%, #fff6c8, #e9b949 55%, #8b5a16)', boxShadow: '0 0 6px #e9b949' } : undefined} />)}</div>
              </div>
              <div className="text-[.7rem] text-[var(--text-dim)] leading-snug">{r.desc}</div>
              {r.now ? (
                <>
                  <div className="text-[.66rem] mt-0.5 text-[var(--text-dim)]">Lv {lvl}: {r.now(lvl)}</div>
                  {!max && <div className="text-[.66rem] text-[var(--good)]">Lv {lvl + 1}: {r.now(lvl + 1)}</div>}
                </>
              ) : (!max && <div className="text-[.66rem] mt-0.5 text-[var(--good)]">Lv {lvl} → {lvl + 1}: {HINT[r.key]}</div>)}
            </div>
            <Button size="sm" variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => upgrade(r.key as keyof SkillLevels)} style={{ minWidth: '3.6rem', flexDirection: 'column', gap: 0 }}>
              {max ? 'MAX' : <><span>{lvl === 0 ? 'Unlock' : 'Upgrade'}</span><span className="rpg-num">{cost} SP</span></>}
            </Button>
          </div>
        );
      })}
    </div>
  );
};

/** Skill Trainer: run skills (spent with run Skill Points) and permanent talents (Hero Rank points). */
export const SkillsTab: React.FC = () => {
  const [view, setView] = React.useState<'run' | 'talents'>('run');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" role="tablist">
        <Button size="sm" active={view === 'run'} onClick={() => setView('run')} role="tab" data-testid="tab-run-skills">Skills (run)</Button>
        <Button size="sm" active={view === 'talents'} onClick={() => setView('talents')} role="tab" data-testid="tab-talents">Talents (permanent)</Button>
      </div>
      {view === 'run' ? <RunSkills /> : <TalentsView />}
    </div>
  );
};
