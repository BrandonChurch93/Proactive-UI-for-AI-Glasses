import { gsap } from 'gsap';
import type { ScenarioId } from '@lumen/shared';
import css from './title.module.css';

export const SCENARIO_NAMES: Record<ScenarioId, string> = { hungry: 'Hungry', errands: 'Errands', walking: 'Just walking' };

const CHOICES: { id: ScenarioId; line: string }[] = [
  { id: 'hungry', line: 'Find a place and get there.' },
  { id: 'errands', line: 'Three stops, one route.' },
  { id: 'walking', line: 'See what it does when you want nothing.' },
];

const HOW: [string, string][] = [
  ['LOOK', 'Drag to turn your head. The walk is on rails.'],
  ['DWELL', 'Hold your gaze on anything that lights up and it opens. Keep looking and it opens further.'],
  ['PINCH', 'Click to skip the wait or choose. Esc to dismiss.'],
  ['I', 'Open the inspector: every decision the brain made, the reasons, and the evals.'],
];

const HOW_TOUCH: [string, string][] = [
  ['LOOK', 'Drag to turn your head. The walk is on rails.'],
  ['DWELL', 'Hold the middle of the view on anything that lights up and it opens. Keep looking and it opens further.'],
  ['PINCH', 'Tap to skip the wait or choose. Long-press to dismiss.'],
  ['I', 'Tap I · INSPECTOR in the corner: every decision the brain made, the reasons, and the evals.'],
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

export class TitleScreen {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private tl: gsap.core.Timeline | null = null;
  private parts: { name: HTMLElement; sub: HTMLElement; setting: HTMLElement; how: HTMLElement; rows: HTMLElement[]; q: HTMLElement; choices: HTMLElement; skip: HTMLElement; about: HTMLElement };
  private buttons: HTMLButtonElement[] = [];
  private busy = false;

  constructor(
    parent: HTMLElement,
    private onChoose: (id: ScenarioId) => void,
  ) {
    this.el = el('section', css.screen);
    this.el.setAttribute('aria-label', 'Proactive UI for AI Glasses');
    this.plate = el('div', css.plate);
    const text = el('div', css.text);
    const sub = el('div', css.sub, 'A UX study in when an assistant should speak, and when it should stay quiet');
    const name = el('h1', css.name, 'Proactive UI for AI Glasses');
    const setting = el('div', css.setting);
    setting.append(el('span', undefined, "You're walking through a big city."), el('span', undefined, 'The AI in your glasses decides what to show you, how much, and when to stay quiet.'));
    const how = el('div', css.how);
    const rows = (TOUCH ? HOW_TOUCH : HOW).map(([k, v]) => {
      const r = el('div');
      r.append(el('i', undefined, k), el('span', undefined, v));
      how.appendChild(r);
      return r;
    });
    const q = el('div', css.q, 'What are you up to?');
    const choices = el('div', css.choices);
    CHOICES.forEach((c, i) => {
      const b = el('button', i === 0 ? css.primary : undefined) as HTMLButtonElement;
      b.type = 'button';
      b.append(el('b', undefined, SCENARIO_NAMES[c.id]), el('span', undefined, c.line));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.choose(c.id);
      });
      this.buttons.push(b);
      choices.appendChild(b);
    });
    const skip = el('div', css.skip, TOUCH ? 'TAP TO SKIP' : 'CLICK TO SKIP');
    const aboutLink = el('button', css.aboutLink, 'About this project') as HTMLButtonElement;
    aboutLink.type = 'button';
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
    aboutLink.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipToChoice();
      about.style.display = '';
      gsap.fromTo(card, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.36, ease: EASE_OUT, clearProps: 'filter' });
      close.focus({ preventScroll: true });
    });
    const hideAbout = (e: Event): void => {
      e.stopPropagation();
      about.style.display = 'none';
      aboutLink.focus({ preventScroll: true });
    };
    close.addEventListener('click', hideAbout);
    about.addEventListener('click', (e) => {
      if (e.target === about) hideAbout(e);
      else e.stopPropagation();
    });
    about.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAbout(e);
    });
    text.append(sub, name, setting, how, q, choices, aboutLink);
    this.el.append(this.plate, text, skip, about);
    this.parts = { name, sub, setting, how, rows, q, choices, skip, about: aboutLink };
    this.el.addEventListener('click', () => this.skipToChoice());
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  show(atChoice = false): void {
    this.busy = false;
    this.el.style.display = '';
    const p = this.parts;
    this.tl?.kill();
    const reveal = [p.sub, p.name, p.setting, p.how, ...p.rows, p.q, p.choices, p.skip, p.about];
    gsap.set(reveal, { opacity: 0, y: 0, filter: 'none' });
    gsap.set(this.plate, { opacity: 1 });
    const tl = gsap.timeline();
    const up = (e: HTMLElement | HTMLElement[], at: number, d = 0.48): void => {
      tl.fromTo(e, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: d, ease: EASE_OUT, clearProps: 'filter' }, at);
    };
    up(p.name, 0.1);
    up(p.sub, 0.3, 0.36);
    tl.to(this.plate, { opacity: 0.72, duration: 0.9, ease: 'power1.inOut' }, 0.15);
    up(p.setting, 1.0);
    tl.fromTo(p.skip, { opacity: 0 }, { opacity: 0.7, duration: 0.36 }, 1.4);
    up(p.how, 2.4);
    tl.fromTo(p.rows, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.36, stagger: 0.16, ease: EASE_OUT }, 2.6);
    up(p.q, 4.6);
    up(p.choices, 4.9);
    tl.fromTo(p.about, { opacity: 0 }, { opacity: 1, duration: 0.36 }, 5.3);
    tl.to(p.skip, { opacity: 0, duration: 0.22 }, 5.4);
    this.tl = tl;
    if (atChoice) this.skipToChoice();
  }

  skipToChoice(): void {
    if (this.tl && this.tl.progress() < 1) {
      this.tl.progress(1);
      if (!TOUCH) this.buttons[0]?.focus({ preventScroll: true });
    }
  }

  private choose(id: ScenarioId): void {
    if (this.busy) return;
    this.busy = true;
    this.tl?.kill();
    const p = this.parts;
    const tl = gsap.timeline();
    tl.to([p.about, p.choices, p.q, p.how, p.setting, p.name, p.sub, p.skip], { opacity: 0, y: -6, filter: 'blur(4px)', duration: 0.22, ease: EASE_IN, stagger: 0.04 }, 0);
    tl.to(this.plate, { opacity: 1, duration: 0.45, ease: 'power1.inOut' }, 0.1);
    tl.call(() => this.onChoose(id), [], 0.6);
    this.tl = tl;
  }

  reveal(): gsap.core.Timeline {
    this.tl?.kill();
    const tl = gsap.timeline({ onComplete: () => this.hide() });
    tl.to(this.plate, { opacity: 0, duration: 0.9, ease: 'power1.inOut' });
    this.tl = tl;
    return tl;
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}

