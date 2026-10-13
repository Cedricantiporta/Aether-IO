// ============================================================================
// Keyboard + pointer -> world.input. Global hotkeys live here and nowhere else.
// ============================================================================
import { world } from './world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';

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

    const st = useGameStore.getState();
    const inGame = st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED;
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
      case 'KeyK':
        if (inGame) {
          if (st.isShopOpen) st.closeAllUI();
          else st.openSpecificShop('SKILLS');
        }
        break;
      default: break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    inp.keys[e.code] = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    inp.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    inp.pointerNdc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  const onMouseDown = (e: MouseEvent) => { if (e.button === 0) inp.mouseDown = true; };
  const onMouseUp = (e: MouseEvent) => { if (e.button === 0) inp.mouseDown = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', clearAll);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('blur', clearAll);
  };
}
