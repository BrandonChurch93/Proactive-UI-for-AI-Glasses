import { gsap } from 'gsap';
import { SCENARIO_LABEL } from '@lumen/shared';
import { Decisions } from './decisions';
import { Evals } from './evals';
import { Exporter } from './exporter';
import s from './inspector.module.css';
import { Overrides } from './overrides';
import { Signals } from './signals';
import type { InspectorStore } from './store';
import { Timeline, clock } from './timeline';

export type { EvalReport, InspectorStore } from './store';
export { download } from './exporter';

type Tab = 'decisions' | 'signals' | 'overrides' | 'evals' | 'export';

const TABS: [Tab, string][] = [
  ['decisions', 'Decisions'],
  ['signals', 'Signals'],
  ['overrides', 'Overrides'],
  ['evals', 'Evals'],
  ['export', 'Export'],
];

export interface Inspector {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  openAt(t: number, id: string): void;
  dispose(): void;
}

export function mount(root: HTMLElement, store: InspectorStore, onClose?: () => void): Inspector {
  const drawer = document.createElement('aside');
  drawer.className = s.drawer!;
  drawer.setAttribute('aria-label', 'Inspector');
  const head = document.createElement('div');
  head.className = s.head!;
  const title = document.createElement('div');
  title.className = s.title!;
  title.textContent = 'Inspector';
  const meta = document.createElement('div');
  meta.className = s.meta!;
  const play = document.createElement('button');
  play.type = 'button';
  play.className = s.btn!;
  play.addEventListener('click', () => store.setPaused(!store.paused()));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = s.btn!;
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close the inspector');
  head.append(title, meta, play, close);

  const timeline = new Timeline(store);
  const tabs = document.createElement('div');
  tabs.className = s.tabs!;
  tabs.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  body.className = s.body!;
  const panels = {
    decisions: new Decisions(store),
    signals: new Signals(store),
    overrides: new Overrides(store),
    evals: new Evals(store),
    export: new Exporter(store),
  };
  let tab: Tab = 'decisions';
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = s.tab!;
    b.textContent = label;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => select(id));
    tabButtons.set(id, b);
    tabs.appendChild(b);
  }
  drawer.append(head, timeline.el, tabs, body);
  root.appendChild(drawer);
  gsap.set(drawer, matchMedia('(max-width: 760px)').matches ? { yPercent: 100 } : { xPercent: 100 });

  let isOpen = false;
  let resumeOnClose = false;
  let returnFocus: HTMLElement | null = null;
  let tween: gsap.core.Tween | null = null;

  const refresh = (): void => {
    if (!isOpen) return;
    meta.textContent = `${SCENARIO_LABEL[store.scenario].toUpperCase()} · ${clock(store.now())} / ${clock(store.duration)}`;
    play.textContent = store.paused() ? 'Resume' : 'Pause';
    timeline.draw();
    const p = panels[tab];
    if ('update' in p) p.update();
  };

  function select(id: Tab): void {
    tab = id;
    for (const [k, b] of tabButtons) b.setAttribute('aria-selected', String(k === id));
    body.replaceChildren(panels[id].el);
    if (id === 'decisions') panels.decisions.update();
    refresh();
  }
  select('decisions');

  const unsubscribe = store.subscribe(refresh);
  const onResize = (): void => refresh();
  addEventListener('resize', onResize);

  const api: Inspector = {
    get isOpen() {
      return isOpen;
    },
    open() {
      if (isOpen) return;
      isOpen = true;
      resumeOnClose = !store.paused();
      store.setPaused(true);
      drawer.classList.add(s.open!);
      tween?.kill();
      const mobile = matchMedia('(max-width: 760px)').matches;
      tween = gsap.fromTo(drawer, mobile ? { yPercent: 100, xPercent: 0 } : { xPercent: 100, yPercent: 0 }, { xPercent: 0, yPercent: 0, duration: 0.36, ease: 'power3.out' });
      refresh();
      requestAnimationFrame(refresh);
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      play.focus({ preventScroll: true });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      tween?.kill();
      const mobile = matchMedia('(max-width: 760px)').matches;
      tween = gsap.to(drawer, { ...(mobile ? { yPercent: 100 } : { xPercent: 100 }), duration: 0.22, ease: 'power2.in', onComplete: () => drawer.classList.remove(s.open!) });
      if (resumeOnClose) store.setPaused(false);
      if (drawer.contains(document.activeElement)) returnFocus?.focus({ preventScroll: true });
      onClose?.();
    },
    toggle() {
      if (isOpen) api.close();
      else api.open();
    },
    openAt(t, id) {
      select('decisions');
      api.open();
      panels.decisions.focusAt(t, id);
    },
    dispose() {
      unsubscribe();
      removeEventListener('resize', onResize);
      tween?.kill();
      drawer.remove();
    },
  };
  close.addEventListener('click', () => api.close());
  return api;
}
