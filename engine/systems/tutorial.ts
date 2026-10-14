// First-time hints (one at a time, shown by ui/hud/TutorialHint): harvest a node, use skill 1, fire the ultimate.
// The first story run (the King's slime trial) starts with a full ultimate so the ult hint can be tried at once.
// Flags persist in localStorage; each hint finishes when the player actually does the thing.
import { events } from '../events';
import { world } from '../world';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { device } from '../device';
import { roomNearby } from './director';
import { nearby } from './village';
import { ultReady } from './abilities';
import { isHarvestNode } from '../mapgen';

const KEY = 'aether-survivor-tutorial-v1';
type Flag = 'harvest' | 'skill1' | 'ult';
const flags: Record<Flag, boolean> = (() => {
  try { return { harvest: false, skill1: false, ult: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { harvest: false, skill1: false, ult: false }; }
})();
function done(f: Flag): void { if (flags[f]) return; flags[f] = true; try { localStorage.setItem(KEY, JSON.stringify(flags)); } catch { /* ignore */ } }

events.on('ability', () => done('skill1'));
events.on('ultStart', () => done('ult'));
events.on('crateBreak', (e) => { if (isHarvestNode(e.kind)) done('harvest'); });
events.on('runStart', () => {
  // the first trial run: a full ultimate to learn it with
  if (!flags.ult && useGameStore.getState().story.step <= 2) world.player.ult = 100;
});

/** The hint to show right now (or ''). Cheap: called every frame by the HUD. */
export function tutorialHint(): string {
  const st = useGameStore.getState().status, touch = device.touch;
  const near = st === GameStatus.MENU ? nearby[0] : roomNearby[0];
  if (!flags.harvest && near?.active && (near.act === 'harvest' || near.node >= 100)) return touch ? 'Hold the interact button to harvest' : 'Hold  E  to harvest';
  if (st !== GameStatus.PLAYING || !world.room.active) return '';
  if (!flags.skill1) return touch ? 'Tap  Skill 1  to unleash your first skill' : 'Press  1  to use your first skill';
  if (!flags.ult && ultReady()) return touch ? 'Your Ultimate is charged! Tap the big  R  button' : 'Your Ultimate is charged! Press  R';
  return '';
}
