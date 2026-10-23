// Run Upgrades: every reward card picked this run, the stat totals they add up to, and the abilities they grant.
// Opens with Tab / the HUD button / the pause menu; Esc closes (ui/uiStore closeTopOverlay). Re-renders only when a card is picked.
import React, { useMemo } from 'react';
import { useGameStore, HP_INFLATE, STAT_CAPS } from '../../store';
import { useUiStore } from '../uiStore';
import { Modal } from '../components/Modal';
import { Layers } from '../components/GoldIcons';
import { RARITY_COLOR, RARITY_LIGHT, RARITY_NAME } from '../theme';
import { ARCANA_NUMERAL, DASH_CARD_MAX, DEFIANCE_MAX, POTION_CD_CAP } from '../../engine/runCards';
import type { Upgrade, UpgradeType } from '../../types';

const ABILITY_TYPES = new Set<UpgradeType>(['SPECIAL', 'DEATH_DEFIANCE', 'AEGIS', 'RESTORE', 'ULT_FILL']);
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

interface Line { key: string; text: string; note?: string }

/** Sums the picked cards with the same formulas / caps the game applies (store.selectUpgrade, calculateStats STAT_CAPS, runCards). */
export function runTotals(picks: Upgrade[]): Line[] {
  const add: Partial<Record<UpgradeType, number>> = {};
  const mul: Partial<Record<UpgradeType, number>> = {};   // damage / speed / attack speed / knockback compound: base += base * v
  const n: Partial<Record<UpgradeType, number>> = {};
  for (const u of picks) {
    n[u.type] = (n[u.type] ?? 0) + 1;
    add[u.type] = (add[u.type] ?? 0) + u.value;
    mul[u.type] = (mul[u.type] ?? 1) * (1 + u.value);
  }
  const out: Line[] = [];
  const has = (t: UpgradeType) => (n[t] ?? 0) > 0;
  const m = (t: UpgradeType, label: string) => { if (has(t)) out.push({ key: t, text: `+${pct((mul[t] ?? 1) - 1)} ${label}` }); };
  const a = (t: UpgradeType, label: string, fmt: (v: number) => string = (v) => `+${pct(v)}`) => { if (has(t)) out.push({ key: t, text: `${fmt(add[t] ?? 0)} ${label}` }); };
  const capped = (t: UpgradeType, label: string, cap: number, sign: '+' | '-', note: string) => {
    if (!has(t)) return;
    const v = add[t] ?? 0, over = v > cap + 1e-9;
    out.push({ key: t, text: `${sign}${pct(Math.min(cap, v))} ${label}`, note: over ? `${note} cap ${pct(cap)}` : undefined });
  };
  m('DAMAGE', 'damage');
  if (has('HEALTH')) out.push({ key: 'HEALTH', text: `+${Math.round((add.HEALTH ?? 0) * HP_INFLATE)} max HP` });
  a('DEFENSE', 'defense', (v) => `+${v}`);
  m('FIRE_RATE', 'attack speed');
  m('SPEED', 'move speed');
  a('CRIT_RATE', 'crit chance');
  a('CRIT_DAMAGE', 'crit damage');
  capped('COOLDOWN', 'skill CD', STAT_CAPS.cooldownReduction, '-', 'total');
  m('KNOCKBACK', 'knockback');
  capped('LIFESTEAL', 'lifesteal', STAT_CAPS.lifeSteal, '+', 'total');
  capped('DMG_REDUCE', 'damage taken', 0.8, '-', 'total');
  a('MAX_MANA', 'max mana', (v) => `+${v}`);
  a('MANA_REGEN', 'mana / s', (v) => `+${Math.round(v * 10) / 10}`);
  if (has('DASH_COOLDOWN')) {
    const st = Math.min(DASH_CARD_MAX, n.DASH_COOLDOWN ?? 0);
    out.push({ key: 'DASH_COOLDOWN', text: `Dash CD -${st * 10}%`, note: st >= DASH_CARD_MAX ? `max ${DASH_CARD_MAX * 10}%` : undefined });
  }
  if (has('POTION_CD')) {
    const v = add.POTION_CD ?? 0;
    out.push({ key: 'POTION_CD', text: `Potion CD -${pct(Math.min(POTION_CD_CAP, v))}`, note: v >= POTION_CD_CAP - 1e-6 ? `max ${pct(POTION_CD_CAP)}` : undefined });
  }
  if (has('DEATH_DEFIANCE')) out.push({ key: 'DEATH_DEFIANCE', text: `Death Defiance x${Math.min(DEFIANCE_MAX, n.DEATH_DEFIANCE ?? 0)}`, note: (n.DEATH_DEFIANCE ?? 0) >= DEFIANCE_MAX ? 'max' : undefined });
  if (has('AEGIS')) out.push({ key: 'AEGIS', text: `Aegis x${n.AEGIS}` });
  return out;
}

