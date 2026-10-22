import type { ComponentKind, Content, Decision, Level } from '@lumen/shared';
import s from './overlay.module.css';

export interface PaneView {
  id: string;
  level: Level;
  component: ComponentKind;
  el: HTMLElement;
  kids: HTMLElement[];
  why: HTMLElement | null;
  shape: string;
  update(c: Content): boolean;
}

export interface PaneHandlers {
  choice(id: string, action: string): void;
  pinch(id: string): void;
}

function node(tag: string, cls: string | undefined, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function tone(t: string | undefined): string {
  if (t === 'go') return s.go!;
  if (t === 'warn') return s.warn!;
  if (t === 'stop') return s.stop!;
  if (t === 'done') return s.done!;
  if (t === 'voice') return s.voiceTone!;
  return '';
}

function showsReason(c: Content): boolean {
  return c.showReason !== false && Boolean(c.reason.text) && c.reason.text !== c.name && c.reason.text !== c.fact;
}

function actions(c: Content, id: string, h: PaneHandlers): HTMLElement | null {
  if (!c.actions?.length) return null;
  const row = node('div', s.actions);
  for (const a of c.actions) {
    const b = node('button', a.primary ? s.primary : undefined, a.label) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.k = `a:${a.id}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      h.choice(id, a.id);
    });
    row.appendChild(b);
  }
  return row;
}

function why(c: Content, cls: string): HTMLElement | null {
  if (!showsReason(c)) return null;
  const e = node('div', `${s.why} ${s.t} ${cls}`, c.reason.text);
  e.dataset.k = 'why';
  return e;
}

function keyed<T extends HTMLElement>(e: T, k: string): T {
  e.dataset.k = k;
  return e;
}

function glanceKids(c: Content): HTMLElement[] {
  const out: HTMLElement[] = [keyed(node('div', `${s.glanceName} ${s.t}`, c.name), 'name')];
  if (c.say) out.push(keyed(node('div', `${s.say} ${s.t}`, c.say), 'say'));
  else if (c.fact) out.push(keyed(node('div', `${s.fact} ${s.t}`, c.fact), 'fact'));
  return out;
}

function cardKids(c: Content): HTMLElement[] {
  const out = [keyed(node('div', `${s.cardName} ${s.t}`, c.name), 'name')];
  if (c.say) out.push(keyed(node('div', `${s.say} ${s.t}`, c.say), 'say'));
  if (c.live) {
    const live = node('div', `${s.live} ${s.t}`);
    live.appendChild(node('i', undefined));
    live.appendChild(keyed(node('span', undefined, c.live), 'live'));
    out.push(live);
  }
  return out;
}

function rowsList(c: Content, cls: string, h: PaneHandlers | null): HTMLElement | null {
  if (!c.rows?.length) return null;
  const keyless = cls === s.rows && c.rows.every((r) => !r.key);
  const ul = node('ul', keyless ? `${cls} ${s.noKey}` : cls);
  c.rows.forEach((r, i) => {
    const li = node('li', tone(r.tone));
    if (cls === s.rows) {
      if (!keyless) li.appendChild(keyed(node('time', undefined, r.key ?? ''), `r${i}k`));
      const mid = node('span', undefined);
      mid.appendChild(keyed(node('b', undefined, r.title), `r${i}t`));
      if (r.sub) mid.appendChild(keyed(node('em', undefined, r.sub), `r${i}s`));
      li.appendChild(mid);
      li.appendChild(keyed(node('span', `${s.value} ${tone(r.tone)}`, r.value ?? ''), `r${i}v`));
    } else if (cls === s.pocketRows) {
      li.appendChild(keyed(node('span', undefined, r.title), `r${i}t`));
      li.appendChild(keyed(node('span', undefined, r.value ?? ''), `r${i}v`));
      if (h && r.key) {
        const key = r.key;
        li.dataset.gaze = key;
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          h.pinch(key);
        });
      }
    } else {
      li.appendChild(keyed(node('span', undefined, r.key ?? '·'), `r${i}k`));
      li.appendChild(keyed(node('span', undefined, r.title), `r${i}t`));
      if (r.value) li.appendChild(keyed(node('span', s.value, r.value), `r${i}v`));
    }
    ul.appendChild(li);
  });
  return ul;
}

function build(d: Decision, level: Level, h: PaneHandlers): { cls: string; kids: HTMLElement[]; why: HTMLElement | null } {
  const c = d.content;
  const kids: HTMLElement[] = [];
  let w: HTMLElement | null = null;
  const push = (e: HTMLElement | null): void => {
    if (e) kids.push(e);
  };
  switch (d.component) {
    case 'toast':
    case 'followup': {
      push(keyed(node('div', `${s.toastFrom} ${s.t}`, c.name), 'name'));
      if (c.fact) push(keyed(node('div', `${s.toastLine} ${s.t}`, c.fact), 'fact'));
      w = why(c, s.cardWhy!);
      push(w);
      push(actions(c, d.id, h));
      return { cls: s.toast!, kids, why: w };
    }
    case 'call': {
      const head = node('div', s.row);
      head.appendChild(keyed(node('div', `${s.toastFrom} ${s.t}`, c.name), 'name'));
      if (c.fact) head.appendChild(keyed(node('div', `${s.year} ${s.t}`, c.fact.toUpperCase()), 'fact'));
      push(head);
      push(actions(c, d.id, h));
      return { cls: s.toast!, kids, why: null };
    }
    case 'strip': {
      push(keyed(node('div', `${s.toastFrom} ${s.t}`, c.name), 'name'));
      if (c.fact) push(keyed(node('div', `${s.stripCount} ${s.t}`, c.fact), 'fact'));
      w = why(c, '');
      push(w);
      return { cls: s.strip!, kids, why: w };
    }
    case 'errands': {
      push(keyed(node('div', `${s.errandsTitle} ${s.t}`, c.name), 'name'));
      push(rowsList(c, s.errandsRows!, null));
      w = why(c, s.cardWhy!);
      push(w);
      return { cls: s.errands!, kids, why: w };
    }
    case 'pocket': {
      push(keyed(node('div', `${s.pocketHead} ${s.t}`, c.name), 'name'));
      push(rowsList(c, s.pocketRows!, h));
      return { cls: s.pocket!, kids, why: null };
    }
    case 'ask': {
      push(keyed(node('div', `${s.askQ} ${s.t}`, c.name), 'name'));
      push(actions(c, d.id, h));
      return { cls: s.ask!, kids, why: null };
    }
    default:
      break;
  }
  if (level === 'expanded') {
    kids.push(...cardKids({ ...c, live: undefined }));
    kids[0]!.classList.replace(s.cardName!, s.expName!);
    push(rowsList(c, s.rows!, null));
    push(actions(c, d.id, h));
    if (c.note) push(keyed(node('div', `${s.note} ${s.t}`, c.note), 'note'));
    w = why(c, s.expWhy!);
    push(w);
    return { cls: `${s.expanded} ${s.expandedPane}`, kids, why: w };
  }
  if (level === 'card') {
    kids.push(...cardKids(c));
    w = why(c, s.cardWhy!);
    push(w);
    return { cls: s.card!, kids, why: w };
  }
  kids.push(...glanceKids(c));
  w = why(c, '');
  push(w);
  return { cls: s.glance!, kids, why: w };
}

function shapeOf(el: HTMLElement): string {
  const keys: string[] = [];
  el.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => keys.push(e.dataset.k!));
  return `${el.className}|${keys.join(',')}`;
}

export function buildPane(d: Decision, level: Level, h: PaneHandlers): PaneView {
  const b = build(d, level, h);
  const el = node('div', `${s.layer} ${b.cls}`);
  el.dataset.level = level;
  for (const k of b.kids) el.appendChild(k);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    h.pinch(d.id);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  const view: PaneView = {
    id: d.id,
    level,
    component: d.component,
    el,
    kids: b.kids,
    why: b.why,
    shape: shapeOf(el),
    update(c: Content) {
      const fresh = build({ ...d, content: c }, level, h);
      const tmp = node('div', `${s.layer} ${fresh.cls}`);
      for (const k of fresh.kids) tmp.appendChild(k);
      if (shapeOf(tmp) !== view.shape) return false;
      const next = new Map<string, string>();
      tmp.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => next.set(e.dataset.k!, e.textContent ?? ''));
      let changed = false;
      el.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => {
        const v = next.get(e.dataset.k!);
        if (v !== undefined && e.textContent !== v) {
          e.textContent = v;
          changed = true;
        }
      });
      return changed;
    },
  };
  return view;
}

export function contentShape(d: Decision, level: Level): string {
  const b = build(d, level, { choice() {}, pinch() {} });
  const tmp = node('div', `${s.layer} ${b.cls}`);
  for (const k of b.kids) tmp.appendChild(k);
  return shapeOf(tmp);
}

export function whisperLine(c: Content): HTMLElement {
  const e = node('div', s.whisper);
  e.appendChild(document.createTextNode(`${c.name} `));
  e.appendChild(node('span', s.dot, '·'));
  if (c.fact) {
    const parts = c.fact.split(/(\d[\d:]*)/);
    e.appendChild(document.createTextNode(' '));
    for (const p of parts) {
      if (/^\d/.test(p)) e.appendChild(node('b', undefined, p));
      else if (p) e.appendChild(document.createTextNode(p));
    }
  }
  return e;
}

export { s as styles };
