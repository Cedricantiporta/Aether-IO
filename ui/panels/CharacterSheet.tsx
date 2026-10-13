import React, { useRef, useState } from 'react';
import { User, Swords, Clock, Skull, ChevronDown } from 'lucide-react';
import { useGameStore, calculateTotalCP } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { PanelHead, StatLine } from '../components/Frame';
import { Sheet } from '../components/Sheet';
import { HERO_ICON } from '../hud/TopBars';
import { HERO_COLOR, timeMMSS } from '../lib/game';
import { activeSets, SET_COLOR_DARK } from '../../itemSets';

export const CharacterSheet: React.FC = () => {
  const { hero, level, stats, close, shiftRight, equipment } = useGameStore(useShallow((s) => ({
    hero: s.hero, level: s.level, stats: s.stats, equipment: s.equipment, close: s.toggleCharacterSheet, shiftRight: s.isShopOpen,
  })));
  const Icon = HERO_ICON[hero];
  const [more, setMore] = useState(false);
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
    ['Move speed', stats.moveSpeed.toFixed(1)], ['Crit rate', pct(stats.critRate)],
  ];
  const moreRows: [string, React.ReactNode][] = [
    ['HP regen', `${stats.regen.toFixed(1)}/s`], ['Mana regen', `${stats.manaRegen.toFixed(1)}/s`],
    ['Crit damage', pct(stats.critDamage)], ['Attack speed', stats.fireRate.toFixed(2)],
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
    <Sheet side="r" shift={shiftRight} width="26rem" z={shiftRight ? 39 : 40} testId="character-sheet">
      <PanelHead icon={<User size={22} />} title="Character" sub={`${hero} · Level ${level}`} onClose={close} />
      <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="rpg-medallion" style={{ width: '4rem', height: '4rem', ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={30} /></div>
          <div className="flex-1 rpg-frame gold px-3 py-2 text-center">
            <div className="rpg-label">Combat power</div>
            <div className="rpg-num text-3xl" style={{ color: 'var(--hi)' }}>{calculateTotalCP(stats).toLocaleString()}</div>
          </div>
        </div>
        <div className="rpg-frame px-3 py-0.5">
          {rows.map(([l, v]) => <StatLine key={l} label={l} value={v} />)}
          {more && moreRows.map(([l, v]) => <StatLine key={l} label={l} value={v} />)}
          {more && extra.map(([l, v]) => <StatLine key={l} label={l} value={v} tone="pos" />)}
          <button className="w-full min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--fg-2)]" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? 'Fewer stats' : 'More stats'} <ChevronDown size={16} style={{ transform: more ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
          </button>
        </div>
        <div data-testid="set-bonuses">
          <div className="rpg-label mb-1.5">Set bonuses</div>
          {sets.length === 0 && <div className="rpg-frame px-3 py-2.5 text-xs text-[var(--fg-2)]">No set pieces equipped. Elites, bosses and chests drop set gear.</div>}
          {sets.map(({ def, count }) => (
            <div key={def.id} className="rpg-frame px-3 py-2.5 mb-1.5">
              <div className="flex justify-between"><span className="font-bold text-sm" style={{ color: SET_COLOR_DARK }}>{def.name}</span><span className="rpg-num text-xs">{count}/6</span></div>
              {def.bonuses.map((b) => (
                <div key={b.pieces} className="text-xs leading-snug" style={{ color: count >= b.pieces ? SET_COLOR_DARK : 'var(--fg-2)', opacity: count >= b.pieces ? 1 : 0.7 }}>({b.pieces}) {b.text}</div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <div className="rpg-label mb-1.5">This run</div>
          <div className="grid grid-cols-3 gap-2">
            {([[<Skull size={13} key="k" />, 'Kills', kills], [<Clock size={13} key="t" />, 'Time', time], [<Swords size={13} key="d" />, 'Damage', dmg]] as const).map(([ic, l, r]) => (
              <div key={l} className="go-tile">
                <span ref={r} className="v rpg-num text-base block">0</span>
                <div className="l flex items-center justify-center gap-1">{ic}{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
};
