import React from 'react';
import { unlockLevel, skillCost } from '../../../classLevels';
import { Star } from '../../components/GoldIcons';
import { useGameStore, questFree } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { SKILLS_INFO } from '../../../constants';
import type { SkillLevels } from '../../../types';
import { Button } from '../../components/Button';
import { SkillIcon } from '../../components/ItemIcon';
import { HERO_COLOR } from '../../lib/game';
import { TalentsView } from './Talents';
import { useRunSkillAlert, useTalentAlert, canTrainSkill } from '../../lib/alerts';
import { activeDefs, dashDef, dashKey, isDashKey, ULTS } from '../../../abilityDefs';
import { PaintedIcon } from '../../components/SkillIcons';
import { tip } from '../../components/Tooltip';
import { SimpleTip } from '../../components/ItemTip';

const HINT: Record<string, string> = {
  regen: 'More HP regenerated each second.', magnet: 'Larger pickup range.', dash: 'Shorter dash cooldown. Level 5 grants +1 dash charge.',
  weapon: 'Ultimate charge fills 10% faster per level.', barrier: 'Triggers below 20% HP. Longer invulnerability, more charges, faster recharge.',
  burning: 'Fire arrow every Nth attack: N drops by 1 per level.', freezing: 'Ice arrow every Nth attack: N drops by 1, slow lasts longer.',
  thunder: 'Chain lightning every Nth bolt: N drops by 1, one more target.', freezeSpell: 'Stronger slow, longer duration (radius 16, slow instead of freeze).', storm: 'Bigger shield (+5% max HP) and it returns 1s sooner.',
  orbital: 'One more orbiting blade (1 + level).', stamp: 'Axe Storm every Nth throw: N drops by 1, harder-hitting axes.',
};
const costOf = (hero: any, key: string, lvl: number) => skillCost(key, lvl, isDashKey(hero, key));

