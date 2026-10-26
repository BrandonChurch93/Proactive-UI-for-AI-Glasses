import type { Band } from '@lumen/shared';
import s from './inspector.module.css';
import type { InspectorStore } from './store';
import { clock } from './timeline';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, cls = s.btn): HTMLButtonElement {
  const b = el('button', cls, label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class Overrides {
  readonly el: HTMLElement;
  private gate: HTMLButtonElement;
  private mute: HTMLButtonElement;
  private focus: HTMLButtonElement;
  private pace: HTMLButtonElement;
  private mark: HTMLButtonElement;
  private bands = new Map<Band | 'auto', HTMLButtonElement>();
  private log: HTMLElement;

  constructor(private store: InspectorStore) {
    this.el = el('div', s.panel);
    const controls = el('div', s.controls);
    const control = (title: string, note: string, ...right: HTMLElement[]): void => {
      const c = el('div', s.control);
      const text = el('div');
      text.append(el('div', undefined, title), el('small', undefined, note));
      const r = el('div', s.seg);
      r.append(...right);
      c.append(text, r);
      controls.appendChild(c);
    };
    this.gate = button('Off', () => this.store.override({ kind: 'gate', on: !this.active().gate }));
    control('Force a safety gate', 'As if the wearer were crossing. Everything recedes.', this.gate);
    control('Zero the attention budget', 'New shows are held until it refills.', button('Drop to zero', () => this.store.override({ kind: 'budget-zero' })));
    const seg: HTMLElement[] = [];
    for (const b of ['auto', 'stopped', 'stroll', 'walk', 'brisk'] as const) {
      const x = button(b === 'auto' ? 'Auto' : b[0]!.toUpperCase() + b.slice(1), () => this.store.override({ kind: 'band', band: b === 'auto' ? null : b }));
      this.bands.set(b, x);
      seg.push(x);
    }
    control('Pace band', 'Overrides the band the speed implies.', ...seg);
    this.mute = button('Off', () => this.store.override({ kind: 'mute-social', on: !this.active().mute }));
    control('Mute social', 'Ignore the conversation gate.', this.mute);
    control('Start a snooze', 'Sixty seconds of quiet, as if the wearer looked up.', button('Snooze', () => this.store.override({ kind: 'snooze' })));
    this.focus = button('Off', () => {
      this.store.setFocusOutline(!this.store.focusOutline());
      this.update();
    });
    control('Show the focus zone', 'Outline on the glasses view. Reviewer chrome.', this.focus);
    this.pace = button('Off', () => {
      this.store.setPaceReadout(!this.store.paceReadout());
      this.update();
    });
    control('Show the pace readout', 'Band and speed in the corner. Reviewer chrome.', this.pace);
    this.mark = button('On', () => {
      this.store.setGazeMark(!this.store.gazeMark());
      this.update();
    });
    control('Gaze mark', 'A ring at the center of the view, standing in for eye tracking. Reviewer chrome.', this.mark);
    this.log = el('div');
    this.el.append(controls, el('div', s.section, 'Applied'), this.log);
  }

  private active(): { gate: boolean; mute: boolean; band: Band | null } {
    let gate = false;
    let mute = false;
    let band: Band | null = null;
    for (const { override: o } of this.store.overrides()) {
      if (o.kind === 'gate') gate = o.on;
      if (o.kind === 'mute-social') mute = o.on;
      if (o.kind === 'band') band = o.band;
    }
    return { gate, mute, band };
  }

  update(): void {
    const a = this.active();
    this.gate.textContent = a.gate ? 'On' : 'Off';
    this.gate.setAttribute('aria-pressed', String(a.gate));
    this.mute.textContent = a.mute ? 'On' : 'Off';
    this.mute.setAttribute('aria-pressed', String(a.mute));
    const focus = this.store.focusOutline();
    this.focus.textContent = focus ? 'On' : 'Off';
    this.focus.setAttribute('aria-pressed', String(focus));
    const mark = this.store.gazeMark();
    this.mark.textContent = mark ? 'On' : 'Off';
    this.mark.setAttribute('aria-pressed', String(mark));
    const pace = this.store.paceReadout();
    this.pace.textContent = pace ? 'On' : 'Off';
    this.pace.setAttribute('aria-pressed', String(pace));
    for (const [k, b] of this.bands) b.setAttribute('aria-pressed', String((a.band ?? 'auto') === k));
    const rows = this.store.overrides().map(({ t, override: o }) => {
      const what = o.kind === 'gate' ? `gate ${o.on ? 'on' : 'off'}` : o.kind === 'band' ? `band ${o.band ?? 'auto'}` : o.kind === 'mute-social' ? `mute social ${o.on ? 'on' : 'off'}` : o.kind;
      const r = el('div', s.kv);
      r.append(el('span', undefined, clock(t)), el('span', undefined, what));
      return r;
    });
    this.log.replaceChildren(...(rows.length ? rows : [el('div', s.empty, 'None. Every override is logged and goes into the export.')]));
  }
}
