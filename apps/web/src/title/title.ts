import { gsap } from 'gsap';
import type { Band, ScenarioId } from '@lumen/shared';
import css from './title.module.css';


export const SCENARIO_NAMES: Record<ScenarioId, string> = { hungry: 'Hungry', errands: 'Errands', walking: 'Just walking' };

export type Choice = ScenarioId;

const CHIPS: { id: Choice; name: string }[] = [
  { id: 'hungry', name: 'Hungry' },
  { id: 'errands', name: 'Errands' },
  { id: 'walking', name: 'Just walk' },
];

const WHAT: [string, string][] = [
  ['BRAIN', 'A deterministic rules engine, not a model. Same walk, same decisions, every time.'],
  ['RULES', 'Thirteen walking rules for a person who is moving: content scales with speed, yields to a head check, saves itself for the red light, never covers a face or a car.'],
  ['PROOF', 'Every decision is logged with its reasons and scored by an eval suite. Press I during a walk.'],
];

const CONTROLS: [string, string][] = [
  ['LOOK', 'drag'],
  ['DWELL', 'hold'],
  ['PINCH', 'click'],
  ['ESC', 'dismiss'],
  ['I', 'inspector'],
];

const CONTROLS_TOUCH: [string, string][] = [
  ['LOOK', 'drag'],
  ['DWELL', 'hold'],
  ['PINCH', 'tap'],
  ['LONG-PRESS', 'dismiss'],
  ['I', 'inspector'],
];

const ABOUT = [
  'A browser simulation of a near-future pair of AI glasses on a city walk.',
  'A real-time street is wired into a decision engine that reads your pace, surroundings, attention, goal and attention budget, then decides what to show, how much, when, and when to hold back.',
  'The interface follows walking rules for a person who is moving: it shrinks as you speed up, yields when you check for traffic, saves what you pinched for the next red light, and never covers a face or a moving car.',
  'The brain is a set of rules, not a model. Same walk, same decisions, every time. Press I during a walk to see every decision and its reasons, scrub the walk, and run the evals.',
  'Built by Brandon Church with Three.js, TypeScript and GSAP.',
];

export const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const EASE_OUT = 'power3.out';
const EASE_IN = 'power2.in';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildAbout(): { el: HTMLElement; open(from: HTMLElement): void } {
  const about = el('div', css.about);
  about.setAttribute('role', 'dialog');
  about.setAttribute('aria-label', 'About this project');
  const card = el('div', css.aboutCard);
  for (const line of ABOUT) card.appendChild(el('p', undefined, line));
  const close = el('button', css.aboutClose, 'Close') as HTMLButtonElement;
  close.type = 'button';
  card.appendChild(close);
  about.appendChild(card);
  about.style.display = 'none';
  let back: HTMLElement | null = null;
  const hide = (e: Event): void => {
    e.stopPropagation();
    about.style.display = 'none';
    back?.focus({ preventScroll: true });
  };
  close.addEventListener('click', hide);
  about.addEventListener('click', (e) => {
    if (e.target === about) hide(e);
    else e.stopPropagation();
  });
  about.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide(e);
  });
  return {
    el: about,
    open(from) {
      back = from;
      about.style.display = '';
      gsap.fromTo(card, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.36, ease: EASE_OUT, clearProps: 'filter' });
      close.focus({ preventScroll: true });
    },
  };
}

export class TitleScreen {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private panel: HTMLElement;
  private reveals: HTMLElement[];
  private tl: gsap.core.Timeline | null = null;
  private startButton: HTMLButtonElement;
  private chips: HTMLButtonElement[] = [];
  private picked: Choice | null = null;
  private aboutLink: HTMLButtonElement;
  private busy = false;

