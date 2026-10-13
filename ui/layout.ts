// Responsive layout driver: classes on <html> (is-touch / is-phone / compact / portrait), root font-size (UI scale),
// and page-level touch hardening (no zoom / scroll / long-press menu).
import { device } from '../engine/device';
import { useGameStore } from '../store';

const SCALE = { SMALL: 0.85, NORMAL: 1, LARGE: 1.2 } as const;

export function installLayout(): () => void {
  const root = document.documentElement;
  const apply = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const portrait = vh > vw;
    const short = Math.min(vw, vh);
    const compact = (device.touch || device.phone) && short < 620;
    const scale = SCALE[useGameStore.getState().settings?.uiScale || 'NORMAL'] ?? 1;
    // landscape viewport height drives the base size on phones; desktop keeps the original clamp()
    const base = compact
      ? Math.max(8.5, Math.min(12, (portrait ? vw : vh) / 34))
      : Math.min(17, Math.max(12, 8 + Math.min(vw * 0.005, vh * 0.009)));
    root.style.fontSize = (base * scale).toFixed(2) + 'px';
    root.classList.toggle('is-touch', device.touch);
    root.classList.toggle('is-phone', device.phone || compact);
    root.classList.toggle('compact', compact);
    root.classList.toggle('portrait', portrait && device.touch);
    root.style.setProperty('--ui-scale', String(scale));
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  const unsub = useGameStore.subscribe((s, p) => { if (s.settings?.uiScale !== p.settings?.uiScale) apply(); });

  // Block browser gestures: pinch / double-tap zoom, long-press menu, pull-to-refresh, iOS gesture events.
  const stop = (e: Event) => e.preventDefault();
  const opt: AddEventListenerOptions = { passive: false };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) { e.preventDefault(); return; }
    if (device.touch && !(e.target as HTMLElement)?.closest?.('.rpg-scroll, .allow-scroll, input[type=range]')) e.preventDefault();
  };
  document.addEventListener('gesturestart', stop, opt);
  document.addEventListener('gesturechange', stop, opt);
  document.addEventListener('touchmove', onTouchMove, opt);
  const onCtx = (e: Event) => { if (device.touch) e.preventDefault(); };
  document.addEventListener('contextmenu', onCtx);
  return () => {
    window.removeEventListener('resize', apply); window.removeEventListener('orientationchange', apply); unsub();
    document.removeEventListener('gesturestart', stop); document.removeEventListener('gesturechange', stop);
    document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('contextmenu', onCtx);
  };
}

export async function toggleFullscreen(): Promise<void> {
  const d: any = document, el: any = document.documentElement;
  try {
    if (d.fullscreenElement) { await d.exitFullscreen?.(); return; }
    await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not supported */ }
  } catch { /* ignore */ }
}
