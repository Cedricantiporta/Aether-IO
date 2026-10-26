// Shared "stat effect" accumulator used by affixes, item sets and talents.
// Pure (types only) so constants / store / UI can all import it.
import type { PlayerStats } from './types';

export interface StatFx { add?: Partial<PlayerStats>; mul?: Partial<PlayerStats> }
export interface FxAcc { add: Partial<PlayerStats>; mul: Partial<PlayerStats> }
export const newAcc = (): FxAcc => ({ add: {}, mul: {} });

/** Adds `fx` x `n` into the accumulator. echoEvery is a threshold, so the lowest non-zero value wins. */
export function accumulate(acc: FxAcc, fx: StatFx | undefined, n = 1): void {
  if (!fx || n === 0) return;
  if (fx.add) for (const k of Object.keys(fx.add) as (keyof PlayerStats)[]) {
    const v = fx.add[k]!;
    if (k === 'echoEvery') { const cur = acc.add[k]; acc.add[k] = cur ? Math.min(cur, v) : v; }
    else acc.add[k] = (acc.add[k] ?? 0) + v * n;
  }
  if (fx.mul) for (const k of Object.keys(fx.mul) as (keyof PlayerStats)[]) acc.mul[k] = (acc.mul[k] ?? 0) + fx.mul[k]! * n;
}

/** Applies an accumulator on top of final stats. */
export function applyAcc(final: PlayerStats, acc: FxAcc): void {
  for (const k of Object.keys(acc.add) as (keyof PlayerStats)[]) {
    const v = acc.add[k]!;
    if (k === 'echoEvery') final[k] = final[k] ? Math.min(final[k], v) : v;
    else if (k === 'cooldownReduction') final[k] = Math.min(0.75, final[k] + v);
    else final[k] += v;
  }
  for (const k of Object.keys(acc.mul) as (keyof PlayerStats)[]) final[k] *= 1 + acc.mul[k]!;
}

/** Human-readable "+x" for a stat effect value. */
const PCT = new Set<string>(['critRate', 'critDamage', 'dodge', 'cooldownReduction', 'skillDamage', 'lifeSteal', 'minionDmg', 'minionHaste', 'goldFind', 'xpBonus', 'onHitBurnChance', 'onHitSlowChance', 'lowHpHaste', 'dmgReduce', 'manaCostCut', 'berserk', 'stompPower', 'galeWidth', 'backstab', 'axeSize', 'resPoison', 'resBurn', 'resFrost', 'resProj']);
export const STAT_NAME: Record<keyof PlayerStats, string> = {
  maxHealth: 'Max Health', maxMana: 'Max Mana', regen: 'HP Regen', manaRegen: 'Mana Regen', moveSpeed: 'Move Speed', damage: 'Damage', fireRate: 'Attack Speed',
  projectileSpeed: 'Projectile Speed', multishot: 'Projectiles', spread: 'Spread', dashCooldown: 'Dash Cooldown', cooldownReduction: 'Cooldown Reduction', magnetRadius: 'Pickup Range',
  critRate: 'Crit Rate', critDamage: 'Crit Damage', defense: 'Defense', skillDamage: 'Skill Damage', knockback: 'Knockback', dodge: 'Dodge',
  lifeSteal: 'Life Steal', minionDmg: 'Minion Damage', minionLife: 'Minion HP', minionCount: 'Extra Skeletons', minionHaste: 'Minion Attack Speed', thorns: 'Thorns', goldFind: 'Gold Find', xpBonus: 'XP Gain', pierceBonus: 'Pierce', attackRange: 'Attack Range', onHitBurnChance: 'Burn on Hit', onHitSlowChance: 'Slow on Hit',
  echoEvery: 'Echo', hawkBonus: 'Arrow Storm Duration', galeWidth: 'Gale Arrow Width', orbBonus: 'Storm Orbs', procHaste: 'Proc Haste', thunderChain: 'Chain Targets', stormBonus: 'Arcane Shield Duration', avatarBonus: 'Divine Avatar Duration', stormTwin: 'Arcane Shield +25%',
  blizzardRadius: 'Blizzard Radius', blizzFreeze: 'Blizzard Freeze', stompRadius: 'Stomp Radius', stompStun: 'Stomp Stun', stompPower: 'Axe Storm Damage',
  dashCharges: 'Dash Charges', lowHpHaste: 'Attack Speed (low HP)', rageBonus: 'Rage Duration', dmgReduce: 'Damage Reduction', manaCostCut: 'Mana Cost Reduction', berserk: 'Damage (low HP)', stunBonus: 'Stun Duration', burnStacks: 'Max Burn Stacks', backstab: 'Backstab Damage', axeCount: 'Axe Storm Axes', axeBounce: 'Axe Storm Ricochets', axeSize: 'Axe Storm Size',
  resPoison: 'Poison Resistance', resBurn: 'Burn Resistance', resFrost: 'Frost Resistance', resProj: 'Projectile Resistance',
};
export function fmtFx(k: keyof PlayerStats, v: number, mul = false): string {
  const sign = v < 0 ? '-' : '+';
  const a = Math.abs(v);
  if (k === 'echoEvery') return `every ${a} attacks fires twice`;
  if (k === 'stormTwin') return 'on';
  if (mul || PCT.has(k)) return `${sign}${parseFloat((a * 100).toFixed(1))}%`;
  if (k === 'regen' || k === 'manaRegen') return `${sign}${parseFloat(a.toFixed(1))}/s`;
  if (k === 'hawkBonus' || k === 'avatarBonus' || k === 'stormBonus' || k === 'blizzFreeze' || k === 'stompStun' || k === 'rageBonus' || k === 'stunBonus') return `${sign}${parseFloat(a.toFixed(1))}s`;
  return `${sign}${parseFloat(a.toFixed(2))}`;
}
export function describeFx(fx: StatFx): string {
  const out: string[] = [];
  if (fx.add) for (const k of Object.keys(fx.add) as (keyof PlayerStats)[]) {
    const v = fx.add[k]!;
    out.push(k === 'echoEvery' || k === 'stormTwin' ? `${STAT_NAME[k]}: ${fmtFx(k, v)}` : `${fmtFx(k, v)} ${STAT_NAME[k]}`);
  }
  if (fx.mul) for (const k of Object.keys(fx.mul) as (keyof PlayerStats)[]) out.push(`${fmtFx(k, fx.mul[k]!, true)} ${STAT_NAME[k]}`);
  return out.join(', ');
}
