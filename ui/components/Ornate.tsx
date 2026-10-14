import React from 'react';

/** Ornate dark-metal ring with spikes/flanges. SVG overlay sized 100% of its (square) parent; ring hole radius ~ 37% of the parent. */
export const OrnateRing: React.FC<{ id: string; spikes?: number; gold?: boolean }> = React.memo(({ id, spikes = 8, gold = true }) => {
  const sp: React.ReactNode[] = [];
  for (let i = 0; i < spikes; i++) {
    const a = (360 / spikes) * i + 360 / spikes / 2;
    const big = i % 2 === 0;
    sp.push(
      <g key={i} transform={`rotate(${a} 100 100)`}>
        <path d={big ? 'M100 2 L109 22 L100 30 L91 22Z' : 'M100 10 L106 24 L100 30 L94 24Z'} fill={`url(#${id}-m)`} stroke="#050304" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={big ? 'M100 6 L100 26' : 'M100 14 L100 26'} stroke="#8a8f9c" strokeOpacity=".6" strokeWidth="1" />
      </g>,
    );
  }
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6a707e" /><stop offset=".45" stopColor="#2c2f38" /><stop offset="1" stopColor="#0f1014" /></linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0b0" /><stop offset=".5" stopColor="#c8962e" /><stop offset="1" stopColor="#6a410c" /></linearGradient>
      </defs>
      {sp}
      <circle cx="100" cy="100" r="76" fill="none" stroke="#050304" strokeWidth="24" />
      <circle cx="100" cy="100" r="76" fill="none" stroke={`url(#${id}-m)`} strokeWidth="20" />
      <circle cx="100" cy="100" r="82.5" fill="none" stroke="#8a8f9c" strokeOpacity=".45" strokeWidth="1.2" />
      {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={100 + 76 * Math.cos((i * Math.PI) / 8)} cy={100 + 76 * Math.sin((i * Math.PI) / 8)} r="1.7" fill="#9aa0ae" />)}
      <circle cx="100" cy="100" r="66" fill="none" stroke="#050304" strokeWidth="3" />
      <circle cx="100" cy="100" r="64.2" fill="none" stroke={gold ? `url(#${id}-g)` : '#555'} strokeWidth="2.4" />
    </svg>
  );
});
