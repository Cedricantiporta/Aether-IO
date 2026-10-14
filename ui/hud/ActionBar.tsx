import React from 'react';
import { unlockLevel } from '../../classLevels';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { SKILLS_INFO, POTION_COOLDOWN } from '../../constants';
import { world } from '../../engine/world';
import { passiveCooldowns } from '../../engine/systems/skills';
import { ActionSlot } from './ActionSlot';
import { SimpleTip } from '../components/ItemTip';
import { PaintedIcon } from '../components/SkillIcons';
import type { SkillLevels } from '../../types';
import { ACTIVE_ORDER, ACTIVE_KEYS, activeDefs, dashDef, dashKey, ULTS, abilityCd, type ActiveSlot } from '../../abilityDefs';
import { UltSlot } from './UltSlot';

/** Timed passives whose charge slows while moving (skills.ts chargeMul). */
const STILL_CHARGE = new Set(['freezeSpell', 'storm', 'orbital', 'warcry', 'inspire', 'radiant']);
const PASSIVE_KEYS = ['burning', 'freezing', 'freezeSpell', 'storm', 'thunder', 'stamp', 'orbital', 'warcry', 'inspire', 'consecrate', 'smite', 'radiant', 'graveCall', 'soulHarvest', 'boneArmor'] as const;
type PKey = typeof PASSIVE_KEYS[number];

const Sep = () => <div className="tray-sep" />;
const cdLine = (label: string, v: string) => <><span className="muted">{label}</span><span>{v}</span></>;

