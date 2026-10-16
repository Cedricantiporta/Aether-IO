// Town top-left profile (Korean-MMO style, no box): class emblem, class name + rank tag, thin rank-xp line, change-class / difficulty chips.
import { activeChar } from '../../characters';
import React from 'react';
import { Repeat } from '../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, rankXpNeeded, goldFindMul } from '../../store';
import { useUiStore } from '../uiStore';
import { DIFFICULTY_MODS } from '../../constants';
import { titleOf } from '../../achievements';
import { HERO_META } from '../lib/heroes';
import { ClassEmblem } from '../screens/CharacterSelect';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

export const TownProfile: React.FC = () => {
  const { hero, rank, xp, diff, title } = useGameStore(useShallow((s) => ({ hero: s.hero, rank: s.heroRank, xp: s.rankXp, diff: s.difficulty, title: titleOf(s.meta.title) })));
  const setCharSelect = useUiStore((s) => s.setCharSelect);
  const need = rankXpNeeded(rank), f = Math.min(1, xp / Math.max(1, need));
  const gf = Math.round((goldFindMul(rank) - 1) * 100);
  return (
    <div className="tp pe" data-testid="town-profile">
      <button className="tp-emblem" onClick={() => setCharSelect(true)} aria-label="Characters"><ClassEmblem hero={hero} size="4.4rem" lit /></button>
      <div className="tp-body">
        <div className="tp-name">
          <span>{activeChar()?.name ?? HERO_META[hero].title}<em className="tp-cls"> {HERO_META[hero].title}</em></span>
          <b className="tp-rank" data-testid="rank-num" {...tip(<SimpleTip title={`Level ${rank}`} body={`Each class levels up on its own from the xp you earn in runs. Higher levels unlock skills, better gear and give +${gf}% gold find.`} />)}>LV {rank}</b>
        </div>
        {title && <div className="tp-title" data-testid="hero-title">{title}</div>}
        <div className="tp-xp"><span className="tp-line"><i style={{ width: `${f * 100}%` }} /></span><em data-testid="rank-xp">{xp.toLocaleString()} / {need.toLocaleString()}</em></div>
        <div className="tp-chips">
          <button className="tp-chip" onClick={() => setCharSelect(true)} data-testid="change-class"><Repeat size={11} /> Characters</button>
          <span className="tp-chip dim">{DIFFICULTY_MODS[diff].label}</span>
        </div>
      </div>
    </div>
  );
};
