// Boss Trial run logic (see bossTrials.ts): the win (loot + summary after a short beat) and cleanup. Called from the director; pure engine code.
import { world } from '../world';
import { coopRoom } from '../../net/coopRoom';
import { events } from '../events';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { trial, disarmTrial } from '../../bossTrials';
import { finishRunVictory } from './director';
import { biomeOf, bossNameIn } from '../roomDefs';

const END_DELAY = 4.2;   // seconds between the kill and the summary screen (the loot pops up first)

/** The trial's boss is down: bank its loot, then the summary / back to the portal island. */
export function trialBossCleared(fromHost = false): void {
  if (!trial.on || trial.won) return;
  trial.won = true;
  if (!fromHost) for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;   // (co-op guest: the monsters are the host's mirror)
  const st = useGameStore.getState();
  const it = st.claimBossTrialLoot(trial.boss);
  trial.lootName = it ? it.name : '';
  const nm = bossNameIn(biomeOf(trial.boss).boss, trial.boss).name;
  st.addNotification(`${nm} falls! Boss Trial cleared.`, '#c58cff', 'BOSS');
  events.emit('floatText', { pos: world.player.pos, text: 'TRIAL CLEARED', color: 0xc58cff, scale: 1.4, dy: 3 });
  trial.endT = END_DELAY;
  if (!fromHost) coopRoom.trialWin?.();   // co-op host: the guest wins too (net/coopTrial.ts) and rolls his own loot
}
/** Per-frame (from updateDirector). */
export function tickTrial(dt: number): void {
  if (trial.endT < 0) return;
  trial.endT -= dt;
  if (trial.endT < 0 && useGameStore.getState().status === GameStatus.PLAYING) finishRunVictory();
}
// back in town (enterVillage emits runEnd): the trial rules stop applying
events.on('runEnd', () => { if (trial.on) disarmTrial(); });
