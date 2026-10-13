// ============================================================================
// Keyboard + pointer -> world.input. Global hotkeys live here and nowhere else.
// ============================================================================
import { world } from './world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { uiOverlayOpen, closeTopOverlay, useUiStore } from '../ui/uiStore';
import { aimState, cancelAim } from './systems/aim';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function clearAll(): void {
  const { keys, pressed } = world.input;
  for (const k in keys) keys[k] = false;
  for (const k in pressed) pressed[k] = false;
  world.input.mouseDown = false;
  world.input.joy.active = false; world.input.joy.x = world.input.joy.z = 0;
  world.input.aimStick.active = false;
  world.input.touchAim.active = false; world.input.cancelAim = false;
}

/** Attaches window listeners. Returns the cleanup function. Call once from App. */
export function installInput(): () => void {
  const inp = world.input;

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;

    inp.keys[e.code] = true;
    inp.pressed[e.code] = true;

    if (e.code === 'Escape' && aimState.active) { cancelAim(); inp.cancelAim = true; return; } // Esc cancels a held skill indicator
    if (e.code === 'Escape' && uiOverlayOpen()) { closeTopOverlay(); return; }
    const st = useGameStore.getState();
    const inGame = st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED || (st.status === GameStatus.MENU && useUiStore.getState().titleDone);
    switch (e.code) {
      case 'Escape':
        if (inGame) st.togglePause();
        break;
      case 'KeyI':
        if (inGame) st.toggleInventory();
        break;
      case 'KeyC':
        if (inGame) st.toggleCharacterSheet();
        break;
      default: break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    inp.keys[e.code] = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;   // touch uses the virtual joystick / aim stick
    inp.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    inp.pointerNdc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  const onMouseDown = (e: MouseEvent) => { if (e.button === 0) inp.mouseDown = true; else if (e.button === 2 && aimState.active) { cancelAim(); inp.cancelAim = true; } };
  const onContext = (e: Event) => { if (aimState.active) e.preventDefault(); };
  const onMouseUp = (e: MouseEvent) => { if (e.button === 0) inp.mouseDown = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', clearAll);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('contextmenu', onContext);
    window.removeEventListener('blur', clearAll);
  };
}
