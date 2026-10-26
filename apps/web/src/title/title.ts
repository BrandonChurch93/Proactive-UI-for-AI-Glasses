import { gsap } from 'gsap';
import type { ScenarioId } from '@lumen/shared';
import css from './title.module.css';

export const SCENARIO_NAMES: Record<ScenarioId, string> = { hungry: 'Hungry', errands: 'Errands', walking: 'Just walking' };

export type Choice = ScenarioId | 'watch';

const CHOICES: { id: Choice; name: string; line: string }[] = [
  { id: 'hungry', name: 'Hungry', line: 'Find a place and get there.' },
  { id: 'errands', name: 'Errands', line: 'Three stops, one route.' },
  { id: 'walking', name: 'Just walking', line: 'See what it does when you want nothing.' },
  { id: 'watch', name: 'Watch', line: 'Sit back. Ninety seconds with captions.' },
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

export class TitleScreen {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private panel: HTMLElement;
  private reveals: HTMLElement[];
  private tl: gsap.core.Timeline | null = null;
  private buttons: HTMLButtonElement[] = [];
  private aboutLink: HTMLButtonElement;
  private busy = false;

  constructor(
    parent: HTMLElement,
    private onChoose: (id: Choice) => void,
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
    const chooseHead = el('div', css.label, 'Choose a walk');
    const choices = el('div', css.choices);
    for (const c of CHOICES) {
      const b = el('button', c.id === 'hungry' ? css.primary : undefined) as HTMLButtonElement;
      b.type = 'button';
      const top = el('div', css.choiceTop);
      top.append(el('b', undefined, c.name), el('em', undefined, '90 s'));
      b.append(top, el('span', undefined, c.line));
      b.dataset.choice = c.id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.choose(c.id);
      });
      this.buttons.push(b);
      choices.appendChild(b);
    }
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
    this.aboutLink.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipToChoice();
      about.style.display = '';
      gsap.fromTo(card, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.36, ease: EASE_OUT, clearProps: 'filter' });
      close.focus({ preventScroll: true });
    });
    const hideAbout = (e: Event): void => {
      e.stopPropagation();
      about.style.display = 'none';
      this.aboutLink.focus({ preventScroll: true });
    };
    close.addEventListener('click', hideAbout);
    about.addEventListener('click', (e) => {
      if (e.target === about) hideAbout(e);
      else e.stopPropagation();
    });
    about.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAbout(e);
    });
    this.panel.append(sub, name, lede, whatHead, what, chooseHead, choices, controls, footer);
    this.reveals = [sub, name, lede, whatHead, what, chooseHead, choices, controls, footer];
    this.el.append(this.plate, this.panel, about);
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
      if (!TOUCH) this.buttons[0]?.focus({ preventScroll: true });
    });
    this.tl = tl;
    if (atChoice) this.skipToChoice();
  }

  skipToChoice(): void {
    if (this.tl && this.tl.progress() < 1) this.tl.progress(1);
  }

  focus(id: Choice): void {
    this.buttons.find((b) => b.dataset.choice === id)?.focus({ preventScroll: true });
  }

  private choose(id: Choice): void {
    if (this.busy) return;
    this.busy = true;
    this.tl?.kill();
    const tl = gsap.timeline();
    tl.to(this.reveals, { opacity: 0, y: -6, filter: 'blur(4px)', duration: 0.22, ease: EASE_IN, stagger: 0.03 }, 0);
    tl.to(this.panel, { xPercent: -100, duration: 0.45, ease: EASE_IN }, 0.15);
    tl.to(this.plate, { opacity: 0, duration: 0.45, ease: 'power1.inOut' }, 0.15);
    tl.call(() => this.onChoose(id), [], 0.6);
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
  watched: boolean;
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
    private onPlay: () => void,
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
    if (stats.watched) {
      const play = el('button', css.primary, 'Play it yourself') as HTMLButtonElement;
      play.type = 'button';
      play.addEventListener('click', () => this.onPlay());
      actions.appendChild(play);
    }
    const again = el('button', stats.watched ? undefined : css.primary, 'Walk again') as HTMLButtonElement;
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
    tl.call(() => (actions.firstElementChild as HTMLButtonElement).focus({ preventScroll: true }), [], 1.5);
    this.tl = tl;
  }

  hide(): void {
    this.tl?.kill();
    this.el.style.display = 'none';
  }
}
