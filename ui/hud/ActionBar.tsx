import React from 'react';
import { Flame, Zap, RotateCcw, Heart, Wind, ShieldCheck, Magnet, FlaskConical, Target, Orbit, Swords, Star } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { SKILLS_INFO, POTION_COOLDOWN } from '../../constants';
import { world } from '../../engine/world';
import { passiveCooldowns } from '../../engine/systems/skills';
import { ActionSlot } from './ActionSlot';
import { SimpleTip } from '../components/ItemTip';
import { SkillIcon } from '../components/ItemIcon';
import type { SkillLevels } from '../../types';

const WEAPON_ABILITY: Record<string, { name: string; desc: string; icon: React.ReactNode }> = {
  FIREBALL: { name: 'Giant Fireball', desc: 'Shoots a slow giant fireball.', icon: <Flame size={28} color="#ff9a3c" fill="rgba(255,120,30,.4)" /> },
  ARROW_RAIN: { name: 'Arrow Rain', desc: 'Fires waves of arrows.', icon: <Zap size={28} color="#9be86a" fill="rgba(140,230,90,.35)" /> },
  AXE_SPIN: { name: 'Axe Spin', desc: 'Spinning blade barrier.', icon: <RotateCcw size={28} color="#ff6a5a" /> },
};
const Q_INFO: Record<string, { name: string; desc: string; icon: React.ReactNode }> = {
  PIERCING_SHOT: { name: 'Piercing Arrow', desc: 'Massive piercing arrow.', icon: <Target size={28} color="#ffd24a" /> },
  GRAVITY_SPELL: { name: 'Gravity Well', desc: 'Summons a black hole.', icon: <Orbit size={28} color="#c58bff" /> },
  RAGE: { name: 'Rage', desc: 'Doubles attack speed for 4s.', icon: <Swords size={28} color="#ff5a4a" /> },
};
const E_INFO = {
  BARBARIAN: { name: 'War Vitality', desc: 'Regenerate 10 HP/s for 6s.', icon: <Heart size={28} color="#ff6a6a" fill="rgba(255,80,80,.4)" /> },
  WIZARD: { name: 'Earthwall', desc: 'Create a defensive barrier for 4s.', icon: <ShieldCheck size={28} color="#d9a05a" /> },
  ARCHER: { name: 'Wind Sprint', desc: '2x speed & invincible for 4s.', icon: <Wind size={28} color="#6ee7a0" /> },
} as const;

const PASSIVE_KEYS = ['burning', 'freezing', 'freezeSpell', 'storm', 'thunder', 'stamp', 'orbital'] as const;
type PKey = typeof PASSIVE_KEYS[number];

const Sep = () => <div className="tray-sep" />;
const cdLine = (label: string, v: string) => <><span className="muted">{label}</span><span>{v}</span></>;

