// Controller navigation for menus and shops (owner): while a panel / overlay is open the gamepad drives a focus box
// over whatever is clickable on screen (buttons, tabs, item slots, cards, sliders ...), found by walking the DOM for
// the outermost elements with a pointer cursor that are on top (not covered by a modal). engine/input.ts calls these.
//   D-pad / left stick: move focus (spatial: nearest element in that direction) · A: click it · LB / RB: previous /
//   next tab of the nearest tab row · right stick: scroll the focused element's scroll container.

const FOCUS = 'pad-focus';
let cur: HTMLElement | null = null;

const visible = (el: HTMLElement): DOMRect | null => {
  const r = el.getBoundingClientRect();
  if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(x, y);
  return top && (top === el || el.contains(top) || top.contains(el)) ? r : null;   // on top (not under a modal backdrop)
};

/** Outermost clickable elements currently on top of the screen. */
function candidates(): { el: HTMLElement; r: DOMRect }[] {
  const out: { el: HTMLElement; r: DOMRect }[] = [];
  const all = document.querySelectorAll<HTMLElement>('body *');
  for (const el of all) {
    if (el instanceof SVGElement || el.closest('canvas')) continue;
    if ((el as HTMLButtonElement).disabled) continue;
    const cs = getComputedStyle(el);
    const clickable = cs.cursor.endsWith('pointer') || el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'hidden') || el.tagName === 'SELECT';
    if (!clickable || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const p = el.parentElement;
    if (p && p !== document.body && getComputedStyle(p).cursor.endsWith('pointer') && p.tagName !== 'LABEL') continue;   // keep the outermost clickable
    const r = visible(el);
    if (r) out.push({ el, r });
  }
  return out;
}

function setFocus(el: HTMLElement | null): void {
  if (cur && cur !== el) cur.classList.remove(FOCUS);
  cur = el;
  if (el) { el.classList.add(FOCUS); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })); }
}

function valid(): boolean { return !!cur && document.body.contains(cur) && !!visible(cur); }

/** Move the focus one step in a direction (dx, dy each -1 / 0 / 1). */
export function padMove(dx: number, dy: number): void {
  const list = candidates();
  if (!list.length) return;
  if (!valid()) { const pool = list.filter(({ el }) => !/close/i.test(el.getAttribute('aria-label') ?? '') && !/close/.test(el.className)); const l = pool.length ? pool : list; l.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left); setFocus(l[0].el); return; }
  const c = cur!.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best: HTMLElement | null = null, bestS = Infinity;
  for (const { el, r } of list) {
    if (el === cur || el.contains(cur!) || cur!.contains(el)) continue;
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2, vx = ex - cx, vy = ey - cy;
    const along = dx ? vx * dx : vy * dy, across = dx ? Math.abs(vy) : Math.abs(vx);
    if (along <= 4) continue;
    const s = along + across * 2.2;
    if (s < bestS) { bestS = s; best = el; }
  }
  if (best) setFocus(best);
}

/** A: click the focused element (focusing the first one when nothing is focused yet). */
export function padActivate(): void {
  if (!valid()) { padMove(0, 1); return; }
  const el = cur!, r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') return;   // sliders: left / right adjust (padMove does not change them)
  el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse' }));
  el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse' }));
  el.click();
}

/** LB / RB: the previous / next tab of the tab row nearest the focus. */
export function padTab(step: number): void {
  const tabs = candidates().filter(({ el }) => el.getAttribute('role') === 'tab' || /(^|[\s-])tab(\s|$)/.test(el.className) || /\b[a-z0-9]+-tab\b/.test(el.className));
  if (!tabs.length) return;
  // group by parent; take the row containing / closest to the focus
  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const { el } of tabs) { const p = el.parentElement!; (groups.get(p) ?? groups.set(p, []).get(p)!).push(el); }
  let row: HTMLElement[] = [...groups.values()][0];
  if (cur && document.body.contains(cur)) {   // the row in the same panel as the focus: the fewest steps up to a shared ancestor
    const anc = new Map<Element, number>(); let n = 0; for (let e: Element | null = cur; e; e = e.parentElement) anc.set(e, n++);
    let bd = Infinity;
    for (const g of groups.values()) { let k = 0, e: Element | null = g[0].parentElement; while (e && !anc.has(e)) { e = e.parentElement; k++; } const d = e ? anc.get(e)! + k : Infinity; if (d < bd) { bd = d; row = g; } }
  }
  const active = row.findIndex((el) => /\b(is-active|active|on|sel|selected)\b/.test(el.className) || el.getAttribute('aria-selected') === 'true');
  const next = row[((active < 0 ? 0 : active) + step + row.length) % row.length];
  next.click(); setFocus(next);
}

/** Right stick: scroll the focused element's scroll container (or the largest scrollable panel). */
export function padScroll(dy: number): void {
  let el: HTMLElement | null = cur;
  while (el && !(el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  if (!el) { let best = 0; for (const e of document.querySelectorAll<HTMLElement>('body *')) { if (e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && visible(e)) { const a = e.clientWidth * e.clientHeight; if (a > best) { best = a; el = e; } } } }
  if (el) el.scrollTop += dy * 18;
}

/** Left / right on a focused slider nudges it. */
export function padSlider(dx: number): boolean {
  if (!cur || cur.tagName !== 'INPUT' || (cur as HTMLInputElement).type !== 'range') return false;
  const inp = cur as HTMLInputElement, step = (Number(inp.max || 1) - Number(inp.min || 0)) / 20;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(inp, String(Math.min(Number(inp.max || 1), Math.max(Number(inp.min || 0), Number(inp.value) + dx * step))));
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function padClear(): void { if (cur) cur.classList.remove(FOCUS); cur = null; }