  constructor(
    parent: HTMLElement,
    private onStart: (suggest: Choice | null) => void,
  ) {
    this.el = el('section', css.screen);
    this.el.setAttribute('aria-label', 'Proactive UI for AI Glasses');
    this.plate = el('div', css.plate);
    this.panel = el('div', css.panel);
    const sub = el('div', css.sub, 'A UX study in when an assistant should speak, and when it should stay quiet');
    const name = el('h1', css.name, 'Proactive UI for AI Glasses');
    const lede = el('p', css.lede, "You're walking through a big city. The AI in your glasses decides what to show you, how much, and when to stay quiet.");
    const whatHead = el('div', css.label, 'What this is');
    const what = el('div', css.what);
    for (const [k, v] of WHAT) {
      const r = el('div');
      r.append(el('i', undefined, k), el('span', undefined, v));
      what.appendChild(r);
    }
    const chooseHead = el('div', css.label, 'The walk');
    const choices = el('div', css.start);
    this.startButton = el('button', css.startButton, 'Start the walk') as HTMLButtonElement;
    this.startButton.type = 'button';
    this.startButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.choose();
    });
    const ask = el('p', css.ask, "At the first red light the glasses ask what you're up to.");
    const chips = el('div', css.chips);
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Have an answer ready');
    for (const c of CHIPS) {
      const b = el('button', undefined, c.name) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.choice = c.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(this.picked === c.id ? null : c.id);
      });
      this.chips.push(b);
      chips.appendChild(b);
    }
    choices.append(this.startButton, ask, chips);
    const controls = el('div', css.controls);
    (TOUCH ? CONTROLS_TOUCH : CONTROLS).forEach(([k, v], i) => {
      if (i) controls.appendChild(el('span', css.dot, '·'));
      const c = el('span');
      c.append(el('i', undefined, k), document.createTextNode(` ${v}`));
      controls.appendChild(c);
    });
    const footer = el('div', css.footer);
    footer.append(document.createTextNode('Built by Brandon Church · Three.js, TypeScript, GSAP · '));
    this.aboutLink = el('button', css.aboutLink, 'About this project') as HTMLButtonElement;
    this.aboutLink.type = 'button';
    footer.appendChild(this.aboutLink);
    const about = buildAbout();
    this.aboutLink.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipToChoice();
      about.open(this.aboutLink);
    });
    this.panel.append(sub, name, lede, whatHead, what, chooseHead, choices, controls, footer);
    this.reveals = [sub, name, lede, whatHead, what, chooseHead, choices, controls, footer];
    this.el.append(this.plate, this.panel, about.el);
    this.el.addEventListener('click', () => this.skipToChoice());
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  private get narrow(): boolean {
    return innerWidth < 900;
  }

  show(atChoice = false): void {
    this.busy = false;
    this.el.style.display = '';
    this.tl?.kill();
    gsap.set(this.reveals, { opacity: 0, y: 0, filter: 'none' });
    gsap.set(this.panel, { xPercent: -100 });
    gsap.set(this.plate, { opacity: 1 });
    const tl = gsap.timeline();
    tl.to(this.plate, { opacity: this.narrow ? 0.6 : 0, duration: 0.9, ease: 'power1.inOut' }, 0);
    tl.to(this.panel, { xPercent: 0, duration: 0.9, ease: EASE_OUT }, 0);
    tl.fromTo(this.reveals, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, ease: EASE_OUT, stagger: 0.12, clearProps: 'filter' }, 0.35);
    tl.call(() => {
      if (!TOUCH) this.startButton.focus({ preventScroll: true });
    });
    this.tl = tl;
    if (atChoice) this.skipToChoice();
  }

  skipToChoice(): void {
    if (this.tl && this.tl.progress() < 1) this.tl.progress(1);
  }

  focus(id: Choice): void {
    this.pick(id);
    this.startButton.focus({ preventScroll: true });
  }

  private pick(id: Choice | null): void {
    this.picked = id;
    for (const b of this.chips) b.setAttribute('aria-pressed', String(b.dataset.choice === id));
  }

  private choose(): void {
    if (this.busy) return;
    this.busy = true;
    this.tl?.kill();
    const tl = gsap.timeline();
    tl.to(this.reveals, { opacity: 0, y: -6, filter: 'blur(4px)', duration: 0.22, ease: EASE_IN, stagger: 0.03 }, 0);
    tl.to(this.panel, { xPercent: -100, duration: 0.45, ease: EASE_IN }, 0.15);
    tl.to(this.plate, { opacity: 0, duration: 0.45, ease: 'power1.inOut' }, 0.15);
    const suggest = this.picked;
    tl.call(() => this.onStart(suggest), [], 0.6);
    this.tl = tl;
  }

  reveal(): void {
    this.tl?.kill();
    this.hide();
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}

export interface EndStats {
  scenario: ScenarioId;
  duration: number;
  places: number;
  cards: number;
  held: number;
  saved: number;
  ticks: { t: number; kind: 'card' | 'hold' }[];
  gates: [number, number][];
  bands: { t: number; band: Band }[];
  decided: { t: number; name: string; reason: string }[];
  first: { t: number; id: string } | null;
}

export interface EndHandlers {
  again(): void;
  choose(id: ScenarioId): void;
  inspect(t: number, id: string): void;
}

const BAND_STEP: Record<Band, number> = { stopped: 0, stroll: 1, walk: 2, brisk: 3 };

export function endSentence(st: Pick<EndStats, 'places' | 'cards' | 'held' | 'saved'>): string {
  const parts: string[] = [];
  if (st.places) parts.push(`saw ${st.places} places`);
  if (st.cards) parts.push(`showed you ${st.cards}`);
  if (st.held) parts.push(`held ${st.held} while you crossed`);
  if (st.saved) parts.push(`saved ${st.saved} for the red light`);
  if (!parts.length) return 'In ninety seconds the glasses stayed quiet.';
  const list = parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `In ninety seconds the glasses ${list}.`;
}