export const ActionBar: React.FC = () => {
  const { hero, skillLevels, activeQ, weaponAbility } = useGameStore(useShallow((s) => ({
    hero: s.hero, skillLevels: s.skillLevels, activeQ: s.activeAbilityQ, weaponAbility: s.equipment.weapon?.ability,
  })));
  const costs = useGameStore(useShallow((s) => [s.getManaCost('q'), s.getManaCost('r'), s.getManaCost('e'), s.getManaCost('dash')] as const));
  const hpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.id.startsWith('potion_hp') ? n + (i.quantity || 1) : n), 0));
  const mpQty = useGameStore((s) => s.inventory.reduce((n, i) => (i.type === 'POTION' && i.id.startsWith('potion_mana') ? n + (i.quantity || 1) : n), 0));
  const [qCost, rCost, eCost, dCost] = costs;
  const p = world.player;

  const r = WEAPON_ABILITY[weaponAbility ?? ''] ?? { name: 'Weapon Ability', desc: 'Basic attack.', icon: <Zap size={28} color="#c58bff" /> };
  const q = activeQ ? Q_INFO[activeQ] : null;
  const e = E_INFO[hero];

  const classPassives = (PASSIVE_KEYS as readonly string[]).filter((k) => {
    const info = (SKILLS_INFO as any)[k];
    return info && info.classType === hero && info.type === 'PASSIVE';
  }) as PKey[];

  const sk = (k: keyof SkillLevels) => skillLevels[k];

  return (
    <div className="action-tray pe">
      <ActionSlot id="r" keyLabel="R" keyCode="KeyR" size="3.5rem" icon={r.icon} level={sk('weapon')} manaCost={rCost}
        getCd={() => ({ t: p.cd.r, max: p.cdMax.r })}
        tooltip={<SimpleTip title={r.name} sub={`Weapon ability [R] · Lv ${sk('weapon')}`} body={r.desc} lines={[cdLine('Mana', `${rCost}`), cdLine('Cooldown', `${p.cdMax.r.toFixed(1)}s`)]} />} />
      <ActionSlot id="q" keyLabel="Q" keyCode="KeyQ" size="3.5rem" active={!!q} icon={q?.icon ?? <Star size={26} color="#888" />} manaCost={qCost}
        level={activeQ === 'PIERCING_SHOT' ? sk('piercing') : activeQ === 'GRAVITY_SPELL' ? sk('gravity') : sk('rage')}
        getCd={() => ({ t: p.cd.q, max: p.cdMax.q })}
        tooltip={<SimpleTip title={q?.name ?? 'Class Active'} sub="Class active [Q]" body={q?.desc ?? 'Locked.'} lines={[cdLine('Mana', `${qCost}`), cdLine('Cooldown', `${p.cdMax.q.toFixed(1)}s`)]} />} />
      <ActionSlot id="e" keyLabel="E" keyCode="KeyE" size="3.5rem" active={sk('special') > 0} lockLabel="5 SP" icon={e.icon} level={sk('special')} manaCost={eCost}
        getCd={() => ({ t: p.cd.e, max: p.cdMax.e })}
        tooltip={<SimpleTip title={e.name} sub={`Class special [E] · Lv ${sk('special')}`} body={sk('special') > 0 ? e.desc : `${e.desc} Unlock in the Skills panel for 5 SP.`} lines={[cdLine('Mana', `${eCost}`), cdLine('Cooldown', `${p.cdMax.e.toFixed(1)}s`)]} />} />
      <ActionSlot id="dash" keyLabel="SPACE" keyCode="Space" size="3.5rem" icon={<Wind size={28} color="#6ee7a0" />} level={sk('dash')} manaCost={dCost}
        getCd={() => ({ t: p.dashCd, max: p.dashCdMax })} getPips={() => ({ cur: p.dashCharges, max: p.maxDashCharges })}
        tooltip={<SimpleTip title="Dash" sub={`Mobility [Space] · Lv ${sk('dash')}`} body="Dash in the movement direction. Invincible briefly. Level 5 grants +1 charge." lines={[cdLine('Mana', `${dCost}`), cdLine('Recharge', `${p.dashCdMax.toFixed(1)}s`)]} />} />

      <Sep />
      {classPassives.map((k) => {
        const info = (SKILLS_INFO as any)[k];
        const lvl = sk(k as keyof SkillLevels);
        const pc = passiveCooldowns[k as PKey];
        return (
          <ActionSlot key={k} id={k} size="2.9rem" active={lvl > 0} level={lvl} icon={<SkillIcon id={k} size={24} dim={lvl <= 0} />}
            getCd={() => ({ t: pc?.t ?? 0, max: pc?.max ?? 0 })}
            tooltip={<SimpleTip title={info.name} sub={`Passive · Lv ${lvl}${lvl <= 0 ? ' (locked)' : ''}`} body={info.description} lines={pc && pc.max > 0 ? [cdLine('Interval', `${pc.max.toFixed(1)}s`)] : undefined} />} />
        );
      })}
      <Sep />
      <ActionSlot id="barrier" size="2.9rem" active={sk('barrier') > 0} level={sk('barrier')} icon={<ShieldCheck size={24} color={sk('barrier') > 0 ? '#ffb347' : '#8a7a60'} />}
        getCd={() => ({ t: p.shieldCd, max: p.shieldCdMax })} getPips={() => ({ cur: p.shieldCharges, max: p.maxShieldCharges })}
        tooltip={<SimpleTip title="Energy Shield" sub={`Passive · Lv ${sk('barrier')}`} body={SKILLS_INFO.barrier.description} lines={[cdLine('Recharge', `${p.shieldCdMax.toFixed(0)}s`)]} />} />
      <ActionSlot id="regen" size="2.9rem" active={sk('regen') > 0} level={sk('regen')} icon={<SkillIcon id="regen" size={24} dim={sk('regen') <= 0} />}
        tooltip={<SimpleTip title="Regeneration" sub={`Passive · Lv ${sk('regen')}`} body={SKILLS_INFO.regen.description} />} />
      <ActionSlot id="magnet" size="2.9rem" active={sk('magnet') > 0} level={sk('magnet')} icon={<Magnet size={24} color={sk('magnet') > 0 ? '#c58bff' : '#8a7a60'} />}
        tooltip={<SimpleTip title="Looter" sub={`Passive · Lv ${sk('magnet')}`} body={SKILLS_INFO.magnet.description} />} />
      <Sep />
      <ActionSlot id="hp" keyLabel="1" keyCode="Digit1" size="3.1rem" qty={hpQty} active={true} accent="#d6252b"
        icon={<FlaskConical size={26} color="#ff5a5a" fill="rgba(255,60,60,.4)" />} getCd={() => ({ t: p.hpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Health Potion" sub="Consumable [1]" color="#b3261e" body="Restores health. Auto-drinks below 30% HP when enabled in settings." lines={[cdLine('In bag', `${hpQty}`)]} />} />
      <ActionSlot id="mp" keyLabel="2" keyCode="Digit2" size="3.1rem" qty={mpQty} active={true} accent="#2f6fe0"
        icon={<FlaskConical size={26} color="#5b9bff" fill="rgba(60,120,255,.4)" />} getCd={() => ({ t: p.mpPotCd, max: POTION_COOLDOWN })}
        tooltip={<SimpleTip title="Mana Potion" sub="Consumable [2]" color="#1f56c4" body="Restores mana. Auto-drinks below 30% mana when enabled in settings." lines={[cdLine('In bag', `${mpQty}`)]} />} />
    </div>
  );
};
