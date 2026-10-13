import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { SKILLS_INFO, POTION_COOLDOWN } from '../../constants';
import { world } from '../../engine/world';
import { passiveCooldowns } from '../../engine/systems/skills';
import { ActionSlot } from './ActionSlot';
import { SimpleTip } from '../components/ItemTip';
import { PaintedIcon } from '../components/SkillIcons';
import type { SkillLevels } from '../../types';
import { ABILITIES, ULTS, abilityCd, type ActiveSlot } from '../../abilityDefs';
import { UltSlot } from './UltSlot';

const PASSIVE_KEYS = ['burning', 'freezing', 'freezeSpell', 'storm', 'thunder', 'stamp', 'orbital'] as const;
type PKey = typeof PASSIVE_KEYS[number];

const Sep = () => <div className="tray-sep" />;
const cdLine = (label: string, v: string) => <><span className="muted">{label}</span><span>{v}</span></>;

export const ActionBar: React.FC = () => {
  const { hero, skillLevels } = useGameStore(useShallow((s) => ({ hero: s.hero, skillLevels: s.skillLevels })));
  const costs = useGameStore(useShallow((s) => [s.getManaCost('q'), s.getManaCost('e'), s.getManaCost('s3'), s.getManaCost('s4'), s.getManaCost('dash')] as const));
  const cdr = useGameStore((s) => s.stats.cooldownReduction);
  const hpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.id.startsWith('potion_hp') ? n + (i.quantity || 1) : n), 0));
  const mpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.id.startsWith('potion_mana') ? n + (i.quantity || 1) : n), 0));
  const dCost = costs[4];
  const p = world.player;

  const classPassives = (PASSIVE_KEYS as readonly string[]).filter((k) => {
    const info = (SKILLS_INFO as any)[k];
    return info && info.classType === hero && info.type === 'PASSIVE';
  }) as PKey[];

  const sk = (k: keyof SkillLevels) => skillLevels[k];
  const SLOTS: { slot: ActiveSlot; key: string; code: string }[] = [
    { slot: 'q', key: 'Q', code: 'KeyQ' }, { slot: 'e', key: 'E', code: 'KeyE' }, { slot: 's3', key: '3', code: 'Digit3' }, { slot: 's4', key: '4', code: 'Digit4' },
  ];
  const ult = ULTS[hero];
  const ulv = sk('ult');

  return (
    <div className="action-tray pe">
      {SLOTS.map(({ slot, key, code }, i) => {
        const def = ABILITIES[hero].find((a) => a.slot === slot)!;
        const lv = sk(slot);
        const cost = costs[i];
        const cd = abilityCd(hero, slot, lv) * (1 - cdr);
        return (
          <ActionSlot key={slot} id={slot} keyLabel={key} keyCode={code} size="4.3rem" icon={<PaintedIcon id={def.icon} />} level={lv} manaCost={cost}
            getCd={() => ({ t: p.cd[slot], max: p.cdMax[slot] })}
            tooltip={<SimpleTip title={def.name} sub={`Active [${key}] · Lv ${lv}`} body={def.desc}
              lines={[cdLine('Mana', `${cost}`), cdLine('Cooldown', `${cd.toFixed(1)}s`), cdLine(`Lv ${lv}`, def.per(lv)), ...(lv < 5 ? [cdLine(`Lv ${lv + 1}`, def.per(lv + 1))] : [])]} />} />
        );
      })}
      <UltSlot color={hero === 'ARCHER' ? '#ffd24a' : hero === 'WIZARD' ? '#ff6a2a' : '#e9a04a'} icon={<PaintedIcon id={ult.icon} />}
        tooltip={<SimpleTip title={ult.name} sub={`Ultimate [R] · Lv ${ulv}`} color="#ffd98a" body={ult.desc}
          lines={[cdLine('Charge', 'Fill by dealing damage and killing (100%)'), cdLine(`Lv ${ulv}`, ult.per(ulv)), ...(ulv < 5 ? [cdLine(`Lv ${ulv + 1}`, ult.per(ulv + 1))] : [])]} />} />
      <ActionSlot id="dash" keyLabel="SPACE" keyCode="Space" size="4.3rem" icon={<PaintedIcon id="DASH" />} level={sk('dash')} manaCost={dCost}
        getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} getPips={() => ({ cur: p.dashCharges, max: p.maxDashCharges })}
        tooltip={<SimpleTip title="Dash" sub={`Mobility [Space] · Lv ${sk('dash')}`} body="Dash in the movement direction. Costs no mana. Invincible briefly. Level 5 grants +1 charge." lines={[cdLine('Mana', 'Free'), cdLine('Recharge', `${p.dashCdMax.toFixed(1)}s`)]} />} />

      <Sep />
      {classPassives.map((k) => {
        const info = (SKILLS_INFO as any)[k];
        const lvl = sk(k as keyof SkillLevels);
        const pc = passiveCooldowns[k as PKey];
        return (
          <ActionSlot key={k} id={k} size="4.3rem" active={lvl > 0} level={lvl} icon={<PaintedIcon id={k} />}
            getCd={() => ({ t: pc?.t ?? 0, max: pc?.max ?? 0, hits: pc?.kind === 'hits' })}
            tooltip={<SimpleTip title={info.name} sub={`Passive · Lv ${lvl}${lvl <= 0 ? ' (locked)' : ''}`} body={info.description} lines={pc && pc.max > 0 ? [pc.kind === 'hits' ? cdLine('Procs every', `${pc.max} attacks`) : cdLine('Interval', `${pc.max.toFixed(1)}s`), ...(pc.kind === 'time' ? [cdLine('Note', 'Charges faster while standing still')] : [])] : undefined} />} />
        );
      })}
      <Sep />
      <ActionSlot id="barrier" size="4.3rem" active={sk('barrier') > 0} level={sk('barrier')} icon={<PaintedIcon id="barrier" />}
        getCd={() => ({ t: p.shieldCd, max: p.shieldCdMax })} getPips={() => ({ cur: p.shieldCharges, max: p.maxShieldCharges })}
        tooltip={<SimpleTip title="Energy Shield" sub={`Passive · Lv ${sk('barrier')}`} body={SKILLS_INFO.barrier.description} lines={[cdLine('Recharge', `${p.shieldCdMax.toFixed(0)}s`)]} />} />
      <ActionSlot id="regen" size="4.3rem" active={sk('regen') > 0} level={sk('regen')} icon={<PaintedIcon id="regen" />}
        tooltip={<SimpleTip title="Regeneration" sub={`Passive · Lv ${sk('regen')}`} body={SKILLS_INFO.regen.description} />} />
      <ActionSlot id="magnet" size="4.3rem" active={sk('magnet') > 0} level={sk('magnet')} icon={<PaintedIcon id="magnet" />}
        tooltip={<SimpleTip title="Looter" sub={`Passive · Lv ${sk('magnet')}`} body={SKILLS_INFO.magnet.description} />} />
      <Sep />
      <ActionSlot id="hp" keyLabel="1" keyCode="Digit1" size="4.3rem" qty={hpQty} active={true} accent="#d6252b"
        icon={<PaintedIcon id="HP" />} getCd={() => ({ t: p.hpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Health Potion" sub="Consumable [1]" color="#b3261e" body="Restores health. Auto-drinks below 30% HP when enabled in settings." lines={[cdLine('In bag', `${hpQty}`)]} />} />
      <ActionSlot id="mp" keyLabel="2" keyCode="Digit2" size="4.3rem" qty={mpQty} active={true} accent="#2f6fe0"
        icon={<PaintedIcon id="MP" />} getCd={() => ({ t: p.mpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Mana Potion" sub="Consumable [2]" color="#1f56c4" body="Restores mana. Auto-drinks below 30% mana when enabled in settings." lines={[cdLine('In bag', `${mpQty}`)]} />} />
    </div>
  );
};
