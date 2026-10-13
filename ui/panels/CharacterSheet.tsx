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

export const CharacterSheet: React.FC = () => {
  const { hero, level, stats, close, shiftRight } = useGameStore(useShallow((s) => ({
    hero: s.hero, level: s.level, stats: s.stats, close: s.toggleCharacterSheet, shiftRight: s.isShopOpen,
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
