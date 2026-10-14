import React from 'react';
import { PaintedIcon } from './SkillIcons';
import type { Upgrade, UpgradeType } from '../../types';

/** Painted emblems for every UpgradeType (64x64, transparent bg) — shown inside the glowing reward-card medallion. */
const S = '#0d0703';
const st = { stroke: S, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const lg = (id: string, a: string, b: string, c: string) => (
  <linearGradient id={`ua-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset=".5" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
);
const Defs = () => (
  <defs>
    {lg('white', '#ffffff', '#e8eefc', '#9aa7c4')}
    {lg('gold', '#fff3b0', '#f0bf48', '#9a6418')}
    {lg('fire', '#fff2a0', '#ffa63a', '#d2301a')}
    {lg('ice', '#f2fdff', '#7fd6ff', '#2a6fd0')}
    {lg('red', '#ffb4a4', '#e83a2e', '#7a0f14')}
    {lg('blue', '#cfe6ff', '#4a90f8', '#1a3c96')}
    {lg('green', '#d8ffb0', '#5fd35a', '#1d7a30')}
    {lg('purp', '#f0d8ff', '#b06cf8', '#5a22aa')}
    {lg('steel', '#f6f9fd', '#9eacc2', '#4a566c')}
    {lg('wood', '#c58a4c', '#8a5528', '#4a2a12')}
  </defs>
);
const u = (n: string) => `url(#ua-${n})`;

const Heart = (f: string) => <path d="M32 58 C10 42 4 28 8 18 C12 8 26 8 32 20 C38 8 52 8 56 18 C60 28 54 42 32 58Z" fill={u(f)} {...st} />;
const Spark = (cx: number, cy: number, r: number, f = 'white') => <path d={`M${cx} ${cy - r} C${cx + r * .12} ${cy - r * .12} ${cx + r * .12} ${cy - r * .12} ${cx + r} ${cy} C${cx + r * .12} ${cy + r * .12} ${cx + r * .12} ${cy + r * .12} ${cx} ${cy + r} C${cx - r * .12} ${cy + r * .12} ${cx - r * .12} ${cy + r * .12} ${cx - r} ${cy} C${cx - r * .12} ${cy - r * .12} ${cx - r * .12} ${cy - r * .12} ${cx} ${cy - r}Z`} fill={u(f)} {...st} />;
const Flame = () => (<g>
  <path d="M32 3 C38 16 54 22 52 40 C50 54 40 60 32 60 C20 60 10 52 14 38 C16 30 22 28 22 18 C28 20 30 26 30 30 C34 24 34 14 32 3Z" fill={u('fire')} {...st} />
  <path d="M32 28 C38 34 42 40 38 48 C36 54 28 54 26 48 C24 42 30 38 32 28Z" fill="#fff0a0" opacity=".92" />
</g>);
const Snow = () => (<g stroke="#e8fbff" strokeLinecap="round">
  <g strokeWidth="7" stroke={S}><path d="M32 6 V58 M9.5 19 L54.5 45 M9.5 45 L54.5 19" /></g>
  <g strokeWidth="4" stroke={u('ice')}><path d="M32 6 V58 M9.5 19 L54.5 45 M9.5 45 L54.5 19" /></g>
  <g strokeWidth="3" stroke={S}><path d="M25 10 L32 17 L39 10 M25 54 L32 47 L39 54" /></g>
  <g strokeWidth="1.8" stroke="#e8fbff"><path d="M25 10 L32 17 L39 10 M25 54 L32 47 L39 54" /></g>
  <circle cx="32" cy="32" r="6" fill="#e8fbff" stroke={S} strokeWidth="1.4" />
</g>);
const Bolt = () => <path d="M38 2 L12 36 H27 L21 62 L52 24 H35Z" fill={u('gold')} {...st} />;
const Shield = (f: string) => (<g>
  <path d="M32 4 L56 12 V32 C56 46 46 56 32 61 C18 56 8 46 8 32 V12Z" fill={u(f)} {...st} />
  <path d="M32 10 L50 16 V32 C50 42 42 50 32 55Z" fill="#fff" opacity=".22" /><path d="M32 4 V61" stroke={S} strokeOpacity=".4" strokeWidth="1.2" />
</g>);
const SwordA = (rot: number) => (<g transform={`rotate(${rot} 32 32)`}>
  <path d="M32 2 L37 10 V40 H27 V10Z" fill={u('steel')} {...st} /><path d="M32 4 V40" stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" />
  <path d="M19 40 H45 L43 45 H21Z" fill={u('gold')} {...st} /><rect x="29" y="45" width="6" height="11" rx="1.5" fill={u('wood')} {...st} /><circle cx="32" cy="59" r="3" fill={u('gold')} {...st} />
</g>);
const Skull = () => (<g>
  <path d="M32 4 C16 4 8 14 8 28 C8 36 12 40 16 43 V54 H48 V43 C52 40 56 36 56 28 C56 14 48 4 32 4Z" fill={u('white')} {...st} />
  <ellipse cx="22" cy="29" rx="7" ry="8" fill="#120804" /><ellipse cx="42" cy="29" rx="7" ry="8" fill="#120804" />
  <path d="M32 36 L28 44 H36Z" fill="#120804" /><path d="M24 48 V54 M32 48 V54 M40 48 V54" stroke="#120804" strokeWidth="2" />
  <path d="M14 14 C18 8 24 6 30 6" stroke="#fff" strokeOpacity=".9" strokeWidth="2" fill="none" strokeLinecap="round" />
</g>);
const Target = () => (<g>
  <circle cx="32" cy="32" r="27" fill={u('red')} {...st} /><circle cx="32" cy="32" r="19" fill="#fff" {...st} /><circle cx="32" cy="32" r="12" fill={u('red')} {...st} /><circle cx="32" cy="32" r="5" fill="#fff" {...st} />
  <path d="M32 2 V16 M32 48 V62 M2 32 H16 M48 32 H62" stroke={S} strokeWidth="2.4" strokeLinecap="round" />
</g>);
const Drop = () => (<g>
  <path d="M32 3 C40 18 54 30 54 42 C54 54 44 61 32 61 C20 61 10 54 10 42 C10 30 24 18 32 3Z" fill={u('blue')} {...st} />
  <ellipse cx="22" cy="40" rx="4" ry="9" fill="#fff" opacity=".5" transform="rotate(14 22 40)" />
</g>);
const Wind = () => (<g fill="none" strokeLinecap="round">
  <g stroke={S} strokeWidth="9"><path d="M6 22 H38 C50 22 50 8 40 8" /><path d="M6 36 H48 C60 36 60 50 48 50" /><path d="M14 50 H30" /></g>
  <g stroke={u('ice')} strokeWidth="5"><path d="M6 22 H38 C50 22 50 8 40 8" /><path d="M6 36 H48 C60 36 60 50 48 50" /><path d="M14 50 H30" /></g>
</g>);
const Boot = () => (<g>
  <path d="M16 6 H36 V34 C36 38 46 40 54 46 C60 50 58 58 52 58 H12 C8 58 8 50 12 48Z" fill={u('wood')} {...st} />
  <path d="M10 48 H56 V58 H10Z" fill={u('steel')} {...st} />
  <path d="M2 18 C6 10 12 10 15 18 C12 21 6 21 2 18Z M4 30 C8 24 13 24 16 30 C12 34 8 34 4 30Z" fill="#fff" stroke={S} strokeWidth="1.2" />
</g>);
const Magnet = () => (<g>
  <path d="M10 8 V34 C10 52 54 52 54 34 V8" fill="none" stroke={S} strokeWidth="18" strokeLinecap="butt" />
  <path d="M10 8 V34 C10 52 54 52 54 34 V8" fill="none" stroke={u('red')} strokeWidth="14" strokeLinecap="butt" />
  <path d="M3 8 H17 V20 H3Z M47 8 H61 V20 H47Z" fill={u('steel')} {...st} />
  <path d="M14 14 V34" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
</g>);
const Tornado = () => (<g>
  <path d="M6 8 H58 L50 18 H14Z M12 22 H52 L44 31 H20Z M18 35 H46 L40 43 H24Z M24 47 H40 L35 56 H29Z" fill={u('ice')} {...st} />
  <path d="M10 10 H54 M16 24 H48" stroke="#fff" strokeOpacity=".6" strokeWidth="1.2" />
</g>);
const Orbit = () => (<g>
  <ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke={S} strokeWidth="5" transform="rotate(-30 32 32)" />
  <ellipse cx="32" cy="32" rx="28" ry="11" fill="none" stroke={u('purp')} strokeWidth="2.6" transform="rotate(-30 32 32)" />
  <circle cx="32" cy="32" r="12" fill={u('blue')} {...st} /><circle cx="28" cy="28" r="4" fill="#fff" opacity=".6" />
  <circle cx="52" cy="22" r="5" fill={u('gold')} {...st} />
</g>);
const Hammer = () => (<g transform="rotate(35 32 32)">
  <rect x="28.4" y="14" width="7.2" height="48" rx="2" fill={u('wood')} {...st} />
  <rect x="8" y="4" width="48" height="20" rx="4" fill={u('steel')} {...st} /><path d="M12 8 H52" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" /><rect x="26" y="4" width="12" height="20" fill={u('gold')} {...st} />
</g>);
const Cloud = () => (<g>
  <path d="M14 38 C4 38 4 22 16 22 C16 10 34 8 38 20 C50 16 58 28 50 38Z" fill={u('purp')} {...st} />
  <path d="M36 30 L22 50 H31 L26 62 L44 42 H34Z" fill={u('gold')} {...st} />
</g>);
const Arrow = () => (<g transform="rotate(-45 32 32)">
  <rect x="29.4" y="14" width="5.2" height="40" rx="1.5" fill={u('wood')} {...st} />
  <path d="M32 0 L42 18 L32 14 L22 18Z" fill={u('steel')} {...st} />
  <path d="M32 58 L42 66 L32 62 L22 66Z M32 46 L41 55 L32 51 L23 55Z" fill={u('green')} {...st} />
</g>);
const BlackHole = () => (<g>
  <circle cx="32" cy="32" r="26" fill="none" stroke={u('purp')} strokeWidth="5" strokeDasharray="12 6" />
  <circle cx="32" cy="32" r="18" fill="#0b0614" stroke={u('purp')} strokeWidth="3" /><circle cx="32" cy="32" r="8" fill="#000" />
  <path d="M4 32 C14 20 22 28 32 32 M60 32 C50 44 42 36 32 32" stroke="#e0c8ff" strokeWidth="2" fill="none" strokeLinecap="round" />
</g>);
const Star = () => Spark(32, 32, 28, 'gold');

const Multicast = () => (<g>
  {Spark(30, 34, 26)}
  {Spark(52, 12, 8)}{Spark(12, 12, 6)}{Spark(54, 52, 6)}
</g>);

const ART: Record<UpgradeType, () => React.ReactNode> = {
  HEALTH: () => Heart('red'), MAX_MANA: Drop, DEFENSE: () => Shield('steel'), SPEED: Boot, DAMAGE: () => SwordA(45), FIRE_RATE: Bolt, MULTISHOT: Multicast,
  DASH_COOLDOWN: Wind, CRIT_RATE: Target, CRIT_DAMAGE: Skull,
  SKILL_ORBITAL: Orbit, SKILL_THUNDER: Cloud, SKILL_REGEN: () => <g>{Heart('green')}<path d="M32 22 V44 M21 33 H43" stroke="#fff" strokeWidth="5" strokeLinecap="round" /></g>,
  SKILL_MAGNET: Magnet, SKILL_DASH: Wind, SKILL_WEAPON: Star, SKILL_BARRIER: () => Shield('gold'), SKILL_PIERCING: Arrow, SKILL_BURNING: Flame,
  SKILL_FREEZING: Snow, SKILL_FREEZE_SPELL: Snow, SKILL_GRAVITY: BlackHole, SKILL_STAMP: Hammer,
  SKILL_RAGE: () => <g>{SwordA(-40)}{SwordA(40)}</g>, SKILL_STORM: Tornado,
  SKILL_WARCRY: () => <g>{Shield('steel')}{SwordA(45)}</g>, SKILL_INSPIRE: Star,
  SKILL_HOLY_WAVE: () => <g>{SwordA(45)}</g>, SKILL_CONSECRATE: () => Shield('gold'),
};

const Emblem: React.FC<{ t: UpgradeType; size: number | string }> = React.memo(({ t, size }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.7))' }}>
    <Defs />{(ART[t] ?? Star)()}
  </svg>
));
Emblem.displayName = 'UpgradeEmblem';

const PAINTED: Partial<Record<UpgradeType, string>> = {
  SKILL_PIERCING: 'GALE_ARROW', SKILL_GRAVITY: 'SINGULARITY', SKILL_RAGE: 'BLOODRAGE_LEAP', SKILL_BURNING: 'burning', SKILL_FREEZING: 'freezing', SKILL_THUNDER: 'thunder', SKILL_STAMP: 'stamp', SKILL_DASH: 'DASH',
};
export const UpgradeArt: React.FC<{ upgrade: Pick<Upgrade, 'type'>; size?: number | string }> = ({ upgrade, size = 56 }) => {
  const pk = PAINTED[upgrade.type];
  if (pk) return <span style={{ display: 'block', width: size, height: size, borderRadius: 8, overflow: 'hidden', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.7))' }}><PaintedIcon id={pk} /></span>;
  return <Emblem t={upgrade.type} size={size} />;
};
