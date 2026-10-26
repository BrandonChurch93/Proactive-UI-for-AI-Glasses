import { isShow, type BrainFrame, type Decision, type OverlayEvent } from '@lumen/shared';
import s from './inspector.module.css';
import type { InspectorStore } from './store';
import { clock } from './timeline';

type Filter = 'all' | 'shows' | 'holds' | 'overlay';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function keep(d: Decision, f: Filter): boolean {
  if (f === 'shows') return isShow(d) || d.action === 'save' || d.action === 'surface';
  if (f === 'holds') return d.action === 'hold';
  if (f === 'overlay') return d.placement.zone !== 'ground';
  return true;
}

export function reasonLine(d: Decision): string {
  const seen = d.action !== 'hold' && d.content.showReason !== false && d.level !== 'pip' && d.placement.zone !== 'ground';
  return seen ? d.reason.text : `${d.reason.text} · log only`;
}

export class Decisions {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private filter: Filter = 'all';
  private rendered = -1;
  private seen = 0;
  private count = 0;
  private buttons = new Map<Filter, HTMLButtonElement>();

  constructor(private store: InspectorStore) {
    this.el = el('div', s.panel);
    const filters = el('div', s.filters);
    for (const [f, label] of [
      ['all', 'All'],
      ['shows', 'Shows'],
      ['holds', 'Holds'],
      ['overlay', 'Overlay'],
    ] as const) {
      const b = el('button', s.btn, label) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('aria-pressed', String(f === this.filter));
      b.addEventListener('click', () => {
        this.filter = f;
        for (const [k, x] of this.buttons) x.setAttribute('aria-pressed', String(k === f));
        this.rendered = -1;
        this.update();
      });
      this.buttons.set(f, b);
      filters.appendChild(b);
    }
    this.list = el('div');
    this.el.append(filters, this.list);
  }

  focusAt(t: number, id: string): void {
    this.filter = 'shows';
    for (const [k, x] of this.buttons) x.setAttribute('aria-pressed', String(k === 'shows'));
    this.rendered = -1;
    this.update();
    const row = [...this.list.children].find((r) => (r as HTMLElement).dataset.t === t.toFixed(3) && (r as HTMLElement).dataset.id === id) as HTMLElement | undefined;
    if (!row) return;
    row.classList.add(s.focus!);
    requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
  }

  private row(f: BrainFrame, d: Decision): HTMLElement {
    const r = el('div', s.row);
    r.dataset.t = f.t.toFixed(3);
    r.dataset.id = d.id;
    const head = el('div', s.rowHead);
    const shown = isShow(d) || d.action === 'save' || d.action === 'surface';
    head.append(
      el('span', s.dim, clock(f.t)),
      el('span', s.dim, d.band.toUpperCase()),
      el('span', shown ? s.show : d.action === 'hold' ? s.dim : undefined, d.action),
      el('span', s.id, d.content.name && d.content.name !== d.id && d.action !== 'hold' ? `${d.id} · ${d.content.name}` : d.id),
      el('span', s.dim, `${d.level} · ${d.timing}`),
    );
    r.appendChild(head);
    r.appendChild(el('div', s.reason, reasonLine(d)));
    const parts = d.reason.parts.map((p) => `${p.signal} · ${p.value} · ${p.weight}`);
    if (d.cause) parts.unshift(`cause · ${d.cause}`);
    if (d.content.trimmed?.length) parts.push(`trimmed · ${d.content.trimmed.join(', ')}`);
    if (parts.length) r.appendChild(el('div', s.parts, parts.join('   ')));
    return r;
  }

  private glassRow(e: OverlayEvent): HTMLElement {
    const r = el('div', s.row);
    const head = el('div', s.rowHead);
    const shown = e.kind === 'birth' || e.kind === 'resize';
    head.append(
      el('span', s.dim, clock(e.t)),
      el('span', s.dim, 'GLASS'),
      el('span', shown ? s.show : s.dim, e.kind),
      el('span', s.id, e.id),
      el('span', s.dim, e.from !== undefined && e.from !== e.level ? `${e.from} → ${e.level}` : e.level),
    );
    r.appendChild(head);
    r.appendChild(el('div', s.reason, e.detail ? `${e.cause} · ${e.detail}` : e.cause));
    if (e.rect) r.appendChild(el('div', s.parts, `x ${Math.round(e.rect.x)}   y ${Math.round(e.rect.y)}   ${Math.round(e.rect.w)} × ${Math.round(e.rect.h)}`));
    return r;
  }

  update(): void {
    const frames = this.store.frames();
    const glass = this.filter === 'overlay' ? this.store.overlayLog() : [];
    const now = this.store.now();
    let upTo = -1;
    for (let k = frames.length - 1; k >= 0; k--) {
      if (frames[k] && frames[k]!.t <= now + 1e-6) {
        upTo = k;
        break;
      }
    }
    if (upTo < this.rendered || glass.length < this.seen) {
      this.rendered = -1;
    }
    if (this.rendered === -1) {
      this.list.replaceChildren();
      this.count = 0;
      this.seen = 0;
    }
    const fresh: HTMLElement[] = [];
    for (let k = this.rendered + 1; k <= upTo; k++) {
      const f = frames[k];
      if (!f) continue;
      while (this.seen < glass.length && glass[this.seen]!.t <= f.t + 1e-6) fresh.push(this.glassRow(glass[this.seen++]!));
      for (const d of f.events) if (keep(d, this.filter)) fresh.push(this.row(f, d));
    }
    this.rendered = upTo;
    for (const r of fresh) {
      this.list.prepend(r);
      this.count++;
    }
    while (this.count > 400 && this.list.lastChild) {
      this.list.lastChild.remove();
      this.count--;
    }
    if (this.count === 0 && !this.list.firstChild) this.list.appendChild(el('div', s.empty, 'Nothing decided yet.'));
    else if (this.count > 0) this.list.querySelector(`.${s.empty}`)?.remove();
  }
}
