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

function actions(c: Content, id: string, h: PaneHandlers, cls = s.actions): HTMLElement | null {
  if (!c.actions?.length) return null;
  const row = node('div', cls);
  for (const a of c.actions) {
    const b = node('button', a.primary ? s.primary : a.id === 'end' || a.id === 'not-now' ? s.quiet : undefined, a.label) as HTMLButtonElement;
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

const APP_GLYPHS: Record<NonNullable<Content['app']>, string> = {
  Messages: '<svg viewBox="0 0 14 14"><path d="M3 2h8a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H6.6L3.8 12.6V10.5H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};

const INTENT_GLYPHS: Record<string, string> = {
  hungry: '<svg viewBox="0 0 20 20"><path d="M6 2.5v5.2M4 2.5v4a2 2 0 0 0 4 0v-4M6 9.7v7.8M14.5 17.5V2.5c-2 1.2-3 3.4-3 6.2v2.8h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  errands: '<svg viewBox="0 0 20 20"><path d="M3 5l1.3 1.3L6.8 3.8M3 10.5l1.3 1.3 2.5-2.5M3 16l1.3 1.3 2.5-2.5M9.5 5h7.5M9.5 10.5h7.5M9.5 16h7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  walking: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M12.8 7.2l-1.6 4-4 1.6 1.6-4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};

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

function thumb(img: string | undefined, kind: string | undefined, size: string, k: string): HTMLElement {
  const box = keyed(node('span', `${s.thumb} ${size}`), k);
  if (kind) box.dataset.kind = kind;
  const dot = (): void => {
    box.replaceChildren(node('i', s.toneDot));
  };
  if (!img) {
    dot();
    return box;
  }
  const el = document.createElement('img');
  el.alt = '';
  el.decoding = 'async';
  el.draggable = false;
  el.addEventListener('error', dot, { once: true });
  el.src = img;
  box.appendChild(el);
  return box;
}

function hero(c: Content): HTMLElement {
  const box = keyed(node('div', s.hero), 'hero');
  if (c.kind) box.dataset.kind = c.kind;
  const el = document.createElement('img');
  el.alt = '';
  el.decoding = 'async';
  el.draggable = false;
  el.addEventListener('error', () => box.replaceChildren(node('i', s.toneDot)), { once: true });
  el.src = c.img!;
  box.appendChild(el);
  return box;
}

function cardKids(c: Content, thumbed = Boolean(c.img)): HTMLElement[] {
  const out: HTMLElement[] = [keyed(node('div', `${s.cardName} ${s.t}`, c.name), 'name')];
  if (c.chip) {
    const head = node('div', s.cardHead);
    head.appendChild(out[0]!);
    head.appendChild(keyed(node('span', s.chip, c.chip), 'chip'));
    out[0] = head;
  }
  if (thumbed) {
    const top = node('div', s.cardTop);
    top.append(thumb(c.img, c.kind, s.thumbCard!, 'thumb'), out[0]!);
    out[0] = top;
  }
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
  const thumbs = cls === s.rows && c.rows.some((r) => r.img);
  const keyless = cls === s.rows && !thumbs && c.rows.every((r) => !r.key);
  const ul = node('ul', keyless ? `${cls} ${s.noKey}` : thumbs ? `${cls} ${s.thumbRows}` : cls);
  c.rows.forEach((r, i) => {
    const li = node('li', tone(r.tone));
    if (cls === s.rows) {
      if (thumbs) li.appendChild(r.img ? thumb(r.img, c.kind, s.thumbRow!, `r${i}i`) : node('span', undefined));
      else if (!keyless) li.appendChild(keyed(node('time', undefined, r.key ?? ''), `r${i}k`));
      const mid = node('span', undefined);
      mid.appendChild(keyed(node('b', undefined, r.title), `r${i}t`));
      if (r.sub) mid.appendChild(keyed(node('em', undefined, r.sub), `r${i}s`));
      li.appendChild(mid);
      li.appendChild(keyed(node('span', `${s.value} ${tone(r.tone)}`, r.value ?? ''), `r${i}v`));
    } else if (cls === s.pickRows) {
      li.appendChild(thumb(r.img, r.kind, s.thumbRow!, `r${i}i`));
      const top = node('div', s.pickTop);
      top.appendChild(keyed(node('b', undefined, r.title), `r${i}t`));
      top.appendChild(keyed(node('span', s.value, r.value ?? ''), `r${i}v`));
      li.appendChild(top);
      if (r.sub) li.appendChild(keyed(node('div', s.pickSay, r.sub), `r${i}s`));
      if (r.live) {
        const live = node('div', s.live);
        live.appendChild(node('i', undefined));
        live.appendChild(keyed(node('span', undefined, r.live), `r${i}l`));
        li.appendChild(live);
      }
      if (h && r.key) {
        const key = r.key;
        li.dataset.gaze = key;
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          h.pinch(key);
        });
      }
    } else if (cls === s.pocketRows) {
      li.appendChild(thumb(r.img, r.kind, s.thumbPocket!, `r${i}i`));
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
      push(actions(c, d.id, h));
      return { cls: s.errands!, kids, why: w };
    }
    case 'thread': {
      const head = node('div', s.threadHead);
      if (c.app) {
        const glyph = keyed(node('span', s.appGlyph), 'app');
        glyph.innerHTML = APP_GLYPHS[c.app];
        glyph.setAttribute('aria-hidden', 'true');
        head.appendChild(glyph);
      }
      head.appendChild(keyed(node('span', s.avatar, c.avatar ?? c.name.slice(0, 1)), 'avatar'));
      head.appendChild(keyed(node('span', `${s.toastFrom} ${s.t}`, c.name), 'name'));
      const stamp = [c.app?.toUpperCase(), c.time].filter(Boolean).join(' · ');
      if (stamp) head.appendChild(keyed(node('span', s.threadTime, stamp), 'time'));
      push(head);
      if (c.thread?.length) {
        const list = node('div', s.bubbles);
        c.thread.forEach((l, i) => list.appendChild(keyed(node('div', `${s.bubble} ${l.me ? s.mine : ''}`, l.text), `b${i}`)));
        push(list);
      } else if (c.fact) push(keyed(node('div', `${s.toastLine} ${s.t}`, c.fact), 'fact'));
      if (c.note) push(keyed(node('div', `${s.note} ${s.t}`, c.note), 'note'));
      push(actions(c, d.id, h, c.note ? s.actions : s.chips));
      return { cls: s.thread!, kids, why: null };
    }
    case 'intent': {
      if (c.fact) push(keyed(node('div', `${s.intentEyebrow} ${s.t}`, c.fact), 'fact'));
      push(keyed(node('div', `${s.intentQ} ${s.t}`, c.name), 'name'));
      for (const a of c.actions ?? []) {
        if (a.id === 'end') continue;
        const b = node('button', `${s.intentRow} ${a.primary ? s.intentPick : ''}`) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.k = `a:${a.id}`;
        const g = node('span', s.intentGlyph);
        g.innerHTML = INTENT_GLYPHS[a.id] ?? '';
        g.setAttribute('aria-hidden', 'true');
        const text = node('span', s.intentText);
        text.append(node('span', s.intentLabel, a.label));
        if (a.hint) text.append(node('span', s.intentHint, a.hint));
        b.append(g, text);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          h.choice(d.id, a.id);
        });
        push(b);
      }
      const end = c.actions?.find((a) => a.id === 'end');
      if (end) push(actions({ ...c, actions: [end] }, d.id, h, s.intentEnd));
      return { cls: s.intent!, kids, why: null };
    }
    case 'picker': {
      push(keyed(node('div', `${s.pocketHead} ${s.t}`, c.name), 'name'));
      push(rowsList(c, s.pickRows!, h));
      push(actions(c, d.id, h));
      return { cls: s.picker!, kids, why: null };
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
    if (c.img) kids.push(hero(c));
    const named = kids.length;
    kids.push(...cardKids({ ...c, live: undefined }, false));
    (kids[named]!.querySelector(`.${s.cardName}`) ?? kids[named]!).classList.replace(s.cardName!, s.expName!);
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
    push(actions(c, d.id, h));
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
