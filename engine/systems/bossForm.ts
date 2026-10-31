// The boss FORM SWITCH (owner 2026-10-31), data in bossForms.ts. When a transforming boss's first form runs out of HP, combat.damageEnemy
// asks `hooks.bossFormDeath`: instead of killing it, this file starts a ~2.6 s beat on the SAME enemy (so director.bossId, the bar owner,
// the arena and the co-op id stay valid; nothing counts as a kill, no loot / bossDefeated / ending):
//   0 .. SWAP_T   form 1 dies: death bursts, the body collapses and glows, a floor warning shows the nova, the boss is untouchable
//   SWAP_T        it RESPAWNS as form 2: bigger, new HP stack, speed / power, fresh per-boss counters, shockwave + damaging ring + floating text
//   .. BEAT_T     it rises (render scales it up); then the fight goes on
// The last form dies the normal way (enemies.onEnemyDeath -> killEnemy -> director.onBossCleared).
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { useGameStore } from '../../store';
import { BOSS_SKILL_MUL, isBossAdd } from '../enemyDefs';
import { hooks } from './hooks';
import { bf, FORMS, BEAT_T, SWAP_T, type BossFormDef } from './bossForms';
import { bp } from './bossPhaseState';
import { S as B2 } from './bosses2';
import { bossMechDied } from './bossMech';
import { clearDecoys } from './bossSpecials';
import { clearVoidFx, spawnRune } from './voidFx';
import { BT, WAVE_VOID, WAVE_FIRE, waves, spawnWave } from './bossFx';
import { spawnTelegraphCircle } from './enemies';
import { Vector3 } from 'three';

const tv = new Vector3();
const notify = (msg: string, color: string): void => useGameStore.getState().addNotification(msg, color, 'BOSS');
const pwr = (e: Enemy): number => Math.max(e.projectileDamage, e.contactDamage * 0.8, 8) * BOSS_SKILL_MUL;

/** combat.damageEnemy: the boss's HP hit 0. True = it did not die (form switch started or running). */
hooks.bossFormDeath = (e: Enemy): boolean => {
  if (bf.beat[e.id] > 0) { e.hp = Math.min(e.hp, 0); return true; }   // (nothing can finish it mid-beat; it is warded anyway)
  const def = FORMS[e.kind];
  if (!def || !e.boss || e.id !== B2.id || bf.form[e.id] !== 0) return false;
  startBeat(e, def);
  return true;
};

function startBeat(e: Enemy, def: BossFormDef): void {
  hooks.onStagger(e);                         // cancels the running skill (its end() cleanup), back to CHASE, standing still
  e.hp = 0; e.shield = 0; e.vel.set(0, 0, 0); e.knock.set(0, 0, 0);
  bf.beat[e.id] = BEAT_T;
  bp.xformId = e.id;                          // untouchable (bossWarded) for the whole beat
  if (bp.on && bp.id === e.id) bp.on = false;
  // what the first form leaves behind: summons poof, illusions / holes / pending telegraphs and waves vanish (the void stage / arena stays)
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.active || !isBossAdd(a.kind) || a.state === 'DYING') continue;
    a.state = 'DYING'; a.stateT = 0; a.deathT = 0; a.hp = 0; a.vel.set(0, 0, 0);
    events.emit('enemyDeath', { pos: a.pos, kind: a.kind, elite: false, boss: false, scale: a.scale, poof: true });
  }
  if (e.kind === 'BOSS_VOID') { clearDecoys(); clearVoidFx(); }
  for (const w of waves) w.active = false;
  const zs = world.zones;
  for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.active && z.hostile && z.trick >= BT.VISUAL) z.active = false; }
  for (const p of world.enemyProjectiles) if (p.active) p.active = false;
  // death burst + warning
  events.emit('explosion', { pos: e.pos.clone(), radius: e.radius * 3, color: def.burst });
  events.emit('shake', { amount: 1.0 });
  events.emit('floatText', { pos: e.pos, text: def.fallText, color: def.burst, scale: 1.4, dy: 4.5 });
  notify(def.fallNote, '#' + def.burst.toString(16).padStart(6, '0'));
  const z = spawnTelegraphCircle(e.pos.x, e.pos.z, 12, SWAP_T, 0, def.aura);   // get clear of the coming nova (the visual only; the wave resolves the hit)
  if (z) z.trick = BT.VISUAL;
  spawnRune(e.pos.x, e.pos.z, 6, BEAT_T);
  world.boss.ability = e.kind === 'BOSS_VOID' ? 'Final Form' : 'Burning Form'; world.boss.abilityT = BEAT_T;
}

