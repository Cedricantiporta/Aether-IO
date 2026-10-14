// Filled, gold-metal menu glyphs (Korean MMO style) for the top-right HUD buttons. Pure inline SVG, no assets.
import React from 'react';

const Gold: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff3c8" /><stop offset=".38" stopColor="#e8c674" /><stop offset=".62" stopColor="#a87b34" /><stop offset="1" stopColor="#e2bd6a" />
    </linearGradient>
    <linearGradient id={id + 'd'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a3d14" /><stop offset="1" stopColor="#2a1a07" /></linearGradient>
  </defs>
);
const G: React.FC<{ id: string; size?: number; children: (f: string, d: string) => React.ReactNode }> = ({ id, size = 30, children }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden><Gold id={id} />{children(`url(#${id})`, `url(#${id}d)`)}</svg>
);
const S = { stroke: '#1a1004', strokeWidth: 1.1, strokeLinejoin: 'round' as const };

export const HelmGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-helm" size={size}>{(f, d) => <>
    <path d="M16 3c6.5 0 10.5 4.6 10.5 11v9.5l-4 3.5h-13l-4-3.5V14C5.5 7.6 9.5 3 16 3z" fill={f} {...S} />
    <path d="M9.5 15h13v3.2h-4.6l-1.2 5.8h-1.4l-1.2-5.8H9.5z" fill={d} {...S} />
    <path d="M16 3v9" stroke="#7a5418" strokeWidth="1.6" /><circle cx="16" cy="27" r="1.6" fill={d} />
  </>}</G>
);
export const BagGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-bag" size={size}>{(f, d) => <>
    <path d="M11 9V7a5 5 0 0 1 10 0v2" fill="none" stroke="#1a1004" strokeWidth="3.4" /><path d="M11 9V7a5 5 0 0 1 10 0v2" fill="none" stroke={f} strokeWidth="1.8" />
    <path d="M6 10.5h20l1.5 15.5a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5z" fill={f} {...S} />
    <path d="M6.5 14h19" stroke="#6a4a18" strokeWidth="1.2" /><rect x="12.5" y="15.5" width="7" height="6" rx="1.2" fill={d} {...S} /><circle cx="16" cy="18.5" r="1.3" fill={f} />
  </>}</G>
);
export const TrophyGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-cup" size={size}>{(f, d) => <>
    <path d="M9 4h14v7a7 7 0 0 1-14 0z" fill={f} {...S} />
    <path d="M9 6H5v2.5A5 5 0 0 0 9.6 13.5M23 6h4v2.5a5 5 0 0 1-4.6 5" fill="none" stroke="#1a1004" strokeWidth="3" /><path d="M9 6H5v2.5A5 5 0 0 0 9.6 13.5M23 6h4v2.5a5 5 0 0 1-4.6 5" fill="none" stroke={f} strokeWidth="1.5" />
    <path d="M14 17.5h4l1 5h-6z" fill={d} {...S} /><path d="M9.5 22.5h13l1.5 5h-16z" fill={f} {...S} />
    <path d="M16 6.5l1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill={d} />
  </>}</G>
);
export const BookGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-book" size={size}>{(f, d) => <>
    <path d="M6 4h17a3 3 0 0 1 3 3v21H9a3 3 0 0 1-3-3z" fill={f} {...S} />
    <path d="M6 25a3 3 0 0 1 3-3h17" fill="none" stroke="#1a1004" strokeWidth="1.1" /><path d="M9 22h17v6H9a3 3 0 0 1 0-6z" fill="#f6ecd2" {...S} />
    <path d="M16 8l3.5 4-3.5 4-3.5-4z" fill={d} {...S} /><path d="M10 6v14" stroke="#7a5418" strokeWidth="1.2" />
  </>}</G>
);
export const GearGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-gear" size={size}>{(f, d) => <>
    <path d="M13.6 3h4.8l.8 3.4 2.4 1 3-1.8 3.4 3.4-1.8 3 1 2.4 3.4.8v4.8l-3.4.8-1 2.4 1.8 3-3.4 3.4-3-1.8-2.4 1-.8 3.4h-4.8l-.8-3.4-2.4-1-3 1.8-3.4-3.4 1.8-3-1-2.4L3 18.4v-4.8l3.4-.8 1-2.4-1.8-3L9 4l3 1.8 2.4-1z" fill={f} {...S} />
    <circle cx="16" cy="16" r="5" fill={d} {...S} /><circle cx="16" cy="16" r="2" fill={f} />
  </>}</G>
);
export const ExpandGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-full" size={size}>{(f) => <>
    {['M4 12V4h8', 'M20 4h8v8', 'M28 20v8h-8', 'M12 28H4v-8'].map((dd) => <g key={dd}><path d={dd} fill="none" stroke="#1a1004" strokeWidth="4.6" strokeLinecap="square" /><path d={dd} fill="none" stroke={f} strokeWidth="2.6" strokeLinecap="square" /></g>)}
  </>}</G>
);
export const CoinGlyphFill: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-coin" size={size}>{(f, d) => <><circle cx="16" cy="16" r="12" fill={f} {...S} /><circle cx="16" cy="16" r="8.5" fill="none" stroke="#7a5418" strokeWidth="1.4" /><path d="M16 10l2 4.5 4.5.5-3.4 3 1 4.5-4.1-2.4-4.1 2.4 1-4.5-3.4-3 4.5-.5z" fill={d} /></>}</G>
);
export const SkillGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-skill" size={size}>{(f, d) => <>
    <path d="M16 3l3.2 7.2 7.8.8-5.9 5.2 1.8 7.7L16 19.8l-6.9 4.1 1.8-7.7L5 11l7.8-.8z" fill={f} {...S} />
    <circle cx="16" cy="14" r="3.2" fill={d} {...S} /><path d="M9 27h14" stroke="#1a1004" strokeWidth="3.4" strokeLinecap="round" /><path d="M9 27h14" stroke={f} strokeWidth="1.8" strokeLinecap="round" />
  </>}</G>
);
export const GoalGlyph: React.FC<{ size?: number }> = ({ size }) => (
  <G id="mg-goal" size={size}>{(f, d) => <>
    <path d="M7 3.5h18a2 2 0 0 1 2 2V28l-5-3-6 3-6-3-5 3V5.5a2 2 0 0 1 2-2z" fill={f} {...S} />
    <path d="M10.5 10.5l2 2 3.6-4M10.5 17.5l2 2 3.6-4" fill="none" stroke="#1a1004" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M10.5 10.5l2 2 3.6-4M10.5 17.5l2 2 3.6-4" fill="none" stroke={d} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 11h4M19 18h4" stroke="#7a5418" strokeWidth="1.8" strokeLinecap="round" />
  </>}</G>
);