const RunSkills: React.FC = () => {
  const { hero, levels, sp, upgrade, heroLv } = useGameStore(useShallow((s) => ({ hero: s.hero, levels: s.skillLevels, sp: s.skillPoints, upgrade: s.upgradeSkill, heroLv: s.level })));
  const free = useGameStore((s) => questFree(s, 'train'));   // tutorial "Lessons of the Blade": one skill level without skill points
  const passives = Object.entries(SKILLS_INFO).filter(([k, i]: [string, any]) => i.type === 'PASSIVE' && k !== 'dash' && (!i.classType || i.classType === hero));
  const rows: { key: string; name: string; desc: string; icon: React.ReactNode; tag?: string; now?: (l: number) => string; color?: string }[] = [
    ...activeDefs(hero).map((a, i) => ({ key: a.slot, name: a.name, desc: a.desc, icon: <PaintedIcon id={a.icon} />, tag: String(i + 1), now: a.per })),
    { key: dashKey(hero), name: `Dash: ${dashDef(hero).name}`, desc: dashDef(hero).desc, icon: <PaintedIcon id={dashDef(hero).icon} />, tag: 'SPACE', now: dashDef(hero).per, color: '#7ad0ff' },
    { key: 'ult', name: ULTS[hero].name, desc: ULTS[hero].desc, icon: <PaintedIcon id={ULTS[hero].icon} />, tag: 'R', now: ULTS[hero].per, color: '#ff9a3a' },
    ...passives.map(([k, i]: [string, any]) => ({ key: k, name: i.name, desc: i.description, icon: <SkillIcon id={k} size={26} dim={(levels[k as keyof SkillLevels] ?? 0) <= 0} /> })),
  ];
  // (owner, reference) a compact list: icon, LV x/5, name and the action on the right; the details live in the hover tooltip
  const [tab, setTab] = React.useState<'ACTIVE' | 'PASSIVE'>('ACTIVE');
  const dotA = useGameStore((s) => canTrainSkill(s, 'ACTIVE')), dotP = useGameStore((s) => canTrainSkill(s, 'PASSIVE'));
  const shown = rows.filter((r) => (tab === 'PASSIVE') === !!passives.find(([k]) => k === r.key));
  const short = (t: string) => { const m = t.match(/^[^.!?]*[.!?]/); return m ? m[0] : t; };
  return (
    <div className="flex flex-col gap-2">
      <div className="sk-head">
        <nav className="bag-tabs shop-tabs" style={{ ['--n' as any]: 2, margin: 0, flex: 1 }}>
          {(['ACTIVE', 'PASSIVE'] as const).map((t) => <button key={t} className={`bag-tab relative ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)} data-testid={`sk-tab-${t}`}>{t === 'ACTIVE' ? 'Active' : 'Passive'}{(t === 'ACTIVE' ? dotA : dotP) && <i className="red-dot" />}</button>)}
        </nav>
        <span className="sk-sp"><Star size={12} /> {sp} SP</span>
      </div>
      {free && <div className="sk-free" data-testid="trainer-free">First lesson free: learn or upgrade one skill at no cost.</div>}
      {shown.map((r) => {
        const lvl = levels[r.key as keyof SkillLevels] ?? 0;
        const max = lvl >= 5;
        const cost = free ? 0 : costOf(hero, r.key, lvl);
        const need = unlockLevel(hero, r.key), lockedLv = lvl === 0 && heroLv < need;
        const can = !max && !lockedLv && sp >= cost;
        const info: any = (SKILLS_INFO as any)[r.key];
        const lines: React.ReactNode[] = r.now
          ? [<span key="a" className="muted">Lv {lvl}: {r.now(lvl)}</span>, ...(!max ? [<span key="b" className="pos">Lv {lvl + 1}: {r.now(lvl + 1)}</span>] : [])]
          : (!max && HINT[r.key] ? [<span key="c" className="pos">Next: {HINT[r.key]}</span>] : []);
        return (
          <div key={r.key} className={`sk-row ${lvl > 0 ? 'on' : ''}`} data-testid={`skill-${r.key}`} {...tip(<SimpleTip title={r.name} sub={r.tag ? `Key ${r.tag}` : 'Passive'} body={short(r.desc)} lines={lines} />)}>
            <div className="sk-ic" style={{ ['--rc' as any]: r.color ?? (info?.classType ? HERO_COLOR[info.classType as keyof typeof HERO_COLOR] : '#e9b949') }}>{r.icon}</div>
            <div className="sk-txt">
              <span className="sk-lv">LV {lvl}/5</span>
              <span className="sk-name">{r.name}</span>
            </div>
            {max ? <span className="sk-state max">Mastered</span>
              : lockedLv ? <span className="sk-state lock">Lv {need}</span>
              : <button className={`sk-btn pe ${can ? 'can' : ''}`} disabled={!can} onClick={() => upgrade(r.key as keyof SkillLevels)}>{lvl === 0 ? 'Learn' : 'Upgrade'} <em>{cost === 0 ? 'Free' : `${cost} SP`}</em></button>}
          </div>
        );
      })}
    </div>
  );
};

/** Skill Trainer: skills (learned with skill points from class levels) and talents (points from class levels). */
export const SkillsTab: React.FC = () => {
  const runDot = useRunSkillAlert(), talentDot = useTalentAlert();
  const freeLesson = useGameStore((s) => questFree(s, 'train'));
  const [view, setView] = React.useState<'run' | 'talents'>(() => (!runDot && talentDot && !freeLesson ? 'talents' : 'run'));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5" role="tablist">
        <div className="relative"><Button size="sm" active={view === 'run'} onClick={() => setView('run')} role="tab" data-testid="tab-run-skills">Skills</Button>{runDot && <i className="red-dot" />}</div>
        <div className="relative"><Button size="sm" active={view === 'talents'} onClick={() => setView('talents')} role="tab" data-testid="tab-talents">Talents (permanent)</Button>{talentDot && <i className="red-dot" />}</div>
      </div>
      {view === 'run' ? <RunSkills /> : <TalentsView />}
    </div>
  );
};
