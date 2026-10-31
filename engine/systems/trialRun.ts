// Boss Trial run logic (see bossTrials.ts): the win (loot + summary after a short beat) and cleanup. Called from the director; pure engine code.
import { world } from '../world';
import { coopRoom } from '../../net/coopRoom';
import { events } from '../events';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { trial, disarmTrial } from '../../bossTrials';
import { finishRunVictory } from './director';
import { biomeOf, bossNameIn } from '../roomDefs';
import { spawnPickup } from './pickups';
import { Vector3 } from 'three';
const at = new Vector3();

/** The trial's boss is down. (owner 2026-10-31) No auto-loot: the drops (rolled by the store, which also sets the daily lock) fall on the arena floor as normal item pickups
 *  (per player: co-op guests roll + spawn their own), and the loot panel (ui/screens/TrialLoot.tsx) lets the hero loot, stay or return (`leaveTrial`). */
export function trialBossCleared(fromHost = false): void {
  if (!trial.on || trial.won) return;
  trial.won = true; trial.stay = false;
  if (!fromHost) for (const e of world.enemies) if (e.active && e.state !== 'DYING') e.hp = 0;   // (co-op guest: the monsters are the host's mirror)
  for (const z of world.zones) z.active = false;
  for (const p of world.enemyProjectiles) p.active = false;
  const st = useGameStore.getState();
  const items = st.rollBossTrialLoot(trial.boss);
  trial.lootName = items.length ? items.map((i) => i.name).join(', ') : '';
  const body = world.director.bossId >= 0 ? world.enemies[world.director.bossId] : null;
  const cx = body ? body.pos.x : world.player.pos.x, cz = body ? body.pos.z : world.player.pos.z;
  coopRoom.noFwd++;   // (each player's own drops: never forwarded to the partner)
  for (let i = 0; i < items.length; i++) {
    const a = (i / Math.max(1, items.length)) * Math.PI * 2 + 0.6;
    spawnPickup('ITEM', at.set(cx + Math.cos(a) * 2.2, 0, cz + Math.sin(a) * 2.2), 0, items[i]);
  }
  coopRoom.noFwd--;
  const nm = bossNameIn(biomeOf(trial.boss).boss, trial.boss).name;
  st.addNotification(`${nm} falls! Boss Trial cleared.`, '#c58cff', 'BOSS');
  events.emit('floatText', { pos: world.player.pos, text: 'TRIAL CLEARED', color: 0xc58cff, scale: 1.4, dy: 3 });
  if (!fromHost) coopRoom.trialWin?.();   // co-op host: the guest wins too (net/coopTrial.ts) and rolls his own loot
}
/** "Return to town": bank the run and go home (loot still on the floor is lost). */
export function leaveTrial(): void {
  if (!trial.on || !trial.won) return;
  if (useGameStore.getState().status === GameStatus.PLAYING) finishRunVictory();
}
/** Ground items still lying in the arena: total and how many the bag cannot take right now. */
export function trialGround(): { n: number; full: number } {
  const st = useGameStore.getState();
  let n = 0, full = 0;
  for (const o of world.pickups) if (o.active && o.kind === 'ITEM' && o.item) { n++; if (!st.canPickUp(o.item)) full++; }
  return { n, full };
}
/** Per-frame (from updateDirector): nothing to count down any more (the player decides when to leave). */
export function tickTrial(_dt: number): void { /* kept for the director hooks */ }
// back in town (enterVillage emits runEnd): the trial rules stop applying
events.on('runEnd', () => { if (trial.on) disarmTrial(); });
