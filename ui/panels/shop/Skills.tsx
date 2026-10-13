import React from 'react';
import { Star } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { SKILLS_INFO } from '../../../constants';
import type { SkillLevels } from '../../../types';
import { Button } from '../../components/Button';
import { SkillIcon } from '../../components/ItemIcon';
import { HERO_COLOR } from '../../lib/game';

const HINT: Record<string, string> = {
  regen: 'More HP regenerated each second.', magnet: 'Larger pickup range.', dash: 'Shorter dash cooldown. Level 5 grants +1 dash charge.',
  weapon: 'Weapon ability recharges faster.', barrier: 'Triggers below 20% HP. Longer invulnerability, more charges, faster recharge.', special: 'Unlocks and strengthens your class special (E).',
  piercing: 'More damage and pierce.', burning: 'Stronger, more frequent fire arrows.', freezing: 'Stronger, more frequent ice arrows.',
  thunder: 'Strikes one more target.', gravity: 'Bigger, longer black hole.', freezeSpell: 'Wider blizzard, longer freeze.', storm: 'Stronger typhoon.',
  orbital: 'One more orbiting blade.', rage: 'Longer rage, more attack speed.', stamp: 'Bigger, more frequent shockwave.',
};
const costOf = (key: string, lvl: number) => (key === 'special' ? 5 : key === 'dash' || key === 'barrier' ? lvl + 2 : lvl + 1);

export const SkillsTab: React.FC = () => {
  const { hero, levels, sp, upgrade } = useGameStore(useShallow((s) => ({ hero: s.hero, levels: s.skillLevels, sp: s.skillPoints, upgrade: s.upgradeSkill })));
  const entries = Object.entries(SKILLS_INFO).filter(([, i]: [string, any]) => !i.classType || i.classType === hero);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="rpg-label">Skills · {hero}</div>
        <div className="rpg-badge !text-[.75rem]"><Star size={12} /> {sp} skill points</div>
      </div>
      {entries.map(([key, info]: [string, any]) => {
        const lvl = levels[key as keyof SkillLevels] ?? 0;
        const max = lvl >= 5;
        const cost = costOf(key, lvl);
        const can = !max && sp >= cost;
        return (
          <div key={key} className="rpg-frame flex items-center gap-3 p-2.5">
            <div className="rpg-slot hoverable" style={{ ['--slot' as any]: '3.4rem', ['--rc' as any]: info.classType ? HERO_COLOR[info.classType as keyof typeof HERO_COLOR] : '#e9b949' }}>
              <span className="slot-icon"><SkillIcon id={key} size={26} dim={lvl <= 0 && key !== 'special'} /></span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold leading-tight text-[var(--gold-light)]" style={{ fontFamily: 'var(--font-title)' }}>{info.name}</span>
                <div className="flex gap-[3px]">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="pip" data-s={i < lvl ? 'full' : 'empty'} style={i < lvl ? { background: 'radial-gradient(circle at 35% 30%, #fff6c8, #e9b949 55%, #8b5a16)', boxShadow: '0 0 6px #e9b949' } : undefined} />)}</div>
              </div>
              <div className="text-[.7rem] text-[var(--text-dim)] leading-snug">{info.description}</div>
              {!max && <div className="text-[.66rem] mt-0.5 text-[var(--good)]">Lv {lvl} → {lvl + 1}: {HINT[key]}</div>}
            </div>
            <Button size="sm" variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => upgrade(key as keyof SkillLevels)} style={{ minWidth: '3.6rem', flexDirection: 'column', gap: 0 }}>
              {max ? 'MAX' : <><span>{lvl === 0 && key === 'special' ? 'Unlock' : 'Upgrade'}</span><span className="rpg-num">{cost} SP</span></>}
            </Button>
          </div>
        );
      })}
    </div>
  );
};