export const ActionBar: React.FC = () => {
  const { hero, skillLevels } = useGameStore(useShallow((s) => ({ hero: s.hero, skillLevels: s.skillLevels })));
  const costs = useGameStore(useShallow((s) => [s.getManaCost('q'), s.getManaCost('e'), s.getManaCost('s3'), s.getManaCost('s4')] as const));
  const COST_OF: Record<ActiveSlot, number> = { q: costs[0], e: costs[1], s3: costs[2], s4: costs[3] };
  const cdr = useGameStore((s) => s.stats.cooldownReduction);
  const hpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Health') ? n + (i.quantity || 1) : n), 0));
  const mpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Mana') ? n + (i.quantity || 1) : n), 0));
  const p = world.player;

  const classPassives = (PASSIVE_KEYS as readonly string[]).filter((k) => {
    const info = (SKILLS_INFO as any)[k];
    return info && info.classType === hero && info.type === 'PASSIVE';
  }) as PKey[];

  const sk = (k: keyof SkillLevels) => skillLevels[k];
  const SLOTS = ACTIVE_ORDER[hero].map((slot, i) => ({ slot, key: String(i + 1), code: ACTIVE_KEYS[i] }));
  const dDef = dashDef(hero), dLv = sk(dashKey(hero));
  const ult = ULTS[hero];
  const ulv = sk('ult');

  return (
    <div className="action-tray pe">
      <UltSlot color={hero === 'ARCHER' ? '#ffd24a' : hero === 'WIZARD' ? '#ff6a2a' : '#e9a04a'} icon={<PaintedIcon id={ult.icon} />}
        tooltip={<SimpleTip title={ult.name} sub={`Ultimate [R] · Lv ${ulv}`} color="#ffd98a" body={ult.desc}
          lines={[cdLine('Charge', 'Fill by dealing damage and killing (100%)'), cdLine(`Lv ${ulv}`, ult.per(ulv)), ...(ulv < 5 ? [cdLine(`Lv ${ulv + 1}`, ult.per(ulv + 1))] : [])]} />} />
      {SLOTS.map(({ slot, key, code }, i) => {
        const def = activeDefs(hero)[i];
        const lv = sk(slot);
        const cost = COST_OF[slot];
        const cd = abilityCd(hero, slot, lv) * (1 - cdr);
        return (
          <ActionSlot key={slot} id={slot} keyLabel={key} keyCode={code} size="4.3rem" icon={<PaintedIcon id={def.icon} />} level={lv} manaCost={cost} active={lv > 0}
            getCd={() => ({ t: p.cd[slot], max: p.cdMax[slot] })}
            tooltip={<SimpleTip title={def.name} sub={lv <= 0 ? `Locked · unlocks at Lv ${unlockLevel(hero, def.slot)}, then learn it at the Skill Trainer` : `Active [${key}] · Lv ${lv} · hold to aim, release to cast`} body={def.desc}
              lines={[cdLine('Mana', `${cost}`), cdLine('Cooldown', `${cd.toFixed(1)}s`), cdLine(`Lv ${lv}`, def.per(lv)), ...(lv < 5 ? [cdLine(`Lv ${lv + 1}`, def.per(lv + 1))] : [])]} />} />
        );
      })}
      <ActionSlot id="dash" keyLabel="SPACE" keyCode="Space" size="4.3rem" icon={<PaintedIcon id={dDef.icon} />} level={dLv}
        getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} getPips={() => ({ cur: p.dashCharges, max: p.maxDashCharges })}
        tooltip={<SimpleTip title={`Dash: ${dDef.name}`} sub={`Class dash [Space] · Lv ${dLv}${hero === 'BARBARIAN' ? '' : ' · hold to aim, release to cast'}`} body={dDef.desc} lines={[cdLine('Mana', 'Free'), cdLine('Recharge', `${p.dashCdMax.toFixed(1)}s per charge`), cdLine(`Lv ${dLv}`, dDef.per(dLv)), cdLine('Level 5', '+1 dash charge')]} />} />

      <Sep />
      {classPassives.map((k) => {
        const info = (SKILLS_INFO as any)[k];
        const lvl = sk(k as keyof SkillLevels);
        const pc = passiveCooldowns[k as PKey];
        return (
          <ActionSlot key={k} id={k} size="4.3rem" active={lvl > 0} level={lvl} icon={<PaintedIcon id={k} />}
            getCd={() => ({ t: pc?.t ?? 0, max: pc?.max ?? 0, hits: pc?.kind === 'hits' })}
            tooltip={<SimpleTip title={info.name} sub={`Passive · Lv ${lvl}${lvl <= 0 ? ' (locked)' : ''}`} body={info.description} lines={pc && pc.max > 0 ? [pc.kind === 'hits' ? cdLine('Procs every', `${pc.max} attacks`) : cdLine('Interval', `${pc.max.toFixed(1)}s`), ...(pc.kind === 'time' && STILL_CHARGE.has(k) ? [cdLine('Note', 'Charges faster while standing still')] : [])] : undefined} />} />
        );
      })}
      <Sep />
      <ActionSlot id="barrier" size="4.3rem" active={sk('barrier') > 0} level={sk('barrier')} icon={<PaintedIcon id="barrier" />}
        getCd={() => ({ t: p.shieldCd, max: p.shieldCdMax })} getPips={() => ({ cur: p.shieldCharges, max: p.maxShieldCharges })}
        tooltip={<SimpleTip title="Energy Shield" sub={`Passive · Lv ${sk('barrier')}`} body={SKILLS_INFO.barrier.description} lines={[cdLine('Recharge', `${p.shieldCdMax.toFixed(0)}s`)]} />} />
      <ActionSlot id="regen" size="4.3rem" active={sk('regen') > 0} level={sk('regen')} icon={<PaintedIcon id="regen" />}
        tooltip={<SimpleTip title="Regeneration" sub={`Passive · Lv ${sk('regen')}`} body={SKILLS_INFO.regen.description} />} />
      <Sep />
      <ActionSlot id="hp" keyLabel="Z" keyCode="KeyZ" size="4.3rem" qty={hpQty} active={true} accent="#d6252b"
        icon={<PaintedIcon id="HP" />} getCd={() => ({ t: p.hpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Health Potion" sub="Consumable [Z]" color="#b3261e" body="Restores health. Auto-drinks below 30% HP when enabled in settings." lines={[cdLine('In bag', `${hpQty}`)]} />} />
      <ActionSlot id="mp" keyLabel="X" keyCode="KeyX" size="4.3rem" qty={mpQty} active={true} accent="#2f6fe0"
        icon={<PaintedIcon id="MP" />} getCd={() => ({ t: p.mpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Mana Potion" sub="Consumable [X]" color="#1f56c4" body="Restores mana. Auto-drinks below 30% mana when enabled in settings." lines={[cdLine('In bag', `${mpQty}`)]} />} />
    </div>
  );
};
