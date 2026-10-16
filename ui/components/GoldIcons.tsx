// Solid gold icon set (owner reference: filled, engraved gold glyphs - no thin line icons). Drop-in replacement for
// the lucide-react icons the UI used: same names, same `size` / `className` / `style` / `color` props. Each glyph is a
// filled silhouette painted with the shared gold gradient (`GoldIconDefs`, mounted once in index.tsx) plus darker
// "engraved" detail lines. Passing `color` paints the silhouette in that colour instead (status effects, rarity).
import React from 'react';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}
export type IconType = React.FC<IconProps>;
/** (compat with code typed against lucide) */
export type LucideIcon = IconType;

const GOLD = 'url(#gi-gold)';
const ENGRAVE = '#2a1d0c';
/** inline so stray `svg { stroke }` rules can't outline the glyphs; a soft shadow lifts them off dark panels */
const BASE: React.CSSProperties = { stroke: 'none', flexShrink: 0, overflow: 'visible', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.55))' };

/** Glyph body: `g` is the fill (gold gradient or the given colour). */
type Draw = (g: string) => React.ReactNode;

/** Engraved detail line (dark, on top of the gold). */
const E: React.FC<{ d: string; w?: number }> = ({ d, w = 1.2 }) =>
  <path d={d} fill="none" stroke={ENGRAVE} strokeOpacity={0.6} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
/** Bold stroked shape painted gold (for arcs / arrows that read better as thick bands). */
const B: React.FC<{ d: string; g: string; w?: number }> = ({ d, g, w = 3 }) =>
  <path d={d} fill="none" stroke={g} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

function make(name: string, draw: Draw): IconType {
  const C: IconType = ({ size = 24, color, className, style, strokeWidth: _sw, absoluteStrokeWidth: _a, fill: _f, ...rest }) => {
    const g = color && color !== 'currentColor' ? color : GOLD;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={`gi ${className ?? ''}`} style={{ ...BASE, ...style }} aria-hidden="true" {...rest}>
        {draw(g)}
      </svg>
    );
  };
  C.displayName = name;
  return C;
}

const gearPath = (n: number, ro: number, ri: number, hole: number): string => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? ro : ri;
    const p0 = [12 + Math.cos(a0 + 0.06) * r, 12 + Math.sin(a0 + 0.06) * r], p1 = [12 + Math.cos(a1 - 0.06) * r, 12 + Math.sin(a1 - 0.06) * r];
    d += `${i === 0 ? 'M' : 'L'}${p0[0].toFixed(2)} ${p0[1].toFixed(2)}L${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  }
  return `${d}Z M12 ${12 - hole}a${hole} ${hole} 0 1 0 0 ${hole * 2}a${hole} ${hole} 0 1 0 0 ${-hole * 2}Z`;
};
const ring = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${r * 2}a${r} ${r} 0 1 1 0 ${-r * 2}Z`;
const SHIELD = 'M12 2 20 5v6.2c0 5-3.4 9.1-8 10.8-4.6-1.7-8-5.8-8-10.8V5Z';
const SHIELD_IN = 'M12 4.4 18 6.6v4.6c0 3.9-2.5 7.2-6 8.6-3.5-1.4-6-4.7-6-8.6V6.6Z';
const SWORD = 'M20.6 2.4 21.6 3.4 21.1 6.9 11.3 16.7 7.3 12.7 17.1 2.9Z M5.2 11.5 6.6 10.1 13.9 17.4 12.5 18.8Z M8.4 16.2 9.8 17.6 6.2 21.2a1.4 1.4 0 0 1-2-2Z';
const SPARK = (x: number, y: number, r: number) => `M${x} ${y - r}c${r * 0.13} ${r * 0.9} ${r * 0.5} ${r * 0.85} ${r} ${r}c${-r * 0.5} ${r * 0.15} ${-r * 0.87} ${r * 0.1} ${-r} ${r}c${-r * 0.13} ${-r * 0.9} ${-r * 0.5} ${-r * 0.85} ${-r} ${-r}c${r * 0.5} ${-r * 0.15} ${r * 0.87} ${-r * 0.1} ${r} ${-r}Z`;
const CAL = 'M3 6a2 2 0 0 1 2-2h1V2h3v2h6V2h3v2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z';
const SPEAKER = 'M2.5 9h4l6-5v16l-6-5h-4Z';
const DROP = 'M12 2.5c3.5 4.4 6.5 8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 8.5 6.9 12 2.5Z';
const WAVE = 'M2 6.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2v2.8c-2.5 0-2.5-2-5-2s-2.5 2-5 2-2.5-2-5-2-2.5 2-5 2Z';

