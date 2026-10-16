// First-time hints (one at a time, shown by ui/hud/TutorialHint): harvest a node, use skill 1, fire the ultimate.
// The ultimate unlocks at Lv 10 with a full bar; the 'Press R' hint shows only for that first charge (per class).
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
// per class: the ult just unlocked and has not been cast yet (bar pre-filled, the 'Press R' hint shows)
const UKEY = 'aether-survivor-ult-first-v1';
const ultFirst: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch { return {}; } })();
const saveUlt = (): void => { try { localStorage.setItem(UKEY, JSON.stringify(ultFirst)); } catch { /* ignore */ } };
useGameStore.subscribe((s, p) => {
  if (s.hero !== p.hero || s.classProg === p.classProg) return;
  const a = s.classProg[s.hero], b = p.classProg[p.hero];   // (same level: a learn, not a character switch)
  if (a && b && a.lv === b.lv && (a.skills.ult ?? 0) > 0 && (b.skills.ult ?? 0) <= 0) {
    ultFirst[s.hero] = true; saveUlt(); world.player.ult = 100;
  }
});
events.on('ultStart', () => { done('ult'); const h = useGameStore.getState().hero; if (ultFirst[h]) { ultFirst[h] = false; saveUlt(); } });
events.on('crateBreak', (e) => { if (isHarvestNode(e.kind)) done('harvest'); });
events.on('runStart', () => {
  // the ult was just unlocked and not cast yet: keep its free first charge
  if (ultFirst[useGameStore.getState().hero]) world.player.ult = 100;
});

/** The hint to show right now (or ''). Cheap: called every frame by the HUD. */
export function tutorialHint(): string {
  const st = useGameStore.getState().status, touch = device.touch;
  const near = st === GameStatus.MENU ? nearby[0] : roomNearby[0];
  if (!flags.harvest && near?.active && (near.act === 'harvest' || near.node >= 100)) return touch ? 'Hold the interact button to harvest' : 'Hold  E  to harvest';
  if (st !== GameStatus.PLAYING || !world.room.active) return '';
  if (!flags.skill1) return touch ? 'Tap  Skill 1  to unleash your first skill' : 'Press  1  to use your first skill';
  if (ultFirst[useGameStore.getState().hero] && ultReady()) return touch ? 'Your Ultimate is charged! Tap the big  R  button' : 'Your Ultimate is charged! Press  R';
  return '';
}
