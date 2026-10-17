// (owner) Settings > Controls: a controller drawn in the game's dark-gold style, every button labelled with its action
// (engine/input.ts PAD). Static SVG.
import React from 'react';

type P = [number, number];
const LEFT: [string, string, P][] = [
  ['LT', 'Mana potion', [265, 34]], ['LB', 'Health potion', [265, 64]], ['View', 'Bag', [327, 118]],
  ['L stick', 'Move · click: follow quest', [275, 125]], ['D-pad ↑', 'Quests', [310, 166]], ['D-pad ←', 'Accept offer', [296, 180]],
  ['D-pad →', 'Achievements', [324, 180]], ['D-pad ↓', 'Hero', [310, 194]],
];
const RIGHT: [string, string, P][] = [
  ['RT', 'Ultimate', [435, 34]], ['RB', 'Ability 3', [435, 64]], ['Menu', 'Pause / Settings', [373, 118]],
  ['Y', 'Ability 2', [425, 105]], ['B', 'Interact / talk / loot', [445, 125]], ['X', 'Ability 1', [405, 125]],
  ['A', 'Class dash', [425, 145]], ['R stick', 'Camera · click: reset', [390, 180]],
];
const FACE: [string, P, string][] = [['Y', [425, 105], '#ffd23a'], ['X', [405, 125], '#4f9cff'], ['B', [445, 125], '#ff5a4e'], ['A', [425, 145], '#6fd35a']];
const ROW = (i: number) => 24 + i * 34;
const GOLD = '#c9a463', LINE = '#8d7550';

export const ControllerMap: React.FC = () => (
  <svg viewBox="-50 0 800 290" width="100%" className="ctl-map" role="img" aria-label="Controller layout">
    <defs>
      <linearGradient id="ctlBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2117" /><stop offset="1" stopColor="#0f0b07" /></linearGradient>
    </defs>
    {/* triggers + bumpers */}
    <rect x="245" y="20" width="40" height="30" rx="10" fill="url(#ctlBody)" stroke={LINE} strokeWidth="2" />
    <rect x="415" y="20" width="40" height="30" rx="10" fill="url(#ctlBody)" stroke={LINE} strokeWidth="2" />
    <rect x="232" y="57" width="64" height="14" rx="7" fill="url(#ctlBody)" stroke={LINE} strokeWidth="2" />
    <rect x="404" y="57" width="64" height="14" rx="7" fill="url(#ctlBody)" stroke={LINE} strokeWidth="2" />
    <text x="265" y="40" textAnchor="middle" className="ctl-btn">LT</text><text x="435" y="40" textAnchor="middle" className="ctl-btn">RT</text>
    <text x="264" y="68" textAnchor="middle" className="ctl-btn sm">LB</text><text x="436" y="68" textAnchor="middle" className="ctl-btn sm">RB</text>
    {/* body */}
    <path d="M250 78 Q350 68 450 78 Q500 84 516 150 L531 228 Q536 266 505 268 Q480 270 460 240 L430 206 Q350 199 270 206 L240 240 Q220 270 195 268 Q164 266 169 228 L184 150 Q200 84 250 78Z"
      fill="url(#ctlBody)" stroke={GOLD} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M262 90 Q350 82 438 90" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="3" />
    {/* sticks */}
    {[[275, 125], [390, 180]].map(([x, y], i) => (
      <g key={i}><circle cx={x} cy={y} r="19" fill="#0b0805" stroke={LINE} strokeWidth="2" /><circle cx={x} cy={y} r="12" fill="#241b12" stroke={GOLD} strokeWidth="1.5" />
        <text x={x} y={y + 4} textAnchor="middle" className="ctl-btn sm">{i ? 'R' : 'L'}</text></g>
    ))}
    {/* d-pad */}
    <path d="M302 158h16v14h14v16h-14v14h-16v-14h-14v-16h14Z" fill="#0b0805" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
    {/* view / menu */}
    <circle cx="327" cy="118" r="7" fill="#0b0805" stroke={LINE} strokeWidth="1.5" /><circle cx="373" cy="118" r="7" fill="#0b0805" stroke={LINE} strokeWidth="1.5" />
    <path d="M323 116h5v4h-5Z M326 114h5v4" fill="none" stroke="#e8dcc0" strokeWidth="1" /><path d="M369 115.5h8M369 118h8M369 120.5h8" stroke="#e8dcc0" strokeWidth="1.1" />
    <circle cx="350" cy="100" r="9" fill="#0b0805" stroke={GOLD} strokeWidth="1.5" /><path d="M346 96l8 8M354 96l-8 8" stroke={GOLD} strokeWidth="1.2" />
    {/* face buttons */}
    {FACE.map(([b, [x, y], c]) => (
      <g key={b}><circle cx={x} cy={y} r="9.5" fill="#0b0805" stroke={c} strokeWidth="2" /><text x={x} y={y + 4} textAnchor="middle" className="ctl-btn" fill={c}>{b}</text></g>
    ))}
    {/* callouts */}
    {LEFT.map(([k, label, [tx, ty]], i) => (
      <g key={k}>
        <polyline points={`158,${ROW(i)} 196,${ROW(i)} ${tx},${ty}`} fill="none" stroke={LINE} strokeWidth="1" strokeOpacity=".8" />
        <circle cx={tx} cy={ty} r="2" fill={GOLD} />
        <text x="152" y={ROW(i) - 2} textAnchor="end" className="ctl-act">{label}</text>
        <text x="152" y={ROW(i) + 13} textAnchor="end" className="ctl-key">{k}</text>
      </g>
    ))}
    {RIGHT.map(([k, label, [tx, ty]], i) => (
      <g key={k}>
        <polyline points={`542,${ROW(i)} 504,${ROW(i)} ${tx},${ty}`} fill="none" stroke={LINE} strokeWidth="1" strokeOpacity=".8" />
        <circle cx={tx} cy={ty} r="2" fill={GOLD} />
        <text x="548" y={ROW(i) - 2} className="ctl-act">{label}</text>
        <text x="548" y={ROW(i) + 13} className="ctl-key">{k}</text>
      </g>
    ))}
  </svg>
);
