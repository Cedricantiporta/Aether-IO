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
  storm: (k) => <Art k={k} c="#b46bff">
    <circle cx="32" cy="34" r="25" fill="#a855f7" opacity=".22" filter={u(k, 'glow')} />
    <circle cx="32" cy="34" r="22" fill="none" stroke={u(k, 'purp')} strokeWidth="4" />
    <circle cx="32" cy="34" r="22" fill="none" stroke="#f0d8ff" strokeOpacity=".55" strokeWidth="1" />
    <path d="M32 18 L44 23 V34 C44 42 38 47 32 50 C26 47 20 42 20 34 V23Z" fill={u(k, 'purp')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M32 24 L34 31 L41 33 L34 35 L32 42 L30 35 L23 33 L30 31Z" fill="#fff" opacity=".85" />
    <path d="M14 22 C18 14 24 11 30 10" stroke="#fff" strokeOpacity=".6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </Art>,
  thunder: (k) => <Art k={k} c="#ffe14a">
    <path d="M12 46 L26 24 L38 40 L52 16" stroke="#ffe14a" strokeWidth="7" fill="none" opacity=".45" filter={u(k, 'glow')} strokeLinejoin="round" />
    <path d="M12 46 L22 36 L18 32 L28 22 L36 34 L32 36 L42 30 L52 16" stroke={S} strokeWidth="6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M12 46 L22 36 L18 32 L28 22 L36 34 L32 36 L42 30 L52 16" stroke="#fff6b0" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    {[[12, 46], [28, 22], [52, 16], [44, 50]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="6" fill={u(k, 'gold')} stroke={S} strokeWidth="1.3" /><circle cx={x} cy={y} r="2.2" fill="#fff" /></g>)}
    <path d="M36 34 L44 50" stroke="#ffe14a" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 3" />
  </Art>,
  stamp: (k) => <Art k={k} c="#ff6a3c">
    <circle cx="32" cy="32" r="26" fill="none" stroke="#ff9a5a" strokeWidth="2" strokeDasharray="6 5" opacity=".7" filter={u(k, 'glow')} />
    <g transform="translate(16 34) rotate(-35)"><rect x="-1.8" y="-4" width="3.6" height="30" rx="1.2" fill="#6a4a30" stroke={S} strokeWidth="1" /><path d="M0 -20 C14 -22 20 -6 12 2 C9 -3 5 -4 0 -4Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /><path d="M0 -20 C-14 -22 -20 -6 -12 2 C-9 -3 -5 -4 0 -4Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /></g>
    <g transform="translate(32 30) rotate(0)"><rect x="-1.8" y="-4" width="3.6" height="30" rx="1.2" fill="#6a4a30" stroke={S} strokeWidth="1" /><path d="M0 -20 C14 -22 20 -6 12 2 C9 -3 5 -4 0 -4Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /><path d="M0 -20 C-14 -22 -20 -6 -12 2 C-9 -3 -5 -4 0 -4Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /></g>
    <g transform="translate(48 34) rotate(35)"><rect x="-1.8" y="-4" width="3.6" height="30" rx="1.2" fill="#6a4a30" stroke={S} strokeWidth="1" /><path d="M0 -20 C14 -22 20 -6 12 2 C9 -3 5 -4 0 -4Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /><path d="M0 -20 C-14 -22 -20 -6 -12 2 C-9 -3 -5 -4 0 -4Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /></g>
    <path d="M6 14 L14 18 M58 14 L50 18 M32 4 V10" stroke="#ffd070" strokeWidth="2.2" strokeLinecap="round" />
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


// ---------------------------------------------------------------- active kit --
Object.assign(ICONS, {
  GALE_ARROW: (k: string) => <Art k={k} c="#5fe0b0">
    <path d="M6 40 C20 34 30 44 44 36 M4 30 C18 24 28 34 42 26 M8 50 C20 44 30 52 40 46" stroke="#9ff5d0" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity=".7" />
    <ArrowShape k={k} tx={34} ty={32} r={62} s={1.35} g="green" />
    <circle cx="48" cy="20" r="8" fill="none" stroke="#d8fff0" strokeWidth="1.6" opacity=".8" /><circle cx="48" cy="20" r="13" fill="none" stroke="#7affc8" strokeWidth="1.2" opacity=".5" />
  </Art>,
  SHADOW_ROLL: (k: string) => <Art k={k} c="#8ac060">
    <circle cx="26" cy="38" r="14" fill="#10180c" stroke="#6bd05a" strokeWidth="2" strokeDasharray="6 4" />
    <path d="M10 44 L26 38 L38 24" stroke="#c8f0a0" strokeWidth="3" strokeLinecap="round" fill="none" />
    <path d="M30 52 L46 36 M36 54 L52 40 M42 56 L56 46" stroke="#e6ffc8" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M48 12 L52 22 L44 22Z M40 10 L44 20 L36 20Z M56 16 L58 26 L50 26Z" fill={u(k, 'steel')} stroke={S} strokeWidth=".8" />
    <circle cx="46" cy="30" r="14" fill="#ffd24a" opacity=".25" filter={u(k, 'glow')} />
  </Art>,
  FAN_FLAMES: (k: string) => <Art k={k} c="#ff7a2a">
    <path d="M32 58 L8 14 M32 58 L20 8 M32 58 L32 6 M32 58 L44 8 M32 58 L56 14" stroke={u(k, 'fire')} strokeWidth="4.5" strokeLinecap="round" />
    <path d="M8 14 L10 22 M20 8 L22 16 M32 6 L34 14 M44 8 L42 16 M56 14 L52 22" stroke="#fff2a0" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M10 60 C16 48 26 52 32 44 C38 52 48 48 54 60Z" fill={u(k, 'fire')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M26 60 C28 52 34 54 36 60Z" fill="#fff0a0" />
  </Art>,
  LIGHT_ARROW: (k: string) => <Art k={k} c="#ffffff">
    <circle cx="32" cy="32" r="24" fill="#ffffff" opacity=".18" filter={u(k, 'glow')} />
    <path d="M6 58 L56 8" stroke="#0d0703" strokeWidth="7" strokeLinecap="round" />
    <path d="M6 58 L56 8" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
    <path d="M58 6 L44 10 L54 20Z" fill="#ffffff" stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M12 44 L4 46 M20 52 L18 60 M16 48 L8 56" stroke="#dfeaff" strokeWidth="2" strokeLinecap="round" />
  </Art>,
  FROST_FIELD: (k: string) => <Art k={k} c="#6ad0ff">
    <ellipse cx="32" cy="46" rx="26" ry="10" fill="#9fe8ff" opacity=".25" stroke="#bff4ff" strokeWidth="1.6" />
    <path d="M32 8 L40 36 L32 48 L24 36Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M16 24 L22 42 L14 46 L10 36Z M48 24 L54 36 L50 46 L42 42Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M32 8 L36 34 M24 36 L32 48" stroke="#fff" strokeWidth="1" opacity=".7" />
  </Art>,
  graveCall: (k: string) => <Art k={k} c="#b08aff">
    <path d="M14 58 V30 a18 18 0 0 1 36 0 V58Z" fill="#5a5060" stroke={S} strokeWidth="1.6" />
    <path d="M32 30 v14 M25 36 h14" stroke="#ebe5d0" strokeWidth="3" strokeLinecap="round" />
    <path d="M22 60 l4 -8 M42 60 l-4 -8" stroke="#ebe5d0" strokeWidth="3" strokeLinecap="round" />
  </Art>,
  soulHarvest: (k: string) => <Art k={k} c="#9a6bd8">
    <path d="M32 54 C14 42 12 28 20 22 C26 18 30 22 32 26 C34 22 38 18 44 22 C52 28 50 42 32 54Z" fill="#7a3ab0" stroke={S} strokeWidth="1.6" />
    <path d="M24 14 C26 8 30 10 32 4 C34 10 38 8 40 14" fill="none" stroke="#d8ffd0" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  boneArmor: (k: string) => <Art k={k} c="#ebe5d0">
    <path d="M32 6 L54 14 V32 C54 46 44 54 32 60 C20 54 10 46 10 32 V14Z" fill="#5a4a6a" stroke={S} strokeWidth="1.6" />
    {[20, 30, 40].map((y) => <path key={y} d={`M18 ${y} h28`} stroke="#ebe5d0" strokeWidth="3.4" strokeLinecap="round" />)}
  </Art>,
  RAISE_DEAD: (k: string) => <Art k={k} c="#b08aff">
    <ellipse cx="32" cy="54" rx="24" ry="6" fill="#3a1a50" opacity=".8" />
    <circle cx="32" cy="26" r="11" fill="#ebe5d0" stroke={S} strokeWidth="1.5" />
    <circle cx="28" cy="25" r="2.6" fill="#9a6bff" /><circle cx="36" cy="25" r="2.6" fill="#9a6bff" />
    <path d="M27 33 h10 M29 33 v4 M32 33 v4 M35 33 v4" stroke={S} strokeWidth="1.4" />
    <path d="M14 56 L22 38 M50 56 L42 38" stroke="#ebe5d0" strokeWidth="4" strokeLinecap="round" />
    <path d="M18 40 l-4 -5 M22 38 l1 -6 M46 40 l4 -5 M42 38 l-1 -6" stroke="#ebe5d0" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  SOUL_STEP: (k: string) => <Art k={k} c="#9a6bd8">
    <path d="M10 46 C18 30 30 50 40 30" fill="none" stroke="#b08aff" strokeWidth="5" strokeLinecap="round" opacity=".6" />
    <circle cx="46" cy="22" r="9" fill="#2a1840" stroke="#b08aff" strokeWidth="2" />
    <path d="M14 54 l6 -6 M8 48 l8 -2 M20 58 l1 -8" stroke="#ebe5d0" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  BONE_SPEAR: (k: string) => <Art k={k} c="#ebe5d0">
    <path d="M8 56 L54 10" stroke={S} strokeWidth="8" strokeLinecap="round" />
    <path d="M8 56 L54 10" stroke="#ebe5d0" strokeWidth="5" strokeLinecap="round" />
    <path d="M58 6 L44 11 L53 20Z" fill="#f4efe0" stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M22 42 l-6 -2 M30 34 l-6 -2 M38 26 l-6 -2" stroke="#c9c2a8" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  BONE_WARD: (k: string) => <Art k={k} c="#b48cff">
    <path d="M32 8 L52 15 V30 C52 43 43 52 32 57 C21 52 12 43 12 30 V15 Z" fill="#2a1840" stroke="#d8c8ff" strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M32 14 L46 19 V30 C46 39 40 46 32 50 C24 46 18 39 18 30 V19 Z" fill="none" stroke="#b48cff" strokeWidth="1.4" opacity=".8" />
    <circle cx="32" cy="29" r="8" fill="#ebe5d0" stroke={S} strokeWidth="1.2" />
    <circle cx="29" cy="28.5" r="1.9" fill="#2a1840" /><circle cx="35" cy="28.5" r="1.9" fill="#2a1840" />
    <path d="M28.5 35.5 h7 M30 35.5 v3 M32 35.5 v3 M34 35.5 v3" stroke="#ebe5d0" strokeWidth="1.6" />
    <path d="M17 44 l-5 6 M47 44 l5 6" stroke="#ebe5d0" strokeWidth="2.6" strokeLinecap="round" />
  </Art>,
  CURSE_FIELD: (k: string) => <Art k={k} c="#8a4ad0">
    <ellipse cx="32" cy="44" rx="26" ry="11" fill="#5a2a8a" opacity=".7" stroke="#b08aff" strokeWidth="1.5" />
    <path d="M18 40 C20 30 26 34 24 22 M32 42 C36 30 30 26 34 14 M46 40 C44 30 40 32 42 22" fill="none" stroke="#8be05a" strokeWidth="3" strokeLinecap="round" opacity=".85" />
    <circle cx="32" cy="46" r="5" fill="#ebe5d0" stroke={S} strokeWidth="1" />
  </Art>,
  ARMY_DEAD: (k: string) => <Art k={k} c="#9a6bd8">
    {/* the Bone Golem: a hulking bone brute crashing down, purple soul-fire eyes, impact ring */}
    <rect width="64" height="64" fill="#140a20" opacity=".55" />
    <ellipse cx="32" cy="56" rx="26" ry="6" fill="#9a6bff" opacity=".35" filter={u(k, 'glow')} />
    <ellipse cx="32" cy="56" rx="22" ry="4.5" fill="none" stroke="#c9a2ff" strokeWidth="1.6" opacity=".8" />
    <path d="M14 52 L10 38 L16 26 L24 22 L40 22 L48 26 L54 38 L50 52 L42 52 L42 42 L22 42 L22 52Z" fill="#d9d2bc" stroke={S} strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M22 30 h20 M22 35 h20" stroke="#8a8270" strokeWidth="2" />
    <path d="M10 38 L4 46 L8 50 M54 38 L60 46 L56 50" stroke="#d9d2bc" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M24 22 C22 10 42 10 40 22Z" fill="#ebe5d0" stroke={S} strokeWidth="1.3" />
    <circle cx="28.5" cy="17" r="2.6" fill="#b47cff" /><circle cx="35.5" cy="17" r="2.6" fill="#b47cff" />
    <circle cx="32" cy="17" r="8" fill="#9a6bff" opacity=".45" filter={u(k, 'glow')} />
    <path d="M29 21 v2 M32 21 v2 M35 21 v2" stroke={S} strokeWidth="1.1" />
  </Art>,
  STORM_ARROWS: (k: string) => <Art k={k} c="#ffd24a">
    <rect width="64" height="64" fill="#0a0e24" opacity=".55" />
    {[[10, 6, 18], [24, 2, 22], [38, 8, 14], [52, 4, 20], [16, 24, 10], [44, 26, 12]].map(([x, y, r], i) => (
      <g key={i} transform={`translate(${x} ${y + 8}) rotate(${r})`}><rect x="-.9" y="0" width="1.8" height="22" fill="#ffe9a0" /><path d="M0 28 L4 20 L-4 20Z" fill="#fff" /><path d="M0 -2 L3 -8 M0 -2 L-3 -8" stroke="#ffb030" strokeWidth="2" /></g>
    ))}
    <circle cx="32" cy="54" r="14" fill="#ffd24a" opacity=".25" filter={u(k, 'glow')} />
    <path d="M10 56 Q32 44 54 56" stroke="#ffe9a0" strokeWidth="2" fill="none" />
  </Art>,
  SINGULARITY: (k: string) => <Art k={k} c="#8a4be0">
    <circle cx="32" cy="32" r="26" fill="none" stroke="#b07cff" strokeWidth="3" strokeDasharray="14 6" opacity=".8" filter={u(k, 'glow')} />
    <path d="M32 6 C50 8 58 28 44 38 C34 46 20 38 26 30 C30 24 38 28 34 33" fill="none" stroke="#d8b8ff" strokeWidth="3" strokeLinecap="round" />
    <path d="M32 58 C14 56 6 36 20 26 C30 18 44 26 38 34" fill="none" stroke="#8a5cf0" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="31" r="7" fill="#050208" stroke="#e8d8ff" strokeWidth="1.6" />
  </Art>,
  BLINK_NOVA: (k: string) => <Art k={k} c="#7fd8ff">
    <circle cx="20" cy="42" r="10" fill="none" stroke="#9fe4ff" strokeWidth="2" strokeDasharray="4 3" opacity=".7" />
    <path d="M24 38 L44 20" stroke="#e8fbff" strokeWidth="2.6" strokeDasharray="5 4" strokeLinecap="round" />
    <path d="M44 6 L48 18 L60 22 L48 26 L44 38 L40 26 L28 22 L40 18Z" fill={u(k, 'ice')} stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="44" cy="22" r="14" fill="#9fe4ff" opacity=".3" filter={u(k, 'glow')} />
  </Art>,
  STORM_ORBS: (k: string) => <Art k={k} c="#7a9aff">
    <ellipse cx="32" cy="34" rx="24" ry="12" fill="none" stroke="#8fb0ff" strokeWidth="1.6" opacity=".6" />
    {[[10, 34], [54, 34], [32, 22]].map(([x, y], i) => (<g key={i}><circle cx={x} cy={y} r="9" fill="#5a7aff" opacity=".4" filter={u(k, 'glow')} /><circle cx={x} cy={y} r="5.5" fill="#cfe0ff" stroke={S} strokeWidth="1" /><circle cx={x} cy={y} r="2.4" fill="#fff" /></g>))}
    <path d="M30 44 L36 50 L32 50 L38 58 L26 50 L31 50Z" fill="#fff6a0" stroke={S} strokeWidth=".8" strokeLinejoin="round" />
  </Art>,
  CHAIN_FROST: (k: string) => <Art k={k} c="#5ad8ff">
    <path d="M10 50 L26 30 L40 40 L54 14" stroke="#9fe8ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" fill="none" opacity=".85" />
    {[[10, 50, 6], [26, 30, 8], [40, 40, 6], [54, 14, 7]].map(([x, y, r], i) => (<g key={i}>
      <circle cx={x} cy={y} r={r + 5} fill="#7fe4ff" opacity=".35" filter={u(k, 'glow')} />
      <path d={`M${x} ${y - r - 2} L${x + r * 0.8} ${y} L${x} ${y + r + 2} L${x - r * 0.8} ${y}Z`} fill={u(k, 'ice')} stroke={S} strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx={x} cy={y} r="1.8" fill="#fff" /></g>))}
    <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round"><path d="M26 18 V26 M22 22 H30 M23 19 L29 25 M29 19 L23 25" /></g>
  </Art>,
  METEOR_CATA: (k: string) => <Art k={k} c="#ff5a2a">
    <path d="M58 4 L28 34" stroke="#ff8a30" strokeWidth="9" strokeLinecap="round" opacity=".55" filter={u(k, 'glow')} />
    <path d="M60 6 L30 30" stroke={u(k, 'fire')} strokeWidth="6" strokeLinecap="round" />
    <circle cx="26" cy="38" r="15" fill="#4a2a1a" stroke={S} strokeWidth="1.6" />
    <circle cx="26" cy="38" r="15" fill={u(k, 'fire')} opacity=".55" />
    <circle cx="21" cy="33" r="5" fill="#2a1408" opacity=".7" /><circle cx="31" cy="43" r="3.4" fill="#2a1408" opacity=".7" />
    <ellipse cx="32" cy="58" rx="26" ry="5" fill="none" stroke="#ffa63a" strokeWidth="2.4" />
    <path d="M8 20 L14 26 M14 10 L18 18" stroke="#ffd070" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  BLOODRAGE_LEAP: (k: string) => <Art k={k} c="#e83a2e">
    <path d="M6 54 Q26 4 52 40" stroke="#ff6a5a" strokeWidth="3" fill="none" strokeDasharray="5 4" strokeLinecap="round" />
    <path d="M44 34 L56 42 L42 46Z" fill="#ffb0a0" stroke={S} strokeWidth="1" strokeLinejoin="round" />
    <path d="M14 56 L22 46 L30 56 L38 46 L46 56Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M20 22 L34 12 L30 26 L40 24 L26 38 L28 26Z" fill="#ffb0a0" opacity=".9" stroke={S} strokeWidth=".8" strokeLinejoin="round" />
  </Art>,
  FIREBALLS: (k: string) => <Art k={k} c="#ff6a2a">
    {[[16, 44, 9], [32, 30, 11], [48, 44, 9]].map(([x, y, r], i) => <g key={i}>
      <path d={`M${x} ${y + r} Q${x - 4} ${y + r + 12} ${x + 2} ${y + r + 16}`} stroke="#ff8a30" strokeWidth="4" fill="none" opacity=".5" strokeLinecap="round" />
      <circle cx={x} cy={y} r={r + 3} fill="#ff6a20" opacity=".35" filter={u(k, 'glow')} />
      <circle cx={x} cy={y} r={r} fill={u(k, 'fire')} stroke={S} strokeWidth="1" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.35} fill="#fff6c0" opacity=".85" />
    </g>)}
  </Art>,
  CROSS_SLASH: (k: string) => <Art k={k} c="#ff7a3a">
    <path d="M10 12 Q34 30 54 54" stroke="#ff8a40" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".45" filter={u(k, 'glow')} />
    <path d="M54 12 Q30 30 10 54" stroke="#ff8a40" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".45" filter={u(k, 'glow')} />
    <path d="M10 12 Q34 30 54 54" stroke={u(k, 'fire')} strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M54 12 Q30 30 10 54" stroke={u(k, 'fire')} strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M10 12 Q34 30 54 54 M54 12 Q30 30 10 54" stroke="#fff6d0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </Art>,
  WHIRLWIND: (k: string) => <Art k={k} c="#ffb050">
    <circle cx="32" cy="32" r="24" fill="none" stroke="#ffc070" strokeWidth="3" strokeDasharray="30 12" strokeLinecap="round" />
    <circle cx="32" cy="32" r="15" fill="none" stroke="#fff0c0" strokeWidth="2.4" strokeDasharray="18 9" strokeLinecap="round" />
    <path d="M32 6 L38 14 L32 12 L26 14Z M32 58 L26 50 L32 52 L38 50Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1" />
    <circle cx="32" cy="32" r="4.5" fill={u(k, 'gold')} stroke={S} strokeWidth="1" />
  </Art>,
  EARTHSPLITTER: (k: string) => <Art k={k} c="#c9a070">
    <path d="M4 56 L18 46 L26 52 L40 42 L60 36" stroke="#120a04" strokeWidth="5" fill="none" strokeLinejoin="round" />
    <path d="M4 56 L18 46 L26 52 L40 42 L60 36" stroke="#ff8a30" strokeWidth="2" fill="none" strokeLinejoin="round" />
    {[[16, 44, 18], [28, 46, 24], [40, 38, 28], [52, 34, 22]].map(([x, y, h], i) => (<path key={i} d={`M${x - 6} ${y} L${x} ${y - h} L${x + 6} ${y}Z`} fill={u(k, 'steel')} stroke={S} strokeWidth="1.3" strokeLinejoin="round" />))}
  </Art>,
  BATTLE_CRY: (k: string) => <Art k={k} c="#ff8a3a">
    <path d="M10 26 L30 22 L30 44 L10 40Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M30 22 L50 12 L50 54 L30 44Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M54 22 Q60 33 54 44 M58 16 Q68 33 58 50" stroke="#ffd0a0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <rect x="14" y="40" width="8" height="14" rx="2" fill={u(k, 'wood')} stroke={S} strokeWidth="1" />
  </Art>,
  TITAN_WRATH: (k: string) => <Art k={k} c="#d99a4a">
    <circle cx="32" cy="32" r="26" fill="#ff8a30" opacity=".25" filter={u(k, 'glow')} />
    <path d="M18 56 L18 34 C18 24 26 18 32 18 C38 18 46 24 46 34 L46 56Z" fill={u(k, 'red')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="32" cy="14" r="8" fill={u(k, 'gold')} stroke={S} strokeWidth="1.4" />
    <path d="M24 10 L20 2 M40 10 L44 2" stroke="#fff0c0" strokeWidth="3" strokeLinecap="round" />
    <path d="M6 58 L12 48 L18 58 M46 58 L52 48 L58 58" stroke="#c9a070" strokeWidth="3" fill="none" strokeLinejoin="round" />
    <path d="M26 30 H38" stroke="#fff" strokeWidth="2" opacity=".6" />
  </Art>,
  // ---- knight
  HOLY_WAVE: (k: string) => <Art k={k} c="#ffd76a">
    <path d="M8 44 C14 22 34 12 56 14 C40 20 28 32 22 50Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 42 C20 28 32 20 48 18" stroke="#fffbe0" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".9" />
    <path d="M40 40 L58 58 M44 36 L54 34 L52 44" stroke="#c4cad4" strokeWidth="4" strokeLinecap="round" />
  </Art>,
  SHIELD_WALL: (k: string) => <Art k={k} c="#9fc8ff">
    <path d="M32 6 L54 14 C54 34 46 50 32 58 C18 50 10 34 10 14Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M32 12 L48 18 C48 32 42 44 32 50 C22 44 16 32 16 18Z" fill={u(k, 'blue')} stroke={S} strokeWidth="1" />
    <path d="M32 18 V44 M22 28 H42" stroke="#ffe08a" strokeWidth="3.4" strokeLinecap="round" />
  </Art>,
  JUDGMENT: (k: string) => <Art k={k} c="#fff0a8">
    <path d="M24 2 H40 L44 56 H20Z" fill="#fff6c8" opacity=".85" />
    <path d="M28 2 H36 L38 56 H26Z" fill="#ffffff" />
    <ellipse cx="32" cy="56" rx="22" ry="5" fill={u(k, 'gold')} stroke={S} strokeWidth="1.2" />
    <path d="M10 46 L4 40 M54 46 L60 40 M14 36 L8 30 M50 36 L56 30" stroke="#ffe08a" strokeWidth="2.6" strokeLinecap="round" />
  </Art>,
  HOLY_CHARGE: (k: string) => <Art k={k} c="#ffe08a">
    <path d="M30 10 L50 16 C50 32 44 44 30 52 C18 44 12 32 12 16Z" fill={u(k, 'steel')} stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M30 18 V44 M21 27 H39" stroke="#ffe08a" strokeWidth="3" strokeLinecap="round" />
    <path d="M52 22 H62 M54 32 H64 M52 42 H60" stroke="#fff3c0" strokeWidth="3" strokeLinecap="round" />
  </Art>,
  consecrate: (k: string) => <Art k={k} c="#ffe08a">
    <ellipse cx="32" cy="44" rx="26" ry="10" fill="#ffd76a" opacity=".3" filter={u(k, 'glow')} />
    <ellipse cx="32" cy="44" rx="24" ry="9" fill="none" stroke={u(k, 'gold')} strokeWidth="3" />
    <path d="M32 8 V40 M22 18 H42" stroke="#0d0703" strokeWidth="7" strokeLinecap="round" />
    <path d="M32 8 V40 M22 18 H42" stroke={u(k, 'gold')} strokeWidth="4" strokeLinecap="round" />
    <path d="M12 34 L8 28 M52 34 L56 28" stroke="#fff3c0" strokeWidth="2.4" strokeLinecap="round" />
  </Art>,
  smite: (k: string) => <Art k={k} c="#fff3a0">
    <path d="M36 2 L22 30 H32 L24 58 L46 24 H35 L44 2Z" fill="#fff8d0" stroke={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M36 6 L27 27 H35 L29 46" stroke="#ffffff" strokeWidth="1.6" fill="none" />
    <ellipse cx="28" cy="58" rx="20" ry="4" fill={u(k, 'gold')} opacity=".9" />
  </Art>,
  pierceShot: (k: string) => <Art k={k} c="#7fc8ff">
    <circle cx="20" cy="40" r="9" fill="#2a3a5a" stroke={S} strokeWidth="1.4" />
    <circle cx="42" cy="22" r="9" fill="#2a3a5a" stroke={S} strokeWidth="1.4" />
    <path d="M6 56 L58 6" stroke="#0d0703" strokeWidth="6" strokeLinecap="round" />
    <path d="M6 56 L58 6" stroke="#9fdcff" strokeWidth="3" strokeLinecap="round" />
    <path d="M58 6 L46 9 L55 18Z" fill="#e8f6ff" stroke={S} strokeWidth="1.2" strokeLinejoin="round" />
  </Art>,
  radiant: (k: string) => <Art k={k} c="#ffd76a">
    <circle cx="32" cy="32" r="9" fill="#fffbe8" stroke={S} strokeWidth="1.4" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => <path key={d} transform={`rotate(${d} 32 32)`} d="M24 14 C28 9 36 9 40 14 C36 12 28 12 24 14Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1" />)}
  </Art>,
  DIVINE_AVATAR: (k: string) => <Art k={k} c="#ffd76a">
    <circle cx="32" cy="32" r="27" fill="#ffd76a" opacity=".28" filter={u(k, 'glow')} />
    <circle cx="32" cy="16" r="9" fill="none" stroke="#fff3c0" strokeWidth="2.6" />
    <path d="M20 58 L22 34 C22 26 28 22 32 22 C36 22 42 26 42 34 L44 58Z" fill={u(k, 'gold')} stroke={S} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M22 34 C10 30 6 20 8 12 C14 20 20 24 26 26 M42 34 C54 30 58 20 56 12 C50 20 44 24 38 26" fill="#fffbe8" stroke={S} strokeWidth="1.2" />
  </Art>,
});

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
    {/* (owner: no round container behind the gem) */}
    <path d="M16 3 L28 12.5 L16 30 L4 12.5Z" fill="url(#gm-g)" stroke="#0d0703" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M4 12.5 H28 M10.5 12.5 L16 3 L21.5 12.5 L16 30 L10.5 12.5" stroke="#fff" strokeOpacity=".6" strokeWidth=".9" fill="none" />
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
