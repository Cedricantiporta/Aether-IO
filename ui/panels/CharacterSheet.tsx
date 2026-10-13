import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Swords, Clock, Skull } from 'lucide-react';
import { useGameStore, calculateTotalCP } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Panel, PanelHead, StatLine } from '../components/Frame';
import { HERO_ICON } from '../hud/TopBars';
import { HERO_COLOR, timeMMSS } from '../lib/game';
import { activeSets, SET_COLOR_DARK } from '../../itemSets';

export const CharacterSheet: React.FC = () => {
  const { hero, level, stats, close, shiftRight, equipment } = useGameStore(useShallow((s) => ({
    hero: s.hero, level: s.level, stats: s.stats, equipment: s.equipment, close: s.toggleCharacterSheet, shiftRight: s.isShopOpen,
  })));
  const Icon = HERO_ICON[hero];
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
    ['Move speed', stats.moveSpeed.toFixed(1)], ['HP regen', `${stats.regen.toFixed(1)}/s`], ['Mana regen', `${stats.manaRegen.toFixed(1)}/s`],
    ['Crit rate', pct(stats.critRate)], ['Crit damage', pct(stats.critDamage)], ['Attack speed', stats.fireRate.toFixed(2)],
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
    <motion.div initial={{ x: '105%' }} animate={{ x: 0 }} exit={{ x: '105%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute pe flex" style={{ right: shiftRight ? '32.5rem' : '.7rem', top: '.7rem', bottom: '.7rem', width: '24rem', zIndex: shiftRight ? 39 : 40 }}>
      <Panel className="flex flex-col w-full min-h-0">
        <PanelHead icon={<User size={22} />} title="Character" sub={`${hero} · Level ${level}`} onClose={close} />
        <div className="flex-1 min-h-0 rpg-scroll p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rpg-medallion" style={{ width: '4.6rem', height: '4.6rem', ['--mc' as any]: HERO_COLOR[hero] }}><Icon size={32} /></div>
            <div className="flex-1 rpg-parchment px-3 py-2 text-center">
              <div className="rpg-label !text-[.6rem]" style={{ color: 'var(--ink-soft)' }}>Combat power</div>
              <div className="rpg-num text-3xl" style={{ color: '#8a4a00', textShadow: '0 1px 0 rgba(255,255,255,.5)' }}>{calculateTotalCP(stats).toLocaleString()}</div>
            </div>
          </div>
          <div className="rpg-frame px-3 py-1">
            {rows.map(([l, v]) => <StatLine key={l} label={l} value={v} />)}
            {extra.map(([l, v]) => <StatLine key={l} label={l} value={v} tone="pos" />)}
          </div>
          <div data-testid="set-bonuses">
            <div className="rpg-label mb-1.5">Set bonuses</div>
            {sets.length === 0 && <div className="rpg-frame px-3 py-2 text-[.72rem] text-[var(--text-dim)]">No set pieces equipped. Elites, bosses and chests drop set gear.</div>}
            {sets.map(({ def, count }) => (
              <div key={def.id} className="rpg-frame px-3 py-2 mb-1.5">
                <div className="flex justify-between"><span className="font-bold text-[.8rem]" style={{ color: SET_COLOR_DARK, fontFamily: 'var(--font-title)' }}>{def.name}</span><span className="rpg-num text-[.75rem]">{count}/6</span></div>
                {def.bonuses.map((b) => (
                  <div key={b.pieces} className="text-[.68rem] leading-snug" style={{ color: count >= b.pieces ? SET_COLOR_DARK : 'var(--text-dim)', opacity: count >= b.pieces ? 1 : 0.65 }}>({b.pieces}) {b.text}</div>
                ))}
              </div>
            ))}
          </div>
          <div>
            <div className="rpg-label mb-1.5">This run</div>
            <div className="grid grid-cols-3 gap-2">
              {([[<Skull size={13} key="k" />, 'Kills', kills], [<Clock size={13} key="t" />, 'Time', time], [<Swords size={13} key="d" />, 'Damage', dmg]] as const).map(([ic, l, r]) => (
                <div key={l} className="rpg-frame text-center py-2">
                  <div className="rpg-label !text-[.55rem] flex items-center justify-center gap-1">{ic}{l}</div>
                  <span ref={r} className="rpg-num text-base text-[var(--gold-light)]">0</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
};
