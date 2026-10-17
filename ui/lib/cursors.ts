// Custom mouse cursors (owner): a stone arrow with a gold gem (default), a white glove pointing hand (anything
// clickable: buttons, tabs, item slots, town buildings), a sword (hovering an enemy in a run: render/CameraRig sets
// body[data-cur="attack"]), a blue-gem arrow (dragging items) and a grey arrow (disabled). index.css uses the
// --cur-* variables with the plain keyword as fallback, so the computed cursor still ends in 'pointer' etc.

const OUT = '#2a1a16';

const arrow = (g0: string, g1: string, glow: string): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a88e84"/><stop offset=".55" stop-color="#7d655d"/><stop offset="1" stop-color="#57433e"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g0}"/><stop offset="1" stop-color="${g1}"/></linearGradient>
<radialGradient id="h" cx=".45" cy=".6" r=".6"><stop offset="0" stop-color="${glow}" stop-opacity=".9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
</defs>
<path d="M3.5 2 L27 20.5 L14 30 L4 27 Z" fill="url(#s)" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
<path d="M5.5 6 L5.6 25.6 L13.6 28" fill="none" stroke="#c9b2a6" stroke-width=".8" opacity=".55"/>
<path d="M8 10.5 Q14 13 21 19.5 M7 16 Q11 19 16 24" fill="none" stroke="#d8c3b6" stroke-width=".55" opacity=".45"/>
<circle cx="12" cy="19" r="8" fill="url(#h)"/>
<path d="M8.2 11.8 L18 19.6 L13.4 24.8 L8.3 23.4 Z" fill="url(#g)" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M9.4 14 L12.6 19.4 L9.5 22.3 Z" fill="#ffffff" opacity=".45"/>
</svg>`;

const hand = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs>
<linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dde2"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f5"/><stop offset="1" stop-color="#8d939c"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#b9821e"/></linearGradient>
</defs>
<g transform="rotate(-15 16 16)">
<g stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round" fill="${OUT}">
<rect x="9.2" y="1.2" width="5.6" height="15" rx="2.8"/>
<rect x="9" y="11.5" width="15.5" height="12.5" rx="4.5"/>
<circle cx="16.6" cy="12.9" r="2.6"/><circle cx="20" cy="13.4" r="2.5"/><circle cx="22.6" cy="15.3" r="2.2"/>
<ellipse cx="9.4" cy="18.6" rx="2.6" ry="4"/>
<rect x="10" y="22.5" width="13.5" height="6.5" rx="1.6"/>
</g>
<g fill="url(#w)">
<rect x="9.2" y="1.2" width="5.6" height="15" rx="2.8"/>
<rect x="9" y="11.5" width="15.5" height="12.5" rx="4.5"/>
<circle cx="16.6" cy="12.9" r="2.6"/><circle cx="20" cy="13.4" r="2.5"/><circle cx="22.6" cy="15.3" r="2.2"/>
<ellipse cx="9.4" cy="18.6" rx="2.6" ry="4"/>
</g>
<path d="M14.8 11.6 L14.8 15.2 M18.3 12.2 L18.3 15.4 M21.4 13.6 L21.4 16.2" stroke="#a7adb5" stroke-width=".8" stroke-linecap="round"/>
<path d="M10.8 3 L10.8 10" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>
<rect x="10" y="22.5" width="13.5" height="6.5" rx="1.6" fill="url(#gd)"/>
<rect x="11.4" y="23.8" width="10.7" height="3.9" rx=".8" fill="url(#c)"/>
</g>
</svg>`;

const sword = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfd6de"/><stop offset="1" stop-color="#7e8894"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#a8701a"/></linearGradient>
<radialGradient id="r" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff9a8a"/><stop offset="1" stop-color="#b3141a"/></radialGradient>
</defs>
<path d="M2 2 L8.5 3.6 L21.4 16.5 L16.5 21.4 L3.6 8.5 Z" fill="url(#b)" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M3.4 3.4 L18.6 18.6" stroke="#ffffff" stroke-width=".9" opacity=".8"/>
<path d="M14.2 23.6 L23.6 14.2 L25.6 16.2 L16.2 25.6 Z" fill="url(#gd)" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M19.6 21.2 L21.2 19.6 L26.4 24.8 L24.8 26.4 Z" fill="#5a3320" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
<circle cx="27.2" cy="27.2" r="3" fill="url(#r)" stroke="${OUT}" stroke-width="1.5"/>
</svg>`;

const url = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, ''))}")`;

export function installCursors(): void {
  if (document.getElementById('aether-cursors')) return;
  const A = url(arrow('#fff2a8', '#f0a21c', '#ffc23a')), B = url(arrow('#bff0ff', '#2a9ee8', '#4ec4ff')), N = url(arrow('#8a7c78', '#4d4240', '#000000'));
  const st = document.createElement('style');
  st.id = 'aether-cursors';
  st.textContent = `
:root { --cur-arrow: ${A} 3 2, default; --cur-hand: ${url(hand)} 8 3, pointer; --cur-attack: ${url(sword)} 2 2, crosshair;
  --cur-grab: ${B} 3 2, grab; --cur-grabbing: ${B} 3 2, grabbing; --cur-no: ${N} 3 2, not-allowed; }
html, body { cursor: var(--cur-arrow); }
a[href], button, select, summary, label, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], input[type="range"] { cursor: var(--cur-hand); }
.cursor-pointer { cursor: var(--cur-hand) !important; }
[style*="cursor: pointer"] { cursor: var(--cur-hand) !important; }
[style*="cursor: default"] { cursor: var(--cur-arrow) !important; }
button:disabled, button[disabled], .cursor-not-allowed { cursor: var(--cur-no) !important; }
body[data-cur="attack"] canvas { cursor: var(--cur-attack); }
body[data-cur="hand"] canvas { cursor: var(--cur-hand); }
`;
  document.head.appendChild(st);
}