/** Per-frame while a beat runs (enemies.updateEnemies calls it before any AI). */
export function tickFormBeat(e: Enemy, dt: number): void {
  const def = FORMS[e.kind];
  if (!def) { bf.beat[e.id] = 0; return; }
  const was = BEAT_T - bf.beat[e.id];
  bf.beat[e.id] = Math.max(0, bf.beat[e.id] - dt);
  const now = BEAT_T - bf.beat[e.id];
  e.vel.set(0, 0, 0);
  if (bf.form[e.id] === 0) {
    e.hp = 0;
    if (Math.random() < dt * 7) events.emit('explosion', { pos: tv.set(e.pos.x + (Math.random() - 0.5) * e.radius * 2, 1 + Math.random() * 4, e.pos.z + (Math.random() - 0.5) * e.radius * 2).clone(), radius: 1.4, color: def.burst });
    if (was < SWAP_T && now >= SWAP_T) swapForm(e, def);
  } else if (Math.random() < dt * 8) events.emit('explosion', { pos: tv.set(e.pos.x + (Math.random() - 0.5) * e.radius * 2, 0.5 + Math.random() * 5, e.pos.z + (Math.random() - 0.5) * e.radius * 2).clone(), radius: 1.2, color: def.aura });
  if (bf.beat[e.id] <= 0) {   // the new form takes the field
    bp.xformId = -1;
    e.attackCd = 1.2; e.stateT = 0;
    if (e.kind === 'BOSS_VOID') B2.vformT = 0; else B2.formT = 0;
  }
}

/** The respawn: form 2 with its own size, HP stack, stats and fresh per-boss counters. */
function swapForm(e: Enemy, def: BossFormDef): void {
  bf.form[e.id] = 1;
  e.radius = bf.r0[e.id] * def.s2; e.scale = bf.s0[e.id] * def.s2;
  const m2 = world.boss.final ? def.finalHp[1] : def.hp[1];
  e.maxHp = Math.round(e.maxHp / Math.max(0.01, bf.mul1[e.id]) * m2); e.hp = e.maxHp;
  e.speed *= def.speed; e.projectileDamage *= def.dmg; e.contactDamage *= def.dmg;
  e.phase = 0; e.shield = 0; e.staggerT = 0; e.stagger = 0; e.stunT = 0; e.freezeT = 0; e.slowT = 0; e.burnT = 0; e.poisonT = 0; e.fearT = 0; e.chillStacks = 0; e.chillT = 0; e.frostT = 0;
  const hud = world.boss;
  hud.phase = 0; hud.stage = 2; hud.stagger = 0; hud.staggered = false; hud.shield = 0; hud.shieldMax = 0; hud.hp = e.hp; hud.maxHp = e.maxHp;
  // per-boss counters: the invulnerable-phase thresholds / owner (bossMech + bossPhases) and the boss's own skill state restart in form 2
  bossMechDied(e);
  bp.xformId = e.id;
  B2.phase = 0; B2.cycle = 0; B2.guardT = 0;
  if (e.kind === 'BOSS_VOID') { B2.vform = 2; B2.vformT = 0; }
  else { B2.enraged = true; B2.cleaveCd = 0; B2.formT = 0; }
  const fire = e.kind !== 'BOSS_VOID';
  spawnWave(e.pos.x, e.pos.z, fire ? 16 : 18, fire ? 22 : 26, fire ? 1.4 : 1.8, pwr(e) * (fire ? 0.8 : 1.1), fire ? WAVE_FIRE : WAVE_VOID, def.aura, e.radius);
  events.emit('shockwave', { pos: e.pos.clone(), radius: 24, color: def.auraAlt });
  events.emit('shockwave', { pos: e.pos.clone(), radius: 14, color: def.aura });
  events.emit('shake', { amount: 1.2 });
  events.emit('floatText', { pos: e.pos, text: def.ascendText, color: def.auraAlt, scale: 1.7, dy: 5.5 });
  notify(def.ascendNote, '#' + def.aura.toString(16).padStart(6, '0'));
}
