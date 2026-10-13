import React from 'react';

/** Painted, filled SVG icons for the action bar. Each fills its slot on a dark vignetted background. */

const Art: React.FC<{ k: string; c: string; children: React.ReactNode }> = ({ k, c, children }) => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ display: 'block' }} aria-hidden>
    <defs>
      <radialGradient id={`${k}-bg`} cx="50%" cy="45%" r="70%"><stop offset="0" stopColor={c} stopOpacity=".55" /><stop offset=".6" stopColor="#14101a" /><stop offset="1" stopColor="#050407" /></radialGradient>
      <radialGradient id={`${k}-vg`} cx="50%" cy="50%" r="72%"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".75" /></radialGradient>
      <linearGradient id={`${k}-fire`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2a0" /><stop offset=".4" stopColor="#ffa63a" /><stop offset="1" stopColor="#d2301a" /></linearGradient>
      <linearGradient id={`${k}-ice`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2fdff" /><stop offset=".5" stopColor="#7fd6ff" /><stop offset="1" stopColor="#2a6fd0" /></linearGradient>
      <linearGradient id={`${k}-steel`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4f7fb" /><stop offset=".5" stopColor="#9aa7bb" /><stop offset="1" stopColor="#4a566a" /></linearGradient>
      <linearGradient id={`${k}-gold`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3b0" /><stop offset=".5" stopColor="#e9b949" /><stop offset="1" stopColor="#8b5a16" /></linearGradient>
      <linearGradient id={`${k}-green`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d8ffb0" /><stop offset=".5" stopColor="#5fd35a" /><stop offset="1" stopColor="#1d7a30" /></linearGradient>
      <linearGradient id={`${k}-purp`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0d8ff" /><stop offset=".5" stopColor="#a15cf0" /><stop offset="1" stopColor="#4a1c9a" /></linearGradient>
      <linearGradient id={`${k}-red`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb0a0" /><stop offset=".5" stopColor="#e83a2e" /><stop offset="1" stopColor="#7a0f14" /></linearGradient>
      <linearGradient id={`${k}-blue`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4e2ff" /><stop offset=".5" stopColor="#3f86f0" /><stop offset="1" stopColor="#14307e" /></linearGradient>
      <linearGradient id={`${k}-wood`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6a4220" /><stop offset=".5" stopColor="#a8703a" /><stop offset="1" stopColor="#5a3418" /></linearGradient>
      <filter id={`${k}-glow`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" /></filter>
    </defs>
    <rect width="64" height="64" fill={`url(#${k}-bg)`} />
    {children}
    <rect width="64" height="64" fill={`url(#${k}-vg)`} />
  </svg>
);

const u = (k: string, n: string) => `url(#${k}-${n})`;
const S = '#0d0703';

type P = { k: string };

const ArrowShape: React.FC<P & { tx: number; ty: number; r: number; s?: number; g?: string }> = ({ k, tx, ty, r, s = 1, g = 'green' }) => (
  <g transform={`translate(${tx} ${ty}) rotate(${r}) scale(${s})`}>
    <rect x="-1.2" y="-14" width="2.4" height="26" fill={u(k, 'wood')} stroke={S} strokeWidth=".6" />
    <path d="M0 -22 L5 -12 L0 -14 L-5 -12Z" fill={u(k, 'steel')} stroke={S} strokeWidth=".8" strokeLinejoin="round" />
    <path d="M0 12 L5 20 L0 17 L-5 20Z" fill={u(k, g)} stroke={S} strokeWidth=".7" strokeLinejoin="round" />
    <path d="M0 6 L4 13 L0 11 L-4 13Z" fill={u(k, g)} stroke={S} strokeWidth=".7" strokeLinejoin="round" opacity=".9" />
  </g>
);

const ICONS: Record<string, (k: string) => React.ReactNode> = {
  ARROW_RAIN: (k) => <Art k={k} c="#ffd24a">
    {/* Hawk's Focus: glowing golden eye + feathers */}
    <circle cx="32" cy="32" r="24" fill="#ffd24a" opacity=".22" filter={u(k, 'glow')} />
    <path d="M6 32 C16 14 48 14 58 32 C48 50 16 50 6 32Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="32" cy="32" r="12" fill="#fff6c8" stroke={S} strokeWidth="1.2" />
    <circle cx="32" cy="32" r="7" fill="#e07a10" /><circle cx="32" cy="32" r="3.4" fill="#120804" />
    <circle cx="29.5" cy="29.5" r="1.6" fill="#fff" />
    <path d="M10 14 L20 22 M54 14 L44 22 M32 6 V14" stroke="#fff3b0" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M12 52 L24 44 M52 52 L40 44" stroke="#ffb030" strokeWidth="3" strokeLinecap="round" opacity=".8" />
  </Art>,
  FIREBALL: (k) => <Art k={k} c="#ff7a2a">
    <path d="M14 56 C10 40 26 36 24 22 C34 30 36 38 32 44 C42 38 40 26 36 16 C52 26 58 46 44 56Z" fill={u(k, 'fire')} opacity=".5" filter={u(k, 'glow')} />
    <path d="M32 6 C40 16 52 22 50 38 C48 52 38 58 30 58 C18 58 10 48 14 36 C16 30 22 28 22 20 C28 22 30 26 30 30 C34 24 34 14 32 6Z" fill={u(k, 'fire')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M32 26 C38 32 42 38 38 46 C36 52 28 52 26 46 C24 40 30 36 32 26Z" fill="#fff0a0" opacity=".9" />
    <ellipse cx="25" cy="30" rx="3" ry="6" fill="#fff" opacity=".35" transform="rotate(25 25 30)" />
  </Art>,
  AXE_SPIN: (k) => <Art k={k} c="#ff5a4a">
    <circle cx="32" cy="32" r="22" fill="none" stroke="#ff6a5a" strokeWidth="3" strokeDasharray="22 10" opacity=".55" filter={u(k, 'glow')} />
    <circle cx="32" cy="32" r="22" fill="none" stroke="#ffd0c0" strokeWidth="1.2" strokeDasharray="22 10" />
    <rect x="30.3" y="8" width="3.4" height="48" rx="1.4" fill={u(k, 'wood')} stroke={S} strokeWidth=".8" transform="rotate(45 32 32)" />
    <path d="M32 14 C48 10 54 22 46 32 C42 24 38 24 32 26Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" transform="rotate(45 32 32)" />
    <path d="M32 50 C16 54 10 42 18 32 C22 40 26 40 32 38Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" transform="rotate(45 32 32)" />
    <circle cx="32" cy="32" r="3.2" fill={u(k, 'gold')} stroke={S} strokeWidth=".8" />
  </Art>,
  PIERCING_SHOT: (k) => <Art k={k} c="#ffd24a">
    <circle cx="32" cy="32" r="17" fill="none" stroke="#ffd24a" strokeWidth="1.6" opacity=".5" />
    <path d="M2 62 L26 38" stroke="#ffd24a" strokeWidth="7" opacity=".4" filter={u(k, 'glow')} />
    <path d="M6 58 L20 44 M12 62 L24 50" stroke="#fff2a0" strokeWidth="1.6" opacity=".8" />
    <g transform="translate(34 30) rotate(45)">
      <rect x="-1.8" y="-6" width="3.6" height="36" fill={u(k, 'wood')} stroke={S} strokeWidth=".7" />
      <path d="M0 -32 L8 -12 L0 -17 L-8 -12Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1" strokeLinejoin="round" />
      <path d="M0 26 L7 36 L0 32 L-7 36Z" fill={u(k, 'red')} stroke={S} strokeWidth=".8" strokeLinejoin="round" />
    </g>
    <circle cx="50" cy="14" r="3" fill="#fff" opacity=".8" /><circle cx="50" cy="14" r="7" fill="none" stroke="#fff2a0" strokeWidth="1.2" opacity=".7" />
  </Art>,
  GRAVITY_SPELL: (k) => <Art k={k} c="#8a4be0">
    <ellipse cx="32" cy="32" rx="26" ry="11" fill="none" stroke={u(k, 'purp')} strokeWidth="3" transform="rotate(-25 32 32)" opacity=".9" />
    <ellipse cx="32" cy="32" rx="20" ry="8" fill="none" stroke="#e6c8ff" strokeWidth="1.3" transform="rotate(35 32 32)" opacity=".8" />
    <circle cx="32" cy="32" r="14" fill="#a15cf0" opacity=".45" filter={u(k, 'glow')} />
    <circle cx="32" cy="32" r="11" fill="#050208" stroke="#c58bff" strokeWidth="1.6" />
    <circle cx="32" cy="32" r="5" fill="#000" />
    <circle cx="11" cy="22" r="1.6" fill="#fff" /><circle cx="53" cy="42" r="1.4" fill="#e6c8ff" /><circle cx="44" cy="12" r="1.2" fill="#fff" />
  </Art>,
  RAGE: (k) => <Art k={k} c="#ff3a2a">
    <path d="M32 4 L38 16 L52 10 L46 24 L60 28 L48 36 L56 50 L40 46 L32 60 L24 46 L8 50 L16 36 L4 28 L18 24 L12 10 L26 16Z" fill={u(k, 'red')} opacity=".55" filter={u(k, 'glow')} />
    <g transform="translate(32 32)">
      <path d="M-18 -18 L18 18" stroke={S} strokeWidth="7" strokeLinecap="round" /><path d="M18 -18 L-18 18" stroke={S} strokeWidth="7" strokeLinecap="round" />
      <path d="M-18 -18 L18 18" stroke={u(k, 'steel')} strokeWidth="4.5" strokeLinecap="round" /><path d="M18 -18 L-18 18" stroke={u(k, 'steel')} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M-20 -20 L-14 -14 M20 -20 L14 -14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle r="6" fill={u(k, 'red')} stroke={S} strokeWidth="1.2" /><circle r="2.2" fill="#ffd0c0" />
    </g>
  </Art>,
  SPRINT: (k) => <Art k={k} c="#38e0a0">
    <path d="M4 22 H24 M2 32 H20 M6 42 H22" stroke="#7affc8" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
    <path d="M26 14 L40 14 L42 34 L56 40 C58 46 56 52 50 52 L26 52 C24 52 24 46 26 44Z" fill={u(k, 'green')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M26 44 L50 44" stroke={S} strokeWidth="1.4" /><path d="M28 16 L38 16" stroke="#fff" strokeWidth="1.4" opacity=".6" strokeLinecap="round" />
    <path d="M40 14 C50 6 60 8 62 4 C58 18 50 20 42 22Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
  </Art>,
  EARTHWALL: (k) => <Art k={k} c="#c8884a">
    <path d="M6 24 H58 V54 H6Z" fill="#8a5a30" stroke={S} strokeWidth="1.6" />
    {[[6, 24, 20, 10], [26, 24, 18, 10], [44, 24, 14, 10], [6, 34, 12, 10], [18, 34, 20, 10], [38, 34, 20, 10], [6, 44, 20, 10], [26, 44, 16, 10], [42, 44, 16, 10]].map(([x, y, w, h], i) => (
      <rect key={i} x={x + .6} y={y + .6} width={w - 1.2} height={h - 1.2} rx="1.5" fill={i % 2 ? '#b0743c' : '#c88a4c'} stroke={S} strokeWidth="1" />
    ))}
    <path d="M4 24 C10 14 18 18 22 20 C26 12 34 14 38 20 C44 14 54 14 60 24Z" fill={u(k, 'green')} stroke={S} strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M8 26 H56" stroke="#fff" strokeOpacity=".25" strokeWidth="1" />
  </Art>,
  VITALITY: (k) => <Art k={k} c="#ff4a5a">
    <circle cx="32" cy="34" r="22" fill="#ff3a4a" opacity=".35" filter={u(k, 'glow')} />
    <path d="M32 56 C10 40 6 26 12 18 C18 10 28 12 32 20 C36 12 46 10 52 18 C58 26 54 40 32 56Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M16 22 C18 17 24 16 27 20" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".6" />
    <path d="M32 26 V42 M24 34 H40" stroke="#d8ffb0" strokeWidth="5" strokeLinecap="round" /><path d="M32 26 V42 M24 34 H40" stroke="#5fd35a" strokeWidth="2.6" strokeLinecap="round" />
  </Art>,
  DASH: (k) => <Art k={k} c="#38c8e0">
    <path d="M2 26 H20 M4 36 H18 M8 46 H22" stroke="#7ae8ff" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
    <circle cx="42" cy="14" r="6" fill={u(k, 'ice')} stroke={S} strokeWidth="1.3" />
    <path d="M38 22 L50 24 L46 36 L54 50 M46 36 L36 40 L28 54 M38 22 L28 28 L22 26 M50 24 L58 18" stroke={S} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M38 22 L50 24 L46 36 L54 50 M46 36 L36 40 L28 54 M38 22 L28 28 L22 26 M50 24 L58 18" stroke={u(k, 'ice')} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Art>,
  burning: (k) => <Art k={k} c="#ff6a2a">
    <path d="M32 2 C40 14 50 20 48 34 C46 44 40 48 36 50 L28 50 C22 48 16 42 18 32 C20 26 26 24 26 16 C30 20 32 24 32 28 C36 20 34 10 32 2Z" fill={u(k, 'fire')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M32 24 C36 30 38 36 35 42 C32 46 28 44 28 40 C28 36 31 32 32 24Z" fill="#fff0a0" />
    <path d="M32 62 L24 46 L32 49 L40 46Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M32 49 V62" stroke={S} strokeWidth="2" />
  </Art>,
  freezing: (k) => <Art k={k} c="#7ee0ff">
    <path d="M10 36 C16 22 30 16 44 22 M14 48 C22 36 36 32 52 38" stroke="#bff0ff" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".8" />
    <path d="M8 40 C12 30 20 26 26 28" stroke="#7ee0ff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7" />
    <g transform="translate(34 30) rotate(45)">
      <path d="M0 -30 L9 -8 L0 -13 L-9 -8Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="-1.8" y="-10" width="3.6" height="34" fill="#cdf4ff" stroke={S} strokeWidth=".8" />
      <path d="M-7 28 L0 18 L7 28 L0 25Z" fill={u(k, 'ice')} stroke={S} strokeWidth=".9" strokeLinejoin="round" />
    </g>
    <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M50 12 V22 M45 17 H55 M46.5 13.5 L53.5 20.5 M53.5 13.5 L46.5 20.5" /></g>
  </Art>,
  freezeSpell: (k) => <Art k={k} c="#5b9bff">
    <path d="M32 4 L44 26 L40 58 L32 62 L24 58 L20 26Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M32 4 L32 62 M20 26 L44 26" stroke="#fff" strokeOpacity=".5" strokeWidth="1" />
    <path d="M24 28 L28 14 L28 46 Z" fill="#fff" opacity=".35" />
    <path d="M10 40 L18 34 L16 46Z M54 38 L46 32 L48 44Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
  </Art>,
  storm: (k) => <Art k={k} c="#8fa0ff">
    {[[8, 12, 48], [14, 22, 36], [20, 32, 24], [25, 42, 14]].map(([x, y, w], i) => (
      <path key={i} d={`M${x} ${y} C${x + w * .3} ${y - 6} ${x + w * .8} ${y - 6} ${x + w} ${y} C${x + w * .8} ${y + 7} ${x + w * .3} ${y + 7} ${x} ${y}Z`} fill={i % 2 ? '#aab6ff' : '#d8defc'} stroke={S} strokeWidth="1.3" />
    ))}
    <path d="M28 50 L34 50 L32 58Z" fill="#8fa0ff" stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="14" cy="52" r="1.5" fill="#fff" /><circle cx="50" cy="48" r="1.5" fill="#fff" />
  </Art>,
  thunder: (k) => <Art k={k} c="#ffe14a">
    <path d="M12 46 L26 24 L38 40 L52 16" stroke="#ffe14a" strokeWidth="7" fill="none" opacity=".45" filter={u(k, 'glow')} strokeLinejoin="round" />
    <path d="M12 46 L22 36 L18 32 L28 22 L36 34 L32 36 L42 30 L52 16" stroke={S} strokeWidth="6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M12 46 L22 36 L18 32 L28 22 L36 34 L32 36 L42 30 L52 16" stroke="#fff6b0" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    {[[12, 46], [28, 22], [52, 16], [44, 50]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="6" fill={u(k, 'gold')} stroke={S} strokeWidth="1.3" /><circle cx={x} cy={y} r="2.2" fill="#fff" /></g>)}
    <path d="M36 34 L44 50" stroke="#ffe14a" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 3" />
  </Art>,
  stamp: (k) => <Art k={k} c="#ff9a3c">
    <ellipse cx="32" cy="52" rx="26" ry="7" fill="none" stroke="#ffb05a" strokeWidth="2" opacity=".9" />
    <ellipse cx="32" cy="52" rx="16" ry="4" fill="none" stroke="#ffd9a0" strokeWidth="1.6" opacity=".8" />
    <path d="M8 56 L20 50 M56 56 L44 50 M32 58 V46" stroke="#ffb05a" strokeWidth="2" strokeLinecap="round" />
    <path d="M18 8 H46 L50 28 C50 36 44 42 32 42 C20 42 14 36 14 28Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M22 12 H42 M20 20 H44" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".6" />
    <path d="M22 28 V38 M32 28 V40 M42 28 V38" stroke={S} strokeWidth="1.4" opacity=".6" />
  </Art>,
  orbital: (k) => <Art k={k} c="#5ac0ff">
    <ellipse cx="32" cy="32" rx="24" ry="24" fill="none" stroke="#6ec1ff" strokeOpacity=".5" strokeWidth="1.4" strokeDasharray="3 3" />
    <circle cx="32" cy="32" r="9" fill={u(k, 'ice')} stroke={S} strokeWidth="1.4" />
    {[[32, 8], [53, 44], [11, 44]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="7" fill="#6ec1ff" opacity=".5" filter={u(k, 'glow')} /><circle cx={x} cy={y} r="5" fill={u(k, 'ice')} stroke={S} strokeWidth="1.2" /></g>)}
  </Art>,
  barrier: (k) => <Art k={k} c="#ffb347">
    <path d="M32 4 L54 12 V32 C54 46 44 56 32 60 C20 56 10 46 10 32 V12Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M32 10 L48 16 V32 C48 43 41 51 32 55 C23 51 16 43 16 32 V16Z" fill="#3a6fd8" stroke={S} strokeWidth="1" />
    <path d="M32 10 L48 16 V32 C48 43 41 51 32 55Z" fill="#14307e" opacity=".6" />
    <path d="M32 20 L36 30 H46 L38 36 L41 46 L32 40 L23 46 L26 36 L18 30 H28Z" fill={u(k, 'gold')} stroke={S} strokeWidth=".8" strokeLinejoin="round" />
  </Art>,
  regen: (k) => <Art k={k} c="#4ade80">
    <circle cx="32" cy="32" r="22" fill="#4ade80" opacity=".3" filter={u(k, 'glow')} />
    <path d="M32 56 C10 40 6 26 12 18 C18 10 28 12 32 20 C36 12 46 10 52 18 C58 26 54 40 32 56Z" fill={u(k, 'green')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M16 22 C18 17 24 16 27 20" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".6" />
    <path d="M32 26 V42 M24 34 H40" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" opacity=".95" />
  </Art>,
  magnet: (k) => <Art k={k} c="#c58bff">
    <path d="M14 10 V34 C14 52 50 52 50 34 V10" fill="none" stroke={S} strokeWidth="15" strokeLinejoin="round" />
    <path d="M14 10 V34 C14 52 50 52 50 34 V10" fill="none" stroke={u(k, 'red')} strokeWidth="11" />
    <rect x="8.5" y="6" width="11" height="12" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" /><rect x="44.5" y="6" width="11" height="12" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" />
    <path d="M18 24 V34 C18 44 28 48 32 48" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".4" />
    <path d="M26 2 L30 8 M38 2 L34 8" stroke="#e6c8ff" strokeWidth="2" strokeLinecap="round" />
  </Art>,
  HP: (k) => <Bottle k={k} c="#ff3a3a" liquid="red" />,
  MP: (k) => <Bottle k={k} c="#3f86f0" liquid="blue" />,
  STAR: (k) => <Art k={k} c="#888"><path d="M32 12 L37 26 L52 26 L40 35 L44 50 L32 41 L20 50 L24 35 L12 26 L27 26Z" fill="#6a6470" stroke={S} strokeWidth="1.4" strokeLinejoin="round" /></Art>,
};

const Bottle: React.FC<P & { c: string; liquid: string }> = ({ k, c, liquid }) => (
  <Art k={k} c={c}>
    <ellipse cx="32" cy="54" rx="18" ry="4" fill={c} opacity=".5" filter={u(k, 'glow')} />
    <rect x="25" y="6" width="14" height="10" rx="2" fill="#a8703a" stroke={S} strokeWidth="1.4" />
    <path d="M26 16 H38 V24 C50 30 54 38 54 46 C54 54 46 58 32 58 C18 58 10 54 10 46 C10 38 14 30 26 24Z" fill="#d8ecff" fillOpacity=".25" stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 38 C20 34 26 40 32 37 C38 34 44 40 50 36 C53 40 54 43 54 46 C54 54 46 57 32 57 C18 57 10 54 10 46 C10 43 12 40 14 38Z" fill={u(k, liquid)} />
    <path d="M18 34 C16 38 14 42 15 47" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".7" />
    <circle cx="40" cy="46" r="1.8" fill="#fff" opacity=".5" /><circle cx="30" cy="50" r="1.2" fill="#fff" opacity=".5" />
  </Art>
);

export const SKILL_KEYS = Object.keys(ICONS);

/** Painted icon filling its parent. `id` is an ability / skill / potion key. */
export const PaintedIcon: React.FC<{ id: string }> = React.memo(({ id }) => {
  const f = ICONS[id] ?? ICONS.STAR;
  return <span className="painted">{f(`pi-${id}`)}</span>;
});

export const LockGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ filter: 'drop-shadow(0 1px 2px #000)' }}>
    <defs><linearGradient id="lk-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0b0" /><stop offset=".5" stopColor="#e0a838" /><stop offset="1" stopColor="#8b5a16" /></linearGradient></defs>
    <path d="M9 14 V10 C9 5 12 3 16 3 C20 3 23 5 23 10 V14" fill="none" stroke="#0d0703" strokeWidth="5.5" strokeLinecap="round" />
    <path d="M9 14 V10 C9 5 12 3 16 3 C20 3 23 5 23 10 V14" fill="none" stroke="url(#lk-g)" strokeWidth="3" strokeLinecap="round" />
    <rect x="5" y="13" width="22" height="16" rx="3" fill="url(#lk-g)" stroke="#0d0703" strokeWidth="1.5" />
    <circle cx="16" cy="20" r="2.6" fill="#2a1808" /><rect x="15" y="20" width="2" height="5" rx="1" fill="#2a1808" />
    <path d="M8 16 H24" stroke="#fff" strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const CoinGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
    <defs><radialGradient id="cn-g" cx="40%" cy="35%" r="75%"><stop offset="0" stopColor="#fff3b0" /><stop offset=".55" stopColor="#e9a82a" /><stop offset="1" stopColor="#8b4f10" /></radialGradient></defs>
    <circle cx="16" cy="16" r="14" fill="url(#cn-g)" stroke="#0d0703" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="9.5" fill="none" stroke="#7a4410" strokeWidth="1.6" />
    <path d="M16 9 L18 14 H23 L19 17 L20.6 22 L16 19 L11.4 22 L13 17 L9 14 H14Z" fill="#fff0b0" opacity=".9" />
  </svg>
);

export const GemGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
    <defs><linearGradient id="gm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d4f6ff" /><stop offset=".5" stopColor="#3fb8f0" /><stop offset="1" stopColor="#1450b0" /></linearGradient></defs>
    <circle cx="16" cy="16" r="14" fill="#0e2a52" stroke="#0d0703" strokeWidth="1.5" />
    <path d="M16 5 L25 13 L16 28 L7 13Z" fill="url(#gm-g)" stroke="#0d0703" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M7 13 H25 M12 13 L16 5 L20 13 L16 28 L12 13" stroke="#fff" strokeOpacity=".6" strokeWidth=".9" fill="none" />
  </svg>
);

export const SkullGlyph: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
    <defs><linearGradient id="sk-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3b0" /><stop offset=".6" stopColor="#d8a23c" /><stop offset="1" stopColor="#7a4a10" /></linearGradient></defs>
    <path d="M16 3 C8 3 4 9 4 15 C4 19 6 21 8 23 V28 H24 V23 C26 21 28 19 28 15 C28 9 24 3 16 3Z" fill="url(#sk-g)" stroke="#0d0703" strokeWidth="1.5" strokeLinejoin="round" />
    <ellipse cx="11" cy="15" rx="3.4" ry="4" fill="#120804" /><ellipse cx="21" cy="15" rx="3.4" ry="4" fill="#120804" />
    <path d="M16 18 L14 22 H18Z" fill="#120804" /><path d="M12 24 V28 M16 24 V28 M20 24 V28" stroke="#120804" strokeWidth="1.3" />
  </svg>
);