const clockOf = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class EndCard {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private panel: HTMLElement;
  private about = buildAbout();
  private tl: gsap.core.Timeline | null = null;

  constructor(
    parent: HTMLElement,
    private h: EndHandlers,
  ) {
    this.el = el('section', `${css.screen} ${css.end}`);
    this.el.setAttribute('aria-label', 'End of the walk');
    this.plate = el('div', css.plate);
    this.panel = el('div', css.panel);
    this.el.append(this.plate, this.panel, this.about.el);
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  private timeline(st: EndStats): { el: HTMLElement; ticks: HTMLElement[]; strip: HTMLElement } {
    const wrap = el('div', css.timeline);
    const strip = el('div', css.strip);
    const x = (t: number): string => `${Math.max(0, Math.min(100, (100 * t) / st.duration)).toFixed(3)}%`;
    for (const [a, b] of st.gates) {
      const g = el('div', css.gate);
      g.style.left = x(a);
      g.style.width = `${((100 * (b - a)) / st.duration).toFixed(3)}%`;
      strip.appendChild(g);
    }
    const ticks: HTMLElement[] = [];
    for (const k of st.ticks) {
      const tk = el('div', k.kind === 'card' ? css.tick : `${css.tick} ${css.tickHold}`);
      tk.style.left = x(k.t);
      tk.dataset.f = String(k.t / st.duration);
      strip.appendChild(tk);
      ticks.push(tk);
    }
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', css.bands!);
    svg.setAttribute('viewBox', `0 0 ${st.duration} 8`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const pts: string[] = [];
    let y = 7;
    for (const b of st.bands) {
      pts.push(`${b.t.toFixed(2)},${y}`);
      y = 7 - BAND_STEP[b.band] * 2;
      pts.push(`${b.t.toFixed(2)},${y}`);
    }
    pts.push(`${st.duration},${y}`);
    const line = document.createElementNS(svgNs, 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
    strip.appendChild(svg);
    const labels = el('div', css.tlLabels);
    const end = el('span', undefined, '1:30');
    end.style.left = x(90);
    labels.append(el('span', undefined, '0:00'), end);
    wrap.append(strip, labels);
    return { el: wrap, ticks, strip };
  }

  show(st: EndStats): void {
    this.el.style.display = '';
    const name = el('h2', css.name, SCENARIO_NAMES[st.scenario]);
    const line = el('p', css.lede, endSentence(st));
    const tl = this.timeline(st);
    const head = el('div', css.label, 'What it decided');
    const decided = el('div', css.decided);
    for (const d of st.decided) {
      const r = el('div');
      r.append(el('i', undefined, clockOf(d.t)), el('b', undefined, d.name), el('span', undefined, d.reason));
      decided.appendChild(r);
    }
    const actions = el('div', css.endActions);
    const button = (text: string, fn: () => void, primary = false): HTMLButtonElement => {
      const b = el('button', primary ? css.primary : undefined, text) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      actions.appendChild(b);
      return b;
    };
    if (st.first) {
      const f = st.first;
      button('See every decision', () => this.h.inspect(f.t, f.id), true);
    }
    button('Walk again', () => this.h.again());
    for (const id of (['hungry', 'errands', 'walking'] as const).filter((x) => x !== st.scenario)) button(SCENARIO_NAMES[id], () => this.h.choose(id));
    const about = button('About', () => this.about.open(about));
    const parts = [name, line, tl.el, head, decided, actions];
    this.panel.replaceChildren(...parts);
    this.tl?.kill();
    const t = gsap.timeline();
    gsap.set(parts, { opacity: 0 });
    gsap.set(this.panel, { xPercent: -100 });
    gsap.set(tl.ticks, { scaleY: 0 });
    gsap.set(tl.strip, { clipPath: 'inset(0 100% 0 0)' });
    t.fromTo(this.plate, { opacity: 0 }, { opacity: 0.65, duration: 0.9, ease: 'power1.inOut' }, 0);
    t.to(this.panel, { xPercent: 0, duration: 0.9, ease: EASE_OUT }, 0);
    t.fromTo(parts, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, ease: EASE_OUT, stagger: 0.12, clearProps: 'filter' }, 0.35);
    t.to(tl.strip, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power2.out' }, 0.6);
    for (const tk of tl.ticks) {
      const f = Number(tk.dataset.f);
      t.to(tk, { scaleY: 1, duration: 0.18, ease: EASE_OUT }, 0.6 + 0.9 * (1 - Math.sqrt(Math.max(0, 1 - f))));
    }
    t.call(() => (actions.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true }), [], 1.2);
    this.tl = t;
  }

  hide(): void {
    this.tl?.kill();
    this.el.style.display = 'none';
  }
}
