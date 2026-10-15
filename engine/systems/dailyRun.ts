// Daily Trial run logic (see dailyChallenge.ts): floor clears, the finish (score + once-a-day reward via the store) and
// the Bloodthirst kill-heal. Called from the director; pure engine code.
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { daily, dailyMods, dailyScore, disarmDaily, DAILY_FLOORS } from '../../dailyChallenge';
import { finishRunVictory } from './director';
import { waves, disarmWaves } from '../../endlessWaves';

const END_DELAY = 3.2;   // seconds between the last kill and the summary screen

/** A daily floor was cleared. Returns true when it was the last one (no portal up). */
export function dailyFloorCleared(floor: number): boolean {
  if (!daily.on || !daily.def || floor < DAILY_FLOORS) return false;
  if (daily.result) return true;
  const st = useGameStore.getState(), run = world.run;
  const res = dailyScore(daily.def, floor, run.kills, run.time, run.damageTaken, st.stats.maxHealth);
  daily.result = res;
  const out = st.completeDaily(res);
  daily.rewarded = out.rewarded; daily.newBest = out.newBest;
  st.addNotification(`Daily Trial complete! Score ${res.score.toLocaleString()}${out.newBest ? ' (new best)' : ''}`, '#ffd24a', 'BOSS');
  events.emit('floatText', { pos: world.player.pos, text: 'TRIAL COMPLETE', color: 0xffd24a, scale: 1.4, dy: 3 });
  daily.endT = END_DELAY;
  return true;
}

/** Per-frame (from updateDirector): after the finish, bank the run and show the summary. */
export function tickDaily(dt: number): void {
  if (daily.endT < 0) return;
  daily.endT -= dt;
  if (daily.endT < 0 && useGameStore.getState().status === GameStatus.PLAYING) finishRunVictory();
}

// Bloodthirst: every kill heals a share of max HP (bypasses the weaker-healing half of the modifier)
events.on('enemyDeath', () => {
  if (!daily.on || dailyMods.killHeal <= 0) return;
  const p = world.player, st = useGameStore.getState();
  if (!p.alive || st.status !== GameStatus.PLAYING) return;
  const max = st.stats.maxHealth;
  if (p.hp < max) p.hp = Math.min(max, p.hp + max * dailyMods.killHeal);
});

// back in town (enterVillage emits runEnd): the modifiers stop applying
events.on('runEnd', () => { if (daily.on) disarmDaily(); if (waves.on) disarmWaves(); });
