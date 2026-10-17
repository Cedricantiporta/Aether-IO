// (owner) Which input the player is using right now: a gamepad button / stick switches every key hint (skill bar, interact
// prompts, menu hotkeys, Settings > Controls) to controller buttons; a real key press or mouse move switches back.
// engine/input.ts calls setPadMode; the UI reads useInputMode / keyHint.
import { create } from 'zustand';

export const useInputMode = create<{ pad: boolean }>(() => ({ pad: false }));
export function setPadMode(on: boolean): void { if (useInputMode.getState().pad !== on) useInputMode.setState({ pad: on }); }

/** Keyboard code -> controller button (engine/input.ts PAD + the menu-mode buttons). */
export const PAD_LABEL: Record<string, string> = {
  Space: 'A', KeyE: 'B', Digit1: 'X', Digit2: 'Y', Digit3: 'RB', KeyR: 'RT', KeyZ: 'LB', KeyX: 'LT', KeyI: 'View', Escape: 'Menu',
  KeyJ: 'D↑', KeyC: 'D↓', KeyF: 'D←', KeyO: 'D→', KeyG: 'L3', KeyV: 'R3',
};
/** Display letter (as written on a key hint) -> keyboard code. */
const CODE_OF: Record<string, string> = { SPACE: 'Space', E: 'KeyE', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', R: 'KeyR', Z: 'KeyZ', X: 'KeyX', I: 'KeyI', ESC: 'Escape', J: 'KeyJ', C: 'KeyC', F: 'KeyF', O: 'KeyO', G: 'KeyG', V: 'KeyV' };

/** The hint to show for a keyboard key (given as a code like 'KeyE' or a label like 'E'), for the current input. */
export function keyHint(k: string, pad = useInputMode.getState().pad): string {
  if (!pad) return k;
  return PAD_LABEL[k] ?? PAD_LABEL[CODE_OF[k.toUpperCase()] ?? ''] ?? k;
}
/** React: the same, re-rendering when the input mode flips. */
export const useKeyHint = (k: string): string => useInputMode((s) => keyHint(k, s.pad));
