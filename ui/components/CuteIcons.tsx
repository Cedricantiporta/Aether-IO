// Cutesy Switch / Zelda style icon set: soft, chunky, rounded filled shapes in cream (#fff7e8) with at most one tiny accent
// colour each. Sized by `size` (default 28); the soft drop shadow comes from the `.cute-ic` CSS class. Reusable anywhere.
import React from 'react';

export const CUTE_CREAM = '#fff7e8';
const C = CUTE_CREAM;
const SH = '#00000026';   // faint inner shade for depth
type P = { size?: number };
const Svg: React.FC<P & { children: React.ReactNode }> = ({ size = 28, children }) => (
  <svg className="cute-ic" width={size} height={size} viewBox="0 0 32 32" aria-hidden strokeLinejoin="round" strokeLinecap="round">{children}</svg>
);

/** Friendly hero bust: round head, little tuft of hair, rosy cheeks. */
export const CuteHero: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M5 29c0-6.2 4.7-10 11-10s11 3.8 11 10c0 1-.8 1.6-1.7 1.6H6.7C5.8 30.6 5 30 5 29z" fill={C} />
    <circle cx="16" cy="12" r="8.2" fill={C} />
    <path d="M8.2 10.5c.8-4.2 4-6.4 7.8-6.4 4 0 7 2.4 7.8 6.4-2.6-.4-4.6-1.8-5.4-3.4-1.6 2.2-5.4 3.4-10.2 3.4z" fill="#ffd9a0" />
    <circle cx="12.6" cy="13" r="1.3" fill="#4a4048" /><circle cx="19.4" cy="13" r="1.3" fill="#4a4048" />
    <circle cx="10.6" cy="15.6" r="1.5" fill="#ff9aa6" opacity=".8" /><circle cx="21.4" cy="15.6" r="1.5" fill="#ff9aa6" opacity=".8" />
  </Svg>
);

/** Round satchel with a strap and a clasp. */
export const CuteBag: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M11 10V8.5a5 5 0 0 1 10 0V10" fill="none" stroke={C} strokeWidth="3" />
    <path d="M16 8.6c7.4 0 11.4 5.2 11.4 11 0 5.4-3.8 9.4-11.4 9.4S4.6 25 4.6 19.6c0-5.8 4-11 11.4-11z" fill={C} />
    <path d="M5.2 17.5c3.4 2.2 7.2 3 10.8 3s7.4-.8 10.8-3c-.9-5-5-8.9-10.8-8.9S6.1 12.5 5.2 17.500z" fill={SH} />
    <circle cx="16" cy="20" r="2.6" fill="#ffc85c" />
  </Svg>
);

/** Sparkle star with a smaller twinkle. */
export const CuteStar: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M14 3.5c.9 5.6 2.9 8.6 8.5 9.5-5.6.9-7.6 3.9-8.5 9.5-.9-5.6-2.9-8.6-8.5-9.500C11.1 12.1 13.1 9.1 14 3.500z" fill={C} />
    <path d="M24.5 18c.5 3 1.5 4.1 4.5 4.6-3 .5-4 1.6-4.5 4.6-.5-3-1.5-4.1-4.5-4.6 3-.5 4-1.6 4.5-4.600z" fill="#ffd45e" />
  </Svg>
);

/** Rolled scroll with a check mark. */
export const CuteScroll: React.FC<P> = (p) => (
  <Svg {...p}>
    <rect x="7" y="4" width="18" height="24" rx="4.5" fill={C} />
    <rect x="4" y="2.5" width="24" height="6" rx="3" fill={C} /><rect x="4" y="2.5" width="24" height="6" rx="3" fill={SH} />
    <rect x="4" y="23.5" width="24" height="6" rx="3" fill={C} /><rect x="4" y="23.5" width="24" height="6" rx="3" fill={SH} />
    <path d="M11.5 16.200l3.4 3.4 6-6.6" fill="none" stroke="#5fcf8a" strokeWidth="3" />
  </Svg>
);