export const GoldIconDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="gi-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3c4" />
        <stop offset=".38" stopColor="#f0cf7c" />
        <stop offset=".7" stopColor="#c9993f" />
        <stop offset="1" stopColor="#8e6624" />
      </linearGradient>
    </defs>
  </svg>
);

// ---------------------------------------------------------------- glyphs --
export const X = make('X', (g) => <path fill={g} d="M5.6 3.4 12 9.8l6.4-6.4 2.2 2.2-6.4 6.4 6.4 6.4-2.2 2.2-6.4-6.4-6.4 6.4-2.2-2.2 6.4-6.4-6.4-6.4Z" />);
export const Check = make('Check', (g) => <path fill={g} d="M9.4 15.5 19 5.9l2.3 2.3L9.4 20.1 2.7 13.4 5 11.1Z" />);
export const Plus = make('Plus', (g) => <path fill={g} d="M10.3 3.5h3.4v6.8h6.8v3.4h-6.8v6.8h-3.4v-6.8H3.5v-3.4h6.8Z" />);
export const Minus = make('Minus', (g) => <path fill={g} d="M3.5 10.3h17v3.4h-17Z" />);
export const ChevronDown = make('ChevronDown', (g) => <path fill={g} d="M4.1 7 12 14.9 19.9 7l2.1 2.1L12 19.1 2 9.1Z" />);
export const ChevronsDown = make('ChevronsDown', (g) => <path fill={g} d="M4.1 3 12 10.9 19.9 3 22 5.1 12 15.1 2 5.1Z M4.1 10 12 17.9 19.9 10 22 12.1 12 22.1 2 12.1Z" />);
export const ChevronLeft = make('ChevronLeft', (g) => <path fill={g} d="M17 4.1 9.1 12l7.9 7.9-2.1 2.1-10-10 10-10Z" />);
export const ChevronRight = make('ChevronRight', (g) => <path fill={g} d="M7 4.1 14.9 12 7 19.9 9.1 22l10-10-10-10Z" />);
export const ArrowRight = make('ArrowRight', (g) => <path fill={g} d="M2.5 10.3h12.6l-4.6-4.6 2.4-2.4 8.7 8.7-8.7 8.7-2.4-2.4 4.6-4.6H2.5Z" />);
export const Ellipsis = make('Ellipsis', (g) => <path fill={g} d={`${ring(5, 12, 2.3)} ${ring(12, 12, 2.3)} ${ring(19, 12, 2.3)}`} />);

