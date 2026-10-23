import React from 'react';
import { dashModDef } from '../../dashMods';
import { unlockLevel, DASH_UNLOCK_LV, ULT_UNLOCK_LV } from '../../classLevels';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { potionCooldown } from '../../engine/runCards';
import { world } from '../../engine/world';
import { ActionSlot } from './ActionSlot';
import { SimpleTip } from '../components/ItemTip';
import { tip } from '../components/Tooltip';
import { PaintedIcon } from '../components/SkillIcons';
import type { SkillLevels } from '../../types';
import { ACTIVE_ORDER, ACTIVE_KEYS, activeDefs, dashDef, dashKey, ULTS, abilityCd, type ActiveSlot } from '../../abilityDefs';
import { UltSlot } from './UltSlot';

const cdLine = (label: string, v: string) => <><span className="muted">{label}</span><span>{v}</span></>;

/** Bone Ward has nothing to shield without summons (owner: disabled then). */
const noSummons = (): boolean => { for (const m of world.minions) if (m.active) return false; return true; };
export const ActionBar: React.FC = () => {
  const { hero, skillLevels, heroLv } = useGameStore(useShallow((s) => ({ hero: s.hero, skillLevels: s.skillLevels, heroLv: s.level })));
  const dashOpen = heroLv >= DASH_UNLOCK_LV;   // the dash unlocks at class level DASH_UNLOCK_LV (6)
  const costs = useGameStore(useShallow((s) => [s.getManaCost('q'), s.getManaCost('e'), s.getManaCost('s3'), s.getManaCost('s4')] as const));
  const COST_OF: Record<ActiveSlot, number> = { q: costs[0], e: costs[1], s3: costs[2], s4: costs[3] };
  const cdr = useGameStore((s) => s.stats.cooldownReduction);
  const hpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Health') ? n + (i.quantity || 1) : n), 0));
  const mpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.name.includes('Mana') ? n + (i.quantity || 1) : n), 0));
  const p = world.player;

  const sk = (k: keyof SkillLevels) => skillLevels[k];
  const SLOTS = ACTIVE_ORDER[hero].map((slot, i) => ({ slot, key: String(i + 1), code: ACTIVE_KEYS[i] }));
  const dDef = dashDef(hero), dLv = sk(dashKey(hero));
  const dMod = dashModDef(useGameStore((st) => st.dashMods[st.hero]));   // the chosen Dash Charm (named on the dash tooltip)
  const ult = ULTS[hero];
  const ulv = sk('ult');

  return (
    <div className="action-tray pe">
      <div className="auto-wrap"><AutoPill id="ult" />
      <UltSlot color={hero === 'ARCHER' ? '#ffd24a' : hero === 'WIZARD' ? '#ff6a2a' : '#e9a04a'} icon={<PaintedIcon id={ult.icon} />} locked={ulv <= 0 ? ULT_UNLOCK_LV : 0}
        tooltip={<SimpleTip title={ult.name} sub={ulv <= 0 ? `Locked · unlocks at Lv ${ULT_UNLOCK_LV}` : `Ultimate [R] · Lv ${ulv}`} color="#ffd98a" body={ult.desc}
          lines={[cdLine('Charge', 'Fill by dealing damage and killing (100%)'), cdLine(`Lv ${ulv}`, ult.per(ulv)), ...(ulv < 5 ? [cdLine(`Lv ${ulv + 1}`, ult.per(ulv + 1))] : [])]} />} />
      </div>
      {SLOTS.map(({ slot, key, code }, i) => {
        const def = activeDefs(hero)[i];
        const lv = sk(slot);
        const cost = COST_OF[slot];
        const cd = abilityCd(hero, slot, lv) * (1 - cdr);
        return (
          <div key={slot} className="auto-wrap"><AutoPill id={slot} />
          <ActionSlot id={slot} keyLabel={key} keyCode={code} size="4.3rem" icon={<PaintedIcon id={def.icon} />} level={lv} manaCost={cost} active={lv > 0}
            blocked={hero === 'NECROMANCER' && slot === 's3' ? noSummons : undefined}
            getCd={() => ({ t: p.cd[slot], max: p.cdMax[slot] })}
            tooltip={<SimpleTip title={def.name} sub={lv <= 0 ? `Locked · unlocks at Lv ${unlockLevel(hero, def.slot)}, then learn it at the Skill Trainer` : `Active [${key}] · Lv ${lv} · hold to aim, release to cast`} body={def.desc}
              lines={[cdLine('Mana', `${cost}`), cdLine('Cooldown', `${cd.toFixed(1)}s`), cdLine(`Lv ${lv}`, def.per(lv)), ...(lv < 5 ? [cdLine(`Lv ${lv + 1}`, def.per(lv + 1))] : [])]} />} />
          </div>
        );
      })}
      <ActionSlot id="dash" keyLabel="SPACE" keyCode="Space" size="4.3rem" icon={<PaintedIcon id={dDef.icon} />} level={dashOpen ? dLv : 0} active={dashOpen}
        getCd={() => (world.village.ride.on ? { t: world.village.ride.dashCd, max: 6 } : { t: p.dashCd, max: p.dashCdMax })}
        tooltip={<SimpleTip title={`Dash: ${dDef.name}`} sub={dashOpen ? `Class dash [Space] · Lv ${dLv}${hero === 'BARBARIAN' ? '' : ' · hold to aim, release to cast'}` : `Locked · unlocks at Lv ${DASH_UNLOCK_LV}`} body={dDef.desc} lines={[cdLine('Mana', 'Free'), cdLine('Recharge', `${p.dashCdMax.toFixed(1)}s`), cdLine(`Lv ${dLv}`, dDef.per(dLv)), cdLine('Charm', dMod ? dMod.name : 'None (Skill Trainer)')]} />} />

      <ActionSlot id="hp" keyLabel="Z" keyCode="KeyZ" size="3.7rem" round qty={hpQty} active={true} accent="#d6252b"
        icon={<PaintedIcon id="HP" />} getCd={() => ({ t: p.hpPotCd, max: potionCooldown() })}
        tooltip={<SimpleTip title="Health Potion" sub="Consumable [Z]" color="#b3261e" body="Restores health. Auto-drinks below 30% HP when enabled in settings." lines={[cdLine('In bag', `${hpQty}`)]} />} />
      <ActionSlot id="mp" keyLabel="X" keyCode="KeyX" size="3.7rem" round qty={mpQty} active={true} accent="#2f6fe0"
        icon={<PaintedIcon id="MP" />} getCd={() => ({ t: p.mpPotCd, max: potionCooldown() })}
        tooltip={<SimpleTip title="Mana Potion" sub="Consumable [X]" color="#1f56c4" body="Restores mana. Auto-drinks below 30% mana when enabled in settings." lines={[cdLine('In bag', `${mpQty}`)]} />} />
    </div>
  );
};

/** (owner) Small AUTO pill above a skill: click it to keep the auto bots (AUTO battle / Auto skills) from casting this one. */
const AutoPill: React.FC<{ id: string }> = ({ id }) => {
  const off = useGameStore((st) => !!st.settings.autoOff?.includes(id));
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const st = useGameStore.getState(), cur = st.settings.autoOff ?? [];
    st.updateSettings({ autoOff: off ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  return (
    <button className={`auto-pill${off ? ' off' : ''}`} data-testid={`auto-${id}`} onClick={toggle} onPointerDown={(e) => e.stopPropagation()}
      {...tip(<SimpleTip title={off ? 'Auto: off' : 'Auto: on'} sub={off ? 'AUTO will not cast this skill. Click to let it.' : 'AUTO casts this skill. Click to keep it manual.'} />)}>AUTO</button>
  );
};