interface Group { key: string; card: Upgrade; count: number }
function groupPicks(picks: Upgrade[]): Group[] {
  const map = new Map<string, Group>();
  for (const u of picks) {
    const key = `${u.type}|${u.special ?? ''}|${u.tier ?? u.rarity}`;
    const g = map.get(key);
    if (g) g.count++; else map.set(key, { key, card: u, count: 1 });
  }
  return [...map.values()];
}

const CardRow: React.FC<{ g: Group }> = ({ g }) => {
  const c = g.card, col = RARITY_COLOR[c.rarity];
  const numeral = ARCANA_NUMERAL[c.special ?? c.type];
  return (
    <div className="rpg-frame flex items-start gap-2 p-2" style={{ border: 0, boxShadow: `0 0 14px ${col}44` }} data-testid="run-card">
      <div className="grid place-items-center shrink-0 rpg-num" style={{ width: '2.4rem', height: '2.4rem', border: 0, borderRadius: 6, background: `${col}33`, color: RARITY_LIGHT[c.rarity], fontSize: numeral && numeral.length > 3 ? '.6rem' : '.8rem' }}>{numeral ?? '*'}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <b style={{ color: RARITY_LIGHT[c.rarity] }}>{c.name}</b>
          {g.count > 1 && <span className="rpg-num" style={{ color: '#f0dca8' }}>x{g.count}</span>}
          <span className="rpg-label ml-auto !text-[.55rem]" style={{ color: col }}>{RARITY_NAME[c.rarity]}</span>
        </div>
        <div className="text-xs leading-snug" style={{ color: 'var(--text)' }}>{c.description}</div>
      </div>
    </div>
  );
};

export const RunUpgradesDialog: React.FC = () => {
  const open = useUiStore((s) => s.runUpgradesOpen);
  const close = useUiStore((s) => s.openRunUpgrades);
  const picks = useGameStore((s) => s.runPicks);
  const totals = useMemo(() => runTotals(picks), [picks]);
  const { stats, abilities } = useMemo(() => {
    const all = groupPicks(picks);
    return { stats: all.filter((g) => !ABILITY_TYPES.has(g.card.type)), abilities: all.filter((g) => ABILITY_TYPES.has(g.card.type)) };
  }, [picks]);
  return (
    <Modal open={open} onClose={() => close(false)} title="Run Upgrades" icon={<Layers size={20} />} width="34rem" z={250} full>
      {picks.length === 0 ? (
        <div className="text-center py-8 rpg-label" data-testid="run-upgrades-empty">No upgrades yet</div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="run-upgrades">
          <section>
            <div className="rpg-label mb-1">Totals ({picks.length} card{picks.length === 1 ? '' : 's'})</div>
            <div className="rpg-frame p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1" data-testid="run-totals">
              {totals.map((l) => (
                <div key={l.key} className="flex items-baseline gap-2 text-sm" style={{ color: '#f0dca8' }}>
                  <span>{l.text}</span>{l.note && <em className="text-[.6rem] opacity-70 not-italic">({l.note})</em>}
                </div>
              ))}
            </div>
          </section>
          {stats.length > 0 && (
            <section>
              <div className="rpg-label mb-1">Cards</div>
              <div className="flex flex-col gap-2">{stats.map((g) => <CardRow key={g.key} g={g} />)}</div>
            </section>
          )}
          {abilities.length > 0 && (
            <section>
              <div className="rpg-label mb-1">Abilities</div>
              <div className="flex flex-col gap-2" data-testid="run-abilities">{abilities.map((g) => <CardRow key={g.key} g={g} />)}</div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};
