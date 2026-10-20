// Flat, minimal Switch / Zelda-menu style glyphs: solid white (#ffffff), simple geometric shapes, no background, no outline.
// Sized by `size` (default 28); the soft drop shadow for readability comes from the `.cute-ic` CSS class. Reusable anywhere.
import React from 'react';

export const CUTE_CREAM = '#ffffff';   // (name kept for older imports; the glyphs are plain white now)
const W = CUTE_CREAM;
type P = { size?: number };
const Svg: React.FC<P & { children: React.ReactNode }> = ({ size = 28, children }) => (
  <svg className="cute-ic" width={size} height={size} viewBox="0 0 32 32" fill={W} aria-hidden strokeLinejoin="round" strokeLinecap="round">{children}</svg>
);

/** Person silhouette: round head + shoulders. */
export const CuteHero: React.FC<P> = (p) => (
  <Svg {...p}>
    <circle cx="16" cy="9.5" r="5.8" />
    <path d="M4.8 28.2c0-6.6 4.9-10.4 11.2-10.4s11.2 3.8 11.2 10.4c0 .9-.7 1.6-1.6 1.6H6.4c-.9 0-1.6-.7-1.6-1.6z" />
  </Svg>
);

/** Backpack: rounded body, top handle, front pocket cut-out. */
export const CuteBag: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M12.6 8.6V7.4a3.4 3.4 0 0 1 6.8 0v1.2" fill="none" stroke={W} strokeWidth="2.2" />
    <path fillRule="evenodd" d="M16 7.8c5.4 0 9.2 3.6 9.2 8.6v8.6a4.4 4.4 0 0 1-4.4 4.4H11.2a4.4 4.4 0 0 1-4.4-4.4v-8.6c0-5 3.8-8.6 9.2-8.6zM11.4 19.6h9.2v4.6a1.6 1.6 0 0 1-1.6 1.6h-6a1.6 1.6 0 0 1-1.6-1.6z" />
  </Svg>
);

/** Plain five-point star (rounded corners). */
export const CuteStar: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M16 3.8l3.5 7.2 7.9 1.1-5.7 5.5 1.4 7.9L16 21.8l-7.1 3.7 1.4-7.9-5.7-5.5 7.9-1.1z" stroke={W} strokeWidth="1.8" />
  </Svg>
);

/** Scroll / paper with text bars. */
export const CuteScroll: React.FC<P> = (p) => (
  <Svg {...p}>
    <path fillRule="evenodd" d="M9.2 3.6h13.6a3 3 0 0 1 3 3v18.8a3 3 0 0 1-3 3H9.2a3 3 0 0 1-3-3V6.6a3 3 0 0 1 3-3zM11.4 9.6h9.2v2.4h-9.2zM11.4 15h9.2v2.4h-9.2zM11.4 20.4h5.4v2.4h-5.4z" />
  </Svg>
);

/** Map pin. */
export const CuteMapPin: React.FC<P> = (p) => (
  <Svg {...p}>
    <path fillRule="evenodd" d="M16 2.8a9.4 9.4 0 0 0-9.4 9.4c0 6.9 9.4 17 9.4 17s9.4-10.100 9.4-17A9.4 9.4 0 0 0 16 2.8zM16 8.4a3.8 3.8 0 1 1 0 7.600 3.8 3.8 0 0 1 0-7.600z" />
  </Svg>
);

/** Shop: scalloped awning over a little storefront with a door. */
export const CuteShop: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M3.5 12.2L6 5.2h20l2.500 7a3.125 3.125 0 0 1-6.250 0 3.125 3.125 0 0 1-6.250 0 3.125 3.125 0 0 1-6.250 0 3.125 3.125 0 0 1-6.250 0z" />
    <path fillRule="evenodd" d="M6.500 16.400h19v9.100a2.500 2.500 0 0 1-2.500 2.500H9a2.500 2.500 0 0 1-2.500-2.500zM13 28v-5.500a1.500 1.500 0 0 1 1.500-1.500h3a1.500 1.500 0 0 1 1.500 1.500V28z" />
  </Svg>
);

/** Menu: hamburger (three rounded bars). Keeps the old "Gear" export name. */
export const CuteGear: React.FC<P> = (p) => (
  <Svg {...p}>
    <rect x="5" y="6.400" width="22" height="3.800" rx="1.900" /><rect x="5" y="14.100" width="22" height="3.800" rx="1.900" /><rect x="5" y="21.800" width="22" height="3.800" rx="1.900" />
  </Svg>
);

/** Trophy cup. */
export const CuteTrophy: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M9 4.400h14v7.200a7 7 0 0 1-14 0z" />
    <path d="M9 7H5.600v2.200A4.400 4.400 0 0 0 9.600 13.600M23 7h3.400v2.200a4.400 4.400 0 0 1-4 4.400" fill="none" stroke={W} strokeWidth="2.200" />
    <rect x="14.600" y="17.600" width="2.800" height="5" /><rect x="10" y="22.600" width="12" height="4.200" rx="2.100" />
  </Svg>
);

/** Closed book with a title bar. */
export const CuteBook: React.FC<P> = (p) => (
  <Svg {...p}>
    <path fillRule="evenodd" d="M10 3.800h12.500a2.500 2.500 0 0 1 2.500 2.500v19.400a2.500 2.500 0 0 1-2.500 2.500H10a3.500 3.500 0 0 1-3.500-3.500V7.300A3.500 3.500 0 0 1 10 3.800zM11.200 9.200h9.600v2.600h-9.600z" />
  </Svg>
);

/** Stacked layers. */
export const CuteLayers: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M16 4l12 6-12 6-12-6z" />
    <path d="M4.600 16l11.400 5.700L27.400 16M4.600 21.800L16 27.500l11.400-5.700" fill="none" stroke={W} strokeWidth="2.600" />
  </Svg>
);
