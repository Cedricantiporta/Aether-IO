// Writes public/preload.json: every painted UI image + cutscene video, preloaded by the loading screen (ui/screens/LoadingScreen).
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
const root = 'public', out = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(webp|png|jpg|mp4)$/i.test(f)) out.push(relative(root, p).split('\\').join('/')); } };
for (const d of ['art', 'video']) { try { walk(join(root, d)); } catch { /* folder missing */ } }
writeFileSync(join(root, 'preload.json'), JSON.stringify(out));
console.log('preload.json:', out.length, 'files');
