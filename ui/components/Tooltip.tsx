import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { device } from '../../engine/device';

interface TipState { content: React.ReactNode | null; show: (c: React.ReactNode) => void; hide: () => void; }
export const useTipStore = create<TipState>((set) => ({
  content: null,
  show: (content) => set({ content }),
  hide: () => set({ content: null }),
}));

/** Spread onto any element: <div {...tip(<ItemTip item={i}/>)} /> */
export const tip = (content: React.ReactNode) => ({
  onMouseEnter: () => useTipStore.getState().show(content),
  onMouseLeave: () => useTipStore.getState().hide(),
});
export const hideTip = () => useTipStore.getState().hide();

/** Single global parchment tooltip that follows the cursor (position written via ref, no re-render). */
export const TooltipLayer: React.FC = () => {
  const content = useTipStore((s) => s.content);
  const ref = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const pad = 18;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = mouse.current.x + pad, y = mouse.current.y + pad;
    if (x + w > window.innerWidth - 8) x = mouse.current.x - w - pad;
    if (y + h > window.innerHeight - 8) y = Math.max(8, mouse.current.y - h - pad);
    el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  };

  useEffect(() => {
    const move = (e: MouseEvent) => { mouse.current.x = e.clientX; mouse.current.y = e.clientY; place(); };
    const touch = (e: PointerEvent) => { if (e.pointerType === 'touch') { mouse.current.x = e.clientX; mouse.current.y = e.clientY; useTipStore.getState().hide(); } };
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerdown', touch, true);   // tap-to-show: a new tap hides the old tip first, the tapped element's hover handler shows its own
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('pointerdown', touch, true); };
  }, []);
  useEffect(() => { if (content) place(); }, [content]);
  // touch: tap shows the card docked at the bottom; it fades after a few seconds or on the next tap
  useEffect(() => {
    if (!content || !device.touch) return;
    const t = setTimeout(() => useTipStore.getState().hide(), 5000);
    return () => clearTimeout(t);
  }, [content]);

  if (!content) return null;
  return <div ref={ref} className={`rpg-tooltip paper ${device.touch ? 'docked' : ''}`} style={device.touch ? undefined : { transform: 'translate(-999px,-999px)' }}>{content}</div>;
};