export const Lock = make('Lock', (g) => <>
  <path fill={g} d="M6.8 10V7.6a5.2 5.2 0 0 1 10.4 0V10h-2.6V7.6a2.6 2.6 0 0 0-5.2 0V10Z" />
  <path fill={g} fillRule="evenodd" d="M5 10h14a1.2 1.2 0 0 1 1.2 1.2v8.6A1.2 1.2 0 0 1 19 21H5a1.2 1.2 0 0 1-1.2-1.2v-8.6A1.2 1.2 0 0 1 5 10Z M12 12.8a1.7 1.7 0 0 0-.85 3.2v2.6h1.7V16a1.7 1.7 0 0 0-.85-3.2Z" />
</>);
export const Unlock = make('Unlock', (g) => <>
  <path fill={g} d="M6.8 10V7.6a5.2 5.2 0 0 1 10-2l-2.4 1a2.6 2.6 0 0 0-5 1V10Z" />
  <path fill={g} fillRule="evenodd" d="M5 10h14a1.2 1.2 0 0 1 1.2 1.2v8.6A1.2 1.2 0 0 1 19 21H5a1.2 1.2 0 0 1-1.2-1.2v-8.6A1.2 1.2 0 0 1 5 10Z M12 12.8a1.7 1.7 0 0 0-.85 3.2v2.6h1.7V16a1.7 1.7 0 0 0-.85-3.2Z" />
</>);
export const Star = make('Star', (g) => <><path fill={g} d="M12 1.8l3 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.2 3.4 1.4-6.8-5.1-4.7 6.9-.8Z" /></>);
export const Sparkles = make('Sparkles', (g) => <path fill={g} d={`${SPARK(10, 9, 7.5)} ${SPARK(18.6, 16.4, 3.6)} ${SPARK(5, 18.6, 2.6)}`} />);
export const Flame = make('Flame', (g) => <>
  <path fill={g} d="M12 1.5c.6 3.2-1.2 4.9-2.9 6.7C7.4 10 5.6 11.9 5.6 14.9c0 3.8 2.9 6.9 6.4 6.9s6.4-3.1 6.4-6.9c0-2.9-1.5-4.7-2.8-6-.2 1.7-1 2.9-2.2 3.5.7-3.6-.3-7.3-1.4-10.9Z" />
  <E d="M12 19.8c-1.6 0-2.8-1.3-2.8-3 0-1.5 1.1-2.4 2-3.4.2 1 .8 1.5 1.5 1.9.2-1 .5-1.7 1.1-2.3.7.9 1.1 1.9 1.1 3 0 2.2-1.3 3.8-2.9 3.8Z" w={1} />
</>);
export const Heart = make('Heart', (g) => <><path fill={g} d="M12 21.3 3.8 13.4C1.4 11.1 1.4 7.3 3.8 5c2.3-2.2 5.8-2.2 8 0l.2.2.2-.2c2.2-2.2 5.7-2.2 8 0 2.4 2.3 2.4 6.1 0 8.4Z" /><E d="M6.2 7.6a2.3 2.3 0 0 1 2.6-.7" w={1} /></>);
export const Shield = make('Shield', (g) => <><path fill={g} d={SHIELD} /><E d={`${SHIELD_IN} M12 4.4v15.4`} w={0.9} /></>);
export const ShieldCheck = make('ShieldCheck', (g) => <><path fill={g} d={SHIELD} /><E d={SHIELD_IN} w={0.9} /><E d="M8.4 11.8l2.5 2.5 4.8-4.8" w={2} /></>);
export const ShieldOff = make('ShieldOff', (g) => <><path fill={g} d={SHIELD} /><E d={SHIELD_IN} w={0.9} /><E d="M5.5 4.5l13 15" w={2.2} /></>);
export const Hexagon = make('Hexagon', (g) => <><path fill={g} d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9Z" /><E d="M12 5.2 17.9 8.6v6.8L12 18.8 6.1 15.4V8.6Z" w={0.9} /></>);
export const Diamond = make('Diamond', (g) => <><path fill={g} d="M12 1.8 22.2 12 12 22.2 1.8 12Z" /><E d="M12 5.6 18.4 12 12 18.4 5.6 12Z" w={0.9} /></>);
export const Gem = make('Gem', (g) => <><path fill={g} d="M6.8 3h10.4l5 6.1L12 21.5 1.8 9.1Z" /><E d="M2.2 9.1h19.6 M9.6 9.1 12 3.3l2.4 5.8 M9.6 9.1 12 20.6l2.4-11.5" w={0.9} /></>);
export const Crown = make('Crown', (g) => <><path fill={g} d="M2.5 6.5 7.4 11 12 3.5l4.6 7.5 4.9-4.5-1.9 11.8H4.4Z M4.4 19.6h15.2v1.9H4.4Z" /><E d="M5.4 15.6h13.2" w={0.9} /><circle cx="12" cy="13.4" r="1.2" fill={ENGRAVE} fillOpacity={0.6} /></>);
export const Trophy = make('Trophy', (g) => <>
  <path fill={g} fillRule="evenodd" d="M6.6 2.5h10.8V4.6h3.2v2.6c0 2.7-2 4.8-4.6 5.1a5.2 5.2 0 0 1-2.7 2.7v3h3v3H7.7v-3h3v-3a5.2 5.2 0 0 1-2.7-2.7C5.4 12 3.4 9.9 3.4 7.2V4.6h3.2Z M5.5 6.6v.6c0 1.3.8 2.4 1.9 2.9-.4-1-.7-2.2-.8-3.5Z M18.5 6.6h-1.1c-.1 1.3-.4 2.5-.8 3.5 1.1-.5 1.9-1.6 1.9-2.9Z" />
  <E d="M9 5.4h6" w={0.9} />
</>);
export const Medal = make('Medal', (g) => <><path fill={g} d="M5.5 2h4.3l3.2 6.5H8.6Z M14.2 2h4.3l-3.4 6.5h-4.3Z" /><path fill={g} d={ring(12, 15, 6.8)} /><E d={`${ring(12, 15, 4.6)}`} w={0.9} /><path d="M12 12.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3Z" fill={ENGRAVE} fillOpacity={0.55} /></>);

export const Sword = make('Sword', (g) => <><path fill={g} d={SWORD} /><E d="M19.6 4.4 10.4 13.6" w={0.8} /></>);
export const Swords = make('Swords', (g) => <><path fill={g} d={SWORD} /><g transform="matrix(-1 0 0 1 24 0)"><path fill={g} d={SWORD} /></g></>);
export const Axe = make('Axe', (g) => <><path fill={g} d="M13.4 2.2c3.9.6 7.6 4.1 8.4 8.4-2.2-.9-4.3-.7-5.9.2L14.7 9.6 6.2 18.1a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5-1.2-1.2c.9-1.6 1.1-3.7.2-5.9Z" /><E d="M14.6 4.6c2.2.8 3.9 2.4 4.8 4.6" w={0.9} /></>);
export const Hammer = make('Hammer', (g) => <><path fill={g} d="M13.6 2.4 21.6 10.4 18.4 13.6 15.9 11.1 7 20a1.8 1.8 0 0 1-2.6-2.6l8.9-8.9-2.5-2.5Z" /><E d="M15.6 4.4 19.6 8.4" w={0.9} /></>);
export const Pickaxe = make('Pickaxe', (g) => <><path fill={g} d="M2.8 7.6C6.6 3.6 12.9 2.4 17.6 4.4l2 2c2 4.7.8 11-3.2 14.8 1-3.9.7-7.8-1.1-10.9L6.2 19.4a1.8 1.8 0 0 1-2.6-2.6l9.1-9.1C9.6 5.9 6.7 6.6 2.8 7.6Z" /></>);
export const Wand2 = make('Wand2', (g) => <><path fill={g} d="M2.8 18.6 14.2 7.2l2.6 2.6L5.4 21.2a1.8 1.8 0 0 1-2.6-2.6Z" /><path fill={g} d={`${SPARK(18.4, 5.4, 3.9)} ${SPARK(10.6, 3.8, 1.9)} ${SPARK(20.2, 13.4, 1.9)}`} /></>);
export const Crosshair = make('Crosshair', (g) => <>
  <path fill={g} fillRule="evenodd" d={`${ring(12, 12, 8.6)} ${ring(12, 12, 6.2)}`} />
  <path fill={g} d="M10.8 1h2.4v6.4h-2.4Z M10.8 16.6h2.4V23h-2.4Z M1 10.8h6.4v2.4H1Z M16.6 10.8H23v2.4h-6.4Z" />
  <path fill={g} d={ring(12, 12, 1.8)} />
</>);
export const Target = make('Target', (g) => <><path fill={g} fillRule="evenodd" d={`${ring(12, 12, 10)} ${ring(12, 12, 7.4)} ${ring(12, 12, 5)} ${ring(12, 12, 2.6)}`} /><path fill={g} d={ring(12, 12, 1.5)} /></>);
export const Skull = make('Skull', (g) => <path fill={g} fillRule="evenodd" d={`M12 1.8C6.8 1.8 3.3 5.5 3.3 10.2c0 2.7 1.2 4.7 3.1 5.9v3.1a1 1 0 0 0 1 1h1.4v-2.3h1.6v2.3h3.2v-2.3h1.6v2.3h1.4a1 1 0 0 0 1-1v-3.1c1.9-1.2 3.1-3.2 3.1-5.9C20.7 5.5 17.2 1.8 12 1.8Z ${ring(8.4, 11, 2.2)} ${ring(15.6, 11, 2.2)} M12 13.8l1.4 2.5h-2.8Z`} />);
export const Ghost = make('Ghost', (g) => <path fill={g} fillRule="evenodd" d={`M12 2a8 8 0 0 1 8 8v12l-2.7-2-2.6 2L12 20l-2.7 2-2.6-2L4 22V10a8 8 0 0 1 8-8Z ${ring(9, 10.2, 1.7)} ${ring(15, 10.2, 1.7)}`} />);

export const ScrollText = make('ScrollText', (g) => <><path fill={g} d="M7.2 2.6h11.6A2.6 2.6 0 0 1 21.4 5.2v1.9h-3.1v11.7a2.6 2.6 0 0 1-2.6 2.6H5.2a2.6 2.6 0 0 1-2.6-2.6v-1.9h3.1V5.2a2.6 2.6 0 0 1 1.5-2.6Z" /><E d="M9 7.8h6 M9 10.8h6 M9 13.8h4 M5.7 16.9h7.4" w={1.1} /></>);
export const BookOpen = make('BookOpen', (g) => <><path fill={g} d="M1.8 4.4c3.5-.9 7-.4 9.4 1.7v14.4c-2.4-1.7-5.9-2.1-9.4-1.4Z M22.2 4.4c-3.5-.9-7-.4-9.4 1.7v14.4c2.4-1.7 5.9-2.1 9.4-1.4Z" /><E d="M4.4 8.3c1.8-.2 3.4 0 4.7.6 M4.4 11.4c1.8-.2 3.4 0 4.7.6 M4.4 14.5c1.8-.2 3.4 0 4.7.6 M19.6 8.3c-1.8-.2-3.4 0-4.7.6 M19.6 11.4c-1.8-.2-3.4 0-4.7.6 M19.6 14.5c-1.8-.2-3.4 0-4.7.6" w={0.9} /></>);
export const User = make('User', (g) => <path fill={g} d={`${ring(12, 7, 4.6)} M3.2 21.5c0-4.6 3.9-7.8 8.8-7.8s8.8 3.2 8.8 7.8Z`} />);
export const UserRound = User;
export const Store = make('Store', (g) => <><path fill={g} d="M3.2 2.8h17.6L22 8a3 3 0 0 1-5 2.2 3 3 0 0 1-5 .2 3 3 0 0 1-5-.2A3 3 0 0 1 2 8Z M4 12.2a4.6 4.6 0 0 0 3-.6 4.6 4.6 0 0 0 5 .4 4.6 4.6 0 0 0 5-.4 4.6 4.6 0 0 0 3 .6v9H14v-5h-4v5H4Z" /><E d="M7.6 3.3 7 8 M12 3.3V8 M16.4 3.3 17 8" w={0.8} /></>);
export const Warehouse = make('Warehouse', (g) => <path fill={g} d="M12 1.8 22.2 7.4v13.8h-3V12H4.8v9.2h-3V7.4Z M6.4 13.6h11.2v1.8H6.4Z M6.4 16.6h11.2v1.8H6.4Z M6.4 19.6h11.2v1.6H6.4Z" />);
export const Home = make('Home', (g) => <path fill={g} d="M12 2.2 22.2 11h-2.9v10.2h-5.2v-6.6H9.9v6.6H4.7V11H1.8Z" />);
export const Castle = make('Castle', (g) => <path fill={g} d="M1.8 21.4V8.6h3v2.2h2V8.6h3v2.8h4.4V8.6h3v2.2h2V8.6h3v12.8h-7.8v-4.8a2.2 2.2 0 0 0-4.4 0v4.8Z M3.6 3.4h3.2v4H3.6Z M17.2 3.4h3.2v4h-3.2Z M10.4 2.6h3.2v5.6h-3.2Z" />);
export const Settings = make('Settings', (g) => <path fill={g} fillRule="evenodd" d={gearPath(8, 10.6, 8, 3.2)} />);
export const Cog = Settings;
export const Coins = make('Coins', (g) => <><path fill={g} d="M9 2.6c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3Z M2 8c1.4 1.3 4 2.1 7 2.1s5.6-.8 7-2.1v1.8c0 1.7-3.1 3-7 3s-7-1.3-7-3Z M2 12.2c1.4 1.3 4 2.1 7 2.1v2.8c-3.9 0-7-1.3-7-3Z" /><path fill={g} d={ring(16.2, 16.6, 6)} /><E d={ring(16.2, 16.6, 3.9)} w={0.9} /></>);
export const Clock = make('Clock', (g) => <><path fill={g} d={ring(12, 12, 10)} /><E d={ring(12, 12, 8)} w={0.8} /><E d="M12 6.6V12l3.6 2.4" w={2} /></>);
export const CalendarDays = make('CalendarDays', (g) => <><path fill={g} d={CAL} /><E d="M3.6 9h16.8" w={1.1} /><path fill={ENGRAVE} fillOpacity={0.55} d="M6.5 11.5h2.6v2.4H6.5Z M10.7 11.5h2.6v2.4h-2.6Z M14.9 11.5h2.6v2.4h-2.6Z M6.5 15.6h2.6V18H6.5Z M10.7 15.6h2.6V18h-2.6Z" /></>);
export const Zap = make('Zap', (g) => <path fill={g} d="M13.6 1.2 3.6 13.8h6.8L8.8 22.8l10.6-13.2h-6.8Z" />);
export const Waves = make('Waves', (g) => <><path fill={g} d={WAVE} /><path fill={g} d={WAVE} transform="translate(0 6)" /><path fill={g} d={WAVE} transform="translate(0 12)" /></>);
export const Snowflake = make('Snowflake', (g) => <g fill={g}>
  {[0, 60, 120].map((a) => <rect key={a} x="10.8" y="1.6" width="2.4" height="20.8" rx="1.2" transform={`rotate(${a} 12 12)`} />)}
  {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d="M12 6.2 9.4 3.6l1.3-1.3L12 3.6l1.3-1.3 1.3 1.3Z" transform={`rotate(${a} 12 12)`} />)}
</g>);
export const Wind = make('Wind', (g) => <path fill={g} d="M2 7.2h10.6a2 2 0 1 0-2-2H8a4.6 4.6 0 1 1 4.6 4.6H2Z M2 11.2h15.4a4.6 4.6 0 1 1-4.6 4.6h2.6a2 2 0 1 0 2-2H2Z M2 15.4h7.4v2.6H2Z" />);
export const Tornado = make('Tornado', (g) => <path fill={g} d="M2.5 3h19a1.3 1.3 0 0 1 0 2.6h-19a1.3 1.3 0 0 1 0-2.6Z M5 7.4h14a1.3 1.3 0 0 1 0 2.6H5a1.3 1.3 0 0 1 0-2.6Z M8 11.8h10a1.3 1.3 0 0 1 0 2.6H8a1.3 1.3 0 0 1 0-2.6Z M9.5 16.2h6a1.3 1.3 0 0 1 0 2.6h-6a1.3 1.3 0 0 1 0-2.6Z M11.5 20.4h2.6a1.3 1.3 0 0 1 0 2.6h-2.6a1.3 1.3 0 0 1 0-2.6Z" />);
export const Megaphone = make('Megaphone', (g) => <path fill={g} d="M2.8 8.6h3.6L17 3.2v17.6L6.4 15.4H2.8a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1Z M6.6 16.6l1.6 5h3l-1.5-4.4Z M18.6 9h2.8v6h-2.8Z" />);
export const Maximize = make('Maximize', (g) => <path fill={g} d="M2.5 2.5h7.5v3.2H5.7v4.3H2.5Z M14 2.5h7.5V10h-3.2V5.7H14Z M2.5 14h3.2v4.3H10v3.2H2.5Z M18.3 14h3.2v7.5H14v-3.2h4.3Z" />);
export const Fish = make('Fish', (g) => <path fill={g} fillRule="evenodd" d={`M1.6 12c3-4.6 7.1-6.7 11.2-6.7 3.5 0 6.1 2 7.6 3.6l2.8-2.6v11.4l-2.8-2.6c-1.5 1.6-4.1 3.6-7.6 3.6-4.1 0-8.2-2.1-11.2-6.7Z ${ring(6.8, 11.2, 1.3)}`} />);
export const Backpack = make('Backpack', (g) => <><path fill={g} d="M9 2h6v2.3A6 6 0 0 1 20 10.2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9.8A6 6 0 0 1 9 4.3Z" /><E d="M7 11h10 M8.2 14.2h7.6v4.6H8.2Z M11 3.6h2" w={1} /></>);
export const ShoppingBag = make('ShoppingBag', (g) => <><path fill={g} d="M4.8 7h14.4l1.2 13.4a1.5 1.5 0 0 1-1.5 1.6H5.1a1.5 1.5 0 0 1-1.5-1.6Z M8.2 7.6V6a3.8 3.8 0 0 1 7.6 0v1.6h-2.2V6a1.6 1.6 0 0 0-3.2 0v1.6Z" /><E d="M8.6 10.8a3.4 3.4 0 0 0 6.8 0" w={1} /></>);
export const ArrowUpCircle = make('ArrowUpCircle', (g) => <><path fill={g} d={ring(12, 12, 10)} /><E d="M12 17V7.6 M7.9 11.6 12 7.5l4.1 4.1" w={2.2} /></>);
export const Info = make('Info', (g) => <><path fill={g} d={ring(12, 12, 10)} /><E d="M12 11v6" w={2.4} /><circle cx="12" cy="7.4" r="1.5" fill={ENGRAVE} fillOpacity={0.6} /></>);
export const AlertTriangle = make('AlertTriangle', (g) => <><path fill={g} d="M10.4 2.9a1.8 1.8 0 0 1 3.2 0l9 16.4a1.8 1.8 0 0 1-1.6 2.7H3a1.8 1.8 0 0 1-1.6-2.7Z" /><E d="M12 8.6v5.4" w={2.4} /><circle cx="12" cy="17.4" r="1.4" fill={ENGRAVE} fillOpacity={0.6} /></>);
export const VolumeX = make('VolumeX', (g) => <path fill={g} d={`${SPEAKER} M15.2 9.2l1.5-1.5 2.6 2.6 2.6-2.6 1.5 1.5-2.6 2.6 2.6 2.6-1.5 1.5-2.6-2.6-2.6 2.6-1.5-1.5 2.6-2.6Z`} />);
export const Volume2 = make('Volume2', (g) => <path fill={g} d={`${SPEAKER} M15.3 8.3a5.2 5.2 0 0 1 0 7.4l-1.7-1.7a2.8 2.8 0 0 0 0-4Z M18.3 5.3a9.4 9.4 0 0 1 0 13.4l-1.7-1.7a7 7 0 0 0 0-10Z`} />);
export const Sun = make('Sun', (g) => <g fill={g}><path d={ring(12, 12, 4.8)} />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="10.9" y="1.2" width="2.2" height="4.4" rx="1.1" transform={`rotate(${a} 12 12)`} />)}</g>);
export const RotateCcw = make('RotateCcw', (g) => <><B g={g} d="M5.4 12.6A6.8 6.8 0 1 0 8 6.6" w={3} /><path fill={g} d="M2.6 3.6 10.8 4.6 4.4 10.4Z" /></>);
export const RefreshCcw = make('RefreshCcw', (g) => <><B g={g} d="M19.4 10A7.6 7.6 0 0 0 6 7.2 M4.6 14A7.6 7.6 0 0 0 18 16.8" w={2.8} /><path fill={g} d="M2.6 3.4 9.4 7.8 2.6 11Z M21.4 20.6 14.6 16.2 21.4 13Z" /></>);
export const Repeat = make('Repeat', (g) => <><B g={g} d="M4 11.4V9.6a3 3 0 0 1 3-3h10 M20 12.6v1.8a3 3 0 0 1-3 3H7" w={2.8} /><path fill={g} d="M15.6 2.6 21 6.6l-5.4 4Z M8.4 13.4 3 17.4l5.4 4Z" /></>);
export const Recycle = RefreshCcw;
export const Play = make('Play', (g) => <path fill={g} d="M6 2.8a1 1 0 0 1 1.5-.9l13.2 9.2a1 1 0 0 1 0 1.8L7.5 22.1A1 1 0 0 1 6 21.2Z" />);
export const Pause = make('Pause', (g) => <path fill={g} d="M5.5 3h4.2v18H5.5Z M14.3 3h4.2v18h-4.2Z" />);
export const PawPrint = make('PawPrint', (g) => <path fill={g} d={`M12 12.2c3 0 6 3.2 6 6.2 0 2-1.6 3-3.2 3-1.2 0-1.8-.6-2.8-.6s-1.6.6-2.8.6C7.6 21.4 6 20.4 6 18.4c0-3 3-6.2 6-6.2Z ${ring(8.8, 6.2, 2.2)} ${ring(15.2, 6.2, 2.2)} ${ring(4.4, 10.6, 2)} ${ring(19.6, 10.6, 2)}`} />);
export const Orbit = make('Orbit', (g) => <><path fill={g} d={ring(12, 12, 3.6)} /><ellipse cx="12" cy="12" rx="9.6" ry="4.6" fill="none" stroke={g} strokeWidth="2.2" transform="rotate(-25 12 12)" /><path fill={g} d={ring(20, 8.4, 2)} /></>);
export const Navigation = make('Navigation', (g) => <path fill={g} d="M21.5 2.5 13.8 21.5l-2.6-8.7-8.7-2.6Z" />);
export const Mountain = make('Mountain', (g) => <><path fill={g} d="M1.5 20.5 8.8 6.6l3.6 5.6 2.6-3.6 7.5 11.9Z" /><E d="M6.8 10.4 8.8 9.6l1.6 1.2" w={1} /></>);
export const Monitor = make('Monitor', (g) => <><path fill={g} d="M3.4 3h17.2A1.4 1.4 0 0 1 22 4.4v11.2a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 15.6V4.4A1.4 1.4 0 0 1 3.4 3Z M10.4 17h3.2v2.6h3v1.9H7.4v-1.9h3Z" /><E d="M4.6 5.6h14.8v8.8H4.6Z" w={0.9} /></>);
export const MapPin = make('MapPin', (g) => <path fill={g} fillRule="evenodd" d={`M12 1.8a7.6 7.6 0 0 1 7.6 7.6c0 5.2-7.6 12.8-7.6 12.8S4.4 14.6 4.4 9.4A7.6 7.6 0 0 1 12 1.8Z ${ring(12, 9.4, 3)}`} />);
export const Magnet = make('Magnet', (g) => <><path fill={g} d="M3.6 2.6h5.6v8.6a2.8 2.8 0 0 0 5.6 0V2.6h5.6v8.6a8.4 8.4 0 0 1-16.8 0Z" /><E d="M3.8 6.4h5.2 M15 6.4h5.2" w={1.1} /></>);
export const LayoutGrid = make('LayoutGrid', (g) => <path fill={g} d="M3 3h7.6v7.6H3Z M13.4 3H21v7.6h-7.6Z M3 13.4h7.6V21H3Z M13.4 13.4H21V21h-7.6Z" />);
export const Layers = make('Layers', (g) => <path fill={g} d="M12 1.8 22.4 7.2 12 12.6 1.6 7.2Z M4.4 11.2 12 15.2l7.6-4 2.8 1.5L12 18.1 1.6 12.7Z M4.4 16.6 12 20.6l7.6-4 2.8 1.5L12 23.5 1.6 18.1Z" />);
export const Gamepad2 = make('Gamepad2', (g) => <><path fill={g} d="M7 5.6h10a5.2 5.2 0 0 1 5.1 6.2l-1 5.2a2.7 2.7 0 0 1-4.8 1.1L14.6 16H9.4l-1.7 2.1a2.7 2.7 0 0 1-4.8-1.1l-1-5.2A5.2 5.2 0 0 1 7 5.6Z" /><E d="M7.8 9v4 M5.8 11h4" w={1.6} /><circle cx="15.6" cy="10" r="1.2" fill={ENGRAVE} fillOpacity={0.6} /><circle cx="17.8" cy="12.4" r="1.2" fill={ENGRAVE} fillOpacity={0.6} /></>);
export const Flag = make('Flag', (g) => <path fill={g} d="M3.6 1.8h2.6v20.4H3.6Z M7.4 3.4c3.1-1.6 5.6 1.6 8.7 0 1.5-.7 3.1-.5 4.6 0v9.4c-1.5-.5-3.1-.7-4.6 0-3.1 1.6-5.6-1.6-8.7 0Z" />);
export const EyeOff = make('EyeOff', (g) => <><path fill={g} fillRule="evenodd" d={`M12 4.8c5.1 0 8.8 3.7 10.2 7.2-1.4 3.5-5.1 7.2-10.2 7.2S3.2 15.5 1.8 12C3.2 8.5 6.9 4.8 12 4.8Z ${ring(12, 12, 3.6)}`} /><E d="M4 3.4 20 20.6" w={2.4} /></>);
export const Droplet = make('Droplet', (g) => <><path fill={g} d={DROP} /><E d="M9 13.6a3.2 3.2 0 0 0 2.2 3.2" w={1.1} /></>);
export const Droplets = make('Droplets', (g) => <><path fill={g} d={DROP} transform="translate(-3.4 1.8) scale(.82)" /><path fill={g} d={DROP} transform="translate(9.6 -0.6) scale(.6)" /></>);
export const Dices = make('Dices', (g) => <>
  <rect x="2" y="7.2" width="12.4" height="12.4" rx="2" fill={g} transform="rotate(-12 8.2 13.4)" />
  <rect x="12" y="2.4" width="9.6" height="9.6" rx="1.8" fill={g} transform="rotate(14 16.8 7.2)" />
  <g fill={ENGRAVE} fillOpacity={0.6}><circle cx="5.6" cy="11" r="1.1" /><circle cx="8.3" cy="13.6" r="1.1" /><circle cx="11" cy="16.2" r="1.1" /><circle cx="16.8" cy="7.2" r="1.1" /></g>
</>);
export const CloudLightning = make('CloudLightning', (g) => <path fill={g} d="M6.8 16.6a4.9 4.9 0 0 1-.6-9.8A6.6 6.6 0 0 1 18.6 8.2a4.2 4.2 0 0 1-.4 8.4h-2.4l1.6-3H12l-1.8 3Z M11.6 13h4.6l-2 3.6h3l-6.2 6.6 1.4-4.6H9.4Z" />);
export const Bug = make('Bug', (g) => <><path fill={g} d="M12 5.4c3 0 5.4 2.6 5.4 6.6v3.2c0 3.6-2.4 6.4-5.4 6.4s-5.4-2.8-5.4-6.4V12c0-4 2.4-6.6 5.4-6.6Z M8.6 4.6a3.4 3.4 0 0 1 6.8 0Z" /><E d="M12 9v12 M2.8 9.6l3.6 1.6 M21.2 9.6l-3.6 1.6 M2.4 14.4h4 M21.6 14.4h-4 M3 19.6l3.8-1.8 M21 19.6l-3.8-1.8" w={1.6} /></>);
export const Anchor = make('Anchor', (g) => <><B g={g} d="M12 7.4v14 M4.6 13a7.4 7.4 0 0 0 14.8 0 M8.2 10.6h7.6" w={2.6} /><path fill={g} fillRule="evenodd" d={`${ring(12, 4.6, 2.9)} ${ring(12, 4.6, 1.3)}`} /><path fill={g} d="M1.8 13.6 4.6 10l2.8 3.6Z M16.6 13.6 19.4 10l2.8 3.6Z" /></>);
export const Activity = make('Activity', (g) => <B g={g} d="M2 12h4.2l3-8.4 5.6 16.8 3-8.4H22" w={2.8} />);
export const FlaskConical = make('FlaskConical', (g) => <><path fill={g} d="M8.6 1.8h6.8v2.4h-1.2v4.6l6.4 10.6a1.9 1.9 0 0 1-1.6 2.8H5a1.9 1.9 0 0 1-1.6-2.8l6.4-10.6V4.2H8.6Z" /><E d="M6.8 15h10.4" w={1.1} /><circle cx="10.6" cy="18" r="1" fill={ENGRAVE} fillOpacity={0.5} /><circle cx="13.8" cy="17.2" r=".7" fill={ENGRAVE} fillOpacity={0.5} /></>);
export const Package = make('Package', (g) => <><path fill={g} d="M12 1.8 21.4 6.5v11L12 22.2 2.6 17.5v-11Z" /><E d="M2.9 6.6 12 11.2l9.1-4.6 M12 11.2v10.6 M7.2 4.1l9.3 4.8" w={1} /></>);
