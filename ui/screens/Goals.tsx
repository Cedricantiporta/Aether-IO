// Goals panel (centred modal): Daily / Weekly goals with claim buttons + reset timers, and the permanent Achievements
// list with reward claiming and "Equip title". All state lives in store.meta (goals.ts); actions in goalsTracker.ts.
import React, { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { GoalGlyph } from '../components/MenuGlyphs';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { DAILY_BONUS_GEMS, WEEKLY_BONUS, allClaimed, fmtDuration, goalClaimable, goalText, msToNextDay, msToNextWeek, rewardText, type GoalInst } from '../../goals';
import { ACHIEVEMENTS, type Achievement } from '../../achievements';
import { bonusReady, claimAchievement, claimBonus, claimGoal, equipTitle, flush } from '../../goalsTracker';

const TABS = ['DAILY', 'WEEKLY', 'ACHIEVEMENTS'] as const;
type Tab = typeof TABS[number];
const fmt = (n: number) => Math.floor(n).toLocaleString();

const Bar: React.FC<{ f: number }> = ({ f }) => <div className="gl-bar"><i style={{ width: `${Math.min(1, Math.max(0, f)) * 100}%` }} /></div>;

const GoalRow: React.FC<{ g: GoalInst; weekly: boolean }> = ({ g, weekly }) => {
  const ready = goalClaimable(g);
  return (
    <div className={`gl-row ${ready ? 'done' : ''} ${g.claimed ? 'claimed' : ''}`} data-testid="goal-row">
      <div className="gl-mark"><span>{g.claimed ? '✓' : ready ? '!' : '◆'}</span></div>
      <div className="flex-1 min-w-0">
        <div className="gl-name">{goalText(g)}</div>
        <Bar f={g.progress / g.target} />
        <div className="gl-sub mt-[.2rem]">{fmt(g.progress)} / {fmt(g.target)}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="gl-reward flex items-center gap-1">{g.reward.gold ? <CoinGlyph size={14} /> : g.reward.gems ? <GemGlyph size={14} /> : null}{rewardText(g.reward)}</span>
        {g.claimed ? <span className="rpg-label !text-[.55rem]">Claimed</span>
          : <button className={`rpg-btn rpg-btn-sm pe ${ready ? 'rpg-btn-primary' : ''}`} disabled={!ready} onClick={() => claimGoal(weekly, g.id)} data-testid="goal-claim">Claim</button>}
      </div>
    </div>
  );
};

const GoalList: React.FC<{ weekly: boolean }> = ({ weekly }) => {
  const m = useGameStore((s) => s.meta);
  const list = weekly ? m.weekly : m.daily;
  const bonusDone = weekly ? m.weeklyBonus : m.dailyBonus;
  const ready = bonusReady(m, weekly), got = list.filter((g) => g.claimed).length;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  const left = weekly ? msToNextWeek() : msToNextDay();
  const bonus = weekly ? rewardText(WEEKLY_BONUS) : `${DAILY_BONUS_GEMS} gems`;
  return (
    <div className="flex flex-col gap-2" data-testid={weekly ? 'goals-weekly' : 'goals-daily'}>
      <div className="flex items-center justify-between">
        <span className="rpg-label">{weekly ? 'Weekly goals' : 'Daily goals'} {got} / {list.length} claimed</span>
        <span className="rpg-label" data-testid="goals-reset">Resets in {fmtDuration(left)}</span>
      </div>
      {list.map((g) => <GoalRow key={g.id} g={g} weekly={weekly} />)}
      <div className={`gl-row ${ready ? 'done' : ''} ${bonusDone ? 'claimed' : ''}`} data-testid="goal-bonus">
        <div className="gl-mark"><span>{bonusDone ? '✓' : '★'}</span></div>
        <div className="flex-1 min-w-0">
          <div className="gl-name">Bonus chest</div>
          <div className="gl-sub">Claim all three {weekly ? 'weekly' : 'daily'} goals to open it</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="gl-reward">{bonus}</span>
          {bonusDone ? <span className="rpg-label !text-[.55rem]">Claimed</span>
            : <button className={`rpg-btn rpg-btn-sm pe ${ready ? 'rpg-btn-primary' : ''}`} disabled={!ready || !allClaimed(list)} onClick={() => claimBonus(weekly)} data-testid="bonus-claim">Open</button>}
        </div>
      </div>
    </div>
  );
};

const AchRow: React.FC<{ a: Achievement; value: number; unlocked: boolean; claimed: boolean; equipped: boolean }> = ({ a, value, unlocked, claimed, equipped }) => (
  <div className={`gl-row ${unlocked && !claimed ? 'done' : ''} ${unlocked && claimed ? 'claimed' : ''}`} data-testid="ach-row" data-unlocked={unlocked}>
    <div className="gl-mark"><span>{unlocked ? '★' : '◆'}</span></div>
    <div className="flex-1 min-w-0">
      <div className="gl-name">{a.name}{a.title && <span className="gl-sub ml-2" style={{ color: unlocked ? '#f1d58e' : undefined }}>Title: {a.title}</span>}</div>
      <div className="gl-sub">{a.desc}</div>
      {!unlocked && <><Bar f={value / a.target} /><div className="gl-sub mt-[.2rem]">{fmt(Math.min(value, a.target))} / {fmt(a.target)}</div></>}
    </div>
    <div className="flex flex-col items-end gap-1 shrink-0">
      <span className="gl-reward flex items-center gap-1"><GemGlyph size={14} />{a.gems} gems</span>
      {unlocked && !claimed && <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" onClick={() => claimAchievement(a.id)} data-testid="ach-claim">Claim</button>}
      {unlocked && a.title && (equipped
        ? <button className="rpg-btn rpg-btn-sm pe" onClick={() => equipTitle(null)} data-testid="title-unequip">Unequip title</button>
        : <button className="rpg-btn rpg-btn-sm pe" onClick={() => equipTitle(a.id)} data-testid="title-equip">Equip title</button>)}
      {equipped && <span className="gl-eq">EQUIPPED</span>}
      {unlocked && claimed && !a.title && <span className="rpg-label !text-[.55rem]">Claimed</span>}
    </div>
  </div>
);

const Achievements: React.FC = () => {
  const m = useGameStore((s) => s.meta);
  const rank = useGameStore((s) => s.heroRank);
  const wh = useGameStore((s) => s.warehouse.length);
  const mythic = useGameStore((s) => s.inventory.some((i) => i.rarity === 'MYTHIC') || s.warehouse.some((i) => i.rarity === 'MYTHIC') || Object.values(s.equipment).some((i) => i && i.rarity === 'MYTHIC'));
  const ctx = { meta: m, rank, mythic, warehouse: wh };
  const n = m.unlocked.length;
  // unlocked + unclaimed first, then in progress, then finished
  const order = ACHIEVEMENTS.map((a, i) => ({ a, i, k: m.unlocked.includes(a.id) ? (m.claimed.includes(a.id) ? 2 : 0) : 1 })).sort((x, y) => x.k - y.k || x.i - y.i);
  return (
    <div className="flex flex-col gap-2" data-testid="goals-achievements">
      <div className="flex items-center justify-between">
        <span className="rpg-label">{n} / {ACHIEVEMENTS.length} achievements</span>
        <span className="rpg-label">Title: <b style={{ color: '#f1d58e' }}>{ACHIEVEMENTS.find((a) => a.id === m.title)?.title ?? 'none'}</b></span>
      </div>
      {order.map(({ a }) => <AchRow key={a.id} a={a} value={a.value(ctx)} unlocked={m.unlocked.includes(a.id)} claimed={m.claimed.includes(a.id)} equipped={m.title === a.id} />)}
    </div>
  );
};

export const GoalsDialog: React.FC = () => {
  const open = useUiStore((s) => s.goalsOpen);
  const close = useUiStore((s) => s.openGoals);
  const [tab, setTab] = useState<Tab>(() => useUiStore.getState().goalsTab as Tab);
  const wantTab = useUiStore((s) => s.goalsTab);
  useEffect(() => { if (open) setTab(wantTab as Tab); }, [open, wantTab]);
  const m = useGameStore((s) => s.meta);
  useEffect(() => { if (open) flush(); }, [open]);   // roll an expired day / week and merge buffered counts before showing
  const dot = (t: Tab) => t === 'DAILY' ? m.daily.some(goalClaimable) || (!m.dailyBonus && allClaimed(m.daily))
    : t === 'WEEKLY' ? m.weekly.some(goalClaimable) || (!m.weeklyBonus && allClaimed(m.weekly))
      : m.unlocked.some((id) => !m.claimed.includes(id));
  return (
    <Modal open={open} onClose={() => close(false)} title="Goals" icon={<GoalGlyph size={22} />} width="40rem" z={250}>
      <div className="flex gap-2 mb-3">
        {TABS.map((t) => (
          <button key={t} className={`rpg-subtab pe relative ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)} data-testid={`goals-tab-${t.toLowerCase()}`}>
            {t === 'ACHIEVEMENTS' ? 'Achievements' : t.charAt(0) + t.slice(1).toLowerCase()}{dot(t) && <i className="red-dot" />}
          </button>
        ))}
      </div>
      <div className="rpg-scroll" style={{ height: tab === 'ACHIEVEMENTS' ? '27rem' : '23rem', paddingRight: '.2rem' }}>
        {tab === 'ACHIEVEMENTS' ? <Achievements /> : <GoalList weekly={tab === 'WEEKLY'} />}
      </div>
    </Modal>
  );
};
