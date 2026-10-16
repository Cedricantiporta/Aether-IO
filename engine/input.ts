// ============================================================================
// Keyboard + pointer -> world.input. Global hotkeys live here and nowhere else.
// ============================================================================
import { world } from './world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { uiOverlayOpen, closeTopOverlay, useUiStore } from '../ui/uiStore';
import { aimState, cancelAim } from './systems/aim';
/** Settings were opened with Esc and paused the run (closing them resumes). */
let escPaused = false;
import { requestClick } from './systems/target';

// ---- MMORPG free camera: right-drag / one-finger drag on empty screen = orbit, wheel / pinch = zoom
const PITCH_MIN = 0.55, PITCH_MAX = 1.3, DIST_MIN = 0.55, DIST_MAX = 1.15;   // (owner: max zoom-out halved again: was 1.3, before 1.6)
const orbitAllowed = () => {
  const st = useGameStore.getState().status;
  return st === GameStatus.PLAYING || (st === GameStatus.MENU && useUiStore.getState().titleDone);
};
function orbit(dxPx: number, dyPx: number): void {
  const c = world.camera;
  c.yaw -= dxPx * 0.0065;
  c.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, c.pitch + dyPx * 0.0045));
}
function zoomBy(f: number): void {
  const c = world.camera;
  c.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, c.dist * f));
}

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
    if (e.code === 'Escape' && uiOverlayOpen()) {
      const wasSettings = useUiStore.getState().settingsOpen;
      closeTopOverlay();
      // settings opened with Esc during a run paused it: closing them resumes
      if (wasSettings && escPaused) { escPaused = false; const s0 = useGameStore.getState(); if (s0.status === GameStatus.PAUSED) s0.togglePause(); }
      return;
    }
    const st = useGameStore.getState();
    if (e.code === 'Escape' && (st.isShopOpen || st.isInventoryOpen || st.isCharacterSheetOpen)) {   // (owner: Esc closes the open panel first)
      useGameStore.setState({ isShopOpen: false, isInventoryOpen: false, isCharacterSheetOpen: false });
      return;
    }
    const inGame = st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED || (st.status === GameStatus.MENU && useUiStore.getState().titleDone);
    switch (e.code) {
      case 'Escape':   // in a run: the pause menu (Esc again resumes); in town: Settings
        if (st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED) { st.togglePause(); escPaused = false; }
        else if (inGame) useUiStore.getState().openSettings(true);
        break;
      case 'KeyI':
        if (inGame) st.toggleInventory();
        break;
      case 'KeyJ':
        if (inGame) { const u = useUiStore.getState(); u.openQuestLog(!u.questLogOpen); }
        break;
      case 'KeyO':   // achievements
        if (inGame) { const u = useUiStore.getState(); u.openGoals(!u.goalsOpen, 'ACHIEVEMENTS'); }
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
  const onUi = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('.pe');
  // right mouse: cancels a held skill indicator, otherwise drag = orbit the camera
  const rmb = { on: false, x: 0, y: 0 };
  // left mouse: a drag that starts on the scene (not UI) also orbits once it moves past a few pixels; a click still selects
  const lmb = { down: false, drag: false, x: 0, y: 0, sx: 0, sy: 0 };
  const onMouseDown = (e: MouseEvent) => {
    if (onUi(e)) return; /* UI panels never fire skills */
    if (e.button === 0) {
      inp.mouseDown = true;
      if (orbitAllowed() && !aimState.active) { lmb.down = true; lmb.drag = false; lmb.x = lmb.sx = e.clientX; lmb.y = lmb.sy = e.clientY; }
    } else if (e.button === 2) {
      if (aimState.active) { cancelAim(); inp.cancelAim = true; }
      else if (orbitAllowed()) { rmb.on = true; rmb.x = e.clientX; rmb.y = e.clientY; }
    }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (lmb.down) {
      if (!lmb.drag && Math.hypot(e.clientX - lmb.sx, e.clientY - lmb.sy) > 6) lmb.drag = true;
      if (lmb.drag) orbit(e.clientX - lmb.x, e.clientY - lmb.y);
      lmb.x = e.clientX; lmb.y = e.clientY;
    }
    if (!rmb.on) return;
    orbit(e.clientX - rmb.x, e.clientY - rmb.y);
    rmb.x = e.clientX; rmb.y = e.clientY;
  };
  const onWheel = (e: WheelEvent) => {
    if (onUi(e) || !orbitAllowed()) return;
    zoomBy(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0022));
  };
  // touch: drags that start on empty screen (not joystick / buttons / panels) orbit; two fingers pinch-zoom
  const touches = new Map<number, { x: number; y: number }>();
  let pinchD = 0;
  const onTouchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || onUi(e) || !orbitAllowed()) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onTouchMove = (e: PointerEvent) => {
    const t = touches.get(e.pointerId); if (!t) return;
    if (touches.size === 1) orbit((e.clientX - t.x) * 1.15, (e.clientY - t.y) * 1.15);
    t.x = e.clientX; t.y = e.clientY;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 10 && d > 10) zoomBy(pinchD / d);
      pinchD = d;
    }
  };
  const onTouchUp = (e: PointerEvent) => { touches.delete(e.pointerId); pinchD = 0; };
  // click / tap = select a target (processed by CameraRig). Drags and holds are not clicks; UI (.pe) is ignored.
  const downs: Record<number, { x: number; y: number; t: number }> = {};
  const onPtrDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest?.('.pe')) return;
    downs[e.pointerId] = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPtrUp = (e: PointerEvent) => {
    const d = downs[e.pointerId]; if (!d) return;
    delete downs[e.pointerId];
    if (aimState.active || performance.now() - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    requestClick(e.clientX, e.clientY);
  };
  const onPtrCancel = (e: PointerEvent) => { delete downs[e.pointerId]; };
  const onContext = (e: Event) => { if (aimState.active || !onUi(e)) e.preventDefault(); };
  const onMouseUp = (e: MouseEvent) => { if (e.button === 0) inp.mouseDown = false; else if (e.button === 2) rmb.on = false; if (e.button === 0) lmb.down = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('pointerdown', onPtrDown);
  window.addEventListener('pointerup', onPtrUp);
  window.addEventListener('pointercancel', onPtrCancel);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', clearAll);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('pointerdown', onTouchDown);
  window.addEventListener('pointermove', onTouchMove);
  window.addEventListener('pointerup', onTouchUp);
  window.addEventListener('pointercancel', onTouchUp);
  const onBlur = () => { rmb.on = false; lmb.down = false; touches.clear(); };
  window.addEventListener('blur', onBlur);

  // ---- (owner) controller support (standard-mapping gamepads via the Gamepad API): left stick = move (like the touch
  // joystick), right stick = camera, buttons press the keyboard keys so every hotkey / skill / dialogue path just works.
  //   A dash · B interact (E) · X skill 1 · Y skill 2 · RB skill 3 · RT ultimate · LB HP potion · LT MP potion
  //   Back bag · Start menu (Esc) · D-pad up quests · down character · left accept offer (F) · right achievements
  const PAD: [number, string, string][] = [
    [0, 'Space', ' '], [1, 'KeyE', 'e'], [2, 'Digit1', '1'], [3, 'Digit2', '2'], [5, 'Digit3', '3'], [7, 'KeyR', 'r'],
    [4, 'KeyZ', 'z'], [6, 'KeyX', 'x'], [8, 'KeyI', 'i'], [9, 'Escape', 'Escape'], [12, 'KeyJ', 'j'], [13, 'KeyC', 'c'], [14, 'KeyF', 'f'], [15, 'KeyO', 'o'],
  ];
  const padDown = new Set<string>();
  let padMoving = false, padRaf = 0;
  const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  const pollPad = () => {
    padRaf = requestAnimationFrame(pollPad);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const g of pads) if (g && g.connected) { gp = g; break; }
    if (!gp) { if (padMoving) { inp.joy.active = false; inp.joy.x = inp.joy.z = 0; padMoving = false; } return; }
    // buttons -> synthetic key events (edge-triggered)
    for (const [i, code, key] of PAD) {
      const b = gp.buttons[i], on = !!b && (b.pressed || b.value > 0.5);
      if (on && !padDown.has(code)) { padDown.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true })); }
      else if (!on && padDown.has(code)) { padDown.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true })); }
    }
    // left stick -> movement (camera-relative, like WASD / the touch joystick)
    const lx = dead(gp.axes[0] ?? 0), ly = dead(gp.axes[1] ?? 0);
    if (lx || ly) { inp.joy.active = true; inp.joy.x = lx; inp.joy.z = ly; padMoving = true; }
    else if (padMoving) { inp.joy.active = false; inp.joy.x = inp.joy.z = 0; padMoving = false; }
    // right stick -> orbit the camera
    const rx = dead(gp.axes[2] ?? 0), ry = dead(gp.axes[3] ?? 0);
    if ((rx || ry) && orbitAllowed()) orbit(rx * 9, ry * 6);
  };
  const onPadConnect = (e: GamepadEvent) => {
    useGameStore.getState().addNotification(`Controller connected: ${e.gamepad.id.split('(')[0].trim() || 'gamepad'}. A dash · X/Y/RB skills · RT ultimate · B interact · Start menu`, '#9fd3ff', 'SYSTEM');
  };
  window.addEventListener('gamepadconnected', onPadConnect);
  padRaf = requestAnimationFrame(pollPad);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('pointerdown', onPtrDown);
    window.removeEventListener('pointerup', onPtrUp);
    window.removeEventListener('pointercancel', onPtrCancel);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('contextmenu', onContext);
    window.removeEventListener('blur', clearAll);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointerdown', onTouchDown);
    window.removeEventListener('pointermove', onTouchMove);
    window.removeEventListener('pointerup', onTouchUp);
    window.removeEventListener('pointercancel', onTouchUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('gamepadconnected', onPadConnect);
    cancelAnimationFrame(padRaf);
  };
}
