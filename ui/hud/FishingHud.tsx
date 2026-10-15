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
  const sig = useRef('');
  useRaf((_, now) => {
    const F = world.fishing, el = root.current; if (!el) return;
    const on = F.state !== FISH.IDLE;
    const s = `${F.state}|${F.hits}|${F.misses}|${F.need}|${F.fish}|${F.ok}|${F.ver}`;
    if (s !== sig.current) {
      sig.current = s;
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
          for (let i = 0; i < F.need; i++) h += `<span style="display:inline-block;width:10px;height:10px;margin:0 3px;transform:rotate(45deg);border:1px solid ${GOLD};background:${i < F.hits ? '#5fe08a' : 'transparent'}"></span>`;
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
  if (blocked) { sig.current = ''; return null; }
  const act = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); const F = world.fishing; if (F.state === FISH.CAST || F.state === FISH.WAIT) stopFishing('You reel in the line.'); else fishAction(); };
  return (
    <div ref={root} data-testid="fishing-hud" style={{ display: 'none', position: 'absolute', left: '50%', bottom: device.touch ? '30%' : '22%', transform: 'translateX(-50%)', zIndex: 31,
      width: 'min(420px, 86vw)', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 14px 12px', pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(14,11,8,.78), rgba(8,6,5,.66))', border: '1px solid rgba(201,150,46,.55)', boxShadow: '0 6px 24px rgba(0,0,0,.45)' }}>
      <div ref={title} style={{ fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 700, letterSpacing: '.04em', textShadow: '0 2px 6px rgba(0,0,0,.8)' }} />
      <div ref={sub} style={{ fontSize: 12, color: 'rgba(246,232,200,.75)', textShadow: '0 1px 3px rgba(0,0,0,.8)' }} />
      <div ref={bar} data-testid="fishing-bar" style={{ display: 'none', position: 'relative', width: '100%', height: 18, marginTop: 4, background: 'linear-gradient(180deg, #11202a, #0a141b)', border: `1px solid ${GOLD}` }}>
        <div ref={zone} style={{ position: 'absolute', top: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(95,224,138,.85), rgba(46,160,90,.85))', boxShadow: 'inset 0 0 0 1px rgba(200,255,210,.6)' }} />
        <div ref={marker} style={{ position: 'absolute', top: -4, bottom: -4, width: 6, background: '#ffd24a', boxShadow: '0 0 6px rgba(255,220,120,.9)' }} />
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
