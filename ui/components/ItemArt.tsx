import React from 'react';
import type { Item } from '../../types';
import { RARITY_TEXT } from '../lib/game';
import { LOOT, LOOT_BY_NAME } from '../../loot';
import { ELIXIRS, ELIXIR_IDS, ELIXIR_BY_NAME } from '../../elixirs';
import { ITEMS_POOL, PETS_POOL } from '../../constants';
import { ART, type Pal, type ArtSpec } from '../../itemCatalog';

/** Painted SVG item icons (transparent background, drawn on a 64x64 grid). Memoized per (kind, rarity, size). */

const S = '#0d0703';
const lg = (id: string, a: string, b: string, c: string, v = false) => (
  <linearGradient id={`ia-${id}`} x1="0" y1="0" x2={v ? 0 : 1} y2={v ? 1 : 1}><stop offset="0" stopColor={a} /><stop offset=".5" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
);
const Defs: React.FC = () => (
  <defs>
    {lg('steel', '#f6f9fd', '#9eacc2', '#4a566c')}
    {lg('gold', '#fff3b0', '#e9b949', '#8b5a16')}
    {lg('wood', '#c58a4c', '#8a5528', '#4a2a12')}
    {lg('leather', '#c98a54', '#8f5a30', '#4e2d15', true)}
    {lg('red', '#ffb4a4', '#e83a2e', '#7a0f14', true)}
    {lg('blue', '#cfe6ff', '#3f86f0', '#14307e', true)}
    {lg('green', '#d8ffb0', '#5fd35a', '#1d7a30', true)}
    {lg('purp', '#f0d8ff', '#a15cf0', '#4a1c9a', true)}
    {lg('dark', '#7d8498', '#3a3f50', '#14161e')}
    {lg('glass', '#ffffff', '#cfe7ff', '#7fa6d6', true)}
    {lg('fire', '#fff2a0', '#ffa63a', '#d2301a', true)}
    {lg('white', '#ffffff', '#e8eefc', '#9aa7c4')}
    {lg('void', '#8a5cc8', '#35185e', '#0b0618', true)}
    <linearGradient id="ia-rain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9ad0" /><stop offset=".35" stopColor="#ffe27a" /><stop offset=".7" stopColor="#7ff0ff" /><stop offset="1" stopColor="#b06cf8" /></linearGradient>
    <radialGradient id="ia-shine" cx="35%" cy="30%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
  </defs>
);
const g = (n: string) => `url(#ia-${n})`;

