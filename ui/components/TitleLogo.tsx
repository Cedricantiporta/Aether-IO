// Title wordmark (owner reference: a sword crest in a diamond frame with light wisps above a mixed-case gold serif
// title, a ruled subtitle under it). Pure SVG + CSS (index.css .tlogo-*).
import React, { useState } from 'react';

/** (owner) the painted title logo: public/art/ui/logo.webp; until that file exists the drawn wordmark below is shown. */
const LOGO_URLS = ['webp', 'png'].map((e) => `${((import.meta as any).env?.BASE_URL as string) || '/'}art/ui/logo.${e}`);   // (logo.webp, else logo.png)

const Crest: React.FC = () => (
  <svg className="tlogo-crest" viewBox="0 0 200 170" aria-hidden>
    <defs>
      <linearGradient id="tl-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4c4" /><stop offset=".35" stopColor="#f2cf7a" /><stop offset=".6" stopColor="#b98a3a" /><stop offset="1" stopColor="#6e4a18" />
      </linearGradient>
      <radialGradient id="tl-glow" cx=".5" cy=".55" r=".5"><stop offset="0" stopColor="#ffe6a0" stopOpacity=".95" /><stop offset=".35" stopColor="#ffbf55" stopOpacity=".35" /><stop offset="1" stopColor="#ffbf55" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="100" cy="92" r="70" fill="url(#tl-glow)" className="tlogo-pulse" />
    {/* diamond frames */}
    <path d="M100 18 L172 90 L100 162 L28 90 Z" fill="none" stroke="#c9a25a" strokeOpacity=".55" strokeWidth="2" />
    <path d="M100 32 L158 90 L100 148 L42 90 Z" fill="rgba(20,16,10,.55)" stroke="#e2bd6e" strokeOpacity=".8" strokeWidth="1.4" />
    {/* wings / crossguard */}
    <path d="M60 70 C72 58 86 58 100 64 C114 58 128 58 140 70 C128 70 118 74 110 80 L100 74 L90 80 C82 74 72 70 60 70 Z" fill="url(#tl-gold)" stroke="#2a1a08" strokeWidth="1.5" />
    {/* blade */}
    <path d="M100 8 L107 26 L104 30 L104 132 L100 146 L96 132 L96 30 L93 26 Z" fill="url(#tl-gold)" stroke="#2a1a08" strokeWidth="1.5" />
    <path d="M100 30 L100 132" stroke="#fff6d0" strokeOpacity=".7" strokeWidth="1" />
    {/* pommel gem + shield */}
    <path d="M100 2 L106 10 L100 18 L94 10 Z" fill="#fff0b8" stroke="#2a1a08" strokeWidth="1.2" />
    <path d="M80 84 L120 84 L118 104 C114 116 106 122 100 126 C94 122 86 116 82 104 Z" fill="url(#tl-gold)" stroke="#2a1a08" strokeWidth="1.5" opacity=".95" />
    <path d="M100 90 L106 100 L100 112 L94 100 Z" fill="#fffbe6" className="tlogo-gem" />
    {/* light wisps */}
    <path className="tlogo-wisp" d="M100 92 C80 60 120 40 96 6" fill="none" stroke="#ffe3a0" strokeWidth="1.2" />
    <path className="tlogo-wisp w2" d="M100 92 C126 64 82 42 110 4" fill="none" stroke="#ffd27a" strokeWidth="1" />
  </svg>
);

export const TitleLogo: React.FC<{ sub?: string; tag?: string }> = ({ sub = 'Guardians of the Font', tag }) => {
  const [img, setImg] = useState<'try' | 'ok' | 'none'>('try');
  const [k, setK] = useState(0);
  if (img !== 'none') return (
    <div className="tlogo tlogo-img">
      <img key={k} src={LOGO_URLS[k]} alt="Aether Survivor: Guardians of the Font" draggable={false} onLoad={() => setImg('ok')} onError={() => { if (k + 1 < LOGO_URLS.length) setK(k + 1); else setImg('none'); }} style={{ visibility: img === 'ok' ? 'visible' : 'hidden' }} />
      {tag && <div className="tlogo-tag">{tag}</div>}
    </div>
  );
  return (
  <div className="tlogo">
    <Crest />
    <div className="tlogo-word" data-text="Aether Survivor"><span className="cap">A</span>ether <span className="cap">S</span>urvivo<span className="cap end">r</span></div>
    <div className="tlogo-sub"><i /><span>{sub}</span><i /></div>
    {tag && <div className="tlogo-tag">{tag}</div>}
  </div>
  );
};
