// ============================================================================
// (owner, Hades-style) What happens after an adventure run. Called by the Game Over screen's "Return to town":
//  - a DEATH never puts the hero in the town square any more. If a Font dream is due (dreams.ts) the hero drifts straight
//    from the death screen into the dream clearing with Aelia (runInfo.dream, director plan.dream) and wakes up in bed
//    afterwards (bedWake -> village.wakeInBed); a class MEMORY dream plays over the bed; with no dream: the bed.
//  - every death (and ending) also rolls a quest unlock (store.rollDeathUnlock, questUnlocks.ts); the beat is announced
//    after waking ("Someone knocked while you slept...") by `announceUnlock`.
// Tower / Daily / Waves runs and the showcase keep their old return (town plaza / tower door).
// ============================================================================
import { useGameStore } from '../store';
import { runInfo } from './runMods';
import { world } from './world';
import { showcase } from './showcase';
import { bedWake } from './systems/village';
import { openCustomDialogue, dialogueOpen } from './systems/dialogue';
import { nextDream, dreamView } from '../dreams';
import { liveStep, type Beat } from '../questUnlocks';
import { GameStatus } from '../types';

/** The unlock rolled by the last death / ending, waiting to be announced once the hero is awake at home. */
const pending: { beat: Beat | null } = { beat: null };

/** Game Over -> "Return to town". Returns true when the death flow handled the return (so the caller must not reset). */
export function leaveRun(victory: boolean): boolean {
  const st = useGameStore.getState();
  if (showcase.on || runInfo.mode !== 'ADVENTURE') return false;   // Tower / Daily / Waves: unchanged
  if (victory) {   // an ending: back to the plaza as before, and the story moves on (a guaranteed unlock)
    pending.beat = st.rollDeathUnlock(true);
    st.resetGame(); announceUnlock(2600);
    return true;
  }
  if (world.room.plan?.dream) { bedWake.on = true; st.resetGame(); return true; }   // (a dream run is never a death)
  const beat = st.rollDeathUnlock();
  pending.beat = beat;
  const d = nextDream(st.story.step, st.progress.endings);
  if (d && d.voice === 'AELIA') {   // straight into the dream clearing: no town first
    dreamView.pending = d;
    st.addNotification('The darkness is warm... you drift into a dream.', '#fff3c4', 'SYSTEM');
    runInfo.dream = true;
    st.startMode('ADVENTURE');
    return true;
  }
  bedWake.on = true;   // enterVillage wakes the hero in bed at home
  st.resetGame();
  if (!beat) st.addNotification('You sleep soundly. Nobody came knocking tonight.', '#fff3c4', 'SYSTEM');
  announceUnlock(2600);   // (a MEMORY dream plays first, over the bed: it calls this again when you wake)
  return true;
}

/** After waking at home: say who came knocking (once). Waits while a dialogue is open or the hero is not in town yet. */
export function announceUnlock(delayMs = 0): void {
  const go = () => {
    const b = pending.beat; if (!b) return;
    const st = useGameStore.getState();
    if (st.status !== GameStatus.MENU || dialogueOpen()) return;   // (a dream is playing: its wake-up calls this again)
    pending.beat = null;
    const step = liveStep(st);
    st.addNotification(b.story ? `Someone knocked while you slept... ${step ? `New main quest: ${step.title}` : 'the story goes on'}` : `Someone knocked while you slept... ${b.who} has a new request`, '#fff3c4', 'SYSTEM');
    openCustomDialogue(b.who, b.title, '#fff3c4', b.lines, { label: 'Got it', accept: () => { /* just closes */ } });
  };
  if (delayMs > 0) setTimeout(go, delayMs); else go();
}