const Svg: React.FC<{ size: number | string; children: React.ReactNode }> = ({ size, children }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible' }}><Defs />{children}</svg>
);
const st = { stroke: S, strokeWidth: 1.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

type Draw = (c: string) => React.ReactNode;

const Sword: Draw = (c) => (<g transform="rotate(45 32 32)">
  <path d="M32 2 L37 10 V40 H27 V10Z" fill={g('steel')} {...st} />
  <path d="M32 4 V40" stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" />
  <path d="M32 6 L36 12 V40 H32Z" fill="#000" opacity=".12" />
  <path d="M19 40 H45 L43 45 H21Z" fill={g('gold')} {...st} />
  <circle cx="19.5" cy="42.5" r="2.4" fill={g('gold')} {...st} /><circle cx="44.5" cy="42.5" r="2.4" fill={g('gold')} {...st} />
  <rect x="29" y="45" width="6" height="11" rx="1.5" fill={g('leather')} {...st} />
  <path d="M29 48 H35 M29 51 H35" stroke={S} strokeOpacity=".5" strokeWidth=".9" />
  <circle cx="32" cy="59" r="3.2" fill={g('gold')} {...st} /><circle cx="32" cy="42.5" r="2" fill={c} stroke={S} strokeWidth="1" />
</g>);
const Core: Draw = () => (<g>
  <circle cx="32" cy="32" r="26" fill="#b26bff" opacity=".28" />
  <path d="M32 3 L55 16 V44 L32 61 L9 44 V16Z" fill={g('purp')} {...st} />
  <path d="M32 3 L55 16 L32 30 L9 16Z" fill="#fff" opacity=".4" />
  <path d="M32 30 L55 16 V44 L32 61Z" fill="#000" opacity=".22" />
  <path d="M9 16 L32 30 L55 16 M32 30 V61" stroke="#fff" strokeOpacity=".65" strokeWidth="1.1" fill="none" />
  <path d="M32 18 L42 24 L32 30 L22 24Z" fill="#f3e4ff" opacity=".9" />
</g>);
const Ankh: Draw = () => (<g>
  <circle cx="32" cy="32" r="27" fill="#ffd24a" opacity=".16" />
  <path d="M32 4 C44 4 46 20 32 30 C18 20 20 4 32 4Z M32 14 C37 14 37 20 32 24 C27 20 27 14 32 14Z" fill={g('gold')} fillRule="evenodd" {...st} />
  <path d="M10 30 H54 V38 H38 V60 H26 V38 H10Z" fill={g('gold')} {...st} />
  <path d="M14 33 H50 M29 40 V57" stroke="#fff" strokeOpacity=".6" strokeWidth="1.3" strokeLinecap="round" />
  <circle cx="32" cy="34" r="3.2" fill="#e83a2e" stroke={S} strokeWidth="1" />
</g>);
const Treasure: Draw = (c) => (<g>
  <path d="M8 26 C8 12 56 12 56 26Z" fill={g('wood')} {...st} />
  <rect x="8" y="26" width="48" height="28" rx="2" fill={g('wood')} {...st} />
  <path d="M8 34 H56 M20 12 V54 M44 12 V54" stroke={g('gold')} strokeWidth="3.2" />
  <path d="M8 34 H56 M20 12 V54 M44 12 V54" stroke={S} strokeWidth=".8" opacity=".7" />
  <rect x="27" y="28" width="10" height="12" rx="2" fill={g('gold')} {...st} /><circle cx="32" cy="34" r="2" fill={c} stroke={S} strokeWidth=".8" />
</g>);

const Facet = (cx: number, cy: number, r: number, fill: string, glow = false): React.ReactNode => (<g>
  {glow && <circle cx={cx} cy={cy} r={r * 2} fill={fill} opacity=".3" />}
  <path d={`M${cx} ${cy - r} L${cx + r * .9} ${cy - r * .3} L${cx + r * .6} ${cy + r * .8} L${cx - r * .6} ${cy + r * .8} L${cx - r * .9} ${cy - r * .3}Z`} fill={fill} stroke={S} strokeWidth="1.1" strokeLinejoin="round" />
  <path d={`M${cx - r * .9} ${cy - r * .3} H${cx + r * .9} M${cx} ${cy - r} L${cx - r * .3} ${cy - r * .3} M${cx} ${cy - r} L${cx + r * .3} ${cy - r * .3}`} stroke="#fff" strokeOpacity=".6" strokeWidth=".8" fill="none" />
  <circle cx={cx - r * .35} cy={cy - r * .45} r={r * .22} fill="#fff" opacity=".85" />
</g>);
const Orb = (cx: number, cy: number, r: number, fill: string, glow = true): React.ReactNode => (<g>
  {glow && <circle cx={cx} cy={cy} r={r * 1.7} fill={fill} opacity=".28" />}
  <circle cx={cx} cy={cy} r={r} fill={fill} stroke={S} strokeWidth="1.3" /><circle cx={cx} cy={cy} r={r} fill="url(#ia-shine)" />
</g>);
const Spark = (x: number, y: number, s = 3, o = .95): React.ReactNode => <path d={`M${x} ${y - s} L${x + s * .3} ${y - s * .3} L${x + s} ${y} L${x + s * .3} ${y + s * .3} L${x} ${y + s} L${x - s * .3} ${y + s * .3} L${x - s} ${y} L${x - s * .3} ${y - s * .3}Z`} fill="#fff" opacity={o} />;

// ---- staffs ----
const STAFF_GEM = ['#6ea8ff', '#5fe3a8', '#ff7a2e', '#c58bff', '#7ff0ff'];
const Staff = (v: number): Draw => () => {
  const gem = STAFF_GEM[v];
  const shaft = ['wood', 'wood', 'dark', 'gold', 'white'][v];
  return (<g transform="rotate(40 32 32)">
    {v === 4 && <circle cx="32" cy="12" r="20" fill="#7ff0ff" opacity=".18" />}
    <rect x="29.6" y="16" width="4.8" height="46" rx="2.2" fill={g(shaft)} {...st} />
    <path d="M29.6 30 H34.4 M29.6 38 H34.4" stroke={S} strokeOpacity=".5" strokeWidth="1" />
    {v === 0 && <><path d="M26 14 C25 8 28 5 32 8 C36 5 39 8 38 14 C37 18 34 20 32 20 C30 20 27 18 26 14Z" fill={g('wood')} {...st} />{Orb(32, 10, 4.6, gem)}</>}
    {v === 1 && <><path d="M23 10 C22 22 42 22 41 10 C39 18 25 18 23 10Z" fill={g('gold')} {...st} />{Orb(32, 10, 5.4, gem)}<rect x="28" y="20" width="8" height="3.6" rx="1.4" fill={g('gold')} {...st} /></>}
    {v === 2 && <><path d="M22 14 L20 2 L27 9 L32 0 L37 9 L44 2 L42 14 C40 20 36 22 32 22 C28 22 24 20 22 14Z" fill={g('dark')} {...st} />
      <path d="M32 3 C38 9 40 14 36 18 C34 21 30 21 28 18 C25 14 28 9 32 3Z" fill={g('fire')} stroke={S} strokeWidth="1.2" /><path d="M32 10 C35 13 35 16 32 18 C29 16 29 13 32 10Z" fill="#fff6b0" /><rect x="27" y="22" width="10" height="3.4" rx="1.4" fill={g('red')} {...st} /></>}
    {v === 3 && <><path d="M31 12 C20 14 12 8 8 -2 C16 0 24 2 31 8Z M33 12 C44 14 52 8 56 -2 C48 0 40 2 33 8Z" fill={g('gold')} {...st} />
      <path d="M30 8 C22 6 16 3 12 1 M34 8 C42 6 48 3 52 1" stroke="#fff" strokeOpacity=".6" strokeWidth=".9" fill="none" />{Orb(32, 11, 7, gem)}<rect x="27" y="21" width="10" height="4" rx="1.6" fill={g('gold')} {...st} /></>}
    {v === 4 && <><ellipse cx="32" cy="11" rx="15" ry="5.5" fill="none" stroke={S} strokeWidth="3.4" /><ellipse cx="32" cy="11" rx="15" ry="5.5" fill="none" stroke={g('gold')} strokeWidth="1.8" />
      <path d="M32 -6 L35 4 L32 8 L29 4Z M16 -2 L22 4 M48 -2 L42 4" fill={g('gold')} {...st} />{Orb(32, 11, 8.6, gem)}{Spark(32, 11, 4)}<rect x="27" y="22" width="10" height="4" rx="1.6" fill={g('gold')} {...st} /><circle cx="32" cy="24" r="1.4" fill="#e83a2e" /></>}
  </g>);
};

// ---- bows ----
const Bow = (v: number): Draw => () => {
  const limb = ['wood', 'green', 'purp', 'blue', 'gold'][v];
  const d = ['M44 10 C26 16 26 48 44 54', 'M48 2 C16 12 12 52 48 62', 'M38 4 C54 14 22 22 22 32 C22 42 54 50 38 60', 'M46 4 C14 12 14 52 46 60', 'M48 2 C12 12 12 52 48 62'][v];
  const x0 = [44, 48, 38, 46, 48][v], y0 = [10, 2, 4, 4, 2][v], y1 = [54, 62, 60, 60, 62][v];
  return (<g>
    {v === 4 && <><circle cx="30" cy="32" r="27" fill="#ffd24a" opacity=".2" /><path d="M30 2 V10 M30 54 V62 M4 32 H12 M10 10 L16 16 M10 54 L16 48" stroke="#ffd24a" strokeWidth="2" strokeLinecap="round" opacity=".8" /></>}
    <path d={d} fill="none" stroke={S} strokeWidth={v > 1 ? 8 : 7} strokeLinecap="round" />
    <path d={d} fill="none" stroke={g(limb)} strokeWidth={v > 1 ? 5.2 : 4.4} strokeLinecap="round" />
    <path d={d} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1" transform="translate(-1.5 .5)" />
    <path d={`M${x0} ${y0} L${x0} ${y1}`} stroke={v === 4 ? '#bff6ff' : '#f1ead8'} strokeWidth={v === 4 ? 1.8 : 1.1} />
    {v === 1 && <><path d="M20 16 C14 14 12 10 14 8 C18 8 21 12 20 16Z M16 28 C10 28 8 24 10 22 C14 22 17 25 16 28Z" fill={g('green')} {...st} /><path d="M20 48 C14 50 12 54 14 56 C18 56 21 52 20 48Z" fill={g('green')} {...st} /></>}
    {v === 2 && <><circle cx="38" cy="4" r="2.6" fill={g('gold')} {...st} /><circle cx="38" cy="60" r="2.6" fill={g('gold')} {...st} /></>}
    {v === 3 && <><path d="M16 18 C8 14 6 8 8 2 C14 6 18 12 16 18Z M14 30 C6 28 2 22 2 16 C9 18 14 23 14 30Z" fill="#e8f6ff" {...st} /><path d="M16 46 C8 50 6 56 8 62 C14 58 18 52 16 46Z M14 34 C6 36 2 42 2 48 C9 46 14 41 14 34Z" fill="#e8f6ff" {...st} /></>}
    <rect x="21" y="28" width="6" height="8" rx="2" fill={g(v > 1 ? 'gold' : 'leather')} {...st} />
    {v >= 2 && Facet(24, 32, 2.6, v === 2 ? '#e83a2e' : v === 3 ? '#7ff0ff' : '#ffffff', v > 2)}
    {v < 3 && <><path d="M10 32 H50" stroke={S} strokeWidth="3.6" strokeLinecap="round" /><path d="M10 32 H50" stroke={g('wood')} strokeWidth="1.8" /><path d="M54 32 L47 27 V37Z" fill={g('steel')} {...st} />
      <path d="M10 32 L5 28 M10 32 L5 36 M14 32 L9 28 M14 32 L9 36" stroke="#e24a3a" strokeWidth="2" strokeLinecap="round" /></>}
    {v === 4 && <>{Orb(24, 32, 4, '#fff6b0')}{Spark(52, 12, 4)}{Spark(8, 50, 3)}</>}
  </g>);
};

// ---- axes ----
const BLADE_R = 'M34 10 C52 4 60 16 56 30 C54 36 48 40 34 38 C40 30 40 20 34 10Z';
const BLADE_L = 'M30 12 C14 8 8 18 12 28 C14 33 20 36 30 34 C25 28 25 20 30 12Z';
const Axe = (v: number): Draw => () => {
  const blade = ['steel', 'steel', 'steel', 'dark', 'fire'][v];
  const dbl = v === 2 || v >= 3;
  const s = v === 0 ? .78 : 1;
  return (<g transform="rotate(35 32 32)">
    {v === 4 && <circle cx="32" cy="22" r="28" fill="#ff7a2e" opacity=".22" />}
    <g transform={`translate(32 32) scale(${s}) translate(-32 -32)`}>
      <rect x="29.8" y="4" width="4.4" height="58" rx="2" fill={g(v >= 3 ? 'dark' : 'wood')} {...st} />
      <path d={BLADE_R} fill={g(blade)} {...st} />
      {dbl && <path d={BLADE_L} fill={g(blade)} {...st} />}
      <path d="M50 14 C54 20 54 26 50 31" stroke="#fff" strokeOpacity=".75" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {dbl && <path d="M14 18 C13 22 14 26 17 29" stroke="#fff" strokeOpacity=".6" strokeWidth="1.3" fill="none" strokeLinecap="round" />}
      {v === 1 && <><path d="M28 40 L36 46 M28 46 L36 52 M28 52 L36 58" stroke="#c0322a" strokeWidth="2.4" strokeLinecap="round" /><path d="M36 20 C42 18 48 20 50 24" stroke={S} strokeOpacity=".5" strokeWidth="1" fill="none" /></>}
      {v >= 3 && <><path d="M56 30 L62 32 L56 24 M12 28 L4 30 L10 22" fill={g('gold')} {...st} /><path d="M40 18 L46 14 M40 26 L48 24 M24 18 L18 14 M24 26 L16 24" stroke={v === 4 ? '#fff6b0' : '#e9b949'} strokeWidth="1.4" strokeLinecap="round" /></>}
      <rect x="27.5" y="20" width="9" height="7" rx="1.5" fill={g('gold')} {...st} />
      {v < 3 ? <circle cx="32" cy="23.5" r="1.7" fill={v === 2 ? '#3f86f0' : '#c0322a'} /> : Facet(32, 23.5, 3.2, v === 4 ? '#ffd24a' : '#e83a2e', true)}
      {v === 4 && <><path d="M26 4 L24 -2 L30 2 M38 4 L40 -2 L34 2" fill={g('gold')} {...st} />{Spark(46, 22, 3.5)}{Spark(14, 22, 3)}</>}
      <rect x="29" y="58" width="6" height="4" rx="1.5" fill={g('gold')} {...st} />
    </g>
  </g>);
};

// ---- armor ----
interface ChestCfg { body: string; trim: string; mark: 'laces' | 'mail' | 'leaf' | 'plate' | 'obs' | 'scale' | 'void'; gem?: string; spikes?: boolean; aura?: string }
const Chest = (o: ChestCfg): Draw => () => (<g>
  {o.aura && <circle cx="32" cy="32" r="28" fill={o.aura} opacity=".22" />}
  {o.spikes && <><path d="M10 16 L2 2 L16 10Z M54 16 L62 2 L48 10Z" fill={g(o.trim)} {...st} /></>}
  <path d="M10 14 L22 8 H42 L54 14 L58 26 L48 30 V56 H16 V30 L6 26Z" fill={g(o.body)} {...st} />
  <path d="M22 8 C26 16 38 16 42 8 L38 6 H26Z" fill="#14100c" {...st} />
  <path d="M12 16 L8 25 M52 16 L56 25" stroke="#fff" strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
  {o.mark === 'laces' && <><path d="M32 16 V50" stroke={S} strokeOpacity=".5" strokeWidth="1.2" /><path d="M27 22 L37 28 M37 22 L27 28 M27 32 L37 38 M37 32 L27 38" stroke="#f1d9a0" strokeWidth="1.4" strokeLinecap="round" /><path d="M16 44 H48" stroke={g('wood')} strokeWidth="4" /></>}
  {o.mark === 'mail' && <path d="M20 22 h24 M20 28 h24 M18 34 h28 M18 40 h28 M18 46 h28 M18 52 h28 M24 20 v34 M30 20 v34 M36 20 v34 M42 22 v32" stroke={S} strokeOpacity=".35" strokeWidth="1.1" strokeDasharray="2.6 1.6" />}
  {o.mark === 'leaf' && <><path d="M32 18 C40 24 40 36 32 44 C24 36 24 24 32 18Z" fill={g('gold')} {...st} /><path d="M32 20 V44" stroke={S} strokeOpacity=".5" strokeWidth="1" /><path d="M16 48 H48" stroke={g('gold')} strokeWidth="3" /></>}
  {o.mark === 'plate' && <><path d="M32 14 V56 M20 30 H44" stroke={S} strokeOpacity=".4" strokeWidth="1.2" /><path d="M16 30 H48 V36 H16Z" fill={g(o.trim)} {...st} /><path d="M20 42 H44 M20 48 H44" stroke={S} strokeOpacity=".28" strokeWidth="1" /></>}
  {o.mark === 'obs' && <><path d="M22 20 L32 16 L42 20 M20 36 L32 32 L44 36 M20 50 L32 46 L44 50" stroke="#b06cf8" strokeWidth="1.4" fill="none" /><path d="M16 30 H48 V35 H16Z" fill={g(o.trim)} {...st} /></>}
  {o.mark === 'scale' && <><path d="M18 24 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0 M18 34 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0 M20 44 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0 M22 52 q3 4 5 0 q3 4 5 0 q3 4 5 0" stroke="#ffd2a0" strokeOpacity=".7" strokeWidth="1.3" fill="none" /><path d="M16 29 H48 V33 H16Z" fill={g('gold')} {...st} /></>}
  {o.mark === 'void' && <><path d="M32 16 C46 18 48 36 34 38 C24 39 24 28 32 28 C38 28 38 34 33 34" stroke="#7ff0ff" strokeWidth="1.8" fill="none" strokeLinecap="round" /><path d="M20 48 C28 44 36 52 44 46" stroke="#b06cf8" strokeWidth="1.4" fill="none" /></>}
  {o.gem ? Facet(32, o.mark === 'plate' || o.mark === 'obs' || o.mark === 'scale' ? 33 : 40, 3.4, o.gem, true) : null}
  {o.mark === 'void' && <>{Spark(10, 12, 3)}{Spark(54, 50, 3.5)}</>}
</g>);

// ---- accessories ----
const Band = (): React.ReactNode => (<g>
  <ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={S} strokeWidth="9" />
  <ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={g('gold')} strokeWidth="6" />
  <path d="M18 34 C20 26 28 24 34 25" stroke="#fff" strokeOpacity=".65" strokeWidth="1.5" fill="none" strokeLinecap="round" />
</g>);
const Ring = (v: number): Draw => () => (<g>
  {v === 3 && <circle cx="32" cy="28" r="28" fill="#ff9af0" opacity=".2" />}
  {v === 2 ? <g><ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={S} strokeWidth="9" /><ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={g('dark')} strokeWidth="6" /><path d="M18 34 C20 26 28 24 34 25" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" fill="none" strokeLinecap="round" /></g> : Band()}
  {v === 0 && <><path d="M32 12 C40 12 42 20 38 26 H26 C22 20 24 12 32 12Z" fill={g('gold')} {...st} />{Orb(32, 19, 5, '#5fd35a', false)}</>}
  {v === 1 && <>{Facet(32, 17, 11, '#4a90f8', true)}{Spark(14, 14, 3.4)}{Spark(51, 20, 2.6)}</>}
  {v === 2 && <><path d="M32 6 C42 6 46 14 44 22 L40 28 H24 L20 22 C18 14 22 6 32 6Z" fill={g('steel')} {...st} /><ellipse cx="26" cy="18" rx="3.4" ry="4" fill="#120804" /><ellipse cx="38" cy="18" rx="3.4" ry="4" fill="#120804" /><circle cx="26" cy="18" r="1.5" fill="#ff3a2e" /><circle cx="38" cy="18" r="1.5" fill="#ff3a2e" /><path d="M32 21 L30 25 H34Z M28 28 V24 M32 28 V25 M36 28 V24" stroke={S} strokeWidth="1.1" fill={S} /></>}
  {v === 3 && <><path d="M20 20 C10 18 6 10 4 4 C12 6 18 10 22 16Z M44 20 C54 18 58 10 60 4 C52 6 46 10 42 16Z" fill={g('gold')} {...st} /><path d="M32 4 L44 12 L40 26 H24 L20 12Z" fill="url(#ia-rain)" stroke={S} strokeWidth="1.4" strokeLinejoin="round" /><path d="M20 12 H44 M32 4 L26 26 M32 4 L38 26" stroke="#fff" strokeOpacity=".6" strokeWidth="1" fill="none" />{Spark(28, 11, 3)}{Spark(50, 24, 3)}</>}
</g>);
const Amulet = (mana: boolean): Draw => (c) => (<g>
  <path d="M10 4 C14 30 24 36 32 38 C40 36 50 30 54 4" fill="none" stroke={S} strokeWidth="5" strokeLinecap="round" />
  <path d="M10 4 C14 30 24 36 32 38 C40 36 50 30 54 4" fill="none" stroke={g(mana ? 'steel' : 'gold')} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 2" />
  {mana ? <><circle cx="32" cy="46" r="15" fill="#3f86f0" opacity=".25" />
    <path d="M32 30 C40 40 46 46 42 54 C40 59 24 59 22 54 C18 46 24 40 32 30Z" fill={g('gold')} {...st} />
    <path d="M32 35 C38 42 41 47 38 52 C36 55 28 55 26 52 C23 47 26 42 32 35Z" fill={g('blue')} stroke={S} strokeWidth="1" />
    <ellipse cx="29" cy="46" rx="2" ry="3.4" fill="#fff" opacity=".7" transform="rotate(20 29 46)" /></>
    : <><circle cx="32" cy="46" r="14" fill={g('gold')} {...st} /><circle cx="32" cy="46" r="10" fill="#1a1008" stroke={S} strokeWidth="1" />
      <path d="M32 36 L40 46 L32 56 L24 46Z" fill={c} stroke={S} strokeWidth="1.2" strokeLinejoin="round" /><circle cx="27" cy="40" r="2" fill="#fff" opacity=".6" /></>}
</g>);
const Focus: Draw = () => (<g>
  <circle cx="32" cy="34" r="27" fill="#c58bff" opacity=".22" />
  <path d="M32 2 L44 14 L42 46 L32 60 L22 46 L20 14Z" fill={g('purp')} {...st} />
  <path d="M32 2 L44 14 L32 20 L20 14Z" fill="#fff" opacity=".45" />
  <path d="M32 20 L44 14 L42 46 L32 60Z" fill="#000" opacity=".22" />
  <path d="M20 14 L32 20 L44 14 M32 20 V60" stroke="#fff" strokeOpacity=".6" strokeWidth="1" fill="none" />
  <path d="M14 30 L8 22 L6 42 L14 50Z M50 30 L56 24 L58 42 L50 50Z" fill={g('blue')} {...st} />
  <path d="M26 56 H38 L42 62 H22Z" fill={g('gold')} {...st} />
  {Spark(46, 6, 3.4)}{Spark(14, 12, 2.6)}
</g>);

const Boots: Draw = (c) => (<g>
  <path d="M14 8 H30 V34 C30 38 40 40 50 46 C56 49 56 56 50 56 H12 C8 56 8 50 12 48 L14 8Z" fill={g('leather')} {...st} />
  <path d="M12 48 H52 V56 H12Z" fill={g('dark')} {...st} />
  <path d="M14 8 H30 V16 H14Z" fill={g('gold')} {...st} />
  <path d="M16 22 H30 M16 28 H30" stroke={S} strokeOpacity=".5" strokeWidth="1.2" />
  <path d="M4 20 C8 14 12 14 14 20 C12 22 8 22 4 20Z M6 30 C9 26 12 26 14 30 C12 32 9 32 6 30Z" fill="#fff" stroke={S} strokeWidth="1" opacity=".95" />
  <circle cx="22" cy="40" r="2.6" fill={c} stroke={S} strokeWidth="1" />
</g>);
// ---- consumables ----
const Potion = (liquid: string, big: boolean): Draw => () => big ? (<g>
  <rect x="24" y="2" width="16" height="10" rx="3" fill={g('gold')} {...st} /><path d="M26 7 H38" stroke={S} strokeOpacity=".5" strokeWidth="1" />
  <path d="M26 12 H38 V20 C54 22 62 36 58 48 C55 58 46 62 32 62 C18 62 9 58 6 48 C2 36 10 22 26 20Z" fill={g('glass')} opacity=".5" {...st} />
  <path d="M10 42 C8 32 16 25 26 24 H38 C48 25 56 32 54 42 C56 54 46 59 32 59 C18 59 8 54 10 42Z" fill={g(liquid)} stroke={S} strokeWidth="1" />
  <path d="M10 42 C18 38 26 46 32 42 C38 38 46 46 54 42" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />
  <path d="M32 36 L35 43 L42 44 L36 49 L38 56 L32 52 L26 56 L28 49 L22 44 L29 43Z" fill="#fff" opacity=".85" />
  <ellipse cx="16" cy="42" rx="3" ry="8" fill="#fff" opacity=".45" transform="rotate(12 16 42)" />
  <path d="M24 12 H40" stroke={g('gold')} strokeWidth="3" strokeLinecap="round" />{Spark(54, 12, 3.4)}
</g>) : (<g>
  <rect x="26" y="5" width="12" height="8" rx="2" fill={g('wood')} {...st} />
  <path d="M27 13 H37 V22 C48 26 54 36 52 46 C50 56 42 60 32 60 C22 60 14 56 12 46 C10 36 16 26 27 22Z" fill={g('glass')} opacity=".5" {...st} />
  <path d="M15 42 C14 36 18 31 24 29 H40 C46 31 50 36 49 42 C50 54 42 58 32 58 C22 58 14 54 15 42Z" fill={g(liquid)} stroke={S} strokeWidth="1" />
  <path d="M15 42 C22 38 28 46 32 42 C36 38 42 46 49 42" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />
  <ellipse cx="21" cy="44" rx="2.6" ry="6" fill="#fff" opacity=".45" transform="rotate(12 21 44)" /><circle cx="40" cy="48" r="2" fill="#fff" opacity=".35" />
</g>);

// ---- materials / shards (by rarity colour) ----
export const ShardArt: React.FC<{ rarity: Item['rarity']; size?: number | string }> = React.memo(({ rarity, size = 26 }) => {
  const c = RARITY_TEXT[rarity];
  return (<Svg size={size}>
    <circle cx="32" cy="34" r="26" fill={c} opacity=".18" />
    <path d="M32 4 L42 20 L38 54 L32 60 L26 54 L22 20Z" fill={c} {...st} />
    <path d="M32 4 L42 20 L32 26 L22 20Z" fill="#fff" opacity=".5" /><path d="M32 26 L42 20 L38 54 L32 60Z" fill="#000" opacity=".25" />
    <path d="M12 38 L18 28 L22 50 L16 56Z M52 38 L46 28 L42 50 L48 56Z" fill={c} {...st} />
    <path d="M32 26 V60" stroke="#fff" strokeOpacity=".6" strokeWidth="1" />
  </Svg>);
});
ShardArt.displayName = 'ShardArt';
// ---- pets ----
const Eyes: React.FC<{ y?: number; dx?: number; r?: number }> = ({ y = 30, dx = 8, r = 2.4 }) => (
  <g><circle cx={32 - dx} cy={y} r={r} fill="#120804" /><circle cx={32 + dx} cy={y} r={r} fill="#120804" />
    <circle cx={32 - dx + .8} cy={y - .8} r={r / 3} fill="#fff" /><circle cx={32 + dx + .8} cy={y - .8} r={r / 3} fill="#fff" /></g>
);
const PETS: Record<string, Draw> = {
  pet_blob: () => (<g><path d="M10 52 C6 34 20 14 32 14 C44 14 58 34 54 52Z" fill={g('green')} {...st} /><ellipse cx="22" cy="28" rx="5" ry="3" fill="#fff" opacity=".5" /><Eyes y={36} /><path d="M27 43 Q32 47 37 43" stroke={S} strokeWidth="1.5" fill="none" strokeLinecap="round" /></g>),
  pet_bat: () => (<g><path d="M32 22 C26 10 6 10 4 24 C10 22 12 28 16 30 C18 28 22 30 24 36 C26 30 30 30 32 34 C34 30 38 30 40 36 C42 30 46 28 48 30 C52 28 54 22 60 24 C58 10 38 10 32 22Z" fill={g('purp')} {...st} /><ellipse cx="32" cy="38" rx="9" ry="11" fill={g('dark')} {...st} /><path d="M25 28 L27 20 L31 27 M39 28 L37 20 L33 27" fill={g('dark')} {...st} /><Eyes y={36} dx={4} r={1.9} /><path d="M29 44 L30 47 L32 44 L34 47 L35 44" stroke="#fff" strokeWidth="1.1" fill="none" /></g>),
  pet_fairy: () => (<g><path d="M32 34 C14 28 6 8 18 8 C24 8 30 22 32 34Z M32 34 C50 28 58 8 46 8 C40 8 34 22 32 34Z" fill="#bdf2ff" opacity=".85" {...st} /><path d="M32 36 C20 40 14 54 24 54 C28 54 31 46 32 36Z M32 36 C44 40 50 54 40 54 C36 54 33 46 32 36Z" fill="#bdf2ff" opacity=".7" {...st} /><circle cx="32" cy="28" r="7" fill="#ffe1c8" {...st} /><path d="M25 26 C26 18 38 18 39 26 C36 22 28 22 25 26Z" fill="#ffd24a" {...st} /><path d="M28 36 H36 L38 52 H26Z" fill={g('green')} {...st} /><circle cx="29.6" cy="29" r="1.2" fill="#120804" /><circle cx="34.4" cy="29" r="1.2" fill="#120804" /></g>),
  pet_wolf: () => (<g><path d="M8 6 L20 16 H44 L56 6 L58 30 C58 46 46 58 32 58 C18 58 6 46 6 30Z" fill="url(#ia-steel)" {...st} /><path d="M12 12 L19 19 M52 12 L45 19" stroke={S} strokeWidth="1.2" /><path d="M22 40 C24 34 40 34 42 40 C40 50 24 50 22 40Z" fill="#e8eef8" {...st} /><ellipse cx="32" cy="40" rx="4" ry="3" fill="#120804" /><Eyes y={28} dx={10} r={2.6} /><path d="M29 47 L30 51 L32 47 L34 51 L35 47" stroke="#fff" strokeWidth="1.1" fill="none" /></g>),
  pet_dragon: () => (<g><path d="M12 22 L6 6 L22 14 M52 22 L58 6 L42 14" fill={g('gold')} {...st} /><path d="M8 28 C8 14 22 10 32 10 C42 10 56 14 56 28 C56 44 46 56 32 56 C18 56 8 44 8 28Z" fill={g('gold')} {...st} /><path d="M20 42 C22 36 42 36 44 42 C42 52 22 52 20 42Z" fill="#ffe08a" {...st} /><circle cx="28" cy="43" r="1.4" fill="#7a4a10" /><circle cx="36" cy="43" r="1.4" fill="#7a4a10" /><circle cx="22" cy="28" r="3" fill="#e83a2e" stroke={S} strokeWidth="1" /><circle cx="42" cy="28" r="3" fill="#e83a2e" stroke={S} strokeWidth="1" /><path d="M32 12 L28 20 L36 20Z" fill="#8b5a16" {...st} /></g>),
  pet_rock: () => (<g><path d="M8 50 L12 28 L24 12 L42 10 L56 26 L56 50 L40 58 H20Z" fill={g('dark')} {...st} /><path d="M24 12 L28 30 L12 28 M42 10 L38 28 L56 26 M28 30 L38 28 L40 58" stroke="#fff" strokeOpacity=".3" strokeWidth="1" fill="none" /><Eyes y={38} dx={7} /><path d="M27 47 H37" stroke={S} strokeWidth="1.6" strokeLinecap="round" /></g>),
  pet_golem: () => (<g><rect x="12" y="8" width="40" height="30" rx="4" fill={g('steel')} {...st} /><rect x="6" y="36" width="52" height="22" rx="4" fill={g('dark')} {...st} /><rect x="17" y="18" width="30" height="8" rx="2" fill="#120804" /><circle cx="25" cy="22" r="3" fill="#ffa63a" /><circle cx="39" cy="22" r="3" fill="#ffa63a" /><path d="M14 48 H50 M32 38 V58" stroke={S} strokeOpacity=".5" strokeWidth="1.2" /></g>),
  pet_phoenix: () => (<g><path d="M32 6 C40 16 54 20 52 38 C50 52 40 58 32 58 C22 58 12 52 12 38 C10 20 24 16 32 6Z" fill={g('red')} {...st} /><path d="M32 22 C38 30 42 38 38 48 C36 54 28 54 26 48 C24 40 30 34 32 22Z" fill="#ffd24a" /><path d="M4 22 C10 24 18 30 18 40 C10 38 6 32 4 22Z M60 22 C54 24 46 30 46 40 C54 38 58 32 60 22Z" fill={g('red')} {...st} /><circle cx="28" cy="36" r="1.6" fill="#120804" /><circle cx="36" cy="36" r="1.6" fill="#120804" /><path d="M32 40 L29 44 H35Z" fill="#ff9a3c" {...st} /></g>),
  pet_fox: () => (<g><path d="M6 6 L22 18 H42 L58 6 L58 34 C58 48 46 58 32 58 C18 58 6 48 6 34Z" fill="#ff7a24" {...st} /><path d="M12 12 L19 20 M52 12 L45 20" stroke="#3a1808" strokeWidth="2" /><path d="M20 40 C24 32 40 32 44 40 C42 52 22 52 20 40Z" fill="#fff2e0" {...st} /><ellipse cx="32" cy="41" rx="3.6" ry="2.6" fill="#120804" /><Eyes y={30} dx={10} r={2.4} /><path d="M50 52 C58 50 62 42 58 34 C56 44 52 46 46 48Z" fill="#ffd24a" {...st} /></g>),
  pet_owl: () => (<g><path d="M4 22 C10 18 16 24 18 34 C12 36 6 32 4 22Z M60 22 C54 18 48 24 46 34 C52 36 58 32 60 22Z" fill="#8fc4f4" {...st} /><path d="M14 8 L22 16 H42 L50 8 L54 34 C54 50 44 58 32 58 C20 58 10 50 10 34Z" fill="#bfe8ff" {...st} /><circle cx="23" cy="28" r="9" fill="#fff" {...st} /><circle cx="41" cy="28" r="9" fill="#fff" {...st} /><circle cx="23" cy="28" r="4.5" fill="#5ad0ff" /><circle cx="41" cy="28" r="4.5" fill="#5ad0ff" /><circle cx="23" cy="28" r="2" fill="#120804" /><circle cx="41" cy="28" r="2" fill="#120804" /><path d="M32 33 L28 40 H36Z" fill="#ffd060" {...st} /><path d="M22 46 C26 52 38 52 42 46" stroke="#6fa8e0" strokeWidth="2" fill="none" /></g>),
  pet_mimic: () => (<g><path d="M6 30 H58 V54 C58 58 54 60 50 60 H14 C10 60 6 58 6 54Z" fill="#7a4a22" {...st} /><path d="M8 28 C8 12 56 12 56 28Z" fill="#5a3416" {...st} /><path d="M6 30 H58" stroke="#e9b949" strokeWidth="4" /><path d="M16 29 L19 36 L22 29 L26 36 L29 29 L33 36 L36 29 L40 36 L43 29 L47 36 L50 29" fill="#fff" {...st} /><path d="M20 38 H44 C44 50 20 50 20 38Z" fill="#8a1a24" {...st} /><path d="M28 44 C30 52 36 52 38 44Z" fill="#ff6a8a" {...st} /><circle cx="22" cy="20" r="3.4" fill="#ffe040" {...st} /><circle cx="42" cy="20" r="3.4" fill="#ffe040" {...st} /><rect x="29" y="52" width="6" height="6" rx="1" fill="#e9b949" {...st} /></g>),
  pet_sprite: () => (<g><circle cx="32" cy="32" r="28" fill="#7fd0ff" opacity=".18" /><path d="M32 2 L37 24 L58 20 L40 32 L50 52 L32 38 L14 52 L24 32 L6 20 L27 24Z" fill="#b8e8ff" {...st} /><circle cx="32" cy="32" r="12" fill="#7fd0ff" {...st} /><circle cx="32" cy="32" r="6.5" fill="#fff7a0" /><Eyes y={31} dx={3.2} r={1.2} /><path d="M10 52 L18 44 L14 56 L24 46 M54 52 L46 44 L50 56 L40 46" stroke="#fff7a0" strokeWidth="1.6" fill="none" strokeLinejoin="round" /></g>),
  pet_turtle: () => (<g><path d="M6 50 C4 26 18 10 32 10 C46 10 60 26 58 50 C58 56 48 58 32 58 C16 58 6 56 6 50Z" fill="#3f9a6a" {...st} /><path d="M32 14 L44 22 V36 L32 44 L20 36 V22Z" fill="#7fd8a0" {...st} /><path d="M32 14 V44 M20 22 L44 36 M44 22 L20 36" stroke="#1d5a3a" strokeWidth="1.2" /><path d="M2 46 C2 40 8 38 12 42 L12 52 C6 54 2 52 2 46Z" fill="#9ad08a" {...st} /><circle cx="7" cy="45" r="1.6" fill="#120804" /><circle cx="32" cy="29" r="5" fill="#7fe8ff" stroke={S} strokeWidth="1" /></g>),
  pet_shadowcat: () => (<g><circle cx="32" cy="34" r="28" fill="#8a50d0" opacity=".2" /><path d="M8 4 L22 16 H42 L56 4 L58 32 C58 48 46 58 32 58 C18 58 6 48 6 32Z" fill="#2a2038" {...st} /><path d="M12 10 L19 18 M52 10 L45 18" stroke="#c070ff" strokeWidth="1.6" /><path d="M14 30 L26 34 L22 38Z M50 30 L38 34 L42 38Z" fill="#c070ff" {...st} /><path d="M32 38 L29 42 H35Z" fill="#ff90c0" {...st} /><path d="M28 46 Q32 49 36 46" stroke="#c070ff" strokeWidth="1.4" fill="none" /><path d="M2 36 H14 M2 41 H14 M62 36 H50 M62 41 H50" stroke="#c9b6ee" strokeWidth="1" /></g>),
  pet_crystal: () => (<g><rect x="12" y="20" width="40" height="34" rx="4" fill="#6a7488" {...st} /><path d="M14 22 L18 4 L26 18 L32 0 L38 18 L46 4 L50 22Z" fill="#7fe0ff" {...st} /><path d="M32 0 L38 18 L32 20Z M18 4 L26 18 L18 22Z" fill="#fff" opacity=".45" /><rect x="18" y="28" width="28" height="9" rx="2" fill="#120804" /><circle cx="25" cy="32.5" r="3.2" fill="#b8f4ff" /><circle cx="39" cy="32.5" r="3.2" fill="#b8f4ff" /><path d="M24 46 H40" stroke="#b8f4ff" strokeWidth="2" strokeLinecap="round" /><path d="M12 40 H4 V54 H12 M52 40 H60 V54 H52" fill="#556070" {...st} /></g>),
  pet_leviathan: () => (<g><circle cx="32" cy="32" r="30" fill="#7fe0ff" opacity=".18" /><path d="M6 44 C6 20 22 8 36 12 C50 16 54 30 46 38 C40 44 34 36 38 30 C40 26 34 24 28 28 C20 34 22 52 10 56Z" fill={g('blue')} {...st} /><path d="M10 50 C16 38 20 30 30 28" stroke="#d8fbff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" /><path d="M36 12 L38 3 L44 11 L52 6 L48 16" fill="#7fe0ff" {...st} /><circle cx="44" cy="22" r="2.4" fill="#fff" stroke={S} strokeWidth="1" /><path d="M50 26 L58 30 L50 32Z" fill="#7fe0ff" {...st} /><path d="M2 30 C6 28 10 30 12 34 M2 22 C8 20 12 22 14 26" stroke="#9ff4ff" strokeWidth="1.6" fill="none" strokeLinecap="round" /></g>),
  pet_demigod: () => (<g><circle cx="32" cy="32" r="28" fill="#9be8ff" opacity=".2" /><path d="M32 4 C38 18 56 20 56 36 C56 52 44 60 32 60 C20 60 8 52 8 36 C8 20 26 18 32 4Z" fill={g('glass')} {...st} /><path d="M32 4 C38 18 56 20 56 36 C56 52 44 60 32 60 C20 60 8 52 8 36 C8 20 26 18 32 4Z" fill={g('blue')} opacity=".55" /><path d="M32 22 L35 31 L44 32 L37 38 L39 47 L32 42 L25 47 L27 38 L20 32 L29 31Z" fill="#fff" opacity=".95" /><Eyes y={50} dx={5} r={1.6} /></g>),
};
const Paw: Draw = (c) => (<g><ellipse cx="32" cy="42" rx="13" ry="11" fill={c} {...st} /><circle cx="16" cy="28" r="6" fill={c} {...st} /><circle cx="27" cy="19" r="6" fill={c} {...st} /><circle cx="39" cy="19" r="6" fill={c} {...st} /><circle cx="49" cy="28" r="6" fill={c} {...st} /></g>);

const ARMOR: Record<string, ChestCfg> = {
  armor_1: { body: 'leather', trim: 'wood', mark: 'laces' },
  armor_2: { body: 'steel', trim: 'dark', mark: 'mail' },
  armor_elven: { body: 'green', trim: 'gold', mark: 'leaf' },
  armor_3: { body: 'steel', trim: 'gold', mark: 'plate', gem: '#e83a2e' },
  armor_obsidian: { body: 'dark', trim: 'purp', mark: 'obs', gem: '#c58bff', spikes: true },
  armor_4: { body: 'red', trim: 'gold', mark: 'scale', gem: '#ffd24a', spikes: true },
  armor_5: { body: 'void', trim: 'purp', mark: 'void', gem: '#7ff0ff', spikes: true, aura: '#b06cf8' },
};

// ---- helmets / gloves / boots by tier (0 common .. 4 mythic) ----
const GEAR_PAL = [
  ['#a9743d', '#5a3a1e', '#f0d8a0'], ['#c3cad6', '#4a566c', '#e9b949'], ['#4aa856', '#1d5a2a', '#ffd24a'], ['#d8452e', '#6a1410', '#ffd070'], ['#ffe08a', '#a8701a', '#7ff0ff'],
];
const Helmet = (t: number): Draw => () => { const [a, b, gem] = GEAR_PAL[t]; return (<g>
  {t === 3 && <path d="M12 30 C4 26 2 14 8 6 C10 16 16 22 20 24Z M52 30 C60 26 62 14 56 6 C54 16 48 22 44 24Z" fill="#fff0c8" {...st} />}
  <path d={t === 2 ? 'M10 52 C6 24 18 8 32 8 C46 8 58 24 54 52 L44 46 V34 H20 V46Z' : 'M10 50 C8 24 18 10 32 10 C46 10 56 24 54 50 H44 V38 H20 V50Z'} fill={a} {...st} />
  <path d="M32 10 V34" stroke={b} strokeWidth="3" /><path d="M14 22 C20 14 26 12 32 12" stroke="#fff" strokeOpacity=".5" strokeWidth="2" fill="none" />
  {t !== 2 && <path d="M20 34 H44 V40 H20Z" fill={b} {...st} />}
  {t === 4 && <path d="M10 18 L16 4 L24 14 L32 2 L40 14 L48 4 L54 18Z" fill={a} {...st} />}
  <circle cx="32" cy={t === 4 ? 12 : 24} r="3.6" fill={gem} stroke={S} strokeWidth="1" />
  <rect x="20" y="40" width="24" height="3" fill="#000" opacity=".35" />
</g>); };
const Gloves = (t: number): Draw => () => { const [a, b, gem] = GEAR_PAL[t]; return (<g>
  <path d="M18 56 V36 C10 34 8 26 12 20 C16 24 18 26 20 28 V12 C20 8 26 8 26 12 V24 V8 C26 4 32 4 32 8 V24 V10 C32 6 38 6 38 10 V26 V16 C38 12 44 12 44 16 V40 C50 44 48 52 46 56Z" fill={a} {...st} />
  <rect x="16" y="46" width="32" height="10" rx="2" fill={b} {...st} />
  <path d="M20 22 V32 M26 20 V32 M32 20 V32 M38 22 V32" stroke={S} strokeOpacity=".4" strokeWidth="1" />
  {t >= 3 && <path d="M18 30 L22 24 L26 30 M30 30 L34 24 L38 30" fill={gem} stroke={S} strokeWidth="1" />}
  <circle cx="32" cy="51" r="2.6" fill={gem} stroke={S} strokeWidth="1" />
  <path d="M14 22 C14 28 16 32 20 34" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" fill="none" />
</g>); };
const BootsT = (t: number): Draw => () => { const [a, b, gem] = GEAR_PAL[t]; return (<g>
  <path d="M16 6 H34 V32 C34 36 44 38 52 44 C58 47 58 56 52 56 H12 C8 56 8 50 12 48 L16 6Z" fill={a} {...st} />
  <path d="M12 48 H54 V56 H12Z" fill={b} {...st} /><path d="M16 6 H34 V14 H16Z" fill={gem} {...st} />
  <path d="M18 22 H34 M18 28 H34" stroke={S} strokeOpacity=".5" strokeWidth="1.2" />
  {t >= 2 && <path d="M6 18 C10 12 14 12 16 18 C14 20 10 20 6 18Z M4 28 C8 24 12 24 14 28 C12 30 8 30 4 28Z" fill="#fff" stroke={S} strokeWidth="1" opacity=".95" />}
  {t === 4 && <circle cx="26" cy="40" r="4" fill={gem} stroke={S} strokeWidth="1" />}
  <path d="M20 10 C20 24 22 34 28 40" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" fill="none" />
</g>); };

// ---- loot (trade goods). Each takes two palette colours (main, accent) ----
const LOOT_DRAW: Record<string, (a: string, b: string) => React.ReactNode> = {
  gel: (a, b) => (<g><path d="M10 54 C6 34 20 12 32 12 C44 12 58 34 54 54 C44 60 20 60 10 54Z" fill={a} {...st} /><ellipse cx="22" cy="28" rx="5" ry="8" fill={b} opacity=".7" transform="rotate(20 22 28)" /><circle cx="44" cy="44" r="2.4" fill={b} opacity=".6" /></g>),
  ear: (a, b) => (<g><path d="M14 54 C10 34 18 14 52 6 C50 22 46 40 38 52 C30 60 20 60 14 54Z" fill={a} {...st} /><path d="M22 48 C20 36 26 24 44 14 C42 28 38 38 32 46Z" fill={b} opacity=".75" /><path d="M20 52 C26 56 32 54 36 50" stroke={S} strokeOpacity=".5" fill="none" /></g>),
  wing: (a, b) => (<g><path d="M4 42 C4 20 20 8 40 10 C34 14 32 18 34 22 C38 20 44 22 48 28 C42 28 40 32 42 36 C48 34 54 38 58 44 C48 42 44 46 44 52 C34 46 20 50 12 56 C14 50 12 46 4 42Z" fill={a} {...st} /><path d="M10 40 C22 26 34 22 46 28 M14 48 C26 38 38 36 52 42" stroke={b} strokeWidth="2" fill="none" /></g>),
  bone: (a, b) => (<g><path d="M14 46 L46 14 M18 50 L50 18" stroke={S} strokeWidth="12" strokeLinecap="round" /><path d="M16 48 L48 16" stroke={a} strokeWidth="9" strokeLinecap="round" /><circle cx="12" cy="44" r="6" fill={a} {...st} /><circle cx="20" cy="52" r="6" fill={a} {...st} /><circle cx="44" cy="12" r="6" fill={a} {...st} /><circle cx="52" cy="20" r="6" fill={a} {...st} /><path d="M20 40 L40 20" stroke={b} strokeWidth="2" strokeOpacity=".7" /></g>),
  rune: (a, b) => (<g><path d="M14 12 L50 10 L56 40 L42 58 L18 56 L8 36Z" fill={a} {...st} /><path d="M32 18 V46 M22 28 L32 22 L42 28 M24 40 L40 40" stroke={b} strokeWidth="3.4" fill="none" strokeLinecap="round" /><path d="M32 18 V46 M22 28 L32 22 L42 28 M24 40 L40 40" stroke="#fff" strokeOpacity=".5" strokeWidth="1" fill="none" /></g>),
  shell: (a, b) => (<g><path d="M6 46 C6 22 20 8 32 8 C44 8 58 22 58 46 C58 54 44 58 32 58 C20 58 6 54 6 46Z" fill={a} {...st} /><path d="M32 8 V58" stroke={S} strokeWidth="2" /><path d="M14 22 C20 14 26 12 28 12 M14 36 C16 30 20 26 26 24" stroke={b} strokeWidth="3" fill="none" strokeLinecap="round" /><circle cx="22" cy="42" r="3" fill={b} opacity=".6" /><circle cx="42" cy="42" r="3" fill={b} opacity=".6" /></g>),
  tusk: (a, b) => (<g><path d="M12 56 C8 30 20 10 48 6 C40 16 40 28 40 36 C40 46 34 54 26 56Z" fill={a} {...st} /><path d="M18 50 C16 34 24 20 40 12" stroke={b} strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M12 56 H28" stroke={S} strokeWidth="2" /></g>),
  heart: (a, b) => (<g><circle cx="32" cy="34" r="27" fill={a} opacity=".22" /><path d="M32 56 C8 40 4 22 16 14 C24 9 30 14 32 20 C34 14 40 9 48 14 C60 22 56 40 32 56Z" fill={a} {...st} /><path d="M32 56 C16 42 12 30 18 22 C22 28 28 30 32 28Z" fill={b} opacity=".55" /><path d="M20 20 C22 17 26 16 28 18" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>),
  shard: (a, b) => (<g><circle cx="32" cy="34" r="26" fill={a} opacity=".2" /><path d="M30 4 L46 22 L40 56 L28 60 L18 36Z" fill={a} {...st} /><path d="M30 4 L46 22 L32 28 L18 36Z" fill={b} opacity=".7" /><path d="M32 28 L40 56" stroke="#fff" strokeOpacity=".5" /></g>),
  trophy: (a, b) => (<g><path d="M18 8 H46 V26 C46 38 38 44 32 44 C26 44 18 38 18 26Z" fill={a} {...st} /><path d="M18 12 H8 C8 24 12 28 20 30 M46 12 H56 C56 24 52 28 44 30" fill="none" stroke={a} strokeWidth="4" /><rect x="28" y="44" width="8" height="8" fill={a} {...st} /><rect x="18" y="52" width="28" height="6" rx="1" fill={b} {...st} /><path d="M32 14 L35 22 L43 22 L37 27 L39 35 L32 30 L25 35 L27 27 L21 22 L29 22Z" fill={b} stroke={S} strokeWidth="1" /></g>),
  goblet: (a, b) => (<g><path d="M14 8 H50 C50 28 42 36 34 38 V50 H44 V58 H20 V50 H30 V38 C22 36 14 28 14 8Z" fill={a} {...st} /><path d="M14 8 H50" stroke={b} strokeWidth="3" /><path d="M18 12 C18 24 22 30 28 33" stroke="#fff" strokeOpacity=".6" strokeWidth="2" fill="none" /><circle cx="32" cy="22" r="3.4" fill="#e83a2e" stroke={S} strokeWidth="1" /></g>),
  pouch: (a, b) => (<g><path d="M24 12 C20 6 28 4 32 8 C36 4 44 6 40 12 L44 18 C54 28 58 42 52 52 C46 60 18 60 12 52 C6 42 10 28 20 18Z" fill={a} {...st} /><path d="M22 18 H42" stroke={b} strokeWidth="4" strokeLinecap="round" /><circle cx="32" cy="40" r="8" fill={b} stroke={S} strokeWidth="1.2" /><path d="M32 35 V45 M29 38 H35 M29 42 H35" stroke={S} strokeOpacity=".6" /></g>),
  relic: (a, b) => (<g><path d="M20 58 V40 C14 34 12 22 20 14 C26 8 38 8 44 14 C52 22 50 34 44 40 V58Z" fill={a} {...st} /><circle cx="32" cy="26" r="9" fill="none" stroke={b} strokeWidth="3" /><circle cx="32" cy="26" r="3" fill={b} /><path d="M24 44 H40 M24 50 H40" stroke={b} strokeWidth="2" /><path d="M14 58 H50" stroke={S} strokeWidth="3" /></g>),
  skull: (a, b) => (<g><path d="M10 28 C10 12 22 6 32 6 C42 6 54 12 54 28 C54 36 48 40 46 44 V54 H18 V44 C16 40 10 36 10 28Z" fill={a} {...st} /><ellipse cx="22" cy="30" rx="6" ry="7" fill="#120804" /><ellipse cx="42" cy="30" rx="6" ry="7" fill="#120804" /><circle cx="22" cy="30" r="2.4" fill={b} /><circle cx="42" cy="30" r="2.4" fill={b} /><path d="M32 38 L28 46 H36Z" fill="#120804" /><path d="M24 54 V48 M32 54 V48 M40 54 V48" stroke={S} strokeWidth="1.5" /></g>),
  crown: (a, b) => (<g><path d="M6 48 L10 18 L22 32 L32 10 L42 32 L54 18 L58 48Z" fill={a} {...st} /><rect x="6" y="46" width="52" height="10" rx="2" fill={a} {...st} /><circle cx="32" cy="16" r="3.4" fill={b} stroke={S} strokeWidth="1" /><circle cx="14" cy="26" r="2.6" fill={b} stroke={S} strokeWidth="1" /><circle cx="50" cy="26" r="2.6" fill={b} stroke={S} strokeWidth="1" /><circle cx="20" cy="51" r="2.4" fill={b} /><circle cx="32" cy="51" r="2.4" fill={b} /><circle cx="44" cy="51" r="2.4" fill={b} /></g>),
  fang: (a, b) => (<g><path d="M8 16 C8 40 20 52 32 52 C44 52 56 40 56 16" fill="none" stroke={b} strokeWidth="3" /><path d="M24 48 L28 60 L32 50Z M32 52 L38 62 L40 50Z M14 38 L12 50 L20 42Z M44 42 L50 50 L50 38Z" fill={a} {...st} /><path d="M30 42 L36 54 L38 42Z" fill={a} {...st} /></g>),
  totem: (a, b) => (<g><path d="M20 6 H44 V58 H20Z" fill={a} {...st} /><path d="M20 6 L12 14 L20 18 M44 6 L52 14 L44 18" fill={a} {...st} /><circle cx="27" cy="20" r="4" fill={b} stroke={S} strokeWidth="1" /><circle cx="37" cy="20" r="4" fill={b} stroke={S} strokeWidth="1" /><path d="M24 32 H40 L38 40 H26Z" fill="#120804" /><path d="M24 36 H40" stroke="#fff" strokeWidth="1.4" /><path d="M24 48 L32 44 L40 48" stroke={b} strokeWidth="3" fill="none" /></g>),
  banner: (a, b) => (<g><rect x="10" y="4" width="44" height="5" rx="2" fill="#6e4b2b" {...st} /><path d="M14 9 H50 V50 L40 42 L32 52 L24 42 L14 50Z" fill={a} {...st} /><path d="M32 18 L36 28 H28Z M22 34 H42" stroke={b} strokeWidth="3" fill={b} strokeLinejoin="round" /><path d="M16 12 V44" stroke="#fff" strokeOpacity=".3" strokeWidth="2" /></g>),
  eye: (a, b) => (<g><circle cx="32" cy="32" r="28" fill={a} opacity=".2" /><path d="M4 32 C14 14 50 14 60 32 C50 50 14 50 4 32Z" fill="#f0f4ea" {...st} /><circle cx="32" cy="32" r="12" fill={a} stroke={S} strokeWidth="1.4" /><ellipse cx="32" cy="32" rx="3.4" ry="10" fill="#0a1a10" /><circle cx="27" cy="27" r="3" fill={b} /></g>),
  page: (a, b) => (<g><path d="M12 6 H44 L52 14 V58 H12Z" fill={a} {...st} /><path d="M44 6 V14 H52" fill="#00000030" stroke={S} strokeWidth="1.2" /><path d="M18 22 H44 M18 30 H40 M18 38 H44 M18 46 H34" stroke={S} strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" /><circle cx="40" cy="46" r="6" fill="none" stroke={b} strokeWidth="2.4" /><path d="M40 41 V51 M35 46 H45" stroke={b} strokeWidth="1.6" /></g>),
  medal: (a, b) => (<g><path d="M18 4 L28 26 H36 L46 4 H38 L32 16 L26 4Z" fill={a} {...st} /><circle cx="32" cy="40" r="18" fill={b} {...st} /><circle cx="32" cy="40" r="13" fill={a} stroke={S} strokeWidth="1" /><path d="M32 29 L35 37 L43 37 L37 42 L39 50 L32 45 L25 50 L27 42 L21 37 L29 37Z" fill={b} stroke={S} strokeWidth="1" /></g>),
  gland: (a, b) => (<g><path d="M32 6 C46 22 56 32 52 44 C48 56 16 56 12 44 C8 32 18 22 32 6Z" fill={a} {...st} /><path d="M32 18 C40 28 44 34 42 42 C40 48 24 48 22 42 C20 34 26 28 32 18Z" fill={b} opacity=".85" /><path d="M20 34 C20 30 22 28 24 26" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" /></g>),
  orb: (a, b) => (<g><circle cx="32" cy="32" r="26" fill={a} {...st} /><circle cx="32" cy="32" r="14" fill={b} opacity=".7" /><circle cx="32" cy="32" r="6" fill="#fff" opacity=".9" /><path d="M16 22 C20 14 28 10 36 10" stroke="#fff" strokeOpacity=".7" strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>),
  crystal: (a, b) => (<g><path d="M32 4 L46 22 L42 56 L32 60 L22 56 L18 22Z" fill={a} {...st} /><path d="M32 4 L46 22 L32 28 L18 22Z" fill={b} opacity=".75" /><path d="M32 28 V60" stroke="#fff" strokeOpacity=".5" /><path d="M10 40 L16 30 L20 52 L12 56Z M54 40 L48 30 L44 52 L52 56Z" fill={a} {...st} /></g>),
  nugget: (a, b) => (<g><path d="M8 44 L16 22 L34 12 L52 22 L58 42 L46 56 L20 56Z" fill={a} {...st} /><path d="M16 22 L34 12 L36 30 L8 44Z" fill={b} opacity=".4" /><path d="M36 30 L52 22 M36 30 L46 56" stroke={S} strokeOpacity=".5" /><circle cx="26" cy="32" r="3" fill={b} /><circle cx="42" cy="42" r="2.4" fill={b} /></g>),
  locket: (a, b) => (<g><path d="M32 2 C20 2 16 12 18 22" stroke={a} strokeWidth="3" fill="none" /><path d="M32 2 C44 2 48 12 46 22" stroke={a} strokeWidth="3" fill="none" /><path d="M32 58 C10 46 8 28 18 24 C26 22 30 28 32 32 C34 28 38 22 46 24 C56 28 54 46 32 58Z" fill={a} {...st} /><path d="M32 52 C18 44 16 32 22 30 C26 29 30 33 32 37 C34 33 38 29 42 30 C48 32 46 44 32 52Z" fill={b} opacity=".85" /></g>),
  seal: (a, b) => (<g><circle cx="32" cy="30" r="24" fill={a} {...st} /><circle cx="32" cy="30" r="17" fill="none" stroke={b} strokeWidth="2.4" /><path d="M32 16 L36 26 L46 26 L38 33 L41 43 L32 37 L23 43 L26 33 L18 26 L28 26Z" fill={b} stroke={S} strokeWidth="1" /><path d="M22 50 L18 62 L26 58 L32 62 L32 52Z M42 50 L46 62 L38 58 L32 62 L32 52Z" fill={a} {...st} /></g>),
};
const lootDraw = (glyph: string, a: string, b: string): Draw => () => (LOOT_DRAW[glyph] ?? LOOT_DRAW.nugget)(a, b);


// ---- parametric families for the generated catalog (shape x palette) ----
const BOW_PATH = ['M44 10 C26 16 26 48 44 54', 'M48 2 C16 12 12 52 48 62', 'M38 4 C54 14 22 22 22 32 C22 42 54 50 38 60', 'M46 6 C18 14 18 50 46 58'];
const BowP = (sh: number, p: Pal): Draw => () => {
  const d = BOW_PATH[sh % 4]; const x0 = [44, 48, 38, 46][sh % 4], y0 = [10, 2, 4, 6][sh % 4], y1 = [54, 62, 60, 58][sh % 4];
  return (<g>
    <circle cx="30" cy="32" r="26" fill={p.gem} opacity=".12" />
    <path d={d} fill="none" stroke={S} strokeWidth="8" strokeLinecap="round" />
    <path d={d} fill="none" stroke={g(p.a)} strokeWidth="5" strokeLinecap="round" />
    <path d={d} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1" transform="translate(-1.5 .5)" />
    {sh === 3 && <path d="M40 14 C26 20 26 44 40 50" fill="none" stroke={g(p.b)} strokeWidth="2.4" strokeLinecap="round" />}
    {sh === 1 && <path d="M18 18 C12 16 10 10 12 8 C16 8 19 12 18 18Z M18 46 C12 48 10 54 12 56 C16 56 19 52 18 46Z" fill={g(p.b)} {...st} />}
    {sh === 2 && <><circle cx="38" cy="4" r="2.6" fill={g(p.b)} {...st} /><circle cx="38" cy="60" r="2.6" fill={g(p.b)} {...st} /></>}
    <path d={`M${x0} ${y0} L${x0} ${y1}`} stroke="#f1ead8" strokeWidth="1.1" />
    <path d="M10 32 H50" stroke={S} strokeWidth="3.4" strokeLinecap="round" /><path d="M10 32 H50" stroke={g('wood')} strokeWidth="1.6" />
    <path d="M54 32 L47 27 V37Z" fill={g('steel')} {...st} /><path d="M10 32 L5 28 M10 32 L5 36 M14 32 L9 28 M14 32 L9 36" stroke={p.gem} strokeWidth="2" strokeLinecap="round" />
    <rect x="21" y="27" width="6" height="10" rx="2" fill={g(p.b)} {...st} />{Facet(24, 32, 2.4, p.gem, true)}
  </g>);
};
const StaffP = (sh: number, p: Pal): Draw => () => (<g transform="rotate(40 32 32)">
  <circle cx="32" cy="12" r="18" fill={p.gem} opacity=".16" />
  <rect x="29.6" y="16" width="4.8" height="46" rx="2.2" fill={g(p.b)} {...st} /><path d="M29.6 34 H34.4 M29.6 42 H34.4" stroke={S} strokeOpacity=".5" strokeWidth="1" />
  {sh === 0 && <><path d="M25 12 C23 4 30 4 32 9 C34 4 41 4 39 12 C38 18 34 20 32 20 C30 20 26 18 25 12Z" fill={g(p.a)} {...st} />{Orb(32, 10, 5, p.gem)}</>}
  {sh === 1 && <><path d="M22 4 C16 14 22 24 32 24 C42 24 48 14 42 4 C42 14 38 19 32 19 C26 19 22 14 22 4Z" fill={g(p.a)} {...st} />{Orb(32, 11, 4.6, p.gem)}</>}
  {sh === 2 && <><path d="M32 -2 L40 10 L36 22 L28 22 L24 10Z" fill={p.gem} stroke={S} strokeWidth="1.3" strokeLinejoin="round" /><path d="M32 -2 L32 22 M24 10 H40" stroke="#fff" strokeOpacity=".6" strokeWidth=".9" /><path d="M24 20 H40 L38 25 H26Z" fill={g(p.a)} {...st} /></>}
  {sh === 3 && <><ellipse cx="32" cy="11" rx="14" ry="5.4" fill="none" stroke={S} strokeWidth="3.4" /><ellipse cx="32" cy="11" rx="14" ry="5.4" fill="none" stroke={g(p.a)} strokeWidth="1.8" /><path d="M32 -5 L35 4 L32 8 L29 4Z M18 -1 L23 5 M46 -1 L41 5" fill={g(p.a)} {...st} />{Orb(32, 11, 7.4, p.gem)}{Spark(32, 11, 3.6)}</>}
  <rect x="27" y="21" width="10" height="3.8" rx="1.5" fill={g(p.a)} {...st} />
</g>);
const AxeP = (sh: number, p: Pal): Draw => () => (<g transform="rotate(35 32 32)">
  <circle cx="32" cy="20" r="26" fill={p.gem} opacity=".14" />
  <rect x="29.8" y="4" width="4.4" height="58" rx="2" fill={g(p.b)} {...st} />
  {sh === 0 && <><path d={BLADE_R} fill={g(p.a)} {...st} /><path d="M50 14 C54 20 54 26 50 31" stroke="#fff" strokeOpacity=".75" strokeWidth="1.5" fill="none" strokeLinecap="round" /></>}
  {sh === 1 && <><path d={BLADE_R} fill={g(p.a)} {...st} /><path d={BLADE_L} fill={g(p.a)} {...st} /><path d="M50 14 C54 20 54 26 50 31 M14 18 C13 22 14 26 17 29" stroke="#fff" strokeOpacity=".7" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>}
  {sh === 2 && <><path d="M34 8 H56 L58 36 H34Z" fill={g(p.a)} {...st} /><circle cx="48" cy="22" r="3.2" fill="#14100c" stroke={S} strokeWidth="1" /><path d="M38 12 V32" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" /></>}
  {sh === 3 && <><path d="M34 8 C46 4 58 10 58 22 C58 30 50 36 34 36 C40 28 40 16 34 8Z" fill={g(p.a)} {...st} /><path d="M30 14 L18 8 L26 22 L30 24Z" fill={g(p.a)} {...st} /><path d="M58 22 L64 20 L58 14" fill={g(p.b)} {...st} /></>}
  <rect x="27.5" y="22" width="9" height="7" rx="1.5" fill={g(p.b)} {...st} />{Facet(32, 25.5, 3, p.gem, true)}
  <rect x="29" y="58" width="6" height="4" rx="1.5" fill={g(p.b)} {...st} />
</g>);

const SwordP = (sh: number, p: Pal): Draw => () => (<g transform="rotate(40 32 32)">
  <circle cx="32" cy="22" r="26" fill={p.gem} opacity=".14" />
  <path d={sh % 2 ? 'M28 6 L32 0 L36 6 L36 42 L28 42Z' : 'M29 4 L32 -1 L35 4 L36 42 L28 42Z'} fill={g(p.a)} {...st} />
  <path d="M32 3 V40" stroke="#fff" strokeOpacity=".55" strokeWidth="1.3" />
  <rect x={sh >= 2 ? 17 : 20} y="41" width={sh >= 2 ? 30 : 24} height="5" rx="2" fill={g(p.b)} {...st} />
  <rect x="29.5" y="46" width="5" height="12" rx="1.5" fill={g('leather')} {...st} />
  <circle cx="32" cy="60" r="3.2" fill={g(p.b)} {...st} />{Facet(32, 43.5, 2.6, p.gem, true)}
</g>);

const HelmP = (sh: number, p: Pal): Draw => () => (<g>
  {sh === 4 && <path d="M12 30 C2 28 0 14 8 6 C10 16 16 22 20 24Z M52 30 C62 28 64 14 56 6 C54 16 48 22 44 24Z" fill="#fff0c8" {...st} />}
  {sh === 1 && <path d="M10 54 C8 28 20 8 36 4 C32 14 34 22 40 28 C44 34 52 40 54 54 H44 V40 H20 V54Z" fill={g(p.a)} {...st} />}
  {sh === 6 && <path d="M8 50 H56 L50 44 C46 36 42 24 34 4 C30 22 18 36 14 44Z" fill={g(p.a)} {...st} />}
  {sh === 7 && <><path d="M10 40 C10 20 22 12 32 12 C42 12 54 20 54 40 H10Z" fill={g(p.a)} {...st} /><path d="M52 34 L62 42 L50 44Z M54 40 L60 54 L50 46Z" fill={g(p.b)} {...st} /><path d="M10 34 H54 V42 H10Z" fill={g(p.b)} {...st} /></>}
  {sh === 5 && <><path d="M12 40 C12 34 20 30 32 30 C44 30 52 34 52 40 C52 46 44 50 32 50 C20 50 12 46 12 40Z" fill="none" stroke={S} strokeWidth="6" /><path d="M12 40 C12 34 20 30 32 30 C44 30 52 34 52 40" fill="none" stroke={g(p.a)} strokeWidth="3.6" /><path d="M14 36 L10 22 L22 32 L32 16 L42 32 L54 22 L50 36Z" fill={g(p.a)} {...st} /></>}
  {(sh === 0 || sh === 2 || sh === 3 || sh === 4) && <path d={sh === 3 ? 'M12 52 C10 26 18 10 32 10 C46 10 54 26 52 52 H12Z' : sh === 2 ? 'M10 50 C8 24 18 10 32 10 C46 10 56 24 54 50 H44 V38 H20 V50Z' : 'M10 48 C10 24 20 12 32 12 C44 12 54 24 54 48Z'} fill={g(p.a)} {...st} />}
  {sh === 0 && <path d="M6 46 H58 L56 52 H8Z" fill={g(p.b)} {...st} />}
  {sh === 2 && <><path d="M29 22 H35 V44 H29Z" fill={g(p.b)} {...st} /><path d="M20 34 H44 V40 H20Z" fill={g(p.b)} {...st} /></>}
  {sh === 3 && <><path d="M18 30 H46 V36 H18Z" fill="#0b0806" stroke={S} strokeWidth="1" /><path d="M32 12 V52" stroke={g(p.b)} strokeWidth="3" /><path d="M20 40 H44 M20 46 H44" stroke={S} strokeOpacity=".4" strokeWidth="1" /></>}
  {sh === 4 && <path d="M20 36 H44 V42 H20Z" fill={g(p.b)} {...st} />}
  {sh !== 5 && sh !== 7 && <path d="M15 22 C20 15 26 13 32 13" stroke="#fff" strokeOpacity=".5" strokeWidth="2" fill="none" strokeLinecap="round" />}
  <circle cx="32" cy={sh === 6 ? 40 : sh === 5 ? 24 : sh === 3 ? 22 : 26} r="3.2" fill={p.gem} stroke={S} strokeWidth="1" />
</g>);
const ArmorP = (sh: number, p: Pal): Draw => sh === 1 ? () => (<g>
  <path d="M12 12 L24 6 H40 L52 12 L58 24 L48 28 L52 60 H12 L16 28 L6 24Z" fill={g(p.a)} {...st} />
  <path d="M24 6 C28 16 36 16 40 6 L36 4 H28Z" fill="#14100c" {...st} /><path d="M16 36 H48" stroke={g(p.b)} strokeWidth="4" /><path d="M16 36 H48" stroke={S} strokeWidth=".8" />
  <path d="M32 18 V60 M22 40 L18 60 M42 40 L46 60" stroke={S} strokeOpacity=".35" strokeWidth="1.2" />{Facet(32, 36, 3.6, p.gem, true)}<path d="M12 14 L8 24" stroke="#fff" strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round" />
</g>) : sh === 2 ? () => (<g>
  <path d="M32 4 C44 4 50 14 50 24 L58 56 H6 L14 24 C14 14 20 4 32 4Z" fill={g(p.a)} {...st} />
  <path d="M32 8 C38 8 42 14 42 22 L32 30 L22 22 C22 14 26 8 32 8Z" fill="#14100c" {...st} /><path d="M32 30 V58 M20 34 L14 56 M44 34 L50 56" stroke={S} strokeOpacity=".4" strokeWidth="1.2" />
  <circle cx="32" cy="32" r="3.6" fill={g(p.b)} {...st} />{Facet(32, 32, 2.2, p.gem)}<path d="M18 16 C16 26 14 36 12 48" stroke="#fff" strokeOpacity=".4" strokeWidth="1.4" fill="none" />
</g>) : Chest({ body: p.a, trim: p.b, mark: sh === 3 ? 'laces' : 'plate', gem: sh === 0 ? p.gem : undefined, spikes: false });
const GlovesP = (sh: number, p: Pal): Draw => () => (<g>
  <path d="M18 56 V36 C10 34 8 26 12 20 C16 24 18 26 20 28 V12 C20 8 26 8 26 12 V24 V8 C26 4 32 4 32 8 V24 V10 C32 6 38 6 38 10 V26 V16 C38 12 44 12 44 16 V40 C50 44 48 52 46 56Z" fill={g(p.a)} {...st} />
  <rect x="16" y={sh === 0 ? 44 : 46} width="32" height={sh === 0 ? 12 : 10} rx="2" fill={g(p.b)} {...st} />
  {sh === 0 && <path d="M16 48 L48 52 M16 52 L48 56 M22 22 L38 30 M22 30 L38 22" stroke="#f1d9a0" strokeWidth="1.4" strokeLinecap="round" />}
  {sh === 2 && <path d="M20 14 H26 M26 10 H32 M32 12 H38 M20 24 H38" stroke={S} strokeOpacity=".55" strokeWidth="1.6" />}
  {sh === 3 && <path d="M20 8 L22 0 L25 8 M26 6 L29 -2 L32 6 M32 8 L35 0 L38 8 M38 12 L42 4 L44 14" fill="#f4f1e8" stroke={S} strokeWidth="1" strokeLinejoin="round" />}
  {sh === 1 && <path d="M20 22 V32 M26 20 V32 M32 20 V32 M38 22 V32" stroke={S} strokeOpacity=".4" strokeWidth="1" />}
  <circle cx="32" cy="51" r="2.6" fill={p.gem} stroke={S} strokeWidth="1" /><path d="M14 22 C14 28 16 32 20 34" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" fill="none" />
</g>);
const BootsP = (sh: number, p: Pal): Draw => () => (<g>
  {sh === 3 ? <path d="M18 14 H34 V34 C36 40 46 40 54 36 C60 34 62 42 56 48 C48 56 30 56 14 56 C8 56 8 48 14 46Z" fill={g(p.a)} {...st} />
    : <path d={sh === 2 ? 'M14 4 H36 V34 C36 38 46 40 54 46 C58 49 58 58 52 58 H10 C6 58 6 50 12 48Z' : 'M16 8 H34 V32 C34 36 44 38 52 44 C58 47 58 56 52 56 H12 C8 56 8 50 12 48 L16 8Z'} fill={g(p.a)} {...st} />}
  <path d="M10 48 H54 V57 H10Z" fill={g(p.b)} {...st} /><path d="M16 8 H34 V15 H16Z" fill={g(p.b)} {...st} />
  {sh === 2 && <path d="M16 22 H36 M16 30 H36" stroke={g(p.b)} strokeWidth="4" />}
  {sh === 1 && <path d="M6 18 C10 12 14 12 16 18 C14 20 10 20 6 18Z M4 28 C8 24 12 24 14 28 C12 30 8 30 4 28Z" fill="#fff" stroke={S} strokeWidth="1" opacity=".95" />}
  {sh !== 2 && <path d="M18 22 H34 M18 28 H34" stroke={S} strokeOpacity=".5" strokeWidth="1.2" />}
  {sh === 0 && <path d="M30 50 L38 50 M44 50 L50 50" stroke="#f1ead8" strokeWidth="1.4" />}
  <circle cx="24" cy="42" r="2.6" fill={p.gem} stroke={S} strokeWidth="1" /><path d="M20 12 C20 24 22 34 28 40" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" fill="none" />
</g>);
const AccP = (sh: number, p: Pal): Draw => () => sh === 0 ? (<g>
  <circle cx="32" cy="30" r="24" fill={p.gem} opacity=".14" />
  <ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={S} strokeWidth="9" /><ellipse cx="32" cy="40" rx="18" ry="17" fill="none" stroke={g(p.a)} strokeWidth="6" />
  <path d="M18 34 C20 26 28 24 34 25" stroke="#fff" strokeOpacity=".65" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  <path d="M32 10 C40 10 44 16 40 24 H24 C20 16 24 10 32 10Z" fill={g(p.b)} {...st} />{Facet(32, 16, 6, p.gem, true)}
</g>) : sh === 1 ? (<g>
  <path d="M10 4 C14 30 24 36 32 38 C40 36 50 30 54 4" fill="none" stroke={S} strokeWidth="5" strokeLinecap="round" />
  <path d="M10 4 C14 30 24 36 32 38 C40 36 50 30 54 4" fill="none" stroke={g(p.a)} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 2" />
  <circle cx="32" cy="46" r="14" fill={p.gem} opacity=".22" /><path d="M32 32 L44 46 L32 60 L20 46Z" fill={g(p.b)} {...st} />{Facet(32, 46, 6.4, p.gem, true)}
</g>) : (<g>
  <path d="M14 6 C18 24 26 28 32 28 C38 28 46 24 50 6" fill="none" stroke={S} strokeWidth="4.4" strokeLinecap="round" /><path d="M14 6 C18 24 26 28 32 28 C38 28 46 24 50 6" fill="none" stroke={g(p.b)} strokeWidth="2" strokeLinecap="round" />
  <path d="M32 30 C46 34 52 46 46 58 C38 62 24 62 18 56 C12 46 20 34 32 30Z" fill={g(p.a)} {...st} /><path d="M32 36 C40 40 42 48 38 54 C32 56 26 54 24 50 C22 44 26 38 32 36Z" fill={p.gem} opacity=".85" stroke={S} strokeWidth="1" />
  <path d="M22 44 C24 40 28 38 32 38" stroke="#fff" strokeOpacity=".7" strokeWidth="1.4" fill="none" strokeLinecap="round" />{Spark(48, 40, 2.6)}
</g>);

const FAM: Record<ArtSpec['f'], (s: number, p: Pal) => Draw> = { bow: BowP, staff: StaffP, axe: AxeP, sword: SwordP, helm: HelmP, armor: ArmorP, gloves: GlovesP, boots: BootsP, acc: AccP };
const GENERATED_DRAW: Record<string, Draw> = Object.fromEntries(Object.entries(ART).map(([id, a]) => [id, FAM[a.f](a.s, a.pal)]));

/** Elixir flask: round bottle with a long neck, wax-sealed cork and a glowing liquid of the elixir's colour. */
const ElixirFlask = (liquid: string): Draw => () => (<g>
  <circle cx="32" cy="42" r="20" fill={liquid} opacity=".22" />
  <rect x="27" y="4" width="10" height="7" rx="2" fill={g('wood')} {...st} /><path d="M25 11 H39 V14 H25Z" fill="#a8352b" {...st} />
  <path d="M28 14 H36 V26 C46 28 52 35 52 43 C52 53 43 60 32 60 C21 60 12 53 12 43 C12 35 18 28 28 26Z" fill={g('glass')} opacity=".55" {...st} />
  <path d="M15 44 C15 37 21 33 32 33 C43 33 49 37 49 44 C49 52 42 57 32 57 C22 57 15 52 15 44Z" fill={liquid} stroke={S} strokeWidth="1" />
  <path d="M15 44 C21 41 26 47 32 44 C38 41 43 47 49 44" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.3" />
  <circle cx="26" cy="50" r="2.2" fill="#fff" opacity=".7" /><circle cx="37" cy="47" r="1.5" fill="#fff" opacity=".6" /><circle cx="31" cy="53" r="1.1" fill="#fff" opacity=".6" />
  <ellipse cx="19" cy="40" rx="2.6" ry="7" fill="#fff" opacity=".45" transform="rotate(18 19 40)" />
  <path d="M30 16 V25" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />{Spark(50, 22, 3)}
</g>);

const DRAW: Record<string, Draw> = {
  ...GENERATED_DRAW,
  staff_1: Staff(0), staff_rare: Staff(1), staff_3: Staff(2), staff_legend: Staff(3), staff_god: Staff(4),
  bow_1: Bow(0), bow_2: Bow(1), bow_epic: Bow(2), bow_legend: Bow(3), bow_god: Bow(4),
  sword_1: SwordP(0, { a: 'steel', b: 'gold', gem: '#ffe08a' }),
  axe_1: Axe(0), axe_2: Axe(1), axe_epic: Axe(2), axe_legend: Axe(3), axe_god: Axe(4),
  ...Object.fromEntries(Object.entries(ARMOR).map(([k, v]) => [k, Chest(v)])),
  ring_1: Ring(0), ring_wiz: Ring(1), ring_crit: Ring(2), ring_myth: Ring(3), boots_1: Boots, amulet_mana: Amulet(true), focus_crystal: Focus,
  potion_hp: Potion('red', false), potion_mana: Potion('blue', false), potion_hp_big: Potion('red', true), potion_mana_big: Potion('blue', true),
  upgrade_core: Core, revive_ankh: Ankh,
  helm_1: Helmet(0), helm_2: Helmet(1), helm_3: Helmet(2), helm_4: Helmet(3), helm_5: Helmet(4),
  gloves_1: Gloves(0), gloves_2: Gloves(1), gloves_3: Gloves(2), gloves_4: Gloves(3), gloves_5: Gloves(4),
  boots_0: BootsT(0), boots_3: BootsT(2), boots_4: BootsT(3), boots_5: BootsT(4),
  helmet: Helmet(0), gloves: Gloves(0),
  ...Object.fromEntries(LOOT.map((l) => ['loot_' + l.id, lootDraw(l.glyph, l.colors[0], l.colors[1])])),
  // generic fallbacks by type / projectile
  sword: Sword, bow: Bow(0), staff: Staff(0), axe: Axe(0), armor: Chest({ body: 'steel', trim: 'gold', mark: 'plate' }), ring: Ring(0), amulet: Amulet(false), core: Core, ankh: Ankh, chest: Treasure,
  potion_hp_fb: Potion('red', false), potion_mp_fb: Potion('blue', false), paw: Paw, ...PETS,
  ...Object.fromEntries(ELIXIR_IDS.map((k) => ['elixir_' + k, ElixirFlask(ELIXIRS[k].color)])),
};

const ID_BY_NAME = new Map<string, string>([...ITEMS_POOL, ...PETS_POOL].map((i) => [i.name, i.id]));
export function artKey(item: Item): string {
  if (DRAW[item.id]) return item.id;
  const tpl = ID_BY_NAME.get(item.name);
  if (tpl && DRAW[tpl]) return tpl; // bag instances carry unique ids: match their template by name
  switch (item.type) {
    case 'LOOT': return LOOT_BY_NAME[item.name] ? 'loot_' + LOOT_BY_NAME[item.name].id : 'chest';
    case 'HELMET': return 'helmet';
    case 'GLOVES': return 'gloves';
    case 'BOOTS': return 'boots_1';
    case 'POTION': return item.id.includes('mana') ? 'potion_mp_fb' : 'potion_hp_fb';
    case 'CORE': return 'core';
    case 'REVIVE': return 'ankh';
    case 'WEAPON': return item.projectileType === 'MAGIC' ? 'staff' : item.projectileType === 'ARROW' ? 'bow' : item.projectileType === 'AXE' ? 'axe' : 'sword';
    case 'ARMOR': return 'armor';
    case 'ACCESSORY': return item.id.includes('boots') ? 'boots_1' : item.id.includes('ring') ? 'ring' : 'amulet';
    case 'PET': return 'paw';
    case 'ELIXIR': return ELIXIR_BY_NAME[item.name] ? 'elixir_' + ELIXIR_BY_NAME[item.name].id : 'potion_hp_fb';
    default: return 'chest';
  }
}

const Art: React.FC<{ k: string; c: string; size: number | string }> = React.memo(({ k, c, size }) => (
  <Svg size={size}>{(DRAW[k] ?? Treasure)(k === 'paw' ? '#c8a878' : c)}</Svg>
));
Art.displayName = 'ItemArt';

/** Painted icon for an item. `size` is px or a css length / percentage. */
export const ItemArt: React.FC<{ item: Item; size?: number | string }> = ({ item, size = 26 }) => (
  item.type === 'SHARD' ? <ShardArt rarity={item.rarity} size={size} /> : <Art k={artKey(item)} c={RARITY_TEXT[item.rarity]} size={size} />
);
export const ItemArtByKey: React.FC<{ k: string; c?: string; size?: number | string }> = ({ k, c = '#e9b949', size = 26 }) => <Art k={k} c={c} size={size} />;

/** Small painted UI glyphs used in headers / footers. */
export const BagGlyph: React.FC<{ size?: number }> = React.memo(({ size = 28 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: 'block', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.7))' }}><Defs />
    <path d="M22 12 C24 4 40 4 42 12 L40 18 H24Z" fill={g('leather')} {...st} />
    <path d="M18 18 H46 C56 28 60 40 56 52 C54 58 46 60 32 60 C18 60 10 58 8 52 C4 40 8 28 18 18Z" fill={g('leather')} {...st} />
    <path d="M16 20 H48" stroke={g('gold')} strokeWidth="4" strokeLinecap="round" /><path d="M16 20 H48" stroke={S} strokeWidth=".8" />
    <path d="M18 34 C26 38 38 38 46 34" stroke={S} strokeOpacity=".5" strokeWidth="1.3" fill="none" />
    <rect x="26" y="38" width="12" height="10" rx="2" fill={g('gold')} {...st} /><circle cx="32" cy="43" r="1.8" fill={S} />
    <path d="M14 30 C12 38 12 46 14 52" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
));
export const AnvilGlyph: React.FC<{ size?: number; glow?: boolean }> = React.memo(({ size = 28, glow }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: 'block', filter: glow ? 'drop-shadow(0 0 6px rgba(255,170,60,.8))' : 'drop-shadow(0 2px 2px rgba(0,0,0,.7))' }}><Defs />
    <path d="M4 14 H44 C52 14 58 18 62 22 C56 22 52 24 50 28 C46 32 42 32 40 34 V40 H46 V52 H18 V40 H24 V34 C22 32 16 28 14 22 H4Z" fill={g('steel')} {...st} />
    <path d="M4 14 H44 C50 14 54 16 58 20 H8Z" fill="#fff" opacity=".45" />
    <path d="M18 46 H46 V54 H18Z" fill={g('dark')} {...st} />
    <path d="M26 36 V40 M38 36 V40" stroke={S} strokeOpacity=".5" strokeWidth="1.2" />
  </svg>
));
export const HourglassGlyph: React.FC<{ size?: number }> = React.memo(({ size = 14 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'inline-block', verticalAlign: '-2px' }}>
    <path d="M7 3 H25 M7 29 H25" stroke="#f1d58a" strokeWidth="4" strokeLinecap="round" />
    <path d="M9 4 C9 14 14 14 16 16 C14 18 9 18 9 28 H23 C23 18 18 18 16 16 C18 14 23 14 23 4Z" fill="#e8dcc0" fillOpacity=".25" stroke="#f1d58a" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 26 H20 L16 20Z" fill="#f1d58a" />
  </svg>
));