export interface EndStats {
  scenario: ScenarioId;
  held: number;
  showed: number;
}

export class EndCard {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private text: HTMLElement;
  private tl: gsap.core.Timeline | null = null;

  constructor(
    parent: HTMLElement,
    private onAgain: () => void,
    private onChoose: (id: ScenarioId) => void,
  ) {
    this.el = el('section', `${css.screen} ${css.end}`);
    this.el.style.cursor = 'default';
    this.plate = el('div', css.plate);
    this.text = el('div', css.text);
    this.el.append(this.plate, this.text);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  show(stats: EndStats): void {
    this.el.style.display = '';
    const name = el('h2', css.endName, SCENARIO_NAMES[stats.scenario]);
    const line = el('div', css.endLine, `Held ${stats.held} ${stats.held === 1 ? 'thing' : 'things'}, showed ${stats.showed}`);
    const actions = el('div', css.endActions);
    const again = el('button', css.primary, 'Walk again') as HTMLButtonElement;
    again.type = 'button';
    again.addEventListener('click', () => this.onAgain());
    actions.appendChild(again);
    for (const id of (['hungry', 'errands', 'walking'] as const).filter((x) => x !== stats.scenario)) {
      const b = el('button', undefined, SCENARIO_NAMES[id]) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => this.onChoose(id));
      actions.appendChild(b);
    }
    this.text.replaceChildren(name, line, actions);
    this.tl?.kill();
    const tl = gsap.timeline();
    gsap.set([name, line, actions], { opacity: 0 });
    tl.fromTo(this.plate, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.inOut' }, 0);
    tl.fromTo([name, line, actions], { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, ease: EASE_OUT, stagger: 0.12, clearProps: 'filter' }, 1.0);
    tl.call(() => again.focus({ preventScroll: true }), [], 1.5);
    this.tl = tl;
  }

  hide(): void {
    this.tl?.kill();
    this.el.style.display = 'none';
  }
}