/** Folded map with a little pin. */
export const CuteMapPin: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M3.5 9.500c0-1 .8-1.8 1.8-1.500L11 9.700l10-2.7 5.7 1.600c.8.2 1.3.9 1.3 1.700v13.600c0 1.1-1.1 1.9-2.2 1.500L21 23.800l-10 2.7-5.7-1.700c-.9-.3-1.8-1.1-1.8-2z" fill={C} />
    <path d="M11 9.700v16.800M21 7v16.8" stroke={SH} strokeWidth="2" fill="none" />
    <path d="M16 6.500c-3 0-5 2.1-5 4.8 0 3.2 5 8.2 5 8.200s5-5 5-8.200c0-2.7-2-4.8-5-4.800z" fill="#ff7b86" />
    <circle cx="16" cy="11.3" r="1.8" fill={C} />
  </Svg>
);

/** Market stall with a scalloped striped awning. */
export const CuteShop: React.FC<P> = (p) => (
  <Svg {...p}>
    <rect x="6" y="14" width="20" height="14" rx="3" fill={C} />
    <rect x="12.5" y="18.5" width="7" height="9.5" rx="2" fill={SH} />
    <path d="M4.5 13.500L7 5.500c.3-1 1.1-1.5 2-1.500h14c.9 0 1.7.5 2 1.500l2.5 8c.2.8-.4 1.5-1.2 1.5-.9 0-1.4-.6-1.8-1.3-.4.8-1.1 1.3-2 1.300s-1.6-.5-2-1.300c-.4.8-1.1 1.3-2 1.300s-1.6-.5-2-1.300c-.4.8-1.1 1.3-2 1.300s-1.6-.5-2-1.300c-.4.8-1.1 1.3-2 1.300s-1.5-.6-1.9-1.300c-.4.7-.9 1.3-1.8 1.3-.8 0-1.4-.7-1.2-1.500z" fill={C} />
    <path d="M11 4h3l-1 10.500h-3zM18 4h3l1.5 10.500h-3z" fill="#ff8f8f" />
  </Svg>
);

/** Rounded cog with a soft hub. */
export const CuteGear: React.FC<P> = (p) => (
  <Svg {...p}>
    {[0, 45, 90, 135].map((a) => <rect key={a} x="12.5" y="2.5" width="7" height="27" rx="3.5" fill={C} transform={`rotate(${a} 16 16)`} />)}
    <circle cx="16" cy="16" r="9.5" fill={C} />
    <circle cx="16" cy="16" r="4.2" fill="#6fd6e8" />
  </Svg>
);

/** Trophy cup (Achievements). */
export const CuteTrophy: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M8 6.500H4.500c0 5 1.8 7.5 5 8M24 6.500h3.500c0 5-1.8 7.5-5 8" fill="none" stroke={C} strokeWidth="2.6" />
    <path d="M8 3.500h16v8a8 8 0 0 1-16 0z" fill={C} />
    <rect x="13.5" y="18" width="5" height="5" fill={C} /><rect x="9" y="23" width="14" height="5.5" rx="2.8" fill={C} />
    <path d="M16 7l1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2-2 2.8-.4z" fill="#ffd45e" />
  </Svg>
);

/** Open book (Codex). */
export const CuteBook: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M16 8c-2.5-2.2-6-3-10.5-2.500C4.5 5.6 4 6.2 4 7v16.500c0 .8.7 1.4 1.5 1.300C10 24.3 13.5 25 16 27.500c2.5-2.5 6-3.2 10.5-2.7.8.1 1.5-.5 1.5-1.300V7c0-.8-.5-1.4-1.5-1.500C22 5 18.5 5.8 16 8z" fill={C} />
    <path d="M16 8v19.5" stroke={SH} strokeWidth="2" />
    <path d="M7.5 10.500c2-.2 3.8.1 5.5.9M7.5 15c2-.2 3.8.1 5.5.9" stroke="#6fd6e8" strokeWidth="1.8" fill="none" />
  </Svg>
);

/** Stacked cards (Run Upgrades). */
export const CuteLayers: React.FC<P> = (p) => (
  <Svg {...p}>
    <path d="M16 3.500l12 6.200c.9.5.9 1.7 0 2.200L16 18.1 4 11.900c-.9-.5-.9-1.7 0-2.200z" fill={C} />
    <path d="M5 16.500l11 5.6 11-5.6" fill="none" stroke={C} strokeWidth="3.2" />
    <path d="M5 22l11 5.600L27 22" fill="none" stroke="#6fd6e8" strokeWidth="3.2" />
  </Svg>
);
