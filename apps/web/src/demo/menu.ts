import { gsap } from 'gsap';
import { DEMOS, type Demo } from '@lumen/shared';
import css from './menu.module.css';

export class DemoMenu {
  readonly panel: HTMLElement;
  private readonly el: HTMLElement;
  private tween: gsap.core.Tween | null = null;
  private returnFocus: HTMLElement | null = null;
  isOpen = false;

  constructor(parent: HTMLElement, pick: (d: Demo) => void) {
    this.el = document.createElement('div');
    this.el.className = css.menu!;
    this.panel = document.createElement('div');
    this.panel.className = css.panel!;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Demos');
    const title = document.createElement('div');
    title.className = css.title!;
    title.textContent = 'DEMOS';
    this.panel.append(title);
    for (const d of DEMOS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = css.row!;
      const name = document.createElement('span');
      name.className = css.name!;
      name.textContent = d.name;
      const length = document.createElement('span');
      length.className = css.length!;
      length.textContent = `${d.lengthS} s`;
      const line = document.createElement('span');
      line.className = css.line!;
      line.textContent = d.line;
      row.append(name, length, line);
      row.addEventListener('click', () => pick(d));
      this.panel.append(row);
    }
    const hint = document.createElement('div');
    hint.className = css.hint!;
    hint.textContent = '1 2 3 to play · Esc to close';
    this.panel.append(hint);
    this.el.append(this.panel);
    parent.append(this.el);
  }

  open(): void {
    this.isOpen = true;
    this.el.style.display = 'grid';
    this.tween?.kill();
    this.tween = gsap.fromTo(this.panel, { opacity: 0, y: -3 }, { opacity: 1, y: 0, duration: 0.36, ease: 'power3.out' });
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.querySelector('button')?.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.tween?.kill();
    this.tween = gsap.to(this.panel, { opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: () => (this.el.style.display = 'none') });
    if (this.panel.contains(document.activeElement)) this.returnFocus?.focus({ preventScroll: true });
  }

  // A demo starts at once: nothing of the menu rides into its first frame.
  closeNow(): void {
    this.isOpen = false;
    this.tween?.kill();
    this.el.style.display = 'none';
  }
}
