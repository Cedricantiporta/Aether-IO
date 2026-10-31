# Recipe: headless QA
- No unit tests: `npx tsc --noEmit`, `npx vite build` (slow: run with a timeout), then Playwright (Chromium preinstalled, `require('playwright')`). See HANDOFF "QA (headless)" for debug hooks (`debugJump`, `debugHerald`, world singletons on `window`).
- SwiftShader is slow: judge logic and layout, not frame rate or camera damping.
- Disk is limited: remove finished `.claude/worktrees/*`, don't `npm ci` per worktree (symlink node_modules).
