import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { FISH, fishAction, stopFishing } from '../../engine/systems/fishing';
import { LOOT_BY_ID } from '../../loot';
import { RARITY_LABEL_COLOR } from '../../constants';
import { useGameStore } from '../../store';
import { useRaf } from '../hooks/useRaf';
import { device } from '../../engine/device';

/**
 * Lakeside fishing overlay (town only): what the line is doing, the reel minigame bar (marker + green zone, hits / misses)
 * and one big action button (E on keyboard; tap on phones). Reads world.fishing in the shared rAF loop and writes the DOM
 * through refs: no React state per frame. Hidden while idle.
 */
const GOLD = '#e9b949';
export const FishingHud: React.FC = () => {
  const blocked = useGameStore((s) => s.isShopOpen || s.isInventoryOpen || s.isCharacterSheetOpen || s.isPauseMenuOpen);
  const root = useRef<HTMLDivElement>(null), title = useRef<HTMLDivElement>(null), sub = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null), zone = useRef<HTMLDivElement>(null), marker = useRef<HTMLDivElement>(null), pips = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null), btnTxt = useRef<HTMLSpanElement>(null);
  const sig = useRef(-1);   // world.fishing.ver last drawn (bumped on every state / hit / miss change: no per-frame strings)
  useRaf((_, now) => {
    const F = world.fishing, el = root.current; if (!el) return;
    const on = F.state !== FISH.IDLE;
    if (F.ver !== sig.current) {
      sig.current = F.ver;
      el.style.display = on ? 'flex' : 'none';
      if (!on) return;
      const def = F.fish ? LOOT_BY_ID[F.fish] : null, col = def ? RARITY_LABEL_COLOR[def.rarity] ?? '#fff' : '#fff';
      let t = '', st = '', b = '', bc = '';
      switch (F.state) {
        case FISH.CAST: t = 'Casting...'; b = 'Reel in'; break;
        case FISH.WAIT: t = 'Waiting for a bite...'; st = 'Watch the bobber.'; b = 'Reel in'; break;
        case FISH.BITE: t = '! A BITE !'; st = 'Hook it, quick!'; b = 'HOOK!'; bc = 'hot'; break;
        case FISH.REEL: t = 'Reel it in!'; st = 'Press when the marker is in the green zone'; b = 'REEL!'; bc = 'hot'; break;
        case FISH.RESULT: t = F.ok && def ? `Caught: ${def.name}` : 'It got away...'; st = F.ok && def ? `${def.rarity.toLowerCase()} · sells for ${def.price.toLocaleString()} G` : 'Cast again?'; b = 'Cast again'; break;
      }
      if (title.current) { title.current.textContent = t; title.current.style.color = F.state === FISH.RESULT && F.ok ? col : F.state === FISH.BITE ? '#ffd24a' : '#f6e8c8'; }
      if (sub.current) sub.current.textContent = st;
      if (bar.current) bar.current.style.display = F.state === FISH.REEL ? 'block' : 'none';
      if (btnTxt.current) btnTxt.current.textContent = b;
      if (btn.current) btn.current.dataset.hot = bc;
      if (pips.current) {
        let h = '';
        if (F.state === FISH.REEL) {
          for (let i = 0; i < F.need; i++) h += `<span style="display:inline-block;width:10px;height:10px;margin:0 3px;border-radius:50%;background:${i < F.hits ? "#5fe08a" : "rgba(255,255,255,.25)"}"></span>`;
          h += '<span style="display:inline-block;width:14px"></span>';
          for (let i = 0; i <= F.maxMiss; i++) h += `<span style="display:inline-block;margin:0 2px;font-weight:800;color:${i < F.misses ? '#ff6a5a' : 'rgba(255,255,255,.25)'}">✕</span>`;
        }
        pips.current.innerHTML = h;
      }
    }
    if (!on) return;
    if (F.state === FISH.REEL) {
      if (zone.current) { zone.current.style.left = `${(F.zoneC - F.zoneW / 2) * 100}%`; zone.current.style.width = `${F.zoneW * 100}%`; }
      if (marker.current) {
        const inZ = Math.abs(F.marker - F.zoneC) <= F.zoneW / 2;
        marker.current.style.left = `calc(${F.marker * 100}% - 3px)`;
        marker.current.style.background = inZ ? '#ffffff' : '#ffd24a';
      }
      if (bar.current) bar.current.style.boxShadow = F.flash > 0 ? `0 0 ${14 * F.flash}px rgba(95,224,138,${F.flash})` : F.flash < 0 ? `0 0 ${14 * -F.flash}px rgba(255,90,80,${-F.flash})` : 'none';
    }
    if (btn.current) btn.current.style.transform = btn.current.dataset.hot ? `scale(${1 + Math.sin(now * 14) * 0.04})` : 'none';
  });
  if (blocked) { sig.current = -1; return null; }
  const act = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); const F = world.fishing; if (F.state === FISH.CAST || F.state === FISH.WAIT) stopFishing('You reel in the line.'); else fishAction(); };
  return (
    <div ref={root} data-testid="fishing-hud" style={{ display: 'none', position: 'absolute', left: '50%', bottom: device.touch ? '30%' : '22%', transform: 'translateX(-50%)', zIndex: 31,
      width: 'min(420px, 86vw)', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 18px 14px', pointerEvents: 'none', borderRadius: 22,
      background: 'rgba(30,30,34,.78)', boxShadow: '0 6px 18px rgba(0,0,0,.38)' }}>
      <div ref={title} style={{ fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 700, letterSpacing: '.01em', textShadow: '0 2px 6px rgba(0,0,0,.8)' }} />
      <div ref={sub} style={{ fontSize: 12, color: 'rgba(246,232,200,.75)', textShadow: '0 1px 3px rgba(0,0,0,.8)' }} />
      <div ref={bar} data-testid="fishing-bar" style={{ display: 'none', position: 'relative', width: '100%', height: 18, marginTop: 4, background: 'rgba(0,0,0,.35)', borderRadius: 999, overflow: 'hidden' }}>
        <div ref={zone} style={{ position: 'absolute', top: 0, bottom: 0, background: 'rgba(110,225,150,.8)', borderRadius: 999 }} />
        <div ref={marker} style={{ position: 'absolute', top: 0, bottom: 0, width: 8, borderRadius: 999, background: '#fff6e0', boxShadow: '0 0 6px rgba(255,220,120,.9)' }} />
      </div>
      <div ref={pips} style={{ minHeight: 14, fontSize: 12, lineHeight: '14px' }} />
      <button ref={btn} className="interact-pill pe" data-testid="fishing-action" onPointerDown={act}
        style={{ display: 'flex', pointerEvents: 'auto', minWidth: device.touch ? 170 : 140, justifyContent: 'center', minHeight: device.touch ? 52 : 40 }}>
        {!device.touch && <span className="rpg-key hold-key">E</span>}
        <span ref={btnTxt} className="iv" />
      </button>
    </div>
  );
};
